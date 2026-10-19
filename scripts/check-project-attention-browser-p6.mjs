#!/usr/bin/env node
// Phase P6 — the teacher sees and confirms the students' own marks, in a REAL Chromium on the production build
// (certification only; nothing is deployed). The build in DIST (default ./dist) is served next to the REAL API, in process
// (browser-harness/learning-l8-api.cjs: every Azure Functions handler on the in-memory storage of the API tests, real
// signed sessions). One teacher; one class of 24 students enrolled in project 899373. Before each viewport, six students
// mark stages done through the REAL student route (POST /api/student-project-tracker with their own session).
//
// At 390 px (touch) and 1024 and 1440 px:
//   1. the sidebar «المشاريع» badge and the hub card show the server's count of the students' own marks;
//   2. in the project, the class selector and «التقييم الجماعي» carry the class figures, and the dashboard's «تأكيد ما حدّده
//      الطلاب» opens the bulk review on «حدّدها الطلاب», grouped by student;
//   3. the page never scrolls sideways; the group buttons are at least 44 px tall on touch (otherwise the shared small-button
//      density, 34 px);
//   4. a group's «تأكيد مراحل …» confirms only that student's stages in ONE progress.bulk request (checked in storage)
//      and the sidebar badge follows the server;
//   5. axe-core (WCAG 2.1 A/AA): no serious or critical violation on the dashboard and on the grouped list.
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
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-p6"), label);
const require = createRequire(import.meta.url);
let chromium, axeSource;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
try { axeSource = fs.readFileSync(createRequire(path.join(process.env.AXE_CORE_DIR || root, "package.json")).resolve("axe-core/axe.min.js"), "utf8"); }
catch { console.error("axe-core unavailable (set AXE_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ── the real API, in process ────────────────────────────────────────────────────────────────────────────────────────────────
const { withObservability, setSink } = require(path.join(root, "api/src/lib/observability.js"));
setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {} });
{
  const classrooms = require(path.join(root, "api/src/functions/manage-classrooms.js"));
  const students = require(path.join(root, "api/src/functions/manage-students.js"));
  for (const r of api.routes) {
    if (r.name === "manageClassrooms") r.handler = withObservability("classrooms", (req, ctx, obs) => classrooms.handler(req, { container: api.mem.container }, obs));
    if (r.name === "manageStudents") r.handler = withObservability("students", (req, ctx, obs) => students.handler(req, { container: api.mem.container }, obs));
  }
}
const CODE = "899373";
const { getStorageNamespace, getProjectDefinition } = require(path.join(root, "api/src/lib/project-tracker/registry.js"));
const NS = getStorageNamespace(CODE);
const DEF = getProjectDefinition(CODE);
const BOOK = DEF.stages.filter(s => s.active === true && s.track === DEF.tracks[0].trackId).sort((a, b) => a.order - b.order).map(s => s.stageId);
const teacherToken = api.teacherToken();
const call = async (method, url, body, headers = { authorization: "Bearer " + teacherToken, "x-builder-token": teacherToken }) => {
  const r = await api.handle(method, url, headers, body ? JSON.stringify(body) : "");
  return { status: r.status, json: r.body ? JSON.parse(r.body) : null };
};
let classId = "";
const studentIds = [];
{
  const c = await call("POST", "/api/classrooms", { action: "create", name: "الحادي عشر 7", grade: "الحادي عشر", schoolYear: "2026-2027" });
  if (c.status !== 200) throw new Error("seed class: " + JSON.stringify(c.json));
  classId = c.json.classroom.classId;
  for (let i = 0; i < 24; i++) {
    const s = await call("POST", "/api/students", { action: "create", classId, firstName: "طالب" + (i + 1), familyName: "العائلة" + (i + 1), identityNumber: String(314000000 + i) });
    if (s.status !== 200) throw new Error("seed student: " + JSON.stringify(s.json));
    studentIds.push(s.json.student.userId);
  }
  const p = await call("POST", "/api/classrooms", { action: "setPrograms", classId, programCodes: [CODE] });
  if (p.status !== 200) throw new Error("seed project: " + JSON.stringify(p.json));
}
// Students mark stages through their OWN route and session (exactly what «أنجزتها» sends).
async function studentMarks(sid, stageIds) {
  const userDoc = api.mem.getJson("platform/users/" + sid + ".json");
  const tok = api.studentToken(userDoc);
  const r = await call("POST", "/api/student-project-tracker", { projectCode: CODE, stageIds, mark: true }, { authorization: "Bearer " + tok, "x-student-token": tok });
  if (r.status !== 200) throw new Error("student mark: " + JSON.stringify(r.json));
}
const attention = async () => (await call("GET", "/api/project-tracker?resource=projects-summary&include=attention")).json;
const entry = (sid, stageId) => { const d = api.mem.getJson(NS.progressName(classId, sid)); return d && d.stages ? d.stages[stageId] : undefined; };

const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const posts = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => {
      if (req.method === "POST" && u.pathname === "/api/project-tracker") { try { posts.push(JSON.parse(body)); } catch { /* not JSON */ } }
      const r = await api.handle(req.method, req.url, req.headers, body); res.writeHead(r.status, r.headers); res.end(r.body);
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

const record = { label, dist, screens: [], failures: [] };
const fail = (where, what) => { record.failures.push(where + ": " + what); console.log("  ✗ " + where + ": " + what); };
const pass = (where, what) => console.log("  ✓ " + where + ": " + what);
const check = (where, ok, what) => (ok ? pass(where, what) : fail(where, what));

async function axe(page, where) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
  });
  const blocking = result.filter(v => v.impact === "serious" || v.impact === "critical");
  check(where, blocking.length === 0, blocking.length ? "axe: " + blocking.map(v => v.id + " ×" + v.nodes + " (" + v.targets.join(", ") + ")").join("; ") : "axe: no serious / critical violation" + (result.length ? " (" + result.map(v => v.id + ":" + v.impact).join(", ") + ")" : ""));
  return result;
}

const VIEWPORTS = [{ width: 390, height: 844, touch: true }, { width: 1024, height: 768, touch: false }, { width: 1440, height: 900, touch: false }];
let round = 0;
for (const vp of VIEWPORTS) {
  const at = "@" + vp.width;
  console.log("P6 " + at);
  // six students of this round mark two book stages each (rounds use different students)
  const marking = studentIds.slice(round * 6, round * 6 + 6);
  for (const sid of marking) await studentMarks(sid, [BOOK[0], BOOK[1]]);
  round++;
  const before = await attention();
  const waiting = before.totalSelfReported;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(t => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم"); }, teacherToken);
  const page = await ctx.newPage();
  page.on("pageerror", e => fail("page error " + at, e.message));
  await page.goto(origin + "/");
  // 1. sidebar badge + hub card
  const menu = page.getByRole("button", { name: /القائمة/ }).first();
  await menu.waitFor({ timeout: 15000 }).catch(() => {});
  const nav = page.getByRole("button", { name: /^المشاريع/ }).first();
  if (!(await nav.isVisible().catch(() => false))) await menu.click().catch(() => {});
  await page.waitForFunction(n => [...document.querySelectorAll("button.eb-nav-link")].some(b => /^المشاريع/.test(b.textContent || "") && (b.textContent || "").includes(String(n))), waiting, { timeout: 15000 })
    .then(() => pass("badge " + at, "the «المشاريع» badge shows " + waiting + " (the server's count)"), () => fail("badge " + at, "the badge does not show " + waiting));
  await nav.click({ timeout: 15000 });
  await page.getByText(waiting + " حدّدها الطلاب بانتظار تأكيدك").waitFor({ timeout: 15000 })
    .then(() => pass("hub " + at, "the card shows «" + waiting + " حدّدها الطلاب بانتظار تأكيدك»"), () => fail("hub " + at, "the hub card does not show the count"));
  const open = page.getByRole("button", { name: "فتح المشروع" });
  const cards = await open.count();
  for (let i = 0; i < cards; i++) {
    const card = open.nth(i).locator("xpath=ancestor::*[self::article or self::li][1]");
    if ((await card.textContent()).includes(CODE)) { await open.nth(i).click(); break; }
  }
  await page.getByRole("group", { name: "أقسام المشروع" }).waitFor({ timeout: 20000 });
  await page.getByRole("heading", { level: 2, name: "لوحة المشروع" }).waitFor({ timeout: 20000 });
  // 2. class selector, tab count, dashboard shortcut
  const optionText = await page.evaluate(() => document.querySelector(".eb-project-class-field select option:checked")?.textContent || "");
  check("workspace " + at, optionText.includes(waiting + " حدّدها الطلاب"), "class option «" + optionText + "»");
  const tab = await page.getByRole("group", { name: "أقسام المشروع" }).getByRole("button", { name: /التقييم الجماعي/ }).textContent();
  check("workspace " + at, (tab || "").includes(String(waiting)), "«التقييم الجماعي» carries " + waiting + " («" + (tab || "").trim() + "»)");
  await page.screenshot({ path: path.join(out, "dashboard-" + vp.width + ".png"), fullPage: false });
  await axe(page, "dashboard " + at);
  await page.getByRole("button", { name: "تأكيد ما حدّده الطلاب (" + waiting + ")" }).click();
  const list = page.getByRole("list", { name: "مراحل حدّدها الطلاب" });
  await list.waitFor({ timeout: 15000 });
  const pressed = await page.getByRole("button", { name: /^حدّدها الطلاب \(/ }).getAttribute("aria-pressed");
  check("bulk " + at, pressed === "true", "the shortcut opened «حدّدها الطلاب»");
  const groupCount = await list.locator(".eb-review-group").count();
  const markedStudents = (await call("GET", "/api/project-tracker?projectCode=" + CODE + "&classId=" + classId + "&resource=students")).json.students.filter(c => c.selfReportedCount > 0).length;
  check("bulk " + at, groupCount === markedStudents, "grouped by student: " + groupCount + " groups for " + markedStudents + " students with marks");
  // 3. layout
  const m = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    heads: [...document.querySelectorAll(".eb-review-group-head .eb-button")].filter(n => n.offsetParent).map(n => Math.round(n.getBoundingClientRect().height))
  }));
  const min = vp.touch ? 44 : 34;
  check("layout " + at, m.overflow <= 0, m.overflow > 0 ? "the page scrolls sideways by " + m.overflow + " px" : "no horizontal page overflow");
  check("layout " + at, m.heads.length > 0 && Math.min(...m.heads) >= min, "group buttons ≥ " + min + " px (" + Math.min(...m.heads) + ")");
  await page.screenshot({ path: path.join(out, "grouped-" + vp.width + ".png"), fullPage: false });
  await axe(page, "grouped list " + at);
  // 4. confirm the first group
  const first = list.locator(".eb-review-group").first();
  const btn = first.locator(".eb-review-group-head .eb-button");
  const name = (await btn.textContent()) || "";
  const n = Number((name.match(/\((\d+)\)\s*$/) || [])[1] || 0);
  const sent = posts.length;
  await btn.click();
  await page.getByText("تم تأكيد " + n + ".").waitFor({ timeout: 15000 });
  const reqs = posts.slice(sent);
  const sid = reqs[0] && reqs[0].items ? reqs[0].items[0].studentId : "";
  check("confirm " + at, reqs.length === 1 && reqs[0].action === "progress.bulk" && reqs[0].items.length === n && reqs[0].items.every(x => x.studentId === sid), "ONE progress.bulk with that student's " + n + " stages");
  check("confirm " + at, reqs[0] && reqs[0].items.every(x => entry(x.studentId, x.stageId) && entry(x.studentId, x.stageId).approvedBy && !entry(x.studentId, x.stageId).selfReportedAt), "confirmed in storage (teacher approval, no self-report stamp)");
  const after = (await attention()).totalSelfReported;
  await page.waitForFunction(v => [...document.querySelectorAll("button.eb-nav-link")].some(b => /^المشاريع/.test(b.textContent || "") && (b.textContent || "").includes(String(v))), after, { timeout: 15000 })
    .then(() => pass("confirm " + at, "the badge follows the server (" + waiting + " → " + after + ")"), () => fail("confirm " + at, "the badge did not update to " + after));
  record.screens.push({ width: vp.width, waiting, after, measures: m });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? "P6 GATE FAILED: " + record.failures.length + " check(s)" : "P6 gate passed") + " — record: " + path.join(out, "record.json"));
process.exit(record.failures.length ? 1 : 0);
