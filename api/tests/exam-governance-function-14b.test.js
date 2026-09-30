import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 14B — the /api/exam-governance HTTP contract in ASSIGNED mode (identity-backed) + the S1–S10 identity attack matrix
// + R14 (configuration goes bad while the UI is open). Fail-first on b9e45e8: assignments ignored, workflow actions
// unsupported, directory absent, identity configuration never checked.
const SAVED = { ...process.env };
process.env.BANK_SETUP_KEY = "14b-fn-secret";
delete process.env.BUILDER_SESSION_SECRET; delete process.env.STUDENT_SESSION_SECRET;
const ACCOUNTS = { users: { "teacher-author": { passwordEnv: "PW_AUTHOR", displayName: "أ. سامر" }, "teacher-reviewer": { passwordEnv: "PW_REVIEWER", displayName: "أ. ليلى" }, "teacher-approver": { passwordEnv: "PW_APPROVER", displayName: "أ. هدى" }, "teacher-publisher": { passwordEnv: "PW_PUBLISHER", displayName: "أ. مازن" }, "teacher-outsider": { passwordEnv: "PW_OUTSIDER", displayName: "أ. خارجي" } } };
const CAPS = { mode: "assigned", default: [], users: { "teacher-author": ["author"], "teacher-reviewer": ["review"], "teacher-approver": ["approve"], "teacher-publisher": ["publish"], "teacher-outsider": ["review", "approve", "publish"] } };
function assignedEnv() {
  process.env.BUILDER_USERS = JSON.stringify(ACCOUNTS); process.env.GOVERNANCE_CAPABILITIES = JSON.stringify(CAPS);
  process.env.PW_AUTHOR = "pw-author-1"; process.env.PW_REVIEWER = "pw-reviewer-2"; process.env.PW_APPROVER = "pw-approver-3"; process.env.PW_PUBLISHER = "pw-publisher-4"; process.env.PW_OUTSIDER = "pw-outsider-5";
  delete process.env.BUILDER_PASSWORD; delete process.env.BUILDER_USER_CODE;
}
assignedEnv();
afterAll(() => { for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k]; Object.assign(process.env, SAVED); });

const { createBuilderToken, verifyBuilderToken } = await import("../src/lib/builder-auth.js");
const { createStudentToken } = await import("../src/lib/student-auth.js");
const { handler } = await import("../src/functions/exam-governance.js");
const { handler: login } = await import("../src/functions/builder-login.js");
const { handler: inboxHandler } = await import("../src/functions/governance-inbox.js");
const { profileDocName } = await import("../src/lib/teacher-profile.js");

const mcq = (id, marks = 2) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const validExam = (over = {}) => ({ examId: "EX-1", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1"), mcq("q2", 6)] }], ...over });
const T = id => createBuilderToken(id);
const AUTHOR = "teacher-author", REVIEWER = "teacher-reviewer", APPROVER = "teacher-approver", PUBLISHER = "teacher-publisher", OUTSIDER = "teacher-outsider";
const ASSIGN = { reviewerId: REVIEWER, approverId: APPROVER, publisherId: PUBLISHER };

let mem, deps;
beforeEach(() => { assignedEnv(); mem = createMemoryContainer(); deps = { getContainer: () => mem.container, now: (() => { let t = Date.parse("2026-10-08T12:00:00.000Z"); return () => new Date((t += 1000)).toISOString(); })() }; });
const req = (body, token, method = "POST", query = "") => ({ method, url: "http://x/api/exam-governance" + query, params: {}, headers: new Headers(token ? { authorization: "Bearer " + token } : {}), json: async () => body });
const post = (body, actorId) => handler(req(body, actorId ? T(actorId) : null), deps);
const ok = async (body, actorId) => { const r = await post(body, actorId); expect(r.status, JSON.stringify(r.jsonBody)).toBe(200); return r.jsonBody; };
const enable = () => ok({ action: "enable", examId: "EX-1", exam: validExam(), requestId: "e1" }, AUTHOR);
const submit = (m, extra = {}) => ok({ action: "submit-review", examId: "EX-1", revisionId: m.latestRevisionId, requestId: "s1", expectedStateVersion: m.stateVersion, assignments: ASSIGN, ...extra }, AUTHOR);
const complete = m => ok({ action: "complete-review", examId: "EX-1", requestId: "c1", expectedStateVersion: m.stateVersion, note: "تمت" }, REVIEWER);
const approve = m => ok({ action: "approve", examId: "EX-1", requestId: "a1", expectedStateVersion: m.stateVersion }, APPROVER);

describe("14B — HTTP contract in Assigned mode", () => {
  it("status carries the server workflow mode and the authenticated actor id; directory lists eligible actors with display names (profile → account → id) and NEVER secrets / env names", async () => {
    mem.setJson(profileDocName(REVIEWER), { schemaVersion: 1, teacherId: REVIEWER, displayName: "ليلى المراجِعة", updatedAt: "2026-10-01T00:00:00.000Z" });
    const s = await ok({ action: "status", examId: "EX-1" }, AUTHOR);
    expect(s).toMatchObject({ governed: false, workflowMode: "assigned", actorId: AUTHOR, capabilities: ["author"], capabilitySource: "configured" });
    const d = await ok({ action: "directory" }, AUTHOR);
    expect(d.mode).toBe("assigned");
    expect(d.actors).toEqual(expect.arrayContaining([
      { actorId: AUTHOR, displayName: "أ. سامر", capabilities: ["author"] },
      { actorId: REVIEWER, displayName: "ليلى المراجِعة", capabilities: ["review"] },
      { actorId: PUBLISHER, displayName: "أ. مازن", capabilities: ["publish"] }
    ]));
    expect(JSON.stringify(d)).not.toMatch(/passwordEnv|PW_|pw-|BUILDER/);
    expect((await post({ action: "directory" }, null)).status).toBe(401);
  });
  it("full assigned cycle over HTTP: submit with assignments → complete-review → approve → publish, each with requestId + expectedStateVersion; the response manifest carries the workflow", async () => {
    const e = await enable();
    const s = await submit(e.manifest, { cycleId: "evil", reviewedBy: "evil" });
    expect(s.manifest.lifecycleState).toBe("in-review"); expect(s.manifest.reviewWorkflow).toMatchObject({ authorId: AUTHOR, reviewerId: REVIEWER, approverId: APPROVER, publisherId: PUBLISHER, reviewStatus: "pending" });
    expect(s.manifest.reviewWorkflow.cycleId).not.toBe("evil"); expect(s.manifest.commands).toBeUndefined();
    let r = await post({ action: "approve", examId: "EX-1", requestId: "a0", expectedStateVersion: s.manifest.stateVersion }, APPROVER);
    expect(r.status).toBe(409); expect(r.jsonBody.code).toBe("REVIEW_NOT_COMPLETED"); expect(r.jsonBody.manifest.stateVersion).toBe(s.manifest.stateVersion);
    r = await post({ action: "complete-review", examId: "EX-1", requestId: "c0", expectedStateVersion: s.manifest.stateVersion }, OUTSIDER);
    expect(r.status).toBe(403); expect(r.jsonBody.code).toBe("NOT_ASSIGNED");
    r = await post({ action: "request-changes", examId: "EX-1", requestId: "rc", expectedStateVersion: s.manifest.stateVersion, note: "   " }, REVIEWER);
    expect(r.status).toBe(400); expect(r.jsonBody.code).toBe("NOTE_REQUIRED");
    const c = await complete(s.manifest);
    expect(c.manifest.reviewWorkflow).toMatchObject({ reviewStatus: "completed", reviewedBy: REVIEWER });
    const a = await approve(c.manifest);
    expect(a.manifest).toMatchObject({ lifecycleState: "approved", approvedRevisionId: e.manifest.latestRevisionId, approvedBy: APPROVER });
    r = await post({ action: "publish", examId: "EX-1", requestId: "p0", expectedStateVersion: a.manifest.stateVersion }, OUTSIDER);
    expect(r.status).toBe(403);
    const p = await ok({ action: "publish", examId: "EX-1", requestId: "p1", expectedStateVersion: a.manifest.stateVersion, publishedRevisionId: "rev-evil" }, PUBLISHER);
    expect(p.manifest).toMatchObject({ lifecycleState: "published", publishedRevisionId: e.manifest.latestRevisionId, publishedBy: PUBLISHER });
    const ds = await ok({ action: "decisions", examId: "EX-1" }, AUTHOR);
    expect(ds.items.map(x => x.decision)).toEqual(["review-completed"]);
    const one = await ok({ action: "decision", examId: "EX-1", decisionId: ds.items[0].decisionId }, AUTHOR);
    expect(one.decision.note).toBe("تمت");
    const inboxNow = await inboxHandler({ method: "GET", url: "http://x/api/governance-inbox?stage=all", params: {}, headers: new Headers({ authorization: "Bearer " + T(PUBLISHER) }), json: async () => null }, deps);
    expect(inboxNow.jsonBody.items).toEqual([]);
  });
  it("negative decisions over HTTP: reject-approval / reject-publication / withdraw-review require the assigned actor (and a note where mandatory); the generic return-to-draft is refused during a cycle", async () => {
    const e = await enable(); const s = await submit(e.manifest);
    let r = await post({ action: "return-to-draft", examId: "EX-1", requestId: "d0", expectedStateVersion: s.manifest.stateVersion }, AUTHOR);
    expect(r.status).toBe(409); expect(r.jsonBody.code).toBe("WORKFLOW_ACTION_REQUIRED");
    r = await post({ action: "withdraw-review", examId: "EX-1", requestId: "w0", expectedStateVersion: s.manifest.stateVersion }, REVIEWER);
    expect(r.status).toBe(403);
    const c = await complete(s.manifest);
    r = await post({ action: "reject-approval", examId: "EX-1", requestId: "ra0", expectedStateVersion: c.manifest.stateVersion }, APPROVER);
    expect(r.status).toBe(400); expect(r.jsonBody.code).toBe("NOTE_REQUIRED");
    const rej = await ok({ action: "reject-approval", examId: "EX-1", requestId: "ra1", expectedStateVersion: c.manifest.stateVersion, note: "غير مكتمل" }, APPROVER);
    expect(rej.manifest.lifecycleState).toBe("draft"); expect(rej.manifest.lastDecision).toMatchObject({ decision: "approval-rejected", actorId: APPROVER });
    expect(rej.manifest.reviewWorkflow).toBeUndefined();
  });
});

describe("14B §46 — identity attack matrix", () => {
  const loginDeps = () => ({ getContainer: () => mem.container, container: mem.container, clientIdFromRequest: () => "203.0.113.5", reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {} });
  const doLogin = body => login({ json: async () => body, headers: { get: () => null } }, loginDeps());
  it("S1 — teacher A logs in with A's server secret: token subject = A", async () => {
    const r = await doLogin({ userCode: AUTHOR, password: "pw-author-1" });
    expect(r.status).toBe(200); expect(verifyBuilderToken(r.jsonBody.token)).toMatchObject({ sub: AUTHOR, role: "teacher" });
  });
  it("S2 — teacher A cannot authenticate as B with A's password (and the shared legacy password grants nothing)", async () => {
    expect((await doLogin({ userCode: REVIEWER, password: "pw-author-1" })).status).toBe(401);
    process.env.BUILDER_PASSWORD = "shared"; expect((await doLogin({ userCode: REVIEWER, password: "shared" })).status).toBe(401); delete process.env.BUILDER_PASSWORD;
    expect((await doLogin({ userCode: REVIEWER, password: "14b-fn-secret" })).status).toBe(401);
  });
  it("S3 / S4 / S5 — client-supplied role, capabilities and actorId do nothing: the authenticated actor and server capabilities decide", async () => {
    const e = await enable(); const s = await submit(e.manifest);
    const spoof = { role: "approve", capabilities: ["review", "approve", "publish"], actorId: REVIEWER, sub: REVIEWER, reviewedBy: REVIEWER };
    let r = await post({ action: "complete-review", examId: "EX-1", requestId: "c0", expectedStateVersion: s.manifest.stateVersion, ...spoof }, AUTHOR);
    expect(r.status).toBe(403);
    r = await post({ action: "approve", examId: "EX-1", requestId: "a0", expectedStateVersion: s.manifest.stateVersion, ...spoof }, AUTHOR);
    expect(r.status).toBe(403);
    const c = await complete(s.manifest);
    r = await post({ action: "approve", examId: "EX-1", requestId: "a1", expectedStateVersion: c.manifest.stateVersion, ...spoof, actorId: APPROVER }, OUTSIDER);
    expect(r.status).toBe(403); expect(r.jsonBody.code).toBe("NOT_ASSIGNED");
    const st = await ok({ action: "status", examId: "EX-1", ...spoof }, AUTHOR);
    expect(st.actorId).toBe(AUTHOR); expect(st.capabilities).toEqual(["author"]);
    expect(mem.getJson("exam-governance/EX-1/manifest.json").reviewWorkflow.reviewedBy).toBe(REVIEWER);
  });
  it("S6 / S7 — a reviewer cannot open another teacher's inbox by id; a student token is denied everywhere", async () => {
    const e = await enable(); await submit(e.manifest);
    const inboxReq = (token, q) => inboxHandler({ method: "GET", url: "http://x/api/governance-inbox" + q, params: {}, headers: new Headers({ authorization: "Bearer " + token }), json: async () => null }, deps);
    const other = await inboxReq(T(APPROVER), "?stage=review&actorId=" + REVIEWER + "&sub=" + REVIEWER);
    expect(other.status).toBe(200); expect(other.jsonBody.items).toEqual([]); expect(other.jsonBody.actorId).toBe(APPROVER);
    const student = createStudentToken({ userId: "s1", authVersion: 1 });
    expect((await inboxReq(student, "?stage=review")).status).toBe(401);
    expect((await handler(req({ action: "status", examId: "EX-1" }, student), deps)).status).toBe(401);
    expect((await handler(req({ action: "directory" }, student), deps)).status).toBe(401);
  });
  it("S8 / S9 / S10 — unknown actor assignment, configured actor lacking the capability, and any duplicate participant are rejected even though the UI sent them", async () => {
    const e = await enable();
    for (const bad of [{ ...ASSIGN, reviewerId: "ghost-teacher" }, { ...ASSIGN, approverId: REVIEWER }, { ...ASSIGN, publisherId: APPROVER }, { reviewerId: OUTSIDER, approverId: OUTSIDER, publisherId: PUBLISHER }, { ...ASSIGN, reviewerId: AUTHOR }]) {
      const r = await post({ action: "submit-review", examId: "EX-1", revisionId: e.manifest.latestRevisionId, requestId: "s-" + JSON.stringify(bad), expectedStateVersion: 1, assignments: bad }, AUTHOR);
      expect(r.status, JSON.stringify(bad)).toBe(400); expect(r.jsonBody.code).toBe("WORKFLOW_ASSIGNMENT_INVALID");
    }
    expect(mem.getJson("exam-governance/EX-1/manifest.json").lifecycleState).toBe("draft");
  });
  it("R14 — configuration goes bad while the UI is open: the next mutation fails safe (401 / 503), nothing is mutated", async () => {
    const e = await enable();
    const authorToken = T(AUTHOR);                                                                       // the session the open UI holds
    const send = (body, token) => handler(req(body, token), deps);
    process.env.BUILDER_USERS = "{broken";                                                             // malformed directory ⇒ Review Fix 1: EVERY teacher session fails closed
    let r = await send({ action: "submit-review", examId: "EX-1", revisionId: e.manifest.latestRevisionId, requestId: "s-x", expectedStateVersion: 1, assignments: ASSIGN }, authorToken);
    expect(r.status).toBe(401);
    expect((await send({ action: "status", examId: "EX-1" }, authorToken)).status).toBe(401);
    assignedEnv(); process.env.GOVERNANCE_CAPABILITIES = JSON.stringify({ ...CAPS, users: { ...CAPS.users, "ghost": ["review"] } });   // an assigned actor outside the directory
    r = await send({ action: "submit-review", examId: "EX-1", revisionId: e.manifest.latestRevisionId, requestId: "s-y", expectedStateVersion: 1, assignments: ASSIGN }, authorToken);
    expect(r.status).toBe(503); expect(r.jsonBody.code).toBe("GOVERNANCE_IDENTITY_CONFIG_INVALID");
    const st = await ok({ action: "status", examId: "EX-1" }, AUTHOR); expect(st.identityConfigurationError).toBe("GOVERNANCE_IDENTITY_CONFIG_INVALID");
    assignedEnv(); delete process.env.BUILDER_USERS;                                                    // assigned mode requested with legacy identity ⇒ never downgraded
    expect((await send({ action: "status", examId: "EX-1" }, authorToken)).status).toBe(401);           // the multi-user session is not a legacy session
    r = await post({ action: "submit-review", examId: "EX-1", revisionId: e.manifest.latestRevisionId, requestId: "s-z", expectedStateVersion: 1, assignments: ASSIGN }, AUTHOR);   // a fresh legacy-mode session
    expect(r.status).toBe(503); expect(r.jsonBody.code).toBe("GOVERNANCE_IDENTITY_CONFIG_INVALID");
    assignedEnv(); process.env.GOVERNANCE_CAPABILITIES = "{not json";
    r = await post({ action: "submit-review", examId: "EX-1", revisionId: e.manifest.latestRevisionId, requestId: "s-w", expectedStateVersion: 1, assignments: ASSIGN }, AUTHOR);
    expect(r.status).toBe(503); expect(r.jsonBody.code).toBe("GOVERNANCE_CONFIG_INVALID");
    expect(mem.getJson("exam-governance/EX-1/manifest.json").lifecycleState).toBe("draft");
  });
});
