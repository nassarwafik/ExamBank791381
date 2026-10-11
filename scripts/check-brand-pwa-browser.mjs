#!/usr/bin/env node
// BRAND-005 / PWA-006 — real-Chromium certification of the Tadris+ identity on the PRODUCTION build (`vite build` of index.html with
// the public folder, served like the Static Web App: .webmanifest as application/manifest+json, icons as image/png):
//   • the manifest is reachable with the right MIME, parses, keeps the installed identity (id / start_url / scope) and names Tadris+;
//   • every icon URL the manifest and index.html reference answers 200 image/png and DECODES in the browser at its declared size
//     (including the version query); the favicons render at 16 / 32 / 48 CSS px (rasterised through a canvas for the evidence);
//   • the tab title, theme colour, Apple metadata and the login page (brand row, heading, tagline) show Tadris+ and no «ExamBank»;
//   • the service worker and the offline page are served and the offline page says Tadris+;
//   • phone (390 × 844): the login page has no horizontal overflow and the brand row is visible.
// Screenshots (login desktop / phone, favicon strip, icon sheet) land in HARNESS_OUT/shots.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-brand-pwa"));
const shots = path.join(out, "shots");
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : "")); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

const dist = path.join(out, "dist");
fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", build: { outDir: dist, emptyOutDir: true } });
fs.mkdirSync(shots, { recursive: true });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  let full = path.resolve(dist, "." + decodeURIComponent(u.pathname));
  if (u.pathname.startsWith("/api/")) { res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false })); return; }
  if (!full.startsWith(dist + path.sep) && full !== dist) { res.writeHead(404); res.end(); return; }
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) full = path.join(dist, "index.html");     // SPA fallback
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [];
const shot = (page, name) => page.screenshot({ path: path.join(shots, name + ".png"), fullPage: false });
const head = async (page, url) => page.evaluate(async u => { const r = await fetch(u, { cache: "no-store" }); return { status: r.status, type: r.headers.get("content-type") || "", size: (await r.arrayBuffer()).byteLength }; }, url);
const decode = (page, url) => page.evaluate(u => new Promise(resolve => { const i = new Image(); i.onload = () => resolve({ ok: true, w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => resolve({ ok: false }); i.src = u; }), url);

try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await desktop.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(origin + "/", { waitUntil: "networkidle" });
  await page.waitForSelector("h1.auth-welcome", { timeout: 15000 });
  await shot(page, "01-login-desktop");

  // ── tab + head metadata ──────────────────────────────────────────────────────────────────────────────────────────────
  check("tab title is «Tadris+ — التعليم المتكامل»", (await page.title()) === "Tadris+ — التعليم المتكامل", await page.title());
  const meta = await page.evaluate(() => ({
    theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
    apple: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content"),
    appleIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"),
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
    icons: Array.from(document.querySelectorAll('link[rel="icon"]')).map(l => [l.getAttribute("sizes"), l.getAttribute("href")]),
  }));
  check("theme colour is the Tadris+ navy", meta.theme === "#031c40", String(meta.theme));
  check("Apple home-screen title is Tadris+", meta.apple === "Tadris+", String(meta.apple));
  check("favicon links: 16 / 32 / 48 / 192 with the version query", meta.icons.map(i => i[0]).join() === "32x32,16x16,48x48,192x192" && meta.icons.every(i => /\?v=tadris1$/.test(i[1])), JSON.stringify(meta.icons));

  // ── manifest ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const m = await head(page, meta.manifest);
  check("manifest answers 200 application/manifest+json", m.status === 200 && /application\/manifest\+json/.test(m.type), m.status + " " + m.type);
  const manifest = await page.evaluate(async u => (await fetch(u, { cache: "no-store" })).json(), meta.manifest);
  check("manifest names Tadris+ and keeps the installed identity (id ./, start_url ./, scope ./, standalone, ar, rtl)", manifest.name === "Tadris+" && manifest.short_name === "Tadris+" && manifest.id === "./" && manifest.start_url === "./" && manifest.scope === "./" && manifest.display === "standalone" && manifest.lang === "ar" && manifest.dir === "rtl", JSON.stringify({ name: manifest.name, id: manifest.id, start_url: manifest.start_url, scope: manifest.scope }));
  check("manifest theme / background colours are the brand navy", manifest.theme_color === "#031c40" && manifest.background_color === "#031c40");
  check("manifest lists 192 + 512 any and 192 + 512 maskable", manifest.icons.map(i => i.sizes + ":" + i.purpose).join() === "192x192:any,512x512:any,192x192:maskable,512x512:maskable");

  // ── every referenced icon: 200 image/png and decodes at the declared size ────────────────────────────────────────────
  const refs = [...manifest.icons.map(i => ({ url: new URL(i.src, origin + "/manifest.webmanifest").href, size: Number(i.sizes.split("x")[0]), label: "manifest " + i.src })),
    ...meta.icons.map(([sizes, href]) => ({ url: new URL(href, origin).href, size: Number(sizes.split("x")[0]), label: "favicon " + href })),
    { url: new URL(meta.appleIcon, origin).href, size: 180, label: "apple-touch-icon" }];
  for (const r of refs) {
    const h = await head(page, r.url), d = await decode(page, r.url);
    check(r.label + ": 200 image/png, decodes at " + r.size + "×" + r.size, h.status === 200 && /image\/png/.test(h.type) && d.ok && d.w === r.size && d.h === r.size, h.status + " " + h.type + " " + JSON.stringify(d) + " " + h.size + " B");
  }

  // ── rasterised favicon strip (readability at actual tab / taskbar sizes) ─────────────────────────────────────────────
  const strip = await page.evaluate(async base => {
    const sizes = [16, 32, 48], scale = 4, pad = 12;
    const c = document.createElement("canvas"); c.width = (16 + 32 + 48) * scale + pad * 4; c.height = 48 * scale + pad * 2;
    const g = c.getContext("2d"); g.fillStyle = "#e5e7eb"; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
    let x = pad;
    for (const s of sizes) { const i = new Image(); i.src = base + "/pwa/favicon-" + s + ".png?v=tadris1"; await i.decode(); g.drawImage(i, x, pad, s * scale, s * scale); x += s * scale + pad; }
    return c.toDataURL("image/png");
  }, origin);
  fs.writeFileSync(path.join(shots, "02-favicons-16-32-48-x4.png"), Buffer.from(strip.split(",")[1], "base64"));
  check("favicon strip rasterised for the evidence (16 / 32 / 48 at 4×)", strip.length > 1000);
  const sheet = await page.evaluate(async base => {
    const files = ["icon-192.png", "icon-maskable-192.png", "apple-touch-icon.png"], pad = 16;
    const c = document.createElement("canvas"); c.width = 192 * 3 + pad * 4; c.height = 192 + pad * 2;
    const g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
    let x = pad;
    for (const f of files) { const i = new Image(); i.src = base + "/pwa/" + f + "?v=tadris1"; await i.decode(); g.drawImage(i, x, pad, 192, 192); x += 192 + pad; }
    // circular mask preview of the maskable icon (what a Pixel launcher shows)
    g.save(); g.beginPath(); g.arc(pad + 192 + pad + 96, pad + 96, 96, 0, Math.PI * 2); g.clip(); g.fillStyle = "#fff"; g.fillRect(pad + 192 + pad, pad, 192, 192);
    const i = new Image(); i.src = base + "/pwa/icon-maskable-192.png?v=tadris1"; await i.decode(); g.drawImage(i, pad + 192 + pad, pad, 192, 192); g.restore();
    return c.toDataURL("image/png");
  }, origin);
  fs.writeFileSync(path.join(shots, "03-icon-sheet-any-maskable-circle-apple.png"), Buffer.from(sheet.split(",")[1], "base64"));

  // ── login surface ────────────────────────────────────────────────────────────────────────────────────────────────────
  const login = await page.evaluate(() => ({ h1: document.querySelector("h1.auth-welcome")?.textContent?.trim(), logo: document.querySelector(".auth-logo-text")?.textContent?.replace(/\s+/g, " ").trim(), img: document.querySelector(".auth-logo img")?.getAttribute("src"), text: document.body.innerText }));
  check("login heading is Tadris+ and the brand row carries the tagline", login.h1 === "Tadris+" && /Tadris\+/.test(login.logo || "") && /التعليم المتكامل/.test(login.logo || ""), JSON.stringify([login.h1, login.logo]));
  check("login brand mark is the new icon file (versioned)", login.img === "/pwa/icon-192.png?v=tadris1", String(login.img));
  check("no «ExamBank» text on the login page", !/ExamBank/.test(login.text));
  const imgOk = await page.evaluate(() => { const i = document.querySelector(".auth-logo img"); return !!i && i.complete && i.naturalWidth === 192; });
  check("the brand mark image decoded in the page", imgOk);

  // ── service worker + offline page ────────────────────────────────────────────────────────────────────────────────────
  const sw = await head(page, origin + "/sw.js");
  check("sw.js is served as JavaScript", sw.status === 200 && /javascript/.test(sw.type), sw.status + " " + sw.type);
  const offline = await page.evaluate(async u => (await fetch(u)).text(), origin + "/offline.html");
  check("offline page is rebranded (Tadris+) and static", /يحتاج Tadris\+ إلى اتصال بالإنترنت/.test(offline) && /Tadris\+ — التعليم المتكامل/.test(offline) && !/<script|src=|href=/.test(offline));
  const off = await desktop.newPage(); await off.goto(origin + "/offline.html"); await shot(off, "04-offline-page"); await off.close();

  // ── phone ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p2 = await phone.newPage();
  await p2.goto(origin + "/", { waitUntil: "networkidle" });
  await p2.waitForSelector("h1.auth-welcome", { timeout: 15000 });
  await shot(p2, "05-login-phone");
  check("phone: no horizontal overflow on the login page", await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check("phone: the Tadris+ heading is visible", await p2.locator("h1.auth-welcome").isVisible() && (await p2.locator("h1.auth-welcome").textContent()) === "Tadris+");
  await phone.close();
  await desktop.close();
} catch (e) {
  check("harness ran to completion", false, String(e && e.stack || e));
} finally {
  await browser.close();
  server.close();
}
check("no page errors", errors.length === 0, errors.slice(0, 5).join(" | "));
const failed = checks.filter(c => !c.ok);
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ origin: "brand-pwa", checks, failed: failed.length }, null, 2));
console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed; screenshots in " + shots);
process.exit(failed.length ? 1 : 0);
