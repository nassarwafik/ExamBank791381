#!/usr/bin/env node
// AUTO-A4 (docs/enterprise-automata-lab-a4.md) — «مختبر الآلات» in REAL Chromium: a production-mode build of
// browser-harness/automata-lab.html (the 899271 book's own tool bar), served same-origin. Proves, on a desktop (1280) and a phone (390):
//   • «الأدوات» → «مختبر الآلات» opens the lab (its own chunk), with no page error and nothing fetched from another origin;
//   • the DFA example: «أضف حالة مصيدة» is not needed (complete), many words run, «لغة آلتي» lists the words;
//   • the push-down example: its rows in the course's notation, the run of «aabb» step by step to «الكلمة مقبولة», the stack drawn;
//   • the Turing machine example: its tape drawn;
//   • on the phone the page never scrolls sideways (the tables scroll inside their own frame); the desktop panel fills the screen.
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

await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", build: { outDir: out, emptyOutDir: true, manifest: false, rollupOptions: { input: path.join(root, "browser-harness/automata-lab.html") } } });

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
  await ctx.close();
}
await browser.close();
server.close();
fs.rmSync(out, { recursive: true, force: true });
console.log(failures ? "AUTOMATA LAB BROWSER FAILED (" + failures + ")" : "AUTOMATA LAB BROWSER PASS");
process.exit(failures ? 1 : 0);
