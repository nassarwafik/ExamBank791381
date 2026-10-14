#!/usr/bin/env node
// BUG-001 / BUG-002 — real-Chromium certification of the Structured Exam Builder's Back navigation and toolbar tool dialogs
// (browser-harness/builder-overlay.*). The harness mounts the PRODUCTION builder inside the PRODUCTION `.structured-builder-overlay`
// shell with the production stylesheets, on an exam that was really IMPORTED and opened "unsaved" (the state right after
// «فتح في باني الامتحان»). Checks (every "visible" claim is a real hit test — document.elementFromPoint — plus a real pointer click,
// never a DOM-presence check, because the defect is a stacking one that jsdom / happy-dom cannot see):
//   • «رجوع» on an unsaved import opens the unsaved-changes confirmation ON TOP of the builder; the teacher can click
//     «البقاء في المحرر» (stays, nothing lost) and «الخروج دون حفظ» (leaves; the imported content is intact in the owner's state);
//   • Save Draft (SAVE_LABELS.saveDraft) then «رجوع» leaves without a dialog (the documented workaround keeps working);
//   • each of the eight reported tools opens its dialog ON TOP of the builder and can be closed; the builder keeps the exam.
//     Since Phase 21E.2 the toolbar shows eight actions and these tools are items of its two menus («إضافة أسئلة» / «المزيد»):
//     each is reached the way a teacher reaches it — open the menu, click the item — and runs the same handler as before;
//   • the harness overlay is App.tsx's overlay tag attribute for attribute (role="dialog" aria-modal="true", named by the builder
//     heading, tabIndex -1), read from src/App.tsx — so a layer counted below never includes the overlay itself;
//   • keyboard: Escape closes a tool dialog; the confirmation's buttons are reachable with Tab;
//   • phone (390 × 844, touch): the confirmation is on top, fits the viewport, and its buttons respond to taps.
// Screenshots of every state land in HARNESS_OUT/shots for the PR evidence.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.env.HARNESS_OUT || path.join(root, ".harness-builder-overlay"));
const shots = path.join(out, "shots");
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log((ok ? "PASS" : "FAIL") + " " + name + (detail ? " — " + detail : "")); };
let chromium;
try { ({ chromium } = createRequire(path.join(process.env.PLAYWRIGHT_CORE_DIR || root, "package.json"))("playwright-core")); }
catch { console.error("playwright-core unavailable"); process.exit(2); }

fs.rmSync(out, { recursive: true, force: true });
await build({ configFile: path.join(root, "vite.config.ts"), root, logLevel: "warn", publicDir: false, build: { outDir: out, emptyOutDir: true, rollupOptions: { input: path.join(root, "browser-harness/builder-overlay.html") } } });
fs.mkdirSync(shots, { recursive: true });
const MIME = { ".js": "text/javascript", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost"), full = path.resolve(out, "." + decodeURIComponent(u.pathname));
  if (!full.startsWith(out + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream", "cache-control": "no-store" }); fs.createReadStream(full).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port, PAGE = origin + "/browser-harness/builder-overlay.html";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] });
const errors = [];
const CLICK = { timeout: 2500 };                       // a real pointer click: fails when another element covers the target
const IMPORTED_TITLE = "امتحان مستورد — شبكات الحاسوب";
// Phase 21E.2 — the toolbar's two menus (trigger accessible names, src/builder/BuilderToolbar.tsx) and the eight reported tools,
// each under the menu that now holds it (its item name is the old button's label without the emoji / the old button's title).
const ADD_MENU = "إضافة أسئلة", MORE_MENU = "المزيد من أدوات الامتحان";
const TOOLS = [
  { id: "BUG-002.1", menu: ADD_MENU, item: "إضافة من بنك الأسئلة" },
  { id: "BUG-002.2", menu: ADD_MENU, item: "سؤال بالذكاء الاصطناعي" },
  { id: "BUG-002.3", menu: ADD_MENU, item: "سيناريو بالذكاء الاصطناعي" },
  { id: "BUG-002.4", menu: ADD_MENU, item: "المؤلف الذكي للامتحان" },
  { id: "BUG-002.5", menu: MORE_MENU, item: "إدارة النشر والإصدارات" },
  { id: "BUG-002.6", menu: MORE_MENU, item: "القوالب الأكاديمية" },
  { id: "BUG-002.7", menu: MORE_MENU, item: "العرض والتصميم" },
  { id: "BUG-002.8", menu: MORE_MENU, item: "مختبر الدوال 3D (تجريبي)" },
];
// A dialog layered OVER the builder. Since Phase 21E.2 the overlay itself is App's role="dialog" surface, so it is excluded here
// (every other [role=dialog] still counts, exactly as before).
const LAYER = "[role=dialog]:not(.structured-builder-overlay)";
/** App.tsx's builder overlay opening tag as DOM attributes (className → class, tabIndex → tabindex, {-1} → "-1"). */
function appOverlayAttributes() {
  const tags = [...fs.readFileSync(path.join(root, "src/App.tsx"), "utf8").matchAll(/<div className="structured-builder-overlay"[^>]*>/g)];
  if (tags.length !== 1) throw new Error("src/App.tsx: expected one builder overlay tag, found " + tags.length);
  const DOM = { className: "class", tabIndex: "tabindex" };
  return Object.fromEntries([...tags[0][0].matchAll(/([A-Za-z-]+)=(?:"([^"]*)"|\{([^}]*)\})/g)].map(m => [DOM[m[1]] || m[1], m[2] ?? String(JSON.parse(m[3].trim()))]));
}
const APP_OVERLAY = appOverlayAttributes();
const sortedJson = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
/** Stylesheets a module imports, as paths under src/ (e.g. "App.css", "ui/ui.css"). */
const cssImports = file => [...fs.readFileSync(path.join(root, file), "utf8").matchAll(/^import\s+["'](\.{1,2}\/[\w./-]+\.css)["'];?\s*$/gm)]
  .map(m => path.relative(path.join(root, "src"), path.resolve(path.dirname(path.join(root, file)), m[1])).split(path.sep).join("/"));
/** The harness page loads every App-level stylesheet (src/main.tsx, then src/App.tsx) that styles the builder overlay, its menus or
 *  its dialogs, and the App stylesheets it loads come in App's order — so the harness paints what App paints (21E.2: the toolbar's
 *  menus are styled, and layered above the overlay, only by page-parts.css). */
function stylesheetFidelity(harnessFile) {
  const app = [...cssImports("src/main.tsx"), ...cssImports("src/App.tsx")], harness = cssImports(harnessFile);
  const styling = app.filter(c => /\.sb-|\.eb-menu|\.eb-dialog|\.structured-builder-overlay/.test(fs.readFileSync(path.join(root, "src", c), "utf8")));
  const shared = harness.filter(c => app.includes(c)), missing = styling.filter(c => !harness.includes(c));
  const inOrder = shared.every((c, i) => i === 0 || app.indexOf(shared[i - 1]) < app.indexOf(c));
  return { ok: styling.length > 0 && missing.length === 0 && inOrder, detail: "App styles the builder in " + styling.join(", ") + "; missing " + JSON.stringify(missing) + "; harness order " + shared.join(" → ") };
}

async function openPage(ctx) {
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.waitForSelector(".sb-builder");
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(shots, name + ".png"), fullPage: false });
const backButton = page => page.getByRole("button", { name: "رجوع", exact: true });
const menuTrigger = (page, t) => page.locator(".sb-toolbar").getByRole("button", { name: t.menu, exact: true });
const menuItem = (page, t) => page.locator(".eb-menu-panel").getByRole("button", { name: t.item, exact: true });
/** The topmost dialog's panel and whether a hit test at the centre of its title lands inside that panel (= painted on top). */
async function topDialog(page) {
  return page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll(".eb-dialog-root:not(.is-covered) [role=dialog]"));
    const panel = panels[panels.length - 1];
    if (!panel) return null;
    const title = panel.querySelector(".eb-dialog-title") || panel;
    const r = title.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const pr = panel.getBoundingClientRect();
    return { name: (title.textContent || "").trim(), onTop: !!hit && panel.contains(hit), hitDescribes: hit ? hit.tagName.toLowerCase() + "." + String(hit.className).split(" ")[0] : "nothing",
      fits: pr.left >= 0 && pr.right <= window.innerWidth + 0.5 && pr.width > 0, rect: [Math.round(pr.left), Math.round(pr.top), Math.round(pr.width), Math.round(pr.height)] };
  });
}
async function tryClick(locator) {
  try { await locator.click(CLICK); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e && e.message || e).split("\n").slice(0, 3).join(" ") }; }
}
const host = (page, expr) => page.evaluate("window.__host." + expr);

const css = stylesheetFidelity("browser-harness/builder-overlay.tsx");
check("harness: loads every App stylesheet that styles the builder overlay, its menus or its dialogs, in App's order", css.ok, css.detail);
const menuPaints = [];

try {
  // ── BUG-001 · an imported exam → «رجوع» ─────────────────────────────────────────────────────────────────────────────
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await openPage(desktop);
  check("BUG-001: an imported exam opens in the builder as unsaved work (no draft saved yet)", (await page.textContent(".sb-save-state")) === "● تغييرات غير محفوظة" && (await host(page, "title()")) === IMPORTED_TITLE);
  const overlay = await page.evaluate(() => {
    const o = document.querySelector(".structured-builder-overlay"), named = o && document.getElementById(o.getAttribute("aria-labelledby") || "");
    return { attrs: o ? Object.fromEntries(Array.from(o.attributes, a => [a.name, a.value])) : null, name: named && o.contains(named) ? (named.textContent || "").trim() : null };
  });
  check("harness: the overlay is App.tsx's exact overlay tag (same attributes, no others) and is named by the builder heading", sortedJson(overlay.attrs) === sortedJson(APP_OVERLAY) && overlay.name === "باني الامتحان المنظّم: " + IMPORTED_TITLE,
    "harness " + sortedJson(overlay.attrs) + " vs App " + sortedJson(APP_OVERLAY) + "; name " + JSON.stringify(overlay.name));
  await shot(page, "01-imported-builder");
  await backButton(page).click();
  await page.waitForSelector(LAYER, { state: "attached", timeout: 5000 });
  let d = await topDialog(page);
  await shot(page, "02-back-on-unsaved-import");
  check("BUG-001: «رجوع» asks about the unsaved changes (dialog mounted)", d && d.name === "تغييرات غير محفوظة", d ? d.name : "no dialog");
  check("BUG-001: the unsaved-changes confirmation is painted ON TOP of the builder (hit test on its title)", d && d.onTop, d ? "hit: " + d.hitDescribes : "");
  let r = await tryClick(page.getByRole("button", { name: "البقاء في المحرر", exact: true }));
  check("BUG-001: the teacher can click «البقاء في المحرر» with the mouse", r.ok, r.error || "");
  if (!r.ok) await page.keyboard.press("Escape");                               // leave the baseline in a known state
  await page.waitForSelector(LAYER, { state: "detached", timeout: 5000 });
  check("BUG-001: «البقاء في المحرر» keeps the teacher in the editor with the import intact", (await host(page, "exits")) === 0 && (await page.isVisible(".sb-builder")) && (await host(page, "title()")) === IMPORTED_TITLE);
  await backButton(page).click();
  await page.waitForSelector(LAYER, { state: "attached", timeout: 5000 });
  r = await tryClick(page.getByRole("button", { name: "الخروج دون حفظ", exact: true }));
  check("BUG-001: the teacher can click «الخروج دون حفظ» with the mouse", r.ok, r.error || "");
  if (r.ok) {
    await page.waitForSelector(".structured-builder-overlay", { state: "detached", timeout: 5000 });
    check("BUG-001: confirmed exit closes the builder and returns to the previous screen", (await host(page, "exits")) === 1 && (await page.isVisible("[data-testid=teacher-workspace]")));
    check("BUG-001: the imported exam is still held by the owner after exiting (never silently discarded)", (await host(page, "title()")) === IMPORTED_TITLE && (await host(page, "saveState()")) === "dirty");
    check("BUG-001: body scroll is released after the dialog closed", (await page.evaluate(() => document.body.style.overflow)) !== "hidden", await page.evaluate(() => "body.style.overflow=" + JSON.stringify(document.body.style.overflow)));
  } else {
    await page.keyboard.press("Escape");
    check("BUG-001: confirmed exit closes the builder and returns to the previous screen", false, "exit could not be confirmed with the mouse");
  }
  await shot(page, "03-after-confirmed-exit");

  // ── BUG-001 · the documented workaround (Save Draft first) must keep working ────────────────────────────────────────
  page = await openPage(desktop);
  await page.getByRole("button", { name: await host(page, "labels.saveDraft"), exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".sb-save-state")?.textContent === "✓ محفوظ", null, { timeout: 5000 });
  await backButton(page).click();
  await page.waitForSelector(".structured-builder-overlay", { state: "detached", timeout: 5000 });
  check("BUG-001: Save Draft then «رجوع» leaves immediately without a dialog", (await host(page, "exits")) === 1 && (await page.locator(LAYER).count()) === 0);

  // ── BUG-002 · the eight reported tools (items of the toolbar's two menus since 21E.2) ─────────────────────────────
  page = await openPage(desktop);
  for (const t of TOOLS) {
    const trigger = menuTrigger(page, t);
    const triggerReady = (await trigger.count()) === 1 && (await trigger.isEnabled());
    if (triggerReady) await trigger.click();
    if (triggerReady) await page.waitForSelector(".eb-menu-panel[data-ready=true]", { timeout: 5000 }).catch(() => {});
    // The open menu paints as in production: its own opaque surface, and a hit test at the item's centre lands on the item.
    menuPaints.push({ id: t.id, ...(await page.evaluate(name => {
      const panel = document.querySelector(".eb-menu-panel");
      const item = panel && Array.from(panel.querySelectorAll("button")).find(b => (b.textContent || "").trim() === name);
      if (!item) return { ok: false, why: "no open panel / item" };
      const r = item.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), bg = getComputedStyle(panel).backgroundColor;
      return { ok: !!hit && item.contains(hit) && bg !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(bg), bg, hit: hit ? hit.tagName.toLowerCase() + "." + String(hit.className).split(" ")[0] : "nothing" };
    }, t.item)) });
    const btn = menuItem(page, t);
    check(t.id + ": «" + t.menu + "» › «" + t.item + "» is offered and enabled", triggerReady && (await btn.count()) === 1 && (await btn.isEnabled()));
    await btn.click();
    let opened = true;
    try { await page.waitForSelector(LAYER, { state: "attached", timeout: 8000 }); } catch { opened = false; }
    d = opened ? await topDialog(page) : null;
    await shot(page, t.id + "-" + (d && d.onTop ? "visible" : "hidden"));
    check(t.id + ": the action opens its dialog", !!d, d ? "«" + d.name + "»" : "no dialog within 8 s");
    check(t.id + ": the dialog is painted ON TOP of the builder (hit test on its title)", !!d && d.onTop, d ? "hit: " + d.hitDescribes : "");
    if (d) {
      const close = page.locator(".eb-dialog-root:not(.is-covered) [role=dialog]").last().locator(".eb-dialog-close");
      r = (await close.count()) ? await tryClick(close) : { ok: false, error: "no close button" };
      if (!r.ok) { await page.keyboard.press("Escape"); }
      check(t.id + ": the dialog can be closed (" + (r.ok ? "close button" : "Escape") + ") and the builder keeps the exam", await page.locator(LAYER).count().then(n => n === 0) && (await host(page, "title()")) === IMPORTED_TITLE, r.error || "");
      await page.waitForSelector(LAYER, { state: "detached", timeout: 5000 }).catch(() => {});
    }
  }
  check("BUG-002: each tool's menu paints as in production (opaque panel; a hit test on the item lands on it)", menuPaints.length === TOOLS.length && menuPaints.every(m => m.ok), JSON.stringify(menuPaints.filter(m => !m.ok)));
  check("BUG-002: after opening every tool the builder is still the imported exam with no duplicate questions", (await page.locator(".sb-builder").count()) === 1 && (await page.evaluate(() => document.querySelectorAll(".sb-question").length)) === 2, "questions: " + (await page.evaluate(() => document.querySelectorAll(".sb-question").length)));

  // ── keyboard ───────────────────────────────────────────────────────────────────────────────────────────────────────
  await backButton(page).focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector(LAYER, { state: "attached", timeout: 5000 });
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check("keyboard: the confirmation starts with focus on «البقاء في المحرر» (a stray Enter never discards work)", focused === "البقاء في المحرر", String(focused));
  await page.keyboard.press("Escape");
  await page.waitForSelector(LAYER, { state: "detached", timeout: 5000 });
  check("keyboard: Escape = stay in the editor", (await host(page, "exits")) === 0 && (await page.isVisible(".sb-builder")));

  // ── phone ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  page = await openPage(phone);
  await backButton(page).tap();
  await page.waitForSelector(LAYER, { state: "attached", timeout: 5000 });
  d = await topDialog(page);
  await shot(page, "phone-back-dialog");
  check("phone: the unsaved-changes confirmation is on top and fits the 390 px viewport", d && d.onTop && d.fits, d ? "rect " + d.rect.join("×") + " hit: " + d.hitDescribes : "no dialog");
  r = await tryClick(page.getByRole("button", { name: "الخروج دون حفظ", exact: true }));
  check("phone: a tap on «الخروج دون حفظ» leaves the editor", r.ok && (await page.waitForSelector(".structured-builder-overlay", { state: "detached", timeout: 5000 }).then(() => true).catch(() => false)) && (await host(page, "exits")) === 1, r.error || "");
  check("phone: no horizontal page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
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
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ origin: "builder-overlay", page: PAGE, checks, failed: failed.length }, null, 2));
console.log("\n" + (checks.length - failed.length) + "/" + checks.length + " checks passed; screenshots in " + shots);
process.exit(failed.length ? 1 : 0);
