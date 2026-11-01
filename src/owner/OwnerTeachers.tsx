import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { IconCheck, IconCopy, IconKey, IconPlus, IconWarning } from "../icons";
import { ownerApi, ownerTeachersApi, invitationUrl, type ManagedTeacher, type TeacherAction, type TeacherInvitationLink, type ApiResult } from "./ownerApi";
import OwnerQr from "./OwnerQr";

/**
 * Tadris+ P2-A2b — «المعلمون» in the Owner Console (P2-A2a /api/owner-teachers; owner decisions §19.3).
 *   - the list of managed teachers with their state (invited / active / suspended) and last sign-in;
 *   - «إضافة معلم»: username + display name (+ optional details) → the invitation link, shown ONCE with a QR code and a copy
 *     button; the owner sends it themselves; the teacher sets their own password (the owner never sees it);
 *   - per teacher: new invitation link, password reset (new link), end sessions, suspend / reactivate — each takes effect on the
 *     teacher's next request; the disruptive ones ask for an inline confirmation (no browser dialogs);
 *   - every change needs a recent second-factor check: a STEP_UP_REQUIRED answer asks for the code inline, then retries.
 * The server decides everything; a 401 signs the owner out.
 */

type Pending = { kind: "create"; draft: Parameters<typeof ownerTeachersApi.create>[1] } | { kind: "act"; action: TeacherAction; teacher: ManagedTeacher };
type Issued = { teacher: ManagedTeacher; invitation: TeacherInvitationLink };

const STATUS_LABEL: Record<ManagedTeacher["status"], string> = { invited: "بانتظار كلمة المرور", active: "نشط", suspended: "موقوف" };
const ACTION_LABEL: Record<TeacherAction, string> = {
  reinvite: "رابط دعوة جديد", reset: "إعادة تعيين كلمة المرور", "end-sessions": "إنهاء الجلسات", suspend: "إيقاف الحساب", reactivate: "إعادة التفعيل"
};
const CONFIRM_TEXT: Partial<Record<TeacherAction, string>> = {
  suspend: "سيفقد المعلم الوصول من طلبه التالي، حتى تعيد تفعيل الحساب.",
  reset: "ستتوقف كلمة المرور الحالية وتنتهي كل جلساته، ويصدر رابط لإعادة التعيين.",
  "end-sessions": "ستنتهي كل جلسات المعلم المفتوحة على كل الأجهزة."
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

export default function OwnerTeachers({ token, onSignedOut }: { token: string; onSignedOut: () => void }) {
  const [teachers, setTeachers] = useState<ManagedTeacher[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [confirming, setConfirming] = useState<{ action: TeacherAction; teacher: ManagedTeacher } | null>(null);
  const [stepUp, setStepUp] = useState<Pending | null>(null);
  const [stepCode, setStepCode] = useState("");
  const stepInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void ownerTeachersApi.list(token).then(r => {
      if (!live) return;
      if (r.ok) setTeachers(r.data.teachers);
      else if (r.status === 401) onSignedOut();
      else setError(r.error);
    });
    return () => { live = false; };
  }, [token, onSignedOut]);
  useEffect(() => { if (stepUp) stepInput.current?.focus(); }, [stepUp]);

  const upsert = useCallback((t: ManagedTeacher) => {
    setTeachers(list => {
      const rest = (list || []).filter(x => x.accountId !== t.accountId);
      return [...rest, t].sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));
    });
  }, []);

  async function run(p: Pending): Promise<void> {
    setBusy(true);
    setError("");
    const r: ApiResult<{ teacher: ManagedTeacher; invitation?: TeacherInvitationLink }> = p.kind === "create"
      ? await ownerTeachersApi.create(token, p.draft)
      : await ownerTeachersApi.act(token, p.action, p.teacher.accountId);
    setBusy(false);
    if (r.ok) {
      setStepUp(null);
      setConfirming(null);
      upsert(r.data.teacher);
      if (r.data.invitation) setIssued({ teacher: r.data.teacher, invitation: r.data.invitation });
      if (p.kind === "create") setShowCreate(false);
      return;
    }
    if (r.status === 401) { onSignedOut(); return; }
    if (r.code === "STEP_UP_REQUIRED") { setStepUp(p); return; }
    setError(r.error);
  }

  async function confirmStepUp(event: FormEvent) {
    event.preventDefault();
    if (!stepUp || busy) return;
    const digits = stepCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(digits)) { setError("أدخل الرمز المكوّن من 6 أرقام."); return; }
    setBusy(true);
    setError("");
    const r = await ownerApi.stepUp(token, { code: digits });
    setBusy(false);
    setStepCode("");
    if (!r.ok) { if (r.status === 401 && r.code !== "TOTP_INVALID") { onSignedOut(); return; } setError(r.error); return; }
    await run(stepUp);
  }

  return (
    <section className="eb-owner-panel eb-owner-teachers" aria-labelledby="eb-owner-teachers-title">
      <div className="eb-owner-panel-head">
        <h2 id="eb-owner-teachers-title" className="eb-owner-h2">المعلمون</h2>
        {!showCreate && <button type="button" className="eb-owner-secondary" onClick={() => { setShowCreate(true); setIssued(null); }}><IconPlus size={16} aria-hidden="true" /> إضافة معلم</button>}
      </div>

      {showCreate && <CreateTeacherForm busy={busy} onCancel={() => setShowCreate(false)} onSubmit={draft => run({ kind: "create", draft })} />}

      {issued && <InvitationPanel issued={issued} onClose={() => setIssued(null)} />}

      {stepUp && (
        <form className="eb-owner-stepup" onSubmit={confirmStepUp} noValidate>
          <label className="auth-field">
            <span>هذا الإجراء حساس. أدخل رمز التحقق من التطبيق للمتابعة:</span>
            <div className="auth-input"><IconKey size={18} />
              <input ref={stepInput} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} value={stepCode} onChange={e => setStepCode(e.target.value)} dir="ltr" />
            </div>
          </label>
          <div className="eb-owner-actions">
            <button type="submit" className="auth-submit" disabled={busy}>تأكيد</button>
            <button type="button" className="eb-owner-secondary" onClick={() => { setStepUp(null); setStepCode(""); setError(""); }}>إلغاء</button>
          </div>
        </form>
      )}

      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}

      {teachers === null && !error && <p className="eb-owner-hint" role="status">جارٍ تحميل المعلمين…</p>}
      {teachers && teachers.length === 0 && <p className="eb-owner-hint">لا يوجد معلمون مُدارون بعد. أضف أول معلم، ثم أرسل له رابط الدعوة.</p>}
      {teachers && teachers.length > 0 && (
        <ul className="eb-owner-teacher-list" aria-label="المعلمون">
          {teachers.map(t => (
            <li key={t.accountId} className="eb-owner-teacher">
              <div className="eb-owner-teacher-main">
                <strong><bdi>{t.displayName}</bdi></strong>
                <span className="eb-owner-teacher-user" dir="ltr">{t.username}</span>
                <span className={"eb-owner-status eb-owner-status--" + t.status}>{STATUS_LABEL[t.status]}</span>
              </div>
              <p className="eb-owner-hint">
                {t.lastLoginAt ? <>آخر دخول: <bdi>{formatDate(t.lastLoginAt)}</bdi></> : "لم يدخل بعد."}
                {t.invitation && <> · رابط {t.invitation.purpose === "reset" ? "إعادة التعيين" : "الدعوة"} صالح حتى <bdi>{formatDate(t.invitation.expiresAt)}</bdi></>}
              </p>
              {confirming && confirming.teacher.accountId === t.accountId ? (
                <div className="eb-owner-confirm" role="group" aria-label={"تأكيد " + ACTION_LABEL[confirming.action]}>
                  <p>{CONFIRM_TEXT[confirming.action]}</p>
                  <div className="eb-owner-actions">
                    <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={() => run({ kind: "act", action: confirming.action, teacher: t })}>تأكيد: {ACTION_LABEL[confirming.action]}</button>
                    <button type="button" className="eb-owner-secondary" onClick={() => setConfirming(null)}>إلغاء</button>
                  </div>
                </div>
              ) : (
                <div className="eb-owner-actions">
                  {actionsFor(t).map(action => (
                    <button key={action} type="button" className={"eb-owner-secondary" + (action === "suspend" ? " eb-owner-danger" : "")} disabled={busy}
                      onClick={() => CONFIRM_TEXT[action] ? setConfirming({ action, teacher: t }) : run({ kind: "act", action, teacher: t })}>
                      {ACTION_LABEL[action]}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function actionsFor(t: ManagedTeacher): TeacherAction[] {
  if (t.status === "suspended") return ["reactivate"];
  if (!t.hasPassword) return ["reinvite", "suspend"];
  return ["reset", "end-sessions", "suspend"];
}

function CreateTeacherForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (d: Parameters<typeof ownerTeachersApi.create>[1]) => void; onCancel: () => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subjects, setSubjects] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!username.trim() || !displayName.trim()) { setError("اسم المستخدم واسم العرض مطلوبان."); return; }
    setError("");
    onSubmit({
      username: username.trim(), displayName: displayName.trim(), fullName: fullName.trim(), email: email.trim(), phone: phone.trim(),
      subjects: subjects.split(/[,،]/).map(s => s.trim()).filter(Boolean), notes: notes.trim()
    });
  }

  return (
    <form className="auth-form eb-owner-create" onSubmit={submit} noValidate aria-label="إضافة معلم">
      <div className="eb-owner-grid">
        <label className="auth-field"><span>اسم المستخدم</span>
          <div className="auth-input"><input type="text" value={username} onChange={e => setUsername(e.target.value)} dir="ltr" spellCheck={false} autoComplete="off" placeholder="t.ahmad" /></div>
          <small className="eb-owner-hint">أحرف إنجليزية صغيرة وأرقام و . _ - ، وليس أرقامًا فقط. لا يُستخدم رقم الهوية.</small>
        </label>
        <label className="auth-field"><span>اسم العرض</span>
          <div className="auth-input"><input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={60} /></div>
        </label>
        <label className="auth-field"><span>الاسم الكامل (اختياري)</span>
          <div className="auth-input"><input type="text" value={fullName} onChange={e => setFullName(e.target.value)} maxLength={120} /></div>
        </label>
        <label className="auth-field"><span>البريد الإلكتروني (اختياري)</span>
          <div className="auth-input"><input type="email" value={email} onChange={e => setEmail(e.target.value)} dir="ltr" maxLength={160} /></div>
        </label>
        <label className="auth-field"><span>الهاتف (اختياري)</span>
          <div className="auth-input"><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" maxLength={40} /></div>
        </label>
        <label className="auth-field"><span>المواد (اختياري، افصل بفاصلة)</span>
          <div className="auth-input"><input type="text" value={subjects} onChange={e => setSubjects(e.target.value)} /></div>
        </label>
      </div>
      <label className="auth-field"><span>ملاحظات إدارية (اختياري، لا يراها المعلم)</span>
        <textarea className="eb-owner-textarea" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={2} />
      </label>
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      <div className="eb-owner-actions">
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "جارٍ الإنشاء…" : "إنشاء الحساب وإصدار رابط الدعوة"}</button>
        <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

function InvitationPanel({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = invitationUrl(issued.invitation.invitationPath);
  const reset = issued.invitation.purpose === "reset";
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
  }
  return (
    <div className="eb-owner-notice eb-owner-invite" role="region" aria-label={reset ? "رابط إعادة تعيين كلمة المرور" : "رابط الدعوة"}>
      <p>{reset ? "رابط إعادة تعيين كلمة المرور لـ" : "رابط الدعوة لـ"} <bdi>{issued.teacher.displayName}</bdi> (<bdi dir="ltr">{issued.teacher.username}</bdi>). أرسله للمعلم بنفسك. صالح حتى <bdi>{formatDate(issued.invitation.expiresAt)}</bdi>، ويُستخدم مرة واحدة.</p>
      <code className="eb-owner-link-text" dir="ltr">{url}</code>
      <div className="eb-owner-actions">
        <button type="button" className="eb-owner-secondary" onClick={copy}>
          {copied ? <IconCheck size={16} aria-hidden="true" /> : <IconCopy size={16} aria-hidden="true" />}
          {copied ? "تم نسخ الرابط" : "نسخ الرابط"}
        </button>
        <button type="button" className="eb-owner-secondary" onClick={onClose}>إغلاق</button>
      </div>
      <OwnerQr value={url} label={"رمز QR لرابط " + (reset ? "إعادة التعيين" : "الدعوة")} />
      <p className="eb-owner-hint">لن يظهر هذا الرابط مرة أخرى. إذا ضاع، أصدر رابطًا جديدًا (الرابط السابق يتوقف تلقائيًا).</p>
    </div>
  );
}
