import { flowSentence, type CallFlow, type FlowFrame } from "./callFlow";

/**
 * Visual lab V12 (docs/enterprise-csharp-visual-lab-plan.md §22) — the call flow (callFlow.ts) drawn: one box per running method, the
 * running one on top, each with where it was called from and its variables; a parameter carries how it was passed («نسخة» / ref /
 * out / in). Arrows on the right: SOLID from a ref / out / in parameter to the caller's very variable (the same box of memory),
 * DASHED from a caller's variable to the parameter that got a copy of it. On the left, a returning method's value goes back to its
 * caller. One `role="img"` with the whole flow in words. Left to right like the code; no timers, no state.
 */
const MONO = 8.6, AR = 7.4, PAD = 8, LEFT = 74, HEAD = 24, CAP = 18, ROW = 24, GAP = 24;
const mono = (s: string) => [...s].length * MONO;
const ar = (s: string) => [...s].length * AR;
const BADGE: Record<string, string> = { value: "نسخة", ref: "ref", out: "out", in: "in" };
// The drawing is left to right (like the code); an Arabic run inside it is isolated (RLI … PDI) and the code run too (LRI … PDI), so
// «من السطر 28: Swap(ref a, ref b)» reads in its order instead of the browser's bidi reordering of the mixed line.
const RTL = (s: string) => "\u2067" + s + "\u2069", LTR = (s: string) => "\u2066" + s + "\u2069";
const caption = (f: FlowFrame) => (f.site ? RTL("من السطر " + f.from + ":") + " " + LTR(f.site) : f.from ? RTL("من السطر " + f.from) : "");

/** An arrowhead at (x, y), pointing left (into a box's right side) or right (into its left side). Drawn by hand: no <marker> ids. */
function Head({ x, y, className, left }: { x: number; y: number; className: string; left?: boolean }) {
  const d = left ? `M${x} ${y} L${x + 8} ${y - 4.5} L${x + 8} ${y + 4.5}z` : `M${x} ${y} L${x - 8} ${y - 4.5} L${x - 8} ${y + 4.5}z`;
  return <path className={className + " learning-ds-head"} d={d} />;
}

export default function CallFlowDrawing({ flow, names }: { flow: CallFlow; names: (i: number) => string }) {
  const badgeW = Math.max(0, ...flow.frames.flatMap(f => f.vars.map(v => (v.param ? ar(BADGE[v.param.kind]) + 14 : 0))));
  const nameW = Math.max(24, ...flow.frames.flatMap(f => f.vars.map(v => mono(v.name) + 14)));
  const valW = Math.max(40, ...flow.frames.flatMap(f => f.vars.map(v => mono(v.text) + 18)));
  const W = Math.max(badgeW + nameW + valW, ...flow.frames.map(f => Math.max(mono(f.name) + (f.running ? ar(" — تعمل الآن") : 0) + 20, ar(caption(f)) + 20)));
  const x = PAD + LEFT;
  const boxes = new Map<number, { y: number; h: number; f: FlowFrame }>();
  let y = PAD;
  for (const f of flow.frames) {
    const h = HEAD + (caption(f) ? CAP : 0) + Math.max(1, f.vars.length) * ROW;
    boxes.set(f.index, { y, h, f });
    y += h + GAP;
  }
  const rowY = (frame: number, name: string) => {
    const b = boxes.get(frame);
    if (!b) return null;
    const i = b.f.vars.findIndex(v => v.name === name);
    return i < 0 ? null : b.y + HEAD + (caption(b.f) ? CAP : 0) + i * ROW + ROW / 2;
  };
  const R = x + W;
  const links = flow.links.map((l, k) => ({ l, a: rowY(l.callee.frame, l.callee.name), b: rowY(l.caller.frame, l.caller.name), off: 26 + k * 16 }))
    .filter((x): x is { l: typeof flow.links[number]; a: number; b: number; off: number } => x.a !== null && x.b !== null);
  const width = R + 30 + flow.links.length * 16 + 20;
  const height = y - GAP + PAD + (flow.hidden ? 20 : 0) + 26;
  const ret = flow.returning && boxes.get(flow.returning.from) && boxes.get(flow.returning.to)
    ? { s: boxes.get(flow.returning.from)!.y + HEAD / 2, t: boxes.get(flow.returning.to)!.y + HEAD / 2, value: flow.returning.value } : null;
  return (
    <div className="learning-ds-canvas lab-flow" dir="ltr">
      <svg className="learning-ds-svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ minWidth: Math.round(width * 0.72) }}
        role="img" aria-label={flowSentence(flow, names)}>
        {[...boxes.values()].map(({ y: by, h, f }) => {
          const cap = caption(f);
          const top = by + HEAD + (cap ? CAP : 0);
          return (
            <g key={f.index}>
              <rect className={"lab-flow-box" + (f.running ? " is-running" : "")} x={x} y={by} width={W} height={h} rx="6" />
              <text className="lab-og-title" x={x + 10} y={by + HEAD / 2 + 5}>{f.name}{f.running && <tspan className="lab-og-new">{" — " + RTL("تعمل الآن")}</tspan>}</text>
              {cap && <text className="learning-ds-tag" x={x + 10} y={by + HEAD + CAP / 2 + 3}>{cap}</text>}
              {f.vars.length === 0 && <text className="learning-ds-muted" x={x + 10} y={top + ROW / 2 + 4}>لا متغيرات</text>}
              {f.vars.map((v, i) => {
                const ry = top + i * ROW;
                return (
                  <g key={v.name}>
                    <rect className={"lab-og-row" + (v.changed ? " is-changed" : "")} x={x + 1} y={ry} width={W - 2} height={ROW} />
                    {v.param && <text className={"lab-flow-badge is-" + v.param.kind} x={x + 6} y={ry + ROW / 2 + 4}>{BADGE[v.param.kind]}</text>}
                    <text className="lab-og-key" x={x + badgeW + 6} y={ry + ROW / 2 + 4}>{v.name}</text>
                    <text className={"learning-ds-value" + (v.changed ? " lab-og-hot" : "")} x={x + badgeW + nameW + 6} y={ry + ROW / 2 + 5}>{v.text}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
        {links.map(({ l, a, b, off }, k) => {
          // alias: from the parameter to the caller's variable; copy: from the caller's variable to the parameter
          const [s, t] = l.kind === "alias" ? [a, b] : [b, a];
          return (
            <g key={k}>
              <path className={"lab-flow-link is-" + l.kind} d={`M${R} ${s} C${R + off} ${s}, ${R + off} ${t}, ${R + 4} ${t}`} />
              <Head className={"lab-flow-link is-" + l.kind} x={R} y={t} left />
            </g>
          );
        })}
        {ret && (
          <g>
            <path className="learning-ds-pointer" d={`M${x} ${ret.s} C${x - 54} ${ret.s}, ${x - 54} ${ret.t}, ${x - 4} ${ret.t}`} />
            <Head className="learning-ds-pointer" x={x} y={ret.t} />
            <text className="learning-ds-name" x={PAD} y={(ret.s + ret.t) / 2 + 4}>{"↩ " + ret.value}</text>
          </g>
        )}
        {flow.hidden > 0 && <text className="learning-ds-muted" x={x} y={y - GAP + PAD + 14}>{"و" + flow.hidden + " استدعاءات أقدم"}</text>}
        <text className="learning-ds-tag" x={R} y={height - 8} textAnchor="end" direction="rtl">متّصل: المتغيّر نفسه (ref / out) · متقطّع: نسخة من القيمة</text>
      </svg>
    </div>
  );
}
