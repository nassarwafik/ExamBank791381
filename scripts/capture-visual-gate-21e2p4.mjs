#!/usr/bin/env node
// Phase 21E.2 — Premium Redesign slice 4 (exam lists): visual capture + functional checks on the REAL teacher exam page (certification
// only; never shipped). Production build (DIST) in real Chromium against a small local mock of the teacher API: the access bar
// («الامتحانات المحفوظة» / «القوالب» / «امتحان منظّم جديد» / «استيراد امتحان منظّم»), the saved-exams panel (5 exams) and the
// templates panel (3 templates).
//   L-1 the saved-exams panel lists 5 exams with title, counts and «آخر حفظ»    L-2 the templates panel lists 3 templates
//   L-3 «فتح وتعديل» on a saved exam opens it in the structured builder (and nothing else)
//   L-4 «حذف» asks for confirmation; cancelling keeps all 5 rows                 V-1 no horizontal overflow
//   T-1 touch: access-bar and row actions ≥ 44 px                              E-1 no page / console errors
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-visual-gate-21e2p4"), label);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

const exams = [
  ["اختبار الشبكات — الوحدة الثالثة", 18, 60, "2026-10-12T18:20:00Z"], ["امتحان منتصف الفصل — عنونة IPv4", 24, 100, "2026-10-10T09:05:00Z"],
  ["تدريب: الشبكات الفرعية والأقنعة", 12, 40, "2026-10-08T14:45:00Z"], ["اختبار قصير — بروتوكولات الطبقة الثالثة", 8, 20, "2026-10-02T07:30:00Z"],
  ["بجروت تجريبي 791381 — نموذج أ", 30, 100, "2026-09-28T11:00:00Z"]
].map(([title, questionCount, totalMarks, savedAt], i) => ({ blobName: "exams/e" + i + ".json", examId: "E" + i, title, questionCount, totalMarks, savedAt }));
const templates = [["قالب اختبار قصير (20 علامة)", 8, 20], ["قالب امتحان فصلي — ثلاثة أقسام", 24, 100], ["قالب بجروت 791381", 30, 100]]
  .map(([title, totalQuestions, totalMarks], i) => ({ blobName: "templates/t" + i + ".json", templateId: "T" + i, title, totalQuestions, totalMarks, savedAt: "2026-09-1" + i + "T10:00:00Z" }));
const exam0 = { schemaVersion: 2, examId: "E0", title: exams[0].title, status: "draft", metadata: {}, sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, instructions: "",
  questions: [{ examQuestionId: "q1", presentationType: "trueFalse", marks: 1, text: "بروتوكول DHCP يوزّع العناوين تلقائيًا.", answer: { correct: true } }] }] };

function api(req, res, body) {
  const u = new URL(req.url, "http://localhost"), p = u.pathname;
  const send = (code, j) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(j)); };
  let j = {}; try { j = JSON.parse(body || "{}"); } catch { /* not JSON */ }
  if (p === "/api/platform-session") return send(200, { ok: true, role: "teacher", displayName: "أ. أحمد" });
  if (p === "/api/teacher-profile") return send(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
  if (p === "/api/project-tracker") return send(200, u.searchParams.get("resource") === "projects-summary" ? { ok: true, totalReadyForReview: 0, byProject: {} } : { ok: true, projects: [] });
  if (p === "/api/messages") return send(200, { ok: true, totalUnread: 0, capped: false, threads: [] });
  if (p === "/api/saved-exams" && req.method === "GET") return send(200, { ok: true, exams });
  if (p === "/api/saved-exams" && j.action === "load") return send(200, { ok: true, exam: exam0, savedAt: exams[0].savedAt });
  if (p === "/api/templates" && req.method === "GET") return send(200, { ok: true, templates });
  return send(200, { ok: true, items: [], exams: [], templates: [], questions: [], classes: [], students: [], assignments: [], projects: [], posts: [] });
}
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
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
const errors = [], checks = [], record = { label, dist, viewports: {} };
const check = (vp, id, ok, detail) => { checks.push({ vp, id, ok, detail }); };
const VIEWPORTS = [["desktop", { width: 1280, height: 900 }, false, 1], ["150pct", { width: 853, height: 600 }, false, 1.5], ["200pct", { width: 640, height: 450 }, false, 2], ["phone", { width: 390, height: 844 }, true, 2]];

for (const [name, viewport, touch, dsf] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: dsf, locale: "ar", reducedMotion: "reduce", serviceWorkers: "block" });
  await ctx.addInitScript(() => { sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد"); });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(name + ": " + e)); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(name + " console: " + m.text()); });
  const rec = record.viewports[name] = {};
  const shoot = async (locator, file) => {
    const vp = page.viewportSize(); await page.setViewportSize({ width: vp.width, height: 2400 }); await page.waitForTimeout(250);
    try { await locator.screenshot({ path: path.join(out, name + "-" + file + ".png"), timeout: 8000 }); } catch (e) { errors.push(name + " shot " + file + ": " + String(e.message || e).split("\n")[0]); }
    await page.setViewportSize(vp); await page.waitForTimeout(250);
  };
  let step = "open";
  try {
    await page.goto(origin + "/", { waitUntil: "networkidle" });
    const bar = page.locator(".saved-exams-access");
    await bar.waitFor({ timeout: 20000 });
    step = "lists";
    await bar.getByRole("button", { name: /الامتحانات المحفوظة/ }).click();
    const saved = page.locator(".saved-exams-panel");
    await saved.locator(".saved-exam-item").first().waitFor({ timeout: 8000 });
    await bar.getByRole("button", { name: /القوالب/ }).click();
    const tpl = page.locator(".templates-panel");
    await tpl.locator(".saved-exam-item").first().waitFor({ timeout: 8000 }); await page.waitForTimeout(300);
    rec.saved = await saved.locator(".saved-exam-item").evaluateAll(els => els.map(e => e.innerText.replace(/\s+/g, " ").trim()));
    check(name, "L-1 the saved-exams panel lists 5 exams with title, counts and «آخر حفظ»", rec.saved.length === 5 && rec.saved.every(t => /سؤال/.test(t) && /علامة/.test(t) && /آخر حفظ/.test(t)), rec.saved.length + " · " + (rec.saved[0] || "").slice(0, 80));
    rec.templates = await tpl.locator(".saved-exam-item").count();
    check(name, "L-2 the templates panel lists 3 templates", rec.templates === 3, String(rec.templates));
    if (touch) {
      rec.smallTargets = await page.evaluate(() => [...document.querySelectorAll(".saved-exams-access button, .saved-exam-actions button, .saved-exams-heading button")].map(el => {
        const r = el.getBoundingClientRect(); return { n: el.textContent.trim().slice(0, 18), h: Math.round(r.height), w: Math.round(r.width) };
      }).filter(x => x.h && (x.h < 44 || x.w < 44)).slice(0, 8));
      check(name, "T-1 touch: access-bar and row actions ≥ 44 px", rec.smallTargets.length === 0, JSON.stringify(rec.smallTargets));
    }
    await bar.evaluate(n => n.scrollIntoView({ block: "start" })); await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, name + "-viewport-lists.png") });
    await shoot(bar, "access-bar");
    await shoot(saved, "saved-panel");
    await shoot(tpl, "templates-panel");
    rec.overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    check(name, "V-1 no horizontal page overflow", rec.overflow.scrollWidth <= rec.overflow.clientWidth, JSON.stringify(rec.overflow));

    step = "delete-cancel";
    page.once("dialog", d => { rec.nativeDialog = d.message(); d.dismiss(); });
    await saved.locator(".saved-delete-button").nth(1).click(); await page.waitForTimeout(400);
    const confirmDlg = page.getByRole("dialog");
    rec.confirmShown = rec.nativeDialog ? "native" : (await confirmDlg.count()) ? "dialog" : "none";
    if (rec.confirmShown === "dialog") { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
    rec.afterCancel = await saved.locator(".saved-exam-item").count();
    check(name, "L-4 «حذف» asks for confirmation; cancelling keeps all 5 rows", rec.confirmShown !== "none" && rec.afterCancel === 5, JSON.stringify({ confirm: rec.confirmShown, rows: rec.afterCancel }));

    step = "open-exam";
    await saved.locator(".saved-open-button").first().click();
    await page.locator(".sb-builder").waitFor({ timeout: 10000 });
    rec.opened = (await page.locator(".sb-exam-title").inputValue().catch(() => "")) || "";
    check(name, "L-3 «فتح وتعديل» opens that exam in the structured builder", rec.opened === exams[0].title, rec.opened);
  } catch (e) { await page.screenshot({ path: path.join(out, name + "-error-" + step + ".png") }).catch(() => {}); errors.push(name + " harness [" + step + "]: " + String(e && e.message || e).split("\n")[0]); }
  await ctx.close();
}
await browser.close(); server.close();
check("all", "E-1 no page or console errors", errors.length === 0, JSON.stringify(errors.slice(0, 5)));
record.checks = checks; record.errors = errors;
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
for (const c of checks) console.log("CHECK " + (c.ok ? "PASS" : "FAIL") + " [" + c.vp + "] " + c.id + " — " + c.detail);
console.log(label + ": " + checks.filter(c => c.ok).length + "/" + checks.length + " checks passed; page errors: " + errors.length);
