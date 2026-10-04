import { evaluateInlineCloze, inlineClozeBlanks, validateInlineClozeAnswerKey, validateInlineClozeConfig } from "../inlineClozeQuestion";
import "./inlineCloze.css";

// Phase 19A — teacher-side projections for the manual review screen (lazy teacher platform chunk). The passage is shown with each
// student response INLINE, then one row per blank: the student's response, ✓ / ✗, the accepted answers / the correct option
// (teacher only) and the earned parts. Every value is rendered as TEXT (never HTML). Correctness is shown ONLY under a valid
// published contract (the same strict authority the grader uses); an invalid config / key is an explicit manual-review state. The
// official score comes from the server grader; the teacher's manual mark below stays the final authority.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function InlineClozeAnswerView({ answer, answerKey, config }: { answer: unknown; answerKey: unknown; config: unknown }) {
  const values = isObj(answer) && answer.kind === "fields" && isObj(answer.values) ? answer.values : {};
  const cfg = validateInlineClozeConfig(config);
  const evaluated = evaluateInlineCloze(config, answerKey, values);
  const text = (id: string) => (typeof values[id] === "string" ? (values[id] as string) : "");
  if (!cfg.ok) return <div className="cloze-review" data-testid="cloze-review"><p className="cloze-unavailable" role="note" data-testid="cloze-key-invalid">إعداد النص التفاعلي المنشور غير صالح؛ لم يُحتسب أي تصحيح آلي والسؤال بحاجة إلى تصحيح يدوي.</p><pre className="cloze-given">{JSON.stringify(values, null, 2)}</pre></div>;
  const blanks = inlineClozeBlanks(cfg.config);
  const labelOf = (id: string) => { const b = blanks.find(x => x.id === id); const v = text(id); return b && b.control === "dropdown" ? (b.options.find(o => o.id === v)?.label ?? v) : v; };
  let n = 0;
  return (
    <div className="cloze-review" data-testid="cloze-review">
      <p className="cloze-passage" dir="auto">
        {cfg.config.segments.map((s, i) => (s.type === "text" ? <span key={"t" + i} className="cloze-text">{s.text}</span> : <span key={s.id} className="cloze-chip" title={"الفراغ " + ++n}>{labelOf(s.id) || "—"}</span>))}
      </p>
      {!evaluated.ok && <p className="cloze-unavailable" role="note" data-testid="cloze-key-invalid">مفتاح التصحيح لهذا السؤال غير صالح؛ لم يُحتسب أي تصحيح آلي والسؤال بحاجة إلى تصحيح يدوي. {evaluated.issues.map(i => i.message).join(" ")}</p>}
      {evaluated.ok && <p data-testid="cloze-review-parts">الفراغات الصحيحة: {evaluated.correct} / {evaluated.total}</p>}
      <ul className="cloze-review-list" aria-label="نتيجة الفراغات">
        {blanks.map(b => {
          const r = evaluated.ok ? evaluated.results.find(x => x.id === b.id) : undefined;
          return (
            <li key={b.id} className="cloze-review-blank" data-testid="cloze-review-blank" data-ok={r ? String(r.ok) : undefined}>
              <span>{r ? (r.ok ? "✓ " : "✗ ") : ""}الفراغ {b.index} — {b.control === "dropdown" ? "قائمة منسدلة" : "فراغ كتابة"}</span>
              <span>إجابة الطالب: <bdi className="cloze-given">{labelOf(b.id) || "—"}</bdi></span>
              {r && <span>{b.control === "dropdown" ? "الصحيح: " : "المقبول: "}<bdi className="cloze-expected">{r.expected.join(" / ")}</bdi></span>}
              {b.control === "dropdown" && <span>الخيارات: {b.options.map(o => o.label).join("، ")}</span>}
              {r && <span className="iex-visually-hidden">{r.ok ? "(صحيح)" : "(غير صحيح)"}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The private key summarised factually for the teacher (never rendered to a student). */
export function InlineClozeKeySummary({ answerKey, config }: { answerKey: unknown; config: unknown }) {
  const key = validateInlineClozeAnswerKey(answerKey, config);
  if (!key.ok) return <div data-testid="cloze-key-summary"><p className="cloze-unavailable" role="note">مفتاح التصحيح غير صالح — لا تصحيح آلي، مطلوب تصحيح يدوي.</p><ul>{key.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul></div>;
  return <p data-testid="cloze-key-summary">طريقة الاحتساب: {key.key.scoring === "allOrNothing" ? "كل شيء أو لا شيء" : "علامة نسبية لكل فراغ"} · عدد الفراغات: {key.key.parts}</p>;
}
