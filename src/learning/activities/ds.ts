// DS-A1 (docs/enterprise-data-structures-course.md) — the DATA of the data-structure activities: the recorded trace
// (simulation / ds-trace / v1), the interactive lab (simulation / ds-lab / v1) and the static figure (interactive-diagram /
// ds-figure / v1). Pure: strict readers (anything unexpected → null, the activity then says it is unavailable), the scene a
// program state is drawn as, the tree layout and the binary-search-tree operations of the lab. No React, nothing executed.

export type DsVal = { t: "v"; s: string } | { t: "null" } | { t: "ref"; id: number } | { t: "arr"; items: string[] };
/** V5 (the teacher's visual run only, read with `rich`): `refs` beside `items` — the object each item refers to (null = a plain value). */
type DsRefs = { refs?: (number | null)[] };
export type DsObj =
  | ({ id: number; k: "stack"; items: string[] } & DsRefs)
  | ({ id: number; k: "queue"; items: string[] } & DsRefs)
  | { id: number; k: "node"; v: string; next: number | null; ref?: number }
  | { id: number; k: "bin"; v: string; l: number | null; r: number | null; ref?: number }
  | { id: number; k: "obj"; type: string; fields: [string, DsVal][] }
  // V5 rich types: an array / List<T> / LinkedList<T>, a HashSet<T> / SortedSet<T>, a Dictionary (keys and their values)
  | ({ id: number; k: "array"; type: string; items: string[] } & DsRefs)
  | ({ id: number; k: "set"; type: string; items: string[] } & DsRefs)
  | ({ id: number; k: "map"; type: string; keys: string[]; items: string[] } & DsRefs)
  // V9: a two-dimensional array, row by row
  | { id: number; k: "grid"; type: string; rows: string[][] };
/** `call` (V8, rich only): one number per call for the whole run — the same call keeps it from step to step (the call tree). */
export type DsFrame = { name: string; vars: [string, DsVal][]; call?: number; types?: (string | null)[] };
/** `pause` (visual lab V4, optional; never in a course trace): the writer's Viz.Pause() — a stop for the teacher's player. */
/** `ret` (V8, rich only): on the step where the running method returns, the value it returns (as a literal). */
/** `evals` (V9, rich only): the value of every `/`, `%`, comparison, `&&`, `||`, `!` evaluated since the step before. */
export type DsStep = { line: number; note: string; frames: DsFrame[]; objs: DsObj[]; out: string; error: boolean; pause?: boolean; ret?: string; evals?: [string, string][] };
/** `pointers` (V5, rich only): the [array, index] pairs the program writes as a[i] — the drawing marks the cell i points at. */
/** V9: a pointer may be [array, row, column] (a[i, j]); `digits` = [variable, base] — a number the program takes apart (n % 10, n / 10). */
export type DsTrace = { lines: string[]; given?: string; stdin?: string; steps: DsStep[]; pointers?: string[][]; digits?: [string, number][] };

export const DS_LIMITS = { lines: 120, steps: 260, objs: 80, items: 40, text: 80, frames: 40, vars: 30 } as const;
const isStr = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => Number.isInteger(v);
const short = (v: unknown): v is string => isStr(v) && v.length <= DS_LIMITS.text;
const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function readVal(raw: unknown): DsVal | null {
  const o = rec(raw);
  if (o.t === "v" && short(o.s)) return { t: "v", s: o.s };
  if (o.t === "null") return { t: "null" };
  if (o.t === "ref" && isInt(o.id)) return { t: "ref", id: o.id };
  if (o.t === "arr" && Array.isArray(o.items) && o.items.length <= DS_LIMITS.items && o.items.every(short)) return { t: "arr", items: o.items as string[] };
  return null;
}
function readPairs(raw: unknown): [string, DsVal][] | null {
  if (!Array.isArray(raw) || raw.length > DS_LIMITS.vars) return null;
  const out: [string, DsVal][] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2 || !short(p[0])) return null;
    const v = readVal(p[1]);
    if (!v) return null;
    out.push([p[0], v]);
  }
  return out;
}
function readFrames(raw: unknown, rich: boolean): DsFrame[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > DS_LIMITS.frames) return null;
  const out: DsFrame[] = [];
  for (const f of raw) {
    const o = rec(f), vars = readPairs(o.vars);
    if (!short(o.name) || !vars) return null;
    if (o.call !== undefined && (!rich || !isInt(o.call) || o.call < 1)) return null;   // V8: rich only, a positive whole number
    // V9: each variable's type, beside its value (rich only; null = not known)
    if (o.types !== undefined && (!rich || !Array.isArray(o.types) || o.types.length !== vars.length || !o.types.every(t => t === null || short(t)))) return null;
    out.push({ name: o.name, vars, ...(isInt(o.call) ? { call: o.call } : {}), ...(Array.isArray(o.types) ? { types: o.types as (string | null)[] } : {}) });
  }
  return out;
}
const idOrNull = (v: unknown): v is number | null => v === null || isInt(v);
const cells = (v: unknown): v is string[] => Array.isArray(v) && v.length <= DS_LIMITS.items && v.every(short);
function readObjs(raw: unknown, rich: boolean): DsObj[] | null {
  if (!Array.isArray(raw) || raw.length > DS_LIMITS.objs) return null;
  const out: DsObj[] = [], ids = new Set<number>();
  for (const x of raw) {
    const o = rec(x);
    if (!isInt(o.id) || ids.has(o.id)) return null;
    ids.add(o.id);
    // V5 fields are read ONLY in a rich trace (the teacher's visual run); in any other trace they make it unreadable
    if (!rich && ("refs" in o || "ref" in o)) return null;
    let refs: (number | null)[] | undefined;
    if (o.refs !== undefined) {
      if (!Array.isArray(o.refs) || !Array.isArray(o.items) || o.refs.length !== o.items.length || !o.refs.every(idOrNull)) return null;
      refs = o.refs as (number | null)[];
    }
    if (o.ref !== undefined && !isInt(o.ref)) return null;
    const withRefs = refs ? { refs } : {};
    const withRef = isInt(o.ref) ? { ref: o.ref } : {};
    if ((o.k === "stack" || o.k === "queue") && cells(o.items)) out.push({ id: o.id, k: o.k, items: o.items, ...withRefs });
    else if (o.k === "node" && short(o.v) && idOrNull(o.next) && !refs) out.push({ id: o.id, k: "node", v: o.v, next: o.next, ...withRef });
    else if (o.k === "bin" && short(o.v) && idOrNull(o.l) && idOrNull(o.r) && !refs) out.push({ id: o.id, k: "bin", v: o.v, l: o.l, r: o.r, ...withRef });
    else if (o.k === "obj" && short(o.type) && !refs && o.ref === undefined) { const fields = readPairs(o.fields); if (!fields) return null; out.push({ id: o.id, k: "obj", type: o.type, fields }); }
    else if (rich && (o.k === "array" || o.k === "set") && short(o.type) && cells(o.items)) out.push({ id: o.id, k: o.k, type: o.type, items: o.items, ...withRefs });
    else if (rich && o.k === "map" && short(o.type) && cells(o.keys) && cells(o.items) && o.keys.length === o.items.length) out.push({ id: o.id, k: "map", type: o.type, keys: o.keys, items: o.items, ...withRefs });
    else if (rich && o.k === "grid" && short(o.type) && !refs && Array.isArray(o.rows) && o.rows.length <= 20 && o.rows.every(r => cells(r) && r.length <= 20)) out.push({ id: o.id, k: "grid", type: o.type, rows: o.rows as string[][] });
    else return null;
  }
  // every link points at an object of the right kind in this very state; a V5 reference at an object that is there
  const kind = new Map(out.map(o => [o.id, o.k]));
  for (const o of out) {
    if (o.k === "node" && o.next !== null && kind.get(o.next) !== "node") return null;
    if (o.k === "bin" && [o.l, o.r].some(c => c !== null && kind.get(c) !== "bin")) return null;
    if ("refs" in o && o.refs && o.refs.some(r => r !== null && !kind.has(r))) return null;
    if ((o.k === "node" || o.k === "bin") && o.ref !== undefined && !kind.has(o.ref)) return null;
  }
  return out;
}

/**
 * Reads a `ds-trace` config: `{ code, given?, stdin?, out, steps: [{ l, n, f?, h?, o, e?, p? }] }` (`p`: the lab's Viz.Pause — never in a
 * course trace; only the teacher's player stops on it). A step's frames (`f`) and
 * objects (`h`) are omitted when they equal the previous step's; `o` is how many characters of `out` were printed so far.
 * `limits`: the course's own (DS_LIMITS) by default; the teacher's visual run (src/studentTools/labTrace.ts) allows a longer
 * program and trace — every other check is the same.
 * `rich` (V5, the teacher's visual run only): the v2 additions are read — `refs` / `ref`, the kinds array / set / map and
 * `pointers`. Without it (every course trace) any of them makes the trace unreadable: a course trace reads exactly as before.
 */
export function readDsTrace(config: unknown, limits: { steps: number; lines: number } = DS_LIMITS, rich = false): DsTrace | null {
  const c = rec(config);
  if (!isStr(c.code) || !c.code.trim() || !isStr(c.out) || !Array.isArray(c.steps) || c.steps.length < 1 || c.steps.length > limits.steps) return null;
  const lines = c.code.split("\n");
  if (lines.length > limits.lines) return null;
  const steps: DsStep[] = [];
  let frames: DsFrame[] | null = null, objs: DsObj[] | null = null, printed = 0;
  for (const raw of c.steps) {
    const s = rec(raw);
    if (!isInt(s.l) || s.l < 0 || s.l > lines.length || !isStr(s.n) || s.n.length > 600 || !isInt(s.o) || s.o < printed || s.o > c.out.length) return null;
    if (s.f !== undefined) frames = readFrames(s.f, rich);
    if (s.r !== undefined && (!rich || !short(s.r))) return null;   // V8: the returned value, rich only
    // V9: the expressions' values, rich only: at most 12 [expression, value] pairs
    if (s.x !== undefined && (!rich || !Array.isArray(s.x) || s.x.length > 12 || !s.x.every(p => Array.isArray(p) && p.length === 2 && short(p[0]) && short(p[1])))) return null;
    if (s.h !== undefined) objs = readObjs(s.h, rich);
    if (!frames || !objs) return null;
    const ids = new Set(objs.map(o => o.id));
    const refs = [...frames.flatMap(f => f.vars), ...objs.flatMap(o => (o.k === "obj" ? o.fields : []))];
    if (refs.some(([, v]) => v.t === "ref" && !ids.has(v.id))) return null;
    printed = s.o;
    steps.push({ line: s.l, note: s.n, frames, objs, out: c.out.slice(0, s.o), error: s.e === true, ...(s.p === true ? { pause: true } : {}), ...(isStr(s.r) ? { ret: s.r } : {}), ...(Array.isArray(s.x) && s.x.length ? { evals: s.x as [string, string][] } : {}) });
  }
  const ident = (v: unknown) => isStr(v) && /^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(v);
  let pointers: string[][] | undefined;
  if (c.pointers !== undefined) {
    if (!rich || !Array.isArray(c.pointers) || c.pointers.length > 20 || !c.pointers.every(p => Array.isArray(p) && (p.length === 2 || p.length === 3) && p.every(ident))) return null;
    pointers = c.pointers as string[][];
  }
  let digits: [string, number][] | undefined;   // V9
  if (c.digits !== undefined) {
    if (!rich || !Array.isArray(c.digits) || c.digits.length > 10 || !c.digits.every(p => Array.isArray(p) && p.length === 2 && ident(p[0]) && [2, 8, 10, 16].includes(p[1] as number))) return null;
    digits = c.digits as [string, number][];
  }
  return { lines, ...(short(c.given) || (isStr(c.given) && c.given.length <= 300) ? { given: c.given as string } : {}), ...(isStr(c.stdin) ? { stdin: c.stdin } : {}), steps,
    ...(pointers && pointers.length ? { pointers } : {}), ...(digits && digits.length ? { digits } : {}) };
}

// ── what a state is drawn as ──────────────────────────────────────────────────────────────────────────────────────────
/** A name pointing at something; `top` = it belongs to the method running now. */
export type DsLabel = { name: string; top: boolean };
export type DsBoxes = { id: number; items: string[]; labels: DsLabel[] };
export type DsChainNode = { id: number; v: string; labels: DsLabel[] };
/** A chain ends at null, joins a cell already drawn in another chain (`join` = that cell's value) or loops back. */
export type DsChain = { nodes: DsChainNode[]; end: "null" | "join" | "cycle"; join?: string };
export type DsTreeNode = { id: number; v: string; x: number; depth: number; parent: number | null; labels: DsLabel[] };
export type DsTree = { nodes: DsTreeNode[] };
/** V5: an array / List (`indexed`: its cells numbered from 0, and `marks` = the index variables pointing at a cell) or a set. */
export type DsMark = { name: string; at: number; top: boolean };
export type DsRow = { id: number; k: "array" | "set"; type: string; items: string[]; labels: DsLabel[]; indexed: boolean; marks: DsMark[] };
export type DsMapScene = { id: number; type: string; keys: string[]; items: string[]; labels: DsLabel[] };
export type DsScene = { stacks: DsBoxes[]; queues: DsBoxes[]; chains: DsChain[]; trees: DsTree[]; objects: Extract<DsObj, { k: "obj" }>[];
  rows: DsRow[]; maps: DsMapScene[] };

/** V5: an item that refers to an object is drawn with its text and «→#id»; the object it refers to is drawn too, named «#id». */
export const refText = (text: string, ref: number | null | undefined) => (ref === null || ref === undefined ? text : text + " →#" + ref);
const withRefs = (items: string[], refs?: (number | null)[]) => items.map((t, i) => refText(t, refs?.[i]));

/** In-order x positions and depths of a binary tree given as (id → children). Pure; guards against a malformed (cyclic) tree. */
export function layoutTree(root: number, kids: (id: number) => { l: number | null; r: number | null } | undefined): { id: number; x: number; depth: number; parent: number | null }[] {
  const out: { id: number; x: number; depth: number; parent: number | null }[] = [];
  const seen = new Set<number>();
  let x = 0;
  const walk = (id: number, depth: number, parent: number | null) => {
    if (seen.has(id) || depth > 12) return;
    seen.add(id);
    const k = kids(id);
    if (k?.l != null) walk(k.l, depth + 1, id);
    out.push({ id, x: x++, depth, parent });
    if (k?.r != null) walk(k.r, depth + 1, id);
  };
  walk(root, 0, null);
  return out;
}

/** The drawing of one program state: every structure with the names that point at it. `pointers` (V5): see DsTrace. */
export function sceneOf(frames: DsFrame[], objs: DsObj[], pointers?: string[][]): DsScene {
  const labels = new Map<number, DsLabel[]>();
  frames.forEach((f, i) => {
    const top = i === frames.length - 1;
    for (const [name, v] of f.vars) {
      if (v.t !== "ref") continue;
      const list = labels.get(v.id) ?? [];
      const same = list.find(l => l.name === name);
      if (same) same.top = same.top || top; else list.push({ name, top });
      labels.set(v.id, list);
    }
  });
  // V5: what an item or a cell refers to is named «#id» (a drawing has no variable for it)
  for (const o of objs) {
    const targets = "refs" in o && o.refs ? o.refs : (o.k === "node" || o.k === "bin") && o.ref !== undefined ? [o.ref] : [];
    for (const t of targets) {
      if (t === null) continue;
      const list = labels.get(t) ?? [];
      if (!list.some(l => l.name === "#" + t)) list.push({ name: "#" + t, top: true });
      labels.set(t, list);
    }
  }
  const lab = (id: number) => labels.get(id) ?? [];
  const byId = new Map(objs.map(o => [o.id, o]));
  // V5: the index variables of a[i]: in each method, a variable `i` holding a whole number marks that cell of the array `a` refers to
  const marks = new Map<number, DsMark[]>();
  frames.forEach((f, fi) => {
    const vars = new Map(f.vars);
    for (const [a, i] of (pointers ?? []).filter(p => p.length === 2)) {
      const arr = vars.get(a), idx = vars.get(i);
      if (arr?.t !== "ref" || idx?.t !== "v" || !/^-?\d+$/.test(idx.s)) continue;
      const target = byId.get(arr.id);
      if (target?.k !== "array") continue;
      const at = Number(idx.s);
      if (at < 0 || at > target.items.length) continue;
      const list = marks.get(arr.id) ?? [];
      const top = fi === frames.length - 1;
      const same = list.find(m => m.name === i && m.at === at);
      if (same) same.top = same.top || top; else list.push({ name: i, at, top });
      marks.set(arr.id, list);
    }
  });
  const scene: DsScene = { stacks: [], queues: [], chains: [], trees: [], objects: [], rows: [], maps: [] };
  for (const o of objs) {
    if (o.k === "stack") scene.stacks.push({ id: o.id, items: withRefs(o.items, o.refs), labels: lab(o.id) });
    else if (o.k === "queue") scene.queues.push({ id: o.id, items: withRefs(o.items, o.refs), labels: lab(o.id) });
    else if (o.k === "obj") scene.objects.push(o);
    else if (o.k === "array" || o.k === "set") {
      const indexed = o.k === "array" && !o.type.startsWith("LinkedList<");
      scene.rows.push({ id: o.id, k: o.k, type: o.type, items: withRefs(o.items, o.refs), labels: lab(o.id), indexed, marks: indexed ? marks.get(o.id) ?? [] : [] });
    }
    else if (o.k === "map") scene.maps.push({ id: o.id, type: o.type, keys: o.keys, items: withRefs(o.items, o.refs), labels: lab(o.id) });
  }
  // chains: start from the cells nothing points at, then any cell left (a ring)
  const nodes = objs.filter((o): o is Extract<DsObj, { k: "node" }> => o.k === "node");
  const pointed = new Set(nodes.map(n => n.next).filter((n): n is number => n !== null));
  const drawn = new Set<number>();
  for (const head of [...nodes.filter(n => !pointed.has(n.id)), ...nodes]) {
    if (drawn.has(head.id)) continue;
    const chain: DsChain = { nodes: [], end: "null" };
    const mine = new Set<number>();
    let cur: typeof head | undefined = head;
    while (cur) {
      if (mine.has(cur.id)) { chain.end = "cycle"; chain.join = cur.v; break; }
      if (drawn.has(cur.id)) { chain.end = "join"; chain.join = cur.v; break; }
      mine.add(cur.id); drawn.add(cur.id);
      chain.nodes.push({ id: cur.id, v: refText(cur.v, cur.ref), labels: lab(cur.id) });
      cur = cur.next === null ? undefined : (byId.get(cur.next) as typeof head | undefined);
    }
    scene.chains.push(chain);
  }
  // trees: start from the cells that are nobody's child
  const bins = objs.filter((o): o is Extract<DsObj, { k: "bin" }> => o.k === "bin");
  const child = new Set(bins.flatMap(b => [b.l, b.r]).filter((n): n is number => n !== null));
  const placed = new Set<number>();
  for (const root of [...bins.filter(b => !child.has(b.id)), ...bins]) {
    if (placed.has(root.id)) continue;
    const laid = layoutTree(root.id, id => (placed.has(id) && id !== root.id ? undefined : (byId.get(id) as Extract<DsObj, { k: "bin" }> | undefined)));
    laid.forEach(n => placed.add(n.id));
    scene.trees.push({ nodes: laid.map(n => { const b = byId.get(n.id) as Extract<DsObj, { k: "bin" }>; return { ...n, v: refText(b.v, b.ref), labels: lab(n.id) }; }) });
  }
  return scene;
}

// ── V9 «أسس علم الحاسوب»: a 2D array, a string being indexed, a number being taken apart (the teacher's visual run) ─────────────
export type DsGrid = { id: number; type: string; rows: string[][]; labels: string[]; mark: { r: number; c: number; names: string } | null };
export type DsText = { name: string; chars: string[]; marks: DsMark[] };
export type DsPlaces = { name: string; base: number; value: string; digits: string[]; hot: boolean };
const whole = (v: DsVal | undefined): number | null => (v?.t === "v" && /^-?\d{1,15}$/.test(v.s) ? Number(v.s) : null);
/** The extra drawings of one step (pure): every grid with the a[i, j] cell its index variables point at; every string a[i] indexes,
 *  as cells with the index arrow; every number the program takes apart (n % 10, n / 10 — or base 2, 8, 16) in place-value boxes,
 *  «hot» when this step's own `n % base` was evaluated. Only the running method's variables (the top frame). */
export function extrasOf(step: DsStep, pointers?: string[][], digits?: [string, number][]): { grids: DsGrid[]; texts: DsText[]; places: DsPlaces[] } {
  const top = step.frames[step.frames.length - 1];
  const vars = new Map(top?.vars ?? []);
  const grids: DsGrid[] = step.objs.filter((o): o is Extract<DsObj, { k: "grid" }> => o.k === "grid").map(o => {
    const labels = (top?.vars ?? []).filter(([, v]) => v.t === "ref" && v.id === o.id).map(([n]) => n);
    let mark: DsGrid["mark"] = null;
    for (const p of pointers ?? []) {
      if (p.length !== 3 || !labels.includes(p[0])) continue;
      const r = whole(vars.get(p[1])), c = whole(vars.get(p[2]));
      if (r !== null && c !== null && r >= 0 && c >= 0 && r < o.rows.length && c < (o.rows[r]?.length ?? 0)) { mark = { r, c, names: p[1] + ", " + p[2] }; break; }
    }
    return { id: o.id, type: o.type, rows: o.rows, labels, mark };
  });
  const texts: DsText[] = [];
  for (const p of pointers ?? []) {
    if (p.length !== 2 || texts.some(t => t.name === p[0])) continue;
    const v = vars.get(p[0]);
    if (v?.t !== "v" || v.s.length < 2 || v.s[0] !== '"' || v.s[v.s.length - 1] !== '"') continue;
    const chars = [...v.s.slice(1, -1)].slice(0, DS_LIMITS.items);
    const marks = (pointers ?? []).filter(q => q.length === 2 && q[0] === p[0]).flatMap(q => {
      const at = whole(vars.get(q[1]));
      return at !== null && at >= 0 && at <= chars.length ? [{ name: q[1], at, top: true }] : [];
    });
    texts.push({ name: p[0], chars, marks });
  }
  const places: DsPlaces[] = [];
  for (const [name, base] of digits ?? []) {
    const n = whole(vars.get(name));
    if (n === null || places.some(x => x.name === name && x.base === base)) continue;
    const ds = Math.abs(n).toString(base).toUpperCase().split("").slice(-16);
    places.push({ name, base, value: String(n), digits: ds, hot: (step.evals ?? []).some(([e]) => e.replace(/\s+/g, "") === name + "%" + base) });
  }
  return { grids, texts, places };
}

// ── the lab and the figure: a tree written as [value, left, right] ────────────────────────────────────────────────────
export type Bst = { key: number; v: string; l: Bst | null; r: Bst | null };
export const TREE_MAX_NODES = 15;
export const TREE_MAX_DEPTH = 5;
/** Reads `[value, left?, right?]` (a bare value is a leaf; null = no child) into a tree with stable keys (pre-order numbers). */
export function readTree(raw: unknown): Bst | null | undefined {
  let n = 0, bad = false;
  const walk = (x: unknown, depth: number): Bst | null => {
    if (x === null || x === undefined) return null;
    if (depth > TREE_MAX_DEPTH || ++n > TREE_MAX_NODES) { bad = true; return null; }
    const [v, l, r] = Array.isArray(x) ? x : [x];
    if (Array.isArray(x) && x.length > 3) bad = true;
    if (!(isStr(v) || (typeof v === "number" && Number.isFinite(v))) || String(v).length > 8 || String(v) === "") { bad = true; return null; }
    const node: Bst = { key: n, v: String(v), l: null, r: null };
    node.l = walk(l, depth + 1);
    node.r = walk(r, depth + 1);
    return node;
  };
  const t = walk(raw, 0);
  return bad ? undefined : t;
}
export const treeSize = (t: Bst | null): number => (t ? 1 + treeSize(t.l) + treeSize(t.r) : 0);
/** Height as the book counts it: an empty tree −1, a single cell 0. */
export const treeHeight = (t: Bst | null): number => (t ? 1 + Math.max(treeHeight(t.l), treeHeight(t.r)) : -1);
export const treeLeaves = (t: Bst | null): Bst[] => (!t ? [] : !t.l && !t.r ? [t] : [...treeLeaves(t.l), ...treeLeaves(t.r)]);
export type Traversal = "pre" | "in" | "post" | "level";
export function traverse(t: Bst | null, how: Traversal): Bst[] {
  if (!t) return [];
  if (how === "level") { const out: Bst[] = [], q: Bst[] = [t]; while (q.length) { const n = q.shift()!; out.push(n); if (n.l) q.push(n.l); if (n.r) q.push(n.r); } return out; }
  const l = traverse(t.l, how), r = traverse(t.r, how);
  return how === "pre" ? [t, ...l, ...r] : how === "in" ? [...l, t, ...r] : [...l, ...r, t];
}
export function layoutBst(t: Bst | null): { node: Bst; x: number; depth: number; parent: number | null }[] {
  const out: { node: Bst; x: number; depth: number; parent: number | null }[] = [];
  let x = 0;
  const walk = (n: Bst | null, depth: number, parent: number | null) => { if (!n) return; walk(n.l, depth + 1, n.key); out.push({ node: n, x: x++, depth, parent }); walk(n.r, depth + 1, n.key); };
  walk(t, 0, null);
  return out;
}
const numOf = (v: string) => Number(v);
/** Search path in a binary search tree of numbers: the cells compared, and whether the value was found. */
export function bstSearch(t: Bst | null, x: number): { path: Bst[]; found: boolean } {
  const path: Bst[] = [];
  for (let n = t; n; n = x < numOf(n.v) ? n.l : n.r) { path.push(n); if (numOf(n.v) === x) return { path, found: true }; }
  return { path, found: false };
}
/** Insert as the book does (smaller to the left, otherwise to the right); a value already there is not inserted twice. */
export function bstInsert(t: Bst | null, x: number, key: number): { tree: Bst; path: Bst[]; inserted: boolean } {
  const { path, found } = bstSearch(t, x);
  if (found) return { tree: t!, path, inserted: false };
  const add = (n: Bst | null): Bst => (!n ? { key, v: String(x), l: null, r: null } : x < numOf(n.v) ? { ...n, l: add(n.l) } : { ...n, r: add(n.r) });
  return { tree: add(t), path, inserted: true };
}
/**
 * Delete, the book's three cases: a leaf is removed; a cell with one child is replaced by that child; a cell with two children
 * takes the smallest value of its right subtree (its in-order successor), which is then removed from there.
 */
export function bstDelete(t: Bst | null, x: number): { tree: Bst | null; found: boolean; kind?: "leaf" | "one" | "two"; successor?: string } {
  let kind: "leaf" | "one" | "two" | undefined, successor: string | undefined;
  const minOf = (n: Bst): Bst => (n.l ? minOf(n.l) : n);
  const del = (n: Bst | null, v: number, mark: boolean): Bst | null => {
    if (!n) return null;
    if (v < numOf(n.v)) return { ...n, l: del(n.l, v, mark) };
    if (v > numOf(n.v)) return { ...n, r: del(n.r, v, mark) };
    if (!n.l && !n.r) { if (mark) kind = "leaf"; return null; }
    if (!n.l || !n.r) { if (mark) kind = "one"; return n.l ?? n.r; }
    const m = minOf(n.r);
    if (mark) { kind = "two"; successor = m.v; }
    return { ...n, v: m.v, r: del(n.r, numOf(m.v), false) };
  };
  if (!bstSearch(t, x).found) return { tree: t, found: false };
  return { tree: del(t, x, true), found: true, kind, successor };
}
/** Is the tree (of numbers) a binary search tree? In-order must be strictly increasing. */
export function isBst(t: Bst | null): boolean {
  const vals = traverse(t, "in").map(n => numOf(n.v));
  return vals.every(v => Number.isFinite(v)) && vals.every((v, i) => i === 0 || vals[i - 1] < v);
}

// ── lab config ────────────────────────────────────────────────────────────────────────────────────────────────────────
export type DsValueType = "int" | "char" | "string";
export type DsLabConfig =
  | { structure: "stack"; valueType: DsValueType; name: string; values: string[] }
  | { structure: "queue"; valueType: DsValueType; name: string; values: string[] }
  | { structure: "chain"; valueType: DsValueType; name: string; values: string[] }
  | { structure: "tree"; valueType: "int"; name: string; tree: Bst | null }
  | { structure: "bst"; valueType: "int"; name: string; tree: Bst | null };
export const LAB_MAX_ITEMS = 8;
/** A value the learner types (or the author gave), by the structure's element type. */
export function readLabValue(text: string, type: DsValueType): string | null {
  const s = text.trim();
  if (type === "int") return /^-?\d{1,3}$/.test(s) ? String(Number(s)) : null;
  if (type === "char") return /^[A-Za-z0-9*+\-/#@()[\]{}]$/.test(s) ? s : null;
  return /^[\p{L}\p{N}_]{1,8}$/u.test(s) ? s : null;
}
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,11}$/;
export function readDsLab(config: unknown): DsLabConfig | null {
  const c = rec(config);
  const name = c.name === undefined ? null : isStr(c.name) && NAME.test(c.name) ? c.name : undefined;
  if (name === undefined) return null;
  if (c.structure === "tree" || c.structure === "bst") {
    const tree = readTree(c.tree ?? null);
    if (tree === undefined) return null;
    if (traverse(tree, "pre").some(n => !/^-?\d{1,3}$/.test(n.v))) return null;
    if (c.structure === "bst" && !isBst(tree)) return null;
    return { structure: c.structure, valueType: "int", name: name ?? "t", tree };
  }
  if (c.structure !== "stack" && c.structure !== "queue" && c.structure !== "chain") return null;
  const valueType: DsValueType = c.valueType === undefined ? "int" : c.valueType === "int" || c.valueType === "char" || c.valueType === "string" ? c.valueType : (null as never);
  if (!valueType) return null;
  const raw = c.values ?? [];
  if (!Array.isArray(raw) || raw.length > LAB_MAX_ITEMS) return null;
  const values = raw.map(v => (isStr(v) || typeof v === "number" ? readLabValue(String(v), valueType) : null));
  if (values.some(v => v === null)) return null;
  return { structure: c.structure, valueType, name: name ?? (c.structure === "stack" ? "s" : c.structure === "queue" ? "q" : "chain"), values: values as string[] };
}

// ── figure config ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type DsPanel =
  | { kind: "stack"; label?: string; items: string[] }
  | { kind: "queue"; label?: string; items: string[] }
  | { kind: "chain"; label?: string; items: string[]; pointers: [string, number][]; hi: number[] }
  | { kind: "tree"; label?: string; tree: Bst | null; pointers: [string, number][]; hi: number[]; facts: boolean };
export type DsFigure = { panels: DsPanel[] };
/** A tree position written as a path from the root: "" = the root, "L", "LR" … → the cell's key, or null. */
export function keyAtPath(t: Bst | null, path: string): number | null {
  let n = t;
  for (const ch of path) n = n ? (ch === "L" ? n.l : n.r) : null;
  return n ? n.key : null;
}
export function readDsFigure(config: unknown): DsFigure | null {
  const c = rec(config);
  if (!Array.isArray(c.panels) || c.panels.length < 1 || c.panels.length > 4) return null;
  const panels: DsPanel[] = [];
  for (const raw of c.panels) {
    const p = rec(raw);
    const label = p.label === undefined ? undefined : isStr(p.label) && p.label.length <= 60 ? p.label : null;
    if (label === null) return null;
    const base = label === undefined ? {} : { label };
    if (p.kind === "tree") {
      const tree = readTree(p.tree ?? null);
      if (tree === undefined) return null;
      const at = (path: unknown) => (isStr(path) && /^[LR]{0,5}$/.test(path) ? keyAtPath(tree, path) : null);
      const pointers: [string, number][] = [];
      for (const q of Array.isArray(p.pointers) ? p.pointers : []) { const k = Array.isArray(q) && isStr(q[0]) && NAME.test(q[0]) ? at(q[1]) : null; if (k === null) return null; pointers.push([q[0], k]); }
      const hi: number[] = [];
      for (const q of Array.isArray(p.hi) ? p.hi : []) { const k = at(q); if (k === null) return null; hi.push(k); }
      panels.push({ kind: "tree", ...base, tree, pointers, hi, facts: p.facts === true });
      continue;
    }
    if (p.kind !== "stack" && p.kind !== "queue" && p.kind !== "chain") return null;
    if (!Array.isArray(p.items) || p.items.length > 12 || !p.items.every(v => (isStr(v) || typeof v === "number") && String(v).length >= 1 && String(v).length <= 12)) return null;
    const items = p.items.map(String);
    if (p.kind !== "chain") { panels.push({ kind: p.kind, ...base, items }); continue; }
    const inRange = (i: unknown): i is number => isInt(i) && i >= 0 && i < items.length;
    const pointers: [string, number][] = [];
    for (const q of Array.isArray(p.pointers) ? p.pointers : []) { if (!Array.isArray(q) || !isStr(q[0]) || !NAME.test(q[0]) || !inRange(q[1])) return null; pointers.push([q[0], q[1]]); }
    const hi = Array.isArray(p.hi) ? p.hi : [];
    if (!hi.every(inRange)) return null;
    panels.push({ kind: "chain", ...base, items, pointers, hi: hi as number[] });
  }
  return { panels };
}

// ── the solution window (guided / ds-solution / v1) ──────────────────────────────────────────────────────────────────
/** What the «الحل» window shows beside the block's own steps and result: the solution's code, what a correct solution must
 *  contain, and the trace of the solution. All optional; every text may hold `code` runs. */
export type DsSolution = { code?: string; checklist: string[]; trace?: DsTrace };
export function readDsSolution(config: unknown): DsSolution | null {
  const c = rec(config ?? {});
  if (Object.keys(c).some(k => k !== "code" && k !== "checklist" && k !== "trace")) return null;
  if (c.code !== undefined && (!isStr(c.code) || !c.code.trim() || c.code.split("\n").length > DS_LIMITS.lines)) return null;
  const checklist = c.checklist ?? [];
  if (!Array.isArray(checklist) || checklist.length > 12 || !checklist.every(t => isStr(t) && t.length > 0 && t.length <= 400)) return null;
  let trace: DsTrace | undefined;
  if (c.trace !== undefined) { const t = readDsTrace(c.trace); if (!t) return null; trace = t; }
  return { ...(isStr(c.code) ? { code: c.code } : {}), checklist: checklist as string[], ...(trace ? { trace } : {}) };
}
