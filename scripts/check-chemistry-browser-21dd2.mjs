#!/usr/bin/env node
// Phase 21D-D.2 — real-Chromium certification of the ARABIC ACCEPTANCE EXAM for chemistryReactions@1 (browser-harness/chemistry-21dd2.*).
// The seven standalone simulations and the shared methane context render on ONE exam page with the production workspace, from the STUDENT
// projection; every answer change is bound by the shared server authority and autosaved. Checks:
//   • the exam page: eight workspaces, nothing private in the DOM, RTL page with LTR equation islands;
//   • balancing with the KEYBOARD (typing, ↑ / ↓, Tab from coefficient to coefficient, Space on radios) and with the POINTER (step buttons,
//     term chips, checkboxes); the live conservation table and its status (charge row for the ionic equation; hidden in exam mode);
//   • the particle picture follows the coefficients; the 3D view of catalog molecules (real drag) never answers;
//   • invalid coefficients are refused in place and never sent; a forged answer is refused by the server binding;
//   • a RELOAD restores every answer; the shared authority grades the restored answers = full marks; the teacher review renders the server
//     state; the production editor authors a question that round-trips through the builder's import → save → export → import;
//   • no WebGL context is requested unless a student opens a 3D view; responsiveness of a coefficient change;
//   • phone (390 × 844, DPR 3, touch): no horizontal page overflow, the equation wraps inside the viewport, TAPS step and select.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-21dd2"));
const checks = [], perf = {};
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + " " + detail); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", publicDir: false, build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/chemistry-21dd2.html") } } });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port, PAGE = origin + "/browser-harness/chemistry-21dd2.html";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
const coef = (id, term) => q(id) + "[data-testid=rxn-coef-" + term + "] input";
async function typeCoef(page, id, term, v) { const i = page.locator(coef(id, term)); await i.click(); await i.press("Control+a"); await i.type(String(v)); }
const status = (page, id) => page.textContent(q(id) + "[data-testid=rxn-status]");
const CO = (termId, value) => ({ type: "coefficient.set", termId, value });

try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await openPage(desktop);
  await page.waitForSelector("[data-testid=rxn-workspace]");
  const n = await page.$$eval("[data-testid=rxn-workspace]", els => els.length);
  check("eight reaction workspaces render (seven questions + the shared methane context)", n === 8, String(n));
  const dom = await page.evaluate(() => document.body.innerHTML);
  check("nothing private reaches the student DOM", !/rxn\.balanced|rxn\.lowest|rxn\.selection|"checks"|"weight"/.test(dom));
  const dirs = await page.$eval(q("a1") + "[data-testid=rxn-workspace]", w => [getComputedStyle(w).direction, getComputedStyle(w.querySelector("[data-testid=rxn-equation]")).direction]);
  check("RTL workspace with an LTR equation island", dirs.join() === "rtl,ltr", dirs.join());
  check("a1: the equation starts with empty coefficients and an incomplete status", (await page.inputValue(coef("a1", "r1"))) === "" && (await status(page, "a1")).includes("أكمل كل المعاملات"));

  // a1 — keyboard only: type, ↑ / ↓, Tab to the next coefficient, Space on a radio
  await page.locator(coef("a1", "r1")).focus();
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowDown");
  check("a1: ↑ / ↓ step the coefficient (1 → 2 → 3 → 2)", (await page.inputValue(coef("a1", "r1"))) === "2");
  await page.keyboard.press("Tab");
  const next = await page.evaluate(() => document.activeElement?.closest("[data-testid]")?.getAttribute("data-testid"));
  check("a1: Tab moves from coefficient to coefficient (step buttons are pointer-only)", next === "rxn-coef-r2", String(next));
  await page.keyboard.type("1"); await page.keyboard.press("Tab"); await page.keyboard.type("1");
  check("a1: an unbalanced equation is explained live (H and O not conserved)", (await status(page, "a1")) === "المعادلة غير موزونة: H، O غير محفوظ.", await status(page, "a1"));
  const oRow = await page.$$eval(q("a1") + "tr[data-element=O] td", tds => tds.map(t => t.textContent));
  check("a1: the conservation row for O shows 2 / 1 / +1 / not conserved", oRow.join("|") === "2|1|+1|✗ غير محفوظ", oRow.join("|"));
  await page.keyboard.press("ArrowUp");
  check("a1: balanced 2H₂ + O₂ → 2H₂O is announced", (await status(page, "a1")) === "المعادلة موزونة: كل عنصر محفوظ.");
  await page.locator(q("a1") + "label.chem-option", { hasText: "اتحاد" }).locator("input").focus(); await page.keyboard.press("Space");
  const a1 = await actionsOf(page, "a1");
  check("a1: four decisions = four semantic actions (one per coefficient + the family)", JSON.stringify(a1) === JSON.stringify([CO("r1", 2), CO("r2", 1), CO("p1", 2), { type: "reaction.classify", taskId: "family", families: ["synthesis"] }]), JSON.stringify(a1));
  const groups = await page.$$eval(q("a1") + "[data-testid=rxn-particles-term]", els => els.map(e => e.getAttribute("data-count") + ":" + e.querySelectorAll(".rxn-particle").length));
  check("a1: the particle picture draws 2 H₂, 1 O₂, 2 H₂O particles", groups.join() === "2:2,1:1,2:2", groups.join());
  // invalid text is refused in place and never sent
  const before = await answers(page);
  await typeCoef(page, "a1", "r2", "0");
  check("a1: a zero coefficient is refused in place (alert) and never sent", (await page.textContent(q("a1") + "[data-testid=rxn-coef-r2] [role=alert]")).includes("من 1 إلى 999") && (await answers(page)) === before);
  await typeCoef(page, "a1", "r2", "1");

  // a2 — pointer: step buttons; the given coefficient is shown and cannot be edited; term chips
  check("a2: the given (locked) Fe₂O₃ coefficient is shown and has no input", (await page.$$(q("a2") + "[data-testid=rxn-coef-p1] input")).length === 0 && (await page.textContent(q("a2") + "[data-testid=rxn-coef-p1]")).startsWith("2"));
  for (let i = 0; i < 4; i++) await page.click(q("a2") + "[data-testid=rxn-coef-r1] button[aria-label^='زيادة']");
  for (let i = 0; i < 3; i++) await page.click(q("a2") + "[data-testid=rxn-coef-r2] button[aria-label^='زيادة']");
  check("a2: step buttons build 4Fe + 3O₂ → 2Fe₂O₃ (balanced)", (await status(page, "a2")) === "المعادلة موزونة: كل عنصر محفوظ.", await status(page, "a2"));
  await page.locator(q("a2") + "label.chem-option", { hasText: "اتحاد" }).locator("input").check();
  await page.click(q("a2") + "[data-testid=rxn-selection] [data-pick=r1]");
  check("a2: a term chip is pressed after selection", (await page.getAttribute(q("a2") + "[data-testid=rxn-selection] [data-pick=r1]", "aria-pressed")) === "true");

  // a3 — the teacher's own equation
  await typeCoef(page, "a3", "r1", 4); await typeCoef(page, "a3", "r2", 3); await typeCoef(page, "a3", "p1", 2);
  for (const t of ["r1", "r2"]) await page.click(q("a3") + "[data-testid=rxn-selection] [data-pick=" + t + "]");

  // b1 — ionic equation: atoms can balance while the charge does not
  for (const [t, v] of [["r1", 5], ["r3", 14], ["p1", 5], ["p2", 2], ["p3", 7]]) await typeCoef(page, "b1", t, v);
  const chargeRow = await page.$$eval(q("b1") + "tr[data-element=charge] td", tds => tds.map(t => t.textContent));
  check("b1: atoms balanced but the CHARGE row shows +22 / +21 (not conserved)", chargeRow.join("|") === "+22|+21|+1|✗ غير محفوظة" && (await status(page, "b1")) === "المعادلة غير موزونة: الشحنة غير محفوظ.", chargeRow.join("|"));
  await typeCoef(page, "b1", "r1", 6); await typeCoef(page, "b1", "p1", 6);
  check("b1: 6Fe²⁺ + Cr₂O₇²⁻ + 14H⁺ → 6Fe³⁺ + 2Cr³⁺ + 7H₂O conserves atoms AND charge", (await status(page, "b1")) === "المعادلة موزونة: كل عنصر محفوظ والشحنة محفوظة.", await status(page, "b1"));
  await page.click(q("b1") + "[data-testid=rxn-selection][data-id=oxidizer] [data-pick=r2]");
  await page.click(q("b1") + "[data-testid=rxn-selection][data-id=reducer] [data-pick=r1]");

  // c1 — exam mode (no live table), multiple choice
  check("c1: exam mode hides the live conservation table", (await page.$$(q("c1") + "[data-testid=rxn-conservation]")).length === 0);
  for (const t of ["r1", "p1", "p2"]) await typeCoef(page, "c1", t, 1);
  await page.locator(q("c1") + "label.chem-option", { hasText: "تفكك" }).locator("input").check();
  // c2, c3
  for (const [t, v] of [["r1", 1], ["r2", 1], ["p1", 1], ["p2", 2]]) await typeCoef(page, "c2", t, v);
  for (const label of ["ترسيب", "إحلال مزدوج"]) await page.locator(q("c2") + "label.chem-option", { hasText: label }).locator("input").check();
  check("c2: two checkbox choices = ONE canonical classification action", JSON.stringify((await actionsOf(page, "c2")).filter(a => a.type === "reaction.classify")) === JSON.stringify([{ type: "reaction.classify", taskId: "families", families: ["doubleDisplacement", "precipitation"] }]));
  await page.click(q("c2") + "[data-testid=rxn-selection] [data-pick=p1]");
  for (const [t, v] of [["r1", 1], ["r2", 2], ["p1", 1], ["p2", 2]]) await typeCoef(page, "c3", t, v);
  await page.locator(q("c3") + "label.chem-option", { hasText: "تعادل" }).locator("input").check();
  await page.click(q("c3") + "[data-testid=rxn-selection][data-id=acid] [data-pick=r2]");
  await page.click(q("c3") + "[data-testid=rxn-selection][data-id=base] [data-pick=r1]");

  // shared methane context: responsiveness of a coefficient change, then the 3D viewer (presentation only)
  const t0 = Date.now();
  for (let k = 1; k <= 20; k++) await page.fill(coef("ctxMethane", "r2"), String((k % 9) + 1));
  perf.coefficientChangeMs = Math.round((Date.now() - t0) / 20);
  check("ctx: a coefficient change (bind + autosave + replay + table + particles) completes quickly (< 120 ms each)", perf.coefficientChangeMs < 120, perf.coefficientChangeMs + " ms");
  for (const [t, v] of [["r1", 1], ["r2", 2], ["p1", 1], ["p2", 2]]) await typeCoef(page, "ctxMethane", t, v);
  await page.locator(q("ctxMethane") + "label.chem-option", { hasText: "احتراق" }).locator("input").check();
  await page.click(q("ctxMethane") + "[data-testid=rxn-selection] [data-pick=r1]");
  const saved0 = await answers(page);
  check("no WebGL context before any 3D view is opened", (await page.evaluate(() => window.__gl)) === 0);
  await page.click(q("ctxMethane") + "[data-testid=rxn-3d-methane]");
  const svg = page.locator(q("ctxMethane") + "svg.chem-mol-scene");
  await svg.scrollIntoViewIfNeeded();
  const yaw0 = await svg.getAttribute("data-yaw"), b = await svg.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(b.x + b.width / 2 + i * 6, b.y + b.height / 2, { steps: 1 }); await sleep(16); }
  await page.mouse.up();
  check("ctx: the D.1 3D viewer opens for CH₄ and a real drag rotates it", (await page.getAttribute(q("ctxMethane") + "[data-testid=chem-molecule]", "data-molecule")) === "methane" && (await svg.getAttribute("data-yaw")) !== yaw0);
  check("ctx: opening and rotating the 3D view never changed an answer; still no WebGL (SVG renderer)", (await answers(page)) === saved0 && (await page.evaluate(() => window.__gl)) === 0);

  const graded = await page.evaluate(() => window.__exam.grade());
  const total = graded.reduce((s, g) => s + g.score, 0), max = graded.reduce((s, g) => s + g.maxMarks, 0);
  check("the shared authority grades every answer = full marks (" + max + " / " + max + ")", graded.every(g => g.score === g.maxMarks && !g.manualReview), JSON.stringify(graded));
  const saved = await answers(page);
  await page.reload({ waitUntil: "networkidle" }); await page.waitForSelector("[data-testid=rxn-workspace]");
  check("a RELOAD restores every saved answer", (await answers(page)) === saved);
  check("restored coefficients are shown (b1 Fe²⁺ = 6)", (await page.inputValue(coef("b1", "r1"))) === "6" && (await status(page, "b1")).includes("موزونة: كل عنصر"));
  check("restored answers grade identically", JSON.stringify(await page.evaluate(() => window.__exam.grade())) === JSON.stringify(graded), String(total));
  await page.locator(q("a1")).screenshot({ path: path.join(out, "desktop-water.png") });
  await page.locator(q("b1")).screenshot({ path: path.join(out, "desktop-dichromate.png") });
  await page.locator(q("c2")).screenshot({ path: path.join(out, "desktop-precipitation.png") });
  const forged = await page.evaluate(() => window.__exam.forge("a2", { kind: "smartSim", pluginKey: "chemistryReactions", pluginVersion: 1, actions: [{ type: "coefficient.set", termId: "p1", value: 9 }], state: { coefficients: { r1: 4, r2: 3 } } }));
  check("a forged answer (a GIVEN coefficient overwritten) is refused by the server binding", forged.rejected.includes("a2"), JSON.stringify(forged.rejected));
  await page.goto(PAGE + "?review=1", { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid=rxn-review]");
  const scores = await page.$$eval("[data-testid=r-score]", els => els.map(e => Number(e.textContent)));
  const reviewEq = await page.textContent("[data-testid=r-b1] [data-testid=rxn-review-equation]");
  check("teacher review renders the server-derived equations and the marks", scores.join() === "4,0,5,7,3,4,6,5" && reviewEq === "6Fe²⁺ + 1Cr₂O₇²⁻ + 14H⁺ → 6Fe³⁺ + 2Cr³⁺ + 7H₂O", scores.join() + " | " + reviewEq);

  const author = await openPage(desktop, "?author=1");
  await author.waitForSelector("[data-testid=rxn-editor]");
  check("editor: the authored water question has no finalization issue", (await author.evaluate(() => window.__author.issues().length)) === 0);
  check("editor: the teacher sees the solver's balanced equation", (await author.textContent("[data-testid=rxn-teacher-balanced]")) === "2H₂(g) + O₂(g) → 2H₂O(l)");
  await author.selectOption("[data-testid=rxn-template]", "dichromate");
  check("editor: a template replaces config + checks and stays valid", (await author.evaluate(() => window.__author.node().smartSim.config.reaction.catalog)) === "dichromateIron" && (await author.evaluate(() => window.__author.issues().length)) === 0);
  const exp = await author.$$eval("[data-testid=rxn-check-expected]", els => els.map(e => e.textContent));
  check("editor: derived expected answers are shown to the teacher", exp.some(t => t.includes("Cr₂O₇²⁻")) && exp.some(t => t.includes("الشحنة الكلية")), exp.join(" | "));
  await author.click("[data-testid=rxn-source-custom]");
  const f = author.locator("[data-testid=rxn-custom-reactants] input").first();
  await f.fill("Al");
  await author.locator("[data-testid=rxn-custom-reactants]").locator("..").locator("..").locator("button", { hasText: "+ مادة" }).click();
  await author.locator("[data-testid=rxn-custom-reactants] input").nth(1).fill("O2");
  await author.locator("[data-testid=rxn-custom-products] input").first().fill("Al₂O₃");
  check("editor: a typed equation is balanced by the exact solver (4Al + 3O₂ → 2Al₂O₃)", (await author.textContent("[data-testid=rxn-teacher-balanced]")) === "4Al + 3O₂ → 2Al₂O₃", await author.textContent("[data-testid=rxn-reaction-info]"));
  await author.selectOption("[data-testid=rxn-template]", "water");
  const rt = await author.evaluate(() => window.__author.roundTrip());
  check("editor: import → save → export → import round trip preserves the question", rt.canOpen && rt.errors.length === 0 && rt.same, JSON.stringify(rt));
  await author.click("[data-testid=rxn-preview] summary");
  await author.waitForSelector("[data-testid=rxn-preview] [data-testid=rxn-workspace]", { timeout: 5000 });
  check("editor: the preview mounts the real student workspace", true);
  await author.close();
  await desktop.close();

  // phone: 390 × 844, DPR 3, touch
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pp = await openPage(phone);
  await pp.waitForSelector("[data-testid=rxn-workspace]");
  const o = await pp.evaluate(() => ({ dw: 390, sw: document.documentElement.scrollWidth, iw: window.innerWidth, eq: [...document.querySelectorAll("[data-testid=rxn-equation]")].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 0.5; }) }));
  check("phone: no horizontal page overflow at the device width (390 px); every equation wraps inside the viewport", o.sw <= 390 && o.iw <= 390 && o.eq, JSON.stringify(o));
  for (let i = 0; i < 2; i++) await pp.locator(q("a1") + "[data-testid=rxn-coef-r1] button[aria-label^='زيادة']").tap();
  check("phone: TAPS on the step button set the coefficient (2)", (await pp.inputValue(coef("a1", "r1"))) === "2");
  await pp.locator(q("a2") + "[data-testid=rxn-selection] [data-pick=r1]").tap();
  check("phone: a TAP selects a term", (await pp.getAttribute(q("a2") + "[data-testid=rxn-selection] [data-pick=r1]", "aria-pressed")) === "true");
  await pp.locator(q("b1")).scrollIntoViewIfNeeded();
  await pp.screenshot({ path: path.join(out, "phone-exam.png"), fullPage: false });
  const pa = await openPage(phone, "?author=1");
  await pa.waitForSelector("[data-testid=rxn-editor]");
  // compare with the DEVICE width: a mobile browser widens its layout viewport (innerWidth) to fit overflowing content
  const oa = await pa.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, wide: [...document.querySelectorAll("[data-testid=rxn-editor] *")].filter(e => e.getBoundingClientRect().right > 390.5).slice(0, 5).map(e => e.tagName + "." + e.className) }));
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
