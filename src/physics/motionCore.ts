// Phase 21D-A.1 — the shared PHYSICS CORE for motion experiments (pure; compiled into the shared server build).
//
// SI units throughout (s, m, m/s, m/s², N, kg; angles are authored in degrees). Every quantity is a CLOSED-FORM function of the simulation
// time t — nothing is integrated frame by frame — so a frame is exactly reproducible for any clock (play, pause, step, seek, rate) and no
// numerical error accumulates. Inputs are validated against declared bounds and cross-constraints; anything invalid is REFUSED, never
// clamped. No clock, no randomness, no DOM. Presentation code and the trusted plugin both read this module.
//
// Models and assumptions (documented in docs/phase21d-a1-physics-core-motion.md):
//   freeFall   — 1-D vertical motion, +y up, ground at y = 0, constant g, no air resistance.
//                y(t) = h0 + v0·t − ½·g·t²,  v(t) = v0 − g·t;  impact time = positive root of y(t) = 0 (cancellation-free form).
//   projectile — 2-D motion, launch at (0, h0) with speed v0 at angle α above the horizontal; constant g, no air resistance.
//                x = v0·cosα·t,  y = h0 + v0·sinα·t − ½·g·t²;  flight ends at y = 0.
//   newton2    — a block on a horizontal floor, horizontal applied force F (signed, +x), optional Coulomb friction (μs ≥ μk);
//                N = m·g, static friction holds while |F| ≤ μs·N at rest, kinetic friction μk·N opposes the velocity.
//   incline    — a block released at the top of a fixed incline of length L and angle θ, initial speed v0 ≥ 0 down the slope; the drive
//                is m·g·sinθ, N = m·g·cosθ, same Coulomb friction model; the run ends at the bottom (s = L).
//   newton2 and incline share ONE exact piecewise solver (frictionPhases): at most three constant-acceleration phases (slide against the
//   initial velocity → stop → rest or slide with the drive). Static friction holds at the exact threshold |drive| = μs·N.

export const MOTION_KINDS = Object.freeze(["freeFall", "projectile", "newton2", "incline"] as const);
export type MotionKind = (typeof MOTION_KINDS)[number];
export type MotionUnit = "s" | "m" | "m/s" | "m/s²" | "N" | "kg" | "deg" | "1";
export type MotionParamSpec = { key: string; unit: MotionUnit; min: number; max: number; label: string };
export type Vec = { x: number; y: number };

const params = (...s: MotionParamSpec[]): readonly MotionParamSpec[] => Object.freeze(s);
const G: MotionParamSpec = { key: "gravity", unit: "m/s²", min: 0.1, max: 100, label: "تسارع الجاذبية g" };
const MU_S: MotionParamSpec = { key: "muStatic", unit: "1", min: 0, max: 2, label: "معامل الاحتكاك السكوني μs" };
const MU_K: MotionParamSpec = { key: "muKinetic", unit: "1", min: 0, max: 2, label: "معامل الاحتكاك الحركي μk" };
export const MOTION_PARAM_SPEC: Readonly<Record<MotionKind, readonly MotionParamSpec[]>> = Object.freeze({
  freeFall: params(
    { key: "initialHeight", unit: "m", min: 0, max: 10000, label: "الارتفاع الابتدائي h₀" },
    { key: "initialVelocity", unit: "m/s", min: -1000, max: 1000, label: "السرعة الابتدائية v₀ (الأعلى موجب)" }, G),
  projectile: params(
    { key: "initialSpeed", unit: "m/s", min: 0, max: 1000, label: "سرعة الإطلاق v₀" },
    { key: "launchAngle", unit: "deg", min: -89, max: 90, label: "زاوية الإطلاق α (فوق الأفق)" },
    { key: "launchHeight", unit: "m", min: 0, max: 10000, label: "ارتفاع الإطلاق h₀" }, G),
  newton2: params(
    { key: "mass", unit: "kg", min: 0.01, max: 10000, label: "الكتلة m" },
    { key: "appliedForce", unit: "N", min: -100000, max: 100000, label: "القوة المؤثرة F (موجبة نحو اليمين)" },
    { key: "initialVelocity", unit: "m/s", min: -1000, max: 1000, label: "السرعة الابتدائية v₀" }, MU_S, MU_K, G),
  incline: params(
    { key: "angle", unit: "deg", min: 0, max: 80, label: "زاوية الميل θ" },
    { key: "mass", unit: "kg", min: 0.01, max: 10000, label: "الكتلة m" },
    { key: "length", unit: "m", min: 0.1, max: 10000, label: "طول المستوى L" },
    { key: "initialVelocity", unit: "m/s", min: 0, max: 1000, label: "السرعة الابتدائية v₀ (نحو أسفل المنحدر)" }, MU_S, MU_K, G)
});
export type MotionParams = Record<string, number>;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const isMotionKind = (v: unknown): v is MotionKind => typeof v === "string" && (MOTION_KINDS as readonly string[]).includes(v);
export const motionParamKeys = (kind: MotionKind): string[] => MOTION_PARAM_SPEC[kind].map(p => p.key);

/** Why a parameter set is refused (Arabic, for teachers and students), or undefined when it is valid. */
export function motionParamsProblem(kind: MotionKind, raw: unknown): string | undefined {
  if (!isObj(raw)) return "القيم الفيزيائية مفقودة.";
  const spec = MOTION_PARAM_SPEC[kind];
  if (Object.keys(raw).length !== spec.length || !spec.every(s => Object.prototype.hasOwnProperty.call(raw, s.key))) return "القيم الفيزيائية لا تطابق التجربة.";
  for (const s of spec) {
    const v = raw[s.key];
    if (!finite(v) || v < s.min || v > s.max) return s.label + " يجب أن يكون عددًا بين " + s.min + " و" + s.max + ".";
  }
  const p = raw as MotionParams;
  if ((kind === "newton2" || kind === "incline") && p.muKinetic > p.muStatic) return "معامل الاحتكاك الحركي يجب ألا يتجاوز معامل الاحتكاك السكوني.";
  if (kind === "freeFall" && p.initialHeight === 0 && p.initialVelocity <= 0) return "الجسم على الأرض ولم يُقذف إلى الأعلى: لا توجد حركة.";
  if (kind === "projectile" && p.launchHeight === 0 && (p.initialSpeed === 0 || p.launchAngle <= 0)) return "عند الإطلاق من الأرض يجب أن تكون السرعة موجبة والزاوية فوق الأفق.";
  return undefined;
}
/** The canonical parameter object (fixed key order) or undefined. */
export function validateMotionParams(kind: MotionKind, raw: unknown): MotionParams | undefined {
  if (motionParamsProblem(kind, raw)) return undefined;
  const out: MotionParams = {};
  for (const k of motionParamKeys(kind)) out[k] = (raw as MotionParams)[k];
  return out;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
/** sin / cos of an authored angle, exact at 0° and ±90° (no 6e-17 residue in displayed values). */
const sinDeg = (d: number) => (d === 90 ? 1 : d === -90 ? -1 : d === 0 ? 0 : Math.sin(rad(d)));
const cosDeg = (d: number) => (d === 90 || d === -90 ? 0 : d === 0 ? 1 : Math.cos(rad(d)));

// ── vertical / ballistic flight ────────────────────────────────────────────────────────────────────────────────────────────────────
/** Positive root of h0 + vy·t − ½g·t² = 0 (cancellation-free for vy ≤ 0). */
export function landingTime(h0: number, vy: number, g: number): number {
  const root = Math.sqrt(vy * vy + 2 * g * h0);
  return vy > 0 ? (vy + root) / g : (2 * h0) / (root - vy || 1);
}

// ── the shared friction solver ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type FrictionPhase = { t0: number; x0: number; v0: number; a: number; rest: boolean };
export type FrictionInput = { drive: number; normal: number; mass: number; muStatic: number; muKinetic: number; v0: number };
const sgn = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
/** Exact piecewise motion along one axis under a constant drive with Coulomb friction (≤ 3 constant-acceleration phases). */
export function frictionPhases(i: FrictionInput): FrictionPhase[] {
  const fs = i.muStatic * i.normal, fk = i.muKinetic * i.normal;
  const out: FrictionPhase[] = [];
  let t = 0, x = 0;
  if (i.v0 !== 0) {
    const a = (i.drive - sgn(i.v0) * fk) / i.mass;
    out.push({ t0: 0, x0: 0, v0: i.v0, a, rest: false });
    if (a === 0 || sgn(a) === sgn(i.v0)) return out;           // never stops
    const tStop = -i.v0 / a;
    x = i.v0 * tStop + 0.5 * a * tStop * tStop; t = tStop;
  }
  if (Math.abs(i.drive) <= fs) { out.push({ t0: t, x0: x, v0: 0, a: 0, rest: true }); return out; }
  out.push({ t0: t, x0: x, v0: 0, a: (i.drive - sgn(i.drive) * fk) / i.mass, rest: false });
  return out;
}
/** Position, velocity, acceleration and the active phase at time t ≥ 0. */
export function frictionAt(phases: readonly FrictionPhase[], t: number): { x: number; v: number; a: number; phase: FrictionPhase } {
  let p = phases[0];
  for (const q of phases) if (q.t0 <= t) p = q;
  const tau = Math.max(0, t - p.t0);
  return { x: p.x0 + p.v0 * tau + 0.5 * p.a * tau * tau, v: p.v0 + p.a * tau, a: p.a, phase: p };
}
/** First time the solver's position reaches d > 0 (forward motion), or undefined if it never does. */
export function frictionTimeToReach(phases: readonly FrictionPhase[], d: number): number | undefined {
  for (let k = 0; k < phases.length; k++) {
    const p = phases[k], end = k + 1 < phases.length ? phases[k + 1].t0 : Infinity, rem = d - p.x0;
    if (p.rest) continue;
    if (rem <= 0) return p.t0;
    let tau: number | undefined;
    if (p.a === 0) tau = p.v0 > 0 ? rem / p.v0 : undefined;
    else { const D = p.v0 * p.v0 + 2 * p.a * rem; if (D >= 0 && p.v0 + Math.sqrt(D) > 0) tau = (2 * rem) / (p.v0 + Math.sqrt(D)); }
    if (tau !== undefined && p.t0 + tau <= end) return p.t0 + tau;
  }
  return undefined;
}

// ── frames ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type MotionStatus = "flight" | "landed" | "moving" | "rest" | "bottom" | "timeUp";
export type MotionForce = { id: "weight" | "normal" | "applied" | "friction" | "net" | "gravityParallel" | "gravityPerpendicular"; vector: Vec; magnitude: number; label: string };
export type MotionFrame = {
  t: number; position: Vec; velocity: Vec; acceleration: Vec; speed: number; status: MotionStatus;
  /** 1-D coordinate along the motion (y for free fall, x for newton2, s down the slope for the incline). */
  along?: { s: number; v: number; a: number };
  forces: MotionForce[];
};
export type MotionModel = { kind: MotionKind; params: MotionParams };
type Prepared = { m: MotionModel; natural: number; frame: (t: number) => Omit<MotionFrame, "t" | "speed" | "status"> & { status: MotionStatus } };

/** The simulation's natural end (impact / bottom of the incline), or Infinity when motion never ends by itself. */
export function motionNaturalEnd(m: MotionModel): number { return prepare(m).natural; }
/** The run's duration: the natural end, never longer than the experiment duration `maxTime`. */
export function motionEndTime(m: MotionModel, maxTime: number): number { return Math.min(prepare(m).natural, maxTime); }

const cache = new WeakMap<MotionModel, Prepared>();
function prepare(m: MotionModel): Prepared {
  const hit = cache.get(m);
  if (hit) return hit;
  const p = m.params, g = p.gravity;
  let out: Prepared;
  if (m.kind === "freeFall") {
    const end = landingTime(p.initialHeight, p.initialVelocity, g);
    out = { m, natural: end, frame: t => {
      const y = Math.max(0, p.initialHeight + p.initialVelocity * t - 0.5 * g * t * t), vy = p.initialVelocity - g * t;
      return { position: { x: 0, y: t >= end ? 0 : y }, velocity: { x: 0, y: vy }, acceleration: { x: 0, y: -g }, along: { s: t >= end ? 0 : y, v: vy, a: -g }, forces: [], status: t >= end ? "landed" : "flight" };
    } };
  } else if (m.kind === "projectile") {
    const vx = p.initialSpeed * cosDeg(p.launchAngle), vy0 = p.initialSpeed * sinDeg(p.launchAngle), end = landingTime(p.launchHeight, vy0, g);
    out = { m, natural: end, frame: t => {
      const y = Math.max(0, p.launchHeight + vy0 * t - 0.5 * g * t * t);
      return { position: { x: vx * t, y: t >= end ? 0 : y }, velocity: { x: vx, y: vy0 - g * t }, acceleration: { x: 0, y: -g }, forces: [], status: t >= end ? "landed" : "flight" };
    } };
  } else if (m.kind === "newton2") {
    const N = p.mass * g, phases = frictionPhases({ drive: p.appliedForce, normal: N, mass: p.mass, muStatic: p.muStatic, muKinetic: p.muKinetic, v0: p.initialVelocity });
    out = { m, natural: Infinity, frame: t => {
      const s = frictionAt(phases, t), fr = frictionForce(p.appliedForce, s, p.muKinetic * N);
      return {
        position: { x: s.x, y: 0 }, velocity: { x: s.v, y: 0 }, acceleration: { x: s.a, y: 0 }, along: { s: s.x, v: s.v, a: s.a }, status: s.phase.rest ? "rest" : "moving",
        forces: [
          force("applied", { x: p.appliedForce, y: 0 }, "القوة المؤثرة F"), force("friction", { x: fr, y: 0 }, s.phase.rest ? "الاحتكاك السكوني" : "الاحتكاك الحركي"),
          force("weight", { x: 0, y: -N }, "الوزن mg"), force("normal", { x: 0, y: N }, "القوة العمودية N"), force("net", { x: p.mass * s.a, y: 0 }, "محصلة القوى")
        ]
      };
    } };
  } else {
    const sin = sinDeg(p.angle), cos = cosDeg(p.angle), W = p.mass * g, N = W * cos, drive = W * sin;
    const phases = frictionPhases({ drive, normal: N, mass: p.mass, muStatic: p.muStatic, muKinetic: p.muKinetic, v0: p.initialVelocity });
    const bottom = frictionTimeToReach(phases, p.length) ?? Infinity;
    const d = { x: cos, y: -sin }, n = { x: sin, y: cos };                    // down-slope direction, outward normal (slope falls to the right)
    const along = (k: number) => ({ x: k * d.x, y: k * d.y });
    out = { m, natural: bottom, frame: t => {
      const s = frictionAt(phases, Math.min(t, bottom)), atBottom = t >= bottom, pos = Math.min(s.x, p.length);
      const fr = frictionForce(drive, s, p.muKinetic * N);
      return {
        position: { x: pos * cos, y: (p.length - pos) * sin }, velocity: along(s.v), acceleration: along(atBottom ? 0 : s.a), along: { s: pos, v: s.v, a: atBottom ? 0 : s.a },
        status: atBottom ? "bottom" : s.phase.rest ? "rest" : "moving",
        forces: [
          force("weight", { x: 0, y: -W }, "الوزن mg"), force("normal", { x: N * n.x, y: N * n.y }, "القوة العمودية N"),
          force("gravityParallel", along(drive), "مركّبة الوزن الموازية mg·sinθ"), force("gravityPerpendicular", { x: -N * n.x, y: -N * n.y }, "مركّبة الوزن العمودية mg·cosθ"),
          force("friction", along(fr), s.phase.rest ? "الاحتكاك السكوني" : "الاحتكاك الحركي"), force("net", along(p.mass * (atBottom ? 0 : s.a)), "محصلة القوى")
        ]
      };
    } };
  }
  cache.set(m, out);
  return out;
}
const force = (id: MotionForce["id"], vector: Vec, label: string): MotionForce => ({ id, vector, magnitude: Math.hypot(vector.x, vector.y), label });
/** Signed friction along the motion axis: static = −drive while resting, kinetic = −sign(v)·μk·N while sliding (from rest: against a). */
function frictionForce(drive: number, s: { v: number; a: number; phase: FrictionPhase }, fk: number): number {
  if (s.phase.rest) return -drive;
  const dir = sgn(s.v) || sgn(s.a);
  return -dir * fk;
}

/** The exact state at time t (non-finite t ⇒ 0; clamped to [0, end]); `end` = motionEndTime(model, maxTime). */
export function motionFrame(m: MotionModel, t: number, end: number): MotionFrame {
  const time = Number.isFinite(t) ? Math.min(Math.max(0, t), Math.max(0, end)) : 0;
  const p = prepare(m), f = p.frame(time);
  const status: MotionStatus = time >= end && end < p.natural && f.status !== "rest" ? "timeUp" : f.status;
  return { t: time, ...f, status, speed: Math.hypot(f.velocity.x, f.velocity.y) };
}
/** Exactly n = clamp(floor(count), 2, 2001) frames on [0, end]; t strictly increasing; the last t is exactly `end`. */
export function motionSamples(m: MotionModel, end: number, count = 240): MotionFrame[] {
  const n = Math.max(2, Math.min(2001, Number.isFinite(count) ? Math.floor(count) : 2)), out: MotionFrame[] = [];
  for (let i = 0; i < n; i++) out.push(motionFrame(m, i === n - 1 ? end : (i * end) / (n - 1), end));
  return out;
}

// ── reference quantities ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export type MotionQuantitySpec = { id: string; unit: MotionUnit; label: string };
const quantities = (...s: MotionQuantitySpec[]): readonly MotionQuantitySpec[] => Object.freeze(s);
export const MOTION_QUANTITY_SPEC: Readonly<Record<MotionKind, readonly MotionQuantitySpec[]>> = Object.freeze({
  freeFall: quantities(
    { id: "impactTime", unit: "s", label: "زمن الوصول إلى الأرض" }, { id: "impactSpeed", unit: "m/s", label: "سرعة الارتطام (مقدار)" },
    { id: "peakHeight", unit: "m", label: "أقصى ارتفاع" }, { id: "accelerationMagnitude", unit: "m/s²", label: "مقدار التسارع" }),
  projectile: quantities(
    { id: "flightTime", unit: "s", label: "زمن الطيران" }, { id: "range", unit: "m", label: "المدى الأفقي" }, { id: "maxHeight", unit: "m", label: "أقصى ارتفاع" },
    { id: "apexTime", unit: "s", label: "زمن الوصول إلى أعلى نقطة" }, { id: "impactSpeed", unit: "m/s", label: "سرعة الارتطام (مقدار)" }),
  newton2: quantities(
    { id: "weight", unit: "N", label: "الوزن mg" }, { id: "normalForce", unit: "N", label: "القوة العمودية N" },
    { id: "maxStaticFriction", unit: "N", label: "أقصى احتكاك سكوني μs·N" }, { id: "kineticFriction", unit: "N", label: "الاحتكاك الحركي μk·N" },
    { id: "initialAcceleration", unit: "m/s²", label: "التسارع عند بدء التجربة" }, { id: "initialNetForce", unit: "N", label: "محصلة القوى عند بدء التجربة" },
    { id: "finalVelocity", unit: "m/s", label: "السرعة في نهاية التجربة" }, { id: "finalDisplacement", unit: "m", label: "الإزاحة في نهاية التجربة" }),
  incline: quantities(
    { id: "weight", unit: "N", label: "الوزن mg" }, { id: "gravityParallel", unit: "N", label: "مركّبة الوزن الموازية mg·sinθ" },
    { id: "gravityPerpendicular", unit: "N", label: "مركّبة الوزن العمودية mg·cosθ" }, { id: "normalForce", unit: "N", label: "القوة العمودية N" },
    { id: "maxStaticFriction", unit: "N", label: "أقصى احتكاك سكوني μs·N" }, { id: "kineticFriction", unit: "N", label: "الاحتكاك الحركي μk·N" },
    { id: "initialAcceleration", unit: "m/s²", label: "التسارع عند بدء التجربة" }, { id: "timeToBottom", unit: "s", label: "زمن الوصول إلى أسفل المستوى" },
    { id: "speedAtBottom", unit: "m/s", label: "السرعة عند أسفل المستوى" })
});
/** Reference values of a model (null = not defined for this run, e.g. the block never reaches the bottom within maxTime). */
export function motionQuantities(m: MotionModel, maxTime: number): Record<string, number | null> {
  const p = m.params, g = p.gravity;
  if (m.kind === "freeFall") {
    const t = landingTime(p.initialHeight, p.initialVelocity, g), v0 = p.initialVelocity;
    return { impactTime: t, impactSpeed: Math.sqrt(v0 * v0 + 2 * g * p.initialHeight), peakHeight: v0 > 0 ? p.initialHeight + (v0 * v0) / (2 * g) : p.initialHeight, accelerationMagnitude: g };
  }
  if (m.kind === "projectile") {
    const vx = p.initialSpeed * cosDeg(p.launchAngle), vy = p.initialSpeed * sinDeg(p.launchAngle), t = landingTime(p.launchHeight, vy, g);
    return { flightTime: t, range: vx * t, maxHeight: vy > 0 ? p.launchHeight + (vy * vy) / (2 * g) : p.launchHeight, apexTime: vy > 0 ? vy / g : 0, impactSpeed: Math.sqrt(vx * vx + vy * vy + 2 * g * p.launchHeight) };
  }
  if (m.kind === "newton2") {
    const N = p.mass * g, end = motionEndTime(m, maxTime), f0 = motionFrame(m, 0, end), fe = motionFrame(m, end, end);
    return { weight: N, normalForce: N, maxStaticFriction: p.muStatic * N, kineticFriction: p.muKinetic * N, initialAcceleration: f0.acceleration.x, initialNetForce: p.mass * f0.acceleration.x, finalVelocity: fe.velocity.x, finalDisplacement: fe.position.x };
  }
  const W = p.mass * g, N = W * cosDeg(p.angle), end = motionEndTime(m, maxTime), natural = motionNaturalEnd(m), f0 = motionFrame(m, 0, end);
  const reaches = natural <= maxTime;
  return {
    weight: W, gravityParallel: W * sinDeg(p.angle), gravityPerpendicular: N, normalForce: N, maxStaticFriction: p.muStatic * N, kineticFriction: p.muKinetic * N,
    initialAcceleration: f0.along ? f0.along.a : 0, timeToBottom: reaches ? natural : null, speedAtBottom: reaches ? Math.abs(frictionAt(frictionPhasesOf(m), natural).v) : null
  };
}
function frictionPhasesOf(m: MotionModel): FrictionPhase[] {
  const p = m.params, W = p.mass * p.gravity;
  return frictionPhases({ drive: W * sinDeg(p.angle), normal: W * cosDeg(p.angle), mass: p.mass, muStatic: p.muStatic, muKinetic: p.muKinetic, v0: p.initialVelocity });
}
/** Display formatting (≤ 6 significant digits, no exponent noise for ordinary magnitudes). */
export const fmtMotion = (n: number | null | undefined): string => (typeof n === "number" && Number.isFinite(n) ? String(Number(n.toPrecision(6))) : "—");
