// @vitest-environment happy-dom
// Batch 9 (FINAL) — SOURCE-FIDELITY + MOTION-SEMANTICS regressions for the eleven NEW summary/ACL visuals. Renders
// the actual components and asserts what each SVG DOES and does NOT contain: Standard ACL is source-only, Extended
// ACL evaluates exactly source+destination+protocol+port, the subnetting example is the book's own 192.168.1.25/24,
// the wildcard inversion carries the exact 255.255.255.0 → 0.0.0.255 values, the TCP handshake plays SYN → SYN-ACK →
// ACK causally, the website journey follows the printed DNS → ARP → TCP → HTTP order, and the troubleshooting map
// invents no command output. Motion visuals are finite one-shot (no stale-restart, no infinite repeat).
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { render, cleanup } from "@testing-library/react";
import StandardAclSource from "./791381/batch9/StandardAclSource";
import ExtendedAclDecision from "./791381/batch9/ExtendedAclDecision";
import IpVsMacSummary from "./791381/batch9/IpVsMacSummary";
import NetworkDeviceRoles from "./791381/batch9/NetworkDeviceRoles";
import CableMediaOverview from "./791381/batch9/CableMediaOverview";
import SubnettingWalkthrough from "./791381/batch9/SubnettingWalkthrough";
import WildcardInversion from "./791381/batch9/WildcardInversion";
import NatPatApipa from "./791381/batch9/NatPatApipa";
import TcpThreeWayHandshake from "./791381/batch9/TcpThreeWayHandshake";
import WebOpeningJourney from "./791381/batch9/WebOpeningJourney";
import TroubleshootingCommandMap from "./791381/batch9/TroubleshootingCommandMap";

afterEach(cleanup);
const text = (n: Element) => n.textContent || "";
const byId = (r: Element, id: string) => r.querySelector(`[id="${id}"]`);
const attrs = (r: Element, sel: string, name: string) => [...r.querySelectorAll(sel)].map(g => g.getAttribute(name));

// ── m06 Standard ACL (PDF 224): SOURCE ONLY ──
describe("Batch 9 — standard-acl-source (PDF 224): the decision is on the SOURCE only", () => {
  it("shows source → ACL → permit/deny and reads ONLY the source; no destination/protocol/port criterion", () => {
    const { container } = render(<StandardAclSource ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["المصدر", "ACL", "1–99", "Permit", "Deny"]) expect(t).toContain(s);
    expect(attrs(container, "[data-reads]", "data-reads")).toEqual(["source"]);
    expect(container.querySelector('[data-decision="permit"]')).not.toBeNull();
    expect(container.querySelector('[data-decision="deny"]')).not.toBeNull();
    // the Extended-only criteria must NOT appear on the Standard page
    for (const banned of ["الوجهة", "Destination", "البروتوكول", "Protocol", "المنفذ", "Port", "TCP", "eq 80"]) expect(t).not.toContain(banned);
  });
  it("the source packet plays once (one-shot, freeze)", () => {
    const { container } = render(<StandardAclSource ariaLabel="x" reducedMotion={false} />);
    const a = byId(container, "stdIn")!;
    expect(a.getAttribute("begin")).not.toContain(".end");
    expect(a.getAttribute("fill")).toBe("freeze");
  });
});

// ── m06 Extended ACL (PDF 227): source + destination + protocol + port ──
describe("Batch 9 — extended-acl-decision (PDF 227): exactly four evaluated fields", () => {
  it("evaluates source, destination, protocol and port (in that order) and shows the 100–199 range; no raw command line", () => {
    const { container } = render(<ExtendedAclDecision ariaLabel="x" reducedMotion={true} />);
    expect(attrs(container, "[data-field]", "data-field")).toEqual(["source", "destination", "protocol", "port"]);
    const t = text(container);
    for (const s of ["TCP", "80", "443", "100–199", "Permit", "Deny"]) expect(t).toContain(s);
    expect(t).not.toContain("access-list 100 permit tcp any any eq 80");
  });
  it("reveals the fields in order, one-shot (freeze)", () => {
    const { container } = render(<ExtendedAclDecision ariaLabel="x" reducedMotion={false} />);
    expect(byId(container, "ext0")!.getAttribute("begin")).not.toContain(".end");
    expect(byId(container, "ext1")!.getAttribute("begin")).toBe("ext0.end");
    expect(byId(container, "ext0")!.getAttribute("fill")).toBe("freeze");
  });
});

// ── m28 IP vs MAC (PDF 231) ──
describe("Batch 9 — ip-vs-mac-summary (PDF 231): logical 32-bit vs physical 48-bit", () => {
  it("contrasts IP (logical, 32 bit) and MAC (physical, 48 bit); no ARP mechanics", () => {
    const { container } = render(<IpVsMacSummary ariaLabel="x" reducedMotion={true} />);
    expect(attrs(container, "[data-side]", "data-side")).toEqual(["ip", "mac"]);
    const t = text(container);
    for (const s of ["IP", "MAC", "32 bit", "48 bit", "منطقي", "فيزيائي"]) expect(t).toContain(s);
    expect(t).not.toContain("ARP");
  });
});

// ── m28 device roles (PDF 234) ──
describe("Batch 9 — network-device-roles (PDF 234): exactly the five printed devices + layers", () => {
  it("lists Hub / Switch / Router / Access Point / Modem with their exact layers; no extra device", () => {
    const { container } = render(<NetworkDeviceRoles ariaLabel="x" reducedMotion={true} />);
    expect(attrs(container, "[data-device]", "data-device")).toEqual(["Hub", "Switch", "Router", "Access Point", "Modem"]);
    expect(attrs(container, "[data-device]", "data-layer")).toEqual(["Physical", "Data Link", "Network", "Data Link", "Physical"]);
    const t = text(container);
    for (const banned of ["Firewall", "Repeater", "Bridge", "Gateway"]) expect(t).not.toContain(banned);
  });
});

// ── m28 cable & media (PDF 235) ──
describe("Batch 9 — cable-media-overview (PDF 235): the three cables and three wiring uses", () => {
  it("shows UTP/STP/Fiber cables and Straight/Cross/Roll-over wiring; no invented speed/distance figure", () => {
    const { container } = render(<CableMediaOverview ariaLabel="x" reducedMotion={true} />);
    expect(attrs(container, "[data-cable]", "data-cable")).toEqual(["UTP", "STP", "Fiber"]);
    expect(attrs(container, "[data-wiring]", "data-wiring")).toEqual(["Straight", "Cross", "Roll-over"]);
    const t = text(container);
    for (const banned of ["Gbps", "Mbps", "100 م", "عدّة كم"]) expect(t).not.toContain(banned);
  });
});

// ── m28 subnetting (PDF 242): the book's own example ──
describe("Batch 9 — subnetting-walkthrough (PDF 242): the exact 192.168.1.25/24 example", () => {
  it("separates network vs host at /24 and shows the four computed results verbatim", () => {
    const { container } = render(<SubnettingWalkthrough ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["192.168.1.25", "/24", "192.168.1.0", "192.168.1.1", "192.168.1.254", "192.168.1.255"]) expect(t).toContain(s);
    expect(attrs(container, "[data-band]", "data-band")).toEqual(["network", "network", "network", "host"]);
    expect(attrs(container, "[data-result]", "data-result")).toEqual(["الشبكة", "أول جهاز", "آخر جهاز", "البث"]);
    // no OTHER example is invented
    expect(t).not.toContain("10.5.6.7");
    expect(t).not.toContain("172.16");
  });
  it("reveals the results in order, one-shot (freeze)", () => {
    const { container } = render(<SubnettingWalkthrough ariaLabel="x" reducedMotion={false} />);
    expect(byId(container, "sub0")!.getAttribute("begin")).not.toContain(".end");
    expect(byId(container, "sub1")!.getAttribute("begin")).toBe("sub0.end");
    expect(byId(container, "sub0")!.getAttribute("fill")).toBe("freeze");
  });
});

// ── m28 wildcard (PDF 243): exact inversion ──
describe("Batch 9 — wildcard-inversion (PDF 243): 255.255.255.0 → 0.0.0.255", () => {
  it("carries the exact mask and wildcard octets and the 255 − rule", () => {
    const { container } = render(<WildcardInversion ariaLabel="x" reducedMotion={true} />);
    expect(attrs(container, "[data-mask]", "data-mask")).toEqual(["255", "255", "255", "0"]);
    expect(attrs(container, "[data-wildcard]", "data-wildcard")).toEqual(["0", "0", "0", "255"]);
    expect(text(container)).toContain("255 −");
  });
  it("each octet transforms causally, one-shot (freeze)", () => {
    const { container } = render(<WildcardInversion ariaLabel="x" reducedMotion={false} />);
    expect(byId(container, "wc0")!.getAttribute("begin")).not.toContain(".end");
    expect(byId(container, "wc1")!.getAttribute("begin")).toBe("wc0.end");
    expect(byId(container, "wc3")!.getAttribute("begin")).toBe("wc2.end");
    expect(byId(container, "wc0")!.getAttribute("fill")).toBe("freeze");
  });
});

// ── m28 NAT / PAT / APIPA (PDF 258) ──
describe("Batch 9 — nat-pat-apipa (PDF 258): three separate concepts, APIPA is not a NAT mode", () => {
  it("keeps NAT / PAT / APIPA distinct; APIPA sits in a separate family with its 169.254 fallback", () => {
    const { container } = render(<NatPatApipa ariaLabel="x" reducedMotion={true} />);
    expect(attrs(container, "[data-concept]", "data-concept")).toEqual(["NAT", "PAT", "APIPA"]);
    // NAT + PAT are the translation family; APIPA is the separate fallback family
    const apipa = container.querySelector('[data-family="fallback"]')!;
    expect(apipa).not.toBeNull();
    expect(apipa.querySelector('[data-concept="APIPA"]')).not.toBeNull();
    expect(apipa.querySelector('[data-concept="NAT"]')).toBeNull();
    const trans = container.querySelector('[data-family="translation"]')!;
    expect(trans.querySelector('[data-concept="APIPA"]')).toBeNull();
    const t = text(container);
    for (const s of ["169.254", "Ports", "DHCP"]) expect(t).toContain(s);
  });
});

// ── m28 TCP handshake (PDF 260): causal SYN → SYN-ACK → ACK ──
describe("Batch 9 — tcp-three-way-handshake (PDF 260): SYN → SYN-ACK → ACK causally", () => {
  it("shows the three steps in order between client and server; no sequence-number fields drawn", () => {
    const { container } = render(<TcpThreeWayHandshake ariaLabel="x" reducedMotion={true} />);
    expect(attrs(container, "[data-step]", "data-step")).toEqual(["SYN", "SYN-ACK", "ACK"]);
    const t = text(container);
    for (const s of ["العميل", "الخادم"]) expect(t).toContain(s);
    expect(t).not.toContain("Seq=");
    expect(t).not.toContain("Ack=");
  });
  it("SYN arrives before SYN-ACK before ACK, one-shot (freeze)", () => {
    const { container } = render(<TcpThreeWayHandshake ariaLabel="x" reducedMotion={false} />);
    expect(byId(container, "hs0")!.getAttribute("begin")).not.toContain(".end");
    expect(byId(container, "hs1")!.getAttribute("begin")).toBe("hs0.end");   // SYN-ACK after SYN
    expect(byId(container, "hs2")!.getAttribute("begin")).toBe("hs1.end");   // ACK after SYN-ACK
    expect(byId(container, "hs0")!.getAttribute("fill")).toBe("freeze");
  });
});

// ── m28 website journey (PDF 261): exact printed order ──
describe("Batch 9 — web-opening-journey (PDF 261): DNS → ARP → TCP → HTTP in the printed order", () => {
  it("shows the four stages in the exact page order with their notes", () => {
    const { container } = render(<WebOpeningJourney ariaLabel="x" reducedMotion={true} />);
    expect(attrs(container, "[data-stage]", "data-stage")).toEqual(["DNS", "ARP", "TCP Handshake", "HTTP/HTTPS"]);
    const t = text(container);
    for (const s of ["UDP 53", "Broadcast", "80/443"]) expect(t).toContain(s);
  });
  it("each stage follows the previous causally, one-shot (freeze)", () => {
    const { container } = render(<WebOpeningJourney ariaLabel="x" reducedMotion={false} />);
    expect(byId(container, "j0")!.getAttribute("begin")).not.toContain(".end");
    expect(byId(container, "j1")!.getAttribute("begin")).toBe("j0.end");
    expect(byId(container, "j3")!.getAttribute("begin")).toBe("j2.end");
    expect(byId(container, "j0")!.getAttribute("fill")).toBe("freeze");
  });
});

// ── m28 troubleshooting map (PDF 262): decision map, NOT a terminal ──
describe("Batch 9 — troubleshooting-command-map (PDF 262): question → command, no invented output", () => {
  it("maps the exact six CMD and six Show commands split by context; no fabricated command output", () => {
    const { container } = render(<TroubleshootingCommandMap ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll("[data-cmd]").length).toBe(6);
    expect(container.querySelectorAll("[data-show]").length).toBe(6);
    const t = text(container);
    for (const s of ["ping 8.8.8.8", "tracert", "nslookup", "arp -a", "show vlan brief", "show vtp status", "show spanning-tree"]) expect(t).toContain(s);
    for (const s of ["CMD", "Show"]) expect(t).toContain(s);
    // it is a conceptual map, never a terminal with fake output
    for (const fake of ["Reply from", "bytes=", "VTP Operating Mode", "Type   Mode", "C:\\>", "Switch#"]) expect(t).not.toContain(fake);
  });
});

// ── one-shot motion discipline: NO infinite loops, NO cyclic self-restart anywhere in Batch 9 ──
describe("Batch 9 — one-shot motion discipline (source scan)", () => {
  const dir = resolve(process.cwd(), "src/learning/visuals/791381/batch9") + "/";
  const files = readdirSync(dir).filter(f => f.endsWith(".tsx"));
  const sources = files.map(f => [f, readFileSync(dir + f, "utf8")] as const);

  it("has exactly the eleven Batch 9 component files", () => {
    expect(files.length).toBe(11);
  });
  it("scans every Batch 9 component and finds ZERO infinite animations (no indefinite repeatCount)", () => {
    for (const [f, src] of sources) {
      expect(src, `${f} must not contain an infinite animation`).not.toContain('repeatCount="indefinite"');
      expect(src, `${f} must not contain any indefinite repeatCount`).not.toMatch(/repeatCount=["'][^"']*indefinite/);
    }
  });
  it("no animation uses a cyclic self-restart begin (the multi-value \"...;X.end\" loop pattern)", () => {
    for (const [f, src] of sources) {
      const begins = src.match(/begin=[`"'][^`"']*[`"']/g) || [];
      for (const b of begins) expect(b, `${f}: cyclic-restart begin ${b}`).not.toContain(";");
    }
  });
  it("uses no infinite CSS animation class (finite one-shot SMIL only)", () => {
    for (const [f, src] of sources) expect(src, `${f} must not use a CSS -anim class`).not.toMatch(/eb-visual-[a-z]+-anim/);
  });
});

// ── cross-cutting: reduced motion removes ALL SMIL animation; the six animated ones render some when on ──
describe("Batch 9 — reduced motion drops all motion; the animated ones render some when on", () => {
  const ALL = [StandardAclSource, ExtendedAclDecision, IpVsMacSummary, NetworkDeviceRoles, CableMediaOverview,
    SubnettingWalkthrough, WildcardInversion, NatPatApipa, TcpThreeWayHandshake, WebOpeningJourney, TroubleshootingCommandMap];
  const ANIMATED = [StandardAclSource, ExtendedAclDecision, SubnettingWalkthrough, WildcardInversion, TcpThreeWayHandshake, WebOpeningJourney];
  it("no <animateMotion>, no <animate>, and a valid still svg[role=img] for each under reduced motion", () => {
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
