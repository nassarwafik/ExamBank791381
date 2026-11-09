// Shared types + pure helpers for the «المكتبة الرسمية» exam-library source in the assignments page (the 791381 exams and, since
// 899371 P7, the C# coding lab of 899371). The catalog is small (36 + 11 items) and served whole by GET /api/exam-library, so filtering/search is
// done client-side here rather than via a search endpoint.

export type LibraryCatalogItem = {
  libraryItemId: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  questionCount: number;
  totalMarks: number;
  conversionStatus: "ready" | "needs_review" | "unsupported";
  publishable: boolean;
  autoGradableCount?: number;
  manualReviewCount?: number;
};

// Arabic labels for the catalog's category codes (from Book791381's index.html data-group values).
export const CATEGORY_LABELS: Record<string, string> = {
  foundation: "الأساسيات",
  infra: "البنى التحتية",
  comprehensive: "الشامل",
  advanced: "إضافية",
  final: "النهائي",
  "coding-899371": "مختبر البرمجة · أسس علم الحاسوب"   // 899371 P7: runner-graded C# questions (docs/enterprise-899371-learning-plan.md §20)
};

export function categoryLabel(code: string): string {
  return CATEGORY_LABELS[code] || code || "";
}

// Distinct categories present in a catalog, in a stable, meaningful order (matching the source
// index's own ordering), so the filter chips don't jump around between loads.
const CATEGORY_ORDER = ["foundation", "infra", "comprehensive", "advanced", "final", "coding-899371"];

export function catalogCategories(catalog: LibraryCatalogItem[]): string[] {
  const present = new Set(catalog.map(item => item.category).filter(Boolean));
  return CATEGORY_ORDER.filter(code => present.has(code));
}

// Filters by category (empty = all) and a free-text search over id/title/tags/description. Search is
// accent/case-insensitive-ish via simple lowercasing + trimming; the catalog is tiny so this is
// plenty. Never mutates the input.
export function filterLibraryCatalog(
  catalog: LibraryCatalogItem[],
  { search = "", category = "" }: { search?: string; category?: string } = {}
): LibraryCatalogItem[] {
  const term = search.trim().toLowerCase();
  return catalog.filter(item => {
    if (category && item.category !== category) return false;
    if (!term) return true;
    const haystack = [
      item.libraryItemId,
      item.title,
      item.description,
      ...(Array.isArray(item.tags) ? item.tags : [])
    ].join(" ").toLowerCase();
    return haystack.includes(term);
  });
}
