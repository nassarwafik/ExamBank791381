import type { BuilderQuestion } from "../examTypes";

// Phase 21F.4 — a collapsed Studio card: the question as the student reads it, with the answer key marked for the teacher. Pure,
// read-only and cheap (no student runtime, no lazy chunk): the families teachers use most get a faithful summary; every other
// family shows its prompt and a note, and opens to its full editor. The key is read from the teacher's own exam data only.

const optionText = (o: { text?: string; label?: string; value?: string } | undefined) => (o ? o.text || o.label || o.value || "" : "");

/** The image the card shows as a thumbnail (the first visible asset with a URL). */
function thumbnailOf(q: BuilderQuestion): string | null {
  const img = q.image;
  if (!img || img.visible === false) return null;
  const asset = (img.assets || []).find(a => typeof a?.dataUrl === "string" && a.dataUrl);
  return asset?.dataUrl ?? null;
}

function Options({ q, correct }: { q: BuilderQuestion; correct: (index: number, id?: string) => boolean }) {
  const opts = q.options || [];
  if (!opts.length) return <p className="st-summary-note">لا توجد خيارات بعد.</p>;
  return (
    <ul className="st-opts">
      {opts.map((o, i) => {
        const ok = correct(i, o.id);
        return (
          <li key={o.id ?? i} className={"st-opt" + (ok ? " is-correct" : "")}>
            <span className="st-opt-b" aria-hidden="true">{ok ? "✓" : i + 1}</span>
            <span>{optionText(o) || <em>خيار فارغ</em>}</span>
            {ok && <span className="st-visually-hidden"> (الإجابة الصحيحة)</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Body({ q }: { q: BuilderQuestion }) {
  const a = (q.answer || {}) as Record<string, unknown>;
  switch (q.presentationType) {
    case "multipleChoice":
      return <Options q={q} correct={i => a.correctOptionIndex === i} />;
    case "multipleSelect": {
      const ids = Array.isArray(a.correctOptionIds) ? (a.correctOptionIds as unknown[]) : [];
      return <Options q={q} correct={(_, id) => !!id && ids.includes(id)} />;
    }
    case "trueFalse":
      return (
        <div className="st-pills">
          <span className={"st-pill" + (a.correct === true ? " is-correct" : "")}>صح{a.correct === true && <span className="st-visually-hidden"> (الإجابة الصحيحة)</span>}</span>
          <span className={"st-pill" + (a.correct === false ? " is-correct" : "")}>خطأ{a.correct === false && <span className="st-visually-hidden"> (الإجابة الصحيحة)</span>}</span>
        </div>
      );
    case "multiTrueFalse":
      return (
        <ul className="st-pairs">
          {(q.fields || []).map(f => <li key={f.id}><span>{f.statement || f.label || "عبارة"}</span><span className="st-arrow" aria-hidden="true">←</span><b>{f.correct === true ? "صح" : f.correct === false ? "خطأ" : "—"}</b></li>)}
        </ul>
      );
    case "matching":
    case "fillBlank":
    case "wordBank":
      return (q.fields || []).length ? (
        <ul className="st-pairs">
          {(q.fields || []).map(f => <li key={f.id}><span>{f.label || "فراغ"}</span><span className="st-arrow" aria-hidden="true">←</span><b>{typeof f.correct === "string" && f.correct ? f.correct : "—"}</b></li>)}
        </ul>
      ) : <p className="st-summary-note">لم تُضف عناصر بعد.</p>;
    case "ordering":
      return (q.options || []).length ? <ol className="st-pairs">{(q.options || []).map((o, i) => <li key={o.id ?? i}>{optionText(o)}</li>)}</ol> : <p className="st-summary-note">لم تُضف عناصر بعد.</p>;
    case "numericResponse":
      return <p className="st-summary-note">الإجابة: <b dir="ltr">{String(a.expected ?? "—")}</b>{typeof a.tolerance === "number" && a.tolerance > 0 ? <> ± <span dir="ltr">{a.tolerance}</span></> : null}</p>;
    case "shortAnswer":
    case "openResponse":
      return <div className="st-lines" aria-hidden="true"><i /><i /></div>;
    default:
      return <p className="st-summary-note">افتح البطاقة لعرض تفاصيل هذا النوع وتحريرها.</p>;
  }
}

export default function QuestionSummary({ question }: { question: BuilderQuestion }) {
  const thumb = thumbnailOf(question);
  return (
    <div className="st-summary">
      {thumb && <img className="st-thumb" src={thumb} alt="" />}
      <Body q={question} />
    </div>
  );
}
