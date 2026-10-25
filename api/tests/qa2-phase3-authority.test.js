import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

// QA round 2 (main 36dc60e9), phase 3 — authority and concurrency.
//
// QA2-7   teacher B enabling governance on teacher A's SAVED exam id took it over: A's next assignment silently used B's content and
//         key (or was refused NO_PUBLISHED_REVISION). Refused like a missing exam; governance stays shared for exams nobody owns.
// QA2-8   a class archive racing a student's startAttempt left an open attempt in an archived class (the student locked out of it).
//         Each side now writes, then reads the other's state.
// QA2-9   turning «شارك إنجازاتي مع الصف» off did not hide the student's EARLIER posts from classmates.
// QA2-10  a bulk move did not advance profileRevision, so an edit form opened before it moved the student back (QA-7 gap).
// QA2-11  the writes that CLEAR the draft (submit, timeout, integrity exit, teacher end) did not advance draftRevision, so a second
//         device holding the submitted draft's revision graded its older copy as a new attempt on a legacy untimed assignment (QA-8 gap).
// QA2-20  a project reset deleted the edited snapshot, restarting templateRevision at 0: a stage editor opened before the reset could
//         overwrite the fresh template (QA-7 gap).
//
// Real handlers and real CAS over the in-memory container.

const require_ = createRequire(import.meta.url);
const { createMemoryContainer } = require_("./fixtures/memory-container.js");
const F = require_("./fixtures/coding-17c.js");
const { handler: governance } = require_("../src/functions/exam-governance.js");
const { handler: assignments } = require_("../src/functions/manage-assignments.js");
const { handler: feed } = require_("../src/functions/achievement-feed.js");
const { handler: profile } = require_("../src/functions/student-profile.js");
const { handler: students } = require_("../src/functions/manage-students.js");
const { handler: classrooms } = require_("../src/functions/manage-classrooms.js");
const { handler: submissionHandler } = require_("../src/functions/student-submission.js");
const { recordAchievementIfEligible } = require_("../src/lib/achievement-feed.js");
const { mutateJsonWithRetry } = require_("../src/lib/platform-storage.js");
const svc = require_("../src/lib/project-tracker/service.js");

const quiet = { logInfo() {}, logWarn() {}, logError() {} };
beforeAll(() => { process.env.STUDENT_SESSION_SECRET = process.env.STUDENT_SESSION_SECRET || "qa2-phase3-session-secret-0123456789ab"; });

describe("QA2-7 governance never takes over another teacher's saved exam", () => {
  const mu = sub => ({ ok: true, user: { ver: 2, role: "teacher", sub, am: "multi-user" } });
  const mcq = (text, correct) => ({ examQuestionId: "q1", presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: correct } });
  const examOf = (examId, title, text, correct = 0) => ({ examId, title, status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcq(text, correct)] }] });
  let mem, clock;
  beforeEach(() => {
    delete process.env.GOVERNANCE_CAPABILITIES; delete process.env.LEGACY_DATA_OWNER;
    mem = createMemoryContainer({
      "platform/classes/cA.json": { classId: "cA", name: "صف أ", active: true, ownerId: "teacher-a" },
      "platform/classes/cB.json": { classId: "cB", name: "صف ب", active: true, ownerId: "teacher-b" },
      "exams/EXAM-A1.json": { ...examOf("EXAM-A1", "امتحان المعلم أ", "سؤال المعلم أ", 0), ownerId: "teacher-a" }
    });
    clock = Date.parse("2026-10-01T10:00:00.000Z");
  });
  const now = () => new Date((clock += 1000)).toISOString();
  const gov = (sub, body) => governance({ method: "POST", url: "http://x/api/exam-governance", headers: new Headers(), json: async () => body }, { requireBuilderAuth: () => mu(sub), getContainer: () => mem.container, now });
  const createAssignment = (sub, classId, examSnapshot) => assignments({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "create", classId, title: "واجب", publish: false, examSnapshot }) },
    { requireBuilderAuth: () => mu(sub), getContainer: () => mem.container, recordAuditEvent: async () => {}, recordEventSafely: async () => {} });

  it("teacher B cannot enable governance on teacher A's saved exam (reported like a missing exam); A then assigns her own content", async () => {
    const e = await gov("teacher-b", { action: "enable", examId: "EXAM-A1", exam: examOf("EXAM-A1", "ب", "سؤال مزروع من ب", 1), requestId: "en-b" });
    expect({ status: e.status, code: e.jsonBody.code }).toEqual({ status: 404, code: "NOT_FOUND" });
    expect((await gov("teacher-b", { action: "status", examId: "EXAM-A1" })).jsonBody.governed).toBe(false);
    const r = await createAssignment("teacher-a", "cA", examOf("EXAM-A1", "امتحان المعلم أ", "سؤال المعلم أ", 0));
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const stored = mem.getJson(mem.names("platform/assignments/").find(n => mem.getJson(n).assignmentId === r.jsonBody.assignment.assignmentId));
    expect(stored.examSnapshot.sections[0].questions[0].text).toBe("سؤال المعلم أ");
  });

  it("unchanged: the owner enables governance on her own saved exam; an exam id nobody saved stays shared (any teacher may enable it)", async () => {
    expect((await gov("teacher-a", { action: "enable", examId: "EXAM-A1", exam: examOf("EXAM-A1", "أ", "سؤال المعلم أ"), requestId: "en-a" })).status).toBe(200);
    expect((await gov("teacher-b", { action: "enable", examId: "EXAM-FREE", exam: examOf("EXAM-FREE", "ب", "ب"), requestId: "en-b2" })).status).toBe(200);
  });

  it("unchanged: governance stays shared by design once enabled by its owner — another teacher reads the published revision", async () => {
    const e = await gov("teacher-a", { action: "enable", examId: "EXAM-A1", exam: examOf("EXAM-A1", "أ", "سؤال المعلم أ", 1), requestId: "en-a" });
    const s = await gov("teacher-a", { action: "submit-review", examId: "EXAM-A1", revisionId: e.jsonBody.manifest.latestRevisionId, requestId: "s-a", expectedStateVersion: e.jsonBody.manifest.stateVersion });
    const a = await gov("teacher-a", { action: "approve", examId: "EXAM-A1", requestId: "a-a", expectedStateVersion: s.jsonBody.manifest.stateVersion });
    expect((await gov("teacher-a", { action: "publish", examId: "EXAM-A1", requestId: "p-a", expectedStateVersion: a.jsonBody.manifest.stateVersion })).status).toBe(200);
    expect((await gov("teacher-b", { action: "published", examId: "EXAM-A1" })).status).toBe(200);
  });
});

describe("QA2-8 an archived class never holds a member's open attempt", () => {
  const user = (id, classId) => ({ userId: id, role: "student", active: true, archived: false, classId, displayName: "طالب " + id, firstName: "طالب", familyName: id, code: "C" + id, authVersion: 1 });
  const TEACHER = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {} });
  const seed = () => createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف 1", active: true, status: "active" },
    "platform/users/s1.json": user("s1", "c1"),
    "platform/assignments/a1.json": { schemaVersion: 2, attemptModelVersion: 2, attemptPolicy: "continuous", assignmentId: "a1", classId: "c1", status: "published", title: "واجب", openAt: "", dueAt: "", maxAttempts: 1, durationMinutes: 0, questionCount: 1, totalMarks: 2,
      examSnapshot: { title: "x", questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "؟", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } }] } }
  });
  const sdeps = (ctx, over = {}) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: "s1", sv: 1 } }), withAssignmentLock: async (_c, _id, fn) => fn(), ...over });
  const start = (ctx, over) => submissionHandler({ method: "POST", params: { assignmentId: "a1" }, json: async () => ({ action: "startAttempt" }) }, sdeps(ctx, over));
  const archive = (ctx, over = {}) => classrooms({ method: "POST", url: "https://x/api/classrooms", json: async () => ({ action: "archive", classId: "c1" }) }, { ...TEACHER(ctx), ...over });
  const state = ctx => ({ classStatus: ctx.getJson("platform/classes/c1.json").status || "active", open: !!(ctx.getJson("platform/submissions/a1/s1.json") || {}).activeAttempt });

  it("a start that lands between the archive's pending check and its write: the archive withdraws itself (409) and the attempt stays usable", async () => {
    const ctx = seed();
    let started = null;
    const ar = await archive(ctx, { mutateJsonWithRetry: async (c, name, fn) => { if (name === "platform/classes/c1.json" && !started) started = await start(ctx); return mutateJsonWithRetry(c, name, fn); } });
    expect(started.status).toBe(200);
    expect({ archive: ar.status, code: ar.jsonBody.code }).toEqual({ archive: 409, code: "PENDING_GRADING" });
    expect(state(ctx)).toEqual({ classStatus: "active", open: true });
    expect(ctx.getJson("platform/classes/c1.json").archivedAt).toBeUndefined();
  });

  it("an archive that commits between the start's write and its re-read: the start withdraws its own untouched attempt (403)", async () => {
    const ctx = seed();
    let archived = false;
    const r = await start(ctx, { mutateJsonWithRetry: async (c, name, fn) => {
      const out = await mutateJsonWithRetry(c, name, fn);
      if (name === "platform/submissions/a1/s1.json" && !archived) {
        // an archive whose pending check ran BEFORE this attempt existed commits right after the attempt was written (the start side
        // alone must react: its re-read after the write sees the archived class)
        archived = true;
        await mutateJsonWithRetry(ctx.container, "platform/classes/c1.json", cur => ({ ...cur, status: "archived", active: false, archivedAt: "2026-10-25T12:00:00.000Z" }));
      }
      return out;
    } });
    expect(r.status).toBe(403);
    expect(state(ctx)).toEqual({ classStatus: "archived", open: false });
  });

  it("an archive that commits after the request read the class but before its write: refused inside the write, no submission created", async () => {
    const ctx = seed();
    const { downloadJsonOrNull } = require_("../src/lib/platform-storage.js");
    let classReads = 0;
    const r = await start(ctx, { downloadJsonOrNull: async (c, name) => {
      const doc = await downloadJsonOrNull(c, name);
      if (name === "platform/classes/c1.json" && ++classReads === 1) ctx.setJson(name, { ...doc, status: "archived", active: false, archivedAt: "2026-10-25T12:00:00.000Z" });
      return doc;
    } });
    expect(r.status).toBe(403);
    expect(ctx.getJson("platform/submissions/a1/s1.json")).toBeFalsy();
  });

  it("an archive already committed: the start is refused inside its own write (403), nothing is created", async () => {
    const ctx = seed();
    expect((await archive(ctx)).status).toBe(200);
    expect((await start(ctx)).status).toBe(403);
    expect(state(ctx)).toEqual({ classStatus: "archived", open: false });
  });

  it("unchanged: an archive with no open work, and a start in an active class, both succeed", async () => {
    const ctx = seed();
    expect((await start(ctx)).status).toBe(200);
    const ctx2 = seed();
    expect((await archive(ctx2)).status).toBe(200);
    expect(state(ctx2)).toEqual({ classStatus: "archived", open: false });
  });
});

describe("QA2-9 turning sharing off withdraws earlier posts from classmates", () => {
  const user = (id, over = {}) => ({ userId: id, role: "student", active: true, archived: false, classId: "c1", displayName: "طالب " + id, code: "C" + id, authVersion: 1, ...over });
  const S = (ctx, sub) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1 } }) });
  const seed = () => createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف", active: true },
    "platform/users/s1.json": user("s1", { shareAchievements: true }),
    "platform/users/s2.json": user("s2"),
    "platform/assignments/a1.json": { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", resultsRelease: "immediate" }
  });
  const post = ctx => recordAchievementIfEligible(ctx.container, { classId: "c1", studentId: "s1", studentDisplayName: "طالب s1", assignmentId: "a1", assignmentTitle: "واجب", percentage: 95, shareAchievements: true });
  const list = async (ctx, sub) => (await feed({ method: "GET", url: "https://x/api/achievement-feed" }, S(ctx, sub))).jsonBody.posts;
  const setShare = (ctx, share) => profile({ method: "POST", json: async () => ({ action: "setShareAchievements", share }) }, S(ctx, "s1"));

  it("off: a classmate no longer sees nor reacts to the earlier post; the author still sees it; on again: visible again", async () => {
    const ctx = seed();
    expect(await post(ctx)).toBe(true);
    expect((await list(ctx, "s2")).length).toBe(1);
    await setShare(ctx, false);
    expect(await list(ctx, "s2")).toEqual([]);
    const postId = (await list(ctx, "s1"))[0].postId;
    expect((await list(ctx, "s1")).length).toBe(1);
    const react = await feed({ method: "POST", url: "https://x/api/achievement-feed", json: async () => ({ action: "react", postId, reaction: "clap" }) }, S(ctx, "s2"));
    expect(react.status).toBe(404);
    await setShare(ctx, true);
    expect((await list(ctx, "s2")).length).toBe(1);
  });
});

describe("QA2-10 a bulk move advances profileRevision: a stale edit form never moves the student back", () => {
  const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), recordAuditEvent: async () => {} };
  const call = (ctx, body) => students({ method: "POST", url: "https://x/api/students", json: async () => body }, { ...AUTH, container: ctx.container });
  it("the form opened before the move gets 409 STUDENT_STALE and the student stays in c2; the reloaded form saves", async () => {
    const ctx = createMemoryContainer();
    ctx.setJson("platform/classes/c1.json", { classId: "c1", name: "صف 1", active: true, studentIds: [] });
    ctx.setJson("platform/classes/c2.json", { classId: "c2", name: "صف 2", active: true, studentIds: [] });
    const created = await call(ctx, { action: "create", classId: "c1", firstName: "علي", familyName: "حسن", identityNumber: "123456789", password: "secret12" });
    const userId = created.jsonBody.student.userId, rev = created.jsonBody.student.profileRevision;
    expect((await call(ctx, { action: "bulkAction", operation: "move", userIds: [userId], targetClassId: "c2" })).status).toBe(200);
    const stale = await call(ctx, { action: "update", userId, firstName: "عليّ", familyName: "حسن", identityNumber: "123456789", classId: "c1", password: "", expectedProfileRevision: rev });
    expect({ status: stale.status, code: stale.jsonBody.code, classId: ctx.getJson("platform/users/" + userId + ".json").classId }).toEqual({ status: 409, code: "STUDENT_STALE", classId: "c2" });
    const fresh = ctx.getJson("platform/users/" + userId + ".json").profileRevision;
    expect(fresh).toBe(rev + 1);
    expect((await call(ctx, { action: "update", userId, firstName: "عليّ", familyName: "حسن", identityNumber: "123456789", classId: "c2", password: "", expectedProfileRevision: fresh })).status).toBe(200);
  });
});

describe("QA2-11 clearing the draft advances draftRevision: a stale device never grades its older copy", () => {
  const auth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
  const call = (ctx, body) => submissionHandler(F.studentRequest(body), { container: ctx.container, requireStudentAuth: auth, env: F.ENV, fetch: F.runnerFetch() }, quiet);
  it("legacy untimed: device A submits; device B still holding the submitted draft's revision is refused (DRAFT_STALE), one attempt", async () => {
    const ctx = F.seed({ a: F.assignment({ attemptModelVersion: 1, durationMinutes: 0, attemptPolicy: undefined, maxAttempts: 3 }), doc: F.activeDoc({}, { activeAttempt: null }) });
    const OLD = { sa1: { kind: "text", value: "old" } }, NEW = { sa1: { kind: "text", value: "x" } };
    const base = (await call(ctx, { action: "saveDraft", answers: OLD, expectedDraftRevision: 0 })).jsonBody.draftRevision;
    const a = await call(ctx, { action: "submit", answers: NEW, expectedDraftRevision: base, submitKey: "deviceA-000001" });
    expect(a.status).toBe(200);
    expect(a.jsonBody.state.draftRevision).toBe(base + 1);
    const b = await call(ctx, { action: "saveDraft", answers: OLD, expectedDraftRevision: base });
    const bs = await call(ctx, { action: "submit", answers: OLD, expectedDraftRevision: base, submitKey: "deviceB-000001" });
    expect({ save: b.status, saveCode: b.jsonBody.code, submit: bs.status, attempts: ctx.getJson(F.SUB).attempts.length }).toEqual({ save: 409, saveCode: "DRAFT_STALE", submit: 409, attempts: 1 });
  });
  it("the teacher ending an attempt advances draftRevision too", async () => {
    const ctx = F.seed();
    const before = Number(ctx.getJson(F.SUB).draftRevision || 0);
    const results = require_("../src/functions/assignment-results.js");
    const r = await results.handler(F.teacherRequest("/api/assignment-results", { action: "endActiveAttempt", assignmentId: F.AID, studentId: F.S1, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 }), { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-x" } }), getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() }, quiet);
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(ctx.getJson(F.SUB).draftRevision).toBe(before + 1);
  });

  it("unchanged: a device that adopted the new revision saves and submits normally", async () => {
    const ctx = F.seed({ a: F.assignment({ attemptModelVersion: 1, durationMinutes: 0, attemptPolicy: undefined, maxAttempts: 3 }), doc: F.activeDoc({}, { activeAttempt: null }) });
    const a = await call(ctx, { action: "submit", answers: { sa1: { kind: "text", value: "x" } }, expectedDraftRevision: 0, submitKey: "deviceA-000002" });
    const rev = a.jsonBody.state.draftRevision;
    expect((await call(ctx, { action: "saveDraft", answers: { sa1: { kind: "text", value: "y" } }, expectedDraftRevision: rev })).status).toBe(200);
  });
});

describe("QA2-20 a project reset never sends the template revision back", () => {
  it("page A loads rev 0; B saves (rev 1) and resets; A's stale save (expected 0) is TEMPLATE_STALE; the reset template is the factory one", async () => {
    const ctx = createMemoryContainer();
    const code = "899373", now = new Date().toISOString();
    await svc.updateTemplate(ctx.container, code, "c1", { trackWeights: { a: 1 } }, now, { expectedRevision: 0 });
    await svc.resetProject(ctx.container, code, "c1");
    const ns = require_("../src/lib/project-tracker/registry.js").getStorageNamespace(code);
    const after = ctx.getJson(ns.configName("c1"));
    expect(after.templateRevision).toBe(2);
    expect(after.trackWeights && after.trackWeights.a).not.toBe(1);
    let err = null;
    try { await svc.updateTemplate(ctx.container, code, "c1", { trackWeights: { a: 2 } }, now, { expectedRevision: 0 }); } catch (e) { err = e; }
    expect(err && err.code).toBe("TEMPLATE_STALE");
    await svc.updateTemplate(ctx.container, code, "c1", { trackWeights: { a: 3 } }, now, { expectedRevision: 2 });
  });
  it("unchanged: a never-edited snapshot is deleted by the reset (nothing written)", async () => {
    const ctx = createMemoryContainer();
    const code = "899373";
    const ns = require_("../src/lib/project-tracker/registry.js").getStorageNamespace(code);
    ctx.setJson(ns.configName("c1"), svc.buildClassSnapshot(require_("../src/lib/project-tracker/registry.js").getProjectDefinition(code), "c1", new Date().toISOString()));
    await svc.resetProject(ctx.container, code, "c1");
    expect(ctx.getJson(ns.configName("c1"))).toBeFalsy();
  });
});
