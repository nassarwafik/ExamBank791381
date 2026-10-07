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
    ["O1-J ordering + table (no table in its text)", ORD, "table", table(["1", "2", "3"])], ["O1-K shortAnswer + sequence (no fields)", SA, "sequence", seq(["b"])],
    // an EMPTY fields array renders no field control: it proves nothing (the sequence grader would credit answer.values ["b"])
    // a field-set answer on a question that renders no field control (fields is never a catalog kind of these types)
    ["O1-K'' shortAnswer + fields (no fields)", SA, "fields", { kind: "fields", values: { x: "b" } }], ["O1-H' multipleChoice + fields", MC, "fields", { kind: "fields", values: { x: "1" } }],
    ["O1-K' shortAnswer with an EMPTY fields array + sequence", () => ({ ...SA(), fields: [] }), "sequence", seq(["b"])],
    // a header-only table (no data row) renders no table on the client and grades nothing: it does not admit a table answer
    ["O1-J' ordering whose text holds a HEADER-ONLY table + table", () => ({ ...ORD(), text: "رتّب\n| أ | ب |\n|---|---|" }), "table", table(["1"])]
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
    // keyed by TEXT (no index, no boolean): only the implicit صحيح / غير صحيح option texts make the right choice gradeable
    for (const answer of [{ correctText: "غير صحيح" }, { values: ["غير صحيح"] }]) {
      const q = { examQuestionId: "tf2", presentationType: "trueFalse", text: "صح؟", marks: 7, answer };
      same(q, choice(1), { score: 7, maxMarks: 7, correct: true, manualReview: false });
      same(q, choice(0), { score: 0, maxMarks: 7, correct: false, manualReview: false });
    }
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
    // a structured question's presentationType is THE type: a stale flat `type` beside it is never the authority
    const stale = { ...FB(), type: "multipleChoice" };
    expect(aliases.legacyAnswerKindAllowed(stale, "choice")).toBe(false);
    expect(grade(stale, choice(3))).toEqual(FAIL_CLOSED(7));
    expect(ingest(stale, choice(3))).toEqual({ answers: {}, rejected: [{ id: "fb", code: "ANSWER_KIND_MISMATCH" }] });
    expect(grade({ ...MC(), type: "fillBlank" }, choice(1))).toEqual({ score: 7, maxMarks: 7, correct: true, manualReview: false });
    // prototype-shaped kinds are never admitted
    for (const kind of ["__proto__", "constructor", "toString", "hasOwnProperty"]) expect(aliases.legacyAnswerKindAllowed(FB(), kind), kind).toBe(false);
  });
  it("O1-L6 an unsupported questionTypeVersion / an unknown STRUCTURED type is the 16A registry's fail-closed result, whatever the response kind (pin)", () => {
    for (const q of [{ ...FB(), questionTypeVersion: 99 }, { ...FB(), presentationType: "weirdLegacy" }, { ...MC(), questionTypeVersion: 2 }])
      for (const r of [choice(0), choice(1), seq(["4", "x"]), { kind: "text", value: "ب" }]) expect(gradeQuestion(q, r), q.presentationType + "@" + q.questionTypeVersion).toEqual({ score: 0, maxMarks: 7, correct: false, manualReview: true, unsupportedType: true });
  });
  it("O1-CAT2 the dual-kind legacy rows are pinned literally (a catalog edit that drops a kind fails here, not silently in the binding)", () => {
    const kinds = Object.fromEntries(catalog.QUESTION_TYPE_CATALOG.filter(d => d.legacy).map(d => [d.key, [...d.responseKinds]]));
    expect(kinds).toEqual({ multipleChoice: ["choice"], trueFalse: ["choice"], multiTrueFalse: ["fields"], shortAnswer: ["text"], fillBlank: ["sequence", "fields"], wordBank: ["sequence", "fields"], matching: ["fields"], ordering: ["sequence"], tableFill: ["fields", "table"], cliFill: ["fields"], compound: ["compound"] });
    for (const [key, ks] of Object.entries(kinds)) for (const k of ks) expect(aliases.legacyAnswerKindAllowed({ presentationType: key }, k), key + " " + k).toBe(true);
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
    // the mismatch is not an answer: not counted, not an "ignored excess answer", never pending review; f2 takes the one slot
    expect(units(g)).toEqual([["f1", 0, false, false], ["f2", 7, false, false]]);
  });
  it("O1-FN3' historical: a compound question stored with a NON-compound kind (or with only mismatched parts) takes no question-level slot", () => {
    const cq = { examQuestionId: "f1", presentationType: "compound", text: "مركّب", marks: 7, parts: [{ id: "p1", type: "fillBlank", text: "?", marks: 7, fields: [{ id: "b1", label: "1", correct: "4" }], answer: { values: ["4"] } }] };
    const ex = exam([cq, { ...MC(), examQuestionId: "f2" }], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 7 });
    for (const stored of [choice(0), { kind: "compound", parts: { p1: choice(0) } }]) {
      const g = gradeExam(ex, { f1: stored, f2: choice(1) });
      expect(g.score, JSON.stringify(stored)).toBe(7);
      expect(units(g), JSON.stringify(stored)).toEqual([["f1", 0, false, false], ["f2", 7, false, false]]);
    }
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
    // the mismatched part is not an answer: not counted, not an "ignored excess answer", and nothing counted awaits review
    expect(g.questions[0].parts.find(p => p.partId === "p1")).toMatchObject({ score: 0, counted: false, ignored: false });
    expect([g.questions[0].manualReview, g.manualReviewMarks]).toEqual([false, 0]);
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

// ─── Review Fix 1 (independent review of 14f15c3) ───────────────────────────────────────────────────────────────────────────────────────
// F1: `table` is admitted ONLY where the renderer draws a table (a top-level, non-field-type question); a part / composite child is answered
// through CompoundPartControl, which never draws one. gradeTable's check-mark mode credits a blank / all-false table on a question whose key
// names no row, so a forged table there scored without the answer. F3: the binding derives the type exactly like the renderer, the legacy
// grader and the 16A registry (`presentationType || type`). F4: pins for the reviewer's surviving mutants. NOTE: a simulation forgery.
describe("20G.2 RF1 — a forged table can only answer a question whose renderer draws a table; type derivation matches the grader", () => {
  const STEM = "من الجدول، ما قناع الشبكة؟\n| الجهاز | IP |\n|---|---|\n| PC1 | 10.0.0.5 |\n| PC2 | 10.0.0.6 |";
  const SA_STEM = () => ({ examQuestionId: "sat", presentationType: "shortAnswer", text: STEM, marks: 4, answer: { text: "255.255.255.0" } });
  const BLANK = table([false, false]);
  it("RF1-F1a a compound PART with a table in its text: a forged table is refused for that part and can never score", () => {
    const cq = { examQuestionId: "cq", presentationType: "compound", text: "مركّب", marks: 6, parts: [{ id: "a", type: "shortAnswer", text: STEM, marks: 3, answer: { text: "255.255.255.0" } }, { id: "b", type: "fillBlank", text: "?", marks: 3, fields: [{ id: "b1", label: "1", correct: "4" }], answer: { values: ["4"] } }] };
    const hostile = { kind: "compound", parts: { a: BLANK, b: choice(3) } };
    expect(normalizeDraftAnswers({ cq: hostile }, exam([cq]))).toEqual({ answers: { cq: { kind: "compound", parts: {} } }, rejected: [{ id: "cq.a", code: "ANSWER_KIND_MISMATCH" }, { id: "cq.b", code: "ANSWER_KIND_MISMATCH" }] });
    const g = gradeExam(exam([cq]), { cq: hostile });
    expect(g.score).toBe(0);
    expect(g.questions[0].parts.map(p => [p.partId, p.score, p.manualReview])).toEqual([["a", 0, true], ["b", 0, true]]);
    expect(aliases.legacyAnswerKindAllowed(cq.parts[0], "table", "part")).toBe(false);
    expect(aliases.legacyAnswerKindAllowed({ presentationType: "tableFill", text: STEM }, "table", "part")).toBe(false);   // not even a catalog table type with a drawable table
    expect(aliases.legacyAnswerKindAllowed({ presentationType: "tableFill" }, "table", "part")).toBe(true);    // nothing drawable: the table grader finds no rows (fails closed)
  });
  it("RF1-F1b a composite legacy CHILD with a table in its text: a forged table is refused and can never score", () => {
    const node = K.composite("cp", "مركّب", 3, [], [K.group("g", "g", [K.part("a", "أ", { ...SA_STEM(), marks: 3 })])]);
    const hostile = A.composite({ a: BLANK }, {});
    expect(normalizeDraftAnswers({ cp: hostile }, exam([node])).rejected).toEqual([{ id: "cp.a", code: "ANSWER_KIND_MISMATCH" }]);
    const g = gradeExam(exam([node]), { cp: hostile });
    expect(g.score).toBe(0);
    expect(g.questions[0].parts.map(p => [p.partId, p.score, p.manualReview])).toEqual([["a", 0, true]]);
  });
  it("RF1-F1c a top-level FIELD-TYPE question (multiTrueFalse, cliFill, tableFill with a grid) renders its fields, never a table: a forged table is refused", () => {
    const mtf = { examQuestionId: "mtf", presentationType: "multiTrueFalse", text: STEM, marks: 4, fields: [{ id: "r1", statement: "PC1", kind: "boolean", correct: true }, { id: "r2", statement: "PC2", kind: "boolean", correct: false }], answer: { text: "PC1" } };
    const cli = { ...CLI(), text: STEM, answer: { text: "x" } };
    const grid = { ...TBL(), text: STEM, tableHeaders: ["الجهاز", "IP"], tableRows: [["PC1", ""], ["PC2", ""]], answer: { text: "255.255.255.0" } };
    for (const q of [mtf, cli, grid]) {
      expect(grade(q, BLANK), q.presentationType).toEqual(FAIL_CLOSED(q.marks));
      expect(ingest(q, BLANK), q.presentationType).toEqual({ answers: {}, rejected: [{ id: q.examQuestionId, code: "ANSWER_KIND_MISMATCH" }] });
    }
  });
  it("RF1-F1e a forged (answered, check-mark-crediting) table on a part takes no slot and never scores in a part-unit section (graded and first-N) or a composite first-N group; it is not an 'ignored' answer", () => {
    const DASH = table(["-", "-"]);                       // answered (non-empty cells) and still credited by check-mark mode
    const cq = { examQuestionId: "cq", presentationType: "compound", text: "مركّب", marks: 6, parts: [{ id: "a", type: "shortAnswer", text: STEM, marks: 3, answer: { text: "255.255.255.0" } }, { id: "b", type: "shortAnswer", text: "?", marks: 3, answer: { text: "b" } }] };
    const all = gradeExam(exam([cq], { answerUnit: "part" }), { cq: { kind: "compound", parts: { a: DASH } } });
    expect([all.score, all.questions[0].parts.find(p => p.partId === "a").manualReview]).toEqual([0, true]);
    const fn = gradeExam(exam([cq], { gradingPolicy: "firstNAnswered", answerUnit: "part", requiredAnswers: 1, maxMarks: 3 }), { cq: { kind: "compound", parts: { a: DASH, b: A.text("b") } } });
    expect(fn.score).toBe(3);
    expect(fn.questions[0].parts.map(p => [p.partId, p.score, p.counted, p.ignored])).toEqual([["a", 0, false, false], ["b", 3, true, false]]);
    const node = K.composite("cp", "مركّب", 3, [], [K.group("g", "g", [K.part("a", "أ", { ...SA_STEM(), marks: 3 }), K.part("b", "ب", { ...SA(), marks: 3 })], K.firstN(1, 3))]);
    const cg = gradeExam(exam([node]), { cp: A.composite({ a: DASH, b: A.text("b") }, {}) });
    expect(cg.score).toBe(3);
    expect(cg.questions[0].parts.map(p => [p.partId, p.score, p.counted])).toEqual([["a", 0, false], ["b", 3, true]]);
  });
  it("RF1-F1d where the renderer DOES draw a table (top-level, non-field type, table in its text; tableFill without a grid) a table answer stays admitted (pin; see limitation L-F2)", () => {
    for (const q of [SA_STEM(), TBL(), { ...FB(), text: STEM }, { examQuestionId: "lf", text: STEM, marks: 4, answer: { text: "x" } }]) {
      expect(aliases.legacyAnswerKindAllowed(q, "table"), q.presentationType).toBe(true);
      expect(ingest(q, BLANK).rejected, q.presentationType).toEqual([]);
    }
    expect(grade(TBL(), table(["A"]))).toEqual({ score: 7, maxMarks: 7, correct: true, manualReview: false });   // O1-P, unchanged
  });
  // Review Fix 2 (independent review round 2, F5): pins for behaviour the head already has, each killing a surviving reviewer mutant.
  it("RF2-GRID a tableFill grid is EITHER tableHeaders OR tableRows (the renderer's isFieldType): with either one alone it draws fields, so a forged table is refused even with a stem table", () => {
    for (const grid of [{ tableRows: [["PC1", ""], ["PC2", ""]] }, { tableHeaders: ["الجهاز", "IP"] }]) {
      const q = { examQuestionId: "tg", presentationType: "tableFill", text: STEM, marks: 4, ...grid, answer: { text: "z" } };
      expect(ingest(q, BLANK), JSON.stringify(grid)).toEqual({ answers: {}, rejected: [{ id: "tg", code: "ANSWER_KIND_MISMATCH" }] });
      expect(grade(q, BLANK), JSON.stringify(grid)).toEqual(FAIL_CLOSED(4));
    }
  });
  it("RF2-TWO-LINES a two-line table (header + one row, no separator) is drawn by the client: admitted at the top level, refused on a part even for a catalog table type", () => {
    const two = "| a | b |\n| PC1 | x |";
    expect(aliases.legacyAnswerKindAllowed({ presentationType: "shortAnswer", text: two }, "table")).toBe(true);
    expect(ingest({ ...SA(), text: two }, table(["x"])).rejected).toEqual([]);
    expect(aliases.legacyAnswerKindAllowed({ presentationType: "tableFill", text: two }, "table", "part")).toBe(false);
  });
  it("RF2-PADDED the literal type is NOT trimmed, exactly like the renderer's typeOf: a padded ' tableFill ' with a grid draws a table; a padded ' multipleChoice ' draws a textarea", () => {
    const padded = { examQuestionId: "pt", presentationType: " tableFill ", text: STEM, marks: 4, tableHeaders: ["الجهاز", "IP"], answer: { text: "PC1=10.0.0.5;PC2=10.0.0.6" } };
    expect(aliases.legacyAnswerKindAllowed(padded, "table")).toBe(true);
    expect(ingest(padded, table(["10.0.0.5", "10.0.0.6"])).rejected).toEqual([]);
    const mc = { ...MC(), presentationType: " multipleChoice " };
    expect(aliases.legacyAnswerKindAllowed(mc, "text")).toBe(true);
    expect(ingest(mc, { kind: "text", value: "ب" }).rejected).toEqual([]);
  });
  it("RF2-FN a valid top-level table answer takes its question-level first-N slot (and an excess one is reported as ignored)", () => {
    const t1 = { examQuestionId: "t1", presentationType: "tableFill", text: STEM, marks: 4, answer: { text: "PC1=10.0.0.5;PC2=10.0.0.6" } };
    const s2 = { ...SA(), examQuestionId: "s2", marks: 4 };
    const answers = { t1: table(["10.0.0.5", "10.0.0.6"]), s2: A.text("b") };
    const first = gradeExam(exam([t1, s2], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 4 }), answers);
    expect(first.questions.map(q => [q.questionId, q.score, q.countedMaxMarks, q.ignored])).toEqual([["t1", 4, 4, false], ["s2", 0, 0, true]]);
    const second = gradeExam(exam([s2, t1], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 4 }), answers);
    expect(second.questions.map(q => [q.questionId, q.score, q.countedMaxMarks, q.ignored])).toEqual([["s2", 4, 4, false], ["t1", 0, 0, true]]);
  });
  it("RF1-F3 the type is presentationType || type, exactly as the renderer / grader / registry derive it: a blank or non-string presentationType never borrows a modern flat type's authority", () => {
    for (const [presentationType, type] of [[" ", "multipleSelect"], ["\t", "numericResponse"], [7, "openResponse"]]) {
      const q = { examQuestionId: "f3", presentationType, type, text: "?", marks: 5, options: [{ text: "1" }, { text: "2" }], answer: { values: ["1"] } };
      expect(grade(q, choice(0)), String(type)).toEqual(FAIL_CLOSED(5));
      expect(ingest(q, choice(0)), String(type)).toEqual({ answers: {}, rejected: [{ id: "f3", code: "ANSWER_KIND_MISMATCH" }] });
    }
    // a flat `type` the renderer stringifies to a choice type ("multiplechoice") draws radios: its choice stays admitted and grades as before
    const arr = { examQuestionId: "f4", type: ["multipleChoice"], text: "?", marks: 5, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 } };
    expect(grade(arr, choice(1))).toEqual({ score: 5, maxMarks: 5, correct: true, manualReview: false });
    expect(ingest(arr, choice(1)).rejected).toEqual([]);
  });
  it("RF1-F4 pins: a stored null answer keeps its historical grade; a broken composite in a first-N section takes its slot and goes to teacher review; E-4 ingest; table detection needs pipes on both sides; kind is checked before size", () => {
    expect(grade(MC(), null)).toEqual({ score: 0, maxMarks: 7, correct: false, manualReview: false });
    const sa = { examQuestionId: "x", presentationType: "shortAnswer", text: "?", marks: 2, answer: { text: "b" } };
    const broken = JSON.parse(JSON.stringify(K.composite("cp", "c", 2, [], [K.group("g", "g", [K.part("a", "أ", sa)])])));
    broken.composite.groups[0].parts.push(JSON.parse(JSON.stringify(broken.composite.groups[0].parts[0])));      // duplicate part id → broken authority
    const ex = exam([broken, { ...sa, examQuestionId: "q2" }], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 2 });
    const g = gradeExam(ex, { cp: A.composite({ a: A.text("b") }, {}), q2: A.text("b") });
    expect(g.questions.map(q => [q.questionId, q.score, q.countedMaxMarks, q.manualReview])).toEqual([["cp", 0, 2, true], ["q2", 0, 0, false]]);
    expect(g.manualReviewMarks).toBe(2);
    expect(ingest({ ...FB(), questionTypeVersion: 99 }, choice(3))).toEqual({ answers: { fb: choice(3) }, rejected: [] });   // E-4 (documented)
    const noPipes = { ...ORD(), text: "رتّب\n| أ | ب\n|---|---\n| 1 | 2" };
    expect(ingest(noPipes, table(["1"])).rejected).toEqual([{ id: "ord", code: "ANSWER_KIND_MISMATCH" }]);
    expect(ingest(SA(), { kind: "sequence", values: [..."x".repeat(70000)].map(() => "x") }).rejected).toEqual([{ id: "sa", code: "ANSWER_KIND_MISMATCH" }]);
  });
  it("RF1-F4b a compound part's type is `type || presentationType` everywhere (grading, first-N and ingest bind the SAME part node): a stray presentationType never lends a part another type's kinds", () => {
    const cq = { examQuestionId: "f1", presentationType: "compound", text: "م", marks: 7, parts: [{ id: "a", type: "fillBlank", presentationType: "multipleChoice", text: "?", marks: 7, fields: [{ id: "b1", label: "1", correct: "4" }], options: [{ text: "1" }, { text: "4" }], answer: { values: ["4"] } }] };
    const forged = { kind: "compound", parts: { a: choice(3) } };
    expect(normalizeDraftAnswers({ f1: forged }, exam([cq])).rejected).toEqual([{ id: "f1.a", code: "ANSWER_KIND_MISMATCH" }]);
    const ex = exam([cq, { ...MC(), examQuestionId: "f2" }], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 7 });
    const g = gradeExam(ex, { f1: forged, f2: choice(1) });
    expect(g.questions.map(q => [q.questionId, q.score, q.countedMaxMarks])).toEqual([["f1", 0, 0], ["f2", 7, 7]]);
  });
  it("RF1-SIM a simulation state on a legacy question keeps its historical ingest path (20G.1 D3-A' pin) but can never score or take a first-N slot", () => {
    const state = { kind: "simulation", state: { count: 3 } };
    expect(ingest(FB(), state)).toEqual({ answers: { fb: state }, rejected: [] });
    expect(grade(FB(), state)).toEqual(FAIL_CLOSED(7));
    const g = gradeExam(exam([FB(), { ...MC(), examQuestionId: "f2" }], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 7 }), { fb: state, f2: choice(1) });
    expect(g.questions.map(q => [q.questionId, q.score, q.countedMaxMarks])).toEqual([["fb", 0, 0], ["f2", 7, 7]]);
  });
  it("RF1-GRID a tableFill with a grid and NO text table keeps its catalog table kind (20G.1 D3 pins): nothing is drawable, so the table grader finds no rows and a table answer can never score", () => {
    const grid = { ...TBL(), text: "املأ", tableHeaders: ["العمود 1", "العمود 2"], tableRows: [["الصف", ""]], answer: { text: "", values: ["A"] } };
    expect(ingest(grid, table(["A", "B"])).rejected).toEqual([]);
    expect(grade(grid, table([false, false])).score).toBe(0);
    expect(grade(grid, table(["A", "B"])).score).toBe(0);
  });
});
