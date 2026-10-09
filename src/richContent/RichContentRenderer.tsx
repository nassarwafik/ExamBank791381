import { Suspense, lazy, memo, useEffect, useState, type ReactNode } from "react";
import type { RichBlock, RichCell, RichContentV1, RichMark, RichRun } from "./richContentModel";
import "./rich-content.css";

// Phase 20D.1 — the TRUSTED RichContent renderer. Input is an already validated canonical RichContentV1 (validateRichContent's value);
// React constructs semantic HTML from that data: every author string becomes a React TEXT node (text that looks like markup stays text),
// element names / classes / attributes come only from this module, image sources only from the validated asset contract, math through
// the lazy MathML renderer. There is no markup-string path here at all.
//
// Heading outline: the exam page owns h1 (exam title) and h2 (page / section heading), so content headings never rise above h3:
// author level 2 → <h3>, level 3 → <h3>, level 4 → <h4>. The author's level is kept on data-xp-level for styling.
const RichMath = lazy(() => import("./RichMath"));
// Phase 21A.1 — data charts: the chart component (and, behind it, the rendering engine) loads only when a chart block is rendered.
const DataChart = lazy(() => import("../charts/DataChart"));
// Phase 21A.2 — the function-graph runtime (owned SVG renderer) is its own lazy chunk: a document without a graph never downloads it.
const FunctionGraphView = lazy(() => import("../functionGraphs/FunctionGraphView"));
const Surface3DView = lazy(() => import("../functionSurfaces/Surface3DView"));
// Phase 21C — general interactive 3D scene runtime stays behind a separate lazy edge.
const Interactive3DView = lazy(() => import("../interactive3d/Interactive3DView"));

const CALLOUT_LABEL: Record<string, string> = { info: "معلومة", note: "ملاحظة", warning: "تحذير", success: "إرشاد", important: "مهم" };
const CALLOUT_ICON: Record<string, string> = { info: "i", note: "✎", warning: "!", success: "✓", important: "★" };
// Fixed nesting order (outermost first) so the same marks always produce the same element tree.
const MARK_ORDER: readonly RichMark[] = ["bold", "italic", "underline", "sup", "sub", "code"];
const MARK_TAG: Record<RichMark, "strong" | "em" | "u" | "sup" | "sub" | "code"> = { bold: "strong", italic: "em", underline: "u", sup: "sup", sub: "sub", code: "code" };

function MathInline({ source, display }: { source: string; display?: boolean }) {
  // The boundary's direct host child is an HTML element (React hides / reveals a boundary's top-level host nodes through their inline style).
  return <Suspense fallback={<code className="xp-math-src" dir="ltr">{source}</code>}><span className="xp-math-host"><RichMath source={source} display={display} /></span></Suspense>;
}

// Phase 21A (review fixes 1–2): a scroll box around a formula is a labelled, keyboard-scrollable group ONLY while the formula actually
// overflows it (a wide matrix on a phone); otherwise it carries no role, no label and no tab stop. The check re-runs when the element
// mounts (also after the lazy formula resolves), on DOM mutation inside it, and on every size change of the box or of the formula; while
// the group holds keyboard focus it is kept (no focus loss when the viewport widens) and leaving it re-checks. Until a first measurement
// (or without ResizeObserver) the state is unknown (null) and nothing is added or removed (review fix 3).
const SCROLL_GROUP = { role: "group", "aria-label": "صيغة رياضية قابلة للتمرير", tabIndex: 0 } as const;
const overflows = (el: HTMLElement) => el.scrollWidth > el.clientWidth + 1;
function useScrollGroup(source: string) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [scrolls, setScrolls] = useState<boolean | null>(null);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => setScrolls(prev => overflows(el) || (prev === true && document.activeElement === el));
    const ro = new ResizeObserver(check);
    const watch = () => { ro.disconnect(); ro.observe(el); const m = el.querySelector("math"); if (m) ro.observe(m); check(); };
    const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(watch);
    mo?.observe(el, { childList: true, subtree: true });
    watch();
    return () => { ro.disconnect(); mo?.disconnect(); };
  }, [el, source]);
  const onBlur = () => { if (el) setScrolls(prev => (prev === null ? null : overflows(el))); };
  return [setEl, scrolls, onBlur] as const;                                  // [callback ref for the scroll box, overflows (null: unmeasured), blur handler]
}
// A display formula keeps the 20D.1 markup (a plain block) unless it overflows.
function MathBlock({ source }: { source: string }) {
  const [attach, scrolls, onBlur] = useScrollGroup(source);
  return <div ref={attach} className="xp-math-block" onBlur={onBlur} {...(scrolls ? SCROLL_GROUP : {})}><MathInline source={source} display /></div>;
}
// An inline formula holding a grid has a scroll-box host (CSS); a scroll box the browser would make a Tab stop on its own is taken out of
// the Tab order (tabIndex -1) once measured to fit. Inline formulas without a grid keep the 20D.1 markup (MathInline).
function InlineGridMath({ source }: { source: string }) {
  const [attach, scrolls, onBlur] = useScrollGroup(source);
  return <Suspense fallback={<code className="xp-math-src" dir="ltr">{source}</code>}><span ref={attach} className="xp-math-host" onBlur={onBlur} {...(scrolls ? SCROLL_GROUP : scrolls === false ? { tabIndex: -1 } : {})}><RichMath source={source} /></span></Suspense>;
}
// Does the source spell a grid environment? Mirrors the tokenizer: `\begin`, then any whitespace it skips (space, tab, LF, CR), then `{`.
const HAS_GRID = /\\begin[ \t\n\r]*\{/;

function Run({ run }: { run: RichRun }) {
  if ("math" in run) return HAS_GRID.test(run.math) ? <InlineGridMath source={run.math} /> : <MathInline source={run.math} />;
  let out: ReactNode = run.text;
  const marks = run.marks || [];
  for (let i = MARK_ORDER.length - 1; i >= 0; i--) {
    const m = MARK_ORDER[i];
    if (marks.includes(m)) { const Tag = MARK_TAG[m]; out = <Tag>{out}</Tag>; }
  }
  return run.dir ? <bdi dir={run.dir}>{out}</bdi> : <>{out}</>;
}
const Runs = ({ runs }: { runs: RichRun[] }) => <>{runs.map((r, i) => <Run run={r} key={i} />)}</>;
const Cell = ({ cell }: { cell: RichCell }) => (typeof cell === "string" ? <>{cell}</> : <Runs runs={cell.runs} />);

function Img({ asset, alt }: { asset: { dataUrl?: string }; alt: string }) {
  return asset.dataUrl ? <img className="xp-image" src={asset.dataUrl} alt={alt} loading="lazy" decoding="async" /> : <span className="xp-image-missing" role="note">{alt} (الصورة غير متاحة حاليًا)</span>;
}

function Table({ b }: { b: Extract<RichBlock, { type: "table" }> }) {
  const mode = b.responsive || "scroll";
  const heads = b.columnHeaders;
  return (
    <div className="xp-table-wrap" data-xp-responsive={mode} role="region" aria-label={b.caption || "جدول"} tabIndex={0}>
      <table className="xp-table">
        {b.caption && <caption>{b.caption}</caption>}
        {heads && heads.length > 0 && <thead><tr>{heads.map((h, i) => <th scope="col" key={i}>{h}</th>)}</tr></thead>}
        <tbody>{b.rows.map((row, r) => (
          <tr key={r}>{row.map((c, i) => {
            const label = mode === "stack" && heads ? heads[i] : undefined;
            return b.rowHeaders && i === 0
              ? <th scope="row" dir="auto" data-xp-label={label} key={i}><Cell cell={c} /></th>
              : <td dir="auto" data-xp-label={label} key={i}><Cell cell={c} /></td>;
          })}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Code({ source, lineNumbers }: { source: string; lineNumbers?: boolean }) {
  if (!lineNumbers) return <code>{source}</code>;
  const lines = source.split("\n");
  return <code data-xp-lines="true">{lines.map((l, i) => <span className="xp-line" key={i}>{l}{i < lines.length - 1 ? "\n" : ""}</span>)}</code>;
}

function Block({ b }: { b: RichBlock }): ReactNode {
  switch (b.type) {
    case "heading": { const H = b.level === 4 ? "h4" : "h3"; return <H className="xp-heading" data-xp-level={b.level}><Runs runs={b.runs} /></H>; }
    case "paragraph": return <p className="xp-p" dir={b.dir} data-xp-align={b.align}><Runs runs={b.runs} /></p>;
    case "unorderedList": return <ul className="xp-list">{b.items.map((it, i) => <li key={i}><Runs runs={it.runs} /></li>)}</ul>;
    case "orderedList": return <ol className="xp-list">{b.items.map((it, i) => <li key={i}><Runs runs={it.runs} /></li>)}</ol>;
    case "table": return <Table b={b} />;
    case "image": return <div className="xp-media"><Img asset={b.asset} alt={b.alt} /></div>;
    case "figure": return <figure className="xp-figure"><Img asset={b.asset} alt={b.alt} />{b.caption.length > 0 && <figcaption><Runs runs={b.caption} /></figcaption>}</figure>;
    case "code": return (
      <figure className="xp-code-block" data-xp-lang={b.language}>
        {b.title && <figcaption>{b.title}</figcaption>}
        <pre className="xp-code" dir="ltr" tabIndex={0} data-xp-lang={b.language} aria-label={b.title || "كود " + b.language}><Code source={b.source} lineNumbers={b.lineNumbers} /></pre>
      </figure>
    );
    case "cli": return (
      <figure className="xp-cli-block">
        {b.title && <figcaption>{b.title}</figcaption>}
        <pre className="xp-cli" dir="ltr" tabIndex={0} aria-label={b.title || "أوامر"}><code>{b.source}</code></pre>
      </figure>
    );
    case "quote": return <figure className="xp-quote"><blockquote><p><Runs runs={b.runs} /></p></blockquote>{b.citation && <figcaption><cite>{b.citation}</cite></figcaption>}</figure>;
    case "callout": return (
      <aside className="xp-callout" role="note" data-xp-variant={b.variant} aria-label={b.title || CALLOUT_LABEL[b.variant]}>
        <span className="xp-callout-icon" aria-hidden="true">{CALLOUT_ICON[b.variant]}</span>
        <div className="xp-callout-body">{b.title && <p className="xp-callout-title">{b.title}</p>}<p><Runs runs={b.runs} /></p></div>
      </aside>
    );
    case "divider": return <hr className="xp-divider" />;
    case "keyValueGrid": return <dl className="xp-kv">{b.items.map((it, i) => <div key={i}><dt>{it.label}</dt><dd dir="auto">{it.value}</dd></div>)}</dl>;
    case "columns": return <div className="xp-columns">{b.columns.map((c, i) => <div className="xp-column" key={i}><Blocks blocks={c.blocks} /></div>)}</div>;
    case "math": return <MathBlock source={b.source} />;
    case "dataChart": return (
      <Suspense fallback={<figure className="xp-chart-pending" aria-busy="true"><figcaption dir="auto">{b.chart.title}</figcaption><p dir="auto">{b.chart.description}</p></figure>}>
        <DataChart spec={b.chart} />
      </Suspense>
    );
    case "functionGraph": return (
      <Suspense fallback={<div className="fg-pending" aria-busy="true"><p dir="auto">{b.graph.title}</p><p dir="auto">{b.graph.description}</p></div>}>
        <FunctionGraphView spec={b.graph} />
      </Suspense>
    );
    case "functionSurface3D": return (
      <Suspense fallback={<div className="ex3d-pending" aria-busy="true"><p dir="auto">{b.surface.title}</p><p dir="ltr">z = {b.surface.expression}</p></div>}>
        <Surface3DView spec={b.surface} />
      </Suspense>
    );
    case "interactive3D": return (
      <Suspense fallback={<div className="i3d-pending" aria-busy="true"><p dir="auto">{b.scene.title}</p><p dir="auto">{b.scene.description}</p></div>}>
        <Interactive3DView spec={b.scene} />
      </Suspense>
    );
  }
  return null;
}
const Blocks = ({ blocks }: { blocks: RichBlock[] }) => <>{blocks.map((b, i) => <Block b={b} key={i} />)}</>;

/** Renders one validated RichContentV1 document. Memoized by content identity (the canonical value is stable per question). */
function RichContentRenderer({ content }: { content: RichContentV1 }) {
  return <div className="xp-rich"><Blocks blocks={content.blocks} /></div>;
}
export default memo(RichContentRenderer);
