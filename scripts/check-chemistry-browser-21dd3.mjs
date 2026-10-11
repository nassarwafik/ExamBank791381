#!/usr/bin/env node
// Phase 21D-D.3 — real-Chromium certification of the ARABIC 100-MARK ACCEPTANCE EXAM for chemistryLab@1 (browser-harness/chemistry-21dd3.*).
// The seven standalone laboratory questions and the shared limewater titration context render on ONE exam page with the production workspace,
// from the STUDENT projection; every answer change is bound by the shared server authority and autosaved. Checks:
//   • the exam page: eight lab workspaces, nothing private in the DOM, an RTL page with LTR formula / number islands, no WebGL ever;
//   • Lab A with the KEYBOARD only (Enter / Space on buttons, typing, Enter to weigh and to save); with the POINTER (pipette, flask, make up),
//     the flask label and the c–V curve where the teacher enabled them;
//   • Lab B: meter readings appear only after measuring; categorical indicator colours; the pH scale marks the measured solutions;
//   • Lab C: burette steps, typed volumes, a single drop past the end point changes the colour, recorded readings build the curve;
//   • Lab D: trial runs; the time cursor (keyboard) changes readings but never an answer; one curve per run;
//   • accessible names for every control, a visible keyboard focus ring, an announced status line;
//   • responsiveness of a burette drop (bind + autosave + replay + render);
//   • a RELOAD restores every answer; the shared authority grades the restored answers = full marks; a forged answer is refused; the
//     teacher review renders the server state; the production editor authors a question that round-trips import → save → export → import;
//   • phone (390 × 844, DPR 3, touch): no horizontal page overflow (also with 150 % text), TAPS operate the bench; dark scheme renders.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-21dd3"));
const checks = [], perf = {};
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + " " + detail); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", publicDir: false, build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/chemistry-21dd3.html") } } });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port, PAGE = origin + "/browser-harness/chemistry-21dd3.html";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [];
const glProbe = `(() => { window.__gl = 0; const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (/webgl/i.test(String(t))) window.__gl++; return orig.call(this, t, ...a); }; })()`;
async function openPage(ctx, query = "") {
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  await page.addInitScript(glProbe);
  await page.goto(PAGE + query, { waitUntil: "networkidle" });
  return page;
}
const q = id => "[data-testid=q-" + id + "] ";
const answers = page => page.evaluate(() => JSON.stringify(window.__exam.answers()));
const actionsOf = async (page, id) => JSON.parse(await answers(page))[id]?.actions ?? [];
const btn = (page, id, text) => page.locator(q(id) + "button", { hasText: text });
const task = (page, id, kind, taskId) => page.locator(q(id) + "[data-testid=clab-" + kind + "][data-id=" + taskId + "]");
async function saveNumber(page, id, taskId, value, unit) {
  const t = task(page, id, "number", taskId);
  if (unit) await t.locator("select").selectOption(unit);
  await t.locator("input").fill(value);
  await t.locator("button", { hasText: "حفظ الإجابة" }).click();
}
const choose = (page, id, taskId, label) => task(page, id, "choice", taskId).locator("label.chem-option", { hasText: label }).locator("input").check();
const text = (page, sel) => page.textContent(sel);

try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await openPage(desktop);
  await page.waitForSelector("[data-testid=clab-workspace]");
  const n = await page.$$eval("[data-testid=clab-workspace]", els => els.length);
  check("eight lab workspaces render (seven questions + the shared limewater context)", n === 8, String(n));
  const dom = await page.evaluate(() => document.body.innerHTML);
  check("nothing private reaches the student DOM (checks, weights, derived answers, the unknown's concentration)", !/lab\.number|lab\.choice|lab\.prepared|lab\.observed|"checks"|"weight"|0\.0093|correctOptionIndex/.test(dom));
  const dirs = await page.$eval(q("c1") + "[data-testid=clab-workspace]", w => [getComputedStyle(w).direction, getComputedStyle(w.querySelector("[data-testid=clab-equation]")).direction, getComputedStyle(w.querySelector("[data-testid=clab-burette-reading]")).direction]);
  check("RTL workspace with LTR formula and number islands", dirs.join() === "rtl,ltr,ltr", dirs.join());

  // a1 — keyboard only
  await btn(page, "a1", /^250 mL$/).focus(); await page.keyboard.press("Enter");
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle + " " + getComputedStyle(document.activeElement).outlineWidth);
  check("a1: a keyboard-focused bench button shows a visible focus ring", /^solid 3px$/.test(ring), ring);
  await page.locator(q("a1") + "[data-testid=clab-mass]").focus(); await page.keyboard.type("١٫٤٦"); await page.keyboard.press("Enter");
  await page.locator(q("a1") + "[data-testid=clab-makeup]").focus(); await page.keyboard.press("Space");
  await page.locator(q("a1") + "[data-testid=clab-record]").focus(); await page.keyboard.press("Enter");
  const conc = task(page, "a1", "number", "conc").locator("input");
  await conc.focus(); await page.keyboard.type("0.0999"); await page.keyboard.press("Enter");
  const moles = task(page, "a1", "number", "moles").locator("input");
  await moles.focus(); await page.keyboard.type("25.0"); await page.keyboard.press("Enter");
  const a1 = await actionsOf(page, "a1");
  check("a1: keyboard-only bench work and answers = semantic actions (Arabic digits normalized)", JSON.stringify(a1) === JSON.stringify([
    { type: "solution.flask", volume: 250 }, { type: "solution.mass", mass: "1.46" }, { type: "solution.makeUp" }, { type: "lab.record" },
    { type: "answer.number", taskId: "conc", value: "0.0999", unit: "mol/L" }, { type: "answer.number", taskId: "moles", value: "25.0", unit: "mmol" }]), JSON.stringify(a1));
  check("a1: the status line announces the last operation", (await text(page, q("a1") + "[data-testid=clab-status]")).includes("حُفظت الإجابة"));
  check("a1: no concentration readout where the teacher disabled it", (await page.$$(q("a1") + "[data-testid=clab-label-readout]")).length === 0);

  // a2 — pointer
  await btn(page, "a2", "ماصّة 10 mL").click(); await btn(page, "a2", /^100 mL$/).click(); await page.click(q("a2") + "[data-testid=clab-makeup]");
  check("a2: the flask label shows c = 0.0500 mol/L after making up (readouts on)", (await text(page, q("a2") + "[data-testid=clab-label-readout]")).includes("c = 0.0500 mol/L"));
  check("a2: the c–V curve renders with its marker at the flask", (await page.$$(q("a2") + "[data-testid=clab-plot-dilution] [data-testid=dyn-marker]")).length === 1);
  const tint = await page.$eval(q("a2") + ".clab-flask .clab-liquid", e => getComputedStyle(e).fill);
  check("a2: the CuSO₄ solution is drawn blue (illustrative) and labelled as such", /rgb\(\d+, \d+, (2\d\d|1[5-9]\d)\)/.test(tint) && (await text(page, q("a2") + ".clab-flask + figcaption, " + q("a2") + "figcaption")).includes("توضيحي"), tint);
  await choose(page, "a2", "conserved", "كمية المادة المذابة");
  await saveNumber(page, "a2", "moles", "0.00500");

  // b1 — meter readings appear only after measuring
  check("b1: no reading before measuring", (await page.$$(q("b1") + "[data-testid=clab-meter-reading]")).length === 0);
  for (let i = 0; i < 4; i++) await btn(page, "b1", "قِس pH بالجهاز").first().click();
  const readings = await page.$$eval(q("b1") + "[data-testid=clab-meter-reading]", els => els.map(e => e.textContent.replace(/.*pH = /, "")));
  check("b1: meter readings 2.00 / 3.38 / 7.00 / 11.00 (strong vs weak acid at 0.010 mol/L)", readings.join() === "2.00,3.38,7.00,11.00", readings.join());
  check("b1: the pH scale marks the four measured solutions", (await page.$$(q("b1") + ".clab-scale .clab-ph-mark")).length === 4);
  await saveNumber(page, "b1", "phA", "2.00"); await saveNumber(page, "b1", "phB", "3.38");
  await choose(page, "b1", "classD", "قاعدي"); await choose(page, "b1", "lowest", "المحلول A");

  // b2 — indicators only
  check("b2: no pH meter in this experiment", (await btn(page, "b2", "قِس pH").count()) === 0);
  for (const id of ["X", "Y", "Z"]) await page.locator(q("b2") + "[data-testid=clab-solution][data-id=" + id + "] button", { hasText: "أضف أزرق البروموثيمول" }).click();
  const colours = await page.$$eval(q("b2") + "[data-testid=clab-indicator-result] strong", els => els.map(e => e.textContent));
  check("b2: bromothymol blue is blue in NH₃, yellow in HNO₃, transitional in pure water", colours.join("|") === "أزرق|أصفر|بين أصفر وأزرق", colours.join("|"));
  await choose(page, "b2", "ppX", "لون الوسط القاعدي"); await choose(page, "b2", "btbY", "لون الوسط الحمضي"); await saveNumber(page, "b2", "phY", "3.00");

  // c1 — titration with the pH meter
  for (let i = 0; i < 4; i++) await btn(page, "c1", "+ 5.00 mL").click();
  const typed = page.locator(q("c1") + "[data-testid=clab-add-volume]");
  await typed.fill("0.33"); await typed.press("Enter");
  check("c1: a volume that is not a whole number of drops is refused in place", (await text(page, q("c1") + "[role=alert]")).includes("مضاعفات القطرة") && (await text(page, q("c1") + "[data-testid=clab-burette-reading]")) === "20.00 mL");
  await typed.fill("4.50"); await typed.press("Enter");
  check("c1: burette reading 24.50 mL and pH 3.00 just before equivalence", (await text(page, q("c1") + "[data-testid=clab-burette-reading]")) === "24.50 mL" && (await text(page, q("c1") + "[data-testid=clab-flask-ph]")) === "pH = 3.00");
  await page.click(q("c1") + "[data-testid=clab-record]"); await btn(page, "c1", "+ 1.00 mL").click(); await page.click(q("c1") + "[data-testid=clab-record]");
  const order = await page.$eval(q("c1") + "[data-testid=clab-record-row] td:nth-child(3)", td => {
    const range = document.createRange(), node = td.firstChild, at = (i) => { range.setStart(node, i); range.setEnd(node, i + 1); return range.getBoundingClientRect().left; };
    const t = node.textContent, n = t.indexOf("2"), m = t.indexOf("m"); return at(n) < at(m) ? "number-then-unit" : "unit-then-number";
  });
  check("c1: the record table shows \"24.50 mL\" in reading order (no bidi reordering)", order === "number-then-unit", order);
  check("c1: pH 11.00 just after equivalence; the curve shows the two recorded readings", (await text(page, q("c1") + "[data-testid=clab-flask-ph]")) === "pH = 11.00" && (await page.$$(q("c1") + "[data-testid=clab-plot-titration] .xp-dyn-event")).length === 2);
  await saveNumber(page, "c1", "veq", "25.00"); await saveNumber(page, "c1", "nOH", "2.50");
  await task(page, "c1", "choice", "eqph").locator("label.chem-option", { hasText: "يساوي 7" }).locator("input").focus(); await page.keyboard.press("Space");

  // c2 — the unknown acid with phenolphthalein: one drop past equivalence changes the colour
  await page.locator(q("c2") + "[role=radiogroup][aria-label='الكاشف'] label.chem-option", { hasText: "الفينولفثالين" }).locator("input").check();
  await btn(page, "c2", "+ 5.00 mL").click(); await btn(page, "c2", "+ 5.00 mL").click(); await page.click(q("c2") + "[data-testid=clab-record]");
  await btn(page, "c2", "+ 5.00 mL").click(); for (let i = 0; i < 3; i++) await btn(page, "c2", "+ 1.00 mL").click(); await page.click(q("c2") + "[data-testid=clab-record]");
  await btn(page, "c2", "+ 0.50 mL").click(); await btn(page, "c2", "قطرة واحدة").click(); await btn(page, "c2", "قطرة واحدة").click(); await page.click(q("c2") + "[data-testid=clab-record]");
  check("c2: colourless at 18.60 mL (pH 7.00, below phenolphthalein's range)", (await text(page, q("c2") + "[data-testid=clab-flask-colour]")) === "عديم اللون");
  await btn(page, "c2", "قطرة واحدة").click();
  check("c2: ONE more drop (18.65 mL) turns it pink-transitional — the end point", (await text(page, q("c2") + "[data-testid=clab-flask-colour]")) === "بين عديم اللون ووردي" && (await text(page, q("c2") + "[data-testid=clab-burette-reading]")) === "18.65 mL");
  check("c2: no pH meter for the unknown (readouts off)", (await page.$$(q("c2") + "[data-testid=clab-flask-ph]")).length === 0);
  await saveNumber(page, "c2", "reading", "18.65"); await saveNumber(page, "c2", "conc", "0.00930");
  await choose(page, "c2", "suitable", "الفينولفثالين"); await choose(page, "c2", "suitable", "أزرق البروموثيمول");

  // d1 — rate: runs, keyboard time cursor (presentation only)
  for (const id of ["t1", "t2", "t3"]) await page.locator(q("d1") + "[data-testid=clab-trial][data-id=" + id + "] button", { hasText: "شغّل" }).click();
  check("d1: one concentration curve per run trial", (await page.$$(q("d1") + "[data-testid=clab-plot-rate] path[data-series]")).length === 3);
  const before = await answers(page), r0 = await text(page, q("d1") + "[data-testid=clab-trial][data-id=t1] [data-testid=clab-trial-readout]");
  await page.locator(q("d1") + "[data-testid=clab-time]").focus(); for (let i = 0; i < 35; i++) await page.keyboard.press("ArrowRight");
  const r1 = await text(page, q("d1") + "[data-testid=clab-trial][data-id=t1] [data-testid=clab-trial-readout]");
  const dir = await page.$eval(q("d1") + "[data-testid=clab-time]", e => getComputedStyle(e).direction);
  check("d1: the time cursor runs left → right like the graph's time axis; ArrowRight advances time, never an answer", dir === "ltr" && r0 === "0.100 mol/L" && r1 !== r0 && (await answers(page)) === before, dir + " " + r0 + " → " + r1);
  await saveNumber(page, "d1", "half", "347"); await saveNumber(page, "d1", "ratio", "2.7");
  await choose(page, "d1", "fastest", "التجربة 3"); await choose(page, "d1", "cat", "تزداد");

  // the shared context: responsiveness of a drop, then the answers
  const t0 = Date.now();
  for (let k = 0; k < 20; k++) await btn(page, "ctxLimewater", "قطرة واحدة").click();
  perf.dropMs = Math.round((Date.now() - t0) / 20);
  check("ctx: a burette drop (bind + autosave + replay + render) completes quickly (< 120 ms each)", perf.dropMs < 120 && (await text(page, q("ctxLimewater") + "[data-testid=clab-burette-reading]")) === "1.00 mL", perf.dropMs + " ms");
  await saveNumber(page, "ctxLimewater", "veq", "25.00"); await saveNumber(page, "ctxLimewater", "nH", "0.500");
  await choose(page, "ctxLimewater", "suitable", "أزرق البروموثيمول"); await choose(page, "ctxLimewater", "suitable", "الفينولفثالين");

  // accessibility audit of every workspace control
  const a11y = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll("[data-testid=clab-workspace] input, [data-testid=clab-workspace] select, [data-testid=clab-workspace] button, [data-testid=clab-workspace] svg[role=img]")) {
      const name = el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent)
        || (el.id && document.querySelector("label[for='" + el.id + "']")?.textContent) || el.closest("label")?.textContent || (el.tagName === "BUTTON" ? el.textContent : "");
      if (!name || !name.trim()) bad.push(el.tagName + "." + (el.getAttribute("class") || "") + "#" + (el.getAttribute("data-testid") || ""));
    }
    return bad;
  });
  check("every workspace control and drawing has an accessible name", a11y.length === 0, a11y.slice(0, 5).join(", "));
  check("no WebGL context is ever requested (2D SVG lab)", (await page.evaluate(() => window.__gl)) === 0);

  const graded = await page.evaluate(() => window.__exam.grade());
  const max = graded.reduce((s, g) => s + g.maxMarks, 0);
  check("the shared authority grades every answer = full marks (" + max + " / " + max + ")", max === 88 && graded.every(g => g.score === g.maxMarks && !g.manualReview), JSON.stringify(graded));
  const saved = await answers(page);
  await page.reload({ waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=clab-workspace]");
  check("a RELOAD restores every saved answer", (await answers(page)) === saved);
  check("restored bench state is shown (c2 burette 18.65 mL, three recorded readings)", (await text(page, q("c2") + "[data-testid=clab-burette-reading]")) === "18.65 mL" && (await page.$$(q("c2") + "[data-testid=clab-record-row]")).length === 3);
  check("restored answers grade identically", JSON.stringify(await page.evaluate(() => window.__exam.grade())) === JSON.stringify(graded));
  await page.locator(q("a2")).screenshot({ path: path.join(out, "desktop-dilution.png") });
  await page.locator(q("b1")).screenshot({ path: path.join(out, "desktop-ph.png") });
  await page.locator(q("c1")).screenshot({ path: path.join(out, "desktop-titration.png") });
  await page.locator(q("d1")).screenshot({ path: path.join(out, "desktop-rate.png") });
  const forged = await page.evaluate(() => window.__exam.forge("c1", { kind: "smartSim", pluginKey: "chemistryLab", pluginVersion: 1, actions: [{ type: "titration.add", volume: "0.03" }], state: { lab: { kind: "titration", indicator: null, added: "25.00" } } }));
  check("a forged answer (a non-drop volume, a forged bench state) is refused by the server binding", forged.rejected.includes("c1"), JSON.stringify(forged.rejected));
  await page.goto(PAGE + "?review=1", { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid=clab-review]");
  const scores = await page.$$eval("[data-testid=r-score]", els => els.map(e => Number(e.textContent)));
  const bench = (await text(page, "[data-testid=r-c2] [data-testid=clab-review-bench]")).replace(/[\u2066\u2069]/g, "");
  const exp = await page.$$eval("[data-testid=r-c2] [data-testid=r-checks] li", els => els.map(e => e.textContent));
  // c1 shows 0: the forged payload above replaced it and was refused, so the page's server kept no c1 answer
  check("teacher review: server marks, the replayed bench and Arabic expected answers", scores.join() === "12,10,12,8,0,12,12,10" && bench.includes("18.65 mL · الكاشف: الفينولفثالين") && exp.some(t => t.includes("الفينولفثالين، أزرق البروموثيمول")), scores.join() + " | " + bench);

  const author = await openPage(desktop, "?author=1");
  await author.waitForSelector("[data-testid=clab-editor]");
  check("editor: the authored titration question has no finalization issue", (await author.evaluate(() => window.__author.issues().length)) === 0);
  check("editor: the teacher sees the derived equivalence volume and indicator errors", (await author.textContent("[data-testid=clab-derived]")).includes("حجم التكافؤ 25.00 mL"));
  await author.selectOption("[data-testid=clab-template]", "unknownTitration");
  check("editor: a template replaces config + checks and stays valid", (await author.evaluate(() => window.__author.node().smartSim.config.experiment.analyte.equivalence)) === "18.60" && (await author.evaluate(() => window.__author.issues().length)) === 0);
  await author.selectOption("[data-testid=clab-kind]", "rate");
  await author.click("[data-testid=clab-add-number]");
  check("editor: switching to the rate lab and adding a number task stays valid", (await author.evaluate(() => window.__author.node().smartSim.config.tasks.length)) === 6 && (await author.evaluate(() => window.__author.issues().length)) === 0);
  const rt = await author.evaluate(() => window.__author.roundTrip());
  check("editor: import → save → export → import round trip preserves the question", rt.canOpen && rt.errors.length === 0 && rt.same, JSON.stringify(rt));
  await author.click("[data-testid=clab-preview] summary");
  await author.waitForSelector("[data-testid=clab-preview] [data-testid=clab-workspace]", { timeout: 5000 });
  check("editor: the preview mounts the real student workspace", true);
  await author.close();
  await desktop.close();

  const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
  const dp = await openPage(dark);
  await dp.waitForSelector("[data-testid=clab-workspace]");
  await dp.locator(q("b1")).screenshot({ path: path.join(out, "dark-ph.png") });
  check("dark colour scheme renders the lab", (await dp.$$("[data-testid=clab-workspace]")).length === 8);
  await dark.close();

  // phone: 390 × 844, DPR 3, touch
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pp = await openPage(phone);
  await pp.waitForSelector("[data-testid=clab-workspace]");
  const over = () => pp.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, out: [...document.querySelectorAll("[data-testid=clab-workspace] *")].filter(e => e.getBoundingClientRect().right > 390.5 && !e.closest(".clab-table-scroll")).slice(0, 5).map(e => e.tagName + "." + e.getAttribute("class")) }));
  const o = await over();
  check("phone: no horizontal page overflow at the device width (390 px); every bench fits", o.sw <= 390 && o.iw <= 390 && o.out.length === 0, JSON.stringify(o));
  await pp.locator(q("a1") + "button", { hasText: /^250 mL$/ }).tap();
  check("phone: a TAP chooses the flask", (await pp.getAttribute(q("a1") + "button:has-text('250 mL')", "aria-pressed")) === "true");
  await pp.locator(q("c1") + "button", { hasText: "+ 1.00 mL" }).tap();
  check("phone: a TAP delivers titrant (1.00 mL)", (await pp.textContent(q("c1") + "[data-testid=clab-burette-reading]")) === "1.00 mL");
  await pp.locator(q("c1")).scrollIntoViewIfNeeded();
  await pp.screenshot({ path: path.join(out, "phone-titration.png"), fullPage: false });
  await pp.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
  const big = await over();
  check("phone: still no horizontal overflow with 150 % text", big.sw <= 390 && big.out.length === 0, JSON.stringify(big));
  const pa = await openPage(phone, "?author=1");
  await pa.waitForSelector("[data-testid=clab-editor]");
  // compare with the DEVICE width: a mobile browser widens its layout viewport (innerWidth) to fit overflowing content
  const oa = await pa.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, wide: [...document.querySelectorAll("[data-testid=clab-editor] *")].filter(e => e.getBoundingClientRect().right > 390.5).slice(0, 5).map(e => e.tagName + "." + e.className) }));
  check("phone: the editor has no horizontal overflow at the device width (390 px)", oa.sw <= 390 && oa.iw <= 390, JSON.stringify(oa));
  await phone.close();
  check("no page errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close(); server.close();
}
const failed = checks.filter(c => !c.ok);
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ checks, perf, errors }, null, 2));
console.log(failed.length ? "FAILED " + failed.length + " / " + checks.length : "ALL " + checks.length + " CHECKS PASSED");
process.exit(failed.length ? 1 : 0);
