import { AVATAR_OPTIONS } from "../avatars";
import Dialog from "../ui/Dialog";

/** Avatar picker on the shared Dialog primitive (focus trap, Escape, focus return). Closing is blocked while a save is in flight. */
export default function AvatarPickerDialog({ open, current, saving, onPick, onClose }: { open: boolean; current?: string; saving: boolean; onPick: (avatarId: string) => void; onClose: () => void }) {
  return (
    <Dialog open={open} title="اختر أيقونتك" size="sm" onClose={() => { if (!saving) onClose(); }}
      footer={<button type="button" className="eb-button" onClick={onClose} disabled={saving}>إغلاق</button>}>
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
