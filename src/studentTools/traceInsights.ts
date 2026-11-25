import type { DsFrame, DsObj, DsStep, DsTrace, DsVal } from "../learning/activities/ds";

// Visual lab V15 — what the player explains BESIDE the recorded steps. Pure: it only READS a step the recorder already wrote (its note,
// its frames, its objects, the run's error text) — nothing is executed, nothing is guessed: what cannot be read with certainty is left
// out (null), and the drawing stays exactly as the recorder said.
//   • conditionOf: the recorder's condition step («الشرط `…` صحيح.») with the condition written again WITH THE VALUES of that step
//     (`arr[i] % 2 == 0` → `10 % 2 == 0`): a name is replaced only by a plain value of the running method, `a[i]` / `a[2]` only by a
//     cell of an array that is there, `a.Length` / `list.Count` only by the length of one;
//   • runtimeErrorOf: the run's error (stderr) in one Arabic sentence; an index outside an array says which index and which range;
//   • traceTable: «جدول التتبّع» — one row per step that changed a value of the running method (or printed), up to the step shown;
//     V16: of any method the run calls (traceMethods), each call numbered, with its depth and the value it returns;
//   • traceKey: the player's keyboard (the page is RTL: ← is forward, as «الخطوة التالية» is left of «الخطوة السابقة»).

const plain = (v: DsVal | undefined): string | null => (v?.t === "v" ? v.s : v?.t === "null" ? "null" : null);
const arrayOf = (v: DsVal | undefined, objs: readonly DsObj[]): string[] | null => {
  if (v?.t === "arr") return v.items;
  if (v?.t !== "ref") return null;
  const o = objs.find(x => x.id === v.id);
  return o?.k === "array" ? o.items : null;
};

export type TraceCondition = { text: string; value: boolean; withValues: string | null };
const CONDITION = /^الشرط `(.+)` (صحيح|غير صحيح)\.$/s;

/** The condition the step tested, its result, and the condition written with this step's values (null: nothing to replace, or unsure). */
export function conditionOf(step: DsStep): TraceCondition | null {
  const m = CONDITION.exec(step.note);
  if (!m) return null;
  const text = m[1], value = m[2] === "صحيح";
  const frame = step.frames.at(-1);
  const filled = frame ? fillValues(text, frame, step.objs) : null;
  return { text, value, withValues: filled !== null && filled !== text ? filled : null };
}

/** `text` with the names of `frame` replaced by their values; null when a name it should replace cannot be read with certainty. */
export function fillValues(text: string, frame: DsFrame, objs: readonly DsObj[]): string | null {
  const vars = new Map(frame.vars);
  let unsure = false;
  // ONE pass (a value put in is never read again as a name): a[i] / a[2] → the cell; a.Length / a.Count → its length; a plain
  // variable → its value (never a method, a member or a type). Strings and characters in the condition are left as written.
  const NAME = /(?<![\w.])([A-Za-z_]\w*)(?:\s*\[\s*([A-Za-z_]\w*|\d+)\s*\]|\s*\.\s*(Length|Count)\b(?!\s*\()|\b(?!\s*[(.[]))/g;
  const parts = text.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
  const out = parts.map((part, k) => (k % 2 === 1 ? part : part.replace(NAME, (whole, n: string, index?: string, size?: string) => {
    if (!vars.has(n)) return whole;
    if (index === undefined && size === undefined) {
      const v = plain(vars.get(n));
      if (v === null) unsure = true;
      return v ?? whole;
    }
    const cells = cellsOf(vars.get(n), objs);
    if (!cells || cells.items.includes("…")) { unsure = true; return whole; }
    if (size !== undefined) return String(cells.items.length);
    const at = /^\d+$/.test(index!) ? Number(index) : Number(plain(vars.get(index!)) ?? NaN);
    const cell = Number.isInteger(at) && at >= 0 && at < cells.items.length ? cells.items[at] : undefined;
    if (cell === undefined) { unsure = true; return whole; }
    // a cell is written as Console prints it: a string / a char gets its quotes back; any other cell must read as a literal
    if (cells.quote) return cells.quote + cell + cells.quote;
    if (!/^(-?\d+(\.\d+)?|true|false|True|False)$/.test(cell)) { unsure = true; return whole; }
    return cell.toLowerCase() === "true" || cell.toLowerCase() === "false" ? cell.toLowerCase() : cell;
  }))).join("");
  return unsure ? null : out;
}
const cellsOf = (v: DsVal | undefined, objs: readonly DsObj[]): { items: string[]; quote: string } | null => {
  if (v?.t === "arr") return { items: v.items, quote: "" };
  if (v?.t !== "ref") return null;
  const o = objs.find(x => x.id === v.id);
  if (o?.k !== "array") return null;
  return { items: o.items, quote: /^string\b/.test(o.type) ? "\"" : /^char\b/.test(o.type) ? "'" : "" };
};

const ERRORS: [RegExp, string][] = [
  [/IndexOutOfRangeException/, "الفهرس خارج حدود المصفوفة."],
  [/ArgumentOutOfRangeException/, "الفهرس خارج حدود القائمة أو النص."],
  [/DivideByZeroException/, "قسمة على صفر."],
  [/NullReferenceException/, "استعمال متغيّر قيمته null (لا يشير إلى أي كائن)."],
  [/FormatException/, "تعذّر تحويل النص إلى عدد: المدخلات ليست بالشكل المتوقَّع."],
  [/OverflowException/, "العدد أكبر من أن يتّسع له النوع."],
  [/InvalidOperationException/, "عملية غير ممكنة الآن (مثلًا: إخراج عنصر من مبنى فارغ)."],
  [/KeyNotFoundException/, "المفتاح غير موجود في القاموس."],
  [/InvalidCastException/, "تحويل نوع غير ممكن."],
  [/ArgumentNullException/, "أُرسلت null إلى عملية تحتاج قيمة."],
  [/StackOverflowException/, "استدعاءات متداخلة بلا نهاية (تعاود بلا شرط توقّف)."],
];

/** The run's error in Arabic, on the error step; with an index outside an array of the line, which index and which range. */
export function runtimeErrorOf(stderr: string, step: DsStep, lines: readonly string[]): string | null {
  if (!step.error) return null;
  const first = stderr.split("\n").find(l => l.trim()) ?? "";
  const known = ERRORS.find(([re]) => re.test(first));
  const type = /([A-Za-z.]+Exception)/.exec(first)?.[1]?.split(".").pop();
  const base = known ? known[1] : type ? "حدث استثناء " + type + "." : "توقّف البرنامج بخطأ.";
  if (!known || !/IndexOutOfRange|ArgumentOutOfRange/.test(first)) return base;
  const frame = step.frames.at(-1);
  const code = lines[step.line - 1] ?? "";
  if (!frame) return base;
  const vars = new Map(frame.vars);
  for (const m of code.matchAll(/(?<![\w.])([A-Za-z_]\w*)\s*\[\s*([A-Za-z_]\w*)\s*\]/g)) {
    const items = arrayOf(vars.get(m[1]), step.objs), idx = plain(vars.get(m[2]));
    if (!items || idx === null || !/^-?\d+$/.test(idx) || items.includes("…")) continue;
    const at = Number(idx);
    if (at >= 0 && at < items.length) continue;
    const range = items.length ? "0–" + (items.length - 1) : "فارغة";
    return base + " " + m[2] + " = " + at + "، والفهارس المسموحة في " + m[1] + " هي " + range + ".";
  }
  return base;
}

export type TraceRow = {
  step: number; line: number; cells: (string | null)[]; changed: boolean[]; test: TraceCondition | null; printed: string;
  /** V16, a called method only: which call of it this is (1, 2, … in the order the calls began), how deep the call stack is
   *  (0 = the method the run starts in), and the value it returns on the step it returns (null on any other step). */
  call: number; depth: number; ret: string | null;
};
export type TraceTable = { method: string; called: boolean; columns: string[]; rows: TraceRow[]; clipped: boolean };
export const TRACE_TABLE_MAX = 400;

const topOf = (s: DsStep): DsFrame | undefined => s.frames.at(-1);

/** V16: the methods that run in the trace (each the running method on some step), the one the run starts in first. */
export function traceMethods(trace: DsTrace): string[] {
  const out: string[] = [];
  const entry = trace.steps[0]?.frames[0]?.name;
  if (entry) out.push(entry);
  for (const s of trace.steps) { const n = topOf(s)?.name; if (n && !out.includes(n)) out.push(n); }
  return out;
}

/**
 * «جدول التتبّع» for one method (by default the one the run starts in): the columns are its plain variables (in the order they
 * appear) and, for each `a[i]` of the program over one of its arrays, that cell (`arr[i]`). A row for every step up to `upTo` WHILE
 * THAT METHOD IS THE ONE RUNNING where one of them changed, a condition was tested, something was printed or it returned a value.
 * V16: a called method is a table of its own — every call of it (a recursion's too) numbered, with its depth and what it returned;
 * a value is «changed» against the same call's previous row, never against another call's.
 */
export function traceTable(trace: DsTrace, upTo: number, method?: string): TraceTable {
  const entry = trace.steps[0]?.frames[0]?.name ?? "";
  const name = method ?? entry;
  const called = name !== entry;
  const runs = (s: DsStep) => topOf(s)?.name === name;
  const names: string[] = [], cells: string[] = [];   // the variables first, then the cells a[i] (each in the order it appears)
  const seen = new Set<string>();
  const add = (list: string[], c: string) => { if (!seen.has(c)) { seen.add(c); list.push(c); } };
  const ptrs = (trace.pointers ?? []).filter(p => p.length === 2);
  for (const s of trace.steps) {
    if (!runs(s)) continue;
    const f = topOf(s)!;
    for (const [n, v] of f.vars) if (v.t === "v" || v.t === "null") add(names, n);
    for (const [a, i] of ptrs) if (arrayOf(new Map(f.vars).get(a), s.objs)) add(cells, a + "[" + i + "]");
  }
  const cols = [...names, ...cells];
  const cellOf = (c: string, s: DsStep): string | null => {
    const vars = new Map(topOf(s)!.vars);
    const m = /^(\w+)\[(\w+)\]$/.exec(c);
    if (!m) return plain(vars.get(c));
    const items = arrayOf(vars.get(m[1]), s.objs), i = plain(vars.get(m[2]));
    if (!items || i === null || !/^\d+$/.test(i)) return null;
    return items[Number(i)] ?? null;
  };
  const ordinal = new Map<number, number>();   // a call's number for the whole run → 1, 2, … for this method
  const lastOf = new Map<number, (string | null)[]>();   // each call's previous row
  const rows: TraceRow[] = [];
  let clipped = false;
  for (let k = 0; k <= Math.min(upTo, trace.steps.length - 1); k++) {
    const s = trace.steps[k];
    if (!runs(s)) continue;
    const id = topOf(s)!.call ?? -1;
    if (!ordinal.has(id)) ordinal.set(id, ordinal.size + 1);
    const last = lastOf.get(id) ?? null;
    const row = cols.map(c => cellOf(c, s));
    const printed = s.out.slice(k > 0 ? trace.steps[k - 1].out.length : 0);
    const test = conditionOf(s);
    const ret = called && s.ret !== undefined ? s.ret : null;
    const changed = row.map((c, j) => !last || last[j] !== c);
    const nothing = last ? !changed.some(Boolean) : row.every(c => c === null);   // a first row with no value yet is no row
    if (nothing && !test && !printed && ret === null) continue;
    if (rows.length >= TRACE_TABLE_MAX) { clipped = true; break; }
    rows.push({ step: k, line: s.line, cells: row, changed: last ? changed : row.map(c => c !== null), test, printed, call: ordinal.get(id)!, depth: s.frames.length - 1, ret });
    lastOf.set(id, row);
  }
  return { method: name, called, columns: cols, rows, clipped };
}

/** The table as text with tabs (pasted into a spreadsheet or a document, it keeps its columns). */
export function traceTableText(t: TraceTable): string {
  const head = ["الخطوة", "السطر", ...(t.called ? ["الاستدعاء", "العمق"] : []), ...t.columns, "الشرط", ...(t.called ? ["تُعيد"] : []), "الناتج"].join("\t");
  const body = t.rows.map(r => [String(r.step + 1), String(r.line), ...(t.called ? [String(r.call), String(r.depth)] : []), ...r.cells.map(c => c ?? ""),
    r.test ? r.test.text + " → " + (r.test.value ? "true" : "false") : "", ...(t.called ? [r.ret ?? ""] : []), r.printed.replace(/\s+/g, " ").trim()].join("\t"));
  return [head, ...body].join("\n");
}

export type TraceKey = "next" | "prev" | "first" | "last" | "play";
/** The player's key, or null (a key with a modifier, or one an input / a button / the code list needs, is never taken). */
export function traceKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey?: boolean }, target: EventTarget | null): TraceKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const el = target as HTMLElement | null;
  const tag = el?.tagName ?? "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return null;
  const onControl = tag === "BUTTON" || tag === "A" || tag === "SUMMARY";
  switch (e.key) {
    case "ArrowLeft": return "next";
    case "ArrowRight": return "prev";
    case "Home": return "first";
    case "End": return "last";
    case " ": return onControl ? null : "play";
    default: return null;
  }
}
