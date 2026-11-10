#!/usr/bin/env node
// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §9) — «شاهد التنفيذ خطوة بخطوة» and the teacher's solutions release
// (D1) in a REAL Chromium on the production build, next to the REAL API in process (browser-harness/learning-l8-api.cjs): every route
// here is the deployed handler, storage is in memory. Certification only.
//
//   1. STUDENT (a class with m00–m06 published, nothing released), chapter 5's first exercise page: «شاهد التنفيذ خطوة بخطوة» is under
//      the exercise's program; before answering, the server refuses (أجب عن التمرين أولًا); after answering (the server records it),
//      the recorded steps open in the tracer, whose output ends as the program's.
//   2. The same student on a chapter 5 BOOK tracing question: no «شاهد التنفيذ» (the teacher has not opened the module).
//   3. TEACHER, «الصفوف والطلاب» → the class → «المواد التعليمية لهذا الصف»: the per-module «حلول الكتاب مفتوحة» of chapter 5 is ticked
//      in the real panel; the server stores the release (and audits it).
//   4. The student again: the book question now has «شاهد التنفيذ»; «تنبّأ ثم تحقّق»: a wrong prediction shows both outputs, the right
//      one says it matches; the steps open.
//   5. axe-core (WCAG 2.1 A/AA), overflow and touch targets at 390 (touch) and 1440, light and «داكن», on the open trace panel.
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
const CID = "899371";
const student = { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "سارة أحمد", code: "S1001" };
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {
  "platform/users/u1.json": student,
  "platform/classes/cA.json": { classId: "cA", name: "الصف الحادي عشر", grade: "11", status: "active", active: true, studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: ["899371-m00", "899371-m01", "899371-m02", "899371-m03", "899371-m04", "899371-m05", "899371-m06"] }] },
} });
// handlers that build their own blob client (classrooms) get the same in-memory container — as check-899371-browser-p7 does; the
// development connection string is never dialled (nothing here talks to Azure)
process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
require(require.resolve("@azure/storage-blob", { paths: [path.join(root, "api")] })).BlobServiceClient.fromConnectionString = () => ({ getContainerClient: () => api.mem.container });
const studentToken = api.studentToken(student), teacherToken = api.teacherToken();
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
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

const failures = [];
const check = (ok, what) => { console.log((ok ? "  ✓ " : "  ✗ ") + what); if (!ok) failures.push(what); };
const shot = async (page, name) => { if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, name + ".png") }); };

async function session(role, viewport, { touch = false, readTheme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  const token = role === "student" ? studentToken : teacherToken;
  await ctx.addInitScript(([t, r, theme]) => {
    sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", r); sessionStorage.setItem("examBankSessionDisplayName", r === "student" ? "سارة أحمد" : "المعلم");
    localStorage.setItem("eb.learning.readingSettings.v1", JSON.stringify({ size: 2, spacing: 1, theme }));
  }, [token, role, readTheme]);
  const page = await ctx.newPage();
  page.on("pageerror", e => failures.push("page error (" + role + "): " + e.message));
  return { ctx, page };
}
const readerReady = page => page.locator(".learning-reader-page").first().waitFor({ timeout: 15000 });
/** The student opens a traced walkthrough page as the portal does: its device marker (Phase 9A) → «تابع القراءة» on «اليوم». */
async function studentOpens(page, pageId) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), ["examBankReaderPosition:v1:" + student.userId, JSON.stringify({ courseId: CID, pageId, at: new Date().toISOString() })]);
  await page.goto(origin + "/#/s/today");
  await page.reload();
  await page.getByRole("button", { name: "تابع القراءة" }).first().click({ timeout: 15000 });
  await readerReady(page);
}






const INDEX = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-trace", CID + ".json"), "utf8")).traces;
const EXKEY = "899371-m05-l04-p01/m05-l04-p01-q01-code";
const EX = INDEX[EXKEY];
const [BOOKKEY, BOOK] = Object.entries(INDEX).find(([, t]) => t.kind === "book" && t.moduleId === "899371-m05");
const BOOKPAGE = BOOKKEY.split("/")[0];
check(!!EX && !!BOOK, "the chapter 5 exercise and book traces exist in the server's index (" + BOOKKEY + ")");
const lastOut = t => t.steps[t.steps.length - 1].out;
const WATCH = "شاهد التنفيذ خطوة بخطوة";
const counter = page => page.evaluate(() => document.querySelector(".learning-trace-panel .learning-trace-counter")?.textContent.replace(/\s+/g, " ").trim() || "");
/** The trace toggle of ONE code block (its label changes when open, so it is found by its class inside that block's bar). */
const toggleOf = (page, code) => page.locator(".learning-reader-codewrap").filter({ hasText: code.split("\n")[0].trim().slice(0, 24) }).first().locator(".learning-reader-code-trace");

console.log("1–2. student: an exercise after its answer; a book question closed");
{
  const { ctx, page } = await session("student", { width: 1440, height: 900 });
  await page.goto(origin + "/");
  await studentOpens(page, "899371-m05-l04-p01");
  const watch = toggleOf(page, EX.code);
  await watch.waitFor({ timeout: 15000 });
  await watch.click();
  const refused = await page.locator(".learning-trace-panel .learning-run-status.is-error").first().innerText({ timeout: 10000 }).catch(() => "");
  check(/أجب عن التمرين أولًا/.test(refused), "before answering, the server refuses: «" + refused.trim() + "»");
  await watch.click();                                                                     // close
  const q = page.locator(".learning-reader-practice.is-interactive").first();
  await q.getByRole("radio").nth(1).click();
  await q.locator(".learning-reader-practice-verdict.is-right, .learning-reader-practice-verdict.is-wrong").first().waitFor({ timeout: 10000 });
  const study = api.mem.getJson("platform/learning-study/u1.json");
  check(!!study && !!study.pages["899371-m05-l04-p01"], "the answer is recorded by the server (study record)");
  await watch.click();
  await page.waitForFunction(() => /^الخطوة 1 \//.test(document.querySelector(".learning-trace-panel .learning-trace-counter")?.textContent.replace(/\s+/g, " ").trim() || ""), null, { timeout: 15000 }).catch(() => undefined);
  check(await page.locator(".learning-trace-panel").count() === 1, "one trace panel, under the exercise's program");
  check((await counter(page)) === "الخطوة 1 / " + EX.steps.length, "after answering, the recorded steps open in the tracer (" + await counter(page) + ")");
  const next = page.locator(".learning-trace-panel").getByRole("button", { name: "الخطوة التالية" });
  while (!(await next.isDisabled())) await next.click();
  const out = await page.locator(".learning-trace-panel .learning-trace-out").innerText();
  check(out === lastOut(EX).replace(/\n$/, "") || out === lastOut(EX), "the last step prints what the program prints («" + out + "»)");
  await shot(page, "p13-exercise-1440");

  await studentOpens(page, BOOKPAGE);
  await page.locator(".learning-reader-codewrap").first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  check(await page.getByRole("button", { name: WATCH }).count() === 0, "the book question shows no «شاهد التنفيذ» before the teacher opens the module");
  await ctx.close();
}

console.log("3. teacher: «حلول الكتاب مفتوحة» in the class panel");
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  await page.goto(origin + "/");
  await page.reload();
  await page.getByRole("button", { name: "الصفوف والطلاب" }).or(page.getByRole("link", { name: "الصفوف والطلاب" })).first().click({ timeout: 20000 });
  const heading = page.getByRole("heading", { name: "المواد التعليمية لهذا الصف" });
  await heading.waitFor({ timeout: 20000 });
  await page.getByText("الصف الحادي عشر").first().click();                                   // select the class
  await page.locator(".eb-lm-class-panel").getByRole("heading", { name: "أسس علم الحاسوب" }).waitFor({ timeout: 15000 });
  const release = page.getByRole("checkbox", { name: /حلول الكتاب مفتوحة/ });
  check(await release.count() === 13, "one «حلول الكتاب مفتوحة» per module of 899371 (" + await release.count() + ")");
  const row = page.locator(".eb-lm-class-module").filter({ hasText: "جملة التكرار for" }).first();
  const box = row.getByRole("checkbox", { name: /حلول الكتاب مفتوحة/ });
  check(!(await box.isChecked()) && !(await box.isDisabled()), "chapter 5 (published): closed, and the teacher may open it");
  const hidden = page.locator(".eb-lm-class-module").filter({ hasText: "العمليات" }).first().getByRole("checkbox", { name: /حلول الكتاب مفتوحة/ });
  check(await hidden.isDisabled(), "a module not published to the class cannot be opened (its toggle is disabled)");
  await box.click();
  await page.waitForFunction(() => /فُتحت حلول أسئلة الكتاب/.test(document.body.innerText), null, { timeout: 15000 });
  const stored = api.mem.getJson("platform/classes/cA.json").learningMaterials.find(e => e.courseId === CID);
  check(JSON.stringify(stored.releasedModuleIds) === JSON.stringify(["899371-m05"]), "the server stores the release of chapter 5 only (" + JSON.stringify(stored.releasedModuleIds) + ")");
  await shot(page, "p13-teacher-release-1440");
  await ctx.close();
}

console.log("4. student: the book question, تنبّأ ثم تحقّق");
{
  const { ctx, page } = await session("student", { width: 1440, height: 900 });
  await page.goto(origin + "/");
  await studentOpens(page, BOOKPAGE);
  const watch = toggleOf(page, BOOK.code);
  await watch.waitFor({ timeout: 15000 });
  await watch.click();
  const guess = page.getByLabel(/تنبّأ ثم تحقّق/);
  await guess.waitFor({ timeout: 10000 });
  await guess.fill("لا أعرف");
  await page.getByRole("button", { name: "قارن توقّعي بالتنفيذ" }).click();
  const diff = await page.locator(".learning-trace-verdict.is-diff").innerText({ timeout: 10000 }).catch(() => "");
  check(/توقّعك يختلف/.test(diff) && await page.getByRole("region", { name: "ناتج البرنامج" }).count() === 1, "a wrong prediction shows that it differs, with both outputs");
  await page.getByRole("button", { name: "توقّع من جديد" }).click();
  await page.getByLabel(/تنبّأ ثم تحقّق/).fill(lastOut(BOOK));
  await page.getByRole("button", { name: "قارن توقّعي بالتنفيذ" }).click();
  const same = await page.locator(".learning-trace-verdict.is-match").innerText({ timeout: 10000 }).catch(() => "");
  check(/يطابق/.test(same), "the program's own output as the prediction: «" + same.trim() + "»");
  check((await counter(page)) === "الخطوة 1 / " + BOOK.steps.length, "the book question's recorded steps open (" + await counter(page) + ")");
  await shot(page, "p13-book-1440");
  await ctx.close();
}

console.log("5. axe, overflow and touch targets on an open trace");
const TARGETS = () => {
  const out = [];
  for (const el of document.querySelectorAll(".learning-trace-panel button, .learning-reader-code-trace, .learning-trace-panel textarea")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.width < 44 || r.height < 44) out.push((el.textContent || el.tagName).trim().slice(0, 40) + " " + Math.round(r.width) + "×" + Math.round(r.height));
  }
  return out;
};
for (const v of [{ width: 390, height: 844, touch: true }, { width: 1440, height: 900, touch: false }]) {
  for (const readTheme of ["light", "dark"]) {
    const { ctx, page } = await session("student", { width: v.width, height: v.height }, { touch: v.touch, readTheme });
    await page.goto(origin + "/");
    await studentOpens(page, BOOKPAGE);
    await toggleOf(page, BOOK.code).click({ timeout: 15000 });
    await page.getByRole("button", { name: "شاهد دون توقّع" }).click({ timeout: 10000 });
    await page.locator(".learning-trace-panel .learning-trace").waitFor({ timeout: 10000 });
    await page.locator(".learning-trace-panel").getByRole("button", { name: "الخطوة التالية" }).click();
    await page.locator(".learning-trace-panel").scrollIntoViewIfNeeded();
    await page.evaluate(axeSource + "\n;0");
    const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter(x => x.impact === "serious" || x.impact === "critical").map(x => x.id + " ×" + x.nodes.length + " " + x.nodes.map(n => n.target.join(" ")).join(" | ")));
    const where = "trace " + v.width + "px " + readTheme;
    check(res.length === 0, where + ": axe — " + (res.join(", ") || "clean"));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(overflow <= 0, where + ": no page overflow (" + overflow + "px)");
    if (v.touch) {
      const small = await page.evaluate(TARGETS);
      check(small.length === 0, where + ": the trace controls are ≥ 44 px" + (small.length ? " — " + [...new Set(small)].join("; ") : ""));
      await shot(page, "p13-trace-390-" + readTheme);
    }
    await ctx.close();
  }
}

await browser.close(); server.close();
console.log(failures.length ? "\n" + failures.length + " check(s) failed:\n  " + failures.join("\n  ") : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
