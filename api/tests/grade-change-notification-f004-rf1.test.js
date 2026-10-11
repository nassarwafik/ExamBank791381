import { describe, it, expect, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { handler as manageHandler } from "../src/functions/manage-assignments.js";
import { handler as reviewHandler } from "../src/functions/assignment-review.js";
import { handler as submissionHandler } from "../src/functions/student-submission.js";
import { handler as notificationsHandler } from "../src/functions/student-notifications.js";
import { callbackHandler } from "../src/functions/coding-grading.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { eventFields } from "../src/lib/notification-events.js";

// FEATURE-004 — Review Fix 1 (independent review of 7467afe). Two risks, certified through the REAL handlers on ONE in-memory store:
//   1. DEDUPLICATION — the review notification's dedupe key was the save's millisecond timestamp alone, so two DISTINCT committed grade
//      changes inside one millisecond shared a key and the second notification was silently dropped. The clock is FROZEN here (fake Date
//      only, no sleeps): every save of a test commits in the same millisecond, so the collision is forced deterministically.
//   2. GRADE VISIBILITY — the product's release state for a student's mark: a pending MANUAL review shows the provisional mark («علامة
//      مؤقتة»), but while official coding grading is still OPEN, or a compile error awaits the teacher («reviewRequired»), the student's
//      results page WITHHOLDS the headline mark (legacy `autoGradingPending` / `autoGradingStatus`). A notification must never carry a
//      mark the results page withholds; once the hold lifts, the mark rides the event as usual. Isolation and re-validation are pinned.

const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const HOUR = 3600e3;
const iso = ms => new Date(ms).toISOString();
const H = { get: () => null };
const quiet = { logWarn() {}, logInfo() {}, logError() {} };
const user = (userId, name, classId) => ({ schemaVersion: 3, role: "student", userId, displayName: name, code: userId.slice(0, 2), classId, active: true, archived: false, authVersion: 1 });
const EXAM = { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "اشرح", marks: 10 }] };

afterEach(() => { vi.useRealTimers(); });

// ── Plain (non-coding) world: the FEATURE-004 fixture ───────────────────────────────────────────────────────────────────────────
function plainWorld() {
  const ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: user(S1, "أحمد", CA),
    ["platform/users/" + S2 + ".json"]: user(S2, "سارة", CA),
    ["platform/classes/" + CA + ".json"]: { classId: CA, name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [S1, S2], programCodes: ["899373"] }
  });
  const T = (over = {}) => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, container: ctx.container, recordAuditEvent: async () => {}, recordAchievementIfEligible: async () => {}, ...over });
  const ST = sub => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1, role: "student", classId: CA } }), recordAchievementIfEligible: async () => {} });
  const w = {
    ctx,
    manage: body => manageHandler({ method: "POST", url: "https://x/api/assignments", json: async () => body }, T(), quiet),
    review: body => reviewHandler({ method: "POST", url: "https://x/api/assignment-review", json: async () => ({ action: "saveReview", ...body }) }, T(), quiet),
    submit: (aid, sid, body) => submissionHandler({ method: "POST", params: { assignmentId: aid }, headers: H, json: async () => body }, ST(sid)),
    studentState: async (aid, sid) => (await submissionHandler({ method: "GET", params: { assignmentId: aid }, headers: H }, ST(sid))).jsonBody.state,
    reviewed: async sid => (await notificationsHandler({ method: "GET", url: "https://x/api/student-notifications", headers: H }, ST(sid))).jsonBody.items.filter(i => i.type === "assignment_reviewed"),
    async createAssignment(extra = {}) {
      const r = await w.manage({ action: "create", classId: CA, title: "امتحان الشبكات", examSnapshot: EXAM, publish: true, maxAttempts: 1, openAt: iso(Date.now() - HOUR), dueAt: iso(Date.now() + 24 * HOUR), ...extra });
      expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
      return r.jsonBody.assignment.assignmentId;
    },
    async startAndSubmit(aid, sid, answers) {
      const st = (await w.submit(aid, sid, { action: "startAttempt" })).jsonBody.state;
      const r = await w.submit(aid, sid, { action: "submit", answers, expectedAttemptNumber: st.activeAttempt.attemptNumber, expectedStartedAt: st.activeAttempt.startedAt });
      expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    }
  };
  return w;
}
const ANSWERS = { q1: { kind: "text", value: "إجابة الطالب" } };
const save = (w, aid, score, teacherFeedback = "") => w.review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score, comment: "" } }, teacherFeedback });

describe("RF1-1 deduplication — distinct committed grade changes in the SAME millisecond each notify; identical retries never duplicate", () => {
  it("frozen clock: three different marks saved in one millisecond → three notifications (7, 9, 4); an identical re-save and a retried POST in that millisecond add nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T09:00:00.000Z"));
    const w = plainWorld();
    const aid = await w.createAssignment();
    await w.startAndSubmit(aid, S1, ANSWERS);
    expect((await save(w, aid, 7)).status).toBe(200);
    expect((await save(w, aid, 7)).status).toBe(200);                       // identical re-save, same millisecond → nothing new
    expect((await save(w, aid, 9)).status).toBe(200);                       // a REAL change, same millisecond
    expect((await save(w, aid, 9)).status).toBe(200);                       // client retry of the same request
    expect((await save(w, aid, 4)).status).toBe(200);                       // another real change, same millisecond
    expect(new Date().toISOString()).toBe("2026-10-11T09:00:00.000Z");       // the clock really did not move
    const ev = await w.reviewed(S1);
    expect(ev.map(e => e.score)).toEqual(expect.arrayContaining([7, 9, 4]));
    expect(ev).toHaveLength(3);
    expect(ev.filter(e => e.becameFinal)).toHaveLength(1);                   // only the first save made the attempt final
    expect((await w.studentState(aid, S1)).latestResult).toMatchObject({ score: 4, finalized: true });   // the last notified mark is the stored one
    expect(await w.reviewed(S2)).toHaveLength(0);
  });

  it("frozen clock: a mark that flips A → B → A in one millisecond notifies three times (each commit is its own transition)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T09:00:00.000Z"));
    const w = plainWorld();
    const aid = await w.createAssignment();
    await w.startAndSubmit(aid, S1, ANSWERS);
    for (const s of [7, 9, 7]) expect((await save(w, aid, s)).status).toBe(200);
    expect((await w.reviewed(S1)).map(e => e.score).sort()).toEqual([7, 7, 9]);
  });

  it("frozen clock: a score change and a feedback-only change in one millisecond are two notifications; the feedback-only one claims no mark", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T09:00:00.000Z"));
    const w = plainWorld();
    const aid = await w.createAssignment();
    await w.startAndSubmit(aid, S1, ANSWERS);
    expect((await save(w, aid, 6)).status).toBe(200);
    expect((await save(w, aid, 6, "راجع الطبقة الثالثة")).status).toBe(200);
    expect((await save(w, aid, 6, "راجع الطبقة الثالثة")).status).toBe(200);   // identical again → nothing
    const ev = await w.reviewed(S1);
    expect(ev).toHaveLength(2);
    expect(ev.find(e => e.feedbackChanged && !e.scoreChanged)).toMatchObject({ score: null, totalMarks: 10 });
    expect(ev.find(e => e.scoreChanged)).toMatchObject({ score: 6, totalMarks: 10, finalized: true });
  });
});

// ── Coding world: the 17C fixture (hidden-test question `auto1` + short answer `sa1`) ────────────────────────────────────────────
function codingWorld(a = F.assignment()) {
  const ctx = F.seed({ a });
  const fetch = F.runnerFetch();
  const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student", classId: F.CLASS_ID } });
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch };
  const tDeps = { requireBuilderAuth: () => ({ ok: true, user: { sub: F.CANARY.teacherId } }), getContainer: () => ctx.container, env: F.ENV, fetch };
  return {
    ctx,
    submit: answers => submissionHandler(F.studentRequest(F.submitBody(answers)), sDeps, quiet),
    student: async () => (await submissionHandler(F.studentRequest(null, "GET"), sDeps, quiet)).jsonBody.state.latestResult,
    saveReview: (overrides, teacherFeedback = "") => reviewHandler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides, teacherFeedback }), tDeps, quiet),
    callback: body => callbackHandler(F.callbackRequest(body), { getContainer: () => ctx.container, env: F.ENV }, quiet),
    reviewed: async () => (await notificationsHandler({ method: "GET", url: "https://x/api/student-notifications", headers: H }, { container: ctx.container, requireStudentAuth: studentAuth })).jsonBody.items.filter(i => i.type === "assignment_reviewed"),
    jobs: () => fetch.jobs()
  };
}
const PY = "a,b=map(int,input().split());print('SUM='+str(a+b))\n";
const JAVA_BROKEN = "public class Main {\n    public static void main(String[] args) {\n        int x = 5\n    }\n}\n";
const manualReviewQ = () => F.autoQ({ questionTypeVersion: 2, answer: { gradingMode: "hiddenTests", comparator: "trimTrailingWhitespace", hiddenTests: JSON.parse(JSON.stringify(F.HIDDEN)), referenceSolutions: { python: F.CANARY.reference }, compileErrorPolicy: "manualReview" } });

describe("RF1-2 grade visibility — a notification never carries a mark the student's results page withholds", () => {
  it("event sanitiser: an absent mark stays null — never «0» (Number(null) is 0); numbers are rounded, junk is dropped", () => {
    const f = o => eventFields("assignment_reviewed", { assignmentId: "a", assignmentTitle: "t", scoreChanged: true, ...o });
    expect(f({ score: null, totalMarks: null })).toMatchObject({ score: null, totalMarks: null });
    expect(f({ score: undefined })).toMatchObject({ score: null });
    expect(f({ score: "", totalMarks: "" })).toMatchObject({ score: null, totalMarks: null });
    expect(f({ score: 0, totalMarks: 12 })).toMatchObject({ score: 0, totalMarks: 12 });                  // a real zero is a zero
    expect(f({ score: 7.456, totalMarks: "10" })).toMatchObject({ score: 7.46, totalMarks: 10 });
    expect(f({ score: -1, totalMarks: "abc" })).toMatchObject({ score: null, totalMarks: null });
    expect(f({ score: 5, scoreChanged: false, becameFinal: false })).toMatchObject({ score: null });      // feedback-only → no claim
  });
  it("official coding grading still OPEN: the teacher marks the short answer → the student is told of the review, but without a mark (the results page withholds it); once the automatic grading completes, the final notification carries the mark", async () => {
    const w = codingWorld();
    expect((await w.submit({ auto1: F.code(PY), sa1: { kind: "text", value: "x" } })).status).toBe(200);
    const [job] = w.jobs();
    expect(await w.student()).toMatchObject({ autoGradingPending: true, autoGradingStatus: expect.stringMatching(/^(queued|processing)$/), finalized: false });   // the release state: mark WITHHELD
    expect(await w.reviewed()).toHaveLength(0);
    const r = await w.saveReview({ sa1: { score: 1, comment: "" } }, "أحسنت في السؤال القصير");   // the short answer auto-marked 2/2; the teacher lowers it
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(await w.student()).toMatchObject({ autoGradingPending: true, score: 1, finalized: false });                      // still withheld on the results page
    let ev = await w.reviewed();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ scoreChanged: true, feedbackChanged: true, finalized: false, score: null, percentage: null });   // ← no mark disclosed
    expect(ev[0].totalMarks === null || ev[0].totalMarks === 12).toBe(true);
    // the Runner reports; the API grades; the automatic final notification now carries the mark the student can read
    expect((await w.callback(F.callbackBody(job, F.CANARY.expected))).status).toBe(200);
    const after = await w.student();
    expect(after).toMatchObject({ finalized: true, score: 11, autoGradingStatus: "complete" });
    expect(after.autoGradingPending).toBeUndefined();
    ev = await w.reviewed();
    const final = ev.find(e => e.automatic === true);
    expect(final).toMatchObject({ becameFinal: true, finalized: true, score: 11, totalMarks: 12 });
  });

  it("compile error awaiting the teacher (reviewRequired): a short-answer mark notifies WITHOUT a mark; the teacher's mark on the coding question lifts the hold and notifies the final mark", async () => {
    const w = codingWorld(F.assignment({}, { auto: manualReviewQ() }));
    expect((await w.submit({ auto1: F.code(JAVA_BROKEN, "java"), sa1: { kind: "text", value: "x" } })).status).toBe(200);
    const [job] = w.jobs();
    expect((await w.callback({ jobId: job.jobId, outcome: "completed", compile: { status: "compile-error", stderr: "Main.java:3: error: ';' expected\n" }, cases: [] })).status).toBe(200);
    expect(await w.student()).toMatchObject({ autoGradingPending: true, autoGradingStatus: "reviewRequired", finalized: false });
    expect(await w.reviewed()).toHaveLength(0);                                                                                  // PED20: no automatic final event
    expect((await w.saveReview({ sa1: { score: 1, comment: "" } })).status).toBe(200);
    let ev = await w.reviewed();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ scoreChanged: true, finalized: false, score: null, percentage: null });                       // ← withheld mark never disclosed
    expect((await w.saveReview({ sa1: { score: 1, comment: "" }, auto1: { score: 4, comment: "خطأ تركيبي بسيط" } })).status).toBe(200);
    const st = await w.student();
    expect(st).toMatchObject({ finalized: true, score: 5, totalMarks: 12 });
    expect(st.autoGradingPending).toBeUndefined();                                                                              // the hold is lifted
    ev = await w.reviewed();
    expect(ev).toHaveLength(2);
    expect(ev.find(e => e.becameFinal)).toMatchObject({ finalized: true, score: 5, totalMarks: 12, percentage: expect.any(Number) });
  });

  it("pending MANUAL review (no coding): the notified provisional mark is exactly the one the results page shows, flagged not final; completing the review notifies the final mark", async () => {
    const w = plainWorld();
    const aid = await w.createAssignment({ examSnapshot: { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "اشرح", marks: 10 }, { examQuestionId: "q2", presentationType: "shortAnswer", text: "عرّف", marks: 10 }] } });
    await w.startAndSubmit(aid, S1, { q1: { kind: "text", value: "أ" }, q2: { kind: "text", value: "ب" } });
    expect((await w.review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 10, comment: "" } }, teacherFeedback: "" })).status).toBe(200);
    const st = await w.studentState(aid, S1);
    expect(st.latestResult).toMatchObject({ score: 10, totalMarks: 20, finalized: false, gradingStatus: "pendingReview", manualReviewMarks: 10 });
    expect(st.latestResult.autoGradingPending).toBeUndefined();                                                                 // the provisional mark IS released on the results page
    const [ev] = await w.reviewed(S1);
    expect(ev).toMatchObject({ finalized: false, score: 10, totalMarks: 20, percentage: null });                               // so the notification may state it, as provisional
    expect((await w.review({ assignmentId: aid, studentId: S1, attemptNumber: 1, overrides: { q1: { score: 10, comment: "" }, q2: { score: 5, comment: "" } }, teacherFeedback: "" })).status).toBe(200);
    expect((await w.reviewed(S1)).find(e => e.becameFinal)).toMatchObject({ finalized: true, score: 15, totalMarks: 20, percentage: 75 });
  });

  it("isolation and re-validation: a classmate sees nothing; archiving the assignment hides the notification from the student", async () => {
    const w = plainWorld();
    const aid = await w.createAssignment();
    await w.startAndSubmit(aid, S1, ANSWERS);
    expect((await save(w, aid, 8)).status).toBe(200);
    expect(await w.reviewed(S1)).toHaveLength(1);
    expect(await w.reviewed(S2)).toHaveLength(0);
    expect((await w.manage({ action: "archive", assignmentId: aid })).status).toBe(200);
    expect(await w.reviewed(S1)).toHaveLength(0);                                                                               // not published → not shown (notification-center re-validation)
  });
});
