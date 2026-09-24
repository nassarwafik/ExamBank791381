
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
};

export default function StructuredExamBuilder({ exam, onChange, onSave, onExit, saving, notice, error, requestQuestionImage }: Props) {
  const [preview, setPreview] = useState<StructuredExam | null>(null);
  const [showIssues, setShowIssues] = useState(true);

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
  const MEDIA_WAIT = "انتظر انتهاء معالجة الصور قبل الحفظ.";
  const sectionOptions = (exam.sections || []).map(s => ({ id: s.id, title: s.title }));
  const issues = useMemo(() => validateStructuredExam(exam), [exam]);
  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  const totalMarks = computeTotalMarks(exam);

  return (
    <div className="sb-builder" dir="rtl">
      <header className="sb-toolbar">
        <div className="sb-toolbar-main">
          {onExit && <button type="button" className="sb-btn" onClick={onExit} disabled={saving}>→ رجوع</button>}
          <input className="sb-input sb-exam-title" value={exam.title ?? ""} placeholder="عنوان الامتحان المنظّم" onChange={e => { const title = e.target.value; update(prev => ({ ...prev, title })); }} disabled={saving} />
          <span className="sb-stat">{(exam.sections || []).length} أقسام</span>
          <span className="sb-stat">{countQuestions(exam)} أسئلة</span>
          <span className="sb-stat">{totalMarks} علامة</span>
        </div>
        <div className="sb-toolbar-actions">
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
            disabled={saving}
          />
        ))}
      </div>

      <button type="button" className="sb-add-btn sb-add-section" onClick={() => setSections(s => addSection(s, newSection({ title: "القسم " + ((exam.sections || []).length + 1) })))} disabled={saving}>+ إضافة قسم</button>

      {preview && createPortal(<ExamPreview exam={preview} onClose={() => setPreview(null)} />, document.body)}
    </div>
  );
}

// A one-section exam wrapping a single question for the per-question "student preview".
function singleQuestionExam(exam: StructuredExam, section: BuilderSection, q: BuilderQuestion): StructuredExam {
  return { ...exam, sections: [{ ...section, questions: [q] }] };
}

