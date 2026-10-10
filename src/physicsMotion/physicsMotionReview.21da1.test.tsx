// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MOTION_KINDS, frictionPhases, motionEndTime, motionFrame, motionNaturalEnd, motionQuantities, motionSamples, type MotionFrame, type MotionKind, type MotionModel, type MotionParams } from "../physics/motionCore";
import { freeFallFrame } from "../physicsFreeFall/freeFallDynamics";
import { MOTION_PRESETS } from "./motionTemplates";
import { motionReadout } from "./motionView";
import MotionWorkspace from "./MotionWorkspace";

// Phase 21D-A.1 — focused independent-review follow-up. Three questions, each with deterministic evidence:
//   R1  arrival semantics: the frame at the end of a run is the INSTANT of impact / arrival (left limit): position on the ground / at the
//       bottom, velocity and acceleration = their values just before arrival (as physicsFreeFall@1: v(t_impact⁻) ≠ 0, a = −g), forces
//       consistent with Newton's second law (ΣF = m·a) in every frame, and nothing changes after the end (t is clamped).
//   R2  before the experiment is run (t = 0), the student-visible graphs and scene carry no graded reference value other than the live
//       instrument reading at t = 0 (event markers are named, never labelled with the future event's exact time).
//   R3  static → kinetic friction: static friction holds exactly up to |drive| = μs·N, kinetic friction always opposes the velocity
//       (or, from rest, the acceleration), velocity reverses only by passing through zero (continuity), and the motion is mirror-symmetric.
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const model = (kind: MotionKind, params: MotionParams): MotionModel => ({ kind, params });
const forceOf = (f: MotionFrame, id: string) => f.forces.find(x => x.id === id)!.vector;
/** ΣF over the independent forces (gravity components are a decomposition of the weight, never counted twice). */
const sumForces = (f: MotionFrame) => f.forces.filter(x => !["net", "gravityParallel", "gravityPerpendicular"].includes(x.id)).reduce((s, x) => ({ x: s.x + x.vector.x, y: s.y + x.vector.y }), { x: 0, y: 0 });
const expectNewton2ndLaw = (f: MotionFrame, mass: number, tag: string) => {
  const sum = sumForces(f), net = forceOf(f, "net"), scale = Math.max(1, ...f.forces.map(x => x.magnitude));
  expect(Math.abs(sum.x - net.x) / scale, tag + " ΣFx = net").toBeLessThan(1e-9);
  expect(Math.abs(sum.y - net.y) / scale, tag + " ΣFy = net").toBeLessThan(1e-9);
  expect(Math.abs(net.x - mass * f.acceleration.x) / scale, tag + " net x = m·a").toBeLessThan(1e-9);
  expect(Math.abs(net.y - mass * f.acceleration.y) / scale, tag + " net y = m·a").toBeLessThan(1e-9);
};
function randomFriction(kind: "newton2" | "incline", r: () => number): MotionParams {
  const muS = r() < 0.15 ? 0 : 1.2 * r(), muK = muS * r();
  return kind === "newton2"
    ? { mass: 0.5 + 20 * r(), appliedForce: (r() - 0.5) * 200, initialVelocity: r() < 0.3 ? 0 : (r() - 0.5) * 40, muStatic: muS, muKinetic: muK, gravity: 1 + 20 * r() }
    : { angle: 80 * r(), mass: 0.5 + 20 * r(), length: 1 + 30 * r(), initialVelocity: r() < 0.4 ? 0 : 10 * r(), muStatic: muS, muKinetic: muK, gravity: 1 + 20 * r() };
}

describe("R1 — impact / arrival semantics versus the post-impact state", () => {
  it("free fall: the end frame is the instant of impact — y = 0, v = v(t_impact⁻) (never 0), a = −g; identical to physicsFreeFall@1; clamped after", () => {
    for (const p of [{ initialHeight: 45, initialVelocity: 0, gravity: 9.8 }, { initialHeight: 30, initialVelocity: 10, gravity: 10 }, { initialHeight: 0, initialVelocity: 12, gravity: 9.8 }, { initialHeight: 50, initialVelocity: -5, gravity: 1.62 }]) {
      const m = model("freeFall", p), end = motionEndTime(m, 600), f = motionFrame(m, end, end), legacy = freeFallFrame(p, end + 7);
      expect(f.status).toBe("landed"); expect(f.position.y).toBe(0);
      expect(f.velocity.y).toBeCloseTo(-Math.sqrt(p.initialVelocity ** 2 + 2 * p.gravity * p.initialHeight), 9);
      expect(f.velocity.y).toBeLessThan(0); expect(f.acceleration.y).toBe(-p.gravity);
      expect([f.velocity.y, f.acceleration.y]).toEqual([legacy.v, legacy.a]);                        // physicsFreeFall@1 semantics, unchanged
      expect(motionFrame(m, end + 100, end)).toEqual(f); expect(motionFrame(m, Infinity, end).t).toBe(0);
      const before = motionFrame(m, end * (1 - 1e-9), end);                                           // left limit: no jump at the impact instant
      expect(Math.abs(before.velocity.y - f.velocity.y)).toBeLessThan(1e-6); expect(before.status).toBe("flight");
    }
  });
  it("projectile: the end frame is the landing instant — on the ground at x = R, velocity = landing velocity, a = (0, −g), speed = impactSpeed", () => {
    const p = { initialSpeed: 20, launchAngle: 45, launchHeight: 0, gravity: 9.8 }, m = model("projectile", p), end = motionEndTime(m, 10), f = motionFrame(m, end, end), q = motionQuantities(m, 10);
    expect(f.status).toBe("landed"); expect(f.position.y).toBe(0); expect(f.position.x).toBeCloseTo(q.range!, 9);
    expect(f.speed).toBeCloseTo(q.impactSpeed!, 9); expect(f.velocity.y).toBeLessThan(0); expect(f.acceleration).toEqual({ x: 0, y: -9.8 });
  });
  it("inclined plane: the arrival frame keeps the pre-arrival acceleration, so ΣF = m·a holds at the bottom (velocity = speedAtBottom)", () => {
    const p = { angle: 30, mass: 5, length: 10, initialVelocity: 0, muStatic: 0.3, muKinetic: 0.2, gravity: 9.8 }, m = model("incline", p), end = motionEndTime(m, 5);
    const f = motionFrame(m, end, end), before = motionFrame(m, end * (1 - 1e-9), end), q = motionQuantities(m, 5);
    expect(f.status).toBe("bottom"); expect(f.along!.s).toBeCloseTo(10, 9); expect(f.along!.v).toBeCloseTo(q.speedAtBottom!, 9);
    expect(f.along!.a).toBeCloseTo(before.along!.a, 9);                                               // 3.20259 m/s², not a jump to 0
    expect(f.along!.a).toBeCloseTo(9.8 * (0.5 - 0.2 * Math.cos(Math.PI / 6)), 9);
    expectNewton2ndLaw(f, p.mass, "incline @ bottom");
    expect(motionFrame(m, end + 50, end)).toEqual(f);
  });
  it("ΣF = m·a in EVERY frame of 2 × 300 random Newton / incline runs, including the end frame (deterministic sweep)", () => {
    const r = rng(2101);
    for (const kind of ["newton2", "incline"] as const) for (let i = 0; i < 300; i++) {
      const p = randomFriction(kind, r), m = model(kind, p), maxTime = 0.5 + 20 * r(), end = motionEndTime(m, maxTime);
      for (const f of motionSamples(m, end, 61)) expectNewton2ndLaw(f, p.mass, kind + " #" + i + " t=" + f.t);
    }
  });
});

describe("R2 — student-visible graphs before the experiment is run", () => {
  beforeEach(() => { vi.stubGlobal("requestAnimationFrame", () => 1); vi.stubGlobal("cancelAnimationFrame", () => {}); window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })) as never; });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  /** Every number with ≥ 3 significant digits in the text, titles, aria labels and data attributes of `root`. */
  const numbersIn = (root: Element) => {
    const parts: string[] = [root.textContent ?? ""];
    for (const el of [root, ...root.querySelectorAll("*")]) for (const a of el.getAttributeNames()) if (a === "aria-label" || a.startsWith("data-")) parts.push(el.getAttribute(a) ?? "");
    return (parts.join(" ").match(/\d+(?:\.\d+)?/g) ?? []).filter(t => t.replace(".", "").replace(/^0+/, "").length >= 3).map(Number);
  };
  it.each(MOTION_KINDS)("%s: no graded reference value is printed in the graphs or the scene at t = 0 except the live instrument reading", kind => {
    const { config, checks } = MOTION_PRESETS[kind]();
    const m = model(kind, config.params), end = motionEndTime(m, config.view.maxTime), q = motionQuantities(m, config.view.maxTime);
    const graded: { label: string; value: number; tol: number }[] = [];
    for (const c of checks as Record<string, unknown>[]) {
      const tol = Math.max(c.tolerance as number, 1e-6);
      if (c.kind === "motion.referenceValue") graded.push({ label: String(c.quantity), value: q[c.quantity as string] as number, tol });
      if (c.kind === "pointNear@1") { const e = c.expected as { x: number; y: number }; graded.push({ label: c.id + ".x", value: e.x, tol }, { label: c.id + ".y", value: e.y, tol }); }
    }
    const instrument = motionReadout(m, motionFrame(m, 0, end)).map(x => Math.abs(Number(x.value)));
    const leakable = graded.filter(g => Math.abs(g.value) >= 0.1 && !instrument.some(v => Math.abs(v - Math.abs(g.value)) <= g.tol));
    const { container } = render(<MotionWorkspace config={config} actions={[]} onChange={() => {}} label="t" />);
    const shown = [...container.querySelectorAll("[data-testid^=motion-graph-], [data-testid=motion-scene]")].flatMap(numbersIn);
    const leaks = leakable.filter(g => shown.some(v => Math.abs(v - Math.abs(g.value)) <= g.tol)).map(g => g.label + " = " + g.value);
    expect(leaks).toEqual([]);
    // the events themselves are still marked (by name), so the experiment keeps its landmarks
    if (kind !== "newton2") expect(container.querySelectorAll("[data-testid=motion-graph-primary] .xp-dyn-event").length).toBeGreaterThan(0);
  });
});

describe("R3 — static → kinetic friction thresholds and velocity reversals", () => {
  // m = 1 kg, g = 10, μs = 0.5, μk = 0.25 ⇒ N = 10 N, μs·N = 5 N, μk·N = 2.5 N (all exactly representable)
  const base = { mass: 1, initialVelocity: 0, muStatic: 0.5, muKinetic: 0.25, gravity: 10 };
  it("threshold: |F| = μs·N exactly holds (static friction = −F); just above, it slides with a = (F ∓ μk·N)/m — both directions", () => {
    for (const F of [5, -5, 4.999999, -4.999999, 0]) {
      const m = model("newton2", { ...base, appliedForce: F }), f = motionFrame(m, 1, 4);
      expect([f.status, f.velocity.x, f.acceleration.x, forceOf(f, "friction").x + 0]).toEqual(["rest", 0, 0, -F + 0]);
    }
    for (const F of [5 + 1e-9, 7, -(5 + 1e-9), -7]) {
      const m = model("newton2", { ...base, appliedForce: F }), f = motionFrame(m, 1, 4), s = Math.sign(F);
      expect(f.status).toBe("moving"); expect(f.acceleration.x).toBeCloseTo(F - s * 2.5, 12); expect(forceOf(f, "friction").x).toBe(-s * 2.5);
      expect(Math.sign(f.velocity.x)).toBe(s);
    }
  });
  it("incline threshold: tanθ ≤ μs holds at the top; tanθ just above μs slides with a = g(sinθ − μk·cosθ)", () => {
    const th = 30, tan = Math.tan(Math.PI / 6);
    const hold = model("incline", { angle: th, mass: 2, length: 5, initialVelocity: 0, muStatic: tan * (1 + 1e-9), muKinetic: 0.1, gravity: 10 });
    const slide = model("incline", { angle: th, mass: 2, length: 5, initialVelocity: 0, muStatic: tan * (1 - 1e-9), muKinetic: 0.1, gravity: 10 });
    expect(motionNaturalEnd(hold)).toBe(Infinity); expect(motionFrame(hold, 3, 3).status).toBe("rest");
    expect(motionFrame(hold, 3, 3).along).toEqual({ s: 0, v: 0, a: 0 });
    const f = motionFrame(slide, 0.5, motionEndTime(slide, 10));
    expect(f.status).toBe("moving"); expect(f.along!.a).toBeCloseTo(10 * (0.5 - 0.1 * Math.cos(Math.PI / 6)), 9);
  });
  it("reversal: v0 = +5 m/s against F = −10 N stops at t = 5/7 s then reverses; v passes through 0 continuously and friction flips to oppose the new motion", () => {
    const p = { ...base, mass: 2, appliedForce: -10, initialVelocity: 5, muStatic: 0.3, muKinetic: 0.2 }, m = model("newton2", p);   // N = 20, fs = 6, fk = 4
    const tStop = 5 / 7, ph = frictionPhases({ drive: -10, normal: 20, mass: 2, muStatic: 0.3, muKinetic: 0.2, v0: 5 });
    expect(ph.map(x => [x.rest, x.a])).toEqual([[false, -7], [false, -3]]); expect(ph[1].t0).toBeCloseTo(tStop, 15);
    const pre = motionFrame(m, tStop - 1e-7, 4), at = motionFrame(m, tStop, 4), post = motionFrame(m, tStop + 1e-7, 4);
    expect(pre.velocity.x).toBeGreaterThan(0); expect(Math.abs(at.velocity.x)).toBeLessThan(1e-12); expect(post.velocity.x).toBeLessThan(0);
    expect(Math.abs(pre.position.x - post.position.x)).toBeLessThan(1e-6);
    expect(forceOf(pre, "friction").x).toBe(-4); expect(forceOf(post, "friction").x).toBe(4); expect(forceOf(at, "friction").x).toBe(4);
    expect(pre.acceleration.x).toBe(-7); expect(post.acceleration.x).toBe(-3);
    // stop-then-rest: |F| ≤ μs·N after the stop ⇒ static friction −F, the block stays where it stopped
    const rest = model("newton2", { ...p, appliedForce: -5 }), r1 = motionFrame(rest, 2, 4), r2 = motionFrame(rest, 4, 4);
    expect([r1.status, r1.velocity.x, forceOf(r1, "friction").x]).toEqual(["rest", 0, 5]); expect(r2.position.x).toBe(r1.position.x);
  });
  it("sweep (2 × 200 runs): kinetic friction = μk·N opposing v (or a from rest), static |f| ≤ μs·N, v and x continuous, mirror symmetry", () => {
    const r = rng(3303), bad: string[] = [];
    const check = (ok: boolean, tag: string) => { if (!ok && bad.length < 10) bad.push(tag); };
    for (const kind of ["newton2", "incline"] as const) for (let i = 0; i < 200; i++) {
      const p = randomFriction(kind, r), m = model(kind, p), maxTime = 0.5 + 20 * r(), end = motionEndTime(m, maxTime);
      const th = kind === "newton2" ? 0 : (p.angle * Math.PI) / 180, N = p.mass * p.gravity * Math.cos(th);
      const frames = motionSamples(m, end, 241);
      let aMax = 0, vMax = 0;
      for (const f of frames) { const a = f.along!; aMax = Math.max(aMax, Math.abs(a.a)); vMax = Math.max(vMax, Math.abs(a.v)); }
      for (let k = 0; k < frames.length; k++) {
        const f = frames[k], a = f.along!, fr = forceOf(f, "friction");
        const frAlong = fr.x * Math.cos(th) - fr.y * Math.sin(th);                                  // component along the motion axis (down-slope)
        const tag = kind + " #" + i + " t=" + f.t;
        if (f.status === "rest") { check(a.v === 0 && a.a === 0, tag + " rest ⇒ v = a = 0"); check(Math.abs(frAlong) <= p.muStatic * N * (1 + 1e-12) + 1e-12, tag + " |static| ≤ μs·N"); }
        else if (f.status === "moving") {
          check(Math.abs(Math.abs(frAlong) - p.muKinetic * N) <= 1e-9 * Math.max(1, N), tag + " |kinetic| = μk·N");
          const dir = Math.sign(a.v) || Math.sign(a.a);
          if (p.muKinetic > 0 && dir !== 0) check(Math.sign(frAlong) === -dir, tag + " kinetic opposes motion");
        }
        if (k > 0) {
          const dt = f.t - frames[k - 1].t, prev = frames[k - 1].along!;
          check(Math.abs(a.v - prev.v) <= aMax * dt * (1 + 1e-9) + 1e-9, tag + " v continuous (no jump reversal)");
          check(Math.abs(a.s - prev.s) <= vMax * dt * (1 + 1e-9) + 1e-9, tag + " x continuous");
        }
      }
      if (kind === "newton2") {
        const mirror = model("newton2", { ...p, appliedForce: -p.appliedForce, initialVelocity: -p.initialVelocity });
        for (const t of [0, end * 0.37, end]) {
          const f = motionFrame(m, t, end), g = motionFrame(mirror, t, end);
          check(Math.abs(g.position.x + f.position.x) < 1e-9 * Math.max(1, Math.abs(f.position.x)) && Math.abs(g.velocity.x + f.velocity.x) < 1e-9 * Math.max(1, Math.abs(f.velocity.x)) && g.status === f.status, "newton2 #" + i + " mirror at t=" + t);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
