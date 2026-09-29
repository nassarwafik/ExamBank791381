import { useMemo } from "react";
import Dialog from "./ui/Dialog";
import type { StructuredExam } from "./examTypes";
import { evaluateBlueprintCoverage, RELATION_LABEL, DIMENSION_LABEL, type CoverageItem } from "./assessmentBlueprintCoverage";
import { formatActual, formatCoverageNumber, formatDelta, formatPercent } from "./coverageFormat";
import { guidedBankFocusForCoverageItem, type BankPickerFocus, type BankPickerScope } from "./bankPickerFocus";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";

// Phase 13C-B — تحليل المخطط الحي: the ANALYSIS surface (مخطط الامتحان stays the EDIT surface). Everything shown is
// derived with useMemo from the canonical exam prop the builder passes — no cache, no polling, no backend, nothing stored.
// Factual language only: relations, deltas, evidence. No score, no verdict, no gate (13C-C).
type Props = {
  open: boolean; onClose: () => void; exam: StructuredExam;
  /** Select these questions in the existing navigator / selection architecture and focus the first one. */
  onReveal: (ids: string[]) => void;
  /** Open the existing Question Bank picker with an EXACT prefilled filter (absent → no bank actions are offered). */
  onFindInBank?: (focus: BankPickerFocus) => void;
  /** The bank service's DATA-declared scope; guided actions appear only when the exam's Blueprint is compatible with it. */
  bankScope?: BankPickerScope;
};

const UNIT_WORD = (unit: "absolute" | "percent") => (unit === "percent" ? " نقاط مئوية" : "");
function limitsText(item: CoverageItem): string {
  const f = (v: number) => formatActual(v, item.unit);
  const parts: string[] = [];
  if (item.min !== undefined && item.max !== undefined) parts.push("النطاق " + f(item.min) + "–" + f(item.max));
  else if (item.min !== undefined) parts.push("الحد الأدنى " + f(item.min));
  else if (item.max !== undefined) parts.push("الحد الأقصى " + f(item.max));
  if (item.target !== undefined) parts.push("الهدف " + f(item.target) + (item.tolerance !== undefined ? " ± " + formatCoverageNumber(item.tolerance) : ""));
  return parts.join(" · ");
}
function relationText(item: CoverageItem): string {
  const label = RELATION_LABEL[item.relation];
  if (item.relation === "unassessable") {
    const why = item.reason === "zero-count-denominator" ? "لا أسئلة في الامتحان بعد" : item.reason === "zero-marks-denominator" ? "لا علامات رسمية في الامتحان بعد" : item.reason === "no-limits" ? "القيد لا يحدد أي حدّ" : item.issues.map(i => i.code).join("، ");
    return label + " — " + why;
  }
  const by = item.relation === "below-min" && item.shortfall !== null ? item.shortfall : item.relation === "above-max" && item.excess !== null ? item.excess : (item.relation === "below-target" || item.relation === "above-target") && item.delta !== null ? Math.abs(item.delta) : null;
  return by === null ? label : label + " بـ " + formatCoverageNumber(by) + UNIT_WORD(item.unit);
}
function actualText(item: CoverageItem): string {
  if (item.actual === null) return "—";
  if (item.kind === "total-questions") return formatCoverageNumber(item.actual) + (item.target !== undefined ? " / " + formatCoverageNumber(item.target) : "") + " سؤال";
  if (item.kind === "total-marks") return formatCoverageNumber(item.actual) + (item.target !== undefined ? " / " + formatCoverageNumber(item.target) : "") + " علامة";
  if (item.unit === "percent") return formatPercent(item.actual) + (item.metric === "marks" ? " من العلامات الرسمية" : " من الأسئلة");
  return formatCoverageNumber(item.actual) + (item.metric === "marks" ? " علامة رسمية" : " أسئلة");
}

type RowProps = { item: CoverageItem; blueprint: AssessmentBlueprintV1 | undefined; bankScope?: BankPickerScope; onReveal: (ids: string[]) => void; onFindInBank?: (focus: BankPickerFocus) => void };
function Row({ item, blueprint, bankScope, onReveal, onFindInBank }: RowProps) {
  const focus = onFindInBank ? guidedBankFocusForCoverageItem(item, blueprint, bankScope) : null;
  const scale = item.actual === null ? 0 : item.unit === "percent" ? 100 : Math.max(item.actual, item.target ?? 0, item.max ?? 0, item.min ?? 0, 1);
  const fill = item.actual === null ? 0 : Math.min(100, (item.actual / scale) * 100);
  const targetMark = item.target !== undefined && item.actual !== null ? Math.min(100, (item.target / scale) * 100) : null;
  return (
    <li className={"sb-cov-row is-" + item.relation} data-coverage-id={item.id} data-relation={item.relation}>
      <div className="sb-cov-head">
        {item.dimension && <span className="sb-cov-dim">{DIMENSION_LABEL[item.dimension]}</span>}
        <strong className="sb-cov-ref">{item.refLabel}</strong>
        <span className="sb-cov-metric">{item.kind === "constraint" ? (item.metric === "marks" ? "العلامات" : "عدد الأسئلة") + (item.unit === "percent" ? " (نسبة مئوية)" : "") : ""}</span>
      </div>
      <div className="sb-cov-values">
        <span className="sb-cov-actual">{actualText(item)}</span>
        {item.kind === "constraint" && limitsText(item) && <><span className="sb-cov-sep" aria-hidden="true">/</span><span className="sb-cov-limits">{limitsText(item)}</span></>}
        {item.denominator !== undefined && <span className="sb-cov-denominator">من {formatCoverageNumber(item.denominator)}</span>}
      </div>
      {item.actual !== null && (
        <div className="sb-cov-bar" role="progressbar" aria-label={item.refLabel} aria-valuemin={0} aria-valuemax={formatCoverageNumber(scale) as unknown as number} aria-valuenow={formatCoverageNumber(item.actual) as unknown as number} aria-valuetext={actualText(item)}>
          <span className="sb-cov-fill" style={{ width: fill + "%" }} />
          {targetMark !== null && <span className="sb-cov-target" style={{ insetInlineStart: targetMark + "%" }} aria-hidden="true" />}
        </div>
      )}
      <div className="sb-cov-foot">
        <span className="sb-cov-relation">{relationText(item)}</span>
        {item.delta !== null && item.relation !== "unassessable" && <span className="sb-cov-delta" dir="ltr">{formatDelta(item.delta, item.unit)}</span>}
        <span className="sb-cov-actions">
          {item.evidence.length > 0 && <button type="button" className="sb-btn sb-btn-sm" onClick={() => onReveal(item.evidence)}>عرض الأسئلة</button>}
          {focus && onFindInBank && <button type="button" className="sb-btn sb-btn-sm" onClick={() => onFindInBank(focus)}>ابحث في بنك الأسئلة</button>}
        </span>
      </div>
    </li>
  );
}

export default function BlueprintCoveragePanel({ open, onClose, exam, onReveal, onFindInBank, bankScope }: Props) {
  const report = useMemo(() => evaluateBlueprintCoverage(exam), [exam]);
  const unmappedCount = report.unmappedBank.questionIds.length;
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="تحليل المخطط الحي" className="sb-cov-dialog">
      <div className="sb-cov">
        <p className="sb-hint">مقارنة وقائعية بين ما يطلبه مخطط الامتحان وما يحتويه الامتحان الآن. تتحدث الأرقام مباشرة مع كل تعديل، ولا تُقيَّم الجودة ولا يُمنع الحفظ في هذه المرحلة.</p>
        <dl className="sb-cov-overview">
          <div className="sb-cov-stat"><dt>الأسئلة</dt><dd data-overview="questions">{formatCoverageNumber(report.totalQuestions)}{report.targetTotalQuestions !== undefined ? " / " + formatCoverageNumber(report.targetTotalQuestions) : ""} سؤال</dd></div>
          <div className="sb-cov-stat"><dt>العلامات الرسمية</dt><dd data-overview="marks">{formatCoverageNumber(report.totalOfficialMarks)}{report.targetTotalMarks !== undefined ? " / " + formatCoverageNumber(report.targetTotalMarks) : ""} علامة</dd></div>
          <div className="sb-cov-stat"><dt>أسئلة غير مصنفة</dt><dd data-overview="unclassified">{report.unclassified.count}{report.unclassified.count > 0 && <button type="button" className="sb-btn sb-btn-sm" onClick={() => onReveal(report.unclassified.questionIds)}>عرض غير المصنفة</button>}</dd></div>
          <div className="sb-cov-stat"><dt>مواضيع بنك غير مربوطة</dt><dd data-overview="unmapped">{unmappedCount}{unmappedCount > 0 && <button type="button" className="sb-btn sb-btn-sm" onClick={() => onReveal(report.unmappedBank.questionIds)}>عرض غير المربوطة</button>}</dd></div>
          <div className="sb-cov-stat"><dt>القيود المُعرَّفة</dt><dd data-overview="constraints">{report.constraintCount}</dd></div>
        </dl>
        {report.issues.length > 0 && <p className="sb-hint sb-cov-issues" role="note">المخطط يحوي {report.issues.length} مشكلة بنيوية؛ القيود المتأثرة تُعرض «غير قابلة للتقييم» ولا تُصلَح تلقائيًا.</p>}
        {report.totals.length > 0 && (
          <section className="sb-cov-section" aria-labelledby="sb-cov-totals">
            <h3 id="sb-cov-totals" className="sb-bp-h">الأهداف الإجمالية</h3>
            <ul className="sb-cov-list" aria-label="الأهداف الإجمالية">{report.totals.map(item => <Row key={item.id} item={item} blueprint={exam.blueprint} bankScope={bankScope} onReveal={onReveal} onFindInBank={onFindInBank} />)}</ul>
          </section>
        )}
        <section className="sb-cov-section" aria-labelledby="sb-cov-constraints">
          <h3 id="sb-cov-constraints" className="sb-bp-h">قيود المخطط</h3>
          {report.constraints.length === 0 ? <p className="sb-hint">لا قيود في المخطط بعد — أضف قيودًا من «مخطط الامتحان».</p>
            : <ul className="sb-cov-list" aria-label="قيود المخطط">{report.constraints.map(item => <Row key={item.id} item={item} blueprint={exam.blueprint} bankScope={bankScope} onReveal={onReveal} onFindInBank={onFindInBank} />)}</ul>}
        </section>
      </div>
    </Dialog>
  );
}
