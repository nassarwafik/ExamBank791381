import StatCard from "../ui/StatCard";
import type { HomeKpis } from "./assignmentsHome";

/**
 * Phase 21G.2 — the assignments home KPI strip over the assignments in scope (class filter, current view). Figures that need the
 * server progress read show «—» with an explanation when it is unavailable, never a zero that is not known.
 */
export default function AssignmentsHomeKpis({ kpis: k }: { kpis: HomeKpis }) {
  const unknown = "—", why = "تعذر تحميل التقدم";
  return (
    <section className="eb-assign-kpis" aria-label="ملخص الواجبات">
      <div className="eb-stat-grid is-primary">
        <StatCard primary label="مفتوحة الآن" value={k.open} tone={k.closingSoon > 0 ? "attention" : "neutral"} hint={k.closingSoon > 0 ? k.closingSoon + " منها تُغلق خلال 48 ساعة" : "لا شيء يُغلق خلال 48 ساعة"} />
        <StatCard primary label="بانتظار التصحيح" value={k.progressKnown ? k.pendingReview : unknown} tone={k.progressKnown && k.pendingReview > 0 ? "attention" : "neutral"} hint={!k.progressKnown ? why : k.pendingReview > 0 ? "في " + k.pendingAssignments + (k.pendingAssignments === 1 ? " واجب" : " واجبات") : "لا شيء بانتظارك"} />
        <StatCard primary label="يحاولون الآن" value={k.progressKnown ? k.active : unknown} tone={k.progressKnown && k.active > 0 ? "info" : "neutral"} hint={!k.progressKnown ? why : "طلاب في محاولة جارية"} />
        <StatCard primary label="نسبة التسليم" value={!k.progressKnown ? unknown : k.completion === null ? unknown : k.completion + "%"} tone={k.completion !== null && k.completion >= 80 ? "success" : "neutral"} hint={!k.progressKnown ? why : k.expected ? k.submitted + " من " + k.expected + " في الواجبات المفتوحة" : "لا توجد واجبات مفتوحة"} />
      </div>
    </section>
  );
}
