// Phase T8 — the attempt's count of tool openings, kept by the exam page and sent with every save / pause / submit
// (docs/enterprise-student-tools-t.md §15). Pure helpers; the server normalizes, merges and stores the record.
//
// The count is CUMULATIVE for the attempt and the server keeps the larger of what it holds and what it receives, so a retried or
// duplicated request changes nothing. After a reload (or on a second device) the page resumes from the server's counts.

export type ToolUsageCounts = Readonly<Record<string, number>>;
export const TOOL_USAGE_MAX_OPENS = 999;

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** One more opening of `id` (bounded). Returns a new object. */
export function bumpToolUsage(counts: ToolUsageCounts, id: string): ToolUsageCounts {
  const before = own(counts, id) ? counts[id] : 0;
  const next: Record<string, number> = { ...counts };
  Object.defineProperty(next, id, { value: Math.min(before + 1, TOOL_USAGE_MAX_OPENS), enumerable: true, writable: true, configurable: true });
  return next;
}

/** The counts the server reports for the draft (`state.draftToolUsage`), as a clean map (anything malformed is dropped). */
export function serverToolUsage(raw: unknown): ToolUsageCounts {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const k of Object.keys(raw)) {
    const n = (raw as Record<string, unknown>)[k];
    if (typeof n === "number" && Number.isInteger(n) && n >= 1) Object.defineProperty(out, k, { value: Math.min(n, TOOL_USAGE_MAX_OPENS), enumerable: true, writable: true, configurable: true });
  }
  return out;
}

/** The larger count per tool (local openings since the last load never fall below what the server already holds). */
export function maxToolUsage(a: ToolUsageCounts, b: ToolUsageCounts): ToolUsageCounts {
  const out: Record<string, number> = { ...a };
  for (const k of Object.keys(b)) if (!own(out, k) || b[k] > out[k]) Object.defineProperty(out, k, { value: b[k], enumerable: true, writable: true, configurable: true });
  return out;
}

/** The request field: absent while nothing was opened, so a request of an attempt without tool use is the historical body. */
export function toolUsageRequestField(counts: ToolUsageCounts): { toolUsage?: Record<string, number> } {
  return Object.keys(counts).length ? { toolUsage: { ...counts } } : {};
}
