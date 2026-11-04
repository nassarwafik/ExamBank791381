import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P3-C — the sign-in answer and the session probe carry the teacher's `access` (so the UI needs no extra request), with
// `enforced`: whether the server limits THIS session right now. TEST data only.
//   managed: enforced only while the owner's mode is enforce; an unreadable mode or revision → «unavailable» (fail closed);
//   every other verified teacher session (shared password before an owner, BUILDER_USERS) is never limited.

const cjs = createRequire(import.meta.url);
process.env.BANK_SETUP_KEY = "p3c-session-access-root-secret";
process.env.BUILDER_PASSWORD = "the shared teacher password";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.BUILDER_USERS;
delete process.env.BUILDER_USER_CODE;
delete process.env.BUILDER_SESSION_VERSION;

const { handler: login } = await import("../src/functions/platform-login.js");
const { handler: probe } = await import("../src/functions/platform-session.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { hashSecret } = await import("../src/lib/identity/password-hash.js");
const { usernameReservationName } = await import("../src/lib/identity/owner-store.js");
const { ACCESS_CONTROL_DOC } = await import("../src/lib/access/access-mode.js");
const { buildRevision, revisionName } = await import("../src/lib/access/revisions.js");
const { preset } = await import("../src/lib/access/presets.js");
const { resetOperatorGateCache } = cjs("../src/lib/identity/operator-gate.js");
const { resetRevisionCache } = cjs("../src/lib/access/revisions.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };
const ID = "t_00112233445566aa";
const PASSWORD = "a long teacher passphrase";

function req({ method = "POST", body = {}, headers = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, params: {}, headers: { get: k => h[String(k).toLowerCase()] ?? null }, json: async () => body };
}

async function setup({ presetId = "learning-only", mode = null } = {}) {
  resetOperatorGateCache(); resetRevisionCache();
  const mem = createMemoryContainer();
  const deps = { getContainer: () => mem.container, hashParams: FAST, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "10.0.0.3" };
  let extra = {};
  if (presetId) {
    const { revision } = buildRevision({ accountId: ID, presetId, presetVersion: 1, createdBy: "owner:x" });
    mem.setJson(revisionName(revision.revisionId), revision);
    extra = { accessRevisionId: revision.revisionId, accessPreset: { id: presetId, version: 1 } };
  }
  mem.setJson(teacherAccountName(ID), { schemaVersion: 1, accountId: ID, role: "teacher", username: "t.sara", displayName: "سارة", status: "active", credential: await hashSecret(PASSWORD, { params: FAST }), authVersion: 1, revokedSessions: [], ...extra });
  mem.setJson(usernameReservationName("t.sara"), { schemaVersion: 1, accountId: ID, role: "teacher", username: "t.sara" });
  if (mode) mem.setJson(ACCESS_CONTROL_DOC, mode === "garbled" ? { schemaVersion: 1, mode: "?" } : { schemaVersion: 1, mode });
  return { mem, deps };
}
const signIn = (ctx, userCode = "t.sara", password = PASSWORD) => login(req({ body: { userCode, password } }), ctx.deps);

describe("P3-C access in the sign-in answer and the session probe", () => {
  beforeEach(() => { delete process.env.BUILDER_USERS; });

  it("managed, before enforcement: its capabilities, enforced false — in both answers", async () => {
    const ctx = await setup({ mode: "observe" });
    const r = await signIn(ctx);
    expect(r.status).toBe(200);
    expect(r.jsonBody.access).toEqual({ status: "ok", source: "revision", preset: { id: "learning-only", version: 1 }, capabilities: [...preset("learning-only", 1).capabilities].sort(), enforced: false, games: ["number-conversion", "live-challenge"] });   // Tadris+ P7-B2 adds games (not enforced: every game)
    const p = await probe(req({ method: "GET", headers: { "x-builder-token": r.jsonBody.token } }), ctx.deps);
    expect(p.jsonBody.access).toEqual(r.jsonBody.access);
  });

  it("managed, while enforcing: enforced true", async () => {
    const ctx = await setup({ mode: "enforce" });
    const r = await signIn(ctx);
    expect(r.jsonBody.access).toMatchObject({ status: "ok", enforced: true });
    const p = await probe(req({ method: "GET", headers: { "x-builder-token": r.jsonBody.token } }), ctx.deps);
    expect(p.jsonBody.access).toMatchObject({ status: "ok", enforced: true });
  });

  it("managed, the mode cannot be read → unavailable (the UI offers nothing); the sign-in itself still succeeds", async () => {
    const ctx = await setup({ mode: "garbled" });
    const r = await signIn(ctx);
    expect(r.status).toBe(200);
    expect(r.jsonBody.access).toEqual({ status: "unavailable", capabilities: [] });
  });

  it("the shared password (no owner yet) is never limited, even while the owner's mode says enforce", async () => {
    const ctx = await setup({ presetId: null, mode: "enforce" });
    const r = await signIn(ctx, "teacher", process.env.BUILDER_PASSWORD);
    expect(r.status).toBe(200);
    expect(r.jsonBody.access).toMatchObject({ status: "ok", source: "shared-password", preset: { id: "legacy-full", version: 1 }, enforced: false });
  });

  it("a BUILDER_USERS session is never limited", async () => {
    const ctx = await setup({ presetId: null, mode: "enforce" });
    process.env.BUILDER_USERS = JSON.stringify({ users: { "teacher-a": { passwordEnv: "PW_TEACHER_A", displayName: "A" } } });
    process.env.PW_TEACHER_A = "pw-a-long-enough";
    try {
      const r = await signIn(ctx, "teacher-a", "pw-a-long-enough");
      expect(r.status).toBe(200);
      expect(r.jsonBody.access).toMatchObject({ status: "ok", source: "migrated-default", enforced: false });
    } finally { delete process.env.BUILDER_USERS; delete process.env.PW_TEACHER_A; }
  });
});
