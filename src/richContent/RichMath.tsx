import { createElement, memo, useMemo, type ReactNode } from "react";
import { parseMath, type MathNode, type MathEnvironment } from "./richMath";

// Phase 20D.1 — the math renderer (LAZY chunk of RichContentRenderer). The allow-listed source is parsed by richMath.ts into a closed AST;
// this module maps that AST to MathML ELEMENTS constructed by React (never a markup string, never a library's HTML output). Only the
// element names below are ever created; every text value is a React text node. A source that does not parse renders as plain code text.
// Phase 21A: a grid is a real MathML table (mtable / mtr / mtd); its fences, alignment and class come from the FIXED per-environment
// table below (the environment is a closed enum of the AST, never a name or an attribute taken from source text). Arabic \text runs
// carry their natural RTL direction inside the LTR formula; identifiers never do.
const el = (name: "mrow" | "mi" | "mn" | "mo" | "mtext" | "mfrac" | "msqrt" | "mroot" | "msub" | "msup" | "msubsup" | "mover" | "mspace" | "mtable" | "mtr" | "mtd", props: Record<string, string> | null, ...children: ReactNode[]) =>
  createElement(name, props, ...children);
const GRID: Readonly<Record<MathEnvironment, { open: string; close: string; align?: string; cls?: string }>> = Object.freeze({
  matrix: { open: "", close: "" }, pmatrix: { open: "(", close: ")" }, bmatrix: { open: "[", close: "]" }, vmatrix: { open: "|", close: "|" }, Vmatrix: { open: "‖", close: "‖" },
  cases: { open: "{", close: "", align: "left left", cls: "xp-math-cases" }, aligned: { open: "", close: "", align: "right left", cls: "xp-math-aligned" }
});
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const fenceMo = (v: string) => (v ? el("mo", { fence: "true", stretchy: "true" }, v) : null);

function node(n: MathNode, key?: number): ReactNode {
  const k = key === undefined ? null : { key: String(key) };
  switch (n.k) {
    case "row": return el("mrow", k, ...n.c.map((c, i) => node(c, i)));
    case "id": return el("mi", n.fn || n.v.length > 1 ? { ...k, mathvariant: "normal" } : k, n.v);
    case "num": return el("mn", k, n.v);
    case "op": return el("mo", n.large ? { ...k, largeop: "true" } : k, n.v);
    case "text": return el("mtext", RTL.test(n.v) ? { ...k, dir: "rtl" } : k, n.v);
    case "space": return el("mspace", { ...k, width: "0.5em" });
    case "frac": return el("mfrac", k, node(n.n), node(n.d));
    case "sqrt": return n.idx ? el("mroot", k, node(n.b), node(n.idx)) : el("msqrt", k, node(n.b));
    case "scripts":
      if (n.sub && n.sup) return el("msubsup", k, node(n.b), node(n.sub), node(n.sup));
      return n.sub ? el("msub", k, node(n.b), node(n.sub)) : el("msup", k, node(n.b), node(n.sup as MathNode));
    case "accent": return el("mover", { ...k, accent: "true" }, node(n.b), el("mo", null, n.v));
    case "fenced": return el("mrow", k, n.open ? el("mo", { fence: "true" }, n.open) : null, node(n.c), n.close ? el("mo", { fence: "true" }, n.close) : null);
    case "grid": {
      const g = GRID[n.env];
      const table = el("mtable", g.align ? { columnalign: g.align, className: g.cls as string } : null,
        ...n.rows.map((r, i) => el("mtr", { key: String(i) }, ...r.map((c, j) => el("mtd", { key: String(j) }, node(c))))));
      return el("mrow", k, fenceMo(g.open), table, fenceMo(g.close));
    }
  }
  return null;
}

function RichMath({ source, display }: { source: string; display?: boolean }) {
  const parsed = useMemo(() => parseMath(source), [source]);
  if (!parsed.ok) return <code className="xp-math-src" dir="ltr">{source}</code>;
  return createElement("math", { className: "xp-math", dir: "ltr", alttext: source, ...(display ? { display: "block" } : {}) }, node(parsed.ast));
}
export default memo(RichMath);
