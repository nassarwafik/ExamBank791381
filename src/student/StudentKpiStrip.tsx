import { IconAssignments, IconHistory, IconMedal, IconSparkles } from "../icons";

/**
 * Phase 21E V2 — the student's at-a-glance strip under the welcome hero: four tiles, each a shortcut to the section
 * that explains it. Every value is the SERVER's (dashboard stats / strength) or the portal's own derivation of the
 * server's task states (the same `nowItems` the «ماذا عليّ أن أفعل الآن؟» section lists) — nothing is computed here.
 * A missing value reads «—», never a guessed zero.
 */
export type StudentKpis = {
  actionable: number;
  inProgress: number;
  pendingReview: number;
  averageFinalized: number | null;
  stageNumber: number | null;
  stageCount: number;
};

export default function StudentKpiStrip({ kpis, onOpenNow, onOpenTasks, onOpenProgress }: {
  kpis: StudentKpis;
  onOpenNow: () => void;
  onOpenTasks: () => void;
  onOpenProgress: () => void;
}) {
  const avg = kpis.averageFinalized === null || !Number.isFinite(kpis.averageFinalized) ? "—" : Math.round(kpis.averageFinalized) + "%";
  const stage = kpis.stageNumber ? String(kpis.stageNumber) : "—";
  return (
    <ul className="eb-sp-kpis" aria-label="ملخص سريع">
      <li>
        <button type="button" className="eb-sp-kpi is-now" onClick={onOpenNow}>
          <span className="eb-sp-kpi-icon" aria-hidden="true"><IconAssignments size={20} /></span>
          <span className="eb-sp-kpi-value">{kpis.actionable}</span>
          <span className="eb-sp-kpi-label">مطلوب الآن</span>
          <span className="eb-sp-kpi-hint">{kpis.inProgress > 0 ? kpis.inProgress + " قيد الحل" : "لا محاولات جارية"}</span>
        </button>
      </li>
      <li>
        <button type="button" className="eb-sp-kpi is-review" onClick={onOpenTasks}>
          <span className="eb-sp-kpi-icon" aria-hidden="true"><IconHistory size={20} /></span>
          <span className="eb-sp-kpi-value">{kpis.pendingReview}</span>
          <span className="eb-sp-kpi-label">بانتظار التصحيح</span>
          <span className="eb-sp-kpi-hint">نتائج لم تُعتمد بعد</span>
        </button>
      </li>
      <li>
        <button type="button" className="eb-sp-kpi is-average" onClick={onOpenProgress}>
          <span className="eb-sp-kpi-icon" aria-hidden="true"><IconMedal size={20} /></span>
          <span className="eb-sp-kpi-value" dir="ltr">{avg}</span>
          <span className="eb-sp-kpi-label">معدّلي النهائي</span>
          <span className="eb-sp-kpi-hint">من النتائج النهائية فقط</span>
        </button>
      </li>
      <li>
        <button type="button" className="eb-sp-kpi is-stage" onClick={onOpenProgress}>
          <span className="eb-sp-kpi-icon" aria-hidden="true"><IconSparkles size={20} /></span>
          <span className="eb-sp-kpi-value">{stage}</span>
          <span className="eb-sp-kpi-label">مرحلة القوة</span>
          <span className="eb-sp-kpi-hint">{kpis.stageNumber ? "من " + kpis.stageCount + " مرحلة" : "تظهر بعد أول نشاط"}</span>
        </button>
      </li>
    </ul>
  );
}
