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

/**
 * The condition the step tested, its result, and the condition written with this step's values (null: nothing to replace, or unsure).
 * V17: with the trace and the step's place in it (`at`), a call of the writer's own method inside the condition is written as the
 * value that call RETURNED — read from the return steps recorded just before the condition (see callReturns).
 */
export function conditionOf(step: DsStep, trace?: DsTrace, at?: number): TraceCondition | null {
  const m = CONDITION.exec(step.note);
  if (!m) return null;
  const text = m[1], value = m[2] === "صحيح";
  const frame = step.frames.at(-1);
  const rets = trace && at !== undefined ? callReturns(trace, at) : undefined;
  const filled = frame ? fillValues(text, frame, step.objs, { statics: step.statics, rets }) : null;
  return { text, value, withValues: filled !== null && filled !== text ? filled : null };
}

/**
 * V17: the values the writer's methods RETURNED to the running method since its previous step — the return steps (`ret`) of the
 * calls it made directly (one frame deeper), in the order they returned, by method name. These steps come right before `at`: every
 * step between the method's previous step and `at` is deeper than it.
 */
export function callReturns(trace: DsTrace, at: number): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const d = trace.steps[at]?.frames.length ?? 0;
  const found: [string, string][] = [];
  for (let k = at - 1; k >= 0 && trace.steps[k].frames.length > d; k--) {
    const s = trace.steps[k];
    if (s.frames.length === d + 1 && s.ret !== undefined) found.unshift([s.frames[d].name, s.ret]);
  }
  for (const [n, r] of found) out.set(n, [...(out.get(n) ?? []), r]);
  return out;
}

type Fill = { statics?: DsStep["statics"]; rets?: Map<string, string[]> };
/** What a part of the condition is, while it is read: a value of the trace, a literal already written, or a type's statics. */
type Got = { t: "val"; v: DsVal } | { t: "lit"; s: string } | { t: "type"; vars: Map<string, DsVal> } | null;
const LITERAL = /^(-?\d+(\.\d+)?|true|false|null|"[^"\\]*"|'[^'\\]')$/;
const INT = /^-?\d{1,15}$/;
const NUM = /^-?\d{1,15}(\.\d{1,15})?$/;

/**
 * `text` with the values of `frame` written in it; null when a name it should replace cannot be read with certainty.
 *   • a variable → its value; `a[i]` / `a[2]` → the cell; `a.Length` / `a.Count` / `a.Count()` → its length;
 *   • V17 — fields: `p.Age`, a chain `p.Home.City`, a struct's field, a field of `this` written bare (`Age` in its class), a static
 *     field `Counter.Made` (or bare, when exactly one type has it); `s.Length` of a string;
 *   • V17 — calls: the writer's method → the value it returned (`calls`, below); `Math.Abs` / `Math.Max` / `Math.Min` of whole numbers;
 *   • V21 — `Math.Round` (banker's rounding, as C#; with digits only away from a midpoint) and `Math.Log` (written «≈», 10 digits);
 *   • V20 — `list.Contains(x)` of an array / List<T> / HashSet<T>; `Math.Sqrt` of a whole number ≥ 0;
 *   • V19 — `Math.Pow` of whole numbers when the result is a whole number exactly; `s.Contains("…")` / `s.Contains('c')` of a
 *     string; a method call after an index is asked of what the index gave (never of the chain's first name);
 *   • V18 — a dictionary: `d[key]` → that key's value, `d.Count`, `d.ContainsKey(k)` / `d.ContainsValue(v)` (keys matched as Console
 *     prints them; a key found more than once, or a dictionary clipped for space, stays as written).
 * Read in ONE pass: a value put in is never read again as a name. Strings and characters in the condition are left as written. A part
 * that cannot be read stays as written (its index and arguments still read); only a variable that holds no plain value, or an index
 * outside its array, makes the whole line unsure.
 */
export function fillValues(text: string, frame: DsFrame, objs: readonly DsObj[], extra: Fill = {}): string | null {
  const vars = new Map(frame.vars);
  const byId = new Map(objs.map(o => [o.id, o]));
  const statics = new Map((extra.statics ?? []).map(t => [t.name, new Map(t.vars)]));
  const thisObj = (() => { const t = vars.get("this"); const o = t?.t === "ref" ? byId.get(t.id) : undefined; return o?.k === "obj" ? new Map(o.fields) : null; })();
  // a call of the writer's method is replaced only when the condition calls it exactly as many times as it returned (`&&` / `||` may
  // have skipped one: then none of its calls is replaced)
  const queues = new Map<string, string[]>();
  for (const [n, rs] of extra.rets ?? []) {
    const calls = (text.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "").match(new RegExp("(?<![\\w])" + n + "\\s*\\(", "g")) ?? []).length;
    if (calls === rs.length) queues.set(n, [...rs]);
  }
  let unsure = false;

  const lit = (g: Got): string | null => {
    if (!g) return null;
    if (g.t === "lit") return g.s;
    if (g.t !== "val") return null;
    if (g.v.t === "v") return LITERAL.test(g.v.s) ? g.v.s : null;
    return g.v.t === "null" ? "null" : null;
  };
  const cells = (g: Got): { items: string[]; quote: string } | null => {
    if (g?.t !== "val") return null;
    if (g.v.t === "arr") return { items: g.v.items, quote: "" };
    if (g.v.t !== "ref") return null;
    const o = byId.get(g.v.id);
    if (o?.k !== "array") return null;
    return { items: o.items, quote: /^(List<)?string\b/.test(o.type) ? "\"" : /^(List<)?char\b/.test(o.type) ? "'" : "" };
  };
  // V18: a Dictionary / SortedDictionary / SortedList — its keys and values as Console prints them, and its key and value types
  const mapOf = (g: Got): { keys: string[]; items: string[]; key: string; value: string } | null => {
    if (g?.t !== "val" || g.v.t !== "ref") return null;
    const o = byId.get(g.v.id);
    if (o?.k !== "map") return null;
    const m = /<(.*)>$/.exec(o.type);
    const types = m ? typeArgs(m[1]) : [];
    return types.length === 2 ? { keys: o.keys, items: o.items, key: types[0], value: types[1] } : null;
  };
  /** A literal of the condition (`"Ali"`, `'c'`, `3`, `true`) as Console prints a value of type `type`; null when it cannot be told. */
  const printed = (literal: string, type: string): string | null => {
    if (type === "string") return /^"[^"\\]*"$/.test(literal) ? literal.slice(1, -1) : null;
    if (type === "char") return /^'[^'\\]'$/.test(literal) ? literal.slice(1, -1) : null;
    if (type === "bool") return literal === "true" ? "True" : literal === "false" ? "False" : null;
    if (/^(int|long|short|byte)$/.test(type)) return INT.test(literal) ? literal : null;
    return null;
  };
  /** A printed cell back as a literal of type `type`; null when it cannot be told (an object, a number of a type not read). */
  const literalOf = (cell: string, type: string): string | null => {
    if (cell === "…") return null;
    if (type === "string") return /["\\]/.test(cell) ? null : "\"" + cell + "\"";
    if (type === "char") return cell.length === 1 && cell !== "'" && cell !== "\\" ? "'" + cell + "'" : null;
    if (type === "bool") return cell === "True" ? "true" : cell === "False" ? "false" : null;
    if (/^(int|long|short|byte)$/.test(type)) return INT.test(cell) ? cell : null;
    if (/^(double|float|decimal)$/.test(type)) return /^-?\d+(\.\d+)?$/.test(cell) ? cell : null;
    return null;
  };
  /** V20: an array / List<T> / LinkedList<T> / HashSet<T> / SortedSet<T> — its cells and its element type (null for a 2-D array, a
   *  jagged one, or a type not read). */
  const elementsOf = (g: Got): { items: string[]; type: string } | null => {
    if (g?.t !== "val" || g.v.t !== "ref") return null;
    const o = byId.get(g.v.id);
    if (o?.k !== "array" && o?.k !== "set") return null;
    const arr = /^([A-Za-z_][\w.]*)\[\]$/.exec(o.type);
    if (arr) return { items: o.items, type: arr[1] };
    const gen = /^\w+<(.+)>$/.exec(o.type);
    const ts = gen ? typeArgs(gen[1]) : [];
    return ts.length === 1 ? { items: o.items, type: ts[0] } : null;
  };
  /** Whether `list` holds `want` — false only when nothing was left out for space. */
  const holds = (list: string[], want: string | null): Got => {
    if (want === null) return null;
    if (list.includes(want)) return { t: "lit", s: "true" };
    return list.includes("…") ? null : { t: "lit", s: "false" };
  };
  const member = (g: Got, name: string): Got => {
    if (g?.t === "type") return g.vars.has(name) ? { t: "val", v: g.vars.get(name)! } : null;
    if (g?.t !== "val") {
      const s = lit(g);   // a string literal's Length
      return name === "Length" && s && /^"[^"\\]*"$/.test(s) ? { t: "lit", s: String(s.length - 2) } : null;
    }
    if (g.v.t === "rec") { const f = g.v.fields.find(x => x[0] === name); return f ? { t: "val", v: f[1] } : null; }
    if (g.v.t === "v" && name === "Length" && /^"[^"\\]*"$/.test(g.v.s)) return { t: "lit", s: String(g.v.s.length - 2) };
    if (name === "Count" && mapOf(g)) { const mp = mapOf(g)!; return mp.keys.includes("…") ? null : { t: "lit", s: String(mp.keys.length) }; }
    if (name === "Length" || name === "Count") {
      const c = cells(g);
      return c && !c.items.includes("…") ? { t: "lit", s: String(c.items.length) } : null;
    }
    if (g.v.t !== "ref") return null;
    const o = byId.get(g.v.id);
    if (o?.k !== "obj") return null;
    const f = o.fields.find(x => x[0] === name);
    return f ? { t: "val", v: f[1] } : null;
  };
  const root = (name: string): { got: Got; isVar: boolean } => {
    if (vars.has(name)) return { got: { t: "val", v: vars.get(name)! }, isVar: true };
    if (thisObj?.has(name)) return { got: { t: "val", v: thisObj.get(name)! }, isVar: true };
    if (statics.has(name)) return { got: { t: "type", vars: statics.get(name)! }, isVar: false };
    const owners = [...statics.values()].filter(m => m.has(name));
    if (owners.length === 1) return { got: { t: "val", v: owners[0].get(name)! }, isVar: true };
    return { got: null, isVar: false };
  };
  // the text between an opening bracket at `from` and its partner (strings skipped); -1 when it never closes
  const close = (src: string, from: number): number => {
    const open = src[from], shut = open === "(" ? ")" : "]";
    let depth = 0;
    for (let i = from; i < src.length; i++) {
      const c = src[i];
      if (c === "\"" || c === "'") { i = skipLiteral(src, i) - 1; continue; }
      if (c === open) depth++;
      else if (c === shut && --depth === 0) return i;
    }
    return -1;
  };
  const args = (inner: string): string[] => {   // split at the commas outside brackets and strings
    const out: string[] = [];
    let depth = 0, last = 0;
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === "\"" || c === "'") { i = skipLiteral(inner, i) - 1; continue; }
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (c === "," && depth === 0) { out.push(inner.slice(last, i).trim()); last = i + 1; }
    }
    out.push(inner.slice(last).trim());
    return out;
  };
  const typeArgs = (inner: string): string[] => {   // a generic type's arguments: split at the commas outside < >
    const out: string[] = [];
    let depth = 0, last = 0;
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i];
      if (c === "<") depth++;
      else if (c === ">") depth--;
      else if (c === "," && depth === 0) { out.push(inner.slice(last, i).trim()); last = i + 1; }
    }
    out.push(inner.slice(last).trim());
    return out;
  };
  const math = (fn: string, xs: string[]): Got => {
    // V21: Round and Log also take a number with a fraction (as written in the condition, or a variable holding one)
    if (fn === "Round" || fn === "Log") {
      if (!xs.every(x => NUM.test(x))) return null;
      const ds = xs.map(Number);
      if (fn === "Round") return round(ds);
      return log(ds);
    }
    if (!xs.every(x => INT.test(x))) return null;
    const ns = xs.map(Number);
    if (fn === "Abs" && ns.length === 1) return { t: "lit", s: String(Math.abs(ns[0])) };
    if ((fn === "Max" || fn === "Min") && ns.length === 2) return { t: "lit", s: String(fn === "Max" ? Math.max(ns[0], ns[1]) : Math.min(ns[0], ns[1])) };
    if (fn === "Sqrt" && ns.length === 1 && ns[0] >= 0) {
      // V20: IEEE's correctly rounded square root (as C#'s Math.Sqrt), written in its shortest form (as .NET prints a double); a
      // result written with an exponent stays as written
      const r = String(Math.sqrt(ns[0]));
      return /e/i.test(r) ? null : { t: "lit", s: r };
    }
    if (fn === "Pow" && ns.length === 2 && ns[1] >= 0 && ns[1] <= 1000) {
      // V19: a whole number exactly (C#'s double holds it exactly up to 2^53); else it stays as written
      const r = BigInt(ns[0]) ** BigInt(ns[1]);
      const big = r < 0n ? -r : r;
      return big <= 9007199254740992n ? { t: "lit", s: r.toString() } : null;
    }
    return null;
  };

  /**
   * V21: Math.Round(x) — C#'s default is the banker's rounding (MidpointRounding.ToEven): 2.5 → 2, 3.5 → 4, -2.5 → -2.
   * Math.Round(x, d), 0 ≤ d ≤ 15: written only when x·10^d is clearly away from a midpoint (then every way of rounding agrees); near
   * one, the binary value .NET holds decides and it is not read here — it stays as written.
   */
  const round = (ds: number[]): Got => {
    if (ds.length === 1) {
      const x = ds[0], f = Math.floor(x), diff = x - f;
      const r = diff < 0.5 ? f : diff > 0.5 ? f + 1 : (f % 2 === 0 ? f : f + 1);
      return numText(r);
    }
    if (ds.length === 2 && Number.isInteger(ds[1]) && ds[1] >= 0 && ds[1] <= 15) {
      const p = 10 ** ds[1], scaled = ds[0] * p, frac = scaled - Math.floor(scaled);
      if (Math.abs(frac - 0.5) < 1e-6) return null;
      return numText(Math.round(scaled) / p);
    }
    return null;
  };
  /**
   * V21: Math.Log(x) / Math.Log(x, b). IEEE does not require a logarithm to be correctly rounded, so its last digit may differ between
   * this browser and .NET: it is written as an approximation, «≈» and 10 significant digits — never as digits that could be wrong.
   * Math.Log(1) is exactly 0 everywhere. x ≤ 0, b ≤ 0 or b = 1 (NaN / ∞ in C#) stay as written.
   */
  const log = (ds: number[]): Got => {
    if (!ds.every(d => d > 0) || (ds.length === 2 && ds[1] === 1) || ds.length > 2) return null;
    if (ds[0] === 1) return { t: "lit", s: "0" };
    const r = ds.length === 1 ? Math.log(ds[0]) : Math.log(ds[0]) / Math.log(ds[1]);
    if (!Number.isFinite(r) || Math.abs(r) < 1e-6 || Math.abs(r) >= 1e10) return null;
    const t = r.toPrecision(10).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return { t: "lit", s: "≈" + t };
  };
  /** A double as .NET prints it, when that is a plain decimal (no exponent); else null. */
  const numText = (r: number): Got => {
    const t = String(Object.is(r, -0) ? 0 : r);
    return /e/i.test(t) ? null : { t: "lit", s: t };
  };

  const fill = (src: string): string => {
    let out = "";
    for (let i = 0; i < src.length;) {
      const c = src[i];
      if (c === "\"" || c === "'") { const e = skipLiteral(src, i); out += src.slice(i, e); i = e; continue; }
      if (!/[A-Za-z_]/.test(c) || (i > 0 && /[\w.]/.test(src[i - 1]))) { out += c; i++; continue; }
      // a chain: name ( .name | [index] | (arguments) )*
      let j = i;
      while (j < src.length && /\w/.test(src[j])) j++;
      const first = src.slice(i, j);
      const start = root(first);
      let got = start.got, written = first, path = [first], plainName = true;
      // V19: what the chain held right before its last `.name` — the owner a method call is asked of (an index or a call in
      // between is part of it: `maps["x"].ContainsKey(…)` asks the inner dictionary, never `maps`); null when no `.name` came last
      let owner: Got = null, ownerKnown = false;
      for (;;) {
        let k = j;
        while (k < src.length && src[k] === " ") k++;
        if (src[k] === "." && /[A-Za-z_]/.test(src[k + 1] ?? "")) {
          let e = k + 1;
          while (e < src.length && /\w/.test(src[e])) e++;
          const name = src.slice(k + 1, e);
          owner = got; ownerKnown = true;
          got = member(got, name);
          path.push(name); written += "." + name; plainName = false; j = e;
        } else if (src[k] === "[") {
          const e = close(src, k);
          if (e < 0) break;
          const inner = fill(src.slice(k + 1, e));
          const c2 = cells(got);
          if (c2) {
            const idx = inner.trim();
            if (INT.test(idx)) {
              const n = Number(idx), cell = n >= 0 && n < c2.items.length ? c2.items[n] : undefined;
              if (cell === undefined || cell === "…") unsure = true;
              // a cell is written as Console prints it: a string / a char gets its quotes back; any other cell must read as a literal
              else if (c2.quote) got = { t: "lit", s: c2.quote + cell + c2.quote };
              else if (/^(-?\d+(\.\d+)?|true|false|True|False)$/.test(cell)) got = { t: "lit", s: /^(true|false)$/i.test(cell) ? cell.toLowerCase() : cell };
              else { unsure = true; got = null; }
            } else got = null;
          } else if (mapOf(got)) {
            // V18: d[key] → the value of that key: the key read as Console prints it, found exactly once; else it stays as written
            const mp = mapOf(got)!, want = printed(inner.trim(), mp.key);
            const at = want === null ? [] : mp.keys.flatMap((k, x) => (k === want ? [x] : []));
            const lit2 = at.length === 1 ? literalOf(mp.items[at[0]], mp.value) : null;
            got = lit2 === null ? null : { t: "lit", s: lit2 };
          } else {
            if (got?.t === "val" && start.isVar && path.length === 1) unsure = true;   // a variable indexed that holds no array
            got = null;
          }
          written += "[" + inner + "]"; plainName = false; ownerKnown = false; j = e + 1;
        } else if (src[k] === "(") {
          const e = close(src, k);
          if (e < 0) break;
          const inner = fill(src.slice(k + 1, e));
          const name = path[path.length - 1];
          const queue = queues.get(name);
          if (queue && queue.length) got = { t: "lit", s: queue.shift()! };
          else if (path.length === 2 && path[0] === "Math" && !start.isVar) got = math(name, args(inner));
          else if ((name === "ContainsKey" || name === "ContainsValue") && path.length >= 2) {
            // V18: d.ContainsKey(k) / d.ContainsValue(v), answered from the recorded keys / values
            const mp = ownerKnown ? mapOf(owner) : null, xs = args(inner);
            got = mp && xs.length === 1 ? (name === "ContainsKey" ? holds(mp.keys, printed(xs[0], mp.key)) : holds(mp.items, printed(xs[0], mp.value))) : null;
          } else if (name === "Contains" && ownerKnown && path.length >= 2) {
            const text = lit(owner), xs = args(inner), els = elementsOf(owner);
            if (els) {
              // V20: list.Contains(x) of an array / List<T> / HashSet<T> — x written as Console prints the element type; false only
              // when nothing was clipped for space
              got = xs.length === 1 ? holds(els.items, printed(xs[0], els.type)) : null;
            } else {
              // V19: s.Contains("ab") / s.Contains('a') — a string with no escapes, an argument written as a literal (ordinal, as C#)
              const plainText = (x: string | null) => (x && /^"[^"\\]*"$/.test(x) ? x.slice(1, -1) : null);
              const hay = plainText(text);
              const needle = xs.length === 1 ? plainText(xs[0]) ?? (/^'[^'\\]'$/.test(xs[0]) ? xs[0].slice(1, -1) : null) : null;
              got = hay !== null && needle !== null ? { t: "lit", s: String(hay.includes(needle)) } : null;
            }
          } else if (name === "Count" && inner.trim() === "" && path.length >= 2) {
            // list.Count(): the length of what the chain before it holds
            got = null;
            const c3 = ownerKnown ? cells(owner) : null;
            if (c3 && !c3.items.includes("…")) got = { t: "lit", s: String(c3.items.length) };
          } else got = null;
          written += "(" + inner + ")"; plainName = false; ownerKnown = false; j = e + 1;
        } else break;
      }
      const value = lit(got);
      if (value !== null && got !== null && !(got.t === "type")) out += value;
      else {
        if (plainName && start.isVar) unsure = true;   // a variable (or a bare field) that holds no plain value
        out += written;
      }
      i = j;
    }
    return out;
  };
  const out = fill(text);
  return unsure ? null : out;
}
/** The end of the string / char literal that starts at `i` (after its closing quote). */
function skipLiteral(src: string, i: number): number {
  const q = src[i];
  for (let k = i + 1; k < src.length; k++) {
    if (src[k] === "\\") { k++; continue; }
    if (src[k] === q) return k + 1;
  }
  return src.length;
}

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
    const test = conditionOf(s, trace, k);
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
