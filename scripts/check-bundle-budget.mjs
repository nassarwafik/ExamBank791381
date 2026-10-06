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
//      are shipped (signature: the `preserveAspectRatio:` prop every registered visual sets on its root <svg>);
//  10. (Phase 18C) the network CLI simulator terminal / renderer / authoring editor reaches the initial graph (content signatures);
//  11. (Phase 19A) the inline cloze renderer / token editor / review or the AI authoring dialog reaches the initial graph (signatures);
//  12. (Phase 19B) the parametric engine, the parametric renderer / editor or the parametric review reaches the initial graph (signatures);
//  14. (Phase 20A+20B) the trusted SmartSim renderer / editor / review, the network topology workspace / editor / review or the
//      connectivity engine reaches the initial graph (signatures);
//  13. (Phase 19D) the visual canvas (hotspot / labelDiagram renderers), the region editor / visual editors or the visual review reaches
//      the initial graph (signatures);
//   8. (Phase 17A) the coding editor / coding panels reach the initial graph (content signatures of CodingEditor and the
//      coding renderer / authoring editor: they must ship only behind the registries' lazy edges);
//   9. (Phase 17F-C1) the Monaco engine of the professional code editor is missing, reaches the initial graph, is STATICALLY
//      reachable from the coding question chunks (it must stay behind the editor's own dynamic edge so a coding question paints
//      before the engine downloads), its editor worker is not a separate lazy file, any chunk carries completion / suggestion
//      machinery (the exam invariant: the editor must never help solve the question), or any chunk references a CDN;
//   7. (Phase 11C) the student rank / stage artwork breaks its image-weight guard (scripts/check-student-visual-assets.mjs):
//      a missing / oversized / stale sized derivative, a source import of an owner master, or a master shipped in dist.
// No hashed filename is hard-coded: chunks are recognised by their un-hashed stem and by content signatures that
// are stable across minification (Chart.js registry ids, dashboard-only / platform-only class names and copy).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { checkStudentVisualAssets } from "./check-student-visual-assets.mjs";

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
// Phase 17A — CodingEditor / coding renderer / authoring editor class names (used nowhere else). ANY one in an initial file fails.
// Phase 18B — the enterprise coding workspace (toolbar / focus mode) carries its own signature: the workspace UI ships with the
// coding chunks only.
const CODING_SIGNATURES = ["cx-code-input", "cx-code-gutter", "coding-run-unavailable", "qt-editor-coding", "cx-ws-toolbar"];
// Phase 18C — network CLI terminal / renderer / authoring editor class names (used nowhere else). ANY one in an initial file fails.
const NETCLI_SIGNATURES = ["ncli-terminal", "ncli-inputrow", "qt-editor-networkCli", "ncli-tryout"];
// Phase 19A — inline cloze renderer / token editor / review / AI authoring dialog class names (used nowhere else). ANY one in an initial file fails.
const CLOZE_SIGNATURES = ["cloze-passage", "qt-editor-inlineCloze", "cloze-review-list", "ai-author-dialog"];
// Phase 19B — parametric numeric renderer / editor / review class names and the generator's seed namespace (used nowhere else). ANY
// one in an initial file fails: the engine, the editor and the per-attempt renderer stay out of the initial graph.
// Phase 19C adds the teacher-only sample inspector and the review constraint list.
const PARAMETRIC_SIGNATURES = ["param-response", "qt-editor-parametricNumeric", "param-review-audit", "smartassess.parametric", "param-inspector", "param-review-constraints"];
// Phase 19D — visual canvas / region editor / visual editors / visual review class names (used nowhere else). ANY one in an initial file fails.
const VISUAL_SIGNATURES = ["vq-canvas", "vq-region-editor", "qt-editor-hotspot", "qt-editor-labelDiagram", "vq-review"];
// Phase 19E — the open-response editor / rubric editor / rubric grading panel / student view class names and the rubric engine's award
// code (used nowhere else). ANY one in an initial file fails: the whole open-response + rubric payload must stay lazy.
// Phase 20A+20B — the trusted SmartSim renderer / editor / review and the networkTopology@1 workspace / editor / review class names and the
// connectivity engine's reason code (used nowhere else). ANY one in an initial file fails: the plugin UI and its engines stay lazy.
// Phase 20A.2 adds the two pilots' workspaces / editors / reviews (physicsFreeFall@1, functionStudy2d@1): each stays in its own lazy chunk.
const SMARTSIM_SIGNATURES = ["nettopo-workspace", "nettopo-editor", "qt-editor-smartSim", "smartsim-review", "GATEWAY_NOT_IN_LOCAL_SUBNET",
  "freefall-workspace", "freefall-editor", "freefall-review", "fnstudy-workspace", "fnstudy-editor", "fnstudy-review",
  // Phase 20C — the networkTopology@2 surfaces (curriculum network simulator) stay lazy too.
  "net2-workspace", "net2-editor", "net2-desktop", "net2-ap-config", "net2-review",
  // … and so do its engines (Review Fix 1: an engine signature, not only UI ones).
  "NET2_WIFI_ACTIONS_TOO_MANY", "NET2_SECURE_PORTS_TOO_MANY"];
// Phase 20D — the composite@1 student renderer / enterprise editor / teacher review tree class names and the STRICT composite authority's
// refusal code (the strict validator, its source / SmartSim dependencies and every child surface it reaches stay lazy; only the light ids /
// marks module may sit in the initial graph). ANY one in an initial file fails; none in any chunk means the list is stale.
const COMPOSITE_SIGNATURES = ["cmp-response", "cmp-editor", "cmp-review", "COMPOSITE_CHILD_TYPE_REFUSED"];
// Phase 20D.1 — the enterprise presentation / rich-content engine: the Presentation Studio and the block editor class names, the strict
// rich-content authority's raw-HTML refusal code, the Markdown converter's HTML-refusal code, the MathML renderer's element name and the
// presentation contrast code. The initial graph may carry ONLY the tiny presentation context (StudentQuestionCard reads it); ANY one of
// these in an initial file fails; EACH must exist in some chunk (a missing one means the list is stale).
const PRESENTATION_SIGNATURES = ["xp-studio", "rc-editor", "RICH_CONTENT_RAW_HTML", "MARKDOWN_HTML_REFUSED", "mfrac", "PRESENTATION_CONTRAST"];
const OPEN_RESPONSE_SIGNATURES = ["qt-editor-openResponse", "or-rubric-editor", "or-grade-criteria", "or-student-answer", "open-response-input", "RUBRIC_AWARD_UNKNOWN_LEVEL"];
// Phase 17F-C1 — the Monaco engine payload (its own DOM class names / global): two of three identify a Monaco chunk. It must exist
// (the professional editor ships), stay out of the initial graph AND out of the static closure of the coding question chunks.
const MONACO_SIGNATURES = ["monaco-editor", "MonacoEnvironment", "monaco-mouse-cursor-text"];
// The completion machinery Monaco would ship if the suggest / parameter-hint / inline-completion contributions were imported
// (widget class names and action ids). ANY occurrence in ANY emitted chunk fails the build: no autocomplete in an exam editor.
const COMPLETION_SIGNATURES = ["suggest-widget", "parameter-hints-widget", "editor.action.triggerSuggest", "editor.action.triggerParameterHints", "editor.action.inlineSuggest.trigger"];
// Editor assets are served by the SmartAssess deployment only: no chunk may reference a public CDN host.
const EXTERNAL_ASSET_SIGNATURES = ["cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com"];
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
    const coding = CODING_SIGNATURES.filter(s => src.includes(s));
    if (coding.length) failures.push(`${f} (initial) contains the coding editor payload (${coding.join(", ")}) — it must stay lazy`);
    const netcli = NETCLI_SIGNATURES.filter(s => src.includes(s));
    if (netcli.length) failures.push(`${f} (initial) contains the network CLI simulator payload (${netcli.join(", ")}) — it must stay lazy`);
    const cloze = CLOZE_SIGNATURES.filter(s => src.includes(s));
    if (cloze.length) failures.push(`${f} (initial) contains the inline cloze / AI authoring payload (${cloze.join(", ")}) — it must stay lazy`);
    const parametric = PARAMETRIC_SIGNATURES.filter(s => src.includes(s));
    if (parametric.length) failures.push(`${f} (initial) contains the parametric engine / question payload (${parametric.join(", ")}) — it must stay lazy`);
    const visual = VISUAL_SIGNATURES.filter(s => src.includes(s));
    if (visual.length) failures.push(`${f} (initial) contains the visual question payload (${visual.join(", ")}) — it must stay lazy`);
    const openResponse = OPEN_RESPONSE_SIGNATURES.filter(s => src.includes(s));
    if (openResponse.length) failures.push(`${f} (initial) contains the open-response / rubric payload (${openResponse.join(", ")}) — it must stay lazy`);
    const smartSim = SMARTSIM_SIGNATURES.filter(s => src.includes(s));
    if (smartSim.length) failures.push(`${f} (initial) contains the trusted SmartSim / network topology payload (${smartSim.join(", ")}) — it must stay lazy`);
    const composite = COMPOSITE_SIGNATURES.filter(s => src.includes(s));
    if (composite.length) failures.push(`${f} (initial) contains the composite question payload (${composite.join(", ")}) — it must stay lazy`);
    const presentation = PRESENTATION_SIGNATURES.filter(s => src.includes(s));
    if (presentation.length) failures.push(`${f} (initial) contains the presentation / rich-content engine payload (${presentation.join(", ")}) — it must stay lazy`);
  }
  for (const sig of PRESENTATION_SIGNATURES) if (!all.some(f => read(f).includes(sig))) failures.push(`the presentation / rich-content signature "${sig}" was not found in any chunk — the signature list is stale`);
  const presentationChunks = all.filter(f => PRESENTATION_SIGNATURES.some(s => read(f).includes(s)));
  console.log(`Presentation / rich-content engine payload found in: ${presentationChunks.join(", ") || "(none)"} — ${presentationChunks.every(f => !initial.includes(f)) ? "all lazy" : "IN THE INITIAL GRAPH"}`);
  // Phase 20D.1 — CSS growth is measured separately (reported, not budgeted): the initial stylesheet(s) linked by index.html and the lazy
  // presentation / rich-content stylesheets (chunk CSS named after their owning lazy module).
  const indexHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  const initialCss = [...indexHtml.matchAll(/<link[^>]+href="\/assets\/([^"]+\.css)"/g)].map(m => m[1]);
  const cssGz = list => list.reduce((n, f) => n + zlib.gzipSync(fs.readFileSync(path.join(assets, f)), { level: 9 }).length, 0);
  const presentationCss = fs.readdirSync(assets).filter(f => f.endsWith(".css") && /^(PresentationRoot|RichContentRenderer|RichPrompt|PresentationStudio|RichContentEditor)-/.test(f));
  console.log(`CSS: initial ${initialCss.length} file(s) ${kb(cssGz(initialCss))} KB gzip; presentation / rich-content (lazy) ${presentationCss.length} file(s) ${kb(cssGz(presentationCss))} KB gzip`);
  const compositeChunks = all.filter(f => COMPOSITE_SIGNATURES.some(s => read(f).includes(s)));
  if (!compositeChunks.length) failures.push("the composite question payload (renderer / editor / review / strict authority) was not found in any chunk — the signature list is stale");
  console.log(`Composite question payload found in: ${compositeChunks.join(", ") || "(none)"} — ${compositeChunks.every(f => !initial.includes(f)) ? "all lazy" : "IN THE INITIAL GRAPH"}`);
  const smartSimChunks = all.filter(f => SMARTSIM_SIGNATURES.some(s => read(f).includes(s)));
  if (!smartSimChunks.length) failures.push("the trusted SmartSim / network topology payload (workspace / editor / review / connectivity engine) was not found in any chunk — the signature list is stale");
  console.log(`Trusted SmartSim / network topology payload found in: ${smartSimChunks.join(", ") || "(none)"} — ${smartSimChunks.every(f => !initial.includes(f)) ? "all lazy" : "IN THE INITIAL GRAPH"}`);
  const visualQuestionChunks = all.filter(f => VISUAL_SIGNATURES.some(s => read(f).includes(s)));
  if (!visualQuestionChunks.length) failures.push("the visual question payload (canvas / region editor / review) was not found in any chunk — the signature list is stale");
  console.log(`Visual question payload found in: ${visualQuestionChunks.join(", ") || "(none)"} — ${visualQuestionChunks.every(f => !initial.includes(f)) ? "all lazy" : "IN THE INITIAL GRAPH"}`);
  const openResponseChunks = all.filter(f => OPEN_RESPONSE_SIGNATURES.some(s => read(f).includes(s)));
  if (!openResponseChunks.length) failures.push("the open-response / rubric payload (editor / grading panel / student view / engine) was not found in any chunk — the signature list is stale");
  console.log(`Open-response + rubric payload found in: ${openResponseChunks.join(", ") || "(none)"} — ${openResponseChunks.every(f => !initial.includes(f)) ? "all lazy" : "IN THE INITIAL GRAPH"}`);
  const parametricChunks = all.filter(f => PARAMETRIC_SIGNATURES.some(s => read(f).includes(s)));
  console.log(`Parametric engine / question payload found in: ${parametricChunks.join(", ") || "(none)"} — ${parametricChunks.every(f => !initial.includes(f)) ? "all lazy" : "IN THE INITIAL GRAPH"}`);
  const clozeChunks = all.filter(f => CLOZE_SIGNATURES.some(s => read(f).includes(s)));
  console.log(`Inline cloze / AI authoring payload found in: ${clozeChunks.join(", ") || "(none)"} — ${clozeChunks.every(f => !initial.includes(f)) ? "all lazy" : "IN THE INITIAL GRAPH"}`);
  const netcliChunks = all.filter(f => NETCLI_SIGNATURES.some(s => read(f).includes(s)));
  console.log(`Network CLI simulator payload found in: ${netcliChunks.join(", ") || "(none)"} — ${netcliChunks.every(f => !initial.includes(f)) ? "all lazy" : "IN THE INITIAL GRAPH"}`);
  const codingChunks = all.filter(f => CODING_SIGNATURES.some(s => read(f).includes(s)));
  console.log(`Coding editor payload found in: ${codingChunks.join(", ") || "(none)"} — ${codingChunks.every(f => !initial.includes(f)) ? "all lazy" : "IN THE INITIAL GRAPH"}`);
  // Phase 17F-C1 — the professional editor engine: present, lazy twice over (initial graph + coding chunk closure), worker separate,
  // no completion machinery anywhere, no CDN anywhere.
  const monacoChunks = all.filter(f => MONACO_SIGNATURES.filter(s => read(f).includes(s)).length >= 2);
  if (!monacoChunks.length) failures.push("no Monaco engine chunk was emitted (is src/coding/editor/monacoEngine.ts still imported by the editor engine loader?)");
  for (const f of monacoChunks) if (initial.includes(f)) failures.push(`${f} (initial) is the Monaco engine chunk — it must stay behind the coding editor's dynamic edge`);
  // Phase 19F — the coding@3 locked-template renderer is a third coding root: it must be emitted and must not reach Monaco statically either.
  const codingRoots = all.filter(f => /^(CodingResponse|CodingQuestionEditor|CodingTemplateResponse)-[^.]+\.js$/.test(f));
  if (codingRoots.length < 3) failures.push("the CodingResponse-*.js / CodingQuestionEditor-*.js / CodingTemplateResponse-*.js lazy chunks were not all emitted");
  const codingClosure = codingRoots.length ? staticClosure(dist, codingRoots) : [];
  for (const f of monacoChunks) if (codingClosure.includes(f)) failures.push(`${f} is statically reachable from the coding question chunks (${codingRoots.join(", ")}) — the engine must load through import() only`);
  const codingDynamic = new Set(codingClosure.flatMap(f => dynamicEdges(dist, f)));
  for (const f of monacoChunks) if (!codingDynamic.has(f)) failures.push(`${f} (Monaco engine) is not behind a dynamic edge of the coding question chunks`);
  const workerChunks = all.filter(f => /^editor\.worker-[^.]+\.js$/.test(f));
  if (!workerChunks.length) failures.push("no editor.worker-*.js file was emitted (the Monaco editor worker must be a separate, same-origin Vite worker)");
  for (const f of workerChunks) if (initial.includes(f) || codingClosure.includes(f)) failures.push(`${f} (editor worker) is part of a static graph`);
  for (const f of all) {
    const src = read(f);
    const completion = COMPLETION_SIGNATURES.filter(s => src.includes(s));
    if (completion.length) failures.push(`${f} carries completion / suggestion machinery (${completion.join(", ")}) — the exam editor must not help solve the question`);
    const external = EXTERNAL_ASSET_SIGNATURES.filter(s => src.includes(s));
    if (external.length) failures.push(`${f} references an external asset host (${external.join(", ")}) — editor assets are served by SmartAssess only`);
  }
  const gzOf = f => zlib.gzipSync(fs.readFileSync(path.join(assets, f)), { level: 9 }).length;
  const langChunks = all.filter(f => /^(python|java|csharp)-[^.]+\.js$/.test(f));
  console.log(`Monaco engine chunk: ${monacoChunks.map(f => `${f} (${kb(gzOf(f))} KB gzip)`).join(", ") || "(missing)"} — ${monacoChunks.every(f => !initial.includes(f) && !codingClosure.includes(f)) ? "lazy behind the coding editor's dynamic edge" : "STATICALLY REACHABLE"}`);
  console.log(`Monaco language grammars: ${langChunks.map(f => `${f} (${kb(gzOf(f))} KB gzip)`).join(", ") || "(none)"}; editor worker: ${workerChunks.map(f => `${f} (${kb(gzOf(f))} KB gzip)`).join(", ") || "(missing)"}`);
  console.log(`Coding question chunks static closure (beyond the initial graph): ${codingClosure.filter(f => !initial.includes(f)).length} files, ${kb(codingClosure.filter(f => !initial.includes(f)).reduce((n, f) => n + gzOf(f), 0))} KB gzip — no Monaco, no worker`);
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

  // Phase 11C — student rank / stage image weight.
  const visuals = checkStudentVisualAssets({ root: path.join(path.dirname(fileURLToPath(import.meta.url)), ".."), dist });
  for (const line of visuals.report) console.log(line);
  failures.push(...visuals.failures);

  if (failures.length) { console.error("\nBUNDLE GUARD FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("bundle guard passed");
}

main();
