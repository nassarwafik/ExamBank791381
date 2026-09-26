#!/usr/bin/env node
// Phase 8E-2 — production bundle guard. Run AFTER `vite build` (npm run check:bundle) against the real dist output.
//
// It reconstructs the INITIAL JavaScript graph exactly as the browser will load it — the entry <script> of
// dist/index.html plus every chunk it reaches through STATIC `import` statements, transitively (dynamic `import()`
// edges are lazy and excluded) — and fails the build when:
//   1. the gzip size of that initial graph exceeds the agreed budget (INITIAL_JS_GZIP_BUDGET_KB);
//   2. the Teacher Dashboard is not emitted as its own lazy chunk (TeacherDashboard-*.js outside the initial graph);
//   3. any initial file carries the Dashboard or the Chart.js payload (content signatures, not filenames).
// No hashed filename is hard-coded: chunks are recognised by their un-hashed stem and by content signatures that
// are stable across Chart.js / Dashboard minification (registry ids and dashboard-only class names).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export const INITIAL_JS_GZIP_BUDGET_KB = 205;                   // Phase 8E budget after the Dashboard / Chart.js split
const CHART_SIGNATURES = ["radialLinear", "doughnut", "getDatasetMeta", "skipNull"]; // Chart.js registry / option ids
const DASHBOARD_SIGNATURES = ["analytics-chart-canvas", "analytics-insight"];      // TeacherDashboard-only class names

const dist = process.argv[2] || "dist";
const assets = path.join(dist, "assets");
const kb = n => (n / 1024).toFixed(1);
const read = f => fs.readFileSync(path.join(assets, f), "utf8");

export function initialGraph(distDir) {
  const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  const entries = [...html.matchAll(/<script[^>]+type="module"[^>]+src="\/assets\/([^"]+\.js)"/g)].map(m => m[1]);
  if (!entries.length) throw new Error("no module entry script found in " + path.join(distDir, "index.html"));
  const reached = new Set(entries), queue = [...entries];
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

  for (const f of initial) {
    const src = read(f);
    const chart = CHART_SIGNATURES.filter(s => src.includes(s));
    const dash = DASHBOARD_SIGNATURES.filter(s => src.includes(s));
    if (chart.length >= 3) failures.push(`${f} (initial) contains the Chart.js payload (${chart.join(", ")})`);
    if (dash.length) failures.push(`${f} (initial) contains the Teacher Dashboard payload (${dash.join(", ")})`);
  }
  const chartChunks = all.filter(f => CHART_SIGNATURES.filter(s => read(f).includes(s)).length >= 3);
  console.log(`Chart.js payload found in: ${chartChunks.join(", ") || "(none)"} — ${chartChunks.every(f => !initial.includes(f)) ? "all lazy" : "IN THE INITIAL GRAPH"}`);
  console.log(`Teacher Dashboard chunk: ${dashboardChunks.join(", ") || "(missing)"}`);

  if (failures.length) { console.error("\nBUNDLE GUARD FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("bundle guard passed");
}

main();
