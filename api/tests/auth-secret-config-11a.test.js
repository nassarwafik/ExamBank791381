import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";

// Loaded with require (Phase 11B): health.js requires auth-config-status / observability through Node's CommonJS
// cache, which is a DIFFERENT instance from a vitest `import()` of the same file. Sharing health's instances is what
// makes __resetAuthSecretReportForTests() and setSink() reach the code under test.
const require = createRequire(import.meta.url);

// Phase 11A — secret-configuration diagnostic. It classifies WHICH variable of each auth fallback chain is in use
// (by name, never by value), reports a once-per-process server-log warning when a dedicated secret is missing, and
// never places anything about secrets in a response. Authentication itself is untouched.

const { authSecretConfiguration, reportAuthSecretConfiguration, __resetAuthSecretReportForTests } = require("../src/lib/auth-config-status.js");
const observability = require("../src/lib/observability.js");
const { handler: healthHandler } = require("../src/functions/health.js");
const builderAuth = await import("../src/lib/builder-auth.js");
const studentAuth = await import("../src/lib/student-auth.js");

const KEYS = ["BANK_SETUP_KEY", "BUILDER_SESSION_SECRET", "STUDENT_SESSION_SECRET", "BUILDER_PASSWORD", "BUILDER_USER_CODE"];
// Distinctive values so any leak (value, prefix, suffix) is detectable in logs or responses.
const V = { BANK_SETUP_KEY: "bank-setup-VALUE-7f3a91", BUILDER_SESSION_SECRET: "builder-session-VALUE-2c8d44", STUDENT_SESSION_SECRET: "student-session-VALUE-9e1b07", BUILDER_PASSWORD: "builder-password-VALUE-5a6c12" };
const saved = {};
const setEnv = vars => { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, vars); };

let records;
beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  records = [];
  observability.setSink(r => records.push(r));
  __resetAuthSecretReportForTests();
});
afterEach(() => {
  observability.resetSink();
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  __resetAuthSecretReportForTests();
});

const leaks = text => Object.values(V).flatMap(v => [v, v.slice(0, 8), v.slice(-6)]).filter(fragment => text.includes(fragment));
const callHealth = () => observability.withObservability("health", healthHandler)({ method: "GET", url: "https://x/api/health", headers: new Headers() }, {});

describe("authSecretConfiguration — classification by variable name only", () => {
  it("dedicated variables for every chain → recommended", () => {
    expect(authSecretConfiguration({ BUILDER_SESSION_SECRET: "a", STUDENT_SESSION_SECRET: "b", BUILDER_PASSWORD: "c" }))
      .toEqual({ teacherSigning: "dedicated", studentSigning: "dedicated", teacherLogin: "dedicated", recommended: true });
    // BANK_SETUP_KEY may still be present; dedicated variables win exactly as in the auth libraries
    expect(authSecretConfiguration({ BANK_SETUP_KEY: "k", BUILDER_SESSION_SECRET: "a", STUDENT_SESSION_SECRET: "b", BUILDER_PASSWORD: "c" }).recommended).toBe(true);
  });
  it("BANK_SETUP_KEY alone → every chain on the fallback; not recommended", () => {
    expect(authSecretConfiguration({ BANK_SETUP_KEY: "k" }))
      .toEqual({ teacherSigning: "fallback", studentSigning: "fallback", teacherLogin: "fallback", recommended: false });
  });
  it("student tokens rooted in the teacher secret are reported as shared-teacher-secret", () => {
    expect(authSecretConfiguration({ BUILDER_SESSION_SECRET: "a", BUILDER_PASSWORD: "c" }))
      .toEqual({ teacherSigning: "dedicated", studentSigning: "shared-teacher-secret", teacherLogin: "dedicated", recommended: false });
  });
  it("nothing configured → missing; empty strings count as not set (same truthiness as `a || b` in the libs)", () => {
    expect(authSecretConfiguration({})).toEqual({ teacherSigning: "missing", studentSigning: "missing", teacherLogin: "missing", recommended: false });
    expect(authSecretConfiguration({ BUILDER_SESSION_SECRET: "", BANK_SETUP_KEY: "k" }).teacherSigning).toBe("fallback");
  });
  it("the classification agrees with what the auth libraries actually resolve (fallback-only still signs and verifies)", () => {
    setEnv({ BANK_SETUP_KEY: V.BANK_SETUP_KEY });
    expect(authSecretConfiguration().teacherSigning).toBe("fallback");
    expect(builderAuth.verifyBuilderToken(builderAuth.createBuilderToken("teacher-1"))).toBeTruthy();       // behaviour unchanged
    expect(builderAuth.validateBuilderCredentials("teacher-1", V.BANK_SETUP_KEY)).toBe(true);                // fallback password still works
    const student = studentAuth.createStudentToken({ userId: "s1", code: "C1", authVersion: 1 });
    expect(studentAuth.verifyStudentToken(student)).toBeTruthy();
  });
  it("returns only status words: no value, length, hash or fragment of any secret", () => {
    const text = JSON.stringify(authSecretConfiguration(V));
    expect(leaks(text)).toEqual([]);
    expect(text).not.toMatch(/\d{2,}/);                                                                   // no lengths/counters
    for (const v of Object.values(JSON.parse(text))) expect(["dedicated", "fallback", "shared-teacher-secret", "missing", true, false]).toContain(v);
  });
});

describe("reportAuthSecretConfiguration — once-per-process server-log warning", () => {
  it("fallback-only → exactly ONE `auth.secret_configuration` warning, even across many health calls", async () => {
    setEnv({ BANK_SETUP_KEY: V.BANK_SETUP_KEY });
    await callHealth(); await callHealth(); await callHealth();
    const warns = records.filter(r => r.event === "auth.secret_configuration");
    expect(warns).toHaveLength(1);
    expect(warns[0].level).toBe(observability.LEVELS.warn);
    expect(warns[0]).toMatchObject({ teacherSigning: "fallback", studentSigning: "fallback", teacherLogin: "fallback", recommended: false });
  });
  it("dedicated variables → no warning at all", async () => {
    setEnv({ BUILDER_SESSION_SECRET: V.BUILDER_SESSION_SECRET, STUDENT_SESSION_SECRET: V.STUDENT_SESSION_SECRET, BUILDER_PASSWORD: V.BUILDER_PASSWORD });
    await callHealth();
    expect(records.filter(r => r.event === "auth.secret_configuration")).toEqual([]);
  });
  it("no secret material in any log record or in the anonymous health response; the response is unchanged", async () => {
    setEnv({ BANK_SETUP_KEY: V.BANK_SETUP_KEY, BUILDER_SESSION_SECRET: V.BUILDER_SESSION_SECRET });
    const res = await callHealth();
    expect(leaks(JSON.stringify(records))).toEqual([]);
    expect(leaks(JSON.stringify(res))).toEqual([]);
    expect(res.status).toBe(200);
    expect(Object.keys(res.jsonBody).filter(k => k !== "version").sort()).toEqual(["ok", "service", "time"]);
    expect(JSON.stringify(res.jsonBody)).not.toMatch(/secret|fallback|dedicated|recommended|password/i);
  });
  it("a throwing logger never affects the caller", () => {
    setEnv({ BANK_SETUP_KEY: V.BANK_SETUP_KEY });
    expect(() => reportAuthSecretConfiguration({ logWarn() { throw new Error("sink down"); } })).not.toThrow();
  });
});
