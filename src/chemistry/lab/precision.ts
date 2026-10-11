// Phase 21D-D.3 — the explicit answer-precision policy of the virtual chemistry laboratory (pure; shared server build).
//
// There is NO free, global or teacher-typed tolerance (D.1's permissive `chem.value` tolerance is not reproduced). A numeric task publishes
// HOW the student must report the result — a number of decimal places or of significant figures, in the task's unit — and the grader
// accepts exactly the answers that agree with the trusted value to that reporting precision:
//
//   tolerance = max( ½ × (one unit in the last reported place of the TRUSTED value),  instrument uncertainty of the quantity )
//   passed    ⇔ |answer − trusted| ≤ tolerance           (inclusive: a trusted value sitting exactly on a rounding boundary accepts both)
//
// The instrument term is code-owned per quantity (e.g. a burette reading carries ±0.05 mL, half its 0.1 mL graduation) and is zero for
// quantities computed from exact authored values. Everything is exact rational arithmetic.
import { abs, cmp, floorLog10, max, mul, pow10, q, sign, sub, toFixed, toSignificant, ZERO, type Q } from "./exact";

export const LAB_PRECISION_LIMITS = Object.freeze({ decimalsMax: 6, significantMin: 1, significantMax: 6 });
export type LabPrecision = Readonly<{ decimals: number }> | Readonly<{ significant: number }>;

export function validatePrecision(raw: unknown): LabPrecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const keys = Object.keys(raw as object), r = raw as Record<string, unknown>;
  if (keys.length !== 1) return null;
  if (keys[0] === "decimals" && Number.isInteger(r.decimals) && (r.decimals as number) >= 0 && (r.decimals as number) <= LAB_PRECISION_LIMITS.decimalsMax) return Object.freeze({ decimals: r.decimals as number });
  if (keys[0] === "significant" && Number.isInteger(r.significant) && (r.significant as number) >= LAB_PRECISION_LIMITS.significantMin && (r.significant as number) <= LAB_PRECISION_LIMITS.significantMax) return Object.freeze({ significant: r.significant as number });
  return null;
}
/** One unit in the last reported place of `trusted` (in the task's unit). */
export function lastPlaceUnit(p: LabPrecision, trusted: Q): Q {
  if ("decimals" in p) return pow10(-p.decimals);
  if (sign(trusted) === 0) return pow10(-p.significant);
  return pow10(floorLog10(trusted) - p.significant + 1);
}
export const answerTolerance = (p: LabPrecision, trusted: Q, instrument: Q = ZERO): Q => max(mul(lastPlaceUnit(p, trusted), q(1n, 2n)), instrument);
export const withinTolerance = (answer: Q, trusted: Q, tolerance: Q): boolean => cmp(abs(sub(answer, trusted)), tolerance) <= 0;
/** The trusted value as the teacher sees it, rounded to the reporting precision. */
export const formatAtPrecision = (p: LabPrecision, v: Q): string => ("decimals" in p ? toFixed(v, p.decimals) : toSignificant(v, p.significant));
export const PRECISION_TEXT = (p: LabPrecision): string => ("decimals" in p ? (p.decimals === 0 ? "لأقرب عدد صحيح" : "بـ " + p.decimals + " منزلة عشرية") : "بـ " + p.significant + " أرقام معنوية");
