import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { buildComposerCatalog, catalogForPrompt, COMPOSER_SIM_PLUGINS } from "./composerCatalog";
import { buildSimFromSpec, simFreeCreditIssues, type BuiltSim } from "./composerSim";
import { chemistryCatalogForPrompt } from "./composerChemistry";
import { labCatalogForPrompt } from "./composerChemistryLab";
import { runGeneration, type ComposerTransport } from "./composerRun";
import { evaluateSmartSim } from "../trustedSimQuestion";
import { parseStructuredExamJson } from "../structuredExamImport";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import * as grading from "../../api/src/lib/assignment-grading.js";

// Phase 21K — chemistryLab@1 in the AI Full Exam Composer. The model names an experiment, its public data and catalog task ids; code builds
// the ids, units, precision, options and the task-reference checks; validateChemLabConfig decides; chemistryLab@1 derives every answer.
// Reference values are computed by hand (independent of the implementation):
//   solid prep   250 mL of 0.100 mol/L NaCl: n = 0.0250 mol, m = 0.0250 × 58.44 = 1.461 g (CIAAW: Na 22.990, Cl 35.45).
//   pH           HCl 0.010 mol/L: pH = 2.00 (complete dissociation; water negligible at this concentration); NaOH 0.0010: pH 11.00.
//   titration    unknown HCl, 20.00 mL, NaOH 0.0100 mol/L, V_eq 18.60 mL: c = 0.0100 × 18.60 / 20.00 = 0.00930 mol/L.
//   rate         1st order, k₂₅ = 2.0 × 10⁻³ s⁻¹: t½ = ln 2 / k = 346.6 s (3 s.f.: 347 s).
const composerApi = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ status: number; jsonBody: Record<string, unknown> }> };
const sanitize = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => unknown }).sanitizeExamForStudent;
const gradeExam = (grading as unknown as { gradeExam: (e: unknown, a: unknown) => { score: number } }).gradeExam;
type Json = Record<string, unknown>;

const built = (spec: Json): BuiltSim => { const b = buildSimFromSpec(spec, "s"); if (!b.ok) throw new Error(JSON.stringify(b.issues)); return b.value; };
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const messages = (r: { ok: boolean; issues?: { message: string }[] }) => (r.ok ? "" : (r.issues ?? []).map(i => i.message).join(" | "));
const grade = (sim: BuiltSim, actions: Json[]) => {
  const e = evaluateSmartSim({ envelope: sim.envelope as never, answerKey: { scoring: "proportional", checks: sim.checks } as never, response: { kind: "smartSim", pluginKey: "chemistryLab", pluginVersion: 1, actions, state: {} } as never, maxMarks: 10 });
  return { valid: e.valid, passed: e.passedWeight, total: sim.checks.reduce((n, c) => n + c.weight, 0) };
};
const cfg = (s: BuiltSim) => s.envelope.config as { experiment: Json; view: Json; tasks: Json[] };
const answer = (taskId: string, value: string, unit: string) => ({ type: "answer.number", taskId, value, unit });

const SOLID = F.labSim({ experiment: "solutions", solute: "NaCl", source: "solid", tasks: [
  F.labTask("prepare", "prepare", { concentration: "0.100", volume: 250, label: "حضّر 250 mL من محلول NaCl تركيزه 0.100 mol/L." }),
  F.labTask("number", "preparedMoles", { label: "احسب عدد مولات NaCl في المحلول الذي حضّرته.", unit: "mol" })
] });
const PH = F.labSim({ experiment: "ph", readouts: false, solutions: [{ label: "A — HCl", species: "HCl", concentration: "0.010" }, { label: "B — NaOH", species: "NaOH", concentration: "0.0010" }, { label: "C — NaCl", species: "NaCl", concentration: "0.10" }],
  indicators: ["phenolphthalein"], tasks: [F.labTask("number", "pH", { subject: "s1" }), F.labTask("choice", "phClass", { subject: "s2" }), F.labTask("choice", "lowestPh")] });
const TITRATION = F.labSim({ experiment: "titration", analyte: { species: "HCl", volume: "20.00", concentration: null, equivalence: "18.60" }, titrant: { species: "NaOH", concentration: "0.0100" },
  indicators: ["methylOrange", "phenolphthalein", "bromothymolBlue"], tasks: [F.labTask("number", "analyteConcentration"), F.labTask("choice", "equivalencePh"), F.labTask("observe", "readings", { count: 3 })] });
const RATE = F.labSim({ experiment: "rate", order: 1, k25: "2.0e-3", ea: "75", catalystDrop: "5", duration: 1200, readouts: true, graph: true,
  trials: [{ label: "التجربة 1: 25 °C", temperature: "25", concentration: "0.100", catalyst: false }, { label: "التجربة 2: 35 °C", temperature: "35", concentration: "0.100", catalyst: false }],
  tasks: [F.labTask("number", "halfLife", { subject: "t1" }), F.labTask("choice", "fastestTrial"), F.labTask("observe", "runAll")] });

describe("21K-CAT chemistryLab@1 joins the composer catalog", () => {
  it("catalog V9 lists the three chemistry simulators; the general catalog stays bounded; the lab catalog travels with the chemistry catalog", () => {
    expect(buildComposerCatalog().version).toBe("AI_COMPOSER_CATALOG_V9");
    expect(COMPOSER_SIM_PLUGINS.filter(p => p.subject === "chemistry").map(p => p.pluginKey + "@" + p.pluginVersion)).toEqual(["chemistryReactions@1", "chemistryStructure@1", "chemistryLab@1"]);
    const general = catalogForPrompt();
    expect(general.length).toBeLessThanOrEqual(9000);
    expect(general).not.toContain("equivalenceVolume");
    expect(chemistryCatalogForPrompt()).toContain(labCatalogForPrompt());
    for (const id of ["preparedConcentration", "pH", "analyteConcentration", "halfLife", "suitableIndicators", "bracketEquivalence", "methylOrange", "CH3COOH", "CuSO4"]) expect(labCatalogForPrompt()).toContain(id);
  });
});

describe("21K-LAB every experiment built by code, graded by the plugin, no free credit", () => {
  it("solutions (solid): code-owned glassware and units; a correct preparation + answer earns everything (n = 0.0250 mol)", () => {
    const s = built(SOLID);
    expect(cfg(s).experiment).toMatchObject({ kind: "solutions", solute: "NaCl", source: "solid", stock: null, pipettes: [] });
    expect(cfg(s).tasks.map(t => [t.id, t.kind])).toEqual([["q1", "prepare"], ["q2", "number"]]);
    expect(cfg(s).tasks[1]).toMatchObject({ unit: "mol", precision: { significant: 3 } });
    expect(s.checks).toEqual([
      { id: "c-q1", label: "حضّر 250 mL من محلول NaCl تركيزه 0.100 mol/L.", weight: 2, kind: "lab.prepared", taskId: "q1" },
      { id: "c-q2", label: "احسب عدد مولات NaCl في المحلول الذي حضّرته.", weight: 2, kind: "lab.number", taskId: "q2" }
    ]);
    expect(simFreeCreditIssues(s.envelope, s.checks, "s")).toEqual([]);
    const ok = grade(s, [{ type: "solution.flask", volume: 250 }, { type: "solution.mass", mass: "1.46" }, { type: "solution.makeUp" }, answer("q2", "0.0250", "mol")]);
    expect(ok.valid).toBe(true);
    expect(ok.passed).toBe(ok.total);
    expect(grade(s, []).passed).toBe(0);
  });
  it("pH: solution ids s1… in order; HCl 0.010 → pH 2.00; options and mode from the plugin vocabulary", () => {
    const s = built(PH);
    const e = cfg(s).experiment as { solutions: Json[] };
    expect(e.solutions.map(x => x.id)).toEqual(["s1", "s2", "s3"]);
    expect(cfg(s).tasks[0]).toMatchObject({ quantity: "pH", subject: "s1", unit: "pH", precision: { decimals: 2 } });
    expect(cfg(s).tasks[1]).toMatchObject({ question: "phClass", mode: "single", options: ["acidic", "neutral", "basic"] });
    expect(cfg(s).tasks[2]).toMatchObject({ question: "lowestPh", options: ["s1", "s2", "s3"] });
    const ok = grade(s, [answer("q1", "2.00", "pH"), { type: "answer.choose", taskId: "q2", options: ["basic"] }, { type: "answer.choose", taskId: "q3", options: ["s1"] }]);
    expect(ok.passed).toBe(ok.total);
    expect(simFreeCreditIssues(s.envelope, s.checks, "s")).toEqual([]);
  });
  it("titration of an unknown analyte: c = 0.00930 mol/L is never in the config; the student computes it", () => {
    const s = built(TITRATION);
    expect(JSON.stringify(s.envelope.config)).not.toContain("0.0093");
    expect(cfg(s).tasks[0]).toMatchObject({ quantity: "analyteConcentration", unit: "mol/L", precision: { significant: 3 } });
    expect(cfg(s).tasks[2]).toMatchObject({ requirement: "readings", count: 3 });
    const ok = grade(s, [answer("q1", "0.00930", "mol/L"), { type: "answer.choose", taskId: "q2", options: ["equal7"] }]);
    expect(ok.passed).toBe(ok.total - 1);                                          // the 3 readings are not taken: the observe check fails
    expect(simFreeCreditIssues(s.envelope, s.checks, "s")).toEqual([]);
  });
  it("rate: trial ids t1… in order; first order k = 2.0e-3 s⁻¹ → t½ = 347 s (3 s.f.); 35 °C is the fastest trial", () => {
    const s = built(RATE);
    expect((cfg(s).experiment as { trials: Json[] }).trials.map(t => t.id)).toEqual(["t1", "t2"]);
    expect(cfg(s).tasks[0]).toMatchObject({ quantity: "halfLife", subject: "t1", unit: "s" });
    const ok = grade(s, [answer("q1", "347", "s"), { type: "answer.choose", taskId: "q2", options: ["t2"] }]);
    expect(ok.passed).toBe(ok.total - 1);                                          // runAll not done
    expect(grade(s, [answer("q1", "300", "s")]).passed).toBe(0);
    expect(simFreeCreditIssues(s.envelope, s.checks, "s")).toEqual([]);
  });
});

describe("21K-RULES refusals and code-owned rules", () => {
  it("a known analyte cannot be asked for its concentration (the answer would be printed in the public config)", () => {
    const known = F.labSim({ experiment: "titration", analyte: { species: "HCl", volume: "25.00", concentration: "0.100", equivalence: null }, titrant: { species: "NaOH", concentration: "0.100" },
      indicators: ["phenolphthalein"], tasks: [F.labTask("number", "analyteConcentration")] });
    const r = buildSimFromSpec(known, "s");
    expect(codes(r)).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(messages(r)).toContain("مجهولة");
    // the same known analyte may ask for the equivalence volume (a measurement / calculation, not printed)
    expect(buildSimFromSpec({ ...known, lab: { ...(known.lab as Json), tasks: [F.labTask("number", "equivalenceVolume")] } }, "s").ok).toBe(true);
  });
  it("a titration curve without readouts is quietly hidden (never a refusal): the curve is built from the pH meter", () => {
    const s = built({ ...TITRATION, lab: { ...(TITRATION.lab as Json), readouts: false, graph: true } });
    expect(cfg(s).view).toEqual({ readouts: false, graph: false });
  });
  it("unknown ids come back with the valid list; another experiment's fields are refused; the production validator's refusals pass through", () => {
    const unknownQ = buildSimFromSpec(F.labSim({ ...(PH.lab as Json), tasks: [F.labTask("number", "molarMass", { subject: "s1" })] }), "s");
    expect(messages(unknownQ)).toContain("hydronium");
    const unknownChoice = buildSimFromSpec(F.labSim({ ...(PH.lab as Json), tasks: [F.labTask("choice", "fastestTrial")] }), "s");
    expect(messages(unknownChoice)).toContain("lowestPh");
    expect(codes(buildSimFromSpec(F.labSim({ ...(PH.lab as Json), order: 1 }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);   // a rate field in a pH experiment
    expect(codes(buildSimFromSpec(F.labSim({ ...(SOLID.lab as Json), indicators: ["phenolphthalein"] }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);
    // production refusals: an out-of-model species, an unreachable preparation, an ambiguous lowest-pH question
    expect(codes(buildSimFromSpec(F.labSim({ ...(PH.lab as Json), solutions: [{ label: "X", species: "H2SO4", concentration: "0.1" }], tasks: [F.labTask("number", "pH", { subject: "s1" })] }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(codes(buildSimFromSpec(F.labSim({ ...(SOLID.lab as Json), tasks: [F.labTask("prepare", "prepare", { concentration: "0.00010", volume: 25 })] }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);
    const tie = buildSimFromSpec(F.labSim({ ...(PH.lab as Json), solutions: [{ label: "A", species: "HCl", concentration: "0.010" }, { label: "B", species: "HNO3", concentration: "0.010" }], tasks: [F.labTask("choice", "lowestPh")] }), "s");
    expect(messages(tie)).toContain("متقاربة");
    expect(codes(buildSimFromSpec(F.labSim({ ...(SOLID.lab as Json), tasks: [] }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(codes(buildSimFromSpec({ ...SOLID, reactions: (F.rxnSim() as Json).reactions }, "s"))).toEqual(["AI_SIM_SPEC_MALFORMED"]);
  });
  it("an invalid unit falls back to the dimension's default; a valid one is kept", () => {
    const s = built(F.labSim({ ...(SOLID.lab as Json), tasks: [F.labTask("number", "preparedMoles", { unit: "kg" }), F.labTask("number", "preparedConcentration", { unit: "mmol/L" })] }));
    expect(cfg(s).tasks.map(t => t.unit)).toEqual(["mol", "mmol/L"]);
  });
});

describe("21K-ACC a lab exam through the REAL endpoint and client orchestration", () => {
  it("plan → section → canonical exam with a titration item and a composite pH context: clean verdict, round trip, sanitizer, empty = 0", async () => {
    const intentRaw = { v: 1, subject: "الكيمياء", grade: "11", language: "ar", totalMarks: 20, difficulty: "mixed", sectionTarget: 1, presentationPreset: "scienceLab", teacherInstruction: "امتحان مختبر كيمياء: معايرة حمض مجهول وقياس pH" };
    const plan = F.plan("مختبر الكيمياء", "scienceLab", [F.planSection("المختبر", [
      F.planItem("smartSim", 10, { topic: "المعايرة", simulator: "chemistryLab" }),
      F.planItem("composite", 10, { topic: "pH", simulator: "chemistryLab" })
    ])]);
    const section = { items: [
      F.item("smartSim", { topic: "المعايرة", smartSim: { text: "عايِر الحمض المجهول واحسب تركيزه.", sim: TITRATION } }),
      F.item("composite", { topic: "pH", composite: F.composite("استخدم محاليل المختبر.", F.simContext(PH), [
        F.group([F.part("smartSim", 5, { linked: true, simChecks: ["c-q1"], simText: "pH المحلول A" }), F.part("smartSim", 5, { linked: true, simChecks: ["c-q3"], simText: "أقل pH" })])
      ]) })
    ] };
    const ai = F.scriptedAi({ ai_exam_plan: [plan], ai_exam_section: [section] });
    const t: ComposerTransport = async body => (await composerApi.handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody;
    const r = await runGeneration(t, intentRaw, { examId: "EXAM-21K", report: () => {}, nonce: "chemlab21k" });
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    const exam = r.result.exam as StructuredExam;
    expect(r.result.verdict.blocking, JSON.stringify(r.result.verdict.blocking)).toEqual([]);
    expect(r.result.verdict.summary.totalMarks).toBe(20);
    expect(ai.calls[1].prompt).toContain("chemistryLab@1 (fill `lab`");
    const imp = parseStructuredExamJson(JSON.stringify(exam), "lab.json");
    expect(imp.canOpen).toBe(true);
    expect(imp.validationErrors).toEqual([]);
    expect(JSON.stringify(sanitize(exam))).not.toMatch(/"(checks|expected|correct|accepted|aiComposer)"\s*:/);
    expect(gradeExam(exam, {}).score).toBe(0);
  });
});
