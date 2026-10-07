import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import * as K from "./certification-20g/kit.js";

// Phase 20G.2 — LEGACY ANSWER-TYPE / GRADING BINDING (O1 of the 20G.1 independent review). The SERVER-OWNED question authority decides
// which answer kinds a legacy question admits; a student can never choose a grader by forging `response.kind`. ONE shared predicate
// (legacyAnswerKindAllowed, shared build, derived from the Question Type Catalog's responseKinds of the alias-resolved type plus the kinds
// the legacy renderers derive from the question's OWN content) is consumed by the ingest binder, the legacy grader and the firstN
// selection. Cases O1-A … O1-Z, O1-FN1 … FN5; the ones that only PIN existing behaviour say "(pin)" in their title.
const require_ = createRequire(import.meta.url);
const { gradeQuestion, gradeExam } = require_("../src/lib/assignment-grading.js");
const { normalizeDraftAnswers } = require_("../src/lib/draft-answers.js");
const aliases = require_("../src/lib/shared-finalization/questionTypeAliases.js");
const catalog = require_("../src/lib/shared-finalization/questionTypeCatalog.js");
const { createPlatform } = require_("./certification-20g/platform.js");
const { A } = K;

const choice = index => ({ kind: "choice", index });
const seq = values => ({ kind: "sequence", values });
const table = values => ({ kind: "table", values });
const text = value => ({ kind: "text", value });
const fields = values => ({ kind: "fields", values });
const grade = (q, r) => { const g = gradeQuestion(q, r); return { score: g.score, maxMarks: g.maxMarks, correct: g.correct, manualReview: g.manualReview }; };
const FAIL_CLOSED = max => ({ score: 0, maxMarks: max, correct: false, manualReview: true });
const exam = (questions, policy) => ({ examId: "O1-20G2", title: "O1", sections: [{ id: "s1", title: "s", gradingPolicy: "all", ...(policy || {}), questions }] });
const ingest = (q, answer) => normalizeDraftAnswers({ [q.examQuestionId]: answer }, exam([q]));

// the O1 questions: 7 marks each, keys containing a value a choice index maps to ("1".."8", "a".."h", "أ"…)
const FB = () => ({ examQuestionId: "fb", presentationType: "fillBlank", text: "أكمل: 2+2=__ و x", marks: 7, fields: [{ id: "b1", label: "1", correct: "4" }, { id: "b2", label: "2", correct: "x" }], answer: { values: ["4", "x"] } });
const ORD = () => ({ examQuestionId: "ord", presentationType: "ordering", text: "رتّب", marks: 7, fields: [{ id: "o1", label: "1", correct: "1" }, { id: "o2", label: "2", correct: "2" }, { id: "o3", label: "3", correct: "3" }], answer: { mode: "exactSequence", values: ["1", "2", "3"] } });
const SA = () => ({ examQuestionId: "sa", presentationType: "shortAnswer", text: "?", marks: 7, answer: { text: "b", values: ["b"] } });
const TBL = () => ({ examQuestionId: "tbl", presentationType: "tableFill", text: "| الصف | القيمة |\n|---|---|\n| R1 | |", marks: 7, fields: [{ id: "c1", label: "c1", correct: "A" }], answer: { text: "R1=A", values: ["A"] } });
const MAT = () => ({ examQuestionId: "mat", presentationType: "matching", text: "طابق", marks: 7, fields: [{ id: "m1", label: "قط", correct: "c" }], answer: { values: ["c"] } });
const CLI = () => ({ examQuestionId: "cli", presentationType: "cliFill", text: "أكمل", marks: 7, cli: "vlan [[v]]", fields: [{ id: "v", label: "VLAN", correct: "1" }], answer: { values: ["1"] } });
const MC = () => ({ examQuestionId: "mc", presentationType: "multipleChoice", text: "اختر", marks: 7, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1, text: "ب" } });
const TF = () => ({ examQuestionId: "tf", presentationType: "trueFalse", text: "صح؟", marks: 7, answer: { correct: true, text: "صحيح" } });
const WB = () => ({ examQuestionId: "wb", presentationType: "wordBank", text: "أكمل", marks: 7, wordBank: ["TCP", "UDP"], fields: [{ id: "w1", label: "1", correct: "TCP" }], answer: { values: ["TCP"] } });
const MTF = () => ({ examQuestionId: "mtf", presentationType: "multiTrueFalse", text: "حدد", marks: 7, fields: [{ id: "r1", statement: "س1", kind: "boolean", correct: true }] });

describe("20G.2 O1 — the exploit is closed: a forged choice can no longer select the choice grader", () => {
  it("O1-A the exact 7/7 exploit: a choice index on a legacy fillBlank / ordering question scores 0 (was 7/7), fail-closed to teacher review", () => {
    // baseline b952f5c / 6db0fc0: gradeChoice compares String(index+1) / a-h / أ-ح against EVERY answer.values entry → full marks
    expect(grade(FB(), choice(3))).toEqual(FAIL_CLOSED(7));
    expect(grade(ORD(), choice(0))).toEqual(FAIL_CLOSED(7));
    const g = gradeExam(exam([FB(), ORD()]), { fb: choice(3), ord: choice(0) });
    expect([g.score, g.totalMarks]).toEqual([0, 14]);
  });
  for (const [name, mk, kind, answer] of [
    ["O1-B fillBlank + choice", FB, "choice", choice(3)], ["O1-C ordering + choice", ORD, "choice", choice(0)], ["O1-D shortAnswer + choice", SA, "choice", choice(1)],
    ["O1-E tableFill + choice", TBL, "choice", choice(0)], ["O1-F matching + choice", MAT, "choice", choice(2)], ["O1-G cliFill + choice", CLI, "choice", choice(0)],
    ["O1-H multipleChoice + text", MC, "text", text("ب")], ["O1-I trueFalse + text", TF, "text", text("صحيح")],
    ["O1-J ordering + table (no table in its text)", ORD, "table", table(["1", "2", "3"])], ["O1-K shortAnswer + sequence (no fields)", SA, "sequence", seq(["b"])]
  ]) {
    it(name + " cannot score, is refused at ingest (ANSWER_KIND_MISMATCH) and is never stored", () => {
      const q = mk();
      expect(grade(q, answer), name).toEqual(FAIL_CLOSED(7));
      expect(ingest(q, answer), name).toEqual({ answers: {}, rejected: [{ id: q.examQuestionId, code: "ANSWER_KIND_MISMATCH" }] });
      expect(aliases.legacyAnswerKindAllowed(q, kind), name).toBe(false);
    });
  }
});

describe("20G.2 O1 — valid legacy answers grade exactly as before (pins)", () => {
  const same = (q, r, expected) => { expect(grade(q, r)).toEqual(expected); expect(ingest(q, r)).toEqual({ answers: { [q.examQuestionId]: r }, rejected: [] }); };
  it("O1-M / O1-N fillBlank keeps BOTH catalog kinds: sequence and fields (pin)", () => {
    same(FB(), seq(["4", "x"]), { score: 7, maxMarks: 7, correct: true, manualReview: false });
    same(FB(), fields({ b1: "4", b2: "x" }), { score: 7, maxMarks: 7, correct: true, manualReview: false });
    same(FB(), seq(["4", "y"]), { score: 3.5, maxMarks: 7, correct: false, manualReview: false });
  });
  it("O1-O wordBank keeps sequence and fields (pin)", () => {
    same(WB(), seq(["TCP"]), { score: 7, maxMarks: 7, correct: true, manualReview: false });
    same(WB(), fields({ w1: "TCP" }), { score: 7, maxMarks: 7, correct: true, manualReview: false });
  });
  it("O1-P tableFill keeps table and fields (pin)", () => {
    same(TBL(), table(["A"]), { score: 7, maxMarks: 7, correct: true, manualReview: false });
    same(TBL(), fields({ c1: "A" }), { score: 7, maxMarks: 7, correct: true, manualReview: false });
  });
  it("O1-Q multipleChoice valid choice unchanged; a wrong option is a plain automatic 0, not a review (pin)", () => {
    same(MC(), choice(1), { score: 7, maxMarks: 7, correct: true, manualReview: false });
    same(MC(), choice(0), { score: 0, maxMarks: 7, correct: false, manualReview: false });
  });
  it("O1-R trueFalse with IMPLICIT options (no options array, answer.correct boolean) unchanged (pin)", () => {
    same(TF(), choice(0), { score: 7, maxMarks: 7, correct: true, manualReview: false });
    same(TF(), choice(1), { score: 0, maxMarks: 7, correct: false, manualReview: false });
  });
  it("O1-S / O1-T / O1-U / O1-V shortAnswer text, multiTrueFalse / matching / cliFill fields unchanged (pin)", () => {
    same(SA(), text(" B "), { score: 7, maxMarks: 7, correct: true, manualReview: false });
    same(MTF(), fields({ r1: true }), { score: 7, maxMarks: 7, correct: true, manualReview: false });
    same(MAT(), fields({ m1: "c" }), { score: 7, maxMarks: 7, correct: true, manualReview: false });
    same(CLI(), fields({ v: "1" }), { score: 7, maxMarks: 7, correct: true, manualReview: false });
  });
  it("O1-V' the kinds the legacy renderers derive from a question's OWN content stay valid: matching / ordering with fields → sequence, a table in the text → table, a non-choice part without fields → text (pin)", () => {
    same(MAT(), seq(["c"]), grade(MAT(), seq(["c"])));
    const withTable = { ...SA(), text: "?\n| a | b |\n|---|---|\n| R1 | |" };
    expect(ingest(withTable, table(["x"]))).toEqual({ answers: { sa: table(["x"]) }, rejected: [] });
    const ordNoFields = { ...ORD(), fields: undefined };
    expect(ingest(ordNoFields, text("1 2 3"))).toEqual({ answers: { ord: text("1 2 3") }, rejected: [] });
  });
});

describe("20G.2 O1 — aliases, typeless and unknown legacy types obey the same authority", () => {
  const ALIAS_CASES = [["mcq", "multipleChoice"], ["multiplechoice", "multipleChoice"], ["MCQ", "multipleChoice"], ["tf", "trueFalse"], ["truefalse", "trueFalse"], ["multitruefalse", "multiTrueFalse"], ["multitf", "multiTrueFalse"],
    ["open", "shortAnswer"], ["short", "shortAnswer"], ["shortanswer", "shortAnswer"], ["essay", "shortAnswer"], ["fillblank", "fillBlank"], ["fill", "fillBlank"], ["Fill", "fillBlank"], ["wordbank", "wordBank"],
    ["matching", "matching"], ["match", "matching"], ["ordering", "ordering"], ["order", "ordering"], ["tablefill", "tableFill"], ["table", "tableFill"], ["clifill", "cliFill"], ["cli", "cliFill"], ["compound", "compound"]];
  const KINDS = ["choice", "text", "sequence", "table", "fields", "compound", "multiChoice", "numeric"];
  it("O1-L every alias admits EXACTLY the kinds of its canonical type (presentationType and flat `type`, any case) — the ONE renderer exception is `text`, decided by the literal spelling", () => {
    for (const [alias, key] of ALIAS_CASES) {
      expect(aliases.resolveQuestionTypeKeyOrAlias(alias), alias).toBe(key);
      for (const kind of KINDS) {
        // text follows the renderer: a textarea for every literal type except "multiplechoice" / "truefalse" (so a raw "mcq" / "tf" keeps
        // the text answer its textarea produces; see O1-L4); every other kind is exactly the canonical type's
        const canonical = kind === "text" ? !["multiplechoice", "truefalse"].includes(alias.toLowerCase()) : aliases.legacyAnswerKindAllowed({ presentationType: key }, kind);
        expect(aliases.legacyAnswerKindAllowed({ presentationType: alias }, kind), alias + " " + kind).toBe(canonical);
        expect(aliases.legacyAnswerKindAllowed({ type: alias }, kind), "type " + alias + " " + kind).toBe(canonical);
      }
    }
    // the choice kind never leaves the choice family, whatever the spelling
    for (const [alias, key] of ALIAS_CASES) expect(aliases.legacyAnswerKindAllowed({ presentationType: alias }, "choice"), alias).toBe(key === "multipleChoice" || key === "trueFalse");
  });
  it("O1-L4 a raw stored choice alias (`mcq` / `tf`) renders a textarea: its text answer is admitted and keeps its historical grade (teacher review, never a score, never a silent drop) (pin)", () => {
    for (const t of ["mcq", "tf", "MCQ"]) {
      const q = { ...MC(), presentationType: t };
      expect(grade(q, { kind: "text", value: "B" }), t).toEqual({ score: 0, maxMarks: 7, correct: false, manualReview: true });
      const b = normalizeDraftAnswers({ m: { kind: "text", value: "B" } }, exam([{ ...q, examQuestionId: "m" }]));
      expect(b.answers.m, t).toEqual({ kind: "text", value: "B" });
      expect(b.rejected, t).toEqual([]);
    }
    // the canonical spelling renders radios: a text answer is not an answer of that question
    expect(aliases.legacyAnswerKindAllowed(MC(), "text")).toBe(false);
    expect(aliases.legacyAnswerKindAllowed(TF(), "text")).toBe(false);
  });
  it("O1-L5 a legacy question whose OWN answer key is a sequence (answer.mode exactSequence / sequence) admits a sequence answer even typeless / fieldless, and grades exactly as before; a choice on it still fails closed (pin)", () => {
    for (const mode of ["exactSequence", "sequence"]) {
      for (const shape of [{}, { type: "sequence" }, { presentationType: "fillBlank" }]) {
        const q = { examQuestionId: "s", marks: 4, ...shape, answer: { mode, values: ["a", "b", "c", "d"] } };
        expect(grade(q, { kind: "sequence", values: ["a", "b", "c", "d"] }), mode).toMatchObject({ score: 4, correct: true });
        expect(grade(q, { kind: "sequence", values: ["a", "b", "x", "x"] }).score, mode).toBeCloseTo(2, 9);
        expect(grade(q, choice(0)), mode).toEqual(FAIL_CLOSED(4));
      }
    }
    // an answer key that is NOT a sequence proves nothing: a fieldless typeless question still refuses a sequence
    expect(aliases.legacyAnswerKindAllowed({ answer: { text: "x" } }, "sequence")).toBe(false);
    expect(aliases.legacyAnswerKindAllowed({ answer: { mode: "exactsequence" } }, "sequence")).toBe(false);
    // and a choice type never admits a sequence through its answer key
    expect(aliases.legacyAnswerKindAllowed({ presentationType: "multipleChoice", answer: { mode: "exactSequence" } }, "sequence")).toBe(false);
  });
  it("O1-L' an aliased question is graded by its canonical type: a choice on an `order` / `fill` question cannot score; a choice on an `mcq` question still can", () => {
    expect(grade({ ...ORD(), presentationType: "order" }, choice(0))).toEqual(FAIL_CLOSED(7));
    expect(grade({ ...FB(), presentationType: "Fill" }, choice(3))).toEqual(FAIL_CLOSED(7));
    expect(grade({ ...MC(), presentationType: "mcq" }, choice(1))).toEqual({ score: 7, maxMarks: 7, correct: true, manualReview: false });
  });
  it("O1-L'' a TYPELESS legacy flat question and an UNKNOWN historical type never let the response pick the choice grader", () => {
    const flat = { examQuestionId: "lf", text: "?", marks: 7, options: [{ text: "1" }, { text: "2" }], answer: { values: ["1"], correctOptionIndex: 0 } };
    expect(grade(flat, choice(0))).toEqual(FAIL_CLOSED(7));
    expect(grade({ ...flat, type: "sequence" }, choice(0))).toEqual(FAIL_CLOSED(7));
    expect(aliases.legacyAnswerKindAllowed(flat, "choice")).toBe(false);
    expect(aliases.legacyAnswerKindAllowed({ type: "  ChOiCe " }, "choice")).toBe(false);
    // the question's own content keeps its historical renderer kinds: text always, a table only with a table in its text
    expect(aliases.legacyAnswerKindAllowed(flat, "text")).toBe(true);
    expect(aliases.legacyAnswerKindAllowed(flat, "table")).toBe(false);
    expect(aliases.legacyAnswerKindAllowed({ ...flat, text: "?\n| a | b |\n|---|---|\n| x | |" }, "table")).toBe(true);
  });
  it("O1-L''' the binding is decided by the QUESTION, never by the response: kind casing / whitespace / non-string kinds are not the authority", () => {
    for (const kind of ["Choice", " choice", "CHOICE", undefined, null, 0, ["choice"], { kind: "choice" }]) expect(aliases.legacyAnswerKindAllowed(FB(), kind), String(kind)).toBe(false);
    expect(grade(FB(), { kind: "Choice", index: 3 })).toEqual(FAIL_CLOSED(7));
  });
  it("O1-CAT catalog contract: every legacy catalog row admits exactly its responseKinds (and choice ⇔ a choice type); modern rows are not the binding's business", () => {
    const rows = catalog.QUESTION_TYPE_CATALOG;
    expect(rows.filter(d => d.legacy).map(d => d.key)).toEqual([...catalog.LEGACY_QUESTION_TYPE_KEYS]);
    for (const d of rows) {
      const bare = { presentationType: d.key };                                    // no content → only catalog kinds (+ text for non-choice)
      for (const kind of d.responseKinds) expect(aliases.legacyAnswerKindAllowed(bare, kind), d.key + " " + kind).toBe(true);
      if (d.legacy) expect(aliases.legacyAnswerKindAllowed(bare, "choice"), d.key).toBe(d.responseKinds.includes("choice"));
      if (!d.legacy) for (const kind of KINDS) expect(aliases.legacyAnswerKindAllowed(bare, kind), d.key + " " + kind).toBe(true);
    }
  });
});

describe("20G.2 O1 — firstNAnswered: only an answer the question authority admits can take a slot", () => {
  const FN = () => exam([{ ...FB(), examQuestionId: "f1" }, { ...MC(), examQuestionId: "f2" }], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 7 });
  const units = g => g.questions.map(x => [x.questionId, x.score, x.ignored, x.manualReview]);
  it("O1-FN1 / FN2 / FN3 a mismatched first answer does NOT consume the slot (stored data graded directly); the next valid answer counts", () => {
    const g = gradeExam(FN(), { f1: choice(3), f2: choice(1) });
    expect(g.score).toBe(7);
    expect(units(g).find(u => u[0] === "f2")).toEqual(["f2", 7, false, false]);
  });
  it("O1-FN4 valid answers keep the existing firstN selection order byte-for-byte (pin)", () => {
    const g = gradeExam(FN(), { f1: seq(["4", "x"]), f2: choice(1) });
    expect(units(g)).toEqual([["f1", 7, false, false], ["f2", 0, true, false]]);
    expect(g.score).toBe(7);
  });
  it("O1-FN5 part-level firstN in a compound section: a mismatched part answer takes no slot; the next valid part counts", () => {
    const cq = { examQuestionId: "cq", presentationType: "compound", text: "مركّب", marks: 4, parts: [{ id: "p1", type: "shortAnswer", text: "?", marks: 2, answer: { text: "b", values: ["b"] } }, { id: "p2", type: "multipleChoice", text: "?", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } }] };
    const ex = exam([cq], { gradingPolicy: "firstNAnswered", answerUnit: "part", requiredAnswers: 1, maxMarks: 2 });
    const g = gradeExam(ex, { cq: { kind: "compound", parts: { p1: choice(1), p2: choice(0) } } });
    expect(g.score).toBe(2);
    expect(g.questions[0].parts.find(p => p.partId === "p2")).toMatchObject({ score: 2, counted: true });
  });
});

describe("20G.2 O1 — compound / composite children and historical stored data", () => {
  it("O1-W a compound child mismatch cannot score; the ingest refuses that part alone (ANSWER_KIND_MISMATCH)", () => {
    const cq = { examQuestionId: "cq", presentationType: "compound", text: "مركّب", marks: 7, parts: [{ id: "p1", type: "ordering", text: "?", marks: 7, fields: [{ id: "o1", label: "1", correct: "1" }], answer: { mode: "exactSequence", values: ["1", "2"] } }] };
    const g = gradeQuestion(cq, { kind: "compound", parts: { p1: choice(0) } });
    expect([g.score, g.correct, g.manualReview]).toEqual([0, false, true]);
    expect(normalizeDraftAnswers({ cq: { kind: "compound", parts: { p1: choice(0) } } }, exam([cq]))).toEqual({ answers: { cq: { kind: "compound", parts: {} } }, rejected: [{ id: "cq.p1", code: "ANSWER_KIND_MISMATCH" }] });
  });
  it("O1-X a composite legacy child mismatch (shortAnswer / ordering child + choice) never scores and is refused at ingest", () => {
    const sa = K.part("a", "أ", { ...SA(), marks: 2 }), ord = K.part("b", "ب", { ...ORD(), marks: 2 });
    const node = K.composite("cp", "مركّب متقدّم", 4, [], [K.group("g", "g", [sa, ord])]);
    const ex = exam([node]);
    const hostile = A.composite({ a: choice(1), b: choice(0) }, {});
    const g = gradeExam(ex, { cp: hostile });
    expect(g.score).toBe(0);
    expect(g.questions[0].parts.map(p => [p.partId, p.score, p.manualReview])).toEqual([["a", 0, true], ["b", 0, true]]);
    expect(normalizeDraftAnswers({ cp: hostile }, ex).rejected).toEqual([{ id: "cp.a", code: "ANSWER_KIND_MISMATCH" }, { id: "cp.b", code: "ANSWER_KIND_MISMATCH" }]);
  });
  it("O1-X' a composite firstN group: a mismatched child takes no group slot; the valid child counts", () => {
    const p1 = K.part("a", "أ", { ...SA(), marks: 2 }), p2 = K.part("b", "ب", { ...MC(), marks: 2 });
    const node = K.composite("cp", "مركّب", 2, [], [K.group("g", "g", [p1, p2], K.firstN(1, 2))]);
    const g = gradeExam(exam([node]), { cp: A.composite({ a: choice(1), b: choice(1) }, {}) });
    expect(g.score).toBe(2);
    expect(g.questions[0].parts.find(p => p.partId === "b")).toMatchObject({ score: 2, counted: true });
  });
  it("O1-Z old stored mismatched data passed directly to gradeExam cannot score (no migration needed for grading safety)", () => {
    const ex = exam([FB(), ORD(), TBL(), SA()]);
    const g = gradeExam(ex, { fb: choice(3), ord: choice(0), tbl: choice(0), sa: choice(1) });
    expect(g.score).toBe(0);
    expect(g.questions.every(q => q.manualReview && q.score === 0)).toBe(true);
  });
});

describe("20G.2 O1 — end to end through the real handlers (draft, restore, pause, submit, teacher review)", () => {
  let p, aid, paid;
  const EX = () => K.exam("O1-E2E-20G2", "O1", [K.section("s1", "s", [
    K.fillBlank("fb", "أكمل", 7, [["b1", "1", "4"], ["b2", "2", "x"]]), K.ordering("ord", "رتّب", 7, ["1", "2", "3"]), K.shortAnswer("sa", "?", 7, "b"), K.mcq("mc", "اختر", 7, ["أ", "ب"], 1)])]);
  beforeAll(async () => {
    p = createPlatform({ students: { "o1-1": "أ", "o1-2": "ب", "o1-3": "ج", "o1-4": "د", "o1-5": "ه" } });
    expect((await p.teacher.saveExam(EX())).status).toBe(200);
    const pub = await p.teacher.publish(EX());
    expect(pub.ok, JSON.stringify(pub.steps.at(-1)?.jsonBody)).toBe(true);
    aid = (await p.teacher.assign(EX().examId)).jsonBody.assignment.assignmentId;
    paid = (await p.teacher.assign(EX().examId, { attemptPolicy: "pausable" })).jsonBody.assignment.assignmentId;
  }, 120000);
  const VALID = { fb: A.fields({ b1: "4", b2: "x" }), ord: A.seq(["1", "2", "3"]), sa: A.text("b"), mc: A.choice(1) };
  const HOSTILE = { fb: choice(3), ord: choice(0), sa: choice(1), mc: text("ب") };
  it("O1-Y draft → restore: mismatched kinds are refused and absent, valid ones persist; nothing is converted to another kind", async () => {
    const s = p.student("o1-1");
    expect((await s.start(aid)).status).toBe(200);
    expect((await s.draft(aid, { ...HOSTILE, mc: A.choice(1) })).status).toBe(200);
    expect((await s.state(aid)).jsonBody.state.draftAnswers).toEqual({ mc: A.choice(1) });
    expect((await s.draft(aid, VALID)).status).toBe(200);
    expect((await s.state(aid)).jsonBody.state.draftAnswers).toEqual(VALID);
  });
  it("O1-Y' submit with hostile kinds scores 0; the attempt records only accepted answers; review never resurrects a score", async () => {
    const s = p.student("o1-2");
    expect((await s.start(aid)).status).toBe(200);
    const sub = await s.submit(aid, HOSTILE);
    expect(sub.status).toBe(200);
    const att = s.attempt(aid);
    expect(att.answers).toEqual({});
    expect(att.score).toBe(0);
    const rv = await p.teacher.reviewGet(aid, "o1-2");
    expect(rv.status).toBe(200);
    expect((await p.teacher.saveReview(aid, "o1-2", {})).status).toBe(200);
    expect(s.attempt(aid).score).toBe(0);
  });
  it("O1-Y'' pauseAttempt binds kinds through the same authority; a valid submit grades exactly the accepted answers", async () => {
    const s = p.student("o1-3");
    expect((await s.start(paid)).status).toBe(200);
    const i = s.identity(paid);
    const r = await s.raw(paid, { action: "pauseAttempt", answers: { ...HOSTILE, sa: A.text("b") }, expectedAttemptNumber: i.attemptNumber, expectedStartedAt: i.startedAt, expectedAttemptEpoch: i.attemptEpoch });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(s.doc(paid).draftAnswers).toEqual({ sa: A.text("b") });
    await s.state(paid);                                                             // the pause moved the attempt epoch
    const j = s.identity(paid);
    const resumed = await s.raw(paid, { action: "resumeAttempt", expectedAttemptNumber: j.attemptNumber, expectedStartedAt: j.startedAt, expectedAttemptEpoch: j.attemptEpoch });
    expect(resumed.status, JSON.stringify(resumed.jsonBody)).toBe(200);
    await s.state(paid);
    const sub = await s.submit(paid, { ...VALID, ord: choice(0) });
    expect(sub.status, JSON.stringify(sub.jsonBody)).toBe(200);
    const att = s.attempt(paid);
    expect(att.answers).toEqual({ fb: VALID.fb, sa: VALID.sa, mc: VALID.mc });     // the forged ordering answer was refused, never stored
    expect(att.score).toBe(21);                                                      // fb 7 + sa 7 + mc 7; ordering unanswered → 0
    expect(att.questionGrades.find(g => g.questionId === "ord")).toMatchObject({ score: 0 });
  });
  it("O1-Y3 stale attempt identity: a stale draft / submit carrying forged kinds is refused 409 and writes NOTHING; the live identity then binds normally", async () => {
    const s = p.student("o1-5");
    expect((await s.start(aid)).status).toBe(200);
    expect((await s.draft(aid, { sa: A.text("b") })).status).toBe(200);
    const before = JSON.stringify(s.doc(aid));
    const staleId = { startedAt: "2000-01-01T00:00:00.000Z" };
    expect((await s.draft(aid, { ...HOSTILE, fb: VALID.fb }, staleId)).status).toBe(409);
    expect((await s.submit(aid, { ...HOSTILE, fb: VALID.fb }, staleId)).status).toBe(409);
    expect(JSON.stringify(s.doc(aid))).toBe(before);
    const sub = await s.submit(aid, { ...HOSTILE, fb: VALID.fb });
    expect(sub.status).toBe(200);
    expect(s.attempt(aid).answers).toEqual({ fb: VALID.fb });
    expect(s.attempt(aid).score).toBe(7);
  });
  it("O1-Y4 retry: a replayed hostile submit is refused and never changes the stored grade; a second attempt binds through the same authority and grades valid answers in full", async () => {
    const s = p.student("o1-4");
    expect((await s.start(aid)).status).toBe(200);
    expect((await s.submit(aid, HOSTILE)).status).toBe(200);
    const first = JSON.stringify(s.attempt(aid, 1));
    expect(s.attempt(aid, 1).score).toBe(0);
    expect((await s.submit(aid, HOSTILE)).status).toBe(409);                        // replay of the finished attempt
    expect(JSON.stringify(s.attempt(aid, 1))).toBe(first);
    expect((await s.start(aid)).status).toBe(200);                                   // maxAttempts 2 → the retry attempt
    const sub = await s.submit(aid, { ...VALID, sa: choice(1) });
    expect(sub.status, JSON.stringify(sub.jsonBody)).toBe(200);
    const a2 = s.attempt(aid, 2);
    expect(a2.answers).toEqual({ fb: VALID.fb, ord: VALID.ord, mc: VALID.mc });
    expect(a2.score).toBe(21);
    expect(JSON.stringify(s.attempt(aid, 1))).toBe(first);
  });
});
