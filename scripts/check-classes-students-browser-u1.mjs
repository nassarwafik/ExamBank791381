#!/usr/bin/env node
// Phase U.1 — the Classes & Students page structure in a REAL Chromium on the production build (certification only; nothing is
// deployed). The build in DIST (default ./dist) is served next to the REAL API, in process (browser-harness/learning-l8-api.cjs:
// every Azure Functions handler of api/src/functions on the in-memory storage of the API tests, real signed sessions; the class
// and student routes, which take their container from their own module, are bound to the same storage). One teacher; eight
// classes (five active — 5, 29, 16, 24 and 3 students — and three archived), so the class filter is shown.
//
// At 390 and 834 px (touch) and 1024 and 1440 px, on «الصفوف والطلاب»:
//   1. the class filter and the roster search are single-line fields (≤ 48 px tall);
//   2. every class chip («بدون مشروع» / a project) is fully inside its card (not clipped);
//   3. from 834 px: the class bar sits ABOVE the roster and the roster takes ≥ 90 % of the workspace width; the bar is at most
//      340 px tall, so the roster starts near the top of the page;
//   4. at 390 px: the classes are one sideways strip (≤ 170 px tall); a card selected while half outside the strip is scrolled
//      fully into view; each student card is ≤ 132 px tall and shows the full name (the family name follows the first name);
//   5. «التفاصيل» opens the student dialog as a full-height side sheet at the inline end (the left edge in RTL) from 834 px and as a
//      bottom sheet at 390 px; Escape closes it and focus returns to the «التفاصيل» button;
//   6. axe-core (WCAG 2.1 A/AA): no serious or critical violation; no horizontal overflow of the page.
//
// Tools are measuring instruments, not project dependencies: PLAYWRIGHT_CORE_DIR and AXE_CORE_DIR each name a directory whose
// node_modules holds playwright-core / axe-core; CHROMIUM_PATH the browser. Output: HARNESS_OUT/<LABEL>/record.json (+ screenshots).
// Exit 1 when any check fails, 2 when a tool or the build is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "head";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-u1"), label);
const require = createRequire(import.meta.url);
let chromium, axeSource;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
try { axeSource = fs.readFileSync(createRequire(path.join(process.env.AXE_CORE_DIR || root, "package.json")).resolve("axe-core/axe.min.js"), "utf8"); }
catch { console.error("axe-core unavailable (set AXE_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ── the real API, in process ────────────────────────────────────────────────────────────────────────────────────────────────
const { withObservability, setSink } = require(path.join(root, "api/src/lib/observability.js"));
setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {} });
{
  const classrooms = require(path.join(root, "api/src/functions/manage-classrooms.js"));
  const students = require(path.join(root, "api/src/functions/manage-students.js"));
  for (const r of api.routes) {
    if (r.name === "manageClassrooms") r.handler = withObservability("classrooms", (req, ctx, obs) => classrooms.handler(req, { container: api.mem.container }, obs));
    if (r.name === "manageStudents") r.handler = withObservability("students", (req, ctx, obs) => students.handler(req, { container: api.mem.container }, obs));
  }
}
const teacherToken = api.teacherToken();
const call = async (method, url, body) => {
  const r = await api.handle(method, url, { authorization: "Bearer " + teacherToken, "x-builder-token": teacherToken }, body ? JSON.stringify(body) : "");
  return { status: r.status, json: r.body ? JSON.parse(r.body) : null };
};
let identity = 312000000;
async function seedClass(name, grade, count, archive) {
  const c = await call("POST", "/api/classrooms", { action: "create", name, grade, schoolYear: "2026-2027" });
  if (c.status !== 200) throw new Error("seed class: " + JSON.stringify(c.json));
  const classId = c.json.classroom.classId;
  for (let i = 0; i < count; i++) {
    const s = await call("POST", "/api/students", { action: "create", classId, firstName: "طالب" + (i + 1), familyName: "العائلة" + (i + 1), identityNumber: String(identity++) });
    if (s.status !== 200) throw new Error("seed student: " + JSON.stringify(s.json));
  }
  if (archive && (await call("POST", "/api/classrooms", { action: "archive", classId })).status !== 200) throw new Error("seed archive");
}
await seedClass("الصف التجريبي 2", "الحادي عشر", 5);
await seedClass("الحادي عشر 7", "الحادي عشر", 29);
await seedClass("الثاني عشر 2", "الثاني عشر", 16);
await seedClass("الثاني عشر 8", "الثاني عشر", 24);
await seedClass("العاشر 1", "العاشر", 3);
for (const n of ["أرشيف 2023", "أرشيف 2024", "أرشيف 2025"]) await seedClass(n, "العاشر", 2, true);

const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => { const r = await api.handle(req.method, req.url, req.headers, body); res.writeHead(r.status, r.headers); res.end(r.body); });
    return;
  }
  let full = path.resolve(dist, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(dist + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) full = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(full).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });

const record = { label, dist, screens: [], failures: [] };
const fail = (where, what) => { record.failures.push(where + ": " + what); console.log("  ✗ " + where + ": " + what); };
const pass = (where, what) => console.log("  ✓ " + where + ": " + what);
const check = (where, ok, what) => (ok ? pass(where, what) : fail(where, what));

async function openStudents(vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(t => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم"); }, teacherToken);
  const page = await ctx.newPage();
  page.on("pageerror", e => fail("page error @" + vp.width, e.message));
  await page.goto(origin + "/");
  const nav = page.getByRole("button", { name: "الصفوف والطلاب" }).first();
  await page.getByRole("button", { name: /القائمة/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
  if (!(await nav.isVisible().catch(() => false))) await page.getByRole("button", { name: /القائمة/ }).first().click().catch(() => {});
  await nav.click({ timeout: 15000 });
  await page.locator(".eb-roster-table tbody tr").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}

// Every measurement of one screen, taken in the page.
const MEASURE = () => {
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right, width: r.width, height: r.height }; };
  const layout = document.querySelector(".eb-students-layout"), classes = document.querySelector(".eb-classes-pane"), roster = document.querySelector(".eb-roster-pane");
  const list = document.querySelector(".eb-class-list");
  const clipped = [];
  for (const chip of document.querySelectorAll(".eb-class-row .eb-chip")) {
    const card = chip.closest(".eb-class-row"), c = chip.getBoundingClientRect(), k = card.getBoundingClientRect();
    const own = chip.closest(".eb-class-select")?.getBoundingClientRect();
    // the chip must be inside its card AND inside the select button that holds it (a clipping ancestor hides what sticks out)
    const inside = r => c.top >= r.top - 0.5 && c.bottom <= r.bottom + 0.5 && c.left >= r.left - 0.5 && c.right <= r.right + 0.5;
    if (!inside(k) || (own && !inside(own))) clipped.push((card.querySelector(".eb-class-name")?.textContent || "?") + " / " + chip.textContent);
  }
  const rows = [...document.querySelectorAll(".eb-roster-table tbody tr")].slice(0, 6).map(tr => Math.round(tr.getBoundingClientRect().height));
  const strong = document.querySelector(".eb-roster-table tbody td.eb-col-name strong");
  const family = strong ? getComputedStyle(strong, "::after").content : "";
  return {
    filter: box(document.querySelector(".eb-class-filter")), search: box(document.querySelector(".eb-roster-toolbar .eb-search-field")),
    layout: box(layout), classes: box(classes), roster: box(roster), list: box(list),
    listScroll: list ? { sw: list.scrollWidth, cw: list.clientWidth, sh: list.scrollHeight, ch: list.clientHeight } : null,
    clipped, rows, nameText: strong ? strong.textContent : "", familyAfter: family, overflow: document.documentElement.scrollWidth - innerWidth,
  };
};

async function axe(page, where) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
  });
  const blocking = result.filter(v => v.impact === "serious" || v.impact === "critical");
  check(where, blocking.length === 0, blocking.length ? "axe: " + blocking.map(v => v.id + " ×" + v.nodes + " (" + v.targets.join(", ") + ")").join("; ") : "axe: no serious / critical violation" + (result.length ? " (" + result.map(v => v.id + ":" + v.impact).join(", ") + ")" : ""));
  return result;
}

const VIEWPORTS = [{ width: 390, height: 844, touch: true }, { width: 834, height: 1112, touch: true }, { width: 1024, height: 768, touch: false }, { width: 1440, height: 900, touch: false }];
for (const vp of VIEWPORTS) {
  const at = "@" + vp.width;
  console.log("«الصفوف والطلاب» " + at);
  const { ctx, page } = await openStudents(vp);
  const m = await page.evaluate(MEASURE);
  await page.screenshot({ path: path.join(out, "students-" + vp.width + ".png"), fullPage: vp.width === 390 });
  // 1. single-line fields
  check("class filter " + at, !!m.filter && m.filter.height <= 48, "the class filter is " + (m.filter ? Math.round(m.filter.height) + " px tall" : "missing") + " (≤ 48)");
  check("roster search " + at, !!m.search && m.search.height <= 48, "the roster search is " + (m.search ? Math.round(m.search.height) + " px tall" : "missing") + " (≤ 48)");
  // 2. chips
  check("class chips " + at, m.clipped.length === 0, m.clipped.length ? "clipped: " + m.clipped.slice(0, 4).join(" · ") : "every class chip is fully inside its card");
  // 3. structure
  if (vp.width >= 834) {
    const share = m.roster.width / m.layout.width;
    check("structure " + at, m.classes.bottom <= m.roster.top + 1, "the class bar is above the roster (bar bottom " + Math.round(m.classes.bottom) + ", roster top " + Math.round(m.roster.top) + ")");
    check("structure " + at, share >= 0.9, "the roster takes " + Math.round(share * 100) + " % of the workspace width (≥ 90 %)");
    check("structure " + at, m.classes.height <= 340, "the class bar is " + Math.round(m.classes.height) + " px tall (≤ 340)");
  }
  // 4. phone
  if (vp.width < 768) {
    check("class strip " + at, !!m.listScroll && m.listScroll.sw > m.listScroll.cw && m.list.height <= 170, "the classes are one sideways strip (" + (m.list ? Math.round(m.list.height) : "?") + " px tall, scroll " + (m.listScroll ? m.listScroll.sw + "/" + m.listScroll.cw : "?") + ")");
    const tallest = Math.max(...m.rows);
    check("student cards " + at, tallest <= 132, "student cards are " + m.rows.join(", ") + " px tall (≤ 132)");
    check("student cards " + at, /العائلة1/.test(m.familyAfter), "the card shows the full name («" + m.nameText + "» + " + (m.familyAfter || "none") + ")");
    // a card half outside the strip, selected → scrolled fully into view (the list scrolls, the page does not)
    const partial = await page.evaluate(() => {
      const l = document.querySelector(".eb-class-list").getBoundingClientRect();
      const cards = [...document.querySelectorAll(".eb-class-row")];
      const i = cards.findIndex(c => { const r = c.getBoundingClientRect(); return r.right > l.left + 40 && r.left < l.left - 1; });
      if (i < 0) return null;
      const r = cards[i].getBoundingClientRect();
      return { i, x: Math.max(r.left, l.left) + 16, y: r.top + 20 };
    });
    const before = await page.evaluate(() => scrollY);
    if (partial) {
      await page.mouse.click(partial.x, partial.y);
      await page.waitForTimeout(500);
      const after = await page.evaluate(i => { const l = document.querySelector(".eb-class-list").getBoundingClientRect(); const card = document.querySelectorAll(".eb-class-row")[i]; const c = card.getBoundingClientRect(); return { inView: c.left >= l.left - 1 && c.right <= l.right + 1, pressed: card.querySelector(".eb-class-select").getAttribute("aria-pressed"), y: scrollY }; }, partial.i);
      check("class strip " + at, after.pressed === "true" && after.inView, "a card selected while half outside the strip is fully in view (pressed " + after.pressed + ", in view " + after.inView + ")");
      check("class strip " + at, Math.abs(after.y - before) < 2, "selecting a card does not scroll the page (" + before + " → " + after.y + ")");
      await page.locator(".eb-roster-table tbody tr").first().waitFor({ timeout: 10000 });
    } else fail("class strip " + at, "no class card is half outside the strip");
  }
  // 6. page-level
  check("page " + at, m.overflow <= 0, m.overflow > 0 ? "horizontal overflow " + m.overflow + " px" : "no horizontal overflow");
  const violations = await axe(page, "page " + at);
  // 5. the student dialog
  const details = page.getByRole("button", { name: "التفاصيل" }).first();
  await details.click();
  const panel = page.locator(".eb-student-dialog");
  await panel.waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  const d = await panel.evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, vw: document.documentElement.clientWidth, vh: innerHeight }; });
  await page.screenshot({ path: path.join(out, "student-dialog-" + vp.width + ".png") });
  if (vp.width >= 768) check("student dialog " + at, d.left <= 1 && d.top <= 1 && d.bottom >= d.vh - 1 && d.width < d.vw, "a full-height side sheet at the inline end (left " + Math.round(d.left) + ", top " + Math.round(d.top) + ", height " + Math.round(d.height) + "/" + d.vh + ", width " + Math.round(d.width) + ")");
  else check("student dialog " + at, d.bottom >= d.vh - 1 && d.width >= d.vw - 1, "a bottom sheet (bottom " + Math.round(d.bottom) + "/" + d.vh + ", width " + Math.round(d.width) + "/" + d.vw + ")");
  await axe(page, "student dialog " + at);
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  const focus = await page.evaluate(() => ({ open: !!document.querySelector(".eb-student-dialog"), label: document.activeElement?.getAttribute("title") || document.activeElement?.textContent || "" }));
  check("student dialog " + at, !focus.open && /تفاصيل/.test(focus.label), "Escape closes it and focus returns to «التفاصيل» (" + (focus.open ? "still open" : focus.label.trim().slice(0, 30)) + ")");
  record.screens.push({ width: vp.width, measures: m, dialog: d, violations });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? "U.1 GATE FAILED: " + record.failures.length + " check(s)" : "U.1 gate passed") + " — record: " + path.join(out, "record.json"));
process.exit(record.failures.length ? 1 : 0);
