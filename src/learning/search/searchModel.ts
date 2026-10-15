// Phase 21E L3-B — the search view model shared by the Reader search and the teacher library search.
//
// Pure helpers over the L3-A `SearchProvider`: they build a per-course index from a manifest (titles + keywords only,
// never a page body), group a provider's results by module → lesson in reading order, and split a title into
// highlighted / plain segments for the matched terms. Grouping titles come from the SAME manifest the index was built
// from — for a student that manifest is already restricted to the released modules — so a result can never carry
// the title of a module or lesson the caller could not see.

import { buildSearchIndex } from "../content/search";
import { flattenPageRefs } from "../content/navigation";
import type { LearningCourseManifest } from "../content/types";
import { createTitleKeywordSearchProvider, normalizeSearchText, type SearchProvider, type SearchResult, type SearchScope } from "../content/searchProvider";
import type { SearchEntry } from "../content/search";

/** Builds a provider from index entries. The default is the L3-A title/keyword provider; a later full-text provider
 *  plugs in here without any UI change (L3-7). */
export type SearchProviderFactory = (entries: readonly SearchEntry[]) => SearchProvider;
export const defaultSearchProviderFactory: SearchProviderFactory = createTitleKeywordSearchProvider;

/** One searchable course: its (caller-visible) manifest and the explicit release set for this caller. */
export type SearchSource = {
  courseId: string;
  courseTitle: string;
  manifest: LearningCourseManifest;
  /** Explicit, fail-closed release set (see `SearchScope`): a Set for students, "all" for an authorized teacher. */
  allowedModuleIds: SearchScope["allowedModuleIds"];
};

export type SearchHit = SearchResult & { ordinal: number; total: number; keyword?: string };
export type LessonGroup = { lessonId: string; lessonTitle: string; hits: SearchHit[] };
export type ModuleGroup = { moduleId: string; moduleTitle: string; lessons: LessonGroup[] };
export type CourseGroup = { courseId: string; courseTitle: string; modules: ModuleGroup[]; count: number };

type PreparedSource = {
  source: SearchSource;
  provider: SearchProvider;
  keywordsByPage: Map<string, string[]>;
  order: Map<string, { ordinal: number; moduleTitle: string; lessonTitle: string }>;
  total: number;
};

/** Index each source once (titles and keywords only). */
export function prepareSources(sources: readonly SearchSource[], factory: SearchProviderFactory = defaultSearchProviderFactory): PreparedSource[] {
  return sources.map(source => {
    const entries = buildSearchIndex(source.manifest);
    const refs = flattenPageRefs(source.manifest);
    return {
      source,
      provider: factory(entries),
      keywordsByPage: new Map(entries.map(e => [e.pageId, e.keywords])),
      order: new Map(refs.map(r => [r.page.id, { ordinal: r.index + 1, moduleTitle: r.module.title, lessonTitle: r.lesson.title }])),
      total: refs.length,
    };
  });
}

/** Query every source and group the hits course → module → lesson, in reading order. A hit whose page is not in the
 *  source's own manifest is dropped (a provider can never surface a page the caller's manifest does not contain). */
export function searchGrouped(prepared: readonly PreparedSource[], query: string): CourseGroup[] {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const out: CourseGroup[] = [];
  for (const p of prepared) {
    const raw = p.provider.query(query, { courseId: p.source.courseId, allowedModuleIds: p.source.allowedModuleIds });
    const hits: SearchHit[] = [];
    for (const r of raw) {
      const at = p.order.get(r.pageId);
      if (!at || r.courseId !== p.source.courseId) continue;
      const allowed = p.source.allowedModuleIds;
      if (allowed !== "all" && !(allowed instanceof Set && allowed.has(r.moduleId))) continue;   // defence in depth
      const keyword = r.matchedField === "keyword" ? (p.keywordsByPage.get(r.pageId) ?? []).find(k => terms.some(t => normalizeSearchText(k).includes(t))) : undefined;
      hits.push({ ...r, ordinal: at.ordinal, total: p.total, keyword });
    }
    hits.sort((a, b) => a.ordinal - b.ordinal);
    const modules: ModuleGroup[] = [];
    for (const h of hits) {
      const at = p.order.get(h.pageId)!;
      let m = modules[modules.length - 1];
      if (!m || m.moduleId !== h.moduleId) { m = { moduleId: h.moduleId, moduleTitle: at.moduleTitle, lessons: [] }; modules.push(m); }
      let l = m.lessons[m.lessons.length - 1];
      if (!l || l.lessonId !== h.lessonId) { l = { lessonId: h.lessonId, lessonTitle: at.lessonTitle, hits: [] }; m.lessons.push(l); }
      l.hits.push(h);
    }
    if (hits.length) out.push({ courseId: p.source.courseId, courseTitle: p.source.courseTitle, modules, count: hits.length });
  }
  return out;
}

/** The normalized, non-empty terms of a query (the same normalization the index uses). */
export function searchTerms(query: string): string[] {
  return normalizeSearchText(query).split(" ").filter(Boolean);
}

export type HighlightSegment = { text: string; match: boolean };

/**
 * Split `text` into plain / matched segments for the normalized `terms`. Matching runs on a per-character normalized
 * copy that keeps a map back to the original string, so a diacritised or hamza-variant title («الشَّبكة») highlights
 * its original characters for the query «الشبكه». Pure; never changes the displayed text.
 */
export function highlightSegments(text: string, terms: readonly string[]): HighlightSegment[] {
  if (!text) return [];
  const norm: string[] = [];
  const src: number[] = [];
  const chars = Array.from(text);
  let offset = 0;
  for (const ch of chars) {
    const n = normalizeSearchText(ch);
    const piece = n === "" && /[\s\p{P}]/u.test(ch) ? " " : n;
    for (const c of piece) { norm.push(c); src.push(offset); }
    offset += ch.length;
  }
  const flat = norm.join("");
  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    for (;;) {
      const i = flat.indexOf(term, from);
      if (i < 0) break;
      const start = src[i];
      const lastSrc = src[i + term.length - 1];
      const end = lastSrc + (chars[charIndexAt(chars, lastSrc)]?.length ?? 1);
      for (let k = start; k < end; k++) marked[k] = true;
      from = i + 1;
    }
  }
  // Combining marks and tatweel that follow a matched letter belong to it (the normalization dropped them), so a mark is
  // never split from its letter across a <mark> boundary.
  for (let k = 1; k < text.length; k++) if (!marked[k] && marked[k - 1] && isDroppedMark(text[k])) marked[k] = true;
  const segments: HighlightSegment[] = [];
  for (let k = 0; k < text.length; k++) {
    const m = marked[k];
    const last = segments[segments.length - 1];
    if (last && last.match === m) last.text += text[k];
    else segments.push({ text: text[k], match: m });
  }
  return segments;
}

function charIndexAt(chars: string[], codeUnitOffset: number): number {
  let o = 0;
  for (let i = 0; i < chars.length; i++) { if (o === codeUnitOffset) return i; o += chars[i].length; }
  return chars.length - 1;
}
function isDroppedMark(ch: string): boolean {
  return /[ً-ٰٟۖ-ۭـ]/.test(ch);
}
