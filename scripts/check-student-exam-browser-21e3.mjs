#!/usr/bin/env node
// Phase 21E.3 — student exam certification in real Chromium (certification only; never shipped). Drives a PRODUCTION build
// (DIST, default ./dist) through the real student workflow with a local mock of the student API (the Vitest payload shapes,
// student-sanitized: no answer key, no token, nothing deployed):
//   portal → open the assignment → read the instructions on the start card → start the timed attempt → answer with the
//   keyboard → save status → next → a question whose renderer chunk FAILS to load (controlled 503) → recovery → previous /
//   next → retry → answer CLI / cloze / label / open questions → review → submit → result.
// For every viewport (desktop 1280×900, 150 % = 853×600 @1.5, 200 % = 640×450 @2, phone 390×844) it records the focus target
// and scroll position after start / submit / result, the live-region announcements (timer + save), the error-boundary
// behaviour, the bottom-navigation clearance of the focused control, horizontal overflow, phone touch-target sizes,
// computed text direction of the LTR islands, the request counts (saveDraft / submit), and writes screenshots to
// HARNESS_OUT/<label>/. Run it on two builds to compare (DIST=<baseline build> LABEL=before · DIST=dist LABEL=after).
// Nothing here asserts on the "before" build: the record is the evidence; `checks` lists the 21E.3 acceptance results.
// POINTER=1 (review fix 1): no chunk failure; instead, at every viewport and with reduced AND normal motion, real mouse presses
// (down, a 90 ms hold, up — with a 2 px drag for the textarea) and, on the phone, touch taps on controls PARTLY under the sticky
// bottom navigation / top bar: the hotspot image (bottom and top), a label zone, the open-answer textarea and the keyboard-guide
// summary. Checks: the page does not scroll during the press, the recorded hotspot point is where the pointer pressed, the zone
// click and the summary click are delivered, the textarea press leaves a caret (no selection); and a Tab to a partly covered
// textarea still reveals it.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-student-exam-21e3"), label);
const only = (process.env.VIEWPORTS || "").split(",").filter(Boolean);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ---- fixtures (student-sanitized shapes) ----
const IMG = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#e8eef5"/><rect x="60" y="120" width="160" height="110" rx="10" fill="#9fb3cc"/><text x="140" y="185" font-size="28" text-anchor="middle" fill="#1f2d3d">Router</text><rect x="580" y="120" width="160" height="110" rx="10" fill="#9fb3cc"/><text x="660" y="185" font-size="28" text-anchor="middle" fill="#1f2d3d">Switch</text><line x1="220" y1="175" x2="580" y2="175" stroke="#5b708a" stroke-width="6"/></svg>');
const image = { exists: true, visible: true, assets: [{ dataUrl: IMG, origin: "uploaded", contentType: "image/svg+xml" }] };
const questions = [
  { examQuestionId: "m1", presentationType: "multipleChoice", text: "في أي طبقة يعمل عنوان IP؟", marks: 1, options: [{ text: "طبقة الشبكة" }, { text: "طبقة الربط" }, { text: "طبقة النقل" }] },
  { examQuestionId: "h1", type: "hotspot", questionTypeVersion: 1, text: "حدّد الموجّه (Router) على المخطط.", marks: 1, image, hotspot: { v: 1, mode: "single", selections: 1, alt: "مخطط شبكة فيه موجّه ومبدّل" } },
  { examQuestionId: "k1", type: "cliFill", text: "أكمل أوامر ضبط الواجهة.", marks: 2, cli: "Router(config)# interface [[f1]]\nRouter(config-if)# ip address [[f2]] 255.255.255.0", fields: [{ id: "f1" }, { id: "f2" }] },
  { examQuestionId: "c1", type: "inlineCloze", questionTypeVersion: 1, text: "أكمل الفقرة التالية بالمصطلح الصحيح.", marks: 2,
    inlineCloze: { v: 1, segments: [{ type: "text", text: "يعمل بروتوكول " }, { type: "blank", id: "b1", control: "text" }, { type: "text", text: " في طبقة الشبكة، بينما يعمل عنوان MAC في طبقة " },
      { type: "blank", id: "b2", control: "dropdown", options: [{ id: "o1", label: "Physical" }, { id: "o2", label: "Data Link" }, { id: "o3", label: "Transport" }] }, { type: "text", text: "." }] } },
  { examQuestionId: "l1", type: "labelDiagram", questionTypeVersion: 1, text: "سمِّ الجهازين على المخطط.", marks: 2, image,
    labelDiagram: { v: 1, alt: "مخطط شبكة", allowReuse: false, zones: [{ id: "z1", shape: { kind: "rect", x: 0.08, y: 0.3, width: 0.2, height: 0.28 } }, { id: "z2", shape: { kind: "rect", x: 0.72, y: 0.3, width: 0.2, height: 0.28 } }], labels: [{ id: "a", text: "Router" }, { id: "b", text: "Switch" }] } },
  { examQuestionId: "o1", presentationType: "open", text: "اشرح باختصار الفرق بين الموجّه والمبدّل.", marks: 2 },
];
const exam = { title: "اختبار الشبكات — الوحدة الثانية", metadata: {}, sections: [{ id: "s1", title: "أساسيات الشبكات", instructions: "أجب عن جميع الأسئلة.", gradingPolicy: "all", stimuli: {}, questions }] };
const INSTRUCTIONS = "أجب عن كل الأسئلة. تُحفظ إجاباتك تلقائيًا، ويمكنك مراجعة إجاباتك قبل التسليم.";
const TIMER_MS = Number(process.env.TIMER_MS || 5 * 60_000 + 6_000); // crosses the 5-minute threshold a few seconds after start
// FAIL: comma-separated "<file prefix>:<js|css>" — each matching asset answers 503 to its first FAIL_COUNT requests (the plain URL;
// a recovery URL "?r=" is served normally unless FAIL_RETRY=1). Scenarios: entry stub, shared dependency, stylesheet.
const POINTER = process.env.POINTER === "1";
const FAIL = (POINTER ? "" : (process.env.FAIL ?? (process.env.FAIL_CHUNK ? process.env.FAIL_CHUNK + ":js" : "HotspotResponse-:js"))).split(",").filter(Boolean).map(x => { const [prefix, ext] = x.split(":"); return { prefix, ext: "." + (ext || "js") }; });
const FAIL_COUNT = Number(process.env.FAIL_COUNT || 1);
const FAIL_RETRY = process.env.FAIL_RETRY === "1";
const STRICT = process.env.STRICT === "1";

function mockFor() {
  const s = { started: false, startedAt: "", endsAt: 0, saves: 0, submits: 0, starts: 0, chunkFailures: new Map(), chunkRequests: [], assetLog: [], actions: [], submitted: null };
  const summary = { ...(STRICT ? { attemptPolicy: "strict" } : {}), assignmentId: "asg-21e3", title: exam.title, instructions: INSTRUCTIONS, openAt: "", dueAt: "2026-12-01T10:30:00.000Z", effectiveDueAt: "", questionCount: questions.length, totalMarks: 10, durationMinutes: 10, availability: "open", attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, attemptStatus: "notStarted", hasActiveAttempt: false, latestScore: null, latestPercentage: null, latestResult: null, createdAt: "2026-10-01T08:00:00.000Z" };
  const result = () => ({ attemptNumber: 1, submittedAt: new Date().toISOString(), score: 7, totalMarks: 10, percentage: 70, manualReviewMarks: 2, finalized: false, gradingStatus: "pendingReview" });
  const state = () => ({ ...(STRICT ? { attemptPolicy: "strict" } : {}), attemptsUsed: s.submitted ? 1 : 0, allowedAttempts: 1, canAttempt: !s.submitted, canWrite: s.started && !s.submitted, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "",
    latestResult: s.submitted, attempts: s.submitted ? [s.submitted] : [], timed: true, attemptModelVersion: 2, requiresStart: true, durationMinutes: 10, serverNow: new Date().toISOString(),
    activeAttempt: s.started && !s.submitted ? { attemptNumber: 1, startedAt: s.startedAt, endsAt: new Date(s.endsAt).toISOString(), status: "active", attemptEpoch: 1 } : null,
    effectiveAttemptEndsAt: s.started && !s.submitted ? new Date(s.endsAt).toISOString() : "", attemptExpired: false, canStartAttempt: !s.started && !s.submitted });
  const assignment = () => ({ ...(STRICT ? { attemptPolicy: "strict" } : {}), assignmentId: summary.assignmentId, title: exam.title, instructions: INSTRUCTIONS, openAt: "", dueAt: summary.dueAt, effectiveDueAt: "", maxAttempts: 1, durationMinutes: 10, requiresStart: !s.started, timed: true, questionCount: questions.length, totalMarks: 10, exam: s.started ? exam : { title: exam.title, metadata: {} } });
  const notifCounts = { messages: { totalUnread: 0, directUnread: { unread: 0 }, announcementUnread: { unread: 0 } }, events: { unread: 1 }, bell: { unread: 1 } };
  const notifItems = [{ id: "e1", createdAt: "2026-10-10T08:00:00.000Z", unread: true, type: "assignment_reviewed", assignmentId: "asg-old", assignmentTitle: "واجب الوحدة الأولى", becameFinal: true, scoreChanged: true, feedbackChanged: false, finalized: true, percentage: 85, score: 8.5, totalMarks: 10 }];
  return { s, handle(req, res, body) {
    const u = new URL(req.url, "http://localhost"), p = u.pathname;
    const send = (code, j) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(j)); };
    if (p === "/api/platform-session") return send(200, { ok: true, role: "student", displayName: "سارة" });
    if (p === "/api/student-dashboard") return send(200, { ok: true, student: { userId: "u1", code: "C-1", displayName: "سارة", classId: "c1", shareAchievements: false }, classroom: { classId: "c1", name: "الحادي عشر — أ", grade: "11", schoolYear: "2026" }, assignments: [summary], stats: { assigned: 1, completed: 0, average: 0 } });
    if (p.startsWith("/api/student-assignment/")) return send(200, { ok: true, assignment: assignment() });
    if (p === "/api/student-notifications") return send(200, { ok: true, items: u.searchParams.get("view") === "notifications" ? notifItems : [], ...notifCounts });
    if (p.startsWith("/api/student-submission/")) {
      if (req.method === "GET") return send(200, { ok: true, state: state() });
      let j = {}; try { j = JSON.parse(body || "{}"); } catch { /* malformed body → treated as no action */ }
      s.actions.push(j.action || "?");
      if (j.action === "startAttempt") { s.starts++; if (!s.started) { s.started = true; s.startedAt = new Date().toISOString(); s.endsAt = Date.now() + TIMER_MS; } return send(200, { ok: true, state: state() }); }
      if (j.action === "saveDraft") { s.saves++; return send(200, { ok: true, savedAt: new Date().toISOString() }); }
      if (j.action === "submit") { s.submits++; s.submitted = result(); return send(200, { ok: true, result: s.submitted, state: state() }); }
      return send(200, { ok: true, state: state() });
    }
    return send(200, { ok: true, items: [], posts: [], materials: [], events: [], unread: 0, count: 0, messages: [], threads: [] });
  } };
}
let mock = mockFor();
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) { let b = ""; req.on("data", c => { b += c; }); req.on("end", () => mock.handle(req, res, b)); return; }
  const base = path.basename(u.pathname);
  const rule = FAIL.find(f => base.startsWith(f.prefix) && base.endsWith(f.ext));
  if (rule) {
    mock.s.chunkRequests.push(u.pathname + u.search);
    const n = mock.s.chunkFailures.get(rule.prefix) || 0;
    if ((FAIL_RETRY || !u.search) && n < FAIL_COUNT) { mock.s.chunkFailures.set(rule.prefix, n + 1); mock.s.assetLog.push({ url: u.pathname + u.search, status: 503, dest: req.headers["sec-fetch-dest"] || "" }); res.writeHead(503, { "cache-control": "no-store" }); res.end("unavailable"); return; }
  }
  if (u.pathname.startsWith("/assets/")) mock.s.assetLog.push({ url: u.pathname + u.search, status: 200, dest: req.headers["sec-fetch-dest"] || "" });
  let full = path.resolve(dist, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(dist + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) full = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" });
  // Evaluation counter (certification only): every served JS module ends with one statement that counts its evaluations by
  // chunk file, whatever URL variant (plain or ?r=) loaded it — the direct proof that no module is ever evaluated twice.
  if (full.endsWith(".js") && u.pathname.startsWith("/assets/")) { const key = JSON.stringify(base); res.end(fs.readFileSync(full, "utf8") + "\n;(globalThis.__evals||(globalThis.__evals={}))[" + key + "]=(globalThis.__evals[" + key + "]||0)+1;\n"); return; }
  fs.createReadStream(full).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [], record = { label, dist, timerMs: TIMER_MS, viewports: {} };

// ---- in-page probes ----
const focusInfo = page => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: "body" };
  const r = el.getBoundingClientRect(), nav = document.querySelector(".iex-bottom-nav"), top = document.querySelector(".iex-topbar");
  const navTop = nav ? nav.getBoundingClientRect().top : innerHeight, topBottom = top ? top.getBoundingClientRect().bottom : 0;
  return { tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 60), text: (el.textContent || "").trim().slice(0, 60), focusVisible: el.matches(":focus-visible"),
    outline: getComputedStyle(el).outlineStyle + " " + getComputedStyle(el).outlineWidth, rect: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
    underBottomNav: r.bottom > navTop + 1, underTopBar: r.top < topBottom - 1, scrollY: Math.round(scrollY) };
});
const announcements = page => page.evaluate(() => (window.__live || []).slice());
const boxes = (page, sel) => page.evaluate(s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length).map(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; }), sel);
const overflow = page => page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
async function tabTo(page, selector, max = 30) {
  for (let i = 0; i < max; i++) { await page.keyboard.press("Tab"); if (await page.evaluate(s => !!document.activeElement && document.activeElement.matches(s), selector)) return true; }
  return false;
}
const step = async (rec, name, fn) => { try { const v = await fn(); rec.steps.push({ step: name, ok: true, ...(v && typeof v === "object" ? v : { value: v }) }); return v; } catch (e) { rec.steps.push({ step: name, ok: false, error: String(e && e.message || e).slice(0, 300) }); return undefined; } };

async function run(name, viewport, mobile, dsf) {
  mock = mockFor();
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: dsf, locale: "ar", reducedMotion: "reduce" });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", "student"); sessionStorage.setItem("examBankSessionDisplayName", "سارة");
    // Record every text change of an aria-live / role=status|alert region (what a screen reader would be offered).
    window.__live = [];
    const t0 = performance.now();
    const seen = new WeakMap();
    const scan = () => { document.querySelectorAll("[aria-live],[role=status],[role=alert]").forEach(el => { const txt = (el.textContent || "").trim(); if (seen.get(el) !== txt) { seen.set(el, txt); if (txt) window.__live.push({ t: Math.round(performance.now() - t0), cls: String(el.className || "").slice(0, 40), live: el.getAttribute("aria-live") || el.getAttribute("role"), text: txt.slice(0, 120) }); } }); };
    new MutationObserver(scan).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class"] });
  });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(name + ": " + e)); page.on("console", m => { if (m.type() === "error" && !/503|Failed to (load resource|fetch dynamically)/.test(m.text())) errors.push(name + " console: " + m.text()); });
  const shot = (n, full = false) => page.screenshot({ path: path.join(out, name + "-" + n + ".png"), fullPage: full });
  const rec = record.viewports[name] = { steps: [] };

  await page.goto(origin + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".eb-sp-task-action", { timeout: 20000 });
  await shot("01-portal");
  // Notification panel (touch targets + grade string direction) — opened from the portal bell.
  await step(rec, "notifications", async () => {
    await page.click(".eb-notif-bell"); await page.waitForSelector(".eb-notif-preview", { timeout: 8000 });
    const r = { headAction: await boxes(page, ".eb-notif-head-action"), items: await boxes(page, ".eb-notif-item, .eb-notif-list button"),
      gradeText: await page.evaluate(() => document.querySelector(".eb-notif-preview")?.textContent || ""),
      gradeIsolated: await page.evaluate(() => !!document.querySelector(".eb-notif-preview bdi, .eb-notif-preview [dir=ltr]")) };
    await shot("02-notifications"); await page.keyboard.press("Escape"); return r;
  });
  await step(rec, "install-card-brand", () => page.evaluate(() => {
    const t = document.querySelector(".eb-install-title"); if (!t) return { present: false };
    const iso = t.querySelector("bdi, [dir=ltr]");
    // Visual order probe: is the "+" drawn to the RIGHT of "Tadris" (correct LTR) or to its left (RTL reordering)?
    const tn = [...t.childNodes, ...(iso ? iso.childNodes : [])].find(n => n.nodeType === 3 && n.textContent.includes("Tadris+"));
    if (!tn) return { present: true, text: t.textContent, isolated: !!iso };
    const i = tn.textContent.indexOf("Tadris+"), rg = document.createRange();
    rg.setStart(tn, i); rg.setEnd(tn, i + 1); const T = rg.getBoundingClientRect();
    rg.setStart(tn, i + 6); rg.setEnd(tn, i + 7); const P = rg.getBoundingClientRect();
    return { present: true, text: t.textContent, isolated: !!iso, plusRightOfT: P.left > T.left };
  }));

  await page.click(".eb-sp-task-action");
  await page.waitForSelector(".iex-start-card, .structured-cover", { timeout: 20000 });
  await step(rec, "start-card", () => page.evaluate(() => ({ instructionsVisible: !!document.querySelector(".iex-start-card p")?.textContent?.includes("أجب عن كل الأسئلة") })));
  await shot("03-start-card");
  // START with the keyboard (Tab to the start button, Enter) so focus-visible heuristics match a keyboard user.
  await step(rec, "start", async () => {
    const reached = await tabTo(page, ".iex-start-actions .is-primary", 20);
    await page.keyboard.press("Enter");
    await page.waitForSelector(".iex-page-heading", { timeout: 20000 }); await page.waitForTimeout(400);
    await page.evaluate(() => { window.__noReload = "same-document"; });          // gone if the page ever reloads
    return { reachedByKeyboard: reached, focus: await focusInfo(page) };
  });
  await step(rec, "details-disclosure", () => page.evaluate(() => { const b = document.querySelector(".iex-details-toggle"), p = document.querySelector(".iex-details-panel"); return { expanded: b?.getAttribute("aria-expanded"), panelHeight: p ? Math.round(p.getBoundingClientRect().height) : null, firstQuestionTop: Math.round(document.querySelector(".iex-page-heading")?.getBoundingClientRect().top ?? -1) }; }));
  await shot("04-started-q1");
  await step(rec, "answer-q1-keyboard", async () => {
    const reached = await tabTo(page, ".iex-option input[type=radio]");
    await page.keyboard.press("Space"); await page.waitForTimeout(1600);
    return { reached, focus: await focusInfo(page), save: await page.evaluate(() => document.querySelector(".iex-save-state")?.textContent || "") };
  });
  await shot("05-q1-answered");
  const savesBeforeFailure = mock.s.saves;
  await step(rec, "next-to-failing-q2", async () => {
    await page.click(".iex-nav-next"); await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      examStillMounted: !!document.querySelector(".iex-topbar") && !!document.querySelector(".iex-bottom-nav"),
      rootBoundary: /تم تحديث الموقع|حدث خطأ غير متوقع/.test(document.body.textContent || ""),
      recoveryCard: !!document.querySelector(".iex-q-recovery"),
      recoveryText: (document.querySelector(".iex-q-recovery")?.textContent || "").slice(0, 200),
      leaksInternals: /TypeError|Failed to fetch|assets\/|\.js\b|correct|expected/i.test(document.querySelector(".iex-q-recovery")?.textContent || ""),
    }));
    return { ...r, chunkRequests: mock.s.chunkRequests.slice() };
  });
  await shot("06-q2-renderer-failed");
  await step(rec, "previous-keeps-q1-answer", async () => {
    if (!(await page.$(".iex-nav-prev"))) return { skipped: "exam not mounted" };
    await page.click(".iex-nav-prev"); await page.waitForTimeout(400);
    const checked = await page.evaluate(() => [...document.querySelectorAll(".iex-option input[type=radio]")].findIndex(i => i.checked));
    await page.click(".iex-nav-next"); await page.waitForTimeout(800);
    return { q1CheckedIndex: checked, recoveryCardAgain: !!(await page.$(".iex-q-recovery")) };
  });
  await step(rec, "retry", async () => {
    const rounds = [];
    for (let round = 0; round < 3; round++) {
      const btn = await page.$(".iex-q-recovery .iex-q-recovery-retry");
      if (!btn) break;
      await btn.focus(); await page.keyboard.press("Enter");
      await page.waitForFunction(() => !!document.querySelector(".vq-overlay") || !!document.querySelector(".iex-q-recovery"), null, { timeout: 10000 });
      await page.waitForTimeout(400);
      const still = await page.evaluate(() => { const c = document.querySelector(".iex-q-recovery"); return c ? { text: (c.textContent || "").slice(0, 300), reload: !!c.querySelector(".iex-q-recovery-reload"), focus: (document.activeElement && document.activeElement.className) || "" } : null; });
      rounds.push(still || "rendered");
      if (!still) break;
    }
    if (!(await page.$(".vq-overlay"))) return { rendered: false, rounds, chunkRequests: mock.s.chunkRequests.slice() };
    await page.waitForTimeout(300);
    const canvasPosition = await page.evaluate(() => { const c = document.querySelector(".vq-canvas"); return c ? getComputedStyle(c).position : null; });
    return { rendered: true, rounds, canvasPosition, chunkRequests: mock.s.chunkRequests.slice(), focus: await focusInfo(page) };
  });
  await shot("07-q2-recovered");
  await step(rec, "no-extra-requests-from-failure", () => ({ savesBefore: savesBeforeFailure, savesAfter: mock.s.saves, submits: mock.s.submits, starts: mock.s.starts }));
  await step(rec, "answer-q2-hotspot", async () => {
    if (!(await page.$(".vq-overlay"))) return { skipped: true };
    await page.locator(".vq-image").evaluate(i => i.complete && i.naturalWidth > 0 ? null : new Promise(r => { i.onload = r; i.onerror = r; }));
    await page.locator(".vq-overlay").scrollIntoViewIfNeeded(); const b = await page.locator(".vq-overlay").boundingBox();
    await page.mouse.click(b.x + b.width * 0.17, b.y + b.height * 0.45); await page.waitForSelector(".vq-marker", { timeout: 5000 });
    return { hint: await page.evaluate(() => (document.querySelector(".hotspot-response .vq-note")?.textContent || "").length), keyboardGuide: !!(await page.$(".vq-keyboard-guide")) };
  });
  await shot("08-q2-hotspot");
  await step(rec, "q3-cli", async () => {
    await page.click(".iex-nav-next"); await page.waitForSelector(".iex-cli-input", { timeout: 10000 });
    await tabTo(page, ".iex-cli-input"); await page.keyboard.type("g0/0"); await page.keyboard.press("Tab"); await page.keyboard.type("192.168.1.1");
    return { focus: await focusInfo(page), dir: await page.evaluate(() => { const pre = document.querySelector(".iex-cli"), i = document.querySelector(".iex-cli-input"); return { preDir: pre?.getAttribute("dir"), preDirection: pre && getComputedStyle(pre).direction, preBidi: pre && getComputedStyle(pre).unicodeBidi, inputDir: i?.getAttribute("dir"), inputDirection: i && getComputedStyle(i).direction }; }),
      sizes: await boxes(page, ".iex-cli-input") };
  });
  await shot("09-q3-cli");
  await step(rec, "q4-cloze", async () => {
    await page.click(".iex-nav-next"); await page.waitForSelector(".cloze-input", { timeout: 10000 });
    await tabTo(page, ".cloze-input"); await page.keyboard.type("IP");
    return { focus: await focusInfo(page), input: await boxes(page, ".cloze-input"), select: await boxes(page, ".cloze-select") };
  });
  await shot("10-q4-cloze");
  await step(rec, "q5-label", async () => {
    await page.click(".iex-nav-next"); await page.waitForSelector(".vq-chip, .label-diagram-response", { timeout: 10000 }); await page.waitForTimeout(300);
    return { chips: await boxes(page, ".vq-chip"), selects: await boxes(page, ".vq-list select"), zoneButtons: await boxes(page, ".vq-zone-btn"), keyboardGuide: !!(await page.$(".vq-keyboard-guide")) };
  });
  await shot("11-q5-label");
  await step(rec, "q6-open-textarea-clearance", async () => {
    await page.click(".iex-nav-next"); await page.waitForSelector("textarea.iex-open", { timeout: 10000 });
    await page.evaluate(() => scrollTo(0, 0));
    const reached = await tabTo(page, "textarea.iex-open"); await page.keyboard.type("الموجّه يربط شبكات مختلفة.");
    return { reached, focus: await focusInfo(page), textarea: await boxes(page, "textarea.iex-open") };
  });
  await shot("12-q6-open-focused");
  await step(rec, "timer-announcements", async () => { await page.waitForTimeout(Math.max(0, 7000)); return { live: (await announcements(page)).filter(a => /دقائق|دقيقة/.test(a.text)) }; });
  await step(rec, "overflow-in-exam", () => overflow(page));
  await shot("13-exam-full", true);
  await step(rec, "review-submit-result", async () => {
    await page.click(".iex-nav-review"); await page.waitForSelector(".iex-review-title", { timeout: 5000 });
    const reviewFocus = await focusInfo(page);
    await shot("14-review");
    await page.click(".iex-submit"); await page.waitForSelector("[role=dialog] button, .eb-dialog button", { timeout: 5000 });
    await page.click("[role=dialog] button:has-text('تسليم الآن')");
    await page.waitForSelector(".iex-result-card", { timeout: 10000 }); await page.waitForTimeout(500);
    return { reviewFocus, resultFocus: await focusInfo(page), submits: mock.s.submits };
  });
  await shot("15-result");
  rec.live = await announcements(page);
  rec.noReload = await page.evaluate(() => window.__noReload === "same-document").catch(() => false);
  rec.evals = await page.evaluate(() => globalThis.__evals || {});
  rec.requests = { saves: mock.s.saves, submits: mock.s.submits, starts: mock.s.starts, chunkRequests: mock.s.chunkRequests, actions: mock.s.actions, assets: mock.s.assetLog };
  await ctx.close();
}
// ---- POINTER=1: real mouse / touch presses on partly covered controls (review fix 1) ----
/** Scrolls so that `fraction` of the element is under the bottom navigation (edge "bottom") or the top bar (edge "top"), and
 *  returns the geometry at that moment plus a press point inside the VISIBLE part. Focus is moved away first (a press then focuses). */
const placePartly = (page, sel, edge, fraction, xFrac = 0.3) => page.evaluate(([sel, edge, fraction, xFrac]) => {
  document.activeElement?.blur?.();
  const el = document.querySelector(sel), nav = document.querySelector(".iex-bottom-nav").getBoundingClientRect(), bar = document.querySelector(".iex-topbar").getBoundingClientRect();
  let r = el.getBoundingClientRect();
  if (edge === "bottom") window.scrollBy(0, r.top - (nav.top - r.height * (1 - fraction)));
  else window.scrollBy(0, r.bottom - (bar.bottom + r.height * (1 - fraction)));
  r = el.getBoundingClientRect();
  const visTop = Math.max(r.top, bar.bottom), visBottom = Math.min(r.bottom, nav.top);
  const covered = edge === "bottom" ? Math.max(0, r.bottom - nav.top) / r.height : Math.max(0, bar.bottom - r.top) / r.height;
  return { x: r.left + r.width * xFrac, y: (visTop + visBottom) / 2, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, covered: Math.round(covered * 100) / 100, scrollY: scrollY };
}, [sel, edge, fraction, xFrac]);
const pressAt = async (page, x, y, { drag = 0 } = {}) => {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(90);
  const during = await page.evaluate(() => scrollY);
  for (let i = 1; i <= drag; i++) await page.mouse.move(x, y + i);
  await page.mouse.up();
  await page.waitForTimeout(350);
  return { during, after: await page.evaluate(() => scrollY) };
};
const markerPoint = page => page.evaluate(() => { const m = document.querySelector(".vq-marker"); return m ? { x: parseFloat(m.style.left) / 100, y: parseFloat(m.style.top) / 100 } : null; });
async function runPointer(name, viewport, mobile, dsf, motion) {
  mock = mockFor();
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: dsf, locale: "ar", reducedMotion: motion });
  await ctx.addInitScript(() => { sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", "student"); sessionStorage.setItem("examBankSessionDisplayName", "سارة"); });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(name + "/" + motion + ": " + e));
  const key = name + "/" + motion, rec = record.viewports[key] = { steps: [], motion };
  const shot = n => page.screenshot({ path: path.join(out, name + "-" + motion + "-" + n + ".png") });
  await page.goto(origin + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".eb-sp-task-action", { timeout: 20000 });
  await page.click(".eb-sp-task-action");
  await page.waitForSelector(".iex-start-actions .is-primary", { timeout: 20000 });
  await page.click(".iex-start-actions .is-primary");
  await page.waitForSelector(".iex-page-heading", { timeout: 20000 }); await page.waitForTimeout(400);
  // Room to scroll a control under the TOP bar even on a short page (certification geometry only; nothing else changes).
  await page.addStyleTag({ content: ".interactive-exam-page{ padding-block-end:1600px !important; }" });
  await page.click(".iex-nav-next"); await page.waitForSelector(".vq-overlay", { timeout: 20000 }); await page.waitForTimeout(600);
  for (const edge of ["bottom", "top"]) {
    await step(rec, "hotspot-" + edge, async () => {
      const at = await placePartly(page, ".vq-overlay", edge, 0.4);
      const want = { x: (at.x - at.rect.left) / at.rect.width, y: (at.y - at.rect.top) / at.rect.height };
      const s0 = await page.evaluate(() => scrollY);
      const sc = mobile ? (await page.touchscreen.tap(at.x, at.y), await page.waitForTimeout(350), { during: await page.evaluate(() => scrollY), after: await page.evaluate(() => scrollY) }) : await pressAt(page, at.x, at.y);
      const got = await markerPoint(page);
      if (edge === "bottom") await shot("hotspot-" + edge);
      return { covered: at.covered, want, got, scrollDuring: sc.during - s0, scrollAfter: sc.after - s0, input: mobile ? "touch" : "mouse" };
    });
  }
  await step(rec, "guide-summary", async () => {
    const at = await placePartly(page, ".vq-keyboard-guide > summary", "bottom", 0.5, 0.5);
    const before = await page.evaluate(() => document.querySelector(".vq-keyboard-guide").open), s0 = await page.evaluate(() => scrollY);
    const sc = mobile ? (await page.touchscreen.tap(at.x, at.y), await page.waitForTimeout(350), { during: await page.evaluate(() => scrollY), after: await page.evaluate(() => scrollY) }) : await pressAt(page, at.x, at.y);
    const after = await page.evaluate(() => document.querySelector(".vq-keyboard-guide").open);
    return { covered: at.covered, before, after, scrollDuring: sc.during - s0 };
  });
  for (let i = 0; i < 3; i++) { await page.click(".iex-nav-next"); await page.waitForTimeout(500); }
  await page.waitForSelector(".vq-zone-btn", { timeout: 20000 }); await page.waitForTimeout(400);
  await step(rec, "label-zone", async () => {
    await page.evaluate(() => document.querySelector(".vq-chip").scrollIntoView({ block: "center" }));
    const chip = await page.$(".vq-chip"); const cb = await chip.boundingBox();
    if (mobile) await page.touchscreen.tap(cb.x + cb.width / 2, cb.y + cb.height / 2); else await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await page.waitForTimeout(200);
    const at = await placePartly(page, ".vq-zone-btn", "bottom", 0.5, 0.5), s0 = await page.evaluate(() => scrollY);
    const sc = mobile ? (await page.touchscreen.tap(at.x, at.y), await page.waitForTimeout(350), { during: await page.evaluate(() => scrollY), after: await page.evaluate(() => scrollY) }) : await pressAt(page, at.x, at.y);
    return { covered: at.covered, filled: await page.evaluate(() => document.querySelector(".vq-zone-btn").getAttribute("data-filled")), scrollDuring: sc.during - s0 };
  });
  await page.click(".iex-nav-next"); await page.waitForSelector("textarea.iex-open", { timeout: 20000 }); await page.waitForTimeout(400);
  await page.fill("textarea.iex-open", ["سطر 1", "سطر 2", "سطر 3", "سطر 4", "سطر 5", "سطر 6", "سطر 7", "سطر 8"].join("\n"));
  await page.waitForTimeout(300);
  if (!mobile) await step(rec, "textarea-press-drag", async () => {
    const at = await placePartly(page, "textarea.iex-open", "bottom", 0.45, 0.5), s0 = await page.evaluate(() => scrollY);
    const sc = await pressAt(page, at.x, at.y, { drag: 2 });
    const sel = await page.evaluate(() => { const t = document.querySelector("textarea.iex-open"); return { start: t.selectionStart, end: t.selectionEnd, focused: document.activeElement === t, value: t.value.length }; });
    return { covered: at.covered, sel, scrollDuring: sc.during - s0, scrollAfter: sc.after - s0 };
  });
  if (!mobile) await step(rec, "keyboard-tab-reveals", async () => {
    await placePartly(page, "textarea.iex-open", "bottom", 0.45, 0.5);
    await page.evaluate(() => document.querySelector(".iex-page-heading").focus({ preventScroll: true }));
    const reached = await tabTo(page, "textarea.iex-open", 10);
    await page.waitForTimeout(motion === "reduce" ? 200 : 900);
    return { reached, focus: await focusInfo(page) };
  });
  rec.requests = { saves: mock.s.saves, submits: mock.s.submits, actions: mock.s.actions };
  await ctx.close();
}
const VIEWPORTS = [["desktop", { width: 1280, height: 900 }, false, 1], ["desktop-150pct", { width: 853, height: 600 }, false, 1.5], ["desktop-200pct", { width: 640, height: 450 }, false, 2], ["phone", { width: 390, height: 844 }, true, 2]];
if (POINTER) { for (const v of VIEWPORTS) if (!only.length || only.includes(v[0])) for (const motion of ["reduce", "no-preference"]) await runPointer(...v, motion); }
else for (const v of VIEWPORTS) if (!only.length || only.includes(v[0])) await run(...v);
await browser.close(); server.close();
record.errors = errors;

// ---- 21E.3 acceptance checks (reported, never thrown) ----
const checks = [];
const ck = (vp, id, pass, detail) => checks.push({ vp, id, pass: !!pass, detail });
if (POINTER) for (const [vp, r] of Object.entries(record.viewports)) {
  const s = Object.fromEntries(r.steps.map(x => [x.step, x]));
  const near = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < 0.015 && Math.abs(a.y - b.y) < 0.015;
  for (const edge of ["bottom", "top"]) {
    const h = s["hotspot-" + edge];
    ck(vp, "PTR1-" + edge + " hotspot " + (h?.input || "") + " press partly under the " + (edge === "bottom" ? "bottom navigation" : "top bar") + ": no scroll, point recorded where pressed", h?.ok && h.covered > 0.2 && h.scrollDuring === 0 && h.scrollAfter === 0 && near(h.want, h.got), h);
  }
  ck(vp, "PTR2 keyboard-guide summary half covered: the press opens it, no scroll", s["guide-summary"]?.covered > 0.2 && s["guide-summary"]?.before === false && s["guide-summary"]?.after === true && s["guide-summary"]?.scrollDuring === 0, s["guide-summary"]);
  ck(vp, "PTR3 label zone half covered: the press assigns the selected label, no scroll", s["label-zone"]?.covered > 0.2 && s["label-zone"]?.filled === "true" && s["label-zone"]?.scrollDuring === 0, s["label-zone"]);
  if (!vp.startsWith("phone")) {
    const t = s["textarea-press-drag"];
    ck(vp, "PTR4 textarea press with a 2px drag: a caret, no selection, no scroll", t?.covered > 0.2 && t.sel?.focused && t.sel.start === t.sel.end && t.scrollDuring === 0 && t.scrollAfter === 0, t);
    const k = s["keyboard-tab-reveals"];
    ck(vp, "PTR5 Tab to a partly covered textarea still reveals it (keyboard only)", k?.reached && k.focus && !k.focus.underBottomNav && !k.focus.underTopBar, k);
  }
  ck(vp, "PTR6 no save / submit / start other than the student's own answers", (r.requests?.actions || []).every(a => ["startAttempt", "saveDraft"].includes(a)) && r.requests?.submits === 0, r.requests);
}
else for (const [vp, r] of Object.entries(record.viewports)) {
  const s = Object.fromEntries(r.steps.map(x => [x.step, x]));
  ck(vp, "A1 failing renderer keeps the exam mounted", s["next-to-failing-q2"]?.examStillMounted && !s["next-to-failing-q2"]?.rootBoundary, s["next-to-failing-q2"]);
  ck(vp, "A2 recovery card shown, no internals", s["next-to-failing-q2"]?.recoveryCard && !s["next-to-failing-q2"]?.leaksInternals, s["next-to-failing-q2"]?.recoveryText);
  ck(vp, "A3 other question keeps its answer", s["previous-keeps-q1-answer"]?.q1CheckedIndex === 0, s["previous-keeps-q1-answer"]);
  ck(vp, "A4 retry renders the question", s.retry?.rendered === true, s.retry?.chunkRequests);
  ck(vp, "A5b the recovered question has its stylesheet (visual canvas laid out)", s.retry?.rendered !== true || s.retry?.canvasPosition === "relative", s.retry?.canvasPosition);
  ck(vp, "A5 no save / submit / start caused by the failure", s["no-extra-requests-from-failure"]?.savesAfter === s["no-extra-requests-from-failure"]?.savesBefore && s["no-extra-requests-from-failure"]?.submits === 0 && s["no-extra-requests-from-failure"]?.starts === 1, s["no-extra-requests-from-failure"]);
  ck(vp, "A6 no page reload at any point", r.noReload === true, r.noReload);
  const assets = r.requests?.assets || [];
  const retryUrls = assets.map(a => a.url).filter(x => x.includes("?"));
  ck(vp, "A7 every recovery request is a same-origin /assets/<name>-<hash>.(js|css)?r=<n>. URL", retryUrls.every(x => /^\/assets\/[A-Za-z0-9_-]+-[0-9a-z]{8}\.(js|css)\?r=\d+\.$/.test(x)), retryUrls);
  // Evaluation counts from the served modules themselves (see the counter above): no module may run twice; the recovered chunks ran once.
  const evals = r.evals || {}, twice = Object.entries(evals).filter(([, n]) => n > 1);
  const recovered = [...new Set(retryUrls.filter(x => x.endsWith(".js") || /\.js\?/.test(x)).map(x => x.replace(/^\/assets\//, "").replace(/\?.*$/, "")))];
  ck(vp, "A8 no module is evaluated twice; every recovered chunk evaluated exactly once", twice.length === 0 && recovered.every(b => evals[b] === 1) && Object.keys(evals).length > 10, { twice, recovered: Object.fromEntries(recovered.map(b => [b, evals[b] ?? 0])), modules: Object.keys(evals).length });
  ck(vp, "A9 only start / save / submit requests (no strict exit, no extra lifecycle request)", (r.requests?.actions || []).every(a => ["startAttempt", "saveDraft", "submit"].includes(a)), r.requests?.actions);
  ck(vp, "B1 focus on the question heading after start", s.start?.focus?.cls?.includes("iex-page-heading"), s.start?.focus);
  ck(vp, "B2 focus on the result heading after submit", s["review-submit-result"]?.resultFocus?.tag === "h1", s["review-submit-result"]?.resultFocus);
  ck(vp, "B3 exactly one submit", s["review-submit-result"]?.submits === 1, s["review-submit-result"]?.submits);
  ck(vp, "C1 5-minute announcement exactly once", (s["timer-announcements"]?.live || []).filter(a => /5 دقائق/.test(a.text)).length === 1, s["timer-announcements"]?.live);
  ck(vp, "D1 no announcement of every pending/saving/saved cycle", !(r.live || []).some(a => /جارٍ الحفظ/.test(a.text) && /polite|status/.test(a.live)), (r.live || []).filter(a => /حفظ/.test(a.text)));
  ck(vp, "F1 CLI block is an LTR island", s["q3-cli"]?.dir?.preDir === "ltr" && s["q3-cli"]?.dir?.inputDir === "ltr", s["q3-cli"]?.dir);
  ck(vp, "G1 focused textarea not under the bottom navigation", s["q6-open-textarea-clearance"]?.focus && !s["q6-open-textarea-clearance"].focus.underBottomNav && !s["q6-open-textarea-clearance"].focus.underTopBar, s["q6-open-textarea-clearance"]?.focus);
  ck(vp, "G2 no horizontal page overflow", s["overflow-in-exam"]?.scrollWidth <= s["overflow-in-exam"]?.clientWidth, s["overflow-in-exam"]);
  if (vp === "phone") {
    const min44 = a => Array.isArray(a) && a.length > 0 && a.every(b => b.h >= 44 && b.w >= 44);
    ck(vp, "E1 CLI inputs ≥ 44×44", min44(s["q3-cli"]?.sizes), s["q3-cli"]?.sizes);
    ck(vp, "E2 cloze controls ≥ 44×44", min44(s["q4-cloze"]?.input) && min44(s["q4-cloze"]?.select), s["q4-cloze"]);
    ck(vp, "E3 label chips / selects ≥ 44×44", min44(s["q5-label"]?.chips) && min44(s["q5-label"]?.selects), s["q5-label"]);
    ck(vp, "E4 notification action ≥ 44×44", min44(s.notifications?.headAction), s.notifications?.headAction);
  }
}
record.checks = checks;
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
const passed = checks.filter(c => c.pass).length;
console.log(JSON.stringify({ label, out, errors: errors.length, checks: passed + "/" + checks.length }, null, 2));
for (const c of checks) console.log((c.pass ? "PASS " : "FAIL ") + c.vp.padEnd(15) + c.id);
if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
