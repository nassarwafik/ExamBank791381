import { describe, it, expect } from "vitest";
import { validateNet2Config, NET2_LIMITS } from "./net2Model";
import { replayNet2, replayNet2Cached, type Net2ReplayCache } from "./net2Plugin";
import { lowestFree } from "./net2Network";
import { checkBoundedJson } from "./trustedSimRegistry";
import { net2TemplateById } from "./networkTopology2/net2Templates";

// Phase 20C — networkTopology@2 BOUNDS, PERFORMANCE, PURITY and the incremental view replay. These tests were written with the
// implementation (they pin the hardening found by the 20C self-review), so they are labelled NEW / PIN, not fail-first:
//   • the canonical state ALWAYS satisfies the core's bounded-JSON guard (≤ 64 keys per object, depth, bytes) — otherwise a student's
//     autosave could be refused: SVIs, VLANs (incl. auto-created ones) and Port Security ports are capped;
//   • a huge excluded DHCP range never turns the allocator into a scan (DoS guard);
//   • the worst-case topology (30 devices, 60 links with switching loops, 1000 actions) replays deterministically within bounds;
//   • replay never mutates its inputs; the cached (incremental) view replay is byte-identical to a full replay.
type Json = Record<string, unknown>;
const dev = (id: string, kind: string, extra: Json = {}) => ({ id, kind, label: id.toUpperCase(), x: 0.5, y: 0.5, ...extra });
const link = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp } });
const cfg = (devices: Json[], links: Json[]) => { const r = validateNet2Config({ v: 2, devices, links }); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.config; };
const sw = (id: string, ...c: string[]) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id: string, ...c: string[]) => c.map(command => ({ type: "router.command", deviceId: id, command }));
const CONF = ["enable", "configure terminal"];
type R = { ok: true; state: { devices: Record<string, Json>; ops: Record<string, Record<string, Json>> }; transcripts: Record<string, { input: string; result: { status: string; output: string[] } }[]> };
const run = (c: ReturnType<typeof cfg>, actions: unknown[]): R => { const r = replayNet2(c, actions); if (!r.ok) throw new Error(r.code); return r as unknown as R; };
const deepFreeze = <T>(v: T): T => { if (v && typeof v === "object") { Object.values(v as object).forEach(deepFreeze); Object.freeze(v); } return v; };

describe("20C-B — the canonical state always fits the core's bounded-JSON guard", () => {
  it("SVIs are capped at 16, VLANs at 64 (also via switchport access vlan auto-create); the state stays ≤ 64 keys per object", () => {
    const c = cfg([dev("sw1", "switch")], []);
    const svis = Array.from({ length: 18 }, (_, i) => "interface vlan " + (100 + i));
    const vlans = Array.from({ length: 66 }, (_, i) => "vlan " + (200 + i));
    const r = run(c, sw("sw1", ...CONF, ...svis, "exit", ...vlans, "exit", "vlan 900", "interface f0/1", "switchport access vlan 901"));
    const s = r.state.devices.sw1 as { interfaces: Json; vlans: Json };
    expect(Object.keys(s.interfaces).filter(n => n.startsWith("vlan")).length).toBe(16);
    expect(Object.keys(s.vlans).length).toBe(64);
    const t = r.transcripts.sw1;
    expect(t.find(e => e.input === "interface vlan 117")!.result.output.join(" ")).toMatch(/SVI limit/);
    expect(t[t.length - 1].result.status).toBe("invalid");                                                   // auto-create refused at the cap
    expect(checkBoundedJson({ actions: [], state: r.state })).toBeUndefined();
    const big = { v: 2, device: "switch", hostname: "S", vlans: {}, interfaces: Object.fromEntries(Array.from({ length: 17 }, (_, i) => ["vlan" + (10 + i), {}])), vtp: { mode: "server", domain: "", password: "", version: 1, revision: 0 }, security: {} };
    expect(validateNet2Config({ v: 2, devices: [dev("s", "switch", { initial: big })], links: [] }).ok).toBe(false);
  });
  it("Port Security is capped at 48 secure ports per topology (the 49th is refused); initial states over the cap are refused", () => {
    const c = cfg([dev("a", "switch"), dev("b", "switch"), dev("z", "switch")], []);
    const secure = (id: string, from: number, to: number) => sw(id, ...CONF, ...Array.from({ length: to - from + 1 }, (_, i) => ["interface f0/" + (from + i), "switchport mode access", "switchport port-security"]).flat(), "end");
    const r = run(c, [...secure("a", 1, 24), ...secure("b", 1, 24), ...secure("z", 1, 1)]);
    const count = (id: string) => Object.values((r.state.devices[id] as { interfaces: Record<string, { portSecurity?: { enabled: boolean } }> }).interfaces).filter(x => x.portSecurity?.enabled).length;
    expect(count("a") + count("b")).toBe(48); expect(count("z")).toBe(0);
    expect(r.transcripts.z.find(e => e.input === "switchport port-security")!.result.output.join(" ")).toMatch(/Port Security limit/);
    expect(checkBoundedJson({ actions: [], state: r.state })).toBeUndefined();
    const ps = { enabled: true, maximum: 1, sticky: false, violation: "shutdown", macs: [] };
    const initial = (n: number) => ({ v: 2, device: "switch", hostname: "S", vlans: {}, interfaces: Object.fromEntries(Array.from({ length: n }, (_, i) => ["f0/" + (i + 1), { mode: "access", portSecurity: ps }])), vtp: { mode: "server", domain: "", password: "", version: 1, revision: 0 }, security: {} });
    expect(validateNet2Config({ v: 2, devices: [dev("a", "switch", { initial: initial(24) }), dev("b", "switch", { initial: initial(24) })], links: [] }).ok).toBe(true);
    const over = validateNet2Config({ v: 2, devices: [dev("a", "switch", { initial: initial(24) }), dev("b", "switch", { initial: initial(24) }), dev("c", "switch", { initial: initial(1) })], links: [] });
    expect(over.ok ? [] : over.issues.map(i => i.code)).toContain("NET2_SECURE_PORTS_TOO_MANY");
  });
});

describe("20C-D — DoS guards", () => {
  it("a fully excluded /8 DHCP pool is never scanned address by address (bounded allocator); clients fall back to APIPA quickly", () => {
    expect(lowestFree({ first: 0x0a000001, last: 0x0afffffe, excluded: [["10.0.0.1", "10.255.255.254"]] }, () => false)).toBeUndefined();
    expect(lowestFree({ first: 0x0a000001, last: 0x0afffffe, excluded: [["10.0.0.1", "10.0.0.9"], ["10.0.0.11", "10.0.0.20"]] }, ip => ip === "10.0.0.10")).toBe("10.0.0.21");
    const pcs = Array.from({ length: 20 }, (_, i) => "p" + i);
    const c = cfg([dev("r1", "router"), dev("sw1", "switch"), ...pcs.map(p => dev(p, "pc", { initial: { v: 2, device: "host", adapters: { eth0: { mode: "dhcp" } } } }))],
      [link("u", "r1", "g0/0", "sw1", "g0/1"), ...pcs.map((p, i) => link("l" + i, "sw1", "f0/" + (i + 1), p, "eth0"))]);
    const toggles = Array.from({ length: 200 }, (_, i) => "hostname R" + (i % 5));
    const t0 = performance.now();
    const r = run(c, rt("r1", ...CONF, "interface g0/0", "ip address 10.0.0.1 255.0.0.0", "no shutdown", "exit", "ip dhcp excluded-address 10.0.0.1 10.255.255.254", "ip dhcp pool BIG", "network 10.0.0.0 255.0.0.0", "exit", ...toggles));
    expect(performance.now() - t0).toBeLessThan(20000);
    expect(Object.values(r.state.ops.adapters).every(a => a.status === "apipa")).toBe(true);
  }, 60000);
});

describe("20C-P — performance bounds, purity and the incremental view replay", () => {
  // 1 router + 9 switches in a full mesh (switching loops, no STP: the flood visits each switch / VLAN once) + 20 DHCP PCs = 30 devices, 60 links
  const worst = () => {
    const sws = Array.from({ length: 9 }, (_, i) => "s" + i), pcs = Array.from({ length: 20 }, (_, i) => "p" + i);
    const links: Json[] = [link("u", "r1", "g0/0", "s0", "g0/1")];
    const next: Record<string, number> = {}; const port = (s: string) => { next[s] = (next[s] ?? 12) + 1; return "f0/" + next[s]; };
    let n = 0;
    for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) links.push(link("m" + n++, sws[i], port(sws[i]), sws[j], port(sws[j])));
    pcs.forEach((p, i) => links.push(link("h" + i, sws[i % 9], "f0/" + (1 + Math.floor(i / 9)), p, "eth0")));
    for (let k = 0; links.length < NET2_LIMITS.links; k++) links.push(link("x" + k, sws[k], port(sws[k]), sws[(k + 4) % 9], port(sws[(k + 4) % 9])));
    const c = cfg([dev("r1", "router"), ...sws.map(s => dev(s, "switch")), ...pcs.map(p => dev(p, "pc", { initial: { v: 2, device: "host", adapters: { eth0: { mode: "dhcp" } } } }))], links);
    const acts: Json[] = [...sw("s0", ...CONF, "vtp domain D", "vlan 10", "end")];
    for (const s of sws) acts.push(...sw(s, ...CONF, ...(s === "s0" ? [] : ["vtp domain D", "vtp mode client"]), ...Array.from({ length: (next[s] ?? 12) - 12 }, (_, q) => ["interface f0/" + (13 + q), "switchport mode trunk"]).flat(), "end"));
    acts.push(...sw("s0", "configure terminal", "interface g0/1", "switchport mode trunk", "end"), ...rt("r1", ...CONF, "interface g0/0", "ip address 10.0.0.1 255.255.255.0", "no shutdown", "ip dhcp pool P", "network 10.0.0.0 255.255.255.0", "default-router 10.0.0.1", "end"));
    for (let i = 0; acts.length < NET2_LIMITS.actions; i++) acts.push(i % 2 ? { type: "host.command", deviceId: pcs[i % 20], command: "ping 10.0.0." + (2 + (i % 25)) } : { type: "switch.command", deviceId: sws[i % 9], command: "show vlan brief" });
    return { c, acts };
  };
  it("the worst-case topology (30 devices, 60 links, loops, 1000 actions) replays deterministically, within time and answer bounds", () => {
    const { c, acts } = worst();
    expect(c.devices.length).toBe(NET2_LIMITS.devices); expect(c.links.length).toBe(NET2_LIMITS.links); expect(acts.length).toBe(NET2_LIMITS.actions);
    const t0 = performance.now();
    const a = run(c, acts);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(30000);
    expect(Object.values(a.state.ops.adapters).filter(x => x.status === "dhcp").length).toBe(20);
    expect(JSON.stringify(run(c, acts).state)).toBe(JSON.stringify(a.state));
    expect(checkBoundedJson({ actions: acts, state: a.state })).toBeUndefined();
  }, 120000);
  it("a typical curriculum answer (the capstone template, ~100 actions) replays in well under a second", () => {
    const t = net2TemplateById("capstone")!; const c = validateNet2Config(t.config()); if (!c.ok) throw new Error("cfg");
    const acts = [...sw("sw1", ...CONF, "vlan 10", "vlan 20", "interface g0/1", "switchport mode trunk", "interface g0/2", "switchport mode trunk", "interface f0/1", "switchport access vlan 10", "end"),
      ...rt("r1", ...CONF, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "exit", "ip dhcp pool S", "network 192.168.10.0 255.255.255.0", "end")];
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) run(c.config, acts);
    expect((performance.now() - t0) / 5).toBeLessThan(1000);
  });
  it("replay never mutates its inputs (deep-frozen config and actions replay identically)", () => {
    const t = net2TemplateById("wireless")!; const c = validateNet2Config(t.config()); if (!c.ok) throw new Error("cfg");
    const acts = [{ type: "ap.set", deviceId: "ap1", field: "security", value: "wpa2" }, { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "Exam2026!" }, { type: "host.wifiConnect", deviceId: "lap1", ssid: "SCHOOL-WIFI", passphrase: "Exam2026!" }, { type: "host.command", deviceId: "lap1", command: "ping 192.168.1.1" }];
    const plain = JSON.stringify(replayNet2(c.config, acts));
    expect(JSON.stringify(replayNet2(deepFreeze(JSON.parse(JSON.stringify(c.config))), deepFreeze(JSON.parse(JSON.stringify(acts)))))).toBe(plain);
  });
  it("the incremental view replay equals a full replay for extensions, divergent edits, resets and refusals", () => {
    const t = net2TemplateById("roas")!; const c = validateNet2Config(t.config()); if (!c.ok) throw new Error("cfg");
    const all = [...sw("sw1", ...CONF, "vlan 10", "interface f0/1", "switchport access vlan 10", "end"), { type: "host.command", deviceId: "pc1", command: "ping 192.168.10.12" }, ...rt("r1", ...CONF, "hostname X")];
    let cache: Net2ReplayCache | undefined;
    for (let n = 0; n <= all.length; n++) {
      const step = replayNet2Cached(c.config, all.slice(0, n), cache);
      expect(JSON.stringify(step.replay), "prefix " + n).toBe(JSON.stringify(replayNet2(c.config, all.slice(0, n))));
      cache = step.cache;
    }
    const divergent = [...all.slice(0, 3), ...sw("sw1", "vlan 20")];
    expect(JSON.stringify(replayNet2Cached(c.config, divergent, cache).replay)).toBe(JSON.stringify(replayNet2(c.config, divergent)));
    expect(JSON.stringify(replayNet2Cached(c.config, [], cache).replay)).toBe(JSON.stringify(replayNet2(c.config, [])));
    expect(replayNet2Cached(c.config, [...all, { type: "device.add", deviceId: "pc1" }], cache).replay).toEqual({ ok: false, code: "NET2_ACTION_INVALID" });
    const other = validateNet2Config(t.config()); if (!other.ok) throw new Error("cfg");
    expect(JSON.stringify(replayNet2Cached(other.config, all, cache).replay)).toBe(JSON.stringify(replayNet2(other.config, all)));   // another config never resumes
  });
});
