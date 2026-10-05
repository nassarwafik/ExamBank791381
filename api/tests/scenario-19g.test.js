import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { gradeExam, gradeQuestion } from "../src/lib/assignment-grading.js";
import { selectGradedUnits, normalizeExamStructure } from "../src/lib/exam-structure.js";
import { hydrateBankAssets, normalizeBankAssetsForStorage } from "../src/lib/bank-asset-hydrate.js";
import { evaluateServerFinalization } from "../src/lib/server-finalization.js";
import { canonicalizeExamContent } from "../src/lib/exam-canonical.js";
import { studentExam } from "../src/functions/student-assignment.js";
import { handler as assignmentsHandler } from "../src/functions/manage-assignments.js";
import { SHARED_ENTRIES } from "../../scripts/build-shared-finalization.mjs";

// Phase 19G — Scenario & Source Assessment Engine on the SERVER (the only authority): the student sanitizer rebuilds `section.scenarios`
// through the ONE strict shared projection (a smuggled field withholds the whole scenario; the raw stored object never reaches the
// browser), the legacy `stimuli` / `question.stimulus` passthrough is narrowed to its allow-list, the real delivery / snapshot / review
// / finalization paths carry or refuse scenarios consistently, bank image sources are hydrated, and — the HARD invariant — grading,
// fingerprints, Runner payloads, parametric seeds and first-N selection are byte-identical with and without scenario membership.
// Fail-first on 2aa40da: no shared scenario module; the sanitizer spreads the section; the review payload has no scenario context.
// Grading / seed / payload equivalence tests are PINS (they already pass on the baseline because graders are context-free) and are
// kept as the regression gate for the whole phase.
process.env.BUILDER_SESSION_SECRET = process.env.BUILDER_SESSION_SECRET || "test-signing-secret-19g";   // bank delivery URLs are HMAC-signed
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const official = () => require_("../src/lib/coding/official-grading.js");
const review = () => require_("../src/functions/assignment-review.js");
const engine = require_("../src/lib/shared-finalization/networkCliEngine.js");
const clone = x => JSON.parse(JSON.stringify(x));

const TEXT = (over = {}) => ({ id: "src-text", version: 1, kind: "text", title: "النص", text: "اقرأ النص التالي ثم أجب.", ...over });
const CODE = (over = {}) => ({ id: "src-code", version: 1, kind: "code", title: "البرنامج", language: "python", source: "x = 1\nprint(x)\n", ...over });
const TABLE = () => ({ id: "src-tbl", version: 1, kind: "table", title: "جدول", columnHeaders: ["أ", "ب"], rows: [["1", "2"]] });
const IMAGE = (image = { dataUrl: "data:image/png;base64,AAAA", origin: "uploaded", contentType: "image/png" }) => ({ id: "src-img", version: 1, kind: "image", alt: "مخطط", image });
const BANK = { id: "b1", origin: "bank", blobName: "bank/images/b1.png", contentType: "image/png" };
const scn = (questionIds, over = {}) => ({ id: "scn-1", version: 1, title: "سيناريو", instructions: "اعتمد على المصادر.", sources: [TEXT()], questionIds, ...over });
const mcq = (id, over = {}) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "س " + id, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 }, ...over });
const section = (questions, scenarios, over = {}) => ({ id: "s1", title: "القسم", gradingPolicy: "all", stimuli: {}, questions, ...(scenarios === undefined ? {} : { scenarios }), ...over });
const exam = (sections, over = {}) => ({ examId: "E19G", title: "امتحان", metadata: {}, presentationTheme: "classic", sections, ...over });
const SMUGGLED = ["answer", "answers", "correctAnswer", "modelAnswer", "solution", "referenceSolution", "expected", "expectedOutput", "expectedOutputs", "hiddenTests", "tests", "grading", "gradingMode", "score", "marks", "rubric", "rubricInternal", "teacherNotes", "privateNotes", "feedbackPrivate", "evidence", "geometry", "mapping", "runnerPayload", "callback", "callbackKey", "secret", "token", "headers"];
const g = (r, id) => r.questions.find(x => x.questionId === id);
// with / without: the SAME questions and answers; only the section's scenario membership differs
const twin = (questions, scenarios) => [exam([section(questions, scenarios)]), exam([section(questions)])];

describe("19G-S1 — the student sanitizer rebuilds scenarios through the strict shared projection", () => {
  it("S1 a valid scenario reaches the student as the canonical copy (every source kind); nothing else is invented", () => {
    const sc = scn(["q1", "q2"], { sources: [TEXT(), CODE(), TABLE(), IMAGE()] });
    const out = sanitizeExamForStudent(exam([section([mcq("q1"), mcq("q2"), mcq("q3")], [sc])]));
    expect(out.sections[0].scenarios).toEqual([sc]);
    expect(out.sections[0].questions.map(q => q.examQuestionId)).toEqual(["q1", "q2", "q3"]);
    expect(out.sections[0].questions.every(q => !("scenarioId" in q) && !("scenario" in q))).toBe(true);
    expect(out.sections[0].questions[0].answer).toEqual({});
  });
  it("S2 a section without scenarios gets no `scenarios` key (byte-identical delivery for every existing exam)", () => {
    const out = sanitizeExamForStudent(exam([section([mcq("q1")])]));
    expect("scenarios" in out.sections[0]).toBe(false);
  });
  for (const key of SMUGGLED) it("S3 a source smuggling `" + key + "` withholds the whole scenario; the value never reaches the student", () => {
    const out = sanitizeExamForStudent(exam([section([mcq("q1"), mcq("q2")], [scn(["q1", "q2"], { sources: [TEXT({ [key]: "LEAK-" + key })] })])]));
    expect(out.sections[0].scenarios).toEqual([]);
    expect(JSON.stringify(out)).not.toContain("LEAK-");
  });
  for (const key of SMUGGLED) it("S4 a scenario smuggling `" + key + "` at scenario level is withheld", () => {
    const out = sanitizeExamForStudent(exam([section([mcq("q1"), mcq("q2")], [scn(["q1", "q2"], { [key]: "LEAK-" + key })])]));
    expect(JSON.stringify(out)).not.toContain("LEAK-");
  });
  it("S5 case / separator variants and nesting never slip through (exact-key rebuild)", () => {
    for (const bad of [{ Correct_Answer: "LEAK" }, { "hidden-tests": "LEAK" }, { "expected output": "LEAK" }, { meta: { hiddenTests: "LEAK" } }, { __proto__: { a: 1 }, constructor: "LEAK" }]) {
      const out = sanitizeExamForStudent(exam([section([mcq("q1")], [scn(["q1"], { sources: [{ ...TEXT(), ...bad }] })])]));
      expect(JSON.stringify(out), JSON.stringify(bad)).not.toContain("LEAK");
    }
  });
  it("S6 a future scenario version / future source kind / malformed table / unsafe image URL / missing alt fail CLOSED", () => {
    const cases = [
      [scn(["q1"], { version: 2 })], [scn(["q1"], { sources: [{ id: "v", version: 1, kind: "video", url: "https://x/y.mp4" }] })],
      [scn(["q1"], { sources: [{ ...TABLE(), rows: [[{ answer: "x" }, "2"]] }] })], [scn(["q1"], { sources: [IMAGE({ dataUrl: "javascript:alert(1)" })] })],
      [scn(["q1"], { sources: [IMAGE({ dataUrl: "data:image/svg+xml,<svg onload=alert(1)>" })] })], [scn(["q1"], { sources: [{ ...IMAGE(), alt: "" }] })],
      [{ ...scn(["q1"]), questionIds: ["q1", "q1"] }], [scn(["q1", "ghost"])]
    ];
    for (const scenarios of cases) {
      const out = sanitizeExamForStudent(exam([section([mcq("q1")], scenarios)]));
      expect(out.sections[0].scenarios, JSON.stringify(scenarios).slice(0, 80)).toEqual([]);
    }
    expect(sanitizeExamForStudent(exam([section([mcq("q1")], { a: 1 })])).sections[0].scenarios).toEqual([]);   // not an array ⇒ nothing
  });
  it("S7 cross-section membership is impossible for the student: a scenario naming a question of another section is withheld", () => {
    const out = sanitizeExamForStudent(exam([section([mcq("q1")], [scn(["q1", "z1"])]), section([mcq("z1")], undefined, { id: "s2" })]));
    expect(out.sections[0].scenarios).toEqual([]);
  });
  it("S8 only the invalid scenario is withheld; a question shared by two scenarios withholds both", () => {
    const out = sanitizeExamForStudent(exam([section([mcq("q1"), mcq("q2"), mcq("q3")], [scn(["q1"], { id: "a" }), scn(["q2"], { id: "b", version: 9 }), scn(["q3"], { id: "c" })])]));
    expect(out.sections[0].scenarios.map(s => s.id)).toEqual(["a", "c"]);
    const shared = sanitizeExamForStudent(exam([section([mcq("q1"), mcq("q2"), mcq("q3")], [scn(["q1", "q2"], { id: "a" }), scn(["q2", "q3"], { id: "b" })])]));
    expect(shared.sections[0].scenarios).toEqual([]);
  });
  it("S9 the REAL delivery function (studentExam = hydrate → sanitize) delivers a bank image source with a SIGNED delivery URL and no credential", () => {
    const sc = scn(["q1"], { sources: [IMAGE(BANK)] });
    const out = studentExam(exam([section([mcq("q1")], [sc])]));
    const img = out.sections[0].scenarios[0].sources[0].image;
    expect(img).toMatchObject({ id: "b1", origin: "bank", blobName: "bank/images/b1.png", contentType: "image/png" });
    expect(img.dataUrl).toMatch(/^\/api\/question-image\?blob=bank%2Fimages%2Fb1\.png&exp=\d+&sig=[A-Za-z0-9_-]+$/);
    expect(Object.keys(img).sort()).toEqual(["blobName", "contentType", "dataUrl", "id", "origin"]);
  });
});

describe("19G-S10 — the legacy stimulus passthrough is narrowed to its allow-list (narrowest safe fix, existing pins kept)", () => {
  it("S10 section.stimuli[g].answer / solution / hiddenTests never reach the student; title / text / image.dataUrl / activity still do", () => {
    const stim = { title: "طوبولوجيا", text: "ثلاثة موجّهات", image: { dataUrl: "data:image/png;base64,AAA", prompt: "P", externalUrl: "https://x" }, activity: { id: "a1", kind: "simulation", key: "k", version: 1, config: { start: 0, correct_answer: "LEAK-A" } }, answer: "LEAK-1", solution: "LEAK-2", hiddenTests: ["LEAK-3"], teacherNotes: "LEAK-4" };
    const out = sanitizeExamForStudent(exam([section([mcq("q1", { groupId: "g1" })], undefined, { stimuli: { g1: stim } })]));
    const s = out.sections[0].stimuli.g1;
    expect(s).toEqual({ title: "طوبولوجيا", text: "ثلاثة موجّهات", image: { dataUrl: "data:image/png;base64,AAA" }, activity: { id: "a1", kind: "simulation", key: "k", version: 1, config: { start: 0 } } });
    expect(JSON.stringify(out)).not.toContain("LEAK-");
  });
  it("S11 a non-string title / text and a non-object image are dropped, never forwarded", () => {
    const out = sanitizeExamForStudent(exam([section([mcq("q1")], undefined, { stimuli: { g1: { title: { answer: "LEAK" }, text: 5, image: "data:image/png;base64,AAA" } } })]));
    expect(out.sections[0].stimuli.g1).toEqual({});
    expect(JSON.stringify(out)).not.toContain("LEAK");
  });
  it("S12 a question-level `stimulus` fallback object is rebuilt through the same allow-list (question and compound part)", () => {
    const q = mcq("q1", { stimulus: { title: "ت", text: "ن", answer: "LEAK-Q" } });
    const comp = { examQuestionId: "c1", presentationType: "compound", text: "م", marks: 2, parts: [{ id: "p1", type: "shortAnswer", text: "أ", marks: 2, answer: { text: "x" }, stimulus: { text: "ن", solution: "LEAK-P" } }] };
    const out = sanitizeExamForStudent(exam([section([q, comp])]));
    expect(out.sections[0].questions[0].stimulus).toEqual({ title: "ت", text: "ن" });
    expect(out.sections[0].questions[1].parts[0].stimulus).toEqual({ text: "ن" });
    expect(JSON.stringify(out)).not.toContain("LEAK-");
  });
});

describe("19G-S13 — grading equivalence (PIN): grade(Q, A) standalone === grade(Q, A) inside a scenario, through the REAL gradeExam", () => {
  const PARA_CTX = { parametric: { assignmentId: "asg-19b", studentId: "stu-1", attemptNumber: 1 } };
  const IMG = { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,iVBORw0KGgo=", origin: "uploaded", contentType: "image/png" }] };
  const lv = (id, label, points) => ({ id, label, points, description: "" });
  const cases = [
    ["multipleChoice", mcq("x1"), { x1: { kind: "choice", index: 1 } }],
    ["multipleSelect", { examQuestionId: "x1", presentationType: "multipleSelect", questionTypeVersion: 1, text: "s", marks: 4, options: [{ id: "o1", text: "TCP" }, { id: "o2", text: "UDP" }, { id: "o3", text: "IP" }], answer: { correctOptionIds: ["o1", "o2"], scoring: "partialNoPenalty" } }, { x1: { kind: "multiChoice", optionIds: ["o1", "o3"] } }],
    ["numericResponse", { examQuestionId: "x1", presentationType: "numericResponse", questionTypeVersion: 1, text: "g", marks: 3, numeric: { unitRequired: true }, answer: { mode: "tolerance", expected: 9.8, tolerance: 0.1, unit: "m/s²" } }, { x1: { kind: "numeric", value: "9.9", unit: "m/s²" } }],
    ["inlineCloze", { examQuestionId: "x1", presentationType: "inlineCloze", questionTypeVersion: 1, text: "أكمل", marks: 6, inlineCloze: { v: 1, segments: [{ type: "text", text: "يعمل " }, { type: "blank", id: "b1", control: "text" }, { type: "text", text: " في " }, { type: "blank", id: "b2", control: "dropdown", options: [{ id: "o1", label: "Physical" }, { id: "o2", label: "Data Link" }] }] }, answer: { scoring: "proportional", blanks: { b1: { accepted: ["IP"], caseSensitive: false }, b2: { correctOptionId: "o2" } } } }, { x1: { kind: "fields", values: { b1: "ip", b2: "o1" } } }],
    ["parametricNumeric", { examQuestionId: "pq1", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "احسب ناتج ضرب {{a}} في {{b}}.", marks: 4, parametric: { v: 1, generatorVersion: 1, variables: [{ id: "a", kind: "int", min: 2, max: 10, step: 1 }, { id: "b", kind: "int", min: 5, max: 20, step: 1 }], constraints: ["a < b"], response: { unit: "none" } }, answer: { expression: "a * b", mode: "tolerance", tolerance: 0 } }, { pq1: { kind: "numeric", value: "130" } }],
    ["hotspot", { examQuestionId: "h1", presentationType: "hotspot", questionTypeVersion: 1, text: "حدّد", marks: 3, image: clone(IMG), hotspot: { v: 1, mode: "multiple", selections: 3, alt: "مخطط" }, answer: { scoring: "proportional", regions: [{ id: "r1", shape: { kind: "rect", x: 0.137, y: 0.113, width: 0.181, height: 0.173 } }, { id: "r2", shape: { kind: "circle", cx: 0.617, cy: 0.311, r: 0.093 } }, { id: "r3", shape: { kind: "polygon", points: [{ x: 0.413, y: 0.611 }, { x: 0.719, y: 0.607 }, { x: 0.557, y: 0.893 }] } }] } }, { h1: { kind: "hotspot", points: [{ x: 0.2, y: 0.2 }, { x: 0.62, y: 0.31 }] } }],
    ["labelDiagram", { examQuestionId: "d1", presentationType: "labelDiagram", questionTypeVersion: 1, text: "سمِّ", marks: 3, image: clone(IMG), labelDiagram: { v: 1, alt: "OSI", allowReuse: false, zones: [{ id: "z1", shape: { kind: "rect", x: 0.1, y: 0.1, width: 0.2, height: 0.1 }, name: "العليا" }, { id: "z2", shape: { kind: "rect", x: 0.1, y: 0.3, width: 0.2, height: 0.1 } }], labels: [{ id: "l-app", text: "Application" }, { id: "l-net", text: "Network" }, { id: "l-phy", text: "Physical" }] }, answer: { scoring: "proportional", correctLabelByZone: { z1: "l-app", z2: "l-net" } } }, { d1: { kind: "fields", values: { z1: "l-app", z2: "l-phy" } } }],
    ["openResponse", { examQuestionId: "o1", presentationType: "openResponse", questionTypeVersion: 1, text: "قارن", marks: 6, openResponse: { v: 1, profile: "compare", instructions: "قارن.", response: { minChars: 0, maxChars: 500 }, studentRubricVisibility: "visible" }, answer: { rubric: { v: 1, criteria: [{ id: "accuracy", title: "الدقة", description: "", maxPoints: 4, allowCustomPoints: false, guidance: "G", levels: [lv("full", "كامل", 4), lv("none", "لا", 0)] }, { id: "reasoning", title: "التعليل", description: "", maxPoints: 2, allowCustomPoints: true, guidance: "", levels: [lv("full", "كامل", 2), lv("none", "لا", 0)] }] }, modelAnswer: "M" } }, { o1: { kind: "text", value: "TCP موثوق." } }],
    ["networkCli", { examQuestionId: "n1", presentationType: "networkCli", questionTypeVersion: 1, text: "اضبط", marks: 10, networkCli: { device: "switch", initialState: { v: 1, device: "switch", hostname: "LAB-SW", vlans: {}, interfaces: {} } }, answer: { targetState: { hostname: "BR1-SW1", vlans: { "20": { name: "SALES" } } }, scoring: "proportional" } }, (() => { const commands = ["enable", "configure terminal", "hostname BR1-SW1", "end"]; return { n1: { kind: "networkCli", commands, state: engine.replayCommands({ v: 1, device: "switch", hostname: "LAB-SW", vlans: {}, interfaces: {} }, commands).session.state } }; })()],
    ["coding (provisional)", F.autoQ(), { auto1: F.code("print(1)\n") }]
  ];
  for (const [name, question, answers] of cases) it("S13 " + name + ": identical per-question grade and totals with / without membership", () => {
    const id = question.examQuestionId;
    const filler = mcq("f1");
    const [withScn, without] = twin([question, filler], [scn([id, "f1"], { sources: [TEXT(), CODE()] })]);
    const a = gradeExam(withScn, { ...answers, f1: { kind: "choice", index: 1 } }, PARA_CTX), b = gradeExam(without, { ...answers, f1: { kind: "choice", index: 1 } }, PARA_CTX);
    expect(g(a, id)).toEqual(g(b, id));
    expect([a.score, a.totalMarks, a.manualReviewMarks, a.finalized]).toEqual([b.score, b.totalMarks, b.manualReviewMarks, b.finalized]);
    expect(gradeQuestion({ ...question, scenarioId: "scn-1" }, answers[id], PARA_CTX)).toEqual(gradeQuestion(question, answers[id], PARA_CTX));   // an extra key is never read
    expect(g(a, id).maxMarks).toBeGreaterThan(0);
  });
  it("S14 a scenario contributes ZERO marks: totals and question counts are those of the canonical questions only", () => {
    const [withScn, without] = twin([mcq("q1"), mcq("q2")], [scn(["q1", "q2"])]);
    expect(gradeExam(withScn, {}).totalMarks).toBe(gradeExam(without, {}).totalMarks);
    expect(gradeExam(withScn, {}).questions.length).toBe(2);
    expect(normalizeExamStructure(withScn).sections[0].questions.length).toBe(2);
  });
  it("S15 openResponse rubric authority: the official rubric score is identical with / without membership (server scoring)", () => {
    const { scoreOpenResponseRubric } = require_("../src/lib/shared-finalization/openResponseQuestion.js");
    const q = cases.find(c => c[0] === "openResponse")[1];
    const awards = { accuracy: { levelId: "full" }, reasoning: { points: 1 } };
    expect(scoreOpenResponseRubric(q, awards)).toEqual(scoreOpenResponseRubric({ ...q, scenarioId: "scn-1" }, awards));
    expect(scoreOpenResponseRubric(q, awards)).toMatchObject({ ok: true, score: 5 });
  });
});

describe("19G-S16 — first-N / capScore stay PER CANONICAL UNIT (PIN): a scenario is never atomic for scoring", () => {
  const qs = [mcq("q1"), mcq("q2"), mcq("q3"), mcq("q4")];
  const answers = { q1: { kind: "choice", index: 1 }, q2: { kind: "choice", index: 0 }, q4: { kind: "choice", index: 1 } };
  it("S16 firstNAnswered counts the first N answered units in section order, with or without a scenario spanning them", () => {
    const sec = pol => section(qs, [scn(["q2", "q3"])], { gradingPolicy: "firstNAnswered", requiredAnswers: 2, answerUnit: "question", maxMarks: 4, ...pol });
    const withScn = exam([sec()]), without = exam([{ ...sec(), scenarios: undefined }]);
    expect([...selectGradedUnits(normalizeExamStructure(withScn).sections[0], answers).countedKeys].sort()).toEqual(["q1", "q2"]);
    expect(gradeExam(withScn, answers).questions.map(q => [q.questionId, q.score, q.countedMaxMarks ?? q.maxMarks])).toEqual(gradeExam(without, answers).questions.map(q => [q.questionId, q.score, q.countedMaxMarks ?? q.maxMarks]));
    expect(gradeExam(withScn, answers).score).toBe(gradeExam(without, answers).score);
  });
  it("S17 capScore caps the raw sum identically", () => {
    const sec = () => section(qs, [scn(["q1", "q2", "q3", "q4"])], { gradingPolicy: "capScore", maxMarks: 3 });
    expect(gradeExam(exam([sec()]), answers).score).toBe(gradeExam(exam([{ ...sec(), scenarios: undefined }]), answers).score);
    expect(gradeExam(exam([sec()]), answers).totalMarks).toBe(3);
  });
});

describe("19G-S18 — parametric determinism and coding isolation (PINS through the real authorities)", () => {
  const { parametricReviewInstance } = require_("../src/lib/shared-finalization/parametricNumericQuestion.js");
  const pq = { examQuestionId: "pq1", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "احسب ناتج ضرب {{a}} في {{b}}.", marks: 4, parametric: { v: 1, generatorVersion: 1, variables: [{ id: "a", kind: "int", min: 2, max: 10, step: 1 }, { id: "b", kind: "int", min: 5, max: 20, step: 1 }], constraints: ["a < b"], response: { unit: "none" } }, answer: { expression: "a * b", mode: "tolerance", tolerance: 0 } };
  const identity = { assignmentId: "asg-19b", studentId: "stu-1", attemptNumber: 1, questionKey: "pq1" };
  it("S18 the same published question + version + seed renders the identical instance (text, values, digest) with / without membership", () => {
    const a = parametricReviewInstance(pq, identity), b = parametricReviewInstance({ ...pq, scenarioId: "scn-1" }, identity);
    expect(a).toEqual(b);
    const [withScn, without] = twin([pq, mcq("f1")], [scn(["pq1", "f1"])]);
    const sa = sanitizeExamForStudent(withScn, { parametric: identity }).sections[0].questions[0], sb = sanitizeExamForStudent(without, { parametric: identity }).sections[0].questions[0];
    expect(sa.parametric).toEqual(sb.parametric); expect(sa.text).toBe(sb.text);
    expect(sa.parametric.status).toBe("ready");
  });
  it("S19 coding@1 / @2 / @3: fingerprint, grading key, answer hash and the Runner job are byte-identical with / without a scenario (incl. a CODE source)", () => {
    const att = answers => ({ attemptNumber: 1, submittedAt: "2026-10-05T10:00:00.000Z", answers, questionGrades: [{ questionId: "auto1", maxMarks: 10, score: 0, manualReview: true }] });
    const ids = { assignmentId: F.AID, studentId: F.S1, revision: 1 };
    const TEMPLATE = { language: "python", segments: [{ kind: "locked", text: "a, b = map(int, input().split())\n" }, { kind: "editable", id: "gap1", starter: "s = 0\n" }, { kind: "locked", text: "print(s)\n" }] };
    const variants = [
      [F.autoQ(), F.code("print(1)\n")],
      [F.autoQ({ questionTypeVersion: 2, answer: { ...F.autoQ().answer, compileErrorPolicy: "manualReview" } }), F.code("print(1)\n")],
      [F.autoQ({ questionTypeVersion: 3, coding: { ...clone(F.autoQ().coding), allowedLanguages: ["python"], defaultLanguage: "python", starterCode: {}, template: TEMPLATE }, answer: { ...F.autoQ().answer, compileErrorPolicy: "manualReview" } }), { kind: "codeTemplate", language: "python", languageVersion: 1, values: { gap1: "s = a + b\n" } }]
    ];
    for (const [q, answer] of variants) {
      const plain = F.exam({ auto: q });
      const withScn = { ...plain, sections: [{ ...plain.sections[0], scenarios: [scn(["auto1", "sa1"], { sources: [CODE(), TEXT()] })] }] };
      const a = official().targetAuthority(withScn, att({ auto1: answer }), "auto1", ids), b = official().targetAuthority(plain, att({ auto1: answer }), "auto1", ids);
      expect(a.ok, "v" + q.questionTypeVersion).toBe(true);
      expect([a.questionFingerprint, a.gradingKey, a.answerHash, a.answer]).toEqual([b.questionFingerprint, b.gradingKey, b.answerHash, b.answer]);
      expect(official().buildOfficialRunnerJob(a, "job-1")).toEqual(official().buildOfficialRunnerJob(b, "job-1"));
      expect(JSON.stringify(official().buildOfficialRunnerJob(a, "job-1"))).not.toMatch(/scn-1|سيناريو|src-code|src-text/);
    }
  });
  it("S20 a CODE source linked to NON-coding questions produces ZERO Runner jobs (the dispatch gate is the canonical `coding` type only)", () => {
    const e = exam([section([mcq("q1"), { examQuestionId: "o1", presentationType: "shortAnswer", text: "ما الناتج؟", marks: 2, answer: { text: "1" } }], [scn(["q1", "o1"], { sources: [CODE()] })])]);
    const attempt = { attemptNumber: 1, submittedAt: "2026-10-05T10:00:00.000Z", answers: { q1: { kind: "choice", index: 1 }, o1: { kind: "text", value: "1" } }, questionGrades: [{ questionId: "q1", maxMarks: 2, score: 2 }, { questionId: "o1", maxMarks: 2, score: 0, manualReview: true }] };
    const plan = official().planCodingGrading(e, attempt, { assignmentId: "a", studentId: "s", now: "2026-10-05T10:00:01.000Z" });
    expect(plan).toEqual({ dispatch: [] });
    expect("codingGrading" in attempt).toBe(false);
  });
});

describe("19G-S21 — snapshot, finalization, canonical content and teacher review", () => {
  const AID2 = "asg-19g";
  function deps(store) {
    const uploads = [];
    return { uploads, deps: { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ({}), downloadJsonOrNull: async (_c, key) => (store.has(key) ? structuredClone(store.get(key)) : null), uploadJson: async (_c, key, value) => { store.set(key, value); uploads.push({ key, value }); }, listJson: async () => [], mutateJsonWithRetry: async () => { throw new Error("not used"); }, recordAuditEvent: async () => {}, ensurePublishedAssignmentIndexed: async () => {} } };
  }
  it("S21 assignment creation (REAL handler) keeps a valid scenario canonical in the immutable snapshot; the student copy is the strict projection", async () => {
    const store = new Map([["platform/classes/c1.json", { classId: "c1", name: "الصف", active: true }]]);
    const { uploads, deps: d } = deps(store);
    const snap = exam([section([mcq("q1"), mcq("q2")], [scn(["q1", "q2"], { sources: [TEXT(), IMAGE(BANK)] })])]);
    const r = await assignmentsHandler({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "create", classId: "c1", title: "واجب", examSnapshot: snap, publish: true }) }, d);
    expect(r.status).toBe(200);
    const stored = uploads[0].value.examSnapshot;
    expect(stored.sections[0].scenarios).toEqual(snap.sections[0].scenarios);
    expect(JSON.stringify(stored)).not.toMatch(/sig=|exp=/);                         // durable identity only, never a signed URL
    const delivered = studentExam(stored);
    expect(delivered.sections[0].scenarios[0].sources[1].image.dataUrl).toMatch(/^\/api\/question-image\?/);
  });
  it("S22 canonical content keeps scenarios (they are content) and the storage normalizer reduces a signed bank source to its durable form", () => {
    const signed = { ...BANK, dataUrl: "/api/question-image?blob=x&exp=1&sig=abc" };
    const c = canonicalizeExamContent(exam([section([mcq("q1")], [scn(["q1"], { sources: [IMAGE(signed)] })])]));
    expect(c.sections[0].scenarios[0].sources[0].image).toEqual(BANK);
    expect(normalizeBankAssetsForStorage(exam([section([mcq("q1")], [scn(["q1"], { sources: [IMAGE(signed)] })])])).sections[0].scenarios[0].sources[0].image).toEqual(BANK);
    expect(hydrateBankAssets(exam([section([mcq("q1")], [scn(["q1"], { sources: [IMAGE(BANK)] })])])).sections[0].scenarios[0].sources[0].image.dataUrl).toMatch(/^\/api\/question-image\?/);
  });
  it("S23 the SERVER finalization authority (generated shared build) blocks an invalid scenario and admits a valid one", () => {
    expect(SHARED_ENTRIES).toContain("src/scenarioSource.ts");
    expect(evaluateServerFinalization(exam([section([mcq("q1"), mcq("q2")], [scn(["q1", "q2"])])])).canFinalize).toBe(true);
    for (const scenarios of [[scn(["q1", "q2"], { version: 2 })], [scn(["q1", "zz"])], [scn(["q1"], { sources: [{ ...IMAGE(), alt: "" }] })], [scn(["q1"], { sources: [TEXT({ answer: "x" })] })], [scn(["q1"], { id: "a" }), scn(["q2"], { id: "a" })]]) {
      const d = evaluateServerFinalization(exam([section([mcq("q1"), mcq("q2")], scenarios)]));
      expect(d.canFinalize, JSON.stringify(scenarios).slice(0, 60)).toBe(false);
      expect(d.structuralErrors.some(i => /^(SCENARIO|SOURCE)/.test(i.code))).toBe(true);
    }
  });
  it("S24 the REAL teacher review carries the scenario CONTEXT (title, instructions, sources) once per scenario + a per-question scenarioId — and no server secret", async () => {
    const o1 = { examQuestionId: "o1", presentationType: "openResponse", questionTypeVersion: 1, text: "قارن.", marks: 6, openResponse: { v: 1, profile: "sourceBased", instructions: "اعتمد على النص.", response: { minChars: 0, maxChars: 500 }, studentRubricVisibility: "hidden" }, answer: { rubric: { v: 1, criteria: [{ id: "c1", title: "الدقة", description: "", maxPoints: 6, allowCustomPoints: false, guidance: "PRIVATE-GUIDE", levels: [{ id: "full", label: "كامل", points: 6, description: "" }, { id: "none", label: "لا", points: 0, description: "" }] }] }, modelAnswer: "MODEL" } };
    const snap = { ...F.exam({ auto: F.autoQ() }), sections: [{ ...F.exam().sections[0], questions: [F.autoQ(), F.shortQ(), o1], scenarios: [scn(["sa1", "o1"], { sources: [TEXT(), CODE(), TABLE()] })] }] };
    const att = { attemptNumber: 1, submittedAt: "2026-10-05T10:00:00.000Z", startedAt: F.STARTED, endedAt: "2026-10-05T10:00:00.000Z", answers: { sa1: { kind: "text", value: "x" }, o1: { kind: "text", value: "جواب" } }, questionGrades: [{ questionId: "auto1", maxMarks: 10, score: 0, manualReview: true }, { questionId: "sa1", maxMarks: 2, score: 2 }, { questionId: "o1", maxMarks: 6, score: 0, manualReview: true }], score: 2, totalMarks: 18, percentage: 11, manualReviewMarks: 16, finalized: false };
    const ctx = F.seed({ a: F.assignment({ examSnapshot: snap }), doc: F.activeDoc({}, { attempts: [att], activeAttempt: null }) });
    const r = await review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", null, "GET"), { requireBuilderAuth: () => ({ ok: true, user: { sub: "t" } }), getContainer: () => ctx.container, env: F.ENV }, null);
    expect(r.status).toBe(200);
    expect(r.jsonBody.scenarios).toEqual([{ ...scn(["sa1", "o1"], { sources: [TEXT(), CODE(), TABLE()] }), sectionId: "s1" }]);
    const byId = Object.fromEntries(r.jsonBody.questions.map(q => [q.questionId, q]));
    expect(byId.sa1.scenarioId).toBe("scn-1"); expect(byId.o1.scenarioId).toBe("scn-1"); expect("scenarioId" in byId.auto1).toBe(false);
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/gradingKey|answerHash|"jobId"|callbackKey|CODING_RUNNER_HMAC_KEY|CODING_GRADING_CALLBACK_HMAC_KEY/);
    expect(JSON.stringify(r.jsonBody.scenarios)).not.toMatch(/PRIVATE-GUIDE|MODEL/);
  });
  it("S25 a malformed stored scenario is withheld from the review context too (fail closed, never the raw object)", async () => {
    const snap = { ...F.exam(), sections: [{ ...F.exam().sections[0], scenarios: [scn(["sa1"], { sources: [TEXT({ answer: "LEAK-REVIEW" })] })] }] };
    const att = { attemptNumber: 1, submittedAt: "2026-10-05T10:00:00.000Z", answers: {}, questionGrades: [], score: 0, totalMarks: 12, percentage: 0, manualReviewMarks: 10, finalized: false };
    const ctx = F.seed({ a: F.assignment({ examSnapshot: snap }), doc: F.activeDoc({}, { attempts: [att], activeAttempt: null }) });
    const r = await review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", null, "GET"), { requireBuilderAuth: () => ({ ok: true, user: { sub: "t" } }), getContainer: () => ctx.container, env: F.ENV }, null);
    expect(r.jsonBody.scenarios).toEqual([]);
    expect(JSON.stringify(r.jsonBody)).not.toContain("LEAK-REVIEW");
  });
});
