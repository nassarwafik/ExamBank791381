// Pure formatting helpers for the Reports Center (Western digits only).
export function pct(n: number | null | undefined): string { return n === null || n === undefined ? "—" : Math.round(Number(n)) + "%"; }
/** ISO calendar day (YYYY-MM-DD, Western digits) for a timestamp; "—" when absent. */
export function isoDay(iso: string | null | undefined): string { return iso ? String(iso).slice(0, 10) : "—"; }

// Reports R-6 (docs/enterprise-reports-period-basis-r6.md) — an assessment is dated by its publication, or by its later opening when
// it was scheduled; one published before R-6 keeps its creation date (the server counts those in `periodBasis.fallback`).
export const PUBLISHED_DATE_LABEL = "تاريخ النشر";
export const PERIOD_HINT = "حسب تاريخ نشر التقييم، والمجدول من موعد فتحه.";
export type PeriodBasis = { basis: "published"; fallback: number };
/** The note shown when some assessments were published before R-6 ("" when none, or on an older API). */
export function periodFallbackText(basis: PeriodBasis | null | undefined): string {
  const n = basis && Number.isInteger(basis.fallback) && basis.fallback > 0 ? basis.fallback : 0;
  if (!n) return "";
  return n === 1
    ? "تقييم واحد نُشر قبل تسجيل تاريخ النشر، فيُؤرَّخ بتاريخ إنشائه."
    : n + " من التقييمات نُشرت قبل تسجيل تاريخ النشر، فتُؤرَّخ بتاريخ إنشائها.";
}
