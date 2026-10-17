// Phase L.3 — regenerates api/src/data/learning-pages/<courseId>.json — the server-side page index (every module's page ids
// in reading order) — from the real frontend manifest, through Vite's SSR loader like build-learning-study-index.mjs.
// Run after any content change: `npm run build:learning-page-index`. Pinned by src/learning/progress/pageIndex.sync.test.ts.
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const registry = await server.ssrLoadModule("/src/learning/content/registry.ts");
  const { buildPageIndex } = await server.ssrLoadModule("/src/learning/progress/buildPageIndex.ts");
  const dir = resolve("api/src/data/learning-pages");
  mkdirSync(dir, { recursive: true });
  for (const courseId of registry.registeredCourseIds()) {
    const index = buildPageIndex(await registry.loadCourseManifest(courseId));
    const file = resolve(dir, courseId + ".json");
    writeFileSync(file, JSON.stringify(index, null, 2) + "\n");
    const pages = Object.values(index.modules).reduce((n, ids) => n + ids.length, 0);
    console.log(`wrote ${file}: ${Object.keys(index.modules).length} modules, ${pages} pages`);
  }
} finally {
  await server.close();
}
