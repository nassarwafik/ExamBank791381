import { Component, Suspense, lazy, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { projectStudentToolsForStudent, enabledToolsForSection, csharpRunAllowedInBook, type StudentToolConfigV1, type StudentToolId } from "./studentToolsSpec";
import type { CSharpToolRunner } from "./csharpToolRun";
import { studentToolCatalogEntry, studentToolHasUi } from "./studentToolsCatalog";
import CalculatorTool from "./CalculatorTool";
import Ipv4CalculatorTool from "./Ipv4CalculatorTool";
import BaseConverterTool from "./BaseConverterTool";
import ScratchPadTool from "./ScratchPadTool";
import AsciiTableTool from "./AsciiTableTool";
import BitwiseTool from "./BitwiseTool";
import TruthTableTool from "./TruthTableTool";
import UnitConverterTool from "./UnitConverterTool";
import PlaceValueBoxesTool from "./PlaceValueBoxesTool";
import HexBinaryTableTool from "./HexBinaryTableTool";
import { useFullscreenOverlay } from "../ui/useFullscreenOverlay";
import { IconMaximize, IconMinimize } from "../icons";
import "./studentTools.css";
// Phase T4 — the plotter carries the graph engine: its own chunk, fetched the first time the student opens it.
const GraphPlotterTool = lazy(() => import("./GraphPlotterTool"));
// Phase T5 — the formula sheet carries the rich-content renderer (maths): its own chunk as well.
const FormulaSheetTool = lazy(() => import("./FormulaSheetTool"));
// Phase T6 — the periodic table carries the chemistry catalog: its own chunk.
const PeriodicTableTool = lazy(() => import("./PeriodicTableTool"));
// Phase T14 — the C# editor carries the code editor (and, on demand, its rich engine): its own chunk.
const CSharpEditorTool = lazy(() => import("./CSharpEditorTool"));

// Phase T2 — the student's tool bar inside a running exam.
//
// • It receives the exam's raw `studentTools` value and projects it again (the server already sent the canonical copy; re-projecting
//   here means a malformed value can never render anything).
// • Only tools enabled for the CURRENT section and with a shipped UI are offered.
// • A tool, once opened, stays MOUNTED (hidden when closed) so its state — expression, history, last result — survives closing the
//   panel and moving between questions, for the whole attempt. Leaving the exam page discards it; nothing is stored or sent.
// • The panel is non-modal (the student keeps reading and answering the question). Escape closes it and returns focus to the button.
// • A failure inside a tool stays inside the tool (its own error boundary): it never reaches the exam's answer / render-failure state.

/** `onToolOpen` (Phase T8) is told each time the student opens a tool, for the attempt's usage record; the book reader passes nothing. */
/** `csharpRunner` (Phase T14): the BOOK reader's run transport for the C# editor. An exam page never passes one (owner decision: in an exam
 *  the editor is a writing aid only); absent → write only. */
type Props = { studentTools: unknown; sectionId?: string; onToolOpen?: (id: StudentToolId) => void; csharpRunner?: CSharpToolRunner };
type CSharpRun = { runner?: CSharpToolRunner };
const XWIDE_TOOLS: ReadonlySet<StudentToolId> = new Set(["csharpEditor"]);
/** Phase E1 (owner request) — the tools whose panel can fill the screen («ملء الشاشة»), as the course's «وضع العرض» does. */
const FULLSCREEN_TOOLS: ReadonlySet<StudentToolId> = new Set(["csharpEditor"]);
const WIDE_TOOLS: ReadonlySet<StudentToolId> = new Set(["graphPlotter", "scratchPad", "formulaSheet", "asciiTable", "truthTable", "periodicTable", "csharpEditor"]);

class ToolBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* contained on purpose: a tool failure never affects the exam */ }
  render() {
    return this.state.failed ? <p className="stt-error" role="alert">تعذّر تشغيل هذه الأداة. يمكنك متابعة الامتحان بشكل طبيعي.</p> : this.props.children;
  }
}

function ToolBody({ tool, csharp, full = false }: { tool: StudentToolConfigV1; csharp: CSharpRun; full?: boolean }) {
  switch (tool.id) {
    case "calculator": return <CalculatorTool config={tool} />;
    case "ipv4Calculator": return <Ipv4CalculatorTool config={tool} />;
    case "baseConverter": return <BaseConverterTool config={tool} />;
    case "formulaSheet": return <Suspense fallback={<p className="stt-hint" role="status">جارٍ تحميل ورقة القوانين…</p>}><FormulaSheetTool config={tool} /></Suspense>;
    case "scratchPad": return <ScratchPadTool config={tool} />;
    case "asciiTable": return <AsciiTableTool config={tool} />;
    case "bitwiseCalculator": return <BitwiseTool config={tool} />;
    case "truthTable": return <TruthTableTool config={tool} />;
    case "unitConverter": return <UnitConverterTool config={tool} />;
    case "placeValueBoxes": return <PlaceValueBoxesTool config={tool} />;
    case "hexBinaryTable": return <HexBinaryTableTool config={tool} />;
    case "periodicTable": return <Suspense fallback={<p className="stt-hint" role="status">جارٍ تحميل الجدول الدوري…</p>}><PeriodicTableTool config={tool} /></Suspense>;
    case "graphPlotter": return <Suspense fallback={<p className="stt-hint" role="status">جارٍ تحميل راسم الدوال…</p>}><GraphPlotterTool config={tool} /></Suspense>;
    case "csharpEditor": return <Suspense fallback={<p className="stt-hint" role="status">جارٍ تحميل محرر C#…</p>}><CSharpEditorTool runner={csharp.runner} full={full} /></Suspense>;
    default: return null;
  }
}

const toolTitle = (t: StudentToolConfigV1): string =>
  t.id === "calculator" ? (t.variant === "basic" ? "آلة حاسبة" : "آلة حاسبة علمية") : t.id === "formulaSheet" ? t.title : studentToolCatalogEntry(t.id).label;

export default function StudentToolDock({ studentTools, sectionId, onToolOpen, csharpRunner }: Props) {
  const baseId = useId();
  const spec = useMemo(() => projectStudentToolsForStudent(studentTools), [studentTools]);
  // T14 — running from the C# editor: books only, by the same rule the server applies (it checks again on every run).
  const csharp = useMemo<CSharpRun>(() => (csharpRunner && csharpRunAllowedInBook(spec) ? { runner: csharpRunner } : {}), [csharpRunner, spec]);
  const all = useMemo(() => (spec ? spec.tools.filter(t => studentToolHasUi(t.id)) : []), [spec]);
  const enabled = useMemo(() => enabledToolsForSection(spec, sectionId).filter(t => studentToolHasUi(t.id)), [spec, sectionId]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openTool, setOpenTool] = useState<StudentToolId | null>(null);
  const [mounted, setMounted] = useState<ReadonlySet<StudentToolId>>(() => new Set());
  const fabRef = useRef<HTMLButtonElement>(null);
  // Phase T3 — the open panel can be dragged by its header on wide screens (on a phone it is a bottom sheet). One offset for the dock:
  // only one panel is visible at a time. «إعادة الموضع» is the non-drag alternative (WCAG 2.5.7).
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointer: number; startX: number; startY: number; base: { x: number; y: number }; bounds: { minX: number; maxX: number; minY: number; maxY: number } } | null>(null);
  const onHeadPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button") || full.active) return;   // a full-screen panel does not move
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches) return;
    const panel = (e.currentTarget as HTMLElement).closest(".stt-panel") as HTMLElement | null;
    const r = panel?.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    drag.current = {
      pointer: e.pointerId, startX: e.clientX, startY: e.clientY, base: offset,
      // keep the whole header on screen: the panel may move left/up by its distance to the edge, right/down likewise
      bounds: r ? { minX: offset.x - r.left, maxX: offset.x + (vw - r.right), minY: offset.y - r.top, maxY: offset.y + (vh - r.top - 48) } : { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity }
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onHeadPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    setOffset({ x: clamp(d.base.x + e.clientX - d.startX, d.bounds.minX, d.bounds.maxX), y: clamp(d.base.y + e.clientY - d.startY, d.bounds.minY, d.bounds.maxY) });
  };
  const endDrag = (e: React.PointerEvent<HTMLElement>) => { if (drag.current?.pointer === e.pointerId) drag.current = null; };
  const moved = offset.x !== 0 || offset.y !== 0;
  // A viewport that becomes phone-width shows the bottom sheet: a desktop drag offset no longer applies.
  useEffect(() => {
    if (!moved || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 640px)");
    const reset = () => { if (mq.matches) setOffset({ x: 0, y: 0 }); };
    reset();
    mq.addEventListener?.("change", reset);
    return () => mq.removeEventListener?.("change", reset);
  }, [moved]);
  const panelRefs = useRef<Partial<Record<StudentToolId, HTMLElement | null>>>({});
  // Phase E1 — «ملء الشاشة»: the open panel itself becomes the app-level overlay (useFullscreenOverlay, as the Reader's «وضع العرض»):
  // the page behind does not scroll, Tab stays in the panel, Escape leaves full screen first (a second Escape closes the panel), and
  // the browser's own full screen is asked for best-effort only — an exam that is already full screen is left as it is.
  const fullRef = useRef<HTMLElement | null>(null);
  const full = useFullscreenOverlay(fullRef);

  // A section that disables the open tool closes its panel (its state is kept for the sections that allow it). Adjusted during render
  // when the section changes (React's "adjusting state on a prop change" pattern), so returning to an allowing section does not reopen it.
  const openAllowed = openTool !== null && enabled.some(t => t.id === openTool);
  const [seenSection, setSeenSection] = useState(sectionId);
  if (seenSection !== sectionId) {
    setSeenSection(sectionId);
    if (openTool !== null && !openAllowed) setOpenTool(null);
  }

  useEffect(() => {
    if (!openTool) return;
    const panel = panelRefs.current[openTool];
    const first = panel?.querySelector<HTMLElement>("input, button:not(.stt-close)");
    (first || panel)?.focus();
  }, [openTool]);

  // a full-screen panel that closes, or that a section disables, leaves full screen with it
  const fullTool = full.active && openTool && openAllowed && FULLSCREEN_TOOLS.has(openTool) ? openTool : null;
  useEffect(() => { if (full.active && !fullTool) full.exit(); }, [full, fullTool]);

  if (!all.length) return null;

  const open = (id: StudentToolId) => {
    setMounted(prev => (prev.has(id) ? prev : new Set([...prev, id])));
    if (openTool !== id) onToolOpen?.(id);   // T8: re-selecting the tool already open is not a new opening
    setOpenTool(id);
    setMenuOpen(false);
  };
  const close = () => { setOpenTool(null); fabRef.current?.focus(); };   // a full-screen panel that closes leaves full screen (the effect above)
  const toggleFull = (id: StudentToolId) => { fullRef.current = panelRefs.current[id] ?? null; full.toggle(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || full.active) return;   // in full screen, Escape leaves full screen (the overlay's own key) — the panel stays
    if (openTool) { e.stopPropagation(); close(); } else if (menuOpen) { e.stopPropagation(); setMenuOpen(false); fabRef.current?.focus(); }
  };

  return (
    <div className={"stt-dock" + (fullTool ? " has-fullscreen" : "")} dir="rtl" onKeyDown={onKeyDown} data-testid="student-tool-dock">
      {all.filter(t => mounted.has(t.id)).map(t => {
        const titleId = baseId + "-" + t.id + "-title";
        const visible = openTool === t.id && openAllowed;
        const isFull = fullTool === t.id;
        return (
          <section key={t.id} ref={el => { panelRefs.current[t.id] = el; }} className={"stt-panel" + (WIDE_TOOLS.has(t.id) ? " is-wide" : "") + (XWIDE_TOOLS.has(t.id) ? " is-xwide" : "") + (isFull ? " is-fullscreen" : "")} role="dialog" aria-modal="false" aria-labelledby={titleId}
            hidden={!visible} tabIndex={-1} data-testid={"tool-panel-" + t.id}
            style={moved && !isFull ? { transform: "translate(" + offset.x + "px, " + offset.y + "px)" } : undefined}>
            <header className="stt-panel-head" onPointerDown={onHeadPointerDown} onPointerMove={onHeadPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
              title="اسحب لتحريك النافذة">
              <h2 id={titleId} className="stt-panel-title">{toolTitle(t)}</h2>
              <span className="stt-head-actions">
                {FULLSCREEN_TOOLS.has(t.id) && (
                  <button type="button" className="stt-close stt-full-toggle" onClick={() => toggleFull(t.id)} aria-pressed={isFull}
                    aria-label={isFull ? "الخروج من ملء الشاشة" : "ملء الشاشة"} title={isFull ? "الخروج من ملء الشاشة (Esc)" : "ملء الشاشة"} data-testid="tool-fullscreen">
                    {isFull ? <IconMinimize /> : <IconMaximize />}
                  </button>
                )}
                {moved && !isFull && <button type="button" className="stt-close" onClick={() => setOffset({ x: 0, y: 0 })} aria-label="إعادة النافذة إلى موضعها">↺</button>}
                <button type="button" className="stt-close" onClick={close} aria-label={"إغلاق " + toolTitle(t)}>✕</button>
              </span>
            </header>
            <div className="stt-panel-body"><ToolBoundary><ToolBody tool={t} csharp={csharp} full={isFull} /></ToolBoundary></div>
          </section>
        );
      })}
      {menuOpen && (
        <div id={baseId + "-menu"} className="stt-menu" role="group" aria-label="الأدوات المسموحة">
          {enabled.length
            ? enabled.map(t => (
              <button key={t.id} type="button" className={"stt-menu-item" + (openTool === t.id ? " is-active" : "")} onClick={() => open(t.id)} aria-pressed={openTool === t.id}>
                {toolTitle(t)}
              </button>
            ))
            : <p className="stt-hint">لا توجد أدوات متاحة في هذا القسم.</p>}
        </div>
      )}
      <button ref={fabRef} type="button" className="stt-fab" aria-expanded={menuOpen} aria-controls={menuOpen ? baseId + "-menu" : undefined}
        onClick={() => setMenuOpen(o => !o)} data-testid="student-tools-button">
        <span aria-hidden="true">🧰</span> الأدوات
      </button>
    </div>
  );
}
