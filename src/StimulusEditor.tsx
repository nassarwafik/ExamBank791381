
import type { Stimulus } from "./examTypes";
import { genId } from "./examBuilderState";

// Editor for a section's shared stimuli (common material referenced by several questions via groupId).
// Each stimulus has a stable group id (shown so the teacher can recognise it in the question dropdown),
// a title, text, and an optional image. The material is stored ONCE on the section; questions only
// reference it — the image is never duplicated into each question.

type Props = { stimuli: Record<string, Stimulus>; onChange: (next: Record<string, Stimulus>) => void; disabled?: boolean };

export default function StimulusEditor({ stimuli, onChange, disabled }: Props) {
  const entries = Object.entries(stimuli || {});
  const patch = (id: string, p: Partial<Stimulus>) => onChange({ ...stimuli, [id]: { ...stimuli[id], ...p } });
  const remove = (id: string) => { const next = { ...stimuli }; delete next[id]; onChange(next); };
  const add = () => { const id = "grp-" + genId("s").slice(-6); onChange({ ...stimuli, [id]: { title: "", text: "" } }); };

  const onFile = (id: string, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => patch(id, { image: { dataUrl: String(reader.result || "") } });
    reader.readAsDataURL(file);
  };

  return (
    <div className="sb-stimuli">
      <div className="sb-row-between"><strong>المواد المشتركة</strong><button type="button" className="sb-mini-btn" onClick={add} disabled={disabled}>+ إضافة مادة مشتركة</button></div>
      {entries.length === 0 && <p className="sb-hint">مادة مشتركة واحدة (مخطط أو مخرجات أوامر) يمكن ربطها بعدة أسئلة، فتُعرض مرة واحدة قبلها.</p>}
      {entries.map(([id, stim]) => (
        <div className="sb-stimulus" key={id}>
          <div className="sb-row-between">
            <code className="sb-code-chip">{id}</code>
            <button type="button" className="sb-icon-btn sb-danger" title="حذف" onClick={() => remove(id)} disabled={disabled}>×</button>
          </div>
          <input className="sb-input" value={stim.title ?? ""} placeholder="عنوان المادة المشتركة" onChange={e => patch(id, { title: e.target.value })} disabled={disabled} />
          <textarea className="sb-input sb-textarea" value={stim.text ?? ""} placeholder="نص المادة المشتركة (مثال: اعتمد على المخطط التالي للإجابة عن الأسئلة ١١–١٤)" onChange={e => patch(id, { text: e.target.value })} disabled={disabled} />
          <div className="sb-stimulus-image">
            {stim.image?.dataUrl && <img className="sb-thumb" src={stim.image.dataUrl} alt={stim.title || "مادة مشتركة"} />}
            <input type="file" accept="image/*" onChange={e => onFile(id, e.target.files?.[0])} disabled={disabled} />
            {stim.image?.dataUrl && <button type="button" className="sb-mini-btn" onClick={() => patch(id, { image: undefined })} disabled={disabled}>إزالة الصورة</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
