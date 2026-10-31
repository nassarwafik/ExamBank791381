// Book lock — the fingerprint of a course's BOOK content (origin "book"), so enrichment can be added around the book while
// the book itself provably never changes.
//
// Why: the students of 791381s own the printed booklet and annotate it. Every page the Reader shows must stay the printed
// page — same words, same blocks, same order, same drawings. Enrichment (visuals, practice, simulations, end-of-unit
// exercises) is ADDED as origin "teacher-enrichment" blocks or pages and is deliberately left out of the fingerprint.
//
// What a page fingerprint covers: its module / lesson / page identity, titles, order, layout and source, plus every
// origin-"book" block in authored order, each with ALL of its fields. Object keys are sorted (canonical JSON), so the
// fingerprint changes only when the content does. Booklet drawings (the PNG crops) are locked by their file bytes.
//
// The lock is pinned by src/learning/content/791381s/bookLock.test.ts. Writing a new lock is an explicit, reviewed act
// (`node scripts/book-lock.mjs --write 791381s`) that the owner must approve: it means the book itself changed.
import { createHash } from "node:crypto";

/** Canonical JSON: keys sorted at every depth, arrays kept in order, undefined dropped (as JSON.stringify does). */
export function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(v => (v === undefined ? "null" : canonicalJson(v))).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export const sha256 = data => createHash("sha256").update(data).digest("hex");

/** The book blocks of a page, in authored order (enrichment blocks are skipped, never reordered around). */
export const bookBlocks = page => page.blocks.filter(b => b.origin === "book");

/** The fingerprint of one page's book content (null when the page holds no book block: an enrichment-only page). */
export function bookPageFingerprint(module, lesson, page) {
  const blocks = bookBlocks(page);
  if (blocks.length === 0) return null;
  return sha256(canonicalJson({
    module: { id: module.id, title: module.title, order: module.order },
    lesson: { id: lesson.id, title: lesson.title, order: lesson.order },
    page: { id: page.id, title: page.title, order: page.order, layout: page.layout, source: page.source },
    blocks,
  }));
}

/** The lock of a whole course: per-page fingerprints, the book page order per module, and the drawing files' hashes. */
export function buildBookLock(courseId, modules, assets) {
  const pages = {};
  const order = {};
  for (const m of [...modules].sort((a, b) => a.order - b.order)) {
    order[m.id] = [];
    for (const l of [...m.lessons].sort((a, b) => a.order - b.order)) {
      for (const p of [...l.pages].sort((a, b) => a.order - b.order)) {
        const fp = bookPageFingerprint(m, l, p);
        if (fp) { pages[p.id] = fp; order[m.id].push(p.id); }
      }
    }
  }
  return { courseId, algorithm: "sha256 · canonical JSON of origin-book blocks + page identity", pages, order, assets };
}

// CLI: node scripts/book-lock.mjs --write <courseId>
if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === "--write" && process.argv[3]) {
  const courseId = process.argv[3];
  const { createServer } = await import("vite");
  const { readdirSync, readFileSync, writeFileSync, existsSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
  try {
    const registry = await server.ssrLoadModule("/src/learning/content/registry.ts");
    const { loadBundledModuleContent } = await server.ssrLoadModule("/src/learning/content/bundledModules.ts");
    const manifest = await registry.loadCourseManifest(courseId);
    const modules = [];
    for (const m of manifest.modules) modules.push(await loadBundledModuleContent(courseId, m.id));
    const assetDir = resolve("public/learning-assets", courseId);
    const assets = {};
    if (existsSync(assetDir)) for (const f of readdirSync(assetDir).sort()) assets[f] = sha256(readFileSync(resolve(assetDir, f)));
    const lock = buildBookLock(courseId, modules, assets);
    const file = resolve("src/learning/content", courseId, "book-lock.json");
    writeFileSync(file, JSON.stringify(lock, null, 2) + "\n");
    console.log(`wrote ${file}: ${Object.keys(lock.pages).length} book pages, ${Object.keys(assets).length} drawings`);
  } finally {
    await server.close();
  }
}
