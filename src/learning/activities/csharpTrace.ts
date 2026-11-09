// 899371 P6 (docs/enterprise-899371-learning-plan.md §19) — the DATA of the C# tracer (simulation / csharp-trace / v1): the recorded
// steps' shape and the validator that reads a block config into it. Pure; shared by CSharpTraceActivity.tsx and its tests.
export type Val =
  | { t: "v" | "str" | "char"; s: string }
  | { t: "null" }
  | { t: "arr"; items: Val[] }
  | { t: "mat"; rows: string[][] }
  | { t: "ref"; id: number };
export type Pair = [string, Val];
export type Frame = { name: string; vars: Pair[] };
export type HeapObject = { id: number; type: string; fields: Pair[] };
export type Step = { line: number; note: string; frames: Frame[]; evals: Pair[]; heap: HeapObject[]; out: string };
export type TraceConfig = { lines: string[]; stdin?: string; steps: Step[] };

export const MAX_TRACE_STEPS = 200;
const isStr = (v: unknown): v is string => typeof v === "string";

function readVal(raw: unknown, depth = 0): Val | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  if ((o.t === "v" || o.t === "str" || o.t === "char") && isStr(o.s)) return { t: o.t, s: o.s };
  if (o.t === "null") return { t: "null" };
  if (o.t === "ref" && Number.isInteger(o.id)) return { t: "ref", id: o.id as number };
  if (o.t === "arr" && Array.isArray(o.items) && depth < 2) {
    const items = o.items.map(i => readVal(i, depth + 1));
    return items.every(Boolean) ? { t: "arr", items: items as Val[] } : null;
  }
  if (o.t === "mat" && Array.isArray(o.rows) && o.rows.every(r => Array.isArray(r) && r.every(isStr))) return { t: "mat", rows: o.rows as string[][] };
  return null;
}
function readPairs(raw: unknown): Pair[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Pair[] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2 || !isStr(p[0])) return null;
    const v = readVal(p[1]);
    if (!v) return null;
    out.push([p[0], v]);
  }
  return out;
}
/** Validates the block config; anything unexpected → null (the activity then says it is unavailable). Pure. */
export function readTraceConfig(config: unknown): TraceConfig | null {
  const c = (config ?? {}) as Record<string, unknown>;
  if (!isStr(c.code) || !c.code.trim() || !Array.isArray(c.steps) || c.steps.length < 1 || c.steps.length > MAX_TRACE_STEPS) return null;
  const lines = c.code.split("\n");
  const steps: Step[] = [];
  for (const raw of c.steps) {
    const s = (raw ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(s.line) || (s.line as number) < 1 || (s.line as number) > lines.length || !isStr(s.note) || !isStr(s.out) || !Array.isArray(s.frames) || !s.frames.length) return null;
    const frames: Frame[] = [];
    for (const f of s.frames) {
      const fr = (f ?? {}) as Record<string, unknown>;
      const vars = readPairs(fr.vars);
      if (!isStr(fr.name) || !vars) return null;
      frames.push({ name: fr.name, vars });
    }
    const evals = readPairs(s.eval ?? []);
    const heap: HeapObject[] = [];
    for (const h of Array.isArray(s.heap) ? s.heap : []) {
      const ho = (h ?? {}) as Record<string, unknown>;
      const fields = readPairs(ho.fields);
      if (!Number.isInteger(ho.id) || !isStr(ho.type) || !fields) return null;
      heap.push({ id: ho.id as number, type: ho.type, fields });
    }
    if (!evals) return null;
    steps.push({ line: s.line as number, note: s.note, frames, evals, heap, out: s.out });
  }
  return { lines, ...(isStr(c.stdin) ? { stdin: c.stdin } : {}), steps };
}

