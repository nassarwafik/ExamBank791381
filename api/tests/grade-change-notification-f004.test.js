import { describe, it, expect, beforeEach } from "vitest";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import { handler as reviewHandler } from "../src/functions/assignment-review.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { handler as notificationsHandler } from "../src/functions/student-notifications.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// FEATURE-004 — the student notification after a teacher grade change, certified through the REAL handlers on ONE in-memory
// store: the notification is a side effect of a COMMITTED authoritative saveReview only (never of a read, a failed, refused or
// unauthorized save), it is emitted exactly once per meaningful change (an identical re-save or a retried POST adds nothing),
// it reaches only the graded student, it carries the UPDATED grade (score / totalMarks) the student can also read from the
// submission API, a feedback-only review claims no grade, and a storage failure of the notification never fails the save.

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const S3 = "33333333-3333-3333-3333-333333333333";
const CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const HOUR = 3600e3;
const iso = ms => new Date(ms).toISOString();
const user = (userId, name, classId) => ({ schemaVersion: 3, role: "student", userId, displayName: name, code: userId.slice(0, 2), classId, active: true, archived: false, authVersion: 1 });
const EXAM = { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "اشرح", marks: 10 }] };
const EXAM2 = { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "اشرح", marks: 10 }, { examQuestionId: "q2", presentationType: "shortAnswer", text: "عرّف", marks: 10 }] };

let ctx, warnings;
beforeEach(() => {
  warnings = [];
  ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: user(S1, "أحمد", CA),
    ["platform/users/" + S2 + ".json"]: user(S2, "سارة", CA),
    ["platform/users/" + S3 + ".json"]: user(S3, "ليلى", CB),
    ["platform/classes/" + CA + ".json"]: { classId: CA, name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [S1, S2], programCodes: ["899373"] },
    ["platform/classes/" + CB + ".json"]: { classId: CB, name: "الثاني عشر", grade: "12", schoolYear: "2026", active: true, status: "active", studentIds: [S3], programCodes: ["899373"] }
  });
});
const H = { get: () => null };
const OBS = { logWarn(name, data) { warnings.push({ name, data }); }, logInfo() {}, logError() {} };
const T = (over = {}) => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, container: ctx.container, recordAuditEvent: async () => {}, recordAchievementIfEligible: async () => {}, ...over });
const ST = (sub, classId = CA) => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1, role: "student", classId } }), recordAchievementIfEligible: async () => {} });
const manage = body => manageHandler({ method: "POST", url: "https://x/api/assignments", json: async () => body }, T(), OBS);
const review = (body, deps = {}) => reviewHandler({ method: "POST", url: "https://x/api/assignment-review", json: async () => ({ action: "saveReview", ...body }) }, T(deps), OBS);
const reviewGet = (aid, sid) => reviewHandler({ method: "GET", url: "https://x/api/assignment-review?assignmentId=" + aid + "&studentId=" + sid + "&attemptNumber=1" }, T(), OBS);
const submit = (aid, sid, body, classId) => submissionHandler({ method: "POST", params: { assignmentId: aid }, headers: H, json: async () => body }, ST(sid, classId));
const studentState = async (aid, sid) => (await submissionHandler({ method: "GET", params: { assignmentId: aid }, headers: H }, ST(sid))).jsonBody.state;
const notifications = async sid => (await notificationsHandler({ method: "GET", url: "https://x/api/student-notifications", headers: H }, ST(sid))).jsonBody;
const reviewed = async sid => (await notifications(sid)).items.filter(i => i.type === "assignment_reviewed");

async function createAssignment(extra = {}) {
  const r = await manage({ action: "create", classId: CA, title: "امتحان الشبكات", examSnapshot: EXAM, publish: true, maxAttempts: 1, openAt: iso(Date.now() - HOUR), dueAt: iso(Date.now() + 24 * HOUR), ...extra });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
  return r.jsonBody.assignment.assignmentId;
}
async function startAndSubmit(aid, sid, answers) {
  const st = (await submit(aid, sid, { action: "startAttempt" })).jsonBody.state;
  const r = await submit(aid, sid, { action: "submit", answers, expectedAttemptNumber: st.activeAttempt.attemptNumber, expectedStartedAt: st.activeAttempt.startedAt });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
}
const ANSWERS = { q1: { kind: "text", value: "إجابة الطالب" } };

describe("FEATURE-004 — grade change → one notification with the updated grade, for the graded student only", () => {
  it("grade changed successfully → exactly one notification carrying the updated grade; the student's own result agrees; a classmate gets nothing", async () => {
    const aid = await createAssignment();
    await startAndSubmit(aid, S1, ANSWERS);
    expect(await reviewed(S1)).toHaveLength(0);                                                       // submitting is not a grade change
    await reviewGet(aid, S1);
    expect(await reviewed(S1)).toHaveLength(0);                                                       // opening the review screen notifies nothing
    const r = await review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 8.5, comment: "" } }, teacherFeedback: "" });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const ev = await reviewed(S1);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ assignmentId: aid, assignmentTitle: "امتحان الشبكات", becameFinal: true, scoreChanged: true, finalized: true, score: 8.5, totalMarks: 10, percentage: 85, unread: true });
    expect(typeof ev[0].createdAt).toBe("string");
    expect(ev[0].createdAt).not.toBe("");
    expect(JSON.stringify(ev[0])).not.toMatch(/studentId|reviewedAt|expectedAnswer|answer/);         // nothing beyond the student's own facts
    const st = await studentState(aid, S1);
    expect(st.latestResult).toMatchObject({ score: 8.5, totalMarks: 10, finalized: true });          // the notified grade is the one the student reads
    expect(await reviewed(S2)).toHaveLength(0);
  });

  it("same grade saved twice → no second notification; a retried identical POST → still one; a later real change → a second one with the new grade", async () => {
    const aid = await createAssignment();
    await startAndSubmit(aid, S1, ANSWERS);
    const body = { assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 7, comment: "" } }, teacherFeedback: "عمل جيد" };
    expect((await review(body)).status).toBe(200);
    expect((await review(body)).status).toBe(200);                                                   // identical re-save
    expect((await review({ ...body })).status).toBe(200);                                            // client retry of the same request
    const once = await reviewed(S1);
    expect(once).toHaveLength(1);
    expect(once[0]).toMatchObject({ score: 7, totalMarks: 10, becameFinal: true });
    expect((await review({ ...body, overrides: { q1: { score: 9, comment: "" } } })).status).toBe(200);
    const twice = await reviewed(S1);
    expect(twice).toHaveLength(2);
    expect(twice.map(e => e.score).sort()).toEqual([7, 9]);
    const latest = twice.find(e => e.score === 9);
    expect(latest).toMatchObject({ becameFinal: false, scoreChanged: true, finalized: true, percentage: 90 });
  });

  it("a feedback-only review notifies without claiming a grade (score null)", async () => {
    const aid = await createAssignment();
    await startAndSubmit(aid, S1, ANSWERS);
    expect((await review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 6, comment: "" } }, teacherFeedback: "" })).status).toBe(200);
    expect((await review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 6, comment: "" } }, teacherFeedback: "راجع الطبقة الثالثة" })).status).toBe(200);
    const ev = await reviewed(S1);
    expect(ev).toHaveLength(2);
    const feedbackOnly = ev.find(e => e.feedbackChanged && !e.scoreChanged && !e.becameFinal);
    expect(feedbackOnly).toBeTruthy();
    expect(feedbackOnly.score).toBeNull();
    expect(feedbackOnly.totalMarks).toBe(10);
  });

  it("a partial manual review (one of two pending questions) notifies the current grade as NOT final; completing it notifies the final grade", async () => {
    const aid = await createAssignment({ examSnapshot: EXAM2 });
    await startAndSubmit(aid, S1, { q1: { kind: "text", value: "أ" }, q2: { kind: "text", value: "ب" } });
    expect((await review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 10, comment: "" } }, teacherFeedback: "" })).status).toBe(200);
    let ev = await reviewed(S1);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ scoreChanged: true, becameFinal: false, finalized: false, score: 10, totalMarks: 20, percentage: null });
    expect((await review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 10, comment: "" }, q2: { score: 5, comment: "" } }, teacherFeedback: "" })).status).toBe(200);
    ev = await reviewed(S1);
    expect(ev).toHaveLength(2);
    expect(ev.find(e => e.becameFinal)).toMatchObject({ finalized: true, score: 15, totalMarks: 20, percentage: 75 });
  });

  it("failed, refused or unauthorized saves notify nothing", async () => {
    const aid = await createAssignment();
    await startAndSubmit(aid, S1, ANSWERS);
    expect((await review({ assignmentId: aid, studentId: S1, attemptNumber: 7, overrides: { q1: { score: 8, comment: "" } } })).status).toBe(404);       // unknown attempt
    expect((await review({ assignmentId: "../etc", studentId: S1, attemptNumber: 1, overrides: { q1: { score: 8, comment: "" } } })).status).toBe(400);  // invalid id
    expect((await review({ assignmentId: aid, studentId: S3, attemptNumber: 1, overrides: { q1: { score: 8, comment: "" } } })).status).toBe(404);       // other class, no submission
    const unauthorized = await reviewHandler({ method: "POST", url: "https://x/api/assignment-review", json: async () => ({ action: "saveReview", assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 8, comment: "" } } }) }, T({ requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "unauthorized" } } }) }), OBS);
    expect(unauthorized.status).toBe(401);
    const conflict = await review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 8, comment: "" } } }, { mutateJsonWithRetry: async () => { const err = new Error("تعذر الحفظ مؤقتًا."); err.httpStatus = 503; throw err; } });
    expect(conflict.status).toBe(503);                                                                 // the CAS write failed → nothing committed
    expect(await reviewed(S1)).toHaveLength(0);
    expect(await reviewed(S3)).toHaveLength(0);
    expect((await studentState(aid, S1)).latestResult.finalized).toBe(false);                          // and the grade is untouched
  });

  it("a notification storage failure never rolls back or fails the committed grade", async () => {
    const aid = await createAssignment();
    await startAndSubmit(aid, S1, ANSWERS);
    const r = await review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 8, comment: "" } }, teacherFeedback: "" }, { recordNotificationEvent: async () => { throw new Error("storage down"); } });
    expect(r.status).toBe(200);
    expect((await studentState(aid, S1)).latestResult).toMatchObject({ score: 8, finalized: true });
    expect(await reviewed(S1)).toHaveLength(0);
    expect(warnings.map(w => w.name)).toContain("notification.event.failed");
    expect(JSON.stringify(warnings)).not.toMatch(/امتحان الشبكات|1111|storage down/);
  });

  it("the student can acknowledge the notification; the item keeps pointing at the permitted assignment result", async () => {
    const aid = await createAssignment();
    await startAndSubmit(aid, S1, ANSWERS);
    expect((await review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 8, comment: "" } }, teacherFeedback: "" })).status).toBe(200);
    const [ev] = await reviewed(S1);
    const ack = await notificationsHandler({ method: "POST", url: "https://x/api/student-notifications", headers: H, json: async () => ({ action: "markEventRead", eventId: ev.id }) }, ST(S1));
    expect(ack.status).toBe(200);
    const [after] = await reviewed(S1);
    expect(after).toMatchObject({ id: ev.id, assignmentId: aid, unread: false, score: 8, totalMarks: 10 });
    const asOther = await notificationsHandler({ method: "POST", url: "https://x/api/student-notifications", headers: H, json: async () => ({ action: "markEventRead", eventId: ev.id }) }, ST(S2));
    expect(asOther.status).not.toBe(200);                                                             // a classmate can neither see nor acknowledge it
  });
});
