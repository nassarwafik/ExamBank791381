#!/usr/bin/env node
// Phase 8E-2 — production bundle guard. Run AFTER `vite build` (npm run check:bundle) against the real dist output.
//
// It reconstructs the INITIAL JavaScript graph exactly as the browser will load it — the entry <script> of
// dist/index.html plus every chunk it reaches through STATIC `import` statements, transitively (dynamic `import()`
// edges are lazy and excluded) — and fails the build when:
//   1. the gzip size of that initial graph exceeds the agreed budget (INITIAL_JS_GZIP_BUDGET_KB);
//   2. the Teacher Dashboard is not emitted as its own lazy chunk (TeacherDashboard-*.js outside the initial graph);
//   3. any initial file carries the Dashboard or the Chart.js payload (content signatures, not filenames);
//   4. (Phase 8E-4) the Teacher Platform is not emitted as its own lazy chunk (TeacherPlatform-*.js outside the
//      initial graph), or any initial file carries the Platform payload;
//   5. (Phase 8E-5) the Student Portal is not emitted as its own lazy chunk (StudentPortal-*.js outside the initial
//      graph), or any initial file carries the Portal payload;
//   6. (Phase 8E-6) the Learning Reader's first chunk graph (LearningReaderWithTraining-*.js + its static imports) or
//      the initial graph carries any registered SVG visual implementation, the visuals are not emitted behind lazy
//      edges of the Reader in several small trusted group chunks, or fewer than the registered 122 implementations
//      are shipped (signature: the `preserveAspectRatio:` prop every registered visual sets on its root <svg>).
// No hashed filename is hard-coded: chunks are recognised by their un-hashed stem and by content signatures that
// are stable across minification (Chart.js registry ids, dashboard-only / platform-only class names and copy).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// Phase 8E-2 measured 193.5 KB (budget 205); Phase 8E-4 measured 159.2 KB (budget 175); Phase 8E-5 measured 111.5 KB →
// budget tightened to 125 (≈ +13 KB regression tolerance).
export const INITIAL_JS_GZIP_BUDGET_KB = 125;
const CHART_SIGNATURES = ["radialLinear", "doughnut", "getDatasetMeta", "skipNull"]; // Chart.js registry / option ids
const DASHBOARD_SIGNATURES = ["analytics-chart-canvas", "analytics-insight"];      // TeacherDashboard-only class names
// TeacherPlatform-only: its students-workspace layout class names (used nowhere else in src/) and the Phase 8E-2
// Dashboard fallback copy that lives in TeacherPlatform.tsx. Two of three are required (no single-string false positive).
const PLATFORM_SIGNATURES = ["eb-students-workspace", "eb-students-layout", "جارٍ تحميل لوحة المتابعة"];
// StudentPortal-only: its task-list / notice / assignment-list class names and the task-filter group label (each
// occurs in no other source file and, in the real build, in no other chunk). Two of four are required.
const PORTAL_SIGNATURES = ["eb-sp-tasks", "eb-sp-notice", "student-assignment-list", "تصفية المهام"];
// Phase 8E-6 — learning visuals. Every registered SVG visual root sets `preserveAspectRatio`, so the count of that prop in
// a chunk is the number of visual implementations it carries (0 everywhere on the startup + first-Reader path).
const VISUAL_IMPL_SIGNATURE = /preserveAspectRatio:/g;
const REGISTERED_VISUALS_MIN = 122;            // registry.test.ts pins the exact count; the guard only refuses to ship fewer
const VISUAL_GROUP_MAX_IMPLS = 40;             // a single chunk carrying (nearly) every visual would be the eager design again
const VISUAL_GROUP_MIN_CHUNKS = 10;

const dist = process.argv[2] || "dist";
const assets = path.join(dist, "assets");
const kb = n => (n / 1024).toFixed(1);
const read = f => fs.readFileSync(path.join(assets, f), "utf8");

export function initialGraph(distDir) {
  const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  const entries = [...html.matchAll(/<script[^>]+type="module"[^>]+src="\/assets\/([^"]+\.js)"/g)].map(m => m[1]);
  if (!entries.length) throw new Error("no module entry script found in " + path.join(distDir, "index.html"));
  return staticClosure(distDir, entries);
}

// The chunks reached from `roots` through STATIC import edges (the files a browser fetches together with the roots).
export function staticClosure(distDir, roots) {
  const reached = new Set(roots), queue = [...roots];
  while (queue.length) {
    const file = queue.pop();
    const source = fs.readFileSync(path.join(distDir, "assets", file), "utf8");
    // Static edges only: `import x from"./a.js"`, `import{a}from"./a.js"`, `import"./a.js"`, `export{x}from"./a.js"`.
    // A dynamic `import("./a.js")` is a lazy edge and is deliberately NOT followed.
    for (const m of source.matchAll(/(?:^|[;{}\s)])(?:import|export)\s*(?:[^;"'()]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g)) {
      if (!reached.has(m[1])) { reached.add(m[1]); queue.push(m[1]); }
    }
  }
  return [...reached];
}

// The chunks a file reaches through DYNAMIC `import()` edges (Vite emits them as import("./x.js") / import(`./x.js`)).
export function dynamicEdges(distDir, file) {
  const source = fs.readFileSync(path.join(distDir, "assets", file), "utf8");
  return [...new Set([...source.matchAll(/import\([`"']\.\/([^`"']+\.js)[`"']\)/g)].map(m => m[1]))];
}

function main() {
  const initial = initialGraph(dist);
  const failures = [];
  let gz = 0;
  for (const f of initial) gz += zlib.gzipSync(fs.readFileSync(path.join(assets, f)), { level: 9 }).length;
  const gzKb = gz / 1024;
  console.log(`initial JS graph: ${initial.length} files, ${kb(gz)} KB gzip (budget ${INITIAL_JS_GZIP_BUDGET_KB} KB)`);
  if (gzKb > INITIAL_JS_GZIP_BUDGET_KB) failures.push(`initial JS gzip ${kb(gz)} KB exceeds the ${INITIAL_JS_GZIP_BUDGET_KB} KB budget`);

  const all = fs.readdirSync(assets).filter(f => f.endsWith(".js"));
  const dashboardChunks = all.filter(f => /^TeacherDashboard-[^.]+\.js$/.test(f));
  if (!dashboardChunks.length) failures.push("no TeacherDashboard-*.js lazy chunk was emitted (is the Dashboard imported statically again?)");
  for (const f of dashboardChunks) if (initial.includes(f)) failures.push(`${f} is part of the initial graph`);
  const platformChunks = all.filter(f => /^TeacherPlatform-[^.]+\.js$/.test(f));
  if (!platformChunks.length) failures.push("no TeacherPlatform-*.js lazy chunk was emitted (is TeacherPlatform imported statically again in App.tsx?)");
  for (const f of platformChunks) if (initial.includes(f)) failures.push(`${f} is part of the initial graph`);
  const portalChunks = all.filter(f => /^StudentPortal-[^.]+\.js$/.test(f));
  if (!portalChunks.length) failures.push("no StudentPortal-*.js lazy chunk was emitted (is StudentPortal imported statically again in App.tsx?)");
  for (const f of portalChunks) if (initial.includes(f)) failures.push(`${f} is part of the initial graph`);

  for (const f of initial) {
    const src = read(f);
    const chart = CHART_SIGNATURES.filter(s => src.includes(s));
    const dash = DASHBOARD_SIGNATURES.filter(s => src.includes(s));
    const platform = PLATFORM_SIGNATURES.filter(s => src.includes(s));
    const portal = PORTAL_SIGNATURES.filter(s => src.includes(s));
    if (chart.length >= 3) failures.push(`${f} (initial) contains the Chart.js payload (${chart.join(", ")})`);
    if (dash.length) failures.push(`${f} (initial) contains the Teacher Dashboard payload (${dash.join(", ")})`);
    if (platform.length >= 2) failures.push(`${f} (initial) contains the Teacher Platform payload (${platform.join(", ")})`);
    if (portal.length >= 2) failures.push(`${f} (initial) contains the Student Portal payload (${portal.join(", ")})`);
  }
  const chartChunks = all.filter(f => CHART_SIGNATURES.filter(s => read(f).includes(s)).length >= 3);
  console.log(`Chart.js payload found in: ${chartChunks.join(", ") || "(none)"} — ${chartChunks.every(f => !initial.includes(f)) ? "all lazy" : "IN THE INITIAL GRAPH"}`);
  console.log(`Teacher Dashboard chunk: ${dashboardChunks.join(", ") || "(missing)"}`);
  console.log(`Teacher Platform chunk: ${platformChunks.join(", ") || "(missing)"}`);
  console.log(`Student Portal chunk: ${portalChunks.join(", ") || "(missing)"}`);

  // Phase 8E-6 — learning visuals stay OUT of the startup graph and out of the Reader's first chunk graph, and ship as
  // several small lazy group chunks reachable only through the Reader's dynamic edges.
  const implCount = f => (read(f).match(VISUAL_IMPL_SIGNATURE) || []).length;
  const readerRoots = all.filter(f => /^LearningReaderWithTraining-[^.]+\.js$/.test(f));
  if (!readerRoots.length) failures.push("no LearningReaderWithTraining-*.js lazy chunk was emitted (is the Learning Reader imported statically?)");
  const readerClosure = readerRoots.length ? staticClosure(dist, readerRoots) : [];
  for (const f of initial) if (implCount(f)) failures.push(`${f} (initial) carries ${implCount(f)} learning visual implementation(s)`);
  for (const f of readerClosure) if (implCount(f)) failures.push(`${f} (first Reader load) carries ${implCount(f)} learning visual implementation(s) — the registry must stay lazy`);
  const visualChunks = all.filter(f => implCount(f) > 0 && !initial.includes(f) && !readerClosure.includes(f));
  const shipped = visualChunks.reduce((n, f) => n + implCount(f), 0);
  const readerDynamic = new Set(readerRoots.flatMap(f => dynamicEdges(dist, f)));
  const unreachable = visualChunks.filter(f => !readerDynamic.has(f));
  const biggest = Math.max(0, ...visualChunks.map(implCount));
  if (shipped < REGISTERED_VISUALS_MIN) failures.push(`only ${shipped} learning visual implementations are shipped in lazy chunks (registry has ${REGISTERED_VISUALS_MIN})`);
  if (visualChunks.length < VISUAL_GROUP_MIN_CHUNKS) failures.push(`learning visuals are packed into ${visualChunks.length} chunk(s) — the trusted per-module grouping emits ≥ ${VISUAL_GROUP_MIN_CHUNKS}`);
  if (biggest > VISUAL_GROUP_MAX_IMPLS) failures.push(`a learning visual chunk carries ${biggest} implementations (max ${VISUAL_GROUP_MAX_IMPLS}) — that is the eager all-visuals design again`);
  if (unreachable.length) failures.push(`learning visual chunk(s) not behind a dynamic edge of the Reader chunk: ${unreachable.join(", ")}`);
  const readerGz = readerClosure.filter(f => !initial.includes(f)).reduce((n, f) => n + zlib.gzipSync(fs.readFileSync(path.join(assets, f)), { level: 9 }).length, 0);
  console.log(`Learning Reader first-load graph (beyond the initial graph): ${readerClosure.filter(f => !initial.includes(f)).length} files, ${kb(readerGz)} KB gzip, 0 visual implementations required`);
  console.log(`Learning visuals: ${shipped} implementations in ${visualChunks.length} lazy group chunks (largest ${biggest}), all behind Reader dynamic edges`);

  if (failures.length) { console.error("\nBUNDLE GUARD FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("bundle guard passed");
}

main();
