#!/usr/bin/env node
// AUTO-A4 (docs/enterprise-automata-lab-a4.md) — «مختبر الآلات» in REAL Chromium: a production-mode build of
// browser-harness/automata-lab.html (the 899271 book's own tool bar), served same-origin. Proves, on a desktop (1280) and a phone (390):
//   • «الأدوات» → «مختبر الآلات» opens the lab (its own chunk), with no page error and nothing fetched from another origin;
//   • the DFA example: «أضف حالة مصيدة» is not needed (complete), many words run, «لغة آلتي» lists the words;
//   • the push-down example: its rows in the course's notation, the run of «aabb» step by step to «الكلمة مقبولة», the stack drawn;
//   • the Turing machine example: its tape drawn;
//   • on the phone the page never scrolls sideways (the tables scroll inside their own frame); the desktop panel fills the screen;
//   • AUTO-A7 — browser-harness/automata-design.html, a book «صمّم الآلة» exercise beside the book's tool bar: on the desktop the lab's
//     drawing editor in the activity (real double-clicks and an arrow drag; the exercise's 3-state limit holds), «فحص سريع لآلتك», and
//     «افتح في مختبر الآلات» opening the tool bar's lab with a copy; on the phone the table only, and the same hand-over;
//   • AUTO-A8 — browser-harness/automaton-question.html, the exam question «تصميم أوتومات»: the student's renderer (desktop: real
//     double-clicks within the question's 3-state limit and an arrow drag; the saved answer is the machine only) and the teacher's editor
//     (the reference built with the table is written to the private key); on the phone the table only and no sideways scroll.
//   node scripts/check-automata-lab-browser.mjs     (env: PLAYWRIGHT_CORE_DIR, CHROMIUM_PATH, optional HARNESS_OUT)
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(os.tmpdir(), "harness-automata-lab"));
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core");

await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", build: { outDir: out, emptyOutDir: true, manifest: false, rollupOptions: { input: { lab: path.join(root, "browser-harness/automata-lab.html"), design: path.join(root, "browser-harness/automata-design.html"), question: path.join(root, "browser-harness/automaton-question.html"), machineQuestion: path.join(root, "browser-harness/machine-question.html"), machineTrace: path.join(root, "browser-harness/machine-trace.html") } } } });

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/favicon.ico") { res.writeHead(204); res.end(); return; }   // the browser's own request (as check-code-editor-browser.mjs)
  const file = path.join(out, p);
  if (!file.startsWith(out) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ✓ " : "  ✗ ") + what); if (!ok) failures++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
// the phone is a real phone: a touch screen, a coarse pointer (so no drawing editor), not a narrow desktop window with a mouse
for (const [name, viewport, touch] of [["desktop", { width: 1280, height: 900 }, false], ["phone", { width: 390, height: 844 }, true]]) {
  console.log(name + " " + viewport.width + "×" + viewport.height);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const errors = [], foreign = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", r => { if (!r.url().startsWith(origin)) foreign.push(r.url()); });
  page.on("response", r => { if (r.status() >= 400) errors.push(r.status() + " " + new URL(r.url()).pathname); });
  await page.goto(origin + "/browser-harness/automata-lab.html");
  await page.getByTestId("student-tools-button").click();
  await page.getByRole("button", { name: "مختبر الآلات" }).click();
  const lab = page.getByTestId("tool-automataLab");
  await lab.waitFor({ timeout: 20000 });
  check(true, "«مختبر الآلات» opens from the book's tool bar");
  const section = re => lab.locator("section").filter({ has: page.getByRole("heading", { name: re }) });
  const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // the DFA example
  await lab.getByRole("button", { name: /^افتح مثالًا: عدد a زوجي/ }).click();
  check(/✓ الأوتومات كامل/.test(await section(/الفحوص/).innerText()), "the DFA example is complete (the course's check)");
  await lab.getByLabel(/^الكلمات/).fill("ε a aa ab bab");
  await lab.getByRole("button", { name: "شغّل الكل" }).click();
  const rows = await section(/كلمات كثيرة/).locator("tbody tr").allInnerTexts();
  check(rows.map(r => r.replace(/\s+/g, " ").trim()).join(" | ") === "ε ✓ تُقبل | a ✗ تُرفض | aa ✓ تُقبل | ab ✗ تُرفض | bab ✗ تُرفض", "many words at once: " + rows.length + " results");
  await lab.getByRole("button", { name: "اعرض الكلمات التي تقبلها" }).click();
  check(/تقبل الآلة 16 كلمات من 31 حتى الطول 4/.test(await section(/لغة آلتي/).innerText()), "«لغة آلتي»: 16 of the 31 words up to length 4");
  if (name === "phone") check(await sideways() <= 1, "phone: the page never scrolls sideways (" + (await sideways()) + " px)");

  // A6b: «ارسم بالفأرة» on a desktop — real mouse drags on the drawing (a phone has the table only)
  if (name === "desktop") {
    const canvas = lab.getByTestId("alab-canvas");
    const center = async q => { await canvas.scrollIntoViewIfNeeded(); const b = await canvas.locator("g.learning-automaton-state").filter({ hasText: new RegExp("^" + q + "$") }).locator("circle").first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.width / 2 }; };
    const dragFrom = async (from, to, opts = {}) => {
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      for (let k = 1; k <= 8; k++) await page.mouse.move(from.x + (to.x - from.x) * k / 8, from.y + (to.y - from.y) * k / 8);
      await page.mouse.up(); if (opts.shift) await page.keyboard.up("Shift");
    };
    const q0 = await center("q0"), q1 = await center("q1");
    const cellX = q1.x - q0.x;                                                        // one grid column, on screen
    await dragFrom(q1, { x: q1.x, y: q1.y + cellX * 0.8 });                           // down about one row
    const q1b = await center("q1");
    check(q1b.y > q1.y + 20 && Math.abs(q1b.x - q1.x) < 3, "drag: q1 moved down a grid row (snapped), its arrows redrawn");
    await page.mouse.dblclick(q1b.x + cellX, q0.y);                                  // an empty spot to the right
    await lab.getByText(/^أُضيفت الحالة q2\.$/).waitFor({ timeout: 5000 });
    check(true, "double-click on an empty spot: a new state q2 there");
    await lab.getByRole("radio", { name: "رسم الأسهم" }).check();
    await dragFrom(await center("q2"), await center("q0"));
    await lab.getByRole("group", { name: "رمز السهم من q2 إلى q0" }).getByRole("button", { name: "a", exact: true }).click();
    check(await lab.getByLabel("من q2 بالرمز a إلى").inputValue() === "q0", "«رسم الأسهم»: a drag from q2 to q0, symbol a, is the table's arrow (q2, a) → q0");
    await lab.getByRole("radio", { name: "تحريك الحالات" }).check();
    // positions relative to q1, which does not move: the drawing's edge follows the start arrow, so the whole picture can shift on screen
    const before0 = await center("q0"), before2 = await center("q2"), before1 = await center("q1");
    await dragFrom(before2, before0);                                               // q2 dropped onto q0: they swap
    const after0 = await center("q0"), after2 = await center("q2"), after1 = await center("q1");
    const rel = (p, o) => ({ x: Math.round(p.x - o.x), y: Math.round(p.y - o.y) });
    const same = (a, b) => Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3;
    check(same(rel(after2, after1), rel(before0, before1)) && same(rel(after0, after1), rel(before2, before1)) && await lab.getByText("تبادلت q2 وq0 مكانيهما.").count() === 1,
      "drop onto another state: the two swap places (" + JSON.stringify({ q2: rel(after2, after1), wasQ0: rel(before0, before1) }) + ")");
    if (process.env.SHOT_DIR) await canvas.screenshot({ path: path.join(process.env.SHOT_DIR, "automata-lab-canvas.png") });
    check(sideways !== undefined && (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1, "no sideways page scroll with the drawing editor");
  } else check(await lab.getByTestId("alab-canvas").count() === 0, "phone: no drawing editor (the table is the phone's way)");

  // A5: «حوّل إلى حتمي» step by step, then the result opened in the editor (the NFA kept as A)
  await lab.getByRole("radio", { name: "أوتومات منتهٍ غير حتمي" }).check();
  await lab.getByRole("button", { name: /^افتح مثالًا: تنتهي بـ ab/ }).click();
  const algos = section(/الخوارزميات خطوة خطوة/);
  await algos.getByRole("button", { name: "حوّل إلى حتمي" }).click();
  await algos.getByRole("button", { name: "أظهر كل الخطوات" }).click();
  check(/أوتومات حتمي من 3 حالات/.test(await algos.innerText()), "«حوّل إلى حتمي»: the working row by row, a DFA of 3 states");
  await algos.getByRole("button", { name: "افتح الناتج في المحرر" }).click();
  check(await lab.getByRole("radio", { name: "أوتومات منتهٍ حتمي" }).isChecked(), "the result opens in the editor as a DFA (the NFA kept in «آلاتي»)");
  await algos.getByRole("button", { name: "هل آلتاي متكافئتان؟" }).click();
  check(/الآلتان متكافئتان/.test(await algos.innerText()), "the DFA and the kept NFA are equivalent");
  if (name === "phone") check(await sideways() <= 1, "phone: no sideways scroll with the working table (" + (await sideways()) + " px)");

  // A6: «أدوات الكلمات» (unit 1) and «حفظ صورة» above the drawing
  const words = section(/أدوات الكلمات/);
  await words.getByLabel(/^الكلمة w/).fill("01102");
  await words.getByRole("button", { name: "حلّل الكلمة" }).click();
  check(/البادئات \(6\)/.test(await words.innerText()) && /اللواحق \(6\)/.test(await words.innerText()), "«أدوات الكلمات»: w = 01102 has 6 prefixes and 6 suffixes (ε and w included, as the book)");
  check(await section(/الرسم والتشغيل/).getByTestId("save-drawing").count() === 1, "«حفظ صورة» above the lab's drawing");

  // the push-down example, step by step
  await lab.getByRole("radio", { name: "أوتومات مكدّس" }).check();
  await lab.getByRole("button", { name: /^افتح مثالًا: aⁿbⁿ/ }).click();
  check(await lab.getByRole("region", { name: "انتقالات أوتومات المكدّس" }).getByText("ادفع a,⏊/S", { exact: true }).count() === 1, "the push-down rows in the course's notation («ادفع a,⏊/S»)");
  const player = section(/الرسم والتشغيل/);
  await player.getByLabel("الكلمة", { exact: true }).fill("aabb");
  await player.getByRole("button", { name: "شغّل", exact: true }).click();
  await player.getByRole("button", { name: "الخطوة التالية" }).click();
  await player.getByRole("button", { name: "الخطوة التالية" }).click();
  const stack = await player.getByRole("region", { name: /^المكدّس من القمة/ }).count() || await player.locator(".learning-automaton-stack").count();
  check(stack === 1, "the stack is drawn beside the machine");
  await player.getByRole("button", { name: "النهاية" }).click();
  check(await player.getByText(/الكلمة مقبولة/).count() === 1, "«aabb» step by step ends «الكلمة مقبولة»");
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, "automata-lab-pda-" + name + ".png"), fullPage: false });
  if (name === "phone") check(await sideways() <= 1, "phone: still no sideways scroll with the rows table (" + (await sideways()) + " px)");

  // the Turing machine example: the tape
  await lab.getByRole("radio", { name: "آلة تورنغ" }).check();
  await lab.getByRole("button", { name: /^افتح مثالًا: كلمات من a طولها زوجي/ }).click();
  await player.getByLabel("الكلمة", { exact: true }).fill("aa");
  await player.getByRole("button", { name: "شغّل", exact: true }).click();
  check(await player.locator(".learning-automaton-tape").count() === 1, "the Turing machine's tape is drawn");

  if (name === "desktop") {
    await page.getByTestId("tool-fullscreen").click();
    const box = await page.getByTestId("tool-panel-automataLab").boundingBox();
    check(!!box && box.width >= 1270 && box.height >= 890, "«ملء الشاشة»: the lab fills the screen (" + (box ? Math.round(box.width) + "×" + Math.round(box.height) : "none") + ")");
    if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, "automata-lab-fullscreen.png"), fullPage: false });
  }
  check(errors.length === 0, "no page or console error (" + errors.slice(0, 2).join(" | ") + ")");
  check(foreign.length === 0, "nothing fetched from another origin (" + foreign.slice(0, 2).join(" | ") + ")");

  // AUTO-A7 — a book «صمّم الآلة» exercise with the lab
  console.log(name + ": «صمّم الآلة» with the lab");
  errors.length = 0;
  await page.goto(origin + "/browser-harness/automata-design.html");
  const act = page.locator(".learning-autodesign").first();   // the A7 exercise (the page also holds the A10 one)
  await act.waitFor({ timeout: 20000 });
  const cellOf = (from, symbol) => act.getByLabel("من " + from + " بالرمز " + symbol + " إلى", { exact: true });
  const quickText = () => act.getByTestId("autodesign-quick").innerText();
  if (name === "desktop") {
    const canvas = act.getByTestId("alab-canvas");
    check(await canvas.count() === 1 && await act.getByRole("region", { name: "جدول الانتقالات" }).count() === 1, "desktop: the lab's drawing editor in the activity, the table kept");
    const centre = () => canvas.evaluate(el => el.scrollIntoView({ block: "center" }));   // the whole drawing in the window: clicks land on it
    await centre();
    const center = async q => { const b = await canvas.locator("g.learning-automaton-state").filter({ hasText: new RegExp("^" + q + "$") }).locator("circle").first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.width / 2 }; };
    const q0 = await center("q0");
    const box = await canvas.boundingBox();
    await page.mouse.dblclick(box.x + box.width - 12, q0.y);                         // the free cell to the right
    await act.getByText(/^أُضيفت الحالة q1\.$/).waitFor({ timeout: 5000 });
    check(true, "double-click on an empty spot: q1");
    await centre();
    const q0b = await center("q0"), b1 = await canvas.boundingBox();
    await page.mouse.dblclick(q0b.x, b1.y + b1.height - 12);                          // below q0
    await act.getByText(/^أُضيفت الحالة q2\.$/).waitFor({ timeout: 5000 });
    await centre();
    const b2 = await canvas.boundingBox();
    await page.mouse.dblclick(b2.x + b2.width - 12, b2.y + b2.height - 12);
    await act.getByText(/^بلغت الحد: 3 حالة\.$/).waitFor({ timeout: 5000 });
    check(await act.locator(".learning-autodesign-staterow").count() === 3, "the exercise's limit holds in the drawing: a fourth state is refused («بلغت الحد: 3»)");
    await act.getByRole("radio", { name: "رسم الأسهم" }).check();
    await centre();
    const from = await center("q0"), to = await center("q1");
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(from.x + (to.x - from.x) * k / 8, from.y + (to.y - from.y) * k / 8);
    await page.mouse.up();
    await act.getByRole("group", { name: "رمز السهم من q0 إلى q1" }).getByRole("button", { name: "1", exact: true }).click();
    check(await cellOf("q0", "1").inputValue() === "q1", "an arrow drawn from q0 to q1 with 1 is the table's (q0, 1) → q1");
    const q = await quickText();
    check(/لا يصل مسار من البداية إلى q2/.test(q) && /ينقص أسهم/.test(q) && /لا مكان لحالة أخرى: الحد 3/.test(q), "«فحص سريع لآلتك»: q2 unreachable, missing arrows, no room for a trap state");
    if (process.env.SHOT_DIR) await act.screenshot({ path: path.join(process.env.SHOT_DIR, "automata-design-desktop.png") });
  } else {
    check(await act.getByTestId("alab-canvas").count() === 0, "phone: no drawing editor in the activity (the table)");
    await act.getByRole("button", { name: /إضافة حالة/ }).click();
    await act.getByLabel("قبول").nth(1).check();
    await cellOf("q0", "1").selectOption("q1");
    check(/ينقص أسهم/.test(await quickText()), "«فحص سريع لآلتك» on the phone");
    check(await sideways() <= 1, "phone: no sideways scroll in the exercise (" + (await sideways()) + " px)");
  }
  await act.getByRole("button", { name: "افتح في مختبر الآلات" }).click();
  const panel = page.getByTestId("tool-panel-automataLab");
  await panel.getByTestId("alab-from-activity").waitFor({ timeout: 20000 });
  check(await panel.isVisible() && await panel.getByLabel("من q0 بالرمز 1 إلى", { exact: true }).inputValue() === "q1", "«افتح في مختبر الآلات»: the book's tool bar opens its lab with a copy of the machine, and says it is a copy");
  await panel.getByLabel("من q0 بالرمز 1 إلى", { exact: true }).selectOption("q0");
  check(await cellOf("q0", "1").inputValue() === "q1", "an edit in the lab does not change the exercise");
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, "automata-design-lab-" + name + ".png"), fullPage: false });
  check(errors.length === 0, "no page or console error (" + errors.slice(0, 2).join(" | ") + ")");
  check(foreign.length === 0, "nothing fetched from another origin (" + foreign.slice(0, 2).join(" | ") + ")");

  // AUTO-A10 — a push-down «صمّم الآلة» exercise on the same page: built with the lab's row editor, run step by step
  {
    await page.goto(origin + "/browser-harness/automata-design.html");          // afresh: no tool panel open over the page
    const md = page.getByTestId("machine-design");
    await md.scrollIntoViewIfNeeded();
    await md.getByRole("button", { name: /إضافة حالة/ }).click();
    await md.getByRole("button", { name: /إضافة حالة/ }).click();
    await md.getByLabel("قبول").first().check();
    await md.getByLabel("قبول").nth(2).check();
    await md.getByRole("button", { name: "إضافة انتقال" }).click();
    await md.getByLabel("الانتقال 1: يُكتب").fill("SA");
    await md.getByLabel("الانتقال 1: إلى").selectOption("q1");
    await md.getByRole("button", { name: "إضافة انتقال" }).click();
    await md.getByLabel("الانتقال 2: من").selectOption("q1");
    await md.getByLabel("الانتقال 2: يقرأ").selectOption("b");
    await md.getByLabel("الانتقال 2: القمة").fill("A");
    await md.getByLabel("الانتقال 2: العملية").selectOption("pop");
    await md.getByLabel("الانتقال 2: يُكتب").fill("A");
    await md.getByLabel("الانتقال 2: إلى").selectOption("q2");
    await md.getByRole("button", { name: "إضافة انتقال" }).click();
    await md.getByLabel("الانتقال 3: من").selectOption("q2");
    await md.getByLabel("الانتقال 3: يقرأ").selectOption("b");
    await md.getByLabel("الانتقال 3: القمة").fill("S");
    await md.getByLabel("الانتقال 3: العملية").selectOption("pop");
    await md.getByLabel("الانتقال 3: يُكتب").fill("S");
    await md.getByLabel("الانتقال 3: إلى").selectOption("q2");
    const run = md.locator("section").filter({ has: page.getByRole("heading", { name: /شغّل آلتك خطوة خطوة/ }) });
    await run.getByLabel("الكلمة", { exact: true }).fill("abb");
    await run.getByRole("button", { name: "شغّل", exact: true }).click();
    await run.getByRole("button", { name: "النهاية" }).click();
    check(await run.getByText(/الكلمة مقبولة/).count() === 1 && await run.locator(".learning-automaton-stack").count() + await run.getByRole("region", { name: /^المكدّس/ }).count() > 0,
      name + ": a push-down «صمّم الآلة» — built with the lab's rows, «abb» runs step by step to «الكلمة مقبولة», the stack drawn");
    check((await md.getByTestId("alab-canvas").count()) === (name === "desktop" ? 1 : 0), name + ": the drawing editor " + (name === "desktop" ? "on the desktop" : "not on the phone"));
    check(/يُفحص تصميمك عند فتح المادة من المنصة/.test(await md.innerText()), name + ": without a check seam the exercise says the check happens on the platform");
    if (name === "phone") check(await sideways() <= 1, "phone: no sideways scroll with the push-down exercise (" + (await sideways()) + " px)");
  }
  // AUTO-A10b — a Turing machine «صمّم الآلة» that computes: built with the lab's TM rows ($ typed as a tape symbol), run step by step:
  // the tape is drawn and ends with the answer between two $
  {
    const md = page.getByTestId("machine-design-tm");
    await md.scrollIntoViewIfNeeded();
    check(/بين علامتي \$/.test(await md.innerText()) && /111 → \$11111\$/.test(await md.innerText()), name + ": the Turing machine task says the answer goes between two $, with its example");
    await md.getByRole("button", { name: /إضافة حالة/ }).click();
    await md.getByRole("button", { name: /إضافة حالة/ }).click();
    await md.getByLabel("قبول").nth(2).check();
    await md.getByRole("button", { name: "إضافة انتقال" }).click();      // q0 —1/$,R→ q1
    await md.getByLabel("الانتقال 1: يكتب").fill("$");
    await md.getByLabel("الانتقال 1: إلى").selectOption("q1");
    await md.getByRole("button", { name: "إضافة انتقال" }).click();      // q1 —∆/$,S→ q2
    await md.getByLabel("الانتقال 2: من").selectOption("q1");
    await md.getByLabel("الانتقال 2: يقرأ").fill("∆");
    await md.getByLabel("الانتقال 2: يكتب").fill("$");
    await md.getByLabel("الانتقال 2: الحركة").selectOption("S");
    await md.getByLabel("الانتقال 2: إلى").selectOption("q2");
    check(await md.getByTestId("machine-design-issues").count() === 0, name + ": the two Turing-machine rows read (no issue listed)");
    const run = md.locator("section").filter({ has: page.getByRole("heading", { name: /شغّل آلتك خطوة خطوة/ }) });
    await run.getByLabel("الكلمة", { exact: true }).fill("1");
    await run.getByRole("button", { name: "شغّل", exact: true }).click();
    await run.getByRole("button", { name: "النهاية" }).click();
    const tape = await run.locator(".learning-automaton-tape").getAttribute("aria-label");
    check(await run.getByText(/الكلمة 1 مقبولة/).count() === 1 && /\$ \$/.test(tape || ""), name + ": «1» runs to the accepting state and the tape ends «$ $» (" + tape + ")");
    if (name === "phone") check(await sideways() <= 1, "phone: no sideways scroll with the Turing machine exercise (" + (await sideways()) + " px)");
  }

  // AUTO-A8 — the exam question «تصميم أوتومات»
  console.log(name + ": the exam question «تصميم أوتومات»");
  errors.length = 0;
  await page.goto(origin + "/browser-harness/automaton-question.html");
  const stu = page.getByTestId("automaton-design-response");
  await stu.waitFor({ timeout: 20000 });
  const savedAnswer = async () => JSON.parse((await page.getByTestId("saved-answer").textContent()) || "null");
  const qcell = (scope, from, symbol) => scope.getByLabel("من " + from + " بالرمز " + symbol + " إلى", { exact: true });
  check(!/تحقّق من الآلة|مختبر الآلات/.test(await stu.innerText()), "the exam's builder has no «تحقّق» and no lab hand-over");
  if (name === "desktop") {
    const canvas = stu.getByTestId("alab-canvas");
    const centre = () => canvas.evaluate(el => el.scrollIntoView({ block: "center" }));
    const center = async q => { const b = await canvas.locator("g.learning-automaton-state").filter({ hasText: new RegExp("^" + q + "$") }).locator("circle").first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    await centre();
    let b = await canvas.boundingBox();
    await page.mouse.dblclick(b.x + b.width - 12, (await center("q0")).y);
    await stu.getByText(/^أُضيفت الحالة q1\.$/).waitFor({ timeout: 5000 });
    await centre(); b = await canvas.boundingBox();
    await page.mouse.dblclick((await center("q0")).x, b.y + b.height - 12);
    await stu.getByText(/^أُضيفت الحالة q2\.$/).waitFor({ timeout: 5000 });
    await centre(); b = await canvas.boundingBox();
    await page.mouse.dblclick(b.x + b.width - 12, b.y + b.height - 12);
    await stu.getByText(/^بلغت الحد: 3 حالة\.$/).waitFor({ timeout: 5000 });
    check(true, "student, desktop: the drawing adds q1, q2 and refuses a fourth state (the question's limit, 3)");
    await stu.getByRole("radio", { name: "رسم الأسهم" }).check();
    await centre();
    const from = await center("q0"), to = await center("q1");
    await page.mouse.move(from.x, from.y); await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(from.x + (to.x - from.x) * k / 8, from.y + (to.y - from.y) * k / 8);
    await page.mouse.up();
    await stu.getByRole("group", { name: "رمز السهم من q0 إلى q1" }).getByRole("button", { name: "1", exact: true }).click();
    const a = await savedAnswer();
    // AUTO-A9 — the answer is the machine and, beside it, where the double-clicked states were put (presentation only)
    check(a && a.kind === "automatonDesign" && JSON.stringify(Object.keys(a).sort()) === '["kind","layout","machine"]' && JSON.stringify(a.machine) === JSON.stringify({ states: ["q0", "q1", "q2"], start: "q0", accept: [], transitions: [["q0", "1", "q1"]] })
      && Array.isArray(a.layout.q1) && Array.isArray(a.layout.q2),
      "student, desktop: the saved answer is the machine, with where q1 and q2 were put (" + JSON.stringify(a) + ")");
  } else {
    check(await stu.getByTestId("alab-canvas").count() === 0, "student, phone: no drawing editor (the table)");
    await stu.getByRole("button", { name: /إضافة حالة/ }).click();
    await qcell(stu, "q0", "1").selectOption("q1");
    const a = await savedAnswer();
    check(a && JSON.stringify(a.machine.transitions) === '[["q0","1","q1"]]', "student, phone: the table's arrow is the saved answer");
    check(await sideways() <= 1, "phone: no sideways scroll in the exam question (" + (await sideways()) + " px)");
  }
  const tea = page.getByTestId("qt-editor-automatonDesign");
  check(/الآلة النموذجية \(مفتاح التصحيح\) مفقودة/.test(await tea.innerText()), "teacher: a new question blocks until the reference is built");
  const ref = page.getByTestId("automaton-reference");
  await ref.getByRole("button", { name: /إضافة حالة/ }).click();
  await ref.getByLabel("قبول").nth(1).check();
  for (const [f, s, t] of [["q0", "a", "q1"], ["q0", "b", "q0"], ["q1", "a", "q1"], ["q1", "b", "q0"]]) await qcell(ref, f, s).selectOption(t);
  const saved = JSON.parse(await page.getByTestId("saved-question").textContent());
  check(JSON.stringify(saved.answer.reference) === JSON.stringify({ states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [["q0", "a", "q1"], ["q0", "b", "q0"], ["q1", "a", "q1"], ["q1", "b", "q0"]] })
    && await page.getByTestId("automaton-question-issues").count() === 0, "teacher: the reference built with the table is the private key; the question is complete");
  // AUTO-A8b — the teacher's review (both machines drawn, the stored word) and the student's released breakdown
  const rv = page.getByTestId("automaton-design-review");
  await rv.scrollIntoViewIfNeeded();
  const drawnStates = async id => (await page.getByTestId(id).locator("g.learning-automaton-state text").allTextContents()).join(",");
  check(await drawnStates("automaton-review-student") === "p0,p1" && await drawnStates("automaton-review-reference") === "q0,q1,q2"
    && /الكلمة\s*b\s*يجب أن تُرفض، لكن آلة الطالب تقبلها/.test(await page.getByTestId("automaton-review-word").innerText()), "review: both machines drawn and the separating word in words");
  await page.getByTestId("result-breakdown").locator("summary").click();
  check(/الكلمة\s*b\s*كان يجب أن تُرفض، لكن آلتك تقبلها/.test(await page.getByTestId("breakdown-automaton").innerText()), "the student's released breakdown: one line with the word");
  if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, "automaton-question-" + name + ".png"), fullPage: true });
  if (name === "phone") check(await sideways() <= 1, "phone: no sideways scroll with the teacher's editor (" + (await sideways()) + " px)");
  // AUTO-A11a — the exam question «تصميم آلة»: a Turing machine that computes, built with the lab's rows ($ typed as a tape symbol); the
  // saved answer is the machine as written (never a verdict); the teacher switches the question to a computing Turing machine and builds
  // the private reference — the question is then complete
  {
    console.log(name + ": the exam question «تصميم آلة»");
    await page.goto(origin + "/browser-harness/machine-question.html");
    const mq = page.getByTestId("machine-design-response");
    await mq.waitFor({ timeout: 20000 });
    const saved = async () => JSON.parse((await page.getByTestId("saved-answer").textContent()) || "null");
    check(!/تحقّق من الآلة|مختبر الآلات/.test(await mq.innerText()) && /111 → \$11111\$/.test(await mq.innerText()), name + ": the exam's machine builder has no «تحقّق»; the task shows its example");
    await mq.getByRole("button", { name: /إضافة حالة/ }).click();
    await mq.getByRole("button", { name: /إضافة حالة/ }).click();
    await mq.getByLabel("قبول").nth(2).check();
    await mq.getByRole("button", { name: "إضافة انتقال" }).click();
    await mq.getByLabel("الانتقال 1: يكتب").fill("$");
    await mq.getByLabel("الانتقال 1: إلى").selectOption("q1");
    await mq.getByRole("button", { name: "إضافة انتقال" }).click();
    await mq.getByLabel("الانتقال 2: من").selectOption("q1");
    await mq.getByLabel("الانتقال 2: يقرأ").fill("∆");
    await mq.getByLabel("الانتقال 2: يكتب").fill("$");
    await mq.getByLabel("الانتقال 2: الحركة").selectOption("S");
    await mq.getByLabel("الانتقال 2: إلى").selectOption("q2");
    const a = await saved();
    check(a && a.kind === "machineDesign" && Object.keys(a).every(k => ["kind", "machine", "layout"].includes(k)) && JSON.stringify(a.machine.transitions) === JSON.stringify([{ from: "q0", read: "1", write: "$", move: "R", to: "q1" }, { from: "q1", read: "∆", write: "$", move: "S", to: "q2" }]) && JSON.stringify(a.machine.accept) === "[\"q2\"]",
      name + ": the saved answer is the machine as written — the two rows, the accepting state, nothing else");
    if (name === "desktop") {
      // AUTO-A12 — on the drawing: move q1 one cell down; the saved answer is the SAME machine with where q1 was put
      const canvas = mq.getByTestId("alab-canvas");
      await canvas.scrollIntoViewIfNeeded();
      await mq.getByLabel("الحالة", { exact: true }).selectOption("q1");
      await mq.getByRole("group", { name: "انقل q1 خانة" }).getByRole("button", { name: "أسفل" }).click();
      const moved = await saved();
      check(JSON.stringify(moved.machine) === JSON.stringify(a.machine) && Array.isArray(moved.layout && moved.layout.q1),
        name + ": moving q1 on the drawing saves the same machine with where q1 was put (" + JSON.stringify(moved.layout) + ")");
    }
    const run = mq.locator("section").filter({ has: page.getByRole("heading", { name: /شغّل آلتك خطوة خطوة/ }) });
    await run.getByLabel("الكلمة", { exact: true }).fill("1");
    await run.getByRole("button", { name: "شغّل", exact: true }).click();
    await run.getByRole("button", { name: "النهاية" }).click();
    check(await run.getByText(/الكلمة 1 مقبولة/).count() === 1, name + ": the student runs the own machine step by step («1» accepted) — never against the reference");
    check((await mq.getByTestId("alab-canvas").count()) === (name === "desktop" ? 1 : 0), name + ": the drawing editor " + (name === "desktop" ? "on the desktop" : "not on the phone"));
    const ed = page.getByTestId("qt-editor-machineDesign");
    await ed.getByRole("radio", { name: /آلة تورنغ/ }).check();
    await ed.getByRole("radio", { name: /تحسب دالة/ }).check();
    await ed.getByLabel(/^الأبجدية \(رموز/).fill("1");
    const ref = ed.getByTestId("machine-reference");
    await ref.getByRole("button", { name: "إضافة انتقال" }).click();
    await ref.getByLabel("الانتقال 1: يكتب").fill("$");
    await ref.getByLabel("الانتقال 1: الحركة").selectOption("S");
    await ref.getByLabel("قبول").first().check();
    const sq = JSON.parse((await page.getByTestId("saved-question").textContent()) || "{}");
    check(sq.machineDesign && sq.machineDesign.machine === "TM" && sq.machineDesign.mode === "compute" && sq.machineDesign.leftEnd === true && JSON.stringify(sq.machineDesign.alphabet) === "[\"1\"]"
      && sq.answer && sq.answer.reference && sq.answer.reference.transitions.length === 1 && await page.getByTestId("machine-question-issues").count() === 0,
      name + ": teacher: a computing Turing machine on the book's tape (├); the reference built with the rows is the private key; the question is complete (" + JSON.stringify(sq).slice(0, 160) + ")");
    // AUTO-A11b — the teacher's review (both Turing machines drawn, the stored verdict in words) and the student's released breakdown
    const mrv = page.getByTestId("machine-design-review");
    await mrv.scrollIntoViewIfNeeded();
    const drawn = async id => (await page.getByTestId(id).locator("g.learning-automaton-state text").allTextContents()).join(",");
    check(await drawn("machine-review-student") === "p0,p1" && await drawn("machine-review-reference") === "q0,q1,q2"
      && /على المدخل ε \(الكلمة الفارغة\) الجواب الصحيح «ε»، وآلة الطالب تعطي لا جواب بين علامتي \$/.test(await page.getByTestId("machine-review-verdict").innerText()), name + ": review: both Turing machines drawn and the function's expected / given answers in words");
    await page.getByTestId("result-breakdown").locator("summary").click();
    const lines = await page.getByTestId("breakdown-machine").allInnerTexts();
    check(lines.length === 2 && /على المدخل\s*1\s*الجواب الصحيح\s*«111»، وآلتك تعطي\s*«11»/.test(lines[0]) && /حتى الطول 8 \(511 كلمة\). هذا فحص وليس برهانًا/.test(lines[1]), name + ": the student's released breakdown: one line per machine question («" + lines.join(" | ").slice(0, 120) + "»)");
    if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, "machine-question-" + name + ".png"), fullPage: true });
    if (name === "phone") check(await sideways() <= 1, "phone: no sideways scroll with the machine question (" + (await sideways()) + " px)");
  }
  // AUTO-A15a — the exam question «تتبّع تشغيل آلة»: the student sees the machine as a TABLE (no player, no run button), writes the run with
  // the symbol buttons (├ ∆ never typed) and the head chosen from the cells, and the verdict; the saved answer is the rows as written. The
  // teacher writes a push-down automaton in the book's notation and sees the true run; the key stays empty
  {
    console.log(name + ": the exam question «تتبّع تشغيل آلة»");
    await page.goto(origin + "/browser-harness/machine-trace.html");
    const tr = page.getByTestId("machine-trace-response");
    await tr.waitFor({ timeout: 20000 });
    const saved = async () => JSON.parse((await page.getByTestId("saved-answer").textContent()) || "null");
    check(/آلة تورنغ — الانتقالات/.test(await tr.getByTestId("machine-trace-machine").innerText()) && await tr.locator("svg, canvas").count() === 0
      && await tr.getByRole("button", { name: /شغّل/ }).count() === 0, name + ": the machine is a table — no drawing to run, no «شغّل»");
    const rowN = k => tr.getByTestId("machine-trace-row").nth(k);
    const fillRow = async (k, state, cells, head) => {
      await rowN(k).getByLabel("الحالة").selectOption(state);
      const tape = rowN(k).getByRole("textbox");
      await tape.fill("");
      for (const c of cells) await rowN(k).getByRole("button", { name: "أضف " + c, exact: true }).click();
      await rowN(k).getByLabel("موضع الرأس").selectOption(String(head));
    };
    await fillRow(0, "q0", ["├", "a", "b"], 1);
    await tr.getByRole("button", { name: /أضف خطوة/ }).click();
    await fillRow(1, "q0", ["├", "A", "b"], 2);
    await tr.getByRole("button", { name: /أضف خطوة/ }).click();
    await rowN(2).getByLabel("الحالة").selectOption("q1");
    await tr.getByLabel("الكلمة مقبولة").check();
    const a = await saved();
    check(a && JSON.stringify(a) === JSON.stringify({ kind: "machineTrace", rows: [{ state: "q0", tape: "├[a]b" }, { state: "q0", tape: "├A[b]" }, { state: "q1", tape: "├A[b]" }], verdict: "accept" }),
      name + ": the saved answer is the three rows as written (├ and the head by buttons) and the verdict — " + JSON.stringify(a));
    if (name === "phone") check(await sideways() <= 1, "phone: no sideways scroll with the trace question (" + (await sideways()) + " px)");
    const ed = page.getByTestId("qt-editor-machineTrace");
    await ed.getByRole("radio", { name: "أوتومات مكدّس" }).check();
    await ed.getByLabel(/^حالات القبول/).fill("q1");
    await ed.getByLabel(/^الانتقالات، سطر لكل انتقال/).fill("q0 → q0 : ادفع a,⏊/A\nq0 → q0 : ادفع a,A/A\nq0 → q1 : اسحب b,A/A\nq1 → q1 : اسحب b,A/A");
    await ed.getByLabel(/^الكلمة التي يتتبّعها الطالب/).fill("aabb");
    check(await ed.getByRole("radio", { name: "أوتومات مكدّس" }).isChecked() && !(await ed.getByRole("radio", { name: "أوتومات منتهٍ غير حتمي" }).isChecked()), name + ": the kind's radio shows «أوتومات مكدّس» chosen (one radio group)");
    const run = await ed.getByTestId("machine-trace-true-run").locator("li").allInnerTexts();
    const sq = JSON.parse((await page.getByTestId("saved-question").textContent()) || "{}");
    check(JSON.stringify(run.map(t => t.replace(/\s+/g, " "))) === JSON.stringify(["q0 ⏊", "q0 ⏊A", "q0 ⏊AA", "q1 ⏊A", "q1 ⏊"]) && sq.machineTrace.machine.kind === "PDA" && sq.machineTrace.word === "aabb"
      && JSON.stringify(sq.answer) === "{}" && await page.getByTestId("machine-trace-issues").count() === 0,
      name + ": teacher: a push-down automaton in the book's notation; the true run shown (" + run.join(" | ") + "); the key stays empty; the question is complete");
    if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, "machine-trace-" + name + ".png"), fullPage: true });
    if (name === "phone") check(await sideways() <= 1, "phone: no sideways scroll with the trace editor (" + (await sideways()) + " px)");
  }
  check(errors.length === 0, "no page or console error (" + errors.slice(0, 2).join(" | ") + ")");
  check(foreign.length === 0, "nothing fetched from another origin (" + foreign.slice(0, 2).join(" | ") + ")");
  await ctx.close();
}
await browser.close();
server.close();
fs.rmSync(out, { recursive: true, force: true });
console.log(failures ? "AUTOMATA LAB BROWSER FAILED (" + failures + ")" : "AUTOMATA LAB BROWSER PASS");
process.exit(failures ? 1 : 0);
