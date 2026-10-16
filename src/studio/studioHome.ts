// Phase 21F.7 — «امتحاناتي»: the saved-exams list as the Studio home. Pure filtering over the list the server returns (its additive
// `kind` / `status` / `readiness` fields; an older server that omits them reads as a structured draft with unknown readiness).

export type HomeReadiness = { canFinalize: boolean; blockers: number; warnings: number };
export type HomeExam = {
  blobName: string; examId: string; title: string; savedAt: string; questionCount: number; totalMarks: number;
  kind?: "structured" | "legacy"; status?: "draft" | "final"; readiness?: HomeReadiness | null;
};
export type HomeFilter = "all" | "draft" | "final" | "fix" | "legacy";
export const HOME_FILTERS: readonly { key: HomeFilter; label: string }[] = [
  { key: "all", label: "الكل" }, { key: "draft", label: "مسودات" }, { key: "final", label: "معتمدة" }, { key: "fix", label: "تحتاج إصلاحًا" }, { key: "legacy", label: "قديمة" }
];

const isLegacy = (e: HomeExam) => e.kind === "legacy";
export function matchesFilter(e: HomeExam, filter: HomeFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "legacy": return isLegacy(e);
    case "final": return !isLegacy(e) && e.status === "final";
    case "draft": return !isLegacy(e) && e.status !== "final";
    case "fix": return !isLegacy(e) && e.readiness?.canFinalize === false;
  }
}

/** Arabic-aware search key: NFKC, lower case, no tashkeel / tatweel, alef forms unified, ة → ه, ى → ي, single spaces. */
export const searchKey = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[ً-ٰٟـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();

export function filterHomeExams(exams: readonly HomeExam[], filter: HomeFilter, query: string): HomeExam[] {
  const q = searchKey(query);
  return exams.filter(e => matchesFilter(e, filter) && (!q || searchKey(e.title).includes(q)));
}

export function homeCounts(exams: readonly HomeExam[]): Record<HomeFilter, number> {
  const out = { all: 0, draft: 0, final: 0, fix: 0, legacy: 0 };
  for (const e of exams) for (const f of HOME_FILTERS) if (matchesFilter(e, f.key)) out[f.key] += 1;
  return out;
}
