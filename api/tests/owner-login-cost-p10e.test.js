import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P10-E — the owner sign-in's scrypt work is bounded (closes security review O3; design
// docs/enterprise-owner-login-cost-p10e.md, owner decisions §19.41: owner sign-in only, at most 2 heavy checks at a time per
// instance). Requests beyond the cap take the P10-D code-first path (an HMAC, no scrypt). Also closes a P10-D gap found while
// designing: a FAILED limit reservation (lease busy) used to answer 429 before the code-first path.
// In-memory blob container with real CAS semantics; TEST data only. Concurrency is measured on crypto.scrypt itself.

process.env.BANK_SETUP_KEY = "p10e-test-root-secret";
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_SESSION_SECRET;

const totp = await import("../src/lib/identity/totp.js");
const { createBootstrapMaterial } = await import("../../scripts/owner-bootstrap-token.mjs");
const { handler: bootstrapHandler } = await import("../src/functions/owner-bootstrap.js");
const { handler: loginHandler } = await import("../src/functions/owner-login.js");
const gateModule = await import("../src/lib/identity/heavy-check-gate.js").catch(() => null);

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };
const T0 = Date.parse("2026-11-05T17:00:15.000Z");
const PASSWORD = "correct horse battery staple";
const USERNAME = "tadris.owner";

function request(body) { return { method: "POST", params: {}, headers: { get: () => null }, json: async () => body }; }

let scryptActive = 0, scryptPeak = 0, scryptCalls = 0;
const realScrypt = crypto.scrypt;
beforeEach(() => {
  scryptActive = 0; scryptPeak = 0; scryptCalls = 0;
  vi.spyOn(crypto, "scrypt").mockImplementation((...args) => {
    const cb = args[args.length - 1];
    scryptActive += 1; scryptCalls += 1; scryptPeak = Math.max(scryptPeak, scryptActive);
    return realScrypt.apply(crypto, [...args.slice(0, -1), (err, key) => { scryptActive -= 1; cb(err, key); }]);
  });
});
afterEach(() => { vi.restoreAllMocks(); });

async function setup() {
  const material = createBootstrapMaterial({ hours: 2, now: T0 });
  const env = { BANK_SETUP_KEY: "p10e-test-root-secret", OWNER_BOOTSTRAP_TOKEN_SHA256: material.sha256, OWNER_BOOTSTRAP_EXPIRES_AT: material.expiresAt };
  const mem = createMemoryContainer();
  const clock = { now: T0 };
  const deps = { env, getContainer: () => mem.container, now: () => clock.now, hashParams: FAST, clientIdFromRequest: () => "10.9.9.9" };
  const begin = await bootstrapHandler({ method: "POST", params: { action: "begin" }, headers: { get: () => null }, json: async () => ({ token: material.token, username: USERNAME, displayName: "مالك المنصة", password: PASSWORD }) }, deps);
  const secret = totp.base32Decode(begin.jsonBody.totp.secret);
  const confirm = await bootstrapHandler({ method: "POST", params: { action: "confirm" }, headers: { get: () => null }, json: async () => ({ token: material.token, code: totp.totpAt(secret, clock.now) }) }, deps);
  expect(confirm.status).toBe(201);
  clock.now += 30_000;
  // warm the decoy record (computed once per parameter set) so the measured window holds only sign-in work
  await loginHandler(request({ username: "warm.up.user", password: "x".repeat(16), code: "000000" }), { ...deps, clientIdFromRequest: () => "10.250.0.1" });
  scryptActive = 0; scryptPeak = 0; scryptCalls = 0;
  // Each test gets its own cap of 2 through the DI seam (the production default is exercised by the first test).
  const gate = gateModule.createHeavyCheckGate(2);
  return { env, mem, clock, deps: { ...deps, heavyCheckGate: gate }, plainDeps: deps, gate, secret, code: () => totp.totpAt(secret, clock.now) };
}

describe("P10-E the owner sign-in's heavy checks are bounded (O3)", () => {
  let ctx;
  beforeEach(async () => { ctx = await setup(); });

  it("fail-first: 20 concurrent sign-ins with random usernames run at most 2 scrypt checks at a time (baseline: 20)", async () => {
    // the PRODUCTION default gate (no injected one): this is the wiring that ships
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      loginHandler(request({ username: "random.user." + i, password: "a random guess " + i, code: "000000" }), { ...ctx.plainDeps, clientIdFromRequest: () => "10.7.0." + (i + 1) })));
    expect(scryptPeak).toBeLessThanOrEqual(2);
    expect(scryptPeak).toBeGreaterThan(0);
    for (const r of results) expect([401, 429]).toContain(r.status);
  });

  it("fail-first (P10-D gap): a FAILED limit reservation (lease busy) still lets the owner in with the code (baseline: 429)", async () => {
    const busy = { ...ctx.deps, reserveLoginAttempt: async () => { const e = new Error("login lock busy"); e.httpStatus = 429; throw e; } };
    const r = await loginHandler(request({ username: USERNAME, password: PASSWORD, code: ctx.code() }), busy);
    expect(r.status).toBe(200);
    // and an attacker without the code gets the same 429 as before, with no scrypt
    ctx.clock.now += 30_000;
    const attacker = await loginHandler(request({ username: USERNAME, password: "a wrong password!", code: "000000" }), busy);
    expect(attacker.status).toBe(429);
    expect(attacker.jsonBody.code).toBe("RATE_LIMITED");
    expect(scryptCalls).toBe(1);                                         // only the owner's own password check
  });

  it("cap full: a wrong code or an unknown name gets the same 429 with NO scrypt; the owner's code + password still signs in", async () => {
    const g = ctx.gate;
    const held = [g.tryAcquire(), g.tryAcquire()];
    expect(g.tryAcquire()).toBeNull();
    const wrong = await loginHandler(request({ username: USERNAME, password: PASSWORD, code: "000000" }), ctx.deps);
    const ghost = await loginHandler(request({ username: "nobody.here", password: PASSWORD, code: ctx.code() }), { ...ctx.deps, clientIdFromRequest: () => "10.6.0.1" });
    expect(wrong.status).toBe(429);
    expect(ghost.status).toBe(429);
    expect(ghost.jsonBody).toEqual(wrong.jsonBody);
    expect(scryptCalls).toBe(0);
    // the owner: the code passes first, then the password check WAITS for a slot (released here after 50 ms)
    const pending = loginHandler(request({ username: USERNAME, password: PASSWORD, code: ctx.code() }), { ...ctx.deps, clientIdFromRequest: () => "10.6.0.2" });
    setTimeout(() => held.forEach(r => r()), 50);
    const r = await pending;
    expect(r.status).toBe(200);
    expect(g.inUse()).toBe(0);
  });

  it("cap stays full beyond the wait → a retryable 503 (never access, never a slot left held)", async () => {
    const g = ctx.gate;
    const held = [g.tryAcquire(), g.tryAcquire()];
    try {
      const r = await loginHandler(request({ username: USERNAME, password: PASSWORD, code: ctx.code() }), { ...ctx.deps, heavyCheckWaitMs: 30 });
      expect(r.status).toBe(503);
      expect(r.headers["Retry-After"]).toBeTruthy();
    } finally { held.forEach(r => r()); }
    expect(g.inUse()).toBe(0);
  });

  it("a slot is released after success, refusal and a storage error", async () => {
    const g = ctx.gate;
    expect((await loginHandler(request({ username: USERNAME, password: PASSWORD, code: ctx.code() }), ctx.deps)).status).toBe(200);
    expect(g.inUse()).toBe(0);
    ctx.clock.now += 30_000;
    expect((await loginHandler(request({ username: USERNAME, password: "wrong password!!", code: ctx.code() }), ctx.deps)).status).toBe(401);
    expect(g.inUse()).toBe(0);
    const realGet = ctx.mem.container.getBlobClient;
    ctx.mem.container.getBlobClient = name => { if (name.startsWith("platform/accounts/")) throw Object.assign(new Error("down"), { statusCode: 500 }); return realGet.call(ctx.mem.container, name); };
    const down = await loginHandler(request({ username: USERNAME, password: PASSWORD, code: ctx.code() }), ctx.deps);
    ctx.mem.container.getBlobClient = realGet;
    expect(down.status).toBe(503);
    expect(g.inUse()).toBe(0);
  });
});

describe("P10-E the gate itself", () => {
  it("at most `max` at once; release is idempotent; waiters get slots in order; a wait times out with null", async () => {
    const g = gateModule.createHeavyCheckGate(2);
    const a = g.tryAcquire(), b = g.tryAcquire();
    expect(g.tryAcquire()).toBeNull();
    expect(gateModule.MAX_CONCURRENT_OWNER_PASSWORD_CHECKS).toBe(2);
    const first = g.acquire(1000), second = g.acquire(1000);
    a(); a();                                                           // a double release frees ONE slot
    const r1 = await first;
    expect(typeof r1).toBe("function");
    expect(g.inUse()).toBe(2);
    expect(await g.acquire(20)).toBeNull();                             // still full: the third waiter times out
    b();
    const r2 = await second;
    r1(); r2();
    expect(g.inUse()).toBe(0);
  });
});
