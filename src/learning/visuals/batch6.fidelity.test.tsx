// @vitest-environment happy-dom
// Batch 6 — SOURCE-FIDELITY + MOTION-SEMANTICS regressions. Renders the actual components and asserts what each SVG
// DOES and does NOT contain, for the routing / switch-services arc (Router on a Stick & Trunk, VTP, ports, DHCP,
// Port Security, device access, WAN, routing protocols, ACL). Motion visuals are checked for causal, one-shot
// sequencing (no stale-restart).
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { render, cleanup } from "@testing-library/react";
import TrunkMultiVlan from "./791381/batch6/TrunkMultiVlan";
import Dot1qTagFrame from "./791381/batch6/Dot1qTagFrame";
import RouterOnAStick from "./791381/batch6/RouterOnAStick";
import InterVlanFlow from "./791381/batch6/InterVlanFlow";
import VtpPropagation from "./791381/batch6/VtpPropagation";
import WellKnownPorts from "./791381/batch6/WellKnownPorts";
import DhcpDora from "./791381/batch6/DhcpDora";
import DhcpPoolExcluded from "./791381/batch6/DhcpPoolExcluded";
import PortSecurityScenario from "./791381/batch6/PortSecurityScenario";
import DeviceAccessPaths from "./791381/batch6/DeviceAccessPaths";
import WanVsLanScope from "./791381/batch6/WanVsLanScope";
import AdminDistance from "./791381/batch6/AdminDistance";
import RoutingUpdateTypes from "./791381/batch6/RoutingUpdateTypes";
import OspfTopology from "./791381/batch6/OspfTopology";
import ShowIpRoute from "./791381/batch6/ShowIpRoute";
import AclGate from "./791381/batch6/AclGate";

afterEach(cleanup);
const text = (n: Element) => n.textContent || "";
const byId = (r: Element, id: string) => r.querySelector(`[id="${id}"]`);

// ── m04 Trunk (PDF 147) ──
describe("Batch 6 — trunk-multi-vlan (PDF 147): one cable, VLAN 10/20/30 tagged", () => {
  it("shows Switch 1 / Switch 2, one Trunk, the three tagged VLANs; no Dot1Q term yet", () => {
    const { container } = render(<TrunkMultiVlan ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Switch 1", "Switch 2", "Trunk", "VLAN 10", "VLAN 20", "VLAN 30", "Tag"]) expect(t).toContain(s);
    expect(container.querySelector('[data-trunk="1"]')).not.toBeNull();
    expect([...container.querySelectorAll("[data-tagvlan]")].map(g => g.getAttribute("data-tagvlan"))).toEqual(["10", "20", "30"]);
    expect(t).not.toContain("Dot1Q");   // Dot1Q term arrives on PDF 152
  });
  it("motion ON: the three tagged frames travel the ONE cable Switch 1 → Switch 2 (left → right), staggered one-shot (freeze)", () => {
    const { container } = render(<TrunkMultiVlan ariaLabel="x" reducedMotion={false} />);
    const xforms = [...container.querySelectorAll("animateTransform")];
    expect(xforms.length).toBe(3);                                   // one traveling frame per VLAN
    const begins = xforms.map(a => a.getAttribute("begin"));
    expect(new Set(begins).size).toBe(3);                            // staggered, not simultaneous
    for (const a of xforms) {
      expect(a.getAttribute("type")).toBe("translate");
      expect(a.getAttribute("fill")).toBe("freeze");                 // one-shot: rests arrived at Switch 2
      const from = a.getAttribute("from")!.split(/\s+/).map(Number);
      const to = a.getAttribute("to")!.split(/\s+/).map(Number);
      expect(to[0]).toBeGreaterThan(from[0]);                        // travels left → right (Switch 1 → Switch 2)
      expect(to[1]).toBe(from[1]);                                   // stays on the single trunk lane (no drift)
    }
  });
  it("reduced motion: NO active animation, but the three tagged frames remain parked along the one cable (complete still frame)", () => {
    const { container } = render(<TrunkMultiVlan ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll("animateTransform").length).toBe(0);
    expect(container.querySelectorAll("animateMotion, animate").length).toBe(0);
    const parked = [...container.querySelectorAll("[data-tagvlan]")];
    expect(parked.length).toBe(3);
    const xs = parked.map(g => Number((g.getAttribute("transform") || "").match(/translate\(([\d.]+)/)?.[1]));
    expect(xs.every(x => Number.isFinite(x))).toBe(true);
    expect(xs[0] < xs[1] && xs[1] < xs[2]).toBe(true);              // spread out along the cable, in order
  });
});

// ── m04 Dot1Q (PDF 152) ──
describe("Batch 6 — dot1q-tag-frame (PDF 152): Dot1Q inserts a VLAN tag", () => {
  it("names Dot1Q and shows the Tag; does not leak the encapsulation command", () => {
    const { container } = render(<Dot1qTagFrame ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Dot1Q", "Tag", "VLAN"]) expect(t).toContain(s);
    expect(container.querySelector('[data-tag="1"]')).not.toBeNull();
    expect(t).not.toContain("encapsulation dot1Q");
  });
  it("reveals the tag once (one-shot, freeze)", () => {
    const { container } = render(<Dot1qTagFrame ariaLabel="x" reducedMotion={false} />);
    const tagIn = byId(container, "tagIn")!;
    expect(tagIn.getAttribute("begin")).not.toContain(".end");
    expect(tagIn.getAttribute("fill")).toBe("freeze");
  });
});

// ── m04 Router on a Stick (PDF 151) ──
describe("Batch 6 — router-on-a-stick (PDF 151): sub-interfaces g0/0.10 & g0/0.20", () => {
  it("shows the router, one Trunk, both sub-interfaces and the two VLAN groups (no IPs on this page)", () => {
    const { container } = render(<RouterOnAStick ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Router", "Switch", "Trunk", "g0/0.10", "g0/0.20", "VLAN 10", "VLAN 20"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-subif]")].map(g => g.getAttribute("data-subif"))).toEqual(["g0/0.10", "g0/0.20"]);
    expect([...container.querySelectorAll("[data-vlangroup]")].map(g => g.getAttribute("data-vlangroup"))).toEqual(["10", "20"]);
    expect(t).not.toContain("192.168");   // addresses arrive on PDF 154
  });
});

// ── m04 Inter-VLAN flow (PDF 156) ──
describe("Batch 6 — inter-vlan-flow (PDF 156): VLAN 10 → router → VLAN 20", () => {
  it("routes one packet from VLAN 10 up to the router and back down to VLAN 20 (causal, one-shot)", () => {
    const { container } = render(<InterVlanFlow ariaLabel="x" reducedMotion={false} />);
    const t = text(container);
    for (const s of ["VLAN 10", "VLAN 20", "Trunk", "g0/0.10", "g0/0.20"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-vlan]")].map(g => g.getAttribute("data-vlan")).sort()).toEqual(["10", "20"]);
    const up = byId(container, "ivrUp")!, down = byId(container, "ivrDown")!;
    expect(down.getAttribute("begin")).toBe("ivrUp.end");            // second leg after the first
    expect(up.getAttribute("begin")).not.toContain(".end");          // one-shot start
    expect(up.getAttribute("fill")).toBe("freeze");
  });
});

// ── m19 VTP (PDF 141) ──
describe("Batch 6 — vtp-propagation (PDF 141): Server defines once, Clients receive", () => {
  it("shows one Server and several Clients over Trunk; no domain/password command leak", () => {
    const { container } = render(<VtpPropagation ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Server", "Client", "VLAN", "Trunk"]) expect(t).toContain(s);
    expect(container.querySelector('[data-role="server"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-role="client"]').length).toBe(3);
    for (const leak of ["Domain", "Password"]) expect(t).not.toContain(leak);   // commands arrive on PDF 142
  });
  it("sends the update once (one-shot, freeze)", () => {
    const { container } = render(<VtpPropagation ariaLabel="x" reducedMotion={false} />);
    const send = byId(container, "vtpSend")!;
    expect(send.getAttribute("begin")).not.toContain(".end");
    expect(send.getAttribute("fill")).toBe("freeze");
  });
});

// ── m21 ports (PDF 168) ──
describe("Batch 6 — well-known-ports (PDF 168): the page's port numbers, FTP 21", () => {
  it("shows the exact services and numbers this page prints (FTP 21, not 20/21)", () => {
    const { container } = render(<WellKnownPorts ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["HTTP", "HTTPS", "DNS", "SSH", "Telnet", "FTP", "SMTP", "POP3", "IMAP"]) expect(t).toContain(s);
    for (const n of ["80", "443", "53", "22", "23", "21", "25", "110", "143"]) expect(t).toContain(n);
    expect([...container.querySelectorAll("[data-port]")].length).toBe(9);
    expect(t).not.toContain("::");   // no IPv6 content on this page
  });
});

// ── m22 DHCP DORA (PDF 170) ──
describe("Batch 6 — dhcp-dora (PDF 170): the four stages in order, correct directions", () => {
  it("shows Discover/Offer/Request/ACK in order between the device and the DHCP server", () => {
    const { container } = render(<DhcpDora ariaLabel="x" reducedMotion={true} />);
    expect([...container.querySelectorAll("[data-step]")].map(g => g.getAttribute("data-step"))).toEqual(["Discover", "Offer", "Request", "ACK"]);
    const t = text(container);
    expect(t).toContain("DORA");
    expect(t).toContain("الجهاز");
    expect(t).toContain("خادم");
  });
  it("plays the stages in causal order, one-shot (Request after Offer, etc.)", () => {
    const { container } = render(<DhcpDora ariaLabel="x" reducedMotion={false} />);
    expect(byId(container, "dora0")!.getAttribute("begin")).not.toContain(".end");
    expect(byId(container, "dora1")!.getAttribute("begin")).toBe("dora0.end");
    expect(byId(container, "dora0")!.getAttribute("fill")).toBe("freeze");
  });
});

// ── m22 DHCP pool (PDF 171) ──
describe("Batch 6 — dhcp-pool-excluded (PDF 171): the example pool is EXACTLY .10–.50, not 'the rest'", () => {
  it("shows the /24 network, the gateway, and the exact .10–.50 distribution range", () => {
    const { container } = render(<DhcpPoolExcluded ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["192.168.1.0/24", "192.168.1.254", ".10", ".50"]) expect(t).toContain(s);
    for (const cmd of ["ip dhcp pool", "default-router", "dns-server", "excluded-address"]) expect(t).not.toContain(cmd);
  });
  it("the POOL element corresponds specifically to 192.168.1.10 – 192.168.1.50", () => {
    const { container } = render(<DhcpPoolExcluded ariaLabel="x" reducedMotion={true} />);
    const pool = container.querySelector('[data-band="pool"]')!;
    expect(pool).not.toBeNull();
    expect(text(pool)).toContain("192.168.1.10");
    expect(text(pool)).toContain("192.168.1.50");
  });
  it("does NOT imply an unspecified 'rest of the /24' pool: shows an explicit out-of-pool band and no 'the rest' language", () => {
    const { container } = render(<DhcpPoolExcluded ariaLabel="x" reducedMotion={true} />);
    // the .51–.253 space is drawn as its own out-of-pool band, not folded into the distribution range
    expect(container.querySelector('[data-band="after"]'), "out-of-pool band").not.toBeNull();
    const t = text(container);
    for (const rest of ["باقي العناوين", "الباقي", "the rest"]) expect(t).not.toContain(rest);
  });
});

// ── m23 Port Security (PDF 181) ──
describe("Batch 6 — port-security-scenario (PDF 181): allow PC0/PC1, deny stranger", () => {
  it("shows two allowed devices and one denied; no sticky / maximum config leak", () => {
    const { container } = render(<PortSecurityScenario ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["PC0", "PC1", "Switch"]) expect(t).toContain(s);
    expect(container.querySelectorAll('[data-allow="1"]').length).toBe(2);
    expect(container.querySelectorAll('[data-deny="1"]').length).toBe(1);
    for (const leak of ["sticky", "maximum 3"]) expect(t).not.toContain(leak);
  });
});

// ── m24 device access (PDF 186) ──
describe("Batch 6 — device-access-paths (PDF 186): Console / VTY / Enable", () => {
  it("shows the three access methods and their line commands; no password value", () => {
    const { container } = render(<DeviceAccessPaths ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Console", "VTY", "Enable", "line vty 0 4", "line console 0", "enable secret"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-access]")].map(g => g.getAttribute("data-access"))).toEqual(["console", "vty", "enable"]);
    expect(t).not.toContain("cisco123");   // the password value is PDF 187
  });
});

// ── m26 WAN (PDF 207) ──
describe("Batch 6 — wan-vs-lan-scope (PDF 207): LAN one building vs WAN across cities", () => {
  it("contrasts LAN and WAN scope; no specific WAN technology named", () => {
    const { container } = render(<WanVsLanScope ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["LAN", "WAN"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-scope]")].map(g => g.getAttribute("data-scope"))).toEqual(["lan", "wan"]);
    for (const leak of ["Frame Relay", "Metro Ethernet"]) expect(t).not.toContain(leak);
  });
});

// ── m27 Administrative Distance (PDF 213) ──
describe("Batch 6 — admin-distance (PDF 213): the exact AD values, smaller is better", () => {
  it("ranks Connected 0 / Static 1 / EIGRP 90 / OSPF 110 / RIP 120 in order", () => {
    const { container } = render(<AdminDistance ariaLabel="x" reducedMotion={true} />);
    expect([...container.querySelectorAll("[data-ad]")].map(g => g.getAttribute("data-ad"))).toEqual(["0", "1", "90", "110", "120"]);
    const t = text(container);
    for (const s of ["Connected", "Static", "EIGRP", "OSPF", "RIP"]) expect(t).toContain(s);
    expect(t).not.toContain("directly connected");   // that phrasing belongs to PDF 222
  });
});

// ── m27 update types (PDF 212) ──
describe("Batch 6 — routing-update-types (PDF 212): periodic vs on-change", () => {
  it("contrasts Distance Vector (EIGRP) and Link-State (OSPF)", () => {
    const { container } = render(<RoutingUpdateTypes ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Distance Vector", "Link-State", "EIGRP", "OSPF"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-update]")].map(g => g.getAttribute("data-update")).sort()).toEqual(["on-change", "periodic"]);
    expect(t).not.toContain("area");   // OSPF areas are PDF 215
  });
});

// ── m27 OSPF topology (PDF 215) ──
describe("Batch 6 — ospf-topology (PDF 215): R1/R2, the three networks, area 0", () => {
  it("shows R1 and R2, the inter-router link and both LANs, in area 0", () => {
    const { container } = render(<OspfTopology ariaLabel="x" reducedMotion={true} />);
    expect([...container.querySelectorAll("[data-router]")].map(g => g.getAttribute("data-router"))).toEqual(["R1", "R2"]);
    const t = text(container);
    for (const s of ["10.0.0.0/30", "192.168.1.0/24", "192.168.2.0/24", "area 0"]) expect(t).toContain(s);
    expect(t).not.toContain("192.168.2.0 0.0.0.255 area 0");   // that exact command line is PDF 217
  });
});

// ── m27 show ip route (PDF 222) ──
describe("Batch 6 — show-ip-route (PDF 222): reading the routing-table fields", () => {
  it("annotates the code, [AD/Metric] and next-hop of the book's sample line", () => {
    const { container } = render(<ShowIpRoute ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["192.168.2.0/24", "[120/1]", "via 192.168.1.1", "directly connected"]) expect(t).toContain(s);
    for (const f of ["code", "admetric", "nexthop"]) expect(container.querySelector(`[data-field="${f}"]`), f).not.toBeNull();
  });
});

// ── m06 ACL (PDF 223) ──
describe("Batch 6 — acl-gate (PDF 223): permit passes, deny stops; placement rule", () => {
  it("shows the permit/deny gate and the Standard/Extended placement; no access-list command leak", () => {
    const { container } = render(<AclGate ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Permit", "Deny", "Standard", "Extended"]) expect(t).toContain(s);
    expect(container.querySelector('[data-decision="permit"]')).not.toBeNull();
    expect(container.querySelector('[data-decision="deny"]')).not.toBeNull();
    for (const leak of ["access-list 10 permit", "access-list 20 deny", "permit host", "permit tcp any any eq 80"]) expect(t).not.toContain(leak);
  });
  it("both packets play once (one-shot, freeze)", () => {
    const { container } = render(<AclGate ariaLabel="x" reducedMotion={false} />);
    for (const id of ["aclPermit", "aclDeny"]) {
      const a = byId(container, id)!;
      expect(a.getAttribute("begin"), id).not.toContain(".end");
      expect(a.getAttribute("fill"), id).toBe("freeze");
    }
  });
});

// ── one-shot motion discipline: NO infinite loops, NO cyclic self-restart anywhere in Batch 6 ──
describe("Batch 6 — one-shot motion discipline (source scan)", () => {
  const dir = resolve(process.cwd(), "src/learning/visuals/791381/batch6") + "/";
  const files = readdirSync(dir).filter(f => f.endsWith(".tsx"));
  const sources = files.map(f => [f, readFileSync(dir + f, "utf8")] as const);

  it("scans every Batch 6 component and finds ZERO infinite animations (no repeatCount=\"indefinite\")", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const [f, src] of sources) {
      expect(src, `${f} must not contain an infinite animation`).not.toContain('repeatCount="indefinite"');
      expect(src, `${f} must not contain any indefinite repeatCount`).not.toMatch(/repeatCount=["'][^"']*indefinite/);
    }
  });

  it("no animation uses a cyclic self-restart begin (the multi-value \"...;X.end\" loop pattern)", () => {
    for (const [f, src] of sources) {
      const begins = src.match(/begin=[`"'][^`"']*[`"']/g) || [];
      for (const b of begins) {
        // a semicolon in a begin list is how SMIL restarts a stage from a later stage's end (e.g. "0s;last.end"),
        // producing an endless cycle. Batch 6 is strictly one-shot, so no begin may contain one.
        expect(b, `${f}: cyclic-restart begin ${b}`).not.toContain(";");
      }
    }
  });
});

// ── cross-cutting: reduced motion removes ALL SMIL animation from every batch-6 visual ──
describe("Batch 6 — reduced motion drops all motion; the animated ones render some when on", () => {
  const ALL = [TrunkMultiVlan, Dot1qTagFrame, RouterOnAStick, InterVlanFlow, VtpPropagation, WellKnownPorts, DhcpDora,
    DhcpPoolExcluded, PortSecurityScenario, DeviceAccessPaths, WanVsLanScope, AdminDistance, RoutingUpdateTypes,
    OspfTopology, ShowIpRoute, AclGate];
  const ANIMATED = [Dot1qTagFrame, InterVlanFlow, VtpPropagation, DhcpDora, RoutingUpdateTypes, AclGate];
  it("no <animateMotion>, no <animate>, and a valid still svg[role=img] for each", () => {
    for (const Comp of ALL) {
      const { container } = render(<Comp ariaLabel="x" reducedMotion={true} />);
      expect(container.querySelectorAll("animateMotion").length, Comp.name).toBe(0);
      expect(container.querySelectorAll("animate").length, Comp.name).toBe(0);
      expect(container.querySelector('svg[role="img"]'), Comp.name).not.toBeNull();
      cleanup();
    }
  });
  it("with motion on, each animated visual renders at least one motion marker", () => {
    for (const Comp of ANIMATED) {
      const { container } = render(<Comp ariaLabel="x" reducedMotion={false} />);
      expect(container.querySelectorAll("animateMotion, animate").length, Comp.name).toBeGreaterThan(0);
      cleanup();
    }
  });
});
