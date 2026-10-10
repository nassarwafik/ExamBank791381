#!/usr/bin/env node
// Phase 21D-A.4 — compact real-Chromium check of the PRODUCTION multi-surface 3D plot viewer and editor (browser-harness/surface-plots-21da4.*):
// the acceptance exam's plots through the real rich-content renderer; a 2-surface plot rotated by a real mouse drag and a touch drag, zoomed
// by Ctrl+wheel and the buttons, reset, one surface toggled off and on; the rotate-only plot refuses zoom; the V1 surface still renders
// with the unchanged 21B viewer; tick labels stay inside the drawing; RTL page with an LTR drawing; no horizontal overflow at 390 px;
// frame timing while dragging; the editor's live preview; no page errors and no external host.
// Requires playwright-core and a Chromium (same provider as the 17F / 21A.x / 21C / 21D harnesses).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-21da4"));
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + " " + detail); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/surface-plots-21da4.html") } } });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [], foreign = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(width, height, only, touch = false) {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  page.on("pageerror", e => errors.push(String(e)));
  page.on("request", r => { const u = new URL(r.url()); if (u.origin !== origin && u.protocol !== "data:") foreign.push(r.url()); });
  const t0 = Date.now();
  await page.goto(origin + "/browser-harness/surface-plots-21da4.html" + (only ? "?only=" + only : ""), { waitUntil: "networkidle" });
  await page.waitForSelector("svg.sp3d-scene[data-level=standard], svg.sp3d-scene[data-level=high]", { timeout: 15000 });
  return { page, readyMs: Date.now() - t0 };
}
const svgOf = s => "[data-testid=" + s + "] svg.sp3d-scene";
const camera = (page, s) => page.$eval(svgOf(s), e => ({ yaw: Number(e.dataset.yaw), pitch: Number(e.dataset.pitch), zoom: Number(e.dataset.zoom), level: e.dataset.level }));
const count = (page, s, surface) => page.$$eval(svgOf(s) + " polygon[data-s" + (surface === undefined ? "" : "='" + surface + "'") + "]", l => l.length);
const settled = async (page, s) => { for (let i = 0; i < 60; i++) { if ((await camera(page, s)).level !== "motion") return; await sleep(50); } };

try {
  const { page, readyMs } = await open(1280, 900);
  check("four V2 plots + the editor preview render with the new viewer", (await page.$$("figure.sp3d")).length === 5);
  check("the V1 surface still renders with the unchanged 21B viewer", (await page.$$("[data-testid=sec-e] svg.ex3d-scene polygon")).length > 100 && (await page.$$("[data-testid=sec-e] figure.sp3d")).length === 0);
  check("rest-quality meshes ready after load", readyMs < 15000, readyMs + " ms");
  const a = "sec-a";
  await page.locator(svgOf(a)).scrollIntoViewIfNeeded();
  await page.waitForSelector(svgOf(a) + "[data-level=standard]");
  const n0 = await count(page, a, 0), n1 = await count(page, a, 1);
  check("2-surface plot: both surfaces drawn in one coordinate system", n0 > 300 && n1 > 300, n0 + " + " + n1 + " polygons");
  check("legend lists both surfaces with their formulas", (await page.$$eval("[data-testid=sec-a] .sp3d-legend li", l => l.map(x => x.getAttribute("data-surface")).join())) === "upward,downward");
  const c0 = await camera(page, a);
  check("authored starting view", c0.yaw === -0.6 && c0.pitch === 0.45 && c0.zoom === 1, JSON.stringify(c0));
  // a real mouse drag rotates (light mesh while moving, rest quality afterwards); frame timing while dragging
  const box = await page.locator(svgOf(a)).boundingBox();
  await page.evaluate(() => { window.__f = []; window.__run = true; const f = ts => { window.__f.push(ts); if (window.__run) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5); await page.mouse.down();
  let movingLevel = "";
  for (let i = 1; i <= 30; i++) { await page.mouse.move(box.x + box.width * 0.5 + i * 6, box.y + box.height * 0.5 + (i % 2 ? 2 : -2)); if (i === 15) movingLevel = (await camera(page, a)).level; }
  await page.mouse.up();
  const frames = await page.evaluate(() => { window.__run = false; const d = []; for (let i = 1; i < window.__f.length; i++) d.push(window.__f[i] - window.__f[i - 1]); d.sort((x, y) => x - y); return { n: d.length, median: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)] }; });
  const c1 = await camera(page, a);
  check("mouse drag rotates the plot", Math.abs(c1.yaw - c0.yaw) > 0.3, "yaw " + c0.yaw + " → " + c1.yaw);
  check("light mesh while moving", movingLevel === "motion", movingLevel);
  await settled(page, a);
  check("rest quality returns when the motion settles", (await camera(page, a)).level === "standard");
  check("frame timing while dragging (median < 34 ms)", frames.median < 34, JSON.stringify(frames));
  // zoom: Ctrl + wheel (deliberate) and the + button; then reset
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control"); await page.mouse.wheel(0, -300); await page.keyboard.up("Control");
  const c2 = await camera(page, a);
  check("Ctrl + wheel zooms in", c2.zoom > 1.2, "zoom " + c2.zoom);
  await page.click("[data-testid=sec-a] button[aria-label='تكبير']");
  check("+ button zooms in further", (await camera(page, a)).zoom > c2.zoom);
  await page.click("[data-testid=sec-a] .sp3d-controls button:has-text('إعادة العرض')");
  await settled(page, a);
  const c3 = await camera(page, a);
  check("reset returns to the authored view", c3.yaw === -0.6 && c3.pitch === 0.45 && c3.zoom === 1, JSON.stringify(c3));
  // toggle one surface off and on again
  await page.click("[data-testid=sec-a] input[aria-label^='إظهار السطح القطع المكافئ المقلوب']");
  check("toggling a surface off removes its polygons", (await count(page, a, 1)) === 0 && (await count(page, a, 0)) > 300);
  await page.click("[data-testid=sec-a] input[aria-label^='إظهار السطح القطع المكافئ المقلوب']");
  check("toggling it on draws it again", (await count(page, a, 1)) > 300);
  // tick labels and axis titles stay inside the drawing
  const inside = await page.$eval(svgOf(a), svg => { const r = svg.getBoundingClientRect(); return [...svg.querySelectorAll(".sp3d-tick, .sp3d-axis-title")].every(t => { const b = t.getBoundingClientRect(); return b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1; }); });
  check("ticks and axis titles are inside the drawing (no clipping)", inside);
  const dirs = await page.$eval("[data-testid=sec-a] figure.sp3d", f => [getComputedStyle(f).direction, getComputedStyle(f.querySelector("svg.sp3d-scene")).direction, getComputedStyle(f.querySelector(".sp3d-formula")).direction]);
  check("RTL figure with an LTR drawing and LTR formulas", dirs.join() === "rtl,ltr,ltr", dirs.join());
  // the rotate-only plot: no zoom controls, Ctrl + wheel does not zoom, no surface toggles, rotation works
  const d = "sec-d";
  await page.locator(svgOf(d)).scrollIntoViewIfNeeded();
  const bd = await page.locator(svgOf(d)).boundingBox();
  check("rotate-only plot has no zoom buttons and no surface toggles", (await page.$$("[data-testid=sec-d] button[aria-label='تكبير']")).length === 0 && (await page.$$("[data-testid=sec-d] .sp3d-legend input")).length === 0);
  const z0 = (await camera(page, d)).zoom;
  await page.mouse.move(bd.x + bd.width / 2, bd.y + bd.height / 2);
  await page.keyboard.down("Control"); await page.mouse.wheel(0, -300); await page.keyboard.up("Control");
  check("rotate-only plot ignores Ctrl + wheel", (await camera(page, d)).zoom === z0, "zoom " + z0);
  check("three surfaces drawn (transparent style)", (await count(page, d, 0)) > 0 && (await count(page, d, 1)) > 0 && (await count(page, d, 2)) > 0 && (await page.$eval(svgOf(d) + " polygon[data-s]", p => p.getAttribute("fill-opacity"))) === "0.6");
  await page.locator("[data-testid=sec-a]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, "desktop-paraboloids.png") });
  await page.locator("[data-testid=sec-c]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, "desktop-cone-plane.png") });
  await page.locator("[data-testid=sec-d]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, "desktop-three-surfaces.png") });
  // the editor: live preview of the real viewer; adding a surface shows it; an invalid formula is refused with a reason
  await page.locator("[data-testid=editor]").scrollIntoViewIfNeeded();
  check("editor preview mounts the real viewer", (await page.$$("[data-testid=editor] svg.sp3d-scene")).length === 1);
  await page.click("[data-testid=editor] button:has-text('+ إضافة سطح')");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=editor] .sp3d-legend li").length === 3);
  check("adding a surface shows it in the preview legend", true);
  await page.fill("[data-testid=editor] input[aria-label='معادلة السطح 3']", "x+t");
  check("an invalid formula is refused with a reason (no preview)", (await page.textContent("[data-testid=editor] [role=alert]")).includes("SURFACE_PLOT_VARIABLE_INVALID") && (await page.$$("[data-testid=editor] svg.sp3d-scene")).length === 0);
  await page.close();
  // phone: one-finger touch drag rotates; no horizontal overflow; labels inside the drawing
  const phone = await open(390, 844, "sec-a", true);
  const p = phone.page, pb = await p.locator(svgOf(a)).boundingBox(), y0 = (await camera(p, a)).yaw;
  const cdp = await p.context().newCDPSession(p), pt = (x, y) => [{ x, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(pb.x + pb.width * 0.4, pb.y + pb.height * 0.5) });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(pb.x + pb.width * 0.4 + i * 12, pb.y + pb.height * 0.5) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(300);
  check("one-finger touch drag rotates on a phone", Math.abs((await camera(p, a)).yaw - y0) > 0.2, "yaw " + y0 + " → " + (await camera(p, a)).yaw);
  const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check("@390 px: no horizontal overflow", o.sw <= o.iw, JSON.stringify(o));
  await settled(p, a);
  await p.click("[data-testid=sec-a] .sp3d-controls button:has-text('إعادة العرض')");
  await settled(p, a);
  const phoneInside = await p.$eval(svgOf(a), svg => { const r = svg.getBoundingClientRect(); return [...svg.querySelectorAll(".sp3d-tick, .sp3d-axis-title")].every(t => { const b = t.getBoundingClientRect(); return b.left >= r.left - 1 && b.right <= r.right + 1; }); });
  check("@390 px: ticks and axis titles inside the drawing", phoneInside);
  await p.screenshot({ path: path.join(out, "phone-paraboloids.png"), fullPage: true });
  await p.close();
  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  check("no external asset or network host", foreign.length === 0, foreign.slice(0, 3).join(" | "));
} finally {
  await browser.close(); server.close();
}
const failed = checks.filter(c => !c.ok);
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ checks, errors }, null, 2));
console.log(failed.length ? "FAILED " + failed.length + " / " + checks.length : "ALL " + checks.length + " CHECKS PASSED");
process.exit(failed.length ? 1 : 0);
