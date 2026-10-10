import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { PHYSICS_LAB_ACCEPTANCE_PATH } from "./physicsLabExam.js";
import { A } from "../certification-20g/kit.js";

// Phase 21D-A.2 — the physicsLab@1 acceptance exam through the PRODUCTION API authorities (the compiled shared build): import → save →
// re-import, finalization, server-side replay grading of the four experiments (incl. energy WITH drag) and a shared composite circuit,
// explorer / attacker answers, the student projection and tampered configs. Exploration is presentation-only: grading always refers to the
// experiment the teacher authored.
const require_ = createRequire(import.meta.url);
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const load = () => JSON.parse(fs.readFileSync(path.join(root, PHYSICS_LAB_ACCEPTANCE_PATH), "utf8"));
const m = (measurementId, value) => ({ type: "measurement.set", measurementId, value });
const pt = (pointId, x, y) => ({ type: "graphPoint.set", pointId, x, y });
const sim = actions => A.sim("physicsLab", 1, actions);
const perfect = () => ({
  a1: sim([m("period", 2.011), m("smallAnglePeriod", 2.007), m("maxSpeed", 0.546)]),
  b1: sim([m("period", 0.9935), m("equilibrium", 0.245), m("restoringForce", 2), pt("firstEquilibrium", 0.25, 0)]),
  c1: sim([m("initialEnergy", 492), m("maxHeight", 25.1), m("impactKineticEnergy", 492)]),
  c2: sim([m("initialEnergy", 492), m("energyLost", 168.1)]),
  d1: sim([m("equivalentResistance", 4), m("totalCurrent", 3), m("current2", 1), m("voltage1", 6), pt("iv6", 6, 1.5)]),
  e1: A.composite({ p2: A.choice(0) }, { ctxParallel: sim([m("totalCurrent", 6), m("current3", 3)]) })
});

describe("21D-A.2 lifecycle — physicsLab@1 acceptance exam", () => {
  it("imports, round-trips (save → re-import) and finalizes with no blocker; configs and private checks survive the round trip", () => {
    const original = load();
    expect(original.sections.map(s => s.id)).toEqual(["sec-a", "sec-b", "sec-c", "sec-d", "sec-e"]);
    expect(original.sections.slice(0, 4).flatMap(s => s.questions.map(q => q.smartSim.config.experiment))).toEqual(["pendulum", "spring", "energy", "energy", "circuit"]);
    const imp = parseStructuredExamJson(JSON.stringify(original), "21da2.json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(x => x.severity === "error")]).toEqual([true, [], []]);
    expect(evaluateExamFinalization(original).blockers).toEqual([]);
    const saved = toSavedStructuredExam(imp.exam), again = parseStructuredExamJson(JSON.stringify(saved), "again-21da2.json");
    expect([again.canOpen, again.validationErrors.filter(x => x.severity === "error")]).toEqual([true, []]);
    const qs = e => e.sections.slice(0, 4).flatMap(s => s.questions);
    expect(qs(again.exam).map(q => q.smartSim)).toEqual(qs(original).map(q => q.smartSim));
    expect(qs(again.exam).map(q => q.answer.checks)).toEqual(qs(original).map(q => q.answer.checks));
    expect(again.exam.sections[4].questions[0].composite.contexts[0].smartSim).toEqual(original.sections[4].questions[0].composite.contexts[0].smartSim);
  });

  it("PERFECT / PARTIAL / BLANK are decided by server replay against the AUTHORED experiments; claiming energy conservation with drag earns nothing", () => {
    const exam = load(), all = perfect();
    expect(normalizeDraftAnswers(all, exam).rejected).toEqual([]);
    expect(gradeExam(exam, all).score).toBe(34);
    const partial = {
      ...all,
      a1: sim([m("period", 2.011)]),                                                                 // 2 of 4 → 3 / 6
      b1: sim([]),                                                                                   // 0 / 6
      c1: sim([m("initialEnergy", 492)]),                                                            // 1 of 4 → 1.25 / 5
      c2: sim([m("initialEnergy", 492), m("energyLost", 0)]),                                        // "conserved": 1 of 3 → 1.6667 / 5
      e1: A.composite({ p2: A.choice(0) }, { ctxParallel: sim([m("totalCurrent", 3)]) })              // 0 + 2
    };
    expect(gradeExam(exam, partial).score).toBeCloseTo(3 + 0 + 1.25 + 5 / 3 + 7 + 2, 1);
    expect(gradeExam(exam, {}).score).toBe(0);
  });

  it("an EXPLORER who changed the parameters and reports the explored experiment earns nothing for it (A.2 grades the authored experiment)", () => {
    const exam = load();
    // L = 2 m explored instead of 1 m: T ≈ 2π√(2/9.8)·1.0019 = 2.8438 s — right physics, wrong experiment; topology 1 explored: R_eq = 11 Ω
    const explorer = { a1: sim([m("period", 2.8438), m("smallAnglePeriod", 2.8384)]), d1: sim([m("equivalentResistance", 11), m("totalCurrent", 12 / 11)]) };
    expect(gradeExam(exam, explorer).score).toBe(0);
  });

  it("ATTACKER: forged kinds, presentation actions, unknown ids, non-numeric values and forged state never earn credit", () => {
    const exam = load();
    const attacker = {
      a1: sim([{ type: "score.set", value: 6 }]),
      b1: sim([{ type: "params.set", param: "springConstant", value: 1 }]),                          // exploration is never an action
      c1: sim([m("notATask", 492)]),
      c2: sim([m("energyLost", "168")]),
      d1: sim([pt("iv6", 6, "1.5")]),
      e1: A.composite({ p2: A.choice(0) }, { ctxParallel: { ...sim([m("totalCurrent", 6)]), state: { measurements: { totalCurrent: 6, current3: 3 } }, score: 999, correct: true } })
    };
    const n = normalizeDraftAnswers(attacker, exam);
    expect(n.rejected.map(x => x.id).sort()).toEqual(["a1", "b1", "c1", "c2", "d1"]);
    expect(gradeExam(exam, n.answers).score).toBe(5);                                               // only the honest composite answer counts
    expect(JSON.stringify(n.answers)).not.toMatch(/"score"|"correct"|999/);
  });

  it("student delivery keeps the public experiments (params, permitted controls, tasks) and strips every check / tolerance / reference", () => {
    const student = sanitizeExamForStudent(load()), json = JSON.stringify(student);
    for (const kind of ["pendulum", "spring", "energy", "circuit"]) expect(json).toContain('"experiment":"' + kind + '"');
    expect(json).toContain('"controls"'); expect(json).toContain('"topology"');
    expect(json).not.toMatch(/"checks"|"tolerance"|"quantity"|lab\.referenceValue|pointNear@1|"scoring"|measuredPeriod|energyDissipated/);
    expect(student.sections[3].questions[0].smartSim.config.params).toEqual({ voltage: 12, r1: 2, r2: 6, r3: 3, topology: 3 });
  });

  it("a tampered config (unknown key, unknown experiment, fractional topology, authored value outside a permitted control) is blocked and withheld", () => {
    for (const mutate of [c => { c.renderer = { html: "<b>x</b>" }; }, c => { c.experiment = "optics"; }, c => { c.params.topology = 2.5; }, c => { c.controls[0].max = 2; }]) {
      const exam = load();
      mutate(exam.sections[3].questions[0].smartSim.config);
      expect(evaluateExamFinalization(exam).blockers.length).toBeGreaterThan(0);
      expect(JSON.stringify(sanitizeExamForStudent(exam).sections[3].questions[0])).not.toMatch(/<b>x<\/b>|optics|2\.5/);
    }
  });
});
