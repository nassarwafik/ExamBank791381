// Regenerates api/src/data/learning-study/<courseId>.json — the server-side answer-key index of the eligible
// in-page study activities — from the real frontend content (through Vite's SSR loader, so the TypeScript content
// modules need no separate build). Run after any content change: `npm run build:learning-study-index`.
// The committed file is pinned by src/learning/study/studyIndex.sync.test.ts.
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const registry = await server.ssrLoadModule("/src/learning/content/registry.ts");
  const { buildStudyIndex } = await server.ssrLoadModule("/src/learning/study/buildIndex.ts");
  const dir = resolve("api/src/data/learning-study");
  mkdirSync(dir, { recursive: true });
  for (const courseId of registry.registeredCourseIds()) {
    const manifest = await registry.loadCourseManifest(courseId);
    const index = await buildStudyIndex(courseId, manifest, registry.loadModuleContent);
    const file = resolve(dir, courseId + ".json");
    writeFileSync(file, JSON.stringify(index, null, 2) + "\n");
    const pages = Object.keys(index.pages).length;
    const activities = Object.values(index.pages).reduce((n, p) => n + Object.keys(p.activities).length, 0);
    console.log(`wrote ${file}: ${pages} pages, ${activities} eligible activities`);
  }
} finally {
  await server.close();
}
