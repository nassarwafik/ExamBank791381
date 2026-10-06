// Phase 20A.1 — the GENERIC TRUSTED RULE library (pure; compiled into the shared server build).
//
// A SMALL set of universal grading patterns that many future SmartSim plugins share (an object is selected, a point is near a target,
// a value is within a tolerance, a set / an order of semantic ids). Every rule is CODE in this file, identified EXACTLY as
// "<kind>@<version>" (objectSelected@1 ≠ objectSelected@2), has a strict parameter validator (including reference checks against the
// plugin's neutral RULE VIEW) and a pure, deterministic evaluator that returns FACTS (expected / actual / passed / evidence) — the
// SmartSim core turns facts into marks with the teacher's weights. There is no expression language, no eval, no dynamic code, and no
// domain science: "is this network reachable", "is this equation balanced" stay in their plugins. Exam JSON can never add a rule, and a
// plugin can only use the rules its code-owned descriptor OPTS INTO (enforced by the core).
import { isPlainObject, isSemanticId, isSmartSimRelationKind } from "./trustedSimVocabulary";

/** The domain-neutral projection of a plugin's canonical state that generic rules read (a plugin provides it via `ruleView`). */
export type SmartSimRuleView = {
  /** Every addressable semantic id (references in rule parameters must be among these). */
  ids: readonly string[];
  selected: readonly string[];
  points: Readonly<Record<string, { x: number; y: number; z?: number }>>;
  values: Readonly<Record<string, number>>;
  sequence: readonly string[];
  relations: readonly { kind: string; from: string; to: string }[];
};
export type SmartSimRuleIssue = { code: string; message: string; path?: string };
export type SmartSimRuleOutcome = { expected: string; actual: string; passed: boolean; evidence?: string[] };
export type SmartSimRuleCheck = { id: string; label: string; weight: number; kind: string } & Record<string, unknown>;

export const SMART_SIM_RULE_LIMITS = Object.freeze({ ids: 500, tolerance: 1e6, magnitude: 1e9 });
const GENERIC_KEYS = ["id", "label", "weight", "kind"] as const;
type Params = Record<string, unknown>;
type Rule = {
  kind: string;
  version: number;
  params: readonly string[];
  /** Strict parameter check: returns a refusal code (PARAMS_INVALID / REFERENCE_UNKNOWN) or undefined. */
  validate(p: Params, view: SmartSimRuleView): "SMARTSIM_RULE_PARAMS_INVALID" | "SMARTSIM_RULE_REFERENCE_UNKNOWN" | undefined;
  evaluate(p: Params, view: SmartSimRuleView): SmartSimRuleOutcome;
};

const finite = (v: unknown, max: number = SMART_SIM_RULE_LIMITS.magnitude): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;
const tolerance = (v: unknown, allowZero: boolean): v is number => finite(v, SMART_SIM_RULE_LIMITS.tolerance) && (allowZero ? v >= 0 : v > 0);
const known = (view: SmartSimRuleView, id: unknown) => typeof id === "string" && view.ids.includes(id);
const fmt = (n: number) => String(n);
const PARAMS = "SMARTSIM_RULE_PARAMS_INVALID" as const, REF = "SMARTSIM_RULE_REFERENCE_UNKNOWN" as const;
function idList(v: unknown, view: SmartSimRuleView, min: number) {
  if (!Array.isArray(v) || v.length < min || v.length > SMART_SIM_RULE_LIMITS.ids || !v.every(isSemanticId) || new Set(v).size !== v.length) return PARAMS;
  return v.every(id => known(view, id)) ? undefined : REF;
}
function vector(v: unknown): v is { x: number; y: number; z?: number } {
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v).sort().join(",");
  return (keys === "x,y" || keys === "x,y,z") && finite(v.x) && finite(v.y) && (v.z === undefined || finite(v.z));
}
const showVector = (p: { x: number; y: number; z?: number }) => "(" + fmt(p.x) + ", " + fmt(p.y) + (p.z === undefined ? "" : ", " + fmt(p.z)) + ")";

const RULES: readonly Rule[] = Object.freeze([
  {
    kind: "objectSelected", version: 1, params: ["objectId"],
    validate: (p, view) => (!isSemanticId(p.objectId) ? PARAMS : known(view, p.objectId) ? undefined : REF),
    evaluate: (p, view) => { const on = view.selected.includes(p.objectId as string); return { expected: "selected", actual: on ? "selected" : "not selected", passed: on }; }
  },
  {
    kind: "objectNotSelected", version: 1, params: ["objectId"],
    validate: (p, view) => (!isSemanticId(p.objectId) ? PARAMS : known(view, p.objectId) ? undefined : REF),
    evaluate: (p, view) => { const on = view.selected.includes(p.objectId as string); return { expected: "not selected", actual: on ? "selected" : "not selected", passed: !on }; }
  },
  {
    kind: "setEquals", version: 1, params: ["expectedIds"],
    validate: (p, view) => idList(p.expectedIds, view, 0),
    evaluate: (p, view) => {
      const want = [...(p.expectedIds as string[])].sort(), got = [...new Set(view.selected)].sort();
      return { expected: want.join(", ") || "—", actual: got.join(", ") || "—", passed: want.length === got.length && want.every((id, i) => id === got[i]) };
    }
  },
  {
    kind: "orderEquals", version: 1, params: ["expectedIds"],
    validate: (p, view) => idList(p.expectedIds, view, 1),
    evaluate: (p, view) => {
      const want = p.expectedIds as string[], got = view.sequence;
      return { expected: want.join(" → "), actual: got.join(" → ") || "—", passed: want.length === got.length && want.every((id, i) => id === got[i]) };
    }
  },
  {
    kind: "numericNear", version: 1, params: ["valueId", "expected", "tolerance"],
    validate: (p, view) => (!isSemanticId(p.valueId) || !finite(p.expected) || !tolerance(p.tolerance, true) ? PARAMS : known(view, p.valueId) ? undefined : REF),
    evaluate: (p, view) => {
      const e = p.expected as number, tol = p.tolerance as number;
      const has = Object.prototype.hasOwnProperty.call(view.values, p.valueId as string);
      const v = has ? view.values[p.valueId as string] : undefined;
      const passed = typeof v === "number" && Number.isFinite(v) && Math.abs(v - e) <= tol;
      return { expected: fmt(e) + " ± " + fmt(tol), actual: typeof v === "number" ? fmt(v) : "—", passed };
    }
  },
  {
    kind: "pointNear", version: 1, params: ["pointId", "expected", "tolerance"],
    validate: (p, view) => (!isSemanticId(p.pointId) || !vector(p.expected) || !tolerance(p.tolerance, false) ? PARAMS : known(view, p.pointId) ? undefined : REF),
    evaluate: (p, view) => {
      const e = p.expected as { x: number; y: number; z?: number }, tol = p.tolerance as number;
      const has = Object.prototype.hasOwnProperty.call(view.points, p.pointId as string);
      const got = has ? view.points[p.pointId as string] : undefined;
      if (!got) return { expected: showVector(e) + " ± " + fmt(tol), actual: "—", passed: false };
      const sameDims = (e.z === undefined) === (got.z === undefined);
      const d = sameDims ? Math.hypot(got.x - e.x, got.y - e.y, (got.z ?? 0) - (e.z ?? 0)) : Infinity;
      return { expected: showVector(e) + " ± " + fmt(tol), actual: showVector(got), passed: sameDims && d <= tol, evidence: sameDims ? ["distance: " + fmt(Math.round(d * 1e6) / 1e6)] : ["dimension mismatch"] };
    }
  },
  {
    kind: "relationExists", version: 1, params: ["relation", "from", "to"],
    validate: (p, view) => (!isSmartSimRelationKind(p.relation) || !isSemanticId(p.from) || !isSemanticId(p.to) || p.from === p.to ? PARAMS : known(view, p.from) && known(view, p.to) ? undefined : REF),
    evaluate: (p, view) => {
      const on = view.relations.some(r => r.kind === p.relation && r.from === p.from && r.to === p.to);
      return { expected: String(p.relation) + ": " + String(p.from) + " → " + String(p.to), actual: on ? "present" : "absent", passed: on };
    }
  }
]);
const BY_ID: ReadonlyMap<string, Rule> = new Map(RULES.map(r => [r.kind + "@" + r.version, r]));

/** Syntactically a rule identity ("kind@version"); says nothing about whether it exists. */
export const isSmartSimRuleId = (v: unknown): v is string => typeof v === "string" && /^[a-z][A-Za-z0-9]{1,47}@[1-9][0-9]{0,3}$/.test(v);
/** The rule registered for EXACTLY this id ("pointNear@1"); undefined for anything else (no latest, no case folding). */
export function resolveSmartSimRule(id: unknown): { id: string; kind: string; version: number; params: readonly string[] } | undefined {
  if (!isSmartSimRuleId(id)) return undefined;
  const r = BY_ID.get(id);
  return r ? { id, kind: r.kind, version: r.version, params: r.params } : undefined;
}
/** Data-only listing (sorted by id) for the authoring catalog. */
export const listSmartSimRules = (): { id: string; kind: string; version: number; params: string[] }[] =>
  [...BY_ID.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([id, r]) => ({ id, kind: r.kind, version: r.version, params: [...r.params] }));

function isView(v: unknown): v is SmartSimRuleView {
  if (!isPlainObject(v)) return false;
  return Array.isArray(v.ids) && Array.isArray(v.selected) && isPlainObject(v.points) && isPlainObject(v.values) && Array.isArray(v.sequence) && Array.isArray(v.relations);
}
/** Validates a generic-rule check (generic keys + exactly the rule's parameters; references resolved against the view). */
export function validateSmartSimRuleCheck(raw: Record<string, unknown>, view: SmartSimRuleView): { ok: true; check: SmartSimRuleCheck } | { ok: false; issues: SmartSimRuleIssue[] } {
  const fail = (code: string, message: string) => ({ ok: false as const, issues: [{ code, message }] });
  if (!isView(view)) return fail("SMARTSIM_RULE_VIEW_INVALID", "لا يمكن التحقق من مراجع الفحص في هذه المحاكاة.");
  if (!isPlainObject(raw)) return fail("SMARTSIM_RULE_PARAMS_INVALID", "فحص غير صالح.");
  const r = isSmartSimRuleId(raw.kind) ? BY_ID.get(raw.kind) : undefined;
  if (!r) return fail("SMARTSIM_RULE_UNKNOWN", "قاعدة تصحيح غير معروفة: " + String(raw.kind));
  const allowed = new Set<string>([...GENERIC_KEYS, ...r.params]);
  const keys = Object.keys(raw);
  if (keys.some(k => !allowed.has(k)) || r.params.some(k => !Object.prototype.hasOwnProperty.call(raw, k))) return fail("SMARTSIM_RULE_PARAMS_INVALID", "معاملات القاعدة " + String(raw.kind) + " غير مطابقة.");
  const params: Params = {};
  for (const k of r.params) params[k] = raw[k];
  const code = r.validate(params, view);
  if (code) return fail(code, code === REF ? "يشير الفحص إلى عنصر غير موجود في المحاكاة." : "معاملات القاعدة " + String(raw.kind) + " غير صالحة.");
  const check: SmartSimRuleCheck = { id: raw.id as string, label: raw.label as string, weight: raw.weight as number, kind: raw.kind as string };
  for (const k of r.params) check[k] = clone(params[k]);
  return { ok: true, check };
}
/** Evaluates a VALIDATED generic-rule check on a rule view: facts only. */
export function evaluateSmartSimRuleCheck(check: SmartSimRuleCheck, view: SmartSimRuleView): SmartSimRuleOutcome {
  const r = BY_ID.get(check.kind);
  if (!r || !isView(view)) return { expected: "—", actual: "—", passed: false };
  const params: Params = {};
  for (const k of r.params) params[k] = check[k];
  return r.evaluate(params, view);
}
const clone = (v: unknown): unknown => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
