import { useContext, useId, useMemo } from "react";
import type { StudentRendererProps } from "../questionTypes/registryTypes";
import { OPEN_RESPONSE_PROFILE_LABELS, readOpenResponseStudentConfig } from "../openResponseQuestion";
import { TeacherPreviewContext } from "../questionTypes/studentAttemptContext";
import "./openResponse.css";

// Phase 19E — openResponse@1 student view (student exam AND the teacher's in-editor student preview). It reads ONLY the strict delivered
// shape (`readOpenResponseStudentConfig`: canonical config + an optional well-formed public rubric) and emits the EXISTING text Answer
// `{ kind: "text", value }` through onAnswer — the existing autosave / restore / pause / submit pipeline persists it. The text is
// plain and verbatim (no HTML is ever interpreted), its direction follows the writer (`dir="auto"`, Arabic / Hebrew / English), and
// `maxChars` is the hard bound (the browser stops input there; the server refuses longer text). `minChars` is guidance only: it never
// blocks saving or submission. Nothing here knows the private rubric guidance, the model answer or any grade.
const countWords = (v: string) => { const t = v.trim(); return t ? t.split(/\s+/u).length : 0; };

export default function OpenResponseView({ q, answer, onAnswer, disabled, textId }: StudentRendererProps) {
  const cfg = useMemo(() => readOpenResponseStudentConfig((q as { openResponse?: unknown }).openResponse), [q]);
  const preview = useContext(TeacherPreviewContext);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cfg) return <p className="or-unavailable" role="note" data-testid="open-response-unavailable">إعداد هذا السؤال غير متوفر بصيغة صالحة؛ أبلغ معلّمك.</p>;

  const value = answer?.kind === "text" && typeof answer.value === "string" ? answer.value : "";
  const { minChars, maxChars } = cfg.response;
  const chars = value.length, words = countWords(value), full = chars >= maxChars;
  const ids = { hint: "or-hint-" + uid, count: "or-count-" + uid, status: "or-status-" + uid, instructions: "or-ins-" + uid };
  const set = (next: string) => { if (!disabled) onAnswer({ kind: "text", value: next }); };
  const rubric = cfg.publicRubric;

  return (
    <div className="or-response" data-testid="open-response">
      {preview && <p className="or-note" data-testid="open-response-preview-note">معاينة المعلم: هذا ما يراه الطالب؛ لا تُحفظ الإجابات هنا.{cfg.studentRubricVisibility === "visible" && !rubric ? " سيظهر سلم التقييم للطالب هنا عند النشر." : ""}</p>}
      <span className="or-profile">{OPEN_RESPONSE_PROFILE_LABELS[cfg.profile]}</span>
      {cfg.instructions.trim() !== "" && <p className="or-instructions" id={ids.instructions} dir="auto" data-testid="open-response-instructions">{cfg.instructions}</p>}
      <textarea className="or-textarea" dir="auto" rows={10} value={value} maxLength={maxChars} disabled={disabled}
        aria-labelledby={textId} aria-label={textId ? undefined : "إجابتك"}
        aria-describedby={[cfg.instructions.trim() ? ids.instructions : "", ids.hint, ids.count].filter(Boolean).join(" ")}
        placeholder="اكتب إجابتك هنا…" spellCheck data-testid="open-response-input"
        onChange={e => set(e.target.value)} />
      <p className="or-hint" id={ids.hint}>
        {"الحد الأقصى " + maxChars + " حرفًا."}
        {minChars > 0 ? " يُنصح بألّا تقل الإجابة عن " + minChars + " حرفًا (إرشاد فقط، لا يمنع التسليم)." : ""}
      </p>
      <p className="or-meta" id={ids.count} aria-live="off" data-testid="open-response-count">
        <span data-full={full || undefined}><bdi dir="ltr">{chars} / {maxChars}</bdi> حرفًا</span>
        <span><bdi dir="ltr">{words}</bdi> كلمة</span>
      </p>
      <p className="or-sr-status" id={ids.status} role="status" data-testid="open-response-limit-status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {full ? "وصلت إلى الحد الأقصى لعدد الأحرف." : ""}
      </p>
      {rubric && (
        <details className="or-rubric" data-testid="open-response-rubric">
          <summary>سلم التقييم ({rubric.totalPoints} نقطة)</summary>
          <ul className="or-rubric-list">
            {rubric.criteria.map((c, i) => (
              <li key={i} className="or-rubric-criterion">
                <h4 dir="auto">{c.title} — {c.maxPoints} نقطة</h4>
                {c.description && <p dir="auto">{c.description}</p>}
                <ul className="or-rubric-levels">
                  {c.levels.map((l, j) => <li key={j} dir="auto"><strong>{l.label}</strong> ({l.points}){l.description ? ": " + l.description : ""}</li>)}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
