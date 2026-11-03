import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { IconPlus, IconWarning } from "../icons";
import { ownerSchoolsApi, ownerTeachersApi, ownerSchoolLogoUrl, type ApiResult, type ManagedSchool, type ManagedTeacher } from "./ownerApi";
import StepUpPrompt from "./StepUpPrompt";
import DataTable, { type DataColumn } from "../ui/DataTable";
import SchoolBadge from "../ui/SchoolBadge";
import { useProfilePhoto } from "../ui/useProfilePhoto";

/**
 * Tadris+ P4-C — «المدارس» in the Owner Console (#/owner/schools; /api/owner-schools). Owner decisions §19.2 / §19.8:
 *   - a school is a name and an optional logo; it is presentation only (it grants nothing and changes no data);
 *   - the logo: JPEG / PNG / WebP up to 3 MB (the server checks the real bytes, never SVG, and re-encodes it); it is shown at the
 *     top of the page of every teacher linked to the school AND of their students; the preview shows exactly that badge;
 *   - «المعلمون والمدارس»: each teacher's school (or none), saved on change;
 *   - every change needs a recent second-factor check (asked inline, then retried). The server decides everything; 401 signs out.
 */

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 3 * 1024 * 1024;

export default function OwnerSchools({ token, onSignedOut }: { token: string; onSignedOut: () => void }) {
  const [schools, setSchools] = useState<ManagedSchool[] | null>(null);
  const [teachers, setTeachers] = useState<ManagedTeacher[]>([]);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stepUp, setStepUp] = useState<{ retry: () => Promise<void> } | null>(null);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([ownerSchoolsApi.list(token), ownerTeachersApi.list(token)]).then(([s, t]) => {
      if (!live) return;
      if ((!s.ok && s.status === 401) || (!t.ok && t.status === 401)) { onSignedOut(); return; }
      if (!s.ok) { setError(s.error); return; }
      setSchools(s.data.schools);
      if (t.ok) setTeachers(t.data.teachers);
    });
    return () => { live = false; };
  }, [token, nonce, onSignedOut]);
  const reload = () => setNonce(n => n + 1);

  async function send<T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void): Promise<void> {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await call();
    setBusy(false);
    if (r.ok) { setStepUp(null); onOk(r.data); return; }
    if (r.status === 401) { onSignedOut(); return; }
    if (r.code === "STEP_UP_REQUIRED") { setStepUp({ retry: () => send(call, onOk) }); return; }
    setStepUp(null);
    setError(r.error);
  }

  function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const name = newName.trim();
    if (!name) { setError("اكتب اسم المدرسة."); return; }
    void send(() => ownerSchoolsApi.create(token, name), () => { setNewName(""); setShowCreate(false); setNotice("أُنشئت المدرسة."); reload(); });
  }

  const linkColumns: DataColumn<ManagedTeacher>[] = [
    { id: "name", header: "المعلم", cell: t => <bdi>{t.displayName}</bdi> },
    { id: "user", header: "اسم المستخدم", cell: t => <bdi dir="ltr">{t.username}</bdi> },
    { id: "school", header: "المدرسة", cell: t => (
      <select aria-label={"مدرسة " + t.displayName} value={t.schoolId || ""} disabled={busy || !schools}
        onChange={e => { const next = e.target.value || null; void send(() => ownerSchoolsApi.link(token, t.accountId, next), () => { setNotice("حُفظت مدرسة " + t.displayName + "."); reload(); }); }}>
        <option value="">بلا مدرسة</option>
        {(schools || []).map(s => <option key={s.schoolId} value={s.schoolId}>{s.name}</option>)}
      </select>
    ) }
  ];

  return (
    <section className="eb-owner-panel eb-owner-schools" aria-labelledby="eb-owner-schools-title">
      <div className="eb-owner-panel-head">
        <h2 id="eb-owner-schools-title" className="eb-owner-h2">المدارس</h2>
        {!showCreate && <button type="button" className="eb-owner-secondary" onClick={() => setShowCreate(true)}><IconPlus size={16} aria-hidden="true" /> إضافة مدرسة</button>}
      </div>
      <p className="eb-owner-hint">اسم المدرسة وشعارها يظهران أعلى صفحة كل معلم مرتبط بها، وأعلى بوابة طلابه. هذا عرض فقط: لا يمنح أي صلاحية ولا يغيّر أي بيانات.</p>

      {stepUp && <StepUpPrompt token={token} onSignedOut={onSignedOut} onCancel={() => setStepUp(null)} onConfirmed={() => stepUp.retry()} />}
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      {notice && <p className="eb-owner-hint eb-owner-done" role="status">{notice}</p>}

      {showCreate && (
        <form className="auth-form eb-owner-create" onSubmit={create} noValidate aria-label="إضافة مدرسة">
          <label className="auth-field"><span>اسم المدرسة</span>
            <div className="auth-input"><input type="text" value={newName} onChange={e => setNewName(e.target.value)} maxLength={120} /></div>
          </label>
          <div className="eb-owner-actions">
            <button type="submit" className="auth-submit" disabled={busy}>إنشاء المدرسة</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setShowCreate(false)}>إلغاء</button>
          </div>
        </form>
      )}

      {schools === null && !error && <p className="eb-owner-hint" role="status">جارٍ تحميل المدارس…</p>}
      {schools && schools.length === 0 && <p className="eb-owner-hint">لا توجد مدارس بعد. أضف مدرسة، ثم ارفع شعارها واربط بها المعلمين.</p>}
      {schools && schools.length > 0 && (
        <ul className="eb-owner-teacher-list" aria-label="المدارس">
          {schools.map(s => <SchoolCard key={s.schoolId + "@" + (s.logo ? s.logo.version : 0)} school={s} token={token} busy={busy}
            onRename={name => send(() => ownerSchoolsApi.rename(token, s.schoolId, name), () => { setNotice("حُفظ اسم المدرسة."); reload(); })}
            onLogo={dataUrl => send(() => ownerSchoolsApi.uploadLogo(token, s.schoolId, dataUrl), () => { setNotice("حُفظ الشعار."); reload(); })}
            onRemoveLogo={() => send(() => ownerSchoolsApi.removeLogo(token, s.schoolId), () => { setNotice("أُزيل الشعار."); reload(); })}
            onError={setError} />)}
        </ul>
      )}

      {schools && schools.length > 0 && (
        <DataTable caption="المعلمون والمدارس" columns={linkColumns} rows={teachers} rowKey={t => t.accountId} emptyText="لا يوجد معلمون بعد." />
      )}
    </section>
  );
}

function SchoolCard({ school, token, busy, onRename, onLogo, onRemoveLogo, onError }: {
  school: ManagedSchool; token: string; busy: boolean; onRename: (name: string) => void; onLogo: (dataUrl: string) => void; onRemoveLogo: () => void; onError: (m: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(school.name);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const logoUrl = useProfilePhoto(school.logo ? ownerSchoolLogoUrl(school.schoolId) : null, { "x-owner-token": token }, school.logo ? school.logo.version : null);

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) { onError("نوع الملف غير مدعوم. المسموح: JPEG أو PNG أو WebP."); return; }
    if (file.size > MAX_BYTES) { onError("حجم الصورة كبير جدًا. الحد الأقصى 3 ميغابايت."); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") onLogo(reader.result); };
    reader.onerror = () => onError("تعذّر قراءة الملف.");
    reader.readAsDataURL(file);
  }

  return (
    <li className="eb-owner-teacher" aria-label={school.name}>
      <div className="eb-owner-teacher-main">
        <strong><bdi>{school.name}</bdi></strong>
        <span className="eb-owner-status eb-owner-status--active">{school.teachers} {school.teachers === 1 ? "معلم" : "معلمين"}</span>
      </div>
      <div className="eb-owner-school-preview" role="region" aria-label={"معاينة شعار " + school.name}>
        <small className="eb-owner-hint">هكذا يظهر أعلى الصفحة:</small>
        <SchoolBadge name={school.name} logoUrl={logoUrl} />
        {!school.logo && <small className="eb-owner-hint">لا يوجد شعار بعد.</small>}
      </div>
      {renaming ? (
        <form className="eb-owner-actions" onSubmit={e => { e.preventDefault(); const n = name.trim(); if (n) { onRename(n); setRenaming(false); } }} aria-label={"تعديل اسم " + school.name}>
          <label className="auth-field"><span>الاسم الجديد</span>
            <div className="auth-input"><input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={120} /></div>
          </label>
          <button type="submit" className="eb-owner-secondary" disabled={busy || !name.trim()}>حفظ الاسم</button>
          <button type="button" className="eb-owner-secondary" onClick={() => { setRenaming(false); setName(school.name); }}>إلغاء</button>
        </form>
      ) : confirmRemove ? (
        <div className="eb-owner-confirm" role="group" aria-label={"تأكيد إزالة شعار " + school.name}>
          <p>سيختفي الشعار من صفحات المعلمين والطلاب المرتبطين بهذه المدرسة، ويبقى الاسم.</p>
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={() => { setConfirmRemove(false); onRemoveLogo(); }}>تأكيد: إزالة الشعار</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setConfirmRemove(false)}>إلغاء</button>
          </div>
        </div>
      ) : (
        <div className="eb-owner-actions">
          <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => setRenaming(true)}>تعديل الاسم</button>
          <label className={"eb-owner-secondary eb-owner-file" + (busy ? " is-disabled" : "")}>
            {school.logo ? "تغيير الشعار" : "رفع شعار"}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={pick} aria-label={(school.logo ? "تغيير شعار " : "رفع شعار ") + school.name} />
          </label>
          {school.logo && <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={() => setConfirmRemove(true)}>إزالة الشعار</button>}
        </div>
      )}
      <small className="eb-owner-hint">الشعار: JPEG أو PNG أو WebP حتى 3 ميغابايت. يُحفظ بنسخة آمنة دون قصّ.</small>
    </li>
  );
}
