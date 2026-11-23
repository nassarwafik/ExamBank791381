import type { DsStep, DsTrace } from "./ds";
import type { DrawMotion } from "./DsDraw";

// Visual lab V4 (docs/enterprise-csharp-visual-lab-plan.md §12) — WHAT MOVED between two steps of a recorded run, for the teacher's
// player (src/studentTools/LabTraceView.tsx). Pure: no React, no timers. Objects are followed by their id (stable for the whole
// trace — the recorder's contract, proven by tools/csharp-lab/golden.mjs).
//   • a stack that gained ONE item on top (the rest unchanged) → it entered from the top; lost its top → that item leaves upward;
//   • a queue that gained ONE item at its tail → it entered from the end; lost its head → that item leaves at the start;
//   • a chain cell / tree node that did not exist one step before → it appears.
// Anything else (several changes at once, a stack rebuilt) moves nothing: the drawing simply shows the new state.

/** The player's auto-play speeds: milliseconds per step. */
export const PLAY_SPEEDS = { slow: 1400, normal: 800, fast: 350 } as const;

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Per stack / queue id: what entered or left from `prev` to `cur` (only ONE push / pop / insert / remove is animated). */
export function motionOf(prev: DsStep | undefined, cur: DsStep): Map<number, DrawMotion> {
  const out = new Map<number, DrawMotion>();
  if (!prev) return out;
  const before = new Map(prev.objs.map(o => [o.id, o]));
  for (const o of cur.objs) {
    if (o.k !== "stack" && o.k !== "queue") continue;
    const p = before.get(o.id);
    if (!p || p.k !== o.k) continue;
    const a = p.items, b = o.items;
    if (o.k === "stack") {
      if (b.length === a.length + 1 && same(b.slice(1), a)) out.set(o.id, { enter: true });
      else if (b.length === a.length - 1 && same(b, a.slice(1))) out.set(o.id, { leaving: a[0] });
    } else {
      if (b.length === a.length + 1 && same(b.slice(0, -1), a)) out.set(o.id, { enter: true });
      else if (b.length === a.length - 1 && same(b, a.slice(1))) out.set(o.id, { leaving: a[0] });
    }
  }
  return out;
}

/** Chain cells / tree nodes that appear in `cur` and did not exist in `prev`. */
export function freshOf(prev: DsStep | undefined, cur: DsStep): Set<number> {
  if (!prev) return new Set();
  const had = new Set(prev.objs.map(o => o.id));
  return new Set(cur.objs.filter(o => (o.k === "node" || o.k === "bin") && !had.has(o.id)).map(o => o.id));
}

/** «عمليات المباني فقط»: the steps where a structure changed (always the first and the last step). */
export function structureSteps(trace: DsTrace): number[] {
  const out: number[] = [];
  trace.steps.forEach((s, i) => {
    if (i === 0 || i === trace.steps.length - 1 || JSON.stringify(s.objs) !== JSON.stringify(trace.steps[i - 1].objs)) out.push(i);
  });
  return out;
}

/** A stop of the player: a breakpoint on the step's line, or the writer's own Viz.Pause() (V4 part 2). */
export const isStop = (s: DsStep, breakpoints: ReadonlySet<number>) => breakpoints.has(s.line) || s.pause === true;

/** The next step after `from` (within `allowed`, if given) that is a stop; null when none. */
export function nextBreak(trace: DsTrace, from: number, breakpoints: ReadonlySet<number>, allowed?: number[]): number | null {
  const pool = allowed ?? trace.steps.map((_, i) => i);
  for (const i of pool) if (i > from && isStop(trace.steps[i], breakpoints)) return i;
  return null;
}

/** «توقّع قبل أن ترى»: a step whose structures changed from the step before (the class predicts it before it is shown). */
export const changesStructures = (trace: DsTrace, i: number) => i > 0 && JSON.stringify(trace.steps[i].objs) !== JSON.stringify(trace.steps[i - 1].objs);
