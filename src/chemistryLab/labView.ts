import {
  CHEM_LAB_EXPERIMENT_LABEL, chemLabContext, preparedSolution, quantityDimension, quantitySpec,
  type ChemLabConfigV1, type ChemLabObservation, type ChemLabStateV1, type NumberTask, type PhContext, type RateContext, type TitrationContext
} from "../chemistryLabModel";
import { optionText } from "../chemistryLabPlugin";
import { fromNumber, parseDecimal, toNumber, toSignificant } from "../chemistry/lab/exact";
import { LAB_UNITS, isLabDimension, type LabUnitSpec } from "../chemistry/lab/units";
import { formatPh, indicatorAppearance, indicatorById, type Indicator } from "../chemistry/lab/acidBase";
import { titrationPh } from "../chemistry/lab/titration";
import { concentrationAt } from "../chemistry/lab/kinetics";

// Phase 21D-D.3 — chemistryLab@1 PRESENTATION helpers (UI only, pure). Everything here is derived from the canonical public config and the
// replayed state by the same science modules the server grades with; nothing here grades, and nothing a student types is trusted beyond
// turning text into a candidate decimal (the plugin's strict normalizer stays the authority).
export { CHEM_LAB_EXPERIMENT_LABEL, optionText };

const DIGITS: Readonly<Record<string, string>> = Object.freeze({
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9"
});
/** A student's typed number as the canonical decimal text the plugin accepts ("٠٫٠٩٣" → "0.093", ".5" → "0.5", "9.30E-3" → "9.30e-3");
 *  null for anything that is not a plain decimal (words, expressions, "NaN", "Infinity", a lone "." or "-"). Figures are kept as typed. */
export function studentDecimal(text: string): string | null {
  let t = text.trim().replace(/[٠-٩۰-۹]/g, d => DIGITS[d] ?? d).replace(/[٫,]/g, ".").replace(/[−–]/g, "-").replace(/\s+/g, "").replace(/E/g, "e");
  if (t.startsWith("+")) t = t.slice(1);
  const m = /^(-?)(\d*)(\.\d+)?(e[+-]?\d{1,2})?$/.exec(t);
  if (!m || (!m[2] && !m[3])) return null;
  const int = m[2].replace(/^0+(?=\d)/, "") || "0";
  const out = m[1] + int + (m[3] ?? "") + (m[4] ?? "");
  return parseDecimal(out) ? out : null;
}
/** Units the student may answer a number task in (the task's unit first). */
export function answerUnits(c: ChemLabConfigV1, t: NumberTask): readonly LabUnitSpec[] {
  const q = quantitySpec(c.experiment.kind, t.quantity), dim = q ? quantityDimension(c, q) : null;
  if (!dim || !isLabDimension(dim)) return [];
  const all = LAB_UNITS[dim], first = all.find(u => u.id === t.unit);
  return first ? [first, ...all.filter(u => u !== first)] : all;
}
export const unitText = (u: LabUnitSpec): string => (u.id === "1" ? "بلا وحدة (نسبة)" : u.id === "pH" ? "بلا وحدة (pH)" : u.label);
/** Significant-figure display of a double for readouts (never used for grading). */
export const sig = (x: number, n = 3): string => { const v = fromNumber(x); return v ? toSignificant(v, n) : "—"; };

// ── Lab A ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type PreparedView =
  | { state: "none" } | { state: "pending"; flask: number | null }
  | { state: "invalid"; flask: number } | { state: "outside"; flask: number }
  | { state: "ready"; flask: number; concentration: number; moles: number };
/** The made-up solution as the bench shows it: not made up yet, impossible (aliquot ≥ flask), above the model's bound, or ready. */
export function preparedView(c: ChemLabConfigV1, s: ChemLabStateV1): PreparedView {
  const lab = s.lab;
  if (lab.kind !== "solutions") return { state: "none" };
  if (!lab.madeUp || lab.flask === null) return { state: "pending", flask: lab.flask };
  const r = preparedSolution(c, lab);
  if (r && r.ok) return { state: "ready", flask: lab.flask, concentration: toNumber(r.concentration), moles: toNumber(r.moles) };
  return r && r.code === "LAB_SOLUTION_ABOVE_MODEL" ? { state: "outside", flask: lab.flask } : { state: "invalid", flask: lab.flask };
}
/** c = n / V for the same amount over a range of volumes (the dilution hyperbola), for display. */
export function dilutionCurve(moles: number, vMin: number, vMax: number, n = 60): { x: number; y: number }[] {
  return Array.from({ length: n + 1 }, (_, i) => { const v = vMin + ((vMax - vMin) * i) / n; return { x: v, y: moles / (v / 1000) }; });
}

// ── Lab B / C ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const phOf = (c: ChemLabConfigV1, solutionId: string): number | null => {
  if (c.experiment.kind !== "ph") return null;
  const r = (chemLabContext(c.experiment) as PhContext).results[solutionId];
  return r && r.ok ? r.pH : null;
};
export type Appearance = { colour: string; name: string; state: "acid" | "transition" | "base" };
/** The illustrative colour of an indicator at a pH (categorical state from the cited range; the colour itself is only a picture). */
export function appearance(ind: Indicator, pH: number): Appearance {
  const a = indicatorAppearance(ind, pH);
  return { colour: a.state === "acid" ? ind.acidColour : a.state === "base" ? ind.baseColour : mix(ind.acidColour, ind.baseColour, a.fraction), name: a.label, state: a.state };
}
const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
export function mix(a: string, b: string, f: number): string {
  const x = hex(a), y = hex(b), t = Math.max(0, Math.min(1, f));
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
export const titrationContext = (c: ChemLabConfigV1): TitrationContext | null => (c.experiment.kind === "titration" ? chemLabContext(c.experiment) as TitrationContext : null);
export const flaskPh = (c: ChemLabConfigV1, added: string): number | null => {
  const ctx = titrationContext(c), v = parseDecimal(added);
  return ctx && v ? titrationPh(ctx.setup, v) : null;
};

// ── Lab D ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const rateContext = (c: ChemLabConfigV1): RateContext | null => (c.experiment.kind === "rate" ? chemLabContext(c.experiment) as RateContext : null);
export function trialConcentration(c: ChemLabConfigV1, trialId: string, t: number): number | null {
  const ctx = rateContext(c), tr = ctx?.trials[trialId];
  return ctx && tr ? concentrationAt(ctx.model.order, tr.k, tr.a0, t) : null;
}

/** An LTR quantity inside Arabic text ("24.50 mL", "pH = 2.00"), isolated so the bidi algorithm never reorders it into "mL 24.50". */
export const ltr = (s: string): string => "\u2066" + s + "\u2069";
// a number followed by a unit the lab uses, not already isolated, not part of a longer number, word or compound unit ("L/(mol\u00b7s)");
// no lookbehind (older Safari cannot parse it): the preceding character is captured and put back
const QUANTITY = /(^|[^\d.\u2066])(\d+(?:\.\d+)?\s(?:mol\/L|mmol|mol|mL|L|g|min|s|\u00b0C|K))(?![\p{L}\p{N}/\u2069])/gu;
/** Arabic text that may carry quantities \u2014 a teacher-authored label or task, a status message, a fixed hint ("\u062d\u0636\u0651\u0631 250 mL", "25 \u00b0C"):
 *  every number + unit becomes an isolated LTR island (see ltr), once. Presentation only; the stored text is never changed. */
export const isolateQuantities = (s: string): string => s.replace(QUANTITY, (_, pre: string, q: string) => pre + ltr(q));

// ── the observation record ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type RecordRow = { kind: string; what: string; detail: string };
/** One row per recorded observation. Measured values appear only where the teacher enabled readouts. */
export function recordRow(c: ChemLabConfigV1, o: ChemLabObservation): RecordRow {
  const e = c.experiment;
  switch (o.kind) {
    case "solution":
      return { kind: "محلول محضّر", what: "دورق " + ltr(o.flask + " mL"), detail: o.mass !== null ? "كتلة " + ltr(o.mass + " g") : ltr(o.pipette + " mL") + " من المحلول الأم" };
    case "meter": {
      const label = e.kind === "ph" ? e.solutions.find(x => x.id === o.solution)?.label ?? o.solution : o.solution, pH = phOf(c, o.solution);
      return { kind: "قياس pH", what: isolateQuantities(label), detail: pH === null ? "—" : ltr("pH = " + formatPh(pH)) };
    }
    case "indicator": {
      const label = e.kind === "ph" ? e.solutions.find(x => x.id === o.solution)?.label ?? o.solution : o.solution;
      const ind = indicatorById(o.indicator), pH = phOf(c, o.solution);
      return { kind: "اختبار بكاشف", what: isolateQuantities(label), detail: ind && pH !== null ? ind.nameAr + ": " + appearance(ind, pH).name : "—" };
    }
    case "reading": {
      const ind = o.indicator ? indicatorById(o.indicator) : undefined, pH = flaskPh(c, o.added);
      const colour = ind && pH !== null ? ind.nameAr + ": " + appearance(ind, pH).name : "بلا كاشف";
      return { kind: "قراءة السحاحة", what: ltr(o.added + " mL"), detail: colour + (c.view.readouts && pH !== null ? " · " + ltr("pH = " + formatPh(pH)) : "") };
    }
    case "run": {
      const tr = e.kind === "rate" ? e.trials.find(x => x.id === o.trial) : undefined;
      return { kind: "تشغيل تجربة", what: isolateQuantities(tr?.label ?? o.trial), detail: "" };
    }
  }
}
export const experimentTitle = (c: ChemLabConfigV1): string => CHEM_LAB_EXPERIMENT_LABEL[c.experiment.kind];
