// Phase L.6a — the module bodies the API serves (api/src/data/learning-content/<course>/<module>.json) must equal the authored
// content. When content changes this test fails until `npm run build:learning-content` is re-run, so a student never reads a
// stale page from the server. It also pins the app's list of modules that have a body to the authored modules and to the data.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import manifest from "./791381/manifest";
import { COURSE_CONTENT_MODULE_IDS, registeredCourseIds } from "./registry";
import { COURSE_MODULE_LOADERS, loadBundledModuleContent } from "./bundledModules";

const dataDir = (courseId: string) => fileURLToPath(new URL("../../../api/src/data/learning-content/" + courseId + "/", import.meta.url));

describe("the server's module bodies equal the authored content", () => {
  it("every registered course: the app's body list = the authored loaders = the data files", () => {
    for (const courseId of registeredCourseIds()) {
      const ids = [...(COURSE_CONTENT_MODULE_IDS[courseId] ?? [])].sort();
      expect(Object.keys(COURSE_MODULE_LOADERS[courseId] ?? {}).sort()).toEqual(ids);
      expect(readdirSync(dataDir(courseId)).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)).sort()).toEqual(ids);
    }
    expect([...COURSE_CONTENT_MODULE_IDS["791381"]].sort()).toEqual(manifest.modules.map(m => m.id).sort());   // every manifest module has a body
  });

  it("each data file is exactly its authored module (run `npm run build:learning-content` after content changes)", async () => {
    for (const courseId of registeredCourseIds()) {
      for (const moduleId of COURSE_CONTENT_MODULE_IDS[courseId]) {
        const authored = JSON.parse(JSON.stringify(await loadBundledModuleContent(courseId, moduleId)));
        const served = JSON.parse(readFileSync(dataDir(courseId) + moduleId + ".json", "utf8"));
        expect(served, moduleId).toEqual(authored);
      }
    }
  }, 30000);
});
