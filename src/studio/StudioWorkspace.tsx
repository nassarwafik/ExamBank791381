import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { IconChevronBack, IconUndo, IconRedo, IconEye, IconSave, IconCheck, IconPlus, IconMore, IconOutline, IconSliders, IconFile, IconKeyboard, IconSearch } from "../icons";
import { listQuestionTypes } from "../questionTypeCatalog";
import { newQuestion } from "../examBuilderState";
import { questionLabelOf } from "../builder/issueIndex";
import { isTextEditingTarget } from "../examHistoryShortcuts";
import StudioCommandPalette, { type StudioCommand } from "./StudioCommandPalette";
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
  // Phase 21F.5 — the open insert bar ("sectionId:position"), opened by its «+» or by Ctrl / ⌘ + Enter after the active card.
  const [insertOpen, setInsertOpen] = useState<string | null>(null);
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

  // ── Phase 21F.5 · keyboard: shortcuts, the command palette, drag-and-drop announcements ──
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const locate = (id: string | null) => {
    if (!id) return null;
    for (let si = 0; si < sections.length; si++) { const qi = sections[si].questions.findIndex(q => q.examQuestionId === id); if (qi >= 0) return { si, qi, section: sections[si] }; }
    return null;
  };
  /** Move a question to an exact place (outline drag-and-drop, Alt + ↑ / ↓), and say where it went. */
  const placeQuestion = (questionId: string, toSectionId: string, toIndex: number) => {
    const from = locate(questionId);
    if (!from || p.saving) return;
    p.actions.placeQuestion(p.scope, from.section.id, questionId, toSectionId, toIndex);
    const ti = sections.findIndex(s => s.id === toSectionId);
    const target = sections[ti];
    if (!target) return;
    const same = target.id === from.section.id;
    const position = same && toIndex > from.qi ? toIndex : toIndex + 1;
    setAnnouncement("نُقل السؤال إلى الموضع " + Math.min(position, target.questions.length + (same ? 0 : 1)) + " في القسم " + (ti + 1) + ".");
  };
  /** Alt + ↑ / ↓: one place up / down; across a section boundary into the neighbouring section. */
  const nudge = (questionId: string, delta: -1 | 1) => {
    const at = locate(questionId);
    if (!at) return;
    const { si, qi, section } = at;
    if (delta < 0 && qi > 0) placeQuestion(questionId, section.id, qi - 1);
    else if (delta > 0 && qi < section.questions.length - 1) placeQuestion(questionId, section.id, qi + 2);
    else if (delta < 0 && si > 0) placeQuestion(questionId, sections[si - 1].id, sections[si - 1].questions.length);
    else if (delta > 0 && si < sections.length - 1) placeQuestion(questionId, sections[si + 1].id, 0);
  };
  const latest = useRef({ p, nudge, sections });
  useEffect(() => { latest.current = { p, nudge, sections }; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { p: cur, nudge: move } = latest.current;
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest?.(".st-studio")) return;
      const mod = e.ctrlKey || e.metaKey;
      const active = cur.activeId;
      if (mod && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(true); return; }
      if (mod && !e.altKey && e.key === "Enter" && cur.step === "content") {
        e.preventDefault();
        const at = active ? locate(active) : null;
        const sec = at ? at.section : latest.current.sections[0];
        if (sec) setInsertOpen(sec.id + ":" + (at ? at.qi + 1 : sec.questions.length));
        return;
      }
      if (e.altKey && !mod && (e.key === "ArrowUp" || e.key === "ArrowDown") && active && cur.step === "content") { e.preventDefault(); move(active, e.key === "ArrowUp" ? -1 : 1); return; }
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "d" && active && cur.step === "content") {
        e.preventDefault();
        const at = locate(active);
        if (at) cur.actions.duplicateQuestion(cur.scope, at.section.id, active);
        return;
      }
      if (e.key === "?" && !mod && !isTextEditingTarget(e.target)) { e.preventDefault(); setHelpOpen(true); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);                                                                // eslint-disable-line react-hooks/exhaustive-deps

  const commands: StudioCommand[] = [
    ...STUDIO_STEPS.map(st => ({ id: "step-" + st.key, group: "الخطوات", label: "الانتقال إلى خطوة " + st.label, run: () => p.onStep(st.key) })),
    ...sections.flatMap((sec, si) => sec.questions.map((q, qi) => ({ id: "q-" + q.examQuestionId, group: "الأسئلة",
      label: "السؤال " + questionLabelOf(q.displayNumber, qi) + " في القسم " + (si + 1) + ": " + ((q.text || "").trim().slice(0, 60) || "سؤال بلا نص"),
      run: () => { p.onStep("content"); openQuestion(q.examQuestionId); } }))),
    ...listQuestionTypes().map(d => ({ id: "add-" + d.key, group: "إضافة سؤال", label: "إضافة سؤال: " + d.label, keywords: d.key, disabled: p.saving || sections.length === 0,
      run: () => {
        const at = locate(p.activeId);
        const sec = at ? at.section : sections[sections.length - 1];
        if (!sec) return;
        const q = newQuestion(d.key as BuilderQuestion["presentationType"]);
        p.actions.insertQuestion(p.scope, sec.id, at ? at.qi + 1 : sec.questions.length, q);
        p.onStep("content"); openQuestion(q.examQuestionId);
      } })),
    ...[...p.addItems, ...p.toolItems].map(item => ({ id: "tool-" + item.key, group: "الأدوات", label: item.label, disabled: item.disabled, run: item.onSelect })),
    { id: "preview", group: "الامتحان", label: "معاينة الامتحان كما يراه الطالب", run: p.onPreview },
    ...(p.onSaveDraft ? [{ id: "save", group: "الامتحان", label: SAVE_LABELS.saveDraft, disabled: p.saving || p.mediaPending, run: p.onSaveDraft }] : []),
    { id: "add-section", group: "الامتحان", label: "إضافة قسم جديد", disabled: p.saving, run: p.onAddSection },
    { id: "help", group: "الامتحان", label: "اختصارات لوحة المفاتيح", run: () => setHelpOpen(true) }
  ];
  const openSection = (id: string) => { p.onOpenSection(id); if (!wide) setDrawer("inspector"); };
  const outline = (
    <StudioOutline sections={sections} activeId={p.activeId} activeSectionId={p.inspectorSectionId} selectedIds={p.selectedIds} issuesOf={p.issuesOfQuestion}
      onPlace={placeQuestion} onNudge={nudge}
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
      header={header} insertOpen={insertOpen} onInsertOpen={setInsertOpen} insertExtras={p.addItems} />
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
          <button type="button" className="st-icon-btn st-palette-btn" onClick={() => setPaletteOpen(true)} aria-label="الأوامر (Ctrl+K)" title="الأوامر (Ctrl+K)" aria-haspopup="dialog"><IconSearch size={18} /></button>
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
      <p className="st-visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-studio-live>{announcement}</p>
      <StudioCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <Dialog open={helpOpen} size="sm" title="اختصارات لوحة المفاتيح" onClose={() => setHelpOpen(false)} className="st-help-dialog">
        <div className="st-drawer" dir="rtl">
          <dl className="st-shortcuts">
            <dt><kbd>Ctrl</kbd> + <kbd>K</kbd></dt><dd>الأوامر: الانتقال إلى سؤال أو خطوة، إضافة سؤال، الأدوات</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>Enter</kbd></dt><dd>إضافة سؤال بعد السؤال المفتوح</dd>
            <dt><kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd></dt><dd>نقل السؤال المفتوح (أو المحدد في المخطط) مكانًا واحدًا، وعبر حدود الأقسام</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>D</kbd></dt><dd>تكرار السؤال المفتوح</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Ctrl</kbd> + <kbd>Y</kbd></dt><dd>تراجع / إعادة (خارج حقول الكتابة)</dd>
            <dt><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd></dt><dd>في المخطط: التنقل بين الأسئلة وفتحها</dd>
            <dt><kbd>?</kbd></dt><dd>هذه القائمة</dd>
          </dl>
          <p className="st-cmd-hint"><IconKeyboard size={14} aria-hidden="true" /> على أجهزة Mac استخدم <kbd>⌘</kbd> بدل <kbd>Ctrl</kbd>.</p>
        </div>
      </Dialog>
      <Dialog open={drawer === "inspector" && !wide} size="md" title="لوحة الخصائص" onClose={() => setDrawer(null)} className="st-drawer-shell">
        <div className="st-drawer" dir="rtl">{inspector}</div>
      </Dialog>
    </>
  );
}
