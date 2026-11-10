#!/usr/bin/env node
// 899371 enrichment P15 (docs/enterprise-899371-enrichment-plan.md §12) — how the interactive enrichments FEEL on a mid-range phone:
// a REAL Chromium on the production build, next to the REAL API in process, emulating the Lighthouse mobile profile (CPU 4× slower,
// RTT 150 ms, 1.6 Mbps down / 750 kbps up), 390 × 844 touch, the static files served gzip-compressed as in production. Measurement
// only (no pass / fail beyond a page error); nothing runs code (no runner is configured).
// Each scenario starts COLD (a new context: empty cache) and is repeated RUNS times (default 3); the median is reported:
//   • reader:  open a lesson page → its title shown (the Reader's first load);
//   • scene:   a summary page with two scenes → the first scene drawn; then «التالي» → the next sentence shown (an interaction);
//   • trace:   an exercise page → «شاهد التنفيذ خطوة بخطوة» → the tracer's first step shown;
//   • solve:   a writing question → «حلّ وافحص» → the exam's editor usable (its native text area), then Monaco ready (-1: not loaded);
//   and the JavaScript transferred (compressed bytes) up to that point.
// Output: PERF_OUT (default scratch dir) /perf.json + a table on stdout.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(process.env.DIST || path.join(root, "dist"));
const out = path.resolve(process.env.PERF_OUT || fs.mkdtempSync(path.join(os.tmpdir(), "perf-899371-p15-")));
const RUNS = Number(process.env.RUNS || 3);
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { try { ({ chromium } = require("playwright")); } catch { console.error("playwright unavailable (set PLAYWRIGHT_CORE_DIR)"); process.exit(2); } }
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("no production build at " + dist); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

require(path.join(root, "api/src/lib/observability.js")).setSink(() => {});
const { createLearningApi } = require(path.join(root, "browser-harness/learning-l8-api.cjs"));
const CID = "899371";
const api = createLearningApi({ apiRoot: path.join(root, "api"), seed: {} });
const teacherToken = api.teacherToken();
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".ttf": "font/ttf" };
const GZ = new Map();
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  const gzipOk = /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
  if (u.pathname.startsWith("/api/")) {
    let body = ""; req.on("data", c => { body += c; });
    req.on("end", async () => {
      const r = await api.handle(req.method, req.url, req.headers, body);
      const raw = Buffer.from(String(r.body || ""));
      if (gzipOk && raw.length > 512) { res.writeHead(r.status, { ...r.headers, "content-encoding": "gzip" }); res.end(zlib.gzipSync(raw)); }
      else { res.writeHead(r.status, r.headers); res.end(raw); }
    });
    return;
  }
  let full = path.resolve(dist, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(dist + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) full = path.join(dist, "index.html");
  const type = MIME[path.extname(full)] || "application/octet-stream";
  const text = /^(text|application\/json|image\/svg)/.test(type);
  if (gzipOk && text) {
    if (!GZ.has(full)) GZ.set(full, zlib.gzipSync(fs.readFileSync(full), { level: 9 }));
    res.writeHead(200, { "content-type": type, "content-encoding": "gzip", "cache-control": "no-store" });
    res.end(GZ.get(full));
    return;
  }
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  fs.createReadStream(full).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });

const errors = [];
async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, serviceWorkers: "block", locale: "ar" });
  await ctx.addInitScript(t => {
    sessionStorage.setItem("examBankBuilderToken", t); sessionStorage.setItem("examBankSessionRole", "teacher"); sessionStorage.setItem("examBankSessionDisplayName", "المعلم");
  }, teacherToken);
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  let js = 0;
  const types = new Map();
  cdp.on("Network.responseReceived", e => types.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", e => { if (types.get(e.requestId) === "Script") js += e.encodedDataLength; });
  return { ctx, page, jsKb: () => js / 1024 };
}
const now = page => page.evaluate(() => performance.now());
const reader = id => origin + "/#/learning/" + CID + "/read/" + id;

const SCENARIOS = {
  async reader() {
    const { ctx, page, jsKb } = await phone();
    const t0 = Date.now();
    await page.goto(reader("899371-m04-l01-p05"));
    await page.locator(".learning-reader-page h2").first().waitFor({ timeout: 120000 });
    const r = { ms: Date.now() - t0, jsKb: jsKb() };
    await ctx.close();
    return r;
  },
  async scene() {
    const { ctx, page, jsKb } = await phone();
    const t0 = Date.now();
    await page.goto(reader("899371-m05-l01-p02"));
    await page.locator(".learning-scene-svg").first().waitFor({ timeout: 120000 });
    const shown = Date.now() - t0, kb = jsKb();
    const say = page.locator(".learning-scene-say").first();
    const before = await say.textContent();
    const t1 = await now(page);
    await page.locator(".learning-scene-controls").first().getByRole("button", { name: "التالي", exact: true }).click();
    await page.waitForFunction(b => document.querySelector(".learning-scene-say")?.textContent !== b, before, { timeout: 30000 });
    const step = (await now(page)) - t1;
    await ctx.close();
    return { ms: shown, jsKb: kb, stepMs: step };
  },
  async trace() {
    const { ctx, page, jsKb } = await phone();
    await page.goto(reader("899371-m05-l04-p01"));
    const watch = page.getByRole("button", { name: "شاهد التنفيذ خطوة بخطوة", exact: true }).first();
    await watch.waitFor({ timeout: 120000 });
    const kb0 = jsKb();
    const t1 = Date.now();
    await watch.click();
    await page.locator(".learning-trace-panel .learning-trace-counter").first().waitFor({ timeout: 120000 });
    const r = { ms: Date.now() - t1, jsKb: jsKb() - kb0 };
    await ctx.close();
    return r;
  },
  async solve() {
    const { ctx, page, jsKb } = await phone();
    await page.goto(reader("899371-m01-l03-p01"));
    const open = page.getByRole("button", { name: "حلّ وافحص", exact: true }).first();
    await open.waitFor({ timeout: 120000 });
    const kb0 = jsKb();
    const t1 = Date.now();
    await open.click();
    // the editor paints a native text area first (usable at once), then hands the same text to Monaco where the device can host it
    await page.locator(".learning-solve").getByRole("textbox", { name: /محرر الكود/ }).first().waitFor({ timeout: 120000 });
    const usable = Date.now() - t1, kbUsable = jsKb() - kb0;
    const rich = await page.locator(".learning-solve .monaco-editor").first().waitFor({ timeout: 90000 }).then(() => Date.now() - t1).catch(() => -1);
    const r = { ms: usable, jsKb: kbUsable, richMs: rich, richJsKb: jsKb() - kb0 };
    await ctx.close();
    return r;
  },
};
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const result = { profile: "Lighthouse mobile: CPU 4×, RTT 150 ms, 1.6 Mbps down, 390×844, gzip", runs: RUNS, scenarios: {} };
for (const [name, fn] of Object.entries(SCENARIOS)) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await fn());
  const keys = Object.keys(runs[0]);
  result.scenarios[name] = Object.fromEntries(keys.map(k => [k, Math.round(median(runs.map(r => r[k])) * 10) / 10]));
  result.scenarios[name].all = runs;
  console.log(name.padEnd(8), JSON.stringify(Object.fromEntries(keys.map(k => [k, result.scenarios[name][k]]))));
}
result.errors = errors;
await browser.close(); server.close();
fs.writeFileSync(path.join(out, "perf.json"), JSON.stringify(result, null, 1));
console.log(errors.length ? "page errors: " + errors.join(" | ") : "no page error");
console.log("report: " + path.join(out, "perf.json"));
process.exit(errors.length ? 1 : 0);
