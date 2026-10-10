// Phase 21D-A.1 — physicsMotion@1 PRESENTATION helpers (UI only, pure, no React): which graphs an experiment shows and how a frame maps
// to each graph, the graph domains, the timeline events and the live readout. Every number comes from the shared motion core evaluated at
// the clock time; nothing here is academic state and nothing is sent to the server.
import { MOTION_PARAM_SPEC, fmtMotion, motionFrame, type MotionFrame, type MotionKind, type MotionModel } from "../physics/motionCore";

export type MotionGraphId = "primary" | "velocity" | "acceleration" | "height";
export type MotionSeriesSpec = { id: string; label: string; className?: string; pick: (f: MotionFrame) => { x: number; y: number } };
export type MotionGraphSpec = { id: MotionGraphId; title: string; xLabel: string; yLabel: string; xIsTime: boolean; series: MotionSeriesSpec[] };

export const UNIT_TEXT: Readonly<Record<string, string>> = Object.freeze({ s: "ث", m: "م", "m/s": "م/ث", "m/s²": "م/ث²", N: "نيوتن", kg: "كغ", deg: "درجة", "1": "بلا وحدة" });

const along = (f: MotionFrame) => f.along ?? { s: 0, v: 0, a: 0 };
const timeGraph = (id: MotionGraphId, title: string, yLabel: string, series: MotionSeriesSpec[]): MotionGraphSpec => ({ id, title, xLabel: "t (s)", yLabel, xIsTime: true, series });
const s1 = (id: string, label: string, pick: (f: MotionFrame) => number, className?: string): MotionSeriesSpec => ({ id, label, className, pick: f => ({ x: f.t, y: pick(f) }) });

const GRAPHS: Readonly<Record<MotionKind, Readonly<Record<string, MotionGraphSpec>>>> = {
  freeFall: {
    primary: timeGraph("primary", "الارتفاع مع الزمن", "y (m)", [s1("y", "الارتفاع y", f => f.position.y)]),
    velocity: timeGraph("velocity", "السرعة مع الزمن (الأعلى موجب)", "v (m/s)", [s1("v", "السرعة v", f => f.velocity.y, "is-velocity")]),
    acceleration: timeGraph("acceleration", "التسارع مع الزمن", "a (m/s²)", [s1("a", "التسارع a", f => f.acceleration.y, "is-acceleration")])
  },
  projectile: {
    primary: { id: "primary", title: "مسار المقذوف (الارتفاع مقابل المسافة الأفقية)", xLabel: "x (m)", yLabel: "y (m)", xIsTime: false, series: [{ id: "path", label: "المسار", pick: f => ({ x: f.position.x, y: f.position.y }) }] },
    height: timeGraph("height", "الارتفاع مع الزمن", "y (m)", [s1("y", "الارتفاع y", f => f.position.y)]),
    velocity: timeGraph("velocity", "مركّبتا السرعة مع الزمن", "v (m/s)", [s1("vx", "المركّبة الأفقية vx", f => f.velocity.x, "is-vx"), s1("vy", "المركّبة الرأسية vy", f => f.velocity.y, "is-velocity")])
  },
  newton2: {
    primary: timeGraph("primary", "الإزاحة مع الزمن", "x (m)", [s1("x", "الإزاحة x", f => f.position.x)]),
    velocity: timeGraph("velocity", "السرعة مع الزمن", "v (m/s)", [s1("v", "السرعة v", f => f.velocity.x, "is-velocity")]),
    acceleration: timeGraph("acceleration", "التسارع مع الزمن", "a (m/s²)", [s1("a", "التسارع a", f => f.acceleration.x, "is-acceleration")])
  },
  incline: {
    primary: timeGraph("primary", "المسافة المقطوعة على المستوى مع الزمن", "s (m)", [s1("s", "المسافة s", f => along(f).s)]),
    velocity: timeGraph("velocity", "السرعة على المستوى مع الزمن", "v (m/s)", [s1("v", "السرعة v", f => along(f).v, "is-velocity")]),
    acceleration: timeGraph("acceleration", "التسارع على المستوى مع الزمن", "a (m/s²)", [s1("a", "التسارع a", f => along(f).a, "is-acceleration")])
  }
};
/** The primary graph (always shown; graph-point tasks live on it) followed by the teacher-selected optional graphs, in canonical order. */
export function motionGraphs(kind: MotionKind, optional: readonly string[]): MotionGraphSpec[] {
  const g = GRAPHS[kind];
  return [g.primary, ...optional.filter(id => id !== "primary" && g[id]).map(id => g[id])];
}

/** A padded plot domain that always contains 0 on the value axis (so a sign change is visible) and is never degenerate. */
export function valueDomain(values: readonly number[]): [number, number] {
  let lo = 0, hi = 0;
  for (const v of values) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || Math.max(Math.abs(hi), 1);
  return [lo - 0.06 * span, hi + 0.08 * span];
}

export type MotionEvent = { t: number; kind: string; label: string };
/** Physically meaningful instants of the run (presentation only): apex, impact / landing, reaching the bottom, the block stopping. */
export function motionEvents(m: MotionModel, end: number): MotionEvent[] {
  const p = m.params, out: MotionEvent[] = [];
  const inRun = (t: number) => Number.isFinite(t) && t > 0 && t <= end;
  if (m.kind === "freeFall" || m.kind === "projectile") {
    const vy0 = m.kind === "freeFall" ? p.initialVelocity : p.initialSpeed * Math.sin((p.launchAngle * Math.PI) / 180);
    const apex = vy0 > 0 ? vy0 / p.gravity : NaN;
    if (inRun(apex) && apex < end) out.push({ t: apex, kind: "apex", label: "أعلى نقطة" });
    const last = motionFrame(m, end, end);
    if (last.status === "landed") out.push({ t: end, kind: "impact", label: m.kind === "freeFall" ? "الارتطام بالأرض" : "سقوط المقذوف" });
  } else {
    const last = motionFrame(m, end, end);
    if (last.status === "bottom") out.push({ t: end, kind: "bottom", label: "الوصول إلى أسفل المستوى" });
    // the first instant the block comes to rest after moving (bisection on the status; frames are exact, so this is deterministic)
    const first = motionFrame(m, 0, end);
    if (first.status === "moving" && last.status === "rest") {
      let a = 0, b = end;
      for (let i = 0; i < 60; i++) { const mid = (a + b) / 2; if (motionFrame(m, mid, end).status === "rest") b = mid; else a = mid; }
      if (inRun(b)) out.push({ t: b, kind: "stop", label: "توقّف الجسم" });
    }
  }
  return out;
}

export type ReadoutItem = { id: string; label: string; value: string; unit: string };
/** The live measurements shown under the scene for a frame (signed components along the motion axis). */
export function motionReadout(m: MotionModel, f: MotionFrame): ReadoutItem[] {
  const r = (id: string, label: string, v: number, unit: string): ReadoutItem => ({ id, label, value: fmtMotion(v), unit });
  const vec = (id: string) => f.forces.find(x => x.id === id)?.vector ?? { x: 0, y: 0 };
  switch (m.kind) {
    case "freeFall": return [r("t", "الزمن", f.t, "s"), r("y", "الارتفاع", f.position.y, "m"), r("v", "السرعة", f.velocity.y, "m/s"), r("a", "التسارع", f.acceleration.y, "m/s²")];
    case "projectile": return [r("t", "الزمن", f.t, "s"), r("x", "المسافة الأفقية", f.position.x, "m"), r("y", "الارتفاع", f.position.y, "m"), r("vx", "المركّبة الأفقية للسرعة", f.velocity.x, "m/s"), r("vy", "المركّبة الرأسية للسرعة", f.velocity.y, "m/s"), r("speed", "مقدار السرعة", f.speed, "m/s")];
    case "newton2": return [r("t", "الزمن", f.t, "s"), r("x", "الإزاحة", f.position.x, "m"), r("v", "السرعة", f.velocity.x, "m/s"), r("a", "التسارع", f.acceleration.x, "m/s²"), r("friction", "قوة الاحتكاك", vec("friction").x, "N"), r("net", "محصلة القوى", vec("net").x, "N")];
    case "incline": {
      const a = along(f), th = (m.params.angle * Math.PI) / 180;
      const down = (v: { x: number; y: number }) => v.x * Math.cos(th) - v.y * Math.sin(th);   // component along the down-slope direction
      return [r("t", "الزمن", f.t, "s"), r("s", "المسافة على المستوى", a.s, "m"), r("v", "السرعة", a.v, "m/s"), r("a", "التسارع", a.a, "m/s²"),
        r("normal", "القوة العمودية", Math.hypot(vec("normal").x, vec("normal").y), "N"), r("friction", "الاحتكاك (موجب نحو الأسفل)", down(vec("friction")), "N"), r("net", "المحصلة (موجبة نحو الأسفل)", down(vec("net")), "N")];
    }
  }
}

export type SceneBounds = { x0: number; x1: number; y0: number; y1: number };
export type SceneScales = { speedMax: number; forceMax: number; bounds: SceneBounds };
/** Per-run scene scales: the largest speed / force of the run (vector lengths) and the world box the scene must show. */
export function sceneScales(m: MotionModel, samples: readonly MotionFrame[]): SceneScales {
  let speedMax = 0, forceMax = 0, x0 = 0, x1 = 0, y1 = 0;
  for (const f of samples) {
    speedMax = Math.max(speedMax, f.speed); y1 = Math.max(y1, f.position.y); x0 = Math.min(x0, f.position.x); x1 = Math.max(x1, f.position.x);
    for (const fo of f.forces) forceMax = Math.max(forceMax, fo.magnitude);
  }
  const p = m.params;
  if (m.kind === "incline") { const r = (p.angle * Math.PI) / 180; return { speedMax, forceMax, bounds: { x0: 0, x1: p.length * Math.cos(r), y0: 0, y1: Math.max(p.length * Math.sin(r), 1e-6) } }; }
  if (m.kind === "newton2" && x1 - x0 < 1e-9) { x0 -= 1; x1 += 1; }
  if (m.kind === "projectile") { const span = Math.max(x1, y1, 1e-6); return { speedMax, forceMax, bounds: { x0: 0, x1: Math.max(x1, span * 0.1), y0: 0, y1: Math.max(y1, span * 0.1) } }; }
  return { speedMax, forceMax, bounds: { x0, x1, y0: 0, y1: Math.max(y1, 1e-6) } };
}

export const STATUS_TEXT: Readonly<Record<string, string>> = Object.freeze({
  flight: "في الهواء", landed: "وصل إلى الأرض", moving: "يتحرك", rest: "ساكن", bottom: "وصل إلى أسفل المستوى", timeUp: "انتهت مدة التجربة"
});
/** Parameter label + unit for a control, from the shared spec. */
export const paramSpecOf = (kind: MotionKind, key: string) => MOTION_PARAM_SPEC[kind].find(s => s.key === key);
