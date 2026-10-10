#!/usr/bin/env node
// Phase 21D-A.1 — compact real-Chromium check of the PRODUCTION physicsMotion@1 workspace and editor (browser-harness/physics-motion-21da1.*):
// the four experiments render without page errors; play / pause / resume / single-step / reset drive the clock with real
// requestAnimationFrame; the readout stays synchronized with the timeline; exploration shows the banner and never produces an action;
// the editor preview mounts the real workspace; no horizontal overflow on a 390 px phone; RTL page with LTR scene / graphs; frame timing
// while playing. Requires playwright-core and a Chromium (same provider as the 17F / 21A.x / 21C / 21D harnesses).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-21da1"));
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + " " + detail); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/physics-motion-21da1.html") } } });
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
  await page.goto(origin + "/browser-harness/physics-motion-21da1.html" + (only ? "?only=" + only : ""), { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid=motion-workspace]");
  return page;
}
const sim = kind => "[data-sim=" + kind + "] ";
const t = (page, kind) => page.$eval(sim(kind) + "input[type=range][aria-label^='زمن المحاكاة']", e => Number(e.value));
const readoutT = (page, kind) => page.$eval(sim(kind) + "[data-testid=motion-readout] [data-id=t] dd", e => e.textContent);
const actions = (page, kind) => page.$eval(sim(kind) + "output[data-testid=actions]", e => e.textContent);

try {
  // ── desktop: all four experiments ───────────────────────────────────────────────────────────────────────────────────────────────
  const page = await open(1280, 900);
  const kinds = ["freeFall", "projectile", "newton2", "incline"];
  check("four workspaces render", (await page.$$("[data-testid=motion-workspace]")).length === 4);
  for (const kind of kinds) {
    await page.locator(sim(kind) + "[data-testid=motion-scene]").scrollIntoViewIfNeeded();
    const body0 = await page.$eval(sim(kind) + "[data-testid=motion-body]", e => e.outerHTML);
    await page.click(sim(kind) + "[data-testid=motion-play]");
    await sleep(700);
    await page.click(sim(kind) + "[data-testid=motion-pause]");
    const t1 = await t(page, kind), body1 = await page.$eval(sim(kind) + "[data-testid=motion-body]", e => e.outerHTML);
    check(kind + ": play advances the clock and moves the body", t1 > 0.2 && body1 !== body0, "t = " + t1);
    await sleep(300);
    check(kind + ": pause holds the time", (await t(page, kind)) === t1);
    check(kind + ": resume label after pause", (await page.textContent(sim(kind) + "[data-testid=motion-play]")) === "استئناف");
    check(kind + ": readout synchronized with the timeline", (await readoutT(page, kind)).startsWith(String(Number(t1.toPrecision(6)))), await readoutT(page, kind));
    await page.click(sim(kind) + "[data-testid=motion-reset]");
    check(kind + ": reset returns to t = 0", (await t(page, kind)) === 0);
    await page.click(sim(kind) + "[data-testid=motion-step]");
    check(kind + ": single step = 0.1 s", Math.abs((await t(page, kind)) - 0.1) < 1e-9);
    const graphs = await page.$$eval(sim(kind) + "[data-testid^=motion-graph-]", els => els.length);
    check(kind + ": primary + optional graphs", graphs >= 2, String(graphs));
    check(kind + ": presentation produced no action", (await actions(page, kind)) === "[]");
  }
  const trail = await page.$eval(sim("projectile") + "[data-testid=motion-trail]", e => e.getAttribute("points").split(" ").length);
  check("projectile: travelled trajectory drawn in the scene", trail >= 2, String(trail));
  // exploration: projectile initial speed through the real range input
  const speed = page.locator(sim("projectile") + "[data-param=initialSpeed] input[type=number]");
  await speed.fill("12");
  check("exploration shows the banner", await page.isVisible(sim("projectile") + "[data-testid=motion-explore-banner]"));
  check("exploration produced no action", (await actions(page, "projectile")) === "[]");
  await page.click(sim("projectile") + "[data-testid=motion-explore-banner] button");
  check("restore removes the banner", !(await page.isVisible(sim("projectile") + "[data-testid=motion-explore-banner]")));
  // a saved measurement becomes ONE semantic action
  await page.fill(sim("newton2") + "[data-testid=motion-measurement][data-id=acceleration] input", "3.04");
  await page.click(sim("newton2") + "[data-testid=motion-measurement][data-id=acceleration] button");
  check("saved measurement = one semantic action", (await actions(page, "newton2")) === JSON.stringify([{ type: "measurement.set", measurementId: "acceleration", value: 3.04 }]));
  // RTL page, LTR islands
  const dirs = await page.$eval(sim("incline") + "[data-testid=motion-workspace]", w => [getComputedStyle(w).direction, getComputedStyle(w.querySelector(".motion-scene")).direction, getComputedStyle(w.querySelector(".motion-graphs")).direction]);
  check("RTL workspace with LTR scene and graphs", dirs.join() === "rtl,ltr,ltr", dirs.join());
  // editor + preview
  await page.locator("[data-teacher] [data-testid=motion-preview] summary").scrollIntoViewIfNeeded();
  await page.click("[data-teacher] [data-testid=motion-preview] summary");
  await page.waitForSelector("[data-teacher] [data-testid=motion-workspace]", { timeout: 5000 });
  check("editor preview mounts the real workspace", true);
  check("editor reference values", (await page.$eval("[data-teacher] [data-testid=motion-reference] [data-id=range] dd", e => e.textContent)) === "40.8163 m");
  // frame timing while playing (projectile, 1.5 s)
  await page.locator(sim("projectile") + "[data-testid=motion-scene]").scrollIntoViewIfNeeded();
  await page.click(sim("projectile") + "[data-testid=motion-reset]");
  await page.evaluate(() => { window.__f = []; window.__run = true; const f = ts => { window.__f.push(ts); if (window.__run) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.click(sim("projectile") + "[data-testid=motion-play]");
  await sleep(1500);
  const frames = await page.evaluate(() => { window.__run = false; const d = []; for (let i = 1; i < window.__f.length; i++) d.push(window.__f[i] - window.__f[i - 1]); d.sort((a, b) => a - b); return { n: d.length, median: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)] }; });
  check("frame timing while playing (median < 34 ms)", frames.median < 34, JSON.stringify(frames));
  await page.screenshot({ path: path.join(out, "desktop.png"), fullPage: false });
  await page.close();

  // ── phone: 390 × 844, no horizontal overflow ───────────────────────────────────────────────────────────────────────────────────
  for (const kind of ["projectile", "incline"]) {
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
