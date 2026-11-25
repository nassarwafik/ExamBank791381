#!/usr/bin/env node
// HW-A2 (docs/enterprise-791283-course.md) — the course «أنظمة محوسبة» (791283) in a REAL Chromium on the production build, next to
// the REAL API in process (browser-harness/learning-l8-api.cjs, the L.8 harness). Certification only.
//
//   • TEACHER, every page of the course at 1280 and at 390 (touch): the page opens, no activity says «غير متوفر», no page error, no
//     horizontal scroll of the page;
//   • every 3D model of a part (interactive-diagram / hw-part-3d): its lazy chunk loads, the model is drawn, choosing a piece in the
//     list shows its name and explanation in the card, the model turns with the toolbar;
//   • a question at the end of unit 1 is answered and judged by the REAL server.
//
// Tools are measuring instruments, not project dependencies: PLAYWRIGHT_CORE_DIR (or the global `playwright`), CHROMIUM_PATH.
// SHOT_DIR (optional) receives screenshots. Exit 1 when a check fails, 2 when a tool or the build is missing.
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
const CID = "791283";
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

const failures = [];
const check = (ok, what) => { if (!ok) { console.log("  ✗ " + what); failures.push(what); } return ok; };
const shot = async (page, name) => { if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, name + ".png"), fullPage: true }); };
const index = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-pages", CID + ".json"), "utf8"));
const pageIds = Object.values(index.modules).flat();

async function session(viewport, touch) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(t => {
    sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم");
  }, teacherToken);
  const page = await ctx.newPage();
  page.on("pageerror", e => failures.push("page error: " + e.message));
  return { ctx, page };
}

let models = 0, pages = 0;
for (const [label, viewport, touch] of [["1280", { width: 1280, height: 900 }, false], ["390", { width: 390, height: 844 }, true]]) {
  console.log("viewport " + label);
  const { ctx, page } = await session(viewport, touch);
  for (const pid of pageIds) {
    await page.goto(origin + "/#/learning/" + CID + "/read/" + pid);
    await page.reload();
    await page.locator(".learning-reader-page").first().waitFor({ timeout: 20000 });
    await page.locator(".learning-reader-blocks").first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(1200);
    pages++;
    const hw = page.locator(".learning-hw3d");
    // activities mount when they scroll into view: bring every 3D model's title into view, then wait for the model
    const titles = page.locator(".learning-activity.kind-interactive-diagram .learning-activity-title");
    const expectModel = await titles.count();
    for (let i = 0; i < expectModel; i++) { await titles.nth(i).scrollIntoViewIfNeeded(); await page.waitForTimeout(300); }
    if (expectModel) await hw.nth(expectModel - 1).waitFor({ timeout: 20000 }).catch(() => {});
    check((await hw.count()) === expectModel, pid + " @" + label + ": every 3D model mounted (" + (await hw.count()) + "/" + expectModel + ")");
    check(await page.getByText("غير متوفر حاليًا").count() === 0, pid + " @" + label + ": no activity is unavailable");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, pid + " @" + label + ": no horizontal scroll (" + overflow + "px)");
    const n = await hw.count();
    for (let i = 0; i < n; i++) {
      models++;
      const m = hw.nth(i);
      await m.scrollIntoViewIfNeeded();
      check(await m.locator("svg.i3d-scene polygon").count() >= 8, pid + " @" + label + ": the model is drawn");
      const btn = m.locator(".i3d-target-list button").first();
      const name = (await btn.locator("span").first().textContent()).trim();
      await btn.click();
      const card = (await m.locator(".learning-hw3d-card").textContent()).trim();
      check(card.startsWith(name) && card.length > name.length + 10, pid + " @" + label + ": choosing «" + name + "» explains it");
      const before = await m.locator("svg.i3d-scene").getAttribute("data-yaw");
      await m.getByRole("button", { name: "تدوير لليمين" }).click();
      check(before !== await m.locator("svg.i3d-scene").getAttribute("data-yaw"), pid + " @" + label + ": the model turns");
    }
    if (label === "1280" && n) await shot(page, "hw-" + pid);
    if (label === "390" && n) await shot(page, "hw-" + pid + "-390");
  }
  await ctx.close();
}
check(models === 16, "8 models on each viewport (" + models + ")");
console.log("pages opened: " + pages + ", models explored: " + models);

console.log("a question judged by the real server");
{
  const { ctx, page } = await session({ width: 1280, height: 900 }, false);
  const qPage = pageIds.find(p => p.startsWith(CID + "-m01-l05-p01"));
  await page.goto(origin + "/#/learning/" + CID + "/read/" + qPage);
  await page.reload();
  await page.locator(".learning-reader-page").first().waitFor({ timeout: 20000 });
  const q = page.locator("section, article, div").filter({ has: page.getByText("ما هو الـ Hardware") }).filter({ has: page.getByText("قطعة مادية من الحاسوب") }).last();
  await q.waitFor({ timeout: 10000 });
  await q.getByText("قطعة مادية من الحاسوب").click();
  const submit = q.getByRole("button", { name: /تحقّق|تحقق/ }).first();
  if (await submit.count()) await submit.click();
  await page.waitForTimeout(1200);
  const text = await q.textContent();
  check(/صحيح|أحسنت/.test(text), "the right answer is judged right — " + text.replace(/\s+/g, " ").slice(0, 120));
  await shot(page, "hw-questions");
  await ctx.close();
}

await browser.close();
server.close();
if (failures.length) { console.log("\n" + failures.length + " failure(s)"); process.exit(1); }
console.log("\nall checks passed");
