#!/usr/bin/env node
// 899371 P2 + P3 (docs/enterprise-899371-learning-plan.md §14, §15) — the course «أسس علم الحاسوب» in a REAL Chromium on the production build,
// next to the REAL API in process (browser-harness/learning-l8-api.cjs, the L.8 harness). Certification only; nothing is deployed.
//
//   1. TEACHER: the library shows the card (grade 11, 2026–2027) → the overview lists the six sections, each open or «قريبًا»
//      exactly as the manifest says (P3: all open) → the reader opens the first assignment page: the C# panel loads and shows the
//      module body's code EXACTLY (compared with the served body); the page wears the course skin; the chapter-4 figure is a table;
//      the opener shows the title; a chapter-10 drawing loads through the protected, signed /api/content-asset URL (P3-c).
//   2. STUDENT (publication gate): a class with only m00–m01 published → the student reads an m01 page; an m02 body is refused (403).
//   3. axe-core (WCAG 2.1 A/AA) on the overview and on a code page at 390 (touch) and 1440, light and «داكن»: no serious / critical
//      violation; no page overflow; on touch every visible control ≥ 44 × 44.
//
// Tools are measuring instruments, not project dependencies: PLAYWRIGHT_CORE_DIR (or the global `playwright`), AXE_CORE_DIR,
// CHROMIUM_PATH. SHOT_DIR (optional) receives screenshots. Exit 1 when a check fails, 2 when a tool or the build is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const require = createRequire(import.meta.url);
let chromium, axeSource;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { try { ({ chromium } = require("playwright")); } catch { console.error("playwright unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); } }
try { axeSource = fs.readFileSync(createRequire(path.join(process.env.AXE_CORE_DIR || root, "package.json")).resolve("axe-core/axe.min.js"), "utf8"); }
catch { console.error("axe-core unavailable (set AXE_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }

require(path.join(root, "api/src/lib/observability.js")).setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const CID = "899371";
const student = { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "سارة أحمد", code: "S1001" };
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {
  "platform/users/u1.json": student,
  "platform/classes/cA.json": { classId: "cA", name: "الصف الحادي عشر", grade: "11", status: "active", active: true, studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: ["899371-m00", "899371-m01"] }] },
} });
const studentToken = api.studentToken(student), teacherToken = api.teacherToken();
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
const check = (ok, what) => { console.log((ok ? "  ✓ " : "  ✗ ") + what); if (!ok) failures.push(what); };
const served = id => JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-content", CID, id + ".json"), "utf8"));
const blockOf = (moduleId, pageId, type) => served(moduleId).lessons.flatMap(l => l.pages).find(p => p.id === pageId).blocks.find(b => b.type === type);
const shot = async (page, name) => { if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, name + ".png") }); };

async function session(role, viewport, { touch = false, readTheme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  const token = role === "student" ? studentToken : teacherToken;
  await ctx.addInitScript(([t, r, theme]) => {
    sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", r); sessionStorage.setItem("examBankSessionDisplayName", r === "student" ? "سارة أحمد" : "المعلم");
    localStorage.setItem("eb.learning.readingSettings.v1", JSON.stringify({ size: 2, spacing: 1, theme }));
  }, [token, role, readTheme]);
  const page = await ctx.newPage();
  page.on("pageerror", e => failures.push("page error (" + role + "): " + e.message));
  return { ctx, page };
}
const readerReady = page => page.locator(".learning-reader-page").first().waitFor({ timeout: 15000 });

console.log("1. teacher: library → overview → reader");
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  await page.goto(origin + "/#/learning");
  const card = page.locator('article[aria-labelledby="eb-lm-card-' + CID + '"]');
  await card.waitFor({ timeout: 15000 });
  const cardText = await card.innerText();
  check(cardText.includes("الصف الحادي عشر") && cardText.includes("2026–2027"), "the library card shows «أسس علم الحاسوب», الصف الحادي عشر, 2026–2027");
  await card.getByRole("button", { name: /فتح الكتاب/ }).first().click();
  await page.waitForFunction(c => location.hash === "#/learning/" + c, CID, { timeout: 10000 });
  await page.locator("li.eb-lm-batch").first().waitFor({ timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector(".eb-lm-batches-status"), null, { timeout: 10000 });
  const sections = await page.evaluate(() => [...document.querySelectorAll("li.eb-lm-batch")].map(li => ({ text: (li.textContent || "").replace(/\s+/g, " ").trim(), open: li.classList.contains("eb-lm-batch--interactive") })));
  const state = sections.map(x => (x.open ? "open" : "soon")).join(",");
  const manifestSrc = fs.readFileSync(path.join(root, "src/learning/content", CID, "manifest.ts"), "utf8");
  const expectedState = [...manifestSrc.matchAll(/"moduleIds": \[([^\]]*)\]/g)].map(m => (m[1].trim() ? "open" : "soon")).join(",");
  check(sections.length === 6 && state === expectedState && sections.every(x => x.open || x.text.includes("قريبًا")),
    "the overview: the six sections open / «قريبًا» exactly as the manifest says (" + state + ")");
  await shot(page, "p2-overview-1440");

  await page.goto(origin + "/#/learning/" + CID + "/read/899371-m01-l02-p01");
  await readerReady(page);
  await page.getByRole("button", { name: "نسخ الكود" }).first().waitFor({ timeout: 15000 });
  const expected = blockOf("899371-m01", "899371-m01-l02-p01", "code").code;
  const r = await page.evaluate(() => ({
    code: document.querySelector(".learning-reader-codewrap.is-csharp code")?.textContent,
    h2: [...document.querySelectorAll(".learning-reader-page h2, .learning-reader-page h3")].map(h => h.textContent.trim()),
    theme: document.querySelector(".learning-reader-page")?.getAttribute("data-course-theme"),
    tone: document.querySelector(".learning-reader-page")?.getAttribute("data-theme-tone"),
  }));
  check(r.code === expected, "the reader shows the served C# code exactly (" + expected.split("\n").length + " lines)");
  check(r.h2.some(t => t === "الوظيفة الأولى في أسس علم الحاسوب - بيتية"), "the assignment's printed title is on the page");
  check(r.theme === "booklet" && r.tone === "b1", "the course skin: data-course-theme=booklet, tone b1");
  await shot(page, "p2-reader-code-1440");

  await page.goto(origin + "/#/learning/" + CID + "/read/899371-m04-l02-p08");
  await page.reload();   // a fresh load reads the page from the URL (an outside hash change does not move an open Reader)
  await page.locator(".learning-reader-table td", { hasText: "c = 5" }).first().waitFor({ timeout: 15000 }).catch(() => {});
  const fig = await page.evaluate(() => [...document.querySelectorAll(".learning-reader-table th, .learning-reader-table td")].map(c => c.textContent.trim()));
  check(fig.includes("3 < a") && fig.includes("c = 5") && fig.includes("b = 7"), "chapter 4, question 10: the figure is a table (3 < a · c = 5 · b = 7)");
  await page.goto(origin + "/#/learning/" + CID + "/read/899371-m10-l03-p01");
  await page.reload();
  const drawn = await page.locator(".learning-reader-page img").first().waitFor({ timeout: 15000 }).then(async () => {
    await page.waitForFunction(() => { const i = document.querySelector(".learning-reader-page img"); return i && i.complete; }, null, { timeout: 15000 });
    return page.evaluate(() => { const i = document.querySelector(".learning-reader-page img"); return { w: i.naturalWidth, signed: i.getAttribute("src").startsWith("/api/content-asset?"), alt: i.getAttribute("alt") || "" }; });
  }, () => null);
  check(!!drawn && drawn.w > 0 && drawn.signed && drawn.alt.includes("9"), "chapter 10: the matrix drawing loads through the signed /api/content-asset URL, with its alt" + (drawn ? " (" + drawn.w + " px)" : ""));
  await shot(page, "p3-drawing-1440");

  await page.goto(origin + "/#/learning/" + CID + "/read/899371-m01-l00-p01");
  await page.reload();   // a fresh load reads the page from the URL (an outside hash change does not move an open Reader)
  const opener = await page.locator(".learning-reader-page", { hasText: "أوامر الطباعة والمتغيرات" }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  check(opener, "the chapter-1 opener shows the chapter title");
  await ctx.close();
}

console.log("2. student: the publication gate");
{
  const { ctx, page } = await session("student", { width: 1440, height: 900 });
  await page.goto(origin + "/#/s/learning");
  const listed = await page.locator("text=أسس علم الحاسوب >> visible=true").first().waitFor({ timeout: 15000 }).then(() => true, () => false);
  check(listed, "the student's materials list «أسس علم الحاسوب» (m00–m01 published)");
  const status = await page.evaluate(async t => {
    const get = id => fetch("/api/learning-content/899371/" + id, { headers: { "x-student-token": t } }).then(r => r.status);
    return { m01: await get("899371-m01"), m02: await get("899371-m02") };
  }, studentToken);
  check(status.m01 === 200 && status.m02 === 403, "the API serves the published m01 (" + status.m01 + ") and refuses the unpublished m02 (" + status.m02 + ")");
  await ctx.close();
}

console.log("3. axe, overflow and touch targets");
const TARGETS = () => {
  const out = [];
  const inRunningText = el => el.tagName === "A" && el.closest("p, li, td") && (el.closest("p, li, td").textContent || "").trim().length > (el.textContent || "").trim().length + 8;
  for (const el of document.querySelectorAll("button, a[href], [role=button], [role=radio], [role=tab], select, input:not([type=hidden]), summary")) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === "hidden" || el.closest("[aria-hidden=true], [inert]")) continue;
    if (r.bottom < 0 || r.top > innerHeight * 3) continue;
    if (inRunningText(el)) continue;
    if (r.width < 44 || r.height < 44) out.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40) + " " + Math.round(r.width) + "×" + Math.round(r.height));
  }
  return out;
};
for (const v of [{ width: 390, height: 844, touch: true }, { width: 1440, height: 900, touch: false }]) {
  for (const readTheme of ["light", "dark"]) {
    for (const [name, hash] of [["overview", "/#/learning/" + CID], ["code page", "/#/learning/" + CID + "/read/899371-m02-l03-p06"], ["drawing page", "/#/learning/" + CID + "/read/899371-m10-l03-p01"]]) {
      const { ctx, page } = await session("teacher", { width: v.width, height: v.height }, { touch: v.touch, readTheme });
      await page.goto(origin + hash);
      if (name === "overview") { await page.locator("li.eb-lm-batch").first().waitFor({ timeout: 15000 }); await page.waitForFunction(() => !document.querySelector(".eb-lm-batches-status"), null, { timeout: 10000 }); }
      else { await readerReady(page); await page.getByRole("button", { name: "نسخ الكود" }).first().waitFor({ timeout: 15000 }); }
      if (name === "drawing page") await page.locator(".learning-reader-page img").first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(400);
      await page.evaluate(axeSource + "\n;0");   // evaluated, not an inline <script>: the production CSP stays in force (as L.8)
      const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter(x => x.impact === "serious" || x.impact === "critical").map(x => x.id + " ×" + x.nodes.length));
      const where = name + " " + v.width + "px " + readTheme;
      check(res.length === 0, where + ": axe — " + (res.join(", ") || "no serious / critical violation"));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(overflow <= 0, where + ": no page overflow (" + overflow + "px)");
      if (v.touch) { const small = await page.evaluate(TARGETS); check(small.length === 0, where + ": touch targets ≥ 44 px" + (small.length ? " — " + small.join("; ") : "")); }
      if (v.touch && name === "code page") await shot(page, "p2-code-390-" + readTheme);
      await ctx.close();
    }
  }
}

await browser.close(); server.close();
console.log(failures.length ? "\n" + failures.length + " check(s) failed:\n  " + failures.join("\n  ") : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
