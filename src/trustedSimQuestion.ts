// Phase 20A — the smartSim@1 QUESTION contract (pure; compiled into the shared server build). ONE generic trusted-simulation type
// whose domain behaviour comes from a code-owned plugin resolved by EXACT identity (src/trustedSimRegistry.ts). This module never names
// a domain: the production plugin set is registered by src/trustedSimPlugins.ts, which every consumer imports.
//
// Persisted contract (data only):
//   question.smartSim = { schemaVersion: 1, pluginKey, pluginVersion, config }      PUBLIC — strict exact keys; the plugin owns `config`
//   question.answer   = { scoring?, checks: [{ id, label, weight, kind, ...params }] } PRIVATE — removed for students by the sanitizer
//   student answer    = { kind: "smartSim", pluginKey, pluginVersion, actions, state }
// Authority model (extends networkCli@1): the server NEVER trusts a client-derived state. Ingest validates the published envelope, the
// answer's plugin identity and every action, REPLAYS the actions from the canonical initial state and stores the derived state; the
// grader replays again under the strict contract. Plugins return FACTS per check (expected / actual / passed); the score is computed
// here from positive finite weights: proportional = marks × passedWeight / totalWeight, or allOrNothing. A broken AUTHORITY (envelope,
// plugin identity, private key) fails CLOSED (no automatic mark, manual review); a broken STUDENT response is an ordinary zero.
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import { SMART_SIM_LIMITS, checkBoundedJson, isForbiddenKey, resolveSmartSimPlugin, resolveSmartSimDescriptor, type AnySmartSimPlugin, type SmartSimCheckBase, type SmartSimIssue, type SmartSimPlugin } from "./trustedSimRegistry";
import { isPresentationActionType } from "./trustedSimVocabulary";
import { resolveSmartSimRule, validateSmartSimRuleCheck, evaluateSmartSimRuleCheck, type SmartSimRuleView, type SmartSimRuleCheck } from "./trustedSimRules";

// Phase 20A.1 — generic trusted rules. A check whose kind is a generic rule id ("objectSelected@1") is accepted ONLY when the plugin's
// code-owned descriptor opts into exactly that rule (and the plugin provides a ruleView); otherwise it is an unknown kind (fail closed).
// The rule validates its parameters against the plugin's view of the INITIAL state and evaluates on the view of the REPLAYED state.
const isGenericRuleFor = (plugin: AnySmartSimPlugin, kind: unknown): kind is string =>
  typeof kind === "string" && !plugin.checkKinds.includes(kind) && typeof plugin.ruleView === "function" && resolveSmartSimRule(kind) !== undefined
  && resolveSmartSimPlugin(plugin.key, plugin.version) === plugin && (resolveSmartSimDescriptor(plugin.key, plugin.version)?.genericRules.includes(kind) ?? false);
function ruleViewOf(plugin: AnySmartSimPlugin, state: unknown, config: unknown): SmartSimRuleView | undefined {
  try { return plugin.ruleView ? plugin.ruleView(state, config) : undefined; } catch { return undefined; }
}
function initialRuleView(plugin: AnySmartSimPlugin, config: unknown): SmartSimRuleView | undefined {
  try { return ruleViewOf(plugin, plugin.canonicalState(plugin.createRuntime(config), config), config); } catch { return undefined; }
}

export const SMART_SIM_TYPE_KEY = "smartSim";
export const SMART_SIM_SCHEMA_VERSION = 1 as const;
export type SmartSimEnvelopeV1 = { schemaVersion: typeof SMART_SIM_SCHEMA_VERSION; pluginKey: string; pluginVersion: number; config: unknown };
export type SmartSimAnswer = { kind: "smartSim"; pluginKey: string; pluginVersion: number; actions: unknown[]; state: unknown };
export type SmartSimScoringMode = "proportional" | "allOrNothing";
export const SMART_SIM_SCORING_MODES: readonly SmartSimScoringMode[] = Object.freeze(["proportional", "allOrNothing"]);
export type SmartSimQuestionIssue = SmartSimIssue & { severity: "error" };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const issue = (code: string, message: string, path?: string): SmartSimIssue => (path === undefined ? { code, message } : { code, message, path });
const ENVELOPE_KEYS: ReadonlySet<string> = new Set(["schemaVersion", "pluginKey", "pluginVersion", "config"]);
const KEY_ROOT_KEYS: ReadonlySet<string> = new Set(["scoring", "checks"]);
const CHECK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

/** The effective QUESTION TYPE version (catalog authority): absent = 1; anything unsupported = undefined (fail closed). */
export const smartSimQuestionVersion = (node: unknown): number | undefined => (isObj(node) ? effectiveQuestionTypeVersion(SMART_SIM_TYPE_KEY, node.questionTypeVersion) : undefined);
const isSmartSimNode = (q: unknown): q is Record<string, unknown> => isObj(q) && String(q.presentationType ?? q.type ?? "") === SMART_SIM_TYPE_KEY;

// ── the PUBLIC envelope — ONE strict authority (finalization, student projection, ingest, grader, review) ─────────────────────────
export type SmartSimEnvelopeResult = { ok: true; plugin: AnySmartSimPlugin; envelope: SmartSimEnvelopeV1 } | { ok: false; plugin?: AnySmartSimPlugin; issues: SmartSimIssue[] };
export function validateSmartSimEnvelope(raw: unknown): SmartSimEnvelopeResult {
  if (!isObj(raw)) return { ok: false, issues: [issue("SMARTSIM_ENVELOPE_MISSING", "إعداد المحاكاة الموثوقة مفقود أو غير صالح.", "smartSim")] };
  const out: SmartSimIssue[] = [];
  for (const k of Object.keys(raw)) if (!ENVELOPE_KEYS.has(k)) out.push(issue("SMARTSIM_ENVELOPE_UNKNOWN_KEY", "حقل غير مسموح في إعداد المحاكاة: " + k, "smartSim." + k));
  if (raw.schemaVersion !== SMART_SIM_SCHEMA_VERSION) out.push(issue("SMARTSIM_SCHEMA_UNSUPPORTED", "إصدار مخطط المحاكاة غير مدعوم في هذا الإصدار من التطبيق.", "smartSim.schemaVersion"));
  const plugin = resolveSmartSimPlugin(raw.pluginKey, raw.pluginVersion);
  if (!plugin) {
    out.push(issue("SMARTSIM_PLUGIN_UNKNOWN", "محاكاة غير معروفة أو إصدار غير مدعوم: " + String(raw.pluginKey) + "@" + String(raw.pluginVersion) + " (لا يُشغَّل بإصدار آخر).", "smartSim.pluginKey"));
    return { ok: false, issues: out };
  }
  let cfg: ReturnType<AnySmartSimPlugin["validateConfig"]>;
  try { cfg = plugin.validateConfig(raw.config); } catch { cfg = { ok: false, issues: [issue("SMARTSIM_CONFIG_INVALID", "إعداد المحاكاة غير صالح.", "smartSim.config")] }; }
  if (!cfg.ok) out.push(...cfg.issues.map(i => ({ ...i, path: i.path ?? "smartSim.config" })));
  if (out.length || !cfg.ok) return { ok: false, plugin, issues: out };
  return { ok: true, plugin, envelope: { schemaVersion: SMART_SIM_SCHEMA_VERSION, pluginKey: plugin.key, pluginVersion: plugin.version, config: cfg.config } };
}
/** STUDENT PROJECTION: the canonical envelope of a VALID published configuration; anything else is withheld entirely (fail closed). */
export function projectSmartSimForStudent(raw: unknown): SmartSimEnvelopeV1 | undefined {
  const r = validateSmartSimEnvelope(raw);
  return r.ok ? r.envelope : undefined;
}

// ── the PRIVATE grading key — generic weighted checks + plugin parameters ───────────────────────────────────────────────────────────
export type SmartSimAnswerKeyNormalized = { scoring: SmartSimScoringMode; checks: SmartSimCheckBase[]; totalWeight: number };
export type SmartSimAnswerKeyResult = { ok: true; key: SmartSimAnswerKeyNormalized } | { ok: false; issues: SmartSimIssue[] };
/**
 * Validates AND normalizes the private key. The generic rules (ids, labels, weights, kinds, size) always run; the plugin's parameter rules
 * run only against a VALID config (pass `undefined` when the config is invalid — finalization still reports every generic problem).
 * Any problem makes the WHOLE key invalid: the scorer then fails closed — never a partial grade of the valid-looking subset.
 */
export function validateSmartSimAnswerKey(raw: unknown, plugin: AnySmartSimPlugin, config: unknown): SmartSimAnswerKeyResult {
  if (!isObj(raw)) return { ok: false, issues: [issue("SMARTSIM_ANSWER_KEY_INVALID", "مفتاح التصحيح (الفحوص) مفقود.", "answer")] };
  const out: SmartSimIssue[] = [];
  for (const k of Object.keys(raw)) if (!KEY_ROOT_KEYS.has(k)) out.push(issue("SMARTSIM_ANSWER_KEY_INVALID", "حقل غير معروف في مفتاح التصحيح: " + k, "answer." + k));
  const scoring = raw.scoring === undefined ? "proportional" : raw.scoring === "proportional" || raw.scoring === "allOrNothing" ? raw.scoring : undefined;
  if (scoring === undefined) out.push(issue("SMARTSIM_SCORING_UNKNOWN", "طريقة احتساب العلامة غير معروفة.", "answer.scoring"));
  const checks: SmartSimCheckBase[] = [];
  let totalWeight = 0;
  if (!Array.isArray(raw.checks)) out.push(issue("SMARTSIM_CHECKS_EMPTY", "أضف فحصًا واحدًا على الأقل يحدّد ما يُقيَّم.", "answer.checks"));
  else if (raw.checks.length === 0) out.push(issue("SMARTSIM_CHECKS_EMPTY", "أضف فحصًا واحدًا على الأقل يحدّد ما يُقيَّم.", "answer.checks"));
  else if (raw.checks.length > SMART_SIM_LIMITS.checks) out.push(issue("SMARTSIM_CHECKS_TOO_MANY", "عدد الفحوص يتجاوز الحد (" + SMART_SIM_LIMITS.checks + ").", "answer.checks"));
  else {
    const seen = new Set<string>();
    raw.checks.forEach((c, i) => {
      const where = "answer.checks[" + i + "]";
      // plain bounded data without prototype-sensitive keys; the weight is judged by its own precise rule below
      if (!isObj(c) || Object.keys(c).some(isForbiddenKey) || checkBoundedJson({ ...c, weight: null }) !== undefined) { out.push(issue("SMARTSIM_CHECK_INVALID", "الفحص رقم " + (i + 1) + " غير صالح.", where)); return; }
      let ok = true;
      const id = c.id;
      if (typeof id !== "string" || !CHECK_ID.test(id)) { out.push(issue("SMARTSIM_CHECK_ID_INVALID", "معرّف الفحص رقم " + (i + 1) + " غير صالح.", where + ".id")); ok = false; }
      else if (seen.has(id)) { out.push(issue("SMARTSIM_CHECK_ID_DUPLICATE", "معرّف فحص مكرر: " + id, where + ".id")); ok = false; }
      else seen.add(id);
      if (typeof c.label !== "string" || !c.label.trim() || c.label.length > SMART_SIM_LIMITS.checkLabelChars) { out.push(issue("SMARTSIM_CHECK_LABEL_INVALID", "اكتب وصفًا قصيرًا للفحص رقم " + (i + 1) + " (حتى " + SMART_SIM_LIMITS.checkLabelChars + " حرفًا).", where + ".label")); ok = false; }
      const w = c.weight;
      if (typeof w !== "number" || !Number.isFinite(w) || w <= 0 || w > SMART_SIM_LIMITS.maxWeight) { out.push(issue("SMARTSIM_CHECK_WEIGHT_INVALID", "الوزن في الفحص رقم " + (i + 1) + " يجب أن يكون عددًا موجبًا حتى " + SMART_SIM_LIMITS.maxWeight + ".", where + ".weight")); ok = false; }
      const generic = isGenericRuleFor(plugin, c.kind);
      if (typeof c.kind !== "string" || (!plugin.checkKinds.includes(c.kind) && !generic)) { out.push(issue("SMARTSIM_CHECK_KIND_UNKNOWN", "نوع فحص غير معروف في الفحص رقم " + (i + 1) + ": " + String(c.kind), where + ".kind")); ok = false; }
      if (!ok || config === undefined) return;
      let r: ReturnType<AnySmartSimPlugin["validateCheck"]>;
      if (generic) {
        const view = initialRuleView(plugin, config);
        r = view ? validateSmartSimRuleCheck(c, view) : { ok: false, issues: [issue("SMARTSIM_RULE_VIEW_INVALID", "تعذّر التحقق من الفحص رقم " + (i + 1) + ".")] };
      } else try { r = plugin.validateCheck(c, config); } catch { r = { ok: false, issues: [issue("SMARTSIM_CHECK_INVALID", "الفحص رقم " + (i + 1) + " غير صالح.")] }; }
      if (!r.ok) { out.push(...r.issues.map(x => ({ ...x, path: x.path ?? where }))); return; }
      checks.push(r.check);
      totalWeight += w as number;
    });
  }
  if (out.length || scoring === undefined) return { ok: false, issues: out };
  return { ok: true, key: { scoring, checks, totalWeight } };
}

/** smartSim@1 finalization: every problem BLOCKS. Nothing here executes anything. */
export function validateSmartSimQuestion(node: Record<string, unknown>): SmartSimQuestionIssue[] {
  const out: SmartSimIssue[] = [];
  if (smartSimQuestionVersion(node) === undefined) out.push(issue("SMARTSIM_VERSION_UNSUPPORTED", "إصدار سؤال المحاكاة الموثوقة غير مدعوم في هذا الإصدار من التطبيق.", "questionTypeVersion"));
  const env = validateSmartSimEnvelope(node.smartSim);
  if (!env.ok) out.push(...env.issues);
  const plugin = env.plugin;
  if (plugin) {
    const key = validateSmartSimAnswerKey(node.answer, plugin, env.ok ? env.envelope.config : undefined);
    if (!key.ok) out.push(...key.issues);
  }
  return out.map(i => ({ ...i, severity: "error" as const }));
}

// ── answer ingest ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type SmartSimAnswerResult = { ok: true; answer: SmartSimAnswer } | { ok: false; code: string };
/** Shape + bounds only: EXACTLY {kind, pluginKey, pluginVersion, actions, state} (client score / checks / flags are dropped). */
export function normalizeSmartSimAnswer(a: unknown): SmartSimAnswerResult {
  if (!isObj(a) || a.kind !== "smartSim" || typeof a.pluginKey !== "string" || typeof a.pluginVersion !== "number" || !Number.isInteger(a.pluginVersion) || a.pluginVersion < 1 || !Array.isArray(a.actions)) return { ok: false, code: "SMARTSIM_ANSWER_INVALID" };
  if (a.actions.length > SMART_SIM_LIMITS.actions) return { ok: false, code: "SMARTSIM_ACTIONS_TOO_MANY" };
  if (a.actions.some(x => !isObj(x))) return { ok: false, code: "SMARTSIM_ACTION_INVALID" };
  const state = a.state === undefined ? null : a.state;
  const bounded = checkBoundedJson({ actions: a.actions, state });
  if (bounded) return { ok: false, code: bounded };
  return { ok: true, answer: { kind: "smartSim", pluginKey: a.pluginKey, pluginVersion: a.pluginVersion, actions: a.actions, state } };
}

export type SmartSimReplay<S = unknown, R = unknown, A = unknown> = { ok: true; actions: A[]; runtime: R; state: S } | { ok: false; code: string };
/** Replays bounded actions from the plugin's canonical initial runtime: the ONE way every surface derives state. Never throws. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function replaySmartSimActions<C, R, S, A>(plugin: SmartSimPlugin<C, R, S, A, any>, config: C, rawActions: readonly unknown[]): SmartSimReplay<S, R, A> {
  if (!Array.isArray(rawActions)) return { ok: false, code: "SMARTSIM_ANSWER_INVALID" };
  if (rawActions.length > Math.min(plugin.maxActions, SMART_SIM_LIMITS.actions)) return { ok: false, code: "SMARTSIM_ACTIONS_TOO_MANY" };
  try {
    const actions: A[] = [];
    for (const raw of rawActions) {
      if (checkBoundedJson(raw) !== undefined) return { ok: false, code: "SMARTSIM_ACTION_INVALID" };
      // Phase 20A.1 — a camera / view / pointer / wheel / hover / UI gesture is never an academic action, for every plugin
      if (isObj(raw) && isPresentationActionType(raw.type)) return { ok: false, code: "SMARTSIM_ACTION_PRESENTATION_ONLY" };
      const n = plugin.normalizeAction(raw, config);
      if (!n.ok) return { ok: false, code: "SMARTSIM_ACTION_INVALID" };
      actions.push(n.action);
    }
    const listCode = plugin.validateActions ? plugin.validateActions(actions, config) : undefined;
    if (listCode) return { ok: false, code: listCode };
    let runtime = plugin.createRuntime(config);
    for (const a of actions) runtime = plugin.applyAction(runtime, a, config);
    return { ok: true, actions, runtime, state: plugin.canonicalState(runtime, config) };
  } catch {
    return { ok: false, code: "SMARTSIM_REPLAY_FAILED" };
  }
}
/**
 * Binds an answer to the AUTHORITATIVE published question: smartSim@1 at a supported version, a VALID envelope, the SAME plugin
 * identity, valid actions; the stored state is RE-DERIVED by replay (the claimed state is discarded). Returns the canonical answer or
 * a precise refusal.
 */
export function bindSmartSimAnswerToQuestion(a: unknown, question: unknown): SmartSimAnswerResult {
  const base = normalizeSmartSimAnswer(a);
  if (!base.ok) return base;
  if (!isSmartSimNode(question) || smartSimQuestionVersion(question) === undefined) return { ok: false, code: "SMARTSIM_QUESTION_MISMATCH" };
  const env = validateSmartSimEnvelope(question.smartSim);
  if (!env.ok) return { ok: false, code: "SMARTSIM_QUESTION_INVALID" };
  if (base.answer.pluginKey !== env.envelope.pluginKey || base.answer.pluginVersion !== env.envelope.pluginVersion) return { ok: false, code: "SMARTSIM_PLUGIN_MISMATCH" };
  const r = replaySmartSimActions(env.plugin, env.envelope.config, base.answer.actions);
  if (!r.ok) return { ok: false, code: r.code };
  return { ok: true, answer: { kind: "smartSim", pluginKey: env.envelope.pluginKey, pluginVersion: env.envelope.pluginVersion, actions: r.actions, state: r.state } };
}
/** answered ⇔ at least one action (mirror: answerState.ts / api exam-structure.js). A reset simulation is unanswered. */
export const isSmartSimAnswerAnswered = (a: unknown): boolean => isObj(a) && a.kind === "smartSim" && Array.isArray(a.actions) && a.actions.length > 0;

// ── evaluation and scoring ────────────────────────────────────────────────────────────────────────────────────────────────────────
export type SmartSimCheckFact = { id: string; label: string; kind: string; expected: string; actual: string; passed: boolean; weight: number; points: number; maxPoints: number; evidence?: string[] };
export type SmartSimScore = { score: number; correct: boolean; manualReview: boolean; parts: { correct: number; total: number } };
export type SmartSimEvaluation = SmartSimScore & { valid: boolean; maxMarks: number; totalWeight: number; passedWeight: number; checks: SmartSimCheckFact[]; state?: unknown; details?: Record<string, unknown>; issues?: SmartSimIssue[] };
/** The fail-closed result: an INVALID authority yields no automatic academic mark and routes the question to manual review. */
export const SMART_SIM_FAIL_CLOSED: Readonly<SmartSimScore> = Object.freeze({ score: 0, correct: false, manualReview: true, parts: Object.freeze({ correct: 0, total: 0 }) });
export type SmartSimEvaluationInput = { envelope: unknown; answerKey: unknown; response: unknown; maxMarks: number };
const str = (v: unknown): string => (typeof v === "string" ? v : String(v));

/**
 * THE authoritative evaluation (server grader + teacher review). Validates the public envelope and the private key through the strict
 * authorities first (invalid ⇒ fail closed); then re-derives the state by replaying the response's actions (the response's `state`,
 * score or checks are never read), asks the plugin for FACTS per check and computes weighted points. `withDetails` adds the server-derived
 * state and the plugin's optional review details (e.g. per-device histories) for the teacher review.
 */
export function evaluateSmartSim(input: SmartSimEvaluationInput, options: { withDetails?: boolean } = {}): SmartSimEvaluation {
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  const closed = (issues: SmartSimIssue[]): SmartSimEvaluation => ({ ...SMART_SIM_FAIL_CLOSED, parts: { correct: 0, total: 0 }, valid: false, maxMarks: max, totalWeight: 0, passedWeight: 0, checks: [], issues });
  const env = validateSmartSimEnvelope(input.envelope);
  if (!env.ok) return closed(env.issues);
  const key = validateSmartSimAnswerKey(input.answerKey, env.plugin, env.envelope.config);
  if (!key.ok) return closed(key.issues);
  const total = key.key.checks.length;
  const zero = (): SmartSimEvaluation => ({ score: 0, correct: false, manualReview: false, parts: { correct: 0, total }, valid: true, maxMarks: max, totalWeight: key.key.totalWeight, passedWeight: 0, checks: [] });
  const base = normalizeSmartSimAnswer(input.response);
  if (!base.ok || base.answer.pluginKey !== env.envelope.pluginKey || base.answer.pluginVersion !== env.envelope.pluginVersion) return zero();
  const replay = replaySmartSimActions(env.plugin, env.envelope.config, base.answer.actions);
  if (!replay.ok) return zero();
  const checks: SmartSimCheckFact[] = [];
  let passedWeight = 0;
  try {
    let view: SmartSimRuleView | undefined;
    for (const c of key.key.checks) {
      let o: ReturnType<AnySmartSimPlugin["evaluateCheck"]>;
      if (isGenericRuleFor(env.plugin, c.kind)) {
        view = view ?? ruleViewOf(env.plugin, replay.state, env.envelope.config);
        if (!view) throw new Error("rule view unavailable");
        o = evaluateSmartSimRuleCheck(c as SmartSimRuleCheck, view);
      } else o = env.plugin.evaluateCheck(c, replay.state, env.envelope.config);
      const passed = o.passed === true;
      const maxPoints = key.key.totalWeight > 0 ? (max * c.weight) / key.key.totalWeight : 0;
      if (passed) passedWeight += c.weight;
      const fact: SmartSimCheckFact = { id: c.id, label: c.label, kind: c.kind, expected: str(o.expected), actual: str(o.actual), passed, weight: c.weight, points: passed ? maxPoints : 0, maxPoints };
      if (Array.isArray(o.evidence) && o.evidence.length) fact.evidence = o.evidence.slice(0, 8).map(str);
      checks.push(fact);
    }
  } catch {
    return closed([issue("SMARTSIM_EVALUATION_FAILED", "تعذّر تقييم الفحوص؛ السؤال بحاجة إلى تصحيح يدوي.")]);
  }
  const passedCount = checks.filter(c => c.passed).length;
  const all = passedCount === checks.length;
  const raw = key.key.scoring === "allOrNothing" ? (all ? max : 0) : key.key.totalWeight > 0 ? (max * passedWeight) / key.key.totalWeight : 0;
  const out: SmartSimEvaluation = { score: Math.min(max, Math.max(0, raw)), correct: all, manualReview: false, parts: { correct: passedCount, total }, valid: true, maxMarks: max, totalWeight: key.key.totalWeight, passedWeight, checks };
  if (options.withDetails) {
    out.state = replay.state;
    if (env.plugin.reviewDetails) { try { out.details = env.plugin.reviewDetails(replay.actions, env.envelope.config); } catch { /* details are evidence only */ } }
  }
  return out;
}
/** The grader's view of evaluateSmartSim: { score, correct, manualReview, parts }. */
export function scoreSmartSim(input: SmartSimEvaluationInput): SmartSimScore {
  const e = evaluateSmartSim(input);
  return { score: e.score, correct: e.correct, manualReview: e.manualReview, parts: { ...e.parts } };
}
