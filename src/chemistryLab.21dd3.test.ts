import { describe, expect, it } from "vitest";
import {
  bindSmartSimAnswerToQuestion, evaluateSmartSim, listSmartSimPlugins, normalizeSmartSimAnswer, projectSmartSimForStudent, resolveSmartSimDescriptor,
  resolveSmartSimPlugin, validateSmartSimAnswerKey, validateSmartSimQuestion
} from "./trustedSimPlugins";
import { validateSmartSimDescriptor } from "./trustedSimDescriptor";
import { CHEMISTRY_LAB_DESCRIPTOR_V1, CHEM_LAB_MAX_ACTIONS, chemistryLabPluginV1, expectedChemLabText, replayChemLab } from "./chemistryLabPlugin";
import { emptyStateFor, validateChemLabConfig, type ChemLabConfigV1 } from "./chemistryLabModel";
import {
  CHEM_LAB_TEMPLATES, dilutionTemplate, indicatorTemplate, phCompareTemplate, rateTemplate, solidPrepareTemplate, titrationTemplate, unknownTitrationTemplate,
  type ChemLabTemplate
} from "./chemistryLab/labTemplates";

// Phase 21D-D.3 — chemistryLab@1 authority: registration, the strict public config, semantic actions + deterministic replay, derived private
// checks, the explicit precision policy, the server-side evaluation (client state / score / expected values never read) and fail-closed keys.
const env = (config: unknown) => ({ schemaVersion: 1, pluginKey: "chemistryLab", pluginVersion: 1, config });
const key = (checks: unknown[], scoring = "proportional") => ({ scoring, checks });
const answer = (actions: unknown[], extra: Record<string, unknown> = {}) => ({ kind: "smartSim", pluginKey: "chemistryLab", pluginVersion: 1, actions, state: {}, ...extra });
const question = (t: ChemLabTemplate) => ({ id: "q", type: "smartSim", presentationType: "smartSim", questionTypeVersion: 1, text: "س", marks: 10, smartSim: env(t.config), answer: key(t.checks) });
const grade = (t: ChemLabTemplate, actions: unknown[], marks = 10, extra: Record<string, unknown> = {}) =>
  evaluateSmartSim({ envelope: env(t.config), answerKey: key(t.checks), response: answer(actions, extra), maxMarks: marks }, { withDetails: true });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const codes = (cfg: unknown) => { const r = validateChemLabConfig(cfg); return r.ok ? [] : r.issues.map(i => i.code); };
const cfgOf = (t: ChemLabTemplate) => (validateChemLabConfig(t.config) as { ok: true; config: ChemLabConfigV1 }).config;
const num = (taskId: string, value: string, unit: string) => ({ type: "answer.number", taskId, value, unit });
const pick = (taskId: string, ...options: string[]) => ({ type: "answer.choose", taskId, options });
const passed = (e: ReturnType<typeof grade>) => e.checks.filter(c => c.passed).map(c => c.id);

describe("21D-D.3 registration — a NEW exact identity in the chemistry domain", () => {
  it("chemistryLab@1 is registered last, resolves exactly, and its descriptor is valid data with no generic rules", () => {
    expect(listSmartSimPlugins().map(p => p.key + "@" + p.version)).toEqual(["networkTopology@1", "physicsFreeFall@1", "functionStudy2d@1", "networkTopology@2", "physicsMotion@1", "physicsLab@1", "chemistryStructure@1", "chemistryReactions@1", "chemistryLab@1"]);
    expect(resolveSmartSimPlugin("chemistryLab", 1)).toBe(chemistryLabPluginV1);
    for (const [k, v] of [["chemistryLab", 2], ["chemistryLab", "1"], ["ChemistryLab", 1], ["chemistryLabs", 1], ["physicsLab", 2]] as const) expect(resolveSmartSimPlugin(k, v)).toBeUndefined();
    expect(validateSmartSimDescriptor(CHEMISTRY_LAB_DESCRIPTOR_V1).ok).toBe(true);
    expect(resolveSmartSimDescriptor("chemistryLab", 1)).toMatchObject({ domain: "chemistry", genericRules: [], assetKinds: [], checkKinds: ["lab.number", "lab.choice", "lab.prepared", "lab.observed"] });
    expect(CHEM_LAB_MAX_ACTIONS).toBe(500);
  });
  it("every Arabic template is a valid question with a valid private key and a derived expected answer for every task", () => {
    for (const make of CHEM_LAB_TEMPLATES) {
      const t = make();
      expect([t.id, validateSmartSimQuestion(question(t))]).toEqual([t.id, []]);
      expect(validateSmartSimAnswerKey(key(t.checks), chemistryLabPluginV1, cfgOf(t)).ok).toBe(true);
      for (const task of t.config.tasks) expect(expectedChemLabText(cfgOf(t), task.id), t.id + "/" + task.id).not.toBe("—");
    }
  });
});

describe("21D-D.3 strict public configuration — refuse, never repair", () => {
  const base = () => clone(solidPrepareTemplate().config) as Record<string, any>;
  it("refuses unknown keys, versions and experiments", () => {
    expect(codes({ ...base(), extra: 1 })).toContain("LAB_CONFIG_UNKNOWN_KEY");
    expect(codes({ ...base(), v: 2 })).toContain("LAB_CONFIG_VERSION_UNSUPPORTED");
    expect(codes({ ...base(), experiment: { kind: "electrolysis" } })).toContain("LAB_EXPERIMENT_UNKNOWN");
    expect(codes(JSON.parse('{"v":1,"experiment":{"kind":"solutions","solute":"NaCl","source":"solid","stock":null,"flasks":[250],"pipettes":[],"__proto__":{"x":1}},"view":{"readouts":true,"graph":true},"tasks":[]}'))).toContain("LAB_EXPERIMENT_INVALID");
    expect(codes(null)).toEqual(["LAB_CONFIG_INVALID"]);
  });
  it("Lab A: catalog glassware only, consistent sources, a stock within its bound, reachable targets", () => {
    const c = base();
    expect(codes({ ...c, experiment: { ...c.experiment, flasks: [200] } })).toContain("LAB_GLASSWARE_INVALID");
    expect(codes({ ...c, experiment: { ...c.experiment, stock: "1.00" } })).toContain("LAB_EXPERIMENT_INVALID");
    expect(codes({ ...c, experiment: { ...c.experiment, solute: "KMnO4" } })).toContain("LAB_SOLUTE_UNKNOWN");
    const d = clone(dilutionTemplate().config) as Record<string, any>;
    expect(codes({ ...d, experiment: { ...d.experiment, stock: "0.600" } })).toContain("LAB_STOCK_INVALID"); // CuSO₄ bound 0.50 mol/L
    expect(codes({ ...d, experiment: { ...d.experiment, pipettes: [] } })).toContain("LAB_EXPERIMENT_INVALID");
    expect(codes({ ...d, experiment: { ...d.experiment, stock: "5e-1" } })).toContain("LAB_DECIMAL_INVALID");
    // a target that needs a 12.5 mL aliquot (no such pipette) is unreachable
    expect(codes({ ...d, tasks: [{ ...d.tasks[0], concentration: "0.0625" }, ...d.tasks.slice(1)] })).toContain("LAB_PREPARE_UNREACHABLE");
    expect(codes({ ...c, tasks: [{ ...c.tasks[0], concentration: "0.0001" }, ...c.tasks.slice(1)] })).toContain("LAB_PREPARE_UNREACHABLE"); // 0.00146 g
  });
  it("Lab B: supported species and ranges only; ambiguous derived answers are refused", () => {
    const p = clone(phCompareTemplate().config) as Record<string, any>;
    expect(codes({ ...p, experiment: { ...p.experiment, solutions: [{ id: "A", label: "A", species: "HCl", concentration: "2.0" }] }, tasks: [p.tasks[0]] })).toContain("LAB_PH_UNSUPPORTED");
    expect(codes({ ...p, experiment: { ...p.experiment, solutions: [{ id: "A", label: "A", species: "H2SO4", concentration: "0.10" }] }, tasks: [p.tasks[0]] })).toContain("LAB_PH_SOLUTION_INVALID");
    expect(codes({ ...p, experiment: { ...p.experiment, solutions: [...p.experiment.solutions, { id: "A", label: "x", species: "HCl", concentration: "0.10" }] } })).toContain("LAB_PH_SOLUTIONS_INVALID");
    // two solutions with the same pH cannot be the answer to "lowest pH"
    const tie = { ...p, experiment: { ...p.experiment, solutions: [{ id: "A", label: "A", species: "HCl", concentration: "0.010" }, { id: "B", label: "B", species: "HNO3", concentration: "0.010" }] }, tasks: [{ id: "lo", label: "x", kind: "choice", question: "lowestPh", subject: null, other: null, mode: "single", options: ["A", "B"] }] };
    expect(codes(tie)).toContain("LAB_CHOICE_AMBIGUOUS");
    // the indicator colour at a pH on the edge of the transition range is not decided
    const edge = (c: string) => ({ ...p, experiment: { ...p.experiment, solutions: [{ id: "A", label: "A", species: "HCl", concentration: c }] }, tasks: [{ id: "c", label: "x", kind: "choice", question: "indicatorColour", subject: "A", other: "methylOrange", mode: "single", options: ["acid", "transition", "base"] }] });
    expect(codes(edge("0.000040"))).toContain("LAB_CHOICE_AMBIGUOUS"); // pH 4.398: 0.002 from the 4.4 edge of methyl orange
    expect(codes(edge("0.00010"))).toEqual([]); // pH 4.00: clearly inside the transition range
  });
  it("Lab C: strong acid / strong base only, one of concentration or equivalence, a graph needs readouts", () => {
    const t = clone(titrationTemplate().config) as Record<string, any>;
    expect(codes({ ...t, experiment: { ...t.experiment, analyte: { ...t.experiment.analyte, species: "CH3COOH" } } })).toContain("LAB_TITRATION_UNSUPPORTED");
    expect(codes({ ...t, experiment: { ...t.experiment, analyte: { ...t.experiment.analyte, equivalence: "25.00" } } })).toContain("LAB_TITRATION_INVALID");
    expect(codes({ ...t, view: { readouts: false, graph: true } })).toContain("LAB_VIEW_INVALID");
    expect(codes({ ...t, experiment: { ...t.experiment, titrant: { species: "NaOH", concentration: "0.0500" } } })).toContain("LAB_TITRATION_EQUIVALENCE_RANGE");
    const u = clone(unknownTitrationTemplate().config) as Record<string, any>;
    expect(codes({ ...u, experiment: { ...u.experiment, analyte: { ...u.experiment.analyte, equivalence: "18.605" } } })).toContain("LAB_TITRATION_INVALID");
  });
  it("Lab D: bounded temperatures, concentrations, k and Ea; a catalyst needs a defined effect", () => {
    const r = clone(rateTemplate().config) as Record<string, any>;
    expect(codes({ ...r, experiment: { ...r.experiment, trials: [{ ...r.experiment.trials[0], temperature: "150" }] }, tasks: [r.tasks[0]] })).toContain("LAB_RATE_TRIAL_INVALID");
    expect(codes({ ...r, experiment: { ...r.experiment, catalystDrop: null } })).toContain("LAB_RATE_TRIAL_INVALID");
    expect(codes({ ...r, experiment: { ...r.experiment, ea: "7.5e1" } })).toContain("LAB_DECIMAL_INVALID");
    expect(codes({ ...r, experiment: { ...r.experiment, ea: "300" } })).toContain("LAB_RATE_INVALID");
    expect(codes({ ...r, experiment: { ...r.experiment, k25: "-2.0e-3" } })).toContain("LAB_DECIMAL_INVALID");
    expect(codes({ ...r, experiment: { ...r.experiment, order: 3 } })).toContain("LAB_RATE_INVALID");
  });
  it("tasks: declared quantities, units of the right dimension, a strict precision, valid references, ids unique, ≤ 8 tasks", () => {
    const c = base();
    const conc = c.tasks[1];
    expect(codes({ ...c, tasks: [{ ...conc, quantity: "molarMass" }] })).toContain("LAB_QUANTITY_UNKNOWN");
    expect(codes({ ...c, tasks: [{ ...conc, unit: "g" }] })).toContain("LAB_TASK_UNIT_INVALID");
    expect(codes({ ...c, tasks: [{ ...conc, precision: { tolerance: 0.5 } }] })).toContain("LAB_TASK_PRECISION_INVALID");
    expect(codes({ ...c, tasks: [{ ...conc, precision: { decimals: 2, significant: 3 } }] })).toContain("LAB_TASK_PRECISION_INVALID");
    expect(codes({ ...c, tasks: [conc, conc] })).toContain("LAB_TASK_ID_DUPLICATE");
    expect(codes({ ...c, tasks: Array.from({ length: 9 }, (_, i) => ({ ...conc, id: "t" + i })) })).toContain("LAB_TASKS_INVALID");
    expect(codes({ ...c, tasks: [{ ...conc, expected: "0.100" }] })).toContain("LAB_TASK_INVALID"); // no expected value in the public task
    const p = clone(phCompareTemplate().config) as Record<string, any>;
    expect(codes({ ...p, tasks: [{ ...p.tasks[0], subject: "Q" }] })).toContain("LAB_TASK_SUBJECT_INVALID");
    expect(codes({ ...p, tasks: [{ ...p.tasks[2], options: ["acidic", "neutral"] }] })).toContain("LAB_CHOICE_NO_ANSWER"); // D is basic
    expect(codes({ ...p, view: { readouts: false, graph: false } })).toContain("LAB_OBSERVE_NEEDS_READOUTS");
  });
});

describe("21D-D.3 semantic actions — strict, bounded, never trusted beyond the config", () => {
  const solid = cfgOf(solidPrepareTemplate()), ph = cfgOf(indicatorTemplate()), tit = cfgOf(unknownTitrationTemplate());
  const n = (raw: unknown, c: ChemLabConfigV1) => chemistryLabPluginV1.normalizeAction(raw, c);
  it("accepts declared operations and canonicalizes decimals", () => {
    expect(n({ type: "solution.mass", mass: "1.4600" }, solid)).toEqual({ ok: true, action: { type: "solution.mass", mass: "1.46" } });
    expect(n({ type: "titration.add", volume: "0.1" }, tit)).toEqual({ ok: true, action: { type: "titration.add", volume: "0.10" } });
    expect(n(pick("suitable", "phenolphthalein", "methylOrange"), tit)).toEqual({ ok: true, action: pick("suitable", "methylOrange", "phenolphthalein") }); // option order
  });
  it("refuses forged, foreign, out-of-range, malformed and presentation actions", () => {
    for (const [raw, c] of [
      [{ type: "solution.mass", mass: "0.005" }, solid], [{ type: "solution.mass", mass: "1.234" }, solid], [{ type: "solution.mass", mass: "99.99" }, solid],
      [{ type: "solution.mass", mass: 1.46 }, solid], [{ type: "solution.flask", volume: 200 }, solid], [{ type: "solution.pipette", volume: 10 }, solid],
      [{ type: "solution.flask", volume: 250, extra: 1 }, solid], [{ type: "ph.measure", solutionId: "X" }, ph], // no pH meter when readouts are off
      [{ type: "ph.indicator", solutionId: "X", indicatorId: "methylOrange" }, ph], [{ type: "titration.add", volume: "0.07" }, tit],
      [{ type: "titration.add", volume: "-1.00" }, tit], [{ type: "titration.add", volume: "51.00" }, tit], [{ type: "rate.run", trialId: "t1" }, tit],
      [num("conc", "Infinity", "mol/L"), tit], [num("conc", "NaN", "mol/L"), tit], [num("conc", "1e999", "mol/L"), tit], [num("conc", "", "mol/L"), tit],
      [num("conc", "0.0093", "g"), tit], [num("conc", "0,0093", "mol/L"), tit], [num("nope", "1", "mol/L"), tit], [num("suitable", "1", "mol/L"), tit],
      [pick("suitable"), tit], [pick("suitable", "methylRed"), tit], [pick("suitable", "phenolphthalein", "phenolphthalein"), tit],
      [pick("ppX", "acid", "base"), ph], [{ type: "view.zoom" }, tit], [{ type: "lab.record", note: 1 }, tit], [null, tit], ["lab.reset", tit]
    ] as [unknown, ChemLabConfigV1][]) expect(n(raw, c), JSON.stringify(raw)).toEqual({ ok: false, code: "LAB_ACTION_INVALID" });
  });
  it("replay is deterministic, bounded and ignores impossible bench operations", () => {
    const acts = [{ type: "titration.add", volume: "30.00" }, { type: "titration.add", volume: "30.00" }, { type: "lab.record" }];
    const a = replayChemLab(tit, acts), b = replayChemLab(tit, clone(acts));
    expect(a).toEqual(b);
    expect(a.ok && a.state.lab).toEqual({ kind: "titration", indicator: null, added: "30.00" }); // 60 mL would overflow the 50 mL burette
    expect(replayChemLab(tit, Array.from({ length: 501 }, () => ({ type: "lab.record" })))).toEqual({ ok: false, code: "LAB_ACTIONS_TOO_MANY" });
    const reset = replayChemLab(tit, [{ type: "titration.add", volume: "5.00" }, { type: "lab.record" }, num("reading", "5.00", "mL"), { type: "lab.reset" }]);
    expect(reset.ok && reset.state.lab).toEqual(emptyStateFor(tit).lab);
    expect(reset.ok && reset.state.observations).toHaveLength(1); // the notebook and the answers survive a bench reset
    expect(reset.ok && Object.keys(reset.state.answers)).toEqual(["reading"]);
  });
  it("answers are stored in task order and a cleared answer is gone; repeated observations are recorded once", () => {
    const r = replayChemLab(ph, [num("phY", "3", "pH"), pick("ppX", "base"), { type: "answer.clear", taskId: "phY" }, pick("btbY", "acid"),
      { type: "ph.indicator", solutionId: "X", indicatorId: "bromothymolBlue" }, { type: "ph.indicator", solutionId: "X", indicatorId: "bromothymolBlue" }]);
    expect(r.ok && Object.keys(r.state.answers)).toEqual(["ppX", "btbY"]);
    expect(r.ok && r.state.observations).toEqual([{ kind: "indicator", solution: "X", indicator: "bromothymolBlue" }]);
  });
});

describe("21D-D.3 server grading — derived answers, explicit precision, no client authority", () => {
  it("Lab A solid: weigh 1.46 g, make up 250 mL; the concentration is graded against the student's OWN solution", () => {
    const t = solidPrepareTemplate(), prep = [{ type: "solution.flask", volume: 250 }, { type: "solution.mass", mass: "1.46" }, { type: "solution.makeUp" }];
    const perfect = grade(t, [...prep, num("conc", "0.0999", "mol/L"), num("moles", "25.0", "mmol")]);
    expect(perfect).toMatchObject({ score: 10, correct: true, manualReview: false });
    // 1.46 g / 58.44 g mol⁻¹ / 0.250 L = 0.09993 M: "0.100" is the TARGET, not the student's solution (|Δ| > ½·10⁻⁴)
    expect(passed(grade(t, [...prep, num("conc", "0.100", "mol/L")]))).toEqual(["c-prep"]);
    // the same answer in another unit of the same dimension is the same answer
    expect(passed(grade(t, [...prep, num("conc", "99.9", "mmol/L"), num("moles", "0.0250", "mol")]))).toEqual(["c-prep", "c-conc", "c-moles"]);
    // a wrong preparation still earns the consistent calculation (1.50 g → 0.1027 M), not the preparation mark
    const off = grade(t, [{ type: "solution.flask", volume: 250 }, { type: "solution.mass", mass: "1.50" }, { type: "solution.makeUp" }, num("conc", "0.103", "mol/L")]);
    expect(passed(off)).toEqual(["c-conc"]);
    // nothing made up: no trusted value exists, nothing passes, no manual review
    expect(grade(t, [num("conc", "0.100", "mol/L")])).toMatchObject({ score: 0, manualReview: false });
    expect(grade(t, [])).toMatchObject({ score: 0, correct: false, manualReview: false });
  });
  it("Lab A dilution: the exact aliquot (10 mL of 0.500 M → 100 mL of 0.0500 M), moles conserved", () => {
    const t = dilutionTemplate();
    const e = grade(t, [{ type: "solution.pipette", volume: 10 }, { type: "solution.flask", volume: 100 }, { type: "solution.makeUp" }, pick("conserved", "moles"), num("moles", "0.00500", "mol")]);
    expect(e).toMatchObject({ score: 10, correct: true });
    expect(passed(grade(t, [{ type: "solution.pipette", volume: 20 }, { type: "solution.flask", volume: 100 }, { type: "solution.makeUp" }, pick("conserved", "moles", "concentration")]))).toEqual([]);
  });
  it("Lab B: pH values to two decimals, classification, lowest pH, every solution measured", () => {
    const t = phCompareTemplate(), meters = ["A", "B", "C", "D"].map(id => ({ type: "ph.measure", solutionId: id }));
    expect(grade(t, [...meters, num("phA", "2.00", "pH"), num("phB", "3.38", "pH"), pick("classD", "basic"), pick("lowest", "A")])).toMatchObject({ score: 10, correct: true });
    // 3.38 ± 0.005 → 3.375–3.385: "3.39" fails, "3.4" (1 decimal, = 3.400) fails, a strong-acid shortcut (pH 2.00 for B) fails
    expect(passed(grade(t, [num("phB", "3.39", "pH")]))).toEqual([]);
    expect(passed(grade(t, [num("phB", "3.4", "pH")]))).toEqual([]);
    expect(passed(grade(t, [num("phB", "2.00", "pH")]))).toEqual([]);
    expect(passed(grade(t, meters.slice(0, 3)))).toEqual([]);
  });
  it("Lab B indicators: categorical colours derived from the cited ranges; a calculated pH", () => {
    const t = indicatorTemplate(), tests = ["X", "Y", "Z"].map(s => ({ type: "ph.indicator", solutionId: s, indicatorId: "bromothymolBlue" }));
    expect(grade(t, [...tests, pick("ppX", "base"), pick("btbY", "acid"), num("phY", "3.00", "pH")])).toMatchObject({ score: 10, correct: true });
  });
  it("Lab C known analyte: V_eq 25.00 mL, 2.50 mmol NaOH, pH 7 at equivalence, readings that bracket it", () => {
    const t = titrationTemplate();
    const bench = [{ type: "titration.indicator", indicatorId: "phenolphthalein" }, { type: "titration.add", volume: "24.50" }, { type: "lab.record" }, { type: "titration.add", volume: "1.00" }, { type: "lab.record" }];
    expect(grade(t, [...bench, num("veq", "25.00", "mL"), num("nOH", "2.50", "mmol"), pick("eqph", "equal7")])).toMatchObject({ score: 10, correct: true });
    // the titre is known to ±0.10 mL (two readings of ±0.05): 25.08 passes, 25.15 fails; 0.02500 L is the same answer
    expect(passed(grade(t, [num("veq", "25.08", "mL")]))).toEqual(["c-veq"]);
    expect(passed(grade(t, [num("veq", "25.15", "mL")]))).toEqual([]);
    expect(passed(grade(t, [num("veq", "0.02500", "L")]))).toEqual(["c-veq"]);
  });
  it("Lab C unknown analyte: the burette reading is the replayed volume (±0.05 mL); the concentration follows from V_eq (±0.10 mL titre)", () => {
    const t = unknownTitrationTemplate();
    const adds = [{ type: "titration.add", volume: "10.00" }, { type: "lab.record" }, { type: "titration.add", volume: "8.00" }, { type: "lab.record" }, { type: "titration.add", volume: "0.60" }, { type: "lab.record" }];
    const ok = grade(t, [{ type: "titration.indicator", indicatorId: "phenolphthalein" }, ...adds, num("reading", "18.60", "mL"), num("conc", "0.00930", "mol/L"), pick("suitable", "phenolphthalein", "bromothymolBlue")]);
    expect(ok).toMatchObject({ score: 10, correct: true });
    expect(passed(grade(t, [...adds, num("reading", "18.65", "mL")]))).toEqual(["c-reading", "c-readings"]); // within ±0.05 mL of 18.60
    expect(passed(grade(t, [...adds, num("reading", "18.70", "mL")]))).toEqual(["c-readings"]);
    expect(passed(grade(t, [num("conc", "0.00926", "mol/L")]))).toEqual(["c-conc"]); // 0.00930 ± 0.00005 (titre)
    expect(passed(grade(t, [num("conc", "0.00924", "mol/L")]))).toEqual([]);
    // methyl orange changes about 0.6 mL early in this dilute titration: not suitable
    expect(passed(grade(t, [pick("suitable", "methylOrange", "phenolphthalein", "bromothymolBlue")]))).toEqual([]);
  });
  it("review text names indicators, solutions and trials in Arabic — never a raw catalog id", () => {
    const t = unknownTitrationTemplate(), e = grade(t, [pick("suitable", "methylOrange", "phenolphthalein")]);
    const suitable = e.checks.find(c => c.id === "c-suitable")!;
    expect(suitable).toMatchObject({ expected: "الفينولفثالين، أزرق البروموثيمول", actual: "الميثيل البرتقالي، الفينولفثالين", passed: false });
    expect(expectedChemLabText(cfgOf(t), "suitable")).toBe("الفينولفثالين، أزرق البروموثيمول");
    expect(grade(phCompareTemplate(), [pick("lowest", "A")]).checks.find(c => c.id === "c-lowest")).toMatchObject({ expected: "المحلول A — HCl ‏0.010 mol/L", passed: true });
    expect(grade(rateTemplate(), [pick("fastest", "t1")]).checks.find(c => c.id === "c-fastest")).toMatchObject({ expected: "التجربة 3: ‏25 °C مع حافز", actual: "التجربة 1: ‏25 °C دون حافز" });
  });
  it("Lab D: half-life ln 2 / k = 347 s, rate ratio e^{(Ea/R)(1/T₁ − 1/T₂)} = 2.7, the catalysed trial is fastest", () => {
    const t = rateTemplate(), runs = ["t1", "t2", "t3"].map(id => ({ type: "rate.run", trialId: id }));
    expect(grade(t, [...runs, num("half", "347", "s"), num("ratio", "2.7", "1"), pick("fastest", "t3"), pick("cat", "increase")])).toMatchObject({ score: 10, correct: true });
    expect(passed(grade(t, [num("half", "5.78", "min")]))).toEqual(["c-half"]); // 346.6 s = 5.776 min — the task unit decides the precision
    expect(passed(grade(t, [num("ratio", "2", "1")]))).toEqual([]); // "doubles every 10 °C" is a rule of thumb, not this model
  });
  it("never reads a client state, score, checks or expected values; ingest re-derives the state by replay", () => {
    const t = solidPrepareTemplate(), forged = { v: 1, lab: { kind: "solutions", flask: 250, mass: "1.46", pipette: null, madeUp: true }, observations: [], answers: {} };
    const e = grade(t, [], 10, { state: forged, score: 10, correct: true, checks: [{ id: "c-prep", passed: true }] });
    expect(e).toMatchObject({ score: 0, correct: false });
    expect(e.state).toEqual(emptyStateFor(cfgOf(t)));
    expect(normalizeSmartSimAnswer(answer([{ type: "solution.makeUp" }], { score: 10, expected: "0.100" }))).toEqual({ ok: true, answer: answer([{ type: "solution.makeUp" }]) });
    const bound = bindSmartSimAnswerToQuestion(answer([{ type: "solution.flask", volume: 250 }], { state: forged }), question(t));
    expect(bound.ok && bound.answer.state).toEqual({ ...emptyStateFor(cfgOf(t)), lab: { kind: "solutions", flask: 250, mass: null, pipette: null, madeUp: false } });
    expect(bindSmartSimAnswerToQuestion(answer([{ type: "solution.mass", mass: "0.001" }]), question(t))).toEqual({ ok: false, code: "SMARTSIM_ACTION_INVALID" });
  });
  it("fails CLOSED (no automatic mark, manual review) on a broken or tampered key or config", () => {
    const t = titrationTemplate(), right = [num("veq", "25.00", "mL")];
    const closed = (answerKey: unknown, envelope: unknown = env(t.config)) => evaluateSmartSim({ envelope, answerKey, response: answer(right), maxMarks: 10 });
    for (const k of [
      key([{ id: "a", label: "a", weight: 1, kind: "lab.number", taskId: "veq", expected: 25 }]),          // an expected value smuggled into a derived check
      key([{ id: "a", label: "a", weight: 1, kind: "lab.number", taskId: "veq", tolerance: 100 }]),        // a free tolerance is not a parameter
      key([{ id: "a", label: "a", weight: 1, kind: "lab.choice", taskId: "veq" }]),                         // check kind ≠ task kind
      key([{ id: "a", label: "a", weight: 1, kind: "lab.number", taskId: "nope" }]),
      key([{ id: "a", label: "a", weight: 1, kind: "numericNear@1", valueId: "v", expected: 25, tolerance: 1e6 }]),
      key([{ id: "a", label: "a", weight: 0, kind: "lab.number", taskId: "veq" }]), key([]), null
    ]) expect(closed(k), JSON.stringify(k)).toMatchObject({ score: 0, correct: false, manualReview: true, valid: false });
    expect(closed(key(t.checks), env({ ...t.config, experiment: { ...t.config.experiment, analyte: { species: "CH3COOH", volume: "25.00", concentration: "0.100", equivalence: null } } }))).toMatchObject({ score: 0, manualReview: true });
    expect(closed(key(t.checks), { ...env(t.config), pluginVersion: 2 })).toMatchObject({ score: 0, manualReview: true });
  });
  it("projects only the public envelope: an unknown analyte's concentration never reaches the student", () => {
    const t = unknownTitrationTemplate(), projected = projectSmartSimForStudent(env(t.config));
    expect(projected).toEqual({ schemaVersion: 1, pluginKey: "chemistryLab", pluginVersion: 1, config: cfgOf(t) });
    const text = JSON.stringify(projected);
    expect(text).not.toMatch(/0\.0093|lab\.number|c-conc|weight/);
    expect(projectSmartSimForStudent(env({ ...t.config, answer: { conc: "0.00930" } }))).toBeUndefined();
  });
});
