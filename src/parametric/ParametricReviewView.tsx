import { formatParametricNumber } from "../parametricEngine";
import "./parametric.css";

// Phase 19B — teacher-side view of ONE parametric answer (teacher platform chunk). It shows the EXACT official instance of the
// reviewed attempt as the SERVER regenerated it with the grading authority (assignment-review → parametricReviewInstance): the
// rendered stem, the generated values, the student's answer, the authoritative expected value and the audit identity (generator
// version, attempt, question key, seed digest). It never regenerates anything client-side and never uses a preview seed. Every
// value is rendered as TEXT. An instance the server could not regenerate is an explicit manual-review state.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
type Check = { source: string; left: number | null; right: number | null; holds: boolean };
type Instance = { generatorVersion: number; seedDigest: string; identity: { attemptNumber: number; questionKey: string }; values: Record<string, number>; text: string; expected: number; derived: Record<string, number>; constraints: Check[] };
const numbers = (raw: unknown): Record<string, number> => { const out: Record<string, number> = {}; if (isObj(raw)) for (const [k, v] of Object.entries(raw)) if (typeof v === "number") out[k] = v; return out; };
const checks = (raw: unknown): Check[] => (Array.isArray(raw) ? raw.filter(isObj).map(c => ({ source: String(c.source ?? ""), left: typeof c.left === "number" ? c.left : null, right: typeof c.right === "number" ? c.right : null, holds: c.holds === true })) : []);
function readInstance(raw: unknown): Instance | null {
  if (!isObj(raw) || raw.ok !== true || !isObj(raw.values) || !isObj(raw.identity) || typeof raw.text !== "string" || typeof raw.expected !== "number" || typeof raw.seedDigest !== "string" || typeof raw.generatorVersion !== "number") return null;
  return { generatorVersion: raw.generatorVersion, seedDigest: raw.seedDigest, identity: { attemptNumber: Number(raw.identity.attemptNumber), questionKey: String(raw.identity.questionKey ?? "") }, values: numbers(raw.values), text: raw.text, expected: raw.expected, derived: numbers(raw.derived), constraints: checks(raw.constraints) };
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
      {Object.keys(inst.derived).length > 0 && <p dir="ltr" data-testid="param-review-derived">{Object.entries(inst.derived).map(([k, v]) => k + " = " + formatParametricNumber(v)).join(", ")}</p>}
      {inst.constraints.length > 0 && <ul className="param-review-constraints" data-testid="param-review-constraints" aria-label="القيود على قيم هذه المحاولة">{inst.constraints.map((c, i) => <li key={i}><bdi dir="ltr">{c.source}</bdi> — <bdi dir="ltr">{c.left === null ? "؟" : formatParametricNumber(c.left)} | {c.right === null ? "؟" : formatParametricNumber(c.right)}</bdi> {c.holds ? "✓" : "✗"}</li>)}</ul>}
      <p>إجابة الطالب: <bdi dir="ltr">{given || "—"}</bdi></p>
      <p data-testid="param-review-expected">الإجابة الصحيحة المحسوبة لهذه المحاولة: <bdi dir="ltr">{formatParametricNumber(inst.expected)}</bdi></p>
      <p className="param-review-audit" data-testid="param-review-audit">مولّد القيم: الإصدار {inst.generatorVersion} · المحاولة {inst.identity.attemptNumber} · السؤال <bdi dir="ltr">{inst.identity.questionKey}</bdi> · بصمة التوليد <bdi dir="ltr">{inst.seedDigest}</bdi></p>
    </div>
  );
}
