#!/usr/bin/env node
// Phase 21F.1 — typing latency in the structured exam builder (certification only; never shipped).
// Drives a production build (DIST, default ./dist) in real Chromium against a local mock of the teacher API, opens a saved
// structured exam of N questions (default 30 and 100) and types into one question's prompt. Each keystroke's cost is read from the
// Event Timing API (the `keydown` / `input` entries: input delay + handlers + React render + commit + next paint), so the number
// is what a teacher feels, not a synthetic render count.
//   DIST=… LABEL=before|after SIZES=30,100 [STUDIO=1] node scripts/measure-builder-input-21f.mjs
// Prints p50 / p95 / max per size and writes HARNESS_OUT/<label>/input-latency.json.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const sizes = String(process.env.SIZES || "30,100").split(",").map(Number).filter(n => n > 0);
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-21f1"), label);
const studio = process.env.STUDIO === "1";
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const KINDS = [
  i => ({ presentationType: "multipleChoice", marks: 2, text: "سؤال اختيار رقم " + i, options: [{ text: "الخيار الأول" }, { text: "الخيار الثاني" }, { text: "الخيار الثالث" }, { text: "الخيار الرابع" }], answer: { correctOptionIndex: 1 } }),
  i => ({ presentationType: "trueFalse", marks: 1, text: "عبارة صواب أو خطأ رقم " + i, answer: { correct: true } }),
  i => ({ presentationType: "shortAnswer", marks: 3, text: "سؤال مقالي رقم " + i, answer: { text: "إجابة" } }),
  i => ({ presentationType: "matching", marks: 3, text: "طابق رقم " + i, fields: [{ id: "m" + i + "a", label: "DNS", kind: "select", options: [{ text: "أسماء" }, { text: "عناوين" }], correct: "أسماء" }, { id: "m" + i + "b", label: "DHCP", kind: "select", options: [{ text: "أسماء" }, { text: "عناوين" }], correct: "عناوين" }], answer: { text: "DNS=أسماء;DHCP=عناوين" } })
];
function examOf(n) {
  const perSection = Math.ceil(n / 4);
  const sections = [];
  for (let s = 0; s * perSection < n; s++) {
    const questions = [];
    for (let i = s * perSection; i < Math.min(n, (s + 1) * perSection); i++) questions.push({ examQuestionId: "q" + i, ...KINDS[i % KINDS.length](i + 1) });
    sections.push({ id: "s" + s, title: "القسم " + (s + 1), gradingPolicy: "all", stimuli: {}, instructions: "", questions });
  }
  return { schemaVersion: 2, examId: "PERF-" + n, title: "امتحان الأداء " + n, status: "draft", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", metadata: {}, sections };
}

let current = null;
function api(req, res, body) {
  const u = new URL(req.url, "http://localhost"), p = u.pathname;
  const send = (code, j) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(j)); };
  let j = {}; try { j = JSON.parse(body || "{}"); } catch { /* not JSON */ }
  if (p === "/api/platform-session") return send(200, { ok: true, role: "teacher", displayName: "أ. أحمد" });
  if (p === "/api/teacher-profile") return send(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
  if (p === "/api/project-tracker") return send(200, u.searchParams.get("resource") === "projects-summary" ? { ok: true, totalReadyForReview: 0, byProject: {} } : { ok: true, projects: [] });
  if (p === "/api/messages") return send(200, { ok: true, totalUnread: 0, capped: false, threads: [] });
  if (p === "/api/saved-exams" && req.method === "GET") return send(200, { ok: true, exams: [{ blobName: "exams/perf.json", examId: current.examId, title: current.title, savedAt: "2026-10-01T10:00:00Z", questionCount: 1, totalMarks: 1 }] });
  if (p === "/api/saved-exams" && j.action === "load") return send(200, { ok: true, exam: current, savedAt: "2026-10-01T10:00:00Z", blobName: "exams/perf.json", etag: "E-1" });
  return send(200, { ok: true, items: [], exams: [], templates: [], questions: [], classes: [], students: [], assignments: [], projects: [], posts: [] });
}
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
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
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const record = { label, dist, studio, sizes: {} };
const PHRASE = " وأضف مثالًا من شبكة المدرسة";
for (const n of sizes) {
  current = examOf(n);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar", reducedMotion: "reduce", serviceWorkers: "block" });
  await ctx.addInitScript(isStudio => {
    sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد");
    try { localStorage.setItem("tadris.studio.layout", isStudio ? "studio" : "classic"); } catch { /* ignore */ }   // explicit: the Studio is the default since 21F.9
    window.__evt = [];
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (e.name === "keydown" || e.name === "keypress" || e.name === "input" || e.name === "keyup") window.__evt.push({ name: e.name, duration: e.duration, processing: e.processingEnd - e.processingStart }); }).observe({ type: "event", durationThreshold: 16, buffered: true });
  }, studio);
  const page = await ctx.newPage();
  await page.goto(origin + "/", { waitUntil: "networkidle" });
  if (studio) await page.locator("[data-studio-home] .st-exam-card").first().getByRole("button", { name: "فتح" }).click();   // «امتحاناتي»
  else {
    await page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first().click();
    await page.locator(".saved-exams-panel").getByRole("button", { name: /فتح وتعديل/ }).first().click();
  }
  const target = "q" + Math.floor(n / 2);
  await page.locator("#sb-q-" + target).waitFor({ timeout: 30000 });
  if (studio) await page.locator("#sb-q-" + target + " .st-card-cover").click();
  await page.waitForTimeout(800);
  const field = page.locator("#sb-q-" + target + " textarea").first();
  await field.scrollIntoViewIfNeeded();
  await field.click();
  await page.evaluate(() => { window.__evt = []; });
  // Per-keystroke wall time as a fallback measure (keyboard.type waits for each key's handlers).
  const walls = [];
  for (const ch of PHRASE) { const t = Date.now(); await page.keyboard.type(ch); walls.push(Date.now() - t); }
  await page.waitForTimeout(500);
  const evt = await page.evaluate(() => window.__evt);
  const keyEvents = evt.filter(e => e.name === "keydown" || e.name === "input").map(e => e.duration);
  // Handler time of the `input` events (React's onChange → render → commit run inside it): the work the edit itself costs.
  const processing = evt.filter(e => e.name === "input").map(e => Math.round(e.processing));
  const value = await field.inputValue();
  record.sizes[n] = {
    keystrokes: PHRASE.length, typedCorrectly: value.endsWith(PHRASE),
    slowEvents: keyEvents.length, inputProcessingP50: pct(processing, 0.5), inputProcessingP95: pct(processing, 0.95), inputProcessingMax: Math.max(0, ...processing), eventDurationP50: pct(keyEvents, 0.5), eventDurationP95: pct(keyEvents, 0.95), eventDurationMax: Math.max(0, ...keyEvents),
    wallP50: pct(walls, 0.5), wallP95: pct(walls, 0.95), wallMax: Math.max(...walls)
  };
  const r = record.sizes[n];
  console.log(`[${label}] ${n} questions: ${r.keystrokes} keys, typed ${r.typedCorrectly ? "OK" : "WRONG"}; events ≥16 ms: ${r.slowEvents} (p50 ${r.eventDurationP50} ms, p95 ${r.eventDurationP95} ms, max ${r.eventDurationMax} ms); input handler time (of events ≥16 ms) p50 ${r.inputProcessingP50} ms, p95 ${r.inputProcessingP95} ms, max ${r.inputProcessingMax} ms; wall per key p50 ${r.wallP50} ms, p95 ${r.wallP95} ms, max ${r.wallMax} ms`);
  await ctx.close();
}
await browser.close(); server.close();
fs.writeFileSync(path.join(out, "input-latency.json"), JSON.stringify(record, null, 2));
