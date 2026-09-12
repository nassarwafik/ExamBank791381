
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { StructuredExam, BuilderQuestion, BuilderSection } from "./examTypes";
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
  stripAnswersForPreview
} from "./examBuilderState";
import { validateStructuredExam, hasBlockingErrors, type StructuredIssue } from "./examQuality";
import ExamSectionEditor from "./ExamSectionEditor";
import ExamCoverEditor from "./ExamCoverEditor";
import StructuredExamSection from "./StructuredExamSection";
import StructuredExamCover from "./StructuredExamCover";
import type { Answer, FieldValue } from "./StudentQuestionCard";
import { normalizeExamStructure, type StructuredExam as StudentStructuredExam } from "./examStructure";
import { normalizeCoverPage, examMarksDistribution, type ExamCoverPage } from "./examCover";
import { normalizeExamTheme } from "./examTheme";
import "./structured-builder.css";

// Top-level Structured Exam Builder. It is a CONTROLLED component: the exam lives in the parent
// (App.tsx) and every edit flows back through onChange, applying the pure examBuilderState helpers.
// The parent owns persistence (save / assignment) and mode switching; this component owns the editing
// UI, validation summary, and student preview (full exam and single question) rendered through the
// SAME components students use, fed a scrubbed copy so no answer key is shown.

export type SaveMode = "draft" | "final";
type Props = {
  exam: StructuredExam;
  onChange: (exam: StructuredExam) => void;
  onSave?: (mode: SaveMode) => void;
  onExit?: () => void;
  saving?: boolean;
  notice?: string;
  error?: string;
};

export default function StructuredExamBuilder({ exam, onChange, onSave, onExit, saving, notice, error }: Props) {
  const [preview, setPreview] = useState<StructuredExam | null>(null);
  const [showIssues, setShowIssues] = useState(true);

  const setSections = (updater: (s: BuilderSection[]) => BuilderSection[]) => onChange({ ...exam, sections: updater(exam.sections || []) });
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
          <input className="sb-input sb-exam-title" value={exam.title ?? ""} placeholder="عنوان الامتحان المنظّم" onChange={e => onChange({ ...exam, title: e.target.value })} disabled={saving} />
          <span className="sb-stat">{(exam.sections || []).length} أقسام</span>
          <span className="sb-stat">{countQuestions(exam)} أسئلة</span>
          <span className="sb-stat">{totalMarks} علامة</span>
        </div>
        <div className="sb-toolbar-actions">
          {exam.status === "final" && <span className="sb-stat sb-stat-final">معتمد نهائيًا</span>}
          <button type="button" className="sb-btn" onClick={() => setPreview(exam)}>👁 معاينة الامتحان</button>
          {onSave && <button type="button" className="sb-btn" onClick={() => onSave("draft")} disabled={saving}>{saving ? "⏳ جارٍ الحفظ…" : "💾 حفظ مسودة"}</button>}
          {onSave && <button type="button" className="sb-btn sb-btn-primary" onClick={() => onSave("final")} disabled={saving || hasBlockingErrors(errors)} title={hasBlockingErrors(errors) ? "يجب إصلاح الأخطاء قبل الاعتماد النهائي" : "اعتماد الامتحان نهائيًا"}>✓ اعتماد نهائي</button>}
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
        onChange={cover => onChange({ ...exam, coverPage: cover })}
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

// Interactive student SIMULATION using the exact student rendering components, fed a SCRUBBED exam so
// no answer key is present (stripAnswersForPreview → normalizeExamStructure → student renderer — the
// same pipeline, never the raw teacher exam). The teacher can answer exactly like a student, but the
// answers are EPHEMERAL: they live only in this component's local state, so closing the preview (which
// unmounts ExamPreview) destroys them. Nothing is saved, no API/storage is touched, and the exam object
// is never mutated. Handlers mirror the real StudentExamPage answer shapes byte-for-byte.
export function ExamPreview({ exam, onClose }: { exam: StructuredExam; onClose: () => void }) {
  const scrubbed = useMemo(() => stripAnswersForPreview(exam), [exam]);
  const norm = useMemo(() => normalizeExamStructure(scrubbed as unknown as StudentStructuredExam), [scrubbed]);
  const theme = normalizeExamTheme(exam.presentationTheme);
  // Optional cover: shown FIRST (with placeholder identity) when enabled, then the interactive preview.
  const cover: ExamCoverPage | undefined = useMemo(() => normalizeCoverPage(exam.coverPage), [exam.coverPage]);
  const distribution = useMemo(() => examMarksDistribution(norm), [norm]);
  const [coverStarted, setCoverStarted] = useState(false);
  const showCover = !!cover?.enabled && !coverStarted;
  // Ephemeral, preview-only answers. Owned here (not lifted to the builder), so unmounting resets them.
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const onChoice = (id: string, index: number) => setAnswers(a => ({ ...a, [id]: { kind: "choice", index } }));
  const onSeq = (id: string, index: number, value: string) => setAnswers(a => {
    const prev = a[id]?.kind === "sequence" ? (a[id] as { kind: "sequence"; values: string[] }).values : [];
    const values = [...prev]; values[index] = value;
    return { ...a, [id]: { kind: "sequence", values } };
  });
  const onTable = (id: string, index: number, value: string | boolean) => setAnswers(a => {
    const prev = a[id]?.kind === "table" ? (a[id] as { kind: "table"; values: (string | boolean)[] }).values : [];
    const values = [...prev]; values[index] = value;
    return { ...a, [id]: { kind: "table", values } };
  });
  const onText = (id: string, value: string) => setAnswers(a => ({ ...a, [id]: { kind: "text", value } }));
  const onField = (id: string, fieldId: string, value: FieldValue) => setAnswers(a => {
    const prev = a[id]?.kind === "fields" ? (a[id] as { kind: "fields"; values: Record<string, FieldValue> }).values : {};
    return { ...a, [id]: { kind: "fields", values: { ...prev, [fieldId]: value } } };
  });
  const onPart = (id: string, partId: string, answer: Answer) => setAnswers(a => {
    const prev = a[id]?.kind === "compound" ? (a[id] as { kind: "compound"; parts: Record<string, Answer> }).parts : {};
    return { ...a, [id]: { kind: "compound", parts: { ...prev, [partId]: answer } } };
  });
  let offset = 0;
  return (
    <div className="sb-preview-overlay" role="dialog" aria-modal="true">
      <header className="sb-preview-head">
        <strong>👁 معاينة الطالب — {exam.title || "امتحان"}</strong>
        <button type="button" className="sb-btn" onClick={onClose}>← إغلاق المعاينة</button>
      </header>
      <main className={"interactive-exam-page exam-theme-" + theme} dir="rtl">
        {showCover ? (
          <div className="iex-wrap">
            <StructuredExamCover cover={cover!} title={exam.title || ""} distribution={distribution} preview onStart={() => setCoverStarted(true)} />
          </div>
        ) : (
        <div className="iex-wrap">
          <p className="sb-preview-note">هذه معاينة تفاعلية للطالب — يمكنك تجربة الإجابة، لكن لا تُحفظ أي إجابة ولا تظهر مفاتيح الإجابة.</p>
          {norm.sections.map((section, si) => {
            const startIndex = offset;
            offset += section.questions.length;
            return (
              <StructuredExamSection
                key={section.id}
                section={section}
                sectionNumber={si + 1}
                startIndex={startIndex}
                answers={answers}
                onChoice={onChoice}
                onSeq={onSeq}
                onTable={onTable}
                onText={onText}
                onField={onField}
                onPart={onPart}
              />
            );
          })}
        </div>
        )}
      </main>
    </div>
  );
}
