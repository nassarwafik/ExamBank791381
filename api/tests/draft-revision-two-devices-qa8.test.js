import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler as submission } from "../src/functions/student-submission.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// QA-8 — the same attempt open on two devices (or two tabs).
//
// Fail-first (QA on main c244cbab; fail-first run on 46ba9297): saveDraft replaced the whole server draft with whatever snapshot
// arrived. Device A saved q1; device B, opened earlier and still holding the older (empty) copy, autosaved and erased q1 with a
// 200 — and the timed-out finalize then graded the reduced draft. The server now numbers every draft write (draftRevision, in
// the state and in the save reply); a write that asserts an older base (expectedDraftRevision) is refused with 409 DRAFT_STALE
// and writes nothing, so the client can merge and save again. Requests without the field (a bundle cached from before QA-8)
// behave exactly as before.
//
// Every test runs the REAL handler on the in-memory store, under a fake clock.

const MIN = 60_000, BASE = Date.parse("2026-10-24T08:00:00.000Z");
const SUB = "platform/submissions/asg1/stu-1.json";
let ctx;
const gradeExam = (_e, answers) => {
  const n = ["q1", "q2"].filter(k => answers && answers[k]).length;
  return { score: n * 5, totalMarks: 10, percentage: n * 50, manualReviewMarks: 0, finalized: true, questions: [], sections: [] };
};
const sdeps = () => ({ requireStudentAuth: () => ({ ok: true, user: { sub: "stu-1", sv: 1 } }), container: ctx.container, gradeExam, recordAchievementIfEligible: async () => {} });
function identity() { const a = ctx.getJson(SUB)?.activeAttempt; return a ? { expectedAttemptNumber: a.attemptNumber, expectedStartedAt: a.startedAt, ...(a.attemptEpoch ? { expectedAttemptEpoch: a.attemptEpoch } : {}) } : {}; }
const call = (action, extra = {}) => submission({ method: "POST", params: { assignmentId: "asg1" }, json: async () => ({ action, ...extra }) }, sdeps());
const get = () => submission({ method: "GET", params: { assignmentId: "asg1" } }, sdeps());
const text = value => ({ kind: "text", value });
function seed({ durationMinutes = 30, policy = "continuous", legacy = false } = {}) {
  ctx = createMemoryContainer();
  ctx.setJson("platform/users/stu-1.json", { role: "student", userId: "stu-1", active: true, classId: "c1", displayName: "أحمد", code: "123456789", authVersion: 1 });
  ctx.setJson("platform/classes/c1.json", { classId: "c1", name: "صف", active: true, status: "active" });
  const model = legacy ? {} : { schemaVersion: 2, attemptModelVersion: policy === "continuous" ? 2 : 3, attemptPolicy: policy };
  ctx.setJson("platform/assignments/asg1.json", { ...model, assignmentId: "asg1", classId: "c1", status: "published", maxAttempts: 2, durationMinutes: legacy ? 0 : durationMinutes, title: "واجب", openAt: "", dueAt: new Date(BASE + 24 * 60 * MIN).toISOString(),
    examSnapshot: { questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", marks: 5 }, { examQuestionId: "q2", presentationType: "shortAnswer", marks: 5 }] } });
}
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(BASE); });
afterEach(() => { vi.useRealTimers(); });

describe("QA-8 a device holding an older draft never silently replaces a newer one", () => {
  it("the probe: device B's stale autosave is refused (409 DRAFT_STALE), A's answer survives and is what the timeout grades", async () => {
    seed();
    expect((await call("startAttempt")).status).toBe(200);
    const id = identity();
    const base = (await get()).jsonBody.state.draftRevision;                      // both devices load the same state
    expect(base).toBe(0);
    const a = await call("saveDraft", { answers: { q1: text("A") }, expectedDraftRevision: base, ...id });   // device A
    expect(a.status).toBe(200);
    expect(a.jsonBody.draftRevision).toBe(1);
    const b = await call("saveDraft", { answers: {}, expectedDraftRevision: base, ...id });                  // device B, still on base 0
    expect(b.status).toBe(409);
    expect(b.jsonBody).toMatchObject({ ok: false, code: "DRAFT_STALE" });
    expect(ctx.getJson(SUB).draftAnswers).toEqual({ q1: text("A") });
    expect(ctx.getJson(SUB).draftRevision).toBe(1);
    vi.setSystemTime(BASE + 31 * MIN);
    const fin = await call("finalizeTimedOutAttempt");
    expect(fin.status).toBe(200);
    expect(ctx.getJson(SUB).attempts[0].answers).toEqual({ q1: text("A") });
  });

  it("after re-reading the state, device B saves its merged draft with the new base", async () => {
    seed();
    await call("startAttempt");
    const id = identity();
    await call("saveDraft", { answers: { q1: text("A") }, expectedDraftRevision: 0, ...id });
    const st = (await get()).jsonBody.state;
    expect(st.draftRevision).toBe(1);
    const merged = await call("saveDraft", { answers: { ...st.draftAnswers, q2: text("B") }, expectedDraftRevision: st.draftRevision, ...id });
    expect(merged.status).toBe(200);
    expect(ctx.getJson(SUB).draftAnswers).toEqual({ q1: text("A"), q2: text("B") });
    expect(merged.jsonBody.draftRevision).toBe(2);
  });

  it("one device saving in sequence keeps advancing its own base", async () => {
    seed();
    await call("startAttempt");
    const id = identity();
    let rev = 0;
    for (const v of ["a", "ab", "abc"]) {
      const r = await call("saveDraft", { answers: { q1: text(v) }, expectedDraftRevision: rev, ...id });
      expect(r.status).toBe(200);
      rev = r.jsonBody.draftRevision;
    }
    expect(rev).toBe(3);
  });

  it("a stale submit is refused and grades nothing; with the current base it grades the full answers", async () => {
    seed();
    await call("startAttempt");
    const id = identity();
    await call("saveDraft", { answers: { q1: text("A"), q2: text("A2") }, expectedDraftRevision: 0, ...id });
    const stale = await call("submit", { answers: { q1: text("B") }, expectedDraftRevision: 0, ...id });
    expect(stale.status).toBe(409);
    expect(stale.jsonBody.code).toBe("DRAFT_STALE");
    expect(ctx.getJson(SUB).attempts).toEqual([]);
    expect(ctx.getJson(SUB).activeAttempt).toBeTruthy();
    const ok = await call("submit", { answers: { q1: text("A"), q2: text("A2") }, expectedDraftRevision: 1, ...id });
    expect(ok.status).toBe(200);
    expect(ok.jsonBody.result.score).toBe(10);
  });

  it("pausable: a pause carrying an older device's answers is refused and the attempt keeps running", async () => {
    seed({ policy: "pausable" });
    await call("startAttempt");
    const id = identity();
    await call("saveDraft", { answers: { q1: text("A") }, expectedDraftRevision: 0, ...id });
    const p = await call("pauseAttempt", { answers: {}, expectedDraftRevision: 0, ...id });
    expect(p.status).toBe(409);
    expect(p.jsonBody.code).toBe("DRAFT_STALE");
    expect(ctx.getJson(SUB).activeAttempt.status).not.toBe("paused");
    expect(ctx.getJson(SUB).draftAnswers).toEqual({ q1: text("A") });
    const ok = await call("pauseAttempt", { answers: { q1: text("A"), q2: text("B") }, expectedDraftRevision: 1, ...identity() });
    expect(ok.status).toBe(200);
    expect(ctx.getJson(SUB).draftRevision).toBe(2);
  });

  it("a malformed base fails closed (409, nothing written)", async () => {
    seed();
    await call("startAttempt");
    const id = identity();
    for (const bad of ["0", -1, 1.5, {}]) {
      const r = await call("saveDraft", { answers: { q1: text("X") }, expectedDraftRevision: bad, ...id });
      expect(r.status, JSON.stringify(bad)).toBe(409);
    }
    expect(ctx.getJson(SUB).draftAnswers || {}).toEqual({});
  });

  it("legacy untimed (no attempt identity) is protected the same way", async () => {
    seed({ legacy: true });
    expect((await call("saveDraft", { answers: { q1: text("A") }, expectedDraftRevision: 0 })).status).toBe(200);
    const b = await call("saveDraft", { answers: {}, expectedDraftRevision: 0 });
    expect(b.status).toBe(409);
    expect(ctx.getJson(SUB).draftAnswers).toEqual({ q1: text("A") });
  });

  it("unchanged: a request without expectedDraftRevision (a bundle cached from before QA-8) still saves as before", async () => {
    seed();
    await call("startAttempt");
    const id = identity();
    expect((await call("saveDraft", { answers: { q1: text("A") }, ...id })).status).toBe(200);
    expect((await call("saveDraft", { answers: { q2: text("B") }, ...id })).status).toBe(200);
    expect(ctx.getJson(SUB).draftAnswers).toEqual({ q2: text("B") });
    expect(ctx.getJson(SUB).draftRevision).toBe(2);
  });
});
