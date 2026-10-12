#!/usr/bin/env node
// Phase 21E.2 — Visual Quality Gate capture + functional checks on the REAL teacher pages (certification only; never shipped).
// Drives a production build (DIST, default ./dist) in real Chromium through a real teacher session against a small local mock of
// the teacher API (payload shapes the app reads; no token, nothing deployed, service workers blocked, reduced motion).
//   PART=results (default "all"):  «لوحة المتابعة» charts + their data tables; the assignment drill → «تصدير نتائج الواجب (CSV)»;
//                                  «الواجبات» → gradebook → «تصدير سجل العلامات (CSV)» (real browser downloads, bytes checked).
//   PART=builder:                  the structured builder overlay: dialog semantics, toolbar size / visible actions / sticky band,
//                                  overflow menus by keyboard, Escape + unsaved guard, delete → «تراجع» → edit → save, focus,
//                                  inline issues, Field validation — at 1280×900, 853×600 @1.5, 640×450 @2 and 390×844 (touch).
// On a BEFORE build the new controls do not exist: every probe records "absent" instead of failing, so the same script measures
// both builds. Output: HARNESS_OUT/<label>/ screenshots + record.json; a CHECK line per assertion (PASS / FAIL / n/a).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const part = process.env.PART || "all";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-visual-gate-21e2"), label);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ---- fixtures (teacher API shapes; the same shapes as the Vitest fixtures of the affected components) ----
const trend = n => ({ assignmentId: "a" + n, classId: "c1", className: "الحادي عشر", title: "واجب " + n, dueAt: "2026-09-0" + n + "T10:00:00.000Z", date: "2026-09-0" + n, students: 20, submitted: 15 + n, missing: 5 - n, pendingReview: n, completionRate: 70 + n, average: 60 + n * 5, highest: 95, lowest: 40 });
const analytics = { ok: true, generatedAt: "2026-10-10T08:30:00.000Z", scope: { classId: "", className: "كل الصفوف", from: "", to: "" },
  classes: [{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, studentCount: 20 }, { classId: "c2", name: "العاشر", grade: "10", schoolYear: "2026", active: true, studentCount: 18 }],
  kpis: { activeClasses: 2, activeStudents: 38, publishedAssignments: 7, submissions: 51, expectedSubmissions: 60, missingSubmissions: 9, pendingReview: 4, lateSubmissions: 3, completionRate: 85, average: 72.4, highest: 98, lowest: 31, performanceChange: -6.5, followUpStudents: 2, neverLogged: 2 },
  submissionStatus: { submitted: 51, missing: 9, pendingReview: 4, late: 3 },
  gradeDistribution: [{ label: "90-100", count: 6 }, { label: "80-89", count: 10 }, { label: "70-79", count: 9 }, { label: "50-69", count: 8 }, { label: "أقل من 50", count: 3 }],
  assignmentTrend: [trend(1), trend(2), trend(3), trend(4)],
  classComparison: [{ classId: "c1", name: "الحادي عشر", grade: "11", students: 20, assignments: 4, expected: 40, submitted: 33, missing: 7, pendingReview: 2, completionRate: 82.5, average: 74.2 }, { classId: "c2", name: "العاشر", grade: "10", students: 18, assignments: 3, expected: 20, submitted: 18, missing: 2, pendingReview: 2, completionRate: 90, average: 68 }],
  topicAnalytics: ["عنونة IPv4", "الشبكات الفرعية", "التوجيه", "DNS", "DHCP", "طبقات OSI"].map((topic, i) => ({ topic, average: [45, 58, 66, 74, 81, 88][i], gradedQuestions: 10 + i })),
  followUp: [{ userId: "u1", displayName: "سارة خالد", identityNumber: "123456789", classId: "c1", className: "الحادي عشر", average: 42, assigned: 5, completed: 2, missing: 3, completionRate: 40, trendDelta: -16, trend: "declining", lastLoginAt: "2026-09-01T00:00:00.000Z", severity: "high", reasons: ["المعدل منخفض"] }],
  topImprovers: [], insights: [{ tone: "info", title: "معلومة", text: "نسبة التسليم جيدة." }], students: [], studentDetail: null };
const lr = (o = {}) => ({ attemptNumber: 1, score: 62, totalMarks: 100, percentage: 62, submittedAt: "2026-10-01T09:05:00.000Z", finalized: false, manualReviewMarks: 18, gradingStatus: "pendingReview", teacherFeedback: "ملاحظة خاصة بالمعلم", ...o });
const fin = lr({ score: 90, percentage: 90, finalized: true, manualReviewMarks: 0, gradingStatus: "final" });
const students = [
  { studentId: "s1", studentName: "زيد علي", studentCode: "987654321", attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "submitted", gradingStatus: "pendingReview", activeAttempt: null, attempts: [lr()], latestResult: lr() },
  { studentId: "s2", studentName: "خالد سمير", studentCode: "012345678", attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "submitted", gradingStatus: "final", activeAttempt: null, attempts: [fin], latestResult: fin },
  { studentId: "s3", studentName: "=HYPERLINK(\"http://evil\")", studentCode: "000004321", attemptsUsed: 0, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "notStarted", gradingStatus: "notSubmitted", activeAttempt: null, attempts: [], latestResult: null }
];
const assignment = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "واجب الشبكات 1", instructions: "", status: "published", openAt: "", dueAt: "2026-10-20T10:00:00.000Z", questionCount: 5, totalMarks: 100, maxAttempts: 3, durationMinutes: 0 };
const results = { ok: true, assignment: { assignmentId: "a1", title: "واجب الشبكات 1", dueAt: "", durationMinutes: 0, maxAttempts: 3, totalMarks: 100 }, stats: { students: 3, submitted: 2, pendingReview: 1, finalized: 1, notSubmitted: 1, active: 0, average: 76, highest: 90, lowest: 62 }, students };

// A saved structured exam (2 sections, 6 questions) for PART=builder.
const sq = (id, text) => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks: 2, answer: { text: "-" } });
const mkq = (sid, n) => Array.from({ length: n }, (_, i) => sq(sid + "q" + (i + 1), "السؤال " + (i + 1) + " في " + sid));
const savedExam = { schemaVersion: 2, examId: "E9", title: "اختبار الوحدة الثانية", status: "draft", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", metadata: {},
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, instructions: "", questions: mkq("s1", 4) }, { id: "s2", title: "القسم الثاني", gradingPolicy: "all", stimuli: {}, instructions: "", questions: mkq("s2", 2) }] };
// The same exam with a blueprint + quality policy (K1): «المزيد» then holds its longest list (coverage, policy, readiness too).
const blueprintExam = { ...savedExam, examId: "E10", title: "اختبار بمخطط وسياسة جودة",
  blueprint: { schemaVersion: 1, subject: { id: "networking", label: "شبكات الحاسوب" }, topics: [{ id: "t1", label: "IPv4", order: 0 }], objectives: [{ id: "o1", label: "يحسب شبكة فرعية", topicId: "t1", order: 0 }],
    targets: { totalQuestions: 6, totalMarks: 12 }, constraints: [{ id: "c-top", dimension: "topic", ref: "t1", metric: "count", unit: "absolute", min: 2 }],
    qualityPolicy: { schemaVersion: 1, enabled: true, rules: [{ id: "qr1", enabled: true, source: { kind: "constraint", constraintId: "c-top" }, relations: ["below-min"], effect: "warning" }] } } };
const apiCalls = [];
function api(req, res, body) {
  const u = new URL(req.url, "http://localhost"), p = u.pathname;
  apiCalls.push(req.method + " " + p);
  const send = (code, j) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(j)); };
  let j = {}; try { j = JSON.parse(body || "{}"); } catch { /* not JSON */ }
  if (p === "/api/platform-session") return send(200, { ok: true, role: "teacher", displayName: "أ. أحمد" });
  if (p === "/api/teacher-profile") return send(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
  if (p === "/api/project-tracker") return send(200, u.searchParams.get("resource") === "projects-summary" ? { ok: true, totalReadyForReview: 0, byProject: {} } : { ok: true, projects: [] });
  if (p === "/api/messages") return send(200, { ok: true, totalUnread: 0, capped: false, threads: [] });
  if (p === "/api/teacher-analytics") return send(200, analytics);
  if (p === "/api/teacher-achievement-feed") return send(200, { ok: true, posts: [] });
  if (p === "/api/classrooms") return send(200, { ok: true, classes: [{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 3 }] });
  if (p === "/api/assignments" && req.method === "GET") return send(200, { ok: true, assignments: [assignment] });
  if (p === "/api/assignment-results" && req.method === "GET") return send(200, results);
  if (p === "/api/saved-exams" && req.method === "GET") return send(200, { ok: true, exams: [{ blobName: "exams/e9.json", examId: "E9", title: savedExam.title, savedAt: "2026-10-01T10:00:00Z", questionCount: 6, totalMarks: 12 }, { blobName: "exams/e10.json", examId: "E10", title: blueprintExam.title, savedAt: "2026-09-30T10:00:00Z", questionCount: 6, totalMarks: 12 }] });
  if (p === "/api/saved-exams" && j.action === "load") return send(200, { ok: true, exam: j.blobName === "exams/e10.json" ? blueprintExam : savedExam, savedAt: "2026-10-01T10:00:00Z" });
  if (p === "/api/saved-exams" && j.action === "save") return send(200, { ok: true, savedAt: new Date().toISOString(), blobName: "exams/s.json" });
  return send(200, { ok: true, items: [], exams: [], templates: [], questions: [], classes: [], students: [], assignments: [], projects: [], posts: [] });
}
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) { let b = ""; req.on("data", c => { b += c; }); req.on("end", () => api(req, res, b)); return; }
  let full = path.resolve(dist, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(dist + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) full = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [], checks = [], record = { label, dist, part, viewports: {} };
const check = (vp, id, ok, detail) => { checks.push({ vp, id, ok, detail }); };

const VIEWPORTS = [
  ["desktop", { width: 1280, height: 900 }, false, 1],
  ["150pct", { width: 853, height: 600 }, false, 1.5],
  ["200pct", { width: 640, height: 450 }, false, 2],
  ["phone", { width: 390, height: 844 }, true, 2]
];

// `motion` (K1): "reduce" by default; "no-preference" lets a probe see the app's real CSS transitions (the reduced-motion rule
// shortens every transition to .001 ms and can hide a transition-dependent defect).
async function newPage(name, viewport, touch, dsf, motion = "reduce") {
  const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: dsf, locale: "ar", reducedMotion: motion, serviceWorkers: "block", acceptDownloads: true });
  await ctx.addInitScript(() => { sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد"); });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(name + ": " + e)); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(name + " console: " + m.text()); });
  return { ctx, page, shot: (n, full = false) => page.screenshot({ path: path.join(out, name + "-" + n + ".png"), fullPage: full }) };
}
async function gotoNav(page, labelText) {
  const toggle = page.locator(".eb-drawer-toggle");
  if (await toggle.isVisible().catch(() => false)) { await toggle.click(); }
  await page.locator("#eb-sidebar").getByRole("button", { name: labelText }).first().click();
}
const overflow = page => page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
async function download(page, button) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }), button.click()]);
  const file = path.join(out, "dl-" + Date.now() + ".csv"); await dl.saveAs(file);
  const bytes = fs.readFileSync(file);
  return { name: dl.suggestedFilename(), bom: [...bytes.subarray(0, 3)], lines: bytes.subarray(3).toString("utf8").split("\r\n") };
}

async function runResults([name, viewport, touch, dsf]) {
  const { ctx, page, shot } = await newPage("results-" + name, viewport, touch, dsf);
  const rec = record.viewports["results-" + name] = {};
  await page.goto(origin + "/", { waitUntil: "networkidle" });
  await gotoNav(page, "لوحة المتابعة");
  await page.getByRole("heading", { level: 2, name: "الاتجاهات والتحليلات" }).waitFor({ timeout: 20000 });
  const trends = page.locator("section[aria-labelledby='eb-trends-title']");
  await trends.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await shot("01-dashboard-charts");
  const toggles = trends.getByRole("button", { name: "عرض البيانات كجدول" });
  rec.chartTableToggles = await toggles.count();
  rec.figures = await trends.locator("[role='img']").evaluateAll(els => els.map(e => (e.getAttribute("aria-label") || "").slice(0, 60)));
  check(name, "H-01 five charts expose a data-table disclosure", rec.chartTableToggles === 5, rec.chartTableToggles + " toggles");
  if (rec.chartTableToggles) {
    const t = toggles.first(); await t.focus(); await page.keyboard.press("Enter");
    const table = trends.getByRole("table").first();
    await table.waitFor({ timeout: 3000 });
    rec.trendTable = await table.evaluate(el => ({ caption: el.querySelector("caption")?.textContent, head: [...el.querySelectorAll("thead th")].map(th => th.textContent + "|" + th.getAttribute("scope")), rows: [...el.querySelectorAll("tbody tr")].map(tr => [...tr.children].map(c => c.textContent)) }));
    check(name, "H-02 the trend table opens by keyboard with scoped headers and the plotted values", rec.trendTable.rows.length === 4 && rec.trendTable.head.every(h => h.endsWith("|col")) && (await t.getAttribute("aria-expanded")) === "true", JSON.stringify(rec.trendTable.rows[0]));
    await table.scrollIntoViewIfNeeded(); await shot("02-dashboard-trend-table");
  }
  rec.dashboardOverflow = await overflow(page);
  check(name, "V-01 dashboard has no horizontal overflow", rec.dashboardOverflow.scrollWidth <= rec.dashboardOverflow.clientWidth, JSON.stringify(rec.dashboardOverflow));
  // Drill: assignment → results panel → export.
  const aTable = page.locator("section[aria-labelledby='eb-assignments-title'] table");
  await aTable.getByRole("button", { name: "واجب 1" }).first().click();
  const panel = page.getByRole("complementary", { name: "واجب الشبكات 1" }).or(page.getByRole("complementary", { name: "واجب 1" }));
  await panel.first().waitFor({ timeout: 10000 });
  const exp = panel.first().getByRole("button", { name: "تصدير نتائج الواجب (CSV)" });
  if (await exp.count()) {
    const d = await download(page, exp);
    rec.resultsCsv = d;
    const all = d.lines.join("\n");
    check(name, "G-01 assignment results CSV: BOM, stable header without any student code, guarded formula cells, no feedback / identity", d.bom.join(",") === "239,187,191" && d.lines[2]?.startsWith("\"الطالب\",\"الحالة\",") && d.lines.some(l => l.startsWith("\"'=HYPERLINK(")) && !all.includes("ملاحظة خاصة") && !/012345678|987654321|000004321/.test(all), d.name + " " + d.lines.length + " lines");
    await shot("03-dashboard-drill-export");
  } else { rec.resultsCsv = "absent"; check(name, "G-01 assignment results CSV", false, "absent"); }
  await page.getByRole("button", { name: "إغلاق" }).first().click().catch(() => {});
  // Gradebook.
  await gotoNav(page, "الواجبات");
  await page.getByRole("button", { name: "فتح" }).first().click({ timeout: 20000 });
  await page.getByText("خالد سمير").first().waitFor({ timeout: 10000 });
  const gb = page.locator("section.eb-gradebook");
  await gb.scrollIntoViewIfNeeded(); await shot("04-gradebook");
  const gExp = gb.getByRole("button", { name: "تصدير سجل العلامات (CSV)" });
  if (await gExp.count()) {
    await page.getByPlaceholder("بحث بالاسم أو الكود").fill("خالد");
    const d = await download(page, gExp);
    rec.gradebookCsv = d;
    const body = d.lines.slice(4).filter(Boolean);
    const all = d.lines.join("\n");
    check(name, "G-02 gradebook CSV: all three students even while searched, BOM, Arabic header, masked identity (text, leading zeros kept), guarded formula, no feedback", d.bom.join(",") === "239,187,191" && body.length === 3 && d.lines[3].startsWith("\"الطالب\",\"رقم الهوية (آخر 4 خانات)\",\"حالة التصحيح\"") && body.some(l => l.startsWith("\"'=HYPERLINK(")) && body.some(l => l.includes("\"•••••4321\"")) && !/012345678|987654321|000004321/.test(all) && !all.includes("ملاحظة خاصة"), d.name + " rows=" + body.length);
    const box = await gExp.boundingBox();
    rec.gradebookExportBox = box;
    check(name, "G-03 export button is a ≥ 44 px target on touch, ≥ 32 px otherwise", box && box.height >= (touch ? 44 : 32), JSON.stringify(box));
    await page.getByPlaceholder("بحث بالاسم أو الكود").fill("");
  } else { rec.gradebookCsv = "absent"; check(name, "G-02 gradebook CSV", false, "absent"); }
  rec.gradebookOverflow = await overflow(page);
  check(name, "V-02 gradebook page has no horizontal overflow", rec.gradebookOverflow.scrollWidth <= rec.gradebookOverflow.clientWidth, JSON.stringify(rec.gradebookOverflow));
  await ctx.close();
}

if (part === "all" || part === "results") for (const vp of VIEWPORTS) await runResults(vp);
if (part === "all" || part === "builder") {
  const mod = await import("./capture-visual-gate-21e2-builder.mjs").catch(e => { console.log("builder part unavailable: " + e.message); return null; });
  if (mod) for (const vp of VIEWPORTS) await mod.runBuilder({ vp, newPage, origin, record, check, out, overflow });
}
await browser.close(); server.close();
record.errors = errors; record.checks = checks; record.apiCalls = [...new Set(apiCalls)].slice(0, 60);
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
for (const c of checks) console.log("CHECK " + (c.ok ? "PASS" : "FAIL") + " [" + c.vp + "] " + c.id + " — " + c.detail);
console.log(label + ": " + checks.filter(c => c.ok).length + "/" + checks.length + " checks passed; page errors: " + errors.length + (errors.length ? "\n" + errors.join("\n") : ""));
