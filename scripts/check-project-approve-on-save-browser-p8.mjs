#!/usr/bin/env node
// Phase P8 — «اعتماد المرحلة عند حفظ العلامة» in the teacher's student profile, in a REAL Chromium on the production build
// (certification only; nothing is deployed). The build in DIST (default ./dist) is served next to the REAL API, in process
// (browser-harness/learning-l8-api.cjs: every Azure Functions handler on the in-memory storage of the API tests, real signed
// sessions). One teacher; one class of 4 students enrolled in project 899373.
//
// At 390 px (touch) and 1024 and 1440 px, in «المشاريع» → the project → «تقدّم الطلاب» → a student's profile:
//   1. the switch «اعتماد المرحلة عند حفظ العلامة» is visible and ON (a fresh device), its target ≥ 44 px on touch;
//   2. (Phase G2 — the stage table) typing a score shows the row as «منجز» and «حفظ التغييرات» stores the score AND the
//      approval: ONE score.bulk then ONE progress.bulk (checked in storage);
//   3. the switch turned off is remembered when the profile is opened again; a save is then score.bulk only and the status
//      stays as it was (checked in storage);
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
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-p8"), label);
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
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
  });
  const blocking = result.filter(v => v.impact === "serious" || v.impact === "critical");
  check(where, blocking.length === 0, blocking.length ? "axe: " + blocking.map(v => v.id + " ×" + v.nodes + " (" + v.targets.join(", ") + ")").join("; ") : "axe: no serious / critical violation" + (result.length ? " (" + result.map(v => v.id + ":" + v.impact).join(", ") + ")" : ""));
  return result;
}

const entry = (sid, stageId) => { const d = api.mem.getJson(NS.progressName(classId, sid)); return d && d.stages ? d.stages[stageId] : undefined; };
const VIEWPORTS = [{ width: 390, height: 844, touch: true }, { width: 1024, height: 768, touch: false }, { width: 1440, height: 900, touch: false }];
let round = 0;
// Each viewport grades its OWN student (storage is shared by the three runs): the student card with that name.
async function openProfile(page, name) {
  await page.getByRole("group", { name: "أقسام المشروع" }).getByRole("button", { name: /تقدّم الطلاب/ }).click();
  await page.locator("li", { hasText: name }).getByRole("button", { name: "فتح ملف الطالب" }).click();
  await page.waitForFunction(() => /ملف المشروع: /.test(document.querySelector("#eb-student-profile-title")?.textContent || ""), null, { timeout: 15000 });
  await page.locator("input[data-stage-score]").first().waitFor({ timeout: 15000 });
  const heading = (await page.locator("#eb-student-profile-title").textContent()) || "";
  return studentIds[nameIndex(heading.replace("ملف المشروع: ", "").trim())];
}
for (const vp of VIEWPORTS) {
  const at = "@" + vp.width;
  round++;
  console.log("«اعتماد المرحلة عند حفظ العلامة» " + at);
  const { ctx, page } = await openWorkspace(vp);
  const name = names[round - 1];
  const sid = await openProfile(page, name);
  const toggle = page.getByRole("switch", { name: "اعتماد المرحلة عند حفظ العلامة" });
  // 1. visible, ON, a big enough target
  check("switch " + at, (await toggle.isVisible()) && (await toggle.isChecked()), "visible and ON by default");
  const h = await page.locator(".eb-stage-approve-toggle").evaluate(n => Math.round(n.getBoundingClientRect().height));
  check("switch " + at, h >= (vp.touch ? 44 : 24), "its label is " + h + " px tall (≥ " + (vp.touch ? 44 : 24) + ")");
  // 2. save + approve in one request
  const rows = page.locator("[data-stage-id]:has(input[data-stage-score])");
  const stageA = await rows.nth(0).getAttribute("data-stage-id"), stageB = await rows.nth(1).getAttribute("data-stage-id");
  const scoreA = String(60 + round);
  const saveBar = page.getByRole("region", { name: "حفظ تغييرات الطالب" });
  await rows.nth(0).locator("input[data-stage-score]").fill(scoreA);
  check("save " + at, (await rows.nth(0).getByRole("button", { name: stageA + ": منجز" }).getAttribute("aria-pressed")) === "true", "the typed score shows the row as «منجز»");
  let before = posts.length;
  await saveBar.getByRole("button", { name: "حفظ التغييرات (1)" }).click();
  await page.getByText("حُفظت 1 علامة، اعتُمدت 1 مرحلة.").waitFor({ timeout: 15000 });
  const sent = posts.slice(before);
  check("save " + at, sent.length === 2 && sent[0].action === "score.bulk" && sent[0].items?.length === 1 && String(sent[0].items[0].score) === scoreA && sent[1].action === "progress.bulk" && sent[1].status === "approved" && sent[1].items?.length === 1 && sent[1].items[0].stageId === stageA, "ONE score.bulk with the score, then ONE progress.bulk with the approval (" + JSON.stringify(sent.map(p => [p.action, p.status, (p.items || []).map(i => [i.stageId, i.score])])) + ")");
  check("save " + at, entry(sid, stageA)?.status === "approved" && entry(sid, stageA)?.score === Number(scoreA), "stored: " + stageA + " approved with " + scoreA);
  await page.screenshot({ path: path.join(out, "profile-on-" + vp.width + ".png"), fullPage: false });
  // 3. switch off, remembered, score only
  await toggle.click();
  check("off " + at, !(await toggle.isChecked()), "the switch turns off");
  await page.getByRole("button", { name: "عودة إلى تقدّم الطلاب" }).click();
  await page.locator("li", { hasText: name }).getByRole("button", { name: "فتح ملف الطالب" }).click();
  await page.locator("input[data-stage-score]").first().waitFor({ timeout: 15000 });
  const toggle2 = page.getByRole("switch", { name: "اعتماد المرحلة عند حفظ العلامة" });
  check("off " + at, !(await toggle2.isChecked()), "the choice is remembered when the profile opens again");
  const statusB = entry(sid, stageB)?.status ?? "not_started";
  const rowB = page.locator('[data-stage-id="' + stageB + '"]');
  await rowB.locator("input[data-stage-score]").fill("55");
  check("off " + at, (await rowB.getByRole("button", { name: stageB + ": منجز" }).getAttribute("aria-pressed")) === "false", "the typed score does not show the row as «منجز»");
  before = posts.length;
  await page.getByRole("region", { name: "حفظ تغييرات الطالب" }).getByRole("button", { name: "حفظ التغييرات (1)" }).click();
  await page.getByText("حُفظت 1 علامة.", { exact: true }).waitFor({ timeout: 15000 });
  const sent2 = posts.slice(before);
  check("off " + at, sent2.length === 1 && sent2[0].action === "score.bulk" && sent2[0].items?.length === 1 && sent2[0].items[0].score === 55, "ONE score.bulk, no status write (" + JSON.stringify(sent2.map(p => p.action)) + ")");
  check("off " + at, entry(sid, stageB)?.score === 55 && (entry(sid, stageB)?.status ?? "not_started") === statusB, "stored: " + stageB + " scored 55, status unchanged (" + statusB + ")");
  // 4. layout and accessibility
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("page " + at, overflow <= 0, overflow > 0 ? "the page scrolls sideways by " + overflow + " px" : "no horizontal page overflow");
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  const violations = await axe(page, "profile " + at);
  record.screens.push({ width: vp.width, switchHeight: h, violations });
  await page.screenshot({ path: path.join(out, "profile-off-" + vp.width + ".png"), fullPage: false });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? "P8 GATE FAILED: " + record.failures.length + " check(s)" : "P8 gate passed") + " — record: " + path.join(out, "record.json"));
process.exit(record.failures.length ? 1 : 0);
