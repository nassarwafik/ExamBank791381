import { describe, it, expect } from "vitest";
import { validateNet2Config, deriveMac, NET2_LIMITS, NET2_DEVICE_KINDS } from "./net2Model";
import { replayNet2, canReachNet2, normalizeNet2Action, NET2_ACTION_KINDS, NET2_CHECK_KINDS, NETWORK_TOPOLOGY_DESCRIPTOR_V2, networkTopologyPluginV2 } from "./net2Plugin";
import { NET2_TEMPLATES, net2TemplateById } from "./networkTopology2/net2Templates";
import { networkTopologyPluginV1 } from "./networkTopologyPlugin";
import { resolveSmartSimPlugin, resolveSmartSimDescriptor, listSmartSimPlugins, validateSmartSimQuestion, evaluateSmartSim, bindSmartSimAnswerToQuestion, projectSmartSimForStudent } from "./trustedSimPlugins";

// Phase 20C — networkTopology@2 AUTHORITY and CONTRACT: strict config (6 device kinds, adapters, deterministic MACs, bounds), an immutable
// student topology, the exact descriptor ↔ normalizer action contract, the private check vocabulary, server authority (A1–A12), limits,
// reset, the seven curriculum scenarios and the certification capstone (incl. Server DNS / HTTP and the Browser). New-function tests
// (fail-first on 686afbc).
type Json = Record<string, unknown>;
const dev = (id: string, kind: string, extra: Json = {}) => ({ id, kind, label: id.toUpperCase(), x: 0.5, y: 0.5, ...extra });
const link = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp } });
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const sw = (id: string, ...c: string[]) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id: string, ...c: string[]) => c.map(command => ({ type: "router.command", deviceId: id, command }));
const host = (id: string, ...c: string[]) => c.map(command => ({ type: "host.command", deviceId: id, command }));
const mode = (id: string, m: string, adapter = "eth0") => ({ type: "host.setMode", deviceId: id, adapter, mode: m });
const env = (config: unknown) => ({ schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config });
const question = (config: unknown, checks: unknown[], marks = 10, scoring = "proportional") => ({ examQuestionId: "q", presentationType: "smartSim", questionTypeVersion: 1, text: "شبكة", marks, smartSim: env(config), answer: { scoring, checks } });
const ans = (actions: unknown[], state: unknown = {}) => ({ kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, actions, state });
const grade = (q: ReturnType<typeof question>, actions: unknown[], state: unknown = {}) => evaluateSmartSim({ envelope: q.smartSim, answerKey: q.answer, response: ans(actions, state), maxMarks: q.marks }, { withDetails: true });
type R = { ok: true; state: { devices: Record<string, Json>; ops: Json }; transcripts: Record<string, { input: string; result: { status: string; output: string[] } }[]> };
function run(c: unknown, actions: unknown[]): R { const r = replayNet2(c as never, actions); if (!r.ok) throw new Error(r.code); return r as unknown as R; }
const CONF = ["enable", "configure terminal"];
const tpl = (id: string) => net2TemplateById(id)!;

// ── independent solutions for the curriculum templates (the tests know the network; the engines know nothing about templates) ──────
const ROAS_SOLUTION = [...sw("sw1", ...CONF, "vlan 10", "name STAFF", "vlan 20", "name STUDENTS", "interface f0/1", "switchport mode access", "switchport access vlan 10", "interface f0/2", "switchport mode access", "switchport access vlan 10",
  "interface f0/11", "switchport mode access", "switchport access vlan 20", "interface f0/12", "switchport mode access", "switchport access vlan 20", "interface g0/1", "switchport mode trunk", "end"),
  ...rt("r1", ...CONF, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1Q 20", "ip address 192.168.20.1 255.255.255.0", "end")];
const DHCP_SOLUTION = rt("r1", ...CONF, "ip dhcp excluded-address 192.168.1.1 192.168.1.10", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0", "default-router 192.168.1.1", "dns-server 192.168.1.1", "end");
const VTP_SOLUTION = [...sw("sw1", ...CONF, "vtp domain SCHOOL", "vtp mode server", "vlan 30", "name LAB", "interface f0/1", "switchport mode access", "switchport access vlan 30", "interface g0/1", "switchport mode trunk", "end"),
  ...sw("sw2", ...CONF, "vtp domain SCHOOL", "vtp mode client", "interface f0/1", "switchport mode access", "switchport access vlan 30", "interface g0/1", "switchport mode trunk", "end")];
const PORTSEC_SOLUTION = sw("sw1", ...CONF, "interface f0/1", "switchport mode access", "switchport port-security", "switchport port-security maximum 1", "switchport port-security mac-address sticky", "switchport port-security violation shutdown", "end");
const WIRELESS_SOLUTION = [{ type: "ap.set", deviceId: "ap1", field: "security", value: "wpa2" }, { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "Exam2026!" }, { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL-WIFI", passphrase: "Exam2026!" }];
const TRUNK = ["switchport mode trunk", "switchport trunk native vlan 99", "switchport trunk allowed vlan 10,20,50,99"];
const CAPSTONE_SOLUTION = [
  ...sw("sw1", ...CONF, "hostname SW1", "enable secret Class2026", "vtp domain SCHOOL", "vtp mode server", "vtp password VtpPw", "vtp version 2", "vlan 10", "name STAFF", "vlan 20", "name STUDENTS", "vlan 50", "name SERVERS", "vlan 99", "name MGMT",
    "interface g0/1", ...TRUNK, "interface g0/2", ...TRUNK, "interface f0/1", "switchport mode access", "switchport access vlan 10", "switchport port-security", "switchport port-security mac-address sticky", "switchport port-security violation shutdown",
    "interface f0/2", "switchport mode access", "switchport access vlan 20", "end"),
  ...sw("sw2", ...CONF, "hostname SW2", "enable secret Class2026", "vtp domain SCHOOL", "vtp mode client", "vtp password VtpPw", "vtp version 2", "interface g0/1", ...TRUNK, "interface f0/1", "switchport mode access", "switchport access vlan 20",
    "interface f0/5", "switchport mode access", "switchport access vlan 50", "end"),
  ...rt("r1", ...CONF, "hostname R1", "enable secret Class2026", "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1Q 20", "ip address 192.168.20.1 255.255.255.0",
    "interface g0/0.50", "encapsulation dot1Q 50", "ip address 192.168.50.1 255.255.255.0", "interface g0/0.99", "encapsulation dot1Q 99 native", "ip address 192.168.99.1 255.255.255.0", "exit",
    "ip dhcp excluded-address 192.168.10.1 192.168.10.10", "ip dhcp excluded-address 192.168.20.1 192.168.20.10", "ip dhcp pool STAFF", "network 192.168.10.0 255.255.255.0", "default-router 192.168.10.1", "dns-server 192.168.50.10",
    "ip dhcp pool STUDENTS", "network 192.168.20.0 255.255.255.0", "default-router 192.168.20.1", "dns-server 192.168.50.10", "end"),
  { type: "ap.set", deviceId: "ap1", field: "security", value: "wpa2" }, { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "Exam2026!" }, { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL-WIFI", passphrase: "Exam2026!" },
  { type: "host.browse", deviceId: "lap1", url: "http://server.school.local" }];

describe("20C-M — strict v2 configuration (6 kinds, adapters, MACs, bounds)", () => {
  it("M1 every template validates; kinds / limits are the documented ones; MACs are deterministic, well-formed and unique", () => {
    expect([...NET2_DEVICE_KINDS]).toEqual(["router", "switch", "pc", "laptop", "ap", "server"]);
    expect(NET2_LIMITS).toMatchObject({ devices: 30, links: 60, actions: 1000, commandsPerDevice: 300, hostCommandsPerDevice: 200, wifiActionsPerHost: 50 });
    expect(NET2_TEMPLATES.map(t => t.id)).toEqual(["roas", "dhcp", "vtp", "portsec", "wireless", "capstone"]);
    for (const t of NET2_TEMPLATES) { const r = validateNet2Config(t.config()); expect(codes(r), t.id).toEqual([]); if (r.ok) expect(validateNet2Config(r.config)).toEqual(r); }
    expect(deriveMac("pc1", "eth0")).toBe(deriveMac("pc1", "eth0"));
    expect(deriveMac("pc1", "eth0")).toMatch(/^02[0-9a-f]{2}\.[0-9a-f]{4}\.[0-9a-f]{4}$/);
    const macs = new Set<string>(); for (let i = 0; i < 400; i++) for (const p of ["eth0", "wlan0", "g0/0", "g0/1"]) macs.add(deriveMac("d" + i, p));
    expect(macs.size).toBe(1600);
  });
  it("M2 refusals: unknown kinds / keys, impossible adapters, ports not on the device, a laptop cable without Ethernet, duplicates, v1 / v3 configs, bounds", () => {
    const v = (devices: Json[], links: Json[] = [], over: Json = {}) => codes(validateNet2Config({ v: 2, devices, links, ...over }));
    expect(v([dev("x", "firewall")])).toContain("NET2_DEVICE_KIND_UNSUPPORTED");
    expect(v([dev("p", "pc", { adapters: ["ethernet", "ethernet"] })])).toContain("NET2_DEVICE_ADAPTERS_INVALID");
    expect(v([dev("p", "pc", { adapters: [] })])).toContain("NET2_DEVICE_ADAPTERS_INVALID");
    expect(v([dev("r", "router", { adapters: ["wireless"] })])).toContain("NET2_DEVICE_ADAPTERS_INVALID");
    expect(v([dev("l", "laptop"), dev("s", "switch")], [link("x", "l", "eth0", "s", "f0/1")])).toContain("NET2_LINK_PORT_INVALID");
    expect(v([dev("p", "pc"), dev("s", "switch")], [link("x", "p", "wlan0", "s", "f0/1")])).toContain("NET2_LINK_PORT_INVALID");
    expect(v([dev("p", "pc"), dev("p", "pc")])).toContain("NET2_DEVICE_ID_DUPLICATE");
    expect(v([dev("p", "pc"), dev("q", "pc"), dev("s", "switch")], [link("x", "p", "eth0", "s", "f0/1"), link("y", "q", "eth0", "s", "f0/1")])).toContain("NET2_PORT_IN_USE");
    expect(v([dev("p", "pc", { extra: 1 })])).toContain("NET2_DEVICE_INVALID");
    expect(v([dev("p", "pc")], [], { answer: {} })).toContain("NET2_CONFIG_UNKNOWN_KEY");
    expect(codes(validateNet2Config({ ...tpl("roas").config(), v: 1 }))).toContain("NET2_CONFIG_VERSION_UNSUPPORTED");
    expect(codes(validateNet2Config({ ...tpl("roas").config(), v: 3 }))).toContain("NET2_CONFIG_VERSION_UNSUPPORTED");
    expect(v(Array.from({ length: 31 }, (_, i) => dev("p" + i, "pc")))).toContain("NET2_TOO_MANY_DEVICES");
    expect(v([dev("__proto__", "pc")])).toContain("NET2_DEVICE_ID_INVALID");
    expect(v([dev("p", "pc", { x: 2 })])).toContain("NET2_DEVICE_POSITION_INVALID");
  });
  it("M3 initial states are strict per kind (a bad switch / router / host / AP / server initial state blocks the topology)", () => {
    const bad = [dev("s", "switch", { initial: { v: 2, device: "switch", hostname: "1bad", vlans: {}, interfaces: {}, vtp: { mode: "server", domain: "", password: "", version: 1, revision: 0 }, security: {} } }),
      dev("r", "router", { initial: { v: 2, device: "router", hostname: "R", interfaces: {}, subinterfaces: { "g0/0.10": { vlan: 5000 } }, dhcp: { excluded: [], pools: {} }, security: {} } }),
      dev("p", "pc", { initial: { v: 2, device: "host", adapters: { eth0: { mode: "static", address: "999.0.0.1", mask: "255.255.255.0" } } } }),
      dev("a", "ap", { initial: { v: 2, device: "ap", enabled: true, ssid: "S", security: "wpa2", passphrase: "short" } }),
      dev("v", "server", { initial: { v: 2, device: "host", adapters: { eth0: { mode: "static" } }, services: { http: { enabled: true, title: "t", body: "<script>alert(1)</script>" } } } })];
    for (const d of bad) expect(codes(validateNet2Config({ v: 2, devices: [d], links: [] })), String(d.id)).toContain("NET2_DEVICE_INITIAL_INVALID");
  });
});

describe("20C-C — exact identity, descriptor ↔ normalizer contract, topology lock", () => {
  it("C1 networkTopology@2 resolves to the v2 plugin; @1 is untouched; no fallback of any kind", () => {
    expect(resolveSmartSimPlugin("networkTopology", 2)).toBe(networkTopologyPluginV2);
    expect(resolveSmartSimPlugin("networkTopology", 1)).toBe(networkTopologyPluginV1);
    for (const [k, v] of [["networkTopology", 3], ["networkTopology", "2"], ["NetworkTopology", 2], ["networktopology", 2], ["networkTopology", 2.5]] as const) expect(resolveSmartSimPlugin(k, v), String(k) + "@" + String(v)).toBeUndefined();
    expect(listSmartSimPlugins().map(p => p.key + "@" + p.version)).toEqual(["networkTopology@1", "physicsFreeFall@1", "functionStudy2d@1", "networkTopology@2"]);
    expect(resolveSmartSimDescriptor("networkTopology", 2)).toEqual(NETWORK_TOPOLOGY_DESCRIPTOR_V2);
    expect(NETWORK_TOPOLOGY_DESCRIPTOR_V2).toMatchObject({ key: "networkTopology", version: 2, domain: "networking", genericRules: [] });
    expect(validateSmartSimQuestion({ ...question(tpl("roas").config(), tpl("roas").checks()), smartSim: env(routerTwoV1()) }).map(i => i.code)).toContain("NET2_CONFIG_VERSION_UNSUPPORTED");   // a v1 config is never silently migrated
  });
  it("C2 descriptor.actionKinds == the normalizer: every declared kind has an accepted example; undeclared kinds are refused", () => {
    const c = validateNet2Config(tpl("capstone").config()); if (!c.ok) throw new Error("cfg");
    const examples: Record<string, Json> = {
      "host.setMode": mode("pcstaff", "static"), "host.setStatic": { type: "host.setStatic", deviceId: "pcstaff", adapter: "eth0", address: "192.168.10.50", mask: "255.255.255.0", gateway: "192.168.10.1", dns: "" },
      "host.command": { type: "host.command", deviceId: "pcstaff", command: "ipconfig" }, "host.wifiConnect": { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL-WIFI", passphrase: "" },
      "host.wifiDisconnect": { type: "host.wifiDisconnect", deviceId: "lap1" }, "host.browse": { type: "host.browse", deviceId: "lap1", url: "http://server.school.local" },
      "switch.command": { type: "switch.command", deviceId: "sw1", command: "enable" }, "router.command": { type: "router.command", deviceId: "r1", command: "enable" },
      "ap.set": { type: "ap.set", deviceId: "ap1", field: "ssid", value: "X" },
      "server.setDhcp": { type: "server.setDhcp", deviceId: "srv1", enabled: true, pool: { defaultRouter: "192.168.50.1", dns: "192.168.50.10", start: "192.168.50.100", mask: "255.255.255.0", max: 20 } },
      "server.setDns": { type: "server.setDns", deviceId: "srv1", enabled: true, records: [{ name: "www.school.local", address: "192.168.50.10" }] },
      "server.setHttp": { type: "server.setHttp", deviceId: "srv1", enabled: true, title: "Home", body: "Welcome" }
    };
    expect(Object.keys(examples).sort()).toEqual([...NET2_ACTION_KINDS].sort());
    expect([...NET2_ACTION_KINDS]).toEqual([...NETWORK_TOPOLOGY_DESCRIPTOR_V2.actionKinds]);
    for (const [k, a] of Object.entries(examples)) expect(normalizeNet2Action(a, c.config).ok, k).toBe(true);
    for (const t of ["pc.setAddress", "host.setLease", "switch.setState", "router.setState", "ap.create", "server.exec", "host.exec", "device.add", "link.add", "topology.replace", "camera.zoom", "view.pan"])
      expect(normalizeNet2Action({ type: t, deviceId: "sw1", command: "enable" }, c.config).ok, t).toBe(false);
    expect([...NET2_CHECK_KINDS]).toEqual([...NETWORK_TOPOLOGY_DESCRIPTOR_V2.checkKinds]);
  });
  it("C3 A10 / A11 presentation gestures and topology mutations never enter the record; the topology is identical after any answer", () => {
    const q = question(tpl("roas").config(), tpl("roas").checks());
    for (const g of [{ type: "camera.zoom", factor: 2 }, { type: "view.pan", x: 1 }, { type: "pointer.drag", deviceId: "pc1" }]) expect(bindSmartSimAnswerToQuestion(ans([g, ...ROAS_SOLUTION]), q), g.type).toEqual({ ok: false, code: "SMARTSIM_ACTION_PRESENTATION_ONLY" });
    for (const g of [{ type: "device.add", id: "evil", kind: "router" }, { type: "link.delete", id: "u" }, { type: "device.move", deviceId: "pc1", x: 0.1, y: 0.1 }, { type: "topology.replace", config: {} }])
      expect(bindSmartSimAnswerToQuestion(ans([g, ...ROAS_SOLUTION]), q), g.type).toEqual({ ok: false, code: "SMARTSIM_ACTION_INVALID" });
    const r = run(validateNet2Config(tpl("roas").config()).ok ? (validateNet2Config(tpl("roas").config()) as { config: unknown }).config : null, ROAS_SOLUTION);
    expect(Object.keys(r.state.devices).sort()).toEqual(["pc1", "pc2", "pc3", "pc4", "r1", "sw1"]);
  });
});

describe("20C-K — private check vocabulary (server-derived state only) and leakage", () => {
  it("K1 every template's private key validates; the student projection is the public config only", () => {
    for (const t of NET2_TEMPLATES) {
      expect(validateSmartSimQuestion(question(t.config(), t.checks())), t.id).toEqual([]);
      const p = projectSmartSimForStudent(env(t.config()))!;
      expect(p.config).toEqual(validateNet2Config(t.config()).ok ? (validateNet2Config(t.config()) as { config: unknown }).config : null);
      expect(JSON.stringify(p), t.id).not.toMatch(/"checks"|"weight"|"expected"|"tolerance"|reachability|dhcpLease/);
    }
  });
  it("K2 checks are strict: unknown device / wrong kind / bad interface / bad value / extra keys are refused", () => {
    const c = tpl("capstone").config();
    const issues = (k: Json) => validateSmartSimQuestion(question(c, [{ id: "k", label: "k", weight: 1, ...k }])).map(i => i.code);
    expect(issues({ kind: "switch.accessVlan", deviceId: "nope", interface: "f0/1", value: 10 })).toContain("NET2_CHECK_DEVICE_UNKNOWN");
    expect(issues({ kind: "switch.accessVlan", deviceId: "r1", interface: "f0/1", value: 10 })).toContain("NET2_CHECK_DEVICE_KIND");
    expect(issues({ kind: "switch.accessVlan", deviceId: "sw1", interface: "f0/77", value: 10 })).toContain("NET2_CHECK_INTERFACE_INVALID");
    expect(issues({ kind: "router.subinterfaceVlan", deviceId: "r1", interface: "g0/0", value: 10 })).toContain("NET2_CHECK_INTERFACE_INVALID");
    expect(issues({ kind: "switch.allowedVlans", deviceId: "sw1", interface: "g0/1", value: "10,abc" })).toContain("NET2_CHECK_VALUE_INVALID");
    expect(issues({ kind: "host.dhcpLease", deviceId: "lap1", adapter: "eth0", value: true })).toContain("NET2_CHECK_INTERFACE_INVALID");
    expect(issues({ kind: "reachability", source: "sw1", destination: "pcstaff", value: true })).toContain("NET2_CHECK_REACH_INVALID");
    expect(issues({ kind: "ap.security", deviceId: "ap1", value: "wep" })).toContain("NET2_CHECK_VALUE_INVALID");
    expect(issues({ kind: "switch.hostname", deviceId: "sw1", value: "SW1", extra: 1 })).toContain("NET2_CHECK_INVALID");
    expect(issues({ kind: "browse", source: "lap1", url: "javascript:alert(1)", value: true })).toContain("NET2_CHECK_VALUE_INVALID");
    expect(issues({ kind: "browse", source: "lap1", url: "https://evil.example.com/x", value: true })).toContain("NET2_CHECK_VALUE_INVALID");
  });
});

describe("20C-A — server authority (A1–A12)", () => {
  const q = () => question(tpl("roas").config(), tpl("roas").checks(), 13);
  it("A1 a forged perfect final state with zero actions earns zero; the full solution earns full marks; a partial one partial credit", () => {
    const solved = run(validateNet2Config(tpl("roas").config()).ok ? (validateNet2Config(tpl("roas").config()) as { config: unknown }).config : null, ROAS_SOLUTION);
    expect(grade(q(), [], solved.state)).toMatchObject({ valid: true, score: 0 });
    expect(grade(q(), ROAS_SOLUTION)).toMatchObject({ valid: true, score: 13, correct: true });
    const partial = grade(q(), ROAS_SOLUTION.filter(a => a.deviceId !== "r1"));
    expect(partial.score).toBeGreaterThan(0); expect(partial.score).toBeLessThan(13);
  });
  it("A2–A5 forged leases / associations / port-security / VTP revisions in the claimed state are replaced by the replay", () => {
    const forged = { v: 2, devices: {}, ops: { adapters: { "pc1/eth0": { status: "dhcp", address: "192.168.10.99" } }, wifi: { lap1: { status: "associated" } }, portSecurity: { "sw1|f0/1": { seen: [], errDisabled: false } }, vtp: { sw2: { revision: 999, vlans: [1, 30] } } } };
    for (const id of ["dhcp", "wireless", "vtp", "portsec"]) {
      const t = tpl(id);
      const b = bindSmartSimAnswerToQuestion(ans([], forged), question(t.config(), t.checks()));
      expect(b.ok, id).toBe(true);
      if (b.ok) expect(JSON.stringify(b.answer.state), id).not.toMatch(/192\.168\.10\.99|"revision":999/);
      expect(grade(question(t.config(), t.checks()), [], forged).score, id).toBe(0);
    }
  });
  it("A6–A8 future plugin version, future config version and wrong-case identity fail closed (0 + manual review)", () => {
    const t = tpl("roas");
    for (const e of [{ ...env(t.config()), pluginVersion: 3 }, env({ ...t.config(), v: 3 }), { ...env(t.config()), pluginKey: "NetworkTopology" }]) {
      const r = evaluateSmartSim({ envelope: e, answerKey: { scoring: "proportional", checks: t.checks() }, response: ans(ROAS_SOLUTION), maxMarks: 13 });
      expect(r).toMatchObject({ valid: false, score: 0, manualReview: true });
    }
  });
  it("A12 answer / action limits are enforced (total, per CLI device, per host CMD, per host wireless)", () => {
    const q2 = question(tpl("capstone").config(), tpl("capstone").checks());
    expect(bindSmartSimAnswerToQuestion(ans(Array.from({ length: 1001 }, () => ({ type: "switch.command", deviceId: "sw1", command: "enable" }))), q2)).toEqual({ ok: false, code: "SMARTSIM_ACTIONS_TOO_MANY" });
    expect(bindSmartSimAnswerToQuestion(ans(Array.from({ length: 301 }, () => ({ type: "switch.command", deviceId: "sw1", command: "show vlan brief" }))), q2)).toEqual({ ok: false, code: "NET2_DEVICE_COMMANDS_TOO_MANY" });
    expect(bindSmartSimAnswerToQuestion(ans(Array.from({ length: 201 }, () => ({ type: "host.command", deviceId: "pcstaff", command: "ipconfig" }))), q2)).toEqual({ ok: false, code: "NET2_HOST_COMMANDS_TOO_MANY" });
    expect(bindSmartSimAnswerToQuestion(ans(Array.from({ length: 51 }, () => ({ type: "host.wifiDisconnect", deviceId: "lap1" }))), q2)).toEqual({ ok: false, code: "NET2_WIFI_ACTIONS_TOO_MANY" });
  });
  it("no curriculum template gives free credit: every template scores exactly 0 before any student action", () => {
    for (const t of NET2_TEMPLATES) expect(grade(question(t.config(), t.checks()), []).score, t.id).toBe(0);
  });
  it("reset: zero actions is exactly the teacher-authored initial state (not a factory state), with fresh operational state", () => {
    const c = validateNet2Config(tpl("wireless").config()); if (!c.ok) throw new Error("cfg");
    const fresh = run(c.config, []);
    expect(fresh.state.devices.r1).toMatchObject({ interfaces: { "g0/0": { ipAddress: "192.168.1.1", subnetMask: "255.255.255.0", shutdown: false } } });
    expect(fresh.state.devices.ap1).toMatchObject({ ssid: "SCHOOL-WIFI", security: "open" });
    expect(fresh.state.ops.arp).toEqual({}); expect(fresh.state.ops.macTables).toEqual({});
    expect(grade(question(tpl("wireless").config(), tpl("wireless").checks()), []).score).toBe(0);           // no free initial credit
  });
});

describe("20C-SC — curriculum scenarios 1–7 and the certification capstone", () => {
  const cfgOf = (id: string) => { const c = validateNet2Config(tpl(id).config()); if (!c.ok) throw new Error(id); return c.config; };
  const full = (id: string, actions: unknown[]) => { const t = tpl(id); const total = t.checks().reduce((n, c) => n + (c as { weight: number }).weight, 0); return grade(question(t.config(), t.checks(), total), actions); };
  it("Scenario 1 — two VLANs + trunk + Router-on-a-Stick: inter-VLAN ping succeeds; every private check passes", () => {
    expect(full("roas", ROAS_SOLUTION)).toMatchObject({ correct: true });
    expect(canReachNet2(cfgOf("roas"), run(cfgOf("roas"), ROAS_SOLUTION).state as never, "pc1", "pc4").reachable).toBe(true);
    expect(full("roas", [])).toMatchObject({ score: 0 });
  });
  it("Scenario 1b — router DHCP: the template's independent solution earns every private check", () => {
    expect(full("dhcp", DHCP_SOLUTION)).toMatchObject({ correct: true });
    expect(full("dhcp", DHCP_SOLUTION.slice(0, -2)).correct).toBe(false);                                   // no dns-server ⇒ not complete
  });
  it("Scenario 2 — DHCP for VLAN 10 behind a trunk that does not allow VLAN 10 fails until the allowed list is repaired", () => {
    const c = cfgOf("roas");
    const dhcpRoas = [...ROAS_SOLUTION, mode("pc1", "dhcp"), ...rt("r1", ...CONF, "ip dhcp excluded-address 192.168.10.1 192.168.10.20", "ip dhcp pool V10", "network 192.168.10.0 255.255.255.0", "default-router 192.168.10.1", "end")];
    const blocked = run(c, [...dhcpRoas, ...sw("sw1", ...CONF, "interface g0/1", "switchport trunk allowed vlan 20", "end")]);
    expect((blocked.state.ops.adapters as Record<string, Json>)["pc1/eth0"]).toMatchObject({ status: "apipa" });
    const repaired = run(c, [...dhcpRoas, ...sw("sw1", ...CONF, "interface g0/1", "switchport trunk allowed vlan 20", "switchport trunk allowed vlan add 10", "end")]);
    expect((repaired.state.ops.adapters as Record<string, Json>)["pc1/eth0"]).toMatchObject({ status: "dhcp", address: "192.168.10.21", gateway: "192.168.10.1" });
  });
  it("Scenario 3 — VTP server / client: the VLAN propagates only with a matching VTP context", () => {
    expect(full("vtp", VTP_SOLUTION)).toMatchObject({ correct: true });
    expect(full("vtp", VTP_SOLUTION.map(a => (a.deviceId === "sw2" && a.command === "vtp domain SCHOOL" ? { ...a, command: "vtp domain OTHER" } : a))).correct).toBe(false);
  });
  it("Scenario 4 — Port Security: the template solution passes; an unauthorized MAC err-disables the port and cuts the host off", () => {
    expect(full("portsec", [...PORTSEC_SOLUTION, ...host("pc1", "ping 192.168.50.2")])).toMatchObject({ correct: true });
    const c = cfgOf("portsec");
    const r = run(c, [...sw("sw1", ...CONF, "interface f0/1", "switchport mode access", "switchport port-security", "switchport port-security mac-address 0200.0bad.0bad", "end"), ...host("pc1", "ping 192.168.50.2")]);
    expect((r.state.ops.portSecurity as Record<string, Json>)["sw1|f0/1"]).toMatchObject({ errDisabled: true });
    expect(canReachNet2(c, r.state as never, "pc1", "pc2").reachable).toBe(false);
  });
  it("Scenario 5 — wireless Laptop: WPA2 + correct passphrase + AP uplink + DHCP ⇒ valid lease and connectivity", () => {
    expect(full("wireless", WIRELESS_SOLUTION)).toMatchObject({ correct: true });
    const wrong = full("wireless", WIRELESS_SOLUTION.map(a => (a.type === "host.wifiConnect" ? { ...a, passphrase: "nope-nope" } : a)));
    expect(wrong.correct).toBe(false);
  });
  it("Scenario 6 — passwords: running-config and private password checks reflect the configuration", () => {
    const c = tpl("capstone").config();
    const checks = [{ id: "s", label: "s", weight: 1, kind: "switch.enableSecret", deviceId: "sw1", value: "Class2026" }, { id: "r", label: "r", weight: 1, kind: "router.enableSecret", deviceId: "r1", value: "Class2026" }];
    expect(grade(question(c, checks, 2), CAPSTONE_SOLUTION)).toMatchObject({ score: 2 });
    expect(grade(question(c, checks, 2), CAPSTONE_SOLUTION.map(a => ((a as { command?: string }).command === "enable secret Class2026" && a.deviceId === "r1" ? { ...a, command: "enable secret wrong" } : a))).score).toBe(1);
  });
  it("Scenario 7 — fault diagnosis: one wrong dot1Q VLAN; ping and DHCP reveal it until corrected", () => {
    const c = cfgOf("roas");
    const wrong = ROAS_SOLUTION.map(a => (a.command === "encapsulation dot1Q 20" ? { ...a, command: "encapsulation dot1Q 21" } : a));
    const dhcpPool = [mode("pc3", "dhcp"), ...rt("r1", ...CONF, "ip dhcp pool V20", "network 192.168.20.0 255.255.255.0", "default-router 192.168.20.1", "end")];
    const broken = run(c, [...wrong, ...dhcpPool, ...host("pc1", "ping 192.168.20.12")]);
    const t = broken.transcripts.pc1; expect(t[t.length - 1].result.output.join("\n")).toMatch(/Received = 0/);
    expect((broken.state.ops.adapters as Record<string, Json>)["pc3/eth0"]).toMatchObject({ status: "apipa" });
    const fixed = run(c, [...wrong, ...dhcpPool, ...rt("r1", ...CONF, "interface g0/0.20", "encapsulation dot1Q 20", "end"), ...host("pc1", "ping 192.168.20.12")]);
    const f = fixed.transcripts.pc1; expect(f[f.length - 1].result.output.join("\n")).toMatch(/Received = 4/);
    expect((fixed.state.ops.adapters as Record<string, Json>)["pc3/eth0"]).toMatchObject({ status: "dhcp" });
  });
  it("Capstone — VLANs, trunks (native 99, allowed list), RoaS, DHCP, VTP, Port Security, passwords, WPA2, wireless DHCP, DNS + HTTP: full marks", () => {
    const c = cfgOf("capstone");
    const r = run(c, CAPSTONE_SOLUTION);
    const a = r.state.ops.adapters as Record<string, Json>;
    expect(a["pcstudent/eth0"]).toMatchObject({ status: "dhcp", address: "192.168.20.11" });                          // on VLAN 20 before the laptop joins: keeps its lease
    expect(a["lap1/wlan0"]).toMatchObject({ status: "dhcp", address: "192.168.20.12", gateway: "192.168.20.1", dns: "192.168.50.10" });
    expect(a["pcstaff/eth0"]).toMatchObject({ status: "dhcp", address: "192.168.10.11" });
    expect((r.state.ops.vtp as Record<string, { vlans: number[] }>).sw2.vlans).toEqual([1, 10, 20, 50, 99]);
    const t = r.transcripts.lap1; expect(t[t.length - 1].result.output.join("\n")).toMatch(/HTTP\/1\.1 200 OK/);
    expect(canReachNet2(c, r.state as never, "pcstaff", "srv1").reachable).toBe(true);
    expect(canReachNet2(c, r.state as never, "lap1", "pcstaff").reachable).toBe(true);
    expect(full("capstone", CAPSTONE_SOLUTION)).toMatchObject({ correct: true, valid: true });
    const noDns = run(c, [...CAPSTONE_SOLUTION.slice(0, -1), { type: "server.setDns", deviceId: "srv1", enabled: false, records: [] }, { type: "host.browse", deviceId: "lap1", url: "http://server.school.local" }]);
    const n = noDns.transcripts.lap1; expect(n[n.length - 1].result.output.join("\n")).toMatch(/Host Name Unresolved/);
    expect(JSON.stringify(run(c, CAPSTONE_SOLUTION).state)).toBe(JSON.stringify(r.state));                    // deterministic replay
    expect(JSON.stringify(r.state).length).toBeLessThan(65536);                                                     // bounded canonical state
  });
});

function routerTwoV1() {
  return { v: 1, devices: [{ id: "r1", kind: "router", label: "R1", x: 0.5, y: 0.1 }, { id: "pc1", kind: "pc", label: "PC1", x: 0.5, y: 0.9 }], links: [{ id: "l1", a: { deviceId: "r1", port: "g0/0" }, b: { deviceId: "pc1", port: "eth0" } }] };
}
