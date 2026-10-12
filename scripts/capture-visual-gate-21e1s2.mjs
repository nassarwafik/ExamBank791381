#!/usr/bin/env node
// Phase 21E.1 (slice 2) — Visual Quality Gate capture + real-Chromium certification on the REAL teacher pages (certification only;
// never shipped). Drives a production build (DIST, default ./dist) through a real teacher session against a small local mock of the
// teacher API (the payload shapes App.tsx reads; no token, nothing deployed, service workers blocked). Run once on the BEFORE build
// (main) and once on the AFTER build (the slice-2 head); every step records what the page actually did, so both runs are comparable:
//   1. open a saved STRUCTURED exam → delete question 2 (the card's «حذف») → toast? focus target? live region? toast geometry, hit
//      test, contrast, target sizes → «تراجع عن حذف السؤال» → restored at its place? focus on the restored card?
//   2. delete again → Escape inside the toast → focus back on the neighbour card; Ctrl+Z route (history) → toast leaves
//   3. delete a section → toast «… مع N أسئلة» → «تراجع عن حذف القسم» → restored
//   4. section-instructions template over typed text → which button holds focus → a reflexive Enter → kept or replaced?
//   5. phone menu (below 1024 CSS px): open with a scripted click (no focus on the button, like a WebKit tap) → Escape → where is focus?
//   6. F6: every visible text element painted in --eb-muted on the pages visited → contrast against its real background (min, < 4.5)
//   7. F3: the shipped student-exam stylesheet on a `hidden` details panel → computed display / height
//   8. first confirmation latency on a throttled network (CDP: 400 ms RTT, 50 KB/s): idle after load, then «حذف» a saved exam →
//      time until the dialog is painted, and whether the dialog chunk was already fetched before the click (prefetch)
// Viewports: desktop 1280×900, desktop at 150 % (853×600 at 1.5×), desktop at 200 % (640×450 at 2×), phone 390×844 (touch).
// Output: HARNESS_OUT/<label>/ screenshots + record.json.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-visual-gate-21e1s2"), label);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ---- fixtures (teacher API shapes) ----
const sq = (id, text, marks) => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks, answer: { text: "—" } });
const structuredExam = { schemaVersion: 2, examId: "E2", title: "اختبار الشبكات — الوحدة الثالثة", status: "draft", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", metadata: {},
  sections: [
    { id: "s1", title: "القسم الأول: العناوين", gradingPolicy: "all", stimuli: {}, instructions: "", questions: [
      sq("q1", "ما عنوان الشبكة للعنوان 192.168.1.37/24؟", 2), sq("q2", "كم عنوانًا صالحًا للأجهزة في الشبكة /26؟", 2), sq("q3", "ما القناع المكافئ للبادئة /27؟", 2)] },
    { id: "s2", title: "القسم الثاني: التوجيه", gradingPolicy: "all", stimuli: {}, instructions: "", questions: [sq("r1", "اشرح وظيفة الموجّه الافتراضي.", 4)] },
  ] };
const savedExams = [{ blobName: "exams/e2.json", examId: "E2", title: structuredExam.title, savedAt: "2026-10-01T10:00:00Z", questionCount: 4, totalMarks: 10 }];
function api(req, res, body) {
  const u = new URL(req.url, "http://localhost"), p = u.pathname;
  const send = (code, j) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(j)); };
  let j = {}; try { j = JSON.parse(body || "{}"); } catch { /* not JSON */ }
  if (p === "/api/platform-session") return send(200, { ok: true, role: "teacher", displayName: "أ. أحمد" });
  if (p === "/api/teacher-profile") return send(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
  if (p === "/api/project-tracker") return send(200, u.searchParams.get("resource") === "projects-summary" ? { ok: true, totalReadyForReview: 0, byProject: {} } : { ok: true, projects: [] });
  if (p === "/api/messages") return send(200, { ok: true, totalUnread: 0, capped: false });
  if (p === "/api/saved-exams") {
    if (req.method === "GET") return send(200, { ok: true, exams: savedExams });
    if (j.action === "load") return send(200, { ok: true, exam: structuredExam, savedAt: "2026-10-01T10:00:00Z" });
    return send(200, { ok: true, deleted: true });
  }
  if (p === "/api/templates") return send(200, { ok: true, templates: [] });
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

// ---- in-page measurement helpers (serialised into the page) ----
const FOCUS = () => { const a = document.activeElement; if (!a || a === document.body) return "<body>"; const card = a.closest("[data-question-id]"); return (a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 40) + (a.dataset.questionId ? " [card " + a.dataset.questionId + "]" : card ? " [in card " + card.dataset.questionId + "]" : "") + (a.dataset.sectionId ? " [section " + a.dataset.sectionId + "]" : ""); };
const TOAST = () => {
  const el = document.querySelector(".eb-toast"); const live = document.querySelector(".eb-toast-layer [role='status']");
  if (!el) return { present: false, live: live ? live.textContent : null };
  const v = window.visualViewport, r = el.getBoundingClientRect();
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r1, g1, b1]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r1) + 0.7152 * f(g1) + 0.0722 * f(b1); };
  const over = (top, under) => { const a = top[3] ?? 1; return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
  const cardBg = rgb(getComputedStyle(el).backgroundColor);
  const action = el.querySelector(".eb-toast-action"), close = el.querySelector(".eb-toast-close");
  const hit = b => { if (!b) return null; const q = b.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2; const h = document.elementFromPoint(x, y); return !!h && (h === b || b.contains(h)); };
  const size = b => { if (!b) return null; const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; };
  const actionBg = action ? over(rgb(getComputedStyle(action).backgroundColor), cardBg) : null;
  return {
    present: true, text: el.querySelector(".eb-toast-message")?.textContent, role: el.getAttribute("role"), label: el.getAttribute("aria-label"), dir: el.closest("[dir]")?.getAttribute("dir"),
    live: live ? live.textContent : null, actionName: action ? (action.getAttribute("aria-label") || action.textContent) : null, actionText: action?.textContent ?? null,
    inView: r.left >= v.offsetLeft - 1 && r.right <= v.offsetLeft + v.width + 1 && r.top >= v.offsetTop - 1 && r.bottom <= v.offsetTop + v.height + 1,
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], viewport: [Math.round(v.width), Math.round(v.height)],
    actionOnTop: hit(action), closeOnTop: hit(close), actionSize: size(action), closeSize: size(close),
    contrastMessage: ratio(rgb(getComputedStyle(el.querySelector(".eb-toast-message")).color), cardBg),
    contrastAction: action ? ratio(rgb(getComputedStyle(action).color), actionBg) : null,
    zIndexLayer: getComputedStyle(el.closest(".eb-toast-layer")).zIndex, fontSize: getComputedStyle(el).fontSize,
  };
};
const MUTED = (mutedRgb) => {
  const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r1, g1, b1]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r1) + 0.7152 * f(g1) + 0.0722 * f(b1); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const bgOf = el => { const stack = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0) { stack.push(c); if ((c[3] ?? 1) >= 1) break; } } let base = [255, 255, 255]; for (const c of stack.reverse()) { const a = c[3] ?? 1; base = [0, 1, 2].map(i => c[i] * a + base[i] * (1 - a)); } return base; };
  const found = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || !el.getClientRects().length) continue;
    const c = rgb(cs.color); if (c.slice(0, 3).join(",") !== mutedRgb) continue;
    found.push({ text: el.textContent.trim().slice(0, 30), cls: (el.className && el.className.baseVal === undefined ? el.className : "").toString().slice(0, 40), ratio: +ratio(c, bgOf(el)).toFixed(2), fontSize: cs.fontSize });
  }
  const below = found.filter(f => f.ratio < 4.5);
  return { count: found.length, min: found.length ? Math.min(...found.map(f => f.ratio)) : null, below: below.length, belowSamples: below.slice(0, 6) };
};

async function run(name, viewport, touch, dsf) {
  const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: dsf, locale: "ar", reducedMotion: "reduce", serviceWorkers: "block" });
  await ctx.addInitScript(() => { sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد"); });
  const page = await ctx.newPage();
  const native = [];
  page.on("dialog", d => { native.push(d.type() + ": " + d.message().slice(0, 80)); void d.dismiss(); });
  page.on("pageerror", e => errors.push(name + ": " + e)); page.on("console", m => { if (m.type() === "error") errors.push(name + " console: " + m.text()); });
  const shot = (n, full = false) => page.screenshot({ path: path.join(out, name + "-" + n + ".png"), fullPage: full });
  const rec = record.viewports[name] = {};
  // A pointer click when the control can be hit; when something covers it at this viewport (the pre-existing sticky builder toolbar
  // takes almost all of a 450 px high viewport at 200 %), record a finding and operate the same control by keyboard (focus + Enter).
  const activate = async (locator, what) => {
    if (await locator.click({ timeout: 3000 }).then(() => true).catch(() => false)) return "pointer";
    (rec.findings = rec.findings || []).push(what + " is covered at " + viewport.width + "×" + viewport.height + " CSS px; operated by keyboard");
    await locator.focus(); await page.keyboard.press("Enter");
    return "keyboard";
  };
  const muted = { before: "100,116,139", after: "71,85,105" };
  const mutedScan = async where => {
    rec.muted = rec.muted || {}; rec.muted[where] = { "#64748b": await page.evaluate(MUTED, muted.before), "#475569": await page.evaluate(MUTED, muted.after) };
    // Optional: axe-core's colour-contrast rule on the same page (AXE_PATH = a local axe.min.js; never fetched by this script).
    if (process.env.AXE_PATH) {
      await page.addScriptTag({ path: process.env.AXE_PATH });
      rec.axe = rec.axe || {};
      rec.axe[where] = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: "rule", values: ["color-contrast"] }, resultTypes: ["violations"] });
        const nodes = r.violations.flatMap(v => v.nodes);
        const data = nodes.map(n => (n.any[0] && n.any[0].data) || {});
        return { nodes: nodes.length, mutedNodes: data.filter(d => /#64748b|#475569/i.test(String(d.fgColor))).length, samples: nodes.slice(0, 5).map((n, i) => n.target.join(" ") + " fg " + data[i].fgColor + " bg " + data[i].bgColor + " " + data[i].contrastRatio) };
      });
    }
  };

  await page.goto(origin + "/", { waitUntil: "networkidle" });
  const savedBtn = page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first();
  await savedBtn.waitFor({ timeout: 20000 });
  await mutedScan("builder-landing");

  // ── 5. phone menu focus return (below the 1024 px shell breakpoint only) ──
  const toggle = page.locator(".eb-drawer-toggle");
  if (await toggle.isVisible().catch(() => false)) {
    await page.evaluate(() => { document.activeElement?.blur?.(); document.querySelector(".eb-drawer-toggle").click(); });   // a tap that never focuses the button
    await page.locator("#eb-sidebar[role='dialog']").waitFor({ timeout: 4000 }).catch(() => {});
    await shot("01-phone-menu-open");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    rec.menuEscapeFocus = await page.evaluate(FOCUS);
    await page.evaluate(() => { document.activeElement?.blur?.(); document.querySelector(".eb-drawer-toggle").click(); });
    await page.locator(".eb-drawer-backdrop").waitFor({ timeout: 4000 }).catch(() => {});
    await page.evaluate(() => document.querySelector(".eb-drawer-backdrop")?.click());
    await page.waitForTimeout(150);
    rec.menuBackdropFocus = await page.evaluate(FOCUS);
    await shot("01b-phone-menu-closed-focus");
  } else rec.menu = "no phone menu at this width (desktop rail)";

  // ── open the saved structured exam ──
  await savedBtn.click();
  const openBtn = page.locator(".saved-exams-panel").getByRole("button", { name: /فتح وتعديل/ }).first();
  await openBtn.waitFor({ timeout: 10000 }); await openBtn.click();
  const card = id => page.locator("#sb-q-" + id);
  await card("q2").waitFor({ timeout: 20000 });
  await page.waitForTimeout(300);
  await shot("02-builder");
  await mutedScan("structured-builder");

  // ── 1. delete question 2 → toast → «تراجع» ──
  await card("q2").scrollIntoViewIfNeeded();
  await activate(card("q2").getByRole("button", { name: "حذف", exact: true }), "question 2's «حذف»");
  await page.waitForTimeout(150);
  rec.deleteQuestion = { questions: await page.locator("[data-question-id]").evaluateAll(els => els.map(e => e.dataset.questionId)), focus: await page.evaluate(FOCUS), toast: await page.evaluate(TOAST), nativeDialogs: native.slice() };
  await shot("03-question-deleted");
  if (rec.deleteQuestion.toast.present) {
    await activate(page.getByRole("button", { name: "تراجع عن حذف السؤال" }), "the toast's «تراجع»");
    await page.waitForTimeout(200);
    rec.undoQuestion = { questions: await page.locator("[data-question-id]").evaluateAll(els => els.map(e => e.dataset.questionId)), focus: await page.evaluate(FOCUS), toast: await page.evaluate(TOAST) };
    await shot("04-question-restored");
    // ── 2. Escape inside the toast → focus back to the neighbour card; keyboard: focus ring on the action ──
    await activate(card("q2").getByRole("button", { name: "حذف", exact: true }), "the restored question's «حذف»");
    await page.waitForTimeout(100);
    await page.keyboard.press("Shift");                                   // keyboard modality, so :focus-visible applies as for a Tab user
    await page.getByRole("button", { name: "تراجع عن حذف السؤال" }).focus();
    await page.waitForTimeout(100);
    await shot("05-toast-action-focus-ring");
    rec.focusRing = await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor, boxShadow: cs.boxShadow.slice(0, 60) }; });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    rec.escape = { toast: (await page.evaluate(TOAST)).present, focus: await page.evaluate(FOCUS), questions: await page.locator("[data-question-id]").evaluateAll(els => els.map(e => e.dataset.questionId)) };
    // Ctrl+Z (history) restores and the toast leaves by itself
    await activate(card("q3").getByRole("button", { name: "حذف", exact: true }), "question 3's «حذف»");
    await page.waitForTimeout(100);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(150);
    rec.ctrlZ = { toast: (await page.evaluate(TOAST)).present, questions: await page.locator("[data-question-id]").evaluateAll(els => els.map(e => e.dataset.questionId)) };
  } else {
    // BEFORE: the only route back is the toolbar «تراجع» / Ctrl+Z (history)
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(150);
    rec.undoQuestion = { route: "Ctrl+Z (no toast exists)", questions: await page.locator("[data-question-id]").evaluateAll(els => els.map(e => e.dataset.questionId)), focus: await page.evaluate(FOCUS) };
  }

  // ── 3. delete a section → toast → «تراجع» ──
  const s1 = page.locator(".sb-section").first();
  await s1.scrollIntoViewIfNeeded();
  await activate(s1.getByRole("button", { name: "حذف القسم", exact: true }), "«حذف القسم»");
  await page.waitForTimeout(150);
  rec.deleteSection = { sections: await page.locator(".sb-section").count(), focus: await page.evaluate(FOCUS), toast: await page.evaluate(TOAST) };
  await shot("06-section-deleted");
  if (rec.deleteSection.toast.present) {
    await activate(page.getByRole("button", { name: "تراجع عن حذف القسم" }), "the toast's «تراجع» (section)");
    await page.waitForTimeout(200);
    rec.undoSection = { sections: await page.locator(".sb-section").count(), questions: await page.locator("[data-question-id]").evaluateAll(els => els.map(e => e.dataset.questionId)), focus: await page.evaluate(FOCUS), toast: await page.evaluate(TOAST) };
    await shot("07-section-restored");
  } else { await page.keyboard.press("Control+z"); await page.waitForTimeout(150); rec.undoSection = { route: "Ctrl+Z (no toast exists)", sections: await page.locator(".sb-section").count() }; }

  // ── 4. template replacement: a reflexive Enter ──
  const sectionText = page.getByPlaceholder("تعليمات القسم").first();
  await sectionText.scrollIntoViewIfNeeded();
  await sectionText.fill("اقرأ السيناريو ثم أجب عن الأسئلة التي تليه.");
  const tplSelect = page.getByRole("combobox", { name: "قوالب تعليمات القسم" }).first();
  await tplSelect.focus(); await tplSelect.selectOption("answer-all");
  const dlg = page.getByRole("dialog", { name: "استبدال تعليمات القسم" });
  if (await dlg.waitFor({ timeout: 4000 }).then(() => true).catch(() => false)) {
    await page.waitForTimeout(100);
    rec.template = { focusOnOpen: await page.evaluate(() => (document.activeElement?.textContent || "").trim()) };
    await shot("08-template-dialog");
    await page.keyboard.press("Enter");
    await dlg.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    rec.template.afterReflexiveEnter = (await sectionText.inputValue()) === "اقرأ السيناريو ثم أجب عن الأسئلة التي تليه." ? "teacher text KEPT" : "teacher text REPLACED by the template";
  } else rec.template = { dialog: false, native: native.slice() };
  rec.overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  rec.toolbar = await page.evaluate(() => { const t = document.querySelector(".sb-toolbar"); return t ? { height: Math.round(t.getBoundingClientRect().height), viewportHeight: window.innerHeight } : null; });
  await ctx.close();
}

/** 7 — F3 on the shipped stylesheet: a details panel with `hidden`, styled by the real student-exam CSS asset. */
async function f3() {
  const assets = fs.readdirSync(path.join(dist, "assets")).filter(f => f.endsWith(".css") && fs.readFileSync(path.join(dist, "assets", f), "utf8").includes("iex-details-panel"));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(origin + "/__f3-probe", { waitUntil: "domcontentloaded" });
  await page.setContent(`<!doctype html><html dir="rtl"><head>${assets.map(a => `<link rel="stylesheet" href="${origin}/assets/${a}">`).join("")}</head><body><div class="interactive-exam-page"><div class="iex-details"><button type="button" aria-expanded="false" aria-controls="p">تفاصيل الامتحان</button><div id="p" class="iex-details-panel" hidden><p>المدة: 45 دقيقة</p><p>العلامة الكلية: 20</p></div></div></div></body></html>`, { waitUntil: "load" });
  const r = await page.evaluate(() => { const p = document.getElementById("p"); const cs = getComputedStyle(p); return { display: cs.display, height: Math.round(p.getBoundingClientRect().height), textVisible: p.innerText.length > 0 && p.getClientRects().length > 0 }; });
  await page.screenshot({ path: path.join(out, "f3-details-panel-hidden.png") });
  await ctx.close();
  return { assets, ...r };
}

/** 8 — first confirmation on a throttled network, after the page settled (idle). */
async function firstConfirm() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ar", reducedMotion: "reduce", serviceWorkers: "block" });
  await ctx.addInitScript(() => { sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد"); });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 25 * 1024 });
  const requests = [];
  page.on("request", r => requests.push({ t: Date.now(), url: r.url().replace(origin, "") }));
  await page.goto(origin + "/", { waitUntil: "networkidle", timeout: 120000 });
  const savedBtn = page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first();
  await savedBtn.waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000);                                       // the teacher reads the page: the browser is idle
  await savedBtn.click();
  const del = page.locator(".saved-exams-panel .saved-delete-button").first();
  await del.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  const before = requests.length;
  // Measured IN the page: from the click event to the frame where the dialog is in the DOM (no harness polling in the number).
  await page.evaluate(() => {
    const w = window; w.__confirmMs = null;
    document.addEventListener("click", () => {
      const t0 = performance.now();
      const done = () => { if (document.querySelector("[role='dialog']")) { w.__confirmMs = Math.round(performance.now() - t0); return true; } return false; };
      if (done()) return;
      const mo = new MutationObserver(() => { if (done()) mo.disconnect(); });
      mo.observe(document.body, { childList: true, subtree: true });
    }, { capture: true, once: true });
  });
  const t0 = Date.now();
  await del.click();
  await page.getByRole("dialog", { name: "حذف امتحان محفوظ" }).waitFor({ timeout: 30000 });
  await page.waitForFunction(() => window.__confirmMs !== null, null, { timeout: 30000 });
  const ms = await page.evaluate(() => window.__confirmMs);
  const harnessMs = Date.now() - t0;
  const dialogChunks = requests.filter(r => /ConfirmDialog|Dialog-/.test(r.url));
  const r = { firstConfirmMs: ms, harnessObservedMs: harnessMs, requestsDuringClick: requests.slice(before).map(r => r.url), dialogChunkRequestedBeforeClick: dialogChunks.some(d => d.t < t0), dialogChunks: dialogChunks.map(d => d.url) };
  await page.keyboard.press("Escape");
  await ctx.close();
  return r;
}

await run("desktop", { width: 1280, height: 900 }, false, 1);
await run("desktop-150pct", { width: 853, height: 600 }, false, 1.5);
await run("desktop-200pct", { width: 640, height: 450 }, false, 2);
await run("phone", { width: 390, height: 844 }, true, 2);
record.f3 = await f3();
record.firstConfirm = await firstConfirm();
await browser.close(); server.close();
record.errors = errors;
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
const t = x => (x && x.present ? "TOAST «" + x.text + "» live=«" + x.live + "» action=«" + x.actionName + "» inView=" + x.inView + " actionOnTop=" + x.actionOnTop + " sizes=" + JSON.stringify([x.actionSize, x.closeSize]) + " contrast=" + x.contrastMessage + "/" + x.contrastAction : "no toast");
for (const [vp, r] of Object.entries(record.viewports)) {
  console.log("== " + label + " / " + vp);
  if (r.menuEscapeFocus) console.log("  menu: Escape → focus «" + r.menuEscapeFocus + "»; backdrop → «" + r.menuBackdropFocus + "»");
  console.log("  delete q2: " + JSON.stringify(r.deleteQuestion.questions) + " focus «" + r.deleteQuestion.focus + "» " + t(r.deleteQuestion.toast));
  console.log("  undo: " + JSON.stringify(r.undoQuestion.questions) + " focus «" + r.undoQuestion.focus + "» " + (r.undoQuestion.route || t(r.undoQuestion.toast)));
  if (r.escape) console.log("  Escape in toast: toast=" + r.escape.toast + " focus «" + r.escape.focus + "»; Ctrl+Z: toast=" + r.ctrlZ.toast + " " + JSON.stringify(r.ctrlZ.questions) + "; ring " + JSON.stringify(r.focusRing));
  console.log("  delete section: sections=" + r.deleteSection.sections + " focus «" + r.deleteSection.focus + "» " + t(r.deleteSection.toast) + " → undo sections=" + r.undoSection.sections);
  console.log("  template: " + JSON.stringify(r.template));
  if (r.axe) console.log("  axe colour-contrast: " + JSON.stringify(Object.fromEntries(Object.entries(r.axe).map(([k, v]) => [k, v.nodes + " nodes (" + v.mutedNodes + " muted)"]))));
  console.log("  muted: " + JSON.stringify(Object.fromEntries(Object.entries(r.muted).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([c, m]) => [c, m.count + " el, min " + m.min + ", <4.5: " + m.below]))]))));
  console.log("  overflow: " + JSON.stringify(r.overflow) + "  sticky toolbar: " + JSON.stringify(r.toolbar) + (r.findings ? "\n  findings: " + r.findings.join(" | ") : ""));
}
console.log("F3: " + JSON.stringify(record.f3));
console.log("first confirm: " + JSON.stringify(record.firstConfirm));
console.log("errors: " + errors.length + (errors.length ? "\n" + errors.join("\n") : ""));
