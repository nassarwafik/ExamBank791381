#!/usr/bin/env node
// Phase L.8 — the Learning Materials gate in a REAL Chromium on the production build (certification only; nothing is deployed).
// The build in DIST (default ./dist) is served next to the REAL API, in process (browser-harness/learning-l8-api.cjs: every Azure
// Functions handler of api/src/functions, the in-memory storage of the API tests, real signed sessions with per-run random signing
// values). One student of one class that has the whole book published; one teacher.
//
//   1. STUDENT journey (1440 px): the portal lists the book → «ابدأ القراءة» opens the reader on the first page, the body requested
//      with the student's session → «التالي» twice → the server stores the third page as the reading position → «العودة إلى موادي
//      التعليمية» → «أكمل من حيث توقفت» reopens the third page → a NEW browser profile (no local storage: another device) resumes
//      the third page from the server.
//   2. An in-page exercise of a served page: the body carries no key; a wrong answer is judged by the server (verdict + message).
//   3. TEACHER journey (1440 px): #/learning → the book → the reader → «التالي» writes the page into the URL (a page turn REPLACES
//      the entry, decision L2-b) → Back returns to the book, then to the library → Forward twice returns to the reader at the page
//      → a reload keeps the page.
//   4. axe-core (WCAG 2.1 A/AA) on the student portal, the reader (opener and a content page) and the teacher library / book / reader
//      at 390 and 834 px (touch) and 1024 and 1440 px: no serious or critical violation; no horizontal overflow; on the touch sizes
//      every visible control is at least 44 × 44 px (inline links inside running text are exempt, WCAG 2.5.8).
//
// Tools are measuring instruments, not project dependencies: PLAYWRIGHT_CORE_DIR and AXE_CORE_DIR each name a directory whose
// node_modules holds playwright-core / axe-core; CHROMIUM_PATH the browser. Output: HARNESS_OUT/<LABEL>/record.json (+ screenshots).
// Exit 1 when any check fails, 2 when a tool or the build is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "head";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-l8"), label);
const require = createRequire(import.meta.url);
let chromium, axeSource;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
try { axeSource = fs.readFileSync(createRequire(path.join(process.env.AXE_CORE_DIR || root, "package.json")).resolve("axe-core/axe.min.js"), "utf8"); }
catch { console.error("axe-core unavailable (set AXE_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ── the real API, in process ────────────────────────────────────────────────────────────────────────────────────────────────
require(path.join(root, "api/src/lib/observability.js")).setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const modules = require(path.join(root, "api/src/lib/learning-materials-registry.js")).listLearningModules("791381").map(m => m.moduleId);
const student = { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "سارة أحمد", code: "S1001" };
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {
  "platform/users/u1.json": student,
  "platform/classes/cA.json": { classId: "cA", name: "الصف الحادي عشر", grade: "11", status: "active", active: true, studentIds: ["u1"], learningMaterials: [{ courseId: "791381", visibleModuleIds: modules }] },
} });
const studentToken = api.studentToken(student), teacherToken = api.teacherToken();
const requests = [];
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => {
      const r = await api.handle(req.method, req.url, req.headers, body);
      requests.push({ method: req.method, path: u.pathname, status: r.status, student: req.headers["x-student-token"] === studentToken, teacher: String(req.headers.authorization || "").includes(teacherToken) });
      res.writeHead(r.status, r.headers); res.end(r.body);
    });
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

const record = { label, dist, journeys: {}, audits: [], failures: [] };
const fail = (where, what) => { record.failures.push(where + ": " + what); console.log("  ✗ " + where + ": " + what); };
const pass = (where, what) => console.log("  ✓ " + where + ": " + what);
const check = (where, ok, what) => (ok ? pass(where, what) : fail(where, what));

async function session(role, viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  const token = role === "student" ? studentToken : teacherToken;
  await ctx.addInitScript(([t, r]) => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", r); sessionStorage.setItem("examBankSessionDisplayName", r === "student" ? "سارة أحمد" : "المعلم"); }, [token, role]);
  const page = await ctx.newPage();
  page.on("pageerror", e => fail("page error (" + role + " " + viewport.width + ")", e.message));
  return { ctx, page };
}
const pageTitle = page => page.locator(".learning-reader-page h1, .learning-reader-page h2").first().innerText().catch(() => "");
const readerReady = page => page.locator(".learning-reader-page").first().waitFor({ timeout: 15000 });
const progressPage = () => api.mem.getJson("platform/learning-progress/u1.json");

// ── 1. student journey ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("1. student journey");
{
  const { ctx, page } = await session("student", { width: 1440, height: 900 });
  await page.goto(origin + "/");
  await page.getByText("موادي التعليمية").first().waitFor({ timeout: 15000 });
  pass("portal", "the book is listed under «موادي التعليمية»");
  await page.getByRole("button", { name: "ابدأ القراءة" }).first().click();
  await readerReady(page);
  const first = await pageTitle(page);
  const body = requests.find(r => r.path === "/api/learning-content/791381/791381-m01");
  check("reader", !!body && body.status === 200 && body.student, "the first module body came from the API with the student's session (" + (body ? body.status : "no request") + ")");
  const titles = [first];
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "التالي" }).click();
    await page.waitForFunction(prev => { const h = document.querySelector(".learning-reader-page h1, .learning-reader-page h2"); return h && h.textContent.trim() !== prev; }, titles[titles.length - 1], { timeout: 10000 });
    titles.push(await pageTitle(page));
  }
  check("reader", new Set(titles).size === 3, "«التالي» walks three distinct pages: " + titles.join(" → "));
  // a page counts as read after the Reader's dwell time; wait (≤ 10 s) for the server to hold the third page as the position
  let third = null;
  for (let i = 0; i < 50 && !third; i++) { await page.waitForTimeout(200); const last = progressPage()?.courses?.["791381"]?.lastPageId; third = last && last !== "791381-m01-l00-p01" && last !== "791381-m01-l01-p01" ? last : null; }
  check("server progress", !!third, "the server stores the third page as the reading position (" + (third || "none") + ")");
  await page.getByRole("button", { name: "العودة إلى موادي التعليمية" }).click();
  await page.getByText("أكمل من حيث توقفت").first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "تابع القراءة" }).first().click({ timeout: 15000 });
  await readerReady(page);
  check("resume (same browser)", (await pageTitle(page)) === titles[2], "«أكمل من حيث توقفت» reopens «" + titles[2] + "» (got «" + (await pageTitle(page)) + "»)");
  await ctx.close();
  // another device: a fresh browser profile with the same session — no local storage at all
  const other = await session("student", { width: 1440, height: 900 });
  await other.page.goto(origin + "/");
  await other.page.getByText("أكمل من حيث توقفت").first().waitFor({ timeout: 15000 });
  // The Hub fills its card once the dashboard and the released courses have both arrived: wait for the continuation itself.
  const cta = other.page.getByRole("button", { name: "تابع القراءة" }).first();
  const offered = await cta.waitFor({ timeout: 15000 }).then(() => true, () => false);
  if (!offered) {
    fail("resume (another device)", "the Today Hub offers no «تابع القراءة» on another device (it offers: " + (await other.page.locator(".eb-sp-today, [class*=today]").first().innerText().catch(() => "?")).replace(/\s+/g, " ").slice(0, 120) + ")");
    await other.page.locator(".eb-sp-learning-open").first().click();                // the book card's own «ابدأ القراءة» (it resumes from the server)
  } else await cta.click();
  await readerReady(other.page);
  check("resume (another device)", (await pageTitle(other.page)) === titles[2], "a fresh browser profile resumes «" + titles[2] + "» from the server (got «" + (await pageTitle(other.page)) + "»)");
  // 2. a served in-page exercise is judged by the server
  console.log("2. a served exercise");
  const prompt = other.page.locator(".learning-reader-practice.is-interactive").first();
  let found = await prompt.count();
  for (let i = 0; i < 6 && !found; i++) { await other.page.getByRole("button", { name: "التالي" }).click(); await other.page.waitForTimeout(600); found = await prompt.count(); }
  if (!found) fail("exercise", "no interactive exercise found on the next pages");
  else {
    const html = await prompt.evaluate(el => el.outerHTML);
    check("exercise", !/correct|data-key|is-right/.test(html.replace(/is-correct-?/g, "")), "before an answer the exercise's markup names no key");
    const radios = prompt.getByRole("radio");
    if (await radios.count()) {
      const before = requests.filter(r => r.path === "/api/learning-study/791381/attempt").length;
      await radios.first().click();
      await prompt.locator(".learning-reader-practice-verdict.is-right, .learning-reader-practice-verdict.is-wrong").first().waitFor({ timeout: 10000 });
      const verdict = await prompt.locator(".learning-reader-practice-verdict").first().innerText();
      const asked = requests.filter(r => r.path === "/api/learning-study/791381/attempt").length - before;
      check("exercise", asked === 1 && /صحيح|غير صحيح/.test(verdict), "the answer was judged by the server (" + asked + " request): «" + verdict.split("\n")[0] + "»");
    } else pass("exercise", "the first exercise is not a choice question (judging covered by the unit suites)");
  }
  await other.ctx.close();
  record.journeys.student = { titles, resumedTo: titles[2] };
}

// ── 3. teacher journey (URL, Back, Forward, reload) ────────────────────────────────────────────────────────────────────────────
console.log("3. teacher journey");
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  await page.goto(origin + "/#/learning");
  await page.getByRole("button", { name: "فتح الكتاب" }).first().click();
  await page.waitForFunction(() => location.hash === "#/learning/791381", null, { timeout: 10000 });
  pass("teacher", "the book has its own URL (#/learning/791381)");
  await page.getByRole("button", { name: "بدء القراءة" }).first().click();
  await readerReady(page);
  await page.waitForFunction(() => location.hash.startsWith("#/learning/791381/read"), null, { timeout: 10000 });
  const hashes = [await page.evaluate(() => location.hash)];
  await page.getByRole("button", { name: "التالي" }).click();
  await page.waitForFunction(h => location.hash !== h && /\/read\/[^/]+$/.test(location.hash), hashes[0], { timeout: 10000 });
  hashes.push(await page.evaluate(() => location.hash));
  const t2 = await pageTitle(page);
  await page.goBack();
  await page.waitForFunction(() => location.hash === "#/learning/791381", null, { timeout: 10000 }).then(() => pass("teacher back", "Back returns from the reader to the book (a page turn replaced the entry, L2-b)"), () => fail("teacher back", "Back did not return to the book (" + page.url() + ")"));
  await page.goBack();
  await page.waitForFunction(() => location.hash === "#/learning", null, { timeout: 10000 }).then(() => pass("teacher back", "a second Back returns to the library"), () => fail("teacher back", "a second Back did not return to the library (" + page.url() + ")"));
  await page.goForward();
  await page.waitForFunction(() => location.hash === "#/learning/791381", null, { timeout: 10000 }).catch(() => {});
  await page.goForward();
  await page.waitForFunction(h => location.hash === h, hashes[1], { timeout: 10000 }).then(() => pass("teacher forward", "Forward twice returns to the reader at the page it was on"), () => fail("teacher forward", "Forward did not reach " + hashes[1] + " (" + page.url() + ")"));
  await readerReady(page);
  await page.reload();
  await readerReady(page);
  check("teacher reload", (await page.evaluate(() => location.hash)) === hashes[1] && (await pageTitle(page)) === t2, "a reload keeps the page «" + t2 + "»");
  await ctx.close();
  record.journeys.teacher = { hashes };
}

// ── 4. accessibility, overflow and touch targets ───────────────────────────────────────────────────────────────────────────────
console.log("4. axe, overflow, touch targets");
const VIEWPORTS = [{ width: 390, height: 844, touch: true }, { width: 834, height: 1112, touch: true }, { width: 1024, height: 768, touch: false }, { width: 1440, height: 900, touch: false }];
const TARGETS = () => {
  const out = [];
  const inRunningText = el => el.tagName === "A" && el.closest("p, li, td") && (el.closest("p, li, td").textContent || "").trim().length > (el.textContent || "").trim().length + 8;
  for (const el of document.querySelectorAll("button, a[href], [role=button], [role=radio], [role=tab], select, input:not([type=hidden]), summary")) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === "hidden" || el.closest("[aria-hidden=true], [inert]")) continue;
    if (r.bottom < 0 || r.top > innerHeight * 3) continue;                       // the screen and the next two screens
    if (inRunningText(el)) continue;
    if (r.width < 44 || r.height < 44) out.push(((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40)) + " " + Math.round(r.width) + "×" + Math.round(r.height) + " ." + String(el.className).split(" ")[0]);
  }
  return out;
};
async function audit(page, screen, vp) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  const small = vp.touch ? await page.evaluate(TARGETS) : [];
  const entry = { screen, width: vp.width, violations: result, overflow, smallTargets: small };
  record.audits.push(entry);
  const blocking = result.filter(v => v.impact === "serious" || v.impact === "critical");
  const where = screen + " @" + vp.width;
  check(where, blocking.length === 0, blocking.length ? "axe: " + blocking.map(v => v.id + " ×" + v.nodes + " (" + v.targets.join(", ") + ")").join("; ") : "axe: no serious / critical violation" + (result.length ? " (" + result.map(v => v.id + ":" + v.impact).join(", ") + ")" : ""));
  check(where, overflow <= 0, overflow > 0 ? "horizontal overflow " + overflow + " px" : "no horizontal overflow");
  if (vp.touch) check(where, small.length === 0, small.length ? small.length + " control(s) under 44 px: " + small.slice(0, 6).join(" · ") : "every control ≥ 44 px");
}
for (const vp of VIEWPORTS) {
  const s = await session("student", { width: vp.width, height: vp.height }, vp.touch);
  await s.page.goto(origin + "/");
  await s.page.getByText("موادي التعليمية").first().waitFor({ timeout: 15000 });
  await s.page.getByText("موادي التعليمية").first().scrollIntoViewIfNeeded();
  await audit(s.page, "student portal", vp);
  await s.page.getByRole("button", { name: /تابع القراءة|ابدأ القراءة/ }).first().click();
  await readerReady(s.page);
  await audit(s.page, "student reader", vp);
  // back to the unit opener (the first page of the first unit) the way a student does it: «السابق»
  for (let i = 0; i < 6 && !(await s.page.locator(".learning-reader-page.is-opener").count()); i++) { await s.page.getByRole("button", { name: "السابق" }).click(); await s.page.waitForTimeout(500); }
  if (await s.page.locator(".learning-reader-page.is-opener").count() === 0) fail("unit opener @" + vp.width, "the first page of the unit did not open as a unit opener");
  await audit(s.page, "student reader (unit opener)", vp);
  await s.page.screenshot({ path: path.join(out, "student-reader-" + vp.width + ".png") });
  await s.ctx.close();
  const t = await session("teacher", { width: vp.width, height: vp.height }, vp.touch);
  await t.page.goto(origin + "/#/learning");
  await t.page.getByRole("button", { name: "فتح الكتاب" }).first().waitFor({ timeout: 15000 });
  await audit(t.page, "teacher library", vp);
  await t.page.getByRole("button", { name: "فتح الكتاب" }).first().click();
  await t.page.getByRole("button", { name: "بدء القراءة" }).first().waitFor({ timeout: 10000 });
  await audit(t.page, "teacher book", vp);
  await t.page.getByRole("button", { name: "بدء القراءة" }).first().click();
  await readerReady(t.page);
  await t.page.getByRole("button", { name: "التالي" }).click();
  await t.page.waitForTimeout(600);
  await audit(t.page, "teacher reader", vp);
  await t.ctx.close();
}

await browser.close();
server.close();
record.requests = requests.length;
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? "L.8 GATE FAILED: " + record.failures.length + " check(s)" : "L.8 gate passed") + " — record: " + path.join(out, "record.json"));
process.exit(record.failures.length ? 1 : 0);
