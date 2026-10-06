import type { SmartSimReviewDetailsProps } from "../trustedSim/smartSimUiRegistry";
import { fmtPhysics, impactSpeed, impactTime, validateFreeFallConfig } from "../physicsFreeFallModel";
import { UNIT_LABEL } from "./freeFallLabels";
import "./freefall.css";

// Phase 20A.2 — physicsFreeFall@1 review details (lazy, teacher only): the assigned model with its trusted derived facts and the student's
// SERVER-derived saved measurements and graph points — as text. There is no animation state to show: it was never recorded.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? fmtPhysics(v) : "—");

export default function FreeFallReview({ config, state }: SmartSimReviewDetailsProps) {
  const r = validateFreeFallConfig(config);
  if (!r.ok) return null;
  const cfg = r.config;
  const st = isObj(state) ? state : {};
  const measurements = isObj(st.measurements) ? st.measurements : {}, points = isObj(st.points) ? st.points : {};
  return (
    <div className="freefall-review" data-testid="freefall-review">
      <p>النموذج: <span className="freefall-ltr">h0 = {fmtPhysics(cfg.model.initialHeight)} m, v0 = {fmtPhysics(cfg.model.initialVelocity)} m/s, g = {fmtPhysics(cfg.model.gravity)} m/s²</span> — زمن الارتطام المحسوب <span className="freefall-ltr">{fmtPhysics(impactTime(cfg.model))} s</span>، سرعة الارتطام <span className="freefall-ltr">{fmtPhysics(impactSpeed(cfg.model))} m/s</span>.</p>
      <table>
        <caption>إجابات الطالب المحفوظة (محسوبة على الخادم)</caption>
        <thead><tr><th scope="col">المهمة</th><th scope="col">القيمة</th></tr></thead>
        <tbody>
          {cfg.tasks.measurements.map(m => <tr key={m.id}><td>{m.label}</td><td><span className="freefall-ltr">{num(measurements[m.id])} {UNIT_LABEL[m.unit] ?? m.unit}</span></td></tr>)}
          {cfg.tasks.points.map(p => { const v = isObj(points[p.id]) ? (points[p.id] as Record<string, unknown>) : undefined; return <tr key={p.id}><td>{p.label}</td><td><span className="freefall-ltr">{v ? "(t = " + num(v.t) + " s, y = " + num(v.y) + " m)" : "—"}</span></td></tr>; })}
        </tbody>
      </table>
    </div>
  );
}
