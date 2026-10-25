import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Owner decision (QA round 2, after phase 4b) — the assessment medal follows the current final mark. Before, the class-feed medal post was
// create-only: a forced regrade or a teacher review that LOWERED a final mark (gold 100% → 16.7%) left the old medal on the feed, while
// the dashboard and the profile (which count medals from the latest final result) already showed the lower mark.
// Now the post's tier is the tier of the latest attempt's final percentage: lower → downgraded, under bronze → withdrawn, higher → raised.
//
// Real handlers on the in-memory container (coding regrade + callback, teacher review) and the sync itself for its rules.

const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = require_("../src/functions/student-submission.js");
const review = require_("../src/functions/assignment-review.js");
const grading = require_("../src/functions/coding-grading.js");
const { feedBlobName, syncAssessmentMedal } = require_("../src/lib/achievement-feed.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");

const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const exam = questions => ({ title: "t", metadata: {}, sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const POST = feedBlobName(F.CLASS_ID, F.AID + "_" + F.S1);

function harness() {
  const ctx = F.seed({ a: F.assignment({ examSnapshot: exam([F.autoQ()]), totalMarks: 10 }) }), fetch = F.runnerFetch();
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch };
  return {
    ctx, fetch,
    submit: () => submission.handler(F.studentRequest(F.submitBody({ auto1: F.code("print(1)\n") })), sDeps, quiet),
    callback: body => grading.callbackHandler(F.callbackRequest(body), { getContainer: () => ctx.container, env: F.ENV }, quiet),
    regrade: () => grading.regradeHandler(F.teacherRequest("/api/coding/regrade", { action: "force", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" }), tDeps, quiet),
    saveReview: overrides => review.handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides, teacherFeedback: "" }), tDeps, quiet),
    medal: () => { const p = ctx.getJson(POST); return p ? p.medal.tier : null; },
    post: () => ctx.getJson(POST)
  };
}
async function goldFinal(h) {
  await h.submit();
  await h.callback(F.callbackBody(h.fetch.jobs()[0], F.CANARY.expected));
  expect(h.medal()).toBe("gold");
}

describe("a forced regrade moves the medal with the final mark", () => {
  it("gold 100% → regrade 16.7%: the medal is withdrawn; a regrade back to 100% restores gold", async () => {
    const h = harness();
    await goldFinal(h);
    await h.regrade();
    await h.callback(F.callbackBody(h.fetch.jobs().at(-1), [F.CANARY.expected[0], "W\n", "W\n"]));
    expect(h.ctx.getJson(F.SUB).attempts[0]).toMatchObject({ finalized: true, percentage: 16.7 });
    expect(h.post()).toBeNull();
    await h.regrade();
    await h.callback(F.callbackBody(h.fetch.jobs().at(-1), F.CANARY.expected));
    expect(h.medal()).toBe("gold");
  });
});

describe("a teacher review moves the medal with the final mark", () => {
  it("gold → a review mark of 8/10 lowers it to silver (the post, its date and reactions are kept); 5/10 withdraws it", async () => {
    const h = harness();
    await goldFinal(h);
    const before = h.post();
    h.ctx.setJson(POST, { ...before, reactions: { "teacher-1": "clap" } });
    expect((await h.saveReview({ auto1: { score: 8, comment: "" } })).status).toBe(200);
    expect(h.post()).toMatchObject({ tier: "silver", medal: { tier: "silver" }, createdAt: before.createdAt, reactions: { "teacher-1": "clap" } });
    expect((await h.saveReview({ auto1: { score: 5, comment: "" } })).status).toBe(200);
    expect(h.post()).toBeNull();
  });
  it("unchanged: a review that keeps the tier writes nothing to the post", async () => {
    const h = harness();
    await goldFinal(h);
    const before = JSON.stringify(h.post());
    await h.saveReview({ auto1: { score: 9.5, comment: "" } });
    expect(JSON.stringify(h.post())).toBe(before);
  });
});

describe("a new attempt moves the medal (the latest final result decides, as on the dashboard)", () => {
  it("attempt 1 = 100% (gold), attempt 2 = 0% (both final): the medal is withdrawn", async () => {
    const a = F.assignment({ attemptModelVersion: undefined, attemptPolicy: undefined, durationMinutes: 0, maxAttempts: 2, examSnapshot: exam([{ examQuestionId: "mc1", presentationType: "multipleChoice", text: "اختر", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 } }]), totalMarks: 2 });
    const ctx = F.seed({ a, doc: null });
    const deps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() };
    const submit = async value => { const r = await submission.handler(F.studentRequest({ action: "submit", answers: { mc1: { kind: "choice", index: value } } }), deps, quiet); expect(r.status, JSON.stringify(r.jsonBody)).toBe(200); };
    await submit(1);
    expect(ctx.getJson(POST).medal.tier).toBe("gold");
    await submit(0);
    expect(ctx.getJson(F.SUB).attempts.map(t => [t.percentage, t.finalized])).toEqual([[100, true], [0, true]]);
    expect(ctx.getJson(POST)).toBeNull();
  });
});

describe("the sync's rules", () => {
  const args = { classId: "c1", studentId: "s1", studentDisplayName: "سارة", assignmentId: "a1", assignmentTitle: "واجب", shareAchievements: true };
  const name = feedBlobName("c1", "a1_s1");
  const post = (tier, extra = {}) => ({ schemaVersion: 2, eventType: "medal", postId: "a1_s1", classId: "c1", studentId: "s1", studentDisplayName: "سارة", createdAt: "2026-10-01T00:00:00.000Z", shareWithClass: true, reactions: {}, assignmentId: "a1", assignmentTitle: "واجب", tier, medal: { tier, assignmentId: "a1", assignmentTitle: "واجب" }, ...extra });
  const seed = (attempts, existing) => createMemoryContainer({ "platform/submissions/a1/s1.json": { attempts }, ...(existing ? { [name]: existing } : {}) });
  const final = percentage => ({ finalized: true, manualReviewMarks: 0, percentage });

  it("the LATEST attempt decides: a later final 60% withdraws attempt 1's gold (as the dashboard already counts it)", async () => {
    const ctx = seed([final(95), final(60)], post("gold"));
    expect(await syncAssessmentMedal(ctx.container, args)).toBe(true);
    expect(ctx.getJson(name)).toBeNull();
  });
  it("a latest attempt still awaiting the teacher changes nothing", async () => {
    const ctx = seed([final(95), { finalized: false, manualReviewMarks: 5, percentage: 20 }], post("gold"));
    expect(await syncAssessmentMedal(ctx.container, args)).toBe(false);
    expect(ctx.getJson(name).medal.tier).toBe("gold");
  });
  it("a higher final mark raises the tier; a first final ≥ 70% creates the post as before; under 70% creates nothing", async () => {
    const up = seed([final(92)], post("bronze"));
    await syncAssessmentMedal(up.container, args);
    expect(up.getJson(name)).toMatchObject({ tier: "gold", medal: { tier: "gold" } });
    const fresh = seed([final(81)]);
    await syncAssessmentMedal(fresh.container, args);
    expect(fresh.getJson(name)).toMatchObject({ eventType: "medal", tier: "silver" });
    const none = seed([final(40)]);
    expect(await syncAssessmentMedal(none.container, args)).toBe(false);
    expect(none.getJson(name)).toBeNull();
  });
  it("a game medal or another event at that name is never touched", async () => {
    const game = seed([final(10)], post("gold", { medal: { tier: "gold", source: "game" } }));
    await syncAssessmentMedal(game.container, args);
    expect(game.getJson(name).medal).toMatchObject({ tier: "gold", source: "game" });
    const other = seed([final(10)], { ...post("gold"), eventType: "project_complete" });
    await syncAssessmentMedal(other.container, args);
    expect(other.getJson(name).eventType).toBe("project_complete");
  });
  it("a reaction written between the read and the write is kept (the tier change re-reads and retries)", async () => {
    let raced = false;
    const ctx = createMemoryContainer({ "platform/submissions/a1/s1.json": { attempts: [final(85)] }, [name]: post("gold") }, {
      beforeConditionalUpload: (blob, api) => { if (!raced && blob === name) { raced = true; api.setJson(name, { ...api.getJson(name), reactions: { s2: "heart" } }); } }
    });
    expect(await syncAssessmentMedal(ctx.container, args)).toBe(true);
    expect(ctx.getJson(name)).toMatchObject({ tier: "silver", reactions: { s2: "heart" } });
  });
});
