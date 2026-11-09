#!/usr/bin/env node
// 899371 P4 (docs/enterprise-899371-learning-plan.md §16) — the self-study exercises «تدريبات الوحدة» in a REAL Chromium on the production
// build, next to the REAL API in process (browser-harness/learning-l8-api.cjs, the L.8 harness). Certification only; nothing is deployed.
//
//   1. STUDENT (a class with m00–m05 published) opens the chapter-5 exercises: before an answer the markup names no key; each
//      exercise's program is shown exactly as served; a RIGHT choice is judged right by the server; a WRONG choice is judged wrong
//      and REVEALS the right option (green) with its explanation (decision Q3); a short answer typed «٦» is judged right (Q10); every
//      answer went to POST /api/learning-study/899371/attempt and carried no key.
//   2. STRENGTH: GET /api/learning-study/899371 counts exactly the right answers (the revealed one earns nothing), survives a
//      reload, and an exercise of the unpublished chapter 6 is refused (403).
//   3. axe-core (WCAG 2.1 A/AA) on the answered exercise page at 390 (touch) and 1440, light and «داكن»: no serious / critical
//      violation; no page overflow; on touch every visible control ≥ 44 × 44.
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
  "platform/classes/cA.json": { classId: "cA", name: "الصف الحادي عشر", grade: "11", status: "active", active: true, studentIds: ["u1"], learningMaterials: [{ courseId: CID, visibleModuleIds: ["899371-m00", "899371-m01", "899371-m02", "899371-m03", "899371-m04", "899371-m05"] }] },
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
/** The student opens an exercise page as the portal does: its device marker (Phase 9A) → «تابع القراءة» on «اليوم». */
async function studentOpens(page, pageId) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), ["examBankReaderPosition:v1:" + student.userId, JSON.stringify({ courseId: CID, pageId, at: new Date().toISOString() })]);
  await page.goto(origin + "/#/s/today");
  await page.reload();
  await page.getByRole("button", { name: "تابع القراءة" }).first().click({ timeout: 15000 });
  await readerReady(page);
  await page.locator(".learning-reader-practice.is-interactive").first().waitFor({ timeout: 15000 });
}


const PAGE = "899371-m05-l04-p01";
const servedPage = served("899371-m05").lessons.flatMap(l => l.pages).find(p => p.id === PAGE);

console.log("1. student: answering the chapter-5 exercises");
{
  const { ctx, page } = await session("student", { width: 1440, height: 900 });
  const attempts = [];
  page.on("request", r => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/learning-study/" + CID + "/attempt") attempts.push(r.postData() || ""); });
  await page.goto(origin + "/");
  await studentOpens(page, PAGE);
  await page.getByRole("button", { name: "نسخ الكود" }).first().waitFor({ timeout: 15000 });
  const practices = page.locator(".learning-reader-practice.is-interactive");
  check(await practices.count() === 5, "the first exercise page shows its 5 exercises (" + await practices.count() + ")");
  const before = await page.evaluate(() => document.querySelector(".learning-reader-page").outerHTML);
  check(!/is-answer|data-key|"correct"/.test(before), "before an answer the page's markup names no key");
  const codes = await page.evaluate(() => [...document.querySelectorAll(".learning-reader-codewrap.is-csharp code")].map(c => c.textContent));
  const expectedCodes = servedPage.blocks.filter(b => b.type === "code").map(b => b.code);
  check(JSON.stringify(codes) === JSON.stringify(expectedCodes), "each exercise's program is shown exactly as served (" + codes.length + " programs)");
  const q = i => practices.nth(i);
  const verdictOf = async i => { const v = q(i).locator(".learning-reader-practice-verdict.is-right, .learning-reader-practice-verdict.is-wrong").first(); await v.waitFor({ timeout: 10000 }); return { cls: await v.getAttribute("class"), text: (await v.innerText()).replace(/\s+/g, " ") }; };

  // q01 — the right choice
  await q(0).getByRole("radio", { name: "2 4 6 8", exact: true }).click();
  const v1 = await verdictOf(0);
  check(/is-right/.test(v1.cls), "q01: the right choice «2 4 6 8» is judged right by the server");
  // q02 — a wrong choice: the right option is revealed (green) with the explanation
  await q(1).getByRole("radio", { name: "10", exact: true }).click();
  const v2 = await verdictOf(1);
  const answerShown = await q(1).locator(".learning-reader-practice-option.is-answer .learning-reader-practice-optiontext").innerText().catch(() => "");
  check(/is-wrong/.test(v2.cls) && v2.text.includes("الإجابة الصحيحة: 15"), "q02: the wrong choice «10» is judged wrong and the right answer «15» is named");
  check(answerShown.trim() === "15", "q02: the right option is marked (is-answer: «" + answerShown.trim() + "»)");
  const shownText = (await q(1).innerText()).replace(/\s+/g, " ");
  check(shownText.includes("1 + 2 + 3 + 4 + 5 = 15"), "q02: the explanation is shown under the answer");
  // q05 — a short answer, typed with an Arabic keyboard (decision Q10: «٦» is «6»)
  await q(4).locator("input, textarea").first().fill("٦");
  await q(4).getByRole("button", { name: "تحقّق" }).click();
  const v5 = await verdictOf(4);
  check(/is-right/.test(v5.cls), "q05: the short answer «٦» (Arabic-Indic digit) is judged right by the server (Q10)");
  check(attempts.length === 3 && attempts.every(b => !/"correct"|"points"|"gained"/.test(b)), "every answer went to the server's attempt route, carrying only the response (" + attempts.length + " requests)");
  await shot(page, "p4-exercises-answered-1440");

  const study = () => page.evaluate(async t => (await fetch("/api/learning-study/899371", { headers: { "x-student-token": t } })).json(), studentToken);
  const s1 = await study();
  const m5 = s1.modules && s1.modules["899371-m05"];
  check(!!m5 && m5.completed === 2 && m5.eligible === 10 && m5.points === 4, "Strength: chapter 5 counts the 2 right answers of 10 (4 of 20 points), the revealed one earns nothing (" + JSON.stringify(m5) + ")");
  await page.reload();
  const s2 = await study();
  check(JSON.stringify(s2.modules["899371-m05"]) === JSON.stringify(m5) && s2.totalPoints === s1.totalPoints, "Strength survives a reload (" + s2.totalPoints + " points)");
  const refused = await page.evaluate(async t => (await fetch("/api/learning-study/899371/attempt", { method: "POST", headers: { "x-student-token": t, "content-type": "application/json" }, body: JSON.stringify({ pageId: "899371-m06-l04-p01", activityId: "m06-l04-p01-q01", response: { kind: "multipleChoice", optionIds: ["a"] } }) })).status, studentToken);
  check(refused === 403, "an exercise of the unpublished chapter 6 is refused (" + refused + ")");
  await ctx.close();
}

console.log("1b. a teacher clarification next to an incomplete book question (§18)");
{
  const { ctx, page } = await session("teacher", { width: 390, height: 844 }, { touch: true });
  await page.goto(origin + "/#/learning/" + CID + "/read/899371-m06-l02-p04");
  await page.reload();
  await readerReady(page);
  const note = page.locator(".learning-reader-page").getByText("توضيح المعلم").first();
  const shown = await note.waitFor({ timeout: 15000 }).then(() => true, () => false);
  const said = shown ? (await page.locator(".learning-reader-page").innerText()).replace(/\s+/g, " ") : "";
  check(shown && said.includes("المدخلات لم تُطبع في الكتاب") && said.includes("12 7 3 -1") && !said.includes("max : = 7"),
    "chapter 6, question 4: «توضيح المعلم» gives the inputs the book does not print (12 7 3 -1), and no answer");
  await page.evaluate(axeSource + "\n;0");
  const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter(x => x.impact === "serious" || x.impact === "critical").map(x => x.id + " ×" + x.nodes.length + " " + x.nodes.map(n => n.target.join(" ")).join(" | ")));
  check(res.length === 0, "the clarified page at 390px: axe — " + (res.join(", ") || "no serious / critical violation"));
  await shot(page, "d18-clarification-390");
  await ctx.close();
}

console.log("2. axe, overflow and touch targets on answered exercise pages (every kind)");
/** Every visible control of every exercise on the page, wherever it is on the page (the exercises are the subject here). */
const PRACTICE_TARGETS = () => {
  const out = [];
  for (const el of document.querySelectorAll(".learning-reader-practice :is(button, [role=radio], select, input:not([type=hidden]))")) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === "hidden" || el.closest("[aria-hidden=true], [inert]")) continue;
    if (r.width < 44 || r.height < 44) out.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30) + " " + Math.round(r.width) + "×" + Math.round(r.height));
  }
  return out;
};
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
// m05 p02: choices, a true/false, matching, ordering · m01 p02: classify, matching, ordering, word bank, true/false
for (const target of ["899371-m05-l04-p02", "899371-m01-l04-p02"]) for (const v of [{ width: 390, height: 844, touch: true }, { width: 1440, height: 900, touch: false }]) {
  for (const readTheme of ["light", "dark"]) {
    const { ctx, page } = await session("student", { width: v.width, height: v.height }, { touch: v.touch, readTheme });
    await page.goto(origin + "/");
    await studentOpens(page, target);
    const first = page.locator(".learning-reader-practice.is-interactive").filter({ has: page.locator(".learning-reader-practice-options[role=radiogroup]") }).first();
    await first.locator(".learning-reader-practice-options[role=radiogroup]").getByRole("radio").nth(1).click();   // an answer (right or wrong): the verdict and the revealed answer are on the page
    await first.locator(".learning-reader-practice-verdict.is-right, .learning-reader-practice-verdict.is-wrong").first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    await page.evaluate(axeSource + "\n;0");   // evaluated, not an inline <script>: the production CSP stays in force (as L.8)
    const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter(x => x.impact === "serious" || x.impact === "critical").map(x => x.id + " ×" + x.nodes.length));
    const where = target.slice(7) + " " + v.width + "px " + readTheme;
    check(res.length === 0, where + ": axe — " + (res.join(", ") || "no serious / critical violation"));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(overflow <= 0, where + ": no page overflow (" + overflow + "px)");
    if (v.touch) { const small = [...await page.evaluate(TARGETS), ...await page.evaluate(PRACTICE_TARGETS)]; check(small.length === 0, where + ": touch targets ≥ 44 px, every exercise control included" + (small.length ? " — " + [...new Set(small)].join("; ") : "")); }
    if (v.touch) await shot(page, "p4-" + target.slice(7) + "-390-" + readTheme);
    await ctx.close();
  }
}

await browser.close(); server.close();
console.log(failures.length ? "\n" + failures.length + " check(s) failed:\n  " + failures.join("\n  ") : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
