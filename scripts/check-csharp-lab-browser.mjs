#!/usr/bin/env node
// Teacher C# lab, phase V1 (docs/enterprise-csharp-visual-lab-plan.md) — the lab in the REAL site: a real Chromium on the production
// build (dist/, with the lab published into dist/csharp-lab/ by scripts/build-csharp-lab.mjs), the REAL API in process
// (browser-harness/learning-l8-api.cjs), and the static headers the site sends (public/staticwebapp.config.json, the /csharp-lab/*
// route included). NO Coding Runner exists in this run: every program below runs in the browser.
//
//   1. TEACHER on a DESKTOP (1440), book «مبنى المعطيات» (899271d): the tool bar's «محرر C#» says the code runs in this browser; the
//      lab comes up; the book's Stack<T> program prints [3,2,1]; a loop without end → «تجاوز الوقت المسموح (10 ثوانٍ)» and the next
//      run works; a compile error names the writer's line. The only server call is ONE read of the book's classes — never a run.
//   2. TEACHER on a PHONE (390, touch): no lab, no frame — the editor is the one it was (the Runner path).
//   3. STUDENT on a desktop: no lab, no frame; and the book's classes route refuses a student session.
//   4. No CSP violation in the page or the frame; no page error.
// Tools: PLAYWRIGHT_CORE_DIR (or the global `playwright`), CHROMIUM_PATH. SHOT_DIR (optional) receives screenshots.
// Exit 1 when a check fails, 2 when a tool or the build (with the lab) is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { try { ({ chromium } = require("playwright")); } catch { console.error("playwright unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); } }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
if (!fs.existsSync(path.join(dist, "csharp-lab", "_framework", "dotnet.js"))) { console.error("the build has no lab: run node scripts/build-csharp-lab.mjs, then npm run build"); process.exit(2); }

const swa = JSON.parse(fs.readFileSync(path.join(root, "public", "staticwebapp.config.json"), "utf8"));
const routeHeaders = pathname => {
  const out = { ...swa.globalHeaders };
  for (const r of swa.routes || []) {
    const hit = r.route.endsWith("/*") ? pathname.startsWith(r.route.slice(0, -1)) : pathname === r.route;
    if (hit && r.headers) Object.assign(out, r.headers);
  }
  return out;
};

require(path.join(root, "api/src/lib/observability.js")).setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const CID = "899271d";
const student = { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "سارة أحمد", code: "S1001" };
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {
  "platform/users/u1.json": student,
  "platform/classes/cA.json": { classId: "cA", name: "الصف الحادي عشر", grade: "11", status: "active", active: true, studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: [CID + "-m04"] }] },
} });
const studentToken = api.studentToken(student), teacherToken = api.teacherToken();
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json" };
const traffic = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => { const r = await api.handle(req.method, req.url, req.headers, body); traffic.push({ method: req.method, path: u.pathname, status: r.status }); res.writeHead(r.status, r.headers); res.end(r.body); });
    return;
  }
  let full = path.resolve(dist, "." + decodeURIComponent(u.pathname));
  const isFile = full.startsWith(dist + path.sep) && fs.existsSync(full) && fs.statSync(full).isFile();
  if (!isFile && u.pathname.startsWith("/csharp-lab/")) { res.writeHead(404); res.end(); return; }
  if (!isFile) full = path.join(dist, "index.html");
  res.writeHead(200, { ...routeHeaders(u.pathname), "content-type": MIME[path.extname(full)] || "application/octet-stream" });
  fs.createReadStream(full).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });

const failures = [];
const check = (ok, what) => { console.log((ok ? "  ✓ " : "  ✗ ") + what); if (!ok) failures.push(what); };
const shot = async (page, name) => { if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, name + ".png") }); };
const violations = [];
async function session(role, viewport, { touch = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  await ctx.exposeBinding("__cspViolation", (_src, v) => violations.push(role + ": " + v));
  await ctx.addInitScript(([t, r]) => {
    document.addEventListener("securitypolicyviolation", e => window.__cspViolation?.(e.violatedDirective + " " + e.blockedURI + " @" + location.pathname));
    if (location.pathname.startsWith("/csharp-lab/")) return;
    sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", r); sessionStorage.setItem("examBankSessionDisplayName", r === "student" ? "سارة أحمد" : "المعلم");
  }, [role === "student" ? studentToken : teacherToken, role]);
  const page = await ctx.newPage();
  page.on("pageerror", e => failures.push("page error (" + role + "): " + e.message));
  return { ctx, page };
}
const PAGE = CID + "-m04-l01-p01";
async function teacherOpens(page) {
  await page.goto(origin + "/#/learning/" + CID + "/read/" + PAGE);
  await page.reload();
  await page.locator(".learning-reader-page").first().waitFor({ timeout: 20000 });
}
async function studentOpens(page) {
  await page.goto(origin + "/#/s/today");
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), ["examBankReaderPosition:v1:" + student.userId, JSON.stringify({ courseId: CID, pageId: PAGE, at: new Date().toISOString() })]);
  await page.goto(origin + "/#/s/today");
  await page.reload();
  await page.getByRole("button", { name: "تابع القراءة" }).first().click({ timeout: 20000 });
  await page.locator(".learning-reader-page").first().waitFor({ timeout: 20000 });
}
async function openEditor(page) {
  await page.getByTestId("student-tools-button").click({ timeout: 20000 });
  await page.getByRole("group", { name: "الأدوات المسموحة" }).getByRole("button", { name: "محرر C#" }).click();
  const panel = page.getByRole("dialog", { name: "محرر C#" });
  await panel.getByTestId("csharp-editor-tool").waitFor({ timeout: 20000 });
  return panel;
}
async function setCode(panel, page, source) {
  const monaco = panel.locator(".monaco-editor .view-lines");
  if (await monaco.count()) {
    await monaco.first().click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Delete");
    await page.keyboard.insertText(source);
  } else {
    await panel.getByLabel("كود C#").fill(source);
  }
}
async function run(panel, page, source, timeout = 60000) {
  await setCode(panel, page, source);
  await panel.getByRole("button", { name: "تشغيل" }).click();
  const status = panel.locator(".stt-cs-status");
  await status.filter({ hasNotText: /^$|جارٍ/ }).waitFor({ timeout });
  return { status: (await status.innerText()).trim(), out: await panel.getByTestId("csharp-output").textContent().catch(() => null), err: await panel.getByTestId("csharp-errors").textContent().catch(() => null) };
}

console.log("1. teacher, desktop: the book's C# editor runs in this browser");
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  await teacherOpens(page);
  const panel = await openEditor(page);
  check(/يعمل الكود في متصفحك/.test(await panel.getByTestId("csharp-lab-note").innerText()), "the editor says the code runs in this browser");
  check(await page.locator("iframe[data-testid='csharp-lab-frame']").getAttribute("src") === "/csharp-lab/index.html", "the lab's hidden frame is made when the editor opens");
  const runButton = panel.getByRole("button", { name: "تشغيل" });
  await page.waitForFunction(() => { const b = [...document.querySelectorAll("button")].find(x => x.textContent === "تشغيل"); return b && !b.disabled; }, null, { timeout: 120000 });
  check(await runButton.isEnabled(), "the lab comes up (the run button is enabled)");
  const a = await run(panel, page, "static void Main()\n{\n    Stack<int> s = new Stack<int>();\n    for (int i = 1; i <= 3; i++) s.Push(i);\n    Console.WriteLine(s);\n}");
  check(/انتهى التشغيل بنجاح/.test(a.status) && a.out === "[3,2,1]\n", "the book's Stack<T>: [3,2,1] (" + JSON.stringify(a) + ")");
  await shot(page, "lab-teacher-1440");
  const b = await run(panel, page, "static void Main()\n{\n    while (true) { }\n}", 30000);
  check(/تجاوز الوقت المسموح \(10 ثوانٍ\)/.test(b.status), "a loop without end → «تجاوز الوقت المسموح (10 ثوانٍ)» (" + b.status + ")");
  const c = await run(panel, page, "static void Main()\n{\n    Queue<string> q = new Queue<string>();\n    q.Insert(\"a\"); q.Insert(\"b\");\n    Console.WriteLine(q.Remove() + q);\n}");
  check(c.out === "a[b]\n", "after the time-out the next program runs (a fresh worker): Queue<T> → a[b] (" + JSON.stringify(c.out) + ")");
  const d = await run(panel, page, "static void Main()\n{\n    int x = 1\n}");
  check(/خطأ ترجمة/.test(d.status) && /Program\.cs\(3,\d+\): error CS1002/.test(d.err || ""), "a missing «;» → «خطأ ترجمة» on the writer's line 3 (" + (d.err || "").slice(0, 60) + ")");
  const runs = traffic.filter(t => t.path === "/api/student-tools/csharp-run" && t.method === "POST");
  const reads = traffic.filter(t => t.path === "/api/teacher-tools/csharp-lab");
  check(runs.length === 0, "no program was sent to a server (" + runs.length + " run requests)");
  check(reads.length === 1 && reads[0].status === 200, "exactly ONE server read: the book's classes (" + JSON.stringify(reads) + ")");
  await ctx.close();
}

console.log("2. teacher, phone: no lab");
{
  const { ctx, page } = await session("teacher", { width: 390, height: 844 }, { touch: true });
  await teacherOpens(page);
  const panel = await openEditor(page);
  await page.waitForTimeout(500);
  check(await panel.getByTestId("csharp-lab-note").count() === 0, "no lab note");
  check(await page.locator("iframe[data-testid='csharp-lab-frame']").count() === 0, "no lab frame");
  await shot(page, "lab-teacher-390");
  await ctx.close();
}

console.log("3. student, desktop: no lab; the book's classes route refuses a student");
{
  const { ctx, page } = await session("student", { width: 1440, height: 900 });
  await studentOpens(page);
  const panel = await openEditor(page);
  await page.waitForTimeout(500);
  check(await panel.getByTestId("csharp-lab-note").count() === 0, "no lab note");
  check(await page.locator("iframe[data-testid='csharp-lab-frame']").count() === 0, "no lab frame");
  const r = await page.evaluate(async t => { const x = await fetch("/api/teacher-tools/csharp-lab?courseId=899271d", { headers: { Authorization: "Bearer " + t } }); return { status: x.status, body: await x.text() }; }, studentToken);
  check(r.status >= 400 && !/class Stack/.test(r.body), "GET /api/teacher-tools/csharp-lab with a student session → " + r.status + ", no classes");
  await ctx.close();
}

check(violations.length === 0, "no CSP violation (" + violations.join(" | ") + ")");
await browser.close();
server.close();
console.log(failures.length ? "\nFAILED:\n- " + failures.join("\n- ") : "\nCSHARP LAB BROWSER PASS");
process.exit(failures.length ? 1 : 0);
