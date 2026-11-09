// Phase 21K — the VIRTUAL CHEMISTRY LAB (chemistryLab@1) through the AI Full Exam Composer. Same rule as 20F / 21J: the model never writes
// the plugin config or a check. It fills a bounded `lab` spec that NAMES catalog entries (an experiment kind, solutes, acid / base species,
// indicators, quantity / question / requirement ids) and gives the experiment's PUBLIC data (concentrations, volumes, trials) as canonical
// decimals. Code builds the ids, the units, the reporting precision, the choice options and modes, the glassware and the private checks
// (task references only — chemistryLab@1 derives every expected answer at grading time). The production validator validateChemLabConfig
// then decides (it already refuses ambiguous questions, unreachable preparations and quantities that do not exist for the authored data),
// and composerSim.buildSimFromSpec runs the SmartSim validators and the no-free-credit gate.
//
// One rule code adds: a titration that asks for the analyte's concentration must use an UNKNOWN analyte (the public datum is then the
// observable equivalence volume); with a known analyte the answer would be printed in the student's own configuration.
import {
  CHEM_LAB_EXPERIMENTS, CHEM_LAB_LIMITS, CHOICES, OBSERVATIONS, QUANTITIES, choiceSpec, observeSpec, quantitySpec, validateChemLabConfig,
  type ChemLabConfigV1, type ChemLabExperiment, type ChemLabExperimentKind, type ChemLabTask
} from "../chemistryLabModel";
import { LAB_FLASKS_ML, LAB_PIPETTES_ML, LAB_SOLUTES } from "../chemistry/lab/solutions";
import { ACID_BASE_SPECIES, INDICATORS } from "../chemistry/lab/acidBase";
import { KINETICS_LIMITS, rateConstantDimension, type RateOrder } from "../chemistry/lab/kinetics";
import { TITRATION_LIMITS } from "../chemistry/lab/titration";
import { toNumber } from "../chemistry/lab/exact";
import { LAB_UNITS, labUnit, type LabDimension } from "../chemistry/lab/units";
import { SMART_SIM_LIMITS } from "../trustedSimRegistry";
import type { ComposerIssue } from "./composerLimits";
import { cleanText, hasExactKeys, isArr, isEnum, isInt, sArr, sBool, sEnum, sInt, sNull, sObj, sStr, type JsonSchema } from "./composerSchemaKit";

type SimCheck = { id: string; label: string; weight: number; kind: string } & Record<string, unknown>;
type R<T> = { ok: true; value: T } | { ok: false; issues: ComposerIssue[] };
const fail = <T>(code: string, message: string, path?: string): R<T> => ({ ok: false, issues: [{ code, message, ...(path ? { path } : {}) }] });
const L = CHEM_LAB_LIMITS;

export const COMPOSER_LAB_EXPERIMENTS = CHEM_LAB_EXPERIMENTS;
export const COMPOSER_LAB_TASK_KINDS = Object.freeze(["number", "choice", "prepare", "observe"] as const);
type TaskKind = (typeof COMPOSER_LAB_TASK_KINDS)[number];
const SOURCES = Object.freeze(["solid", "stock"] as const);
/** Solution ids (pH experiment) and trial ids (rate experiment) are assigned by code, in the model's order. */
export const labSolutionId = (i: number) => "s" + (i + 1);
export const labTrialId = (i: number) => "t" + (i + 1);

/** The `lab` spec: small vocabularies as enums; catalogs (species, solutes, indicators, item ids) as strings checked by code — the patch schema
 *  embeds the simulator spec several times and strict mode allows 1000 enum values in total (21J). */
export function buildLabSpecSchema(): JsonSchema {
  return sObj({
    experiment: sEnum(CHEM_LAB_EXPERIMENTS),
    solute: sNull(sStr()), source: sNull(sEnum(SOURCES)), stock: sNull(sStr()),
    solutions: sArr(sObj({ label: sStr(), species: sStr(), concentration: sStr() }), L.solutions),
    indicators: sArr(sStr(), L.indicators),
    analyte: sNull(sObj({ species: sStr(), volume: sStr(), concentration: sNull(sStr()), equivalence: sNull(sStr()) })),
    titrant: sNull(sObj({ species: sStr(), concentration: sStr() })),
    order: sNull(sInt(0, 2)), k25: sNull(sStr()), ea: sNull(sStr()), catalystDrop: sNull(sStr()), duration: sNull(sInt(KINETICS_LIMITS.durationMinS, KINETICS_LIMITS.durationMaxS)),
    trials: sArr(sObj({ label: sStr(), temperature: sStr(), concentration: sStr(), catalyst: sBool() }), L.trials),
    readouts: sBool(), graph: sBool(),
    tasks: sArr(sObj({
      kind: sEnum(COMPOSER_LAB_TASK_KINDS), item: sStr(), label: sStr(), subject: sNull(sStr()), other: sNull(sStr()), at: sNull(sStr()), unit: sNull(sStr()),
      concentration: sNull(sStr()), volume: sNull(sInt(1, 1000)), count: sNull(sInt(1, L.observeCountMax))
    }), L.tasks)
  });
}
const SPEC_KEYS = ["experiment", "solute", "source", "stock", "solutions", "indicators", "analyte", "titrant", "order", "k25", "ea", "catalystDrop", "duration", "trials", "readouts", "graph", "tasks"];
const TASK_KEYS = ["kind", "item", "label", "subject", "other", "at", "unit", "concentration", "volume", "count"];

const DEFAULT_UNIT: Readonly<Partial<Record<LabDimension, string>>> = Object.freeze({ volume: "mL", amount: "mol", concentration: "mol/L", time: "s", pH: "pH", ratio: "1", rate: "mol/(L·s)" });
const CHECK_KIND: Readonly<Record<TaskKind, string>> = Object.freeze({ number: "lab.number", choice: "lab.choice", prepare: "lab.prepared", observe: "lab.observed" });
const CHECK_WEIGHT: Readonly<Record<TaskKind, number>> = Object.freeze({ number: 2, choice: 1, prepare: 2, observe: 1 });
const str = (v: unknown, max: number) => (typeof v === "string" ? cleanText(v).slice(0, max) : "");

/** Build the lab experiment (public data) from the spec; fields of the other experiments must be empty (never a silent drop). */
function buildExperiment(p: Record<string, unknown>, kind: ChemLabExperimentKind): { ok: true; experiment: ChemLabExperiment } | { ok: false; message: string } {
  const empty = {
    solutions: p.solute === null && p.source === null && p.stock === null,
    ph: !(p.solutions as unknown[]).length,
    titration: p.analyte === null && p.titrant === null,
    rate: p.order === null && p.k25 === null && p.ea === null && p.catalystDrop === null && p.duration === null && !(p.trials as unknown[]).length
  };
  const foreign = (Object.keys(empty) as ChemLabExperimentKind[]).filter(k => k !== kind && !empty[k]);
  if (foreign.length) return { ok: false, message: "حقول تجربة أخرى (" + foreign.join("، ") + ") يجب أن تكون فارغة في تجربة «" + kind + "»." };
  if ((p.indicators as unknown[]).length && kind !== "ph" && kind !== "titration") return { ok: false, message: "الكواشف تخص تجربتي pH والمعايرة فقط." };
  if (kind === "solutions") {
    if (!isEnum(p.source, SOURCES)) return { ok: false, message: "حدّد مصدر المادة: solid (صلب يوزن) أو stock (محلول أم يخفَّف)." };
    // glassware is code-owned: every flask; the pipettes only for a dilution
    return { ok: true, experiment: { kind: "solutions", solute: str(p.solute, 40), source: p.source, stock: p.source === "stock" ? (p.stock as string | null) : null, flasks: [...LAB_FLASKS_ML], pipettes: p.source === "stock" ? [...LAB_PIPETTES_ML] : [] } as ChemLabExperiment };
  }
  if (kind === "ph") {
    const sols = (p.solutions as Record<string, unknown>[]).map((s, i) => ({ id: labSolutionId(i), label: str(s.label, L.shortLabelChars) || "المحلول " + (i + 1), species: s.species as string, concentration: s.concentration as string }));
    return { ok: true, experiment: { kind: "ph", solutions: sols, indicators: [...(p.indicators as string[])] } };
  }
  if (kind === "titration") {
    const a = p.analyte as Record<string, unknown> | null, t = p.titrant as Record<string, unknown> | null;
    if (!a || !t) return { ok: false, message: "المعايرة تحتاج المادة المعايَرة (analyte) والمحلول القياسي (titrant)." };
    return { ok: true, experiment: { kind: "titration", analyte: { species: a.species as string, volume: a.volume as string, concentration: (a.concentration as string | null) ?? null, equivalence: (a.equivalence as string | null) ?? null }, titrant: { species: t.species as string, concentration: t.concentration as string }, indicators: [...(p.indicators as string[])] } };
  }
  if (p.order === null || p.k25 === null || p.ea === null || p.duration === null) return { ok: false, message: "تجربة السرعة تحتاج الرتبة وk عند 25 °C وطاقة التنشيط ومدة المشاهدة." };
  const trials = (p.trials as Record<string, unknown>[]).map((tr, i) => ({ id: labTrialId(i), label: str(tr.label, L.shortLabelChars) || "التجربة " + (i + 1), temperature: tr.temperature as string, concentration: tr.concentration as string, catalyst: tr.catalyst === true }));
  return { ok: true, experiment: { kind: "rate", order: p.order as RateOrder, k25: p.k25 as string, ea: p.ea as string, catalystDrop: p.catalystDrop as string | null, duration: p.duration as number, trials } };
}

/** Code-owned reporting precision: pH and burette volumes to 2 decimals, everything else to 3 significant figures. */
const precisionFor = (dim: LabDimension, unit: string) => (dim === "pH" || (dim === "volume" && unit === "mL") ? { decimals: 2 } : { significant: 3 });

export function buildLabSim(raw: unknown, path: string): R<{ config: ChemLabConfigV1; checks: SimCheck[] }> {
  if (!hasExactKeys(raw, SPEC_KEYS) || !isEnum(raw.experiment, CHEM_LAB_EXPERIMENTS) || typeof raw.readouts !== "boolean" || typeof raw.graph !== "boolean"
    || !isArr(raw.solutions, L.solutions) || !isArr(raw.indicators, L.indicators) || !isArr(raw.trials, L.trials) || !isArr(raw.tasks, L.tasks)
    || !(raw.solutions as unknown[]).every(s => hasExactKeys(s, ["label", "species", "concentration"]) && typeof s.label === "string" && typeof s.species === "string" && typeof s.concentration === "string")
    || !(raw.trials as unknown[]).every(t => hasExactKeys(t, ["label", "temperature", "concentration", "catalyst"]) && typeof t.label === "string" && typeof t.temperature === "string" && typeof t.concentration === "string" && typeof t.catalyst === "boolean")
    || !(raw.indicators as unknown[]).every(x => typeof x === "string")
    || !(raw.analyte === null || (hasExactKeys(raw.analyte, ["species", "volume", "concentration", "equivalence"]) && typeof raw.analyte.species === "string" && typeof raw.analyte.volume === "string"))
    || !(raw.titrant === null || (hasExactKeys(raw.titrant, ["species", "concentration"]) && typeof raw.titrant.species === "string" && typeof raw.titrant.concentration === "string"))
    || !(raw.order === null || isInt(raw.order, 0, 2)) || !(raw.duration === null || isInt(raw.duration, KINETICS_LIMITS.durationMinS, KINETICS_LIMITS.durationMaxS))
    || !["solute", "stock", "k25", "ea", "catalystDrop"].every(k => raw[k] === null || typeof raw[k] === "string")
    || !(raw.source === null || isEnum(raw.source, SOURCES))) return fail("AI_SIM_SPEC_MALFORMED", "مواصفة المختبر الافتراضي غير صالحة البنية.", path);
  const kind = raw.experiment as ChemLabExperimentKind;
  const bad = (message: string) => fail<{ config: ChemLabConfigV1; checks: SimCheck[] }>("AI_SIM_TASK_INVALID", message, path);
  const built = buildExperiment(raw, kind);
  if (!built.ok) return bad(built.message);
  const experiment = built.experiment;
  if (!(raw.tasks as unknown[]).length) return bad("أضف مهمة واحدة على الأقل للطالب.");
  const tasks: ChemLabTask[] = [];
  for (const [i, t] of (raw.tasks as unknown[]).entries()) {
    const where = "المهمة " + (i + 1) + ": ";
    if (!hasExactKeys(t, TASK_KEYS) || !isEnum(t.kind, COMPOSER_LAB_TASK_KINDS) || typeof t.item !== "string" || typeof t.label !== "string"
      || !TASK_KEYS.slice(3, 8).every(k => t[k] === null || typeof t[k] === "string") || !(t.volume === null || isInt(t.volume, 1, 1000)) || !(t.count === null || isInt(t.count, 1, L.observeCountMax))) {
      return fail("AI_SIM_SPEC_MALFORMED", where + "بنية المهمة غير صالحة.", path);
    }
    const id = "q" + (i + 1), tk = t.kind as TaskKind;
    if (tk === "number") {
      const q = quantitySpec(kind, t.item);
      if (!q) return bad(where + "الكمية «" + t.item.slice(0, 40) + "» غير معروفة لتجربة " + kind + " (المتاح: " + QUANTITIES[kind].map(x => x.id).join(", ") + ").");
      if (kind === "titration" && (q.id === "analyteConcentration") && experiment.kind === "titration" && experiment.analyte.concentration !== null) {
        return bad(where + "تركيز المادة المعايَرة ظاهر في المعطيات؛ اجعلها مجهولة (concentration = null وequivalence = حجم نقطة التكافؤ) حتى لا تكون الإجابة معطاة.");
      }
      const dim = (q.dimension === "byOrder" ? rateConstantDimension((experiment as { order: RateOrder }).order) : q.dimension) as LabDimension;
      const unit: string = typeof t.unit === "string" && labUnit(dim, t.unit) ? t.unit : DEFAULT_UNIT[dim] ?? LAB_UNITS[dim][0].id;
      const label = str(t.label, L.labelChars) || q.label;
      tasks.push({ id, label, kind: "number", quantity: q.id, subject: t.subject as string | null, other: t.other as string | null, at: t.at as string | null, unit, precision: precisionFor(dim, unit) });
    } else if (tk === "choice") {
      const q = choiceSpec(kind, t.item);
      if (!q) return bad(where + "السؤال «" + t.item.slice(0, 40) + "» غير معروف لتجربة " + kind + " (المتاح: " + CHOICES[kind].map(x => x.id).join(", ") + ").");
      const shell: ChemLabConfigV1 = { v: 1, experiment, view: { readouts: false, graph: false }, tasks: [] };
      let options: string[];
      try { options = [...q.options(shell, { subject: t.subject as string | null, other: t.other as string | null })].slice(0, L.options); }
      catch { return bad(where + "تعذّر بناء خيارات السؤال من معطيات التجربة؛ راجع المعطيات."); }
      tasks.push({ id, label: str(t.label, L.labelChars) || q.label, kind: "choice", question: q.id, subject: t.subject as string | null, other: t.other as string | null, mode: q.mode === "multiple" ? "multiple" : "single", options });
    } else if (tk === "prepare") {
      if (t.item !== "prepare" && t.item !== "") return bad(where + "مهمة التحضير لا تأخذ معرّفًا (item = \"prepare\").");
      const conc = t.concentration, vol = t.volume;
      if (typeof conc !== "string" || typeof vol !== "number") return bad(where + "مهمة التحضير تحتاج التركيز المطلوب وحجم الدورق (" + LAB_FLASKS_ML.join("، ") + " mL).");
      tasks.push({ id, label: str(t.label, L.labelChars) || "حضّر " + vol + " mL من المحلول بتركيز " + conc + " mol/L.", kind: "prepare", concentration: conc, volume: vol });
    } else {
      const o = observeSpec(kind, t.item);
      if (!o) return bad(where + "متطلب الملاحظة «" + t.item.slice(0, 40) + "» غير معروف لتجربة " + kind + " (المتاح: " + OBSERVATIONS[kind].map(x => x.id).join(", ") + ").");
      tasks.push({ id, label: str(t.label, L.labelChars) || o.label, kind: "observe", requirement: o.id, subject: t.subject as string | null, count: o.needs.count ? ((t.count as number | null) ?? 3) : null });
    }
  }
  // the titration curve is built from the pH meter: no curve without readouts (the production rule), never a refusal for it
  const view = { readouts: raw.readouts as boolean, graph: (raw.graph as boolean) && (kind !== "titration" || (raw.readouts as boolean)) };
  const v = validateChemLabConfig({ v: 1, experiment, view, tasks });
  if (!v.ok) return { ok: false, issues: v.issues.map(i => ({ code: "AI_SIM_TASK_INVALID", message: i.message, path })) };
  const checks: SimCheck[] = v.config.tasks.map((t, i) => ({ id: "c-" + t.id, label: (t.label || "مهمة " + (i + 1)).slice(0, SMART_SIM_LIMITS.checkLabelChars), weight: CHECK_WEIGHT[t.kind], kind: CHECK_KIND[t.kind], taskId: t.id }));
  return { ok: true, value: { config: v.config, checks } };
}

/** The model-facing lab catalog (travels inside chemistryCatalogForPrompt, i.e. only in prompts that need chemistry). */
export function labCatalogForPrompt(): string {
  const items = (k: ChemLabExperimentKind) => "numbers " + QUANTITIES[k].map(q => q.id + (q.needs.subject ? "(subject " + q.needs.subject + ")" : "") + (q.needs.other ? "(other " + q.needs.other + ")" : "") + (q.needs.at ? "(at " + q.needs.at + ")" : "")).join(", ")
    + "; choices " + (CHOICES[k].map(c => c.id + (c.needs.subject ? "(subject " + c.needs.subject + ")" : "") + (c.needs.other ? "(other " + c.needs.other + ")" : "")).join(", ") || "none")
    + "; observe " + OBSERVATIONS[k].map(o => o.id + (o.needs.subject ? "(subject indicator)" : "") + (o.needs.count ? "(count)" : "")).join(", ");
  const T = TITRATION_LIMITS, K = KINETICS_LIMITS;
  return [
    "chemistryLab@1 (fill `lab`; every other experiment's fields empty / null): experiment solutions | ph | titration | rate. Decimals are plain strings (\"0.100\", \"25.00\"; k25 may be \"2.0e-3\"). Tasks (≤ " + L.tasks + "): kind number | choice | prepare | observe, item = the catalog id below (prepare: item \"prepare\" with concentration + volume), label = the student-facing question (never the answer). Units, precision, options and the key are built by code. readouts shows live meter values (turn it off when the student must calculate them).",
    "solutions: solute " + LAB_SOLUTES.map(s => s.id).join("/") + ", source solid (weigh) or stock (dilute; stock concentration); flasks " + LAB_FLASKS_ML.join("/") + " mL; " + items("solutions") + ".",
    "ph: 1–" + L.solutions + " solutions {label, species " + ACID_BASE_SPECIES.map(s => s.id).join("/") + ", concentration (H2O: \"0\")}, ids s1, s2… in order; indicators " + INDICATORS.map(i => i.id).join("/") + "; " + items("ph") + ".",
    "titration: strong acid ↔ strong base only; analyte {species, volume " + T.analyteMinML + "–" + T.analyteMaxML + " mL, concentration OR equivalence (unknown analyte: equivalence volume " + T.equivalenceMinML + "–" + T.equivalenceMaxML + " mL, 2 decimals)}, titrant {species, concentration " + toNumber(T.concentrationMin) + "–" + toNumber(T.concentrationMax) + " mol/L}; ≥ 1 indicator; asking analyteConcentration requires an unknown analyte; " + items("titration") + ".",
    "rate: order 0/1/2, k25 > 0, ea " + K.eaMinKJ + "–" + K.eaMaxKJ + " kJ/mol, catalystDrop (or null), duration " + K.durationMinS + "–" + K.durationMaxS + " s, 1–" + L.trials + " trials {label, temperature " + K.temperatureMinC + "–" + K.temperatureMaxC + " °C, concentration " + K.concentrationMin + "–" + K.concentrationMax + " mol/L, catalyst}, ids t1, t2… in order; " + items("rate") + "."
  ].join("\n");
}
