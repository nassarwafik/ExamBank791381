#!/usr/bin/env node
// Phase 21E — Premium SmartSim / 3D viewer: real-Chromium certification (browser-harness/viewer-premium-21e.*). Certification only;
// never shipped. Builds the harness page with the repository's Vite config, serves it, and drives it at 1280×900 (motion allowed),
// 853×600 @1.5, 640×450 @2 and 390×844 touch (reduced motion). The SAME script measures a BEFORE tree and an AFTER tree.
//   C-1 every viewer control is present by its exact accessible name, inside .i3d-controls (auto-rotate only when motion is allowed)
//   C-2 «تكبير» zooms and «إعادة العرض» restores the authored camera      C-3 keyboard: ArrowLeft rotates, Home resets (on the scene)
//   C-4 a mouse drag on the scene rotates it, also from the point where the on-stage hint is drawn
//   A-1 answer integrity: choosing «البطين الأيسر» emits exactly the stored scene3DSelection answer; rotate / zoom / reset never change it
//   A-2 face selection keeps its max (2) and its target keys                F-1 a keyboard-focused toolbar button shows a focus ring
//   V-1 no horizontal page overflow; V-2 no control clipped outside its viewer      T-1 touch: controls and answer buttons ≥ 44 px
//   S-1 the SmartSim host shows its error card with «إعادة المحاولة»        E-1 no page / console errors
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const label = process.env.LABEL || "after";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-viewer-21e"), label);
const site = out + "-site";
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true }); fs.rmSync(site, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", build: { outDir: site, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/viewer-premium-21e.html") } } });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(site, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(site + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const pageUrl = "http://127.0.0.1:" + server.address().port + "/browser-harness/viewer-premium-21e.html";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [], checks = [], record = { label, viewports: {} };
const check = (vp, id, ok, detail) => checks.push({ vp, id, ok: !!ok, detail });
const VIEWPORTS = [
  ["desktop", { width: 1280, height: 900 }, false, 1, "no-preference"],
  ["150pct", { width: 853, height: 600 }, false, 1.5, "reduce"],
  ["200pct", { width: 640, height: 450 }, false, 2, "reduce"],
  ["phone", { width: 390, height: 844 }, true, 2, "reduce"]
];
const NAMES = ["تدوير لليسار", "تدوير لليمين", "رفع المنظور", "خفض المنظور", "تكبير", "تصغير", "عرض النموذج كاملًا", "إعادة العرض"];
const cam = (page, sel) => page.locator(sel + " svg.i3d-scene").evaluate(s => ({ yaw: s.getAttribute("data-yaw"), pitch: s.getAttribute("data-pitch"), zoom: s.getAttribute("data-zoom") }));
const answerOf = page => page.locator("[data-testid=exam-answer]").textContent();

for (const [name, viewport, touch, dsf, motion] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: dsf, locale: "ar", reducedMotion: motion });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(name + ": " + e)); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(name + " console: " + m.text()); });
  const rec = record.viewports[name] = {};
  const shoot = async (locator, file) => {
    const vp = page.viewportSize(); await page.setViewportSize({ width: vp.width, height: 2600 }); await page.waitForTimeout(250);
    try { await locator.screenshot({ path: path.join(out, name + "-" + file + ".png"), timeout: 8000 }); } catch (e) { errors.push(name + " shot " + file + ": " + String(e.message || e).split("\n")[0]); }
    await page.setViewportSize(vp); await page.waitForTimeout(250);
  };
  let step = "open";
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    const exam = "[data-testid=exam] figure.i3d", faces = "[data-testid=faces] figure.i3d";
    await page.locator(exam + " svg.i3d-scene").waitFor({ timeout: 15000 }); await page.waitForTimeout(400);

    step = "controls";
    rec.controls = await page.evaluate(([sel, names]) => {
      const fig = document.querySelector(sel), ctl = fig.querySelector(".i3d-controls");
      const named = n => [...fig.querySelectorAll("button")].filter(b => (b.getAttribute("aria-label") || b.textContent.trim()) === n);
      return { found: names.map(n => named(n).length), inside: names.every(n => named(n).every(b => ctl.contains(b))), auto: [...ctl.querySelectorAll("button[aria-pressed]")].length };
    }, [exam, NAMES]);
    check(name, "C-1 every control present once by its exact name inside .i3d-controls (auto-rotate " + (motion === "reduce" ? "absent" : "present") + ")",
      rec.controls.found.every(n => n === 1) && rec.controls.inside && rec.controls.auto === (motion === "reduce" ? 0 : 1), JSON.stringify(rec.controls));
    if (touch) {
      rec.small = await page.evaluate(sel => [...document.querySelectorAll(sel + " .i3d-controls button, " + sel + " .i3d-target-list button")].map(b => { const r = b.getBoundingClientRect(); return { n: (b.getAttribute("aria-label") || b.textContent).trim().slice(0, 16), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(x => x.w < 44 || x.h < 44), exam);
      check(name, "T-1 touch: controls and answer buttons ≥ 44 px", rec.small.length === 0, JSON.stringify(rec.small.slice(0, 6)));
    }
    rec.clipped = await page.evaluate(sel => { const fig = document.querySelector(sel).getBoundingClientRect(); return [...document.querySelectorAll(sel + " .i3d-controls button, " + sel + " .i3d-options select")].filter(b => { const r = b.getBoundingClientRect(); return r.left < fig.left - 1 || r.right > fig.right + 1; }).length; }, exam);
    rec.overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    check(name, "V-1 no horizontal page overflow; V-2 no control clipped outside its viewer", rec.overflow.sw <= rec.overflow.cw && rec.clipped === 0, JSON.stringify({ ...rec.overflow, clipped: rec.clipped }));

    // screenshots at rest (before any interaction)
    await shoot(page.locator(exam), "exam-viewer");
    await shoot(page.locator(faces), "faces-viewer");
    await shoot(page.locator("[data-testid=smartsim]"), "smartsim-error");
    await page.locator(exam).evaluate(n => n.scrollIntoView({ block: "start" })); await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, name + "-viewport-exam.png") });

    step = "camera";
    const start = await cam(page, exam);
    await page.locator(exam).getByRole("button", { name: "تكبير", exact: true }).click(); await page.waitForTimeout(150);
    const zoomed = await cam(page, exam);
    await page.locator(exam).getByRole("button", { name: "تدوير لليسار" }).click(); await page.waitForTimeout(150);
    await page.locator(exam).getByRole("button", { name: "إعادة العرض" }).click(); await page.waitForTimeout(250);
    const back = await cam(page, exam);
    rec.camera = { start, zoomed, back };
    check(name, "C-2 «تكبير» zooms; «إعادة العرض» restores the authored camera", Number(zoomed.zoom) > Number(start.zoom) && JSON.stringify(back) === JSON.stringify(start), JSON.stringify(rec.camera));

    const svg = page.locator(exam + " svg.i3d-scene");
    await svg.focus(); await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(150);
    const keyed = await cam(page, exam); await page.keyboard.press("Home"); await page.waitForTimeout(200);
    const homed = await cam(page, exam);
    rec.keys = { keyed, homed };
    check(name, "C-3 keyboard: ArrowLeft rotates, Home resets", keyed.yaw !== start.yaw && JSON.stringify(homed) === JSON.stringify(start), JSON.stringify(rec.keys));

    step = "drag";
    await svg.evaluate(n => n.scrollIntoView({ block: "center" })); await page.waitForTimeout(150);
    const box = await svg.boundingBox();
    // from the hint's position when it exists (it must never intercept the gesture), else from the scene's lower middle
    const hint = await page.locator(exam + " .i3d-stage-hint").boundingBox().catch(() => null);
    const from = hint && hint.width ? { x: hint.x + hint.width / 2, y: hint.y + hint.height / 2 } : { x: box.x + box.width / 2, y: box.y + box.height * 0.85 };
    rec.hitAtHint = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el ? (el.closest("svg.i3d-scene") ? "scene" : el.className?.baseVal ?? el.className) : null; }, from);
    if (!touch) {
      await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x - 90, from.y - 20, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(300);
    } else {
      const cdp = await ctx.newCDPSession(page);
      const tp = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
      await tp("touchStart", from.x, from.y); for (let i = 1; i <= 8; i++) await tp("touchMove", from.x - i * 11, from.y - i * 2); await tp("touchEnd"); await page.waitForTimeout(300);
    }
    const dragged = await cam(page, exam);
    rec.drag = { from: rec.hitAtHint, dragged };
    check(name, "C-4 a " + (touch ? "touch" : "mouse") + " drag rotates the scene, also from the on-stage hint's position", rec.hitAtHint === "scene" && dragged.yaw !== start.yaw, JSON.stringify(rec.drag));
    await page.locator(exam).getByRole("button", { name: "إعادة العرض" }).click(); await page.waitForTimeout(200);

    step = "answer";
    const group = page.locator(exam).getByRole("group", { name: "اختر جزءًا من القلب" });
    await group.getByRole("button", { name: /البطين الأيسر/ }).click(); await page.waitForTimeout(250);
    const chosen = await answerOf(page);
    await page.locator(exam).getByRole("button", { name: "تكبير", exact: true }).click();
    await page.locator(exam).getByRole("button", { name: "تدوير لليمين" }).click();
    await page.locator(exam).getByRole("button", { name: "عرض النموذج كاملًا" }).click();
    await page.locator(exam).getByRole("button", { name: "إعادة العرض" }).click(); await page.waitForTimeout(250);
    const after = await answerOf(page);
    rec.answer = { chosen, after };
    await shoot(page.locator(exam), "exam-selected");
    check(name, "A-1 «البطين الأيسر» emits exactly the stored answer; camera actions never change it",
      chosen === JSON.stringify({ kind: "scene3DSelection", sceneId: "exam-heart", targets: ["object:leftVentricle"] }) && after === chosen, JSON.stringify(rec.answer));

    const fl = page.locator(faces).locator(".i3d-target-list button");
    await fl.nth(0).click(); await fl.nth(1).click(); await fl.nth(2).click(); await page.waitForTimeout(250);
    rec.faces = JSON.parse(await page.locator("[data-testid=faces-answer]").textContent());
    check(name, "A-2 face selection keeps max 2 and face target keys", rec.faces.length === 2 && rec.faces.every(k => /^face:/.test(k)), JSON.stringify(rec.faces));

    step = "focus";
    await page.locator(exam + " figcaption").click(); await page.keyboard.press("Tab"); await page.waitForTimeout(100);
    rec.focus = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { inToolbar: !!a.closest(".i3d-controls"), name: a.getAttribute("aria-label") || a.textContent.trim(), outline: cs.outlineStyle, width: cs.outlineWidth }; });
    check(name, "F-1 keyboard focus on the first toolbar button shows a focus ring", rec.focus.inToolbar && rec.focus.outline !== "none" && parseFloat(rec.focus.width) >= 2, JSON.stringify(rec.focus));
    await page.locator(exam).getByRole("button", { name: "تدوير لليسار" }).focus(); await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(out, name + "-focus.png"), clip: await page.locator(exam + " .i3d-controls").boundingBox() }).catch(() => {});

    step = "smartsim";
    rec.smartsim = await page.evaluate(() => { const e = document.querySelector("[data-testid=smartsim] [data-testid=smartsim-error]"); return { error: !!e && e.getAttribute("role") === "alert", retry: !!document.querySelector("[data-testid=smartsim] button") }; });
    check(name, "S-1 SmartSim host shows its error card (role=alert)", rec.smartsim.error, JSON.stringify(rec.smartsim));
  } catch (e) { await page.screenshot({ path: path.join(out, name + "-error-" + step + ".png") }).catch(() => {}); errors.push(name + " harness [" + step + "]: " + String(e && e.message || e).split("\n")[0]); }
  await ctx.close();
}
await browser.close(); server.close();
check("all", "E-1 no page or console errors", errors.length === 0, JSON.stringify(errors.slice(0, 5)));
record.checks = checks; record.errors = errors;
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
for (const c of checks) console.log("CHECK " + (c.ok ? "PASS" : "FAIL") + " [" + c.vp + "] " + c.id + " — " + c.detail);
console.log(label + ": " + checks.filter(c => c.ok).length + "/" + checks.length + " checks passed; page errors: " + errors.length);
