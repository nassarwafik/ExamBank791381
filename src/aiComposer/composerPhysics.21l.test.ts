import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { buildComposerCatalog, catalogForPrompt, COMPOSER_SIM_PLUGINS } from "./composerCatalog";
import { buildSimFromSpec, simFreeCreditIssues, type BuiltSim } from "./composerSim";
import { COMPOSER_PHYSICS_RELATIVE_TOLERANCE, mentionsAdvancedPhysics, physicsCatalogForPrompt } from "./composerPhysics";
import { buildModifyPrompt, buildSectionPrompt } from "./composerPrompts";
import { normalizeComposerIntent } from "./composerIntent";
import { normalizePlanShape, validatePlan } from "./composerPlan";
import { runGeneration, type ComposerTransport } from "./composerRun";
import { evaluateSmartSim } from "../trustedSimQuestion";
import { parseStructuredExamJson } from "../structuredExamImport";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import * as grading from "../../api/src/lib/assignment-grading.js";

// Phase 21L — physicsMotion@1 and physicsLab@1 in the AI Full Exam Composer. The model names an experiment, its parameters and the quantities
// to measure; code builds the config and the measurement checks (tolerance = 2 % of the DERIVED value); the physics cores derive every
// reference. Reference values below are computed by hand, independently of the implementation.
const composerApi = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ status: number; jsonBody: Record<string, unknown> }> };
const sanitize = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => unknown }).sanitizeExamForStudent;
const gradeExam = (grading as unknown as { gradeExam: (e: unknown, a: unknown) => { score: number } }).gradeExam;
type Json = Record<string, unknown>;

const built = (spec: Json): BuiltSim => { const b = buildSimFromSpec(spec, "s"); if (!b.ok) throw new Error(JSON.stringify(b.issues)); return b.value; };
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const messages = (r: { ok: boolean; issues?: { message: string }[] }) => (r.ok ? "" : (r.issues ?? []).map(i => i.message).join(" | "));
const grade = (sim: BuiltSim, values: Record<string, number>) => {
  const actions = Object.entries(values).map(([measurementId, value]) => ({ type: "measurement.set", measurementId, value }));
  const e = evaluateSmartSim({ envelope: sim.envelope as never, answerKey: { scoring: "proportional", checks: sim.checks } as never, response: { kind: "smartSim", pluginKey: sim.envelope.pluginKey, pluginVersion: 1, actions, state: {} } as never, maxMarks: 10 });
  return { valid: e.valid, passed: e.passedWeight, total: sim.checks.reduce((n, c) => n + c.weight, 0) };
};
const cfg = (s: BuiltSim) => s.envelope.config as { experiment: string; params: Json; controls: unknown[]; view: { maxTime: number; graphs: string[] }; tasks: { measurements: Json[]; points: unknown[] } };

// [spec, hand-computed answers (3 s.f.) in measurement order]
const CASES: [string, Json, number[]][] = [
  // h₀ = 20 m, v₀ = 0, g = 9.8: t = √(2h/g) = 2.0203 s; v = √(2gh) = 19.799 m/s
  ["freeFall", F.motionSim("freeFall", { initialHeight: 20, initialVelocity: 0, gravity: 9.8 }, ["impactTime", "impactSpeed"]), [2.02, 19.8]],
  // v₀ = 20 m/s at 30°, h₀ = 0: vy = 10 → T = 2.0408 s; R = 17.3205 × 2.0408 = 35.348 m; H = 100 / 19.6 = 5.102 m
  ["projectile", F.motionSim("projectile", { initialSpeed: 20, launchAngle: 30, launchHeight: 0, gravity: 9.8 }, ["flightTime", "range", "maxHeight"]), [2.04, 35.3, 5.10]],
  // m = 2 kg, F = 10 N, no friction: a = 5 m/s²; W = 19.6 N
  ["newton2", F.motionSim("newton2", { mass: 2, appliedForce: 10, initialVelocity: 0, muStatic: 0, muKinetic: 0, gravity: 9.8 }, ["initialAcceleration", "weight"]), [5, 19.6]],
  // 30°, 1 kg, L = 2 m, frictionless: a = 4.9 m/s²; t = √(2L/a) = 0.9035 s; v = a·t = 4.427 m/s
  ["incline", F.motionSim("incline", { angle: 30, mass: 1, length: 2, initialVelocity: 0, muStatic: 0, muKinetic: 0, gravity: 9.8 }, ["timeToBottom", "speedAtBottom"]), [0.904, 4.43]],
  // L = 1 m, g = 9.8: T = 2π√(L/g) = 2.0071 s; ω = √(g/L) = 3.1305 rad/s
  ["pendulum", F.physLabSim("pendulum", { length: 1, initialAngle: 10, damping: 0, mass: 0.5, gravity: 9.8 }, ["smallAnglePeriod", "angularFrequency"]), [2.01, 3.13]],
  // k = 100 N/m, m = 1 kg, x₀ = 0.1 m: T = 2π√(m/k) = 0.6283 s; mg/k = 0.098 m; k|x₀| = 10 N; ½kx₀² = 0.5 J
  ["spring", F.physLabSim("spring", { springConstant: 100, mass: 1, initialDisplacement: 0.1, damping: 0, gravity: 9.8 }, ["period", "equilibriumExtension", "restoringForceAtRelease", "initialEnergy"]), [0.628, 0.098, 10, 0.5]],
  // m = 2 kg, h₀ = 10 m, no drag: E = mgh = 196 J; v = √(2gh) = 14 m/s
  ["energy", F.physLabSim("energy", { mass: 2, initialHeight: 10, initialVelocity: 0, drag: 0, gravity: 9.8 }, ["initialEnergy", "impactSpeed"]), [196, 14]],
  // 12 V in series over 2 + 3 + 6 Ω: R = 11 Ω; I = 12/11 = 1.0909 A; P = V·I = 13.09 W
  ["circuit-series", F.physLabSim("circuit", { voltage: 12, r1: 2, r2: 3, r3: 6, topology: 1 }, ["equivalentResistance", "totalCurrent", "totalPower"]), [11, 1.09, 13.1]],
  // the same resistors in parallel: 1/R = ½ + ⅓ + ⅙ = 1 → R = 1 Ω; I = 12 A
  ["circuit-parallel", F.physLabSim("circuit", { voltage: 12, r1: 2, r2: 3, r3: 6, topology: 2 }, ["equivalentResistance", "totalCurrent"]), [1, 12]]
];

describe("21L-CAT physicsMotion@1 and physicsLab@1 join the composer catalog", () => {
  it("catalog V7 lists both; the general catalog stays bounded (only the two plugin names are added, no extra line); the full catalog names every experiment and quantity", () => {
    expect(buildComposerCatalog().version).toBe("AI_COMPOSER_CATALOG_V7");
    expect(COMPOSER_SIM_PLUGINS.filter(p => p.subject === "physics").map(p => p.pluginKey + "@" + p.pluginVersion)).toEqual(["physicsFreeFall@1", "physicsMotion@1", "physicsLab@1"]);
    const general = catalogForPrompt();
    expect(general.length).toBeLessThanOrEqual(9000);
    expect(general).not.toContain("smallAnglePeriod");
    const full = physicsCatalogForPrompt();
    for (const id of ["freeFall", "projectile", "newton2", "incline", "pendulum", "spring", "energy", "circuit", "timeToBottom", "equivalentResistance", "muKinetic", "topology"]) expect(full).toContain(id);
  });
});

describe("21L-SIM every experiment built by code and graded by the plugin against hand-computed values", () => {
  for (const [name, spec, answers] of CASES) {
    it(name, () => {
      const s = built(spec);
      const c = cfg(s);
      expect(c.controls).toEqual([]);                                     // an assessment: no student-adjustable parameters
      expect(c.tasks.points).toEqual([]);
      expect(c.tasks.measurements.map(m => m.id)).toEqual(answers.map((_, i) => "m" + (i + 1)));
      for (const k of s.checks) {
        expect(Object.keys(k).sort()).toEqual(["id", "kind", "label", "measurementId", "quantity", "tolerance", "weight"]);   // no expected value stored
        expect(k.tolerance).toBeGreaterThan(0);
      }
      expect(simFreeCreditIssues(s.envelope, s.checks, "s")).toEqual([]);
      const full = grade(s, Object.fromEntries(answers.map((v, i) => ["m" + (i + 1), v])));
      expect(full.valid).toBe(true);
      expect(full.passed, JSON.stringify(s.checks)).toBe(full.total);
      expect(grade(s, Object.fromEntries(answers.map((v, i) => ["m" + (i + 1), v * 1.1]))).passed).toBe(0);   // 10 % off is wrong
      expect(grade(s, {}).passed).toBe(0);
    });
  }
  it("the tolerance is 2 % of the DERIVED value (never a value the model typed)", () => {
    const s = built(CASES[0][1]);
    expect(s.checks[0].tolerance).toBeCloseTo(Math.sqrt(40 / 9.8) * COMPOSER_PHYSICS_RELATIVE_TOLERANCE, 5);
  });
  it("duration: an experiment with a natural end runs a little past it (the model's maxTime ignored); a periodic one takes the model's value", () => {
    expect(cfg(built({ ...CASES[0][1], motion: { ...(CASES[0][1].motion as Json), maxTime: 1 } })).view.maxTime).toBe(2.5);   // 2.02 s × 1.15 → 2.5 s
    expect(cfg(built({ ...CASES[4][1], physicsLab: { ...(CASES[4][1].physicsLab as Json), maxTime: 30 } })).view.maxTime).toBe(30);
    expect(cfg(built(CASES[4][1])).view.maxTime).toBe(10);
  });
  it("only the experiment's own graphs are kept", () => {
    expect(cfg(built({ ...CASES[1][1], motion: { ...(CASES[1][1].motion as Json), graphs: ["height", "acceleration"] } })).view.graphs).toEqual(["height"]);
  });
});

describe("21L-RULES refusals carry what the model needs for its repair", () => {
  it("missing / extra / duplicated parameters list the exact parameter set", () => {
    const missing = buildSimFromSpec(F.motionSim("freeFall", { initialHeight: 20, gravity: 9.8 }, ["impactTime"]), "s");
    expect(codes(missing)).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(messages(missing)).toContain("initialVelocity");
    expect(codes(buildSimFromSpec(F.motionSim("freeFall", { initialHeight: 20, initialVelocity: 0, gravity: 9.8, mass: 1 }, ["impactTime"]), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);
  });
  it("out-of-model values and undefined quantities are refused by the physics core", () => {
    expect(messages(buildSimFromSpec(F.motionSim("freeFall", { initialHeight: -5, initialVelocity: 0, gravity: 9.8 }, ["impactTime"]), "s"))).toContain("القيم الفيزيائية");
    // with heavy friction the block never reaches the bottom: «time to bottom» does not exist
    const stuck = buildSimFromSpec(F.motionSim("incline", { angle: 10, mass: 1, length: 2, initialVelocity: 0, muStatic: 0.9, muKinetic: 0.8, gravity: 9.8 }, ["timeToBottom"]), "s");
    expect(codes(stuck)).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(messages(stuck)).toContain("غير معرّفة");
  });
  it("unknown / duplicated quantities, no measurement, and another simulator's fields are refused", () => {
    const unknown = buildSimFromSpec(F.physLabSim("pendulum", { length: 1, initialAngle: 10, damping: 0, mass: 0.5, gravity: 9.8 }, ["range"]), "s");
    expect(messages(unknown)).toContain("smallAnglePeriod");
    expect(codes(buildSimFromSpec(F.physLabSim("pendulum", { length: 1, initialAngle: 10, damping: 0, mass: 0.5, gravity: 9.8 }, ["period", "period"].map(() => "smallAnglePeriod")), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(codes(buildSimFromSpec(F.physLabSim("pendulum", { length: 1, initialAngle: 10, damping: 0, mass: 0.5, gravity: 9.8 }, []), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(codes(buildSimFromSpec({ ...CASES[0][1], physicsLab: CASES[4][1].physicsLab }, "s"))).toEqual(["AI_SIM_SPEC_MALFORMED"]);
    expect(codes(buildSimFromSpec(CASES[0][1], "s", "physicsLab"))).toEqual(["AI_SIM_PLUGIN_MISMATCH"]);
  });
});

describe("21L-PROMPT the advanced physics catalog only where it is needed", () => {
  const intent = (() => { const r = normalizeComposerIntent({ v: 1, subject: "الفيزياء", totalMarks: 20 }); if (!r.ok) throw new Error("intent"); return r.intent; })();
  it("a section planning physicsMotion / physicsLab gets it; another section does not; a modify request about a pendulum gets it", () => {
    const s = normalizePlanShape(F.plan("فيزياء", "default", [F.planSection("أ", [F.planItem("smartSim", 10, { simulator: "physicsLab" })]), F.planSection("ب", [F.planItem("multipleChoice", 10)])]));
    if (!s.ok) throw new Error("plan");
    const plan = validatePlan(s.plan, intent).plan;
    expect(buildSectionPrompt(intent, plan, 0)).toContain("ADVANCED PHYSICS CATALOG");
    expect(buildSectionPrompt(intent, plan, 1)).not.toContain("ADVANCED PHYSICS CATALOG");
    const projection = { v: 1, examId: "E", title: "t", sections: [] } as never;
    expect(buildModifyPrompt(projection, "generateSection", { kind: "exam" }, "أضف قسمًا عن البندول البسيط")).toContain("ADVANCED PHYSICS CATALOG");
    expect(buildModifyPrompt(projection, "generateSection", { kind: "exam" }, "add a VLAN section")).not.toContain("ADVANCED PHYSICS CATALOG");
    expect(mentionsAdvancedPhysics("physicsMotion@1")).toBe(true);
  });
});

describe("21L-ACC a physics exam through the REAL endpoint and client orchestration", () => {
  it("plan → section → canonical exam (projectile item + composite circuit context): clean verdict, round trip, sanitizer, empty = 0", async () => {
    const intentRaw = { v: 1, subject: "الفيزياء", grade: "11", language: "ar", totalMarks: 20, difficulty: "mixed", sectionTarget: 1, presentationPreset: "scienceLab", teacherInstruction: "امتحان فيزياء: المقذوفات والدوائر الكهربائية مع محاكاة" };
    const plan = F.plan("الفيزياء المتقدمة", "scienceLab", [F.planSection("المحاكاة", [
      F.planItem("smartSim", 10, { topic: "المقذوفات", simulator: "physicsMotion" }),
      F.planItem("composite", 10, { topic: "الدوائر", simulator: "physicsLab" })
    ])]);
    const section = { items: [
      F.item("smartSim", { topic: "المقذوفات", smartSim: { text: "أطلق المقذوف وقِس زمن الطيران والمدى.", sim: CASES[1][1] } }),
      F.item("composite", { topic: "الدوائر", composite: F.composite("استخدم الدائرة المتصلة على التوالي.", F.simContext(CASES[7][1]), [
        F.group([F.part("smartSim", 5, { linked: true, simChecks: ["c-m1"], simText: "المقاومة المكافئة" }), F.part("smartSim", 5, { linked: true, simChecks: ["c-m2", "c-m3"], simText: "التيار والقدرة" })])
      ]) })
    ] };
    const ai = F.scriptedAi({ ai_exam_plan: [plan], ai_exam_section: [section] });
    const t: ComposerTransport = async body => (await composerApi.handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody;
    const r = await runGeneration(t, intentRaw, { examId: "EXAM-21L", report: () => {}, nonce: "phys21l" });
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    const exam = r.result.exam as StructuredExam;
    expect(r.result.verdict.blocking, JSON.stringify(r.result.verdict.blocking)).toEqual([]);
    expect(r.result.verdict.summary.totalMarks).toBe(20);
    expect(ai.calls[0].prompt).not.toContain("ADVANCED PHYSICS CATALOG");
    expect(ai.calls[1].prompt).toContain("ADVANCED PHYSICS CATALOG");
    const imp = parseStructuredExamJson(JSON.stringify(exam), "phys.json");
    expect(imp.canOpen).toBe(true);
    expect(imp.validationErrors).toEqual([]);
    expect(JSON.stringify(sanitize(exam))).not.toMatch(/"(checks|expected|correct|accepted|tolerance|aiComposer)"\s*:/);
    expect(gradeExam(exam, {}).score).toBe(0);
  });
});
