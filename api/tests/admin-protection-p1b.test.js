import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P1-B — administrative access protection (owner decision D9; blueprint §3.4 S1, §7.7). TEST data only.
//   A. The seven operator tools: teacher session while no owner exists (unchanged); once an owner exists only an owner session
//      with a recent step-up passes (teacher → 403 OWNER_REQUIRED, anonymous → 401, owner without step-up → 403
//      STEP_UP_REQUIRED); the owner's existence unreadable → 503; once seen, a storage hiccup never re-opens them to teachers.
//   B. /api/platform-login with a malformed BUILDER_USERS: a failed sign-in names the configuration problem (503) instead of
//      «wrong password»; students still sign in.
//   C. The owner's username-wide throttle is a bounded delay (≤ 120 s), not a 15-minute lockout; teachers are unchanged.
// This file imports only modules that exist on the baseline, so it doubles as the fail-first proof (docs/…-p1b.md §5).

const require = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p1b-test-root-secret";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.OWNER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
const savedConn = process.env.AZURE_STORAGE_CONNECTION_STRING;
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const FUNCTIONS = join(import.meta.dirname, "..", "src", "functions");
const TOOLS = ["assignment-index-control.js", "build-bank-2025.js", "classify-bank-batch.js", "classify-question-preview.js", "import-html-exam.js", "inspect-html.js", "storage-status.js"];
const storage = require("../src/lib/platform-storage.js");
const { createBuilderToken } = require("../src/lib/builder-auth.js");
const { createOwnerToken } = require("../src/lib/identity/owner-session.js");
const { BOOTSTRAP_MARKER, ownerAccountName, ownerSessionName } = require("../src/lib/identity/owner-store.js");

const mem = createMemoryContainer();
let storageDown = false;
const registrations = [];

beforeAll(() => {
  storage.getContainer = () => {
    if (!storageDown) return mem.container;
    return { getBlobClient: () => ({ download: async () => { const e = new Error("storage down"); e.statusCode = 500; throw e; } }) };
  };
  const functionsPkg = require("@azure/functions");
  const realHttp = functionsPkg.app.http;
  functionsPkg.app.http = (name, options) => registrations.push({ name, ...options });
  try { for (const f of TOOLS) require(join(FUNCTIONS, f)); } finally { functionsPkg.app.http = realHttp; }
});
afterAll(() => { if (savedConn !== undefined) process.env.AZURE_STORAGE_CONNECTION_STRING = savedConn; });

function req(method, headers = {}) {
  const url = "https://example.invalid/api/probe";
  return { method, url, headers: new Headers({ "content-type": "application/json", ...headers }), query: new URL(url).searchParams, params: {}, json: async () => ({}), text: async () => "{}", arrayBuffer: async () => new ArrayBuffer(0), formData: async () => { throw new Error("none"); } };
}
const ctx = () => ({ invocationId: "p1b", functionName: "probe", log() {}, error() {}, warn() {}, info() {}, trace() {}, debug() {} });
async function callAll(headers) {
  const out = [];
  for (const r of registrations) for (const m of r.methods) {
    const res = await r.handler(req(m, headers), ctx());
    out.push({ route: r.route, method: m, status: res.status, code: res.jsonBody?.code });
  }
  return out;
}
const teacherHeaders = () => ({ authorization: "Bearer " + createBuilderToken("teacher-1"), "x-builder-token": createBuilderToken("teacher-1") });
// The two AI tools sit behind the AI rate limiter (withAiRateLimit), which runs BEFORE the handler and itself fails closed with
// 503 AI_UNAVAILABLE when storage is down; for them that refusal answers first. Either way: refused, never allowed.
const AI_WRAPPED = new Set(["classify-bank-batch", "classify-question-preview"]);
const whenStorageDown = (route, gateAnswer) => AI_WRAPPED.has(route) ? { status: 503, code: "AI_UNAVAILABLE" } : gateAnswer;
const GATE_CODES = ["OWNER_REQUIRED", "STEP_UP_REQUIRED", "OPERATOR_GATE_UNAVAILABLE", "OWNER_SESSION_REQUIRED", "OWNER_SESSION_REVOKED"];

const OWNER_ID = "own_00112233445566aa";
function seedOwner({ stepUpAgoMs }) {
  const now = Date.now();
  mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: OWNER_ID, completedAtMs: now });
  mem.setJson(ownerAccountName(OWNER_ID), { schemaVersion: 1, accountId: OWNER_ID, role: "owner", username: "tadris.owner", displayName: "مالك", status: "active", authVersion: 1, mfa: {}, credential: {} });
  const sid = (stepUpAgoMs > 60_000 ? "b" : "a").repeat(32);
  mem.setJson(ownerSessionName(sid), { schemaVersion: 1, sid, accountId: OWNER_ID, authVersion: 1, createdAtMs: now - stepUpAgoMs, expiresAtMs: now + 3600e3, stepUpAtMs: now - stepUpAgoMs });
  return createOwnerToken({ accountId: OWNER_ID, sid, authVersion: 1 }).token;
}

// The scenarios share one module instance (the gate caches an owner once seen), so they run in this order.
describe("P1-B A. operator tools", () => {
  it("captured all seven operator tools", () => {
    expect(registrations.map(r => r.route).sort()).toEqual(["assignment-index-control", "build-bank-2025", "classify-bank-batch", "classify-question-preview", "import-html-exam", "inspect-html", "storage-status"]);
  });

  it("before any owner exists: a teacher session still passes the gate; an anonymous call is 401", async () => {
    for (const r of await callAll(teacherHeaders())) {
      expect({ ...r, gate: GATE_CODES.includes(r.code) || r.status === 401 || r.status === 403 }).toMatchObject({ gate: false });
    }
    for (const r of await callAll({})) expect({ route: r.route, method: r.method, status: r.status }).toEqual({ route: r.route, method: r.method, status: 401 });
  });

  it("when the owner's existence cannot be read, a teacher is refused with 503 — never allowed", async () => {
    storageDown = true;
    try {
      for (const r of await callAll(teacherHeaders())) expect({ route: r.route, status: r.status, code: r.code }).toEqual({ route: r.route, ...whenStorageDown(r.route, { status: 503, code: "OPERATOR_GATE_UNAVAILABLE" }) });
    } finally { storageDown = false; }
  });

  it("once an owner exists: a teacher session is refused 403 OWNER_REQUIRED on every tool and method", async () => {
    seedOwner({ stepUpAgoMs: 0 });
    for (const r of await callAll(teacherHeaders())) expect({ route: r.route, method: r.method, status: r.status, code: r.code }).toEqual({ route: r.route, method: r.method, status: 403, code: "OWNER_REQUIRED" });
  });

  it("once an owner exists: anonymous → 401; an owner without a recent step-up → 403 STEP_UP_REQUIRED", async () => {
    for (const r of await callAll({})) expect(r.status).toBe(401);
    const stale = seedOwner({ stepUpAgoMs: 11 * 60 * 1000 });
    for (const r of await callAll({ "x-owner-token": stale })) expect({ route: r.route, status: r.status, code: r.code }).toEqual({ route: r.route, status: 403, code: "STEP_UP_REQUIRED" });
  });

  it("an owner with a recent step-up passes the gate (the index control answers its state)", async () => {
    const fresh = seedOwner({ stepUpAgoMs: 0 });
    for (const r of await callAll({ "x-owner-token": fresh })) {
      expect({ route: r.route, gate: GATE_CODES.includes(r.code) || r.status === 401 || r.status === 403 }).toEqual({ route: r.route, gate: false });
    }
    const control = registrations.find(r => r.route === "assignment-index-control");
    const res = await control.handler(req("GET", { "x-owner-token": fresh }), ctx());
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ ok: true, state: expect.any(String) });
  });

  it("an owner token whose server session was revoked (logout) is refused 401 by the gate", async () => {
    const fresh = seedOwner({ stepUpAgoMs: 0 });
    mem.store.delete(ownerSessionName("a".repeat(32)));
    for (const r of await callAll({ "x-owner-token": fresh })) expect({ route: r.route, status: r.status, code: r.code }).toEqual({ route: r.route, status: 401, code: "OWNER_SESSION_REVOKED" });
  });

  it("after the owner has been seen, a storage hiccup does not re-open the tools to teachers", async () => {
    storageDown = true;
    try {
      for (const r of await callAll(teacherHeaders())) expect({ route: r.route, status: r.status, code: r.code }).toEqual({ route: r.route, ...whenStorageDown(r.route, { status: 403, code: "OWNER_REQUIRED" }) });
    } finally { storageDown = false; }
  });
});

describe("P1-B B. platform-login with a malformed teacher directory", () => {
  const { handler: login } = require("../src/functions/platform-login.js");
  const { hashPassword, studentCodeHash, normalizeStudentCode } = require("../src/lib/student-auth.js");
  const loginReq = body => ({ headers: { get: () => null }, json: async () => body });
  const baseDeps = c => ({ getContainer: () => c.container, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "10.9.9.9" });

  it("a failed sign-in with BUILDER_USERS malformed answers 503 AUTH_CONFIG_INVALID, not «wrong password»", async () => {
    const saved = process.env.BUILDER_USERS;
    process.env.BUILDER_USERS = "{not json";
    try {
      const c = createMemoryContainer();
      const res = await login(loginReq({ userCode: "teacher-author", password: "the-right-password" }), baseDeps(c));
      expect(res.status).toBe(503);
      expect(res.jsonBody.code).toBe("AUTH_CONFIG_INVALID");
      expect(JSON.stringify(res.jsonBody)).not.toMatch(/BUILDER_USERS|passwordEnv|teacher-author/);
    } finally { if (saved === undefined) delete process.env.BUILDER_USERS; else process.env.BUILDER_USERS = saved; }
  });

  it("students still sign in while the teacher directory is malformed (pin)", async () => {
    const saved = process.env.BUILDER_USERS;
    process.env.BUILDER_USERS = "{not json";
    try {
      const code = "S-1001";
      const { salt, passwordHash } = hashPassword("student-pass-1");
      const c = createMemoryContainer({
        ["platform/auth/" + studentCodeHash(normalizeStudentCode(code)) + ".json"]: { schemaVersion: 2, userId: "u-1", salt, passwordHash, active: true, authVersion: 1 },
        "platform/users/u-1.json": { schemaVersion: 3, role: "student", userId: "u-1", code, displayName: "طالب", classId: "c1", active: true, archived: false, authVersion: 1 }
      });
      const res = await login(loginReq({ userCode: code, password: "student-pass-1" }), baseDeps(c));
      expect(res.status).toBe(200);
      expect(res.jsonBody.role).toBe("student");
    } finally { if (saved === undefined) delete process.env.BUILDER_USERS; else process.env.BUILDER_USERS = saved; }
  });

  it("with a valid directory, wrong credentials stay the generic 401 (pin)", async () => {
    const c = createMemoryContainer();
    const res = await login(loginReq({ userCode: "nobody", password: "wrong-password" }), baseDeps(c));
    expect(res.status).toBe(401);
    expect(res.jsonBody.code).toBeUndefined();
  });
});

describe("P1-B C. lockout denial of service", () => {
  const { handler: ownerLogin } = require("../src/functions/owner-login.js");
  const { reserveLoginAttempt } = require("../src/lib/login-throttle.js");
  const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };

  async function hammer(attempt, rounds) {
    // An attacker fails on purpose from a NEW address each time, waiting out every cooldown, to push the username-wide
    // bucket as high as it goes. Returns the longest Retry-After the attacker could impose.
    const clock = { now: Date.parse("2026-11-01T10:00:00Z") };
    let worst = 0, ip = 0;
    for (let i = 0; i < rounds; i++) {
      const r = await attempt(clock, "10.1." + Math.floor(ip / 250) + "." + (ip++ % 250 + 1));
      if (r.retryAfterSeconds) { worst = Math.max(worst, r.retryAfterSeconds); clock.now += r.retryAfterSeconds * 1000 + 1; }
      else clock.now += 1000;
    }
    return worst;
  }

  it("the owner's username-wide bucket never imposes more than 120 s, however long the attack", async () => {
    const c = createMemoryContainer();
    const worst = await hammer(async (clock, ip) => {
      const res = await ownerLogin({ headers: { get: () => null }, json: async () => ({ username: "tadris.owner", password: "wrong password here!", code: "000000" }) },
        { getContainer: () => c.container, now: () => clock.now, clientIdFromRequest: () => ip, hashParams: FAST });
      return { retryAfterSeconds: res.status === 429 ? Number(res.headers["Retry-After"]) : 0 };
    }, 60);
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(120);
  });

  it("from ONE address the owner's per-address bucket keeps the full escalation (only the username-wide bucket is soft)", async () => {
    const c = createMemoryContainer();
    const worst = await hammer(async clock => {
      const res = await ownerLogin({ headers: { get: () => null }, json: async () => ({ username: "tadris.owner", password: "wrong password here!", code: "000000" }) },
        { getContainer: () => c.container, now: () => clock.now, clientIdFromRequest: () => "10.7.7.7", hashParams: FAST });
      return { retryAfterSeconds: res.status === 429 ? Number(res.headers["Retry-After"]) : 0 };
    }, 40);
    expect(worst).toBeGreaterThan(120);
  });

  it("teachers keep the full escalation (the policy is the owner's only)", async () => {
    const c = createMemoryContainer();
    const worst = await hammer(async (clock, ip) => {
      const g = await reserveLoginAttempt(c.container, "teacher-author", ip, { now: () => clock.now });
      return { retryAfterSeconds: g.allowed ? 0 : g.retryAfterSeconds };
    }, 60);
    expect(worst).toBeGreaterThan(120);
  });
});
