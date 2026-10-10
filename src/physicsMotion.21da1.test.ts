import { describe, expect, it } from "vitest";
import {
  MOTION_KINDS, MOTION_PARAM_SPEC, frictionPhases, frictionAt, motionEndTime, motionFrame, motionNaturalEnd, motionParamsProblem, motionQuantities, motionSamples,
  validateMotionParams, type MotionKind, type MotionModel, type MotionParams
} from "./physics/motionCore";
import { heightAt, impactSpeed, impactTime, velocityAt } from "./physicsFreeFallModel";
import { validateMotionConfig, motionExplorationProblem, type MotionConfigV1 } from "./physicsMotionModel";
import { replayMotion } from "./physicsMotionPlugin";
import { MOTION_PRESETS } from "./physicsMotion/motionTemplates";
import { evaluateSmartSim, projectSmartSimForStudent, resolveSmartSimDescriptor, resolveSmartSimPlugin, validateSmartSimQuestion } from "./trustedSimPlugins";

// Phase 21D-A.1 — the shared physics core and physicsMotion@1: scientific correctness (hand-computed certification values, an independent
// numerical integrator, conservation laws, compatibility with physicsFreeFall@1), robustness (no NaN / Infinity over the whole parameter
// space), strict validation, and the JSON lifecycle through the real SmartSim authority (validate, project for the student, grade).
const close = (a: number | null | undefined, b: number, tol: number) => { expect(typeof a).toBe("number"); expect(Math.abs((a as number) - b)).toBeLessThanOrEqual(tol); };
/** Deterministic PRNG (mulberry32) so the parameter sweeps are reproducible. */
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randomParams(kind: MotionKind, r: () => number): MotionParams {
  for (;;) {
    const p: MotionParams = {};
    for (const s of MOTION_PARAM_SPEC[kind]) p[s.key] = s.min + (s.max - s.min) * (r() < 0.1 ? Math.round(r()) : r());   // 10 %: exact bounds
    if (kind === "newton2" || kind === "incline") { const a = p.muStatic, b = p.muKinetic; p.muStatic = Math.max(a, b); p.muKinetic = Math.min(a, b); }
    if (!motionParamsProblem(kind, p)) return p;
  }
}
const model = (kind: MotionKind, params: MotionParams): MotionModel => ({ kind, params });

describe("21D-A.1 certification values (hand-computed from the governing equations)", () => {
  it("SIM-01 free fall: 45 m from rest, g = 9.8 — t = 3.03046 s, impact speed = 29.6985 m/s", () => {
    const q = motionQuantities(model("freeFall", { initialHeight: 45, initialVelocity: 0, gravity: 9.8 }), 5);
    close(q.impactTime, Math.sqrt(90 / 9.8), 1e-12); close(q.impactSpeed, Math.sqrt(882), 1e-12); close(q.peakHeight, 45, 0); close(q.accelerationMagnitude, 9.8, 0);
    close(q.impactTime, 3.03046, 1e-5); close(q.impactSpeed, 29.6985, 1e-4);
  });
  it("SIM-02 projectile: 20 m/s at 45° from the ground — T = 2.88615 s, R = 40.8163 m, H = 10.2041 m", () => {
    const q = motionQuantities(model("projectile", { initialSpeed: 20, launchAngle: 45, launchHeight: 0, gravity: 9.8 }), 10);
    close(q.flightTime, 2.88615, 1e-5); close(q.range, 400 / 9.8, 1e-9); close(q.maxHeight, 200 / 19.6, 1e-9); close(q.apexTime, 2.88615 / 2, 1e-5); close(q.impactSpeed, 20, 1e-9);
  });
  it("SIM-02 projectile from a height: 10 m/s horizontal from 20 m — T = √(2h/g), R = v·T", () => {
    const q = motionQuantities(model("projectile", { initialSpeed: 10, launchAngle: 0, launchHeight: 20, gravity: 9.8 }), 10);
    close(q.flightTime, Math.sqrt(40 / 9.8), 1e-12); close(q.range, 10 * Math.sqrt(40 / 9.8), 1e-9); close(q.maxHeight, 20, 0); close(q.apexTime, 0, 0);
  });
  it("SIM-03 Newton's second law: 2 kg, F = 10 N, μs = 0.3, μk = 0.2 — a = 3.04 m/s², after 4 s v = 12.16 m/s, x = 24.32 m", () => {
    const m = model("newton2", { mass: 2, appliedForce: 10, initialVelocity: 0, muStatic: 0.3, muKinetic: 0.2, gravity: 9.8 }), q = motionQuantities(m, 4);
    close(q.weight, 19.6, 1e-12); close(q.normalForce, 19.6, 1e-12); close(q.maxStaticFriction, 5.88, 1e-12); close(q.kineticFriction, 3.92, 1e-12);
    close(q.initialAcceleration, 3.04, 1e-12); close(q.initialNetForce, 6.08, 1e-12); close(q.finalVelocity, 12.16, 1e-9); close(q.finalDisplacement, 24.32, 1e-9);
    close(motionFrame(m, 2, 4).position.x, 6.08, 1e-12);
    const forces = Object.fromEntries(motionFrame(m, 1, 4).forces.map(f => [f.id, f.vector]));
    expect(forces.applied).toEqual({ x: 10, y: 0 }); close(forces.friction.x, -3.92, 1e-12); close(forces.net.x, 6.08, 1e-12); close(forces.normal.y, 19.6, 1e-12);
  });
  it("SIM-04 inclined plane: 30°, μs = 0.3, μk = 0.2, L = 10 m — a = 3.20259 m/s², N = 42.4352 N, t = 2.49899 s, v = 8.00324 m/s", () => {
    const m = model("incline", { angle: 30, mass: 5, length: 10, initialVelocity: 0, muStatic: 0.3, muKinetic: 0.2, gravity: 9.8 }), q = motionQuantities(m, 5);
    const a = 9.8 * (0.5 - 0.2 * Math.cos(Math.PI / 6));
    close(q.initialAcceleration, a, 1e-12); close(q.initialAcceleration, 3.20259, 1e-5); close(q.normalForce, 42.4352, 1e-4); close(q.gravityParallel, 24.5, 1e-12);
    close(q.timeToBottom, Math.sqrt(20 / a), 1e-12); close(q.timeToBottom, 2.49899, 1e-5); close(q.speedAtBottom, Math.sqrt(20 * a), 1e-9); close(q.speedAtBottom, 8.00324, 1e-5);
    const end = motionEndTime(m, 5), f = motionFrame(m, end, end);
    expect(f.status).toBe("bottom"); close(f.along!.s, 10, 1e-9); close(f.position.x, 10 * Math.cos(Math.PI / 6), 1e-9); close(f.position.y, 0, 1e-9);
  });
  it("SIM-04 static friction holds when tanθ ≤ μs (block stays at the top, timeToBottom undefined)", () => {
    const m = model("incline", { angle: 15, mass: 5, length: 10, initialVelocity: 0, muStatic: 0.3, muKinetic: 0.2, gravity: 9.8 }), q = motionQuantities(m, 5);
    expect(Math.tan(15 * Math.PI / 180)).toBeLessThan(0.3);
    expect(q.timeToBottom).toBeNull(); expect(q.speedAtBottom).toBeNull(); close(q.initialAcceleration, 0, 0);
    const f = motionFrame(m, 3, motionEndTime(m, 5));
    expect(f.status).toBe("rest"); close(f.along!.s, 0, 0);
    const fr = f.forces.find(x => x.id === "friction")!, par = f.forces.find(x => x.id === "gravityParallel")!;
    close(fr.vector.x + par.vector.x, 0, 1e-9); close(fr.vector.y + par.vector.y, 0, 1e-9);   // static friction exactly balances mg·sinθ
  });
});

describe("21D-A.1 the core agrees with independent computations", () => {
  it("free fall: identical to the physicsFreeFall@1 engine over a parameter sweep (compatibility)", () => {
    const r = rng(1);
    for (let i = 0; i < 300; i++) {
      const p = randomParams("freeFall", r), legacy = { initialHeight: p.initialHeight, initialVelocity: p.initialVelocity, gravity: p.gravity }, m = model("freeFall", p);
      const end = motionNaturalEnd(m);
      expect(end).toBe(impactTime(legacy));
      expect(motionQuantities(m, end).impactSpeed).toBe(impactSpeed(legacy));
      for (const t of [0, end * 0.25, end * 0.5, end * 0.9]) { const f = motionFrame(m, t, end); close(f.position.y, Math.max(0, heightAt(legacy, t)), 1e-9 * (1 + Math.abs(f.position.y))); expect(f.velocity.y).toBe(velocityAt(legacy, t)); }
    }
  });
  it("projectile: energy is conserved (v² = v0² + 2g(h0 − y)) and the flight ends exactly on the ground", () => {
    const r = rng(2);
    for (let i = 0; i < 300; i++) {
      const p = randomParams("projectile", r), m = model("projectile", p), end = motionNaturalEnd(m);
      expect(Number.isFinite(end) && end > 0).toBe(true);
      for (const t of [0, end / 3, end / 2, end]) {
        const f = motionFrame(m, t, end), lhs = f.speed * f.speed, rhs = p.initialSpeed ** 2 + 2 * p.gravity * (p.launchHeight - f.position.y);
        expect(Math.abs(lhs - rhs)).toBeLessThanOrEqual(1e-9 * Math.max(1, lhs));
      }
      expect(Math.abs(p.launchHeight + p.initialSpeed * Math.sin(p.launchAngle * Math.PI / 180) * end - 0.5 * p.gravity * end * end)).toBeLessThanOrEqual(1e-7 * Math.max(1, p.launchHeight + p.initialSpeed * end));
    }
  });
  it("Newton's second law and the incline: the exact piecewise solution matches a fine-step numerical integration of the forces", () => {
    // independent reference: semi-implicit Euler with the friction law applied step by step (dt = 1e-4 s)
    const integrate = (drive: number, N: number, m: number, muS: number, muK: number, v0: number, T: number) => {
      let x = 0, v = v0; const dt = 1e-4;
      for (let t = 0; t < T - 1e-12; t += dt) {
        let a: number;
        if (Math.abs(v) < 1e-9) a = Math.abs(drive) <= muS * N ? 0 : (drive - Math.sign(drive) * muK * N) / m;
        else { a = (drive - Math.sign(v) * muK * N) / m; const nv = v + a * dt; if (Math.sign(nv) !== Math.sign(v) && Math.sign(nv) !== 0) { x += v * (-v / a) / 2; v = 0; continue; } }
        v += a * dt; x += v * dt;
      }
      return { x, v };
    };
    const r = rng(3);
    for (let i = 0; i < 60; i++) {
      const mass = 0.5 + 10 * r(), drive = (r() - 0.5) * 60, N = mass * 9.8, muS = 0.6 * r(), muK = muS * r(), v0 = (r() - 0.5) * 10, T = 3;
      const exact = frictionAt(frictionPhases({ drive, normal: N, mass, muStatic: muS, muKinetic: muK, v0 }), T), num = integrate(drive, N, mass, muS, muK, v0, T);
      expect(Math.abs(exact.x - num.x)).toBeLessThan(0.02 + 0.002 * Math.abs(exact.x));
      expect(Math.abs(exact.v - num.v)).toBeLessThan(0.02 + 0.002 * Math.abs(exact.v));
    }
  });
  it("static friction threshold: at |F| = μs·N the block stays; just above it slides with a = (F − μk·N)/m", () => {
    const base = { mass: 2, initialVelocity: 0, muStatic: 0.5, muKinetic: 0.4, gravity: 10 };
    const at = model("newton2", { ...base, appliedForce: 10 }), above = model("newton2", { ...base, appliedForce: 10.5 });
    expect(motionFrame(at, 2, 4).status).toBe("rest"); expect(motionFrame(at, 2, 4).position.x).toBe(0);
    close(motionFrame(above, 2, 4).acceleration.x, (10.5 - 8) / 2, 1e-12);
  });
  it("a block thrown against the force stops, then stays (|F| ≤ μs·N) or reverses (|F| > μs·N)", () => {
    const stays = model("newton2", { mass: 1, appliedForce: -2, initialVelocity: 4, muStatic: 0.5, muKinetic: 0.3, gravity: 10 });
    const tStop = 4 / ((2 + 3) / 1);
    close(motionFrame(stays, tStop + 1, 10).velocity.x, 0, 1e-12); expect(motionFrame(stays, tStop + 1, 10).status).toBe("rest");
    const reverses = model("newton2", { mass: 1, appliedForce: -8, initialVelocity: 4, muStatic: 0.5, muKinetic: 0.3, gravity: 10 });
    const tStop2 = 4 / (8 + 3);
    close(motionFrame(reverses, tStop2 + 1, 10).velocity.x, -(8 - 3) * 1, 1e-9);
  });
});

describe("21D-A.1 robustness: no NaN / Infinity, deterministic time", () => {
  it("every frame, sample and reference quantity is finite (or explicitly null) over 4 × 400 random parameter sets including the bounds", () => {
    const r = rng(4);
    for (const kind of MOTION_KINDS) for (let i = 0; i < 400; i++) {
      const p = randomParams(kind, r), m = model(kind, p), maxTime = 0.5 + 50 * r(), end = motionEndTime(m, kind === "freeFall" || kind === "projectile" ? Math.max(maxTime, motionNaturalEnd(m)) : maxTime);
      expect(Number.isFinite(end) && end >= 0).toBe(true);
      for (const f of motionSamples(m, end, 12)) {
        for (const v of [f.t, f.position.x, f.position.y, f.velocity.x, f.velocity.y, f.acceleration.x, f.acceleration.y, f.speed]) expect(Number.isFinite(v)).toBe(true);
        for (const fo of f.forces) expect(Number.isFinite(fo.vector.x) && Number.isFinite(fo.vector.y) && Number.isFinite(fo.magnitude)).toBe(true);
      }
      for (const v of Object.values(motionQuantities(m, maxTime))) expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });
  it("time is deterministic: a frame is a pure function of t (no hidden integrator state); out-of-range / non-finite t is clamped", () => {
    const p = { initialSpeed: 20, launchAngle: 45, launchHeight: 0, gravity: 9.8 }, m = model("projectile", p), end = motionEndTime(m, 10);
    const times = Array.from({ length: 40 }, (_, k) => Math.min(end, k * 0.1));
    const forward = times.map((t) => motionFrame(m, t, end));
    const backward = [...times].reverse().map((t) => motionFrame(m, t, end)).reverse();
    const fresh = times.map((t) => motionFrame(model("projectile", { ...p }), t, end));
    expect(backward).toEqual(forward); expect(fresh).toEqual(forward);
    expect(motionFrame(m, NaN, end).t).toBe(0); expect(motionFrame(m, -5, end).t).toBe(0); expect(motionFrame(m, 1e9, end).t).toBe(end); expect(motionFrame(m, Infinity, end).t).toBe(0);
    const s = motionSamples(m, end, 50);
    expect(s).toHaveLength(50); expect(s[49].t).toBe(end); for (let i = 1; i < 50; i++) expect(s[i].t).toBeGreaterThan(s[i - 1].t);
  });
});

describe("21D-A.1 strict validation (refused, never clamped)", () => {
  it("parameters: non-finite, out of bounds, missing / extra keys, μk > μs, motionless starts are refused", () => {
    const ok = { initialSpeed: 20, launchAngle: 45, launchHeight: 0, gravity: 9.8 };
    expect(validateMotionParams("projectile", ok)).toEqual(ok);
    for (const bad of [{ ...ok, initialSpeed: NaN }, { ...ok, gravity: Infinity }, { ...ok, gravity: 0 }, { ...ok, launchAngle: 91 }, { initialSpeed: 1 }, { ...ok, extra: 1 }, { ...ok, initialSpeed: "20" },
      { ...ok, launchAngle: 0 }, { ...ok, initialSpeed: 0 }]) expect(motionParamsProblem("projectile", bad), JSON.stringify(bad)).toBeTypeOf("string");
    expect(motionParamsProblem("newton2", { mass: 1, appliedForce: 1, initialVelocity: 0, muStatic: 0.2, muKinetic: 0.3, gravity: 9.8 })).toMatch(/الحركي/);
    expect(motionParamsProblem("freeFall", { initialHeight: 0, initialVelocity: 0, gravity: 9.8 })).toBeTypeOf("string");
    expect(motionParamsProblem("incline", { angle: 81, mass: 1, length: 1, initialVelocity: 0, muStatic: 0, muKinetic: 0, gravity: 9.8 })).toBeTypeOf("string");
  });
  it("config: every preset is valid; unknown keys / experiment / version, bad controls, short duration and bad tasks are refused with codes", () => {
    const codes = (raw: unknown) => { const r = validateMotionConfig(raw); return r.ok ? [] : r.issues.map(i => i.code); };
    for (const k of MOTION_KINDS) { const p = MOTION_PRESETS[k](); expect(codes(p.config), k).toEqual([]); expect(validateMotionConfig(JSON.parse(JSON.stringify(p.config)))).toEqual({ ok: true, config: p.config }); }
    const c = MOTION_PRESETS.projectile().config;
    expect(codes({ ...c, extra: 1 })).toContain("MOTION_CONFIG_UNKNOWN_KEY");
    expect(codes({ ...c, v: 2 })).toContain("MOTION_CONFIG_VERSION_UNSUPPORTED");
    expect(codes({ ...c, experiment: "pendulum" })).toContain("MOTION_EXPERIMENT_UNKNOWN");
    expect(codes({ ...c, controls: [{ param: "gravity2", min: 1, max: 2, step: 0.1 }] })).toContain("MOTION_CONTROLS_INVALID");
    expect(codes({ ...c, controls: [{ param: "initialSpeed", min: 30, max: 40, step: 1 }] })).toContain("MOTION_CONTROL_EXCLUDES_AUTHORED");
    expect(codes({ ...c, controls: [{ param: "initialSpeed", min: 5, max: 4000, step: 1 }] })).toContain("MOTION_CONTROL_LIMITS_INVALID");
    expect(codes({ ...c, controls: [{ param: "initialSpeed", min: 5, max: 40, step: 0 }] })).toContain("MOTION_CONTROL_LIMITS_INVALID");
    expect(codes({ ...c, view: { ...c.view, maxTime: 1 } })).toContain("MOTION_VIEW_TOO_SHORT");
    expect(codes({ ...c, view: { ...c.view, graphs: ["acceleration"] } })).toContain("MOTION_VIEW_INVALID");
    expect(codes({ ...c, tasks: { measurements: [], points: [] } })).toContain("MOTION_TASKS_EMPTY");
    expect(codes({ ...c, tasks: { measurements: [{ id: "a", label: "x", unit: "km" }], points: [] } })).toContain("MOTION_TASK_INVALID");
  });
  it("student exploration: only permitted controls, inside the teacher's limits, physically valid", () => {
    const c = MOTION_PRESETS.newton2().config as MotionConfigV1;
    expect(motionExplorationProblem(c, { ...c.params, mass: 5 })).toBeUndefined();
    expect(motionExplorationProblem(c, { ...c.params, mass: 50 })).toMatch(/بين/);
    expect(motionExplorationProblem(c, { ...c.params, gravity: 5 })).toMatch(/غير قابل/);
    expect(motionExplorationProblem(c, { ...c.params, muKinetic: 0.5 })).toMatch(/الحركي/);
  });
});

describe("21D-A.1 SmartSim integration and JSON lifecycle (real authority)", () => {
  const env = (config: unknown) => ({ schemaVersion: 1, pluginKey: "physicsMotion", pluginVersion: 1, config });
  const question = (k: MotionKind) => { const p = MOTION_PRESETS[k](); return { examQuestionId: "q-" + k, presentationType: "smartSim", questionTypeVersion: 1, text: "تجربة", marks: 10, smartSim: env(p.config), answer: { scoring: "proportional", checks: p.checks } }; };
  const set = (measurementId: string, value: number) => ({ type: "measurement.set", measurementId, value });
  const point = (pointId: string, x: number, y: number) => ({ type: "graphPoint.set", pointId, x, y });
  const grade = (q: ReturnType<typeof question>, actions: unknown[]) => evaluateSmartSim({ envelope: q.smartSim, answerKey: q.answer, response: { kind: "smartSim", pluginKey: "physicsMotion", pluginVersion: 1, actions, state: {} }, maxMarks: q.marks });
  const PERFECT: Record<MotionKind, unknown[]> = {
    freeFall: [set("impactTime", 3.03), set("impactSpeed", 29.7), point("impactPoint", 3.03, 0)],
    projectile: [set("range", 40.8), set("maxHeight", 10.2), set("flightTime", 2.886), point("landingPoint", 40.8, 0)],
    newton2: [set("acceleration", 3.04), set("kineticFriction", 3.92), set("finalVelocity", 12.16), point("pointAt2s", 2, 6.08)],
    incline: [set("acceleration", 3.2), set("normalForce", 42.44), set("timeToBottom", 2.5), set("speedAtBottom", 8.0)]
  };
  it("physicsMotion@1 is registered with its descriptor (generic rules opted in) next to the frozen physicsFreeFall@1", () => {
    expect(resolveSmartSimPlugin("physicsMotion", 1)?.key).toBe("physicsMotion");
    expect(resolveSmartSimDescriptor("physicsMotion", 1)?.genericRules).toEqual(["numericNear@1", "pointNear@1"]);
    expect(resolveSmartSimPlugin("physicsFreeFall", 1)?.key).toBe("physicsFreeFall");
    expect(resolveSmartSimPlugin("physicsMotion", 2)).toBeUndefined();
  });
  for (const k of MOTION_KINDS) it(k + ": the question validates, the student projection carries no private data, correct answers score full marks", () => {
    const q = question(k);
    expect(validateSmartSimQuestion(q)).toEqual([]);
    const p = projectSmartSimForStudent(q.smartSim);
    expect(p).toEqual(q.smartSim);
    expect(JSON.stringify(p)).not.toMatch(/tolerance|weight|referenceValue|pointNear|numericNear|"expected"|quantity/);
    expect(grade(q, PERFECT[k])).toMatchObject({ valid: true, score: 10, correct: true });
    expect(grade(q, [])).toMatchObject({ score: 0, correct: false });
    const wrong = PERFECT[k].map(a => ((a as { type: string }).type === "measurement.set" ? { ...(a as object), value: ((a as { value: number }).value) * 1.5 } : a));
    expect(grade(q, wrong).score).toBeLessThan(10);
    const roundTrip = JSON.parse(JSON.stringify(q));
    expect(validateSmartSimQuestion(roundTrip)).toEqual([]);
    expect(grade(roundTrip, PERFECT[k])).toEqual(grade(q, PERFECT[k]));
  });
  it("checks: unit mismatch, unknown quantity and a quantity undefined for the authored run are refused; actions are strictly normalized", () => {
    const q = question("incline"), codes = (checks: unknown[]) => validateSmartSimQuestion({ ...q, answer: { scoring: "proportional", checks } }).map(i => i.code);
    const base = { id: "c", label: "فحص", weight: 1, kind: "motion.referenceValue", measurementId: "acceleration", tolerance: 0.1 };
    expect(codes([{ ...base, quantity: "normalForce" }])).toContain("MOTION_CHECK_INVALID");
    expect(codes([{ ...base, quantity: "range" }])).toContain("MOTION_CHECK_INVALID");
    const resting = { ...q, smartSim: env({ ...MOTION_PRESETS.incline().config, params: { ...MOTION_PRESETS.incline().config.params, angle: 10 }, controls: [] }) };
    expect(validateSmartSimQuestion({ ...resting, answer: { scoring: "proportional", checks: [{ ...base, measurementId: "timeToBottom", quantity: "timeToBottom" }] } }).map(i => i.code)).toContain("MOTION_CHECK_INVALID");
    const c = MOTION_PRESETS.newton2().config;
    expect(replayMotion(c, [{ type: "measurement.set", measurementId: "nope", value: 1 }])).toEqual({ ok: false, code: "MOTION_ACTION_INVALID" });
    expect(replayMotion(c, [{ type: "graphPoint.set", pointId: "pointAt2s", x: 99, y: 1 }])).toEqual({ ok: false, code: "MOTION_ACTION_INVALID" });   // t beyond the duration
    expect(replayMotion(c, [{ type: "simulation.play" }])).toEqual({ ok: false, code: "MOTION_ACTION_INVALID" });
    expect(replayMotion(c, [{ type: "params.set", param: "mass", value: 3 }])).toEqual({ ok: false, code: "MOTION_ACTION_INVALID" });   // exploration is never an action
    const r = replayMotion(c, [set("acceleration", 3), set("acceleration", 3.04), point("pointAt2s", 2, 6)]);
    expect(r).toEqual({ ok: true, actions: expect.any(Array), state: { v: 1, measurements: { acceleration: 3.04 }, points: { pointAt2s: { x: 2, y: 6 } } } });
  });
});
