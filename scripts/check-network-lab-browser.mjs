#!/usr/bin/env node
// N1 (docs/enterprise-network-lab-tool-design.md) — «مختبر الشبكات» in a REAL Chromium on the production build, inside the book reader
// of 791381 next to the REAL API in process (browser-harness/learning-l8-api.cjs). Certification only. At 1280 and at 390 (touch):
//   • the book's tool bar opens the network lab (its own chunk), with «ملء الشاشة»;
//   • the learner builds a network with the buttons and the cable form (switch + two PCs), sets both addresses through the simulator's
//     Desktop, pings from the Command Prompt: «Reply from», the flow status and the path drawn on the diagram;
//   • a reload restores the network from the browser draft; no page error, no horizontal scroll of the page.
//
// Tools are measuring instruments, not project dependencies: PLAYWRIGHT_CORE_DIR (or the global `playwright`), CHROMIUM_PATH.
// SHOT_DIR (optional) receives screenshots. Exit 1 when a check fails, 2 when a tool or the build is missing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { try { ({ chromium } = require("playwright")); } catch { console.error("playwright unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); } }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }

require(path.join(root, "api/src/lib/observability.js")).setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const CID = "791381";
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {} });
const teacherToken = api.teacherToken();
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };
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

const failures = [];
const check = (ok, what) => { console.log((ok ? "  ✓ " : "  ✗ ") + what); if (!ok) failures.push(what); return ok; };
const shot = async (page, name) => { if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, name + ".png") }); };
const index = JSON.parse(fs.readFileSync(path.join(root, "api/src/data/learning-pages", CID + ".json"), "utf8"));
const firstPage = Object.values(index.modules)[0][0];

for (const [label, viewport, touch] of [["1280", { width: 1280, height: 900 }, false], ["390", { width: 390, height: 844 }, true]]) {
  console.log("viewport " + label);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(t => { sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم"); }, teacherToken);
  const page = await ctx.newPage();
  page.on("pageerror", e => failures.push("page error: " + e.message));
  await page.goto(origin + "/#/learning/" + CID + "/read/" + firstPage);
  await page.reload();
  await page.locator(".learning-reader-page").first().waitFor({ timeout: 20000 });
  await page.getByTestId("student-tools-button").click();
  await page.getByRole("button", { name: "مختبر الشبكات" }).click();
  const lab = page.getByTestId("network-lab");
  await lab.waitFor({ timeout: 20000 });
  check(await page.getByTestId("tool-panel-networkLab").getByTestId("tool-fullscreen").count() === 1, "the panel offers «ملء الشاشة»");
  for (const k of ["+ سويتش", "+ حاسوب", "+ حاسوب"]) await lab.getByRole("button", { name: k, exact: true }).click();
  const sel = name => lab.getByRole("combobox", { name, exact: true });
  for (const [pc, port] of [["pc1", "f0/1"], ["pc2", "f0/2"]]) {
    await sel("من الجهاز").selectOption("sw1"); await sel("منفذ الجهاز الأول").selectOption(port);
    await sel("إلى الجهاز").selectOption(pc); await sel("منفذ الجهاز الثاني").selectOption("eth0");
    await lab.getByRole("button", { name: "صِل", exact: true }).click();
  }
  check(await lab.getByTestId("network-lab-links").locator("li").count() === 2, "two cables connected");
  const openDevice = async name => { await lab.getByTestId("network-lab-devices").getByRole("button", { name }).click(); return lab.getByTestId("network-lab-device"); };
  for (const [name, address] of [[/^PC1/, "192.168.7.1"], [/^PC2/, "192.168.7.2"]]) {
    const panel = await openDevice(name);
    await panel.getByRole("button", { name: /IP Configuration/ }).click();
    const ipc = panel.getByTestId("net2-ipconfig");
    await ipc.getByLabel("IP Address").fill(address);
    await ipc.getByLabel("Subnet Mask").fill("255.255.255.0");
    await ipc.getByRole("button", { name: /حفظ/ }).click();
  }
  const pc1 = await openDevice(/^PC1/);
  await pc1.getByRole("button", { name: /Command Prompt/ }).click();
  const cmd = pc1.getByTestId("net2-cmd");
  await cmd.getByRole("textbox").fill("ping 192.168.7.2");
  await cmd.getByRole("button", { name: "تنفيذ" }).click();
  check(/Reply from 192\.168\.7\.2/.test(await cmd.getByTestId("ncli-screen").textContent()), "ping from PC1 to PC2: Reply from");
  check(/^نجح ping من PC1/.test((await lab.getByTestId("network-lab-flow").textContent()).trim()), "the flow status announces the path");
  check(await lab.locator("[data-testid=network-lab-diagram] svg").count() === 1, "the network is drawn");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, "no horizontal scroll (" + overflow + "px)");
  await shot(page, "netlab-" + label);
  await page.reload();
  await page.locator(".learning-reader-page").first().waitFor({ timeout: 20000 });
  await page.getByTestId("student-tools-button").click();
  await page.getByRole("button", { name: "مختبر الشبكات" }).click();
  await page.getByTestId("network-lab").waitFor({ timeout: 20000 });
  check(await page.getByTestId("network-lab-devices").getByRole("button").count() === 3, "a reload restores the network from the draft");
  await ctx.close();
}

await browser.close();
server.close();
if (failures.length) { console.log("\n" + failures.length + " failure(s)"); process.exit(1); }
console.log("\nall checks passed");
