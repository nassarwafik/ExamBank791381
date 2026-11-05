import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P10-C — the owner changes the password and re-enrols the authenticator from the platform (closes security review O9;
// design docs/enterprise-owner-credentials-p10c.md, owner decisions §19.39):
//   • both need an owner session, a fresh step-up (10 minutes) AND the current password, behind a per-account attempt limit;
//   • after either change every OTHER owner session ends and this device keeps a new token;
//   • re-enrolment keeps the old authenticator valid until a code from the NEW one is proved, then issues 10 new recovery codes
//     and voids the old ones.
// In-memory blob container with real CAS semantics; TEST data only.

process.env.BANK_SETUP_KEY = "p10c-test-root-secret";
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_SESSION_SECRET;

const totp = await import("../src/lib/identity/totp.js");
const store = await import("../src/lib/identity/owner-store.js");
const sess = await import("../src/lib/identity/owner-session.js");
const { createBootstrapMaterial } = await import("../../scripts/owner-bootstrap-token.mjs");
const { handler: bootstrapHandler } = await import("../src/functions/owner-bootstrap.js");
const { handler: loginHandler } = await import("../src/functions/owner-login.js");
const { handler: sessionHandler } = await import("../src/functions/owner-session.js");
const { OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };   // test-only cost; production uses DEFAULT_PARAMS
const T0 = Date.parse("2026-11-05T10:00:00.000Z");
const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "a brand new owner passphrase";
const USERNAME = "tadris.owner";

function request({ method = "POST", action = "", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}
const owner = token => ({ "x-owner-token": token });

async function setup() {
  const material = createBootstrapMaterial({ hours: 2, now: T0 });
  const env = { BANK_SETUP_KEY: "p10c-test-root-secret", OWNER_BOOTSTRAP_TOKEN_SHA256: material.sha256, OWNER_BOOTSTRAP_EXPIRES_AT: material.expiresAt };
  const mem = createMemoryContainer();
  const clock = { now: T0 };
  let ip = 1;
  const deps = { env, getContainer: () => mem.container, now: () => clock.now, hashParams: FAST, clientIdFromRequest: () => "10.0.0." + ip };
  const begin = await bootstrapHandler(request({ action: "begin", body: { token: material.token, username: USERNAME, displayName: "مالك المنصة", password: PASSWORD } }), deps);
  const secret = totp.base32Decode(begin.jsonBody.totp.secret);
  const confirm = await bootstrapHandler(request({ action: "confirm", body: { token: material.token, code: totp.totpAt(secret, clock.now) } }), deps);
  expect(confirm.status).toBe(201);
  const ctx = { env, mem, clock, deps, secret, codes: confirm.jsonBody.recoveryCodes, accountId: confirm.jsonBody.owner.accountId, nextIp: () => { ip += 1; } };
  ctx.tick = () => { clock.now += 30_000; };
  ctx.login = async (extra = {}) => {
    ctx.tick(); ctx.nextIp();
    return loginHandler(request({ body: { username: USERNAME, password: PASSWORD, code: totp.totpAt(ctx.secret, clock.now), ...extra } }), deps);
  };
  ctx.call = (action, token, body = {}) => sessionHandler(request({ action, body, headers: owner(token) }), deps);
  ctx.me = token => sessionHandler(request({ method: "GET", headers: owner(token) }), deps);
  ctx.account = () => mem.getJson(store.ownerAccountName(ctx.accountId));
  ctx.audits = () => mem.names(OWNER_AUDIT_PREFIX).map(n => mem.getJson(n).action);
  return ctx;
}

describe("P10-C owner password change", () => {
  let ctx, token;
  beforeEach(async () => { ctx = await setup(); token = (await ctx.login()).jsonBody.token; });

  it("current password + fresh step-up → the password changes; old password refused, new one accepted", async () => {
    const r = await ctx.call("password", token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(r.status).toBe(200);
    expect(r.jsonBody.ok).toBe(true);
    expect(typeof r.jsonBody.token).toBe("string");
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(ctx.account().passwordChangedAt).toBe(new Date(ctx.clock.now).toISOString());
    expect((await ctx.login()).status).toBe(401);
    expect((await ctx.login({ password: NEW_PASSWORD })).status).toBe(200);
    expect(ctx.audits()).toContain("owner.password.changed");
  });

  it("owner decision: every OTHER owner session ends; this device keeps a NEW token, and its old token stops working", async () => {
    const other = (await ctx.login()).jsonBody.token;
    expect((await ctx.me(other)).status).toBe(200);
    const r = await ctx.call("password", token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(r.status).toBe(200);
    expect((await ctx.me(other)).status).toBe(401);
    expect((await ctx.me(token)).status).toBe(401);
    const fresh = await ctx.me(r.jsonBody.token);
    expect(fresh.status).toBe(200);
    expect(fresh.jsonBody.owner.username).toBe(USERNAME);
    // the old session document of this device is gone; the new one carries the new authVersion
    const oldSid = sess.verifyOwnerToken(token, { nowMs: ctx.clock.now, env: ctx.env }).sid;
    expect(ctx.mem.has(store.ownerSessionName(oldSid))).toBe(false);
    expect(sess.verifyOwnerToken(r.jsonBody.token, { nowMs: ctx.clock.now, env: ctx.env }).av).toBe(ctx.account().authVersion);
  });

  it("a wrong current password is refused (401), audited, and changes nothing", async () => {
    const before = JSON.stringify(ctx.account());
    const r = await ctx.call("password", token, { currentPassword: PASSWORD + "!", newPassword: NEW_PASSWORD });
    expect(r.status).toBe(401);
    expect(r.jsonBody.code).toBe("CURRENT_PASSWORD_INVALID");
    expect(JSON.stringify(ctx.account())).toBe(before);
    expect((await ctx.me(token)).status).toBe(200);
    expect(ctx.audits()).toContain("owner.password.change-failed");
  });

  it("without a fresh step-up: 403 STEP_UP_REQUIRED, nothing changes; after a step-up it works", async () => {
    ctx.clock.now += 11 * 60 * 1000;                     // the sign-in's step-up is older than 10 minutes
    const before = JSON.stringify(ctx.account());
    const r = await ctx.call("password", token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect(JSON.stringify(ctx.account())).toBe(before);
    ctx.tick();
    expect((await ctx.call("step-up", token, { code: totp.totpAt(ctx.secret, ctx.clock.now) })).status).toBe(200);
    expect((await ctx.call("password", token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(200);
  });

  it("the new password follows the owner policy and must differ from the current one", async () => {
    const short = await ctx.call("password", token, { currentPassword: PASSWORD, newPassword: "short pass" });
    expect(short.status).toBe(400);
    expect(short.jsonBody.code).toBe("PASSWORD_TOO_SHORT");
    const withName = await ctx.call("password", token, { currentPassword: PASSWORD, newPassword: "my " + USERNAME + " passphrase" });
    expect(withName.jsonBody.code).toBe("PASSWORD_CONTAINS_USERNAME");
    const same = await ctx.call("password", token, { currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.status).toBe(400);
    expect(same.jsonBody.code).toBe("PASSWORD_SAME");
    const missing = await ctx.call("password", token, { currentPassword: PASSWORD });
    expect(missing.status).toBe(400);
    expect((await ctx.me(token)).status).toBe(200);
  });

  it("guessing the current password from a session is limited (429 after the free attempts)", async () => {
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await ctx.call("password", token, { currentPassword: "wrong guess number " + i, newPassword: NEW_PASSWORD })).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    expect((await ctx.call("password", token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(429);
  });

  it("no owner session → 401; a teacher-style token never reaches it; storage down → 503 and nothing changes", async () => {
    expect((await sessionHandler(request({ action: "password", body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } }), ctx.deps)).status).toBe(401);
    expect((await ctx.call("password", "not-a-token", { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(401);
    const before = JSON.stringify(ctx.account());
    const down = await sessionHandler(request({ action: "password", body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }, headers: owner(token) }), { ...ctx.deps, getContainer: () => { throw new Error("down"); } });
    expect(down.status).toBe(503);
    expect(JSON.stringify(ctx.account())).toBe(before);
  });

  it("the change is written but the new session cannot be created → 200 signInAgain, no token, and the old data never works", async () => {
    const realCreate = ctx.mem.container.getBlockBlobClient;
    let failNext = false;
    ctx.mem.container.getBlockBlobClient = name => {
      const c = realCreate.call(ctx.mem.container, name);
      if (failNext && name.startsWith(store.OWNER_SESSION_PREFIX)) return { ...c, upload: async () => { throw Object.assign(new Error("down"), { statusCode: 500 }); } };
      return c;
    };
    failNext = true;
    const r = await ctx.call("password", token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    failNext = false;
    ctx.mem.container.getBlockBlobClient = realCreate;
    expect(r.status).toBe(200);
    expect(r.jsonBody.signInAgain).toBe(true);
    expect(r.jsonBody.token).toBeUndefined();
    expect((await ctx.me(token)).status).toBe(401);
    expect((await ctx.login()).status).toBe(401);
    expect((await ctx.login({ password: NEW_PASSWORD })).status).toBe(200);
  });
});

describe("P10-C owner authenticator re-enrolment", () => {
  let ctx, token;
  beforeEach(async () => { ctx = await setup(); token = (await ctx.login()).jsonBody.token; });

  async function begin(t = token) {
    const r = await ctx.call("totp-begin", t, { currentPassword: PASSWORD });
    expect(r.status).toBe(200);
    return totp.base32Decode(r.jsonBody.totp.secret);
  }

  it("begin needs the current password; it returns a NEW secret + otpauth URI and the OLD authenticator still works", async () => {
    const wrong = await ctx.call("totp-begin", token, { currentPassword: "not the password!!" });
    expect(wrong.status).toBe(401);
    expect(wrong.jsonBody.code).toBe("CURRENT_PASSWORD_INVALID");
    const r = await ctx.call("totp-begin", token, { currentPassword: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.jsonBody.totp.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(r.jsonBody.totp.account).toBe(USERNAME);
    expect(r.jsonBody.expiresInSeconds).toBe(900);
    const fresh = totp.base32Decode(r.jsonBody.totp.secret);
    expect(Buffer.compare(fresh, ctx.secret)).not.toBe(0);
    const acc = ctx.account();
    expect(acc.mfa.pendingTotp.expiresAtMs).toBe(ctx.clock.now + 900_000);
    expect(JSON.stringify(acc.mfa.pendingTotp)).not.toContain(r.jsonBody.totp.secret);   // sealed, never the plain secret
    expect((await ctx.login()).status).toBe(200);                                         // old authenticator still valid
    expect(ctx.audits()).toContain("owner.totp.reenrol-started");
  });

  it("confirm with a code from the NEW app → the new app works, the old one is refused, 10 new recovery codes replace the old", async () => {
    const other = (await ctx.login()).jsonBody.token;
    const fresh = await begin();
    ctx.tick();
    const r = await ctx.call("totp-confirm", token, { code: totp.totpAt(fresh, ctx.clock.now) });
    expect(r.status).toBe(200);
    expect(r.jsonBody.recoveryCodes).toHaveLength(10);
    expect(new Set(r.jsonBody.recoveryCodes).size).toBe(10);
    expect(r.jsonBody.recoveryCodes.some(c => ctx.codes.includes(c))).toBe(false);
    expect(ctx.account().mfa.pendingTotp).toBeUndefined();
    // sessions: others ended, this device kept with a new token
    expect((await ctx.me(other)).status).toBe(401);
    expect((await ctx.me(token)).status).toBe(401);
    expect((await ctx.me(r.jsonBody.token)).jsonBody.recoveryCodesRemaining).toBe(10);
    // factors
    expect((await ctx.login()).status).toBe(401);                                          // the OLD app
    ctx.secret = fresh;
    expect((await ctx.login()).status).toBe(200);                                          // the NEW app
    ctx.nextIp();
    expect((await loginHandler(request({ body: { username: USERNAME, password: PASSWORD, recoveryCode: ctx.codes[0] } }), ctx.deps)).status).toBe(401);
    ctx.nextIp();
    expect((await loginHandler(request({ body: { username: USERNAME, password: PASSWORD, recoveryCode: r.jsonBody.recoveryCodes[0] } }), ctx.deps)).status).toBe(200);
    expect(ctx.audits()).toContain("owner.totp.reenrolled");
  });

  it("a code from the OLD app or a wrong code never confirms; the old app and the old codes stay valid", async () => {
    await begin();
    ctx.tick();
    const old = await ctx.call("totp-confirm", token, { code: totp.totpAt(ctx.secret, ctx.clock.now) });
    expect(old.status).toBe(401);
    expect(old.jsonBody.code).toBe("TOTP_INVALID");
    expect((await ctx.call("totp-confirm", token, { code: "000000" })).status).toBe(401);
    expect(ctx.account().mfa.pendingTotp).toBeTruthy();
    expect((await ctx.me(token)).status).toBe(200);
    ctx.nextIp();
    expect((await loginHandler(request({ body: { username: USERNAME, password: PASSWORD, recoveryCode: ctx.codes[1] } }), ctx.deps)).status).toBe(200);
  });

  it("confirm without a begin, or after the 15-minute window → 409 TOTP_REENROL_NOT_STARTED", async () => {
    expect((await ctx.call("totp-confirm", token, { code: "123456" })).jsonBody.code).toBe("TOTP_REENROL_NOT_STARTED");
    const fresh = await begin();
    ctx.clock.now += 9 * 60 * 1000;
    expect((await ctx.call("step-up", token, { code: totp.totpAt(ctx.secret, ctx.clock.now) })).status).toBe(200);
    ctx.clock.now += 7 * 60 * 1000;                                                           // 16 minutes after begin
    const late = await ctx.call("totp-confirm", token, { code: totp.totpAt(fresh, ctx.clock.now) });
    expect(late.status).toBe(409);
    expect(late.jsonBody.code).toBe("TOTP_REENROL_NOT_STARTED");
  });

  it("two concurrent confirms: exactly one succeeds, so recovery codes are issued once", async () => {
    const fresh = await begin();
    ctx.tick();
    const code = totp.totpAt(fresh, ctx.clock.now);
    const results = await Promise.all([ctx.call("totp-confirm", token, { code }), ctx.call("totp-confirm", token, { code })]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 200)[0].jsonBody.recoveryCodes).toHaveLength(10);
  });

  it("without a fresh step-up both steps answer 403 STEP_UP_REQUIRED", async () => {
    ctx.clock.now += 11 * 60 * 1000;
    expect((await ctx.call("totp-begin", token, { currentPassword: PASSWORD })).jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect((await ctx.call("totp-confirm", token, { code: "123456" })).jsonBody.code).toBe("STEP_UP_REQUIRED");
    expect(ctx.account().mfa.pendingTotp).toBeUndefined();
  });

  it("lost phone: sign in with a recovery code → re-enrol a new phone in the same 10 minutes", async () => {
    ctx.nextIp();
    const viaCode = await loginHandler(request({ body: { username: USERNAME, password: PASSWORD, recoveryCode: ctx.codes[2] } }), ctx.deps);
    expect(viaCode.status).toBe(200);
    const t = viaCode.jsonBody.token;
    const fresh = await begin(t);
    ctx.tick();
    const r = await ctx.call("totp-confirm", t, { code: totp.totpAt(fresh, ctx.clock.now) });
    expect(r.status).toBe(200);
    expect((await ctx.me(token)).status).toBe(401);       // the session opened with the lost phone ended
  });
});
