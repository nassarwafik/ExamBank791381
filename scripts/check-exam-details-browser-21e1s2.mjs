#!/usr/bin/env node
// Phase 21E.1 (slice 2) — real-Chromium certification of audit finding F3 (browser-harness/exam-details-21e1s2.*): the student
// exam's «تفاصيل الامتحان والتعليمات» disclosure. Collapsed must mean display:none, height 0 and aria-expanded="false" (before the
// fix the panel stayed painted while screen readers heard "collapsed"); one click shows it with aria-expanded="true"; a second click
// hides it again; collapsed, the card is ONE row (≥ 44 px on phones) carrying the summary «22 أسئلة · 100 علامة», and the first
// question heading moves up by the panel's height. Viewports: phone 390×844, desktop 1280×900, 200 % (640×450 at 2×).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-exam-details-21e1s2"));
const shots = path.join(out, "shots");
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : "")); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", publicDir: false, build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/exam-details-21e1s2.html") } } });
fs.mkdirSync(shots, { recursive: true });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const PAGE = "http://127.0.0.1:" + server.address().port + "/browser-harness/exam-details-21e1s2.html";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [];
const state = page => page.evaluate(() => {
  const t = document.querySelector(".iex-details-toggle"), p = document.querySelector(".iex-details-panel"), card = document.querySelector(".iex-details");
  return { expanded: t.getAttribute("aria-expanded"), hiddenAttr: p.hasAttribute("hidden"), display: getComputedStyle(p).display, panelHeight: Math.round(p.getBoundingClientRect().height),
    cardHeight: Math.round(card.getBoundingClientRect().height), toggleHeight: Math.round(t.getBoundingClientRect().height), summary: (t.querySelector(".iex-details-summary")?.textContent || "").trim(),
    questionTop: Math.round(document.getElementById("q1").getBoundingClientRect().top), studentNameVisible: [...p.querySelectorAll("dd")].some(d => d.getClientRects().length > 0 && d.textContent === "سارة أحمد") };
});

async function run(name, viewport, mobile, dsf) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: dsf, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e))); page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.locator(".iex-details-toggle").waitFor({ timeout: 15000 });
  const collapsed = await state(page);
  await page.screenshot({ path: path.join(shots, name + "-1-collapsed.png") });
  check(name + ": collapsed → aria-expanded=false, display:none, height 0, content not painted", collapsed.expanded === "false" && collapsed.display === "none" && collapsed.panelHeight === 0 && !collapsed.studentNameVisible, JSON.stringify(collapsed));
  check(name + ": collapsed card is one row carrying the summary" + (mobile ? " (≥ 44 px)" : ""), collapsed.summary === "22 أسئلة · 100 علامة" && collapsed.cardHeight <= collapsed.toggleHeight + 4 && (!mobile || collapsed.toggleHeight >= 44), "card " + collapsed.cardHeight + " px, row " + collapsed.toggleHeight + " px");
  await page.locator(".iex-details-toggle").click();
  const open = await state(page);
  await page.screenshot({ path: path.join(shots, name + "-2-open.png") });
  check(name + ": one click → aria-expanded=true, panel painted", open.expanded === "true" && open.display !== "none" && open.panelHeight > 0 && open.studentNameVisible, JSON.stringify({ display: open.display, panelHeight: open.panelHeight }));
  await page.locator(".iex-details-toggle").click();
  const again = await state(page);
  check(name + ": a second click → hidden again", again.expanded === "false" && again.display === "none" && again.panelHeight === 0, JSON.stringify({ display: again.display, panelHeight: again.panelHeight }));
  check(name + ": the first question moves up by the panel when collapsed", again.questionTop < open.questionTop, "question heading at y=" + again.questionTop + " collapsed vs y=" + open.questionTop + " open");
  await ctx.close();
}
await run("phone-390", { width: 390, height: 844 }, true, 2);
await run("desktop-1280", { width: 1280, height: 900 }, false, 1);
await run("desktop-200pct", { width: 640, height: 450 }, false, 2);
await browser.close(); server.close();
check("no page errors", errors.length === 0, errors.join(" | "));
fs.writeFileSync(path.join(out, "result.json"), JSON.stringify({ checks, errors }, null, 2));
const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
