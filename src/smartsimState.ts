// Phase 16B-A — the simulation ANSWER STATE contract (pure; compiled into the shared server build). A simulator reports an
// opaque JSON state; the platform stores it as `{ kind: "simulation", state }`. The state must be bounded, JSON-safe data:
// finite numbers, bounded depth, bounded serialized size, no functions / cycles / prototype-pollution keys. The same
// normalizer runs in the sandbox host (before an Answer is emitted) and on the server (before a draft is stored).
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const SIMULATION_STATE_MAX_BYTES = 65536;
export const SIMULATION_STATE_MAX_DEPTH = 32;
export const SIMULATION_STATE_FORBIDDEN_KEYS: readonly string[] = Object.freeze(["__proto__", "constructor", "prototype"]);
export type SimulationStateCode = "STATE_TOO_LARGE" | "STATE_NOT_JSON" | "STATE_TOO_DEEP" | "STATE_FORBIDDEN_KEY" | "STATE_NON_FINITE" | "STATE_CYCLE";
export type SimulationStateResult = { ok: true; state: JsonValue; bytes: number } | { ok: false; code: SimulationStateCode };

class StateError extends Error { code: SimulationStateCode; constructor(code: SimulationStateCode) { super(code); this.code = code; } }

function copy(value: unknown, depth: number, seen: Set<object>): JsonValue {
  if (value === null) return null;
  const t = typeof value;
  if (t === "string" || t === "boolean") return value as JsonValue;
  if (t === "number") { if (!Number.isFinite(value)) throw new StateError("STATE_NON_FINITE"); return value as number; }
  if (t !== "object") throw new StateError("STATE_NOT_JSON");                                  // function / symbol / bigint / undefined
  if (depth > SIMULATION_STATE_MAX_DEPTH) throw new StateError("STATE_TOO_DEEP");
  const obj = value as object;
  if (seen.has(obj)) throw new StateError("STATE_CYCLE");
  seen.add(obj);
  try {
    if (Array.isArray(obj)) return obj.map(v => (v === undefined ? null : copy(v, depth + 1, seen)));
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) throw new StateError("STATE_NOT_JSON");      // Date / Map / DOM nodes / class instances
    const out: { [key: string]: JsonValue } = {};
    for (const k of Object.keys(obj)) {
      if (SIMULATION_STATE_FORBIDDEN_KEYS.includes(k)) throw new StateError("STATE_FORBIDDEN_KEY");
      const v = (obj as Record<string, unknown>)[k];
      if (v === undefined) continue;
      out[k] = copy(v, depth + 1, seen);
    }
    return out;
  } finally { seen.delete(obj); }
}

/** Deep-copies `value` into plain JSON data or refuses it with ONE code. Never throws. */
export function normalizeSimulationState(value: unknown): SimulationStateResult {
  try {
    if (value === undefined) throw new StateError("STATE_NOT_JSON");
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "__proto__")) throw new StateError("STATE_FORBIDDEN_KEY");
    const state = copy(value, 0, new Set());
    const bytes = utf8Length(JSON.stringify(state));
    if (bytes > SIMULATION_STATE_MAX_BYTES) return { ok: false, code: "STATE_TOO_LARGE" };
    return { ok: true, state, bytes };
  } catch (e) {
    return { ok: false, code: e instanceof StateError ? e.code : "STATE_NOT_JSON" };
  }
}
function utf8Length(s: string): number { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdbff ? (i++, 4) : 3; } return n; }

/** Answered ⇔ the state is a non-empty object / array, or a primitive that is not null / empty string. Fail closed. */
export function isSimulationStateAnswered(state: unknown): boolean {
  if (state === null || state === undefined) return false;
  if (Array.isArray(state)) return state.length > 0;
  if (typeof state === "object") return Object.keys(state as object).length > 0;
  if (typeof state === "string") return state.trim() !== "";
  return typeof state === "number" ? Number.isFinite(state) : typeof state === "boolean";
}
