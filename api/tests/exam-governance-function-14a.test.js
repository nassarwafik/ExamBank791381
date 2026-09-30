import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 14A — the dedicated /api/exam-governance function: authentication (builder token only), server-resolved
// capabilities, action contract, HTTP mapping (403 / 404 / 409 / 422), and the boundary of the generic artifact endpoint.
// Fail-first on 6918ce1 (function absent).
process.env.BANK_SETUP_KEY = "14a-test-secret";
delete process.env.BUILDER_SESSION_SECRET;
delete process.env.STUDENT_SESSION_SECRET;
delete process.env.GOVERNANCE_CAPABILITIES;

const { createBuilderToken } = await import("../src/lib/builder-auth.js");
const { createStudentToken } = await import("../src/lib/student-auth.js");
const { handler } = await import("../src/functions/exam-governance.js");
const { handler: saveArtifact } = await import("../src/functions/save-exam-artifact.js");
const { manifestName, revisionName } = await import("../src/lib/exam-governance-model.js");

const mcq = (id, marks = 2) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const validExam = (over = {}) => ({ examId: "EX-1", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1"), mcq("q2", 6)] }], ...over });

let mem, deps, teacher;
beforeEach(() => {
  mem = createMemoryContainer();
  teacher = createBuilderToken("teacher-1");
  deps = { getContainer: () => mem.container, now: (() => { let t = Date.parse("2026-09-30T12:00:00.000Z"); return () => new Date((t += 1000)).toISOString(); })() };
});
const req = (body, token = teacher, method = "POST", query = "") => ({
  method, url: "http://x/api/exam-governance" + query, params: {},
  headers: new Headers(token ? { authorization: "Bearer " + token } : {}),
  json: async () => body
});
const post = (body, token = teacher) => handler(req(body, token), deps);
const ok = async (body, token) => { const r = await post(body, token); expect(r.status, JSON.stringify(r.jsonBody)).toBe(200); return r.jsonBody; };

describe("14A — /api/exam-governance authentication", () => {
  it("anonymous, student and invalid tokens are rejected with 401; nothing is written", async () => {
    for (const token of [null, createStudentToken({ userId: "s1", authVersion: 1 }), "garbage.token", teacher + "x"]) {
      const r = await post({ action: "status", examId: "EX-1" }, token);
      expect(r.status, String(token)).toBe(401);
    }
    const r = await post({ action: "enable", examId: "EX-1", exam: validExam(), requestId: "e" }, createStudentToken({ userId: "s1", authVersion: 1 }));
    expect(r.status).toBe(401);
    expect(mem.names("")).toEqual([]);
  });
});

describe("14A — action contract", () => {
  it("status of a legacy exam is not governed and creates no blob; capabilities come from the server resolver, not the body", async () => {
    const s = await ok({ action: "status", examId: "EX-1", capabilities: ["publish"], role: "approver" });
    expect(s).toMatchObject({ ok: true, governed: false, manifest: null, capabilities: ["author", "review", "approve", "publish"], capabilitySource: "default-single-teacher" });
    expect(mem.names("")).toEqual([]);
    const g = await handler(req(null, teacher, "GET", "?examId=EX-1"), deps);
    expect(g.status).toBe(200); expect(g.jsonBody.governed).toBe(false);
  });
  it("enable → create-revision → submit-review → approve → publish → return-to-draft through the HTTP contract; every mutation needs requestId + expectedStateVersion", async () => {
    const e = await ok({ action: "enable", examId: "EX-1", exam: validExam(), requestId: "e1" });
    expect(e.manifest).toMatchObject({ lifecycleState: "draft", stateVersion: 1, latestRevisionNumber: 1 });
    expect(e.manifest.commands).toBeUndefined();                                         // internal bookkeeping never leaves the server
    let r = await post({ action: "create-revision", examId: "EX-1", exam: validExam({ title: "v2" }), requestId: "r2" });
    expect(r.status).toBe(400);
    const c2 = await ok({ action: "create-revision", examId: "EX-1", exam: validExam({ title: "v2" }), requestId: "r2", expectedStateVersion: 1 });
    expect(c2.manifest.latestRevisionNumber).toBe(2); expect(c2.created).toBe(true);
    const s = await ok({ action: "submit-review", examId: "EX-1", revisionId: c2.manifest.latestRevisionId, requestId: "s1", expectedStateVersion: 2 });
    expect(s.manifest.lifecycleState).toBe("in-review");
    r = await post({ action: "publish", examId: "EX-1", requestId: "bad", expectedStateVersion: 3 });
    expect(r.status).toBe(409); expect(r.jsonBody.code).toBe("ILLEGAL_TRANSITION");
    const a = await ok({ action: "approve", examId: "EX-1", requestId: "a1", expectedStateVersion: 3 });
    expect(a.manifest.approvedRevisionId).toBe(c2.manifest.latestRevisionId);
    r = await post({ action: "publish", examId: "EX-1", requestId: "p-stale", expectedStateVersion: 3 });
    expect(r.status).toBe(409); expect(r.jsonBody.code).toBe("STALE_STATE"); expect(r.jsonBody.manifest.stateVersion).toBe(4);   // the client gets the authoritative state back
    const p = await ok({ action: "publish", examId: "EX-1", requestId: "p1", expectedStateVersion: 4, publishedRevisionId: "rev-evil" });
    expect(p.manifest.publishedRevisionId).toBe(c2.manifest.latestRevisionId);
    expect(p.manifest.publishedBy).toBe("teacher-1");
    const d = await ok({ action: "return-to-draft", examId: "EX-1", requestId: "d1", expectedStateVersion: 5 });
    expect(d.manifest).toMatchObject({ lifecycleState: "draft", publishedRevisionId: c2.manifest.latestRevisionId });
    const revs = await ok({ action: "revisions", examId: "EX-1", limit: 10 });
    expect(revs.items.map(x => x.revisionNumber)).toEqual([2, 1]);
    expect(revs.items[0].roles).toEqual(expect.arrayContaining(["latest", "published"]));
    const one = await ok({ action: "revision", examId: "EX-1", revisionId: revs.items[1].revisionId });
    expect(one.revision.exam.title).toBe("امتحان");
    const evs = await ok({ action: "events", examId: "EX-1", limit: 10 });
    expect(evs.items.map(x => x.type)).toEqual(["returned-to-draft", "published", "approved", "submitted-for-review", "revision-created", "governance-enabled"]);
    const pub = await ok({ action: "published", examId: "EX-1" });
    expect(pub.revision.revisionNumber).toBe(2);
  });
  it("submission is refused (422) with counts only when the server finalization blocks; approval / publish never accept a body", async () => {
    const broken = validExam({ sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [{ ...mcq("q1"), answer: undefined }] }] });
    const e = await ok({ action: "enable", examId: "EX-1", exam: broken, requestId: "e1" });
    const r = await post({ action: "submit-review", examId: "EX-1", revisionId: e.manifest.latestRevisionId, requestId: "s1", expectedStateVersion: 1, canFinalize: true });
    expect(r.status).toBe(422); expect(r.jsonBody.code).toBe("FINALIZATION_REFUSED");
    expect(r.jsonBody.details).toMatchObject({ structuralErrors: 1 });
    expect(JSON.stringify(r.jsonBody)).not.toContain("correctOptionIndex");
  });
  it("unknown action / unsafe exam id → 400; unknown exam → 404 for mutations", async () => {
    expect((await post({ action: "nuke", examId: "EX-1" })).status).toBe(400);
    expect((await post({ action: "status", examId: "../x" })).status).toBe(400);
    const r = await post({ action: "approve", examId: "EX-404", requestId: "a", expectedStateVersion: 1 });
    expect(r.status).toBe(404); expect(r.jsonBody.code).toBe("NOT_GOVERNED");
  });
  it("capabilities are resolved on the server per request: a configured author-only subject cannot approve or publish (403) even with a body claiming otherwise", async () => {
    process.env.GOVERNANCE_CAPABILITIES = JSON.stringify({ default: ["author"], users: { "approver-1": ["review", "approve", "publish"] } });
    try {
      const e = await ok({ action: "enable", examId: "EX-1", exam: validExam(), requestId: "e1" });
      const s = await ok({ action: "submit-review", examId: "EX-1", revisionId: e.manifest.latestRevisionId, requestId: "s1", expectedStateVersion: 1 });
      const r = await post({ action: "approve", examId: "EX-1", requestId: "a1", expectedStateVersion: s.manifest.stateVersion, role: "approver", capabilities: ["approve"] });
      expect(r.status).toBe(403); expect(r.jsonBody.code).toBe("FORBIDDEN");
      const approver = createBuilderToken("approver-1");
      const a = await ok({ action: "approve", examId: "EX-1", requestId: "a2", expectedStateVersion: s.manifest.stateVersion }, approver);
      expect(a.manifest.approvedRevisionId).toBe(e.manifest.latestRevisionId);
      const st = await ok({ action: "status", examId: "EX-1" }, approver);
      expect(st.capabilities).toEqual(["review", "approve", "publish"]); expect(st.capabilitySource).toBe("configured");
    } finally { delete process.env.GOVERNANCE_CAPABILITIES; }
  });
});

describe("14A Review Fix 1 / C4 — malformed capability configuration fails SAFE at the API", () => {
  it("a NON-EMPTY malformed GOVERNANCE_CAPABILITIES denies every mutation with GOVERNANCE_CONFIG_INVALID (503); reads still work and report configuration-error; nothing is written", async () => {
    const e = await ok({ action: "enable", examId: "EX-1", exam: validExam(), requestId: "e1" });
    const s = await ok({ action: "submit-review", examId: "EX-1", revisionId: e.manifest.latestRevisionId, requestId: "s1", expectedStateVersion: 1 });
    const a = await ok({ action: "approve", examId: "EX-1", requestId: "a1", expectedStateVersion: s.manifest.stateVersion });
    process.env.GOVERNANCE_CAPABILITIES = "{\"default\":[\"author\",";
    try {
      const before = JSON.stringify(mem.getJson(manifestName("EX-1")));
      const r = await post({ action: "publish", examId: "EX-1", requestId: "p1", expectedStateVersion: a.manifest.stateVersion, capabilities: ["publish"], role: "publisher" });
      expect(r.status).toBe(503); expect(r.jsonBody.code).toBe("GOVERNANCE_CONFIG_INVALID");
      expect(JSON.stringify(mem.getJson(manifestName("EX-1")))).toBe(before);
      expect(mem.names("exam-governance/EX-1/events/")).toHaveLength(3);
      const st = await ok({ action: "status", examId: "EX-1" });
      expect(st.capabilities).toEqual([]); expect(st.capabilitySource).toBe("configuration-error");
      expect(st.manifest.lifecycleState).toBe("approved");
    } finally { delete process.env.GOVERNANCE_CAPABILITIES; }
    const p = await ok({ action: "publish", examId: "EX-1", requestId: "p2", expectedStateVersion: a.manifest.stateVersion });
    expect(p.manifest.lifecycleState).toBe("published");
  });
});

describe("14A §26 — the generic artifact endpoint has no governance authority", () => {
  it("saving a governed exam with governance-looking root fields / status:final changes neither manifest nor revisions", async () => {
    const e = await ok({ action: "enable", examId: "EX-1", exam: validExam(), requestId: "e1" });
    const manifestBefore = JSON.stringify(mem.getJson(manifestName("EX-1")));
    const revBefore = JSON.stringify(mem.getJson(revisionName("EX-1", e.manifest.latestRevisionId)));
    const r = await saveArtifact(req({ kind: "exam", exam: { ...validExam({ title: "hacked" }), status: "final", governance: { lifecycleState: "published" }, publishedRevisionId: e.manifest.latestRevisionId, lifecycleState: "published" } }), { getContainer: () => mem.container });
    expect(r.status).toBe(200);
    expect(JSON.stringify(mem.getJson(manifestName("EX-1")))).toBe(manifestBefore);
    expect(JSON.stringify(mem.getJson(revisionName("EX-1", e.manifest.latestRevisionId)))).toBe(revBefore);
    const saved = mem.getJson("exams/EX-1.json");
    expect(saved.exam.title).toBe("hacked");                       // the working copy is still a generic saved artifact
    expect(saved.exam.governance).toBeUndefined(); expect(saved.exam.publishedRevisionId).toBeUndefined(); expect(saved.exam.lifecycleState).toBeUndefined();
    const st = await ok({ action: "status", examId: "EX-1" });
    expect(st.manifest.lifecycleState).toBe("draft"); expect(st.manifest.publishedRevisionId).toBeUndefined();
  });
});
