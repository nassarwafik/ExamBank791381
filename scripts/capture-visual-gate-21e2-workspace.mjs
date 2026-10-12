#!/usr/bin/env node
// Phase 21E.2 — premium teacher workspace pass: Visual Quality Gate capture on the REAL teacher pages (certification only; never
// shipped). Drives a production build (DIST, default ./dist) in real Chromium through a real teacher session against a small
// local mock of the teacher API (the payload shapes App.tsx reads; no token, nothing deployed, service workers blocked, reduced
// motion): landing, «لوحة المتابعة» (today hub + KPIs + charts), «الواجبات», «الصفوف والطلاب», the phone navigation drawer —
// at 1280×900, 853×600 @1.5, 640×450 @2 and 390×844 (touch). On «لوحة المتابعة» it measures the grid columns of the KPI rows and
// the quick actions, the accent bars (::before height) and the navigation's active item; a CHECK line per assertion; it runs on
// a BEFORE build too (the new rules are simply absent there). Output: HARNESS_OUT/<label>/ screenshots + record.json.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const part = process.env.PART || "all";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-visual-gate-21e2-workspace"), label);
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
  if (p === "/api/teacher-today") return send(200, { ok: true, generatedAt: "2026-10-12T08:30:00.000Z", scope: { activeClasses: 2, students: 38, publishedAssignments: 7 },
    attention: { activeAttempts: { count: 2, items: [{ assignmentId: "a1", title: "واجب الشبكات 1", className: "الحادي عشر", studentId: "s1", studentName: "زيد علي", startedAt: "2026-10-12T08:10:00.000Z", status: "started" }, { assignmentId: "a1", title: "واجب الشبكات 1", className: "الحادي عشر", studentId: "s4", studentName: "ريم حسن", startedAt: "2026-10-12T08:02:00.000Z", status: "paused" }] },
      notStarted: { count: 5, assignments: 2, items: [{ assignmentId: "a2", title: "اختبار التوجيه", className: "العاشر", dueAt: "2026-10-14T10:00:00.000Z", notStarted: 3, expected: 18 }, { assignmentId: "a3", title: "مراجعة DNS", className: "الحادي عشر", dueAt: "2026-10-15T10:00:00.000Z", notStarted: 2, expected: 20 }] },
      pendingReview: { count: 4, assignments: 1, items: [{ assignmentId: "a1", title: "واجب الشبكات 1", className: "الحادي عشر", pendingReview: 4 }] },
      unreadMessages: { total: 3, capped: false } },
    recent: [{ kind: "submitted", at: "2026-10-12T08:20:00.000Z", assignmentId: "a1", title: "واجب الشبكات 1", className: "الحادي عشر", studentId: "s2", studentName: "خالد سمير", percentage: 90 }, { kind: "started", at: "2026-10-12T08:10:00.000Z", assignmentId: "a1", title: "واجب الشبكات 1", className: "الحادي عشر", studentId: "s1", studentName: "زيد علي" }],
    partial: [] });
  if (p === "/api/teacher-analytics") return send(200, analytics);
  if (p === "/api/teacher-achievement-feed") return send(200, { ok: true, posts: [] });
  if (p === "/api/classrooms") return send(200, { ok: true, classes: [{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 3 }] });
  if (p === "/api/assignments" && req.method === "GET") return send(200, { ok: true, assignments: [assignment] });
  if (p === "/api/assignment-results" && req.method === "GET") return send(200, results);
  if (p === "/api/saved-exams" && req.method === "GET") return send(200, { ok: true, exams: [] });
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

async function newPage(name, viewport, touch, dsf) {
  const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: dsf, locale: "ar", reducedMotion: "reduce", serviceWorkers: "block", acceptDownloads: true });
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

// ---- 21E.4 audit / certification tour: landing, «لوحة المتابعة», «الواجبات», «الصفوف والطلاب», navigation ----
async function settle(page) { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForTimeout(400); }
async function tour([name, viewport, touch, dsf]) {
  const { ctx, page, shot } = await newPage(name, viewport, touch, dsf);
  const rec = record.viewports[name] = {};
  await page.goto(origin + "/", { waitUntil: "networkidle" }); await settle(page);
  await shot("01-landing"); await shot("01-landing-full", true);
  rec.landingOverflow = await overflow(page);
  const toggle = page.locator(".eb-drawer-toggle");
  if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await page.waitForTimeout(300); await shot("02-nav-open"); await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
  for (const [n, lab] of [["03-dashboard", "لوحة المتابعة"], ["04-assignments", "الواجبات"], ["05-students", "الصفوف والطلاب"]]) {
    try {
      await gotoNav(page, lab); await settle(page); await page.waitForTimeout(500); await shot(n); await shot(n + "-full", true); rec[n] = await overflow(page);
      if (n === "03-dashboard") {
        await page.locator(".eb-dash-kpis").waitFor({ timeout: 15000 });
        const m = rec.metrics = await page.evaluate(() => {
          const cols = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length : null; };
          const pseudo = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el, "::before").height : null; };
          const nav = document.querySelector(".eb-nav-link.is-active");
          const stat = document.querySelector(".eb-stat-card");
          return { primaryCols: cols(".eb-dash-kpis .eb-stat-grid.is-primary"), secondaryCols: cols(".eb-dash-kpis .eb-stat-grid.is-secondary"), actionCols: cols(".eb-today-actions"),
            statAccent: pseudo(".eb-stat-card"), attentionAccent: pseudo(".eb-attention-card"), statBorderStart: stat ? getComputedStyle(stat).borderInlineStartWidth : null,
            navActiveBg: nav ? getComputedStyle(nav).backgroundColor : null, navIndicator: nav ? getComputedStyle(nav, "::before").width : null,
            iconHidden: [...document.querySelectorAll(".eb-stat-icon")].every(e => e.getAttribute("aria-hidden") === "true"), icons: document.querySelectorAll(".eb-stat-icon").length };
        });
        const narrow = viewport.width < 768, wide = viewport.width >= 1280;
        check(name, "KPI headline columns " + (narrow ? "2" : wide ? "4" : "2"), m.primaryCols === (narrow ? 2 : wide ? 4 : 2), m.primaryCols);
        check(name, "KPI secondary columns " + (narrow ? "1" : "3"), m.secondaryCols === (narrow ? 1 : 3), m.secondaryCols);
        check(name, "quick actions columns " + (narrow ? 2 : wide ? 6 : 3), m.actionCols === (narrow ? 2 : wide ? 6 : 3), m.actionCols);
        check(name, "straight accent bars (3px ::before, no inline-start border)", m.statAccent === "3px" && m.attentionAccent === "3px" && m.statBorderStart === "1px", [m.statAccent, m.attentionAccent, m.statBorderStart]);
        check(name, "4 decorative KPI icons, all aria-hidden", m.icons === 4 && m.iconHidden, m.icons);
        check(name, "active nav: tinted (not the solid primary) + 3px indicator", m.navActiveBg !== "rgb(37, 99, 235)" && m.navIndicator === "3px", [m.navActiveBg, m.navIndicator]);
        check(name, "no horizontal page overflow", rec[n].scrollWidth <= rec[n].clientWidth, rec[n]);
      }
    }
    catch (e) { rec[n] = "error: " + String(e).slice(0, 200); }
  }
  await ctx.close();
}
for (const vp of VIEWPORTS) await tour(vp);
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify({ ...record, checks, errors }, null, 2));
for (const c of checks) console.log("CHECK", c.ok ? "PASS" : "FAIL", c.vp, "—", c.id, JSON.stringify(c.detail));
console.log("checks:", checks.filter(c => c.ok).length + "/" + checks.length, "· page errors:", errors.length, errors.slice(0, 5));
await browser.close(); server.close();
