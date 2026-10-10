#!/usr/bin/env node
// Phase 21D-A.2 — compact real-Chromium check of the PRODUCTION physicsLab@1 workspace and editor (browser-harness/physics-lab-21da2.*):
// the four experiments render without page errors; play / pause / resume / single-step / reset drive the clock with real
// requestAnimationFrame; the readout stays synchronized with the timeline; a REAL pointer drag on the pendulum bob changes the start angle
// (exploration, never an action); choosing a resistor attaches the voltmeter; energy is never called conserved with drag; the editor
// preview mounts the real workspace; RTL page with LTR scene / graphs; frame timing while playing; no horizontal overflow at 390 px.
// Requires playwright-core and a Chromium (same provider as the 17F / 21A.x / 21C / 21D / 21D-A.1 harnesses).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-21da2"));
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + " " + detail); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/physics-lab-21da2.html") } } });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(width, height, only) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(origin + "/browser-harness/physics-lab-21da2.html" + (only ? "?only=" + only : ""), { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid=lab-workspace]");
  return page;
}
const sim = kind => "[data-sim=" + kind + "] ";
const t = (page, kind) => page.$eval(sim(kind) + "input[type=range][aria-label^='زمن المحاكاة']", e => Number(e.value));
const readout = (page, kind, id) => page.$eval(sim(kind) + "[data-testid=lab-readout] [data-id=" + id + "] dd", e => e.textContent);
const actions = (page, kind) => page.$eval(sim(kind) + "output[data-testid=actions]", e => e.textContent);

try {
  const page = await open(1280, 900);
  check("four lab workspaces render", (await page.$$("[data-testid=lab-workspace]")).length === 4);
  for (const kind of ["pendulum", "spring", "energy", "circuit"]) {
    await page.locator(sim(kind) + "[data-testid=lab-scene]").scrollIntoViewIfNeeded();
    await page.click(sim(kind) + "[data-testid=lab-play]");
    await sleep(600);
    await page.click(sim(kind) + "[data-testid=lab-pause]");
    const t1 = await t(page, kind);
    check(kind + ": play advances the clock", t1 > 0.2, "t = " + t1);
    await sleep(250);
    check(kind + ": pause holds the time", (await t(page, kind)) === t1);
    check(kind + ": resume label after pause", (await page.textContent(sim(kind) + "[data-testid=lab-play]")) === "استئناف");
    // the range input snaps its displayed value to its 0.01 step; the readout shows the clock time itself
    if (kind !== "circuit") { const rt = Number((await readout(page, kind, "t")).replace(/[^\d.]/g, "")); check(kind + ": readout synchronized with the timeline", Math.abs(rt - t1) <= 0.005, rt + " vs " + t1); }
    await page.click(sim(kind) + "[data-testid=lab-reset]");
    check(kind + ": reset returns to t = 0", (await t(page, kind)) === 0);
    await page.click(sim(kind) + "[data-testid=lab-step]");
    check(kind + ": single step = 0.1 s", Math.abs((await t(page, kind)) - 0.1) < 1e-9);
    await page.click(sim(kind) + "[data-testid=lab-reset]");
    check(kind + ": presentation produced no action", (await actions(page, kind)) === "[]");
  }
  // a REAL pointer drag on the pendulum bob (t = 0): the start angle follows the pointer inside the teacher's limits
  const bob = page.locator(sim("pendulum") + "[data-testid=lab-body] circle");
  await bob.scrollIntoViewIfNeeded();
  const b = await bob.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 70, b.y + b.height / 2 - 10, { steps: 6 }); await page.mouse.up();
  const theta = Number((await readout(page, "pendulum", "theta")).replace(/[^\d.-]/g, ""));
  check("pendulum: pointer drag sets a larger start angle (exploration)", theta > 15 && theta <= 90, "θ = " + theta);
  check("pendulum: the banner says it is exploration", await page.isVisible(sim("pendulum") + "[data-testid=lab-explore-banner]"));
  check("pendulum: dragging produced no action", (await actions(page, "pendulum")) === "[]");
  // circuit meters
  await page.click(sim("circuit") + "[data-testid=lab-resistor-r2]");
  check("circuit: voltmeter on R2 reads 6 V", (await page.textContent(sim("circuit") + "[data-testid=lab-voltmeter]")).includes("6 V"));
  check("circuit: ammeter reads 3 A", (await page.textContent(sim("circuit") + "[data-testid=lab-ammeter]")).includes("3 A"));
  // energy honesty with drag
  await page.fill(sim("energy") + "[data-param=drag] input[type=number]", "0.5");
  check("energy: with drag the note says energy decreases", (await page.textContent(sim("energy") + "[data-testid=lab-energy-note]")).includes("تتناقص"));
  check("energy: dissipated bar shown", (await page.textContent(sim("energy") + "[data-testid=lab-energy-bars]")).includes("مبددة"));
  // a saved measurement is ONE semantic action
  await page.fill(sim("spring") + "[data-testid=lab-measurement][data-id=period] input", "0.99");
  await page.click(sim("spring") + "[data-testid=lab-measurement][data-id=period] button");
  check("saved measurement = one semantic action", (await actions(page, "spring")) === JSON.stringify([{ type: "measurement.set", measurementId: "period", value: 0.99 }]));
  const dirs = await page.$eval(sim("spring") + "[data-testid=lab-workspace]", w => [getComputedStyle(w).direction, getComputedStyle(w.querySelector(".motion-scene")).direction, getComputedStyle(w.querySelector(".motion-graphs")).direction]);
  check("RTL workspace with LTR scene and graphs", dirs.join() === "rtl,ltr,ltr", dirs.join());
  await page.locator("[data-teacher] [data-testid=lab-preview] summary").scrollIntoViewIfNeeded();
  await page.click("[data-teacher] [data-testid=lab-preview] summary");
  await page.waitForSelector("[data-teacher] [data-testid=lab-workspace]", { timeout: 5000 });
  check("editor preview mounts the real workspace", true);
  check("editor reference value (finite-angle period)", (await page.$eval("[data-teacher] [data-testid=lab-reference] [data-id=finiteAnglePeriod] dd", e => e.textContent)) === "2.01092 s");
  // frame timing while the pendulum plays
  await page.locator(sim("pendulum") + "[data-testid=lab-scene]").scrollIntoViewIfNeeded();
  await page.click(sim("pendulum") + "[data-testid=lab-reset]");
  await page.evaluate(() => { window.__f = []; window.__run = true; const f = ts => { window.__f.push(ts); if (window.__run) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.click(sim("pendulum") + "[data-testid=lab-play]");
  await sleep(1500);
  const frames = await page.evaluate(() => { window.__run = false; const d = []; for (let i = 1; i < window.__f.length; i++) d.push(window.__f[i] - window.__f[i - 1]); d.sort((a, b) => a - b); return { n: d.length, median: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)] }; });
  check("frame timing while playing (median < 34 ms)", frames.median < 34, JSON.stringify(frames));
  await page.locator(sim("pendulum")).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, "desktop-pendulum.png") });
  await page.locator(sim("circuit")).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, "desktop-circuit.png") });
  await page.close();
  for (const kind of ["pendulum", "circuit"]) {
    const p = await open(390, 844, kind);
    const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    check(kind + " @390 px: no horizontal overflow", o.sw <= o.iw, JSON.stringify(o));
    await p.screenshot({ path: path.join(out, "phone-" + kind + ".png"), fullPage: true });
    await p.close();
  }
  check("no page errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close(); server.close();
}
const failed = checks.filter(c => !c.ok);
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ checks, errors }, null, 2));
console.log(failed.length ? "FAILED " + failed.length + " / " + checks.length : "ALL " + checks.length + " CHECKS PASSED");
process.exit(failed.length ? 1 : 0);
