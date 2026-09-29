
import { useEffect, useMemo, useRef, useState } from "react";
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
import { validateStructuredExam, hasBlockingErrors, type StructuredIssue } from "./examQuality";
import ExamSectionEditor from "./ExamSectionEditor";
import ExamCoverEditor from "./ExamCoverEditor";
import ExamPreview from "./ExamPreview";
import Dialog from "./ui/Dialog";
import { useConfirm } from "./ui/useConfirm";
import type { ExamSaveState } from "./examHistory";
import { historyShortcut, isTextEditingTarget } from "./examHistoryShortcuts";
import { browserBackupStorage, clearExamBackup, isRecoveryCandidate, readExamBackup, writeExamBackup, type BackupStorage, type ExamBackup } from "./examAutosave";
import "./structured-builder.css";

// The faithful teacher preview now lives in one shared module (Roadmap #15). Re-exported here so existing
// callers/tests that import { ExamPreview } from "./StructuredExamBuilder" keep working unchanged.
export { default as ExamPreview } from "./ExamPreview";

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
};

const AUTOSAVE_DELAY_MS = 800;
const SAVE_STATE_LABEL: Record<ExamSaveState, string> = { saved: "✓ محفوظ", dirty: "● تغييرات غير محفوظة", saving: "⏳ جارٍ الحفظ", recovered: "↺ نسخة مسترجعة — غير محفوظة" };
const formatBackupTime = (iso: string) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }) : ""; };

export default function StructuredExamBuilder({ exam, onChange, onSave, onExit, saving, notice, error, requestQuestionImage, onUndo, onRedo, canUndo = false, canRedo = false, saveState, recoveryScope, onRecover, backupStorage, autosaveDelayMs = AUTOSAVE_DELAY_MS }: Props) {
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
  const pendingMediaIds: ReadonlySet<string> = new Set(Object.keys(pendingMedia));
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

  const issues = useMemo(() => validateStructuredExam(exam), [exam]);
  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
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
          <button type="button" className="sb-btn" onClick={() => setPreview(exam)}>👁 معاينة الامتحان</button>
          {onSave && mediaPending && <span className="sb-stat sb-media-wait" role="status">{MEDIA_WAIT}</span>}
          {onSave && <button type="button" className="sb-btn" onClick={() => onSave("draft")} disabled={saving || mediaPending} title={mediaPending ? MEDIA_WAIT : undefined}>{saving ? "⏳ جارٍ الحفظ…" : "💾 حفظ مسودة"}</button>}
          {onSave && <button type="button" className="sb-btn sb-btn-primary" onClick={() => onSave("final")} disabled={saving || mediaPending || hasBlockingErrors(errors)} title={mediaPending ? MEDIA_WAIT : hasBlockingErrors(errors) ? "يجب إصلاح الأخطاء قبل الاعتماد النهائي" : "اعتماد الامتحان نهائيًا"}>✓ اعتماد نهائي</button>}
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

      <ExamCoverEditor
        cover={exam.coverPage}
        onChange={cover => update(prev => ({ ...prev, coverPage: cover }))}
        onPreviewCover={() => setPreview(exam)}
        disabled={saving}
      />

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
          />
        ))}
      </div>

      <button type="button" className="sb-add-btn sb-add-section" onClick={() => setSections(s => addSection(s, newSection({ title: "القسم " + ((exam.sections || []).length + 1) })))} disabled={saving}>+ إضافة قسم</button>

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

