
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { StructuredExam, BuilderQuestion, BuilderSection, BuilderImageAsset } from "./examTypes";
import type { AiImageRequestQuestion } from "./questionMedia";
import {
  addSection,
  updateSection,
  moveSection,
  addQuestion as addQ,
  updateQuestion as updQ,
  moveQuestion as movQ,
  duplicateQuestion as dupQ,
  moveQuestionToSection as movQTo,
  newSection,
  computeTotalMarks,
  countQuestions,
  cloneQuestionWithNewIds,
  type StructuredExamUpdater, genId } from "./examBuilderState";
import { hasBlockingErrors, type StructuredIssue } from "./examQuality";
import { evaluateExamFinalization } from "./examFinalization";
import { withQualityPolicy } from "./assessmentQualityPolicy";
import ExamSectionEditor from "./ExamSectionEditor";
import ExamCoverEditor from "./ExamCoverEditor";
import ExamPreview from "./ExamPreview";
import Dialog from "./ui/Dialog";
import { useConfirm } from "./ui/useConfirm";
import { useToast, type ToastDismissReason, type ToastDismissVia } from "./ui/Toast";
import { applyDeletion, captureQuestionDeletion, captureSectionDeletion, deletionIsBack, restoreDeletion, type Deletion, type RestoreOutcome } from "./structuredDeletionUndo";
import type { ExamSaveState, EditMeta } from "./examHistory";
import { historyShortcut, isTextEditingTarget } from "./examHistoryShortcuts";
import { browserBackupStorage, clearExamBackup, isRecoveryCandidate, readExamBackup, writeExamBackup, type BackupStorage, type ExamBackup } from "./examAutosave";
import {
  EMPTY_NAVIGATOR_FILTERS, indexExamQuestions, pruneSelection, usedBankQuestionIds as collectUsedBankIds, hasAnyUsedBankQuestion,
  bulkDeleteQuestions, bulkDuplicateQuestions, bulkMoveQuestions, bulkSetMarks, insertQuestionsIntoSection, bankExamQuestionToBuilderQuestion,
  type BankExamQuestion, type NavigatorFilters
} from "./structuredExamProductivity";
import ExamQuestionNavigator from "./ExamQuestionNavigator";
import BulkActionBar from "./BulkActionBar";
import type { BankPickerService, InsertOutcome } from "./BankQuestionPicker";
import type { AiAuthorService } from "./aiAuthoring/aiAuthorService";
import { withBlueprint, validateBlueprintForExam } from "./assessmentBlueprint";
import { applyBulkClassification, type BulkClassification } from "./assessmentBulkClassify";
import { focusKey, type BankPickerFocus } from "./bankPickerFocus";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import { useMediaQuery } from "./ui/useMediaQuery";
import { usePrefersReducedMotion } from "./ui/usePrefersReducedMotion";
import BuilderToolbar, { MORE_MENU_LABEL, type ToolbarItem } from "./builder/BuilderToolbar";
import { indexIssues, issueOccurrence, issuePartFocus, issueTargets, targetCardIssues, type IssuePart, type PartFocus, type IssueTarget } from "./builder/issueIndex";
import { useIssueAnnouncer, ISSUE_SETTLE_MS } from "./builder/useIssueAnnouncer";
import { stabilizeIssues, type StableIssues } from "./builder/stableIssues";
import type { BuilderActions } from "./builder/builderActions";
import type { StudioStepKey, InspectorTab } from "./studio/studioSteps";
import { insertQuestionAt, placeQuestion as placeQuestionAt } from "./studio/studioOps";
// Phase 21F.3 — the Exam Studio layout is its own chunk inside the builder chunk (the classic layout never loads it).
const StudioWorkspace = lazy(() => import("./studio/StudioWorkspace"));
const StudioReview = lazy(() => import("./studio/StudioReview"));
const StudioSetup = lazy(() => import("./studio/StudioSetup"));
const StudioPublish = lazy(() => import("./studio/StudioPublish"));
import useModalSurface from "./ui/useModalSurface";
import { SAVE_LABELS, SAVE_STATE_LABELS } from "./teacher/saveLabels";
import { IconBank, IconSparkles, IconCompass, IconBuilder, IconReports, IconCheck, IconInfo, IconHistory, IconCopy, IconImage, IconMaximize, IconSave, IconChevronDown, IconLayers } from "./icons";
import "./structured-builder.css";
import "./builder/builder-issues.css";
import "./builder/builder-premium.css";                              // 21E.2 premium redesign, slice 1 (presentation only; loaded last)

// The faithful teacher preview now lives in one shared module (Roadmap #15). Re-exported here so existing
// callers/tests that import { ExamPreview } from "./StructuredExamBuilder" keep working unchanged.
export { default as ExamPreview } from "./ExamPreview";
export type { BankPickerService } from "./BankQuestionPicker";
import type { GovernanceService } from "./examGovernance";
export type { GovernanceService } from "./examGovernance";
import type { AssessmentPresetService } from "./presets/assessmentPresetClient";
export type { AssessmentPresetService } from "./presets/assessmentPresetClient";
import { SimulationServiceContext, type SimulationService } from "./smartsim/simulationService";
import { MeshAssetServiceContext, type MeshAssetService } from "./meshModels/meshAssetService";
export type { SimulationService } from "./smartsim/simulationService";

// Phase 13B — the Question Bank picker is loaded only when a teacher opens it (its own chunk inside the builder chunk).
const BankQuestionPicker = lazy(() => import("./BankQuestionPicker"));
// Phase 13C-A — the Blueprint panel is its own lazy chunk (opened rarely; never in the initial graph).
const BlueprintPanel = lazy(() => import("./BlueprintPanel"));
// Phase 13C-B — the live ANALYSIS surface and the bulk classification dialog are lazy too (opened on demand only).
const BlueprintCoveragePanel = lazy(() => import("./BlueprintCoveragePanel"));
const BulkClassifyDialog = lazy(() => import("./BulkClassifyDialog"));
// Phase 13C-C — policy editor and readiness panel are lazy too.
const QualityPolicyPanel = lazy(() => import("./QualityPolicyPanel"));
const FinalizationPanel = lazy(() => import("./FinalizationPanel"));
const GovernancePanel = lazy(() => import("./GovernancePanel"));
// Phase 15A — «القوالب الأكاديمية» (personal Assessment Presets): lazy like the governance panel.
const PresetLibraryPanel = lazy(() => import("./presets/PresetLibraryPanel"));
// Phase 19A — «سؤال بالذكاء الاصطناعي»: lazy like the other panels (the dialog + its canonical re-verification never enter the initial graph).
const AiQuestionAuthorDialog = lazy(() => import("./aiAuthoring/AiQuestionAuthorDialog"));
// Phase 19G — AI scenario authoring (shared sources + questions), its own lazy chunk.
const AiScenarioAuthorDialog = lazy(() => import("./aiAuthoring/AiScenarioAuthorDialog"));
// Phase 20D.1 — «العرض والتصميم» (Presentation Studio): its own lazy chunk, opened on demand; it edits exam.presentation through `update`.
const PresentationStudio = lazy(() => import("./presentation/PresentationStudio"));
// Phase 20F — «المؤلف الذكي للامتحان» (AI Full Exam Composer): its own lazy chunk (dialog + composer pipeline + catalog), opened on demand.
const AiExamComposerDialog = lazy(() => import("./aiComposer/AiExamComposerDialog"));
const Surface3DLab = lazy(() => import("./functionSurfaces/Surface3DLab"));
import type { ScenarioV1 } from "./scenarioSource";

// Top-level Structured Exam Builder. It is a CONTROLLED component: the exam lives in the parent
// (App.tsx) and every edit flows back through onChange as a FUNCTIONAL updater that the parent applies to
// its LATEST exam (never a full exam captured at render time), applying the pure examBuilderState helpers.
// The parent owns persistence (save / assignment) and mode switching; this component owns the editing
// UI, validation summary, and student preview (full exam and single question) rendered through the
// SAME components students use, fed a scrubbed copy so no answer key is shown.

export type SaveMode = "draft" | "final";
type Props = {
  exam: StructuredExam;
  // Receives an updater, not a full exam: the state owner applies it to its latest exam, so an async result
  // (AI image / upload) that resolves after other edits merges instead of reverting them.
  onChange: (updater: StructuredExamUpdater, meta?: EditMeta) => void;
  /** Phase 21F.1 — a text field lost focus: the owner ends the current typing group (the next keystroke is a new undo step). */
  onTypingEnd?: () => void;
  /** Phase 21F.3 — "studio": the Exam Studio layout (outline · canvas · inspector, four steps); "classic" (default): the 21E layout.
   *  Both run the same handlers, gates and history; only the presentation differs. */
  layout?: "classic" | "studio";
  /** Phase 21F.3 — switch the layout (the owner stores the teacher's choice); absent → the switch is not offered. */
  onLayoutChange?: (layout: "classic" | "studio") => void;
  /** Phase 21F.7 — open one of the builder's tools as soon as THIS exam opens (e.g. «امتحاناتي» → «المؤلف الذكي»): the key of an
   *  «إضافة» / «أدوات» menu item, run through that item's own handler; reported back once run (or absent) so it never replays. */
  startTool?: { examId: string; key: string } | null;
  onStartToolConsumed?: () => void;
  /** Phase 21F.7 — the publish step's hand-off to the assignments workspace (after the unsaved-work guard); absent → not offered. */
  onOpenAssignments?: () => void;
  /** Phase 21F.8 — the exam has had unsaved edits and no new edit for `idleSaveDelayMs` (no save, no media upload in flight): the owner
   *  may save a draft to the server (it decides whether it is allowed). Absent → no server autosave. */
  onIdleSave?: () => void;
  idleSaveDelayMs?: number;
  onSave?: (mode: SaveMode) => void;
  onExit?: () => void;
  saving?: boolean;
  notice?: string;
  error?: string;
  // Phase 5B — authenticated per-question AI image callback (App.tsx owns auth). Optional/back-compatible.
  requestQuestionImage?: (q: AiImageRequestQuestion) => Promise<BuilderImageAsset>;
  // Phase 13A — reliability layer (all optional; the state owner's history authority decides, this component only
  // renders and forwards). Undo / redo never touch the DOM or display numbers: they swap whole exam snapshots.
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** saved / dirty / saving / recovered — derived by the owner from its history + saved checkpoint, never from exam.status. */
  saveState?: ExamSaveState;
  /** Teacher-safe namespace of the LOCAL autosave backup (enables autosave + recovery offer when set). */
  recoveryScope?: string;
  /** Apply a recovered local backup (the owner routes it through its history authority). */
  onRecover?: (backup: StructuredExam) => void;
  /** Storage override for tests; defaults to the browser's localStorage (or none). */
  backupStorage?: BackupStorage | null;
  autosaveDelayMs?: number;
  /** 21E.1 slice 2 — how long the «تراجع» toast stays after deleting a question or a section (tests shorten it). */
  undoToastMs?: number;
  // Phase 13B — App-owned, authenticated Question Bank callbacks (list rows / exact-id canonical retrieval). The builder
  // never receives a token; without a service the "إضافة من بنك الأسئلة" action is simply not offered.
  bankPicker?: BankPickerService;
  // Phase 14A — the App-owned window onto the SERVER publishing authority (status, revisions, transitions). Like the bank
  // picker, the builder never receives a token; without a service the «إدارة النشر والإصدارات» action is simply not offered.
  governance?: GovernanceService;
  // Phase 15A — the App-owned Assessment Preset service («القوالب الأكاديمية»). The builder never receives a token; without a
  // service the action is simply not offered. `onOpenExamFromPreset` receives a NEW draft exam (fresh examId / section ids,
  // zero questions) that the owner opens through its history authority — after the 13A unsaved-work guard ran here.
  presets?: AssessmentPresetService;
  onOpenExamFromPreset?: (exam: StructuredExam) => void;
  // Phase 16B-A — the App-owned Simulation service (upload / library). Same pattern: the builder never receives a token; the
  // lazy simulation editor reaches the service through context; without a service the upload / library actions are not offered.
  simulations?: SimulationService;
  /** Phase 21D-B.3 — the App-owned mesh asset service (upload / "my models" in the 3D model editor); absent → library only. */
  meshAssets?: MeshAssetService;
  // Phase 19A — the App-owned AI authoring service (one POST to /api/ai-question-author). The builder never receives a token; without
  // a service the «سؤال بالذكاء الاصطناعي» action is simply not offered.
  aiAuthor?: AiAuthorService;
  /** K2 A-F3 — inside App's modal overlay: the page control that takes focus when the builder closes and the control that opened it
   *  has left the page (a saved-exams row, «متابعة تحرير الامتحان المنظّم», the import wizard). Read once the closing update rendered. */
  returnFocusTo?: () => HTMLElement | null;
};

const AUTOSAVE_DELAY_MS = 800;
const IDLE_SAVE_DELAY_MS = 5000;
/** Phase 21E.2 — the toolbar's (visually hidden) heading; App's builder overlay is aria-labelledby it. One builder at a time. */
const BUILDER_TITLE_ID = "sb-builder-title";
// K3 (A-F7) — the glyph is shown but never spoken (an aria-hidden span inside the polite status). RF3 I-4: the words are the save-label
// table's (SAVE_STATE_LABELS), so the status says «جارٍ الحفظ…» exactly like the draft button while a save runs.
const SAVE_STATE_GLYPH: Record<ExamSaveState, string> = { saved: "✓", dirty: "●", saving: "⏳", recovered: "↺" };
const EMPTY_IDS: ReadonlySet<string> = new Set<string>();
const EMPTY_REVEALS: ReadonlyMap<string, number> = new Map<string, number>();
/** Phase 21E.2 (D) — a control whose Field frame shows an error now (aria-invalid) and that can take focus. */
const INVALID_FIELD = ['input', 'select', 'textarea'].map(t => t + '[aria-invalid="true"]:not([disabled])').join(", ");
/** RF2-2 — any control that can take focus (e.g. «+ إضافة خيار» in a multiple-choice frame without options). */
const ENABLED_CONTROL = ['button', 'input:not([type="hidden"])', 'select', 'textarea'].map(t => t + ':not([disabled])').join(", ");
/** RF3 I-1 — what a summary entry focuses: the clicked issue's code, which instance of it (RF2-1; none for an issue of an earlier
 *  card sharing the id, I-3) and the compound / composite part it belongs to, with what of that part it is about (I-1, RR3-3). */
type IssueInstance = { code: string; nth?: number; part: PartFocus | "ambiguous" | null };
/** RF3 I-1 — the element showing a part, located through the editors' existing markup (never a new attribute: compound@1 is frozen):
 *  a compound part by its position among `.sb-compound-editor > .sb-part`, a composite part by its `data-part-id`. */
const partNode = (card: HTMLElement, part: IssuePart): HTMLElement | null => {
  if (part.family === "compound") {
    const editor = card.querySelector<HTMLElement>(".sb-compound-editor");
    return (Array.from(editor?.children ?? []).filter(c => c.classList.contains("sb-part"))[part.index] as HTMLElement | undefined) ?? null;
  }
  const hits = Array.from(card.querySelectorAll<HTMLElement>(".sb-part[data-part-id]")).filter(n => n.dataset.partId === part.id);
  return hits.length === 1 ? hits[0] : null;
};
/** A part's answer body: its last child after the part text (both editors render head · text [· rich content] · body). */
const partBody = (part: HTMLElement): HTMLElement | null => {
  const body = part.lastElementChild as HTMLElement | null;
  return body && !body.matches(".sb-part-head, .sb-part-text, .rc-host") ? body : null;
};
const ENABLED_VALUE_CONTROL = ['input:not([type="hidden"])', 'select', 'textarea'].map(t => t + ':not([disabled])').join(", ");
/** RF3 I-1 / RR3-3 — the control in a part that a part issue is about, and the element to bring into view with it (null: none can be
 *  told apart — the caller focuses the card's named issue list, never a row the issue does not name).
 *  - a numbered row (the N-th `.sb-field-row` of the body: the validator's N-th pair / statement / blank): its correct-answer control
 *    (the row's last input / select) for a missing or unreachable answer, else its first empty control, else its first control;
 *  - the rich content: the part's rich-content control (its toggle, or the button that removes a parametric part's rich content);
 *  - the type: the head's type select;
 *  - the body as a whole: its first enabled control («+ إضافة خيار» with no options), else the type select. */
const partTarget = (part: HTMLElement, focus: PartFocus): { field: HTMLElement; shown: HTMLElement } | null => {
  const typeSelect = part.querySelector<HTMLElement>(".sb-part-head select:not([disabled])");
  if (focus.at === "type") return typeSelect ? { field: typeSelect, shown: part } : null;
  if (focus.at === "rich") {
    const host = Array.from(part.children).find(c => c.matches(".rc-host, .sb-warn-text")) as HTMLElement | undefined;
    const field = host?.querySelector<HTMLElement>(ENABLED_CONTROL);
    return host && field ? { field, shown: host } : null;
  }
  const body = partBody(part);
  if (focus.at === "row") {
    const row = body?.querySelectorAll<HTMLElement>(".sb-field-row")[focus.row - 1];
    const controls = Array.from(row?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(ENABLED_VALUE_CONTROL) ?? []);
    const field = (focus.answer ? controls.at(-1) : controls.find(c => !c.value.trim()) ?? controls[0]) ?? row?.querySelector<HTMLElement>(ENABLED_CONTROL);
    return row && field ? { field, shown: row } : null;
  }
  if (focus.at !== "body") return null;
  const field = body?.querySelector<HTMLElement>(ENABLED_CONTROL);
  return field && body ? { field, shown: body } : typeSelect ? { field: typeSelect, shown: part } : null;
};
/** RF3 I-2 — the control a summary entry focused shows it whatever moved focus there (builder-issues.css draws the marker with the
 *  focus ring: Chromium does not match :focus-visible for script focus after a pointer click). Removed when it loses focus. */
const ISSUE_FOCUS = "data-issue-focus";
function clearIssueFocus(this: HTMLElement) { this.removeAttribute(ISSUE_FOCUS); }
const FLASH_MS = 1200;
const UNDO_TOAST_MS = 10000;
/** Height of the band a toast covers at the bottom of the builder — keep in sync with structured-builder.css
 *  (`.structured-builder-overlay:has(.eb-toast)` reserves 16 px × 2 + 96 px). */
const TOAST_BAND = 128;
/** RF3 A-01 — the stuck toolbar's height on `.sb-builder` (builder-toolbar.css offsets the layers that stick below it by it). */
const TOOLBAR_BAND_VAR = "--sb-toolbar-band";
/** User-perceived characters: a letter with its harakat / shadda, an emoji sequence or a flag is ONE grapheme (never split). */
const graphemesOf = (text: string): string[] =>
  typeof Intl.Segmenter === "function" ? Array.from(new Intl.Segmenter("ar", { granularity: "grapheme" }).segment(text), x => x.segment) : Array.from(text);
/** Trailing whitespace and invisible format characters (ZWJ, ZWNJ, bidi marks…) never sit before the «…». */
const TRAILING_FORMAT = /[\s\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]+$/u;
/** Review Fix 1 (V1) — a title as SHOWN in a toast: at most `limit` graphemes (cut at a word — any whitespace — when one falls in
 *  the second half) + «…», so a long title never makes the 16 px message taller than two lines at 200 %; screen readers get the
 *  full title through the announcement. Review Fix 2: counted in graphemes, so a vocalised title keeps its marks and its length. */
const toastTitle = (title: string, limit = 40) => {
  const g = graphemesOf(title.trim());
  if (g.length <= limit) return g.join("");
  let cut = g.slice(0, limit);
  const lastSpace = cut.map(x => /\s/u.test(x)).lastIndexOf(true);
  if (lastSpace >= limit / 2) cut = cut.slice(0, lastSpace);
  return cut.join("").replace(TRAILING_FORMAT, "") + "…";
};
/** «سؤال واحد / سؤالين / 3 أسئلة / 11 سؤالًا / 100 سؤال / 103 أسئلة» — the count that leaves with a deleted section (Arabic counts
 *  agree with the last two digits). */
const questionCountPhrase = (n: number) => {
  if (n === 1) return "سؤال واحد";
  if (n === 2) return "سؤالين";
  const r = n % 100;
  return n + (r >= 3 && r <= 10 ? " أسئلة" : r >= 11 ? " سؤالًا" : " سؤال");
};
/** Keyboard users hear the routes back: right after a deletion focus is on a card or a button (never a text field), so Ctrl+Z / ⌘Z
 *  undoes it; the toast's own «تراجع» is the builder's second-to-last Tab stop (the toast sits at its end; only its × follows),
 *  and the toolbar «تراجع» is near its start. */
const UNDO_HINT = " للتراجع اضغط Ctrl+Z (أو ⌘Z) أو استخدم زر «تراجع».";
// UI-only productivity state (selection ids + navigator filters). Keyed by exam id so it is RESET when another exam opens,
// and pruned against the live exam so a deleted / undone question never lingers (and is never resurrected by redo).
type ProductivityUi = { examId: string; ids: ReadonlySet<string>; filters: NavigatorFilters };
type ActionImpl = Omit<BuilderActions, "registerNode"> & { requestImage: (q: AiImageRequestQuestion) => Promise<BuilderImageAsset> };
const formatBackupTime = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : ""; };

export default function StructuredExamBuilder({ exam, onChange, onTypingEnd, layout = "classic", onLayoutChange, startTool, onStartToolConsumed, onOpenAssignments, onIdleSave, idleSaveDelayMs = IDLE_SAVE_DELAY_MS, onSave, onExit, saving, notice, error, requestQuestionImage, onUndo, onRedo, canUndo = false, canRedo = false, saveState, recoveryScope, onRecover, backupStorage, autosaveDelayMs = AUTOSAVE_DELAY_MS, undoToastMs = UNDO_TOAST_MS, bankPicker, governance, presets, onOpenExamFromPreset, simulations, meshAssets, aiAuthor, returnFocusTo }: Props) {
  const [preview, setPreview] = useState<StructuredExam | null>(null);
  const [surfaceLabOpen, setSurfaceLabOpen] = useState(false);
  const [showIssues, setShowIssues] = useState(true);
  const { confirm, confirmDialog } = useConfirm();
  const unsaved = saveState === "dirty" || saveState === "recovered";

  // Lifecycle + identity guard for late async results: once this builder has closed (unmounted), or the
  // state owner now holds a DIFFERENT exam than the one this render edited, an update is dropped — a late
  // image can never modify an exam after the editor closed or land in another exam.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const sourceExamId = exam.examId;
  // Phase 21F.1 — an edit made while the browser is delivering a keyboard text entry (native `beforeinput`, see the listener below)
  // is marked `typing`: the history authority folds consecutive keystrokes in one field into one undo step.
  const typingNow = useRef(false);
  const update = (fn: StructuredExamUpdater) => {
    if (!alive.current) return;
    const updater: StructuredExamUpdater = prev => (prev.examId === sourceExamId ? fn(prev) : prev);
    if (typingNow.current) onChange(updater, { typing: true }); else onChange(updater);
  };
  const setSections = (updater: (s: BuilderSection[]) => BuilderSection[]) => update(prev => ({ ...prev, sections: updater(prev.sections || []) }));

  // Pending media operations (upload read / AI generation), counted per question id. While any operation on
  // a question that still exists is pending, BOTH save buttons are disabled: a save snapshot taken now would
  // miss the image the operation is about to apply, yet the UI would report the exam as saved/final. Editing
  // and concurrent generation on other questions stay allowed. A count (not a boolean) per id so overlapping
  // operations never clear each other; every registration is released when its operation settles; a deleted
  // question's pending result is a no-op (updateQuestion by id), so it no longer blocks saving; after this
  // builder unmounts no state is updated.
  const [pendingMedia, setPendingMedia] = useState<Record<string, number>>({});
  const onMediaBusyChange = (questionId: string, busy: boolean) => {
    if (!alive.current) return;
    setPendingMedia(prev => {
      const n = Math.max(0, (prev[questionId] || 0) + (busy ? 1 : -1));
      const next = { ...prev };
      if (n > 0) next[questionId] = n; else delete next[questionId];
      return next;
    });
  };
  const liveQuestionIds = new Set((exam.sections || []).flatMap(s => (s.questions || []).map(q => q.examQuestionId)));
  const mediaPending = Object.keys(pendingMedia).some(id => liveQuestionIds.has(id));
  // Per-question view of the same authority: locks that question's media controls across remounts and its
  // move-to-section (a pending result is patched into the question's CURRENT section; moving it away would
  // silently drop the image).
  const pendingMediaIds: ReadonlySet<string> = useMemo(() => new Set(Object.keys(pendingMedia)), [pendingMedia]);
  const MEDIA_WAIT = "انتظر انتهاء معالجة الصور قبل الحفظ.";
  // Phase 21F.1 — the same array while no section is added, removed, moved or renamed (memoized cards receive it).
  const sectionOptionsKey = JSON.stringify((exam.sections || []).map(s => [s.id, s.title]));
  const sectionOptions = useMemo(() => (JSON.parse(sectionOptionsKey) as [string, string][]).map(([id, title]) => ({ id, title })), [sectionOptionsKey]);

  // ── Phase 13A · keyboard undo / redo (outside text fields only — see examHistoryShortcuts) ──
  const historyRef = useRef({ onUndo, onRedo, canUndo, canRedo, saving: !!saving });
  useEffect(() => { historyRef.current = { onUndo, onRedo, canUndo, canRedo, saving: !!saving }; }, [onUndo, onRedo, canUndo, canRedo, saving]);
  useEffect(() => {
    if (!onUndo && !onRedo) return;
    const handler = (e: KeyboardEvent) => {
      const action = historyShortcut(e);
      if (!action || isTextEditingTarget(e.target)) return;
      const h = historyRef.current;
      e.preventDefault();
      if (h.saving) return;
      if (action === "undo" && h.canUndo) h.onUndo?.();
      if (action === "redo" && h.canRedo) h.onRedo?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onUndo, onRedo]);

  // ── Phase 13A · LOCAL autosave (debounced; keyed by teacher scope + exam id; never a server request) ──
  const storage = backupStorage === undefined ? browserBackupStorage() : backupStorage;
  const autosaveEnabled = !!recoveryScope && !!storage;
  // The previous save state of THIS exam: a backup is cleared only on a TRANSITION to "saved" (a save succeeded, or an
  // undo returned to the checkpoint) — never on mount, where a backup may be the recovery offer being evaluated.
  const prevStateRef = useRef<{ examId: string; state: ExamSaveState | undefined } | null>(null);
  // The edit whose debounced write has not happened yet (flushed on unmount / exam switch so it is never lost).
  const pendingBackup = useRef<{ examId: string; exam: StructuredExam } | null>(null);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = { examId: exam.examId, state: saveState };
    if (!autosaveEnabled || !recoveryScope) return;
    if (!unsaved) {
      pendingBackup.current = null;
      if (saveState === "saved" && prev && prev.examId === exam.examId && prev.state !== undefined && prev.state !== "saved") clearExamBackup(storage, recoveryScope, exam.examId);
      return;
    }
    pendingBackup.current = { examId: exam.examId, exam };
    const timer = window.setTimeout(() => { pendingBackup.current = null; writeExamBackup(storage, recoveryScope, exam, new Date().toISOString()); }, autosaveDelayMs);
    return () => window.clearTimeout(timer);                                       // debounce: a newer edit supersedes
  }, [autosaveEnabled, recoveryScope, storage, exam, unsaved, saveState, autosaveDelayMs]);
  useEffect(() => {
    const examId = exam.examId;
    return () => {
      // Unmount or exam switch with a pending debounced write: flush it — only for THIS exam, never another's snapshot.
      const pending = pendingBackup.current;
      if (pending && pending.examId === examId && recoveryScope && storage) { pendingBackup.current = null; writeExamBackup(storage, recoveryScope, pending.exam, new Date().toISOString()); }
    };
  }, [exam.examId, recoveryScope, storage]);

  // ── Phase 21F.8 · idle signal for the owner's server draft autosave: every edit restarts the wait; nothing is asked while a save or a
  //    media upload is in flight or while the exam has nothing unsaved (a recovered copy waits for the teacher's own save).
  const idleSave = useRef(onIdleSave);
  useLayoutEffect(() => { idleSave.current = onIdleSave; });
  const wantsIdleSave = !!onIdleSave;
  useEffect(() => {
    if (!wantsIdleSave || saveState !== "dirty" || saving || mediaPending) return;
    const timer = window.setTimeout(() => idleSave.current?.(), idleSaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [wantsIdleSave, exam, saveState, saving, mediaPending, idleSaveDelayMs]);

  // ── Phase 13A · recovery offer: once per (scope, exam id), only for a NEWER, DIFFERENT backup of the SAME exam ──
  const [recoveryOffer, setRecoveryOffer] = useState<ExamBackup | null>(null);
  const offeredFor = useRef("");
  useEffect(() => {
    if (!autosaveEnabled || !recoveryScope) return;
    const key = recoveryScope + "\u0000" + exam.examId;
    if (offeredFor.current === key) return;
    offeredFor.current = key;
    const backup = readExamBackup(storage, recoveryScope, exam.examId);
    setRecoveryOffer(isRecoveryCandidate(backup, exam) ? backup : null);
  }, [autosaveEnabled, recoveryScope, storage, exam]);
  const restoreBackup = () => {
    const offer = recoveryOffer;
    setRecoveryOffer(null);
    if (offer && offer.exam.examId === exam.examId) onRecover?.(offer.exam);
  };
  const discardBackup = () => {
    setRecoveryOffer(null);
    if (recoveryScope) clearExamBackup(storage, recoveryScope, exam.examId);
  };

  // ── Phase 13A · exit protection: no silent loss. Refresh / close-tab warns while unsaved (never touches the session);
  //    the builder's own "back" asks first, through the project's ConfirmDialog authority. ──
  useEffect(() => {
    if (!unsaved) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [unsaved]);
  // The ONE unsaved-work confirmation (13A): used by the builder's own "back" AND by every flow that replaces the active exam
  // (Phase 15A: creating a new exam from an Assessment Preset). Resolves true when leaving is allowed.
  const confirmLeaveUnsaved = async (confirmLabel: string) => {
    if (!unsaved) return true;
    const ok = await confirm({
      title: "تغييرات غير محفوظة",
      message: "توجد تغييرات غير محفوظة في هذا الامتحان.\nستبقى نسخة غير محفوظة في هذه الجلسة" + (autosaveEnabled ? " ونسخة احتياطية محلية على هذا الجهاز" : "") + "، لكنها لن تُحفظ على الخادم حتى تضغط حفظ.",
      confirmLabel,
      cancelLabel: "البقاء في المحرر",
      tone: "danger"
    });
    return ok && alive.current;
  };
  const requestExit = async () => {
    if (!onExit) return;
    if (!(await confirmLeaveUnsaved("الخروج دون حفظ"))) return;
    onExit();
  };
  // Phase 15A — a preset instantiates a NEW draft; it never merges into or silently overwrites the current exam.
  const openExamFromPreset = async (next: StructuredExam): Promise<boolean> => {
    if (!onOpenExamFromPreset) return false;
    if (!(await confirmLeaveUnsaved("فتح الامتحان الجديد دون حفظ"))) return false;
    onOpenExamFromPreset(next);
    return true;
  };

  // ── Phase 13B · authoring productivity: navigator, selection, bulk actions, bank picker ──
  // Selection and filters are UI state only (never exam data, never saved / autosaved / part of history). Adjusted during
  // render (not in an effect): reset when the exam id changes, pruned when the exam no longer contains a selected id.
  const [ui, setUi] = useState<ProductivityUi>(() => ({ examId: exam.examId, ids: EMPTY_IDS, filters: EMPTY_NAVIGATOR_FILTERS }));
  let uiState = ui;
  if (ui.examId !== exam.examId) {
    uiState = { examId: exam.examId, ids: EMPTY_IDS, filters: EMPTY_NAVIGATOR_FILTERS };
    setUi(uiState);
  } else {
    const pruned = pruneSelection(ui.ids, exam);
    if (pruned !== ui.ids) { uiState = { ...ui, ids: pruned }; setUi(uiState); }
  }
  const selected = uiState.ids;
  // ── Phase 21F.3 · Studio UI state (never exam data): the step, the ONE active question, the section whose settings the inspector
  //    shows, the inspector tab. Reset for another exam; an active question that left the exam (deleted, undone) is let go.
  const studio = layout === "studio";
  type StudioUi = { examId: string; step: StudioStepKey; activeId: string | null; sectionId: string | null; tab: InspectorTab };
  const [studioUiState, setStudioUi] = useState<StudioUi>(() => ({ examId: exam.examId, step: "content", activeId: null, sectionId: null, tab: "question" }));
  let studioUi = studioUiState;
  if (studioUi.examId !== exam.examId) { studioUi = { examId: exam.examId, step: "content", activeId: null, sectionId: null, tab: "question" }; setStudioUi(studioUi); }
  else if ((studioUi.activeId && !(exam.sections || []).some(sec => (sec.questions || []).some(q => q.examQuestionId === studioUi.activeId)))
    || (studioUi.sectionId && !(exam.sections || []).some(sec => sec.id === studioUi.sectionId))) {
    studioUi = { ...studioUi, activeId: (exam.sections || []).some(sec => (sec.questions || []).some(q => q.examQuestionId === studioUi.activeId)) ? studioUi.activeId : null,
      sectionId: (exam.sections || []).some(sec => sec.id === studioUi.sectionId) ? studioUi.sectionId : null };
    setStudioUi(studioUi);
  }
  const navFilters = uiState.filters;
  const setSelected = (fn: (prev: ReadonlySet<string>) => ReadonlySet<string>) => setUi(prev => ({ ...prev, ids: fn(prev.ids) }));
  const toggleSelect = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectMany = (ids: string[]) => setSelected(prev => { const next = new Set(prev); for (const id of ids) next.add(id); return next; });
  const clearSelection = () => setSelected(() => EMPTY_IDS);
  const selectedIds = () => Array.from(selected);
  // Pending media on a SELECTED question blocks the operations that would move / drop / copy the question the image is
  // about to be patched into (same rule as the single-card move-to-section lock). Marks never invalidate the callback.
  const selectedMediaPending = selectedIds().some(id => pendingMediaIds.has(id));
  const pendingMediaRef = useRef(pendingMediaIds);
  useEffect(() => { pendingMediaRef.current = pendingMediaIds; }, [pendingMediaIds]);

  const navEntries = useMemo(() => indexExamQuestions(exam), [exam]);
  const [navOpen, setNavOpen] = useState(false);
  const isNarrow = useMediaQuery("(max-width: 900px)");
  const navId = "sb-navigator-" + exam.examId.replace(/[^a-zA-Z0-9_-]/g, "");
  // Stable DOM anchors by examQuestionId (never display numbers): registered by the real cards.
  const nodes = useRef(new Map<string, HTMLDivElement>());
  // Phase 21F.1 — ONE stable actions object for every section editor and card (builder/builderActions.ts). Each call runs the
  // implementation of the latest commit (`actionImpl`, refreshed in the layout phase — before any event can call it). An action
  // created for another exam (a late AI image / upload of an exam that is no longer open) is dropped, as the per-render closures
  // were before (5B / 13A). Node registration only touches the node map, so it needs no implementation swap.
  const actionImpl = useRef<ActionImpl | null>(null);
  const [actions] = useState<BuilderActions>(() => ({
    patchSection: (...a) => actionImpl.current?.patchSection(...a),
    deleteSection: (...a) => actionImpl.current?.deleteSection(...a),
    moveSection: (...a) => actionImpl.current?.moveSection(...a),
    addQuestion: (...a) => actionImpl.current?.addQuestion(...a),
    changeQuestion: (...a) => actionImpl.current?.changeQuestion(...a),
    deleteQuestion: (...a) => actionImpl.current?.deleteQuestion(...a),
    moveQuestion: (...a) => actionImpl.current?.moveQuestion(...a),
    duplicateQuestion: (...a) => actionImpl.current?.duplicateQuestion(...a),
    moveQuestionToSection: (...a) => actionImpl.current?.moveQuestionToSection(...a),
    previewQuestion: (...a) => actionImpl.current?.previewQuestion(...a),
    insertQuestion: (...a) => actionImpl.current?.insertQuestion(...a),
    placeQuestion: (...a) => actionImpl.current?.placeQuestion(...a),
    toggleSelect: (...a) => actionImpl.current?.toggleSelect(...a),
    mediaBusy: (...a) => actionImpl.current?.mediaBusy(...a),
    registerNode: (id, el) => { if (el) nodes.current.set(id, el); else nodes.current.delete(id); }
  }));
  // The AI image callback the owner gives changes identity on every owner render; the cards get a stable one (present iff given).
  const [stableRequestImage] = useState(() => (q: AiImageRequestQuestion) => actionImpl.current ? actionImpl.current.requestImage(q) : Promise.reject(new Error("builder closed")));
  const [flashId, setFlashId] = useState("");
  useEffect(() => {
    if (!flashId) return;
    const t = window.setTimeout(() => setFlashId(""), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [flashId]);
  const reducedMotion = usePrefersReducedMotion();
  const scrollBehavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";
  const builderRef = useRef<HTMLDivElement | null>(null);
  // Phase 21F.3 — in the Studio the canvas scrolls (the overlay does not), and no sticky toolbar sits inside it.
  const scrollerOf = () => (studio ? builderRef.current?.querySelector<HTMLElement>("[data-studio-scroller]") ?? null : builderRef.current?.closest<HTMLElement>(".structured-builder-overlay") ?? null);
  /** K2 C-F4 — builder-toolbar.css makes the toolbar sticky only where there is room for it (≥ 768 × 600); elsewhere it is static
   *  and scrolls away with the content. ("" = no stylesheet, e.g. in unit tests: treated as sticky, as before.) */
  const isStaticBox = (el: HTMLElement) => { const p = getComputedStyle(el).position; return p === "static" || p === "relative"; };
  /** RF3 A-01 — the bulk-action bar while it is sticky (questions selected; it sticks right below the toolbar, builder-toolbar.css). */
  const stickyBulkBar = () => {
    const bar = builderRef.current?.querySelector<HTMLElement>(".sb-bulk-bar");
    return bar && getComputedStyle(bar).position === "sticky" ? bar : null;
  };
  /** The edge a heading must be below to be seen (0 without a toolbar): the bottom of the sticky layers at the top of the scroller —
   *  the stuck toolbar and, while questions are selected, the bulk-action bar below it (RF3 A-01). Where the toolbar is static
   *  (phones, 200 %) it is the scroller's top: the static toolbar has scrolled away with the content and covers nothing — RF3 A-02:
   *  its bottom edge, thousands of px above the screen once scrolled, made every heading above the screen count as on screen, so
   *  focus landed on a card nobody could see (a deletion's neighbour, a Ctrl+Y). */
  const toolbarBottom = () => {
    if (studio) {
      let top = scrollerOf()?.getBoundingClientRect().top ?? 0;
      const bulkBar = stickyBulkBar();
      if (bulkBar) top = Math.max(top, bulkBar.getBoundingClientRect().bottom);
      return top;
    }
    const bar = builderRef.current?.querySelector<HTMLElement>(".sb-toolbar");
    let edge = !bar ? 0 : isStaticBox(bar) ? (scrollerOf()?.getBoundingClientRect().top ?? 0) : bar.getBoundingClientRect().bottom;
    const bulk = stickyBulkBar();
    if (bulk) edge = Math.max(edge, bulk.getBoundingClientRect().bottom);
    return edge;
  };
  /** Space a revealed element keeps clear at the top of the builder's scroller: down to the sticky toolbar's bottom edge (the
   *  scroller's padding puts the stuck toolbar below its top, so its height alone falls short) plus 12 px. At the end of the scroll
   *  range the room reserved below the builder pushes the stuck toolbar up; a reveal scrolls it back to its resting place (the
   *  scroller's top padding + its own height), so the clearance is never measured below that (Review Fix 2).
   *  K2 C-F4 — the toolbar is sticky only where there is room for it (builder-toolbar.css: ≥ 768 × 600). Below that (phones,
   *  200 % zoom) it is static: it scrolls away with the content and, standing before every target in the flow, can never cover
   *  one — a reveal keeps only the 12 px. (Its resting band there would land every reveal a whole toolbar lower.)
   *  RF3 A-01 — while questions are selected the bulk-action bar sticks below the toolbar (its `top` = the toolbar's band + 8 px,
   *  builder-toolbar.css), so a target is revealed below the bar's resting place too (scroller padding + its `top` + its height). */
  const toolbarClearance = () => {
    if (studio) { const bulkBar = stickyBulkBar(); return bulkBar ? Math.round(bulkBar.getBoundingClientRect().height + 20) : 12; }
    const bar = builderRef.current?.querySelector<HTMLElement>(".sb-toolbar");
    const toolbarSticky = !!bar && !isStaticBox(bar);
    const bulk = stickyBulkBar();
    if (!toolbarSticky && !bulk) return 12;
    const scroller = scrollerOf();
    const scrollerTop = scroller?.getBoundingClientRect().top ?? 0;
    const style = scroller ? getComputedStyle(scroller) : null;
    const padding = style ? parseFloat(style.paddingBlockStart) || parseFloat(style.paddingTop) || 0 : 0;
    let band = 0;
    if (bar && toolbarSticky) { const r = bar.getBoundingClientRect(); band = Math.max(0, r.bottom - scrollerTop, padding + r.height); }
    if (bulk) { const offset = parseFloat(getComputedStyle(bulk).top); if (Number.isFinite(offset)) band = Math.max(band, padding + offset + bulk.getBoundingClientRect().height); }
    return Math.round(band + 12);
  };
  // RF3 A-01 — the stuck toolbar's height, published for the layers that stick below it (builder-toolbar.css: the bulk-action bar,
  // the inline question explorer). They used fixed offsets sized for the old 64 px toolbar and slid under the 21E.2 toolbar. Kept
  // current while the toolbar wraps (width, zoom, status chips).
  useLayoutEffect(() => {
    const root = builderRef.current, bar = root?.querySelector<HTMLElement>(".sb-toolbar");
    if (!root || !bar) return;
    const publish = () => root.style.setProperty(TOOLBAR_BAND_VAR, Math.ceil(bar.getBoundingClientRect().height) + "px");
    publish();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  // Phase 21F.1 — keyboard typing detection. `beforeinput` of a text-entry kind (never a paste, a drop or a history command) in a text
  // field marks the edit its `input` event produces in the same task; a field losing focus ends the typing group.
  const typingEndRef = useRef(onTypingEnd);
  useEffect(() => { typingEndRef.current = onTypingEnd; }, [onTypingEnd]);
  useEffect(() => {
    const root = builderRef.current;
    if (!root) return;
    const TYPED = /^(insertText|insertCompositionText|insertReplacementText|deleteContentBackward|deleteContentForward|deleteWordBackward|deleteWordForward)$/;
    const onBeforeInput = (e: Event) => {
      const kind = (e as InputEvent).inputType || "";
      // A paste / drop / history command right after typing is never folded into the keystrokes before it.
      typingNow.current = TYPED.test(kind) && isTextEditingTarget(e.target);
      if (typingNow.current) window.setTimeout(() => { typingNow.current = false; }, 0);
    };
    const onFocusOut = (e: FocusEvent) => { if (isTextEditingTarget(e.target)) typingEndRef.current?.(); };
    root.addEventListener("beforeinput", onBeforeInput, true);
    root.addEventListener("focusout", onFocusOut, true);
    return () => { root.removeEventListener("beforeinput", onBeforeInput, true); root.removeEventListener("focusout", onFocusOut, true); };
  }, []);
  // RR3-A11Y-2 / audit B-02 (WCAG 2.4.11) — a Tab / Shift+Tab never leaves keyboard focus under the sticky layers. Chromium does not
  // scroll a focus stop that is "in view" behind a sticky bar (the stuck toolbar and, with a selection, the bulk-action bar below
  // it), and scrolls one that is above the screen only to the scroller's top — under the same bars. After a Tab moves focus, the
  // scroller moves just enough to put the control below their edge + 12 px (the reveal clearance). Only keyboard moves are adjusted:
  // the programmatic reveals (alignCard / alignSection) already land below the edge. A control that sits in a fixed / sticky layer
  // (the toolbar, the bulk bar, the inline explorer, a toast, a dialog) never scrolls with the content and is left alone.
  useEffect(() => {
    const root = builderRef.current;
    if (!root) return;
    let tabbing = false;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      tabbing = true;
      window.setTimeout(() => { tabbing = false; }, 0);
    };
    const inFixedLayer = (el: HTMLElement) => {
      for (let n: HTMLElement | null = el; n && n !== root; n = n.parentElement) {
        const p = getComputedStyle(n).position;
        if (p === "sticky" || p === "fixed") return true;
      }
      return false;
    };
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!tabbing || !(t instanceof HTMLElement) || inFixedLayer(t)) return;
      tabbing = false;
      const scroller = scrollerOf(), edge = toolbarBottom(), top = t.getBoundingClientRect().top;
      if (scroller && top < edge) scroller.scrollTop -= Math.ceil(edge - top + 12);
    };
    document.addEventListener("keydown", onKeyDown, true);
    root.addEventListener("focusin", onFocusIn);
    return () => { document.removeEventListener("keydown", onKeyDown, true); root.removeEventListener("focusin", onFocusIn); };
  }, []);                                                                // eslint-disable-line react-hooks/exhaustive-deps
  /** 21E.1 slice 2 — a card that does not fit below the sticky toolbar is aligned by its top (its number and tools stay visible,
   *  e.g. at 200 % zoom); one that fits is centred. Either way it keeps the toolbar's height + 12 px clear above it. */
  const alignCard = (el: HTMLElement, bottomReserve = 0) => {
    const clearance = toolbarClearance();
    el.style.scrollMarginBlockStart = clearance + "px";
    // While a toast is shown (or about to show: `bottomReserve`) the scroller's scroll-padding reserves its band at the bottom
    // (structured-builder.css), which shrinks the area a centred card is centred in — a card must fit that smaller area, or it
    // is aligned by its top.
    const band = Math.max(bottomReserve, builderRef.current?.querySelector(".eb-toast") ? TOAST_BAND : 0);
    const fits = el.getBoundingClientRect().height <= window.innerHeight - band - clearance - 24;
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: fits ? "center" : "start", behavior: scrollBehavior });
  };
  const focusCard = (id: string) => {
    const el = nodes.current.get(id);
    if (!el || !alive.current) return;
    alignCard(el);
    el.focus({ preventScroll: true });
    setFlashId(id);
  };
  // ── Phase 21E.1 slice 2 · delete ONE question / ONE section with a safe «تراجع» toast ──
  // The deletion is captured INSIDE the updater (from the exact `prev` it deletes from — StrictMode-safe, never a stale render copy)
  // and settled after the builder commit (the same record-then-settle pattern as the bank insertion below). «تراجع» puts the
  // unchanged snapshot back as ONE new history entry, re-validated against the exam as it is then (src/structuredDeletionUndo.ts);
  // it never pops the history stack, so later edits are never undone by mistake.
  const { showToast, dismissToast, toastRegion } = useToast({ defaultDurationMs: undoToastMs, actionDisabled: !!saving });
  const undoTarget = useRef<{ deletion: Deletion; toastId: number } | null>(null);
  /** The last deleted item that came back («تراجع», or Ctrl+Z / the toolbar while its toast was up) and whether it is in the exam
   *  now — a Ctrl+Z / Ctrl+Y that removes or returns it must not leave keyboard focus on <body> (Review Fix 2, measured in
   *  Chromium). `neighbour` = the element the recovery itself focused when the item left; `successToastId` = the «تمت استعادة»
   *  toast, which leaves with the item (Review Fix 3). */
  const restoredTarget = useRef<{ deletion: Deletion; back: boolean; neighbour: HTMLElement | null; successToastId?: number } | null>(null);
  /** Review Fix 3 — the room below the builder for the toast exists only while a toast needs it: from the moment a deletion /
   *  restore reveals its target (the reveal needs that scroll range before the toast has rendered) until its toasts have left.
   *  A permanent reserve sits outside the sticky toolbar's containing block and pushed the stuck toolbar over «+ إضافة قسم» at the
   *  end of the scroll range (150–200 %, phones). The marker is an attribute on the scroller (structured-builder.css). */
  const reserveScroller = useRef<HTMLElement | null>(null);
  const reserveBand = (on: boolean) => {
    if (on) {
      const s = scrollerOf();
      if (s && s !== reserveScroller.current) reserveScroller.current?.removeAttribute("data-toast-reserve");
      reserveScroller.current = s;
      s?.setAttribute("data-toast-reserve", "");
    } else {
      reserveScroller.current?.removeAttribute("data-toast-reserve");
      reserveScroller.current = null;
    }
  };
  useEffect(() => () => { reserveScroller.current?.removeAttribute("data-toast-reserve"); reserveScroller.current = null; }, []);
  const deletionSeq = useRef(0);
  const deletionRecords = useRef(new Map<number, Deletion>());
  const [deletionCommit, setDeletionCommit] = useState(0);
  const restoreSeq = useRef(0);
  const restoreRecords = useRef(new Map<number, RestoreOutcome>());
  const [restoreCommit, setRestoreCommit] = useState<{ seq: number; deletion: Deletion; via: ToastDismissVia } | null>(null);
  const sectionNode = (sectionId: string) =>
    Array.from(builderRef.current?.querySelectorAll<HTMLElement>("[data-section-id]") ?? []).find(el => el.dataset.sectionId === sectionId) ?? null;
  const alignSection = (el: HTMLElement) => {
    el.style.scrollMarginBlockStart = toolbarClearance() + "px";
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start", behavior: scrollBehavior });
  };
  /** Focuses a section and scrolls its heading just below the sticky toolbar (whose height changes with the width). */
  const revealSection = (el: HTMLElement) => {
    el.focus({ preventScroll: true });
    alignSection(el);
  };
  /** Review Fix 1 — the heading row of `el` is on screen: at or below the sticky layers' bottom edge (toolbarBottom: the scroller's
   *  top where the toolbar is static, RF3 A-02), and clear of the bottom `bottomReserve` px (the band a toast covers while it is
   *  shown). When the toolbar and that band leave no usable strip between them, the transient band is ignored: no scroll could
   *  clear both. */
  const headingOnScreen = (el: HTMLElement, bottomReserve: number) => {
    const r = el.getBoundingClientRect();
    const top = toolbarBottom();
    const bottom = window.innerHeight - bottomReserve - top < 96 ? window.innerHeight : window.innerHeight - bottomReserve;
    return r.top >= top - 1 && r.top + Math.min(r.height, 48) <= bottom;
  };
  /** "reveal": scroll the target into view when its heading is hidden (keyboard users must see where focus went);
   *  "keep": focus only — a pointer dismissed the toast, and the page must not jump back to wherever the target is. */
  type FocusMode = "reveal" | "keep";
  const modeFor = (via: ToastDismissVia): FocusMode => (via === "pointer" ? "keep" : "reveal");
  /** Moves keyboard focus WITHOUT letting the browser pick a scroll position (a plain focus() could leave the heading under the
   *  sticky toolbar): the page stays where it is when the heading is already on screen; otherwise the element is revealed just
   *  below the toolbar with the same alignment a restored card / section uses (add buttons align like a section). */
  const focusInPlace = (el: HTMLElement, kind: "card" | "section" | "control", bottomReserve: number, mode: FocusMode = "reveal") => {
    el.focus({ preventScroll: true });
    if (mode === "keep" || headingOnScreen(el, bottomReserve)) return;
    // A section or an add button is aligned by its top just below the toolbar ("nearest" with margins can end-align it under the
    // toolbar when the toolbar leaves little room, e.g. at 200 %).
    if (kind === "card") alignCard(el, bottomReserve); else alignSection(el);
  };
  /** Where keyboard focus goes once the deleted card / section is gone: its next neighbour, else the previous one, else the add
   *  button («+ إضافة سؤال» of its section, else the section itself, else «+ إضافة قسم»). A candidate that cannot take focus now
   *  (an add button disabled while saving) is skipped for the next one (Review Fix 2); the last resort is the toolbar, which is
   *  never disabled — focus never falls to <body>. `bottomReserve` = the toast band when a toast is about to show. */
  const focusAfterDeletion = (d: Deletion, bottomReserve = 0, mode: FocusMode = "reveal"): boolean => {
    if (!alive.current) return false;
    const take = (el: HTMLElement | null | undefined, kind: "card" | "section" | "control", how: FocusMode = mode) => {
      if (!el || (el as HTMLButtonElement).disabled) return false;
      focusInPlace(el, kind, bottomReserve, how);
      return document.activeElement === el;
    };
    if (d.kind === "question") {
      const neighbour = [d.nextId, d.prevId].map(id => (id ? nodes.current.get(id) : undefined)).find(Boolean);
      if (take(neighbour, "card")) return true;
      const section = sectionNode(d.sectionId);
      if (take(section?.querySelector<HTMLElement>("[data-add-question]"), "control")) return true;
      if (take(section, "section")) return true;
    } else {
      const neighbour = [d.nextId, d.prevId].map(id => (id ? sectionNode(id) : null)).find(Boolean);
      if (take(neighbour, "section")) return true;
    }
    if (take(builderRef.current?.querySelector<HTMLElement>("[data-add-section]"), "control")) return true;
    return take(builderRef.current?.querySelector<HTMLElement>(".sb-toolbar"), "control", "keep");
  };
  /** A toast about `d` left while keyboard focus was inside it: focus the item when it is back (Ctrl+Z, «تراجع»), else the
   *  deletion's neighbour, else «+ إضافة قسم» — focus never falls to <body>. The page moves only for a keyboard dismissal whose
   *  target is hidden (Review Fix 2: a pointer closing the toast never scrolls the page back; a visible item never moves). */
  const focusItemOrNeighbour = (d: Deletion, bottomReserve = 0, mode: FocusMode = "reveal") => {
    if (!alive.current) return;
    const back = d.kind === "question" ? nodes.current.get(d.question.examQuestionId) : sectionNode(d.section.id);
    if (back) focusInPlace(back, d.kind === "question" ? "card" : "section", bottomReserve, mode);
    else focusAfterDeletion(d, bottomReserve, mode);
  };
  const focusLost = () => { const a = document.activeElement; return !a || a === document.body || !a.isConnected; };
  const deleteWithUndo = (capture: (prev: StructuredExam) => Deletion | null) => {
    if (!alive.current) return;
    const seq = ++deletionSeq.current;
    setDeletionCommit(seq);                                             // guarantees a builder commit after the updater ran
    update(prev => {
      const d = capture(prev);
      if (!d) return prev;
      deletionRecords.current.set(seq, d);
      return applyDeletion(prev, d);
    });
  };
  const restoreFromToast = (d: Deletion, via: ToastDismissVia = "keyboard") => {
    if (!alive.current) return;
    const seq = ++restoreSeq.current;
    setRestoreCommit({ seq, deletion: d, via });
    update(prev => {
      const r = restoreDeletion(prev, d);
      restoreRecords.current.set(seq, r.outcome);
      return r.exam;
    });
  };
  /** The names a toast shows / announces for `d`: the section's title (trimmed; «القسم N» when it has none) and the question's
   *  label. The SHOWN forms are shortened (toastTitle) and rendered in <bdi> inside «…» (a Latin title keeps its own direction, so
   *  the «…» stays at ITS end); the announced ones are complete plain text. */
  const toastNames = (d: Deletion) => {
    const sectionTitle = ((d.kind === "question" ? d.sectionTitle : d.section.title) || "").trim();
    return {
      sectionTitle, sectionName: sectionTitle || "القسم " + d.label, label: d.label, shownLabel: toastTitle(d.label, 24),
      shown: (t: string) => <>«<bdi>{toastTitle(t)}</bdi>»</>,
      spoken: (t: string) => "«" + t + "»",
    };
  };
  useLayoutEffect(() => {
    if (!deletionCommit) return;
    // Two deletions settled by ONE commit (not reachable by real input): the newest record is the one to offer «تراجع» for.
    const seqs = [...deletionRecords.current.keys()];
    const d = seqs.length ? deletionRecords.current.get(Math.max(...seqs)) : undefined;
    deletionRecords.current.clear();
    if (!d || !alive.current) return;
    reserveBand(true);                                                  // the reveal below already has the toast's room (RF3)
    focusAfterDeletion(d, TOAST_BAND);                                  // the toast below is about to cover the bottom band
    const n = toastNames(d);
    const count = d.kind === "section" ? (d.section.questions || []).length : 0;
    const tail = (count ? " مع " + questionCountPhrase(count) : "") + ".";
    const toastId = showToast({
      message: d.kind === "question"
        ? <>{"تم حذف السؤال " + n.shownLabel}{n.sectionTitle ? <>{" من "}{n.shown(n.sectionTitle)}</> : null}{tail}</>
        : <>{"تم حذف "}{n.shown(n.sectionName)}{tail}</>,
      announcement: (d.kind === "question" ? "تم حذف السؤال " + n.label + (n.sectionTitle ? " من " + n.spoken(n.sectionTitle) : "") : "تم حذف " + n.spoken(n.sectionName)) + tail + UNDO_HINT,
      action: { label: "تراجع", accessibleLabel: d.kind === "question" ? "تراجع عن حذف السؤال" : "تراجع عن حذف القسم", onAction: via => restoreFromToast(d, via) },
      onDismiss: (reason: ToastDismissReason, hadFocus: boolean, via: ToastDismissVia) => {
        if (undoTarget.current?.deletion === d) undoTarget.current = null;
        // A replacing toast (a newer deletion) or the restore that follows «تراجع» keeps the room; anything else releases it.
        if (reason !== "replaced" && reason !== "action") reserveBand(false);
        // "action" is settled by the restore below; "replaced" means a newer deletion already placed focus.
        if (hadFocus && reason !== "action" && reason !== "replaced") focusItemOrNeighbour(d, 0, modeFor(via));
      },
    });
    undoTarget.current = { deletion: d, toastId };
  }, [deletionCommit]);                                                 // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!restoreCommit) return;
    const { seq, deletion: d, via } = restoreCommit;
    const outcome = restoreRecords.current.get(seq);
    restoreRecords.current.delete(seq);
    if (!outcome || outcome === "stale" || !alive.current) { reserveBand(false); return; }
    reserveBand(true);
    if (outcome === "restored" || outcome === "already-present") {
      restoredTarget.current = { deletion: d, back: true, neighbour: null };
      if (d.kind === "question") window.setTimeout(() => focusCard(d.question.examQuestionId), 0);
      else window.setTimeout(() => { const el = sectionNode(d.section.id); if (el && alive.current) revealSection(el); }, 0);
      const n = toastNames(d);
      const successToastId = showToast({ tone: "success", durationMs: Math.min(undoToastMs, 4000),
        message: d.kind === "question" ? "تمت استعادة السؤال " + n.shownLabel + "." : <>{"تمت استعادة "}{n.shown(n.sectionName)}.</>,
        announcement: d.kind === "question" ? "تمت استعادة السؤال " + n.label + "." : "تمت استعادة " + n.spoken(n.sectionName) + ".",
        onDismiss: (reason, hadFocus, how) => {
          if (restoredTarget.current?.deletion === d) restoredTarget.current.successToastId = undefined;
          if (reason !== "replaced") reserveBand(false);
          if (hadFocus && reason !== "replaced") focusItemOrNeighbour(d, 0, modeFor(how));
        } });
      if (restoredTarget.current?.deletion === d) restoredTarget.current.successToastId = successToastId;
      return;
    }
    const n = toastNames(d);
    const fixed = outcome === "bank-duplicate" ? "تعذّرت الاستعادة: سؤال البنك نفسه موجود في الامتحان الآن." : "تعذّرت استعادة القسم: بعض أسئلته موجودة الآن في مكان آخر من الامتحان.";
    const message = outcome === "section-missing"
      ? <>{"تعذّرت استعادة السؤال: "}{n.sectionTitle ? <>{"القسم "}{n.shown(n.sectionTitle)}</> : "قسمه"}{" لم يعد موجودًا."}</>
      : fixed;
    const announcement = outcome === "section-missing" ? "تعذّرت استعادة السؤال: " + (n.sectionTitle ? "القسم " + n.spoken(n.sectionTitle) : "قسمه") + " لم يعد موجودًا." : fixed;
    if (focusLost()) focusItemOrNeighbour(d, TOAST_BAND, modeFor(via));  // «تراجع» was activated and its card is gone
    showToast({ tone: "warn", message, announcement, onDismiss: (why, hadFocus, how) => { if (why !== "replaced") reserveBand(false); if (hadFocus && why !== "replaced") focusItemOrNeighbour(d, 0, modeFor(how)); } });
  }, [restoreCommit]);                                                  // eslint-disable-line react-hooks/exhaustive-deps
  // The toast leaves by itself when the deleted item is back by another route (Ctrl+Z, the toolbar «تراجع») or another exam opened.
  useEffect(() => {
    const t = undoTarget.current;
    if (t && (t.deletion.examId !== exam.examId || deletionIsBack(exam, t.deletion))) {
      const isBack = t.deletion.examId === exam.examId;
      undoTarget.current = null;
      dismissToast(t.toastId);
      // Back by Ctrl+Z (inside or outside the toast) or the toolbar: remembered like a «تراجع», so the redo that removes it
      // again never leaves focus on <body> (Review Fix 3).
      if (isBack) restoredTarget.current = { deletion: t.deletion, back: true, neighbour: null };
    }
    // The restored item left (Ctrl+Z undid the restore while its card held focus) or came back (Ctrl+Y): focus its neighbour /
    // the item itself, in place — only when that presence CHANGED and focus was lost, never on an unrelated exam change.
    const r = restoredTarget.current;
    if (!r) return;
    if (r.deletion.examId !== exam.examId) { restoredTarget.current = null; return; }
    const back = deletionIsBack(exam, r.deletion);
    if (back === r.back) return;
    r.back = back;
    // The «تمت استعادة …» toast never outlives its item (Review Fix 3).
    if (!back && r.successToastId !== undefined) { const id = r.successToastId; r.successToastId = undefined; dismissToast(id); }
    // Focus moves only when it was LOST, or when it still sits on the neighbour this recovery itself chose (a redo then follows the
    // item back). Focus the teacher has put anywhere else — another card, a dialog, a toolbar button — is never taken, and the
    // page never scrolls for it (Review Fix 3: a later Ctrl+Y used to pull focus back and scroll thousands of px).
    const chosen = r.neighbour;
    r.neighbour = null;
    if (!focusLost() && !(chosen && document.activeElement === chosen)) return;
    focusItemOrNeighbour(r.deletion, 0, "reveal");
    if (!back && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) r.neighbour = document.activeElement;
  }, [exam, dismissToast]);                                              // eslint-disable-line react-hooks/exhaustive-deps
  const navJump = useRef(false);
  const navigateTo = (id: string) => {
    if (isNarrow) { navJump.current = true; setNavOpen(false); window.setTimeout(() => focusCard(id), 0); }   // let the dialog release focus first
    else focusCard(id);
  };
  // RF3 (owner-listed, 200 %) — the explorer's dialog (≤ 900 px) gives focus back to the control that opened it. When the window
  // narrows (zoom) while focus is inside the INLINE explorer, the explorer turns into the dialog and the focused control leaves the
  // page with the inline panel: the dialog's opener is <body>, and closing it (Escape, «إغلاق», the backdrop) left focus on <body>.
  // Focus then goes to «المزيد», the menu that holds the explorer's toggle (else the toolbar) — never <body>. A jump to a question
  // focuses its card instead (navigateTo).
  const navDialogOpen = navOpen && isNarrow;
  const navDialogWasOpen = useRef(navDialogOpen);
  useLayoutEffect(() => {
    const was = navDialogWasOpen.current, jump = navJump.current;
    navDialogWasOpen.current = navDialogOpen;
    navJump.current = false;
    if (!was || navDialogOpen || jump || !alive.current || !focusLost()) return;
    const toolbar = builderRef.current?.querySelector<HTMLElement>(".sb-toolbar");
    const more = Array.from(toolbar?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(b => b.getAttribute("aria-label") === MORE_MENU_LABEL && !b.disabled);
    (more ?? toolbar)?.focus();
  }, [navDialogOpen]);                                                   // eslint-disable-line react-hooks/exhaustive-deps

  // Bulk actions: each is ONE functional updater → ONE history step (a no-op result creates no entry).
  const bulkMove = (target: string) => { const ids = selectedIds(); if (ids.some(id => pendingMediaRef.current.has(id))) return; update(prev => ({ ...prev, sections: bulkMoveQuestions(prev.sections || [], ids, target) })); };
  const bulkDuplicate = () => { const ids = selectedIds(); if (ids.some(id => pendingMediaRef.current.has(id))) return; update(prev => ({ ...prev, sections: bulkDuplicateQuestions(prev.sections || [], ids) })); };
  const bulkMarks = (marks: number) => { const ids = selectedIds(); update(prev => ({ ...prev, sections: bulkSetMarks(prev.sections || [], ids, marks) })); };
  const bulkDelete = async () => {
    const ids = selectedIds();
    if (!ids.length) return;
    const ok = await confirm({ title: "حذف الأسئلة المحددة", message: "سيتم حذف " + ids.length + " أسئلة من الامتحان.", confirmLabel: "حذف", cancelLabel: "إلغاء", tone: "danger" });
    if (!ok || !alive.current || ids.some(id => pendingMediaRef.current.has(id))) return;
    update(prev => ({ ...prev, sections: bulkDeleteQuestions(prev.sections || [], ids) }));
  };

  // Question Bank picker: opened FOR one exam id (closes and resets when another exam opens — R1 / R2). The insertion is
  // re-validated against the LATEST exam (id + target section) both before and inside the single updater (R3).
  const [pickerOpenFor, setPickerOpenFor] = useState("");
  const pickerOpen = !!bankPicker && pickerOpenFor === exam.examId;
  // The exam authority read when a pending exact fetch resolves. It is refreshed in the COMMIT phase (layout effect), so it
  // can never lag one committed render behind: a passive useEffect runs in a later scheduler task, and a resolved fetch's
  // microtask could land in between — reading the previous exam, reporting "ok" for a target that is already gone (R3 race).
  const latestExamRef = useRef(exam);
  useLayoutEffect(() => { latestExamRef.current = exam; }, [exam]);
  const usedBankIds = useMemo(() => collectUsedBankIds(exam), [exam]);
  // Outcome contract for a bank batch. A batch the COMMITTED authority already rejects (wrong exam, missing target, an exact
  // bank id already in the exam) is refused synchronously and never dispatched. Otherwise ONE functional updater is
  // dispatched; it re-checks the same three invariants against the `prev` it actually receives (all-or-nothing, never a
  // partial or filtered batch) and records its decision for this batch number. The outcome promise is settled from a
  // COMMIT-phase effect after the render that processed the updater (the builder always commits then: its own batch state
  // changed in the same tick), so the picker can never be told "ok" for a batch the exam authority did not apply.
  const insertBatchSeq = useRef(0);
  const [insertBatch, setInsertBatch] = useState(0);
  const insertDecisions = useRef(new Map<number, InsertOutcome>());
  const insertWaiters = useRef(new Map<number, (outcome: InsertOutcome) => void>());
  useLayoutEffect(() => {
    if (!insertBatch) return;
    const settle = insertWaiters.current.get(insertBatch);
    if (!settle) return;
    insertWaiters.current.delete(insertBatch);
    const decision = insertDecisions.current.get(insertBatch);
    insertDecisions.current.delete(insertBatch);
    settle(decision ?? "stale");                                        // an updater that never ran is never a success
  }, [insertBatch]);
  const decideInsertion = (candidate: StructuredExam, openedFor: string, targetSectionId: string, bankIds: string[]): InsertOutcome => {
    if (candidate.examId !== openedFor) return "stale";
    if (!(candidate.sections || []).some(s => s.id === targetSectionId)) return "missing-target";
    if (hasAnyUsedBankQuestion(candidate, bankIds)) return "already-used";
    return "ok";
  };
  const insertBankQuestions = (openedFor: string) => (questions: BankExamQuestion[], targetSectionId: string, marks: number): InsertOutcome | Promise<InsertOutcome> => {
    if (!alive.current) return "stale";
    const bankIds = questions.map(q => String(q.bankQuestionId || ""));
    const verdict = decideInsertion(latestExamRef.current, openedFor, targetSectionId, bankIds);
    if (verdict !== "ok") return verdict;                              // committed authority already rejects: nothing dispatched
    const converted = questions.map(q => bankExamQuestionToBuilderQuestion(q, marks));
    const batch = ++insertBatchSeq.current;
    return new Promise<InsertOutcome>(settle => {
      insertWaiters.current.set(batch, settle);
      setInsertBatch(batch);                                           // guarantees a builder commit after the updater ran
      onChange(prev => {
        const decision = decideInsertion(prev, openedFor, targetSectionId, bankIds);
        insertDecisions.current.set(batch, decision);
        return decision === "ok" ? { ...prev, sections: insertQuestionsIntoSection(prev.sections || [], targetSectionId, converted) } : prev;
      });
    });
  };
  // Phase 19A — AI authoring: the dialog is opened FOR one exam id (like the bank picker). The verified draft is inserted as ONE
  // functional update with fresh ids, re-checked against the latest exam (same id, target section still present) both before and
  // inside the updater; anything else is "stale" and nothing is inserted.
  const [aiOpenFor, setAiOpenFor] = useState("");
  const aiOpen = !!aiAuthor && aiOpenFor === exam.examId;
  // Phase 19G — AI scenario authoring: the verified scenario + its questions are inserted as ONE functional update with fresh ids (questions,
  // scenario, sources; the membership remapped to the fresh question ids), re-checked against the latest exam exactly like a question.
  const [aiScenarioOpenFor, setAiScenarioOpenFor] = useState("");
  const aiScenarioOpen = !!aiAuthor?.authorScenario && aiScenarioOpenFor === exam.examId;
  const insertAiScenario = (openedFor: string) => (scenario: ScenarioV1, questions: BuilderQuestion[], targetSectionId: string): "ok" | "stale" => {
    if (!alive.current) return "stale";
    const fits = (candidate: StructuredExam) => candidate.examId === openedFor && (candidate.sections || []).some(sec => sec.id === targetSectionId);
    if (!fits(latestExamRef.current)) return "stale";
    const idMap = new Map<string, string>();
    const fresh = questions.map(q => { const c = cloneQuestionWithNewIds(q); idMap.set(q.examQuestionId, c.examQuestionId); return c; });
    const sc: ScenarioV1 = { ...scenario, id: genId("scn"), sources: scenario.sources.map(s => ({ ...s, id: genId("src") })), questionIds: scenario.questionIds.flatMap(id => (idMap.has(id) ? [idMap.get(id) as string] : [])) };
    onChange(prev => (fits(prev) ? { ...prev, sections: (prev.sections || []).map(sec => (sec.id === targetSectionId ? { ...sec, questions: [...(sec.questions || []), ...fresh], scenarios: [...(Array.isArray(sec.scenarios) ? sec.scenarios : []), sc] } : sec)) } : prev));
    if (fresh.length) window.setTimeout(() => focusCard(fresh[0].examQuestionId), 0);
    return "ok";
  };
  // Phase 20F — the AI Full Exam Composer: opened FOR one exam id; a staged result is applied as ONE functional update through `update`
  // (one undo step), refused ("stale") when this builder closed or the owner now holds another exam. The dialog re-checks the revision.
  const [composerOpenFor, setComposerOpenFor] = useState("");
  const composerOpen = !!aiAuthor?.composeExam && composerOpenFor === exam.examId;
  const applyComposer = (openedFor: string) => (updater: (prev: StructuredExam) => StructuredExam): "ok" | "stale" => {
    if (!alive.current || latestExamRef.current.examId !== openedFor) return "stale";
    update(prev => (prev.examId === openedFor ? updater(prev) : prev));
    return "ok";
  };
  const insertAiQuestion = (openedFor: string) => (question: BuilderQuestion, targetSectionId: string): "ok" | "stale" => {
    if (!alive.current) return "stale";
    const fits = (candidate: StructuredExam) => candidate.examId === openedFor && (candidate.sections || []).some(sec => sec.id === targetSectionId);
    if (!fits(latestExamRef.current)) return "stale";
    const fresh = cloneQuestionWithNewIds(question);
    onChange(prev => (fits(prev) ? { ...prev, sections: insertQuestionsIntoSection(prev.sections || [], targetSectionId, [fresh]) } : prev));
    window.setTimeout(() => focusCard(fresh.examQuestionId), 0);
    return "ok";
  };
  const navigator = (asPanel: boolean) => (
    <ExamQuestionNavigator id={asPanel ? navId : undefined} asPanel={asPanel} entries={navEntries} sections={sectionOptions} filters={navFilters}
      onFilters={f => setUi(prev => ({ ...prev, filters: f }))} selected={selected} onToggle={toggleSelect} onSelectMany={selectMany}
      onClearSelection={clearSelection} onNavigate={navigateTo} />
  );

  // ── Phase 13C-A · مخطط الامتحان: every blueprint edit is ONE functional updater (one history step). Opening the panel on
  //    an exam without a blueprint dispatches nothing; the first real edit creates the versioned blueprint.
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const editBlueprint = (fn: (bp: AssessmentBlueprintV1) => AssessmentBlueprintV1) => update(prev => withBlueprint(prev, fn));

  // ── Phase 13C-B · تحليل المخطط الحي + تصنيف المحدد + guided bank discovery ──
  // The analysis panel derives everything from the canonical `exam` prop (useMemo inside) — no cache, nothing persisted.
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [classifyOpen, setClassifyOpen] = useState(false);
  // Evidence → the EXISTING selection + navigator + card focus (no second navigation system).
  const revealQuestions = (ids: string[]) => {
    setCoverageOpen(false);
    setSelected(() => new Set(ids));
    if (!ids.length) return;
    if (!isNarrow) setNavOpen(true);
    window.setTimeout(() => focusCard(ids[0]), 0);                       // let the dialog release focus first
  };
  // Bulk classification: ONE functional updater over the ids selected NOW, applied to the `prev` the authority hands us
  // (a deleted id is simply absent — never resurrected); an unchanged result returns `prev` → no history entry, not dirty.
  const bulkClassify = (change: BulkClassification) => {
    const ids = selectedIds();
    setClassifyOpen(false);
    update(prev => { const next = applyBulkClassification(prev.sections || [], ids, change); return next === prev.sections ? prev : { ...prev, sections: next }; });
  };
  // Guided discovery: the picker opens with an EXACT prefilled filter; everything else about it (used ids locked, exact
  // duplicate refusal, latest-authority insertion, races) is the unchanged 13B picker.
  const [pickerFocus, setPickerFocus] = useState<BankPickerFocus | null>(null);
  const openBankWithFocus = (focus: BankPickerFocus) => { setCoverageOpen(false); setPickerFocus(focus); setPickerOpenFor(exam.examId); };
  const closePicker = () => { setPickerOpenFor(""); setPickerFocus(null); };
  const blueprintIssueCount = useMemo(() => (exam.blueprint ? validateBlueprintForExam(exam.blueprint, exam).length : 0), [exam]);   // R4: section refs checked against the real exam

  // ── Phase 13C-C · ONE canonical finalization decision (structural validity + quality gates), derived from the exam ──
  const decision = useMemo(() => evaluateExamFinalization(exam), [exam]);
  const errors = decision.structuralErrors;
  const warnings = decision.structuralWarnings;
  const hasPolicy = !!exam.blueprint?.qualityPolicy;
  const gateBlockers = decision.blockers.filter(b => b.kind !== "structural").length;
  const gateWarnings = decision.warnings.filter(w => w.kind === "quality").length;
  const [policyOpen, setPolicyOpen] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const editPolicy = (fn: Parameters<typeof withQualityPolicy>[1]) => update(prev => withBlueprint(prev, bp => withQualityPolicy(bp, fn)));
  // The FINAL action re-checks the LATEST committed exam (never a stale render or a re-enabled button): a refused request
  // opens the readiness panel instead of calling the owner. The owner (App) applies the same authority again on the exact
  // snapshot it persists (second-line guard).
  const requestFinalSave = () => {
    if (!onSave) return;
    const latest = evaluateExamFinalization(latestExamRef.current);
    if (!latest.canFinalize) { setReadinessOpen(true); return; }
    onSave("final");
  };
  const totalMarks = computeTotalMarks(exam);
  // Phase 21E.2 (B) — inside App's full-screen overlay (role="dialog", aria-modal, named by the toolbar heading) the builder is a
  // modal workspace: focus moves in when it opens and back to the opener when it closes, Tab wraps inside it, and Escape takes the
  // existing exit path, so the unsaved-changes guard still decides — except while a save is in flight, when Escape does nothing,
  // exactly like the disabled «رجوع». Any dialog, menu or toast layered above it keeps Escape and Tab for itself (useModalSurface
  // yields to them). Rendered on its own (no overlay) the builder is not modal: nothing happens.
  const surfaceRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => { surfaceRef.current = builderRef.current?.closest<HTMLElement>(".structured-builder-overlay") ?? null; }, []);
  useModalSurface(surfaceRef, true, () => { if (!saving) void requestExit(); }, returnFocusTo);
  // ── Phase 21E.2 (D) · inline issues: the SAME structural issues the summary lists and finalization uses, regrouped by where they
  // belong (indexIssues never re-validates, filters or re-ranks) — each question's in its card, each section's in its header, and
  // the exam-level rest in the summary only. ONE polite region announces settled count changes (never on opening the exam).
  const issueIndex = useMemo(() => {
    const sections = exam.sections || [];
    return indexIssues([...decision.structuralErrors, ...decision.structuralWarnings], {
      questionIds: new Set(sections.flatMap(s => (s.questions || []).map(q => q.examQuestionId))),
      sectionIds: new Set(sections.map(s => s.id)),
    });
  }, [decision, exam.sections]);
  const summaryTargets = useMemo(() => issueTargets(issueIndex, exam.sections || []), [issueIndex, exam.sections]);
  // Phase 21F.1 — the issue arrays handed to the memoized section editors / cards keep their identity while their content is the same
  // (derived from the previous render's arrays, adjusted during render like the selection state above).
  const [issueArrays, setIssueArrays] = useState<{ index: typeof issueIndex; value: StableIssues } | null>(null);
  const issuesStale = !issueArrays || issueArrays.index !== issueIndex;
  const stableIssues: StableIssues = issuesStale ? stabilizeIssues(issueArrays?.value ?? null, issueIndex, exam.sections || []) : issueArrays.value;
  if (issuesStale) setIssueArrays({ index: issueIndex, value: stableIssues });
  const issueAnnouncement = useIssueAnnouncer(errors.length, warnings.length, ISSUE_SETTLE_MS, exam.examId);   // K3 C-F5: per exam
  // Questions the teacher opened from the summary (UI state only — never exam data, history or autosave; reset for another exam):
  // their fields keep showing their errors (FieldRevealContext) until fixed; a new count re-opens a collapsed card.
  const [issueReveal, setIssueReveal] = useState<{ examId: string; seqs: ReadonlyMap<string, number> } | null>(null);
  let revealedQuestions = issueReveal?.examId === exam.examId ? issueReveal.seqs : EMPTY_REVEALS;
  // K3 C-F3 — "until fixed" is derived, never latched: a question leaves the reveal in the render where its last canonical ERROR goes
  // (no commit ever shows the stale reveal). A problem it gets LATER (a new empty row) is then shown by the field's own touched rule
  // (Field touchKey), like any other; another summary click reveals it again. RF2-3 — a warning it keeps (STIMULUS_MISSING: a stale
  // shared-stimulus reference) never holds the reveal: no field shows a warning, so it would only turn later rows red unvisited.
  const hasError = (id: string) => !!issueIndex.byQuestion.get(id)?.some(i => i.severity === "error");
  if ([...revealedQuestions.keys()].some(id => !hasError(id))) {
    revealedQuestions = new Map([...revealedQuestions].filter(([id]) => hasError(id)));
    setIssueReveal({ examId: exam.examId, seqs: revealedQuestions });
  }
  // Re-review RF2R-1 — opening a collapsed card is a separate, NEVER-pruned signal: a summary click on a warning-only question must
  // still open its card even though the field reveal above is pruned in the same render (opening and revealing are two jobs).
  const [openReq, setOpenReq] = useState<{ examId: string; seqs: ReadonlyMap<string, number> } | null>(null);
  const openRequests = openReq?.examId === exam.examId ? openReq.seqs : EMPTY_REVEALS;
  const revealCount = useRef(0);
  /** K3 A-F4 — the issue list a card / section shows itself (its direct child; a card's list is never a nested question's). */
  const ownIssueList = (host: Element | null | undefined) => (Array.from(host?.children ?? []).find(c => c.classList.contains("sb-inline-issues")) as HTMLElement | undefined) ?? null;
  /** RF3 I-2 — marks the element that holds focus now, when it is inside `host` (the card / section the entry opened), for
   *  builder-issues.css; it leaves with the focus. A marker whose element lost focus without a blur (disabled while a save runs) is
   *  cleared first, so it is never on two elements. */
  const markIssueFocus = (host: HTMLElement) => {
    builderRef.current?.querySelectorAll<HTMLElement>("[" + ISSUE_FOCUS + "]").forEach(n => n.removeAttribute(ISSUE_FOCUS));
    const a = document.activeElement;
    if (!(a instanceof HTMLElement) || !host.contains(a)) return;
    a.setAttribute(ISSUE_FOCUS, "");
    a.addEventListener("blur", clearIssueFocus, { once: true });
  };
  /** The question below the sticky toolbar, with the alignment every other jump uses (alignCard), and focus where the teacher fixes
   *  it. Never touches the selection or the navigator. K3 A-F6: the frame(s) showing the clicked issue (data-issue-codes) — RF2-1:
   *  the clicked INSTANCE of that code (data-issue-nth: e.g. its own incomplete pair), else any frame showing the code. RF2-2: in
   *  those frames, the invalid control, else the first enabled control («+ إضافة خيار» when a multiple-choice question has no
   *  options), else the card's NAMED issue list «مشكلات السؤال N» (A-F4) — never another field's error. Only an issue no frame
   *  shows takes the first field whose error is now shown, else the named list, else the card. RF3 I-1: an issue of a compound /
   *  composite PART (no frame shows it) takes that part's own control, else the named list — never another field of the card. */
  const focusQuestionIssues = (id: string, instance?: IssueInstance) => {
    const el = nodes.current.get(id);
    if (!el || !alive.current) return;
    let field: HTMLElement | null | undefined = null, shown: HTMLElement | null = null;
    if (instance?.part) {
      // RF3 I-1 / RR3-3 — an issue of a compound / composite PART (no Field frame shows it): the control of that part the issue is
      // about (partTarget: its named row, its rich content, its type, its answer body); never another field of the card, never a row
      // the issue does not name. A part that cannot be told apart ("ambiguous": two parts with the same label), a row that cannot be
      // located (a table / CLI cell) or a part with no such control leads to the card's named issue list below.
      const focus = instance.part === "ambiguous" ? null : instance.part;
      const part = focus ? partNode(el, focus.part) : null;
      const target = part && focus ? partTarget(part, focus) : null;
      field = target?.field;
      shown = target?.shown ?? null;
    } else {
      const coded = instance ? Array.from(el.querySelectorAll<HTMLElement>("[data-issue-codes]")).filter(f => (f.dataset.issueCodes || "").split(" ").includes(instance.code)) : [];
      const own = instance?.nth === undefined ? [] : coded.filter(f => Number(f.dataset.issueNth || 1) === instance.nth);
      const showing = own.length ? own : coded;
      field = showing.length
        ? showing.map(f => f.querySelector<HTMLElement>(INVALID_FIELD)).find(Boolean) ?? showing.map(f => f.querySelector<HTMLElement>(ENABLED_CONTROL)).find(Boolean)
        : el.querySelector<HTMLElement>(INVALID_FIELD);
      shown = field?.closest<HTMLElement>(".eb-field, .eb-field-group") ?? null;
    }
    if (field) {
      alignCard(shown ?? field);
      field.focus({ preventScroll: true });
    } else alignCard(el);
    if (!field || document.activeElement !== field) (ownIssueList(el) ?? el).focus({ preventScroll: true });
    markIssueFocus(el);
    setFlashId(id);
  };
  const openIssue = (target: IssueTarget, issue: StructuredIssue) => {
    if (!alive.current) return;
    // Phase 21F.3 — in the Studio an issue opens in the content step: its question becomes the ACTIVE card (its fields are mounted),
    // and a section issue shows on its section card. The rest is the same routing as the classic layout.
    if (studio && (studioUi.step !== "content" || (target.kind === "question" && studioUi.activeId !== target.id))) {
      setStudioUi(prev => ({ ...prev, step: "content", activeId: target.kind === "question" ? target.id : prev.activeId, sectionId: null }));
      window.setTimeout(() => openIssueRef.current?.(target, issue), 0);
      return;
    }
    if (target.kind === "section") {
      const el = sectionNode(target.id);
      if (!el) return;
      // K3 A-F4 — the section's NAMED issue list under its heading (the section itself has no name), the heading aligned as usual.
      const list = ownIssueList(Array.from(el.children).find(c => c.classList.contains("sb-section-head")));
      if (!list) { revealSection(el); markIssueFocus(el); return; }
      list.focus({ preventScroll: true });
      markIssueFocus(el);
      alignSection(el);
      return;
    }
    const examId = exam.examId, count = ++revealCount.current;
    // RF2-1 — the clicked instance of its code, counted (RF3 I-3) among the issues of the card the entry leads to; RF3 I-1 — the part
    // it belongs to, read against that card's question (the LAST one carrying the id, like the node map).
    const own = targetCardIssues(issue, issueIndex.byQuestion.get(target.id) ?? []);
    const question = (exam.sections || []).flatMap(s => s.questions || []).filter(q => q.examQuestionId === target.id).at(-1);
    const instance: IssueInstance = { code: issue.code, nth: own ? issueOccurrence(issue, own) : undefined, part: issuePartFocus(issue, question) };
    setIssueReveal(prev => ({ examId, seqs: new Map(prev?.examId === examId ? prev.seqs : EMPTY_REVEALS).set(target.id, count) }));
    setOpenReq(prev => ({ examId, seqs: new Map(prev?.examId === examId ? prev.seqs : EMPTY_REVEALS).set(target.id, count) }));
    window.setTimeout(() => focusQuestionIssues(target.id, instance), 0);   // after the revealed (and re-opened) card has rendered
  };
  const openIssueRef = useRef<typeof openIssue | null>(null);
  useLayoutEffect(() => { openIssueRef.current = openIssue; });
  // ── Phase 21F.3 · Studio: activation moves focus to the opened card (the control that opened it — a collapsed card, an outline
  //    row — may have left the page); the card is aligned in the canvas like every other reveal.
  const pendingActiveFocus = useRef<string | null>(null);
  const activate = (id: string | null) => {
    setStudioUi(prev => ({ ...prev, activeId: id, sectionId: id ? null : prev.sectionId }));
    pendingActiveFocus.current = id;
  };
  useLayoutEffect(() => {
    const id = pendingActiveFocus.current;
    if (!studio || !id || studioUi.activeId !== id) return;
    pendingActiveFocus.current = null;
    const el = nodes.current.get(id);
    if (!el || !alive.current) return;
    alignCard(el);
    el.focus({ preventScroll: true });
  }, [studio, studioUi.activeId]);                                       // eslint-disable-line react-hooks/exhaustive-deps
  // Phase 21F.1 — the implementation behind the stable `actions` (refreshed every commit, before any event can run it).
  const scoped = (scope: string) => scope === exam.examId && alive.current;
  useLayoutEffect(() => {
    actionImpl.current = {
      patchSection: (scope, sid, p) => { if (scoped(scope)) setSections(s => updateSection(s, sid, p)); },
      deleteSection: (scope, sid) => { if (scoped(scope)) deleteWithUndo(prev => captureSectionDeletion(prev, sid)); },
      moveSection: (scope, sid, d) => { if (scoped(scope)) setSections(s => moveSection(s, sid, d)); },
      addQuestion: (scope, sid, q) => { if (scoped(scope)) setSections(s => addQ(s, sid, q)); },
      changeQuestion: (scope, sid, qid, p) => { if (scoped(scope)) setSections(s => updQ(s, sid, qid, p)); },
      deleteQuestion: (scope, sid, qid) => { if (scoped(scope)) deleteWithUndo(prev => captureQuestionDeletion(prev, sid, qid)); },
      moveQuestion: (scope, sid, qid, d) => { if (scoped(scope)) setSections(s => movQ(s, sid, qid, d)); },
      duplicateQuestion: (scope, sid, qid) => { if (scoped(scope)) setSections(s => dupQ(s, sid, qid)); },
      moveQuestionToSection: (scope, sid, qid, to) => { if (scoped(scope)) setSections(s => movQTo(s, sid, qid, to)); },
      previewQuestion: (scope, sid, qid) => {
        if (!scoped(scope)) return;
        const section = (exam.sections || []).find(x => x.id === sid);
        const question = section?.questions.find(x => x.examQuestionId === qid);
        if (section && question) setPreview(singleQuestionExam(exam, section, question));
      },
      insertQuestion: (scope, sid, index, q) => { if (scoped(scope)) setSections(s => insertQuestionAt(s, sid, index, q)); },
      placeQuestion: (scope, from, qid, to, index) => { if (scoped(scope)) setSections(s => placeQuestionAt(s, from, qid, to, index)); },
      toggleSelect: (scope, qid) => { if (scoped(scope)) toggleSelect(qid); },
      mediaBusy: (qid, busy) => onMediaBusyChange(qid, busy),
      requestImage: q => (requestQuestionImage ? requestQuestionImage(q) : Promise.reject(new Error("no image service")))
    };
  });
  const gatesText = gateBlockers === 0 && gateWarnings === 0 ? "بوابات الجودة: لا توجد موانع" : "بوابات الجودة: " + gateBlockers + " حاجب • " + gateWarnings + " تنبيهات";
  // The toolbar's menus (21E.2), shared by the classic toolbar and the Studio's top bar — the same handlers either way.
  const addMenuItems: ToolbarItem[] = [
          ...(bankPicker ? [{ key: "bank", label: "إضافة من بنك الأسئلة", icon: <IconBank size={16} />, onSelect: () => { setPickerFocus(null); setPickerOpenFor(exam.examId); }, disabled: saving, dialog: true }] : []),
          ...(aiAuthor ? [{ key: "ai-question", label: "سؤال بالذكاء الاصطناعي", icon: <IconSparkles size={16} />, onSelect: () => setAiOpenFor(exam.examId), disabled: saving, dialog: true }] : []),
          ...(aiAuthor?.authorScenario ? [{ key: "ai-scenario", label: "سيناريو بالذكاء الاصطناعي", icon: <IconSparkles size={16} />, onSelect: () => setAiScenarioOpenFor(exam.examId), disabled: saving, dialog: true }] : []),
          ...(aiAuthor?.composeExam ? [{ key: "ai-composer", label: "المؤلف الذكي للامتحان", icon: <IconSparkles size={16} />, onSelect: () => setComposerOpenFor(exam.examId), disabled: saving, dialog: true }] : []),
        ];
  const toolMenuItems: ToolbarItem[] = [
          { key: "explorer", label: "مستكشف الأسئلة", icon: <IconCompass size={16} />, onSelect: () => setNavOpen(v => !v), pressed: navOpen },
          { key: "blueprint", label: "مخطط الامتحان", icon: <IconBuilder size={16} />, onSelect: () => setBlueprintOpen(true), dialog: true, badge: blueprintIssueCount > 0 ? <span className="sb-bp-badge" aria-label={blueprintIssueCount + " مشكلات في المخطط"}>{blueprintIssueCount}</span> : undefined },
          ...(exam.blueprint ? [{ key: "coverage", label: "تحليل المخطط", icon: <IconReports size={16} />, onSelect: () => setCoverageOpen(true), dialog: true }] : []),
          ...(exam.blueprint ? [{ key: "policy", label: "سياسات الجودة", icon: <IconCheck size={16} />, onSelect: () => setPolicyOpen(true), dialog: true }] : []),
          ...(hasPolicy ? [{ key: "readiness", label: "فحص الجاهزية للاعتماد", icon: <IconInfo size={16} />, onSelect: () => setReadinessOpen(true), dialog: true, badge: gateBlockers || gateWarnings ? gatesText : undefined }] : []),
          ...(governance ? [{ key: "governance", label: "إدارة النشر والإصدارات", icon: <IconHistory size={16} />, onSelect: () => setGovernanceOpen(true), dialog: true }] : []),
          ...(presets ? [{ key: "presets", label: "القوالب الأكاديمية", icon: <IconCopy size={16} />, onSelect: () => setPresetsOpen(true), dialog: true }] : []),
          { key: "studio", label: "العرض والتصميم", icon: <IconImage size={16} />, onSelect: () => setStudioOpen(true), disabled: saving, dialog: true },
          { key: "surface-lab", label: "مختبر الدوال 3D (تجريبي)", icon: <IconMaximize size={16} />, onSelect: () => setSurfaceLabOpen(true), dialog: true },
          ...(onLayoutChange ? [{ key: "layout", label: studio ? "العودة إلى الواجهة الكلاسيكية" : "تجربة استوديو الامتحان (جديد)", icon: <IconLayers size={16} />, onSelect: () => onLayoutChange(studio ? "classic" : "studio") }] : []),
        ];

  // Phase 21F.7 — a tool requested for this exam opens once, through its own menu item (same handler, gate and dialog).
  const runStartTool = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    runStartTool.current = () => {
      if (!startTool || startTool.examId !== exam.examId) return;
      [...addMenuItems, ...toolMenuItems].find(item => item.key === startTool.key && !item.disabled)?.onSelect();
      onStartToolConsumed?.();
    };
  });
  useEffect(() => { if (startTool && startTool.examId === exam.examId) runStartTool.current(); }, [startTool, exam.examId]);
  const openAssignments = async () => { if (onOpenAssignments && (await confirmLeaveUnsaved("المتابعة دون حفظ"))) onOpenAssignments(); };

  // The layers both layouts share: every dialog / panel the menus open, the student preview, the confirmations, the recovery offer
  // and the «تراجع» toast (21E.1 slice 2 — inside the builder's fixed overlay, above --eb-z-toast).
  const layers = (
    <>
      <Dialog open={navOpen && isNarrow} size="md" title="مستكشف الأسئلة" onClose={() => setNavOpen(false)} className="sb-navigator-dialog-shell">
        {navigator(false)}
      </Dialog>

      {blueprintOpen && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل مخطط الامتحان…</p>}>
          <BlueprintPanel open onClose={() => setBlueprintOpen(false)} blueprint={exam.blueprint} sections={sectionOptions} onEdit={editBlueprint} disabled={saving} />
        </Suspense>
      )}

      {aiOpen && aiAuthor && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل أداة الذكاء الاصطناعي…</p>}>
          <AiQuestionAuthorDialog key={exam.examId} open onClose={() => setAiOpenFor("")} service={aiAuthor} sections={sectionOptions} onInsert={insertAiQuestion(exam.examId)} disabled={saving} />
        </Suspense>
      )}
      {aiScenarioOpen && aiAuthor && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل أداة الذكاء الاصطناعي…</p>}>
          <AiScenarioAuthorDialog key={exam.examId} open onClose={() => setAiScenarioOpenFor("")} service={aiAuthor} sections={sectionOptions} onInsert={insertAiScenario(exam.examId)} disabled={saving} />
        </Suspense>
      )}

      {composerOpen && aiAuthor?.composeExam && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل المؤلف الذكي للامتحان…</p>}>
          <AiExamComposerDialog key={exam.examId} open onClose={() => setComposerOpenFor("")} transport={aiAuthor.composeExam} exam={exam} getLatestExam={() => latestExamRef.current}
            onApply={applyComposer(exam.examId)} onPreview={setPreview} onUndo={onUndo} selectedQuestionId={selected.size === 1 ? [...selected][0] : null} disabled={saving} />
        </Suspense>
      )}

      {pickerOpen && bankPicker && (
        <Suspense fallback={<p className="sb-hint sb-picker-loading" role="status">جارٍ تحميل أداة بنك الأسئلة…</p>}>
          <BankQuestionPicker key={exam.examId + "|" + focusKey(pickerFocus)} open onClose={closePicker} service={bankPicker} sections={sectionOptions}
            usedBankQuestionIds={usedBankIds} onInsert={insertBankQuestions(exam.examId)} focus={pickerFocus ?? undefined} />
        </Suspense>
      )}

      {coverageOpen && exam.blueprint && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل تحليل المخطط…</p>}>
          <BlueprintCoveragePanel open onClose={() => setCoverageOpen(false)} exam={exam} onReveal={revealQuestions} onFindInBank={bankPicker ? openBankWithFocus : undefined} bankScope={bankPicker?.scope} />
        </Suspense>
      )}
      {policyOpen && exam.blueprint && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل سياسات الجودة…</p>}>
          <QualityPolicyPanel open onClose={() => setPolicyOpen(false)} blueprint={exam.blueprint} sections={sectionOptions} onEdit={editPolicy} disabled={saving} />
        </Suspense>
      )}
      {presetsOpen && presets && (
        <Suspense fallback={null}>
          <PresetLibraryPanel open onClose={() => setPresetsOpen(false)} exam={exam} service={presets} getLatestExam={() => latestExamRef.current} onCreateExam={openExamFromPreset} />
        </Suspense>
      )}
      {studioOpen && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل استوديو العرض…</p>}>
          <PresentationStudio exam={exam} onChange={fn => update(prev => fn(prev) as StructuredExam)} onClose={() => setStudioOpen(false)} />
        </Suspense>
      )}
      {governanceOpen && governance && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل إدارة النشر…</p>}>
          <GovernancePanel open onClose={() => setGovernanceOpen(false)} exam={exam} service={governance} getLatestExam={() => latestExamRef.current} onReveal={ids => { setGovernanceOpen(false); revealQuestions(ids); }} onPreview={setPreview} />
        </Suspense>
      )}
      {readinessOpen && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل فحص الجاهزية…</p>}>
          <FinalizationPanel open onClose={() => setReadinessOpen(false)} decision={decision} onReveal={ids => { setReadinessOpen(false); revealQuestions(ids); }} />
        </Suspense>
      )}
      {classifyOpen && selected.size > 0 && (
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل أداة التصنيف…</p>}>
          <BulkClassifyDialog open onClose={() => setClassifyOpen(false)} blueprint={exam.blueprint} count={selected.size} onApply={bulkClassify} />
        </Suspense>
      )}

      {surfaceLabOpen && (
        <Suspense fallback={<p role="status" className="sb-hint">جارٍ تحميل مختبر 3D…</p>}>
          <Surface3DLab onClose={() => setSurfaceLabOpen(false)} />
        </Suspense>
      )}
      {preview && createPortal(<ExamPreview exam={preview} onClose={() => setPreview(null)} />, document.body)}
      {confirmDialog}
      <Dialog
        open={recoveryOffer !== null}
        size="sm"
        title="نسخة غير محفوظة"
        onClose={() => setRecoveryOffer(null)}
        hideClose
        className="sb-recovery-dialog"
        footer={
          <>
            <button type="button" className="eb-button" onClick={discardBackup}>تجاهل النسخة</button>
            <button type="button" className="eb-button is-primary" onClick={restoreBackup}>استرجاع النسخة</button>
          </>
        }
      >
        <p className="sb-recovery-body">
          تم العثور على نسخة غير محفوظة من هذا الامتحان.
          {recoveryOffer && <span className="sb-recovery-meta">آخر تعديل محلي: {formatBackupTime(recoveryOffer.savedAt)}</span>}
        </p>
      </Dialog>
      {/* 21E.1 slice 2 — the «تراجع» toast lives INSIDE the builder's fixed overlay (its layer is above --eb-z-toast). */}
      {toastRegion}
    </>
  );

  // Phase 21F.6 / 21F.7 — the Studio's setup, review and publish steps (filled by those phases; the content step is the workspace's).
  const studioStepViews: Partial<Record<StudioStepKey, ReactNode>> = {
    setup: (
      <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل الإعداد…</p>}>
        <StudioSetup exam={exam} onTitle={title => update(prev => ({ ...prev, title }))} tools={toolMenuItems} disabled={!!saving} onStep={step => setStudioUi(prev => ({ ...prev, step }))}
          coverEditor={<ExamCoverEditor cover={exam.coverPage} onChange={cover => update(prev => ({ ...prev, coverPage: cover }))} onPreviewCover={() => setPreview(exam)} disabled={saving} />} />
      </Suspense>
    ),
    publish: (
      <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل النشر…</p>}>
        <StudioPublish exam={exam} decision={decision} saveState={saveState} saving={!!saving} mediaPending={mediaPending} mediaWait={MEDIA_WAIT}
          onSaveDraft={onSave ? () => onSave("draft") : undefined} onFinalize={onSave ? requestFinalSave : undefined} onAssign={onOpenAssignments ? () => { void openAssignments(); } : undefined}
          tools={toolMenuItems} onStep={step => setStudioUi(prev => ({ ...prev, step }))} />
      </Suspense>
    ),
    review: (
      <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل المراجعة…</p>}>
        <StudioReview exam={exam} decision={decision} issuesOfQuestion={stableIssues.byQuestion} targets={summaryTargets} tools={toolMenuItems}
          onOpenIssue={openIssue} onPreview={() => setPreview(exam)} onStep={step => setStudioUi(prev => ({ ...prev, step }))} />
      </Suspense>
    )
  };
  if (studio) {
    const addSectionNow = () => setSections(s => addSection(s, newSection({ title: "القسم " + ((exam.sections || []).length + 1) })));
    return (
      <SimulationServiceContext.Provider value={simulations}><MeshAssetServiceContext.Provider value={meshAssets}>
      <div className="sb-builder st-studio" dir="rtl" ref={builderRef}>
        <Suspense fallback={<p className="sb-hint" role="status">جارٍ تحميل استوديو الامتحان…</p>}>
          <StudioWorkspace
            exam={exam}
            headingId={BUILDER_TITLE_ID}
            heading={"استوديو الامتحان: " + (exam.title?.trim() || "امتحان بلا عنوان")}
            scope={exam.examId}
            actions={actions}
            saving={!!saving}
            saveState={saveState}
            mediaPending={mediaPending}
            mediaWait={MEDIA_WAIT}
            pendingMediaIds={pendingMediaIds}
            notice={notice}
            error={error}
            onExit={onExit ? () => { void requestExit(); } : undefined}
            onTitle={title => update(prev => ({ ...prev, title }))}
            history={onUndo || onRedo ? { onUndo, onRedo, canUndo: !!canUndo, canRedo: !!canRedo } : undefined}
            onSaveDraft={onSave ? () => onSave("draft") : undefined}
            onFinalize={onSave ? requestFinalSave : undefined}
            finalizeBlocked={!decision.canFinalize}
            decision={decision}
            addItems={addMenuItems}
            toolItems={toolMenuItems.filter(item => item.key !== "explorer")}
            onPreview={() => setPreview(exam)}
            step={studioUi.step}
            onStep={step => setStudioUi(prev => ({ ...prev, step }))}
            activeId={studioUi.activeId}
            onActivate={activate}
            inspectorSectionId={studioUi.sectionId}
            onOpenSection={sectionId => setStudioUi(prev => ({ ...prev, sectionId }))}
            inspectorTab={studioUi.tab}
            onInspectorTab={tab => setStudioUi(prev => ({ ...prev, tab }))}
            selectedIds={selected}
            flashId={flashId}
            issuesOfSection={stableIssues.bySection}
            issuesOfQuestion={stableIssues.byQuestion}
            questionIssuesOfSection={stableIssues.questionsOfSection}
            revealedQuestions={revealedQuestions}
            requestQuestionImage={requestQuestionImage ? stableRequestImage : undefined}
            onAddSection={addSectionNow}
            bulkBar={selected.size > 0 ? (
              <BulkActionBar count={selected.size} sections={sectionOptions} mediaPending={selectedMediaPending} disabled={saving}
                onMove={bulkMove} onDuplicate={bulkDuplicate} onSetMarks={bulkMarks} onDelete={() => { void bulkDelete(); }} onClear={clearSelection}
                onClassify={() => setClassifyOpen(true)} />
            ) : undefined}
            stepViews={studioStepViews}
          />
        </Suspense>
        {/* Phase 21E.2 (D) — always mounted, so assistive technology registers it before its first update. */}
        <p className="eb-visually-hidden" role="status" aria-live="polite" data-issue-live>{issueAnnouncement}</p>
        {layers}
      </div>
      </MeshAssetServiceContext.Provider></SimulationServiceContext.Provider>
    );
  }

  return (
    <SimulationServiceContext.Provider value={simulations}><MeshAssetServiceContext.Provider value={meshAssets}>
    <div className="sb-builder" dir="rtl" ref={builderRef}>
      {/* Phase 21E.2 (21E.0 audit T-2 / F1) — at most eight visible actions: «رجوع» · تراجع / إعادة · «إضافة أسئلة» (menu) ·
          «معاينة الامتحان» · «المزيد» (menu) · save draft · finalize. Every other tool is the same handler inside a menu; the gates
          and blueprint counts stay visible as status. The toolbar is sticky only where there is room for it (builder-toolbar.css). */}
      <BuilderToolbar
        headingId={BUILDER_TITLE_ID}
        heading={"باني الامتحان المنظّم: " + (exam.title?.trim() || "امتحان بلا عنوان")}
        onExit={onExit ? () => { void requestExit(); } : undefined}
        exitDisabled={saving}
        history={onUndo || onRedo ? { onUndo, onRedo, canUndo: !!canUndo, canRedo: !!canRedo, disabled: !!saving } : undefined}
        titleField={<input className="sb-input sb-exam-title" value={exam.title ?? ""} placeholder="عنوان الامتحان المنظّم" aria-label="عنوان الامتحان" onChange={e => { const title = e.target.value; update(prev => ({ ...prev, title })); }} disabled={saving} />}
        stats={<>
          <span className="sb-stat">{(exam.sections || []).length} أقسام</span>
          <span className="sb-stat">{countQuestions(exam)} أسئلة</span>
          <span className="sb-stat">{totalMarks} علامة</span>
        </>}
        status={<>
          {/* RF3 I-4 — the ONE region that announces the save state: one whole sentence per change (aria-atomic), never the glyph; the
              draft button's «جارٍ الحفظ…» is its label, not an announcement. */}
          {saveState && <span className={"sb-stat sb-save-state is-" + saveState} role="status" aria-live="polite" aria-atomic="true"><span aria-hidden="true">{SAVE_STATE_GLYPH[saveState]}</span> {SAVE_STATE_LABELS[saveState]}</span>}
          {exam.status === "final" && <span className="sb-stat sb-stat-final">معتمد نهائيًا</span>}
          {onSave && mediaPending && <span className="sb-stat sb-media-wait" role="status">{MEDIA_WAIT}</span>}
          {hasPolicy && <span className={"sb-stat sb-gates-chip" + (gateBlockers ? " has-blockers" : gateWarnings ? " has-warnings" : "")}>{gatesText}</span>}
        </>}
        addItems={addMenuItems}
        preview={{ key: "preview", label: "معاينة الامتحان", onSelect: () => setPreview(exam) }}
        moreItems={toolMenuItems}
        save={onSave ? <>
          <button type="button" className="sb-tb-btn sb-tb-keep-label" onClick={() => onSave("draft")} disabled={saving || mediaPending} title={mediaPending ? MEDIA_WAIT : undefined}><IconSave size={18} aria-hidden="true" /><span className="sb-tb-label">{saving ? SAVE_LABELS.saving : SAVE_LABELS.saveDraft}</span></button>
          {/* Structural errors keep the pre-13C-C HTML `disabled`. Quality-gate blockers use aria-disabled so the button stays
              reachable and its click EXPLAINS the refusal (readiness panel) — the handler re-checks the latest exam either way. */}
          <button type="button" className={"sb-tb-btn sb-tb-keep-label is-primary" + (!decision.canFinalize ? " is-gated" : "")} onClick={requestFinalSave} disabled={saving || mediaPending || hasBlockingErrors(errors)} aria-disabled={!decision.canFinalize || undefined} title={mediaPending ? MEDIA_WAIT : hasBlockingErrors(errors) ? "يجب إصلاح الأخطاء قبل الاعتماد النهائي" : !decision.canFinalize ? "بوابات الجودة تمنع الاعتماد النهائي حاليًا — اضغط لعرض التفاصيل" : "اعتماد الامتحان نهائيًا"}><IconCheck size={18} aria-hidden="true" /><span className="sb-tb-label">{SAVE_LABELS.finalizeExam}</span></button>
        </> : undefined}
      />

      {error && <div className="sb-banner sb-banner-error">{error}</div>}
      {notice && <div className="sb-banner sb-banner-ok">{notice}</div>}

      {/* Phase 21E.2 (D) — always mounted, so assistive technology registers it before its first update. */}
      <p className="eb-visually-hidden" role="status" aria-live="polite" data-issue-live>{issueAnnouncement}</p>
      {(errors.length > 0 || warnings.length > 0) && (
        <div className={"sb-issues sb-issues-summary " + (errors.length ? "sb-issues-error" : "sb-issues-warn")}>
          <button type="button" className="sb-issues-head" aria-expanded={showIssues} onClick={() => setShowIssues(v => !v)}>
            {/* K3 (A-F7) — aria-expanded carries the state; the chevron (aria-hidden) points down when open, to the inline end when closed. */}
            <IconChevronDown size={14} className={"eb-disclosure-chevron sb-issues-chevron" + (showIssues ? " is-open" : "")} aria-hidden="true" />{errors.length > 0 ? errors.length + " خطأ" : ""}{errors.length && warnings.length ? " • " : ""}{warnings.length > 0 ? warnings.length + " تنبيه" : ""}
            {hasBlockingErrors(errors) && <em className="sb-issues-block"> — يجب إصلاح الأخطاء قبل الحفظ النهائي</em>}
          </button>
          {showIssues && (
            <ul className="sb-issues-list">
              {/* An issue that belongs to a question / section opens it; an exam-level issue stays plain text. The severity is text
                  («خطأ:» / «تنبيه:», as in the inline lists), never colour or an emoji alone. */}
              {[...errors, ...warnings].map((iss: StructuredIssue) => {
                const target = summaryTargets.get(iss);
                const what = <><span className="sb-issue-kind">{iss.severity === "error" ? "خطأ:" : "تنبيه:"}</span> <span className="sb-issue-text">{iss.message}</span></>;
                return (
                  <li key={iss.id} className={iss.severity === "error" ? "sb-issue-error" : "sb-issue-warn"}>
                    {target ? <button type="button" className="sb-issue-link" onClick={() => openIssue(target, iss)}>{what}{" — "}<span className="sb-issue-target">{target.label}</span></button> : what}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className={"sb-workspace" + (navOpen && !isNarrow ? " has-navigator" : "")}>
      <div className="sb-workspace-main">
      <ExamCoverEditor
        cover={exam.coverPage}
        onChange={cover => update(prev => ({ ...prev, coverPage: cover }))}
        onPreviewCover={() => setPreview(exam)}
        disabled={saving}
      />

      {selected.size > 0 && (
        <BulkActionBar count={selected.size} sections={sectionOptions} mediaPending={selectedMediaPending} disabled={saving}
          onMove={bulkMove} onDuplicate={bulkDuplicate} onSetMarks={bulkMarks} onDelete={() => { void bulkDelete(); }} onClear={clearSelection}
          onClassify={() => setClassifyOpen(true)} />
      )}

      <div className="sb-sections">
        {(exam.sections || []).map((section, index) => (
          <ExamSectionEditor
            key={section.id}
            actions={actions}
            scopeKey={exam.examId}
            section={section}
            index={index}
            total={(exam.sections || []).length}
            sectionOptions={sectionOptions}
            requestQuestionImage={requestQuestionImage ? stableRequestImage : undefined}
            pendingMediaIds={pendingMediaIds}
            disabled={saving}
            selectedIds={selected}
            flashQuestionId={flashId || undefined}
            blueprint={exam.blueprint}
            sectionIssues={stableIssues.bySection.get(section.id)}
            questionIssues={stableIssues.questionsOfSection.get(section.id)}
            revealedQuestions={revealedQuestions}
            openRequests={openRequests}
          />
        ))}
      </div>

      <button type="button" className="sb-add-btn sb-add-section" data-add-section onClick={() => setSections(s => addSection(s, newSection({ title: "القسم " + ((exam.sections || []).length + 1) })))} disabled={saving}>+ إضافة قسم</button>
      </div>
      {navOpen && !isNarrow && navigator(true)}
      </div>

      {layers}
    </div>
    </MeshAssetServiceContext.Provider></SimulationServiceContext.Provider>
  );
}

// A one-section exam wrapping a single question for the per-question "student preview".
function singleQuestionExam(exam: StructuredExam, section: BuilderSection, q: BuilderQuestion): StructuredExam {
  return { ...exam, sections: [{ ...section, questions: [q] }] };
}

