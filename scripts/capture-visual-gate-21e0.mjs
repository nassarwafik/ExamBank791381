#!/usr/bin/env node
// Phase 21E.0 — Visual Quality Gate capture (certification only; never shipped). Drives the REAL production build of the app
// (DIST, default ./dist) in real Chromium through the real student workflow: session → student portal → open the assignment →
// the themed student exam page (PresentationRoot with the preset's palette) → answer an inline-cloze blank, a dropdown, a
// hotspot and a multiple-choice question with the keyboard / pointer → autosave feedback → next page. A tiny local mock of
// the student API (the same payload shapes the Vitest suites use) stands in for Azure Functions; nothing is deployed and no
// real token exists. For every viewport (desktop 1280×900, phone 390×844, desktop at 200 % scaling = 640×450 at 2×) it
// writes BEFORE/AFTER-comparable screenshots to HARNESS_OUT/<label>/ and a computed-style record of the focused control so a
// reviewer can compare two builds (e.g. DIST=<build of a8ef36f> LABEL=before · DIST=dist LABEL=after).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const preset = process.env.PRESET || "highContrast";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-visual-gate-21e0"), label + "-" + preset);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ---- fixtures (student-sanitized shapes, no answer key) ----
const IMG = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#e8eef5"/><rect x="60" y="120" width="160" height="110" rx="10" fill="#9fb3cc"/><text x="140" y="185" font-size="28" text-anchor="middle" fill="#1f2d3d">Router</text><rect x="580" y="120" width="160" height="110" rx="10" fill="#9fb3cc"/><text x="660" y="185" font-size="28" text-anchor="middle" fill="#1f2d3d">Switch</text><line x1="220" y1="175" x2="580" y2="175" stroke="#5b708a" stroke-width="6"/></svg>');
const questions = [
  { examQuestionId: "c1", type: "inlineCloze", questionTypeVersion: 1, text: "أكمل الفقرة التالية بالمصطلح الصحيح.", marks: 2,
    inlineCloze: { v: 1, segments: [{ type: "text", text: "يعمل بروتوكول " }, { type: "blank", id: "b1", control: "text" }, { type: "text", text: " في طبقة الشبكة، بينما يعمل عنوان MAC في طبقة " },
      { type: "blank", id: "b2", control: "dropdown", options: [{ id: "o1", label: "Physical" }, { id: "o2", label: "Data Link" }, { id: "o3", label: "Transport" }] }, { type: "text", text: "." }] } },
  { examQuestionId: "h1", type: "hotspot", questionTypeVersion: 1, text: "حدّد الموجّه (Router) على المخطط.", marks: 1,
    image: { exists: true, visible: true, assets: [{ dataUrl: IMG, origin: "uploaded", contentType: "image/svg+xml" }] }, hotspot: { v: 1, mode: "single", selections: 1, alt: "مخطط شبكة فيه موجّه ومبدّل" } },
  { examQuestionId: "m1", presentationType: "multipleChoice", text: "في أي طبقة يعمل عنوان IP؟", marks: 1, options: [{ text: "طبقة الشبكة" }, { text: "طبقة الربط" }, { text: "طبقة النقل" }] },
];
const exam = { title: "اختبار الشبكات — الوحدة الثانية", metadata: {}, presentation: { schemaVersion: 1, preset }, sections: [{ id: "s1", title: "أساسيات الشبكات", gradingPolicy: "all", stimuli: {}, questions }] };
const assignment = { assignmentId: "asg-21e0", title: "اختبار الشبكات — الوحدة الثانية", instructions: "أجب عن كل الأسئلة. تُحفظ إجاباتك تلقائيًا.", openAt: "", dueAt: "2026-12-01T10:30:00.000Z", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: questions.length, totalMarks: 4, exam };
const summary = { assignmentId: assignment.assignmentId, title: assignment.title, instructions: assignment.instructions, openAt: "", dueAt: assignment.dueAt, effectiveDueAt: "", questionCount: questions.length, totalMarks: 4, durationMinutes: 0, availability: "open", attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, attemptStatus: "notStarted", hasActiveAttempt: false, latestScore: null, latestPercentage: null, latestResult: null, createdAt: "2026-10-01T08:00:00.000Z" };
const state = { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: new Date().toISOString(), activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, durationMinutes: 0 };
const dashboard = { ok: true, student: { userId: "u1", code: "C-1", displayName: "سارة", classId: "c1", shareAchievements: false }, classroom: { classId: "c1", name: "الحادي عشر — أ", grade: "11", schoolYear: "2026" }, assignments: [summary], stats: { assigned: 1, completed: 0, average: 0 } };
const apiCalls = [];
function api(req, res, body) {
  const u = new URL(req.url, "http://localhost"), p = u.pathname;
  apiCalls.push(req.method + " " + p + (body ? " " + body.slice(0, 80) : ""));
  const send = (code, j) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(j)); };
  if (p === "/api/platform-session") return send(200, { ok: true, role: "student", displayName: "سارة" });
  if (p === "/api/student-dashboard") return send(200, dashboard);
  if (p.startsWith("/api/student-assignment/")) return send(200, { ok: true, assignment });
  if (p.startsWith("/api/student-submission/")) {
    if (req.method === "GET") return send(200, { ok: true, state });
    let j = {}; try { j = JSON.parse(body || "{}"); } catch {}
    if (j.action === "saveDraft") return send(200, { ok: true, savedAt: new Date().toISOString() });
    return send(200, { ok: true, state });
  }
  return send(200, { ok: true, items: [], posts: [], materials: [], events: [], unread: 0, count: 0, messages: [], threads: [] });
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
const errors = [], record = { label, preset, dist, viewports: {} };

const focused = page => page.evaluate(() => {
  const el = document.activeElement; if (!el || el === document.body) return null;
  const ring = el.closest(".iex-option") || el; const c = getComputedStyle(ring);
  return { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), outline: c.outlineStyle + " " + c.outlineWidth + " " + c.outlineColor, offset: c.outlineOffset, inExam: !!el.closest(".exam-presentation") };
});
async function tabTo(page, selector, max = 25) {
  for (let i = 0; i < max; i++) { await page.keyboard.press("Tab"); if (await page.evaluate(s => document.activeElement === document.querySelector(s), selector)) return true; }
  return false;
}
async function run(name, viewport, mobile, dsf) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: dsf, locale: "ar", reducedMotion: "reduce" });
  await ctx.addInitScript(() => { sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", "student"); sessionStorage.setItem("examBankSessionDisplayName", "سارة"); });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(name + ": " + e)); page.on("console", m => { if (m.type() === "error") errors.push(name + " console: " + m.text()); });
  const shot = (n, full = false) => page.screenshot({ path: path.join(out, name + "-" + n + ".png"), fullPage: full });
  const rec = record.viewports[name] = { steps: [] };
  await page.goto(origin + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".eb-sp-task-action", { timeout: 20000 });
  await shot("01-portal");
  await page.click(".eb-sp-task-action");
  await page.waitForSelector(".exam-presentation", { timeout: 20000 });
  await page.waitForSelector(".cloze-input", { timeout: 20000 });
  rec.examRoot = await page.evaluate(() => { const r = document.querySelector(".exam-presentation"); return { preset: r.getAttribute("data-xp-preset"), primary: getComputedStyle(r).getPropertyValue("--xp-primary").trim() }; });
  await shot("02-exam-q1-cloze");
  // keyboard: Tab into the cloze blank, type, Tab to the dropdown, pick with the keyboard
  rec.steps.push({ step: "tab-cloze-input", reached: await tabTo(page, ".cloze-input"), focus: null });
  rec.steps[rec.steps.length - 1].focus = await focused(page);
  await shot("03-exam-q1-cloze-input-focused");
  await page.keyboard.type("IP");
  rec.steps.push({ step: "tab-cloze-select", reached: await tabTo(page, ".cloze-select", 3), focus: null });
  rec.steps[rec.steps.length - 1].focus = await focused(page);
  await page.selectOption(".cloze-select", "o2");
  await shot("04-exam-q1-cloze-select-focused");
  await page.waitForTimeout(1200);
  rec.saveState = await page.evaluate(() => document.querySelector(".iex-save-state")?.textContent || "");
  await shot("05-exam-q1-answered-saved");
  await page.click(".iex-nav button:has-text('التالي'), button:has-text('التالي')");
  await page.waitForSelector(".vq-overlay", { timeout: 20000 });
  await shot("06-exam-q2-hotspot");
  await page.locator(".vq-image").evaluate(i => i.complete && i.naturalWidth > 0 ? null : new Promise(r => { i.onload = r; i.onerror = r; }));
  // pointer: place the point on the router; keyboard: Tab to the marker
  await page.locator(".vq-overlay").scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  const box = await page.locator(".vq-overlay").boundingBox();
  await page.mouse.click(box.x + box.width * 0.17, box.y + box.height * 0.45);
  await page.waitForSelector(".vq-marker", { timeout: 10000 });
  rec.steps.push({ step: "tab-hotspot-marker", reached: await tabTo(page, ".vq-marker"), focus: null });
  rec.steps[rec.steps.length - 1].focus = await focused(page);
  await shot("07-exam-q2-hotspot-marker-focused");
  await page.click("button:has-text('التالي')");
  await page.waitForSelector(".iex-option input[type=radio]", { timeout: 20000 });
  rec.steps.push({ step: "tab-mcq-option", reached: await tabTo(page, ".iex-option input[type=radio]"), focus: null });
  rec.steps[rec.steps.length - 1].focus = await focused(page);
  await shot("08-exam-q3-mcq-option-focused");
  await page.keyboard.press("Space");
  await page.waitForTimeout(1200);
  rec.saveState2 = await page.evaluate(() => document.querySelector(".iex-save-state")?.textContent || "");
  await shot("09-exam-q3-answered");
  rec.overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  await shot("10-exam-q3-full", true);
  await ctx.close();
}
await run("desktop", { width: 1280, height: 900 }, false, 1);
await run("phone", { width: 390, height: 844 }, true, 2);
await run("desktop-200pct", { width: 640, height: 450 }, false, 2);
await browser.close(); server.close();
record.errors = errors; record.apiCalls = apiCalls.filter((v, i, a) => a.indexOf(v) === i).slice(0, 40);
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log(JSON.stringify({ label, preset, out, errors: errors.length, viewports: Object.fromEntries(Object.entries(record.viewports).map(([k, v]) => [k, { root: v.examRoot, save: v.saveState, save2: v.saveState2, overflow: v.overflow, steps: v.steps.map(s => s.step + ": " + (s.reached ? "reached" : "NOT reached") + " — " + (s.focus ? s.focus.outline + " inExam=" + s.focus.inExam : "no focus")) }])) }, null, 2));
if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
