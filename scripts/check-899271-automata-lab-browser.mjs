#!/usr/bin/env node
// AUTO-A13 (docs/enterprise-automata-lab-a4.md §19) — «مختبر الآلات» in a REAL Chromium on the production build, next to the REAL API in
// process (browser-harness/learning-l8-api.cjs, the L.8 harness), as the coding lab's check (scripts/check-899371-browser-p7.mjs).
// Certification only.
//
//   1. TEACHER «الواجبات» → «إنشاء واجب» → «المكتبة الرسمية»: the chip «مختبر الآلات · الأتمتة» lists exactly AU899271-01…04;
//      choosing the Turing-machine item shows «7 سؤال · 70 علامة»; the wizard creates the assignment by libraryRef.
//   2. What the server stored is the frozen library item (source library, every rule and reference machine included) — the teacher's
//      browser sent no snapshot.
//   3. STUDENT of that class: the assignment arrives with every question's public rules and NO reference machine.
//   4. TEACHER «بنك الامتحانات» → «فتح نسخة في الباني» on the pushdown item: the STRUCTURED builder opens with its 4 questions, each
//      with the machine builder and the reference built in it.
//   5. axe-core (WCAG 2.1 A/AA), no horizontal overflow, at 390 (touch) and 1440, on the composer showing the lab.
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
const LAB = ["AU899271-01", "AU899271-02", "AU899271-03", "AU899271-04"];
const ITEM = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/exam-library/items/AU899271-04.json"), "utf8"));
const ITEM_QS = ITEM.examSnapshot.sections.flatMap(s => s.questions);
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
/** The teacher's composer on «المكتبة الرسمية», filtered to the automata-lab chip. */
async function composerOnLab(page) {
  await page.goto(origin + "/");
  await page.waitForLoadState("networkidle").catch(() => {});
  // the app's own navigation (the side bar, or the bottom bar on a phone) — the dashboard's cards carry «الواجبات» buttons too
  await page.locator("nav").getByRole("button", { name: "الواجبات", exact: true }).locator("visible=true").first().click({ timeout: 15000 });
  await page.getByRole("button", { name: "إنشاء واجب" }).first().click({ timeout: 15000 });
  const composer = page.getByRole("region", { name: "إنشاء واجب جديد" });
  await composer.getByRole("button", { name: "المكتبة الرسمية" }).click();
  const list = composer.getByRole("list", { name: "عناصر المكتبة" });
  await list.waitFor({ timeout: 15000 });
  await composer.getByRole("button", { name: "مختبر الآلات · الأتمتة", exact: true }).click();
  return { composer, list };
}
const codes = list => list.locator(".library-item-code").allInnerTexts();
// axe measures colours as drawn: it runs once no animation or transition is still running (choosing content enables the wizard's
// steps, which fade from .5 to full opacity in 0.18s — measured mid-fade they read 4.28:1, settled they pass).
const settled = page => page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"), null, { timeout: 5000 }).catch(() => {});
async function axe(page, where) {
  await settled(page);
  await page.evaluate(axeSource + "\n;0");
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map(v => v.id + " ×" + v.nodes.length));
  check(r.length === 0, where + ": axe WCAG 2.1 A/AA — " + (r.join(", ") || "no violation"));
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 1, where + ": no horizontal overflow (" + over + "px)");
}

console.log("1. teacher: the automata lab in «المكتبة الرسمية», assigned in the wizard");
let assignmentId = "";
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  const { composer, list } = await composerOnLab(page);
  const shown = await codes(list);
  check(JSON.stringify(shown) === JSON.stringify(LAB), "the chip lists exactly AU899271-01…04 (" + shown.join(" ") + ")");
  const first = await list.locator(".library-item-main small").first().innerText();
  check(/4 سؤال · 40 علامة · مختبر الآلات · الأتمتة/.test(first), "an item reads «4 سؤال · 40 علامة · مختبر الآلات · الأتمتة» (" + first + ")");
  await list.getByRole("button", { name: /^AU899271-04/ }).click();
  await composer.getByText("7 سؤال · 70 علامة").first().waitFor({ timeout: 15000 });
  check(true, "choosing «آلة تورنغ» selects it: «7 سؤال · 70 علامة»");
  await shot(page, "a13-composer-1440");
  await axe(page, "composer 1440");
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
  check(sent.libraryRef?.itemId === "AU899271-04" && !/"reference"/.test(post.sent), "the browser sent libraryRef AU899271-04 and no reference machine");
  assignmentId = JSON.parse(post.got).assignment?.assignmentId || "";
  check(!!assignmentId, "the assignment was created (" + assignmentId + ")");
  const keyed = traffic.filter(t => t.role === "teacher" && /"reference"/.test(t.got)).map(t => t.method + " " + t.path);
  check(keyed.every(k => k === "GET /api/exam-library/AU899271-04"), "only the item's own preview (a key-holding teacher, P6-A) carried a reference; nothing else did (" + [...new Set(keyed)].join(", ") + ")");
  await ctx.close();
  console.log("2. what the server stored");
  const stored = api.mem.getJson("platform/assignments/" + assignmentId + ".json");
  check(stored?.status === "published" && stored.classId === "cA", "it is published to the class (" + stored?.status + ", " + stored?.classId + ")");
  check(stored?.source?.kind === "library" && stored.source.itemId === "AU899271-04", "the stored assignment names its library source");
  const sq = (stored?.examSnapshot?.sections || []).flatMap(s => s.questions || []);
  check(sq.length === 7 && sq.every((q, i) => JSON.stringify(q.answer) === JSON.stringify(ITEM_QS[i].answer) && JSON.stringify(q.machineDesign) === JSON.stringify(ITEM_QS[i].machineDesign)),
    "its snapshot is the frozen item: the same rules and reference machine for all 7 questions");
}

console.log("3. student: the assignment arrives without its reference machines");
{
  const { ctx, page } = await session("student", { width: 390, height: 844 }, { touch: true });
  await page.goto(origin + "/#/s/today");
  await page.waitForLoadState("networkidle").catch(() => {});
  const r = await page.evaluate(async ([id, t]) => {
    const h = { "x-student-token": t, "content-type": "application/json" };
    const start = await fetch("/api/student-submission/" + encodeURIComponent(id), { method: "POST", headers: h, body: JSON.stringify({ action: "startAttempt" }) });
    const x = await fetch("/api/student-assignment/" + encodeURIComponent(id), { headers: h });
    return { start: start.status, status: x.status, text: await x.text() };
  }, [assignmentId, studentToken]);
  check(r.start === 200, "the student starts an attempt → " + r.start);
  check(r.status === 200, "GET /api/student-assignment → " + r.status);
  check(!/"reference"|"transitions"/.test(r.text), "no reference machine (no «reference», no «transitions») in what the student receives");
  check(ITEM_QS.every(q => r.text.includes(JSON.stringify(q.machineDesign))), "every question's public rules reach the student as written");
  await ctx.close();
}

console.log("4. teacher: «فتح نسخة في الباني» opens the structured builder with the machines");
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  await page.goto(origin + "/");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: "بنك الامتحانات" }).first().click({ timeout: 15000 });
  await page.getByRole("tab", { name: "المكتبة الرسمية" }).or(page.getByRole("button", { name: "المكتبة الرسمية", exact: true })).first().click({ timeout: 15000 });
  const row = page.locator("li.eb-bank-exam-row").filter({ hasText: "مختبر الآلات — أوتومات المكدّس" });
  check(/4 سؤال · 40 علامة/.test(await row.innerText({ timeout: 15000 })), "«بنك الامتحانات» → «المكتبة الرسمية» lists «مختبر الآلات — أوتومات المكدّس (الوحدتان 8–9)», 4 questions, 40 marks");
  await row.getByRole("button", { name: "فتح نسخة في الباني" }).click({ timeout: 15000 });
  await page.getByText("نُسخ امتحان المكتبة").first().waitFor({ timeout: 20000 });
  const chips = page.getByText("تصميم آلة: مكدّس أو تورنغ", { exact: true });
  check(await chips.count() === 4, "the structured builder shows the item's 4 questions, each «تصميم آلة: مكدّس أو تورنغ» (" + await chips.count() + ")");
  const ready = await page.getByText("جاهز للاعتماد").first().locator("xpath=..").innerText().catch(() => "");
  check(/100%/.test(ready), "the builder's own finalization: «جاهز للاعتماد 100%» (" + ready.replace(/\s+/g, " ") + ")");
  await page.getByText(/^صمّم أوتومات مكدّس حتميًا يقبل اللغة \{aⁿb²ⁿ/).first().click();
  const editor = page.getByTestId("qt-editor-machineDesign");
  await editor.first().waitFor({ timeout: 20000 });
  check(await page.getByTestId("machine-reference").getByText("ابنِ الآلة النموذجية هنا").count() === 0, "the opened question's reference machine is already built (no «ابنِ الآلة النموذجية هنا»)");
  check(await page.getByTestId("machine-question-issues").count() === 0, "the opened question asks for nothing before finalization");
  await shot(page, "a13-builder-1440");
  await ctx.close();
}

console.log("5. the composer on a phone");
{
  const { ctx, page } = await session("teacher", { width: 390, height: 844 }, { touch: true });
  const { list } = await composerOnLab(page);
  check((await codes(list)).length === 4, "the 4 lab items at 390");
  await shot(page, "a13-composer-390");
  await axe(page, "composer 390");
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures.length ? "\n✗ " + failures.length + " check(s) failed:\n  " + failures.join("\n  ") : "\n✓ every A13 browser check passed");
process.exit(failures.length ? 1 : 0);
