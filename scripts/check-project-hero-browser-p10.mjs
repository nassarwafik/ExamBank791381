#!/usr/bin/env node
// Phase P10 — the project card header (ProjectRankHero) never squeezes its title, in a REAL Chromium on the production build
// (certification only; nothing is deployed). The build in DIST (default ./dist) is served next to the REAL API, in process
// (browser-harness/learning-l8-api.cjs). One teacher; one class of 4 students enrolled in project 899373, one stage approved
// with a score for each student (so the card shows a grade, a rank and a strength).
//
// The defect: the header switched to one row from a 768 px VIEWPORT, but in the student portal the projects card sits in a
// narrow column even on a wide screen — the title column shrank to a few pixels («مشروع 899373» one letter per line) and the
// texts overlapped the grade circle. The header now becomes a row only when ITS OWN width allows it (a container query).
//
// Checks, for the student portal («مشاريعي») at 390 (touch) / 1024 / 1440 px and the teacher's student profile at 1440 px:
//   1. the title is at least 6 em wide and at most two lines tall (never one letter per line);
//   2. the rank text, the grade circle and the facts never overlap, and none of them leaves the header;
//   3. on a header narrower than 560 px the parts are stacked; the wide teacher profile header keeps its single row;
//   4. the page never scrolls sideways; axe-core (WCAG 2.1 A/AA): no serious or critical violation.
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
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-p10"), label);
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
// Phase P7: the condensed first group holds one stage, so the gate grades the first group of the first track with two
// stages or more (chosen in the grid's group menu).
const stagesOfGroup = g => DEF.stages.filter(s => s.groupId === g.groupId && s.active === true).sort((a, b) => a.order - b.order).map(s => s.stageId);
const firstGroup = DEF.groups.filter(g => g.track === DEF.tracks[0].trackId).sort((a, b) => a.order - b.order).find(g => stagesOfGroup(g).length >= 2);
const G1 = stagesOfGroup(firstGroup);
const teacherToken = api.teacherToken();
const call = async (method, url, body) => {
  const r = await api.handle(method, url, { authorization: "Bearer " + teacherToken, "x-builder-token": teacherToken }, body ? JSON.stringify(body) : "");
  return { status: r.status, json: r.body ? JSON.parse(r.body) : null };
};
let classId = "";
const studentIds = [], names = [];
const nameIndex = name => names.indexOf(name);
{
  const c = await call("POST", "/api/classrooms", { action: "create", name: "الحادي عشر 7", grade: "الحادي عشر", schoolYear: "2026-2027" });
  if (c.status !== 200) throw new Error("seed class: " + JSON.stringify(c.json));
  classId = c.json.classroom.classId;
  for (let i = 0; i < 4; i++) {
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
const score = (sid, stageId) => { const d = api.mem.getJson(NS.progressName(classId, sid)); return d && d.stages && d.stages[stageId] ? d.stages[stageId].score : undefined; };

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
  await page.evaluate(axeSource + "\n;0");   // D2: evaluated, not an inline <script> — the production CSP stays in force
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
  });
  const blocking = result.filter(v => v.impact === "serious" || v.impact === "critical");
  check(where, blocking.length === 0, blocking.length ? "axe: " + blocking.map(v => v.id + " ×" + v.nodes + " (" + v.targets.join(", ") + ")").join("; ") : "axe: no serious / critical violation" + (result.length ? " (" + result.map(v => v.id + ":" + v.impact).join(", ") + ")" : ""));
  return result;
}

// One approved, scored stage per student, through the real API (the class converts to its current set on that write).
for (const sid of studentIds) {
  const r = await call("POST", "/api/project-tracker", { projectCode: CODE, action: "progress.update", classId, studentId: sid, stageId: "BK01", status: "approved", score: 85 });
  if (r.status !== 200) throw new Error("seed progress: " + JSON.stringify(r.json));
}
async function measureHero(page) {
  return page.evaluate(() => {
    const hero = document.querySelector(".eb-prh");
    if (!hero) return null;
    const r = el => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    const title = hero.querySelector(".eb-prh-title"), text = hero.querySelector(".eb-prh-text"), circle = hero.querySelector(".eb-ppc"), facts = hero.querySelector(".eb-prh-facts");
    const lh = parseFloat(getComputedStyle(title).lineHeight) || parseFloat(getComputedStyle(title).fontSize) * 1.4;
    const em = parseFloat(getComputedStyle(title).fontSize);
    const parts = { text: r(text), circle: r(circle), facts: r(facts) };
    const overlap = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
    const box = r(hero);
    return {
      heroWidth: Math.round(box.w), direction: getComputedStyle(hero).flexDirection,
      titleWidth: Math.round(r(title).w), titleLines: Math.round(r(title).h / lh), minTitleWidth: Math.round(6 * em),
      overlaps: [["text", "circle"], ["text", "facts"], ["circle", "facts"]].filter(([a, b]) => overlap(parts[a], parts[b])).map(p => p.join("×")),
      outside: Object.entries(parts).filter(([, p]) => p.l < box.l - 1 || p.r > box.r + 1 || p.t < box.t - 1 || p.b > box.b + 1).map(([k]) => k),
      pageOverflow: document.documentElement.scrollWidth - innerWidth
    };
  });
}
function checkHero(where, m) {
  if (!m) return fail(where, "no project header found");
  check(where, m.titleWidth >= m.minTitleWidth && m.titleLines <= 2, "the title is " + m.titleWidth + " px wide (≥ " + m.minTitleWidth + ") on " + m.titleLines + " line(s) (≤ 2)");
  check(where, m.overlaps.length === 0, m.overlaps.length ? "overlapping parts: " + m.overlaps.join(", ") : "the rank text, the grade circle and the facts never overlap");
  check(where, m.outside.length === 0, m.outside.length ? "parts outside the header: " + m.outside.join(", ") : "every part stays inside the header");
  check(where, m.pageOverflow <= 0, m.pageOverflow > 0 ? "the page scrolls sideways by " + m.pageOverflow + " px" : "no horizontal page overflow");
}
const VIEWPORTS = [{ width: 390, height: 844, touch: true }, { width: 1024, height: 768, touch: false }, { width: 1440, height: 900, touch: false }];
const firstStudent = api.mem.getJson("platform/users/" + studentIds[0] + ".json");
for (const vp of VIEWPORTS) {
  const at = "@" + vp.width;
  console.log("student portal «مشاريعي» " + at);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(([t, n]) => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "student"); sessionStorage.setItem("examBankSessionDisplayName", n); }, [api.studentToken(firstStudent), firstStudent.displayName || "طالب"]);
  const page = await ctx.newPage();
  page.on("pageerror", e => fail("page error " + at, e.message));
  await page.goto(origin + "/");
  await page.locator(".eb-prh").first().waitFor({ timeout: 20000 });
  await page.locator(".eb-prh").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const m = await measureHero(page);
  checkHero("portal " + at, m);
  if (m && m.heroWidth < 560) check("portal " + at, m.direction === "column", "a " + m.heroWidth + " px header stacks its parts (" + m.direction + ")");
  await page.locator(".eb-prh").first().screenshot({ path: path.join(out, "portal-hero-" + vp.width + ".png") });
  const violations = await axe(page, "portal " + at);
  record.screens.push({ where: "portal", width: vp.width, hero: m, violations });
  await ctx.close();
}
{
  const vp = VIEWPORTS[2], at = "@" + vp.width;
  console.log("teacher student profile " + at);
  const { ctx, page } = await openWorkspace(vp);
  await page.getByRole("group", { name: "أقسام المشروع" }).getByRole("button", { name: /تقدّم الطلاب/ }).click();
  await page.getByRole("button", { name: "فتح ملف الطالب" }).first().click();
  await page.locator(".eb-prh").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  const m = await measureHero(page);
  checkHero("profile " + at, m);
  check("profile " + at, m && m.heroWidth >= 560 && m.direction === "row", "the wide profile header (" + (m && m.heroWidth) + " px) keeps its single row (" + (m && m.direction) + ")");
  await page.locator(".eb-prh").first().screenshot({ path: path.join(out, "profile-hero-" + vp.width + ".png") });
  const violations = await axe(page, "profile " + at);
  record.screens.push({ where: "profile", width: vp.width, hero: m, violations });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? "P10 GATE FAILED: " + record.failures.length + " check(s)" : "P10 gate passed") + " — record: " + path.join(out, "record.json"));
process.exit(record.failures.length ? 1 : 0);
