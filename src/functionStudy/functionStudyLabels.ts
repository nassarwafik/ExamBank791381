import { showNumber } from "../trustedSim/smartSimNumberInput";

// Phase 20A.2 — functionStudy2d@1 display helpers (UI only): task titles, kinds and LTR-safe formatting of the student's own analysis.
export const TASK_TITLE: Readonly<Record<string, string>> = Object.freeze({
  domainExclusions: "استثناءات المجال", xIntercepts: "المقاطع السينية", yIntercept: "المقطع الصادي", verticalAsymptotes: "خطوط التقارب الرأسية",
  horizontalAsymptotes: "خطوط التقارب الأفقية", extrema: "القيم القصوى المحلية", monotonicIntervals: "فترات التزايد والتناقص"
});
export const EXTREMUM_LABEL: Readonly<Record<string, string>> = Object.freeze({ min: "صغرى محلية", max: "عظمى محلية" });
export const INTERVAL_LABEL: Readonly<Record<string, string>> = Object.freeze({ increasing: "متزايدة", decreasing: "متناقصة" });
export const showEndpoint = (e: unknown): string => (e === "-inf" ? "-∞" : e === "+inf" ? "+∞" : typeof e === "number" ? showNumber(e) : "—");
/** "-inf" / "−∞" / "-∞" ⇒ "-inf"; "+inf" / "∞" / "+∞" ⇒ "+inf"; anything else is left for the number parser. */
export function endpointToken(text: string): "-inf" | "+inf" | undefined {
  const t = text.trim().replace(/[−–]/g, "-").toLowerCase();
  if (t === "-inf" || t === "-∞") return "-inf";
  if (t === "+inf" || t === "inf" || t === "∞" || t === "+∞") return "+inf";
  return undefined;
}
export const showList = (v: unknown): string => (Array.isArray(v) && v.length ? v.map(n => (typeof n === "number" ? showNumber(n) : "—")).join("، ") : "—");
export const showPoint = (p: { x: number; y: number }): string => "(" + showNumber(p.x) + ", " + showNumber(p.y) + ")";
