#!/usr/bin/env node
// Phase 21E.1 (slice 1) — Visual Quality Gate capture on the REAL teacher pages (certification only; never shipped).
// Drives the production build (DIST, default ./dist) in real Chromium through a real teacher session against a small local mock of
// the teacher API (the payload shapes App.tsx reads; no token, nothing deployed, service workers blocked):
//   1. builder landing → «📚 الامتحانات المحفوظة» → delete a saved exam BY KEYBOARD (Enter on «حذف», then Escape / keep)
//   2. «🗂 القوالب» → delete a template → keep
//   3. «🧱 امتحان منظّم جديد» → type section instructions → choose a section-instructions template → the replace confirmation
//   4. open the saved exam in the legacy editor → delete a question (keep) → «⚖️ توزيع العلامات» → «حسب الصعوبة»
//   5. «بنك الامتحانات» page → delete a saved exam → the confirmation (a dialog that was already in-page before 21E.1)
// On the BEFORE build (main 66b8a9f) steps 1–4 fire NATIVE browser dialogs: they are browser chrome, invisible to page screenshots,
// so their type and text are recorded instead. For every shared dialog the record holds the title, aria-modal, direction, the
// focused control, the button labels, whether the whole dialog is inside the visible area, and a real hit test of its confirm
// button. Viewports: desktop 1280×900, phone 390×844 (touch), desktop at 200 % (640×450 at 2×), phone at 200 % page zoom
// (195×422 at 4×, step 5 only — the reachability case). Output: HARNESS_OUT/<label>/ screenshots + record.json.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-visual-gate-21e1"), label);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ---- fixtures (teacher API shapes) ----
const q = (id, text, marks, difficulty, options) => ({ examQuestionId: id, origin: "bank", sourceId: "S-" + id, section: "BASIC", topic: "IPv4", secondaryTopics: [], difficulty, difficultyLabel: "", familyKey: "f-" + id, hasCLI: false, requiresCalculation: false, presentationType: "multipleChoice", marks, locked: false, text, options, fields: [], parts: [], answer: { correctOptionValue: "a" }, teacherNote: "", aiInstruction: "", wasModified: false, image: { exists: false, visible: false, origin: null, assets: [], prompt: null }, history: [], redoStack: [] });
const legacyExam = { schemaVersion: 1, examId: "E1", title: "امتحان الشبكات — الوحدة الثانية", originalRequest: "", plan: null, totalMarks: 20, status: "draft", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z",
  metadata: { school: "", subject: "شبكات الاتصال", grade: "", className: "", teacherName: "", date: "", duration: "", semester: "", generalInstructions: "أجب عن جميع الأسئلة." },
  questions: [q("q1", "ما هو عنوان الشبكة للعنوان 192.168.1.37/24؟", 10, 2, [{ value: "a", text: "192.168.1.0" }, { value: "b", text: "192.168.1.255" }]), q("q2", "كم عنوانًا صالحًا للأجهزة في الشبكة /26؟", 10, 4, [{ value: "a", text: "62" }, { value: "b", text: "64" }])],
  summary: { sections: { BASIC: 2 }, difficulty: {}, topics: {}, types: {}, images: 0, cli: 0, calculations: 0 }, warnings: [], revisionHistory: [] };
const savedExams = [{ blobName: "exams/e1.json", examId: "E1", title: legacyExam.title, savedAt: "2026-10-01T10:00:00Z", questionCount: 2, totalMarks: 20 }];
const templates = [{ blobName: "templates/t1.json", templateId: "T1", title: "قالب الاختبار النهائي", savedAt: "2026-10-01T10:00:00Z", totalMarks: 50, totalQuestions: 10 }];
const apiCalls = [];
function api(req, res, body) {
  const u = new URL(req.url, "http://localhost"), p = u.pathname;
  apiCalls.push(req.method + " " + p + u.search);
  const send = (code, j) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(j)); };
  let j = {}; try { j = JSON.parse(body || "{}"); } catch { /* not JSON */ }
  if (p === "/api/platform-session") return send(200, { ok: true, role: "teacher", displayName: "أ. أحمد" });
  if (p === "/api/teacher-profile") return send(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
  if (p === "/api/project-tracker") return send(200, u.searchParams.get("resource") === "projects-summary" ? { ok: true, totalReadyForReview: 0, byProject: {} } : { ok: true, projects: [] });
  if (p === "/api/messages") return send(200, { ok: true, totalUnread: 0, capped: false });
  if (p === "/api/saved-exams") {
    if (req.method === "GET") return send(200, { ok: true, exams: savedExams });
    if (j.action === "load") return send(200, { ok: true, exam: legacyExam, savedAt: "2026-10-01T10:00:00Z" });
    if (j.action === "delete") return send(200, { ok: true, deleted: true });
  }
  if (p === "/api/templates") return send(200, req.method === "GET" ? { ok: true, templates } : { ok: true, deleted: true });
  if (p === "/api/bank-questions") return send(200, { ok: true, questions: [] });
  if (p === "/api/classrooms") return send(200, { ok: true, classes: [] });
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

/** Everything a reviewer needs about one open shared dialog, measured in the page's own coordinates. */
const describe = dlg => dlg.evaluate(el => {
  const v = window.visualViewport, r = el.getBoundingClientRect();
  const buttons = [...el.querySelectorAll(".eb-dialog-foot button, footer button")];
  const decide = buttons[buttons.length - 1];
  let confirmOnTop = false;
  if (decide) { const b = decide.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2; const inVis = x >= v.offsetLeft && x <= v.offsetLeft + v.width && y >= v.offsetTop && y <= v.offsetTop + v.height; const hit = document.elementFromPoint(x, y); confirmOnTop = inVis && !!hit && (hit === decide || decide.contains(hit)); }
  const title = el.querySelector("h2, h1, [id$='title'], .eb-dialog-title");
  const cs = getComputedStyle(el);
  return { title: title ? title.textContent.trim() : "", ariaModal: el.getAttribute("aria-modal"), dir: el.closest("[dir]")?.getAttribute("dir") || document.documentElement.dir,
    focused: (document.activeElement?.textContent || "").trim().slice(0, 40), buttons: buttons.map(b => (b.textContent || "").trim()), buttonHeights: buttons.map(b => Math.round(b.getBoundingClientRect().height)),
    inView: r.left >= v.offsetLeft - 1 && r.right <= v.offsetLeft + v.width + 1 && r.top >= v.offsetTop - 1 && r.bottom <= v.offsetTop + v.height + 1, confirmOnTop,
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], visible: [Math.round(v.offsetLeft), Math.round(v.offsetTop), Math.round(v.width), Math.round(v.height)], fontSize: cs.fontSize };
});

async function run(name, viewport, touch, dsf, onlyBank = false) {
  const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: dsf, locale: "ar", reducedMotion: "reduce", serviceWorkers: "block" });
  await ctx.addInitScript(() => { sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد"); });
  const page = await ctx.newPage();
  const native = [];
  page.on("dialog", d => { native.push({ type: d.type(), message: d.message().slice(0, 160) }); if (d.type() === "prompt") void d.accept("2"); else void d.dismiss(); });
  page.on("pageerror", e => errors.push(name + ": " + e)); page.on("console", m => { if (m.type() === "error") errors.push(name + " console: " + m.text()); });
  const shot = (n, full = false) => page.screenshot({ path: path.join(out, name + "-" + n + ".png"), fullPage: full });
  const rec = record.viewports[name] = { steps: [] };
  /** Trigger a confirmation and record the shared dialog (after) or the native one (before); `act` closes the shared dialog. */
  async function ask(step, title, trigger, act) {
    const n = native.length;
    const opener = await trigger();
    const dlg = page.getByRole("dialog", { name: title });
    const shared = await dlg.waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
    const entry = { step, shared, native: native.slice(n) };
    if (shared) {
      entry.dialog = await describe(dlg);
      await shot(step);
      entry.result = await act(dlg);
      entry.focusReturned = opener ? await opener.evaluate(el => document.activeElement === el).catch(() => null) : null;
    } else { entry.result = "native dialog handled by the browser (dismissed / prompt answered «2»)"; await shot(step + "-native"); }
    rec.steps.push(entry);
    return entry;
  }
  await page.goto(origin + "/", { waitUntil: "networkidle" });
  if (!onlyBank) {
    const savedBtn = page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first();
    await savedBtn.waitFor({ timeout: 20000 });
    await shot("01-builder-landing");
    await savedBtn.click();
    const delSaved = page.locator(".saved-exams-panel .saved-delete-button").first();
    await delSaved.waitFor({ timeout: 10000 });
    await shot("02-saved-exams");
    // 1 — keyboard only: focus «حذف», Enter opens the confirmation, Escape keeps the exam.
    await ask("03-delete-saved-exam", "حذف امتحان محفوظ", async () => { await delSaved.focus(); await page.keyboard.press("Enter"); return delSaved; },
      async () => { await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached", timeout: 3000 }).catch(() => {}); return "Escape — exam kept: " + (await page.locator(".saved-exams-panel .saved-delete-button").count() === 1); });
    // 2 — templates.
    await page.getByRole("button", { name: /القوالب/ }).first().click();
    const delTpl = page.locator(".templates-panel .saved-delete-button").first();
    await delTpl.waitFor({ timeout: 10000 });
    await ask("04-delete-template", "حذف قالب", async () => { await delTpl.click(); return delTpl; },
      async dlg => { await dlg.getByRole("button", { name: "إبقاء القالب" }).click(); return "«إبقاء القالب» — template kept: " + (await page.locator(".templates-panel .saved-delete-button").count() === 1); });
    // 3 — structured builder: section-instructions template over typed text.
    await page.getByRole("button", { name: /امتحان منظّم جديد/ }).first().click();
    const sectionText = page.getByPlaceholder("تعليمات القسم").first();
    await sectionText.waitFor({ timeout: 20000 });
    await sectionText.fill("اقرأ السيناريو ثم أجب عن الأسئلة التي تليه.");
    const tplSelect = page.getByRole("combobox", { name: "قوالب تعليمات القسم" }).first();
    await ask("05-section-template", "استبدال تعليمات القسم", async () => { await tplSelect.focus(); await tplSelect.selectOption("answer-all"); return tplSelect; },
      async () => { const focused = await page.evaluate(() => (document.activeElement?.textContent || "").trim()); await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached", timeout: 3000 }).catch(() => {}); return "focus on open: «" + focused + "»; Escape — instructions kept: " + ((await sectionText.inputValue()) === "اقرأ السيناريو ثم أجب عن الأسئلة التي تليه."); });
    if (!rec.steps[rec.steps.length - 1].shared) rec.steps[rec.steps.length - 1].result += "; instructions kept: " + ((await sectionText.inputValue()) === "اقرأ السيناريو ثم أجب عن الأسئلة التي تليه.");
    await shot("05b-structured-builder", false);
    // Leaving the builder with unsaved edits asks first (a shared dialog on both builds, pre-existing): leave without saving.
    await ask("05c-leave-unsaved-builder", "تغييرات غير محفوظة", async () => { const b = page.getByRole("button", { name: /رجوع/ }).first(); await b.click(); return null; },
      async dlg => { await dlg.getByRole("button", { name: "الخروج دون حفظ" }).click(); await page.getByRole("dialog").waitFor({ state: "detached", timeout: 3000 }).catch(() => {}); return "«الخروج دون حفظ»"; });
    // 4 — legacy editor: open the saved exam, delete a question (keep), distribute marks.
    await page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first().waitFor({ timeout: 10000 });
    const openBtn = page.locator(".saved-exams-panel").getByRole("button", { name: /فتح وتعديل/ }).first();
    if (!(await openBtn.isVisible().catch(() => false))) await page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first().click();
    await openBtn.waitFor({ timeout: 10000 }); await openBtn.click();
    await page.locator("#generated-exam").waitFor({ timeout: 20000 });
    await shot("06-legacy-editor");
    const delQ = page.locator(".question-delete-mini").first();
    await ask("07-delete-question", "حذف سؤال من الامتحان", async () => { await delQ.focus(); await page.keyboard.press("Enter"); return delQ; },
      async () => { await page.keyboard.press("Enter"); await page.getByRole("dialog").waitFor({ state: "detached", timeout: 3000 }).catch(() => {}); return "Enter on the focused safe choice — questions kept: " + (await page.locator(".question-delete-mini").count()); });
    await ask("08-distribute-marks", "توزيع العلامات تلقائيًا", async () => { const b = page.getByRole("button", { name: /توزيع العلامات/ }).first(); await b.click(); return b; },
      async dlg => { await dlg.getByRole("button", { name: "حسب الصعوبة" }).click(); await page.getByRole("dialog").waitFor({ state: "detached", timeout: 3000 }).catch(() => {}); return "«حسب الصعوبة» applied"; });
    rec.marks = await page.getByText(/تم توزيع العلامات/).first().textContent({ timeout: 5000 }).then(t => (t || "").trim()).catch(() => "(no distribution notice)");
    await shot("09-after-distribution");
  }
  // 5 — the exam bank page's own delete confirmation (already an in-page dialog before 21E.1): the reachability case.
  const toggle = page.locator(".eb-drawer-toggle");
  const finding = f => { rec.findings = (rec.findings || []).concat(f); };
  // Reach the bank page the way a user does — a TAP on each control. Below 320 CSS px parts of the shell are covered (page-wide layout,
  // 21E.6): each blocked tap is recorded as a finding with a screenshot, and the same control is then operated by keyboard (Enter).
  const tapOrKeyboard = async (locator, what, shotName) => {
    await locator.waitFor({ timeout: 20000 });
    if (await locator.click({ timeout: 3000 }).then(() => true).catch(() => false)) return;
    await shot(shotName);
    finding(what + " is covered at " + viewport.width + " CSS px (a tap does not reach it); operated by keyboard instead");
    await locator.focus(); await page.keyboard.press("Enter");
  };
  if (await toggle.isVisible().catch(() => false)) await tapOrKeyboard(toggle, "the menu button «القائمة»", "10a-menu-button-covered");
  await tapOrKeyboard(page.locator("#eb-sidebar").getByRole("button", { name: "بنك الامتحانات" }).first(), "the sidebar item «بنك الامتحانات»", "10b-drawer-item-covered");
  const examsTab = page.getByRole("tab", { name: "الامتحانات المحفوظة" }).or(page.getByRole("button", { name: "الامتحانات المحفوظة", exact: true })).first();
  await tapOrKeyboard(examsTab, "the bank page tab «الامتحانات المحفوظة»", "10c-bank-tab-covered");
  const bankSection = page.locator("section[aria-labelledby='eb-bank-exams-title']");
  const bankDel = bankSection.getByRole("button", { name: /حذف/ }).first();
  await bankDel.waitFor({ timeout: 20000 }).catch(async e => { await shot("10-exam-bank-FAILED", true); console.log("DEBUG h1=" + (await page.locator("h1").first().innerText().catch(() => "?")) + " sections=" + JSON.stringify(await page.locator("section[aria-labelledby]").evaluateAll(els => els.map(e => e.getAttribute("aria-labelledby") + ": " + e.innerText.slice(0, 120))))); throw e; });
  await bankDel.scrollIntoViewIfNeeded();
  await shot("10-exam-bank");
  await ask("11-bank-delete-saved-exam", "حذف امتحان محفوظ", async () => { await tapOrKeyboard(bankDel, "the saved exam's «حذف» button", "10d-bank-delete-covered"); return bankDel; },
    async () => { await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached", timeout: 3000 }).catch(() => {}); return "Escape — exam kept"; });
  rec.overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  await ctx.close();
}
await run("desktop", { width: 1280, height: 900 }, false, 1);
await run("phone", { width: 390, height: 844 }, true, 2);
await run("desktop-200pct", { width: 640, height: 450 }, false, 2);
await run("phone-200pct-page-zoom", { width: 195, height: 422 }, true, 4, true);
await browser.close(); server.close();
record.errors = errors; record.apiCalls = [...new Set(apiCalls)].slice(0, 40);
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
for (const [vp, r] of Object.entries(record.viewports)) {
  console.log("== " + label + " / " + vp + (r.marks ? "  marks notice: " + r.marks : "") + (r.findings ? "\n  findings: " + r.findings.join(" | ") : ""));
  for (const s of r.steps) console.log("  " + s.step + ": " + (s.shared ? "SHARED «" + s.dialog.title + "» modal=" + s.dialog.ariaModal + " dir=" + s.dialog.dir + " focus=«" + s.dialog.focused + "» buttons=" + JSON.stringify(s.dialog.buttons) + " h=" + JSON.stringify(s.dialog.buttonHeights) + " inView=" + s.dialog.inView + " confirmOnTop=" + s.dialog.confirmOnTop + " focusReturned=" + s.focusReturned : "NATIVE " + JSON.stringify(s.native)) + " → " + s.result);
}
console.log("errors: " + errors.length + (errors.length ? "\n" + errors.join("\n") : ""));
