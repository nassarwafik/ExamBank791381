import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { buildComposerCatalog, catalogForPrompt, COMPOSER_SIM_PLUGINS } from "./composerCatalog";
import { buildSimFromSpec, buildSimSpecSchema, simFreeCreditIssues, type BuiltSim } from "./composerSim";
import { CHEMISTRY_POINTER, COMPOSER_CHEM_QUANTITIES, COMPOSER_MOLECULE_IDS, COMPOSER_REACTION_IDS, chemistryCatalogForPrompt, mentionsChemistry, reactionRolesOf } from "./composerChemistry";
import { buildModifyPrompt, buildSectionPrompt } from "./composerPrompts";
import { normalizeComposerIntent } from "./composerIntent";
import { normalizePlanShape, validatePlan } from "./composerPlan";
import { runGeneration, type ComposerTransport } from "./composerRun";
import { evaluateSmartSim } from "../trustedSimQuestion";
import { REACTION_CATALOG, catalogReaction, catalogRoleTerms, familyStatus } from "../chemistry/reactionCatalog";
import { MOLECULES } from "../chemistry/molecules";
import { CHEM_QUANTITIES } from "../chemistryStructurePlugin";
import { parseStructuredExamJson } from "../structuredExamImport";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import * as grading from "../../api/src/lib/assignment-grading.js";

// Phase 21J — chemistry simulators in the AI Full Exam Composer. The model names catalog entries only; code builds the public config and
// the private checks; every expected answer is derived by the trusted chemistry engines; nothing is free; the catalog stays bounded.
const composerApi = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ status: number; jsonBody: Record<string, unknown> }> };
const sanitize = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => unknown }).sanitizeExamForStudent;
const gradeExam = (grading as unknown as { gradeExam: (e: unknown, a: unknown) => { score: number } }).gradeExam;
type Json = Record<string, unknown>;

const built = (spec: Json): BuiltSim => {
  const b = buildSimFromSpec(spec, "s");
  if (!b.ok) throw new Error(JSON.stringify(b.issues));
  return b.value;
};
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const messages = (r: { ok: boolean; issues?: { message: string }[] }) => (r.ok ? "" : (r.issues ?? []).map(i => i.message).join(" | "));
const grade = (sim: BuiltSim, actions: Json[]) => {
  const e = evaluateSmartSim({ envelope: sim.envelope as never, answerKey: { scoring: "proportional", checks: sim.checks } as never, response: { kind: "smartSim", pluginKey: sim.envelope.pluginKey, pluginVersion: sim.envelope.pluginVersion, actions, state: {} } as never, maxMarks: 10 });
  return { valid: e.valid, passed: e.passedWeight, total: sim.checks.reduce((n, c) => n + c.weight, 0) };
};
const termIds = (id: string) => { const c = catalogReaction(id)!; return [...c.reactants.map((_, i) => "r" + (i + 1)), ...c.products.map((_, i) => "p" + (i + 1))]; };

describe("21J-CAT the chemistry simulators join the composer catalog (derived from the production registries)", () => {
  it("both plugins are registered at exact versions, catalog V5, vocabularies derived from the chemistry catalogs", () => {
    const c = buildComposerCatalog();
    expect(c.version).toBe("AI_COMPOSER_CATALOG_V10");
    expect(COMPOSER_SIM_PLUGINS.filter(p => p.subject === "chemistry").map(p => p.pluginKey + "@" + p.pluginVersion)).toEqual(["chemistryReactions@1", "chemistryStructure@1", "chemistryLab@1"]);   // 21K adds the virtual lab
    expect(COMPOSER_REACTION_IDS).toEqual(REACTION_CATALOG.map(r => r.id));
    expect(COMPOSER_MOLECULE_IDS).toEqual(MOLECULES.map(m => m.id));
    // bond lengths / angles need molecule-specific parameter ids → left to the teacher's editor
    expect(COMPOSER_CHEM_QUANTITIES).toEqual(CHEM_QUANTITIES.filter(q => q.needs !== "length" && q.needs !== "angle").map(q => q.id));
    expect(COMPOSER_CHEM_QUANTITIES).not.toContain("bondAngle");
  });
  it("the general catalog stays bounded: only a pointer line; the full chemistry catalog travels with the prompts that need it", () => {
    const p = catalogForPrompt();
    expect(p).toContain("chemistryReactions@1 (chemistry)");
    expect(p).toContain(CHEMISTRY_POINTER);
    expect(p).not.toContain("methaneCombustion");
    expect(p.length).toBeLessThanOrEqual(9000);
    const chem = chemistryCatalogForPrompt();
    for (const id of COMPOSER_REACTION_IDS) expect(chem).toContain(id + " = ");
    for (const id of COMPOSER_MOLECULE_IDS) expect(chem).toContain(id + "=");
  });
  it("the chemistry catalog never shows a balanced equation (the coefficients are the student's answer)", () => {
    const chem = chemistryCatalogForPrompt();
    const methane = chem.split(" || ").find(l => l.includes("methaneCombustion"))!;
    expect(methane).toContain("[CH₄ + O₂ → CO₂ + H₂O;");                         // the skeleton, never 1 : 2 : 1 : 2
    expect(methane).not.toMatch(/2\s*O₂|2\s*H₂O/);
  });
  it("large catalogs are strings checked by code, not provider enums (strict mode allows 1000 enum values in total)", () => {
    const spec = buildSimSpecSchema() as { properties: Record<string, { anyOf: [unknown, { properties: Record<string, Json> }] }> };
    const rxn = spec.properties.reactions.anyOf[1].properties, st = spec.properties.structure.anyOf[1].properties;
    expect(rxn.reaction).toEqual({ type: "string" });
    expect(st.molecule).toEqual({ anyOf: [{ type: "null" }, { type: "string" }] });
    expect(st.element).toEqual({ anyOf: [{ type: "null" }, { type: "string" }] });
  });
});

describe("21J-RXN chemistryReactions@1: code builds the config and the checks from a catalog reaction", () => {
  it("balance + classify: checks carry NO expected value; the conservation aid is off by default; no free credit", () => {
    const s = built(F.rxnSim());
    expect(s.envelope).toMatchObject({ pluginKey: "chemistryReactions", pluginVersion: 1, config: { reaction: { catalog: "methaneCombustion" }, view: { conservation: false, particles: false }, tasks: { balance: { locked: [] } } } });
    expect(s.checks.map(c => c.kind)).toEqual(["rxn.balanced", "rxn.lowest", "rxn.classification"]);
    for (const c of s.checks) expect(Object.keys(c)).not.toContain("expected");
    expect(simFreeCreditIssues(s.envelope, s.checks, "s")).toEqual([]);
  });
  it("a correct student earns everything, a balanced-but-not-lowest equation earns part, an empty attempt nothing", () => {
    const s = built(F.rxnSim({ roles: ["fuel"] }));
    const c = catalogReaction("methaneCombustion")!, ids = termIds("methaneCombustion");
    const cfg = s.envelope.config as { tasks: { classifications: { options: string[]; mode: string }[] } };
    const yes = cfg.tasks.classifications[0].options.filter(f => familyStatus(c, f as never) === "yes");
    const coeff = (k: number) => ids.map((termId, i) => ({ type: "coefficient.set", termId, value: c.coefficients[i] * k }));
    const answers = [{ type: "reaction.classify", taskId: "family", families: yes }, ...catalogRoleTerms(c, "fuel").map(termId => ({ type: "species.select", taskId: "role-fuel", termId }))];
    const full = grade(s, [...coeff(1), ...answers]);
    expect(full.valid).toBe(true);
    expect(full.passed).toBe(full.total);
    expect(grade(s, [...coeff(2), ...answers]).passed).toBe(full.total - 1);           // balanced, not the smallest whole numbers
    expect(grade(s, []).passed).toBe(0);
  });
  it("classification options never include a contested family; single choice only when exactly one family is correct", () => {
    for (const r of REACTION_CATALOG) {
      if (!r.families.length) continue;
      const s = built(F.rxnSim({ reaction: r.id, balance: false, classify: true }));
      const task = (s.envelope.config as { tasks: { classifications: { mode: string; options: string[] }[] } }).tasks.classifications[0];
      for (const f of r.contested) expect(task.options, r.id).not.toContain(f);
      expect(task.mode, r.id).toBe(r.families.length === 1 ? "single" : "multiple");
      expect(simFreeCreditIssues(s.envelope, s.checks, "s"), r.id).toEqual([]);
    }
  });
  it("every reaction × every role it really has builds through the production validators without free credit", () => {
    for (const r of REACTION_CATALOG) {
      const roles = reactionRolesOf(r.id).slice(0, 4);
      const s = buildSimFromSpec(F.rxnSim({ reaction: r.id, classify: false, roles }), "s");
      expect(s.ok, r.id + messages(s)).toBe(true);
      if (s.ok) expect(simFreeCreditIssues(s.value.envelope, s.value.checks, "s"), r.id).toEqual([]);
    }
  });
  it("refusals: unknown reaction (with the valid list), a role the reaction lacks, no task, a field of another simulator", () => {
    const unknown = buildSimFromSpec(F.rxnSim({ reaction: "makeGold" }), "s");
    expect(codes(unknown)).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(messages(unknown)).toContain("methaneCombustion");
    expect(codes(buildSimFromSpec(F.rxnSim({ reaction: "waterFormation", roles: ["precipitate"] }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(codes(buildSimFromSpec(F.rxnSim({ balance: false, classify: false, roles: [] }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(codes(buildSimFromSpec({ ...F.rxnSim(), structure: (F.structSim() as Json).structure }, "s"))).toEqual(["AI_SIM_SPEC_MALFORMED"]);
    expect(codes(buildSimFromSpec(F.rxnSim({ roles: ["fuel", "fuel"] }), "s"))).toEqual(["AI_SIM_SPEC_MALFORMED"]);
    expect(codes(buildSimFromSpec(F.rxnSim(), "s", "chemistryStructure"))).toEqual(["AI_SIM_PLUGIN_MISMATCH"]);
  });
});

describe("21J-STR chemistryStructure@1: the public subject from the model, every expected value from the trusted core", () => {
  it("atom: ²³Na⁺ — build, shells, outer electrons, ion type; a correct student earns everything (hand-computed: p 11, n 12, e 10; 2,8)", () => {
    const s = built(F.structSim());
    expect(s.envelope.config).toMatchObject({ activity: "atom", subject: { element: "Na", massNumber: 23, charge: 1 }, view: { identity: false, details: false } });
    expect(simFreeCreditIssues(s.envelope, s.checks, "s")).toEqual([]);
    const ok = grade(s, [{ type: "particles.set", protons: 11, neutrons: 12, electrons: 10 }, { type: "shells.set", shells: [2, 8] },
      { type: "value.set", valueId: "v-outerShellElectrons", value: 8 }, { type: "classification.set", taskId: "c-ionType", option: "cation" }]);
    expect(ok).toMatchObject({ valid: true });
    expect(ok.passed).toBe(ok.total);
    expect(grade(s, [{ type: "particles.set", protons: 11, neutrons: 12, electrons: 11 }]).passed).toBe(0);   // the neutral atom is not the ion
  });
  it("molecule: water — molar mass 18.015 g/mol, %O 88.81 %, bent, polar, H2O (hand-computed from CIAAW weights)", () => {
    const s = built(F.structSim({ activity: "molecule", element: null, massNumber: null, charge: null, molecule: "water", periodicTable: "basic", build: false, shells: false,
      quantities: [{ quantity: "molarMass", element: null }, { quantity: "massPercent", element: "O" }], classifications: ["shape", "polarity"], formulaTargets: ["molecular", "empirical"] }));
    expect((s.envelope.config as { view: { periodicTable: string } }).view.periodicTable).toBe("hidden");   // code-owned for a molecule
    const ok = grade(s, [{ type: "value.set", valueId: "v-molarMass", value: 18.015 }, { type: "value.set", valueId: "v-massPercent-O", value: 88.81 },
      { type: "classification.set", taskId: "c-shape", option: "bent" }, { type: "classification.set", taskId: "c-polarity", option: "polar" },
      { type: "formula.set", formulaId: "f-molecular", text: "H2O" }, { type: "formula.set", formulaId: "f-empirical", text: "H2O" }]);
    expect(ok.passed).toBe(ok.total);
    expect(simFreeCreditIssues(s.envelope, s.checks, "s")).toEqual([]);
  });
  it("formula: glucose is canonicalized by the trusted parser; its empirical formula CH2O is graded", () => {
    const s = built(F.structSim({ activity: "formula", element: null, massNumber: null, charge: null, formula: "C6H12O6", build: false, shells: false,
      quantities: [{ quantity: "molarMass", element: null }], classifications: [], formulaTargets: ["empirical"] }));
    const ok = grade(s, [{ type: "value.set", valueId: "v-molarMass", value: 180.156 }, { type: "formula.set", formulaId: "f-empirical", text: "CH2O" }]);
    expect(ok.passed).toBe(ok.total);
  });
  it("formula: a hydrate typed with an ASCII dot becomes the canonical CuSO4·5H2O (the production validator refuses non-canonical text)", () => {
    const s = built(F.structSim({ activity: "formula", element: null, massNumber: null, charge: null, formula: "CuSO4.5H2O", build: false, shells: false,
      quantities: [{ quantity: "countOf", element: "O" }], classifications: [], formulaTargets: [] }));
    expect((s.envelope.config as { subject: Json }).subject).toEqual({ formula: "CuSO4·5H2O" });
    const ok = grade(s, [{ type: "value.set", valueId: "v-countOf-O", value: 9 }]);   // 4 + 5 oxygen atoms per formula unit
    expect(ok.passed).toBe(ok.total);
  });
  it("refusals carry the facts the model needs for its bounded repair", () => {
    const iso = buildSimFromSpec(F.structSim({ massNumber: 99 }), "s");
    expect(codes(iso)).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(messages(iso)).toContain("23");                                                   // the listed isotopes of Na
    expect(codes(buildSimFromSpec(F.structSim({ element: "Xx" }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(codes(buildSimFromSpec(F.structSim({ molecule: "water" }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);                     // atom + molecule
    expect(codes(buildSimFromSpec(F.structSim({ formulaTargets: ["empirical"] }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);         // atom: no formula answer
    expect(codes(buildSimFromSpec(F.structSim({ classifications: ["shape"] }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);            // shape is a molecule property
    const q = buildSimFromSpec(F.structSim({ quantities: [{ quantity: "bondAngle", element: null }] }), "s");
    expect(messages(q)).toContain("outerShellElectrons");                                    // unknown → the valid list
    const formulaGiven = { activity: "formula", element: null, massNumber: null, charge: null, formula: "H2O", build: false, shells: false, quantities: [], classifications: [] };
    expect(codes(buildSimFromSpec(F.structSim({ ...formulaGiven, formulaTargets: ["molecular"] }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);   // the answer would be visible
    expect(codes(buildSimFromSpec(F.structSim({ ...formulaGiven, formula: "Q9!!" , formulaTargets: ["empirical"] }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);
    expect(codes(buildSimFromSpec(F.structSim({ build: false, shells: false, quantities: [], classifications: [] }), "s"))).toEqual(["AI_SIM_TASK_INVALID"]);
    // the production validator still decides what code cannot know: valence electrons of an ion are undefined
    expect(codes(buildSimFromSpec(F.structSim({ quantities: [{ quantity: "valenceElectrons", element: null }] }), "s"))).toEqual(["AI_SIM_CHECKS_INVALID"]);
  });
});

describe("21J-PROMPT the full chemistry catalog only where it is needed", () => {
  const intent = (() => { const r = normalizeComposerIntent({ v: 1, subject: "الكيمياء", totalMarks: 20 }); if (!r.ok) throw new Error("intent"); return r.intent; })();
  const planOf = (raw: Json) => { const s = normalizePlanShape(raw); if (!s.ok) throw new Error(JSON.stringify(s.issues)); const v = validatePlan(s.plan, intent); expect(v.blocking).toEqual([]); return v.plan; };
  it("a section that plans a chemistry simulator gets the catalog; another section does not", () => {
    const plan = planOf(F.plan("كيمياء", "default", [F.planSection("أ", [F.planItem("smartSim", 10, { simulator: "chemistryReactions" })]), F.planSection("ب", [F.planItem("multipleChoice", 10)])]));
    expect(buildSectionPrompt(intent, plan, 0)).toContain("CHEMISTRY CATALOG");
    expect(buildSectionPrompt(intent, plan, 1)).not.toContain("CHEMISTRY CATALOG");
  });
  it("a modify request about chemistry (or an exam with a chemistry simulator) gets it; an unrelated one does not", () => {
    const projection = { v: 1, examId: "E", title: "t", sections: [] } as never;
    expect(buildModifyPrompt(projection, "generateSection", { kind: "exam" }, "أضف قسمًا عن وزن المعادلات الكيميائية")).toContain("CHEMISTRY CATALOG");
    expect(buildModifyPrompt(projection, "generateSection", { kind: "exam" }, "add a VLAN section")).not.toContain("CHEMISTRY CATALOG");
    expect(mentionsChemistry(JSON.stringify({ simulator: "chemistryStructure@1" }))).toBe(true);
  });
});

describe("21J-ACC a chemistry exam through the REAL endpoint and client orchestration", () => {
  it("plan → section → canonical exam: exact marks, finalization clean, round trip, sanitizer leaks nothing, empty = 0", async () => {
    const intentRaw = { v: 1, subject: "الكيمياء", grade: "10", language: "ar", totalMarks: 30, difficulty: "mixed", sectionTarget: 1, presentationPreset: "scienceLab", teacherInstruction: "امتحان كيمياء عن وزن المعادلات وبنية الذرة والجزيء مع محاكاة" };
    const plan = F.plan("الكيمياء — المعادلات والبنية", "scienceLab", [F.planSection("المحاكاة", [
      F.planItem("smartSim", 10, { topic: "وزن المعادلات", simulator: "chemistryReactions" }),
      F.planItem("smartSim", 10, { topic: "بنية الأيون", simulator: "chemistryStructure" }),
      F.planItem("composite", 10, { topic: "الماء", simulator: "chemistryStructure" })
    ])]);
    const water = F.structSim({ activity: "molecule", element: null, massNumber: null, charge: null, molecule: "water", periodicTable: "hidden", build: false, shells: false, quantities: [{ quantity: "molarMass", element: null }], classifications: ["shape"], formulaTargets: [] });
    const section = { items: [
      F.item("smartSim", { topic: "وزن المعادلات", smartSim: { text: "زن معادلة احتراق الميثان وصنّف التفاعل.", sim: F.rxnSim() } }),
      F.item("smartSim", { topic: "بنية الأيون", smartSim: { text: "ابنِ أيون الصوديوم ووزّع إلكتروناته.", sim: F.structSim() } }),
      F.item("composite", { topic: "الماء", composite: F.composite("استخدم نموذج جزيء الماء.", F.simContext(water), [
        F.group([F.part("smartSim", 5, { linked: true, simChecks: ["v-molarMass-check"], simText: "الكتلة المولية" }), F.part("smartSim", 5, { linked: true, simChecks: ["c-shape-check"], simText: "شكل الجزيء" })])
      ]) })
    ] };
    const ai = F.scriptedAi({ ai_exam_plan: [plan], ai_exam_section: [section] });
    const t: ComposerTransport = async body => (await composerApi.handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody;
    const r = await runGeneration(t, intentRaw, { examId: "EXAM-21J", report: () => {}, nonce: "chem21j" });
    if (!r.ok) throw new Error(JSON.stringify(r.failure));
    const exam = r.result.exam as StructuredExam;
    expect(r.result.verdict.blocking, JSON.stringify(r.result.verdict.blocking)).toEqual([]);
    expect(r.result.verdict.summary.totalMarks).toBe(30);
    const qs = exam.sections.flatMap(s => s.questions) as unknown as Json[];
    expect(qs.map(q => q.presentationType)).toEqual(["smartSim", "smartSim", "composite"]);
    expect((qs[0].smartSim as Json).pluginKey).toBe("chemistryReactions");
    expect((qs[1].smartSim as Json).pluginKey).toBe("chemistryStructure");
    // the section prompt carried the chemistry catalog; the plan prompt only the bounded pointer
    expect(ai.calls[0].prompt).not.toContain("CHEMISTRY CATALOG");
    expect(ai.calls[1].prompt).toContain("CHEMISTRY CATALOG");
    const imp = parseStructuredExamJson(JSON.stringify(exam), "chem.json");
    expect(imp.canOpen).toBe(true);
    expect(imp.validationErrors).toEqual([]);
    expect(JSON.stringify(sanitize(exam))).not.toMatch(/"(checks|expected|correct|accepted|aiComposer)"\s*:/);
    expect(gradeExam(exam, {}).score).toBe(0);
  });
});
