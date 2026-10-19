#!/usr/bin/env node
// Phase P3 — the student's one-tap stage marking in a REAL Chromium on the production build (certification only; nothing is
// deployed). The build in DIST (default ./dist) is served next to the REAL API, in process (browser-harness/learning-l8-api.cjs:
// every Azure Functions handler on the in-memory storage of the API tests, real signed sessions). One class enrolled in
// project 899373; one student per viewport, each with the third stage of the first group approved by the teacher.
//
// At 390 px (touch) and 1024 and 1440 px, on the student portal's «مشاريعي»:
//   1. the stage list opens on «المتبقية» with its count; the teacher-approved stage is not listed there and has no action;
//   2. «أنجزتها», «تراجع», «أنجزت المجموعة كلها» and the group heads are at least 44 px tall on touch (36 px from 768 px);
//      the page never scrolls sideways;
//   3. «أنجزتها» on a stage stores it as the student's own mark in ONE request carrying only the project, the stage id and
//      mark (checked in storage), and «بانتظار تأكيد المعلم (1)» counts it;
//   4. «تراجع» undoes it (storage back to «لم يبدأ»);
//   5. «أنجزت المجموعة كلها» on the second group asks first, then stores every stage of it in ONE request;
//   6. axe-core (WCAG 2.1 A/AA): no serious or critical violation on the portal with the list.
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
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-p3"), label);
const require = createRequire(import.meta.url);
let chromium, axeSource;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); }
try { axeSource = fs.readFileSync(createRequire(path.join(process.env.AXE_CORE_DIR || root, "package.json")).resolve("axe-core/axe.min.js"), "utf8"); }
catch { console.error("axe-core unavailable (set AXE_CORE_DIR)"); process.exit(2); }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// ── the real API, in process ────────────────────────────────────────────────────────────────────────────────────────────────
const CODE = "899373";
const { getStorageNamespace, getProjectDefinition } = require(path.join(root, "api/src/lib/project-tracker/registry.js"));
const NS = getStorageNamespace(CODE);
const DEF = getProjectDefinition(CODE);
const groupsOfFirstTrack = DEF.groups.filter(g => g.track === DEF.tracks[0].trackId).sort((a, b) => a.order - b.order);
const stagesOf = g => DEF.stages.filter(s => s.groupId === g.groupId && s.active === true).sort((a, b) => a.order - b.order);
const [G1, G2] = groupsOfFirstTrack.slice(0, 2).map(stagesOf);
const G2_TITLE = groupsOfFirstTrack[1].title;
const NOW = "2026-10-01T00:00:00.000Z";
const VIEWPORTS = [{ width: 390, height: 844, touch: true }, { width: 1024, height: 768, touch: false }, { width: 1440, height: 900, touch: false }];
const students = VIEWPORTS.map((vp, i) => ({ userId: "p3s" + (i + 1), role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب " + (i + 1), code: "P3" + (i + 1) }));
const seed = { "platform/classes/c1.json": { classId: "c1", name: "الحادي عشر 7", grade: "11", schoolYear: "2026", status: "active", active: true, studentIds: students.map(s => s.userId), programCodes: [CODE], createdAt: NOW, updatedAt: NOW } };
for (const s of students) {
  seed["platform/users/" + s.userId + ".json"] = s;
  seed[NS.progressName("c1", s.userId)] = { schemaVersion: 1, programCode: CODE, classId: "c1", studentId: s.userId, startedAt: NOW, updatedAt: NOW, stages: { [G1[2].stageId]: { status: "approved", approvedBy: "teacher-1", approvedAt: NOW } }, history: [] };
}
const { setSink } = require(path.join(root, "api/src/lib/observability.js"));
setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed });

const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const posts = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => {
      if (req.method === "POST" && u.pathname === "/api/student-project-tracker") { try { posts.push(JSON.parse(body)); } catch { /* not JSON */ } }
      const r = await api.handle(req.method, req.url, req.headers, body); res.writeHead(r.status, r.headers); res.end(r.body);
    });
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
const entry = (sid, stageId) => { const d = api.mem.getJson(NS.progressName("c1", sid)); return d && d.stages ? d.stages[stageId] : undefined; };

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

const remaining = DEF.stages.filter(s => s.active === true && s.track === DEF.tracks[0].trackId).length - 1;
for (const [i, vp] of VIEWPORTS.entries()) {
  const at = "@" + vp.width, student = students[i], sid = student.userId;
  console.log("«مشاريعي» " + at);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(([t, n]) => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "student"); sessionStorage.setItem("examBankSessionDisplayName", n); }, [api.studentToken(student), student.displayName]);
  const page = await ctx.newPage();
  page.on("pageerror", e => fail("page error " + at, e.message));
  await page.goto(origin + "/");
  const filters = page.getByRole("group", { name: "عرض المراحل" });
  await filters.waitFor({ timeout: 20000 });
  await filters.scrollIntoViewIfNeeded();
  const rowOf = id => page.locator(".eb-sp-stage", { has: page.locator(".eb-sp-stage-code", { hasText: new RegExp("^" + id + "$") }) });
  // 1. the opening view
  const pressed = await filters.locator('button[aria-pressed="true"]').textContent();
  check("filters " + at, pressed === "المتبقية (" + remaining + ")", "opens on «" + pressed + "» (wanted «المتبقية (" + remaining + ")»)");
  check("filters " + at, (await rowOf(G1[2].stageId).count()) === 0, "the teacher-approved stage is not listed under «المتبقية»");
  // 2. sizes and overflow
  const min = vp.touch ? 44 : 36;
  const m = await page.evaluate(() => {
    const h = sel => [...document.querySelectorAll(sel)].filter(n => n.offsetParent).map(n => Math.round(n.getBoundingClientRect().height));
    return { done: h(".eb-sp-done-btn"), group: h(".eb-sp-group-mark"), toggle: h(".eb-sp-group-toggle"), overflow: document.documentElement.scrollWidth - innerWidth };
  });
  check("sizes " + at, m.done.length > 0 && Math.min(...m.done) >= min, "«أنجزتها» ≥ " + min + " px (" + Math.min(...m.done) + ", " + m.done.length + " buttons)");
  check("sizes " + at, m.group.length > 0 && Math.min(...m.group) >= min && Math.min(...m.toggle) >= min, "group action / head ≥ " + min + " px (" + Math.min(...m.group) + " / " + Math.min(...m.toggle) + ")");
  check("page " + at, m.overflow <= 0, m.overflow > 0 ? "the page scrolls sideways by " + m.overflow + " px" : "no horizontal page overflow");
  await page.screenshot({ path: path.join(out, "remaining-" + vp.width + ".png"), fullPage: false });
  // 3. one tap
  const target = G1[1].stageId;
  let before = posts.length;
  await rowOf(target).getByRole("button", { name: /^أنجزت / }).click();
  await page.getByText("تم تحديد " + target + " كمنفّذة. تظهر الآن لمعلمك.").waitFor({ timeout: 15000 });
  const sent = posts.slice(before);
  check("tap " + at, sent.length === 1 && JSON.stringify(sent[0]) === JSON.stringify({ projectCode: CODE, stageIds: [target], mark: true }), "ONE minimal request (" + JSON.stringify(sent) + ")");
  check("tap " + at, entry(sid, target)?.selfReportedBy === sid && entry(sid, target)?.status === "approved", "stored as the student's own mark");
  await page.waitForFunction(() => /^بانتظار تأكيد المعلم \(1\)$/.test([...document.querySelectorAll('[aria-label="عرض المراحل"] button')][1]?.textContent || ""), null, { timeout: 15000 }).then(() => pass("tap " + at, "«بانتظار تأكيد المعلم (1)» counts it"), () => fail("tap " + at, "the pending count did not update"));
  // 4. undo (in «بانتظار تأكيد المعلم»)
  await filters.getByRole("button", { name: /^بانتظار/ }).click();
  await rowOf(target).getByRole("button", { name: /^تراجع عن تحديد / }).click();
  await page.getByText("تم التراجع عن تحديد " + target + ".").waitFor({ timeout: 15000 });
  check("undo " + at, (entry(sid, target)?.status ?? "not_started") === "not_started" && !entry(sid, target)?.selfReportedAt, "storage is back to «لم يبدأ»");
  // 5. the whole second group
  await filters.getByRole("button", { name: /^المتبقية/ }).click();
  const g2 = page.locator("section.eb-sp-project-group", { has: page.getByRole("heading", { name: G2_TITLE, exact: true }) });
  before = posts.length;
  await g2.getByRole("button", { name: /^أنجزت المجموعة كلها/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 10000 });
  check("group " + at, posts.length === before, "asks before writing (no request yet)");
  await page.screenshot({ path: path.join(out, "group-confirm-" + vp.width + ".png"), fullPage: false });
  await dialog.getByRole("button", { name: /^تحديد / }).click();
  await page.getByText(/^تم تحديد .+ من «.+» كمنفّذة\. تظهر الآن لمعلمك\.$/).waitFor({ timeout: 15000 });
  const groupSent = posts.slice(before);
  const g2Ids = G2.map(s => s.stageId);
  check("group " + at, groupSent.length === 1 && JSON.stringify(groupSent[0].stageIds) === JSON.stringify(g2Ids), "ONE request with the group's " + g2Ids.length + " stages (" + JSON.stringify(groupSent.map(p => p.stageIds)) + ")");
  check("group " + at, g2Ids.every(id => entry(sid, id)?.selfReportedBy === sid), "every stage of the group is stored as the student's own mark");
  await page.screenshot({ path: path.join(out, "group-done-" + vp.width + ".png"), fullPage: false });
  // 6. accessibility
  await filters.getByRole("button", { name: /^الكل/ }).click();
  await page.mouse.move(0, 0);                                                    // no hover left on the chip just tapped
  await page.waitForTimeout(500);                                                 // the chips' colour transition has settled
  const chip = await filters.getByRole("button", { name: /^الكل/ }).evaluate(b => { const c = getComputedStyle(b); return c.color + " on " + c.backgroundColor; });
  pass("portal " + at, "the pressed «الكل» chip settles at " + chip);
  const violations = await axe(page, "portal " + at);
  record.screens.push({ width: vp.width, measures: m, violations });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? "P3 GATE FAILED: " + record.failures.length + " check(s)" : "P3 gate passed") + " — record: " + path.join(out, "record.json"));
process.exit(record.failures.length ? 1 : 0);
