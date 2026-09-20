import { describe, it, expect } from "vitest";
import { filterManifestByModuleIds } from "./filterManifest";
import { flattenPageRefs, nextPage, previousPage, pagePosition, findPage, orderedModules } from "./navigation";
import manifest from "./791381/manifest";

// Class Learning Materials — the pure manifest filter behind the student's Reader (progressive release).
const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
const pagesOf = (m: typeof manifest, id: string) => m.modules.find(x => x.id === id)!.lessons.reduce((n, l) => n + l.pages.length, 0);
const ids = (m: typeof manifest) => orderedModules(m).map(x => x.id);

describe("filterManifestByModuleIds — canonical 791381 (m01, m02, m07, m08–m18, m03, m19, m04 + skeleton m05–m06)", () => {
  it("allowed [m01, m02] → EXACTLY m01, m02 with their lessons/pages intact, course metadata preserved, original unchanged", () => {
    const before = JSON.stringify(manifest);
    const out = filterManifestByModuleIds(manifest, [M01, M02]);
    expect(ids(out)).toEqual([M01, M02]);
    expect(out.courseId).toBe("791381"); expect(out.title).toBe(manifest.title); expect(out.direction).toBe("rtl"); expect(out.schemaVersion).toBe(manifest.schemaVersion);
    for (const id of [M01, M02]) {
      const src = manifest.modules.find(m => m.id === id)!, kept = out.modules.find(m => m.id === id)!;
      expect(kept).toEqual(src);                                                  // lessons + pages identical
      expect(kept).not.toBe(src);                                                 // but a copy
    }
    expect(flattenPageRefs(out).length).toBe(pagesOf(manifest, M01) + pagesOf(manifest, M02));   // page count = released pages only
    expect(JSON.stringify(manifest)).toBe(before);                                // never mutated
    for (const m of out.modules) expect(m.lessons.every(l => l.pages.length > 0)).toBe(true);   // still a complete, navigable manifest
  });
  it("batches keep only kept module ids; a batch whose modules are all hidden keeps no reference", () => {
    const out = filterManifestByModuleIds(manifest, [M01, M02]);
    const b1 = out.batches!.find(b => b.id === "b1")!, b4 = out.batches!.find(b => b.id === "b4")!, b6 = out.batches!.find(b => b.id === "b6")!;
    expect(b1.moduleIds).toEqual([M01, M02]);
    expect(b4.moduleIds).toEqual([]); expect(b6.moduleIds).toEqual([]);
    expect(out.batches!.map(b => b.id)).toEqual(manifest.batches!.map(b => b.id));   // labels/ids preserved
    for (const b of out.batches!) for (const id of b.moduleIds) expect(ids(out)).toContain(id);
  });
  it("MIDDLE module hidden: allowed [m01, m07] → m01, m07 in canonical order, NO m02 placeholder, no skeleton", () => {
    const out = filterManifestByModuleIds(manifest, [M07, M01]);                 // allow-list order is irrelevant
    expect(ids(out)).toEqual([M01, M07]);
    expect(JSON.stringify(out)).not.toContain(M02);
    expect(JSON.stringify(out)).not.toContain("الأعداد والموازين");
    expect(JSON.stringify(out)).not.toMatch(/791381-m0[3-6]/);
    expect(flattenPageRefs(out).length).toBe(pagesOf(manifest, M01) + pagesOf(manifest, M07));
  });
  it("navigation over the filtered manifest: last page of m01 → next → FIRST page of m07 (opener); previous goes back", () => {
    const out = filterManifestByModuleIds(manifest, [M01, M07]);
    const flat = flattenPageRefs(out);
    const lastM01 = flat.filter(f => f.module.id === M01).at(-1)!.page.id;
    const firstM07 = flat.find(f => f.module.id === M07)!.page.id;
    expect(nextPage(out, lastM01)?.id).toBe(firstM07);
    expect(firstM07).toBe("791381-m07-l00-p01");
    expect(previousPage(out, firstM07)?.id).toBe(lastM01);
    expect(findPage(out, "791381-m02-l01-p01")).toBeUndefined();                  // hidden page is unknown
    expect(pagePosition(out, "791381-m02-l01-p01")).toBeNull();
    expect(pagePosition(out, firstM07)).toEqual({ index: pagesOf(manifest, M01) + 1, total: pagesOf(manifest, M01) + pagesOf(manifest, M07) });
  });
  it("last released module ends navigation: allowed [m01, m02] → next after the last m02 page is null; m07 released later → next continues into m07", () => {
    const two = filterManifestByModuleIds(manifest, [M01, M02]);
    const lastM02 = flattenPageRefs(two).at(-1)!.page.id;
    expect(lastM02).toBe("791381-m02-l01-p09");
    expect(nextPage(two, lastM02)).toBeNull();
    const three = filterManifestByModuleIds(manifest, [M01, M02, M07]);
    expect(nextPage(three, lastM02)?.id).toBe("791381-m07-l00-p01");
    expect(ids(three)).toEqual([M01, M02, M07]);
  });
  it("[] → no modules (course attached, nothing released); unknown / blank ids are ignored; ids are trimmed", () => {
    expect(filterManifestByModuleIds(manifest, []).modules).toEqual([]);
    expect(ids(filterManifestByModuleIds(manifest, ["791381-m999", "", " " + M01 + " "]))).toEqual([M01]);
  });
});
