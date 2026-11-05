import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P10-D — the owner is never locked out by a flooded login limit (closes security review O2; design
// docs/enterprise-owner-login-starvation-p10d.md, owner decisions §19.40). While the limit refuses a sign-in, an attempt that
// carries a CORRECT authenticator code (the current step only) still gets through: the code is verified and consumed FIRST,
// then the password is checked once. A wrong code, an unknown username or a recovery code gets the very same 429 as today.
// In-memory blob container with real CAS semantics; TEST data only.

process.env.BANK_SETUP_KEY = "p10d-test-root-secret";
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_SESSION_SECRET;

const totp = await import("../src/lib/identity/totp.js");
const store = await import("../src/lib/identity/owner-store.js");
const { createBootstrapMaterial } = await import("../../scripts/owner-bootstrap-token.mjs");
const { handler: bootstrapHandler } = await import("../src/functions/owner-bootstrap.js");
const { handler: loginHandler } = await import("../src/functions/owner-login.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };
const T0 = Date.parse("2026-11-05T10:00:15.000Z");      // mid-step, so «the previous step» is a distinct, still-recent code
const PASSWORD = "correct horse battery staple";
const USERNAME = "tadris.owner";

function request(body) { return { method: "POST", params: {}, headers: { get: () => null }, json: async () => body }; }

async function setup() {
  const material = createBootstrapMaterial({ hours: 2, now: T0 });
  const env = { BANK_SETUP_KEY: "p10d-test-root-secret", OWNER_BOOTSTRAP_TOKEN_SHA256: material.sha256, OWNER_BOOTSTRAP_EXPIRES_AT: material.expiresAt };
  const mem = createMemoryContainer();
  const clock = { now: T0 };
  const ctx = { env, mem, clock, ip: "10.0.0.1" };
  const deps = { env, getContainer: () => mem.container, now: () => clock.now, hashParams: FAST, clientIdFromRequest: () => ctx.ip };
  ctx.deps = deps;
  const begin = await bootstrapHandler({ method: "POST", params: { action: "begin" }, headers: { get: () => null }, json: async () => ({ token: material.token, username: USERNAME, displayName: "مالك المنصة", password: PASSWORD }) }, deps);
  ctx.secret = totp.base32Decode(begin.jsonBody.totp.secret);
  const confirm = await bootstrapHandler({ method: "POST", params: { action: "confirm" }, headers: { get: () => null }, json: async () => ({ token: material.token, code: totp.totpAt(ctx.secret, clock.now) }) }, deps);
  expect(confirm.status).toBe(201);
  ctx.codes = confirm.jsonBody.recoveryCodes;
  ctx.accountId = confirm.jsonBody.owner.accountId;
  clock.now += 30_000;                                                  // the bootstrap consumed the current step
  ctx.login = (body, ip = "10.9.9.9") => { ctx.ip = ip; return loginHandler(request({ username: USERNAME, ...body }), deps); };
  ctx.code = (offsetMs = 0) => totp.totpAt(ctx.secret, clock.now + offsetMs);
  ctx.account = () => mem.getJson(store.ownerAccountName(ctx.accountId));
  ctx.audits = () => mem.names(OWNER_AUDIT_PREFIX).map(n => mem.getJson(n));
  /** An attacker who knows the username floods wrong sign-ins from rotating addresses until the identifier-wide limit refuses. */
  ctx.flood = async (n = 12) => {
    let last;
    for (let i = 0; i < n; i++) last = await ctx.login({ password: "wrong guess " + i, code: "000000" }, "10.1." + Math.floor(i / 200) + "." + (i % 200 + 1));
    expect(last.status).toBe(429);
  };
  return ctx;
}

describe("P10-D the owner is never locked out by a flooded login limit (O2)", () => {
  let ctx;
  beforeEach(async () => { ctx = await setup(); });

  it("fail-first: after a flood, the owner's correct password + correct code signs in (baseline: 429)", async () => {
    await ctx.flood();
    const r = await ctx.login({ password: PASSWORD, code: ctx.code() });
    expect(r.status).toBe(200);
    expect(typeof r.jsonBody.token).toBe("string");
    const ok = ctx.audits().find(e => e.action === "owner.login.succeeded");
    expect(ok.details).toMatchObject({ factor: "totp", via: "throttle-bypass" });
  });

  it("fail-first: a PERSISTENT flood (taking every post-cooldown probe) still never keeps the owner out", async () => {
    await ctx.flood();
    for (let round = 0; round < 4; round++) {
      ctx.clock.now += 130_000;                                         // past the longest owner cooldown
      const probe = await ctx.login({ password: "wrong again", code: "000000" }, "10.2.0." + (round + 1));
      expect([401, 429]).toContain(probe.status);
      await ctx.flood(3);
    }
    expect((await ctx.login({ password: PASSWORD, code: ctx.code() })).status).toBe(200);
  });

  it("while limited: a wrong code, an unknown username and a recovery code all get the SAME 429 as today; nothing is consumed", async () => {
    await ctx.flood();
    const before = JSON.stringify(ctx.account());
    const plain = await ctx.login({ password: "anything at all", code: "000000" });
    const wrongCode = await ctx.login({ password: PASSWORD, code: ctx.code() === "123456" ? "654321" : "123456" });
    const unknown = await loginHandler(request({ username: "nobody.here", password: PASSWORD, code: ctx.code() }), ctx.deps);
    const recovery = await ctx.login({ password: PASSWORD, recoveryCode: ctx.codes[0] });
    for (const r of [plain, wrongCode, recovery]) { expect(r.status).toBe(429); expect(r.jsonBody).toEqual(plain.jsonBody); }
    expect(JSON.stringify(ctx.account())).toBe(before);                 // no TOTP step, no recovery code consumed
    // the unknown username has its own (fresh) limit, so it reaches the normal path: the generic 401, never a different answer
    expect([401, 429]).toContain(unknown.status);
  });

  it("an unknown username under a flooded limit answers exactly like the owner's name with a wrong code", async () => {
    for (let i = 0; i < 12; i++) await loginHandler(request({ username: "ghost.user", password: "x".repeat(16), code: "000000" }), { ...ctx.deps, clientIdFromRequest: () => "10.3.0." + (i + 1) });
    await ctx.flood();
    const ghost = await loginHandler(request({ username: "ghost.user", password: PASSWORD, code: ctx.code() }), ctx.deps);
    const owner = await ctx.login({ password: PASSWORD, code: "000000" });
    expect(ghost.status).toBe(429);
    expect(ghost.jsonBody).toEqual(owner.jsonBody);
  });

  it("while limited: the code is checked BEFORE the password — a correct code + wrong password is 401, audited, and the code is spent", async () => {
    await ctx.flood();
    const code = ctx.code();
    const r = await ctx.login({ password: "not the password!!", code });
    expect(r.status).toBe(401);
    expect(r.jsonBody.code).toBe("OWNER_LOGIN_DENIED");
    expect(ctx.audits().some(e => e.action === "owner.login.failed" && e.details?.stage === "password-after-code")).toBe(true);
    // the same code again (even with the right password) is a replay → back to the plain 429
    expect((await ctx.login({ password: PASSWORD, code })).status).toBe(429);
    ctx.clock.now += 30_000;
    expect((await ctx.login({ password: PASSWORD, code: ctx.code() })).status).toBe(200);
  });

  it("while limited: only the CURRENT step passes (not the previous one, which a normal sign-in would accept)", async () => {
    ctx.clock.now += 30_000;                                            // the previous step is now an unused, still-recent one
    await ctx.flood();
    expect((await ctx.login({ password: PASSWORD, code: ctx.code(-30_000) })).status).toBe(429);
    expect((await ctx.login({ password: PASSWORD, code: ctx.code() })).status).toBe(200);
  });

  it("without a flood nothing changes: the previous step still signs in normally", async () => {
    ctx.clock.now += 30_000;
    expect((await ctx.login({ password: PASSWORD, code: ctx.code(-30_000) })).status).toBe(200);
  });

  it("while limited, storage down → 503 (never access)", async () => {
    await ctx.flood();
    const mutating = { ...ctx.deps, reserveLoginAttempt: async () => ({ allowed: false, retryAfterSeconds: 5 }) };
    const realGet = ctx.mem.container.getBlobClient;
    ctx.mem.container.getBlobClient = name => { if (name.startsWith(store.OWNER_PREFIX) || name.startsWith(store.USERNAME_PREFIX)) throw Object.assign(new Error("down"), { statusCode: 500 }); return realGet.call(ctx.mem.container, name); };
    const r = await loginHandler(request({ username: USERNAME, password: PASSWORD, code: ctx.code() }), mutating);
    ctx.mem.container.getBlobClient = realGet;
    expect(r.status).toBe(503);
  });
});
