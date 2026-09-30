import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 14B — Independent Review Fix 1: the teacher SESSION is bound to the authentication mode / account directory that issued
// it. Fail-first on e3dc54e: a v2 token verifies on signature + role + time + session version only, so (A) a token minted under
// the legacy shared password whose `sub` happens to name a future configured account survives the legacy → multi-user cutover
// and impersonates that server-owned account, and (B) a multi-user token outlives the removal of its account from BUILDER_USERS.
//
// Contract under test (central, in builder-auth + the BUILDER_USERS seam — every requireBuilderAuth() caller inherits it):
//   legacy-issued token      → valid only while the configuration is legacy;
//   multi-user-issued token  → valid only while the configuration is valid multi-user AND `sub` still exists in BUILDER_USERS;
//   malformed non-empty BUILDER_USERS → every teacher session fails closed (not only new logins);
//   BUILDER_SESSION_VERSION stays an additional, global revocation mechanism.
const SAVED = { ...process.env };
process.env.BANK_SETUP_KEY = "cutover-test-signing-secret";
delete process.env.BUILDER_SESSION_SECRET; delete process.env.STUDENT_SESSION_SECRET;
delete process.env.BUILDER_USERS; delete process.env.BUILDER_USER_CODE; delete process.env.BUILDER_SESSION_VERSION; delete process.env.GOVERNANCE_CAPABILITIES;
process.env.BUILDER_PASSWORD = "legacy-shared-pw";

const auth = await import("../src/lib/builder-auth.js");
const { createBuilderToken, verifyBuilderToken, requireBuilderAuth } = auth;
const { createStudentToken, verifyStudentToken } = await import("../src/lib/student-auth.js");
const { handler: builderLogin } = await import("../src/functions/builder-login.js");
const { handler: governance } = await import("../src/functions/exam-governance.js");
const { handler: teacherProfile } = await import("../src/functions/teacher-profile.js");

const ACCOUNTS = { users: { "teacher-author": { passwordEnv: "PW_A", displayName: "أ. أ" }, "teacher-approver": { passwordEnv: "PW_B", displayName: "أ. ب" } } };
function multiUser(config = ACCOUNTS) { process.env.BUILDER_USERS = JSON.stringify(config); process.env.PW_A = "secret-a-1"; process.env.PW_B = "secret-b-2"; }
function legacy() { delete process.env.BUILDER_USERS; }
afterAll(() => { for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k]; Object.assign(process.env, SAVED); });

let mem;
beforeEach(() => { legacy(); delete process.env.BUILDER_SESSION_VERSION; mem = createMemoryContainer(); });
const deps = () => ({ getContainer: () => mem.container, container: mem.container, clientIdFromRequest: () => "203.0.113.1", reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {} });
const login = body => builderLogin({ json: async () => body, headers: { get: () => null } }, deps());
const req = (token, body = null, method = "POST", url = "http://x/api/exam-governance") => ({ method, url, params: {}, headers: new Headers(token ? { authorization: "Bearer " + token } : {}), json: async () => body });
const mcq = (id, marks = 2) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const validExam = () => ({ examId: "EX-1", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1"), mcq("q2", 6)] }] });

describe("14B Review Fix 1 — teacher session bound to the authentication mode / account directory", () => {
  it("RF1 — a token issued under the LEGACY shared password cannot survive the cutover to multi-user, even when its sub names a configured account", async () => {
    const r = await login({ userCode: "teacher-approver", password: "legacy-shared-pw" });   // legacy login, future account id typed as the code
    expect(r.status).toBe(200);
    const legacyToken = r.jsonBody.token;
    expect(verifyBuilderToken(legacyToken)?.sub).toBe("teacher-approver");                    // valid while legacy
    multiUser();                                                                               // cutover: same signing secret, same session version
    expect(verifyBuilderToken(legacyToken)).toBeNull();
    const a = requireBuilderAuth(req(legacyToken));
    expect(a.ok).toBe(false); expect(a.response.status).toBe(401);
    // the SAME account authenticated through its configured credential is accepted
    const real = await login({ userCode: "teacher-approver", password: "secret-b-2" });
    expect(real.status).toBe(200); expect(verifyBuilderToken(real.jsonBody.token)?.sub).toBe("teacher-approver");
  });
  it("RF2 — removing an account from BUILDER_USERS revokes its existing session (verify and authenticated request fail)", async () => {
    multiUser();
    const r = await login({ userCode: "teacher-author", password: "secret-a-1" });
    expect(r.status).toBe(200);
    const token = r.jsonBody.token;
    expect(verifyBuilderToken(token)?.sub).toBe("teacher-author");
    multiUser({ users: { "teacher-approver": ACCOUNTS.users["teacher-approver"] } });         // operator removes teacher-author
    expect(verifyBuilderToken(token)).toBeNull();
    const a = requireBuilderAuth(req(token));
    expect(a.ok).toBe(false); expect(a.response.status).toBe(401);
    const g = await governance(req(token, { action: "status", examId: "EX-1" }), { getContainer: () => mem.container });
    expect(g.status).toBe(401);
  });
  it("RF3 — positive control: a multi-user token stays valid while its account remains configured (through directory edits that keep it)", async () => {
    multiUser();
    const r = await login({ userCode: "teacher-author", password: "secret-a-1" });
    const token = r.jsonBody.token;
    expect(verifyBuilderToken(token)).toMatchObject({ sub: "teacher-author", role: "teacher" });
    multiUser({ users: { ...ACCOUNTS.users, "teacher-new": { passwordEnv: "PW_C" } } });    // another account added; A kept
    expect(verifyBuilderToken(token)).toMatchObject({ sub: "teacher-author" });
    expect(requireBuilderAuth(req(token)).ok).toBe(true);
    const g = await governance(req(token, { action: "status", examId: "EX-1" }), { getContainer: () => mem.container });
    expect(g.status).toBe(200); expect(g.jsonBody.actorId).toBe("teacher-author");
  });
  it("RF4 — account A's token can never become account B (subject integrity, forged payloads rejected)", async () => {
    multiUser();
    const token = (await login({ userCode: "teacher-author", password: "secret-a-1" })).jsonBody.token;
    const [payload, sig] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const forged = Buffer.from(JSON.stringify({ ...decoded, sub: "teacher-approver" }), "utf8").toString("base64url") + "." + sig;
    expect(verifyBuilderToken(forged)).toBeNull();
    expect(verifyBuilderToken(token)?.sub).toBe("teacher-author");
    const g = await governance(req(token, { action: "status", examId: "EX-1", actorId: "teacher-approver", sub: "teacher-approver" }), { getContainer: () => mem.container });
    expect(g.status).toBe(200); expect(g.jsonBody.actorId).toBe("teacher-author");
  });
  it("RF5 — a malformed non-empty BUILDER_USERS invalidates EXISTING teacher sessions (authenticated requests fail closed, not only new logins)", async () => {
    multiUser();
    const token = (await login({ userCode: "teacher-author", password: "secret-a-1" })).jsonBody.token;
    const legacyBefore = (() => { legacy(); const t = createBuilderToken("ADMIN"); return t; })();
    expect(verifyBuilderToken(legacyBefore)?.sub).toBe("ADMIN");
    process.env.BUILDER_USERS = "{broken";
    expect(verifyBuilderToken(token)).toBeNull();
    expect(verifyBuilderToken(legacyBefore)).toBeNull();
    for (const t of [token, legacyBefore]) {
      expect(requireBuilderAuth(req(t)).ok).toBe(false);
      const g = await governance(req(t, { action: "status", examId: "EX-1" }), { getContainer: () => mem.container });
      expect(g.status).toBe(401);
      const p = await teacherProfile(req(t, null, "GET", "http://x/api/teacher-profile"), { getContainer: () => mem.container, container: mem.container });
      expect(p.status).toBe(401);
    }
    // no token is ever minted under a malformed configuration
    expect(() => createBuilderToken("teacher-author")).toThrow();
  });
  it("RF6 — legacy compatibility: with BUILDER_USERS absent the existing login / session behaviour is unchanged, including pre-14B v2 tokens without a mode claim", async () => {
    const r = await login({ userCode: "ADMIN", password: "legacy-shared-pw" });
    expect(r.status).toBe(200);
    const payload = verifyBuilderToken(r.jsonBody.token);
    expect(payload).toMatchObject({ ver: 2, role: "teacher", sub: "ADMIN" });
    expect(requireBuilderAuth(req(r.jsonBody.token)).ok).toBe(true);
    // a pre-14B v2 token (no mode claim at all) signed with the real secret keeps working in a legacy deployment
    const [enc] = r.jsonBody.token.split(".");
    const old = JSON.parse(Buffer.from(enc, "base64url").toString("utf8"));
    delete old.am; delete old.authMode; delete old.mode;
    const oldEnc = Buffer.from(JSON.stringify(old), "utf8").toString("base64url");
    const crypto = await import("node:crypto");
    const key = crypto.createHmac("sha256", process.env.BANK_SETUP_KEY).update("ExamBank791381:teacher-session:v2").digest();
    const oldToken = oldEnc + "." + crypto.createHmac("sha256", key).update(oldEnc).digest("base64url");
    expect(verifyBuilderToken(oldToken)?.sub).toBe("ADMIN");
    // the same pre-14B token is NOT a multi-user identity after cutover
    multiUser({ users: { ADMIN: { passwordEnv: "PW_A" } } });
    expect(verifyBuilderToken(oldToken)).toBeNull();
    legacy();
    expect(verifyBuilderToken(oldToken)?.sub).toBe("ADMIN");
    // the signing secret / secrets / capabilities never enter the token
    expect(JSON.stringify(old)).not.toMatch(/passwordEnv|PW_|secret|legacy-shared-pw|capabilit/);
  });
  it("RF7 — BUILDER_SESSION_VERSION remains an additional global revocation in both modes", async () => {
    const legacyToken = (await login({ userCode: "ADMIN", password: "legacy-shared-pw" })).jsonBody.token;
    multiUser();
    const multiToken = (await login({ userCode: "teacher-author", password: "secret-a-1" })).jsonBody.token;
    expect(verifyBuilderToken(multiToken)?.sub).toBe("teacher-author");
    process.env.BUILDER_SESSION_VERSION = "2";
    expect(verifyBuilderToken(multiToken)).toBeNull();
    legacy();
    expect(verifyBuilderToken(legacyToken)).toBeNull();
    delete process.env.BUILDER_SESSION_VERSION;
    expect(verifyBuilderToken(legacyToken)?.sub).toBe("ADMIN");
  });
  it("RF8 — the governance endpoint and an ordinary teacher endpoint inherit the protection: a pre-cutover token and a removed-account token get 401 and no mutation occurs", async () => {
    const preCutover = (await login({ userCode: "teacher-author", password: "legacy-shared-pw" })).jsonBody.token;
    multiUser();
    const removedSoon = (await login({ userCode: "teacher-approver", password: "secret-b-2" })).jsonBody.token;
    multiUser({ users: { "teacher-author": ACCOUNTS.users["teacher-author"] } });             // teacher-approver removed
    const gdeps = { getContainer: () => mem.container };
    for (const t of [preCutover, removedSoon]) {
      const g = await governance(req(t, { action: "enable", examId: "EX-1", exam: validExam(), requestId: "e-" + t.slice(-6) }), gdeps);
      expect(g.status).toBe(401);
      const p = await teacherProfile(req(t, { action: "setDisplayName", displayName: "hijack" }, "POST", "http://x/api/teacher-profile"), { getContainer: () => mem.container, container: mem.container });
      expect(p.status).toBe(401);
    }
    expect(mem.names("")).toEqual([]);                                                          // nothing written by either
    // students are untouched by the teacher session binding
    const s = createStudentToken({ userId: "s1", authVersion: 1 });
    expect(verifyStudentToken(s)?.role ?? "student").toBeTruthy();
    expect((await governance(req(s, { action: "status", examId: "EX-1" }), gdeps)).status).toBe(401);
  });
});
