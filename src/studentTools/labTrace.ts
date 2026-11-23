import { DS_LIMITS, readDsTrace, type DsTrace } from "../learning/activities/ds";

// Visual lab V3 (docs/enterprise-csharp-visual-lab-plan.md §11) — the teacher's «تشغيل مرئي»: what the on-device lab's trace recorder
// (tools/csharp-lab/Tracer.cs, phase V2) returns, read STRICTLY into the very shape the course's «تتبّع البرنامج على مبنى المعطيات»
// draws (src/learning/activities/ds.ts → DsTraceView). Nothing new is drawn; nothing is guessed.
//   • The recorder's steps go through the course's own reader (readDsTrace), with the lab's limits for the program and the trace
//     (5000 steps — owner decision, plan §7); everything else is checked exactly as for the course's traces.
//   • What the drawing cannot hold is CLIPPED, and the result says so (`clipped`): a text past 80 characters, more than 40 items in a
//     structure, more than 40 frames (the newest are kept), 30 variables, 80 objects (a reference to a dropped object then shows «…»).
//   • Anything unreadable → no trace (the editor says it could not show the steps) — never a partial guess.
// Light (no React): the editor imports it.

export const LAB_TRACE_LIMITS = { steps: 5000, lines: 1000 } as const;
export type LabTraceStatus = "success" | "compile-error" | "runtime-error" | "output-limit" | "step-limit" | "timeout" | "trace-unsupported" | "internal-error";
export type LabTraceResult = { status: LabTraceStatus; stdout: string; stderr: string; trace: DsTrace | null; clipped: boolean };

const STATUSES: ReadonlySet<string> = new Set(["success", "compile-error", "runtime-error", "output-limit", "step-limit", "timeout", "trace-unsupported", "internal-error"]);
const ELLIPSIS = "…";
type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function readLabTrace(raw: unknown, source: string, stdin: string): LabTraceResult {
  const r = rec(raw);
  const status = (STATUSES.has(str(r.status)) ? str(r.status) : "internal-error") as LabTraceStatus;
  const base = { status, stdout: str(r.stdout), stderr: str(r.stderr), trace: null, clipped: false };
  if (!Array.isArray(r.steps) || r.steps.length === 0) return base;
  let clipped = false;
  const clip = (s: unknown): unknown => {
    if (typeof s !== "string") return s;
    if (s.length <= DS_LIMITS.text) return s;
    clipped = true;
    return s.slice(0, DS_LIMITS.text - 1) + ELLIPSIS;
  };
  const clipList = (items: unknown, max: number): unknown => {
    if (!Array.isArray(items)) return items;
    const list = items.length > max ? (clipped = true, [...items.slice(0, max - 1), ELLIPSIS]) : items;
    return list.map(clip);
  };
  // `dropped`: objects left out for space (past DS_LIMITS.objs). A reference to one of THEM shows «…» / ends the drawn chain; a
  // reference to an object that was never there is left as it is, so the course's reader refuses the trace.
  const val = (v: unknown, dropped: Set<number>): unknown => {
    const o = rec(v);
    if (o.t === "v") return { t: "v", s: clip(o.s) };
    if (o.t === "arr") return { t: "arr", items: clipList(o.items, DS_LIMITS.items) };
    if (o.t === "ref" && typeof o.id === "number" && dropped.has(o.id)) { clipped = true; return { t: "v", s: ELLIPSIS }; }
    return v;
  };
  const pairs = (list: unknown, dropped: Set<number>): unknown => {
    if (!Array.isArray(list)) return list;
    const kept = list.length > DS_LIMITS.vars ? (clipped = true, list.slice(0, DS_LIMITS.vars)) : list;
    return kept.map(p => (Array.isArray(p) && p.length === 2 ? [clip(p[0]), val(p[1], dropped)] : p));
  };
  const link = (id: unknown, dropped: Set<number>) => (typeof id === "number" && dropped.has(id) ? (clipped = true, null) : id);

  let out = "";
  const steps = r.steps.map(sRaw => {
    const s = rec(sRaw);
    const objsRaw = Array.isArray(s.objs) ? s.objs : [];
    const objsKept = objsRaw.length > DS_LIMITS.objs ? (clipped = true, objsRaw.slice(0, DS_LIMITS.objs)) : objsRaw;
    const dropped = new Set(objsRaw.slice(objsKept.length).map(o => rec(o).id).filter((id): id is number => typeof id === "number"));
    const framesRaw = Array.isArray(s.frames) ? s.frames : [];
    const framesKept = framesRaw.length > DS_LIMITS.frames ? (clipped = true, framesRaw.slice(framesRaw.length - DS_LIMITS.frames)) : framesRaw;
    const frames = framesKept.map(f => { const fr = rec(f); return { name: clip(fr.name), vars: pairs(fr.vars, dropped) }; });
    const objs = objsKept.map(o => {
      const x = rec(o);
      if (x.k === "stack" || x.k === "queue") return { ...x, items: clipList(x.items, DS_LIMITS.items) };
      if (x.k === "node") return { ...x, v: clip(x.v), next: link(x.next, dropped) };
      if (x.k === "bin") return { ...x, v: clip(x.v), l: link(x.l, dropped), r: link(x.r, dropped) };
      if (x.k === "obj") return { ...x, type: clip(x.type), fields: pairs(x.fields, dropped) };
      return x;
    });
    const printed = str(s.out);
    if (printed.length > out.length) out = printed;
    const line = typeof s.line === "number" && s.line >= 0 ? s.line : -1;
    return { l: line, n: str(s.note).slice(0, 600), f: frames, h: objs, o: printed.length, ...(s.error === true ? { e: true } : {}) };
  });
  // every step's output must be a prefix of the last one (the course reader checks offsets into ONE output)
  const consistent = r.steps.every(sRaw => out.startsWith(str(rec(sRaw).out)));
  const trace = consistent ? readDsTrace({ code: source, ...(stdin ? { stdin } : {}), out, steps }, LAB_TRACE_LIMITS) : null;
  return { ...base, trace, clipped: clipped && !!trace };
}
