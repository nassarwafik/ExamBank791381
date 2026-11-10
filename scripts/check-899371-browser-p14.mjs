#!/usr/bin/env node
// 899371 enrichment P14 (docs/enterprise-899371-enrichment-plan.md §11) — «حلّ وافحص» and the solution card in a REAL Chromium on the
// production build, next to the REAL API in process (browser-harness/learning-l8-api.cjs) and the REAL Coding Runner Gateway on
// loopback (runner/gateway/server.js) with REAL Docker sandboxes: nothing in the run path is a double. The gateway's HMAC key is random
// per run and lives only in this process. Certification only.
//
//   1. TEACHER, a whole-program question of chapters 1–4: «حلّ وافحص» opens the exam's own editor under the question's starter; the
//      starter as it is → «افحص حلي» fails (and names how many cases passed); «الحل المقترح» opens the reference and its idea;
//      «انسخه إلى المحرر» then «افحص حلي» → «✓ حُلَّ!», every case passed, and the mark «✓ حُلَّ».
//   2. TEACHER, a template question (version 3): the reference's gaps typed into the gaps → passed; only the gap values are sent.
//   3. TEACHER, a run-only question: no «افحص حلي», the note says why.
//   4. STUDENT (a class with m00–m07 published, nothing released): the card is refused («لم يفتح المعلم حلول هذا الفصل بعد»); the
//      check works; NO reply to the student carries a hidden input, a hidden expected output or the reference.
//   5. axe-core (WCAG 2.1 A/AA), overflow and touch targets at 390 (touch) and 1440, light and «داكن», with a verdict on screen.
//
// Tools: PLAYWRIGHT_CORE_DIR (or the global `playwright`), AXE_CORE_DIR, CHROMIUM_PATH; Docker + the csharp worker image. SHOT_DIR
// (optional) receives screenshots. Exit 1 when a check fails, 2 when a tool, the build or Docker is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readSolve } from "./lib/solve-899371.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const require = createRequire(import.meta.url);
let chromium, axeSource;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { try { ({ chromium } = require("playwright")); } catch { console.error("playwright unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); } }
try { axeSource = fs.readFileSync(createRequire(path.join(process.env.AXE_CORE_DIR || root, "package.json")).resolve("axe-core/axe.min.js"), "utf8"); }
catch { console.error("axe-core unavailable (set AXE_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
const { resolveLanguage } = require(path.join(root, "runner/gateway/registry.js"));
if (spawnSync("docker", ["image", "inspect", resolveLanguage("csharp", 1).image]).status !== 0) { console.error("Docker or the csharp worker image is missing"); process.exit(2); }

const KEY = crypto.randomBytes(32).toString("base64url");
const { createGatewayServer } = require(path.join(root, "runner/gateway/server.js"));
const { createDockerSandbox } = require(path.join(root, "runner/gateway/sandbox.js"));
const gateway = createGatewayServer({ key: KEY, sandbox: createDockerSandbox(), maxConcurrency: 2, logger: { info() {}, warn() {}, error() {} } });
await new Promise(r => gateway.listen(0, "127.0.0.1", r));
process.env.CODING_RUNNER_URL = "http://127.0.0.1:" + gateway.address().port;
process.env.CODING_RUNNER_HMAC_KEY = KEY;

require(path.join(root, "api/src/lib/observability.js")).setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const CID = "899371";
const PUBLISHED = ["00", "01", "02", "03", "04", "05", "06", "07"].map(n => CID + "-m" + n);
const INDEX = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-solve", CID + ".json"), "utf8")).questions;
const AUTHORED = Object.fromEntries(readSolve().map(q => [q.book, q]));
const entry = id => ({ id, ...INDEX[id] });
const V2 = entry(Object.keys(INDEX).find(id => INDEX[id].check && INDEX[id].version === 2 && /-m0[1-4]$/.test(INDEX[id].moduleId) && INDEX[id].node.publicTests[0].input.trim()));
const V3 = entry(Object.keys(INDEX).find(id => INDEX[id].check && INDEX[id].version === 3 && PUBLISHED.includes(INDEX[id].moduleId)));
const RUNONLY = entry(Object.keys(INDEX).find(id => !INDEX[id].check && /-m0[1-4]$/.test(INDEX[id].moduleId)));
const student = { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "سارة أحمد", code: "S1001" };
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {
  "platform/users/u1.json": student,
  "platform/classes/cA.json": { classId: "cA", name: "الصف الحادي عشر", grade: "11", status: "active", active: true, studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: PUBLISHED }] },
} });
const studentToken = api.studentToken(student), teacherToken = api.teacherToken();
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".ttf": "font/ttf" };
const traffic = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => {
      const r = await api.handle(req.method, req.url, req.headers, body);
      if (u.pathname.startsWith("/api/learning-solve/")) traffic.push({ who: req.headers["x-student-token"] ? "student" : "teacher", method: req.method, path: u.pathname + u.search, sent: body, status: r.status, got: String(r.body || "") });
      res.writeHead(r.status, r.headers); res.end(r.body);
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

const failures = [];
const check = (ok, what) => { console.log((ok ? "  ✓ " : "  ✗ ") + what); if (!ok) failures.push(what); };
const shot = async (page, name) => { if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, name + ".png"), fullPage: false }); };
async function session(role, viewport, { touch = false, readTheme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(([t, r, theme]) => {
    sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", r); sessionStorage.setItem("examBankSessionDisplayName", r === "student" ? "سارة أحمد" : "المعلم");
    localStorage.setItem("eb.learning.readingSettings.v1", JSON.stringify({ size: 2, spacing: 1, theme }));
  }, [role === "student" ? studentToken : teacherToken, role, readTheme]);
  const page = await ctx.newPage();
  page.on("pageerror", e => failures.push("page error (" + role + "): " + e.message));
  return { ctx, page };
}
const readerReady = page => page.locator(".learning-reader-page").first().waitFor({ timeout: 15000 });
async function teacherOpens(page, pageId) {
  await page.goto(origin + "/#/learning/" + CID + "/read/" + pageId);
  await page.reload();
  await readerReady(page);
}
async function studentOpens(page, pageId) {
  await page.goto(origin + "/#/s/today");
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), ["examBankReaderPosition:v1:" + student.userId, JSON.stringify({ courseId: CID, pageId, at: new Date().toISOString() })]);
  await page.goto(origin + "/#/s/today");
  await page.reload();
  await page.getByRole("button", { name: "تابع القراءة" }).first().click({ timeout: 15000 });
  await readerReady(page);
}
/** The starters of a served page, in order (the n-th «حلّ وافحص» button is the n-th of them). */
const startersOf = pageId => {
  const d = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-content", CID, pageId.split("-l")[0] + ".json"), "utf8"));
  for (const l of d.lessons) for (const p of l.pages) if (p.id === pageId) return p.blocks.filter(b => /-solve-q\d+$/.test(b.id)).map(b => b.id);
  return [];
};
async function openSolve(page, q) {
  const k = startersOf(q.pageId).indexOf(q.blockId);
  const button = page.getByRole("button", { name: "حلّ وافحص", exact: true });
  await button.first().waitFor({ timeout: 15000 });
  check(await button.count() === startersOf(q.pageId).length, q.id + ": one «حلّ وافحص» per writing question of the page (" + startersOf(q.pageId).length + ")");
  await button.nth(k).click();
  const region = page.getByRole("region", { name: "حلّ وافحص: السؤال " + q.number });
  await region.waitFor({ timeout: 15000 });
  return region;
}
async function runCheck(region) {
  await region.getByRole("button", { name: "افحص حلي" }).click();
  await region.locator(".learning-solve-result, .learning-run-status.is-error").first().waitFor({ timeout: 180000 });
  return (await region.locator(".learning-solve-result, .learning-run-status.is-error").first().innerText()).trim();
}

// ── 1. teacher, a whole program ──
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  await teacherOpens(page, V2.pageId);
  const region = await openSolve(page, V2);
  check(await region.getByText("إثراء تعليمي").count() > 0, V2.id + ": the panel says «إثراء تعليمي»");
  await region.locator(".cx-coding, [data-testid='coding-response']").first().waitFor({ timeout: 20000 });
  check(await region.locator(".cx-coding, [data-testid='coding-response']").count() > 0, V2.id + ": the exam's own coding editor is there");
  let verdict = await runCheck(region);
  const total = V2.node.publicTests.length + V2.hidden.length;
  check(/نجح برنامجك في \d+ من \d+/.test(verdict) && verdict.includes("من " + total) && !verdict.includes("✓ حُلَّ!"), V2.id + ": the starter as it is fails the check («" + verdict.split("\n")[0] + "»)");
  await region.getByRole("button", { name: "الحل المقترح" }).click();
  const card = region.getByRole("region", { name: "الحل المقترح", exact: true });
  await card.waitFor({ timeout: 15000 });
  check((await card.getByRole("region", { name: "برنامج الحل المقترح" }).textContent()) === V2.reference, V2.id + ": the card shows the reference program");
  check((await card.innerText()).includes("الفكرة"), V2.id + ": and its idea");
  await card.getByRole("button", { name: "انسخه إلى المحرر (يستبدل كودك)" }).click();
  await page.waitForTimeout(500);
  verdict = await runCheck(region);
  check(verdict.includes("✓ حُلَّ!") && verdict.includes("(" + total + " من " + total + ")"), V2.id + ": the reference passes every case («" + verdict.split("\n")[0] + "»)");
  check(await region.locator(".learning-solve-done").count() === 1, V2.id + ": the mark «✓ حُلَّ» is shown");
  check(await page.evaluate(k => localStorage.getItem(k), "eb.learning.solved.v1." + CID + "." + V2.id) === "1", V2.id + ": the mark is kept in this browser only");
  const sent = traffic.filter(t => t.path.endsWith("/check")).map(t => JSON.parse(t.sent));
  check(sent.length === 2 && sent[1].source === V2.reference && Object.keys(sent[1]).sort().join() === "questionId,source", V2.id + ": the check sends { questionId, source } only");
  await shot(page, "p14-teacher-v2-passed-1440");
  await ctx.close();
}

// ── 2. teacher, a template question ──
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  await teacherOpens(page, V3.pageId);
  const region = await openSolve(page, V3);
  const gaps = region.locator("textarea.cx-tpl-input");
  await gaps.first().waitFor({ timeout: 20000 });
  const ids = V3.node.template.segments.filter(s => s.kind === "editable").map(s => s.id);
  check(await gaps.count() === ids.length, V3.id + ": one text area per gap (" + ids.length + ")");
  for (let i = 0; i < ids.length; i++) await gaps.nth(i).fill(AUTHORED[V3.id].referenceGaps[ids[i]]);
  const before = traffic.length;
  const verdict = await runCheck(region);
  check(verdict.includes("✓ حُلَّ!"), V3.id + ": the reference's gaps pass every case («" + verdict.split("\n")[0] + "»)");
  const sent = traffic.slice(before).filter(t => t.path.endsWith("/check")).map(t => JSON.parse(t.sent));
  check(sent.length === 1 && Object.keys(sent[0]).sort().join() === "questionId,values" && Object.keys(sent[0].values).sort().join() === [...ids].sort().join(), V3.id + ": only the gap values are sent, never the locked text");
  await shot(page, "p14-teacher-v3-passed-1440");
  await ctx.close();
}

// ── 3. teacher, a run-only question ──
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  await teacherOpens(page, RUNONLY.pageId);
  const region = await openSolve(page, RUNONLY);
  check(await region.getByRole("button", { name: "افحص حلي" }).count() === 0 && (await region.innerText()).includes("هذا السؤال لا يُفحص آليًا"), RUNONLY.id + ": a run-only question has no check and says why");
  await ctx.close();
}

// ── 4 + 5. student: the card refused, the check works, nothing hidden reaches the page; then axe / overflow / 44 px ──
for (const [w, h, touch] of [[390, 844, true], [1440, 900, false]]) for (const theme of ["light", "dark"]) {
  const { ctx, page } = await session("student", { width: w, height: h }, { touch, readTheme: theme });
  const tag = w + "px " + (theme === "dark" ? "dark" : "light");
  await studentOpens(page, V2.pageId);
  const region = await openSolve(page, V2);
  if (w === 1440 && theme === "light") {
    await region.getByRole("button", { name: "الحل المقترح" }).click();
    await region.getByText("لم يفتح المعلم حلول هذا الفصل بعد.").waitFor({ timeout: 15000 });
    check(await region.getByRole("region", { name: "الحل المقترح", exact: true }).count() === 0, "student: the card is refused before the teacher releases the chapter");
  }
  const verdict = await runCheck(region);
  check(/نجح برنامجك في \d+ من \d+/.test(verdict), "student " + tag + ": the check answers («" + verdict.split("\n")[0] + "»)");
  await page.evaluate(axeSource + "\n;0");
  const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map(v => v.id + " ×" + v.nodes.length + " " + v.nodes.map(n => n.target.join(" ")).join(" | ")));
  check(axe.length === 0, "student " + tag + ": axe — " + (axe.join(", ") || "clean"));
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 0, "student " + tag + ": no page overflow (" + over + "px)");
  if (touch) {
    const small = await page.evaluate(() => [...document.querySelectorAll(".learning-solve button, .learning-reader-code-bar button")].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.width < 44 || r.height < 44); }).map(b => b.textContent.trim() + " " + Math.round(b.getBoundingClientRect().width) + "×" + Math.round(b.getBoundingClientRect().height)));
    check(small.length === 0, "student " + tag + ": every button of the panel ≥ 44 px" + (small.length ? " — " + small.join(", ") : ""));
  }
  await shot(page, "p14-student-" + w + "-" + theme);
  await ctx.close();
}
const toStudent = traffic.filter(t => t.who === "student").map(t => t.got).join("\n");
const secrets = [V2, V3].flatMap(q => [...q.hidden.flatMap(hc => [hc.input, hc.expected]), q.reference]).filter(s => s.trim().length > 6 && !JSON.stringify(Object.values(INDEX).map(x => x.node)).includes(JSON.stringify(s).slice(1, -1)));
check(secrets.length > 0 && secrets.every(s => !toStudent.includes(JSON.stringify(s).slice(1, -1))), "student: no reply carries a hidden input, a hidden expected output or the reference (" + secrets.length + " secrets looked for in " + traffic.filter(t => t.who === "student").length + " replies)");

await browser.close();
server.close(); gateway.close();
console.log(failures.length ? "\n" + failures.length + " check(s) failed" : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
