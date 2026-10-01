// Phase 17A — pure list operations for coding test cases (public samples and hidden tests). A test's identity is its STABLE
// `id`, never its array index: reorder / duplicate / edit / delete keep every surviving id byte-for-byte, so a future
// result (CodingTestResult.testId) and a teacher's weights always refer to the same case.
type WithId = { id: string };

export function moveCodingTest<T extends WithId>(list: T[], id: string, delta: number): T[] {
  const from = list.findIndex(t => t.id === id), to = from + delta;
  if (from < 0 || to < 0 || to >= list.length || delta === 0) return list;
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}
export function duplicateCodingTest<T extends WithId>(list: T[], id: string, newId: () => string): T[] {
  const i = list.findIndex(t => t.id === id);
  if (i < 0) return list;
  const copy = list.slice();
  copy.splice(i + 1, 0, { ...list[i], id: newId() });
  return copy;
}
export const updateCodingTest = <T extends WithId>(list: T[], id: string, patch: Partial<Omit<T, "id">>): T[] => list.map(t => (t.id === id ? { ...t, ...patch, id: t.id } : t));
export const removeCodingTest = <T extends WithId>(list: T[], id: string): T[] => list.filter(t => t.id !== id);
/** A fresh stable id (never derived from the position). */
export const newCodingTestId = (prefix: "pub" | "hid"): string => prefix + "-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
