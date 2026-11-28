import { useSyncExternalStore } from "react";
import type { AutomatonKind, LabDraft } from "./automataLab";

/**
 * AUTO-A7 (docs/enterprise-automata-lab-a4.md §10) — «افتح في مختبر الآلات»: a book's «صمّم الآلة» activity hands a COPY of the learner's
 * machine to the tool bar's automata lab, on the same page.
 *   • The book reader's tool bar (CourseToolDock → StudentToolDock with `labHandoff`) PROVIDES the opener while its tool set holds the
 *     automata lab; it names the kinds that lab allows. An exam's tool bar never provides one: an exam has no such bridge.
 *   • The activity offers the button only while an opener exists for its machine's kind.
 * Nothing leaves the page: no storage, no network. The lab works on its own copy; the activity's machine (the one «تحقّق» sends) does
 * not change. This module holds no lab code, so the activity's chunk does not grow with it.
 */
export type LabOpener = { kinds: readonly AutomatonKind[]; open: (draft: LabDraft) => void };

let current: LabOpener | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Provides the opener; the returned function withdraws it (only if it is still the current one). */
export function provideLabOpener(opener: LabOpener): () => void {
  current = opener;
  notify();
  return () => { if (current === opener) { current = null; notify(); } };
}

/** The opener for a machine of this kind, or null (no lab on this page, or the lab does not allow that kind). */
export function useLabOpener(kind: AutomatonKind): ((draft: LabDraft) => void) | null {
  const o = useSyncExternalStore(subscribe, () => current, () => null);
  return o && o.kinds.includes(kind) ? o.open : null;
}

/** A deep copy of a draft (the lab and the activity never share arrays). */
export function copyDraft(d: LabDraft): LabDraft {
  const cells: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(d.cells)) cells[k] = [...v];
  const layout = d.layout ? Object.fromEntries(Object.entries(d.layout).map(([q, c]) => [q, [c[0], c[1]] as [number, number]])) : undefined;
  return {
    ...d, alphabet: [...d.alphabet], states: [...d.states], accept: [...d.accept], labels: { ...d.labels }, cells,
    pda: d.pda.map(r => ({ ...r })), tm: d.tm.map(r => ({ ...r })), ...(layout ? { layout } : {}), ...(d.bends ? { bends: { ...d.bends } } : {}),
  };
}
