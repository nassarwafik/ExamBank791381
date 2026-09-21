// @vitest-environment happy-dom
// Batch 7 — SOURCE-FIDELITY + MOTION-SEMANTICS regressions for the VTP/Trunk remainder + Wi-Fi + IPv6 visuals. Renders
// the actual components and asserts what each SVG DOES and does NOT contain, with the batch's source-fidelity
// exclusions (no VTP config on PDF 140, exact ports on PDF 146, no cross-page leak between PDF 154/155, no WEP/WPA on
// PDF 163, no compression on PDF 166, exact examples on PDF 167). Animated visuals are checked for finite one-shot
// motion (no infinite loop, no cyclic restart).
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { render, cleanup } from "@testing-library/react";
import VtpRoles from "./791381/batch7/VtpRoles";
import InterSwitchTrunkPorts from "./791381/batch7/InterSwitchTrunkPorts";
import SubinterfacesVlan1020 from "./791381/batch7/SubinterfacesVlan1020";
import SubinterfacesVlan3040 from "./791381/batch7/SubinterfacesVlan3040";
import DmzThreeZone from "./791381/batch7/DmzThreeZone";
import WifiRadioLink from "./791381/batch7/WifiRadioLink";
import WirelessNetworkTypes from "./791381/batch7/WirelessNetworkTypes";
import SsidBeacon from "./791381/batch7/SsidBeacon";
import WifiSecurity from "./791381/batch7/WifiSecurity";
import WifiProtectionTechnologies from "./791381/batch7/WifiProtectionTechnologies";
import AccessPointBridge from "./791381/batch7/AccessPointBridge";
import Ipv6Anatomy from "./791381/batch7/Ipv6Anatomy";
import Ipv6Compression from "./791381/batch7/Ipv6Compression";

afterEach(cleanup);
const text = (n: Element) => n.textContent || "";
const byId = (r: Element, id: string) => r.querySelector(`[id="${id}"]`);

// ── m19 VTP roles (PDF 140) ──
describe("Batch 7 — vtp-roles (PDF 140): Server / Client / Trunk, no config leak", () => {
  it("names the roles and abbreviation; shows NO vtp config command, Domain or Password", () => {
    const { container } = render(<VtpRoles ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["VTP", "VLAN Trunking Protocol", "Server", "Client", "Trunk", "Cisco"]) expect(t).toContain(s);
    expect(container.querySelector('[data-role="server"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-role="client"]').length).toBe(2);
    for (const leak of ["vtp mode", "vtp domain", "vtp password", "Domain", "Password"]) expect(t).not.toContain(leak);
  });
});

// ── m04 inter-switch trunk ports (PDF 146) ──
describe("Batch 7 — inter-switch-trunk-ports (PDF 146): exact six switches and ports", () => {
  it("shows Sw1-HFA … Sw6-HFA with their exact ports; only Sw6-HFA has G0/0; no Dot1Q", () => {
    const { container } = render(<InterSwitchTrunkPorts ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Sw1-HFA", "Sw2-HFA", "Sw3-HFA", "Sw4-HFA", "Sw5-HFA", "Sw6-HFA", "F0/22", "F0/23", "F0/24", "G0/0", "Trunk"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-switch]")].map(g => g.getAttribute("data-switch"))).toEqual(["Sw1-HFA", "Sw2-HFA", "Sw3-HFA", "Sw4-HFA", "Sw5-HFA", "Sw6-HFA"]);
    // only Sw6-HFA carries the Gigabit uplink
    const sw6 = container.querySelector('[data-switch="Sw6-HFA"]')!;
    expect(text(sw6)).toContain("G0/0");
    const sw1 = container.querySelector('[data-switch="Sw1-HFA"]')!;
    expect(text(sw1)).not.toContain("G0/0");
    expect(t).not.toContain("Dot1Q");
  });
});

// ── m04 sub-interfaces PDF 154 vs 155 — the split (no cross-page leak) ──
describe("Batch 7 — subinterfaces split (PDF 154 / 155): each shows only its own page's values", () => {
  it("PDF 154 shows g0/0.10/.20 · VLAN 10/20 · 192.168.10.254 and NEVER 30/40 values", () => {
    const { container } = render(<SubinterfacesVlan1020 ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["g0/0.10", "g0/0.20", "VLAN 10", "VLAN 20", "dot1Q 10", "192.168.10.254"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-subif]")].map(g => g.getAttribute("data-subif"))).toEqual(["g0/0.10", "g0/0.20"]);
    for (const leak of ["g0/0.30", "g0/0.40", "VLAN 40", "dot1Q 30", "dot1Q 40", "192.168.30", "192.168.40"]) expect(t).not.toContain(leak);
  });
  it("PDF 155 shows g0/0.30/.40 · VLAN 30/40 · 192.168.30/40.254 and NEVER the 154 values", () => {
    const { container } = render(<SubinterfacesVlan3040 ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["g0/0.30", "g0/0.40", "VLAN 30", "VLAN 40", "dot1Q 30", "dot1Q 40", "192.168.30.254", "192.168.40.254"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-subif]")].map(g => g.getAttribute("data-subif"))).toEqual(["g0/0.30", "g0/0.40"]);
    for (const leak of ["g0/0.10", "g0/0.20", "192.168.10", "192.168.20"]) expect(t).not.toContain(leak);
  });
});

// ── m20 DMZ (PDF 159) ──
describe("Batch 7 — dmz-three-zone (PDF 159): three zones, two firewalls, visitor stops at DMZ", () => {
  it("shows Internet → DMZ (Web/Mail/DNS) → internal, with two firewalls; no SSID/WEP/WPA", () => {
    const { container } = render(<DmzThreeZone ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["الإنترنت", "DMZ", "Web", "Mail", "DNS", "الشبكة الداخلية"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-zone]")].map(g => g.getAttribute("data-zone"))).toEqual(["internet", "dmz", "internal"]);
    expect(container.querySelectorAll("[data-firewall]").length).toBe(2);
    for (const leak of ["SSID", "WEP", "WPA"]) expect(t).not.toContain(leak);
  });
  it("the visitor motion is one-shot and stops at the DMZ (freeze)", () => {
    const { container } = render(<DmzThreeZone ariaLabel="x" reducedMotion={false} />);
    const visit = byId(container, "dmzVisit")!;
    expect(visit.getAttribute("begin")).not.toContain(".end");
    expect(visit.getAttribute("fill")).toBe("freeze");
  });
  // GEOMETRY: firewall 1 at x=124 (y 40..122), firewall 2 at x=256, Internet box x=16..112, DMZ box x=136..244, both y=44..118.
  const FW1_X = 124, FW1_Y0 = 40, FW1_Y1 = 122, FW2_X = 256, INT_X0 = 16, INT_X1 = 112, DMZ_X0 = 136, DMZ_X1 = 244, ZONE_Y0 = 44, ZONE_Y1 = 118;
  it("the packet path starts in the Internet zone, physically crosses firewall 1, and ends INSIDE the DMZ (left of firewall 2)", () => {
    const { container } = render(<DmzThreeZone ariaLabel="x" reducedMotion={false} />);
    const path = byId(container, "dmzVisit")!.getAttribute("path")!;
    const m = path.match(/M\s*(\d+)\s+(\d+)\s+L\s*(\d+)\s+(\d+)/)!;
    const [sx, sy, ex, ey] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    // 1. starts inside the Internet zone
    expect(sx).toBeGreaterThanOrEqual(INT_X0); expect(sx).toBeLessThanOrEqual(INT_X1);
    expect(sy).toBeGreaterThanOrEqual(ZONE_Y0); expect(sy).toBeLessThanOrEqual(ZONE_Y1);
    // 2. physically crosses firewall 1 (x=124) while within the firewall's y-range
    expect(sx).toBeLessThan(FW1_X); expect(ex).toBeGreaterThan(FW1_X);
    expect(sy).toBeGreaterThanOrEqual(FW1_Y0); expect(sy).toBeLessThanOrEqual(FW1_Y1);
    expect(ey).toBeGreaterThanOrEqual(FW1_Y0); expect(ey).toBeLessThanOrEqual(FW1_Y1);
    // 3. ends INSIDE the DMZ bounds
    expect(ex).toBeGreaterThanOrEqual(DMZ_X0); expect(ex).toBeLessThanOrEqual(DMZ_X1);
    expect(ey).toBeGreaterThanOrEqual(ZONE_Y0); expect(ey).toBeLessThanOrEqual(ZONE_Y1);
    // 4. never reaches firewall 2 / the internal LAN
    expect(ex).toBeLessThan(FW2_X);
  });
  it("reduced-motion static packet sits INSIDE the DMZ box (not below the zones)", () => {
    const { container } = render(<DmzThreeZone ariaLabel="x" reducedMotion={true} />);
    const r = container.querySelector('[data-stop="1"]')!;
    const cx = Number(r.getAttribute("x")) + Number(r.getAttribute("width")) / 2;
    const cy = Number(r.getAttribute("y")) + Number(r.getAttribute("height")) / 2;
    expect(cx).toBeGreaterThanOrEqual(DMZ_X0); expect(cx).toBeLessThanOrEqual(DMZ_X1);
    expect(cy).toBeGreaterThanOrEqual(ZONE_Y0); expect(cy).toBeLessThanOrEqual(ZONE_Y1);
    expect(cx).toBeLessThan(FW2_X);
  });
});

// ── m20 Wi-Fi radio (PDF 160) ──
describe("Batch 7 — wifi-radio-link (PDF 160): radio waves, no cable", () => {
  it("shows the radio-wave / no-cable idea; no SSID or security terms", () => {
    const { container } = render(<WifiRadioLink ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["موجات الراديو", "Wi-Fi", "بدون كابلات"]) expect(t).toContain(s);
    expect(container.querySelectorAll("[data-wave]").length).toBe(3);
    for (const leak of ["SSID", "WEP", "WPA"]) expect(t).not.toContain(leak);
  });
  it("the waves light up one-shot (no restart)", () => {
    const { container } = render(<WifiRadioLink ariaLabel="x" reducedMotion={false} />);
    expect(byId(container, "wave0")!.getAttribute("begin")).not.toContain(".end");
    expect(byId(container, "wave0")!.getAttribute("fill")).toBe("freeze");
  });
});

// ── m20 wireless types (PDF 161) ──
describe("Batch 7 — wireless-network-types (PDF 161): the page's own four types, no WMAN", () => {
  it("shows PAN / WPAN / WLAN / WWAN with the book's examples; never WMAN", () => {
    const { container } = render(<WirelessNetworkTypes ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["PAN", "WPAN", "WLAN", "WWAN", "Bluetooth", "4G", "5G"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-wtype]")].map(g => g.getAttribute("data-wtype"))).toEqual(["PAN", "WPAN", "WLAN", "WWAN"]);
    expect(t).not.toContain("WMAN");
  });
});

// ── m20 SSID (PDF 162) ──
describe("Batch 7 — ssid-beacon (PDF 162): the network name is broadcast", () => {
  it("shows SSID = the network name being broadcast; no protection technology names", () => {
    const { container } = render(<SsidBeacon ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["SSID", "اسم الشبكة"]) expect(t).toContain(s);
    expect(container.querySelector('[data-ssid="1"]')).not.toBeNull();
    for (const leak of ["WEP", "WPA", "WPA2", "WPA3"]) expect(t).not.toContain(leak);
  });
  // AP at x=66, device at x=312 (midpoint 189).
  const AP_X = 66, DEV_X = 312, MID = (AP_X + DEV_X) / 2;
  it("the SSID name TRAVELS from near the AP to near the device (real positional animateMotion)", () => {
    const { container } = render(<SsidBeacon ariaLabel="x" reducedMotion={false} />);
    const move = byId(container, "ssidMove")!;
    expect(move.tagName.toLowerCase()).toBe("animatemotion");   // real positional travel, not a fade-in
    const m = move.getAttribute("path")!.match(/M\s*(\d+)\s+(\d+)\s+L\s*(\d+)\s+(\d+)/)!;
    const [sx, ex] = [Number(m[1]), Number(m[3])];
    expect(sx).toBeLessThan(ex);                 // moves left → right (AP → device)
    expect(sx).toBeLessThan(MID);                // starts on the AP side
    expect(ex).toBeGreaterThan(MID);             // ends on the device side
    expect(sx).toBeLessThanOrEqual(AP_X + 60);   // starts near the AP
    expect(ex).toBeGreaterThanOrEqual(DEV_X - 60); // ends near the device
    // one-shot, no cyclic restart
    expect(move.getAttribute("begin")).not.toContain(".end");
    expect(move.getAttribute("begin")).not.toContain(";");
    expect(move.getAttribute("fill")).toBe("freeze");
  });
  it("the device-found stage is revealed ONLY after the name arrives (begin = ssidMove.end)", () => {
    const { container } = render(<SsidBeacon ariaLabel="x" reducedMotion={false} />);
    const found = byId(container, "ssidFound")!;
    expect(found.getAttribute("begin")).toBe("ssidMove.end");
    expect(found.getAttribute("fill")).toBe("freeze");
    expect(container.querySelector('[data-found="1"]')).not.toBeNull();
  });
  it("reduced motion shows the final state (AP, SSID arrived at the device, device-found) with ZERO animation", () => {
    const { container } = render(<SsidBeacon ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll("animateMotion, animate").length).toBe(0);
    expect(container.querySelector('[data-ssid="1"]')).not.toBeNull();
    expect(container.querySelector('[data-found="1"]')).not.toBeNull();
    expect(text(container)).toContain("وجد الشبكة");
  });
});

// ── m20 Wi-Fi security (PDF 163) ──
describe("Batch 7 — wifi-security (PDF 163): generic concept only, no WEP/WPA leak", () => {
  it("contrasts open vs protected with the named risks; NO WEP/WPA/WPA2/WPA3 (those are PDF 164)", () => {
    const { container } = render(<WifiSecurity ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["مفتوحة", "محمية", "تشفير", "كلمة مرور", "التنصّت", "Spoofing"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-state]")].map(g => g.getAttribute("data-state")).sort()).toEqual(["open", "protected"]);
    for (const leak of ["WEP", "WPA", "WPA2", "WPA3"]) expect(t).not.toContain(leak);
  });
});

// ── m20 Wi-Fi protection technologies (PDF 164) ──
describe("Batch 7 — wifi-protection-technologies (PDF 164): WEP → WPA → WPA2 / WPA3", () => {
  it("shows the four names in oldest→newest order with the book's ratings", () => {
    const { container } = render(<WifiProtectionTechnologies ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["WEP", "WPA", "WPA2", "WPA3", "ضعيف", "الأفضل"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-tech]")].map(g => g.getAttribute("data-tech"))).toEqual(["WEP", "WPA", "WPA2 / WPA3"]);
  });
});

// ── m20 Access Point (PDF 165) ──
describe("Batch 7 — access-point-bridge (PDF 165): AP bridges wireless to wired", () => {
  it("shows Switch (wired) — AP — devices (wireless); AP is a connection point, not a router", () => {
    const { container } = render(<AccessPointBridge ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["Switch", "AP", "الأجهزة", "Wi-Fi"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-leg]")].map(g => g.getAttribute("data-leg")).sort()).toEqual(["wired", "wireless"]);
    expect(t).not.toContain("راوتر");   // the book never calls the AP a router
  });
});

// ── m21 IPv6 anatomy (PDF 166) ──
describe("Batch 7 — ipv6-anatomy (PDF 166): 128 vs 32 bit, hexadecimal, no example, no compression", () => {
  it("shows the 128/32-bit contrast and hexadecimal; NO example address and NO '::'", () => {
    const { container } = render(<Ipv6Anatomy ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    for (const s of ["128", "32", "IPv4", "IPv6", "Hexadecimal"]) expect(t).toContain(s);
    expect([...container.querySelectorAll("[data-proto]")].map(g => g.getAttribute("data-proto"))).toEqual(["ipv4", "ipv6"]);
    for (const leak of ["::", "2001", "fe80", "2a00"]) expect(t).not.toContain(leak);   // compression / examples are PDF 167
  });
});

// ── m21 IPv6 compression (PDF 167) ──
describe("Batch 7 — ipv6-compression (PDF 167): the exact book examples, full → short", () => {
  it("shows the three exact full→short pairs and the :: rule", () => {
    const { container } = render(<Ipv6Compression ariaLabel="x" reducedMotion={true} />);
    const t = text(container);
    // exact book examples, character-for-character
    expect(t).toContain("2001:0db8:0000:0000:0000:ff00:0042:8329");
    expect(t).toContain("2001:db8::ff00:42:8329");
    expect(t).toContain("fe80:0000:0000:0000:0202:b3ff:fe1e:8329");
    expect(t).toContain("fe80::202:b3ff:fe1e:8329");
    expect(t).toContain("2a00:8640:0000:0000:0200:23ff:fe10:8329");
    expect(t).toContain("2a00:8640::200:23ff:fe10:8329");
    expect(t).toContain("::");
    expect(container.querySelectorAll("[data-full]").length).toBe(3);
    expect(container.querySelectorAll("[data-short]").length).toBe(3);
  });
  it("the compression reveals are one-shot (no restart)", () => {
    const { container } = render(<Ipv6Compression ariaLabel="x" reducedMotion={false} />);
    expect(byId(container, "shortReveal0")!.getAttribute("begin")).not.toContain(".end");
    expect(byId(container, "shortReveal0")!.getAttribute("fill")).toBe("freeze");
  });
});

// ── one-shot motion discipline: NO infinite loops, NO cyclic self-restart anywhere in Batch 7 ──
describe("Batch 7 — one-shot motion discipline (source scan)", () => {
  const dir = resolve(process.cwd(), "src/learning/visuals/791381/batch7") + "/";
  const files = readdirSync(dir).filter(f => f.endsWith(".tsx"));
  const sources = files.map(f => [f, readFileSync(dir + f, "utf8")] as const);

  it("scans every Batch 7 component and finds ZERO infinite animations (no repeatCount=\"indefinite\")", () => {
    expect(files.length).toBe(13);
    for (const [f, src] of sources) {
      expect(src, `${f} must not contain an infinite animation`).not.toMatch(/repeatCount=["'][^"']*indefinite/);
    }
  });
  it("no animation uses a cyclic self-restart begin (the multi-value \"...;X.end\" loop pattern)", () => {
    for (const [f, src] of sources) {
      const begins = src.match(/begin=[`"'][^`"']*[`"']/g) || [];
      for (const b of begins) expect(b, `${f}: cyclic-restart begin ${b}`).not.toContain(";");
    }
  });
});

// ── cross-cutting: reduced motion removes ALL SMIL animation; the animated ones render some when on ──
describe("Batch 7 — reduced motion drops all motion; the animated ones render some when on", () => {
  const ALL = [VtpRoles, InterSwitchTrunkPorts, SubinterfacesVlan1020, SubinterfacesVlan3040, DmzThreeZone, WifiRadioLink,
    WirelessNetworkTypes, SsidBeacon, WifiSecurity, WifiProtectionTechnologies, AccessPointBridge, Ipv6Anatomy, Ipv6Compression];
  const ANIMATED = [DmzThreeZone, WifiRadioLink, SsidBeacon, Ipv6Compression];
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
