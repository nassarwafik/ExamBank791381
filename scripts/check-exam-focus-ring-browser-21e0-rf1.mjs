#!/usr/bin/env node
// Phase 21E.0 — Review Fix 1: real-Chromium certification of the EXAM-SCOPED keyboard focus ring (browser-harness/exam-focus-ring-21e0-rf1.*).
// The harness mounts the real PresentationRoot (.exam-presentation with the preset's --xp-* variables) around the real student
// question card for several code-owned presets. For every preset, every control reached with the Tab key (inline-cloze text input and
// dropdown, hotspot overlay and placed marker, a legacy multiple-choice option) must show the EXAM ring: computed outline-style solid,
// width exactly 3px, colour exactly the preset's primary (--xp-primary), offset 2px and ≥ 3:1 contrast on the preset's surface. The
// high-contrast preset's ring must be pure black, never the platform ring. A reference button OUTSIDE the exam root keeps the
// canonical 2px platform ring (the 21E.0 foundation is preserved): `2px solid var(--eb-primary)`, its colour read from the production
// token on the page (QA2 4c: the constant had kept the pre-UX-R17 blue after the palette moved to #2a0a4e). Computed styles only: this is what the student actually sees.
// Fail-first: on the 21E.0 head before this fix, the migrated controls (cloze / hotspot / option) resolve to the 2px canonical ring
// inside the themed exam; the fix (`--eb-focus-ring: 3px solid var(--xp-primary)` scoped to .exam-presentation) restores the 3px ring.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-exam-focus-ring-21e0-rf1"));
const shots = path.join(out, "shots");
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : "")); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", publicDir: false, build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/exam-focus-ring-21e0-rf1.html") } } });
fs.mkdirSync(shots, { recursive: true });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port, PAGE = origin + "/browser-harness/exam-focus-ring-21e0-rf1.html";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [];

/** The presets the harness renders (in page order) with the code-owned primary / surface each one must paint (pinned from presentationModel.ts). */
const PRESETS = [
  { id: "highContrast", primary: "rgb(0, 0, 0)", surface: [255, 255, 255] },
  { id: "default", primary: "rgb(29, 78, 216)", surface: [255, 255, 255] },
  { id: "classicPaper", primary: "rgb(31, 41, 55)", surface: [255, 253, 247] },
];
/** Tab order inside one themed exam; `ring` = the element whose computed outline is read (the option label rings on focus-within). */
const PROBES = [
  { sel: ".cloze-input", label: "cloze text input" }, { sel: ".cloze-select", label: "cloze dropdown" },
  { sel: ".vq-overlay[tabindex]", label: "hotspot overlay" }, { sel: ".vq-marker", label: "hotspot marker" },
  { sel: ".iex-option input[type=radio]", ring: ".iex-option", label: "multiple-choice option" },
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
  await page.waitForSelector('[data-preset="classicPaper"] .vq-marker', { timeout: 15000 });
  // The canonical platform ring colour = the production --eb-primary token, resolved by the browser on this page.
  const PLATFORM_RING = await page.evaluate(() => { const p = document.createElement("span"); p.style.color = "var(--eb-primary)"; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; });
  check(name + ": the platform ring colour resolves from the production --eb-primary token (" + PLATFORM_RING + ")", rgb(PLATFORM_RING)?.a === 1 && PRESETS.every(pr => pr.primary !== PLATFORM_RING));
  check(name + ": page is RTL and every preset mounted a real .exam-presentation root with its --xp-primary", await page.evaluate(ids => document.documentElement.dir === "rtl" && ids.every(id => { const r = document.querySelector('[data-preset="' + id + '"] .exam-presentation'); return r && r.getAttribute("data-xp-preset") === id && getComputedStyle(r).getPropertyValue("--xp-primary").trim().length > 0; }), PRESETS.map(p => p.id)));
  for (const preset of PRESETS) {
    const scope = '[data-preset="' + preset.id + '"] ';
    for (const p of PROBES) {
      let reached = false;
      for (let t = 0; t < 10 && !reached; t++) { await page.keyboard.press("Tab"); reached = await page.evaluate(sel => document.activeElement === document.querySelector(sel), scope + p.sel); }
      check(name + " / " + preset.id + ": Tab reaches the " + p.label, reached);
      if (!reached) continue;
      const o = await page.evaluate(sel => { const c = getComputedStyle(document.querySelector(sel)); return { style: c.outlineStyle, width: parseFloat(c.outlineWidth), color: c.outlineColor, offset: parseFloat(c.outlineOffset) }; }, scope + (p.ring || p.sel));
      const col = rgb(o.color), ratio = col ? contrast(col.c, preset.surface) : 0;
      const desc = "(style " + o.style + ", " + o.width + "px, " + o.color + ", offset " + o.offset + "px, " + ratio.toFixed(2) + ":1)";
      check(name + " / " + preset.id + ": " + p.label + " ring is solid 3px " + desc, o.style === "solid" && o.width === 3);
      check(name + " / " + preset.id + ": " + p.label + " ring colour is the preset primary " + preset.primary + ", not the platform ring", o.color === preset.primary && o.color !== PLATFORM_RING);
      check(name + " / " + preset.id + ": " + p.label + " ring offset 2px and ≥ 3:1 contrast on the preset surface", o.offset === 2 && col && col.a === 1 && ratio >= 3);
      if (p.sel === ".cloze-input" || p.sel === ".vq-marker" || p.ring) await page.screenshot({ path: path.join(shots, name + "-" + preset.id + "-" + p.label.replace(/\s+/g, "-") + ".png"), fullPage: false });
    }
    // Remaining focusable controls of this exam (the hotspot "remove point" button and the second option) are skipped by the loop above.
  }
  let reached = false;
  for (let t = 0; t < 10 && !reached; t++) { await page.keyboard.press("Tab"); reached = await page.evaluate(() => document.activeElement?.getAttribute("data-probe") === "outside-eb-button"); }
  check(name + ": Tab reaches the reference button outside the exam root", reached);
  if (reached) {
    const o = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('[data-probe="outside-eb-button"]')); return { style: c.outlineStyle, width: parseFloat(c.outlineWidth), color: c.outlineColor }; });
    check(name + ": outside the exam the canonical 2px platform ring is unchanged (" + o.style + ", " + o.width + "px, " + o.color + ")", o.style === "solid" && o.width === 2 && o.color === PLATFORM_RING);
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
