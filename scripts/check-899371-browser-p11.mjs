#!/usr/bin/env node
// 899371 enrichment P11 (docs/enterprise-899371-enrichment-plan.md §8) — the animated scenes (animation / csharp-scene / v1) of
// chapters 1–4 in a REAL Chromium on the production build, next to the REAL API in process (browser-harness/learning-l8-api.cjs).
// Certification only.
//
//   1. TEACHER, every page holding a scene: each scene sits right after the book block it explains, is labelled «مشهد متحرك», arrives
//      as ONE lazy chunk, starts at step 1 with its first sentence and does not move by itself; «التالي» / «السابق» move one step and
//      the sentence follows (polite live region); «شغّل» walks to the last step and STOPS there (no loop); «إيقاف» pauses; the shell's
//      «إعادة تعيين» returns to step 1; «توسيع» opens it full screen and Escape closes it.
//   2. Reduced motion (the system setting): the same steps, no transition and no animation.
//   3. STUDENT (a class with m00–m04 published) steps through a chapter 1 scene: nothing is sent to any server.
//   4. Presentation mode (وضع العرض): the scene is there, larger, and axe-clean.
//   5. axe-core (WCAG 2.1 A/AA), overflow and touch targets at 390 (touch) and 1440, light and «داكن», on every scene page mid-way.
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
  await page.locator(".learning-scene").first().waitFor({ timeout: 20000 });
}





const scenePages = [];
for (const n of ["01", "02", "03", "04"]) for (const p of served(CID + "-m" + n).lessons.flatMap(l => l.pages)) {
  const scenes = p.blocks.filter(b => b.type === "animation" && b.animationType === "csharp-scene");
  if (scenes.length) scenePages.push({ id: p.id, scenes, blocks: p.blocks });
}
check(scenePages.reduce((n, p) => n + p.scenes.length, 0) === 12 && scenePages.length === 7, "the 12 scenes of chapters 1–4 are on 7 summary pages of the served bodies");
const teacherOpens = async (page, pageId) => {
  await page.goto(origin + "/#/learning/" + CID + "/read/" + pageId);
  await page.reload();
  await readerReady(page);
  await page.locator(".learning-scene").first().waitFor({ timeout: 20000 });
};
const state = (page, i = 0) => page.evaluate(i => {
  const s = document.querySelectorAll(".learning-scene")[i];
  return { counter: s.querySelector(".learning-trace-counter").textContent.replace(/\s+/g, " ").trim(), say: s.querySelector(".learning-scene-say").textContent.trim(),
    live: s.querySelector(".learning-scene-say").getAttribute("aria-live"), playing: s.querySelector("[aria-pressed]").getAttribute("aria-pressed"),
    still: s.classList.contains("is-still") };
}, i);
/** A sentence as the reader shows it: `…` marks code, shown without the marks. */
const plain = say => say.replace(/`/g, "");
const sceneShell = (page, i = 0) => page.locator(".learning-activity.kind-animation").nth(i);

console.log("1. teacher: every scene page");
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  const chunks = [];
  page.on("response", r => { if (/CSharpSceneActivity-[^/]+\.js$/.test(r.url())) chunks.push(r.url()); });
  for (const sp of scenePages) {
    await teacherOpens(page, sp.id);
    await page.locator(".learning-scene").nth(sp.scenes.length - 1).waitFor({ timeout: 20000 });
    for (const [k, b] of sp.scenes.entries()) {
      const s = await state(page, k);
      const title = (await sceneShell(page, k).locator(".learning-activity-title").first().innerText()).trim();
      check(s.counter.includes("1 / " + b.config.steps.length) && s.say === plain(b.config.steps[0].say) && s.live === "polite" && s.playing === "false" && title === b.title && title.startsWith("مشهد متحرك: "),
        sp.id + " " + b.id + ": «" + title + "» at step 1 of " + b.config.steps.length + ", its first sentence in a polite live region, not playing");
    }
    await shot(page, "p11-" + sp.id.slice(7) + "-1440");
  }
  check(new Set(chunks).size === 1, "the scene engine arrives as ONE lazy chunk, the same for every page (" + new Set(chunks).size + ")");

  // the controls on the first scene (chapter 1, «المتغير صندوق»)
  const first = scenePages[0], b = first.scenes.find(x => x.id.endsWith("-scene-variable-box")) ?? first.scenes[0];
  const k = first.scenes.indexOf(b), n = b.config.steps.length;
  await teacherOpens(page, first.id);
  const scene = page.locator(".learning-scene").nth(k);
  await page.waitForTimeout(2500);
  check((await state(page, k)).counter.includes("1 / " + n), "a scene never starts by itself (still step 1 after 2.5 s)");
  await scene.getByRole("button", { name: "التالي" }).click();
  check((await state(page, k)).say === plain(b.config.steps[1].say), "«التالي» shows step 2 and its sentence");
  await scene.getByRole("button", { name: "السابق" }).click();
  check((await state(page, k)).counter.includes("1 / "), "«السابق» goes back to step 1");
  await scene.getByRole("button", { name: /شغّل/ }).click();
  check((await state(page, k)).playing === "true", "«شغّل» plays (aria-pressed)");
  await page.waitForTimeout(2200);
  await scene.getByRole("button", { name: /إيقاف/ }).click();
  const paused = await state(page, k);
  await page.waitForTimeout(2200);
  check(paused.playing === "false" && (await state(page, k)).counter === paused.counter && !paused.counter.includes("1 / "), "«إيقاف» pauses where it is (" + paused.counter + ")");
  await scene.getByRole("button", { name: /شغّل/ }).click();
  await page.waitForFunction(([i, n]) => document.querySelectorAll(".learning-scene")[i].querySelector(".learning-trace-counter").textContent.includes(n + " / " + n), [k, n], { timeout: 1900 * n });
  await page.waitForTimeout(2500);
  const end = await state(page, k);
  check(end.counter.includes(n + " / " + n) && end.playing === "false" && end.say === plain(b.config.steps[n - 1].say), "«شغّل» walks to the last step and stops there — no loop");
  await sceneShell(page, k).getByRole("button", { name: "إعادة تعيين" }).click();
  check((await state(page, k)).counter.includes("1 / "), "the shell's «إعادة تعيين» returns to step 1");
  await sceneShell(page, k).getByRole("button", { name: "توسيع" }).click();
  const full = await page.locator(".learning-activity.kind-animation.is-fullscreen .learning-scene.is-full").first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  await shot(page, "p11-fullscreen-1440");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check(full && await page.locator(".learning-activity.kind-animation.is-fullscreen").count() === 0, "«توسيع» shows the scene full screen; Escape closes it");

  console.log("4. presentation mode");
  await page.getByRole("button", { name: "وضع العرض" }).first().click();
  await page.locator(".learning-reader.is-presentation").first().waitFor({ timeout: 10000 });
  const pres = await page.locator(".learning-reader.is-presentation .learning-scene").count();
  const width = await page.evaluate(() => document.querySelector(".learning-reader.is-presentation .learning-scene-svg").getBoundingClientRect().width);
  await page.evaluate(axeSource + "\n;0");
  const pr = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter(x => x.impact === "serious" || x.impact === "critical").map(x => x.id));
  check(pres === first.scenes.length && width >= 500 && pr.length === 0, "presentation mode: the " + pres + " scenes are there, " + Math.round(width) + " px wide, axe — " + (pr.join(", ") || "clean"));
  await shot(page, "p11-presentation-1440");
  await page.getByRole("button", { name: "خروج من وضع العرض" }).first().click();
  await ctx.close();
}

console.log("2. reduced motion");
{
  const { ctx, page } = await session("teacher", { width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await teacherOpens(page, scenePages[0].id);
  const scene = page.locator(".learning-scene").first();
  await scene.getByRole("button", { name: "التالي" }).click();
  await scene.getByRole("button", { name: "التالي" }).click();
  const st = await state(page, 0);
  const running = await page.evaluate(() => document.getAnimations().filter(a => a.effect?.target?.closest?.(".learning-scene")).length);
  const transition = await page.evaluate(() => getComputedStyle(document.querySelector(".learning-scene .cs-i")).transitionDuration);
  check(st.still && st.counter.includes("3 / ") && running === 0 && /^0s(, 0s)*$/.test(transition), "the same steps with no animation and no transition (" + running + " animations, transition " + transition + ")");
  await ctx.close();
}

console.log("3. student: stepping sends nothing");
{
  const { ctx, page } = await session("student", { width: 390, height: 844 }, { touch: true });
  const sent = [];
  page.on("request", r => { if (r.method() !== "GET" && /\/api\//.test(r.url())) sent.push(r.method() + " " + r.url()); });
  await page.goto(origin + "/");
  await studentOpens(page, scenePages[0].id);
  sent.length = 0;
  const scene = page.locator(".learning-scene").first();
  for (let i = 0; i < 3; i++) await scene.getByRole("button", { name: "التالي" }).click();
  check((await state(page, 0)).counter.includes("4 / ") && sent.length === 0, "the student steps a chapter 1 scene; nothing is sent (" + sent.join(", ") + ")");
  await ctx.close();
}

console.log("5. axe, overflow and touch targets on every scene page");
const TARGETS = () => {
  const out = [];
  const inRunningText = el => el.tagName === "A" && el.closest("p, li, td") && (el.closest("p, li, td").textContent || "").trim().length > (el.textContent || "").trim().length + 8;
  for (const el of document.querySelectorAll(".learning-scene button, .learning-activity.kind-animation button")) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === "hidden" || el.closest("[aria-hidden=true], [inert]")) continue;
    if (inRunningText(el)) continue;
    if (r.width < 44 || r.height < 44) out.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40) + " " + Math.round(r.width) + "×" + Math.round(r.height));
  }
  return out;
};
for (const v of [{ width: 390, height: 844, touch: true }, { width: 1440, height: 900, touch: false }]) {
  for (const readTheme of ["light", "dark"]) {
    const { ctx, page } = await session("teacher", { width: v.width, height: v.height }, { touch: v.touch, readTheme });
    for (const sp of scenePages) {
      await teacherOpens(page, sp.id);
      for (let i = 0; i < sp.scenes.length; i++) { const s = page.locator(".learning-scene").nth(i); await s.getByRole("button", { name: "التالي" }).click(); await s.getByRole("button", { name: "التالي" }).click(); }
      await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"), null, { timeout: 5000 });
      await page.evaluate(axeSource + "\n;0");
      const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter(x => x.impact === "serious" || x.impact === "critical").map(x => x.id + " ×" + x.nodes.length + " " + x.nodes.map(n => n.target.join(" ")).join(" | ")));
      const where = sp.id.slice(7) + " " + v.width + "px " + readTheme;
      check(res.length === 0, where + ": axe — " + (res.join(", ") || "clean"));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      check(overflow <= 0, where + ": no page overflow (" + overflow + "px)");
      if (v.touch) {
        const small = await page.evaluate(TARGETS);
        check(small.length === 0, where + ": the scene controls are ≥ 44 px" + (small.length ? " — " + [...new Set(small)].join("; ") : ""));
      }
      for (let i = 0; i < sp.scenes.length; i++) {
        const el = page.locator(".learning-activity.kind-animation").nth(i);
        await el.scrollIntoViewIfNeeded();
        if (process.env.SHOT_DIR) await el.screenshot({ path: path.join(process.env.SHOT_DIR, "p11-" + sp.scenes[i].id + "-" + v.width + "-" + readTheme + ".png") });
      }
    }
    await ctx.close();
  }
}

await browser.close(); server.close();
console.log(failures.length ? "\n" + failures.length + " check(s) failed:\n  " + failures.join("\n  ") : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
