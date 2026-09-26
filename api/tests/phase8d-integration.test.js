import { describe, it, expect, beforeEach } from "vitest";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import { handler as reviewHandler } from "../src/functions/assignment-review.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { handler as dashboardHandler } from "../src/functions/student-dashboard.js";
import { handler as notificationsHandler } from "../src/functions/student-notifications.js";
import { handler as trackerHandler } from "../src/functions/project-tracker.js";
import { handler as studentTrackerHandler } from "../src/functions/student-project-tracker.js";
import { handler as liveTeacherHandler } from "../src/functions/game-live-session.js";
import { handler as liveStudentHandler } from "../src/functions/game-live-session-student.js";
import { handler as numberConversionHandler } from "../src/functions/game-number-conversion.js";
import { gameDocName } from "../src/lib/number-conversion-store.js";
import { canonicalAnswerForTask } from "../src/lib/number-conversion.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase 8D — cross-feature chains through the REAL handlers on ONE in-memory store: a teacher action on one feature must
// be visible, exactly once and only to the right student, through every student-facing read that depends on it
// (dashboard, Strength, notification center, project tracker). Nothing here is recomputed by a client.

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const HOUR = 3600e3;
const iso = ms => new Date(ms).toISOString();
const user = (userId, name) => ({ schemaVersion: 3, role: "student", userId, displayName: name, code: userId.slice(0, 2), classId: CA, active: true, archived: false, authVersion: 1 });
const EXAM = { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "اشرح", marks: 10 }] };
const CHALLENGE = {
  kind: "live-challenge", schemaVersion: 1, savedAt: "2026-01-01T00:00:00.000Z",
  challenge: {
    schemaVersion: 1, challengeId: "c2", title: "جولة", courseId: "791381",
    questions: [
      { source: { kind: "manual" }, question: { examQuestionId: "q1", presentationType: "multipleChoice", text: "عاصمة؟", options: [{ text: "عمّان" }, { text: "إربد" }], correctOptionIndex: 0, answer: { correctOptionIndex: 0 }, marks: 1 } },
      { source: { kind: "manual" }, question: { examQuestionId: "q2", presentationType: "trueFalse", text: "١+١=٢", marks: 1, answer: { correct: true } } }
    ]
  }
};

let ctx;
beforeEach(() => {
  ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: user(S1, "أحمد"),
    ["platform/users/" + S2 + ".json"]: user(S2, "سارة"),
    ["platform/classes/" + CA + ".json"]: { classId: CA, name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [S1, S2], programCodes: ["899373"] },
    "platform/games/live-challenge/teacher-1/c2.json": CHALLENGE
  });
});

const H = { get: () => null };
const OBS = { logWarn() {}, logInfo() {}, logError() {} };
const T = () => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, container: ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {}, resolveTeacherDisplayName: async () => "أ. خالد" });
const ST = sub => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1, role: "student", classId: CA } }), recordAchievementIfEligible: async () => {} });

const manage = body => manageHandler({ method: "POST", url: "https://x/api/assignments", json: async () => body }, T(), OBS);
const review = body => reviewHandler({ method: "POST", url: "https://x/api/assignment-review", json: async () => ({ action: "saveReview", ...body }) }, T(), OBS);
const submit = (aid, sid, body) => submissionHandler({ method: "POST", params: { assignmentId: aid }, headers: H, json: async () => body }, ST(sid));
const dashboard = async sid => (await dashboardHandler({ method: "GET", url: "https://x/api/student-dashboard", headers: H }, ST(sid))).jsonBody;
const notifications = async sid => (await notificationsHandler({ method: "GET", url: "https://x/api/student-notifications", headers: H }, ST(sid))).jsonBody;
const ackEvent = (sid, eventId) => notificationsHandler({ method: "POST", url: "https://x/api/student-notifications", headers: H, json: async () => ({ action: "markEventRead", eventId }) }, ST(sid));
const trackerPost = body => trackerHandler({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: "899373", classId: CA, ...body }) }, T());
const readySummary = async () => (await trackerHandler({ method: "GET", url: "https://x/api/project-tracker?resource=projects-summary", json: async () => ({}) }, T())).jsonBody;
const studentTracker = async sid => (await studentTrackerHandler({ method: "GET", url: "https://x/api/student-project-tracker", headers: H }, ST(sid))).jsonBody;
const liveTeacher = (action, body) => liveTeacherHandler({ method: "POST", params: { action }, json: async () => body }, T());
const liveStudent = (sid, action, body) => liveStudentHandler({ method: "POST", params: { action }, json: async () => body }, ST(sid));
const nc = (sid, action, body) => numberConversionHandler({ method: "POST", url: "https://x/api/game-number-conversion/" + action, headers: H, params: { action }, json: async () => body }, ST(sid));

async function createAssignment(extra = {}) {
  const r = await manage({ action: "create", classId: CA, title: "واجب الشبكات", examSnapshot: EXAM, publish: true, maxAttempts: 1, openAt: iso(Date.now() - HOUR), dueAt: iso(Date.now() + 24 * HOUR), ...extra });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
  return r.jsonBody.assignment.assignmentId;
}
async function startAndSubmit(aid, sid, answers) {
  const st = (await submit(aid, sid, { action: "startAttempt" })).jsonBody.state;
  const r = await submit(aid, sid, { action: "submit", answers, expectedAttemptNumber: st.activeAttempt.attemptNumber, expectedStartedAt: st.activeAttempt.startedAt });
  expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
}
const events = async (sid, type) => (await notifications(sid)).items.filter(i => i.type === type);

// ---------------------------------------------------------------------------------------------------------------
describe("8D-A publish → submit → teacher review: dashboard result, Strength and the notification center agree", () => {
  it("a manual-review submission is provisional (0 Strength); the review makes it final, Strength follows the FINAL percentage, one reviewed event, only for that student", async () => {
    const aid = await createAssignment();
    expect(await events(S1, "assignment_published")).toHaveLength(1);
    expect(await events(S2, "assignment_published")).toHaveLength(1);

    await startAndSubmit(aid, S1, { q1: { kind: "text", value: "إجابة الطالب" } });
    let d1 = await dashboard(S1);
    let card = d1.assignments.find(a => a.assignmentId === aid);
    expect(card.dashboardState).toBe("awaitingReview");
    expect(card.latestResult.finalized).toBe(false);
    expect(d1.strength.examPoints).toBe(0);                                          // provisional → no Strength
    expect(await events(S1, "assignment_reviewed")).toHaveLength(0);

    const r = await review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 8, comment: "" } }, teacherFeedback: "عمل جيد" });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);

    d1 = await dashboard(S1);
    card = d1.assignments.find(a => a.assignmentId === aid);
    expect(card.dashboardState).toBe("completed");
    expect(card.latestResult).toMatchObject({ finalized: true, percentage: 80, teacherFeedback: "عمل جيد" });
    expect(d1.strength.examPoints).toBe(80);                                         // the FINAL percentage, derived
    expect(d1.stats.finalized).toBe(1);
    const reviewed = await events(S1, "assignment_reviewed");
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0]).toMatchObject({ assignmentId: aid, becameFinal: true, finalized: true, percentage: 80, unread: true });
    expect(await events(S2, "assignment_reviewed")).toHaveLength(0);                 // the classmate sees nothing
    const d2 = await dashboard(S2);
    expect(d2.strength.examPoints).toBe(0);
    expect(d2.assignments.find(a => a.assignmentId === aid).latestResult).toBeNull();

    // Acknowledging the review is one event: the bell drops by exactly one and the dashboard is unchanged.
    const before = (await notifications(S1)).bell.unread;
    expect((await ackEvent(S1, reviewed[0].id)).status).toBe(200);
    const after = await notifications(S1);
    expect(after.bell.unread).toBe(before - 1);
    expect(after.items.find(i => i.id === reviewed[0].id).unread).toBe(false);
    expect((await dashboard(S1)).strength.examPoints).toBe(80);
    // Reading the dashboard again awards nothing extra (derived, never incremented).
    expect((await dashboard(S1)).strength.examPoints).toBe(80);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8D-B inline project grading → student tracker, Strength and the ready-for-review summary", () => {
  it("score-only writes never change the ready summary; a status change does; approval moves project progress and Strength for THAT student only", async () => {
    expect((await readySummary())).toMatchObject({ ok: true, totalReadyForReview: 0 });
    const zero = await dashboard(S1);
    expect(zero.strength.projectPoints).toBe(0);

    // 1. a score alone: stored, visible to the student, no Strength (nothing approved), summary untouched
    let r = await trackerPost({ action: "progress.update", studentId: S1, stageId: "B01", score: "90" });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect((await readySummary()).totalReadyForReview).toBe(0);
    let t = await studentTracker(S1);
    const project = t.projects.find(p => p.projectCode === "899373");
    expect(project.progress.B01.score).toBe(90);
    expect(project.summary.overallProgress).toBe(0);
    expect((await dashboard(S1)).strength.projectPoints).toBe(0);

    // 2. ready_for_review: exactly one ready stage in the global summary, none for the classmate
    r = await trackerPost({ action: "progress.update", studentId: S1, stageId: "B01", status: "ready_for_review" });
    expect(r.status).toBe(200);
    expect(await readySummary()).toMatchObject({ totalReadyForReview: 1, byProject: { "899373": 1 } });
    expect((await dashboard(S1)).strength.projectPoints).toBe(0);                    // ready is not approved

    // 3. approve: the summary returns to 0; progress and Strength move, from ONE server computation
    r = await trackerPost({ action: "progress.update", studentId: S1, stageId: "B01", status: "approved" });
    expect(r.status).toBe(200);
    expect((await readySummary()).totalReadyForReview).toBe(0);
    t = await studentTracker(S1);
    const approved = t.projects.find(p => p.projectCode === "899373");
    expect(approved.progress.B01).toMatchObject({ status: "approved", score: 90 });
    expect(approved.summary.overallProgress).toBeGreaterThan(0);
    const d1 = await dashboard(S1);
    expect(d1.strength.projectPoints).toBeGreaterThan(0);
    expect(d1.strength.projects).toEqual([{ projectCode: "899373", overallProgress: approved.summary.overallProgress, strengthPoints: d1.strength.projectPoints }]);
    expect(d1.strength.rawTotalPoints).toBe(d1.strength.examPoints + d1.strength.practicePoints + d1.strength.studyPoints + d1.strength.gamePoints + d1.strength.projectPoints);
    // the classmate is untouched: no progress, no Strength, no leaked stage
    const t2 = await studentTracker(S2);
    expect(t2.projects.find(p => p.projectCode === "899373").progress).toEqual({});
    expect((await dashboard(S2)).strength.projectPoints).toBe(0);

    // 4. a later score edit on the approved stage keeps the approval and the summary
    r = await trackerPost({ action: "progress.update", studentId: S1, stageId: "B01", score: "95" });
    expect(r.status).toBe(200);
    expect((await studentTracker(S1)).projects[0].progress.B01).toMatchObject({ status: "approved", score: 95 });
    expect((await readySummary()).totalReadyForReview).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8D-C game results → Strength: an assigned Live Challenge counts, Number Conversion free play does not", () => {
  it("a finished live session records each student's own percentage into gamePoints; a perfect free-play round adds nothing", async () => {
    const created = await liveTeacher("create", { challengeId: "c2", classId: CA, studentIds: [S1, S2] });
    expect(created.status, JSON.stringify(created.jsonBody)).toBe(200);
    const code = created.jsonBody.session.joinCode;
    expect((await liveStudent(S1, "join", { joinCode: code })).status).toBe(200);
    expect((await liveStudent(S2, "join", { joinCode: code })).status).toBe(200);
    expect((await liveTeacher("start", { joinCode: code })).status).toBe(200);
    // round 1: S1 right, S2 wrong
    expect((await liveStudent(S1, "answer", { joinCode: code, roundVersion: 1, response: { kind: "choice", index: 0 } })).status).toBe(200);
    expect((await liveStudent(S2, "answer", { joinCode: code, roundVersion: 1, response: { kind: "choice", index: 1 } })).status).toBe(200);
    expect((await liveTeacher("next", { joinCode: code, roundVersion: 1 })).status).toBe(200);
    // round 2: both right (true = index 0)
    expect((await liveStudent(S1, "answer", { joinCode: code, roundVersion: 2, response: { kind: "choice", index: 0 } })).status).toBe(200);
    expect((await liveStudent(S2, "answer", { joinCode: code, roundVersion: 2, response: { kind: "choice", index: 0 } })).status).toBe(200);
    // Strength BEFORE the session is finished: nothing (an unfinished session records nothing)
    expect((await dashboard(S1)).strength.gamePoints).toBe(0);
    const fin = await liveTeacher("finish", { joinCode: code, roundVersion: 2 });
    expect(fin.status, JSON.stringify(fin.jsonBody)).toBe(200);
    expect(fin.jsonBody.session.status).toBe("finished");

    // S1: 2/2 → 100% → 20 points; S2: 1/2 → 50% → 10 points — each their OWN percentage, never the placement
    const d1 = await dashboard(S1), d2 = await dashboard(S2);
    expect(d1.strength.gamePoints).toBe(20);
    expect(d2.strength.gamePoints).toBe(10);
    expect(d1.strength.rawTotalPoints).toBe(20);
    expect((await dashboard(S1)).strength.gamePoints).toBe(20);                     // re-reading never accumulates

    // Number Conversion free play: a perfect round is a personal best, not Strength
    expect((await nc(S1, "start", { path: "mixed", level: "guided" })).status).toBe(200);
    for (let i = 0; i < 10; i++) {
      const active = ctx.getJson(gameDocName(S1)).active;
      if (!active) break;
      const task = active.tasks[active.index];
      const r = await nc(S1, "answer", { taskId: task.taskId, bits: [0, 0, 0, 0, 0, 0, 0, 0], answer: canonicalAnswerForTask(task) });
      expect(r.status).toBe(200);
    }
    expect(ctx.getJson(gameDocName(S1)).best).toMatchObject({ percentage: 100 });
    expect((await dashboard(S1)).strength.gamePoints).toBe(20);                     // unchanged by free play
    expect((await dashboard(S2)).strength.gamePoints).toBe(10);
  });
});
