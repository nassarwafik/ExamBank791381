import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import * as K from "./certification-20g/kit.js";

// Phase 20G.3 — LEGACY TABLE GRADING SEMANTICS (L-F2 of the 20G.2 review). A legacy question whose text holds a markdown table is drawn by
// StudentQuestionCard with one control per data row: a <select> when the row has options (resolveTableRowOptions), a checkbox when the question
// text is check-box phrasing (tableCheckbox), otherwise a free-text input. The baseline grader ignored that: any answer.text without row=value
// pairs switched EVERY row to "check-mark" mode (expected = answer.text includes the row label), so blank / unticked / arbitrary cells on a
// table whose key names no row earned full marks; and the denominator was min(rows, sent cells), so the sparse array the UI sends for a table
// answered on its first row only was graded out of 1. After 20G.3 a table is auto-graded ONLY with positive, server-owned authority:
//   KEYED    — a row=value key giving every rendered row a non-empty expected value (select rows: one of the offered options);
//   CHECKBOX — every row is drawn as a checkbox AND answer.text lists the rows to tick by exact (tokenized) label membership;
//   otherwise MANUAL (0, teacher review). The denominator is always the number of rendered rows.
// Cases T01 … T30 of the directive (+ the extra defects found by the audit); the ones that only PIN existing behaviour say "(pin)".
const require_ = createRequire(import.meta.url);
const { gradeQuestion, gradeExam } = require_("../src/lib/assignment-grading.js");
const { normalizeDraftAnswers } = require_("../src/lib/draft-answers.js");
const { A } = K;

const grade = (q, r) => { const g = gradeQuestion(q, r); return { score: g.score, maxMarks: g.maxMarks, correct: g.correct, manualReview: g.manualReview }; };
const REVIEW = max => ({ score: 0, maxMarks: max, correct: false, manualReview: true });
const table = values => ({ kind: "table", values });
const exam = (questions, policy) => ({ examId: "TBL-20G3", title: "T", sections: [{ id: "s1", title: "s", gradingPolicy: "all", ...(policy || {}), questions }] });
const ingest = (q, answer) => normalizeDraftAnswers({ [q.examQuestionId]: answer }, exam([q]));
// what StudentExamPage.setTable builds: a copy of the previous values with ONE index set — a sparse array (holes serialize to null)
const uiTable = (...cells) => { let v = []; for (const [i, x] of cells) { v = [...v]; v[i] = x; } return JSON.parse(JSON.stringify(table(v))); };

// L-F2: a shortAnswer whose stem holds a DATA table (the card draws text inputs per row) and whose key names no row
const STEM = "من الجدول، ما قناع الشبكة؟\n| الجهاز | IP |\n|---|---|\n| PC1 | 10.0.0.5 |\n| PC2 | 10.0.0.6 |";
const LF2 = () => ({ examQuestionId: "lf2", presentationType: "shortAnswer", text: STEM, marks: 4, answer: { text: "255.255.255.0" } });
// KEYED, free-text cells (F-series style key with the Arabic separator)
const KT = () => ({ examQuestionId: "kt", presentationType: "shortAnswer", text: "أكمل\n| الجهاز | الطبقة |\n|---|---|\n| Router | |\n| Switch | |\n| Hub | |", marks: 6, answer: { text: "Router=3؛ Switch=2؛ Hub=1" } });
// KEYED, select cells (the structured builder's matching editor: buildMatchingPatch)
const OPTS = [{ text: "تطبيقات" }, { text: "شبكة" }, { text: "ربط" }];
const MT = () => ({ examQuestionId: "mt", presentationType: "matching", text: "| البروتوكول | الطبقة |\n| --- | --- |\n| HTTP |  |\n| IP |  |\n| Ethernet |  |", marks: 6,
  fields: [{ id: "m0", label: "HTTP", kind: "select", options: OPTS, correct: "تطبيقات" }, { id: "m1", label: "IP", kind: "select", options: OPTS, correct: "شبكة" }, { id: "m2", label: "Ethernet", kind: "select", options: OPTS, correct: "ربط" }],
  answer: { text: "HTTP=تطبيقات;IP=شبكة;Ethernet=ربط" } });
// CHECKBOX: check-box phrasing (tableCheckbox), no row options (every row is a checkbox), a key listing the rows to tick
const CB = () => ({ examQuestionId: "cb", presentationType: "tableFill", text: "وضع علامة ✓ أمام العناوين الخاصة\n| العنوان | خاص |\n|---|---|\n| 10.0.0.1 | |\n| 8.8.8.8 | |\n| 192.168.1.10 | |", marks: 6, answer: { text: "10.0.0.1، 192.168.1.10" } });
// boolean SELECT rows (field.kind "boolean" → a صحيح/غير صحيح select emitting "true"/"false")
const BS = (answerText, text = "صنّف\n| العبارة | الحكم |\n|---|---|\n| R1 | |\n| R2 | |") => ({ examQuestionId: "bs", presentationType: "tableFill", text, marks: 4, fields: [{ id: "f0", kind: "boolean" }, { id: "f1", kind: "boolean" }], answer: { text: answerText } });

describe("20G.3 L-F2 — knowledge-free table credit is gone", () => {
  it("T01 / T02 the exact L-F2 case: a data table drawn as TEXT inputs, a key naming no row → 0 + teacher review (baseline: 4/4 for any cells)", () => {
    for (const r of [uiTable([0, "x"]), table(["x", "y"]), table(["", ""]), table([false, false]), table(["255.255.255.0"])]) {
      expect(grade(LF2(), r), JSON.stringify(r)).toEqual(REVIEW(4));
      expect(ingest(LF2(), r).rejected, JSON.stringify(r)).toEqual([]);      // a valid table answer: stored, graded by a teacher (20G.2 binding unchanged)
    }
  });
  it("T03 / T04 an ordinary text-input table with unrelated prose, or with no key at all, is never auto-graded", () => {
    expect(grade({ ...LF2(), answer: { text: "الإجابة موجودة في الجدول" } }, table(["x", "y"]))).toEqual(REVIEW(4));
    expect(grade({ ...LF2(), answer: { text: "" } }, table(["x", "y"]))).toEqual(REVIEW(4));
    expect(grade({ ...LF2(), answer: {} }, table(["x", "y"]))).toEqual(REVIEW(4));
  });
  it("T13 a text-input table whose key happens to name its rows (check-mark phrasing absent) never reaches boolean grading", () => {
    const q = { ...LF2(), answer: { text: "PC1" } };
    for (const r of [table([true, false]), table(["true", ""]), table(["1", "0"])]) expect(grade(q, r), JSON.stringify(r)).toEqual(REVIEW(4));
  });
});

describe("20G.3 KEYED row=value tables keep their grades (pins) — and are graded out of EVERY rendered row", () => {
  it("T05 / T06 / T07 full, partial and all-wrong keyed answers grade exactly as before (pin)", () => {
    expect(grade(KT(), table(["3", "2", "1"]))).toEqual({ score: 6, maxMarks: 6, correct: true, manualReview: false });
    expect(grade(KT(), table(["3", "x", "1"]))).toEqual({ score: 4, maxMarks: 6, correct: false, manualReview: false });
    expect(grade(KT(), table(["9", "9", "9"]))).toEqual({ score: 0, maxMarks: 6, correct: false, manualReview: false });
    expect(grade(MT(), table(["تطبيقات", "شبكة", "ربط"]))).toEqual({ score: 6, maxMarks: 6, correct: true, manualReview: false });
    expect(grade(MT(), table(["شبكة", "شبكة", "ربط"]))).toEqual({ score: 4, maxMarks: 6, correct: false, manualReview: false });
  });
  it("T27 key and cell normalization (case, whitespace, NFKC, tatweel, Arabic / Latin separators) is unchanged (pin)", () => {
    const q = { ...KT(), answer: { text: " router = 3 ;SWITCH=2؛hub =1 " } };
    expect(grade(q, table([" 3", "2 ", "1"])).score).toBe(6);
    expect(grade({ ...MT(), answer: { text: "http=تطبيـقات؛ ip=شبكة; ethernet=ربط" } }, table(["تطبيقات", "شبكة", "ربط"])).score).toBe(6);
  });
  it("T21 extra cells beyond the rendered rows never change the grade (pin)", () => {
    expect(grade(KT(), table(["3", "2", "1", "9", "9"])).score).toBe(6);
  });
  it("T20 / T22 fewer cells (the UI's sparse array: a table answered on its first row only) are graded out of EVERY row — not inflated (baseline: 6/6)", () => {
    expect(grade(KT(), uiTable([0, "3"]))).toEqual({ score: 2, maxMarks: 6, correct: false, manualReview: false });
    expect(grade(KT(), uiTable([1, "2"]))).toEqual({ score: 2, maxMarks: 6, correct: false, manualReview: false });   // [null, "2"]
    expect(grade(MT(), uiTable([0, "تطبيقات"]))).toEqual({ score: 2, maxMarks: 6, correct: false, manualReview: false });
  });
  it("T30' a keyed table whose key gives a row an EMPTY expected value, misses a row, names no row, or conflicts → teacher review, never a guess (baseline credited a blank cell for 'Router=')", () => {
    expect(grade({ ...KT(), answer: { text: "Router=;Switch=2;Hub=1" } }, table(["", "2", "1"]))).toEqual(REVIEW(6));
    expect(grade({ ...KT(), answer: { text: "Switch=2;Hub=1" } }, table(["3", "2", "1"]))).toEqual(REVIEW(6));
    expect(grade({ ...KT(), answer: { text: "a=b;c=d" } }, table(["3", "2", "1"]))).toEqual(REVIEW(6));
    expect(grade({ ...KT(), answer: { text: "Router=3;Router=4;Switch=2;Hub=1" } }, table(["3", "2", "1"]))).toEqual(REVIEW(6));
  });
  it("T14' a SELECT row whose key expects a value its select never offers (LIB-F06-Q41 shape: an option index) → teacher review, not a silent 0", () => {
    expect(grade({ ...MT(), answer: { text: "HTTP=1;IP=2;Ethernet=3" } }, table(["تطبيقات", "شبكة", "ربط"]))).toEqual(REVIEW(6));
  });
  it("T12 a boolean SELECT table is graded only by an explicit row=true/false key; a check-mark style key never grades it", () => {
    expect(grade(BS("R1=true;R2=false"), table(["true", "false"]))).toEqual({ score: 4, maxMarks: 4, correct: true, manualReview: false });
    expect(grade(BS("R1=true;R2=false"), table(["false", "false"])).score).toBe(2);
    // check-box phrasing + a membership key — but the rows are SELECTS, so no check-mark grading (baseline: 4/4 for ["true","false"] / 2 for all-false)
    const phrased = BS("R1", "وضع علامة\n| العبارة | الحكم |\n|---|---|\n| R1 | |\n| R2 | |");
    expect(grade(phrased, table(["true", "false"]))).toEqual(REVIEW(4));
    expect(grade(phrased, table(["false", "false"]))).toEqual(REVIEW(4));
  });
  it("T23 duplicate row labels make a key unable to tell the rows apart → teacher review", () => {
    const dup = { ...KT(), text: "أكمل\n| الجهاز | الطبقة |\n|---|---|\n| Router | |\n| Router | |\n| Hub | |", answer: { text: "Router=3;Hub=1" } };
    expect(grade(dup, table(["3", "3", "1"]))).toEqual(REVIEW(6));
  });
  it("T24 a blank row label has no key authority → teacher review (keyed and check-box)", () => {
    expect(grade({ ...KT(), text: "أكمل\n| الجهاز | الطبقة |\n|---|---|\n|  | |\n| Switch | |", answer: { text: "=3;Switch=2" } }, table(["3", "2"]))).toEqual(REVIEW(6));
    expect(grade({ ...CB(), text: "وضع علامة\n| العنوان | خاص |\n|---|---|\n|  | |\n| 10.0.0.1 | |", answer: { text: "10.0.0.1" } }, table([true, true]))).toEqual(REVIEW(6));
  });
});

describe("20G.3 CHECKBOX tables — only with check-box rows AND a key listing the rows to tick", () => {
  it("T08 / T09 / T10 the check-box table grades ticked rows by exact membership: full, partial, wrong", () => {
    expect(grade(CB(), table([true, false, true]))).toEqual({ score: 6, maxMarks: 6, correct: true, manualReview: false });
    expect(grade(CB(), table([true, true, true]))).toEqual({ score: 4, maxMarks: 6, correct: false, manualReview: false });
    expect(grade(CB(), table([false, true, false]))).toEqual({ score: 0, maxMarks: 6, correct: false, manualReview: false });
  });
  it("T13' an all-unticked check-box answer is UNANSWERED (isResponseAnswered) and earns nothing — no credit for rows the key leaves unticked (baseline: 2/6)", () => {
    expect(grade(CB(), table([false, false, false]))).toEqual({ score: 0, maxMarks: 6, correct: false, manualReview: false });
    expect(grade(CB(), table([null, null, null]))).toEqual({ score: 0, maxMarks: 6, correct: false, manualReview: false });
  });
  it("T20' a check-box answer ticked on its first row only is graded out of every row (baseline: 6/6)", () => {
    expect(grade(CB(), uiTable([0, true]))).toEqual({ score: 4, maxMarks: 6, correct: false, manualReview: false });   // row 1 ✓, row 2 (unticked, expected unticked) ✓, row 3 ✗
  });
  it("T11 a check-box table whose key names NO row (or names a row that does not exist) cannot tell ticked from unticked → teacher review", () => {
    expect(grade({ ...CB(), answer: { text: "العناوين الخاصة" } }, table([true, false, true]))).toEqual(REVIEW(6));
    expect(grade({ ...CB(), answer: { text: "10.0.0.1، 172.16.0.1" } }, table([true, false, true]))).toEqual(REVIEW(6));
    expect(grade({ ...CB(), answer: {} }, table([true, false, true]))).toEqual(REVIEW(6));
  });
  it("T25 substring row labels (IP / RIP, LAN / VLAN, HTTP / HTTPS, A / AA) are told apart by exact membership (baseline: substring includes)", () => {
    const q = { ...CB(), text: "وضع علامة\n| البروتوكول | توجيه |\n|---|---|\n| IP | |\n| RIP | |\n| LAN | |\n| VLAN | |\n| HTTP | |\n| HTTPS | |\n| A | |\n| AA | |", marks: 8, answer: { text: "RIP، VLAN، HTTPS، AA" } };
    expect(grade(q, table([false, true, false, true, false, true, false, true]))).toEqual({ score: 8, maxMarks: 8, correct: true, manualReview: false });
    expect(grade(q, table([true, true, true, true, true, true, true, true])).score).toBe(4);
  });
  it("T26 Arabic labels — one a whole-word prefix of another — are told apart; Arabic list separators are honoured", () => {
    const q = { ...CB(), text: "وضع علامة\n| الشبكة | خاصة |\n|---|---|\n| الشبكة | |\n| الشبكة الخاصة | |\n| الشبكة العامة | |", marks: 6, answer: { text: "الشبكة الخاصة؛ الشبكة العامة" } };
    expect(grade(q, table([false, true, true]))).toEqual({ score: 6, maxMarks: 6, correct: true, manualReview: false });
    expect(grade(q, table([true, true, true])).score).toBe(4);
  });
  it("T08' only the check-box phrasing makes check-box rows (the renderer's tableCheckbox): the same table without it is a text-input table → review", () => {
    expect(grade({ ...CB(), text: CB().text.replace("وضع علامة ✓ أمام", "حدّد") }, table([true, false, true]))).toEqual(REVIEW(6));
    // ✓ alone and the private? phrasing are check-box phrasing too
    expect(grade({ ...CB(), text: CB().text.replace("وضع علامة ✓ أمام", "✓") }, table([true, false, true])).score).toBe(6);
    expect(grade({ ...CB(), text: CB().text.replace("وضع علامة ✓ أمام العناوين الخاصة", "private?") }, table([true, false, true])).score).toBe(6);
  });
  it("T29' check-box rows accept only genuine ticks (true / 'true' / '1' / '✓', the historical set); anything else is unticked", () => {
    expect(grade(CB(), table(["✓", "", "1"])).score).toBe(6);
    expect(grade(CB(), table(["yes", "x", "on"]))).toEqual({ score: 0, maxMarks: 6, correct: false, manualReview: false });   // no tick → unanswered
  });
});

describe("20G.3 tableFill, placement (20G.2) and answer-kind authority are unchanged", () => {
  it("T14 / T15 a tableFill grid keeps its historical table answer at ingest (graded to review: nothing drawable) and its field-set grading (pin)", () => {
    const grid = { examQuestionId: "tg", presentationType: "tableFill", text: "املأ", marks: 2, tableHeaders: ["العمود 1", "العمود 2"], tableRows: [["الصف", ""]], fields: [{ id: "c1", label: "c1", correct: "A" }, { id: "c2", label: "c2", correct: "B" }], answer: { values: ["A", "B"] } };
    expect(ingest(grid, table(["A", "B"])).rejected).toEqual([]);
    expect(grade(grid, table(["A", "B"]))).toEqual(REVIEW(2));
    expect(grade(grid, { kind: "fields", values: { c1: "A", c2: "B" } })).toEqual({ score: 2, maxMarks: 2, correct: true, manualReview: false });
  });
  it("T16 / T17 a forged table on a compound part or a composite child is refused at ingest and fails closed (20G.2 placement, pin)", () => {
    const cq = { examQuestionId: "cq", presentationType: "compound", text: "م", marks: 6, parts: [{ id: "a", type: "matching", text: MT().text, marks: 6, fields: MT().fields, answer: MT().answer }] };
    const forged = { kind: "compound", parts: { a: table(["تطبيقات", "شبكة", "ربط"]) } };
    expect(normalizeDraftAnswers({ cq: forged }, exam([cq])).rejected).toEqual([{ id: "cq.a", code: "ANSWER_KIND_MISMATCH" }]);
    expect(gradeExam(exam([cq]), { cq: forged }).questions[0]).toMatchObject({ score: 0, manualReview: true });
    const node = K.composite("cp", "مركّب", 4, [], [K.group("g", "g", [K.part("a", "أ", { ...LF2(), marks: 4 })])]);
    const hostile = A.composite({ a: table(["x", "y"]) }, {});
    expect(normalizeDraftAnswers({ cp: hostile }, exam([node])).rejected).toEqual([{ id: "cp.a", code: "ANSWER_KIND_MISMATCH" }]);
    expect(gradeExam(exam([node]), { cp: hostile }).score).toBe(0);
  });
  it("T18 first-N: a genuinely answered table that needs review TAKES its slot (a valid answer awaiting a teacher), a forged part table never does", () => {
    const mc = { examQuestionId: "mc", presentationType: "multipleChoice", text: "اختر", marks: 4, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 } };
    const g = gradeExam(exam([LF2(), mc], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 4 }), { lf2: uiTable([0, "x"]), mc: A.choice(1) });
    expect(g.questions.map(q => [q.questionId, q.score, q.countedMaxMarks, q.manualReview, q.ignored])).toEqual([["lf2", 0, 4, true, false], ["mc", 0, 0, false, true]]);
    expect(g.manualReviewMarks).toBe(4);
    // a keyed table answered correctly takes the slot and scores
    const k = gradeExam(exam([KT(), mc], { gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 6 }), { kt: table(["3", "2", "1"]), mc: A.choice(1) });
    expect(k.questions.map(q => [q.questionId, q.score, q.countedMaxMarks])).toEqual([["kt", 6, 6], ["mc", 0, 0]]);
  });
  it("T19 old stored L-F2-shaped answers passed straight to gradeExam regrade safely (no migration needed for grading safety)", () => {
    const g = gradeExam(exam([LF2(), { ...KT(), examQuestionId: "kt" }]), { lf2: table(["", ""]), kt: uiTable([0, "3"]) });
    expect(g.questions.map(q => [q.questionId, q.score, q.manualReview])).toEqual([["lf2", 0, true], ["kt", 2, false]]);
  });
  it("T28 prototype-shaped stored values / keys never earn credit or crash", () => {
    expect(grade(KT(), table([{ toString: null }, ["3"], { valueOf: 1 }])).score).toBe(0);
    expect(grade({ ...KT(), answer: { text: "__proto__=3;constructor=2;Hub=1" } }, table(["3", "2", "1"]))).toEqual(REVIEW(6));
    expect(ingest(KT(), table([{ a: 1 }])).rejected).toEqual([{ id: "kt", code: "ANSWER_INVALID" }]);
  });
  it("T29 unknown structured types stay under the 16A / 20G.2 authority (fail closed), a typeless table follows the table rules", () => {
    expect(gradeQuestion({ ...LF2(), presentationType: "weirdLegacy" }, table(["x"]))).toMatchObject({ score: 0, manualReview: true, unsupportedType: true });
    const typeless = { examQuestionId: "tl", text: STEM, marks: 4, answer: { text: "255.255.255.0" } };
    expect(grade(typeless, table(["x", "y"]))).toEqual(REVIEW(4));
    expect(grade({ ...typeless, answer: { text: "PC1=a;PC2=b" } }, table(["a", "b"])).score).toBe(4);
  });
  it("T30 modern registered types are untouched by the table grader even with a table in their text (pin)", () => {
    const num = { examQuestionId: "nr", presentationType: "numericResponse", text: STEM, marks: 2, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 4, tolerance: 0 } };
    const before = gradeQuestion(num, { kind: "numeric", value: "4" });
    expect(before.manualReview).toBe(false);
    expect(before.score).toBe(2);
    // a forged table on it is the registered type's business (its own binder / grader), never the legacy table grader
    expect(gradeQuestion(num, table(["4"]))).toMatchObject({ score: 0 });
  });
});

// Added after mutation round 1 (survivors M07 / M15 / M18 / M20 of the design-specific plants): each closes a gap the campaign proved.
describe("20G.3 keyed check-box rows, drawn-row answered-ness and key parsing (mutation round 1 additions)", () => {
  const CBK = key => ({ ...CB(), answer: { text: key } });
  it("T31 a check-box table keyed row=true / row=false grades the TICKS the card sends: unticked (never touched → null) rows read as false", () => {
    const q = CBK("10.0.0.1=true; 8.8.8.8=false; 192.168.1.10=true");
    expect(grade(q, uiTable([0, true], [2, true]))).toEqual({ score: 6, maxMarks: 6, correct: true, manualReview: false });   // [true, null, true]
    expect(grade(q, uiTable([0, true]))).toEqual({ score: 4, maxMarks: 6, correct: false, manualReview: false });
    expect(grade(q, table([true, true, true]))).toEqual({ score: 4, maxMarks: 6, correct: false, manualReview: false });
  });
  it("T32 a check-box row keyed with anything but true / false (نعم / لا / ✓) cannot say ticked or unticked → teacher review", () => {
    for (const key of ["10.0.0.1=نعم; 8.8.8.8=لا; 192.168.1.10=نعم", "10.0.0.1=✓; 8.8.8.8=; 192.168.1.10=✓", "10.0.0.1=1; 8.8.8.8=0; 192.168.1.10=1"])
      expect(grade(CBK(key), table([true, false, true])), key).toEqual(REVIEW(6));
  });
  it("T33 answered-ness is decided on the DRAWN rows only: a tick sent beyond the last row neither answers the table nor earns unticked rows", () => {
    expect(grade(CB(), table([false, false, false, true]))).toEqual({ score: 0, maxMarks: 6, correct: false, manualReview: false });
    expect(grade(CBK("10.0.0.1=false; 8.8.8.8=false; 192.168.1.10=true"), table([null, null, null, true, "x"]))).toEqual({ score: 0, maxMarks: 6, correct: false, manualReview: false });
  });
  it("T34 a key value containing '=' keeps everything after the FIRST '=' (historical pairMap parsing, pin)", () => {
    const q = { ...KT(), answer: { text: "Router=ip route 0.0.0.0 0.0.0.0 = gw؛ Switch=a=b؛ Hub=1" } };
    expect(grade(q, table(["ip route 0.0.0.0 0.0.0.0 = gw", "a=b", "1"]))).toEqual({ score: 6, maxMarks: 6, correct: true, manualReview: false });
  });
});

// ─── Review Fix 1 (independent review of ebf023c) ────────────────────────────────────────────────────────────────────────────────────────
// F1: a keyed check-box table whose key expects NO tick had a correct (ticked-then-unticked) answer graded a SILENT 0 and finalized — worse
// than the untouched table (teacher review). F2: malformed question `fields` crashed the grader (and the card). F4: a membership list split
// on `/` mis-graded a table whose labels contain the separator. F3: pins for the reviewer's surviving mutants.
describe("20G.3 Review Fix 1 — no silent zero for a correct all-unticked answer, no crash on malformed fields, ambiguous separators fail closed", () => {
  const ALL_FALSE = () => ({ examQuestionId: "af", presentationType: "tableFill", marks: 2, text: "ضع علامة ✓\n| Item | Ans |\n|---|---|\n| A | |\n| B | |", answer: { text: "A=false;B=false" } });
  it("RF1-F1 a key that expects every check-box row UNticked has nothing to tick: teacher review, never a silent 0 (ebf023c: 0, finalized; c2a49e9: 2/2)", () => {
    for (const r of [table([false, false]), uiTable([0, false]), table([null, null]), table([true, false])]) expect(grade(ALL_FALSE(), r), JSON.stringify(r)).toEqual(REVIEW(2));
    const g = gradeExam(exam([ALL_FALSE()]), { af: table([false, false]) });
    expect([g.score, g.manualReviewMarks, g.finalized]).toEqual([0, 2, false]);
    // a key with at least one row to tick keeps its keyed grade (T31)
    expect(grade({ ...ALL_FALSE(), answer: { text: "A=true;B=false" } }, table([true, false]))).toEqual({ score: 2, maxMarks: 2, correct: true, manualReview: false });
  });
  it("RF1-F2 malformed question fields never crash the grader: they are not row options (ebf023c: TypeError; c2a49e9: graded)", () => {
    const base = { examQuestionId: "mf", marks: 2, text: "| Item | Ans |\n|---|---|\n| A | |\n| B | |", answer: { text: "A=1;B=2" } };
    for (const fields of [[null], {}, [{ options: "ab" }], [{ options: [null] }], [{ options: [null, 7, { value: "1" }] }], [{ options: [{ value: "1" }, { value: "2" }] }, 5], "x"]) {
      expect(() => gradeQuestion({ ...base, fields }, table(["1", "2"])), JSON.stringify(fields)).not.toThrow();
      expect(() => gradeExam(exam([{ ...base, fields }]), { mf: table(["1", "2"]) }), JSON.stringify(fields)).not.toThrow();
    }
    expect(grade({ ...base, fields: [null] }, table(["1", "2"]))).toEqual({ score: 2, maxMarks: 2, correct: true, manualReview: false });   // no options → text rows
    expect(grade({ ...base, fields: [{ options: [null, { value: "1" }] }, { options: [{ value: "2" }] }] }, table(["1", "2"])).score).toBe(2);   // the non-object option is skipped
  });
  it("RF1-F4 a membership list cannot be split unambiguously when a row label itself contains a list separator → teacher review (ebf023c: 3/3)", () => {
    const q = { ...CB(), marks: 3, text: "وضع علامة\n| x | y |\n|---|---|\n| A | |\n| B | |\n| A/B | |", answer: { text: "A/B" } };
    expect(grade(q, table([true, true, false]))).toEqual(REVIEW(3));
    expect(grade(q, table([false, false, true]))).toEqual(REVIEW(3));
    expect(grade({ ...q, text: q.text.replace("A/B", "10.0.0.0/8"), answer: { text: "A" } }, table([true, false, false]))).toEqual(REVIEW(3));
    // keyed (row=value) grading of such labels is unambiguous and unchanged
    expect(grade({ ...KT(), text: "أكمل\n| a | b |\n|---|---|\n| TCP/IP | |\n| DNS, DHCP | |", marks: 4, answer: { text: "TCP/IP=4؛ DNS, DHCP=7" } }, table(["4", "7"])).score).toBe(4);
  });
  it("RF1-F3a (R01) a membership list separated by '/' is read as a list (pin)", () => {
    expect(grade({ ...CB(), answer: { text: "10.0.0.1 / 192.168.1.10" } }, table([true, false, true])).score).toBe(6);
    expect(grade({ ...CB(), answer: { text: "10.0.0.1 | 192.168.1.10" } }, table([true, false, true])).score).toBe(6);
  });
  it("RF1-F3b (R02) a MIXED table (check-box phrasing, one row with options) never enters membership grading → review", () => {
    const mixed = { ...CB(), fields: [{ id: "f0", kind: "select", options: [{ text: "a" }, { text: "b" }] }], answer: { text: "10.0.0.1" } };
    expect(grade(mixed, table(["a", false, false]))).toEqual(REVIEW(6));
    expect(grade(mixed, table([true, false, false]))).toEqual(REVIEW(6));
  });
  it("RF1-F3c (R03) every select row is checked against ITS OWN options; (R08) field.order maps a field to its row, not the array index", () => {
    const per = { ...MT(), fields: [{ id: "m0", kind: "select", options: [{ text: "x" }, { text: "y" }] }, { id: "m1", kind: "select", options: [{ text: "p" }, { text: "q" }] }, { id: "m2", kind: "select", options: [{ text: "r" }] }], answer: { text: "HTTP=x;IP=q;Ethernet=r" } };
    expect(grade(per, table(["x", "q", "r"])).score).toBe(6);
    expect(grade({ ...per, answer: { text: "HTTP=x;IP=r;Ethernet=r" } }, table(["x", "r", "r"]))).toEqual(REVIEW(6));   // "r" is not offered on row IP
    const ordered = { ...per, fields: [{ id: "m2", order: 2, kind: "select", options: [{ text: "r" }] }, { id: "m0", order: 0, kind: "select", options: [{ text: "x" }] }, { id: "m1", order: 1, kind: "select", options: [{ text: "q" }] }] };
    expect(grade(ordered, table(["x", "q", "r"])).score).toBe(6);
  });
  it("RF1-F3d (R15) a check-box row keyed ✓ / ✗ alone is neither true nor false → review", () => {
    expect(grade({ ...CB(), answer: { text: "10.0.0.1=✓; 8.8.8.8=false; 192.168.1.10=true" } }, table([true, false, true]))).toEqual(REVIEW(6));
    expect(grade({ ...CB(), answer: { text: "10.0.0.1=true; 8.8.8.8=✗; 192.168.1.10=true" } }, table([true, false, true]))).toEqual(REVIEW(6));
  });
  it("RF1-F3e (R07) an indented table is the same table; (R09) a word bank without fields never makes select rows; (R10) 'Private?' is check-box phrasing in any case", () => {
    expect(grade({ ...KT(), text: KT().text.split("\n").map(l => "   " + l + "  ").join("\n") }, table(["3", "2", "1"])).score).toBe(6);
    expect(grade({ ...KT(), wordBank: ["x", "y"] }, table(["3", "2", "1"])).score).toBe(6);                // text rows, keyed values not in the bank
    expect(grade({ ...CB(), text: CB().text.replace("وضع علامة ✓ أمام العناوين الخاصة", "PRIVATE?") }, table([true, false, true])).score).toBe(6);
  });
});
