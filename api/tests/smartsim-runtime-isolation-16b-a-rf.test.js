import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { writeZip, manifestOf, VANILLA_INDEX } from "./fixtures/smartsim-zip.js";
import { uploadHandler, listHandler, versionsHandler, runtimeHandler } from "../src/functions/simulators.js";
import { buildRuntimeHeaders } from "../src/lib/smartsim/runtime-headers.js";
import { requireBuilderAuth } from "../src/lib/builder-auth.js";
import { productionIframeSandbox } from "./fixtures/smartsim-browser.js";

// Phase 16B-A — Independent Review Fix (RF1 / RF2): the HTTP-level isolation contract of every SERVED simulator
// response. RF1: uploaded code is served from the application origin, so the iframe `sandbox` attribute alone does not
// protect a runtime URL opened directly — the response itself must carry `Content-Security-Policy: sandbox allow-scripts`
// (opaque origin, no storage / cookies / popups / navigation / forms / modals / downloads). RF2: that opaque origin makes
// every package sub-resource a cross-origin load, so `Cross-Origin-Resource-Policy: same-origin` breaks multi-file
// packages and module / font loads need `Access-Control-Allow-Origin`. Fail-first on the reviewed head 6d8e22a.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORIGIN = "https://app.example";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const FORBIDDEN_SANDBOX_TOKENS = ["allow-same-origin", "allow-top-navigation", "allow-top-navigation-by-user-activation", "allow-top-navigation-to-custom-protocols", "allow-popups", "allow-popups-to-escape-sandbox", "allow-forms", "allow-modals", "allow-downloads", "allow-storage-access-by-user-activation", "allow-pointer-lock", "allow-presentation", "allow-orientation-lock"];

/** Parses a CSP header into { directive: [tokens] } (first occurrence wins, as browsers do). */
function parseCsp(csp) {
  const out = {};
  for (const part of String(csp || "").split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const name = tokens[0].toLowerCase();
    if (!(name in out)) out[name] = tokens.slice(1);
  }
  return out;
}

let store, pkg, prefix;
const deps = () => ({ getContainer: () => store.container, requireBuilderAuth: () => ({ ok: true, user: { sub: "rf-teacher", role: "teacher" } }) });
const get = (assetPath, over = {}) => runtimeHandler({ method: "GET", url: ORIGIN + "/api/simulators/runtime/iso-sim/" + (over.packageVersion ?? "1") + "/" + (over.hash ?? pkg.packageHash.slice(7)) + "/" + assetPath, headers: new Headers(), params: { packageId: over.packageId ?? "iso-sim", packageVersion: over.packageVersion ?? "1", hash: over.hash ?? pkg.packageHash.slice(7), assetPath } }, deps());

beforeAll(async () => {
  store = createMemoryContainer();
  const zip = writeZip([
    { name: "manifest.json", data: JSON.stringify(manifestOf({ packageId: "iso-sim", title: "Isolation" })) },
    { name: "dist/index.html", data: VANILLA_INDEX },
    { name: "dist/app.js", data: "window.x=1;" },
    { name: "dist/app.mjs", data: "export const x=1;" },
    { name: "dist/style.css", data: "body{margin:0}" },
    { name: "dist/pic.png", data: PNG },
    { name: "dist/icon.svg", data: `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>` },
    { name: "dist/font.woff2", data: Buffer.from("wOF2fake") },
    { name: "dist/data.json", data: "{}" }
  ]);
  const up = await uploadHandler({ method: "POST", url: ORIGIN + "/api/simulators/upload", headers: new Headers({ "x-file-name": "iso.smartsim", "content-length": String(zip.length) }), arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length) }, deps());
  expect(up.status).toBe(201);
  pkg = up.jsonBody.package;
  prefix = ORIGIN + "/api/simulators/runtime/iso-sim/1/" + pkg.packageHash.slice(7) + "/";
});

const ALL_ASSETS = ["index.html", "app.js", "app.mjs", "style.css", "pic.png", "icon.svg", "font.woff2", "data.json"];
const DOCUMENTS = ["index.html", "icon.svg"];                                                   // types that execute script when navigated to
const SUBRESOURCES = ["app.js", "app.mjs", "style.css", "pic.png", "font.woff2", "data.json"];

describe("RF1 — every served runtime response carries the HTTP CSP sandbox (direct navigation stays sandboxed)", () => {
  it("CSP has a `sandbox` directive whose tokens are EXACTLY ['allow-scripts'] on every asset type (HTML, SVG, JS, CSS, images, fonts, JSON)", async () => {
    for (const a of ALL_ASSETS) {
      const r = await get(a);
      expect(r.status, a).toBe(200);
      const csp = parseCsp(r.headers["Content-Security-Policy"]);
      expect(csp.sandbox, a + " sandbox directive").toEqual(["allow-scripts"]);
    }
  });
  it("no forbidden sandbox token (allow-same-origin / top-navigation / popups / forms / modals / downloads / storage access / …) appears anywhere in any runtime header", async () => {
    for (const a of ALL_ASSETS) {
      const r = await get(a);
      const all = Object.values(r.headers).join(" ").toLowerCase();
      for (const t of FORBIDDEN_SANDBOX_TOKENS) expect(all, a + " must not grant " + t).not.toContain(t);
    }
  });
  it("the header builder itself applies the sandbox for single-file and prebuilt packages alike (it is not an HTML-only afterthought)", () => {
    for (const singleFile of [true, false]) for (const contentType of ["text/html; charset=utf-8", "image/svg+xml", "text/javascript; charset=utf-8"]) {
      const h = buildRuntimeHeaders({ contentType, origin: ORIGIN, packagePrefix: "/api/simulators/runtime/iso-sim/1/" + "ab".repeat(32) + "/", singleFile });
      expect(parseCsp(h["Content-Security-Policy"]).sandbox, contentType + " singleFile=" + singleFile).toEqual(["allow-scripts"]);
    }
  });
});

describe("RF1 — exact CSP directive set (package-scoped, no network, no framing by others)", () => {
  it("fetch directives name ONLY the exact package prefix ('self' would admit every application script and every other package on the origin)", async () => {
    const csp = parseCsp((await get("index.html")).headers["Content-Security-Policy"]);
    expect(csp["default-src"]).toEqual(["'none'"]);
    expect(csp["script-src"]).toEqual([prefix, "'unsafe-inline'"]);
    expect(csp["style-src"]).toEqual([prefix, "'unsafe-inline'"]);
    expect(csp["img-src"]).toEqual([prefix, "data:"]);
    expect(csp["font-src"]).toEqual([prefix]);
    expect(csp["media-src"]).toEqual([prefix]);
    expect(csp["connect-src"]).toEqual(["'none'"]);
    expect(csp["frame-src"]).toEqual(["'none'"]);
    expect(csp["worker-src"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'none'"]);
    expect(csp["form-action"]).toEqual(["'none'"]);
    expect(csp["frame-ancestors"]).toEqual(["'self'"]);
    const raw = (await get("index.html")).headers["Content-Security-Policy"];
    expect(raw).not.toMatch(/'unsafe-eval'|'wasm-unsafe-eval'|\*|(^|\s)(https?|wss?|blob|filesystem):(\s|;|$)|'strict-dynamic'/);
  });
});

describe("RF2 — cross-origin sub-resource policy compatible with the deliberately opaque runtime document", () => {
  it("Cross-Origin-Resource-Policy is `cross-origin` (an opaque-origin document is cross-origin to every URL) and Access-Control-Allow-Origin is `*` without credentials (module scripts / fonts / crossorigin CSS are CORS loads with Origin: null)", async () => {
    for (const a of ALL_ASSETS) {
      const h = (await get(a)).headers;
      expect(h["Cross-Origin-Resource-Policy"], a).toBe("cross-origin");
      expect(h["Access-Control-Allow-Origin"], a).toBe("*");
      expect(h["Access-Control-Allow-Credentials"], a).toBeUndefined();
      expect(h["X-Content-Type-Options"], a).toBe("nosniff");
      expect(h["Referrer-Policy"], a).toBe("no-referrer");
    }
  });
  it("cacheability: executable DOCUMENTS (HTML / SVG) are revalidated on every load so a security-header change can never be pinned by a year-long cache; content-addressed sub-resources stay immutable", async () => {
    for (const a of DOCUMENTS) expect((await get(a)).headers["Cache-Control"], a).toBe("no-cache");
    for (const a of SUBRESOURCES) expect((await get(a)).headers["Cache-Control"], a).toBe("public, max-age=31536000, immutable");
  });
  it("error / 404 responses are inert: no-store, nosniff, and a sandboxing CSP that forbids framing and every fetch", async () => {
    for (const r of [await get("missing.html"), await get("../metadata.json"), await get("index.html", { packageVersion: "latest" }), await get("index.html", { hash: "0".repeat(64) })]) {
      expect(r.status).toBe(404);
      expect(r.headers["Cache-Control"]).toBe("no-store");
      expect(r.headers["X-Content-Type-Options"]).toBe("nosniff");
      const csp = parseCsp(r.headers["Content-Security-Policy"]);
      expect(csp.sandbox).toEqual([]);
      expect(csp["default-src"]).toEqual(["'none'"]);
      expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    }
  });
});

describe("RF invariants that must NOT change", () => {
  it("the main application's headers / CSP are untouched: staticwebapp.config.json is byte-identical in meaning to the baseline and index.html carries no CSP / sandbox meta", () => {
    const swa = JSON.parse(fs.readFileSync(path.join(repo, "public/staticwebapp.config.json"), "utf8"));
    expect(swa).toEqual({ platform: { apiRuntime: "node:22" }, routes: [{ route: "/sw.js", headers: { "Cache-Control": "no-cache" } }, { route: "/manifest.webmanifest", headers: { "Cache-Control": "no-cache" } }], mimeTypes: { ".webmanifest": "application/manifest+json" } });
    const html = fs.readFileSync(path.join(repo, "index.html"), "utf8");
    expect(html).not.toMatch(/Content-Security-Policy|Cross-Origin-Resource-Policy|sandbox/i);
    expect(fs.readFileSync(path.join(repo, "public/sw.js"), "utf8")).toMatch(/\/api\//);            // the service worker still never serves /api/
  });
  it("route classification is unchanged: the runtime route is public by design; upload / list / versions still require a builder session", async () => {
    const realAuth = { getContainer: () => store.container, requireBuilderAuth };
    const anon = (url, params = {}, method = "GET") => ({ method, url: ORIGIN + url, headers: new Headers(), params, arrayBuffer: async () => new ArrayBuffer(0) });
    expect((await runtimeHandler(anon("/api/simulators/runtime/iso-sim/1/" + pkg.packageHash.slice(7) + "/index.html", { packageId: "iso-sim", packageVersion: "1", hash: pkg.packageHash.slice(7), assetPath: "index.html" }), realAuth)).status).toBe(200);
    expect((await uploadHandler(anon("/api/simulators/upload", {}, "POST"), realAuth)).status).toBe(401);
    expect((await listHandler(anon("/api/simulators"), realAuth)).status).toBe(401);
    expect((await versionsHandler(anon("/api/simulators/iso-sim", { packageId: "iso-sim" }), realAuth)).status).toBe(401);
    const inventory = fs.readFileSync(path.join(repo, "api/tests/route-auth-inventory-11a.test.js"), "utf8");
    expect(inventory).toMatch(/simulatorRuntime:\s*"/);
  });
  it("package identity pinning is unchanged: only the exact (packageId, positive-integer version, sha256) triple serves; everything else is 404", async () => {
    expect((await get("index.html")).status).toBe(200);
    for (const over of [{ packageVersion: "2" }, { packageVersion: "latest" }, { packageVersion: "01" }, { packageId: "other-sim" }, { hash: "0".repeat(64) }, { hash: pkg.packageHash.slice(7).toUpperCase().replace(/[0-9]/g, "a") }]) expect((await get("index.html", over)).status, JSON.stringify(over)).toBe(404);
  });
  it("the production iframe keeps `sandbox=\"allow-scripts\"` only — the fix is NOT `allow-same-origin` on the frame", () => {
    expect(productionIframeSandbox()).toBe("allow-scripts");
    const host = fs.readFileSync(path.join(repo, "src/smartsim/SimulationSandboxHost.tsx"), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");   // code only, not the explanatory comments
    expect(host).not.toMatch(/allow-same-origin/);
  });
});
