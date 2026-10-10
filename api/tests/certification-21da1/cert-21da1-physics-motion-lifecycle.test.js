import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseStructuredExamJson } from "../../../src/structuredExamImport";
import { toSavedStructuredExam } from "../../../src/examBuilderState";
import { evaluateExamFinalization } from "../../../src/examFinalization";
import { PHYSICS_MOTION_ACCEPTANCE_PATH } from "./physicsMotionExam.js";
import { A } from "../certification-20g/kit.js";

// Phase 21D-A.1 — the physicsMotion@1 acceptance exam through the PRODUCTION API authorities (the compiled shared build): import → save →
// re-import, finalization, server-side replay grading of the four simulations and a shared composite context, hostile answers, and the
// student projection. Exploration is presentation-only in A.1: grading always refers to the experiment the teacher authored.
const require_ = createRequire(import.meta.url);
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { normalizeDraftAnswers } = require_("../../src/lib/draft-answers.js");
const { sanitizeExamForStudent } = require_("../../src/lib/student-exam-sanitize.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const load = () => JSON.parse(fs.readFileSync(path.join(root, PHYSICS_MOTION_ACCEPTANCE_PATH), "utf8"));
const m = (measurementId, value) => ({ type: "measurement.set", measurementId, value });
const pt = (pointId, x, y) => ({ type: "graphPoint.set", pointId, x, y });
const sim = actions => A.sim("physicsMotion", 1, actions);
const perfect = () => ({
  a1: sim([m("impactTime", 3.03), m("impactSpeed", 29.7), pt("impactPoint", 3.03, 0)]),
  b1: sim([m("range", 40.8), m("maxHeight", 10.2), m("flightTime", 2.89), pt("landingPoint", 40.8, 0)]),
  c1: sim([m("acceleration", 3.04), m("kineticFriction", 3.92), m("finalVelocity", 12.16), pt("pointAt2s", 2, 6.08)]),
  d1: sim([m("acceleration", 3.2), m("normalForce", 42.44), m("timeToBottom", 2.5), m("speedAtBottom", 8)]),
  e1: A.composite({ p2: A.choice(0) }, { ctxIncline: sim([m("acceleration", 4.9), m("timeToBottom", 2.02)]) })
});

describe("21D-A.1 lifecycle — physicsMotion@1 acceptance exam", () => {
  it("imports, round-trips (save → re-import) and finalizes with no blocker; the shared composite context survives", () => {
    const original = load();
    expect(original.sections.map(s => s.id)).toEqual(["sec-a", "sec-b", "sec-c", "sec-d", "sec-e"]);
    expect(original.sections.slice(0, 4).map(s => s.questions[0].smartSim.config.experiment)).toEqual(["freeFall", "projectile", "newton2", "incline"]);
    const imp = parseStructuredExamJson(JSON.stringify(original), "21da1.json");
    expect([imp.canOpen, imp.parseErrors, imp.validationErrors.filter(x => x.severity === "error")]).toEqual([true, [], []]);
    expect(evaluateExamFinalization(original).blockers).toEqual([]);
    const saved = toSavedStructuredExam(imp.exam);
    const again = parseStructuredExamJson(JSON.stringify(saved), "again-21da1.json");
    expect([again.canOpen, again.validationErrors.filter(x => x.severity === "error")]).toEqual([true, []]);
    const q = again.exam.sections.slice(0, 4).map(s => s.questions[0]);
    expect(q.map(x => x.smartSim)).toEqual(original.sections.slice(0, 4).map(s => s.questions[0].smartSim));
    expect(q.map(x => x.answer.checks)).toEqual(original.sections.slice(0, 4).map(s => s.questions[0].answer.checks));
    expect(again.exam.sections[4].questions[0].composite.contexts[0].smartSim).toEqual(original.sections[4].questions[0].composite.contexts[0].smartSim);
  });

  it("PERFECT / PARTIAL / BLANK are decided by server replay against the AUTHORED experiment; client-claimed state is discarded", () => {
    const exam = load(), all = perfect();
    expect(normalizeDraftAnswers(all, exam).rejected).toEqual([]);
    expect(gradeExam(exam, all).score).toBe(27);
    const partial = {
      ...all,
      a1: sim([m("impactTime", 3.03), m("impactSpeed", 25)]),                                   // 2 of 5 weight → 2.4 / 6
      b1: sim([m("range", 40.8), m("maxHeight", 10.2), m("flightTime", 3.5)]),                  // 4 of 6 weight → 4 / 6
      d1: sim([]),                                                                              // 0 / 5
      e1: A.composite({ p2: A.choice(1) }, { ctxIncline: sim([m("acceleration", 4.9)]) })        // 3 + 0
    };
    expect(gradeExam(exam, partial).score).toBe(14.4);
    expect(gradeExam(exam, {}).score).toBe(0);
  });

  it("an EXPLORER who changed the parameters and reports the explored values earns no credit for them (A.1 grades the authored experiment)", () => {
    const exam = load();
    // h = 100 m explored instead of the authored 45 m: t = √(2·100/9.8) = 4.5175 s, v = 44.272 m/s — correct physics, wrong experiment.
    const explorer = { a1: sim([m("impactTime", 4.5175), m("impactSpeed", 44.272), pt("impactPoint", 4.5175, 0)]) };
    expect(gradeExam(exam, explorer).score).toBe(0);
  });

  it("ATTACKER: forged action kinds, unknown task ids, non-numeric / out-of-range values and forged state never earn credit", () => {
    const exam = load(), all = perfect();
    const attacker = {
      a1: sim([{ type: "score.set", value: 6 }]),
      b1: sim([m("notATask", 40.8)]),
      c1: sim([m("acceleration", "3.04")]),
      d1: sim([pt("nope", 1, 1)]),
      e1: A.composite({ p2: A.choice(0) }, { ctxIncline: { ...sim([m("acceleration", 4.9)]), state: { measurements: { acceleration: 4.9 } }, score: 999, correct: true } })
    };
    const n = normalizeDraftAnswers(attacker, exam);
    const rejected = Object.fromEntries(n.rejected.map(x => [x.id, x.code]));
    expect(Object.keys(rejected).sort()).toEqual(["a1", "b1", "c1", "d1"]);
    expect(gradeExam(exam, n.answers).score).toBe(5);                                           // only the honest composite answer counts
    expect(JSON.stringify(n.answers)).not.toMatch(/"score"|"correct"|999/);
    // a graph point outside the time axis [0, maxTime] is refused rather than clamped
    const late = normalizeDraftAnswers({ ...all, c1: sim([pt("pointAt2s", 99, 6.08)]) }, exam);
    expect(late.rejected.map(x => x.id)).toEqual(["c1"]);
  });

  it("student delivery keeps the public experiment (params, permitted controls, tasks) and strips every private check / tolerance / reference", () => {
    const student = sanitizeExamForStudent(load());
    const json = JSON.stringify(student);
    for (const kind of ["freeFall", "projectile", "newton2", "incline"]) expect(json).toContain('"experiment":"' + kind + '"');
    expect(json).toContain('"controls"');
    expect(json).toContain('"impactTime"');
    expect(json).not.toMatch(/"checks"|"tolerance"|"quantity"|motion\.referenceValue|pointNear@1|40\.8163|6\.08\b|"scoring"/);
    const q = student.sections[1].questions[0];
    expect(q.smartSim.config.params).toEqual({ initialSpeed: 20, launchAngle: 45, launchHeight: 0, gravity: 9.8 });
    expect(q.answer ?? {}).toEqual({});                                                          // the sanitizer's empty answer shell
  });

  it("a tampered config (unknown key, unknown experiment, or an authored value outside the permitted control range) is withheld or blocked, never delivered", () => {
    for (const mutate of [
      c => { c.renderer = { html: "<b>x</b>" }; },
      c => { c.experiment = "pendulum"; },
      c => { c.controls[0].max = 1; }
    ]) {
      const exam = load();
      mutate(exam.sections[1].questions[0].smartSim.config);
      expect(evaluateExamFinalization(exam).blockers.length).toBeGreaterThan(0);
      const pub = sanitizeExamForStudent(exam).sections[1].questions[0];
      expect(JSON.stringify(pub)).not.toMatch(/<b>x<\/b>|pendulum/);
    }
  });
});
