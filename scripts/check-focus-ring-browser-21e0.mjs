#!/usr/bin/env node
// Phase 21E.0 — real-Chromium certification of the design-system foundation fix (browser-harness/focus-ring-21e0.*): on the
// PRODUCTION stylesheets, every interactive control of the coding editor, the coding template, the inline cloze, the network
// CLI terminal, the visual (hotspot / label) questions, the AI composer and the presentation studio shows the canonical
// keyboard focus ring (computed `outline-style` ≠ none, width ≥ 2px, an opaque colour with ≥ 3:1 contrast on the surface),
// and the visual-question selection accents (selected shape stroke, draft stroke, cursor border, resize-handle background)
// are really painted. These are COMPUTED-STYLE checks after a real Tab key press: a declaration that is invalid at
// computed-value time (the pre-21E.0 `outline: 3px solid var(--eb-focus, …)` where --eb-focus is a box-shadow) is invisible
// to happy-dom and only shows here. Screenshots of every focused state land in HARNESS_OUT/shots.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-focus-ring-21e0"));
const shots = path.join(out, "shots");
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : "")); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", publicDir: false, build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/focus-ring-21e0.html") } } });
fs.mkdirSync(shots, { recursive: true });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port, PAGE = origin + "/browser-harness/focus-ring-21e0.html";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [];

// Tab order of the page; `ring` = the element whose computed outline must show when `focus` holds the focus (focus-within frames).
const FOCUS_PROBES = [
  { focus: "cloze-input" }, { focus: "cloze-select" },
  { focus: "cx-code-textarea", ring: "cx-code-frame" }, { focus: "cx-code-textarea-rich", ring: "cx-code-frame-rich" },
  { focus: "cx-code-view" }, { focus: "cx-run-button" }, { focus: "cx-stdin" }, { focus: "cx-tpl-locked-pre" }, { focus: "cx-tpl-input" },
  { focus: "ncli-input", ring: "ncli-terminal" },
  { focus: "vq-overlay" }, { focus: "vq-marker" }, { focus: "vq-zone-btn" }, { focus: "vq-chip" },
  { focus: "ai-composer-tab" }, { focus: "xp-studio-btn" }, { focus: "eb-button" },
];
const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const rgb = s => { const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/.exec(s || ""); return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null; };
const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

async function run(name, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  check(name + ": page is RTL with the production tokens", await page.evaluate(() => document.documentElement.dir === "rtl" && getComputedStyle(document.documentElement).getPropertyValue("--eb-focus-ring").trim().length > 0));
  // Static selection accents (no focus needed).
  const st = await page.evaluate(() => {
    const g = p => getComputedStyle(document.querySelector('[data-probe="' + p + '"]'));
    return { shape: g("vq-shape").stroke, selected: g("vq-shape-selected").stroke, draft: g("vq-draft").stroke, cursorStyle: g("vq-cursor").borderTopStyle, cursorColor: g("vq-cursor").borderTopColor, handleBg: g("vq-handle").backgroundColor };
  });
  check(name + ": selected shape has a painted stroke that differs from an unselected shape", st.selected !== "none" && rgb(st.selected)?.a === 1 && st.selected !== st.shape, JSON.stringify(st));
  check(name + ": draft outline has a painted stroke", st.draft !== "none" && rgb(st.draft)?.a === 1, st.draft);
  check(name + ": cursor ring is a dashed, painted border", st.cursorStyle === "dashed" && rgb(st.cursorColor)?.a === 1, st.cursorStyle + " " + st.cursorColor);
  check(name + ": resize handle has an opaque background", rgb(st.handleBg)?.a === 1, st.handleBg);
  // Keyboard focus: Tab through the page and read the computed outline of the ring element.
  const surface = [255, 255, 255];
  for (let i = 0; i < FOCUS_PROBES.length; i++) {
    const p = FOCUS_PROBES[i];
    let reached = false;
    for (let t = 0; t < 4 && !reached; t++) { await page.keyboard.press("Tab"); reached = await page.evaluate(id => document.activeElement?.getAttribute("data-probe") === id, p.focus); }
    check(name + ": Tab reaches " + p.focus, reached);
    if (!reached) continue;
    const o = await page.evaluate(id => { const el = document.querySelector('[data-probe="' + id + '"]'); const c = getComputedStyle(el); return { style: c.outlineStyle, width: parseFloat(c.outlineWidth), color: c.outlineColor, offset: parseFloat(c.outlineOffset) }; }, p.ring || p.focus);
    const col = rgb(o.color);
    const ok = o.style !== "none" && o.width >= 2 && col && col.a === 1 && contrast(col.c, surface) >= 3;
    check(name + ": focus ring visible on " + (p.ring || p.focus) + " (style " + o.style + ", " + o.width + "px, " + o.color + (col ? ", " + contrast(col.c, surface).toFixed(2) + ":1" : "") + ")", ok);
    if (["cx-code-textarea", "vq-marker", "ncli-input", "cloze-input"].includes(p.focus)) await page.screenshot({ path: path.join(shots, name + "-" + String(i + 1).padStart(2, "0") + "-" + p.focus + ".png"), fullPage: false });
  }
  check(name + ": no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await page.screenshot({ path: path.join(shots, name + "-00-page.png"), fullPage: true });
  await ctx.close();
}
await run("desktop", { width: 1280, height: 900 }, false);
await run("phone", { width: 390, height: 844 }, true);
check("no page or console errors", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close(); server.close();
const passed = checks.filter(c => c.ok).length;
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ passed, total: checks.length, checks }, null, 2));
console.log(passed + "/" + checks.length + " checks passed; screenshots in " + shots);
process.exit(passed === checks.length ? 0 : 1);
