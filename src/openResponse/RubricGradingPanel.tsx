import { useId, useMemo } from "react";
import { openResponseReviewModel, scoreOpenResponseRubric } from "../openResponseQuestion";
import "./openResponse.css";

// Phase 19E — the teacher RUBRIC grading panel (lazy, inside AssignmentReview). The student's response stays visible next to the
// rubric; per criterion the teacher picks ONE level (native radio group: keyboard + screen reader) or, only where the rubric allows it,
// bounded custom points; the private grading guidance and the model answer are shown to the teacher only. The live total is an ESTIMATE
// computed with the same shared engine — the server recomputes the official score from the published rubric on save and ignores any
// client number. A stale stored selection (the published rubric changed) is never hydrated by the host, so never shown as a grade.
export type RubricAwardInput = { levelId: string } | { points: number };
export type RubricAwardsInput = Record<string, RubricAwardInput>;
type ReviewQuestion = { questionId: string; questionNumber: number; marks: number; openResponse?: unknown; questionTypeVersion?: unknown; expectedAnswer: unknown; studentAnswer: unknown; rubricReview?: unknown };
type Props = { question: ReviewQuestion; awards: RubricAwardsInput; onChange: (next: RubricAwardsInput) => void; disabled?: boolean };

export default function RubricGradingPanel({ question: q, awards, onChange, disabled }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const node = useMemo(() => ({ presentationType: "openResponse", questionTypeVersion: q.questionTypeVersion ?? undefined, marks: q.marks, openResponse: q.openResponse, answer: q.expectedAnswer }), [q]);
  const model = useMemo(() => openResponseReviewModel(node, q.rubricReview), [node, q.rubricReview]);
  const done = model.ok ? model.rubric.criteria.filter(c => awards[c.id] !== undefined).length : 0;
  const total = model.ok ? model.rubric.criteria.length : 0;
  const live = useMemo(() => (model.ok && done === total ? scoreOpenResponseRubric(node, awards) : null), [model, node, awards, done, total]);

  const text = q.studentAnswer && typeof q.studentAnswer === "object" && (q.studentAnswer as { kind?: unknown }).kind === "text" ? String((q.studentAnswer as { value?: unknown }).value ?? "") : "";
  if (!model.ok) return <p className="or-unavailable" role="note" data-testid="rubric-authority-invalid">سلم التقييم المنشور لهذا السؤال غير صالح؛ لا يمكن احتساب درجة منه، ويبقى السؤال بانتظار المراجعة.</p>;
  const set = (id: string, a: RubricAwardInput | undefined) => { if (disabled) return; const next = { ...awards }; if (a) next[id] = a; else delete next[id]; onChange(next); };

  return (
    <div className="or-grade" data-testid="rubric-grading">
      <section aria-labelledby={"or-ans-" + uid}>
        <h4 id={"or-ans-" + uid}>إجابة الطالب</h4>
        <pre className="or-student-answer" dir="auto" tabIndex={0} data-testid="rubric-student-answer">{text.trim() ? text : "— لم يكتب الطالب إجابة —"}</pre>
        {model.modelAnswer.trim() !== "" && (
          <details className="or-rubric"><summary>الإجابة النموذجية (للمعلم فقط)</summary><p className="or-instructions" dir="auto" style={{ padding: "0 12px 12px" }}>{model.modelAnswer}</p></details>
        )}
      </section>
      <section className="or-grade-criteria" aria-labelledby={"or-rub-" + uid}>
        <h4 id={"or-rub-" + uid}>سلم التقييم</h4>
        {model.stale && <p className="or-note" role="note" data-testid="rubric-stale">تغيّر سلم التقييم المنشور منذ التصحيح السابق؛ الاختيارات المحفوظة لم تعد صالحة. اختر المستويات من جديد.</p>}
        {model.rubric.criteria.map((c, i) => {
          const a = awards[c.id];
          const custom = a && "points" in a ? a.points : undefined;
          const name = "or-" + uid + "-" + c.id;
          return (
            <fieldset key={c.id} className="or-grade-criterion" data-done={a !== undefined || undefined} data-testid="rubric-grade-criterion">
              <legend dir="auto">{(i + 1) + ". " + c.title} — {c.maxPoints} نقطة</legend>
              {c.description && <p className="or-hint" dir="auto">{c.description}</p>}
              {c.guidance && <p className="or-private" dir="auto">إرشاد للمصحح: {c.guidance}</p>}
              {c.levels.map(l => (
                <label key={l.id} className="or-level">
                  <input type="radio" name={name} checked={!!a && "levelId" in a && a.levelId === l.id} disabled={disabled} onChange={() => set(c.id, { levelId: l.id })} />
                  <span><strong dir="auto">{l.label}</strong> — {l.points} نقطة{l.description && <small>{l.description}</small>}</span>
                </label>
              ))}
              {c.allowCustomPoints && (
                <label className="or-field"><span>أو درجة وسطية (0 – {c.maxPoints})</span>
                  <input type="number" inputMode="decimal" min={0} max={c.maxPoints} step="any" value={custom ?? ""} disabled={disabled}
                    onChange={e => set(c.id, e.target.value.trim() === "" ? undefined : { points: Number(e.target.value) })} />
                </label>
              )}
            </fieldset>
          );
        })}
        <p className="or-grade-summary" role="status" data-testid="rubric-grade-summary">
          <span>المعايير المصححة: <bdi dir="ltr">{done} / {total}</bdi></span>
          {live && live.ok ? <span>النقاط: <bdi dir="ltr">{live.awarded} / {live.total}</bdi> · الدرجة التقديرية: <bdi dir="ltr">{live.score} / {q.marks}</bdi></span>
            : live && !live.ok ? <span>اختيار غير صالح في أحد المعايير (درجة وسطية خارج الحدود أو بأكثر من منزلتين عشريتين).</span>
            : <span>متبقٍ: {total - done} معيار</span>}
        </p>
        <p className="or-hint">الدرجة الرسمية يحتسبها الخادم من اختياراتك وفق سلم التقييم المنشور عند الحفظ.</p>
      </section>
    </div>
  );
}
