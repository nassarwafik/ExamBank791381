// Phase F2-UI — the teacher's control for the project exam form of one class: its state and the one action that opens or
// closes it. Shown only for a project that ships a form.
// Phase F3-UI — before the first open the teacher may hide questions for this class; once the form was opened, «متابعة
// الاستمارات» shows every student's form in place and leads to the review of one student.
// Phase F4-UI — image answers. A class opened for the first time from here has them on (the owner's decision); a class
// opened before keeps them off until its teacher switches them on with «تفعيل أسئلة الصور». The switch never goes back
// off (the server refuses it), and it is offered only on an open form: the same action would reopen a closed one.
import { useEffect, useRef, useState } from "react";
import { trackerGet, trackerPost } from "./api";
import StatusBadge from "../ui/StatusBadge";
import { useConfirm } from "../ui/useConfirm";
import ExamFormHidePicker from "./examForm/ExamFormHidePicker";
import TeacherExamFormList from "./examForm/TeacherExamFormList";
import TeacherExamFormReview from "./examForm/TeacherExamFormReview";

type ExamFormState = { hasForm?: boolean; state?: "none" | "open" | "closed"; imageAnswers?: boolean; summary?: { sections?: number; questions?: number }; hiddenQuestionIds?: string[] };
type Props = {
  token: string; projectCode: string; classId: string;
  /** An archived class, or a teacher without the manage capability: the state is shown, the action is not. */
  readOnly?: boolean;
};

const BADGE = {
  none: { tone: "neutral" as const, text: "لم تُفتح بعد" },
  open: { tone: "success" as const, text: "مفتوحة للطلاب" },
  closed: { tone: "warn" as const, text: "مغلقة" }
};

export default function ProjectExamFormControl({ token, projectCode, classId, readOnly = false }: Props) {
  const [form, setForm] = useState<ExamFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { confirm, confirmDialog } = useConfirm();
  // Phase F3-UI — the questions hidden for this class (chosen before the first open), and the follow-up panel:
  // closed, the class list, or one student's review.
  const [picking, setPicking] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [panel, setPanel] = useState<null | "list" | { studentId: string }>(null);
  // Only the latest read may populate the control (a slower answer for a previously selected class is dropped).
  const seq = useRef(0);

  async function load() {
    const mine = ++seq.current;
    try {
      const r = await trackerGet<{ examForm?: ExamFormState }>(token, projectCode, "exam-form", { classId });
      if (mine === seq.current) setForm(r.examForm && r.examForm.hasForm === true ? r.examForm : null);
    } catch {
      // The control is optional on the dashboard: when its state cannot be read it is simply not shown.
      if (mine === seq.current) setForm(null);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setForm(null); setNotice(""); setError(""); setPicking(false); setHidden([]); setPanel(null); void load(); }, [classId, projectCode]);

  if (!form) return null;
  const state = form.state === "open" || form.state === "closed" ? form.state : "none";
  const badge = BADGE[state];
  const opening = state !== "open";
  const imagesOn = form.imageAnswers === true;
  const hiddenStored = Array.isArray(form.hiddenQuestionIds) ? form.hiddenQuestionIds.length : 0;

  async function toggle() {
    const ok = await confirm(opening
      ? { title: "فتح استمارة الامتحان للصف", confirmLabel: "فتح الاستمارة",
        message: state === "none"
          ? "ستظهر الاستمارة لكل طلاب الصف داخل مشروعهم، ويعبّئونها متى شاؤوا بلا وقت محدد. تُثبَّت أسئلتها لهذا الصف عند أول فتح. أسئلة الصور مفعّلة: يرفق الطالب فيها صورًا من مشروعه."
            + (hidden.length ? "\nعدد الأسئلة المخفية عن هذا الصف: " + hidden.length + ". لا يمكن تغيير ذلك بعد الفتح." : "")
          : "سيتابع الطلاب التعبئة والتسليم من جديد. الأسئلة والإجابات المحفوظة تبقى كما هي." }
      : { title: "إغلاق استمارة الامتحان", confirmLabel: "إغلاق الاستمارة", tone: "danger",
        message: "لن يستطيع الطلاب الحفظ أو التسليم حتى تفتحها من جديد. إجاباتهم المحفوظة تبقى كما هي." });
    if (!ok) return;
    setBusy(true); setNotice(""); setError("");
    try {
      // The hidden list goes only with the FIRST open; the server refuses it afterwards.
      const first = state === "none" && hidden.length > 0;
      // The first open of a class also switches its image answers on; a reopen leaves the class as it is.
      const r = await trackerPost<{ examForm?: ExamFormState }>(token, projectCode, { action: opening ? "examForm.open" : "examForm.close", classId, ...(state === "none" ? { imageAnswers: true } : {}), ...(first ? { hiddenQuestionIds: hidden } : {}) });
      if (r.examForm && r.examForm.hasForm === true) setForm(r.examForm);
      setPicking(false); setHidden([]);
      setNotice(opening ? "فُتحت الاستمارة لطلاب الصف." : "أُغلقت الاستمارة.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تغيير حالة الاستمارة.");
    } finally {
      setBusy(false);
    }
  }

  async function enableImages() {
    const ok = await confirm({ title: "تفعيل أسئلة الصور", confirmLabel: "تفعيل",
      message: "سيرفق طلاب الصف صورًا من مشروعهم في أسئلة الصور، والإلزامي منها يصبح شرطًا للتسليم. الاستمارات التي سُلّمت تبقى مسلَّمة. لا يمكن إلغاء التفعيل بعد ذلك." });
    if (!ok) return;
    setBusy(true); setNotice(""); setError("");
    try {
      const r = await trackerPost<{ examForm?: ExamFormState }>(token, projectCode, { action: "examForm.open", classId, imageAnswers: true });
      if (r.examForm && r.examForm.hasForm === true) setForm(r.examForm);
      setNotice("فُعّلت أسئلة الصور لطلاب الصف.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تفعيل أسئلة الصور.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="eb-project-exam-form" data-testid="project-exam-form">
      <div className="eb-project-exam-form-text">
        <p className="eb-project-exam-form-title"><strong>استمارة امتحان المشروع</strong> <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge></p>
        <p className="eb-muted">
          {form.summary && form.summary.sections && form.summary.questions ? <><span dir="ltr">{form.summary.sections}</span> قسمًا و<span dir="ltr">{form.summary.questions}</span> سؤالًا. </> : null}
          يجيب كل طالب عن مشروعه هو، بلا وقت محدد، ويسلّم مرة واحدة.
          {hiddenStored > 0 && <> عدد الأسئلة المخفية عن هذا الصف: <span dir="ltr">{hiddenStored}</span>.</>}
        </p>
        {state !== "none" && (
          <p className="eb-muted" data-testid="project-exam-form-images">
            {imagesOn ? "أسئلة الصور مفعّلة: يرفق الطلاب صورًا من مشروعهم." : "أسئلة الصور غير مفعّلة لهذا الصف: لا يُطلب من الطلاب إرفاق صور."}
          </p>
        )}
      </div>
      <div className="eb-project-exam-form-actions">
        {state !== "none" && (
          <button type="button" className="eb-button" aria-expanded={panel !== null} onClick={() => setPanel(panel === null ? "list" : null)}>
            {panel === null ? "متابعة الاستمارات" : "إخفاء المتابعة"}
          </button>
        )}
        {!readOnly && state === "none" && (
          <button type="button" className="eb-button" aria-expanded={picking} disabled={busy} onClick={() => setPicking(p => !p)}>
            {picking ? "إخفاء قائمة الأسئلة" : "اختيار الأسئلة" + (hidden.length ? " (المخفية: " + hidden.length + ")" : "")}
          </button>
        )}
        {!readOnly && state === "open" && !imagesOn && (
          <button type="button" className="eb-button" disabled={busy} onClick={() => void enableImages()}>تفعيل أسئلة الصور</button>
        )}
        {!readOnly && (
          <button type="button" className={"eb-button" + (opening ? " is-primary" : "")} disabled={busy} onClick={() => void toggle()}>
            {opening ? "فتح الاستمارة للصف" : "إغلاق الاستمارة"}
          </button>
        )}
      </div>
      {notice && <p className="platform-notice assignment-inline-message" role="status">{notice}</p>}
      {error && <p className="platform-error assignment-inline-message" role="alert">{error}</p>}
      {!readOnly && state === "none" && picking && (
        <div className="eb-project-exam-form-panel">
          <ExamFormHidePicker token={token} projectCode={projectCode} classId={classId} hidden={hidden} onChange={setHidden} disabled={busy} />
        </div>
      )}
      {state !== "none" && panel !== null && (
        <div className="eb-project-exam-form-panel" data-testid="exam-form-panel">
          {panel === "list"
            ? <TeacherExamFormList token={token} projectCode={projectCode} classId={classId} onOpen={studentId => setPanel({ studentId })} />
            : <TeacherExamFormReview token={token} projectCode={projectCode} classId={classId} studentId={panel.studentId} readOnly={readOnly} onClose={() => setPanel("list")} />}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
