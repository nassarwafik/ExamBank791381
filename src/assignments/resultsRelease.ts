// Phase 21G.5 (owner decision D2) — when students see an assignment's results: the ONE persisted field assignment.resultsRelease.
// The SERVER enforces it (it withholds every mark until release); this module only labels and explains the three modes.
// A missing value (every assignment created before 21G.5) is "immediate" — the historical behaviour.
import type { Item } from "./types";

export type ResultsRelease = "immediate" | "afterDue" | "manual";

export const RESULTS_RELEASE_OPTIONS: ReadonlyArray<{ value: ResultsRelease; label: string; summary: string }> = [
  { value: "immediate", label: "فور التصحيح", summary: "يرى الطالب علامته وملاحظاتك بمجرد أن تصبح جاهزة." },
  { value: "afterDue", label: "بعد الموعد النهائي", summary: "تظهر النتائج للجميع عند انتهاء موعد التسليم." },
  { value: "manual", label: "يدويًا", summary: "تبقى النتائج مخفية حتى تنشرها بنفسك." }
];

export const normalizeResultsRelease = (v: unknown): ResultsRelease => (v === "afterDue" || v === "manual" ? v : "immediate");
export const resultsReleaseLabel = (v: unknown) => RESULTS_RELEASE_OPTIONS.find(o => o.value === normalizeResultsRelease(v))!.label;

/** Where an assignment's results stand for students right now, in the teacher's words (never a mark). */
export function resultsReleaseState(item: Pick<Item, "dueAt" | "resultsRelease" | "resultsReleasedAt">, now: number, fmt: (v: string) => string): { visible: boolean; text: string } {
  const mode = normalizeResultsRelease(item.resultsRelease);
  if (mode === "immediate") return { visible: true, text: "تظهر للطلاب فور التصحيح" };
  if (mode === "afterDue") {
    const due = Date.parse(item.dueAt || "");
    return Number.isFinite(due) && now >= due ? { visible: true, text: "ظاهرة للطلاب (انتهى الموعد النهائي)" } : { visible: false, text: "مخفية حتى الموعد النهائي: " + fmt(item.dueAt) };
  }
  return item.resultsReleasedAt ? { visible: true, text: "منشورة للطلاب منذ " + fmt(item.resultsReleasedAt) } : { visible: false, text: "مخفية عن الطلاب حتى تنشرها" };
}
