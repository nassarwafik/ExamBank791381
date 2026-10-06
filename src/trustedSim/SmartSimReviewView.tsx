import { Suspense } from "react";
import { resolveSmartSimUi } from "./smartSimUiRegistry";
import "../networkTopology/network-topology.css";

// Phase 20A — the teacher review of a trusted SmartSim answer (lazy; teacher platform only). It renders what the SERVER computed with the
// grading authority (assignment-review → evaluateSmartSim): every private check with ✓ / ✗, expected vs actual, the derived points and the
// plugin's evidence, then the plugin's own details (device states, per-device histories) — all as TEXT. Nothing here grades; the teacher's
// manual override below stays the final authority. A student never receives this payload.
type Fact = { id: string; label: string; kind?: string; expected: string; actual: string; passed: boolean; weight: number; points: number; maxPoints: number; evidence?: string[] };
type Review = { valid?: boolean; score?: number; maxMarks?: number; totalWeight?: number; passedWeight?: number; checks?: Fact[]; state?: unknown; issues?: string[]; [k: string]: unknown };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fmt = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—");

export default function SmartSimReviewView({ review, envelope }: { review: unknown; envelope: unknown }) {
  const r: Review = isObj(review) ? (review as Review) : {};
  const env = isObj(envelope) ? envelope : {};
  const ui = resolveSmartSimUi(env.pluginKey, env.pluginVersion);
  const checks = Array.isArray(r.checks) ? r.checks : [];
  const { valid, score, maxMarks, totalWeight, passedWeight, checks: _c, state, issues, ...details } = r;
  void _c;
  return (
    <div className="nettopo-review" data-testid="smartsim-review">
      {valid === false
        ? <p className="ncli-unavailable" role="note" data-testid="smartsim-review-invalid">إعداد التصحيح لهذا السؤال (المحاكاة المنشورة أو الفحوص الخاصة) غير صالح؛ لم يُحتسب أي تصحيح آلي والسؤال بحاجة إلى تصحيح يدوي. {(issues ?? []).join(" ")}</p>
        : <p data-testid="smartsim-review-total">العلامة الآلية من الخادم: <strong>{fmt(score)} / {fmt(maxMarks)}</strong> (الأوزان المحققة {fmt(passedWeight)} من {fmt(totalWeight)})</p>}
      {checks.length > 0 && (
        <ul className="smartsim-checks" aria-label="نتيجة الفحوص الخاصة">
          {checks.map(c => (
            <li key={c.id} className="smartsim-check" data-testid="smartsim-check" data-passed={c.passed ? "true" : "false"}>
              <span aria-hidden="true">{c.passed ? "✓" : "✗"}</span>
              <span>{c.label}</span>
              <span>المطلوب: <code className="nettopo-ltr">{c.expected}</code></span>
              <span>الفعلي: <code className="nettopo-ltr">{c.actual}</code></span>
              {Array.isArray(c.evidence) && c.evidence.length > 0 && <span className="nettopo-ltr">{c.evidence.join(" · ")}</span>}
              <span className="smartsim-check-points">{fmt(c.points)} / {fmt(c.maxPoints)}</span>
              <span className="iex-visually-hidden">{c.passed ? "(صحيح)" : "(غير صحيح)"}</span>
            </li>
          ))}
        </ul>
      )}
      {ui && state !== undefined && <Suspense fallback={<p role="status">جارٍ تحميل تفاصيل الأجهزة...</p>}><ui.ReviewDetails config={env.config} state={state} details={details} /></Suspense>}
    </div>
  );
}
