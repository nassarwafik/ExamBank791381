// Phase L.6a — regenerates api/src/data/learning-content/<courseId>/<moduleId>.json: every module BODY of every registered course,
// as the API serves it (GET /api/learning-content/{course}/{module}, after the publication check). Read from the authored
// TypeScript content through Vite's SSR loader. Run after any content change: `npm run build:learning-content`.
// The committed files are pinned by src/learning/content/contentData.sync.test.ts.
import { createServer } from "vite";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const registry = await server.ssrLoadModule("/src/learning/content/registry.ts");
  const { loadBundledModuleContent } = await server.ssrLoadModule("/src/learning/content/bundledModules.ts");
  for (const courseId of registry.registeredCourseIds()) {
    const dir = resolve("api/src/data/learning-content", courseId);
    mkdirSync(dir, { recursive: true });
    const wanted = new Set(registry.COURSE_CONTENT_MODULE_IDS[courseId] ?? []);
    for (const file of readdirSync(dir)) if (file.endsWith(".json") && !wanted.has(file.slice(0, -5))) rmSync(resolve(dir, file));   // a removed module
    let bytes = 0;
    for (const moduleId of wanted) {
      const json = JSON.stringify(await loadBundledModuleContent(courseId, moduleId)) + "\n";
      writeFileSync(resolve(dir, moduleId + ".json"), json);
      bytes += json.length;
    }
    console.log(`wrote ${dir}: ${wanted.size} modules, ${Math.round(bytes / 1024)} KB`);
  }
} finally {
  await server.close();
}
