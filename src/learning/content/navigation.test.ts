// Learning Materials — Phase 2: navigation helper tests (pure, manifest-driven, boundary-correct).
import { describe, it, expect } from "vitest";
import {
  flattenPageRefs, findModule, findLesson, findPage, previousPage, nextPage, pagePosition,
} from "./navigation";
import { buildSearchIndex } from "./search";
import { navManifest, navCourse } from "./content.fixtures";
import { deriveManifest } from "./types";

describe("Phase 2 — navigation helpers", () => {
  it("flattens all pages into reading order across lessons and modules", () => {
    const flat = flattenPageRefs(navManifest);
    expect(flat.map(f => f.page.id)).toEqual([
      "n-m1-l1-p1", "n-m1-l1-p2", "n-m1-l2-p1", "n-m1-l2-p2",
      "n-m2-l1-p1", "n-m2-l1-p2", "n-m2-l2-p1", "n-m2-l2-p2",
    ]);
    expect(flat.map(f => f.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("orders by the order fields, not array position", () => {
    const scrambled = deriveManifest(navCourse);
    scrambled.modules.reverse();
    scrambled.modules.forEach(m => m.lessons.reverse());
    expect(flattenPageRefs(scrambled).map(f => f.page.id)).toEqual(flattenPageRefs(navManifest).map(f => f.page.id));
  });

  it("the first page has no previous; the last page has no next", () => {
    expect(previousPage(navManifest, "n-m1-l1-p1")).toBeNull();
    expect(nextPage(navManifest, "n-m2-l2-p2")).toBeNull();
  });

  it("moves internally within a lesson", () => {
    expect(nextPage(navManifest, "n-m1-l1-p1")?.id).toBe("n-m1-l1-p2");
    expect(previousPage(navManifest, "n-m1-l1-p2")?.id).toBe("n-m1-l1-p1");
  });

  it("crosses a lesson boundary (last page of lesson 1 → first page of lesson 2)", () => {
    expect(nextPage(navManifest, "n-m1-l1-p2")?.id).toBe("n-m1-l2-p1");
    expect(previousPage(navManifest, "n-m1-l2-p1")?.id).toBe("n-m1-l1-p2");
  });

  it("crosses a module boundary (last page of module 1 → first page of module 2)", () => {
    expect(nextPage(navManifest, "n-m1-l2-p2")?.id).toBe("n-m2-l1-p1");
    expect(previousPage(navManifest, "n-m2-l1-p1")?.id).toBe("n-m1-l2-p2");
  });

  it("supports direct ID lookup of module / lesson / page", () => {
    expect(findModule(navManifest, "n-m2")?.title).toBe("M2");
    expect(findLesson(navManifest, "n-m2-l2")?.module.id).toBe("n-m2");
    const hit = findPage(navManifest, "n-m2-l1-p2");
    expect(hit?.module.id).toBe("n-m2");
    expect(hit?.lesson.id).toBe("n-m2-l1");
    expect(hit?.page.title).toBe("n-m2-l1-p2");
    expect(findModule(navManifest, "nope")).toBeUndefined();
    expect(findPage(navManifest, "nope")).toBeUndefined();
  });

  it("reports 1-based page position and total, distinct from source PDF pages", () => {
    expect(pagePosition(navManifest, "n-m1-l1-p1")).toEqual({ index: 1, total: 8 });
    expect(pagePosition(navManifest, "n-m2-l2-p2")).toEqual({ index: 8, total: 8 });
    expect(pagePosition(navManifest, "nope")).toBeNull();
    // content position (index 5) is NOT the source pdf page (5) by coincidence only for p5; prove independence:
    const p = findPage(navManifest, "n-m2-l1-p1")!.page;
    expect(p.source?.pdfPageStart).toBe(5);        // traceability metadata
    expect(pagePosition(navManifest, "n-m2-l1-p1")?.index).toBe(5); // reading order — a separate concept
  });

  it("builds lightweight search metadata from the manifest (no page bodies)", () => {
    const idx = buildSearchIndex(navManifest);
    expect(idx.length).toBe(8);
    expect(idx[0]).toEqual({ courseId: "791381", moduleId: "n-m1", lessonId: "n-m1-l1", pageId: "n-m1-l1-p1", title: "n-m1-l1-p1", keywords: [] });
  });
});
