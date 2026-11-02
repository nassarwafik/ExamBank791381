import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { IconKey, IconPlus, IconWarning } from "../icons";
import { ownerApi, ownerTeachersApi, ownerAccessApi, type ManagedTeacher, type TeacherAction, type TeacherInvitationLink, type ApiResult, type LegacyImportState, type TeacherDraft, type AccessPreset, type AccessCapability } from "./ownerApi";
import DiffView from "../ui/DiffView";
import InvitationPanel, { type Issued } from "./InvitationPanel";
import TeacherWizard from "./TeacherWizard";
import { STATUS_LABEL, ACTION_LABEL, CONFIRM_TEXT, formatDate, actionsFor, accessLabel, startingPresetId, trialLabel, trialBadgeClass } from "./teacherShared";
import TrialControls from "./TrialControls";

/**
 * Tadris+ P2-A2b — «المعلمون» in the Owner Console (P2-A2a /api/owner-teachers; owner decisions §19.3).
 *   - the list of managed teachers with their state (invited / active / suspended) and last sign-in;
 *   - «إضافة معلم» (P4-B2: a four-step wizard, TeacherWizard.tsx — identity, details, access incl. «copy from a teacher», review):
 *     username + display name (+ optional details) → the invitation link, shown ONCE with a QR code and a copy
 *     button; the owner sends it themselves; the teacher sets their own password (the owner never sees it);
 *   - per teacher: new invitation link, password reset (new link), end sessions, suspend / reactivate — each takes effect on the
 *     teacher's next request; the disruptive ones ask for an inline confirmation (no browser dialogs);
 *   - every change needs a recent second-factor check: a STEP_UP_REQUIRED answer asks for the code inline, then retries;
 *   - P2-B «استيراد مساحتي القديمة»: when the server says it is available (shared-password mode, not imported yet), the owner
 *     creates — once — the teacher account of the old shared-password workspace (username + display name → an invitation link).
 *     It then sees the old classes, exams and students exactly as before; nothing is moved or deleted.
 *   - P3-A «الصلاحيات»: each teacher shows the access preset the owner assigned (or the account's default) and «تغيير الصلاحيات»
 *     picks another preset (a new immutable revision on the server). Nothing is enforced yet: the change prepares P3-B.
 *   - P4-B1 «صفحة المعلم»: opens the teacher's own page (#/owner/teachers/<id>) — details, individual capabilities, history,
 *     security.
 *   - Trial accounts «معلم تجريبي جديد»: the same wizard, starting as a TRIAL account that ends after the chosen number of days (the
 *     server refuses its sign-in from then on); each trial teacher shows its end date, «تمديد التجربة» and «تحويل إلى حساب دائم».
 * The server decides everything; a 401 signs the owner out.
 */

type Pending = { kind: "create"; draft: TeacherDraft } | { kind: "import"; draft: TeacherDraft } | { kind: "act"; action: TeacherAction; teacher: ManagedTeacher }
  | { kind: "access"; teacher: ManagedTeacher; preset: AccessPreset }
  | { kind: "trial"; teacher: ManagedTeacher; action: "extend-trial" | "end-trial"; days?: number };

export default function OwnerTeachers({ token, onSignedOut, onOpen }: { token: string; onSignedOut: () => void; onOpen?: (accountId: string) => void }) {
  const [teachers, setTeachers] = useState<ManagedTeacher[] | null>(null);
  const [legacy, setLegacy] = useState<LegacyImportState | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [presets, setPresets] = useState<AccessPreset[]>([]);
  const [accessMode, setAccessMode] = useState<string>("legacy");
  const [capabilityLabels, setCapabilityLabels] = useState<Record<string, string>>({});
  const [capabilities, setCapabilities] = useState<AccessCapability[]>([]);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState<false | "permanent" | "trial">(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [confirming, setConfirming] = useState<{ action: TeacherAction; teacher: ManagedTeacher } | null>(null);
  const [stepUp, setStepUp] = useState<Pending | null>(null);
  const [stepCode, setStepCode] = useState("");
  const stepInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void ownerTeachersApi.list(token).then(r => {
      if (!live) return;
      if (r.ok) { setTeachers(r.data.teachers); setLegacy(r.data.legacyImport || null); }
      else if (r.status === 401) onSignedOut();
      else setError(r.error);
    });
    return () => { live = false; };
  }, [token, onSignedOut]);
  useEffect(() => {
    let live = true;
    void ownerAccessApi.get(token).then(r => {
      if (!live || !r.ok) return;
      setPresets(r.data.presets);
      setAccessMode(r.data.mode);
      setCapabilityLabels(Object.fromEntries((r.data.capabilities || []).map(c => [c.id, c.moduleLabel + " — " + c.label])));
      setCapabilities(r.data.capabilities || []);
    });
    return () => { live = false; };
  }, [token]);
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
    if (p.kind === "access") {
      const a = await ownerAccessApi.assign(token, { accountId: p.teacher.accountId, presetId: p.preset.id, presetVersion: p.preset.version, baseRevisionId: p.teacher.access ? p.teacher.access.revisionId : null });
      setBusy(false);
      if (a.ok) { setStepUp(null); setChoosing(null); upsert({ ...p.teacher, access: a.data.access }); return; }
      if (a.status === 401) { onSignedOut(); return; }
      if (a.code === "STEP_UP_REQUIRED") { setStepUp(p); return; }
      setError(a.error);
      return;
    }
    if (p.kind === "trial") {
      const t = await ownerTeachersApi.trial(token, p.action, p.teacher.accountId, p.days);
      setBusy(false);
      if (t.ok) { setStepUp(null); upsert(t.data.teacher); return; }
      if (t.status === 401) { onSignedOut(); return; }
      if (t.code === "STEP_UP_REQUIRED") { setStepUp(p); return; }
      setError(t.error);
      return;
    }
    const r: ApiResult<{ teacher: ManagedTeacher; invitation?: TeacherInvitationLink }> = p.kind === "create"
      ? await ownerTeachersApi.create(token, p.draft)
      : p.kind === "import"
        ? await ownerTeachersApi.importLegacy(token, p.draft)
        : await ownerTeachersApi.act(token, p.action, p.teacher.accountId);
    setBusy(false);
    if (r.ok) {
      setStepUp(null);
      setConfirming(null);
      upsert(r.data.teacher);
      if (r.data.invitation) setIssued({ teacher: r.data.teacher, invitation: r.data.invitation });
      if (p.kind === "create") setShowCreate(false);
      if (p.kind === "import") { setShowImport(false); setLegacy({ available: false, reason: "ALREADY_IMPORTED", accountId: r.data.teacher.accountId }); }
      return;
    }
    if (r.status === 401) { onSignedOut(); return; }
    if (r.code === "STEP_UP_REQUIRED") { setStepUp(p); return; }
    if (p.kind === "import" && r.code.startsWith("LEGACY_IMPORT_")) { setShowImport(false); setLegacy(l => (l && l.available ? { available: false, reason: "ALREADY_IMPORTED" } : l)); }
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
        {!showCreate && (
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary" onClick={() => { setShowCreate("permanent"); setIssued(null); }}><IconPlus size={16} aria-hidden="true" /> إضافة معلم</button>
            <button type="button" className="eb-owner-secondary" onClick={() => { setShowCreate("trial"); setIssued(null); }}><IconPlus size={16} aria-hidden="true" /> معلم تجريبي جديد</button>
          </div>
        )}
      </div>

      {legacy && legacy.available && !showImport && (
        <div className="eb-owner-notice eb-owner-legacy" role="region" aria-label="مساحتك القديمة">
          <p><strong>مساحتك القديمة</strong>: الصفوف والامتحانات والطلاب التي أُنشئت بالدخول بكلمة المرور المشتركة. أُغلق ذلك الدخول بعد إنشاء حساب المالك. استوردها لحساب معلم خاص بك لتعود إليها كما هي.</p>
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => { setShowImport(true); setShowCreate(false); setIssued(null); }}>استيراد مساحتي القديمة</button>
          </div>
        </div>
      )}
      {legacy && !legacy.available && legacy.reason === "LEGACY_DATA_OWNER_SET" && (
        <p className="eb-owner-hint">لا يمكن استيراد المساحة القديمة: بياناتها مُسندة لمعلم آخر بإعداد على الخادم (LEGACY_DATA_OWNER).</p>
      )}
      {showImport && <LegacyImportForm busy={busy} onCancel={() => setShowImport(false)} onSubmit={draft => run({ kind: "import", draft })} />}

      {showCreate && <TeacherWizard key={showCreate} initialTrial={showCreate === "trial"} token={token} busy={busy} presets={presets} capabilities={capabilities} teachers={teachers || []} presetRequired={accessMode === "enforce" || accessMode === "invalid"}
        onCancel={() => setShowCreate(false)} onSubmit={draft => run({ kind: "create", draft })} onSignedOut={onSignedOut} />}

      {issued && <InvitationPanel issued={issued} onClose={() => setIssued(null)} />}
      {issued && onOpen && <div className="eb-owner-actions"><button type="button" className="eb-owner-secondary" onClick={() => onOpen(issued.teacher.accountId)}>فتح صفحة {issued.teacher.displayName}</button></div>}

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

      {teachers && <TrialSummary teachers={teachers} />}

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
                {t.origin === "shared-password-workspace" && <span className="eb-owner-status eb-owner-status--legacy">المساحة القديمة</span>}
                {t.trial && <span className={trialBadgeClass(t)}>{trialLabel(t)}</span>}
              </div>
              <p className="eb-owner-hint eb-owner-access-line">الصلاحيات: <strong>{accessLabel(t, presets)}</strong></p>
              {choosing === t.accountId && (
                <AccessChooser teacher={t} presets={presets} labels={capabilityLabels} enforcing={accessMode === "enforce"} busy={busy} onCancel={() => setChoosing(null)} onSave={preset => run({ kind: "access", teacher: t, preset })} />
              )}
              <p className="eb-owner-hint">
                {t.lastLoginAt ? <>آخر دخول: <bdi>{formatDate(t.lastLoginAt)}</bdi></> : "لم يدخل بعد."}
                {t.invitation && <> · رابط {t.invitation.purpose === "reset" ? "إعادة التعيين" : "الدعوة"} صالح حتى <bdi>{formatDate(t.invitation.expiresAt)}</bdi></>}
              </p>
              {t.trial && (
                <TrialControls teacher={t} busy={busy}
                  onExtend={days => run({ kind: "trial", teacher: t, action: "extend-trial", days })}
                  onMakePermanent={() => run({ kind: "trial", teacher: t, action: "end-trial" })} />
              )}
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
                  {onOpen && <button type="button" className="eb-owner-secondary" onClick={() => onOpen(t.accountId)} aria-label={"صفحة " + t.displayName}>صفحة المعلم</button>}
                  {presets.length > 0 && choosing !== t.accountId && <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => { setChoosing(t.accountId); setConfirming(null); }}>تغيير الصلاحيات</button>}
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

/** Trial accounts — the owner's alert: how many trials end within the warning window, and how many have ended (by name). */
function TrialSummary({ teachers }: { teachers: ManagedTeacher[] }) {
  const soon = teachers.filter(t => t.trial && !t.trial.ended && t.trial.endingSoon);
  const ended = teachers.filter(t => t.trial && t.trial.ended && t.status !== "suspended");
  if (!soon.length && !ended.length) return null;
  const names = (list: ManagedTeacher[]) => list.map(t => t.displayName).join("، ");
  return (
    <div className="eb-owner-notice eb-owner-trial-summary" role="alert" aria-label="تنبيه الحسابات التجريبية">
      {soon.length > 0 && <p><strong>{soon.length === 1 ? "حساب تجريبي ينتهي" : soon.length + " حسابات تجريبية تنتهي"} خلال أسبوع:</strong> <bdi>{names(soon)}</bdi>. مدّدها أو حوّلها إلى دائمة قبل أن يتوقف دخول أصحابها.</p>}
      {ended.length > 0 && <p><strong>{ended.length === 1 ? "حساب تجريبي انتهى" : ended.length + " حسابات تجريبية انتهت"}:</strong> <bdi>{names(ended)}</bdi>. لا يستطيع أصحابها الدخول حتى تمدّدها.</p>}
    </div>
  );
}

function AccessChooser({ teacher, presets, labels, enforcing, busy, onSave, onCancel }: { teacher: ManagedTeacher; presets: AccessPreset[]; labels: Record<string, string>; enforcing: boolean; busy: boolean; onSave: (p: AccessPreset) => void; onCancel: () => void }) {
  const current = startingPresetId(teacher);
  const [picked, setPicked] = useState(current);
  const chosen = presets.find(p => p.id === picked);
  // Tadris+ P4-A — what the change adds and removes, before it is saved (compared with the current preset; an account without
  // one holds nothing). Custom grants / denies of the current access are not part of the comparison (P4-B shows them).
  const before = presets.find(p => p.id === current)?.capabilities || [];
  return (
    <div className="eb-owner-confirm eb-owner-access" role="group" aria-label={"صلاحيات " + teacher.displayName}>
      <fieldset className="eb-owner-access-options">
        <legend>اختر حزمة الصلاحيات</legend>
        {presets.map(p => (
          <label key={p.id + "@" + p.version} className="eb-owner-access-option">
            <input type="radio" name={"access-" + teacher.accountId} value={p.id} checked={picked === p.id} onChange={() => setPicked(p.id)} />
            <span><strong>{p.label}</strong><small>{p.description}</small></span>
          </label>
        ))}
      </fieldset>
      {chosen && picked !== current && (
        <DiffView label={"تغيّر صلاحيات " + teacher.displayName} before={before} after={chosen.capabilities} labelOf={id => labels[id] || id}
          addedTitle="صلاحيات ستُضاف" removedTitle="صلاحيات ستُزال" emptyText="الحزمتان تحويان الصلاحيات نفسها." />
      )}
      <p className="eb-owner-hint">{enforcing
        ? "التطبيق مفعّل: يسري التغيير من الطلب التالي للمعلم."
        : "لن يتغير شيء الآن عند المعلم: تُطبَّق الصلاحيات حين تفعّل «التطبيق» في قسم «الصلاحيات»."}</p>
      <div className="eb-owner-actions">
        <button type="button" className="eb-owner-secondary" disabled={busy || !chosen || picked === current} onClick={() => chosen && onSave(chosen)}>حفظ الصلاحيات</button>
        <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  );
}

function LegacyImportForm({ busy, onSubmit, onCancel }: { busy: boolean; onSubmit: (d: TeacherDraft) => void; onCancel: () => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!username.trim() || !displayName.trim()) { setError("اسم المستخدم واسم العرض مطلوبان."); return; }
    setError("");
    onSubmit({ username: username.trim(), displayName: displayName.trim() });
  }
  return (
    <form className="auth-form eb-owner-create" onSubmit={submit} noValidate aria-label="استيراد مساحتي القديمة">
      <p className="eb-owner-hint">سيُنشأ حساب معلم واحد يرى صفوفك وامتحاناتك وطلابك ونتائجك القديمة كما هي. لا يُنقل شيء ولا يُحذف. يُسمح بذلك <strong>مرة واحدة فقط</strong>، ولا يمكن إعطاء هذه المساحة لحساب آخر. بعد ذلك يظهر رابط دعوة تضع منه كلمة مرورك.</p>
      <div className="eb-owner-grid">
        <label className="auth-field"><span>اسم المستخدم</span>
          <div className="auth-input"><input type="text" value={username} onChange={e => setUsername(e.target.value)} dir="ltr" spellCheck={false} autoComplete="off" placeholder="t.ahmad" /></div>
          <small className="eb-owner-hint">اسم مستخدم جديد لدخولك كمعلم. لا يُستخدم رقم الهوية.</small>
        </label>
        <label className="auth-field"><span>اسم العرض</span>
          <div className="auth-input"><input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={60} /></div>
        </label>
      </div>
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      <div className="eb-owner-actions">
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "جارٍ الاستيراد…" : "استيراد وإصدار رابط الدعوة"}</button>
        <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
