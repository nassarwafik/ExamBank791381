import { describe, it, expect } from "vitest";
import { validateNet2Config, deriveMac } from "./net2Model";
import { replayNet2, canReachNet2 } from "./net2Plugin";

// Phase 20C — networkTopology@2 ROUTER CLI v2 (R1–R20): physical interfaces, 802.1Q sub-interfaces and Router-on-a-Stick forwarding that
// really follows the tags, router DHCP pools with exclusions / default-router / dns-server and deterministic allocation, show commands with
// golden content, passwords. New-function tests (fail-first on 686afbc).
type Json = Record<string, unknown>;
const dev = (id: string, kind: string, extra: Json = {}) => ({ id, kind, label: id.toUpperCase(), x: 0.5, y: 0.5, ...extra });
const link = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, a: { deviceId: a, port: ap }, b: { deviceId: b, port: bp } });
const cfg = (devices: Json[], links: Json[]) => { const r = validateNet2Config({ v: 2, devices, links }); if (!r.ok) throw new Error(JSON.stringify(r.issues)); return r.config; };
const sw = (id: string, ...c: string[]) => c.map(command => ({ type: "switch.command", deviceId: id, command }));
const rt = (id: string, ...c: string[]) => c.map(command => ({ type: "router.command", deviceId: id, command }));
const host = (id: string, ...c: string[]) => c.map(command => ({ type: "host.command", deviceId: id, command }));
const ip = (id: string, address: string, gateway = "", mask = "255.255.255.0", dns = "") => ({ type: "host.setStatic", deviceId: id, adapter: "eth0", address, mask, gateway, dns });
const dhcp = (id: string, adapter = "eth0") => ({ type: "host.setMode", deviceId: id, adapter, mode: "dhcp" });
type R = { ok: true; state: { devices: Record<string, Json>; ops: Json }; transcripts: Record<string, { input: string; result: { status: string; output: string[] } }[]> };
function run(c: ReturnType<typeof cfg>, actions: unknown[]): R { const r = replayNet2(c, actions); if (!r.ok) throw new Error(r.code); return r as unknown as R; }
const last = (r: R, id: string) => { const t = r.transcripts[id]; return t[t.length - 1].result; };
const text = (r: R, id: string) => last(r, id).output.join("\n");
const reach = (c: ReturnType<typeof cfg>, r: R, a: string, b: string) => canReachNet2(c, r.state as never, a, b);
const adapter = (r: R, key: string) => (r.state.ops.adapters as Record<string, Json>)[key];
const CONF = ["enable", "configure terminal"];
// Router-on-a-Stick lab: r1 g0/0 — sw1 g0/1 (trunk); pc1/pc2 in VLAN 10, pc3/pc4 in VLAN 20
const ROAS = () => cfg([dev("r1", "router"), dev("sw1", "switch"), dev("pc1", "pc"), dev("pc2", "pc"), dev("pc3", "pc"), dev("pc4", "pc")],
  [link("u", "r1", "g0/0", "sw1", "g0/1"), link("a", "sw1", "f0/1", "pc1", "eth0"), link("b", "sw1", "f0/2", "pc2", "eth0"), link("c", "sw1", "f0/11", "pc3", "eth0"), link("d", "sw1", "f0/12", "pc4", "eth0")]);
const HOSTS = [ip("pc1", "192.168.10.11", "192.168.10.1"), ip("pc2", "192.168.10.12", "192.168.10.1"), ip("pc3", "192.168.20.11", "192.168.20.1"), ip("pc4", "192.168.20.12", "192.168.20.1")];
const SWITCH = sw("sw1", ...CONF, "vlan 10", "vlan 20", "interface f0/1", "switchport mode access", "switchport access vlan 10", "interface f0/2", "switchport mode access", "switchport access vlan 10",
  "interface f0/11", "switchport mode access", "switchport access vlan 20", "interface f0/12", "switchport mode access", "switchport access vlan 20", "interface g0/1", "switchport mode trunk", "end");
const ROUTER = rt("r1", ...CONF, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1Q 20", "ip address 192.168.20.1 255.255.255.0", "end");
const SOLVED = [...HOSTS, ...SWITCH, ...ROUTER];

describe("R1–R11 — interfaces, sub-interfaces and Router-on-a-Stick", () => {
  it("R1 / R2 a physical interface needs an address AND no shutdown (down by default)", () => {
    const c = cfg([dev("r1", "router"), dev("pc1", "pc")], [link("l", "r1", "g0/1", "pc1", "eth0")]);
    const down = run(c, [ip("pc1", "10.1.1.10", "10.1.1.1"), ...rt("r1", ...CONF, "interface g0/1", "ip address 10.1.1.1 255.255.255.0", "end", "show ip interface brief")]);
    expect(text(down, "r1")).toMatch(/^GigabitEthernet0\/1\s+10\.1\.1\.1\s+YES manual administratively down\s+down$/m);
    expect(reach(c, down, "pc1", "r1").reachable).toBe(false);
    const up = run(c, [ip("pc1", "10.1.1.10", "10.1.1.1"), ...rt("r1", ...CONF, "interface g0/1", "ip address 10.1.1.1 255.255.255.0", "no shutdown", "end", "show ip interface brief")]);
    expect(text(up, "r1")).toMatch(/^GigabitEthernet0\/1\s+10\.1\.1\.1\s+YES manual up\s+up$/m);
    expect(reach(c, up, "pc1", "r1").reachable).toBe(true);
  });
  it("R3 / R4 / R5 / R6 sub-interfaces: dot1Q (incl. native) is required before an address; state carries parent, VLAN, native, address", () => {
    const r = run(ROAS(), rt("r1", ...CONF, "interface g0/0.10", "ip address 192.168.10.1 255.255.255.0", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.99", "encapsulation dot1Q 99 native", "end"));
    const before = r.transcripts.r1.find(e => e.input === "ip address 192.168.10.1 255.255.255.0")!;
    expect(before.result.status).toBe("invalid"); expect(before.result.output.join(" ")).toMatch(/802\.1Q|encapsulation/i);
    expect((r.state.devices.r1 as { subinterfaces: Json }).subinterfaces).toEqual({ "g0/0.10": { vlan: 10, ipAddress: "192.168.10.1", subnetMask: "255.255.255.0" }, "g0/0.99": { vlan: 99, native: true } });
    const bad = run(ROAS(), rt("r1", ...CONF, "interface g0/0.0", "interface g0/0.5000", "interface g0/9.10", "interface g0/0.10", "encapsulation dot1Q 0", "encapsulation isl 10", "encapsulation dot1Q 4095"));
    expect(bad.transcripts.r1.slice(2).map(e => e.result.status).filter(s => s === "ok")).toEqual(["ok"]);       // only `interface g0/0.10` is valid
  });
  it("R7 Router-on-a-Stick: inter-VLAN ping works only with trunk + matching dot1Q + parent up; tracert shows the router hop only", () => {
    const r = run(ROAS(), [...SOLVED, ...host("pc1", "ping 192.168.20.11", "tracert 192.168.20.11")]);
    const t = r.transcripts.pc1;
    expect(t[t.length - 2].result.output.join("\n")).toMatch(/Reply from 192\.168\.20\.11: bytes=32 time<1ms TTL=127/);
    const trace = t[t.length - 1].result.output.join("\n");
    expect(trace).toMatch(/^\s+1\s+0 ms\s+0 ms\s+0 ms\s+192\.168\.10\.1$/m); expect(trace).toMatch(/^\s+2\s+0 ms\s+0 ms\s+0 ms\s+192\.168\.20\.11$/m); expect(trace).toContain("Trace complete.");
    expect(trace).not.toMatch(/\s3\s/);
    expect(reach(ROAS(), r, "pc2", "pc4")).toMatchObject({ reachable: true });
  });
  it("R8 / R9 a wrong dot1Q VLAN, a missing trunk or a shut parent breaks inter-VLAN routing (and the reason is specific)", () => {
    const wrongVlan = run(ROAS(), [...HOSTS, ...SWITCH, ...rt("r1", ...CONF, "interface g0/0", "no shutdown", "interface g0/0.10", "encapsulation dot1Q 10", "ip address 192.168.10.1 255.255.255.0", "interface g0/0.20", "encapsulation dot1Q 30", "ip address 192.168.20.1 255.255.255.0", "end")]);
    expect(reach(ROAS(), wrongVlan, "pc1", "pc3")).toMatchObject({ reachable: false });
    expect(reach(ROAS(), wrongVlan, "pc1", "pc2").reachable).toBe(true);                                  // same VLAN still fine
    const noTrunk = run(ROAS(), [...HOSTS, ...SWITCH, ...sw("sw1", ...CONF, "interface g0/1", "switchport mode access", "end"), ...ROUTER]);
    expect(reach(ROAS(), noTrunk, "pc1", "pc3")).toMatchObject({ reachable: false, reason: "GATEWAY_UNREACHABLE" });
    const parentDown = run(ROAS(), [...SOLVED, ...rt("r1", ...CONF, "interface g0/0", "shutdown", "end", "show ip interface brief")]);
    expect(reach(ROAS(), parentDown, "pc1", "pc3").reachable).toBe(false);
    expect(text(parentDown, "r1")).toMatch(/^GigabitEthernet0\/0\.10\s+192\.168\.10\.1\s+YES manual administratively down\s+down$/m);
  });
  it("R10 / R11 show ip interface brief lists sub-interfaces; show ip route has connected + local routes for them", () => {
    const r = run(ROAS(), [...SOLVED, ...rt("r1", "show ip interface brief", "show ip route")]);
    const t = r.transcripts.r1;
    const brief = t[t.length - 2].result.output.join("\n"), route = t[t.length - 1].result.output.join("\n");
    expect(brief).toMatch(/^GigabitEthernet0\/0\.10\s+192\.168\.10\.1\s+YES manual up\s+up$/m);
    expect(brief).toMatch(/^GigabitEthernet0\/0\.20\s+192\.168\.20\.1\s+YES manual up\s+up$/m);
    expect(route).toMatch(/^C\s+192\.168\.10\.0\/24 is directly connected, GigabitEthernet0\/0\.10$/m);
    expect(route).toMatch(/^L\s+192\.168\.10\.1\/32 is directly connected, GigabitEthernet0\/0\.10$/m);
    expect(route).toMatch(/^C\s+192\.168\.20\.0\/24 is directly connected, GigabitEthernet0\/0\.20$/m);
    expect(route).toContain("Gateway of last resort is not set");
  });
});

describe("R12–R18 — router DHCP (deterministic, topology-dependent)", () => {
  const LAB = () => cfg([dev("r1", "router"), dev("sw1", "switch"), dev("pc1", "pc"), dev("pc2", "pc"), dev("pc3", "pc")],
    [link("u", "r1", "g0/0", "sw1", "g0/1"), link("a", "sw1", "f0/1", "pc1", "eth0"), link("b", "sw1", "f0/2", "pc2", "eth0"), link("c", "sw1", "f0/3", "pc3", "eth0")]);
  const IFACE = rt("r1", ...CONF, "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "end");
  const POOL = rt("r1", ...CONF, "ip dhcp excluded-address 192.168.1.1 192.168.1.10", "ip dhcp pool LAN", "network 192.168.1.0 255.255.255.0", "default-router 192.168.1.1", "dns-server 8.8.8.8", "end");
  it("R12–R16 the pool hands out the lowest free address after the exclusions, with mask / gateway / DNS; bindings and pool shown", () => {
    const r = run(LAB(), [...IFACE, ...POOL, dhcp("pc1"), dhcp("pc2"), ...rt("r1", "show ip dhcp binding", "show ip dhcp pool"), ...host("pc1", "ipconfig /all")]);
    expect(adapter(r, "pc1/eth0")).toMatchObject({ status: "dhcp", address: "192.168.1.11", mask: "255.255.255.0", gateway: "192.168.1.1", dns: "8.8.8.8", dhcpServer: "192.168.1.1" });
    expect(adapter(r, "pc2/eth0")).toMatchObject({ status: "dhcp", address: "192.168.1.12" });
    const t = r.transcripts.r1;
    const binding = t[t.length - 2].result.output.join("\n"), pool = t[t.length - 1].result.output.join("\n");
    expect(binding).toMatch(new RegExp("^192\\.168\\.1\\.11\\s+" + deriveMac("pc1", "eth0").replace(/\./g, "\\.") + "\\s+--\\s+Automatic$", "m"));
    expect(binding).toMatch(/^192\.168\.1\.12\s/m);
    expect(pool).toMatch(/Pool LAN :/); expect(pool).toMatch(/Leased addresses\s+: 2/); expect(pool).toMatch(/Excluded addresses\s+: 10/);
    const all = text(r, "pc1");
    expect(all).toMatch(/DHCP Enabled[ .]*: Yes/); expect(all).toMatch(/DHCP Server[ .]*: 192\.168\.1\.1/); expect(all).toMatch(/DNS Servers[ .]*: 8\.8\.8\.8/);
    expect(all).toMatch(new RegExp("Physical Address[ .]*: " + deriveMac("pc1", "eth0").replace(/\./g, "\\.")));
  });
  it("R13 / R18 never allocates network, broadcast, router interface, excluded, leased or statically used addresses", () => {
    const r = run(LAB(), [...rt("r1", ...CONF, "interface g0/0", "ip address 192.168.1.2 255.255.255.248", "no shutdown", "ip dhcp excluded-address 192.168.1.1", "ip dhcp pool P", "network 192.168.1.0 255.255.255.248", "end"),
      ip("pc3", "192.168.1.3", "", "255.255.255.248"), dhcp("pc1"), dhcp("pc2")]);
    expect(adapter(r, "pc1/eth0")).toMatchObject({ address: "192.168.1.4" });                      // .1 excluded, .2 router, .3 static pc3
    expect(adapter(r, "pc2/eth0")).toMatchObject({ address: "192.168.1.5" });
  });
  it("R17 pool exhaustion: clients beyond capacity fall back to deterministic APIPA (169.254.x.x / 16)", () => {
    const r = run(LAB(), [...rt("r1", ...CONF, "interface g0/0", "ip address 192.168.1.1 255.255.255.252", "no shutdown", "ip dhcp pool TINY", "network 192.168.1.0 255.255.255.252", "end"), dhcp("pc1"), dhcp("pc2"), ...host("pc2", "ipconfig")]);
    expect(adapter(r, "pc1/eth0")).toMatchObject({ status: "dhcp", address: "192.168.1.2" });
    expect(adapter(r, "pc2/eth0")).toMatchObject({ status: "apipa", mask: "255.255.0.0" });
    expect((adapter(r, "pc2/eth0") as { address: string }).address).toMatch(/^169\.254\.\d{1,3}\.\d{1,3}$/);
    expect(text(r, "pc2")).toMatch(/Autoconfiguration IPv4 Address[ .]*: 169\.254\./);
  });
  it("DHCP depends on the topology: the order of configuration does not matter; a later repair is picked up automatically", () => {
    const hostFirst = run(LAB(), [dhcp("pc1"), ...IFACE, ...POOL]);
    const routerFirst = run(LAB(), [...IFACE, ...POOL, dhcp("pc1")]);
    expect(adapter(hostFirst, "pc1/eth0")).toEqual(adapter(routerFirst, "pc1/eth0"));
    const broken = run(LAB(), [...rt("r1", ...CONF, "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "end"), ...POOL, dhcp("pc1")]);
    expect(adapter(broken, "pc1/eth0")).toMatchObject({ status: "apipa" });                          // router interface still shut
    const repaired = run(LAB(), [...rt("r1", ...CONF, "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "end"), ...POOL, dhcp("pc1"), ...rt("r1", ...CONF, "interface g0/0", "no shutdown", "end")]);
    expect(adapter(repaired, "pc1/eth0")).toMatchObject({ status: "dhcp", address: "192.168.1.11" });
  });
  it("a pool whose network does not match the receiving interface serves nobody; a duplicate-address-free allocation is stable when hosts are added later", () => {
    const mismatch = run(LAB(), [...IFACE, ...rt("r1", ...CONF, "ip dhcp pool OTHER", "network 10.9.9.0 255.255.255.0", "end"), dhcp("pc1")]);
    expect(adapter(mismatch, "pc1/eth0")).toMatchObject({ status: "apipa" });
    const r = run(LAB(), [...IFACE, ...POOL, dhcp("pc2"), dhcp("pc1")]);
    expect(adapter(r, "pc2/eth0")).toMatchObject({ address: "192.168.1.11" });                       // first come keeps its lease
    expect(adapter(r, "pc1/eth0")).toMatchObject({ address: "192.168.1.12" });
  });
  it("R19 / R20 router passwords and DHCP lines in running-config; unknown / unsupported commands are refused", () => {
    const r = run(LAB(), [...IFACE, ...POOL, ...rt("r1", ...CONF, "enable secret Rtr5", "service password-encryption", "line vty 0 4", "password v1", "login", "end", "show running-config")]);
    const out = text(r, "r1");
    expect(out).toContain("ip dhcp excluded-address 192.168.1.1 192.168.1.10"); expect(out).toMatch(/ip dhcp pool LAN\n network 192\.168\.1\.0 255\.255\.255\.0\n default-router 192\.168\.1\.1\n dns-server 8\.8\.8\.8/);
    expect(out).toMatch(/^enable secret 5 \S+$/m); expect(out).not.toContain("Rtr5"); expect(out).toMatch(/line vty 0 4\n password 7 [0-9A-F]+\n login/);
    expect((r.state.devices.r1 as { security: Json }).security).toMatchObject({ enableSecret: "Rtr5", vtyPassword: "v1", vtyLogin: true, encryption: true });
    const bad = run(LAB(), rt("r1", ...CONF, "router ospf 1", "ip route 0.0.0.0 0.0.0.0 1.1.1.1", "ip nat inside", "access-list 1 permit any", "ip dhcp pool " + "P".repeat(40), "frobnicate"));
    expect(bad.transcripts.r1.slice(2).every(e => e.result.status !== "ok")).toBe(true);
  });
});
