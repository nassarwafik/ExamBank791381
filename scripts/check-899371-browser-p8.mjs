#!/usr/bin/env node
// 899371 P8 (docs/enterprise-899371-learning-plan.md §21) — «جرّب الكود» in a REAL Chromium on the production build, next to the
// REAL API in process (browser-harness/learning-l8-api.cjs) and the REAL Coding Runner Gateway on loopback (runner/gateway/server.js)
// with REAL Docker sandboxes: nothing in the run path is a double. The gateway's HMAC key is random per run and lives only in this
// process. Certification only.
//
//   1. TEACHER, chapter 4 «مثال مفصل مع جدول متابعة»: the page's one book program has «جرّب الكود»; it opens an editable copy and the
//      toggle keeps its focus; input 1234 → «أدخل عددًا رباعي المنازل: مقبول»; an edit (2 → 9999) → «مرفوض»; a missing «;» → «خطأ
//      ترجمة» naming the learner's own line; «إعادة كود الكتاب»; the book's code above never changes.
//   2. STUDENT (a class with m00–m04 published): the run list names only blocks of m01–m04; the same run works for them.
//   3. axe-core (WCAG 2.1 A/AA), overflow and touch targets at 390 (touch) and 1440, light and «داكن», with a result on screen.
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

// The real gateway on loopback, and the API pointed at it (http is allowed for loopback only — runner-config.js).
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
const PUBLISHED = ["899371-m00", "899371-m01", "899371-m02", "899371-m03", "899371-m04"];
const student = { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "سارة أحمد", code: "S1001" };
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {
  "platform/users/u1.json": student,
  "platform/classes/cA.json": { classId: "cA", name: "الصف الحادي عشر", grade: "11", status: "active", active: true, studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: PUBLISHED }] },
} });
const studentToken = api.studentToken(student), teacherToken = api.teacherToken();
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
const traffic = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => { const r = await api.handle(req.method, req.url, req.headers, body); if (u.pathname.startsWith("/api/learning-run/")) traffic.push({ method: req.method, path: u.pathname, sent: body, status: r.status, got: String(r.body || "") }); res.writeHead(r.status, r.headers); res.end(r.body); });
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
  await ctx.addInitScript(([t, r, theme]) => {
    sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", r); sessionStorage.setItem("examBankSessionDisplayName", r === "student" ? "سارة أحمد" : "المعلم");
    localStorage.setItem("eb.learning.readingSettings.v1", JSON.stringify({ size: 2, spacing: 1, theme }));
  }, [role === "student" ? studentToken : teacherToken, role, readTheme]);
  const page = await ctx.newPage();
  page.on("pageerror", e => failures.push("page error (" + role + "): " + e.message));
  return { ctx, page };
}
const PAGE = "899371-m04-l01-p05";
const book = (() => { const d = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-content", CID, "899371-m04.json"), "utf8")); for (const l of d.lessons) for (const p of l.pages) if (p.id === PAGE) return p.blocks.find(b => b.id === "m04-l01-p05-b06").code; })();
const teacherOpens = async page => {
  await page.goto(origin + "/#/learning/" + CID + "/read/" + PAGE);
  await page.reload();
  await page.locator(".learning-reader-page").first().waitFor({ timeout: 15000 });
};
async function studentOpens(page) {
  await page.goto(origin + "/#/s/today");
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), ["examBankReaderPosition:v1:" + student.userId, JSON.stringify({ courseId: CID, pageId: PAGE, at: new Date().toISOString() })]);
  await page.goto(origin + "/#/s/today");
  await page.reload();
  await page.getByRole("button", { name: "تابع القراءة" }).first().click({ timeout: 15000 });
  await page.locator(".learning-reader-page").first().waitFor({ timeout: 15000 });
}
const tryButton = page => page.getByRole("button", { name: /^(جرّب الكود|إغلاق التجربة)$/ });
async function runWith(region, source, stdin) {
  const [code, input] = await region.getByRole("textbox").all();
  if (source !== null) await code.fill(source);
  await input.fill(stdin);
  await region.getByRole("button", { name: "تشغيل" }).click();
  await region.locator(".learning-run-status").filter({ hasNotText: /^$|جارٍ التشغيل/ }).waitFor({ timeout: 60000 });
  return { status: (await region.locator(".learning-run-status").innerText()).trim(), out: await region.getByRole("region", { name: "الناتج" }).textContent().catch(() => null), err: await region.locator(".learning-run-err").textContent().catch(() => null) };
}

console.log("1. teacher: chapter 4, the book program, run for real");
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  await teacherOpens(page);
  await tryButton(page).first().waitFor({ timeout: 20000 });
  check(await tryButton(page).count() === 1, "the page's one indexed program has «جرّب الكود» (" + await tryButton(page).count() + ")");
  const toggle = tryButton(page).first();
  await toggle.focus(); await toggle.press("Enter");
  const region = page.getByRole("region", { name: "جرّب الكود" });
  await region.waitFor({ timeout: 15000 });
  check(await page.evaluate(() => document.activeElement?.textContent?.trim()) === "إغلاق التجربة" && (await toggle.getAttribute("aria-expanded")) === "true", "Enter opens the copy; the toggle keeps its focus and says «إغلاق التجربة»");
  check((await region.getByRole("textbox").first().inputValue()) === book, "the editable copy is the book's program");
  const a = await runWith(region, null, "1234\n");
  check(a.status === "انتهى التشغيل" && a.out === "أدخل عددًا رباعي المنازل: مقبول\n", "1234 → «أدخل عددًا رباعي المنازل: مقبول» (" + JSON.stringify(a.out) + ")");
  const b = await runWith(region, book.replace("StartsWith(\"1\")", "StartsWith(\"9\")"), "1234\n");
  check(b.out === "أدخل عددًا رباعي المنازل: مرفوض\n", "an edit runs the learner's code: StartsWith(\"9\") → «مرفوض»");
  const c = await runWith(region, book.replace("int number = int.Parse(Console.ReadLine());", "int number = int.Parse(Console.ReadLine())"), "1234\n");
  check(/خطأ ترجمة/.test(c.status) && /\(4,\d+\): error CS1002/.test(c.err || ""), "a missing «;» → «خطأ ترجمة», the compiler names the learner's line 4 (" + (c.err || "").trim().slice(0, 60) + ")");
  await region.getByRole("button", { name: "إعادة كود الكتاب" }).click();
  check((await region.getByRole("textbox").first().inputValue()) === book, "«إعادة كود الكتاب» brings the book's program back");
  check((await page.locator(".learning-reader-code code").first().textContent()) === book, "the book's code above never changed");
  const posts = traffic.filter(t => t.method === "POST");
  check(posts.length === 3 && posts.every(t => Object.keys(JSON.parse(t.sent)).sort().join() === "blockId,pageId,source,stdin"), "every run sent exactly { pageId, blockId, source, stdin } (" + posts.length + " runs)");
  await shot(page, "p8-teacher-1440");
  await ctx.close();
}

console.log("2. student: only the published units are runnable, and the run works");
{
  traffic.length = 0;
  const { ctx, page } = await session("student", { width: 390, height: 844 }, { touch: true });
  await studentOpens(page);
  await tryButton(page).first().waitFor({ timeout: 20000 });
  const list = JSON.parse(traffic.find(t => t.method === "GET").got);
  const pages = Object.keys(list.blocks);
  check(list.actor === "student" && pages.length > 0 && pages.every(p => PUBLISHED.some(m => p.startsWith(m + "-"))), "the run list names only pages of m00–m04 (" + pages.length + " pages)");
  await tryButton(page).first().click();
  const region = page.getByRole("region", { name: "جرّب الكود" });
  await region.waitFor({ timeout: 15000 });
  const r = await runWith(region, null, "1834\n");
  check(r.out === "أدخل عددًا رباعي المنازل: مقبول\n", "the student's run: 1834 → «مقبول»");
  await shot(page, "p8-student-390");
  await ctx.close();
}

console.log("3. accessibility with a result on screen");
const TARGETS = () => [...document.querySelectorAll(".learning-run button, .learning-reader-code-bar button")].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.width < 44 || r.height < 44); }).map(b => b.textContent.trim() + " " + Math.round(b.getBoundingClientRect().width) + "×" + Math.round(b.getBoundingClientRect().height));
for (const v of [{ width: 390, height: 844, touch: true }, { width: 1440, height: 900, touch: false }]) {
  for (const readTheme of ["light", "dark"]) {
    const { ctx, page } = await session("teacher", { width: v.width, height: v.height }, { touch: v.touch, readTheme });
    await teacherOpens(page);
    await tryButton(page).first().click({ timeout: 20000 });
    const region = page.getByRole("region", { name: "جرّب الكود" });
    await region.waitFor({ timeout: 15000 });
    await runWith(region, book.replace("int number = int.Parse(Console.ReadLine());", "int number = int.Parse(Console.ReadLine())"), "1234\n");
    await region.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"), null, { timeout: 5000 });
    await page.evaluate(axeSource + "\n;0");
    const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map(x => x.id + " ×" + x.nodes.length + " " + x.nodes.map(n => n.target.join(" ")).join(" | ")));
    const where = "run panel " + v.width + "px " + readTheme;
    check(res.length === 0, where + ": axe WCAG 2.1 A/AA — " + (res.join(", ") || "no violation"));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(overflow <= 0, where + ": no page overflow (" + overflow + "px)");
    if (v.touch) { const small = await page.evaluate(TARGETS); check(small.length === 0, where + ": touch targets ≥ 44 px" + (small.length ? " — " + small.join("; ") : "")); }
    await shot(page, "p8-a11y-" + v.width + "-" + readTheme);
    await ctx.close();
  }
}

await browser.close(); server.close(); gateway.close();
console.log(failures.length ? "\n" + failures.length + " check(s) failed:\n  " + failures.join("\n  ") : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
