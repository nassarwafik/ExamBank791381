import { describe, expect, it } from "vitest";
import {
  LAB_KINDS, LAB_PARAM_SPEC, circuitNetlist, ellipticK, labEndTime, labFrame, labParamsProblem, labQuantities, labSamples, solveCircuit, validateLabParams,
  type LabFrame, type LabKind, type LabModel, type LabParams
} from "./physics/labCore";
import { motionQuantities } from "./physics/motionCore";
import { labExplorationProblem, validateLabConfig, type LabConfigV1 } from "./physicsLabModel";
import { replayLab } from "./physicsLabPlugin";
import { LAB_PRESETS } from "./physicsLab/labTemplates";
import { evaluateSmartSim, projectSmartSimForStudent, resolveSmartSimDescriptor, resolveSmartSimPlugin, validateSmartSimQuestion } from "./trustedSimPlugins";

// Phase 21D-A.2 — the advanced physics core and physicsLab@1: hand-computed certification values, analytical references (exact elliptic
// pendulum period, closed-form oscillators, free fall), independent numerical integrations, energy balance, Kirchhoff's laws, robustness
// over the whole parameter space, strict validation and the JSON lifecycle through the real SmartSim authority.
const close = (a: number | null | undefined, b: number, tol: number, tag = "") => { expect(typeof a, tag).toBe("number"); expect(Math.abs((a as number) - b), tag + " |" + a + " − " + b + "|").toBeLessThanOrEqual(tol); };
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const model = (kind: LabKind, params: LabParams): LabModel => ({ kind, params });
function randomParams(kind: LabKind, r: () => number): LabParams {
  for (;;) {
    const p: LabParams = {};
    for (const s of LAB_PARAM_SPEC[kind]) { const v = s.min + (s.max - s.min) * (r() < 0.1 ? Math.round(r()) : r()); p[s.key] = s.integer ? Math.round(v) : v; }
    if (!labParamsProblem(kind, p)) return p;
  }
}
/** Classical RK4 of a 1-D second-order ODE x'' = f(x, v) — an independent reference integrator. */
function rk4(f: (x: number, v: number) => number, x0: number, v0: number, T: number, n: number): { x: number; v: number } {
  let x = x0, v = v0; const h = T / n;
  for (let i = 0; i < n; i++) {
    const k1x = v, k1v = f(x, v), k2x = v + h / 2 * k1v, k2v = f(x + h / 2 * k1x, v + h / 2 * k1v), k3x = v + h / 2 * k2v, k3v = f(x + h / 2 * k2x, v + h / 2 * k2v), k4x = v + h * k3v, k4v = f(x + h * k3x, v + h * k3v);
    x += h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); v += h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
  }
  return { x, v };
}
const sumForces = (f: LabFrame) => f.forces.filter(x => x.id !== "net" && x.id !== "restoring").reduce((s, x) => ({ x: s.x + x.vector.x, y: s.y + x.vector.y }), { x: 0, y: 0 });

describe("SIM-05 simple pendulum", () => {
  const P = { length: 1, initialAngle: 10, damping: 0, mass: 0.5, gravity: 9.8 };
  it("certification (L = 1 m, θ₀ = 10°): T₀ = 2.00709 s, finite-angle T = 2.01092 s, measured ≈ T, v_max = 0.545681 m/s, E₀ = 0.0744420 J", () => {
    const q = labQuantities(model("pendulum", P), 10);
    close(q.smallAnglePeriod, 2.00709, 1e-5); close(q.finiteAnglePeriod, 2.01092, 1e-5); close(q.measuredPeriod, q.finiteAnglePeriod!, 1e-6);
    close(q.maxSpeed, Math.sqrt(2 * 9.8 * (1 - Math.cos(Math.PI / 18))), 1e-7); close(q.maxSpeed, 0.545681, 1e-6); close(q.initialEnergy, 0.0744420, 1e-7);
    close(q.angularFrequency, Math.sqrt(9.8), 1e-12); expect(q.dampedSmallAnglePeriod).toBeCloseTo(q.smallAnglePeriod!, 12);
  });
  // ratios 2K(k)/π computed independently by Simpson quadrature of the period integral (200 000 panels), not by the AGM used in the core
  it("finite amplitude: the measured period matches the EXACT elliptic period 4K(sin θ₀/2)√(L/g) and departs from the small-angle law", () => {
    for (const [th, ratio] of [[2, 1.0000762], [30, 1.0174088], [60, 1.0731820], [90, 1.1803406], [150, 1.7622037], [170, 2.4393627]] as const) {
      const q = labQuantities(model("pendulum", { ...P, initialAngle: th }), 30);
      close(q.measuredPeriod! / q.finiteAnglePeriod!, 1, 2e-6, "θ₀ = " + th);
      close(q.finiteAnglePeriod! / q.smallAnglePeriod!, ratio, 1e-5, "ratio θ₀ = " + th);
    }
    close(ellipticK(0), Math.PI / 2, 1e-15); close(ellipticK(Math.SQRT1_2), 1.8540746773013719, 1e-13);
  });
  it("undamped: mechanical energy is conserved over 10 periods; damped: energy never increases and the dissipated energy accounts for the loss", () => {
    const m = model("pendulum", { ...P, initialAngle: 60 }), end = labEndTime(m, 20), E0 = labFrame(m, 0, end).energy!.total;
    for (const f of labSamples(m, end, 400)) close(f.energy!.total, E0, 1e-6 * E0);
    const d = model("pendulum", { ...P, initialAngle: 60, damping: 0.4 }), endD = labEndTime(d, 20);
    let prev = Infinity;
    for (const f of labSamples(d, endD, 400)) { expect(f.energy!.total).toBeLessThanOrEqual(prev + 1e-12); prev = f.energy!.total; close(f.energy!.total + f.energy!.dissipated, E0, 1e-9 * E0); }
  });
  it("damping: small-amplitude period ≈ 2π/√(ω₀² − γ²/4); over-damped motion has no period (null), never a fabricated one", () => {
    const q = labQuantities(model("pendulum", { ...P, initialAngle: 2, damping: 1.5 }), 30);
    close(q.measuredPeriod! / q.dampedSmallAnglePeriod!, 1, 5e-4);
    const over = labQuantities(model("pendulum", { length: 20, initialAngle: 20, damping: 1, mass: 1, gravity: 1 }), 120);
    expect(over.dampedSmallAnglePeriod).toBeNull(); expect(over.measuredPeriod).toBeNull();
    const short = labQuantities(model("pendulum", P), 1.5);                                                    // maxTime shorter than a period
    expect(short.measuredPeriod).toBeNull();
  });
  it("the frame is the RK4 table: matches an independent fine RK4 at t = 7.3 s; forces satisfy ΣF = m·a (tension, weight, damping)", () => {
    const p = { ...P, initialAngle: 75, damping: 0.3 }, m = model("pendulum", p), end = labEndTime(m, 10), f = labFrame(m, 7.3, end);
    const ref = rk4((x, v) => -0.3 * v - 9.8 * Math.sin(x), (75 * Math.PI) / 180, 0, 7.3, 200000);
    close((f.q * Math.PI) / 180, ref.x, 1e-6); close(f.rate, ref.v, 1e-6);
    for (const g of labSamples(m, end, 120)) {
      const s = sumForces(g), net = g.forces.find(x => x.id === "net")!.vector;
      close(s.x, net.x, 1e-9 * p.mass * 30); close(s.y, net.y, 1e-9 * p.mass * 30);
    }
  });
});

describe("SIM-06 Hooke's law and spring", () => {
  const P = { springConstant: 20, mass: 0.5, initialDisplacement: 0.1, damping: 0, gravity: 9.8 };
  it("certification: T = 0.993459 s, ω₀ = 6.32456 rad/s, Δ = 0.245 m, F = 2 N, v_eq = 0.632456 m/s, ½kx₀² = 0.1 J; x(t) = x₀·cos ω₀t exactly", () => {
    const m = model("spring", P), q = labQuantities(m, 5);
    close(q.period, 0.993459, 1e-6); close(q.angularFrequency, 6.32456, 1e-5); close(q.equilibriumExtension, 0.245, 1e-12); close(q.restoringForceAtRelease, 2, 1e-12);
    close(q.speedAtEquilibrium, 0.632456, 1e-6); close(q.initialEnergy, 0.1, 1e-12); expect(q.dampedPeriod).toBeCloseTo(q.period!, 12);
    for (const t of [0, 0.1, 0.2484, 1.7, 4.9]) { const f = labFrame(m, t, 5); close(f.q, 0.1 * Math.cos(Math.sqrt(40) * t), 1e-12); close(f.energy!.total, 0.1, 1e-12); }
  });
  it("the three damping regimes agree with an independent RK4 of m·x'' = −k·x − c·x' (including within 1e-9 of critical damping)", () => {
    const crit = 2 * Math.sqrt(20 * 0.5);
    for (const c of [0.5, crit * (1 - 1e-9), crit, crit * (1 + 1e-9), 12, 300]) {
      const m = model("spring", { ...P, damping: c });
      for (const t of [0.3, 1.1, 2.7]) {
        const f = labFrame(m, t, 5), ref = rk4((x, v) => (-20 * x - c * v) / 0.5, 0.1, 0, t, 40000);
        close(f.q, ref.x, 2e-9 + 1e-7 * Math.abs(ref.x), "c=" + c + " t=" + t); close(f.rate, ref.v, 1e-7 + 1e-7 * Math.abs(ref.v), "v c=" + c + " t=" + t);
      }
    }
    const qOver = labQuantities(model("spring", { ...P, damping: 12 }), 5);
    expect(qOver.dampedPeriod).toBeNull(); expect(qOver.speedAtEquilibrium).toBeNull();                         // over-damped: never crosses
  });
  it("Hooke's law in every frame: spring force = k·(Δ + x); ΣF = m·a; at equilibrium the net force vanishes; energy only decreases with damping", () => {
    const m = model("spring", { ...P, damping: 0.4 }), end = labEndTime(m, 5);
    let prev = Infinity;
    for (const f of labSamples(m, end, 300)) {
      const spring = f.forces.find(x => x.id === "spring")!.vector.y, net = f.forces.find(x => x.id === "net")!.vector.y;
      close(spring, 20 * (0.245 + f.q), 1e-12); close(sumForces(f).y, net, 1e-12); close(net, -0.5 * f.accel, 1e-12);
      expect(f.energy!.total).toBeLessThanOrEqual(prev + 1e-15); prev = f.energy!.total;
    }
    const eq = model("spring", { ...P, initialDisplacement: 1e-9 }), f0 = labFrame(eq, 0, 5);
    close(f0.forces.find(x => x.id === "net")!.vector.y, 20 * 1e-9, 1e-15);                                    // net (upward) = +k·x for x below: zero at x = 0
  });
});

describe("SIM-07 mechanical energy", () => {
  const P = { mass: 2, initialHeight: 20, initialVelocity: 10, drag: 0, gravity: 9.8 };
  it("certification: E₀ = 492 J, H = 25.1020 m, t = 3.28378 s, KE(impact) = 492 J, nothing dissipated; E conserved in every frame", () => {
    const m = model("energy", P), q = labQuantities(m, 5);
    close(q.initialEnergy, 492, 1e-9); close(q.maxHeight, 25.1020, 1e-4); close(q.impactTime, 3.28378, 1e-5); close(q.impactKineticEnergy, 492, 1e-9); close(q.energyDissipated, 0, 1e-9);
    for (const f of labSamples(m, labEndTime(m, 5), 200)) { close(f.energy!.total, 492, 1e-9); expect(f.energy!.dissipated).toBeLessThanOrEqual(1e-9); }
  });
  it("without drag the experiment is exactly free fall (physicsMotion@1 core) over 200 random launches", () => {
    const r = rng(7);
    for (let i = 0; i < 200; i++) {
      const p: LabParams = { ...randomParams("energy", r), drag: 0 }, q = labQuantities(model("energy", p), 600);
      const ff = motionQuantities({ kind: "freeFall", params: { initialHeight: p.initialHeight, initialVelocity: p.initialVelocity, gravity: p.gravity } }, 600);
      close(q.impactTime, ff.impactTime!, 1e-9 * Math.max(1, ff.impactTime!)); close(q.impactSpeed, ff.impactSpeed!, 1e-9 * Math.max(1, ff.impactSpeed!)); close(q.maxHeight, ff.peakHeight!, 1e-8 * Math.max(1, ff.peakHeight!));
    }
  });
  it("with drag: E(t) + W_drag(t) = E₀ where W_drag = ∫b·v² dt is integrated INDEPENDENTLY (Simpson); E strictly decreases while moving", () => {
    for (const drag of [0.05, 0.5, 3]) {
      const p = { ...P, drag }, m = model("energy", p), end = labEndTime(m, 60), E0 = 492;
      for (const t of [end * 0.25, end * 0.6, end]) {
        const n = 4000, h = t / n; let s = 0;
        for (let i = 0; i <= n; i++) { const v = labFrame(m, i * h, end).rate, w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2; s += w * drag * v * v; }
        const W = (s * h) / 3, f = labFrame(m, t, end);
        close(f.energy!.total + W, E0, 1e-6 * E0, "drag=" + drag + " t=" + t); close(f.energy!.dissipated, W, 1e-6 * E0);
      }
      let prev = Infinity;
      for (const f of labSamples(m, end, 200)) { expect(f.energy!.total).toBeLessThan(prev + 1e-9); prev = f.energy!.total; }
      expect(labQuantities(m, 60).energyDissipated!).toBeGreaterThan(0);
    }
    const tiny = labQuantities(model("energy", { ...P, drag: 1e-9 }), 5), none = labQuantities(model("energy", P), 5);
    for (const k of ["impactTime", "impactSpeed", "maxHeight", "impactKineticEnergy"]) close(tiny[k], none[k]!, 1e-5 * Math.abs(none[k]!), k);
    const fall = model("energy", { mass: 1, initialHeight: 1000, initialVelocity: 0, drag: 2, gravity: 9.8 }), end = labEndTime(fall, 600);
    close(labFrame(fall, end, end).rate, -9.8 / 2, 1e-6);                                                     // terminal velocity −mg/b
  });
});

describe("SIM-08 DC circuits", () => {
  const P = { voltage: 12, r1: 2, r2: 6, r3: 3, topology: 3 };
  it("certification R1 + (R2 ∥ R3): R_eq = 4 Ω, I = 3 A, V1 = 6 V, V2 = V3 = 6 V, I2 = 1 A, I3 = 2 A, P = 36 W", () => {
    const q = labQuantities(model("circuit", P), 10);
    close(q.equivalentResistance, 4, 1e-12); close(q.totalCurrent, 3, 1e-12); close(q.totalPower, 36, 1e-12);
    close(q.voltage1, 6, 1e-12); close(q.voltage2, 6, 1e-12); close(q.voltage3, 6, 1e-12); close(q.current1, 3, 1e-12); close(q.current2, 1, 1e-12); close(q.current3, 2, 1e-12);
  });
  it("all four topologies agree with the closed-form formulas; Kirchhoff (KCL at every node, KVL around every loop) and power balance hold — 400 random circuits", () => {
    const r = rng(11), par = (...xs: number[]) => 1 / xs.reduce((s, x) => s + 1 / x, 0);
    for (let i = 0; i < 400; i++) {
      // the first 200 circuits span the whole range (0.1 Ω … 1 MΩ: a nearly-shorted node makes nodal elimination lose ~6 of 16 digits, so
      // 1e-9); the next 200 use realistic ratios (0.5 … 1 000 Ω) where the solver is held to 1e-12
      const p = randomParams("circuit", r), tol = i < 200 ? 1e-9 : 1e-12;
      if (i >= 200) for (const k of ["r1", "r2", "r3"]) p[k] = 0.5 + 999.5 * r();
      const { voltage: V, r1, r2, r3 } = p, s = solveCircuit(p), I = s.sourceCurrent;
      const Req = [0, r1 + r2 + r3, par(r1, r2, r3), r1 + par(r2, r3), par(r1 + r2, r3)][p.topology];
      close(s.equivalentResistance / Req, 1, tol, "topology " + p.topology); close(I * Req / V, 1, tol);
      const net = circuitNetlist(p);
      for (let node = 0; node < net.nodes; node++) {                                                          // KCL (the source carries I from node 0 to node 1)
        let into = node === 1 ? I : node === 0 ? -I : 0;
        for (const b of s.branches) { if (b.to === node) into += b.current; if (b.from === node) into -= b.current; }
        expect(Math.abs(into), "KCL node " + node).toBeLessThanOrEqual(tol * Math.max(1, I) + 1e-15);
      }
      for (const b of s.branches) close(b.voltage, s.potentials[b.from] - s.potentials[b.to], 1e-12 * V);  // KVL via one potential per node
      const loopSum = p.topology === 1 ? s.branches.reduce((a, b) => a + b.voltage, 0) : null;              // series loop: V = V1 + V2 + V3
      if (loopSum !== null) close(loopSum / V, 1, tol);
      close(s.branches.reduce((a, b) => a + b.power, 0) / (V * I), 1, tol);                                  // power balance
    }
  });
});

describe("robustness, determinism, validation", () => {
  it("every frame, sample and reference quantity is finite (or explicitly null) over 4 × 150 random parameter sets including the bounds", () => {
    const r = rng(5);
    for (const kind of LAB_KINDS) for (let i = 0; i < 150; i++) {
      const p = randomParams(kind, r), m = model(kind, p), maxTime = 0.5 + 30 * r(), end = labEndTime(m, kind === "energy" ? Math.max(maxTime, labEndTime(m, Infinity)) : maxTime);
      expect(Number.isFinite(end) && end >= 0).toBe(true);
      for (const f of labSamples(m, end, 9)) {
        for (const v of [f.t, f.q, f.rate, f.accel, f.position.x, f.position.y, f.speed]) expect(Number.isFinite(v), kind + " " + JSON.stringify(p)).toBe(true);
        if (f.energy) for (const v of Object.values(f.energy)) expect(Number.isFinite(v)).toBe(true);
        for (const fo of f.forces) expect(Number.isFinite(fo.magnitude)).toBe(true);
      }
      for (const v of Object.values(labQuantities(m, maxTime))) expect(v === null || Number.isFinite(v), kind + " " + JSON.stringify(p)).toBe(true);
    }
  });
  it("time is deterministic: a frame is a pure function of t (forward, backward and a fresh model agree exactly); non-finite t → 0", () => {
    for (const kind of LAB_KINDS) {
      const p = LAB_PRESETS[kind]().config.params, m = model(kind, p), end = labEndTime(m, 5), times = Array.from({ length: 30 }, (_, k) => Math.min(end, k * 0.17));
      const fwd = times.map(t => labFrame(m, t, end)), back = [...times].reverse().map(t => labFrame(m, t, end)).reverse(), fresh = times.map(t => labFrame(model(kind, { ...p }), t, end));
      expect(back).toEqual(fwd); expect(fresh).toEqual(fwd); expect(labFrame(m, NaN, end).t).toBe(0); expect(labFrame(m, 1e9, end).t).toBe(end);
    }
  });
  it("strict validation: non-finite / out of bounds / missing / extra keys / fractional topology / motionless starts are refused, never clamped", () => {
    const ok = LAB_PRESETS.circuit().config.params;
    expect(validateLabParams("circuit", ok)).toEqual(ok);
    for (const bad of [{ ...ok, voltage: NaN }, { ...ok, r1: 0 }, { ...ok, r2: 2e6 }, { ...ok, topology: 2.5 }, { ...ok, topology: 5 }, { ...ok, extra: 1 }, { voltage: 1 }]) expect(validateLabParams("circuit", bad), JSON.stringify(bad)).toBeUndefined();
    expect(labParamsProblem("spring", { ...LAB_PRESETS.spring().config.params, initialDisplacement: 0 })).toMatch(/الاتزان/);
    expect(labParamsProblem("energy", { ...LAB_PRESETS.energy().config.params, initialHeight: 0, initialVelocity: 0 })).toMatch(/لا توجد حركة/);
    expect(labParamsProblem("pendulum", { ...LAB_PRESETS.pendulum().config.params, initialAngle: 175 })).toBeDefined();
  });
  it("config: every preset is valid; unknown keys / experiment / version, bad controls (incl. fractional option steps), short duration, bad tasks → codes", () => {
    for (const k of LAB_KINDS) expect(validateLabConfig(LAB_PRESETS[k]().config).ok, k).toBe(true);
    const base = () => LAB_PRESETS.circuit().config as unknown as Record<string, unknown>, codes = (c: unknown) => { const r = validateLabConfig(c); return r.ok ? [] : r.issues.map(i => i.code); };
    expect(codes({ ...base(), extra: 1 })).toContain("LAB_CONFIG_UNKNOWN_KEY");
    expect(codes({ ...base(), v: 2 })).toContain("LAB_CONFIG_VERSION_UNSUPPORTED");
    expect(codes({ ...base(), experiment: "optics" })).toContain("LAB_EXPERIMENT_UNKNOWN");
    expect(codes({ ...base(), controls: [{ param: "topology", min: 1, max: 4, step: 0.5 }] })).toContain("LAB_CONTROL_LIMITS_INVALID");
    expect(codes({ ...base(), controls: [{ param: "voltage", min: 20, max: 24, step: 1 }] })).toContain("LAB_CONTROL_EXCLUDES_AUTHORED");
    expect(codes({ ...base(), view: { maxTime: 121, graphs: [], showVectors: true } })).toContain("LAB_VIEW_INVALID");
    expect(codes({ ...base(), tasks: { measurements: [], points: [] } })).toContain("LAB_TASKS_EMPTY");
    const e = LAB_PRESETS.energy().config;
    expect(codes({ ...e, view: { ...e.view, maxTime: 3 } })).toContain("LAB_VIEW_TOO_SHORT");                  // lands at 3.28 s
  });
  it("exploration: only permitted controls, inside the teacher's limits, physically valid", () => {
    const c = LAB_PRESETS.circuit().config as LabConfigV1;
    expect(labExplorationProblem(c, { ...c.params, topology: 1 })).toBeUndefined();
    expect(labExplorationProblem(c, { ...c.params, r1: 30 })).toMatch(/بين 1 و20/);
    const s = LAB_PRESETS.spring().config as LabConfigV1;
    expect(labExplorationProblem(s, { ...s.params, gravity: 1.6 })).toMatch(/غير قابل للتعديل/);
  });
});

describe("SmartSim integration (real authority)", () => {
  const question = (kind: LabKind) => {
    const p = LAB_PRESETS[kind]();
    return { examQuestionId: "q1", presentationType: "smartSim", questionTypeVersion: 1, text: "تجربة", marks: 10, smartSim: { schemaVersion: 1, pluginKey: "physicsLab", pluginVersion: 1, config: p.config }, answer: { scoring: "proportional", checks: p.checks } };
  };
  const PERFECT: Record<LabKind, unknown[]> = {
    pendulum: [{ type: "measurement.set", measurementId: "period", value: 2.011 }, { type: "measurement.set", measurementId: "smallAnglePeriod", value: 2.007 }, { type: "measurement.set", measurementId: "maxSpeed", value: 0.546 }],
    spring: [{ type: "measurement.set", measurementId: "period", value: 0.9935 }, { type: "measurement.set", measurementId: "equilibrium", value: 0.245 }, { type: "measurement.set", measurementId: "restoringForce", value: 2 }, { type: "graphPoint.set", pointId: "firstEquilibrium", x: 0.25, y: 0 }],
    energy: [{ type: "measurement.set", measurementId: "initialEnergy", value: 492 }, { type: "measurement.set", measurementId: "maxHeight", value: 25.1 }, { type: "measurement.set", measurementId: "impactKineticEnergy", value: 492 }],
    circuit: [{ type: "measurement.set", measurementId: "equivalentResistance", value: 4 }, { type: "measurement.set", measurementId: "totalCurrent", value: 3 }, { type: "measurement.set", measurementId: "current2", value: 1 }, { type: "measurement.set", measurementId: "voltage1", value: 6 }, { type: "graphPoint.set", pointId: "iv6", x: 6, y: 1.5 }]
  };
  it("physicsLab@1 is registered with its descriptor next to the frozen physicsFreeFall@1 / physicsMotion@1; no other identity resolves", () => {
    expect(resolveSmartSimPlugin("physicsLab", 1)?.key).toBe("physicsLab");
    expect(resolveSmartSimPlugin("physicsLab", 2)).toBeUndefined();
    expect(resolveSmartSimDescriptor("physicsLab", 1)).toMatchObject({ domain: "physics", checkKinds: ["lab.referenceValue"], genericRules: ["numericNear@1", "pointNear@1"] });
    expect(resolveSmartSimPlugin("physicsMotion", 1)?.key).toBe("physicsMotion"); expect(resolveSmartSimPlugin("physicsFreeFall", 1)?.key).toBe("physicsFreeFall");
  });
  it.each(LAB_KINDS)("%s: validates, projects without checks, grades a perfect answer 10 / 10 and an empty one 0 by server replay", kind => {
    const q = question(kind);
    expect(validateSmartSimQuestion(q as never)).toEqual([]);
    const pub = projectSmartSimForStudent(q.smartSim as never);
    expect(pub).toEqual(q.smartSim);
    expect(JSON.stringify(pub)).not.toMatch(/lab\.referenceValue|tolerance|pointNear|"expected"|quantity|weight/);
    const answerKey = q.answer as never, envelope = q.smartSim as never;
    expect(evaluateSmartSim({ envelope, answerKey, response: { kind: "smartSim", pluginKey: "physicsLab", pluginVersion: 1, actions: PERFECT[kind], state: {} }, maxMarks: 10 }).score).toBe(10);
    expect(evaluateSmartSim({ envelope, answerKey, response: { kind: "smartSim", pluginKey: "physicsLab", pluginVersion: 1, actions: [], state: {} }, maxMarks: 10 }).score).toBe(0);
  });
  it("checks: a unit mismatch, an unknown quantity, or a quantity undefined for the authored run (no full period in maxTime; over-damped) is refused", () => {
    const issues = (kind: LabKind, config: unknown, checks: unknown[]) => validateSmartSimQuestion({ ...question(kind), smartSim: { schemaVersion: 1, pluginKey: "physicsLab", pluginVersion: 1, config }, answer: { scoring: "proportional", checks } } as never);
    const pend = LAB_PRESETS.pendulum().config;
    expect(issues("pendulum", pend, [{ id: "a", label: "a", weight: 1, kind: "lab.referenceValue", measurementId: "period", quantity: "maxSpeed", tolerance: 0.1 }]).length).toBeGreaterThan(0);
    expect(issues("pendulum", pend, [{ id: "a", label: "a", weight: 1, kind: "lab.referenceValue", measurementId: "period", quantity: "voltage1", tolerance: 0.1 }]).length).toBeGreaterThan(0);
    expect(issues("pendulum", { ...pend, view: { ...pend.view, maxTime: 1.5 } }, [{ id: "a", label: "a", weight: 1, kind: "lab.referenceValue", measurementId: "period", quantity: "measuredPeriod", tolerance: 0.1 }]).length).toBeGreaterThan(0);
    const spr = LAB_PRESETS.spring().config;
    expect(issues("spring", { ...spr, params: { ...spr.params, damping: 40 }, controls: [] }, [{ id: "a", label: "a", weight: 1, kind: "lab.referenceValue", measurementId: "period", quantity: "dampedPeriod", tolerance: 0.1 }]).length).toBeGreaterThan(0);
  });
  it("actions are strictly normalized: forged kinds, unknown ids, strings, out-of-range points are refused with LAB_ACTION_INVALID", () => {
    const c = LAB_PRESETS.spring().config;
    expect(replayLab(c, PERFECT.spring).ok).toBe(true);
    for (const bad of [{ type: "score.set", value: 1 }, { type: "measurement.set", measurementId: "nope", value: 1 }, { type: "measurement.set", measurementId: "period", value: "1" },
      { type: "graphPoint.set", pointId: "firstEquilibrium", x: 99, y: 0 }, { type: "measurement.set", measurementId: "period", value: 1, extra: 1 }])
      expect(replayLab(c, [bad]), JSON.stringify(bad)).toEqual({ ok: false, code: "LAB_ACTION_INVALID" });
    expect(replayLab(c, new Array(501).fill({ type: "measurement.clear", measurementId: "period" }))).toEqual({ ok: false, code: "LAB_ACTIONS_TOO_MANY" });
  });
});
