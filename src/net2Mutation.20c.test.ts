import { describe, it, expect } from "vitest";
import { validateNet2Config, deriveMac } from "./net2Model";
import { replayNet2, replayNet2Cached, canReachNet2, normalizeNet2Action, type Net2ReplayCache } from "./net2Plugin";
import { evaluateSmartSim } from "./trustedSimPlugins";
import { net2TemplateById } from "./networkTopology2/net2Templates";

// Phase 20C — STRENGTHENING tests written after mutation campaign round 1 (they are NOT fail-first: each pins behaviour the engines
// already had, and kills a surviving mutant that the earlier suites could not observe — asymmetric trunks, MAC / ARP learning
// contents, one-way failures, isolation / browse checks with `value: false`, secret masking, review details, cache divergence).
type Json = Record<string, unknown>;
const dev = (id: string, kind: string, extra: Json = {}) => ({ id, kind, label: id.toUpperCase(), x: 0.5, y: 0.5, ...extra });
const link = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp } });
const cfg = (devices: Json[], links: Json[]) => { const r = validateNet2Config({ v: 2, devices, links }); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.config; };
const sw = (id: string, ...c: string[]) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id: string, ...c: string[]) => c.map(command => ({ type: "router.command", deviceId: id, command }));
const host = (id: string, ...c: string[]) => c.map(command => ({ type: "host.command", deviceId: id, command }));
const ip = (id: string, address: string, mask = "255.255.255.0", gateway = "", adapter = "eth0") => ({ type: "host.setStatic", deviceId: id, adapter, address, mask, gateway, dns: "" });
const dhcp = (id: string, adapter = "eth0") => ({ type: "host.setMode", deviceId: id, adapter, mode: "dhcp" });
type R = { ok: true; state: { devices: Record<string, Json>; ops: { adapters: Record<string, Json>; macTables: Record<string, { mac: string; port: string; vlan: number }[]>; portSecurity: Record<string, Json>; arp: Record<string, Json[]>; wifi: Record<string, Json> } }; transcripts: Record<string, { input: string; result: { status: string; output: string[] } }[]> };
const run = (c: ReturnType<typeof cfg>, actions: unknown[]): R => { const r = replayNet2(c, actions); if (!r.ok) throw new Error(r.code); return r as unknown as R; };
const text = (r: R, id: string) => { const t = r.transcripts[id]; return t[t.length - 1].result.output.join("\n"); };
const macs = (r: R, s: string) => (r.state.ops.macTables[s] ?? []).map(e => e.mac);
const reach = (c: ReturnType<typeof cfg>, r: R, a: string, b: string) => canReachNet2(c, r.state as never, a, b);
const CONF = ["enable", "configure terminal"];
const TWO = () => cfg([dev("sw1", "switch"), dev("sw2", "switch"), dev("pc1", "pc"), dev("pc2", "pc")], [link("t1", "sw1", "g0/1", "sw2", "g0/1"), link("l1", "sw1", "f0/1", "pc1", "eth0"), link("l2", "sw2", "f0/1", "pc2", "eth0")]);
const LAN = () => cfg([dev("sw1", "switch"), dev("pc1", "pc"), dev("pc2", "pc"), dev("pc3", "pc")], [link("l1", "sw1", "f0/1", "pc1", "eth0"), link("l2", "sw1", "f0/2", "pc2", "eth0"), link("l3", "sw1", "f0/3", "pc3", "eth0")]);
const LAN_IPS = [ip("pc1", "10.0.0.1"), ip("pc2", "10.0.0.2"), ip("pc3", "10.0.0.3")];
const MAC = (id: string) => deriveMac(id, "eth0");

describe("20C-MS — L2 forwarding observed through MAC learning (asymmetric configurations)", () => {
  const vlan30 = (id: string) => sw(id, ...CONF, "vlan 30", "interface f0/1", "switchport mode access", "switchport access vlan 30", "interface g0/1", "switchport mode trunk", "end");
  it("a trunk's allowed list filters BOTH egress and ingress (the restricted side neither sends nor accepts VLAN 30)", () => {
    const base = [ip("pc1", "10.30.0.1"), ip("pc2", "10.30.0.2"), ...vlan30("sw1"), ...vlan30("sw2"), ...sw("sw1", ...CONF, "interface g0/1", "switchport trunk allowed vlan 10,20", "end")];
    const out = run(TWO(), [...base, ...host("pc1", "ping 10.30.0.2")]);
    expect(macs(out, "sw2")).not.toContain(MAC("pc1"));                                                 // sw1 egress refused VLAN 30
    const inn = run(TWO(), [...base, ...host("pc2", "ping 10.30.0.1")]);
    expect(macs(inn, "sw2")).toContain(MAC("pc2"));
    expect(macs(inn, "sw1")).not.toContain(MAC("pc2"));                                                 // sw1 ingress refused VLAN 30
  });
  it("an access port drops tagged frames (a trunk facing an access port does not leak a tagged VLAN into the access VLAN)", () => {
    const r = run(TWO(), [ip("pc1", "10.30.0.1"), ip("pc2", "10.30.0.2"), ...vlan30("sw1"), ...sw("sw2", ...CONF, "interface g0/1", "switchport mode access", "end"), ...host("pc1", "ping 10.30.0.2")]);
    expect(macs(r, "sw2")).not.toContain(MAC("pc1"));
    expect(text(r, "pc1")).toMatch(/Received = 0/);
  });
  it("a unicast reply is learned only along its path; a broadcast is learned everywhere it reached", () => {
    // pc2's own mask puts pc1 off-subnet: pc2 answers pc1's ARP (unicast) but never broadcasts for the echo reply
    const c = cfg([dev("sw1", "switch"), dev("sw2", "switch"), dev("sw3", "switch"), dev("pc1", "pc"), dev("pc2", "pc")],
      [link("a", "sw1", "g0/1", "sw2", "g0/1"), link("b", "sw2", "g0/2", "sw3", "g0/1"), link("p1", "sw1", "f0/1", "pc1", "eth0"), link("p2", "sw2", "f0/1", "pc2", "eth0")]);
    const r = run(c, [ip("pc1", "10.0.0.5"), ip("pc2", "10.0.0.2", "255.255.255.252"), ...host("pc1", "ping 10.0.0.2")]);
    expect(text(r, "pc1")).toMatch(/Received = 0/);
    expect(macs(r, "sw3")).toContain(MAC("pc1"));                                                       // pc1's ARP broadcast
    expect(macs(r, "sw3")).not.toContain(MAC("pc2"));                                                   // pc2's unicast ARP reply never went there
    expect(macs(r, "sw1")).toContain(MAC("pc2"));
  });
  it("a switch port facing a router interface that is still shut down is down (show ip interface brief)", () => {
    const c = cfg([dev("r1", "router"), dev("sw1", "switch"), dev("pc1", "pc")], [link("u", "r1", "g0/0", "sw1", "g0/1"), link("p", "r1", "g0/1", "pc1", "eth0")]);
    const r = run(c, [ip("pc1", "10.0.0.1"), ...sw("sw1", "enable", "show ip interface brief"), ...host("pc1", "ipconfig")]);
    expect(text(r, "sw1")).toMatch(/^GigabitEthernet0\/1\s+unassigned\s+YES unset\s+down\s+down$/m);
    expect(text(r, "pc1")).toMatch(/Media disconnected/);
  });
});

describe("20C-MP — Port Security consequences", () => {
  const ps = (...lines: string[]) => sw("sw1", ...CONF, "interface f0/2", "switchport mode access", ...lines, "end");
  it("err-disable is a link-down: once a second MAC violates behind an AP, the already-secure laptop is cut off too; its MAC entry is flushed", () => {
    const c = cfg([dev("sw1", "switch"), dev("ap1", "ap", { initial: { v: 2, device: "ap", enabled: true, ssid: "LAB", security: "open", passphrase: "" } }), dev("pc1", "pc"), dev("l1", "laptop"), dev("l2", "laptop")],
      [link("a", "sw1", "f0/2", "ap1", "eth0"), link("p", "sw1", "f0/1", "pc1", "eth0")]);
    const wifi = (id: string, address: string) => [{ type: "host.wifiConnect", deviceId: id, ssid: "LAB", passphrase: "" }, ip(id, address, "255.255.255.0", "", "wlan0")];
    const before = run(c, [ip("pc1", "10.0.0.1"), ...wifi("l1", "10.0.0.11"), ...wifi("l2", "10.0.0.12"), ...ps("switchport port-security"), ...host("l1", "ping 10.0.0.1")]);
    expect(reach(c, before, "l1", "pc1").reachable).toBe(true);
    expect((before.state.ops.macTables.sw1 ?? []).some(e => e.port === "f0/2")).toBe(true);
    const after = run(c, [ip("pc1", "10.0.0.1"), ...wifi("l1", "10.0.0.11"), ...wifi("l2", "10.0.0.12"), ...ps("switchport port-security"), ...host("l1", "ping 10.0.0.1", "ping 10.0.0.1"), ...host("l2", "ping 10.0.0.1"), ...host("l1", "ping 10.0.0.1")]);
    expect(text(after, "l1")).toMatch(/Received = 0/);
    expect(reach(c, after, "l1", "pc1").reachable).toBe(false);
    expect((after.state.ops.macTables.sw1 ?? []).some(e => e.port === "f0/2")).toBe(false);
  });
  it("restrict: a recorded violator stays refused on every later frame (never admitted once known)", () => {
    const r = run(LAN(), [...LAN_IPS, ...ps("switchport port-security", "switchport port-security mac-address 0200.dead.beef", "switchport port-security violation restrict"), ...host("pc2", "ping 10.0.0.1", "ping 10.0.0.1")]);
    expect(text(r, "pc2")).toMatch(/Received = 0/);
    expect(r.state.ops.portSecurity["sw1|f0/2"]).toMatchObject({ violations: 1, errDisabled: false });
  });
  it("a pure reachability probe never counts an unseen MAC as secure when the port has no free secure slot", () => {
    const r = run(LAN(), [...LAN_IPS, ...ps("switchport port-security", "switchport port-security mac-address 0200.dead.beef")]);
    expect(reach(LAN(), r, "pc2", "pc1")).toMatchObject({ reachable: false });
    expect(reach(LAN(), r, "pc3", "pc1")).toMatchObject({ reachable: true });
  });
  it("port security (incl. sticky) is refused on a dynamic port", () => {
    const r = run(LAN(), sw("sw1", ...CONF, "interface f0/3", "switchport port-security mac-address sticky", "switchport port-security maximum 2"));
    expect(r.transcripts.sw1.slice(-2).map(e => e.result.status)).toEqual(["invalid", "invalid"]);
    expect((r.state.devices.sw1 as { interfaces: Json }).interfaces["f0/3"]).toBeUndefined();
  });
});

describe("20C-MV — VTP, DHCP, APIPA", () => {
  it("an empty VTP domain never synchronises (client and server both without a domain)", () => {
    const r = run(TWO(), [...sw("sw1", ...CONF, "interface g0/1", "switchport mode trunk", "exit", "vlan 30", "end"), ...sw("sw2", ...CONF, "interface g0/1", "switchport mode trunk", "exit", "vtp mode client", "end")]);
    expect((r.state.ops as unknown as { vtp: Record<string, { vlans: number[]; source: unknown }> }).vtp.sw2).toMatchObject({ vlans: [1], source: null });
  });
  const SRV = () => cfg([dev("sw1", "switch"), dev("srv", "server", { initial: { v: 2, device: "host", adapters: { eth0: { mode: "static", address: "10.0.0.10", mask: "255.255.255.0" } } } }), dev("pc1", "pc"), dev("pc2", "pc")],
    [link("s", "sw1", "f0/5", "srv", "eth0"), link("a", "sw1", "f0/1", "pc1", "eth0"), link("b", "sw1", "f0/2", "pc2", "eth0")]);
  const pool = (enabled: boolean) => ({ type: "server.setDhcp", deviceId: "srv", enabled, pool: { defaultRouter: "", dns: "", start: "10.0.0.100", mask: "255.255.255.0", max: 10 } });
  it("a server's DHCP service answers only when enabled", () => {
    expect(run(SRV(), [pool(true), dhcp("pc1")]).state.ops.adapters["pc1/eth0"]).toMatchObject({ status: "dhcp", address: "10.0.0.100", dhcpServer: "10.0.0.10" });
    expect(run(SRV(), [pool(false), dhcp("pc1")]).state.ops.adapters["pc1/eth0"]).toMatchObject({ status: "apipa" });
  });
  it("a DHCP OFFER needs a working return path: the server's own frames blocked by Port Security ⇒ no lease", () => {
    const block = sw("sw1", ...CONF, "interface f0/5", "switchport mode access", "switchport port-security", "switchport port-security mac-address 0200.dead.beef", "switchport port-security violation restrict", "end");
    expect(run(SRV(), [...block, pool(true), dhcp("pc1")]).state.ops.adapters["pc1/eth0"]).toMatchObject({ status: "apipa" });
  });
  it("ARP needs the owner's reply: a one-way failure learns nothing", () => {
    const block = sw("sw1", ...CONF, "interface f0/5", "switchport mode access", "switchport port-security", "switchport port-security mac-address 0200.dead.beef", "switchport port-security violation restrict", "end");
    const r = run(SRV(), [...block, ip("pc1", "10.0.0.1"), ...host("pc1", "ping 10.0.0.10", "arp -a")]);
    expect(r.transcripts.pc1[0].result.output.join("\n")).toMatch(/Received = 0/);
    expect(text(r, "pc1")).toMatch(/No ARP Entries Found/);
  });
  it("APIPA is derived from the MAC: the same host gets the same address in another topology, two hosts get different ones", () => {
    const one = (id: string) => (run(cfg([dev("sw1", "switch"), dev(id, "pc")], [link("a", "sw1", "f0/1", id, "eth0")]), [dhcp(id)]).state.ops.adapters[id + "/eth0"] as { address: string }).address;
    expect(one("pc1")).toBe((run(LAN(), [dhcp("pc1")]).state.ops.adapters["pc1/eth0"] as { address: string }).address);
    expect(one("pc1")).not.toBe(one("pc2"));
  });
  it("a violation during lease negotiation takes effect in the same reconcile (second round): the AP uplink is err-disabled, no laptop keeps a lease", () => {
    const c = cfg([dev("r1", "router"), dev("sw1", "switch"), dev("ap1", "ap", { initial: { v: 2, device: "ap", enabled: true, ssid: "LAB", security: "open", passphrase: "" } }), dev("l1", "laptop"), dev("l2", "laptop")],
      [link("u", "r1", "g0/0", "sw1", "g0/1"), link("a", "sw1", "f0/2", "ap1", "eth0")]);
    const r = run(c, [...rt("r1", ...CONF, "interface g0/0", "ip address 10.0.0.1 255.255.255.0", "no shutdown", "ip dhcp pool P", "network 10.0.0.0 255.255.255.0", "end"),
      ...sw("sw1", ...CONF, "interface f0/2", "switchport mode access", "switchport port-security", "end"),
      dhcp("l1", "wlan0"), dhcp("l2", "wlan0"), { type: "host.wifiConnect", deviceId: "l1", ssid: "LAB", passphrase: "" }, { type: "host.wifiConnect", deviceId: "l2", ssid: "LAB", passphrase: "" }]);
    expect(r.state.ops.portSecurity["sw1|f0/2"]).toMatchObject({ errDisabled: true });
    expect(r.state.ops.adapters["l1/wlan0"]).toMatchObject({ status: "apipa" });
    expect(r.state.ops.adapters["l2/wlan0"]).toMatchObject({ status: "apipa" });
  });
});

describe("20C-ML — L3 edge cases", () => {
  it("off-subnet without a default gateway fails cleanly (no routing by magic)", () => {
    const r = run(LAN(), [...LAN_IPS, ...host("pc1", "ping 10.9.9.9")]);
    expect(text(r, "pc1")).toMatch(/Received = 0/);
  });
  it("only a router routes: a switch SVI as default gateway does not forward between VLANs", () => {
    const c = cfg([dev("sw1", "switch"), dev("pc1", "pc")], [link("a", "sw1", "f0/1", "pc1", "eth0")]);
    const r = run(c, [ip("pc1", "10.0.0.1", "255.255.255.0", "10.0.0.250"), ...sw("sw1", ...CONF, "vlan 10", "interface vlan 1", "ip address 10.0.0.250 255.255.255.0", "no shutdown", "interface vlan 10", "ip address 10.10.0.250 255.255.255.0", "no shutdown", "end"), ...host("pc1", "ping 10.10.0.250")]);
    expect(text(r, "pc1")).toMatch(/Received = 0/);
    expect(reach(c, r, "pc1", "sw1")).toMatchObject({ reachable: true });                                 // its own VLAN's SVI answers
    // a host in VLAN 10 using the VLAN 10 SVI as its gateway: the L2 switch never routes between the two VLANs
    const c2 = cfg([dev("sw1", "switch"), dev("pc1", "pc"), dev("pc2", "pc")], [link("a", "sw1", "f0/1", "pc1", "eth0"), link("b", "sw1", "f0/2", "pc2", "eth0")]);
    const r2 = run(c2, [ip("pc1", "10.0.0.1", "255.255.255.0", "10.0.0.250"), ip("pc2", "10.10.0.2", "255.255.255.0", "10.10.0.250"),
      ...sw("sw1", ...CONF, "vlan 10", "interface f0/2", "switchport mode access", "switchport access vlan 10", "interface vlan 1", "ip address 10.0.0.250 255.255.255.0", "no shutdown", "interface vlan 10", "ip address 10.10.0.250 255.255.255.0", "no shutdown", "end")]);
    expect(reach(c2, r2, "pc1", "pc2")).toMatchObject({ reachable: false, reason: "GATEWAY_NOT_ROUTER" });
  });
  it("the reply leg is real: a destination whose own mask puts the source off-subnet (no gateway) never answers", () => {
    const r = run(LAN(), [ip("pc1", "10.0.0.5"), ip("pc2", "10.0.0.2", "255.255.255.252"), ...host("pc1", "ping 10.0.0.2")]);
    expect(text(r, "pc1")).toMatch(/Received = 0/);
    expect(reach(LAN(), r, "pc1", "pc2")).toMatchObject({ reachable: false, reason: "REPLY_FAILED" });
  });
  it("arp -a holds exactly what was resolved (one entry after one successful ping)", () => {
    const r = run(LAN(), [...LAN_IPS, ...host("pc1", "ping 10.0.0.2", "arp -a")]);
    expect(text(r, "pc1").split("\n").filter(l => /dynamic$/.test(l))).toHaveLength(1);
  });
  it("a router answers for its far interface directly (TTL 255, one tracert hop)", () => {
    const t = net2TemplateById("roas")!; const c = validateNet2Config(t.config()); if (!c.ok) throw new Error("cfg");
    const sol = [...sw("sw1", ...CONF, "vlan 10", "vlan 20", "interface f0/1", "switchport mode access", "switchport access vlan 10", "interface g0/1", "switchport mode trunk", "end"),
      ...rt("r1", ...CONF, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1Q 20", "ip address 192.168.20.1 255.255.255.0", "end")];
    const r = run(c.config, [...sol, ...host("pc1", "ping 192.168.20.1", "tracert 192.168.20.1")]);
    const tr = r.transcripts.pc1;
    expect(tr[tr.length - 2].result.output.join("\n")).toMatch(/Reply from 192\.168\.20\.1: bytes=32 time<1ms TTL=255/);
    expect(text(r, "pc1")).toMatch(/^\s+1\s+0 ms\s+0 ms\s+0 ms\s+192\.168\.20\.1$/m);
    expect(text(r, "pc1")).not.toMatch(/^\s+2\s/m);
  });
});

describe("20C-MH — Command Prompt grammar, services, normalizer", () => {
  it("shell metacharacters are refused before parsing (status unknown), extra words are invalid", () => {
    const r = run(LAN(), [...LAN_IPS, ...host("pc1", "ipconfig /all&", "ping 10.0.0.2;", "ping 10.0.0.2 -t", "help|x")]);
    expect(r.transcripts.pc1.map(e => e.result.status)).toEqual(["unknown", "unknown", "invalid", "unknown"]);
    expect(r.transcripts.pc1[2].result.output.join(" ")).not.toMatch(/Reply/);
  });
  const CAP = () => { const c = validateNet2Config(net2TemplateById("capstone")!.config()); if (!c.ok) throw new Error("cfg"); return c.config; };
  it("DNS answers only while the service is enabled (records kept); HTTP needs real reachability", () => {
    const off = { type: "server.setDns", deviceId: "srv1", enabled: false, records: [{ name: "server.school.local", address: "192.168.50.10" }] };
    const s = ip("pcstaff", "192.168.50.20", "255.255.255.0", "", "eth0");
    const withDns = { ...s, dns: "192.168.50.10" };
    const sw1 = sw("sw1", ...CONF, "vlan 50", "interface f0/1", "switchport mode access", "switchport access vlan 50", "interface g0/2", "switchport mode trunk", "end");
    const sw2 = sw("sw2", ...CONF, "vlan 50", "interface f0/5", "switchport mode access", "switchport access vlan 50", "interface g0/1", "switchport mode trunk", "end");
    const ok = run(CAP(), [withDns, ...sw1, ...sw2, ...host("pcstaff", "nslookup server.school.local")]);
    expect(text(ok, "pcstaff")).toMatch(/Address:\s+192\.168\.50\.10$/m);
    const disabled = run(CAP(), [withDns, ...sw1, ...sw2, off, ...host("pcstaff", "nslookup server.school.local")]);
    expect(text(disabled, "pcstaff")).toMatch(/timed out/);
    const noPath = run(CAP(), [s, ...sw("sw1", ...CONF, "interface g0/2", "shutdown", "end"), { type: "host.browse", deviceId: "pcstaff", url: "http://192.168.50.10" }]);
    expect(text(noPath, "pcstaff")).toMatch(/Request Timeout/);
    const path = run(CAP(), [s, ...sw1, ...sw2, { type: "host.browse", deviceId: "pcstaff", url: "http://192.168.50.10" }]);
    expect(text(path, "pcstaff")).toMatch(/HTTP\/1\.1 200 OK/);
  });
  it("the normalizer binds CLI actions to their device kind and the browser to http:// URLs only", () => {
    const c = CAP();
    expect(normalizeNet2Action({ type: "switch.command", deviceId: "r1", command: "enable" }, c).ok).toBe(false);
    expect(normalizeNet2Action({ type: "router.command", deviceId: "sw1", command: "enable" }, c).ok).toBe(false);
    for (const url of ["javascript:alert(1)", "https://server.school.local", "file:///etc/passwd", "http://evil.example.com/<script>", "ftp://x", "http://"])
      expect(normalizeNet2Action({ type: "host.browse", deviceId: "lap1", url }, c).ok, url).toBe(false);
  });
});

describe("20C-MK — checks, secrecy, review details, canonical state, view cache", () => {
  const t = net2TemplateById("capstone")!;
  const env = { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config: t.config() };
  const grade = (checks: Json[], actions: unknown[]) => evaluateSmartSim({ envelope: env, answerKey: { scoring: "proportional", checks }, response: { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, actions, state: {} }, maxMarks: checks.length }, { withDetails: true });
  it("isolation (value false) and 'no page' (value false) checks pass exactly when the network is isolated", () => {
    const r = grade([{ id: "a", label: "a", weight: 1, kind: "reachability", source: "pcstaff", destination: "srv1", value: false }, { id: "b", label: "b", weight: 1, kind: "browse", source: "lap1", url: "http://server.school.local", value: false }], []);
    expect(r).toMatchObject({ valid: true, score: 2 });
  });
  it("wifiAssociated fails on an authentication failure; allowedVlans compares the canonical compressed list", () => {
    const r = grade([{ id: "w", label: "w", weight: 1, kind: "host.wifiAssociated", deviceId: "lap1", value: true }, { id: "v", label: "v", weight: 1, kind: "switch.allowedVlans", deviceId: "sw1", interface: "g0/1", value: "10,20,30-32" }],
      [{ type: "ap.set", deviceId: "ap1", field: "security", value: "wpa2" }, { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "Exam2026!" }, { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL-WIFI", passphrase: "wrong-pass" },
        ...sw("sw1", ...CONF, "interface g0/1", "switchport mode trunk", "switchport trunk allowed vlan 10,20,30,31,32")]);
    expect(r.checks.map(c => c.passed)).toEqual([false, true]);
  });
  it("secret values never appear in evaluation facts (expected or actual); review details expose per-device transcripts", () => {
    const r = grade([{ id: "s", label: "s", weight: 1, kind: "switch.enableSecret", deviceId: "sw1", value: "TopSecret9" }, { id: "p", label: "p", weight: 1, kind: "ap.passphrase", deviceId: "ap1", value: "Exam2026!" }],
      [...sw("sw1", ...CONF, "enable secret Wrong5555"), { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "Other2026!" }]);
    expect(JSON.stringify(r.checks)).not.toMatch(/TopSecret9|Exam2026!|Wrong5555|Other2026!/);
    expect(r.checks.map(c => c.passed)).toEqual([false, false]);
    expect((r.details as { transcripts: Record<string, unknown[]> }).transcripts.sw1).toHaveLength(3);
  });
  it("the canonical state is exactly { v, devices, ops } (no runtime sessions)", () => {
    const c = validateNet2Config(t.config()); if (!c.ok) throw new Error("cfg");
    const r = run(c.config, sw("sw1", ...CONF, "interface f0/1"));
    expect(Object.keys(r.state).sort()).toEqual(["devices", "ops", "v"]);
    expect(Object.keys(r.state.ops).sort()).toEqual(["adapters", "arp", "dhcpBindings", "macTables", "portSecurity", "vtp", "wifi"]);
  });
  it("the view cache never resumes from a divergent prefix of the same length or longer", () => {
    const c = validateNet2Config(net2TemplateById("roas")!.config()); if (!c.ok) throw new Error("cfg");
    const a = sw("sw1", ...CONF, "hostname A"), b = [...sw("sw1", ...CONF, "hostname B"), ...sw("sw1", "end")];
    const first = replayNet2Cached(c.config, a);
    const second = replayNet2Cached(c.config, b, first.cache as Net2ReplayCache);
    expect(JSON.stringify(second.replay)).toBe(JSON.stringify(replayNet2(c.config, b)));
  });
});
