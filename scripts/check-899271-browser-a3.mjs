#!/usr/bin/env node
// AUTO-A3 (docs/enterprise-automata-design-a3.md) — «صمّم الآلة» (simulation / automaton-design / v1) in a REAL Chromium on the
// production build, next to the REAL API in process (browser-harness/learning-l8-api.cjs, the L.8 harness). Certification only.
//
//   1. TEACHER, unit 2 «تدريبات الوحدة (2)»: the designer loads (its own lazy chunk) with the task; the served page carries no
//      reference; a half-built machine is checked by the REAL server → «ليست بعد» with the broken rule named (incomplete); the
//      finished machine → «✓ آلتك صحيحة» with the explanation; «جرّب كلمة» runs the learner's own machine.
//   2. STUDENT (a class with m02 and m05 published), unit 5: an NFA for «تنتهي بـ ab» — a wrong machine gets the separating word,
//      the right one is recorded ONCE in the student's study document (the real route and the real generated indexes).
//   3. axe-core (WCAG 2.1 A/AA), overflow and touch targets at 390 (touch) and 1440, light and «داكن», on a designer.
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
const CID = "899271";
const student = { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "سارة أحمد", code: "S1001" };
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {
  "platform/users/u1.json": student,
  "platform/classes/cA.json": { classId: "cA", name: "الصف الثاني عشر", grade: "12", status: "active", active: true, studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: ["899271-m02", "899271-m05"] }] },
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

const P2 = "899271-m02-l04-p02", P5 = "899271-m05-l05-p02";
const page2 = served("899271-m02").lessons.flatMap(l => l.pages).find(p => p.id === P2);
check(!!page2 && !JSON.stringify(page2).includes('"reference"'), "the served unit-2 practice page exists and carries no reference machine");
const opens = async (page, pageId) => {
  await page.goto(origin + "/#/learning/" + CID + "/read/" + pageId);
  await page.reload();
  await readerReady(page);
};
const designer = (page, text) => page.locator(".learning-autodesign").filter({ hasText: text }).first();
const ready = async (page, text) => { const d = designer(page, text); await d.scrollIntoViewIfNeeded({ timeout: 20000 }).catch(() => {}); await d.waitFor({ timeout: 20000 }); return d; };

console.log("1. teacher: a DFA in unit 2, judged by the real server");
{
  const { ctx, page } = await session("teacher", { width: 1280, height: 900 });
  await opens(page, P2);
  const d = await ready(page, "تنتهي بـ 1");
  check(await d.getByRole("list", { name: "شروط التمرين" }).textContent().then(t => t.includes("أوتومات كامل")), "the task's rules are shown (complete DFA)");
  await d.getByRole("button", { name: /إضافة حالة/ }).click();
  await d.getByRole("checkbox", { name: "قبول" }).nth(1).check();
  await d.getByRole("combobox", { name: "من q0 بالرمز 1 إلى" }).selectOption("q1");
  await d.getByRole("button", { name: "تحقّق من الآلة" }).click();
  await d.locator(".learning-autodesign-verdict").waitFor({ timeout: 10000 });
  const wrong = await d.locator(".learning-autodesign-verdict").textContent();
  check(wrong.includes("ليست بعد") && wrong.includes("ليس كاملًا"), "a half-built machine: «ليست بعد» and the missing arrow named — " + wrong.trim().slice(0, 90));
  await d.getByRole("combobox", { name: "من q0 بالرمز 0 إلى" }).selectOption("q0");
  await d.getByRole("combobox", { name: "من q1 بالرمز 0 إلى" }).selectOption("q0");
  await d.getByRole("combobox", { name: "من q1 بالرمز 1 إلى" }).selectOption("q1");
  check(await d.locator(".learning-autodesign-verdict").count() === 0, "an edit clears the verdict");
  await d.getByLabel("جرّب كلمة على آلتك").fill("0101");
  await d.getByRole("button", { name: "شغّل" }).click();
  check((await d.locator(".learning-autodesign-tried").textContent()).includes("آلتك تقبل الكلمة 0101"), "«جرّب كلمة» runs the learner's own machine");
  await d.getByRole("button", { name: "تحقّق من الآلة" }).click();
  await d.locator(".learning-autodesign-verdict.is-right").waitFor({ timeout: 10000 });
  check((await d.locator(".learning-autodesign-verdict").textContent()).includes("حالتان تكفيان"), "the finished machine: «✓ آلتك صحيحة» with the explanation from the server");
  check(await d.locator(".learning-automaton-svg .learning-automaton-state").count() === 2, "the machine is drawn live (2 states)");
  await shot(page, "a3-teacher-1280");
  await ctx.close();
}

console.log("2. student: an NFA in unit 5, recorded once");
{
  const { ctx, page } = await session("student", { width: 390, height: 844 }, { touch: true });
  await page.goto(origin + "/");
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), ["examBankReaderPosition:v1:" + student.userId, JSON.stringify({ courseId: CID, pageId: P5, at: new Date().toISOString() })]);
  await page.goto(origin + "/#/s/today");
  await page.reload();
  await page.getByRole("button", { name: "تابع القراءة" }).first().click({ timeout: 15000 });
  await readerReady(page);
  const d = await ready(page, "تنتهي بـ ab");
  for (let i = 0; i < 2; i++) await d.getByRole("button", { name: /إضافة حالة/ }).click();
  const tap = (from, sym, to) => d.getByRole("group", { name: "من " + from + " بالرمز " + sym + " إلى" }).getByRole("button", { name: to, exact: true }).click();
  await tap("q0", "a", "q0"); await tap("q0", "b", "q0"); await tap("q0", "a", "q1"); await tap("q1", "b", "q2");
  await d.getByRole("button", { name: "تحقّق من الآلة" }).click();                 // no accepting state yet → wrong
  await d.locator(".learning-autodesign-verdict").waitFor({ timeout: 10000 });
  const wrong = await d.locator(".learning-autodesign-verdict").textContent();
  check(wrong.includes("ab") && wrong.includes("يجب أن تُقبل"), "a wrong machine gets the separating word «ab» — " + wrong.trim().slice(0, 90));
  const studyDoc = () => api.mem.getJson("platform/learning-study/u1.json");
  check(!studyDoc(), "a wrong answer writes nothing");
  await d.getByRole("checkbox", { name: "قبول" }).nth(2).check();
  await d.getByRole("button", { name: "تحقّق من الآلة" }).click();
  await d.locator(".learning-autodesign-verdict.is-right").waitFor({ timeout: 10000 });
  const doc = studyDoc();
  check(!!doc && Object.keys(doc.pages[P5].completed).includes("m05-l05-p02-b06"), "the right machine is recorded in the student's study document");
  await d.getByRole("button", { name: "تحقّق من الآلة" }).click();
  await page.waitForTimeout(500);
  check(Object.keys(studyDoc().pages[P5].completed).length === 1, "a repeat adds nothing");
  await shot(page, "a3-student-390");
  await ctx.close();
}

console.log("3. axe, overflow and touch targets on a designer");
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
    await opens(page, P5);
    const d = await ready(page, "تنتهي بـ ab");
    await d.getByRole("button", { name: /إضافة حالة/ }).click();
    await d.getByRole("button", { name: "تحقّق من الآلة" }).click();
    await d.locator(".learning-autodesign-verdict").waitFor({ timeout: 10000 });
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"), null, { timeout: 5000 });
    await page.evaluate(axeSource + "\n;0");
    const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter(x => x.impact === "serious" || x.impact === "critical").map(x => x.id + " ×" + x.nodes.length + " " + x.nodes.map(n => n.target.join(" ")).join(" | ")));
    const where = "designer " + v.width + "px " + readTheme;
    check(res.length === 0, where + ": axe — " + (res.join(", ") || "no serious / critical violation"));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(overflow <= 0, where + ": no page overflow (" + overflow + "px)");
    if (v.touch) {
      const small = (await page.evaluate(TARGETS)).filter(Boolean);
      const mine = await page.evaluate(() => [...document.querySelectorAll(".learning-autodesign button, .learning-autodesign select, .learning-autodesign input")].filter(b => { const r = b.getBoundingClientRect(); const box = b.closest("label") ? b.closest("label").getBoundingClientRect() : r; return r.width && (box.width < 44 || box.height < 44); }).map(b => (b.getAttribute("aria-label") || b.textContent || b.tagName).trim().slice(0, 30)));
      check(mine.length === 0, where + ": the designer's controls are ≥ 44 px (a checkbox / radio counts by its label)" + (mine.length ? " — " + [...new Set(mine)].join("; ") : ""));
      if (small.length) console.log("    (page-wide scan, each input by its own box — a checkbox / radio is tapped through its 44 px label: " + [...new Set(small)].slice(0, 6).join("; ") + ")");
      await shot(page, "a3-designer-390-" + readTheme);
    }
    await ctx.close();
  }
}

await browser.close(); server.close();
console.log(failures.length ? "\n" + failures.length + " check(s) failed:\n  " + failures.join("\n  ") : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
