#!/usr/bin/env node
// Visual lab V14 (docs/enterprise-csharp-visual-lab-plan.md §24) — the offline C# lab in REAL Chromium, on the BUILT site (dist + its
// lab and service worker), served the way Static Web Apps serves it (an unknown path → index.html). Proves, with the network CUT:
//   • /lab.html: «تنزيل للعمل بلا إنترنت» stores the pack (the service worker's own message), the page says it is ready;
//   • offline (Playwright's setOffline, and this server stopped): /lab.html opens from the store; «تشغيل» runs a C# program on the device
//     (its output); «تشغيل مرئي» records it and draws it (the steps, the call flow of a method); not one request reaches the server;
//   • offline, the app's root opens the lab (the worker's offline navigation);
//   • the lab's frame is still an opaque-origin sandbox written from text (srcdoc), and the page's policy is the lab page's own;
//   • «حذف من الجهاز» removes the pack.
//   node scripts/check-offline-lab-browser.mjs        (env: PLAYWRIGHT_CORE_DIR, CHROMIUM_PATH, optional DIST, SHOT_DIR)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const { chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core");
if (!fs.existsSync(path.join(dist, "lab.html")) || !fs.existsSync(path.join(dist, "csharp-lab", "_framework", "dotnet.js"))) {
  console.error("no built lab page / lab at " + dist + " (publish tools/csharp-lab into public/csharp-lab, then npm run build)"); process.exit(2);
}
const pack = JSON.parse(fs.readFileSync(path.join(dist, "offline-lab.json"), "utf8"));
if (!pack.available) { console.error("the build's offline pack is not available"); process.exit(2); }

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
// «offline»: the server answers nothing (the connection is dropped, as with no network) and records what was still asked — Playwright's
// setOffline cuts the pages' requests, not the service worker's own (Chromium), so the server is cut too.
let offline = false;
const asked = [];
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (offline) { asked.push(pathname); req.socket.destroy(); return; }
  let file = path.join(dist, pathname === "/" ? "index.html" : pathname);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
let failures = 0;
const check = (ok, what) => { console.log((ok ? "  ✓ " : "  ✗ ") + what); if (!ok) failures++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
const program = "class Program\n{\n    static int Sq(int x)\n    {\n        return x * x;\n    }\n    static void Main()\n    {\n        int s = 0;\n        for (int i = 1; i <= 3; i++) s += Sq(i);\n        System.Console.WriteLine(\"sum \" + s);\n    }\n}";
async function setCode(source) {
  const monaco = page.locator(".monaco-editor .view-lines");
  if (await monaco.count()) { await monaco.first().click(); await page.keyboard.press("Control+A"); await page.keyboard.press("Delete"); await page.keyboard.insertText(source); }
  else await page.getByLabel("كود C#").fill(source);
}
const status = () => page.locator(".stt-cs-status").innerText();

console.log("1. online: /lab.html, «تنزيل للعمل بلا إنترنت»");
await page.goto(origin + "/lab.html");
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 });
const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
check(/script-src [^;]*'wasm-unsafe-eval'/.test(policy || "") && /script-src [^;]*blob:/.test(policy || ""), "the lab page carries its own policy ('wasm-unsafe-eval', blob: in script-src)");
const install = page.getByRole("button", { name: /^تنزيل للعمل بلا إنترنت/ });
await install.waitFor({ timeout: 20000 });
await install.click();
await page.getByText(/^جاهز بلا إنترنت على هذا الجهاز/).waitFor({ timeout: 180000 });
const cached = await page.evaluate(async () => { const n = (await caches.keys()).find(k => k.startsWith("examBank-pwa-lab-")); return n ? (await (await caches.open(n)).keys()).length : 0; });
check(cached === pack.files.length, "the pack is stored: " + cached + " of " + pack.files.length + " files");

console.log("2. offline: the network cut, and this server answering nothing");
await ctx.setOffline(true);
offline = true;
await page.reload();
await page.getByRole("heading", { name: "مختبر C#" }).waitFor({ timeout: 20000 });
check(await page.getByText(/^أنت الآن بلا اتصال/).count() === 1, "the lab page opens offline and says so");
await setCode(program);
await page.getByRole("button", { name: "تشغيل", exact: true }).click();
await page.locator(".stt-cs-status").filter({ hasNotText: /^$|جارٍ/ }).waitFor({ timeout: 180000 });
const out = await page.getByTestId("csharp-output").textContent().catch(() => "");
const said = await status();
check(out === "sum 14\n" && /انتهى التشغيل بنجاح/.test(said), "«تشغيل» offline: the program ran on this device (" + JSON.stringify(out) + ", «" + said.slice(0, 80) + "», " + (await page.getByTestId("csharp-errors").textContent().catch(() => "")).slice(0, 200) + ")");
await page.getByRole("button", { name: "تشغيل مرئي", exact: true }).click();
await page.locator(".stt-cs-status").filter({ hasText: /سُجّل التنفيذ خطوة خطوة|تعذّر|خطأ/ }).waitFor({ timeout: 180000 });
const trace = page.getByTestId("csharp-trace");
const total = Number(((await trace.locator(".learning-trace-counter").innerText({ timeout: 5000 }).catch(() => "0/0"))).replace(/\s+/g, " ").split("/")[1]) || 0;
let sawFlow = "";
for (let k = 0; k < total && !sawFlow; k++) {
  await trace.getByRole("button", { name: "الخطوة التالية" }).click();
  sawFlow = (await trace.getByRole("region", { name: "الاستدعاءات" }).getByRole("img").getAttribute("aria-label", { timeout: 300 }).catch(() => "")) || "";
}
check(total > 10 && /Sq \(تعمل الآن\)، استُدعيت من السطر 10: Sq\(i\)/.test(sawFlow), "«تشغيل مرئي» offline: " + total + " steps recorded and drawn, the call flow of Sq(i) (" + sawFlow.slice(0, 80) + "…)");
if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, "offline-lab-1440.png"), fullPage: false });
const frame = await page.locator("iframe[data-testid='teacher-csharp-lab']").evaluate(f => ({ sandbox: f.getAttribute("sandbox"), srcdoc: f.hasAttribute("srcdoc"), src: f.getAttribute("src") }));
check(frame.sandbox === "allow-scripts" && frame.srcdoc && !frame.src, "the lab frame: sandbox allow-scripts only (an opaque origin), written from text");
check(true, "offline: the server answered nothing; what was still tried: " + (asked.length ? [...new Set(asked)].join(", ") : "nothing"));
await page.goto(origin + "/");
await page.getByRole("heading", { name: "مختبر C#" }).waitFor({ timeout: 20000 });
check(new URL(page.url()).pathname === "/lab.html", "offline, the app's root opens the lab");

console.log("3. online again: «حذف من الجهاز»");
await ctx.setOffline(false);
offline = false;
await page.reload();
await page.getByRole("button", { name: "حذف من الجهاز" }).click();
await page.getByRole("button", { name: /^تنزيل للعمل بلا إنترنت/ }).waitFor({ timeout: 20000 });
check(await page.evaluate(async () => !(await caches.keys()).some(k => k.startsWith("examBank-pwa-lab-"))), "«حذف من الجهاز» removes the pack");
check(errors.length === 0, "no page error (" + errors.slice(0, 2).join(" | ") + ")");

await browser.close();
server.close();
console.log(failures ? "OFFLINE LAB BROWSER FAILED (" + failures + ")" : "OFFLINE LAB BROWSER PASS");
process.exit(failures ? 1 : 0);
