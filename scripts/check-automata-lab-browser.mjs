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
for (const [name, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  console.log(name + " " + viewport.width + "×" + viewport.height);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
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

  // the push-down example, step by step
  await lab.getByRole("radio", { name: "أوتومات مكدّس" }).check();
  await lab.getByRole("button", { name: /^افتح مثالًا: aⁿbⁿ/ }).click();
  check(await section(/الانتقالات/).getByText("ادفع a,⏊/S", { exact: true }).count() === 1, "the push-down rows in the course's notation («ادفع a,⏊/S»)");
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
