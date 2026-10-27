import { describe, it, expect } from "vitest";
import { createRequire } from "module";

// D5 (item 10, owner decision) — the optional per-assignment late policy: after each student's effective due date the assignment
// stays open for a late window, and a late attempt loses a FIXED percentage of its score. Off by default (no field → closes at the
// due date exactly as before). The deduction lives where the score is computed (attempt creation + the canonical rebuild), so a
// teacher review never stacks it, and the teacher may waive it for one attempt. Real handlers on the in-memory container.

const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = require_("../src/functions/student-submission.js");
const review = require_("../src/functions/assignment-review.js");
const results = require_("../src/functions/assignment-results.js");
const manage = require_("../src/functions/manage-assignments.js");
const late = require_("../src/lib/late-policy.js");
const { getAssignmentAvailability, timerState } = require_("../src/lib/assignment-availability.js");
const { rebuildAttemptGrades } = require_("../src/lib/attempt-grade-rebuild.js");
const { resultsReleased, releaseInfo } = require_("../src/lib/results-release.js");

const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const H = 3600000, NOW = Date.now(), iso = ms => new Date(ms).toISOString();
const POLICY = { windowHours: 24, deductionPercent: 10 };
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const mc = (id, correct, marks) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "اختر " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: correct } });
const manualQ = (id, marks) => ({ examQuestionId: id, presentationType: "shortAnswer", text: "اشرح " + id, marks, answer: {} });
const exam = questions => ({ title: "t", metadata: {}, sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions }] });
const ALL_RIGHT = { mc1: { kind: "choice", index: 1 }, mc2: { kind: "choice", index: 0 } };

// A legacy untimed assignment (no start needed) of 8 + 2 marks, due an hour ago unless told otherwise.
function harness(over = {}, questions = [mc("mc1", 1, 4), mc("mc2", 0, 4), manualQ("sa", 2)]) {
  const a = F.assignment({ attemptModelVersion: undefined, attemptPolicy: undefined, durationMinutes: 0, maxAttempts: 2, examSnapshot: exam(questions), totalMarks: 10, dueAt: iso(NOW - H), latePolicy: POLICY, ...over });
  const ctx = F.seed({ a, doc: null });
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch(), recordAuditEvent: async () => {}, syncAssessmentMedal: async () => true };
  const stored = () => ctx.getJson("platform/submissions/" + F.AID + "/" + F.S1 + ".json");
  return {
    ctx, stored,
    submit: (answers = ALL_RIGHT) => submission.handler(F.studentRequest({ action: "submit", answers }), sDeps, quiet),
    state: () => submission.handler(F.studentRequest(null, "GET"), sDeps, quiet),
    saveReview: (overrides, attemptNumber = 1) => review.handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber, overrides, teacherFeedback: "" }), tDeps, quiet),
    waive: (waived, attemptNumber = 1) => results.handler(F.teacherRequest("/api/assignment-results", { action: "setLateWaiver", assignmentId: F.AID, studentId: F.S1, attemptNumber, waived }), tDeps, quiet),
    manage: body => manage.handler(F.teacherRequest("/api/assignments", body), tDeps, quiet)
  };
}

describe("the policy value", () => {
  it("teacher input: null / false / missing → none; window 1..336 h and deduction 0..90 % as integers, anything else refused", () => {
    expect(late.parseLatePolicyInput(undefined)).toEqual({ ok: true, value: null });
    expect(late.parseLatePolicyInput(null)).toEqual({ ok: true, value: null });
    expect(late.parseLatePolicyInput(false)).toEqual({ ok: true, value: null });
    expect(late.parseLatePolicyInput({ windowHours: 48, deductionPercent: 15 })).toEqual({ ok: true, value: { windowHours: 48, deductionPercent: 15 } });
    expect(late.parseLatePolicyInput({ windowHours: 336, deductionPercent: 0 }).ok).toBe(true);
    for (const bad of [{ windowHours: 0, deductionPercent: 10 }, { windowHours: 337, deductionPercent: 10 }, { windowHours: 1.5, deductionPercent: 10 }, { windowHours: 24, deductionPercent: 91 }, { windowHours: 24, deductionPercent: -1 }, { windowHours: 24 }, "24", [24, 10], true])
      expect(late.parseLatePolicyInput(bad).ok, JSON.stringify(bad)).toBe(false);
  });
  it("a malformed STORED value is no policy (it never opens a closed assignment)", () => {
    expect(late.latePolicyOf({ latePolicy: { windowHours: "24", deductionPercent: 10 } })).toBeNull();
    expect(late.latePolicyOf({ latePolicy: { windowHours: 24, deductionPercent: 100 } })).toBeNull();
    expect(late.lateWindowMs({ latePolicy: { windowHours: 9999, deductionPercent: 10 } })).toBe(0);
    expect(late.lateWindowMs({})).toBe(0);
  });
});

describe("availability — the late window", () => {
  const due = NOW, a = { status: "published", dueAt: iso(due), latePolicy: POLICY };
  it("no policy: closed right after the due date (unchanged)", () => {
    const st = getAssignmentAvailability({ dueAt: iso(due) }, null, due + 1);
    expect(st).toMatchObject({ availability: "closed", isClosed: true, inLateWindow: false, lateUntil: "", closeMs: due });
  });
  it("with a policy: open and inLateWindow after the due date, closed after the window; the due date itself is on time", () => {
    expect(getAssignmentAvailability(a, null, due)).toMatchObject({ availability: "open", inLateWindow: false });
    expect(getAssignmentAvailability(a, null, due + 1)).toMatchObject({ availability: "open", inLateWindow: true, lateUntil: iso(due + 24 * H) });
    expect(getAssignmentAvailability(a, null, due + 24 * H)).toMatchObject({ availability: "open", inLateWindow: true });
    expect(getAssignmentAvailability(a, null, due + 24 * H + 1)).toMatchObject({ availability: "closed", isClosed: true, inLateWindow: false });
  });
  it("a per-student extension moves the window with the student's effective due date", () => {
    const sub = { dueAtOverride: iso(due + 10 * H) };
    expect(getAssignmentAvailability(a, sub, due + 5 * H)).toMatchObject({ availability: "open", inLateWindow: false });
    expect(getAssignmentAvailability(a, sub, due + 30 * H)).toMatchObject({ availability: "open", inLateWindow: true, lateUntil: iso(due + 34 * H) });
  });
  it("a running attempt is capped at the window's end, not at the due date (and at the due date without a policy)", () => {
    const timed = { ...a, durationMinutes: 600 }, doc = { attempts: [], activeAttempt: { attemptNumber: 1, startedAt: iso(due - H), endsAt: iso(due + 9 * H), status: "draft" } };
    expect(timerState(timed, doc, due + 2 * H)).toMatchObject({ effectiveAttemptEndsAt: iso(due + 9 * H), attemptExpired: false, canWrite: true });
    const noPolicy = { status: "published", dueAt: iso(due), durationMinutes: 600 };
    expect(timerState(noPolicy, doc, due + 2 * H)).toMatchObject({ effectiveAttemptEndsAt: iso(due), attemptExpired: true, canWrite: false });
  });
});

describe("the late stamp and the deduction", () => {
  const a = { latePolicy: POLICY };
  it("late = ended strictly after the effective due date; minutes rounded up", () => {
    expect(late.lateStamp(a, NOW, NOW)).toBeNull();
    expect(late.lateStamp(a, NOW, NOW + 1)).toEqual({ minutesLate: 1, deductionPercent: 10 });
    expect(late.lateStamp(a, NOW, NOW + 61 * 60000)).toEqual({ minutesLate: 61, deductionPercent: 10 });
    expect(late.lateStamp({}, NOW, NOW + H)).toBeNull();
  });
  it("10 % of 8 → 7.2 (raw 8, 0.8 deducted); waived → the raw score; an on-time attempt is untouched", () => {
    expect(late.applyLateDeduction({ score: 8, totalMarks: 10, percentage: 80, late: { minutesLate: 5, deductionPercent: 10 } })).toMatchObject({ score: 7.2, rawScore: 8, latePenalty: 0.8, percentage: 72 });
    expect(late.applyLateDeduction({ score: 8, totalMarks: 10, percentage: 80, late: { minutesLate: 5, deductionPercent: 10, waived: true } })).toMatchObject({ score: 8, rawScore: 8, latePenalty: 0, percentage: 80 });
    const onTime = late.applyLateDeduction({ score: 8, totalMarks: 10, percentage: 80 });
    expect(onTime).toEqual({ score: 8, totalMarks: 10, percentage: 80 });
  });
  it("the canonical rebuild re-applies it once — rebuilding twice never stacks it", () => {
    const attempt = { totalMarks: 10, questionGrades: [{ questionId: "q1", score: 8, maxMarks: 10 }], manualOverrides: {}, late: { minutesLate: 5, deductionPercent: 25 } };
    rebuildAttemptGrades(attempt);
    expect(attempt).toMatchObject({ score: 6, rawScore: 8, latePenalty: 2, percentage: 60 });
    rebuildAttemptGrades(attempt);
    expect(attempt).toMatchObject({ score: 6, rawScore: 8, latePenalty: 2, percentage: 60 });
  });
});

describe("through the real student handler", () => {
  it("inside the window: the submit is accepted, stamped late and deducted; the result says so", async () => {
    const h = harness();
    const r = await h.submit();
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody.result).toMatchObject({ score: 7.2, rawScore: 8, latePenalty: 0.8, late: { deductionPercent: 10, waived: false } });
    expect(r.jsonBody.result.late.minutesLate).toBeGreaterThanOrEqual(60);
    const at = h.stored().attempts[0];
    expect(at).toMatchObject({ score: 7.2, rawScore: 8, latePenalty: 0.8, late: { deductionPercent: 10 } });
  });
  it("after the window: refused like any closed assignment, nothing written", async () => {
    const h = harness({ dueAt: iso(NOW - 25 * H) });
    const r = await h.submit();
    expect(r.status).toBe(409);
    expect(r.jsonBody.error).toBe("انتهى موعد التسليم.");
    expect(h.stored()).toBeFalsy();
  });
  it("no policy, past the due date: refused exactly as before", async () => {
    const h = harness({ latePolicy: undefined });
    const r = await h.submit();
    expect(r.status).toBe(409);
    expect(r.jsonBody.error).toBe("انتهى موعد التسليم.");
  });
  it("on time under a policy: no stamp, no deduction", async () => {
    const h = harness({ dueAt: iso(NOW + H) });
    const r = await h.submit();
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.score).toBe(8);
    expect(r.jsonBody.result).not.toHaveProperty("late");
    expect(h.stored().attempts[0]).not.toHaveProperty("late");
  });
  it("a timed attempt that ran past the due date inside the window is stamped by its AUTHORITATIVE end, not the finalization moment", async () => {
    const started = iso(NOW - 50 * 60000), ends = iso(NOW - 10 * 60000);
    const doc = { schemaVersion: 1, assignmentId: F.AID, studentId: F.S1, classId: F.CLASS_ID, draftAnswers: ALL_RIGHT, draftSavedAt: started, attempts: [], activeAttempt: { attemptNumber: 1, startedAt: started, endsAt: ends, status: "draft", attemptEpoch: 1, pauseCount: 0 } };
    const run = async over => {
      const a = F.assignment({ durationMinutes: 40, dueAt: iso(NOW - 30 * 60000), examSnapshot: exam([mc("mc1", 1, 4), mc("mc2", 0, 4), manualQ("sa", 2)]), totalMarks: 10, ...over });
      const ctx = F.seed({ a, doc: JSON.parse(JSON.stringify(doc)) });
      const r = await submission.handler(F.studentRequest({ action: "finalizeTimedOutAttempt" }), { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() }, quiet);
      return { r, at: ctx.getJson("platform/submissions/" + F.AID + "/" + F.S1 + ".json").attempts[0] };
    };
    const late1 = await run({ latePolicy: POLICY });
    expect(late1.r.status, JSON.stringify(late1.r.jsonBody)).toBe(200);
    expect(late1.at).toMatchObject({ endReason: "timedOut", endedAt: ends, late: { minutesLate: 20, deductionPercent: 10 }, rawScore: 8, score: 7.2 });
    const onTime = await run({});                                                             // no policy: the attempt ended at the due date
    expect(onTime.at).toMatchObject({ endReason: "timedOut", endedAt: iso(NOW - 30 * 60000), score: 8 });
    expect(onTime.at).not.toHaveProperty("late");
  });
  it("the state tells the student about the window: announced before the due date, active inside it", async () => {
    const before = await harness({ dueAt: iso(NOW + H) }).state();
    expect(before.jsonBody.state.lateWindow).toMatchObject({ active: false, deductionPercent: 10, until: iso(Date.parse(iso(NOW + H)) + 24 * H) });
    const inside = await harness().state();
    expect(inside.jsonBody.state).toMatchObject({ availability: "open", canWrite: true, lateWindow: { active: true, deductionPercent: 10 } });
    const none = await harness({ latePolicy: undefined }).state();
    expect(none.jsonBody.state).not.toHaveProperty("lateWindow");
  });
  it("results not released yet: the lateness is shown, the marks before / after the deduction are withheld", async () => {
    const h = harness({ resultsRelease: "manual" });
    const r = await h.submit();
    expect(r.status).toBe(200);
    expect(r.jsonBody.result.late).toMatchObject({ deductionPercent: 10 });
    for (const k of ["score", "percentage", "rawScore", "latePenalty"]) expect(r.jsonBody.result, k).not.toHaveProperty(k);
  });
});

describe("the teacher", () => {
  it("a review that awards the pending marks re-applies the deduction to the new total — never stacked", async () => {
    const h = harness();
    await h.submit({ ...ALL_RIGHT, sa: { kind: "text", text: "إجابة" } });
    const r = await h.saveReview({ sa: { score: 2, comment: "" } });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody.result).toMatchObject({ score: 9, finalized: true });
    expect(h.stored().attempts[0]).toMatchObject({ score: 9, rawScore: 10, latePenalty: 1 });
    await h.saveReview({ sa: { score: 2, comment: "حسنًا" } });
    expect(h.stored().attempts[0]).toMatchObject({ score: 9, rawScore: 10 });
  });
  it("setLateWaiver waives and restores the deduction; the same value again changes nothing; an on-time attempt is refused", async () => {
    const h = harness();
    await h.submit();
    const w = await h.waive(true);
    expect(w.status, JSON.stringify(w.jsonBody)).toBe(200);
    expect(w.jsonBody.changed).toBe(true);
    expect(w.jsonBody.latestResult).toMatchObject({ score: 8, late: { waived: true }, latePenalty: 0 });
    expect(h.stored().attempts[0]).toMatchObject({ score: 8, late: { waived: true, deductionPercent: 10 } });
    expect((await h.waive(true)).jsonBody.changed).toBe(false);
    const back = await h.waive(false);
    expect(back.jsonBody.latestResult).toMatchObject({ score: 7.2, latePenalty: 0.8, late: { waived: false } });
    const onTime = harness({ dueAt: iso(NOW + H) });
    await onTime.submit();
    expect((await onTime.waive(true)).status).toBe(409);
    expect((await h.waive("yes")).status).toBe(400);
    expect((await h.waive(true, 7)).status).toBe(404);
  });
  it("the gradebook row shows the stamp and both marks", async () => {
    const h = harness();
    await h.submit();
    const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => h.ctx.container };
    const g = await results.handler({ method: "GET", url: "https://app.example.test/api/assignment-results?assignmentId=" + F.AID, headers: new Headers(), query: new URLSearchParams({ assignmentId: F.AID }) }, tDeps, quiet);
    expect(g.status, JSON.stringify(g.jsonBody)).toBe(200);
    expect(g.jsonBody.assignment.latePolicy).toEqual(POLICY);
    const row = g.jsonBody.students.find(s => s.studentId === F.S1);
    expect(row.latestResult).toMatchObject({ score: 7.2, rawScore: 8, latePenalty: 0.8, late: { deductionPercent: 10 } });
    expect(row.attempts[0]).toMatchObject({ late: { deductionPercent: 10 }, latePenalty: 0.8 });
  });
  it("setlatepolicy enables, changes and removes the policy; a malformed value or a missing due date is refused", async () => {
    const h = harness({ latePolicy: undefined, dueAt: iso(NOW + H) });
    const on = await h.manage({ action: "setlatepolicy", assignmentId: F.AID, latePolicy: { windowHours: 48, deductionPercent: 20 } });
    expect(on.status, JSON.stringify(on.jsonBody)).toBe(200);
    expect(on.jsonBody.assignment.latePolicy).toEqual({ windowHours: 48, deductionPercent: 20 });
    expect((await h.manage({ action: "setlatepolicy", assignmentId: F.AID, latePolicy: { windowHours: 48, deductionPercent: 95 } })).status).toBe(400);
    expect((await h.manage({ action: "setlatepolicy", assignmentId: F.AID })).status).toBe(400);
    const off = await h.manage({ action: "setlatepolicy", assignmentId: F.AID, latePolicy: null });
    expect(off.jsonBody.assignment.latePolicy).toBeNull();
    expect(h.ctx.getJson("platform/assignments/" + F.AID + ".json")).not.toHaveProperty("latePolicy");
    const noDue = harness({ latePolicy: undefined, dueAt: "" });
    expect((await noDue.manage({ action: "setlatepolicy", assignmentId: F.AID, latePolicy: POLICY })).status).toBe(409);
  });
  it("create persists a valid policy and lists it; a malformed one or one without a due date is refused; none by default", async () => {
    const h = harness({ latePolicy: undefined, dueAt: iso(NOW + H) });
    const body = over => ({ action: "create", classId: F.CLASS_ID, title: "واجب متأخر", examSnapshot: exam([mc("m", 0, 2)]), dueAt: iso(NOW + 48 * H), ...over });
    const ok = await h.manage(body({ latePolicy: { windowHours: 72, deductionPercent: 20 } }));
    expect(ok.status, JSON.stringify(ok.jsonBody)).toBe(200);
    expect(ok.jsonBody.assignment.latePolicy).toEqual({ windowHours: 72, deductionPercent: 20 });
    expect(h.ctx.getJson("platform/assignments/" + ok.jsonBody.assignment.assignmentId + ".json").latePolicy).toEqual({ windowHours: 72, deductionPercent: 20 });
    const none = await h.manage(body({}));
    expect(none.jsonBody.assignment.latePolicy).toBeNull();
    expect(h.ctx.getJson("platform/assignments/" + none.jsonBody.assignment.assignmentId + ".json")).not.toHaveProperty("latePolicy");
    expect((await h.manage(body({ latePolicy: { windowHours: 72, deductionPercent: 100 } }))).status).toBe(400);
    expect((await h.manage(body({ latePolicy: POLICY, dueAt: "" }))).status).toBe(400);
  });
  it("a policy change never rewrites a result that already exists (the stamp keeps its own percentage)", async () => {
    const h = harness();
    await h.submit();
    await h.manage({ action: "setlatepolicy", assignmentId: F.AID, latePolicy: { windowHours: 24, deductionPercent: 50 } });
    await h.saveReview({ sa: { score: 0, comment: "" } });
    expect(h.stored().attempts[0]).toMatchObject({ score: 7.2, late: { deductionPercent: 10 } });
  });
});

describe("results released \"after the due date\" wait for the late window", () => {
  it("not visible inside the window, visible once it ends; without a policy exactly the due date", () => {
    const a = { resultsRelease: "afterDue", dueAt: iso(NOW), latePolicy: POLICY };
    expect(resultsReleased(a, NOW + H)).toBe(false);
    expect(releaseInfo(a, NOW + H)).toEqual({ resultsVisible: false, resultsVisibility: "afterDue", resultsVisibleAt: iso(NOW + 24 * H) });
    expect(resultsReleased(a, NOW + 24 * H)).toBe(true);
    expect(resultsReleased({ resultsRelease: "afterDue", dueAt: iso(NOW) }, NOW)).toBe(true);
  });
});
