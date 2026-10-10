#!/usr/bin/env node
// Phase 21D-B.3 — real-Chromium certification of the ARABIC ACCEPTANCE EXAM for realistic 3D models (browser-harness/mesh-exam-21db3.*),
// WebGL 2 through ANGLE / SwiftShader (no GPU). The six meshPartSelection@1 questions (three on the BodyParts3D heart, three on the brain)
// render on ONE exam page with the production student renderer, from the STUDENT projection; the shipped library files are served at their
// content address exactly as the Static Web App serves them. Checks:
//   • the exam page: six models, hidden-label questions show neutral names only, no private key in the student DOM;
//   • answering: a click on the model selects the front-most labelled part (GPU pick), the parts list answers too (single / multiple /
//     limit), every change is autosaved through the shared server binding, a forged answer is refused, a RELOAD restores every answer;
//   • grading of the restored answers by the shared authority = full marks; the teacher review shows the real labels and the marks;
//   • bounded GPU use: only on-screen viewers hold a GL context while the student scrolls the whole exam, each library file is downloaded
//     once per page, context loss mid-exam restores without losing the answer, 20 mount / unmount cycles of the exam leave no renderer and
//     no retained heap, a low-memory phone (deviceMemory 2, DPR 3) caps the drawing buffer at 2× and has no horizontal overflow;
//   • WebGL unavailable: the whole exam is still answerable through the parts lists and grades identically;
//   • performance figures (time to first model, per-question time to ready, GPU bytes, heap) are written to exam-results.json.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-21db"), "exam");
const checks = [], perf = {};
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + " " + detail); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

const exam = JSON.parse(fs.readFileSync(path.join(root, "docs/fixtures/mesh-models-21db3/ExamBank_21DB3_Mesh_Models_Acceptance.json"), "utf8"));
const QS = exam.sections.flatMap(s => s.questions).filter(q => q.presentationType === "meshPartSelection");
const FULL = QS.reduce((n, q) => n + q.marks, 0);
const assets = path.join(root, "public/mesh-assets");
fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", publicDir: false, build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/mesh-exam-21db3.html") } } });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const requests = new Map();
let bytesServed = 0;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  const lib = u.pathname.match(/^\/mesh-assets\/([0-9a-f]{64})\.glb$/);
  if (lib) {
    const hex = lib[1], file = path.join(assets, hex + ".glb");
    requests.set(hex, (requests.get(hex) || 0) + 1);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    const body = fs.readFileSync(file);
    bytesServed += body.length;
    res.writeHead(200, { "content-type": "model/gltf-binary", "content-length": String(body.length), "x-content-type-options": "nosniff", "cache-control": "no-store" });
    let o = 0;
    const pump = () => { if (o >= body.length) { res.end(); return; } res.write(body.subarray(o, o + 65536)); o += 65536; setImmediate(pump); };
    pump();
    return;
  }
  const full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--js-flags=--expose-gc"] });
const errors = [], foreign = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open({ width = 1280, height = 900, query = "", touch = false, scale = 1, init } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: scale });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("response", r => { if (r.status() >= 400) errors.push("HTTP " + r.status() + " " + r.url()); });
  page.on("request", r => { const u = new URL(r.url()); if (u.origin !== origin && u.protocol !== "data:" && u.protocol !== "blob:") foreign.push(r.url()); });
  const t0 = Date.now();
  await page.goto(origin + "/browser-harness/mesh-exam-21db3.html" + query, { waitUntil: "load" });
  return { page, context, t0 };
}
const fig = id => "[data-testid=q-" + id + "] figure.mm3d";
const stateOf = (page, id) => page.$eval(fig(id), e => e.dataset.state).catch(() => null);
const waitState = async (page, id, want, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await stateOf(page, id)) === want) return Date.now() - t; await sleep(50); } return -1; };
const answers = page => page.evaluate(() => window.__exam.answers());
const live = page => page.evaluate(() => window.__exam.live());
const digits = n => String(n).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
/** the label the STUDENT sees for a part (neutral ordinal when the question hides labels) */
const shown = (q, id) => { const i = q.meshPartSelection.model.parts.findIndex(p => p.id === id); return q.meshPartSelection.hideLabels ? "الجزء " + digits(i + 1) : q.meshPartSelection.model.parts[i].label; };
async function choose(page, q, id) {
  const box = page.locator("[data-testid=q-" + q.examQuestionId + "] .mm3d-parts input[aria-label='اختيار " + shown(q, id) + "']");
  await box.scrollIntoViewIfNeeded();
  await box.click();
}
const PERFECT = Object.fromEntries(QS.map(q => [q.examQuestionId, q.answer.correct]));

try {
  // ── the exam page ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  requests.clear(); bytesServed = 0;
  const { page, t0 } = await open();
  const firstReady = await waitState(page, "h1", "ready");
  perf.firstModelReadyMs = firstReady < 0 ? -1 : Date.now() - t0;
  const figures = await page.$$eval("figure.mm3d", fs => fs.map(f => f.dataset.modelId));
  check("the exam page renders the six model questions (student projection) and the first model is ready", firstReady >= 0 && figures.join(",") === QS.map(q => q.meshPartSelection.model.id).join(","), perf.firstModelReadyMs + " ms " + figures.join(","));
  const h3 = await page.textContent("[data-testid=q-h3] .mm3d-parts"), b3 = await page.textContent("[data-testid=q-b3] .mm3d-parts");
  check("hidden-label questions list neutral part names only", h3.includes("الجزء ١") && !/الصمام/.test(h3) && b3.includes("الجزء ٤") && !/الفص/.test(b3), h3.slice(0, 60));
  const html = await page.$eval("main", m => m.innerHTML);
  check("no private key or scoring rule in the student DOM", !/allOrNothing|"scoring"|"correct"|partial/.test(html));

  // spatial answer: click the centre of the heart (anterior view) → a chamber is selected through the GPU pick
  const canvas = page.locator(fig("h1") + " .mm3d-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.62);
  await sleep(300);
  const picked = (await answers(page)).h1;
  check("a click on the model selects the front-most labelled part (GPU pick) and is autosaved as part ids", picked && picked.modelId === "heartChambers" && picked.parts.length === 1 && ["rightVentricle", "leftVentricle", "rightAtrium", "leftAtrium"].includes(picked.parts[0]), JSON.stringify(picked));
  const selAttr = await page.$eval(fig("h1"), f => f.dataset.selected);
  check("the picked part is shown as selected (image highlight state + list + live status)", picked && selAttr === picked.parts[0] && (await page.textContent("[data-testid=q-h1] .mm3d-status")).includes("اخترت"), selAttr);

  // answer every question through the parts lists (single replaces; multiple within the limit)
  const tAnswer = Date.now();
  for (const q of QS) {
    const id = q.examQuestionId;
    await page.locator("[data-testid=q-" + id + "]").scrollIntoViewIfNeeded();
    await waitState(page, id, "ready", 60000);
    for (const p of PERFECT[id]) await choose(page, q, p);
  }
  perf.answerAllMs = Date.now() - tAnswer;
  const a1 = await answers(page);
  check("every answer is autosaved in canonical model order through the shared server binding", QS.every(q => JSON.stringify(a1[q.examQuestionId]?.parts) === JSON.stringify(PERFECT[q.examQuestionId])), JSON.stringify(Object.fromEntries(Object.entries(a1).map(([k, v]) => [k, v.parts]))));
  const limit = await page.$eval("[data-testid=q-h2] .mm3d-parts", ul => [...ul.querySelectorAll("input")].filter(i => !i.checked).every(i => i.disabled));
  check("the selection limit is enforced in the list (h2: max 2)", limit);
  const forged = await page.evaluate(() => window.__exam.forge("h2", { kind: "meshPartSelection", modelId: "heartVessels", parts: ["aorta", "thalamus"] }));
  const afterForge = await answers(page);
  check("a forged answer (unlabelled part) is refused by the binding and not stored", forged.rejected.includes("h2") && !afterForge.h2, JSON.stringify(forged.rejected));
  await choose(page, QS.find(q => q.examQuestionId === "h2"), "aorta");
  await choose(page, QS.find(q => q.examQuestionId === "h2"), "pulmonaryTrunk");

  // scrolled through the whole exam: GL contexts are bounded by what is on screen; each file downloaded once
  let maxLive = 0;
  for (const q of QS) { await page.locator("[data-testid=q-" + q.examQuestionId + "]").scrollIntoViewIfNeeded(); await sleep(250); maxLive = Math.max(maxLive, await live(page)); }
  perf.maxLiveRenderers = maxLive;
  check("scrolling the six-model exam keeps at most 3 live GL contexts (off-screen viewers are parked)", maxLive >= 1 && maxLive <= 3, "max " + maxLive);
  const heartSha = QS[0].meshPartSelection.model.asset.sha256, brainSha = QS[3].meshPartSelection.model.asset.sha256;
  check("each library file is downloaded once for the whole exam (3 questions share it)", requests.get(heartSha) === 1 && requests.get(brainSha) === 1, JSON.stringify([...requests.values()]) + " " + Math.round(bytesServed / 1024) + " KiB");
  perf.bytesDownloaded = bytesServed;
  const gpu = await page.$$eval("figure.mm3d[data-state=ready] .mm3d-scene", s => s.map(e => Number(e.dataset.gpuBytes)));
  perf.gpuBytesPerLiveViewer = gpu;
  check("GPU memory per live viewer stays within 64 MiB", gpu.length > 0 && gpu.every(b => b > 0 && b <= 64 * 1024 * 1024), gpu.map(b => Math.round(b / 1048576) + " MiB").join(", "));

  // context loss mid-exam: status, automatic restore, the answer is untouched
  await page.locator("[data-testid=q-b2]").scrollIntoViewIfNeeded();
  await waitState(page, "b2", "ready");
  const beforeLoss = JSON.stringify((await answers(page)).b2);
  await page.evaluate(() => { const c = document.querySelector("[data-testid=q-b2] .mm3d-canvas"); window.__lose = c.getContext("webgl2").getExtension("WEBGL_lose_context"); window.__lose.loseContext(); });
  const lost = await waitState(page, "b2", "lost", 10000);
  await page.evaluate(() => window.__lose.restoreContext());
  const back = await waitState(page, "b2", "ready", 30000);
  check("context loss mid-exam: status shown, automatic restore, the saved answer is unchanged", lost >= 0 && back >= 0 && JSON.stringify((await answers(page)).b2) === beforeLoss && (await page.$eval(fig("b2"), f => f.dataset.selected)) === PERFECT.b2.join(","), beforeLoss);

  // reload: autosaved answers are restored; grading by the shared authority
  requests.clear();
  await page.reload({ waitUntil: "load" });
  await waitState(page, "h1", "ready");
  const restored = await answers(page);
  const checkedNow = await page.$$eval(".mm3d-parts input:checked", is => is.length);
  check("reload restores every autosaved answer (state and checked parts)", QS.every(q => JSON.stringify(restored[q.examQuestionId]?.parts) === JSON.stringify(PERFECT[q.examQuestionId])) && checkedNow === Object.values(PERFECT).reduce((n, p) => n + p.length, 0), checkedNow + " checked");
  const graded = await page.evaluate(() => window.__exam.grade());
  const total = graded.reduce((n, g) => n + g.score, 0);
  check("the restored answers grade to full marks with the shared authority (no manual review)", total === FULL && graded.every(g => g.correct && !g.manualReview), total + " / " + FULL);

  // 20 mount / unmount cycles of the whole exam: no renderer left, no retained heap
  const heap = () => page.evaluate(async () => { window.gc?.(); await new Promise(r => setTimeout(r, 50)); window.gc?.(); return performance.memory ? performance.memory.usedJSHeapSize : 0; });
  await page.evaluate(() => window.__exam.setMounted(false)); await sleep(200);
  const heap0 = await heap();
  for (let i = 0; i < 20; i++) { await page.evaluate(m => window.__exam.setMounted(m), i % 2 === 0); await sleep(i % 2 === 0 ? 400 : 60); }
  await page.evaluate(() => window.__exam.setMounted(false)); await sleep(300);
  const liveAfter = await live(page), heap1 = await heap();
  perf.heapGrowthAfter20CyclesBytes = heap1 - heap0;
  check("20 mount / unmount cycles of the exam leave no live renderer behind", liveAfter === 0, "live " + liveAfter);
  check("…and no retained JS heap (< 24 MiB growth after GC)", heap0 > 0 && heap1 - heap0 < 24 * 1024 * 1024, Math.round((heap1 - heap0) / 1048576 * 10) / 10 + " MiB");
  await page.evaluate(() => window.__exam.setMounted(true));
  check("remounted exam: answers intact, the visible model comes back", (await waitState(page, "h1", "ready")) >= 0 && JSON.stringify(await answers(page)) === JSON.stringify(restored));

  await page.screenshot({ path: path.join(out, "exam-desktop.png"), fullPage: false });

  // teacher review of the saved answers (real labels for hidden-label questions, marks) — same tab: the autosave lives in its session
  const review = page;
  await review.goto(origin + "/browser-harness/mesh-exam-21db3.html?review=1", { waitUntil: "load" });
  await review.waitForSelector("[data-testid=r-h3] [data-testid=mesh-review-summary]");
  const sums = await review.$$eval("[data-testid=mesh-review-summary]", s => s.map(e => e.textContent));
  const h3review = await review.textContent("[data-testid=r-h3] .mm3d-review-list");
  check("teacher review: every question is exact and the hidden-label question shows the REAL label of the correct part", sums.length === 6 && sums.every(t => t.startsWith("إجابة صحيحة تمامًا")) && h3review.includes("الصمام التاجي") && sums[2].includes("أسماء محايدة"), h3review);
  await review.screenshot({ path: path.join(out, "exam-review.png"), fullPage: false });

  // ── low-memory phone: deviceMemory 2, DPR 3, touch ──────────────────────────────────────────────────────────────────────────────────
  const phone = await open({ width: 390, height: 844, touch: true, scale: 3, init: () => Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => 2 }) });
  const p = phone.page;
  const phoneReady = await waitState(p, "h1", "ready");
  perf.phoneFirstModelReadyMs = phoneReady < 0 ? -1 : Date.now() - phone.t0;
  const ps = await p.$eval(fig("h1") + " .mm3d-scene", e => ({ dpr: Number(e.dataset.dpr), gpu: Number(e.dataset.gpuBytes) }));
  const cv = await p.$eval(fig("h1") + " .mm3d-canvas", c => ({ w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight }));
  perf.phone = { ...ps, ...cv };
  check("low-memory phone (deviceMemory 2, DPR 3): drawing buffer capped at 2×, bounded GPU memory", phoneReady >= 0 && ps.dpr === 2 && cv.w === Math.round(cv.cw * 2) && ps.gpu <= 64 * 1024 * 1024, JSON.stringify(perf.phone));
  const tb = await p.locator(fig("h1") + " .mm3d-canvas").boundingBox();
  await p.touchscreen.tap(tb.x + tb.width * 0.55, tb.y + tb.height * 0.62);
  await sleep(300);
  check("phone: a tap on the model answers the question", ((await answers(p)).h1?.parts.length ?? 0) === 1, JSON.stringify((await answers(p)).h1));
  let phoneLive = 0;
  for (const q of QS) { await p.locator("[data-testid=q-" + q.examQuestionId + "]").scrollIntoViewIfNeeded(); await sleep(250); phoneLive = Math.max(phoneLive, await live(p)); }
  check("phone: scrolling the exam keeps at most 2 live GL contexts", phoneLive >= 1 && phoneLive <= 2, "max " + phoneLive);
  check("@390 px: the exam has no horizontal overflow", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await phone.context.close();

  // ── WebGL unavailable: the whole exam is answerable through the lists and grades identically ───────────────────────────────────────
  const nogl = await open({ init: () => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...r) { return t === "webgl2" || t === "webgl" ? null : o.call(this, t, ...r); }; } });
  const n = nogl.page;
  const fb = await waitState(n, "h1", "fallback");
  check("WebGL unavailable: meaningful fallback note on the exam page", fb >= 0 && (await n.textContent(fig("h1") + " [role=note]")).includes("WebGL"));
  for (const q of QS) for (const part of PERFECT[q.examQuestionId]) await choose(n, q, part);
  const g2 = await n.evaluate(() => window.__exam.grade());
  check("…every question is still answered through the parts lists and grades to full marks", g2.reduce((s, g) => s + g.score, 0) === FULL, g2.map(g => g.id + ":" + g.score).join(" "));
  await nogl.context.close();

  check("no page errors", errors.length === 0, errors.slice(0, 5).join(" | "));
  check("no external asset or network host", foreign.length === 0, foreign.slice(0, 3).join(" "));
  check("harness ran to completion", true);
} catch (e) {
  check("harness ran to completion", false, String(e && e.stack || e));
} finally {
  await browser.close();
  server.close();
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "exam-results.json"), JSON.stringify({ checks, perf }, null, 2) + "\n");
const failed = checks.filter(c => !c.ok);
console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed");
console.log("perf " + JSON.stringify(perf));
process.exit(failed.length ? 1 : 0);
