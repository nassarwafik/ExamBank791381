import { useContext, useMemo } from "react";
import type { StudentRendererProps } from "../registryTypes";
import { INLINE_CLOZE_LIMITS, projectInlineClozeConfigForStudent } from "../../inlineClozeQuestion";
import { TeacherPreviewContext } from "../studentAttemptContext";
import "../../inlineCloze/inlineCloze.css";

// Phase 19A — inlineCloze@1 student renderer (lazy). ONE component for the student exam AND the teacher preview. It reads ONLY the
// strict public projection of `q.inlineCloze` (a malformed config is never rendered as a working passage), renders the passage in
// its natural reading flow with the response controls INLINE (a text input or a dropdown per blank, in passage order), and emits
// the existing `fields` Answer `{ kind: "fields", values: { <blankId>: text | optionId } }` through onAnswer — the EXISTING
// autosave / restore / pause / submit pipeline persists it. Nothing here knows an accepted answer or the correct option.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Width follows the student's OWN text (never the key): 6ch … 24ch, and CSS caps it at the line width on narrow screens. */
const widthFor = (value: string) => Math.min(24, Math.max(6, value.length + 2)) + "ch";

export default function InlineClozeResponse({ q, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const cfg = useMemo(() => projectInlineClozeConfigForStudent((q as { inlineCloze?: unknown }).inlineCloze), [q]);
  const preview = useContext(TeacherPreviewContext);
  if (!cfg) return <p className="cloze-unavailable" role="note" data-testid="cloze-unavailable">إعداد هذا السؤال غير متوفر بصيغة صالحة؛ لا يمكن عرض النص التفاعلي. أبلغ معلّمك.</p>;

  const stored: Record<string, string> = {};
  if (answer?.kind === "fields" && isObj(answer.values)) for (const [k, v] of Object.entries(answer.values)) if (typeof v === "string") stored[k] = v;
  const set = (id: string, value: string) => { if (!disabled) onAnswer({ kind: "fields", values: { ...stored, [id]: value } }); };

  let n = 0;
  return (
    <div className="cloze" data-testid="cloze-response">
      {preview && <p className="cloze-note" data-testid="cloze-preview-note">معاينة المعلم: هذا هو النص كما يراه الطالب؛ لا تُحفظ الإجابات هنا.</p>}
      <p className="cloze-passage" dir="auto" role="group" aria-label={labelPrefix} data-testid="cloze-passage">
        {cfg.segments.map((s, i) => {
          if (s.type === "text") return <span key={"t" + i} className="cloze-text">{s.text}</span>;
          const index = ++n;
          const value = stored[s.id] ?? "";
          if (s.control === "dropdown") {
            return (
              <span key={s.id} className="cloze-blank">
                <select className="cloze-select" dir="auto" aria-label={"الفراغ " + index} value={value} data-chosen={value !== "" || undefined} disabled={disabled} onChange={e => set(s.id, e.target.value)}>
                  <option value="">اختر…</option>
                  {s.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </span>
            );
          }
          return (
            <span key={s.id} className="cloze-blank">
              <input type="text" className="cloze-input" dir="auto" aria-label={"الفراغ " + index} value={value} maxLength={INLINE_CLOZE_LIMITS.responseChars}
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} style={{ width: widthFor(value) }} disabled={disabled}
                onChange={e => set(s.id, e.target.value)} />
            </span>
          );
        })}
      </p>
    </div>
  );
}
