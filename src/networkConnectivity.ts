// Phase 20B — the pure, deterministic CONNECTIVITY engine of networkTopology@1 (compiled into the shared server build).
//
// Reachability is DERIVED from the topology and the current canonical device configuration only — this module receives nothing else
// and never compares anything with expected values. The same function powers the student's simulated ping (feedback) and the
// server's reachability checks (grading).
//
// v1 rules (documented):
//   • physical layer — a link is operational when it exists and both ends are administratively up (a PC NIC is always up; a switch
//     port follows its `shutdown`; a router interface is down until `no shutdown`);
//   • layer 2 — an untagged frame is flooded from the sender: a switch access port (or a port with no mode, VLAN 1 by default) carries
//     its access VLAN, a trunk carries every VLAN (untagged = its native VLAN, others 802.1Q-tagged); a tagged frame never enters an
//     access port, a PC or a router; flooding is bounded by visiting each (switch, VLAN) once;
//   • layer 3 — same subnet ⇒ direct delivery on the segment; otherwise the PC's default gateway must be in its own subnet and be an
//     operational router interface on that segment; the router forwards only to its directly-connected networks (interfaces whose
//     line protocol is up); a router answers for any of its own operational interface addresses;
//   • a ping needs BOTH legs: the reply is computed with the same rules from the destination back to the source.
// Results carry a bounded reason code, the leg that failed and the device path. Later phases (static routes, trunks between routers,
// sub-interfaces, DHCP / ACL / NAT, dynamic routing) extend these rules additively.
import { SWITCH_PORTS, effectiveInterfaceConfig, isIpv4, isSubnetMask, isUsableHostAddress } from "./networkCliEngine";
import { ROUTER_PORTS, effectiveRouterInterface, ipv4ToInt, routerConnectedNetworks, type RouterExecContext } from "./routerCliEngine";
import { linkAt, topologyDevice, type NetworkTopologyConfigV1, type NetworkTopologyStateV1, type TopologyLink } from "./networkTopologyModel";

export type ReachabilityReason =
  | "REACHABLE" | "DEVICE_UNKNOWN" | "SAME_DEVICE" | "SOURCE_NOT_PC" | "SOURCE_NOT_CONFIGURED" | "SOURCE_ADDRESS_INVALID" | "DESTINATION_UNSUPPORTED"
  | "DESTINATION_NOT_CONFIGURED" | "DESTINATION_INVALID" | "SOURCE_NOT_CONNECTED" | "SOURCE_LINK_DOWN" | "NO_DEFAULT_GATEWAY" | "GATEWAY_NOT_IN_LOCAL_SUBNET"
  | "GATEWAY_UNREACHABLE" | "NO_ROUTE_TO_DESTINATION" | "DESTINATION_UNREACHABLE" | "ADDRESS_CONFLICT";
export const REACHABILITY_REASONS: readonly ReachabilityReason[] = Object.freeze(["REACHABLE", "DEVICE_UNKNOWN", "SAME_DEVICE", "SOURCE_NOT_PC", "SOURCE_NOT_CONFIGURED", "SOURCE_ADDRESS_INVALID", "DESTINATION_UNSUPPORTED", "DESTINATION_NOT_CONFIGURED", "DESTINATION_INVALID", "SOURCE_NOT_CONNECTED", "SOURCE_LINK_DOWN", "NO_DEFAULT_GATEWAY", "GATEWAY_NOT_IN_LOCAL_SUBNET", "GATEWAY_UNREACHABLE", "NO_ROUTE_TO_DESTINATION", "DESTINATION_UNREACHABLE", "ADDRESS_CONFLICT"]);
export type ReachabilityResult = { reachable: true; reason: "REACHABLE"; path: string[] } | { reachable: false; reason: Exclude<ReachabilityReason, "REACHABLE">; leg?: "forward" | "return"; path?: string[] };

type Cfg = NetworkTopologyConfigV1;
type St = NetworkTopologyStateV1;
type Endpoint = { device: string; port: string };

// ── physical layer ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
function adminUp(cfg: Cfg, st: St, device: string, port: string): boolean {
  const d = topologyDevice(cfg, device);
  if (!d) return false;
  if (d.kind === "pc") return true;
  if (d.kind === "switch") { const s = st.switches[device]; return !!s && !effectiveInterfaceConfig(s, port).shutdown; }
  const r = st.routers[device];
  return !!r && !effectiveRouterInterface(r, port).shutdown;
}
export const linkOperational = (cfg: Cfg, st: St, link: TopologyLink): boolean => adminUp(cfg, st, link.a.deviceId, link.a.port) && adminUp(cfg, st, link.b.deviceId, link.b.port);
// The physical context of a router (for its `show` output and its connected routes): a port is up when its link is operational.
export function routerLinkContext(cfg: Cfg, st: St, routerId: string): RouterExecContext {
  return { linkUp: port => { const l = linkAt(cfg, routerId, port); return !!l && linkOperational(cfg, st, l.link); } };
}

// ── layer 2: flood an untagged frame from an endpoint port ─────────────────────────────────────────────────────────────────────────
type Segment = { status: "ok" | "NOT_CONNECTED" | "LINK_DOWN"; endpoints: Endpoint[]; parents: Map<string, string>; start: string };
function segmentFrom(cfg: Cfg, st: St, device: string, port: string): Segment {
  const parents = new Map<string, string>();
  const endpoints: Endpoint[] = [];
  const first = linkAt(cfg, device, port);
  if (!first) return { status: "NOT_CONNECTED", endpoints, parents, start: device };
  if (!linkOperational(cfg, st, first.link)) return { status: "LINK_DOWN", endpoints, parents, start: device };
  const visited = new Set<string>();
  const queue: { device: string; port: string; tag: number | null; from: string }[] = [{ device: first.peer.deviceId, port: first.peer.port, tag: null, from: device }];
  while (queue.length) {
    const hop = queue.shift()!;
    if (hop.device !== device && !parents.has(hop.device)) parents.set(hop.device, hop.from);
    const d = topologyDevice(cfg, hop.device);
    if (!d) continue;
    if (d.kind !== "switch") { if (hop.tag === null && !(hop.device === device && hop.port === port)) endpoints.push({ device: hop.device, port: hop.port }); continue; }
    const sw = st.switches[hop.device];
    if (!sw) continue;
    const ingress = effectiveInterfaceConfig(sw, hop.port);
    let vlan: number;
    if (ingress.mode === "trunk") vlan = hop.tag ?? ingress.nativeVlan;
    else { if (hop.tag !== null) continue; vlan = ingress.accessVlan; }
    const key = hop.device + "|" + vlan;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const p of SWITCH_PORTS) {
      if (p === hop.port) continue;
      const l = linkAt(cfg, hop.device, p);
      if (!l || !linkOperational(cfg, st, l.link)) continue;
      const egress = effectiveInterfaceConfig(sw, p);
      let tag: number | null;
      if (egress.mode === "trunk") tag = vlan === egress.nativeVlan ? null : vlan;
      else { if (egress.accessVlan !== vlan) continue; tag = null; }
      queue.push({ device: l.peer.deviceId, port: l.peer.port, tag, from: hop.device });
    }
  }
  return { status: "ok", endpoints, parents, start: device };
}
function pathTo(seg: Segment, device: string): string[] {
  const out = [device];
  let cur = device;
  for (let i = 0; i < 64 && cur !== seg.start; i++) { const p = seg.parents.get(cur); if (p === undefined) break; out.push(p); cur = p; }
  return out.reverse();
}

// ── layer 3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Host = { address: string; mask: string; gateway?: string };
const sameSubnet = (a: string, b: string, mask: string): boolean => ((ipv4ToInt(a) & ipv4ToInt(mask)) >>> 0) === ((ipv4ToInt(b) & ipv4ToInt(mask)) >>> 0);
// A PC's usable IPv4 configuration, or why it is not usable.
function pcHost(st: St, id: string): Host | "NOT_CONFIGURED" | "ADDRESS_INVALID" {
  const c = st.pcs[id];
  if (!c || typeof c.address !== "string" || typeof c.mask !== "string" || !isIpv4(c.address) || !isSubnetMask(c.mask)) return "NOT_CONFIGURED";
  if (!isUsableHostAddress(c.address, c.mask)) return "ADDRESS_INVALID";
  return typeof c.gateway === "string" && c.gateway !== "" ? { address: c.address, mask: c.mask, gateway: c.gateway } : { address: c.address, mask: c.mask };
}
// The endpoints of a segment that respond to an address: configured PCs and operational router interfaces.
function holders(cfg: Cfg, st: St, seg: Segment, ip: string): Endpoint[] {
  return seg.endpoints.filter(e => {
    const d = topologyDevice(cfg, e.device);
    if (!d) return false;
    if (d.kind === "pc") { const h = pcHost(st, e.device); return typeof h === "object" && h.address === ip; }
    if (d.kind === "router") { const r = st.routers[e.device]; return !!r && effectiveRouterInterface(r, e.port).ipAddress === ip; }
    return false;
  });
}
type Delivery = { ok: true; reached: string; path: string[] } | { ok: false; reason: Exclude<ReachabilityReason, "REACHABLE">; path: string[] };
function routerDeliver(cfg: Cfg, st: St, routerId: string, ip: string, pathSoFar: string[]): Delivery {
  const r = st.routers[routerId];
  if (!r) return { ok: false, reason: "NO_ROUTE_TO_DESTINATION", path: pathSoFar };
  const nets = routerConnectedNetworks(r, routerLinkContext(cfg, st, routerId));
  if (nets.some(n => n.ipAddress === ip)) return { ok: true, reached: routerId, path: pathSoFar };
  const route = nets.filter(n => sameSubnet(ip, n.ipAddress, n.subnetMask)).sort((a, b) => b.prefix - a.prefix || ROUTER_PORTS.indexOf(a.port) - ROUTER_PORTS.indexOf(b.port))[0];
  if (!route) return { ok: false, reason: "NO_ROUTE_TO_DESTINATION", path: pathSoFar };
  const seg = segmentFrom(cfg, st, routerId, route.port);
  const found = holders(cfg, st, seg, ip);
  if (found.length === 0) return { ok: false, reason: "DESTINATION_UNREACHABLE", path: pathSoFar };
  if (found.length > 1) return { ok: false, reason: "ADDRESS_CONFLICT", path: pathSoFar };
  return { ok: true, reached: found[0].device, path: [...pathSoFar, ...pathTo(seg, found[0].device).slice(1)] };
}
function hostDeliver(cfg: Cfg, st: St, srcId: string, host: Host, ip: string): Delivery {
  const seg = segmentFrom(cfg, st, srcId, "eth0");
  if (seg.status === "NOT_CONNECTED") return { ok: false, reason: "SOURCE_NOT_CONNECTED", path: [srcId] };
  if (seg.status === "LINK_DOWN") return { ok: false, reason: "SOURCE_LINK_DOWN", path: [srcId] };
  if (sameSubnet(ip, host.address, host.mask)) {
    const found = holders(cfg, st, seg, ip);
    if (found.length === 0) return { ok: false, reason: "DESTINATION_UNREACHABLE", path: [srcId] };
    if (found.length > 1) return { ok: false, reason: "ADDRESS_CONFLICT", path: [srcId] };
    return { ok: true, reached: found[0].device, path: pathTo(seg, found[0].device) };
  }
  if (!host.gateway) return { ok: false, reason: "NO_DEFAULT_GATEWAY", path: [srcId] };
  if (!isIpv4(host.gateway) || !sameSubnet(host.gateway, host.address, host.mask)) return { ok: false, reason: "GATEWAY_NOT_IN_LOCAL_SUBNET", path: [srcId] };
  const gw = holders(cfg, st, seg, host.gateway);
  if (gw.length > 1) return { ok: false, reason: "ADDRESS_CONFLICT", path: [srcId] };
  if (gw.length === 0 || topologyDevice(cfg, gw[0].device)?.kind !== "router") return { ok: false, reason: "GATEWAY_UNREACHABLE", path: [srcId] };
  return routerDeliver(cfg, st, gw[0].device, ip, pathTo(seg, gw[0].device));
}
// The reply leg: from whatever responded back to the source.
function replyDeliver(cfg: Cfg, st: St, fromId: string, srcAddress: string): Delivery {
  const d = topologyDevice(cfg, fromId);
  if (d?.kind === "router") return routerDeliver(cfg, st, fromId, srcAddress, [fromId]);
  const h = pcHost(st, fromId);
  if (typeof h !== "object") return { ok: false, reason: "DESTINATION_NOT_CONFIGURED", path: [fromId] };
  return hostDeliver(cfg, st, fromId, h, srcAddress);
}
function failure(reason: Exclude<ReachabilityReason, "REACHABLE">, leg?: "forward" | "return", path?: string[]): ReachabilityResult {
  const r: { reachable: false; reason: Exclude<ReachabilityReason, "REACHABLE">; leg?: "forward" | "return"; path?: string[] } = { reachable: false, reason };
  if (leg) r.leg = leg;
  if (path) r.path = path;
  return r;
}
function pingFromPc(cfg: Cfg, st: St, srcId: string, host: Host, ip: string, mustReach?: string): ReachabilityResult {
  const fwd = hostDeliver(cfg, st, srcId, host, ip);
  if (!fwd.ok) return failure(fwd.reason, "forward", fwd.path);
  if (mustReach !== undefined && fwd.reached !== mustReach) return failure("DESTINATION_UNREACHABLE", "forward", fwd.path);
  const back = replyDeliver(cfg, st, fwd.reached, host.address);
  if (!back.ok) return failure(back.reason, "return", fwd.path);
  if (back.reached !== srcId) return failure("DESTINATION_UNREACHABLE", "return", fwd.path);
  return { reachable: true, reason: "REACHABLE", path: fwd.path };
}
function sourceHost(cfg: Cfg, st: St, srcId: string): Host | ReachabilityResult {
  const src = topologyDevice(cfg, srcId);
  if (!src) return failure("DEVICE_UNKNOWN");
  if (src.kind !== "pc") return failure("SOURCE_NOT_PC");
  const h = pcHost(st, srcId);
  if (h === "NOT_CONFIGURED") return failure("SOURCE_NOT_CONFIGURED");
  if (h === "ADDRESS_INVALID") return failure("SOURCE_ADDRESS_INVALID");
  return h;
}
const isResult = (v: Host | ReachabilityResult): v is ReachabilityResult => "reachable" in v;

// Can PC `sourceId` reach device `destinationId` (a PC, or any operational interface of a router) — both legs?
export function canReach(sourceId: string, destinationId: string, config: Cfg, state: St): ReachabilityResult {
  const dst = topologyDevice(config, destinationId);
  if (!topologyDevice(config, sourceId) || !dst) return failure("DEVICE_UNKNOWN");
  if (sourceId === destinationId) return failure("SAME_DEVICE");
  const src = sourceHost(config, state, sourceId);
  if (isResult(src)) return src;
  if (dst.kind === "switch") return failure("DESTINATION_UNSUPPORTED");
  if (dst.kind === "pc") {
    const h = pcHost(state, destinationId);
    if (typeof h !== "object") return failure("DESTINATION_NOT_CONFIGURED");
    return pingFromPc(config, state, sourceId, src, h.address, destinationId);
  }
  const r = state.routers[destinationId];
  const addresses = r ? ROUTER_PORTS.map(p => effectiveRouterInterface(r, p).ipAddress).filter((a): a is string => !!a) : [];
  if (!addresses.length) return failure("DESTINATION_NOT_CONFIGURED");
  let firstFailure: ReachabilityResult | undefined;
  for (const ip of addresses) {
    const res = pingFromPc(config, state, sourceId, src, ip, destinationId);
    if (res.reachable) return res;
    firstFailure = firstFailure ?? res;
  }
  return firstFailure!;
}
// A simulated ping from PC `sourceId` to an IPv4 address (the PC panel's connectivity test).
export function pingAddress(sourceId: string, address: string, config: Cfg, state: St): ReachabilityResult {
  const src = sourceHost(config, state, sourceId);
  if (isResult(src)) return src;
  if (typeof address !== "string" || !isIpv4(address)) return failure("DESTINATION_INVALID");
  if (address === src.address) return failure("SAME_DEVICE");
  return pingFromPc(config, state, sourceId, src, address);
}
