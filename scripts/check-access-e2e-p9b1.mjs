#!/usr/bin/env node
// Tadris+ P9-B1 — the blueprint's E2E acceptance tests (§14.2 #1, #2, #5, #13) in a REAL Chromium on the production build
// (certification only; nothing is deployed). The build in DIST (default ./dist) is served next to the REAL API, in process
// (browser-harness/learning-l8-api.cjs: every Azure Functions handler on the in-memory storage of the API tests, real signed
// sessions with per-run random signing values). The access mode is ENFORCE; every teacher is a managed account with the owner's
// revision, written as TEST data:
//   LINA  learning-only                         — #1 (no exam builder, nor its API) and #13 (reload / deep link)
//   SARA  full-teaching, courses = [791381] only — #2 (one course, never the other; her student neither)
//   HUDA  learning-ready-assignments           — #5 (a ready assignment from the library; the template never changes)
// Each scenario checks what the page OFFERS and what the server ANSWERS to the same session from inside the page (a request the UI
// would not make is still refused: the UI is never the protection). Output: HARNESS_OUT/<LABEL>/record.json (+ screenshots).
// Tools are measuring instruments, not project dependencies: PLAYWRIGHT_CORE_DIR names a directory whose node_modules holds
// playwright-core; CHROMIUM_PATH the browser. Exit 1 when any check fails, 2 when a tool or the build is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "head";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-p9b1"), label);
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ── the real API, in process, enforcing ─────────────────────────────────────────────────────────────────────────────────────
for (const k of ["BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_VERSION", "LEGACY_DATA_OWNER", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY"]) delete process.env[k];
const { withObservability, setSink } = require(path.join(root, "api/src/lib/observability.js"));
setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {} });
// Routes that open their own blob container (the saved exams, the bank) use the same in-memory storage (the value is never dialled).
process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
require(require.resolve("@azure/storage-blob", { paths: [path.join(root, "api")] })).BlobServiceClient.fromConnectionString = () => ({ getContainerClient: () => api.mem.container });
{
  const classrooms = require(path.join(root, "api/src/functions/manage-classrooms.js"));
  const students = require(path.join(root, "api/src/functions/manage-students.js"));
  for (const r of api.routes) {
    if (r.name === "manageClassrooms") r.handler = withObservability("classrooms", (req, ctx, obs) => classrooms.handler(req, { container: api.mem.container }, obs));
    if (r.name === "manageStudents") r.handler = withObservability("students", (req, ctx, obs) => students.handler(req, { container: api.mem.container }, obs));
  }
}
const lib = p => require(path.join(root, "api/src", p));
const { createManagedTeacherToken, newTeacherSessionId } = lib("lib/identity/teacher-token.js");
const { teacherAccountName } = lib("lib/identity/teacher-accounts.js");
const { buildRevision, revisionName } = lib("lib/access/revisions.js");
const { ACCESS_CONTROL_DOC } = lib("lib/access/access-mode.js");
const mem = api.mem;
mem.setJson(ACCESS_CONTROL_DOC, { schemaVersion: 1, mode: "enforce" });

const A = "791381", A1 = "791381-m01", B = "791381s", B1 = "791381s-m01";
const LINA = "t_00000000000e2e01", SARA = "t_00000000000e2e02", HUDA = "t_00000000000e2e03";
function teacher(id, username, displayName, presetId, resources) {
  const { revision } = buildRevision({ accountId: id, presetId, presetVersion: 1, createdBy: "owner:own_00000000000e2e00", ...(resources ? { resources } : {}) });
  mem.setJson(revisionName(revision.revisionId), revision);
  mem.setJson(teacherAccountName(id), { schemaVersion: 1, accountId: id, role: "teacher", username, displayName, status: "active", credential: { algo: "scrypt" }, authVersion: 1, revokedSessions: [], accessRevisionId: revision.revisionId, accessPreset: { id: presetId, version: 1 } });
  return createManagedTeacherToken({ accountId: id, sid: newTeacherSessionId(), authVersion: 1 }).token;
}
const tokens = {
  [LINA]: teacher(LINA, "t.lina", "لينا", "learning-only"),
  [SARA]: teacher(SARA, "t.sara", "سارة", "full-teaching", { courses: [A] }),
  [HUDA]: teacher(HUDA, "t.huda", "هدى", "learning-ready-assignments")
};
mem.setJson("platform/classes/c-sara.json", { classId: "c-sara", name: "صف سارة التجريبي", grade: "العاشر", schoolYear: "2026-2027", status: "active", active: true, ownerId: SARA, studentIds: ["s-sara-1"], learningMaterials: [{ courseId: A, visibleModuleIds: [A1] }, { courseId: B, visibleModuleIds: [B1] }] });
mem.setJson("platform/users/s-sara-1.json", { userId: "s-sara-1", role: "student", code: "9001", displayName: "طالب تجريبي", classId: "c-sara", active: true, archived: false, authVersion: 1, ownerId: SARA });
mem.setJson("platform/classes/c-huda.json", { classId: "c-huda", name: "صف هدى التجريبي", grade: "العاشر", schoolYear: "2026-2027", status: "active", active: true, ownerId: HUDA, studentIds: [] });
mem.setJson("platform/classes/c-lina.json", { classId: "c-lina", name: "صف لينا التجريبي", grade: "العاشر", schoolYear: "2026-2027", status: "active", active: true, ownerId: LINA, studentIds: [] });
const studentToken = api.studentToken({ userId: "s-sara-1", authVersion: 1, code: "9001", displayName: "طالب تجريبي", classId: "c-sara" });

// ── the build + the API on one origin ───────────────────────────────────────────────────────────────────────────────────────
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const apiLog = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => { const r = await api.handle(req.method, req.url, req.headers, body); apiLog.push({ method: req.method, path: u.pathname + u.search, status: r.status, route: r.route }); res.writeHead(r.status, r.headers); res.end(r.body); });
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

const record = { label, dist, checks: [], failures: [] };
const check = (where, ok, what) => { record.checks.push({ where, ok: !!ok, what }); if (!ok) record.failures.push(where + ": " + what); console.log("  " + (ok ? "✓" : "✗") + " " + where + ": " + what); };

/** A tab of the deployed app holding `token`'s session (what a teacher who signed in has), at a phone or a desktop width. */
async function open(token, role = "teacher", { width = 1280, height = 900, url = "/" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(([t, r]) => {
    if (sessionStorage.getItem("examBankBuilderToken")) return;   // a reload keeps the tab's session, as a browser does
    sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", r); sessionStorage.setItem("examBankSessionDisplayName", "تجريبي");
  }, [token, role]);
  const page = await ctx.newPage();
  page.on("pageerror", e => check("page error", false, e.message));
  await page.goto(origin + url);
  await page.waitForLoadState("networkidle").catch(() => {});
  return { ctx, page };
}
const sidebarLabels = page => page.evaluate(() => [...document.querySelectorAll("aside button.eb-nav-link")].map(b => (b.textContent || "").trim()).filter(Boolean));
/** The same session asks the API directly from inside the page (what a crafted request would do). */
const ask = (page, token, method, url, body) => page.evaluate(async ([t, m, u, b]) => {
  const r = await fetch(u, { method: m, headers: { "content-type": "application/json", authorization: "Bearer " + t, "x-builder-token": t, "x-student-token": t }, body: b ? JSON.stringify(b) : undefined });
  let json = null; try { json = await r.json(); } catch { /* not JSON */ }
  return { status: r.status, code: json && json.code, json, etag: r.headers.get("etag") };
}, [token, method, url, body]);
const BUILDER_LABELS = ["باني الامتحان", "بنك الامتحانات", "استيراد من ملف"];
const BUILDER_API = /\/api\/(saved-exams|templates|assessment-presets|generate-exam|exam-question-availability|bank-summary|bank-questions|ai-[a-z-]+|import-[a-z-]+|interpret-exam-request|analyze-global-exam-instruction|question-ai-action|structured-exam-ai-fix|exam-quality-fix|save-exam-artifact)/;
const notEnabledShown = page => page.getByText("هذه الأداة غير مفعّلة لحسابك").isVisible().catch(() => false);
// The builder page's own visible markers (its AI request box and «امتحاناتي»): none of them may be on screen.
const builderShown = page => page.evaluate(() => { const t = document.querySelector("main")?.innerText || document.body.innerText; return t.includes("ماذا تريد في الامتحان؟") || /(^|\n)امتحاناتي(\n|$)/.test(t) || !!document.querySelector(".builder-workspace"); });
/** Strict: the tab's place is answered «غير مفعّلة» AND nothing of the builder page is rendered. */
const builderRefused = async page => (await notEnabledShown(page)) && !(await builderShown(page));

// ── #1 + #13: learning-only ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log("#1 learning-only: no exam builder, nor its API");
{
  const { ctx, page } = await open(tokens[LINA]);
  await page.locator("aside button.eb-nav-link").first().waitFor({ timeout: 20000 });
  const labels = await sidebarLabels(page);
  check("#1 sidebar", BUILDER_LABELS.every(l => !labels.includes(l)) && labels.includes("المواد التعليمية"), "offers " + labels.join(" · ") + " — no builder, bank or import");
  check("#1 landing", await builderRefused(page), "the builder page is not rendered; the tab's place is answered «غير مفعّلة»");
  await page.screenshot({ path: path.join(out, "1-learning-only.png") });
  const t = tokens[LINA];
  for (const [m, u, b] of [["GET", "/api/saved-exams"], ["POST", "/api/ai-question-author", { request: "سؤال" }], ["POST", "/api/generate-exam", {}], ["POST", "/api/import-upload", {}], ["POST", "/api/saved-exams", { action: "save", exam: { title: "x" } }]]) {
    const r = await ask(page, t, m, u, b);
    check("#1 server " + m + " " + u, r.status === 403 && r.code === "CAPABILITY_DENIED", "→ " + r.status + " " + (r.code || ""));
  }
  const uiBuilderOk = apiLog.filter(e => BUILDER_API.test(e.path) && e.status < 400);
  check("#1 traffic", uiBuilderOk.length === 0, uiBuilderOk.length ? "builder data served: " + uiBuilderOk.map(e => e.path).join(", ") : "no builder or AI route served this session anything");

  console.log("#13 reload and deep links never lift the restrictions");
  for (const [what, go] of [["reload", () => page.reload()], ["deep link /builder", () => page.goto(origin + "/builder")], ["deep link #builder", () => page.goto(origin + "/?view=builder#builder")]]) {
    const before = apiLog.length;
    await go(); await page.waitForLoadState("networkidle").catch(() => {});
    await page.locator("aside button.eb-nav-link").first().waitFor({ timeout: 20000 });
    const l = await sidebarLabels(page);
    const probed = apiLog.slice(before).some(e => e.path.startsWith("/api/platform-session") && e.status === 200);
    check("#13 " + what, probed && BUILDER_LABELS.every(x => !l.includes(x)) && (await builderRefused(page)), (probed ? "re-read /api/platform-session; " : "NO session probe; ") + "offers " + l.join(" · "));
    const leaked = apiLog.slice(before).filter(e => BUILDER_API.test(e.path) && e.status < 400);
    check("#13 " + what + " traffic", leaked.length === 0, leaked.length ? "served: " + leaked.map(e => e.path).join(", ") : "no builder route served anything");
  }
  // a stale tab cannot raise itself: a forged role / display name in the tab's storage changes nothing the server decides
  await page.evaluate(() => { sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "مالك"); });
  await page.reload(); await page.waitForLoadState("networkidle").catch(() => {});
  await page.locator("aside button.eb-nav-link").first().waitFor({ timeout: 20000 });
  check("#13 forged tab storage", (await sidebarLabels(page)).every(x => !BUILDER_LABELS.includes(x)) && (await builderRefused(page)), "the probe's access decides, not the tab's storage");
  check("#13 server after reload", (await ask(page, t, "GET", "/api/saved-exams")).status === 403, "the builder API still refuses the same session");
  await page.screenshot({ path: path.join(out, "13-after-reload.png") });
  await ctx.close();
}

// ── #2: one course only ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("#2 entitled to one course: never the other (content / study / training / exam item / catalog), nor her student");
{
  const { ctx, page } = await open(tokens[SARA]);
  await page.locator("aside button.eb-nav-link").first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "المواد التعليمية" }).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, "2-learning.png") });
  const t = tokens[SARA];
  const cat = await ask(page, t, "GET", "/api/learning-materials-catalog");
  const ids = ((cat.json && cat.json.courses) || []).map(c => c.courseId);
  check("#2 catalog", cat.status === 200 && ids.includes(A) && !ids.includes(B), "lists " + ids.join(", "));
  const titleB = await (async () => { const all = (await ask(page, tokens[HUDA], "GET", "/api/learning-materials-catalog")).json; const c = all && (all.courses || []).find(x => x.courseId === B); return c ? (c.title || c.name || "") : ""; })();
  const pageText = await page.evaluate(() => document.querySelector("main")?.textContent || "");
  check("#2 page", !titleB || !pageText.includes(titleB), titleB ? "the page never shows «" + titleB + "»" : "course B has no title to look for (catalog checked above)");
  for (const [what, u] of [["content", "/api/learning-content/" + B + "/" + B1], ["study", "/api/learning-study/" + B]]) {
    const r = await ask(page, t, "GET", u);
    check("#2 server " + what + " B", r.status === 403, "→ " + r.status + " " + (r.code || ""));
  }
  check("#2 server content A", (await ask(page, t, "GET", "/api/learning-content/" + A + "/" + A1)).status === 200, "her own course is served");
  const tr = await ask(page, t, "GET", "/api/learning-training");
  const advanced = ((tr.json && tr.json.trainings) || []).filter(x => x.available && String(x.courseId || "") === B);
  check("#2 server trainings", tr.status === 200 && advanced.length === 0, "no available training of course B");
  await ctx.close();
  // her student, in the student portal
  const s = await open(studentToken, "student");
  await s.page.waitForTimeout(800);
  const mats = await ask(s.page, studentToken, "GET", "/api/student-learning-materials");
  const sIds = ((mats.json && mats.json.materials) || []).map(m => m.courseId);
  check("#2 student materials", mats.status === 200 && sIds.includes(A) && !sIds.includes(B), "the student is offered " + sIds.join(", "));
  const sb = await ask(s.page, studentToken, "GET", "/api/learning-content/" + B + "/" + B1);
  check("#2 student content B", sb.status === 403, "→ " + sb.status + " " + (sb.code || ""));
  await s.page.screenshot({ path: path.join(out, "2-student.png") });
  await s.ctx.close();
}

// ── #5: a ready assignment, the template untouched ──────────────────────────────────────────────────────────────────────────
console.log("#5 a ready assignment from the library; the template never changes (assign, edit, a copy sent back)");
{
  const { ctx, page } = await open(tokens[HUDA]);
  await page.locator("aside button.eb-nav-link").first().waitFor({ timeout: 20000 });
  const labels = await sidebarLabels(page);
  check("#5 sidebar", labels.includes("الواجبات") && !labels.includes("باني الامتحان"), "assignments offered, the builder not");
  const t = tokens[HUDA];
  const fileHash = () => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "api/src/data/exam-library/items/F01.json"))).digest("hex");
  const hash0 = fileHash();
  const item0 = await ask(page, t, "GET", "/api/exam-library/F01");
  check("#5 library item", item0.status === 200 && item0.json && item0.json.item, "the item is readable (→ " + item0.status + ")");
  const body0 = JSON.stringify(item0.json && item0.json.item);
  const own = await ask(page, t, "POST", "/api/assignments", { action: "create", classId: "c-huda", title: "واجب من نسخة معدلة", publish: true, examSnapshot: { ...(item0.json && item0.json.item && item0.json.item.examSnapshot), title: "معدّل" } });
  check("#5 own snapshot refused", own.status === 403 && own.code === "READY_ASSIGNMENTS_ONLY", "a changed copy sent back → " + own.status + " " + (own.code || ""));
  const made = await ask(page, t, "POST", "/api/assignments", { action: "create", classId: "c-huda", title: "واجب جاهز", publish: true, libraryRef: { itemId: "F01" } });
  check("#5 assigned by reference", made.status === 200, "libraryRef → " + made.status + " " + (made.code || ""));
  const id = made.json && made.json.assignment && made.json.assignment.assignmentId;
  if (id) {
    // what this preset may change on its own assignment: the schedule (it holds no assignments.content.edit — the details are refused)
    const upd = await ask(page, t, "POST", "/api/assignments", { action: "setMaxAttempts", assignmentId: id, maxAttempts: 3 });
    check("#5 assignment edited", upd.status === 200, "its attempts → " + upd.status + " " + (upd.code || ""));
    const details = await ask(page, t, "POST", "/api/assignments", { action: "updateDetails", assignmentId: id, title: "x" });
    check("#5 details refused", details.status === 403 && details.code === "CAPABILITY_DENIED", "its content (no assignments.content.edit) → " + details.status);
  }
  const item1 = await ask(page, t, "GET", "/api/exam-library/F01");
  check("#5 template unchanged", JSON.stringify(item1.json && item1.json.item) === body0 && item1.etag === item0.etag && fileHash() === hash0, "the item, its ETag and the shipped file are byte-identical");
  const again = await ask(page, t, "POST", "/api/assignments", { action: "create", classId: "c-huda", title: "واجب جاهز 2", publish: true, libraryRef: { itemId: "F01" } });
  const snap = n => JSON.stringify((mem.getJson("platform/assignments/" + n + ".json") || {}).examSnapshot);
  check("#5 next assignment", again.status === 200 && id && snap(again.json.assignment.assignmentId) === snap(id), "a second assignment gets exactly the same template");
  await page.getByRole("button", { name: "الواجبات" }).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByText("واجب جاهز", { exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
  check("#5 page", await page.getByText("واجب جاهز", { exact: true }).first().isVisible().catch(() => false), "the assignment is listed on «الواجبات»");
  await page.screenshot({ path: path.join(out, "5-assignments.png") });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify({ ...record, api: apiLog }, null, 2));
console.log(record.failures.length ? "\n" + record.failures.length + " check(s) failed" : "\nevery check passed (" + record.checks.length + ")");
process.exit(record.failures.length ? 1 : 0);
