#!/usr/bin/env node
// Phase P7 — condensed stages in a REAL Chromium on the production build (certification only; nothing is deployed). The
// build in DIST (default ./dist) is served next to the REAL API, in process (browser-harness/learning-l8-api.cjs: every
// Azure Functions handler on the in-memory storage of the API tests, real signed sessions). One class enrolled in project
// 899373 that started on the OLD stage set (class snapshot template v1); one student per viewport, each with old progress:
// B01 approved (90) + B02 ready (→ BK01 waits for the teacher) and B04–B07 approved (80) (→ BK02 approved, 80).
//
// At 390 px (touch) and 1024 and 1440 px, on the student portal's «مشاريعي» («الكل»):
//   1. only the condensed stages are listed (BK01…BK07 for the book track), never an old B01… code;
//   2. every stage shows the items it covers («يشمل: …», the template's description);
//   3. BK02 shows as approved and BK01 not (a partly done merge is never approved for the student);
//   4. the student's read writes nothing (snapshot and progress byte-identical);
//   5. the page never scrolls sideways; axe-core (WCAG 2.1 A/AA): no serious or critical violation.
// Then, through the real API: a teacher read SHOWS the converted class and writes nothing (Phase P-9: reads never write);
// the first write (program.activate) converts it: snapshot v2, BK01 «جاهزة للفحص» with the conversion note, BK02 approved
// (80), the old entries archived (`condensedFrom`) and gone from `stages`, ONE `project.template.condense` audit; a second
// write and a read change nothing; the student page after the conversion lists the same stages.
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
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-p7"), label);
const require = createRequire(import.meta.url);
let chromium, axeSource;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
try { axeSource = fs.readFileSync(createRequire(path.join(process.env.AXE_CORE_DIR || root, "package.json")).resolve("axe-core/axe.min.js"), "utf8"); }
catch { console.error("axe-core unavailable (set AXE_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ── the real API, in process ────────────────────────────────────────────────────────────────────────────────────────────────
const CODE = "899373";
const { getStorageNamespace, getProjectDefinition } = require(path.join(root, "api/src/lib/project-tracker/registry.js"));
const OLD = require(path.join(root, "api/tests/fixtures/project-templates-pre-p7/899373.json"));
const NS = getStorageNamespace(CODE);
const DEF = getProjectDefinition(CODE);
const BOOK = DEF.stages.filter(s => s.track === "book" && s.active === true).sort((a, b) => a.order - b.order);
const NOW = "2026-10-01T00:00:00.000Z";
const T = { status: "approved", approvedBy: "teacher-1", approvedAt: NOW, updatedAt: NOW };
const OLD_PROGRESS = { B01: { ...T, score: 90 }, B02: { status: "ready_for_review", updatedAt: NOW }, B04: { ...T, score: 80 }, B05: { ...T, score: 80 }, B06: { ...T, score: 80 }, B07: { ...T, score: 80 } };
const VIEWPORTS = [{ width: 390, height: 844, touch: true }, { width: 1024, height: 768, touch: false }, { width: 1440, height: 900, touch: false }];
const students = VIEWPORTS.map((vp, i) => ({ userId: "p7s" + (i + 1), role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب " + (i + 1), code: "P7" + (i + 1) }));
const seed = {
  "platform/classes/c1.json": { classId: "c1", name: "الحادي عشر 7", grade: "11", schoolYear: "2026", status: "active", active: true, studentIds: students.map(s => s.userId), programCodes: [CODE], createdAt: NOW, updatedAt: NOW },
  [NS.configName("c1")]: { schemaVersion: 1, projectCode: CODE, classId: "c1", templateVersion: OLD.templateVersion, tracks: DEF.tracks, trackWeights: OLD.trackWeights, config: OLD.config, groups: OLD.groups, stages: OLD.stages, createdAt: NOW, updatedAt: NOW }
};
for (const s of students) {
  seed["platform/users/" + s.userId + ".json"] = s;
  seed[NS.progressName("c1", s.userId)] = { schemaVersion: 1, programCode: CODE, classId: "c1", studentId: s.userId, startedAt: NOW, updatedAt: NOW, stages: OLD_PROGRESS, history: [] };
}
const { setSink } = require(path.join(root, "api/src/lib/observability.js"));
setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed });
const stored = () => JSON.stringify(api.mem.getJson(NS.configName("c1"))) + students.map(s => JSON.stringify(api.mem.getJson(NS.progressName("c1", s.userId)))).join("");

const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => { const r = await api.handle(req.method, req.url, req.headers, body); res.writeHead(r.status, r.headers); res.end(r.body); });
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

async function studentView(vp, student, at, shot) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(([t, n]) => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "student"); sessionStorage.setItem("examBankSessionDisplayName", n); }, [api.studentToken(student), student.displayName]);
  const page = await ctx.newPage();
  page.on("pageerror", e => fail("page error " + at, e.message));
  await page.goto(origin + "/");
  const filters = page.getByRole("group", { name: "عرض المراحل" });
  await filters.waitFor({ timeout: 20000 });
  await filters.getByRole("button", { name: /^الكل/ }).click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);                                                 // the chips' colour transition has settled
  const view = await page.evaluate(() => [...document.querySelectorAll(".eb-sp-stage-list > .eb-sp-stage")].filter(li => li.offsetParent).map(li => ({
    code: li.querySelector(".eb-sp-stage-code")?.textContent || "", items: li.querySelector(".eb-sp-stage-items")?.textContent || "",
    approved: li.classList.contains("is-approved"), itemsVisible: !!li.querySelector(".eb-sp-stage-items")?.getBoundingClientRect().height
  })));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (shot) await page.screenshot({ path: path.join(out, shot + "-" + vp.width + ".png"), fullPage: true });
  return { ctx, page, view, overflow };
}

const wanted = BOOK.map(s => s.stageId);
for (const [i, vp] of VIEWPORTS.entries()) {
  const at = "@" + vp.width;
  console.log("«مشاريعي» before the conversion " + at);
  const before = stored();
  const { ctx, page, view, overflow } = await studentView(vp, students[i], at, "student");
  check("stages " + at, JSON.stringify(view.map(v => v.code)) === JSON.stringify(wanted), "only the condensed stages (" + view.map(v => v.code).join(" ") + ")");
  check("stages " + at, !view.some(v => /^B\d\d$/.test(v.code)), "no old B01… code");
  const itemsOk = view.every(v => v.items === "يشمل: " + BOOK.find(s => s.stageId === v.code).description && v.itemsVisible);
  check("items " + at, itemsOk, itemsOk ? "every stage lists its items (" + view[0].items + " …)" : "missing / wrong item list: " + JSON.stringify(view.filter(v => !v.items)));
  check("merge " + at, view.find(v => v.code === "BK02")?.approved === true && view.find(v => v.code === "BK01")?.approved === false, "BK02 approved, BK01 (partly done) not");
  check("read " + at, stored() === before, "the student's read wrote nothing");
  check("page " + at, overflow <= 0, overflow > 0 ? "the page scrolls sideways by " + overflow + " px" : "no horizontal page overflow");
  const violations = await axe(page, "portal " + at);
  record.screens.push({ width: vp.width, stages: view.length, violations });
  await ctx.close();
}

console.log("a teacher read shows the conversion; the first write persists it");
const teacherToken = api.teacherToken();
const auth = { authorization: "Bearer " + teacherToken, "x-builder-token": teacherToken };
const get = () => api.handle("GET", "/api/project-tracker?projectCode=" + CODE + "&classId=c1&resource=board", auth, "");
const write = () => api.handle("POST", "/api/project-tracker", { ...auth, "content-type": "application/json" }, JSON.stringify({ projectCode: CODE, classId: "c1", action: "program.activate" }));
const beforeRead = stored();
const r0 = await get();
const board = JSON.parse(r0.body);
check("read", r0.status === 200 && board.stages.some(s => s.stageId === "BK01") && !board.stages.some(s => s.stageId === "B01"), "the board read shows the condensed stages");
check("read", stored() === beforeRead && api.mem.names("platform/audit/").length === 0, "the read wrote nothing and audited nothing");
const r1 = await write();
check("convert", r1.status === 200, "first write (program.activate) → " + r1.status);
const snap = api.mem.getJson(NS.configName("c1"));
check("convert", snap.templateVersion === 2 && !snap.conversion && snap.stages.some(s => s.stageId === "BK01") && !snap.stages.some(s => s.stageId === "B01"), "snapshot v2 with the condensed stages, no lock left");
const docs = students.map(s => api.mem.getJson(NS.progressName("c1", s.userId)));
check("convert", docs.every(d => d.stages.BK01?.status === "ready_for_review" && /^تحويل المراحل المختصرة — B01 /.test(d.stages.BK01.note || "")), "BK01 waits for the teacher with the conversion note");
check("convert", docs.every(d => d.stages.BK02?.status === "approved" && d.stages.BK02.score === 80), "BK02 approved with 80");
check("convert", docs.every(d => !("B01" in d.stages) && d.condensedFrom?.stages?.B01?.score === 90), "old entries archived and gone from the stages");
const audits = api.mem.names("platform/audit/").map(n => api.mem.getJson(n)).filter(a => a.action === "project.template.condense");
check("convert", audits.length === 1, "one project.template.condense audit (" + audits.length + ")");
const afterFirst = stored();
await write(); await get();
check("convert", stored() === afterFirst && api.mem.names("platform/audit/").map(n => api.mem.getJson(n)).filter(a => a.action === "project.template.condense").length === 1, "a second write and a read change nothing");

const vp = VIEWPORTS[0];
console.log("«مشاريعي» after the conversion @" + vp.width);
const after = await studentView(vp, students[0], "@" + vp.width + " after", "student-after");
check("after", JSON.stringify(after.view.map(v => v.code)) === JSON.stringify(wanted), "the same condensed stages after the stored conversion");
await after.ctx.close();

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? "P7 GATE FAILED: " + record.failures.length + " check(s)" : "P7 gate passed") + " — record: " + path.join(out, "record.json"));
process.exit(record.failures.length ? 1 : 0);
