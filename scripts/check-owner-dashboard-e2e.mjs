#!/usr/bin/env node
// Owner teacher dashboard — phase 5: «لوحة البيانات» end to end in a REAL Chromium on the production build, against the REAL API in
// process (browser-harness/learning-l8-api.cjs: every Azure Functions handler on the in-memory storage of the API tests, real
// signed sessions). TEST data only; nothing is deployed; no secret is used. Two managed teachers:
//   SARA  a small, detailed space: 2 classes, students, published assignments with marks, a learning book with reading progress and
//         a project with stage progress — every part of the page is exercised;
//   BIG   a large space (12 classes × 30 students × 12 assignments, reading and project progress for everyone) — the timings.
// The owner signs in with a real owner session. Checks: the teachers table opens the page at its address (full screen); the headline
// figures equal the server's answer; the five charts are drawn (canvas) and named (role="img" with a summary); the progress section;
// a student's detail and back; the class filter; Escape back to the list; every view recorded in the owner audit log; axe-core
// (WCAG 2.1 A/AA: no serious / critical violation); no horizontal overflow at 390 px; no page error. Timings of the large teacher:
// the server's answers and the page until its charts are drawn. Output: HARNESS_OUT/<LABEL>/record.json (+ screenshots).
// PLAYWRIGHT_CORE_DIR / AXE_CORE_DIR name directories whose node_modules hold playwright-core / axe-core; CHROMIUM_PATH the browser.
// Exit 1 when any check fails, 2 when a tool or the build is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "head";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-owner-dashboard"), label);
const require = createRequire(import.meta.url);
let chromium, axeSource;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
try { axeSource = fs.readFileSync(createRequire(path.join(process.env.AXE_CORE_DIR || process.env.PLAYWRIGHT_CORE_DIR || root, "package.json")).resolve("axe-core/axe.min.js"), "utf8"); }
catch { console.error("axe-core unavailable (set AXE_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ── the real API, in process ────────────────────────────────────────────────────────────────────────────────────────────────
for (const k of ["BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY"]) delete process.env[k];
const { setSink } = require(path.join(root, "api/src/lib/observability.js"));
setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {} });
process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
require(require.resolve("@azure/storage-blob", { paths: [path.join(root, "api")] })).BlobServiceClient.fromConnectionString = () => ({ getContainerClient: () => api.mem.container });
const lib = p => require(path.join(root, "api/src", p));
const { teacherAccountName } = lib("lib/identity/teacher-accounts.js");
const { createOwnerToken } = lib("lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = lib("lib/identity/owner-store.js");
const { OWNER_AUDIT_PREFIX } = lib("lib/audit-log.js");
const { loadPageIndex, progressDocName } = lib("lib/learning-progress.js");
const { getStorageNamespace, getProjectDefinition } = lib("lib/project-tracker/registry.js");
const { buildClassSnapshot } = lib("lib/project-tracker/service.js");
const mem = api.mem;

const OWNER = "own_00000000000d0a00", SARA = "t_00000000000d0a01", BIG = "t_00000000000d0a02";
const COURSE = "791381", PROJECT = "899373", INDEX = loadPageIndex(COURSE), MODULES = Object.keys(INDEX.modules).slice(0, 3);
const ns = getStorageNamespace(PROJECT), DEF = getProjectDefinition(PROJECT), STAGES = DEF.stages.map(s => s.stageId);
const DAY = 86400e3, NOW = Date.now(), iso = ms => new Date(ms).toISOString();
const TOPICS = ["المتغيرات", "الشروط", "الحلقات", "الدوال", "المصفوفات"];
const FIRST = ["ليان", "أحمد", "يارا", "محمد", "نور", "سلمى", "كريم", "رهف", "عمر", "جنى"];

function teacher(id, username, displayName) {
  mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], createdAt: iso(NOW - 90 * DAY), updatedAt: iso(NOW - 90 * DAY), origin: "console" });
}
/** One teacher's space: classes, students, published assignments with marks, reading progress and project progress. */
function space(owner, prefix, classCount, studentsPerClass, assignmentsPerClass, seedShift) {
  for (let c = 0; c < classCount; c++) {
    const classId = prefix + "c" + c, ids = [];
    for (let s = 0; s < studentsPerClass; s++) {
      const userId = prefix + "c" + c + "s" + s;
      ids.push(userId);
      mem.setJson("platform/users/" + userId + ".json", { userId, role: "student", code: String(500000 + c * 100 + s), displayName: FIRST[(s + seedShift) % FIRST.length] + " " + (c + 1) + "-" + (s + 1), classId, active: true, archived: false, authVersion: 1, ownerId: owner, lastLoginAt: s % 7 === 6 ? "" : iso(NOW - (s % 5) * DAY) });
      // reading: a varied share of the first units
      const pages = MODULES.flatMap(m => INDEX.modules[m]).slice(0, Math.max(0, Math.round(((s * 37 + c * 11 + seedShift) % 100) / 100 * 40)));
      if (pages.length) mem.setJson(progressDocName(userId), { schemaVersion: 1, courses: { [COURSE]: { lastPageId: pages[pages.length - 1], lastModuleId: MODULES[0], lastReadAt: iso(NOW - s * 3600e3), pages: Object.fromEntries(pages.map(p => [p, iso(NOW - 2 * DAY)])) } } });
      // project: a varied number of stages, the last of them waiting for review
      const done = (s + c + seedShift) % 5;
      if (done) mem.setJson(ns.progressName(classId, userId), { programCode: PROJECT, classId, studentId: userId, stages: Object.fromEntries(STAGES.slice(0, done).map((st, i) => [st, i === done - 1 && s % 2 ? { status: "ready_for_review" } : { status: "approved", approvedAt: iso(NOW - 5 * DAY) }])), history: [], updatedAt: iso(NOW - DAY) });
    }
    mem.setJson("platform/classes/" + classId + ".json", { classId, name: (c % 2 ? "الحادي عشر " : "العاشر ") + String.fromCharCode(0x0623 + c), grade: c % 2 ? "11" : "10", schoolYear: "2026-2027", status: "active", active: true, ownerId: owner, studentIds: ids, learningMaterials: [{ courseId: COURSE, visibleModuleIds: MODULES }], programCodes: [PROJECT], createdAt: iso(NOW - 80 * DAY) });
    mem.setJson(ns.configName(classId), buildClassSnapshot(DEF, classId, iso(NOW - 80 * DAY)));
    for (let a = 0; a < assignmentsPerClass; a++) {
      const assignmentId = prefix + "c" + c + "a" + a, date = iso(NOW - (assignmentsPerClass - a) * 4 * DAY);
      mem.setJson("platform/assignments/" + assignmentId + ".json", { assignmentId, classId, status: "published", title: "واجب " + (a + 1) + " — " + TOPICS[a % TOPICS.length], createdAt: date, dueAt: date, maxAttempts: 1, totalMarks: 10, ownerId: owner,
        examSnapshot: { questions: [{ id: "q1", text: "س", marks: 6, topic: TOPICS[a % TOPICS.length] }, { id: "q2", text: "ص", marks: 4, topic: TOPICS[(a + 2) % TOPICS.length] }] } });
      ids.forEach((studentId, s) => {
        if ((s + a) % 9 === 8) return;                                                                  // some never submit
        const pct = Math.max(15, Math.min(100, 55 + ((s * 13 + a * 7 + c * 5 + seedShift) % 46) - (s % 6 === 0 ? 30 : 0)));
        const pending = (s + a) % 11 === 10;
        mem.setJson("platform/submissions/" + assignmentId + "/" + studentId + ".json", { assignmentId, studentId, classId, activeAttempt: null, attempts: [{ attemptNumber: 1, submittedAt: date, score: pct / 10, totalMarks: 10, percentage: pct, manualReviewMarks: pending ? 2 : 0, finalized: !pending,
          questionGrades: [{ questionId: "q1", score: pct >= 60 ? 6 : 3, maxMarks: 6, correct: pct >= 60, manualReview: false }, { questionId: "q2", score: pending ? 0 : 4 * pct / 100, maxMarks: 4, correct: pct >= 80, manualReview: pending }] }] });
      });
    }
  }
}
teacher(SARA, "t.sara", "سارة الخطيب");
teacher(BIG, "t.big", "معلم كبير");
space(SARA, "sa", 2, 8, 6, 0);
space(BIG, "bg", 12, 30, 12, 3);
// the owner: a real owner account and session (the console reads the token from the tab, as after a sign-in)
mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER, completedAtMs: NOW });
mem.setJson(ownerAccountName(OWNER), { schemaVersion: 1, accountId: OWNER, role: "owner", username: "tadris.owner", displayName: "مالك المنصة", status: "active", authVersion: 1, mfa: {}, credential: {}, recoveryCodes: [] });
const SID = "e".repeat(32);
mem.setJson(ownerSessionName(SID), { schemaVersion: 1, sid: SID, accountId: OWNER, authVersion: 1, createdAtMs: NOW, expiresAtMs: NOW + 7200e3, stepUpAtMs: 0 });
const ownerToken = createOwnerToken({ accountId: OWNER, sid: SID, authVersion: 1 }, { nowMs: NOW }).token;

// ── the build + the API on one origin; each API answer is timed ──────────────────────────────────────────────────────────────
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const apiLog = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => { const t0 = performance.now(); const r = await api.handle(req.method, req.url, req.headers, body); apiLog.push({ method: req.method, path: u.pathname + u.search, status: r.status, ms: Math.round(performance.now() - t0) }); res.writeHead(r.status, r.headers); res.end(r.body); });
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

const record = { label, dist, checks: [], failures: [], timings: {} };
const check = (where, ok, what) => { record.checks.push({ where, ok: !!ok, what }); if (!ok) record.failures.push(where + ": " + what); console.log("  " + (ok ? "✓" : "✗") + " " + where + ": " + what); };
async function open(hash, { width = 1440, height = 1000 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(t => { try { sessionStorage.setItem("tadrisOwnerToken", t); } catch { /* the console then shows its sign-in */ } }, ownerToken);
  const page = await ctx.newPage();
  page.on("pageerror", e => check("page error", false, e.message));
  await page.goto(origin + "/" + hash);
  return { ctx, page };
}
const ask = (page, url) => page.evaluate(async ([u, t]) => (await fetch(u, { headers: { "x-owner-token": t } })).json(), [url, ownerToken]);
const dashboardDrawn = page => page.waitForFunction(() => {
  const charts = document.querySelectorAll(".eb-owner-dash-charts canvas");
  return charts.length >= 4 && [...charts].every(c => c.width > 0 && c.height > 0);
}, null, { timeout: 30000 });
async function axe(page, where) {
  await page.evaluate(axeSource + "\n;0");   // evaluated, not an inline <script>: the production CSP stays in force
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
  });
  const blocking = result.filter(v => v.impact === "serious" || v.impact === "critical");
  check(where, blocking.length === 0, blocking.length ? "axe: " + blocking.map(v => v.id + " ×" + v.nodes + " (" + v.targets.join(", ") + ")").join("; ") : "axe: no serious / critical violation" + (result.length ? " (" + result.map(v => v.id + ":" + v.impact).join(", ") + ")" : ""));
}
const auditViews = () => mem.names(OWNER_AUDIT_PREFIX).map(n => mem.getJson(n)).filter(e => e && e.action === "owner.teacher.dashboard.viewed");

// ── 1. the small teacher: every part of the page ───────────────────────────────────────────────────────────────────────────
console.log("Sara: from the teachers table to every part of «لوحة البيانات»");
{
  const { ctx, page } = await open("#/owner/teachers");
  const button = page.getByRole("button", { name: "لوحة بيانات سارة الخطيب" });
  await button.waitFor({ timeout: 30000 });
  check("table", true, "each row offers «لوحة البيانات»");
  await button.click();
  await page.getByRole("heading", { level: 1, name: "لوحة البيانات: سارة الخطيب" }).waitFor({ timeout: 30000 });
  check("address", page.url().endsWith("#/owner/teachers/" + SARA + "/dashboard"), page.url().replace(origin, ""));
  check("full screen", (await page.getByRole("navigation", { name: "أقسام لوحة المالك" }).count()) === 0, "the console menu is not shown");
  await dashboardDrawn(page);
  const answer = await ask(page, "/api/owner-teacher-dashboard?accountId=" + SARA);
  const kpi = async name => (await page.locator(".eb-owner-dash-kpis .eb-kpi").filter({ hasText: name }).locator(".eb-kpi-value").first().textContent() || "").trim();
  check("figures", (await kpi("الطلاب")) === String(answer.kpis.activeStudents) && (await kpi("الواجبات المنشورة")) === String(answer.kpis.publishedAssignments) && (await kpi("يحتاجون متابعة")) === String(answer.kpis.followUpStudents),
    "students " + (await kpi("الطلاب")) + " / assignments " + (await kpi("الواجبات المنشورة")) + " / follow-up " + (await kpi("يحتاجون متابعة")) + " = the server's answer");
  // the figure of each chart card (Chart.js also marks its canvas role="img", hidden from assistive technology: not counted)
  const figures = await page.locator(".eb-owner-dash-charts [role=img]:not([aria-hidden=true])").evaluateAll(els => els.map(e => (e.getAttribute("aria-label") || "").length));
  const hiddenCanvases = await page.locator(".eb-owner-dash-charts canvas").evaluateAll(els => els.every(e => e.closest("[aria-hidden=true]")));
  check("charts hidden", hiddenCanvases, "every canvas is hidden from assistive technology (the figure around it is the accessible image)");
  check("charts", figures.length === 5 && figures.every(n => n > 10), figures.length + " charts, each named by its summary (" + figures.join(", ") + " characters)");
  check("charts drawn", (await page.locator(".eb-owner-dash-charts canvas").count()) >= 5, (await page.locator(".eb-owner-dash-charts canvas").count()) + " canvases drawn");
  const progress = page.getByRole("region", { name: "التقدّم في المواد والمشاريع" });
  await progress.getByRole("table", { name: "قراءة المواد التعليمية لكل صف" }).waitFor({ timeout: 30000 });
  const rows = { learning: await progress.getByRole("table", { name: "قراءة المواد التعليمية لكل صف" }).locator("tbody tr").count(), projects: await progress.getByRole("table", { name: "التقدّم في المشاريع لكل صف" }).locator("tbody tr").count() };
  check("progress", rows.learning === 2 && rows.projects === 2, rows.learning + " class × book rows, " + rows.projects + " class × project rows");
  await page.screenshot({ path: path.join(out, "1-dashboard.png"), fullPage: false });
  await axe(page, "accessibility (dashboard)");

  const followUp = page.getByRole("region", { name: /طلاب يحتاجون متابعة/ }).or(page.locator("section").filter({ has: page.getByRole("heading", { name: /طلاب يحتاجون متابعة/ }) }));
  const first = followUp.locator("tbody th button").first();
  const name = ((await first.textContent()) || "").trim();
  await first.click();
  await page.getByRole("heading", { level: 2, name: "الطالب: " + name }).waitFor({ timeout: 30000 });
  check("student", apiLog.some(e => e.path.includes("studentId=")), "«" + name + "» opens the student's own detail (classId + studentId)");
  await page.getByRole("button", { name: "→ العودة إلى الصف" }).click();
  await page.waitForFunction(() => !document.querySelector(".eb-owner-dash-student"), null, { timeout: 30000 });
  check("student back", true, "«→ العودة إلى الصف» returns to the class");
  await page.getByRole("combobox", { name: "الصف" }).selectOption("sac1");
  await page.waitForFunction(() => document.querySelector("select")?.value === "sac1", null, { timeout: 30000 });
  await page.waitForTimeout(500);
  check("class filter", apiLog.some(e => e.path.includes("accountId=" + SARA) && e.path.includes("classId=sac1") && !e.path.includes("studentId")), "the figures and the progress are asked for the chosen class");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.hash === "#/owner/teachers", null, { timeout: 30000 });
  check("back", true, "Escape returns to «المعلمون»");
  const views = auditViews().filter(e => e.targetId === SARA);
  check("audit", views.length >= 4 && views.every(e => !JSON.stringify(e.details).includes("sac0s")), views.length + " views recorded (" + [...new Set(views.map(e => e.details.scope))].join(", ") + "), no student id");
  await ctx.close();
}

// ── 2. phone width ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("Sara on a phone (390 px)");
{
  const { ctx, page } = await open("#/owner/teachers/" + SARA + "/dashboard", { width: 390, height: 844 });
  await dashboardDrawn(page);
  await page.getByRole("table", { name: "قراءة المواد التعليمية لكل صف" }).waitFor({ timeout: 30000 });
  const overflow = await page.evaluate(() => { const d = document.querySelector(".eb-owner-dash"); return Math.max(document.documentElement.scrollWidth - innerWidth, d ? d.scrollWidth - d.clientWidth : 0); });
  check("phone", overflow <= 0, "no horizontal overflow (" + overflow + " px)");
  await page.screenshot({ path: path.join(out, "2-phone.png") });
  await ctx.close();
}

// ── 3. the large teacher: timings ───────────────────────────────────────────────────────────────────────────────────────────
console.log("A large teacher (12 classes × 30 students × 12 assignments): timings");
{
  const { ctx, page } = await open("#/owner/teachers");
  await page.getByRole("button", { name: "لوحة بيانات معلم كبير" }).waitFor({ timeout: 30000 });
  const before = apiLog.length, t0 = Date.now();
  await page.getByRole("button", { name: "لوحة بيانات معلم كبير" }).click();
  await dashboardDrawn(page);
  const drawnMs = Date.now() - t0;
  await page.getByRole("table", { name: "التقدّم في المشاريع لكل صف" }).waitFor({ timeout: 60000 });
  const fullMs = Date.now() - t0;
  const calls = apiLog.slice(before).filter(e => e.path.startsWith("/api/owner-teacher-dashboard"));
  const figures = calls.find(e => !e.path.includes("view=progress")), progress = calls.find(e => e.path.includes("view=progress"));
  const answer = await ask(page, "/api/owner-teacher-dashboard?accountId=" + BIG);
  record.timings = { students: answer.kpis.activeStudents, classes: answer.kpis.activeClasses, assignments: answer.kpis.publishedAssignments, figuresApiMs: figures && figures.ms, progressApiMs: progress && progress.ms, chartsDrawnMs: drawnMs, progressShownMs: fullMs };
  console.log("    " + JSON.stringify(record.timings));
  check("large: size", answer.kpis.activeStudents === 360 && answer.kpis.activeClasses === 12, answer.kpis.activeStudents + " students, " + answer.kpis.activeClasses + " classes, " + answer.kpis.publishedAssignments + " assignments");
  // generous bounds (in-memory storage on a CI runner): they catch a pathological regression, not a few milliseconds
  check("large: server", figures && progress && figures.status === 200 && progress.status === 200 && figures.ms < 5000 && progress.ms < 5000, "figures " + (figures && figures.ms) + " ms, progress " + (progress && progress.ms) + " ms (bound 5000)");
  check("large: page", drawnMs < 15000 && fullMs < 20000, "charts drawn after " + drawnMs + " ms, progress after " + fullMs + " ms (bounds 15000 / 20000)");
  await page.screenshot({ path: path.join(out, "3-large.png") });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? record.failures.length + " check(s) failed" : "every check passed (" + record.checks.length + ")"));
process.exit(record.failures.length ? 1 : 0);
