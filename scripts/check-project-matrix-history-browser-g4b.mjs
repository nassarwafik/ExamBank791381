#!/usr/bin/env node
// Phase G4b — a cell's «سجلّ التغييرات» from the class matrix, in a REAL Chromium on the production build (certification only;
// nothing is deployed). Same harness as the G1 / G3 gates: the build in DIST next to the REAL API in process, one teacher, one
// class of 24 students enrolled in project 899373, three of them graded through the API (one with a teacher note). At 390 px
// (touch) and 1440 px:
//   1. «التقييم الجماعي» → «جدول العلامات»: «سجلّ الخلية» is disabled until a cell is chosen; tapping / clicking a cell names it
//      on the button, which then opens THAT student's stage history (titled with the stage and the student), newest first,
//      with who made each change and without the note's text;
//   2. Shift+F10 in another student's cell opens that student's history (desktop); the button is a 44 px target on touch;
//   3. axe-core (WCAG 2.1 A/AA): no serious or critical violation on the matrix and on the open dialog; no sideways scroll.
// Tools: PLAYWRIGHT_CORE_DIR / AXE_CORE_DIR name directories whose node_modules hold playwright-core / axe-core; CHROMIUM_PATH
// the browser. Output: HARNESS_OUT/<LABEL>/record.json (+ screenshots). Exit 1 when a check fails, 2 when a tool is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "head";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-g4b"), label);
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
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });

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

async function openMatrix(vp) {
  const { ctx, page } = await openWorkspace(vp);
  await page.getByRole("group", { name: "أقسام المشروع" }).getByRole("button", { name: /التقييم الجماعي/ }).click();
  await page.getByRole("button", { name: "جدول العلامات" }).click();
  await page.locator(".eb-score-grid-table").waitFor({ timeout: 20000 });
  return { ctx, page };
}
async function historyLines(dialog) {
  await dialog.locator(".eb-stage-history-list li").first().waitFor({ timeout: 15000 });
  return { lines: await dialog.locator(".eb-stage-history-list li .eb-timeline-text").allTextContents(), who: await dialog.locator(".eb-stage-history-list li .eb-stage-history-by").allTextContents() };
}
const cellOf = (page, name, stageId) => page.getByRole("textbox", { name: new RegExp("^" + name + " — " + stageId + " ") });

for (const vp of [{ width: 390, height: 844, touch: true }, { width: 1440, height: 900, touch: false }]) {
  const at = "@" + vp.width;
  console.log("سجلّ الخلية " + at);
  const { ctx, page } = await openMatrix(vp);
  const button = page.locator(".eb-score-grid-history");
  check("button " + at, await button.isDisabled(), "«سجلّ الخلية» is disabled before a cell is chosen");
  const box = await button.boundingBox();
  if (vp.touch) check("button " + at, !!box && box.height >= 44, "a " + Math.round(box ? box.height : 0) + " px touch target (≥ 44)");
  // 1. choose the first student's first stage, then open its history from the controls
  const first = cellOf(page, names[0], S1);
  await first.scrollIntoViewIfNeeded();
  if (vp.touch) await first.tap(); else await first.click();
  const label = (await button.getAttribute("aria-label")) || "";
  check("button " + at, !(await button.isDisabled()) && label === "سجلّ تغييرات الخلية: " + names[0] + " — " + S1, "names the chosen cell («" + label + "»)");
  await button.scrollIntoViewIfNeeded();
  if (vp.touch) await button.tap(); else await button.click();
  let dialog = page.getByRole("dialog");
  const title = (await dialog.getByRole("heading").first().textContent()) || "";
  check("history " + at, title.startsWith("سجلّ تغييرات المرحلة " + S1 + " — ") && title.endsWith(" · " + names[0]), "titled with the stage and the student («" + title + "»)");
  let h = await historyLines(dialog);
  check("history " + at, h.lines[0] === "تغيّرت العلامة من 91 / 100 إلى 93 / 100", "the newest change comes first («" + (h.lines[0] || "") + "»)");
  check("history " + at, h.lines.includes("وُضعت العلامة 91 / 100") && h.lines.includes("عُدّلت ملاحظة المعلم"), "every change of that student's stage is listed (" + h.lines.length + ")");
  check("history " + at, h.who.length === h.lines.length && h.who.every(w => w === "أنت"), "who made each change: «أنت»");
  check("history " + at, !(await dialog.textContent()).includes(NOTE), "the note's text is not in the history");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("history " + at, overflow <= 0, overflow > 0 ? "the page scrolls sideways by " + overflow + " px" : "no horizontal page overflow");
  const v1 = await axe(page, "history dialog " + at);
  await page.screenshot({ path: path.join(out, "history-" + vp.width + ".png"), fullPage: false });
  await dialog.getByRole("button", { name: "إغلاق" }).click();
  await dialog.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  // 2. another student's cell from the keyboard (desktop)
  let v2 = null;
  if (!vp.touch) {
    const second = cellOf(page, names[1], S1);
    await second.focus();
    await page.keyboard.press("Shift+F10");
    dialog = page.getByRole("dialog");
    h = await historyLines(dialog);
    const title2 = (await dialog.getByRole("heading").first().textContent()) || "";
    check("keyboard " + at, title2.endsWith(" · " + names[1]) && h.lines.length === 1 && h.lines[0] === "وُضعت العلامة 0 / 100", "Shift+F10 opens " + names[1] + "'s history (" + h.lines.join(" | ") + ")");
    await dialog.getByRole("button", { name: "إغلاق" }).click();
    await dialog.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-label"));
    check("keyboard " + at, !!focused && focused.startsWith(names[1] + " — " + S1 + " "), "closing returns the focus to the cell");
  }
  v2 = await axe(page, "matrix " + at);
  record.screens.push({ width: vp.width, violations: { history: v1, matrix: v2 } });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? "G4b GATE FAILED: " + record.failures.length + " check(s)" : "G4b gate passed") + " — record: " + path.join(out, "record.json"));
process.exit(record.failures.length ? 1 : 0);
