import { AVATAR_OPTIONS } from "../avatars";
import Dialog from "../ui/Dialog";

/** Avatar picker on the shared Dialog primitive (focus trap, Escape, focus return). Closing is blocked while a save is in flight. */
export default function AvatarPickerDialog({ open, current, saving, photoManaged = false, onPick, onClose }: { open: boolean; current?: string; saving: boolean; /** A teacher-managed photo exists: the preset is only the fallback. */ photoManaged?: boolean; onPick: (avatarId: string) => void; onClose: () => void }) {
  return (
    <Dialog open={open} title="اختر أيقونتك" size="sm" onClose={() => { if (!saving) onClose(); }}
      footer={<button type="button" className="eb-button" onClick={onClose} disabled={saving}>إغلاق</button>}>
      {photoManaged && <p className="eb-muted eb-sp-avatar-note">الصورة الشخصية يحددها المعلم. يمكنك اختيار الأيقونة التي ستظهر إذا أزيلت الصورة الشخصية.</p>}
      <div className="eb-sp-avatar-grid" role="group" aria-label="الأيقونات المتاحة">
        {AVATAR_OPTIONS.map(opt => (
          <button key={opt.id} type="button" className="eb-sp-avatar-option" style={{ background: opt.bg }} aria-label={opt.label} aria-pressed={current === opt.id} disabled={saving} onClick={() => onPick(opt.id)}>
            <span aria-hidden="true">{opt.emoji}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
