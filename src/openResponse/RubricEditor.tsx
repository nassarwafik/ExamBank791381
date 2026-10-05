import { useId, type ReactNode } from "react";
import { defaultRubric, type RubricCriterion, type RubricLevel, type RubricV1 } from "../rubricEngine";

// Phase 19E — the reusable, domain-neutral RUBRIC authoring control (lazy, inside the openResponse editor today; any manual type can host
// it later). Criteria and levels are edited in place: add / remove / reorder (buttons, never drag-only), titles, public descriptions,
// PRIVATE grading guidance, max points, the explicit "custom points allowed" flag and level labels / points / descriptions. Ids are
// stable generated keys that never encode meaning or order. Nothing here validates or repairs: the canonical engine validator runs in
// the host and every issue is shown next to its field (aria-invalid + aria-describedby).
export type FieldIssue = { id: string; message: string } | undefined;
type Props = { rubric: RubricV1; onChange: (next: RubricV1) => void; disabled?: boolean; issueAt: (path: string) => FieldIssue };

const nextId = (taken: { id: string }[], prefix: string) => { let n = taken.length + 1; const ids = new Set(taken.map(t => t.id)); while (ids.has(prefix + n)) n++; return prefix + n; };
const num = (v: string) => (v.trim() === "" ? (null as unknown as number) : Number(v));
const move = <T,>(list: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= list.length) return list; const next = list.slice(); [next[i], next[j]] = [next[j], next[i]]; return next; };

// The error sits OUTSIDE the <label> (so it never becomes part of the control's accessible name) and is linked by aria-describedby.
function Field({ label, issue, children }: { label: string; issue: FieldIssue; children: (a11y: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode }) {
  const id = "or-f-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div className="or-field">
      <label htmlFor={id}>{label}</label>
      {children({ id, ...(issue ? { "aria-invalid": true as const, "aria-describedby": issue.id } : {}) })}
      {issue && <p className="or-field-error" id={issue.id}>{issue.message}</p>}
    </div>
  );
}

export default function RubricEditor({ rubric, onChange, disabled, issueAt }: Props) {
  const criteria = rubric.criteria;
  const setCriteria = (next: RubricCriterion[]) => onChange({ v: 1, criteria: next });
  const setCriterion = (i: number, patch: Partial<RubricCriterion>) => setCriteria(criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setLevel = (i: number, k: number, patch: Partial<RubricLevel>) => setCriterion(i, { levels: criteria[i].levels.map((l, j) => (j === k ? { ...l, ...patch } : l)) });
  const addCriterion = () => setCriteria([...criteria, { id: nextId(criteria, "c"), title: "", description: "", maxPoints: 2, allowCustomPoints: false, guidance: "", levels: [{ id: "l1", label: "كامل", points: 2, description: "" }, { id: "l2", label: "غير موجود", points: 0, description: "" }] }]);
  const total = criteria.reduce((s, c) => s + (Number.isFinite(c.maxPoints) ? c.maxPoints : 0), 0);
  const base = "answer.rubric.criteria";
  const listIssue = issueAt(base) ?? issueAt("answer.rubric");

  return (
    <div className="or-rubric-editor" data-testid="rubric-editor">
      {criteria.length === 0 && (
        <div className="or-note" data-testid="rubric-empty">
          لا يوجد سلم تقييم بعد. ابدأ بالسلم المقترح (المحتوى 4، التعليل 3، التنظيم 2، المصطلحات 1) ثم عدّله، أو أضف معاييرك.
          <div className="or-actions"><button type="button" className="or-btn" data-primary="true" disabled={disabled} onClick={() => onChange(defaultRubric())}>استخدام سلم التقييم المقترح</button></div>
        </div>
      )}
      {listIssue && <p className="or-field-error" id={listIssue.id}>{listIssue.message}</p>}
      <ol className="or-levels" aria-label="معايير سلم التقييم">
        {criteria.map((c, i) => {
          const p = base + "." + i;
          return (
            <li key={c.id} className="or-criterion" data-testid="rubric-criterion">
              <div className="or-criterion-head">
                <strong>المعيار {i + 1}</strong>
                <div className="or-actions">
                  <button type="button" className="or-btn" disabled={disabled || i === 0} aria-label={"نقل المعيار " + (i + 1) + " للأعلى"} onClick={() => setCriteria(move(criteria, i, -1))}>↑</button>
                  <button type="button" className="or-btn" disabled={disabled || i === criteria.length - 1} aria-label={"نقل المعيار " + (i + 1) + " للأسفل"} onClick={() => setCriteria(move(criteria, i, 1))}>↓</button>
                  <button type="button" className="or-btn" disabled={disabled} aria-label={"حذف المعيار " + (i + 1)} onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}>×</button>
                </div>
              </div>
              {issueAt(p) && <p className="or-field-error" id={issueAt(p)!.id}>{issueAt(p)!.message}</p>}
              <div className="or-row">
                <Field label={"عنوان المعيار " + (i + 1)} issue={issueAt(p + ".title")}>{a => <input {...a} dir="auto" value={c.title} disabled={disabled} onChange={e => setCriterion(i, { title: e.target.value })} placeholder="مثال: الدقة العلمية" />}</Field>
                <Field label={"الدرجة القصوى للمعيار " + (i + 1)} issue={issueAt(p + ".maxPoints")}>{a => <input {...a} type="number" inputMode="decimal" min={0} step="any" value={Number.isFinite(c.maxPoints) ? c.maxPoints : ""} disabled={disabled} onChange={e => setCriterion(i, { maxPoints: num(e.target.value) })} />}</Field>
              </div>
              <Field label={"وصف المعيار " + (i + 1) + " (يظهر للطالب إن كان السلم ظاهرًا)"} issue={issueAt(p + ".description")}>{a => <textarea {...a} dir="auto" value={c.description} disabled={disabled} onChange={e => setCriterion(i, { description: e.target.value })} />}</Field>
              <Field label={"إرشاد خاص بالمصحح للمعيار " + (i + 1) + " (لا يراه الطالب أبدًا)"} issue={issueAt(p + ".guidance")}>{a => <textarea {...a} dir="auto" value={c.guidance} disabled={disabled} onChange={e => setCriterion(i, { guidance: e.target.value })} />}</Field>
              <label className="or-actions"><input type="checkbox" checked={c.allowCustomPoints} disabled={disabled} onChange={e => setCriterion(i, { allowCustomPoints: e.target.checked })} /> السماح للمصحح بإدخال درجة وسطية لهذا المعيار (بين 0 والدرجة القصوى)</label>
              {issueAt(p + ".levels") && <p className="or-field-error" id={issueAt(p + ".levels")!.id}>{issueAt(p + ".levels")!.message}</p>}
              <ul className="or-levels" aria-label={"مستويات المعيار " + (i + 1)}>
                {c.levels.map((l, k) => {
                  const lp = p + ".levels." + k;
                  return (
                    <li key={l.id} className="or-level-row" data-testid="rubric-level">
                      <Field label={"اسم المستوى " + (k + 1)} issue={issueAt(lp + ".label") ?? issueAt(lp)}>{a => <input {...a} dir="auto" value={l.label} disabled={disabled} onChange={e => setLevel(i, k, { label: e.target.value })} />}</Field>
                      <Field label={"درجة المستوى " + (k + 1)} issue={issueAt(lp + ".points")}>{a => <input {...a} type="number" inputMode="decimal" min={0} step="any" value={Number.isFinite(l.points) ? l.points : ""} disabled={disabled} onChange={e => setLevel(i, k, { points: num(e.target.value) })} />}</Field>
                      <Field label={"وصف المستوى " + (k + 1)} issue={issueAt(lp + ".description")}>{a => <input {...a} dir="auto" value={l.description} disabled={disabled} onChange={e => setLevel(i, k, { description: e.target.value })} />}</Field>
                      <div className="or-actions">
                        <button type="button" className="or-btn" disabled={disabled || k === 0} aria-label={"نقل المستوى " + (k + 1) + " للأعلى"} onClick={() => setCriterion(i, { levels: move(c.levels, k, -1) })}>↑</button>
                        <button type="button" className="or-btn" disabled={disabled || c.levels.length <= 2} aria-label={"حذف المستوى " + (k + 1) + " من المعيار " + (i + 1)} onClick={() => setCriterion(i, { levels: c.levels.filter((_, j) => j !== k) })}>×</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="or-actions"><button type="button" className="or-btn" disabled={disabled || c.levels.length >= 8} onClick={() => setCriterion(i, { levels: [...c.levels, { id: nextId(c.levels, "l"), label: "", points: null as unknown as number, description: "" }] })}>+ مستوى</button></div>
            </li>
          );
        })}
      </ol>
      <div className="or-actions"><button type="button" className="or-btn" disabled={disabled || criteria.length >= 12} onClick={addCriterion}>+ معيار</button></div>
      <p className="or-total" data-testid="rubric-total">مجموع نقاط السلم: <bdi dir="ltr">{Number(total.toFixed(2))}</bdi></p>
    </div>
  );
}
