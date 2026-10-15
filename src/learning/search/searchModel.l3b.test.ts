// Phase 21E L3-B — the search view model: grouping, highlighting, L3-2 spelling variants and the release boundary
// (the index of a student is built from the RESTRICTED manifest and searched with the explicit release set).
import { describe, expect, it } from "vitest";
import manifest from "../content/791381/manifest";
import { filterManifestByModuleIds } from "../content/filterManifest";
import { buildSearchIndex } from "../content/search";
import type { SearchProvider } from "../content/searchProvider";
import { highlightSegments, prepareSources, searchGrouped, searchTerms, type SearchSource } from "./searchModel";

const course = manifest.courseId;
const all: SearchSource = { courseId: course, courseTitle: "كتاب " + course, manifest, allowedModuleIds: "all" };
const ids = (groups: ReturnType<typeof searchGrouped>) => groups.flatMap(c => c.modules.flatMap(m => m.lessons.flatMap(l => l.hits.map(h => h.pageId))));

describe("L3-B searchGrouped — module → lesson in reading order", () => {
  it("groups hits by module then lesson, in reading order, with ordinals and totals from the source manifest", () => {
    const groups = searchGrouped(prepareSources([all]), "الشبكة");
    expect(groups).toHaveLength(1);
    const hits = groups[0].modules.flatMap(m => m.lessons.flatMap(l => l.hits));
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.map(h => h.ordinal)).toEqual([...hits.map(h => h.ordinal)].sort((a, b) => a - b));
    expect(hits.every(h => h.total === 248)).toBe(true);
    for (const m of groups[0].modules) {
      const mod = manifest.modules.find(x => x.id === m.moduleId)!;
      expect(m.moduleTitle).toBe(mod.title);
      for (const l of m.lessons) expect(l.lessonTitle).toBe(mod.lessons.find(x => x.id === l.lessonId)!.title);
    }
    expect(groups[0].count).toBe(hits.length);
  });

  it("a blank query returns nothing", () => {
    expect(searchGrouped(prepareSources([all]), "   ")).toEqual([]);
    expect(searchTerms(" ؟ ")).toEqual([]);
  });

  it("names the matched keyword when the match is a keyword", () => {
    const withKw = buildSearchIndex(manifest).find(e => e.keywords.length && !e.title.toLowerCase().includes(e.keywords[0].toLowerCase()))!;
    const groups = searchGrouped(prepareSources([all]), withKw.keywords[0]);
    const hit = groups.flatMap(c => c.modules.flatMap(m => m.lessons.flatMap(l => l.hits))).find(h => h.pageId === withKw.pageId)!;
    expect(hit.matchedField).toBe("keyword");
    expect(hit.keyword).toBe(withKw.keywords[0]);
  });
});

describe("L3-2 — Arabic spelling variants return the same result set (≥ 10 pairs, through the UI model)", () => {
  const pairs: [string, string][] = [
    ["الشبكة", "الشبكه"], ["الشبكة", "الشَّبكة"], ["الشبكة", "الشـبكة"], ["الشبكة", "الشبكة؟"], ["الأجهزة", "الاجهزه"],
    ["إعداد", "اعداد"], ["الآمنة", "الامنه"], ["مبنى", "مبني"], ["إدارة", "اداره"], ["خلاصة", "خلاصه"],
    ["الشبكات", "الشَّبَكَاتُ"], ["الأمان", "الامان"],
  ];
  const prepared = prepareSources([all]);
  it.each(pairs)("«%s» and «%s»", (a, b) => {
    const base = ids(searchGrouped(prepared, a));
    expect(base.length, "each pair must find real pages (no vacuous equality)").toBeGreaterThan(0);
    expect(ids(searchGrouped(prepared, b))).toEqual(base);
  });
  it("the canonical four forms of «الشبكة» find results (not a vacuous equality)", () => {
    expect(ids(searchGrouped(prepared, "الشبكة")).length).toBeGreaterThan(0);
  });
});

describe("L3-B release boundary in the view model", () => {
  const released = [manifest.modules[0].id, manifest.modules[2].id];
  const restricted = filterManifestByModuleIds(manifest, released);
  const student: SearchSource = { courseId: course, courseTitle: "", manifest: restricted, allowedModuleIds: new Set(released) };

  it("a student's index is the restricted manifest: every hidden page's title and keywords return 0 hidden hits", () => {
    const prepared = prepareSources([student]);
    const hidden = buildSearchIndex(manifest).filter(e => !released.includes(e.moduleId));
    for (const e of hidden) for (const q of [e.title, ...e.keywords]) {
      for (const h of searchGrouped(prepared, q).flatMap(c => c.modules)) expect(released).toContain(h.moduleId);
    }
  });

  it("defence in depth: a provider that ignores the scope still cannot surface a page outside the source manifest or release set", () => {
    const leaky = (): SearchProvider => ({
      query: () => buildSearchIndex(manifest).map(e => ({ courseId: e.courseId, moduleId: e.moduleId, lessonId: e.lessonId, pageId: e.pageId, title: e.title, matchedField: "title" as const })),
    });
    const hits = searchGrouped(prepareSources([student], leaky), "anything").flatMap(c => c.modules);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(m => released.includes(m.moduleId))).toBe(true);
    // and with the full manifest but an explicit release set, the set still applies
    const hits2 = searchGrouped(prepareSources([{ ...student, manifest }], leaky), "anything").flatMap(c => c.modules);
    expect(hits2.every(m => released.includes(m.moduleId))).toBe(true);
  });

  it("a malformed release set returns nothing", () => {
    const bad = { ...student, allowedModuleIds: undefined as unknown as "all" };
    expect(searchGrouped(prepareSources([bad]), "الشبكة")).toEqual([]);
  });
});

describe("L3-B highlightSegments — accessible highlighting on the ORIGINAL text", () => {
  const marked = (text: string, q: string) => highlightSegments(text, searchTerms(q)).filter(s => s.match).map(s => s.text);
  it("highlights the original characters for a normalized match", () => {
    expect(marked("الشَّبكة المحلية", "الشبكه")).toEqual(["الشَّبكة"]);
    expect(marked("أجهزة الشبكة", "اجهزه")).toEqual(["أجهزة"]);
    expect(marked("Router الموجّه", "router")).toEqual(["Router"]);
  });
  it("highlights every term and keeps the text unchanged", () => {
    const segs = highlightSegments("طبقات نموذج OSI السبع", searchTerms("نموذج osi"));
    expect(segs.map(s => s.text).join("")).toBe("طبقات نموذج OSI السبع");
    expect(segs.filter(s => s.match).map(s => s.text)).toEqual(["نموذج", "OSI"]);
  });
  it("no terms → one plain segment", () => {
    expect(highlightSegments("الشبكة", [])).toEqual([{ text: "الشبكة", match: false }]);
  });
});
