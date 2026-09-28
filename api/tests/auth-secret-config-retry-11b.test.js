import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";

// Loaded with require (Phase 11B): health.js requires auth-config-status / observability through Node's CommonJS
// cache, which is a DIFFERENT instance from a vitest `import()` of the same file. Sharing health's instances is what
// makes __resetAuthSecretReportForTests() and setSink() reach the code under test.
const require = createRequire(import.meta.url);

// Phase 11B — the secret-configuration diagnostic must be DELIVERED once per process, not merely ATTEMPTED once.
// A failed first attempt (throwing logger, failing sink, or no logger at all) must leave the next health request
// free to retry; after one delivered warning there are no more; logging failures never touch the health response;
// no secret material ever appears; authentication is untouched.

const { reportAuthSecretConfiguration, __resetAuthSecretReportForTests } = require("../src/lib/auth-config-status.js");
const observability = require("../src/lib/observability.js");
const { handler: healthHandler } = require("../src/functions/health.js");

const KEYS = ["BANK_SETUP_KEY", "BUILDER_SESSION_SECRET", "STUDENT_SESSION_SECRET", "BUILDER_PASSWORD"];
const V = { BANK_SETUP_KEY: "bank-setup-VALUE-11b-4d2e", BUILDER_SESSION_SECRET: "builder-VALUE-11b-8f1a", STUDENT_SESSION_SECRET: "student-VALUE-11b-3c9b", BUILDER_PASSWORD: "password-VALUE-11b-6e7d" };
const saved = {};
const setEnv = vars => { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, vars); };
const FALLBACK_ONLY = { BANK_SETUP_KEY: V.BANK_SETUP_KEY };
const leaks = text => Object.values(V).flatMap(v => [v, v.slice(0, 8), v.slice(-5)]).filter(f => text.includes(f));
const health = observability.withObservability("health", healthHandler);
const callHealth = () => health({ method: "GET", url: "https://x/api/health", headers: new Headers() }, {});
const diagnostics = records => records.filter(r => r.event === "auth.secret_configuration");

let records;
beforeEach(() => { for (const k of KEYS) saved[k] = process.env[k]; records = []; __resetAuthSecretReportForTests(); });
afterEach(() => {
  observability.resetSink();
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  __resetAuthSecretReportForTests();
});

describe("reportAuthSecretConfiguration — retry until one warning is delivered (11B)", () => {
  it("a logger that THROWS on the first attempt does not consume the once-per-process report; the next call delivers it", () => {
    setEnv(FALLBACK_ONLY);
    expect(() => reportAuthSecretConfiguration({ logWarn() { throw new Error("sink down"); } })).not.toThrow();
    const delivered = [];
    const ok = { logWarn: (event, fields) => { delivered.push({ event, ...fields }); return { event }; } };
    reportAuthSecretConfiguration(ok);
    reportAuthSecretConfiguration(ok);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ event: "auth.secret_configuration", teacherSigning: "fallback", studentSigning: "fallback", teacherLogin: "fallback", recommended: false });
  });
  it("a call with NO logger (handler invoked outside the observability wrapper) does not consume the report", () => {
    setEnv(FALLBACK_ONLY);
    expect(reportAuthSecretConfiguration(undefined)).toMatchObject({ recommended: false });
    expect(reportAuthSecretConfiguration({})).toMatchObject({ recommended: false });
    const delivered = [];
    reportAuthSecretConfiguration({ logWarn: (event, fields) => { delivered.push({ event, ...fields }); return { event }; } });
    expect(delivered).toHaveLength(1);
  });
  it("a logger reporting a failed delivery (returns null, as observability's emit does) is retried; one delivery ends it", () => {
    setEnv(FALLBACK_ONLY);
    let calls = 0;
    const flaky = { logWarn: () => { calls++; return calls === 1 ? null : { event: "auth.secret_configuration" }; } };
    reportAuthSecretConfiguration(flaky); reportAuthSecretConfiguration(flaky); reportAuthSecretConfiguration(flaky);
    expect(calls).toBe(2);
  });
  it("recommended configuration never warns, whatever the logger does", () => {
    setEnv({ BUILDER_SESSION_SECRET: V.BUILDER_SESSION_SECRET, STUDENT_SESSION_SECRET: V.STUDENT_SESSION_SECRET, BUILDER_PASSWORD: V.BUILDER_PASSWORD });
    let calls = 0;
    const logger = { logWarn: () => { calls++; throw new Error("x"); } };
    for (let i = 0; i < 3; i++) reportAuthSecretConfiguration(logger);
    expect(calls).toBe(0);
  });
});

describe("through the real health route + observability sink (11B)", () => {
  it("a sink that fails on the first health request → the warning is delivered by a later request, exactly once; responses never change", async () => {
    setEnv(FALLBACK_ONLY);
    let sinkDown = true;
    observability.setSink(r => { if (sinkDown && r.event === "auth.secret_configuration") throw new Error("sink down"); records.push(r); });
    const first = await callHealth();
    expect(first.status).toBe(200);
    expect(diagnostics(records)).toEqual([]);                                      // the failed attempt left no record
    sinkDown = false;
    const later = [await callHealth(), await callHealth(), await callHealth()];
    for (const r of later) expect(r.status).toBe(200);
    expect(diagnostics(records)).toHaveLength(1);                                  // retried once, then never again
    expect(diagnostics(records)[0]).toMatchObject({ teacherSigning: "fallback", studentSigning: "fallback", teacherLogin: "fallback", recommended: false });
    for (const r of [first, ...later]) {
      expect(Object.keys(r.jsonBody).filter(k => k !== "version").sort()).toEqual(["ok", "service", "time"]);
      expect(leaks(JSON.stringify(r))).toEqual([]);
    }
    expect(leaks(JSON.stringify(records))).toEqual([]);
  });
  it("a health call made WITHOUT the wrapper (no obs) answers normally and leaves the report to the next wrapped call", async () => {
    setEnv(FALLBACK_ONLY);
    observability.setSink(r => records.push(r));
    const bare = await healthHandler({ method: "GET", url: "https://x/api/health", headers: new Headers() }, {});
    expect(bare.status).toBe(200);
    await callHealth(); await callHealth();
    expect(diagnostics(records)).toHaveLength(1);
  });
  it("emit() still never throws when the sink fails, and now reports the failed delivery as null", () => {
    observability.setSink(() => { throw new Error("sink down"); });
    const ctx = observability.createRequestContext({ method: "GET", headers: new Headers() }, { route: "t" });
    expect(() => ctx.logWarn("x.y", { a: 1 })).not.toThrow();
    expect(ctx.logWarn("x.y", { a: 1 })).toBeNull();
    observability.setSink(r => records.push(r));
    expect(ctx.logWarn("x.y", { a: 1 })).toMatchObject({ event: "x.y", a: 1 });
  });
});
