import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { REACTIONS_ACCEPTANCE_PATH } from "./reactionsExam.js";
import { A } from "../certification-20g/kit.js";

// Phase 21D-D.2 — the chemistryReactions@1 acceptance exam through the PRODUCTION API authorities (the compiled shared build): import →
// save → re-import, finalization, server-side replay grading of balancing (given coefficients, a teacher's own equation, an ionic equation
// whose charge must balance), reaction families and roles, and a shared composite context graded by several linked parts; misconception,
// attacker and forged answers; the student projection (no check, weight or derived answer ever leaves the server); tampered configs blocked
// and withheld; broken keys fail closed.
const require_ = createRequire(import.meta.url);
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const load = () => JSON.parse(fs.readFileSync(path.join(root, REACTIONS_ACCEPTANCE_PATH), "utf8"));
const sim = actions => A.sim("chemistryReactions", 1, actions);
const co = (termId, value) => ({ type: "coefficient.set", termId, value });
const cls = (taskId, ...families) => ({ type: "reaction.classify", taskId, families });
const sel = (taskId, termId) => ({ type: "species.select", taskId, termId });
// hand-checked answers (see the template header): 2H₂ + O₂ → 2H₂O; 4Fe + 3O₂ → 2Fe₂O₃; 4Al + 3O₂ → 2Al₂O₃;
// 6Fe²⁺ + Cr₂O₇²⁻ + 14H⁺ → 6Fe³⁺ + 2Cr³⁺ + 7H₂O; CaCO₃ → CaO + CO₂; CaCl₂ + Na₂CO₃ → CaCO₃ + 2NaCl; Mg(OH)₂ + 2HCl → MgCl₂ + 2H₂O; CH₄ + 2O₂ → CO₂ + 2H₂O
const perfect = () => ({
  a1: sim([co("r1", 2), co("r2", 1), co("p1", 2), cls("family", "synthesis")]),
  a2: sim([co("r1", 4), co("r2", 3), cls("family", "synthesis"), sel("reducer", "r1")]),
  a3: sim([co("r1", 4), co("r2", 3), co("p1", 2), sel("elements", "r1"), sel("elements", "r2")]),
  b1: sim([co("r1", 6), co("r3", 14), co("p1", 6), co("p2", 2), co("p3", 7), sel("oxidizer", "r2"), sel("reducer", "r1")]),
  c1: sim([co("r1", 1), co("p1", 1), co("p2", 1), cls("families", "decomposition")]),
  c2: sim([co("r1", 1), co("r2", 1), co("p1", 1), co("p2", 2), cls("families", "doubleDisplacement", "precipitation"), sel("solid", "p1")]),
  c3: sim([co("r1", 1), co("r2", 2), co("p1", 1), co("p2", 2), cls("family", "neutralization"), sel("acid", "r2"), sel("base", "r1")]),
  d1: A.composite({ p3: A.choice(0) }, { ctxMethane: sim([co("r1", 1), co("r2", 2), co("p1", 1), co("p2", 2), cls("family", "combustion"), sel("fuel", "r1")]) })
});

describe("21D-D.2 lifecycle — chemistryReactions@1 acceptance exam", () => {
  it("imports, round-trips (save → re-import) and finalizes with no blocker; configs and private checks survive the round trip", () => {
    const original = load();
    expect(original.sections.map(s => s.id)).toEqual(["sec-a", "sec-b", "sec-c", "sec-d"]);
    const top = e => e.sections.slice(0, 3).flatMap(s => s.questions);
    expect(top(original).map(q => q.smartSim.pluginKey + ":" + (q.smartSim.config.reaction.catalog ?? "custom"))).toEqual([
      "chemistryReactions:waterFormation", "chemistryReactions:ironOxidation", "chemistryReactions:custom", "chemistryReactions:dichromateIron",
      "chemistryReactions:calciumCarbonateDecomposition", "chemistryReactions:calciumCarbonatePrecipitation", "chemistryReactions:magnesiumHydroxideHydrochloric"]);
    const imp = parseStructuredExamJson(JSON.stringify(original), "21dd2.json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(x => x.severity === "error")]).toEqual([true, [], []]);
    expect(evaluateExamFinalization(original).blockers).toEqual([]);
    const saved = toSavedStructuredExam(imp.exam), again = parseStructuredExamJson(JSON.stringify(saved), "again-21dd2.json");
    expect([again.canOpen, again.validationErrors.filter(x => x.severity === "error")]).toEqual([true, []]);
    expect(top(again.exam).map(q => q.smartSim)).toEqual(top(original).map(q => q.smartSim));
    expect(top(again.exam).map(q => q.answer.checks)).toEqual(top(original).map(q => q.answer.checks));
    expect(again.exam.sections[3].questions[0].composite).toEqual(original.sections[3].questions[0].composite);
  });

  it("PERFECT / PARTIAL / BLANK are decided by server replay against solver- and catalog-derived answers (41 marks in total)", () => {
    const exam = load(), all = perfect();
    expect(normalizeDraftAnswers(all, exam).rejected).toEqual([]);
    expect(gradeExam(exam, all).score).toBe(41);
    const partial = {
      ...all,
      a1: sim([co("r1", 4), co("r2", 2), co("p1", 4), cls("family", "synthesis")]),               // balanced but not lowest: 3 of 4
      a2: sim([co("r1", 2), co("r2", 3), cls("family", "synthesis"), sel("reducer", "r1"), sel("reducer", "r2")]),   // O₂ coefficient + family: 2/6 of 5
      a3: sim([]),                                                                                 // blank: 0
      b1: sim([co("r1", 5), co("r3", 14), co("p1", 5), co("p2", 2), co("p3", 7), sel("oxidizer", "r2")]),          // atoms balanced, charge NOT: 1 of 7
      c1: sim([co("r1", 1), co("p1", 1), co("p2", 1), cls("families", "decomposition", "redox")])  // "redox" is wrong: 1 of 3
    };
    const r = gradeExam(exam, partial);
    expect(r.score).toBe(23.67);                                                                 // 3 + 5·2/6 + 0 + 1 + 1 + 4 + 6 + 7, reported to 2 decimals
    expect(r.questions.find(q => q.questionId === "a2").score).toBeCloseTo(5 * 2 / 6, 2);
    expect(r.questions.find(q => q.questionId === "b1")).toMatchObject({ manualReview: false });
    expect(gradeExam(exam, {}).score).toBe(0);
  });

  it("ATTACKER: forged kinds, locked coefficients, zero coefficients, presentation actions, unoffered families, unknown terms, extra keys and forged state never earn credit", () => {
    const exam = load();
    const attacker = {
      a1: sim([{ type: "score.set", value: 4 }]),
      a2: sim([co("r1", 4), co("r2", 3), co("p1", 2)]),                                           // p1 is GIVEN (locked)
      a3: sim([co("r1", 0)]),
      b1: sim([{ type: "camera.rotate", yaw: 1 }, co("r1", 6)]),
      c1: sim([cls("families", "precipitation")]),                                                 // not an offered option
      c2: sim([sel("solid", "p9")]),
      c3: sim([{ type: "coefficient.set", termId: "r1", value: 1, correct: true }]),
      d1: A.composite({ p3: A.choice(0) }, { ctxMethane: { ...sim([cls("family", "combustion")]), state: { coefficients: { r1: 1, r2: 2, p1: 1, p2: 2 }, selections: { fuel: ["r1"] } }, score: 999, correct: true } })
    };
    const n = normalizeDraftAnswers(attacker, exam);
    expect(n.rejected.map(x => x.id).sort()).toEqual(["a1", "a2", "a3", "b1", "c1", "c2", "c3"]);
    expect(gradeExam(exam, n.answers).score).toBeCloseTo(1 + 2, 6);                               // only the honest composite answers count
    expect(JSON.stringify(n.answers)).not.toMatch(/"score"|"correct"|999/);
  });

  it("student delivery keeps the public equations and tasks and strips every check, weight and derived answer", () => {
    const student = sanitizeExamForStudent(load()), json = JSON.stringify(student);
    expect(json).toContain('"catalog":"waterFormation"'); expect(json).toContain('"formula":"Al2O3"'); expect(json).toContain('"role":"oxidizingAgent"');
    expect(json).not.toMatch(/"checks"|"weight"|"scoring"|rxn\.balanced|rxn\.lowest|rxn\.selection|"coefficients"/);
    expect(student.sections[0].questions[1].smartSim.config.tasks.balance).toEqual({ locked: ["p1"] });
  });

  it("a tampered config (unknown key, unknown catalog id, unbalanceable or non-unique equation, contested option, names on a typed equation) is blocked and withheld", () => {
    const cases = [
      [0, 0, c => { c.renderer = { html: "<b>x</b>" }; }, /<b>x<\/b>/],
      [0, 0, c => { c.reaction = { catalog: "thermite" }; }, /thermite/],
      [0, 2, c => { c.reaction.custom.products.push({ formula: "AlO", charge: 0, state: null }); }, /"AlO"/],            // two independent balancings
      [0, 2, c => { c.reaction.custom.products[0].formula = "Al2S3"; }, /Al2S3/],                                        // S on one side
      [0, 2, c => { c.view.names = true; }, /"names":true/],
      [0, 1, c => { c.tasks.classifications[0].options.push("combustion"); }, /"combustion"/]                            // contested for rusting
    ];
    for (const [s, i, mutate, leak] of cases) {
      const exam = load();
      mutate(exam.sections[s].questions[i].smartSim.config);
      expect(evaluateExamFinalization(exam).blockers.length, String(leak)).toBeGreaterThan(0);
      expect(JSON.stringify(sanitizeExamForStudent(exam).sections[s].questions[i])).not.toMatch(leak);
    }
  });

  it("a broken private key (an expected value smuggled in, a missing element, a locked term) fails CLOSED to manual review — never an automatic mark", () => {
    for (const [s, i, check, marks] of [
      [0, 0, { id: "x", label: "x", weight: 1, kind: "rxn.balanced", expected: [2, 1, 2] }, 4],
      [0, 0, { id: "x", label: "x", weight: 1, kind: "rxn.element", element: "Zn" }, 4],
      [0, 1, { id: "x", label: "x", weight: 1, kind: "rxn.coefficient", termId: "p1" }, 5]
    ]) {
      const exam = load(), qid = exam.sections[s].questions[i].examQuestionId;
      exam.sections[s].questions[i].answer.checks.push(check);
      const r = gradeExam(exam, perfect());
      expect(evaluateExamFinalization(exam).blockers.length).toBeGreaterThan(0);
      expect(r.score).toBe(41 - marks);                                                           // every other question is still auto-graded
      expect(r.questions.find(x => x.questionId === qid)).toMatchObject({ score: 0, manualReview: true });
      expect([r.manualReviewMarks, r.finalized]).toEqual([marks, false]);
    }
  });
});
