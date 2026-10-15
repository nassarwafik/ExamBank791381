// Phase 21E L3-A — Review Fix 1 regressions for the title/keyword search provider.
//
// F1 (release filter failed OPEN): `allowedModuleIds` was optional, so a scope that forgot it searched EVERY module of the
//    course — the opposite of the student boundary's default-deny (`createRestrictedReaderContentApi` takes a required
//    list). The scope now names its release set explicitly: a Set for students, the literal "all" for teacher-only
//    callers; anything else returns nothing. (Like the restricted API, this is an application-path filter over frontend
//    metadata, not asset confidentiality — which is exactly why it must not fail open.)
// F2 (search accuracy): sentence punctuation attached to a word («الشبكة؟», «الشبكة،», «"الشبكة"») and invisible
//    format characters (ZWNJ, RLM, Arabic letter mark) made a correct query match nothing.
// L3-1 over the REAL course: every title and keyword of every hidden page, against three release sets, returns 0 hidden
//    pages — with a positive control so an always-empty provider cannot pass.
import { describe, expect, it } from "vitest";
import manifest from "./791381/manifest";
import { buildSearchIndex } from "./search";
import { createTitleKeywordSearchProvider, normalizeSearchText, type SearchScope } from "./searchProvider";

const index = buildSearchIndex(manifest);
const provider = createTitleKeywordSearchProvider(index);
const course = manifest.courseId;
const moduleIds = manifest.modules.map(m => m.id);

describe("L3-A RF1 / F1 — the release filter fails closed", () => {
  it("a scope without a release set is a type error and returns no results at runtime", () => {
    // @ts-expect-error — the release set is required: a Set for students, "all" for teacher-only callers
    const missing: SearchScope = { courseId: course };
    expect(provider.query("الشبكة", missing)).toEqual([]);
    expect(provider.query("الشبكة", { courseId: course, allowedModuleIds: undefined } as unknown as SearchScope)).toEqual([]);
    expect(provider.query("الشبكة", { courseId: course, allowedModuleIds: null } as unknown as SearchScope)).toEqual([]);
    expect(provider.query("الشبكة", { courseId: course, allowedModuleIds: "everything" } as unknown as SearchScope)).toEqual([]);
  });

  it("teacher-only callers opt in to the whole course explicitly", () => {
    const all = provider.query("الشبكة", { courseId: course, allowedModuleIds: "all" });
    const viaSet = provider.query("الشبكة", { courseId: course, allowedModuleIds: new Set(moduleIds) });
    expect(all.length).toBeGreaterThan(0);
    expect(all).toEqual(viaSet);
  });

  it("an empty release set returns nothing", () => {
    expect(provider.query("الشبكة", { courseId: course, allowedModuleIds: new Set() })).toEqual([]);
  });
});

describe("L3-A RF1 / F2 — punctuation and invisible characters do not break a match", () => {
  it.each([
    ["الشبكة؟", "الشبكة"], ["الشبكة،", "الشبكة"], ["الشبكة؛", "الشبكة"], ["«الشبكة»", "الشبكة"], ["\"الشبكة\"", "الشبكة"],
    ["(الشبكة)", "الشبكة"], ["الشبكة!", "الشبكة"], ["الشبكة‌", "الشبكة"], ["‏الشبكة", "الشبكة"], ["؜الشبكة", "الشبكة"],
  ])("%s normalizes like %s", (a, b) => {
    expect(normalizeSearchText(a)).toBe(normalizeSearchText(b));
  });

  it("technical tokens keep their characters (index and query share one normalization)", () => {
    expect(normalizeSearchText("IPv4 192.168.1.0/24 Wi-Fi C++")).toBe("ipv4 192.168.1.0/24 wi-fi c++");
  });

  it("a question typed with «؟» finds the same pages as the bare word", () => {
    const scope: SearchScope = { courseId: course, allowedModuleIds: "all" };
    const bare = provider.query("الشبكة", scope).map(r => r.pageId);
    expect(bare.length).toBeGreaterThan(0);
    expect(provider.query("الشبكة؟", scope).map(r => r.pageId)).toEqual(bare);
  });
});

describe("L3-1 over the real course 791381 — 0 hidden pages for three release sets", () => {
  const releaseSets = [moduleIds.slice(0, 1), moduleIds.filter((_, i) => i % 2 === 0), moduleIds.slice(0, -1)];
  it.each(releaseSets.map(s => [s.length, s] as const))("release set of %i modules", (_n, released) => {
    const allowed = new Set(released);
    const scope: SearchScope = { courseId: course, allowedModuleIds: allowed };
    const hidden = index.filter(e => !allowed.has(e.moduleId));
    expect(hidden.length).toBeGreaterThan(0);
    let queries = 0;
    for (const page of hidden) {
      for (const q of [page.title, ...page.keywords]) {
        queries++;
        const leaked = provider.query(q, scope).filter(r => !allowed.has(r.moduleId));
        expect(leaked, `query «${q}»`).toEqual([]);
      }
    }
    expect(queries).toBeGreaterThan(hidden.length);
    // positive control: every released page is found by its own title
    for (const page of index.filter(e => allowed.has(e.moduleId))) {
      expect(provider.query(page.title, scope).map(r => r.pageId)).toContain(page.pageId);
    }
  });
});
