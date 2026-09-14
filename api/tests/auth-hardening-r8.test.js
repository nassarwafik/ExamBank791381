import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// Roadmap #8 — Auth / Session Hardening. Secret must be set BEFORE the auth libs read it (they read env
// at call time, so setting it here is sufficient).
process.env.BANK_SETUP_KEY = "r8-test-secret";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;

const {
  createBuilderToken, verifyBuilderToken, requireBuilderAuth,
  validateBuilderCredentials, getBuilderSessionVersion
} = await import("../src/lib/builder-auth.js");
const {
  createStudentToken, verifyStudentToken, requireStudentAuth,
  requireActiveStudentSession, normalizeAuthVersion, hashPassword
} = await import("../src/lib/student-auth.js");
const throttle = await import("../src/lib/login-throttle.js");
const { handler: loginHandler } = await import("../src/functions/platform-login.js");
const { handler: builderLoginHandler } = await import("../src/functions/builder-login.js");
const { handler: sessionHandler } = await import("../src/functions/platform-session.js");
const { handler: dashboardHandler } = await import("../src/functions/student-dashboard.js");
const { handler: submissionHandler } = await import("../src/functions/student-submission.js");
const { createStudentRecord, resetStudentPassword } = await import("../src/functions/manage-students.js");

const SECRET = process.env.BANK_SETUP_KEY;
const TEACHER_CTX = "ExamBank791381:teacher-session:v2";
const STUDENT_CTX = "ExamBank791381:student-session:v2";
const b64u = obj => Buffer.from(JSON.stringify(obj)).toString("base64url");
const deriveKey = (secret, ctx) => crypto.createHmac("sha256", secret).update(ctx).digest();
const signV2 = (encoded, ctx) => crypto.createHmac("sha256", deriveKey(SECRET, ctx)).update(encoded).digest("base64url");
const teacherV2 = payload => { const e = b64u(payload); return e + "." + signV2(e, TEACHER_CTX); };
const studentV2 = payload => { const e = b64u(payload); return e + "." + signV2(e, STUDENT_CTX); };
const legacyBuilder = payload => { const e = b64u(payload); return e + "." + crypto.createHmac("sha256", SECRET).update(e).digest("base64url"); };
const legacyStudent = payload => { const e = b64u(payload); return e + "." + crypto.createHmac("sha256", SECRET).update("student-session\n" + e).digest("base64url"); };
const nowSec = () => Math.floor(Date.now() / 1000);
const reqWith = headers => ({ headers: { get: k => headers[String(k).toLowerCase()] ?? null } });

beforeEach(() => { delete process.env.BUILDER_SESSION_VERSION; });

// ── Token validity + cross-role separation ───────────────────────────────────
describe("R8 tokens — validity & cross-role separation", () => {
  it("A: a v2 teacher token is valid (ver2, role teacher, sv)", () => {
    const p = verifyBuilderToken(createBuilderToken("t1"));
    expect(p).toBeTruthy(); expect(p.ver).toBe(2); expect(p.role).toBe("teacher"); expect(p.sub).toBe("t1"); expect(p.sv).toBe("1");
  });
  it("B: a v2 student token is valid (ver2, role student, sv from authVersion)", () => {
    const p = verifyStudentToken(createStudentToken({ userId: "u1", authVersion: 3, code: "S1", displayName: "A", classId: "c1" }));
    expect(p).toBeTruthy(); expect(p.ver).toBe(2); expect(p.role).toBe("student"); expect(p.sub).toBe("u1"); expect(p.sv).toBe(3);
  });
  it("C: a student token is rejected by the builder verifier", () => {
    expect(verifyBuilderToken(createStudentToken({ userId: "u1", authVersion: 1 }))).toBeNull();
  });
  it("D: a teacher token is rejected by the student verifier", () => {
    expect(verifyStudentToken(createBuilderToken("t1"))).toBeNull();
  });
  it("E: a tampered payload is rejected (signature no longer matches)", () => {
    const t = createStudentToken({ userId: "u1", authVersion: 1 });
    const [enc, sig] = t.split(".");
    const bad = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(enc, "base64url").toString()), sub: "hacker" })).toString("base64url");
    expect(verifyStudentToken(bad + "." + sig)).toBeNull();
  });
  it("F: a tampered signature is rejected", () => {
    const t = createBuilderToken("t1"); const [enc] = t.split(".");
    expect(verifyBuilderToken(enc + ".deadbeef")).toBeNull();
  });
  it("G: malformed tokens are rejected", () => {
    for (const bad of ["", "abc", "a.b.c", ".", "x.", ".y", null, undefined, 12345]) {
      expect(verifyBuilderToken(bad)).toBeNull();
      expect(verifyStudentToken(bad)).toBeNull();
    }
  });
  it("H: an expired token is rejected", () => {
    const t = studentV2({ ver: 2, role: "student", sub: "u1", iat: nowSec() - 10000, exp: nowSec() - 5000, sv: 1 });
    expect(verifyStudentToken(t)).toBeNull();
  });
  it("I: a token with iat unreasonably in the future is rejected", () => {
    const iat = nowSec() + 10000;
    const t = teacherV2({ ver: 2, role: "teacher", sub: "t1", iat, exp: iat + 3600, sv: "1" });
    expect(verifyBuilderToken(t)).toBeNull();
  });
  it("J: a token whose lifetime is substantially longer than the TTL is rejected", () => {
    const iat = nowSec();
    const t = studentV2({ ver: 2, role: "student", sub: "u1", iat, exp: iat + 48 * 3600, sv: 1 }); // 48h >> 12h TTL
    expect(verifyStudentToken(t)).toBeNull();
  });
  it("K: a wrong-role payload is rejected", () => {
    const iat = nowSec();
    expect(verifyStudentToken(studentV2({ ver: 2, role: "teacher", sub: "u1", iat, exp: iat + 3600, sv: 1 }))).toBeNull();
    expect(verifyBuilderToken(teacherV2({ ver: 2, role: "student", sub: "t1", iat, exp: iat + 3600, sv: "1" }))).toBeNull();
  });
  it("L: a missing/empty sub is rejected", () => {
    const iat = nowSec();
    expect(verifyStudentToken(studentV2({ ver: 2, role: "student", sub: "", iat, exp: iat + 3600, sv: 1 }))).toBeNull();
    expect(verifyBuilderToken(teacherV2({ ver: 2, role: "teacher", iat, exp: iat + 3600, sv: "1" }))).toBeNull();
  });
  it("also rejects non-integer iat/exp and exp<=iat", () => {
    const iat = nowSec();
    expect(verifyStudentToken(studentV2({ ver: 2, role: "student", sub: "u1", iat: iat + 0.5, exp: iat + 3600, sv: 1 }))).toBeNull();
    expect(verifyStudentToken(studentV2({ ver: 2, role: "student", sub: "u1", iat, exp: iat, sv: 1 }))).toBeNull();
  });
});

// ── Builder session version ──────────────────────────────────────────────────
describe("R8 builder session version", () => {
  it("V: a token minted under one BUILDER_SESSION_VERSION is rejected after it is bumped", () => {
    process.env.BUILDER_SESSION_VERSION = "1";
    const t = createBuilderToken("t1");
    expect(verifyBuilderToken(t)).toBeTruthy();
    process.env.BUILDER_SESSION_VERSION = "2";
    expect(verifyBuilderToken(t)).toBeNull();
  });
  it("defaults to '1' when unset (env not required)", () => {
    expect(getBuilderSessionVersion()).toBe("1");
  });
});

// ── Legacy token migration ───────────────────────────────────────────────────
describe("R8 legacy token migration (bounded by original expiry)", () => {
  it("T: a legacy student token is accepted only within its original lifetime, only by the student verifier", () => {
    const good = legacyStudent({ role: "student", sub: "u1", code: "S1", name: "A", classId: "c1", iat: nowSec() - 100, exp: nowSec() + 3600 });
    const p = verifyStudentToken(good);
    expect(p).toBeTruthy(); expect(p.legacy).toBe(true); expect(p.role).toBe("student");
    // expired legacy → rejected
    expect(verifyStudentToken(legacyStudent({ role: "student", sub: "u1", iat: nowSec() - 100000, exp: nowSec() - 5000 }))).toBeNull();
    // legacy student token must NOT authenticate the builder verifier
    expect(verifyBuilderToken(good)).toBeNull();
  });
  it("U: a legacy builder token is accepted only by the builder verifier (never cross-role)", () => {
    const good = legacyBuilder({ sub: "t1", iat: nowSec() - 100, exp: nowSec() + 3600 });
    const p = verifyBuilderToken(good);
    expect(p).toBeTruthy(); expect(p.legacy).toBe(true); expect(p.role).toBe("teacher");
    expect(verifyStudentToken(good)).toBeNull();
  });
});

// ── Hardened active-student session (authVersion / active / archived / class) ──
function studentSessionDeps(studentDoc) {
  const store = new Map();
  if (studentDoc) store.set("platform/users/" + studentDoc.userId + ".json", studentDoc);
  return { container: {}, downloadJsonOrNull: async (_c, k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null), _store: store };
}
describe("R8 hardened active-student session", () => {
  it("M: authVersion match → ok, returns the current student document", async () => {
    const token = createStudentToken({ userId: "u1", authVersion: 2, code: "S1", displayName: "A", classId: "c1" });
    const deps = studentSessionDeps({ userId: "u1", role: "student", active: true, authVersion: 2, classId: "c1", displayName: "A" });
    const sess = await requireActiveStudentSession(reqWith({ "x-student-token": token }), deps);
    expect(sess.ok).toBe(true); expect(sess.student.userId).toBe("u1");
  });
  it("N: authVersion mismatch → rejected (401)", async () => {
    const token = createStudentToken({ userId: "u1", authVersion: 1 });
    const deps = studentSessionDeps({ userId: "u1", role: "student", active: true, authVersion: 2 });
    const sess = await requireActiveStudentSession(reqWith({ "x-student-token": token }), deps);
    expect(sess.ok).toBe(false); expect(sess.response.status).toBe(401);
  });
  it("P: after a reset (authVersion bumped) the OLD token is rejected immediately; a fresh token works", async () => {
    const deps = studentSessionDeps({ userId: "u1", role: "student", active: true, authVersion: 1, classId: "c1" });
    const oldToken = createStudentToken({ userId: "u1", authVersion: 1 });
    expect((await requireActiveStudentSession(reqWith({ "x-student-token": oldToken }), deps)).ok).toBe(true);
    deps._store.get("platform/users/u1.json").authVersion = 2;             // simulate password reset
    expect((await requireActiveStudentSession(reqWith({ "x-student-token": oldToken }), deps)).ok).toBe(false);
    const newToken = createStudentToken({ userId: "u1", authVersion: 2 });
    expect((await requireActiveStudentSession(reqWith({ "x-student-token": newToken }), deps)).ok).toBe(true);
  });
  it("Q: an inactive student is rejected even with a valid token", async () => {
    const token = createStudentToken({ userId: "u1", authVersion: 1 });
    const deps = studentSessionDeps({ userId: "u1", role: "student", active: false, authVersion: 1 });
    expect((await requireActiveStudentSession(reqWith({ "x-student-token": token }), deps)).ok).toBe(false);
  });
  it("R: an archived student is rejected even with a valid token", async () => {
    const token = createStudentToken({ userId: "u1", authVersion: 1 });
    const deps = studentSessionDeps({ userId: "u1", role: "student", active: true, archived: true, authVersion: 1 });
    expect((await requireActiveStudentSession(reqWith({ "x-student-token": token }), deps)).ok).toBe(false);
  });
  it("S: the current student's class wins over a stale token class", async () => {
    const token = createStudentToken({ userId: "u1", authVersion: 1, classId: "OLD-CLASS" });
    const deps = studentSessionDeps({ userId: "u1", role: "student", active: true, authVersion: 1, classId: "NEW-CLASS" });
    const sess = await requireActiveStudentSession(reqWith({ "x-student-token": token }), deps);
    expect(sess.ok).toBe(true); expect(sess.student.classId).toBe("NEW-CLASS");
  });
  it("missing student → rejected", async () => {
    const token = createStudentToken({ userId: "ghost", authVersion: 1 });
    expect((await requireActiveStudentSession(reqWith({ "x-student-token": token }), studentSessionDeps(null))).ok).toBe(false);
  });
});

// ── AG: representative student endpoints use the hardened check ───────────────
describe("R8 §7 — student endpoints enforce the hardened session (authVersion)", () => {
  const endpointDeps = studentDoc => ({
    requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student" } }),
    getContainer: () => ({}),
    downloadJsonOrNull: async (_c, k) => (k === "platform/users/u1.json" ? studentDoc : null),
    listJson: async () => []
  });
  it("AG: student-dashboard rejects a token whose sv no longer matches (authVersion bumped)", async () => {
    const r = await dashboardHandler({ method: "GET", url: "http://x/student-dashboard", json: async () => ({}) }, endpointDeps({ userId: "u1", active: true, authVersion: 2, classId: "c1" }));
    expect(r.status).toBe(401);
  });
  it("AG: student-submission rejects a token whose sv no longer matches", async () => {
    const r = await submissionHandler({ method: "GET", params: { assignmentId: "a1" }, json: async () => ({}) }, endpointDeps({ userId: "u1", active: true, authVersion: 2, classId: "c1" }));
    expect(r.status).toBe(401);
  });
  it("AG: student-dashboard accepts a matching sv (control)", async () => {
    const r = await dashboardHandler({ method: "GET", url: "http://x/student-dashboard", json: async () => ({}) }, endpointDeps({ userId: "u1", active: true, authVersion: 1, classId: "c1" }));
    expect(r.status).toBe(200);
  });
});

// ── Builder credential hardening ─────────────────────────────────────────────
describe("R8 builder credential hardening", () => {
  afterEach(() => { delete process.env.BUILDER_USER_CODE; });
  it("configured BUILDER_USER_CODE requires an exact match", () => {
    process.env.BUILDER_PASSWORD = "correct-pw";
    process.env.BUILDER_USER_CODE = "ADMIN";
    expect(validateBuilderCredentials("ADMIN", "correct-pw")).toBe(true);
    expect(validateBuilderCredentials("someone-else", "correct-pw")).toBe(false);
    expect(validateBuilderCredentials("ADMIN", "wrong")).toBe(false);
    delete process.env.BUILDER_PASSWORD;
  });
  it("legacy-unconfigured mode accepts any non-empty code with the correct password", () => {
    process.env.BUILDER_PASSWORD = "correct-pw";                          // BUILDER_USER_CODE unset
    expect(validateBuilderCredentials("anything", "correct-pw")).toBe(true);
    expect(validateBuilderCredentials("", "correct-pw")).toBe(false);
    expect(validateBuilderCredentials("anything", "wrong")).toBe(false);
    delete process.env.BUILDER_PASSWORD;
  });
});

// ── Login throttling (blob-backed, cross-instance via optimistic concurrency) ─
function memThrottleDeps() {
  const store = new Map();
  return {
    _store: store,
    downloadJsonOrNull: async (_c, k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
    // real optimistic read-modify-write semantics are exercised by the fake-blob test (Z); this simple
    // seam is enough for the sequential W/X/Y assertions.
    mutateJsonWithRetry: async (_c, k, fn) => { const cur = store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null; const next = await fn(cur); store.set(k, next); return next; },
    deleteBlob: async (_c, k) => { store.delete(k); }
  };
}
describe("R8 login throttling (reserve-before-verify)", () => {
  it("W: reserve counts every attempt; the free band passes, then a cooldown blocks", async () => {
    const deps = { ...memThrottleDeps(), now: () => 1_000_000 };
    for (let i = 0; i < throttle.PER_IP_FREE_ATTEMPTS; i++) {
      const r = await throttle.reserveLoginAttempt({}, "user@x", "ip1", deps);
      expect(r.allowed).toBe(true);                                       // still free
    }
    const over = await throttle.reserveLoginAttempt({}, "user@x", "ip1", deps);
    expect(over.allowed).toBe(false); expect(over.retryAfterSeconds).toBeGreaterThan(0);
    const again = await throttle.reserveLoginAttempt({}, "user@x", "ip1", deps);
    expect(again.allowed).toBe(false);                                    // stays blocked during cooldown
  });
  it("X: a throttled login returns 429 + Retry-After (no-store) without reaching verify", async () => {
    let verified = 0;
    const deps = {
      getContainer: () => ({}), downloadJsonOrNull: async () => null,
      mutateJsonWithRetry: async () => {}, clientIdFromRequest: () => "ip1",
      validateBuilderCredentials: () => false, verifyPassword: () => { verified++; return true; },
      reserveLoginAttempt: async () => ({ allowed: false, retryAfterSeconds: 42 }),
      clearLoginThrottle: async () => {}
    };
    const r = await loginHandler({ json: async () => ({ userCode: "blocked@x", password: "whatever" }) }, deps);
    expect(r.status).toBe(429);
    expect(r.headers["Retry-After"]).toBe("42");
    expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(verified).toBe(0);                                             // never reached password verification
  });
  it("Y: a successful login clears BOTH throttle buckets", async () => {
    const mem = memThrottleDeps();
    await throttle.reserveLoginAttempt({}, "s@x", "ip1", mem);
    expect(mem._store.size).toBe(2);                                      // per-ip + global buckets
    await throttle.clearLoginThrottle({}, "s@x", "ip1", mem);
    expect(mem._store.size).toBe(0);
  });
  it("Z: concurrent reserves cannot bypass the free band (real optimistic concurrency)", async () => {
    const c = makeBlobContainer();
    const deps = { now: () => 2_000_000 };                               // real mutateJsonWithRetry over the fake blob
    // 20 simultaneous attempts for one identity+client: at most PER_IP_FREE_ATTEMPTS may be allowed; the
    // rest are blocked or rejected by CAS conflict (fail-closed). None can bypass the limit.
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => throttle.reserveLoginAttempt(c, "race@x", "ip1", deps)));
    const allowed = results.filter(r => r.status === "fulfilled" && r.value.allowed).length;
    expect(allowed).toBeGreaterThan(0);
    expect(allowed).toBeLessThanOrEqual(throttle.PER_IP_FREE_ATTEMPTS);
  });
  it("Z2 (§2 end-to-end): a burst of 20 wrong platform-logins reaches verify at most free-band times", async () => {
    const c = makeBlobContainer();
    const { salt, passwordHash } = hashPassword("realpw123");
    c._blobs.set("platform/auth/" + createdCodeHash("BURST") + ".json", { body: JSON.stringify({ userId: "u1", active: true, salt, passwordHash, authVersion: 1 }), etag: '"a"' });
    c._blobs.set("platform/users/u1.json", { body: JSON.stringify({ userId: "u1", role: "student", active: true, authVersion: 1, code: "BURST", displayName: "A", classId: "c1" }), etag: '"u"' });
    let verifyCalls = 0;
    const deps = {
      getContainer: () => c,
      downloadJsonOrNull: async (_c, k) => { const b = c._blobs.get(k); return b ? JSON.parse(b.body) : null; },
      // real mutateJsonWithRetry (default) over the fake blob for reserve; verify is a counting spy that
      // always fails, so every reach-to-verify is a real guess.
      verifyPassword: () => { verifyCalls++; return false; },
      validateBuilderCredentials: () => false, clientIdFromRequest: () => "203.0.113.9"
    };
    await Promise.allSettled(Array.from({ length: 20 }, () => loginHandler({ json: async () => ({ userCode: "BURST", password: "guess" }) }, deps)));
    expect(verifyCalls).toBeGreaterThan(0);
    expect(verifyCalls).toBeLessThanOrEqual(throttle.PER_IP_FREE_ATTEMPTS);
  });
  it("§7: rotating the client IP cannot buy unlimited guesses (identifier-only global bucket)", async () => {
    const c = makeBlobContainer();
    const deps = { now: () => 3_000_000 };
    let allowed = 0;
    // Each attempt uses a DIFFERENT client IP (per-ip bucket never trips) but the SAME identifier — the
    // global bucket must still cap total guesses.
    for (let i = 0; i < throttle.GLOBAL_FREE_ATTEMPTS + 10; i++) {
      const r = await throttle.reserveLoginAttempt(c, "victim@x", "10.0.0." + i, deps);
      if (r.allowed) allowed++;
    }
    expect(allowed).toBeLessThanOrEqual(throttle.GLOBAL_FREE_ATTEMPTS);
  });
  it("§7: only a syntactically valid IP is trusted as the client id", () => {
    expect(throttle.isValidIp("203.0.113.9")).toBe(true);
    expect(throttle.isValidIp("::1")).toBe(true);
    expect(throttle.isValidIp("999.1.1.1")).toBe(false);
    expect(throttle.isValidIp("01.2.3.4")).toBe(false);         // leading zero
    expect(throttle.isValidIp("not-an-ip")).toBe(false);
    expect(throttle.isValidIp("")).toBe(false);
    expect(throttle.clientIdFromRequest(reqWith({ "x-forwarded-for": "attacker-junk" }))).toBe("noip");
    expect(throttle.clientIdFromRequest(reqWith({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });
});

// ── Fake Azure blob container (supports the platform-storage etag/CAS surface) ─
function makeBlobContainer() {
  const blobs = new Map();
  let seq = 0;
  const notFound = () => { const e = new Error("not found"); e.statusCode = 404; e.code = "BlobNotFound"; throw e; };
  return {
    _blobs: blobs,
    getBlobClient(name) {
      return {
        async download() { const b = blobs.get(name); if (!b) notFound(); return { readableStreamBody: [Buffer.from(b.body, "utf8")], etag: b.etag }; },
        async deleteIfExists() { blobs.delete(name); }
      };
    },
    getBlockBlobClient(name) {
      return {
        async upload(body, _len, opts = {}) {
          const cond = opts.conditions || {};
          const existing = blobs.get(name);
          if (cond.ifNoneMatch === "*" && existing) { const e = new Error("exists"); e.statusCode = 409; e.code = "BlobAlreadyExists"; throw e; }
          if (cond.ifMatch && (!existing || existing.etag !== cond.ifMatch)) { const e = new Error("precondition"); e.statusCode = 412; e.code = "ConditionNotMet"; throw e; }
          const etag = '"e' + (++seq) + '"'; blobs.set(name, { body: String(body), etag }); return { etag };
        }
      };
    },
    async *listBlobsFlat() { /* unused here */ }
  };
}

// ── Password reset increments authVersion (§17) ──────────────────────────────
describe("R8 credential reset → authVersion", () => {
  it("O: create stamps authVersion:1; resetStudentPassword increments it (and changes the hash)", async () => {
    const c = makeBlobContainer();
    const classroom = { classId: "c1", name: "الصف", active: true, studentIds: [] };
    c._blobs.set("platform/classes/c1.json", { body: JSON.stringify(classroom), etag: '"c"' });
    const { student } = await createStudentRecord(c, classroom, { firstName: "أ", familyName: "ب", identityNumber: "123456789" }, { forceGeneratedPassword: true });
    const created = JSON.parse(c._blobs.get("platform/users/" + student.userId + ".json").body);
    expect(created.authVersion).toBe(1);                                  // O: created at 1
    const authBefore = JSON.parse(c._blobs.get("platform/auth/" + createdCodeHash(created.code) + ".json").body);
    await resetStudentPassword(c, created, "newpass1");
    const after = JSON.parse(c._blobs.get("platform/users/" + student.userId + ".json").body);
    const authAfter = JSON.parse(c._blobs.get("platform/auth/" + createdCodeHash(created.code) + ".json").body);
    expect(after.authVersion).toBe(2);                                    // O: incremented
    expect(authAfter.passwordHash).not.toBe(authBefore.passwordHash);     // password actually changed
  });
});
function createdCodeHash(code) { return crypto.createHash("sha256").update(String(code).normalize("NFKC").trim().toUpperCase()).digest("hex"); }

// ── platform-login: lastLogin optimistic merge preserves concurrent fields ────
describe("R8 platform-login storage safety", () => {
  it("AA: a login updates lastLoginAt without clobbering a concurrent field change", async () => {
    const store = new Map();
    const codeHash = createdCodeHash("S-1");
    const { salt, passwordHash } = hashPassword("pw123456");
    store.set("platform/auth/" + codeHash + ".json", { userId: "u1", active: true, salt, passwordHash });
    store.set("platform/users/u1.json", { userId: "u1", role: "student", active: true, authVersion: 1, code: "S-1", displayName: "A", classId: "c1", teacherNote: "KEEP-ME" });
    let firstRead = true;
    const deps = {
      getContainer: () => ({}),
      downloadJsonOrNull: async (_c, k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
      // Simulate a concurrent edit landing AFTER the login read but the merge must preserve it: our simple
      // mutate re-reads current from the store at write time, so seed the concurrent change here.
      mutateJsonWithRetry: async (_c, k, fn) => {
        if (firstRead && k === "platform/users/u1.json") { firstRead = false; const cur = JSON.parse(JSON.stringify(store.get(k))); cur.teacherNote = "CHANGED-CONCURRENTLY"; store.set(k, cur); }
        const cur = store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null; const next = await fn(cur); store.set(k, next); return next;
      },
      deleteBlob: async () => {}, clientIdFromRequest: () => "ip1",
      validateBuilderCredentials: () => false,
      reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}
    };
    const r = await loginHandler({ json: async () => ({ userCode: "S-1", password: "pw123456" }) }, deps);
    expect(r.status).toBe(200);
    const saved = store.get("platform/users/u1.json");
    expect(saved.teacherNote).toBe("CHANGED-CONCURRENTLY");               // concurrent field survives
    expect(saved.lastLoginAt).toBeTruthy();                              // login still recorded
  });
  it("AF: successful login response is no-store", async () => {
    const store = new Map();
    const codeHash = createdCodeHash("S-2");
    const { salt, passwordHash } = hashPassword("pw123456");
    store.set("platform/auth/" + codeHash + ".json", { userId: "u2", active: true, salt, passwordHash });
    store.set("platform/users/u2.json", { userId: "u2", role: "student", active: true, authVersion: 1, code: "S-2", displayName: "B", classId: "c1" });
    const deps = {
      getContainer: () => ({}), downloadJsonOrNull: async (_c, k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
      mutateJsonWithRetry: async (_c, k, fn) => { const cur = store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null; const next = await fn(cur); store.set(k, next); return next; },
      deleteBlob: async () => {}, clientIdFromRequest: () => "ip1", validateBuilderCredentials: () => false,
      reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}
    };
    const r = await loginHandler({ json: async () => ({ userCode: "S-2", password: "pw123456" }) }, deps);
    expect(r.status).toBe(200); expect(r.headers["Cache-Control"]).toBe("no-store");
  });
  it("invalid credentials return a single generic error (no enumeration)", async () => {
    const deps = {
      getContainer: () => ({}), downloadJsonOrNull: async () => null,
      mutateJsonWithRetry: async () => {}, deleteBlob: async () => {}, clientIdFromRequest: () => "ip1",
      validateBuilderCredentials: () => false,
      reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}
    };
    const r = await loginHandler({ json: async () => ({ userCode: "ghost", password: "nope123" }) }, deps);
    expect(r.status).toBe(401); expect(r.jsonBody.error).toBe("بيانات الدخول غير صحيحة.");
  });
});

// ── platform-session introspection ───────────────────────────────────────────
describe("R8 platform-session", () => {
  it("AB: teacher session returns authoritative teacher info (no-store)", async () => {
    const r = await sessionHandler(reqWith({ "x-builder-token": createBuilderToken("t1") }), {});
    expect(r.status).toBe(200); expect(r.jsonBody.role).toBe("teacher"); expect(r.jsonBody.expiresAt).toBeTruthy();
    expect(r.headers["Cache-Control"]).toBe("no-store");
  });
  it("AC: student session returns CURRENT displayName/class + expiry", async () => {
    const token = createStudentToken({ userId: "u1", authVersion: 1, code: "OLD", displayName: "OLD-NAME", classId: "OLD" });
    const deps = studentSessionDeps({ userId: "u1", role: "student", active: true, authVersion: 1, code: "S-NEW", displayName: "NEW-NAME", classId: "NEW" });
    const r = await sessionHandler(reqWith({ "x-student-token": token }), deps);
    expect(r.status).toBe(200); expect(r.jsonBody.role).toBe("student");
    expect(r.jsonBody.displayName).toBe("NEW-NAME"); expect(r.jsonBody.userCode).toBe("S-NEW"); expect(r.jsonBody.classId).toBe("NEW");
  });
  it("AD: an expired/revoked session returns a generic 401 (no-store)", async () => {
    const token = createStudentToken({ userId: "u1", authVersion: 1 });
    const deps = studentSessionDeps({ userId: "u1", role: "student", active: true, authVersion: 5 }); // revoked
    const r = await sessionHandler(reqWith({ "x-student-token": token }), deps);
    expect(r.status).toBe(401); expect(r.jsonBody.error).toBe("Unauthorized"); expect(r.headers["Cache-Control"]).toBe("no-store");
  });
  it("AE: the student session response exposes no secrets", async () => {
    const token = createStudentToken({ userId: "u1", authVersion: 1 });
    const deps = studentSessionDeps({ userId: "u1", role: "student", active: true, authVersion: 1, salt: "SECRET-SALT", passwordHash: "SECRET-HASH", displayName: "A", code: "S1", classId: "c1" });
    const r = await sessionHandler(reqWith({ "x-student-token": token }), deps);
    const json = JSON.stringify(r.jsonBody);
    expect(json).not.toContain("SECRET-SALT"); expect(json).not.toContain("SECRET-HASH");
    expect(json).not.toContain("passwordHash"); expect(json).not.toContain("salt");
  });
  it("no credentials → generic 401 no-store", async () => {
    const r = await sessionHandler(reqWith({}), {});
    expect(r.status).toBe(401); expect(r.headers["Cache-Control"]).toBe("no-store");
  });
});

// ── §4: strict v2 sv validation ──────────────────────────────────────────────
describe("R8 §4 — v2 student token requires an explicit integer sv >= 1", () => {
  const iat = () => Math.floor(Date.now() / 1000);
  it("rejects missing / null / 0 / negative / float / string sv on a v2 token", () => {
    for (const sv of [undefined, null, 0, -1, 1.5, "1", "abc"]) {
      const t = studentV2({ ver: 2, role: "student", sub: "u1", iat: iat(), exp: iat() + 3600, sv });
      expect(verifyStudentToken(t)).toBeNull();
    }
  });
  it("accepts a v2 token with a valid integer sv", () => {
    const t = studentV2({ ver: 2, role: "student", sub: "u1", iat: iat(), exp: iat() + 3600, sv: 4 });
    expect(verifyStudentToken(t).sv).toBe(4);
  });
  it("legacy (no ver) token with no sv is still accepted (normalizes to 1 downstream)", () => {
    const t = legacyStudent({ role: "student", sub: "u1", iat: iat() - 10, exp: iat() + 3600 });
    const p = verifyStudentToken(t);
    expect(p).toBeTruthy(); expect(p.legacy).toBe(true); expect(p.sv).toBeUndefined();
  });
});

// ── §5: platform-session Bearer fall-through ─────────────────────────────────
describe("R8 §5 — platform-session Bearer-only tries teacher then student", () => {
  it("teacher Bearer-only → teacher", async () => {
    const r = await sessionHandler(reqWith({ authorization: "Bearer " + createBuilderToken("t1") }), {});
    expect(r.status).toBe(200); expect(r.jsonBody.role).toBe("teacher");
  });
  it("student Bearer-only → student (falls through past the teacher check)", async () => {
    const token = createStudentToken({ userId: "u1", authVersion: 1, displayName: "A", code: "S1", classId: "c1" });
    const deps = studentSessionDeps({ userId: "u1", role: "student", active: true, authVersion: 1, displayName: "A", code: "S1", classId: "c1" });
    const r = await sessionHandler(reqWith({ authorization: "Bearer " + token }), deps);
    expect(r.status).toBe(200); expect(r.jsonBody.role).toBe("student");
  });
  it("explicit x-builder-token with a STUDENT token → 401 (no cross-role)", async () => {
    const token = createStudentToken({ userId: "u1", authVersion: 1 });
    const r = await sessionHandler(reqWith({ "x-builder-token": token }), studentSessionDeps({ userId: "u1", active: true, authVersion: 1 }));
    expect(r.status).toBe(401);
  });
  it("explicit x-student-token with a TEACHER token → 401 (no cross-role)", async () => {
    const r = await sessionHandler(reqWith({ "x-student-token": createBuilderToken("t1") }), studentSessionDeps(null));
    expect(r.status).toBe(401);
  });
});

// ── §1: builder-login is throttled + credential-checked ──────────────────────
describe("R8 §1 — builder-login throttling & credentials", () => {
  const baseDeps = extra => ({
    getContainer: () => ({}), clientIdFromRequest: () => "203.0.113.1",
    validateBuilderCredentials: (uc, pw) => uc === "ADMIN" && pw === "correct-pw",
    createBuilderToken: () => "builder-token-xyz",
    reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {},
    ...extra
  });
  it("a throttled builder-login returns 429 + Retry-After without verifying", async () => {
    let verified = 0;
    const deps = baseDeps({ reserveLoginAttempt: async () => ({ allowed: false, retryAfterSeconds: 30 }), validateBuilderCredentials: () => { verified++; return true; } });
    const r = await builderLoginHandler({ json: async () => ({ userCode: "ADMIN", password: "x" }) }, deps);
    expect(r.status).toBe(429); expect(r.headers["Retry-After"]).toBe("30"); expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(verified).toBe(0);
  });
  it("valid builder credentials succeed (no-store) and clear the throttle", async () => {
    let cleared = 0;
    const deps = baseDeps({ clearLoginThrottle: async () => { cleared++; } });
    const r = await builderLoginHandler({ json: async () => ({ userCode: "ADMIN", password: "correct-pw" }) }, deps);
    expect(r.status).toBe(200); expect(r.jsonBody.token).toBe("builder-token-xyz"); expect(r.headers["Cache-Control"]).toBe("no-store");
    expect(cleared).toBe(1);
  });
  it("wrong builder credentials → generic 401 (attempt already counted at reserve)", async () => {
    const r = await builderLoginHandler({ json: async () => ({ userCode: "ADMIN", password: "wrong" }) }, baseDeps({}));
    expect(r.status).toBe(401); expect(r.jsonBody.error).toBe("بيانات الدخول غير صحيحة.");
  });
});

// ── §3: password-reset / login race + fail-closed reset ──────────────────────
describe("R8 §3 — auth-doc version, fail-closed reset, login race", () => {
  function seedStudent(c, { authVersion = 1 } = {}) {
    const code = "S-1", codeHash = createdCodeHash(code);
    const { salt, passwordHash } = hashPassword("oldpass1");
    c._blobs.set("platform/auth/" + codeHash + ".json", { body: JSON.stringify({ userId: "u1", active: true, salt, passwordHash, authVersion }), etag: '"a0"' });
    c._blobs.set("platform/users/u1.json", { body: JSON.stringify({ userId: "u1", role: "student", active: true, authVersion, code, displayName: "A", classId: "c1" }), etag: '"u0"' });
    return { code, codeHash };
  }
  const readJson = (c, k) => JSON.parse(c._blobs.get(k).body);

  it("reset bumps student FIRST then auth to the same version (consistent, hash changed)", async () => {
    const c = makeBlobContainer(); seedStudent(c);
    const student = readJson(c, "platform/users/u1.json");
    const authBefore = readJson(c, "platform/auth/" + createdCodeHash("S-1") + ".json");
    await resetStudentPassword(c, student, "newpass1");
    const s2 = readJson(c, "platform/users/u1.json");
    const a2 = readJson(c, "platform/auth/" + createdCodeHash("S-1") + ".json");
    expect(s2.authVersion).toBe(2); expect(a2.authVersion).toBe(2);          // consistent
    expect(a2.passwordHash).not.toBe(authBefore.passwordHash);
  });

  it("old password cannot log in AFTER a reset (version mismatch is fail-closed)", async () => {
    const c = makeBlobContainer(); seedStudent(c);
    await resetStudentPassword(c, readJson(c, "platform/users/u1.json"), "newpass1");
    // Now student+auth are both v2 with the NEW hash. The OLD password must fail.
    const deps = { getContainer: () => c, downloadJsonOrNull: async (_x, k) => { const b = c._blobs.get(k); return b ? JSON.parse(b.body) : null; },
      reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "203.0.113.1", validateBuilderCredentials: () => false };
    const r = await loginHandler({ json: async () => ({ userCode: "S-1", password: "oldpass1" }) }, deps);
    expect(r.status).toBe(401);
  });

  it("storage failure between the two reset writes leaves login fail-closed + old sessions revoked", async () => {
    const c = makeBlobContainer(); seedStudent(c);
    const authName = "platform/auth/" + createdCodeHash("S-1") + ".json";
    // Make the SECOND write (auth doc) fail: student bump (write 1) succeeds, auth hash+version (write 2) throws.
    const origGetBlock = c.getBlockBlobClient.bind(c);
    c.getBlockBlobClient = name => name === authName
      ? { async upload() { const e = new Error("storage down"); e.statusCode = 500; throw e; } }
      : origGetBlock(name);
    await expect(resetStudentPassword(c, readJson(c, "platform/users/u1.json"), "newpass1")).rejects.toBeTruthy();
    // Student was bumped to 2; auth doc still at 1 → inconsistent → login (even OLD password) fails closed.
    expect(readJson(c, "platform/users/u1.json").authVersion).toBe(2);
    expect(readJson(c, authName).authVersion).toBe(1);
    const deps = { getContainer: () => c, downloadJsonOrNull: async (_x, k) => { const b = c._blobs.get(k); return b ? JSON.parse(b.body) : null; },
      reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "1.2.3.4", validateBuilderCredentials: () => false };
    const r = await loginHandler({ json: async () => ({ userCode: "S-1", password: "oldpass1" }) }, deps);
    expect(r.status).toBe(401);                                             // fail-closed
    // An OLD session token (sv=1) is revoked because the student is now at v2.
    const oldToken = createStudentToken({ userId: "u1", authVersion: 1 });
    const sess = await requireActiveStudentSession(reqWith({ "x-student-token": oldToken }), { container: {}, downloadJsonOrNull: async (_x, k) => { const b = c._blobs.get(k); return b ? JSON.parse(b.body) : null; } });
    expect(sess.ok).toBe(false);
  });

  it("simultaneous resets both apply (monotonic, no downgrade) and stay consistent", async () => {
    const c = makeBlobContainer(); seedStudent(c);
    const student = readJson(c, "platform/users/u1.json");
    await Promise.allSettled([
      resetStudentPassword(c, student, "newA123"),
      resetStudentPassword(c, student, "newB123")
    ]);
    const s = readJson(c, "platform/users/u1.json");
    const a = readJson(c, "platform/auth/" + createdCodeHash("S-1") + ".json");
    expect(s.authVersion).toBeGreaterThanOrEqual(2);                        // both increments applied where possible
    expect(a.authVersion).toBe(s.authVersion);                             // consistent, no downgrade
  });

  it("login mints sv bound to the verified credential version; a concurrent reset makes it fail-closed", async () => {
    const store = new Map();
    store.set("platform/auth/" + createdCodeHash("S-9") + ".json", { userId: "u9", active: true, authVersion: 1, ...hashPassword("pw123456") });
    store.set("platform/users/u9.json", { userId: "u9", role: "student", active: true, authVersion: 1, code: "S-9", displayName: "A", classId: "c1" });
    const deps = {
      getContainer: () => ({}),
      downloadJsonOrNull: async (_c, k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
      // The lastLogin mutate observes a concurrent reset that bumped the student to v2 → fail-closed.
      mutateJsonWithRetry: async (_c, k, fn) => { const cur = JSON.parse(JSON.stringify(store.get(k))); cur.authVersion = 2; const next = await fn(cur); store.set(k, next); return next; },
      reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "1.2.3.4", validateBuilderCredentials: () => false
    };
    const r = await loginHandler({ json: async () => ({ userCode: "S-9", password: "pw123456" }) }, deps);
    expect(r.status).toBe(401);                                             // old-password → no fresh post-reset session
  });
});
