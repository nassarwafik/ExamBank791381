// Learning Materials — Course-Overview section navigation. Proves the authoritative section → first-canonical-page
// mapping used by the Course Overview: `batchFirstPageId` resolves an overview "batch" (a presentation section
// spanning one or more modules) to the FIRST page of its earliest module BY READING ORDER (module.order →
// lesson.order → page.order), never by module-id numeric suffix or array position. It also pins the real 791381
// mapping (all eight owner-approved sections) so a manifest reorder can never silently change a shortcut's target.
import { describe, it, expect } from "vitest";
import { batchFirstPageId, flattenPageRefs, findPage } from "./navigation";
import type { LearningCourseManifest } from "./types";
import manifest791381 from "./791381/manifest";
import { LEARNING_COURSES } from "../catalog";

// A synthetic manifest whose id suffixes deliberately DISAGREE with reading order, so the test proves the helper
// follows `order`, not the id number or the array position. Module "m9" (order 1) reads before "m1" (order 2).
const synthetic: LearningCourseManifest = {
  schemaVersion: 1, courseId: "T", title: "t", direction: "rtl",
  modules: [
    { id: "m1", title: "second", order: 2, lessons: [
      { id: "m1-l1", title: "l", order: 1, pages: [{ id: "m1-l1-p1", title: "p", order: 1 }] },
    ] },
    { id: "m9", title: "first", order: 1, lessons: [
      { id: "m9-l2", title: "later lesson", order: 2, pages: [{ id: "m9-l2-p1", title: "p", order: 1 }] },
      { id: "m9-l1", title: "earlier lesson", order: 1, pages: [
        { id: "m9-l1-p2", title: "p", order: 2 }, { id: "m9-l1-p1", title: "p", order: 1 },
      ] },
    ] },
  ],
  batches: [
    { id: "empty", label: "no modules", moduleIds: [] },
    { id: "multi", label: "spans both", moduleIds: ["m1", "m9"] },     // earliest by order is m9 → its first page
    { id: "single", label: "one module", moduleIds: ["m1"] },
  ],
};

describe("batchFirstPageId — reading-order authority (pure)", () => {
  it("a batch resolves to the FIRST page (by order) of its earliest-order module — not the first listed id", () => {
    // m9 (order 1) precedes m1 (order 2); m9-l1 (order 1) precedes m9-l2; m9-l1-p1 (order 1) precedes p2.
    expect(batchFirstPageId(synthetic, "multi")).toBe("m9-l1-p1");
    expect(batchFirstPageId(synthetic, "single")).toBe("m1-l1-p1");
  });

  it("a batch with no modules → null (caller falls back to the book's canonical beginning)", () => {
    expect(batchFirstPageId(synthetic, "empty")).toBeNull();
  });

  it("an unknown batch id → null", () => {
    expect(batchFirstPageId(synthetic, "does-not-exist")).toBeNull();
  });
});

describe("batchFirstPageId — authoritative 791381 overview mapping", () => {
  // The catalog's visible overview sections and the manifest's batches must describe EXACTLY the same eight
  // sections, in the same order — otherwise a Course-Overview row could have no destination (or a wrong one).
  it("the manifest batches and the catalog overview sections are exactly the same eight ids, in order", () => {
    const catalogIds = LEARNING_COURSES[0].overviewBatches.map(b => b.id);
    const manifestIds = (manifest791381.batches ?? []).map(b => b.id);
    expect(catalogIds).toEqual(["intro", "b1", "b2", "b3", "b4", "b5", "b6", "summary"]);
    expect(manifestIds).toEqual(catalogIds);
  });

  it("each section maps to its authoritative first canonical page (intro has none → book beginning)", () => {
    const expected: Record<string, string | null> = {
      intro: null,                        // no dedicated module → the Reader opens the book's first page (m01-l00-p01)
      b1: "791381-m01-l00-p01",           // = the book's canonical beginning
      b2: "791381-m09-l00-p01",
      b3: "791381-m13-l01-p01",
      b4: "791381-m03-l01-p03",           // m03 by reading order (NOT m19/m04); m03-l01's FIRST page by order is p03 (pdf 121), not the historical p01 id
      b5: "791381-m20-l01-p01",
      b6: "791381-m25-l01-p01",
      summary: "791381-m28-l01-p01",
    };
    for (const [batchId, pageId] of Object.entries(expected)) {
      expect(batchFirstPageId(manifest791381, batchId), batchId).toBe(pageId);
    }
  });

  it("every resolved destination is a real canonical page, and the seven concrete ones are unique", () => {
    const ids = LEARNING_COURSES[0].overviewBatches.map(b => b.id);
    const resolved = ids.map(id => batchFirstPageId(manifest791381, id));
    // Every non-null destination is a real page in the manifest.
    for (const pageId of resolved) if (pageId) expect(findPage(manifest791381, pageId), pageId).toBeTruthy();
    // The seven concrete destinations (all but intro) are unique.
    const concrete = resolved.filter((p): p is string => p !== null);
    expect(concrete.length).toBe(7);
    expect(new Set(concrete).size).toBe(7);
  });

  it("intro (null) and b1 both open the book's very first page in reading order (owner decision)", () => {
    const bookStart = flattenPageRefs(manifest791381)[0].page.id;
    expect(bookStart).toBe("791381-m01-l00-p01");
    expect(batchFirstPageId(manifest791381, "intro")).toBeNull();   // null → Reader fallback → bookStart
    expect(batchFirstPageId(manifest791381, "b1")).toBe(bookStart); // b1 explicitly resolves to the same page
  });
});
