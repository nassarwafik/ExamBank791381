import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { CHEMISTRY_ACCEPTANCE_PATH } from "./chemistryExam.js";
import { A } from "../certification-20g/kit.js";

// Phase 21D-D.1 — the chemistryStructure@1 acceptance exam through the PRODUCTION API authorities (the compiled shared build): import →
// save → re-import, finalization, server-side replay grading of atoms / ions, the periodic table with a PRIVATE target species, 3D
// molecules, formulas and a shared composite context; misconception, attacker and forged answers; the student projection (no private
// species, check or tolerance ever leaves the server); tampered configs blocked and withheld.
const require_ = createRequire(import.meta.url);
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const load = () => JSON.parse(fs.readFileSync(path.join(root, CHEMISTRY_ACCEPTANCE_PATH), "utf8"));
const sim = actions => A.sim("chemistryStructure", 1, actions);
const P = (protons, neutrons, electrons) => ({ type: "particles.set", protons, neutrons, electrons });
const S = shells => ({ type: "shells.set", shells });
const V = (valueId, value) => ({ type: "value.set", valueId, value });
const C = (taskId, option) => ({ type: "classification.set", taskId, option });
const F = (formulaId, text) => ({ type: "formula.set", formulaId, text });
const pick = objectId => ({ type: "object.select", objectId });
// hand-computed answers (see the preset header: CIAAW 2024 weights, NIST configurations, NIST CCCBDB geometry)
const perfect = () => ({
  a1: sim([P(11, 12, 10), S([2, 8]), V("outer", 8), C("ionKind", "cation"), C("blockKind", "s")]),
  b1: sim([pick("Cl"), P(17, 18, 17), S([2, 8, 7]), V("valence", 7)]),
  c1: sim([V("angle", 104.5), V("lonePairs", 2), V("molarMass", 18.015), C("shape", "bent"), C("polarity", "polar"), pick("O1")]),
  c2: sim([F("formula", "CO2"), V("molarMass", 44.009), C("shape", "linear"), C("polarity", "nonpolar")]),
  d1: sim([V("molarMass", 180.156), V("carbonPercent", 40.0), F("empirical", "CH2O")]),
  d2: sim([V("molarMass", 249.677), V("copperPercent", 25.45), V("oxygenAtoms", 9)]),
  e1: A.composite({ p2: A.choice(0) }, { ctxAmmonia: sim([C("shape", "trigonalPyramidal"), V("angleHNH", 106.7)]) })
});

describe("21D-D.1 lifecycle — chemistryStructure@1 acceptance exam", () => {
  it("imports, round-trips (save → re-import) and finalizes with no blocker; configs and private checks survive the round trip", () => {
    const original = load();
    expect(original.sections.map(s => s.id)).toEqual(["sec-a", "sec-b", "sec-c", "sec-d", "sec-e"]);
    expect(original.sections.slice(0, 4).flatMap(s => s.questions.map(q => q.smartSim.config.activity))).toEqual(["atom", "atom", "molecule", "molecule", "formula", "formula"]);
    const imp = parseStructuredExamJson(JSON.stringify(original), "21dd1.json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(x => x.severity === "error")]).toEqual([true, [], []]);
    expect(evaluateExamFinalization(original).blockers).toEqual([]);
    const saved = toSavedStructuredExam(imp.exam), again = parseStructuredExamJson(JSON.stringify(saved), "again-21dd1.json");
    expect([again.canOpen, again.validationErrors.filter(x => x.severity === "error")]).toEqual([true, []]);
    const qs = e => e.sections.slice(0, 4).flatMap(s => s.questions);
    expect(qs(again.exam).map(q => q.smartSim)).toEqual(qs(original).map(q => q.smartSim));
    expect(qs(again.exam).map(q => q.answer.checks)).toEqual(qs(original).map(q => q.answer.checks));
    expect(again.exam.sections[4].questions[0].composite.contexts[0].smartSim).toEqual(original.sections[4].questions[0].composite.contexts[0].smartSim);
  });

  it("PERFECT / PARTIAL / BLANK are decided by server replay against derived references (43 marks in total)", () => {
    const exam = load(), all = perfect();
    expect(normalizeDraftAnswers(all, exam).rejected).toEqual([]);
    expect(gradeExam(exam, all).score).toBe(43);
    const partial = {
      ...all,
      a1: sim([P(11, 12, 11), S([2, 8, 1]), C("blockKind", "s")]),                               // a neutral atom instead of the ion: p, n, block → 3 of 8
      b1: sim([pick("Cl"), P(17, 20, 17)]),                                                       // ³⁷Cl built: element only → 2 of 8
      c1: sim([V("angle", 109.5), C("shape", "bent"), C("polarity", "polar"), pick("O1")]),       // tetrahedral angle: 3 of 7
      d1: sim([F("empirical", "C6H12O6")]),                                                       // the molecular, not the empirical formula: 0
      e1: A.composite({ p2: A.choice(1) }, { ctxAmmonia: sim([C("shape", "tetrahedral"), V("angleHNH", 106.7)]) })   // 1.5 + 0
    };
    expect(gradeExam(exam, partial).score).toBeCloseTo(3 + 2 + 3 + 4 + 0 + 5 + 1.5, 6);
    expect(gradeExam(exam, {}).score).toBe(0);
  });

  it("ATTACKER: forged kinds, presentation actions, unknown ids, invalid formulas, over-max selection and forged state never earn credit", () => {
    const exam = load();
    const attacker = {
      a1: sim([{ type: "score.set", value: 8 }]),
      b1: sim([pick("Cl"), pick("Br")]),                                                          // max 1
      c1: sim([{ type: "camera.rotate", yaw: 1 }, pick("O1")]),
      c2: sim([F("formula", "co2")]),
      d1: sim([V("molarMass", "180.156")]),
      d2: sim([V("hidden", 249.677)]),
      e1: A.composite({ p2: A.choice(0) }, { ctxAmmonia: { ...sim([C("shape", "trigonalPyramidal")]), state: { classifications: { shape: "trigonalPyramidal" }, values: { angleHNH: 106.67 } }, score: 999, correct: true } })
    };
    const n = normalizeDraftAnswers(attacker, exam);
    expect(n.rejected.map(x => x.id).sort()).toEqual(["a1", "b1", "c1", "c2", "d1", "d2"]);
    expect(gradeExam(exam, n.answers).score).toBeCloseTo(2 + 1.5, 6);                              // only the honest composite answers count
    expect(JSON.stringify(n.answers)).not.toMatch(/"score"|"correct"|999/);
  });

  it("student delivery keeps the public activities and strips every check, private species, tolerance and expected selection", () => {
    const student = sanitizeExamForStudent(load()), json = JSON.stringify(student);
    for (const a of ["atom", "molecule", "formula"]) expect(json).toContain('"activity":"' + a + '"');
    expect(json).toContain('"molecule":"water"'); expect(json).toContain('"formula":"CuSO4·5H2O"');
    expect(json).not.toMatch(/"checks"|"tolerance"|"species"|"expectedIds"|chem\.particles|chem\.value|setEquals@1|"scoring"/);
    expect(JSON.stringify(student.sections[1])).not.toMatch(/"Cl"|"massNumber":35/);             // the private target never leaves the server
    expect(student.sections[0].questions[0].smartSim.config.subject).toEqual({ element: "Na", massNumber: 23, charge: 1 });
  });

  it("a tampered config (unknown key, unknown activity, uncatalogued isotope, non-canonical formula, measure on an atom) is blocked and withheld", () => {
    const cases = [
      [0, c => { c.renderer = { html: "<b>x</b>" }; }, /<b>x<\/b>/],
      [0, c => { c.activity = "titration"; }, /titration/],
      [0, c => { c.subject.massNumber = 24; }, /"massNumber":24/],
      [0, c => { c.view.measure = true; }, /"measure":true/]
    ];
    for (const [i, mutate, leak] of cases) {
      const exam = load();
      mutate(exam.sections[0].questions[i].smartSim.config);
      expect(evaluateExamFinalization(exam).blockers.length).toBeGreaterThan(0);
      expect(JSON.stringify(sanitizeExamForStudent(exam).sections[0].questions[i])).not.toMatch(leak);
    }
    const exam = load();
    exam.sections[3].questions[0].smartSim.config.subject.formula = "C₆H₁₂O₆";
    expect(evaluateExamFinalization(exam).blockers.length).toBeGreaterThan(0);
  });

  it("a broken private key (unknown check kind / undefined reference) fails CLOSED to manual review — never an automatic mark", () => {
    const exam = load();
    exam.sections[2].questions[0].answer.checks.push({ id: "x", label: "x", weight: 1, kind: "chem.value", valueId: "angle", quantity: "bondAngle", parameter: "aXYZ", tolerance: 1 });
    const r = gradeExam(exam, perfect());
    expect(evaluateExamFinalization(exam).blockers.length).toBeGreaterThan(0);
    expect(r.score).toBe(43 - 7);                                                                 // every other question is still auto-graded
    expect(r.questions.find(x => x.questionId === "c1")).toMatchObject({ score: 0, manualReview: true });
    expect([r.manualReviewMarks, r.finalized]).toEqual([7, false]);
  });
});
