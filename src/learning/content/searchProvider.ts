import type { SearchEntry } from "./search";

/** A result contains public manifest metadata only, never page bodies or answer keys. */
export interface SearchResult {
  courseId: string;
  moduleId: string;
  lessonId: string;
  pageId: string;
  title: string;
  matchedField: "title" | "keyword";
  snippet?: string;
}

export interface SearchScope {
  courseId: string;
  /** Required for student callers: derive from the existing authorized release list. */
  allowedModuleIds?: ReadonlySet<string>;
}

export interface SearchProvider {
  query(text: string, scope: SearchScope): SearchResult[];
}

/** Normalize Arabic spelling for search, without modifying original titles. */
export function normalizeSearchText(text: string): string {
  return text.normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/\s+/g, " ").trim();
}

/** Lightweight, deterministic title/keyword index; never imports content bodies. */
export function createTitleKeywordSearchProvider(entries: readonly SearchEntry[]): SearchProvider {
  const index = entries.map(entry => ({
    entry, title: normalizeSearchText(entry.title),
    keywords: entry.keywords.map(normalizeSearchText),
  }));
  return {
    query(text, scope) {
      const terms = normalizeSearchText(text).split(" ").filter(Boolean);
      if (!terms.length || !scope.courseId) return [];
      const results: SearchResult[] = [];
      for (const { entry, title, keywords } of index) {
        // Restrict candidates BEFORE title/keyword matching and result creation.
        if (entry.courseId !== scope.courseId) continue;
        if (scope.allowedModuleIds && !scope.allowedModuleIds.has(entry.moduleId)) continue;
        const matchedTitle = terms.every(term => title.includes(term));
        const matchedAny = terms.every(term => title.includes(term) || keywords.some(k => k.includes(term)));
        if (!matchedAny) continue;
        results.push({
          courseId: entry.courseId,
          moduleId: entry.moduleId,
          lessonId: entry.lessonId,
          pageId: entry.pageId,
          title: entry.title,
          matchedField: matchedTitle ? "title" : "keyword",
        });
      }
      return results;
    },
  };
}
