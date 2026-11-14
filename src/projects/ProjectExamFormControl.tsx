// Phase F2-UI — the teacher's control for the project exam form of one class: its state and the one action that opens or
// closes it. Shown only for a project that ships a form. Following the answers and marking them is a later phase (F3).
import { useEffect, useRef, useState } from "react";
import { trackerGet, trackerPost } from "./api";
import StatusBadge from "../ui/StatusBadge";
import { useConfirm } from "../ui/useConfirm";

type ExamFormState = { hasForm?: boolean; state?: "none" | "open" | "closed"; summary?: { sections?: number; questions?: number } };
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
  useEffect(() => { setForm(null); setNotice(""); setError(""); void load(); }, [classId, projectCode]);

  if (!form) return null;
  const state = form.state === "open" || form.state === "closed" ? form.state : "none";
  const badge = BADGE[state];
  const opening = state !== "open";

  async function toggle() {
    const ok = await confirm(opening
      ? { title: "فتح استمارة الامتحان للصف", confirmLabel: "فتح الاستمارة",
        message: state === "none"
          ? "ستظهر الاستمارة لكل طلاب الصف داخل مشروعهم، ويعبّئونها متى شاؤوا بلا وقت محدد. تُثبَّت أسئلتها لهذا الصف عند أول فتح."
          : "سيتابع الطلاب التعبئة والتسليم من جديد. الأسئلة والإجابات المحفوظة تبقى كما هي." }
      : { title: "إغلاق استمارة الامتحان", confirmLabel: "إغلاق الاستمارة", tone: "danger",
        message: "لن يستطيع الطلاب الحفظ أو التسليم حتى تفتحها من جديد. إجاباتهم المحفوظة تبقى كما هي." });
    if (!ok) return;
    setBusy(true); setNotice(""); setError("");
    try {
      const r = await trackerPost<{ examForm?: ExamFormState }>(token, projectCode, { action: opening ? "examForm.open" : "examForm.close", classId });
      if (r.examForm && r.examForm.hasForm === true) setForm(r.examForm);
      setNotice(opening ? "فُتحت الاستمارة لطلاب الصف." : "أُغلقت الاستمارة.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تغيير حالة الاستمارة.");
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
        </p>
      </div>
      {!readOnly && (
        <button type="button" className={"eb-button" + (opening ? " is-primary" : "")} disabled={busy} onClick={() => void toggle()}>
          {opening ? "فتح الاستمارة للصف" : "إغلاق الاستمارة"}
        </button>
      )}
      {notice && <p className="platform-notice assignment-inline-message" role="status">{notice}</p>}
      {error && <p className="platform-error assignment-inline-message" role="alert">{error}</p>}
      {confirmDialog}
    </div>
  );
}
