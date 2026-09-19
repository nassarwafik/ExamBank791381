import { useRef, useState } from "react";
import Dialog from "../ui/Dialog";
import ProfileAvatar from "../ui/ProfileAvatar";
import { AVATAR_OPTIONS } from "../avatars";
import { IconUpload, IconTrash } from "../icons";
import { teacherProfileApi, type TeacherProfile } from "./teacherProfile";

/**
 * «ملف المعلم» — the teacher's OWN identity only (the server acts on the token subject): choose a preset icon,
 * upload / replace / remove a personal photo (JPEG / PNG / WebP ≤ 3 MB, normalized server-side), and optionally the
 * display name. Shared Dialog primitive (focus trap, Escape, focus return); every change is one explicit action.
 */
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 3 * 1024 * 1024;

export default function TeacherProfileDialog({ open, token, profile, photoUrl, onClose, onChange }: {
  open: boolean; token: string; profile: TeacherProfile; photoUrl: string | null; onClose: () => void; onChange: (profile: TeacherProfile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(profile.hasCustomName ? profile.displayName : "");
  const inputRef = useRef<HTMLInputElement>(null);

  async function run(label: string, work: () => Promise<TeacherProfile>) {
    setBusy(true); setError(""); setNotice("");
    try { onChange(await work()); setNotice(label); }
    catch (e) { setError(e instanceof Error ? e.message : "حدث خطأ."); }
    finally { setBusy(false); setPreview(null); if (inputRef.current) inputRef.current.value = ""; }
  }
  async function upload(file: File) {
    setError(""); setNotice("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("نوع الملف غير مدعوم. المسموح: JPEG أو PNG أو WebP."); return; }
    if (file.size > MAX_BYTES) { setError("حجم الصورة كبير جدًا. الحد الأقصى 3 ميغابايت."); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || "")); r.onerror = () => reject(new Error("read")); r.readAsDataURL(file); }).catch(() => "");
    if (!dataUrl) { setError("تعذّر قراءة الملف."); return; }
    setPreview(dataUrl);
    await run("تم حفظ صورتك الشخصية.", () => teacherProfileApi.uploadPhoto(token, dataUrl));
  }

  return (
    <Dialog open={open} title="ملف المعلم" size="sm" onClose={() => { if (!busy) onClose(); }}
      footer={<button type="button" className="eb-button" onClick={onClose} disabled={busy}>إغلاق</button>}>
      <div className="eb-teacher-profile">
        <div className="eb-teacher-profile-photo">
          <ProfileAvatar photoUrl={preview || photoUrl} avatarId={profile.avatarId} name={profile.displayName} size={88} onClick={() => inputRef.current?.click()} label="اختيار صورة شخصية من الحاسوب" />
          <div className="eb-teacher-profile-photo-body">
            <p className="eb-teacher-profile-title">صورتك الشخصية</p>
            <p className="eb-muted">JPEG أو PNG أو WebP، حتى 3 ميغابايت. تُعرض قبل الأيقونة المختارة.</p>
            <input ref={inputRef} type="file" accept={ACCEPT} className="eb-visually-hidden-input" aria-label="ملف الصورة الشخصية للمعلم" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} disabled={busy} />
            <div className="eb-inline-actions">
              <button type="button" className="eb-button is-small" onClick={() => inputRef.current?.click()} disabled={busy}><IconUpload size={14} />{profile.profilePhoto ? "استبدال الصورة" : "رفع صورة شخصية"}</button>
              {profile.profilePhoto && <button type="button" className="eb-button is-small is-danger" onClick={() => void run("تمت إزالة الصورة؛ تظهر الأيقونة المختارة.", () => teacherProfileApi.removePhoto(token))} disabled={busy}><IconTrash size={14} />إزالة الصورة</button>}
            </div>
          </div>
        </div>
        <fieldset className="eb-teacher-profile-avatars">
          <legend>الأيقونة الافتراضية</legend>
          <div className="eb-sp-avatar-grid" role="group" aria-label="الأيقونات المتاحة">
            {AVATAR_OPTIONS.map(opt => (
              <button key={opt.id} type="button" className="eb-sp-avatar-option" style={{ background: opt.bg }} aria-label={opt.label} aria-pressed={profile.avatarId === opt.id} disabled={busy} onClick={() => void run("تم حفظ الأيقونة.", () => teacherProfileApi.setAvatar(token, opt.id))}>
                <span aria-hidden="true">{opt.emoji}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <form className="eb-teacher-profile-name" onSubmit={e => { e.preventDefault(); if (nameDraft.trim()) void run("تم حفظ الاسم.", () => teacherProfileApi.setDisplayName(token, nameDraft.trim())); }}>
          <label>اسم المعلم<input value={nameDraft} onChange={e => setNameDraft(e.target.value)} maxLength={60} placeholder={profile.displayName} autoComplete="name" disabled={busy} /></label>
          <button type="submit" className="eb-button is-small" disabled={busy || !nameDraft.trim() || nameDraft.trim() === (profile.hasCustomName ? profile.displayName : "")}>حفظ الاسم</button>
        </form>
        {busy && <p className="eb-muted" role="status">جارٍ الحفظ...</p>}
        {notice && !busy && <p className="eb-teacher-profile-notice" role="status">{notice}</p>}
        {error && <p className="platform-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
