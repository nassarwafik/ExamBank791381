#!/usr/bin/env node
// 899371 P9 (docs/enterprise-899371-learning-plan.md §22) — the final audit of the course «أسس علم الحاسوب» in a REAL Chromium on the
// production build, next to the REAL API in process (browser-harness/learning-l8-api.cjs). Certification only.
//
// EVERY page of the course (the teacher's Reader walks the whole book with «التالي»), in FOUR combinations — 390 px (touch) and
// 1440 px, the Reader's light and «داكن» themes — each page checked for:
//   • axe-core WCAG 2.1 A/AA (every impact); • no horizontal overflow; • no broken image; • no page error;
//   • touch targets ≥ 44 px at 390 (a link inside running text excepted, as WCAG 2.5.5 does);
//   • the page shown is the page asked for (the walk never skips or repeats a page).
// Then, on every exercise page, each exercise's «راجع في الكتاب» opens the page it names (110 links).
// Then, for one lesson page of each unit (its first page showing a program): PRESENTATION mode (axe, overflow, leaving restores) and PRINT media (the page's
// content prints, the Reader's chrome does not).
// Output: AUDIT_OUT (default scratch dir) /report.json + a summary on stdout. Exit 1 when any check fails, 2 when a tool is missing.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const out = path.resolve(process.env.AUDIT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), "audit-899371-")));
const require = createRequire(import.meta.url);
let chromium, axeSource;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { try { ({ chromium } = require("playwright")); } catch { console.error("playwright unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); } }
try { axeSource = fs.readFileSync(createRequire(path.join(process.env.AXE_CORE_DIR || root, "package.json")).resolve("axe-core/axe.min.js"), "utf8"); }
catch { console.error("axe-core unavailable (set AXE_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

require(path.join(root, "api/src/lib/observability.js")).setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const CID = "899371";
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

// The book's pages in reading order, from the served bodies (module → lesson → page).
const PAGES = [];
const MODULE_FIRST = [];
for (const f of fs.readdirSync(path.join(root, "api/src/data/learning-content", CID)).filter(f => f.endsWith(".json")).sort()) {
  const mod = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-content", CID, f), "utf8"));
  const pages = mod.lessons.flatMap(l => l.pages);
  PAGES.push(...pages.map(p => p.id));
  // presentation / print: the unit's first LESSON page that shows a program (else its first lesson page) — never the opener
  const lesson = pages.filter(p => p.layout !== "opener" && p.layout !== "practice");
  MODULE_FIRST.push((lesson.find(p => p.blocks.some(b => b.type === "code")) || lesson[0] || pages[0]).id);
}

async function session(viewport, { touch = false, readTheme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(([t, theme]) => {
    sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم");
    localStorage.setItem("eb.learning.readingSettings.v1", JSON.stringify({ size: 2, spacing: 1, theme }));
  }, [teacherToken, readTheme]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  return { ctx, page, errors };
}
const currentId = page => page.evaluate(() => decodeURIComponent((location.hash.match(/\/read\/([^/?#]+)/) || [])[1] || ""));
const settle = page => page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"), null, { timeout: 5000 }).catch(() => {});
const TARGETS = () => {
  const outT = [];
  const inRunningText = el => el.tagName === "A" && el.closest("p, li, td") && (el.closest("p, li, td").textContent || "").trim().length > (el.textContent || "").trim().length + 8;
  for (const el of document.querySelectorAll(".learning-reader button, .learning-reader a[href], .learning-reader [role=button], .learning-reader [role=radio], .learning-reader [role=tab], .learning-reader select, .learning-reader input:not([type=hidden]), .learning-reader summary")) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === "hidden" || el.closest("[aria-hidden=true], [inert]")) continue;
    if (inRunningText(el)) continue;
    if (r.width < 44 || r.height < 44) outT.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40) + " " + Math.round(r.width) + "×" + Math.round(r.height));
  }
  return outT;
};
async function inspect(page, touch) {
  await settle(page);
  await page.evaluate(axeSource + "\n;0");
  const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map(n => n.target.join(" ")) })));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const brokenImages = await page.evaluate(() => [...document.querySelectorAll(".learning-reader img")].filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute("src")));
  const small = touch ? await page.evaluate(TARGETS) : [];
  const textLength = await page.evaluate(() => (document.querySelector(".learning-reader-page")?.textContent || "").trim().length);
  return { axe, overflow, brokenImages, small, textLength };
}

async function walk(label, viewport, opts) {
  const { ctx, page, errors } = await session(viewport, opts);
  const results = [];
  await page.goto(origin + "/#/learning/" + CID + "/read/" + PAGES[0]);
  await page.reload();
  await page.locator(".learning-reader-page").first().waitFor({ timeout: 20000 });
  for (let i = 0; i < PAGES.length; i++) {
    const expected = PAGES[i];
    await page.waitForFunction(id => decodeURIComponent(location.hash).includes("/read/" + id) && !!document.querySelector(".learning-reader-page"), expected, { timeout: 20000 }).catch(() => {});
    await page.locator(".learning-reader-page h2").first().waitFor({ timeout: 20000 }).catch(() => {});
    const shown = await currentId(page);
    const before = errors.length;
    const r = await inspect(page, opts.touch);
    results.push({ pageId: expected, shown, ...r, errors: errors.slice(before) });
    if (i < PAGES.length - 1) await page.getByRole("button", { name: "التالي", exact: true }).last().click();
    if ((i + 1) % 50 === 0) console.log(label + ": " + (i + 1) + " / " + PAGES.length);
  }
  await ctx.close();
  return results;
}

const COMBOS = [
  ["390-light", { width: 390, height: 844 }, { touch: true, readTheme: "light" }],
  ["390-dark", { width: 390, height: 844 }, { touch: true, readTheme: "dark" }],
  ["1440-light", { width: 1440, height: 900 }, { touch: false, readTheme: "light" }],
  ["1440-dark", { width: 1440, height: 900 }, { touch: false, readTheme: "dark" }],
];
const report = { courseId: CID, pages: PAGES.length, combos: {}, presentation: [], print: [] };
const ONLY = process.env.AUDIT_ONLY || "";   // "links": only the «راجع في الكتاب» check (a re-run after a fix to that check)
const walks = ONLY === "links" ? [] : await Promise.all(COMBOS.map(([label, vp, opts]) => walk(label, vp, opts).then(r => [label, r])));
for (const [label, r] of walks) report.combos[label] = r;

// «راجع في الكتاب»: on every exercise page, each exercise's link opens the page it names (390, touch).
report.reviewLinks = [];
{
  const { ctx, page } = await session({ width: 390, height: 844 }, { touch: true });
  const served = new Map();
  for (const f of fs.readdirSync(path.join(root, "api/src/data/learning-content", CID)).filter(f => f.endsWith(".json"))) {
    const mod = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-content", CID, f), "utf8"));
    for (const l of mod.lessons) for (const p of l.pages) served.set(p.id, p);
  }
  for (const p of [...served.values()].filter(p => p.layout === "practice")) {
    const targets = p.blocks.filter(b => b.type === "practice").map(b => b.reviewPageId);
    for (let k = 0; k < targets.length; k++) {
      await page.goto(origin + "/#/learning/" + CID + "/read/" + p.id);
      await page.reload();
      await page.locator(".learning-reader-page").first().waitFor({ timeout: 20000 });
      const links = page.locator(".learning-reader-practice-reviewlink");
      // the links render once the Reader's book (its manifest) is known: wait for all of them, never count early
      await page.waitForFunction(n => document.querySelectorAll(".learning-reader-practice-reviewlink").length >= n, targets.length, { timeout: 15000 }).catch(() => {});
      const count = await links.count();
      const want = "راجع في الكتاب: " + served.get(targets[k])?.title;
      const text = count > k ? (await links.nth(k).innerText()).trim() : "";
      if (count > k) await links.nth(k).click();
      const opened = await page.waitForFunction(id => decodeURIComponent(location.hash).includes("/read/" + id), targets[k], { timeout: 10000 }).then(() => true).catch(() => false);
      report.reviewLinks.push({ from: p.id, k, to: targets[k], count, text, ok: count === targets.length && text === want && opened });
    }
  }
  await ctx.close();
}

// Presentation mode and print, on one lesson page per unit (1440, light).
if (ONLY !== "links") {
  const { ctx, page, errors } = await session({ width: 1440, height: 900 });
  for (const id of MODULE_FIRST) {
    await page.goto(origin + "/#/learning/" + CID + "/read/" + id);
    await page.reload();
    await page.locator(".learning-reader-page").first().waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "وضع العرض" }).first().click();
    await page.locator(".learning-reader.is-presentation").first().waitFor({ timeout: 10000 });
    const r = await inspect(page, false);
    await page.getByRole("button", { name: "خروج من وضع العرض" }).first().click();
    const left = (await page.locator(".learning-reader.is-presentation").count()) === 0;
    report.presentation.push({ pageId: id, ...r, left, errors: [...errors] });
    errors.length = 0;
    await page.emulateMedia({ media: "print" });
    const pr = await page.evaluate(() => {
      const visible = el => !!el && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" && el.getBoundingClientRect().height > 0;
      const chrome = [".learning-reader-pagejump", ".learning-reader-toolbar", ".learning-reader-bottom", "aside", "nav"].flatMap(s => [...document.querySelectorAll(s)]).filter(visible).map(e => e.className || e.tagName);
      return { content: visible(document.querySelector(".learning-reader-page")), contentText: (document.querySelector(".learning-reader-page")?.textContent || "").trim().length, chrome };
    });
    if (MODULE_FIRST.indexOf(id) < 2) await page.screenshot({ path: path.join(out, "print-" + id + ".png"), fullPage: true });
    await page.emulateMedia({ media: "screen" });
    report.print.push({ pageId: id, ...pr });
  }
  await ctx.close();
}
await browser.close(); server.close();

// Summary.
const failures = [];
for (const [label, results] of Object.entries(report.combos)) {
  const touch = label.startsWith("390");
  for (const r of results) {
    const where = label + " " + r.pageId;
    if (r.shown !== r.pageId) failures.push(where + ": the Reader showed " + r.shown);
    if (r.axe.length) failures.push(where + ": axe " + r.axe.map(v => v.id + "(" + v.impact + ") " + v.nodes.join(" | ")).join("; "));
    if (r.overflow > 0) failures.push(where + ": overflow " + r.overflow + "px");
    if (r.brokenImages.length) failures.push(where + ": broken images " + r.brokenImages.join(", "));
    if (r.errors.length) failures.push(where + ": page errors " + r.errors.join(" | "));
    if (touch && r.small.length) failures.push(where + ": small targets " + [...new Set(r.small)].join("; "));
    if (r.textLength === 0) failures.push(where + ": empty page");
  }
}
for (const r of report.presentation) {
  if (r.axe.length) failures.push("presentation " + r.pageId + ": axe " + r.axe.map(v => v.id).join(", "));
  if (r.overflow > 0) failures.push("presentation " + r.pageId + ": overflow " + r.overflow + "px");
  if (!r.left) failures.push("presentation " + r.pageId + ": leaving did not restore the Reader");
  if (r.errors.length) failures.push("presentation " + r.pageId + ": page errors " + r.errors.join(" | "));
}
for (const r of report.print) {
  if (!r.content || r.contentText === 0) failures.push("print " + r.pageId + ": the page's content does not print");
  if (r.chrome.length) failures.push("print " + r.pageId + ": chrome prints: " + r.chrome.join(", "));
}
for (const r of report.reviewLinks) if (!r.ok) failures.push("review link " + r.from + " #" + (r.k + 1) + " → " + r.to + ": " + JSON.stringify({ count: r.count, text: r.text }));
if (report.reviewLinks.length !== 110) failures.push("review links checked: " + report.reviewLinks.length + " (110 expected)");
report.failures = failures;
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1));
const checks = Object.values(report.combos).reduce((n, r) => n + r.length, 0);
console.log(`\n${PAGES.length} pages × ${COMBOS.length} combinations = ${checks} page checks; presentation ${report.presentation.length}; print ${report.print.length}; review links ${report.reviewLinks.length}`);
console.log(failures.length ? failures.length + " finding(s):\n  " + failures.slice(0, 80).join("\n  ") : "no finding");
console.log("report: " + path.join(out, "report.json"));
process.exit(failures.length ? 1 : 0);
