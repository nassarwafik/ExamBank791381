import { createElement, memo, useMemo, type ReactNode } from "react";
import { parseMath, type MathNode } from "./richMath";

// Phase 20D.1 — the math renderer (LAZY chunk of RichContentRenderer). The allow-listed source is parsed by richMath.ts into a closed AST;
// this module maps that AST to MathML ELEMENTS constructed by React (never a markup string, never a library's HTML output). Only the
// element names below are ever created; every text value is a React text node. A source that does not parse renders as plain code text.
const el = (name: "mrow" | "mi" | "mn" | "mo" | "mtext" | "mfrac" | "msqrt" | "mroot" | "msub" | "msup" | "msubsup" | "mover" | "mspace", props: Record<string, string> | null, ...children: ReactNode[]) =>
  createElement(name, props, ...children);

function node(n: MathNode, key?: number): ReactNode {
  const k = key === undefined ? null : { key: String(key) };
  switch (n.k) {
    case "row": return el("mrow", k, ...n.c.map((c, i) => node(c, i)));
    case "id": return el("mi", n.fn || n.v.length > 1 ? { ...k, mathvariant: "normal" } : k, n.v);
    case "num": return el("mn", k, n.v);
    case "op": return el("mo", n.large ? { ...k, largeop: "true" } : k, n.v);
    case "text": return el("mtext", k, n.v);
    case "space": return el("mspace", { ...k, width: "0.5em" });
    case "frac": return el("mfrac", k, node(n.n), node(n.d));
    case "sqrt": return n.idx ? el("mroot", k, node(n.b), node(n.idx)) : el("msqrt", k, node(n.b));
    case "scripts":
      if (n.sub && n.sup) return el("msubsup", k, node(n.b), node(n.sub), node(n.sup));
      return n.sub ? el("msub", k, node(n.b), node(n.sub)) : el("msup", k, node(n.b), node(n.sup as MathNode));
    case "accent": return el("mover", { ...k, accent: "true" }, node(n.b), el("mo", null, n.v));
    case "fenced": return el("mrow", k, n.open ? el("mo", { fence: "true" }, n.open) : null, node(n.c), n.close ? el("mo", { fence: "true" }, n.close) : null);
  }
  return null;
}

function RichMath({ source, display }: { source: string; display?: boolean }) {
  const parsed = useMemo(() => parseMath(source), [source]);
  if (!parsed.ok) return <code className="xp-math-src" dir="ltr">{source}</code>;
  return createElement("math", { className: "xp-math", dir: "ltr", alttext: source, ...(display ? { display: "block" } : {}) }, node(parsed.ast));
}
export default memo(RichMath);
