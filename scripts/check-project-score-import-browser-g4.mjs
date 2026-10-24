#!/usr/bin/env node
// Phase G4 — «استيراد من Excel» in the class matrix, in a REAL Chromium on the production build (certification only; nothing is
// deployed). Same harness as the G1 / G3 gates: the build in DIST next to the REAL API in process, one teacher, one class of 24
// students enrolled in project 899373, three of them graded through the API. At 390 px (touch) and 1440 px:
//   1. «تصدير إلى Excel» downloads the class's file; it is edited the way a teacher would in Excel (one new score, one invalid
//      value, one row of a student who is not in the class) and saved back the way Excel saves it (DEFLATE parts, shared strings);
//   2. «استيراد من Excel» reads it in the browser and previews it: one score to fill, the invalid value and the unknown row named,
//      and nothing written;
//   3. «تعبئة الجدول» fills the matrix as unsaved drafts; «حفظ العلامات» stores the score and approves the stage (the switch is on
//      by default): score.bulk then progress.bulk;
//   4. axe-core (WCAG 2.1 A/AA) on the open preview, no sideways scroll, the import button a 44 px touch target.
// Tools: PLAYWRIGHT_CORE_DIR / AXE_CORE_DIR name directories whose node_modules hold playwright-core / axe-core; CHROMIUM_PATH
// the browser. Output: HARNESS_OUT/<LABEL>/record.json (+ the files and screenshots). Exit 1 when a check fails, 2 when a tool is
// missing.
import fs from "node:fs";
import http from "node:http";
import zlib from "node:zlib";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const label = process.env.LABEL || "head";
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-g4"), label);
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
const CODE = "899373";
const { getProjectDefinition } = require(path.join(root, "api/src/lib/project-tracker/registry.js"));
const DEF = getProjectDefinition(CODE);
const teacherToken = api.teacherToken();
const call = async (method, url, body) => {
  const r = await api.handle(method, url, { authorization: "Bearer " + teacherToken, "x-builder-token": teacherToken }, body ? JSON.stringify(body) : "");
  return { status: r.status, json: r.body ? JSON.parse(r.body) : null };
};
let classId = "";
const studentIds = [], names = [];
{
  const c = await call("POST", "/api/classrooms", { action: "create", name: "الحادي عشر 7", grade: "الحادي عشر", schoolYear: "2026-2027" });
  if (c.status !== 200) throw new Error("seed class: " + JSON.stringify(c.json));
  classId = c.json.classroom.classId;
  for (let i = 0; i < 24; i++) {
    const s = await call("POST", "/api/students", { action: "create", classId, firstName: "طالب" + (i + 1), familyName: "العائلة" + (i + 1), identityNumber: String(313000000 + i) });
    if (s.status !== 200) throw new Error("seed student: " + JSON.stringify(s.json));
    studentIds.push(s.json.student.userId);
    names.push("طالب" + (i + 1) + " العائلة" + (i + 1));
  }
  const p = await call("POST", "/api/classrooms", { action: "setPrograms", classId, programCodes: [CODE] });
  if (p.status !== 200) throw new Error("seed project: " + JSON.stringify(p.json));
}

const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
const posts = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => {
      if (req.method === "POST" && u.pathname === "/api/project-tracker") { try { posts.push(JSON.parse(body)); } catch { /* not JSON */ } }
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
// A UTF-8 locale for the browser process: without one (an empty LANG, as on some runners) Chromium cannot store a non-ASCII
// download name and falls back to «download» — a property of the machine, not of the page.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"], env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } });

const record = { label, dist, screens: [], failures: [] };
const fail = (where, what) => { record.failures.push(where + ": " + what); console.log("  ✗ " + where + ": " + what); };
const pass = (where, what) => console.log("  ✓ " + where + ": " + what);
const check = (where, ok, what) => (ok ? pass(where, what) : fail(where, what));

async function openWorkspace(vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(t => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم"); }, teacherToken);
  const page = await ctx.newPage();
  page.on("pageerror", e => fail("page error @" + vp.width, e.message));
  await page.goto(origin + "/");
  const nav = page.getByRole("button", { name: "المشاريع", exact: true }).first();
  await page.getByRole("button", { name: /القائمة/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
  if (!(await nav.isVisible().catch(() => false))) await page.getByRole("button", { name: /القائمة/ }).first().click().catch(() => {});
  await nav.click({ timeout: 15000 });
  const open = page.getByRole("button", { name: "فتح المشروع" });
  await open.first().waitFor({ timeout: 20000 });
  const cards = await open.count();
  for (let i = 0; i < cards; i++) {                                         // the card of project 899373
    const card = open.nth(i).locator("xpath=ancestor::*[self::article or self::li][1]");
    if ((await card.textContent()).includes(CODE)) { await open.nth(i).click(); break; }
    if (i === cards - 1) await open.first().click();
  }
  await page.getByRole("group", { name: "أقسام المشروع" }).waitFor({ timeout: 20000 });
  return { ctx, page };
}

async function axe(page, where) {
  // axe measures the settled screen: a dialog fades in (ebFadeIn), and a frame taken mid-fade reads its muted text at a partial
  // opacity. Every finite animation is let finish first; an endless one (a skeleton) never blocks.
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ")) }));
  });
  const blocking = result.filter(v => v.impact === "serious" || v.impact === "critical");
  check(where, blocking.length === 0, blocking.length ? "axe: " + blocking.map(v => v.id + " ×" + v.nodes + " (" + v.targets.join(", ") + ")").join("; ") : "axe: no serious / critical violation" + (result.length ? " (" + result.map(v => v.id + ":" + v.impact).join(", ") + ")" : ""));
  return result;
}

// ── three graded students (scores through score.bulk, one approval and one note through progress.update) ──────────────────────
const FIRST = DEF.stages.filter(s => s.track === DEF.tracks[0].trackId && s.active === true).sort((a, b) => a.order - b.order).map(s => s.stageId);
const [S1, S2] = FIRST;
const NOTE = "ملاحظة المعلم الخاصة G3";
{
  const items = [{ studentId: studentIds[0], stageId: S1, score: 91, expected: null }, { studentId: studentIds[1], stageId: S1, score: 0, expected: null }, { studentId: studentIds[2], stageId: S2, score: 66.5, expected: null }];
  const r = await call("POST", "/api/project-tracker", { projectCode: CODE, action: "score.bulk", classId, items });
  if (r.status !== 200) throw new Error("seed scores: " + JSON.stringify(r.json));
  const u = await call("POST", "/api/project-tracker", { projectCode: CODE, action: "progress.update", classId, studentId: studentIds[0], stageId: S1, status: "approved", note: NOTE });
  if (u.status !== 200) throw new Error("seed approval: " + JSON.stringify(u.json));
  const again = await call("POST", "/api/project-tracker", { projectCode: CODE, action: "score.set", classId, studentId: studentIds[0], stageId: S1, score: "93" });
  if (again.status !== 200) throw new Error("seed rescore: " + JSON.stringify(again.json));
}
const codes = [];
for (const sid of studentIds) { const u = api.mem.getJson("platform/users/" + sid + ".json"); codes.push(String(u && u.code || "")); }



/** The parts of a STORED zip (the export) by name. */
function unzipStoredParts(buf) {
  const files = {};
  let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const size = buf.readUInt32LE(i + 18), nameLen = buf.readUInt16LE(i + 26), extra = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString("utf8"), start = i + 30 + nameLen + extra;
    files[name] = buf.slice(start, start + size).toString("utf8");
    i = start + size;
  }
  return files;
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** A zip of DEFLATE-compressed parts, as Excel writes one. */
function zipDeflated(files) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8"), data = zlib.deflateRawSync(raw), n = Buffer.from(name, "utf8"), crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, data); centrals.push(ch, n); offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
/** Excel's re-save of the exported sheet: every inline string moved to sharedStrings, then the given edits per row / column. */
function excelResave(parts, edits) {
  const strings = [];
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let sheet = parts["xl/worksheets/sheet1.xml"].replace(/<c r="([A-Z]+\d+)"( s="\d+")? t="inlineStr"[^>]*><is><t[^>]*>([\s\S]*?)<\/t><\/is><\/c>/g, (_, ref, st, t) => {
    let i = strings.indexOf(t); if (i < 0) { strings.push(t); i = strings.length - 1; }
    return '<c r="' + ref + '"' + (st || "") + ' t="s"><v>' + i + "</v></c>";
  });
  for (const e of edits) {
    const ref = e.col + e.row;
    sheet = sheet.replace(new RegExp('<c r="' + ref + '"[^>]*?(?:/>|>[\\s\\S]*?</c>)'), "");      // Excel replaces the cell, never adds a second
    const cell = typeof e.value === "number" ? '<c r="' + ref + '"><v>' + e.value + "</v></c>" : '<c r="' + ref + '" t="inlineStr"><is><t>' + esc(e.value) + "</t></is></c>";
    if (new RegExp('<row r="' + e.row + '">').test(sheet)) sheet = sheet.replace(new RegExp('(<row r="' + e.row + '">)'), "$1" + cell);
    else sheet = sheet.replace("</sheetData>", '<row r="' + e.row + '">' + cell + "</row></sheetData>");
  }
  return zipDeflated({ ...parts, "xl/worksheets/sheet1.xml": sheet, "xl/sharedStrings.xml": '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + strings.map(t => "<si><t>" + t + "</t></si>").join("") + "</sst>" });
}
const unescapeXml = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

const { getStorageNamespace } = require(path.join(root, "api/src/lib/project-tracker/registry.js"));
const NS = getStorageNamespace(CODE);
const entry = (sid, stageId) => { const d = api.mem.getJson(NS.progressName(classId, sid)); return d && d.stages ? d.stages[stageId] : undefined; };
const VIEWPORTS = [{ width: 390, height: 844, touch: true }, { width: 1440, height: 900, touch: false }];
for (const [vi, vp] of VIEWPORTS.entries()) {
  const at = "@" + vp.width;
  console.log("الاستيراد من Excel " + at);
  const target = 3 + vi, value = 70 + vi;                                     // a different student per width
  const { ctx, page } = await openWorkspace(vp);
  await page.getByRole("group", { name: "أقسام المشروع" }).getByRole("button", { name: /التقييم الجماعي/ }).click();
  await page.getByRole("button", { name: "جدول العلامات" }).click();
  await page.locator(".eb-score-grid-table").waitFor({ timeout: 20000 });
  // 1. the export, edited and saved back as Excel does
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByRole("button", { name: "تصدير إلى Excel" }).click()]);
  const exported = path.join(out, "export-" + vp.width + ".xlsx");
  await download.saveAs(exported);
  const parts = unzipStoredParts(fs.readFileSync(exported));
  const xmlSheet = parts["xl/worksheets/sheet1.xml"] || "";
  const cells = [...xmlSheet.matchAll(/<c r="([A-Z]+)(\d+)"[^>]*t="inlineStr"[^>]*><is><t[^>]*>([\s\S]*?)<\/t><\/is><\/c>/g)].map(m => ({ col: m[1], row: Number(m[2]), text: unescapeXml(m[3]) }));
  const scoreCol = (cells.find(c => c.text.includes(" · " + S1 + " ") && c.text.endsWith("— العلامة من 100")) || {}).col;
  const rowOf = name => (cells.find(c => c.col === "A" && c.text === name) || {}).row;
  const lastRow = Math.max(...cells.map(c => c.row));
  const edited = excelResave(parts, [{ col: scoreCol, row: rowOf(names[target]), value }, { col: scoreCol, row: rowOf(names[1]), value: "١٢٠" },
    { col: "A", row: lastRow + 1, value: "طالب غريب" }, { col: "B", row: lastRow + 1, value: "•••••0000" }, { col: scoreCol, row: lastRow + 1, value: 90 }]);
  const file = path.join(out, "edited-" + vp.width + ".xlsx");
  fs.writeFileSync(file, edited);
  check("file " + at, !!scoreCol && !!rowOf(names[target]) && edited.readUInt16LE(8) === 8, "the export edited and saved back with DEFLATE parts and shared strings (" + S1 + " in column " + scoreCol + ")");
  // 2. the preview
  const button = page.getByRole("button", { name: "استيراد من Excel" });
  if (vp.touch) { const b = await button.boundingBox(); check("button " + at, !!b && b.height >= 44, "«استيراد من Excel» is a " + Math.round(b ? b.height : 0) + " px touch target (≥ 44)"); }
  const postsBefore = posts.length;
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10000 }), vp.touch ? button.tap() : button.click()]);
  await chooser.setFiles(file);
  const dialog = page.getByRole("dialog", { name: "استيراد العلامات من Excel" });
  const summary = dialog.getByRole("list", { name: "ملخّص الاستيراد" });
  await summary.waitFor({ timeout: 15000 });
  const sumText = (await summary.textContent()) || "";
  check("preview " + at, sumText.includes("1 علامة ستُعبّأ في الجدول كتغييرات غير محفوظة"), "one score to fill («" + sumText.split(".")[0] + "»)");
  const issues = await dialog.getByRole("list", { name: "ما لن يُستورد" }).getByRole("listitem").allTextContents();
  check("preview " + at, issues.length === 2 && issues.some(t => t.includes(names[1]) && t.includes("«١٢٠»") && t.includes("ليست علامة من 0 إلى 100")) && issues.some(t => t.includes("طالب غريب") && t.includes("لا يطابق أي طالب")),
    "the invalid value and the unknown row are named (" + issues.length + ")");
  check("preview " + at, posts.length === postsBefore, "reading the file wrote nothing");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("preview " + at, overflow <= 0, overflow > 0 ? "the page scrolls sideways by " + overflow + " px" : "no horizontal page overflow");
  const v1 = await axe(page, "preview dialog " + at);
  await page.screenshot({ path: path.join(out, "preview-" + vp.width + ".png"), fullPage: false });
  // 3. fill, then save
  await dialog.getByRole("button", { name: "تعبئة الجدول (1)" }).click();
  await dialog.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  const input = page.getByRole("textbox", { name: new RegExp("^" + names[target] + " — " + S1 + " ") });
  check("fill " + at, (await input.inputValue()) === String(value) && posts.length === postsBefore, "the matrix shows " + value + " as an unsaved draft, nothing written yet");
  await page.getByRole("button", { name: /^حفظ العلامات/ }).click();
  await page.getByText("لا توجد تغييرات").first().waitFor({ timeout: 15000 });
  const actions = posts.slice(postsBefore).map(p => p.action);
  check("save " + at, JSON.stringify(actions) === JSON.stringify(["score.bulk", "progress.bulk"]), "score.bulk then progress.bulk (" + actions.join(" → ") + ")");
  const progressDoc = entry(studentIds[target], S1);
  check("save " + at, !!progressDoc && progressDoc.score === value && progressDoc.status === "approved", "stored: " + S1 + " " + (progressDoc ? progressDoc.score + " · " + progressDoc.status : "—"));
  record.screens.push({ width: vp.width, violations: { preview: v1 } });
  await ctx.close();
}

await browser.close();
server.close();
fs.writeFileSync(path.join(out, "record.json"), JSON.stringify(record, null, 2));
console.log("\n" + (record.failures.length ? "G4 GATE FAILED: " + record.failures.length + " check(s)" : "G4 gate passed") + " — record: " + path.join(out, "record.json"));
process.exit(record.failures.length ? 1 : 0);
