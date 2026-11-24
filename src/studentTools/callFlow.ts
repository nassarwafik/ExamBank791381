import type { DsCallSite, DsPass, DsStep, DsTrace, DsVal } from "../learning/activities/ds";

/**
 * Visual lab V12 (docs/enterprise-csharp-visual-lab-plan.md §22) — «العمليات والدوال» drawn: the frames of the methods running now,
 * how each got its parameters, and what a returning method gives back. Pure: no React, nothing executed. Rich traces only.
 *
 * Which call made a frame: the frame's `from` (the caller's line, recorded) and the trace's call sites (`calls`, from the compiler's
 * own view of the program: each call's line and statement line, and per parameter how it is passed and the argument as written). A
 * frame matches the sites of its method on that line; two DIFFERENT calls of the same method on one line (Max(Max(a, b), c)) cannot
 * be told apart, so that frame shows no site and no arrow rather than a guess.
 *
 * Links (drawn as arrows): a `ref` / `out` / `in` parameter IS the caller's variable («alias»: the caller's box changes with it); a
 * parameter passed by value whose argument is a variable got a COPY of it («copy»). An argument that is an expression (5, n - 1) is
 * written beside the parameter. Bounded: the newest FLOW_FRAMES frames; older ones are counted (`hidden`).
 */
export const FLOW_FRAMES = 8;
export type FlowVar = { name: string; text: string; changed: boolean; param?: { kind: DsPass; arg: string; v: string | null } };
export type FlowFrame = { index: number; name: string; running: boolean; from: number | null; site: string | null; vars: FlowVar[] };
export type FlowLink = { kind: "alias" | "copy"; callee: { frame: number; name: string }; caller: { frame: number; name: string } };
export type FlowReturn = { from: number; to: number; value: string; site: string | null };
export type CallFlow = { frames: FlowFrame[]; links: FlowLink[]; returning: FlowReturn | null; hidden: number };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The call site of the frame that `from` (the caller's line) and `name` give — null when none, or when two differ (a guess). */
export function siteOf(calls: DsCallSite[] | undefined, name: string, from: number | undefined): DsCallSite | null {
  if (!calls || !from) return null;
  const found = calls.filter(c => c.name === name && (c.line === from || c.stmt === from));
  if (!found.length) return null;
  return found.every(c => same(c.params, found[0].params)) ? found[0] : null;
}
/** How a site reads: Max(a, 5) · Swap(ref a, ref b) · Split(42, out int t). */
export const siteText = (s: DsCallSite) => s.name + "(" + s.params.map(p => (p.kind === "value" ? "" : p.kind + " ") + p.arg).join(", ") + ")";

/** The call flow of `step` (null while only the first method runs). `text` writes a value as the trace view does. */
export function callFlowOf(step: DsStep, prev: DsStep | undefined, trace: Pick<DsTrace, "calls">, text: (v: DsVal) => string): CallFlow | null {
  const all = step.frames;
  if (all.length < 2) return null;
  const first = Math.max(0, all.length - FLOW_FRAMES);
  const frames: FlowFrame[] = [];
  const links: FlowLink[] = [];
  for (let i = all.length - 1; i >= first; i--) {
    const f = all[i];
    const site = i > 0 ? siteOf(trace.calls, f.name, f.from) : null;
    const params = new Map((site?.params ?? []).map(p => [p.name, p]));
    const was = prev?.frames[i]?.name === f.name && prev.frames[i].call === f.call ? new Map(prev.frames[i].vars) : undefined;
    const vars: FlowVar[] = f.vars.map(([name, v]) => {
      const p = params.get(name);
      return { name, text: text(v), changed: !!was && !same(was.get(name), v), ...(p ? { param: { kind: p.kind, arg: p.arg, v: p.v } } : {}) };
    });
    // a link only to a variable the caller shows now (an `out int t` declared in the call appears there once written)
    if (site && i > 0) {
      const callerVars = new Set(all[i - 1].vars.map(([n]) => n));
      for (const p of site.params) {
        if (!p.v || !callerVars.has(p.v) || !f.vars.some(([n]) => n === p.name)) continue;
        links.push({ kind: p.kind === "value" ? "copy" : "alias", callee: { frame: i, name: p.name }, caller: { frame: i - 1, name: p.v } });
      }
    }
    frames.push({ index: i, name: f.name, running: i === all.length - 1, from: i > 0 ? f.from ?? null : null, site: site ? siteText(site) : null, vars });
  }
  const top = all.length - 1;
  const returning: FlowReturn | null = step.ret !== undefined
    ? { from: top, to: top - 1, value: step.ret, site: frames[0].site }
    : null;
  return { frames, links: links.filter(l => l.caller.frame >= first), returning, hidden: first };
}

const KIND: Record<DsPass, string> = { value: "نسخة", ref: "ref", out: "out", in: "in" };
/** The call flow in words (the drawing's screen-reader sentence). */
export function flowSentence(flow: CallFlow, names: (i: number) => string): string {
  const parts = ["مكدّس الاستدعاءات، من الدالة الجارية إلى من استدعاها."];
  for (const f of flow.frames) {
    const head = f.name + (f.running ? " (تعمل الآن)" : "") + (f.site ? "، استُدعيت من السطر " + f.from + ": " + f.site : f.from ? "، استُدعيت من السطر " + f.from : "");
    const vars = f.vars.map(v => v.name + " = " + v.text + (v.param ? " (" + (v.param.kind === "value" ? KIND.value + " من " + v.param.arg : "هو " + (v.param.v ?? v.param.arg) + " في " + names(f.index - 1) + "، " + v.param.kind) + ")" : ""));
    parts.push(head + ": " + (vars.length ? vars.join("، ") : "لا متغيرات") + ".");
  }
  if (flow.returning) parts.push(names(flow.returning.from) + " تُعيد " + flow.returning.value + " إلى " + names(flow.returning.to) + ".");
  if (flow.hidden) parts.push("و" + flow.hidden + " استدعاءات أقدم لا تتسع لها الصورة.");
  return parts.join(" ");
}
