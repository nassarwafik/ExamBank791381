import { useEffect, useState } from "react";
import { IconWarning } from "../icons";
import { ownerHandoffApi, ownerTeachersApi, type ApiResult, type LinkedTeacher, type ManagedTeacher } from "./ownerApi";
import StepUpPrompt from "./StepUpPrompt";

/**
 * Tadris+ P4-D — owner decision D19 (blueprint §19.4): «مساحة المعلم الخاصة بك» on the console overview. The owner is also a
 * teacher; their classes and students belong to their TEACHER account, which stays separate from the owner account.
 *   - link ONE teacher account (or change / remove the link) — needs the second-factor check;
 *   - «الانتقال إلى مساحة المعلم الخاصة بي» asks the server for a one-time link valid 60 seconds, then offers it as a link that
 *     opens a NEW tab (noopener: the new tab never shares this tab's storage, so it never holds the owner's token). There, the
 *     server exchanges it for an ordinary teacher session; this owner session is not affected, and signing out of either never
 *     ends the other.
 * The server decides everything (the linked account must be active, with a password, not suspended, trial not ended).
 */
const REASON: Record<string, string> = {
  TEACHER_NOT_FOUND: "حساب المعلم المرتبط غير موجود.",
  TEACHER_SUSPENDED: "حساب المعلم المرتبط موقوف. أعد تفعيله من قسم «المعلمون».",
  TEACHER_NOT_ACTIVE: "حساب المعلم المرتبط لم تُوضع له كلمة مرور بعد. افتح رابط الدعوة وضع كلمة المرور أولًا.",
  TEACHER_TRIAL_ENDED: "انتهت الفترة التجريبية لحساب المعلم المرتبط."
};

export default function OwnerTeacherWorkspace({ token, onSignedOut }: { token: string; onSignedOut: () => void }) {
  const [linked, setLinked] = useState<LinkedTeacher | null | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [teachers, setTeachers] = useState<ManagedTeacher[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [ticket, setTicket] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stepUp, setStepUp] = useState<{ retry: () => Promise<void> } | null>(null);

  useEffect(() => {
    let live = true;
    void ownerHandoffApi.get(token).then(r => {
      if (!live) return;
      if (r.ok) setLinked(r.data.linked);
      else if (r.status === 401) onSignedOut();
      else setLoadFailed(true);
    });
    return () => { live = false; };
  }, [token, onSignedOut]);

  async function send<T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void): Promise<void> {
    setBusy(true);
    setError("");
    const r = await call();
    setBusy(false);
    if (r.ok) { setStepUp(null); onOk(r.data); return; }
    if (r.status === 401) { onSignedOut(); return; }
    if (r.code === "STEP_UP_REQUIRED") { setStepUp({ retry: () => send(call, onOk) }); return; }
    setStepUp(null);
    setError(r.error);
  }

  async function startChoosing() {
    setChoosing(true);
    setTicket(null);
    if (teachers) return;
    const r = await ownerTeachersApi.list(token);
    if (r.ok) setTeachers(r.data.teachers);
    else if (r.status === 401) onSignedOut();
    else setError(r.error);
  }

  const link = (accountId: string | null) => send(() => ownerHandoffApi.link(token, accountId), d => { setLinked(d.linked); setChoosing(false); setConfirmUnlink(false); setPicked(""); });
  const open = () => send(() => ownerHandoffApi.issue(token), d => setTicket({ url: window.location.pathname + d.handoffPath, expiresAt: d.expiresAt }));

  return (
    <div className="eb-owner-panel" role="region" aria-labelledby="eb-owner-workspace-title">
      <h2 id="eb-owner-workspace-title" className="eb-owner-h2">مساحة المعلم الخاصة بك</h2>
      <p className="eb-owner-hint">حسابك كمالك منفصل عن حسابك كمعلم للأمان. صفوفك وطلابك وامتحاناتك في حساب المعلم، وتفتحه من هنا في تبويب جديد دون كلمة مرور ثانية.</p>
      {linked === undefined && !loadFailed && <p className="eb-owner-hint" role="status">جارٍ التحميل…</p>}
      {loadFailed && <p className="eb-owner-hint">تعذر تحميل حالة الربط الآن.</p>}

      {linked === null && !choosing && (
        <>
          <p className="eb-owner-hint">لم تربط حسابك بحساب معلم بعد.</p>
          <div className="eb-owner-actions"><button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => void startChoosing()}>ربط حساب معلم</button></div>
        </>
      )}

      {linked && !choosing && (
        <>
          <p className="eb-owner-hint">مرتبط بحساب المعلم: <strong><bdi>{linked.displayName}</bdi></strong> (<bdi dir="ltr">{linked.username}</bdi>)</p>
          {!linked.usable && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{REASON[linked.reason || ""] || "لا يمكن فتح مساحة المعلم الآن."}</div>}
          {ticket ? (
            <div className="eb-owner-notice eb-owner-invite" role="group" aria-label="رابط الانتقال">
              <p>الرابط جاهز. يُفتح في تبويب جديد، ويصلح مرة واحدة خلال دقيقة.</p>
              <div className="eb-owner-actions">
                <a className="auth-submit eb-invite-go" href={ticket.url} target="_blank" rel="noopener noreferrer" onClick={() => setTicket(null)}>فتح مساحة المعلم في تبويب جديد</a>
                <button type="button" className="eb-owner-secondary" onClick={() => setTicket(null)}>إلغاء</button>
              </div>
            </div>
          ) : (
            <div className="eb-owner-actions">
              <button type="button" className="auth-submit" disabled={busy || !linked.usable} onClick={() => void open()}>الانتقال إلى مساحة المعلم الخاصة بي</button>
              <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => void startChoosing()}>تغيير الحساب المرتبط</button>
              <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={() => setConfirmUnlink(true)}>فك الربط</button>
            </div>
          )}
          {confirmUnlink && (
            <div className="eb-owner-confirm" role="group" aria-label="تأكيد فك الربط">
              <p>لن يظهر زر الانتقال حتى تربط حسابًا من جديد. لا يتغير شيء في حساب المعلم نفسه.</p>
              <div className="eb-owner-actions">
                <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={() => void link(null)}>تأكيد: فك الربط</button>
                <button type="button" className="eb-owner-secondary" onClick={() => setConfirmUnlink(false)}>إلغاء</button>
              </div>
            </div>
          )}
        </>
      )}

      {choosing && (
        <div className="eb-owner-confirm eb-owner-access" role="group" aria-label="ربط حساب معلم">
          <label className="auth-field"><span>حساب المعلم الخاص بك</span>
            <div className="auth-input">
              <select value={picked} onChange={e => setPicked(e.target.value)}>
                <option value="">اختر…</option>
                {(teachers || []).map(t => <option key={t.accountId} value={t.accountId}>{t.displayName + " (" + t.username + ")"}</option>)}
              </select>
            </div>
          </label>
          <p className="eb-owner-hint">اختر الحساب الذي تدرّس به أنت. لا يُنقل أي شيء بين الحسابين.</p>
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary" disabled={busy || !picked} onClick={() => void link(picked)}>ربط</button>
            <button type="button" className="eb-owner-secondary" onClick={() => { setChoosing(false); setPicked(""); }}>إلغاء</button>
          </div>
        </div>
      )}

      {stepUp && <StepUpPrompt token={token} onSignedOut={onSignedOut} onCancel={() => setStepUp(null)} onConfirmed={() => stepUp.retry()} />}
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
    </div>
  );
}
