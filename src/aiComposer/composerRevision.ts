// Phase 20F — the exam REVISION fingerprint for stale-patch protection. A deterministic, order-independent (sorted keys) content hash of
// the exam the AI was given; the save timestamps are excluded (saving does not change content). Pure and identical on the server (which
// stamps a patch with the revision of the exam it received) and in the Builder (which refuses to apply a patch whose base revision is not
// the revision of the exam currently open). Not a security hash: two 32-bit FNV-1a lanes → 16 hex chars, collision-resistant enough to
// detect any concurrent edit; the apply step also re-validates everything.
const VOLATILE = new Set(["updatedAt", "createdAt"]);
export function stableStringify(v: unknown, depth = 0): string {
  if (depth > 200) throw new Error("exam too deep");
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return "[" + v.map(x => stableStringify(x === undefined ? null : x, depth + 1)).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).filter(k => o[k] !== undefined && !(depth === 0 && VOLATILE.has(k))).sort().map(k => JSON.stringify(k) + ":" + stableStringify(o[k], depth + 1)).join(",") + "}";
}
function fnv1a(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function examRevision(exam: unknown): string {
  const s = stableStringify(exam);
  return "rev1-" + fnv1a(s, 0x811c9dc5).toString(16).padStart(8, "0") + fnv1a(s, 0x01234567 ^ s.length).toString(16).padStart(8, "0");
}
export const isRevision = (v: unknown): v is string => typeof v === "string" && /^rev1-[0-9a-f]{16}$/.test(v);
