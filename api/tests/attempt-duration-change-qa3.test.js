import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler as submission } from "../src/functions/student-submission.js";
import { handler as assignments } from "../src/functions/manage-assignments.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// QA-3 — a teacher's duration change applies to NEW attempts only, as the timing dialog promises («تغيير مدة المحاولة يسري على
// المحاولات الجديدة فقط، ولا يعيد ضبط محاولة مؤقتة بدأت بالفعل»).
//
// Found by QA on main c244cbab; fail-first run on 5a65444a: timerState read the assignment's CURRENT duration for the running attempt.
// 0 → 30 minutes made a student who had worked 90 minutes on an untimed attempt «انتهى وقت المحاولة» (saveDraft 409) and let
// finalizeTimedOutAttempt close it as timedOut — answers since the last autosave lost. 60 → 0 removed the deadline of a running timed
// attempt (saveDraft 200 five hours later). The attempt's own timing now decides: its durationMinutes stamp (0 = untimed), else its
// server endsAt, else the assignment's duration (attemptDurationMinutes).
//
// Every test runs the REAL handlers on the in-memory store, under a fake clock.

const MIN = 60_000, BASE = Date.parse("2026-10-24T08:00:00.000Z");
const SUB = "platform/submissions/asg1/stu-1.json";
let ctx;
const gradeExam = (_e, answers) => ({ score: answers && answers.q1 ? 10 : 0, totalMarks: 10, percentage: answers && answers.q1 ? 100 : 0, manualReviewMarks: 0, finalized: true, questions: [], sections: [] });
const sdeps = () => ({ requireStudentAuth: () => ({ ok: true, user: { sub: "stu-1", sv: 1 } }), container: ctx.container, gradeExam, recordAchievementIfEligible: async () => {} });
const tdeps = () => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, recordAuditEvent: async () => {} });
const identity = () => { const a = ctx.getJson(SUB)?.activeAttempt; return a ? { expectedAttemptNumber: a.attemptNumber, expectedStartedAt: a.startedAt, ...(a.attemptEpoch ? { expectedAttemptEpoch: a.attemptEpoch } : {}) } : {}; };
const call = (action, extra = {}) => submission({ method: "POST", params: { assignmentId: "asg1" }, json: async () => ({ action, ...extra }) }, sdeps());
const save = value => call("saveDraft", { answers: { q1: { kind: "text", value } }, ...identity() });
const setDuration = durationMinutes => assignments({ method: "POST", url: "https://x/api/assignments", json: async () => ({ action: "updateTiming", assignmentId: "asg1", dueAt: new Date(BASE + 48 * 60 * MIN).toISOString(), durationMinutes }) }, tdeps());
function seed({ durationMinutes = 0, policy = "continuous" } = {}) {
  ctx = createMemoryContainer();
  ctx.setJson("platform/users/stu-1.json", { role: "student", userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "123456789", authVersion: 1 });
  ctx.setJson("platform/classes/c1.json", { classId: "c1", name: "صف", active: true, status: "active" });
  ctx.setJson("platform/assignments/asg1.json", { schemaVersion: 2, attemptModelVersion: policy === "continuous" ? 2 : 3, attemptPolicy: policy, assignmentId: "asg1", classId: "c1", status: "published", maxAttempts: 2, durationMinutes, title: "واجب", openAt: "", dueAt: new Date(BASE + 24 * 60 * MIN).toISOString(), examSnapshot: { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 10 }] } });
}
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(BASE); });
afterEach(() => { vi.useRealTimers(); });

describe("QA-3 a duration change never retimes a running attempt", () => {
  it("0 → 30 min: an untimed attempt 90 minutes in keeps saving and is not closed as timed out", async () => {
    seed({ durationMinutes: 0 });
    expect((await call("startAttempt")).status).toBe(200);
    vi.setSystemTime(BASE + 90 * MIN);
    expect((await save("A")).status).toBe(200);
    expect((await setDuration(30)).status).toBe(200);
    const s = await save("B");
    expect(s.status).toBe(200);
    expect(s.jsonBody.effectiveAttemptEndsAt).toBe("");                     // still untimed: no deadline shown or enforced
    expect((await call("finalizeTimedOutAttempt")).status).toBe(409);
    expect(ctx.getJson(SUB).activeAttempt).toBeTruthy();
    expect(ctx.getJson(SUB).draftAnswers.q1).toMatchObject({ value: "B" });
  });

  it("60 → 0 min: a timed attempt keeps its 60-minute deadline (no save 5 hours later)", async () => {
    seed({ durationMinutes: 60 });
    expect((await call("startAttempt")).status).toBe(200);
    expect((await setDuration(0)).status).toBe(200);
    vi.setSystemTime(BASE + 59 * MIN);
    expect((await save("in time")).status).toBe(200);
    vi.setSystemTime(BASE + 5 * 60 * MIN);
    expect((await save("late")).status).toBe(409);
    const fin = await call("finalizeTimedOutAttempt");
    expect(fin.status).toBe(200);
    expect(ctx.getJson(SUB).attempts[0]).toMatchObject({ endReason: "timedOut" });
  });

  it("an attempt started before QA-3 (no stamp) but timed keeps its deadline through its own server endsAt", async () => {
    seed({ durationMinutes: 60 });
    await call("startAttempt");
    const doc = ctx.getJson(SUB); delete doc.activeAttempt.durationMinutes; ctx.setJson(SUB, doc);
    expect((await setDuration(0)).status).toBe(200);
    vi.setSystemTime(BASE + 5 * 60 * MIN);
    expect((await save("late")).status).toBe(409);
  });

  it("new attempts carry their stamp: durationMinutes 0 (untimed) / 60 (timed)", async () => {
    seed({ durationMinutes: 0 });
    await call("startAttempt");
    expect(ctx.getJson(SUB).activeAttempt.durationMinutes).toBe(0);
    seed({ durationMinutes: 60 });
    await call("startAttempt");
    expect(ctx.getJson(SUB).activeAttempt.durationMinutes).toBe(60);
  });

  it("60 → 30 min: a timed attempt keeps its original 60-minute deadline (never shortened)", async () => {
    seed({ durationMinutes: 60 });
    await call("startAttempt");
    expect((await setDuration(30)).status).toBe(200);
    vi.setSystemTime(BASE + 45 * MIN);
    expect((await save("still in time")).status).toBe(200);
  });

  it("the NEXT attempt uses the new duration", async () => {
    seed({ durationMinutes: 0 });
    await call("startAttempt");
    await call("submit", { answers: { q1: { kind: "text", value: "A" } }, ...identity() });
    await setDuration(30);
    const st = await call("startAttempt");
    expect(st.status).toBe(200);
    const a = ctx.getJson(SUB).activeAttempt;
    expect(Date.parse(a.endsAt) - Date.parse(a.startedAt)).toBe(30 * MIN);
    vi.setSystemTime(BASE + 31 * MIN);
    expect((await save("late")).status).toBe(409);
  });

  it("pausable (model 3): a paused untimed attempt resumed after 0 → 30 stays untimed", async () => {
    seed({ durationMinutes: 0, policy: "pausable" });
    await call("startAttempt");
    expect((await call("pauseAttempt", identity())).status).toBe(200);
    await setDuration(30);
    vi.setSystemTime(BASE + 120 * MIN);
    const r = await call("resumeAttempt", identity());
    expect(r.status).toBe(200);
    expect(ctx.getJson(SUB).activeAttempt.runEndsAt).toBeUndefined();   // no running deadline stamped on an untimed attempt
    vi.setSystemTime(BASE + 125 * MIN);
    expect((await save("after resume")).status).toBe(200);
  });

  it("unchanged (B2A fail-closed): a timed attempt whose endsAt was lost derives its deadline from startedAt + the duration", async () => {
    seed({ durationMinutes: 30 });
    await call("startAttempt");
    const doc = ctx.getJson(SUB); delete doc.activeAttempt.endsAt; ctx.setJson(SUB, doc);
    vi.setSystemTime(BASE + 31 * MIN);
    expect((await save("late")).status).toBe(409);
  });
});
