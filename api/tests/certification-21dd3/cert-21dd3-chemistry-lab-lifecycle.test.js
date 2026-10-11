import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { CHEMISTRY_LAB_ACCEPTANCE_PATH } from "./chemistryLabExam.js";
import { A } from "../certification-20g/kit.js";

// Phase 21D-D.3 — the chemistryLab@1 acceptance exam (100 marks) through the PRODUCTION API authorities (the compiled shared build): import →
// save → re-import, finalization, server-side replay grading of the four labs (a prepared solution graded against the student's OWN bench,
// pH, a titration with and without the meter, rate), conventional questions under "first 2 answered", and a shared titration context graded
// by linked parts; the precision policy at its exact boundaries; invalid units, non-finite and malformed numbers, duplicated and excessive
// actions, forged state / score / expected values; an interrupted attempt resumed; the student projection (no check, weight or derived answer
// ever leaves the server; an unknown analyte's concentration is never published); tampered configs blocked and withheld; broken keys fail
// closed to manual review.
const require_ = createRequire(import.meta.url);
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const load = () => JSON.parse(fs.readFileSync(path.join(root, CHEMISTRY_LAB_ACCEPTANCE_PATH), "utf8"));
const sim = actions => A.sim("chemistryLab", 1, actions);
const num = (taskId, value, unit) => ({ type: "answer.number", taskId, value, unit });
const pick = (taskId, ...options) => ({ type: "answer.choose", taskId, options });
const add = volume => ({ type: "titration.add", volume });
const REC = { type: "lab.record" };
// hand-checked answers (see the templates): NaCl 1.46 g / 58.44 g mol⁻¹ / 0.250 L = 0.0999 mol/L, 25.0 mmol; 10.00 mL of 0.500 M CuSO₄ → 100 mL
// = 0.0500 M, 0.00500 mol; pH(0.010 M HCl) = 2.00, pH(0.010 M CH₃COOH, Ka 1.8 × 10⁻⁵) = 3.38; NH₃ 0.10 M is basic (phenolphthalein pink);
// pH(0.0010 M HNO₃) = 3.00; V_eq = 25.00 mL, n(OH⁻) = 2.50 mmol; the unknown HCl = 0.0100 × 18.60 / 20.00 = 0.00930 mol/L; t½ = ln 2 / k =
// 347 s, k(35 °C) / k(25 °C) = 2.7; limewater: 2HCl + Ca(OH)₂, V_eq = 25.00 mL, n(HCl) = 0.500 mmol.
const lab = {
  a1: () => [{ type: "solution.flask", volume: 250 }, { type: "solution.mass", mass: "1.46" }, { type: "solution.makeUp" }, REC],
  a2: () => [{ type: "solution.pipette", volume: 10 }, { type: "solution.flask", volume: 100 }, { type: "solution.makeUp" }, REC],
  b1: () => ["A", "B", "C", "D"].map(id => ({ type: "ph.measure", solutionId: id })),
  b2: () => ["X", "Y", "Z"].map(id => ({ type: "ph.indicator", solutionId: id, indicatorId: "bromothymolBlue" })),
  c1: () => [add("24.50"), REC, add("1.00"), REC],
  c2: () => [{ type: "titration.indicator", indicatorId: "phenolphthalein" }, add("10.00"), REC, add("8.00"), REC, add("0.60"), REC],
  d1: () => ["t1", "t2", "t3"].map(id => ({ type: "rate.run", trialId: id }))
};
const perfect = () => ({
  a1: sim([...lab.a1(), num("conc", "0.0999", "mol/L"), num("moles", "25.0", "mmol")]),
  a2: sim([...lab.a2(), pick("conserved", "moles"), num("moles", "0.00500", "mol")]),
  b1: sim([...lab.b1(), num("phA", "2.00", "pH"), num("phB", "3.38", "pH"), pick("classD", "basic"), pick("lowest", "A")]),
  b2: sim([...lab.b2(), pick("ppX", "base"), pick("btbY", "acid"), num("phY", "3.00", "pH")]),
  c1: sim([...lab.c1(), num("veq", "25.00", "mL"), num("nOH", "2.50", "mmol"), pick("eqph", "equal7")]),
  c2: sim([...lab.c2(), num("reading", "18.60", "mL"), num("conc", "0.00930", "mol/L"), pick("suitable", "phenolphthalein", "bromothymolBlue")]),
  d1: sim([...lab.d1(), num("half", "347", "s"), num("ratio", "2.7", "1"), pick("fastest", "t3"), pick("cat", "increase")]),
  e1: A.choice(0), e2: A.numeric("0.0500"),
  f1: A.composite({ p3: A.choice(0) }, { ctxLimewater: sim([num("veq", "25.00", "mL"), num("nH", "0.500", "mmol"), pick("suitable", "bromothymolBlue", "phenolphthalein")]) })
});
const q = (r, id) => r.questions.find(x => x.questionId === id);

describe("21D-D.3 lifecycle — chemistryLab@1 acceptance exam (100 marks)", () => {
  it("imports, round-trips (save → re-import) and finalizes with no blocker; configs, private checks and the first-N policy survive", () => {
    const original = load();
    expect(original.sections.map(s => s.id)).toEqual(["sec-a", "sec-b", "sec-c", "sec-d", "sec-e", "sec-f"]);
    const sims = e => e.sections.slice(0, 4).flatMap(s => s.questions);
    expect(sims(original).map(x => x.smartSim.pluginKey + ":" + x.smartSim.config.experiment.kind)).toEqual([
      "chemistryLab:solutions", "chemistryLab:solutions", "chemistryLab:ph", "chemistryLab:ph", "chemistryLab:titration", "chemistryLab:titration", "chemistryLab:rate"]);
    expect(original.sections[4].questions.map(x => x.presentationType)).toEqual(["multipleChoice", "numericResponse", "trueFalse"]);
    const imp = parseStructuredExamJson(JSON.stringify(original), "21dd3.json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(x => x.severity === "error")]).toEqual([true, [], []]);
    expect(evaluateExamFinalization(original).blockers).toEqual([]);
    const saved = toSavedStructuredExam(imp.exam), again = parseStructuredExamJson(JSON.stringify(saved), "again-21dd3.json");
    expect([again.canOpen, again.validationErrors.filter(x => x.severity === "error")]).toEqual([true, []]);
    expect(sims(again.exam).map(x => x.smartSim)).toEqual(sims(original).map(x => x.smartSim));
    expect(sims(again.exam).map(x => x.answer.checks)).toEqual(sims(original).map(x => x.answer.checks));
    expect(again.exam.sections[4]).toMatchObject({ gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 2, maxMarks: 8 });
    expect(again.exam.sections[5].questions[0].composite).toEqual(original.sections[5].questions[0].composite);
    expect(evaluateExamFinalization(toSavedStructuredExam(again.exam)).blockers).toEqual([]);
  });

  it("PERFECT = 100, BLANK = 0; every lab answer is derived on the server from the config and the replayed bench", () => {
    const exam = load(), all = perfect();
    expect(normalizeDraftAnswers(all, exam).rejected).toEqual([]);
    const r = gradeExam(exam, all);
    expect([r.score, r.total ?? r.maxMarks ?? 100]).toEqual([100, 100]);
    expect(r.questions.filter(x => x.manualReview)).toEqual([]);
    expect(gradeExam(exam, {}).score).toBe(0);
    // grading is deterministic: the same answers replayed twice give identical results
    expect(gradeExam(exam, perfect())).toEqual(r);
  });

  it("PARTIAL: the student's own solution decides, readings must exist, and only the first two conventional answers count", () => {
    const exam = load(), all = perfect();
    const partial = {
      ...all,
      // weighed 1.50 g instead of 1.46 g: the prepared solution is NOT the target, but 0.103 mol/L and 25.7 mmol ARE this solution's values
      a1: sim([{ type: "solution.flask", volume: 250 }, { type: "solution.mass", mass: "1.50" }, { type: "solution.makeUp" }, num("conc", "0.103", "mol/L"), num("moles", "25.7", "mmol")]),
      // the right aliquot but conc. not made up to the mark: nothing prepared, so no moles exist yet (choice still counts)
      a2: sim([{ type: "solution.pipette", volume: 10 }, { type: "solution.flask", volume: 100 }, pick("conserved", "moles"), num("moles", "0.00500", "mol")]),
      // the strong-acid value for the weak acid: wrong; meter used on two solutions only
      b1: sim([{ type: "ph.measure", solutionId: "A" }, { type: "ph.measure", solutionId: "B" }, num("phA", "2.00", "pH"), num("phB", "2.00", "pH"), pick("classD", "basic"), pick("lowest", "A")]),
      c1: sim([num("veq", "25.00", "mL")]),                                                            // no readings around equivalence
      // three conventional answers: e1 (right) and e2 (wrong) are the first two answered; e3 (right) is ignored
      e1: A.choice(0), e2: A.numeric("0.0800"), e3: A.choice(0)
    };
    const r = gradeExam(exam, partial);
    expect(q(r, "a1").score).toBeCloseTo(12 * 3 / 5, 2);                                            // concentration + moles of the OWN solution; not the target
    expect(q(r, "a2").score).toBeCloseTo(10 * 1 / 5, 2);
    expect(q(r, "b1").score).toBeCloseTo(12 * 4 / 7, 2);
    expect(q(r, "c1").score).toBeCloseTo(12 * 2 / 6, 2);
    expect([q(r, "e1").score, q(r, "e2").score, q(r, "e3")].map(x => (typeof x === "number" ? x : x.ignored))).toEqual([4, 0, true]);
    expect(r.score).toBeCloseTo(100 - 12 * 2 / 5 - 10 * 4 / 5 - 12 * 3 / 7 - 12 * 4 / 6 - 4, 1);
  });

  it("the precision policy at its exact boundaries: half a unit in the last reported place, or the instrument floor when larger", () => {
    const exam = load(), all = perfect();
    const one = (id, actions) => q(gradeExam(exam, { ...all, [id]: sim(actions) }), id).score;
    // c2: the burette reading is graded against the replayed volume with the ±0.05 mL reading floor (inclusive)
    const c2 = (reading, conc) => one("c2", [...lab.c2(), num("reading", reading, "mL"), num("conc", conc, "mol/L"), pick("suitable", "phenolphthalein", "bromothymolBlue")]);
    const r2 = (x) => Math.round(x * 100) / 100;                                                     // question scores are reported to 2 decimals
    expect([c2("18.65", "0.00930"), c2("18.55", "0.00930"), c2("18.66", "0.00930")]).toEqual([12, 12, r2(12 - 12 * 1 / 7)]);
    // the concentration from a titre: c × 0.10 mL / V_eq = 0.00005 mol/L (equals ½ unit of 3 s.f.): 0.00925 and 0.00935 pass, 0.00924 fails
    expect([c2("18.60", "0.00925"), c2("18.60", "0.00935"), c2("18.60", "0.00924"), c2("18.60", "9.30e-3")]).toEqual([12, 12, r2(12 - 12 * 3 / 7), 12]);
    // pH to two decimals: ±0.005 around the model value 3.38158 (quadratic in Ka = 1.8 × 10⁻⁵ with Kw): 3.377 and 3.386 pass; 3.376 and 3.387 fail
    const b1 = phB => one("b1", [...lab.b1(), num("phA", "2.00", "pH"), num("phB", phB, "pH"), pick("classD", "basic"), pick("lowest", "A")]);
    expect([b1("3.38"), b1("3.377"), b1("3.386"), b1("3.376"), b1("3.387")]).toEqual([12, 12, 12, r2(12 - 12 * 2 / 7), r2(12 - 12 * 2 / 7)]);
    // units convert exactly: 0.02500 L = 25.00 mL; 2.50e-3 mol = 2.50 mmol
    expect(one("c1", [...lab.c1(), num("veq", "0.02500", "L"), num("nOH", "2.50e-3", "mol"), pick("eqph", "equal7")])).toBe(12);
  });

  it("invalid units, non-finite / malformed numbers, duplicated and excessive actions", () => {
    const exam = load();
    const bad = {
      a1: sim([num("conc", "0.0999", "g")]),                       // a mass unit for a concentration
      a2: sim([num("moles", "NaN", "mol")]),
      b1: sim([num("phA", "Infinity", "pH")]),
      b2: sim([num("phY", "1e999", "pH")]),
      c1: sim([num("veq", "25,00", "mL")]),
      c2: sim([num("conc", "0x1F", "mol/L")]),
      d1: sim(Array.from({ length: 501 }, () => ({ type: "rate.run", trialId: "t1" })))
    };
    const n = normalizeDraftAnswers(bad, exam);
    expect(n.rejected.map(x => x.id).sort()).toEqual(["a1", "a2", "b1", "b2", "c1", "c2", "d1"]);
    expect(gradeExam(exam, n.answers).score).toBe(0);
    // duplicated observations are recorded once; a re-saved answer replaces the earlier one (no double credit)
    const dup = sim([...lab.b1(), ...lab.b1(), num("phA", "9.99", "pH"), num("phA", "2.00", "pH"), num("phA", "2.00", "pH")]);
    const r = gradeExam(exam, { b1: dup });
    expect(q(r, "b1").score).toBeCloseTo(12 * (2 + 1) / 7, 2);             // phA + the meter requirement; nothing else answered
  });

  it("ATTACKER: forged state, score, expected values and presentation actions never earn credit", () => {
    const exam = load();
    const forgedState = { v: 1, lab: { kind: "solutions", flask: 250, mass: "1.46", pipette: null, madeUp: true }, observations: [], answers: { conc: { kind: "number", value: "0.0999", unit: "mol/L" } } };
    const attacker = {
      a1: { ...sim([]), state: forgedState, score: 12, correct: true },
      a2: sim([{ type: "graph.zoom", factor: 2 }]),
      b1: sim([{ type: "ph.measure", solutionId: "A", reading: "2.00" }]),
      b2: sim([{ type: "answer.number", taskId: "phY", value: "3.00", unit: "pH", expected: "3.00" }]),
      c1: sim([{ type: "titration.add", volume: "25.03" }]),          // not a whole number of drops
      c2: sim([pick("suitable", "phenolphthalein", "litmus")]),        // an indicator not in this experiment
      d1: sim([{ type: "rate.run", trialId: "t9" }]),
      f1: A.composite({ p3: A.choice(0) }, { ctxLimewater: { ...sim([num("veq", "25.00", "mL")]), state: { answers: { nH: { kind: "number", value: "0.500", unit: "mmol" } } }, score: 999, correct: true } })
    };
    const n = normalizeDraftAnswers(attacker, exam);
    expect(n.rejected.map(x => x.id).sort()).toEqual(["a2", "b1", "b2", "c1", "c2", "d1"]);
    const r = gradeExam(exam, n.answers);
    expect(q(r, "a1").score).toBe(0);                                              // the forged state is discarded and re-derived by replay
    expect(r.score).toBeCloseTo(6 * 2 / 3 + 4, 6);                                 // only the honest composite answers count
    expect(JSON.stringify(n.answers)).not.toMatch(/"score"|"correct"|999|"expected"/);
  });

  it("an interrupted attempt resumed later grades exactly like an uninterrupted one", () => {
    const exam = load(), full = perfect().c2.actions, cut = 4;
    const draft = normalizeDraftAnswers({ c2: sim(full.slice(0, cut)) }, exam);       // autosaved mid-titration
    expect(draft.rejected).toEqual([]);
    const savedActions = draft.answers.c2.actions;
    const resumed = normalizeDraftAnswers({ c2: sim([...savedActions, ...full.slice(cut)]) }, exam);
    expect(resumed.rejected).toEqual([]);
    expect(q(gradeExam(exam, resumed.answers), "c2")).toEqual(q(gradeExam(exam, { c2: perfect().c2 }), "c2"));
    expect(q(gradeExam(exam, draft.answers), "c2").score).toBeCloseTo(0, 6);          // nothing answered yet at the interruption
  });

  it("student delivery keeps the public experiments and tasks and strips every check, weight and derived answer", () => {
    const student = sanitizeExamForStudent(load()), json = JSON.stringify(student);
    expect(json).toContain('"kind":"titration"'); expect(json).toContain('"equivalence":"18.60"'); expect(json).toContain('"species":"CaOH2"');
    expect(json).not.toMatch(/"checks"|"weight"|"scoring"|lab\.number|lab\.choice|lab\.prepared|lab\.observed|0\.0093|correctOptionIndex|"tolerance"/);
    expect(student.sections[2].questions[1].smartSim.config.experiment.analyte).toEqual({ species: "HCl", volume: "20.00", concentration: null, equivalence: "18.60" });
  });

  it("a tampered config (unknown key, weak-acid titration, out-of-model concentration, ambiguous task, a graph without its meter, an injected renderer) is blocked and withheld", () => {
    const cases = [
      [0, 0, c => { c.renderer = { html: "<b>x</b>" }; }, /<b>x<\/b>/],
      [2, 0, c => { c.experiment.analyte.species = "CH3COOH"; }, /CH3COOH/],
      [1, 0, c => { c.experiment.solutions[0].concentration = "2.0"; }, /"2\.0"/],
      [1, 0, c => { c.experiment.solutions[1] = { id: "B", label: "B", species: "HNO3", concentration: "0.010" }; }, /HNO3/],   // lowest pH becomes a tie
      [2, 1, c => { c.view.graph = true; }, /"graph":true/],
      [3, 0, c => { c.experiment.trials[0].catalyst = true; c.experiment.catalystDrop = null; }, /"catalystDrop":null/],
      [0, 0, c => { c.tasks[0].concentration = "5.00"; }, /"5\.00"/]                                                                 // beyond the solute's model bound
    ];
    for (const [s, i, mutate, leak] of cases) {
      const exam = load();
      mutate(exam.sections[s].questions[i].smartSim.config);
      expect(evaluateExamFinalization(exam).blockers.length, String(leak)).toBeGreaterThan(0);
      expect(JSON.stringify(sanitizeExamForStudent(exam).sections[s].questions[i]), String(leak)).not.toMatch(leak);
    }
  });

  it("a broken private key (an expected value smuggled in, a free tolerance, a check on the wrong task kind) fails CLOSED to manual review — never an automatic mark", () => {
    for (const [s, i, check, marks] of [
      [0, 0, { id: "x", label: "x", weight: 1, kind: "lab.number", taskId: "conc", expected: "0.100" }, 12],
      [2, 1, { id: "x", label: "x", weight: 1, kind: "lab.number", taskId: "conc", tolerance: 1 }, 12],
      [3, 0, { id: "x", label: "x", weight: 1, kind: "lab.choice", taskId: "half" }, 12]
    ]) {
      const exam = load(), qid = exam.sections[s].questions[i].examQuestionId;
      exam.sections[s].questions[i].answer.checks.push(check);
      const r = gradeExam(exam, perfect());
      expect(evaluateExamFinalization(exam).blockers.length).toBeGreaterThan(0);
      expect(r.score).toBe(100 - marks);                                                     // every other question is still auto-graded
      expect(q(r, qid)).toMatchObject({ score: 0, manualReview: true });
      expect([r.manualReviewMarks, r.finalized]).toEqual([marks, false]);
    }
  });
});
