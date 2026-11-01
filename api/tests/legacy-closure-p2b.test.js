import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

const require = createRequire(import.meta.url);

// Tadris+ P2-B — owner decision D6: the shared-password teacher mode (BUILDER_USERS absent) CLOSES for teachers as soon as a
// platform owner exists. Before an owner exists nothing changes. TEST data only. Written fail-first: on the baseline 7c5cdc14 a
// shared-password sign-in and an existing shared-password session keep working after the owner was created.
//   - sign-in with the shared password is refused WITHOUT checking the password (no oracle on a secret that may also be the
//     signing-key fallback), on both teacher sign-in routes;
//   - an existing shared-password session is refused by every teacher route and by the session probe (blueprint S4: the
//     self-chosen `sub` of that mode is no longer accepted at all);
//   - the owner's existence cannot be read → 503, never "allowed";
//   - students, BUILDER_USERS sessions and managed accounts are not affected.

process.env.BANK_SETUP_KEY = "p2b-closure-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;
delete process.env.LEGACY_DATA_OWNER;

const { handler: platformLogin } = await import("../src/functions/platform-login.js");
const { handler: builderLogin } = await import("../src/functions/builder-login.js");
const { handler: platformSession } = await import("../src/functions/platform-session.js");
const { handler: classrooms } = await import("../src/functions/manage-classrooms.js");
const { requireTeacherSession, sharedPasswordSession } = await import("../src/lib/teacher-session.js");
const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const { BOOTSTRAP_MARKER } = await import("../src/lib/identity/owner-store.js");
const { resetOperatorGateCache } = await import("../src/lib/identity/operator-gate.js");
const { studentCodeHash } = await import("../src/lib/student-auth.js");

const SHARED = process.env.BUILDER_PASSWORD;

function req({ method = "POST", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: {}, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}
const teacherHeaders = token => ({ "x-builder-token": token });

function setup({ owner = false } = {}) {
  resetOperatorGateCache();
  const mem = createMemoryContainer({ "platform/classes/c-old.json": { classId: "c-old", name: "صف قديم", status: "active", studentIds: [] } });
  let passwordChecks = 0;
  const deps = {
    getContainer: () => mem.container,
    reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "10.0.0.9",
    validateBuilderCredentials: (code, pw) => { passwordChecks++; return pw === SHARED; }
  };
  if (owner) mem.setJson(BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: "own_0011223344556677", completedAtMs: Date.now() });
  return { mem, deps, passwordChecks: () => passwordChecks };
}

describe("P2-B D6 — before an owner exists nothing changes (pin)", () => {
  let ctx;
  beforeEach(() => { ctx = setup({ owner: false }); });

  it("the shared password signs a teacher in, and that session works on teacher routes and the session probe", async () => {
    const r = await platformLogin(req({ body: { userCode: "teacher", password: SHARED } }), ctx.deps);
    expect(r.status).toBe(200);
    expect(r.jsonBody.role).toBe("teacher");
    const b = await builderLogin(req({ body: { userCode: "teacher", password: SHARED } }), ctx.deps);
    expect(b.status).toBe(200);
    const list = await classrooms(req({ method: "GET", headers: teacherHeaders(r.jsonBody.token) }), ctx.deps);
    expect(list.status).toBe(200);
    expect(list.jsonBody.classes.map(c => c.classId)).toEqual(["c-old"]);
    const probe = await platformSession(req({ method: "GET", headers: teacherHeaders(r.jsonBody.token) }), ctx.deps);
    expect(probe.status).toBe(200);
  });
});

describe("P2-B D6 — once an owner exists the shared-password mode is closed for teachers", () => {
  let ctx;
  beforeEach(() => { ctx = setup({ owner: true }); });

  it("platform-login: the shared password no longer signs in, and the password is not even checked", async () => {
    const r = await platformLogin(req({ body: { userCode: "teacher", password: SHARED } }), ctx.deps);
    expect(r.status).toBe(401);
    expect(r.jsonBody.token).toBeUndefined();
    expect(r.jsonBody.error).toContain("المعلمون يدخلون الآن باسم المستخدم وكلمة المرور الخاصين بهم");
    expect(ctx.passwordChecks()).toBe(0);
    // A wrong password gets the very same answer: nothing tells the shared password apart.
    const wrong = await platformLogin(req({ body: { userCode: "teacher", password: "not it" } }), ctx.deps);
    expect(wrong.status).toBe(401);
    expect(wrong.jsonBody).toEqual(r.jsonBody);
  });

  it("builder-login: refused with LEGACY_LOGIN_CLOSED, the password is not checked", async () => {
    const r = await builderLogin(req({ body: { userCode: "teacher", password: SHARED } }), ctx.deps);
    expect(r.status).toBe(403);
    expect(r.jsonBody.code).toBe("LEGACY_LOGIN_CLOSED");
    expect(r.jsonBody.token).toBeUndefined();
    expect(ctx.passwordChecks()).toBe(0);
  });

  it("a shared-password session issued BEFORE the owner existed stops working on the next request", async () => {
    const token = createBuilderToken("teacher");
    const s = await requireTeacherSession(req({ headers: teacherHeaders(token) }), ctx.deps);
    expect(s.ok).toBe(false);
    expect(s.response.status).toBe(401);
    expect(s.response.jsonBody.code).toBe("LEGACY_SESSION_CLOSED");
    const list = await classrooms(req({ method: "GET", headers: teacherHeaders(token) }), ctx.deps);
    expect(list.status).toBe(401);
    expect(JSON.stringify(list.jsonBody)).not.toContain("c-old");
  });

  it("S4: a self-chosen subject of that mode is not accepted either (no identity can be claimed with the shared password)", async () => {
    for (const sub of ["approver", "teacher-reviewer", "t_0011223344556677", "builder"]) {
      const s = await requireTeacherSession(req({ headers: teacherHeaders(createBuilderToken(sub)) }), ctx.deps);
      expect(s.ok).toBe(false);
      expect(s.response.status).toBe(401);
    }
  });

  it("the session probe answers 401 (the app clears the session and shows the sign-in page)", async () => {
    const token = createBuilderToken("teacher");
    const probe = await platformSession(req({ method: "GET", headers: teacherHeaders(token) }), ctx.deps);
    expect(probe.status).toBe(401);
    const bearer = await platformSession(req({ method: "GET", headers: { authorization: "Bearer " + token } }), ctx.deps);
    expect(bearer.status).toBe(401);
  });

  it("students still sign in normally", async () => {
    ctx.mem.setJson("platform/auth/" + studentCodeHash("123456789") + ".json", { userId: "u-1", salt: "s", passwordHash: "h", authVersion: 1, active: true });
    ctx.mem.setJson("platform/users/u-1.json", { userId: "u-1", code: "123456789", displayName: "طالب", classId: "c-old", authVersion: 1, active: true });
    const r = await platformLogin(req({ body: { userCode: "123456789", password: "student pw" } }), { ...ctx.deps, verifyPassword: () => true });
    expect(r.status).toBe(200);
    expect(r.jsonBody.role).toBe("student");
  });
});

describe("P2-B D6 — the owner's existence cannot be read: fail closed", () => {
  it("a shared-password session gets 503 (retryable), never access", async () => {
    resetOperatorGateCache();
    const token = createBuilderToken("teacher");
    const broken = { getContainer: () => { throw new Error("storage down"); } };
    const s = await requireTeacherSession(req({ headers: teacherHeaders(token) }), broken);
    expect(s.ok).toBe(false);
    expect(s.response.status).toBe(503);
  });

  it("platform-login with the shared password cannot sign in while the owner's existence is unknown", async () => {
    const ctx = setup({ owner: false });
    const real = ctx.mem.container;
    const flaky = new Proxy(real, { get(target, prop) {
      if (prop === "getBlockBlobClient" || prop === "getBlobClient") return name => { if (name === BOOTSTRAP_MARKER) throw new Error("storage down"); return target[prop](name); };
      const v = target[prop]; return typeof v === "function" ? v.bind(target) : v;
    } });
    const r = await platformLogin(req({ body: { userCode: "teacher", password: SHARED } }), { ...ctx.deps, getContainer: () => flaky });
    expect(r.status).toBe(503);
    expect(r.jsonBody.token).toBeUndefined();
  });
});

describe("P2-B D6 — every shared-password session shape is closed; other sessions are not", () => {
  const crypto = require("node:crypto");
  it("a pre-R8 (v1) token of that mode is refused too once an owner exists", async () => {
    const ctx = setup({ owner: true });
    const payload = Buffer.from(JSON.stringify({ sub: "builder", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
    const v1 = payload + "." + crypto.createHmac("sha256", process.env.BANK_SETUP_KEY).update(payload).digest("base64url");
    const { verifyBuilderToken } = await import("../src/lib/builder-auth.js");
    expect(verifyBuilderToken(v1)).toMatchObject({ legacy: true });            // the verifier still accepts the shape …
    const s = await requireTeacherSession(req({ headers: teacherHeaders(v1) }), ctx.deps);
    expect(s.ok).toBe(false);                                                   // … the closure refuses it
    expect(s.response.jsonBody.code).toBe("LEGACY_SESSION_CLOSED");
  });

  it("classification: exactly what the verifier returns in that mode", () => {
    expect(sharedPasswordSession({ ver: 2, am: "legacy", sub: "x" })).toBe(true);
    expect(sharedPasswordSession({ ver: 2, sub: "x" })).toBe(true);             // issued before sessions carried the claim
    expect(sharedPasswordSession({ ver: 1, legacy: true, sub: "x" })).toBe(true);
    expect(sharedPasswordSession({ ver: 2, am: "multi-user", sub: "x" })).toBe(false);
    expect(sharedPasswordSession({ ver: 3, am: "managed", sub: "t_00112233445566aa" })).toBe(false);
    expect(sharedPasswordSession(null)).toBe(false);
  });

  it("a BUILDER_USERS session is not affected by D6 (out of this phase's scope; it has its own identities)", async () => {
    const ctx = setup({ owner: true });
    process.env.BUILDER_USERS = JSON.stringify({ users: { "teacher-a": { passwordEnv: "PW_TEACHER_A", displayName: "A" } } });
    process.env.PW_TEACHER_A = "pw-a";
    try {
      const s = await requireTeacherSession(req({ headers: teacherHeaders(createBuilderToken("teacher-a")) }), ctx.deps);
      expect(s.ok).toBe(true);
      expect(s.user.am).toBe("multi-user");
    } finally { delete process.env.BUILDER_USERS; delete process.env.PW_TEACHER_A; }
  });

  it("builder-login: the owner's existence unreadable → 503, no sign-in, no password check", async () => {
    const ctx = setup({ owner: false });
    const r = await builderLogin(req({ body: { userCode: "teacher", password: SHARED } }), { ...ctx.deps, downloadJsonOrNull: async () => { throw new Error("storage down"); } });
    expect(r.status).toBe(503);
    expect(r.jsonBody.token).toBeUndefined();
    expect(ctx.passwordChecks()).toBe(0);
  });

  it("once the owner was seen, a later storage outage does not re-open the shared password", async () => {
    const ctx = setup({ owner: true });
    expect((await requireTeacherSession(req({ headers: teacherHeaders(createBuilderToken("teacher")) }), ctx.deps)).response.status).toBe(401);
    const down = { getContainer: () => { throw new Error("storage down"); } };
    const s = await requireTeacherSession(req({ headers: teacherHeaders(createBuilderToken("teacher")) }), down);
    expect(s.response.status).toBe(401);
    expect(s.response.jsonBody.code).toBe("LEGACY_SESSION_CLOSED");
  });
});

describe("P2-B — the owner-presence check is read-only and reads the bootstrap marker only (pin)", () => {
  it("owner-presence.js: no write, no delete, no other storage name", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(path.join(import.meta.dirname, "../src/lib/identity/owner-presence.js"), "utf8");
    expect(src).not.toMatch(/upload|mutate|delete|lease|listJson|setJson|createOnly/i);
    expect(src.match(/downloadJsonOrNull\)\(container, ([A-Z_]+)\)/)[1]).toBe("BOOTSTRAP_MARKER");
    expect(src).not.toMatch(/platform\//);
  });
});
