import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P1-A — platform-owner identity: bootstrap (D3), password hashing (D2), TOTP + recovery codes (D4),
// owner sessions with step-up (D5). Everything runs against the in-memory blob container with real CAS semantics and
// TEST data only.

process.env.BANK_SETUP_KEY = "p1a-test-root-secret";
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_SESSION_SECRET;

const ph = await import("../src/lib/identity/password-hash.js");
const totp = await import("../src/lib/identity/totp.js");
const box = await import("../src/lib/identity/secret-box.js");
const rc = await import("../src/lib/identity/recovery-codes.js");
const policy = await import("../src/lib/identity/password-policy.js");
const boot = await import("../src/lib/identity/owner-bootstrap.js");
const store = await import("../src/lib/identity/owner-store.js");
const sess = await import("../src/lib/identity/owner-session.js");
const { createBootstrapMaterial } = await import("../../scripts/owner-bootstrap-token.mjs");
const { handler: bootstrapHandler } = await import("../src/functions/owner-bootstrap.js");
const { handler: loginHandler } = await import("../src/functions/owner-login.js");
const { handler: sessionHandler } = await import("../src/functions/owner-session.js");
const { createBuilderToken, verifyBuilderToken, requireBuilderAuth } = await import("../src/lib/builder-auth.js");
const { createStudentToken, verifyStudentToken } = await import("../src/lib/student-auth.js");
const { AUDIT_PREFIX, OWNER_AUDIT_PREFIX } = await import("../src/lib/audit-log.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };   // test-only cost; production uses DEFAULT_PARAMS
const T0 = Date.parse("2026-11-01T10:00:00.000Z");
const PASSWORD = "correct horse battery staple";
const USERNAME = "tadris.owner";

function request({ method = "POST", action = "", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: { action }, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}

function setup() {
  const material = createBootstrapMaterial({ hours: 2, now: T0 });
  const env = { BANK_SETUP_KEY: "p1a-test-root-secret", OWNER_BOOTSTRAP_TOKEN_SHA256: material.sha256, OWNER_BOOTSTRAP_EXPIRES_AT: material.expiresAt };
  const mem = createMemoryContainer();
  const clock = { now: T0 };
  let ip = 1;
  const deps = { env, getContainer: () => mem.container, now: () => clock.now, hashParams: FAST, clientIdFromRequest: () => "10.0.0." + ip };
  return { material, env, mem, clock, deps, nextIp: () => { ip += 1; } };
}


async function bootstrap(ctx) {
  const begin = await bootstrapHandler(request({ action: "begin", body: { token: ctx.material.token, username: USERNAME, displayName: "مالك المنصة", password: PASSWORD } }), ctx.deps);
  expect(begin.status).toBe(200);
  const secret = totp.base32Decode(begin.jsonBody.totp.secret);
  const confirm = await bootstrapHandler(request({ action: "confirm", body: { token: ctx.material.token, code: totp.totpAt(secret, ctx.clock.now) } }), ctx.deps);
  expect(confirm.status).toBe(201);
  return { secret, begin, confirm };
}

async function login(ctx, secret, extra = {}) {
  return loginHandler(request({ body: { username: USERNAME, password: PASSWORD, code: totp.totpAt(secret, ctx.clock.now), ...extra } }), ctx.deps);
}

const ownerHeaders = token => ({ "x-owner-token": token });

// ── Building blocks ──────────────────────────────────────────────────────────
describe("P1-A password hashing (D2: scrypt, parameters stored with the hash)", () => {
  it("production defaults are N=2^17, r=8, p=1, 64-byte key (pin)", () => {
    expect(ph.DEFAULT_PARAMS).toEqual({ N: 131072, r: 8, p: 1, keyLen: 64 });
  });
  it("the production parameters really hash and verify (maxmem is sized for 128 MiB)", async () => {
    const record = await ph.hashSecret("a long enough owner passphrase");
    expect(record).toMatchObject({ algo: "scrypt", N: 131072, r: 8, p: 1, keyLen: 64 });
    expect(await ph.verifySecret("a long enough owner passphrase", record)).toBe(true);
    expect(ph.needsRehash(record)).toBe(false);
  });
  it("round-trips, rejects a wrong secret, and never stores the plaintext", async () => {
    const record = await ph.hashSecret(PASSWORD, { params: FAST });
    expect(JSON.stringify(record)).not.toContain(PASSWORD);
    expect(await ph.verifySecret(PASSWORD, record)).toBe(true);
    expect(await ph.verifySecret(PASSWORD + "x", record)).toBe(false);
    expect(ph.needsRehash(record)).toBe(true);
  });
  it("fails closed on a malformed or out-of-window record", async () => {
    const good = await ph.hashSecret(PASSWORD, { params: FAST });
    for (const bad of [{ ...good, N: 2 ** 25 }, { ...good, N: 1000 }, { ...good, r: 1 }, { ...good, p: 9 }, { ...good, algo: "md5" },
      { ...good, hash: good.hash.slice(0, 10) }, { ...good, salt: "" }, null, {}]) {
      expect(await ph.verifySecret(PASSWORD, bad)).toBe(false);
    }
    expect(await ph.verifySecret("", good)).toBe(false);
  });
  it("a GENUINE hash made with parameters below the accepted floor (N=2^10) is refused", async () => {
    const salt = crypto.randomBytes(16);
    const weak = { algo: "scrypt", N: 1024, r: 8, p: 1, keyLen: 64, salt: salt.toString("base64"), hash: crypto.scryptSync(PASSWORD, salt, 64, { N: 1024, r: 8, p: 1 }).toString("base64") };
    expect(await ph.verifySecret(PASSWORD, weak)).toBe(false);
    expect(await ph.verifySecret(PASSWORD, { ...weak, N: 16384, hash: crypto.scryptSync(PASSWORD, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64") })).toBe(true);
  });
});

describe("P1-A TOTP (RFC 6238)", () => {
  const rfcSecret = Buffer.from("12345678901234567890", "ascii");
  it("matches the RFC 6238 SHA-1 test vectors (8 digits)", () => {
    expect(totp.hotp(rfcSecret, totp.stepAt(59 * 1000), 8)).toBe("94287082");
    expect(totp.hotp(rfcSecret, totp.stepAt(1111111109 * 1000), 8)).toBe("07081804");
    expect(totp.hotp(rfcSecret, totp.stepAt(1234567890 * 1000), 8)).toBe("89005924");
    expect(totp.hotp(rfcSecret, totp.stepAt(20000000000 * 1000), 8)).toBe("65353130");
  });
  it("base32 follows RFC 4648 and round-trips", () => {
    expect(totp.base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    const s = totp.generateTotpSecret();
    expect(totp.base32Decode(totp.base32Encode(s)).equals(s)).toBe(true);
    expect(totp.base32Decode("not base32!")).toBeNull();
  });
  it("accepts ±1 step, rejects ±2 steps and malformed codes", () => {
    const s = totp.generateTotpSecret();
    for (const d of [-30000, 0, 30000]) expect(totp.verifyTotp(s, totp.totpAt(s, T0 + d), { nowMs: T0 }).ok).toBe(true);
    for (const d of [-60000, 60000]) expect(totp.verifyTotp(s, totp.totpAt(s, T0 + d), { nowMs: T0 }).ok).toBe(false);
    for (const bad of ["", "12345", "1234567", "abcdef", null]) expect(totp.verifyTotp(s, bad, { nowMs: T0 }).ok).toBe(false);
  });
  it("refuses a replay: a step not newer than lastUsedStep", () => {
    const s = totp.generateTotpSecret();
    const r = totp.verifyTotp(s, totp.totpAt(s, T0), { nowMs: T0 });
    expect(r.ok).toBe(true);
    expect(totp.verifyTotp(s, totp.totpAt(s, T0), { nowMs: T0, lastUsedStep: r.step }).ok).toBe(false);
    expect(totp.verifyTotp(s, totp.totpAt(s, T0 + 30000), { nowMs: T0 + 30000, lastUsedStep: r.step }).ok).toBe(true);
  });
  it("builds a standard otpauth URI", () => {
    const s = Buffer.from("12345678901234567890");
    const uri = totp.otpauthUri({ issuer: "Tadris+", account: "tadris.owner", secret: s });
    expect(uri.startsWith("otpauth://totp/Tadris%2B:tadris.owner?")).toBe(true);
    expect(uri).toContain("secret=" + totp.base32Encode(s));
    expect(uri).toContain("digits=6");
  });
});

describe("P1-A secret box (AES-256-GCM, bound to purpose and account)", () => {
  const env = { BANK_SETUP_KEY: "root-a" };
  it("round-trips; any other purpose, account, root secret or a tampered box does not open", () => {
    const sealed = box.sealSecret(Buffer.from("totp-secret"), { purpose: "owner-totp", aad: "own_1", env });
    expect(JSON.stringify(sealed)).not.toContain("totp-secret");
    expect(box.openSecret(sealed, { purpose: "owner-totp", aad: "own_1", env }).toString()).toBe("totp-secret");
    expect(box.openSecret(sealed, { purpose: "other", aad: "own_1", env })).toBeNull();
    expect(box.openSecret(sealed, { purpose: "owner-totp", aad: "own_2", env })).toBeNull();
    expect(box.openSecret(sealed, { purpose: "owner-totp", aad: "own_1", env: { BANK_SETUP_KEY: "root-b" } })).toBeNull();
    const flipped = { ...sealed, ct: Buffer.from(Buffer.from(sealed.ct, "base64").map((b, i) => i === 0 ? b ^ 1 : b)).toString("base64") };
    expect(box.openSecret(flipped, { purpose: "owner-totp", aad: "own_1", env })).toBeNull();
    expect(box.openSecret(null, { purpose: "owner-totp", aad: "own_1", env })).toBeNull();
  });
});

describe("P1-A recovery codes and password policy", () => {
  it("10 unique codes, only hashes stored, each usable once, input normalized", () => {
    const { codes, records } = rc.generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(JSON.stringify(records)).not.toContain(codes[0]);
    const i = rc.findUnusedRecoveryCode(records, codes[3].toLowerCase().replace(/-/g, " "));
    expect(i).toBe(3);
    records[3].usedAt = "x";
    expect(rc.findUnusedRecoveryCode(records, codes[3])).toBe(-1);
    expect(rc.remainingRecoveryCodes(records)).toBe(9);
    expect(rc.findUnusedRecoveryCode(records, "nope")).toBe(-1);
  });
  it("owner passwords: ≥14 characters, not containing the username, not repetitive", () => {
    expect(policy.checkPassword("short-pass", { role: "owner" })).toMatchObject({ ok: false, code: "TOO_SHORT", min: 14 });
    expect(policy.checkPassword("my-tadris.owner-pass", { username: "tadris.owner" })).toMatchObject({ ok: false, code: "CONTAINS_USERNAME" });
    expect(policy.checkPassword("aaaaabbbbbaaaaabbbbb")).toMatchObject({ ok: false, code: "REPETITIVE" });
    expect(policy.checkPassword("passwordpassword")).toMatchObject({ ok: false, code: "TOO_COMMON" });
    expect(policy.checkPassword(PASSWORD, { username: USERNAME })).toEqual({ ok: true });
  });
  it("usernames: lower-case after NFKC, never digits only (an identity number is never a login name)", () => {
    expect(store.validUsername("  Tadris.Owner ")).toBe("tadris.owner");
    expect(store.validUsername("123456789")).toBeNull();
    expect(store.validUsername("ab")).toBeNull();
    expect(store.validUsername("a..b")).toBeNull();
    expect(store.validUsername("bad name")).toBeNull();
  });
});

describe("P1-A bootstrap configuration (D3)", () => {
  const m = createBootstrapMaterial({ hours: 2, now: T0 });
  it("states: not-configured / misconfigured / expired / open; a window over 24 h is refused", () => {
    expect(boot.bootstrapConfig({}, T0).state).toBe("not-configured");
    expect(boot.bootstrapConfig({ OWNER_BOOTSTRAP_TOKEN_SHA256: "abc", OWNER_BOOTSTRAP_EXPIRES_AT: m.expiresAt }, T0).state).toBe("misconfigured");
    expect(boot.bootstrapConfig({ OWNER_BOOTSTRAP_TOKEN_SHA256: m.sha256 }, T0).state).toBe("misconfigured");
    expect(boot.bootstrapConfig({ OWNER_BOOTSTRAP_TOKEN_SHA256: m.sha256, OWNER_BOOTSTRAP_EXPIRES_AT: m.expiresAt }, T0 + 3 * 3600e3).state).toBe("expired");
    expect(boot.bootstrapConfig({ OWNER_BOOTSTRAP_TOKEN_SHA256: m.sha256, OWNER_BOOTSTRAP_EXPIRES_AT: new Date(T0 + 30 * 3600e3).toISOString() }, T0).state).toBe("misconfigured");
    const open = boot.bootstrapConfig({ OWNER_BOOTSTRAP_TOKEN_SHA256: m.sha256.toUpperCase(), OWNER_BOOTSTRAP_EXPIRES_AT: m.expiresAt }, T0);
    expect(open.state).toBe("open");
  });
  it("the operator script's token matches its printed hash; other tokens do not", () => {
    expect(boot.bootstrapTokenMatches(m.token, m.sha256)).toBe(true);
    expect(boot.bootstrapTokenMatches(createBootstrapMaterial({ now: T0 }).token, m.sha256)).toBe(false);
    expect(boot.bootstrapTokenMatches("", m.sha256)).toBe(false);
    expect(boot.bootstrapTokenMatches(m.sha256, m.sha256)).toBe(false);
    expect(() => createBootstrapMaterial({ hours: 25 })).toThrow();
  });
});

describe("P1-A owner tokens are a separate role context", () => {
  it("an owner token never verifies as a teacher or student token, and neither verifies as an owner token", () => {
    const { token } = sess.createOwnerToken({ accountId: "own_0123456789abcdef", sid: "a".repeat(32), authVersion: 1 });
    expect(sess.verifyOwnerToken(token)).toMatchObject({ role: "owner", sub: "own_0123456789abcdef" });
    expect(verifyBuilderToken(token)).toBeNull();
    expect(verifyStudentToken(token)).toBeNull();
    expect(requireBuilderAuth(request({ headers: { authorization: "Bearer " + token } })).ok).toBe(false);
    expect(sess.verifyOwnerToken(createBuilderToken("t1"))).toBeNull();
    expect(sess.verifyOwnerToken(createStudentToken({ userId: "u1", authVersion: 1 }))).toBeNull();
  });
  it("a correctly signed owner-context token with another role, or a lifetime over 2 h, is rejected", () => {
    const key = crypto.createHmac("sha256", process.env.BANK_SETUP_KEY).update(sess.OWNER_CONTEXT).digest();
    const sign = payload => { const e = Buffer.from(JSON.stringify(payload)).toString("base64url"); return e + "." + crypto.createHmac("sha256", key).update(e).digest("base64url"); };
    const iat = Math.floor(T0 / 1000);
    const base = { ver: 1, role: "owner", sub: "own_0123456789abcdef", sid: "d".repeat(32), av: 1, iat, exp: iat + 3600 };
    expect(sess.verifyOwnerToken(sign(base), { nowMs: T0 })).not.toBeNull();
    expect(sess.verifyOwnerToken(sign({ ...base, role: "teacher" }), { nowMs: T0 })).toBeNull();
    expect(sess.verifyOwnerToken(sign({ ...base, exp: iat + 10 * 3600 }), { nowMs: T0 })).toBeNull();
    expect(sess.verifyOwnerToken(sign({ ...base, av: 0 }), { nowMs: T0 })).toBeNull();
  });
  it("tampered, expired or over-long tokens are rejected", () => {
    const { token } = sess.createOwnerToken({ accountId: "own_0123456789abcdef", sid: "b".repeat(32), authVersion: 1 }, { nowMs: T0 });
    const [enc, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(enc, "base64url")), av: 2 })).toString("base64url");
    expect(sess.verifyOwnerToken(forged + "." + sig, { nowMs: T0 })).toBeNull();
    expect(sess.verifyOwnerToken(token, { nowMs: T0 + 2 * 3600e3 })).toBeNull();
    expect(sess.verifyOwnerToken(token, { nowMs: T0 + 3600e3 })).not.toBeNull();
    expect(sess.verifyOwnerToken("x".repeat(3000))).toBeNull();
  });
});

// ── Bootstrap flow ───────────────────────────────────────────────────────────
describe("P1-A bootstrap flow", () => {
  let ctx;
  beforeEach(() => { ctx = setup(); });

  it("GET reports unavailable without settings and open with valid settings — never a value", async () => {
    const noStorage = () => { throw new Error("storage must not be touched without bootstrap settings"); };
    const none = await bootstrapHandler(request({ method: "GET" }), { ...ctx.deps, env: {}, getContainer: noStorage });
    expect(none.jsonBody).toEqual({ ok: true, state: "unavailable" });
    const open = await bootstrapHandler(request({ method: "GET" }), ctx.deps);
    expect(open.jsonBody).toEqual({ ok: true, state: "open" });
    expect(JSON.stringify(open.jsonBody)).not.toContain(ctx.material.sha256);
  });

  it("without valid settings every POST is 404 (no default owner can ever be created)", async () => {
    for (const env of [{}, { ...ctx.env, OWNER_BOOTSTRAP_EXPIRES_AT: new Date(T0 - 1).toISOString() }]) {
      const r = await bootstrapHandler(request({ action: "begin", body: { token: ctx.material.token, username: USERNAME, displayName: "x", password: PASSWORD } }), { ...ctx.deps, env, getContainer: () => { throw new Error("no storage call expected"); } });
      expect(r.status).toBe(404);
    }
    expect(ctx.mem.names("platform/accounts/")).toEqual([]);
  });

  it("a wrong token is refused before anything is stored", async () => {
    const r = await bootstrapHandler(request({ action: "begin", body: { token: createBootstrapMaterial({ now: T0 }).token, username: USERNAME, displayName: "x", password: PASSWORD } }), ctx.deps);
    expect(r.status).toBe(401);
    expect(ctx.mem.has(store.BOOTSTRAP_PENDING)).toBe(false);
  });

  it("begin validates username, display name and password policy", async () => {
    const base = { token: ctx.material.token, username: USERNAME, displayName: "مالك", password: PASSWORD };
    for (const [patch, code] of [[{ username: "12345678" }, "USERNAME_INVALID"], [{ displayName: "" }, "DISPLAY_NAME_INVALID"], [{ password: "too-short" }, "PASSWORD_TOO_SHORT"]]) {
      const r = await bootstrapHandler(request({ action: "begin", body: { ...base, ...patch } }), ctx.deps);
      expect(r.status).toBe(400);
      expect(r.jsonBody.code).toBe(code);
    }
  });

  it("begin → confirm creates exactly one active owner; secrets are hashed or sealed; codes are shown once", async () => {
    const { begin, confirm } = await bootstrap(ctx);
    expect(begin.jsonBody.totp.uri.startsWith("otpauth://totp/")).toBe(true);
    expect(confirm.jsonBody.recoveryCodes).toHaveLength(10);
    const accountId = confirm.jsonBody.owner.accountId;
    expect(accountId).toMatch(store.ACCOUNT_ID_RE);
    const account = ctx.mem.getJson(store.ownerAccountName(accountId));
    expect(account).toMatchObject({ role: "owner", status: "active", username: USERNAME, authVersion: 1, organizationId: "default" });
    const raw = JSON.stringify(account);
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain(begin.jsonBody.totp.secret);
    for (const c of confirm.jsonBody.recoveryCodes) expect(raw).not.toContain(c);
    expect(ctx.mem.getJson(store.BOOTSTRAP_MARKER)).toMatchObject({ accountId });
    expect(ctx.mem.getJson(store.usernameReservationName(USERNAME))).toMatchObject({ accountId, role: "owner" });
    expect(ctx.mem.has(store.BOOTSTRAP_PENDING)).toBe(false);
    expect(ctx.mem.names(OWNER_AUDIT_PREFIX).length).toBe(1);
    expect(ctx.mem.names(AUDIT_PREFIX)).toEqual([]);
  });

  it("after completion the route is closed for good (410), even with the settings still in place", async () => {
    await bootstrap(ctx);
    const again = await bootstrapHandler(request({ action: "begin", body: { token: ctx.material.token, username: "second.owner", displayName: "x", password: PASSWORD } }), ctx.deps);
    expect(again.status).toBe(410);
    const confirm = await bootstrapHandler(request({ action: "confirm", body: { token: ctx.material.token, code: "000000" } }), ctx.deps);
    expect(confirm.status).toBe(410);
    const state = await bootstrapHandler(request({ method: "GET" }), ctx.deps);
    expect(state.jsonBody).toEqual({ ok: true, state: "completed", removeBootstrapSettings: true });
    expect(ctx.mem.names(store.OWNER_PREFIX)).toHaveLength(1);
  });

  it("a wrong authenticator code does not create the owner", async () => {
    await bootstrapHandler(request({ action: "begin", body: { token: ctx.material.token, username: USERNAME, displayName: "x", password: PASSWORD } }), ctx.deps);
    const r = await bootstrapHandler(request({ action: "confirm", body: { token: ctx.material.token, code: "000000" } }), ctx.deps);
    expect(r.status).toBe(401);
    expect(ctx.mem.has(store.BOOTSTRAP_MARKER)).toBe(false);
    expect(ctx.mem.names(store.OWNER_PREFIX)).toEqual([]);
  });

  it("an expired pending setup must be restarted", async () => {
    const begin = await bootstrapHandler(request({ action: "begin", body: { token: ctx.material.token, username: USERNAME, displayName: "x", password: PASSWORD } }), ctx.deps);
    ctx.clock.now = T0 + 16 * 60 * 1000;
    const secret = totp.base32Decode(begin.jsonBody.totp.secret);
    const r = await bootstrapHandler(request({ action: "confirm", body: { token: ctx.material.token, code: totp.totpAt(secret, ctx.clock.now) } }), ctx.deps);
    expect(r.status).toBe(409);
    expect(r.jsonBody.code).toBe("BOOTSTRAP_NOT_STARTED");
  });

  it("two concurrent confirms create ONE owner (create-only marker and account)", async () => {
    const begin = await bootstrapHandler(request({ action: "begin", body: { token: ctx.material.token, username: USERNAME, displayName: "x", password: PASSWORD } }), ctx.deps);
    const code = totp.totpAt(totp.base32Decode(begin.jsonBody.totp.secret), ctx.clock.now);
    const results = await Promise.all([0, 1].map(() => bootstrapHandler(request({ action: "confirm", body: { token: ctx.material.token, code } }), ctx.deps)));
    expect(results.map(r => r.status).sort()).toEqual([201, 410]);
    expect(ctx.mem.names(store.OWNER_PREFIX)).toHaveLength(1);
  });

  it("confirm with a wrong bootstrap token is refused even after a valid begin", async () => {
    const begin = await bootstrapHandler(request({ action: "begin", body: { token: ctx.material.token, username: USERNAME, displayName: "x", password: PASSWORD } }), ctx.deps);
    const code = totp.totpAt(totp.base32Decode(begin.jsonBody.totp.secret), ctx.clock.now);
    const r = await bootstrapHandler(request({ action: "confirm", body: { token: createBootstrapMaterial({ now: T0 }).token, code } }), ctx.deps);
    expect(r.status).toBe(401);
    expect(ctx.mem.has(store.BOOTSTRAP_MARKER)).toBe(false);
    expect(ctx.mem.names(store.OWNER_PREFIX)).toEqual([]);
  });

  it("two confirms racing in lockstep (no throttle serialization) still create ONE owner and show the codes once", async () => {
    const lockstep = { ...ctx.deps, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {} };
    const begin = await bootstrapHandler(request({ action: "begin", body: { token: ctx.material.token, username: USERNAME, displayName: "x", password: PASSWORD } }), lockstep);
    const code = totp.totpAt(totp.base32Decode(begin.jsonBody.totp.secret), ctx.clock.now);
    const fresh = await Promise.all([0, 1].map(() => bootstrapHandler(request({ action: "confirm", body: { token: ctx.material.token, code } }), lockstep)));
    expect(fresh.map(r => r.status).sort()).toEqual([201, 410]);
    expect(ctx.mem.names(store.OWNER_PREFIX)).toHaveLength(1);
  });

  it("two lockstep confirms resuming after the marker: the account is created once, never overwritten", async () => {
    const lockstep = { ...ctx.deps, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {} };
    const begin = await bootstrapHandler(request({ action: "begin", body: { token: ctx.material.token, username: USERNAME, displayName: "x", password: PASSWORD } }), lockstep);
    const pending = ctx.mem.getJson(store.BOOTSTRAP_PENDING);
    ctx.mem.setJson(store.BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: pending.accountId, completedAtMs: T0 });
    const code = totp.totpAt(totp.base32Decode(begin.jsonBody.totp.secret), ctx.clock.now);
    const results = await Promise.all([0, 1].map(() => bootstrapHandler(request({ action: "confirm", body: { token: ctx.material.token, code } }), lockstep)));
    expect(results.map(r => r.status).sort()).toEqual([201, 410]);
    const winner = results.find(r => r.status === 201);
    const stored = ctx.mem.getJson(store.ownerAccountName(pending.accountId));
    expect(rc.findUnusedRecoveryCode(stored.mfa.recoveryCodes, winner.jsonBody.recoveryCodes[0])).toBe(0);
  });

  it("a confirm interrupted after the marker resumes for the same pending owner only", async () => {
    const begin = await bootstrapHandler(request({ action: "begin", body: { token: ctx.material.token, username: USERNAME, displayName: "x", password: PASSWORD } }), ctx.deps);
    const pending = ctx.mem.getJson(store.BOOTSTRAP_PENDING);
    ctx.mem.setJson(store.BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: pending.accountId, completedAtMs: T0 });
    const code = totp.totpAt(totp.base32Decode(begin.jsonBody.totp.secret), ctx.clock.now);
    const r = await bootstrapHandler(request({ action: "confirm", body: { token: ctx.material.token, code } }), ctx.deps);
    expect(r.status).toBe(201);
    expect(r.jsonBody.owner.accountId).toBe(pending.accountId);
  });

  it("a marker for ANOTHER account closes the route (no second owner through resume)", async () => {
    const begin = await bootstrapHandler(request({ action: "begin", body: { token: ctx.material.token, username: USERNAME, displayName: "x", password: PASSWORD } }), ctx.deps);
    ctx.mem.setJson(store.BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: "own_ffffffffffffffff", completedAtMs: T0 });
    const code = totp.totpAt(totp.base32Decode(begin.jsonBody.totp.secret), ctx.clock.now);
    const r = await bootstrapHandler(request({ action: "confirm", body: { token: ctx.material.token, code } }), ctx.deps);
    expect(r.status).toBe(410);
    expect(ctx.mem.names(store.OWNER_PREFIX)).toEqual([]);
  });

  it("bootstrap attempts are throttled", async () => {
    const wrong = createBootstrapMaterial({ now: T0 }).token;
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await bootstrapHandler(request({ action: "begin", body: { token: wrong, username: USERNAME, displayName: "x", password: PASSWORD } }), ctx.deps)).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it("storage failure answers 503, never success", async () => {
    const r = await bootstrapHandler(request({ action: "begin", body: {} }), { ...ctx.deps, getContainer: () => { throw new Error("down"); } });
    expect(r.status).toBe(503);
    const broken = { getBlobClient: () => ({ download: async () => { const e = new Error("boom"); e.statusCode = 500; throw e; } }) };
    const r2 = await bootstrapHandler(request({ method: "GET" }), { ...ctx.deps, getContainer: () => broken });
    expect(r2.status).toBe(503);
  });
});

// ── Login + session ──────────────────────────────────────────────────────────
describe("P1-A owner login and session", () => {
  let ctx, secret, codes;
  beforeEach(async () => {
    ctx = setup();
    const b = await bootstrap(ctx);
    secret = b.secret;
    codes = b.confirm.jsonBody.recoveryCodes;
    ctx.clock.now += 30_000;            // the bootstrap consumed the current step
  });

  it("username + password + TOTP → a 2-hour token backed by a server session", async () => {
    const r = await login(ctx, secret);
    expect(r.status).toBe(200);
    expect(r.jsonBody.expiresInSeconds).toBe(7200);
    expect(r.jsonBody.recoveryCodesRemaining).toBe(10);
    const payload = sess.verifyOwnerToken(r.jsonBody.token, { nowMs: ctx.clock.now, env: ctx.env });
    expect(ctx.mem.has(store.ownerSessionName(payload.sid))).toBe(true);
    const me = await sessionHandler(request({ method: "GET", headers: ownerHeaders(r.jsonBody.token) }), ctx.deps);
    expect(me.status).toBe(200);
    expect(me.jsonBody.owner.username).toBe(USERNAME);
  });

  it("the code consumed by the bootstrap cannot be replayed to sign in", async () => {
    const r = await loginHandler(request({ body: { username: USERNAME, password: PASSWORD, code: totp.totpAt(secret, ctx.clock.now - 30_000) } }), ctx.deps);
    expect(r.status).toBe(401);
  });

  it("every failure is the same generic 401 (unknown user / wrong password / wrong code / replay)", async () => {
    const good = totp.totpAt(secret, ctx.clock.now);
    const cases = [
      { username: "nobody.here", password: PASSWORD, code: good },
      { username: USERNAME, password: PASSWORD + "!", code: good },
      { username: USERNAME, password: PASSWORD, code: "000000" }
    ];
    const bodies = [];
    for (const body of cases) { ctx.nextIp(); const r = await loginHandler(request({ body }), ctx.deps); expect(r.status).toBe(401); bodies.push(r.jsonBody); }
    expect(new Set(bodies.map(b => JSON.stringify(b))).size).toBe(1);
    ctx.nextIp();
    expect((await login(ctx, secret)).status).toBe(200);
    ctx.nextIp();
    expect((await login(ctx, secret)).status).toBe(401);   // same step again = replay
  });

  it("concurrent logins with the same code: exactly one succeeds", async () => {
    const results = await Promise.all([0, 1, 2].map(() => login(ctx, secret)));
    expect(results.map(r => r.status).sort()).toEqual([200, 401, 401]);
  });

  it("a recovery code works exactly once", async () => {
    const first = await loginHandler(request({ body: { username: USERNAME, password: PASSWORD, recoveryCode: codes[0] } }), ctx.deps);
    expect(first.status).toBe(200);
    expect(first.jsonBody.recoveryCodesRemaining).toBe(9);
    const again = await loginHandler(request({ body: { username: USERNAME, password: PASSWORD, recoveryCode: codes[0] } }), ctx.deps);
    expect(again.status).toBe(401);
  });

  it("a suspended owner cannot sign in, and an existing session stops working", async () => {
    const r = await login(ctx, secret);
    const accountId = r.jsonBody.owner.accountId;
    const doc = ctx.mem.getJson(store.ownerAccountName(accountId));
    ctx.mem.setJson(store.ownerAccountName(accountId), { ...doc, status: "suspended" });
    const me = await sessionHandler(request({ method: "GET", headers: ownerHeaders(r.jsonBody.token) }), ctx.deps);
    expect(me.status).toBe(401);
    ctx.clock.now += 30_000;
    expect((await login(ctx, secret)).status).toBe(401);
  });

  it("login attempts are throttled per username", async () => {
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await loginHandler(request({ body: { username: USERNAME, password: "wrong password here!", code: "000000" } }), ctx.deps)).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it("missing fields → 400; storage down → 503", async () => {
    expect((await loginHandler(request({ body: { username: USERNAME, password: PASSWORD } }), ctx.deps)).status).toBe(400);
    expect((await loginHandler(request({ body: { username: USERNAME, password: PASSWORD, code: "123456" } }), { ...ctx.deps, getContainer: () => { throw new Error("down"); } })).status).toBe(503);
  });

  it("logout deletes the server session: the same token is refused at once", async () => {
    const { jsonBody } = await login(ctx, secret);
    const out = await sessionHandler(request({ action: "logout", headers: ownerHeaders(jsonBody.token) }), ctx.deps);
    expect(out.status).toBe(200);
    const me = await sessionHandler(request({ method: "GET", headers: ownerHeaders(jsonBody.token) }), ctx.deps);
    expect(me.status).toBe(401);
    expect(me.jsonBody.code).toBe("OWNER_SESSION_REVOKED");
  });

  it("no token, a teacher token, or a forged token → 401; a storage error → 503 (fail closed)", async () => {
    expect((await sessionHandler(request({ method: "GET" }), ctx.deps)).status).toBe(401);
    expect((await sessionHandler(request({ method: "GET", headers: { authorization: "Bearer " + createBuilderToken("t1") } }), ctx.deps)).status).toBe(401);
    const forged = sess.createOwnerToken({ accountId: "own_0123456789abcdef", sid: "c".repeat(32), authVersion: 1 }, { nowMs: ctx.clock.now, env: ctx.env }).token;
    expect((await sessionHandler(request({ method: "GET", headers: ownerHeaders(forged) }), ctx.deps)).status).toBe(401);
    const { jsonBody } = await login(ctx, secret);
    const broken = { getBlobClient: () => ({ download: async () => { const e = new Error("boom"); e.statusCode = 500; throw e; } }) };
    const r = await sessionHandler(request({ method: "GET", headers: ownerHeaders(jsonBody.token) }), { ...ctx.deps, getContainer: () => broken });
    expect(r.status).toBe(503);
  });

  it("a session document of ANOTHER account never authenticates this account's token", async () => {
    const { jsonBody } = await login(ctx, secret);
    const accountId = jsonBody.owner.accountId;
    const sid = "e".repeat(32);
    ctx.mem.setJson(store.ownerSessionName(sid), { schemaVersion: 1, sid, accountId: "own_ffffffffffffffff", authVersion: 1, createdAtMs: ctx.clock.now, expiresAtMs: ctx.clock.now + 3600e3, stepUpAtMs: ctx.clock.now });
    const token = sess.createOwnerToken({ accountId, sid, authVersion: 1 }, { nowMs: ctx.clock.now, env: ctx.env }).token;
    const r = await sessionHandler(request({ method: "GET", headers: ownerHeaders(token) }), ctx.deps);
    expect(r.status).toBe(401);
  });

  it("the session document's own expiry is enforced", async () => {
    const { jsonBody } = await login(ctx, secret);
    const { sid } = sess.verifyOwnerToken(jsonBody.token, { nowMs: ctx.clock.now, env: ctx.env });
    const doc = ctx.mem.getJson(store.ownerSessionName(sid));
    ctx.mem.setJson(store.ownerSessionName(sid), { ...doc, expiresAtMs: ctx.clock.now - 1 });
    expect((await sessionHandler(request({ method: "GET", headers: ownerHeaders(jsonBody.token) }), ctx.deps)).status).toBe(401);
  });

  it("revoke-all needs a recent step-up, then ends every owner session", async () => {
    const a = await login(ctx, secret);
    ctx.clock.now += 30_000; ctx.nextIp();
    const b = await login(ctx, secret);
    ctx.clock.now += 11 * 60 * 1000;                                  // past the 10-minute step-up window
    const denied = await sessionHandler(request({ action: "revoke-all", headers: ownerHeaders(b.jsonBody.token) }), ctx.deps);
    expect(denied.status).toBe(403);
    expect(denied.jsonBody.code).toBe("STEP_UP_REQUIRED");
    const up = await sessionHandler(request({ action: "step-up", body: { code: totp.totpAt(secret, ctx.clock.now) }, headers: ownerHeaders(b.jsonBody.token) }), ctx.deps);
    expect(up.status).toBe(200);
    expect(up.jsonBody.session.stepUpValidUntil).toBeTruthy();
    const ok = await sessionHandler(request({ action: "revoke-all", headers: ownerHeaders(b.jsonBody.token) }), ctx.deps);
    expect(ok.status).toBe(200);
    for (const t of [a.jsonBody.token, b.jsonBody.token]) {
      expect((await sessionHandler(request({ method: "GET", headers: ownerHeaders(t) }), ctx.deps)).status).toBe(401);
    }
  });

  it("a wrong step-up code is refused and audited", async () => {
    const { jsonBody } = await login(ctx, secret);
    const r = await sessionHandler(request({ action: "step-up", body: { code: "000000" }, headers: ownerHeaders(jsonBody.token) }), ctx.deps);
    expect(r.status).toBe(401);
    const actions = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n).action);
    expect(actions).toContain("owner.step-up.failed");
  });

  it("regenerating recovery codes (after step-up) invalidates the old ones", async () => {
    const { jsonBody } = await login(ctx, secret);
    const r = await sessionHandler(request({ action: "recovery-codes", headers: ownerHeaders(jsonBody.token) }), ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody.recoveryCodes).toHaveLength(10);
    ctx.nextIp();
    expect((await loginHandler(request({ body: { username: USERNAME, password: PASSWORD, recoveryCode: codes[1] } }), ctx.deps)).status).toBe(401);
    expect((await loginHandler(request({ body: { username: USERNAME, password: PASSWORD, recoveryCode: r.jsonBody.recoveryCodes[0] } }), ctx.deps)).status).toBe(200);
  });

  it("owner security events go to the owner audit prefix only, never to the teacher-readable one", async () => {
    await login(ctx, secret);
    await loginHandler(request({ body: { username: USERNAME, password: "wrong password here!", code: "000000" } }), ctx.deps);
    const events = ctx.mem.names(OWNER_AUDIT_PREFIX).map(n => ctx.mem.getJson(n));
    expect(events.map(e => e.action)).toEqual(expect.arrayContaining(["owner.bootstrap.completed", "owner.login.succeeded", "owner.login.failed"]));
    expect(ctx.mem.names(AUDIT_PREFIX)).toEqual([]);
    expect(JSON.stringify(events)).not.toContain(PASSWORD);
  });
});

// ── Boundaries ───────────────────────────────────────────────────────────────
describe("P1-A boundaries", () => {
  const FN = path.join(import.meta.dirname, "../src/functions");
  it("no teacher or student route touches the owner's storage prefixes", () => {
    const owners = ["owner-bootstrap.js", "owner-login.js", "owner-session.js", "owner-teachers.js"];   // P2-A2: the owner's teacher management
    for (const f of readdirSync(FN).filter(n => n.endsWith(".js") && !owners.includes(n))) {
      const src = readFileSync(path.join(FN, f), "utf8");
      expect(src, f).not.toMatch(/platform\/(accounts|sessions\/owners|owner\/|owner-audit)/);
      expect(src, f).not.toMatch(/identity\/owner-/);
    }
  });
  it("the owner routes never accept a teacher session and never call the teacher login", () => {
    for (const f of ["owner-bootstrap.js", "owner-login.js", "owner-session.js", "owner-teachers.js"]) {
      const src = readFileSync(path.join(FN, f), "utf8");
      expect(src, f).not.toMatch(/requireBuilderAuth|validateBuilderCredentials|requireStudentAuth|requireTeacherSession/);
    }
  });
  it("the teacher audit reader still lists only the teacher prefix", () => {
    const src = readFileSync(path.join(FN, "audit-history.js"), "utf8");
    expect(src).not.toMatch(/OWNER_AUDIT_PREFIX|owner-audit/);
  });
});
