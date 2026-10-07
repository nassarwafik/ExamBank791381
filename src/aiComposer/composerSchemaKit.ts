// Phase 20F — tiny helpers for the STRICT provider schemas (strict json_schema mode: every object closed, every property required,
// optionality only through `null`) and for re-checking an AI value locally. Provider-side schema validation is never trusted alone: every
// normalizer below re-checks the exact shape with these guards (prototype-sensitive keys refused, bounded strings / numbers / arrays).
export type JsonSchema = Record<string, unknown>;
export const sStr = (): JsonSchema => ({ type: "string" });
export const sEnum = (values: readonly string[]): JsonSchema => ({ type: "string", enum: [...values] });
export const sInt = (min: number, max: number): JsonSchema => ({ type: "integer", minimum: min, maximum: max });
export const sNum = (): JsonSchema => ({ type: "number" });
export const sBool = (): JsonSchema => ({ type: "boolean" });
export const sArr = (items: JsonSchema, maxItems: number): JsonSchema => ({ type: "array", items, maxItems });
export const sObj = (properties: Record<string, JsonSchema>): JsonSchema => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
export const sNull = (schema: JsonSchema): JsonSchema => ({ anyOf: [{ type: "null" }, schema] });

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
export const isPlainRecord = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};
/** Exact key set (every listed key present, nothing else, no prototype-sensitive own key). */
export function hasExactKeys(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  if (!isPlainRecord(v)) return false;
  const own = Object.keys(v);
  if (own.some(k => FORBIDDEN_KEYS.has(k))) return false;
  if (Object.prototype.hasOwnProperty.call(v, "__proto__")) return false;
  return own.length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
}
/** Subset key set (only listed keys; for client-side request bodies with optional fields). */
export function hasOnlyKeys(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  if (!isPlainRecord(v)) return false;
  if (Object.prototype.hasOwnProperty.call(v, "__proto__")) return false;
  return Object.keys(v).every(k => keys.includes(k) && !FORBIDDEN_KEYS.has(k));
}
// eslint-disable-next-line no-control-regex
export const isStr = (v: unknown, max: number, min = 0): v is string => typeof v === "string" && v.length >= min && v.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v);
export const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
export const isNum = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export const isEnum = <T extends string>(v: unknown, values: readonly T[]): v is T => typeof v === "string" && (values as readonly string[]).includes(v);
export const isArr = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max;
/** Removes control characters (except tab / newline) — the deterministic, meaning-preserving whitespace normalization. */
// eslint-disable-next-line no-control-regex
export const cleanText = (s: string): string => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
/** Bounded byte size of a JSON value (refuses cyclic / non-serializable input). */
export function jsonBytes(v: unknown): number {
  let s: string;
  try { s = JSON.stringify(v) ?? ""; } catch { return Number.POSITIVE_INFINITY; }
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; } else n += 3;
  }
  return n;
}
