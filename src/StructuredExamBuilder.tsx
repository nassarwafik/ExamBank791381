
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import type { ExamSaveState } from "./examHistory";
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
import "./structured-builder.css";

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
  onChange: (updater: StructuredExamUpdater) => void;
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
};

const AUTOSAVE_DELAY_MS = 800;
const SAVE_STATE_LABEL: Record<ExamSaveState, string> = { saved: "✓ محفوظ", dirty: "● تغييرات غير محفوظة", saving: "⏳ جارٍ الحفظ", recovered: "↺ نسخة مسترجعة — غير محفوظة" };
const EMPTY_IDS: ReadonlySet<string> = new Set<string>();
const FLASH_MS = 1200;
const UNDO_TOAST_MS = 10000;
/** Height of the band a toast covers at the bottom of the builder — keep in sync with structured-builder.css
 *  (`.structured-builder-overlay:has(.eb-toast)` reserves 16 px × 2 + 96 px). */
const TOAST_BAND = 128;
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
 *  undoes it; the toast's own «تراجع» is the LAST Tab stop of the builder (the toast sits at its end), and the toolbar «تراجع»
 *  is near its start. */
const UNDO_HINT = " للتراجع اضغط Ctrl+Z (أو ⌘Z) أو استخدم زر «تراجع».";
// UI-only productivity state (selection ids + navigator filters). Keyed by exam id so it is RESET when another exam opens,
// and pruned against the live exam so a deleted / undone question never lingers (and is never resurrected by redo).
type ProductivityUi = { examId: string; ids: ReadonlySet<string>; filters: NavigatorFilters };
const formatBackupTime = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : ""; };

export default function StructuredExamBuilder({ exam, onChange, onSave, onExit, saving, notice, error, requestQuestionImage, onUndo, onRedo, canUndo = false, canRedo = false, saveState, recoveryScope, onRecover, backupStorage, autosaveDelayMs = AUTOSAVE_DELAY_MS, undoToastMs = UNDO_TOAST_MS, bankPicker, governance, presets, onOpenExamFromPreset, simulations, meshAssets, aiAuthor }: Props) {
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
  const update = (fn: StructuredExamUpdater) => {
    if (!alive.current) return;
    onChange(prev => (prev.examId === sourceExamId ? fn(prev) : prev));
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
  const sectionOptions = (exam.sections || []).map(s => ({ id: s.id, title: s.title }));

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
  const registerQuestionNode = (id: string, el: HTMLDivElement | null) => { if (el) nodes.current.set(id, el); else nodes.current.delete(id); };
  const [flashId, setFlashId] = useState("");
  useEffect(() => {
    if (!flashId) return;
    const t = window.setTimeout(() => setFlashId(""), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [flashId]);
  const reducedMotion = usePrefersReducedMotion();
  const scrollBehavior: ScrollBehavior = reducedMotion ? "auto" : "smooth";
  const builderRef = useRef<HTMLDivElement | null>(null);
  /** Bottom edge of the sticky toolbar on screen (0 without one). */
  const toolbarBottom = () => builderRef.current?.querySelector<HTMLElement>(".sb-toolbar")?.getBoundingClientRect().bottom ?? 0;
  /** Space a revealed element keeps clear at the top of the builder's scroller: down to the sticky toolbar's bottom edge (the
   *  scroller's padding puts the stuck toolbar below its top, so its height alone falls short) plus 12 px. At the end of the scroll
   *  range the room reserved below the builder pushes the stuck toolbar up; a reveal scrolls it back to its resting place (the
   *  scroller's top padding + its own height), so the clearance is never measured below that (Review Fix 2). */
  const toolbarClearance = () => {
    const bar = builderRef.current?.querySelector<HTMLElement>(".sb-toolbar");
    if (!bar) return 12;
    const scroller = builderRef.current?.closest<HTMLElement>(".structured-builder-overlay") ?? null;
    const scrollerTop = scroller?.getBoundingClientRect().top ?? 0;
    const style = scroller ? getComputedStyle(scroller) : null;
    const padding = style ? parseFloat(style.paddingBlockStart) || parseFloat(style.paddingTop) || 0 : 0;
    const r = bar.getBoundingClientRect();
    return Math.round(Math.max(0, r.bottom - scrollerTop, padding + r.height) + 12);
  };
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
      const s = builderRef.current?.closest<HTMLElement>(".structured-builder-overlay") ?? null;
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
  /** Review Fix 1 — the heading row of `el` is on screen: at or below the sticky toolbar's bottom edge, and clear of the bottom
   *  `bottomReserve` px (the band a toast covers while it is shown). When the toolbar and that band leave no usable strip between
   *  them (the tall toolbar on phones / at 200 %, 21E.2), the transient band is ignored: no scroll could clear both. */
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
  const navigateTo = (id: string) => {
    if (isNarrow) { setNavOpen(false); window.setTimeout(() => focusCard(id), 0); }      // let the dialog release focus first
    else focusCard(id);
  };

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

  return (
    <SimulationServiceContext.Provider value={simulations}><MeshAssetServiceContext.Provider value={meshAssets}>
    <div className="sb-builder" dir="rtl" ref={builderRef}>
      <header className="sb-toolbar" tabIndex={-1}>
        <div className="sb-toolbar-main">
          {onExit && <button type="button" className="sb-btn" onClick={() => { void requestExit(); }} disabled={saving}>→ رجوع</button>}
          {(onUndo || onRedo) && (
            <span className="sb-history" role="group" aria-label="سجل التعديلات">
              <button type="button" className="sb-btn" onClick={onUndo} disabled={!canUndo || saving} title="تراجع (Ctrl+Z)" aria-label="تراجع">↶ <span className="sb-btn-label">تراجع</span></button>
              <button type="button" className="sb-btn" onClick={onRedo} disabled={!canRedo || saving} title="إعادة (Ctrl+Y أو Ctrl+Shift+Z)" aria-label="إعادة">↷ <span className="sb-btn-label">إعادة</span></button>
            </span>
          )}
          <input className="sb-input sb-exam-title" value={exam.title ?? ""} placeholder="عنوان الامتحان المنظّم" onChange={e => { const title = e.target.value; update(prev => ({ ...prev, title })); }} disabled={saving} />
          <span className="sb-stat">{(exam.sections || []).length} أقسام</span>
          <span className="sb-stat">{countQuestions(exam)} أسئلة</span>
          <span className="sb-stat">{totalMarks} علامة</span>
        </div>
        <div className="sb-toolbar-actions">
          {saveState && <span className={"sb-stat sb-save-state is-" + saveState} role="status" aria-live="polite">{SAVE_STATE_LABEL[saveState]}</span>}
          {exam.status === "final" && <span className="sb-stat sb-stat-final">معتمد نهائيًا</span>}
          <button type="button" className={"sb-btn" + (navOpen ? " is-active" : "")} onClick={() => setNavOpen(v => !v)} aria-pressed={navOpen} aria-controls={navOpen && !isNarrow ? navId : undefined} title="مستكشف الأسئلة">🧭 <span className="sb-btn-label">مستكشف الأسئلة</span></button>
          {bankPicker && <button type="button" className="sb-btn" onClick={() => { setPickerFocus(null); setPickerOpenFor(exam.examId); }} disabled={saving}>📚 إضافة من بنك الأسئلة</button>}
          {aiAuthor && <button type="button" className="sb-btn" onClick={() => setAiOpenFor(exam.examId)} disabled={saving} aria-haspopup="dialog">✨ سؤال بالذكاء الاصطناعي</button>}
          {aiAuthor?.authorScenario && <button type="button" className="sb-btn" onClick={() => setAiScenarioOpenFor(exam.examId)} disabled={saving} aria-haspopup="dialog">✨ سيناريو بالذكاء الاصطناعي</button>}
          {aiAuthor?.composeExam && <button type="button" className="sb-btn" onClick={() => setComposerOpenFor(exam.examId)} disabled={saving} aria-haspopup="dialog">🧠 المؤلف الذكي للامتحان</button>}
          {exam.blueprint && <button type="button" className={"sb-btn" + (coverageOpen ? " is-active" : "")} onClick={() => setCoverageOpen(true)} aria-haspopup="dialog" title="تحليل المخطط">📊 <span className="sb-btn-label">تحليل المخطط</span></button>}
          {exam.blueprint && <button type="button" className={"sb-btn" + (policyOpen ? " is-active" : "")} onClick={() => setPolicyOpen(true)} aria-haspopup="dialog" title="سياسات الجودة">🛡 <span className="sb-btn-label">سياسات الجودة</span></button>}
          {governance && <button type="button" className={"sb-btn" + (governanceOpen ? " is-active" : "")} onClick={() => setGovernanceOpen(true)} aria-haspopup="dialog" title="إدارة النشر والإصدارات">🗂 <span className="sb-btn-label">إدارة النشر والإصدارات</span></button>}
          {presets && <button type="button" className={"sb-btn" + (presetsOpen ? " is-active" : "")} onClick={() => setPresetsOpen(true)} aria-haspopup="dialog" title="القوالب الأكاديمية">📋 <span className="sb-btn-label">القوالب الأكاديمية</span></button>}
          <button type="button" className={"sb-btn" + (blueprintOpen ? " is-active" : "")} onClick={() => setBlueprintOpen(true)} aria-haspopup="dialog" title="مخطط الامتحان">📐 <span className="sb-btn-label">مخطط الامتحان</span>{blueprintIssueCount > 0 && <span className="sb-bp-badge" aria-label={blueprintIssueCount + " مشكلات في المخطط"}>{blueprintIssueCount}</span>}</button>
          <button type="button" className={"sb-btn" + (studioOpen ? " is-active" : "")} onClick={() => setStudioOpen(true)} disabled={saving} aria-haspopup="dialog" title="العرض والتصميم">🎨 <span className="sb-btn-label">العرض والتصميم</span></button>
          <button type="button" className="sb-btn" onClick={() => setSurfaceLabOpen(true)} aria-haspopup="dialog">🧮 مختبر الدوال 3D (تجريبي)</button>
          <button type="button" className="sb-btn" onClick={() => setPreview(exam)}>👁 معاينة الامتحان</button>
          {onSave && mediaPending && <span className="sb-stat sb-media-wait" role="status">{MEDIA_WAIT}</span>}
          {onSave && <button type="button" className="sb-btn" onClick={() => onSave("draft")} disabled={saving || mediaPending} title={mediaPending ? MEDIA_WAIT : undefined}>{saving ? "⏳ جارٍ الحفظ…" : "💾 حفظ مسودة"}</button>}
          {/* Structural errors keep the pre-13C-C HTML `disabled`. Quality-gate blockers use aria-disabled so the button stays
              reachable and its click EXPLAINS the refusal (readiness panel) — the handler re-checks the latest exam either way. */}
          {onSave && <button type="button" className={"sb-btn sb-btn-primary" + (!decision.canFinalize ? " is-gated" : "")} onClick={requestFinalSave} disabled={saving || mediaPending || hasBlockingErrors(errors)} aria-disabled={!decision.canFinalize || undefined} title={mediaPending ? MEDIA_WAIT : hasBlockingErrors(errors) ? "يجب إصلاح الأخطاء قبل الاعتماد النهائي" : !decision.canFinalize ? "بوابات الجودة تمنع الاعتماد النهائي حاليًا — اضغط لعرض التفاصيل" : "اعتماد الامتحان نهائيًا"}>✓ اعتماد نهائي</button>}
          {hasPolicy && <button type="button" className={"sb-btn sb-gates-status" + (gateBlockers ? " has-blockers" : gateWarnings ? " has-warnings" : "")} onClick={() => setReadinessOpen(true)} aria-haspopup="dialog" title="فحص الجاهزية للاعتماد">
            {gateBlockers === 0 && gateWarnings === 0 ? "بوابات الجودة: لا توجد موانع" : "بوابات الجودة: " + gateBlockers + " حاجب • " + gateWarnings + " تنبيهات"}
          </button>}
        </div>
      </header>

      {error && <div className="sb-banner sb-banner-error">{error}</div>}
      {notice && <div className="sb-banner sb-banner-ok">{notice}</div>}

      {(errors.length > 0 || warnings.length > 0) && (
        <div className={"sb-issues " + (errors.length ? "sb-issues-error" : "sb-issues-warn")}>
          <button type="button" className="sb-issues-head" onClick={() => setShowIssues(v => !v)}>
            {showIssues ? "▾" : "▸"} {errors.length > 0 ? errors.length + " خطأ" : ""}{errors.length && warnings.length ? " • " : ""}{warnings.length > 0 ? warnings.length + " تنبيه" : ""}
            {hasBlockingErrors(errors) && <em className="sb-issues-block"> — يجب إصلاح الأخطاء قبل الحفظ النهائي</em>}
          </button>
          {showIssues && (
            <ul className="sb-issues-list">
              {[...errors, ...warnings].map((iss: StructuredIssue) => (
                <li key={iss.id} className={iss.severity === "error" ? "sb-issue-error" : "sb-issue-warn"}>{iss.severity === "error" ? "⛔" : "⚠️"} {iss.message}</li>
              ))}
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
            section={section}
            index={index}
            total={(exam.sections || []).length}
            sectionOptions={sectionOptions}
            patch={p => setSections(s => updateSection(s, section.id, p))}
            onDelete={() => deleteWithUndo(prev => captureSectionDeletion(prev, section.id))}
            onMove={d => setSections(s => moveSection(s, section.id, d))}
            onAddQuestion={q => setSections(s => addQ(s, section.id, q))}
            onQuestionChange={(qid, p) => setSections(s => updQ(s, section.id, qid, p))}
            onQuestionDelete={qid => deleteWithUndo(prev => captureQuestionDeletion(prev, section.id, qid))}
            onQuestionMove={(qid, d) => setSections(s => movQ(s, section.id, qid, d))}
            onQuestionDuplicate={qid => setSections(s => dupQ(s, section.id, qid))}
            onQuestionMoveToSection={(qid, to) => setSections(s => movQTo(s, section.id, qid, to))}
            onPreviewQuestion={q => setPreview(singleQuestionExam(exam, section, q))}
            requestQuestionImage={requestQuestionImage}
            onMediaBusyChange={onMediaBusyChange}
            pendingMediaIds={pendingMediaIds}
            disabled={saving}
            selectedIds={selected}
            onToggleSelect={toggleSelect}
            registerQuestionNode={registerQuestionNode}
            flashQuestionId={flashId || undefined}
            blueprint={exam.blueprint}
          />
        ))}
      </div>

      <button type="button" className="sb-add-btn sb-add-section" data-add-section onClick={() => setSections(s => addSection(s, newSection({ title: "القسم " + ((exam.sections || []).length + 1) })))} disabled={saving}>+ إضافة قسم</button>
      </div>
      {navOpen && !isNarrow && navigator(true)}
      </div>

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
    </div>
    </MeshAssetServiceContext.Provider></SimulationServiceContext.Provider>
  );
}

// A one-section exam wrapping a single question for the per-question "student preview".
function singleQuestionExam(exam: StructuredExam, section: BuilderSection, q: BuilderQuestion): StructuredExam {
  return { ...exam, sections: [{ ...section, questions: [q] }] };
}

