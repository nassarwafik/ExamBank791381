// N2 (docs/enterprise-network-lab-tool-design.md §7) — the network LAB's forwarding engine, client-only.
//
// It plugs into networkTopology@2's operational engine through its lab hooks (net2Network.ts `Net2LabHooks`): the lab attaches them to
// the configuration object it replays, so every frame, ARP exchange, DHCP flood, VLAN and Port Security rule stays the simulator's own,
// and only the lab's additions are decided here:
//   • the hub (repeats frames — in net2Network's flood loop) and the router's serial ports (point-to-point, HDLC by default or PPP — both
//     ends must agree for the line protocol to come up);
//   • the routing table: connected and local routes, static routes (`ip route` to a next hop or an exit interface, the default route), and
//     RIP, OSPF and EIGRP computed over the real adjacencies (routers whose interfaces share a subnet, are up, are enabled by `network`
//     statements of the same protocol — same AS for EIGRP, same area for OSPF — and reach each other at layer 2); administrative distances
//     0 / 1 / 90 / 110 / 120; RIP's 15-hop limit;
//   • a packet's journey over any number of routers: inbound ACL → NAT outside→inside → routing → NAT inside→outside → outbound ACL, at
//     every router, then ARP to the next hop through the simulator's own layer 2 — and the reply's journey back, which must reach the sender;
//   • standard (1–99) and extended (100–199) ACLs with the implicit deny; static NAT and PAT (overload on an interface);
//   • IPv6: router and host addresses, connected and static IPv6 routes, ping and tracert (neighbour discovery over the same layer 2).
// Pure and deterministic: no clock, no randomness, no network, nothing executed.
import { ROUTER_PORTS } from "../routerCliEngine";
import { displayRouter2Interface, parentOf, router2IfUp, routerAddresses, type Net2RouterState } from "../net2RouterCli";
import { ipv4ToInt, intToIpv4, isIpv4, networkAddress, prefixLength, sameSubnet } from "../net2Common";
import { isHostKind, type Net2Config, type Net2HostState } from "../net2Model";
import {
  arpResolve, endpointsOf, hostConnected, l2Deliver, l3Of, linkUp, macOf, makeNet, peerOf,
  type Ep, type L3, type Net, type Net2LabHooks, type Net2Proto, type Probe,
} from "../net2Network";
import { HUB_PORTS, SERIAL_PORTS, isSerialPort, parseIpv6, formatIpv6, v6SamePrefix, type LabAclEntry, type LabData, type LabMatch, type LabRouter } from "./netLabModel";

export type LabEngineConfig = Net2Config & { labHooks: Net2LabHooks; labData: LabData };
const dataOf = (net: Net): LabData => (net.config as LabEngineConfig).labData;
const kindOf = (net: Net, id: string): string | undefined => net.dev.get(id)?.kind;
const labRouter = (net: Net, id: string): LabRouter | undefined => dataOf(net).routers[id];
const sameEp = (a: Ep, b: Ep) => a.dev === b.dev && a.iface === b.iface;
const encap = (net: Net, dev: string, port: string) => labRouter(net, dev)?.serial[port]?.encap ?? "hdlc";
/** The canonical display name of any router interface of the lab (GigabitEthernet0/0, GigabitEthernet0/0.10, Serial0/0/0). */
export const labIfName = (n: string): string => (isSerialPort(n) ? "Serial" + n.slice(1) : displayRouter2Interface(n));

// ── the hooks networkTopology@2's engine calls ────────────────────────────────────────────────────────────────────────────────────
const hooks: Net2LabHooks = {
  ports: d => ((d.kind as string) === "hub" ? HUB_PORTS : d.kind === "router" ? [...ROUTER_PORTS, ...SERIAL_PORTS] : null),
  adminUp: (net, dev, port) => {
    const k = kindOf(net, dev);
    if (k === "hub") return true;
    if (k !== "router" || !isSerialPort(port)) return null;
    if (labRouter(net, dev)?.serial[port]?.up !== true) return false;
    const peer = peerOf(net, dev, port);
    return !peer || encap(net, dev, port) === encap(net, peer.deviceId, peer.port);   // HDLC ↔ PPP: the line protocol stays down
  },
  l3: (net, ep) => {
    if (!isSerialPort(ep.iface) || kindOf(net, ep.dev) !== "router") return null;
    const s = labRouter(net, ep.dev)?.serial[ep.iface];
    return s?.ip && s.mask && linkUp(net, ep.dev, ep.iface) ? { ip: s.ip, mask: s.mask } : undefined;
  },
  endpoints: (net, id) => SERIAL_PORTS.filter(p => labRouter(net, id)?.serial[p]?.ip).map(p => ({ dev: id, iface: p })),
  inject: (net, from) => (isSerialPort(from.iface) && kindOf(net, from.dev) === "router" ? (linkUp(net, from.dev, from.iface) ? from.iface : false) : null),
  probe: (net, from, dst, proto) => labProbe(net, from, dst, proto),
};
/** The configuration the lab replays with: the learner's topology, the lab state, and the hooks (never a validated exam configuration). */
export const labEngineConfig = (config: Net2Config, data: LabData): LabEngineConfig => ({ ...config, labHooks: hooks, labData: data });

// ── the routing table ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type LabRoute = { code: "C" | "L" | "S" | "R" | "O" | "D"; net: string; mask: string; ad: number; metric: number; via?: string; iface: string };
const AD = { C: 0, L: 0, S: 1, D: 90, O: 110, R: 120 } as const;
const classfulMask = (ip: string) => { const a = ipv4ToInt(ip) >>> 24; return a < 128 ? "255.0.0.0" : a < 192 ? "255.255.0.0" : "255.255.255.0"; };
const wildMatch = (ip: string, net: string, wild: string) => ((ipv4ToInt(ip) & ~ipv4ToInt(wild)) >>> 0) === ((ipv4ToInt(net) & ~ipv4ToInt(wild)) >>> 0);
const maskFromWild = (wild: string) => intToIpv4(~ipv4ToInt(wild) >>> 0);
const ifCost = (iface: string) => (isSerialPort(iface) ? 64 : 1);
type Proto = "rip" | "ospf" | "eigrp";
/** The interfaces of a router a protocol runs on (its `network` statements), with their OSPF area. */
function enabledIfaces(net: Net, r: string, p: Proto): { ep: Ep; l3: L3; area: number }[] {
  const lr = labRouter(net, r), out: { ep: Ep; l3: L3; area: number }[] = [];
  if (!lr || !lr[p]) return out;
  for (const ep of endpointsOf(net, r)) {
    const a = l3Of(net, ep);
    if (!a) continue;
    if (p === "rip" && lr.rip!.networks.some(n => networkAddress(n, classfulMask(n)) === networkAddress(a.ip, classfulMask(n)))) out.push({ ep, l3: a, area: 0 });
    if (p === "eigrp" && lr.eigrp!.networks.some(n => (n.wild ? wildMatch(a.ip, n.net, n.wild) : networkAddress(n.net, classfulMask(n.net)) === networkAddress(a.ip, classfulMask(n.net))))) out.push({ ep, l3: a, area: 0 });
    if (p === "ospf") { const s = lr.ospf!.networks.find(n => wildMatch(a.ip, n.net, n.wild)); if (s) out.push({ ep, l3: a, area: s.area }); }
  }
  return out;
}
export type LabAdjacency = { proto: Proto; a: Ep; b: Ep; aIp: string; bIp: string };
/** Every routing adjacency of the network (computed once per view, on a non-recording copy: discovering a neighbour learns nothing). */
const adjCache = new WeakMap<Net, LabAdjacency[]>();
export function labAdjacencies(net: Net): LabAdjacency[] {
  const hit = adjCache.get(net);
  if (hit) return hit;
  const quiet = makeNet(net.config, net.devices, net.ops);
  const routers = net.config.devices.filter(d => d.kind === "router").map(d => d.id).sort();
  const out: LabAdjacency[] = [];
  for (const p of ["rip", "ospf", "eigrp"] as const) {
    const ifs = routers.flatMap(r => enabledIfaces(quiet, r, p).map(x => ({ r, ...x })));
    for (let i = 0; i < ifs.length; i++) for (let j = i + 1; j < ifs.length; j++) {
      const x = ifs[i], y = ifs[j];
      if (x.r === y.r || !sameSubnet(x.l3.ip, y.l3.ip, x.l3.mask) || x.l3.mask !== y.l3.mask) continue;
      if (p === "eigrp" && labRouter(quiet, x.r)!.eigrp!.as !== labRouter(quiet, y.r)!.eigrp!.as) continue;
      if (p === "ospf" && x.area !== y.area) continue;
      if (!l2Deliver(quiet, x.ep, macOf(x.ep), ep => sameEp(ep, y.ep), "unicast")) continue;
      out.push({ proto: p, a: x.ep, b: y.ep, aIp: x.l3.ip, bIp: y.l3.ip });
    }
  }
  adjCache.set(net, out);
  return out;
}
function connectedRoutes(net: Net, r: string): LabRoute[] {
  const out: LabRoute[] = [];
  for (const ep of endpointsOf(net, r)) {
    const a = l3Of(net, ep);
    if (!a) continue;
    out.push({ code: "C", net: networkAddress(a.ip, a.mask), mask: a.mask, ad: 0, metric: 0, iface: ep.iface });
    out.push({ code: "L", net: a.ip, mask: "255.255.255.255", ad: 0, metric: 0, iface: ep.iface });
  }
  return out;
}
function staticRoutes(net: Net, r: string, connected: LabRoute[]): LabRoute[] {
  const out: LabRoute[] = [];
  for (const s of labRouter(net, r)?.routes ?? []) {
    if (isIpv4(s.via)) {
      const c = connected.find(x => x.code === "C" && sameSubnet(x.net, s.via, x.mask));
      if (c) out.push({ code: "S", net: s.net, mask: s.mask, ad: 1, metric: 0, via: s.via, iface: c.iface });
    } else if (connected.some(x => x.iface === s.via)) out.push({ code: "S", net: s.net, mask: s.mask, ad: 1, metric: 0, iface: s.via });
  }
  return out;
}
/** Dynamic routes of every router: a shortest-path computation per protocol over the adjacencies (cost: RIP hops; OSPF / EIGRP 1 per
 *  GigabitEthernet link, 64 per serial link). A router advertises the networks of the interfaces its protocol runs on (and the default
 *  route with `default-information originate` when it has one). */
const dynCache = new WeakMap<Net, Record<string, LabRoute[]>>();
function dynamicRoutes(net: Net): Record<string, LabRoute[]> {
  const hit = dynCache.get(net);
  if (hit) return hit;
  const adj = labAdjacencies(net), out: Record<string, LabRoute[]> = {};
  const routers = net.config.devices.filter(d => d.kind === "router").map(d => d.id).sort();
  for (const p of ["rip", "ospf", "eigrp"] as const) {
    const code = p === "rip" ? "R" : p === "ospf" ? "O" : "D";
    const ads = new Map<string, { net: string; mask: string; cost: number }[]>();
    for (const r of routers) {
      const list = enabledIfaces(net, r, p).map(x => ({ net: networkAddress(x.l3.ip, x.l3.mask), mask: x.l3.mask, cost: ifCost(x.ep.iface) }));
      const lr = labRouter(net, r);
      if ((p === "rip" ? lr?.rip?.originate : p === "ospf" ? lr?.ospf?.originate : false) && lr?.routes.some(s => s.net === "0.0.0.0" && s.mask === "0.0.0.0")) list.push({ net: "0.0.0.0", mask: "0.0.0.0", cost: 1 });
      ads.set(r, list);
    }
    const edges = adj.filter(e => e.proto === p);
    for (const r of routers) {
      if (!labRouter(net, r)?.[p]) continue;
      // Dijkstra from r; first hop = the neighbour's address and r's own interface
      const dist = new Map<string, { d: number; hops: number; via: string; iface: string }>([[r, { d: 0, hops: 0, via: "", iface: "" }]]);
      const done = new Set<string>();
      for (;;) {
        let u: string | undefined;
        for (const [k, v] of dist) if (!done.has(k) && (u === undefined || v.d < dist.get(u)!.d || (v.d === dist.get(u)!.d && k < u))) u = k;
        if (u === undefined) break;
        done.add(u);
        const du = dist.get(u)!;
        for (const e of edges) for (const [x, y, yIp] of [[e.a, e.b, e.bIp], [e.b, e.a, e.aIp]] as const) {
          if (x.dev !== u || done.has(y.dev)) continue;
          const cost = p === "rip" ? 1 : ifCost(x.iface), nd = du.d + cost;
          const cur = dist.get(y.dev);
          if (!cur || nd < cur.d) dist.set(y.dev, { d: nd, hops: du.hops + 1, via: u === r ? yIp : du.via, iface: u === r ? x.iface : du.iface });
        }
      }
      const own = connectedRoutes(net, r).filter(c => c.code === "C");
      const best = new Map<string, LabRoute>();
      for (const [s, v] of dist) {
        if (s === r) continue;
        for (const a of ads.get(s) ?? []) {
          if (own.some(c => c.net === a.net && c.mask === a.mask)) continue;
          const metric = p === "rip" ? v.hops : v.d + a.cost;
          if (p === "rip" && metric > 15) continue;
          const k = a.net + "/" + a.mask, cur = best.get(k);
          if (!cur || metric < cur.metric) best.set(k, { code, net: a.net, mask: a.mask, ad: AD[code], metric, via: v.via, iface: v.iface });
        }
      }
      (out[r] ??= []).push(...best.values());
    }
  }
  dynCache.set(net, out);
  return out;
}
/** The routing table of a router: per prefix the route of the lowest administrative distance (then metric). */
export function labRoutingTable(net: Net, r: string): LabRoute[] {
  const connected = connectedRoutes(net, r);
  const all = [...connected, ...staticRoutes(net, r, connected), ...(dynamicRoutes(net)[r] ?? [])];
  const best = new Map<string, LabRoute[]>();
  for (const x of all) {
    const k = x.net + "/" + x.mask, cur = best.get(k);
    if (!cur || x.ad < cur[0].ad || (x.ad === cur[0].ad && x.metric < cur[0].metric)) best.set(k, [x]);
    else if (x.ad === cur[0].ad && x.metric === cur[0].metric && !cur.some(c => c.via === x.via && c.iface === x.iface)) cur.push(x);
  }
  return [...best.values()].flat().sort((a, b) => ipv4ToInt(a.net) - ipv4ToInt(b.net) || prefixLength(a.mask) - prefixLength(b.mask) || a.code.localeCompare(b.code));
}
function lookup(net: Net, r: string, dst: string): LabRoute | undefined {
  let best: LabRoute | undefined;
  for (const x of labRoutingTable(net, r)) {
    if (!sameSubnet(x.net, dst, x.mask)) continue;
    const len = prefixLength(x.mask);
    if (!best || len > prefixLength(best.mask) || (len === prefixLength(best.mask) && x.ad < best.ad)) best = x;
  }
  return best;
}

// ── ACLs and NAT ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Pkt = { src: string; dst: string; proto: Net2Proto };
const matches = (m: LabMatch | undefined, ip: string) => !m || "any" in m || wildMatch(ip, m.ip, m.wild);
export function aclAllows(entries: readonly LabAclEntry[] | undefined, pkt: Pkt): boolean {
  if (!entries) return true;   // an ACL applied but not written yet filters nothing (as in IOS)
  for (const e of entries) {
    if (e.proto !== "ip" && e.proto !== pkt.proto.p) continue;
    if (!matches(e.src, pkt.src) || !matches(e.dst, pkt.dst)) continue;
    if (e.port !== undefined && e.port !== pkt.proto.port) continue;
    return e.action === "permit";
  }
  return false;   // the implicit "deny any"
}
const aclOn = (lr: LabRouter | undefined, iface: string, dir: "in" | "out") => { const n = lr?.ifAcl[iface]?.[dir]; return n === undefined ? undefined : lr!.acls[n] ?? undefined; };
/** PAT translations made by the current exchange (router → global address → inside local address). */
type NatMap = Map<string, Map<string, string>>;

// ── a packet's journey ────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Leg = { ok: true; target: Ep; routers: string[]; hops: string[]; pkt: Pkt; gateway?: string } | { ok: false; reason: string; routers: string[]; hops: string[]; gateway?: string };
const MAX_HOPS = 16;
function routerHop(net: Net, router: string, ingress: Ep | null, pkt: Pkt, nat: NatMap, routers: string[], hops: string[], gateway?: string): Leg {
  let at = router, inIf = ingress;
  const fail = (reason: string): Leg => ({ ok: false, reason, routers, hops, ...(gateway ? { gateway } : {}) });
  for (let n = 0; n < MAX_HOPS; n++) {
    const lr = labRouter(net, at);
    if (inIf) {
      if (!aclAllows(aclOn(lr, inIf.iface, "in"), pkt)) return fail("ACL_DENIED");
      if (lr?.nat.outside.includes(inIf.iface)) {
        const st = lr.nat.statics.find(s => s.global === pkt.dst), pat = nat.get(at)?.get(pkt.dst);
        if (st) pkt = { ...pkt, dst: st.local }; else if (pat) pkt = { ...pkt, dst: pat };
      }
    }
    const own = endpointsOf(net, at).find(ep => l3Of(net, ep)?.ip === pkt.dst);
    if (own) return { ok: true, target: own, routers, hops, pkt, ...(gateway ? { gateway } : {}) };
    const route = lookup(net, at, pkt.dst);
    if (!route) return fail("NO_ROUTE");
    const egress: Ep = { dev: at, iface: route.iface };
    if (lr && inIf && lr.nat.inside.includes(inIf.iface) && lr.nat.outside.includes(egress.iface)) {
      const st = lr.nat.statics.find(s => s.local === pkt.src);
      const out = l3Of(net, egress);
      if (st) pkt = { ...pkt, src: st.global };
      else if (lr.nat.overload && lr.nat.overload.iface === egress.iface && out && aclAllows(lr.acls[lr.nat.overload.acl], { ...pkt, dst: "0.0.0.0", proto: { p: "icmp" } })) {
        let m = nat.get(at); if (!m) { m = new Map(); nat.set(at, m); }
        m.set(out.ip, pkt.src);
        pkt = { ...pkt, src: out.ip };
      }
    }
    if (!aclAllows(aclOn(lr, egress.iface, "out"), pkt)) return fail("ACL_DENIED");
    if (route.code !== "C" && !route.via && isSerialPort(egress.iface)) {
      // a static route to an exit interface on a point-to-point serial link: the router across the link is the next hop
      const peer = peerOf(net, at, egress.iface);
      if (!peer || kindOf(net, peer.deviceId) !== "router" || !l3Of(net, { dev: peer.deviceId, iface: peer.port })) return fail("DESTINATION_UNREACHABLE");
      const t: Ep = { dev: peer.deviceId, iface: peer.port };
      routers.push(t.dev); hops.push(l3Of(net, t)!.ip);
      at = t.dev; inIf = t;
      continue;
    }
    const nextHop = route.code === "C" || !route.via ? pkt.dst : route.via;
    const t = arpResolve(net, egress, nextHop);
    if (!t) return fail("DESTINATION_UNREACHABLE");
    // the destination is a router's own address that its NAT translates (the PAT address of the reply): it goes on through that router
    const natHere = kindOf(net, t.dev) === "router" && !!labRouter(net, t.dev)?.nat.outside.includes(t.iface) && (nat.get(t.dev)?.has(pkt.dst) || labRouter(net, t.dev)!.nat.statics.some(x => x.global === pkt.dst));
    if (nextHop === pkt.dst && !natHere) return { ok: true, target: t, routers, hops, pkt, ...(gateway ? { gateway } : {}) };
    if (kindOf(net, t.dev) !== "router") return fail("NEXT_HOP_NOT_ROUTER");
    routers.push(t.dev); hops.push(l3Of(net, t)!.ip);
    at = t.dev; inIf = t;
  }
  return fail("TTL_EXPIRED");
}
function leg(net: Net, from: Ep, pkt: Pkt, nat: NatMap): Leg {
  const src = l3Of(net, from);
  if (!src) return { ok: false, reason: "SOURCE_NO_ADDRESS", routers: [], hops: [] };
  if (src.ip === pkt.dst) return { ok: true, target: from, routers: [], hops: [], pkt };
  if (kindOf(net, from.dev) === "router") return routerHop(net, from.dev, null, pkt, nat, [], []);
  if (sameSubnet(src.ip, pkt.dst, src.mask)) {
    const t = arpResolve(net, from, pkt.dst);
    return t ? { ok: true, target: t, routers: [], hops: [], pkt } : { ok: false, reason: "DESTINATION_UNREACHABLE", routers: [], hops: [] };
  }
  const gw = src.gateway;
  if (!gw) return { ok: false, reason: "NO_GATEWAY", routers: [], hops: [] };
  if (!sameSubnet(gw, src.ip, src.mask)) return { ok: false, reason: "GATEWAY_UNREACHABLE", routers: [], hops: [] };
  const g = arpResolve(net, from, gw);
  if (!g) return { ok: false, reason: "GATEWAY_UNREACHABLE", routers: [], hops: [] };
  if (kindOf(net, g.dev) !== "router") return { ok: false, reason: "GATEWAY_NOT_ROUTER", routers: [], hops: [], gateway: gw };
  return routerHop(net, g.dev, g, pkt, nat, [g.dev], [gw], gw);
}
/** The lab's two-way exchange: the request travels to `dst`, the reply travels back to the source as the destination saw it (after NAT),
 *  and must reach exactly the requesting endpoint. */
export function labProbe(net: Net, from: Ep, dst: string, proto: Net2Proto): Probe {
  const nat: NatMap = new Map();
  const src = l3Of(net, from);
  if (net.trace) net.trace.phase = "request";
  const f = leg(net, from, { src: src?.ip ?? "", dst, proto }, nat);
  const g = f.gateway ? { gateway: f.gateway } : {};
  if (!f.ok) return { ok: false, reason: f.reason, routers: f.routers, replyRouters: [], hops: f.hops, ...g };
  if (net.trace) net.trace.phase = "reply";
  const back = sameEp(f.target, from) ? { ok: true as const, target: from, routers: [] as string[], hops: [] as string[], pkt: f.pkt } : leg(net, f.target, { src: f.pkt.dst, dst: f.pkt.src, proto: { p: proto.p } }, nat);
  if (!back.ok || !sameEp(back.target, from)) return { ok: false, reason: "REPLY_FAILED", target: f.target, routers: f.routers, replyRouters: [], hops: f.hops, ...g };
  const base = isHostKind(kindOf(net, f.target.dev) as never) ? 128 : 255;
  return { ok: true, reason: "REACHABLE", target: f.target, routers: f.routers, replyRouters: back.routers, ttl: base - back.routers.length, hops: f.hops, ...g };
}

// ── IPv6 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type V6 = { addr: bigint; len: number; gw?: bigint };
/** The IPv6 address of an endpoint when it is up (a host adapter with a carrier, an up router interface). */
export function v6Of(net: Net, ep: Ep): V6 | undefined {
  const k = kindOf(net, ep.dev), data = dataOf(net);
  if (k === "router") {
    const c = data.routers[ep.dev]?.v6.ifs[ep.iface];
    if (!c) return undefined;
    const up = isSerialPort(ep.iface) ? linkUp(net, ep.dev, ep.iface) : router2IfUp(net.devices[ep.dev] as Net2RouterState, ep.iface, p => linkUp(net, ep.dev, p));
    return up ? { addr: parseIpv6(c.addr)!, len: c.len } : undefined;
  }
  if (isHostKind(k as never)) {
    const h = data.hosts6[ep.dev];
    if (!h || h.iface !== ep.iface || !hostConnected(net, ep.dev, ep.iface)) return undefined;
    return { addr: parseIpv6(h.addr)!, len: h.len, ...(h.gw ? { gw: parseIpv6(h.gw)! } : {}) };
  }
  return undefined;
}
function v6Endpoints(net: Net, id: string): Ep[] {
  if (kindOf(net, id) === "router") return Object.keys(dataOf(net).routers[id]?.v6.ifs ?? {}).sort().map(iface => ({ dev: id, iface }));
  const h = dataOf(net).hosts6[id];
  return h ? [{ dev: id, iface: h.iface }] : [];
}
/** Neighbour discovery: a multicast solicitation for `addr` from `from`, answered by its owner (the simulator's own layer 2). */
const ndResolve = (net: Net, from: Ep, addr: bigint): Ep | null => (v6Of(net, from) ? l2Deliver(net, from, macOf(from), ep => v6Of(net, ep)?.addr === addr, "broadcast") : null);
type Leg6 = { ok: true; target: Ep; hops: string[] } | { ok: false; reason: string; hops: string[] };
function leg6(net: Net, from: Ep, dst: bigint): Leg6 {
  const src = v6Of(net, from);
  if (!src) return { ok: false, reason: "SOURCE_NO_ADDRESS", hops: [] };
  if (src.addr === dst) return { ok: true, target: from, hops: [] };
  let at: string, hops: string[] = [];
  if (kindOf(net, from.dev) === "router") at = from.dev;
  else {
    if (v6SamePrefix(src.addr, dst, src.len)) { const t = ndResolve(net, from, dst); return t ? { ok: true, target: t, hops } : { ok: false, reason: "UNREACHABLE", hops }; }
    if (src.gw === undefined) return { ok: false, reason: "NO_GATEWAY", hops };
    const g = ndResolve(net, from, src.gw);
    if (!g || kindOf(net, g.dev) !== "router") return { ok: false, reason: "GATEWAY_UNREACHABLE", hops };
    at = g.dev; hops = [formatIpv6(src.gw)];
  }
  for (let n = 0; n < MAX_HOPS; n++) {
    const own = v6Endpoints(net, at).find(ep => v6Of(net, ep)?.addr === dst);
    if (own) return { ok: true, target: own, hops };
    const lr = dataOf(net).routers[at];
    if (!lr?.v6.routing) return { ok: false, reason: "NOT_ROUTING", hops };   // without `ipv6 unicast-routing` a router forwards no IPv6
    let best: { ep: Ep; len: number; via?: bigint } | undefined;
    for (const ep of v6Endpoints(net, at)) { const a = v6Of(net, ep); if (a && v6SamePrefix(a.addr, dst, a.len) && (!best || a.len > best.len)) best = { ep, len: a.len }; }
    for (const r of lr?.v6.routes ?? []) {
      const p = parseIpv6(r.prefix)!;
      if (!v6SamePrefix(p, dst, r.len) || (best && best.len >= r.len)) continue;
      const via = parseIpv6(r.via);
      if (via === null) continue;
      const out = v6Endpoints(net, at).find(ep => { const a = v6Of(net, ep); return !!a && v6SamePrefix(a.addr, via, a.len); });
      if (out) best = { ep: out, len: r.len, via };
    }
    if (!best) return { ok: false, reason: "NO_ROUTE", hops };
    const next = best.via ?? dst;
    const t = ndResolve(net, best.ep, next);
    if (!t) return { ok: false, reason: "UNREACHABLE", hops };
    if (next === dst) return { ok: true, target: t, hops };
    if (kindOf(net, t.dev) !== "router") return { ok: false, reason: "NEXT_HOP_NOT_ROUTER", hops };
    hops.push(formatIpv6(next)); at = t.dev;
  }
  return { ok: false, reason: "TTL_EXPIRED", hops: [] };
}
/** An IPv6 ping: the request reaches the owner of `dst`, and its reply must come back to the sender. */
export function labProbe6(net: Net, host: string, dst: bigint): { ok: boolean; hops: string[]; reason: string } {
  const from = v6Endpoints(net, host)[0];
  if (!from || !v6Of(net, from)) return { ok: false, hops: [], reason: "SOURCE_NO_ADDRESS" };
  const f = leg6(net, from, dst);
  if (!f.ok) return { ok: false, hops: f.hops, reason: f.reason };
  const back = sameEp(f.target, from) ? { ok: true } : leg6(net, f.target, v6Of(net, from)!.addr);
  return back.ok && (!("target" in back) || sameEp(back.target as Ep, from)) ? { ok: true, hops: f.hops, reason: "REACHABLE" } : { ok: false, hops: f.hops, reason: "REPLY_FAILED" };
}

// ── helpers the CLI's show commands use ───────────────────────────────────────────────────────────────────────────────────────────
export const labIfUp = (net: Net, r: string, iface: string): boolean =>
  isSerialPort(iface) ? linkUp(net, r, iface) : router2IfUp(net.devices[r] as Net2RouterState, iface, p => linkUp(net, r, p));
export const labIfAdmin = (net: Net, r: string, iface: string): boolean =>
  isSerialPort(iface) ? labRouter(net, r)?.serial[iface]?.up === true : (net.devices[r] as Net2RouterState).interfaces[parentOf(iface)]?.shutdown === false;
export const routerIfNames = (st: Net2RouterState): string[] => [...ROUTER_PORTS, ...Object.keys(st.subinterfaces)];
export const routerV4Addresses = (st: Net2RouterState, lr: LabRouter | undefined): { name: string; ipAddress: string; subnetMask: string }[] =>
  [...routerAddresses(st), ...SERIAL_PORTS.flatMap(p => { const s = lr?.serial[p]; return s?.ip && s.mask ? [{ name: p, ipAddress: s.ip, subnetMask: s.mask }] : []; })];
export const maskOfWild = maskFromWild;
export type { Net2HostState };
