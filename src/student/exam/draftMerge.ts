// QA-8 — merge after a refused stale draft write (409 DRAFT_STALE): the same attempt is open on another device or tab, which
// saved since this page's draft base. The merged draft starts from the SERVER's newer draft and re-applies only the questions
// THIS page actually changed since its base (an edit replaces the server value, a cleared answer removes it). Questions this
// page never touched keep the other device's answers. A question both pages changed takes this page's value — the student is
// looking at it now. Pure: never mutates its inputs.

const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
};

export function mergeStaleDraft<T>(base: Record<string, T>, local: Record<string, T>, server: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = { ...server };
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(local || {})]);
  for (const key of keys) {
    const inLocal = Object.prototype.hasOwnProperty.call(local || {}, key);
    const inBase = Object.prototype.hasOwnProperty.call(base || {}, key);
    if (inLocal === inBase && (!inLocal || same(base[key], local[key]))) continue;   // untouched here
    if (inLocal) out[key] = local[key]; else delete out[key];
  }
  return out;
}
