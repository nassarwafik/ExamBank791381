import { Component, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { projectStudentToolsForStudent, enabledToolsForSection, type StudentToolConfigV1, type StudentToolId } from "./studentToolsSpec";
import { studentToolCatalogEntry, studentToolHasUi } from "./studentToolsCatalog";
import CalculatorTool from "./CalculatorTool";
import Ipv4CalculatorTool from "./Ipv4CalculatorTool";
import "./studentTools.css";

// Phase T2 — the student's tool bar inside a running exam.
//
// • It receives the exam's raw `studentTools` value and projects it again (the server already sent the canonical copy; re-projecting
//   here means a malformed value can never render anything).
// • Only tools enabled for the CURRENT section and with a shipped UI are offered.
// • A tool, once opened, stays MOUNTED (hidden when closed) so its state — expression, history, last result — survives closing the
//   panel and moving between questions, for the whole attempt. Leaving the exam page discards it; nothing is stored or sent.
// • The panel is non-modal (the student keeps reading and answering the question). Escape closes it and returns focus to the button.
// • A failure inside a tool stays inside the tool (its own error boundary): it never reaches the exam's answer / render-failure state.

type Props = { studentTools: unknown; sectionId?: string };

class ToolBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* contained on purpose: a tool failure never affects the exam */ }
  render() {
    return this.state.failed ? <p className="stt-error" role="alert">تعذّر تشغيل هذه الأداة. يمكنك متابعة الامتحان بشكل طبيعي.</p> : this.props.children;
  }
}

function ToolBody({ tool }: { tool: StudentToolConfigV1 }) {
  switch (tool.id) {
    case "calculator": return <CalculatorTool config={tool} />;
    case "ipv4Calculator": return <Ipv4CalculatorTool config={tool} />;
    default: return null;
  }
}

const toolTitle = (t: StudentToolConfigV1): string =>
  t.id === "calculator" ? (t.variant === "basic" ? "آلة حاسبة" : "آلة حاسبة علمية") : studentToolCatalogEntry(t.id).label;

export default function StudentToolDock({ studentTools, sectionId }: Props) {
  const baseId = useId();
  const spec = useMemo(() => projectStudentToolsForStudent(studentTools), [studentTools]);
  const all = useMemo(() => (spec ? spec.tools.filter(t => studentToolHasUi(t.id)) : []), [spec]);
  const enabled = useMemo(() => enabledToolsForSection(spec, sectionId).filter(t => studentToolHasUi(t.id)), [spec, sectionId]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openTool, setOpenTool] = useState<StudentToolId | null>(null);
  const [mounted, setMounted] = useState<ReadonlySet<StudentToolId>>(() => new Set());
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRefs = useRef<Partial<Record<StudentToolId, HTMLElement | null>>>({});

  // A section that disables the open tool closes its panel (its state is kept for the sections that allow it).
  const openAllowed = openTool !== null && enabled.some(t => t.id === openTool);
  useEffect(() => { if (openTool !== null && !openAllowed) setOpenTool(null); }, [openTool, openAllowed]);

  useEffect(() => {
    if (!openTool) return;
    const panel = panelRefs.current[openTool];
    const first = panel?.querySelector<HTMLElement>("input, button:not(.stt-close)");
    (first || panel)?.focus();
  }, [openTool]);

  if (!all.length) return null;

  const open = (id: StudentToolId) => {
    setMounted(prev => (prev.has(id) ? prev : new Set([...prev, id])));
    setOpenTool(id);
    setMenuOpen(false);
  };
  const close = () => { setOpenTool(null); fabRef.current?.focus(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (openTool) { e.stopPropagation(); close(); } else if (menuOpen) { e.stopPropagation(); setMenuOpen(false); fabRef.current?.focus(); }
  };

  return (
    <div className="stt-dock" dir="rtl" onKeyDown={onKeyDown} data-testid="student-tool-dock">
      {all.filter(t => mounted.has(t.id)).map(t => {
        const titleId = baseId + "-" + t.id + "-title";
        const visible = openTool === t.id && openAllowed;
        return (
          <section key={t.id} ref={el => { panelRefs.current[t.id] = el; }} className="stt-panel" role="dialog" aria-modal="false" aria-labelledby={titleId}
            hidden={!visible} tabIndex={-1} data-testid={"tool-panel-" + t.id}>
            <header className="stt-panel-head">
              <h2 id={titleId} className="stt-panel-title">{toolTitle(t)}</h2>
              <button type="button" className="stt-close" onClick={close} aria-label={"إغلاق " + toolTitle(t)}>✕</button>
            </header>
            <div className="stt-panel-body"><ToolBoundary><ToolBody tool={t} /></ToolBoundary></div>
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
