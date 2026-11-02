import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { IconWarning } from "../icons";
import {
  ownerTeachersApi, ownerAccessApi, type ApiResult, type ManagedTeacher, type AccessPreset, type AccessCapability, type AccessMode,
  type AccessHistoryEntry, type EffectiveAccess, type TeacherAction, type TeacherProfileFields
} from "./ownerApi";
import Tabs from "../ui/Tabs";
import DataTable, { type DataColumn } from "../ui/DataTable";
import DiffView from "../ui/DiffView";
import StepUpPrompt from "./StepUpPrompt";
import InvitationPanel, { type Issued } from "./InvitationPanel";
import {
  STATUS_LABEL, ACTION_LABEL, CONFIRM_TEXT, formatDate, actionsFor, accessLabel, startingPresetId, withCapability, withoutCapability,
  grantsAndDenies, actorLabel
} from "./teacherShared";

/**
 * Tadris+ P4-B1 — one teacher's page in the Owner Console (#/owner/teachers/<accountId>), in four tabs:
 *   «البيانات»   the teacher's details (the username is the sign-in name and stays fixed);
 *   «الصلاحيات» a preset, then individual capabilities on or off (turning one on also turns on what it needs; turning one off also
 *                turns off what needs it), the difference from what the server gives the teacher NOW, and what the teacher will be
 *                able to do; saved as a new immutable revision against the revision this page was opened on (a stale page → 409);
 *   «السجل»      the revisions, newest first, re-validated by the server; «استعادة» makes a NEW revision with an older one's content;
 *   «الأمان»     state, suspension (with an optional reason for the owner's record), sessions, password reset, invitation.
 * Every change needs a recent second-factor check (asked inline, then retried). The server decides everything; a 401 signs out.
 */

type TabId = "profile" | "access" | "history" | "security";
type Catalog = { presets: AccessPreset[]; capabilities: AccessCapability[]; mode: AccessMode };
type History = { currentRevisionId: string | null; entries: AccessHistoryEntry[]; truncated: boolean };
type Loaded = { teacher: ManagedTeacher; catalog: Catalog; history: History; effective: EffectiveAccess };
type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "missing" } | ({ kind: "ready" } & Loaded);
export type AccessDraft = { presetId: string; presetVersion: number; grants: string[]; denies: string[]; reason: string };

const presetKey = (p: { id: string; version: number } | null | undefined) => (p ? p.id + "@" + p.version : "");

async function loadAll(token: string, accountId: string): Promise<{ state: State; signedOut: boolean }> {
  const [list, catalog, history, effective] = await Promise.all([
    ownerTeachersApi.list(token), ownerAccessApi.get(token), ownerAccessApi.history(token, accountId), ownerAccessApi.effective(token, accountId)
  ]);
  const all = [list, catalog, history, effective] as ApiResult<unknown>[];
  if (all.some(r => !r.ok && r.status === 401)) return { state: { kind: "loading" }, signedOut: true };
  if (!list.ok) return { state: { kind: "error", message: list.error }, signedOut: false };
  const teacher = list.data.teachers.find(t => t.accountId === accountId);
  if (!teacher || (!history.ok && history.status === 404)) return { state: { kind: "missing" }, signedOut: false };
  const failed = all.find(r => !r.ok) as { error: string } | undefined;
  if (failed || !catalog.ok || !history.ok || !effective.ok) return { state: { kind: "error", message: failed ? failed.error : "" }, signedOut: false };
  return {
    signedOut: false,
    state: {
      kind: "ready", teacher,
      catalog: { presets: catalog.data.presets, capabilities: catalog.data.capabilities, mode: catalog.data.mode },
      history: { currentRevisionId: history.data.currentRevisionId, entries: history.data.entries, truncated: history.data.truncated },
      effective: { accountStatus: effective.data.accountStatus, mode: effective.data.mode, enforced: effective.data.enforced, access: effective.data.access }
    }
  };
}

export default function OwnerTeacherDetails({ token, accountId, onSignedOut, onBack }: { token: string; accountId: string; onSignedOut: () => void; onBack: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);
  const [tab, setTab] = useState<TabId>("profile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stepUp, setStepUp] = useState<{ retry: () => Promise<void> } | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const signedOut = useRef(onSignedOut);
  useEffect(() => { signedOut.current = onSignedOut; }, [onSignedOut]);

  useEffect(() => {
    let live = true;
    void loadAll(token, accountId).then(r => {
      if (!live) return;
      if (r.signedOut) signedOut.current();
      else setState(r.state);
    });
    return () => { live = false; };
  }, [token, accountId, nonce]);

  const reload = () => setNonce(n => n + 1);

  /** Sends a change; a STEP_UP_REQUIRED answer asks for the code and retries the same change. */
  async function send<T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void, refreshOnConflict = false): Promise<void> {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await call();
    setBusy(false);
    if (r.ok) { setStepUp(null); onOk(r.data); return; }
    if (r.status === 401) { onSignedOut(); return; }
    if (r.code === "STEP_UP_REQUIRED") { setStepUp({ retry: () => send(call, onOk, refreshOnConflict) }); return; }
    setStepUp(null);
    setError(r.error);
    if (refreshOnConflict && r.status === 409) reload();
  }

  const back = <button type="button" className="eb-owner-secondary" onClick={onBack}>→ كل المعلمين</button>;
  if (state.kind === "loading") return <section className="eb-owner-panel" aria-label="صفحة المعلم"><p className="eb-owner-hint" role="status">جارٍ تحميل صفحة المعلم…</p></section>;
  if (state.kind === "missing") return (
    <section className="eb-owner-panel" aria-label="صفحة المعلم">
      <p className="eb-owner-hint" role="alert">حساب المعلم غير موجود.</p>
      <div className="eb-owner-actions">{back}</div>
    </section>
  );
  if (state.kind === "error") return (
    <section className="eb-owner-panel" aria-label="صفحة المعلم">
      <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{state.message || "تعذر تحميل صفحة المعلم."}</div>
      <div className="eb-owner-actions"><button type="button" className="eb-owner-secondary" onClick={reload}>إعادة المحاولة</button>{back}</div>
    </section>
  );

  const { teacher, catalog, history, effective } = state;
  const labels: Record<string, string> = Object.fromEntries(catalog.capabilities.map(c => [c.id, c.moduleLabel + " — " + c.label]));
  const setTeacher = (t: ManagedTeacher) => setState(s => (s.kind === "ready" ? { ...s, teacher: t } : s));

  const tabs = [
    { id: "profile", label: "البيانات", content: (
      <ProfileForm key={teacher.updatedAt} teacher={teacher} busy={busy}
        onSave={fields => send(() => ownerTeachersApi.update(token, accountId, fields), d => { setTeacher(d.teacher); setNotice("حُفظت بيانات المعلم."); })} />
    ) },
    { id: "access", label: "الصلاحيات", content: (
      <AccessEditor key={history.currentRevisionId || "none"} teacher={teacher} catalog={catalog} history={history} effective={effective} labels={labels} busy={busy}
        onSave={draft => send(() => ownerAccessApi.assign(token, { accountId, ...draft, baseRevisionId: history.currentRevisionId }), () => { setNotice("حُفظت الصلاحيات (نسخة جديدة في السجل)."); reload(); }, true)} />
    ) },
    { id: "history", label: "السجل", content: (
      <AccessHistory history={history} effective={effective} presets={catalog.presets} labels={labels} busy={busy}
        onRestore={(entry, reason) => send(() => ownerAccessApi.rollback(token, { accountId, revisionId: entry.revisionId, baseRevisionId: history.currentRevisionId, reason }), () => { setNotice("استُعيدت النسخة (نسخة جديدة في السجل)."); reload(); }, true)} />
    ) },
    { id: "security", label: "الأمان", content: (
      <SecurityPanel teacher={teacher} busy={busy}
        onAct={(action, reason) => send(() => ownerTeachersApi.act(token, action, accountId, reason ? { reason } : {}), d => {
          setTeacher(d.teacher);
          if (d.invitation) setIssued({ teacher: d.teacher, invitation: d.invitation });
          setNotice("تم: " + ACTION_LABEL[action] + ".");
          reload();
        })} />
    ) }
  ];

  return (
    <section className="eb-owner-panel eb-owner-details" aria-labelledby="eb-owner-details-title">
      <div className="eb-owner-panel-head">
        <div className="eb-owner-teacher-main">
          <h2 id="eb-owner-details-title" className="eb-owner-h2"><bdi>{teacher.displayName}</bdi></h2>
          <span className="eb-owner-teacher-user" dir="ltr">{teacher.username}</span>
          <span className={"eb-owner-status eb-owner-status--" + teacher.status}>{STATUS_LABEL[teacher.status]}</span>
          {teacher.origin === "shared-password-workspace" && <span className="eb-owner-status eb-owner-status--legacy">المساحة القديمة</span>}
        </div>
        {back}
      </div>
      <p className="eb-owner-hint">الصلاحيات: <strong>{accessLabel(teacher, catalog.presets)}</strong></p>

      {stepUp && <StepUpPrompt token={token} onSignedOut={onSignedOut} onCancel={() => setStepUp(null)} onConfirmed={() => stepUp.retry()} />}
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      {notice && <p className="eb-owner-hint eb-owner-done" role="status">{notice}</p>}
      {issued && <InvitationPanel issued={issued} onClose={() => setIssued(null)} />}

      <Tabs label={"صفحة " + teacher.displayName} tabs={tabs} selectedId={tab} onSelect={id => setTab(id as TabId)} />
    </section>
  );
}

function ProfileForm({ teacher, busy, onSave }: { teacher: ManagedTeacher; busy: boolean; onSave: (f: TeacherProfileFields) => void }) {
  const [displayName, setDisplayName] = useState(teacher.displayName);
  const [fullName, setFullName] = useState(teacher.fullName);
  const [email, setEmail] = useState(teacher.email);
  const [phone, setPhone] = useState(teacher.phone);
  const [subjects, setSubjects] = useState(teacher.subjects.join("، "));
  const [notes, setNotes] = useState(teacher.notes);
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!displayName.trim()) { setError("اسم العرض مطلوب."); return; }
    setError("");
    onSave({ displayName: displayName.trim(), fullName: fullName.trim(), email: email.trim(), phone: phone.trim(), subjects: subjects.split(/[,،]/).map(s => s.trim()).filter(Boolean), notes: notes.trim() });
  }
  return (
    <form className="auth-form eb-owner-create" onSubmit={submit} noValidate aria-label="بيانات المعلم">
      <div className="eb-owner-grid">
        <label className="auth-field"><span>اسم المستخدم (لا يتغير)</span>
          <div className="auth-input"><input type="text" value={teacher.username} readOnly dir="ltr" /></div>
        </label>
        <label className="auth-field"><span>اسم العرض</span>
          <div className="auth-input"><input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={60} /></div>
        </label>
        <label className="auth-field"><span>الاسم الكامل</span>
          <div className="auth-input"><input type="text" value={fullName} onChange={e => setFullName(e.target.value)} maxLength={120} /></div>
        </label>
        <label className="auth-field"><span>البريد الإلكتروني</span>
          <div className="auth-input"><input type="email" value={email} onChange={e => setEmail(e.target.value)} dir="ltr" maxLength={160} /></div>
        </label>
        <label className="auth-field"><span>الهاتف</span>
          <div className="auth-input"><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" maxLength={40} /></div>
        </label>
        <label className="auth-field"><span>المواد (افصل بفاصلة)</span>
          <div className="auth-input"><input type="text" value={subjects} onChange={e => setSubjects(e.target.value)} /></div>
        </label>
      </div>
      <label className="auth-field"><span>ملاحظات إدارية (لا يراها المعلم)</span>
        <textarea className="eb-owner-textarea" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={3} />
      </label>
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      <p className="eb-owner-hint">أُنشئ الحساب <bdi>{formatDate(teacher.createdAt) || "—"}</bdi> · آخر تعديل <bdi>{formatDate(teacher.updatedAt) || "—"}</bdi></p>
      <div className="eb-owner-actions">
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ البيانات"}</button>
      </div>
    </form>
  );
}

/** What the server gives the teacher NOW (the «before» of every comparison): its capabilities, or none when it cannot be trusted. */
const nowCapabilities = (effective: EffectiveAccess) => (effective.access.status === "ok" ? effective.access.capabilities : []);

function modeNote(effective: EffectiveAccess): string {
  if (effective.accountStatus === "suspended") return "الحساب موقوف: لا وصول للمعلم مهما كانت صلاحياته، حتى تعيد تفعيله.";
  return effective.enforced
    ? "التطبيق مفعّل: يسري التغيير من الطلب التالي للمعلم."
    : "لن يتغير شيء الآن عند المعلم: تُطبَّق الصلاحيات حين تفعّل «التطبيق» في قسم «الصلاحيات».";
}

function AccessEditor({ teacher, catalog, history, effective, labels, busy, onSave }: {
  teacher: ManagedTeacher; catalog: Catalog; history: History; effective: EffectiveAccess; labels: Record<string, string>; busy: boolean; onSave: (d: AccessDraft) => void;
}) {
  const head = history.currentRevisionId ? history.entries.find(e => e.revisionId === history.currentRevisionId) : undefined;
  const headBroken = Boolean(history.currentRevisionId) && (!head || !head.valid);
  const initialKey = head && head.valid ? presetKey(head.preset) : headBroken ? "" : presetKey(catalog.presets.find(p => p.id === startingPresetId(teacher)));
  const initialSet = useMemo(() => {
    if (head && head.valid) return new Set(head.capabilities);
    const p = catalog.presets.find(x => presetKey(x) === initialKey);
    return new Set(p ? p.capabilities : []);
  }, [head, catalog.presets, initialKey]);
  const [key, setKey] = useState(initialKey);
  const [chosen, setChosen] = useState<Set<string>>(initialSet);
  const [reason, setReason] = useState("");
  const picked = catalog.presets.find(p => presetKey(p) === key);
  const modules = useMemo(() => {
    const out: { module: string; label: string; caps: AccessCapability[] }[] = [];
    for (const c of catalog.capabilities.filter(x => !x.ownerOnly)) {
      let m = out.find(x => x.module === c.module);
      if (!m) { m = { module: c.module, label: c.moduleLabel, caps: [] }; out.push(m); }
      m.caps.push(c);
    }
    return out;
  }, [catalog.capabilities]);
  const { grants, denies } = picked ? grantsAndDenies(picked.capabilities, chosen) : { grants: [], denies: [] };
  const unchanged = Boolean(head && head.valid && key === initialKey && chosen.size === initialSet.size && [...chosen].every(c => initialSet.has(c)));
  const reachable = modules.filter(m => m.caps.some(c => chosen.has(c.id)));

  return (
    <div className="eb-owner-access-editor">
      {headBroken && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />نسخة الصلاحيات الحالية غير صالحة، فالخادم يمنع هذا المعلم أثناء التطبيق. اختر حزمة واحفظ لإصلاحها.</div>}
      <fieldset className="eb-owner-access-options">
        <legend>الحزمة الأساسية</legend>
        {catalog.presets.map(p => (
          <label key={presetKey(p)} className="eb-owner-access-option">
            <input type="radio" name={"preset-" + teacher.accountId} value={presetKey(p)} checked={key === presetKey(p)} onChange={() => { setKey(presetKey(p)); setChosen(new Set(p.capabilities)); }} />
            <span><strong>{p.label}</strong><small>{p.description}</small></span>
          </label>
        ))}
      </fieldset>
      {picked ? (
        <>
          <p className="eb-owner-hint">عدّل الصلاحيات واحدة واحدة. تشغيل صلاحية يشغّل ما تحتاجه، وإيقافها يوقف ما يعتمد عليها. تغيير الحزمة يلغي التعديلات.</p>
          <div className="eb-owner-cap-groups">
            {modules.map(m => (
              <fieldset key={m.module} className="eb-owner-cap-group">
                <legend>{m.label} <small>({m.caps.filter(c => chosen.has(c.id)).length}/{m.caps.length})</small></legend>
                {m.caps.map(c => (
                  <label key={c.id} className="eb-owner-check">
                    <input type="checkbox" checked={chosen.has(c.id)} onChange={e => setChosen(s => (e.target.checked ? withCapability(s, c.id, catalog.capabilities) : withoutCapability(s, c.id, catalog.capabilities)))} />
                    <span>{c.label}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <p className="eb-owner-hint">مقارنة بالحزمة: <strong>{grants.length}</strong> مضافة · <strong>{denies.length}</strong> محجوبة</p>
          <DiffView label={"تغيّر صلاحيات " + teacher.displayName} before={nowCapabilities(effective)} after={[...chosen]} labelOf={id => labels[id] || id}
            addedTitle="سيكسبها المعلم" removedTitle="سيفقدها المعلم" emptyText="لا فرق عمّا يملكه المعلم الآن." />
          <div className="eb-owner-preview" role="region" aria-label="ما سيتمكن منه المعلم">
            <strong>ما سيتمكن منه المعلم:</strong>
            {reachable.length === 0 ? <p className="eb-owner-hint">لا شيء: لن تظهر له أي أداة أثناء التطبيق.</p> : (
              <ul>{reachable.map(m => <li key={m.module}>{m.label}: {m.caps.filter(c => chosen.has(c.id)).length} من {m.caps.length}</li>)}</ul>
            )}
          </div>
          <label className="auth-field"><span>سبب التغيير (اختياري، يظهر في السجل)</span>
            <div className="auth-input"><input type="text" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} /></div>
          </label>
        </>
      ) : <p className="eb-owner-hint">اختر حزمة أساسية أولًا.</p>}
      <p className="eb-owner-hint">{modeNote(effective)}</p>
      <div className="eb-owner-actions">
        <button type="button" className="auth-submit" disabled={busy || !picked || unchanged}
          onClick={() => picked && onSave({ presetId: picked.id, presetVersion: picked.version, grants, denies, reason: reason.trim() })}>حفظ الصلاحيات</button>
      </div>
    </div>
  );
}

function AccessHistory({ history, effective, presets, labels, busy, onRestore }: {
  history: History; effective: EffectiveAccess; presets: AccessPreset[]; labels: Record<string, string>; busy: boolean; onRestore: (e: AccessHistoryEntry, reason: string) => void;
}) {
  const [restoring, setRestoring] = useState<AccessHistoryEntry | null>(null);
  const [reason, setReason] = useState("");
  const presetName = (p: AccessHistoryEntry["preset"]) => (p ? presets.find(x => x.id === p.id && x.version === p.version)?.label || p.id : "—");
  const columns: DataColumn<AccessHistoryEntry>[] = [
    { id: "date", header: "التاريخ", cell: e => <bdi>{formatDate(e.createdAt) || "—"}</bdi> },
    { id: "preset", header: "الحزمة", cell: e => <>{presetName(e.preset)}{(e.grants.length || e.denies.length) ? <small> (+{e.grants.length} / −{e.denies.length})</small> : null}</> },
    { id: "reason", header: "السبب", cell: e => e.reason || "—" },
    { id: "by", header: "بواسطة", cell: e => actorLabel(e.createdBy) },
    { id: "state", header: "الحالة", cell: e => (!e.valid ? <span className="eb-owner-status eb-owner-status--suspended">غير صالحة</span> : e.revisionId === history.currentRevisionId ? <span className="eb-owner-status eb-owner-status--active">الحالية</span> : "—") },
    { id: "act", header: "إجراء", cell: e => (e.valid && e.revisionId !== history.currentRevisionId
      ? <button type="button" className="eb-owner-secondary" disabled={busy} aria-label={"استعادة نسخة " + (formatDate(e.createdAt) || e.revisionId)} onClick={() => { setRestoring(e); setReason(""); }}>استعادة</button>
      : null) }
  ];
  return (
    <div className="eb-owner-history">
      <DataTable caption="سجل نسخ الصلاحيات (الأحدث أولًا)" columns={columns} rows={history.entries} rowKey={e => e.revisionId}
        emptyText="لا توجد نسخ صلاحيات بعد. أول حفظ في «الصلاحيات» ينشئ النسخة الأولى." />
      {history.truncated && <p className="eb-owner-hint">يُعرض أحدث {history.entries.length} نسخة فقط.</p>}
      {restoring && (
        <div className="eb-owner-confirm eb-owner-access" role="group" aria-label="تأكيد الاستعادة">
          <p>ستُنشأ نسخة جديدة بمحتوى نسخة <bdi>{formatDate(restoring.createdAt)}</bdi>. السجل لا يُحذف منه شيء.</p>
          <DiffView label="تغيّر الصلاحيات عند الاستعادة" before={nowCapabilities(effective)} after={restoring.capabilities} labelOf={id => labels[id] || id}
            addedTitle="سيكسبها المعلم" removedTitle="سيفقدها المعلم" emptyText="لا فرق عمّا يملكه المعلم الآن." />
          <label className="auth-field"><span>سبب الاستعادة (اختياري)</span>
            <div className="auth-input"><input type="text" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} /></div>
          </label>
          <p className="eb-owner-hint">{modeNote(effective)}</p>
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={() => { onRestore(restoring, reason.trim()); setRestoring(null); }}>تأكيد الاستعادة</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setRestoring(null)}>إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityPanel({ teacher, busy, onAct }: { teacher: ManagedTeacher; busy: boolean; onAct: (a: TeacherAction, reason?: string) => void }) {
  const [confirming, setConfirming] = useState<TeacherAction | null>(null);
  const [reason, setReason] = useState("");
  return (
    <div className="eb-owner-security">
      <dl className="eb-owner-facts">
        <div><dt>الحالة</dt><dd>{STATUS_LABEL[teacher.status]}</dd></div>
        <div><dt>كلمة المرور</dt><dd>{teacher.hasPassword ? "وضعها المعلم" : "لم توضع بعد"}</dd></div>
        <div><dt>آخر دخول</dt><dd><bdi>{formatDate(teacher.lastLoginAt) || "لم يدخل بعد"}</bdi></dd></div>
        {teacher.invitation && <div><dt>رابط {teacher.invitation.purpose === "reset" ? "إعادة التعيين" : "الدعوة"}</dt><dd>صالح حتى <bdi>{formatDate(teacher.invitation.expiresAt)}</bdi></dd></div>}
        {teacher.status === "suspended" && <div><dt>أوقف في</dt><dd><bdi>{formatDate(teacher.suspendedAt || "") || "—"}</bdi></dd></div>}
        {teacher.status === "suspended" && <div><dt>سبب الإيقاف</dt><dd>{teacher.suspendedReason || "لم يُذكر"}</dd></div>}
      </dl>
      {confirming ? (
        <div className="eb-owner-confirm" role="group" aria-label={"تأكيد " + ACTION_LABEL[confirming]}>
          <p>{CONFIRM_TEXT[confirming]}</p>
          {confirming === "suspend" && (
            <label className="auth-field"><span>سبب الإيقاف (اختياري، لك وحدك، لا يراه المعلم)</span>
              <textarea className="eb-owner-textarea" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} rows={2} />
            </label>
          )}
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={() => { onAct(confirming, confirming === "suspend" ? reason.trim() : undefined); setConfirming(null); setReason(""); }}>تأكيد: {ACTION_LABEL[confirming]}</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setConfirming(null)}>إلغاء</button>
          </div>
        </div>
      ) : (
        <div className="eb-owner-actions">
          {actionsFor(teacher).map(action => (
            <button key={action} type="button" className={"eb-owner-secondary" + (action === "suspend" ? " eb-owner-danger" : "")} disabled={busy}
              onClick={() => (CONFIRM_TEXT[action] ? setConfirming(action) : onAct(action))}>{ACTION_LABEL[action]}</button>
          ))}
        </div>
      )}
    </div>
  );
}
