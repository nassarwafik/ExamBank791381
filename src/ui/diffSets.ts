// Tadris+ P4-A — the pure comparison behind DiffView (kept apart: a component module exports components only).
export type DiffResult = { added: string[]; removed: string[] };

/** The ids `after` adds to `before`, and the ids it removes, each in the order they appear. */
export function diffSets(before: readonly string[], after: readonly string[]): DiffResult {
  const b = new Set(before), a = new Set(after);
  return { added: after.filter(x => !b.has(x)), removed: before.filter(x => !a.has(x)) };
}
