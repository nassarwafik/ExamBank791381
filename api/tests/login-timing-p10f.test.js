import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P10-F — every FAILED platform sign-in costs the same (closes security review O8; design docs/enterprise-login-timing-p10f.md,
// owner decision §19.42). The time of a failure used to reveal which teacher usernames exist (one ~0.4 s teacher scrypt only for
// a real, active managed teacher) and, less sharply, which student codes exist (one student scrypt only for a real code). Now
// every failure runs exactly ONE teacher-cost and ONE student-cost scrypt (real or decoy) before the generic 401; successful
// sign-ins run no decoy. Measured on crypto.scrypt / crypto.scryptSync themselves (the work that makes the time), never on a
// wall clock. TEST data only.

process.env.BANK_SETUP_KEY = "p10f-test-root-secret";
process.env.BUILDER_PASSWORD = "the shared legacy password";
for (const k of ["BUILDER_USERS", "BUILDER_USER_CODE", "BUILDER_SESSION_SECRET", "OWNER_SESSION_SECRET"]) delete process.env[k];

const { handler: loginHandler } = await import("../src/functions/platform-login.js");
const { hashSecret } = await import("../src/lib/identity/password-hash.js");
const { usernameReservationName } = await import("../src/lib/identity/owner-store.js");
const { teacherAccountName } = await import("../src/lib/identity/teacher-accounts.js");
const { hashPassword, studentCodeHash } = await import("../src/lib/student-auth.js");
const gateModule = await import("../src/lib/identity/heavy-check-gate.js");

const FAST = { N: 16384, r: 8, p: 1, keyLen: 64 };
const TEACHER = "t_00000000000000a1";
let teacherCredential, studentAuth;

let calls;
const realScrypt = crypto.scrypt, realScryptSync = crypto.scryptSync;
beforeAll(async () => {
  teacherCredential = await hashSecret("teacher pass phrase 1", { params: FAST });
  studentAuth = hashPassword("student-pass-1");
});
beforeEach(() => {
  calls = { teacher: 0, student: 0, teacherN: new Set() };
  vi.spyOn(crypto, "scrypt").mockImplementation((...args) => {
    calls.teacher += 1; calls.teacherN.add(args[3] && args[3].N);
    return realScrypt.apply(crypto, args);
  });
  vi.spyOn(crypto, "scryptSync").mockImplementation((...args) => { calls.student += 1; return realScryptSync.apply(crypto, args); });
});
afterEach(() => { vi.restoreAllMocks(); });

function platform({ teacherStatus = "active" } = {}) {
  const mem = createMemoryContainer();
  mem.setJson(usernameReservationName("ms.teacher"), { schemaVersion: 1, accountId: TEACHER, role: "teacher", username: "ms.teacher" });
  mem.setJson(teacherAccountName(TEACHER), { schemaVersion: 1, accountId: TEACHER, role: "teacher", username: "ms.teacher", displayName: "معلمة تجريبية", status: teacherStatus, credential: teacherCredential, authVersion: 1, sessions: [] });
  mem.setJson("platform/auth/" + studentCodeHash("STU123") + ".json", { userId: "u_stu123", salt: studentAuth.salt, passwordHash: studentAuth.passwordHash, authVersion: 1, active: true });
  mem.setJson("platform/users/u_stu123.json", { id: "u_stu123", code: "STU123", displayName: "طالب تجريبي", role: "student", authVersion: 1, active: true });
  const gate = gateModule.createHeavyCheckGate(2);
  const deps = { getContainer: () => mem.container, clientIdFromRequest: () => "10.4.0.1", reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, hashParams: FAST, decoyCheckGate: gate };
  return { mem, gate, deps };
}
const login = (deps, userCode, password) => loginHandler({ json: async () => ({ userCode, password }), headers: { get: () => null } }, deps);

async function measure(deps, userCode, password) {
  await login(deps, "warm.decoy", "warm the decoy record");               // the decoy record is computed once per parameter set
  calls.teacher = 0; calls.student = 0; calls.teacherN.clear();
  const r = await login(deps, userCode, password);
  return { status: r.status, body: r.jsonBody, teacher: calls.teacher, student: calls.student, teacherN: [...calls.teacherN] };
}

describe("P10-F every failed platform sign-in costs the same (O8)", () => {
  it("fail-first: unknown name, wrong teacher password, wrong student password, inactive teacher — each runs 1 teacher + 1 student check", async () => {
    const cases = [
      ["unknown name", "nobody.here", "some password 1"],
      ["managed teacher, wrong password", "ms.teacher", "not the password!"],
      ["student, wrong password", "STU123", "wrong-pass-1"],
    ];
    const seen = [];
    for (const [label, user, pw] of cases) {
      const { deps } = platform();
      const m = await measure(deps, user, pw);
      expect(m.status, label).toBe(401);
      seen.push([label, m.teacher, m.student]);
    }
    const { deps } = platform({ teacherStatus: "suspended" });
    const m = await measure(deps, "ms.teacher", "teacher pass phrase 1");
    expect(m.status).toBe(401);
    seen.push(["suspended teacher, right password", m.teacher, m.student]);
    expect(seen).toEqual(seen.map(([label]) => [label, 1, 1]));
  });

  it("every failure answers the identical body", async () => {
    const bodies = [];
    for (const [user, pw] of [["nobody.here", "x".repeat(12)], ["ms.teacher", "wrong password!!"], ["STU123", "wrong-pass-1"]]) {
      const { deps } = platform();
      bodies.push(JSON.stringify((await login(deps, user, pw)).jsonBody));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it("the decoy teacher check uses the same scrypt parameters as a real teacher check", async () => {
    const a = await measure(platform().deps, "nobody.here", "some password 1");
    const b = await measure(platform().deps, "ms.teacher", "not the password!");
    expect(a.teacherN).toEqual([FAST.N]);
    expect(b.teacherN).toEqual([FAST.N]);
  });

  it("successful sign-ins run NO decoy: a student pays no teacher check, a teacher pays no student check", async () => {
    const s = await measure(platform().deps, "STU123", "student-pass-1");
    expect(s.status).toBe(200);
    expect(s.body.role).toBe("student");
    expect(s.teacher).toBe(0);
    expect(s.student).toBe(1);
    const t = await measure(platform().deps, "ms.teacher", "teacher pass phrase 1");
    expect(t.status).toBe(200);
    expect(t.body.role).toBe("teacher");
    expect(t.teacher).toBe(1);
    expect(t.student).toBe(0);
  });

  it("decoy cap full: the failure still answers 401 after the bounded wait, with no decoy run and no slot left held", async () => {
    const { deps, gate } = platform();
    await login(deps, "warm.decoy", "warm the decoy record");
    const held = [gate.tryAcquire(), gate.tryAcquire()];
    calls.teacher = 0; calls.student = 0;
    const r = await login({ ...deps, decoyWaitMs: 30 }, "nobody.here", "some password 1");
    held.forEach(release => release());
    expect(r.status).toBe(401);
    expect(calls.teacher).toBe(0);
    expect(gate.inUse()).toBe(0);
  });

  it("a slot is released after every failure", async () => {
    const { deps, gate } = platform();
    for (const [user, pw] of [["nobody.here", "x".repeat(12)], ["ms.teacher", "wrong password!!"], ["STU123", "wrong-pass-1"]]) {
      expect((await login(deps, user, pw)).status).toBe(401);
      expect(gate.inUse()).toBe(0);
    }
  });
});
