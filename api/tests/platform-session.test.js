import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/platform-session.js";

// PROD HOTFIX §1 — the /api/platform-session AUTH-vs-INTERNAL contract. The frontend uses this endpoint to validate a
// stored session on boot; a 401 (and ONLY a 401) means "this session is definitively invalid — clear it". An internal
// or transient failure (storage outage, a dependency throwing) must therefore surface as a 5xx (503) — NEVER a 401 —
// or a passing infrastructure blip would destroy a perfectly valid session. Every response is no-store and generic
// (no internal error text ever leaks). These tests inject the auth dependencies so no real crypto/storage is needed.

const req = (headers = {}) => ({ method: "GET", headers: { get: name => headers[String(name).toLowerCase()] ?? null } });
const validStudent = { ok: true, user: { sub: "s1", exp: 1893456000 }, student: { displayName: "أحمد محمد", code: "S-1", classId: "c1" } };
const clean401 = { ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } };

describe("platform-session — auth (401) vs. internal/transient (503) contract", () => {
  it("missing credentials → 401 (no-store, generic body)", async () => {
    const r = await handler(req({}), {});
    expect(r.status).toBe(401);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.jsonBody).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("invalid TEACHER token (x-builder-token, verifyBuilderToken → null) → 401", async () => {
    const r = await handler(req({ "x-builder-token": "bad" }), { verifyBuilderToken: () => null });
    expect(r.status).toBe(401);
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });

  it("invalid STUDENT token (x-student-token, a CLEAN auth negative) → 401", async () => {
    const r = await handler(req({ "x-student-token": "bad" }), { requireActiveStudentSession: async () => clean401 });
    expect(r.status).toBe(401);
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });

  it("a Bearer-only token that is neither a valid teacher nor a valid student → 401", async () => {
    const r = await handler(req({ authorization: "Bearer x" }), { verifyBuilderToken: () => null, requireActiveStudentSession: async () => clean401 });
    expect(r.status).toBe(401);
  });

  it("a valid STUDENT session → 200 role=student, no-store, and NEVER leaks a token/hash", async () => {
    const r = await handler(req({ "x-student-token": "good" }), { requireActiveStudentSession: async () => validStudent });
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.jsonBody.ok).toBe(true);
    expect(r.jsonBody.role).toBe("student");
    expect(r.jsonBody.displayName).toBe("أحمد محمد");
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/token|password|hash|secret/i);
  });

  it("a valid TEACHER token → 200 role=teacher", async () => {
    const r = await handler(req({ "x-builder-token": "good" }), { verifyBuilderToken: () => ({ sub: "t1", exp: 1893456000 }), getContainer: () => ({}), downloadJsonOrNull: async () => null });
    expect(r.status).toBe(200);
    expect(r.jsonBody.role).toBe("teacher");
  });

  // THE CORE FIX — an internal dependency EXCEPTION is 5xx, NOT a 401 revocation.
  it("an internal STORAGE/session exception (requireActiveStudentSession THROWS) → 503, NOT 401", async () => {
    const r = await handler(req({ "x-student-token": "good" }), { requireActiveStudentSession: async () => { throw new Error("blob storage unavailable"); } });
    expect(r.status).toBe(503);
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(r.jsonBody).toEqual({ ok: false, error: "Service Unavailable" });
  });

  it("an internal exception on the TEACHER path (verifyBuilderToken THROWS) → 503, NOT 401", async () => {
    const r = await handler(req({ "x-builder-token": "boom" }), { verifyBuilderToken: () => { throw new Error("kv down"); } });
    expect(r.status).toBe(503);
    expect(r.jsonBody.error).toBe("Service Unavailable");
  });

  it("an internal exception on a Bearer-only probe → 503, NOT 401", async () => {
    const r = await handler(req({ authorization: "Bearer x" }), { verifyBuilderToken: () => null, requireActiveStudentSession: async () => { throw new Error("dependency down"); } });
    expect(r.status).toBe(503);
  });

  it("the 503 body NEVER leaks the underlying error message / internal host details", async () => {
    const secret = new Error("connect ECONNREFUSED 10.0.0.5:443 accountKey=SECRET-KEY-abc");
    const r = await handler(req({ "x-student-token": "good" }), { requireActiveStudentSession: async () => { throw secret; } });
    expect(r.status).toBe(503);
    const body = JSON.stringify(r.jsonBody);
    expect(body).not.toContain("ECONNREFUSED");
    expect(body).not.toContain("SECRET-KEY-abc");
    expect(body).not.toContain("10.0.0.5");
    expect(body).toBe(JSON.stringify({ ok: false, error: "Service Unavailable" }));
  });

  it("a teacher-profile lookup FAILURE is handled gracefully (fallback name) — a valid teacher stays 200, not 401/503", async () => {
    // resolveTeacherDisplayName swallows its own errors, so a profile-store failure must NOT downgrade a valid
    // teacher session: it stays a 200 with the fallback display name.
    const r = await handler(req({ "x-builder-token": "good" }), { verifyBuilderToken: () => ({ sub: "t1", exp: 1893456000 }), getContainer: () => { throw new Error("container down"); } });
    expect(r.status).toBe(200);
    expect(r.jsonBody.role).toBe("teacher");
    expect(typeof r.jsonBody.displayName).toBe("string");
    expect(r.jsonBody.displayName.length).toBeGreaterThan(0);
  });
});
