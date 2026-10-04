import { formatParametricNumber } from "../parametricEngine";
import "./parametric.css";

// Phase 19B — teacher-side view of ONE parametric answer (teacher platform chunk). It shows the EXACT official instance of the
// reviewed attempt as the SERVER regenerated it with the grading authority (assignment-review → parametricReviewInstance): the
// rendered stem, the generated values, the student's answer, the authoritative expected value and the audit identity (generator
// version, attempt, question key, seed digest). It never regenerates anything client-side and never uses a preview seed. Every
// value is rendered as TEXT. An instance the server could not regenerate is an explicit manual-review state.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
type Instance = { generatorVersion: number; seedDigest: string; identity: { attemptNumber: number; questionKey: string }; values: Record<string, number>; text: string; expected: number };
function readInstance(raw: unknown): Instance | null {
  if (!isObj(raw) || raw.ok !== true || !isObj(raw.values) || !isObj(raw.identity) || typeof raw.text !== "string" || typeof raw.expected !== "number" || typeof raw.seedDigest !== "string" || typeof raw.generatorVersion !== "number") return null;
  const values: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.values)) if (typeof v === "number") values[k] = v;
  return { generatorVersion: raw.generatorVersion, seedDigest: raw.seedDigest, identity: { attemptNumber: Number(raw.identity.attemptNumber), questionKey: String(raw.identity.questionKey ?? "") }, values, text: raw.text, expected: raw.expected };
}

export function ParametricAnswerView({ instance, answer }: { instance: unknown; answer: unknown }) {
  const inst = readInstance(instance);
  const given = isObj(answer) && answer.kind === "numeric" ? String(answer.value ?? "") + (typeof answer.unit === "string" && answer.unit ? " " + answer.unit : "") : "";
  if (!inst) {
    const message = isObj(instance) && typeof instance.message === "string" ? instance.message : "";
    return <div className="param-review" data-testid="param-review"><p className="param-unavailable" role="note" data-testid="param-review-unavailable">لم يُحتسب تصحيح آلي لهذا السؤال — السؤال بحاجة إلى تصحيح يدوي. {message}</p><p>إجابة الطالب: <bdi dir="ltr">{given || "—"}</bdi></p></div>;
  }
  return (
    <div className="param-review" data-testid="param-review">
      <p dir="auto">{inst.text}</p>
      <p dir="ltr" data-testid="param-review-values">{Object.entries(inst.values).map(([k, v]) => k + " = " + formatParametricNumber(v)).join(", ")}</p>
      <p>إجابة الطالب: <bdi dir="ltr">{given || "—"}</bdi></p>
      <p data-testid="param-review-expected">الإجابة الصحيحة المحسوبة لهذه المحاولة: <bdi dir="ltr">{formatParametricNumber(inst.expected)}</bdi></p>
      <p className="param-review-audit" data-testid="param-review-audit">مولّد القيم: الإصدار {inst.generatorVersion} · المحاولة {inst.identity.attemptNumber} · السؤال <bdi dir="ltr">{inst.identity.questionKey}</bdi> · بصمة التوليد <bdi dir="ltr">{inst.seedDigest}</bdi></p>
    </div>
  );
}
