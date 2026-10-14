#!/usr/bin/env node
// Phase 21E.2 — Premium Redesign slice 2 (question editors): visual capture + functional checks on the REAL structured builder
// (certification only; never shipped). Drives a production build (DIST, default ./dist) in real Chromium against a small local
// mock of the teacher API, opens a saved exam whose questions cover the legacy editor families (multiple choice with an image,
// true / false, matching, multi true / false, word-bank dropdowns, table fill) and screenshots each question card.
//   Functional checks (the same on a BEFORE and an AFTER build — presentation must not change behaviour):
//     Q-1 every fixture question renders its card            Q-2 the stored correct answers are the checked / selected controls
//     Q-3 choosing another MCQ answer marks it unsaved and keeps one checked radio
//     Q-4 adding an option adds exactly one row               V-1 no horizontal page overflow   V-2 every row control is reachable
//     T-1 on touch, per-row controls are ≥ 44 px              E-1 no page / console errors
// Output: HARNESS_OUT/<label>/ screenshots + record.json; one CHECK line per assertion.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "after";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-visual-gate-21e2p2"), label);
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
const savedExam = { schemaVersion: 2, examId: "E21", title: "اختبار الشبكات — الوحدة الثالثة", status: "draft", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", metadata: {},
  sections: [
    { id: "s1", title: "اختيار وصواب وخطأ", gradingPolicy: "all", stimuli: {}, instructions: "", questions: [Q.mcq, Q.tf, Q.mtf] },
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
  if (p === "/api/saved-exams" && req.method === "GET") return send(200, { ok: true, exams: [{ blobName: "exams/e21.json", examId: "E21", title: savedExam.title, savedAt: "2026-10-01T10:00:00Z", questionCount: 6, totalMarks: 15 }] });
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
  try {
    await page.goto(origin + "/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /الامتحانات المحفوظة/ }).first().click();
    await page.locator(".saved-exams-panel").getByRole("button", { name: /فتح وتعديل/ }).first().click();
    await page.locator("#sb-q-table").waitFor({ timeout: 20000 }); await page.waitForTimeout(600);

    const ids = Object.keys(Q);
    rec.rendered = await page.evaluate(ids => ids.filter(id => document.getElementById("sb-q-" + id)), ids);
    check(name, "Q-1 every fixture question renders its card", rec.rendered.length === ids.length, rec.rendered.join(","));

    rec.answers = await page.evaluate(() => {
      const q = id => document.getElementById("sb-q-" + id);
      const radios = el => [...(el?.querySelectorAll("input[type=radio]") || [])];
      const mcq = radios(q("mcq")).findIndex(r => r.checked);
      const tf = radios(q("tf")).findIndex(r => r.checked);
      // answer controls only (the card also holds the type selector, the section selector and the marks / number inputs)
      const sel = (id, scope) => [...(q(id)?.querySelectorAll(scope + " select") || [])].map(s => s.value);
      const vals = (id, scope) => [...(q(id)?.querySelectorAll(scope + " input") || [])].map(i => i.value);
      return { mcq, tf, mtf: sel("mtf", ".sb-fields .sb-field-row"), bank: sel("bank", ".sb-fields-list"), match: vals("match", ".sb-matching"), tableInputs: vals("table", ".sb-grid").filter(Boolean) };
    });
    const a = rec.answers;
    check(name, "Q-2 stored answers are the checked / selected controls", a.mcq === 2 && a.tf === 0 && a.mtf.join() === "true,false" && a.bank.join() === "الموجّه,الجدار الناري"
      && a.match.includes("DHCP") && a.match.includes("توزيع العناوين") && a.tableInputs.includes("192.168.1.10") && a.tableInputs.includes("/24"), JSON.stringify(a));

    // T-1 is measured BEFORE any element screenshot: an element shot can leave the emulated metrics changed until reload.
    if (touch) {
      rec.smallTargets = await page.evaluate(() => [...document.querySelectorAll(".sb-question :is(.sb-icon-btn,.sb-mini-btn,.sb-collapse,input[type=radio])")]
        .map(el => { const t = el.matches("input[type=radio]") ? el.closest("label") || el : el; const r = t.getBoundingClientRect(); return { n: el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 14) || el.tagName, h: Math.round(r.height), w: Math.round(r.width) }; })
        .filter(x => x.h && (x.h < 44 || x.w < 44)).slice(0, 10));
      check(name, "T-1 touch: per-row controls (icon, mini, collapse, answer radios) are ≥ 44 px", rec.smallTargets.length === 0, JSON.stringify(rec.smallTargets));
    }

    // L-1 — an MCQ option row keeps its controls (correct pill, ↑, ↓, ×) on ONE line at every width (the option text may wrap below).
    rec.optionLines = await page.evaluate(() => [...document.querySelectorAll("#sb-q-mcq .sb-option-row")].map(row => {
      const tops = [...row.querySelectorAll(":scope > .sb-radio, :scope > .sb-icon-btn")].map(el => Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2));
      return Math.max(...tops) - Math.min(...tops);
    }));
    check(name, "L-1 each MCQ option keeps its answer pill and ↑ ↓ × on one line", rec.optionLines.every(d => d <= 2), JSON.stringify(rec.optionLines));

    // Screenshots of each editor family. Capture-only conditions, identical on BEFORE and AFTER builds: a tall viewport at the
    // same width (layout widths unchanged) and the toolbar unstuck, so a whole card is captured and nothing overlays its top.
    const vpSize = page.viewportSize();
    await page.setViewportSize({ width: vpSize.width, height: 2600 });
    await page.addStyleTag({ content: ".sb-toolbar{position:static!important}" });
    await page.waitForTimeout(250);
    for (const id of ids) {
      const el = page.locator("#sb-q-" + id);
      await el.evaluate(n => n.scrollIntoView({ block: "start" })); await page.waitForTimeout(150);
      const file = path.join(out, name + "-q-" + id + ".png");
      // An element shot can time out on "stable" inside the fixed, scrolling overlay; fall back to the viewport clip of the card.
      try { await el.screenshot({ path: file, timeout: 8000 }); }
      catch { const b = await el.boundingBox(); const vp = page.viewportSize(); await page.screenshot({ path: file, clip: { x: 0, y: Math.max(0, b.y), width: vp.width, height: Math.max(1, Math.min(vp.height - Math.max(0, b.y), b.height)) } }); rec.clippedShots = (rec.clippedShots || 0) + 1; }
    }
    await page.setViewportSize(vpSize); await page.waitForTimeout(250);
    await page.locator("#sb-q-mcq").evaluate(n => n.scrollIntoView({ block: "start" })); await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, name + "-viewport-mcq.png") });

    rec.overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    check(name, "V-1 no horizontal page overflow", rec.overflow.scrollWidth <= rec.overflow.clientWidth, JSON.stringify(rec.overflow));
    rec.unreachable = await page.evaluate(() => {
      const scroller = document.querySelector(".structured-builder-overlay");
      const sw = scroller ? scroller.getBoundingClientRect() : { left: 0, right: innerWidth };
      return [...document.querySelectorAll(".sb-question :is(button,input,select,textarea)")].filter(el => {
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
        if (el.closest(".sb-tablefill-scroll")) return false;                // the table scrolls in its own container by design
        return r.right > sw.right + 1 || r.left < sw.left - 1;
      }).map(el => (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.tagName)).slice(0, 8);
    });
    check(name, "V-2 every question control lies inside the builder (none clipped off-screen)", rec.unreachable.length === 0, JSON.stringify(rec.unreachable));
    // Q-3 / Q-4 — behaviour after the shots: choose another MCQ answer; add an option.
    const mcq = page.locator("#sb-q-mcq");
    await mcq.scrollIntoViewIfNeeded();
    await mcq.locator("input[type=radio]").nth(0).check();
    await page.waitForTimeout(200);
    rec.afterChoose = await page.evaluate(() => ({ checked: [...document.querySelectorAll("#sb-q-mcq input[type=radio]")].map(r => r.checked), dirty: !!document.querySelector(".sb-save-state.is-dirty") }));
    check(name, "Q-3 choosing another MCQ answer: exactly that radio checked, exam marked unsaved", rec.afterChoose.checked.filter(Boolean).length === 1 && rec.afterChoose.checked[0] && rec.afterChoose.dirty, JSON.stringify(rec.afterChoose));
    const rowsBefore = await mcq.locator(".sb-option-row").count();
    await mcq.getByRole("button", { name: /إضافة خيار/ }).click(); await page.waitForTimeout(200);
    rec.rows = [rowsBefore, await mcq.locator(".sb-option-row").count()];
    check(name, "Q-4 «+ إضافة خيار» adds exactly one option row", rec.rows[1] === rec.rows[0] + 1, JSON.stringify(rec.rows));
  } catch (e) { errors.push(name + " harness: " + (e && e.message || e)); }
  await ctx.close();
}
await browser.close(); server.close();
check("all", "E-1 no page or console errors", errors.length === 0, JSON.stringify(errors.slice(0, 5)));
record.checks = checks; record.errors = errors;
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
for (const c of checks) console.log("CHECK " + (c.ok ? "PASS" : "FAIL") + " [" + c.vp + "] " + c.id + " — " + c.detail);
console.log(label + ": " + checks.filter(c => c.ok).length + "/" + checks.length + " checks passed; page errors: " + errors.length);
