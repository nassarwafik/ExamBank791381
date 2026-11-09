#!/usr/bin/env node
// 899371 P5 (docs/enterprise-899371-learning-plan.md §17) — the walkthroughs «نحلّ معًا» in a REAL Chromium on the production build, next
// to the REAL API in process (browser-harness/learning-l8-api.cjs, the L.8 harness). Certification only; nothing is deployed.
//
//   1. TEACHER reads the chapter-5 walkthrough «مثلث نجوم مقلوب»: the program is shown exactly as served; before a reveal only the
//      prompt and «فكّر أولًا» show; each press reveals exactly one more step; after the last the result (the three printed lines) and
//      the explanation show and the button goes; «إعادة تعيين» hides every step again.
//   2. PRESENTATION MODE (وضع العرض): the same walkthrough is revealed to the end in front of the class; axe on it; leaving restores
//      the Reader.
//   3. STUDENT (a class with m00–m05 published) reads a walkthrough too (open content) and reveals it: no answer is sent anywhere.
//   4. axe-core (WCAG 2.1 A/AA) on a fully revealed walkthrough at 390 (touch) and 1440, light and «داكن»: no serious / critical
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
  "platform/classes/cA.json": { classId: "cA", name: "الصف الحادي عشر", grade: "11", status: "active", active: true, studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: ["899371-m00", "899371-m01", "899371-m02", "899371-m03", "899371-m04", "899371-m05"] }] },
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
/** The student opens a walkthrough page as the portal does: its device marker (Phase 9A) → «تابع القراءة» on «اليوم». */
async function studentOpens(page, pageId) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), ["examBankReaderPosition:v1:" + student.userId, JSON.stringify({ courseId: CID, pageId, at: new Date().toISOString() })]);
  await page.goto(origin + "/#/s/today");
  await page.reload();
  await page.getByRole("button", { name: "تابع القراءة" }).first().click({ timeout: 15000 });
  await readerReady(page);
  await page.locator(".learning-guided").first().waitFor({ timeout: 15000 });
}



// the chapter-5 walkthrough pages: the summary lesson's pages whose source note is the walkthroughs' own
const m05 = served("899371-m05");
const walkPages = m05.lessons.flatMap(l => l.pages).filter(p => /^نحلّ معًا: /.test(p.title));
const STARS = walkPages.find(p => p.title === "نحلّ معًا: مثلث نجوم مقلوب");
const guidedOf = page => page.blocks.find(b => b.type === "guided");
const teacherOpens = async (page, pageId) => {
  await page.goto(origin + "/#/learning/" + CID + "/read/" + pageId);
  await page.reload();   // a fresh load reads the page from the URL (an outside hash change does not move an open Reader)
  await readerReady(page);
  await page.locator(".learning-guided").first().waitFor({ timeout: 15000 });
};
const state = page => page.evaluate(() => {
  const g = document.querySelector(".learning-guided");
  return {
    steps: [...g.querySelectorAll(".learning-guided-step .learning-guided-steptext")].map(s => s.textContent.replace(/\s+/g, " ").trim()),
    think: !!g.querySelector(".learning-guided-think"),
    result: (g.querySelector(".learning-guided-result")?.textContent || "").replace(/\s+/g, " ").trim(),
    explain: (g.querySelector(".learning-guided-explain")?.textContent || "").trim(),
    progress: (g.querySelector(".learning-guided-progress")?.textContent || "").trim(),
    button: !!g.querySelector(".learning-guided-btn"),
  };
});
/** Waits until no animation runs (a revealed step fades in): axe measures the page as the viewer sees it, not mid-fade. */
const settle = page => page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"), null, { timeout: 5000 });
const revealAll = async (page, n) => { for (let i = 0; i < n; i++) await page.locator(".learning-guided-btn").first().click(); };
check(walkPages.length >= 3 && walkPages.length <= 5 && !!STARS, "chapter 5 holds " + walkPages.length + " walkthrough pages, among them «مثلث نجوم مقلوب»");

console.log("1. teacher: a walkthrough, step by step");
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  await teacherOpens(page, STARS.id);
  const g = guidedOf(STARS);
  const code = await page.evaluate(() => document.querySelector(".learning-reader-codewrap.is-csharp code")?.textContent);
  check(code === STARS.blocks.find(b => b.type === "code").code, "the walkthrough's program is shown exactly as served");
  const s0 = await state(page);
  check(s0.steps.length === 0 && s0.think && !s0.result && s0.progress === "الخطوة 0 من " + g.steps.length, "before a reveal: no step, «فكّر أولًا», no result (" + s0.progress + ")");
  let oneByOne = true;
  for (let i = 1; i <= g.steps.length; i++) {
    await page.locator(".learning-guided-btn").first().click();
    const s = await state(page);
    const expected = g.steps[i - 1].text.map(t => t.text).join("").replace(/\s+/g, " ").trim();
    if (s.steps.length !== i || s.steps[i - 1] !== expected || (i < g.steps.length && s.result)) oneByOne = false;
  }
  check(oneByOne, "each press reveals exactly the next step, in order (" + g.steps.length + " steps), and the result waits for the last");
  const s1 = await state(page);
  check(s1.result.includes("***") && s1.result.includes("**") && s1.explain === g.explanation && !s1.button, "after the last step: the result (the printed lines) and the explanation show, and the button goes");
  await shot(page, "p5-walkthrough-revealed-1440");
  await page.getByRole("button", { name: "إعادة تعيين" }).first().click();
  const s2 = await state(page);
  check(s2.steps.length === 0 && s2.think && !s2.result, "«إعادة تعيين» hides every step again");

  console.log("2. presentation mode");
  await page.getByRole("button", { name: "وضع العرض" }).first().click();
  await page.locator(".learning-reader.is-presentation").first().waitFor({ timeout: 10000 });
  await page.locator(".learning-guided").first().waitFor({ timeout: 10000 });
  const p0 = await state(page);
  await revealAll(page, g.steps.length - p0.steps.length);
  const p1 = await state(page);
  check(p1.steps.length === g.steps.length && p1.result.includes("***"), "in presentation mode the walkthrough is revealed to the end in front of the class");
  await settle(page);
  await page.evaluate(axeSource + "\n;0");
  const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter(x => x.impact === "serious" || x.impact === "critical").map(x => x.id + " ×" + x.nodes.length + " " + x.nodes.map(n => n.target.join(" ") + " " + n.html.slice(0, 120)).join(" | ")));
  check(res.length === 0, "presentation mode: axe — " + (res.join(", ") || "no serious / critical violation"));
  await shot(page, "p5-presentation-1440");
  await page.getByRole("button", { name: "خروج من وضع العرض" }).first().click();
  const left = await page.locator(".learning-reader.is-presentation").count();
  check(left === 0, "leaving presentation mode restores the Reader");
  await ctx.close();
}

console.log("3. student: a walkthrough is open content");
{
  const { ctx, page } = await session("student", { width: 1440, height: 900 });
  const sent = [];
  page.on("request", r => { if (r.method() === "POST" && /\/api\/learning-study\//.test(r.url())) sent.push(r.url()); });
  await page.goto(origin + "/");
  await studentOpens(page, walkPages[0].id);
  const g = guidedOf(walkPages[0]);
  await revealAll(page, g.steps.length);
  const s = await state(page);
  check(s.steps.length === g.steps.length && !!s.result, "the student reads and reveals «" + walkPages[0].title + "» to the end");
  check(sent.length === 0, "revealing a walkthrough sends no answer anywhere (" + sent.length + " requests)");
  await ctx.close();
}

console.log("4. axe, overflow and touch targets on a revealed walkthrough");
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
    const { ctx, page } = await session("teacher", { width: v.width, height: v.height }, { touch: v.touch, readTheme });
    await teacherOpens(page, STARS.id);
    const half = Math.ceil(guidedOf(STARS).steps.length / 2);
    await revealAll(page, half);   // mid-way: steps, the progress and the button are all on the page
    await page.waitForTimeout(300);
    await settle(page);
  await page.evaluate(axeSource + "\n;0");   // evaluated, not an inline <script>: the production CSP stays in force (as L.8)
    const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter(x => x.impact === "serious" || x.impact === "critical").map(x => x.id + " ×" + x.nodes.length + " " + x.nodes.map(n => n.target.join(" ") + " " + n.html.slice(0, 120)).join(" | ")));
    const where = "walkthrough " + v.width + "px " + readTheme;
    check(res.length === 0, where + ": axe — " + (res.join(", ") || "no serious / critical violation"));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(overflow <= 0, where + ": no page overflow (" + overflow + "px)");
    if (v.touch) {
      const small = [...await page.evaluate(TARGETS), ...await page.evaluate(() => [...document.querySelectorAll(".learning-guided button, .learning-activity button")].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.width < 44 || r.height < 44); }).map(b => b.textContent.trim() + " " + Math.round(b.getBoundingClientRect().width) + "×" + Math.round(b.getBoundingClientRect().height)))];
      check(small.length === 0, where + ": touch targets ≥ 44 px, the walkthrough's buttons included" + (small.length ? " — " + [...new Set(small)].join("; ") : ""));
      await shot(page, "p5-walkthrough-390-" + readTheme);
    }
    await ctx.close();
  }
}

await browser.close(); server.close();
console.log(failures.length ? "\n" + failures.length + " check(s) failed:\n  " + failures.join("\n  ") : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
