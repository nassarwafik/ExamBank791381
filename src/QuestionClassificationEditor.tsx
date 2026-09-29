import type { BuilderQuestion } from "./examTypes";
import type { AssessmentBlueprintV1, AssessmentMeta } from "./assessmentTypes";
import { blueprintCognitiveLevels, blueprintDifficultyScale, difficultyValues, effectiveAssessmentMeta, orderedTopics } from "./assessmentBlueprint";
import { normalizeAssessmentMeta as cleaned } from "./assessmentBulkClassify";   // the ONE meta normalizer (13C-B bulk classification shares it)

// Phase 13C-A — compact, OPTIONAL pedagogical classification of one question. Every change is one `onChange({ assessmentMeta })`
// patch through the existing question update path (one history step). Explicit values are authoritative; legacy bank
// evidence is shown as evidence and never mapped by guess.
type Props = { question: BuilderQuestion; blueprint?: AssessmentBlueprintV1; onChange: (patch: Partial<BuilderQuestion>) => void; disabled?: boolean };


export default function QuestionClassificationEditor({ question, blueprint, onChange, disabled }: Props) {
  const meta: AssessmentMeta = question.assessmentMeta ?? {};
  const topics = orderedTopics(blueprint);
  const objectives = blueprint?.objectives ?? [];
  const levels = blueprintCognitiveLevels(blueprint);
  const scale = blueprintDifficultyScale(blueprint);
  const eff = effectiveAssessmentMeta(question, blueprint);
  const set = (patch: Partial<AssessmentMeta>) => onChange({ assessmentMeta: cleaned({ ...meta, ...patch }) });
  const toggle = (key: "secondaryTopicIds" | "objectiveIds", id: string) => {
    const cur = meta[key] ?? [];
    set({ [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  };
  const bankTopic = eff.bankEvidence.topic;
  return (
    <fieldset className="sb-class" disabled={disabled}>
      <legend className="sb-field-label">التصنيف التعليمي</legend>
      <div className="sb-class-row">
        <label className="sb-inline"><span>الموضوع الرئيسي</span>
          <select className="sb-input sb-input-sm" aria-label="الموضوع الرئيسي" value={meta.primaryTopicId ?? ""} disabled={disabled || !topics.length} onChange={e => set({ primaryTopicId: e.target.value || undefined })}>
            <option value="">— غير محدد —</option>{topics.map(t => <option key={t.id} value={t.id}>{" ".repeat(t.depth * 2)}{t.label || t.id}</option>)}
          </select></label>
        <label className="sb-inline"><span>الصعوبة</span>
          <select className="sb-input sb-input-xs" aria-label="الصعوبة" value={meta.difficulty ?? ""} onChange={e => set({ difficulty: e.target.value === "" ? undefined : Number(e.target.value) })}>
            <option value="">—</option>{difficultyValues(blueprint).map(v => <option key={v} value={String(v)}>{scale.labels?.[String(v)] ? v + " — " + scale.labels[String(v)] : String(v)}</option>)}
          </select></label>
        <label className="sb-inline"><span>المستوى المعرفي</span>
          <select className="sb-input sb-input-sm" aria-label="المستوى المعرفي" value={meta.cognitiveLevel ?? ""} onChange={e => set({ cognitiveLevel: e.target.value || undefined })}>
            <option value="">—</option>{levels.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select></label>
      </div>
      {!topics.length && <p className="sb-hint">لا مواضيع بعد — أضف مواضيع في مخطط الامتحان لربط السؤال بها.</p>}
      {topics.length > 0 && (
        <div className="sb-class-groups">
          <fieldset className="sb-class-chips" aria-label="مواضيع ثانوية"><legend>مواضيع ثانوية</legend>
            {topics.filter(t => t.id !== meta.primaryTopicId).map(t => <label key={t.id} className="sb-chip"><input type="checkbox" checked={(meta.secondaryTopicIds ?? []).includes(t.id)} onChange={() => toggle("secondaryTopicIds", t.id)} />{t.label || t.id}</label>)}
          </fieldset>
          {objectives.length > 0 && (
            <fieldset className="sb-class-chips" aria-label="الأهداف التعليمية"><legend>الأهداف التعليمية</legend>
              {objectives.map(o => <label key={o.id} className="sb-chip"><input type="checkbox" checked={(meta.objectiveIds ?? []).includes(o.id)} onChange={() => toggle("objectiveIds", o.id)} />{o.label || o.id}</label>)}
            </fieldset>
          )}
        </div>
      )}
      {bankTopic && (
        <p className="sb-hint sb-class-evidence" dir="auto">
          {"موضوع البنك: " + bankTopic
            + (eff.source.primaryTopic === "bank" ? " — مطابق لمعرّف موضوع في المخطط" : eff.unmappedBankTopics.includes(bankTopic) ? " — غير مربوط بالمخطط (لا يُربط تلقائيًا)" : "")
            + (eff.bankEvidence.difficulty !== undefined && eff.source.difficulty === "bank" ? " · صعوبة البنك: " + eff.bankEvidence.difficulty : "")}
        </p>
      )}
    </fieldset>
  );
}
