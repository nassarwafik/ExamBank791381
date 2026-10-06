import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOPOLOGY_LIMITS, validateTopologyConfig, initialTopologyState, devicePorts, serializeTopologyState } from "./networkTopologyModel";
import { ROUTER_PORTS, ROUTER_CLI_LIMITS, createRouterState, createRouterSession, executeRouterCommand, replayRouterCommands, routerPromptFor, normalizeRouterState, serializeRouterState, type RouterSession } from "./routerCliEngine";
import { canReach, pingAddress } from "./networkConnectivity";
import { networkTopologyPluginV1, replayTopology } from "./networkTopologyPlugin";
import { scoreSmartSim, evaluateSmartSim, bindSmartSimAnswerToQuestion, validateSmartSimQuestion, validateSmartSimAnswerKey, projectSmartSimForStudent } from "./trustedSimPlugins";
import { routerTwoSwitchesFourPcsTemplate, twoLanDemoChecks } from "./networkTopology/networkTopologyTemplates";
import { replayCommands, serializeState as serializeSwitchState } from "./networkCliEngine";

// Phase 20B — networkTopology@1, the first production trusted SmartSim plugin: a strictly validated public topology (stable device /
// link identities, exact port inventories, bounded size), the PC configuration model, the router CLI v1 engine (closed grammar),
// per-switch reuse of the networkCli@1 engine, the pure two-way connectivity engine (L2 flooding with access VLAN / 802.1Q rules,
// same subnet, default gateway, directly-connected routes) and the private weighted checks graded on server-derived state.
// New-function tests (fail-first on a13252803: none of these modules exist).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
type A = Record<string, unknown>;
const pcSet = (id: string, address?: string, mask?: string, gateway?: string, dns?: string): A[] => [
  ...(address !== undefined ? [{ type: "pc.setAddress", deviceId: id, value: address }] : []), ...(mask !== undefined ? [{ type: "pc.setMask", deviceId: id, value: mask }] : []),
  ...(gateway !== undefined ? [{ type: "pc.setGateway", deviceId: id, value: gateway }] : []), ...(dns !== undefined ? [{ type: "pc.setDns", deviceId: id, value: dns }] : [])];
const sw = (id: string, ...commands: string[]): A[] => commands.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id: string, ...commands: string[]): A[] => commands.map(command => ({ type: "router.command", deviceId: id, command }));
const M24 = "255.255.255.0";
const PCS = [...pcSet("pc1", "192.168.10.10", M24, "192.168.10.254"), ...pcSet("pc2", "192.168.10.20", M24, "192.168.10.254"), ...pcSet("pc3", "192.168.20.10", M24, "192.168.20.254"), ...pcSet("pc4", "192.168.20.20", M24, "192.168.20.254")];
const SWITCHES = [...sw("sw1", "enable", "configure terminal", "hostname BR1-SW1", "end"), ...sw("sw2", "en", "conf t", "hostname BR1-SW2", "end")];
const ROUTER = rt("r1", "enable", "configure terminal", "hostname R1", "interface g0/0", "ip address 192.168.10.254 255.255.255.0", "no shutdown", "interface GigabitEthernet0/1", "ip address 192.168.20.254 255.255.255.0", "no shut", "end");
const FULL = [...PCS, ...SWITCHES, ...ROUTER];
const T = () => routerTwoSwitchesFourPcsTemplate();
const stateOf = (actions: A[], config = T()) => { const r = replayTopology(config, actions); if (!r.ok) throw new Error(r.code); return r.state; };
const reach = (src: string, dst: string, actions: A[], config = T()) => canReach(src, dst, config, stateOf(actions, config));
const ENV = () => ({ schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: T() });
const KEY = () => ({ scoring: "proportional", checks: twoLanDemoChecks() });
const answer = (actions: A[], state: unknown = {}) => ({ kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 1, actions, state });
const q = (over: A = {}) => ({ examQuestionId: "t1", presentationType: "smartSim", questionTypeVersion: 1, text: "اضبط الشبكة", marks: 23, smartSim: ENV(), answer: KEY(), ...over });
const deepFreeze = <V>(o: V): V => { if (o && typeof o === "object") { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const cfgCodes = (raw: unknown) => { const r = validateTopologyConfig(raw); return r.ok ? [] : r.issues.map(i => i.code); };

describe("20B-T1 — the public topology: stable identities, exact ports, strict bounds", () => {
  it("the one-click template (R1 + SW1/SW2 + PC1–PC4) is valid, canonical and blank-configured; ports per kind are exact", () => {
    const r = validateTopologyConfig(T());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.devices.map(d => d.id + ":" + d.kind + ":" + d.label)).toEqual(["r1:router:R1", "sw1:switch:SW1", "sw2:switch:SW2", "pc1:pc:PC1", "pc2:pc:PC2", "pc3:pc:PC3", "pc4:pc:PC4"]);
    expect(r.config.links.map(l => l.a.deviceId + "." + l.a.port + "-" + l.b.deviceId + "." + l.b.port)).toEqual(["r1.g0/0-sw1.g0/1", "r1.g0/1-sw2.g0/1", "sw1.f0/1-pc1.eth0", "sw1.f0/2-pc2.eth0", "sw2.f0/1-pc3.eth0", "sw2.f0/2-pc4.eth0"]);
    expect(devicePorts("router")).toEqual(["g0/0", "g0/1", "g0/2", "g0/3"]); expect(ROUTER_PORTS).toEqual(devicePorts("router"));
    expect(devicePorts("pc")).toEqual(["eth0"]); expect(devicePorts("switch")).toHaveLength(26);
    const st = initialTopologyState(r.config);
    expect(st.pcs).toEqual({ pc1: {}, pc2: {}, pc3: {}, pc4: {} });
    expect(Object.keys(st.switches)).toEqual(["sw1", "sw2"]); expect(st.switches.sw1.hostname).toBe("Switch");
    expect(st.routers.r1).toEqual(createRouterState());
  });
  it("refuses: duplicate ids, unsupported kinds, bad labels / positions, unknown endpoints, impossible ports, a port used twice, self-links, duplicate link ids, unknown / prototype keys, invalid initial states, size bounds, no devices", () => {
    const t = T();
    const dev = (i: number, over: A) => ({ ...t, devices: t.devices.map((d, n) => (n === i ? { ...d, ...over } : d)) });
    const link = (i: number, over: A) => ({ ...t, links: t.links.map((l, n) => (n === i ? { ...l, ...over } : l)) });
    expect(cfgCodes(dev(1, { id: "r1" }))).toContain("NETTOPO_DEVICE_ID_DUPLICATE");
    expect(cfgCodes(dev(0, { kind: "server" }))).toContain("NETTOPO_DEVICE_KIND_UNSUPPORTED");
    for (const label of ["", "   ", "x".repeat(TOPOLOGY_LIMITS.labelChars + 1), 7]) expect(cfgCodes(dev(0, { label })), String(label)).toContain("NETTOPO_DEVICE_LABEL_INVALID");
    for (const id of ["R1", "1r", "has space", "__proto__", "constructor", "x".repeat(40)]) expect(cfgCodes(dev(0, { id })), id).toContain("NETTOPO_DEVICE_ID_INVALID");
    for (const x of [-0.1, 1.5, NaN, "0.5", null]) expect(cfgCodes(dev(0, { x })), String(x)).toContain("NETTOPO_DEVICE_POSITION_INVALID");
    expect(cfgCodes(link(0, { a: { deviceId: "r9", port: "g0/0" } }))).toContain("NETTOPO_LINK_DEVICE_UNKNOWN");
    expect(cfgCodes(link(2, { b: { deviceId: "pc1", port: "g0/1" } }))).toContain("NETTOPO_LINK_PORT_INVALID");
    expect(cfgCodes(link(0, { a: { deviceId: "r1", port: "f0/1" } }))).toContain("NETTOPO_LINK_PORT_INVALID");
    expect(cfgCodes(link(0, { b: { deviceId: "sw1", port: "g0/9" } }))).toContain("NETTOPO_LINK_PORT_INVALID");
    expect(cfgCodes(link(3, { a: { deviceId: "sw1", port: "f0/1" } }))).toContain("NETTOPO_PORT_IN_USE");
    expect(cfgCodes(link(2, { b: { deviceId: "sw1", port: "f0/9" } }))).toContain("NETTOPO_LINK_SELF");
    expect(cfgCodes(link(1, { id: t.links[0].id }))).toContain("NETTOPO_LINK_ID_DUPLICATE");
    expect(cfgCodes({ ...t, owner: "x" })).toContain("NETTOPO_CONFIG_UNKNOWN_KEY");
    expect(cfgCodes(dev(0, { component: "RouterView" }))).toContain("NETTOPO_DEVICE_INVALID");
    expect(cfgCodes(JSON.parse(JSON.stringify(t).replace('"label":"R1"', '"label":"R1","__proto__":{"x":1}')))).toContain("NETTOPO_DEVICE_INVALID");
    expect(cfgCodes(dev(3, { initial: { address: "192.168.10.10" } }))).toContain("NETTOPO_DEVICE_INITIAL_INVALID");
    expect(cfgCodes(dev(3, { initial: { address: "300.1.1.1", mask: M24 } }))).toContain("NETTOPO_DEVICE_INITIAL_INVALID");
    expect(cfgCodes(dev(1, { initial: { v: 1, device: "switch", hostname: "SW", vlans: {}, interfaces: { "f0/99": {} } } }))).toContain("NETTOPO_DEVICE_INITIAL_INVALID");
    expect(cfgCodes(dev(0, { initial: { v: 1, device: "router", hostname: "R", interfaces: { "g0/0": { ipAddress: "10.0.0.1" } } } }))).toContain("NETTOPO_DEVICE_INITIAL_INVALID");
    const many = { v: 1, devices: Array.from({ length: TOPOLOGY_LIMITS.devices + 1 }, (_, i) => ({ id: "pc" + i, kind: "pc", label: "PC" + i, x: 0.5, y: 0.5 })), links: [] };
    expect(cfgCodes(many)).toContain("NETTOPO_TOO_MANY_DEVICES");
    const sws = Array.from({ length: 3 }, (_, i) => ({ id: "s" + i, kind: "switch", label: "S" + i, x: 0.5, y: 0.5 }));
    const links = Array.from({ length: TOPOLOGY_LIMITS.links + 1 }, (_, i) => ({ id: "k" + i, a: { deviceId: "s0", port: devicePorts("switch")[i % 26] }, b: { deviceId: i < 26 ? "s1" : "s2", port: devicePorts("switch")[i % 26] } }));
    expect(cfgCodes({ v: 1, devices: sws, links })).toContain("NETTOPO_TOO_MANY_LINKS");
    expect(cfgCodes({ v: 1, devices: [], links: [] })).toContain("NETTOPO_NO_DEVICES");
    expect(cfgCodes({ ...t, v: 2 })).toContain("NETTOPO_CONFIG_VERSION_UNSUPPORTED");
    expect(({} as A).x).toBeUndefined();
  });
  it("identity is the stable id, never the label or the array position: relabelling / reordering devices and links keeps the same state keys", () => {
    const t = T();
    const moved = { ...t, devices: [...t.devices].reverse().map(d => ({ ...d, label: d.label + "-x" })), links: [...t.links].reverse() };
    expect(validateTopologyConfig(moved).ok).toBe(true);
    expect(serializeTopologyState(stateOf(FULL, moved))).toBe(serializeTopologyState(stateOf(FULL)));
  });
});

describe("20B-T2 — router CLI v1: closed grammar, deterministic canonical state", () => {
  const run = (...lines: string[]) => replayRouterCommands(createRouterState(), lines);
  it("modes and prompts: Router> → # → (config)# → (config-if)#; exit / end / disable; hostname changes the prompt", () => {
    const r = run("enable", "configure terminal", "interface g0/0");
    expect(r.entries.map(e => e.prompt)).toEqual(["Router>", "Router#", "Router(config)#"]);
    expect(routerPromptFor(r.session)).toBe("Router(config-if)#");
    expect(routerPromptFor(run("en", "conf t", "hostname R1").session)).toBe("R1(config)#");
    expect(routerPromptFor(run("en", "conf t", "int g0/1", "exit").session)).toBe("Router(config)#");
    expect(routerPromptFor(run("en", "conf t", "int g0/1", "end").session)).toBe("Router#");
    expect(routerPromptFor(run("en", "disable").session)).toBe("Router>");
  });
  it("interfaces are administratively DOWN by default; ip address / no shutdown / shutdown / no ip address change canonical state; equivalent sequences serialize identically", () => {
    const a = run("enable", "configure terminal", "interface GigabitEthernet0/0", "ip address 192.168.10.254 255.255.255.0", "no shutdown").session.state;
    const b = run("en", "conf t", "int gi 0/0", "no shut", "ip address 192.168.10.254 255.255.255.0", "end", "show run").session.state;
    expect(a.interfaces).toEqual({ "g0/0": { ipAddress: "192.168.10.254", subnetMask: "255.255.255.0", shutdown: false } });
    expect(serializeRouterState(a)).toBe(serializeRouterState(b));
    expect(run("en", "conf t", "int g0/0", "no shutdown", "shutdown").session.state.interfaces).toEqual({});
    expect(run("en", "conf t", "int g0/0", "ip address 10.0.0.1 255.0.0.0", "no ip address").session.state.interfaces).toEqual({});
  });
  it("refusals never change state: wrong mode, invalid interface, malformed IPv4 / mask, network / broadcast address, overlapping subnet, switch-only and deferred commands", () => {
    const status = (lines: string[]) => run(...lines).entries.at(-1)!.result.status;
    const base = ["enable", "configure terminal", "interface g0/0"];
    expect(status(["hostname R1"])).toBe("wrong-mode");
    expect(status(["enable", "interface g0/0"])).toBe("wrong-mode");
    for (const bad of ["interface f0/1", "interface g0/4", "interface g0/0.10", "interface vlan 10", "interface g00/0"]) expect(status(["enable", "configure terminal", bad]), bad).toBe("invalid");
    expect(status([...base, "ip address 192.168.10.300 255.255.255.0"])).toBe("invalid");
    expect(status([...base, "ip address 192.168.10.1 255.0.255.0"])).toBe("invalid");
    expect(status([...base, "ip address 192.168.10.0 255.255.255.0"])).toBe("invalid");
    expect(status([...base, "ip address 192.168.10.255 255.255.255.0"])).toBe("invalid");
    const overlap = run(...base, "ip address 192.168.10.254 255.255.255.0", "interface g0/1", "ip address 192.168.10.1 255.255.0.0");
    expect(overlap.entries.at(-1)!.result.status).toBe("invalid"); expect(overlap.entries.at(-1)!.result.output.join(" ")).toMatch(/overlaps with GigabitEthernet0\/0/);
    expect(overlap.session.state.interfaces["g0/1"]).toBeUndefined();
    for (const deferred of ["ip route 0.0.0.0 0.0.0.0 10.0.0.2", "router ospf 1", "router eigrp 10", "router rip", "ip dhcp pool LAN", "access-list 10 permit any", "ip nat inside", "encapsulation dot1q 10"]) expect(["not-supported", "unknown", "wrong-mode"]).toContain(status([...base, deferred]));
    for (const sw of ["vlan 10", "switchport mode access", "switchport access vlan 10"]) expect(["not-supported", "unknown"]).toContain(status([...base, sw]));
    expect(status(["enable", "ping 192.168.10.10"])).toBe("not-supported");
    const st = run(...base, "ip address 192.168.10.300 255.255.255.0", "vlan 10", "hostname X").session.state;
    expect(st).toEqual(createRouterState());
  });
  it("show running-config / show ip interface brief / show ip route render canonical state; `do show` works in configuration modes; ? lists the mode's commands", () => {
    const r = run("enable", "configure terminal", "hostname R1", "interface g0/0", "ip address 192.168.10.254 255.255.255.0", "no shutdown", "do show running-config", "do show ip interface brief", "do show ip route", "?");
    const out = (i: number) => r.entries[i].result.output;
    expect(out(6)).toEqual(expect.arrayContaining(["hostname R1", "interface GigabitEthernet0/0", " ip address 192.168.10.254 255.255.255.0", "interface GigabitEthernet0/1", " no ip address", " shutdown"]));
    expect(out(7).find(l => l.startsWith("GigabitEthernet0/0"))).toMatch(/^GigabitEthernet0\/0\s+192\.168\.10\.254\s+YES manual up\s+up$/);
    expect(out(7).find(l => l.startsWith("GigabitEthernet0/1"))).toMatch(/administratively down\s+down$/);
    expect(out(8)).toContain("C    192.168.10.0/24 is directly connected, GigabitEthernet0/0");
    expect(out(8)).toContain("L    192.168.10.254/32 is directly connected, GigabitEthernet0/0");
    expect(out(9).join("\n")).toMatch(/ip address <ipv4-address> <subnet-mask>/);
    expect(run("enable", "show running-config").entries[1].result.status).toBe("ok");
  });
  it("bounded, pure, inert: long lines / too many words refused; shell metacharacters are text; prototype-sensitive input is harmless; frozen sessions are never mutated", () => {
    const s: RouterSession = deepFreeze(createRouterSession(createRouterState()));
    expect(executeRouterCommand(s, "x".repeat(ROUTER_CLI_LIMITS.inputChars + 1)).result.status).toBe("refused");
    expect(executeRouterCommand(s, Array.from({ length: ROUTER_CLI_LIMITS.tokens + 1 }, () => "a").join(" ")).result.status).toBe("refused");
    for (const evil of ["enable; reload", "enable && rm -rf /", "`id`", "$(id)", "enable | tee x", "show run > /tmp/x", "hostname R1;reboot", "hostname $(id)"]) {
      const r = replayRouterCommands(createRouterState(), ["enable", "configure terminal", evil]);
      expect(r.session.state.hostname, evil).toBe("Router");
    }
    const proto = replayRouterCommands(createRouterState(), ["enable", "configure terminal", "hostname constructor", "interface __proto__", "hostname __proto__"]);
    expect(proto.session.state.hostname).toBe("constructor");
    expect(({} as A).constructor).toBe(Object);
    expect(executeRouterCommand(s, 42 as unknown as string).result.status).toBe("empty");
    expect(replayRouterCommands(createRouterState(), Array.from({ length: ROUTER_CLI_LIMITS.commands + 5 }, () => "enable")).entries).toHaveLength(ROUTER_CLI_LIMITS.commands);
  });
  it("normalizeRouterState is strict: unknown / prototype keys, bad ports, half addresses, bad values are refused (never repaired)", () => {
    const ok = { v: 1, device: "router", hostname: "R1", interfaces: { "g0/0": { ipAddress: "10.0.0.1", subnetMask: "255.0.0.0", shutdown: false } } };
    expect(normalizeRouterState(ok)).toEqual({ ok: true, state: ok });
    for (const bad of [{ ...ok, extra: 1 }, { ...ok, device: "switch" }, { ...ok, v: 2 }, { ...ok, hostname: "1bad" }, { ...ok, interfaces: { "g0/9": {} } }, { ...ok, interfaces: { "g0/0": { ipAddress: "10.0.0.1" } } }, { ...ok, interfaces: { "g0/0": { shutdown: "no" } } }, JSON.parse('{"v":1,"device":"router","hostname":"R","interfaces":{"__proto__":{}}}')])
      expect(normalizeRouterState(bad).ok).toBe(false);
  });
});

describe("20B-T3 — connectivity is DERIVED from canonical configuration (two-way, bounded reasons, path evidence)", () => {
  it("same LAN: PC1 → PC2 reachable through SW1 on default VLAN 1, no router needed", () => {
    expect(reach("pc1", "pc2", [...pcSet("pc1", "192.168.10.10", M24), ...pcSet("pc2", "192.168.10.20", M24)])).toEqual({ reachable: true, reason: "REACHABLE", path: ["pc1", "sw1", "pc2"] });
  });
  it("wrong subnet / missing configuration / malformed data fail with precise reasons", () => {
    expect(reach("pc1", "pc2", [...pcSet("pc1", "192.168.10.10", M24), ...pcSet("pc2", "192.168.11.20", M24)])).toMatchObject({ reachable: false, reason: "NO_DEFAULT_GATEWAY", leg: "forward" });
    expect(reach("pc1", "pc2", pcSet("pc2", "192.168.10.20", M24))).toMatchObject({ reachable: false, reason: "SOURCE_NOT_CONFIGURED" });
    expect(reach("pc1", "pc2", [...pcSet("pc1", "192.168.10.10"), ...pcSet("pc2", "192.168.10.20", M24)])).toMatchObject({ reachable: false, reason: "SOURCE_NOT_CONFIGURED" });
    expect(reach("pc1", "pc2", pcSet("pc1", "192.168.10.10", M24))).toMatchObject({ reachable: false, reason: "DESTINATION_NOT_CONFIGURED" });
    expect(reach("pc1", "pc2", [...pcSet("pc1", "192.168.10.0", M24), ...pcSet("pc2", "192.168.10.20", M24)])).toMatchObject({ reachable: false, reason: "SOURCE_ADDRESS_INVALID" });
    const forged = { ...stateOf([]), pcs: { ...stateOf([]).pcs, pc1: { address: "999.1.1.1", mask: "255.255.255.0" }, pc2: { address: "192.168.10.20", mask: M24 } } };
    expect(canReach("pc1", "pc2", T(), forged as never)).toMatchObject({ reachable: false, reason: "SOURCE_NOT_CONFIGURED" });
    expect(canReach("pc1", "sw1", T(), stateOf(FULL))).toMatchObject({ reachable: false, reason: "DESTINATION_UNSUPPORTED" });
    expect(canReach("sw1", "pc1", T(), stateOf(FULL))).toMatchObject({ reachable: false, reason: "SOURCE_NOT_PC" });
    expect(canReach("pc1", "pc1", T(), stateOf(FULL))).toMatchObject({ reachable: false, reason: "SAME_DEVICE" });
    expect(canReach("pc1", "ghost", T(), stateOf(FULL))).toMatchObject({ reachable: false, reason: "DEVICE_UNKNOWN" });
  });
  it("cross-router: correct gateways + R1 interfaces up ⇒ PC1 ↔ PC3 reachable through R1, both directions", () => {
    expect(reach("pc1", "pc3", FULL)).toEqual({ reachable: true, reason: "REACHABLE", path: ["pc1", "sw1", "r1", "sw2", "pc3"] });
    expect(reach("pc4", "pc2", FULL)).toEqual({ reachable: true, reason: "REACHABLE", path: ["pc4", "sw2", "r1", "sw1", "pc2"] });
    expect(pingAddress("pc1", "192.168.20.254", T(), stateOf(FULL))).toMatchObject({ reachable: true, path: ["pc1", "sw1", "r1"] });
    expect(canReach("pc1", "r1", T(), stateOf(FULL))).toMatchObject({ reachable: true });
  });
  it("wrong / foreign gateway, router interface shutdown, missing return path ⇒ unreachable", () => {
    const pcsWith = (gw1: string) => [...pcSet("pc1", "192.168.10.10", M24, gw1), ...PCS.filter(a => a.deviceId !== "pc1")];
    expect(reach("pc1", "pc3", [...pcsWith("192.168.10.1"), ...ROUTER])).toMatchObject({ reachable: false, reason: "GATEWAY_UNREACHABLE", leg: "forward" });
    expect(reach("pc1", "pc3", [...pcsWith("192.168.20.254"), ...ROUTER])).toMatchObject({ reachable: false, reason: "GATEWAY_NOT_IN_LOCAL_SUBNET" });
    expect(reach("pc1", "pc3", [...PCS, ...ROUTER, ...rt("r1", "configure terminal", "interface g0/1", "shutdown")])).toMatchObject({ reachable: false, reason: "NO_ROUTE_TO_DESTINATION" });
    expect(reach("pc1", "pc3", [...PCS, ...ROUTER, ...rt("r1", "configure terminal", "interface g0/0", "shutdown")])).toMatchObject({ reachable: false, reason: "GATEWAY_UNREACHABLE" });
    const noReturn = [...PCS.filter(a => !(a.deviceId === "pc3" && a.type === "pc.setGateway")), ...ROUTER];
    expect(reach("pc1", "pc3", noReturn)).toMatchObject({ reachable: false, reason: "NO_DEFAULT_GATEWAY", leg: "return" });
  });
  it("physical layer: a missing cable or an administratively shut switch port breaks reachability", () => {
    const t = T();
    const unplugged = { ...t, links: t.links.filter(l => !(l.b.deviceId === "pc3")) };
    expect(reach("pc1", "pc3", FULL, unplugged)).toMatchObject({ reachable: false, reason: "DESTINATION_UNREACHABLE" });
    expect(reach("pc3", "pc1", FULL, unplugged)).toMatchObject({ reachable: false, reason: "SOURCE_NOT_CONNECTED" });
    expect(reach("pc1", "pc2", [...FULL, ...sw("sw1", "configure terminal", "interface fa0/1", "shutdown")])).toMatchObject({ reachable: false, reason: "SOURCE_LINK_DOWN" });
    const noUplink = { ...t, links: t.links.filter(l => l.id !== t.links[1].id) };
    expect(reach("pc1", "pc3", FULL, noUplink)).toMatchObject({ reachable: false, reason: "NO_ROUTE_TO_DESTINATION" });
  });
  it("VLAN membership: different access VLANs isolate, the same access VLAN connects; 802.1Q trunk between switches carries the VLAN", () => {
    const lan = [...pcSet("pc1", "192.168.10.10", M24), ...pcSet("pc2", "192.168.10.20", M24)];
    expect(reach("pc1", "pc2", [...lan, ...sw("sw1", "enable", "configure terminal", "interface f0/1", "switchport access vlan 10", "interface f0/2", "switchport access vlan 20")])).toMatchObject({ reachable: false, reason: "DESTINATION_UNREACHABLE" });
    expect(reach("pc1", "pc2", [...lan, ...sw("sw1", "enable", "configure terminal", "interface f0/1", "switchport access vlan 10", "interface f0/2", "switchport access vlan 10")])).toMatchObject({ reachable: true });
    const t = T();
    const trunked = { ...t, links: [...t.links, { id: "trunk", a: { deviceId: "sw1", port: "g0/2" }, b: { deviceId: "sw2", port: "g0/2" } }] };
    const vlan10 = [...pcSet("pc1", "192.168.10.10", M24), ...pcSet("pc3", "192.168.10.30", M24),
      ...sw("sw1", "en", "conf t", "int f0/1", "switchport access vlan 10", "int g0/2", "switchport mode trunk"),
      ...sw("sw2", "en", "conf t", "int f0/1", "switchport access vlan 10", "int g0/2", "switchport mode trunk")];
    expect(reach("pc1", "pc3", vlan10, trunked)).toEqual({ reachable: true, reason: "REACHABLE", path: ["pc1", "sw1", "sw2", "pc3"] });
    const accessUplink = [...vlan10.filter(a => a.command !== "switchport mode trunk")];
    expect(reach("pc1", "pc3", accessUplink, trunked)).toMatchObject({ reachable: false });
  });
  it("an address conflict on the segment is reported; the engine is deterministic and never reads the private key", () => {
    const dup = [...pcSet("pc1", "192.168.10.10", M24), ...pcSet("pc2", "192.168.10.20", M24), ...pcSet("pc3", "192.168.10.20", M24)];
    const t = T();
    const flat = { ...t, links: [...t.links.filter(l => l.id !== t.links[0].id && l.id !== t.links[1].id), { id: "x", a: { deviceId: "sw1", port: "g0/1" }, b: { deviceId: "sw2", port: "g0/1" } }] };
    expect(reach("pc1", "pc2", dup, flat)).toMatchObject({ reachable: false, reason: "ADDRESS_CONFLICT" });
    const st = deepFreeze(stateOf(FULL));
    expect(canReach("pc1", "pc3", deepFreeze(T()), st)).toEqual(canReach("pc1", "pc3", T(), st));
    const src = fs.readFileSync(path.join(repo, "src/networkConnectivity.ts"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/answer|checks|target|trustedSim|Math\.random|Date\.now|fetch\(/);
  });
});

describe("20B-T4 — the plugin: semantic actions, per-device sessions, server replay", () => {
  it("each switch / router owns its own session and history: SW1 commands never touch SW2; a mode entered on SW1 is not SW2's mode", () => {
    const r = replayTopology(T(), [...sw("sw1", "enable", "configure terminal"), ...sw("sw2", "hostname X"), ...sw("sw1", "hostname BR1-SW1")]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.switches.sw1.hostname).toBe("BR1-SW1"); expect(r.state.switches.sw2.hostname).toBe("Switch");
    expect(r.transcripts.sw2.map(e => e.result.status)).toEqual(["wrong-mode"]);
    expect(r.transcripts.sw1.map(e => e.input)).toEqual(["enable", "configure terminal", "hostname BR1-SW1"]);
    expect(serializeSwitchState(r.state.switches.sw1)).toBe(serializeSwitchState(replayCommands(r.state.switches.sw2 && initialTopologyState(T()).switches.sw1, ["enable", "configure terminal", "hostname BR1-SW1"]).session.state));
  });
  it("actions are strict: wrong device kind, unknown device / type, extra or prototype keys, bad PC values, per-device and total caps are refused at normalization", () => {
    const p = networkTopologyPluginV1, cfg = T();
    const ok = (a: unknown) => p.normalizeAction(a, cfg).ok;
    expect(ok({ type: "router.command", deviceId: "r1", command: "enable" })).toBe(true);
    expect(ok({ type: "router.command", deviceId: "sw1", command: "enable" })).toBe(false);
    expect(ok({ type: "switch.command", deviceId: "r1", command: "enable" })).toBe(false);
    expect(ok({ type: "pc.setAddress", deviceId: "sw1", value: "10.0.0.1" })).toBe(false);
    expect(ok({ type: "pc.setAddress", deviceId: "pc9", value: "10.0.0.1" })).toBe(false);
    expect(ok({ type: "pc.reboot", deviceId: "pc1" })).toBe(false);
    expect(ok({ type: "pc.setAddress", deviceId: "pc1", value: "10.0.0.1", score: 5 })).toBe(false);
    expect(ok(JSON.parse('{"type":"pc.setDns","deviceId":"pc1","value":"8.8.8.8","__proto__":{"x":1}}'))).toBe(false);
    expect(ok({ type: "pc.setAddress", deviceId: "pc1", value: "10.0.0.300" })).toBe(false);
    expect(ok({ type: "pc.setMask", deviceId: "pc1", value: "255.0.255.0" })).toBe(false);
    expect(ok({ type: "pc.setGateway", deviceId: "pc1", value: "" })).toBe(true);
    expect(ok({ type: "switch.command", deviceId: "sw1", command: "x".repeat(201) })).toBe(false);
    expect(ok({ type: "switch.command", deviceId: "sw1", command: 5 })).toBe(false);
    expect(ok({ type: "mouseDown", x: 10, y: 20 })).toBe(false);
    expect(replayTopology(cfg, sw("sw1", ...Array.from({ length: 301 }, () => "enable")))).toEqual({ ok: false, code: "NETTOPO_DEVICE_COMMANDS_TOO_MANY" });
    expect(replayTopology(cfg, [...sw("sw1", ...Array.from({ length: 300 }, () => "enable")), ...sw("sw2", ...Array.from({ length: 300 }, () => "enable"))]).ok).toBe(true);
    expect(p.maxActions).toBe(1000);
  });
  it("PC settings are canonical (sparse; empty clears); shell metacharacters in CLI input are inert text", () => {
    const st = stateOf([...pcSet("pc1", "192.168.10.10", M24, "192.168.10.254", "8.8.8.8"), ...pcSet("pc1", undefined, undefined, undefined, ""), ...sw("sw1", "enable; reload", "`id`", "$(id)"), ...rt("r1", "enable && reload")]);
    expect(st.pcs.pc1).toEqual({ address: "192.168.10.10", mask: M24, gateway: "192.168.10.254" });
    expect(st.switches.sw1.hostname).toBe("Switch"); expect(st.routers.r1).toEqual(createRouterState());
  });
  it("reset: no actions = the initial state; resetting one device = dropping that device's actions (others untouched); the config object is never mutated", () => {
    const cfg = deepFreeze(T());
    expect(serializeTopologyState(stateOf([], cfg))).toBe(serializeTopologyState(initialTopologyState(cfg)));
    const withoutR1 = FULL.filter(a => a.deviceId !== "r1");
    const st = stateOf(withoutR1, cfg);
    expect(st.routers.r1).toEqual(createRouterState()); expect(st.switches.sw1.hostname).toBe("BR1-SW1"); expect(st.pcs.pc1.address).toBe("192.168.10.10");
  });
});

describe("20B-T5 — private checks graded on SERVER-derived state (the canonical two-LAN exercise)", () => {
  it("the demo preset validates: 17 checks, total weight 23; reachability checks included", () => {
    const r = validateSmartSimAnswerKey(KEY(), networkTopologyPluginV1, T());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.key.checks).toHaveLength(17); expect(r.key.totalWeight).toBe(23); expect(r.key.checks.filter(c => c.kind === "reachability")).toHaveLength(2); }
    expect(validateSmartSimQuestion(q())).toEqual([]);
  });
  it("full configuration ⇒ full marks; any equivalent order earns the same", () => {
    expect(scoreSmartSim({ envelope: ENV(), answerKey: KEY(), response: answer(FULL), maxMarks: 23 })).toEqual({ score: 23, correct: true, manualReview: false, parts: { correct: 17, total: 17 } });
    expect(scoreSmartSim({ envelope: ENV(), answerKey: KEY(), response: answer([...ROUTER, ...[...PCS].reverse(), ...SWITCHES]), maxMarks: 23 }).score).toBe(23);
  });
  it("partial credit by weight: PC4 without gateway and R1 g0/1 left shut ⇒ 15 / 23, with exact per-check facts and reachability evidence", () => {
    const partial = [...PCS.filter(a => !(a.deviceId === "pc4" && a.type === "pc.setGateway")), ...SWITCHES, ...rt("r1", "enable", "configure terminal", "hostname R1", "interface g0/0", "ip address 192.168.10.254 255.255.255.0", "no shutdown", "interface g0/1", "ip address 192.168.20.254 255.255.255.0")];
    const e = evaluateSmartSim({ envelope: ENV(), answerKey: KEY(), response: answer(partial), maxMarks: 23 });
    expect(e.score).toBe(15);
    expect(e.checks.filter(c => !c.passed).map(c => c.id)).toEqual(["pc4-gw", "r1-g01-up", "reach-pc1-pc3", "reach-pc2-pc4"]);
    const r13 = e.checks.find(c => c.id === "reach-pc1-pc3")!;
    expect(r13).toMatchObject({ expected: "reachable", actual: "unreachable", weight: 3, points: 0, maxPoints: 3 });
    expect(r13.evidence).toEqual(expect.arrayContaining(["NO_ROUTE_TO_DESTINATION"]));
    expect(e.checks.find(c => c.id === "r1-g00-ip")).toMatchObject({ passed: true, expected: "192.168.10.254", actual: "192.168.10.254", points: 2 });
  });
  it("forgery: a perfect claimed state with no actions earns 0; ingest binds the replayed state; a malformed private key fails CLOSED (manual review)", () => {
    const perfect = stateOf(FULL);
    expect(scoreSmartSim({ envelope: ENV(), answerKey: KEY(), response: answer([], perfect), maxMarks: 23 })).toEqual({ score: 0, correct: false, manualReview: false, parts: { correct: 0, total: 17 } });
    const bound = bindSmartSimAnswerToQuestion(answer(PCS.slice(0, 3), perfect), q());
    expect(bound.ok && serializeTopologyState(bound.answer.state as never)).toBe(serializeTopologyState(stateOf(PCS.slice(0, 3))));
    const badKey = { ...KEY(), checks: [...twoLanDemoChecks(), { id: "x", label: "x", weight: 1, kind: "router.hostname", deviceId: "sw1", value: "R1" }] };
    expect(scoreSmartSim({ envelope: ENV(), answerKey: badKey, response: answer(FULL), maxMarks: 23 })).toMatchObject({ score: 0, manualReview: true });
  });
  it("check validation refuses: unknown device, wrong device kind, impossible port / interface, bad values, reachability to self or from a non-PC, unknown kinds", () => {
    const codes = (check: A) => { const r = validateSmartSimAnswerKey({ scoring: "proportional", checks: [{ id: "c1", label: "c", weight: 1, ...check }] }, networkTopologyPluginV1, T()); return r.ok ? [] : r.issues.map(i => i.code); };
    expect(codes({ kind: "pc.address", deviceId: "pc9", value: "10.0.0.1" })).toContain("NETTOPO_CHECK_DEVICE_UNKNOWN");
    expect(codes({ kind: "router.hostname", deviceId: "sw1", value: "R1" })).toContain("NETTOPO_CHECK_DEVICE_KIND");
    expect(codes({ kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/99", value: 10 })).toContain("NETTOPO_CHECK_INTERFACE_INVALID");
    expect(codes({ kind: "switch.ipAddress", deviceId: "sw1", interface: "f0/1", value: "10.0.0.2" })).toContain("NETTOPO_CHECK_INTERFACE_INVALID");
    expect(codes({ kind: "router.ipAddress", deviceId: "r1", interface: "g0/0", value: "10.0.0.300" })).toContain("NETTOPO_CHECK_VALUE_INVALID");
    expect(codes({ kind: "pc.mask", deviceId: "pc1", value: "255.0.255.0" })).toContain("NETTOPO_CHECK_VALUE_INVALID");
    expect(codes({ kind: "switch.vlanExists", deviceId: "sw1", vlan: 1 })).toContain("NETTOPO_CHECK_VALUE_INVALID");
    expect(codes({ kind: "reachability", source: "pc1", destination: "pc1", value: true })).toContain("NETTOPO_CHECK_REACH_INVALID");
    expect(codes({ kind: "reachability", source: "r1", destination: "pc1", value: true })).toContain("NETTOPO_CHECK_REACH_INVALID");
    expect(codes({ kind: "reachability", source: "pc1", destination: "sw1", value: true })).toContain("NETTOPO_CHECK_REACH_INVALID");
    expect(codes({ kind: "pc.address", deviceId: "pc1", value: "10.0.0.1", extra: 1 })).toContain("NETTOPO_CHECK_INVALID");
    expect(codes({ kind: "router.interfaceEnabled", deviceId: "r1", interface: "GigabitEthernet0/1", value: true })).toEqual([]);
  });
  it("the student projection is the public topology only: no check, expected address, hostname or weight", () => {
    const p = projectSmartSimForStudent(ENV());
    expect(p).toEqual({ schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 1, config: validateTopologyConfig(T()).ok ? (validateTopologyConfig(T()) as { config: unknown }).config : null });
    expect(JSON.stringify(p)).not.toMatch(/BR1-SW1|192\.168\.|reach-|weight|checks/);
  });
});
