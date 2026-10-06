import { Suspense, lazy, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import useFocusTrap from "./ui/useFocusTrap";
import useBodyScrollLock from "./ui/useBodyScrollLock";
import StudentQuestionCard, { qid } from "./StudentQuestionCard";
import type { Answer, FieldValue } from "./StudentQuestionCard";
import StructuredExamSection from "./StructuredExamSection";
import StructuredExamCover from "./StructuredExamCover";
import { normalizeExamStructure, type StructuredExam as StudentStructuredExam } from "./examStructure";
import { normalizeCoverPage, examMarksDistribution, type ExamCoverPage } from "./examCover";
import { normalizeExamTheme, previousFocusIndex, nextFocusIndex, focusProgressPercent } from "./examTheme";
import { toSafePreviewExam, type PreviewExamInput } from "./examPreviewModel";
import ExamGeneralInstructions from "./ExamGeneralInstructions";
import { TeacherPreviewContext } from "./questionTypes/studentAttemptContext";
// Phase 20D.1 — an exam WITH a `presentation` object renders through the shared (lazy) presentation root and section shell — the same
// components the student page uses; without one, the legacy themed preview below is unchanged.
const PresentationRoot = lazy(() => import("./presentation/PresentationRoot"));
const PresentationExamSection = lazy(() => import("./presentation/PresentationRoot").then(m => ({ default: m.PresentationExamSection })));

// Roadmap #15 — the ONE faithful teacher preview renderer, shared by the structured builder, the legacy
// flat-exam theme preview (App), and the exam-library preview (AssignmentsPanel). It reproduces the REAL
// student presentation using the SAME components the student runtime uses — StructuredExamCover,
// StructuredExamSection, StudentQuestionCard, the focus-mode helpers, and the authoritative
// normalizeExamStructure / examMarksDistribution — fed a deep-scrubbed safe model (toSafePreviewExam) so
// no grading secret can ever reach the props/DOM.
//
// It is DISPLAY-faithful, NOT lifecycle-faithful: no startAttempt, timer, autosave, submission, grading,
// attempt limits, due dates, R10/R11 save state, session, or results. Temporary answers live only in this
// component's state and vanish when it unmounts (closing the preview). No network, no storage.

type Props = { exam: PreviewExamInput; onClose: () => void };

export default function ExamPreview({ exam, onClose }: Props) {
  const safe = useMemo(() => toSafePreviewExam(exam), [exam]);
  const norm = useMemo(() => normalizeExamStructure(safe as unknown as StudentStructuredExam), [safe]);
  const theme = normalizeExamTheme(exam.presentationTheme);
  const cover = useMemo<ExamCoverPage | undefined>(() => normalizeCoverPage(exam.coverPage), [exam.coverPage]);
  const distribution = useMemo(() => examMarksDistribution(norm), [norm]);
  const generalInstructions = (safe.metadata && typeof safe.metadata === "object" ? (safe.metadata as Record<string, unknown>).generalInstructions : "") as string | undefined;
  // A legacy flat exam (no sections) reproduces the student flat/focus body; a structured exam always
  // renders its sections (matching StudentExamPage, where focus mode applies only to non-structured exams).
  const flatQs = norm.structured ? [] : (norm.sections[0]?.questions ?? []);

  const [coverStarted, setCoverStarted] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  // UX-8a — the overlay is a real modal in place (no Dialog migration, same layering): the shared useFocusTrap owns
  // focus containment, Escape and focus return to the opener; useBodyScrollLock owns the body scroll lock. onClose is
  // read through a ref so a parent re-render never re-arms the trap.
  const overlayRef = useRef<HTMLDivElement>(null), onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  const escape = useCallback(() => onCloseRef.current(), []);
  useFocusTrap(overlayRef, true, escape);
  useBodyScrollLock(true);
  const titleId = "sb-preview-title-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const showCover = !!cover?.enabled && !coverStarted;

  const onChoice = (id: string, index: number) => setAnswers(a => ({ ...a, [id]: { kind: "choice", index } }));
  // Phase 16A — generic seam for registered question types (preview parity: the SAME student card + renderers as the exam page).
  const onAnswer = (id: string, next: Answer) => setAnswers(a => ({ ...a, [id]: next }));
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

  const xpRaw = (safe as Record<string, unknown>).presentation, xp = xpRaw !== undefined && xpRaw !== null;
  const rawSections = (Array.isArray(safe.sections) ? safe.sections : []) as unknown[];
  let offset = 0;
  const body = (
    showCover ? (
      <div className="iex-wrap">
        <StructuredExamCover cover={cover!} title={exam.title || ""} distribution={distribution} preview onStart={() => setCoverStarted(true)} />
      </div>
    ) : (
      <div className="iex-wrap">
        <p className="sb-preview-note">هذه معاينة تفاعلية للطالب — يمكنك تجربة الإجابة، لكن لا تُحفظ أي إجابة ولا تظهر مفاتيح الإجابة.</p>
        <ExamGeneralInstructions text={generalInstructions} />
        {norm.structured ? (
          norm.sections.map((section, si) => {
            const startIndex = offset;
            offset += section.questions.length;
            if (xp) return <PresentationExamSection key={section.id} section={section} raw={rawSections[si]} sectionNumber={si + 1} startIndex={startIndex} answers={answers} onChoice={onChoice} onSeq={onSeq} onTable={onTable} onText={onText} onField={onField} onPart={onPart} onAnswer={onAnswer} />;
            return (
              <StructuredExamSection
                key={section.id}
                section={section}
                sectionNumber={si + 1}
                startIndex={startIndex}
                richInstructions={(rawSections[si] as { instructionsRichContent?: unknown } | undefined)?.instructionsRichContent}
                answers={answers}
                onChoice={onChoice}
                onSeq={onSeq}
                onTable={onTable}
                onText={onText}
                onField={onField}
                onPart={onPart}
                onAnswer={onAnswer}
              />
            );
          })
        ) : !xp && theme === "focus" && flatQs.length > 0 ? (() => {
          const i = Math.min(focusIndex, flatQs.length - 1), q = flatQs[i], id = qid(q, i);
          return (
            <div className="iex-focus-mode">
              <div className="iex-focus-nav">
                <button onClick={() => setFocusIndex(x => previousFocusIndex(x, flatQs.length))} disabled={i === 0}>◀ السابق</button>
                <span>السؤال {i + 1} من {flatQs.length}</span>
                <button onClick={() => setFocusIndex(x => nextFocusIndex(x, flatQs.length))} disabled={i === flatQs.length - 1}>التالي ▶</button>
              </div>
              <div className="iex-focus-progress"><i style={{ width: focusProgressPercent(i, flatQs.length) + "%" }} /></div>
              <StudentQuestionCard q={q} index={i} id={id} answer={answers[id]} onChoice={n => onChoice(id, n)} onSeq={(n, v) => onSeq(id, n, v)} onTable={(n, v) => onTable(id, n, v)} onText={v => onText(id, v)} onField={(fid, v) => onField(id, fid, v)} onAnswer={next => onAnswer(id, next)} />
            </div>
          );
        })() : (
          <section className="iex-flow">
            {flatQs.map((q, i) => {
              const id = qid(q, i);
              return <StudentQuestionCard key={id} q={q} index={i} id={id} answer={answers[id]} onChoice={n => onChoice(id, n)} onSeq={(n, v) => onSeq(id, n, v)} onTable={(n, v) => onTable(id, n, v)} onText={v => onText(id, v)} onField={(fid, v) => onField(id, fid, v)} onAnswer={next => onAnswer(id, next)} />;
            })}
          </section>
        )}
      </div>
    )
  );
  // NOT self-portaling: each call site wraps this in createPortal(document.body) so the fixed overlay
  // escapes any transformed ancestor. Rendering plain here also lets tests query the returned container.
  return (
    <div ref={overlayRef} className="sb-preview-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="sb-preview-head">
        <strong id={titleId}>👁 معاينة الطالب — {exam.title || "امتحان"}</strong>
        <button type="button" className="sb-btn" onClick={onClose}>← إغلاق المعاينة</button>
      </header>
      <TeacherPreviewContext.Provider value={true}>
      {xp
        ? <Suspense fallback={<p className="iex-loading" role="status">جارٍ تحميل المعاينة…</p>}><PresentationRoot as="main" className="interactive-exam-page" presentation={xpRaw}>{body}</PresentationRoot></Suspense>
        : <main className={"interactive-exam-page exam-theme-" + theme} dir="rtl">{body}</main>}
      </TeacherPreviewContext.Provider>
    </div>
  );
}
