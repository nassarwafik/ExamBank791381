import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Teacher-device grading (owner decision 2026-11-23, docs/enterprise-teacher-device-grading.md) — driven through the REAL handlers
// against the in-memory blob container, like the 17C lifecycle suite. Invariants:
//   • the teacher's device receives source + case stdin + the time limit only — never expected outputs, weights, titles, marks;
//   • the device reports RAW evidence; the server compares / weights / applies with the Runner callback's own code (same mark);
//   • one application per revision whoever reports first (device or Runner); stale / foreign tickets never land;
//   • evidence the device cannot vouch for (timeout, output limit, over the time limit, unknown duration, a runtime the browser
//     cannot offer, a compile error outside the "manualReview" policy, a non-C# answer) is refused and NOTHING is written — never a zero.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = () => require_("../src/functions/student-submission.js");
const grading = () => require_("../src/functions/coding-grading.js");
const device = () => require_("../src/lib/coding/device-grading.js");

const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const OFF = Object.freeze({});                                   // the Runner switched off (CODING_RUNNER_ENABLED=false): nothing configured
const CS = "var p = System.Console.ReadLine().Split(' ');\nSystem.Console.WriteLine(\"SUM=\" + (int.Parse(p[0]) + int.Parse(p[1])));\n";

function harness({ ctx = F.seed(), env = OFF, fetch = F.runnerFetch() } = {}) {
  const logs = [];
  const obs = { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) };
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env, fetch };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env, fetch };
  const cDeps = { getContainer: () => ctx.container, env };
  const h = {
    ctx, fetch, logs,
    submit: answers => submission().handler(F.studentRequest(F.submitBody(answers)), sDeps, obs),
    list: () => grading().deviceGradingHandler(F.teacherRequest("/api/coding/device-grading?assignmentId=" + F.AID, null, "GET"), tDeps, obs),
    jobs: () => grading().deviceGradingHandler(F.teacherRequest("/api/coding/device-grading?assignmentId=" + F.AID + "&studentId=" + F.S1, null, "GET"), tDeps, obs),
    post: body => grading().deviceGradingHandler(F.teacherRequest("/api/coding/device-grading", body), tDeps, obs),
    regrade: body => grading().regradeHandler(F.teacherRequest("/api/coding/regrade", body), tDeps, obs),
    callback: body => grading().callbackHandler(F.callbackRequest(body), cDeps, obs),
    doc: () => h.ctx.getJson(F.SUB),
    attempt: () => h.ctx.getJson(F.SUB).attempts[0],
    target: () => h.ctx.getJson(F.SUB).attempts[0].codingGrading.targets.auto1,
    grade: () => h.ctx.getJson(F.SUB).attempts[0].questionGrades.find(g => g.questionId === "auto1"),
    audits: () => h.ctx.names("platform/audit/").map(n => h.ctx.getJson(n)).filter(e => String(e.action).startsWith("coding.deviceGrade"))
  };
  return h;
}
const csAnswers = (source = CS) => ({ auto1: F.code(source, "csharp"), sa1: { kind: "text", value: "x" } });
async function oneJob(h) { const r = await h.jobs(); expect(r.status).toBe(200); expect(r.jsonBody.jobs).toHaveLength(1); return r.jsonBody.jobs[0]; }
/** The device's raw evidence for `job` (outputs[i] = stdout, or a case override), compiled. */
function evidence(job, outputs, over = {}) {
  const cases = job.cases.map((c, i) => {
    const o = outputs[i], base = { token: c.token, status: "success", stdout: "", stderr: "", durationMs: 4 };
    return typeof o === "string" ? { ...base, stdout: o } : { ...base, ...o };
  });
  return { assignmentId: F.AID, studentId: F.S1, attemptNumber: job.attemptNumber, questionId: job.questionId, revision: job.revision, ticket: job.ticket, compile: { status: "compiled", durationMs: 300 }, cases, ...over };
}
const ALL_PASS = F.CANARY.expected;
const ONE_WRONG = ["SUM=wrong\n", F.CANARY.expected[1], F.CANARY.expected[2]];

describe("device grading — the jobs: what the teacher's device receives", () => {
  it("DG1 Runner OFF: the C# answer stays «قيد المراجعة» (retryable, no zero) and is listed for the teacher's device", async () => {
    const h = harness();
    expect((await h.submit(csAnswers())).status).toBe(200);
    expect(h.target()).toMatchObject({ state: "retryable", technicalCode: "EXECUTION_UNAVAILABLE" });
    expect(h.grade()).toMatchObject({ manualReview: true });
    const r = await h.list();
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ ok: true, students: [{ studentId: F.S1, jobs: 1 }], skipped: 0, hasMore: false });
  });
  it("DG2 a job carries the source, the case stdin and the time limit ONLY — never expected outputs, weights, titles, marks or ids", async () => {
    const h = harness();
    await h.submit(csAnswers());
    const job = await oneJob(h);
    expect(Object.keys(job).sort()).toEqual(["attemptNumber", "cases", "language", "languageVersion", "limits", "questionId", "revision", "source", "ticket"]);
    expect(job).toMatchObject({ attemptNumber: 1, questionId: "auto1", revision: 1, language: "csharp", languageVersion: 1, source: CS, limits: { timeMs: 2000 } });
    expect(job.ticket).toMatch(/^dt_[0-9a-f]{40}$/);
    expect(job.cases).toEqual(F.HIDDEN.map((t, i) => ({ token: "c" + String(i + 1).padStart(2, "0"), stdin: t.input })));
    const text = JSON.stringify((await h.jobs()).jsonBody) + JSON.stringify((await h.list()).jsonBody);
    for (const secret of [...F.CANARY.expected, F.CANARY.title, F.CANARY.reference, "expectedOutput", "weight", "marks", "cg_", h.target().gradingKey, h.target().jobId]) expect(text).not.toContain(secret);
  });
  it("DG3 a Java answer (no on-device lab) is not offered to the device (counted as skipped) and its evidence is refused", async () => {
    const h = harness();
    await h.submit({ auto1: F.code("public class Main { public static void main(String[] a) { System.out.println(1); } }\n", "java"), sa1: { kind: "text", value: "x" } });
    expect((await h.list()).jsonBody).toMatchObject({ students: [], skipped: 1 });
    expect((await h.jobs()).jsonBody).toMatchObject({ jobs: [], skipped: 1 });
    const ticket = device().deviceTicket(h.target().gradingKey);
    const before = JSON.stringify(h.doc());
    const r = await h.post(evidence({ attemptNumber: 1, questionId: "auto1", revision: 1, ticket, cases: F.HIDDEN.map((_, i) => ({ token: "c0" + (i + 1) })) }, ALL_PASS));
    expect(r.status).toBe(422); expect(r.jsonBody.code).toBe("DEVICE_LANGUAGE");
    expect(JSON.stringify(h.doc())).toBe(before);
  });
  it("DG4 malformed requests are refused before any read: unknown field (a score), bad ids, no compile status", async () => {
    const h = harness();
    await h.submit(csAnswers());
    const job = await oneJob(h);
    for (const body of [evidence(job, ALL_PASS, { score: 10 }), evidence(job, ALL_PASS, { assignmentId: "../x" }), { ...evidence(job, ALL_PASS), compile: undefined }, evidence(job, ALL_PASS, { ticket: "cg_" + "a".repeat(40) }), evidence(job, [{ status: "passed" }, ALL_PASS[1], ALL_PASS[2]])]) {
      const r = await h.post(JSON.parse(JSON.stringify(body)));
      expect(r.status).toBe(400);
    }
    expect((await grading().deviceGradingHandler(F.teacherRequest("/api/coding/device-grading?assignmentId=..%2Fx", null, "GET"), { requireBuilderAuth: teacherAuth, getContainer: () => h.ctx.container })).status).toBe(400);
    expect(h.target().state).toBe("retryable");
  });
  it("DG5b tenancy: a teacher of ANOTHER class sees «not found» — no list, no job (no source / stdin), no write", async () => {
    const h = harness();
    await h.submit(csAnswers());
    const job = await oneJob(h);
    const cls = h.ctx.getJson("platform/classes/" + F.CLASS_ID + ".json");
    h.ctx.setJson("platform/classes/" + F.CLASS_ID + ".json", { ...cls, ownerId: "t_owner000000000001" });
    const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "t_other00000000002", am: "managed" } }), getContainer: () => h.ctx.container };
    const before = JSON.stringify(h.doc());
    for (const req of [F.teacherRequest("/api/coding/device-grading?assignmentId=" + F.AID, null, "GET"), F.teacherRequest("/api/coding/device-grading?assignmentId=" + F.AID + "&studentId=" + F.S1, null, "GET"), F.teacherRequest("/api/coding/device-grading", evidence(job, ALL_PASS))]) {
      const r = await grading().deviceGradingHandler(req, deps);
      expect(r.status).toBe(404);
      expect(JSON.stringify(r.jsonBody)).not.toContain("SUM");
    }
    expect(JSON.stringify(h.doc())).toBe(before);
    // the class's own teacher is served
    const own = await grading().deviceGradingHandler(F.teacherRequest("/api/coding/device-grading?assignmentId=" + F.AID, null, "GET"), { ...deps, requireBuilderAuth: () => ({ ok: true, user: { sub: "t_owner000000000001", am: "managed" } }) });
    expect(own.status).toBe(200);
  });
  it("DG5 no teacher session → refused", async () => {
    const h = harness();
    const r = await grading().deviceGradingHandler(F.teacherRequest("/api/coding/device-grading?assignmentId=" + F.AID, null, "GET"), { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), getContainer: () => h.ctx.container });
    expect(r.status).toBe(401);
  });
});

describe("device grading — the apply: the server decides, exactly as for the Runner", () => {
  it("DG6 all cases pass → complete, full marks, recorded as the teacher's device, audited under the teacher", async () => {
    const h = harness();
    await h.submit(csAnswers());
    const job = await oneJob(h);
    const r = await h.post(evidence(job, ALL_PASS));
    expect(r.status).toBe(200); expect(r.jsonBody).toEqual({ ok: true, applied: true, state: "complete" });
    expect(h.target()).toMatchObject({ state: "complete", result: expect.objectContaining({ engine: "teacher-device-v1", automaticScore: 10, passedCount: 3, testCount: 3, outcome: "graded" }) });
    expect(h.target().technicalCode).toBeUndefined();
    expect(h.grade()).toMatchObject({ score: 10, manualReview: false, correct: true });
    expect(h.attempt().finalized).toBe(true);
    expect(h.audits()).toEqual([expect.objectContaining({ actor: F.CANARY.teacherId, action: "coding.deviceGrade.completed" })]);
    expect((await h.list()).jsonBody.students).toEqual([]);                                   // nothing open any more
  });
  it("DG7 the SAME evidence gives the SAME mark through the device as through a Runner callback (one scoring path)", async () => {
    const viaDevice = harness();
    await viaDevice.submit(csAnswers());
    expect((await viaDevice.post(evidence(await oneJob(viaDevice), ONE_WRONG))).status).toBe(200);
    const viaRunner = harness({ env: F.ENV });
    await viaRunner.submit(csAnswers());
    const job = viaRunner.fetch.jobs()[0];
    expect((await viaRunner.callback(F.callbackBody(job, ONE_WRONG))).status).toBe(200);
    const strip = r => { const rest = { ...r }; delete rest.engine; delete rest.jobId; delete rest.completedAt; return rest; };
    expect(strip(viaDevice.target().result)).toEqual(strip(viaRunner.target().result));
    expect(viaDevice.grade()).toEqual(viaRunner.grade());
    expect(viaDevice.attempt().score).toBe(viaRunner.attempt().score);
    expect(viaDevice.grade().score).toBeGreaterThan(0); expect(viaDevice.grade().score).toBeLessThan(10);
  });
  it("DG8 idempotent: the same evidence twice applies once; a later Runner callback for the same revision is «already applied»", async () => {
    const h = harness({ env: F.ENV });
    await h.submit(csAnswers());
    expect(h.target().state).toBe("dispatched");                                           // the Runner also has it
    const job = await oneJob(h);
    expect((await h.post(evidence(job, ONE_WRONG))).status).toBe(200);
    const after = JSON.stringify(h.doc());
    const again = await h.post(evidence(job, ALL_PASS));
    expect(again.status).toBe(200); expect(again.jsonBody).toEqual({ ok: true, alreadyApplied: true });
    const cb = await h.callback(F.callbackBody(h.fetch.jobs()[0], ALL_PASS));
    expect(cb.status).toBe(200); expect(cb.jsonBody.alreadyApplied).toBe(true);
    expect(JSON.stringify(h.doc())).toBe(after);
    expect(h.audits()).toHaveLength(1);
  });
  it("DG9 a Runner result that landed first wins; the device's later report is «already applied»", async () => {
    const h = harness({ env: F.ENV });
    await h.submit(csAnswers());
    const job = await oneJob(h);
    expect((await h.callback(F.callbackBody(h.fetch.jobs()[0], ALL_PASS))).status).toBe(200);
    const after = JSON.stringify(h.doc());
    const r = await h.post(evidence(job, ONE_WRONG));
    expect(r.jsonBody).toEqual({ ok: true, alreadyApplied: true });
    expect(JSON.stringify(h.doc())).toBe(after);
  });
  it("DG10 stale: a wrong revision, a foreign ticket, or a job from before a force regrade never lands", async () => {
    const h = harness();
    await h.submit(csAnswers());
    const job = await oneJob(h);
    const before = JSON.stringify(h.doc());
    expect((await h.post(evidence(job, ALL_PASS, { revision: 2 }))).status).toBe(409);
    expect((await h.post(evidence(job, ALL_PASS, { ticket: "dt_" + "0".repeat(40) }))).status).toBe(409);
    expect((await h.post(evidence(job, ALL_PASS, { questionId: "sa1" }))).status).toBe(404);
    expect(JSON.stringify(h.doc())).toBe(before);
    expect((await h.regrade({ action: "force", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" })).status).toBe(200);
    const r = await h.post(evidence(job, ALL_PASS));
    expect(r.status).toBe(409); expect(r.jsonBody.code).toBe("STALE_RESULT");
    expect(h.target()).toMatchObject({ revision: 2 });
    expect(h.target().result).toBeUndefined();
    const fresh = await oneJob(h);
    expect(fresh.revision).toBe(2); expect(fresh.ticket).not.toBe(job.ticket);
    expect((await h.post(evidence(fresh, ALL_PASS))).status).toBe(200);
  });
  it("DG10b the stored answer changed behind the target (same revision): the authority no longer matches → not offered, refused, nothing written", async () => {
    const h = harness();
    await h.submit(csAnswers());
    const job = await oneJob(h);
    const doc = h.doc();
    doc.attempts[0].answers.auto1 = F.code(CS + "// changed\n", "csharp");
    h.ctx.setJson(F.SUB, doc);
    expect((await h.jobs()).jsonBody).toMatchObject({ jobs: [], skipped: 1 });
    const before = JSON.stringify(h.doc());
    const r = await h.post(evidence(job, ALL_PASS));
    expect(r.status).toBe(409); expect(r.jsonBody.code).toBe("STALE_RESULT");
    expect(JSON.stringify(h.doc())).toBe(before);
  });
  it("DG10c a target in a state that is neither open nor finished (unknown / corrupt) is never graded", async () => {
    const h = harness();
    await h.submit(csAnswers());
    const job = await oneJob(h);
    const doc = h.doc();
    doc.attempts[0].codingGrading.targets.auto1.state = "superseded";
    h.ctx.setJson(F.SUB, doc);
    expect((await h.jobs()).jsonBody.jobs).toEqual([]);
    const before = JSON.stringify(h.doc());
    expect((await h.post(evidence(job, ALL_PASS))).status).toBe(409);
    expect(JSON.stringify(h.doc())).toBe(before);
  });
});

describe("device grading — fail safe: what the device cannot vouch for is refused, NOTHING written, never a zero", () => {
  const refusals = [
    ["a case timed out on the device", job => evidence(job, [{ status: "timeout" }, ALL_PASS[1], ALL_PASS[2]]), "DEVICE_INCONCLUSIVE"],
    ["a case hit the output limit", job => evidence(job, [{ status: "output-limit", stdout: "x" }, ALL_PASS[1], ALL_PASS[2]]), "DEVICE_INCONCLUSIVE"],
    ["a case failed inside the lab", job => evidence(job, [{ status: "internal-error" }, ALL_PASS[1], ALL_PASS[2]]), "DEVICE_INCONCLUSIVE"],
    ["a case ran longer than the question's time limit", job => evidence(job, [{ stdout: ALL_PASS[0], durationMs: 2001 }, ALL_PASS[1], ALL_PASS[2]]), "DEVICE_INCONCLUSIVE"],
    ["a case without its duration", job => evidence(job, [{ stdout: ALL_PASS[0], durationMs: undefined }, ALL_PASS[1], ALL_PASS[2]]), "DEVICE_INCONCLUSIVE"],
    ["an API the browser runtime cannot offer", job => evidence(job, [{ status: "runtime-error", stderr: "System.PlatformNotSupportedException: Operation is not supported on this platform." }, ALL_PASS[1], ALL_PASS[2]]), "DEVICE_INCONCLUSIVE"],
    ["a compile error under the historical (zero) policy", job => evidence(job, [], { compile: { status: "compile-error", stderr: "CS1002: ; expected" }, cases: [] }), "DEVICE_COMPILE_ERROR"],
    ["an incomplete suite", job => evidence(job, ALL_PASS, { cases: evidence(job, ALL_PASS).cases.slice(0, 2) }), "EVIDENCE_INVALID"]
  ];
  for (const [name, build, code] of refusals) {
    it("DG11 " + name + " → 422 " + code, async () => {
      const h = harness();
      await h.submit(csAnswers());
      const job = await oneJob(h);
      const before = JSON.stringify(h.doc());
      const r = await h.post(JSON.parse(JSON.stringify(build(job))));
      expect(r.status).toBe(422); expect(r.jsonBody.code).toBe(code);
      expect(JSON.stringify(h.doc())).toBe(before);
      expect(h.grade()).toMatchObject({ manualReview: true });
      expect(h.audits()).toEqual([]);
    });
  }
  it("DG12 a runtime error of the student's own program is ordinary evidence (that case fails, the others count)", async () => {
    const h = harness();
    await h.submit(csAnswers());
    const job = await oneJob(h);
    expect((await h.post(evidence(job, [{ status: "runtime-error", stderr: "System.FormatException: Input string was not in a correct format." }, ALL_PASS[1], ALL_PASS[2]]))).status).toBe(200);
    expect(h.target().result).toMatchObject({ passedCount: 2, testCount: 3 });
  });
  it("DG13 a compile error under the coding@2 «manualReview» policy → reviewRequired (the teacher decides), no automatic score", async () => {
    const q = F.autoQ({ questionTypeVersion: 2, answer: { gradingMode: "hiddenTests", comparator: "trimTrailingWhitespace", hiddenTests: JSON.parse(JSON.stringify(F.HIDDEN)), referenceSolutions: { python: F.CANARY.reference }, compileErrorPolicy: "manualReview" } });
    const h = harness({ ctx: F.seed({ a: F.assignment({}, { auto: q }) }) });
    expect((await h.submit(csAnswers("not C#"))).status).toBe(200);
    const job = await oneJob(h);
    const r = await h.post(evidence(job, [], { compile: { status: "compile-error", stderr: "CS1002: ; expected" }, cases: [] }));
    expect(r.status).toBe(200); expect(r.jsonBody.state).toBe("reviewRequired");
    expect(h.target()).toMatchObject({ state: "reviewRequired", result: expect.objectContaining({ reviewRequired: true, outcome: "compile-error", engine: "teacher-device-v1" }) });
    expect(h.target().result.automaticScore).toBeUndefined();
    expect(h.grade()).toMatchObject({ manualReview: true });
  });
});

describe("device grading — Python answers (Python phase 2): the same path, the same safeguards", () => {
  const PY = "a, b = map(int, input().split())\nprint('SUM=' + str(a + b))\n";
  const pyAnswers = () => ({ auto1: F.code(PY, "python"), sa1: { kind: "text", value: "x" } });
  it("PY1 a Python answer is listed and its job carries the source, the case stdin and the time limit only", async () => {
    const h = harness();
    await h.submit(pyAnswers());
    expect((await h.list()).jsonBody).toMatchObject({ students: [{ studentId: F.S1, jobs: 1 }], skipped: 0 });
    const job = await oneJob(h);
    expect(job).toMatchObject({ language: "python", languageVersion: 1, source: PY, limits: { timeMs: 2000 } });
    expect(JSON.stringify((await h.jobs()).jsonBody)).not.toMatch(/CANARY-3|CANARY-NEG|expectedOutput|weight/);
  });
  it("PY2 the SAME evidence gives the SAME mark through the teacher's device as through a Runner callback", async () => {
    const viaDevice = harness();
    await viaDevice.submit(pyAnswers());
    const r = await viaDevice.post(evidence(await oneJob(viaDevice), ONE_WRONG));
    expect(r.status).toBe(200); expect(r.jsonBody.state).toBe("complete");
    const viaRunner = harness({ env: F.ENV });
    await viaRunner.submit(pyAnswers());
    expect((await viaRunner.callback(F.callbackBody(viaRunner.fetch.jobs()[0], ONE_WRONG))).status).toBe(200);
    const strip = x => { const rest = { ...x }; delete rest.engine; delete rest.jobId; delete rest.completedAt; return rest; };
    expect(strip(viaDevice.target().result)).toEqual(strip(viaRunner.target().result));
    expect(viaDevice.grade()).toEqual(viaRunner.grade());
    expect(viaDevice.target().result.engine).toBe("teacher-device-v1");
  });
  for (const [name, stderr] of [
    ["no threads in the browser", "Traceback (most recent call last):\n  File \"main.py\", line 3\nRuntimeError: can't start new thread"],
    ["an OS function the browser lacks", "OSError: [Errno 52] Function not implemented"],
    ["an Emscripten / Pyodide limit", "pyodide.ffi.JsException: Error: The Python lab has no network or storage access."],
  ]) {
    it("PY3 a runtime error the browser caused (" + name + ") is refused — nothing written, still «قيد المراجعة»", async () => {
      const h = harness();
      await h.submit(pyAnswers());
      const job = await oneJob(h);
      const before = JSON.stringify(h.doc());
      const r = await h.post(evidence(job, [{ status: "runtime-error", stderr }, ALL_PASS[1], ALL_PASS[2]]));
      expect(r.status).toBe(422); expect(r.jsonBody.code).toBe("DEVICE_INCONCLUSIVE");
      expect(JSON.stringify(h.doc())).toBe(before);
      expect(h.grade()).toMatchObject({ manualReview: true });
    });
  }
  it("PY4 the student's own Python exception is ordinary evidence (that case fails)", async () => {
    const h = harness();
    await h.submit(pyAnswers());
    const job = await oneJob(h);
    expect((await h.post(evidence(job, [{ status: "runtime-error", stderr: "ValueError: invalid literal for int() with base 10: 'x'" }, ALL_PASS[1], ALL_PASS[2]]))).status).toBe(200);
    expect(h.target().result).toMatchObject({ passedCount: 2, testCount: 3 });
  });
  it("PY5 a Python syntax error under the historical policy is refused (the teacher decides), as for C#", async () => {
    const h = harness();
    await h.submit(pyAnswers());
    const job = await oneJob(h);
    const r = await h.post(evidence(job, [], { compile: { status: "compile-error", stderr: "SyntaxError: expected ':'" }, cases: [] }));
    expect(r.status).toBe(422); expect(r.jsonBody.code).toBe("DEVICE_COMPILE_ERROR");
  });
  it("PY6 the device languages are exactly C# and Python (version 1)", () => {
    expect(device().DEVICE_LANGUAGES).toEqual(["csharp", "python"]);
  });
});
