// DS-A1 (docs/enterprise-data-structures-course.md) — the DATA of the data-structure activities: the recorded trace
// (simulation / ds-trace / v1), the interactive lab (simulation / ds-lab / v1) and the static figure (interactive-diagram /
// ds-figure / v1). Pure: strict readers (anything unexpected → null, the activity then says it is unavailable), the scene a
// program state is drawn as, the tree layout and the binary-search-tree operations of the lab. No React, nothing executed.

export type DsVal = { t: "v"; s: string } | { t: "null" } | { t: "ref"; id: number } | { t: "arr"; items: string[] };
export type DsObj =
  | { id: number; k: "stack"; items: string[] }
  | { id: number; k: "queue"; items: string[] }
  | { id: number; k: "node"; v: string; next: number | null }
  | { id: number; k: "bin"; v: string; l: number | null; r: number | null }
  | { id: number; k: "obj"; type: string; fields: [string, DsVal][] };
export type DsFrame = { name: string; vars: [string, DsVal][] };
export type DsStep = { line: number; note: string; frames: DsFrame[]; objs: DsObj[]; out: string; error: boolean };
export type DsTrace = { lines: string[]; given?: string; stdin?: string; steps: DsStep[] };

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
function readFrames(raw: unknown): DsFrame[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > DS_LIMITS.frames) return null;
  const out: DsFrame[] = [];
  for (const f of raw) {
    const o = rec(f), vars = readPairs(o.vars);
    if (!short(o.name) || !vars) return null;
    out.push({ name: o.name, vars });
  }
  return out;
}
const idOrNull = (v: unknown): v is number | null => v === null || isInt(v);
function readObjs(raw: unknown): DsObj[] | null {
  if (!Array.isArray(raw) || raw.length > DS_LIMITS.objs) return null;
  const out: DsObj[] = [], ids = new Set<number>();
  for (const x of raw) {
    const o = rec(x);
    if (!isInt(o.id) || ids.has(o.id)) return null;
    ids.add(o.id);
    if ((o.k === "stack" || o.k === "queue") && Array.isArray(o.items) && o.items.length <= DS_LIMITS.items && o.items.every(short)) out.push({ id: o.id, k: o.k, items: o.items as string[] });
    else if (o.k === "node" && short(o.v) && idOrNull(o.next)) out.push({ id: o.id, k: "node", v: o.v, next: o.next });
    else if (o.k === "bin" && short(o.v) && idOrNull(o.l) && idOrNull(o.r)) out.push({ id: o.id, k: "bin", v: o.v, l: o.l, r: o.r });
    else if (o.k === "obj" && short(o.type)) { const fields = readPairs(o.fields); if (!fields) return null; out.push({ id: o.id, k: "obj", type: o.type, fields }); }
    else return null;
  }
  // every link points at an object of the right kind in this very state
  const kind = new Map(out.map(o => [o.id, o.k]));
  for (const o of out) {
    if (o.k === "node" && o.next !== null && kind.get(o.next) !== "node") return null;
    if (o.k === "bin" && [o.l, o.r].some(c => c !== null && kind.get(c) !== "bin")) return null;
  }
  return out;
}

/**
 * Reads a `ds-trace` config: `{ code, given?, stdin?, out, steps: [{ l, n, f?, h?, o, e? }] }`. A step's frames (`f`) and
 * objects (`h`) are omitted when they equal the previous step's; `o` is how many characters of `out` were printed so far.
 */
export function readDsTrace(config: unknown): DsTrace | null {
  const c = rec(config);
  if (!isStr(c.code) || !c.code.trim() || !isStr(c.out) || !Array.isArray(c.steps) || c.steps.length < 1 || c.steps.length > DS_LIMITS.steps) return null;
  const lines = c.code.split("\n");
  if (lines.length > DS_LIMITS.lines) return null;
  const steps: DsStep[] = [];
  let frames: DsFrame[] | null = null, objs: DsObj[] | null = null, printed = 0;
  for (const raw of c.steps) {
    const s = rec(raw);
    if (!isInt(s.l) || s.l < 0 || s.l > lines.length || !isStr(s.n) || s.n.length > 600 || !isInt(s.o) || s.o < printed || s.o > c.out.length) return null;
    if (s.f !== undefined) frames = readFrames(s.f);
    if (s.h !== undefined) objs = readObjs(s.h);
    if (!frames || !objs) return null;
    const ids = new Set(objs.map(o => o.id));
    const refs = [...frames.flatMap(f => f.vars), ...objs.flatMap(o => (o.k === "obj" ? o.fields : []))];
    if (refs.some(([, v]) => v.t === "ref" && !ids.has(v.id))) return null;
    printed = s.o;
    steps.push({ line: s.l, note: s.n, frames, objs, out: c.out.slice(0, s.o), error: s.e === true });
  }
  return { lines, ...(short(c.given) || (isStr(c.given) && c.given.length <= 300) ? { given: c.given as string } : {}), ...(isStr(c.stdin) ? { stdin: c.stdin } : {}), steps };
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
export type DsScene = { stacks: DsBoxes[]; queues: DsBoxes[]; chains: DsChain[]; trees: DsTree[]; objects: Extract<DsObj, { k: "obj" }>[] };

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

/** The drawing of one program state: every structure with the names that point at it. */
export function sceneOf(frames: DsFrame[], objs: DsObj[]): DsScene {
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
  const lab = (id: number) => labels.get(id) ?? [];
  const byId = new Map(objs.map(o => [o.id, o]));
  const scene: DsScene = { stacks: [], queues: [], chains: [], trees: [], objects: [] };
  for (const o of objs) {
    if (o.k === "stack") scene.stacks.push({ id: o.id, items: o.items, labels: lab(o.id) });
    else if (o.k === "queue") scene.queues.push({ id: o.id, items: o.items, labels: lab(o.id) });
    else if (o.k === "obj") scene.objects.push(o);
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
      chain.nodes.push({ id: cur.id, v: cur.v, labels: lab(cur.id) });
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
    scene.trees.push({ nodes: laid.map(n => ({ ...n, v: (byId.get(n.id) as Extract<DsObj, { k: "bin" }>).v, labels: lab(n.id) })) });
  }
  return scene;
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
