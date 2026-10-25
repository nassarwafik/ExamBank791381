#!/usr/bin/env node
// Phase 21E.1 slice 2 — Review Fix 1 real-Chromium check (certification only; never shipped). Drives a production build (DIST) through
// a real teacher session against a local mock of the teacher API (service workers blocked, nothing deployed), at desktop 1280×900,
// 150 % (853×600 @1.5), 200 % (640×450 @2) and phone 390×844 (touch), with reduced motion so scroll positions settle at once:
//   R1  place question 2's heading just below the sticky builder toolbar, delete it with the MOUSE and (after Ctrl+Z) with the
//       KEYBOARD (focus «حذف», Enter); record how far the builder scrolled, where focus went, and whether question 3's heading and
//       its «حذف» are below the toolbar, inside the viewport and not covered (real hit test). Then delete the section's last
//       question from the keyboard while a toast is still shown, its «حذف» under the toolbar: «+ إضافة سؤال» must land below it.
//   V1  the toast message's computed font size / line height, the card's height and whether it is inside the viewport — with the
//       fixture's section title and with a 120-character Arabic section title (the 200 % target: ≤ 90 px, nothing clipped).
//   A11Y axe-core (AXE_PATH, a local copy; never fetched here) on the toast region: all WCAG 2.x A / AA rules.
// Prints one JSON line per viewport and writes HARNESS_OUT/<label>/rf1.json plus screenshots.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-review-fix1-21e1s2"), label);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

const sq = (id, text) => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks: 2, answer: { text: "—" } });
const exam = { schemaVersion: 2, examId: "E2", title: "اختبار الشبكات — الوحدة الثالثة", status: "draft", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", metadata: {},
  sections: [{ id: "s1", title: "القسم الأول: العناوين", gradingPolicy: "all", stimuli: {}, instructions: "", questions: [sq("q1", "ما عنوان الشبكة للعنوان 192.168.1.37/24؟"), sq("q2", "كم عنوانًا صالحًا للأجهزة في الشبكة /26؟"), sq("q3", "ما القناع المكافئ للبادئة /27؟"), sq("q4", "اشرح الفرق بين العنوان العام والخاص.")] }] };
function api(req, res, body) {
  const u = new URL(req.url, "http://localhost"), p = u.pathname;
  const send = (code, j) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(j)); };
  let j = {}; try { j = JSON.parse(body || "{}"); } catch { /* not JSON */ }
  if (p === "/api/platform-session") return send(200, { ok: true, role: "teacher", displayName: "أ. أحمد" });
  if (p === "/api/teacher-profile") return send(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
  if (p === "/api/project-tracker") return send(200, u.searchParams.get("resource") === "projects-summary" ? { ok: true, totalReadyForReview: 0, byProject: {} } : { ok: true, projects: [] });
  if (p === "/api/messages") return send(200, { ok: true, totalUnread: 0, capped: false });
  if (p === "/api/saved-exams") {
    if (req.method === "GET") return send(200, { ok: true, exams: [{ blobName: "exams/e2.json", examId: "E2", title: exam.title, savedAt: "2026-10-01T10:00:00Z", questionCount: 4, totalMarks: 8 }] });
    if (j.action === "load") return send(200, { ok: true, exam, savedAt: "2026-10-01T10:00:00Z" });
  }
  return send(200, { ok: true, items: [], exams: [], templates: [], questions: [], classes: [], students: [], assignments: [], projects: [] });
}
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) { let b = ""; req.on("data", c => { b += c; }); req.on("end", () => api(req, res, b)); return; }
  let full = path.resolve(dist, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(dist + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) full = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [], record = { label, dist, viewports: {} };

/** Scroll the builder so question `id`'s heading sits 8 px below the sticky toolbar (where a teacher clicks its «حذف»). */
const PLACE = id => {
  const scroller = document.querySelector(".structured-builder-overlay"), bar = document.querySelector(".sb-toolbar"), el = document.getElementById("sb-q-" + id);
  scroller.scrollTop += el.getBoundingClientRect().top - (bar.getBoundingClientRect().bottom + 8);
  return scroller.scrollTop;
};
/** Where the page and focus are after a deletion; whether card `id`'s heading and «حذف» are on screen and can be hit. */
const STATE = ([id, before]) => {
  const scroller = document.querySelector(".structured-builder-overlay"), bar = document.querySelector(".sb-toolbar"), el = document.getElementById("sb-q-" + id);
  const toast = document.querySelector(".eb-toast");
  const barBottom = Math.round(bar.getBoundingClientRect().bottom), toastTop = toast ? Math.round(toast.getBoundingClientRect().top) : window.innerHeight;
  const r = el.getBoundingClientRect(), del = el.querySelector("button[aria-label='حذف']"), d = del.getBoundingClientRect();
  const hit = document.elementFromPoint(d.left + d.width / 2, d.top + d.height / 2);
  const a = document.activeElement;
  return { scrolledBy: Math.round(scroller.scrollTop - before), focus: a === el ? "card " + id : (a?.getAttribute("aria-label") || a?.tagName || "?"),
    headingTop: Math.round(r.top), toolbarBottom: barBottom, toastTop, viewportHeight: window.innerHeight,
    headingBelowToolbar: r.top >= barBottom - 1, headingInViewport: r.top + 24 <= window.innerHeight,
    deleteHittable: !!hit && (hit === del || del.contains(hit)) };
};
const TOAST = () => {
  const el = document.querySelector(".eb-toast"); if (!el) return null;
  const m = el.querySelector(".eb-toast-message"), cs = getComputedStyle(m), r = el.getBoundingClientRect(), v = window.visualViewport;
  const lh = parseFloat(cs.lineHeight);
  return { fontSize: cs.fontSize, lineHeight: cs.lineHeight, height: Math.round(r.height), lines: Math.round(m.getBoundingClientRect().height / lh),
    messageScrollsHidden: m.scrollHeight > m.clientHeight + 1 || m.scrollWidth > m.clientWidth + 1,
    inViewport: r.left >= v.offsetLeft - 1 && r.right <= v.offsetLeft + v.width + 1 && r.top >= v.offsetTop - 1 && r.bottom <= v.offsetTop + v.height + 1, text: m.textContent };
};

async function run(name, viewport, touch, dsf) {
  const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: dsf, locale: "ar", reducedMotion: "reduce", serviceWorkers: "block" });
  await ctx.addInitScript(() => { sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد"); });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(name + ": " + e)); page.on("console", m => { if (m.type() === "error") errors.push(name + " console: " + m.text()); });
  const shot = n => page.screenshot({ path: path.join(out, name + "-" + n + ".png") });
  const rec = record.viewports[name] = {};
  await page.goto(origin + "/", { waitUntil: "networkidle" });
  // QA2 4c — since the UX-R shell the teacher lands on the dashboard; the builder is reached from the sidebar's Exam Bank group (the
  // phone and zoomed layouts open the «القائمة» drawer first). Since 21F.7 the builder opens on the Exam Studio home; this check certifies
  // the CLASSIC builder, so it switches to «الواجهة الكلاسيكية», whose access bar holds «الامتحانات المحفوظة» as before.
  const builderNav = page.getByRole("button", { name: "باني الامتحان", exact: true }).first();
  await page.getByRole("button", { name: "القائمة", exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {});
  if (!(await builderNav.isVisible().catch(() => false))) await page.getByRole("button", { name: "القائمة", exact: true }).first().click().catch(() => {});
  await builderNav.click({ timeout: 15000 });
  const classic = page.locator("[data-studio-home]").getByRole("button", { name: "الواجهة الكلاسيكية", exact: true });
  await classic.waitFor({ timeout: 20000 }); await classic.click();
  const saved = page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first();
  await saved.waitFor({ timeout: 20000 }); await saved.click();
  const open = page.locator(".saved-exams-panel").getByRole("button", { name: /فتح وتعديل/ }).first();
  await open.waitFor({ timeout: 10000 }); await open.click();
  await page.locator("#sb-q-q3").waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  const del = id => page.locator("#sb-q-" + id + " button[aria-label='حذف']");

  // R1 — mouse
  let before = await page.evaluate(PLACE, "q2");
  await page.waitForTimeout(100);
  await del("q2").click({ timeout: 5000 }).catch(async () => { rec.mouseFallback = "pointer blocked; dispatched click"; await del("q2").dispatchEvent("click"); });
  await page.waitForTimeout(250);
  rec.mouse = await page.evaluate(STATE, ["q3", before]);
  rec.toast = await page.evaluate(TOAST);
  await shot("r1-mouse");
  if (process.env.AXE_PATH) {
    await page.addScriptTag({ path: process.env.AXE_PATH });
    rec.axeToast = await page.evaluate(async () => {
      const r = await window.axe.run(document.querySelector(".eb-toast-layer") || document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
      return { violations: r.violations.map(v => v.id + " ×" + v.nodes.length), passes: r.passes.length };
    });
  }
  await page.keyboard.press("Control+z"); await page.waitForTimeout(250);
  // R1 — keyboard
  before = await page.evaluate(PLACE, "q2");
  await page.waitForTimeout(100);
  await page.keyboard.press("Shift");
  await del("q2").focus(); before = await page.evaluate(() => document.querySelector(".structured-builder-overlay").scrollTop);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  rec.keyboard = await page.evaluate(STATE, ["q3", before]);
  await shot("r1-keyboard");
  await page.keyboard.press("Control+z"); await page.waitForTimeout(250);
  rec.restored = await page.locator("[data-question-id]").evaluateAll(els => els.map(e => e.dataset.questionId));
  // V1 — a 120-character section title
  const title = page.getByPlaceholder("عنوان القسم").first();
  await title.fill("القسم الأول: أسئلة العناوين والشبكات الفرعية وأقنعة الشبكة والتوجيه الثابت والديناميكي في الشبكات المحلية والواسعة");
  await page.locator("body").click({ position: { x: 2, y: 2 } }).catch(() => {});
  await page.evaluate(PLACE, "q1"); await page.waitForTimeout(100);
  await del("q1").click({ timeout: 5000 }).catch(async () => { await del("q1").dispatchEvent("click"); });
  await page.waitForTimeout(250);
  rec.toastLongTitle = await page.evaluate(TOAST);
  await shot("v1-long-title-toast");
  // R1 — the section's last question, deleted from the KEYBOARD while the previous toast is still shown, with its «حذف» under the
  // toolbar (where the browser's own focus scroll leaves it): focus falls back to «+ إضافة سؤال», which must land below the toolbar.
  for (const id of ["q2", "q3"]) await del(id).dispatchEvent("click");
  await page.waitForTimeout(250);
  await del("q4").focus();
  before = await page.evaluate(() => {
    const scroller = document.querySelector(".structured-builder-overlay"), bar = document.querySelector(".sb-toolbar"), el = document.getElementById("sb-q-q4");
    scroller.scrollTop += el.getBoundingClientRect().top - (bar.getBoundingClientRect().bottom - 40);
    return scroller.scrollTop;
  });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  rec.lastQuestionKeyboard = await page.evaluate(before => {
    const scroller = document.querySelector(".structured-builder-overlay"), bar = document.querySelector(".sb-toolbar"), add = document.querySelector("[data-add-question]");
    const toast = document.querySelector(".eb-toast"), barBottom = Math.round(bar.getBoundingClientRect().bottom), r = add.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { scrolledBy: Math.round(scroller.scrollTop - before), focus: document.activeElement === add ? "«+ إضافة سؤال»" : (document.activeElement?.textContent || "?").trim().slice(0, 40),
      addTop: Math.round(r.top), addBottom: Math.round(r.bottom), toolbarBottom: barBottom, toastTop: toast ? Math.round(toast.getBoundingClientRect().top) : null,
      viewportHeight: window.innerHeight, belowToolbar: r.top >= barBottom - 1, hittable: !!hit && (hit === add || add.contains(hit)) };
  }, before);
  await shot("r1-last-question-keyboard");
  await ctx.close();
}
await run("desktop", { width: 1280, height: 900 }, false, 1);
await run("desktop-150pct", { width: 853, height: 600 }, false, 1.5);
await run("desktop-200pct", { width: 640, height: 450 }, false, 2);
await run("phone", { width: 390, height: 844 }, true, 2);
await browser.close(); server.close();
record.errors = errors;
fs.writeFileSync(path.join(out, "rf1.json"), JSON.stringify(record, null, 2));
for (const [vp, r] of Object.entries(record.viewports)) console.log(label + " " + vp + " " + JSON.stringify(r));
console.log("errors: " + errors.length + (errors.length ? "\n" + errors.join("\n") : ""));
