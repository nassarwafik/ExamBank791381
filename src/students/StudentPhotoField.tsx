import { useRef, useState } from "react";
import ProfileAvatar from "../ui/ProfileAvatar";
import { useProfilePhoto } from "../ui/useProfilePhoto";
import { IconUpload, IconTrash } from "../icons";
import type { ProfilePhotoMeta } from "./types";

/**
 * Teacher-only student photo control (top of «تعديل تفاصيل الطالب»): circular preview (photo → preset avatar →
 * default), «اختيار صورة من الحاسوب» (JPEG/PNG/WebP, ≤ 3 MB — the server re-validates and normalizes), «إزالة
 * الصورة», with preview / loading / error / success states and no full reload. Uploads go to
 * POST /api/student-profile-photo as a data URL; the returned metadata is handed back to the roster row.
 */
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 3 * 1024 * 1024;

export default function StudentPhotoField({ token, studentId, studentName, avatarId, profilePhoto, onChange }: {
  token: string; studentId: string; studentName: string; avatarId?: string; profilePhoto: ProfilePhotoMeta | null; onChange: (meta: ProfilePhotoMeta | null) => void;
}) {
  const headers = { "x-builder-token": token, Authorization: "Bearer " + token };
  const current = useProfilePhoto("/api/student-profile-photo?studentId=" + encodeURIComponent(studentId), headers, profilePhoto?.version ?? null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(""); setNotice("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("نوع الملف غير مدعوم. المسموح: JPEG أو PNG أو WebP."); return; }
    if (file.size > MAX_BYTES) { setError("حجم الصورة كبير جدًا. الحد الأقصى 3 ميغابايت."); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result || "")); r.onerror = () => reject(new Error("read")); r.readAsDataURL(file); }).catch(() => "");
    if (!dataUrl) { setError("تعذّر قراءة الملف."); return; }
    setPreview(dataUrl); setBusy(true);
    try {
      const r = await fetch("/api/student-profile-photo", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ action: "upload", studentId, dataUrl }) });
      const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string; profilePhoto?: ProfilePhotoMeta | null };
      if (!r.ok || !j.ok) throw new Error(j.error || "تعذّر رفع الصورة.");
      onChange(j.profilePhoto ?? null);
      setNotice("تم حفظ صورة الطالب.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر رفع الصورة."); }
    finally { setBusy(false); setPreview(null); if (inputRef.current) inputRef.current.value = ""; }
  }
  async function remove() {
    setError(""); setNotice(""); setBusy(true);
    try {
      const r = await fetch("/api/student-profile-photo", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ action: "remove", studentId }) });
      const j = await r.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || "تعذّر إزالة الصورة.");
      onChange(null);
      setNotice("تمت إزالة الصورة؛ ستظهر الأيقونة التي اختارها الطالب.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر إزالة الصورة."); }
    finally { setBusy(false); }
  }

  return (
    <div className="eb-student-photo" aria-label="صورة الطالب">
      <ProfileAvatar photoUrl={preview || current} avatarId={avatarId} name={studentName} size={72} onClick={() => inputRef.current?.click()} label="اختيار صورة من الحاسوب" />
      <div className="eb-student-photo-body">
        <p className="eb-student-photo-title">صورة الطالب</p>
        <p className="eb-muted eb-student-photo-hint">الصورة الشخصية يحددها المعلم فقط (JPEG أو PNG أو WebP، حتى 3 ميغابايت). يختار الطالب أيقونة تظهر عند عدم وجود صورة.</p>
        <input ref={inputRef} type="file" accept={ACCEPT} className="eb-visually-hidden-input" aria-label="ملف صورة الطالب" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} disabled={busy} />
        <div className="eb-inline-actions">
          <button type="button" className="eb-button is-small" onClick={() => inputRef.current?.click()} disabled={busy}><IconUpload size={14} />{profilePhoto ? "استبدال الصورة" : "اختيار صورة من الحاسوب"}</button>
          {profilePhoto && <button type="button" className="eb-button is-small is-danger" onClick={() => void remove()} disabled={busy}><IconTrash size={14} />إزالة الصورة</button>}
        </div>
        {busy && <p className="eb-muted" role="status">جارٍ حفظ الصورة...</p>}
        {notice && !busy && <p className="eb-student-photo-notice" role="status">{notice}</p>}
        {error && <p className="platform-error eb-student-photo-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
