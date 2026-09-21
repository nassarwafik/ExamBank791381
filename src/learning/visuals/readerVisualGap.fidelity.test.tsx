// @vitest-environment happy-dom
// Reader follow-up — «Visual Gaps & Interactive Fixes» (site pages 138–156). RENDERING-FIDELITY regressions.
//
// Renders the actual components the follow-up added or upgraded and asserts what each one DOES and does NOT contain,
// with this phase's source-fidelity exclusions:
//   • site 138 (PDF 150) — NEW Sw6 ↔ Router trunk diagram: topology + G0/0 TRUNK + F0/22–F0/24, and NO sub-interfaces,
//     IP addresses or Dot1Q commands (those are later pages).
//   • site 142 (PDF 154) — the sub-interface visual, upgraded IN PLACE to a Router→Trunk→Switch→VLAN topology, still
//     shows only its own page's values (g0/0.10/.20 · VLAN 10/20 · dot1Q 10 · 192.168.10.254) and NEVER the PDF 155 leak.
//   • site 155 (PDF 168) — well-known ports: every port number is centred in its own cell (textAnchor=middle,
//     dominantBaseline=central) and the nine services/numbers are exactly the book's; no «::».
//   • site 156 (PDF 169) — DHCP automatic config: BOTH source methods (router + dedicated server) deliver IP/Gateway/DNS
//     to a new client, and NO DORA stages, pool ranges, CLI commands or specific addresses.
//   • site 154 (PDF 167) — the IPv6 compressor activity: pure canonicalization logic + a rendered practice with NO short
//     answer in the DOM before a check.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import Sw6RouterTrunk from "./791381/followup/Sw6RouterTrunk";
import SubinterfacesVlan1020 from "./791381/batch7/SubinterfacesVlan1020";
import WellKnownPorts from "./791381/batch6/WellKnownPorts";
import DhcpAutomaticConfig from "./791381/batch8/DhcpAutomaticConfig";
import Ipv6CompressSimulator from "../activities/Ipv6CompressSimulator";
import { expandIpv6, canonicalIpv6 } from "../activities/ipv6";
import type { LearningActivityProps } from "../activities/engine";
import type { SimulationBlock } from "../content/types";

afterEach(cleanup);
const text = (n: Element) => n.textContent || "";

// ── site 138 (PDF 150) — NEW Sw6 ↔ Router trunk diagram ──
describe("Reader follow-up — sw6-router-trunk (site 138 / PDF 150): topology, trunk uplink, no config leak", () => {
  it("renders a responsive role=img SVG with router + Sw6 nodes, a TRUNK G0/0 uplink and the three downlinks", () => {
    const { container } = render(<Sw6RouterTrunk ariaLabel="x" reducedMotion={true} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("viewBox")).toBeTruthy();
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    const t = text(container);
    for (const s of ["الراوتر", "Sw6", "G0/0", "TRUNK", "F0/22", "F0/23", "F0/24"]) expect(t).toContain(s);
    expect(container.querySelector('[data-node="router"]')).not.toBeNull();
    expect(container.querySelector('[data-node="sw6"]')).not.toBeNull();
    expect(container.querySelector('[data-link="trunk"]')).not.toBeNull();
    expect([...container.querySelectorAll("[data-downlink]")].map(g => g.getAttribute("data-downlink"))).toEqual(["F0/22", "F0/23", "F0/24"]);
  });
  it("shows NO sub-interfaces, IP addresses or Dot1Q commands (those are the following pages)", () => {
    const { container } = render(<Sw6RouterTrunk ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const leak of ["g0/0.10", "g0/0.20", "dot1Q", "Dot1Q", "192.168", "255.255", "encapsulation"]) expect(t).not.toContain(leak);
  });
  it("is static — it declares no SMIL animation and no infinite animation", () => {
    const { container } = render(<Sw6RouterTrunk ariaLabel="x" reducedMotion={false} />);
    expect(container.querySelectorAll("animate, animateTransform, animateMotion").length).toBe(0);
  });
});

// ── site 142 (PDF 154) — upgraded sub-interface topology, no PDF 155 leak ──
describe("Reader follow-up — subinterfaces-vlan10-20 (site 142 / PDF 154): upgraded to a topology, still only its own page's values", () => {
  it("is now a Router → Trunk → Switch → VLAN topology and keeps the exact PDF 154 values", () => {
    const { container } = render(<SubinterfacesVlan1020 ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["g0/0.10", "g0/0.20", "VLAN 10", "VLAN 20", "dot1Q 10", "192.168.10.254"]) expect(t).toContain(s);
    expect(container.querySelector('[data-node="router"]')).not.toBeNull();
    expect(container.querySelector('[data-node="switch"]')).not.toBeNull();
    expect([...container.querySelectorAll("[data-subif]")].map(g => g.getAttribute("data-subif"))).toEqual(["g0/0.10", "g0/0.20"]);
    expect([...container.querySelectorAll("[data-vlangroup]")].map(g => g.getAttribute("data-vlangroup"))).toEqual(["10", "20"]);
  });
  it("NEVER leaks the PDF 155 values (30/40, 192.168.30/40, dot1Q 20/30/40)", () => {
    const { container } = render(<SubinterfacesVlan1020 ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const leak of ["g0/0.30", "g0/0.40", "VLAN 30", "VLAN 40", "dot1Q 20", "dot1Q 30", "dot1Q 40", "192.168.20", "192.168.30", "192.168.40"]) expect(t).not.toContain(leak);
  });
});

// ── site 155 (PDF 168) — centred port numbers ──
describe("Reader follow-up — well-known-ports (site 155 / PDF 168): numbers centred in their cell", () => {
  const SERVICES: [string, string][] = [["HTTP", "80"], ["HTTPS", "443"], ["DNS", "53"], ["SSH", "22"], ["Telnet", "23"], ["FTP", "21"], ["SMTP", "25"], ["POP3", "110"], ["IMAP", "143"]];
  it("keeps the exact nine services and numbers the book prints (FTP is 21, not 20/21); no IPv6 «::»", () => {
    const { container } = render(<WellKnownPorts ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const [s, p] of SERVICES) { expect(t).toContain(s); expect(t).toContain(p); }
    expect(t).not.toContain("::");
  });
  it("each port number is horizontally + vertically centred (textAnchor=middle, dominantBaseline=central) inside its own number cell", () => {
    const { container } = render(<WellKnownPorts ariaLabel="x" reducedMotion={true} />);
    const nums = [...container.querySelectorAll("[data-portnum]")];
    expect(nums.length).toBe(9);
    for (const n of nums) {
      expect(n.getAttribute("text-anchor")).toBe("middle");
      expect(n.getAttribute("dominant-baseline")).toBe("central");
      const cell = container.querySelector(`[data-portcell="${n.getAttribute("data-portnum")}"]`)!;
      // the number's x sits at the cell's horizontal centre
      const cx = parseFloat(cell.getAttribute("x")!) + parseFloat(cell.getAttribute("width")!) / 2;
      expect(parseFloat(n.getAttribute("x")!)).toBeCloseTo(cx, 3);
    }
  });
});

// ── site 156 (PDF 169) — two DHCP source methods ──
describe("Reader follow-up — dhcp-automatic-config (site 156 / PDF 169): two source methods, three settings, no DORA/CLI", () => {
  it("shows BOTH a router-as-DHCP and a dedicated server delivering IP/Gateway/DNS to a new client", () => {
    const { container } = render(<DhcpAutomaticConfig ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    expect(container.querySelector('[data-source="router"]')).not.toBeNull();
    expect(container.querySelector('[data-source="server"]')).not.toBeNull();
    expect(container.querySelector('[data-node="client"]')).not.toBeNull();
    expect([...container.querySelectorAll("[data-setting]")].map(g => g.getAttribute("data-setting"))).toEqual(["IP", "Gateway", "DNS"]);
    for (const s of ["DHCP", "IP", "Gateway", "DNS", "جهاز جديد"]) expect(t).toContain(s);
  });
  it("does NOT leak the DORA stages, pool ranges, CLI commands or specific addresses (later unit pages)", () => {
    const { container } = render(<DhcpAutomaticConfig ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const leak of ["Discover", "Offer", "Request", "Acknowledge", "DORA", "ip dhcp pool", "network ", "192.168", "10.0", "excluded"]) expect(t).not.toContain(leak);
  });
});

// ── site 154 (PDF 167) — IPv6 compressor logic + rendering ──
describe("Reader follow-up — ipv6-compress canonicalization logic", () => {
  const BOOK: [string, string][] = [
    ["2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8::ff00:42:8329"],
    ["fe80:0000:0000:0000:0202:b3ff:fe1e:8329", "fe80::202:b3ff:fe1e:8329"],
    ["2a00:8640:0000:0000:0200:23ff:fe10:8329", "2a00:8640::200:23ff:fe10:8329"],
  ];
  it("the book's long and short forms canonicalize equal (and case-insensitively)", () => {
    for (const [long, short] of BOOK) {
      expect(canonicalIpv6(long)).toBe(canonicalIpv6(short));
      expect(canonicalIpv6(long.toUpperCase())).toBe(canonicalIpv6(short));
      expect(canonicalIpv6(short)).toBe(short);   // each book short form is already the canonical (RFC-5952) compression
    }
  });
  it("rejects a doubled «::», bad hex and the wrong group count", () => {
    expect(expandIpv6("2001::db8::1")).toBeNull();
    expect(canonicalIpv6("2001::db8::1")).toBeNull();
    expect(expandIpv6("gggg::1")).toBeNull();
    expect(expandIpv6("2001:db8:0:0:0:0:0")).toBeNull();     // only 7 groups, no ::
    expect(canonicalIpv6("")).toBeNull();
  });
  it("«::» must stand for at least one group (a full 8-group address with :: is invalid)", () => {
    expect(expandIpv6("1:2:3:4:5:6:7:8")).toEqual(["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008"]);
    expect(expandIpv6("1:2:3:4::5:6:7:8")).toBeNull();
  });
});

describe("Reader follow-up — ipv6-compress renderer: no answer leaks before a check", () => {
  const block: SimulationBlock = {
    id: "sim", type: "simulation", origin: "teacher-enrichment", simulationType: "ipv6-compress", version: 1, title: "t",
    config: { examples: [{ long: "2001:0db8:0000:0000:0000:ff00:0042:8329", short: "2001:db8::ff00:42:8329" }] },
  };
  const props = (over: Partial<LearningActivityProps> = {}): LearningActivityProps => ({
    block, courseId: "791381", reducedMotion: true, fullscreen: false, commands: { reset: 0, replay: 0 }, emit: () => {}, ...over,
  });

  it("shows the FULL address but NOT the short answer until the student checks a correct input", () => {
    const { container, getByLabelText, getByText } = render(<Ipv6CompressSimulator {...props()} />);
    expect(container.querySelector("[data-full]")!.getAttribute("data-full")).toBe("2001:0db8:0000:0000:0000:ff00:0042:8329");
    expect(text(container)).not.toContain("2001:db8::ff00:42:8329");   // answer absent before any check
    // a wrong check still does not reveal the answer
    fireEvent.change(getByLabelText("اكتب العنوان المختصر"), { target: { value: "2001:db8::1" } });
    fireEvent.click(getByText("تحقّق"));
    expect(text(container)).not.toContain("2001:db8::ff00:42:8329");
    // a correct (differently-cased / differently-compressed) answer verifies and only THEN shows the canonical short form
    fireEvent.change(getByLabelText("اكتب العنوان المختصر"), { target: { value: "2001:DB8:0:0:0:FF00:42:8329" } });
    fireEvent.click(getByText("تحقّق"));
    expect(text(container)).toContain("2001:db8::ff00:42:8329");
  });
});
