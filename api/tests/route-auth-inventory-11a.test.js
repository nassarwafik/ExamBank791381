import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "module";
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Phase 11A — ROUTE-INVENTORY AUTHORIZATION GUARD.
//
// Every HTTP route the API registers is discovered from REALITY, not from a hand-kept list: the real
// `@azure/functions` `app.http` is intercepted, every module in api/src/functions is (re)required, and each
// registration is recorded together with the file that made it. A static count of `app.http(` in each source file
// must match what was captured, so a registration the recorder missed cannot slip through.
//
// Each captured route is then called ANONYMOUSLY (no x-builder-token, no Authorization header, no student token,
// no signature) once per declared method. Every route must reject that request with 401 unless it is classified
// below. A NEW route that is not classified and does not reject anonymous callers fails this file — by name.
//
// Classification (verified against each route's code, not assumed):
//   PUBLIC_BY_DESIGN — intentionally callable without a session; asserted reachable and never 5xx.
//   SIGNED           — no bearer session, but protected by an HMAC-signed, short-lived URL; an anonymous request
//                      WITHOUT a valid signature must still be rejected (it is NOT public).
// Nothing here changes any route's authentication; the test only observes.

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = join(HERE, "..", "src", "functions");

/** name → why it is public. Keep this list minimal; every entry is a deliberate, reviewed decision. */
const PUBLIC_BY_DESIGN = {
  builderLogin: "teacher credential exchange (POST user code + password → session token); throttled; no data without valid credentials",
  platformLogin: "unified teacher/student credential exchange; throttled; no data without valid credentials",
  health: "liveness probe; returns only { ok, service, time[, version] }; no storage I/O, no configuration",
  // Phase 16B-A — content-addressed simulator asset serving: the URL carries an unguessable SHA-256 capability pinned by the
  // published exam; identity is validated before any storage access (unknown / malformed → 404); no listing, no metadata, no
  // archive, no owner data; a sandboxed student frame has no auth token to send. Upload / list / versions require builder auth.
  simulatorRuntime: "sandboxed simulator asset by exact (packageId, version, sha256) capability; validated before storage; 404 otherwise; no enumeration"
};
/** name → the non-bearer mechanism that protects it. Still asserted to reject anonymous callers. */
const SIGNED = {
  questionImage: "question asset download; requires blob + exp + sig produced by createSignedAssetParams (HMAC, 15 min TTL)",
  // Phase 17C — Runner → SmartAssess official grading callback: no session; SA-CODING-CALLBACK-1 HMAC (its own key) over the
  // exact body + timestamp (±300 s) + request id; unsigned → 401, unconfigured key → 503 (fail closed), raw evidence only.
  codingGradeCallback: "official coding grading callback; requires an x-sa-callback-* HMAC signature under CODING_GRADING_CALLBACK_HMAC_KEY"
};

const SECRETS = {
  BUILDER_SESSION_SECRET: "route-inventory-builder-secret",
  STUDENT_SESSION_SECRET: "route-inventory-student-secret",
  BUILDER_PASSWORD: "route-inventory-password"
};
const savedEnv = {};

/** A minimal stand-in for the Azure Functions HttpRequest, carrying NO credentials of any kind. */
function anonymousRequest(method, route) {
  const path = "/api/" + route.replace(/\{([^}?]+)\??\}/g, (_m, p) => "inventory-" + p);
  const params = {};
  for (const m of route.matchAll(/\{([^}?]+)\??\}/g)) params[m[1]] = "inventory-" + m[1];
  const url = "https://example.invalid" + path;
  const body = method === "GET" ? null : "{}";
  return {
    method,
    url,
    headers: new Headers({ "content-type": "application/json" }),
    query: new URL(url).searchParams,
    params,
    json: async () => (body ? JSON.parse(body) : {}),
    text: async () => body || "",
    arrayBuffer: async () => new TextEncoder().encode(body || "").buffer,
    formData: async () => { throw new Error("no multipart body in an anonymous probe"); }
  };
}
/** What the Functions host passes as the second argument (never a test seam object). */
const invocationContext = () => ({ invocationId: "route-inventory", functionName: "probe", log() {}, error() {}, warn() {}, info() {}, trace() {}, debug() {} });

const registrations = [];
const staticCounts = new Map();

beforeAll(async () => {
  for (const [k, v] of Object.entries(SECRETS)) { savedEnv[k] = process.env[k]; process.env[k] = v; }
  savedEnv.AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
  delete process.env.AZURE_STORAGE_CONNECTION_STRING;           // any route that touches storage before auth would surface as 5xx

  const functionsPkg = require("@azure/functions");
  const realHttp = functionsPkg.app.http;
  const files = readdirSync(FUNCTIONS_DIR).filter(f => f.endsWith(".js")).sort();
  // Clear EVERY function module first, so each module body runs exactly once in this pass even when one function
  // module requires another (bank-import-action.js does); the registering file is taken from the call stack.
  for (const file of files) delete require.cache[require.resolve(join(FUNCTIONS_DIR, file))];
  const registeringFile = () => {
    const frame = (new Error().stack || "").split("\n").find(l => l.includes(FUNCTIONS_DIR));
    const m = frame && frame.match(/functions[\\/]([^\\/:]+\.js)/);
    return m ? m[1] : "?";
  };
  functionsPkg.app.http = (name, options) => { registrations.push({ name, file: registeringFile(), ...options }); };
  try {
    for (const file of files) {
      const full = join(FUNCTIONS_DIR, file);
      staticCounts.set(file, (readFileSync(full, "utf8").match(/\bapp\.http\s*\(/g) || []).length);
      require(full);                                               // a module already loaded transitively is not re-run
    }
  } finally {
    functionsPkg.app.http = realHttp;
  }
});
afterAll(() => {
  for (const [k, v] of Object.entries(savedEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

describe("route inventory — discovered from the real registrations", () => {
  it("every app.http(...) in api/src/functions was captured (static count == runtime registrations, per file)", () => {
    const captured = new Map();
    for (const r of registrations) captured.set(r.file, (captured.get(r.file) || 0) + 1);
    const mismatches = [...staticCounts].filter(([file, n]) => (captured.get(file) || 0) !== n).map(([file, n]) => `${file}: source ${n}, captured ${captured.get(file) || 0}`);
    expect(mismatches, "registration recorder missed routes").toEqual([]);
    expect(registrations.length).toBeGreaterThanOrEqual(60);
  });
  it("route names are unique and every registration has a handler, methods and a route", () => {
    const names = registrations.map(r => r.name);
    expect(new Set(names).size, "duplicate function names").toBe(names.length);
    for (const r of registrations) {
      expect(typeof r.handler, r.name).toBe("function");
      expect(Array.isArray(r.methods) && r.methods.length > 0, `${r.name} declares methods`).toBe(true);
      expect(typeof r.route === "string" && r.route.length > 0, `${r.name} declares a route`).toBe(true);
    }
  });
  it("the allow-lists contain only routes that really exist (no stale exemptions)", () => {
    const names = new Set(registrations.map(r => r.name));
    for (const n of [...Object.keys(PUBLIC_BY_DESIGN), ...Object.keys(SIGNED)]) expect(names.has(n), `allow-listed route ${n} is not registered`).toBe(true);
  });
});

describe("anonymous requests are rejected by every non-public route", () => {
  // Built lazily so the per-route cases carry the route name: a new unclassified route fails as «<name> …».
  it("every route that is not PUBLIC_BY_DESIGN answers 401 to an anonymous request, for every declared method", async () => {
    const failures = [];
    for (const r of registrations) {
      if (PUBLIC_BY_DESIGN[r.name]) continue;
      for (const method of r.methods) {
        let res;
        try { res = await r.handler(anonymousRequest(method, r.route), invocationContext()); }
        catch (e) { failures.push(`${r.name} ${method} /api/${r.route}: threw ${e && e.message}`); continue; }
        const status = res && res.status;
        if (status !== 401) failures.push(`${r.name} ${method} /api/${r.route} (${r.file}): expected 401 for an anonymous caller, got ${status}${SIGNED[r.name] ? " [SIGNED route]" : ""}`);
      }
    }
    expect(failures, "routes reachable without authorization — classify them or add an auth guard").toEqual([]);
  });

  it("SIGNED routes reject an anonymous request with no signature, and also a forged signature", async () => {
    for (const r of registrations.filter(x => SIGNED[x.name])) {
      const req = anonymousRequest("GET", r.route);
      const forged = { ...req, url: req.url + "?blob=x.png&exp=" + (Math.floor(Date.now() / 1000) + 300) + "&sig=forged", query: new URLSearchParams("blob=x.png&sig=forged") };
      expect((await r.handler(req, invocationContext())).status, r.name).toBe(401);
      expect((await r.handler(forged, invocationContext())).status, r.name + " (forged sig)").toBe(401);
    }
  });

  it("PUBLIC_BY_DESIGN routes are reachable without a session and never fail with 5xx on an empty request", async () => {
    for (const r of registrations.filter(x => PUBLIC_BY_DESIGN[x.name])) {
      for (const method of r.methods) {
        const res = await r.handler(anonymousRequest(method, r.route), invocationContext());
        expect(res.status, `${r.name} ${method}`).toBeLessThan(500);
        expect(res.status, `${r.name} ${method} must not demand a session`).not.toBe(401);
      }
    }
  });

  it("the public health route exposes no configuration or secret material", async () => {
    const health = registrations.find(r => r.name === "health");
    const res = await health.handler(anonymousRequest("GET", health.route), invocationContext());
    const text = JSON.stringify(res.jsonBody);
    expect(Object.keys(res.jsonBody).sort()).toEqual(expect.arrayContaining(["ok", "service", "time"]));
    for (const v of Object.values(SECRETS)) expect(text).not.toContain(v);
    expect(text).not.toMatch(/secret|password|fallback|BANK_SETUP_KEY|connection/i);
  });
});
