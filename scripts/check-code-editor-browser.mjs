#!/usr/bin/env node
// Phase 17F-C1 — REAL-BROWSER validation of the professional code editor (Chromium through playwright-core).
//
// What it proves, in a production-mode build of browser-harness/code-editor.html served from a local, same-origin static server:
//   • the Monaco engine takes over from the native editor; Python / Java / C# each receive DIFFERENT language-aware highlighting
//     (keyword / number / string / comment colours read from the rendered DOM, compared with the theme in editorOptions.ts), and the
//     highlighting follows the SELECTED language, not the source (a Python source in Java mode loses its `def` keyword colour);
//   • NO suggestion / parameter-hint / ghost-text widget ever appears while typing common constructs or on Ctrl+Space, Tab indents;
//   • onChange carries exactly the typed source; the UTF-8 byte limit refuses an over-limit edit (alert, text reverted); read-only
//     cannot be typed into; Esc then Tab leaves the editor; Ctrl+F opens Find; a long line never widens the page;
//   • every network request is same-origin (no CDN / external service), the REAL app entry (dist/index.html) never requests the
//     Monaco / worker / grammar chunks, and a phone-sized touch context gets the native editor;
//   • switching languages repeatedly leaks no editor instances and raises no page error.
// It is an optional, explicit check (not part of `npm test`): it needs `playwright-core` (PLAYWRIGHT_CORE_DIR = a directory whose
// node_modules contains it; defaults to this repository) and a Chromium (CHROMIUM_PATH, else Playwright's own lookup). Run after
// `npm run build` so the real-app check can read dist/. Screenshots + a JSON report land in HARNESS_OUT (default: .harness-out/).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-out"));
const dist = path.join(root, "dist");
const results = [];
const check = (id, ok, detail = "") => { results.push({ id, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? " — " + detail : ""}`); };
const hexToRgb = h => `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
const themeSource = fs.readFileSync(path.join(root, "src/coding/editor/editorOptions.ts"), "utf8");
const themeColour = token => { const m = themeSource.match(new RegExp(`token: "${token}", foreground: "([0-9a-f]{6})"`)); if (!m) throw new Error("theme token missing: " + token); return hexToRgb(m[1]); };
const COLOUR = { keyword: themeColour("keyword"), number: themeColour("number"), string: themeColour("string"), comment: themeColour("comment"), plain: hexToRgb("1e293b") };
const SAMPLES = {
  python: "def main():\n    x = 5\n    print(x)\n",
  java: "public class Main {\n    public static void main(String[] args) {\n        int x = 5;\n        System.out.println(x);\n    }\n}\n",
  csharp: "public class Program {\n    public static void Main() {\n        int x = 5;\n        System.Console.WriteLine(x);\n    }\n}\n"
};

let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core is not installed. Point PLAYWRIGHT_CORE_DIR at a directory whose node_modules contains it (it is not a dependency of SmartAssess)."); process.exit(2); }

// 1. Production-mode build of the harness page (same Vite config, plugins and chunking as the real app) into HARNESS_OUT.
fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/code-editor.html") } } });

// 2. One same-origin static server: /app/* serves the real dist/, everything else the harness build.
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".webp": "image/webp" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; }
  // /app/* is the real dist/; its absolute /assets, /pwa and /manifest paths fall back to dist/ when the harness build lacks them.
  const candidates = u.pathname.startsWith("/app/") ? [[dist, u.pathname.slice(4)]] : [[out, u.pathname], [dist, u.pathname]];
  const found = candidates.map(([base, p]) => [base, path.join(base, decodeURIComponent(p))]).find(([base, f]) => f.startsWith(base) && fs.existsSync(f) && !fs.statSync(f).isDirectory());
  if (!found) { res.writeHead(404); res.end("not found"); return; }
  const file = found[1];
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const harnessUrl = origin + "/browser-harness/code-editor.html";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
const screens = path.join(out, "screens"); fs.mkdirSync(screens, { recursive: true });
const foreign = [], requested = [], pageErrors = [], consoleErrors = [];
const watch = page => {
  page.on("request", r => { requested.push(r.url()); if (!r.url().startsWith(origin)) foreign.push(r.url()); });
  page.on("pageerror", e => pageErrors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
};
const MAIN = '[data-testid="main-editor"]';
const tokens = (page, scope) => page.evaluate(sel => [...document.querySelectorAll(sel + " .view-lines .view-line")].flatMap(line => [...line.querySelectorAll('span[class*="mtk"]')].map(s => ({ text: s.textContent, color: getComputedStyle(s).color, weight: getComputedStyle(s).fontWeight }))), scope);
const colourOf = (toks, word) => toks.find(t => t.text.trim() === word)?.color;
const lineText = (page, scope) => page.evaluate(sel => [...document.querySelectorAll(sel + " .view-lines .view-line")].map(l => l.textContent.replace(/ /g, " ")), scope);
const waitTokens = async (page, scope, word, colour) => { await page.waitForFunction(([sel, w, c]) => [...document.querySelectorAll(sel + ' .view-lines span[class*="mtk"]')].some(s => s.textContent.trim() === w && getComputedStyle(s).color === c), [scope, word, colour], { timeout: 15000 }); };
const widgets = page => page.evaluate(() => ({
  suggest: [...document.querySelectorAll(".suggest-widget, .editor-widget.suggest-widget")].filter(e => e.offsetParent !== null || e.classList.contains("visible")).length,
  hints: [...document.querySelectorAll(".parameter-hints-widget")].filter(e => e.offsetParent !== null).length,
  ghost: document.querySelectorAll(".ghost-text, .ghost-text-decoration, .inline-edit, .suggest-preview-text").length
}));

try {
  // ——— A. the real app entry never downloads the editor engine (ED25 at runtime) ———————————————————————————————————————
  if (fs.existsSync(path.join(dist, "index.html"))) {
    const page = await browser.newPage(); watch(page);
    const before = requested.length;
    await page.goto(origin + "/app/index.html", { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1500);
    const appRequests = requested.slice(before);
    const leaked = appRequests.filter(u => /monacoEngine|editor\.worker|\/(python|java|csharp)-[^/]+\.js/.test(u));
    check("A1 real app entry (dist/index.html) requests no Monaco / worker / grammar chunk", leaked.length === 0 && appRequests.length > 0, `${appRequests.length} requests, leaked: ${leaked.join(", ") || "none"}`);
    await page.close();
  } else check("A1 real app entry (dist/index.html) requests no Monaco / worker / grammar chunk", false, "dist/ missing — run npm run build first");

  // ——— B. desktop: engine hand-over, highlighting per language —————————————————————————————————————————————————————————
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } }); watch(page);
  await page.goto(harnessUrl, { waitUntil: "load" });
  const paintedNative = await page.locator(`${MAIN} .cx-code-editor`).getAttribute("data-editor-engine");
  await page.waitForSelector(`${MAIN} [data-editor-engine="monaco"]`, { timeout: 30000 });
  check("B1 the native editor paints first and the Monaco engine takes over", paintedNative === "native" || paintedNative === "monaco", `first paint: ${paintedNative}`);
  const workerRequests = requested.filter(u => /editor\.worker/.test(u));
  check("B2 the editor worker is never fetched from elsewhere: not needed by any enabled feature (no request) or same-origin", workerRequests.every(u => u.startsWith(origin)), workerRequests.length ? workerRequests.join(", ") : "no worker request — every worker-backed feature (word suggestions, links, diff) is off");

  const seen = {};
  for (const [lang, keyword, marker] of [["python", "def", "def"], ["java", "public", "Main"], ["csharp", "public", "Program"]]) {
    await page.click(`button[data-language="${lang}"]`);
    await waitTokens(page, MAIN, keyword, COLOUR.keyword);
    await page.waitForFunction(([sel, w]) => [...document.querySelectorAll(sel + " .view-lines .view-line")].some(l => l.textContent.includes(w)), [MAIN, marker], { timeout: 15000 });
    await page.waitForTimeout(150);
    const toks = await tokens(page, MAIN);
    seen[lang] = toks;
    const ok = colourOf(toks, keyword) === COLOUR.keyword && colourOf(toks, "5") === COLOUR.number;
    const extra = lang === "python" ? ["main", "x"] : ["class", "static", "void", "int"];
    const extraOk = lang === "python" ? extra.every(w => colourOf(toks, w) && colourOf(toks, w) !== COLOUR.keyword) : extra.every(w => colourOf(toks, w) === COLOUR.keyword);
    check(`B3 ${lang}: keyword «${keyword}» = keyword colour, «5» = number colour, ${lang === "python" ? "identifiers not keyword-coloured" : "class / static / void / int keyword-coloured"}`, ok && extraOk, JSON.stringify(Object.fromEntries([keyword, "5", ...extra].map(w => [w, colourOf(toks, w)]))));
    await page.locator(MAIN).screenshot({ path: path.join(screens, `${lang}.png`) });
  }
  check("B4 the three languages produce three distinct token colourings (language-aware, not a generic colouring)", new Set(Object.values(seen).map(t => JSON.stringify(t.map(x => [x.text, x.color])))).size === 3);
  // strings and comments, typed by the user, per language
  for (const [lang, line, str, cmt] of [["python", 's = "hi"  # note', '"hi"', "# note"], ["java", 'String s = "hi"; // note', '"hi"', "// note"], ["csharp", 'string s = "hi"; // note', '"hi"', "// note"]]) {
    await page.click(`button[data-language="${lang}"]`);
    await waitTokens(page, MAIN, lang === "python" ? "def" : "public", COLOUR.keyword);
    await page.click(`${MAIN} .monaco-editor .view-lines`);
    await page.keyboard.press("Control+End");
    await page.keyboard.type(line);
    await page.waitForTimeout(300);
    const toks = await tokens(page, MAIN);
    const s = toks.filter(t => t.color === COLOUR.string).map(t => t.text).join(""), c = toks.filter(t => t.color === COLOUR.comment).map(t => t.text).join("");
    check(`B5 ${lang}: a typed string is string-coloured and a typed comment is comment-coloured`, s.includes(str.replace(/"/g, "")) && c.replace(/ /g, " ").includes(cmt), `string tokens «${s}», comment tokens «${c}»`);
  }
  // highlighting follows the selected LANGUAGE, not the source: keep the Python text, switch the mode to Java
  await page.click('button[data-language="python"]');
  await waitTokens(page, MAIN, "def", COLOUR.keyword);
  await page.click('button[data-action="switch-keep"]');
  // In Java mode «def» is an identifier: Monaco merges it with its neighbours into one plain-coloured span, so the keyword-coloured
  // «def» span must DISAPPEAR while a span starting with «def» (plain colour) remains.
  await page.waitForFunction(([sel, c]) => { const spans = [...document.querySelectorAll(sel + ' .view-lines span[class*="mtk"]')]; return !spans.some(x => x.textContent.trim() === "def" && getComputedStyle(x).color === c) && spans.some(x => x.textContent.startsWith("def") && getComputedStyle(x).color !== c); }, [MAIN, COLOUR.keyword], { timeout: 15000 });
  const kept = await page.evaluate(() => window.__harness.value());
  const defNow = await page.evaluate(sel => { const s = [...document.querySelectorAll(sel + ' .view-lines span[class*="mtk"]')].find(x => x.textContent.startsWith("def")); return s && getComputedStyle(s).color; }, MAIN);
  check("B6 switching the language keeps the source byte-identical and re-highlights it for the NEW language («def» is no keyword in Java)", kept === SAMPLES.python && (await page.evaluate(() => window.__harness.language())) === "java" && defNow === COLOUR.plain, `language=${await page.evaluate(() => window.__harness.language())}, «def» colour now ${defNow}`);

  // ——— C. no autocomplete while typing, on Ctrl+Space, on Tab (ED11–ED19) ——————————————————————————————————————————————
  await page.click('button[data-language="python"]');
  await waitTokens(page, MAIN, "def", COLOUR.keyword);
  await page.click(`${MAIN} .monaco-editor .view-lines`);
  await page.keyboard.press("Control+End");
  const changesBefore = await page.evaluate(() => window.__harness.changes.length);
  await page.keyboard.type("pri"); await page.waitForTimeout(700);
  const w1 = await widgets(page);
  await page.keyboard.press("Control+Space"); await page.waitForTimeout(500);
  const w2 = await widgets(page);
  await page.keyboard.type("("); await page.waitForTimeout(200);
  const w3 = await widgets(page);
  const afterParen = (await lineText(page, MAIN)).at(-1);
  await page.keyboard.press("Tab"); await page.waitForTimeout(200);
  await page.keyboard.type("x"); await page.waitForTimeout(200);
  const afterTab = (await lineText(page, MAIN)).at(-1);
  await page.keyboard.press("End"); await page.keyboard.press("Enter");
  await page.keyboard.type("Sys."); await page.waitForTimeout(700);
  const w4 = await widgets(page);
  const typedLines = await lineText(page, MAIN);
  const noWidget = [w1, w2, w3, w4].every(w => w.suggest === 0 && w.hints === 0 && w.ghost === 0);
  check("C1 no suggest widget, parameter hints or ghost text while typing «pri», after Ctrl+Space, after «(» or after «Sys.»", noWidget, JSON.stringify([w1, w2, w3, w4]));
  check("C2 «(» auto-closes to «()» and Tab inserts the 4-space indent (no completion is accepted)", afterParen === "pri()" && afterTab === "pri(    x)", JSON.stringify({ afterParen, afterTab, last: typedLines.slice(-2) }));
  check("C3 the DOM carries no completion machinery at all", (await page.evaluate(() => document.querySelectorAll(".suggest-widget, .parameter-hints-widget").length)) === 0);
  const value = await page.evaluate(() => window.__harness.value());
  const changes = await page.evaluate(() => window.__harness.changes.length);
  check("C4 onChange delivered exactly the typed source (ED20) — one change per keystroke, nothing inserted by the editor", value === SAMPLES.python + "pri(    x)\nSys." && changes > changesBefore, JSON.stringify(value));
  const aria = await page.evaluate(sel => { const t = document.querySelector(sel + " textarea.inputarea"); return t && { role: t.getAttribute("role"), label: t.getAttribute("aria-label"), autocomplete: t.getAttribute("aria-autocomplete"), describedby: !!t.getAttribute("aria-describedby") && !!document.getElementById(t.getAttribute("aria-describedby")) }; }, MAIN);
  check("C5 the input is a labelled multiline textbox that announces NO autocomplete and is described by the on-screen hint", aria && aria.role === "textbox" && aria.label === "محرر الكود" && aria.autocomplete === "none" && aria.describedby, JSON.stringify(aria));

  // ——— D. keyboard escape, find, long line, byte limit, read-only ——————————————————————————————————————————————————————
  await page.keyboard.press("Escape"); await page.keyboard.press("Tab"); await page.waitForTimeout(100);
  const activeOutside = await page.evaluate(sel => !document.activeElement.closest(sel + " .monaco-editor"), MAIN);
  check("D1 Esc then Tab moves focus OUT of the editor (no keyboard trap, ED31)", activeOutside);
  await page.click(`${MAIN} .monaco-editor .view-lines`);
  await page.keyboard.press("Tab"); await page.waitForTimeout(100);
  check("D2 after re-entering, Tab indents again (focus stays in the editor)", await page.evaluate(sel => !!document.activeElement.closest(sel + " .monaco-editor"), MAIN));
  await page.keyboard.press("Control+f"); await page.waitForTimeout(300);
  check("D3 Ctrl+F opens the Find widget (ED10)", (await page.locator(`${MAIN} .find-widget.visible`).count()) === 1);
  await page.keyboard.press("Escape"); await page.waitForTimeout(100);
  await page.click(`${MAIN} .monaco-editor .view-lines`); await page.keyboard.press("Control+End"); await page.keyboard.press("Enter");
  await page.keyboard.type("y = " + "1 + ".repeat(80) + "1"); await page.waitForTimeout(300);
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  check("D4 a 300+ character line scrolls INSIDE the editor; the page does not widen (ED33)", width.scroll <= width.client, JSON.stringify(width));
  const LIM = '[data-testid="limited-editor"]';
  await page.click(`${LIM} .monaco-editor .view-lines`); await page.keyboard.press("Control+End");
  await page.keyboard.type("🎉"); await page.waitForTimeout(300);                                     // 3 + 4 = 7 bytes ≤ 8: accepted
  const limText0 = (await lineText(page, LIM)).join("\n");
  await page.keyboard.type("é"); await page.waitForTimeout(400);                                       // 7 + 2 = 9 bytes > 8: refused
  const limAlert = await page.locator(`${LIM} [role="alert"]`).textContent().catch(() => "");
  const limText1 = (await lineText(page, LIM)).join("\n");
  await page.keyboard.press("Backspace"); await page.waitForTimeout(300);                              // "abc" again (3 bytes): accepted
  await page.keyboard.type("é"); await page.waitForTimeout(300);                                       // 3 + 2 = 5 bytes: accepted
  const limText2 = (await lineText(page, LIM)).join("\n"), limAlert2 = await page.locator(`${LIM} [role="alert"]`).count();
  check("D5 the UTF-8 byte limit (8 bytes) accepts «🎉» (7), refuses «é» (9: Arabic alert, text reverted) and accepts again after Backspace (ED22)", limText0 === "abc🎉" && /الحد الأقصى/.test(limAlert || "") && limText1 === "abc🎉" && limText2 === "abcé" && limAlert2 === 0, JSON.stringify({ limText0, limAlert, limText1, limText2, limAlert2 }));
  const RO = '[data-testid="readonly-editor"]';
  await page.click(`${RO} .monaco-editor .view-lines`); await page.keyboard.type("zzz"); await page.waitForTimeout(200);
  check("D6 a read-only editor cannot be typed into (ED24)", (await lineText(page, RO)).join("\n") === "x = 1\n", JSON.stringify(await lineText(page, RO)));

  // ——— E. disposal under repeated switching, privacy, errors ———————————————————————————————————————————————————————————
  for (let i = 0; i < 12; i++) { await page.click(`button[data-language="${["python", "java", "csharp"][i % 3]}"]`); await page.waitForTimeout(40); }
  await page.waitForTimeout(500);
  check("E1 after 12 rapid language switches exactly three editor instances exist (one per CodingEditor) — no leak", (await page.locator(".monaco-editor:not(.rename-box)").count()) === 3 && (await page.evaluate(() => document.querySelectorAll(".cx-code-rich").length)) === 3);
  check("E2 every network request was same-origin: no CDN, no external editor service (ED34)", foreign.length === 0, foreign.slice(0, 5).join(", ") || `${requested.length} same-origin requests`);
  check("E3 no uncaught page error and no console error", pageErrors.length === 0 && consoleErrors.length === 0, [...pageErrors, ...consoleErrors].slice(0, 3).join(" | "));
  await page.close();

  // ——— F. phone-sized touch device: the native editor, no engine download ————————————————————————————————————————————
  const ctx = await browser.newContext({ viewport: { width: 375, height: 720 }, hasTouch: true, isMobile: true });
  const phone = await ctx.newPage();
  const phoneRequests = [];
  phone.on("request", r => phoneRequests.push(r.url()));
  await phone.goto(harnessUrl, { waitUntil: "networkidle" });
  await phone.waitForTimeout(800);
  const engineOnPhone = await phone.locator(`${MAIN} .cx-code-editor`).getAttribute("data-editor-engine");
  const phoneWidth = await phone.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  check("F1 a 375px touch viewport keeps the native editor and never requests the engine chunk", engineOnPhone === "native" && !phoneRequests.some(u => /monacoEngine|editor\.worker/.test(u)), `engine=${engineOnPhone}, requests=${phoneRequests.length}`);
  check("F2 the phone page does not overflow horizontally", phoneWidth.scroll <= phoneWidth.client, JSON.stringify(phoneWidth));
  await phone.locator(MAIN).screenshot({ path: path.join(screens, "phone-native.png") });
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ origin, results, requests: requested.length, foreign, pageErrors, consoleErrors }, null, 2));
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length} / ${results.length} browser checks passed; screenshots + report.json in ${out}`);
if (failed.length) process.exit(1);
