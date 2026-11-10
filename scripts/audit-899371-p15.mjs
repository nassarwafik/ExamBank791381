#!/usr/bin/env node
// 899371 enrichment P15 (docs/enterprise-899371-enrichment-plan.md §12) — the second final audit: every INTERACTIVE enrichment of the
// course «أسس علم الحاسوب» in a REAL Chromium on the production build, next to the REAL API in process
// (browser-harness/learning-l8-api.cjs). Certification only; nothing runs code (the runner is not configured: «تشغيل» and «افحص حلي»
// are proven by check-899371-browser-p8 / -p14 and the real-Runner CI suites).
//
// On EVERY page that carries one (the teacher sees everything open), in FOUR combinations — 390 px (touch) and 1440 px, the Reader's
// light and «داكن» themes — with every enrichment OPENED and walked to its END:
//   • each animated scene (csharp-scene) stepped with its own «التالي» to its last step;
//   • each tracer already on the page (csharp-trace, P6) moved to its last step;
//   • each «شاهد التنفيذ خطوة بخطوة» (P13) opened (a book question: «شاهد دون توقّع») and moved to its last step;
//   • each «حلّ وافحص» (P14) opened with its editor ready;
// then: axe-core WCAG 2.1 A/AA (every impact), no horizontal overflow, no page error, touch targets ≥ 44 px at 390 (a link inside running
// text excepted), and the number of panels that really opened is the number the page carries.
// Then PRESENTATION mode (1440, light) on one page of each kind, everything opened: axe, overflow, leaving restores.
// Output: AUDIT_OUT (default scratch dir) /report.json + a summary on stdout. Exit 1 when any check fails, 2 when a tool is missing.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const out = path.resolve(process.env.AUDIT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), "audit-899371-p15-")));
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
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".ttf": "font/ttf" };
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

// The pages that carry an interactive enrichment, in reading order, with what each carries.
const TRACES = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-trace", CID + ".json"), "utf8")).traces;
const SOLVE = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-solve", CID + ".json"), "utf8")).questions;
const PAGES = [];
for (const f of fs.readdirSync(path.join(root, "api/src/data/learning-content", CID)).filter(f => f.endsWith(".json")).sort()) {
  const mod = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-content", CID, f), "utf8"));
  for (const p of mod.lessons.flatMap(l => l.pages)) {
    const want = {
      scenes: p.blocks.filter(b => b.type === "animation" && b.animationType === "csharp-scene").length,
      tracers: p.blocks.filter(b => b.type === "simulation" && b.simulationType === "csharp-trace").length,
      traces: Object.keys(TRACES).filter(k => k.startsWith(p.id + "/")).length,
      solves: Object.values(SOLVE).filter(q => q.pageId === p.id).length,
    };
    if (want.scenes + want.tracers + want.traces + want.solves) PAGES.push({ id: p.id, title: p.title, want });
  }
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
const settle = page => page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"), null, { timeout: 5000 }).catch(() => {});
const TARGETS = () => {
  const outT = [];
  const inRunningText = el => el.tagName === "A" && el.closest("p, li, td") && (el.closest("p, li, td").textContent || "").trim().length > (el.textContent || "").trim().length + 8;
  for (const el of document.querySelectorAll(".learning-reader button, .learning-reader a[href], .learning-reader [role=button], .learning-reader [role=radio], .learning-reader [role=tab], .learning-reader select, .learning-reader input:not([type=hidden]), .learning-reader summary")) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === "hidden" || el.closest("[aria-hidden=true], [inert], .monaco-editor")) continue;
    if (inRunningText(el)) continue;
    if (r.width < 44 || r.height < 44) outT.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40) + " " + Math.round(r.width) + "×" + Math.round(r.height));
  }
  return outT;
};
/** Clicks a button while it is enabled (at most `max` times). */
async function stepToEnd(button, max) {
  for (let k = 0; k < max && (await button.isEnabled({ timeout: 2000 }).catch(() => false)); k++) await button.click();
}
/** Opens and walks every enrichment of the page; returns how many of each really opened. */
async function openAll(page) {
  const got = { scenes: 0, tracers: 0, traces: 0, solves: 0 };
  // P11 / P12 scenes: each walked with its own «التالي»
  const scenes = page.locator(".learning-scene-controls");
  for (let i = 0; i < await scenes.count(); i++) {
    const next = scenes.nth(i).getByRole("button", { name: "التالي", exact: true });
    await stepToEnd(next, 30);
    got.scenes++;
  }
  // P13 «شاهد التنفيذ»: open each (a book question first offers the prediction: «شاهد دون توقّع»)
  const watch = page.getByRole("button", { name: "شاهد التنفيذ خطوة بخطوة", exact: true });
  for (let n = await watch.count(); n > 0; n = await watch.count()) {
    await watch.first().click();
    const skip = page.getByRole("button", { name: "شاهد دون توقّع" });
    await skip.first().waitFor({ timeout: 1500 }).then(() => skip.first().click()).catch(() => {});
    got.traces++;
    if (got.traces > 40) break;
  }
  await page.waitForFunction(n => document.querySelectorAll(".learning-trace-panel .learning-trace-counter").length >= n, got.traces, { timeout: 15000 }).catch(() => {});
  // every tracer on the page (P6 activities and P13 panels) to its LAST step: the slider's End, else «الخطوة التالية» while enabled
  // (a scene shares the counter's class: its own controls are not a tracer)
  const counters = page.locator(".learning-trace-counter:not(.learning-scene-controls *)");
  for (let i = 0; i < await counters.count(); i++) {
    const box = counters.nth(i).locator("xpath=ancestor::*[.//button[normalize-space()='الخطوة التالية']][1]");
    const slider = box.locator("input[type=range]");
    if (await slider.count()) await slider.first().press("End");
    else await stepToEnd(box.getByRole("button", { name: "الخطوة التالية" }).first(), 30);
  }
  got.tracers = Math.max(0, (await counters.count()) - got.traces);
  // P14 «حلّ وافحص»: open each, editor ready
  const solve = page.getByRole("button", { name: "حلّ وافحص", exact: true });
  for (let n = await solve.count(); n > 0; n = await solve.count()) {
    await solve.first().click();
    got.solves++;
    if (got.solves > 20) break;
  }
  await page.waitForFunction(n => document.querySelectorAll(".learning-solve .cx-coding, .learning-solve [data-testid='coding-template-response']").length >= n, got.solves, { timeout: 30000 }).catch(() => {});
  got.editors = await page.locator(".learning-solve .cx-coding, .learning-solve [data-testid='coding-template-response']").count();
  return got;
}
async function inspect(page, touch) {
  await settle(page);
  await page.evaluate(axeSource + "\n;0");
  const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map(n => n.target.join(" ")) })));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const small = touch ? await page.evaluate(TARGETS) : [];
  return { axe, overflow, small };
}
/** Opens a page of the Reader and waits until THAT page is shown (its own title), its lazy panels mounted and the lists answered. */
async function openPage(page, { id, title }) {
  await page.goto(origin + "/#/learning/" + CID + "/read/" + id);
  await page.reload();   // a fresh document per page: nothing opened on the previous page can be counted here
  await page.waitForFunction(([pid, t]) => decodeURIComponent(location.hash).includes("/read/" + pid) && [...document.querySelectorAll(".learning-reader-page h2")].some(h => h.textContent.trim() === t.trim()), [id, title], { timeout: 20000 });
  await page.waitForTimeout(300);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
}

async function walk(label, viewport, opts) {
  const { ctx, page, errors } = await session(viewport, opts);
  const results = [];
  for (let i = 0; i < PAGES.length; i++) {
    const { id, want } = PAGES[i];
    const before = errors.length;
    await openPage(page, PAGES[i]);
    const got = await openAll(page);
    const r = await inspect(page, opts.touch);
    results.push({ pageId: id, want, got, ...r, errors: errors.slice(before) });
    if ((i + 1) % 40 === 0) console.log(label + ": " + (i + 1) + " / " + PAGES.length);
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
const report = { courseId: CID, pages: PAGES.length, carried: PAGES.reduce((s, p) => ({ scenes: s.scenes + p.want.scenes, tracers: s.tracers + p.want.tracers, traces: s.traces + p.want.traces, solves: s.solves + p.want.solves }), { scenes: 0, tracers: 0, traces: 0, solves: 0 }), combos: {}, presentation: [] };
for (const [label, r] of await Promise.all(COMBOS.map(([label, vp, opts]) => walk(label, vp, opts).then(r => [label, r])))) report.combos[label] = r;

// Presentation mode (1440, light): one page of each kind, everything opened.
{
  const { ctx, page, errors } = await session({ width: 1440, height: 900 });
  const kinds = [...new Set(["scenes", "tracers", "traces", "solves"].map(k => PAGES.find(p => p.want[k] > 0)).filter(Boolean))];
  for (const pg of kinds) {
    const id = pg.id, before = errors.length;
    await openPage(page, pg);
    await page.getByRole("button", { name: "وضع العرض" }).first().click();
    await page.locator(".learning-reader.is-presentation").first().waitFor({ timeout: 10000 });
    const got = await openAll(page);
    const r = await inspect(page, false);
    await page.getByRole("button", { name: "خروج من وضع العرض" }).first().click();
    const left = (await page.locator(".learning-reader.is-presentation").count()) === 0;
    report.presentation.push({ pageId: id, got, ...r, left, errors: errors.slice(before) });
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
    for (const k of ["scenes", "traces", "solves"]) if (r.got[k] !== r.want[k]) failures.push(where + ": " + k + " opened " + r.got[k] + " of " + r.want[k]);
    if (r.got.tracers < r.want.tracers) failures.push(where + ": tracers " + r.got.tracers + " of " + r.want.tracers);
    if (r.got.editors !== r.want.solves) failures.push(where + ": editors ready " + r.got.editors + " of " + r.want.solves);
    if (r.axe.length) failures.push(where + ": axe " + r.axe.map(v => v.id + "(" + v.impact + ") " + v.nodes.join(" | ")).join("; "));
    if (r.overflow > 0) failures.push(where + ": overflow " + r.overflow + "px");
    if (r.errors.length) failures.push(where + ": page errors " + r.errors.join(" | "));
    if (touch && r.small.length) failures.push(where + ": small targets " + [...new Set(r.small)].join("; "));
  }
}
for (const r of report.presentation) {
  if (r.axe.length) failures.push("presentation " + r.pageId + ": axe " + r.axe.map(v => v.id + " " + v.nodes.join(" | ")).join(", "));
  if (r.overflow > 0) failures.push("presentation " + r.pageId + ": overflow " + r.overflow + "px");
  if (!r.left) failures.push("presentation " + r.pageId + ": leaving did not restore the Reader");
  if (r.errors.length) failures.push("presentation " + r.pageId + ": page errors " + r.errors.join(" | "));
}
report.failures = failures;
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 1));
const checks = Object.values(report.combos).reduce((n, r) => n + r.length, 0);
console.log(`\n${PAGES.length} pages with an interactive enrichment (${JSON.stringify(report.carried)}) × ${COMBOS.length} combinations = ${checks} page checks, everything opened; presentation ${report.presentation.length}`);
console.log(failures.length ? failures.length + " finding(s):\n  " + failures.slice(0, 80).join("\n  ") : "no finding");
console.log("report: " + path.join(out, "report.json"));
process.exit(failures.length ? 1 : 0);
