#!/usr/bin/env node
// 899371 P6 (docs/enterprise-899371-learning-plan.md §19) — the C# tracer (simulation / csharp-trace / v1) in a REAL Chromium on the
// production build, next to the REAL API in process (browser-harness/learning-l8-api.cjs, the L.8 harness). Certification only.
//
//   1. TEACHER, chapter 7 «مكدس الاستدعاءات» (a page of added blocks: its header says «إثراء تعليمي»): the tracer loads (its own lazy chunk), shows the page's program and its first step;
//      «التالي» walks the recorded steps — the call stack grows to G on top of F on top of Main and shrinks back, the output grows to
//      «M1 F1 G F2 M2», the current line follows; «السابق» goes back; the shell's «إعادة تعيين» returns to step 1; «توسيع» opens it
//      full screen and Escape closes it.
//   2. Chapter 10 «عنصر التقاطع»: the matrix is drawn as a 3×3 grid of the program's values.
//   3. STUDENT (a class with m00–m06 published) reads chapter 6 «فخّ القيمة الابتدائية»: the input is shown, stepping to the end
//      prints «0», and stepping sends nothing to any server.
//   4. axe-core (WCAG 2.1 A/AA), overflow and touch targets at 390 (touch) and 1440, light and «داكن», on a tracer mid-way.
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
const served = id => JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-content", CID, id + ".json"), "utf8"));
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
  await page.locator(".learning-trace").first().waitFor({ timeout: 20000 });
}




/** The served page holding the tracer of the walkthrough with this title. */
const tracedPage = (moduleId, title) => served(moduleId).lessons.flatMap(l => l.pages).find(p => p.title === "نحلّ معًا: " + title && p.blocks.some(b => b.type === "simulation"));
const STACK = tracedPage("899371-m07", "مكدس الاستدعاءات");
const MATRIX = tracedPage("899371-m10", "عنصر التقاطع");
const TRAP = tracedPage("899371-m06", "فخّ القيمة الابتدائية");
const traceOf = page => page.blocks.find(b => b.type === "simulation");
check(!!STACK && !!MATRIX && !!TRAP, "the three traced pages exist in the served bodies");
const teacherOpens = async (page, pageId) => {
  await page.goto(origin + "/#/learning/" + CID + "/read/" + pageId);
  await page.reload();
  await readerReady(page);
  await page.locator(".learning-trace").first().waitFor({ timeout: 20000 });
};
const read = page => page.evaluate(() => {
  const t = document.querySelector(".learning-trace");
  return {
    counter: t.querySelector(".learning-trace-counter").textContent.replace(/\s+/g, " ").trim(),
    line: [...t.querySelectorAll(".learning-trace-line")].findIndex(l => l.getAttribute("aria-current") === "step") + 1,
    stack: [...t.querySelectorAll(".learning-trace-frame .learning-trace-framename")].map(f => f.textContent.replace(/\s+/g, " ").trim()),
    out: t.querySelector(".learning-trace-out").textContent,
    lines: t.querySelectorAll(".learning-trace-line").length,
    note: t.querySelector(".learning-trace-note").textContent.replace(/\s+/g, " ").trim(),
  };
});
const next = page => page.getByRole("button", { name: "الخطوة التالية" }).first().click();
/** Steps to the last step (the button is disabled there, by design). */
const toEnd = async page => { const b = page.getByRole("button", { name: "الخطوة التالية" }).first(); while (!(await b.isDisabled())) await b.click(); };

console.log("1. teacher: the call stack, step by step");
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  const chunks = [];
  page.on("response", r => { if (/CSharpTraceActivity-[^/]+\.js$/.test(r.url())) chunks.push(r.url()); });
  await teacherOpens(page, STACK.id);
  const steps = traceOf(STACK).config.steps;
  const badge = await page.locator(".learning-reader-frombook").first().innerText();
  check(badge.trim() === "إثراء تعليمي", "the walkthrough page says «إثراء تعليمي», not «من الكتاب» (" + badge.trim() + ")");
  const s0 = await read(page);
  check(chunks.length === 1, "the tracer arrives as its own lazy chunk (" + chunks.length + ")");
  check(s0.lines === traceOf(STACK).config.code.split("\n").length && s0.counter.includes("1 / " + steps.length) && s0.line === steps[0].line,
    "it shows the page's program (" + s0.lines + " lines) at step 1 of " + steps.length + ", line " + s0.line + " marked");
  await next(page); await next(page);
  const s2 = await read(page);
  check(JSON.stringify(s2.stack) === JSON.stringify(["G — تعمل الآن", "F", "Main"]) && s2.out === "M1 F1 G ", "step 3: G runs on top of F on top of Main; the output so far is «M1 F1 G »");
  await next(page);
  const s3 = await read(page);
  check(JSON.stringify(s3.stack) === JSON.stringify(["F — تعمل الآن", "Main"]) && s3.line === steps[3].line, "step 4: G has left the stack, back in F at line " + s3.line);
  await toEnd(page);
  const sEnd = await read(page);
  check(sEnd.out === "M1 F1 G F2 M2" && JSON.stringify(sEnd.stack) === JSON.stringify(["Main"]), "the last step: the output is «M1 F1 G F2 M2», only Main left");
  await page.getByRole("button", { name: "الخطوة السابقة" }).first().click();
  check((await read(page)).counter.includes((steps.length - 1) + " / "), "«الخطوة السابقة» goes back one step");
  const shell = page.locator(".learning-activity.kind-simulation").first();   // the tracer's own shell (the walkthrough above has its own)
  await shell.getByRole("button", { name: "إعادة تعيين" }).click();
  check((await read(page)).counter.includes("1 / "), "«إعادة تعيين» returns to step 1");
  await shot(page, "p6-stack-1440");
  await shell.getByRole("button", { name: "توسيع" }).click();
  const full = await page.locator(".learning-activity.kind-simulation.is-fullscreen .learning-trace").first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const closed = await page.locator(".learning-activity.kind-simulation.is-fullscreen").count() === 0;
  check(full && closed, "«توسيع» shows the tracer full screen; Escape closes it");

  console.log("2. the matrix as a grid");
  await teacherOpens(page, MATRIX.id);
  const grid = await page.evaluate(() => [...document.querySelectorAll(".learning-trace .learning-trace-matrix tbody tr")].map(r => [...r.querySelectorAll("td")].map(td => td.textContent)));
  check(JSON.stringify(grid) === JSON.stringify([["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]]), "chapter 10: the matrix is a 3×3 grid of the program's values");
  await shot(page, "p6-matrix-1440");
  await ctx.close();
}

console.log("3. student: the input, the output, nothing sent");
{
  const { ctx, page } = await session("student", { width: 1440, height: 900 });
  const sent = [];
  page.on("request", r => { if (r.method() === "POST" && /\/api\/learning-study\//.test(r.url())) sent.push(r.url()); });
  await page.goto(origin + "/");
  await studentOpens(page, TRAP.id);
  const stdin = await page.locator(".learning-trace-stdin").first().innerText();
  check(stdin.includes("5 3 8 0"), "the input is shown (" + stdin.replace(/\s+/g, " ").trim() + ")");
  await toEnd(page);
  const s = await read(page);
  check(s.out === "0\n" && /الفخّ/.test(s.note), "stepping to the end prints «0» and names the trap");
  check(sent.length === 0, "stepping sends nothing to any server (" + sent.length + ")");
  await ctx.close();
}

console.log("4. axe, overflow and touch targets on a tracer mid-way");
const TARGETS = () => {
  const out = [];
  const inRunningText = el => el.tagName === "A" && el.closest("p, li, td") && (el.closest("p, li, td").textContent || "").trim().length > (el.textContent || "").trim().length + 8;
  for (const el of document.querySelectorAll("button, a[href], [role=button], [role=radio], [role=tab], select, input:not([type=hidden]), summary")) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === "hidden" || el.closest("[aria-hidden=true], [inert]")) continue;
    if (r.bottom < 0 || r.top > innerHeight * 3) continue;
    if (inRunningText(el)) continue;
    if (r.width < 44 || r.height < 44) out.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40) + " " + Math.round(r.width) + "×" + Math.round(r.height));
  }
  return out;
};

for (const v of [{ width: 390, height: 844, touch: true }, { width: 1440, height: 900, touch: false }]) {
  for (const readTheme of ["light", "dark"]) {
    const { ctx, page } = await session("teacher", { width: v.width, height: v.height }, { touch: v.touch, readTheme });
    await teacherOpens(page, STACK.id);
    await next(page); await next(page);
    await page.locator(".learning-trace").first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"), null, { timeout: 5000 });
    await page.evaluate(axeSource + "\n;0");
    const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter(x => x.impact === "serious" || x.impact === "critical").map(x => x.id + " ×" + x.nodes.length + " " + x.nodes.map(n => n.target.join(" ")).join(" | ")));
    const where = "tracer " + v.width + "px " + readTheme;
    check(res.length === 0, where + ": axe — " + (res.join(", ") || "no serious / critical violation"));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(overflow <= 0, where + ": no page overflow (" + overflow + "px)");
    if (v.touch) {
      const small = [...await page.evaluate(TARGETS), ...await page.evaluate(() => [...document.querySelectorAll(".learning-trace button")].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.width < 44 || r.height < 44); }).map(b => b.textContent.trim() + " " + Math.round(b.getBoundingClientRect().width) + "×" + Math.round(b.getBoundingClientRect().height)))];
      check(small.length === 0, where + ": touch targets ≥ 44 px, the tracer's buttons included" + (small.length ? " — " + [...new Set(small)].join("; ") : ""));
      await shot(page, "p6-tracer-390-" + readTheme);
    }
    await ctx.close();
  }
}

await browser.close(); server.close();
console.log(failures.length ? "\n" + failures.length + " check(s) failed:\n  " + failures.join("\n  ") : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
