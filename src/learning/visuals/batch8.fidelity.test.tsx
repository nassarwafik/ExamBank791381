// @vitest-environment happy-dom
// Batch 8 — SOURCE-FIDELITY + MOTION-SEMANTICS regressions. Renders the actual components and asserts what each SVG
// DOES and does NOT contain, for the services / routing CONCEPT arc (DHCP intro & dedicated server, Port Security
// concept, Cisco device security framing, the command-reference maps, WAN technologies, routing-method overview,
// static route, EIGRP). Includes the explicit no-leak guards required by the batch, the two ENHANCED existing
// components' preserved invariants, and one-shot motion discipline (no infinite loop, no cyclic self-restart).
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { render, cleanup } from "@testing-library/react";
import DhcpAutomaticConfig from "./791381/batch8/DhcpAutomaticConfig";
import DedicatedDhcpServer from "./791381/batch8/DedicatedDhcpServer";
import PortSecurityConcept from "./791381/batch8/PortSecurityConcept";
import DeviceSecurityLayers from "./791381/batch8/DeviceSecurityLayers";
import CiscoCommandFamilies from "./791381/batch8/CiscoCommandFamilies";
import ShowCommandsMap from "./791381/batch8/ShowCommandsMap";
import FrameRelayVsAtm from "./791381/batch8/FrameRelayVsAtm";
import HdlcVsMetro from "./791381/batch8/HdlcVsMetro";
import RoutingMethodsOverview from "./791381/batch8/RoutingMethodsOverview";
import StaticRoutePath from "./791381/batch8/StaticRoutePath";
import EigrpNeighborsMetric from "./791381/batch8/EigrpNeighborsMetric";
// the two Batch-6 components enhanced in place by Batch 8
import DhcpPoolExcluded from "./791381/batch6/DhcpPoolExcluded";
import AdminDistance from "./791381/batch6/AdminDistance";

afterEach(cleanup);
const text = (n: Element) => n.textContent || "";

// ── m22 DHCP intro (PDF 169) — automatic addressing, NO DORA yet ──
describe("Batch 8 — dhcp-automatic-config (PDF 169): IP + Gateway + DNS arrive automatically", () => {
  it("shows the new client and the three auto-delivered settings; does NOT leak the DORA exchange", () => {
    const { container } = render(<DhcpAutomaticConfig ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["DHCP", "جهاز جديد", "IP", "Gateway", "DNS", "تلقائي"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-setting]")].map(g => g.getAttribute("data-setting"))).toEqual(["IP", "Gateway", "DNS"]);
    for (const dora of ["Discover", "Offer", "Request", "ACK", "DORA"]) expect(t).not.toContain(dora);
  });
  it("reveals the settings once (one-shot, freeze — no cyclic restart)", () => {
    const { container } = render(<DhcpAutomaticConfig ariaLabel="x" reducedMotion={false} />);
    const first = container.querySelector('[id="cfg0"]')!;
    expect(first).not.toBeNull();
    expect(first.getAttribute("begin")).not.toContain(".end");
    expect(first.getAttribute("fill")).toBe("freeze");
  });
});

// ── m22 dedicated server (PDF 176) — central server, NO Packet Tracer UI fabrication ──
describe("Batch 8 — dedicated-dhcp-server (PDF 176): a dedicated server distributes 192.168.10.0/24", () => {
  it("shows the server → switch → clients chain and the example network; fabricates no simulator UI", () => {
    const { container } = render(<DedicatedDhcpServer ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Server", "Switch", "192.168.10.0/24"]) expect(t).toContain(s);
    expect([...new Set([...container.querySelectorAll("[data-node]")].map(g => g.getAttribute("data-node")))].sort()).toEqual(["client", "server", "switch"]);
    for (const ui of ["Packet Tracer", "Services", "Start IP", "Add", "Save"]) expect(t).not.toContain(ui);
  });
});

// ── m23 Port Security concept (PDF 180) — allow known MAC / deny unknown, NO scenario hosts ──
describe("Batch 8 — port-security-concept (PDF 180): allow known MAC, deny unknown", () => {
  it("shows the allow/deny outcomes keyed on MAC; does NOT leak the PDF 181 scenario hosts or config keywords", () => {
    const { container } = render(<PortSecurityConcept ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["MAC", "Switch", "مجهول"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-outcome]")].map(g => g.getAttribute("data-outcome")).sort()).toEqual(["allow", "deny"]);
    for (const leak of ["PC0", "PC1", "Sticky", "sticky", "maximum"]) expect(t).not.toContain(leak);
  });
  it("reveals the deny outcome once (one-shot, freeze)", () => {
    const { container } = render(<PortSecurityConcept ariaLabel="x" reducedMotion={false} />);
    const deny = container.querySelector('[id="deny"]')!;
    expect(deny).not.toBeNull();
    expect(deny.getAttribute("begin")).not.toContain(".end");
    expect(deny.getAttribute("fill")).toBe("freeze");
  });
});

// ── m24 device security framing (PDF 185) — protect the device, three password-guarded areas, NO commands/values ──
describe("Batch 8 — device-security-layers (PDF 185): protect the device itself via Console/VTY/Enable", () => {
  it("names the three password-guarded access areas; does NOT leak the line/enable COMMANDS or a password VALUE", () => {
    const { container } = render(<DeviceSecurityLayers ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Console", "VTY", "Enable", "جهاز Cisco", "كلمة مرور"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-area]")].map(g => g.getAttribute("data-area"))).toEqual(["console", "vty", "enable"]);
    for (const leak of ["line vty 0 4", "line console 0", "enable secret", "cisco123"]) expect(t).not.toContain(leak);
  });
});

// ── m05 command families (PDF 192) — navigation map by task, NO command dump ──
describe("Batch 8 — cisco-command-families (PDF 192): family → task map, not a command dump", () => {
  it("names the command families by task; does NOT dump the per-family commands from PDF 193–197", () => {
    const { container } = render(<CiscoCommandFamilies ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["CLI", "VTP", "Router on a Stick", "Port Security", "كلمات المرور"]) expect(t).toContain(s);
    expect(container.querySelectorAll("[data-family]").length).toBe(5);
    for (const cmd of ["switchport", "vlan brief", "enable secret", "line vty", "ip dhcp pool"]) expect(t).not.toContain(cmd);
  });
});

// ── m05 show map (PDF 198) — the four inspection groups with their EXACT commands ──
describe("Batch 8 — show-commands-map (PDF 198): four inspection groups, exact commands", () => {
  it("shows the four groups and their exact show commands", () => {
    const { container } = render(<ShowCommandsMap ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    expect([...container.querySelectorAll("[data-group]")].map(g => g.getAttribute("data-group"))).toEqual(["vlan-ports", "port-security", "config", "routing-services"]);
    for (const cmd of ["show vlan brief", "show port-security", "show running-config", "show ip route", "show ip dhcp pool"]) expect(t).toContain(cmd);
  });
});

// ── m26 Frame Relay vs ATM (PDF 208) ──
describe("Batch 8 — frame-relay-vs-atm (PDF 208): the book's own comparison only", () => {
  it("contrasts Frame Relay (Frames · Packet Switching) and ATM (voice+video+data); no PDF 209 tech", () => {
    const { container } = render(<FrameRelayVsAtm ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Frame Relay", "ATM", "Frames", "Packet Switching"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-tech]")].map(g => g.getAttribute("data-tech"))).toEqual(["frame-relay", "atm"]);
    for (const leak of ["HDLC", "Metro Ethernet"]) expect(t).not.toContain(leak);
  });
});

// ── m26 HDLC vs Metro Ethernet (PDF 209) ──
describe("Batch 8 — hdlc-vs-metro (PDF 209): the page's exact terminology", () => {
  it("contrasts HDLC (devices over WAN lines) and Metro Ethernet (sites within a city); no PDF 208 tech", () => {
    const { container } = render(<HdlcVsMetro ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["HDLC", "Metro Ethernet", "WAN", "مدينة"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-tech]")].map(g => g.getAttribute("data-tech"))).toEqual(["hdlc", "metro-ethernet"]);
    for (const leak of ["Frame Relay", "ATM", "Packet Switching"]) expect(t).not.toContain(leak);
  });
});

// ── m27 routing methods overview (PDF 210) — three categories, NO config commands ──
describe("Batch 8 — routing-methods-overview (PDF 210): Static / OSPF / EIGRP categories", () => {
  it("shows the three method categories with their page badges; does NOT leak per-protocol CONFIG commands", () => {
    const { container } = render(<RoutingMethodsOverview ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Static Route", "OSPF", "EIGRP", "Link-State", "Bandwidth + Delay"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-method]")].map(g => g.getAttribute("data-method"))).toEqual(["static", "ospf", "eigrp"]);
    for (const cmd of ["router ospf", "router eigrp", "ip route", "network 192", "area 0"]) expect(t).not.toContain(cmd);
  });
});

// ── m27 static route (PDF 211) — administrator-defined fixed path, static only ──
describe("Batch 8 — static-route-path (PDF 211): admin-defined fixed path, no dynamic behaviour", () => {
  it("shows the admin → router → destination fixed route; introduces NO dynamic-protocol behaviour", () => {
    const { container } = render(<StaticRoutePath ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["مدير الشبكة", "Router", "مسار ثابت", "الشبكة الهدف", "يدوي"]) expect(t).toContain(s);
    expect(container.querySelector('[data-route="static"]')).not.toBeNull();
    for (const dyn of ["OSPF", "EIGRP", "يتعلّم", "تلقائي", "ديناميكي", "Bandwidth"]) expect(t).not.toContain(dyn);
  });
  it("moves one packet along the fixed route once (one-shot, freeze)", () => {
    const { container } = render(<StaticRoutePath ariaLabel="x" reducedMotion={false} />);
    const stroll = container.querySelector('[id="stroll"]')!;
    expect(stroll).not.toBeNull();
    expect(stroll.getAttribute("begin")).not.toContain(".end");
    expect(stroll.getAttribute("fill")).toBe("freeze");
  });
});

// ── m27 EIGRP (PDF 218) — neighbours + metric, NO PDF 219/220/221 leak ──
describe("Batch 8 — eigrp-neighbors-metric (PDF 218): neighbours exchange, metric Bandwidth + Delay", () => {
  it("shows the neighbour exchange and the metric; does NOT leak the AS number or config commands", () => {
    const { container } = render(<EigrpNeighborsMetric ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["EIGRP", "Bandwidth + Delay", "Distance Vector", "Cisco"]) expect(t).toContain(s);
    expect(container.querySelectorAll('[data-role="router"]').length).toBe(2);
    expect(container.querySelector('[data-metric="1"]')).not.toBeNull();
    for (const leak of ["router eigrp", "network", "no auto-summary", "AS 100", "100", "R1", "R2"]) expect(t).not.toContain(leak);
  });
});

// ── ENHANCED (Batch 6) — dhcp-pool-excluded: the .10–.50 invariant must remain EXACT after the router annotation ──
describe("Batch 8 enhancement — dhcp-pool-excluded (PDF 171): pool stays EXACTLY .10–.50; router now labelled server + gateway", () => {
  it("keeps the /24, the gateway and the exact .10–.50 pool; adds the router dual-role; leaks no CLI and no 'rest' language", () => {
    const { container } = render(<DhcpPoolExcluded ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["192.168.1.0/24", "192.168.1.254", ".10", ".50"]) expect(t).toContain(s);
    const pool = container.querySelector('[data-band="pool"]')!;
    expect(text(pool)).toContain("192.168.1.10");
    expect(text(pool)).toContain("192.168.1.50");
    expect(container.querySelector('[data-band="after"]')).not.toBeNull();
    // NEW: the router is shown acting as the DHCP server + gateway in this example
    const router = container.querySelector('[data-band="router"]')!;
    expect(router).not.toBeNull();
    for (const s of ["الراوتر", "خادم DHCP"]) expect(text(router)).toContain(s);
    for (const cmd of ["ip dhcp pool", "default-router", "dns-server", "excluded-address"]) expect(t).not.toContain(cmd);
    for (const rest of ["باقي العناوين", "الباقي", "the rest"]) expect(t).not.toContain(rest);
  });
});

// ── ENHANCED (Batch 6) — admin-distance: exact AD values preserved; Metric-vs-AD distinction now represented ──
describe("Batch 8 enhancement — admin-distance (PDF 213): exact AD values kept; Metric vs AD now distinguished", () => {
  it("keeps Connected 0 / Static 1 / EIGRP 90 / OSPF 110 / RIP 120 in order and adds the Metric side", () => {
    const { container } = render(<AdminDistance ariaLabel="x" reducedMotion={true} />);
    expect([...container.querySelectorAll("[data-ad]")].map(g => g.getAttribute("data-ad"))).toEqual(["0", "1", "90", "110", "120"]);
    const t = text(container);
    for (const s of ["Connected", "Static", "EIGRP", "OSPF", "RIP"]) expect(t).toContain(s);
    // NEW: both concepts present, keyed by data-concept, with the two metric bases the page names
    expect([...container.querySelectorAll("[data-concept]")].map(g => g.getAttribute("data-concept")).sort()).toEqual(["ad", "metric"]);
    for (const s of ["Metric", "Bandwidth + Delay", "Bandwidth"]) expect(t).toContain(s);
    expect(t).not.toContain("directly connected");   // that phrasing belongs to PDF 222
  });
});

// ── cross-cutting: reduced motion removes ALL SMIL animation from every Batch-8 visual (incl. the two enhanced) ──
describe("Batch 8 — reduced motion drops all motion; the animated ones render some when on", () => {
  const ALL = [DhcpAutomaticConfig, DedicatedDhcpServer, PortSecurityConcept, DeviceSecurityLayers, CiscoCommandFamilies,
    ShowCommandsMap, FrameRelayVsAtm, HdlcVsMetro, RoutingMethodsOverview, StaticRoutePath, EigrpNeighborsMetric,
    DhcpPoolExcluded, AdminDistance];
  const ANIMATED = [DhcpAutomaticConfig, PortSecurityConcept, StaticRoutePath];
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

// ── one-shot motion discipline: NO infinite loops, NO cyclic self-restart anywhere in Batch 8 ──
describe("Batch 8 — one-shot motion discipline (source scan)", () => {
  const dir = resolve(process.cwd(), "src/learning/visuals/791381/batch8") + "/";
  const files = readdirSync(dir).filter(f => f.endsWith(".tsx"));
  const sources = files.map(f => [f, readFileSync(dir + f, "utf8")] as const);

  it("scans every Batch 8 component and finds ZERO infinite animations (no repeatCount)", () => {
    expect(files.length).toBe(11);
    for (const [f, src] of sources) {
      expect(src, `${f} must not contain any repeatCount`).not.toMatch(/repeatCount=/);
    }
  });

  it("no animation uses a cyclic self-restart begin (the multi-value \"...;X.end\" loop pattern)", () => {
    for (const [f, src] of sources) {
      const begins = src.match(/begin=[`"'][^`"']*[`"']/g) || [];
      for (const b of begins) expect(b, `${f}: cyclic-restart begin ${b}`).not.toContain(";");
    }
  });
});
