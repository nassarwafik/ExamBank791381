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

describe("Phase 3E — historical module ids, titles and source mappings are IMMUTABLE; `order` is the sequencing authority", () => {
  const byId = Object.fromEntries(manifest.modules.map(m => [m.id, m]));

  it("keeps every pre-existing module id (m01–m06) and adds Unit 3 as the next free id m07 — nothing renamed/repurposed", () => {
    expect(manifest.modules.map(m => m.id)).toEqual([
      "791381-m01", "791381-m02", "791381-m07", "791381-m03", "791381-m04", "791381-m05", "791381-m06",
    ]);
    expect(manifest.modules.map(m => m.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(byId["791381-m07"].order).toBe(3);          // the book's Unit 3 reads third …
    expect(byId["791381-m03"].order).toBe(4);          // … and the historical m03 skeleton merely shifts to 4
  });

  it("pins the historical m03–m06 skeleton titles and PDF source mappings exactly (id ≠ unit number ≠ position)", () => {
    const pages = (id: string) => byId[id].lessons.flatMap(l => l.pages.map(p => [p.id, p.title, p.source!.pdfPageStart, p.source!.printedPage]));
    expect(byId["791381-m03"].title).toBe("برمجة السويتش CLI و VLAN");
    expect(pages("791381-m03")).toEqual([
      ["791381-m03-l01-p01", "منافذ السويتش", 123, 121],
      ["791381-m03-l01-p02", "برمجة المنافذ من CLI", 124, 122],
    ]);
    expect(byId["791381-m04"].title).toBe("Trunk و Router on a Stick");
    expect(pages("791381-m04")).toEqual([["791381-m04-l01-p01", "أوامر Trunk", 148, 146]]);
    expect(byId["791381-m05"].title).toBe("مرجع أوامر Cisco");
    expect(pages("791381-m05")).toEqual([
      ["791381-m05-l01-p01", "أوامر أساسية للجهاز", 193, 191],
      ["791381-m05-l01-p02", "أوامر VLAN و Trunk", 194, 192],
    ]);
    expect(byId["791381-m06"].title).toBe("قوائم التحكم ACL");
    expect(pages("791381-m06")).toEqual([["791381-m06-l01-p01", "Extended ACL", 227, 225]]);
    // m01 / m02 identities are unchanged too (their page ids are pinned by the 3B/3C/3D tests)
    expect(byId["791381-m01"].title).toBe("أساسيات الشبكات");
    expect(byId["791381-m02"].title).toBe("الأعداد والموازين");
  });

  it("b1 now lists Unit 3 (m07) after m02; the batch id/label and the other batch mappings are unchanged", () => {
    const batches = Object.fromEntries(manifest.batches!.map(b => [b.id, b]));
    expect(batches.b1.label).toBe("الأساسيات · الأعداد · IP");
    expect(batches.b1.moduleIds).toEqual(["791381-m01", "791381-m02", "791381-m07"]);
    expect(batches.b4.moduleIds).toEqual(["791381-m03", "791381-m04", "791381-m05"]);   // CLI/VLAN NOT moved into b1
    expect(batches.b6.moduleIds).toEqual(["791381-m06"]);
  });
});

function expectStrictlyOrdered(orders: number[]) {
  const sorted = [...orders].sort((a, b) => a - b);
  expect(orders).toEqual(sorted);                 // authored in order
  expect(new Set(orders).size).toBe(orders.length); // no duplicate sibling order
}
