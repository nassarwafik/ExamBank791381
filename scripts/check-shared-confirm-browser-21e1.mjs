#!/usr/bin/env node
// Phase 21E.1 (slice 1) — real-Chromium certification of the SHARED confirmation dialogs in the production Structured Exam
// Builder (browser-harness/shared-confirm-21e1.*). The pre-21E.1 builder opened NATIVE window.confirm dialogs for the section
// instruction template, the cover template / cover instruction template and the image removal / replacement: Playwright
// reports those as `dialog` events (the fail-first signal — on the baseline every flow below fires one and the shared dialog
// never appears). On the head: no native dialog ever fires; the shared dialog paints ON TOP of the builder (real hit test),
// is RTL with Arabic labels, Escape / the keep-button leave the data untouched and restore focus to the opener, the confirm
// button applies the change, Tab stays inside the dialog, a destructive confirmation starts on the safe choice, and the dialog
// fits the viewport at 390 / 820 / 1280 px and at 150 % / 200 % / 400 % (320 CSS px) zoom without panning; below 320 CSS px
// (phone page zoom) the page-wide minimum forces panning, which is measured and reported. Screenshots land in HARNESS_OUT/shots.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-shared-confirm-21e1"));
const shots = path.join(out, "shots");
const checks = [];
const info = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : "")); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", publicDir: false, build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/shared-confirm-21e1.html") } } });
fs.mkdirSync(shots, { recursive: true });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port, PAGE = origin + "/browser-harness/shared-confirm-21e1.html";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [];
const SECTION_TEXT = "أجب عن جميع أسئلة هذا القسم.";
const CLICK = { timeout: 2500 };

async function openPage(ctx) {
  const page = await ctx.newPage();
  const native = [];
  page.on("dialog", async d => { native.push(d.type() + ": " + d.message().slice(0, 60)); await d.dismiss(); });
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "→ رجوع" }).waitFor({ timeout: 15000 });
  return { page, native };
}
const dialogOf = (page, title) => page.locator('[role="dialog"]').filter({ has: page.getByRole("heading", { name: title }) });
/** The element under the CENTER of `locator` is the locator itself (nothing covers it) AND that center is inside the visible area
 *  (the visual viewport). Measured in the page's own layout-viewport coordinates — the space elementFromPoint uses — so a zoomed
 *  phone whose visual viewport is offset inside a wider layout viewport is measured correctly. */
async function onTop(locator) {
  return locator.evaluate(el => {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
    const x = r.left + r.width / 2, y = r.top + r.height / 2, v = window.visualViewport;
    const visible = !v || (x >= v.offsetLeft && x <= v.offsetLeft + v.width && y >= v.offsetTop && y <= v.offsetTop + v.height);
    const hit = document.elementFromPoint(x, y);
    return visible && (hit === el || el.contains(hit));
  });
}
const sectionTextarea = page => page.getByRole("textbox", { name: /تعليمات القسم/ }).first();
const fitsViewport = async (locator) => locator.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1 && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1; });

async function run(name, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const { page, native } = await openPage(ctx);

  // ── 1. Section instruction template over existing text ───────────────────────────────────────────────
  const select = page.getByRole("combobox", { name: "قوالب تعليمات القسم" }).first();
  await select.scrollIntoViewIfNeeded();
  await select.focus();
  await select.selectOption("answer-all");
  const d1 = dialogOf(page, "استبدال تعليمات القسم");
  check(name + ": section template → the SHARED dialog opens (no native dialog)", await d1.isVisible().catch(() => false) && native.length === 0, native.join(" | "));
  check(name + ": dialog is RTL with Arabic buttons", await d1.evaluate(el => getComputedStyle(el).direction === "rtl") && await d1.getByRole("button", { name: "إبقاء التعليمات" }).isVisible() && await d1.getByRole("button", { name: "استبدال التعليمات" }).isVisible());
  check(name + ": the dialog paints ON TOP of the builder (hit test on its confirm button)", await onTop(d1.getByRole("button", { name: "استبدال التعليمات" })));
  check(name + ": dialog fits the viewport, no horizontal overflow", await fitsViewport(d1));
  await page.screenshot({ path: path.join(shots, name + "-01-section-dialog.png") });
  // keyboard: Tab stays inside the dialog
  const inside = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press("Tab"); inside.push(await page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest('[role="dialog"]'); })); }
  check(name + ": Tab stays inside the dialog (focus trap)", inside.every(Boolean), inside.join(","));
  await page.keyboard.press("Escape");
  check(name + ": Escape closes it, the section instructions are unchanged", !(await d1.isVisible().catch(() => false)) && (await sectionTextarea(page).inputValue()) === SECTION_TEXT);
  check(name + ": focus returns to the template select", await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "قوالب تعليمات القسم"));
  await select.selectOption("answer-all");
  await d1.getByRole("button", { name: "استبدال التعليمات" }).click(CLICK);
  check(name + ": confirming replaces the instructions", !(await d1.isVisible().catch(() => false)) && (await sectionTextarea(page).inputValue()) !== SECTION_TEXT && (await sectionTextarea(page).inputValue()).length > 0);
  await page.screenshot({ path: path.join(shots, name + "-02-section-applied.png") });

  // ── 2. Image removal — destructive: focus starts on the safe choice ──────────────────────────────────
  let remove = page.getByRole("button", { name: "🗑 إزالة الصورة" }).first();
  if (!(await remove.isVisible().catch(() => false))) { const open = page.getByTitle("فتح").first(); if (await open.isVisible().catch(() => false)) await open.click(CLICK); }
  remove = page.getByRole("button", { name: "🗑 إزالة الصورة" }).first();
  await remove.scrollIntoViewIfNeeded();
  await remove.click(CLICK);
  const d2 = dialogOf(page, "إزالة صورة السؤال");
  check(name + ": image removal → the SHARED danger dialog (no native dialog)", await d2.isVisible().catch(() => false) && native.length === 0, native.join(" | "));
  check(name + ": focus starts on «إبقاء الصورة» (safe choice)", await page.evaluate(() => document.activeElement?.textContent?.trim() === "إبقاء الصورة"));
  await page.screenshot({ path: path.join(shots, name + "-03-remove-dialog.png") });
  await page.keyboard.press("Enter");
  check(name + ": Enter on the safe choice keeps the image", !(await d2.isVisible().catch(() => false)) && await page.getByRole("button", { name: "🗑 إزالة الصورة" }).first().isVisible());
  await page.getByRole("button", { name: "🗑 إزالة الصورة" }).first().click(CLICK);
  await d2.getByRole("button", { name: "إزالة الصورة" }).click(CLICK);
  check(name + ": confirming removes the image", !(await page.getByRole("button", { name: "🗑 إزالة الصورة" }).first().isVisible().catch(() => false)));
  await page.screenshot({ path: path.join(shots, name + "-04-removed.png") });

  // ── 3. Cover template over existing cover text ───────────────────────────────────────────────────────
  const showCover = page.getByRole("checkbox", { name: /إظهار صفحة الغلاف/ });
  if (await showCover.isVisible().catch(() => false) && !(await showCover.isChecked())) await showCover.check();
  const coverSelect = page.getByRole("combobox", { name: "قوالب الغلاف" }).first();
  if (await coverSelect.isVisible().catch(() => false)) {
    await coverSelect.selectOption("training");
    await page.getByRole("button", { name: "تطبيق القالب" }).first().click(CLICK);
    const d3 = dialogOf(page, "استبدال حقول الغلاف");
    check(name + ": cover template → the SHARED dialog (no native dialog)", await d3.isVisible().catch(() => false) && native.length === 0, native.join(" | "));
    await page.screenshot({ path: path.join(shots, name + "-05-cover-dialog.png") });
    await d3.getByRole("button", { name: "إبقاء الحقول" }).click(CLICK);
    check(name + ": «إبقاء الحقول» keeps the subtitle", (await page.getByPlaceholder("مثال: الحادي عشر 7").inputValue()) === "الحادي عشر 7");
  } else check(name + ": cover editor reachable", false, "cover controls not found");

  check(name + ": no native browser dialog fired in any flow", native.length === 0, native.join(" | "));
  await ctx.close();
}
await run("desktop", { width: 1280, height: 900 }, false);
await run("tablet", { width: 820, height: 1180 }, true);
await run("phone", { width: 390, height: 844 }, true);

// ── Text scaling. Browser zoom (Ctrl + / pinch-to-zoom accessibility zoom) SHRINKS the CSS viewport: a 390 px phone at 200 %
// lays out at 195 CSS px, at 150 % at 260 CSS px — that is what the dialog must fit. Emulated faithfully with a narrower
// viewport at a higher device scale factor. A second variant scales only the root font size (the user's "larger text" setting),
// which leaves the px-based token layout alone but must not break the dialog either.
async function scaled(name, viewport, dsf, rootFontSize, touch = true) {
  const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: dsf });
  const { page, native } = await openPage(ctx);
  if (rootFontSize) await page.evaluate(v => { document.documentElement.style.fontSize = v; }, rootFontSize);
  const select = page.getByRole("combobox", { name: "قوالب تعليمات القسم" }).first();
  await select.scrollIntoViewIfNeeded(); await select.focus(); await select.selectOption("answer-all");
  const dz = dialogOf(page, "استبدال تعليمات القسم");
  // The page carries a global `min-width: 320px` (src/index.css:19), so below 320 CSS px (a 390 px phone at 150–200 % page zoom)
  // Chromium widens the LAYOUT viewport to 320 px and the visible (visual) viewport pans over it. Before 21E.1 the fixed dialog root
  // spanned the whole layout viewport, so the RTL dialog's left part — the confirm button — sat outside the reachable area (no pan
  // could reach it). `.eb-dialog-root { max-inline-size: 100vw }` keeps the dialog inside the visible area; the PAGE behind it is
  // still wider than the screen (INFO, page-wide minimum, 21E.6). Rectangles relative to the dialog ROOT for the fit record.
  const fit = await dz.evaluate(el => { const r = el.getBoundingClientRect(), root = el.closest(".eb-dialog-root").getBoundingClientRect(); return { left: Math.round(r.left - root.left), right: Math.round(r.right - root.left), layoutW: Math.round(root.width), visualW: Math.round(window.visualViewport ? window.visualViewport.width : window.innerWidth), docClientW: document.documentElement.clientWidth }; });
  const fitsLayout = fit.left >= -1 && fit.right <= fit.layoutW + 1;
  const belowReflow = viewport.width < 320;            // below the WCAG 1.4.10 reflow width the page-wide minimum widens the page
  const confirmButton = dz.getByRole("button", { name: "استبدال التعليمات" });
  // The dialog — title, message and both decisions — is entirely inside the VISIBLE area: no panning needed to read or decide.
  const inView = await dz.evaluate(el => { const r = el.getBoundingClientRect(), v = window.visualViewport; return r.left >= v.offsetLeft - 1 && r.right <= v.offsetLeft + v.width + 1 && r.top >= v.offsetTop - 1 && r.bottom <= v.offsetTop + v.height + 1; });
  check(name + ": the whole dialog is inside the visible area (no panning needed)", inView, JSON.stringify(fit));
  if (!belowReflow) check(name + ": no horizontal page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  check(name + ": dialog opens, fits the LAYOUT viewport, confirm button on top (real hit test), no native dialog", await dz.isVisible().catch(() => false) && fitsLayout && await onTop(confirmButton) && native.length === 0, JSON.stringify(fit));
  const pageWiderThanScreen = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (belowReflow && pageWiderThanScreen) { console.log("INFO " + name + ": the PAGE behind the dialog is wider than the screen (page-wide min-width 320px, scheduled for 21E.6); the dialog itself (" + fit.left + "…" + fit.right + " of " + fit.layoutW + " px) is fully visible and needs no panning"); info.push({ name, ...fit }); }
  const tap = await dz.getByRole("button", { name: "إبقاء التعليمات" }).boundingBox();
  // Touch contexts: 44 px (the platform's touch rule, now also for any coarse pointer); mouse contexts: WCAG 2.5.8 AA ≥ 24 px.
  const minTarget = touch ? 44 : 24;
  check(name + ": buttons keep a ≥ " + minTarget + " px " + (touch ? "touch" : "pointer") + " height", !!tap && tap.height >= minTarget, tap ? String(Math.round(tap.height)) : "");
  await page.screenshot({ path: path.join(shots, name.replace(/[^a-z0-9%@-]/gi, "_") + ".png") });
  await page.keyboard.press("Escape");
  check(name + ": Escape keeps the instructions", (await sectionTextarea(page).inputValue()) === SECTION_TEXT);
  await ctx.close();
}
// WCAG 1.4.10 reflow bound: 320 CSS px (a 1280 px desktop at 400 %) — no panning allowed; desktop at 150 % / 200 % likewise.
await scaled("desktop@400%-zoom (320 css px)", { width: 320, height: 225 }, 4, null, false);
await scaled("desktop@200%-zoom (640 css px)", { width: 640, height: 450 }, 2, null, false);
await scaled("desktop@150%-zoom (853 css px)", { width: 853, height: 600 }, 1.5, null, false);
await scaled("touch tablet@150%-zoom (853 css px)", { width: 853, height: 600 }, 1.5, null, true);
// Below the WCAG bound (a 390 px phone with Safari page zoom): the page-wide `min-width: 320px` forces panning — measured, INFO.
await scaled("phone@150%-zoom (260 css px)", { width: 260, height: 563 }, 3, null);
await scaled("phone@200%-zoom (195 css px)", { width: 195, height: 422 }, 4, null);
await scaled("phone@200%-font-size", { width: 390, height: 844 }, 2, "200%");
await scaled("tablet@200%-zoom (410 css px)", { width: 410, height: 590 }, 4, null);
check("no page or console errors", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); server.close();
const passed = checks.filter(c => c.ok).length;
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ passed, total: checks.length, checks, info }, null, 2));
console.log(passed + "/" + checks.length + " checks passed; screenshots in " + shots);
process.exit(passed === checks.length ? 0 : 1);
