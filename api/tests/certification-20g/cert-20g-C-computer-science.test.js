import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { examC, ANSWERS, HIDDEN, SRC } from "./exams/C-computer-science.js";
import { publishAndAssign, takeExam } from "./lifecycle.js";
import { ledgerOf, attemptInvariants } from "./ledger.js";
import { scanProjection } from "./scan.js";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";

// Phase 20G — CERTIFICATION EXAM C (computer science, 100 marks): Python / Java / C# in editable (coding@2) and locked-template (coding@3) modes
// through the REAL submission → official grading → signed callback → regrade path. The Runner is a recording double that executes nothing: it
// only returns raw per-case evidence for opaque case tokens, exactly what the real gateway reports. The API stays the grading authority (it
// compares, weights and decides). Personas: PERFECT, PARTIAL (wrong output on a weighted case, a timeout), COMPILE (compile errors under both
// teacher policies) and an INFRASTRUCTURE persona (runner busy at dispatch, a failed suite, a retry) — an infrastructure failure is NEVER a zero.
const require_ = createRequire(import.meta.url);
const { createPlatform } = require_("./platform.js");
const { examOfficialStats } = require_("../../src/lib/exam-structure.js");
const JAVAC = "Main.java:3: error: ';' expected\n1 error\n", CSC = "Program.cs(5,32): error CS1026: ) expected\n";
const expectedOf = tests => tests.map(t => t.expectedOutput);
const HIDDEN_VALUES = Object.values(HIDDEN).flat().flatMap(t => [t.expectedOutput.trim(), t.input.trim()]).filter(v => v.length >= 4);
const STUDENTS = { "c-perfect": "طالب مثالي", "c-partial": "طالب جزئي", "c-compile": "طالب أخطاء ترجمة", "c-infra": "طالب عطل تقني" };

/** Finds the dispatched job of a given submitted program (the Runner sees the source — the student's own program — and opaque cases only). */
const jobOf = (jobs, needle) => { const j = jobs.filter(x => x.source.includes(needle)); if (j.length !== 1) throw new Error("job for " + needle + ": " + j.length); return j[0]; };

describe("20G-C computer science exam — authoring", () => {
  it("finalizable, 100 marks (20 / 60 / 20); coding@2 editable and coding@3 locked templates in Python, Java and C#; JSON round trip", () => {
    const e = examC();
    const fin = evaluateExamFinalization(e);
    expect(fin.blockers.map(b => b.message)).toEqual([]);
    const s = examOfficialStats(e);
    expect([s.totalMarks, ...s.sections.map(x => x.totalMarks)]).toEqual([100, 20, 60, 20]);
    const coding = e.sections[1].questions.map(q => [q.questionTypeVersion, q.coding.defaultLanguage, !!q.coding.template, q.answer.compileErrorPolicy]);
    expect(coding).toEqual([[2, "python", false, "manualReview"], [2, "java", false, "manualReview"], [3, "csharp", true, "zero"], [3, "python", true, "manualReview"]]);
    const imp = parseStructuredExamJson(JSON.stringify(e), "C.json");
    expect(imp.validationErrors.filter(i => i.severity === "error")).toEqual([]);
    expect(imp.exam.sections.flatMap(x => x.questions)).toEqual(e.sections.flatMap(x => x.questions));
  });
});

describe("20G-C computer science exam — official grading lifecycle", () => {
  let p, aid;
  const runs = {};
  beforeAll(async () => {
    p = createPlatform({ students: STUDENTS });
    aid = (await publishAndAssign(p, examC())).aid;
    runs.PERFECT = await takeExam(p, aid, "c-perfect", ANSWERS.PERFECT);
    runs.PARTIAL = await takeExam(p, aid, "c-partial", ANSWERS.PARTIAL);
    runs.COMPILE = await takeExam(p, aid, "c-compile", ANSWERS.COMPILE, { chunks: 1 });
  }, 120000);

  it("the student payload never carries hidden tests, expected outputs, inputs, weights, reference solutions, compile policy or case ids", () => {
    for (const [name, r] of Object.entries(runs)) {
      expect(scanProjection(r.delivery.jsonBody, { secrets: [...HIDDEN_VALUES, "py-small", "j-word", "cs-1", "v-3", "c-2"] }), name).toEqual([]);
      const tpl = r.delivery.jsonBody.assignment.exam.sections[1].questions[2].coding.template;
      expect(tpl.segments.map(x => x.kind), name).toEqual(["locked", "editable", "locked"]);       // the locked template itself is public
    }
  });
  it("the Runner receives opaque case tokens + stdin + limits only — never expected output, weights, titles, marks or identities", () => {
    const jobs = p.runner.jobs();
    expect(jobs.length).toBe(5 + 5 + 4);                                              // 5 hidden-test targets each for PERFECT / PARTIAL; COMPILE answered 4
    for (const j of jobs) {
      expect(Object.keys(j).sort()).toEqual(["cases", "jobId", "language", "languageVersion", "limits", "revision", "source", "targetRef"]);
      for (const c of j.cases) { expect(Object.keys(c).sort()).toEqual(["stdin", "token"]); expect(c.token).toMatch(/^c\d\d$/); }
      expect(JSON.stringify(j)).not.toMatch(/SUM=3000000|gnikrowten|ROUTER|"weight"|"expectedOutput"|CERT20G|c-perfect|c-partial|c-compile/);
    }
    // the locked template is reconstructed SERVER-side: the job carries the full program, locked segments included
    expect(jobs.find(j => j.language === "csharp").source).toContain("Console.WriteLine(line.ToUpper());");
  });
  it("before any callback every hidden-test question is PENDING (never a zero); the non-coding parts are graded", () => {
    const l = ledgerOf(runs.PERFECT.attempt).questions;
    expect([l["c2-1"], l["c2-2"], l["c2-3"], l["c2-4"]]).toEqual([[0, 15], [0, 15], [0, 15], [0, 15]]);
    expect(runs.PERFECT.attempt.finalized).toBe(false);
    expect(runs.PERFECT.submit.jsonBody.result.autoGradingStatus).toBeTruthy();
  });
  it("PERFECT: callbacks with correct evidence ⇒ every coding question full marks; the composite child too; rubric + short answer ⇒ 100", async () => {
    const jobs = p.runner.jobs();
    for (const [needle, tests] of [[SRC.sumOk, HIDDEN.sum], [SRC.revOk, HIDDEN.rev], ["line.ToUpper()", HIDDEN.upper], [SRC.vowelsOk, HIDDEN.vowels], [SRC.childOk, HIDDEN.child]]) {
      const job = jobs.filter(x => x.source.includes(needle.trim().split("\n")[0]))[0];
      const r = await p.runner.callback({ ...p.runner.callbackBody(job, expectedOf(tests)), ...(job.language !== "python" ? { compile: { status: "compiled", durationMs: 700 } } : {}) });
      expect(r.status, needle).toBe(200);
    }
    const at = p.student("c-perfect").attempt(aid);
    expect(ledgerOf(at).questions).toEqual({ "c1-1": [3, 0], "c1-2": [3, 0], "c1-3": [2, 0], "c1-4": [4, 0], "c1-5": [4, 0], "c1-6": [4, 0], "c2-1": [15, 0], "c2-2": [15, 0], "c2-3": [15, 0], "c2-4": [15, 0], "c3-1": [16, 4] });
    expect(ledgerOf(at).parts["c3-1"]).toEqual({ t1: [4, 0], t2: [2, 0], k1: [10, 0], o1: [0, 4] });
    expect(attemptInvariants(at, 100)).toEqual([]);
    const rv = await p.teacher.saveReview(aid, "c-perfect", { "c3-1::part::o1": { rubricAwards: { explain: { levelId: "full" } } } });
    expect([rv.jsonBody.result.score, rv.jsonBody.result.finalized]).toEqual([100, true]);
  });
  it("a DUPLICATE callback is idempotent (alreadyApplied, no write) and never double-grades; a callback carrying a score is refused", async () => {
    const job = p.runner.jobs().find(x => x.source.includes("print('SUM=' + str(a + b))"));
    const before = JSON.stringify(p.student("c-perfect").doc(aid));
    const again = await p.runner.callback(p.runner.callbackBody(job, expectedOf(HIDDEN.sum)));
    expect(again.status).toBe(200);
    expect(again.jsonBody.alreadyApplied).toBe(true);
    expect(JSON.stringify(p.student("c-perfect").doc(aid))).toBe(before);
    const forged = await p.runner.callback({ ...p.runner.callbackBody(job, expectedOf(HIDDEN.sum)), score: 15 });
    expect(forged.status).toBe(400);
    const unsigned = await p.runner.callback(p.runner.callbackBody(job, expectedOf(HIDDEN.sum)), { unsigned: true });
    expect(unsigned.status).toBe(401);
  });
  it("PARTIAL: a wrong weighted case and an all-timeout program are STUDENT outcomes (partial score, zero) — the API weights by the hidden weights", async () => {
    const jobs = p.runner.jobs().filter(j => !j.source.includes("SUM=' + str(a + b))") || j.source.includes("abs("));
    const sum = jobOf(jobs, "abs(int(a))");
    await p.runner.callback(p.runner.callbackBody(sum, ["SUM=3\n", "SUM=14\n", "SUM=3000000\n"]));
    const slow = jobOf(jobs, "while True");
    const slowCb = await p.runner.callback(p.runner.callbackBody(slow, slow.cases.map(() => ({ status: "timeout", stdout: "", exitCode: 137, durationMs: 2000 }))));
    expect(slowCb.status, JSON.stringify(slowCb.jsonBody)).toBe(200);
    const partialJobs = p.runner.jobs().filter(j => j.jobId !== sum.jobId && j.jobId !== slow.jobId);
    // the other PARTIAL programs are the correct ones (same sources as PERFECT): their jobs are distinct targets of THIS attempt
    const at0 = p.student("c-partial").attempt(aid);
    for (const [qid, tests, lang] of [["c2-2", HIDDEN.rev, "java"], ["c2-3", HIDDEN.upper, "csharp"], ["c3-1::part::k1", HIDDEN.child, "python"]]) {
      const t = at0.codingGrading.targets[qid];
      const job = partialJobs.find(j => j.jobId === t.jobId);
      const r = await p.runner.callback({ ...p.runner.callbackBody(job, expectedOf(tests)), ...(lang !== "python" ? { compile: { status: "compiled" } } : {}) });
      expect(r.status, qid).toBe(200);
    }
    const at = p.student("c-partial").attempt(aid);
    // c2-1: cases 1 (w1) and 3 (w3) pass of total weight 6 ⇒ 15·4/6 = 10 · c2-4: every case timed out ⇒ 0 (a student outcome) ·
    // c1-1 wrong · c1-3 "4" ≠ key ⇒ teacher review (2 pending) · c1-4 2 of 3 cells ⇒ 2.67 · c1-5 wrong order: last step only ⇒ 4·1/3 = 1.33 ·
    // c1-6 1 of 2 ⇒ 2 · composite: t1 wrong, t2 2, k1 10, o1 pending 4.
    expect(ledgerOf(at).questions).toEqual({ "c1-1": [0, 0], "c1-2": [3, 0], "c1-3": [0, 2], "c1-4": [2.67, 0], "c1-5": [1.33, 0], "c1-6": [2, 0], "c2-1": [10, 0], "c2-2": [15, 0], "c2-3": [15, 0], "c2-4": [0, 0], "c3-1": [12, 4] });
    expect(attemptInvariants(at, 100)).toEqual([]);
    expect(at.codingGrading.targets["c2-4"]).toMatchObject({ state: "complete" });
  });
  it("COMPILE: Java compile error under «teacher review» ⇒ reviewRequired (pending, never 0); C# under the explicit «zero» policy ⇒ 0; the teacher decides the Java mark", async () => {
    const at0 = p.student("c-compile").attempt(aid);
    const jobs = p.runner.jobs();
    const java = jobs.find(j => j.jobId === at0.codingGrading.targets["c2-2"].jobId), cs = jobs.find(j => j.jobId === at0.codingGrading.targets["c2-3"].jobId);
    expect((await p.runner.callback({ jobId: java.jobId, outcome: "completed", compile: { status: "compile-error", stderr: JAVAC }, cases: [] })).status).toBe(200);
    expect((await p.runner.callback({ jobId: cs.jobId, outcome: "completed", compile: { status: "compile-error", stderr: CSC }, cases: [] })).status).toBe(200);
    const sum = jobs.find(j => j.jobId === at0.codingGrading.targets["c2-1"].jobId), vow = jobs.find(j => j.jobId === at0.codingGrading.targets["c2-4"].jobId);
    await p.runner.callback(p.runner.callbackBody(sum, expectedOf(HIDDEN.sum)));
    // the Runner reports an INTERNAL failure for the vowels suite: retryable technical state, no score, still pending
    const failed = await p.runner.callback({ jobId: vow.jobId, outcome: "failed", technicalCode: "RUNNER_INTERNAL", cases: [] });
    expect(failed.status).toBe(200);
    let at = p.student("c-compile").attempt(aid);
    expect(at.codingGrading.targets["c2-2"].state).toBe("reviewRequired");
    expect(at.codingGrading.targets["c2-3"]).toMatchObject({ state: "complete" });
    expect(at.codingGrading.targets["c2-4"].state).toBe("retryable");
    expect(ledgerOf(at).questions).toMatchObject({ "c1-1": [3, 0], "c2-1": [15, 0], "c2-2": [0, 15], "c2-3": [0, 0], "c2-4": [0, 15], "c3-1": [0, 6] });   // composite unanswered: legacy short answer t2 (2) + rubric o1 (4) await the teacher
    expect(at.finalized).toBe(false);
    // teacher retry of the failed suite → a fresh dispatch (same revision) → completed evidence → graded
    const n = p.runner.jobs().length;
    const retry = await p.teacher.regrade({ action: "retry", assignmentId: aid, studentId: "c-compile", attemptNumber: 1, questionId: "c2-4" });
    expect(retry.status, JSON.stringify(retry.jsonBody)).toBe(200);
    const redispatched = p.runner.jobs().slice(n);
    expect(redispatched.map(j => j.jobId)).toEqual([vow.jobId]);
    await p.runner.callback(p.runner.callbackBody(redispatched[0], expectedOf(HIDDEN.vowels)));
    at = p.student("c-compile").attempt(aid);
    expect(ledgerOf(at).questions["c2-4"]).toEqual([15, 0]);
    // the teacher decides the compile-error question (partial credit for the approach); the UNANSWERED legacy short-answer / table / blanks
    // questions and composite parts were routed to review (never a manufactured zero) and get an explicit teacher zero
    const rv = await p.teacher.saveReview(aid, "c-compile", { "c2-2": { score: 5, comment: "فاصلة منقوطة ناقصة" }, "c1-3": { score: 0 }, "c1-4": { score: 0 }, "c1-6": { score: 0 }, "c3-1::part::t2": { score: 0 }, "c3-1::part::o1": { rubricAwards: { explain: { levelId: "none" } } } });
    expect(rv.status, JSON.stringify(rv.jsonBody)).toBe(200);
    expect([rv.jsonBody.result.score, rv.jsonBody.result.finalized], JSON.stringify([ledgerOf(p.student("c-compile").attempt(aid)), rv.jsonBody.result])).toEqual([3 + 15 + 5 + 0 + 15, true]);
    expect(attemptInvariants(p.student("c-compile").attempt(aid), 100)).toEqual([]);
  });
  it("STALE: after a FORCE regrade the old job's late callback cannot overwrite the new revision; the previous result stays visible until the new revision applies", async () => {
    const at0 = p.student("c-perfect").attempt(aid);
    const oldJob = p.runner.jobs().find(j => j.jobId === at0.codingGrading.targets["c2-1"].jobId);
    const n = p.runner.jobs().length;
    const force = await p.teacher.regrade({ action: "force", assignmentId: aid, studentId: "c-perfect", attemptNumber: 1, questionId: "c2-1" });
    expect(force.status, JSON.stringify(force.jsonBody)).toBe(200);
    const fresh = p.runner.jobs().slice(n)[0];
    expect(fresh.jobId).not.toBe(oldJob.jobId);
    expect(fresh.revision).toBe(2);
    const stale = await p.runner.callback(p.runner.callbackBody(oldJob, ["SUM=0\n", "SUM=0\n", "SUM=0\n"]));
    expect([409, 200]).toContain(stale.status);
    if (stale.status === 200) expect(stale.jsonBody.alreadyApplied).toBe(true);   // the old job id was already applied before the force
    // the previously applied result stays visible until the NEW revision completes (documented contract); the stale zeros never applied
    expect(ledgerOf(p.student("c-perfect").attempt(aid)).questions["c2-1"]).toEqual([15, 0]);
    expect(p.student("c-perfect").attempt(aid).codingGrading.targets["c2-1"]).toMatchObject({ revision: 2, jobId: fresh.jobId });
    // the new revision's evidence (case 2 now fails) is the one that applies: 15·(1 + 3)/6 = 10
    expect((await p.runner.callback(p.runner.callbackBody(fresh, ["SUM=3\n", "SUM=0\n", "SUM=3000000\n"]))).status).toBe(200);
    expect(ledgerOf(p.student("c-perfect").attempt(aid)).questions["c2-1"]).toEqual([10, 0]);
  });
});

describe("20G-C infrastructure failure is never a zero", () => {
  it("RUNNER_BUSY at dispatch ⇒ retryable technical state, pending marks, no score; the teacher retry dispatches and grades", async () => {
    let busy = true;
    const p = createPlatform({ students: { "c-infra": "طالب" }, runner: () => (busy ? { status: 503, json: { ok: false, code: "RUNNER_BUSY" } } : { status: 202, json: { ok: true, accepted: true, duplicate: false } }) });
    const { aid } = await publishAndAssign(p, examC());
    const r = await takeExam(p, aid, "c-infra", { "c2-1": ANSWERS.PERFECT["c2-1"] }, { chunks: 1 });
    expect(r.submit.status).toBe(200);
    let at = p.student("c-infra").attempt(aid);
    expect(at.codingGrading.targets["c2-1"]).toMatchObject({ state: "retryable", technicalCode: "RUNNER_BUSY" });
    expect(ledgerOf(at).questions["c2-1"]).toEqual([0, 15]);
    expect(r.submit.jsonBody.result.finalized).toBe(false);
    busy = false;
    const retry = await p.teacher.regrade({ action: "retry", assignmentId: aid, studentId: "c-infra", attemptNumber: 1, questionId: "c2-1" });
    expect(retry.status).toBe(200);
    const job = p.runner.jobs().at(-1);
    await p.runner.callback(p.runner.callbackBody(job, expectedOf(HIDDEN.sum)));
    at = p.student("c-infra").attempt(aid);
    expect(ledgerOf(at).questions["c2-1"]).toEqual([15, 0]);
  });
});
