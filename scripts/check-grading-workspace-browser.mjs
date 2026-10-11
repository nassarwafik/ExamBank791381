#!/usr/bin/env node
// UX-003 — real-Chromium certification of the TEACHER GRADING WORKSPACE (browser-harness/grading-workspace.*): the production
// AssignmentReview inside its production overlay with the production stylesheets, on a mixed attempt (correct / wrong / pending /
// partial / unanswered / true-false) served by an in-page review API. Checks (visibility claims are hit tests + real pointer clicks):
//   • every question carries a text + icon state; a pending manual review is never shown as wrong;
//   • «يحتاج إلى تصحيح يدوي» (and the other filters) show only matching questions, with live counts;
//   • the navigator jumps to a question (scrolled into view, focused, marked current); previous / next / next-pending work;
//   • a typed mark is a provisional «غير محفوظ» state; closing then asks ON TOP of the review (the review modal sits under the
//     modal layer); «البقاء في التصحيح» keeps the edit; the save POSTs the override body and the reload shows it as graded;
//   • RF1: every card carries its review MODE (آلي / يدوي محفوظ / غير محفوظ / بانتظار المعلم) and the counts split by mode;
//     switching to another attempt with unsaved edits asks ON TOP of the review — «البقاء في هذه المحاولة» keeps the attempt and
//     the edit, «الانتقال دون حفظ» loads the other attempt; a switch without edits is immediate;
//   • Escape on a clean review closes it; keyboard reaches the filters;
//   • no horizontal overflow on desktop (1280), laptop (1366×768), tablet (820×1180) and phone (390×844, touch), where the
//     navigator collapses into a disclosure and taps work.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-grading-workspace"));
const shots = path.join(out, "shots");
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : "")); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", publicDir: false, build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/grading-workspace.html") } } });
fs.mkdirSync(shots, { recursive: true });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port, PAGE = origin + "/browser-harness/grading-workspace.html";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [];
const CLICK = { timeout: 2500 };
async function openPage(ctx) {
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.waitForSelector(".review-question", { timeout: 10000 });
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(shots, name + ".png"), fullPage: false });
const states = page => page.$$eval(".review-question [data-testid=rv-status]", els => els.map(e => e.getAttribute("data-state")));
const labels = page => page.$$eval(".review-question", els => els.map(e => e.getAttribute("aria-label")));
const filterBtn = (page, id) => page.locator('.rv-filter[data-filter="' + id + '"]');
const noOverflow = page => page.evaluate(() => { const modal = document.querySelector(".review-modal"); return document.documentElement.scrollWidth <= window.innerWidth + 1 && (!modal || modal.scrollWidth <= modal.clientWidth + 1); });
async function topDialog(page) {
  return page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll(".eb-dialog-root:not(.is-covered) [role=dialog]"));
    const panel = panels[panels.length - 1]; if (!panel) return null;
    const title = panel.querySelector(".eb-dialog-title") || panel, r = title.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { name: (title.textContent || "").trim(), onTop: !!hit && panel.contains(hit), hit: hit ? hit.tagName.toLowerCase() + "." + String(hit.className).split(" ")[0] : "nothing" };
  });
}
async function tryClick(locator, opts = {}) { try { await locator.click({ ...CLICK, ...opts }); return { ok: true }; } catch (e) { return { ok: false, error: String(e && e.message || e).split("\n")[0] }; } }
const inView = (page, label) => page.evaluate(l => { const el = Array.from(document.querySelectorAll(".review-question")).find(a => a.getAttribute("aria-label") === l); if (!el) return false; const r = el.getBoundingClientRect(), m = document.querySelector(".review-modal").getBoundingClientRect(); return r.top >= m.top - 1 && r.top < m.bottom - 40; }, label);
const focusedLabel = page => page.evaluate(() => document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim() || "");

try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await openPage(desktop);
  let d = null;
  await shot(page, "01-workspace-desktop");
  check("desktop: no horizontal overflow of the page or the review", await noOverflow(page));
  const st = await states(page);
  check("every question has a text + icon state derived from the server projection", st.join() === "correct,incorrect,pending,partial,unanswered,incorrect,pending", st.join());
  check("a pending manual review is labelled «بانتظار التصحيح اليدوي», never «خاطئة»", (await page.$$eval(".review-question", els => els.filter(e => e.querySelector("[data-testid=rv-status]")?.getAttribute("data-state") === "pending").map(e => e.querySelector("[data-testid=rv-status]").textContent.trim()))).every(t => t.includes("بانتظار التصحيح اليدوي")));
  check("summary splits the counts by review mode: pending 2 / manual 0 / automatic 5 / unsaved 0", (await page.textContent("[data-testid=rv-count-pending]")) === "2" && (await page.textContent("[data-testid=rv-count-manual]")) === "0" && (await page.textContent("[data-testid=rv-count-auto]")) === "5" && (await page.textContent("[data-testid=rv-count-draft]")) === "0");
  const modes = await page.$$eval(".review-question [data-testid=rv-mode]", els => els.map(e => e.getAttribute("data-mode") + ":" + e.textContent.trim()));
  check("every card carries its review mode in text (automatic vs pending here)", modes.join() === "auto:تصحيح آلي,auto:تصحيح آلي,pending:بانتظار المعلم,auto:تصحيح آلي,auto:تصحيح آلي,auto:تصحيح آلي,pending:بانتظار المعلم", modes.join());
  const q1 = page.locator(".review-question[aria-label='السؤال 1'] [data-testid=rv-choices]");
  check("choice question 1 renders exam-style with the student's correct pick marked", (await q1.locator(".rv-choice.is-picked.is-right").count()) === 1 && (await q1.textContent()).includes("الراوتر"));
  const q2 = page.locator(".review-question[aria-label='السؤال 2'] [data-testid=rv-choices]");
  check("choice question 2 marks the wrong pick AND the correct option in text", (await q2.locator(".rv-choice.is-picked.is-wrong").count()) === 1 && (await q2.locator(".rv-choice.is-key:not(.is-picked)").textContent()).includes("الإجابة الصحيحة"));

  // filters
  let r = await tryClick(filterBtn(page, "pending"));
  check("«يحتاج إلى تصحيح يدوي» is clickable and shows only the two pending questions", r.ok && (await labels(page)).join() === "السؤال 3,السؤال 7", r.error || (await labels(page)).join());
  check("the pending filter chip carries its live count", (await filterBtn(page, "pending").textContent()).includes("(2)"));
  await shot(page, "02-filter-pending");
  await filterBtn(page, "incorrect").click();
  check("«إجابة خاطئة» shows questions 2 and 6 only", (await labels(page)).join() === "السؤال 2,السؤال 6");
  await filterBtn(page, "all").click();
  check("«الكل» restores every question", (await labels(page)).length === 7);

  // navigator + pager
  const nav = page.locator("[data-testid=rv-nav]");
  r = await tryClick(nav.getByRole("button").nth(6));
  check("navigator: clicking question 7 scrolls it into view and focuses it", r.ok && (await inView(page, "السؤال 7")) && (await focusedLabel(page)) === "السؤال 7", r.error || "focus: " + (await focusedLabel(page)));
  check("navigator: question 7 is marked current", (await nav.getByRole("button").nth(6).getAttribute("aria-current")) === "true");
  await shot(page, "03-nav-jump-q7");
  await page.getByRole("button", { name: /السؤال السابق/ }).click();
  check("«السؤال السابق» moves to question 6", (await focusedLabel(page)) === "السؤال 6");
  await page.getByTestId("rv-next-pending").click();
  check("«التالي بانتظار التصحيح» jumps to the next pending question (7, wrapping later to 3)", (await focusedLabel(page)) === "السؤال 7");
  await page.getByTestId("rv-next-pending").click();
  check("… and wraps around to question 3", (await focusedLabel(page)) === "السؤال 3" && (await inView(page, "السؤال 3")));

  // draft mark + unsaved guard
  const mark = page.locator(".review-question[aria-label='السؤال 3']").getByLabel(/علامة المعلم/);
  await mark.fill("4");
  check("a typed mark becomes a provisional «غير محفوظ» state", (await page.locator(".review-question[aria-label='السؤال 3'] [data-testid=rv-status]").textContent()).includes("(غير محفوظ)") && (await page.locator(".review-question[aria-label='السؤال 3'] [data-testid=rv-status]").getAttribute("data-state")) === "partial");
  check("… and its mode chip reads «تعديل غير محفوظ»; the unsaved count is 1", (await page.locator(".review-question[aria-label='السؤال 3'] [data-testid=rv-mode]").getAttribute("data-mode")) === "draft" && (await page.textContent("[data-testid=rv-count-draft]")) === "1");
  check("the footer shows the unsaved indicator", (await page.locator(".rv-unsaved").count()) === 1);

  // RF1 — attempt switching with unsaved edits
  const tab2 = page.getByRole("button", { name: /^محاولة 2 / });
  await tab2.click();
  await page.waitForSelector(".eb-dialog-root [role=dialog]", { state: "attached", timeout: 5000 });
  d = await topDialog(page);
  await shot(page, "04a-attempt-switch-guard");
  check("switching to attempt 2 with an unsaved mark asks first — ON TOP of the review", d && d.name === "تعديلات تصحيح غير محفوظة" && d.onTop, d ? d.name + " hit: " + d.hit : "no dialog");
  r = await tryClick(page.getByRole("button", { name: "البقاء في هذه المحاولة", exact: true }));
  check("«البقاء في هذه المحاولة» keeps attempt 1 and the typed mark", r.ok && (await page.getByRole("button", { name: /^محاولة 1 / }).getAttribute("class")).includes("active") && (await mark.inputValue()) === "4" && (await page.locator(".rv-unsaved").count()) === 1, r.error || "");
  await page.getByRole("button", { name: /إلغاء/ }).click();
  await page.waitForSelector("[role=dialog].eb-dialog, .eb-dialog-root [role=dialog]", { state: "attached", timeout: 5000 });
  d = await topDialog(page);
  await shot(page, "04-unsaved-guard");
  check("closing with an unsaved mark asks first — and the confirmation is painted ON TOP of the review", d && d.name === "تعديلات تصحيح غير محفوظة" && d.onTop, d ? d.name + " hit: " + d.hit : "no dialog");
  r = await tryClick(page.getByRole("button", { name: "البقاء في التصحيح", exact: true }));
  check("«البقاء في التصحيح» can be clicked and keeps the typed mark", r.ok && (await mark.inputValue()) === "4" && (await page.evaluate(() => window.__host.closed)) === 0, r.error || "");

  // save → POST → reload shows graded
  await page.getByRole("button", { name: /حفظ واعتماد التصحيح/ }).click();
  await page.waitForFunction(() => window.__host.saved === 1, null, { timeout: 8000 });
  const post = await page.evaluate(() => window.__host.posts[0]);
  check("save POSTs the unchanged saveReview body with the override", post && post.action === "saveReview" && post.overrides && post.overrides.q3 && post.overrides.q3.score === 4, JSON.stringify(post && post.overrides));
  await page.waitForFunction(() => document.querySelector("[data-testid=rv-count-pending]")?.textContent === "1", null, { timeout: 8000 });
  check("after the reload the question is graded (server state), the pending count drops to 1 and the indicator is gone", (await page.locator(".review-question[aria-label='السؤال 3'] [data-testid=rv-status]").getAttribute("data-state")) === "partial" && !(await page.locator(".review-question[aria-label='السؤال 3'] [data-testid=rv-status]").textContent()).includes("غير محفوظ") && (await page.locator(".rv-unsaved").count()) === 0);
  check("… its mode is now «تصحيح يدوي محفوظ» and the manual count is 1", (await page.locator(".review-question[aria-label='السؤال 3'] [data-testid=rv-mode]").getAttribute("data-mode")) === "manual" && (await page.textContent("[data-testid=rv-count-manual]")) === "1" && (await page.textContent("[data-testid=rv-count-draft]")) === "0");
  await shot(page, "05-after-save");

  // RF1 — a clean switch is immediate; attempt 2 shows its own saved override; switching back with an edit → confirm discards
  await tab2.click();
  await page.waitForFunction(() => document.querySelector(".review-attempt-tabs button.active")?.textContent?.startsWith("محاولة 2"), null, { timeout: 8000 });
  check("switching with no unsaved edits loads attempt 2 at once (no dialog)", (await page.locator(".eb-dialog-root [role=dialog]").count()) === 0 && (await page.textContent("[data-testid=rv-count-pending]")) === "0" && (await page.textContent("[data-testid=rv-count-manual]")) === "1");
  check("attempt 2's saved override is shown as «تصحيح يدوي محفوظ» on question 2", (await page.locator(".review-question[aria-label='السؤال 2'] [data-testid=rv-mode]").getAttribute("data-mode")) === "manual");
  await page.locator(".review-question[aria-label='السؤال 4']").getByLabel(/علامة المعلم/).fill("1");
  await page.getByRole("button", { name: /^محاولة 1 / }).click();
  await page.waitForSelector(".eb-dialog-root [role=dialog]", { state: "attached", timeout: 5000 });
  r = await tryClick(page.getByRole("button", { name: "الانتقال دون حفظ", exact: true }));
  await page.waitForFunction(() => document.querySelector(".review-attempt-tabs button.active")?.textContent?.startsWith("محاولة 1"), null, { timeout: 8000 });
  check("«الانتقال دون حفظ» loads attempt 1 cleanly (no unsaved indicator; attempt 1's saved mark on question 3 is intact)", r.ok && (await page.locator(".rv-unsaved").count()) === 0 && (await page.locator(".review-question[aria-label='السؤال 3'] [data-testid=rv-mode]").getAttribute("data-mode")) === "manual", r.error || "");
  await shot(page, "05b-after-attempt-switch");

  // keyboard + clean close
  await filterBtn(page, "all").focus();
  await page.keyboard.press("Tab");
  check("keyboard: Tab moves from «الكل» to the pending filter", (await page.evaluate(() => document.activeElement?.getAttribute("data-filter"))) === "pending");
  await page.keyboard.press("Enter");
  check("keyboard: Enter applies the pending filter", (await labels(page)).join() === "السؤال 7");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".review-overlay", { state: "detached", timeout: 5000 });
  check("Escape on a clean review closes it at once and returns to the results screen", (await page.evaluate(() => window.__host.closed)) === 1 && (await page.isVisible("[data-testid=teacher-workspace]")));

  // laptop + tablet overflow
  for (const [w, h, name] of [[1366, 768, "laptop"], [820, 1180, "tablet"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await openPage(ctx);
    await shot(p, "06-" + name);
    check(name + " (" + w + "×" + h + "): no horizontal overflow; filters and navigator present", (await noOverflow(p)) && (await p.locator(".rv-filter").count()) === 8 && (await p.locator("[data-testid=rv-nav]").count()) === 1);
    await ctx.close();
  }

  // phone
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  page = await openPage(phone);
  await shot(page, "07-phone");
  check("phone: no horizontal overflow", await noOverflow(page));
  const summary = page.locator(".rv-aside details > summary");
  check("phone: the navigator is a disclosure above the questions", (await summary.isVisible()) && (await summary.textContent()).includes("مستكشف الأسئلة"));
  await summary.tap();
  check("phone: tapping the disclosure collapses the navigator", !(await page.locator(".rv-aside details").evaluate(d => d.open)));
  await summary.tap();
  r = await tryClick(filterBtn(page, "pending"), { force: false });
  check("phone: the pending filter responds to a tap and shows only pending questions", r.ok && (await labels(page)).join() === "السؤال 3,السؤال 7", r.error || "");
  await shot(page, "08-phone-pending");
  const chip = page.locator(".review-question[aria-label='السؤال 3'] [data-testid=rv-status]");
  check("phone: the status chip is within the viewport (readable)", await chip.evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
  await phone.close();
  await desktop.close();
} catch (e) {
  check("harness ran to completion", false, String(e && e.stack || e));
} finally {
  await browser.close();
  server.close();
}
check("no page errors", errors.length === 0, errors.slice(0, 5).join(" | "));
const failed = checks.filter(c => !c.ok);
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ origin: "grading-workspace", page: PAGE, checks, failed: failed.length }, null, 2));
console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed; screenshots in " + shots);
process.exit(failed.length ? 1 : 0);
