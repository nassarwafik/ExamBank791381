import { useMemo, useState, type ReactNode } from "react";
import type { BuilderQuestion, BuilderSection, StructuredExam, BuilderImageAsset } from "../examTypes";
import type { StructuredIssue } from "../examQuality";
import type { ExamSaveState } from "../examHistory";
import type { AiImageRequestQuestion } from "../questionMedia";
import type { BuilderActions } from "../builder/builderActions";
import type { ToolbarItem } from "../builder/BuilderToolbar";
import type { FinalizationDecision } from "../examFinalization";
import ActionMenu from "../ui/ActionMenu";
import Dialog from "../ui/Dialog";
import { useMediaQuery } from "../ui/useMediaQuery";
import { SAVE_LABELS } from "../teacher/saveLabels";
import { IconChevronBack, IconUndo, IconRedo, IconEye, IconSave, IconCheck, IconPlus, IconMore, IconOutline, IconSliders, IconFile } from "../icons";
import { StudioStepper, StudioSaveStatus } from "./StudioPrimitives";
import { STUDIO_STEPS, type StudioStepKey, type InspectorTab } from "./studioSteps";
import StudioOutline from "./StudioOutline";
import StudioCanvas from "./StudioCanvas";
import StudioInspector, { type InspectorTarget } from "./StudioInspector";
import "./studio.css";

// Phase 21F.3 / 21F.4 — the Exam Studio workspace: the top bar (back · title · status | the four steps | save state · history ·
// tools · preview · save · next), and, in the content step, the outline · canvas · inspector. Purely a presentation of the
// structured builder: every handler, gate, history step and save rule is the builder's (StructuredExamBuilder passes them in),
// so the Studio and the classic layout can never disagree about what an action does.

export type StudioWorkspaceProps = {
  exam: StructuredExam;
  headingId: string;
  heading: string;
  scope: string;
  actions: BuilderActions;
  saving: boolean;
  saveState?: ExamSaveState;
  mediaPending: boolean;
  mediaWait: string;
  pendingMediaIds: ReadonlySet<string>;
  notice?: string;
  error?: string;
  onExit?: () => void;
  onTitle: (title: string) => void;
  history?: { onUndo?: () => void; onRedo?: () => void; canUndo: boolean; canRedo: boolean };
  onSaveDraft?: () => void;
  onFinalize?: () => void;
  finalizeBlocked: boolean;
  decision: FinalizationDecision;
  addItems: ToolbarItem[];
  toolItems: ToolbarItem[];
  onPreview: () => void;
  step: StudioStepKey;
  onStep: (step: StudioStepKey) => void;
  activeId: string | null;
  onActivate: (questionId: string | null) => void;
  inspectorSectionId: string | null;
  onOpenSection: (sectionId: string | null) => void;
  inspectorTab: InspectorTab;
  onInspectorTab: (tab: InspectorTab) => void;
  selectedIds: ReadonlySet<string>;
  flashId: string;
  issuesOfSection: ReadonlyMap<string, readonly StructuredIssue[]>;
  issuesOfQuestion: ReadonlyMap<string, readonly StructuredIssue[]>;
  questionIssuesOfSection: ReadonlyMap<string, ReadonlyMap<string, readonly StructuredIssue[]>>;
  revealedQuestions: ReadonlyMap<string, number>;
  requestQuestionImage?: (q: AiImageRequestQuestion) => Promise<BuilderImageAsset>;
  onAddSection: () => void;
  bulkBar?: ReactNode;
  /** The non-content steps (setup / review / publish) are rendered by the builder through these slots. */
  stepViews: Partial<Record<StudioStepKey, ReactNode>>;
  renderInsert?: (sectionId: string, position: number) => ReactNode;
};

const NO_SECTIONS: readonly BuilderSection[] = [];
const totalMarksOf = (sections: readonly BuilderSection[]) => sections.reduce((n, s) => n + s.questions.reduce((a, q) => a + (Number(q.marks) || 0), 0), 0);

function MenuItems({ items }: { items: ToolbarItem[] }) {
  return <>{items.map(item => (
    <button key={item.key} type="button" className="eb-menu-item sb-menu-item" data-action={item.key} onClick={item.onSelect} disabled={item.disabled} aria-haspopup={item.dialog ? "dialog" : undefined} title={item.title}>
      {item.icon && <span className="sb-menu-icon" aria-hidden="true">{item.icon}</span>}
      <span className="sb-menu-label">{item.label}</span>
      {item.badge && <span className="sb-menu-badge">{item.badge}</span>}
    </button>
  ))}</>;
}

export default function StudioWorkspace(p: StudioWorkspaceProps) {
  const { exam, step } = p;
  const sections = exam.sections ?? NO_SECTIONS;
  const wide = !useMediaQuery("(max-width: 1279px)");          // outline + canvas + inspector side by side
  const roomy = !useMediaQuery("(max-width: 1023px)");          // outline beside the canvas
  const phone = useMediaQuery("(max-width: 767px)");
  const [drawer, setDrawer] = useState<"outline" | "inspector" | null>(null);
  const stepIndex = STUDIO_STEPS.findIndex(s => s.key === step);
  const nextStep = STUDIO_STEPS[stepIndex + 1]?.key;

  // The inspector's subject: a section opened from its card, else the active question, else nothing.
  const { inspectorSectionId, activeId, issuesOfQuestion } = p;
  const canFinalize = p.decision.canFinalize;
  // Cheap (one pass over the sections), so derived on every render rather than memoized.
  const target: InspectorTarget = (() => {
    if (inspectorSectionId) {
      const si = sections.findIndex(s => s.id === inspectorSectionId);
      if (si >= 0) return { kind: "section", section: sections[si], sectionIndex: si };
    }
    if (activeId) for (let si = 0; si < sections.length; si++) {
      const qi = sections[si].questions.findIndex(q => q.examQuestionId === activeId);
      if (qi >= 0) return { kind: "question", section: sections[si], sectionIndex: si, question: sections[si].questions[qi] as BuilderQuestion, index: qi };
    }
    return null;
  })();

  const readiness = useMemo(() => {
    let ok = 0, warn = 0, error = 0;
    for (const s of sections) for (const q of s.questions) {
      const list = issuesOfQuestion.get(q.examQuestionId);
      if (!list?.length) ok += 1; else if (list.some(i => i.severity === "error")) error += 1; else warn += 1;
    }
    return { ok, warn, error, total: ok + warn + error, canFinalize };
  }, [sections, issuesOfQuestion, canFinalize]);

  const openQuestion = (id: string) => { p.onOpenSection(null); p.onActivate(id); if (!roomy) setDrawer(null); };
  const openSection = (id: string) => { p.onOpenSection(id); if (!wide) setDrawer("inspector"); };
  const outline = (
    <StudioOutline sections={sections} activeId={p.activeId} activeSectionId={p.inspectorSectionId} selectedIds={p.selectedIds} issuesOf={p.issuesOfQuestion}
      readiness={readiness} totalMarks={totalMarksOf(sections)} disabled={p.saving} onOpenQuestion={openQuestion} onOpenSection={openSection} onAddSection={p.onAddSection} />
  );
  const inspector = (
    <StudioInspector target={target} tab={p.inspectorTab} onTab={p.onInspectorTab} scope={p.scope} actions={p.actions} sections={sections.map(s => ({ id: s.id, title: s.title }))}
      sectionCount={sections.length} blueprint={exam.blueprint} disabled={p.saving} mediaPending={!!(p.activeId && p.pendingMediaIds.has(p.activeId))}
      requestQuestionImage={p.requestQuestionImage} onOpenQuestionSettings={() => p.onOpenSection(null)} />
  );
  const header = (
    <>
      {p.error && <div className="st-banner is-error" role="alert">{p.error}</div>}
      {p.notice && <div className="st-banner is-ok" role="status">{p.notice}</div>}
      {p.bulkBar}
    </>
  );
  const canvas = (
    <StudioCanvas sections={sections} scope={p.scope} actions={p.actions} activeId={p.activeId} selectedIds={p.selectedIds} flashId={p.flashId} disabled={p.saving}
      issuesOfSection={p.issuesOfSection} questionIssuesOfSection={p.questionIssuesOfSection} revealedQuestions={p.revealedQuestions}
      onActivate={id => { p.onOpenSection(null); p.onActivate(id); }} onDeactivate={() => p.onActivate(null)} onOpenSection={openSection}
      onOpenMedia={() => { p.onInspectorTab("media"); p.onOpenSection(null); if (!wide) setDrawer("inspector"); }} onAddSection={p.onAddSection}
      header={header} renderInsert={p.renderInsert} />
  );
  const bodyClass = "st-body" + (step !== "content" ? " is-wide" : !roomy ? " no-outline no-inspector" : !wide ? " no-inspector" : "");

  return (
    <>
      <header className="st-topbar">
        <h1 id={p.headingId} className="st-visually-hidden">{p.heading}</h1>
        <div className="st-topbar-start">
          {p.onExit && <button type="button" className="st-icon-btn sb-tb-exit" onClick={p.onExit} disabled={p.saving} aria-label="رجوع" title="رجوع"><IconChevronBack size={18} /></button>}
          <div className="st-title">
            <span className="st-crumb"><span className="st-crumb-name">استوديو الامتحان</span><StudioSaveStatus state={p.saving ? "saving" : p.saveState} /></span>
            <div className="st-title-row">
              <input className="st-title-input" value={exam.title ?? ""} placeholder="امتحان بلا عنوان" aria-label="عنوان الامتحان" onChange={e => p.onTitle(e.target.value)} disabled={p.saving} />
              <span className={"st-chip-dark" + (exam.status === "final" ? " is-final" : "")}>{exam.status === "final" ? "معتمد نهائيًا" : "مسودة"}</span>
            </div>
          </div>
        </div>
        <StudioStepper current={step} onSelect={p.onStep} />
        <div className="st-topbar-end">
          <div className="st-topbar-tools">
          {p.mediaPending && <span className="st-chip-dark" role="status">{p.mediaWait}</span>}
          {step === "content" && !roomy && !phone && <button type="button" className="st-icon-btn" aria-label="هيكل الامتحان" title="هيكل الامتحان" onClick={() => setDrawer("outline")} aria-haspopup="dialog"><IconOutline size={18} /></button>}
          {step === "content" && !wide && !phone && <button type="button" className="st-icon-btn" aria-label="لوحة الخصائص" title="لوحة الخصائص" onClick={() => setDrawer("inspector")} aria-haspopup="dialog"><IconSliders size={18} /></button>}
          {p.history && <>
            <button type="button" className="st-icon-btn" aria-label="تراجع" title="تراجع (Ctrl+Z)" onClick={p.history.onUndo} disabled={!p.history.canUndo || p.saving}><IconUndo size={18} /></button>
            <button type="button" className="st-icon-btn st-redo-btn" aria-label="إعادة" title="إعادة (Ctrl+Y)" onClick={p.history.onRedo} disabled={!p.history.canRedo || p.saving}><IconRedo size={18} /></button>
          </>}
          {p.addItems.length > 0 && <ActionMenu label="إضافة أسئلة" className="st-menu" icon={<IconPlus size={16} />} text="إضافة"><MenuItems items={p.addItems} /></ActionMenu>}
          <ActionMenu label="أدوات الامتحان" className="st-menu" icon={<IconMore size={18} />}><MenuItems items={p.toolItems} /></ActionMenu>
          <button type="button" className="st-icon-btn st-preview-btn" onClick={p.onPreview} aria-label="معاينة الامتحان كما يراه الطالب" title="معاينة الامتحان"><IconEye size={18} /></button>
          </div>
          {p.onSaveDraft && <button type="button" className="st-btn st-save-btn" onClick={p.onSaveDraft} disabled={p.saving || p.mediaPending} title={p.mediaPending ? p.mediaWait : undefined}><IconSave size={16} aria-hidden="true" /><span className="st-btn-label">{p.saving ? SAVE_LABELS.saving : SAVE_LABELS.saveDraft}</span></button>}
          {step === "publish" || !nextStep
            ? p.onFinalize && <button type="button" className={"st-btn is-primary st-next-btn" + (p.finalizeBlocked ? " is-gated" : "")} onClick={p.onFinalize} disabled={p.saving || p.mediaPending} aria-disabled={p.finalizeBlocked || undefined}><IconCheck size={16} aria-hidden="true" /><span className="st-btn-label">{SAVE_LABELS.finalizeExam}</span></button>
            : <button type="button" className="st-btn is-primary st-next-btn" onClick={() => p.onStep(nextStep)} aria-label={"متابعة إلى " + STUDIO_STEPS[stepIndex + 1].label}><span className="st-btn-label st-long" aria-hidden="true">{"متابعة إلى " + STUDIO_STEPS[stepIndex + 1].label}</span><span className="st-short" aria-hidden="true">التالي</span></button>}
        </div>
      </header>

      <div className={bodyClass}>
        {step === "content" ? <>
          {roomy && outline}
          {canvas}
          {wide && inspector}
        </> : p.stepViews[step] ?? <div className="st-step-view"><div className="st-step-grid"><p className="st-summary-note"><IconFile size={16} aria-hidden="true" /> لا يوجد محتوى لهذه الخطوة.</p></div></div>}
      </div>

      {phone && (
        <nav className="st-bottombar" aria-label="أقسام الاستوديو">
          <button type="button" aria-pressed={drawer === "outline"} onClick={() => { p.onStep("content"); setDrawer("outline"); }}><IconOutline size={18} aria-hidden="true" />المخطط</button>
          <button type="button" aria-pressed={step === "content" && drawer === null} onClick={() => { p.onStep("content"); setDrawer(null); }}><IconFile size={18} aria-hidden="true" />المحتوى</button>
          <button type="button" aria-pressed={drawer === "inspector"} onClick={() => { p.onStep("content"); setDrawer("inspector"); }}><IconSliders size={18} aria-hidden="true" />الخصائص</button>
          <button type="button" aria-pressed={step === "review"} onClick={() => { setDrawer(null); p.onStep("review"); }}><IconCheck size={18} aria-hidden="true" />المراجعة</button>
        </nav>
      )}

      <Dialog open={drawer === "outline" && !roomy} size="md" title="هيكل الامتحان" onClose={() => setDrawer(null)} className="st-drawer-shell">
        <div className="st-drawer" dir="rtl">{outline}</div>
      </Dialog>
      <Dialog open={drawer === "inspector" && !wide} size="md" title="لوحة الخصائص" onClose={() => setDrawer(null)} className="st-drawer-shell">
        <div className="st-drawer" dir="rtl">{inspector}</div>
      </Dialog>
    </>
  );
}
