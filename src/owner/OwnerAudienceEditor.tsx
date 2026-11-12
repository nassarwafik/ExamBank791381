import { useState } from "react";
import type { LibraryAudience, OwnerLibraryItem, OwnerLibraryTeacher } from "./ownerApi";
import { SAVE_LABELS } from "../teacher/saveLabels";

// Tadris+ P6-D — «من يرى هذا الامتحان؟»: everyone, or a group of teachers chosen at once (with a search). Moved unchanged out of
// OwnerLibrary.tsx in P6-E so the import's last step («تحديد الجمهور») uses the very same editor as the table.
export default function AudienceEditor({ item, teachers, busy, onSave, onCancel }: {
  item: OwnerLibraryItem; teachers: OwnerLibraryTeacher[]; busy: boolean; onSave: (audience: LibraryAudience, teachers: string[]) => void; onCancel: () => void;
}) {
  const [audience, setAudience] = useState<LibraryAudience>(item.audience);
  const [chosen, setChosen] = useState<Set<string>>(new Set(item.teachers));
  const [q, setQ] = useState("");
  const visible = teachers.filter(t => !q.trim() || (t.displayName + " " + t.username).toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => setChosen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const name = "eb-aud-" + item.libraryItemId;
  return (
    <form className="auth-form eb-owner-create" aria-label={"جمهور " + item.title} onSubmit={e => { e.preventDefault(); onSave(audience, audience === "all" ? [] : [...chosen].sort()); }}>
      <fieldset className="eb-owner-cap-group">
        <legend>من يرى هذا الامتحان؟</legend>
        <label className="eb-owner-check"><input type="radio" name={name} checked={audience === "all"} onChange={() => setAudience("all")} /> لكل المعلمين (ومن يُضاف لاحقًا)</label>
        <label className="eb-owner-check"><input type="radio" name={name} checked={audience === "selected"} onChange={() => setAudience("selected")} /> معلمون أختارهم</label>
      </fieldset>
      {audience === "selected" && (
        <fieldset className="eb-owner-cap-group">
          <legend>المعلمون ({chosen.size} مختار)</legend>
          <label className="auth-field"><span>بحث عن معلم</span>
            <div className="auth-input"><input type="search" value={q} onChange={e => setQ(e.target.value)} /></div>
          </label>
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary" onClick={() => setChosen(s => new Set([...s, ...visible.map(t => t.accountId)]))}>تحديد الظاهرين</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setChosen(new Set())}>إلغاء التحديد</button>
          </div>
          {visible.map(t => (
            <label key={t.accountId} className="eb-owner-check"><input type="checkbox" checked={chosen.has(t.accountId)} onChange={() => toggle(t.accountId)} /> <bdi>{t.displayName}</bdi> <span dir="ltr" className="eb-owner-hint">{t.username}</span></label>
          ))}
          {!visible.length && <p className="eb-owner-hint">لا يوجد معلمون مطابقون.</p>}
        </fieldset>
      )}
      <div className="eb-owner-actions">
        <button type="submit" className="auth-submit" disabled={busy}>{SAVE_LABELS.saveChanges}</button>
        <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
