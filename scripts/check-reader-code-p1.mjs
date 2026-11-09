#!/usr/bin/env node
// 899371 P1 (docs/enterprise-899371-learning-plan.md §13) — code blocks are READABLE in every reading theme, in a REAL Chromium on
// the production build (certification only; nothing is deployed).
//
// The build in DIST (default ./dist) is served next to the REAL API, in process (browser-harness/learning-l8-api.cjs, the harness of
// the L.8 gate). A teacher opens a page of the book 791381 that has a `code` block (791381-m03-l01-p04) with each reading theme
// («فاتح» light, «بني» sepia, «داكن» dark) and with the app in dark mode, and the script measures the computed colour of the code
// text and of the panel behind it. Pass: WCAG AA (4.5:1) in every case. A 390 px phone run checks the panel scrolls inside itself
// (no page overflow).
//
// A C# program panel is then checked on the SAME page: the browser intercepts the module body and swaps that page's code block
// for a real program of the book 899371 (the probe c07-t-q4, «inc / dec»), as P2 will author it. The panel must load (it is a lazy
// chunk), show the code exactly, colour every token kind with AA contrast in light and dark, keep the line numbers in view while
// a long line scrolls, and give «نسخ الكود» a 44 × 44 px target on a touch screen.
//
// Tools are measuring instruments, not project dependencies: PLAYWRIGHT_CORE_DIR names a directory whose node_modules holds
// playwright-core (default: the global `playwright`); CHROMIUM_PATH the browser. Exit 1 when a check fails, 2 when a tool or the
// build is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { try { ({ chromium } = require("playwright")); } catch { console.error("playwright unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); } }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }

require(path.join(root, "api/src/lib/observability.js")).setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {} });
const teacherToken = api.teacherToken();
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => { const r = await api.handle(req.method, req.url, req.headers, body); res.writeHead(r.status, r.headers); res.end(r.body); });
    return;
  }
  let full = path.resolve(dist, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(dist + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) full = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(full).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });

const PAGE = "791381-m03-l01-p04";
const failures = [];
const check = (ok, what) => { console.log((ok ? "  ✓ " : "  ✗ ") + what); if (!ok) failures.push(what); };
const rgb = s => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
const lum = c => { const [r, g, b] = c.map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const CSHARP = fs.readFileSync(path.join(root, "docs/enterprise-899371-learning/probes/c07-t-q4/Program.cs"), "utf8").replace(/\n$/, "")
  .replace("int t1 = 1959;", "int t1 = 1959; // " + "a long comment that is wider than a phone screen, so the program scrolls sideways inside its panel");
/** Swap the code block of PAGE for a C# block in the served module body (test-only interception; nothing else changes). */
function toCSharp(json) {
  let swapped = false;
  const walk = o => {
    if (!o || typeof o !== "object" || swapped) return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o.id === PAGE && Array.isArray(o.blocks)) {
      const b = o.blocks.find(x => x && x.type === "code");
      if (b) { b.language = "csharp"; b.code = CSHARP; swapped = true; }
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(json);
  return swapped;
}

async function open({ readTheme, appDark, viewport, csharp = false, touch = false }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: "block", locale: "ar", hasTouch: touch, isMobile: touch });
  if (csharp) {
    await ctx.route("**/api/learning-content/791381/791381-m03*", async route => {
      const res = await route.fetch(); const json = await res.json();
      if (!toCSharp(json)) failures.push("the served body has no code block on " + PAGE);
      await route.fulfill({ response: res, json });
    });
  }
  await ctx.addInitScript(([t, theme, dark]) => {
    sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم");
    localStorage.setItem("eb.learning.readingSettings.v1", JSON.stringify({ size: 2, spacing: 1, theme }));
    if (dark) localStorage.setItem("examBankTheme", "dark");
  }, [teacherToken, readTheme, appDark]);
  const page = await ctx.newPage();
  await page.goto(origin + "/#/learning/791381/read/" + PAGE);
  await page.locator(".learning-reader-codewrap code").first().waitFor({ timeout: 15000 });
  if (appDark) {
    // The teacher shell applies the ACCOUNT's appearance when it opens (src/teacher/teacherAppearance.ts), so the app's dark mode is
    // the account's choice: set it the way «المظهر» does, then reopen the page.
    const saved = await page.evaluate(async t => (await fetch("/api/teacher-profile", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + t }, body: JSON.stringify({ action: "setAppearance", appearance: { theme: "dark" } }) })).status, teacherToken);
    await page.reload();
    await page.locator(".learning-reader-codewrap code").first().waitFor({ timeout: 15000 });
    await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark", null, { timeout: 5000 }).catch(() => {});
    if (saved !== 200) failures.push("app dark: setAppearance answered " + saved);
  }
  return { ctx, page };
}

console.log("code panel contrast (" + PAGE + ")");
const measured = [];
for (const c of [{ readTheme: "light" }, { readTheme: "sepia" }, { readTheme: "dark" }, { readTheme: "light", appDark: true }, { readTheme: "dark", appDark: true }]) {
  const { ctx, page } = await open({ ...c, viewport: { width: 1440, height: 900 } });
  const r = await page.evaluate(() => {
    const code = document.querySelector(".learning-reader-codewrap code"), wrap = document.querySelector(".learning-reader-codewrap");
    return { fg: getComputedStyle(code).color, bg: getComputedStyle(wrap).backgroundColor, readTheme: document.querySelector(".learning-reader")?.getAttribute("data-read-theme"), html: document.documentElement.getAttribute("data-theme") };
  });
  const ratio = contrast(rgb(r.fg), rgb(r.bg));
  measured.push({ ...c, ...r, ratio: Math.round(ratio * 100) / 100 });
  if (c.appDark) check(r.html === "dark", "the app is in dark mode (html data-theme=dark)");
  check(ratio >= 4.5, `reading theme ${c.readTheme}${c.appDark ? " + app dark" : ""}: text ${r.fg} on ${r.bg} = ${ratio.toFixed(2)}:1 (reader ${r.readTheme}, html ${r.html || "light"})`);
  await ctx.close();
}

console.log("phone (390 px)");
{
  const { ctx, page } = await open({ readTheme: "light", viewport: { width: 390, height: 844 } });
  const o = await page.evaluate(() => ({ page: document.documentElement.scrollWidth - innerWidth, wrapScrolls: getComputedStyle(document.querySelector(".learning-reader-codewrap")).overflowX }));
  check(o.page <= 0 && o.wrapScrolls === "auto", `no page overflow (${o.page}px); the code panel scrolls inside itself (overflow-x ${o.wrapScrolls})`);
  await ctx.close();
}

console.log("C# program panel (the page's code block swapped for a book program)");
for (const c of [{ readTheme: "light", viewport: { width: 1440, height: 900 } }, { readTheme: "dark", viewport: { width: 1440, height: 900 } }, { readTheme: "light", viewport: { width: 390, height: 844 }, touch: true }]) {
  const { ctx, page } = await open({ ...c, csharp: true });
  const where = c.readTheme + " " + c.viewport.width + "px" + (c.touch ? " touch" : "");
  const loaded = await page.getByRole("button", { name: "نسخ الكود" }).waitFor({ timeout: 15000 }).then(() => true, () => false);
  check(loaded, where + ": the lazy C# panel loads («نسخ الكود»)");
  if (!loaded) { await ctx.close(); continue; }
  const r = await page.evaluate(() => {
    const wrap = document.querySelector(".learning-reader-codewrap.is-csharp"), code = wrap.querySelector("code"), pre = wrap.querySelector("pre"), gutter = wrap.querySelector(".learning-reader-code-gutter");
    const kinds = {};
    for (const k of ["keyword", "type", "string", "number", "comment"]) { const el = wrap.querySelector(".cs-tok-" + k); if (el) kinds[k] = getComputedStyle(el).color; }
    const btn = wrap.querySelector(".learning-reader-code-copy").getBoundingClientRect(), box = wrap.getBoundingClientRect();
    const inside = btn.left >= box.left - 0.5 && btn.right <= box.right + 0.5 && btn.width > 0;
    const before = gutter.getBoundingClientRect().left;
    pre.scrollLeft = 400;
    return { text: code.textContent, bg: getComputedStyle(wrap).backgroundColor, plain: getComputedStyle(code).color, kinds, gutterHidden: gutter.getAttribute("aria-hidden"), gutterLines: gutter.textContent.split("\n").length,
      inside, btnBox: [Math.round(btn.left), Math.round(btn.right)], wrapBox: [Math.round(box.left), Math.round(box.right)], scrolled: pre.scrollLeft, gutterMoved: Math.abs(gutter.getBoundingClientRect().left - before), button: { w: btn.width, h: btn.height }, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  check(r.inside, where + ": «نسخ الكود» is inside the panel (button " + r.btnBox + ", panel " + r.wrapBox + ")");
  check(r.text === CSHARP, where + ": the code is shown exactly (" + CSHARP.split("\n").length + " lines)");
  check(r.gutterHidden === "true" && r.gutterLines === CSHARP.split("\n").length, where + ": " + r.gutterLines + " line numbers, hidden from assistive technology");
  const all = { plain: r.plain, ...r.kinds };
  check(Object.keys(r.kinds).length === 5, where + ": every token kind is coloured (" + Object.keys(r.kinds).join(", ") + ")");
  for (const [k, col] of Object.entries(all)) { const ratio = contrast(rgb(col), rgb(r.bg)); check(ratio >= 4.5, where + ": " + k + " " + col + " on " + r.bg + " = " + ratio.toFixed(2) + ":1"); }
  check(r.scrolled > 0 && r.gutterMoved < 1, where + ": a long line scrolls (" + r.scrolled + "px) and the line numbers stay in view (moved " + r.gutterMoved.toFixed(1) + "px)");
  if (c.touch) check(r.button.w >= 44 && r.button.h >= 44, where + ": «نسخ الكود» is " + Math.round(r.button.w) + " × " + Math.round(r.button.h) + " px");
  check(r.overflow <= 0, where + ": no page overflow (" + r.overflow + "px)");
  if (process.env.SHOT_DIR) { await page.evaluate(() => { document.querySelector(".learning-reader-codewrap.is-csharp pre").scrollLeft = 0; const w = document.querySelector(".learning-reader-codewrap.is-csharp"); scrollBy(0, w.getBoundingClientRect().top - innerHeight * 0.25); }); await page.waitForTimeout(300); await page.screenshot({ path: path.join(process.env.SHOT_DIR, "csharp-" + where.replace(/\s+/g, "-") + ".png") }); }
  await ctx.close();
}

await browser.close(); server.close();
if (process.env.RESULT_JSON) fs.writeFileSync(process.env.RESULT_JSON, JSON.stringify({ dist, measured, failures }, null, 2) + "\n");
console.log(failures.length ? "\n" + failures.length + " check(s) failed" : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
