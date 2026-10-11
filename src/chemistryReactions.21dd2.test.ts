import { describe, expect, it } from "vitest";
import {
  bindSmartSimAnswerToQuestion, evaluateSmartSim, listSmartSimPlugins, normalizeSmartSimAnswer, projectSmartSimForStudent, replaySmartSimActions, resolveSmartSimDescriptor,
  resolveSmartSimPlugin, validateSmartSimAnswerKey, validateSmartSimQuestion
} from "./trustedSimPlugins";
import { validateSmartSimDescriptor } from "./trustedSimDescriptor";
import { CHEMISTRY_REACTIONS_DESCRIPTOR_V1, RXN_MAX_ACTIONS, chemistryReactionsPluginV1, expectedRxnText, initialRxnState, studentCoefficients, type RxnCheck } from "./chemistryReactionsPlugin";
import { rxnContext, validateRxnConfig, type RxnConfigV1 } from "./chemistryReactionsModel";
import {
  RXN_TEMPLATES, calciumCarbonateTemplate, customAluminiumTemplate, dichromateTemplate, ironTemplate, methaneTemplate, neutralizationTemplate, precipitationTemplate, waterTemplate,
  type RxnTemplate
} from "./chemistryReactions/rxnTemplates";
import { REACTION_CATALOG } from "./chemistry/reactionCatalog";

// Phase 21D-D.2 — chemistryReactions@1 authority: registration, the strict public config, semantic actions + replay, derived private checks
// and the server-side evaluation (forged state / score / expected values never read; a broken key fails closed).
const env = (config: unknown) => ({ schemaVersion: 1, pluginKey: "chemistryReactions", pluginVersion: 1, config });
const key = (checks: unknown[], scoring = "proportional") => ({ scoring, checks });
const answer = (actions: unknown[], extra: Record<string, unknown> = {}) => ({ kind: "smartSim", pluginKey: "chemistryReactions", pluginVersion: 1, actions, state: {}, ...extra });
const question = (t: RxnTemplate) => ({ id: "q", type: "smartSim", presentationType: "smartSim", questionTypeVersion: 1, text: "س", marks: 10, smartSim: env(t.config), answer: key(t.checks) });
const grade = (t: RxnTemplate, actions: unknown[], marks = 10, extra: Record<string, unknown> = {}) =>
  evaluateSmartSim({ envelope: env(t.config), answerKey: key(t.checks), response: answer(actions, extra), maxMarks: marks }, { withDetails: true });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const codes = (cfg: unknown) => { const r = validateRxnConfig(cfg); return r.ok ? [] : r.issues.map(i => i.code); };
const coef = (termId: string, value: number) => ({ type: "coefficient.set", termId, value });
const cfgOf = (t: RxnTemplate) => (validateRxnConfig(t.config) as { ok: true; config: RxnConfigV1 }).config;
const custom = (reactants: [string, number][], products: [string, number][]) => ({ custom: { reactants: reactants.map(([formula, charge]) => ({ formula, charge, state: null })), products: products.map(([formula, charge]) => ({ formula, charge, state: null })) } });
const withReaction = (reaction: unknown, tasks: unknown = { balance: { locked: [] }, classifications: [], selections: [] }) => ({ v: 1, reaction, view: { conservation: true, particles: true, states: true, names: false }, tasks });

describe("21D-D.2 registration — a NEW exact identity in the chemistry domain", () => {
  it("chemistryReactions@1 is registered last, resolves exactly, and its descriptor is valid data with no generic rules", () => {
    expect(listSmartSimPlugins().map(p => p.key + "@" + p.version)).toEqual(["networkTopology@1", "physicsFreeFall@1", "functionStudy2d@1", "networkTopology@2", "physicsMotion@1", "physicsLab@1", "chemistryStructure@1", "chemistryReactions@1"]);
    expect(resolveSmartSimPlugin("chemistryReactions", 1)).toBe(chemistryReactionsPluginV1);
    for (const [k, v] of [["chemistryReactions", 2], ["chemistryReactions", "1"], ["ChemistryReactions", 1], ["chemistryReaction", 1], ["chemistryReactions", 1.5]] as const) expect(resolveSmartSimPlugin(k, v)).toBeUndefined();
    expect(validateSmartSimDescriptor(CHEMISTRY_REACTIONS_DESCRIPTOR_V1).ok).toBe(true);
    expect(resolveSmartSimDescriptor("chemistryReactions", 1)).toMatchObject({ domain: "chemistry", genericRules: [], assetKinds: [], checkKinds: ["rxn.balanced", "rxn.lowest", "rxn.element", "rxn.charge", "rxn.coefficient", "rxn.classification", "rxn.selection"] });
    expect(RXN_MAX_ACTIONS).toBe(500);
  });
  it("every classroom template is a valid question with no finalization issue", () => {
    for (const [id, t] of Object.entries(RXN_TEMPLATES)) expect([id, validateSmartSimQuestion(question(t.make()))]).toEqual([id, []]);
  });
  it("every catalog reaction is a valid balancing question", () => {
    for (const c of REACTION_CATALOG) {
      const t: RxnTemplate = { config: { v: 1, reaction: { catalog: c.id }, view: { conservation: true, particles: true, states: true, names: true }, tasks: { balance: { locked: [] }, classifications: [], selections: [] } }, checks: [{ id: "b", label: "b", weight: 1, kind: "rxn.balanced" }, { id: "l", label: "l", weight: 1, kind: "rxn.lowest" }] };
      expect([c.id, validateSmartSimQuestion(question(t))]).toEqual([c.id, []]);
    }
  });
});

describe("21D-D.2 strict public config — refuse, never repair", () => {
  const base = waterTemplate().config;
  const mut = (f: (c: Record<string, unknown>) => void) => { const c = clone(base) as unknown as Record<string, unknown>; f(c); return codes(c); };
  it("refuses unknown keys, versions, catalog ids and malformed reaction references", () => {
    expect(mut(c => { c.renderer = "<b>"; })).toContain("RXN_CONFIG_UNKNOWN_KEY");
    expect(mut(c => { c.v = 2; })).toContain("RXN_CONFIG_VERSION_UNSUPPORTED");
    expect(mut(c => { c.reaction = { catalog: "thermite" }; })).toContain("RXN_REACTION_UNKNOWN");
    expect(mut(c => { c.reaction = { catalog: "__proto__" }; })).toContain("RXN_REACTION_UNKNOWN");
    expect(mut(c => { c.reaction = { catalog: "waterFormation", custom: {} }; })).toContain("RXN_REACTION_INVALID");
    expect(mut(c => { c.reaction = "2H2 + O2 -> 2H2O"; })).toContain("RXN_REACTION_INVALID");
    expect(codes(null)).toEqual(["RXN_CONFIG_INVALID"]);
    expect(codes(JSON.parse('{"v":1,"reaction":{"catalog":"waterFormation"},"view":{"conservation":true,"particles":true,"states":true,"names":true},"tasks":{"balance":{"locked":[]},"classifications":[],"selections":[]},"__proto__":{"x":1}}'))).toContain("RXN_CONFIG_UNKNOWN_KEY");
  });
  it("accepts a teacher's equation only when it is valid and UNIQUELY balanceable", () => {
    expect(codes(withReaction(custom([["Al", 0], ["O2", 0]], [["Al2O3", 0]])))).toEqual([]);
    expect(codes(withReaction(custom([["Ca", 2], ["CO3", -2]], [["CaCO3", 0]])))).toEqual([]);
    const refused: [unknown, string][] = [
      [custom([["H₂", 0], ["O2", 0]], [["H2O", 0]]), "RXN_REACTION_INVALID"],          // not canonical text
      [custom([["Xx", 0]], [["H2O", 0]]), "RXN_REACTION_INVALID"],                      // unknown element
      [custom([["Ag", 0]], [["Ag2O", 0]]), "RXN_REACTION_INVALID"],                     // beyond the H–Kr catalog
      [custom([["Na", 9]], [["Na", 0]]), "RXN_REACTION_INVALID"],                       // charge out of range
      [custom([["H2O", 0], ["O2", 0]], [["H2O", 0]]), "RXN_REACTION_INVALID"],          // repeated species
      [{ custom: { reactants: [{ formula: "H2", charge: 0 }], products: [{ formula: "H2O", charge: 0, state: null }] } }, "RXN_REACTION_INVALID"],   // missing state key
      [{ custom: { reactants: [{ formula: "H2", charge: 0, state: "plasma" }], products: [{ formula: "H2O", charge: 0, state: null }] } }, "RXN_REACTION_INVALID"],
      [custom([["H2", 0]], [["H2O", 0]]), "RXN_REACTION_UNBALANCEABLE"],                // O on one side
      [custom([["H2", 0], ["O2", 0]], [["H2O", 0], ["H2O2", 0]]), "RXN_REACTION_UNBALANCEABLE"],   // two independent balancings
      [custom([["Na", 1], ["Cl", -1]], [["NaCl", 1]]), "RXN_REACTION_UNBALANCEABLE"],   // charge can never balance
      [custom([["C998H999", 0]], [["C999", 0], ["H998", 0]]), "RXN_REACTION_UNBALANCEABLE"]   // coefficients over the bound
    ];
    for (const [reaction, code] of refused) expect(codes(withReaction(reaction)), JSON.stringify(reaction)).toContain(code);
    const r = validateRxnConfig(withReaction(custom([["H2", 0], ["O2", 0]], [["H2O", 0], ["H2O2", 0]])));
    expect(!r.ok && r.issues[0].message).toMatch(/أكثر من وزن مستقل/);
  });
  it("refuses inconsistent views and balance tasks", () => {
    expect(mut(c => { c.view = { conservation: true, particles: true, states: true }; })).toContain("RXN_VIEW_INVALID");
    expect(mut(c => { c.view = { conservation: "yes", particles: true, states: true, names: true }; })).toContain("RXN_VIEW_INVALID");
    expect(codes({ ...withReaction(custom([["Al", 0], ["O2", 0]], [["Al2O3", 0]])), view: { conservation: true, particles: true, states: true, names: true } })).toContain("RXN_VIEW_INVALID");
    expect(mut(c => { (c.tasks as Record<string, unknown>).balance = { locked: ["r9"] }; })).toContain("RXN_BALANCE_INVALID");
    expect(mut(c => { (c.tasks as Record<string, unknown>).balance = { locked: ["r1", "r1"] }; })).toContain("RXN_BALANCE_INVALID");
    expect(mut(c => { (c.tasks as Record<string, unknown>).balance = { locked: ["r1", "r2", "p1"] }; })).toContain("RXN_BALANCE_INVALID");
    expect(mut(c => { (c.tasks as Record<string, unknown>).balance = { locked: [], given: [2] }; })).toContain("RXN_BALANCE_INVALID");
    // locked ids are canonicalized into term order
    const r = validateRxnConfig({ ...clone(base), tasks: { balance: { locked: ["p1", "r1"] }, classifications: [], selections: [] } });
    expect(r.ok && r.config.tasks.balance).toEqual({ locked: ["r1", "p1"] });
  });
  it("refuses classifications that would mark a defensible answer wrong, or that are guessed for a teacher's equation", () => {
    const cls = (options: string[], mode = "single") => mut(c => { (c.tasks as Record<string, unknown>).classifications = [{ id: "k", label: "صنّف", mode, options }]; });
    expect(cls(["synthesis", "decomposition"])).toEqual([]);
    expect(cls(["synthesis", "combustion"])).toContain("RXN_CLASSIFICATION_AMBIGUOUS");      // water is BOTH: single choice is ambiguous
    expect(cls(["synthesis", "combustion"], "multiple")).toEqual([]);
    expect(cls(["decomposition", "precipitation"])).toContain("RXN_CLASSIFICATION_AMBIGUOUS");   // no correct option
    expect(cls(["decomposition", "precipitation"], "multiple")).toContain("RXN_CLASSIFICATION_AMBIGUOUS");
    expect(cls(["synthesis"])).toContain("RXN_TASK_INVALID");                                 // fewer than two options
    expect(cls(["synthesis", "synthesis"])).toContain("RXN_TASK_INVALID");
    expect(cls(["synthesis", "fusion"])).toContain("RXN_TASK_INVALID");
    expect(cls(["synthesis", "decomposition"], "ranked")).toContain("RXN_TASK_INVALID");
    // contested memberships are never offered
    const iron = clone(ironTemplate().config);
    iron.tasks.classifications = [{ id: "k", label: "صنّف", mode: "multiple", options: ["synthesis", "combustion"] }];
    expect(codes(iron)).toContain("RXN_CLASSIFICATION_CONTESTED");
    const custom1 = withReaction(custom([["Al", 0], ["O2", 0]], [["Al2O3", 0]]), { balance: null, classifications: [{ id: "k", label: "صنّف", mode: "single", options: ["synthesis", "decomposition"] }], selections: [] });
    expect(codes(custom1)).toContain("RXN_CLASSIFICATION_UNSUPPORTED");
  });
  it("refuses selection roles that cannot be answered and malformed / colliding task ids", () => {
    const sel = (role: string, id = "s") => mut(c => { (c.tasks as Record<string, unknown>).selections = [{ id, label: "اختر", role }]; });
    expect(sel("reducingAgent")).toEqual([]);
    expect(sel("precipitate")).toContain("RXN_SELECTION_EMPTY");          // water has no precipitate
    expect(sel("ion")).toContain("RXN_SELECTION_EMPTY");
    expect(sel("catalyst")).toContain("RXN_TASK_INVALID");
    expect(sel("element", "r1")).toContain("RXN_TASK_ID_COLLISION");
    expect(sel("element", "1bad")).toContain("RXN_TASK_INVALID");
    expect(mut(c => { (c.tasks as Record<string, unknown>).selections = [{ id: "family", label: "اختر", role: "element" }]; })).toContain("RXN_TASK_ID_DUPLICATE");
    expect(mut(c => { (c.tasks as Record<string, unknown>).selections = [{ id: "s", label: "a\u0007b", role: "element" }]; })).toContain("RXN_TASK_INVALID");
    expect(mut(c => { (c.tasks as Record<string, unknown>).selections = Array.from({ length: 5 }, (_, i) => ({ id: "s" + i, label: "اختر", role: "element" })); })).toContain("RXN_TASKS_TOO_MANY");
    const customSel = (role: string) => codes(withReaction(custom([["Al", 0], ["O2", 0]], [["Al2O3", 0]]), { balance: null, classifications: [], selections: [{ id: "s", label: "اختر", role }] }));
    expect(customSel("compound")).toEqual([]);
    expect(customSel("oxidizingAgent")).toContain("RXN_SELECTION_UNSUPPORTED");     // never guessed from formulas
    expect(codes(withReaction({ catalog: "waterFormation" }, { balance: null, classifications: [], selections: [] }))).toContain("RXN_TASKS_EMPTY");
  });
});

describe("21D-D.2 semantic actions and replay", () => {
  const cfg = cfgOf(methaneTemplate());
  const replay = (actions: unknown[], c: RxnConfigV1 = cfg) => replaySmartSimActions(chemistryReactionsPluginV1, c, actions);
  it("replays into a canonical state (term order, family vocabulary order, selection term order)", () => {
    const r = replay([coef("p2", 2), coef("r1", 1), coef("r2", 3), coef("r2", 2), { type: "reaction.classify", taskId: "family", families: ["combustion"] }, { type: "species.select", taskId: "fuel", termId: "r2" }, { type: "species.select", taskId: "fuel", termId: "r1" }, { type: "species.deselect", taskId: "fuel", termId: "r2" }]);
    expect(r.ok && r.state).toEqual({ v: 1, coefficients: { r1: 1, r2: 2, p2: 2 }, classifications: { family: ["combustion"] }, selections: { fuel: ["r1"] } });
    expect(r.ok && chemistryReactionsPluginV1.serializeState(r.state)).toBe('{"v":1,"coefficients":{"r1":1,"r2":2,"p2":2},"classifications":{"family":["combustion"]},"selections":{"fuel":["r1"]}}');
    const cleared = replay([coef("r1", 1), { type: "coefficient.clear", termId: "r1" }, coef("p1", 1), { type: "equation.reset" }, { type: "reaction.classify", taskId: "family", families: ["synthesis"] }, { type: "reaction.unclassify", taskId: "family" }, { type: "species.select", taskId: "fuel", termId: "r1" }, { type: "species.deselect", taskId: "fuel", termId: "r1" }]);
    expect(cleared.ok && cleared.state).toEqual(initialRxnState());
    // the grade never depends on click order: terms selected backwards are stored in term order
    const backwards = replaySmartSimActions(chemistryReactionsPluginV1, cfgOf(customAluminiumTemplate()), [{ type: "species.select", taskId: "elements", termId: "r2" }, { type: "species.select", taskId: "elements", termId: "r1" }]);
    expect(backwards.ok && backwards.state).toMatchObject({ selections: { elements: ["r1", "r2"] } });
    expect(grade(customAluminiumTemplate(), [{ type: "species.select", taskId: "elements", termId: "r2" }, { type: "species.select", taskId: "elements", termId: "r1" }]).checks.find(c => c.id === "elements")!.passed).toBe(true);
    const multi = replaySmartSimActions(chemistryReactionsPluginV1, cfgOf(precipitationTemplate()), [{ type: "reaction.classify", taskId: "families", families: ["doubleDisplacement", "precipitation"] }]);
    expect(multi.ok && multi.state).toMatchObject({ classifications: { families: ["doubleDisplacement", "precipitation"] } });
  });
  it("REFUSES malformed, undeclared, locked, out-of-bound and presentation actions (the whole answer is refused)", () => {
    for (const a of [coef("r1", 0), coef("r1", -1), coef("r1", 1000), coef("r1", 1.5), { type: "coefficient.set", termId: "r1", value: "2" }, coef("r9", 1), coef("__proto__", 1),
      { type: "coefficient.set", termId: "r1", value: 2, score: 10 }, { type: "coefficient.clear", termId: "x" }, { type: "equation.reset", all: true },
      { type: "species.select", taskId: "fuel", termId: "r9" }, { type: "species.select", taskId: "nope", termId: "r1" }, { type: "species.select", taskId: "fuel" },
      { type: "reaction.classify", taskId: "family", families: ["combustion", "synthesis"] }, { type: "reaction.classify", taskId: "family", families: ["redox"] },
      { type: "reaction.classify", taskId: "family", families: [] }, { type: "reaction.classify", taskId: "family", families: "combustion" }, { type: "reaction.classify", taskId: "nope", families: ["combustion"] },
      { type: "reaction.unclassify", taskId: "nope" }, { type: "camera.rotate", yaw: 1 }, { type: "view.zoom" }, { type: "coefficient.solve" }, { type: "constructor" }, "coefficient.set", null, []]) {
      expect(replay([a]).ok, JSON.stringify(a)).toBe(false);
    }
    expect(replay([{ type: "camera.rotate", yaw: 1 }])).toEqual({ ok: false, code: "SMARTSIM_ACTION_PRESENTATION_ONLY" });
    // a locked coefficient is GIVEN: the student cannot overwrite it
    expect(replaySmartSimActions(chemistryReactionsPluginV1, cfgOf(ironTemplate()), [coef("p1", 4)]).ok).toBe(false);
    // no balance task: no coefficient actions at all
    const noBalance = cfgOf({ config: { ...clone(methaneTemplate().config), tasks: { ...clone(methaneTemplate().config.tasks), balance: null } }, checks: [] });
    expect(replaySmartSimActions(chemistryReactionsPluginV1, noBalance, [coef("r1", 1)]).ok).toBe(false);
    expect(replaySmartSimActions(chemistryReactionsPluginV1, noBalance, [{ type: "equation.reset" }]).ok).toBe(false);
    // the multiple-choice family set is bounded by the task's options
    expect(replaySmartSimActions(chemistryReactionsPluginV1, cfgOf(precipitationTemplate()), [{ type: "reaction.classify", taskId: "families", families: ["precipitation", "precipitation"] }]).ok).toBe(false);
  });
  it("bounds the number of actions (500) and stays fast at the bound", () => {
    const many = Array.from({ length: RXN_MAX_ACTIONS }, (_, i) => coef("r2", (i % 9) + 1));
    const t0 = performance.now(), r = replay(many);
    expect(r.ok).toBe(true);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(replay([...many, coef("r1", 1)])).toEqual({ ok: false, code: "SMARTSIM_ACTIONS_TOO_MANY" });
  });
});

describe("21D-D.2 derived private checks", () => {
  const water = cfgOf(waterTemplate());
  const vc = (raw: Record<string, unknown>, c: RxnConfigV1 = water) => chemistryReactionsPluginV1.validateCheck({ id: "k", label: "فحص", weight: 1, ...raw }, c);
  it("accepts exactly the parameters of each kind and never an expected value", () => {
    expect(vc({ kind: "rxn.balanced" }).ok).toBe(true);
    expect(vc({ kind: "rxn.balanced", expected: [2, 1, 2] }).ok).toBe(false);
    expect(vc({ kind: "rxn.lowest", coefficients: [1, 1, 1] }).ok).toBe(false);
    expect(vc({ kind: "rxn.element", element: "H" }).ok).toBe(true);
    expect(vc({ kind: "rxn.element", element: "C" }).ok).toBe(false);
    expect(vc({ kind: "rxn.element" }).ok).toBe(false);
    expect(vc({ kind: "rxn.charge" }).ok).toBe(false);                        // neutral equation: charge is always conserved
    expect(vc({ kind: "rxn.charge" }, cfgOf(dichromateTemplate())).ok).toBe(true);
    expect(vc({ kind: "rxn.coefficient", termId: "r2" }).ok).toBe(true);
    expect(vc({ kind: "rxn.coefficient", termId: "p1" }, cfgOf(ironTemplate())).ok).toBe(false);   // locked: given to the student
    expect(vc({ kind: "rxn.coefficient", termId: "q1" }).ok).toBe(false);
    expect(vc({ kind: "rxn.classification", taskId: "family" }).ok).toBe(true);
    expect(vc({ kind: "rxn.classification", taskId: "family", answer: "synthesis" }).ok).toBe(false);
    expect(vc({ kind: "rxn.classification", taskId: "nope" }).ok).toBe(false);
    expect(vc({ kind: "rxn.selection", taskId: "family" }).ok).toBe(false);
    expect(vc({ kind: "rxn.selection", taskId: "fuel" }, cfgOf(methaneTemplate())).ok).toBe(true);
    expect(vc({ kind: "rxn.solve" }).ok).toBe(false);
    const noBalance = cfgOf({ config: { ...clone(waterTemplate().config), tasks: { ...clone(waterTemplate().config.tasks), balance: null } }, checks: [] });
    for (const kind of ["rxn.balanced", "rxn.lowest"]) expect(vc({ kind }, noBalance).ok).toBe(false);
  });
  it("derives the expected answers from the exact solver and the catalog", () => {
    const text = (c: RxnConfigV1, raw: Record<string, unknown>) => { const r = vc(raw, c); if (!r.ok) throw new Error(r.issues[0].message); return expectedRxnText(r.check as RxnCheck, c); };
    expect(text(water, { kind: "rxn.lowest" })).toBe("2H₂ + 1O₂ → 2H₂O");
    expect(text(water, { kind: "rxn.balanced" })).toBe("2H₂ + O₂ → 2H₂O (أو أي مضاعف لها)");
    expect(text(water, { kind: "rxn.classification", taskId: "family" })).toBe("اتحاد (تكوين)");
    const dichro = cfgOf(dichromateTemplate());
    expect(text(dichro, { kind: "rxn.lowest" })).toBe("6Fe²⁺ + 1Cr₂O₇²⁻ + 14H⁺ → 6Fe³⁺ + 2Cr³⁺ + 7H₂O");
    expect(text(dichro, { kind: "rxn.selection", taskId: "oxidizer" })).toBe("Cr₂O₇²⁻");
    expect(text(cfgOf(precipitationTemplate()), { kind: "rxn.classification", taskId: "families" })).toBe("إحلال مزدوج، ترسيب");
    expect(text(cfgOf(customAluminiumTemplate()), { kind: "rxn.coefficient", termId: "r1" })).toBe("4 Al");
    expect(rxnContext(cfgOf(customAluminiumTemplate())).lowest).toEqual([4, 3, 2]);
  });
});

describe("21D-D.2 server-side evaluation", () => {
  it("awards full marks for the smallest balanced coefficients and the right family", () => {
    const e = grade(waterTemplate(), [coef("r1", 2), coef("r2", 1), coef("p1", 2), { type: "reaction.classify", taskId: "family", families: ["synthesis"] }]);
    expect(e).toMatchObject({ score: 10, correct: true, manualReview: false, valid: true, parts: { correct: 3, total: 3 } });
    expect(e.state).toEqual({ v: 1, coefficients: { r1: 2, r2: 1, p1: 2 }, classifications: { family: ["synthesis"] }, selections: {} });
  });
  it("accepts a multiple as balanced but not as the smallest whole numbers", () => {
    const e = grade(waterTemplate(), [coef("r1", 4), coef("r2", 2), coef("p1", 4)]);
    expect(e.checks.map(c => [c.id, c.passed])).toEqual([["balanced", true], ["lowest", false], ["family", false]]);
    expect(e.score).toBe(5);                 // weights 2 / 1 / 1 of 10 marks
    expect(e.checks[0].actual).toBe("4H₂ + 2O₂ → 4H₂O — موزونة");
  });
  it("never awards a conservation mark for an incomplete or unbalanced equation, and explains the imbalance", () => {
    const blank = grade(waterTemplate(), []);
    expect(blank).toMatchObject({ score: 0, correct: false, manualReview: false });
    const partial = grade(waterTemplate(), [coef("r1", 2), coef("p1", 2)]);
    expect(partial.checks.map(c => c.passed)).toEqual([false, false, false]);
    expect(partial.checks[0].actual).toBe("2H₂ + ?O₂ → 2H₂O — ناقصة");
    // an answer with no coefficients: every element and the charge read 0 = 0, yet no conservation check passes
    const onlyFamily = grade(methaneTemplate(), [{ type: "reaction.classify", taskId: "family", families: ["combustion"] }]);
    expect(onlyFamily.checks.map(c => [c.id, c.passed])).toEqual([["balanced", false], ["lowest", false], ["oxygen", false], ["family", true], ["fuel", false]]);
    // one Fe²⁺ with the given Cr₂O₇²⁻: the charge reads +2 − 2 = 0 on the left and 0 on the right, but the equation is incomplete
    const onlyRoles = grade(dichromateTemplate(), [coef("r1", 1), { type: "species.select", taskId: "oxidizer", termId: "r2" }]);
    expect(onlyRoles.checks.map(c => [c.id, c.passed])).toEqual([["balanced", false], ["charge", false], ["lowest", false], ["oxidizer", true], ["reducer", false]]);
    const wrong = grade(waterTemplate(), [coef("r1", 1), coef("r2", 1), coef("p1", 1)]);
    expect(wrong.checks[0]).toMatchObject({ passed: false, actual: "1H₂ + 1O₂ → 1H₂O — غير موزونة", evidence: ["أكسجين O: 2 في المتفاعلات و1 في النواتج — يزيد في المتفاعلات بمقدار 1"] });
  });
  it("gives partial credit per element, coefficient, classification and selection", () => {
    const e = grade(methaneTemplate(), [coef("r1", 1), coef("r2", 2), coef("p1", 1), coef("p2", 1), { type: "reaction.classify", taskId: "family", families: ["combustion"] }, { type: "species.select", taskId: "fuel", termId: "r1" }]);
    // C balanced, O: 4 vs 3 → oxygen check fails; H: 4 vs 2
    expect(e.checks.map(c => [c.id, c.passed])).toEqual([["balanced", false], ["lowest", false], ["oxygen", false], ["family", true], ["fuel", true]]);
    expect(e.score).toBeCloseTo(10 * 2 / 6, 10);
    const ok = grade(methaneTemplate(), [coef("r1", 1), coef("r2", 2), coef("p1", 1), coef("p2", 2), { type: "reaction.classify", taskId: "family", families: ["combustion"] }, { type: "species.select", taskId: "fuel", termId: "r1" }, { type: "species.select", taskId: "fuel", termId: "r2" }]);
    expect(ok.checks.find(c => c.id === "fuel")).toMatchObject({ passed: false, actual: "CH₄، O₂" });      // the set must be EXACT
  });
  it("uses the given (locked) coefficient and grades only what the student writes", () => {
    const e = grade(ironTemplate(), [coef("r1", 4), coef("r2", 3), { type: "reaction.classify", taskId: "family", families: ["synthesis"] }, { type: "species.select", taskId: "reducer", termId: "r1" }]);
    expect(e).toMatchObject({ score: 10, correct: true });
    expect(studentCoefficients({ coefficients: { r1: 4, r2: 3 } }, cfgOf(ironTemplate()))).toEqual([4, 3, 2]);
    // doubling no longer balances: the given 2 Fe₂O₃ fixes the scale
    expect(grade(ironTemplate(), [coef("r1", 8), coef("r2", 6)]).checks[0].passed).toBe(false);
  });
  it("separates atom conservation from charge conservation in ionic equations", () => {
    const t = dichromateTemplate();
    // r2 (Cr₂O₇²⁻) is given as 1: 5 Fe²⁺ … 5 Fe³⁺ keeps every atom balanced but not the charge (22 ≠ 21)
    const e = grade(t, [coef("r1", 5), coef("r3", 14), coef("p1", 5), coef("p2", 2), coef("p3", 7)]);
    expect(e.checks.map(c => [c.id, c.passed])).toEqual([["balanced", false], ["charge", false], ["lowest", false], ["oxidizer", false], ["reducer", false]]);
    expect(e.checks[1].actual).toBe("الشحنة الكلية: +22 في المتفاعلات و+21 في النواتج — غير محفوظة (الفرق 1)");
    const ok = grade(t, [coef("r1", 6), coef("r3", 14), coef("p1", 6), coef("p2", 2), coef("p3", 7), { type: "species.select", taskId: "oxidizer", termId: "r2" }, { type: "species.select", taskId: "reducer", termId: "r1" }]);
    expect(ok).toMatchObject({ score: 10, correct: true });
  });
  it("grades a multiple-choice classification as an exact set", () => {
    const t = calciumCarbonateTemplate(), bal = [coef("r1", 1), coef("p1", 1), coef("p2", 1)];
    expect(grade(t, [...bal, { type: "reaction.classify", taskId: "families", families: ["decomposition"] }]).score).toBe(10);
    expect(grade(t, [...bal, { type: "reaction.classify", taskId: "families", families: ["decomposition", "redox"] }]).checks[1].passed).toBe(false);
    expect(grade(neutralizationTemplate(), [{ type: "species.select", taskId: "acid", termId: "r2" }, { type: "species.select", taskId: "base", termId: "r1" }]).checks.filter(c => c.passed).map(c => c.id)).toEqual(["acid", "base"]);
  });
  it("never reads a client state, score, checks or expected values", () => {
    const forged = { coefficients: { r1: 2, r2: 1, p1: 2 }, classifications: { family: ["synthesis"] }, selections: {} };
    const e = grade(waterTemplate(), [], 10, { state: forged, score: 10, correct: true, checks: [{ id: "balanced", passed: true }] });
    expect(e).toMatchObject({ score: 0, correct: false });
    expect(e.state).toEqual(initialRxnState());
    expect(normalizeSmartSimAnswer(answer([coef("r1", 2)], { score: 10, expected: [2, 1, 2] }))).toEqual({ ok: true, answer: answer([coef("r1", 2)]) });
    // ingest re-derives the state by replay against the PUBLISHED question
    const bound = bindSmartSimAnswerToQuestion(answer([coef("r1", 2)], { state: forged }), question(waterTemplate()));
    expect(bound.ok && bound.answer.state).toEqual({ v: 1, coefficients: { r1: 2 }, classifications: {}, selections: {} });
    expect(bindSmartSimAnswerToQuestion(answer([coef("r1", 0)]), question(waterTemplate()))).toEqual({ ok: false, code: "SMARTSIM_ACTION_INVALID" });
    expect(bindSmartSimAnswerToQuestion({ ...answer([]), pluginKey: "chemistryStructure" }, question(waterTemplate()))).toEqual({ ok: false, code: "SMARTSIM_PLUGIN_MISMATCH" });
  });
  it("fails CLOSED (no automatic mark, manual review) on a broken or tampered key or config", () => {
    const t = waterTemplate(), right = [coef("r1", 2), coef("r2", 1), coef("p1", 2)];
    const closed = (answerKey: unknown, envelope: unknown = env(t.config)) => evaluateSmartSim({ envelope, answerKey, response: answer(right), maxMarks: 10 });
    for (const k of [
      key([{ id: "b", label: "b", weight: 1, kind: "rxn.balanced", expected: "2H2 + O2 -> 2H2O" }]),     // an expected value smuggled into a derived check
      key([{ id: "b", label: "b", weight: 1, kind: "rxn.coefficient", termId: "r1", value: 99 }]),
      key([{ id: "b", label: "b", weight: 1, kind: "rxn.element", element: "Fe" }]),                       // a hidden reference modified to a missing element
      key([{ id: "b", label: "b", weight: 1, kind: "rxn.balanced" }, { id: "x", label: "x", weight: 1, kind: "numericNear@1", valueId: "v", expected: 1, tolerance: 1e6 }]),
      key([{ id: "b", label: "b", weight: 0, kind: "rxn.balanced" }]),
      key([]), null, { checks: [{ id: "b", label: "b", weight: 1, kind: "rxn.balanced" }], scoring: "generous" }
    ]) expect(closed(k), JSON.stringify(k)).toMatchObject({ score: 0, correct: false, manualReview: true, valid: false });
    expect(closed(key(t.checks), env({ ...t.config, reaction: { catalog: "nope" } }))).toMatchObject({ score: 0, manualReview: true });
    expect(closed(key(t.checks), { ...env(t.config), pluginVersion: 2 })).toMatchObject({ score: 0, manualReview: true });
    expect(validateSmartSimAnswerKey(key(t.checks), chemistryReactionsPluginV1, cfgOf(t)).ok).toBe(true);
  });
  it("projects only the canonical public envelope to the student (no checks, no expected answers)", () => {
    const projected = projectSmartSimForStudent(env(dichromateTemplate().config));
    expect(projected).toEqual({ schemaVersion: 1, pluginKey: "chemistryReactions", pluginVersion: 1, config: cfgOf(dichromateTemplate()) });
    expect(JSON.stringify(projected)).not.toMatch(/rxn\.|lowest|coefficients|oxidizingAgent"?:\s*\[/);
    expect(projectSmartSimForStudent(env({ ...dichromateTemplate().config, answer: [6, 1, 14] }))).toBeUndefined();
  });
});
