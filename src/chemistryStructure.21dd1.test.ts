import { describe, expect, it } from "vitest";
import { evaluateSmartSim, listSmartSimPlugins, replaySmartSimActions, resolveSmartSimDescriptor, resolveSmartSimPlugin, validateSmartSimQuestion } from "./trustedSimPlugins";
import { validateSmartSimDescriptor } from "./trustedSimDescriptor";
import { CHEMISTRY_STRUCTURE_DESCRIPTOR_V1, chemQuantity, chemistryStructurePluginV1, evaluateChemCheck, initialChemState, type ChemCheck, type ChemStateV1 } from "./chemistryStructurePlugin";
import { validateChemConfig, type ChemConfigV1 } from "./chemistryStructureModel";
import { CHEM_PRESETS, glucosePreset, hydratePreset, moleculePreset, periodicChlorinePreset, sodiumIonPreset, waterPreset, type ChemPreset } from "./chemistryStructure/chemTemplates";
import { MOLECULE_IDS } from "./chemistry/molecules";

// Phase 21D-D.1 — chemistryStructure@1 authority: registration, the strict public config, semantic actions + replay, derived private
// checks, the generic rules, and the server-side evaluation (forged state / score never read).
const env = (config: unknown) => ({ schemaVersion: 1, pluginKey: "chemistryStructure", pluginVersion: 1, config });
const key = (checks: unknown[], scoring = "proportional") => ({ scoring, checks });
const answer = (actions: unknown[], extra: Record<string, unknown> = {}) => ({ kind: "smartSim", pluginKey: "chemistryStructure", pluginVersion: 1, actions, state: {}, ...extra });
const question = (p: ChemPreset) => ({ id: "q", type: "smartSim", presentationType: "smartSim", questionTypeVersion: 1, text: "س", marks: 10, smartSim: env(p.config), answer: key(p.checks) });
const grade = (p: ChemPreset, actions: unknown[], marks = 10, extra: Record<string, unknown> = {}) => evaluateSmartSim({ envelope: env(p.config), answerKey: key(p.checks), response: answer(actions, extra), maxMarks: marks }, { withDetails: true });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const issues = (cfg: unknown) => { const r = validateChemConfig(cfg); return r.ok ? [] : r.issues.map(i => i.code); };

describe("21D-D.1 registration — a NEW exact identity in the chemistry domain", () => {
  it("chemistryStructure@1 is registered (appended), resolves exactly, and its descriptor is valid data", () => {
    expect(listSmartSimPlugins().map(p => p.key + "@" + p.version)).toEqual(["networkTopology@1", "physicsFreeFall@1", "functionStudy2d@1", "networkTopology@2", "physicsMotion@1", "physicsLab@1", "chemistryStructure@1", "chemistryReactions@1", "chemistryLab@1"]);
    expect(resolveSmartSimPlugin("chemistryStructure", 1)).toBe(chemistryStructurePluginV1);
    for (const [k, v] of [["chemistryStructure", 2], ["chemistryStructure", "1"], ["ChemistryStructure", 1], ["chemistry", 1], ["chemistryStructure", 1.5]] as const) expect(resolveSmartSimPlugin(k, v)).toBeUndefined();
    expect(validateSmartSimDescriptor(CHEMISTRY_STRUCTURE_DESCRIPTOR_V1).ok).toBe(true);
    expect(resolveSmartSimDescriptor("chemistryStructure", 1)).toMatchObject({ domain: "chemistry", sceneKinds: ["2d", "3d"], assetKinds: [], genericRules: ["numericNear@1", "objectNotSelected@1", "objectSelected@1", "setEquals@1"] });
  });
  it("every classroom preset (and a preset for every catalog molecule) is a valid question with no finalization issue", () => {
    for (const [id, p] of Object.entries(CHEM_PRESETS)) expect([id, validateSmartSimQuestion(question(p.make()))]).toEqual([id, []]);
    for (const m of MOLECULE_IDS) expect([m, validateSmartSimQuestion(question(moleculePreset(m)))]).toEqual([m, []]);
  });
});

describe("21D-D.1 strict public config — refuse, never repair", () => {
  it("refuses unknown keys, versions, activities and malformed subjects", () => {
    const base = sodiumIonPreset().config;
    const mut = (f: (c: Record<string, unknown>) => void) => { const c = clone(base) as unknown as Record<string, unknown>; f(c); return issues(c); };
    expect(mut(c => { c.renderer = "<b>"; })).toContain("CHEM_CONFIG_UNKNOWN_KEY");
    expect(mut(c => { c.v = 2; })).toContain("CHEM_CONFIG_VERSION_UNSUPPORTED");
    expect(mut(c => { c.activity = "titration"; })).toContain("CHEM_ACTIVITY_UNKNOWN");
    for (const subject of [{ element: "Na", massNumber: 24, charge: 1 }, { element: "Na", massNumber: 23, charge: 2 }, { element: "Xx", massNumber: 1, charge: 0 }, { element: "Fe", massNumber: 56, charge: -1 },
      { element: "na", massNumber: 23, charge: 0 }, { element: "Na", massNumber: 23, charge: 1, label: "x" }, { element: "Na", massNumber: 23.5, charge: 1 }, { element: "Ne", massNumber: 20, charge: 1 }])
      expect(mut(c => { c.subject = subject; }), JSON.stringify(subject)).toContain("CHEM_SUBJECT_INVALID");
    expect(mut(c => { c.subject = { element: "C", massNumber: 14, charge: 0 }; })).toEqual([]);            // classroom radioisotope ¹⁴C
    expect(issues({ ...moleculePreset("water").config, subject: { molecule: "benzene" } })).toContain("CHEM_SUBJECT_INVALID");
    expect(issues({ ...glucosePreset().config, subject: { formula: "C₆H₁₂O₆" } })).toContain("CHEM_SUBJECT_FORMULA_NOT_CANONICAL");
    expect(issues({ ...glucosePreset().config, subject: { formula: "C6H12O6)" } })).toContain("CHEM_SUBJECT_FORMULA_INVALID");
  });
  it("refuses inconsistent views and tasks", () => {
    const atom = sodiumIonPreset().config, water = waterPreset().config;
    expect(issues({ ...atom, view: { ...atom.view, measure: true } })).toContain("CHEM_VIEW_INVALID");
    expect(issues({ ...atom, view: { ...atom.view, periodicTable: "full" } })).toContain("CHEM_VIEW_INVALID");
    expect(issues({ ...water, tasks: { ...water.tasks, build: true } })).toContain("CHEM_TASK_INVALID");
    expect(issues({ ...water, tasks: { ...water.tasks, selection: { label: "x", target: "elements", max: 1 } } })).toContain("CHEM_SELECTION_INVALID");
    expect(issues({ ...water, tasks: { ...water.tasks, selection: { label: "x", target: "atoms", max: 4 } } })).toContain("CHEM_SELECTION_INVALID");   // water has 3 atoms
    const pc = periodicChlorinePreset().config;
    expect(issues({ ...pc, view: { ...pc.view, periodicTable: "hidden" } })).toContain("CHEM_SELECTION_INVALID");
    expect(issues({ ...pc, tasks: { ...pc.tasks, values: [{ id: "Na", label: "x", unit: "1" }] } })).toContain("CHEM_TASK_ID_COLLISION");
    expect(issues({ ...atom, tasks: { ...atom.tasks, values: [...atom.tasks.values, { id: "outer", label: "x", unit: "1" }] } })).toContain("CHEM_TASK_ID_DUPLICATE");
    expect(issues({ ...atom, tasks: { ...atom.tasks, values: [{ id: "v", label: "a\u0007b", unit: "1" }] } })).toContain("CHEM_TASK_INVALID");
    expect(issues({ ...atom, tasks: { ...atom.tasks, values: [{ id: "v", label: "x", unit: "kg" }] } })).toContain("CHEM_TASK_INVALID");
    expect(issues({ ...atom, tasks: { ...atom.tasks, classifications: [{ id: "s", label: "x", property: "shape" }] } })).toContain("CHEM_TASK_INVALID");
    expect(issues({ ...atom, tasks: { build: false, shells: false, values: [], formulas: [], classifications: [], selection: null } })).toContain("CHEM_TASKS_EMPTY");
    expect(issues({ ...atom, tasks: { ...atom.tasks, values: Array.from({ length: 13 }, (_, i) => ({ id: "v" + i, label: "x", unit: "1" })) } })).toContain("CHEM_TASKS_TOO_MANY");
  });
});

describe("21D-D.1 semantic actions and replay", () => {
  const p = sodiumIonPreset(), cfg = validateChemConfig(p.config) as { ok: true; config: ChemConfigV1 };
  const replay = (actions: unknown[], c: ChemConfigV1 = cfg.config) => replaySmartSimActions(chemistryStructurePluginV1, c, actions);
  it("replays into a canonical state (shells trimmed, records sorted)", () => {
    const r = replay([{ type: "particles.set", protons: 11, neutrons: 12, electrons: 10 }, { type: "shells.set", shells: [2, 8, 0, 0] }, { type: "classification.set", taskId: "ionKind", option: "cation" }, { type: "value.set", valueId: "outer", value: 8 }]);
    expect(r.ok && r.state).toEqual({ v: 1, particles: { protons: 11, neutrons: 12, electrons: 10 }, shells: [2, 8], values: { outer: 8 }, formulas: {}, classifications: { ionKind: "cation" }, selected: [] });
    const cleared = replay([{ type: "particles.set", protons: 1, neutrons: 0, electrons: 1 }, { type: "particles.clear" }, { type: "shells.set", shells: [1] }, { type: "shells.clear" }]);
    expect(cleared.ok && cleared.state).toEqual(initialChemState());
  });
  it("REFUSES malformed, undeclared, out-of-bound and presentation actions (the whole answer is refused)", () => {
    for (const a of [{ type: "particles.set", protons: 11.5, neutrons: 12, electrons: 10 }, { type: "particles.set", protons: 37, neutrons: 0, electrons: 0 }, { type: "particles.set", protons: 1, neutrons: 61, electrons: 0 },
      { type: "particles.set", protons: 1, neutrons: 0, electrons: -1 }, { type: "particles.set", protons: 1, neutrons: 0 }, { type: "particles.set", protons: 1, neutrons: 0, electrons: 1, score: 5 },
      { type: "shells.set", shells: [] }, { type: "shells.set", shells: [2, 8, 8, 8, 8] }, { type: "shells.set", shells: [2, 33] }, { type: "shells.set", shells: [32, 32] }, { type: "shells.set", shells: ["2"] },
      { type: "value.set", valueId: "nope", value: 1 }, { type: "value.set", valueId: "outer", value: Infinity }, { type: "value.set", valueId: "outer", value: "8" }, { type: "value.set", valueId: "outer", value: 2e6 },
      { type: "classification.set", taskId: "ionKind", option: "anionic" }, { type: "classification.set", taskId: "ionKind", option: "bent" }, { type: "formula.set", formulaId: "f", text: "H2O" },
      { type: "object.select", objectId: "Na" }, { type: "camera.rotate", yaw: 1 }, { type: "view.zoom", zoom: 2 }, { type: "score.set", value: 10 }, null, "particles.set", []]) {
      expect(replay([a]).ok, JSON.stringify(a)).toBe(false);
    }
  });
  it("formulas are parsed by the trusted parser and stored canonically; an invalid formula is refused", () => {
    const g = validateChemConfig(glucosePreset().config) as { ok: true; config: ChemConfigV1 };
    const r = replay([{ type: "formula.set", formulaId: "empirical", text: " CH₂O " }], g.config);
    expect(r.ok && (r.state as ChemStateV1).formulas).toEqual({ empirical: "CH2O" });
    for (const text of ["ch2o", "CH2O<b>", "X2", "", "C".repeat(129)]) expect(replay([{ type: "formula.set", formulaId: "empirical", text }], g.config).ok, text).toBe(false);
  });
  it("selection: declared ids only, canonical order, bounded by the task's max over the WHOLE action list", () => {
    const w = validateChemConfig(waterPreset().config) as { ok: true; config: ChemConfigV1 };
    expect(replay([{ type: "object.select", objectId: "H1" }, { type: "object.deselect", objectId: "H1" }, { type: "object.select", objectId: "O1" }], w.config).ok).toBe(true);
    expect(replay([{ type: "object.select", objectId: "H1" }, { type: "object.select", objectId: "O1" }], w.config).ok).toBe(false);   // max 1
    expect(replay([{ type: "object.select", objectId: "C1" }], w.config).ok).toBe(false);
    // a molecule question has no build / shells task: those actions are refused there
    expect(replay([{ type: "particles.set", protons: 8, neutrons: 8, electrons: 8 }], w.config).ok).toBe(false);
    expect(replay([{ type: "shells.set", shells: [2, 6] }], w.config).ok).toBe(false);
    const pc = validateChemConfig({ ...periodicChlorinePreset().config, tasks: { ...periodicChlorinePreset().config.tasks, selection: { label: "x", target: "elements", max: 3 } } }) as { ok: true; config: ChemConfigV1 };
    const r = replay([{ type: "object.select", objectId: "S" }, { type: "object.select", objectId: "Cl" }, { type: "object.select", objectId: "H" }], pc.config);
    expect(r.ok && (r.state as ChemStateV1).selected).toEqual(["H", "S", "Cl"]);                           // catalog (Z) order
  });
});

describe("21D-D.1 derived private checks — server evaluation", () => {
  it("²³Na⁺: a perfect build earns full marks; a NEUTRAL Na atom loses exactly the electron, shells and ion-type marks", () => {
    const p = sodiumIonPreset();
    const perfect = [{ type: "particles.set", protons: 11, neutrons: 12, electrons: 10 }, { type: "shells.set", shells: [2, 8] }, { type: "value.set", valueId: "outer", value: 8 },
      { type: "classification.set", taskId: "ionKind", option: "cation" }, { type: "classification.set", taskId: "blockKind", option: "s" }];
    expect(grade(p, perfect)).toMatchObject({ valid: true, score: 10, correct: true, manualReview: false });
    const neutral = [{ type: "particles.set", protons: 11, neutrons: 12, electrons: 11 }, { type: "shells.set", shells: [2, 8, 1] }, { type: "value.set", valueId: "outer", value: 1 },
      { type: "classification.set", taskId: "ionKind", option: "neutral" }, { type: "classification.set", taskId: "blockKind", option: "s" }];
    const r = grade(p, neutral);
    expect(r.checks.map(c => [c.id, c.passed])).toEqual([["protons", true], ["neutrons", true], ["electrons", false], ["shells", false], ["outer", false], ["ion-kind", false], ["block", true]]);
    expect(r.score).toBeCloseTo(10 * 3 / 8, 6);
    expect(r.checks.find(c => c.id === "shells")).toMatchObject({ expected: "2، 8", actual: "2، 8، 1" });
    expect(grade(p, [{ type: "shells.set", shells: [2] }]).checks.find(c => c.id === "shells")!.passed).toBe(false);   // a prefix of the right distribution is wrong
    expect(grade(p, [])).toMatchObject({ score: 0, manualReview: false });
  });
  it("PRIVATE species: the target (³⁵Cl) never appears in the public config, yet every expected value is derived from it", () => {
    const p = periodicChlorinePreset();
    expect(JSON.stringify(p.config)).not.toMatch(/"Cl"|"massNumber"/);
    const right = [{ type: "object.select", objectId: "Cl" }, { type: "particles.set", protons: 17, neutrons: 18, electrons: 17 }, { type: "shells.set", shells: [2, 8, 7] }, { type: "value.set", valueId: "valence", value: 7 }];
    expect(grade(p, right).score).toBe(10);
    const cl37 = [{ type: "object.select", objectId: "Cl" }, { type: "particles.set", protons: 17, neutrons: 20, electrons: 17 }, { type: "shells.set", shells: [2, 8, 7] }, { type: "value.set", valueId: "valence", value: 7 }];
    expect(grade(p, cl37).score).toBeCloseTo(10 * 5 / 8, 6);                                              // wrong isotope: the particle check fails
    const wrongElement = [{ type: "object.select", objectId: "Br" }, { type: "particles.set", protons: 35, neutrons: 44, electrons: 35 }];
    expect(grade(p, wrongElement).score).toBe(0);
  });
  it("water: angle, lone pairs, molar mass, shape, polarity and the central atom (generic setEquals@1)", () => {
    const p = waterPreset();
    const right = [{ type: "value.set", valueId: "angle", value: 104.5 }, { type: "value.set", valueId: "lonePairs", value: 2 }, { type: "value.set", valueId: "molarMass", value: 18.015 },
      { type: "classification.set", taskId: "shape", option: "bent" }, { type: "classification.set", taskId: "polarity", option: "polar" }, { type: "object.select", objectId: "O1" }];
    expect(grade(p, right).score).toBe(10);
    // the common misconception: a linear, non-polar molecule with a tetrahedral 109.5° angle
    const wrong = [{ type: "value.set", valueId: "angle", value: 109.5 }, { type: "value.set", valueId: "lonePairs", value: 0 }, { type: "value.set", valueId: "molarMass", value: 18 },
      { type: "classification.set", taskId: "shape", option: "linear" }, { type: "classification.set", taskId: "polarity", option: "nonpolar" }, { type: "object.select", objectId: "H1" }];
    expect(grade(p, wrong).score).toBe(0);
    expect(grade(p, right).checks.find(c => c.id === "angle")).toMatchObject({ expected: "104.478 ± 0.5", actual: "104.5" });
  });
  it("formula activities: exact molar masses, mass percentages, counts and the EMPIRICAL formula (compared by composition, never by text)", () => {
    const g = glucosePreset();
    const right = [{ type: "value.set", valueId: "molarMass", value: 180.16 }, { type: "value.set", valueId: "carbonPercent", value: 40.0 }, { type: "formula.set", formulaId: "empirical", text: "CH2O" }];
    expect(grade(g, right).score).toBe(10);
    expect(grade(g, [{ type: "formula.set", formulaId: "empirical", text: "OCH2" }]).checks.find(c => c.id === "empirical")!.passed).toBe(true);
    expect(grade(g, [{ type: "formula.set", formulaId: "empirical", text: "C6H12O6" }]).checks.find(c => c.id === "empirical")!.passed).toBe(false);   // the molecular formula is not the empirical one
    const h = hydratePreset();
    expect(grade(h, [{ type: "value.set", valueId: "molarMass", value: 249.68 }, { type: "value.set", valueId: "copperPercent", value: 25.45 }, { type: "value.set", valueId: "oxygenAtoms", value: 9 }]).score).toBe(10);
    expect(grade(h, [{ type: "value.set", valueId: "oxygenAtoms", value: 4 }]).score).toBe(0);              // forgetting the water of crystallisation
    const hc = validateChemConfig(h.config) as { ok: true; config: ChemConfigV1 };
    expect([chemQuantity(hc.config, "molarMass"), chemQuantity(hc.config, "countOf", { element: "H" }), chemQuantity(hc.config, "atomCount"), chemQuantity(hc.config, "elementCount")]).toEqual([249.677, 10, 21, 4]);
  });
  it("a check whose reference is UNDEFINED for its subject is refused at authoring time (never silently scored)", () => {
    const codes = (p: ChemPreset) => validateSmartSimQuestion(question(p)).map(i => i.code);
    const sodium = sodiumIonPreset();
    // valence electrons of an ION (and of a d-block element) are not defined in this model
    expect(codes({ ...sodium, checks: [{ id: "v", label: "v", weight: 1, kind: "chem.value", valueId: "outer", quantity: "valenceElectrons", tolerance: 0 }] })).toContain("CHEM_CHECK_INVALID");
    expect(codes({ ...sodium, checks: [{ id: "v", label: "v", weight: 1, kind: "chem.value", valueId: "outer", quantity: "valenceElectrons", tolerance: 0, species: { element: "Fe", massNumber: 56, charge: 0 } }] })).toContain("CHEM_CHECK_INVALID");
    const glucose = glucosePreset();
    expect(codes({ ...glucose, checks: [{ id: "n", label: "n", weight: 1, kind: "chem.value", valueId: "carbonPercent", quantity: "massPercent", element: "N", tolerance: 0.1 }] })).toContain("CHEM_CHECK_INVALID");
    expect(codes({ ...glucose, checks: [{ id: "n", label: "n", weight: 1, kind: "chem.value", valueId: "molarMass", quantity: "massPercent", element: "C", tolerance: 0.1 }] })).toContain("CHEM_CHECK_INVALID");   // unit g/mol ≠ %
    const n2 = moleculePreset("nitrogen");
    expect(codes({ ...n2, config: { ...n2.config, tasks: { ...n2.config.tasks, values: [{ id: "a", label: "a", unit: "°" }] } }, checks: [{ id: "a", label: "a", weight: 1, kind: "chem.value", valueId: "a", quantity: "bondAngle", parameter: "aNNN", tolerance: 1 }] })).toContain("CHEM_CHECK_INVALID");
    expect(codes({ ...waterPreset(), checks: [{ id: "x", label: "x", weight: 1, kind: "chem.particles", particles: ["protons"] }] })).toContain("CHEM_CHECK_INVALID");          // no build task
    expect(codes({ ...waterPreset(), checks: [{ id: "x", label: "x", weight: 1, kind: "chem.classification", taskId: "shape", species: { element: "O", massNumber: 16, charge: 0 } }] })).toContain("CHEM_CHECK_INVALID");
    expect(codes({ ...glucose, checks: [{ id: "x", label: "x", weight: 1, kind: "chem.formula", formulaId: "empirical", target: "structural" }] })).toContain("CHEM_CHECK_INVALID");
    expect(codes({ ...glucose, checks: [{ id: "x", label: "x", weight: 1, kind: "chem.formula", formulaId: "empirical", target: "molecular", formula: "C₆H₁₂O₆" }] })).toContain("CHEM_CHECK_INVALID");
    const pc = periodicChlorinePreset();
    expect(codes({ ...pc, checks: [{ id: "x", label: "x", weight: 1, kind: "chem.particles", particles: ["protons"] }] })).toContain("CHEM_CHECK_INVALID");                   // no subject, no private species
    expect(codes({ ...pc, checks: [{ id: "x", label: "x", weight: 1, kind: "chem.particles", particles: ["protons", "protons"], species: { element: "Cl", massNumber: 35, charge: 0 } }] })).toContain("CHEM_CHECK_INVALID");
    expect(codes({ ...pc, checks: [{ id: "x", label: "x", weight: 1, kind: "chem.particles", particles: ["protons"], species: { element: "Cl", massNumber: 36, charge: 0 } }] })).toContain("CHEM_CHECK_INVALID");
    expect(codes({ ...pc, checks: [{ id: "x", label: "x", weight: 1, kind: "setEquals@1", expectedIds: ["Xx"] }] }).length).toBeGreaterThan(0);                               // generic rule references are checked
  });
  it("the server NEVER reads the client's state, score or checks: a forged state with a blank action list earns nothing", () => {
    const p = sodiumIonPreset();
    const forged = grade(p, [], 10, { state: { v: 1, particles: { protons: 11, neutrons: 12, electrons: 10 }, shells: [2, 8], values: { outer: 8 }, formulas: {}, classifications: { ionKind: "cation", blockKind: "s" }, selected: [] } });
    expect(forged.score).toBe(0);
    expect(grade(p, [{ type: "shells.set", shells: [2, 8] }], 10, { score: 10, correct: true, checks: [] }).score).toBeCloseTo(10 * 2 / 8, 6);
    // a broken envelope is a fail-closed manual review, never an automatic mark
    expect(evaluateSmartSim({ envelope: { ...env(p.config), pluginVersion: 2 }, answerKey: key(p.checks), response: answer([]), maxMarks: 10 })).toMatchObject({ score: 0, manualReview: true });
    expect(evaluateSmartSim({ envelope: env({ ...p.config, v: 9 }), answerKey: key(p.checks), response: answer([]), maxMarks: 10 })).toMatchObject({ score: 0, manualReview: true });
  });
  it("evaluateChemCheck is pure and total on the empty state", () => {
    const p = waterPreset(), c = (validateChemConfig(p.config) as { ok: true; config: ChemConfigV1 }).config;
    const outcomes = p.checks.filter(k => String(k.kind).startsWith("chem.")).map(k => chemistryStructurePluginV1.validateCheck(k, c)).map(r => (r.ok ? evaluateChemCheck(r.check as ChemCheck, initialChemState(), c) : null));
    expect(outcomes.every(o => o && o.passed === false && o.actual === "—")).toBe(true);
  });
});
