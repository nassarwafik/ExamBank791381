import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser, startRuntimeServer, browserPackages, productionIframeSandbox, findChromium, APP_SECRET, APP_COOKIE, TEACHER_SECRET, HOST_INSTANCE_ID } from "./fixtures/smartsim-browser.js";
import { reactDistPackage } from "./fixtures/smartsim-zip.js";
import { runtimeHandler } from "../src/functions/simulators.js";

// Phase 16B-A — Independent Review Fix: REAL-BROWSER proof of the SmartSim isolation boundary (headless Chromium over the
// DevTools protocol). Packages are uploaded through the production upload handler and served over real HTTP by the
// production runtime handler + header builder; the host page frames them with the production iframe sandbox tokens.
//   B1 single-file bridge · B2 multi-file (classic JS + CSS + image) · B3 Vite-shaped module graph (+ the React fixture)
//   B4 direct top-level navigation (HTML and SVG) keeps an opaque origin with no application storage / cookies
//   B5 popup / top / parent navigation / form submission / network escapes stay blocked, framed and top-level.
// page.close() resolves only once Chromium has dropped the target (see smartsim-browser-lifecycle.test.js), so B5's page
// count / exact page-target set can never include a page still closing from the previous test (main run 36835689459).
// Fail-first on the reviewed head 6d8e22a (RF1: B4 leaks; RF2: B2/B3 sub-resources blocked).
// A browser is REQUIRED in CI (CI=true) and when SMARTSIM_REQUIRE_BROWSER=1; elsewhere the suite is skipped only when no
// Chromium / Chrome binary exists at all (the skip is reported, never silent).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REQUIRE_BROWSER = !!process.env.CI || process.env.SMARTSIM_REQUIRE_BROWSER === "1";
const EXE = findChromium();
const sleep = ms => new Promise(r => setTimeout(r, ms));

describe("browser availability", () => {
  it(REQUIRE_BROWSER ? "a Chromium / Chrome binary is available (required here)" : "a Chromium / Chrome binary is available (optional locally; the proof suite is skipped without one)", () => {
    if (REQUIRE_BROWSER) expect(EXE, "no Chromium / Chrome found — set SMARTSIM_CHROME_PATH").toBeTruthy();
    else if (!EXE) console.warn("[smartsim-browser] no Chromium / Chrome found: real-browser isolation proof SKIPPED");
  });
});

const d = EXE ? describe : describe.skip;
d("real-browser SmartSim isolation (Chromium, production headers over HTTP)", () => {
  let browser, server;
  beforeAll(async () => {
    browser = await launchBrowser();
    server = await startRuntimeServer({ ...browserPackages(), react: reactDistPackage() });
    console.info("[smartsim-browser] " + browser.product + " — " + browser.exe);
  }, 60000);
  afterAll(async () => { if (browser) await browser.close(); if (server) await server.close(); });

  const STATE = "(() => { const m = (window.__msgs || []).find(x => x.fromFrame && x.data && x.data.type === 'SMARTSIM_STATE_CHANGED'); return m ? JSON.stringify(m) : null; })()";
  async function framed(key, savedState = null, timeout = 8000, weakFrame = false) {
    const page = await browser.newPage();
    await page.goto(server.hostUrl(server.packages[key], "index.html", savedState, weakFrame));
    const raw = await page.waitFor(STATE, timeout);
    const msgs = JSON.parse(await page.eval("JSON.stringify(window.__msgs || [])"));
    return { page, state: raw ? JSON.parse(raw) : null, msgs };
  }
  const evidence = page => JSON.stringify({ blocked: page.failures, console: page.console.slice(-4) });

  it("M8 guard — the browser sees EXACTLY the production runtime headers (the harness serves through runtimeHandler and never sets a header itself)", async () => {
    const src = fs.readFileSync(path.join(repo, "api/tests/fixtures/smartsim-browser.js"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(src).toMatch(/import \{ uploadHandler, runtimeHandler \} from "\.\.\/\.\.\/src\/functions\/simulators\.js"/);
    expect(src).not.toMatch(/Content-Security-Policy|Cross-Origin-Resource-Policy|Access-Control-Allow-Origin|X-Content-Type-Options|setHeader\("Cache-Control/);
    const cases = [["probe", "index.html"], ["probe", "probe.svg"], ["multi", "app.js"], ["multi", "style.css"], ["multi", "img/pic.png"], ["vite", "assets/index-Bx7rT2aQ.js"]];
    for (const [key, asset] of cases) {
      const url = server.runtimeUrl(server.packages[key], asset);
      const res = await fetch(url);
      const p = server.packages[key];
      const direct = await runtimeHandler({ method: "GET", url, headers: new Headers(), params: { packageId: p.packageId, packageVersion: String(p.packageVersion), hash: p.packageHash.slice(7), assetPath: asset } }, server.deps);
      expect(res.status, asset).toBe(200);
      for (const [k, v] of Object.entries(direct.headers)) expect(res.headers.get(k), key + "/" + asset + " " + k).toBe(v);
    }
  });

  it("the host frames packages with the PRODUCTION sandbox tokens (allow-scripts only)", () => {
    expect(productionIframeSandbox()).toBe("allow-scripts");
  });

  it("B1 — single-file package (inline JS) runs inside sandbox=\"allow-scripts\": READY → INIT → STATE_CHANGED with the host's instanceId; the frame is an opaque origin with no application storage / cookies / parent DOM", async () => {
    const { page, state, msgs } = await framed("probe", { count: 2 });
    try {
      expect(state, evidence(page)).not.toBeNull();
      const ready = msgs.find(m => m.fromFrame && m.data.type === "SMARTSIM_READY");
      expect(ready.origin).toBe("null");                                                             // postMessage origin of an opaque frame
      expect(state.data.instanceId).toBe(HOST_INSTANCE_ID);
      expect(state.data.payload.state.count).toBe(3);                                                // restored savedState 2 → +1
      const probe = state.data.payload.state.probe;
      expect(probe.origin.value).toBe("null");
      for (const k of ["localStorage", "sessionStorage", "cookie", "parentDom"]) expect(probe[k].ok, k + " " + JSON.stringify(probe[k])).toBe(false);
      expect(JSON.stringify(probe)).not.toMatch(new RegExp([APP_SECRET, APP_COOKIE, TEACHER_SECRET].join("|")));
      // the host page really holds the secrets the frame could not reach
      expect(await page.eval("localStorage.getItem('app-token')")).toBe(APP_SECRET);
      expect(await page.eval("document.cookie")).toContain(APP_COOKIE);
    } finally { await page.close(); }
  }, 30000);

  it("B2 — multi-file package: classic external JS, external CSS and an image all load and execute inside the opaque-origin sandbox", async () => {
    const { page, state } = await framed("multi");
    try {
      expect(state, "multi-file package never reported (sub-resources blocked?) " + evidence(page)).not.toBeNull();
      expect(state.data.payload.state).toEqual({ script: true, cssWidth: "123px", imgWidth: 1, imgComplete: true });
      expect(page.failures.filter(f => f.url.includes("/api/simulators/runtime/")), evidence(page)).toEqual([]);
    } finally { await page.close(); }
  }, 30000);

  it("B3 — Vite-shaped dist: crossorigin module entry, static chunk import, dynamic import() and crossorigin CSS all load and execute; the repository React fixture's module script runs and posts READY", async () => {
    const { page, state } = await framed("vite");
    try {
      expect(state, "Vite-style module graph never reported " + evidence(page)).not.toBeNull();
      expect(state.data.payload.state).toEqual({ chunk: "chunk-ok", lazy: "lazy-ok", cssWidth: "77px" });
      expect(page.failures.filter(f => f.url.includes("/api/simulators/runtime/")), evidence(page)).toEqual([]);
    } finally { await page.close(); }
    const react = await browser.newPage();
    try {
      await react.goto(server.hostUrl(server.packages.react));
      const ready = await react.waitFor("(window.__msgs || []).some(m => m.fromFrame && m.data && m.data.type === 'SMARTSIM_READY')", 8000);
      expect(ready, "React fixture module never executed " + evidence(react)).toBe(true);
      expect(react.failures.filter(f => f.url.includes("/api/simulators/runtime/")), evidence(react)).toEqual([]);
    } finally { await react.close(); }
  }, 40000);

  it("B4 — DIRECT top-level navigation to the runtime HTML entry: scripts run, but the document is an opaque origin with no application localStorage / sessionStorage / cookies / IndexedDB", async () => {
    const seed = await browser.newPage();
    await seed.goto(server.hostUrl(server.packages.probe));
    expect(await seed.eval("localStorage.getItem('app-token')")).toBe(APP_SECRET);                // the origin really holds the secrets
    await seed.close();
    const page = await browser.newPage();
    try {
      await page.goto(server.runtimeUrl(server.packages.probe, "index.html"));
      const raw = await page.waitFor("document.body && document.body.getAttribute('data-probe')", 8000);
      expect(raw, "probe script did not run top-level " + evidence(page)).toBeTruthy();
      const probe = JSON.parse(raw);
      expect(probe.framed).toBe(false);
      expect(probe.origin.value, "direct navigation must NOT run with the application origin").toBe("null");
      expect(await page.eval("self.origin")).toBe("null");
      for (const k of ["localStorage", "sessionStorage", "cookie", "indexedDB"]) expect(probe[k].ok, k + " " + JSON.stringify(probe[k])).toBe(false);
      expect(probe.localStorage.error).toBe("SecurityError");
      expect(raw).not.toMatch(new RegExp([APP_SECRET, APP_COOKIE].join("|")));
    } finally { await page.close(); }
  }, 30000);

  it("B4 — DIRECT top-level navigation to a package SVG with an inline script is sandboxed the same way", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(server.runtimeUrl(server.packages.probe, "probe.svg"));
      const raw = await page.waitFor("document.documentElement.getAttribute('data-probe')", 8000);
      expect(raw, "svg probe did not run " + evidence(page)).toBeTruthy();
      const probe = JSON.parse(raw);
      expect(probe.origin.value).toBe("null");
      expect(probe.localStorage.ok).toBe(false); expect(probe.cookie.ok).toBe(false);
      expect(raw).not.toMatch(new RegExp([APP_SECRET, APP_COOKIE].join("|")));
    } finally { await page.close(); }
  }, 30000);

  it("B5 — framed escapes stay blocked: popup, top / parent navigation, form submission, fetch (app + external), beacons, images to other origins, modal dialogs", async () => {
    const before = await browser.pageCount();
    const beforeIds = await browser.pageTargetIds();
    const { page, state } = await framed("escape");
    try {
      expect(state, evidence(page)).not.toBeNull();
      await sleep(900);                                                                              // the form submission fires after 300 ms
      const R = state.data.payload.state.escape;
      expect(R.popup.ok ? R.popup.value : null).toBeNull();
      expect(R.fetchExternal.ok).toBe(false); expect(R.fetchApp.ok).toBe(false);
      // sendBeacon's boolean only means "queued"; the server request log below is the oracle for every network attempt
      expect(await page.eval("location.pathname")).toBe("/host.html");                               // no top navigation
      expect(page.dialogs).toEqual([]);
      expect(server.requests.filter(r => /escape-/.test(r.url)), JSON.stringify(server.requests.slice(-10))).toEqual([]);
      expect(await browser.pageCount()).toBe(before + 1);
      // exact page set: only this test's page was added — no window.open target, whatever else opened or closed meanwhile
      expect(await browser.pageTargetIds(), "unexpected page target (popup?)").toEqual([...beforeIds, page.targetId].sort());
    } finally { await page.close(); }
  }, 30000);

  it("B5 — the same escapes stay blocked when the runtime URL is opened DIRECTLY (no iframe attribute involved)", async () => {
    const before = await browser.pageCount();
    const beforeIds = await browser.pageTargetIds();
    const page = await browser.newPage();
    try {
      await page.goto(server.runtimeUrl(server.packages.escape, "index.html"));
      const raw = await page.waitFor("document.body && document.body.getAttribute('data-escape')", 8000);
      expect(raw, evidence(page)).toBeTruthy();
      await sleep(900);
      const R = JSON.parse(raw);
      expect(R.popup.ok ? R.popup.value : null).toBeNull();
      expect(R.fetchExternal.ok).toBe(false); expect(R.fetchApp.ok).toBe(false);
      expect(page.dialogs, "modal dialogs must be blocked (no allow-modals)").toEqual([]);
      expect(await page.eval("location.pathname")).toMatch(/^\/api\/simulators\/runtime\/browser-escape\//);   // the form did not navigate
      expect(server.requests.filter(r => /escape-/.test(r.url)), JSON.stringify(server.requests.slice(-10))).toEqual([]);
      expect(await browser.pageCount()).toBe(before + 1);
      // exact page set: only this test's page was added — no window.open target, whatever else opened or closed meanwhile
      expect(await browser.pageTargetIds(), "unexpected page target (popup?)").toEqual([...beforeIds, page.targetId].sort());
    } finally { await page.close(); }
  }, 30000);

  it("B6 — defense in depth: even a frame deliberately WEAKENED with allow-same-origin cannot give uploaded code the application origin, because the HTTP CSP sandbox still applies", async () => {
    const { page, state } = await framed("probe", null, 8000, true);
    try {
      expect(await page.eval("document.getElementById('f').getAttribute('sandbox')")).toBe(productionIframeSandbox() + " allow-same-origin");
      expect(state, evidence(page)).not.toBeNull();
      const probe = state.data.payload.state.probe;
      expect(probe.origin.value).toBe("null");
      for (const k of ["localStorage", "sessionStorage", "cookie", "parentDom"]) expect(probe[k].ok, k + " " + JSON.stringify(probe[k])).toBe(false);
      expect(JSON.stringify(probe)).not.toMatch(new RegExp([APP_SECRET, APP_COOKIE, TEACHER_SECRET].join("|")));
    } finally { await page.close(); }
  }, 30000);
});
