import { useContext, useMemo } from "react";
import type { StudentRendererProps } from "../registryTypes";
import { previewParametricSample, readParametricStudentProjection, validateParametricNumericConfig, type ParametricResponsePresentation } from "../../parametricNumericQuestion";
import { TeacherPreviewContext } from "../studentAttemptContext";
import "../../parametric/parametric.css";

// Phase 19B — parametricNumeric@1 student renderer (lazy). ONE component for the student exam AND the teacher preview:
//   • student: reads ONLY the strict per-attempt projection the server delivered (the stem above is already rendered with this
//     attempt's values); a numeric input (Arabic / English digits accepted by the grader) and, when required, a unit input or a
//     fixed unit label; emits the existing numeric Answer { kind: "numeric", value, unit? } through onAnswer — the EXISTING autosave /
//     restore / pause / submit pipeline persists it. Nothing here knows the answer expression or the correct value.
//   • teacher preview (TeacherPreviewContext): the authored config is turned into a PREVIEW-namespace sample (never an official
//     seed, never the private key) so the teacher sees how a generated stem looks.
export default function ParametricNumericResponse({ q, answer, onAnswer, disabled, labelPrefix }: StudentRendererProps) {
  const preview = useContext(TeacherPreviewContext);
  const raw = (q as { parametric?: unknown }).parametric;
  const projection = useMemo(() => readParametricStudentProjection(raw), [raw]);
  const sample = useMemo(() => {
    if (!preview || projection) return null;
    const cfg = validateParametricNumericConfig(raw);
    if (!cfg.ok) return null;
    const s = previewParametricSample({ ...(q as unknown as Record<string, unknown>), answer: undefined }, 1);
    return s.ok ? { text: s.text, response: cfg.config.response } : null;
  }, [preview, projection, raw, q]);
  const response: ParametricResponsePresentation | null = projection && projection.status === "ready" ? projection.response : sample ? sample.response : null;
  if (!response) return <p className="param-unavailable" role="note" data-testid="param-unavailable">تعذّر تجهيز قيم هذا السؤال؛ أبلغ معلّمك.</p>;

  const value = answer?.kind === "numeric" ? answer.value : "", unit = answer?.kind === "numeric" ? answer.unit ?? "" : "";
  const unitInput = response.unit === "input";
  const emit = (v: string, u: string) => { if (!disabled) onAnswer(unitInput ? { kind: "numeric", value: v, unit: u } : { kind: "numeric", value: v }); };
  return (
    <div className="iex-numeric param-response" data-testid="param-response">
      {sample && <p className="param-note" data-testid="param-preview-note">معاينة المعلم: قيم نموذجية من عينة معاينة؛ يحصل كل طالب على قيمه الخاصة في كل محاولة، ولا تُحفظ الإجابات هنا.</p>}
      {sample && <p className="param-preview-text" dir="auto" data-testid="param-preview-text">{sample.text}</p>}
      <label className="iex-numeric-field"><span>القيمة</span><input className="iex-cell iex-numeric-input" inputMode="decimal" autoComplete="off" aria-label={labelPrefix + " — القيمة"} value={value} onChange={e => emit(e.target.value, unit)} placeholder="اكتب القيمة العددية" disabled={disabled} dir="ltr" /></label>
      {unitInput && <label className="iex-numeric-field"><span>الوحدة</span><input className="iex-cell iex-numeric-unit" autoComplete="off" aria-label={labelPrefix + " — الوحدة"} value={unit} onChange={e => emit(value, e.target.value)} placeholder="الوحدة" disabled={disabled} dir="ltr" /></label>}
      {response.unit === "label" && <span className="param-unit" data-testid="param-unit-label">{response.label}</span>}
    </div>
  );
}
