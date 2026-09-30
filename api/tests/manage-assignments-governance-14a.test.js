import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { handler as assignments } from "../src/functions/manage-assignments.js";
import { handler as studentAssignment } from "../src/functions/student-assignment.js";
import * as GOV from "../src/lib/exam-governance.js";
import { manifestName } from "../src/lib/exam-governance-model.js";

// Phase 14A — G8: a GOVERNED exam's assignment binds the exact PUBLISHED revision materialized on the server; the browser's
// exam body is never the source. Legacy (non-governed) exams keep today's behaviour byte-for-byte. Fail-first on 6918ce1.

const ALL = ["author", "review", "approve", "publish"];
const actor = { id: "teacher-1", capabilities: ALL };
const mcq = (id, marks = 2, text = "سؤال " + id) => ({ examQuestionId: id, presentationType: "multipleChoice", text, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const exam = (over = {}) => ({ examId: "EX-1", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1"), mcq("q2", 6)] }], ...over });

let mem, c, deps, clock;
beforeEach(() => {
  mem = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "الصف", active: true } }); c = mem.container;
  clock = Date.parse("2026-09-30T13:00:00.000Z");
  const now = () => new Date((clock += 1000)).toISOString();
  deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1", role: "teacher" } }), getContainer: () => c, now,
    // Phase 12E-B index authority is covered by its own suites; keep the create path focused.
    ensurePublishedAssignmentIndexed: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {} };
});
const create = (examSnapshot, extra = {}) => assignments({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "create", classId: "c1", title: "واجب", publish: true, examSnapshot, ...extra }) }, deps);
const gov = { now: () => new Date((clock += 1000)).toISOString() };
const cycle = async (e, rid = "1") => {
  const en = await GOV.enableGovernance(c, { examId: e.examId, exam: e, actor, requestId: "en" + rid }, gov);
  const s = await GOV.submitForReview(c, { examId: e.examId, revisionId: en.manifest.latestRevisionId, actor, requestId: "s" + rid, expectedStateVersion: en.manifest.stateVersion }, gov);
  const a = await GOV.approve(c, { examId: e.examId, actor, requestId: "a" + rid, expectedStateVersion: s.manifest.stateVersion }, gov);
  return GOV.publish(c, { examId: e.examId, actor, requestId: "p" + rid, expectedStateVersion: a.manifest.stateVersion }, gov);
};
const republish = async (m, newExam, rid) => {
  const d = await GOV.returnToDraft(c, { examId: "EX-1", actor, requestId: "d" + rid, expectedStateVersion: m.stateVersion }, gov);
  const r = await GOV.createRevision(c, { examId: "EX-1", exam: newExam, actor, requestId: "r" + rid, expectedStateVersion: d.manifest.stateVersion }, gov);
  const s = await GOV.submitForReview(c, { examId: "EX-1", revisionId: r.manifest.latestRevisionId, actor, requestId: "s" + rid, expectedStateVersion: r.manifest.stateVersion }, gov);
  const a = await GOV.approve(c, { examId: "EX-1", actor, requestId: "a" + rid, expectedStateVersion: s.manifest.stateVersion }, gov);
  return GOV.publish(c, { examId: "EX-1", actor, requestId: "p" + rid, expectedStateVersion: a.manifest.stateVersion }, gov);
};

describe("14A G8 — governed assignments pin the exact published revision", () => {
  it("governed exam without a published revision → creation refused (409) and nothing stored", async () => {
    await GOV.enableGovernance(c, { examId: "EX-1", exam: exam(), actor, requestId: "en" }, gov);
    const r = await create(exam({ title: "من المتصفح" }));
    expect(r.status).toBe(409); expect(r.jsonBody.code).toBe("NO_PUBLISHED_REVISION");
    expect(mem.names("platform/assignments/")).toEqual([]);
  });
  it("published → the assignment snapshot is the server's immutable revision (not the browser body) and records the revision identity", async () => {
    const p = await cycle(exam());
    const r = await create(exam({ title: "من المتصفح", sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", 50, "نص مزوّر")] }] }));
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const a = mem.getJson(mem.names("platform/assignments/")[0]);
    expect(a.examSnapshot.title).toBe("امتحان");
    expect(a.examSnapshot.sections[0].questions.map(q => q.text)).toEqual(["سؤال q1", "سؤال q2"]);
    expect(a.totalMarks).toBe(8); expect(a.questionCount).toBe(2);
    expect(a.source).toEqual({ kind: "governed-revision", examId: "EX-1", revisionId: p.manifest.publishedRevisionId, revisionNumber: 1, contentHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(r.jsonBody.assignment.source).toMatchObject({ revisionNumber: 1 });
    expect(JSON.stringify(a)).not.toMatch(/lifecycleState|stateVersion|publishedBy/);   // no manifest internals on the assignment
  });
  it("a later draft and a later publication never rewrite an existing assignment; a NEW assignment binds the NEW publication — P15/P16", async () => {
    const p1 = await cycle(exam());
    await create(exam());
    const first = mem.names("platform/assignments/")[0];
    const bytes = JSON.stringify(mem.getJson(first));
    const d = await GOV.returnToDraft(c, { examId: "EX-1", actor, requestId: "d", expectedStateVersion: p1.manifest.stateVersion }, gov);
    const r8 = await GOV.createRevision(c, { examId: "EX-1", exam: exam({ title: "الإصدار 2", sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", 10, "سؤال جديد")] }] }), actor, requestId: "r", expectedStateVersion: d.manifest.stateVersion }, gov);
    expect(JSON.stringify(mem.getJson(first))).toBe(bytes);
    const s = await GOV.submitForReview(c, { examId: "EX-1", revisionId: r8.manifest.latestRevisionId, actor, requestId: "s2", expectedStateVersion: r8.manifest.stateVersion }, gov);
    const a2 = await GOV.approve(c, { examId: "EX-1", actor, requestId: "a2", expectedStateVersion: s.manifest.stateVersion }, gov);
    const p2 = await GOV.publish(c, { examId: "EX-1", actor, requestId: "p2", expectedStateVersion: a2.manifest.stateVersion }, gov);
    expect(p2.manifest.publishedRevisionId).not.toBe(p1.manifest.publishedRevisionId);
    expect(JSON.stringify(mem.getJson(first))).toBe(bytes);
    await create(exam());
    const second = mem.names("platform/assignments/").find(n => n !== first);
    const b = mem.getJson(second);
    expect(b.source.revisionId).toBe(p2.manifest.publishedRevisionId); expect(b.source.revisionNumber).toBe(2);
    expect(b.examSnapshot.title).toBe("الإصدار 2"); expect(b.totalMarks).toBe(10);
    expect(mem.getJson(first).source.revisionId).toBe(p1.manifest.publishedRevisionId);
  });
  it("the student receives the OLD pinned revision (sanitized) even after a newer publication", async () => {
    await cycle(exam());
    await create(exam());
    const first = mem.names("platform/assignments/")[0];
    const assignmentId = mem.getJson(first).assignmentId;
    // legacy untimed delivery (attemptModelVersion 0) so the handler returns the exam body without a server start
    mem.setJson(first, { ...mem.getJson(first), attemptModelVersion: 0 });
    await republish(mem.getJson(manifestName("EX-1")), exam({ title: "الإصدار 2", sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", 10, "سؤال جديد")] }] }), "2");
    const r = await studentAssignment({ method: "GET", url: "http://x/student-assignment/" + assignmentId, params: { assignmentId }, headers: new Headers() }, {
      requireActiveStudentSession: async () => ({ ok: true, container: c, student: { userId: "s1", classId: "c1" } }),
      downloadJsonOrNull: async (_c, name) => mem.getJson(name)
    });
    expect(r.status).toBe(200);
    const ex = r.jsonBody.assignment.exam;
    expect(ex.title).toBe("امتحان");
    expect(ex.sections[0].questions.map(q => q.text)).toEqual(["سؤال q1", "سؤال q2"]);
    const s = JSON.stringify(r.jsonBody);
    expect(s).not.toMatch(/correctOptionIndex|revisionId|contentHash|lifecycleState|publishedBy|blueprint|qualityPolicy/);
  });
  it("legacy (non-governed) exams: the browser snapshot is stored exactly as before — no governance blob is created", async () => {
    const r = await create(exam({ title: "قديم", status: "final" }));
    expect(r.status).toBe(200);
    const a = mem.getJson(mem.names("platform/assignments/")[0]);
    expect(a.examSnapshot.title).toBe("قديم"); expect(a.source).toBeUndefined(); expect(a.totalMarks).toBe(8);
    expect(mem.names("exam-governance/")).toEqual([]);
  });
});
