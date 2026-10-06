import { describe, it, expect } from "vitest";
import { validateNet2Config } from "./net2Model";
import { replayNet2 } from "./net2Plugin";
import { evaluateSmartSim, validateSmartSimQuestion } from "./trustedSimPlugins";
import { net2TemplateById } from "./networkTopology2/net2Templates";

// Phase 20C — REVIEW FIX 1 (independent review of a7230ba). Fail-first: every test below was run against 42c35c9 (the reviewed head plus
// the design record) and failed there before the fix.
//   F1 BLOCKER  `show ip dhcp pool` enumerated excluded addresses (≈ 560 k Set insertions per command with 8 /8 pools): CPU DoS on every
//               server replay, and a wrong (capped) count. Now counted arithmetically from merged ranges.
//   F2 MINOR    `switch.interfaceEnabled` on an SVI that does not exist passed (free credit).
//   F3 MINOR    pool names `__proto__` / `constructor` / `prototype` were accepted by the CLI (silently no pool) and by check validation.
//   F4 MINOR    err-disable was cleared by changing the violation mode or raising `maximum` (IOS needs shutdown / no shutdown).
//   F5 MINOR    `show ip interface brief` showed an SVI up/up while its VLAN does not exist.
//   F6 NOTE     an AP management address / mask pair that was momentarily unusable was dropped silently.
type Json = Record<string, unknown>;
const dev = (id: string, kind: string, extra: Json = {}) => ({ id, kind, label: id.toUpperCase(), x: 0.5, y: 0.5, ...extra });
const link = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp } });
const cfg = (devices: Json[], links: Json[]) => { const r = validateNet2Config({ v: 2, devices, links }); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.config; };
const sw = (id: string, ...c: string[]) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id: string, ...c: string[]) => c.map(command => ({ type: "router.command", deviceId: id, command }));
const host = (id: string, ...c: string[]) => c.map(command => ({ type: "host.command", deviceId: id, command }));
const ip = (id: string, address: string) => ({ type: "host.setStatic", deviceId: id, adapter: "eth0", address, mask: "255.255.255.0", gateway: "", dns: "" });
type R = { ok: true; state: { devices: Record<string, Json>; ops: { portSecurity: Record<string, Json> } }; transcripts: Record<string, { input: string; result: { status: string; output: string[] } }[]> };
const run = (c: ReturnType<typeof cfg>, actions: unknown[]): R => { const r = replayNet2(c, actions); if (!r.ok) throw new Error(r.code); return r as unknown as R; };
const text = (r: R, id: string) => { const t = r.transcripts[id]; return t[t.length - 1].result.output.join("\n"); };
const CONF = ["enable", "configure terminal"];
const LAN = () => cfg([dev("sw1", "switch"), dev("pc1", "pc"), dev("pc2", "pc"), dev("pc3", "pc")], [link("l1", "sw1", "f0/1", "pc1", "eth0"), link("l2", "sw1", "f0/2", "pc2", "eth0"), link("l3", "sw1", "f0/3", "pc3", "eth0")]);

describe("RF1-F1 — `show ip dhcp pool` is bounded work and exact", () => {
  it("8 /8 pools with 16 huge exclusions: 200 `show ip dhcp pool` replay quickly and report the exact excluded count", () => {
    const c = cfg([dev("r1", "router")], []);
    const pools = Array.from({ length: 8 }, (_, i) => ["ip dhcp pool P" + i, "network 10.0.0.0 255.0.0.0", "exit"]).flat();
    const excl = Array.from({ length: 16 }, (_, i) => "ip dhcp excluded-address 10." + i * 16 + ".0.0 10." + (i * 16 + 15) + ".255.255");
    const shows = Array.from({ length: 200 }, () => "do show ip dhcp pool");
    const t0 = performance.now();
    const r = run(c, rt("r1", ...CONF, ...pools, ...excl, ...shows));
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(text(r, "r1")).toMatch(/Excluded addresses\s+: 16777214$/m);                                // every host address of 10.0.0.0/8
    expect(text(r, "r1")).toMatch(/Total addresses\s+: 16777214$/m);
  }, 60000);
  it("overlapping and partially outside exclusions are merged and clipped to the pool's host range", () => {
    const c = cfg([dev("r1", "router")], []);
    const r = run(c, rt("r1", ...CONF, "ip dhcp excluded-address 192.168.1.0 192.168.1.10", "ip dhcp excluded-address 192.168.1.5 192.168.1.20", "ip dhcp excluded-address 192.168.1.250 192.168.2.9",
      "ip dhcp excluded-address 10.0.0.1 10.0.0.5", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0", "end", "show ip dhcp pool"));
    expect(text(r, "r1")).toMatch(/Excluded addresses\s+: 25$/m);                                      // .1–.20 (20) + .250–.254 (5)
  });
});

describe("RF1-F2..F6 — review minors", () => {
  it("F2 interfaceEnabled on an SVI that was never created does not pass", () => {
    const t = net2TemplateById("capstone")!;
    const r = evaluateSmartSim({ envelope: { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config: t.config() }, answerKey: { scoring: "proportional", checks: [{ id: "s", label: "s", weight: 1, kind: "switch.interfaceEnabled", deviceId: "sw1", interface: "vlan10", value: true }] },
      response: { kind: "smartSim", pluginKey: "networkTopology", pluginVersion: 2, actions: [], state: {} }, maxMarks: 1 });
    expect(r).toMatchObject({ valid: true, score: 0 });
  });
  it("F3 prototype-sensitive pool names are refused by the CLI and by check validation", () => {
    const c = cfg([dev("r1", "router")], []);
    const r = run(c, rt("r1", ...CONF, "ip dhcp pool constructor", "ip dhcp pool __proto__", "ip dhcp pool prototype"));
    expect(r.transcripts.r1.slice(2).map(e => e.result.status)).toEqual(["invalid", "invalid", "invalid"]);
    const t = net2TemplateById("capstone")!;
    const q = { examQuestionId: "q", presentationType: "smartSim", questionTypeVersion: 1, text: "x", marks: 1, smartSim: { schemaVersion: 1, pluginKey: "networkTopology", pluginVersion: 2, config: t.config() },
      answer: { scoring: "proportional", checks: [{ id: "k", label: "k", weight: 1, kind: "router.dhcpPool", deviceId: "r1", pool: "constructor", value: true }] } };
    expect(validateSmartSimQuestion(q).map(i => i.code)).toContain("NET2_CHECK_VALUE_INVALID");
  });
  it("F4 err-disable is latched: changing the violation mode or raising the maximum does not recover the port; shutdown / no shutdown does", () => {
    const base = [ip("pc1", "10.0.0.1"), ip("pc2", "10.0.0.2"), ...sw("sw1", ...CONF, "interface f0/2", "switchport mode access", "switchport port-security", "switchport port-security mac-address 0200.dead.beef", "end"), ...host("pc2", "ping 10.0.0.1")];
    const ed = (r: R) => (r.state.ops.portSecurity["sw1|f0/2"] as { errDisabled: boolean }).errDisabled;
    expect(ed(run(LAN(), base))).toBe(true);
    expect(ed(run(LAN(), [...base, ...sw("sw1", ...CONF, "interface f0/2", "switchport port-security violation restrict", "end")]))).toBe(true);
    expect(ed(run(LAN(), [...base, ...sw("sw1", ...CONF, "interface f0/2", "switchport port-security maximum 3", "end")]))).toBe(true);
    const recovered = run(LAN(), [...base, ...sw("sw1", ...CONF, "interface f0/2", "switchport port-security maximum 3", "shutdown", "no shutdown", "end"), ...host("pc2", "ping 10.0.0.1")]);
    expect(ed(recovered)).toBe(false);
    expect(text(recovered, "pc2")).toMatch(/Received = 4/);                                              // the raised maximum now admits pc2
  });
  it("F5 an SVI whose VLAN does not exist is down/down in show ip interface brief", () => {
    const r = run(LAN(), sw("sw1", ...CONF, "interface vlan 50", "ip address 10.50.0.1 255.255.255.0", "no shutdown", "end", "show ip interface brief"));
    expect(text(r, "sw1")).toMatch(/^Vlan50\s+10\.50\.0\.1\s+YES manual down\s+down$/m);
    const ok = run(LAN(), sw("sw1", ...CONF, "vlan 50", "interface vlan 50", "ip address 10.50.0.1 255.255.255.0", "no shutdown", "end", "show ip interface brief"));
    expect(text(ok, "sw1")).toMatch(/^Vlan50\s+10\.50\.0\.1\s+YES manual up\s+up$/m);
  });
  it("F6 AP management fields are stored as entered; the address works once the pair is usable", () => {
    const c = cfg([dev("sw1", "switch"), dev("ap1", "ap"), dev("pc1", "pc")], [link("a", "sw1", "f0/1", "ap1", "eth0"), link("b", "sw1", "f0/2", "pc1", "eth0")]);
    const set = (field: string, value: string) => ({ type: "ap.set", deviceId: "ap1", field, value });
    const r = run(c, [ip("pc1", "192.168.1.20"), set("address", "192.168.1.0"), set("mask", "255.255.255.0"), ...host("pc1", "ping 192.168.1.0")]);
    expect(r.state.devices.ap1).toMatchObject({ address: "192.168.1.0", mask: "255.255.255.0" });
    expect(text(r, "pc1")).toMatch(/Received = 0/);                                                     // a network address is not a usable management address
    const fixed = run(c, [ip("pc1", "192.168.1.20"), set("address", "192.168.1.0"), set("mask", "255.255.255.0"), set("address", "192.168.1.5"), ...host("pc1", "ping 192.168.1.5")]);
    expect(text(fixed, "pc1")).toMatch(/Received = 4/);
  });
});
