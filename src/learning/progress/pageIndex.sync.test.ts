// Phase L.3 — the committed SERVER page index (api/src/data/learning-pages/791381.json) must equal the index derived from the
// live manifest. When content changes (a page added, moved or renamed) this test fails until
// `npm run build:learning-page-index` is re-run, so the server never accepts a reading event for a page the book no longer
// has, nor refuses one it gained. It also pins the identity rules the API relies on.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import manifest from "../content/791381/manifest";
import { buildPageIndex } from "./buildPageIndex";
import { flattenPageRefs } from "../content/navigation";

const committed = JSON.parse(readFileSync(fileURLToPath(new URL("../../../api/src/data/learning-pages/791381.json", import.meta.url)), "utf8"));
// @ts-expect-error — the server registry is an untyped CommonJS module; it is imported here on purpose to cross-check it.
import * as apiRegistry from "../../../api/src/lib/learning-materials-registry.js";

describe("the committed server page index equals the manifest-derived one", () => {
  it("structural equality (run `npm run build:learning-page-index` after content changes)", () => {
    expect(committed).toEqual(buildPageIndex(manifest));
  });
  it("covers every page exactly once, in reading order, under its own module; every module is publishable on the server", () => {
    const flat = flattenPageRefs(manifest);
    const fromIndex = Object.values(committed.modules as Record<string, string[]>).flat();
    expect(fromIndex).toEqual(flat.map(r => r.page.id));
    expect(new Set(fromIndex).size).toBe(248);
    const server = (apiRegistry as unknown as { listLearningModules: (c: string) => { moduleId: string }[] }).listLearningModules("791381").map(m => m.moduleId);
    expect(Object.keys(committed.modules).sort()).toEqual([...server].sort());
    for (const [moduleId, pages] of Object.entries(committed.modules as Record<string, string[]>)) {
      for (const id of pages) expect(id.startsWith(moduleId + "-")).toBe(true);
    }
  });
});
