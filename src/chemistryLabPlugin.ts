// Phase 21D-D.3 — chemistryLab@1, the virtual chemistry laboratory SmartSim plugin (pure; compiled into the shared server build and
// registered by src/trustedSimPlugins.ts). The strict public config is src/chemistryLabModel.ts; the science is src/chemistry/lab/*.
//
//   actions — SEMANTIC lab operations, normalized against the config (exact keys, declared ids, bounded canonical decimals):
//             solution.flask / solution.mass / solution.pipette / solution.makeUp, ph.measure / ph.indicator,
//             titration.indicator / titration.add, rate.run, lab.record / lab.reset, and the answers answer.number / answer.choose /
//             answer.clear. Viewing a graph, moving a cursor, zooming or exploring are PRESENTATION: never actions, never stored or graded.
//   state   — { v: 1, lab, observations, answers }: tiny, canonical, rebuilt by replay (the client state is never read).
//   checks  — lab.number (the task's public reporting precision + the code-owned instrument floor; no free tolerance), lab.choice (the
//             derived correct set), lab.prepared (the made-up solution is the target), lab.observed (the required records exist).
//             No check carries an expected value: every expected answer is derived from the config and the replayed state.
import {
  CHEM_LAB_KEY, CHEM_LAB_LIMITS, CHEM_LAB_VERSION, CHOICE_OPTION_LABEL, authoredDecimal, chemLabContext, chemLabTaskById, choiceSpec, emptyStateFor, observeSpec,
  preparedMeetsTarget, quantityDimension, quantitySpec, validateChemLabConfig,
  type ChemLabAnswer, type ChemLabConfigV1, type ChemLabExperimentState, type ChemLabObservation, type ChemLabStateV1, type ChoiceTask, type NumberTask,
  type SolutionsContext
} from "./chemistryLabModel";
import { add, cmp, div, parseDecimal, qi, toFixed, type Q } from "./chemistry/lab/exact";
import { labUnit, toCanonical, fromCanonical, type LabDimension } from "./chemistry/lab/units";
import { answerTolerance, formatAtPrecision, withinTolerance } from "./chemistry/lab/precision";
import { isBalanceMass, requiredAliquot, requiredMass } from "./chemistry/lab/solutions";
import { BURETTE, isBuretteStep } from "./chemistry/lab/titration";
import { isPlainObject } from "./trustedSimVocabulary";
import type { SmartSimCheckBase, SmartSimCheckOutcome, SmartSimIssue, SmartSimPlugin } from "./trustedSimRegistry";
import type { SmartSimPluginDescriptorV1 } from "./trustedSimDescriptor";

export const CHEM_LAB_LABEL = "المختبر الكيميائي الافتراضي (المحاليل، pH، المعايرة، سرعة التفاعل)";
export const CHEM_LAB_MAX_ACTIONS = 500;
export const CHEM_LAB_ACTION_KINDS: readonly string[] = Object.freeze([
  "solution.flask", "solution.mass", "solution.pipette", "solution.makeUp", "ph.measure", "ph.indicator", "titration.indicator", "titration.add", "rate.run",
  "lab.record", "lab.reset", "answer.number", "answer.choose", "answer.clear"
]);
export const CHEM_LAB_CHECK_KINDS: readonly string[] = Object.freeze(["lab.number", "lab.choice", "lab.prepared", "lab.observed"]);
export type ChemLabAction =
  | { type: "solution.flask"; volume: number } | { type: "solution.mass"; mass: string } | { type: "solution.pipette"; volume: number } | { type: "solution.makeUp" }
  | { type: "ph.measure"; solutionId: string } | { type: "ph.indicator"; solutionId: string; indicatorId: string }
  | { type: "titration.indicator"; indicatorId: string } | { type: "titration.add"; volume: string } | { type: "rate.run"; trialId: string }
  | { type: "lab.record" } | { type: "lab.reset" }
  | { type: "answer.number"; taskId: string; value: string; unit: string } | { type: "answer.choose"; taskId: string; options: string[] } | { type: "answer.clear"; taskId: string };
export type ChemLabCheck = SmartSimCheckBase & { kind: "lab.number" | "lab.choice" | "lab.prepared" | "lab.observed"; taskId: string };
type Runtime = ChemLabStateV1;

const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const INVALID = { ok: false as const, code: "LAB_ACTION_INVALID" };
const ANSWER_VALUE_MAX = 32;

export function normalizeChemLabAction(raw: unknown, c: ChemLabConfigV1): { ok: true; action: ChemLabAction } | { ok: false; code: string } {
  if (!isPlainObject(raw) || typeof raw.type !== "string") return INVALID;
  const e = c.experiment, has = (keys: string[]) => exactKeys(raw, ["type", ...keys]);
  switch (raw.type) {
    case "solution.flask":
      return e.kind === "solutions" && has(["volume"]) && e.flasks.includes(raw.volume as number) ? { ok: true, action: { type: "solution.flask", volume: raw.volume as number } } : INVALID;
    case "solution.pipette":
      return e.kind === "solutions" && e.source === "stock" && has(["volume"]) && e.pipettes.includes(raw.volume as number) ? { ok: true, action: { type: "solution.pipette", volume: raw.volume as number } } : INVALID;
    case "solution.mass": {
      if (e.kind !== "solutions" || e.source !== "solid" || !has(["mass"]) || typeof raw.mass !== "string" || raw.mass.length > 12) return INVALID;
      const m = parseDecimal(raw.mass), max = (chemLabContext(e) as SolutionsContext).maxMass;
      return m && max && isBalanceMass(m, max) ? { ok: true, action: { type: "solution.mass", mass: toFixed(m, 2) } } : INVALID;
    }
    case "solution.makeUp":
      return e.kind === "solutions" && has([]) ? { ok: true, action: { type: "solution.makeUp" } } : INVALID;
    case "ph.measure":
      return e.kind === "ph" && c.view.readouts && has(["solutionId"]) && e.solutions.some(s => s.id === raw.solutionId) ? { ok: true, action: { type: "ph.measure", solutionId: raw.solutionId as string } } : INVALID;
    case "ph.indicator":
      return e.kind === "ph" && has(["solutionId", "indicatorId"]) && e.solutions.some(s => s.id === raw.solutionId) && e.indicators.includes(raw.indicatorId as string)
        ? { ok: true, action: { type: "ph.indicator", solutionId: raw.solutionId as string, indicatorId: raw.indicatorId as string } } : INVALID;
    case "titration.indicator":
      return e.kind === "titration" && has(["indicatorId"]) && e.indicators.includes(raw.indicatorId as string) ? { ok: true, action: { type: "titration.indicator", indicatorId: raw.indicatorId as string } } : INVALID;
    case "titration.add": {
      if (e.kind !== "titration" || !has(["volume"]) || typeof raw.volume !== "string" || raw.volume.length > 8) return INVALID;
      const v = parseDecimal(raw.volume);
      return v && isBuretteStep(v) ? { ok: true, action: { type: "titration.add", volume: toFixed(v, 2) } } : INVALID;
    }
    case "rate.run":
      return e.kind === "rate" && has(["trialId"]) && e.trials.some(t => t.id === raw.trialId) ? { ok: true, action: { type: "rate.run", trialId: raw.trialId as string } } : INVALID;
    case "lab.record":
      return has([]) && (e.kind === "solutions" || e.kind === "titration") ? { ok: true, action: { type: "lab.record" } } : INVALID;
    case "lab.reset":
      return has([]) ? { ok: true, action: { type: "lab.reset" } } : INVALID;
    case "answer.number": {
      const t = chemLabTaskById(c, raw.taskId);
      if (!t || t.kind !== "number" || !has(["taskId", "value", "unit"]) || typeof raw.value !== "string" || raw.value.length > ANSWER_VALUE_MAX || !parseDecimal(raw.value)) return INVALID;
      const dim = quantityDimension(c, quantitySpec(c.experiment.kind, t.quantity)!);
      return labUnit(dim, raw.unit) ? { ok: true, action: { type: "answer.number", taskId: t.id, value: raw.value, unit: raw.unit as string } } : INVALID;
    }
    case "answer.choose": {
      const t = chemLabTaskById(c, raw.taskId);
      if (!t || t.kind !== "choice" || !has(["taskId", "options"]) || !Array.isArray(raw.options)) return INVALID;
      const picked = raw.options as unknown[];
      if (!picked.length || picked.length > t.options.length || new Set(picked).size !== picked.length || !picked.every(o => typeof o === "string" && t.options.includes(o))) return INVALID;
      if (t.mode === "single" && picked.length !== 1) return INVALID;
      return { ok: true, action: { type: "answer.choose", taskId: t.id, options: t.options.filter(o => picked.includes(o)) } };
    }
    case "answer.clear": {
      const t = chemLabTaskById(c, raw.taskId);
      return t && (t.kind === "number" || t.kind === "choice") && has(["taskId"]) ? { ok: true, action: { type: "answer.clear", taskId: t.id } } : INVALID;
    }
    default:
      return INVALID;
  }
}

const createRuntime = (c: ChemLabConfigV1): Runtime => emptyStateFor(c);
const withObservation = (s: Runtime, o: ChemLabObservation, dedupe: boolean): Runtime => {
  if (s.observations.length >= CHEM_LAB_LIMITS.observations) return s;
  if (dedupe && s.observations.some(x => JSON.stringify(x) === JSON.stringify(o))) return s;
  return { ...s, observations: [...s.observations, o] };
};
/** Applies one NORMALIZED action. Operations a real bench would not allow (adding beyond the burette, recording nothing) change nothing. */
export function applyChemLabAction(s: Runtime, a: ChemLabAction, c: ChemLabConfigV1): Runtime {
  const lab = s.lab;
  switch (a.type) {
    case "solution.flask": return lab.kind === "solutions" ? { ...s, lab: { ...lab, flask: a.volume, madeUp: false } } : s;
    case "solution.mass": return lab.kind === "solutions" ? { ...s, lab: { ...lab, mass: a.mass, madeUp: false } } : s;
    case "solution.pipette": return lab.kind === "solutions" ? { ...s, lab: { ...lab, pipette: a.volume, madeUp: false } } : s;
    case "solution.makeUp":
      return lab.kind === "solutions" && lab.flask !== null && (lab.mass !== null || lab.pipette !== null) ? { ...s, lab: { ...lab, madeUp: true } } : s;
    case "ph.measure": return withObservation(s, { kind: "meter", solution: a.solutionId }, true);
    case "ph.indicator": return withObservation(s, { kind: "indicator", solution: a.solutionId, indicator: a.indicatorId }, true);
    case "titration.indicator": return lab.kind === "titration" ? { ...s, lab: { ...lab, indicator: a.indicatorId } } : s;
    case "titration.add": {
      if (lab.kind !== "titration") return s;
      const next = add(parseDecimal(lab.added) as Q, parseDecimal(a.volume) as Q);
      return cmp(next, qi(BURETTE.capacityML)) > 0 ? s : { ...s, lab: { ...lab, added: toFixed(next, 2) } };
    }
    case "rate.run": return withObservation(s, { kind: "run", trial: a.trialId }, true);
    case "lab.record":
      if (lab.kind === "solutions") {
        if (!lab.madeUp || lab.flask === null) return s;
        return withObservation(s, { kind: "solution", flask: lab.flask, mass: c.experiment.kind === "solutions" && c.experiment.source === "solid" ? lab.mass : null, pipette: c.experiment.kind === "solutions" && c.experiment.source === "stock" ? lab.pipette : null }, false);
      }
      if (lab.kind === "titration") return withObservation(s, { kind: "reading", added: lab.added, indicator: lab.indicator }, false);
      return s;
    case "lab.reset": return { ...s, lab: emptyStateFor(c).lab };
    case "answer.number": return { ...s, answers: { ...s.answers, [a.taskId]: { kind: "number", value: a.value, unit: a.unit } } };
    case "answer.choose": return { ...s, answers: { ...s.answers, [a.taskId]: { kind: "choice", options: [...a.options] } } };
    case "answer.clear": { const answers = { ...s.answers }; delete answers[a.taskId]; return { ...s, answers }; }
  }
}
/** Canonical state: answers in task order (the grade never depends on the order of decisions). */
export function canonicalChemLabState(s: Runtime, c: ChemLabConfigV1): ChemLabStateV1 {
  const answers: Record<string, ChemLabAnswer> = {};
  for (const t of c.tasks) if (Object.prototype.hasOwnProperty.call(s.answers, t.id)) answers[t.id] = s.answers[t.id];
  const lab: ChemLabExperimentState = { ...s.lab };
  return { v: 1, lab, observations: s.observations.map(o => ({ ...o })), answers };
}
/** Replays raw actions from the empty state (client workspaces and parity tests; the SmartSim core uses the plugin functions). */
export function replayChemLab(c: ChemLabConfigV1, rawActions: readonly unknown[]): { ok: true; state: ChemLabStateV1 } | { ok: false; code: string } {
  if (!Array.isArray(rawActions) || rawActions.length > CHEM_LAB_MAX_ACTIONS) return { ok: false, code: "LAB_ACTIONS_TOO_MANY" };
  let s = createRuntime(c);
  for (const raw of rawActions) {
    const n = normalizeChemLabAction(raw, c);
    if (!n.ok) return n;
    s = applyChemLabAction(s, n.action, c);
  }
  return { ok: true, state: canonicalChemLabState(s, c) };
}

// ── checks ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const GENERIC = ["id", "label", "weight", "kind"];
const CHECK_FOR_TASK: Readonly<Record<string, string>> = Object.freeze({ number: "lab.number", choice: "lab.choice", prepare: "lab.prepared", observe: "lab.observed" });
export function validateChemLabCheck(raw: Record<string, unknown>, c: ChemLabConfigV1): { ok: true; check: ChemLabCheck } | { ok: false; issues: SmartSimIssue[] } {
  const fail = (message: string) => ({ ok: false as const, issues: [{ code: "LAB_CHECK_INVALID", message: "الفحص «" + String(raw.label) + "»: " + message }] });
  if (typeof raw.kind !== "string" || !CHEM_LAB_CHECK_KINDS.includes(raw.kind)) return fail("نوع فحص غير معروف.");
  if (!exactKeys(raw, [...GENERIC, "taskId"])) return fail("معاملات الفحص غير مطابقة لنوعه (المعرّف، الوصف، الوزن، النوع، المهمة فقط — لا قيم متوقعة).");
  const t = chemLabTaskById(c, raw.taskId);
  if (!t) return fail("يشير إلى مهمة غير معرّفة.");
  if (CHECK_FOR_TASK[t.kind] !== raw.kind) return fail("نوع الفحص لا يناسب نوع المهمة «" + t.label + "».");
  return { ok: true, check: { id: raw.id as string, label: raw.label as string, weight: raw.weight as number, kind: raw.kind as ChemLabCheck["kind"], taskId: t.id } };
}
export type NumberEvaluation = { trusted: Q; tolerance: Q; unit: string; passed: boolean; answer: Q | null };
/** The trusted value of a number task in ITS unit, the tolerance (precision ∨ instrument) and the verdict on the saved answer. */
export function evaluateNumberTask(c: ChemLabConfigV1, s: ChemLabStateV1, t: NumberTask): NumberEvaluation | null {
  const q = quantitySpec(c.experiment.kind, t.quantity);
  if (!q) return null;
  const trustedCanonical = q.value(c, s, t);
  if (!trustedCanonical) return null;
  const dim = quantityDimension(c, q) as LabDimension, taskUnit = labUnit(dim, t.unit)!;
  const trusted = fromCanonical(trustedCanonical, taskUnit), floor = div(q.instrument(c), taskUnit.factor);
  const tolerance = answerTolerance(t.precision, trusted, floor);
  const a = s.answers[t.id];
  if (!a || a.kind !== "number") return { trusted, tolerance, unit: taskUnit.id, passed: false, answer: null };
  const v = parseDecimal(a.value), unit = labUnit(dim, a.unit);
  if (!v || !unit) return { trusted, tolerance, unit: taskUnit.id, passed: false, answer: null };
  const answer = fromCanonical(toCanonical(v, unit), taskUnit);
  return { trusted, tolerance, unit: taskUnit.id, passed: withinTolerance(answer, trusted, tolerance), answer };
}
/** The derived correct options of a choice task (null when the derivation is refused — impossible for a validated config). */
export function correctChoice(c: ChemLabConfigV1, t: ChoiceTask): string[] | null {
  const q = choiceSpec(c.experiment.kind, t.question), r = q ? q.correct(c, t) : null;
  return r && r.ok ? r.correct : null;
}
const optionText = (c: ChemLabConfigV1, o: string): string => {
  const e = c.experiment;
  if (e.kind === "ph") { const s = e.solutions.find(x => x.id === o); if (s) return s.label; }
  if (e.kind === "rate") { const t = e.trials.find(x => x.id === o); if (t) return t.label; }
  return CHOICE_OPTION_LABEL[o] ?? o;
};
const fmtQ = (v: Q, digits = 4): string => { const n = Number(toFixed(v, 12)); return n === 0 ? "0" : String(Number(n.toPrecision(digits))); };
export function evaluateChemLabCheck(check: ChemLabCheck, s: ChemLabStateV1, c: ChemLabConfigV1): SmartSimCheckOutcome {
  const t = chemLabTaskById(c, check.taskId);
  if (!t) return { expected: "—", actual: "—", passed: false };
  if (t.kind === "number") {
    const r = evaluateNumberTask(c, s, t), a = s.answers[t.id];
    const actual = a && a.kind === "number" ? a.value + " " + a.unit : "—";
    if (!r) return { expected: "لا توجد قيمة (لم تكتمل التجربة المطلوبة)", actual, passed: false };
    return { expected: formatAtPrecision(t.precision, r.trusted) + " ± " + fmtQ(r.tolerance) + " " + r.unit, actual, passed: r.passed };
  }
  if (t.kind === "choice") {
    const correct = correctChoice(c, t) ?? [], a = s.answers[t.id], chosen = a && a.kind === "choice" ? a.options : [];
    const passed = correct.length > 0 && chosen.length === correct.length && chosen.every(o => correct.includes(o));
    return { expected: correct.map(o => optionText(c, o)).join("، ") || "—", actual: chosen.map(o => optionText(c, o)).join("، ") || "—", passed };
  }
  if (t.kind === "prepare") {
    const passed = preparedMeetsTarget(c, s, t), lab = s.lab;
    const actual = lab.kind === "solutions" && lab.madeUp && lab.flask !== null ? (lab.mass !== null ? lab.mass + " g" : lab.pipette + " mL من المحلول الأم") + " في " + lab.flask + " mL" : "لم يكتمل التحضير";
    return { expected: t.concentration + " mol/L في " + t.volume + " mL", actual, passed };
  }
  const o = observeSpec(c.experiment.kind, t.requirement);
  const passed = !!o && o.met(c, s, t);
  return { expected: o ? o.label + (t.count ? " (" + t.count + ")" : "") : "—", actual: passed ? "مكتمل" : "غير مكتمل", passed };
}
/** The teacher-only derived answer of a task (editor preview; never sent to a student). */
export function expectedChemLabText(c: ChemLabConfigV1, taskId: string): string {
  const t = chemLabTaskById(c, taskId);
  if (!t) return "—";
  if (t.kind === "number") {
    const r = evaluateNumberTask(c, emptyStateFor(c), t);
    return r ? formatAtPrecision(t.precision, r.trusted) + " " + r.unit + " (السماحية ± " + fmtQ(r.tolerance) + ")" : "تُحسب من محلول الطالب أو قراءته عند التصحيح";
  }
  if (t.kind === "choice") return (correctChoice(c, t) ?? []).map(o => optionText(c, o)).join("، ");
  if (t.kind === "prepare") {
    const ctx = chemLabContext(c.experiment) as SolutionsContext, target = authoredDecimal(t.concentration) as Q;
    if (c.experiment.kind === "solutions" && c.experiment.source === "solid")
      return "زن " + toFixed(requiredMass(ctx.solute, target, t.volume).weighable, 2) + " g ثم أكمل إلى " + t.volume + " mL";
    return "انقل " + toFixed(requiredAliquot(ctx.stock as Q, target, t.volume), 2) + " mL من المحلول الأم ثم أكمل إلى " + t.volume + " mL";
  }
  const o = observeSpec(c.experiment.kind, t.requirement);
  return o ? o.label : "—";
}

export const CHEMISTRY_LAB_DESCRIPTOR_V1: SmartSimPluginDescriptorV1 = {
  descriptorVersion: 1, key: CHEM_LAB_KEY, version: CHEM_LAB_VERSION, label: CHEM_LAB_LABEL, domain: "chemistry",
  sceneKinds: ["2d"], rendererFamilies: ["svg2d", "graph2d", "table", "form"],
  capabilities: ["scene.2d", "graph.2d", "object.select", "value.set"],
  actionKinds: [...CHEM_LAB_ACTION_KINDS], checkKinds: [...CHEM_LAB_CHECK_KINDS], genericRules: [], assetKinds: [],
  tools: ["select", "probe", "form"], accessibility: ["keyboardAlternative", "semanticLabels", "toolLabels", "textTranscript"],
  supports: { autosave: true, restore: true, reset: true, partialCredit: true, offline: true, twoDimensional: true, threeDimensional: false }
};
export const chemistryLabPluginV1: SmartSimPlugin<ChemLabConfigV1, Runtime, ChemLabStateV1, ChemLabAction, ChemLabCheck> = Object.freeze({
  key: CHEM_LAB_KEY,
  version: CHEM_LAB_VERSION,
  label: CHEM_LAB_LABEL,
  maxActions: CHEM_LAB_MAX_ACTIONS,
  descriptor: CHEMISTRY_LAB_DESCRIPTOR_V1,
  checkKinds: CHEM_LAB_CHECK_KINDS,
  validateConfig: (raw: unknown) => validateChemLabConfig(raw),
  createRuntime,
  normalizeAction: normalizeChemLabAction,
  applyAction: (rt: Runtime, a: ChemLabAction, c: ChemLabConfigV1) => applyChemLabAction(rt, a, c),
  canonicalState: (rt: Runtime, c: ChemLabConfigV1) => canonicalChemLabState(rt, c),
  serializeState: (s: ChemLabStateV1) => JSON.stringify(s),
  validateCheck: validateChemLabCheck,
  evaluateCheck: evaluateChemLabCheck
});
