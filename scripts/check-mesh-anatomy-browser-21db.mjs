#!/usr/bin/env node
// Phase 21D-B.2 — real-Chromium certification of the ANATOMICAL library models and the authoring editor (browser-harness/mesh-anatomy-
// 21db.*), WebGL 2 through ANGLE / SwiftShader (no GPU). The heart and the brain are the SHIPPED files of public/mesh-assets, served at
// their content address exactly as the Static Web App serves them. The checks read the real WebGL image and the GPU pick buffer:
//   • the full models load (SHA-256 verified, validated) and draw every part at full resolution;
//   • ANATOMICAL ORIENTATION, from the parts the GPU pick finds on a grid of screen points: in the heart's anterior view the superior vena
//     cava and the right atrium lie on the viewer's left (the patient's right), the great vessels above the ventricles, the inferior vena
//     cava below the superior one, and the left atrium is the chamber seen from behind; in the brain's right lateral view the frontal lobe
//     is anterior (viewer's right) of the occipital lobe, the temporal lobe below the parietal lobe, the cerebellum posterior-inferior and
//     the medulla lowest;
//   • tissue colours (not grey placeholder), selection by pick + highlight, hide / show, context loss → restore, several models at once,
//     one download per file, phone touch rotation and no overflow;
//   • authoring: library pick → labelled draft → live preview; label edits keep the same GL canvas; capture of the starting view;
//     confirmation before replacing; a server-accepted upload becomes a draft that loads from the content-addressed API route;
//   • performance figures (time to ready, frame time, GPU memory) are recorded in anatomy-results.json.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { testAssemblyModel, writeGlb } from "../src/meshModels/glbWriter.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-21db"), "anatomy");
const checks = [], perf = {};
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + " " + detail); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

const assets = path.join(root, "public/mesh-assets");
const assembly = Buffer.from(writeGlb(testAssemblyModel()));
fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", publicDir: false, build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/mesh-anatomy-21db.html") } } });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const requests = new Map();
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  const lib = u.pathname.match(/^\/mesh-assets\/([0-9a-f]{64})\.glb$/), api = u.pathname.match(/^\/api\/mesh-assets\/runtime\/([0-9a-f]{64})$/);
  if (lib || api) {
    const hex = (lib || api)[1];
    requests.set(hex, (requests.get(hex) || 0) + 1);
    const file = path.join(assets, hex + ".glb");
    const body = lib && fs.existsSync(file) ? fs.readFileSync(file) : api ? assembly : null;
    if (!body) { res.writeHead(404); res.end(); return; }
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
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors = [], foreign = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open({ width = 1280, height = 1000, query = "", touch = false, scale = 1 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: scale });
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text() + (m.location()?.url ? " @ " + m.location().url : "")); });
  page.on("response", r => { if (r.status() >= 400) errors.push("HTTP " + r.status() + " " + r.url()); });
  page.on("request", r => { const u = new URL(r.url()); if (u.origin !== origin && u.protocol !== "data:" && u.protocol !== "blob:") foreign.push(r.url()); });
  const t0 = Date.now();
  await page.goto(origin + "/browser-harness/mesh-anatomy-21db.html" + query, { waitUntil: "load" });
  return { page, t0 };
}
const fig = s => "[data-testid=sec-" + s + "] figure.mm3d";
const scene = s => fig(s) + " .mm3d-scene";
const waitState = async (page, s, want, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { const st = await page.$eval(fig(s), e => e.dataset.state).catch(() => null); if (st === want) return true; await sleep(50); } return false; };
const cam = (page, s) => page.$eval(scene(s), e => ({ yaw: Number(e.dataset.yaw), pitch: Number(e.dataset.pitch), zoom: Number(e.dataset.zoom) }));
const probe = (page, s, fx, fy) => page.evaluate(([id, fx, fy]) => { const r = window.__mesh.renderers[id], c = document.querySelector("[data-testid=sec-" + id + "] .mm3d-canvas"); return r && c ? r.probe(c.clientWidth * fx, c.clientHeight * fy) : null; }, [s, fx, fy]);
/** GPU pick over an n×m grid in the viewer's CURRENT view → { partId: {n, x, y} } (centroid in canvas fractions; y grows downward). */
const pickMap = (page, s, n = 64, m = 48) => page.evaluate(([id, n, m]) => {
  const r = window.__mesh.renderers[id], c = document.querySelector("[data-testid=sec-" + id + "] .mm3d-canvas"), sc = document.querySelector("[data-testid=sec-" + id + "] .mm3d-scene"), f = sc.closest("figure");
  const parts = [...f.querySelectorAll(".mm3d-parts li[data-part]")].map(li => li.getAttribute("data-part"));
  const state = { camera: { yaw: Number(sc.dataset.yaw), pitch: Number(sc.dataset.pitch), zoom: Number(sc.dataset.zoom) }, hidden: new Set((f.dataset.hidden || "").split(",").filter(Boolean)), selected: new Set(), hover: null, selectable: new Set(parts), marks: new Map() };
  const acc = {}, grid = [];
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) grid.push([(i + 0.5) / n, (j + 0.5) / m]);
  r.pickMany(grid.map(([fx, fy]) => [c.clientWidth * fx, c.clientHeight * fy]), state).forEach((hit, k) => {
    if (!hit) return;
    const a = acc[hit] || (acc[hit] = { n: 0, x: 0, y: 0 });
    a.n++; a.x += grid[k][0]; a.y += grid[k][1];
  });
  for (const k of Object.keys(acc)) { acc[k].x = Math.round((acc[k].x / acc[k].n) * 1000) / 1000; acc[k].y = Math.round((acc[k].y / acc[k].n) * 1000) / 1000; }
  return acc;
}, [s, n, m]);
const statsOf = (page, s) => page.$eval(scene(s), e => ({ draws: Number(e.dataset.draws), tris: Number(e.dataset.triangles), gpu: Number(e.dataset.gpuBytes), samples: Number(e.dataset.samples), dpr: Number(e.dataset.dpr) }));
const frameTime = (page, s, frames = 12) => page.evaluate(([id, frames]) => {
  const r = window.__mesh.renderers[id], c = document.querySelector("[data-testid=sec-" + id + "] .mm3d-canvas");
  r.probe(c.clientWidth / 2, c.clientHeight / 2);                                                 // warm
  const t = performance.now();
  for (let i = 0; i < frames; i++) r.probe(c.clientWidth / 2, c.clientHeight / 2);              // render + synchronous read-back
  return Math.round(((performance.now() - t) / frames) * 10) / 10;
}, [s, frames]);
const tissue = p => p && p[0] > 90 && p[0] > p[1] * 1.6 && p[0] > p[2] * 1.5;                       // cardiac red, not a grey placeholder
const bgLike = p => p && Math.abs(p[0] - 244) < 8 && Math.abs(p[1] - 247) < 8 && Math.abs(p[2] - 251) < 8;

try {
  // ── heart: full model, orientation, colour, selection, hide, context loss ─────────────────────────────────────────────────────────
  const { page, t0 } = await open({ query: "?only=heart" });
  const heartReady = await waitState(page, "heart", "ready");
  perf.heartReadyMs = Date.now() - t0;
  const hs = await statsOf(page, "heart");
  perf.heart = hs;
  check("heart: the shipped library file loads (SHA-256 verified, validated) and draws all 14 parts at full resolution", heartReady && hs.draws === 14 && hs.tris === 99207, perf.heartReadyMs + " ms " + JSON.stringify(hs));
  await sleep(300);
  await page.screenshot({ path: path.join(out, "heart-anterior.png"), clip: await page.locator(scene("heart")).boundingBox() });
  const t1 = Date.now();
  const front = await pickMap(page, "heart");
  perf.pickGridMs = Date.now() - t1;
  console.log("heart anterior parts", JSON.stringify(front));
  const has = (map, ...ids) => ids.every(id => map[id] && map[id].n > 0);
  check("heart anterior view shows the chambers and the great vessels", Object.keys(front).length >= 7 && has(front, "aorta", "pulmonaryTrunk", "superiorVenaCava", "rightAtrium"), Object.keys(front).join(","));
  check("orientation: superior vena cava and right atrium on the viewer's left (the patient's right) of the aorta / pulmonary trunk",
    has(front, "superiorVenaCava", "aorta", "rightAtrium", "pulmonaryTrunk") && front.superiorVenaCava.x < front.aorta.x && front.rightAtrium.x < front.pulmonaryTrunk.x, JSON.stringify({ svc: front.superiorVenaCava, ao: front.aorta, ra: front.rightAtrium, pt: front.pulmonaryTrunk }));
  const ventricleY = Math.max(...["rightVentricle", "leftVentricle"].filter(id => front[id]).map(id => front[id].y));
  check("orientation: the great vessels sit above the ventricles; the inferior vena cava below the superior one",
    Number.isFinite(ventricleY) && front.aorta.y < ventricleY && front.pulmonaryTrunk.y < ventricleY && (!front.inferiorVenaCava || front.inferiorVenaCava.y > front.superiorVenaCava.y), "ventricles y " + ventricleY);
  const c0 = await probe(page, "heart", front.rightAtrium.x, front.rightAtrium.y);
  check("tissue colour: the atrial wall renders cardiac red (PBR, lit), not a grey placeholder", tissue(c0), JSON.stringify(c0));
  check("background stays clear around the model", bgLike(await probe(page, "heart", 0.03, 0.04)));
  // posterior view: the left atrium is the chamber seen from behind
  for (let i = 0; i < 12; i++) await page.click(fig("heart") + " button[aria-label='تدوير لليمين']");
  await sleep(250);
  const back = await pickMap(page, "heart");
  console.log("heart posterior parts", JSON.stringify(back));
  check("orientation: turned to the posterior view, the left atrium is prominent (it is the most posterior chamber)", has(back, "leftAtrium") && back.leftAtrium.n >= (front.leftAtrium?.n ?? 0) * 2 && back.leftAtrium.n >= 40, "front " + (front.leftAtrium?.n ?? 0) + " → back " + back.leftAtrium?.n);
  await page.screenshot({ path: path.join(out, "heart-posterior.png"), clip: await page.locator(scene("heart")).boundingBox() });
  await page.click(fig("heart") + " button:has-text('إعادة العرض')");
  await sleep(250);
  // pick-select the aorta, highlight; hide the right atrium → the pick reaches what lies behind it
  const box = await page.locator(scene("heart")).boundingBox();
  await page.mouse.click(box.x + box.width * front.aorta.x, box.y + box.height * front.aorta.y);
  await sleep(200);
  check("clicking the aorta selects it (GPU pick on the real model)", (await page.textContent("[data-testid=heart-selected]")) === "aorta");
  const hl = await probe(page, "heart", front.aorta.x, front.aorta.y);
  check("the selected part is highlighted in the image", hl && hl[0] > 170 && hl[1] > 80, JSON.stringify(hl));
  await page.click(fig("heart") + " li[data-part=rightAtrium] .mm3d-hide");
  await sleep(200);
  const hidden = await pickMap(page, "heart");
  check("hiding the right atrium removes it from the image and from picking", !hidden.rightAtrium, Object.keys(hidden).join(","));
  await page.click(fig("heart") + " li[data-part=rightAtrium] .mm3d-hide");
  perf.heartFrameMs = await frameTime(page, "heart");
  check("frame time of the full heart on CPU rendering (SwiftShader) is interactive-capable", perf.heartFrameMs < 1500, perf.heartFrameMs + " ms per frame (render + read-back)");
  check("GPU memory of the heart stays within the renderer's budget", hs.gpu > 0 && hs.gpu < 64 * 1024 * 1024, (hs.gpu / 1048576).toFixed(1) + " MB");
  await page.evaluate(() => { const c = document.querySelector("[data-testid=sec-heart] .mm3d-canvas"); window.__lose = c.getContext("webgl2").getExtension("WEBGL_lose_context"); window.__lose.loseContext(); });
  const lost = await waitState(page, "heart", "lost", 5000);
  await page.evaluate(() => window.__lose.restoreContext());
  const restored = await waitState(page, "heart", "ready", 15000);
  await sleep(300);
  check("context loss on the real model: status shown, automatic restore, the heart is drawn again", lost && restored && tissue(await probe(page, "heart", front.rightAtrium.x, front.rightAtrium.y)));
  await page.close();

  // ── brain: lateral view orientation ──────────────────────────────────────────────────────────────────────────────────────────────
  const b = await open({ query: "?only=brain" });
  const brainReady = await waitState(b.page, "brain", "ready");
  perf.brainReadyMs = Date.now() - b.t0;
  const bs = await statsOf(b.page, "brain");
  perf.brain = bs;
  check("brain: the shipped library file loads and draws all 10 parts", brainReady && bs.draws === 10 && bs.tris === 118856, perf.brainReadyMs + " ms " + JSON.stringify(bs));
  await sleep(300);
  await b.page.screenshot({ path: path.join(out, "brain-lateral.png"), clip: await b.page.locator(scene("brain")).boundingBox() });
  const lat = await pickMap(b.page, "brain");
  console.log("brain lateral parts", JSON.stringify(lat));
  check("brain lateral view shows the four lobes and the cerebellum", has(lat, "frontalLobe", "parietalLobe", "temporalLobe", "occipitalLobe", "cerebellum"), Object.keys(lat).join(","));
  check("orientation (right lateral view): frontal lobe anterior — on the viewer's right — of the occipital lobe, parietal between them",
    has(lat, "frontalLobe", "occipitalLobe", "parietalLobe") && lat.frontalLobe.x > lat.parietalLobe.x && lat.parietalLobe.x > lat.occipitalLobe.x, JSON.stringify({ f: lat.frontalLobe, p: lat.parietalLobe, o: lat.occipitalLobe }));
  check("orientation: temporal lobe below the parietal lobe; cerebellum posterior to the temporal lobe and below the occipital lobe",
    has(lat, "temporalLobe", "cerebellum") && lat.temporalLobe.y > lat.parietalLobe.y && lat.cerebellum.x < lat.temporalLobe.x && lat.cerebellum.y > lat.occipitalLobe.y, JSON.stringify({ t: lat.temporalLobe, c: lat.cerebellum }));
  const stem = ["medullaOblongata", "pons"].filter(id => lat[id]);
  check("orientation: the brainstem is the lowest structure", stem.length > 0 && stem.every(id => lat[id].y > lat.temporalLobe.y), JSON.stringify(Object.fromEntries(stem.map(id => [id, lat[id]]))));
  perf.brainFrameMs = await frameTime(b.page, "brain");
  check("frame time of the full brain on CPU rendering (SwiftShader)", perf.brainFrameMs < 1500, perf.brainFrameMs + " ms per frame");
  await b.page.close();

  // ── several anatomical models on one page; one download per file ──────────────────────────────────────────────────────────────────
  requests.clear();
  const tall = (await open({ height: 4200, query: "" })).page;
  const all = await Promise.all(["heart", "brain", "heart2"].map(s => waitState(tall, s, "ready")));
  const live = await tall.evaluate(() => window.__mesh.liveCount());
  check("heart + brain + a second heart on one page render at once", all.every(Boolean) && live === 3, "live contexts " + live);
  const heartHex = fs.readdirSync(assets).find(f => f.startsWith("61e01bcf")).slice(0, 64);
  check("each anatomical file is downloaded once and shared by the viewers that show it", requests.get(heartHex) === 1, JSON.stringify(Object.fromEntries([...requests].map(([k, v]) => [k.slice(0, 8), v]))));
  perf.gpuThreeModelsMB = Math.round((await tall.evaluate(() => [...document.querySelectorAll(".mm3d-scene")].reduce((s, e) => s + Number(e.dataset.gpuBytes || 0), 0))) / 104857.6) / 10;
  await tall.close();

  // ── authoring editor ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  const e = (await open({ query: "?only=editor" })).page;
  await e.waitForSelector("[data-testid=mesh-model-editor]");
  await e.click(".mm3d-lib li[data-asset=human-heart-bp3d] button");
  const seePreview = () => e.locator(fig("editor")).scrollIntoViewIfNeeded();             // the viewer parks while off screen (by design)
  await seePreview();
  const edReady = await waitState(e, "editor", "ready");
  check("editor: choosing the heart creates a labelled draft (14 rows) with a live student preview", edReady && (await e.$$(".mm3d-part-rows li")).length === 14 && (await e.$$("[data-testid=sec-editor] .mm3d-parts li")).length === 14);
  await e.evaluate(() => { window.__canvas = document.querySelector("[data-testid=sec-editor] .mm3d-canvas"); });
  await e.fill("[aria-label='تسمية الجزء aorta']", "الأبهر الصاعد وقوسه");
  await e.click("[aria-label='تضمين الجزء cardiacVeins']");
  await seePreview();
  await sleep(300);
  const sameCanvas = await e.evaluate(() => document.querySelector("[data-testid=sec-editor] .mm3d-canvas") === window.__canvas);
  check("label edits and part choices update the preview without recreating the GL context", sameCanvas && (await e.textContent("[data-testid=sec-editor] .mm3d-parts")).includes("الأبهر الصاعد وقوسه") && (await e.$$("[data-testid=sec-editor] .mm3d-parts li")).length === 13);
  await e.focus(scene("editor"));
  for (let i = 0; i < 4; i++) await e.keyboard.press("ArrowRight");
  await sleep(200);
  const yawNow = (await cam(e, "editor")).yaw;
  await e.click("button:has-text('اعتماد العرض الحالي في المعاينة')");
  await sleep(100);
  const d1 = await e.evaluate(() => window.__mesh.draft());
  check("the starting view is captured from the preview", Math.abs(d1.camera.azimuth - yawNow) < 0.002 && d1.parts.length === 13 && d1.parts.find(p => p.id === "aorta").label === "الأبهر الصاعد وقوسه", JSON.stringify(d1.camera));
  await e.click(".mm3d-lib li[data-asset=human-brain-bp3d] button");
  check("replacing a labelled model asks for confirmation", (await e.textContent("[role=alertdialog]")).includes("يحذف تسميات"));
  await e.click("button:has-text('إلغاء')");
  await e.click("[role=tab]:has-text('نماذجي المرفوعة')");
  await e.setInputFiles("input[type=file]", { name: "assembly.glb", mimeType: "model/gltf-binary", buffer: assembly });
  await e.waitForSelector("[role=alertdialog]");
  await e.click("button:has-text('استبدال النموذج')");
  await seePreview();
  const upReady = await waitState(e, "editor", "ready");
  const d2 = await e.evaluate(() => window.__mesh.draft());
  check("a server-accepted upload becomes a draft that loads from the content-addressed API route", upReady && d2.asset.source === "upload" && d2.parts.length === 5 && d2.id === "authoredModel", JSON.stringify(d2.asset).slice(0, 80));
  await e.fill("[aria-label='تسمية الجزء ball']", "");
  await seePreview();
  check("an invalid label is explained and the preview keeps the last valid model", (await e.textContent("[data-testid=mesh-editor-issues]")).includes("النص فارغ") && await waitState(e, "editor", "ready"));
  await e.screenshot({ path: path.join(out, "editor.png"), fullPage: true });
  await e.close();

  // ── phone ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const phone = (await open({ width: 390, height: 844, touch: true, scale: 3, query: "?only=heart" })).page;
  await waitState(phone, "heart", "ready");
  const pb = await phone.locator(scene("heart")).boundingBox();
  const cdp = await phone.context().newCDPSession(phone);
  const touch = async (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([px, py], id) => ({ x: px, y: py, id })) });
  const cx = pb.x + pb.width / 2, cy = pb.y + pb.height / 2;
  await touch("touchStart", [[cx, cy]]); for (let i = 1; i <= 8; i++) await touch("touchMove", [[cx + i * 15, cy]]); await touch("touchEnd", []);
  await sleep(700);
  check("phone: one-finger drag rotates the heart", Math.abs((await cam(phone, "heart")).yaw) > 0.3, JSON.stringify(await cam(phone, "heart")));
  const ov = await phone.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  check("@390 px: no horizontal overflow", ov.sw <= ov.iw, JSON.stringify(ov));
  await phone.screenshot({ path: path.join(out, "phone-heart.png") });
  await phone.close();
  const ed = (await open({ width: 390, height: 844, touch: true, scale: 2, query: "?only=editor" })).page;
  await ed.click(".mm3d-lib li[data-asset=human-brain-bp3d] button");
  await ed.locator(fig("editor")).scrollIntoViewIfNeeded();
  await waitState(ed, "editor", "ready");
  const ov2 = await ed.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  check("@390 px: the editor has no horizontal overflow", ov2.sw <= ov2.iw, JSON.stringify(ov2));
  await ed.close();

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  check("no external asset or network host", foreign.length === 0, foreign.slice(0, 3).join(" "));
} catch (e) {
  check("harness ran to completion", false, String(e && e.stack || e).slice(0, 600));
} finally {
  await browser.close();
  server.close();
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "anatomy-results.json"), JSON.stringify({ checks, perf }, null, 2) + "\n");
console.log("performance", JSON.stringify(perf));
const failed = checks.filter(c => !c.ok);
console.log(failed.length ? failed.length + " CHECK(S) FAILED" : "ALL " + checks.length + " CHECKS PASSED");
process.exit(failed.length ? 1 : 0);
