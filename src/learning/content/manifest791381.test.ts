// Learning Materials — Phase 2: the 791381 content manifest (skeleton TOC) — structural integrity + catalog link.
import { describe, it, expect } from "vitest";
import manifest from "./791381/manifest";
import { flattenPageRefs, previousPage, nextPage, pagePosition } from "./navigation";
import { findLearningCourse } from "../catalog";
import { LEARNING_CONTENT_SCHEMA_VERSION } from "./types";

describe("Phase 2 — 791381 content manifest", () => {
  it("connects to the Phase-1 catalog course and declares rtl direction + current schema version", () => {
    expect(manifest.courseId).toBe("791381");
    expect(findLearningCourse(manifest.courseId)).toBeTruthy();
    expect(manifest.direction).toBe("rtl");
    expect(manifest.schemaVersion).toBe(LEARNING_CONTENT_SCHEMA_VERSION);
  });

  it("has globally-unique, stable, prefix-scoped ids and valid orders (no duplicates among siblings)", () => {
    const ids = new Set<string>();
    const dup = (id: string) => { expect(ids.has(id), id).toBe(false); ids.add(id); };
    expectStrictlyOrdered(manifest.modules.map(m => m.order));
    for (const m of manifest.modules) {
      dup(m.id);
      expect(m.id.startsWith("791381-m")).toBe(true);
      expectStrictlyOrdered(m.lessons.map(l => l.order));
      for (const l of m.lessons) {
        dup(l.id);
        expect(l.id.startsWith(m.id + "-l")).toBe(true);
        expectStrictlyOrdered(l.pages.map(p => p.order));
        for (const p of l.pages) {
          dup(p.id);
          expect(p.id.startsWith(l.id + "-p")).toBe(true);
          expect(p.title.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("records a valid PDF source page for every skeleton page (traceability), all bound to this course id", () => {
    for (const { page } of flattenPageRefs(manifest)) {
      expect(page.source?.kind).toBe("book");
      // OWNER §20 — every source id must equal the manifest course id (no cross-book leakage in the skeleton)
      expect(page.source?.sourceId).toBe(manifest.courseId);
      expect(Number.isInteger(page.source?.pdfPageStart) && (page.source?.pdfPageStart ?? 0) >= 1).toBe(true);
    }
  });

  it("is navigable end-to-end (first has no previous, last has no next, positions are 1-based)", () => {
    const flat = flattenPageRefs(manifest);
    expect(flat.length).toBeGreaterThan(1);
    expect(previousPage(manifest, flat[0].page.id)).toBeNull();
    expect(nextPage(manifest, flat[flat.length - 1].page.id)).toBeNull();
    expect(pagePosition(manifest, flat[0].page.id)).toEqual({ index: 1, total: flat.length });
  });

  it("preserves all six Phase-1 batch identities and validates every populated module mapping", () => {
    const course = findLearningCourse("791381")!;
    const batches = manifest.batches!;
    // same six batch ids + labels as the Phase-1 catalog overview (presentation stays in sync)
    expect(batches.map(b => b.id)).toEqual(course.overviewBatches.map(b => b.id));
    expect(batches.map(b => b.label)).toEqual(course.overviewBatches.map(b => b.label));
    // every referenced module id exists; at least one batch maps to MULTIPLE modules (proves batch ≠ module).
    // Empty mappings are allowed: the manifest is a PARTIAL skeleton, so a batch whose book sections are not yet
    // converted carries no module ids for now (not "the batch is empty in the book").
    const moduleIds = new Set(manifest.modules.map(m => m.id));
    for (const b of batches) for (const mid of b.moduleIds) expect(moduleIds.has(mid)).toBe(true);
    expect(batches.some(b => b.moduleIds.length > 1)).toBe(true);
  });

  it("declares the EIGHT Phase-3 sections in the exact owner order, with intro/summary not yet mapped", () => {
    expect(manifest.batches!.map(b => b.id)).toEqual(["intro", "b1", "b2", "b3", "b4", "b5", "b6", "summary"]);
    expect(manifest.batches!.map(b => b.label)).toEqual([
      "المقدمة", "الأساسيات · الأعداد · IP", "الأجهزة والرسائل", "النماذج والبروتوكولات والأمان",
      "برمجة السويتش و VLAN", "الأمان · Wi-Fi · IPv6 · DHCP", "ACL · التوجيه · WAN", "التلخيص",
    ]);
    const byId = Object.fromEntries(manifest.batches!.map(b => [b.id, b.moduleIds]));
    expect(byId.intro).toEqual([]);   // not yet represented in interactive content (NOT empty in the book)
    expect(byId.summary).toEqual([]);
  });
});

function expectStrictlyOrdered(orders: number[]) {
  const sorted = [...orders].sort((a, b) => a - b);
  expect(orders).toEqual(sorted);                 // authored in order
  expect(new Set(orders).size).toBe(orders.length); // no duplicate sibling order
}
