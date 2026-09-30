
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StructuredExam, BuilderQuestion, BuilderSection, BuilderImageAsset } from "./examTypes";
import type { AiImageRequestQuestion } from "./questionMedia";
import {
  addSection,
  deleteSection,
  updateSection,
  moveSection,
  addQuestion as addQ,
  deleteQuestion as delQ,
  updateQuestion as updQ,
  moveQuestion as movQ,
  duplicateQuestion as dupQ,
  moveQuestionToSection as movQTo,
  newSection,
  computeTotalMarks,
  countQuestions,
  type StructuredExamUpdater
} from "./examBuilderState";
import { hasBlockingErrors, type StructuredIssue } from "./examQuality";
import { evaluateExamFinalization } from "./examFinalization";
import { withQualityPolicy } from "./assessmentQualityPolicy";
import ExamSectionEditor from "./ExamSectionEditor";
import ExamCoverEditor from "./ExamCoverEditor";
import ExamPreview from "./ExamPreview";
import Dialog from "./ui/Dialog";
import { useConfirm } from "./ui/useConfirm";
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
import { withBlueprint, validateBlueprintForExam } from "./assessmentBlueprint";
import { applyBulkClassification, type BulkClassification } from "./assessmentBulkClassify";
import { focusKey, type BankPickerFocus } from "./bankPickerFocus";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import { useMediaQuery } from "./ui/useMediaQuery";
import "./structured-builder.css";

// The faithful teacher preview now lives in one shared module (Roadmap #15). Re-exported here so existing
// callers/tests that import { ExamPreview } from "./StructuredExamBuilder" keep working unchanged.
export { default as ExamPreview } from "./ExamPreview";
export type { BankPickerService } from "./BankQuestionPicker";
import type { GovernanceService } from "./examGovernance";
export type { GovernanceService } from "./examGovernance";

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
  // Phase 13B — App-owned, authenticated Question Bank callbacks (list rows / exact-id canonical retrieval). The builder
  // never receives a token; without a service the "إضافة من بنك الأسئلة" action is simply not offered.
  bankPicker?: BankPickerService;
  // Phase 14A — the App-owned window onto the SERVER publishing authority (status, revisions, transitions). Like the bank
  // picker, the builder never receives a token; without a service the «إدارة النشر والإصدارات» action is simply not offered.
  governance?: GovernanceService;
};

const AUTOSAVE_DELAY_MS = 800;
const SAVE_STATE_LABEL: Record<ExamSaveState, string> = { saved: "✓ محفوظ", dirty: "● تغييرات غير محفوظة", saving: "⏳ جارٍ الحفظ", recovered: "↺ نسخة مسترجعة — غير محفوظة" };
const EMPTY_IDS: ReadonlySet<string> = new Set<string>();
const FLASH_MS = 1200;
// UI-only productivity state (selection ids + navigator filters). Keyed by exam id so it is RESET when another exam opens,
// and pruned against the live exam so a deleted / undone question never lingers (and is never resurrected by redo).
type ProductivityUi = { examId: string; ids: ReadonlySet<string>; filters: NavigatorFilters };
const formatBackupTime = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : ""; };

export default function StructuredExamBuilder({ exam, onChange, onSave, onExit, saving, notice, error, requestQuestionImage, onUndo, onRedo, canUndo = false, canRedo = false, saveState, recoveryScope, onRecover, backupStorage, autosaveDelayMs = AUTOSAVE_DELAY_MS, bankPicker, governance }: Props) {
  const [preview, setPreview] = useState<StructuredExam | null>(null);
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
  const requestExit = async () => {
    if (!onExit) return;
    if (unsaved) {
      const ok = await confirm({
        title: "تغييرات غير محفوظة",
        message: "توجد تغييرات غير محفوظة في هذا الامتحان.\nستبقى نسخة غير محفوظة في هذه الجلسة" + (autosaveEnabled ? " ونسخة احتياطية محلية على هذا الجهاز" : "") + "، لكنها لن تُحفظ على الخادم حتى تضغط حفظ.",
        confirmLabel: "الخروج دون حفظ",
        cancelLabel: "البقاء في المحرر",
        tone: "danger"
      });
      if (!ok || !alive.current) return;
    }
    onExit();
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
  const focusCard = (id: string) => {
    const el = nodes.current.get(id);
    if (!el || !alive.current) return;
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
    setFlashId(id);
  };
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
    <div className="sb-builder" dir="rtl">
      <header className="sb-toolbar">
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
          {exam.blueprint && <button type="button" className={"sb-btn" + (coverageOpen ? " is-active" : "")} onClick={() => setCoverageOpen(true)} aria-haspopup="dialog" title="تحليل المخطط">📊 <span className="sb-btn-label">تحليل المخطط</span></button>}
          {exam.blueprint && <button type="button" className={"sb-btn" + (policyOpen ? " is-active" : "")} onClick={() => setPolicyOpen(true)} aria-haspopup="dialog" title="سياسات الجودة">🛡 <span className="sb-btn-label">سياسات الجودة</span></button>}
          {governance && <button type="button" className={"sb-btn" + (governanceOpen ? " is-active" : "")} onClick={() => setGovernanceOpen(true)} aria-haspopup="dialog" title="إدارة النشر والإصدارات">🗂 <span className="sb-btn-label">إدارة النشر والإصدارات</span></button>}
          <button type="button" className={"sb-btn" + (blueprintOpen ? " is-active" : "")} onClick={() => setBlueprintOpen(true)} aria-haspopup="dialog" title="مخطط الامتحان">📐 <span className="sb-btn-label">مخطط الامتحان</span>{blueprintIssueCount > 0 && <span className="sb-bp-badge" aria-label={blueprintIssueCount + " مشكلات في المخطط"}>{blueprintIssueCount}</span>}</button>
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
            onDelete={() => setSections(s => deleteSection(s, section.id))}
            onMove={d => setSections(s => moveSection(s, section.id, d))}
            onAddQuestion={q => setSections(s => addQ(s, section.id, q))}
            onQuestionChange={(qid, p) => setSections(s => updQ(s, section.id, qid, p))}
            onQuestionDelete={qid => setSections(s => delQ(s, section.id, qid))}
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

      <button type="button" className="sb-add-btn sb-add-section" onClick={() => setSections(s => addSection(s, newSection({ title: "القسم " + ((exam.sections || []).length + 1) })))} disabled={saving}>+ إضافة قسم</button>
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
    </div>
  );
}

// A one-section exam wrapping a single question for the per-question "student preview".
function singleQuestionExam(exam: StructuredExam, section: BuilderSection, q: BuilderQuestion): StructuredExam {
  return { ...exam, sections: [{ ...section, questions: [q] }] };
}

