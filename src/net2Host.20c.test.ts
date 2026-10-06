import { describe, it, expect } from "vitest";
import { validateNet2Config, deriveMac } from "./net2Model";
import { replayNet2, canReachNet2, normalizeNet2Action } from "./net2Plugin";

// Phase 20C — networkTopology@2 HOSTS (PC / Laptop Desktop: IP Configuration, Command Prompt, Network Status data) and WIRELESS / Access
// Point (H1–H20, W1–W14). One canonical host state feeds every view: the effective adapter configuration in the server-derived state is
// exactly what ipconfig prints and what connectivity uses. New-function tests (fail-first on 686afbc).
type Json = Record<string, unknown>;
const dev = (id: string, kind: string, extra: Json = {}) => ({ id, kind, label: id.toUpperCase(), x: 0.5, y: 0.5, ...extra });
const link = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp } });
const cfg = (devices: Json[], links: Json[]) => { const r = validateNet2Config({ v: 2, devices, links }); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.config; };
const sw = (id: string, ...c: string[]) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id: string, ...c: string[]) => c.map(command => ({ type: "router.command", deviceId: id, command }));
const host = (id: string, ...c: string[]) => c.map(command => ({ type: "host.command", deviceId: id, command }));
const ip = (id: string, address: string, gateway = "", adapter = "eth0", mask = "255.255.255.0", dns = "") => ({ type: "host.setStatic", deviceId: id, adapter, address, mask, gateway, dns });
const mode = (id: string, m: "dhcp" | "static", adapter = "eth0") => ({ type: "host.setMode", deviceId: id, adapter, mode: m });
const wifi = (id: string, ssid: string, passphrase = "") => ({ type: "host.wifiConnect", deviceId: id, ssid, passphrase });
const ap = (id: string, field: string, value: unknown) => ({ type: "ap.set", deviceId: id, field, value });
type R = { ok: true; state: { devices: Record<string, Json>; ops: Json }; transcripts: Record<string, { input: string; result: { status: string; output: string[] } }[]> };
function run(c: ReturnType<typeof cfg>, actions: unknown[]): R { const r = replayNet2(c, actions); if (!r.ok) throw new Error(r.code); return r as unknown as R; }
const last = (r: R, id: string) => { const t = r.transcripts[id]; return t[t.length - 1].result; };
const text = (r: R, id: string) => last(r, id).output.join("\n");
const adapter = (r: R, key: string) => (r.state.ops.adapters as Record<string, Json>)[key];
const reach = (c: ReturnType<typeof cfg>, r: R, a: string, b: string) => canReachNet2(c, r.state as never, a, b).reachable;
const CONF = ["enable", "configure terminal"];
// r1 g0/0 192.168.1.1/24 with a DHCP pool; sw1; pc1 wired on f0/1; ap1 on f0/2; laptops lap1/lap2 wireless; pc2 wired on f0/3
const WLAN = () => cfg([dev("r1", "router"), dev("sw1", "switch"), dev("pc1", "pc"), dev("pc2", "pc"), dev("ap1", "ap"), dev("lap1", "laptop"), dev("lap2", "laptop"), dev("dual", "laptop", { adapters: ["ethernet", "wireless"] })],
  [link("u", "r1", "g0/0", "sw1", "g0/1"), link("a", "sw1", "f0/1", "pc1", "eth0"), link("b", "sw1", "f0/2", "ap1", "eth0"), link("c", "sw1", "f0/3", "pc2", "eth0"), link("d", "sw1", "f0/4", "dual", "eth0")]);
const ROUTER = rt("r1", ...CONF, "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "ip dhcp excluded-address 192.168.1.1 192.168.1.10", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0", "default-router 192.168.1.1", "dns-server 192.168.1.1", "end");
const SECURE_AP = [ap("ap1", "ssid", "SCHOOL"), ap("ap1", "security", "wpa2"), ap("ap1", "passphrase", "Exam2026!")];

describe("H1–H8 / H17 — IP Configuration, DHCP, APIPA, ipconfig (one canonical host state)", () => {
  it("H1 / H7 a static edit is the effective configuration and exactly what ipconfig prints", () => {
    const r = run(WLAN(), [ip("pc1", "192.168.1.20", "192.168.1.1", "eth0", "255.255.255.0", "8.8.8.8"), ...host("pc1", "ipconfig")]);
    expect(adapter(r, "pc1/eth0")).toEqual({ status: "static", address: "192.168.1.20", mask: "255.255.255.0", gateway: "192.168.1.1", dns: "8.8.8.8" });
    const out = text(r, "pc1");
    expect(out).toMatch(/IPv4 Address[ .]*: 192\.168\.1\.20/); expect(out).toMatch(/Subnet Mask[ .]*: 255\.255\.255\.0/); expect(out).toMatch(/Default Gateway[ .]*: 192\.168\.1\.1/);
  });
  it("H2 / H3 / H8 DHCP mode: the lease populates the adapter; ipconfig /all shows DHCP data and the MAC", () => {
    const r = run(WLAN(), [...ROUTER, mode("pc1", "dhcp"), ...host("pc1", "ipconfig", "ipconfig /all")]);
    expect(adapter(r, "pc1/eth0")).toMatchObject({ status: "dhcp", address: "192.168.1.11", gateway: "192.168.1.1", dns: "192.168.1.1", dhcpServer: "192.168.1.1" });
    const t = r.transcripts.pc1;
    expect(t[t.length - 2].result.output.join("\n")).toMatch(/IPv4 Address[ .]*: 192\.168\.1\.11/);
    const all = t[t.length - 1].result.output.join("\n");
    expect(all).toMatch(/DHCP Enabled[ .]*: Yes/); expect(all).toMatch(/Physical Address[ .]*: /); expect(all).toContain(deriveMac("pc1", "eth0"));
  });
  it("H4 / H5 / H6 no DHCP service ⇒ deterministic APIPA (same address on every replay, from the MAC) ⇒ repaired later ⇒ real lease", () => {
    const a = run(WLAN(), [mode("pc1", "dhcp"), ...host("pc1", "ipconfig")]), b = run(WLAN(), [mode("pc1", "dhcp")]);
    expect(adapter(a, "pc1/eth0")).toMatchObject({ status: "apipa", mask: "255.255.0.0" });
    expect(adapter(a, "pc1/eth0")).toEqual(adapter(b, "pc1/eth0"));
    expect(adapter(a, "pc1/eth0")).not.toHaveProperty("gateway");
    expect(text(a, "pc1")).toMatch(/Autoconfiguration IPv4 Address[ .]*: 169\.254\./);
    const fixed = run(WLAN(), [mode("pc1", "dhcp"), ...ROUTER]);
    expect(adapter(fixed, "pc1/eth0")).toMatchObject({ status: "dhcp", address: "192.168.1.11" });
  });
  it("H14 ipconfig /release and /renew (deterministic, replayed)", () => {
    const rel = run(WLAN(), [...ROUTER, mode("pc1", "dhcp"), ...host("pc1", "ipconfig /release")]);
    expect(adapter(rel, "pc1/eth0")).toMatchObject({ status: "released" });
    expect(adapter(rel, "pc1/eth0")).not.toHaveProperty("address");
    const ren = run(WLAN(), [...ROUTER, mode("pc1", "dhcp"), ...host("pc1", "ipconfig /release", "ipconfig /renew")]);
    expect(adapter(ren, "pc1/eth0")).toMatchObject({ status: "dhcp", address: "192.168.1.11" });
    expect(text(ren, "pc1")).toMatch(/IPv4 Address[ .]*: 192\.168\.1\.11/);
  });
  it("H17 restore = replay: the same actions always rebuild the same state and transcripts", () => {
    const actions = [...ROUTER, mode("pc1", "dhcp"), ip("pc2", "192.168.1.30", "192.168.1.1"), ...host("pc2", "ping 192.168.1.11", "arp -a")];
    expect(JSON.stringify(run(WLAN(), actions))).toBe(JSON.stringify(run(WLAN(), actions)));
  });
  it("H18 a dual-adapter laptop keeps one configuration per adapter", () => {
    const r = run(WLAN(), [ip("dual", "192.168.1.40", "192.168.1.1"), ip("dual", "10.5.5.5", "", "wlan0")]);
    expect(adapter(r, "dual/eth0")).toMatchObject({ address: "192.168.1.40" });
    expect(adapter(r, "dual/wlan0")).toMatchObject({ address: "10.5.5.5" });
    expect(normalizeNet2Action(ip("pc1", "1.2.3.4", "", "wlan0"), WLAN()).ok).toBe(false);          // pc1 is Ethernet-only
    expect(normalizeNet2Action(ip("lap1", "1.2.3.4", "", "eth0"), WLAN()).ok).toBe(false);          // lap1 is wireless-only
  });
});

describe("H9–H16 — Command Prompt (closed educational grammar)", () => {
  const BASE = [...ROUTER, ip("pc1", "192.168.1.21", "192.168.1.1"), ip("pc2", "192.168.1.22", "192.168.1.1")];
  it("H9 / H12 ping on the same LAN uses the real state; arp -a then shows what was really resolved", () => {
    const r = run(WLAN(), [...BASE, ...host("pc1", "arp -a", "ping 192.168.1.22", "arp -a")]);
    const t = r.transcripts.pc1;
    expect(t[t.length - 3].result.output.join("\n")).toMatch(/No ARP Entries Found/);
    expect(t[t.length - 2].result.output.join("\n")).toMatch(/Reply from 192\.168\.1\.22: bytes=32 time<1ms TTL=128/);
    expect(t[t.length - 2].result.output.join("\n")).toMatch(/Packets: Sent = 4, Received = 4, Lost = 0 \(0% loss\)/);
    expect(t[t.length - 1].result.output.join("\n")).toMatch(new RegExp("192\\.168\\.1\\.22\\s+" + deriveMac("pc2", "eth0").replace(/\./g, "\\.") + "\\s+dynamic"));
  });
  it("H11 a failed ping reports loss and learns nothing impossible", () => {
    const r = run(WLAN(), [...BASE, ...host("pc1", "ping 192.168.1.99", "arp -a")]);
    const t = r.transcripts.pc1;
    expect(t[t.length - 2].result.output.join("\n")).toMatch(/Received = 0, Lost = 4 \(100% loss\)/);
    expect(t[t.length - 1].result.output.join("\n")).toMatch(/No ARP Entries Found/);
  });
  it("H10 / H13 a ping to another network goes via the gateway; arp -a holds the GATEWAY's MAC, not the remote host's", () => {
    const c = cfg([dev("r1", "router"), dev("pc1", "pc"), dev("pc9", "pc")], [link("a", "r1", "g0/0", "pc1", "eth0"), link("b", "r1", "g0/1", "pc9", "eth0")]);
    const r = run(c, [ip("pc1", "10.1.0.10", "10.1.0.1"), ip("pc9", "10.9.0.10", "10.9.0.1"), ...rt("r1", ...CONF, "interface g0/0", "ip address 10.1.0.1 255.255.255.0", "no shutdown", "interface g0/1", "ip address 10.9.0.1 255.255.255.0", "no shutdown", "end"),
      ...host("pc1", "ping 10.9.0.10", "tracert 10.9.0.10", "arp -a")]);
    const t = r.transcripts.pc1;
    expect(t[t.length - 3].result.output.join("\n")).toMatch(/Reply from 10\.9\.0\.10: bytes=32 time<1ms TTL=127/);
    expect(t[t.length - 2].result.output.join("\n")).toMatch(/^\s+1\s+0 ms\s+0 ms\s+0 ms\s+10\.1\.0\.1\n\s+2\s+0 ms\s+0 ms\s+0 ms\s+10\.9\.0\.10$/m);
    const arp = t[t.length - 1].result.output.join("\n");
    expect(arp).toContain(deriveMac("r1", "g0/0")); expect(arp).not.toContain(deriveMac("pc9", "eth0"));
  });
  it("H15 the CMD grammar is closed: unknown, shell-like and oversized input never runs anything and never changes state", () => {
    const before = run(WLAN(), BASE);
    const r = run(WLAN(), [...BASE, ...host("pc1", "dir", "ping 1.1.1.1 && del *", "ipconfig; shutdown", "$(curl x)", "powershell", "ping", "tracert", "x".repeat(121))]);
    for (const e of r.transcripts.pc1) expect(e.result.status, e.input).not.toBe("ok");
    expect(r.transcripts.pc1[0].result.output.join(" ")).toMatch(/Invalid Command\./);
    expect(JSON.stringify(r.state.devices)).toBe(JSON.stringify(before.state.devices));
  });
  it("H16 forged / malformed host actions are refused by the normalizer", () => {
    for (const bad of [{ type: "host.setStatic", deviceId: "pc1", adapter: "eth0", address: "999.1.1.1", mask: "255.255.255.0", gateway: "", dns: "" },
      { type: "host.setStatic", deviceId: "pc1", adapter: "eth0", address: "192.168.1.5", mask: "255.0.255.0", gateway: "", dns: "" },
      { type: "host.setStatic", deviceId: "pc1", adapter: "eth0", address: "192.168.1.5", mask: "255.255.255.0", gateway: "", dns: "", lease: "x" },
      { type: "host.setMode", deviceId: "pc1", adapter: "eth0", mode: "apipa" }, { type: "host.setMode", deviceId: "sw1", adapter: "eth0", mode: "dhcp" },
      { type: "host.command", deviceId: "r1", command: "ipconfig" }, { type: "host.command", deviceId: "pc1", command: 5 }, { type: "host.setLease", deviceId: "pc1", address: "192.168.1.200" },
      { type: "host.setArp", deviceId: "pc1", entries: [] }, { type: "host.wifiConnect", deviceId: "pc1", ssid: "SCHOOL", passphrase: "" }, { type: "host.command", deviceId: "__proto__", command: "ipconfig" }])
      expect(normalizeNet2Action(bad, WLAN()).ok, JSON.stringify(bad)).toBe(false);
  });
});

describe("W1–W14 — Access Point and wireless hosts (L2 bridge, WPA2, DHCP over wireless)", () => {
  it("W1 / W2 / W3 AP configuration is canonical state; an open SSID associates", () => {
    const r = run(WLAN(), [...SECURE_AP, ap("ap1", "address", "192.168.1.5"), ap("ap1", "mask", "255.255.255.0"), ap("ap1", "gateway", "192.168.1.1")]);
    expect(r.state.devices.ap1).toMatchObject({ enabled: true, ssid: "SCHOOL", security: "wpa2", passphrase: "Exam2026!", address: "192.168.1.5", mask: "255.255.255.0", gateway: "192.168.1.1" });
    const open = run(WLAN(), [ap("ap1", "ssid", "OPEN-LAB"), wifi("lap1", "OPEN-LAB")]);
    expect((open.state.ops.wifi as Record<string, Json>).lap1).toMatchObject({ status: "associated", ssid: "OPEN-LAB", ap: "ap1" });
  });
  it("W4 / W5 / W8 correct WPA2 passphrase associates and gets a DHCP lease THROUGH the AP; a wrong one fails (no lease)", () => {
    const ok = run(WLAN(), [...ROUTER, ...SECURE_AP, mode("lap1", "dhcp", "wlan0"), wifi("lap1", "SCHOOL", "Exam2026!")]);
    expect((ok.state.ops.wifi as Record<string, Json>).lap1).toMatchObject({ status: "associated", ap: "ap1" });
    expect(adapter(ok, "lap1/wlan0")).toMatchObject({ status: "dhcp", address: "192.168.1.11", gateway: "192.168.1.1" });
    const wrong = run(WLAN(), [...ROUTER, ...SECURE_AP, mode("lap1", "dhcp", "wlan0"), wifi("lap1", "SCHOOL", "wrong-pass")]);
    expect((wrong.state.ops.wifi as Record<string, Json>).lap1).toMatchObject({ status: "auth-failed" });
    expect(adapter(wrong, "lap1/wlan0")).toMatchObject({ status: "disconnected" });
    const missing = run(WLAN(), [...SECURE_AP, wifi("lap1", "NOPE")]);
    expect((missing.state.ops.wifi as Record<string, Json>).lap1).toMatchObject({ status: "no-ssid" });
  });
  it("W6 / W7 AP disabled ⇒ no association; AP uplink down ⇒ associated but no LAN reachability and no lease", () => {
    const off = run(WLAN(), [...ROUTER, ...SECURE_AP, ap("ap1", "enabled", false), mode("lap1", "dhcp", "wlan0"), wifi("lap1", "SCHOOL", "Exam2026!")]);
    expect((off.state.ops.wifi as Record<string, Json>).lap1).toMatchObject({ status: "no-ssid" });
    const uplinkDown = run(WLAN(), [...ROUTER, ...SECURE_AP, mode("lap1", "dhcp", "wlan0"), wifi("lap1", "SCHOOL", "Exam2026!"), ...sw("sw1", ...CONF, "interface f0/2", "shutdown", "end")]);
    expect((uplinkDown.state.ops.wifi as Record<string, Json>).lap1).toMatchObject({ status: "associated" });
    expect(adapter(uplinkDown, "lap1/wlan0")).toMatchObject({ status: "apipa" });
  });
  it("W9 / W10 / W11 static wireless addressing; wired ↔ wireless and wireless ↔ wireless reachability through the bridge", () => {
    const r = run(WLAN(), [...SECURE_AP, ip("pc1", "192.168.1.21"), wifi("lap1", "SCHOOL", "Exam2026!"), ip("lap1", "192.168.1.31", "", "wlan0"), wifi("lap2", "SCHOOL", "Exam2026!"), ip("lap2", "192.168.1.32", "", "wlan0"),
      ...host("lap1", "ping 192.168.1.21")]);
    expect(text(r, "lap1")).toMatch(/Received = 4/);
    expect(reach(WLAN(), r, "lap1", "pc1")).toBe(true);
    expect(reach(WLAN(), r, "pc1", "lap2")).toBe(true);
    expect(reach(WLAN(), r, "lap1", "lap2")).toBe(true);
    const unassoc = run(WLAN(), [ip("pc1", "192.168.1.21"), ip("lap1", "192.168.1.31", "", "wlan0")]);
    expect(reach(WLAN(), unassoc, "lap1", "pc1")).toBe(false);
  });
  it("W12 / W13 association is replayed semantic state (restore); a forged association / lease in the claimed state is ignored", () => {
    const actions = [...SECURE_AP, wifi("lap1", "SCHOOL", "Exam2026!"), { type: "host.wifiDisconnect", deviceId: "lap1" }, wifi("lap1", "SCHOOL", "Exam2026!")];
    expect((run(WLAN(), actions).state.ops.wifi as Record<string, Json>).lap1).toMatchObject({ status: "associated" });
    expect((run(WLAN(), actions.slice(0, 5)).state.ops.wifi as Record<string, Json>).lap1).toMatchObject({ status: "disconnected" });
    for (const bad of [{ type: "host.wifiConnect", deviceId: "lap1", ssid: "S", passphrase: "x", ap: "ap1" }, { type: "host.wifiConnect", deviceId: "lap1", ssid: "", passphrase: "" }, { type: "host.wifiConnect", deviceId: "lap1", ssid: "x".repeat(33), passphrase: "" },
      { type: "ap.set", deviceId: "ap1", field: "ssid", value: "" }, { type: "ap.set", deviceId: "ap1", field: "passphrase", value: "short" }, { type: "ap.set", deviceId: "ap1", field: "security", value: "wep" }, { type: "ap.set", deviceId: "ap1", field: "vlan", value: 10 },
      { type: "ap.set", deviceId: "pc1", field: "ssid", value: "X" }, { type: "ap.set", deviceId: "ap1", field: "enabled", value: "yes" }])
      expect(normalizeNet2Action(bad, WLAN()).ok, JSON.stringify(bad)).toBe(false);
  });
  it("W14 the student can never mutate the topology (no structural action exists; every attempt is refused)", () => {
    for (const t of ["device.add", "device.delete", "device.move", "device.changeType", "link.add", "link.delete", "link.move", "topology.replace", "config.replace", "ap.create", "ap.delete", "host.setAdapters", "state.patch"])
      expect(normalizeNet2Action({ type: t, deviceId: "pc1", id: "x", kind: "router", a: { deviceId: "pc1", port: "eth0" }, b: { deviceId: "sw1", port: "f0/9" }, x: 0.1, y: 0.2 }, WLAN()).ok, t).toBe(false);
  });
});
