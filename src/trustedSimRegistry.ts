// Phase 20A — the TRUSTED SmartSim plugin registry (pure; compiled into the shared server build).
//
// smartSim@1 is ONE question type whose behaviour is supplied by repository-owned, deterministic PLUGINS. A plugin is CODE: it is
// registered here at module level by the repository (src/trustedSimPlugins.ts lists the production set) and resolved by its EXACT
// identity (pluginKey, pluginVersion). Persisted exam data only NAMES an identity — it can never carry a module, a path, a function or
// a grader, and an identity nobody registered resolves to nothing (fail closed, never "latest", never another plugin). A new version
// is ADDITIVE: a published question stays bound to the version it names forever.
//
// This is the opposite of the legacy simulation@1 type (src/smartsim/*): there, a TEACHER-UPLOADED package runs inside a sandboxed
// iframe, reports opaque state and never grades. Nothing here loads, fetches or executes uploaded code.
//
// The plugin contract separates the pure AUTHORITY (validation, replay, canonical state, objective checks) from presentation: React
// components live in src/trustedSim/smartSimUiRegistry.ts, never here.

/** Hard bounds shared by every plugin (a plugin may be stricter, never looser). */
export const SMART_SIM_LIMITS = Object.freeze({ actions: 1000, answerBytes: 262144, depth: 8, checks: 100, checkLabelChars: 120, maxWeight: 1000, keysPerObject: 64 });
const KEY_PATTERN = /^[a-z][A-Za-z0-9]{1,47}$/;
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

export type SmartSimIssue = { code: string; message: string; path?: string };
export type SmartSimResult<T> = { ok: true; value: T } | { ok: false; issues: SmartSimIssue[] };
/** The generic, plugin-independent part of every PRIVATE grading check. */
export type SmartSimCheckBase = { id: string; label: string; weight: number; kind: string };
/** One evaluated check: plugin FACTS only (the score is computed by the core from weights). */
export type SmartSimCheckOutcome = { expected: string; actual: string; passed: boolean; evidence?: string[] };

/**
 * A trusted SmartSim plugin. Every function is PURE and deterministic (no I/O, timers, randomness or dynamic code) and must never
 * mutate its inputs: the client renderer, the server ingest, the authoritative grader and the teacher review all call the SAME code.
 *   C config (public, canonical) · R runtime (replay state incl. navigation, e.g. CLI modes) · S canonical graded state · A action · K check
 */
export type SmartSimPlugin<C = unknown, R = unknown, S = unknown, A = unknown, K extends SmartSimCheckBase = SmartSimCheckBase> = {
  key: string;
  version: number;
  label: string;
  /** Maximum number of actions in one answer (≤ SMART_SIM_LIMITS.actions). */
  maxActions: number;
  /** Every check kind this plugin evaluates; anything else is refused. */
  checkKinds: readonly string[];
  /** STRICT public configuration authority: canonical config, or issues (never a repair). */
  validateConfig(raw: unknown): { ok: true; config: C } | { ok: false; issues: SmartSimIssue[] };
  createRuntime(config: C): R;
  /** Strict semantic action shape (exact keys, references into the config); a refused action is never applied. */
  normalizeAction(raw: unknown, config: C): { ok: true; action: A } | { ok: false; code: string };
  /** Optional whole-list bounds (e.g. per-device command caps); returns a refusal code or undefined. */
  validateActions?(actions: readonly A[], config: C): string | undefined;
  applyAction(runtime: R, action: A, config: C): R;
  canonicalState(runtime: R, config: C): S;
  serializeState(state: S): string;
  /** Validates the plugin-specific parameters of a check (the raw object carries the generic keys too). */
  validateCheck(raw: Record<string, unknown>, config: C): { ok: true; check: K } | { ok: false; issues: SmartSimIssue[] };
  evaluateCheck(check: K, state: S, config: C): SmartSimCheckOutcome;
  /** Optional teacher-review evidence derived from the (normalized) actions, e.g. per-device command histories. Never grading input. */
  reviewDetails?(actions: readonly A[], config: C): Record<string, unknown>;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySmartSimPlugin = SmartSimPlugin<any, any, any, any, any>;

export const smartSimPluginId = (key: string, version: number): string => key + "@" + version;
const plugins = new Map<string, AnySmartSimPlugin>();
const FUNCTIONS = ["validateConfig", "createRuntime", "normalizeAction", "applyAction", "canonicalState", "serializeState", "validateCheck", "evaluateCheck"] as const;

/** Registers a CODE-OWNED plugin. Refuses duplicates, malformed identities and incomplete implementations. Returns the unregister function. */
export function registerSmartSimPlugin(plugin: AnySmartSimPlugin): () => void {
  if (!plugin || typeof plugin !== "object") throw new Error("smartSim plugin required");
  const { key, version } = plugin;
  if (typeof key !== "string" || !KEY_PATTERN.test(key) || FORBIDDEN_KEYS.has(key)) throw new Error("invalid smartSim plugin key: " + String(key));
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) throw new Error("invalid smartSim plugin version for " + key);
  for (const f of FUNCTIONS) if (typeof plugin[f] !== "function") throw new Error("smartSim plugin " + key + "@" + version + ": " + f + " must be a function");
  for (const f of ["validateActions", "reviewDetails"] as const) if (plugin[f] !== undefined && typeof plugin[f] !== "function") throw new Error("smartSim plugin " + key + "@" + version + ": " + f + " must be a function");
  if (typeof plugin.label !== "string" || !plugin.label.trim()) throw new Error("smartSim plugin " + key + "@" + version + ": label required");
  if (!Number.isInteger(plugin.maxActions) || plugin.maxActions < 1 || plugin.maxActions > SMART_SIM_LIMITS.actions) throw new Error("smartSim plugin " + key + "@" + version + ": maxActions must be 1.." + SMART_SIM_LIMITS.actions);
  if (!Array.isArray(plugin.checkKinds) || plugin.checkKinds.length === 0 || plugin.checkKinds.some(k => typeof k !== "string" || !k)) throw new Error("smartSim plugin " + key + "@" + version + ": checkKinds required");
  const id = smartSimPluginId(key, version);
  if (plugins.has(id)) throw new Error("smartSim plugin already registered: " + id);
  plugins.set(id, plugin);
  return () => { if (plugins.get(id) === plugin) plugins.delete(id); };
}
/** The plugin registered for EXACTLY (key, version); undefined for anything else (no case folding, no coercion, no fallback). */
export function resolveSmartSimPlugin(key: unknown, version: unknown): AnySmartSimPlugin | undefined {
  if (typeof key !== "string" || typeof version !== "number" || !Number.isInteger(version)) return undefined;
  return plugins.get(smartSimPluginId(key, version));
}
export const listSmartSimPlugins = (): { key: string; version: number; label: string }[] => [...plugins.values()].map(p => ({ key: p.key, version: p.version, label: p.label }));

/**
 * The bounded-JSON guard for untrusted student payloads: plain data only (objects, arrays, strings, finite numbers, booleans, null),
 * no prototype-sensitive keys at any depth, bounded depth / keys / serialized size. Returns a refusal code, or undefined when valid.
 */
export function checkBoundedJson(value: unknown): string | undefined {
  let failure: string | undefined;
  const walk = (v: unknown, depth: number): void => {
    if (failure) return;
    if (depth > SMART_SIM_LIMITS.depth) { failure = "SMARTSIM_JSON_TOO_DEEP"; return; }
    if (v === null || typeof v === "string" || typeof v === "boolean") return;
    if (typeof v === "number") { if (!Number.isFinite(v)) failure = "SMARTSIM_JSON_INVALID"; return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (typeof v !== "object" || Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) { failure = "SMARTSIM_JSON_INVALID"; return; }
    const keys = Object.keys(v as object);
    if (keys.length > SMART_SIM_LIMITS.keysPerObject) { failure = "SMARTSIM_JSON_INVALID"; return; }
    for (const k of keys) { if (FORBIDDEN_KEYS.has(k)) { failure = "SMARTSIM_JSON_INVALID"; return; } walk((v as Record<string, unknown>)[k], depth + 1); }
  };
  walk(value, 0);
  if (failure) return failure;
  let text: string;
  try { text = JSON.stringify(value); } catch { return "SMARTSIM_JSON_INVALID"; }
  return typeof text !== "string" || utf8Length(text) > SMART_SIM_LIMITS.answerBytes ? "SMARTSIM_ANSWER_TOO_LARGE" : undefined;
}
/** UTF-8 byte length of a string (the bound is on bytes stored, not UTF-16 code units). */
function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) { n += 4; i++; }
    else n += 3;
  }
  return n;
}
export const isForbiddenKey = (k: string): boolean => FORBIDDEN_KEYS.has(k);
