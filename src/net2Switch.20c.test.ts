import { describe, it, expect } from "vitest";
import { validateNet2Config, deriveMac } from "./net2Model";
import { replayNet2, canReachNet2 } from "./net2Plugin";

// Phase 20C — networkTopology@2 SWITCH CLI v2 (S1–S25), trunk allowed-VLAN forwarding, VTP and Port Security. Behavioural tests on the
// exact v2 contract: every command is replayed through the plugin (the same code the server grades with) and its effect is observed in
// the canonical state, in show-command output and — crucially — in simulated forwarding. New-function tests (fail-first on 686afbc).
type Json = Record<string, unknown>;
const dev = (id: string, kind: string, extra: Json = {}) => ({ id, kind, label: id.toUpperCase(), x: 0.5, y: 0.5, ...extra });
const link = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp } });
const cfg = (devices: Json[], links: Json[]) => { const r = validateNet2Config({ v: 2, devices, links }); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.config; };
const sw = (id: string, ...c: string[]) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
const host = (id: string, ...c: string[]) => c.map(command => ({ type: "host.command", deviceId: id, command }));
const ip = (id: string, address: string, mask = "255.255.255.0", gateway = "", dns = "") => ({ type: "host.setStatic", deviceId: id, adapter: "eth0", address, mask, gateway, dns });
type R = { ok: true; state: { devices: Record<string, Json>; ops: Json }; transcripts: Record<string, { input: string; result: { status: string; output: string[] } }[]> };
function run(c: ReturnType<typeof cfg>, actions: unknown[]): R { const r = replayNet2(c, actions); if (!r.ok) throw new Error(r.code); return r as unknown as R; }
const last = (r: R, id: string) => { const t = r.transcripts[id]; return t[t.length - 1].result; };
const text = (r: R, id: string) => last(r, id).output.join("\n");
const swState = (r: R, id = "sw1") => r.state.devices[id] as { hostname: string; vlans: Record<string, { name?: string }>; interfaces: Record<string, Json>; vtp: Json; security: Json };
const reach = (c: ReturnType<typeof cfg>, r: R, a: string, b: string) => canReachNet2(c, r.state as never, a, b).reachable;
// one switch, three PCs
const LAN = () => cfg([dev("sw1", "switch"), dev("pc1", "pc"), dev("pc2", "pc"), dev("pc3", "pc")], [link("l1", "sw1", "f0/1", "pc1", "eth0"), link("l2", "sw1", "f0/2", "pc2", "eth0"), link("l3", "sw1", "f0/3", "pc3", "eth0")]);
const LAN_IPS = [ip("pc1", "10.0.0.1"), ip("pc2", "10.0.0.2"), ip("pc3", "10.0.0.3")];
// two switches joined by a trunk, one PC on each
const TWO = () => cfg([dev("sw1", "switch"), dev("sw2", "switch"), dev("pc1", "pc"), dev("pc2", "pc")], [link("t1", "sw1", "g0/1", "sw2", "g0/1"), link("l1", "sw1", "f0/1", "pc1", "eth0"), link("l2", "sw2", "f0/1", "pc2", "eth0")]);
const TWO_IPS = [ip("pc1", "10.30.0.1"), ip("pc2", "10.30.0.2")];
const CONF = ["enable", "configure terminal"];

describe("S1–S13 / S23 — VLANs, access ports, trunks, SVI, hostname", () => {
  it("S1 / S23 hostname, VLAN create and name; show vlan brief lists them with their access ports", () => {
    const r = run(LAN(), sw("sw1", ...CONF, "hostname CORE-SW", "vlan 10", "name STAFF", "vlan 20", "name STUDENTS", "interface f0/1", "switchport mode access", "switchport access vlan 10", "end", "show vlan brief"));
    expect(swState(r).hostname).toBe("CORE-SW");
    expect(swState(r).vlans).toMatchObject({ "10": { name: "STAFF" }, "20": { name: "STUDENTS" } });
    const out = text(r, "sw1");
    expect(out).toMatch(/^10\s+STAFF\s+active\s+Fa0\/1$/m);
    expect(out).toMatch(/^20\s+STUDENTS\s+active$/m);
    expect(out).toMatch(/^1\s+default\s+active\s+Fa0\/2, Fa0\/3/m);
  });
  it("S2 / S3 access mode + access VLAN separate hosts at layer 2 (same subnet, different VLANs ⇒ no reachability)", () => {
    const same = run(LAN(), LAN_IPS);
    expect(reach(LAN(), same, "pc1", "pc2")).toBe(true);
    const split = run(LAN(), [...LAN_IPS, ...sw("sw1", ...CONF, "vlan 10", "interface f0/1", "switchport mode access", "switchport access vlan 10")]);
    expect(reach(LAN(), split, "pc1", "pc2")).toBe(false);
    expect(reach(LAN(), split, "pc2", "pc3")).toBe(true);
  });
  it("S4 / S5 / S6 trunk with native VLAN and an allowed list; show interfaces trunk reports all three", () => {
    const r = run(TWO(), [...TWO_IPS, ...sw("sw1", ...CONF, "vlan 30", "vlan 99", "interface g0/1", "switchport mode trunk", "switchport trunk native vlan 99", "switchport trunk allowed vlan 30,99", "end", "show interfaces trunk")]);
    expect(swState(r).interfaces["g0/1"]).toMatchObject({ mode: "trunk", nativeVlan: 99, allowed: [30, 99] });
    const out = text(r, "sw1");
    expect(out).toMatch(/^Gi0\/1\s+on\s+802\.1q\s+trunking\s+99$/m);
    expect(out).toMatch(/Vlans allowed on trunk\nGi0\/1\s+30,99/);
  });
  it("S7 allowed add / remove / all; ranges are expanded and the list stays canonical", () => {
    const r = run(TWO(), sw("sw1", ...CONF, "interface g0/1", "switchport mode trunk", "switchport trunk allowed vlan 10,20,30-32", "switchport trunk allowed vlan add 40", "switchport trunk allowed vlan remove 20,31"));
    expect(swState(r).interfaces["g0/1"].allowed).toEqual([10, 30, 32, 40]);
    const all = run(TWO(), sw("sw1", ...CONF, "interface g0/1", "switchport mode trunk", "switchport trunk allowed vlan 10", "switchport trunk allowed vlan all"));
    expect(swState(all).interfaces["g0/1"].allowed).toBeUndefined();
    const bad = run(TWO(), sw("sw1", ...CONF, "interface g0/1", "switchport trunk allowed vlan 10,abc", "switchport trunk allowed vlan 5000", "switchport trunk allowed vlan 30-20"));
    expect(r.transcripts.sw1.length).toBeGreaterThan(0);
    expect(bad.transcripts.sw1.slice(-3).map(e => e.result.status)).toEqual(["invalid", "invalid", "invalid"]);
    expect(swState(bad).interfaces["g0/1"]?.allowed).toBeUndefined();
  });
  it("S8 the allowed list REALLY filters forwarding: VLAN 30 missing from the trunk breaks the path; adding it repairs it", () => {
    const base = [...TWO_IPS, ...sw("sw1", ...CONF, "vlan 30", "interface f0/1", "switchport mode access", "switchport access vlan 30", "interface g0/1", "switchport mode trunk"),
      ...sw("sw2", ...CONF, "vlan 30", "interface f0/1", "switchport mode access", "switchport access vlan 30", "interface g0/1", "switchport mode trunk")];
    expect(reach(TWO(), run(TWO(), base), "pc1", "pc2")).toBe(true);
    const blocked = [...base, ...sw("sw1", "switchport trunk allowed vlan 10,20")];
    const rb = run(TWO(), [...blocked, ...sw("sw1", "end", "show running-config")]);
    expect(text(rb, "sw1")).toMatch(/switchport trunk allowed vlan 10,20/);
    expect(reach(TWO(), rb, "pc1", "pc2")).toBe(false);
    expect(reach(TWO(), run(TWO(), [...blocked, ...sw("sw1", "switchport trunk allowed vlan add 30")]), "pc1", "pc2")).toBe(true);
  });
  it("S5 a native-VLAN mismatch carries untagged traffic into the peer's native VLAN (modelled, not hidden)", () => {
    const r = run(TWO(), [...TWO_IPS, ...sw("sw1", ...CONF, "vlan 30", "interface f0/1", "switchport access vlan 30", "interface g0/1", "switchport mode trunk", "switchport trunk native vlan 30"),
      ...sw("sw2", ...CONF, "interface g0/1", "switchport mode trunk")]);
    expect(reach(TWO(), r, "pc1", "pc2")).toBe(true);                              // sw1 VLAN 30 untagged ⇒ sw2 native VLAN 1 ⇒ pc2 (VLAN 1)
  });
  it("S11 show interfaces switchport reports administrative / operational mode, access and native VLAN, trunking VLANs", () => {
    const r = run(TWO(), sw("sw1", ...CONF, "interface g0/1", "switchport mode trunk", "switchport trunk allowed vlan 10,20", "interface f0/1", "switchport mode access", "switchport access vlan 10", "end", "show interfaces f0/1 switchport", "show interfaces g0/1 switchport"));
    const t = r.transcripts.sw1;
    const access = t[t.length - 2].result.output.join("\n"), trunk = t[t.length - 1].result.output.join("\n");
    expect(access).toMatch(/Name: Fa0\/1/); expect(access).toMatch(/Administrative Mode: static access/); expect(access).toMatch(/Access Mode VLAN: 10/);
    expect(trunk).toMatch(/Administrative Mode: trunk/); expect(trunk).toMatch(/Operational Mode: trunk/); expect(trunk).toMatch(/Trunking VLANs Enabled: 10,20/);
  });
  it("S12 show mac address-table lists MACs learned from REAL traffic only (ping), with VLAN and port", () => {
    const quiet = run(LAN(), [...LAN_IPS, ...sw("sw1", "enable", "show mac address-table")]);
    expect(text(quiet, "sw1")).not.toMatch(/DYNAMIC/);
    const r = run(LAN(), [...LAN_IPS, ...host("pc1", "ping 10.0.0.2"), ...sw("sw1", "enable", "show mac address-table")]);
    const out = text(r, "sw1");
    expect(out).toMatch(new RegExp("^\\s*1\\s+" + deriveMac("pc1", "eth0").replace(/\./g, "\\.") + "\\s+DYNAMIC\\s+Fa0/1$", "m"));
    expect(out).toMatch(new RegExp(deriveMac("pc2", "eth0").replace(/\./g, "\\.") + "\\s+DYNAMIC\\s+Fa0/2"));
    expect(out).not.toMatch(new RegExp(deriveMac("pc3", "eth0").replace(/\./g, "\\.")));
  });
  it("S13 an SVI with an address answers pings in its VLAN; show ip interface brief lists it", () => {
    const r = run(LAN(), [...LAN_IPS, ...sw("sw1", ...CONF, "interface vlan 1", "ip address 10.0.0.250 255.255.255.0", "no shutdown", "end", "show ip interface brief"), ...host("pc1", "ping 10.0.0.250")]);
    expect(text(r, "sw1")).toMatch(/^Vlan1\s+10\.0\.0\.250\s+YES manual up\s+up$/m);
    expect(text(r, "pc1")).toMatch(/Reply from 10\.0\.0\.250/);
  });
  it("S9 / S25 malformed and unsupported input never changes state; closed grammar (no shell semantics)", () => {
    const before = run(LAN(), []);
    const r = run(LAN(), sw("sw1", ...CONF, "hostname a;b", "vlan 0", "vlan 1002", "vlan 4095", "interface f0/99", "switchport mode dynamic desirable", "router ospf 1", "x && rm -rf /", "$(reboot)", "show running-config | include x", "a".repeat(201)));
    expect(JSON.stringify(swState(r))).toBe(JSON.stringify(swState(before)));
    expect(r.transcripts.sw1.slice(2).every(e => e.result.status !== "ok")).toBe(true);
  });
});

describe("S14–S17 — VTP (bounded educational model)", () => {
  const trunk = (id: string) => sw(id, ...CONF, "interface g0/1", "switchport mode trunk", "end");
  const vtp = (id: string, ...lines: string[]) => sw(id, ...CONF, ...lines, "end");
  it("S14 / S17 a server's VLAN reaches a client in the same domain / password / version over an operational trunk", () => {
    const r = run(TWO(), [...trunk("sw1"), ...trunk("sw2"), ...vtp("sw1", "vtp domain SCHOOL", "vtp password Vt9", "vtp version 2", "vtp mode server", "vlan 30", "name LAB"),
      ...vtp("sw2", "vtp domain SCHOOL", "vtp password Vt9", "vtp version 2", "vtp mode client"), ...sw("sw2", "show vlan brief", "show vtp status")]);
    const t = r.transcripts.sw2;
    expect(t[t.length - 2].result.output.join("\n")).toMatch(/^30\s+LAB\s+active/m);
    const status = t[t.length - 1].result.output.join("\n");
    expect(status).toMatch(/VTP Domain Name\s+: SCHOOL/); expect(status).toMatch(/VTP Operating Mode\s+: Client/); expect(status).toMatch(/Configuration Revision\s+: [1-9]/); expect(status).toMatch(/VTP version running\s+: 2/);
    expect((r.state.ops.vtp as Record<string, { source: string; vlans: number[] }>).sw2).toMatchObject({ source: "sw1", vlans: [1, 30] });
  });
  it("S16 domain, password or version mismatch — or no trunk — means no propagation", () => {
    for (const [d2, p2, v2, withTrunk] of [["OTHER", "Vt9", "2", true], ["SCHOOL", "nope", "2", true], ["SCHOOL", "Vt9", "1", true], ["SCHOOL", "Vt9", "2", false]] as const) {
      const r = run(TWO(), [...(withTrunk ? [...trunk("sw1"), ...trunk("sw2")] : []), ...vtp("sw1", "vtp domain SCHOOL", "vtp password Vt9", "vtp version 2", "vlan 30"),
        ...vtp("sw2", "vtp domain " + d2, "vtp password " + p2, "vtp version " + v2, "vtp mode client")]);
      expect((r.state.ops.vtp as Record<string, { vlans: number[] }>).sw2.vlans, [d2, p2, v2, withTrunk].join("/")).toEqual([1]);
    }
  });
  it("S15 a client cannot create VLANs locally; it mirrors the server, and a VLAN it lacks forwards nothing", () => {
    const r = run(TWO(), [...TWO_IPS, ...trunk("sw1"), ...trunk("sw2"), ...vtp("sw2", "vtp domain SCHOOL", "vtp mode client", "vlan 30"),
      ...sw("sw1", ...CONF, "interface f0/1", "switchport access vlan 30"), ...sw("sw2", ...CONF, "interface f0/1", "switchport access vlan 30")]);
    expect(r.transcripts.sw2.find(e => e.input === "vlan 30")!.result.output.join(" ")).toMatch(/CLIENT mode/);
    expect(swState(r, "sw2").vlans["30"]).toBeUndefined();
    expect(reach(TWO(), r, "pc1", "pc2")).toBe(false);                                    // sw2 has no VLAN 30 (no server in its domain)
    const fixed = run(TWO(), [...TWO_IPS, ...trunk("sw1"), ...trunk("sw2"), ...vtp("sw1", "vtp domain SCHOOL", "vlan 30"), ...vtp("sw2", "vtp domain SCHOOL", "vtp mode client"),
      ...sw("sw1", ...CONF, "interface f0/1", "switchport access vlan 30"), ...sw("sw2", ...CONF, "interface f0/1", "switchport access vlan 30")]);
    expect(reach(TWO(), fixed, "pc1", "pc2")).toBe(true);
  });
  it("S17 revision: every VLAN-database change on the server increments it; the client follows; a higher-revision client keeps its own database", () => {
    const r = run(TWO(), [...trunk("sw1"), ...trunk("sw2"), ...vtp("sw1", "vtp domain SCHOOL", "vlan 10", "vlan 20", "name B", "exit", "no vlan 10"), ...vtp("sw2", "vtp domain SCHOOL", "vtp mode client")]);
    expect((swState(r).vtp as { revision: number }).revision).toBe(4);
    expect((r.state.ops.vtp as Record<string, { revision: number; vlans: number[] }>).sw2).toMatchObject({ revision: 4, vlans: [1, 20] });
    const rogue = cfg([dev("sw1", "switch"), dev("sw2", "switch", { initial: { v: 2, device: "switch", hostname: "SW2", vlans: { "77": {} }, interfaces: { "g0/1": { mode: "trunk" } }, vtp: { mode: "client", domain: "SCHOOL", password: "", version: 1, revision: 50 }, security: {} } })],
      [link("t1", "sw1", "g0/1", "sw2", "g0/1")]);
    const rr = run(rogue, [...trunk("sw1"), ...vtp("sw1", "vtp domain SCHOOL", "vlan 10")]);
    expect((rr.state.ops.vtp as Record<string, { vlans: number[]; source: string | null }>).sw2).toMatchObject({ source: null, vlans: [1, 77] });
  });
  it("VTP is bounded: a long chain of switches converges deterministically (same result twice, no revision explosion)", () => {
    const n = 8;
    const devices = Array.from({ length: n }, (_, i) => dev("s" + i, "switch"));
    const links = Array.from({ length: n - 1 }, (_, i) => link("t" + i, "s" + i, "g0/2", "s" + (i + 1), "g0/1"));
    const c = cfg(devices, links);
    const actions = [...devices.flatMap(d => sw(d.id, ...CONF, "vtp domain D", ...(d.id === "s0" ? ["vlan 40"] : ["vtp mode client"]), "interface g0/1", "switchport mode trunk", "interface g0/2", "switchport mode trunk", "end"))];
    const a = run(c, actions), b = run(c, actions);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect((a.state.ops.vtp as Record<string, { vlans: number[]; revision: number }>)["s7"]).toMatchObject({ vlans: [1, 40], revision: 1 });
  });
});

describe("S18–S22 — Port Security (frequently tested subset) with real forwarding consequences", () => {
  const ps = (...lines: string[]) => sw("sw1", ...CONF, "interface f0/2", "switchport mode access", ...lines, "end");
  it("S18 / S19 / S20 configuration lands in canonical state and running-config; refused on a dynamic port", () => {
    const r = run(LAN(), [...ps("switchport port-security", "switchport port-security maximum 2", "switchport port-security mac-address sticky", "switchport port-security violation restrict"), ...sw("sw1", "show running-config")]);
    expect(swState(r).interfaces["f0/2"].portSecurity).toMatchObject({ enabled: true, maximum: 2, sticky: true, violation: "restrict" });
    const run_ = text(r, "sw1");
    for (const l of ["switchport port-security", "switchport port-security maximum 2", "switchport port-security mac-address sticky", "switchport port-security violation restrict"]) expect(run_).toContain(" " + l + "\n");
    const dyn = run(LAN(), sw("sw1", ...CONF, "interface f0/3", "switchport port-security"));
    expect(last(dyn, "sw1").status).toBe("invalid"); expect(last(dyn, "sw1").output.join(" ")).toMatch(/dynamic port/);
  });
  it("S21 an unauthorized MAC on a shutdown-mode port err-disables it: the host loses connectivity; show port-security explains", () => {
    const r = run(LAN(), [...LAN_IPS, ...ps("switchport port-security", "switchport port-security mac-address 0200.dead.beef"), ...host("pc2", "ping 10.0.0.1"),
      ...sw("sw1", "show port-security interface f0/2", "show port-security")]);
    expect(text(r, "pc2")).toMatch(/Received = 0/);
    expect(reach(LAN(), r, "pc2", "pc1")).toBe(false);
    expect(reach(LAN(), r, "pc3", "pc1")).toBe(true);
    const t = r.transcripts.sw1;
    const iface = t[t.length - 2].result.output.join("\n"), table = t[t.length - 1].result.output.join("\n");
    expect(iface).toMatch(/Port Status\s+: Secure-shutdown/); expect(iface).toMatch(/Security Violation Count\s+: 1/); expect(iface).toMatch(/Violation Mode\s+: Shutdown/);
    expect(table).toMatch(/Fa0\/2\s+1\s+1\s+1\s+Shutdown/);
    expect((r.state.ops.portSecurity as Record<string, { errDisabled: boolean }>)["sw1|f0/2"].errDisabled).toBe(true);
  });
  it("S21 recovery: shutdown + no shutdown clears err-disable; the violator re-offends; the authorized host works", () => {
    const base = [...LAN_IPS, ...ps("switchport port-security", "switchport port-security mac-address 0200.dead.beef"), ...host("pc2", "ping 10.0.0.1")];
    const recovered = run(LAN(), [...base, ...sw("sw1", ...CONF, "interface f0/2", "shutdown", "no shutdown")]);
    expect((recovered.state.ops.portSecurity as Record<string, { errDisabled: boolean }>)["sw1|f0/2"].errDisabled).toBe(false);
    const again = run(LAN(), [...base, ...sw("sw1", ...CONF, "interface f0/2", "shutdown", "no shutdown"), ...host("pc2", "ping 10.0.0.1")]);
    expect((again.state.ops.portSecurity as Record<string, { errDisabled: boolean }>)["sw1|f0/2"].errDisabled).toBe(true);
    const authorized = run(LAN(), [...LAN_IPS, ...ps("switchport port-security", "switchport port-security mac-address " + deriveMac("pc2", "eth0")), ...host("pc2", "ping 10.0.0.1")]);
    expect(text(authorized, "pc2")).toMatch(/Received = 4/);
  });
  it("S19 / S20 maximum and sticky: the first MAC is learned (sticky ⇒ shown in running-config); restrict / protect drop without err-disable", () => {
    const sticky = run(LAN(), [...LAN_IPS, ...ps("switchport port-security", "switchport port-security mac-address sticky"), ...host("pc2", "ping 10.0.0.1"), ...sw("sw1", "show running-config")]);
    expect(text(sticky, "pc2")).toMatch(/Received = 4/);
    expect(text(sticky, "sw1")).toContain(" switchport port-security mac-address sticky " + deriveMac("pc2", "eth0"));
    for (const mode of ["restrict", "protect"]) {
      const r = run(LAN(), [...LAN_IPS, ...ps("switchport port-security", "switchport port-security mac-address 0200.dead.beef", "switchport port-security violation " + mode), ...host("pc2", "ping 10.0.0.1"), ...sw("sw1", "show port-security interface f0/2")]);
      expect(text(r, "pc2"), mode).toMatch(/Received = 0/);
      expect((r.state.ops.portSecurity as Record<string, { errDisabled: boolean }>)["sw1|f0/2"].errDisabled, mode).toBe(false);
      expect(text(r, "sw1"), mode).toMatch(/Port Status\s+: Secure-up/);
      expect(text(r, "sw1"), mode).toMatch(mode === "restrict" ? /Security Violation Count\s+: 1/ : /Security Violation Count\s+: 0/);
    }
  });
  it("S22 an AP behind a maximum-1 port: the second wireless client's MAC is a violation (real multi-MAC consequence)", () => {
    const c = cfg([dev("sw1", "switch"), dev("ap1", "ap", { initial: { v: 2, device: "ap", enabled: true, ssid: "LAB", security: "open", passphrase: "" } }), dev("pc1", "pc"), dev("l1", "laptop"), dev("l2", "laptop")],
      [link("a", "sw1", "f0/2", "ap1", "eth0"), link("p", "sw1", "f0/1", "pc1", "eth0")]);
    const wifi = (id: string, address: string) => [{ type: "host.wifiConnect", deviceId: id, ssid: "LAB", passphrase: "" }, { type: "host.setStatic", deviceId: id, adapter: "wlan0", address, mask: "255.255.255.0", gateway: "", dns: "" }];
    const r = run(c, [ip("pc1", "10.0.0.1"), ...wifi("l1", "10.0.0.11"), ...wifi("l2", "10.0.0.12"), ...ps("switchport port-security"), ...host("l1", "ping 10.0.0.1"), ...host("l2", "ping 10.0.0.1")]);
    expect(text(r, "l1")).toMatch(/Received = 4/);
    expect(text(r, "l2")).toMatch(/Received = 0/);
    expect((r.state.ops.portSecurity as Record<string, { errDisabled: boolean }>)["sw1|f0/2"].errDisabled).toBe(true);
  });
});

describe("S24 — passwords and lines (configuration only; never ExamBank authentication)", () => {
  it("enable secret / password, console and VTY lines, service password-encryption appear correctly in state and running-config", () => {
    const r = run(LAN(), sw("sw1", ...CONF, "enable secret Cl4ss", "enable password plain1", "line console 0", "password conPw", "login", "exit", "line vty 0 4", "password vtyPw", "login", "end", "show running-config"));
    expect(swState(r).security).toMatchObject({ enableSecret: "Cl4ss", enablePassword: "plain1", consolePassword: "conPw", consoleLogin: true, vtyPassword: "vtyPw", vtyLogin: true });
    const out = text(r, "sw1");
    expect(out).toMatch(/^enable secret 5 \S+$/m); expect(out).not.toContain("Cl4ss");                         // a secret is never shown in clear
    expect(out).toContain("enable password plain1"); expect(out).toMatch(/line con 0\n password conPw\n login/); expect(out).toMatch(/line vty 0 4\n password vtyPw\n login/);
    const enc = run(LAN(), sw("sw1", ...CONF, "enable password plain1", "line vty 0 4", "password vtyPw", "exit", "service password-encryption", "end", "show running-config"));
    const e = text(enc, "sw1");
    expect(e).toContain("service password-encryption"); expect(e).toMatch(/enable password 7 [0-9A-F]+/); expect(e).not.toContain("plain1"); expect(e).not.toContain("vtyPw");
    expect(swState(enc).security).toMatchObject({ enablePassword: "plain1", vtyPassword: "vtyPw", encryption: true });   // display-only encryption
  });
  it("password values are bounded and control-character-free", () => {
    const r = run(LAN(), sw("sw1", ...CONF, "enable secret " + "x".repeat(65), "enable secret two words"));
    expect(r.transcripts.sw1.slice(-2).map(e => e.result.status)).toEqual(["invalid", "invalid"]);
    expect(swState(r).security).toEqual({});
  });
});
