// Phase 21D-D.3 — chemistryLab@1: the PUBLIC configuration of the virtual chemistry laboratory (pure; compiled into the shared server build).
//
// ONE versioned contract for four experiments over the pure science modules of src/chemistry/lab/:
//   solutions — weigh a solute (or pipette a stock) and make it up to the mark of a volumetric flask: c = n / V, c₁V₁ = c₂V₂;
//   ph        — up to six single-solute solutions at 25 °C, a pH meter and indicators;
//   titration — a strong acid / strong base titration with a burette, a flask, an indicator and (optionally) a pH meter;
//   rate      — a model reaction A → products: order 0 / 1 / 2, Arrhenius temperature dependence, an optional catalyst, up to four trials.
//   { v: 1, experiment, view: { readouts, graph }, tasks }
// A configuration is PUBLIC (the student receives it): it holds only GIVEN data. A titration of an unknown analyte publishes the observable
// equivalence volume instead of the concentration the student must determine. Strict: exact keys, exact version, bounded canonical decimals;
// anything else is REFUSED, never repaired. Every expected answer is derived from this config (and the replayed student state) by code.
import { hasControlCharacter, isPlainObject, isSemanticId } from "./trustedSimVocabulary";
import { ZERO, cmp, div, fromNumber, mul, parseDecimal, qi, sign, sub, toNumber, type Q } from "./chemistry/lab/exact";
import { LAB_UNITS, isLabDimension, labUnit, type LabDimension } from "./chemistry/lab/units";
import { validatePrecision, type LabPrecision } from "./chemistry/lab/precision";
import { LAB_FLASKS_ML, LAB_PIPETTES_ML, balanceMax, dilute, labSolute, prepareFromSolid, requiredAliquot, requiredMass, type LabSolute, type SolutionResult } from "./chemistry/lab/solutions";
import { acidBaseSpecies, indicatorAppearance, indicatorById, phClassOf, solutionPh, type AcidBaseSpecies, type PhResult } from "./chemistry/lab/acidBase";
import { BURETTE, ENDPOINT_TOLERANCE_ML, TITRATION_LIMITS, indicatorEndpoint, indicatorSuitability, isBuretteStep, titrationPh, titrationSetup, type TitrationSetup } from "./chemistry/lab/titration";
import { KINETICS_LIMITS, concentrationAt, halfLife, initialRate, rateConstant, rateConstantDimension, type RateModel, type RateOrder } from "./chemistry/lab/kinetics";

export const CHEM_LAB_KEY = "chemistryLab";
export const CHEM_LAB_VERSION = 1;
export const CHEM_LAB_LIMITS = Object.freeze({ tasks: 8, solutions: 6, indicators: 4, trials: 4, observations: 24, labelChars: 160, shortLabelChars: 40, options: 6, observeCountMax: 20 });
export const CHEM_LAB_EXPERIMENTS = Object.freeze(["solutions", "ph", "titration", "rate"] as const);
export type ChemLabExperimentKind = (typeof CHEM_LAB_EXPERIMENTS)[number];
export const CHEM_LAB_EXPERIMENT_LABEL: Readonly<Record<ChemLabExperimentKind, string>> = Object.freeze({
  solutions: "تحضير المحاليل والتخفيف", ph: "الأحماض والقواعد والرقم الهيدروجيني", titration: "المعايرة (حمض قوي وقاعدة قوية)", rate: "سرعة التفاعل"
});

// ── experiments ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type SolutionsExperiment = { kind: "solutions"; solute: string; source: "solid" | "stock"; stock: string | null; flasks: number[]; pipettes: number[] };
export type PhSolution = { id: string; label: string; species: string; concentration: string };
export type PhExperiment = { kind: "ph"; solutions: PhSolution[]; indicators: string[] };
export type TitrationExperiment = {
  kind: "titration"; analyte: { species: string; volume: string; concentration: string | null; equivalence: string | null };
  titrant: { species: string; concentration: string }; indicators: string[];
};
export type RateTrial = { id: string; label: string; temperature: string; concentration: string; catalyst: boolean };
export type RateExperiment = { kind: "rate"; order: RateOrder; k25: string; ea: string; catalystDrop: string | null; duration: number; trials: RateTrial[] };
export type ChemLabExperiment = SolutionsExperiment | PhExperiment | TitrationExperiment | RateExperiment;
export type ChemLabView = { readouts: boolean; graph: boolean };

// ── tasks ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type NumberTask = { id: string; label: string; kind: "number"; quantity: string; subject: string | null; other: string | null; at: string | null; unit: string; precision: LabPrecision };
export type ChoiceTask = { id: string; label: string; kind: "choice"; question: string; subject: string | null; other: string | null; mode: "single" | "multiple"; options: string[] };
export type PrepareTask = { id: string; label: string; kind: "prepare"; concentration: string; volume: number };
export type ObserveTask = { id: string; label: string; kind: "observe"; requirement: string; subject: string | null; count: number | null };
export type ChemLabTask = NumberTask | ChoiceTask | PrepareTask | ObserveTask;
export type ChemLabConfigV1 = { v: 1; experiment: ChemLabExperiment; view: ChemLabView; tasks: ChemLabTask[] };
export type ChemLabIssue = { code: string; message: string; path?: string };
export type ChemLabConfigResult = { ok: true; config: ChemLabConfigV1 } | { ok: false; issues: ChemLabIssue[] };

// ── replayed state (defined here so the quantity catalog can read it; the plugin builds it) ────────────────────────────────────────────
export type SolutionsLabState = { kind: "solutions"; flask: number | null; mass: string | null; pipette: number | null; madeUp: boolean };
export type PhLabState = { kind: "ph" };
export type TitrationLabState = { kind: "titration"; indicator: string | null; added: string };
export type RateLabState = { kind: "rate" };
export type ChemLabExperimentState = SolutionsLabState | PhLabState | TitrationLabState | RateLabState;
export type ChemLabObservation =
  | { kind: "solution"; flask: number; mass: string | null; pipette: number | null }
  | { kind: "meter"; solution: string }
  | { kind: "indicator"; solution: string; indicator: string }
  | { kind: "reading"; added: string; indicator: string | null }
  | { kind: "run"; trial: string };
export type ChemLabAnswer = { kind: "number"; value: string; unit: string } | { kind: "choice"; options: string[] };
export type ChemLabStateV1 = { v: 1; lab: ChemLabExperimentState; observations: ChemLabObservation[]; answers: Record<string, ChemLabAnswer> };

// ── strict decimals ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** An authored decimal: digits, optional fraction (≤ 9 places), no sign, no exponent ("0.100", "25.00", "1.8"). Kept AS TYPED (its figures). */
export const AUTHORED_DECIMAL = /^(0|[1-9]\d{0,5})(\.\d{1,9})?$/;
export const authoredDecimal = (v: unknown): Q | null => (typeof v === "string" && AUTHORED_DECIMAL.test(v) ? parseDecimal(v) : null);
const isLabel = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max && !hasControlCharacter(v);
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const uniqueStrings = (v: unknown, ok: (s: string) => boolean, max: number): string[] | null =>
  Array.isArray(v) && v.length <= max && v.every(s => typeof s === "string" && ok(s)) && new Set(v).size === v.length ? [...v] as string[] : null;

// ── derived experiment context (memoized per canonical config object) ─────────────────────────────────────────────────────────────────
export type SolutionsContext = { kind: "solutions"; solute: LabSolute; stock: Q | null; maxMass: Q | null };
export type PhContext = { kind: "ph"; species: Record<string, AcidBaseSpecies>; results: Record<string, PhResult> };
export type TitrationContext = { kind: "titration"; setup: TitrationSetup; unknown: boolean };
export type RateContext = { kind: "rate"; model: RateModel; durationS: number; trials: Record<string, { temperatureC: number; a0: number; catalyst: boolean; k: number }> };
export type ChemLabContext = SolutionsContext | PhContext | TitrationContext | RateContext;
const CONTEXTS = new WeakMap<ChemLabExperiment, ChemLabContext>();
export function chemLabContext(e: ChemLabExperiment): ChemLabContext {
  const hit = CONTEXTS.get(e);
  if (hit) return hit;
  const ctx = buildContext(e);
  if (!ctx.ok) throw new Error("chemLabContext on an unvalidated experiment: " + ctx.code);
  CONTEXTS.set(e, ctx.context);
  return ctx.context;
}
function buildContext(e: ChemLabExperiment): { ok: true; context: ChemLabContext } | { ok: false; code: string; message: string } {
  const bad = (code: string, message: string) => ({ ok: false as const, code, message });
  if (e.kind === "solutions") {
    const solute = labSolute(e.solute);
    if (!solute) return bad("LAB_SOLUTE_UNKNOWN", "المادة المذابة غير موجودة في الفهرس.");
    const stock = e.stock === null ? null : authoredDecimal(e.stock);
    if (e.source === "stock" && (!stock || sign(stock) <= 0 || cmp(stock, solute.maxConcentration) > 0))
      return bad("LAB_STOCK_INVALID", "تركيز المحلول الأم يجب أن يكون موجبًا ولا يتجاوز " + String(toNumber(solute.maxConcentration)) + " mol/L.");
    return { ok: true, context: { kind: "solutions", solute, stock: e.source === "stock" ? stock : null, maxMass: e.source === "solid" ? balanceMax(solute, e.flasks) : null } };
  }
  if (e.kind === "ph") {
    const species: Record<string, AcidBaseSpecies> = {}, results: Record<string, PhResult> = {};
    for (const s of e.solutions) {
      const sp = acidBaseSpecies(s.species), c = authoredDecimal(s.concentration);
      if (!sp || !c) return bad("LAB_PH_SOLUTION_INVALID", "المحلول «" + s.label + "»: المادة أو التركيز غير صالح.");
      const r = solutionPh(sp, c);
      if (!r.ok) return bad("LAB_PH_UNSUPPORTED", "المحلول «" + s.label + "» خارج نطاق النموذج المدعوم (" + sp.nameAr + " بين " + String(toNumber(sp.cMin)) + " و" + String(toNumber(sp.cMax)) + " mol/L).");
      species[s.id] = sp; results[s.id] = r;
    }
    return { ok: true, context: { kind: "ph", species, results } };
  }
  if (e.kind === "titration") {
    const va = authoredDecimal(e.analyte.volume), cb = authoredDecimal(e.titrant.concentration);
    if (!va || !cb) return bad("LAB_TITRATION_INVALID", "حجم المادة المعايَرة أو تركيز المحلول القياسي غير صالح.");
    const unknown = e.analyte.equivalence !== null;
    let ca: Q | null = unknown ? null : authoredDecimal(e.analyte.concentration);
    if (unknown) {
      // unknown analyte: the PUBLIC datum is the observable equivalence volume; the concentration follows from the balanced equation
      const veq = authoredDecimal(e.analyte.equivalence);
      if (!veq) return bad("LAB_TITRATION_INVALID", "حجم نقطة التكافؤ غير صالح.");
      if (mul(veq, qi(100)).d !== 1n) return bad("LAB_TITRATION_INVALID", "حجم نقطة التكافؤ يُكتب بمنزلتين عشريتين على الأكثر.");
      const titrantSp = acidBaseSpecies(e.titrant.species), analyteSp = acidBaseSpecies(e.analyte.species);
      if (!titrantSp || !analyteSp) return bad("LAB_TITRATION_SPECIES_UNKNOWN", titrationMessage("LAB_TITRATION_SPECIES_UNKNOWN"));
      // n_titrant·ions_t = n_analyte·ions_a at equivalence ⇒ c_a = c_t·V_eq·ions_t / (V_a·ions_a)
      ca = div(mul(mul(cb, veq), qi(titrantSp.ions)), mul(va, qi(analyteSp.ions)));
    }
    if (!ca) return bad("LAB_TITRATION_INVALID", "تركيز المادة المعايَرة غير صالح.");
    const r = titrationSetup({ analyte: { species: e.analyte.species, concentration: ca, volumeML: va }, titrant: { species: e.titrant.species, concentration: cb } });
    if (!r.ok) return bad(r.code, titrationMessage(r.code));
    return { ok: true, context: { kind: "titration", setup: r.setup, unknown } };
  }
  const k25 = parseDecimal(e.k25), ea = authoredDecimal(e.ea), drop = e.catalystDrop === null ? null : authoredDecimal(e.catalystDrop), K = KINETICS_LIMITS;
  if (!k25 || sign(k25) <= 0 || !ea) return bad("LAB_RATE_INVALID", "ثابت السرعة عند 25 °C وطاقة التنشيط يجب أن تكون قيمًا موجبة.");
  const eaN = toNumber(ea), dropN = drop === null ? null : toNumber(drop);
  if (eaN < K.eaMinKJ || eaN > K.eaMaxKJ) return bad("LAB_RATE_INVALID", "طاقة التنشيط يجب أن تكون بين " + K.eaMinKJ + " و" + K.eaMaxKJ + " kJ/mol.");
  if (dropN !== null && !(dropN > 0 && dropN <= eaN - 5)) return bad("LAB_RATE_INVALID", "خفض طاقة التنشيط بالحافز يجب أن يكون موجبًا ويترك 5 kJ/mol على الأقل.");
  const model: RateModel = { order: e.order, k25: toNumber(k25), eaKJ: eaN, catalystDropKJ: dropN };
  const trials: RateContext["trials"] = {};
  for (const t of e.trials) {
    const T = authoredDecimal(t.temperature), a0 = authoredDecimal(t.concentration);
    if (!T || !a0) return bad("LAB_RATE_TRIAL_INVALID", "التجربة «" + t.label + "»: درجة الحرارة أو التركيز غير صالح.");
    const Tn = toNumber(T), a0n = toNumber(a0);
    if (Tn < K.temperatureMinC || Tn > K.temperatureMaxC || a0n < K.concentrationMin || a0n > K.concentrationMax)
      return bad("LAB_RATE_TRIAL_INVALID", "التجربة «" + t.label + "»: درجة الحرارة بين " + K.temperatureMinC + " و" + K.temperatureMaxC + " °C والتركيز بين " + K.concentrationMin + " و" + K.concentrationMax + " mol/L.");
    if (t.catalyst && dropN === null) return bad("LAB_RATE_TRIAL_INVALID", "التجربة «" + t.label + "» تستخدم حافزًا لم يُعرَّف أثره في النموذج.");
    const k = rateConstant(model, Tn, t.catalyst);
    if (!(k >= K.kMin && k <= K.kMax)) return bad("LAB_RATE_TRIAL_INVALID", "التجربة «" + t.label + "»: ثابت السرعة الناتج خارج المدى المدعوم.");
    trials[t.id] = { temperatureC: Tn, a0: a0n, catalyst: t.catalyst, k };
  }
  return { ok: true, context: { kind: "rate", model, durationS: e.duration, trials } };
}
function titrationMessage(code: string): string {
  const L = TITRATION_LIMITS;
  return ({
    LAB_TITRATION_SPECIES_UNKNOWN: "مادة غير موجودة في الفهرس.",
    LAB_TITRATION_UNSUPPORTED: "النموذج يدعم معايرة حمض قوي بقاعدة قوية فقط (لا الأحماض والقواعد الضعيفة ولا المحاليل المنظمة).",
    LAB_TITRATION_PAIR_INVALID: "يجب أن يكون أحد المحلولين حمضًا قويًا والآخر قاعدة قوية.",
    LAB_TITRATION_CONCENTRATION_RANGE: "التراكيز بين " + toNumber(L.concentrationMin) + " و" + toNumber(L.concentrationMax) + " mol/L (وضمن حد المادة).",
    LAB_TITRATION_VOLUME_RANGE: "حجم المادة المعايَرة بين " + L.analyteMinML + " و" + L.analyteMaxML + " mL.",
    LAB_TITRATION_EQUIVALENCE_RANGE: "حجم نقطة التكافؤ يجب أن يقع بين " + L.equivalenceMinML + " و" + L.equivalenceMaxML + " mL (سعة السحاحة 50 mL).",
    LAB_TITRATION_EQUATION_INVALID: "تعذّر وزن معادلة التعادل."
  } as Record<string, string>)[code] ?? "إعداد المعايرة غير صالح.";
}

// ── quantity catalog (numeric tasks) ────────────────────────────────────────────────────────────────────────────────────────────────────
export type QuantityNeeds = { subject: "solution" | "indicator" | "trial" | null; other: "trial" | null; at: "volume" | "time" | null };
export type QuantitySpec = {
  id: string; label: string; dimension: LabDimension | "byOrder"; needs: QuantityNeeds;
  /** instrument uncertainty floor in CANONICAL units (exact), from the config */
  instrument: (c: ChemLabConfigV1) => Q;
  /** the trusted value in canonical units, or null when it does not exist (e.g. no solution prepared yet) */
  value: (c: ChemLabConfigV1, s: ChemLabStateV1, t: NumberTask) => Q | null;
};
const none: QuantityNeeds = { subject: null, other: null, at: null };
const zero = () => ZERO;
const ML = (q: Q) => div(q, qi(1000)); // mL → L
/** The solution the student has made up (null when nothing is complete or it lies outside the model). */
export function preparedSolution(c: ChemLabConfigV1, lab: ChemLabExperimentState): SolutionResult | null {
  if (c.experiment.kind !== "solutions" || lab.kind !== "solutions" || !lab.madeUp || lab.flask === null) return null;
  const ctx = chemLabContext(c.experiment) as SolutionsContext;
  if (c.experiment.source === "solid") { const m = lab.mass === null ? null : parseDecimal(lab.mass); return m ? prepareFromSolid(ctx.solute, m, lab.flask) : null; }
  return lab.pipette === null || !ctx.stock ? null : dilute(ctx.stock, lab.pipette, lab.flask);
}
const titrationOf = (c: ChemLabConfigV1) => chemLabContext(c.experiment) as TitrationContext;
const titreFloor = (c: ChemLabConfigV1, f: (s: TitrationSetup) => Q): Q => f(titrationOf(c).setup);
const rateTrial = (c: ChemLabConfigV1, id: string | null) => (id === null ? undefined : (chemLabContext(c.experiment) as RateContext).trials[id]);
const fromDouble = (x: number): Q | null => (Number.isFinite(x) ? fromNumber(x) : null);
export const QUANTITIES: Readonly<Record<ChemLabExperimentKind, readonly QuantitySpec[]>> = Object.freeze({
  solutions: Object.freeze([
    { id: "preparedConcentration", label: "تركيز المحلول الذي حضّرته", dimension: "concentration", needs: none, instrument: zero,
      value: (c: ChemLabConfigV1, s: ChemLabStateV1) => { const r = preparedSolution(c, s.lab); return r && r.ok ? r.concentration : null; } },
    { id: "preparedMoles", label: "كمية المادة المذابة في المحلول الذي حضّرته", dimension: "amount", needs: none, instrument: zero,
      value: (c: ChemLabConfigV1, s: ChemLabStateV1) => { const r = preparedSolution(c, s.lab); return r && r.ok ? r.moles : null; } }
  ] as QuantitySpec[]),
  ph: Object.freeze([
    { id: "pH", label: "الرقم الهيدروجيني pH", dimension: "pH", needs: { ...none, subject: "solution" }, instrument: zero,
      value: (c: ChemLabConfigV1, _s: ChemLabStateV1, t: NumberTask) => phValue(c, t.subject, r => r.pH) },
    { id: "pOH", label: "pOH", dimension: "pH", needs: { ...none, subject: "solution" }, instrument: zero, value: (c: ChemLabConfigV1, _s: ChemLabStateV1, t: NumberTask) => phValue(c, t.subject, r => r.pOH) },
    { id: "hydronium", label: "تركيز أيون الهيدرونيوم [H₃O⁺]", dimension: "concentration", needs: { ...none, subject: "solution" }, instrument: zero,
      value: (c: ChemLabConfigV1, _s: ChemLabStateV1, t: NumberTask) => phValue(c, t.subject, r => r.h3o) },
    { id: "hydroxide", label: "تركيز أيون الهيدروكسيد [OH⁻]", dimension: "concentration", needs: { ...none, subject: "solution" }, instrument: zero,
      value: (c: ChemLabConfigV1, _s: ChemLabStateV1, t: NumberTask) => phValue(c, t.subject, r => r.oh) }
  ] as QuantitySpec[]),
  titration: Object.freeze([
    { id: "equivalenceVolume", label: "حجم المحلول القياسي عند نقطة التكافؤ", dimension: "volume", needs: none,
      instrument: () => ML(parseDecimal(String(ENDPOINT_TOLERANCE_ML)) as Q), value: (c: ChemLabConfigV1) => ML(titrationOf(c).setup.equivalenceML) },
    { id: "titrantMoles", label: "كمية المحلول القياسي المستهلكة حتى نقطة التكافؤ", dimension: "amount", needs: none,
      instrument: (c: ChemLabConfigV1) => titreFloor(c, s => mul(s.cb, ML(parseDecimal(String(ENDPOINT_TOLERANCE_ML)) as Q))),
      value: (c: ChemLabConfigV1) => { const s = titrationOf(c).setup; return mul(s.cb, ML(s.equivalenceML)); } },
    { id: "analyteMoles", label: "كمية المادة المعايَرة في الدورق", dimension: "amount", needs: none,
      instrument: (c: ChemLabConfigV1) => titreFloor(c, s => div(mul(s.analyteMoles, parseDecimal(String(ENDPOINT_TOLERANCE_ML)) as Q), s.equivalenceML)), // n × ΔV / V_eq
      value: (c: ChemLabConfigV1) => titrationOf(c).setup.analyteMoles },
    { id: "analyteConcentration", label: "تركيز المادة المعايَرة", dimension: "concentration", needs: none,
      instrument: (c: ChemLabConfigV1) => titreFloor(c, s => div(mul(s.ca, parseDecimal(String(ENDPOINT_TOLERANCE_ML)) as Q), s.equivalenceML)), // c × ΔV / V_eq
      value: (c: ChemLabConfigV1) => titrationOf(c).setup.ca },
    { id: "buretteReading", label: "قراءة السحاحة (الحجم المضاف)", dimension: "volume", needs: none,
      instrument: () => ML(BURETTE.readingUncertaintyML),
      value: (_c: ChemLabConfigV1, s: ChemLabStateV1) => (s.lab.kind === "titration" ? ML(parseDecimal(s.lab.added) as Q) : null) },
    { id: "initialPh", label: "الرقم الهيدروجيني قبل الإضافة", dimension: "pH", needs: none, instrument: zero,
      value: (c: ChemLabConfigV1) => fromDouble(titrationPh(titrationOf(c).setup, ZERO)) },
    { id: "phAtVolume", label: "الرقم الهيدروجيني بعد إضافة حجم معيّن", dimension: "pH", needs: { ...none, at: "volume" }, instrument: zero,
      value: (c: ChemLabConfigV1, _s: ChemLabStateV1, t: NumberTask) => (t.at === null ? null : fromDouble(titrationPh(titrationOf(c).setup, parseDecimal(t.at) as Q))) },
    { id: "endpointVolume", label: "حجم نقطة النهاية مع الكاشف", dimension: "volume", needs: { ...none, subject: "indicator" },
      instrument: () => ML(parseDecimal(String(ENDPOINT_TOLERANCE_ML)) as Q),
      value: (c: ChemLabConfigV1, _s: ChemLabStateV1, t: NumberTask) => { const ind = indicatorById(t.subject); return ind ? fromDouble(indicatorEndpoint(titrationOf(c).setup, ind).volumeML / 1000) : null; } }
  ] as QuantitySpec[]),
  rate: Object.freeze([
    { id: "rateConstant", label: "ثابت السرعة k", dimension: "byOrder", needs: { ...none, subject: "trial" }, instrument: zero,
      value: (c: ChemLabConfigV1, _s: ChemLabStateV1, t: NumberTask) => { const tr = rateTrial(c, t.subject); return tr ? fromDouble(tr.k) : null; } },
    { id: "halfLife", label: "عمر النصف", dimension: "time", needs: { ...none, subject: "trial" }, instrument: zero,
      value: (c: ChemLabConfigV1, _s: ChemLabStateV1, t: NumberTask) => { const tr = rateTrial(c, t.subject), m = (chemLabContext(c.experiment) as RateContext).model; return tr ? fromDouble(halfLife(m.order, tr.k, tr.a0)) : null; } },
    { id: "initialRate", label: "السرعة الابتدائية", dimension: "rate", needs: { ...none, subject: "trial" }, instrument: zero,
      value: (c: ChemLabConfigV1, _s: ChemLabStateV1, t: NumberTask) => { const tr = rateTrial(c, t.subject), m = (chemLabContext(c.experiment) as RateContext).model; return tr ? fromDouble(initialRate(m.order, tr.k, tr.a0)) : null; } },
    { id: "concentrationAt", label: "تركيز المادة المتفاعلة عند زمن معيّن", dimension: "concentration", needs: { ...none, subject: "trial", at: "time" }, instrument: zero,
      value: (c: ChemLabConfigV1, _s: ChemLabStateV1, t: NumberTask) => { const tr = rateTrial(c, t.subject), m = (chemLabContext(c.experiment) as RateContext).model; return tr && t.at !== null ? fromDouble(concentrationAt(m.order, tr.k, tr.a0, toNumber(parseDecimal(t.at) as Q))) : null; } },
    { id: "rateRatio", label: "نسبة السرعة الابتدائية بين تجربتين", dimension: "ratio", needs: { subject: "trial", other: "trial", at: null }, instrument: zero,
      value: (c: ChemLabConfigV1, _s: ChemLabStateV1, t: NumberTask) => {
        const a = rateTrial(c, t.subject), b = rateTrial(c, t.other), m = (chemLabContext(c.experiment) as RateContext).model;
        return a && b ? fromDouble(initialRate(m.order, a.k, a.a0) / initialRate(m.order, b.k, b.a0)) : null;
      } }
  ] as QuantitySpec[])
});
function phValue(c: ChemLabConfigV1, id: string | null, pick: (r: Extract<PhResult, { ok: true }>) => number): Q | null {
  const r = id === null ? undefined : (chemLabContext(c.experiment) as PhContext).results[id];
  return r && r.ok ? fromDouble(pick(r)) : null;
}
export const quantitySpec = (kind: ChemLabExperimentKind, id: unknown): QuantitySpec | undefined => QUANTITIES[kind].find(q => q.id === id);
/** The dimension of a quantity in this config (rate constants take their unit from the reaction order). */
export const quantityDimension = (c: ChemLabConfigV1, q: QuantitySpec): LabDimension =>
  q.dimension === "byOrder" ? rateConstantDimension((c.experiment as RateExperiment).order) : q.dimension;

// ── choice questions (derived answers; ambiguous / tied derivations are refused at authoring) ──────────────────────────────────────────
export type ChoiceSpec = { id: string; label: string; needs: { subject: "solution" | null; other: "indicator" | null }; mode: "single" | "multiple" | "either";
  options: (c: ChemLabConfigV1, t: Pick<ChoiceTask, "subject" | "other">) => readonly string[];
  /** the correct subset of `offered`, or a refusal (ambiguous / tie / not applicable) */
  correct: (c: ChemLabConfigV1, t: Pick<ChoiceTask, "subject" | "other" | "options">) => { ok: true; correct: string[] } | { ok: false; code: string; message: string } };
const EFFECTS = ["increase", "decrease", "none"] as const;
export const CHOICE_OPTION_LABEL: Readonly<Record<string, string>> = Object.freeze({
  acidic: "حمضي", neutral: "متعادل", basic: "قاعدي", below7: "أقل من 7", equal7: "يساوي 7", above7: "أكبر من 7",
  increase: "تزداد", decrease: "تقل", none: "لا تتغير", acid: "لون الوسط الحمضي", transition: "لون انتقالي (ضمن مدى التغير)", base: "لون الوسط القاعدي",
  moles: "كمية المادة المذابة (عدد المولات)", concentration: "التركيز", volume: "الحجم"
});
const phCtx = (c: ChemLabConfigV1) => chemLabContext(c.experiment) as PhContext;
const ok = (correct: string[]) => ({ ok: true as const, correct });
const refuse = (code: string, message: string) => ({ ok: false as const, code, message });
const extremum = (c: ChemLabConfigV1, offered: readonly string[], dir: 1 | -1) => {
  const ph = (id: string) => { const r = phCtx(c).results[id]; return r && r.ok ? r.pH : NaN; };
  const sorted = [...offered].sort((a, b) => dir * (ph(a) - ph(b)));
  if (sorted.length < 2 || Math.abs(ph(sorted[0]) - ph(sorted[1])) < 0.01) return refuse("LAB_CHOICE_AMBIGUOUS", "قيم pH للمحاليل المعروضة متقاربة جدًا (فرق أقل من 0.01)؛ لا يمكن تحديد إجابة واحدة.");
  return ok([sorted[0]]);
};
const rateCtx = (c: ChemLabConfigV1) => chemLabContext(c.experiment) as RateContext;
export const CHOICES: Readonly<Record<ChemLabExperimentKind, readonly ChoiceSpec[]>> = Object.freeze({
  solutions: Object.freeze([
    { id: "conservedOnDilution", label: "ما الذي يبقى ثابتًا عند التخفيف؟", needs: { subject: null, other: null }, mode: "multiple",
      options: () => ["moles", "concentration", "volume"],
      correct: (c: ChemLabConfigV1, t: Pick<ChoiceTask, "options">) => (c.experiment.kind === "solutions" && c.experiment.source === "stock" ? ok(t.options.filter(o => o === "moles")) : refuse("LAB_CHOICE_NOT_APPLICABLE", "هذا السؤال لتجارب التخفيف من محلول أم فقط.")) }
  ] as ChoiceSpec[]),
  ph: Object.freeze([
    { id: "phClass", label: "صنّف المحلول", needs: { subject: "solution", other: null }, mode: "single", options: () => ["acidic", "neutral", "basic"],
      correct: (c: ChemLabConfigV1, t: Pick<ChoiceTask, "subject" | "options">) => ok(t.options.filter(o => o === phClassOf(phCtx(c).species[t.subject as string]))) },
    { id: "lowestPh", label: "أيّ المحاليل له أقل رقم هيدروجيني؟", needs: { subject: null, other: null }, mode: "single", options: (c: ChemLabConfigV1) => (c.experiment as PhExperiment).solutions.map(s => s.id),
      correct: (c: ChemLabConfigV1, t: Pick<ChoiceTask, "options">) => extremum(c, t.options, 1) },
    { id: "highestPh", label: "أيّ المحاليل له أعلى رقم هيدروجيني؟", needs: { subject: null, other: null }, mode: "single", options: (c: ChemLabConfigV1) => (c.experiment as PhExperiment).solutions.map(s => s.id),
      correct: (c: ChemLabConfigV1, t: Pick<ChoiceTask, "options">) => extremum(c, t.options, -1) },
    { id: "indicatorColour", label: "ما لون الكاشف في المحلول؟", needs: { subject: "solution", other: "indicator" }, mode: "single", options: () => ["acid", "transition", "base"],
      correct: (c: ChemLabConfigV1, t: Pick<ChoiceTask, "subject" | "other" | "options">) => {
        const r = phCtx(c).results[t.subject as string], ind = indicatorById(t.other);
        if (!r || !r.ok || !ind) return refuse("LAB_CHOICE_INVALID", "المحلول أو الكاشف غير معرّف.");
        if (Math.abs(r.pH - ind.low) < 0.05 || Math.abs(r.pH - ind.high) < 0.05) return refuse("LAB_CHOICE_AMBIGUOUS", "pH المحلول قريب جدًا (أقل من 0.05) من حد مدى تغيّر لون الكاشف؛ اللون غير محسوم.");
        return ok(t.options.filter(o => o === indicatorAppearance(ind, r.pH).state));
      } }
  ] as ChoiceSpec[]),
  titration: Object.freeze([
    { id: "suitableIndicators", label: "أيّ الكواشف مناسب لهذه المعايرة (خطأ نقطة النهاية لا يتجاوز 0.10 mL)؟", needs: { subject: null, other: null }, mode: "multiple",
      options: (c: ChemLabConfigV1) => (c.experiment as TitrationExperiment).indicators,
      correct: (c: ChemLabConfigV1, t: Pick<ChoiceTask, "options">) => {
        const s = titrationOf(c).setup, out: string[] = [];
        for (const id of t.options) {
          const v = indicatorSuitability(s, indicatorById(id)!);
          if (v === "ambiguous") return refuse("LAB_CHOICE_AMBIGUOUS", "الكاشف «" + indicatorById(id)!.nameAr + "» يعطي خطأ قريبًا جدًا من حد 0.10 mL؛ لا يُعرض في سؤال مقيَّم.");
          if (v === "suitable") out.push(id);
        }
        return ok(out);
      } },
    { id: "closestIndicator", label: "أيّ الكواشف تقع نقطة نهايته أقرب إلى نقطة التكافؤ؟", needs: { subject: null, other: null }, mode: "single",
      options: (c: ChemLabConfigV1) => (c.experiment as TitrationExperiment).indicators,
      correct: (c: ChemLabConfigV1, t: Pick<ChoiceTask, "options">) => {
        const s = titrationOf(c).setup, err = (id: string) => Math.abs(indicatorEndpoint(s, indicatorById(id)!).errorML);
        const sorted = [...t.options].sort((a, b) => err(a) - err(b));
        if (sorted.length < 2 || err(sorted[1]) - err(sorted[0]) < 0.005) return refuse("LAB_CHOICE_AMBIGUOUS", "نقاط نهاية الكواشف المعروضة متقاربة جدًا (فرق أقل من 0.005 mL).");
        return ok([sorted[0]]);
      } },
    { id: "equivalencePh", label: "عند نقطة التكافؤ يكون الرقم الهيدروجيني:", needs: { subject: null, other: null }, mode: "single", options: () => ["below7", "equal7", "above7"],
      correct: (_c: ChemLabConfigV1, t: Pick<ChoiceTask, "options">) => ok(t.options.filter(o => o === "equal7")) } // strong / strong at 25 °C: 7.00 exactly
  ] as ChoiceSpec[]),
  rate: Object.freeze([
    { id: "fastestTrial", label: "في أيّ تجربة تكون السرعة الابتدائية أكبر؟", needs: { subject: null, other: null }, mode: "single",
      options: (c: ChemLabConfigV1) => (c.experiment as RateExperiment).trials.map(t => t.id),
      correct: (c: ChemLabConfigV1, t: Pick<ChoiceTask, "options">) => {
        const ctx = rateCtx(c), r = (id: string) => initialRate(ctx.model.order, ctx.trials[id].k, ctx.trials[id].a0);
        const sorted = [...t.options].sort((a, b) => r(b) - r(a));
        if (sorted.length < 2 || (r(sorted[0]) - r(sorted[1])) / r(sorted[0]) < 0.01) return refuse("LAB_CHOICE_AMBIGUOUS", "السرعتان الابتدائيتان الأكبر متقاربتان (فرق أقل من 1%).");
        return ok([sorted[0]]);
      } },
    { id: "temperatureEffect", label: "عند رفع درجة الحرارة فإن سرعة التفاعل:", needs: { subject: null, other: null }, mode: "single", options: () => [...EFFECTS],
      correct: (_c: ChemLabConfigV1, t: Pick<ChoiceTask, "options">) => ok(t.options.filter(o => o === "increase")) }, // Ea > 0 (≥ 10 kJ/mol)
    { id: "concentrationEffect", label: "عند زيادة التركيز الابتدائي فإن السرعة الابتدائية:", needs: { subject: null, other: null }, mode: "single", options: () => [...EFFECTS],
      correct: (c: ChemLabConfigV1, t: Pick<ChoiceTask, "options">) => ok(t.options.filter(o => o === ((c.experiment as RateExperiment).order === 0 ? "none" : "increase"))) },
    { id: "catalystEffect", label: "إضافة الحافز تجعل سرعة التفاعل:", needs: { subject: null, other: null }, mode: "single", options: () => [...EFFECTS],
      correct: (c: ChemLabConfigV1, t: Pick<ChoiceTask, "options">) => ((c.experiment as RateExperiment).catalystDrop === null ? refuse("LAB_CHOICE_NOT_APPLICABLE", "لم يُعرَّف حافز في هذا النموذج.") : ok(t.options.filter(o => o === "increase"))) }
  ] as ChoiceSpec[])
});
export const choiceSpec = (kind: ChemLabExperimentKind, id: unknown): ChoiceSpec | undefined => CHOICES[kind].find(q => q.id === id);

// ── observation requirements (completion tasks) ─────────────────────────────────────────────────────────────────────────────────────────
export type ObserveSpec = { id: string; label: string; needs: { subject: "indicator" | null; count: boolean }; readouts: boolean;
  met: (c: ChemLabConfigV1, s: ChemLabStateV1, t: ObserveTask) => boolean };
export const OBSERVATIONS: Readonly<Record<ChemLabExperimentKind, readonly ObserveSpec[]>> = Object.freeze({
  solutions: Object.freeze([
    { id: "distinctFlasks", label: "سجّل محاليل محضّرة في عدد من الدوارق المختلفة", needs: { subject: null, count: true }, readouts: false,
      met: (_c: ChemLabConfigV1, s: ChemLabStateV1, t: ObserveTask) => new Set(s.observations.filter(o => o.kind === "solution").map(o => (o as { flask: number }).flask)).size >= (t.count ?? 1) }
  ] as ObserveSpec[]),
  ph: Object.freeze([
    { id: "meterAll", label: "قِس pH كل المحاليل بجهاز قياس pH", needs: { subject: null, count: false }, readouts: true,
      met: (c: ChemLabConfigV1, s: ChemLabStateV1) => (c.experiment as PhExperiment).solutions.every(x => s.observations.some(o => o.kind === "meter" && o.solution === x.id)) },
    { id: "indicatorAll", label: "اختبر كل المحاليل بالكاشف", needs: { subject: "indicator", count: false }, readouts: false,
      met: (c: ChemLabConfigV1, s: ChemLabStateV1, t: ObserveTask) => (c.experiment as PhExperiment).solutions.every(x => s.observations.some(o => o.kind === "indicator" && o.solution === x.id && o.indicator === t.subject)) }
  ] as ObserveSpec[]),
  titration: Object.freeze([
    { id: "readings", label: "سجّل عددًا من قراءات السحاحة", needs: { subject: null, count: true }, readouts: false,
      met: (_c: ChemLabConfigV1, s: ChemLabStateV1, t: ObserveTask) => new Set(s.observations.filter(o => o.kind === "reading").map(o => (o as { added: string }).added)).size >= (t.count ?? 1) },
    { id: "bracketEquivalence", label: "سجّل قراءة قبل نقطة التكافؤ وأخرى بعدها (ضمن 1.00 mL من كل جهة)", needs: { subject: null, count: false }, readouts: false,
      met: (c: ChemLabConfigV1, s: ChemLabStateV1) => {
        const veq = titrationOf(c).setup.equivalenceML, vs = s.observations.filter(o => o.kind === "reading").map(o => parseDecimal((o as { added: string }).added) as Q);
        const within = (v: Q) => cmp(sub(v, veq), qi(1)) <= 0 && cmp(sub(veq, v), qi(1)) <= 0;
        return vs.some(v => cmp(v, veq) < 0 && within(v)) && vs.some(v => cmp(v, veq) > 0 && within(v));
      } }
  ] as ObserveSpec[]),
  rate: Object.freeze([
    { id: "runAll", label: "شغّل كل التجارب", needs: { subject: null, count: false }, readouts: false,
      met: (c: ChemLabConfigV1, s: ChemLabStateV1) => (c.experiment as RateExperiment).trials.every(tr => s.observations.some(o => o.kind === "run" && o.trial === tr.id)) }
  ] as ObserveSpec[])
});
export const observeSpec = (kind: ChemLabExperimentKind, id: unknown): ObserveSpec | undefined => OBSERVATIONS[kind].find(o => o.id === id);

/** A prepare task is met when the student's made-up solution IS the target within one balance division (solid) or with the exact aliquot (stock). */
export function preparedMeetsTarget(c: ChemLabConfigV1, s: ChemLabStateV1, t: PrepareTask): boolean {
  if (c.experiment.kind !== "solutions" || s.lab.kind !== "solutions" || !s.lab.madeUp || s.lab.flask !== t.volume) return false;
  const ctx = chemLabContext(c.experiment) as SolutionsContext, target = authoredDecimal(t.concentration) as Q;
  if (c.experiment.source === "solid") {
    const m = s.lab.mass === null ? null : parseDecimal(s.lab.mass);
    if (!m) return false;
    const need = requiredMass(ctx.solute, target, t.volume).exact;
    return cmp(sub(m, need), parseDecimal("0.01") as Q) <= 0 && cmp(sub(need, m), parseDecimal("0.01") as Q) <= 0;
  }
  return s.lab.pipette !== null && ctx.stock !== null && cmp(requiredAliquot(ctx.stock, target, t.volume), qi(s.lab.pipette)) === 0;
}

// ── validation ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Add = (code: string, message: string, path: string) => void;
const P = "smartSim.config";
export function validateChemLabConfig(raw: unknown): ChemLabConfigResult {
  const issues: ChemLabIssue[] = [];
  const add: Add = (code, message, path) => { issues.push({ code, message, path }); };
  if (!isPlainObject(raw)) return { ok: false, issues: [{ code: "LAB_CONFIG_INVALID", message: "إعداد المختبر الكيميائي مفقود أو غير صالح.", path: P }] };
  for (const k of Object.keys(raw)) if (!["v", "experiment", "view", "tasks"].includes(k)) add("LAB_CONFIG_UNKNOWN_KEY", "حقل غير مسموح في إعداد المختبر: " + k, P + "." + k);
  if (raw.v !== 1) add("LAB_CONFIG_VERSION_UNSUPPORTED", "إصدار إعداد المختبر غير مدعوم.", P + ".v");
  const experiment = validateExperiment(raw.experiment, add);
  const view = isPlainObject(raw.view) && exactKeys(raw.view, ["readouts", "graph"]) && typeof raw.view.readouts === "boolean" && typeof raw.view.graph === "boolean"
    ? { readouts: raw.view.readouts, graph: raw.view.graph } : null;
  if (!view) add("LAB_VIEW_INVALID", "إعداد العرض: readouts و graph قيم منطقية فقط.", P + ".view");
  if (issues.length || !experiment || !view) return { ok: false, issues };
  if (experiment.kind === "titration" && view.graph && !view.readouts) { add("LAB_VIEW_INVALID", "منحنى المعايرة يُبنى من قراءات جهاز pH؛ فعّل القراءات الرقمية أو أخفِ المنحنى.", P + ".view"); return { ok: false, issues }; }
  const shell: ChemLabConfigV1 = { v: 1, experiment, view, tasks: [] };
  const tasks = validateTasks(raw.tasks, shell, add);
  if (issues.length || !tasks) return { ok: false, issues };
  return { ok: true, config: { v: 1, experiment, view, tasks } };
}
function validateExperiment(raw: unknown, add: Add): ChemLabExperiment | null {
  const path = P + ".experiment", L = CHEM_LAB_LIMITS;
  if (!isPlainObject(raw) || typeof raw.kind !== "string" || !(CHEM_LAB_EXPERIMENTS as readonly string[]).includes(raw.kind)) { add("LAB_EXPERIMENT_UNKNOWN", "نوع التجربة غير مدعوم (المحاليل، pH، المعايرة، سرعة التفاعل).", path); return null; }
  let e: ChemLabExperiment | null = null;
  const shape = (keys: string[]) => exactKeys(raw, keys) || (add("LAB_EXPERIMENT_INVALID", "حقول التجربة غير مطابقة لنوعها (" + keys.join("، ") + ").", path), false);
  if (raw.kind === "solutions") {
    if (!shape(["kind", "solute", "source", "stock", "flasks", "pipettes"])) return null;
    const flasks = Array.isArray(raw.flasks) && raw.flasks.every(v => LAB_FLASKS_ML.includes(v as number)) && new Set(raw.flasks).size === raw.flasks.length && raw.flasks.length > 0 ? [...(raw.flasks as number[])].sort((a, b) => a - b) : null;
    const pipettes = Array.isArray(raw.pipettes) && raw.pipettes.every(v => LAB_PIPETTES_ML.includes(v as number)) && new Set(raw.pipettes).size === raw.pipettes.length ? [...(raw.pipettes as number[])].sort((a, b) => a - b) : null;
    if (raw.source !== "solid" && raw.source !== "stock") { add("LAB_EXPERIMENT_INVALID", "مصدر المادة: صلب يوزن أو محلول أم يخفَّف.", path + ".source"); return null; }
    if (!flasks || !pipettes) { add("LAB_GLASSWARE_INVALID", "الدوارق والماصّات من الفهرس فقط، بلا تكرار، ودورق واحد على الأقل.", path); return null; }
    if (raw.source === "solid" && (raw.stock !== null || pipettes.length)) { add("LAB_EXPERIMENT_INVALID", "التحضير من مادة صلبة لا يستخدم محلولًا أم ولا ماصّات.", path); return null; }
    if (raw.source === "stock" && (typeof raw.stock !== "string" || !pipettes.length || !pipettes.some(p => flasks.some(f => p < f)))) { add("LAB_EXPERIMENT_INVALID", "التخفيف يحتاج تركيز المحلول الأم وماصّة أصغر من أحد الدوارق.", path); return null; }
    e = { kind: "solutions", solute: raw.solute as string, source: raw.source, stock: raw.source === "stock" ? raw.stock as string : null, flasks, pipettes };
  } else if (raw.kind === "ph") {
    if (!shape(["kind", "solutions", "indicators"])) return null;
    const seen = new Set<string>(), sols: PhSolution[] = [];
    if (!Array.isArray(raw.solutions) || raw.solutions.length < 1 || raw.solutions.length > L.solutions) { add("LAB_PH_SOLUTIONS_INVALID", "عدد المحاليل من 1 إلى " + L.solutions + ".", path + ".solutions"); return null; }
    for (const [i, s] of raw.solutions.entries()) {
      if (!isPlainObject(s) || !exactKeys(s, ["id", "label", "species", "concentration"]) || !isSemanticId(s.id) || seen.has(s.id as string) || !isLabel(s.label, L.shortLabelChars) || typeof s.species !== "string" || typeof s.concentration !== "string") {
        add("LAB_PH_SOLUTIONS_INVALID", "المحلول رقم " + (i + 1) + " غير صالح (معرّف فريد، اسم حتى " + L.shortLabelChars + " حرفًا، مادة، تركيز).", path + ".solutions[" + i + "]"); return null;
      }
      seen.add(s.id as string); sols.push({ id: s.id as string, label: s.label as string, species: s.species, concentration: s.concentration });
    }
    const inds = uniqueStrings(raw.indicators, x => !!indicatorById(x), L.indicators);
    if (!inds) { add("LAB_INDICATORS_INVALID", "الكواشف من الفهرس فقط، بلا تكرار، حتى " + L.indicators + ".", path + ".indicators"); return null; }
    e = { kind: "ph", solutions: sols, indicators: inds };
  } else if (raw.kind === "titration") {
    if (!shape(["kind", "analyte", "titrant", "indicators"])) return null;
    const a = raw.analyte, t = raw.titrant;
    if (!isPlainObject(a) || !exactKeys(a, ["species", "volume", "concentration", "equivalence"]) || typeof a.species !== "string" || typeof a.volume !== "string"
      || !((typeof a.concentration === "string" && a.equivalence === null) || (a.concentration === null && typeof a.equivalence === "string"))
      || !isPlainObject(t) || !exactKeys(t, ["species", "concentration"]) || typeof t.species !== "string" || typeof t.concentration !== "string") {
      add("LAB_TITRATION_INVALID", "المادة المعايَرة {species, volume, concentration أو equivalence (واحد فقط)} والمحلول القياسي {species, concentration}.", path); return null;
    }
    const inds = uniqueStrings(raw.indicators, x => !!indicatorById(x), L.indicators);
    if (!inds || inds.length < 1) { add("LAB_INDICATORS_INVALID", "اختر كاشفًا واحدًا على الأقل من الفهرس (حتى " + L.indicators + ").", path + ".indicators"); return null; }
    e = { kind: "titration", analyte: { species: a.species, volume: a.volume, concentration: a.concentration as string | null, equivalence: a.equivalence as string | null }, titrant: { species: t.species, concentration: t.concentration }, indicators: inds };
  } else {
    if (!shape(["kind", "order", "k25", "ea", "catalystDrop", "duration", "trials"])) return null;
    const K = KINETICS_LIMITS;
    if (!K.orders.includes(raw.order as number) || typeof raw.k25 !== "string" || typeof raw.ea !== "string" || !(raw.catalystDrop === null || typeof raw.catalystDrop === "string")
      || !Number.isInteger(raw.duration) || (raw.duration as number) < K.durationMinS || (raw.duration as number) > K.durationMaxS) {
      add("LAB_RATE_INVALID", "نموذج السرعة: الرتبة 0 أو 1 أو 2، وk عند 25 °C، وEa، وخفض الحافز (أو null)، ومدة المشاهدة عدد صحيح بين " + K.durationMinS + " و" + K.durationMaxS + " ث.", path); return null;
    }
    const seen = new Set<string>(), trials: RateTrial[] = [];
    if (!Array.isArray(raw.trials) || raw.trials.length < 1 || raw.trials.length > L.trials) { add("LAB_RATE_TRIAL_INVALID", "عدد التجارب من 1 إلى " + L.trials + ".", path + ".trials"); return null; }
    for (const [i, tr] of raw.trials.entries()) {
      if (!isPlainObject(tr) || !exactKeys(tr, ["id", "label", "temperature", "concentration", "catalyst"]) || !isSemanticId(tr.id) || seen.has(tr.id as string) || !isLabel(tr.label, L.shortLabelChars)
        || typeof tr.temperature !== "string" || typeof tr.concentration !== "string" || typeof tr.catalyst !== "boolean") {
        add("LAB_RATE_TRIAL_INVALID", "التجربة رقم " + (i + 1) + " غير صالحة.", path + ".trials[" + i + "]"); return null;
      }
      seen.add(tr.id as string); trials.push({ id: tr.id as string, label: tr.label as string, temperature: tr.temperature, concentration: tr.concentration, catalyst: tr.catalyst });
    }
    e = { kind: "rate", order: raw.order as RateOrder, k25: raw.k25, ea: raw.ea, catalystDrop: raw.catalystDrop as string | null, duration: raw.duration as number, trials };
  }
  // every authored decimal is canonical (AUTHORED_DECIMAL; k at 25 °C may use e-notation)
  const decimals: [unknown, string][] = e.kind === "solutions" ? [[e.stock ?? "1", "stock"]]
    : e.kind === "ph" ? e.solutions.map(s => [s.concentration, "solutions." + s.id])
    : e.kind === "titration" ? [[e.analyte.volume, "analyte.volume"], [e.analyte.concentration ?? e.analyte.equivalence, "analyte"], [e.titrant.concentration, "titrant.concentration"]]
    : [[e.ea, "ea"], [e.catalystDrop ?? "1", "catalystDrop"], ...e.trials.flatMap(t => [[t.temperature, "trials." + t.id + ".temperature"], [t.concentration, "trials." + t.id + ".concentration"]] as [unknown, string][])];
  for (const [v, where] of decimals) if (!authoredDecimal(v)) { add("LAB_DECIMAL_INVALID", "قيمة غير صالحة في " + where + ": أرقام عشرية موجبة فقط (مثل 0.100)، بلا أسس أو إشارات.", path + "." + where); return null; }
  if (e.kind === "rate" && (!parseDecimal(e.k25) || sign(parseDecimal(e.k25) as Q) <= 0 || e.k25.startsWith("-"))) { add("LAB_DECIMAL_INVALID", "ثابت السرعة عند 25 °C عدد موجب (يُسمح بالصيغة العلمية مثل 2.0e-3).", path + ".k25"); return null; }
  const built = buildContext(e);
  if (!built.ok) { add(built.code, built.message, path); return null; }
  CONTEXTS.set(e, built.context);
  return e;
}
/** The experiment part alone, validated (authoring: option lists and derived data while the tasks are still being written). */
export function validateChemLabExperiment(raw: unknown): { ok: true; experiment: ChemLabExperiment } | { ok: false; issues: ChemLabIssue[] } {
  const issues: ChemLabIssue[] = [], e = validateExperiment(raw, (code, message, path) => { issues.push({ code, message, path }); });
  return e && !issues.length ? { ok: true, experiment: e } : { ok: false, issues };
}
function validateTasks(raw: unknown, c: ChemLabConfigV1, add: Add): ChemLabTask[] | null {
  const path = P + ".tasks", L = CHEM_LAB_LIMITS, kind = c.experiment.kind;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > L.tasks) { add("LAB_TASKS_INVALID", "عدد المهام من 1 إلى " + L.tasks + ".", path); return null; }
  const out: ChemLabTask[] = [], seen = new Set<string>();
  const subjectOk = (need: string | null, v: unknown): v is string | null => {
    if (need === null) return v === null;
    if (typeof v !== "string") return false;
    if (need === "solution") return c.experiment.kind === "ph" && c.experiment.solutions.some(s => s.id === v);
    if (need === "indicator") return (c.experiment.kind === "ph" || c.experiment.kind === "titration") && c.experiment.indicators.includes(v);
    if (need === "trial") return c.experiment.kind === "rate" && c.experiment.trials.some(t => t.id === v);
    return false;
  };
  for (const [i, t] of raw.entries()) {
    const where = path + "[" + i + "]";
    const fail = (code: string, message: string) => { add(code, "المهمة رقم " + (i + 1) + ": " + message, where); };
    if (!isPlainObject(t) || !isSemanticId(t.id) || !isLabel(t.label, L.labelChars) || typeof t.kind !== "string") { fail("LAB_TASK_INVALID", "معرّف ووصف (حتى " + L.labelChars + " حرفًا) ونوع."); continue; }
    if (seen.has(t.id as string)) { fail("LAB_TASK_ID_DUPLICATE", "معرّف مكرر: " + t.id); continue; }
    seen.add(t.id as string);
    const id = t.id as string, label = t.label as string;
    if (t.kind === "number") {
      if (!exactKeys(t, ["id", "label", "kind", "quantity", "subject", "other", "at", "unit", "precision"])) { fail("LAB_TASK_INVALID", "حقول المهمة العددية غير مطابقة."); continue; }
      const q = quantitySpec(kind, t.quantity);
      if (!q) { fail("LAB_QUANTITY_UNKNOWN", "الكمية غير معروفة لهذه التجربة."); continue; }
      if (!subjectOk(q.needs.subject, t.subject) || !(q.needs.other === null ? t.other === null : typeof t.other === "string" && t.other !== t.subject && subjectOk(q.needs.other, t.other))) { fail("LAB_TASK_SUBJECT_INVALID", "الكمية «" + q.label + "» تحتاج مرجعًا صالحًا (محلولًا أو كاشفًا أو تجربة من هذا الإعداد)."); continue; }
      const dim = quantityDimension(c, q), unit = isLabDimension(dim) ? labUnit(dim, t.unit) : undefined, precision = validatePrecision(t.precision);
      if (!unit) { fail("LAB_TASK_UNIT_INVALID", "الوحدة يجب أن تكون من: " + LAB_UNITS[dim].map(u => u.id).join("، ") + "."); continue; }
      if (!precision) { fail("LAB_TASK_PRECISION_INVALID", "دقة الإجابة: منازل عشرية (0–6) أو أرقام معنوية (1–6)."); continue; }
      let at: string | null = null;
      if (q.needs.at === null ? t.at !== null : typeof t.at !== "string") { fail("LAB_TASK_AT_INVALID", "حقل «عند» مطلوب لهذه الكمية فقط."); continue; }
      if (q.needs.at === "volume") {
        const v = authoredDecimal(t.at);
        if (!v || (sign(v) !== 0 && !isBuretteStep(v))) { fail("LAB_TASK_AT_INVALID", "الحجم مضاعف للقطرة (0.05 mL) بين 0 و" + BURETTE.capacityML + " mL."); continue; }
        at = t.at as string;
      } else if (q.needs.at === "time") {
        const v = authoredDecimal(t.at), dur = (c.experiment as RateExperiment).duration;
        if (!v || toNumber(v) > dur) { fail("LAB_TASK_AT_INVALID", "الزمن بين 0 و" + dur + " ث."); continue; }
        at = t.at as string;
      }
      const task: NumberTask = { id, label, kind: "number", quantity: q.id, subject: t.subject as string | null, other: t.other as string | null, at, unit: unit.id, precision };
      // a quantity of the authored experiment must exist (state-dependent ones are checked at grading)
      if (q.id !== "preparedConcentration" && q.id !== "preparedMoles" && q.id !== "buretteReading" && !q.value({ ...c, tasks: [] }, emptyStateFor(c), task)) { fail("LAB_QUANTITY_UNDEFINED", "الكمية «" + q.label + "» غير معرّفة بالقيم الحالية."); continue; }
      out.push(task);
    } else if (t.kind === "choice") {
      if (!exactKeys(t, ["id", "label", "kind", "question", "subject", "other", "mode", "options"])) { fail("LAB_TASK_INVALID", "حقول مهمة الاختيار غير مطابقة."); continue; }
      const q = choiceSpec(kind, t.question);
      if (!q) { fail("LAB_CHOICE_UNKNOWN", "السؤال غير معروف لهذه التجربة."); continue; }
      if (!subjectOk(q.needs.subject, t.subject) || !subjectOk(q.needs.other, t.other)) { fail("LAB_TASK_SUBJECT_INVALID", "السؤال يحتاج مرجعًا صالحًا من هذا الإعداد."); continue; }
      if (t.mode !== "single" && t.mode !== "multiple" || (q.mode !== "either" && t.mode !== q.mode)) { fail("LAB_CHOICE_MODE_INVALID", "نمط الاختيار لهذا السؤال: " + (q.mode === "single" ? "اختيار واحد" : "اختيار متعدد") + "."); continue; }
      const offered = q.options(c, { subject: t.subject as string | null, other: t.other as string | null });
      const options = uniqueStrings(t.options, o => offered.includes(o), L.options);
      if (!options || options.length < 2) { fail("LAB_CHOICE_OPTIONS_INVALID", "خياران على الأقل من: " + offered.join("، ") + "، بلا تكرار."); continue; }
      const r = q.correct(c, { subject: t.subject as string | null, other: t.other as string | null, options });
      if (!r.ok) { fail(r.code, r.message); continue; }
      if (t.mode === "single" ? r.correct.length !== 1 : r.correct.length < 1) { fail("LAB_CHOICE_NO_ANSWER", t.mode === "single" ? "الخيارات المعروضة يجب أن تتضمن الإجابة الصحيحة الوحيدة." : "يجب أن يكون خيار واحد على الأقل صحيحًا."); continue; }
      out.push({ id, label, kind: "choice", question: q.id, subject: t.subject as string | null, other: t.other as string | null, mode: t.mode, options });
    } else if (t.kind === "prepare") {
      if (!exactKeys(t, ["id", "label", "kind", "concentration", "volume"]) || c.experiment.kind !== "solutions") { fail("LAB_TASK_INVALID", "مهمة التحضير لتجربة المحاليل فقط {concentration, volume}."); continue; }
      const target = authoredDecimal(t.concentration), ctx = chemLabContext(c.experiment) as SolutionsContext;
      if (!target || sign(target) <= 0 || !c.experiment.flasks.includes(t.volume as number) || cmp(target, ctx.solute.maxConcentration) > 0) { fail("LAB_PREPARE_INVALID", "التركيز المطلوب موجب ضمن حد المادة، والحجم أحد الدوارق المتاحة."); continue; }
      if (c.experiment.source === "solid") {
        const need = requiredMass(ctx.solute, target, t.volume as number).exact;
        if (cmp(need, parseDecimal("0.05") as Q) < 0 || (ctx.maxMass && cmp(need, ctx.maxMass) > 0)) { fail("LAB_PREPARE_UNREACHABLE", "الكتلة اللازمة (" + toNumber(need).toFixed(3) + " g) خارج مدى الميزان (0.05 g على الأقل)."); continue; }
      } else {
        const v1 = requiredAliquot(ctx.stock as Q, target, t.volume as number);
        if (!(v1.d === 1n && c.experiment.pipettes.includes(Number(v1.n)) && Number(v1.n) < (t.volume as number))) { fail("LAB_PREPARE_UNREACHABLE", "الحجم اللازم من المحلول الأم (" + toNumber(v1).toFixed(2) + " mL) ليس ماصّة متاحة."); continue; }
      }
      out.push({ id, label, kind: "prepare", concentration: t.concentration as string, volume: t.volume as number });
    } else if (t.kind === "observe") {
      if (!exactKeys(t, ["id", "label", "kind", "requirement", "subject", "count"])) { fail("LAB_TASK_INVALID", "حقول مهمة الملاحظة غير مطابقة."); continue; }
      const o = observeSpec(kind, t.requirement);
      if (!o) { fail("LAB_OBSERVE_UNKNOWN", "متطلب الملاحظة غير معروف لهذه التجربة."); continue; }
      if (!subjectOk(o.needs.subject, t.subject)) { fail("LAB_TASK_SUBJECT_INVALID", "المتطلب يحتاج كاشفًا من هذا الإعداد."); continue; }
      if (o.needs.count ? !(Number.isInteger(t.count) && (t.count as number) >= 1 && (t.count as number) <= L.observeCountMax) : t.count !== null) { fail("LAB_OBSERVE_COUNT_INVALID", "العدد مطلوب لهذا المتطلب فقط (1–" + L.observeCountMax + ")."); continue; }
      if (o.readouts && !c.view.readouts) { fail("LAB_OBSERVE_NEEDS_READOUTS", "هذا المتطلب يحتاج القراءات الرقمية (جهاز قياس pH)."); continue; }
      out.push({ id, label, kind: "observe", requirement: o.id, subject: t.subject as string | null, count: t.count as number | null });
    } else fail("LAB_TASK_INVALID", "نوع المهمة غير معروف (number، choice، prepare، observe).");
  }
  return out.length === raw.length ? out : null;
}
/** The empty replayed state of an experiment (the initial state of every attempt). */
export function emptyStateFor(c: Pick<ChemLabConfigV1, "experiment">): ChemLabStateV1 {
  const lab: ChemLabExperimentState = c.experiment.kind === "solutions" ? { kind: "solutions", flask: null, mass: null, pipette: null, madeUp: false }
    : c.experiment.kind === "titration" ? { kind: "titration", indicator: null, added: "0.00" } : c.experiment.kind === "ph" ? { kind: "ph" } : { kind: "rate" };
  return { v: 1, lab, observations: [], answers: {} };
}
export const chemLabTaskById = (c: ChemLabConfigV1, id: unknown): ChemLabTask | undefined => c.tasks.find(t => t.id === id);
