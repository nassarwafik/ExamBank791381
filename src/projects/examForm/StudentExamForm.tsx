// Phase F2-UI — the student's project exam form («استمارة امتحان المشروع»): one section at a time, every answer saved as
// the student goes (no time limit), resumed where they stopped, submitted once. After the submit, or while the teacher
// keeps the form closed, the page is a read-only record of the answers.
// Phase F4-UI — where the teacher switched image answers on for the class, image questions take images (ExamFormImages).
import { useEffect, useMemo, useRef, useState } from "react";
import ProgressBar from "../../ui/ProgressBar";
import StatusBadge from "../../ui/StatusBadge";
import { IconChevronBack } from "../../icons";
import { useConfirm } from "../../ui/useConfirm";
import SaveStatus from "../../student/exam/SaveStatus";
import QuestionInput from "./QuestionInput";
import type { ExamFormImageTools } from "./ExamFormImages";
import { useExamFormDraft } from "./useExamFormDraft";
import type { ExamFormSection, ExamFormView } from "./types";

type Props = {
  token: string;
  projectCode: string;
  onClose: () => void;
  /** The pause after the last edit before a save is sent. Tests shorten it. */
  saveDelayMs?: number;
};

const share = (answered: number, total: number) => (total > 0 ? (answered * 100) / total : 0);

function statusOf(view: ExamFormView): { tone: "success" | "neutral" | "info" | "warn"; text: string } {
  if (view.status === "approved") return { tone: "success", text: "اعتُمدت" };
  if (view.status === "submitted") return { tone: "success", text: "سُلّمت" };
  if (view.state !== "open") return { tone: "neutral", text: "مغلقة" };
  if (view.status === "returned") return { tone: "warn", text: "أُعيدت للتعديل" };
  return { tone: "info", text: "مسودة" };
}
function lockReason(view: ExamFormView): string {
  if (view.status === "approved") return "اعتمد معلمك هذه الاستمارة. هي الآن للعرض فقط.";
  if (view.status === "submitted") return "سلّمت هذه الاستمارة. هي الآن للعرض فقط، ويراجعها معلمك.";
  if (view.readOnly) return "الصف مؤرشف — الاستمارة للعرض فقط.";
  if (view.state !== "open") return "أغلق المعلم الاستمارة. إجاباتك المحفوظة باقية، ولا يمكن تعديلها الآن.";
  return "";
}
// Where to continue: the first section that still has a required question to answer.
function resumeIndex(sections: ExamFormSection[], missing: Set<string>): number {
  const index = sections.findIndex(s => s.questions.some(q => missing.has(q.questionId)));
  return index < 0 ? 0 : index;
}

export default function StudentExamForm({ token, projectCode, onClose, saveDelayMs }: Props) {
  const draft = useExamFormDraft(token, projectCode, saveDelayMs);
  const { confirm, confirmDialog } = useConfirm();
  const { view } = draft;
  const sections = useMemo(() => (view ? view.form.sections : []), [view]);
  const missing = useMemo(() => new Set(view ? view.progress.missing : []), [view]);
  const [current, setCurrent] = useState<number | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // The first time the form arrives, open it where the student stopped. State adjusted during render (once), so the first
  // section never flashes by; later saves do not move the page.
  if (view && current === null) setCurrent(resumeIndex(view.form.sections, new Set(view.progress.missing)));

  // Moving to another section brings its title (and its chip in the section row) into view and takes the focus there,
  // so «القسم التالي» at the bottom of a long section continues from the top of the next one.
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const sectionsRef = useRef<HTMLElement | null>(null);
  const moved = useRef(false);
  function go(next: number) { moved.current = true; setCurrent(next); }
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const heading = headingRef.current;
    if (heading) { if (typeof heading.scrollIntoView === "function") heading.scrollIntoView({ block: "start" }); heading.focus({ preventScroll: true }); }
    const chip = sectionsRef.current ? sectionsRef.current.querySelector<HTMLElement>('[aria-current="step"]') : null;
    if (chip && typeof chip.scrollIntoView === "function") chip.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);

  const back = (
    <button type="button" className="eb-button is-quiet eb-sp-form-back" onClick={onClose}>
      <IconChevronBack size={16} aria-hidden="true" />العودة إلى المشروع
    </button>
  );
  if (draft.loading && !view) return <section className="eb-sp-form">{back}<p className="eb-muted" role="status">جارٍ تحميل الاستمارة...</p></section>;
  if (!view) {
    return (
      <section className="eb-sp-form">
        {back}
        {draft.loadError
          ? <div className="platform-error assignment-inline-message" role="alert">{draft.loadError} <button type="button" className="eb-button is-small" onClick={() => void draft.reload()}>إعادة المحاولة</button></div>
          : <p className="eb-muted">الاستمارة غير متاحة الآن.</p>}
      </section>
    );
  }

  const index = current ?? 0;
  const section = sections[index];
  const status = statusOf(view);
  const reason = lockReason(view);
  const last = index === sections.length - 1;
  // Image questions take images only where the server says the class has them on; otherwise they stay a notice.
  const imageTools: ExamFormImageTools | undefined = draft.imagesOn
    ? { read: draft.readImage, add: draft.addImage, remove: draft.removeImage,
      confirmRemove: () => confirm({ title: "حذف الصورة", message: "ستُحذف هذه الصورة من إجابتك. يمكنك إرفاق صورة أخرى بعدها.", confirmLabel: "حذف الصورة", tone: "danger" }) }
    : undefined;
  // What a class with image answers off is told depends on whether its form has file questions at all (899373 has none).
  const hasFileQuestions = sections.some(s => s.questions.some(q => q.kind === "file"));
  const deferredNote = view.progress.deferred === 0 ? ""
    : !draft.imagesOn ? view.progress.deferred + (hasFileQuestions
      ? " سؤالًا تحتاج صورًا أو ملفات، وهي لا تمنع التسليم الآن. أسئلة الصور غير مفعّلة لصفك، والملفات تُسلَّم لمعلمك مباشرة ولا تُرفع إلى الموقع."
      : " سؤالًا تحتاج صورًا، وهي لا تمنع التسليم الآن. أسئلة الصور غير مفعّلة لصفك.")
      : (view.progress.deferred === 1 ? "سؤال واحد يحتاج ملفًا" : view.progress.deferred === 2 ? "سؤالان يحتاجان ملفات" : view.progress.deferred + " أسئلة تحتاج ملفات")
        + ". تُسلَّم الملفات لمعلمك مباشرة ولا تُرفع إلى الموقع، وهذا لا يمنع التسليم.";
  // Phase F3-UI — after the teacher's approval: this section's level and note, and right / wrong per auto-marked question.
  const sectionResult = view.result ? view.result.sections.find(r => r.sectionId === section.sectionId) : undefined;
  const verdicts = view.result ? view.result.auto : null;
  const missingSections = sections.map((s, i) => ({ index: i, title: s.title, count: s.questions.filter(q => missing.has(q.questionId)).length })).filter(s => s.count > 0);

  async function submit() {
    setSubmitError("");
    // Edits not saved yet go first, so the missing list is the server's own, of the answers as they are now: a form that
    // cannot be submitted lists what is missing instead of asking for a confirmation.
    const fresh = await draft.saveNow();
    if (fresh && fresh.progress.missing.length) { setShowMissing(true); return; }
    if (!(await confirm({ title: "تسليم الاستمارة", message: "بعد التسليم لا يمكنك تعديل إجاباتك إلا إذا أعادها المعلم إليك.", confirmLabel: "تسليم" }))) return;
    const outcome = await draft.submit();
    if (outcome.ok) { setShowMissing(false); setSubmitted(true); return; }
    if (outcome.missing.length) setShowMissing(true); else setSubmitError(outcome.message);
  }

  return (
    <section className="eb-sp-form" aria-labelledby="eb-sp-form-title">
      {back}
      <header className="eb-sp-form-head">
        <h2 id="eb-sp-form-title" className="eb-subheading">{view.form.title}</h2>
        <StatusBadge tone={status.tone}>{status.text}</StatusBadge>
        {!draft.locked && <SaveStatus kind={draft.saveKind} lastSavedAt={draft.lastSavedAt} onRetry={draft.retrySave} />}
      </header>
      <ProgressBar size="sm" showValue={false} label={"أجبت عن " + view.progress.answered + " من " + view.progress.total} value={share(view.progress.answered, view.progress.total)} tone={view.status === "submitted" || view.status === "approved" ? "success" : "primary"} />
      {reason && <p className="platform-notice assignment-inline-message" data-testid="exam-form-locked">{reason}</p>}
      {view.status === "returned" && (
        <p className="platform-notice assignment-inline-message" data-testid="exam-form-returned">
          أعاد معلمك الاستمارة للتعديل{view.returnNote ? ": " + view.returnNote : "."} عدّل إجاباتك ثم سلّمها من جديد.
        </p>
      )}
      {view.result && (
        <div className="eb-sp-form-result" data-testid="exam-form-result">
          <p className="eb-sp-form-result-mark" data-testid="exam-form-mark">
            علامة الاستمارة: <strong dir="ltr">{view.result.mark} / {view.result.outOf}</strong>
          </p>
          {view.result.generalNote && <p className="eb-sp-form-result-general">ملاحظة معلمك: <span dir="auto">{view.result.generalNote}</span></p>}
          <ul className="eb-sp-form-result-list" aria-label="تقدير الأقسام">
            {view.result.sections.map(r => {
              const at = sections.findIndex(s => s.sectionId === r.sectionId);
              return (
                <li key={r.sectionId} className="eb-sp-form-result-row" data-section={r.sectionId}>
                  <span className="eb-sp-form-result-title">
                    {at >= 0 ? <button type="button" className="eb-button is-small is-quiet" onClick={() => go(at)}>{sections[at].title}</button> : r.sectionId}
                  </span>
                  <span className="eb-sp-form-result-level">{r.levelLabel} <span className="eb-muted" dir="ltr">({r.level}/{r.topLevel})</span></span>
                  <span className="eb-sp-form-result-points"><span dir="ltr">{r.points}</span> من <span dir="ltr">{r.weight}</span></span>
                  {r.note && <span className="eb-sp-form-result-note">ملاحظة: <span dir="auto">{r.note}</span></span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {submitted && <p className="platform-notice assignment-inline-message" role="status">تم تسليم الاستمارة.</p>}
      {draft.notice && !reason && <p className="platform-notice assignment-inline-message" role="status">{draft.notice}</p>}
      {draft.error && <p className="platform-error assignment-inline-message" role="alert">{draft.error}</p>}
      {deferredNote && !draft.locked && <p className="eb-muted eb-sp-form-note">{deferredNote}</p>}

      <nav className="eb-sp-form-sections" aria-label="أقسام الاستمارة" ref={sectionsRef}>
        {sections.map((s, i) => {
          const left = s.questions.filter(q => missing.has(q.questionId)).length;
          return (
            <button key={s.sectionId} type="button" className="eb-chip-button" aria-current={i === index ? "step" : undefined} onClick={() => go(i)}>
              <span dir="ltr">{s.order}</span> {s.title}{left === 0 ? " · مكتمل" : ""}
            </button>
          );
        })}
      </nav>

      <div className="eb-sp-form-section">
        <h3 className="eb-sp-form-section-title" ref={headingRef} tabIndex={-1}><span dir="ltr">{section.order}</span>. {section.title}</h3>
        {sectionResult && (
          <p className="eb-sp-form-section-result" data-testid="exam-form-section-result">
            تقدير هذا القسم: <strong>{sectionResult.levelLabel}</strong> <span className="eb-muted" dir="ltr">({sectionResult.level}/{sectionResult.topLevel})</span>
            {sectionResult.note && <> — <span dir="auto">{sectionResult.note}</span></>}
          </p>
        )}
        {section.questions.map((question, qi) => {
          const flagged = showMissing && missing.has(question.questionId);
          return (
            <fieldset key={question.questionId} className={"eb-sp-form-question" + (flagged ? " is-missing" : "")} data-question={question.questionId}>
              <legend>
                <span className="eb-sp-form-number" dir="ltr">{section.order}.{qi + 1}</span> {question.prompt}
                {!question.required && <span className="eb-muted"> (اختياري)</span>}
              </legend>
              <div className="eb-sp-form-question-body">
                {question.help && <p className="eb-muted eb-sp-form-help">{question.help}</p>}
                <QuestionInput question={question} answer={draft.answers[question.questionId]} disabled={draft.locked}
                  onChange={answer => draft.setAnswer(question.questionId, answer)} images={imageTools} />
                {flagged && <p className="eb-sp-form-missing-mark">هذا السؤال إلزامي ولم يكتمل بعد.</p>}
                {verdicts && question.questionId in verdicts && (
                  <p className="eb-sp-form-verdict" data-verdict={verdicts[question.questionId] === null ? "none" : verdicts[question.questionId] ? "right" : "wrong"}>
                    <StatusBadge tone={verdicts[question.questionId] === null ? "neutral" : verdicts[question.questionId] ? "success" : "danger"}>
                      {verdicts[question.questionId] === null ? "لم تُجب" : verdicts[question.questionId] ? "إجابة صحيحة" : "إجابة خاطئة"}
                    </StatusBadge>
                  </p>
                )}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="eb-sp-form-steps">
        <button type="button" className="eb-button" disabled={index === 0} onClick={() => go(index - 1)}>القسم السابق</button>
        {!last && <button type="button" className="eb-button is-primary" onClick={() => go(index + 1)}>القسم التالي</button>}
        {last && !draft.locked && <button type="button" className="eb-button is-primary" disabled={draft.submitting} onClick={() => void submit()}>{draft.submitting ? "جارٍ التسليم..." : "تسليم الاستمارة"}</button>}
      </div>

      {showMissing && missingSections.length > 0 && !draft.locked && (
        <div className="platform-error assignment-inline-message eb-sp-form-missing" role="alert">
          <p>أكمل الأسئلة الإلزامية قبل التسليم ({missing.size}):</p>
          <ul>
            {missingSections.map(s => (
              <li key={s.index}><button type="button" className="eb-button is-small" onClick={() => go(s.index)}>{s.title} ({s.count})</button></li>
            ))}
          </ul>
        </div>
      )}
      {submitError && <p className="platform-error assignment-inline-message" role="alert">{submitError}</p>}
      {confirmDialog}
    </section>
  );
}
