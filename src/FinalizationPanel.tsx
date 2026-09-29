import Dialog from "./ui/Dialog";
import type { FinalizationDecision, FinalizationItem } from "./examFinalization";
import { EFFECT_LABEL } from "./assessmentQualityPolicy";
import { formatCoverageNumber } from "./coverageFormat";

// Phase 13C-C — فحص الجاهزية للاعتماد: the unified readiness view over the canonical FinalizationDecision. Structural
// errors, quality gate blockers (incl. policy problems) and warnings are separated; every item states the effect, the
// factual reason, the current value / relation and the expected condition as TEXT (never colour alone). Evidence buttons
// reuse the existing selection / navigator (onReveal). Nothing is stored.
type Props = { open: boolean; onClose: () => void; decision: FinalizationDecision; onReveal: (ids: string[]) => void };

const revealLabel = (item: FinalizationItem): string => {
  const kind = item.gate?.source.kind;
  return kind === "unclassified" ? "عرض غير المصنفة" : kind === "unmapped-bank" ? "عرض غير المربوطة" : "عرض الأسئلة";
};
function Item({ item, onReveal, tone }: { item: FinalizationItem; onReveal: (ids: string[]) => void; tone: "blocker" | "warning" }) {
  const g = item.gate;
  const attrs = g ? { "data-gate-rule": g.ruleId } : item.policyIssue ? { "data-policy-issue": item.policyIssue.code } : { "data-structural": item.id };
  return (
    <li className={"sb-fin-item is-" + tone} {...attrs}>
      <span className="sb-fin-effect">{tone === "blocker" ? (g ? EFFECT_LABEL["block-finalization"] : item.kind === "policy" ? "مشكلة في سياسة الجودة تمنع الاعتماد" : "خطأ بنيوي يمنع الاعتماد") : (g ? EFFECT_LABEL.warning : "تنبيه بنيوي")}</span>
      <span className="sb-fin-message">{item.message}</span>
      {g && g.actual !== null && <span className="sb-fin-facts">الموجود: {formatCoverageNumber(g.actual)}{g.relation ? " · " + g.expectedText : ""}</span>}
      {g && g.actual === null && <span className="sb-fin-facts">الموجود: غير قابل للتقييم · {g.expectedText}</span>}
      {g?.note && <span className="sb-fin-note">ملاحظة السياسة: {g.note}</span>}
      {item.evidence.length > 0 && <button type="button" className="sb-btn sb-btn-sm" onClick={() => onReveal(item.evidence)}>{revealLabel(item)}</button>}
    </li>
  );
}

export default function FinalizationPanel({ open, onClose, decision, onReveal }: Props) {
  const structural = decision.blockers.filter(b => b.kind === "structural");
  const gates = decision.blockers.filter(b => b.kind !== "structural");
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="فحص الجاهزية للاعتماد" className="sb-fin-dialog">
      <div className="sb-fin">
        <p className="sb-fin-status" role="status">{decision.canFinalize ? "الحالة الحالية تسمح بالاعتماد النهائي وفق القواعد المُعدَّة." : "الاعتماد النهائي غير ممكن الآن: " + decision.blockers.length + " مانع."}<span className="sb-hint"> هذا قرار تشغيلي لسير التأليف وليس حكمًا على جودة الامتحان.</span></p>
        <section className="sb-fin-section" aria-labelledby="sb-fin-structural">
          <h3 id="sb-fin-structural" className="sb-bp-h">أخطاء بنيوية</h3>
          {structural.length === 0 ? <p className="sb-hint">لا أخطاء بنيوية.</p> : <ul className="sb-fin-list" aria-label="أخطاء بنيوية">{structural.map(i => <Item key={i.id} item={i} onReveal={onReveal} tone="blocker" />)}</ul>}
        </section>
        <section className="sb-fin-section" aria-labelledby="sb-fin-gates">
          <h3 id="sb-fin-gates" className="sb-bp-h">بوابات الجودة</h3>
          {decision.qualityReport === null ? <p className="sb-hint">لا مخطط للامتحان — لا بوابات جودة.</p>
            : !decision.qualityReport.enabled ? <p className="sb-hint">لا سياسة جودة مفعّلة.</p>
            : gates.length === 0 ? <p className="sb-hint">لا موانع من بوابات الجودة.</p>
            : <ul className="sb-fin-list" aria-label="بوابات الجودة">{gates.map(i => <Item key={i.id} item={i} onReveal={onReveal} tone="blocker" />)}</ul>}
        </section>
        <section className="sb-fin-section" aria-labelledby="sb-fin-warnings">
          <h3 id="sb-fin-warnings" className="sb-bp-h">تنبيهات</h3>
          {decision.warnings.length === 0 ? <p className="sb-hint">لا تنبيهات.</p> : <ul className="sb-fin-list" aria-label="تنبيهات">{decision.warnings.map(i => <Item key={i.kind + ":" + i.id} item={i} onReveal={onReveal} tone="warning" />)}</ul>}
        </section>
      </div>
    </Dialog>
  );
}
