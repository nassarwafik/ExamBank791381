#!/usr/bin/env node
// Phase 21E.2 — Premium Redesign slice 3 (builder panels): visual capture + functional checks on the REAL structured builder
// (certification only; never shipped). Same server / mock / exam shapes as capture-visual-gate-21e2p2.mjs, plus a blueprint with a
// quality policy so «فحص الجاهزية للاعتماد» is reachable. Per viewport:
//   «مستكشف الأسئلة» (a side panel above 900 px, a dialog at ≤ 900 px) → filter by type → select two questions (the bulk bar) →
//   «فحص الجاهزية للاعتماد» (the readiness dialog) → «عرض الأسئلة» reveals the evidence.
//   N-1 the navigator lists all 6 questions        N-2 the type filter narrows to 1 and «مسح الفلاتر» restores 6
//   B-1 two selections → the bulk bar says 2      B-2 the bulk bar keeps its position rule (sticky above 640 px, static below)
//   R-1 readiness: 3 sections, ≥ 1 quality-gate blocker      R-2 «عرض الأسئلة» closes the dialog and focuses a question card
//   V-1 no horizontal overflow    T-1 touch: navigator rows ≥ 44 px, checkboxes ≥ 24 px    E-1 no page / console errors
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-visual-gate-21e2p3"), label);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ---- fixture: one saved structured exam, one section per editor family ----
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="220" viewBox="0 0 480 220"><rect width="480" height="220" fill="#f8fafc"/><g stroke="#334155" stroke-width="2" fill="#fff"><rect x="30" y="85" width="90" height="50" rx="8"/><rect x="195" y="85" width="90" height="50" rx="8"/><rect x="360" y="30" width="90" height="50" rx="8"/><rect x="360" y="140" width="90" height="50" rx="8"/></g><g stroke="#2563eb" stroke-width="3"><line x1="120" y1="110" x2="195" y2="110"/><line x1="285" y1="105" x2="360" y2="55"/><line x1="285" y1="115" x2="360" y2="165"/></g><g font-family="sans-serif" font-size="15" text-anchor="middle" fill="#0f172a"><text x="75" y="115">PC-A</text><text x="240" y="115">R1</text><text x="405" y="60">SW1</text><text x="405" y="170">SW2</text></g></svg>`;
const image = { exists: true, visible: true, assets: [{ dataUrl: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"), origin: "uploaded" }] };
const Q = {
  mcq: { examQuestionId: "mcq", presentationType: "multipleChoice", marks: 2, text: "أيّ جهاز في المخطط يربط بين شبكتين مختلفتين؟", image,
    options: [{ text: "المبدّل SW1" }, { text: "الحاسوب PC-A" }, { text: "الموجّه R1" }, { text: "المبدّل SW2" }], answer: { correctOptionIndex: 2 } },
  tf: { examQuestionId: "tf", presentationType: "trueFalse", marks: 1, text: "بروتوكول DHCP يوزّع عناوين IP على الأجهزة تلقائيًا.", answer: { correct: true } },
  // matching: the stored shape buildMatchingPatch writes (select fields with every right-hand value, answer "left=right;…").
  match: (() => { const pairs = [["DNS", "ترجمة الأسماء إلى عناوين"], ["DHCP", "توزيع العناوين"], ["ARP", "إيجاد العنوان الفيزيائي"]], rights = pairs.map(p => ({ text: p[1] }));
    return { examQuestionId: "match", presentationType: "matching", marks: 3, text: ["| البروتوكول | الوظيفة |", "| --- | --- |", ...pairs.map(p => "| " + p[0] + " |  |")].join("\n"),
      fields: pairs.map((p, i) => ({ id: "m" + i, label: p[0], kind: "select", options: rights, correct: p[1] })), answer: { text: pairs.map(p => p[0] + "=" + p[1]).join(";") } }; })(),
  mtf: { examQuestionId: "mtf", presentationType: "multiTrueFalse", marks: 3, text: "حدّد صحة كل عبارة.",
    fields: [{ id: "t1", statement: "الطبقة الثالثة في نموذج OSI هي طبقة الشبكة.", kind: "boolean", correct: true }, { id: "t2", statement: "المبدّل يعمل في الطبقة الأولى فقط.", kind: "boolean", correct: false }] },
  bank: { examQuestionId: "bank", presentationType: "wordBank", marks: 2, text: "أكمل الفراغات من القائمة.", wordBank: ["الموجّه", "المبدّل", "الجدار الناري"],
    fields: [{ id: "b1", label: "يوجّه الرزم بين الشبكات", correct: "الموجّه" }, { id: "b2", label: "يصفّي الحركة حسب القواعد", correct: "الجدار الناري" }],
    answer: { mode: "exactSequence", values: ["الموجّه", "الجدار الناري"] } },   // syncSequenceAnswer(fields)
  table: { examQuestionId: "table", presentationType: "tableFill", marks: 4, text: "أكمل جدول العناوين.", tableHeaders: ["الجهاز", "عنوان IP", "القناع"],
    tableRows: [["PC-A", "", "255.255.255.0"], ["R1", "192.168.1.1", ""]],
    fields: [{ id: "c1", row: 0, column: 1, kind: "text", correct: "192.168.1.10" }, { id: "c2", row: 1, column: 2, kind: "select", correct: "/24", options: [{ text: "/24" }, { text: "/16" }] }] }
};
// The blueprint of the 15A preset tests (topic t1 needs ≥ 2 questions → a quality-gate blocker), mapped to this exam's sections.
const blueprint = { schemaVersion: 1, subject: { id: "networking", label: "شبكات الحاسوب" }, course: { id: "791381", label: "مقرر 791381" }, level: { id: "12", label: "ثاني ثانوي" },
  topics: [{ id: "t1", label: "IPv4" }, { id: "t2", label: "VLAN" }], objectives: [{ id: "o1", label: "يحسب شبكة فرعية", topicId: "t1" }], targets: { totalQuestions: 20, totalMarks: 60 },
  constraints: [{ id: "c1", dimension: "topic", ref: "t1", metric: "count", unit: "absolute", min: 2 }, { id: "c2", dimension: "section", ref: "s1", metric: "count", unit: "absolute", min: 1 }],
  qualityPolicy: { schemaVersion: 1, enabled: true, rules: [{ id: "qr1", enabled: true, source: { kind: "constraint", constraintId: "c1" }, relations: ["below-min"], effect: "block-finalization", note: "الحد الأدنى" }] } };
const savedExam = { schemaVersion: 2, examId: "E31", title: "اختبار الشبكات — الوحدة الثالثة", status: "draft", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", metadata: {}, blueprint,
  sections: [
    { id: "s1", title: "اختيار وصواب وخطأ", gradingPolicy: "all", stimuli: {}, instructions: "", questions: [{ ...Q.mcq, assessmentMeta: { primaryTopicId: "t1" } }, Q.tf, Q.mtf] },
    { id: "s2", title: "مطابقة وفراغات وجداول", gradingPolicy: "all", stimuli: {}, instructions: "", questions: [Q.match, Q.bank, Q.table] }
  ] };

function api(req, res, body) {
  const u = new URL(req.url, "http://localhost"), p = u.pathname;
  const send = (code, j) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(j)); };
  let j = {}; try { j = JSON.parse(body || "{}"); } catch { /* not JSON */ }
  if (p === "/api/platform-session") return send(200, { ok: true, role: "teacher", displayName: "أ. أحمد" });
  if (p === "/api/teacher-profile") return send(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
  if (p === "/api/project-tracker") return send(200, u.searchParams.get("resource") === "projects-summary" ? { ok: true, totalReadyForReview: 0, byProject: {} } : { ok: true, projects: [] });
  if (p === "/api/messages") return send(200, { ok: true, totalUnread: 0, capped: false, threads: [] });
  if (p === "/api/saved-exams" && req.method === "GET") return send(200, { ok: true, exams: [{ blobName: "exams/e31.json", examId: "E31", title: savedExam.title, savedAt: "2026-10-01T10:00:00Z", questionCount: 6, totalMarks: 15 }] });
  if (p === "/api/saved-exams" && j.action === "load") return send(200, { ok: true, exam: savedExam, savedAt: "2026-10-01T10:00:00Z" });
  if (p === "/api/saved-exams" && j.action === "save") return send(200, { ok: true, savedAt: new Date().toISOString(), blobName: "exams/s.json" });
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
const VIEWPORTS = [
  ["desktop", { width: 1280, height: 900 }, false, 1],
  ["150pct", { width: 853, height: 600 }, false, 1.5],
  ["200pct", { width: 640, height: 450 }, false, 2],
  ["phone", { width: 390, height: 844 }, true, 2]
];

for (const [name, viewport, touch, dsf] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch, deviceScaleFactor: dsf, locale: "ar", reducedMotion: "reduce", serviceWorkers: "block" });
  await ctx.addInitScript(() => { sessionStorage.setItem("examBankBuilderToken", "harness-token"); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد"); });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(name + ": " + e)); page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(name + " console: " + m.text()); });
  const rec = record.viewports[name] = {};
  const narrow = viewport.width <= 900;
  // Capture-only conditions (identical on BEFORE and AFTER): a tall viewport at the same width for element shots; restored after.
  const shoot = async (locator, file) => {
    const vp = page.viewportSize(); await page.setViewportSize({ width: vp.width, height: 2400 }); await page.waitForTimeout(250);
    try { await locator.screenshot({ path: path.join(out, name + "-" + file + ".png"), timeout: 8000 }); } catch (e) { errors.push(name + " shot " + file + ": " + (e.message || e).split("\n")[0]); }
    await page.setViewportSize(vp); await page.waitForTimeout(250);
  };
  const trigger = () => page.getByRole("button", { name: "المزيد من أدوات الامتحان" });
  const openMore = async item => {
    await trigger().click({ timeout: 8000 }); await page.waitForTimeout(250);
    if (!(await page.locator(".eb-menu-panel").count())) {                 // a click that does not open the menu is recorded, then retried
      (rec.menuFirstClickIgnored ||= []).push(item);
      await trigger().click({ timeout: 8000 }); await page.waitForTimeout(250);
      if (!(await page.locator(".eb-menu-panel").count())) { (rec.menuSecondClickIgnored ||= []).push(item); await trigger().focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(250); }
    }
    await page.locator(".eb-menu-panel button", { hasText: item }).first().click({ timeout: 8000 }); await page.waitForTimeout(400);
  };
  let step = "open";
  try {
    await page.goto(origin + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first().click();
    await page.locator(".saved-exams-panel").getByRole("button", { name: /فتح وتعديل/ }).first().click();
    await page.locator("#sb-q-table").waitFor({ timeout: 20000 }); await page.waitForTimeout(500);

    // N — the navigator
    step = "nav";
    await openMore("مستكشف الأسئلة");
    const nav = page.locator(".sb-navigator").first();
    await nav.waitFor({ timeout: 5000 });
    rec.navMode = narrow ? "dialog" : "panel";
    rec.entries = await nav.locator(".sb-nav-item").count();
    check(name, "N-1 the navigator lists all 6 questions (" + rec.navMode + ")", rec.entries === 6, String(rec.entries));
    if (touch) {
      rec.smallTargets = await page.evaluate(() => [...document.querySelectorAll(".sb-navigator :is(.sb-nav-jump,.sb-nav-check,.sb-btn,.sb-link-btn)")].map(el => {
        const r = el.getBoundingClientRect(); const min = el.matches(".sb-nav-check") ? 24 : 44;
        return { n: (el.getAttribute("aria-label") || el.textContent || el.className).trim().slice(0, 18), h: Math.round(r.height), w: Math.round(r.width), min };
      }).filter(x => x.h && (x.h < x.min || x.w < x.min)).slice(0, 8));
      check(name, "T-1 touch: navigator rows / buttons ≥ 44 px, checkboxes ≥ 24 px", rec.smallTargets.length === 0, JSON.stringify(rec.smallTargets));
    }
    await shoot(narrow ? page.locator(".eb-dialog.sb-navigator-dialog-shell") : nav, "navigator");
    await nav.locator(".sb-nav-filter", { hasText: "النوع" }).locator("select").selectOption("multipleChoice"); await page.waitForTimeout(200);
    const filtered = (await nav.locator(".sb-nav-count").textContent() || "").trim();
    await nav.getByRole("button", { name: "مسح الفلاتر" }).click(); await page.waitForTimeout(200);
    const restored = await nav.locator(".sb-nav-item").count();
    rec.filter = { filtered, restored };
    check(name, "N-2 the type filter narrows to 1; «مسح الفلاتر» restores 6", /^1 من 6/.test(filtered) && restored === 6, JSON.stringify(rec.filter));

    // B — the bulk bar
    step = "bulk";
    await nav.locator(".sb-nav-check").nth(0).check(); await nav.locator(".sb-nav-check").nth(3).check(); await page.waitForTimeout(200);
    if (narrow) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }
    const bar = page.locator(".sb-bulk-bar");
    rec.bulk = { count: (await bar.locator(".sb-bulk-count").textContent().catch(() => "") || "").trim(), position: await bar.evaluate(el => getComputedStyle(el).position).catch(() => null) };
    check(name, "B-1 two selections → the bulk bar says 2", /^2 /.test(rec.bulk.count), JSON.stringify(rec.bulk));
    check(name, "B-2 the bulk bar keeps its position rule (sticky above 640 px, static at ≤ 640 px)", rec.bulk.position === (viewport.width <= 640 ? "static" : "sticky"), String(rec.bulk.position));
    await bar.evaluate(n => n.scrollIntoView({ block: "center" })); await page.waitForTimeout(150);
    await shoot(bar, "bulk-bar");
    if (!narrow) { await page.locator(".sb-builder").evaluate(n => n.closest(".structured-builder-overlay").scrollTo(0, 0)); await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, name + "-workspace-with-navigator.png") }); }

    // R — the readiness dialog
    step = "readiness";
    await openMore("فحص الجاهزية للاعتماد");
    const dlg = page.locator(".eb-dialog.sb-fin-dialog");
    await dlg.waitFor({ timeout: 5000 });
    rec.readiness = { sections: await dlg.locator(".sb-fin-section").count(), gates: await dlg.locator(".sb-fin-item[data-gate-rule]").count() };
    check(name, "R-1 readiness: 3 sections, ≥ 1 quality-gate blocker", rec.readiness.sections === 3 && rec.readiness.gates >= 1, JSON.stringify(rec.readiness));
    await shoot(dlg, "readiness");
    const reveal = dlg.getByRole("button", { name: /^عرض/ }).first();
    if (await reveal.count()) {
      await reveal.click(); await page.waitForTimeout(500);
      rec.reveal = await page.evaluate(() => ({ dialogOpen: !!document.querySelector(".eb-dialog.sb-fin-dialog"), focus: document.activeElement?.closest(".sb-question")?.id || document.activeElement?.tagName }));
      check(name, "R-2 «عرض الأسئلة» closes the dialog and focuses a question card", !rec.reveal.dialogOpen && /^sb-q-/.test(rec.reveal.focus || ""), JSON.stringify(rec.reveal));
    } else check(name, "R-2 «عرض الأسئلة» present", false, "absent");

    rec.overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    check(name, "V-1 no horizontal page overflow", rec.overflow.scrollWidth <= rec.overflow.clientWidth, JSON.stringify(rec.overflow));
  } catch (e) {
    await page.screenshot({ path: path.join(out, name + "-error-" + step + ".png") }).catch(() => {}); errors.push(name + " harness [" + step + "]: " + (e && e.message || e).split("\n")[0]); }
  await ctx.close();
}
await browser.close(); server.close();
check("all", "E-1 no page or console errors", errors.length === 0, JSON.stringify(errors.slice(0, 5)));
record.checks = checks; record.errors = errors;
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
for (const c of checks) console.log("CHECK " + (c.ok ? "PASS" : "FAIL") + " [" + c.vp + "] " + c.id + " — " + c.detail);
console.log(label + ": " + checks.filter(c => c.ok).length + "/" + checks.length + " checks passed; page errors: " + errors.length);
