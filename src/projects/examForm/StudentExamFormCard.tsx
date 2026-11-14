// Phase F2-UI — the form's card on the student's project page: what state the form is in, how far the student got, and
// the one button that opens it. Shown only when the teacher opened the form for the class (the tracker response carries
// `examForm` then). Presentation only: it makes no request.
import StatusBadge from "../../ui/StatusBadge";
import type { ExamFormSummary } from "./types";

type Props = { summary: ExamFormSummary; readOnly: boolean; onOpen: () => void };

export default function StudentExamFormCard({ summary, readOnly, onOpen }: Props) {
  const submitted = summary.status === "submitted";
  const viewOnly = submitted || summary.state !== "open" || readOnly;
  const badge = submitted ? { tone: "success" as const, text: "سُلّمت" }
    : summary.state !== "open" ? { tone: "neutral" as const, text: "مغلقة" }
      : summary.started ? { tone: "info" as const, text: "قيد التعبئة" } : { tone: "warn" as const, text: "لم تبدأ" };
  const action = viewOnly ? "عرض الاستمارة" : summary.started ? "أكمل من حيث توقفت" : "ابدأ الاستمارة";
  return (
    <div className="eb-sp-form-card" data-testid="exam-form-card">
      <div className="eb-sp-form-card-text">
        <p className="eb-sp-form-card-title"><strong>{summary.title}</strong> <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge></p>
        <p className="eb-muted">أجبت عن <span dir="ltr">{summary.answered}</span> من <span dir="ltr">{summary.total}</span> سؤالًا. لا وقت محدد: إجاباتك تُحفظ وتكمل متى شئت.</p>
      </div>
      <button type="button" className={"eb-button" + (viewOnly ? "" : " is-primary")} onClick={onOpen}>{action}</button>
    </div>
  );
}
