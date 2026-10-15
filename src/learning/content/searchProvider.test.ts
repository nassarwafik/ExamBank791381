import { describe, expect, it } from "vitest";
import { createTitleKeywordSearchProvider, normalizeSearchText, type SearchProvider } from "./searchProvider";
import type { SearchEntry } from "./search";

const entries: SearchEntry[] = [
  { courseId: "791381", moduleId: "m1", lessonId: "l1", pageId: "p1", title: "الشبكة المحلية", keywords: ["LAN", "أمان"] },
  { courseId: "791381", moduleId: "m2", lessonId: "l2", pageId: "p2", title: "الشبكة اللاسلكية", keywords: ["WiFi", "اتصال"] },
  { courseId: "791381", moduleId: "m3", lessonId: "l3", pageId: "p3", title: "أجهزة الشبكة", keywords: ["Router", "بوابة"] },
  { courseId: "other", moduleId: "m4", lessonId: "l4", pageId: "p4", title: "الشبكة المخفية", keywords: ["LAN"] },
];
const provider = createTitleKeywordSearchProvider(entries);
const scope = (ids: string[]) => ({ courseId: "791381", allowedModuleIds: new Set(ids) });

describe("L3-A title/keyword search provider", () => {
  it.each([
    ["الشبكة", "الشبكه"], ["الشبكة", "الشَّبكة"], ["الشبكة", "الشـبكة"],
    ["أمان", "امان"], ["إتصال", "اتصال"], ["آلات", "الات"],
    ["فتى", "فتي"], ["مَدْرَسَة", "مدرسه"], ["إلى", "الي"],
    ["تَعْلِيم", "تعليم"], ["الـشبكة", "الشبكه"],
  ])("normalizes %s / %s the same", (a, b) => {
    expect(normalizeSearchText(a)).toBe(normalizeSearchText(b));
  });
  it("finds the same pages for Arabic spelling variants", () => {
    for (const q of ["الشبكة", "الشبكه", "الشَّبكة", "الشـبكة"]) {
      expect(provider.query(q, scope(["m1", "m2", "m3"])).map(r => r.pageId))
        .toEqual(["p1", "p2", "p3"]);
    }
  });
  it("leaks no unreleased page for three release sets across titles and keywords", () => {
    for (const ids of [[], ["m1"], ["m1", "m3"]]) {
      const allowed = new Set(ids);
      for (const entry of entries.filter(e => e.courseId === "791381")) {
        for (const q of [entry.title, ...entry.keywords]) {
          expect(provider.query(q, { courseId: "791381", allowedModuleIds: allowed })
            .every(result => allowed.has(result.moduleId))).toBe(true);
        }
      }
    }
  });
  it("never crosses course boundary, and blank queries return no results", () => {
    expect(provider.query("الشبكة المخفية", scope(["m4"]))).toEqual([]);
    expect(provider.query("   ", scope(["m1"]))).toEqual([]);
  });
  it("matches keywords while preserving the canonical page identity", () => {
    expect(provider.query("router", scope(["m3"]))).toEqual([{
      courseId: "791381", moduleId: "m3", lessonId: "l3", pageId: "p3",
      title: "أجهزة الشبكة", matchedField: "keyword",
    }]);
  });
  it("supports swapping providers via the same consumer interface", () => {
    const alternate: SearchProvider = {
      query: () => [{ courseId: "791381", moduleId: "m1", lessonId: "l1",
        pageId: "p1", title: "stub", matchedField: "title", snippet: "future full-text" }],
    };
    const consumer = (p: SearchProvider) => p.query("anything", scope(["m1"]));
    expect(consumer(alternate)[0].snippet).toBe("future full-text");
    expect(consumer(provider)).toEqual([]);
  });
});
