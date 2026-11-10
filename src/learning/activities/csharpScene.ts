// 899371 P11 (docs/enterprise-899371-enrichment-plan.md §3.1, §8) — the DATA of the animated scene (animation / csharp-scene / v1):
// a scene is a small SVG stage of items (a variable box, array cells, a grid, a number line, a console screen, a line of code, an
// arrow, a text, a moving token) and a list of steps; each step says one Arabic sentence and CHANGES some items (`set`). The
// validator reads a block config into the full state of every step, or refuses the whole scene (null). Strict on purpose: an unknown
// kind, an unknown or ill-typed key, a duplicate id, a step that names no item, a coordinate off the stage, a string too long → null.
// Nothing here executes content: every value is a number, a boolean, a short string or a list of them. Pure; shared by
// CSharpSceneActivity.tsx and its tests.
export type Tone = "base" | "accent" | "ok" | "bad" | "warn" | "muted";
export type Anchor = "left" | "middle" | "right";
export type Mark = { v: number; label: string; tone: Tone };
export type Item = {
  id: string; kind: Kind; x: number; y: number; show: boolean; tone: Tone;
  w?: number; h?: number; label?: string; value?: string; shape?: "rect" | "round" | "diamond"; mono?: boolean;
  values?: string[]; size?: number; base?: number; hi?: number[]; bad?: number[]; idx?: boolean;
  rows?: string[][]; cellsHi?: number[][];
  text?: string; anchor?: Anchor; big?: boolean;
  x2?: number; y2?: number; dash?: boolean;
  lines?: string[]; hl?: number;
  min?: number; max?: number; step?: number; marks?: Mark[];
};
export type Kind = "box" | "cells" | "grid" | "text" | "arrow" | "code" | "screen" | "axis" | "token";
export type SceneConfig = { w: number; h: number; alt: string; says: string[]; frames: Item[][] };

export const SCENE_LIMITS = Object.freeze({ maxW: 480, maxH: 360, items: 40, steps: 24, text: 160, say: 240, list: 16, rows: 6, lines: 12 });
const KINDS: readonly Kind[] = ["box", "cells", "grid", "text", "arrow", "code", "screen", "axis", "token"];
const TONES: readonly Tone[] = ["base", "accent", "ok", "bad", "warn", "muted"];
const ID = /^[a-z][a-z0-9-]{0,23}$/;

type Reader = (v: unknown) => unknown;
const L = SCENE_LIMITS;
const str = (max: number): Reader => v => (typeof v === "string" && v.length <= max ? v : undefined);
const num = (lo: number, hi: number): Reader => v => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
const int = (lo: number, hi: number): Reader => v => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? v : undefined);
const bool: Reader = v => (typeof v === "boolean" ? v : undefined);
const oneOf = (list: readonly string[]): Reader => v => (typeof v === "string" && list.includes(v) ? v : undefined);
const listOf = (r: Reader, max: number, min = 0): Reader => v => {
  if (!Array.isArray(v) || v.length > max || v.length < min) return undefined;
  const out = v.map(r);
  return out.every(x => x !== undefined) ? out : undefined;
};
const mark: Reader = v => {
  const o = (v ?? {}) as Record<string, unknown>;
  if (typeof v !== "object" || v === null || Object.keys(o).some(k => !["v", "label", "tone"].includes(k))) return undefined;
  const n = num(-1e6, 1e6)(o.v), label = o.label === undefined ? "" : str(L.text)(o.label), tone = o.tone === undefined ? "accent" : oneOf(TONES)(o.tone);
  return n === undefined || label === undefined || tone === undefined ? undefined : { v: n, label, tone };
};

// Every key an item may carry, per kind (x / y / show / tone for all). A step may change the same keys, except `kind` and `id`.
const COMMON: Record<string, Reader> = { show: bool, tone: oneOf(TONES) };
const POS = (s: SceneSize): Record<string, Reader> => ({ x: num(0, s.w), y: num(0, s.h) });
type SceneSize = { w: number; h: number };
function keysOf(kind: Kind, s: SceneSize): Record<string, Reader> {
  const at = { ...COMMON, ...POS(s) };
  switch (kind) {
    case "box": return { ...at, w: num(8, s.w), h: num(8, s.h), label: str(L.text), value: str(L.text), shape: oneOf(["rect", "round", "diamond"]), mono: bool };
    case "cells": return { ...at, values: listOf(str(24), L.list, 1), size: num(16, 64), base: int(0, 9), hi: listOf(int(0, L.list - 1), L.list), bad: listOf(int(0, L.list - 1), L.list), label: str(L.text), idx: bool };
    case "grid": return { ...at, rows: listOf(listOf(str(12), L.rows, 1), L.rows, 1), size: num(16, 64), cellsHi: listOf(listOf(int(0, L.rows - 1), 2, 2), L.rows * L.rows), label: str(L.text), idx: bool };
    case "text": return { ...at, text: str(L.text), anchor: oneOf(["left", "middle", "right"]), big: bool, mono: bool };
    case "arrow": return { ...at, x2: num(0, s.w), y2: num(0, s.h), label: str(L.text), dash: bool };
    case "code": return { ...at, lines: listOf(str(64), L.lines, 1), hl: int(0, L.lines) };
    case "screen": return { ...at, w: num(40, s.w), h: num(24, s.h), text: str(L.text), label: str(L.text) };
    case "axis": return { ...at, w: num(40, s.w), min: num(-1e6, 1e6), max: num(-1e6, 1e6), step: num(0.001, 1e6), marks: listOf(mark, 8) };
    case "token": return { ...at, text: str(24) };
  }
}
// What each kind must have before its first step (the rest are optional).
const REQUIRED: Record<Kind, string[]> = {
  box: ["w", "h"], cells: ["values"], grid: ["rows"], text: ["text"], arrow: ["x2", "y2"], code: ["lines"], screen: ["w", "h"], axis: ["w", "min", "max"], token: ["text"],
};

/** Reads `raw` into `into` by the kind's readers; false on any unknown or ill-typed key. */
function apply(into: Record<string, unknown>, raw: Record<string, unknown>, readers: Record<string, Reader>, skip: string[]): boolean {
  for (const [k, v] of Object.entries(raw)) {
    if (skip.includes(k)) continue;
    const r = readers[k];
    const out = r ? r(v) : undefined;
    if (out === undefined) return false;
    into[k] = out;
  }
  return true;
}
/** An item whose data is consistent: the axis has a range, the code's marked line exists, the marked cells exist. */
function coherent(it: Item): boolean {
  if (it.kind === "axis" && (!((it.max as number) > (it.min as number)) || ((it.max as number) - (it.min as number)) / (it.step ?? 1) > 40)) return false;
  if (it.kind === "code" && (it.hl ?? 0) > (it.lines?.length ?? 0)) return false;
  if (it.kind === "cells" && [...(it.hi ?? []), ...(it.bad ?? [])].some(i => i >= (it.values?.length ?? 0))) return false;
  if (it.kind === "grid" && (it.cellsHi ?? []).some(([r, c]) => r >= (it.rows?.length ?? 0) || c >= (it.rows?.[r]?.length ?? 0))) return false;
  return true;
}

/** Validates the block config into every step's full state; anything unexpected → null (the activity then says it is unavailable). */
export function readSceneConfig(config: unknown): SceneConfig | null {
  const c = (config ?? {}) as Record<string, unknown>;
  if (typeof config !== "object" || config === null || Object.keys(c).some(k => !["w", "h", "alt", "items", "steps"].includes(k))) return null;
  const w = num(120, L.maxW)(c.w) as number | undefined, h = num(60, L.maxH)(c.h) as number | undefined;
  const alt = str(L.say)(c.alt) as string | undefined;
  if (w === undefined || h === undefined || !alt || !alt.trim()) return null;
  if (!Array.isArray(c.items) || c.items.length < 1 || c.items.length > L.items) return null;
  if (!Array.isArray(c.steps) || c.steps.length < 1 || c.steps.length > L.steps) return null;
  const size = { w, h };
  const base: Item[] = [];
  for (const raw of c.items) {
    const o = (raw ?? {}) as Record<string, unknown>;
    if (typeof raw !== "object" || raw === null || typeof o.id !== "string" || !ID.test(o.id) || !KINDS.includes(o.kind as Kind)) return null;
    if (base.some(b => b.id === o.id)) return null;
    const kind = o.kind as Kind;
    const it: Record<string, unknown> = { id: o.id, kind, x: 0, y: 0, show: true, tone: "base" };
    if (!apply(it, o, keysOf(kind, size), ["id", "kind"])) return null;
    if (REQUIRED[kind].some(k => it[k] === undefined)) return null;
    if (!coherent(it as Item)) return null;
    base.push(it as Item);
  }
  const says: string[] = [], frames: Item[][] = [];
  let state = base;
  for (const raw of c.steps) {
    const s = (raw ?? {}) as Record<string, unknown>;
    if (typeof raw !== "object" || raw === null || Object.keys(s).some(k => !["say", "set"].includes(k))) return null;
    const say = str(L.say)(s.say) as string | undefined;
    if (!say || !say.trim() || (say.split("`").length - 1) % 2 !== 0) return null;   // `…` marks code: always in pairs
    const set = (s.set ?? {}) as Record<string, unknown>;
    if (typeof set !== "object" || set === null || Array.isArray(set)) return null;
    const next = state.map(it => ({ ...it }));
    for (const [id, patch] of Object.entries(set)) {
      const at = next.findIndex(it => it.id === id);
      if (at < 0 || typeof patch !== "object" || patch === null || Array.isArray(patch)) return null;
      // `id` and `kind` are not in any kind's readers, so a step that tries to change them is refused here too
      if (!apply(next[at] as unknown as Record<string, unknown>, patch as Record<string, unknown>, keysOf(next[at].kind, size), [])) return null;
      if (!coherent(next[at])) return null;
    }
    says.push(say);
    frames.push(next);
    state = next;
  }
  return { w, h, alt, says, frames };
}

/** What changed for one item between two steps (its position or any shown datum): drives the short highlight. Pure. */
export function changed(a: Item | undefined, b: Item): boolean {
  if (!a) return false;
  const { x: _ax, y: _ay, ...ra } = a, { x: _bx, y: _by, ...rb } = b;
  return JSON.stringify(ra) !== JSON.stringify(rb);
}
