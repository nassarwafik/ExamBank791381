#!/usr/bin/env node
// Phase G1 — the class matrix («التقييم الجماعي» → «جدول العلامات») in a REAL Chromium on the production build (certification
// only; nothing is deployed). Same harness as the P4 gate: the build in DIST next to the REAL API in process, one teacher, one
// class of 24 students enrolled in project 899373. At 390 px (touch) and 1024 and 1440 px, a fresh device (so «اعتماد المرحلة
// عند حفظ العلامة» is at its default, ON):
//   1. the matrix opens on the whole first track: one column per active stage, the groups as bands over their columns;
//   2. each row ends with the server's progress · grade;
//   3. Space in a cell marks the stage done (no character is typed); a new score shows the approval the switch implies;
//   4. the stage menu fills the empty scores of the students shown with one value (a saved or typed score is kept);
//   5. «حفظ العلامات» writes the scores first (score.bulk) and then the approvals (progress.bulk); storage holds every score
//      and status, and the row's grade is re-read from the server;
//   6. touch: the «منجز» toggle and the score field are 44 px targets at 390 px;
//   7. axe-core (WCAG 2.1 A/AA): no serious or critical violation; the page never scrolls sideways.
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
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-g1"), label);
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
const stagesOfGroup = g => DEF.stages.filter(s => s.groupId === g.groupId && s.active === true).sort((a, b) => a.order - b.order).map(s => s.stageId);
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
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
  });
  const blocking = result.filter(v => v.impact === "serious" || v.impact === "critical");
  check(where, blocking.length === 0, blocking.length ? "axe: " + blocking.map(v => v.id + " ×" + v.nodes + " (" + v.targets.join(", ") + ")").join("; ") : "axe: no serious / critical violation" + (result.length ? " (" + result.map(v => v.id + ":" + v.impact).join(", ") + ")" : ""));
  return result;
}

const status = (sid, stageId) => { const d = api.mem.getJson(NS.progressName(classId, sid)); return d && d.stages && d.stages[stageId] ? d.stages[stageId].status : "not_started"; };
const BOOK_GROUPS = DEF.groups.filter(g => g.track === DEF.tracks[0].trackId).sort((a, b) => a.order - b.order).filter(g => stagesOfGroup(g).length);
const BOOK = BOOK_GROUPS.flatMap(stagesOfGroup);
const inputOf = (page, name, stageId) => page.locator('.eb-score-grid-table input[aria-label^="' + name + " — " + stageId + ' ("]');
const doneOf = (page, name, stageId) => page.getByRole("button", { name: name + " — " + stageId + ": منجز", exact: true });
const totalOf = async (page, name) => (await page.locator(".eb-score-grid-table tbody tr", { has: page.locator("th", { hasText: name }) }).locator(".eb-score-grid-total").textContent() || "").trim();
const VIEWPORTS = [{ width: 390, height: 844, touch: true }, { width: 1024, height: 768, touch: false }, { width: 1440, height: 900, touch: false }];
let round = 0;
for (const vp of VIEWPORTS) {
  const at = "@" + vp.width;
  const S = BOOK[round], A = names[3 * round], B = names[3 * round + 1], C = names[3 * round + 2];
  round++;
  console.log("الجدول الشامل " + at + " — المرحلة " + S);
  const { ctx, page } = await openWorkspace(vp);
  await page.getByRole("group", { name: "أقسام المشروع" }).getByRole("button", { name: /التقييم الجماعي/ }).click();
  await page.getByRole("button", { name: "جدول العلامات" }).click();
  await inputOf(page, A, S).waitFor({ timeout: 20000 });
  // 1–2. the whole track, the bands, the totals
  const shape = await page.evaluate(() => ({
    cols: document.querySelectorAll(".eb-score-grid-table tbody tr:first-child input").length,
    bands: [...document.querySelectorAll('.eb-score-grid-table th[scope="colgroup"]')].map(th => th.textContent.trim()),
    overflow: document.documentElement.scrollWidth - innerWidth
  }));
  check("matrix " + at, shape.cols === BOOK.length, "one column per active stage of the track (" + shape.cols + " / " + BOOK.length + ")");
  check("matrix " + at, BOOK_GROUPS.length < 2 || shape.bands.join("|") === BOOK_GROUPS.map(g => g.title).join("|"), "the groups as bands (" + shape.bands.join(" · ") + ")");
  check("page " + at, shape.overflow <= 0, "no horizontal page overflow (" + shape.overflow + ")");
  const totalBefore = await totalOf(page, B);
  check("matrix " + at, /^\d+% · \d+$/.test(totalBefore), "the row ends with the server's progress · grade («" + totalBefore + "»)");
  // 3. Space marks done; a new score shows the implied approval
  await inputOf(page, A, S).click();
  await page.keyboard.press("Space");
  check("done " + at, (await doneOf(page, A, S).getAttribute("aria-pressed")) === "true" && (await inputOf(page, A, S).inputValue()) === "", "Space marks the stage done and types nothing");
  await inputOf(page, B, S).click();
  await page.keyboard.type("85");
  check("done " + at, (await doneOf(page, B, S).getAttribute("aria-pressed")) === "true", "a new score shows the approval the switch implies");
  // 4. the stage menu: fill the empty scores
  // An open menu closes on a scroll (ActionMenu), and Playwright's click scrolls its target into view first (honouring the
  // grid's scroll-padding), with the scroll event landing after the click. So the trigger is clicked as a person clicks it:
  // the pointer at its centre, nothing scrolled.
  const trigger = page.getByRole("button", { name: "إجراءات المرحلة " + S, exact: true });
  const tb = await trigger.boundingBox();
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.getByRole("button", { name: "تعبئة العلامات الفارغة…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("55");
  await dialog.getByRole("button", { name: "تعبئة", exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 10000 });
  check("fill " + at, (await inputOf(page, B, S).inputValue()) === "85" && (await inputOf(page, C, S).inputValue()) === "55", "the empty scores take 55, a typed score is kept (" + (await inputOf(page, B, S).inputValue()) + " / " + (await inputOf(page, C, S).inputValue()) + ")");
  // 6. touch targets
  if (vp.touch) {
    const box = await doneOf(page, C, S).boundingBox(), field = await inputOf(page, C, S).boundingBox();
    check("touch " + at, box.width >= 44 && box.height >= 44 && field.height >= 44, "«منجز» " + Math.round(box.width) + "×" + Math.round(box.height) + ", the score field " + Math.round(field.height) + " px tall (≥ 44)");
  }
  await page.screenshot({ path: path.join(out, "matrix-" + vp.width + ".png"), fullPage: false });
  // 5. save: scores, then approvals
  const before = posts.length;
  await page.getByRole("region", { name: "حفظ العلامات" }).getByRole("button", { name: /حفظ العلامات/ }).click();
  await page.getByText(/اعتُمدت \d+ مرحلة/).waitFor({ timeout: 20000 });
  const writes = posts.slice(before).map(p => p.action);
  check("save " + at, writes[0] === "score.bulk" && writes.includes("progress.bulk") && writes.lastIndexOf("score.bulk") < writes.indexOf("progress.bulk"), "the scores first, then the approvals (" + writes.join(" → ") + ")");
  const id = n => studentIds[nameIndex(n)];
  const got = [score(id(A), S), status(id(A), S), score(id(B), S), status(id(B), S), score(id(C), S), status(id(C), S)];
  check("save " + at, got.join(",") === "55,approved,85,approved,55,approved", "storage holds the scores and the approvals (" + got.join(", ") + ")");
  await page.waitForFunction(([n, t]) => { const row = [...document.querySelectorAll(".eb-score-grid-table tbody tr")].find(r => r.querySelector("th")?.textContent.includes(n)); return row && row.querySelector(".eb-score-grid-total")?.textContent.trim() !== t; }, [B, totalBefore], { timeout: 15000 }).catch(() => {});
  const totalAfter = await totalOf(page, B);
  check("save " + at, totalAfter !== totalBefore, "the row's grade is re-read from the server («" + totalBefore + "» → «" + totalAfter + "»)");
  await page.screenshot({ path: path.join(out, "matrix-saved-" + vp.width + ".png"), fullPage: false });
  const violations = await axe(page, "matrix " + at);
  record.screens.push({ width: vp.width, shape, violations });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? "G1 GATE FAILED: " + record.failures.length + " check(s)" : "G1 gate passed") + " — record: " + path.join(out, "record.json"));
process.exit(record.failures.length ? 1 : 0);
