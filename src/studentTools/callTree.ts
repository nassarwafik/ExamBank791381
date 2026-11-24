import type { DsTrace, DsVal } from "../learning/activities/ds";

// Visual lab V8 (docs/enterprise-csharp-visual-lab-plan.md §17) — «شجرة الاستدعاءات»: every call of the recorded run, as a tree, at
// the step the player shows. Built ONLY from the recorder's own data (rich mode): each frame's `call` (the same call keeps its number
// from step to step) and the returning step's `ret`. Pure; nothing is guessed:
//   • a call appears from the first step that shows its frame, as a child of the frame just below it at that step;
//   • its arguments are its variables on that first step (the recorder starts a call with its parameters);
//   • at the step shown it is RUNNING (the top frame), WAITING (a frame under it) or DONE (no longer on the stack) — and a done call
//     shows the value it returned, when the recorder saw one (a void method returns none);
//   • a trace without call numbers (a course trace, or one recorded without rich) has no tree (null).
export type CallState = "running" | "waiting" | "done";
export type CallNode = { call: number; name: string; args: string[]; parent: number | null; children: number[]; ret?: string; state: CallState };
export type CallTree = { nodes: Map<number, CallNode>; roots: number[]; total: number; clipped: boolean };
export const CALL_TREE_MAX = 150;

const text = (v: DsVal): string => (v.t === "v" ? v.s : v.t === "null" ? "null" : v.t === "arr" ? "{" + v.items.join(", ") + "}" : "#" + v.id);

/** The call tree as it stands at step `at` (calls not started yet are absent). null when the trace has no call numbers. */
export function callTreeOf(trace: DsTrace, at: number): CallTree | null {
  if (!trace.steps.some(s => s.frames.some(f => f.call !== undefined))) return null;
  const nodes = new Map<number, CallNode>();
  const roots: number[] = [];
  let total = 0;
  const last = Math.max(0, Math.min(at, trace.steps.length - 1));
  for (let i = 0; i <= last; i++) {
    const step = trace.steps[i];
    step.frames.forEach((f, d) => {
      if (f.call === undefined || nodes.has(f.call)) return;
      total++;
      if (nodes.size >= CALL_TREE_MAX) return;
      const below = d > 0 ? step.frames[d - 1].call : undefined;
      const parent = below !== undefined && nodes.has(below) ? below : null;
      nodes.set(f.call, { call: f.call, name: f.name, args: f.vars.map(([, v]) => text(v)), parent, children: [], state: "done" });
      if (parent === null) roots.push(f.call); else nodes.get(parent)!.children.push(f.call);
    });
    const top = step.frames[step.frames.length - 1]?.call;
    if (step.ret !== undefined && top !== undefined && nodes.has(top)) nodes.get(top)!.ret = step.ret;
  }
  const shown = trace.steps[last].frames;
  shown.forEach((f, d) => {
    const n = f.call !== undefined ? nodes.get(f.call) : undefined;
    if (n) n.state = d === shown.length - 1 ? "running" : "waiting";
  });
  return { nodes, roots, total, clipped: total > nodes.size };
}

/** The label of a call as C# writes it: Fib(3) · Sum(5, 2). */
export const callLabel = (n: CallNode) => n.name + "(" + n.args.join(", ") + ")";

/** Columns and rows for drawing: leaves in the order the calls started, each parent centred over its children. Pure. */
export function layoutCalls(tree: CallTree): Map<number, { x: number; depth: number }> {
  const at = new Map<number, { x: number; depth: number }>();
  let next = 0;
  const walk = (id: number, depth: number): number => {
    const n = tree.nodes.get(id)!;
    if (depth > 60) { at.set(id, { x: next, depth }); return next++; }
    if (!n.children.length) { at.set(id, { x: next, depth }); return next++; }
    const xs = n.children.map(c => walk(c, depth + 1));
    const x = (xs[0] + xs[xs.length - 1]) / 2;
    at.set(id, { x, depth });
    return x;
  };
  for (const r of tree.roots) walk(r, 0);
  return at;
}
