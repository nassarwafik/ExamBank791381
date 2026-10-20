#!/usr/bin/env node
// Phase UX-R0 — VISUAL BASELINE capture for the UX-R redesign programme (certification only; never shipped).
// Drives a production build (DIST, default ./dist) in real Chromium against a small local mock of the platform API (payload
// shapes the app reads; no token, nothing deployed, service workers blocked, reduced motion) and screenshots EVERY page the
// redesign touches — every teacher sidebar destination, the student portal and the login screen — at three viewports.
// Each UX-R phase runs it twice (LABEL=before on the baseline build, LABEL=after on the phase head) and attaches the pairs to
// its pull request. It also records, per page, horizontal overflow and page errors, so a redesign that breaks a page shows up
// as data and not only as a picture.
// PART=gallery (or "all") also builds browser-harness/ux-r-gallery.html FROM THE CHECKED-OUT SOURCE and screenshots the shared
// component kit (closed and with the action menu open); run it from a worktree of the baseline to get the "before" kit.
//   DIST=./dist LABEL=before PAGES=dashboard,students VIEWPORTS=desktop PART=all node scripts/capture-visual-baseline-ux-r.mjs
// Output: HARNESS_OUT/<label>/<viewport>/<page>.png (+ gallery/<viewport>*.png) + record.json; one CHECK line per capture.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const only = (process.env.PAGES || "").split(",").map(s => s.trim()).filter(Boolean);
const onlyVp = (process.env.VIEWPORTS || "").split(",").map(s => s.trim()).filter(Boolean);
const part = process.env.PART || "pages";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-ux-r"), label);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
if (part !== "gallery" && !fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ---- fixtures (the shapes of the Vitest fixtures of the same components; demo names only) ----
const NOW = "2026-10-20T08:30:00.000Z";
const CLASSES = [
  { classId: "c1", name: "العاشر – أ", grade: "10", schoolYear: "2026", active: true, status: "active", studentCount: 6, createdAt: NOW },
  { classId: "c2", name: "الحادي عشر – ب", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 4, createdAt: NOW },
  { classId: "c3", name: "الثاني عشر – أ", grade: "12", schoolYear: "2026", active: true, status: "active", studentCount: 0, createdAt: NOW },
];
const NAMES = [["أحمد", "الحسن"], ["بسمة", "عودة"], ["جود", "النجار"], ["حمزة", "المصري"], ["رنا", "سليمان"], ["سلمى", "قاسم"], ["ليث", "فادي"], ["مريم", "يوسف"], ["نور", "خليل"], ["يزن", "عمر"]];
const STUDENTS = NAMES.map(([firstName, familyName], i) => ({
  userId: "u" + (i + 1), code: "C-" + (101 + i), identityNumber: String(400000000 + i * 1111), firstName, familyName, displayName: firstName + " " + familyName,
  classId: i < 6 ? "c1" : "c2", active: i !== 4, archived: false, createdAt: NOW, updatedAt: NOW, lastLoginAt: i === 4 ? "" : NOW,
  submittedAssignmentsCount: 3 + (i % 4), likesCount: i % 3, profilePhoto: null, avatarId: "",
}));
const trend = n => ({ assignmentId: "a" + n, classId: "c1", className: "العاشر – أ", title: "واجب " + n, dueAt: "2026-09-0" + n + "T10:00:00.000Z", date: "2026-09-0" + n, students: 20, submitted: 15 + n, missing: 5 - n, pendingReview: n, completionRate: 70 + n, average: 60 + n * 5, highest: 95, lowest: 40 });
const analytics = { ok: true, generatedAt: NOW, scope: { classId: "", className: "كل الصفوف", from: "", to: "" },
  classes: CLASSES.map(c => ({ classId: c.classId, name: c.name, grade: c.grade, schoolYear: c.schoolYear, active: true, studentCount: c.studentCount })),
  kpis: { activeClasses: 3, activeStudents: 10, publishedAssignments: 7, submissions: 51, expectedSubmissions: 60, missingSubmissions: 9, pendingReview: 4, lateSubmissions: 3, completionRate: 85, average: 72.4, highest: 98, lowest: 31, performanceChange: 3.2, followUpStudents: 2, neverLogged: 1 },
  submissionStatus: { submitted: 51, missing: 9, pendingReview: 4, late: 3 },
  gradeDistribution: [{ label: "90-100", count: 6 }, { label: "80-89", count: 10 }, { label: "70-79", count: 9 }, { label: "50-69", count: 8 }, { label: "أقل من 50", count: 3 }],
  assignmentTrend: [trend(1), trend(2), trend(3), trend(4)],
  classComparison: [{ classId: "c1", name: "العاشر – أ", grade: "10", students: 6, assignments: 4, expected: 24, submitted: 22, missing: 2, pendingReview: 2, completionRate: 91.7, average: 84.2 }, { classId: "c2", name: "الحادي عشر – ب", grade: "11", students: 4, assignments: 3, expected: 12, submitted: 10, missing: 2, pendingReview: 2, completionRate: 83.3, average: 71 }],
  topicAnalytics: ["الدوال التربيعية", "المعادلات الخطية", "الهندسة التحليلية", "الإحصاء", "المتتاليات", "الاحتمالات"].map((topic, i) => ({ topic, average: [91, 87, 79, 74, 66, 58][i], gradedQuestions: 10 + i })),
  followUp: [{ userId: "u3", displayName: "جود النجار", identityNumber: "400002222", classId: "c1", className: "العاشر – أ", average: 48, assigned: 5, completed: 3, missing: 2, completionRate: 60, trendDelta: -12, trend: "declining", lastLoginAt: NOW, severity: "high", reasons: ["المعدل منخفض"] }],
  topImprovers: [], insights: [{ tone: "info", title: "نسبة التسليم جيدة", text: "ارتفعت نسبة التسليم ٥٪ عن الشهر الماضي." }], students: [], studentDetail: null };
const ASSIGNMENTS = [
  ["a1", "c1", "اختبار الدوال التربيعية", "2026-10-20T20:00:00.000Z", 10],
  ["a2", "c2", "برمجة: الحلقات والمصفوفات", "2026-10-21T20:59:00.000Z", 6],
  ["a3", "c2", "واجب الشبكات ٣", "2026-10-22T20:00:00.000Z", 12],
  ["a4", "c1", "مراجعة الوحدة الثانية", "2026-10-30T20:00:00.000Z", 8],
].map(([assignmentId, classId, title, dueAt, questionCount]) => ({ assignmentId, classId, className: CLASSES.find(c => c.classId === classId).name, title, instructions: "", status: "published", openAt: "", dueAt, questionCount, totalMarks: 100, maxAttempts: 3, durationMinutes: 0 }));
const lr = (o = {}) => ({ attemptNumber: 1, score: 62, totalMarks: 100, percentage: 62, submittedAt: "2026-10-01T09:05:00.000Z", finalized: false, manualReviewMarks: 18, gradingStatus: "pendingReview", ...o });
const fin = p => lr({ score: p, percentage: p, finalized: true, manualReviewMarks: 0, gradingStatus: "final" });
const resultRows = STUDENTS.slice(0, 6).map((s, i) => {
  const latest = i === 4 ? null : i === 2 ? lr() : fin(70 + i * 5);
  return { studentId: s.userId, studentName: s.displayName, studentCode: s.identityNumber, attemptsUsed: latest ? 1 : 0, allowedAttempts: 3, dueAtOverride: null, attemptStatus: latest ? "submitted" : "notStarted", gradingStatus: latest ? latest.gradingStatus : "notSubmitted", activeAttempt: null, attempts: latest ? [latest] : [], latestResult: latest };
});
const results = { ok: true, assignment: { assignmentId: "a1", title: ASSIGNMENTS[0].title, dueAt: ASSIGNMENTS[0].dueAt, durationMinutes: 0, maxAttempts: 3, totalMarks: 100 }, stats: { students: 6, submitted: 5, pendingReview: 1, finalized: 4, notSubmitted: 1, active: 0, average: 79, highest: 95, lowest: 62 }, students: resultRows };
const studentDashboard = { ok: true, student: { userId: "u1", code: "C-101", displayName: "أحمد الحسن", classId: "c1", shareAchievements: false }, classroom: { classId: "c1", name: "العاشر – أ", grade: "10", schoolYear: "2026" },
  assignments: ASSIGNMENTS.filter(a => a.classId === "c1").map(a => ({ assignmentId: a.assignmentId, title: a.title, status: "published", dueAt: a.dueAt, totalMarks: 100, questionCount: a.questionCount, maxAttempts: 3, attemptsUsed: 0, durationMinutes: 0 })), stats: { assigned: 2, completed: 0, average: 0 } };

const apiCalls = new Map();
let role = "teacher";
function api(req, res) {
  const u = new URL(req.url, "http://localhost"), p = u.pathname;
  apiCalls.set(req.method + " " + p, (apiCalls.get(req.method + " " + p) || 0) + 1);
  const send = (code, j) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(j)); };
  if (p === "/api/platform-session") return role ? send(200, { ok: true, role, displayName: role === "teacher" ? "أ. محمد" : "أحمد الحسن" }) : send(401, { ok: false });
  if (p === "/api/teacher-profile") return send(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. محمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
  if (p === "/api/teacher-analytics") return send(200, analytics);
  if (p === "/api/classrooms") return send(200, { ok: true, classes: CLASSES });
  if (p === "/api/students" && u.searchParams.get("profileUserId")) return send(200, { ok: true, profile: null });
  if (p === "/api/students") return send(200, { ok: true, students: STUDENTS.filter(s => !u.searchParams.get("classId") || s.classId === u.searchParams.get("classId")) });
  if (p === "/api/assignments" && req.method === "GET") return send(200, { ok: true, assignments: ASSIGNMENTS });
  if (p === "/api/assignment-results" && req.method === "GET") return send(200, results);
  if (p === "/api/project-tracker") return send(200, u.searchParams.get("resource") === "projects-summary" ? { ok: true, totalReadyForReview: 0, byProject: {} } : { ok: true, projects: [] });
  if (p === "/api/messages") return send(200, { ok: true, totalUnread: 0, capped: false, threads: [] });
  if (p === "/api/student-dashboard") return send(200, studentDashboard);
  if (p === "/api/student-notifications") return send(200, { ok: true, items: [], unread: 0, total: 0 });
  return send(200, { ok: true, items: [], exams: [], templates: [], questions: [], classes: [], students: [], assignments: [], projects: [], posts: [], threads: [] });
}
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
// The gallery is a separate static build (vite, the repository's own config) served from its own root under /gallery/.
const galleryDir = path.join(out, "gallery-build");
if (part === "gallery" || part === "all") {
  const { build } = await import("vite");
  await build({ configFile: path.join(root, "vite.config.ts"), root, base: "/gallery/", logLevel: "warn", publicDir: path.join(root, "public"), build: { outDir: galleryDir, emptyOutDir: true, copyPublicDir: false, rollupOptions: { input: path.join(root, "browser-harness/ux-r-gallery.html") } } });
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) { req.resume(); req.on("end", () => api(req, res)); return; }
  const gallery = u.pathname.startsWith("/gallery/");
  const base = gallery ? galleryDir : u.pathname.startsWith("/fonts/") && part === "gallery" ? path.join(root, "public") : dist;
  let full = path.resolve(base, "." + decodeURIComponent(gallery ? u.pathname.slice("/gallery".length) : u.pathname));
  if (!full.startsWith(base + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) full = gallery ? path.join(galleryDir, "browser-harness/ux-r-gallery.html") : path.join(dist, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;

// ---- pages: every teacher sidebar destination (by its visible label), the student portal, the login screen ----
const TEACHER_PAGES = [
  ["dashboard", "لوحة المتابعة"], ["learning", "المواد التعليمية"], ["students", "الصفوف والطلاب"], ["assignments", "الواجبات"],
  ["messages", "الرسائل"], ["projects", "المشاريع"], ["reports", "التقارير"], ["games", "الألعاب التعليمية"], ["bank", "بنك الامتحانات"],
  ["import", "استيراد من ملف"], ["reviews", "مراجعات النشر"], ["audit", "سجل النشاط"],
];
const PAGES = part === "gallery" ? [] : [...TEACHER_PAGES.map(([id, nav]) => ({ id, role: "teacher", nav })), { id: "student-portal", role: "student" }, { id: "login", role: "" }]
  .filter(pg => !only.length || only.includes(pg.id));
const VIEWPORTS = [["desktop", { width: 1440, height: 900 }, false], ["tablet", { width: 1024, height: 768 }, false], ["phone", { width: 390, height: 844 }, true]]
  .filter(([n]) => !onlyVp.length || onlyVp.includes(n));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const record = { label, dist, generatedAt: new Date().toISOString(), pages: {} }, checks = [];
for (const [vpName, viewport, touch] of VIEWPORTS) {
  fs.mkdirSync(path.join(out, vpName), { recursive: true });
  for (const pg of PAGES) {
    role = pg.role;
    const errors = [];
    const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1, locale: "ar", reducedMotion: "reduce", serviceWorkers: "block" });
    if (pg.role) await ctx.addInitScript(r => { sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", r); sessionStorage.setItem("examBankSessionDisplayName", r === "teacher" ? "أ. محمد" : "أحمد الحسن"); }, pg.role);
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    let reached = true;
    try {
      await page.goto(origin + "/", { waitUntil: "networkidle" });
      if (pg.nav) {
        const toggle = page.locator(".eb-drawer-toggle");
        if (await toggle.isVisible().catch(() => false)) await toggle.click();
        await page.locator("#eb-sidebar").getByRole("button", { name: pg.nav, exact: true }).first().click({ timeout: 15000 });
        await page.waitForLoadState("networkidle");
      }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
    } catch (e) { reached = false; errors.push("navigation: " + String(e).split("\n")[0]); }
    const file = path.join(out, vpName, pg.id + ".png");
    await page.screenshot({ path: file, fullPage: true });
    const m = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, height: document.documentElement.scrollHeight, h1: document.querySelector("h1")?.textContent?.trim() || "" }));
    const overflow = m.scrollWidth > m.clientWidth;
    (record.pages[pg.id] ||= {})[vpName] = { reached, overflow, ...m, errors, screenshot: path.relative(out, file) };
    checks.push({ ok: reached && !overflow && !errors.length, id: vpName + "/" + pg.id, detail: (reached ? "reached" : "NOT reached") + (overflow ? " · horizontal overflow " + m.scrollWidth + ">" + m.clientWidth : "") + (errors.length ? " · " + errors.length + " error(s)" : "") });
    await ctx.close();
  }
}
if (part === "gallery" || part === "all") {
  fs.mkdirSync(path.join(out, "gallery"), { recursive: true });
  for (const [vpName, viewport, touch] of VIEWPORTS) {
    const errors = [];
    const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1, locale: "ar", reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    let sections = 0;
    try {
      await page.goto(origin + "/gallery/browser-harness/ux-r-gallery.html", { waitUntil: "networkidle" });
      await page.locator("[data-gallery]").first().waitFor({ timeout: 10000 });
      await page.evaluate(() => document.fonts.ready);
      sections = await page.locator("[data-gallery]").count();
      await page.screenshot({ path: path.join(out, "gallery", vpName + ".png"), fullPage: true });
      await page.locator("[data-gallery='buttons']").scrollIntoViewIfNeeded();
      await page.getByRole("button", { name: "المزيد من الإجراءات" }).click();
      await page.locator(".eb-menu-panel[data-ready='true']").waitFor({ timeout: 3000 }).catch(() => errors.push("action menu did not open"));
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out, "gallery", vpName + "-menu-open.png") });
    } catch (e) { errors.push("gallery: " + String(e).split("\n")[0]); }
    (record.gallery ||= {})[vpName] = { sections, errors };
    checks.push({ ok: sections > 0 && !errors.length, id: vpName + "/gallery", detail: sections + " sections" + (errors.length ? " · " + errors.join(" | ") : "") });
    await ctx.close();
  }
}
await browser.close(); server.close();
record.apiCalls = Object.fromEntries([...apiCalls].sort());
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
for (const c of checks) console.log("CHECK " + (c.ok ? "PASS" : "FAIL") + " " + c.id + " — " + c.detail);
console.log(label + ": " + checks.filter(c => c.ok).length + "/" + checks.length + " page captures clean → " + out);
