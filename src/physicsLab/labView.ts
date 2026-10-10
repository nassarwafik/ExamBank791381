// Phase 21D-A.2 — physicsLab@1 PRESENTATION helpers (UI only, pure, no React): which graphs each experiment shows and how a frame maps to
// them, the live readout, the named events and the scene scales. Every number comes from the shared advanced core at the clock time;
// nothing here is academic state and nothing is sent to the server.
import { CIRCUIT_TOPOLOGIES, fmtLab, labFrame, solveCircuit, type LabFrame, type LabModel } from "../physics/labCore";

export type LabSeriesSpec = { id: string; label: string; className?: string; pick: (f: LabFrame) => { x: number; y: number } };
export type LabGraphSpec = { id: string; title: string; xLabel: string; yLabel: string; xIsTime: boolean; series: LabSeriesSpec[] };
const tg = (id: string, title: string, yLabel: string, series: LabSeriesSpec[]): LabGraphSpec => ({ id, title, xLabel: "t (s)", yLabel, xIsTime: true, series });
const s1 = (id: string, label: string, pick: (f: LabFrame) => number, className?: string): LabSeriesSpec => ({ id, label, className, pick: f => ({ x: f.t, y: pick(f) }) });
const E = (f: LabFrame) => f.energy ?? { kinetic: 0, potential: 0, total: 0, dissipated: 0 };
const energySeries = (withDissipated: boolean): LabSeriesSpec[] => [
  s1("ke", "الطاقة الحركية", f => E(f).kinetic, "is-ke"), s1("pe", "طاقة الوضع", f => E(f).potential, "is-pe"), s1("total", "الطاقة الميكانيكية الكلية", f => E(f).total, "is-total"),
  ...(withDissipated ? [s1("lost", "الطاقة المبددة", f => E(f).dissipated, "is-lost")] : [])
];

/** The primary graph (always shown; graph points live on it) followed by the teacher-selected optional graphs, in canonical order. */
export function labGraphs(m: LabModel, optional: readonly string[]): LabGraphSpec[] {
  const p = m.params, dissipative = (m.kind === "pendulum" || m.kind === "spring") ? p.damping > 0 : m.kind === "energy" ? p.drag > 0 : false;
  const all: Record<string, LabGraphSpec> =
    m.kind === "pendulum" ? {
      primary: tg("primary", "زاوية البندول مع الزمن", "θ (°)", [s1("theta", "الزاوية θ", f => f.q)]),
      angularVelocity: tg("angularVelocity", "السرعة الزاوية مع الزمن", "ω (rad/s)", [s1("omega", "السرعة الزاوية ω", f => f.rate, "is-velocity")]),
      energy: tg("energy", dissipative ? "الطاقة مع الزمن (تتناقص بالتخميد)" : "الطاقة مع الزمن (محفوظة دون تخميد)", "E (J)", energySeries(dissipative))
    } : m.kind === "spring" ? {
      primary: tg("primary", "الإزاحة عن الاتزان مع الزمن (الأسفل موجب)", "x (m)", [s1("x", "الإزاحة x", f => f.q)]),
      force: { id: "force", title: "قانون هوك: قوة النابض مع الاستطالة", xLabel: "e (m)", yLabel: "F (N)", xIsTime: false, series: [{ id: "hooke", label: "قوة النابض k·e", pick: f => ({ x: -f.position.y, y: f.forces.find(x => x.id === "spring")?.vector.y ?? 0 }) }] },
      velocity: tg("velocity", "السرعة مع الزمن (الأسفل موجب)", "v (m/s)", [s1("v", "السرعة v", f => f.rate, "is-velocity")]),
      energy: tg("energy", dissipative ? "الطاقة حول الاتزان (تتناقص بالتخميد)" : "الطاقة حول الاتزان (محفوظة دون تخميد)", "E (J)", energySeries(dissipative))
    } : m.kind === "energy" ? {
      primary: tg("primary", dissipative ? "الطاقة مع الزمن (المقاومة تبدد جزءًا منها)" : "الطاقة مع الزمن (محفوظة دون مقاومة)", "E (J)", energySeries(dissipative)),
      height: tg("height", "الارتفاع مع الزمن", "y (m)", [s1("y", "الارتفاع y", f => f.q)]),
      velocity: tg("velocity", "السرعة مع الزمن (الأعلى موجب)", "v (m/s)", [s1("v", "السرعة v", f => f.rate, "is-velocity")])
    } : {
      primary: { id: "primary", title: "منحنى التيار–الجهد للدائرة", xLabel: "V (V)", yLabel: "I (A)", xIsTime: false, series: [{ id: "iv", label: "التيار الكلي", pick: f => ({ x: f.q, y: f.rate }) }] },
      power: { id: "power", title: "القدرة الكلية مع جهد المصدر", xLabel: "V (V)", yLabel: "P (W)", xIsTime: false, series: [{ id: "pv", label: "القدرة", pick: f => ({ x: f.q, y: f.q * f.rate }) }] }
    };
  return [all.primary, ...optional.filter(id => id !== "primary" && all[id]).map(id => all[id])];
}
/** The circuit's characteristic curves are swept over the source voltage (0 … 1.25·V), not over time: the operating point is the marker. */
export function circuitSweep(m: LabModel, n = 41): LabFrame[] {
  const vmax = m.params.voltage * 1.25, out: LabFrame[] = [];
  for (let i = 0; i < n; i++) { const v = (vmax * i) / (n - 1) || vmax * 1e-6; const s = solveCircuit({ ...m.params, voltage: v }); out.push({ ...labFrame(m, 0, 0), t: i, q: v, rate: s.sourceCurrent }); }
  return out;
}

/** A padded plot domain containing 0 on the value axis and never degenerate. */
export function valueDomain(values: readonly number[]): [number, number] {
  let lo = 0, hi = 0;
  for (const v of values) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || Math.max(Math.abs(hi), 1);
  return [lo - 0.06 * span, hi + 0.08 * span];
}

export type LabEvent = { t: number; kind: string; label: string };
/** Named events of the run (presentation only, never labelled with a value): apex and impact of the energy body. */
export function labEvents(m: LabModel, end: number): LabEvent[] {
  if (m.kind !== "energy") return [];
  const p = m.params, out: LabEvent[] = [], k = p.drag / p.mass;
  const apex = p.initialVelocity > 0 ? (p.drag === 0 ? p.initialVelocity / p.gravity : Math.log1p(p.initialVelocity * k / p.gravity) / k) : NaN;
  if (Number.isFinite(apex) && apex > 0 && apex < end) out.push({ t: apex, kind: "apex", label: "أعلى نقطة" });
  if (labFrame(m, end, end).status === "landed") out.push({ t: end, kind: "impact", label: "الارتطام بالأرض" });
  return out;
}

export type ReadoutItem = { id: string; label: string; value: string; unit: string };
export function labReadout(m: LabModel, f: LabFrame): ReadoutItem[] {
  const r = (id: string, label: string, v: number, unit: string): ReadoutItem => ({ id, label, value: fmtLab(v), unit });
  const e = E(f), force = (id: string) => f.forces.find(x => x.id === id);
  const energy = [r("ke", "الطاقة الحركية", e.kinetic, "J"), r("pe", "طاقة الوضع", e.potential, "J"), r("total", "الطاقة الميكانيكية", e.total, "J"), r("lost", "الطاقة المبددة", e.dissipated, "J")];
  switch (m.kind) {
    case "pendulum": return [r("t", "الزمن", f.t, "s"), r("theta", "الزاوية θ", f.q, "°"), r("omega", "السرعة الزاوية ω", f.rate, "rad/s"), r("speed", "سرعة الثقل", f.speed, "m/s"), r("tension", "قوة الشد", force("tension")?.magnitude ?? 0, "N"), ...energy];
    case "spring": return [r("t", "الزمن", f.t, "s"), r("x", "الإزاحة عن الاتزان", f.q, "m"), r("v", "السرعة", f.rate, "m/s"), r("a", "التسارع", f.accel, "m/s²"), r("ext", "استطالة النابض", -f.position.y, "m"), r("spring", "قوة النابض", force("spring")?.vector.y ?? 0, "N"), ...energy];
    case "energy": return [r("t", "الزمن", f.t, "s"), r("y", "الارتفاع", f.q, "m"), r("v", "السرعة", f.rate, "m/s"), ...energy];
    default: {
      const s = f.circuit!;
      return [r("V", "جهد المصدر", m.params.voltage, "V"), r("I", "التيار الكلي (الأميتر)", s.sourceCurrent, "A"), r("Req", "المقاومة المكافئة", s.equivalentResistance, "Ω"), r("P", "القدرة الكلية", m.params.voltage * s.sourceCurrent, "W")];
    }
  }
}
export const topologyLabel = (t: number) => CIRCUIT_TOPOLOGIES.find(o => o.value === t)?.label ?? "";
export const STATUS_TEXT: Readonly<Record<string, string>> = Object.freeze({ running: "يتحرك", rest: "ساكن", landed: "وصل إلى الأرض", steady: "حالة مستقرة (تيار مستمر)" });
/** Whether the experiment, as configured, conserves mechanical energy (no damping / no drag) — the only case where the UI may say so. */
export const conservesEnergy = (m: LabModel) => (m.kind === "pendulum" || m.kind === "spring" ? m.params.damping === 0 : m.kind === "energy" ? m.params.drag === 0 : false);
