// @vitest-environment happy-dom
// Batch 4 — SOURCE-FIDELITY + MOTION-SEMANTICS regressions (beyond page placement). These render the actual m16/m17
// visuals and assert what each SVG DOES and does NOT show, so a later edit that breaks the teaching motion (a hub
// that no longer collides, a broadcast that misses a device, an STP packet that crosses the blocked link, half/full
// duplex losing its sequencing, a localhost that leaves the device, a DoS/DDoS source count, a MitM that stops passing
// through the middle) — or leaks disallowed attack-mechanics content — is caught here.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import CollisionDomains from "./791381/batch4/CollisionDomains";
import BroadcastDomain from "./791381/batch4/BroadcastDomain";
import StpLoopBlocking from "./791381/batch4/StpLoopBlocking";
import HalfFullDuplex from "./791381/batch4/HalfFullDuplex";
import LocalhostLoopback from "./791381/batch4/LocalhostLoopback";
import ApipaFallback from "./791381/batch4/ApipaFallback";
import AttackTargets from "./791381/batch4/AttackTargets";
import DosVsDdos from "./791381/batch4/DosVsDdos";
import HijackingVsMitm from "./791381/batch4/HijackingVsMitm";
import PhishingVsSpoofing from "./791381/batch4/PhishingVsSpoofing";
import SecureTwoPillars from "./791381/batch4/SecureTwoPillars";
import VpnTunnel from "./791381/batch4/VpnTunnel";
import HttpsSecureChannel from "./791381/batch4/HttpsSecureChannel";

afterEach(cleanup);
const text = (node: Element) => node.textContent || "";
const anim = (root: Element, id: string) => root.querySelector(`animateMotion[id="${id}"]`);
const byId = (root: Element, id: string) => root.querySelector(`[id="${id}"]`);   // any SMIL element (animate / animateMotion)
const allMotion = (root: Element) => root.querySelectorAll("animateMotion").length;

// ── m16 · PDF 98–99 — collision domains: Hub shares one domain (collision), Switch separates each port ──
describe("Batch 4 — collision-domains (PDF 98–99): Hub shares, Switch separates", () => {
  it("draws ONE shared domain on the Hub side and a SEPARATE port-domain per switch port", () => {
    const { container } = render(<CollisionDomains ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-domain="shared"]').length).toBe(1);
    expect(container.querySelectorAll('[data-domain="port"]').length).toBe(4);   // 4 switch ports, each its own domain
    expect(text(container)).toContain("Hub");
    expect(text(container)).toContain("Switch");
  });
  it("shows a collision burst on the Hub only (two senders converge); the switch flows are independent (data-flow)", () => {
    const { container } = render(<CollisionDomains ariaLabel="x" reducedMotion={false} />);
    expect(container.querySelectorAll('[data-collision="1"]').length).toBe(1);
    // two converging packets on the hub side + two independent switch flows
    expect(container.querySelectorAll('[data-flow="1"]').length).toBeGreaterThanOrEqual(2);
    expect(allMotion(container)).toBeGreaterThanOrEqual(4);
  });
  it("is a causal bounded cycle: A and B start TOGETHER, arrive TOGETHER, THEN the burst, THEN the next pair", () => {
    const { container } = render(<CollisionDomains ariaLabel="x" reducedMotion={false} />);
    const a = anim(container, "hubA")!, b = anim(container, "hubB")!, burst = byId(container, "hubCollision")!;
    expect(a).not.toBeNull(); expect(b).not.toBeNull(); expect(burst).not.toBeNull();
    // the two packets start together and travel for the same time (→ arrive together)
    expect(a.getAttribute("begin")).toBe(b.getAttribute("begin"));
    expect(a.getAttribute("dur")).toBe(b.getAttribute("dur"));
    // the collision animates ONLY after the packets arrive (on hubA.end), and is NOT an independent pulse
    expect(burst.tagName.toLowerCase()).toBe("animate");
    expect(burst.getAttribute("begin")).toBe("hubA.end");
    // the next pair waits for the burst to finish (bounded cycle, no independent infinite loops)
    expect(a.getAttribute("begin")).toContain("hubCollision.end");
    expect(container.querySelector(".eb-visual-pulse")).toBeNull();   // no unrelated pulse
  });
  it("the Switch panel has NO collision marker (independent forwarding, never a collision)", () => {
    const { container } = render(<CollisionDomains ariaLabel="x" reducedMotion={false} />);
    // the collision marker sits on the Hub; the switch flows carry data-flow and no data-collision of their own
    const flows = [...container.querySelectorAll('[data-flow="1"]')];
    for (const f of flows) expect(f.querySelector('[data-collision="1"]')).toBeNull();
  });
  it("under reduced motion the collision burst is NOT animated (no pulse class) but the still frame keeps the domains", () => {
    const { container } = render(<CollisionDomains ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelector(".eb-visual-pulse")).toBeNull();
    expect(container.querySelectorAll('[data-collision="1"]').length).toBe(1);
    expect(allMotion(container)).toBe(0);
  });
});

// ── m16 · PDF 100 — broadcast reaches ALL devices; motion is causal (up to switch, then fan-out) ──
describe("Batch 4 — broadcast-domain (PDF 100): reaches every device, causally", () => {
  it("delivers to ALL four devices (one receive marker per target)", () => {
    const { container } = render(<BroadcastDomain ariaLabel="x" reducedMotion={false} />);
    expect(container.querySelectorAll('[data-recv="1"]').length).toBe(4);
    expect(text(container)).toContain("مجال بث واحد");
  });
  it("is causal: the fan-out to devices begins only when the source→switch leg ENDS (no premature broadcast)", () => {
    const { container } = render(<BroadcastDomain ariaLabel="x" reducedMotion={false} />);
    const up = anim(container, "bcUp");
    const fan = anim(container, "bcFan0");
    expect(up).not.toBeNull();
    expect(fan).not.toBeNull();
    expect(fan!.getAttribute("begin")).toBe("bcUp.end");                 // devices are reached AFTER the packet hits the switch
    expect(up!.getAttribute("begin")).toContain("bcFan0.end");           // the cycle repeats after the fan-out (bounded)
  });
  it("still frame keeps all four receive markers and no animateMotion", () => {
    const { container } = render(<BroadcastDomain ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-recv="1"]').length).toBe(4);
    expect(allMotion(container)).toBe(0);
  });
});

// ── m16 · PDF 102 — STP blocks one redundant path; the packet never crosses the blocked link ──
describe("Batch 4 — stp-loop-blocking (PDF 102): one path blocked, packet stays on the active tree", () => {
  it("marks exactly one blocked link with a block mark and names the three switches", () => {
    const { container } = render(<StpLoopBlocking ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-blocked="1"]').length).toBe(1);
    expect(container.querySelectorAll('[data-blockmark="1"]').length).toBe(1);
    const t = text(container);
    for (const sw of ["SW1", "SW2", "SW3"]) expect(t).toContain(sw);
    expect(t).toContain("منفذ محظور");
  });
  it("the traveling packet path visits only the active tree (SW1→SW2→SW3), never the blocked SW3↔SW1 link", () => {
    const { container } = render(<StpLoopBlocking ariaLabel="x" reducedMotion={false} />);
    const m = container.querySelector("animateMotion")!;
    const path = m.getAttribute("path")!;
    // active tree = SW1(190,42) → SW2(66,156) → SW3(314,156); the blocked link would be SW3(314,156)→SW1(190,42)
    expect(path).toBe("M 190 42 L 66 156 L 314 156");
    expect(path).not.toContain("314 156 L 190 42");   // never closes the loop over the blocked link
  });
});

// ── m16 · PDF 103 — half duplex is sequenced (one way at a time); full duplex is simultaneous ──
describe("Batch 4 — half-full-duplex (PDF 103): sequenced vs simultaneous", () => {
  it("HALF: the B→A leg begins only when the A→B leg ENDS (never simultaneous)", () => {
    const { container } = render(<HalfFullDuplex ariaLabel="x" reducedMotion={false} />);
    const ab = anim(container, "halfAB");
    const ba = anim(container, "halfBA");
    expect(ba!.getAttribute("begin")).toBe("halfAB.end");        // B→A waits for A→B to finish
    expect(ab!.getAttribute("begin")).toContain("halfBA.end");   // then repeats — one direction at a time
    expect(text(container)).toContain("اتجاه واحد في كل مرة");
  });
  it("FULL: both directions begin at 0s (simultaneous) on two separate lanes", () => {
    const { container } = render(<HalfFullDuplex ariaLabel="x" reducedMotion={false} />);
    const ab = anim(container, "fullAB");
    const ba = anim(container, "fullBA");
    expect(ab!.getAttribute("begin")).toBe("0s");
    expect(ba!.getAttribute("begin")).toBe("0s");                // same time = full duplex
    expect(container.querySelectorAll('[data-full-dir="1"]').length).toBe(2);
    expect(text(container)).toContain("الاتجاهان في نفس الوقت");
  });
});

// ── m16 · PDF 104 — localhost loops back inside the device; nothing leaves to the network ──
describe("Batch 4 — localhost-loopback (PDF 104): 127.0.0.1 stays inside the machine", () => {
  it("shows the single device boundary and 127.0.0.1, and NO remote/router/internet node", () => {
    const { container } = render(<LocalhostLoopback ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-machine="1"]').length).toBe(1);
    const t = text(container);
    expect(t).toContain("127.0.0.1");
    for (const remote of ["راوتر", "الإنترنت", "خادم بعيد", "الشبكة الخارجية"]) expect(t).not.toContain(remote);
  });
  it("the loopback packet path returns to the same device (starts and ends at the App x, no external x)", () => {
    const { container } = render(<LocalhostLoopback ariaLabel="x" reducedMotion={false} />);
    const path = container.querySelector('[data-loopback="1"] animateMotion')!.getAttribute("path")!;
    // App at x=190 with two lanes at x=168 (down) and x=212 (up); the packet ends back up at the App lane (y = APP.y+16 = 68)
    expect(path).toBe("M 168 68 L 168 112 L 212 112 L 212 68");
    expect(path.trimEnd().endsWith("68")).toBe(true);            // comes back UP to the app — a true loopback
  });
});

// ── m16 · PDF 105 — APIPA: no DHCP answer ⇒ self-assigned 169.254; local only, no internet claim ──
describe("Batch 4 — apipa-fallback (PDF 105): 169.254 self-assignment, local only", () => {
  it("shows the self-assigned 169.254 address and states it is local-only, without claiming internet connectivity", () => {
    const { container } = render(<ApipaFallback ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-apipa="1"]').length).toBe(1);
    const t = text(container);
    expect(t).toContain("169.254");
    expect(t).toContain("لا استجابة");                 // DHCP does not answer
    expect(t).toContain("داخل الشبكة المحلية فقط");     // explicitly local-only
    for (const claim of ["الإنترنت", "اتصال بالإنترنت", "متصل بالإنترنت"]) expect(t).not.toContain(claim);
  });
  it("motion sends a request toward the DHCP server that never answers (one outbound animation, no return reply)", () => {
    const { container } = render(<ApipaFallback ariaLabel="x" reducedMotion={false} />);
    expect(allMotion(container)).toBe(1);   // exactly one packet path — the request; there is NO return-path DHCP reply
  });
  it("is a causal fallback sequence: request → no-response → APIPA self-assignment (not APIPA from time zero)", () => {
    const { container } = render(<ApipaFallback ariaLabel="x" reducedMotion={false} />);
    const req = anim(container, "apipaReq")!, noResp = byId(container, "apipaNoResp")!, fb = byId(container, "apipaFallback")!;
    expect(req).not.toBeNull(); expect(noResp).not.toBeNull(); expect(fb).not.toBeNull();
    // the no-response mark appears only when the request arrives
    expect(noResp.getAttribute("begin")).toBe("apipaReq.end");
    // the APIPA fallback is revealed ONLY after the no-response stage (never glowing from time zero)
    expect(fb.getAttribute("begin")).toBe("apipaNoResp.end");
    // the APIPA group starts hidden under motion (opacity 0) — it is not visible before the failure
    expect(container.querySelector('[data-fallback="1"]')!.getAttribute("opacity")).toBe("0");
    // the next request waits for the fallback stage to complete (bounded cycle)
    expect(req.getAttribute("begin")).toContain("apipaFallback.end");
  });
  it("RESETS the no-response state between cycles: it does not freeze, and returns to opacity 0 before the next request", () => {
    const { container } = render(<ApipaFallback ariaLabel="x" reducedMotion={false} />);
    const noResp = byId(container, "apipaNoResp")!;
    // it must NOT hold its last value — otherwise «لا استجابة» would linger into the next request
    expect(noResp.getAttribute("fill")).not.toBe("freeze");
    // its opacity animation ends at 0 (a bounded flash, cleanly reset)
    const values = (noResp.getAttribute("values") || "").split(";").map(s => s.trim());
    expect(values.at(-1)).toBe("0");
    // both transient groups are hidden at cycle start (base opacity 0 under motion)
    expect(container.querySelector('[data-noresp="1"]')!.getAttribute("opacity")).toBe("0");
    expect(container.querySelector('[data-fallback="1"]')!.getAttribute("opacity")).toBe("0");
  });
  it("reduced motion still shows the no-response mark AND the APIPA address (both visible statically)", () => {
    const { container } = render(<ApipaFallback ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelector('[data-noresp="1"]')!.getAttribute("opacity")).toBe("1");
    expect(container.querySelector('[data-fallback="1"]')!.getAttribute("opacity")).toBe("1");
    expect(container.querySelector('[data-apipa="1"]')).not.toBeNull();
    expect(text(container)).toContain("169.254");
    expect(text(container)).toContain("لا استجابة");
  });
});

// ── m17 · PDF 108 — attack targets: conceptual only (user / information / servers); no tools or mechanics ──
describe("Batch 4 — attack-targets (PDF 108): the three book targets, conceptual only", () => {
  it("names exactly the book's three targets (المستخدم · المعلومات · الخوادم) and no attack tooling", () => {
    const { container } = render(<AttackTargets ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-target="1"]').length).toBe(3);
    const t = text(container);
    for (const target of ["المستخدم", "المعلومات", "الخوادم"]) expect(t).toContain(target);
    for (const banned of ["Wireshark", "nmap", "botnet", "SYN", "port", "exploit", "malware"]) expect(t).not.toContain(banned);
  });
  it("reaches the three targets IN TURN via a bounded CHAIN — not three independent infinite loops", () => {
    const { container } = render(<AttackTargets ariaLabel="x" reducedMotion={false} />);
    const legs = [anim(container, "at0")!, anim(container, "at1")!, anim(container, "at2")!];
    for (const l of legs) expect(l).not.toBeNull();
    // each leg begins on the previous leg's end (sequential, no overlap)
    expect(legs[1].getAttribute("begin")).toBe("at0.end");
    expect(legs[2].getAttribute("begin")).toBe("at1.end");
    // the first leg restarts only when the last leg ends (bounded cycle)
    expect(legs[0].getAttribute("begin")).toContain("at2.end");
    // none is an independent infinite loop
    for (const l of legs) expect(l.getAttribute("repeatCount")).toBeNull();
  });
});

// ── m17 · PDF 109 — DoS: one source; DDoS: many sources ──
describe("Batch 4 — dos-vs-ddos (PDF 109): one source vs many sources", () => {
  it("DoS has a single source; DDoS has multiple sources (total 4 source nodes)", () => {
    const { container } = render(<DosVsDdos ariaLabel="x" reducedMotion={true} />);
    // 1 DoS source + 3 DDoS sources = 4
    expect(container.querySelectorAll('[data-src="1"]').length).toBe(4);
    const t = text(container);
    expect(t).toContain("DoS");
    expect(t).toContain("DDoS");
    expect(t).toContain("مصدر واحد يُغرق الخادم");
    expect(t).toContain("أجهزة كثيرة تُغرقه معًا");
  });
});

// ── m17 · PDF 110 — session hijacking vs MitM: attacker in the middle passes everything through ──
describe("Batch 4 — hijacking-vs-mitm (PDF 110): a distinct topology per concept", () => {
  it("hijacking shows a direct user↔server session seized from the side; MitM puts the attacker BETWEEN the two", () => {
    const { container } = render(<HijackingVsMitm ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-session="1"]').length).toBe(1);   // direct session exists (hijacking panel)
    expect(container.querySelectorAll('[data-hijack="1"]').length).toBe(1);
    const mitm = container.querySelector('[data-mitm="1"]');
    expect(mitm).not.toBeNull();
    // in the MitM row the attacker sits between user (x=60) and server (x=320)
    const byRole = (r: string) => container.querySelector(`[data-role="${r}"]`)!.getAttribute("data-x")!;
    const user = Number(byRole("user")), attacker = Number(byRole("attacker")), server = Number(byRole("server"));
    expect(user).toBeLessThan(attacker);
    expect(attacker).toBeLessThan(server);                                     // user → attacker → server, in a line
  });
  it("the MitM packet path passes THROUGH the attacker (user → attacker → server)", () => {
    const { container } = render(<HijackingVsMitm ariaLabel="x" reducedMotion={false} />);
    const paths = [...container.querySelectorAll("animateMotion")].map(a => a.getAttribute("path"));
    // the MitM leg routes via the middle node at x=190
    expect(paths.some(p => p === "M 86 194 L 190 194 L 294 194")).toBe(true);
  });
  it("Session Hijacking is causal: the active session runs FIRST, THEN the attacker takeover appears (on the session's end)", () => {
    const { container } = render(<HijackingVsMitm ariaLabel="x" reducedMotion={false} />);
    const session = anim(container, "hjSession")!, takeover = byId(container, "hjTakeover")!;
    expect(session).not.toBeNull(); expect(takeover).not.toBeNull();
    // the takeover is hidden until the session is established, and begins only on the session's end
    expect(container.querySelector('[data-hijack="1"]')!.getAttribute("opacity")).toBe("0");
    expect(takeover.getAttribute("begin")).toBe("hjSession.end");
    // the session restarts only after the takeover finishes (bounded cycle, not a static takeover from t=0)
    expect(session.getAttribute("begin")).toContain("hjTakeover.end");
  });
});

// ── m17 · PDF 111 — phishing (deceive the user) vs spoofing (forge the identity) ──
describe("Batch 4 — phishing-vs-spoofing (PDF 111): deception vs forgery", () => {
  it("phishing targets the user with a fake message; spoofing shows a forged trusted identity — no real brands/links", () => {
    const { container } = render(<PhishingVsSpoofing ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-phish="1"]').length).toBe(1);
    expect(container.querySelectorAll('[data-forged="1"]').length).toBe(1);
    const t = text(container);
    expect(t).toContain("Phishing");
    expect(t).toContain("Spoofing");
    expect(t).toContain("تخدع المستخدم ليثق بها");
    expect(t).toContain("تزييف الهوية لتبدو من جهة موثوقة");
    expect(t).not.toMatch(/https?:\/\//);                                     // no realistic malicious link
  });
});

// ── m17 · PDF 112 — secure communication = encryption AND identity verification (both pillars) ──
describe("Batch 4 — secure-two-pillars (PDF 112): both pillars, concurrent", () => {
  it("shows the encrypted channel AND the identity-verification check together", () => {
    const { container } = render(<SecureTwoPillars ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-encrypted="1"]').length).toBe(1);
    expect(container.querySelectorAll('[data-identity="1"]').length).toBe(1);
    expect(text(container)).toContain("الأمان = تشفير البيانات + التحقق من هوية الطرف الآخر");
  });
  it("presents TWO PILLARS together — NOT a data-then-identity protocol sequence (source PDF112 gives no such order)", () => {
    const { container } = render(<SecureTwoPillars ariaLabel="x" reducedMotion={false} />);
    const data = anim(container, "secData")!;
    const check = container.querySelector('animate[id="secCheck"]')!;
    expect(data).not.toBeNull();
    expect(check).not.toBeNull();
    // both pillars begin at 0s — concurrent; NEITHER is a consequence of the other
    expect(data.getAttribute("begin")).toBe("0s");
    expect(check.getAttribute("begin")).toBe("0s");
    // the identity check is NOT gated on the data arriving, and the data does NOT wait on the check
    expect(check.getAttribute("begin")).not.toContain("secData");
    expect(data.getAttribute("begin")).not.toContain("secCheck");
  });
  it("reduced motion still shows BOTH pillars (encrypted channel + identity verification)", () => {
    const { container } = render(<SecureTwoPillars ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-encrypted="1"]').length).toBe(1);
    expect(container.querySelectorAll('[data-identity="1"]').length).toBe(1);
  });
});

// ── m17 · PDF 113 — VPN tunnel: the packet stays inside the encrypted tunnel crossing the untrusted zone ──
describe("Batch 4 — vpn-tunnel (PDF 113): stays in the tunnel across the untrusted zone", () => {
  it("draws the untrusted public zone AND the encrypted tunnel crossing it; only PARTIAL IP hiding is claimed", () => {
    const { container } = render(<VpnTunnel ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-untrusted="1"]').length).toBe(1);
    expect(container.querySelectorAll('[data-tunnel="1"]').length).toBe(1);
    const t = text(container);
    expect(t).toContain("نفق مشفّر");
    expect(t).toContain("شبكة عامة غير موثوقة");
    expect(t).toContain("جزئيًا");                                // partial hiding only — never claims full anonymity
    expect(t).not.toContain("إخفاء كامل");
  });
  it("the packet travels the tunnel lane (y=83) all the way across the untrusted zone", () => {
    const { container } = render(<VpnTunnel ariaLabel="x" reducedMotion={false} />);
    const path = container.querySelector("animateMotion")!.getAttribute("path")!;
    expect(path).toBe("M 74 83 L 306 83");                        // stays on the tunnel's centre line
  });
});

// ── m17 · PDF 114 — HTTPS = HTTP + security layer, protecting the browser↔server channel ──
describe("Batch 4 — https-secure-channel (PDF 114): HTTP + security = HTTPS", () => {
  it("shows the protected browser↔server channel and the conceptual HTTP + SSL/TLS = HTTPS equation", () => {
    const { container } = render(<HttpsSecureChannel ariaLabel="x" reducedMotion={true} />);
    expect(container.querySelectorAll('[data-secure="1"]').length).toBe(1);
    const t = text(container);
    for (const tok of ["HTTP", "SSL/TLS", "HTTPS", "المتصفّح", "الخادم"]) expect(t).toContain(tok);
    expect(t).toContain("قناة محميّة (SSL/TLS)");
  });
});

// ── Cross-cutting: reduced motion removes every SMIL animation from all thirteen batch-4 visuals ──
describe("Batch 4 — reduced motion drops ALL motion elements across every visual", () => {
  const COMPS = [CollisionDomains, BroadcastDomain, StpLoopBlocking, HalfFullDuplex, LocalhostLoopback,
    ApipaFallback, AttackTargets, DosVsDdos, HijackingVsMitm, PhishingVsSpoofing, SecureTwoPillars,
    VpnTunnel, HttpsSecureChannel];
  it("no <animateMotion>, no <animate>, and a valid still svg[role=img] for each", () => {
    for (const Comp of COMPS) {
      const { container } = render(<Comp ariaLabel="x" reducedMotion={true} />);
      expect(container.querySelectorAll("animateMotion").length, Comp.name).toBe(0);
      expect(container.querySelectorAll("animate").length, Comp.name).toBe(0);
      expect(container.querySelector('svg[role="img"]'), Comp.name).not.toBeNull();
      cleanup();
    }
  });
  it("with motion on, each visual renders at least one moving marker", () => {
    for (const Comp of COMPS) {
      const { container } = render(<Comp ariaLabel="x" reducedMotion={false} />);
      const marks = container.querySelectorAll("animateMotion, animate, .eb-visual-pulse, .eb-visual-glow-anim").length;
      expect(marks, Comp.name).toBeGreaterThan(0);
      cleanup();
    }
  });
});
