import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import * as GOV from "../src/lib/exam-governance.js";
import { revisionName } from "../src/lib/exam-governance-model.js";

// Phase 17E-A — server side of Enterprise Coding Question Authoring:
//   E1–E4  the teacher's SCORING POLICY is applied by the SmartAssess grading authority (never the runner) through the REAL
//          submit → dispatch → signed callback handlers: allOrNothing = full marks only when EVERY hidden case passes;
//          proportional (default, also when missing) is byte-identical to 17C — existing in-flight grading keys do not change.
//   E5     reordering hidden tests yields a deterministic official contract (c01… follow the stored order; one token function).
//   G1–G3  governance: a coding exam travels Draft → Review → Approved → Published with its canonical coding data (hidden tests,
//          policy) intact in the immutable revision; a later draft never mutates the published copy; an invalid coding exam is
//          refused by the SAME server finalization authority.
// Fail-first on 236e1f11: no scoring policy exists (allOrNothing is ignored / not validated).
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = () => require_("../src/functions/student-submission.js");
const grading = () => require_("../src/functions/coding-grading.js");

const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
function harness(answerOver = {}) {
  const ctx = F.seed({ a: F.assignment({}, { short: false, auto: F.autoQ({ answer: { ...F.autoQ().answer, ...answerOver } }) }) });
  const fetch = F.runnerFetch();
  const obs = { logInfo() {}, logWarn() {}, logError() {} };
  return {
    ctx, fetch,
    submit: () => submission().handler(F.studentRequest(F.submitBody({ auto1: F.code("print('x')\n") })), { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch }, obs),
    callback: outputs => grading().callbackHandler(F.callbackRequest(F.callbackBody(fetch.jobs().at(-1), outputs)), { getContainer: () => ctx.container, env: F.ENV }, obs),
    target: () => ctx.getJson(F.SUB).attempts[0].codingGrading.targets.auto1,
    grade: () => ctx.getJson(F.SUB).attempts[0].questionGrades.find(g => g.questionId === "auto1")
  };
}
const E = F.CANARY.expected;

describe("17E-A E — the scoring policy is applied by the SmartAssess grading authority", () => {
  it("E1 allOrNothing + a partial pass → 0 (never a proportional fraction); the result records the policy", async () => {
    const h = harness({ scoringPolicy: "allOrNothing" });
    expect((await h.submit()).status).toBe(200);
    expect((await h.callback([E[0], "SUM=wrong\n", E[2]])).status).toBe(200);
    expect(h.target()).toMatchObject({ state: "complete", result: expect.objectContaining({ passedCount: 2, testCount: 3, automaticScore: 0, scoringPolicy: "allOrNothing" }) });
    expect(h.grade()).toMatchObject({ score: 0, manualReview: false });
  });
  it("E2 allOrNothing + every hidden case passes → full marks", async () => {
    const h = harness({ scoringPolicy: "allOrNothing" });
    await h.submit();
    await h.callback(E);
    expect(h.target().result).toMatchObject({ automaticScore: 10, passedCount: 3 });
    expect(h.grade()).toMatchObject({ score: 10, manualReview: false });
  });
  it("E3 proportional (missing or explicit) is the 17C behaviour, byte-identical: 6.67 for 4/6 weight, no policy field in the result", async () => {
    for (const over of [{}, { scoringPolicy: "proportional" }]) {
      const h = harness(over);
      await h.submit();
      await h.callback([E[0], "SUM=wrong\n", E[2]]);
      expect(h.target().result, JSON.stringify(over)).toMatchObject({ automaticScore: 6.67, passedWeight: 4, totalWeight: 6 });
      expect("scoringPolicy" in h.target().result).toBe(false);
    }
  });
  it("E4 the grading authority binds the policy: proportional keeps the 17C fingerprint (in-flight keys unchanged); allOrNothing changes it", async () => {
    const fp = async over => { const h = harness(over); await h.submit(); return h.target().questionFingerprint; };
    const legacy = await fp({}), explicit = await fp({ scoringPolicy: "proportional" }), aon = await fp({ scoringPolicy: "allOrNothing" });
    expect(explicit).toBe(legacy);
    expect(aon).not.toBe(legacy);
  });
  it("E5 hidden-test order is the official contract: tokens c01… follow the STORED order; the runner never sees ids, labels or expected outputs", async () => {
    const reversed = F.autoQ().answer.hiddenTests.slice().reverse();
    const h = harness({ hiddenTests: reversed });
    await h.submit();
    const job = h.fetch.jobs()[0];
    expect(job.cases.map(c => c.token)).toEqual(["c01", "c02", "c03"]);
    expect(job.cases.map(c => c.stdin)).toEqual(reversed.map(t => t.input));
    expect(JSON.stringify(job)).not.toMatch(/h-small|h-neg|h-ten|CANARY-HIDDEN-TITLE|SUM=CANARY|expectedOutput|weight|scoringPolicy/);
  });
  it("E6 an unknown scoring policy is never graded (fail closed: the question is not gradeable, no zero is committed)", async () => {
    const h = harness({ scoringPolicy: "bestOfThree" });
    await h.submit();
    expect(h.fetch.jobs()).toHaveLength(0);
    expect(h.grade()).toMatchObject({ manualReview: true });
  });
});

describe("17E-A G — governance carries the canonical coding data and keeps published copies immutable", () => {
  const ALL = ["author", "review", "approve", "publish"];
  const actor = { id: "teacher-1", capabilities: ALL };
  let mem, c, clock, deps;
  beforeEach(() => { mem = createMemoryContainer(); c = mem.container; clock = Date.parse("2026-10-02T08:00:00.000Z"); deps = { now: () => { clock += 1000; return new Date(clock).toISOString(); } }; });
  const codingExam = (answerOver = {}) => ({ examId: "EX-17EA", title: "امتحان برمجة", status: "draft", schemaVersion: 2, updatedAt: "2026-10-01T00:00:00.000Z",
    sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [F.autoQ({ teacherNote: undefined, answer: { ...F.autoQ().answer, scoringPolicy: "allOrNothing", ...answerOver } })] }] });
  const cycle = async exam => {
    const e = await GOV.enableGovernance(c, { examId: exam.examId, exam, actor, requestId: "en" }, deps);
    const s = await GOV.submitForReview(c, { examId: exam.examId, revisionId: e.manifest.latestRevisionId, actor, requestId: "sub", expectedStateVersion: e.manifest.stateVersion }, deps);
    const a = await GOV.approve(c, { examId: exam.examId, actor, requestId: "app", expectedStateVersion: s.manifest.stateVersion }, deps);
    return GOV.publish(c, { examId: exam.examId, actor, requestId: "pub", expectedStateVersion: a.manifest.stateVersion }, deps);
  };
  it("G1 COD32 Draft → Review → Approved → Published: the published revision holds the canonical coding@1 node (hidden tests + policy) byte-for-byte", async () => {
    const exam = codingExam();
    const p = await cycle(exam);
    expect(p.manifest.lifecycleState).toBe("published");
    const stored = mem.getJson(revisionName(exam.examId, p.manifest.publishedRevisionId)).exam.sections[0].questions[0];
    expect(stored.presentationType).toBe("coding"); expect(stored.questionTypeVersion).toBe(1);
    expect(stored.coding).toEqual(exam.sections[0].questions[0].coding);
    expect(stored.answer).toEqual(exam.sections[0].questions[0].answer);
    expect(stored.answer.scoringPolicy).toBe("allOrNothing");
  });
  it("G2 COD33 a later draft revision never mutates the published copy (immutability)", async () => {
    const exam = codingExam();
    const p = await cycle(exam);
    const name = revisionName(exam.examId, p.manifest.publishedRevisionId);
    const before = JSON.stringify(mem.getJson(name));
    const d = await GOV.returnToDraft(c, { examId: exam.examId, actor, requestId: "draft", expectedStateVersion: p.manifest.stateVersion }, deps);
    const edited = codingExam({ scoringPolicy: "proportional", hiddenTests: [{ id: "h-new", input: "9\n", expectedOutput: "9\n", weight: 1 }] });
    const r = await GOV.createRevision(c, { examId: exam.examId, exam: edited, actor, requestId: "rev2", expectedStateVersion: d.manifest.stateVersion }, deps);
    expect(r.manifest.publishedRevisionId).toBe(p.manifest.publishedRevisionId);
    expect(JSON.stringify(mem.getJson(name))).toBe(before);
  });
  it("G3 an invalid coding exam (automatic grading, no hidden test / unknown policy) is refused by the SAME server finalization authority", async () => {
    for (const [over, id] of [[{ hiddenTests: [] }, "EX-BAD1"], [{ scoringPolicy: "bestOfThree" }, "EX-BAD2"]]) {
      const exam = { ...codingExam(over), examId: id };
      const e = await GOV.enableGovernance(c, { examId: id, exam, actor, requestId: "en-" + id }, deps);
      let err = null;
      try { await GOV.submitForReview(c, { examId: id, revisionId: e.manifest.latestRevisionId, actor, requestId: "sub-" + id, expectedStateVersion: e.manifest.stateVersion }, deps); } catch (x) { err = x; }
      expect(err && err.code, id).toBe("FINALIZATION_REFUSED");
    }
  });
});
