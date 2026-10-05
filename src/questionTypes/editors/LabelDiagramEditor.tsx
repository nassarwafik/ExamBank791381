import { useMemo, useState } from "react";
import type { AuthoringEditorProps } from "../registryTypes";
import type { Answer } from "../../answerState";
import type { Question } from "../../studentQuestionTypes";
import { validateLabelDiagramQuestion } from "../../labelDiagramQuestion";
import { visualImageSrc } from "../../visualGeometry";
import RegionEditor, { type EditorRegion } from "../../visual/RegionEditor";
import LabelDiagramView from "../../visual/LabelDiagramView";
import "../../visual/visual.css";

// Phase 19D — labelDiagram@1 authoring (lazy). Workflow: the image (existing «صورة السؤال» media editor) → its description → drop zones
// drawn with the shared region editor (optional visible zone names) → the label bank (add / edit / delete, stable ids) → the correct
// label of every zone → the reuse policy and scoring → a student preview. Deleting a zone or a label also removes the mapping entries
// that pointed to it. Canonical validation is shown inline; there is no raw JSON anywhere.
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
type Zone = EditorRegion & { name?: string };
type Label = { id: string; text: string };
const nextId = (list: { id: string }[], prefix: string) => { let n = 0; for (const r of list) { const m = /^\D+(\d+)$/.exec(String(r.id)); if (m) n = Math.max(n, Number(m[1])); } return prefix + (Math.max(n, list.length) + 1); };

export default function LabelDiagramEditor({ node, onChange, disabled }: AuthoringEditorProps) {
  const cfg = isObj((node as { labelDiagram?: unknown }).labelDiagram) ? ((node as { labelDiagram: Record<string, unknown> }).labelDiagram) : {};
  const alt = typeof cfg.alt === "string" ? cfg.alt : "";
  const allowReuse = cfg.allowReuse === true;
  const zones = useMemo<Zone[]>(() => (Array.isArray(cfg.zones) ? (cfg.zones as unknown[]).filter(isObj).map(z => ({ id: String(z.id ?? ""), shape: z.shape as Zone["shape"], ...(typeof z.name === "string" ? { name: z.name } : {}) })) : []), [cfg.zones]);
  const labels = useMemo<Label[]>(() => (Array.isArray(cfg.labels) ? (cfg.labels as unknown[]).filter(isObj).map(l => ({ id: String(l.id ?? ""), text: typeof l.text === "string" ? l.text : "" })) : []), [cfg.labels]);
  const key = isObj(node.answer) ? (node.answer as Record<string, unknown>) : {};
  const scoring = key.scoring === "allOrNothing" ? "allOrNothing" : "proportional";
  const mapping = useMemo<Record<string, string>>(() => { const m: Record<string, string> = {}; if (isObj(key.correctLabelByZone)) for (const [z, l] of Object.entries(key.correctLabelByZone)) if (typeof l === "string") m[z] = l; return m; }, [key.correctLabelByZone]);
  const src = visualImageSrc((node as { image?: unknown }).image);
  const [preview, setPreview] = useState(false);
  const [previewAnswer, setPreviewAnswer] = useState<Answer | undefined>(undefined);
  const issues = useMemo(() => validateLabelDiagramQuestion(node as unknown as Record<string, unknown>), [node]);
  const write = (next: { alt?: string; allowReuse?: boolean; zones?: Zone[]; labels?: Label[]; scoring?: string; mapping?: Record<string, string> }) => {
    const zs = next.zones ?? zones, ls = next.labels ?? labels;
    const zoneIds = new Set(zs.map(z => z.id)), labelIds = new Set(ls.map(l => l.id));
    const m: Record<string, string> = {};
    for (const [z, l] of Object.entries(next.mapping ?? mapping)) if (zoneIds.has(z) && labelIds.has(l)) m[z] = l;   // drop entries of deleted zones / labels
    onChange({ labelDiagram: { v: 1, alt: next.alt ?? alt, allowReuse: next.allowReuse ?? allowReuse, zones: zs.map(z => ({ id: z.id, shape: z.shape, ...(z.name ? { name: z.name } : {}) })), labels: ls }, answer: { scoring: next.scoring ?? scoring, correctLabelByZone: m } } as never);
  };
  const setZoneName = (i: number, name: string) => write({ zones: zones.map((z, j) => (j === i ? { id: z.id, shape: z.shape, ...(name ? { name } : {}) } : z)) });
  return (
    <div className="qt-editor qt-editor-labelDiagram vq-editor" data-testid="qt-editor-labelDiagram">
      <fieldset>
        <legend>الصورة ووصفها</legend>
        {!src && <p className="vq-note" data-testid="visual-needs-image">أضف صورة لهذا السؤال من قسم «صورة السؤال» (رفع، أو من البنك، أو بالذكاء الاصطناعي) وأبقِها ظاهرة، ثم أضف عليها مناطق التسمية.</p>}
        <label>وصف الصورة للطلاب (يُقرأ لمن لا يرى الصورة)
          <textarea aria-label="وصف الصورة للطلاب" value={alt} disabled={disabled} onChange={e => write({ alt: e.target.value })} placeholder="مثال: مخطط لطبقات نموذج OSI مع مناطق فارغة." />
        </label>
      </fieldset>
      {src && (
        <fieldset>
          <legend>مناطق التسمية (يراها الطالب)</legend>
          <RegionEditor src={src} alt={alt || "صورة السؤال"} regions={zones} disabled={disabled} canAdd={zones.length < 50} nextId={() => nextId(zones, "z")}
            onChange={rs => write({ zones: rs.map(r => ({ ...r, ...(zones.find(z => z.id === r.id)?.name ? { name: zones.find(z => z.id === r.id)!.name } : {}) })) })} />
        </fieldset>
      )}
      <fieldset>
        <legend>بنك التسميات</legend>
        <ul className="vq-list">
          {labels.map((l, i) => (
            <li key={l.id}>
              <input aria-label={"نص التسمية " + (i + 1)} value={l.text} disabled={disabled} onChange={e => write({ labels: labels.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              <button type="button" disabled={disabled} onClick={() => write({ labels: labels.filter((_, j) => j !== i) })}>حذف التسمية {i + 1}</button>
            </li>
          ))}
        </ul>
        <div className="vq-actions"><button type="button" disabled={disabled || labels.length >= 50} onClick={() => write({ labels: [...labels, { id: nextId(labels, "l"), text: "" }] })}>+ تسمية</button></div>
      </fieldset>
      <fieldset>
        <legend>التسمية الصحيحة لكل منطقة (لا يراها الطالب)</legend>
        <ul className="vq-list">
          {zones.map((z, i) => (
            <li key={z.id}>
              <span>المنطقة {i + 1}</span>
              <input aria-label={"اسم المنطقة " + (i + 1) + " (اختياري)"} value={z.name ?? ""} disabled={disabled} onChange={e => setZoneName(i, e.target.value)} placeholder="اسم ظاهر (اختياري)" />
              <select aria-label={"التسمية الصحيحة للمنطقة " + (i + 1)} value={mapping[z.id] ?? ""} disabled={disabled} onChange={e => write({ mapping: { ...mapping, [z.id]: e.target.value } })}>
                <option value="">— اختر —</option>
                {labels.map((l, j) => <option key={l.id} value={l.id}>{l.text || "التسمية " + (j + 1)}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <div className="vq-fields">
          <label><input type="checkbox" checked={allowReuse} disabled={disabled} onChange={e => write({ allowReuse: e.target.checked })} />السماح باستخدام التسمية أكثر من مرة</label>
          <label>طريقة الاحتساب
            <select aria-label="طريقة الاحتساب" value={scoring} disabled={disabled} onChange={e => write({ scoring: e.target.value })}>
              <option value="proportional">نسبية (جزء من العلامة لكل منطقة)</option><option value="allOrNothing">الكل أو لا شيء</option>
            </select>
          </label>
        </div>
      </fieldset>
      {issues.length > 0 && <ul className="vq-issues" data-testid="visual-issues">{issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
      {src && <div className="vq-actions"><button type="button" aria-pressed={preview} onClick={() => setPreview(p => !p)}>معاينة الطالب</button></div>}
      {src && preview && (
        <div className="vq-preview" data-testid="visual-student-preview">
          <p className="vq-note">معاينة المعلم: هكذا يرى الطالب السؤال (لا تُعرض التسميات الصحيحة ولا تُحفظ الإجابات هنا).</p>
          <LabelDiagramView q={node as unknown as Question} id="label-preview" answer={previewAnswer} onAnswer={setPreviewAnswer} labelPrefix="معاينة الطالب" />
        </div>
      )}
    </div>
  );
}
