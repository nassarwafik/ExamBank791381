import { useMemo } from "react";
import Dialog from "./ui/Dialog";
import type { AssessmentBlueprintV1, AssessmentQualityPolicyV1, AssessmentQualityRule, QualityEffect, QualityTriggerRelation } from "./assessmentTypes";
import { QUALITY_TRIGGER_RELATIONS, QUALITY_EFFECTS } from "./assessmentTypes";
import { RELATION_LABEL } from "./assessmentBlueprintCoverage";
import {
  validateAssessmentQualityPolicy, emptyQualityPolicy, defaultQualityRule, retargetQualityRule, parseQualityRuleSourceKey, qualityRuleSourceKey,
  describeConstraint, isCoverageQualityRule, isThresholdQualityRule, EFFECT_LABEL, SOURCE_LABEL
} from "./assessmentQualityPolicy";

// Phase 13C-C — سياسات الجودة: WHICH factual coverage conditions matter for finalization. It never owns state: every edit is
// handed to the owner as a pure policy updater dispatched as ONE onChange(updater) (one history step). It does not edit
// the Blueprint (مخطط الامتحان) and does not analyse the exam (تحليل المخطط الحي).
type Edit = (fn: (policy: AssessmentQualityPolicyV1) => AssessmentQualityPolicyV1) => void;
type Props = { open: boolean; onClose: () => void; blueprint: AssessmentBlueprintV1 | undefined; sections: { id: string; title: string }[]; onEdit: Edit; disabled?: boolean };

export default function QualityPolicyPanel({ open, onClose, blueprint, sections, onEdit, disabled }: Props) {
  const policy = blueprint?.qualityPolicy ?? emptyQualityPolicy();
  const issues = useMemo(() => (blueprint?.qualityPolicy ? validateAssessmentQualityPolicy(blueprint.qualityPolicy, blueprint) : []), [blueprint]);
  const constraintOptions = useMemo(() => (blueprint?.constraints ?? []).filter(c => typeof c.id === "string" && c.id).map(c => ({ key: "constraint:" + c.id, label: describeConstraint(blueprint!, c, sections) })), [blueprint, sections]);
  const setRule = (id: string, next: (r: AssessmentQualityRule) => AssessmentQualityRule) => onEdit(p => { const i = p.rules.findIndex(r => r.id === id); if (i < 0) return p; const cur = p.rules[i]; const n = next(cur); if (JSON.stringify(n) === JSON.stringify(cur)) return p; const rules = p.rules.slice(); rules[i] = n; return { ...p, rules }; });
  const sourceLabel = (r: AssessmentQualityRule) => (r.source.kind === "constraint" ? constraintOptions.find(o => o.key === qualityRuleSourceKey(r.source))?.label ?? ("قيد غير موجود: " + r.source.constraintId) : SOURCE_LABEL[r.source.kind]);
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="سياسات الجودة" className="sb-qp-dialog">
      <div className="sb-qp">
        <p className="sb-hint">تحدّد السياسة أيّ حالات وقائعية من «تحليل المخطط الحي» تُعدّ تنبيهًا وأيّها يمنع الاعتماد النهائي. القواعد تشير إلى معرّفات القيود الثابتة، وتُحفَظ مع المخطط؛ نتائجها لا تُحفَظ أبدًا. ليست تقييمًا ولا درجة.</p>
        <label className="sb-inline sb-qp-enable"><input type="checkbox" checked={policy.enabled} disabled={disabled} onChange={e => { const v = e.target.checked; onEdit(p => (p.enabled === v ? p : { ...p, enabled: v })); }} aria-label="تفعيل سياسات الجودة" /> تفعيل سياسات الجودة</label>
        {!policy.enabled && <p className="sb-hint" role="note">السياسة غير مفعّلة: يمكن تحريرها لكنها لا تضيف موانع أو تنبيهات على الاعتماد.</p>}
        <ul className="sb-qp-list" aria-label="قواعد السياسة">
          {policy.rules.map(r => {
            const ruleIssues = issues.filter(i => i.ruleId === r.id);
            return (
              <li key={r.id} className={"sb-qp-rule" + (ruleIssues.length ? " has-issues" : "")} data-rule-id={r.id}>
                <div className="sb-qp-rule-head">
                  <strong className="sb-qp-source-label">{sourceLabel(r)}</strong>
                  <label className="sb-inline"><input type="checkbox" checked={r.enabled} disabled={disabled} onChange={e => { const v = e.target.checked; setRule(r.id, cur => ({ ...cur, enabled: v })); }} aria-label="القاعدة مفعّلة" /> مفعّلة</label>
                </div>
                <div className="sb-qp-grid">
                  <label className="sb-inline sb-bp-field"><span>مصدر القاعدة</span>
                    <select className="sb-input" aria-label="مصدر القاعدة" value={qualityRuleSourceKey(r.source)} disabled={disabled} onChange={e => { const src = parseQualityRuleSourceKey(e.target.value); if (src) setRule(r.id, cur => retargetQualityRule(cur, src)); }}>
                      {r.source.kind === "constraint" && !constraintOptions.some(o => o.key === qualityRuleSourceKey(r.source)) && <option value={qualityRuleSourceKey(r.source)}>قيد غير موجود: {r.source.constraintId}</option>}
                      <optgroup label="قيود المخطط">{constraintOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>
                      <optgroup label="الأهداف الإجمالية"><option value="total-questions">{SOURCE_LABEL["total-questions"]}</option><option value="total-marks">{SOURCE_LABEL["total-marks"]}</option></optgroup>
                      <optgroup label="حقائق أخرى"><option value="unclassified">{SOURCE_LABEL.unclassified}</option><option value="unmapped-bank">{SOURCE_LABEL["unmapped-bank"]}</option></optgroup>
                    </select>
                  </label>
                  <label className="sb-inline sb-bp-field"><span>الأثر</span>
                    <select className="sb-input" aria-label="الأثر" value={r.effect} disabled={disabled} onChange={e => { const v = e.target.value as QualityEffect; setRule(r.id, cur => ({ ...cur, effect: v })); }}>
                      {QUALITY_EFFECTS.map(ef => <option key={ef} value={ef}>{EFFECT_LABEL[ef]}</option>)}
                    </select>
                  </label>
                  {isCoverageQualityRule(r) && (
                    <fieldset className="sb-class-chips sb-qp-relations" aria-label="العلاقات المُفعِّلة" disabled={disabled}>
                      <legend className="sb-field-label">العلاقات المُفعِّلة</legend>
                      {QUALITY_TRIGGER_RELATIONS.map(rel => (
                        <label key={rel} className={"sb-chip" + (r.relations.includes(rel) ? " is-on" : "")}>
                          <input type="checkbox" checked={r.relations.includes(rel)} onChange={() => setRule(r.id, cur => (isCoverageQualityRule(cur) ? { ...cur, relations: cur.relations.includes(rel) ? cur.relations.filter(x => x !== rel) : [...cur.relations, rel as QualityTriggerRelation] } : cur))} aria-label={RELATION_LABEL[rel]} />
                          {RELATION_LABEL[rel]}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {isThresholdQualityRule(r) && (
                    <>
                      <label className="sb-inline sb-bp-field"><span>المقياس</span>
                        <select className="sb-input" aria-label="المقياس" value={r.metric} disabled={disabled || r.source.kind === "unmapped-bank"} onChange={e => { const v = e.target.value as "count" | "officialMarks"; setRule(r.id, cur => ({ ...cur, metric: v } as AssessmentQualityRule)); }}>
                          <option value="count">عدد الأسئلة</option>{r.source.kind === "unclassified" && <option value="officialMarks">العلامات الرسمية</option>}
                        </select>
                      </label>
                      <label className="sb-inline sb-bp-field"><span>الحد الأقصى</span>
                        <input className="sb-input sb-input-xs" type="number" min="0" step="0.5" aria-label="الحد الأقصى" value={Number.isFinite(r.max) ? r.max : ""} disabled={disabled} onChange={e => { const v = e.target.value === "" ? Number.NaN : Number(e.target.value); setRule(r.id, cur => ({ ...cur, max: v } as AssessmentQualityRule)); }} />
                      </label>
                    </>
                  )}
                  <label className="sb-inline sb-bp-field sb-qp-note"><span>ملاحظة</span>
                    <input className="sb-input" aria-label="ملاحظة" value={r.note ?? ""} disabled={disabled} onChange={e => { const v = e.target.value; setRule(r.id, cur => { const n = { ...cur }; if (v) n.note = v; else delete n.note; return n; }); }} />
                  </label>
                </div>
                {ruleIssues.length > 0 && <ul className="sb-qp-rule-issues" aria-label="مشكلات القاعدة">{ruleIssues.map((i, n) => <li key={n} data-code={i.code}>{i.message} <code dir="ltr">{i.code}</code></li>)}</ul>}
                <div className="sb-qp-rule-actions"><button type="button" className="sb-btn sb-btn-sm sb-btn-danger" disabled={disabled} onClick={() => onEdit(p => ({ ...p, rules: p.rules.filter(x => x.id !== r.id) }))}>حذف القاعدة</button></div>
              </li>
            );
          })}
        </ul>
        <div className="sb-qp-actions">
          <button type="button" className="sb-btn" disabled={disabled} onClick={() => onEdit(p => ({ ...p, rules: [...p.rules, defaultQualityRule(blueprint)] }))}>إضافة قاعدة</button>
        </div>
        {issues.length > 0 && (
          <ul className="sb-bp-issues" aria-label="مشكلات السياسة">
            {issues.map((i, n) => <li key={n} data-code={i.code}>{i.message} <code dir="ltr">{i.code}</code>{i.path && <span className="sb-hint"> — {i.path}</span>}</li>)}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
