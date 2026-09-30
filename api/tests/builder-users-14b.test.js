import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 14B Part A — minimal SERVER-owned multi-teacher identity (BUILDER_USERS). Fail-first on b9e45e8: the legacy
// validator ignores BUILDER_USERS and falls back to the shared password, so ID2/ID3/ID5/ID6/ID7 fail behaviourally.
//
// BUILDER_USERS holds account METADATA only ({ users: { <id>: { passwordEnv, displayName } } }); every password is read
// server-side from the environment variable named by `passwordEnv` (strict env-name allow-list, reserved names refused,
// no two accounts may share a secret). In multi-user mode there is NO fallback to BUILDER_PASSWORD / BANK_SETUP_KEY /
// BUILDER_USER_CODE; unknown account and wrong password are the same generic failure; a malformed non-empty
// configuration fails CLOSED. When BUILDER_USERS is absent / empty the legacy single-teacher login is unchanged.
const SAVED = { ...process.env };
process.env.BANK_SETUP_KEY = "14b-test-signing-secret";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
process.env.BUILDER_PASSWORD = "legacy-shared-pw";

const { handler: builderLogin } = await import("../src/functions/builder-login.js");
const { handler: platformLogin } = await import("../src/functions/platform-login.js");
const { validateBuilderCredentials, verifyBuilderToken } = await import("../src/lib/builder-auth.js");
const users = await import("../src/lib/builder-users.js");
const { parseBuilderUsers, listBuilderAccounts, isMultiUserMode } = users;

const CONFIG = { users: { "teacher-author": { passwordEnv: "BUILDER_PASSWORD_AUTHOR", displayName: "أ. المؤلف" }, "teacher-reviewer": { passwordEnv: "BUILDER_PASSWORD_REVIEWER", displayName: "أ. المراجع" } } };
function multiUser(over = {}) {
  process.env.BUILDER_USERS = JSON.stringify(over.config || CONFIG);
  process.env.BUILDER_PASSWORD_AUTHOR = over.author === undefined ? "author-secret-1" : over.author;
  process.env.BUILDER_PASSWORD_REVIEWER = over.reviewer === undefined ? "reviewer-secret-2" : over.reviewer;
  if (over.author === null) delete process.env.BUILDER_PASSWORD_AUTHOR;
  if (over.reviewer === null) delete process.env.BUILDER_PASSWORD_REVIEWER;
}
function legacy() { delete process.env.BUILDER_USERS; delete process.env.BUILDER_PASSWORD_AUTHOR; delete process.env.BUILDER_PASSWORD_REVIEWER; }
afterAll(() => { for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k]; Object.assign(process.env, SAVED); });

let mem;
beforeEach(() => { legacy(); mem = createMemoryContainer(); });
// Real handler, real credential validation, real memory container; the throttle is pass-through unless a test opts in.
const deps = (extra = {}) => ({ getContainer: () => mem.container, container: mem.container, clientIdFromRequest: () => "203.0.113.7", reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, ...extra });
const req = body => ({ json: async () => body, headers: { get: () => null } });
const login = (body, extra) => builderLogin(req(body), deps(extra));

describe("14B ID — server-owned multi-teacher identity", () => {
  it("ID1 — no BUILDER_USERS: legacy single-teacher login is unchanged (shared password, any code / BUILDER_USER_CODE, token sub = code)", async () => {
    expect(parseBuilderUsers(process.env).kind).toBe("legacy");
    expect(isMultiUserMode(process.env)).toBe(false);
    expect(listBuilderAccounts(process.env)).toEqual([]);
    let r = await login({ userCode: "ADMIN", password: "legacy-shared-pw" });
    expect(r.status).toBe(200); expect(verifyBuilderToken(r.jsonBody.token).sub).toBe("ADMIN");
    process.env.BUILDER_USER_CODE = "ONLY";
    r = await login({ userCode: "ADMIN", password: "legacy-shared-pw" }); expect(r.status).toBe(401);
    r = await login({ userCode: "ONLY", password: "legacy-shared-pw" }); expect(r.status).toBe(200);
    delete process.env.BUILDER_USER_CODE;
    expect(validateBuilderCredentials("x", "wrong")).toBe(false);
  });
  it("ID2 — valid multi-user configuration: each account authenticates ONLY with its own server secret", async () => {
    multiUser();
    expect(parseBuilderUsers(process.env)).toMatchObject({ kind: "configured" });
    expect(isMultiUserMode(process.env)).toBe(true);
    const a = await login({ userCode: "teacher-author", password: "author-secret-1" });
    expect(a.status, JSON.stringify(a.jsonBody)).toBe(200); expect(verifyBuilderToken(a.jsonBody.token).sub).toBe("teacher-author");
    const r = await login({ userCode: "teacher-reviewer", password: "reviewer-secret-2" });
    expect(r.status).toBe(200); expect(verifyBuilderToken(r.jsonBody.token).sub).toBe("teacher-reviewer");
    // the legacy shared password / BANK_SETUP_KEY / BUILDER_USER_CODE grant NOTHING in multi-user mode
    for (const [code, pw] of [["teacher-author", "legacy-shared-pw"], ["teacher-author", "14b-test-signing-secret"], ["ADMIN", "legacy-shared-pw"], ["builder", "legacy-shared-pw"]]) {
      const x = await login({ userCode: code, password: pw }); expect(x.status, code + "/" + pw).toBe(401);
    }
    process.env.BUILDER_USER_CODE = "teacher-author";
    expect((await login({ userCode: "teacher-author", password: "legacy-shared-pw" })).status).toBe(401);
    delete process.env.BUILDER_USER_CODE;
  });
  it("ID3 — the Author's password with the Reviewer's userCode fails (no cross-account claim)", async () => {
    multiUser();
    expect((await login({ userCode: "teacher-reviewer", password: "author-secret-1" })).status).toBe(401);
    expect((await login({ userCode: "teacher-author", password: "reviewer-secret-2" })).status).toBe(401);
    expect(validateBuilderCredentials("teacher-reviewer", "author-secret-1")).toBe(false);
  });
  it("ID4 — unknown account and wrong password expose the SAME generic client error (no enumeration)", async () => {
    multiUser();
    const unknown = await login({ userCode: "nobody", password: "author-secret-1" });
    const wrong = await login({ userCode: "teacher-author", password: "nope" });
    expect(unknown.status).toBe(401); expect(wrong.status).toBe(401);
    expect(unknown.jsonBody).toEqual(wrong.jsonBody);
    expect(JSON.stringify(unknown.jsonBody)).not.toMatch(/nobody|teacher-author|BUILDER_PASSWORD/);
  });
  it("ID5 — a malformed NON-EMPTY BUILDER_USERS fails closed: no login for anyone, no fallback to the shared password, safe error without secrets", async () => {
    for (const bad of ["{not json", "[]", "{}", JSON.stringify({ users: {} }), JSON.stringify({ users: { "teacher-author": { passwordEnv: "lowercase-bad" } } }), JSON.stringify({ users: { "bad id with spaces": { passwordEnv: "X_ENV" } } }), JSON.stringify({ users: { a: { passwordEnv: "BUILDER_PASSWORD" } } }), JSON.stringify({ users: { a: { passwordEnv: "BANK_SETUP_KEY" } } }), JSON.stringify({ users: { a: { passwordEnv: "SAME_ENV" }, b: { passwordEnv: "SAME_ENV" } } }), JSON.stringify({ users: { a: { password: "plaintext-forbidden" } } })]) {
      process.env.BUILDER_USERS = bad;
      process.env.X_ENV = "x"; process.env.SAME_ENV = "s";
      expect(parseBuilderUsers(process.env).kind, bad).toBe("configuration-error");
      expect(validateBuilderCredentials("ADMIN", "legacy-shared-pw"), bad).toBe(false);
      expect(validateBuilderCredentials("a", "x"), bad).toBe(false);
      const r = await login({ userCode: "ADMIN", password: "legacy-shared-pw" });
      expect([401, 503]).toContain(r.status);
      expect(r.status, bad).toBe(503);
      expect(r.jsonBody.code).toBe("AUTH_CONFIG_INVALID");
      expect(JSON.stringify(r.jsonBody)).not.toMatch(/legacy-shared-pw|14b-test-signing-secret|X_ENV|SAME_ENV|plaintext/);
    }
    delete process.env.X_ENV; delete process.env.SAME_ENV;
  });
  it("ID6 — a referenced passwordEnv secret that is missing / empty fails closed for that account only, generically", async () => {
    multiUser({ author: null });
    expect((await login({ userCode: "teacher-author", password: "" + "author-secret-1" })).status).toBe(401);
    expect((await login({ userCode: "teacher-author", password: "legacy-shared-pw" })).status).toBe(401);
    expect((await login({ userCode: "teacher-author", password: "" })).status).toBe(400);
    expect((await login({ userCode: "teacher-reviewer", password: "reviewer-secret-2" })).status).toBe(200);
    multiUser({ author: "" });
    expect(validateBuilderCredentials("teacher-author", "")).toBe(false);
    expect((await login({ userCode: "teacher-author", password: "x" })).status).toBe(401);
  });
  it("ID7 — the client can never choose the password environment variable, the account metadata or a role", async () => {
    multiUser();
    const r = await login({ userCode: "teacher-reviewer", password: "author-secret-1", passwordEnv: "BUILDER_PASSWORD_AUTHOR", role: "approver", capabilities: ["publish"] });
    expect(r.status).toBe(401);
    const ok = await login({ userCode: "teacher-author", password: "author-secret-1", passwordEnv: "BUILDER_PASSWORD_REVIEWER", sub: "teacher-reviewer", role: "approver" });
    expect(ok.status).toBe(200);
    expect(verifyBuilderToken(ok.jsonBody.token)).toMatchObject({ sub: "teacher-author", role: "teacher" });
    // account metadata never carries secrets or env names
    for (const acct of listBuilderAccounts(process.env)) { expect(Object.keys(acct).sort()).toEqual(["actorId", "displayName"]); }
    expect(JSON.stringify(listBuilderAccounts(process.env))).not.toMatch(/passwordEnv|BUILDER_PASSWORD|secret/);
  });
  it("ID8 — a successful token carries exactly the authenticated configured user as sub (both login endpoints)", async () => {
    multiUser();
    const b = await login({ userCode: "teacher-reviewer", password: "reviewer-secret-2" });
    expect(verifyBuilderToken(b.jsonBody.token).sub).toBe("teacher-reviewer"); expect(b.jsonBody.userCode).toBe("teacher-reviewer");
    const p = await platformLogin(req({ userCode: "teacher-reviewer", password: "reviewer-secret-2" }), deps());
    expect(p.status, JSON.stringify(p.jsonBody)).toBe(200); expect(p.jsonBody.role).toBe("teacher");
    expect(verifyBuilderToken(p.jsonBody.token).sub).toBe("teacher-reviewer");
    expect(p.jsonBody.displayName).toBe("أ. المراجع");                     // configured account name (no profile document)
    const pw = await platformLogin(req({ userCode: "teacher-reviewer", password: "author-secret-1" }), deps());
    expect(pw.status).toBe(401);
  });
  it("ID9 — the reserve-before-verify throttle stays in front of multi-user verification (no bypass)", async () => {
    multiUser();
    let verified = 0;
    const r = await login({ userCode: "teacher-author", password: "author-secret-1" }, { reserveLoginAttempt: async () => ({ allowed: false, retryAfterSeconds: 30 }), validateBuilderCredentials: (...a) => { verified++; return validateBuilderCredentials(...a); } });
    expect(r.status).toBe(429); expect(r.headers["Retry-After"]).toBe("30"); expect(verified).toBe(0);
    // the REAL throttle against the memory container: repeated wrong passwords for a configured account get rate-limited
    const real = { getContainer: () => mem.container, container: mem.container, clientIdFromRequest: () => "203.0.113.9" };
    const statuses = [];
    for (let i = 0; i < 8; i++) statuses.push((await builderLogin(req({ userCode: "teacher-author", password: "wrong-" + i }), real)).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toContain(429);
  });
});
