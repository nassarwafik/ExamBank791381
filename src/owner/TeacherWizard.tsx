import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { IconWarning } from "../icons";
import Stepper from "../ui/Stepper";
import { currentAccessOf, TRIAL_DAY_OPTIONS, type AccessCapability, type AccessHistoryEntry, type AccessPreset, type ManagedTeacher, type TeacherDraft } from "./ownerApi";

/**
 * Tadris+ P4-B2 — «إضافة معلم» as a guided wizard (replaces the single form of P2-A2b; same fields, same rules, same request):
 *   1. الهوية          username + display name (required, checked before going on); the account kind: permanent, or a TRIAL of
 *                      7/14/30/60/90 days (trial accounts; «معلم تجريبي جديد» opens the wizard with «تجريبي» already chosen);
 *   2. بيانات إضافية   full name, email, phone, subjects, administrative notes (all optional);
 *   3. الصلاحيات       a preset, OR «نسخ من معلم»: the source teacher's CURRENT access as the server re-validated it (preset +
 *                      individual changes), OR later (only while enforcement is off — otherwise a choice is required);
 *   4. المراجعة        everything at a glance, then «إنشاء الحساب وإصدار رابط الدعوة».
 * The server validates everything again (the copy is saved like any assignment); its refusal is shown by the caller as worded.
 */

type StepId = "identity" | "details" | "access" | "review";
const STEPS: { id: StepId; label: string }[] = [
  { id: "identity", label: "الهوية" },
  { id: "details", label: "بيانات إضافية" },
  { id: "access", label: "الصلاحيات" },
  { id: "review", label: "المراجعة" }
];
const PRESET_REQUIRED = "التطبيق الفعلي للصلاحيات مفعّل: اختر حزمة صلاحيات للمعلم الجديد.";
const presetKey = (p: { id: string; version: number }) => p.id + "@" + p.version;

export default function TeacherWizard({ initialTrial = false, token, busy, presets, capabilities, teachers, presetRequired, onSubmit, onCancel, onSignedOut }: {
  initialTrial?: boolean; token: string; busy: boolean; presets: AccessPreset[]; capabilities: AccessCapability[]; teachers: ManagedTeacher[]; presetRequired: boolean;
  onSubmit: (d: TeacherDraft) => void; onCancel: () => void; onSignedOut: () => void;
}) {
  const [step, setStep] = useState<StepId>("identity");
  const [trial, setTrial] = useState(initialTrial);
  const [trialDays, setTrialDays] = useState<number>(14);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subjects, setSubjects] = useState("");
  const [notes, setNotes] = useState("");
  const [presetChoice, setPresetChoice] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [source, setSource] = useState<{ id: string; entry: AccessHistoryEntry } | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } heading.current?.focus(); }, [step]);

  const offered = presets.filter(p => p.id !== "legacy-full");
  const chosenPreset = offered.find(p => presetKey(p) === presetChoice);
  const copyable = teachers.filter(t => t.access);
  const sourceTeacher = copyable.find(t => t.accountId === sourceId);
  const copied = source && source.id === sourceId ? source.entry : null;
  const accessCaps: string[] | null = copied ? copied.capabilities : chosenPreset ? chosenPreset.capabilities : null;
  const index = STEPS.findIndex(s => s.id === step);

  async function pickSource(id: string) {
    setSourceId(id);
    setSource(null);
    setError("");
    if (!id) return;
    setPresetChoice("");
    setLoadingSource(true);
    const r = await currentAccessOf(token, id);
    setLoadingSource(false);
    if (r.ok) { setSource({ id, entry: r.data }); return; }
    if (r.status === 401) { onSignedOut(); return; }
    setError(r.error);
  }

  function next(): boolean {
    if (step === "identity" && (!username.trim() || !displayName.trim())) { setError("اسم المستخدم واسم العرض مطلوبان."); return false; }
    if (step === "access") {
      if (sourceId && !copied) { setError(loadingSource ? "جارٍ قراءة صلاحيات المعلم المختار…" : "تعذر نسخ صلاحيات المعلم المختار. اختر غيره أو اختر حزمة."); return false; }
      if (presetRequired && !accessCaps) { setError(PRESET_REQUIRED); return false; }
    }
    setError("");
    setStep(STEPS[index + 1].id);
    return true;
  }

  function draft(): TeacherDraft {
    const base: TeacherDraft = {
      username: username.trim(), displayName: displayName.trim(), fullName: fullName.trim(), email: email.trim(), phone: phone.trim(),
      subjects: subjects.split(/[,،]/).map(s => s.trim()).filter(Boolean), notes: notes.trim(),
      ...(trial ? { trialDays } : {})
    };
    if (copied && copied.preset && sourceTeacher) {
      return { ...base, presetId: copied.preset.id, presetVersion: copied.preset.version, grants: [...copied.grants], denies: [...copied.denies], accessReason: "نسخ من " + sourceTeacher.username };
    }
    if (chosenPreset) return { ...base, presetId: chosenPreset.id, presetVersion: chosenPreset.version };
    return base;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (step !== "review") { next(); return; }
    if (presetRequired && !accessCaps) { setError(PRESET_REQUIRED); setStep("access"); return; }
    onSubmit(draft());
  }

  const presetName = (p: { id: string; version: number } | null) => (p ? presets.find(x => x.id === p.id && x.version === p.version)?.label || p.id : "—");
  const accessSummary = copied
    ? "نسخة من صلاحيات " + (sourceTeacher ? sourceTeacher.displayName : "") + ": " + presetName(copied.preset) + (copied.grants.length || copied.denies.length ? " (+" + copied.grants.length + " / −" + copied.denies.length + ")" : "")
    : chosenPreset ? chosenPreset.label : "لاحقًا (بلا صلاحيات حتى تختار)";

  return (
    <form className="auth-form eb-owner-create eb-owner-wizard" onSubmit={submit} noValidate aria-label={trial ? "معلم تجريبي جديد" : "إضافة معلم"}>
      <Stepper label="خطوات إضافة معلم" steps={STEPS} currentId={step} />
      <h3 ref={heading} tabIndex={-1} className="eb-owner-wizard-title">{STEPS[index].label} <small>(الخطوة {index + 1} من {STEPS.length})</small></h3>

      {step === "identity" && (
        <>
        <fieldset className="eb-owner-access-options">
          <legend>نوع الحساب</legend>
          <label className="eb-owner-access-option">
            <input type="radio" name="eb-owner-account-kind" checked={!trial} onChange={() => setTrial(false)} />
            <span><strong>دائم</strong><small>بلا تاريخ انتهاء.</small></span>
          </label>
          <label className="eb-owner-access-option">
            <input type="radio" name="eb-owner-account-kind" checked={trial} onChange={() => setTrial(true)} />
            <span><strong>تجريبي</strong><small>يتوقف دخول المعلم تلقائيًا بعد المدة، وتبقى بياناته محفوظة. يُنبَّه هو وأنت قبل الانتهاء بأسبوع، ويمكنك تمديدها أو تحويل الحساب إلى دائم في أي وقت.</small></span>
          </label>
        </fieldset>
        {trial && (
          <label className="auth-field"><span>مدة التجربة</span>
            <div className="auth-input">
              <select value={trialDays} onChange={e => setTrialDays(Number(e.target.value))}>
                {TRIAL_DAY_OPTIONS.map(d => <option key={d} value={d}>{d} يومًا</option>)}
              </select>
            </div>
            <small className="eb-owner-hint">تبدأ المدة من إنشاء الحساب.</small>
          </label>
        )}
        <div className="eb-owner-grid">
          <label className="auth-field"><span>اسم المستخدم</span>
            <div className="auth-input"><input type="text" value={username} onChange={e => setUsername(e.target.value)} dir="ltr" spellCheck={false} autoComplete="off" placeholder="t.ahmad" /></div>
            <small className="eb-owner-hint">أحرف إنجليزية صغيرة وأرقام و . _ - ، وليس أرقامًا فقط. لا يُستخدم رقم الهوية.</small>
          </label>
          <label className="auth-field"><span>اسم العرض</span>
            <div className="auth-input"><input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={60} /></div>
          </label>
        </div>
        </>
      )}

      {step === "details" && (
        <>
          <div className="eb-owner-grid">
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
        </>
      )}

      {step === "access" && (
        <div className="eb-owner-access-editor">
          {offered.length > 0 ? (
            <label className="auth-field"><span>{presetRequired ? "حزمة الصلاحيات" : "حزمة الصلاحيات (اختياري)"}</span>
              <div className="auth-input">
                <select value={presetChoice} onChange={e => { setPresetChoice(e.target.value); if (e.target.value) { setSourceId(""); setSource(null); setError(""); } }}>
                  <option value="">{presetRequired ? "اختر حزمة…" : "لاحقًا (بلا صلاحيات حتى تختار)"}</option>
                  {offered.map(p => <option key={presetKey(p)} value={presetKey(p)}>{p.label}</option>)}
                </select>
              </div>
            </label>
          ) : <p className="eb-owner-hint">حزم الصلاحيات غير متاحة الآن. يمكنك تحديدها لاحقًا من صفحة المعلم.</p>}
          {copyable.length > 0 && (
            <label className="auth-field"><span>أو انسخ صلاحيات معلم موجود</span>
              <div className="auth-input">
                <select value={sourceId} onChange={e => void pickSource(e.target.value)}>
                  <option value="">لا أريد النسخ</option>
                  {copyable.map(t => <option key={t.accountId} value={t.accountId}>{t.displayName + " (" + t.username + ")"}</option>)}
                </select>
              </div>
            </label>
          )}
          {loadingSource && <p className="eb-owner-hint" role="status">جارٍ قراءة صلاحيات المعلم المختار…</p>}
          {accessCaps && <AccessPreview caps={accessCaps} capabilities={capabilities} />}
          <p className="eb-owner-hint">يمكنك بعد الإنشاء تعديل الصلاحيات واحدة واحدة من صفحة المعلم.</p>
        </div>
      )}

      {step === "review" && (
        <section aria-label="مراجعة بيانات المعلم الجديد"><dl className="eb-owner-facts">
          <div><dt>اسم المستخدم</dt><dd><bdi dir="ltr">{username.trim()}</bdi></dd></div>
          <div><dt>اسم العرض</dt><dd><bdi>{displayName.trim()}</bdi></dd></div>
          <div><dt>نوع الحساب</dt><dd>{trial ? "تجريبي — " + trialDays + " يومًا" : "دائم"}</dd></div>
          {fullName.trim() && <div><dt>الاسم الكامل</dt><dd><bdi>{fullName.trim()}</bdi></dd></div>}
          {email.trim() && <div><dt>البريد الإلكتروني</dt><dd><bdi dir="ltr">{email.trim()}</bdi></dd></div>}
          {phone.trim() && <div><dt>الهاتف</dt><dd><bdi dir="ltr">{phone.trim()}</bdi></dd></div>}
          {subjects.trim() && <div><dt>المواد</dt><dd>{subjects.trim()}</dd></div>}
          <div><dt>الصلاحيات</dt><dd>{accessSummary}</dd></div>
        </dl></section>
      )}

      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      <div className="eb-owner-actions">
        {step === "review"
          ? <button type="submit" className="auth-submit" disabled={busy}>{busy ? "جارٍ الإنشاء…" : trial ? "إنشاء الحساب التجريبي وإصدار رابط الدعوة" : "إنشاء الحساب وإصدار رابط الدعوة"}</button>
          : <button type="submit" className="auth-submit" disabled={busy}>التالي</button>}
        {index > 0 && <button type="button" className="eb-owner-secondary" onClick={() => { setError(""); setStep(STEPS[index - 1].id); }}>السابق</button>}
        <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}

/** What the new teacher will be able to do, per module (counts), from the capability registry. */
function AccessPreview({ caps, capabilities }: { caps: string[]; capabilities: AccessCapability[] }) {
  const set = new Set(caps);
  const modules: { module: string; label: string; total: number; held: number }[] = [];
  for (const c of capabilities) {
    if (c.ownerOnly) continue;
    let m = modules.find(x => x.module === c.module);
    if (!m) { m = { module: c.module, label: c.moduleLabel, total: 0, held: 0 }; modules.push(m); }
    m.total += 1;
    if (set.has(c.id)) m.held += 1;
  }
  const reachable = modules.filter(m => m.held > 0);
  return (
    <div className="eb-owner-preview" role="region" aria-label="ما سيتمكن منه المعلم الجديد">
      <strong>ما سيتمكن منه المعلم الجديد ({caps.length} صلاحية):</strong>
      {reachable.length > 0 && <ul>{reachable.map(m => <li key={m.module}>{m.label}: {m.held} من {m.total}</li>)}</ul>}
    </div>
  );
}
