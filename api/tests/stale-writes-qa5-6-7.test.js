import { describe, it, expect, beforeAll } from "vitest";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { handler as review } from "../src/functions/assignment-review.js";
import { handler as students } from "../src/functions/manage-students.js";
import { handler as classrooms } from "../src/functions/manage-classrooms.js";
import { handler as login } from "../src/functions/platform-login.js";
import { getProjectDefinition, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// QA-5 / QA-6 / QA-7 — writes that silently replaced a newer state.
//
// Fail-first (QA on main c244cbab; fail-first run on 46ba9297):
//   QA-5  a student deleted while their login was in flight was re-created by the login's lastLogin write (from the pre-read copy)
//         and received a 12-hour session;
//   QA-6  the project's lazy first snapshot was written unconditionally, so a template.update that landed in between was replaced
//         by the default stage settings;
//   QA-7  four whole-object editors had no version check: a review form, a student edit form, the class project toggles and the
//         stage template editor, each opened before another tab / teacher saved, wrote its older values back with a 200.
// Fixed: the login stamp only lands on the CURRENT student document; the first snapshot is create-only; review / student / template
// writes assert the version the page loaded (409 *_STALE, nothing written); setPrograms applies the page's change to the stored list.
//
// Every test runs the REAL handlers on the in-memory store.

beforeAll(() => { process.env.STUDENT_SESSION_SECRET = "qa-stale-writes-secret-0123456789abcdef"; });
const NOW = "2026-10-01T10:00:00.000Z";
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const DEF = getProjectDefinition(CODE);
const TAUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), recordAuditEvent: async () => {}, recordProjectMilestones: async () => {}, recordAchievementIfEligible: async () => {} };
const user = (id, cid, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id, ...extra });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW, ...extra });
const sreq = body => ({ method: "POST", url: "https://x/api/students", json: async () => body });
const creq = body => ({ method: "POST", url: "https://x/api/classrooms", json: async () => body });
const lreq = body => ({ method: "POST", url: "https://x/api/platform-login", headers: new Map(), json: async () => body });
const loginDeps = container => ({ getContainer: () => container, reserveLoginAttempt: async () => ({ allowed: true }), clearLoginThrottle: async () => {}, clientIdFromRequest: () => "qa", validateBuilderCredentials: () => false });
// A container whose nth `blobName` download runs `between` once, after the read returned and before the caller writes (a
// concurrent writer landing mid-request).
function onRead(ctx, blobName, nth, between) {
  let reads = 0, fired = false;
  return {
    ...ctx.container,
    getBlobClient(name) {
      const inner = ctx.container.getBlobClient(name);
      if (name !== blobName) return inner;
      return { ...inner, async download() {
        reads++;
        let res, err; try { res = await inner.download(); } catch (e) { err = e; }   // the read completes FIRST (it sees the old state)…
        if (reads === nth && !fired) { fired = true; await between(); }              // …then the concurrent writer lands
        if (err) throw err; return res;
      } };
    },
    getBlockBlobClient: n => ctx.container.getBlockBlobClient(n), listBlobsFlat: o => ctx.container.listBlobsFlat(o)
  };
}
async function createStudent(ctx, identityNumber = "222333444") {
  const r = await students(sreq({ action: "create", classId: "c1", firstName: "علي", familyName: "حسن", identityNumber, password: "secret12" }), { ...TAUTH, container: ctx.container });
  expect(r.status).toBe(200);
  return r.jsonBody.student;
}

describe("QA-5 a login in flight never resurrects a deleted / archived student", () => {
  it("deleted during password verification → stays deleted, login 401", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: [] }) });
    const s = await createStudent(ctx);
    const name = "platform/users/" + s.userId + ".json";
    let del;
    const wrapped = onRead(ctx, name, 2, async () => { del = await students(sreq({ action: "delete", userId: s.userId }), { ...TAUTH, container: ctx.container }); });
    const r = await login(lreq({ userCode: "222333444", password: "secret12" }), loginDeps(wrapped));
    expect(del.status).toBe(200);
    expect(ctx.has(name)).toBe(false);
    expect(r.status).toBe(401);
    expect(r.jsonBody.token).toBeUndefined();
  });

  it("archived during password verification → login 401, the archive stays", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: [] }) });
    const s = await createStudent(ctx);
    const name = "platform/users/" + s.userId + ".json";
    const wrapped = onRead(ctx, name, 2, async () => { const d = ctx.getJson(name); ctx.setJson(name, { ...d, archived: true }); });
    const r = await login(lreq({ userCode: "222333444", password: "secret12" }), loginDeps(wrapped));
    expect(r.status).toBe(401);
    expect(ctx.getJson(name).archived).toBe(true);
    expect(ctx.getJson(name).lastLoginAt || "").toBe("");
  });

  it("unchanged: an ordinary login succeeds and stamps lastLoginAt (and does not advance profileRevision)", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: [] }) });
    const s = await createStudent(ctx);
    const r = await login(lreq({ userCode: "222333444", password: "secret12" }), loginDeps(ctx.container));
    expect(r.status).toBe(200);
    const doc = ctx.getJson("platform/users/" + s.userId + ".json");
    expect(doc.lastLoginAt).toBeTruthy();
    expect(doc.profileRevision || 0).toBe(0);
  });
});

describe("QA-6 the project's first snapshot never replaces a concurrent template.update", () => {
  const post = (container, body) => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", ...body }) }, { ...TAUTH, container, getContainer: () => container });
  it("a teacher's stage settings saved between the first progress write's read and its write survive", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1") });
    const stages = JSON.parse(JSON.stringify(DEF.stages));
    stages[0].title = "عنوان المعلم الجديد";
    let templateRes;
    const wrapped = onRead(ctx, NS.configName("c1"), 1, async () => { templateRes = await post(ctx.container, { action: "template.update", template: { stages } }); });
    const score = await post(wrapped, { action: "score.set", studentId: "s1", stageId: stages.find(s => s.active).stageId, score: 70 });
    expect(templateRes.status).toBe(200);
    expect(score.status).toBe(200);
    expect(ctx.getJson(NS.configName("c1")).stages[0].title).toBe("عنوان المعلم الجديد");
  });

  it("unchanged: with no concurrent writer the first write still creates the snapshot", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1") });
    const r = await post(ctx.container, { action: "score.set", studentId: "s1", stageId: DEF.stages.find(s => s.active).stageId, score: 70 });
    expect(r.status).toBe(200);
    expect(ctx.getJson(NS.configName("c1")).stages.length).toBe(DEF.stages.length);
  });
});

describe("QA-7a manual review: a form opened before a newer save never reverts it", () => {
  const AP = "platform/assignments/", SP = "platform/submissions/", UP = "platform/users/";
  function seed() {
    const ctx = createMemoryContainer();
    ctx.setJson(AP + "a1.json", { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", totalMarks: 15, examSnapshot: { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 5, text: "x1" }, { examQuestionId: "q2", presentationType: "shortAnswer", marks: 10, text: "x2" }] } });
    ctx.setJson("platform/classes/c1.json", { classId: "c1", name: "صف", active: true });
    ctx.setJson(UP + "s1.json", { userId: "s1", role: "student", classId: "c1", active: true, displayName: "أ", code: "S1" });
    ctx.setJson(SP + "a1/s1.json", { assignmentId: "a1", studentId: "s1", classId: "c1", activeAttempt: null, attempts: [{ attemptNumber: 1, submittedAt: NOW, score: 5, totalMarks: 15, percentage: 33.33, manualReviewMarks: 10, finalized: false, answers: {}, manualOverrides: {}, questionGrades: [{ questionId: "q1", score: 5, maxMarks: 5, manualReview: false }, { questionId: "q2", score: 0, maxMarks: 10, manualReview: true }] }] });
    return ctx;
  }
  const save = (ctx, overrides, teacherFeedback, extra = {}) => review({ method: "POST", url: "http://x/assignment-review", json: async () => ({ action: "saveReview", assignmentId: "a1", studentId: "s1", attemptNumber: 1, overrides, teacherFeedback, ...extra }) }, { ...TAUTH, getContainer: () => ctx.container });
  const get = ctx => review({ method: "GET", url: "http://x/assignment-review?assignmentId=a1&studentId=s1&attemptNumber=1" }, { ...TAUTH, getContainer: () => ctx.container });
  it("the GET carries reviewRevision; tab B (loaded before tab A's save) is refused 409 REVIEW_STALE and A's decision stays", async () => {
    const ctx = seed();
    const base = (await get(ctx)).jsonBody.attempt.reviewRevision;
    expect(base).toBe(0);
    const a = await save(ctx, { q2: { score: 9, comment: "أحسنت" } }, "عمل ممتاز", { expectedReviewRevision: base });
    expect(a.status).toBe(200);
    expect(a.jsonBody.result.reviewRevision).toBe(1);
    const b = await save(ctx, { q1: { score: 4, comment: "" }, q2: { score: 6, comment: "" } }, "", { expectedReviewRevision: base });
    expect(b.status).toBe(409);
    expect(b.jsonBody.code).toBe("REVIEW_STALE");
    const at = ctx.getJson(SP + "a1/s1.json").attempts[0];
    expect(at.manualOverrides.q2.score).toBe(9);
    expect(at.teacherFeedback).toBe("عمل ممتاز");
    expect(at.manualOverrides.q1).toBeUndefined();
  });
  it("after reloading, the same tab saves against the new version", async () => {
    const ctx = seed();
    await save(ctx, { q2: { score: 9, comment: "" } }, "", { expectedReviewRevision: 0 });
    const rev = (await get(ctx)).jsonBody.attempt.reviewRevision;
    const r = await save(ctx, { q1: { score: 4, comment: "" }, q2: { score: 9, comment: "" } }, "", { expectedReviewRevision: rev });
    expect(r.status).toBe(200);
    expect(ctx.getJson(SP + "a1/s1.json").attempts[0].manualOverrides).toMatchObject({ q1: { score: 4 }, q2: { score: 9 } });
  });
  it("a malformed version fails closed; a save without one behaves as before", async () => {
    const ctx = seed();
    expect((await save(ctx, { q2: { score: 1, comment: "" } }, "", { expectedReviewRevision: "0" })).status).toBe(409);
    expect((await save(ctx, { q2: { score: 2, comment: "" } }, "")).status).toBe(200);
    expect((await save(ctx, { q2: { score: 3, comment: "" } }, "")).status).toBe(200);
    expect(ctx.getJson(SP + "a1/s1.json").attempts[0].manualOverrides.q2.score).toBe(3);
  });
});

describe("QA-7b student edit: a form opened before a newer save never reverts it", () => {
  it("publicStudent carries profileRevision; the stale form is refused 409 STUDENT_STALE and the first fix stays", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "صف", active: true, studentIds: [] } });
    const s = await createStudent(ctx, "123123123");
    expect(s.profileRevision).toBe(0);
    const d = { ...TAUTH, container: ctx.container };
    const a = await students(sreq({ action: "update", userId: s.userId, firstName: "عليّ", familyName: "حسن", identityNumber: "123123123", classId: "c1", expectedProfileRevision: 0 }), d);
    expect(a.status).toBe(200);
    const b = await students(sreq({ action: "update", userId: s.userId, firstName: "علي", familyName: "الحسن", identityNumber: "123123123", classId: "c1", expectedProfileRevision: 0 }), d);
    expect(b.status).toBe(409);
    expect(b.jsonBody.code).toBe("STUDENT_STALE");
    const doc = ctx.getJson("platform/users/" + s.userId + ".json");
    expect([doc.firstName, doc.familyName, doc.profileRevision]).toEqual(["عليّ", "حسن", 1]);
  });
  it("a stale rename never moves the credential (the new auth path is not left behind)", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "صف", active: true, studentIds: [] } });
    const s = await createStudent(ctx, "123123123");
    const d = { ...TAUTH, container: ctx.container };
    await students(sreq({ action: "update", userId: s.userId, firstName: "عليّ", familyName: "حسن", identityNumber: "123123123", classId: "c1", expectedProfileRevision: 0 }), d);
    const authBefore = ctx.names("platform/auth/").sort();
    const b = await students(sreq({ action: "update", userId: s.userId, firstName: "علي", familyName: "حسن", identityNumber: "999888777", classId: "c1", expectedProfileRevision: 0 }), d);
    expect(b.status).toBe(409);
    expect(ctx.names("platform/auth/").sort()).toEqual(authBefore);
    expect(ctx.getJson("platform/users/" + s.userId + ".json").code).toBe("123123123");
  });
  it("unchanged: an update without the field behaves as before", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "صف", active: true, studentIds: [] } });
    const s = await createStudent(ctx, "123123123");
    const d = { ...TAUTH, container: ctx.container };
    expect((await students(sreq({ action: "update", userId: s.userId, firstName: "أ", familyName: "ب", identityNumber: "123123123", classId: "c1" }), d)).status).toBe(200);
    expect((await students(sreq({ action: "update", userId: s.userId, firstName: "ج", familyName: "د", identityNumber: "123123123", classId: "c1" }), d)).status).toBe(200);
    expect(ctx.getJson("platform/users/" + s.userId + ".json").firstName).toBe("ج");
  });
});

describe("QA-7c class projects: two teachers' enrollments both survive", () => {
  const other = getProjectDefinition("794589") ? "794589" : null;
  it("each page sends its change against the list it started from; the stored list keeps both", async () => {
    expect(other).toBeTruthy();
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: [] }) });
    const d = { ...TAUTH, container: ctx.container, getContainer: () => ctx.container };
    const ra = await classrooms(creq({ action: "setPrograms", classId: "c1", programCodes: [CODE], baseProgramCodes: [] }), d);
    const rb = await classrooms(creq({ action: "setPrograms", classId: "c1", programCodes: [other], baseProgramCodes: [] }), d);
    expect([ra.status, rb.status]).toEqual([200, 200]);
    expect(ctx.getJson("platform/classes/c1.json").programCodes.sort()).toEqual([CODE, other].sort());
  });
  it("a removal from a stale page removes only what it removed", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: [CODE, other] }) });
    const d = { ...TAUTH, container: ctx.container, getContainer: () => ctx.container };
    // the page loaded [CODE] (before `other` was added elsewhere) and removes CODE
    const r = await classrooms(creq({ action: "setPrograms", classId: "c1", programCodes: [], baseProgramCodes: [CODE] }), d);
    expect(r.status).toBe(200);
    expect(ctx.getJson("platform/classes/c1.json").programCodes).toEqual([other]);
  });
  it("an unsupported added code is still refused; a malformed base is 400; without a base the list is set as before", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", { programCodes: [CODE] }) });
    const d = { ...TAUTH, container: ctx.container, getContainer: () => ctx.container };
    expect((await classrooms(creq({ action: "setPrograms", classId: "c1", programCodes: ["000000"], baseProgramCodes: [] }), d)).status).toBe(400);
    expect((await classrooms(creq({ action: "setPrograms", classId: "c1", programCodes: [other], baseProgramCodes: "x" }), d)).status).toBe(400);
    expect((await classrooms(creq({ action: "setPrograms", classId: "c1", programCodes: [other] }), d)).status).toBe(200);
    expect(ctx.getJson("platform/classes/c1.json").programCodes).toEqual([other]);
  });
});

describe("QA-7d stage template: an editor opened before a newer save never reverts it", () => {
  const post = (ctx, body) => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId: "c1", ...body }) }, { ...TAUTH, container: ctx.container });
  it("the second save from the same version is refused 409 TEMPLATE_STALE and the first edit stays", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1") });
    await post(ctx, { action: "program.activate" });
    const base = ctx.getJson(NS.configName("c1"));
    const rev = base.templateRevision || 0;
    const a = JSON.parse(JSON.stringify(base.stages)); a[0].title = "A-edit";
    const b = JSON.parse(JSON.stringify(base.stages)); b[1].title = "B-edit";
    const ra = await post(ctx, { action: "template.update", expectedTemplateRevision: rev, template: { stages: a } });
    const rb = await post(ctx, { action: "template.update", expectedTemplateRevision: rev, template: { stages: b } });
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(409);
    expect(rb.jsonBody.code).toBe("TEMPLATE_STALE");
    const s = ctx.getJson(NS.configName("c1")).stages;
    expect([s[0].title, s[1].title]).toEqual(["A-edit", base.stages[1].title]);
    const rc = await post(ctx, { action: "template.update", expectedTemplateRevision: ra.jsonBody.template.templateRevision, template: { stages: b.map((x, i) => i === 0 ? s[0] : x) } });
    expect(rc.status).toBe(200);
    expect(ctx.getJson(NS.configName("c1")).stages.slice(0, 2).map(x => x.title)).toEqual(["A-edit", "B-edit"]);
  });
  it("unchanged: a save without the field behaves as before", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1") });
    await post(ctx, { action: "program.activate" });
    const stages = ctx.getJson(NS.configName("c1")).stages;
    expect((await post(ctx, { action: "template.update", template: { stages } })).status).toBe(200);
    expect((await post(ctx, { action: "template.update", template: { stages } })).status).toBe(200);
  });
});
