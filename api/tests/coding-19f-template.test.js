import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createFakeCodingExecutionProvider } from "./fixtures/fake-coding-execution-provider.js";

// Phase 19F — coding@3 (LOCKED TEMPLATE) on the SERVER, driven through the REAL handlers (student submission, coding grading callback
// / regrade, teacher review, practice run) against the in-memory blob container; the runner is a recording double that executes
// NOTHING. Invariants:
//   • the student answer carries ONLY gap values; the API reconstructs the official program from the PUBLISHED template (locked text +
//     bound values, byte for byte) and the runner receives EXACTLY that source — a client-sent source / locked text is never used;
//   • an invalid answer (missing / unknown / prototype gap, oversized gap, forged language, a full-source answer, a codeTemplate answer
//     on another version) is refused at ingest and NEVER reaches the runner;
//   • dispatch, callback, regrade and teacher evidence all bind through the same authority (fingerprint includes the template; the
//     answer hash is over the reconstructed source); coding@1 / coding@2 fingerprints are untouched; coding@4 fails closed;
//   • the practice run accepts gap values (never a source) for coding@3 and runs the server-reconstructed program;
//   • the student projection carries the strict template and the strict read-only code stimulus; nothing private.
// Fail-first on 784a59e: coding@3 is an unsupported version there (no template contract, no codeTemplate binding, no stimulus).
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = () => require_("../src/functions/student-submission.js");
const review = () => require_("../src/functions/assignment-review.js");
const grading = () => require_("../src/functions/coding-grading.js");
const official = () => require_("../src/lib/coding/official-grading.js");
const ingest = () => require_("../src/lib/draft-answers.js");
const structure = () => require_("../src/lib/exam-structure.js");
const sanitizer = () => require_("../src/lib/student-exam-sanitize.js");
const runRoute = () => require_("../src/functions/coding-run.js");
const sq = () => require_("../src/lib/shared-finalization/codingQuestion.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");

const LOCKED_HEAD = "a, b = map(int, input().split())\n";
const LOCKED_TAIL = "print('SUM=' + str(s))\n";
const TEMPLATE = () => ({ language: "python", segments: [{ kind: "locked", text: LOCKED_HEAD }, { kind: "editable", id: "gap1", starter: "s = 0\n" }, { kind: "locked", text: LOCKED_TAIL }] });
const V3_CFG = () => ({ ...JSON.parse(JSON.stringify(F.CFG)), allowedLanguages: ["python"], defaultLanguage: "python", starterCode: {}, template: TEMPLATE() });
const v3Q = (over = {}) => F.autoQ({ questionTypeVersion: 3, coding: V3_CFG(), answer: { ...F.autoQ().answer, compileErrorPolicy: "manualReview" }, ...over });
const tpl = (values, over = {}) => ({ kind: "codeTemplate", language: "python", languageVersion: 1, values, ...over });
const GOOD = () => tpl({ gap1: "s = a + b\n" });
const EXPECTED_SOURCE = LOCKED_HEAD + "s = a + b\n" + LOCKED_TAIL;

const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
function harness({ auto = v3Q(), fetch = F.runnerFetch(), ctx = F.seed({ a: F.assignment({}, { auto }) }) } = {}) {
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch };
  const cDeps = { getContainer: () => ctx.container, env: F.ENV };
  return {
    ctx, fetch,
    submit: answers => submission().handler(F.studentRequest(F.submitBody(answers)), sDeps, null),
    save: answers => submission().handler(F.studentRequest({ action: "saveDraft", answers, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 }), sDeps, null),
    regrade: action => grading().regradeHandler(F.teacherRequest("/api/coding/regrade", { action, assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" }), tDeps, null),
    callback: body => grading().callbackHandler(F.callbackRequest(body), cDeps, null),
    reviewGet: () => review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", null, "GET"), tDeps, null),
    doc: () => ctx.getJson(F.SUB),
    attempt: () => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1),
    target: () => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1).codingGrading.targets.auto1
  };
}
const examOf = auto => F.exam({ auto });

describe("19F-S1 — the REAL dispatch path: student values → server reconstruction → the runner receives the exact program", () => {
  it("S1 submit: the stored answer is ONLY the gap values; the ONE dispatched job carries the byte-exact reconstructed source", async () => {
    const h = harness();
    const r = await h.submit({ auto1: GOOD(), sa1: { kind: "text", value: "x" } });
    expect(r.status).toBe(200);
    expect(h.attempt().answers.auto1).toEqual(GOOD());                               // no `source`, no locked text stored
    const jobs = h.fetch.jobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe(EXPECTED_SOURCE);
    expect(jobs[0]).toMatchObject({ language: "python", languageVersion: 1 });
    expect(jobs[0].cases.every(c => Object.keys(c).sort().join() === "stdin,token")).toBe(true);   // hidden material never leaves the API
    expect(JSON.stringify(jobs[0])).not.toMatch(/SUM=CANARY|CANARY-REFERENCE|expectedOutput|gap1/);
    expect(h.target()).toMatchObject({ mode: "hiddenTests", state: "dispatched", revision: 1 });
  });
  it("S2 a forged client `source` / locked text next to the values is dropped at ingest and never dispatched", async () => {
    const h = harness();
    const forged = { ...GOOD(), source: "import os\nos.system('id')\n", segments: [{ kind: "locked", text: "import os\n" }], score: 10 };
    expect((await h.submit({ auto1: forged })).status).toBe(200);
    expect(h.attempt().answers.auto1).toEqual(GOOD());
    expect(h.fetch.jobs().map(j => j.source)).toEqual([EXPECTED_SOURCE]);
  });
  it("S3 newline / whitespace semantics: a gap value is inserted VERBATIM (CRLF, tabs, trailing spaces, no final newline) — nothing normalized", async () => {
    const h = harness();
    const value = "s = a\t+ b   \r\n# no newline at end";
    await h.submit({ auto1: tpl({ gap1: value }) });
    expect(h.fetch.jobs()[0].source).toBe(LOCKED_HEAD + value + LOCKED_TAIL);
  });
  it("S4 an all-blank answer is no-answer (the locked text alone is never an answer): nothing dispatched", async () => {
    const h = harness();
    await h.submit({ auto1: tpl({ gap1: "   \n" }) });
    expect(h.fetch.jobs()).toHaveLength(0);
  });
});

describe("19F-S2 — §23 security: an invalid answer is refused at ingest and NEVER reaches the runner", () => {
  const bad = {
    "missing gap": tpl({}),
    "unknown extra gap": tpl({ gap1: "s = a + b\n", gap2: "x" }),
    "unknown gap only": tpl({ other: "s = 1\n" }),
    "prototype key": JSON.parse('{"kind":"codeTemplate","language":"python","languageVersion":1,"values":{"gap1":"s=1\\n","__proto__":{"polluted":true}}}'),
    "constructor key": tpl({ gap1: "s=1\n", constructor: "x" }),
    "oversized gap (> 16 KB)": tpl({ gap1: "x".repeat(16385) }),
    "non-string value": tpl({ gap1: 42 }),
    "forged language": tpl({ gap1: "s = a + b\n" }, { language: "java" }),
    "unregistered language": tpl({ gap1: "s = a + b\n" }, { language: "javascript" }),
    "wrong language version": tpl({ gap1: "s = a + b\n" }, { languageVersion: 2 }),
    "values not an object": tpl(["s = a + b\n"]),
    "full-source answer on coding@3": F.code(LOCKED_HEAD + "s = a + b\n" + LOCKED_TAIL),
    "text answer on coding@3": { kind: "text", value: "s = a + b" }
  };
  for (const [name, answer] of Object.entries(bad)) {
    it("S5 " + name + " → dropped, no dispatch", async () => {
      const h = harness();
      expect((await h.submit({ auto1: answer })).status).toBe(200);
      expect(h.attempt().answers.auto1).toBeUndefined();
      expect(h.fetch.jobs()).toHaveLength(0);
      expect(({}).polluted).toBeUndefined();
    });
  }
  it("S6 the ingest reports precise refusal codes (bound to the published exam)", () => {
    const exam = examOf(v3Q());
    const r = ingest().normalizeDraftAnswers({ auto1: tpl({}) }, exam);
    expect(r.rejected).toEqual([{ id: "auto1", code: "CODE_TEMPLATE_GAP_MISSING" }]);
    expect(ingest().normalizeDraftAnswers({ auto1: tpl({ gap1: "a", x: "b" }) }, exam).rejected).toEqual([{ id: "auto1", code: "CODE_TEMPLATE_GAP_UNKNOWN" }]);
    expect(ingest().normalizeDraftAnswers({ auto1: tpl({ gap1: "x".repeat(16385) }) }, exam).rejected).toEqual([{ id: "auto1", code: "CODE_TEMPLATE_GAP_TOO_LARGE" }]);
    expect(ingest().normalizeDraftAnswers({ auto1: F.code("print(1)\n") }, exam).rejected).toEqual([{ id: "auto1", code: "CODE_QUESTION_MISMATCH" }]);
    expect(ingest().normalizeDraftAnswers({ auto1: tpl({ gap1: "a" }, { language: "java" }) }, exam).rejected).toEqual([{ id: "auto1", code: "CODE_LANGUAGE_NOT_ALLOWED" }]);
  });
  it("S7 a codeTemplate answer on coding@1 / coding@2, on another type, on an unknown id or inside a compound part is refused", () => {
    for (const v of [1, 2]) {
      const exam = examOf(F.autoQ({ questionTypeVersion: v, answer: { ...F.autoQ().answer, ...(v === 2 ? { compileErrorPolicy: "zero" } : {}) } }));
      expect(ingest().normalizeDraftAnswers({ auto1: GOOD() }, exam).rejected, "v" + v).toEqual([{ id: "auto1", code: "CODE_QUESTION_MISMATCH" }]);
    }
    const exam = examOf(v3Q());
    exam.sections[0].questions.push({ examQuestionId: "cq", presentationType: "compound", text: "م", marks: 2, parts: [{ id: "p1", type: "shortAnswer", text: "أ", marks: 2 }] });
    const r = ingest().normalizeDraftAnswers({ sa1: GOOD(), ghost: GOOD(), cq: { kind: "compound", parts: { p1: GOOD() } } }, exam);
    expect(r.rejected.map(x => x.id + ":" + x.code).sort()).toEqual(["cq.p1:CODE_QUESTION_MISMATCH", "ghost:CODE_QUESTION_MISMATCH", "sa1:CODE_QUESTION_MISMATCH"]);
    expect(r.answers.cq).toEqual({ kind: "compound", parts: {} });
  });
  it("S8 a published coding@3 question whose template is malformed binds NOTHING and is never graded or dispatched (fail closed)", async () => {
    const broken = v3Q({ coding: { ...V3_CFG(), template: { ...TEMPLATE(), segments: [{ kind: "locked", text: "a" }, { kind: "locked", text: "b" }] } } });
    const h = harness({ auto: broken });
    await h.submit({ auto1: GOOD() });
    expect(h.attempt().answers.auto1).toBeUndefined();
    expect(h.fetch.jobs()).toHaveLength(0);
    expect(official().targetAuthority(examOf(broken), { attemptNumber: 1, answers: { auto1: GOOD() }, questionGrades: [{ questionId: "auto1", maxMarks: 10, score: 0, manualReview: true }] }, "auto1", { assignmentId: F.AID, studentId: F.S1, revision: 1 })).toMatchObject({ ok: false, code: "QUESTION_INVALID" });
  });
  it("S9 version authority is exact: coding@4 is unsupported everywhere (never read as coding@3)", () => {
    const v4 = v3Q({ questionTypeVersion: 4 });
    // the SERVER's own catalog / validator / grader registry (not only the downstream guards) refuse coding@4
    const cat = require_("../src/lib/shared-finalization/questionTypeCatalog.js");
    expect(cat.currentQuestionTypeVersion("coding")).toBe(3);
    expect(cat.effectiveQuestionTypeVersion("coding", 4)).toBeUndefined();
    expect(require_("../src/lib/shared-finalization/questionTypeValidation.js").validateQuestionTypeNode(v4, "coding", 4).map(i => i.code)).toEqual(["UNSUPPORTED_QUESTION_TYPE_VERSION"]);
    expect(require_("../src/lib/question-type-graders.js").resolveGrader("coding", 4)).toBeUndefined();
    expect(sq().bindCodingTemplateAnswerToQuestion(GOOD(), v4)).toEqual({ ok: false, code: "CODE_QUESTION_MISMATCH" });
    expect(sq().codingTemplateOf(v4)).toBe(null);
    expect(official().targetAuthority(examOf(v4), { attemptNumber: 1, answers: { auto1: GOOD() }, questionGrades: [{ questionId: "auto1", maxMarks: 10, score: 0, manualReview: true }] }, "auto1", { assignmentId: F.AID, studentId: F.S1, revision: 1 }).ok).toBe(false);
  });
});

describe("19F-S3 — ONE authority for dispatch, callback, regrade and evidence", () => {
  const att = answers => ({ attemptNumber: 1, submittedAt: "2026-10-05T10:00:00.000Z", answers, questionGrades: [{ questionId: "auto1", maxMarks: 10, score: 0, manualReview: true }] });
  const ids = { assignmentId: F.AID, studentId: F.S1, revision: 1 };
  it("S10 the authority answer IS the reconstructed program; the answer hash is over it; the fingerprint binds the template", () => {
    const a = official().targetAuthority(examOf(v3Q()), att({ auto1: GOOD() }), "auto1", ids);
    expect(a.ok).toBe(true);
    expect(a.answer).toEqual({ kind: "code", language: "python", languageVersion: 1, source: EXPECTED_SOURCE });
    const crypto = require_("node:crypto");
    const { stableStringify } = require_("../src/lib/exam-canonical.js");
    expect(a.answerHash).toBe(crypto.createHash("sha256").update(stableStringify({ language: "python", languageVersion: 1, source: EXPECTED_SOURCE })).digest("hex"));
    // a changed LOCKED text (a republished template) changes the fingerprint and therefore the grading key
    const other = v3Q({ coding: { ...V3_CFG(), template: { ...TEMPLATE(), segments: [{ kind: "locked", text: LOCKED_HEAD }, { kind: "editable", id: "gap1", starter: "s = 0\n" }, { kind: "locked", text: "print(s)\n" }] } } });
    const b = official().targetAuthority(examOf(other), att({ auto1: GOOD() }), "auto1", ids);
    expect(b.questionFingerprint).not.toBe(a.questionFingerprint);
    expect(b.gradingKey).not.toBe(a.gradingKey);
    // a changed STARTER alone (public, not part of any submitted program) still re-keys: the template is authority material as published
    const starter = v3Q({ coding: { ...V3_CFG(), template: { ...TEMPLATE(), segments: [{ kind: "locked", text: LOCKED_HEAD }, { kind: "editable", id: "gap1", starter: "s = 1\n" }, { kind: "locked", text: LOCKED_TAIL }] } } });
    expect(official().targetAuthority(examOf(starter), att({ auto1: GOOD() }), "auto1", ids).questionFingerprint).not.toBe(a.questionFingerprint);
  });
  it("S10b defense in depth: even a stored raw answer carrying a forged `source` is rebuilt from the template by the authority", () => {
    const a = official().targetAuthority(examOf(v3Q()), att({ auto1: { ...GOOD(), source: "import os\nos.system('id')\n" } }), "auto1", ids);
    expect(a.ok).toBe(true);
    expect(a.answer.source).toBe(EXPECTED_SOURCE);
  });
  it("S11 coding@1 / coding@2 fingerprints carry NO template material (the byte-identical 17C / 17F-C2 recipe — a PIN)", () => {
    for (const v of [1, 2]) {
      const q = F.autoQ({ questionTypeVersion: v, answer: { ...F.autoQ().answer, ...(v === 2 ? { compileErrorPolicy: "manualReview" } : {}) } });
      const base = official().targetAuthority(examOf(q), att({ auto1: F.code("print(1)\n") }), "auto1", ids);
      expect(base.ok, "v" + v).toBe(true);
      const crypto = require_("node:crypto");
      const { stableStringify } = require_("../src/lib/exam-canonical.js");
      const g = { v: 1, questionId: "auto1", type: "coding", questionTypeVersion: v, mode: "hiddenTests", comparator: "trimTrailingWhitespace", tests: F.HIDDEN.map(t => ({ id: t.id, input: t.input, expectedOutput: t.expectedOutput, weight: t.weight })), limits: { timeMs: 2000, memoryMb: 128, outputBytes: Math.min(65536, require_("../src/lib/shared-finalization/codingContract.js").OFFICIAL_STDOUT_CAPTURE_BYTES) }, allowedLanguages: ["python", "java", "csharp"], maxMarks: 10, counted: true, ...(v === 2 ? { compileErrorPolicy: "manualReview" } : {}) };
      const recipe = crypto.createHash("sha256").update(stableStringify(g)).digest("hex");
      expect(base.questionFingerprint, "v" + v + " fingerprint recipe").toBe(recipe);
    }
  });
  it("S12 callback: the runner's evidence for the dispatched job grades the attempt through the same authority (weights, comparator)", async () => {
    const h = harness();
    await h.submit({ auto1: GOOD() });
    const job = h.fetch.jobs()[0];
    expect((await h.callback(F.callbackBody(job, F.CANARY.expected))).status).toBe(200);
    expect(h.target()).toMatchObject({ state: "complete", result: expect.objectContaining({ automaticScore: 10 }) });
  });
  it("S13 retry / force regrade re-derive the SAME reconstructed source from the stored values; a second job carries it again", async () => {
    const h = harness({ fetch: F.runnerFetch(() => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } })) });
    await h.submit({ auto1: GOOD() });
    expect(h.target().state).toBe("retryable");
    const h2fetch = F.runnerFetch();
    const h2 = harness({ ctx: h.ctx, fetch: h2fetch });
    const r = await h2.regrade("force");
    expect(r.status).toBe(200);
    expect(h2fetch.jobs().map(j => j.source)).toEqual([EXPECTED_SOURCE]);
    expect(h2.target().answerHash).toBe(h.target().answerHash);
  });
  it("S14 teacher evidence and the review projection show the SERVER-reconstructed program (never a client source)", async () => {
    const h = harness();
    await h.submit({ auto1: GOOD() });
    const r = await h.reviewGet();
    expect(r.status).toBe(200);
    const q = r.jsonBody.questions.find(x => x.questionId === "auto1");
    expect(q.studentAnswer).toEqual(GOOD());
    expect(q.codeTemplateReview).toEqual({ ok: true, language: "python", source: EXPECTED_SOURCE });
    expect(q.codingEvidence).toBeTruthy();
  });
  it("S15 a compile error on coding@3 follows its explicit policy (manualReview ⇒ teacher review, never an automatic zero)", async () => {
    const h = harness();
    await h.submit({ auto1: GOOD() });
    const job = h.fetch.jobs()[0];
    expect((await h.callback({ jobId: job.jobId, outcome: "completed", compile: { status: "compile-error", stderr: "SyntaxError: invalid syntax" }, cases: [] })).status).toBe(200);
    expect(h.target()).toMatchObject({ state: "reviewRequired", result: expect.objectContaining({ outcome: "compile-error", reviewRequired: true }) });
    const grade = h.attempt().questionGrades.find(g => g.questionId === "auto1");
    expect(grade.manualReview).toBe(true);
  });
});

describe("19F-S4 — answered predicate, practice run, projection", () => {
  it("S16 isResponseAnswered: a codeTemplate answer counts only when a gap holds non-blank text", () => {
    const { isResponseAnswered } = structure();
    expect(isResponseAnswered(GOOD())).toBe(true);
    expect(isResponseAnswered(tpl({ gap1: "  \n\t" }))).toBe(false);
    expect(isResponseAnswered(tpl({}))).toBe(false);
    expect(isResponseAnswered({ kind: "codeTemplate" })).toBe(false);
  });
  const RUN_AID = "asg-19f-run";
  const runSeed = () => createMemoryContainer({
    ["platform/users/" + F.S1 + ".json"]: { schemaVersion: 3, role: "student", userId: F.S1, displayName: "س", code: "S1", classId: "c1", active: true, archived: false, authVersion: 1 },
    "platform/classes/c1.json": { classId: "c1", name: "الصف", active: true, studentIds: [] },
    ["platform/assignments/" + RUN_AID + ".json"]: { ...F.assignment({ assignmentId: RUN_AID, classId: "c1" }, { auto: v3Q() }) },
    ["platform/submissions/" + RUN_AID + "/" + F.S1 + ".json"]: { ...F.activeDoc(), assignmentId: RUN_AID, classId: "c1" }
  });
  const runReq = body => { const text = JSON.stringify(body); return { method: "POST", url: "https://example.invalid/api/coding/run", params: {}, headers: new Headers({ "content-type": "application/json" }), query: new URLSearchParams(), text: async () => text, json: async () => JSON.parse(text) }; };
  const runHarness = () => {
    const ctx = runSeed(), provider = createFakeCodingExecutionProvider({ languages: [{ key: "python", languageVersion: 1 }] });
    return { provider, run: body => runRoute().runHandler(runReq(body), { container: ctx.container, requireStudentAuth: studentAuth, codingExecutionProvider: provider, env: {} }, null) };
  };
  const BASE = { assignmentId: RUN_AID, questionId: "auto1", language: "python", languageVersion: 1, stdin: "1 2\n" };
  it("S17 practice run with gap VALUES: the provider runs the server-reconstructed program", async () => {
    const h = runHarness();
    const r = await h.run({ ...BASE, values: { gap1: "s = a + b\n" } });
    expect(r.status).toBe(200);
    expect(h.provider.requests.map(q => q.source)).toEqual([EXPECTED_SOURCE]);
  });
  it("S18 practice run: a source for coding@3, values + source together, unknown / missing gaps, a values array → refused, nothing runs", async () => {
    const h = runHarness();
    expect((await h.run({ ...BASE, source: EXPECTED_SOURCE })).jsonBody.code).toBe("CODE_QUESTION_MISMATCH");
    expect((await h.run({ ...BASE, source: "x", values: { gap1: "x" } })).jsonBody.code).toBe("REQUEST_INVALID");
    expect((await h.run({ ...BASE, values: { gap1: "x", evil: "y" } })).jsonBody.code).toBe("CODE_TEMPLATE_GAP_UNKNOWN");
    expect((await h.run({ ...BASE, values: {} })).jsonBody.code).toBe("CODE_TEMPLATE_GAP_MISSING");
    expect((await h.run({ ...BASE, values: ["x"] })).jsonBody.code).toBe("REQUEST_INVALID");
    expect(h.provider.requests).toHaveLength(0);
  });
  it("S19 the student projection delivers the STRICT template (a malformed one is withheld); hidden material never leaves", () => {
    const exam = examOf(v3Q());
    const out = sanitizer().sanitizeExamForStudent(exam);
    const q = out.sections[0].questions[0];
    expect(q.coding.template).toEqual(TEMPLATE());
    expect(JSON.stringify(q)).not.toMatch(/CANARY|hiddenTests|expectedOutput|referenceSolutions|compileErrorPolicy|gradingMode/);
    const smuggled = examOf(v3Q({ coding: { ...V3_CFG(), template: { ...TEMPLATE(), x19f: "SECRET-19F" } } }));
    expect(sanitizer().sanitizeExamForStudent(smuggled).sections[0].questions[0].coding.template).toBeUndefined();
    // a secret-family key is removed by the canonical deny-list first; either way it never reaches a student
    const secret = examOf(v3Q({ coding: { ...V3_CFG(), template: { ...TEMPLATE(), expectedOutput: "SECRET-19F" } } }));
    expect(JSON.stringify(sanitizer().sanitizeExamForStudent(secret))).not.toContain("SECRET-19F");
    const seg = examOf(v3Q({ coding: { ...V3_CFG(), template: { ...TEMPLATE(), segments: [{ kind: "locked", text: LOCKED_HEAD, extra: 1 }, { kind: "editable", id: "gap1", starter: "" }] } } }));
    expect(sanitizer().sanitizeExamForStudent(seg).sections[0].questions[0].coding.template).toBeUndefined();
  });
});

describe("19F-S6 — the SERVER's AI re-verification never accepts trusted coding material", () => {
  it("S24 the shared server copy of verifyAiQuestionNode refuses an AI coding node with hidden tests / reference solutions / auto grading", () => {
    const ai = require_("../src/lib/shared-finalization/aiQuestionDraft.js");
    const draft = { intent: "coding", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "أصلح الخطأ", marks: 10, multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null, openResponse: null, codeStimulus: null, tableFill: null, coding: { mode: "fixBug", language: "python", starterCode: "print(sum(range(1, int(input()))))\n", publicExamples: [] } };
    const r = ai.normalizeAiQuestionDraft(draft, { request: "python" });
    expect(r.ok).toBe(true);
    expect(r.question.answer).toMatchObject({ hiddenTests: [], referenceSolutions: {}, gradingMode: "manual" });
    for (const answer of [{ ...r.question.answer, hiddenTests: [{ id: "h1", input: "4\n", expectedOutput: "6\n", weight: 1 }] }, { ...r.question.answer, referenceSolutions: { python: "x" } }, { ...r.question.answer, gradingMode: "hiddenTests" }]) {
      expect(ai.verifyAiQuestionNode({ ...r.question, answer })).toMatchObject({ ok: false, issues: [{ code: "AI_CODING_TRUSTED_MATERIAL_FORBIDDEN" }] });
    }
  });
});

describe("19F-S5 — the read-only code stimulus on the server (predict output / trace)", () => {
  const STIM = { language: "python", source: "x = 3\nfor i in range(2):\n    x = x * 2\nprint(x)\n", label: "البرنامج" };
  const mcq = (codeStimulus = STIM) => ({ examQuestionId: "m1", presentationType: "multipleChoice", text: "ما الناتج؟", marks: 2, codeStimulus, options: [{ text: "12" }, { text: "6" }], answer: { correctOptionIndex: 0 } });
  const examWith = (...questions) => ({ title: "t", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "س", gradingPolicy: "all", questions }] });
  it("S20 the strict stimulus reaches the student verbatim; the answer key does not", () => {
    const q = sanitizer().sanitizeExamForStudent(examWith(mcq())).sections[0].questions[0];
    expect(q.codeStimulus).toEqual(STIM);
    expect(q.answer).toEqual({});
  });
  it("S21 a stimulus smuggling ANY other field (an expected output, an answer) or with an unsupported language is withheld entirely", () => {
    for (const bad of [{ ...STIM, expectedOutput: "12" }, { ...STIM, answer: "12" }, { ...STIM, language: "javascript" }, { language: "python", source: "" }, { ...STIM, source: "x".repeat(16385) }, "print(1)", ["x"]]) {
      expect(sanitizer().sanitizeExamForStudent(examWith(mcq(bad))).sections[0].questions[0].codeStimulus, JSON.stringify(bad).slice(0, 60)).toBeUndefined();
    }
  });
  it("S22 a compound PART never carries a stimulus to the student; the compound question itself may", () => {
    const cq = { examQuestionId: "c1", presentationType: "compound", text: "م", marks: 2, codeStimulus: STIM, parts: [{ id: "p1", type: "tableFill", text: "أ", marks: 2, codeStimulus: STIM, tableHeaders: ["i", "x"], tableRows: [["0", ""]], fields: [{ id: "f1", kind: "text", row: 0, column: 1, correct: "6" }] }] };
    const q = sanitizer().sanitizeExamForStudent(examWith(cq)).sections[0].questions[0];
    expect(q.codeStimulus).toEqual(STIM);
    expect(q.parts[0].codeStimulus).toBeUndefined();
    expect(JSON.stringify(q.parts[0])).not.toContain('"correct"');
  });
  it("S23 the teacher review carries the question's stimulus", async () => {
    const a = F.assignment({}, { auto: v3Q(), short: false });
    a.examSnapshot.sections[0].questions.push(mcq());
    const h = harness({ ctx: F.seed({ a }) });
    await h.submit({ auto1: GOOD(), m1: { kind: "choice", index: 0 } });
    const r = await h.reviewGet();
    expect(r.jsonBody.questions.find(x => x.questionId === "m1").codeStimulus).toEqual(STIM);
  });
});
