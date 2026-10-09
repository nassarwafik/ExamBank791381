import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { parseStructuredExamJson, canonicalizeType } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { validateRichContent, projectRichContentForStudent, RICH_BLOCK_TYPES } from "../../../src/richContent/richContentModel";
import { buildComposerCatalog, catalogForPrompt, COMPOSER_RICH_BLOCKS } from "../../../src/aiComposer/composerCatalog";
import { mapAiRichBlocks } from "../../../src/aiComposer/composerRich";
import { rb } from "../../../src/aiComposer/testing/composerFakeAi";

// Phase 21A.2 — BEHAVIOURAL FAIL-FIRST suite. It imports ONLY modules that exist on the untouched baseline 6e4a5ef and drives the real seams
// a function graph must cross: the rich-content authority, the structured-exam import (unknown question type), finalization, the server's
// answer ingest, grading, the student sanitizer, export → re-import and the AI composer's rich-block intake. Run on the baseline every
// assertion that names the new capability fails (the block is refused, the type is unknown, the answer is refused, the grade is 0 + review,
// the AI has no graph vocabulary); on the 21A.2 head they pass. The renderer / registry seams are in src/functionGraphs/functionGraphFailFirst.21a2.test.tsx.
const require_ = createRequire(import.meta.url);
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const { canonicalizeExamContent } = require_("../../src/lib/exam-canonical.js");

// ── fixtures (inline: a baseline run cannot import 21A.2 modules) ─────────────────────────────────────────────────────────────────────
const QUAD = () => ({
  version: 1, id: "g-quad", title: "منحنى الدالة التربيعية", description: "منحنى الدالة f(x) = x² − 4x + 3 مع أربع نقاط مميزة.",
  viewport: { xMin: -2, xMax: 6, yMin: -3, yMax: 8 },
  axes: { x: { label: "x", grid: true }, y: { label: "y", grid: true } },
  curves: [{ id: "f", kind: "explicit", label: "f(x) = x^2 - 4x + 3", expression: "x^2 - 4*x + 3" }],
  points: [
    { id: "p1", x: 1, y: 0, label: "A", role: "root", on: ["f"] },
    { id: "p2", x: 3, y: 0, label: "B", role: "root", on: ["f"] },
    { id: "p3", x: 2, y: -1, label: "C", role: "minimum", on: ["f"] },
    { id: "p4", x: 0, y: 3, label: "D", role: "yIntercept", on: ["f"] }
  ]
});
const RATIONAL = () => ({
  version: 1, id: "g-rat", title: "الدالة الكسرية", description: "منحنى g(x) = 1/(x − 2) وخطّا التقارب.",
  viewport: { xMin: -4, xMax: 8, yMin: -6, yMax: 6 },
  curves: [{ id: "g", kind: "explicit", label: "g(x) = 1/(x - 2)", expression: "1/(x - 2)" }],
  lines: [{ id: "l1", orientation: "vertical", value: 2, label: "x = 2", role: "asymptote" }, { id: "l2", orientation: "horizontal", value: 0, label: "y = 0", role: "asymptote" }]
});
const para = text => ({ type: "paragraph", runs: [{ text }] });
const doc = (...blocks) => ({ schemaVersion: 1, blocks });
const graphBlock = graph => ({ type: "functionGraph", graph });
const EXAM = () => ({
  schemaVersion: 2, examId: "FG21A2-FAIL-FIRST", title: "رسوم الدوال — اختبار الإخفاق أولًا", status: "draft", metadata: {},
  sections: [{
    id: "s1", title: "أ — رسوم الدوال", gradingPolicy: "all",
    questions: [
      { examQuestionId: "q1", presentationType: "functionGraphSelection", questionTypeVersion: 1, text: "حدّد على الرسم جذري الدالة.", marks: 4,
        functionGraphSelection: { v: 1, graph: QUAD(), target: "point", mode: "multiple", maxSelections: 2 }, answer: { scoring: "partial", correct: ["point:p1", "point:p2"] } },
      { examQuestionId: "q2", presentationType: "multipleChoice", text: "ما معادلة خط التقارب الرأسي؟", marks: 2, options: [{ text: "x = 2" }, { text: "y = 2" }, { text: "x = 0" }],
        richContent: doc(para("ادرس الرسم التالي."), graphBlock(RATIONAL()), para("ما معادلة خط التقارب الرأسي؟")), answer: { correctOptionIndex: 0 } },
      { examQuestionId: "q3", presentationType: "functionGraphSelection", questionTypeVersion: 1, text: "حدّد خط التقارب الرأسي.", marks: 2,
        functionGraphSelection: { v: 1, graph: RATIONAL(), target: "line", mode: "single", maxSelections: 1 }, answer: { scoring: "allOrNothing", correct: ["line:l1"] } }
    ]
  }]
});
const sel = (graphId, ...targets) => ({ kind: "functionGraphSelection", graphId, targets });
const qs = e => e.sections.flatMap(s => s.questions);
const graphsOf = e => qs(e).map(q => (q.functionGraphSelection ? q.functionGraphSelection.graph : (q.richContent.blocks.find(b => b.type === "functionGraph") || {}).graph));

describe("21A2-FF1 rich content: the functionGraph block", () => {
  it("is a rich block type; a document with a graph validates, canonicalizes to itself and is projected to students unchanged", () => {
    expect(RICH_BLOCK_TYPES).toContain("functionGraph");
    const d = doc(para("ادرس المنحنى."), graphBlock(QUAD()));
    const r = validateRichContent(d);
    expect(r.issues).toEqual([]);
    expect(r.value).toEqual(d);
    expect(projectRichContentForStudent(d)).toEqual(d);
  });
  it("an executable-looking or unknown expression is refused by the graph authority (not as an unknown block)", () => {
    for (const expression of ["alert(1)", "constructor", "x^2; fetch(1)", "sin(x"]) {
      const g = QUAD(); g.curves[0].expression = expression;
      const r = validateRichContent(doc(graphBlock(g)));
      expect(r.ok, expression).toBe(false);
      expect(r.issues.map(i => i.code), expression).toContain("RICH_CONTENT_FUNCTION_GRAPH");
    }
  });
});

describe("21A2-FF2 question type, import and finalization", () => {
  it("functionGraphSelection is a known question type", () => {
    expect(canonicalizeType("functionGraphSelection")).toMatchObject({ type: "functionGraphSelection", known: true });
  });
  it("the structured import opens the exam with no parse error and no validation error; every graph survives exactly", () => {
    const imp = parseStructuredExamJson(JSON.stringify(EXAM()), "fg.json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(i => i.severity === "error")]).toEqual([true, [], []]);
    expect(graphsOf(imp.exam)).toEqual(graphsOf(EXAM()));
    expect(qs(imp.exam).map(q => q.answer)).toEqual(qs(EXAM()).map(q => q.answer));
  });
  it("finalization has no blocker", () => {
    expect(evaluateExamFinalization(EXAM()).blockers.map(b => b.message)).toEqual([]);
  });
  it("export → re-import → canonical server content keep the mathematics byte-for-byte (no destructive normalization)", () => {
    const saved = toSavedStructuredExam(parseStructuredExamJson(JSON.stringify(EXAM()), "fg.json").exam);
    expect(graphsOf(saved)).toEqual(graphsOf(EXAM()));
    const again = parseStructuredExamJson(JSON.stringify(saved), "re-export.json");
    expect(again.canOpen).toBe(true);
    expect(graphsOf(again.exam)).toEqual(graphsOf(EXAM()));
    expect(graphsOf(canonicalizeExamContent(EXAM()))).toEqual(graphsOf(EXAM()));
  });
});

describe("21A2-FF3 answer ingest, grading and the student projection (server authority)", () => {
  it("semantic graph answers are accepted at ingest, rebuilt exactly; forged targets / graphs / extra fields are refused or dropped", () => {
    const ok = normalizeDraftAnswers({ q1: sel("g-quad", "point:p1", "point:p2"), q3: { ...sel("g-rat", "line:l1"), score: 2, correct: true, x: 2 } }, EXAM());
    expect(ok.rejected).toEqual([]);
    expect(ok.answers).toEqual({ q1: sel("g-quad", "point:p1", "point:p2"), q3: sel("g-rat", "line:l1") });
    const bad = normalizeDraftAnswers({ q1: sel("g-quad", "point:p9"), q3: sel("g-quad", "line:l1"), q2: sel("g-rat", "line:l1") }, EXAM());
    expect(bad.rejected.map(r => [r.id, r.code]).sort()).toEqual([["q1", "GRAPH_SELECTION_TARGET_UNKNOWN"], ["q2", "GRAPH_SELECTION_QUESTION_MISMATCH"], ["q3", "GRAPH_SELECTION_GRAPH_MISMATCH"]]);
    expect(bad.answers).toEqual({});
  });
  it("grading is server-authoritative on semantic ids: full, partial (Jaccard) and wrong selections; never a manual-review zero", () => {
    const full = gradeExam(EXAM(), { q1: sel("g-quad", "point:p1", "point:p2"), q2: { kind: "choice", index: 0 }, q3: sel("g-rat", "line:l1") });
    expect(full.score).toBe(8);
    const partial = gradeExam(EXAM(), { q1: sel("g-quad", "point:p1"), q3: sel("g-rat", "line:l2") });
    expect(partial.score).toBe(2);
    expect(JSON.stringify(partial)).not.toMatch(/"manualReview":true/);
  });
  it("the student receives the graph and the public selection config only: no key, no point roles, no on-curve claims", () => {
    const p = sanitizeExamForStudent(EXAM(), { parametric: { assignmentId: "a", studentId: "s", attemptNumber: 1 } });
    const q1 = qs(p).find(q => q.examQuestionId === "q1");
    expect(q1.functionGraphSelection.graph.curves).toEqual(QUAD().curves);
    expect(q1.functionGraphSelection.graph.points).toEqual(QUAD().points.map(({ role, on, ...rest }) => rest));
    expect(q1.functionGraphSelection).toMatchObject({ v: 1, target: "point", mode: "multiple", maxSelections: 2 });
    expect(JSON.stringify(p)).not.toMatch(/"correct"|"scoring"|"root"|"minimum"|"yIntercept"/);
    expect(qs(p).find(q => q.examQuestionId === "q2").richContent.blocks[1]).toEqual(graphBlock(RATIONAL()));
  });
});

describe("21A2-FF4 AI composer: graphs only from an explicitly stated function", () => {
  const AI_GRAPH = (over = {}) => ({ title: "منحنى الدالة", description: "منحنى الدالة المعطاة.", xMin: -2, xMax: 6, yMin: -3, yMax: 8, curves: [{ label: "f(x)", expression: "x^2 - 4*x + 3", domainMin: null, domainMax: null }], ...over });
  const policy = request => ({ request, illustrative: false, charts: true });
  it("the catalog offers the functionGraph block and states the function-graph contract", () => {
    expect(COMPOSER_RICH_BLOCKS).toContain("functionGraph");
    const lines = catalogForPrompt(buildComposerCatalog()).split("\n");
    expect(lines.find(l => l.startsWith("Function graphs: "))).toBeTruthy();
  });
  it("an explicit request is mapped to a valid graph with the teacher's expression and viewport; a request that never states the function is refused", () => {
    const r = mapAiRichBlocks([{ ...rb("functionGraph"), graph: AI_GRAPH() }], "stem", policy("ارسم منحنى الدالة f(x) = x^2 - 4x + 3 حيث x من -2 إلى 6 و y من -3 إلى 8"));
    expect(r.ok).toBe(true);
    const g = r.richContent.blocks[0].graph;
    expect([r.richContent.blocks[0].type, g.curves[0].expression, g.viewport]).toEqual(["functionGraph", "x^2 - 4*x + 3", { xMin: -2, xMax: 6, yMin: -3, yMax: 8 }]);
    // the same descriptor against a request that states the viewport but only DESCRIBES the function: refused on the expression itself
    const guessed = mapAiRichBlocks([{ ...rb("functionGraph"), graph: AI_GRAPH() }], "stem", policy("ارسم دالة تربيعية جذراها 1 و 3 حيث x من -2 إلى 6 و y من -3 إلى 8"));
    expect(guessed.ok).toBe(false);
    expect(guessed.issues.map(i => i.path)).toEqual(["stem[0].graph.curves[0].expression"]);
  });
});
