#!/usr/bin/env node
// Teacher C# lab (AGENTS.md §1; docs/enterprise-csharp-visual-lab-plan.md §9) — the lab in the REAL site: a real Chromium on the
// production build (dist/, with the lab published into public/csharp-lab/ as the deploy job does), the REAL API in process
// (browser-harness/learning-l8-api.cjs), and the static headers the site sends (public/staticwebapp.config.json, the /csharp-lab/*
// route included). NO Coding Runner exists in this run: every program below runs in the browser.
//
//   1. TEACHER on a DESKTOP (1440), book «مبنى المعطيات» (899271d): the tool bar's «محرر C#» says it runs on this computer; the first
//      run makes the sandboxed lab; the book's Stack<T> program prints [3,2,1]; a loop without end → a time-out and the next run works;
//      a recursion without end → a runtime error, and the next run works; a compile error names the writer's line. The only server
//      call is ONE read of the book's classes — never a run.
//   2. TEACHER on a PHONE (390, touch): no lab, no frame — the editor is the one it was (the Runner path).
//   3. STUDENT on a desktop (owner decision, #700: every reader of a book whose editor may run): the editor runs on this computer too —
//      the book's Stack<T> prints [3,2,1], no program reaches a server, ONE read of the book's classes with the STUDENT's session.
//   3b. STUDENT on a PHONE: no lab, no frame (desktop only, as for the teacher).
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
if (!fs.existsSync(path.join(dist, "csharp-lab", "_framework", "dotnet.js"))) { console.error("the build has no lab: publish tools/csharp-lab into public/csharp-lab (as the deploy job does), then npm run build"); process.exit(2); }

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
// Visual lab V7: a second class whose teacher turned «تشغيل مرئي» on for the book (the class's book tools, as the teacher saves them)
const student2 = { userId: "u2", role: "student", active: true, archived: false, authVersion: 1, classId: "cB", displayName: "عمر خالد", code: "S1002" };
const VISUAL_TOOLS = { version: 1, tools: [{ id: "csharpEditor", allowRun: true, allowVisual: true }] };
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {
  "platform/users/u1.json": student,
  "platform/classes/cA.json": { classId: "cA", name: "الصف الحادي عشر", grade: "11", status: "active", active: true, studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: [CID + "-m04"] }] },
  "platform/users/u2.json": student2,
  "platform/classes/cB.json": { classId: "cB", name: "الصف الحادي عشر ب", grade: "11", status: "active", active: true, studentIds: ["u2"], learningMaterials: [{ courseId: CID, visibleModuleIds: [CID + "-m04"], studentTools: VISUAL_TOOLS }] },
} });
const studentToken = api.studentToken(student), teacherToken = api.teacherToken(), student2Token = api.studentToken(student2);
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json" };
const traffic = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => { const r = await api.handle(req.method, req.url, req.headers, body); traffic.push({ method: req.method, path: u.pathname, query: u.searchParams.toString(), status: r.status }); res.writeHead(r.status, r.headers); res.end(r.body); });
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
/** One element (scrolled into view) — the player's drawing sits below the editor. */
const shotOf = async (locator, name) => { if (process.env.SHOT_DIR) await locator.screenshot({ path: path.join(process.env.SHOT_DIR, name + ".png") }); };
const violations = [];
async function session(role, viewport, { touch = false, token } = {}) {
  // The site's own service worker is ALLOWED (as in production): Playwright's «block» option injects a script into every frame, and
  // that script throws inside the lab's sandboxed (opaque-origin) frame — a harness artifact, not the site's behaviour.
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "allow", locale: "ar" });
  await ctx.exposeBinding("__cspViolation", (_src, v) => violations.push(role + ": " + v));
  await ctx.addInitScript(([t, r]) => {
    document.addEventListener("securitypolicyviolation", e => window.__cspViolation?.(e.violatedDirective + " " + e.blockedURI + " @" + location.pathname));
    if (window.top !== window) return;   // the session belongs to the page only — never to a frame (the lab's sandboxed frame has no storage)
    sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", r); sessionStorage.setItem("examBankSessionDisplayName", r === "student" ? "سارة أحمد" : "المعلم");
  }, [token || (role === "student" ? studentToken : teacherToken), role]);
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
async function studentOpens(page, who = student) {
  await page.goto(origin + "/#/s/today");
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), ["examBankReaderPosition:v1:" + who.userId, JSON.stringify({ courseId: CID, pageId: PAGE, at: new Date().toISOString() })]);
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
  // V15: after a visual run the program is folded to one line; open it to write the next program
  const fold = panel.getByTestId("csharp-editor-fold");
  if (await fold.count() && await fold.getAttribute("aria-expanded") === "false") await fold.click();
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
  await panel.getByRole("button", { name: "تشغيل", exact: true }).click();
  const status = panel.locator(".stt-cs-status");
  await status.filter({ hasNotText: /^$|جارٍ/ }).waitFor({ timeout });
  return { status: (await status.innerText()).trim(), out: await panel.getByTestId("csharp-output").textContent().catch(() => null), err: await panel.getByTestId("csharp-errors").textContent().catch(() => null) };
}

/** Visual lab V15 (plan §25): the player's navigation (from the start, previous / next, auto-play, speed, the step, its slider, the
 *  player's note) is docked in the editor's sticky strip, above the drawing — not inside «csharp-trace». */
const nav = panel => panel.getByTestId("csharp-run-strip").getByTestId("lab-trace-nav");
/** Visual lab V3: «تشغيل مرئي» — the program recorded step by step on this device and drawn by the course's trace view. */
async function visual(panel, page, source, timeout = 60000) {
  await setCode(panel, page, source);
  await panel.getByRole("button", { name: "تشغيل مرئي", exact: true }).click();
  const status = panel.locator(".stt-cs-status");
  await status.filter({ hasNotText: /^$|جارٍ/ }).waitFor({ timeout });
  const view = panel.getByTestId("csharp-trace");
  await view.waitFor({ timeout: 20000 });
  const counter = async () => (await nav(panel).locator(".learning-trace-counter").innerText()).replace(/\s+/g, " ").trim();
  const total = Number((await counter()).split("/")[1]);
  for (let i = 1; i < total; i++) await nav(panel).getByRole("button", { name: "الخطوة التالية" }).click();
  return { status: (await status.innerText()).trim(), total, last: await counter(), stack: await view.locator(".learning-ds-structures").innerText().catch(() => ""), out: await view.getByRole("region", { name: "الناتج حتى الآن" }).textContent() };
}

console.log("1. teacher, desktop: the book's C# editor runs on this computer");
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  await teacherOpens(page);
  const panel = await openEditor(page);
  check(/يعمل على جهازك/.test(await panel.getByTestId("csharp-on-device").innerText()), "the editor says the code runs on this computer");
  check(await page.locator("iframe[data-testid='teacher-csharp-lab']").count() === 0, "opening the editor downloads nothing (no lab frame yet)");
  const a = await run(panel, page, "static void Main()\n{\n    Stack<int> s = new Stack<int>();\n    for (int i = 1; i <= 3; i++) s.Push(i);\n    Console.WriteLine(s);\n}", 180000);
  check(/انتهى التشغيل بنجاح/.test(a.status) && a.out === "[3,2,1]\n", "the book's Stack<T>: [3,2,1] (" + JSON.stringify(a) + ")");
  const frame = page.locator("iframe[data-testid='teacher-csharp-lab']");
  check(await frame.getAttribute("src") === "/csharp-lab/index.html" && await frame.getAttribute("sandbox") === "allow-scripts", "the first run made ONE sandboxed lab frame (allow-scripts only)");
  await shot(page, "lab-teacher-1440");
  const b = await run(panel, page, "static void Main()\n{\n    while (true) { }\n}", 60000);
  check(/تجاوز الوقت المسموح/.test(b.status), "a loop without end → «تجاوز الوقت المسموح» (" + b.status + ")");
  const c = await run(panel, page, "static void Main()\n{\n    Queue<string> q = new Queue<string>();\n    q.Insert(\"a\"); q.Insert(\"b\");\n    Console.WriteLine(q.Remove() + q);\n}", 60000);
  check(c.out === "a[b]\n", "after the time-out the next program runs: Queue<T> → a[b] (" + JSON.stringify(c.out) + ")");
  const d = await run(panel, page, "static int F(int n)\n{\n    return F(n + 1) + 1;\n}\nstatic void Main()\n{\n    Console.WriteLine(F(0));\n}", 60000);
  check(/خطأ أثناء التشغيل/.test(d.status) && /Stack overflow/.test(d.err || ""), "a recursion without end → «خطأ أثناء التشغيل» naming a stack overflow (" + d.status + " / " + (d.err || "").slice(0, 60) + ")");
  const e = await run(panel, page, "static void Main()\n{\n    Console.WriteLine(\"back\");\n}", 60000);
  check(e.out === "back\n", "after the stack overflow the next program runs (" + JSON.stringify(e) + ")");
  const f = await run(panel, page, "static void Main()\n{\n    int x = 1\n}", 60000);
  check(/خطأ ترجمة/.test(f.status) && /Program\.cs\(3,\d+\): error CS1002/.test(f.err || ""), "a missing «;» → «خطأ ترجمة» on the writer's line 3 (" + (f.err || "").slice(0, 60) + ")");
  // Visual lab V3 — the teacher's «تشغيل مرئي»: the book's Stack<T> program recorded on this device and drawn step by step
  const v = await visual(panel, page, "static void Main()\n{\n    Stack<int> s = new Stack<int>();\n    for (int i = 1; i <= 3; i++) s.Push(i);\n    Console.WriteLine(s);\n}");
  check(/سُجّل التنفيذ خطوة خطوة/.test(v.status) && v.total >= 10, "«تشغيل مرئي»: the run is recorded step by step (" + v.total + " steps, «" + v.status.slice(0, 40) + "»)");
  check(v.last === "الخطوة " + v.total + " / " + v.total + "" || v.last.endsWith(v.total + " / " + v.total), "the steps can be walked to the last one (" + v.last + ")");
  check(/3[\s\S]*2[\s\S]*1/.test(v.stack) && v.out === "[3,2,1]\n", "the last step draws the stack 3 2 1 and the output so far is [3,2,1] (" + JSON.stringify({ stack: v.stack.slice(0, 80), out: v.out }) + ")");
  await shot(page, "lab-teacher-visual-1440");
  // Visual lab V15 — the program folded to one line, the navigation in the sticky strip with «تشغيل»; the fold opens it again
  const fold = panel.getByTestId("csharp-editor-fold");
  check(await panel.getByTestId("csharp-editor-program").isHidden() && await fold.getAttribute("aria-expanded") === "false"
    && await panel.getByTestId("csharp-run-strip").getByRole("button", { name: "تشغيل", exact: true }).count() === 1
    && await panel.getByTestId("csharp-run-strip").evaluate(e => getComputedStyle(e).position) === "sticky",
    "V15: after «تشغيل مرئي» the program is folded and the run buttons with the steps' navigation form one sticky strip");
  await fold.click();
  check(await panel.getByTestId("csharp-editor-program").isVisible() && await fold.getAttribute("aria-expanded") === "true", "V15: «البرنامج» opens the program again");
  await fold.click();
  // Visual lab V4 — the player: a breakpoint on line 5 (Console.WriteLine), auto-play from the start stops AT it; «توسيع»
  const tv = panel.getByTestId("csharp-trace");
  await nav(panel).getByRole("button", { name: "من البداية" }).click();
  await tv.getByRole("button", { name: "نقطة توقّف على السطر 5" }).click();
  check(await tv.getByRole("button", { name: "نقطة توقّف على السطر 5" }).getAttribute("aria-pressed") === "true", "V4: a click on line number 5 sets a breakpoint");
  await nav(panel).getByLabel("السرعة").selectOption("fast");
  await nav(panel).getByRole("button", { name: "▶ تشغيل تلقائي" }).click();
  await nav(panel).getByText("توقف عند نقطة التوقف على السطر 5.").waitFor({ timeout: 30000 });
  const stopAt = (await nav(panel).locator(".learning-trace-counter").innerText()).replace(/\s+/g, " ").trim();
  const playLabel = await nav(panel).locator(".learning-trace-btn.is-play").innerText();
  check(/▶/.test(playLabel) && stopAt !== "الخطوة " + v.total + " / " + v.total && (await tv.locator(".learning-trace-line.is-current .learning-trace-linecode").innerText()).includes("Console.WriteLine"),
    "V4: auto-play stopped AT the breakpoint, on the Console.WriteLine line (" + stopAt + ")");
  await tv.getByRole("button", { name: "توسيع" }).click();
  const wide = page.getByRole("dialog", { name: "التشغيل المرئي" });
  await wide.getByTestId("csharp-trace-wide").waitFor({ timeout: 10000 });
  const wideCounter = (await wide.locator(".learning-trace-counter").innerText()).replace(/\s+/g, " ").trim();
  const box = await wide.boundingBox();
  check(wideCounter === stopAt && box && box.width > 1000, "V4: «توسيع» shows the same step in a wide window (" + wideCounter + ", " + Math.round(box?.width || 0) + " px)");
  await page.waitForTimeout(800);   // the window's opening transition, before the screenshot
  await shot(page, "lab-teacher-visual-wide-1440");
  await wide.getByRole("button", { name: "إغلاق" }).click();
  await panel.getByTestId("csharp-trace").waitFor({ timeout: 10000 });
  // Visual lab V4 part 2 — Viz.Show / Viz.Pause in the program, «اكشف الداخل» (the book's Stack<T> as its Node<T> chain), «توقّع قبل أن ترى»
  await visual(panel, page, "static void Main()\n{\n    Stack<int> s = new Stack<int>();\n    s.Push(1); s.Push(2);\n    Viz.Show(\"بعد الإدخال\");\n    Viz.Pause(\"قبل الطباعة\");\n    Console.WriteLine(s);\n}");
  const pv = panel.getByTestId("csharp-trace");
  await nav(panel).getByRole("button", { name: "من البداية" }).click();
  await nav(panel).getByLabel("السرعة").selectOption("fast");
  await nav(panel).getByRole("button", { name: "▶ تشغيل تلقائي" }).click();
  await nav(panel).getByText("توقف عند Viz.Pause على السطر 6.").waitFor({ timeout: 30000 });
  const pauseLine = await pv.locator(".learning-trace-line.is-current .learning-trace-linecode").innerText();
  check(pauseLine.includes("Viz.Pause") && /قبل الطباعة/.test(await pv.locator(".learning-trace-note").first().innerText()),
    "V4b: auto-play stopped AT Viz.Pause (line 6), its reason shown");
  await nav(panel).getByRole("button", { name: "الخطوة السابقة" }).click();
  check(/بعد الإدخال/.test(await pv.locator(".learning-trace-note").first().innerText()), "V4b: Viz.Show titles its step («بعد الإدخال»)");
  await pv.getByLabel(/اكشف الداخل/).check();
  await nav(panel).getByText(/معروضان من الداخل/).waitFor({ timeout: 60000 });
  const heap = await pv.getByRole("region", { name: "الكائنات" }).innerText().catch(() => "");
  check(/Stack/.test(heap) && /Head/.test(heap), "V4b: «اكشف الداخل» re-records: the Stack is an object with its Head (" + heap.replace(/\s+/g, " ").slice(0, 80) + ")");
  check(await pv.locator(".learning-ds-structures svg").count() > 0, "V4b: … and its Node chain is drawn");
  await shotOf(pv, "lab-teacher-visual-inside-1440");
  await pv.getByLabel(/اكشف الداخل/).uncheck();
  await nav(panel).getByText(/رسمهما المعتاد/).waitFor({ timeout: 60000 });
  await pv.getByLabel(/توقّع قبل أن ترى/).check();
  await nav(panel).getByRole("button", { name: "من البداية" }).click();
  await nav(panel).getByRole("button", { name: "▶ تشغيل تلقائي" }).click();
  await pv.getByTestId("lab-trace-guess").waitFor({ timeout: 30000 });
  check(await pv.locator(".learning-ds-structures svg").count() === 0, "V4b: «توقّع قبل أن ترى»: auto-play halts at a covered step, nothing drawn");
  await shotOf(pv, "lab-teacher-visual-guess-1440");
  await pv.getByTestId("lab-trace-guess").getByRole("button", { name: "اكشف" }).click();
  check(await pv.locator(".learning-ds-structures svg").count() > 0, "V4b: «اكشف» draws the structures of that step");
  // Visual lab V5 — rich types: an array with the index variable i pointing at its cell; a Queue of the writer's Students (each item
  // refers to its Student object); a Stack of Queues (each item refers to its queue, drawn and named «#id»)
  await visual(panel, page, "class Student { public string Name; public int Grade; public Student(string n, int g) { Name = n; Grade = g; } }\nclass Program\n{\n    static void Main()\n    {\n        int[] a = { 5, 3, 8 };\n        for (int i = 0; i < a.Length; i++) a[i] = a[i] * 2;\n        Queue<Student> q = new Queue<Student>();\n        q.Insert(new Student(\"Ali\", 92));\n        Stack<Queue<int>> s = new Stack<Queue<int>>();\n        Queue<int> one = new Queue<int>(); one.Insert(1);\n        s.Push(one);\n        Console.WriteLine(a[2]);\n    }\n}");
  const rv = panel.getByTestId("csharp-trace");
  await nav(panel).getByRole("button", { name: "من البداية" }).click();
  let sawMark = false;
  for (let k = 0; k < 12 && !sawMark; k++) {
    sawMark = await rv.getByRole("img", { name: /^المصفوفة a \(int\[\]\): .*، i = 1$/ }).count() > 0;
    if (!sawMark) await nav(panel).getByRole("button", { name: "الخطوة التالية" }).click();
  }
  check(sawMark, "V5: the array a (int[]) is drawn with its indices, and i points at its cell");
  if (sawMark) await shotOf(rv, "lab-teacher-visual-array-1440");
  const total5 = Number((await nav(panel).locator(".learning-trace-counter").innerText()).replace(/\s+/g, " ").split("/")[1]);
  await nav(panel).getByRole("slider", { name: "انتقل إلى الخطوة" }).fill(String(total5)).catch(async () => { for (let k = 0; k < total5; k++) await nav(panel).getByRole("button", { name: "الخطوة التالية" }).click().catch(() => {}); });
  const structures5 = await rv.locator(".learning-ds-structures").innerText();
  const heap5 = await rv.getByRole("region", { name: "الكائنات" }).innerText().catch(() => "");
  const imgs5 = await rv.locator(".learning-ds-structures [role=img]").evaluateAll(els => els.map(e => e.getAttribute("aria-label")));
  check(/\(Ali, 92\) →#\d+/.test(structures5) && /Student/.test(heap5) && /Ali/.test(heap5),
    "V5: Queue<Student>: the item «(Ali, 92) →#id» refers to the Student object, drawn with its fields (" + heap5.replace(/\s+/g, " ").slice(0, 60) + ")");
  check(/\[1\] →#\d+/.test(structures5) && imgs5.some(l => /^الدور [^:]*#\d+: من الرأس إلى النهاية: 1$/.test(l || "")),
    "V5: Stack<Queue<int>>: the item «[1] →#id» refers to its queue, drawn and named #id (" + imgs5.filter(Boolean).map(l => l.slice(0, 40)).join(" | ") + ")");
  check(imgs5.some(l => /^المصفوفة a \(int\[\]\): 0: 10، 1: 6، 2: 16/.test(l || "")), "V5: at the end the array is 10 6 16 (changed in place)");
  await shotOf(rv, "lab-teacher-visual-rich-1440");
  // Visual lab V8 — «شجرة الاستدعاءات»: a recursion (Fib(4)) drawn as its whole call tree, each finished call with what it returned
  await visual(panel, page, "static int Fib(int n)\n{\n    if (n < 2) return n;\n    return Fib(n - 1) + Fib(n - 2);\n}\nstatic void Main()\n{\n    Console.WriteLine(Fib(4));\n}");
  const ct = panel.getByTestId("csharp-trace");
  await ct.getByLabel(/شجرة الاستدعاءات/).check();
  const tree = ct.getByTestId("lab-call-tree");
  await tree.waitFor({ timeout: 10000 });
  const treeLabel = await tree.getByRole("img").getAttribute("aria-label");
  check(await tree.locator(".lab-call").count() === 10 && /Fib\(4\) أعاد 3/.test(treeLabel || ""), "V8: the call tree of Fib(4): Main and 9 calls, Fib(4) returned 3 (" + (treeLabel || "").slice(0, 90) + ")");
  await shotOf(ct, "lab-teacher-visual-calltree-1440");
  // Visual lab V9 — «أسس علم الحاسوب»: n % 10 / n / 10 noted with their values, n in place-value boxes, the types; then a 2D grid
  await visual(panel, page, "static void Main()\n{\n    int n = 352, sum = 0;\n    while (n > 0 && sum < 100)\n    {\n        sum = sum + n % 10;\n        n = n / 10;\n    }\n    Console.WriteLine(sum);\n}");
  const dv = panel.getByTestId("csharp-trace");
  await nav(panel).getByRole("button", { name: "من البداية" }).click();
  let sawDigit = false, sawEvals = "";
  for (let k = 0; k < 10 && !sawDigit; k++) {
    await nav(panel).getByRole("button", { name: "الخطوة التالية" }).click();
    sawDigit = await dv.getByRole("img", { name: /^منازل n = 352 في الأساس 10: .*أُخذ الآن الرقم الأخير 2$/ }).count() > 0;
    if (sawDigit) sawEvals = await dv.getByRole("region", { name: "قيم التعابير في هذه الخطوة" }).innerText().catch(() => "");
  }
  check(sawDigit && /n % 10 → 2/.test(sawEvals), "V9: n = 352 drawn in place values, its last digit lit as n % 10 → 2 is noted (" + sawEvals.replace(/\s+/g, " ").slice(0, 80) + ")");
  const typeTags = await dv.locator(".lab-var-type").allInnerTexts();
  check(typeTags.includes("int"), "V9: each variable shows its type (" + typeTags.join(",") + ")");
  await shotOf(dv, "lab-teacher-visual-digits-1440");
  await visual(panel, page, "static void Main()\n{\n    int[,] g = new int[2, 3];\n    for (int i = 0; i < 2; i++)\n        for (int j = 0; j < 3; j++)\n            g[i, j] = i + j;\n    Console.WriteLine(g[1, 2]);\n}");
  const gv = panel.getByTestId("csharp-trace");
  const gridImgs = await gv.locator(".learning-ds-structures [role=img]").evaluateAll(els => els.map(e => e.getAttribute("aria-label")));
  check(gridImgs.some(l => /^المصفوفة الثنائية g \(int\[,\]\): الصف 0: 0، 1، 2؛ الصف 1: 1، 2، 3/.test(l || "")), "V9: int[,] drawn as a grid (" + gridImgs.filter(Boolean).map(l => l.slice(0, 60)).join(" | ") + ")");
  await shotOf(gv, "lab-teacher-visual-grid-1440");
  // Visual lab V10 — the object diagram: Person[] → Persons, a Person holding an Address and an int[], one Address shared by two, a
  // Student with its base's fields; the field that changed in a step lit; then objects that refer to each other (no stack overflow)
  await visual(panel, page, "class Address { public string City; public Address(string c) { City = c; } }\nclass Person\n{\n    public string Name;\n    public int Age;\n    public Address Home;\n    public int[] Marks;\n    public Person(string n, int a) { Name = n; Age = a; Marks = new int[3]; }\n}\nclass Student : Person { public Person Friend; public Student(string n, int a) : base(n, a) { } }\nclass Program\n{\n    static void Main()\n    {\n        Person[] people = new Person[2];\n        people[0] = new Person(\"Ali\", 20);\n        people[0].Home = new Address(\"Haifa\");\n        people[1] = new Student(\"Sara\", 22);\n        people[1].Home = people[0].Home;\n        ((Student)people[1]).Friend = people[0];\n        people[0].Marks[1] = 90;\n        people[1].Age = 23;\n        Console.WriteLine(people[1].Home.City);\n    }\n}");
  const ov = panel.getByTestId("csharp-trace");
  const diagramOf = async () => (await ov.getByRole("region", { name: "الكائنات" }).getByRole("img").getAttribute("aria-label").catch(() => "")) || "";
  const endDiagram = await diagramOf();
  check(/^مخطّط الكائنات\. people يشير إلى Person\[\] #\d+\./.test(endDiagram) && /Student #(\d+): Name = "Sara"، Age = 23، Home → Address #(\d+)، Marks → int\[\] #\d+، Friend → Person #\d+\./.test(endDiagram)
    && (endDiagram.match(/Home → Address #\d+/g) || []).length === 2 && new Set(endDiagram.match(/Home → Address #\d+/g)).size === 1,
    "V10: the object diagram: people → Person[] → Ali, Sara (a Student with its base's fields), ONE Address shared by both (" + endDiagram.slice(0, 120) + "…)");
  const rowImgs = await ov.locator(".learning-ds-structures [role=img]").evaluateAll(els => els.map(e => e.getAttribute("aria-label") || ""));
  check(!rowImgs.some(l => l.startsWith("المصفوفة people")), "V10: Person[] is drawn in the diagram, not a second time as a row");
  await nav(panel).getByRole("button", { name: "من البداية" }).click();
  let litAge = false;
  for (let k = 0; k < 40 && !litAge; k++) {
    await nav(panel).getByRole("button", { name: "الخطوة التالية" }).click();
    const dg = await diagramOf();
    litAge = /Student #\d+: Name = "Sara"، Age = 23،/.test(dg) && /تغيّر في هذه الخطوة: Student #\d+\.Age\.$/.test(dg);
  }
  const lit = await ov.locator(".lab-og-row.is-changed + .lab-og-key").allTextContents();
  check(litAge && lit.join() === "Age", "V10: on «people[1].Age = 23» the Student's Age is lit, and only it (" + lit.join() + ")");
  await shotOf(ov.getByRole("region", { name: "الكائنات" }), "lab-teacher-visual-objects-1440");
  // Visual lab V13 — the layout: no two boxes overlap; «حفظ صورة»: a real PNG (signature, twice the drawing's width) named by the step
  const boxRects = await ov.locator("rect.lab-og-box").evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
  const overlap = boxRects.some((a, i) => boxRects.some((b, j) => j > i && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]));
  check(boxRects.length >= 5 && !overlap, "V13: the object diagram's " + boxRects.length + " boxes never overlap");
  const svgW = await ov.getByRole("region", { name: "الكائنات" }).locator("svg").evaluate(s => s.viewBox.baseVal.width);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), ov.getByRole("region", { name: "الكائنات" }).getByRole("button", { name: "حفظ صورة" }).click()]);
  const png = fs.readFileSync(await dl.path());
  const pngW = png.length > 24 ? png.readUInt32BE(16) : 0;
  check(/^objects-step-\d+\.png$/.test(dl.suggestedFilename()) && png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && pngW === Math.round(svgW * 2) && png.length > 4000,
    "V13: «حفظ صورة» saves " + dl.suggestedFilename() + " — a PNG " + pngW + " px wide (twice the drawing), " + png.length + " bytes");
  if (process.env.SHOT_DIR) fs.writeFileSync(path.join(process.env.SHOT_DIR, "lab-teacher-saved-objects.png"), png);
  const cyc = await visual(panel, page, "class Pal { public string Name; public Pal Other; public Pal(string n) { Name = n; } }\nclass Program\n{\n    static void Main()\n    {\n        Pal a = new Pal(\"A\");\n        Pal b = new Pal(\"B\");\n        a.Other = b;\n        b.Other = a;\n        Console.WriteLine(a.Other.Other.Name);\n    }\n}");
  const cycDiagram = await diagramOf();
  check(/سُجّل التنفيذ خطوة خطوة/.test(cyc.status) && cyc.out === "A\n" && /Pal #(\d+): Name = "A"، Other → Pal #(\d+)\. Pal #\2: Name = "B"، Other → Pal #\1\./.test(cycDiagram),
    "V10: objects that refer to each other are recorded and drawn (no stack overflow): " + cycDiagram.slice(0, 100));
  // Visual lab V11 — structs as boxes of their fields (q = p copies), the static fields of each type («الحقول الثابتة»), a static
  // constructor never run early (its type's statics appear once it ran), a struct inside an object as its rows, a static's arrow
  const st = await visual(panel, page, "struct Point { public int X; public int Y; public Point(int x, int y) { X = x; Y = y; } }\nclass Shape { public string Name = \"box\"; public Point Pos; }\nclass Counter\n{\n    public static int Made;\n    public static List<Shape> All = new List<Shape>();\n    static Counter() { Console.WriteLine(\"init\"); }\n    public static void Add(Shape s) { Made++; All.Add(s); }\n}\nclass Program\n{\n    static int total = 5;\n    static void Main()\n    {\n        Console.WriteLine(\"start\");\n        Point p = new Point(1, 2);\n        Point q = p;\n        q.X = 9;\n        Shape s = new Shape();\n        s.Pos = q;\n        Counter.Add(s);\n        total = total + Counter.Made;\n        Console.WriteLine(p.X + \" \" + q.X + \" \" + total);\n    }\n}");
  const sv = panel.getByTestId("csharp-trace");
  const memory = sv.getByRole("region", { name: "المتغيّرات" });
  const statics = (await memory.locator(".lab-statics .learning-trace-framename").allInnerTexts()).map(x => x.replace(/\s+/g, " ").trim());
  const fieldsOf = async n => (await memory.locator(".learning-trace-var").filter({ has: page.locator(".learning-trace-name", { hasText: new RegExp("^" + n + "$") }) }).first().locator(".lab-rec-field").allInnerTexts()).map(x => x.replace(/\s+/g, ""));
  check(st.out === "start\ninit\n1 9 6\n" && statics.join("|") === "Program — الحقول الثابتة|Counter — الحقول الثابتة" && (await fieldsOf("p")).join() === "X1,Y2" && (await fieldsOf("q")).join() === "X9,Y2",
    "V11: p and q are boxes of their fields (q = p copied: p.X 1, q.X 9); «الحقول الثابتة» of Program and Counter; output as «تشغيل» (" + JSON.stringify({ out: st.out, statics }) + ")");
  const stDiagram = (await sv.getByRole("region", { name: "الكائنات" }).getByRole("img").getAttribute("aria-label").catch(() => "")) || "";
  check(/Shape #\d+: Name = "box"، Pos\.X = 9، Pos\.Y = 2\./.test(stDiagram) && /Counter\.All يشير إلى List<Shape> #\d+\./.test(stDiagram),
    "V11: in the diagram the struct is the Shape's own rows (Pos.X, Pos.Y), and the static Counter.All has its arrow (" + stDiagram.slice(0, 120) + "…)");
  await nav(panel).getByRole("button", { name: "من البداية" }).click();
  let litX = false, counterEarly = false;
  for (let k = 0; k < 30 && !litX; k++) {
    await nav(panel).getByRole("button", { name: "الخطوة التالية" }).click();
    counterEarly = counterEarly || (!(await sv.getByRole("region", { name: "الناتج حتى الآن" }).textContent()).includes("init") && await memory.locator(".lab-statics").filter({ hasText: "Counter" }).count() > 0);
    litX = (await memory.locator(".lab-rec-field.is-changed").allInnerTexts()).map(x => x.replace(/\s+/g, "")).join() === "X9";
  }
  check(litX && !counterEarly, "V11: on «q.X = 9» only q's X is lit; Counter's statics never shown before its static constructor printed «init»");
  await shotOf(memory, "lab-teacher-visual-structs-1440");
  // Visual lab V12 — «العمليات والدوال»: the running methods drawn; Max(a, 5) — x a copy of a; Swap(ref a, ref b) — the caller's very
  // variables (two solid arrows); a value returned going back to Main
  const fl = await visual(panel, page, "class Program\n{\n    static int Max(int x, int y)\n    {\n        if (x > y) return x;\n        return y;\n    }\n    static void Swap(ref int a, ref int b)\n    {\n        int t = a;\n        a = b;\n        b = t;\n    }\n    static void Split(int n, out int tens, out int ones)\n    {\n        tens = n / 10;\n        ones = n % 10;\n    }\n    static int Fact(int n)\n    {\n        if (n <= 1) return 1;\n        return n * Fact(n - 1);\n    }\n    static void Main()\n    {\n        int a = 3, b = 7;\n        int m = Max(a, 5);\n        Swap(ref a, ref b);\n        Split(42, out int t, out var o);\n        int f = Fact(3);\n        Console.WriteLine(m + \" \" + a + \" \" + b + \" \" + t + o + \" \" + f);\n    }\n}");
  const fv = panel.getByTestId("csharp-trace");
  const flowOf = async () => (await fv.getByRole("region", { name: "الاستدعاءات" }).getByRole("img").getAttribute("aria-label", { timeout: 500 }).catch(() => "")) || "";
  await nav(panel).getByRole("button", { name: "من البداية" }).click();
  let sawCopy = "", sawRef = "", sawReturn = "", aliases = 0;
  for (let k = 0; k < 40 && !(sawCopy && sawRef && sawReturn); k++) {
    await nav(panel).getByRole("button", { name: "الخطوة التالية" }).click();
    const f = await flowOf();
    if (!sawCopy && /Max \(تعمل الآن\)، استُدعيت من السطر 27: Max\(a, 5\): x = 3 \(نسخة من a\)، y = 5 \(نسخة من 5\)/.test(f)) sawCopy = f;
    if (!sawRef && /Swap \(تعمل الآن\)، استُدعيت من السطر 28: Swap\(ref a, ref b\): a = \d+ \(هو a في Main، ref\)، b = \d+ \(هو b في Main، ref\)/.test(f)) {
      sawRef = f;
      aliases = await fv.locator("path.lab-flow-link.is-alias:not(.learning-ds-head)").count();
      await shotOf(fv.getByRole("region", { name: "الاستدعاءات" }), "lab-teacher-visual-calls-1440");
    }
    if (!sawReturn && /Max تُعيد 5 إلى Main\./.test(f)) sawReturn = f;
  }
  check(fl.out === "5 7 3 42 6\n" && !!sawCopy, "V12: Max(a, 5) drawn — x a copy of a, y = 5, called from line 27 (" + sawCopy.slice(0, 90) + "…)");
  check(!!sawRef && aliases === 2, "V12: Swap(ref a, ref b) — each parameter IS Main's variable, two solid arrows (" + aliases + ")");
  check(!!sawReturn, "V12: on its return, Max gives 5 back to Main");
  // Phase E1 — «ملء الشاشة»: the editor's panel fills the screen (the program, its output and the steps it shows stay); Escape leaves.
  // First, the fix it needed: a panel grown by a long recorded run kept its header under the app's top bar (✕ and the toggle unreachable)
  const headTop = (await panel.locator(".stt-panel-head").boundingBox())?.y ?? -1;
  const barBottom = await page.evaluate(() => { const b = document.querySelector(".eb-topbar")?.getBoundingClientRect(); return b ? b.bottom : 0; });
  check(headTop >= barBottom, "E1: the grown C# panel keeps its header below the app's top bar (header at " + Math.round(headTop) + " px, bar ends at " + Math.round(barBottom) + ")");
  await panel.getByRole("button", { name: "ملء الشاشة" }).click();
  const fullBox = await panel.boundingBox();
  const keptTrace = await panel.getByTestId("csharp-trace").count();
  const scrollLocked = await page.evaluate(() => document.body.style.overflow === "hidden");
  check(!!fullBox && fullBox.width >= 1440 * 0.99 && fullBox.height >= 900 * 0.99 && keptTrace === 1 && scrollLocked,
    "E1: «ملء الشاشة» — the C# editor fills the screen (" + Math.round(fullBox?.width || 0) + "×" + Math.round(fullBox?.height || 0) + "), its recorded run still shown, the page behind locked");
  await shotOf(panel, "lab-teacher-editor-fullscreen-1440");
  await panel.getByRole("button", { name: "الخروج من ملء الشاشة" }).focus();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".stt-panel.is-fullscreen"), null, { timeout: 5000 }).catch(() => {});
  const backBox = await panel.boundingBox();
  check(await panel.isVisible() && !!backBox && backBox.width < 1000 && await panel.getByTestId("csharp-trace").count() === 1,
    "E1: Escape leaves full screen — the panel is back in its place (" + Math.round(backBox?.width || 0) + " px wide), still open, its run kept");
  const runs = traffic.filter(t => t.path === "/api/student-tools/csharp-run" && t.method === "POST");
  const reads = traffic.filter(t => t.path === "/api/student-tools/csharp-run" && t.method === "GET");
  check(runs.length === 0, "no program was sent to a server (" + runs.length + " run requests)");
  check(reads.length === 1 && reads[0].status === 200 && reads[0].query === "library=899271d", "exactly ONE server read: the book's classes (" + JSON.stringify(reads) + ")");
  // Visual lab V6 — the trimmed lab: a program that needs a library its download leaves out (System.Xml) is refused BEFORE it runs
  // (LAB0001, naming the type) and the book editor asks the Runner instead; here there is no Runner (the server says so), so the lab's
  // own answer stands — a compile error that says why, never a run that fails half-way, and the editor stays usable
  const x = await run(panel, page, "using System.Xml;\nclass P\n{\n    static void Main()\n    {\n        Console.WriteLine(new XmlDocument().Name);\n    }\n}", 60000);
  const asked = traffic.filter(t => t.path === "/api/student-tools/csharp-run" && t.method === "POST");
  check(/خطأ ترجمة/.test(x.status) && /LAB0001: 'System\.Xml\.XmlDocument'/.test(x.err || ""), "V6: a program needing a left-out library (System.Xml) is refused before it runs, naming the type (" + (x.err || "").slice(0, 80) + ")");
  check(asked.length === 1 && asked[0].status !== 200, "V6: the book editor asked the Runner once for it; with no Runner here the lab's answer stood (" + JSON.stringify(asked.map(a => a.status)) + ")");
  const y = await run(panel, page, "static void Main()\n{\n    Console.WriteLine(System.Text.RegularExpressions.Regex.IsMatch(\"a1\", @\"\\d\"));\n}", 60000);
  check(y.out === "True\n", "V6: after it the editor still runs on this device (Regex, kept whole) (" + JSON.stringify(y.out) + ")");
  await ctx.close();
}

console.log("2. teacher, phone: no lab");
{
  const { ctx, page } = await session("teacher", { width: 390, height: 844 }, { touch: true });
  await teacherOpens(page);
  const panel = await openEditor(page);
  await page.waitForTimeout(500);
  check(await panel.getByTestId("csharp-on-device").count() === 0, "no on-device note (the Runner path, as before)");
  check(await page.locator("iframe[data-testid='teacher-csharp-lab']").count() === 0, "no lab frame");
  await shot(page, "lab-teacher-390");
  await ctx.close();
}

console.log("3. student, desktop: the book's C# editor runs on this computer too");
{
  const before = traffic.length;
  const { ctx, page } = await session("student", { width: 1440, height: 900 });
  await studentOpens(page);
  const panel = await openEditor(page);
  check(/يعمل على جهازك/.test(await panel.getByTestId("csharp-on-device").innerText()), "the student's editor says the code runs on this computer");
  check(await panel.getByRole("button", { name: "تشغيل مرئي", exact: true }).count() === 0, "student: no «تشغيل مرئي» (the class's teacher did not turn it on for the book — V7)");
  const a = await run(panel, page, "static void Main()\n{\n    Stack<int> s = new Stack<int>();\n    for (int i = 1; i <= 3; i++) s.Push(i);\n    Console.WriteLine(s);\n}", 180000);
  check(/انتهى التشغيل بنجاح/.test(a.status) && a.out === "[3,2,1]\n", "student: the book's Stack<T>: [3,2,1] (" + JSON.stringify(a) + ")");
  const mine = traffic.slice(before).filter(t => t.path === "/api/student-tools/csharp-run");
  check(mine.filter(t => t.method === "POST").length === 0, "student: no program was sent to a server");
  check(mine.filter(t => t.method === "GET").length === 1 && mine.find(t => t.method === "GET").status === 200, "student: ONE read of the book's classes, allowed by the book's run permission (" + JSON.stringify(mine) + ")");
  await shot(page, "lab-student-1440");
  await ctx.close();
}

console.log("3c. student whose class's teacher turned «تشغيل مرئي» on for the book (V7), desktop");
{
  const before = traffic.length;
  const { ctx, page } = await session("student", { width: 1440, height: 900 }, { token: student2Token });
  await studentOpens(page, student2);
  const panel = await openEditor(page);
  check(await panel.getByRole("button", { name: "تشغيل مرئي", exact: true }).count() === 1, "V7: this class's student gets «تشغيل مرئي»");
  const v = await visual(panel, page, "static void Main()\n{\n    Queue<int> q = new Queue<int>();\n    q.Insert(1); q.Insert(2);\n    q.Remove();\n    Console.WriteLine(q);\n}");
  check(/سُجّل التنفيذ خطوة خطوة/.test(v.status) && v.out === "[2]\n" && /2/.test(v.stack), "V7: the student's run is recorded on this computer and drawn step by step (" + v.total + " steps, out " + JSON.stringify(v.out) + ")");
  const mine = traffic.slice(before).filter(t => t.path === "/api/student-tools/csharp-run");
  check(mine.filter(t => t.method === "POST").length === 0, "V7: the student's visual run sent nothing to a server");
  await shotOf(panel.getByTestId("csharp-trace"), "lab-student-visual-1440");
  await ctx.close();
}

console.log("3b. student, phone: no lab");
{
  const { ctx, page } = await session("student", { width: 390, height: 844 }, { touch: true });
  await studentOpens(page);
  const panel = await openEditor(page);
  await page.waitForTimeout(500);
  check(await panel.getByTestId("csharp-on-device").count() === 0, "student, phone: no on-device note (the Runner path, as before)");
  check(await page.locator("iframe[data-testid='teacher-csharp-lab']").count() === 0, "student, phone: no lab frame");
  await ctx.close();
}

check(violations.length === 0, "no CSP violation (" + violations.join(" | ") + ")");
await browser.close();
server.close();
console.log(failures.length ? "\nFAILED:\n- " + failures.join("\n- ") : "\nCSHARP LAB BROWSER PASS");
process.exit(failures.length ? 1 : 0);
