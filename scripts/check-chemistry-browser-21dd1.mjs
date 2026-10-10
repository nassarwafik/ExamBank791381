#!/usr/bin/env node
// Phase 21D-D.1 — real-Chromium certification of the ARABIC ACCEPTANCE EXAM for chemistryStructure@1 (browser-harness/chemistry-21dd1.*).
// The six standalone simulations and the shared ammonia context render on ONE exam page with the production workspace, from the STUDENT
// projection; every answer change is bound by the shared server authority and autosaved. Checks:
//   • the exam page: seven workspaces, nothing private in the DOM, RTL page with LTR scientific islands;
//   • answering with the KEYBOARD (counters, radios, Enter to save, arrow keys across the periodic table, Enter to choose an element) and
//     with the POINTER (shell buttons, a real drag / wheel on the 3D molecule, clicks on atoms for the measuring probe);
//   • presentation never answers: rotating / zooming / resetting / measuring / browsing leave the saved answers byte-identical;
//   • a RELOAD restores every answer; the shared authority grades the restored answers = full marks; a forged answer is refused;
//   • the teacher review renders the server-derived state and the marks; the production editor authors a question that round-trips
//     through the builder's import → save → export → import;
//   • no WebGL context is ever requested, and the molecule renders when WebGL is unavailable; frame timing while dragging the molecule;
//   • phone (390 × 844, DPR 3, touch): no horizontal page overflow (only the periodic table scrolls inside itself), a TAP measures.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-21dd1"));
const checks = [], perf = {};
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + " " + detail); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", publicDir: false, build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/chemistry-21dd1.html") } } });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port, PAGE = origin + "/browser-harness/chemistry-21dd1.html";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
// counts every WebGL context request (chemistry must never ask for one); `noWebgl` makes WebGL unavailable
const glProbe = noWebgl => `(() => { window.__gl = 0; const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (/webgl/i.test(String(t))) { window.__gl++; if (${noWebgl ? "true" : "false"}) return null; } return orig.call(this, t, ...a); }; })()`;
async function openPage(ctx, query = "", noWebgl = false) {
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  await page.addInitScript(glProbe(noWebgl));
  await page.goto(PAGE + query, { waitUntil: "networkidle" });
  return page;
}
const q = id => "[data-testid=q-" + id + "] ";
const answers = page => page.evaluate(() => JSON.stringify(window.__exam.answers()));
const actionsOf = async (page, id) => JSON.parse(await answers(page))[id]?.actions ?? [];
async function setCounter(page, sel, n) { const i = page.locator(sel + " input[type=number]"); await i.click(); await i.press("Control+a"); await i.type(String(n)); }
async function saveValue(page, id, valueId, v) { const f = page.locator(q(id) + "[data-testid=chem-value][data-id=" + valueId + "]"); await f.locator("input").fill(String(v)); await f.locator("input").press("Enter"); }
async function choose(page, id, label) { await page.locator(q(id) + "label.chem-option", { hasText: label }).first().locator("input").check(); }

try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await openPage(desktop);
  await page.waitForSelector("[data-testid=chem-workspace]");
  const ws = await page.$$eval("[data-testid=chem-workspace]", els => els.map(e => e.getAttribute("data-activity")));
  check("seven chemistry workspaces render (atom ×2, molecule ×2, formula ×2, shared ammonia context)", ws.join() === "atom,atom,molecule,molecule,formula,formula,molecule", ws.join());
  const dom = await page.evaluate(() => document.body.innerHTML);
  check("nothing private reaches the student DOM", !/chem\.particles|chem\.value|"species"|expectedIds|tolerance|setEquals@1/.test(dom));
  const dirs = await page.$eval(q("c1") + "[data-testid=chem-workspace]", w => [getComputedStyle(w).direction, getComputedStyle(w.querySelector("svg.chem-mol-scene")).direction]);
  check("RTL workspace with an LTR molecule scene", dirs.join() === "rtl,ltr", dirs.join());

  // a1 — keyboard-only build of ²³Na⁺, pointer shell buttons, keyboard radios and Enter-to-save
  await setCounter(page, q("a1") + "[data-testid=chem-protons]", 11); await setCounter(page, q("a1") + "[data-testid=chem-neutrons]", 12); await setCounter(page, q("a1") + "[data-testid=chem-electrons]", 10);
  check("a1: counters are drafts (nothing saved yet)", (await actionsOf(page, "a1")).length === 0);
  await page.locator(q("a1") + "[data-testid=chem-save-particles]").focus(); await page.keyboard.press("Enter");
  for (let i = 0; i < 2; i++) await page.click(q("a1") + "[data-testid=chem-shell-0] button[aria-label^='زيادة']");
  for (let i = 0; i < 8; i++) await page.click(q("a1") + "[data-testid=chem-shell-1] button[aria-label^='زيادة']");
  check("a1: the shell diagram follows the draft (2, 8)", (await page.getAttribute(q("a1") + "[data-testid=chem-atom-model]", "data-shells")) === "2,8");
  await page.click(q("a1") + "[data-testid=chem-save-shells]");
  await page.locator(q("a1") + "label.chem-option", { hasText: "أيون موجب" }).locator("input").focus(); await page.keyboard.press("Space");
  await choose(page, "a1", "الفئة s");
  await saveValue(page, "a1", "outer", 8);
  const a1 = await actionsOf(page, "a1");
  check("a1: five explicit decisions = five semantic actions", JSON.stringify(a1) === JSON.stringify([{ type: "particles.set", protons: 11, neutrons: 12, electrons: 10 }, { type: "shells.set", shells: [2, 8, 0, 0] }, { type: "classification.set", taskId: "ionKind", option: "cation" }, { type: "classification.set", taskId: "blockKind", option: "s" }, { type: "value.set", valueId: "outer", value: 8 }]), JSON.stringify(a1));

  // b1 — the periodic table with the keyboard: H ↓ Li ↓ Na → … → Cl, Enter chooses
  await page.locator(q("b1") + "[data-symbol=H]").focus();
  for (const k of ["ArrowDown", "ArrowDown", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight"]) await page.keyboard.press(k);
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-symbol"));
  check("b1: arrow keys walk the table (H → Li → Na → … → Cl)", focused === "Cl", focused);
  check("b1: browsing is never recorded", (await actionsOf(page, "b1")).length === 0);
  await page.keyboard.press("Enter");
  check("b1: Enter chooses the focused element", JSON.stringify(await actionsOf(page, "b1")) === JSON.stringify([{ type: "object.select", objectId: "Cl" }]));
  await setCounter(page, q("b1") + "[data-testid=chem-protons]", 17); await setCounter(page, q("b1") + "[data-testid=chem-neutrons]", 18); await setCounter(page, q("b1") + "[data-testid=chem-electrons]", 17);
  await page.click(q("b1") + "[data-testid=chem-save-particles]");
  for (const [i, n] of [[0, 2], [1, 8], [2, 7]]) await setCounter(page, q("b1") + "[data-testid=chem-shell-" + i + "]", n);
  await page.click(q("b1") + "[data-testid=chem-save-shells]");
  await saveValue(page, "b1", "valence", 7);

  // c1 — the 3D molecule: real drag, wheel, keyboard camera; presentation never answers
  const svg = page.locator(q("c1") + "svg.chem-mol-scene");
  await svg.scrollIntoViewIfNeeded();
  const before = await answers(page), yaw0 = await svg.getAttribute("data-yaw"), b = await svg.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.evaluate(() => { window.__f = []; window.__run = true; const f = ts => { window.__f.push(ts); if (window.__run) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  for (let i = 1; i <= 30; i++) { await page.mouse.move(b.x + b.width / 2 + i * 5, b.y + b.height / 2 + i, { steps: 1 }); await sleep(16); }
  await page.mouse.up();
  const frames = await page.evaluate(() => { window.__run = false; const d = []; for (let i = 1; i < window.__f.length; i++) d.push(window.__f[i] - window.__f[i - 1]); d.sort((x, y) => x - y); return { n: d.length, median: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)] }; });
  perf.dragFrames = frames;
  check("c1: a real pointer drag rotates the molecule", (await svg.getAttribute("data-yaw")) !== yaw0, yaw0 + " → " + (await svg.getAttribute("data-yaw")));
  check("c1: frame timing while dragging (median < 34 ms)", frames.median < 34, JSON.stringify(frames));
  await sleep(700);                                                                                 // let the release inertia settle
  const zoom0 = await svg.getAttribute("data-zoom");
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.keyboard.down("Control"); await page.mouse.wheel(0, -400); await page.keyboard.up("Control"); await sleep(300);
  check("c1: Ctrl + wheel zooms", Number(await svg.getAttribute("data-zoom")) > Number(zoom0), zoom0 + " → " + (await svg.getAttribute("data-zoom")));
  await svg.focus(); await page.keyboard.press("ArrowRight"); await sleep(100);
  await page.keyboard.press("Home"); await sleep(100);
  check("c1: Home resets the camera", (await svg.getAttribute("data-yaw")) === "0.55" && (await svg.getAttribute("data-zoom")) === "1", (await svg.getAttribute("data-yaw")) + " / " + (await svg.getAttribute("data-zoom")));
  await page.click(q("c1") + "[data-testid=chem-mol-measure]");
  for (const id of ["H1", "O1", "H2"]) await page.click(q("c1") + "[data-chem-atom=" + id + "] circle");
  const probe = await page.textContent(q("c1") + "[data-testid=chem-probe]");
  check("c1: the probe measures ∠H–O–H = 104.5° from the CCCBDB geometry", probe === "الزاوية H1–O1–H2 = 104.5°", probe);
  check("c1: rotating, zooming, resetting and measuring never changed an answer", (await answers(page)) === before);
  await page.click(q("c1") + ".chem-modes button:has-text('اختيار')");
  await page.click(q("c1") + "[data-chem-pick=O1]");
  for (const [v, x] of [["angle", 104.5], ["lonePairs", 2], ["molarMass", 18.015]]) await saveValue(page, "c1", v, x);
  await choose(page, "c1", "منحنٍ"); await choose(page, "c1", "قطبي");

  // c2, d1, d2 — formulas with live parsing
  const formulaTask = (id, fid) => page.locator(q(id) + "[data-testid=chem-formula-task][data-id=" + fid + "]");
  await formulaTask("c2", "formula").locator("input").fill("CO2"); await formulaTask("c2", "formula").locator("button", { hasText: "حفظ الصيغة" }).click();
  await saveValue(page, "c2", "molarMass", 44.009); await choose(page, "c2", "خطي"); await choose(page, "c2", "غير قطبي");
  await formulaTask("d1", "empirical").locator("input").fill("ch2o");
  check("d1: an invalid formula shows the parser's message and cannot be saved", (await formulaTask("d1", "empirical").locator("[role=alert]").textContent()).includes("حرف كبير") && await formulaTask("d1", "empirical").locator("button", { hasText: "حفظ الصيغة" }).isDisabled());
  await formulaTask("d1", "empirical").locator("input").fill("CH₂O"); await formulaTask("d1", "empirical").locator("input").press("Enter");
  await saveValue(page, "d1", "molarMass", 180.156); await saveValue(page, "d1", "carbonPercent", 40.0);
  check("d1: the formula is stored in canonical text", JSON.stringify((await actionsOf(page, "d1"))[0]) === JSON.stringify({ type: "formula.set", formulaId: "empirical", text: "CH2O" }));
  await saveValue(page, "d2", "molarMass", 249.677); await saveValue(page, "d2", "copperPercent", 25.45); await saveValue(page, "d2", "oxygenAtoms", 9);
  // shared ammonia context: the probe measures ∠H–N–H, the student records it
  check("ammonia: measure-only model (no selection task) needs no mode switch: a click measures", (await page.$$(q("ctxAmmonia") + "[data-testid=chem-mol-measure]")).length === 0);
  for (const id of ["H1", "N1", "H2"]) await page.click(q("ctxAmmonia") + "[data-chem-atom=" + id + "] circle");
  const nh3 = await page.textContent(q("ctxAmmonia") + "[data-testid=chem-probe]");
  check("ammonia: the probe measures ∠H–N–H = 106.7°", nh3 === "الزاوية H1–N1–H2 = 106.7°", nh3);
  await saveValue(page, "ctxAmmonia", "angleHNH", 106.7); await choose(page, "ctxAmmonia", "هرم ثلاثي");

  const graded = await page.evaluate(() => window.__exam.grade());
  check("the shared authority grades every answer = full marks (41 / 41)", graded.every(g => g.score === g.maxMarks && !g.manualReview), JSON.stringify(graded));
  const saved = await answers(page);
  await page.reload({ waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=chem-workspace]");
  check("a RELOAD restores every saved answer", (await answers(page)) === saved);
  check("restored answers are shown (a1 saved particles)", (await page.textContent(q("a1") + "[data-testid=chem-builder] .chem-saved")).includes("p = 11، n = 12، e = 10"));
  check("restored answers grade identically", JSON.stringify(await page.evaluate(() => window.__exam.grade())) === JSON.stringify(graded));
  check("no WebGL context was requested by the chemistry exam", (await page.evaluate(() => window.__gl)) === 0);
  await page.locator(q("c1")).screenshot({ path: path.join(out, "desktop-water.png") });
  await page.locator(q("b1")).screenshot({ path: path.join(out, "desktop-periodic.png") });
  await page.locator(q("a1")).screenshot({ path: path.join(out, "desktop-sodium-ion.png") });
  const forged = await page.evaluate(() => window.__exam.forge("c2", { kind: "smartSim", pluginKey: "chemistryStructure", pluginVersion: 1, actions: [{ type: "score.set", value: 4 }], state: { score: 4 } }));
  check("a forged answer is refused by the server binding", forged.rejected.includes("c2"), JSON.stringify(forged.rejected));
  // the review reads the same tab's saved answers (sessionStorage is per tab): navigate this tab, as the teacher's review follows the attempt
  const review = page;
  await review.goto(PAGE + "?review=1", { waitUntil: "networkidle" });
  await review.waitForSelector("[data-testid=chem-review]");
  const scores = await review.$$eval("[data-testid=r-score]", els => els.map(e => Number(e.textContent)));
  check("teacher review renders the server-derived state and the marks", scores.join() === "8,8,7,0,6,5,3" && (await review.textContent("[data-testid=r-a1]")).includes("p = 11, n = 12, e = 10"), scores.join());
  await review.close();

  const author = await openPage(desktop, "?author=1");
  await author.waitForSelector("[data-testid=chem-editor]");
  check("editor: the authored water question has no finalization issue", (await author.evaluate(() => window.__author.issues().length)) === 0);
  const exp = await author.$$eval("[data-testid=chem-check-expected]", els => els.map(e => e.textContent));
  check("editor: derived expected values are shown to the teacher (∠HOH 104.478 ± 0.5, M = 18.015)", exp.some(t => t.includes("104.478 ± 0.5")) && exp.some(t => t.includes("18.015")), exp.join(" | "));
  await author.selectOption("[data-testid=chem-preset]", "hydrate");
  check("editor: a preset replaces config + checks and stays valid", (await author.evaluate(() => window.__author.node().smartSim.config.subject.formula)) === "CuSO4·5H2O" && (await author.evaluate(() => window.__author.issues().length)) === 0);
  const rt = await author.evaluate(() => window.__author.roundTrip());
  check("editor: import → save → export → import round trip preserves the question", rt.canOpen && rt.errors.length === 0 && rt.same, JSON.stringify(rt));
  await author.click("[data-testid=chem-preview] summary");
  await author.waitForSelector("[data-testid=chem-preview] [data-testid=chem-workspace]", { timeout: 5000 });
  check("editor: the preview mounts the real student workspace", true);
  await author.close();

  // WebGL unavailable: the molecule is SVG and renders anyway
  const noGl = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ng = await openPage(noGl, "", true);
  await ng.waitForSelector(q("c1") + "[data-chem-atom]");
  check("WebGL unavailable: the 3D molecule still renders (SVG renderer)", (await ng.$$(q("c1") + "[data-chem-atom]")).length === 3);
  await noGl.close();
  await desktop.close();

  // phone: 390 × 844, DPR 3, touch
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pp = await openPage(phone);
  await pp.waitForSelector("[data-testid=chem-workspace]");
  const o = await pp.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, table: (() => { const s = document.querySelector(".chem-ptable-scroll"); return s ? { sw: s.scrollWidth, cw: s.clientWidth } : null; })() }));
  check("phone: no horizontal page overflow; only the periodic table scrolls inside itself", o.sw <= o.iw && o.table && o.table.sw > o.table.cw, JSON.stringify(o));
  await pp.locator(q("c1") + "[data-testid=chem-mol-measure]").tap();
  for (const id of ["H1", "O1"]) await pp.locator(q("c1") + "[data-chem-atom=" + id + "] circle").tap();
  const tapped = await pp.textContent(q("c1") + "[data-testid=chem-probe]");
  check("phone: a TAP on atoms measures (O–H = 95.8 pm)", tapped === "المسافة بين H1 وO1 = 95.8 pm", tapped);
  await pp.screenshot({ path: path.join(out, "phone-exam.png"), fullPage: false });
  const pa = await openPage(phone, "?author=1");
  await pa.waitForSelector("[data-testid=chem-editor]");
  const oa = await pa.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check("phone: the editor has no horizontal overflow", oa.sw <= oa.iw, JSON.stringify(oa));
  await phone.close();
  check("no page errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close(); server.close();
}
const failed = checks.filter(c => !c.ok);
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ checks, perf, errors }, null, 2));
console.log(failed.length ? "FAILED " + failed.length + " / " + checks.length : "ALL " + checks.length + " CHECKS PASSED");
process.exit(failed.length ? 1 : 0);
