#!/usr/bin/env node
// Phase P4 — «جدول العلامات» and «الطالب السابق / التالي» in a REAL Chromium on the production build (certification only;
// nothing is deployed). The build in DIST (default ./dist) is served next to the REAL API, in process
// (browser-harness/learning-l8-api.cjs: every Azure Functions handler on the in-memory storage of the API tests, real signed
// sessions; the class and student routes are bound to the same storage). One teacher; one class of 24 students enrolled in
// project 899373.
//
// At 390 px (touch) and 1024 and 1440 px, in «المشاريع» → the project → «التقييم الجماعي» → «جدول العلامات»:
//   1. the grid shows 24 student rows; the student column and the header row stay in view while the grid scrolls (sticky);
//      the page itself never scrolls sideways (only the grid's own region does);
//   2. a score cell is at least 36 px tall (44 px at 390 px is not required: the cell is a text field inside a scrolling grid);
//   3. typing then Enter moves the focus to the next student's cell in the same stage; ← moves to the next stage (RTL);
//   4. a pasted 3 × 2 block (a real ClipboardEvent with text/plain) fills three students × two stages from the focused cell;
//   5. «حفظ العلامات» stores every typed / pasted score in ONE score.bulk request (checked in storage) and leaves no pending change;
//   6. axe-core (WCAG 2.1 A/AA): no serious or critical violation;
//   7. a student profile shows «1 من 24» and «الطالب التالي» opens the next student of the list.
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
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-p4"), label);
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

const cellSel = (r, c) => '.eb-score-grid-table input[data-r="' + r + '"][data-c="' + c + '"]';
const VIEWPORTS = [{ width: 390, height: 844, touch: true }, { width: 1024, height: 768, touch: false }, { width: 1440, height: 900, touch: false }];
let round = 0;
for (const vp of VIEWPORTS) {
  const at = "@" + vp.width;
  round++;
  console.log("«جدول العلامات» " + at);
  const { ctx, page } = await openWorkspace(vp);
  await page.getByRole("group", { name: "أقسام المشروع" }).getByRole("button", { name: /التقييم الجماعي/ }).click();
  await page.getByRole("button", { name: "جدول العلامات" }).click();
  await page.locator(cellSel(0, 0)).waitFor({ timeout: 20000 });
  await page.getByRole("combobox", { name: /المجموعة/ }).selectOption(firstGroup.groupId);
  await page.locator('.eb-score-grid-table input[aria-label*="— ' + G1[1] + ' "]').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  // 1–2. structure
  const m = await page.evaluate(() => {
    const scroll = document.querySelector(".eb-score-grid-scroll"), table = document.querySelector(".eb-score-grid-table");
    const input = document.querySelector('.eb-score-grid-table input[data-r="0"][data-c="0"]');
    return {
      rows: table.querySelectorAll("tbody tr").length, cellHeight: input.getBoundingClientRect().height,
      scrollW: scroll.scrollWidth, clientW: scroll.clientWidth, overflow: document.documentElement.scrollWidth - innerWidth,
      stickyHead: getComputedStyle(table.querySelector("thead th")).position, stickyName: getComputedStyle(table.querySelector("tbody th")).position
    };
  });
  await page.screenshot({ path: path.join(out, "grid-" + vp.width + ".png"), fullPage: false });
  check("grid " + at, m.rows === 24, "24 student rows (" + m.rows + ")");
  check("grid " + at, m.stickyHead === "sticky" && m.stickyName === "sticky", "the header row and the student column are sticky (" + m.stickyHead + " / " + m.stickyName + ")");
  check("grid " + at, m.cellHeight >= 36, "a score cell is " + Math.round(m.cellHeight) + " px tall (≥ 36)");
  check("page " + at, m.overflow <= 0, m.overflow > 0 ? "the page scrolls sideways by " + m.overflow + " px" : "no horizontal page overflow (the grid scrolls in its own region: " + m.scrollW + "/" + m.clientW + ")");
  if (vp.width < 768) {
    // the sticky student column stays in view after the grid scrolls towards the later stages
    const stays = await page.evaluate(() => {
      const scroll = document.querySelector(".eb-score-grid-scroll");
      scroll.scrollLeft = -10000; scroll.scrollLeft = 10000;                    // RTL scroll sign differs by engine: try both ends
      const name = document.querySelector(".eb-score-grid-table tbody th").getBoundingClientRect(), box = scroll.getBoundingClientRect();
      return name.left >= box.left - 1 && name.right <= box.right + 1;
    });
    check("grid " + at, stays, "the student column stays inside the grid while it scrolls sideways");
    await page.evaluate(() => { document.querySelector(".eb-score-grid-scroll").scrollLeft = 0; });
  }
  // 3. keyboard: type, Enter → next student; ← → next stage
  const v1 = String(60 + round), v2 = String(70 + round);
  await page.locator(cellSel(0, 0)).click();
  await page.keyboard.type(v1);
  await page.keyboard.press("Enter");
  const afterEnter = await page.evaluate(() => [document.activeElement?.getAttribute("data-r"), document.activeElement?.getAttribute("data-c")].join(","));
  check("keyboard " + at, afterEnter === "1,0", "Enter moves to the next student's cell (" + afterEnter + ")");
  await page.keyboard.type(v2);
  await page.keyboard.press("ArrowLeft");
  const afterLeft = await page.evaluate(() => [document.activeElement?.getAttribute("data-r"), document.activeElement?.getAttribute("data-c")].join(","));
  check("keyboard " + at, afterLeft === "1,1", "← moves to the next stage in RTL (" + afterLeft + ")");
  // 4. paste a 3 × 2 block from row 2, stage 0 (a real ClipboardEvent with text/plain); new values every round
  const block = [0, 1, 2, 3, 4, 5].map(i => String(round * 10 + i));
  await page.locator(cellSel(2, 0)).click();
  await page.evaluate(([sel, b]) => {
    const dt = new DataTransfer(); dt.setData("text/plain", b[0] + "\t" + b[1] + "\n" + b[2] + "\t" + b[3] + "\n" + b[4] + "\t" + b[5] + "\n");
    document.querySelector(sel).dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [cellSel(2, 0), block]);
  await page.waitForTimeout(150);
  const pasted = await page.evaluate(() => [[2, 0], [2, 1], [3, 0], [4, 1]].map(([r, c]) => document.querySelector('.eb-score-grid-table input[data-r="' + r + '"][data-c="' + c + '"]').value).join(","));
  check("paste " + at, pasted === [block[0], block[1], block[2], block[5]].join(","), "a pasted 3 × 2 block fills the cells (" + pasted + ")");
  // the grid's row order (the server's), so storage is read for the student each row shows
  const rowNames = await page.evaluate(() => [...document.querySelectorAll(".eb-score-grid-table tbody th")].map(th => th.childNodes[0].textContent.trim()));
  // 5. save: one score.bulk, values in storage, nothing pending
  const before = posts.filter(p => p.action === "score.bulk").length;
  await page.getByRole("region", { name: "حفظ العلامات" }).getByRole("button", { name: /حفظ العلامات/ }).click();
  await page.getByText(/حُفظت \d+ علامة/).waitFor({ timeout: 15000 });
  const writes = posts.filter(p => p.action === "score.bulk").slice(before);
  check("save " + at, writes.length === 1 && writes[0].items.length === 8, "one score.bulk with the 8 changed scores (" + writes.length + " request(s), " + (writes[0] ? writes[0].items.length : 0) + " item(s))");
  const idOf = r => studentIds[nameIndex(rowNames[r])];
  const stored = [score(idOf(0), G1[0]), score(idOf(1), G1[0]), score(idOf(2), G1[0]), score(idOf(2), G1[1]), score(idOf(4), G1[1])];
  const wanted = [v1, v2, block[0], block[1], block[5]].map(Number);
  check("save " + at, stored.every((x, i) => x === wanted[i]), "the scores are in storage (" + stored.join(", ") + " · wanted " + wanted.join(", ") + ")");
  const pending = await page.getByRole("region", { name: "حفظ العلامات" }).getByRole("button", { name: /حفظ العلامات/ }).textContent();
  check("save " + at, !/\(\d+\)/.test(pending), "no pending change left («" + pending.trim() + "»)");
  await page.screenshot({ path: path.join(out, "grid-saved-" + vp.width + ".png"), fullPage: false });
  // 6. accessibility
  const violations = await axe(page, "grid " + at);
  // 7. «الطالب التالي» in a student profile
  await page.getByRole("group", { name: "أقسام المشروع" }).getByRole("button", { name: /تقدّم الطلاب/ }).click();
  await page.getByRole("button", { name: "فتح ملف الطالب" }).first().click();
  const navEl = page.getByRole("navigation", { name: "التنقل بين الطلاب" });
  await navEl.waitFor({ timeout: 15000 });
  await page.waitForFunction(() => /ملف المشروع: /.test(document.querySelector("#eb-student-profile-title")?.textContent || ""), null, { timeout: 15000 });
  const pos = (await navEl.textContent()) || "";
  const firstHeading = (await page.locator("#eb-student-profile-title").textContent()) || "";
  await navEl.getByRole("button", { name: /^الطالب التالي/ }).click();
  await page.waitForFunction(h => { const el = document.querySelector("#eb-student-profile-title"); return el && el.textContent !== h && /ملف المشروع: /.test(el.textContent); }, firstHeading, { timeout: 15000 });
  const secondHeading = (await page.locator("#eb-student-profile-title").textContent()) || "";
  check("profile " + at, /1 من 24/.test(pos) && secondHeading !== firstHeading, "«1 من 24», then «الطالب التالي» opens the next student (" + firstHeading.replace("ملف المشروع: ", "") + " → " + secondHeading.replace("ملف المشروع: ", "") + ")");
  await page.screenshot({ path: path.join(out, "profile-" + vp.width + ".png"), fullPage: false });
  record.screens.push({ width: vp.width, measures: m, violations });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? "P4 GATE FAILED: " + record.failures.length + " check(s)" : "P4 gate passed") + " — record: " + path.join(out, "record.json"));
process.exit(record.failures.length ? 1 : 0);
