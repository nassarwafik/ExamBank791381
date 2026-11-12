// Date helpers for the Reports Center period filter. Uses LOCAL calendar Y-M-D (not UTC
// toISOString().slice) so the near-midnight boundary never shifts by a day.
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Phase R-1 (owner decision D-3): no «هذه السنة الدراسية» — it carried no bound (a class is already one school year), so it
// was indistinguishable from «كل الفترة»; the school-year filter above the period is the year criterion.
export type Period = "all" | "7" | "30" | "custom";

// "آخر N أيام" is inclusive of today plus the previous N-1 days (so "last 7" spans 7 calendar days).
// "all"/"custom" carry no computed bound here (custom is user-set).
export function rangeForPeriod(period: Period, today: Date = new Date()): { from: string; to: string } {
  if (period === "7" || period === "30") {
    const span = period === "7" ? 7 : 30;
    const from = new Date(today);
    from.setDate(from.getDate() - (span - 1));
    return { from: formatLocalDate(from), to: formatLocalDate(today) };
  }
  return { from: "", to: "" };
}

/* ---------------- Reports R-6 — what the period and the dates of an assessment report ARE ---------------- */

// Owner decision D-2: an assessment belongs to the period it was PUBLISHED in; the date shown and the order follow the same
// date. The server decides and says so in `periodBasis`; this file only words it. An assessment published before that date was
// recorded has none and is dated by its creation — the reply counts those (`byCreation`), and the screen says so rather than
// present a creation date as a publication date.
export type PeriodBasis = { criterion: "publishedAt"; byCreation: number };

/** The reply's period basis, or null when it is absent (an older API, a withheld academic part) or is one this client does not
 *  know — an unknown criterion is never worded as another one. */
export function periodBasisOf(value: unknown): PeriodBasis | null {
  const v = value as { criterion?: unknown; byCreation?: unknown } | null | undefined;
  if (!v || typeof v !== "object" || v.criterion !== "publishedAt") return null;
  const n = typeof v.byCreation === "number" && Number.isInteger(v.byCreation) && v.byCreation > 0 ? v.byCreation : 0;
  return { criterion: "publishedAt", byCreation: n };
}

/** «تقييم واحد … فتاريخه» / «تقييمان … فتاريخهما» / «3 تقييمات … فتاريخها» — the assessments dated by their creation, as a sentence. */
function byCreationText(n: number): string {
  if (n === 1) return "تقييم واحد هنا نُشر قبل بدء تسجيل تاريخ النشر، فتاريخه تاريخ إنشائه.";
  if (n === 2) return "تقييمان هنا نُشرا قبل بدء تسجيل تاريخ النشر، فتاريخهما تاريخ إنشائهما.";
  return (n <= 10 ? n + " تقييمات" : n + " تقييمًا") + " هنا نُشرت قبل بدء تسجيل تاريخ النشر، فتاريخها تاريخ إنشائها.";
}

/** The note under an assessment report: what its period and dates are, and how many assessments fell back to creation. */
export function periodBasisText(basis: PeriodBasis): string {
  return "الفترة وتواريخ التقييمات وترتيبها بحسب تاريخ نشر التقييم." + (basis.byCreation > 0 ? " " + byCreationText(basis.byCreation) : "");
}

/** The same, as one cell of an export's identity («معيار الفترة»). */
export function periodBasisMeta(basis: PeriodBasis): string {
  return "تاريخ نشر التقييم" + (basis.byCreation > 0 ? " (" + byCreationText(basis.byCreation).replace(/\.$/, "") + ")" : "");
}
