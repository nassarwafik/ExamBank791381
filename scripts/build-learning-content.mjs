// Phase L.6a / L.6b — regenerates, for every registered course, what the API serves and judges with:
//   • api/src/data/learning-content/<courseId>/<moduleId>.json — every module BODY as the API serves it (GET /api/learning-content/
//     {course}/{module}, after the publication check), WITHOUT the answer material (L.6b: servedModuleBody);
//   • api/src/data/learning-check/<courseId>.json — the CHECK INDEX: every checkable block's key and feedback, which the API judges
//     every in-page answer against (POST /api/learning-study/{course}/attempt).
// Read from the authored TypeScript content through Vite's SSR loader. Run after any content change: `npm run build:learning-content`.
// The committed files are pinned by src/learning/content/contentData.sync.test.ts.
import { createServer } from "vite";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const registry = await server.ssrLoadModule("/src/learning/content/registry.ts");
  const { loadBundledModuleContent } = await server.ssrLoadModule("/src/learning/content/bundledModules.ts");
  const { servedModuleBody, buildCheckIndex } = await server.ssrLoadModule("/src/learning/study/checkIndex.ts");
  for (const courseId of registry.registeredCourseIds()) {
    const dir = resolve("api/src/data/learning-content", courseId);
    mkdirSync(dir, { recursive: true });
    const wanted = new Set(registry.COURSE_CONTENT_MODULE_IDS[courseId] ?? []);
    for (const file of readdirSync(dir)) if (file.endsWith(".json") && !wanted.has(file.slice(0, -5))) rmSync(resolve(dir, file));   // a removed module
    let bytes = 0;
    for (const moduleId of wanted) {
      const json = JSON.stringify(servedModuleBody(await loadBundledModuleContent(courseId, moduleId))) + "\n";
      writeFileSync(resolve(dir, moduleId + ".json"), json);
      bytes += json.length;
    }
    console.log(`wrote ${dir}: ${wanted.size} modules, ${Math.round(bytes / 1024)} KB`);
    const checkDir = resolve("api/src/data/learning-check");
    mkdirSync(checkDir, { recursive: true });
    const index = await buildCheckIndex(courseId, await registry.loadCourseManifest(courseId), loadBundledModuleContent);
    const checkFile = resolve(checkDir, courseId + ".json");
    const checkJson = JSON.stringify(index) + "\n";
    writeFileSync(checkFile, checkJson);
    const activities = Object.values(index.pages).reduce((n, p) => n + Object.keys(p.activities).length, 0);
    console.log(`wrote ${checkFile}: ${Object.keys(index.pages).length} pages, ${activities} checkable activities, ${Math.round(checkJson.length / 1024)} KB`);
  }
} finally {
  await server.close();
}
