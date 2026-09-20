// Learning Materials — Phase 2: registry / lazy-loader tests. No brittle hashed-chunk assertions — behavior only.
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  hasCourseContent, registeredCourseIds, loadCourseManifest, hasModuleContent, loadModuleContent, LearningContentError,
} from "./registry";
import { findLearningCourse } from "../catalog";

afterEach(() => vi.restoreAllMocks());

describe("Phase 2 — content registry (lazy, module-level chunking)", () => {
  it("recognizes 791381 and only registered courses", () => {
    expect(hasCourseContent("791381")).toBe(true);
    expect(hasCourseContent("000000")).toBe(false);
    expect(registeredCourseIds()).toContain("791381");
    // every registered content course must exist in the Phase-1 catalog
    for (const id of registeredCourseIds()) expect(findLearningCourse(id)).toBeTruthy();
  });

  it("loads a course manifest lazily WITHOUT eagerly importing any page/module body, and issues no network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const manifest = await loadCourseManifest("791381");
    expect(manifest.courseId).toBe("791381");
    expect(manifest.modules.length).toBeGreaterThan(0);
    // the manifest carries TOC identities but NO block bodies exist on it (proves manifest ≠ content bodies)
    expect((manifest.modules[0].lessons[0].pages[0] as { blocks?: unknown }).blocks).toBeUndefined();
    // m01, m02 (3B–3D), m07 (3E), m08–m10 (Units 4–6), m11–m12 (Units 7–8), m13 (Batch 3), m14–m16 (Batch 4), m17–m18 (Batch 5), m03 (Batch 6, completed in place), m19 and m04 (Batch 7), m20–m22 (Batch 8), m23–m24 and m05 (Batch 9, m05 completed in place) have real bodies; the skeleton module m06 does not.
    const REAL = ["791381-m01", "791381-m02", "791381-m07", "791381-m08", "791381-m09", "791381-m10", "791381-m11", "791381-m12", "791381-m13", "791381-m14", "791381-m15", "791381-m16", "791381-m17", "791381-m18", "791381-m03", "791381-m19", "791381-m04", "791381-m20", "791381-m21", "791381-m22", "791381-m23", "791381-m24", "791381-m05", "791381-m25", "791381-m26", "791381-m27", "791381-m06"];
    for (const id of REAL) expect(hasModuleContent("791381", id), id).toBe(true);
    for (const m of manifest.modules.filter(m => !REAL.includes(m.id))) {
      expect(hasModuleContent("791381", m.id), m.id).toBe(false);
    }
    // hasModuleContent is pure — it triggers no import and no network
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lazily loads a REAL module body (its own chunk) with pages + blocks; m01 and m02 are both complete", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const m01 = await loadModuleContent("791381", "791381-m01");
    expect(m01.id).toBe("791381-m01");
    expect(m01.partial).toBeFalsy();                                   // m01 is complete
    const p1 = m01.lessons.flatMap(l => l.pages).find(p => p.id === "791381-m01-l01-p01");
    expect(p1?.blocks.length).toBeGreaterThan(0);                      // real block bodies exist
    expect(p1?.source.pdfPageStart).toBe(8);
    const m02 = await loadModuleContent("791381", "791381-m02");
    expect(m02.partial).toBeFalsy();                                   // m02 completed in Phase 3D (PDF 23 converted)
    expect(fetchSpy).not.toHaveBeenCalled();                          // code-split import only, no network
  });

  it("rejects an unknown course safely (typed error, no throw-through of a raw import failure)", async () => {
    await expect(loadCourseManifest("000000")).rejects.toBeInstanceOf(LearningContentError);
    await expect(loadCourseManifest("000000")).rejects.toMatchObject({ code: "unknown-course" });
  });

  it("rejects an unknown module body request", async () => {
    await expect(loadModuleContent("000000", "x")).rejects.toMatchObject({ code: "unknown-course" });
    await expect(loadModuleContent("791381", "791381-m99")).rejects.toMatchObject({ code: "unknown-module" });
  });
});
