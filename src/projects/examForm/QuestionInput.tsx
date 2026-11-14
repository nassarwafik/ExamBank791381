// Phase F2-UI — the input of one question of the project exam form, by kind. Every input is a native control with a
// visible label; the question's own text is the group's legend (ExamFormQuestionBlock in StudentExamForm.tsx). Technical
// text (commands, addresses) is typed left-to-right. Image and file questions are shown with a notice: their inputs arrive
// in a later phase and they never block a submit.
import type { ExamFormAnswer, ExamFormEntry, ExamFormQuestion } from "./types";

type Props = {
  question: ExamFormQuestion;
  answer: ExamFormAnswer | undefined;
  disabled: boolean;
  onChange: (answer: ExamFormAnswer | null) => void;
};

const DEFERRED_TEXT: Record<string, string> = {
  image: "هذا السؤال يحتاج صورة. إرفاق الصور سيتاح قريبًا، وهذا السؤال لا يمنع التسليم الآن.",
  file: "هذا السؤال يحتاج ملفًا. إرفاق الملفات سيتاح قريبًا، وهذا السؤال لا يمنع التسليم الآن."
};
const entries = (list: ExamFormEntry[] | undefined) => list || [];
const emptyRow = (question: ExamFormQuestion) => Object.fromEntries((question.columns || []).map(c => [c.id, ""]));

function TableInput({ question, answer, disabled, onChange }: Props) {
  const columns = question.columns || [];
  const minRows = question.minRows || 1, maxRows = question.maxRows || minRows;
  const stored = answer?.rows || [];
  // The table always offers at least its minimum rows; empty rows are not stored by the server.
  const rows = stored.length >= minRows ? stored : [...stored, ...Array.from({ length: minRows - stored.length }, () => emptyRow(question))];
  const write = (next: Record<string, string>[]) => onChange({ rows: next });
  const setCell = (rowIndex: number, columnId: string, value: string) => write(rows.map((row, i) => (i === rowIndex ? { ...row, [columnId]: value } : row)));
  return (
    <div className="eb-sp-form-table-wrap">
      <table className="eb-sp-form-table">
        <thead>
          <tr>{columns.map(c => <th key={c.id} scope="col">{c.title}</th>)}<th scope="col"><span className="eb-visually-hidden">إجراء</span></th></tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map(c => (
                <td key={c.id} data-label={c.title}>
                  <input type="text" className="eb-sp-form-cell" dir="auto" maxLength={300} disabled={disabled} value={row[c.id] || ""}
                    aria-label={c.title + " — الصف " + (rowIndex + 1)} onChange={e => setCell(rowIndex, c.id, e.target.value)} />
                </td>
              ))}
              <td>
                {!disabled && rows.length > minRows && (
                  <button type="button" className="eb-button is-small is-quiet" aria-label={"حذف الصف " + (rowIndex + 1)} onClick={() => write(rows.filter((_, i) => i !== rowIndex))}>حذف</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && rows.length < maxRows && <button type="button" className="eb-button is-small" onClick={() => write([...rows, emptyRow(question)])}>إضافة صف</button>}
    </div>
  );
}

function OrderingInput({ question, answer, disabled, onChange }: Props) {
  const items = entries(question.items);
  const byId = new Map(items.map(i => [i.id, i]));
  const order = answer?.order && answer.order.length === items.length ? answer.order : items.map(i => i.id);
  const move = (index: number, delta: number) => {
    const next = order.slice();
    const [id] = next.splice(index, 1);
    next.splice(index + delta, 0, id);
    onChange({ order: next });
  };
  return (
    <div className="eb-sp-form-order">
      <ol className="eb-sp-form-order-list">
        {order.map((id, index) => (
          <li key={id} className="eb-sp-form-order-item">
            <span className="eb-sp-form-order-text">{byId.get(id)?.text || id}</span>
            {!disabled && (
              <span className="eb-sp-form-order-actions">
                <button type="button" className="eb-button is-small is-quiet" disabled={index === 0} aria-label={"تقديم: " + (byId.get(id)?.text || id)} onClick={() => move(index, -1)}>أعلى</button>
                <button type="button" className="eb-button is-small is-quiet" disabled={index === order.length - 1} aria-label={"تأخير: " + (byId.get(id)?.text || id)} onClick={() => move(index, 1)}>أسفل</button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {!answer?.order && !disabled && (
        <p className="eb-sp-form-order-confirm">
          <span className="eb-muted">لم تعتمد ترتيبًا بعد.</span>
          <button type="button" className="eb-button is-small" onClick={() => onChange({ order })}>اعتمد هذا الترتيب</button>
        </p>
      )}
    </div>
  );
}

export default function QuestionInput(props: Props) {
  const { question, answer, disabled, onChange } = props;
  const name = "eb-form-" + question.questionId;

  switch (question.kind) {
    case "shortText":
      return <input type="text" className="eb-sp-form-text" dir="auto" maxLength={question.maxLength} disabled={disabled} value={answer?.text || ""}
        aria-label="إجابتك" onChange={e => onChange({ text: e.target.value })} />;
    case "paragraph":
      return <textarea className="eb-sp-form-text eb-sp-form-paragraph" dir="auto" rows={4} maxLength={question.maxLength} disabled={disabled} value={answer?.text || ""}
        aria-label="إجابتك" onChange={e => onChange({ text: e.target.value })} />;
    case "cli":
      return (
        <>
          <textarea className="eb-sp-form-text eb-sp-form-cli" dir="ltr" rows={8} spellCheck={false} maxLength={question.maxLength} disabled={disabled} value={answer?.text || ""}
            aria-label="الأوامر أو المخرجات" onChange={e => onChange({ text: e.target.value })} />
          {question.images && <p className="eb-sp-form-deferred">إرفاق الصورة المطلوبة هنا سيتاح قريبًا. اكتب الآن النص فقط.</p>}
        </>
      );
    case "table":
      return <TableInput {...props} />;
    case "choice":
      return (
        <div className="eb-sp-form-options">
          {entries(question.options).map(o => (
            <label key={o.id} className="eb-sp-form-option">
              <input type="radio" name={name} disabled={disabled} checked={answer?.optionId === o.id}
                onChange={() => onChange({ optionId: o.id, ...(answer?.justification ? { justification: answer.justification } : {}) })} />
              <span dir="auto">{o.text}</span>
            </label>
          ))}
          {question.justification && (
            <label className="eb-sp-form-justify">
              <span>برّر جوابك</span>
              <textarea className="eb-sp-form-text" dir="auto" rows={3} maxLength={1000} disabled={disabled} value={answer?.justification || ""}
                onChange={e => onChange({ optionId: answer?.optionId ?? null, justification: e.target.value })} />
            </label>
          )}
        </div>
      );
    case "multiChoice": {
      const chosen = new Set(answer?.optionIds || []);
      return (
        <div className="eb-sp-form-options">
          {entries(question.options).map(o => (
            <label key={o.id} className="eb-sp-form-option">
              <input type="checkbox" disabled={disabled} checked={chosen.has(o.id)}
                onChange={e => { const next = new Set(chosen); if (e.target.checked) next.add(o.id); else next.delete(o.id); onChange({ optionIds: [...next] }); }} />
              <span dir="auto">{o.text}</span>
            </label>
          ))}
        </div>
      );
    }
    case "matching": {
      const pairs = answer?.pairs || {};
      return (
        <div className="eb-sp-form-match">
          {entries(question.left).map(l => (
            <label key={l.id} className="eb-sp-form-match-row">
              <span className="eb-sp-form-match-left" dir="auto">{l.text}</span>
              <select className="eb-sp-form-select" disabled={disabled} value={pairs[l.id] || ""}
                onChange={e => { const next = { ...pairs }; if (e.target.value) next[l.id] = e.target.value; else delete next[l.id]; onChange({ pairs: next }); }}>
                <option value="">اختر…</option>
                {entries(question.right).map(r => <option key={r.id} value={r.id}>{r.text}</option>)}
              </select>
            </label>
          ))}
        </div>
      );
    }
    case "ordering":
      return <OrderingInput {...props} />;
    case "scale": {
      const values = answer?.values || {};
      const min = question.min ?? 1, max = question.max ?? 5;
      const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div className="eb-sp-form-scale">
          {entries(question.items).map(item => (
            <fieldset key={item.id} className="eb-sp-form-scale-row" disabled={disabled}>
              <legend dir="auto">{item.text}</legend>
              {steps.map(step => (
                <label key={step} className="eb-sp-form-scale-step">
                  <input type="radio" name={name + "-" + item.id} checked={values[item.id] === step} onChange={() => onChange({ values: { ...values, [item.id]: step } })} />
                  <span dir="ltr">{step}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      );
    }
    case "checklist": {
      const checked = new Set(answer?.checked || []);
      return (
        <div className="eb-sp-form-options">
          {entries(question.items).map(item => (
            <label key={item.id} className="eb-sp-form-option">
              <input type="checkbox" disabled={disabled} checked={checked.has(item.id)}
                onChange={e => { const next = new Set(checked); if (e.target.checked) next.add(item.id); else next.delete(item.id); onChange({ checked: [...next] }); }} />
              <span>{item.text}</span>
            </label>
          ))}
        </div>
      );
    }
    case "declaration":
      return (
        <label className="eb-sp-form-option">
          <input type="checkbox" disabled={disabled} checked={answer?.accepted === true} onChange={e => onChange(e.target.checked ? { accepted: true } : null)} />
          <span>أوافق</span>
        </label>
      );
    default:
      return <p className="eb-sp-form-deferred">{DEFERRED_TEXT[question.kind] || "هذا النوع من الأسئلة غير متاح بعد."}</p>;
  }
}
