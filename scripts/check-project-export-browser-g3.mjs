#!/usr/bin/env node
// Phase G3 — the export and the history in a REAL Chromium on the production build (certification only; nothing is deployed).
// Same harness as the G1 gate: the build in DIST next to the REAL API in process, one teacher, one class of 24 students
// enrolled in project 899373, three of them graded through the API (one with a teacher note). At 390 px (touch) and 1440 px:
//   1. «التقييم الجماعي» → «جدول العلامات» → «تصدير إلى Excel» downloads ONE .xlsx file: a ZIP whose worksheet is right-to-left,
//      names the project and the class, lists every student once, holds the saved scores as numbers, carries no teacher note,
//      no full student code and no formula;
//   2. «تقدّم الطلاب» → a graded student's profile → the row menu «سجلّ التغييرات» opens a dialog listing that stage's changes,
//      newest first, with who made each («أنت»);
//   3. axe-core (WCAG 2.1 A/AA): no serious or critical violation on the matrix and on the open dialog; no sideways scroll.
// Tools: PLAYWRIGHT_CORE_DIR / AXE_CORE_DIR name directories whose node_modules hold playwright-core / axe-core; CHROMIUM_PATH
// the browser. Output: HARNESS_OUT/<LABEL>/record.json (+ the downloaded files and screenshots). Exit 1 when a check fails,
// 2 when a tool is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "head";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-g3"), label);
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
const { getProjectDefinition } = require(path.join(root, "api/src/lib/project-tracker/registry.js"));
const DEF = getProjectDefinition(CODE);
const teacherToken = api.teacherToken();
const call = async (method, url, body) => {
  const r = await api.handle(method, url, { authorization: "Bearer " + teacherToken, "x-builder-token": teacherToken }, body ? JSON.stringify(body) : "");
  return { status: r.status, json: r.body ? JSON.parse(r.body) : null };
};
let classId = "";
const studentIds = [], names = [];
{
  const c = await call("POST", "/api/classrooms", { action: "create", name: "الحادي عشر 7", grade: "الحادي عشر", schoolYear: "2026-2027" });
  if (c.status !== 200) throw new Error("seed class: " + JSON.stringify(c.json));
  classId = c.json.classroom.classId;
  for (let i = 0; i < 24; i++) {
    const s = await call("POST", "/api/students", { action: "create", classId, firstName: "طالب" + (i + 1), familyName: "العائلة" + (i + 1), identityNumber: String(313000000 + i) });
    if (s.status !== 200) throw new Error("seed student: " + JSON.stringify(s.json));
    studentIds.push(s.json.student.userId);
    names.push("طالب" + (i + 1) + " العائلة" + (i + 1));
  }
  const p = await call("POST", "/api/classrooms", { action: "setPrograms", classId, programCodes: [CODE] });
  if (p.status !== 200) throw new Error("seed project: " + JSON.stringify(p.json));
}

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
// A UTF-8 locale for the browser process: without one (an empty LANG, as on some runners) Chromium cannot store a non-ASCII
// download name and falls back to «download» — a property of the machine, not of the page.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"], env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } });

const record = { label, dist, screens: [], failures: [] };
const fail = (where, what) => { record.failures.push(where + ": " + what); console.log("  ✗ " + where + ": " + what); };
const pass = (where, what) => console.log("  ✓ " + where + ": " + what);
const check = (where, ok, what) => (ok ? pass(where, what) : fail(where, what));

async function openWorkspace(vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(t => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم"); }, teacherToken);
  const page = await ctx.newPage();
  page.on("pageerror", e => fail("page error @" + vp.width, e.message));
  await page.goto(origin + "/");
  const nav = page.getByRole("button", { name: "المشاريع", exact: true }).first();
  await page.getByRole("button", { name: /القائمة/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
  if (!(await nav.isVisible().catch(() => false))) await page.getByRole("button", { name: /القائمة/ }).first().click().catch(() => {});
  await nav.click({ timeout: 15000 });
  const open = page.getByRole("button", { name: "فتح المشروع" });
  await open.first().waitFor({ timeout: 20000 });
  const cards = await open.count();
  for (let i = 0; i < cards; i++) {                                         // the card of project 899373
    const card = open.nth(i).locator("xpath=ancestor::*[self::article or self::li][1]");
    if ((await card.textContent()).includes(CODE)) { await open.nth(i).click(); break; }
    if (i === cards - 1) await open.first().click();
  }
  await page.getByRole("group", { name: "أقسام المشروع" }).waitFor({ timeout: 20000 });
  return { ctx, page };
}

async function axe(page, where) {
  // axe measures the settled screen: a dialog fades in (ebFadeIn), and a frame taken mid-fade reads its muted text at a partial
  // opacity. Every finite animation is let finish first; an endless one (a skeleton) never blocks.
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
  await page.evaluate(axeSource + "\n;0");   // D2: evaluated, not an inline <script> — the production CSP stays in force
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
  });
  const blocking = result.filter(v => v.impact === "serious" || v.impact === "critical");
  check(where, blocking.length === 0, blocking.length ? "axe: " + blocking.map(v => v.id + " ×" + v.nodes + " (" + v.targets.join(", ") + ")").join("; ") : "axe: no serious / critical violation" + (result.length ? " (" + result.map(v => v.id + ":" + v.impact).join(", ") + ")" : ""));
  return result;
}

// ── three graded students (scores through score.bulk, one approval and one note through progress.update) ──────────────────────
const FIRST = DEF.stages.filter(s => s.track === DEF.tracks[0].trackId && s.active === true).sort((a, b) => a.order - b.order).map(s => s.stageId);
const [S1, S2] = FIRST;
const NOTE = "ملاحظة المعلم الخاصة G3";
{
  const items = [{ studentId: studentIds[0], stageId: S1, score: 91, expected: null }, { studentId: studentIds[1], stageId: S1, score: 0, expected: null }, { studentId: studentIds[2], stageId: S2, score: 66.5, expected: null }];
  const r = await call("POST", "/api/project-tracker", { projectCode: CODE, action: "score.bulk", classId, items });
  if (r.status !== 200) throw new Error("seed scores: " + JSON.stringify(r.json));
  const u = await call("POST", "/api/project-tracker", { projectCode: CODE, action: "progress.update", classId, studentId: studentIds[0], stageId: S1, status: "approved", note: NOTE });
  if (u.status !== 200) throw new Error("seed approval: " + JSON.stringify(u.json));
  const again = await call("POST", "/api/project-tracker", { projectCode: CODE, action: "score.set", classId, studentId: studentIds[0], stageId: S1, score: "93" });
  if (again.status !== 200) throw new Error("seed rescore: " + JSON.stringify(again.json));
}
const codes = [];
for (const sid of studentIds) { const u = api.mem.getJson("platform/users/" + sid + ".json"); codes.push(String(u && u.code || "")); }

/** The entries of a STORED zip (the shared xlsx writer never compresses): name → UTF-8 text. */
function unzipStored(buf) {
  const files = {};
  let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8), size = buf.readUInt32LE(i + 18), nameLen = buf.readUInt16LE(i + 26), extra = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString("utf8");
    const start = i + 30 + nameLen + extra;
    files[name] = method === 0 ? buf.slice(start, start + size).toString("utf8") : null;
    i = start + size;
  }
  return files;
}

for (const vp of [{ width: 390, height: 844, touch: true }, { width: 1440, height: 900, touch: false }]) {
  const at = "@" + vp.width;
  console.log("التصدير والسجلّ " + at);
  const { ctx, page } = await openWorkspace(vp);
  // 1. the export
  await page.getByRole("group", { name: "أقسام المشروع" }).getByRole("button", { name: /التقييم الجماعي/ }).click();
  await page.getByRole("button", { name: "جدول العلامات" }).click();
  await page.locator(".eb-score-grid-table").waitFor({ timeout: 20000 });
  const exportBtn = page.getByRole("button", { name: "تصدير إلى Excel" });
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), exportBtn.click()]);
  const file = path.join(out, "export-" + vp.width + ".xlsx");
  await download.saveAs(file);
  check("export " + at, /^TadrisPlus-علامات-المشروع-.+\.xlsx$/.test(download.suggestedFilename()), "the file is named «" + download.suggestedFilename() + "»");
  const parts = unzipStored(fs.readFileSync(file));
  const sheet = parts["xl/worksheets/sheet1.xml"] || "";
  check("export " + at, !!sheet && parts["[Content_Types].xml"] !== undefined, "an .xlsx workbook (" + Object.keys(parts).length + " parts, stored)");
  check("export " + at, sheet.includes('rightToLeft="1"'), "the worksheet is right-to-left");
  check("export " + at, sheet.includes(DEF.title) && sheet.includes("الحادي عشر 7"), "it names the project and the class");
  const missing = names.filter(n => sheet.split(">" + n + "<").length !== 2);
  check("export " + at, missing.length === 0, missing.length ? "students missing or repeated: " + missing.join("، ") : "all 24 students, once each");
  check("export " + at, ["<v>93</v>", "<v>0</v>", "<v>66.5</v>"].every(v => sheet.includes(v)), "the saved scores are numbers (93, 0, 66.5)");
  check("export " + at, !sheet.includes(NOTE), "no teacher note in the file");
  check("export " + at, !codes.some(c => c && sheet.includes(c)), "no full student code in the file");
  check("export " + at, !/<f[ >]/.test(sheet), "no formula in the file");
  const notice = (await page.getByText(/صُدّرت علامات 24 طالب/).textContent()) || "";
  check("export " + at, notice.includes("في كل المسارات"), "the notice says what was exported");
  const overflow1 = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("export " + at, overflow1 <= 0, overflow1 > 0 ? "the page scrolls sideways by " + overflow1 + " px" : "no horizontal page overflow");
  const v1 = await axe(page, "matrix " + at);
  await page.screenshot({ path: path.join(out, "matrix-" + vp.width + ".png"), fullPage: false });
  // 2. the history of the first student's first stage
  await page.getByRole("group", { name: "أقسام المشروع" }).getByRole("button", { name: /تقدّم الطلاب/ }).click();
  await page.locator("li", { hasText: names[0] }).getByRole("button", { name: "فتح ملف الطالب" }).click();
  await page.locator('[data-stage-id="' + S1 + '"] input[data-stage-score]').waitFor({ timeout: 15000 });
  // The menu closes on a page scroll (ActionMenu A-F2), so the row is brought into view and the page left to settle first, as a
  // teacher's tap on a visible row would find it.
  const trigger = page.locator('[data-stage-id="' + S1 + '"]').getByRole("button", { name: "إجراءات المرحلة " + S1 });
  await trigger.evaluate(n => n.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(400);
  await trigger.click();
  await page.locator(".eb-menu-panel[data-ready='true']").getByRole("button", { name: "سجلّ التغييرات" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator(".eb-stage-history-list li").first().waitFor({ timeout: 15000 });
  const lines = await dialog.locator(".eb-stage-history-list li .eb-timeline-text").allTextContents();
  const who = await dialog.locator(".eb-stage-history-list li .eb-stage-history-by").allTextContents();
  check("history " + at, lines[0] === "تغيّرت العلامة من 91 / 100 إلى 93 / 100", "the newest change comes first («" + (lines[0] || "") + "»)");
  check("history " + at, lines.includes("وُضعت العلامة 91 / 100") && lines.includes("عُدّلت ملاحظة المعلم") && lines.some(l => l.startsWith("الحالة: من «")), "every change of the stage is listed (" + lines.length + ")");
  check("history " + at, who.length === lines.length && who.every(w => w === "أنت"), "who made each change: «أنت»");
  check("history " + at, !(await dialog.textContent()).includes(NOTE), "the note's text is not in the history");
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("history " + at, overflow2 <= 0, overflow2 > 0 ? "the page scrolls sideways by " + overflow2 + " px" : "no horizontal page overflow");
  const v2 = await axe(page, "history dialog " + at);
  await page.screenshot({ path: path.join(out, "history-" + vp.width + ".png"), fullPage: false });
  record.screens.push({ width: vp.width, violations: { matrix: v1, history: v2 } });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? "G3 GATE FAILED: " + record.failures.length + " check(s)" : "G3 gate passed") + " — record: " + path.join(out, "record.json"));
process.exit(record.failures.length ? 1 : 0);
