#!/usr/bin/env node
// Phase 21E — render-performance baseline of the PRODUCTION build (dist/) in headless Chromium: median of three loads of the
// login route at desktop 1280×900 and phone 390×844 with 4× CPU throttling. Reports first contentful paint, DOMContentLoaded,
// load, request count and DOM node count. Read-only tooling; run after
// `npm run build`. Not a gate: the 21E stages compare their numbers against the recorded baseline in
// docs/enterprise-ux-premium-21e.md §2 with this same tool.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("dist/index.html missing — run `npm run build` first"); process.exit(2); }
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  let f = path.join(dist, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, "index.html");
  res.setHeader("content-type", MIME[path.extname(f)] || "application/octet-stream"); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const out = {};
for (const [name, viewport, cpu] of [["desktop", { width: 1280, height: 900 }, 1], ["phone-4x-cpu", { width: 390, height: 844 }, 4]]) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 500 });
    const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    let reqs = 0;
    page.on("response", () => { reqs++; });
    await page.goto(origin + "/", { waitUntil: "networkidle" });
    const m = await page.evaluate(() => { const nav = performance.getEntriesByType("navigation")[0]; const paint = Object.fromEntries(performance.getEntriesByType("paint").map(p => [p.name, Math.round(p.startTime)])); return { dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), fcp: paint["first-contentful-paint"], nodes: document.getElementsByTagName("*").length, title: document.title }; });
    runs.push({ ...m, reqs }); await ctx.close();
  }
  const med = k => runs.map(r => r[k]).sort((a, b) => a - b)[1];
  out[name] = { fcpMs: med("fcp"), dclMs: med("dcl"), loadMs: med("load"), requests: med("reqs"), domNodes: med("nodes"), title: runs[0].title };
}
await browser.close(); server.close();
console.log(JSON.stringify(out, null, 2));
