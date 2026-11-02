import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { IconKey, IconWarning } from "../icons";
import { ownerApi, ownerAccessApi, type AccessCapability, type AccessMode, type ReadinessTeacher } from "./ownerApi";

/**
 * Tadris+ P3-B — «وضع الصلاحيات» in the Owner Console (/api/owner-access, /api/owner-access/readiness).
 *   - the rollout mode: «عادي» (nothing evaluated — today) or «مراقبة» (every teacher request is evaluated and what WOULD have
 *     been refused is recorded, nothing is blocked); switching needs a recent second-factor check;
 *   - readiness: teachers left without an access preset (they would be refused everything once enforcement exists), and per
 *     teacher what the observe mode recorded.
 * P3-B2 — «تفعيل التطبيق»: an inline confirmation, a recent second-factor check, and the server's readiness gate (refused while a
 * teacher is left without access, naming them). Leaving enforcement («إيقاف التطبيق») is always possible.
 */
type Target = "legacy" | "observe" | "enforce";

const MODE_TEXT: Record<AccessMode, string> = {
  legacy: "عادي: الصلاحيات لا تُراقَب ولا تُطبَّق. كل معلم يعمل كما اليوم.",
  observe: "مراقبة: يُسجَّل ما كان سيُمنع لكل معلم، دون أن يُمنع شيء.",
  enforce: "تطبيق: تُمنع الأداة غير المفعّلة للمعلم.",
  invalid: "إعداد الوضع على الخادم غير صالح. لن يُسمح بأي أداة للمعلمين المُدارين حتى يُصحَّح."
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

export default function OwnerAccessMode({ token, onSignedOut }: { token: string; onSignedOut: () => void }) {
  const [mode, setMode] = useState<AccessMode | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [teachers, setTeachers] = useState<ReadinessTeacher[]>([]);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [stepUpFor, setStepUpFor] = useState<Target | null>(null);
  const [confirmEnforce, setConfirmEnforce] = useState(false);
  const [stepCode, setStepCode] = useState("");
  const stepInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([ownerAccessApi.get(token), ownerAccessApi.readiness(token)]).then(([g, r]) => {
      if (!live) return;
      if ((!g.ok && g.status === 401) || (!r.ok && r.status === 401)) { onSignedOut(); return; }
      if (g.ok) setLabels(Object.fromEntries(g.data.capabilities.map((c: AccessCapability) => [c.id, c.moduleLabel + " — " + c.label])));
      if (r.ok) { setMode(r.data.mode); setTeachers(r.data.teachers); setReady(r.data.ready); setLoadError(""); }
      else setLoadError(r.error);
    });
    return () => { live = false; };
  }, [token, onSignedOut]);
  useEffect(() => { if (stepUpFor) stepInput.current?.focus(); }, [stepUpFor]);

  async function switchTo(next: Target) {
    setBusy(true);
    setError("");
    const r = await ownerAccessApi.setMode(token, next);
    setBusy(false);
    if (r.ok) { setStepUpFor(null); setConfirmEnforce(false); setMode(r.data.mode); return; }
    if (r.status === 401) { onSignedOut(); return; }
    if (r.code === "STEP_UP_REQUIRED") { setStepUpFor(next); return; }
    setError(r.error);
  }

  async function confirmStepUp(event: FormEvent) {
    event.preventDefault();
    if (!stepUpFor || busy) return;
    const digits = stepCode.replace(/\s/g, "");
    if (!/^\d{6}$/.test(digits)) { setError("أدخل الرمز المكوّن من 6 أرقام."); return; }
    setBusy(true);
    setError("");
    const r = await ownerApi.stepUp(token, { code: digits });
    setBusy(false);
    setStepCode("");
    if (!r.ok) { if (r.status === 401 && r.code !== "TOTP_INVALID") { onSignedOut(); return; } setError(r.error); return; }
    await switchTo(stepUpFor);
  }

  const unassigned = teachers.filter(t => t.status !== "suspended" && !t.access && t.defaultAccess !== "legacy-full");
  const observed = teachers.filter(t => t.wouldDeny.length > 0);

  return (
    <section className="eb-owner-panel eb-owner-access-mode" aria-labelledby="eb-owner-access-mode-title">
      <div className="eb-owner-panel-head">
        <h2 id="eb-owner-access-mode-title" className="eb-owner-h2">وضع الصلاحيات</h2>
        {mode === "legacy" && <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => switchTo("observe")}>تشغيل المراقبة</button>}
        {mode === "observe" && <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => switchTo("legacy")}>إيقاف المراقبة</button>}
        {(mode === "legacy" || mode === "observe") && !confirmEnforce && (
          <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy || !ready} onClick={() => setConfirmEnforce(true)}>تفعيل التطبيق</button>
        )}
        {mode === "enforce" && <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => switchTo("observe")}>إيقاف التطبيق (العودة إلى المراقبة)</button>}
      </div>
      {confirmEnforce && (
        <div className="eb-owner-confirm" role="group" aria-label="تأكيد تفعيل التطبيق">
          <p>من الطلب التالي يُمنع كل معلم من أي أداة خارج حزمة صلاحياته. حسابك المستورد يبقى على «الوصول الحالي» ما لم تغيّره. تستطيع الإيقاف في أي وقت.</p>
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={() => switchTo("enforce")}>تأكيد: تفعيل التطبيق</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setConfirmEnforce(false)}>إلغاء</button>
          </div>
        </div>
      )}
      {mode === null && !loadError && <p className="eb-owner-hint" role="status">جارٍ التحميل…</p>}
      {loadError && <p className="eb-owner-hint" role="status">تعذر تحميل وضع الصلاحيات: {loadError}</p>}
      {mode && <p className="eb-owner-hint" data-mode={mode}><strong>{MODE_TEXT[mode]}</strong></p>}

      {stepUpFor && (
        <form className="eb-owner-stepup" onSubmit={confirmStepUp} noValidate>
          <label className="auth-field">
            <span>هذا الإجراء حساس. أدخل رمز التحقق من التطبيق للمتابعة:</span>
            <div className="auth-input"><IconKey size={18} />
              <input ref={stepInput} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} value={stepCode} onChange={e => setStepCode(e.target.value)} dir="ltr" />
            </div>
          </label>
          <div className="eb-owner-actions">
            <button type="submit" className="auth-submit" disabled={busy}>تأكيد</button>
            <button type="button" className="eb-owner-secondary" onClick={() => { setStepUpFor(null); setStepCode(""); setError(""); }}>إلغاء</button>
          </div>
        </form>
      )}
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}

      {mode && (
        <div className="eb-owner-readiness" role="region" aria-label="جاهزية التطبيق">
          {ready
            ? <p className="eb-owner-hint">كل معلم نشط له حزمة صلاحيات.</p>
            : <p className="eb-owner-hint">بلا حزمة صلاحيات (سيُمنع من كل شيء حين يبدأ التطبيق): <strong>{unassigned.map(t => t.displayName).join("، ")}</strong>. اختر لكل منهم حزمة من «المعلمون».</p>}
          {observed.length > 0 && (
            <ul className="eb-owner-observed" aria-label="ما كان سيُمنع">
              {observed.map(t => (
                <li key={t.accountId}>
                  <strong><bdi>{t.displayName}</bdi></strong> — كان سيُمنع من:
                  <ul>
                    {t.wouldDeny.map(w => (
                      <li key={w.capability}>{w.capability.split("|").map(c => labels[c] || c).join(" أو ")} <span className="eb-owner-hint">({w.count} مرة، آخرها <bdi>{formatDate(w.lastAt)}</bdi>)</span></li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {mode === "observe" && observed.length === 0 && <p className="eb-owner-hint">لم يُسجَّل أي منع محتمل حتى الآن.</p>}
          {mode !== "enforce" && !ready && <p className="eb-owner-hint">«تفعيل التطبيق» متاح حين يكون لكل معلم نشط حزمة صلاحيات.</p>}
        </div>
      )}
    </section>
  );
}
