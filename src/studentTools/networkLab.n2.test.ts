// N2 (docs/enterprise-network-lab-tool-design.md §7) — the network lab's extensions, each on a network BUILT with the lab's operations and
// replayed by the lab (netLabReplay → networkTopology@2's runtime + the lab hooks):
//   • the hub repeats frames; serial WAN links between routers (HDLC / PPP must match);
//   • static routes over several routers (next hop, exit interface, default route) and multi-hop tracert;
//   • RIP, OSPF and EIGRP build the routes from real adjacencies (AS / area must match) and `show ip route` names them;
//   • standard and extended ACLs (implicit deny; ICMP denied while HTTP passes); static NAT and PAT;
//   • IPv6: addresses, `ipv6 unicast-routing`, static IPv6 routes, ping / tracert, ipconfig;
//   • the exam stays as it was: networkTopology@2's validator refuses a hub, a serial cable or attached hooks, and its router CLI still
//     answers `ip route` / `router ospf` / `access-list` with «not supported».
import { describe, it, expect } from "vitest";
import { validateNet2Config } from "../net2Model";
import { replayNet2 } from "../net2Plugin";
import { EMPTY_LAB, addDevice, addLink, appendActions, parseLab, serializeLab, type LabDeviceKind, type NetLab, type NetLabResult } from "./networkLab";
import { replayLab } from "./netLabReplay";
import { labEngineConfig } from "./netLabEngine";

const ok = (r: NetLabResult): NetLab => { if (!r.ok) throw new Error(r.message); return r.lab; };
const devices = (...kinds: LabDeviceKind[]) => kinds.reduce((l, k) => ok(addDevice(l, k)), EMPTY_LAB);
const cable = (lab: NetLab, a: string, ap: string, b: string, bp: string) => ok(addLink(lab, { deviceId: a, port: ap }, { deviceId: b, port: bp }));
const ip = (deviceId: string, address: string, gateway = "", mask = "255.255.255.0") => ({ type: "host.setStatic", deviceId, adapter: "eth0", address, mask, gateway, dns: "" });
const cli = (deviceId: string, ...lines: string[]) => ["enable", "configure terminal", ...lines, "end"].map(command => ({ type: "router.command", deviceId, command }));
const cmd = (deviceId: string, command: string) => ({ type: "host.command", deviceId, command });
const run = (lab: NetLab, ...more: unknown[][]) => ok(appendActions(lab, more.flat()));
function out(lab: NetLab, id: string): string {
  const r = replayLab(lab.config, lab.actions).replay;
  if (!r.ok) throw new Error(r.code);
  const t = r.transcripts[id];
  return t[t.length - 1].result.output.join("\n");
}
const pingOk = (lab: NetLab, from: string, to: string) => /Reply from/.test(out(run(lab, [cmd(from, "ping " + to)]), from));
const show = (lab: NetLab, r: string, what: string) => out(run(lab, [{ type: "router.command", deviceId: r, command: "show " + what }]), r);

/** PC1 — R1 ═serial═ R2 — PC2 (192.168.1.0/24 · 10.0.0.0/30 · 192.168.2.0/24), interfaces up, no routes yet. */
function wan(): NetLab {
  let lab = devices("router", "router", "pc", "pc");
  lab = cable(lab, "r1", "g0/0", "pc1", "eth0"); lab = cable(lab, "r1", "s0/0/0", "r2", "s0/0/0"); lab = cable(lab, "r2", "g0/0", "pc2", "eth0");
  return run(lab, [ip("pc1", "192.168.1.10", "192.168.1.1"), ip("pc2", "192.168.2.10", "192.168.2.1")],
    cli("r1", "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface s0/0/0", "ip address 10.0.0.1 255.255.255.252", "clock rate 64000", "no shutdown"),
    cli("r2", "interface g0/0", "ip address 192.168.2.1 255.255.255.0", "no shutdown", "interface serial0/0/0", "ip address 10.0.0.2 255.255.255.252", "no shutdown"));
}
/** PC1 — R1 ═ R2 ═ R3 — PC3 over two serial links (10.0.12.0/30, 10.0.23.0/30), no routing yet. */
function chain(): NetLab {
  let lab = devices("router", "router", "router", "pc", "pc");
  lab = cable(lab, "r1", "g0/0", "pc1", "eth0"); lab = cable(lab, "r1", "s0/0/0", "r2", "s0/0/0"); lab = cable(lab, "r2", "s0/0/1", "r3", "s0/0/0"); lab = cable(lab, "r3", "g0/0", "pc2", "eth0");
  return run(lab, [ip("pc1", "192.168.1.10", "192.168.1.1"), ip("pc2", "192.168.3.10", "192.168.3.1")],
    cli("r1", "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface s0/0/0", "ip address 10.0.12.1 255.255.255.252", "no shutdown"),
    cli("r2", "interface s0/0/0", "ip address 10.0.12.2 255.255.255.252", "no shutdown", "interface s0/0/1", "ip address 10.0.23.1 255.255.255.252", "no shutdown"),
    cli("r3", "interface g0/0", "ip address 192.168.3.1 255.255.255.0", "no shutdown", "interface s0/0/0", "ip address 10.0.23.2 255.255.255.252", "no shutdown"));
}

describe("the hub and the serial WAN link", () => {
  it("a hub repeats frames: three PCs on a hub ping each other", () => {
    let lab = devices("hub", "pc", "pc", "pc");
    for (const [i, pc] of ["pc1", "pc2", "pc3"].entries()) lab = cable(lab, "hub1", "f0/" + (i + 1), pc, "eth0");
    lab = run(lab, [ip("pc1", "10.1.1.1"), ip("pc2", "10.1.1.2"), ip("pc3", "10.1.1.3")]);
    expect(pingOk(lab, "pc1", "10.1.1.3")).toBe(true);
    expect(pingOk(lab, "pc3", "10.1.1.2")).toBe(true);
  });
  it("a serial cable joins two routers' serial ports only; the routers' serial addresses answer; a PPP / HDLC mismatch keeps it down", () => {
    expect(addLink(devices("router", "pc"), { deviceId: "r1", port: "s0/0/0" }, { deviceId: "pc1", port: "eth0" }).ok).toBe(false);
    expect(addLink(devices("router", "router"), { deviceId: "r1", port: "s0/0/0" }, { deviceId: "r2", port: "g0/0" }).ok).toBe(false);
    const lab = wan();
    expect(show(lab, "r1", "ip interface brief")).toMatch(/Serial0\/0\/0\s+10\.0\.0\.1\s+YES manual up\s+up/);
    expect(pingOk(lab, "pc1", "10.0.0.1")).toBe(true);                       // its own router's far interface
    const ppp = run(lab, cli("r1", "interface s0/0/0", "encapsulation ppp"));
    expect(show(ppp, "r1", "ip interface brief")).toMatch(/Serial0\/0\/0\s+10\.0\.0\.1\s+YES manual down\s+down/);
    expect(show(run(ppp, cli("r2", "interface s0/0/0", "encapsulation ppp")), "r1", "ip interface brief")).toMatch(/Serial0\/0\/0\s+10\.0\.0\.1\s+YES manual up\s+up/);
  });
});

describe("static routing over several routers", () => {
  it("without routes the far LAN is unreachable; `ip route` on both routers makes it reachable; tracert lists both routers", () => {
    const lab = wan();
    expect(pingOk(lab, "pc1", "192.168.2.10")).toBe(false);
    const routed = run(lab, cli("r1", "ip route 192.168.2.0 255.255.255.0 10.0.0.2"), cli("r2", "ip route 192.168.1.0 255.255.255.0 10.0.0.1"));
    expect(pingOk(routed, "pc1", "192.168.2.10")).toBe(true);
    const trace = out(run(routed, [cmd("pc1", "tracert 192.168.2.10")]), "pc1");
    expect(trace).toMatch(/1 +0 ms.*192\.168\.1\.1[\s\S]*2 +0 ms.*10\.0\.0\.2[\s\S]*3 +0 ms.*192\.168\.2\.10/);
    expect(show(routed, "r1", "ip route")).toMatch(/S +192\.168\.2\.0\/24 \[1\/0\] via 10\.0\.0\.2/);
    // only one direction routed: the request arrives but the reply has no way back
    expect(pingOk(run(lab, cli("r1", "ip route 192.168.2.0 255.255.255.0 10.0.0.2")), "pc1", "192.168.2.10")).toBe(false);
  });
  it("a default route to an exit interface works, and is the gateway of last resort", () => {
    const lab = run(wan(), cli("r1", "ip route 0.0.0.0 0.0.0.0 s0/0/0"), cli("r2", "ip route 0.0.0.0 0.0.0.0 serial0/0/0"));
    expect(pingOk(lab, "pc1", "192.168.2.10")).toBe(true);
    expect(show(lab, "r1", "ip route")).toMatch(/Gateway of last resort is 0\.0\.0\.0 to network 0\.0\.0\.0[\s\S]*S\* +0\.0\.0\.0\/0 is directly connected, Serial0\/0\/0/);
  });
  it("bad static routes are refused with the IOS message", () => {
    expect(show(run(wan(), cli("r1", "ip route 192.168.2.1 255.255.255.0 10.0.0.2")), "r1", "running-config")).not.toMatch(/ip route/);
    expect(out(run(wan(), [{ type: "router.command", deviceId: "r1", command: "ip route 1.0.0.0 255.0.0.0 10.0.0.2" }]), "r1")).toMatch(/Invalid input|not available/);
  });
});

describe("dynamic routing", () => {
  it("OSPF: adjacencies over both links, routes marked O, the far LAN reachable; a different area forms no adjacency", () => {
    const ospf = (r: string, ...nets: string[]) => cli(r, "router ospf 1", ...nets.map(n => "network " + n + " 0.0.0.255 area 0"));
    const lab = run(chain(), ospf("r1", "192.168.1.0", "10.0.12.0"), ospf("r2", "10.0.12.0", "10.0.23.0"), ospf("r3", "10.0.23.0", "192.168.3.0"));
    expect(pingOk(lab, "pc1", "192.168.3.10")).toBe(true);
    expect(show(lab, "r1", "ip route")).toMatch(/O +192\.168\.3\.0\/24 \[110\/129\] via 10\.0\.12\.2/);
    expect(show(lab, "r2", "ip ospf neighbor").split("\n").filter(x => /FULL/.test(x)).length).toBe(2);
    const wrongArea = run(chain(), ospf("r1", "192.168.1.0", "10.0.12.0"), cli("r2", "router ospf 1", "network 10.0.12.0 0.0.0.255 area 1", "network 10.0.23.0 0.0.0.255 area 0"), ospf("r3", "10.0.23.0", "192.168.3.0"));
    expect(pingOk(wrongArea, "pc1", "192.168.3.10")).toBe(false);
  });
  it("RIP: classful network statements, routes marked R with hop counts", () => {
    const rip = (r: string, ...nets: string[]) => cli(r, "router rip", "version 2", ...nets.map(n => "network " + n), "no auto-summary");
    const lab = run(chain(), rip("r1", "192.168.1.0", "10.0.0.0"), rip("r2", "10.0.0.0"), rip("r3", "10.0.0.0", "192.168.3.0"));
    expect(pingOk(lab, "pc1", "192.168.3.10")).toBe(true);
    expect(show(lab, "r1", "ip route")).toMatch(/R +192\.168\.3\.0\/24 \[120\/2\] via 10\.0\.12\.2/);
    expect(show(lab, "r1", "ip protocols")).toMatch(/Routing Protocol is "rip"[\s\S]*10\.0\.12\.2/);
  });
  it("EIGRP: the same AS forms adjacencies (routes D); a different AS does not", () => {
    const eigrp = (r: string, as: number, ...nets: string[]) => cli(r, "router eigrp " + as, ...nets.map(n => "network " + n));
    const lab = run(chain(), eigrp("r1", 10, "192.168.1.0", "10.0.0.0"), eigrp("r2", 10, "10.0.0.0"), eigrp("r3", 10, "10.0.0.0", "192.168.3.0"));
    expect(pingOk(lab, "pc1", "192.168.3.10")).toBe(true);
    expect(show(lab, "r1", "ip route")).toMatch(/D +192\.168\.3\.0\/24 \[90\/\d+\] via 10\.0\.12\.2/);
    expect(pingOk(run(chain(), eigrp("r1", 10, "192.168.1.0", "10.0.0.0"), eigrp("r2", 20, "10.0.0.0"), eigrp("r3", 10, "10.0.0.0", "192.168.3.0")), "pc1", "192.168.3.10")).toBe(false);
  });
  it("a static route beats a dynamic one (administrative distance 1 < 110)", () => {
    const lab = run(chain(), cli("r1", "router ospf 1", "network 10.0.12.0 0.0.0.3 area 0", "network 192.168.1.0 0.0.0.255 area 0", "exit", "ip route 192.168.3.0 255.255.255.0 10.0.12.2"),
      cli("r2", "router ospf 1", "network 10.0.0.0 0.255.255.255 area 0"), cli("r3", "router ospf 1", "network 10.0.23.0 0.0.0.3 area 0", "network 192.168.3.0 0.0.0.255 area 0"));
    const table = show(lab, "r1", "ip route");
    expect(table).toMatch(/S +192\.168\.3\.0\/24 \[1\/0\]/);
    expect(table).not.toMatch(/O +192\.168\.3\.0/);
  });
});

describe("ACLs and NAT", () => {
  const routed = () => run(wan(), cli("r1", "ip route 192.168.2.0 255.255.255.0 10.0.0.2"), cli("r2", "ip route 192.168.1.0 255.255.255.0 10.0.0.1"));
  it("a standard ACL inbound on R2's serial denies PC1 (implicit deny after the last line); `permit any` restores the others", () => {
    const lab = run(routed(), cli("r2", "access-list 1 deny host 192.168.1.10", "interface s0/0/0", "ip access-group 1 in"));
    expect(pingOk(lab, "pc1", "192.168.2.10")).toBe(false);
    expect(show(lab, "r2", "access-lists")).toMatch(/Standard IP access list 1\n +10 deny host 192\.168\.1\.10/);
  });
  it("an extended ACL denies ICMP while HTTP to the server still passes", () => {
    let lab = devices("router", "router", "pc", "server");
    lab = cable(lab, "r1", "g0/0", "pc1", "eth0"); lab = cable(lab, "r1", "s0/0/0", "r2", "s0/0/0"); lab = cable(lab, "r2", "g0/0", "srv1", "eth0");
    lab = run(lab, [ip("pc1", "192.168.1.10", "192.168.1.1"), ip("srv1", "192.168.2.80", "192.168.2.1"), { type: "server.setHttp", deviceId: "srv1", enabled: true, title: "Lab", body: "hello" }],
      cli("r1", "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "interface s0/0/0", "ip address 10.0.0.1 255.255.255.252", "no shutdown", "ip route 0.0.0.0 0.0.0.0 10.0.0.2"),
      cli("r2", "interface g0/0", "ip address 192.168.2.1 255.255.255.0", "no shutdown", "interface s0/0/0", "ip address 10.0.0.2 255.255.255.252", "no shutdown", "ip route 0.0.0.0 0.0.0.0 10.0.0.1",
        "access-list 100 deny icmp any any", "access-list 100 permit ip any any", "interface s0/0/0", "ip access-group 100 in"));
    expect(pingOk(lab, "pc1", "192.168.2.80")).toBe(false);
    expect(out(run(lab, [{ type: "host.browse", deviceId: "pc1", url: "http://192.168.2.80" }]), "pc1")).toMatch(/HTTP\/1\.1 200 OK/);
  });
  it("PAT: the inside LAN reaches a network that has no route back to it, translated to R1's serial address", () => {
    const base = run(wan(), cli("r1", "ip route 0.0.0.0 0.0.0.0 10.0.0.2"));
    expect(pingOk(base, "pc1", "192.168.2.10")).toBe(false);                 // R2 has no route back to 192.168.1.0/24
    const pat = run(base, cli("r1", "access-list 1 permit 192.168.1.0 0.0.0.255", "ip nat inside source list 1 interface s0/0/0 overload", "interface g0/0", "ip nat inside", "interface s0/0/0", "ip nat outside"));
    expect(pingOk(pat, "pc1", "192.168.2.10")).toBe(true);
    expect(show(pat, "r1", "running-config")).toMatch(/ip nat inside source list 1 interface Serial0\/0\/0 overload/);
  });
  it("static NAT: the outside reaches the inside PC at its global address", () => {
    const lab = run(wan(), cli("r1", "ip route 0.0.0.0 0.0.0.0 10.0.0.2", "ip nat inside source static 192.168.1.10 200.0.0.10", "interface g0/0", "ip nat inside", "interface s0/0/0", "ip nat outside"),
      cli("r2", "ip route 200.0.0.0 255.255.255.0 10.0.0.1"));
    expect(pingOk(lab, "pc2", "200.0.0.10")).toBe(true);
    expect(pingOk(lab, "pc2", "192.168.1.10")).toBe(false);                 // the inside address is not routed outside
    expect(show(lab, "r1", "ip nat translations")).toMatch(/200\.0\.0\.10 +192\.168\.1\.10/);
  });
});

describe("IPv6", () => {
  const v6 = (deviceId: string, address: string, gateway: string) => ({ type: "host.setIpv6", deviceId, adapter: "eth0", address, gateway });
  const lab6 = (routing: boolean) => run(wan(), [v6("pc1", "2001:db8:1::10/64", "2001:db8:1::1"), v6("pc2", "2001:DB8:2:0::10/64", "2001:db8:2::1")],
    cli("r1", ...(routing ? ["ipv6 unicast-routing"] : []), "interface g0/0", "ipv6 address 2001:db8:1::1/64", "interface s0/0/0", "ipv6 address 2001:db8:12::1/64", "exit", "ipv6 route 2001:db8:2::/64 2001:db8:12::2"),
    cli("r2", ...(routing ? ["ipv6 unicast-routing"] : []), "interface g0/0", "ipv6 address 2001:db8:2::1/64", "interface s0/0/0", "ipv6 address 2001:db8:12::2/64", "exit", "ipv6 route 2001:db8:1::/64 2001:db8:12::1"));
  it("ping and tracert over two routers with static IPv6 routes; without `ipv6 unicast-routing` nothing is forwarded", () => {
    const lab = lab6(true);
    expect(out(run(lab, [cmd("pc1", "ping 2001:db8:2::10")]), "pc1")).toMatch(/Reply from 2001:db8:2::10/);
    expect(out(run(lab, [cmd("pc1", "tracert 2001:db8:2::10")]), "pc1")).toMatch(/1 .*2001:db8:1::1[\s\S]*2 .*2001:db8:12::2[\s\S]*3 .*2001:db8:2::10/);
    expect(out(run(lab, [cmd("pc1", "ping 2001:db8:1::1")]), "pc1")).toMatch(/Reply from/);
    expect(out(run(lab6(false), [cmd("pc1", "ping 2001:db8:2::10")]), "pc1")).toMatch(/Request timed out/);
    expect(out(run(lab, [cmd("pc1", "ipconfig")]), "pc1")).toMatch(/IPv6 Address[ .]*: 2001:db8:1::10\/64/);
    expect(show(lab, "r1", "ipv6 route")).toMatch(/S +2001:DB8:2::\/64 \[1\/0\]/);
  });
  it("bad IPv6 values are refused", () => {
    expect(appendActions(wan(), [v6("pc1", "2001:db8::zz/64", "")]).ok).toBe(false);
    expect(appendActions(wan(), [v6("pc1", "fe80::1/64", "")]).ok).toBe(false);    // link-local is not a host's global address here
    const lines = ["enable", "configure terminal", "interface g0/0", "ipv6 address 2001:db8:1::1"].map(command => ({ type: "router.command", deviceId: "r1", command }));
    expect(out(run(wan(), lines), "r1")).toMatch(/expected: ipv6 address/);
  });
});

describe("the exam stays as it was", () => {
  it("networkTopology@2's validator refuses a hub, a serial cable and attached hooks", () => {
    const lab = wan();
    expect(validateNet2Config(lab.config).ok).toBe(false);                   // the serial cable
    expect(validateNet2Config(devices("hub").config).ok).toBe(false);
    expect(validateNet2Config(labEngineConfig(devices("router").config, { routers: {}, hosts6: {} })).ok).toBe(false);
    expect(validateNet2Config(devices("router").config).ok).toBe(true);
  });
  it("networkTopology@2's router CLI still answers the lab's commands with «not supported»", () => {
    const cfg = devices("router").config;
    const r = replayNet2(cfg, cli("r1", "ip route 0.0.0.0 0.0.0.0 10.0.0.1", "router ospf 1", "access-list 1 permit any"));
    if (!r.ok) throw new Error(r.code);
    expect(r.transcripts.r1.filter(e => e.result.status === "not-supported").length).toBe(3);
  });
  it("a lab network with hubs and serial links round-trips through its file", () => {
    const withHub = cable(ok(addDevice(wan(), "hub")), "hub1", "f0/1", "r2", "g0/1");
    expect(ok(parseLab(serializeLab(withHub)))).toEqual(withHub);
  });
});
