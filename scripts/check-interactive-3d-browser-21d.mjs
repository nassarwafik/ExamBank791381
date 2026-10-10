#!/usr/bin/env node
// Phase 21D — real Chromium certification + measurement of the PRODUCTION 3D renderer (browser-harness/interactive-3d-21d.*).
// Interaction is driven through the Chrome DevTools protocol (real mouse / touch / wheel input reaching the page's event pipeline),
// rendering is observed in the DOM the renderer produces, and frame timing is measured with requestAnimationFrame + long-task entries.
// Run after `npm run build` is possible; requires playwright-core and a Chromium (same provider as the 17F / 21A.x / 21C harnesses).
// MEASURE_ONLY=1 prints the measurements without pass / fail certification (used for the before / after comparison).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-21d"));
const measureOnly = process.env.MEASURE_ONLY === "1";
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + " " + detail); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/interactive-3d-21d.html") } } });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [], report = { measurements: {}, probes: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : NaN; };

/** The visible drawing of one viewer as a signature (changes iff the projection changes). */
const signature = (page, sel) => page.evaluate(s => {
  const svg = document.querySelector(s + " .i3d-scene");
  if (!svg) return null;
  return [...svg.querySelectorAll("polygon,path,line,circle")].slice(0, 400).map(n => n.getAttribute("points") ?? n.getAttribute("d") ?? (n.hasAttribute("x1") ? [n.getAttribute("x1"), n.getAttribute("y1"), n.getAttribute("x2"), n.getAttribute("y2")].join(",") : n.getAttribute("cx"))).join("|");
}, sel);
const bbox = (page, sel) => page.evaluate(s => {
  const svg = document.querySelector(s + " .i3d-scene");
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of svg.querySelectorAll("polygon,path")) { const b = n.getBBox(); if (!b.width && !b.height) continue; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); }
  return { w: x1 - x0, h: y1 - y0 };
}, sel);
async function open(width, height, opts = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: opts.dpr ?? 1, hasTouch: !!opts.touch, isMobile: !!opts.touch });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(origin + "/browser-harness/interactive-3d-21d.html" + (opts.only ? "?only=" + opts.only : ""), { waitUntil: "networkidle" });
  await page.waitForSelector(".i3d-scene");
  return page;
}
async function centerOf(page, sel) { await page.locator(sel + " .i3d-scene").scrollIntoViewIfNeeded(); const b = await page.locator(sel + " .i3d-scene").boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }; }
/** A continuous mouse drag at `hz` events per second for `ms`, through CDP (real input pipeline), while frames are recorded and the
 *  renderer's main-thread cost is read from the DevTools Performance domain (task / script / layout / style time during the drag). */
async function measuredDrag(page, sel, { ms = 2000, hz = 125, dxTotal = 600, throttle = 1 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const c = await centerOf(page, sel);
  const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
  await page.evaluate(() => {
    window.__frames = []; window.__long = []; window.__run = true;
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: "longtask", buffered: false }); } catch { /* unsupported */ }
    const f = t => { window.__frames.push(t); if (window.__run) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  const m0 = await metric();
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", buttons: 1, clickCount: 1 });
  const n = Math.round(ms * hz / 1000), started = Date.now();
  for (let i = 1; i <= n; i++) {
    // a back-and-forth sweep (reversals included) across the viewer
    const phase = i / n, x = c.x + Math.sin(phase * Math.PI * 4) * Math.min(dxTotal, c.w * .45), y = c.y + Math.sin(phase * Math.PI * 2) * c.h * .2;
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
    const due = started + i * 1000 / hz - Date.now(); if (due > 0) await sleep(due);
  }
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", buttons: 0, clickCount: 1 });
  const m1 = await metric();
  await sleep(300);
  const r = await page.evaluate(() => { window.__run = false; return { frames: window.__frames, long: window.__long }; });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const dts = r.frames.slice(1).map((t, i) => t - r.frames[i]).filter(d => d > 0), d = k => Math.round((m1[k] - m0[k]) * 1000);
  return { frames: dts.length, medianFps: Math.round(1000 / pct(dts, .5) * 10) / 10, p95FrameMs: Math.round(pct(dts, .95) * 10) / 10, maxFrameMs: Math.round(Math.max(...dts) * 10) / 10,
    over33ms: dts.filter(x => x > 33.4).length, longTasks: r.long.length, longTaskMs: Math.round(r.long.reduce((a, b) => a + b, 0)),
    mainThreadBusyMs: d("TaskDuration"), scriptMs: d("ScriptDuration"), layoutMs: d("LayoutDuration"), styleMs: d("RecalcStyleDuration"), events: n };
}
const attr = (page, sel, name) => page.locator(sel + " .i3d-scene").getAttribute(name);
const num = async (page, sel, name) => Number(await attr(page, sel, name));
const btn = (page, sel, label) => page.locator(sel + " .i3d-controls").getByRole("button", { name: label, exact: true });
const settled = (page, sel) => page.waitForFunction(s => !document.querySelector(s + " .i3d-scene").hasAttribute("data-interacting"), sel, { timeout: 5000 });
/** The real SVG polygon of `target` that is on top at its own centre (so a click there hits it, as a student's click would). */
const topmostTargetPoint = (page, sel, target) => page.evaluate(([s, t]) => {
  for (const p of document.querySelectorAll(s + ' [data-i3d-target="' + t + '"]')) {
    const b = p.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
    if (b.width > 3 && b.height > 3 && document.elementFromPoint(x, y) === p) return { x, y };
  }
  return null;
}, [sel, target]);
async function dragBy(page, c, dx, dy, steps = 14) { await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + dx, c.y + dy, { steps }); await page.mouse.up(); }
// SKIP_CERT=1 runs the measurements only (used while tuning; the certification run never sets it)
const certify = process.env.SKIP_CERT !== "1";
async function section(name, fn) { if (!certify) return; try { await fn(); } catch (e) { check(name + " (section completed)", false, String(e).split("\n")[0]); } }

try {
  // ── measurements (desktop 1280 px, then a 4× CPU-throttled 390 px mobile profile) ───────────────────────────────────────────
  for (const [profile, w, h, throttle] of [["desktop", 1280, 900, 1], ["mobile-4x-cpu", 390, 844, 4]]) {
    for (const model of ["cube", "sphere", "heart"]) {
      const t0 = Date.now(); const page = await open(w, h, { only: model }); const init = Date.now() - t0;
      const m = await measuredDrag(page, '[data-testid="model-' + model + '"]', { throttle });
      report.measurements[profile + ":" + model] = { ...m, pageLoadToSceneMs: init, polygons: await page.evaluate(() => document.querySelectorAll(".i3d-scene polygon,.i3d-scene path").length),
        svgNodes: await page.evaluate(() => document.querySelectorAll(".i3d-scene *").length) };
      console.log("MEASURE", profile, model, JSON.stringify(report.measurements[profile + ":" + model]));
      await page.close();
    }
  }
  // PERF_GATE=0 records the frame metrics without gating on them: a shared CI runner's CPU speed is not controlled, so the gate is
  // applied on the certification machine (docs/phase21d-3d-performance.md) and CI keeps the numbers in its artifact
  if (!measureOnly && process.env.PERF_GATE !== "0") {
    for (const [k, m] of Object.entries(report.measurements)) {
      const desktop = k.startsWith("desktop");
      check("3D-PERF " + k + " frame pacing", desktop ? m.medianFps >= 55 && m.over33ms <= Math.ceil(m.frames * .02) : m.medianFps >= 50 && m.p95FrameMs <= 34,
        "medianFps=" + m.medianFps + " p95=" + m.p95FrameMs + "ms over33=" + m.over33ms + "/" + m.frames + " busy=" + m.mainThreadBusyMs + "ms");
    }
  }
  // ── desktop interaction certification on the full demonstration page ─────────────────────────────────────────────────────
  if (certify) {
    const page = await open(1024, 900);
    page.setDefaultTimeout(5000);
    const heart = '[data-testid="model-heart"]', cube = '[data-testid="model-cube"]', sphere = '[data-testid="model-sphere"]', exam = '[data-testid="exam"]';
    const heartStart = await signature(page, heart), heartCam = { yaw: await num(page, heart, "data-yaw"), pitch: await num(page, heart, "data-pitch"), zoom: await num(page, heart, "data-zoom") };
    await section("3D-ROT-01", async () => {
      const c = await centerOf(page, heart), y0 = await num(page, heart, "data-yaw");
      await dragBy(page, c, 160, 0); await sleep(500);
      const y1 = await num(page, heart, "data-yaw");
      report.probes.heartDragRotates = (await signature(page, heart)) !== heartStart;
      check("3D-ROT-01 a horizontal mouse drag turns the heart about the vertical axis", report.probes.heartDragRotates && Math.abs(y1 - y0) > .3, "yaw " + y0 + " → " + y1);
    });
    await section("3D-ROT-02", async () => {
      const c = await centerOf(page, heart), p0 = await num(page, heart, "data-pitch");
      await dragBy(page, c, 0, 90); await sleep(500);
      const p1 = await num(page, heart, "data-pitch");
      await dragBy(page, c, 0, -2000, 30); await sleep(600);
      const p2 = await num(page, heart, "data-pitch"), polys = await page.locator(heart + " polygon.i3d-face").count();
      check("3D-ROT-02 a vertical drag tilts the view; an extreme drag stops at the pitch limit with the model still drawn",
        Math.abs(p1 - p0) > .2 && Math.abs(p2) <= 1.45 + 1e-9 && Math.abs(p2) > 1.4 && polys > 0, "pitch " + p0 + " → " + p1 + " → " + p2 + " polygons=" + polys);
    });
    await section("3D-ROT-03", async () => {
      const cc = await centerOf(page, cube), sigs = [await signature(page, cube)], yaws = [];
      const sweep = async () => { await page.mouse.move(cc.x - cc.w * .3, cc.y); await page.mouse.down(); await page.mouse.move(cc.x + cc.w * .3, cc.y, { steps: 20 }); await page.mouse.up(); await settled(page, cube); };
      for (let i = 0; i < 6; i++) { await sweep(); sigs.push(await signature(page, cube)); yaws.push(await num(page, cube, "data-yaw")); }
      report.probes.keepsRotatingAfterSweeps = sigs.slice(1).every((s, i) => s !== sigs[i]);
      check("3D-ROT-03 six sweeps across the viewer in one direction each keep turning the cube (no rotation wall)", report.probes.keepsRotatingAfterSweeps, "yaws " + yaws.join(","));
      check("3D-ROT-03 dragging never selects page text", await page.evaluate(() => (getSelection()?.toString() ?? "") === ""));
    });
    await section("3D-ROT-04", async () => {
      const c = await centerOf(page, heart);
      await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 60, c.y, { steps: 6 });
      const during = await attr(page, heart, "data-interacting"), qDuring = await attr(page, heart, "data-quality");
      await page.mouse.up(); await sleep(1800);
      const after = await attr(page, heart, "data-interacting"), qAfter = await attr(page, heart, "data-quality");
      check("3D-ROT-04 interaction state: lighter mesh while dragging, full mesh once the motion settles", during === "true" && after === null && qAfter !== null,
        "during=" + during + "/" + qDuring + " after=" + after + "/" + qAfter);
    });
    await section("3D-SIZE", async () => {
      await page.locator(sphere + " .i3d-scene").focus();
      const sizes = [];
      for (let i = 0; i < 24; i++) { sizes.push(await bbox(page, sphere)); await page.keyboard.press("ArrowRight"); await sleep(30); }
      const ws = sizes.map(s => s.w), hs = sizes.map(s => s.h);
      report.probes.sphereSizeRatio = Math.round(Math.max(...ws) / Math.min(...ws) * 1000) / 1000;
      report.probes.sphereHeightRatio = Math.round(Math.max(...hs) / Math.min(...hs) * 1000) / 1000;
      check("3D-SIZE the drawn sphere keeps its size while it turns (no orientation pulse)", report.probes.sphereSizeRatio < 1.01 && report.probes.sphereHeightRatio < 1.01, "w " + report.probes.sphereSizeRatio + " h " + report.probes.sphereHeightRatio);
    });
    await section("3D-ZOOM-01", async () => {
      // unfocused: a plain wheel over the model scrolls the PAGE and leaves the model alone
      await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
      const sc = await centerOf(page, sphere), zBefore = await num(page, sphere, "data-zoom"), scroll0 = await page.evaluate(() => scrollY);
      await page.mouse.move(sc.x, sc.y); await page.mouse.wheel(0, 300); await sleep(400);
      const scroll1 = await page.evaluate(() => scrollY), zUnfocused = await num(page, sphere, "data-zoom");
      check("3D-ZOOM-01 an unfocused viewer leaves the wheel to the page (scrolls, no zoom)", scroll1 > scroll0 && zUnfocused === zBefore, "scrollY " + scroll0 + " → " + scroll1 + " zoom " + zUnfocused);
      // focused: the wheel zooms, within the limits, and does not scroll the page
      const cc = await centerOf(page, cube);
      await page.locator(cube + " .i3d-scene").focus();
      const z0 = await num(page, cube, "data-zoom"), b0 = await bbox(page, cube), s0 = await page.evaluate(() => scrollY);
      await page.mouse.move(cc.x, cc.y); await page.mouse.wheel(0, -240); await sleep(300);
      const z1 = await num(page, cube, "data-zoom"), b1 = await bbox(page, cube), s1 = await page.evaluate(() => scrollY);
      report.probes.wheelZoom = Math.round(b1.w / b0.w * 1000) / 1000;
      check("3D-ZOOM-01 the wheel over a focused viewer zooms the model and not the page", z1 > z0 && b1.w > b0.w * 1.05 && s1 === s0, "zoom " + z0 + " → " + z1 + " size×" + report.probes.wheelZoom + " scroll " + s0 + "/" + s1);
      for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -400);
      await sleep(300); const zMax = await num(page, cube, "data-zoom");
      for (let i = 0; i < 60; i++) await page.mouse.wheel(0, 400);
      await sleep(300); const zMin = await num(page, cube, "data-zoom");
      check("3D-ZOOM-01 zoom stays inside [0.55, 2.2]", zMax === 2.2 && zMin === .55, "max " + zMax + " min " + zMin);
      // Ctrl+wheel (trackpad pinch) zooms even without focus
      await page.evaluate(() => document.activeElement?.blur?.());
      const zc0 = await num(page, cube, "data-zoom");
      await page.keyboard.down("Control"); await page.mouse.wheel(0, -300); await page.keyboard.up("Control"); await sleep(300);
      check("3D-ZOOM-01 Ctrl+wheel (trackpad pinch) zooms without focus", (await num(page, cube, "data-zoom")) > zc0);
      await btn(page, cube, "تكبير").click(); const zb = await num(page, cube, "data-zoom");
      await btn(page, cube, "عرض النموذج كاملًا").click(); const zf = await num(page, cube, "data-zoom"), fitBox = await bbox(page, cube);
      const vb = await page.locator(cube + " .i3d-scene").evaluate(s => ({ width: s.viewBox.baseVal.width, height: s.viewBox.baseVal.height }));
      check("3D-ZOOM-01 'fit view' restores zoom 1 with the whole model inside the viewer", zf === 1 && fitBox.w < vb.width && fitBox.h < vb.height,
        "zoom after + " + zb + " → fit " + zf + ", drawing " + Math.round(fitBox.w) + "×" + Math.round(fitBox.h) + " in " + vb.width + "×" + vb.height);
    });
    await section("3D-RESET-01", async () => {
      await btn(page, heart, "إعادة العرض").click(); await sleep(100);
      const cam = { yaw: await num(page, heart, "data-yaw"), pitch: await num(page, heart, "data-pitch"), zoom: await num(page, heart, "data-zoom") };
      check("3D-RESET-01 'reset view' returns the rotated, tilted heart to its authored camera and drawing",
        JSON.stringify(cam) === JSON.stringify(heartCam) && (await signature(page, heart)) === heartStart, JSON.stringify(cam));
    });
    await section("3D-KEY", async () => {
      await page.locator(heart + " .i3d-scene").focus();
      const s0 = await page.evaluate(() => scrollY), y0 = await num(page, heart, "data-yaw"), z0 = await num(page, heart, "data-zoom");
      await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("+"); await sleep(100);
      const y1 = await num(page, heart, "data-yaw"), z1 = await num(page, heart, "data-zoom"), s1 = await page.evaluate(() => scrollY);
      await page.keyboard.press("Home"); await sleep(100);
      check("3D-KEY arrows rotate, + zooms, Home resets, and the page does not scroll", y1 !== y0 && z1 > z0 && s1 === s0 && (await signature(page, heart)) === heartStart, "yaw " + y0 + "→" + y1 + " zoom " + z0 + "→" + z1);
    });
    await section("3D-AUTO", async () => {
      const toggle = page.locator(cube + " .i3d-controls button[aria-pressed]");
      await toggle.click(); const y0 = await num(page, cube, "data-yaw"); await sleep(600);
      const y1 = await num(page, cube, "data-yaw"), pressed = await toggle.getAttribute("aria-pressed");
      const cc = await centerOf(page, cube); await page.mouse.move(cc.x, cc.y); await page.mouse.down(); await page.mouse.up(); await sleep(120);
      const y2 = await num(page, cube, "data-yaw"); await sleep(500); const y3 = await num(page, cube, "data-yaw");
      check("3D-AUTO auto-rotate turns the model and stops on the first touch of the viewer", y1 !== y0 && pressed === "true" && y3 === y2 && (await toggle.getAttribute("aria-pressed")) === "false", "yaw " + y0 + "→" + y1 + " then " + y2 + "=" + y3);
    });
    await section("3D-MODES", async () => {
      const select = page.locator(cube + ' .i3d-options select').first(), modes = {};
      for (const m of ["wireframe", "transparent", "solid", "solidEdges"]) {
        await select.selectOption(m);
        modes[m] = await page.locator(cube + " .i3d-scene").evaluate(s => ({ mode: s.getAttribute("data-mode"), faces: s.querySelectorAll("polygon.i3d-face").length, lines: s.querySelectorAll("line.i3d-line").length,
          maxOpacity: Math.max(0, ...[...s.querySelectorAll("polygon.i3d-face")].map(p => Number(p.getAttribute("fill-opacity") ?? 1))) }));
      }
      check("3D-MODES wireframe / transparent / solid / solid+edges render as named", modes.wireframe.faces === 0 && modes.wireframe.lines >= 12 && modes.transparent.faces === 6 && modes.transparent.maxOpacity <= .38
        && modes.solid.faces === 3 && modes.solidEdges.faces === 3 && modes.solidEdges.lines > modes.solid.lines, JSON.stringify(modes));
      const q = page.locator(sphere + ' .i3d-options select').nth(1), counts = {};
      for (const level of ["low", "medium", "high"]) { await q.selectOption(level); counts[level] = { quality: await attr(page, sphere, "data-quality"), polys: await page.locator(sphere + " polygon.i3d-face").count() }; }
      await q.selectOption("auto");
      check("3D-QUALITY low < medium < high detail, as selected", counts.low.quality === "low" && counts.high.quality === "high" && counts.low.polys < counts.medium.polys && counts.medium.polys < counts.high.polys, JSON.stringify(counts));
    });
    await section("3D-EXAM-01", async () => {
      await page.locator(exam).scrollIntoViewIfNeeded();
      const answer = () => page.locator('[data-testid="exam-answer"]').textContent();
      const pt = await topmostTargetPoint(page, exam, "object:leftVentricle");
      if (!pt) throw new Error("left ventricle not reachable on screen");
      await page.mouse.click(pt.x, pt.y); await sleep(150);
      const a1 = await answer();
      check("3D-EXAM-01 a student's click on the drawn left ventricle selects it", a1.includes("object:leftVentricle"), a1);
      const ec = await centerOf(page, exam), e0 = await signature(page, exam);
      await dragBy(page, ec, 150, 20); await settled(page, exam);
      // once the motion has settled, the student's view must stay put through further timer ticks (each re-derives the question)
      const e1 = await signature(page, exam), yaw1 = await num(page, exam, "data-yaw"), a2 = await answer(); await sleep(2300);
      const e2 = await signature(page, exam), yaw2 = await num(page, exam, "data-yaw"), a3 = await answer();
      report.probes.examDragChanges = e1 !== e0; report.probes.examDragSurvivesTimer = e2 === e1 && e2 !== e0; report.probes.examAnswerAfterDrag = a3;
      check("3D-EXAM-01 rotating the model never changes the answer", a2 === a1 && a3 === a1, a3);
      check("3D-EXAM-01 the rotated view survives the exam timer's re-renders", report.probes.examDragChanges && report.probes.examDragSurvivesTimer && yaw1 === yaw2, "yaw " + yaw1 + " / " + yaw2);
      await page.locator(exam + " .i3d-scene").focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("+");
      check("3D-EXAM-01 keyboard camera keys never change the answer", (await answer()) === a1);
      await page.locator('[data-testid="exam-next"]').click(); await page.locator('[data-testid="exam-note"]').fill("ملاحظة"); await page.locator('[data-testid="exam-prev"]').click();
      await page.waitForSelector(exam + " .i3d-scene");
      const pressed = await page.locator(exam + ' .i3d-target-list button[aria-pressed="true"]').count();
      check("3D-EXAM-01 navigating away and back keeps the selected answer", (await answer()) === a1 && pressed === 1, "pressed buttons " + pressed);
      const tick = Number((await page.locator('[data-testid="exam-tick"]').textContent()).replace(/\D+/g, ""));
      check("3D-EXAM-01 the exam timer kept running through the 3D interaction", tick >= 3, "tick " + tick);
    });
    await section("3D-RTL", async () => {
      const dir = await page.evaluate(() => ({ doc: document.documentElement.dir, fig: getComputedStyle(document.querySelector(".i3d")).direction, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
      check("3D-RTL viewers render right-to-left with no horizontal page overflow", dir.doc === "rtl" && dir.fig === "rtl" && dir.overflow <= 0, JSON.stringify(dir));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, "demo-desktop.png") });
      await page.locator(exam).screenshot({ path: path.join(out, "exam-fixture.png") });
    });
    await page.close();
  }
  // ── touch (emulated mobile, 390 px) ─────────────────────────────────────────────────────────────────────────────────────────
  await section("3D-TOUCH-01", async () => {
    const page = await open(390, 844, { touch: true, only: "heart,sphere" });
    const cdp = await page.context().newCDPSession(page), heart = '[data-testid="model-heart"]', c = await centerOf(page, heart), before = await signature(page, heart);
    const y0 = await num(page, heart, "data-yaw"), p0 = await num(page, heart, "data-pitch"), s0 = await page.evaluate(() => scrollY);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] });
    for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: c.x + i * 10, y: c.y + i * 6 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(500);
    const y1 = await num(page, heart, "data-yaw"), p1 = await num(page, heart, "data-pitch"), s1 = await page.evaluate(() => scrollY);
    report.probes.touchDragRotates = (await signature(page, heart)) !== before;
    check("3D-TOUCH-01 a one-finger drag rotates the model (both axes) and does not scroll the page", report.probes.touchDragRotates && y1 !== y0 && p1 !== p0 && s1 === s0, "yaw " + y0 + "→" + y1 + " pitch " + p0 + "→" + p1 + " scroll " + s0 + "/" + s1);
    const sphere = '[data-testid="model-sphere"]', sc = await centerOf(page, sphere), b0 = await bbox(page, sphere), z0 = await num(page, sphere, "data-zoom");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sc.x - 20, y: sc.y, id: 1 }, { x: sc.x + 20, y: sc.y, id: 2 }] });
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sc.x - 20 - i * 6, y: sc.y, id: 1 }, { x: sc.x + 20 + i * 6, y: sc.y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(400);
    const b1 = await bbox(page, sphere), z1 = await num(page, sphere, "data-zoom");
    report.probes.pinchZoom = Math.round(b1.w / b0.w * 1000) / 1000;
    check("3D-TOUCH-01 a two-finger spread zooms in", z1 > z0 && report.probes.pinchZoom > 1.2, "zoom " + z0 + "→" + z1 + " size×" + report.probes.pinchZoom);
    await page.screenshot({ path: path.join(out, "demo-mobile.png") });
    await page.close();
  });
  // ── lifecycle: repeated mount / unmount, animation loops released, memory bounded ───────────────────────────────────────────
  await section("3D-LIFE-01", async () => {
    const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
    page.on("pageerror", e => errors.push(String(e)));
    await page.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.__raf = 0; window.requestAnimationFrame = cb => { window.__raf++; return raf(cb); }; });
    await page.goto(origin + "/browser-harness/interactive-3d-21d.html?only=remount", { waitUntil: "networkidle" });
    const cdp = await page.context().newCDPSession(page), heap = async () => { await cdp.send("HeapProfiler.collectGarbage"); return (await cdp.send("Runtime.getHeapUsage")).usedSize; };
    const remount = page.locator('[data-testid="remount-button"]'), errs0 = errors.length;
    for (let i = 0; i < 10; i++) await remount.click();
    const h0 = await heap();
    for (let i = 0; i < 40; i++) await remount.click();
    const h1 = await heap(), scenes = await page.locator(".i3d-scene").count();
    report.probes.heapGrowthAfter40RemountsKB = Math.round((h1 - h0) / 1024);
    check("3D-LIFE-01 50 mount / unmount cycles: one viewer left, no page error, heap growth bounded (< 1 MB after GC)", scenes === 1 && errors.length === errs0 && h1 - h0 < 1024 * 1024, "heap Δ " + report.probes.heapGrowthAfter40RemountsKB + " KB");
    await page.locator('[data-testid="remount"] .i3d-controls button[aria-pressed]').click();
    const r0 = await page.evaluate(() => window.__raf); await sleep(400); const r1 = await page.evaluate(() => window.__raf);
    await remount.click(); await sleep(150);
    const r2 = await page.evaluate(() => window.__raf); await sleep(800); const r3 = await page.evaluate(() => window.__raf);
    check("3D-LIFE-01 an animating viewer that unmounts leaves no animation loop behind", r1 - r0 > 5 && r3 === r2, "frames while animating " + (r1 - r0) + ", after unmount " + (r3 - r2));
    await page.close();
  });
  // ── visual certification: canonical views of every model (front / side / top / authored perspective) ─────────────────────────
  await section("3D-VIS", async () => {
    const page = await browser.newPage({ viewport: { width: 1260, height: 900 } });
    page.on("pageerror", e => errors.push(String(e)));
    for (const [group, keys] of [["geometry", "sphere,cube,cuboid,pyramid,cylinder,cone,ellipsoid"], ["presets", "heart,torso,water"]]) {
      await page.goto(origin + "/browser-harness/interactive-3d-21d.html?views=1&only=" + keys, { waitUntil: "networkidle" });
      const views = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="view-"]')].map(sec => {
        const svg = sec.querySelector(".i3d-scene"), vb = svg.viewBox.baseVal;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const n of svg.querySelectorAll("polygon,line.i3d-line")) { const b = n.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); }
        return { id: sec.getAttribute("data-testid"), faces: svg.querySelectorAll("polygon.i3d-face:not(.is-back)").length, inside: x0 >= 0 && y0 >= 0 && x1 <= vb.width && y1 <= vb.height,
          fill: Math.round(Math.max((x1 - x0) / vb.width, (y1 - y0) / vb.height) * 100) / 100, aspect: Math.round((x1 - x0) / (y1 - y0) * 1000) / 1000 };
      }));
      report.probes["views-" + group] = views;
      check("3D-VIS " + group + ": every model is drawn inside its viewer in all four canonical views", views.length === keys.split(",").length * 4 && views.every(v => v.faces > 0 && v.inside),
        views.filter(v => !(v.faces > 0 && v.inside)).map(v => v.id).join(",") || views.length + " views");
      if (group === "geometry") {
        const v = Object.fromEntries(views.map(x => [x.id.replace("view-", ""), x]));
        check("3D-VIS cube shows 1 face from the front and the side, 2 from above, 3 in perspective", v["cube-front"].faces === 1 && v["cube-side"].faces === 1 && v["cube-top"].faces === 2 && v["cube-perspective"].faces === 3,
          ["front", "side", "top", "perspective"].map(k => k + "=" + v["cube-" + k].faces).join(" "));
        check("3D-VIS the sphere's outline is round in every view", ["front", "side", "top", "perspective"].every(k => Math.abs(v["sphere-" + k].aspect - 1) < .01), ["front", "side", "top", "perspective"].map(k => v["sphere-" + k].aspect).join(","));
      }
      await page.screenshot({ path: path.join(out, "views-" + group + ".png"), fullPage: true });
    }
    await page.close();
  });
  // ── accessibility of motion, print ──────────────────────────────────────────────────────────────────────────────────────────
  await section("3D-MOTION", async () => {
    const reduced = await browser.newPage({ viewport: { width: 1024, height: 900 }, reducedMotion: "reduce" });
    await reduced.goto(origin + "/browser-harness/interactive-3d-21d.html?only=cube,sphere", { waitUntil: "networkidle" });
    const nReduced = await reduced.locator(".i3d-controls button[aria-pressed]").count();
    await reduced.close();
    const normal = await open(1024, 900, { only: "cube,sphere" }), nNormal = await normal.locator(".i3d-controls button[aria-pressed]").count();
    await normal.emulateMedia({ media: "print" });
    const print = await normal.locator('[data-testid="model-cube"]').evaluate(el => { const vis = n => !!n && getComputedStyle(n).display !== "none" && n.getBoundingClientRect().width > 0; return { scene: vis(el.querySelector(".i3d-scene")), controls: vis(el.querySelector(".i3d-controls")), options: vis(el.querySelector(".i3d-options")), help: vis(el.querySelector(".i3d-help")) }; });
    await normal.close();
    check("3D-MOTION prefers-reduced-motion removes auto-rotation (offered otherwise)", nReduced === 0 && nNormal === 2, "reduced=" + nReduced + " normal=" + nNormal);
    check("3D-PRINT print keeps the drawing and hides the camera controls and options", print.scene && !print.controls && !print.options && !print.help, JSON.stringify(print));
  });
  if (certify) check("3D-ERRORS no page error during the whole certification", errors.length === 0, errors.slice(0, 3).join(" | "));
  console.log("PROBES", JSON.stringify(report.probes));
} finally {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ checks, report, errors }, null, 2) + "\n");
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
if (errors.length) console.log("PAGE ERRORS", errors.slice(0, 5).join(" | "));
console.log(checks.filter(c => c.ok).length + "/" + checks.length + " checks passed");
if (!measureOnly && checks.some(c => !c.ok)) process.exitCode = 1;
