// Phase 20C — networkTopology@2 OPERATIONAL ENGINE (pure; compiled into the shared server build).
//
// Everything a student sees "happen" in the network is derived here, deterministically, from the teacher topology (config) and the
// academic configuration of every device — never from a clock, randomness or a real network:
//   • VTP: a client adopts the VLAN database of the best reachable server of the same domain / password / version over operational
//     trunks (bounded BFS); a switch forwards VLAN v only when v is in its EFFECTIVE database.
//   • Wireless: a host's association intent (SSID + passphrase) associates with the first enabled AP (by id) advertising that SSID,
//     WPA2 requiring the exact passphrase. The AP is a transparent L2 bridge (uplink ↔ associated clients ↔ its management address).
//   • DHCP: every DHCP client performs a real L2 flood (DISCOVER) through VLANs, trunks, allowed lists, native VLANs, Port Security and
//     the AP bridge; the first DHCP service it reaches (a router interface whose pool contains that interface's address, or a server)
//     replies over a real unicast leg. Allocation is deterministic (still-valid previous leases first, then the lowest free address
//     after exclusions, network / broadcast and every statically used address); no reply ⇒ deterministic APIPA from the MAC.
//   • Port Security: secure addresses = static MACs + the first (maximum − static) MACs actually seen on the port; any further MAC is a
//     violation with REAL consequences (shutdown ⇒ err-disabled port, restrict / protect ⇒ dropped frames).
//   • L3: same subnet ⇒ ARP; otherwise the default gateway must be a router interface that forwards to a directly connected network
//     (one router hop — no routing protocols or static routes in this curriculum scope); the reply leg must succeed too.
// The reconcile loop is bounded (≤ 6 rounds) and stops as soon as the operational state is stable.
import { SWITCH_PORTS } from "./networkCliEngine";
import { ROUTER_PORTS } from "./routerCliEngine";
import { broadcastAddress, fnv1a, intToIpv4, ipCompare, ipv4ToInt, isUsableHostAddress, networkAddress, prefixLength, sameSubnet } from "./net2Common";
import { effectiveSwitchIf, trunkAllows, type EffectiveSwitchIf, type Net2PortSecurity, type Net2SwitchState, type Switch2Context } from "./net2SwitchCli";
import { parentOf, router2IfUp, physicalAdminUp, routerAddresses, type Net2RouterState, type Router2Context } from "./net2RouterCli";
import { adapterNames, deriveMac, isHostKind, type Net2ApState, type Net2Config, type Net2Device, type Net2DeviceState, type Net2Endpoint, type Net2HostState } from "./net2Model";

// ── operational state ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Net2AdapterStatus = "static" | "dhcp" | "apipa" | "released" | "disconnected";
export type Net2AdapterOps = { status: Net2AdapterStatus; address?: string; mask?: string; gateway?: string; dns?: string; dhcpServer?: string };
export type Net2WifiOps = { status: "associated" | "disconnected" | "auth-failed" | "no-ssid"; ssid?: string; ap?: string };
export type Net2Binding = { address: string; mac: string; client: string; pool: string };
export type Net2VtpOps = { revision: number; source: string | null; vlans: number[] };
export type Net2PortSecOps = { seen: string[]; secure: string[]; violations: number; errDisabled: boolean };
export type Net2ArpEntry = { iface: string; ip: string; mac: string };
export type Net2MacEntry = { vlan: number; mac: string; port: string };
export type Net2Ops = {
  adapters: Record<string, Net2AdapterOps>; wifi: Record<string, Net2WifiOps>; dhcpBindings: Record<string, Net2Binding[]>; vtp: Record<string, Net2VtpOps>;
  portSecurity: Record<string, Net2PortSecOps>; arp: Record<string, Net2ArpEntry[]>; macTables: Record<string, Net2MacEntry[]>;
};
export type Net2State = { v: 2; devices: Record<string, Net2DeviceState>; ops: Net2Ops };
export const NET2_OPS_LIMITS = Object.freeze({ reconcileRounds: 6, portSecuritySeen: 16, arpEntries: 16, macEntriesPerSwitch: 64 });
export const emptyOps = (): Net2Ops => ({ adapters: {}, wifi: {}, dhcpBindings: {}, vtp: {}, portSecurity: {}, arp: {}, macTables: {} });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ── the network view (config + academic states + operational state) ────────────────────────────────────────────────────────────────
export type Net = {
  config: Net2Config; devices: Record<string, Net2DeviceState>; ops: Net2Ops; record: boolean;
  dev: Map<string, Net2Device>; peers: Map<string, Net2Endpoint>; vlanDb: Map<string, Set<number>>;
  /** Learn MAC addresses into the switch tables (student-generated traffic) — lease negotiation is not shown in the tables. */
  learn: boolean;
  /** Memoized effective switch-interface views (the academic states never change during one view's lifetime). */
  eff: Map<string, Map<string, EffectiveSwitchIf>>;
  /** The cabled ports of every device, in port order (the only ports a frame can leave through). */
  cabled: Map<string, { port: string; peer: Net2Endpoint }[]>;
  /** Memoized administrative link state (both ends up, err-disable excluded). */
  up: Map<string, Map<string, { peer: Net2Endpoint; up: boolean } | null>>;
  swPorts: Map<string, { port: string; e: EffectiveSwitchIf }[]>;
};
export type Ep = { dev: string; iface: string };
export type L3 = { ip: string; mask: string; gateway?: string };
const key = (dev: string, port: string) => dev + "|" + port;
const sameEp = (a: Ep, b: Ep) => a.dev === b.dev && a.iface === b.iface;
const sortedIds = (net: Net, kind?: string) => net.config.devices.filter(d => !kind || d.kind === kind).map(d => d.id).sort();

export function makeNet(config: Net2Config, devices: Record<string, Net2DeviceState>, ops: Net2Ops, record = false): Net {
  const dev = new Map(config.devices.map(d => [d.id, d] as const));
  const peers = new Map<string, Net2Endpoint>();
  for (const l of config.links) { peers.set(key(l.a.deviceId, l.a.port), l.b); peers.set(key(l.b.deviceId, l.b.port), l.a); }
  const cabled = new Map<string, { port: string; peer: Net2Endpoint }[]>();
  for (const d of config.devices) cabled.set(d.id, (d.kind === "switch" ? SWITCH_PORTS : d.kind === "router" ? ROUTER_PORTS : ["eth0"]).flatMap(p => { const peer = peers.get(key(d.id, p)); return peer ? [{ port: p, peer }] : []; }));
  const net: Net = { config, devices, ops, record, dev, peers, vlanDb: new Map(), learn: false, eff: new Map(), cabled, up: new Map(), swPorts: new Map() };
  refreshVlanDb(net);
  return net;
}
function refreshVlanDb(net: Net): void {
  net.vlanDb.clear();
  for (const id of sortedIds(net, "switch")) {
    const v = net.ops.vtp[id];
    net.vlanDb.set(id, new Set(v ? v.vlans : [1, ...Object.keys((net.devices[id] as Net2SwitchState).vlans).map(Number)]));
  }
}
const kindOf = (net: Net, id: string) => net.dev.get(id)?.kind;
/** A switch's cabled ports with their effective configuration (memoized per view; the hot path of every flood). */
function switchPorts(net: Net, sw: string): { port: string; e: EffectiveSwitchIf }[] {
  let list = net.swPorts.get(sw);
  if (!list) { list = (net.cabled.get(sw) ?? []).map(c => ({ port: c.port, e: effIf(net, sw, c.port) })); net.swPorts.set(sw, list); }
  return list;
}
/** The effective configuration of a switch interface (memoized per view). */
function effIf(net: Net, sw: string, name: string): EffectiveSwitchIf {
  let m = net.eff.get(sw);
  if (!m) { m = new Map(); net.eff.set(sw, m); }
  let e = m.get(name);
  if (!e) { e = effectiveSwitchIf(net.devices[sw] as Net2SwitchState, name); m.set(name, e); }
  return e;
}
const swState = (net: Net, id: string) => net.devices[id] as Net2SwitchState;
const rtState = (net: Net, id: string) => net.devices[id] as Net2RouterState;
const hostState = (net: Net, id: string) => net.devices[id] as Net2HostState;
const apState = (net: Net, id: string) => net.devices[id] as Net2ApState;

export const isErrDisabled = (net: Net, dev: string, port: string): boolean => net.ops.portSecurity[key(dev, port)]?.errDisabled === true;
/** Administrative state of one port end, ignoring err-disable (static for the lifetime of a view). */
function portAdminUp(net: Net, dev: string, port: string): boolean {
  switch (kindOf(net, dev)) {
    case "switch": return !effIf(net, dev, port).shutdown;
    case "router": return physicalAdminUp(rtState(net, dev), port);
    case undefined: return false;
    default: return true;
  }
}
/** Err-disable only exists on secure switch ports (operational; it can change while a recording view runs traffic). */
const secureErrDisabled = (net: Net, dev: string, port: string): boolean => kindOf(net, dev) === "switch" && effIf(net, dev, port).portSecurity?.enabled === true && isErrDisabled(net, dev, port);
/** A cabled port whose both ends are administratively up and not err-disabled. */
export function linkUp(net: Net, dev: string, port: string): boolean {
  let m = net.up.get(dev);
  if (!m) { m = new Map(); net.up.set(dev, m); }
  let base = m.get(port);
  if (base === undefined) { const p = net.peers.get(key(dev, port)); base = p ? { peer: p, up: portAdminUp(net, dev, port) && portAdminUp(net, p.deviceId, p.port) } : null; m.set(port, base); }
  return !!base && base.up && !secureErrDisabled(net, dev, port) && !secureErrDisabled(net, base.peer.deviceId, base.peer.port);
}
export const peerOf = (net: Net, dev: string, port: string): Net2Endpoint | undefined => net.peers.get(key(dev, port));

/** A host adapter has a carrier: a cable to an up port (Ethernet) or an association (wireless). A static configuration is kept either way. */
export const hostConnected = (net: Net, dev: string, iface: string): boolean => (iface === "wlan0" ? net.ops.wifi[dev]?.status === "associated" : linkUp(net, dev, "eth0"));
/** The L3 address of an endpoint, when it is operational. */
export function l3Of(net: Net, ep: Ep): L3 | undefined {
  switch (kindOf(net, ep.dev)) {
    case "router": {
      const st = rtState(net, ep.dev);
      if (!router2IfUp(st, ep.iface, p => linkUp(net, ep.dev, p))) return undefined;
      const c = ep.iface.includes(".") ? st.subinterfaces[ep.iface] : st.interfaces[ep.iface];
      return c?.ipAddress && c.subnetMask ? { ip: c.ipAddress, mask: c.subnetMask } : undefined;
    }
    case "switch": {
      const st = swState(net, ep.dev), m = /^vlan(\d+)$/.exec(ep.iface);
      if (!m || !net.vlanDb.get(ep.dev)?.has(Number(m[1]))) return undefined;
      const e = effIf(net, ep.dev, ep.iface);
      return !e.shutdown && e.ipAddress && e.subnetMask ? { ip: e.ipAddress, mask: e.subnetMask, ...(st.defaultGateway ? { gateway: st.defaultGateway } : {}) } : undefined;
    }
    case "ap": {
      const st = apState(net, ep.dev);
      return ep.iface === "mgmt" && st.address && st.mask && isUsableHostAddress(st.address, st.mask) ? { ip: st.address, mask: st.mask, ...(st.gateway ? { gateway: st.gateway } : {}) } : undefined;
    }
    case undefined: return undefined;
    default: {
      const o = net.ops.adapters[ep.dev + "/" + ep.iface];
      if (!o || !o.address || !o.mask || (o.status !== "static" && o.status !== "dhcp" && o.status !== "apipa") || !hostConnected(net, ep.dev, ep.iface)) return undefined;
      return { ip: o.address, mask: o.mask, ...(o.gateway ? { gateway: o.gateway } : {}) };
    }
  }
}
/** Every addressable endpoint of a device (operational or not). */
export function endpointsOf(net: Net, id: string): Ep[] {
  const d = net.dev.get(id);
  if (!d) return [];
  switch (d.kind) {
    case "router": return routerAddresses(rtState(net, id)).map(a => ({ dev: id, iface: a.name }));
    case "switch": return Object.keys(swState(net, id).interfaces).filter(n => /^vlan\d+$/.test(n)).concat(swState(net, id).interfaces.vlan1 ? [] : ["vlan1"]).sort().map(iface => ({ dev: id, iface }));
    case "ap": return [{ dev: id, iface: "mgmt" }];
    default: return adapterNames(d).map(iface => ({ dev: id, iface }));
  }
}
export const macOf = (ep: Ep): string => deriveMac(ep.dev, ep.iface === "mgmt" ? "eth0" : ep.iface);

// ── Port Security (derived from the ordered set of MACs actually seen) ─────────────────────────────────────────────────────────────
export function derivePortSecurity(cfg: Net2PortSecurity, seen: readonly string[]): Net2PortSecOps & { violators: string[]; free: number } {
  const statics = cfg.macs, dyn = seen.filter(m => !statics.includes(m));
  const slots = Math.max(0, cfg.maximum - statics.length);
  const secureDyn = dyn.slice(0, slots), violators = dyn.slice(slots);
  return { seen: [...seen], secure: [...statics, ...secureDyn], violations: cfg.violation === "protect" ? 0 : violators.length, errDisabled: cfg.violation === "shutdown" && violators.length > 0, violators, free: slots - secureDyn.length };
}
const psConfig = (net: Net, sw: string, port: string): Net2PortSecurity | undefined => {
  const e = effIf(net, sw, port);
  return e.portSecurity?.enabled && e.mode === "access" ? e.portSecurity : undefined;
};
/** May a frame from `mac` enter this secure port? Records the sighting (and its consequence) when the view records. */
function psAdmit(net: Net, sw: string, port: string, cfg: Net2PortSecurity, mac: string): boolean {
  const k = key(sw, port), cur = net.ops.portSecurity[k] ?? { seen: [], secure: [], violations: 0, errDisabled: false };
  const d = derivePortSecurity(cfg, cur.seen);
  if (d.secure.includes(mac)) return true;
  if (d.violators.includes(mac)) return false;
  if (!net.record) return d.free > 0;
  const seen = cur.seen.length < NET2_OPS_LIMITS.portSecuritySeen ? [...cur.seen, mac] : cur.seen;
  const n = derivePortSecurity(cfg, seen);
  net.ops.portSecurity[k] = { seen: n.seen, secure: n.secure, violations: n.violations, errDisabled: n.errDisabled };
  return d.free > 0;
}
/** Keeps Port Security records only for secure access ports; an administratively shut port forgets its violators (and, unless sticky, its learned addresses). */
function settlePortSecurity(net: Net): void {
  const out: Record<string, Net2PortSecOps> = {};
  for (const sw of sortedIds(net, "switch")) for (const port of SWITCH_PORTS) {
    const cfg = psConfig(net, sw, port);
    if (!cfg) continue;
    const k = key(sw, port);
    const prev = net.ops.portSecurity[k];
    let seen = prev?.seen ?? [];
    const shut = effIf(net, sw, port).shutdown;
    if (shut) { const d = derivePortSecurity(cfg, seen); seen = cfg.sticky ? d.secure.filter(m => !cfg.macs.includes(m)) : []; }
    const d = derivePortSecurity(cfg, seen);
    // err-disable is LATCHED (as in IOS): only shutdown / no shutdown recovers the port — a new violation mode or maximum does not
    out[k] = { seen: d.seen, secure: d.secure, violations: d.violations, errDisabled: d.errDisabled || (prev?.errDisabled === true && !shut) };
  }
  net.ops.portSecurity = out;
}

// ── L2 forwarding ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Learn = { sw: string; vlan: number; port: string };
type Arrival = { dev: string; port: string; tag: number | null; trail: Learn[] };
function learnMac(net: Net, l: Learn, mac: string): void {
  const table = (net.ops.macTables[l.sw] ??= []);
  const i = table.findIndex(e => e.vlan === l.vlan && e.mac === mac);
  if (i >= 0) table[i] = { vlan: l.vlan, mac, port: l.port };
  else if (table.length < NET2_OPS_LIMITS.macEntriesPerSwitch) table.push({ vlan: l.vlan, mac, port: l.port });
}
/**
 * Delivers a frame from `from` (source MAC `mac`) through the L2 topology and returns the first endpoint (BFS order) that `accept`s it.
 * Broadcasts flood the whole broadcast domain; a unicast stops at its destination and learns only along its path.
 */
export function l2Deliver(net: Net, from: Ep, mac: string, accept: (ep: Ep) => boolean, mode: "broadcast" | "unicast"): Ep | null {
  const queue: Arrival[] = [], visited = new Set<string>(), learned: Learn[] = [];
  let found: { ep: Ep; trail: Learn[] } | null = null;
  const offer = (ep: Ep, trail: Learn[]) => { if (!found && !sameEp(ep, from) && accept(ep)) found = { ep, trail }; };
  const cross = (dev: string, port: string, tag: number | null, trail: Learn[]) => { const p = peerOf(net, dev, port); if (p && linkUp(net, dev, port)) queue.push({ dev: p.deviceId, port: p.port, tag, trail }); };
  const bridge = (ap: string, fromHost: string | null, fromMgmt: boolean, trail: Learn[]) => {
    if (visited.has("ap|" + ap)) return;
    visited.add("ap|" + ap);
    if (!fromMgmt) offer({ dev: ap, iface: "mgmt" }, trail);
    for (const h of Object.keys(net.ops.wifi).sort()) { const w = net.ops.wifi[h]; if (w.status === "associated" && w.ap === ap && h !== fromHost) offer({ dev: h, iface: "wlan0" }, trail); }
    if (fromHost !== null || fromMgmt) cross(ap, "eth0", null, trail);
  };
  const inVlan = (sw: string, vlan: number, ingress: string | null, trail: Learn[]) => {
    if (visited.has(sw + "|" + vlan)) return;
    visited.add(sw + "|" + vlan);
    const t2 = ingress === null ? trail : [...trail, { sw, vlan, port: ingress }];
    if (ingress !== null) learned.push({ sw, vlan, port: ingress });
    if (swState(net, sw).interfaces["vlan" + vlan] || vlan === 1) offer({ dev: sw, iface: "vlan" + vlan }, t2);
    for (const { port: q, e } of switchPorts(net, sw)) {
      if (q === ingress || !linkUp(net, sw, q)) continue;
      if (e.mode === "trunk") { if (trunkAllows(e, vlan)) cross(sw, q, vlan === e.nativeVlan ? null : vlan, t2); }
      else if (e.accessVlan === vlan) cross(sw, q, null, t2);
    }
  };
  // injection at the sender
  const k = kindOf(net, from.dev);
  if (k === "router") {
    const st = rtState(net, from.dev), parent = parentOf(from.iface);
    if (!router2IfUp(st, from.iface, p => linkUp(net, from.dev, p))) return null;
    const sub = from.iface.includes(".") ? st.subinterfaces[from.iface] : undefined;
    cross(from.dev, parent, sub && !sub.native ? sub.vlan ?? null : null, []);
  } else if (k === "switch") {
    const m = /^vlan(\d+)$/.exec(from.iface);
    if (!m) return null;
    inVlan(from.dev, Number(m[1]), null, []);
  } else if (k === "ap") bridge(from.dev, null, true, []);
  else if (from.iface === "eth0") cross(from.dev, "eth0", null, []);
  else { const w = net.ops.wifi[from.dev]; if (w?.status === "associated" && w.ap) bridge(w.ap, from.dev, false, []); }
  while (queue.length && !(found && mode === "unicast")) {
    const a = queue.shift()!;
    const kind = kindOf(net, a.dev);
    if (kind === "switch") {
      const e = effIf(net, a.dev, a.port);
      let vlan: number;
      if (e.mode === "trunk") { vlan = a.tag ?? e.nativeVlan; if (!trunkAllows(e, vlan)) continue; }
      else {
        if (a.tag !== null) continue;
        vlan = e.accessVlan;
        const cfg = psConfig(net, a.dev, a.port);
        if (cfg && !psAdmit(net, a.dev, a.port, cfg, mac)) continue;
      }
      if (!net.vlanDb.get(a.dev)?.has(vlan)) continue;
      inVlan(a.dev, vlan, a.port, a.trail);
    } else if (kind === "router") {
      const st = rtState(net, a.dev);
      const subs = Object.keys(st.subinterfaces).filter(n => parentOf(n) === a.port && st.subinterfaces[n].vlan !== undefined && st.subinterfaces[n].shutdown !== true);
      if (a.tag === null) { const nat = subs.find(n => st.subinterfaces[n].native); offer({ dev: a.dev, iface: nat ?? a.port }, a.trail); }
      else { const s = subs.find(n => !st.subinterfaces[n].native && st.subinterfaces[n].vlan === a.tag); if (s) offer({ dev: a.dev, iface: s }, a.trail); }
    } else if (kind === "ap") { if (a.port === "eth0" && a.tag === null) bridge(a.dev, null, false, a.trail); }
    else if (kind && a.port === "eth0" && a.tag === null) offer({ dev: a.dev, iface: "eth0" }, a.trail);
  }
  const hit = found as { ep: Ep; trail: Learn[] } | null;
  if (net.record && net.learn) for (const l of mode === "broadcast" ? learned : hit ? hit.trail : []) learnMac(net, l, mac);
  return hit ? hit.ep : null;
}

// ── L3 delivery ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function arpLearn(net: Net, at: Ep, ip: string, mac: string): void {
  if (!net.record || !isHostKind(kindOf(net, at.dev))) return;
  const list = (net.ops.arp[at.dev] ??= []);
  const i = list.findIndex(e => e.ip === ip && e.iface === at.iface);
  if (i >= 0) list[i] = { iface: at.iface, ip, mac };
  else if (list.length < NET2_OPS_LIMITS.arpEntries) list.push({ iface: at.iface, ip, mac });
}
/** ARP: a broadcast for `ip` from `from`, answered by a unicast from its owner back to the requester. */
export function arpResolve(net: Net, from: Ep, ip: string): Ep | null {
  const src = l3Of(net, from);
  if (!src) return null;
  const owner = l2Deliver(net, from, macOf(from), ep => l3Of(net, ep)?.ip === ip, "broadcast");
  if (!owner) return null;
  if (!l2Deliver(net, owner, macOf(owner), ep => sameEp(ep, from), "unicast")) return null;
  arpLearn(net, from, ip, macOf(owner));
  arpLearn(net, owner, src.ip, macOf(from));
  return owner;
}
export type Leg = { ok: true; target: Ep; routers: string[]; gateway?: string } | { ok: false; reason: string; routers: string[]; gateway?: string };
function routerOwn(net: Net, router: string, ip: string): Ep | undefined {
  return endpointsOf(net, router).find(ep => l3Of(net, ep)?.ip === ip);
}
function routerEgress(net: Net, router: string, ip: string): Ep | undefined {
  let best: { ep: Ep; len: number } | undefined;
  for (const ep of endpointsOf(net, router)) {
    const a = l3Of(net, ep);
    if (!a || !sameSubnet(a.ip, ip, a.mask)) continue;
    const len = prefixLength(a.mask);
    if (!best || len > best.len) best = { ep, len };
  }
  return best?.ep;
}
/** One direction of an IPv4 exchange from `from` towards `dst` (ARP on the local subnet, or via the default gateway router). */
export function forwardLeg(net: Net, from: Ep, dst: string): Leg {
  const src = l3Of(net, from);
  if (!src) return { ok: false, reason: "SOURCE_NO_ADDRESS", routers: [] };
  if (src.ip === dst) return { ok: true, target: from, routers: [] };
  if (kindOf(net, from.dev) === "router") {
    const own = routerOwn(net, from.dev, dst);
    if (own) return { ok: true, target: own, routers: [] };
    const egress = routerEgress(net, from.dev, dst);
    if (!egress) return { ok: false, reason: "NO_ROUTE", routers: [] };
    const t = arpResolve(net, egress, dst);
    return t ? { ok: true, target: t, routers: [] } : { ok: false, reason: "DESTINATION_UNREACHABLE", routers: [] };
  }
  if (sameSubnet(src.ip, dst, src.mask)) {
    const t = arpResolve(net, from, dst);
    return t ? { ok: true, target: t, routers: [] } : { ok: false, reason: "DESTINATION_UNREACHABLE", routers: [] };
  }
  const gw = src.gateway;
  if (!gw) return { ok: false, reason: "NO_GATEWAY", routers: [] };
  if (!sameSubnet(gw, src.ip, src.mask)) return { ok: false, reason: "GATEWAY_UNREACHABLE", routers: [] };
  const g = arpResolve(net, from, gw);
  if (!g) return { ok: false, reason: "GATEWAY_UNREACHABLE", routers: [] };
  if (kindOf(net, g.dev) !== "router") return { ok: false, reason: "GATEWAY_NOT_ROUTER", routers: [] };
  const routers = [g.dev];
  const own = routerOwn(net, g.dev, dst);
  if (own) return { ok: true, target: own, routers, gateway: gw };
  const egress = routerEgress(net, g.dev, dst);
  if (!egress) return { ok: false, reason: "NO_ROUTE", routers, gateway: gw };
  const t = arpResolve(net, egress, dst);
  return t ? { ok: true, target: t, routers, gateway: gw } : { ok: false, reason: "DESTINATION_UNREACHABLE", routers, gateway: gw };
}
export type Probe = { ok: boolean; reason: string; target?: Ep; routers: string[]; replyRouters: string[]; gateway?: string; ttl?: number };
/** A two-way exchange (request + reply). The reply must reach exactly the requesting endpoint. */
export function probe(net: Net, from: Ep, dst: string): Probe {
  const f = forwardLeg(net, from, dst);
  if (!f.ok) return { ok: false, reason: f.reason, routers: f.routers, replyRouters: [], ...(f.gateway ? { gateway: f.gateway } : {}) };
  const src = l3Of(net, from)!;
  const back = sameEp(f.target, from) ? { ok: true as const, target: from, routers: [] as string[] } : forwardLeg(net, f.target, src.ip);
  const g = f.gateway ? { gateway: f.gateway } : {};
  if (!back.ok || !sameEp(back.target, from)) return { ok: false, reason: "REPLY_FAILED", target: f.target, routers: f.routers, replyRouters: [], ...g };
  const base = isHostKind(kindOf(net, f.target.dev)) ? 128 : 255;
  return { ok: true, reason: "REACHABLE", target: f.target, routers: f.routers, replyRouters: back.routers, ttl: base - back.routers.length, ...g };
}
/** The adapter a host uses towards `dst`: the one on dst's subnet, else the first with a gateway, else the first with an address. */
export function pickSource(net: Net, host: string, dst?: string): Ep | undefined {
  const eps = endpointsOf(net, host).filter(ep => l3Of(net, ep));
  if (dst) { const local = eps.find(ep => { const a = l3Of(net, ep)!; return sameSubnet(a.ip, dst, a.mask); }); if (local) return local; }
  return eps.find(ep => l3Of(net, ep)!.gateway) ?? eps[0];
}
/** Reachability between two devices (any operational source adapter to any operational destination address). Pure on a non-recording view. */
export function reachDevices(net: Net, a: string, b: string): { reachable: boolean; reason: string; path?: string[] } {
  const srcs = endpointsOf(net, a).filter(ep => l3Of(net, ep));
  if (!srcs.length) return { reachable: false, reason: "SOURCE_NO_ADDRESS" };
  const dsts = endpointsOf(net, b).map(ep => l3Of(net, ep)?.ip).filter((x): x is string => !!x);
  if (!dsts.length) return { reachable: false, reason: "DESTINATION_NO_ADDRESS" };
  let first: string | undefined;
  for (const s of srcs) for (const d of dsts) {
    const p = probe(net, s, d);
    if (p.ok && p.target?.dev === b) return { reachable: true, reason: "REACHABLE", path: [a, ...p.routers, b] };
    first ??= p.ok ? "WRONG_DESTINATION" : p.reason;
  }
  return { reachable: false, reason: first ?? "UNREACHABLE" };
}

// ── DNS and HTTP services of servers ───────────────────────────────────────────────────────────────────────────────────────────────
export type DnsResult = { ok: true; address: string; server: string } | { ok: false; reason: "NO_DNS_SERVER" | "DNS_UNREACHABLE" | "NXDOMAIN"; server?: string };
export function dnsLookup(net: Net, host: string, name: string): DnsResult {
  const ep = pickSource(net, host);
  const dns = ep ? net.ops.adapters[host + "/" + ep.iface]?.dns : undefined;
  if (!ep || !dns) return { ok: false, reason: "NO_DNS_SERVER" };
  const src = pickSource(net, host, dns)!;
  const p = probe(net, src, dns);
  const svc = p.ok && p.target && kindOf(net, p.target.dev) === "server" ? hostState(net, p.target.dev).services?.dns : undefined;
  if (!svc || !svc.enabled) return { ok: false, reason: "DNS_UNREACHABLE", server: dns };
  const rec = svc.records.find(r => r.name === name.toLowerCase());
  return rec ? { ok: true, address: rec.address, server: dns } : { ok: false, reason: "NXDOMAIN", server: dns };
}
export type HttpResult = { ok: true; title: string; body: string; address: string } | { ok: false; reason: "UNRESOLVED" | "TIMEOUT" | "NO_ADDRESS" };
export function httpGet(net: Net, host: string, target: string): HttpResult {
  let address = target;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(target)) { const r = dnsLookup(net, host, target); if (!r.ok) return { ok: false, reason: "UNRESOLVED" }; address = r.address; }
  const src = pickSource(net, host, address);
  if (!src) return { ok: false, reason: "NO_ADDRESS" };
  const p = probe(net, src, address);
  const svc = p.ok && p.target && kindOf(net, p.target.dev) === "server" ? hostState(net, p.target.dev).services?.http : undefined;
  return svc && svc.enabled ? { ok: true, title: svc.title, body: svc.body, address } : { ok: false, reason: "TIMEOUT" };
}

// ── VTP and wireless association ───────────────────────────────────────────────────────────────────────────────────────────────────
function trunkPeers(net: Net, sw: string): string[] {
  const out: string[] = [];
  for (const { port: p, peer } of net.cabled.get(sw) ?? []) {
    if (kindOf(net, peer.deviceId) !== "switch" || !linkUp(net, sw, p)) continue;
    if (effIf(net, sw, p).mode === "trunk" && effIf(net, peer.deviceId, peer.port).mode === "trunk") out.push(peer.deviceId);
  }
  return out;
}
const ownVlans = (st: Net2SwitchState) => [1, ...Object.keys(st.vlans).map(Number)].sort((a, b) => a - b);
export function computeVtp(net: Net): Record<string, Net2VtpOps> {
  const out: Record<string, Net2VtpOps> = {};
  for (const id of sortedIds(net, "switch")) {
    const st = swState(net, id), own: Net2VtpOps = { revision: st.vtp.revision, source: null, vlans: ownVlans(st) };
    if (st.vtp.mode !== "client" || !st.vtp.domain) { out[id] = own; continue; }
    const same = (o: Net2SwitchState) => o.vtp.domain === st.vtp.domain && o.vtp.password === st.vtp.password && o.vtp.version === st.vtp.version;
    const seen = new Set([id]), queue = [id];
    let best: string | undefined;
    while (queue.length) {
      const cur = queue.shift()!;
      for (const n of trunkPeers(net, cur)) {
        if (seen.has(n) || !same(swState(net, n))) continue;
        seen.add(n); queue.push(n);
        const o = swState(net, n);
        if (o.vtp.mode === "server" && (!best || o.vtp.revision > swState(net, best).vtp.revision || (o.vtp.revision === swState(net, best).vtp.revision && n < best))) best = n;
      }
    }
    if (best && swState(net, best).vtp.revision >= st.vtp.revision) out[id] = { revision: swState(net, best).vtp.revision, source: best, vlans: ownVlans(swState(net, best)) };
    else out[id] = own;
  }
  return out;
}
/** The effective VLAN database (with names) of a switch: its VTP source's database for a synchronized client, its own otherwise. */
export function effectiveVlanNames(net: Net, sw: string): Record<string, { name?: string }> {
  const src = net.ops.vtp[sw]?.source;
  return clone((src ? swState(net, src) : swState(net, sw)).vlans);
}
export function computeWifi(net: Net): Record<string, Net2WifiOps> {
  const out: Record<string, Net2WifiOps> = {};
  const aps = sortedIds(net, "ap");
  for (const id of net.config.devices.filter(d => adapterNames(d).includes("wlan0")).map(d => d.id).sort()) {
    const intent = hostState(net, id).wifi;
    if (!intent) { out[id] = { status: "disconnected" }; continue; }
    const ap = aps.find(a => apState(net, a).enabled && apState(net, a).ssid === intent.ssid);
    if (!ap) { out[id] = { status: "no-ssid", ssid: intent.ssid }; continue; }
    const st = apState(net, ap);
    out[id] = st.security === "wpa2" && (st.passphrase.length < 8 || intent.passphrase !== st.passphrase) ? { status: "auth-failed", ssid: intent.ssid } : { status: "associated", ssid: intent.ssid, ap };
  }
  return out;
}

// ── addressing: static, DHCP, APIPA ────────────────────────────────────────────────────────────────────────────────────────────────
type DhcpService = { server: Ep; serverIp: string; pool: string; first: number; last: number; mask: string; gateway?: string; dns?: string; excluded: [string, string][] };
function dhcpServiceAt(net: Net, ep: Ep): DhcpService | undefined {
  const a = l3Of(net, ep);
  if (!a) return undefined;
  const k = kindOf(net, ep.dev);
  if (k === "router") {
    const st = rtState(net, ep.dev);
    const pools = Object.entries(st.dhcp.pools).filter(([, p]) => p.network && p.mask && sameSubnet(a.ip, p.network, p.mask) && networkAddress(a.ip, p.mask) === p.network)
      .sort(([n1, p1], [n2, p2]) => prefixLength(p2.mask!) - prefixLength(p1.mask!) || (n1 < n2 ? -1 : n1 > n2 ? 1 : 0));
    if (!pools.length) return undefined;
    const [name, p] = pools[0];
    const net0 = ipv4ToInt(p.network!), bc = ipv4ToInt(broadcastAddress(p.network!, p.mask!));
    return { server: ep, serverIp: a.ip, pool: name, first: net0 + 1, last: bc - 1, mask: p.mask!, ...(p.defaultRouter ? { gateway: p.defaultRouter } : {}), ...(p.dns ? { dns: p.dns } : {}), excluded: st.dhcp.excluded };
  }
  if (k === "server") {
    const svc = hostState(net, ep.dev).services?.dhcp;
    if (!svc || !svc.enabled || net.ops.adapters[ep.dev + "/" + ep.iface]?.status !== "static" || !sameSubnet(svc.pool.start, a.ip, a.mask) || svc.pool.mask !== a.mask) return undefined;
    const start = ipv4ToInt(svc.pool.start), bc = ipv4ToInt(broadcastAddress(a.ip, a.mask));
    return { server: ep, serverIp: a.ip, pool: "serverPool", first: start, last: Math.min(start + svc.pool.max - 1, bc - 1), mask: svc.pool.mask, ...(svc.pool.defaultRouter ? { gateway: svc.pool.defaultRouter } : {}), ...(svc.pool.dns ? { dns: svc.pool.dns } : {}), excluded: [] };
  }
  return undefined;
}
/** Every address configured statically anywhere in the topology (never handed out by DHCP). */
function staticallyUsed(net: Net): Set<string> {
  const used = new Set<string>();
  for (const d of net.config.devices) {
    const st = net.devices[d.id];
    if (d.kind === "router") for (const a of routerAddresses(st as Net2RouterState)) used.add(a.ipAddress);
    else if (d.kind === "switch") for (const c of Object.values((st as Net2SwitchState).interfaces)) { if (c.ipAddress) used.add(c.ipAddress); }
    else if (d.kind === "ap") { if ((st as Net2ApState).address) used.add((st as Net2ApState).address!); }
    else for (const a of Object.values((st as Net2HostState).adapters)) if (a && a.mode === "static" && a.address) used.add(a.address);
  }
  return used;
}
function apipaFor(mac: string, taken: Set<string>): string {
  const h = fnv1a("apipa:" + mac);
  let n = ((1 + (h % 254)) << 8) | ((h >>> 8) & 255);
  for (let i = 0; i < 65024; i++) {
    const ip = "169.254." + (n >> 8) + "." + (n & 255);
    if (!taken.has(ip)) return ip;
    n = n + 1 > (254 << 8) + 255 ? 256 : n + 1;
  }
  return "169.254.1.0";
}
/**
 * The lowest address of a pool that is neither excluded nor taken. Excluded ranges are jumped over (never scanned address by address), so
 * the work is bounded by the number of exclusions + taken addresses, whatever the pool size (a /8 pool fully excluded costs a few steps).
 */
export function lowestFree(s: Pick<DhcpService, "first" | "last" | "excluded">, taken: (ip: string) => boolean): string | undefined {
  const ranges = s.excluded.map(([a, b]) => [ipv4ToInt(a), ipv4ToInt(b)] as const);
  let n = s.first;
  for (let guard = 0; n <= s.last && guard < 4096; guard++) {
    const r = ranges.find(([a, b]) => n >= a && n <= b);
    if (r) { n = r[1] + 1; continue; }
    const ip = intToIpv4(n);
    if (!taken(ip)) return ip;
    n++;
  }
  return undefined;
}
/** Re-derives every host adapter (static / DHCP lease / APIPA / released / disconnected) and every DHCP binding. */
function computeAdapters(net: Net): void {
  const prev = net.ops.adapters;
  const adapters: Record<string, Net2AdapterOps> = {};
  const clients: { id: string; iface: string; key: string }[] = [];
  const hosts = net.config.devices.filter(d => isHostKind(d.kind)).map(d => d.id).sort();
  for (const id of hosts) for (const iface of adapterNames(net.dev.get(id)!)) {
    const cfg = hostState(net, id).adapters[iface as "eth0" | "wlan0"] ?? { mode: "static" as const };
    const k = id + "/" + iface;
    if (cfg.mode === "static") {
      const o: Net2AdapterOps = { status: "static" };
      if (cfg.address && cfg.mask) { o.address = cfg.address; o.mask = cfg.mask; }
      if (cfg.gateway) o.gateway = cfg.gateway;
      if (cfg.dns) o.dns = cfg.dns;
      adapters[k] = o;
      continue;
    }
    if (!hostConnected(net, id, iface)) { adapters[k] = { status: "disconnected" }; continue; }
    if (cfg.released) { adapters[k] = { status: "released" }; continue; }
    adapters[k] = prev[k]?.status === "dhcp" || prev[k]?.status === "apipa" ? { ...prev[k] } : { status: "apipa" };
    clients.push({ id, iface, key: k });
  }
  net.ops.adapters = adapters;
  // DISCOVER / OFFER over the real L2 topology, in deterministic client order
  const services = new Map<string, DhcpService>();
  for (const c of clients) {
    const ep = { dev: c.id, iface: c.iface }, mac = macOf(ep);
    const hold: { svc?: DhcpService } = {};
    const server = l2Deliver(net, ep, mac, e => (hold.svc = dhcpServiceAt(net, e)) !== undefined, "broadcast");
    if (server && hold.svc && l2Deliver(net, server, macOf(server), e => sameEp(e, ep), "unicast")) services.set(c.key, hold.svc);
  }
  // allocation: still-valid previous leases first, then the lowest free address
  const used = staticallyUsed(net), leased = new Set<string>();
  const bindings: Record<string, Net2Binding[]> = {};
  const fits = (s: DhcpService, ip: string) => {
    const n = ipv4ToInt(ip);
    return n >= s.first && n <= s.last && !used.has(ip) && !leased.has(ip) && !s.excluded.some(([a, b]) => ipCompare(ip, a) >= 0 && ipCompare(ip, b) <= 0);
  };
  const lease = (c: { id: string; iface: string; key: string }, s: DhcpService, ip: string) => {
    leased.add(ip);
    const o: Net2AdapterOps = { status: "dhcp", address: ip, mask: s.mask };
    if (s.gateway) o.gateway = s.gateway;
    if (s.dns) o.dns = s.dns;
    o.dhcpServer = s.serverIp;
    adapters[c.key] = o;
    (bindings[s.server.dev] ??= []).push({ address: ip, mac: macOf({ dev: c.id, iface: c.iface }), client: c.key, pool: s.pool });
  };
  const pending: typeof clients = [];
  for (const c of clients) {
    const s = services.get(c.key), p = prev[c.key];
    if (s && p?.status === "dhcp" && p.address && p.dhcpServer === s.serverIp && p.mask === s.mask && fits(s, p.address)) lease(c, s, p.address);
    else pending.push(c);
  }
  const apipaTaken = new Set<string>();
  for (const c of pending) {
    const s = services.get(c.key);
    let ip: string | undefined;
    if (s) ip = lowestFree(s, a => used.has(a) || leased.has(a));
    if (s && ip) { lease(c, s, ip); continue; }
    const addr = apipaFor(macOf({ dev: c.id, iface: c.iface }), apipaTaken);
    apipaTaken.add(addr);
    adapters[c.key] = { status: "apipa", address: addr, mask: "255.255.0.0" };
  }
  for (const k of Object.keys(bindings)) bindings[k].sort((a, b) => ipCompare(a.address, b.address));
  net.ops.adapters = adapters;
  net.ops.dhcpBindings = bindings;
}

// ── reconcile ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function sortRecord<T>(r: Record<string, T>): Record<string, T> { const o: Record<string, T> = {}; for (const k of Object.keys(r).sort()) o[k] = r[k]; return o; }
export function canonicalOps(ops: Net2Ops): Net2Ops {
  const nonEmpty = <T>(r: Record<string, T[]>, cmp: (a: T, b: T) => number) => { const o: Record<string, T[]> = {}; for (const k of Object.keys(r).sort()) if (r[k].length) o[k] = [...r[k]].sort(cmp); return o; };
  return {
    adapters: sortRecord(ops.adapters), wifi: sortRecord(ops.wifi),
    dhcpBindings: nonEmpty(ops.dhcpBindings, (a, b) => ipCompare(a.address, b.address)), vtp: sortRecord(ops.vtp), portSecurity: sortRecord(ops.portSecurity),
    arp: nonEmpty(ops.arp, (a, b) => (a.iface < b.iface ? -1 : a.iface > b.iface ? 1 : ipCompare(a.ip, b.ip))),
    macTables: nonEmpty(ops.macTables, (a, b) => a.vlan - b.vlan || (a.mac < b.mac ? -1 : a.mac > b.mac ? 1 : 0))
  };
}
/** Drops learned facts the network can no longer hold: MAC entries on ports that are down, ARP entries off every current subnet. */
function settleLearned(net: Net): void {
  for (const sw of Object.keys(net.ops.macTables)) {
    if (kindOf(net, sw) !== "switch") { delete net.ops.macTables[sw]; continue; }
    net.ops.macTables[sw] = net.ops.macTables[sw].filter(e => linkUp(net, sw, e.port));
  }
  for (const h of Object.keys(net.ops.arp)) {
    if (!isHostKind(kindOf(net, h))) { delete net.ops.arp[h]; continue; }
    net.ops.arp[h] = net.ops.arp[h].filter(e => { const a = l3Of(net, { dev: h, iface: e.iface }); return !!a && sameSubnet(a.ip, e.ip, a.mask); });
  }
}
/**
 * Re-derives the operational state after an academic change (bounded: ≤ 6 rounds, stops when stable). Returns a NEW canonical
 * operational state; `prev` is never mutated.
 */
export function reconcile(config: Net2Config, devices: Record<string, Net2DeviceState>, prev: Net2Ops): Net2Ops {
  const net = makeNet(config, devices, clone(prev), true);
  net.ops.vtp = computeVtp(net);
  refreshVlanDb(net);
  net.ops.wifi = computeWifi(net);
  settlePortSecurity(net);
  for (let round = 0; round < NET2_OPS_LIMITS.reconcileRounds; round++) {
    const before = JSON.stringify([net.ops.adapters, net.ops.dhcpBindings, net.ops.portSecurity]);
    computeAdapters(net);
    settlePortSecurity(net);
    if (JSON.stringify([net.ops.adapters, net.ops.dhcpBindings, net.ops.portSecurity]) === before) break;
  }
  settleLearned(net);
  return canonicalOps(net.ops);
}
/** Runs student traffic (CMD / Browser) on a recording copy of the state; returns the result and the new operational state. */
export function withTraffic<T>(config: Net2Config, devices: Record<string, Net2DeviceState>, ops: Net2Ops, run: (net: Net) => T): { result: T; ops: Net2Ops } {
  const net = makeNet(config, devices, clone(ops), true);
  net.learn = true;
  const result = run(net);
  return { result, ops: net.ops };
}

// ── read-only CLI contexts ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export function switchContext(net: Net, sw: string): Switch2Context {
  const v = net.ops.vtp[sw];
  return {
    linkUp: p => linkUp(net, sw, p),
    errDisabled: p => isErrDisabled(net, sw, p),
    effectiveVlans: { vlans: effectiveVlanNames(net, sw), revision: v ? v.revision : swState(net, sw).vtp.revision, source: v ? v.source : null },
    macTable: (net.ops.macTables[sw] ?? []).map(e => ({ ...e })),
    portSecurity: p => {
      const cfg = psConfig(net, sw, p);
      if (!cfg) return undefined;
      const o = net.ops.portSecurity[key(sw, p)] ?? { seen: [], secure: [...cfg.macs], violations: 0, errDisabled: false };
      return { secure: o.secure.map(mac => ({ mac, type: cfg.macs.includes(mac) ? "static" as const : cfg.sticky ? "sticky" as const : "dynamic" as const })), violations: o.violations, errDisabled: o.errDisabled };
    }
  };
}
export function routerContext(net: Net, r: string): Router2Context {
  return { linkUp: p => linkUp(net, r, p), bindings: (net.ops.dhcpBindings[r] ?? []).map(b => ({ address: b.address, mac: b.mac, pool: b.pool })) };
}
export { ROUTER_PORTS };
