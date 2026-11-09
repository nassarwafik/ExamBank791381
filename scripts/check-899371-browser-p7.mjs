#!/usr/bin/env node
// 899371 P7 (docs/enterprise-899371-learning-plan.md §20) — «مختبر البرمجة» in a REAL Chromium on the production build, next to the
// REAL API in process (browser-harness/learning-l8-api.cjs, the L.8 harness). Certification only.
//
//   1. TEACHER «الواجبات» → «إنشاء واجب» → «المكتبة الرسمية»: the chip «مختبر البرمجة · أسس علم الحاسوب» lists exactly the 11 lab items
//      CL899371-01…11 (and nothing of 791381); choosing chapter 7 shows «4 سؤال · 40 علامة»; the wizard creates the assignment.
//   2. What the server stored is the frozen library item (source library, hidden tests and reference programs included) — the teacher's
//      browser never sent a snapshot and never received an expected output.
//   3. STUDENT of that class: the assignment arrives with the locked template and the public example, and with NO hidden test,
//      expected output or reference program.
//   4. axe-core (WCAG 2.1 A/AA), no horizontal overflow, at 390 (touch) and 1440, on the composer showing the lab.
//
// Tools are measuring instruments, not project dependencies: PLAYWRIGHT_CORE_DIR (or the global `playwright`), AXE_CORE_DIR,
// CHROMIUM_PATH. SHOT_DIR (optional) receives screenshots. Exit 1 when a check fails, 2 when a tool or the build is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const require = createRequire(import.meta.url);
let chromium, axeSource;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { try { ({ chromium } = require("playwright")); } catch { console.error("playwright unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); } }
try { axeSource = fs.readFileSync(createRequire(path.join(process.env.AXE_CORE_DIR || root, "package.json")).resolve("axe-core/axe.min.js"), "utf8"); }
catch { console.error("axe-core unavailable (set AXE_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }

require(path.join(root, "api/src/lib/observability.js")).setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const LAB = Array.from({ length: 11 }, (_, i) => "CL899371-" + String(i + 1).padStart(2, "0"));
const ITEM = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/exam-library/items/CL899371-07.json"), "utf8"));
const student = { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "سارة أحمد", code: "S1001" };
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {
  "platform/users/u1.json": student,
  "platform/classes/cA.json": { classId: "cA", name: "الصف الحادي عشر", grade: "11", status: "active", active: true, studentIds: ["u1"] },
} });
// handlers that build their own blob client (classrooms, assignments) get the same in-memory container — as check-access-e2e-p9b1
// does; the development connection string is never dialled (nothing here talks to Azure)
process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
require(require.resolve("@azure/storage-blob", { paths: [path.join(root, "api")] })).BlobServiceClient.fromConnectionString = () => ({ getContainerClient: () => api.mem.container });
const studentToken = api.studentToken(student), teacherToken = api.teacherToken();
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const traffic = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => { const r = await api.handle(req.method, req.url, req.headers, body); traffic.push({ method: req.method, path: u.pathname, role: req.headers["x-student-token"] === studentToken || req.headers["x-builder-token"] === studentToken ? "student" : "teacher", sent: body, got: String(r.body || "") }); res.writeHead(r.status, r.headers); res.end(r.body); });
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

const failures = [];
const check = (ok, what) => { console.log((ok ? "  ✓ " : "  ✗ ") + what); if (!ok) failures.push(what); };
const shot = async (page, name) => { if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, name + ".png") }); };
async function session(role, viewport, { touch = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(([t, r]) => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", r); sessionStorage.setItem("examBankSessionDisplayName", r === "student" ? "سارة أحمد" : "المعلم"); }, [role === "student" ? studentToken : teacherToken, role]);
  const page = await ctx.newPage();
  page.on("pageerror", e => failures.push("page error (" + role + "): " + e.message));
  return { ctx, page };
}
/** The teacher's composer on «المكتبة الرسمية», filtered to the coding-lab chip. */
async function composerOnLab(page) {
  await page.goto(origin + "/");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: "الواجبات" }).first().click({ timeout: 15000 });
  await page.getByRole("button", { name: "إنشاء واجب" }).first().click({ timeout: 15000 });
  const composer = page.getByRole("region", { name: "إنشاء واجب جديد" });
  await composer.getByRole("button", { name: "المكتبة الرسمية" }).click();
  const list = composer.getByRole("list", { name: "عناصر المكتبة" });
  await list.waitFor({ timeout: 15000 });
  await composer.getByRole("button", { name: "مختبر البرمجة · أسس علم الحاسوب", exact: true }).click();
  return { composer, list };
}
const codes = list => list.locator(".library-item-code").allInnerTexts();
async function axe(page, where) {
  await page.evaluate(axeSource + "\n;0");
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map(v => v.id + " ×" + v.nodes.length));
  check(r.length === 0, where + ": axe WCAG 2.1 A/AA — " + (r.join(", ") || "no violation"));
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 1, where + ": no horizontal overflow (" + over + "px)");
}

console.log("1. teacher: the coding lab in «المكتبة الرسمية», assigned in the wizard");
let assignmentId = "";
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  const { composer, list } = await composerOnLab(page);
  const shown = await codes(list);
  check(JSON.stringify(shown) === JSON.stringify(LAB), "the chip lists exactly CL899371-01…11 (" + shown.length + ")");
  const first = await list.locator(".library-item-main small").first().innerText();
  check(/4 سؤال · 40 علامة · مختبر البرمجة · أسس علم الحاسوب/.test(first), "an item reads «4 سؤال · 40 علامة · مختبر البرمجة · أسس علم الحاسوب» (" + first + ")");
  await list.getByRole("button", { name: /^CL899371-07/ }).click();
  await composer.getByText("4 سؤال · 40 علامة").first().waitFor({ timeout: 15000 });
  check(true, "choosing chapter 7 «العمليات» selects it: «4 سؤال · 40 علامة»");
  await shot(page, "p7-composer-1440");
  await axe(page, "composer 1440");
  // the wizard: content → classes (a single class may come pre-chosen) → dates → rules (publish now) → review
  for (let i = 0; i < 5; i++) {
    for (const name of [/الصف الحادي عشر/, "نشر مباشرة"]) {
      const box = composer.getByRole("checkbox", { name });
      if (await box.count() && !(await box.isChecked())) await box.check();
    }
    if (i < 4) await composer.getByRole("button", { name: "التالي" }).click();
  }
  const before = traffic.length;
  const created = page.waitForResponse(r => r.url().endsWith("/api/assignments") && r.request().method() === "POST", { timeout: 15000 });
  await composer.getByRole("button", { name: /^إنشاء الواجب/ }).click();
  await created;
  const post = traffic.slice(before).find(t => t.method === "POST" && t.path === "/api/assignments");
  const sent = JSON.parse(post?.sent || "{}");
  check(sent.libraryRef?.itemId === "CL899371-07" && !/hiddenTests|expectedOutput|referenceSolutions/.test(post.sent), "the browser sent libraryRef CL899371-07 and no answer key");
  assignmentId = JSON.parse(post.got).assignment?.assignmentId || "";
  check(!!assignmentId, "the assignment was created (" + assignmentId + ")");
  const anExpected = ITEM.examSnapshot.questions[0].answer.hiddenTests[0].expectedOutput;
  // A full-access teacher (this shared-password identity: examLibrary.item.viewKeys) may SEE a library item's key when previewing it
  // (P6-A, unchanged); what P7 proves is that assigning needs none of it: no other teacher response carries a key.
  const keyed = traffic.filter(t => t.role === "teacher" && /"expectedOutput"|"hiddenTests"/.test(t.got)).map(t => t.method + " " + t.path);
  check(keyed.every(k => k === "GET /api/exam-library/CL899371-07"), "only the item's own preview (a key-holding teacher, P6-A) carried hidden tests; nothing else did (" + [...new Set(keyed)].join(", ") + ")");
  await ctx.close();
  console.log("2. what the server stored");
  const stored = api.mem.getJson("platform/assignments/" + assignmentId + ".json");
  check(stored?.status === "published" && stored.classId === "cA", "it is published to the class (" + stored?.status + ", " + stored?.classId + ")");
  check(stored?.source?.kind === "library" && stored.source.itemId === "CL899371-07", "the stored assignment names its library source");
  const sq = stored?.examSnapshot?.questions || [];
  check(sq.length === 4 && sq.every((q, i) => JSON.stringify(q.answer) === JSON.stringify(ITEM.examSnapshot.questions[i].answer) && JSON.stringify(q.coding) === JSON.stringify(ITEM.examSnapshot.questions[i].coding)),
    "its snapshot is the frozen item: the same coding config and answer key (hidden tests, reference) for all 4 questions");
  check(sq[0]?.answer?.hiddenTests?.[0]?.expectedOutput === anExpected, "an expected output is there, on the server only");
}

console.log("3. student: the assignment arrives without its answer key");
{
  const { ctx, page } = await session("student", { width: 390, height: 844 }, { touch: true });
  await page.goto(origin + "/#/s/today");
  await page.waitForLoadState("networkidle").catch(() => {});
  const r = await page.evaluate(async ([id, t]) => {
    const h = { "x-student-token": t, "content-type": "application/json" };
    const start = await fetch("/api/student-submission/" + encodeURIComponent(id), { method: "POST", headers: h, body: JSON.stringify({ action: "startAttempt" }) });   // the assignment model needs an explicit start
    const x = await fetch("/api/student-assignment/" + encodeURIComponent(id), { headers: h });
    return { start: start.status, status: x.status, text: await x.text() };
  }, [assignmentId, studentToken]);
  check(r.start === 200, "the student starts an attempt → " + r.start);
  check(r.status === 200, "GET /api/student-assignment → " + r.status);
  const body = r.text;
  check(!/"hiddenTests"|"expectedOutput"|"referenceSolutions"|"comparator"/.test(body), "no hidden test, expected output, comparator or reference program");
  // every expected output of a hidden test (except one that is also a public example, visible by design) is absent
  const leaked = ITEM.examSnapshot.questions.flatMap(q => q.answer.hiddenTests.filter(t => t.expectedOutput.trim().length > 2 && !q.coding.publicTests.some(p => p.sampleOutput === t.expectedOutput || p.input === t.expectedOutput) && body.includes(JSON.stringify(t.expectedOutput))).map(t => q.examQuestionId + "/" + t.id));
  check(leaked.length === 0, "none of the " + ITEM.examSnapshot.questions.reduce((n, q) => n + q.answer.hiddenTests.length, 0) + " hidden expected outputs reached the student" + (leaked.length ? " — LEAKED " + leaked.join(", ") : ""));
  const locked = ITEM.examSnapshot.questions[0].coding.template.segments.find(s => s.kind === "locked").text;
  check(body.includes(JSON.stringify(locked).slice(1, -1)), "the locked template reaches the student (the gaps are theirs to fill)");
  check(body.includes(JSON.stringify(ITEM.examSnapshot.questions[0].coding.publicTests[0].sampleOutput)), "the public example reaches the student");
  await ctx.close();
}

console.log("4. the composer on a phone");
{
  const { ctx, page } = await session("teacher", { width: 390, height: 844 }, { touch: true });
  const { list } = await composerOnLab(page);
  check((await codes(list)).length === 11, "the 11 lab items at 390");
  await shot(page, "p7-composer-390");
  await axe(page, "composer 390");
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures.length ? "\n✗ " + failures.length + " check(s) failed:\n  " + failures.join("\n  ") : "\n✓ every P7 browser check passed");
process.exit(failures.length ? 1 : 0);
