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
    expect(byId.summary).toEqual(["791381-m28"]);   // the final summary «الملخّص الشامل» (m28) fills the summary grouping
  });
});

describe("Phase 3E — historical module ids, titles and source mappings are IMMUTABLE; `order` is the sequencing authority", () => {
  const byId = Object.fromEntries(manifest.modules.map(m => [m.id, m]));

  it("keeps every pre-existing module id and adds the real Units 4–8, Batch 3, Batch 4, Batch 5 (m08–m18), Batch 7 (m19), Batch 8 (m20–m22), Batch 9 (m23–m24), Batch 10 (m25–m27) and the final summary (m28) as the next free ids — nothing renamed/repurposed", () => {
    expect(manifest.modules.map(m => m.id)).toEqual([
      "791381-m01", "791381-m02", "791381-m07", "791381-m08", "791381-m09", "791381-m10", "791381-m11", "791381-m12", "791381-m13", "791381-m14", "791381-m15", "791381-m16", "791381-m17", "791381-m18", "791381-m03", "791381-m19", "791381-m04", "791381-m20", "791381-m21", "791381-m22", "791381-m23", "791381-m24", "791381-m05", "791381-m25", "791381-m26", "791381-m27", "791381-m06", "791381-m28",
    ]);
    expect(manifest.modules.map(m => m.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]);
    expect(byId["791381-m07"].order).toBe(3);          // the book's Unit 3 reads third …
    expect(byId["791381-m08"].order).toBe(4);          // … Unit 4 fourth, Unit 5 fifth …
    expect(byId["791381-m09"].order).toBe(5);
    expect(byId["791381-m10"].order).toBe(6);
    expect(byId["791381-m11"].order).toBe(7);          // Units 7–8 phase: Unit 7 seventh, Unit 8 eighth …
    expect(byId["791381-m12"].order).toBe(8);
    expect(byId["791381-m13"].order).toBe(9);          // Batch 3: «نماذج الاتصال» ninth …
    expect(byId["791381-m14"].order).toBe(10);         // Batch 4: البروتوكولات, أوامر فحص الشبكة, المجالات والمفاهيم …
    expect(byId["791381-m15"].order).toBe(11);
    expect(byId["791381-m16"].order).toBe(12);
    expect(byId["791381-m17"].order).toBe(13);         // Batch 5: أمان الشبكات, تجزئة البيانات …
    expect(byId["791381-m18"].order).toBe(14);
    expect(byId["791381-m03"].order).toBe(15);         // … Batch 6 completed the historical m03 IN PLACE at order 15; the remaining skeletons follow
    expect(byId["791381-m19"].order).toBe(16);         // Batch 7: the VTP section is a NEW stable id (m19) placed by order before m04 …
    expect(byId["791381-m04"].order).toBe(17);         // … and the historical m04 was completed IN PLACE at order 17; the remaining skeletons follow
    expect(byId["791381-m20"].order).toBe(18);         // Batch 8: Wi-Fi (m20), IPv6 والمنافذ (m21), DHCP (m22) — new stable ids after m04 …
    expect(byId["791381-m21"].order).toBe(19);
    expect(byId["791381-m22"].order).toBe(20);
    expect(byId["791381-m23"].order).toBe(21);         // Batch 9: Port Security (m23), حماية أجهزة Cisco (m24) — new stable ids …
    expect(byId["791381-m24"].order).toBe(22);
    expect(byId["791381-m05"].order).toBe(23);         // … then the historical m05 completed IN PLACE, then the remaining m06 skeleton
    expect(byId["791381-m25"].order).toBe(24);         // Batch 10: مراجعة الأوامر, WAN, بروتوكولات التوجيه, then the historical m06 (ACL) completed in place
    expect(byId["791381-m26"].order).toBe(25);
    expect(byId["791381-m27"].order).toBe(26);
    expect(byId["791381-m06"].order).toBe(27);
    // the skeletons keep their ids, titles, lesson/page ids and PDF mappings (pinned below) — ONLY `order` moved
    for (const id of ["791381-m05", "791381-m06"]) expect(Object.keys(byId[id]).sort(), id).toEqual(["id", "lessons", "order", "shortTitle", "title"].filter(k => k in byId[id]).sort());
    for (const id of ["791381-m03", "791381-m19", "791381-m04", "791381-m20", "791381-m21", "791381-m22", "791381-m23", "791381-m24", "791381-m05"]) expect(Object.keys(byId[id]).sort(), id).toEqual(["id", "lessons", "order", "shortTitle", "title"]);   // completed modules: the same TOC shape, no `source` on the ModuleRef
  });

  it("pins the historical m03 / m04 identities + their historical pages (completed in place by Batches 6 / 7) and the m05–m06 skeleton titles and PDF source mappings exactly (id ≠ unit number ≠ position)", () => {
    const pages = (id: string) => byId[id].lessons.flatMap(l => l.pages.map(p => [p.id, p.title, p.source!.pdfPageStart, p.source!.printedPage]));
    expect(byId["791381-m03"].title).toBe("برمجة السويتش CLI و VLAN");
    expect(byId["791381-m03"].shortTitle).toBe("CLI و VLAN");
    expect(byId["791381-m03"].lessons[0]).toMatchObject({ id: "791381-m03-l01", title: "مدخل إلى CLI و VLAN", order: 1 });
    // the two historical pages: id, title, pdfPageStart AND printedPage are byte-for-byte the Phase-2 skeleton values
    expect(pages("791381-m03").filter(p => p[0] === "791381-m03-l01-p01" || p[0] === "791381-m03-l01-p02")).toEqual([
      ["791381-m03-l01-p01", "منافذ السويتش", 123, 121],
      ["791381-m03-l01-p02", "برمجة المنافذ من CLI", 124, 122],
    ]);
    // Batch 6 completed the section IN PLACE: PDF 121–122 precede them as new stable ids (orders 1–2), the historical pages read 3rd/4th
    expect(byId["791381-m03"].lessons[0].pages.map(p => [p.id, p.order, p.source!.pdfPageStart])).toEqual([
      ["791381-m03-l01-p03", 1, 121], ["791381-m03-l01-p04", 2, 122], ["791381-m03-l01-p01", 3, 123], ["791381-m03-l01-p02", 4, 124],
    ]);
    expect(pages("791381-m03").map(p => p[2])).toEqual(Array.from({ length: 18 }, (_, i) => 121 + i));
    expect(byId["791381-m04"].title).toBe("Trunk و Router on a Stick");
    expect(byId["791381-m04"].shortTitle).toBe("Trunk");
    expect(byId["791381-m04"].lessons[0]).toMatchObject({ id: "791381-m04-l01", title: "الربط بين السويتشات والتوجيه", order: 1 });
    // the historical page: id, title, pdfPageStart AND printedPage are byte-for-byte the Phase-2 skeleton values
    expect(pages("791381-m04").filter(p => p[0] === "791381-m04-l01-p01")).toEqual([["791381-m04-l01-p01", "أوامر Trunk", 148, 146]]);
    // Batch 7 completed the section IN PLACE: PDF 146–147 precede it as new stable ids (orders 1–2), the historical page reads 3rd, PDF 149–150 follow
    expect(byId["791381-m04"].lessons[0].pages.map(p => [p.id, p.order, p.source!.pdfPageStart])).toEqual([
      ["791381-m04-l01-p02", 1, 146], ["791381-m04-l01-p03", 2, 147], ["791381-m04-l01-p01", 3, 148], ["791381-m04-l01-p04", 4, 149], ["791381-m04-l01-p05", 5, 150],
    ]);
    expect(pages("791381-m04").map(p => p[2])).toEqual(Array.from({ length: 12 }, (_, i) => 146 + i));
    expect(byId["791381-m19"].title).toBe("إدارة VLAN: VTP");
    expect(pages("791381-m19").map(p => p[2])).toEqual([140, 141, 142, 143, 144]);
    expect(byId["791381-m05"].title).toBe("مرجع أوامر Cisco");
    expect(pages("791381-m05")).toEqual([["791381-m05-l01-p03", "أوامر السويتش والراوتر", 192, 192], ["791381-m05-l01-p01", "أوامر أساسية للجهاز", 193, 191], ["791381-m05-l01-p02", "أوامر VLAN و Trunk", 194, 192], ["791381-m05-l02-p01", "VTP وكلمات مرور سريعة", 195, 195], ["791381-m05-l02-p02", "Sub-Interface و Dot1Q", 196, 196], ["791381-m05-l02-p03", "أوامر Port Security مختصرة", 197, 197], ["791381-m05-l03-p01", "أوامر الفحص المهمة", 198, 198], ["791381-m05-l03-p02", "OSPF / EIGRP / ACL — تذكير سريع", 199, 199]]);   // Batch 9 completed m05 in place: the two historical pages keep id / title / PDF / printed page
    expect(byId["791381-m06"].title).toBe("قوائم التحكم ACL");
    expect(pages("791381-m06")).toEqual([["791381-m06-l01-p02", "ACL — Access Control List", 223, 223], ["791381-m06-l01-p03", "Standard ACL", 224, 224], ["791381-m06-l01-p04", "Standard ACL — أمثلة", 225, 225], ["791381-m06-l01-p05", "Standard ACL — أمثلة إضافية", 226, 226], ["791381-m06-l01-p01", "Extended ACL", 227, 225], ["791381-m06-l02-p01", "تدريبات", 228, 228], ["791381-m06-l02-p02", "امتحانات نهائية للتدريب", 229, 229]]);   // completed in place by Batch 10; the historical page keeps its id / title / mapping at order 5
    // m01 / m02 identities are unchanged too (their page ids are pinned by the 3B/3C/3D tests)
    expect(byId["791381-m01"].title).toBe("أساسيات الشبكات");
    expect(byId["791381-m02"].title).toBe("الأعداد والموازين");
  });

  it("b1 lists Units 1–4 (m01, m02, m07, m08) in order; the batch id/label and the other batch mappings are unchanged", () => {
    const batches = Object.fromEntries(manifest.batches!.map(b => [b.id, b]));
    expect(batches.b1.label).toBe("الأساسيات · الأعداد · IP");
    expect(batches.b1.moduleIds).toEqual(["791381-m01", "791381-m02", "791381-m07", "791381-m08"]);
    expect(batches.b4.moduleIds).toEqual(["791381-m03", "791381-m19", "791381-m04"]);   // CLI/VLAN NOT moved into b1; Batch 7 inserted m19 (VTP) before m04; Batch 9 moved m05 to b5
    expect(batches.b6.moduleIds).toEqual(["791381-m25", "791381-m26", "791381-m27", "791381-m06"]);   // Batch 10
  });

  it("Units 7–8 / Batch 3: b2 «الأجهزة والرسائل» lists m09, m10, m11, m12 in that exact order; b3 «النماذج والبروتوكولات والأمان» lists m13 … m18 in that order (PDF 76–119); other batches unchanged", () => {
    const batches = Object.fromEntries(manifest.batches!.map(b => [b.id, b]));
    expect(batches.b2.label).toBe("الأجهزة والرسائل");
    expect(batches.b2.moduleIds).toEqual(["791381-m09", "791381-m10", "791381-m11", "791381-m12"]);
    expect(batches.b3.label).toBe("النماذج والبروتوكولات والأمان");
    expect(batches.b3.moduleIds).toEqual(["791381-m13", "791381-m14", "791381-m15", "791381-m16", "791381-m17", "791381-m18"]);
    expect(batches.b5.moduleIds).toEqual(["791381-m20", "791381-m21", "791381-m22", "791381-m23", "791381-m24", "791381-m05"]);   // Batch 8 + Batch 9 filled the fifth-batch grouping (m05 moved here from b4)
    expect(batches.intro.moduleIds).toEqual([]);
    expect(batches.summary.moduleIds).toEqual(["791381-m28"]);   // the final summary fills the summary grouping
    // every module id appears in at most one batch, and the two new modules appear only in b2
    const all = manifest.batches!.flatMap(b => b.moduleIds);
    expect(new Set(all).size).toBe(all.length);
    expect(manifest.batches!.filter(b => b.moduleIds.includes("791381-m11") || b.moduleIds.includes("791381-m12")).map(b => b.id)).toEqual(["b2"]);
  });
});

function expectStrictlyOrdered(orders: number[]) {
  const sorted = [...orders].sort((a, b) => a - b);
  expect(orders).toEqual(sorted);                 // authored in order
  expect(new Set(orders).size).toBe(orders.length); // no duplicate sibling order
}
