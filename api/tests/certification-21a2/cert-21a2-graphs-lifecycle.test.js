import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { validateFunctionGraphSpec } from "../../../src/functionGraphs/functionGraphSpec";
import { GRAPHS_ACCEPTANCE_PATH } from "../../../scripts/function-graphs-21a2-exam.mjs";
const require_ = createRequire(import.meta.url);
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const { canonicalizeExamContent } = require_("../../src/lib/exam-canonical.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const load = () => JSON.parse(fs.readFileSync(path.join(root, GRAPHS_ACCEPTANCE_PATH), "utf8"));
const questions = e => e.sections.flatMap(s => s.questions);
const sel = (graphId, ...targets) => ({ kind: "functionGraphSelection", graphId, targets });
const perfect = () => ({
  a1: sel("g-quad", "point:p1", "point:p2"),
  b1: sel("g-rat", "line:l1"),
  c1: sel("g-sin", "point:q1"),
  d1: sel("g-piece", "point:m1"),
  e1: sel("g-meet", "point:e1", "point:e2"),
  f1: sel("g-tan", "tangent:t1"),
  g1: sel("g-area", "region:r1"),
  h1: sel("g-ar", "point:n1"),
  i1: { kind: "composite", parts: { part1: sel("g-circle", "curve:circ"), part2: { kind: "numeric", value: "2" } }, contexts: {} }
});

describe("21A2-LIFE acceptance exam, authority and grading", () => {
  it("all sections A–I import, export, preserve every expression and pass finalization", () => {
    const original = load();
    expect(original.sections.map(s => s.id)).toEqual(["sec-a","sec-b","sec-c","sec-d","sec-e","sec-f","sec-g","sec-h","sec-i"]);
    const imp = parseStructuredExamJson(JSON.stringify(original), "21a2.json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(x => x.severity === "error")]).toEqual([true, [], []]);
    expect(evaluateExamFinalization(original).blockers).toEqual([]);
    const saved = toSavedStructuredExam(imp.exam);
    const again = parseStructuredExamJson(JSON.stringify(saved), "again.json");
    expect(again.canOpen).toBe(true);
    expect(JSON.stringify(saved)).toContain("x^2 - 4*x + 3");
    expect(JSON.stringify(canonicalizeExamContent(original))).toContain("sin(x)");
  });
  it("all 10 graph configurations (including composite source and child) pass canonical bounds", () => {
    const exam = load();
    const configs = questions(exam).filter(q => q.functionGraphSelection).map(q => q.functionGraphSelection.graph);
    const composite = questions(exam).find(q => q.presentationType === "composite").composite;
    configs.push(composite.contexts[0].sources[0].richContent.blocks[1].graph);
    configs.push(composite.groups[0].parts[0].functionGraphSelection.graph);
    expect(configs).toHaveLength(10);
    for (const graph of configs) expect(validateFunctionGraphSpec(graph).issues, graph.id).toEqual([]);
  });
  it("PERFECT, PARTIAL, BLANK and forged answers are graded only by the server authority", () => {
    const exam = load();
    const all = perfect();
    expect(normalizeDraftAnswers(all, exam).rejected).toEqual([]);
    const good = gradeExam(exam, all);
    expect(good.score).toBe(38);
    const partial = { ...all, a1: sel("g-quad", "point:p1"), b1: sel("g-rat", "line:l3"), e1: sel("g-meet", "point:e1") };
    const p = gradeExam(exam, partial);
    expect(p.score).toBe(30);
    expect(gradeExam(exam, {}).score).toBe(0);
    const attacker = {
      a1: sel("g-quad", "point:p1", "point:p1"),
      b1: sel("g-quad", "line:l1"),
      c1: sel("g-sin", "point:q999"),
      h1: { ...sel("g-ar", "point:n2"), score: 999, correct: true, x: 0, y: 1 }
    };
    const n = normalizeDraftAnswers(attacker, exam);
    expect(n.rejected.map(x => [x.id, x.code]).sort()).toEqual([
      ["a1", "GRAPH_SELECTION_DUPLICATE"], ["b1", "GRAPH_SELECTION_GRAPH_MISMATCH"], ["c1", "GRAPH_SELECTION_TARGET_UNKNOWN"]
    ]);
    expect(n.answers.h1).toEqual(sel("g-ar", "point:n2"));
    expect(gradeExam(exam, n.answers).score).toBe(0);
  });
  it("student projection retains curves but never private keys, mathematical roles or on-curve proofs", () => {
    const publicExam = sanitizeExamForStudent(load(), { parametric: { assignmentId: "21a2", studentId: "student", attemptNumber: 1 } });
    const json = JSON.stringify(publicExam);
    expect(json).toContain('"functionGraphSelection"');
    expect(json).toContain("x^2 - 4*x + 3");
    expect(json).not.toMatch(/"correct"|"scoring"|"role"|"on"|"derivativeOf"|"slope"/);
    expect(questions(publicExam)[0].functionGraphSelection.graph.points).toHaveLength(4);
    // The rich SOURCE inside the composite must obey the same public graph projection as standalone stems.
    const shared = publicExam.sections[8].questions[0].composite.contexts[0].sources[0].richContent.blocks[1].graph;
    expect(shared.points[0]).not.toHaveProperty("role");
    expect(shared.points[0]).not.toHaveProperty("on");
  });
  it("scenario rich sources also remove teacher-only graph annotations without losing the curve", () => {
    const exam = load();
    const composite = exam.sections[8].questions[0].composite;
    const richSource = composite.contexts[0].sources[0];
    exam.sections[0].scenarios = [{ id: "scenario-graph", version: 1, sources: [richSource], questionIds: ["a1"] }];
    const projected = sanitizeExamForStudent(exam);
    expect(projected.sections[0].scenarios).toHaveLength(1);
    const graph = projected.sections[0].scenarios[0].sources[0].richContent.blocks[1].graph;
    // The shared circle source contains a parametric circle AND a straight line.
    expect(graph.curves).toHaveLength(2);
    expect(graph.points[0]).not.toHaveProperty("role");
    expect(graph.points[0]).not.toHaveProperty("on");
  });
});
