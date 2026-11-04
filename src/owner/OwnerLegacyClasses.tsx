import { useEffect, useState } from "react";
import { IconWarning } from "../icons";
import StepUpPrompt from "./StepUpPrompt";
import {
  ownerLegacyApi, ownerTeachersApi,
  type ApiResult, type LegacyClass, type LegacyDecision, type LegacyLedger, type LegacyPlan, type LegacyVisibility, type ManagedTeacher
} from "./ownerApi";

/**
 * Tadris+ P9-A2 — «البيانات القديمة» in the Owner Console (#/owner/legacy; the P9-A1 server /api/owner-legacy-classes; owner
 * decisions §19.33, the approved design docs/enterprise-legacy-ownership-p9a.md). For every class WITHOUT an owner, the owner
 * decides — one class at a time, never automatically:
 *   «إسناد إلى معلم» (the class and its students without an owner; another teacher's student is never touched),
 *   «يبقى مشتركًا» (nothing changes: the decision is recorded), or «أرشفة» (the class is archived; every result is kept).
 * «معاينة» first — it writes nothing and shows exactly what would change and who would lose / gain the class; then a written reason
 * and «تنفيذ القرار» (refused when anything changed since the preview: preview again). The decisions list offers «تراجع» (refused
 * when the class or its students changed since). Every change needs a recent second-factor check (asked inline, then retried). The
 * server decides everything; a 401 signs out. Results and submissions are never touched.
 */

const DECISION_LABEL: Record<LegacyDecision, string> = { assign: "إسناد إلى معلم", shared: "يبقى مشتركًا", archive: "أرشفة" };
const STATUS_LABEL: Record<string, string> = { applied: "مُنفَّذ", pending: "لم يكتمل", undone: "تُرُوجع عنه", refused: "مرفوض" };
const MIN_REASON = 5;
const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" }); };
/** A request key for one decision (repeating it resumes the same decision on the server, never applies it twice). */
function newRequestKey(): string {
  const bytes = new Uint8Array(12);
  try { crypto.getRandomValues(bytes); } catch { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
  return "lg" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export default function OwnerLegacyClasses({ token, onSignedOut }: { token: string; onSignedOut: () => void }) {
  const [data, setData] = useState<{ visibilityToday: LegacyVisibility; classes: LegacyClass[]; ledgers: LegacyLedger[] } | null>(null);
  const [teachers, setTeachers] = useState<ManagedTeacher[]>([]);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stepUp, setStepUp] = useState<{ retry: () => Promise<void> } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([ownerLegacyApi.inventory(token), ownerLegacyApi.ledger(token), ownerTeachersApi.list(token)]).then(([inv, led, tea]) => {
      if (!live) return;
      if ([inv, led, tea].some(r => !r.ok && r.status === 401)) { onSignedOut(); return; }
      if (!inv.ok) { setError(inv.error); return; }
      setData({ visibilityToday: inv.data.visibilityToday, classes: inv.data.classes, ledgers: led.ok ? led.data.ledgers : [] });
      if (tea.ok) setTeachers(tea.data.teachers);
    });
    return () => { live = false; };
  }, [token, nonce, onSignedOut]);

  async function send<T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void, onRefused?: (r: { code: string; error: string }) => void): Promise<void> {
    setBusy(true); setError(""); setNotice("");
    const r = await call();
    setBusy(false);
    if (r.ok) { setStepUp(null); onOk(r.data); return; }
    if (r.status === 401) { onSignedOut(); return; }
    if (r.code === "STEP_UP_REQUIRED") { setStepUp({ retry: () => send(call, onOk, onRefused) }); return; }
    setStepUp(null);
    setError(r.error);
    onRefused?.(r);
  }

  const nameOf = (accountId: string) => { const t = teachers.find(x => x.accountId === accountId); return t ? t.displayName + " (" + t.username + ")" : accountId; };
  const visibilityText = (v: LegacyVisibility) => (v.kind === "shared"
    ? "مشتركة: يراها المعلمون القدامى ومساحة كلمة المرور المشتركة المستوردة، ولا يراها أي حساب أنشأته من هذه اللوحة."
    : v.kind === "legacy-owner" ? "كلها عند المعلم " + nameOf(v.accountId) + " (إعداد الخادم LEGACY_DATA_OWNER)." : "عند المعلم " + nameOf(v.accountId) + " وحده.");
  const done = (text: string) => { setOpen(null); setUndoing(null); setNotice(text); setNonce(n => n + 1); };

  return (
    <section className="eb-owner-panel eb-owner-legacy" aria-labelledby="eb-owner-legacy-title">
      <h2 id="eb-owner-legacy-title" className="eb-owner-h2">البيانات القديمة</h2>
      <p className="eb-owner-hint">صفوف أُنشئت قبل ملكية الحسابات فليس لها مالك. لكل صف تقرر أنت: إسناده إلى معلم (يراه هو وحده مع طلابه وواجباته ونتائجه)، أو إبقاءه مشتركًا كما هو، أو أرشفته. «معاينة» لا تغيّر شيئًا، والتنفيذ يحتاج سببًا وتحققًا إضافيًا، ويمكن التراجع ما دام الصف لم يتغيّر. لا تُمس النتائج ولا التسليمات أبدًا.</p>

      {stepUp && <StepUpPrompt token={token} onSignedOut={onSignedOut} onCancel={() => setStepUp(null)} onConfirmed={() => stepUp.retry()} />}
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      {notice && <p className="eb-owner-hint eb-owner-done" role="status">{notice}</p>}
      {data === null && !error && <p className="eb-owner-hint" role="status">جارٍ تحميل الصفوف بلا مالك…</p>}

      {data && (
        <>
          <p className="eb-owner-hint">اليوم: {visibilityText(data.visibilityToday)}</p>
          <h3 className="eb-owner-h3">صفوف بلا مالك ({data.classes.length})</h3>
          {data.classes.length === 0 && <p className="eb-owner-hint">لا توجد صفوف بلا مالك.</p>}
          {data.classes.length > 0 && (
            <ul className="eb-owner-teacher-list" aria-label="صفوف بلا مالك">
              {data.classes.map(c => (
                <li key={c.classId} className="eb-owner-teacher" aria-label={c.name || c.classId}>
                  <div className="eb-owner-teacher-main">
                    <strong>{c.name || c.classId}</strong>
                    <span className="eb-owner-hint">
                      {[c.grade, c.schoolYear].filter(Boolean).join(" · ")}{c.status === "archived" ? " · مؤرشف" : ""}
                      {" · "}{c.students.total} طالبًا{c.students.archived ? " (منهم " + c.students.archived + " مؤرشف)" : ""}
                      {c.students.withOwner ? " · " + c.students.withOwner + " لهم معلم آخر" : ""}
                      {" · "}{c.assignments.total} واجبًا
                    </span>
                    {c.decision && <span className="eb-owner-hint">القرار المسجّل: {DECISION_LABEL[c.decision.decision]}{c.decision.toAccountId ? " → " + nameOf(c.decision.toAccountId) : ""} ({fmt(c.decision.at)})</span>}
                  </div>
                  {open !== c.classId && <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => { setOpen(c.classId); setNotice(""); setError(""); }}>اتخاذ قرار</button>}
                  {open === c.classId && <LegacyDecisionPanel token={token} c={c} teachers={teachers} busy={busy} send={send} nameOf={nameOf} visibilityText={visibilityText} onDone={done} onCancel={() => setOpen(null)} />}
                </li>
              ))}
            </ul>
          )}

          <h3 className="eb-owner-h3">القرارات ({data.ledgers.length})</h3>
          {data.ledgers.length === 0 && <p className="eb-owner-hint">لم تُتخذ أي قرارات بعد.</p>}
          {data.ledgers.length > 0 && (
            <ul className="eb-owner-teacher-list" aria-label="القرارات">
              {data.ledgers.map(l => (
                <li key={l.migrationId} className="eb-owner-teacher" aria-label={"قرار " + (l.className || l.classId)}>
                  <div className="eb-owner-teacher-main">
                    <strong>{l.className || l.classId}: {DECISION_LABEL[l.decision]}{l.to ? " → " + nameOf(l.to) : ""}</strong>
                    <span className="eb-owner-hint">{STATUS_LABEL[l.status] || l.status} · {fmt(l.at)} · السبب: {l.reason}</span>
                    {l.status === "undone" && l.undoReason && <span className="eb-owner-hint">سبب التراجع: {l.undoReason} ({fmt(l.undoneAt || "")})</span>}
                  </div>
                  {l.status === "applied" && undoing !== l.migrationId && <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => { setUndoing(l.migrationId); setNotice(""); setError(""); }}>تراجع</button>}
                  {undoing === l.migrationId && <LegacyUndo token={token} ledger={l} busy={busy} send={send} onDone={done} onCancel={() => setUndoing(null)} />}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

type Send = <T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void, onRefused?: (r: { code: string; error: string }) => void) => Promise<void>;

function LegacyDecisionPanel({ token, c, teachers, busy, send, nameOf, visibilityText, onDone, onCancel }: {
  token: string; c: LegacyClass; teachers: ManagedTeacher[]; busy: boolean; send: Send; nameOf: (id: string) => string;
  visibilityText: (v: LegacyVisibility) => string; onDone: (text: string) => void; onCancel: () => void;
}) {
  const [decision, setDecision] = useState<LegacyDecision>("assign");
  const [to, setTo] = useState("");
  const [plan, setPlan] = useState<LegacyPlan | null>(null);
  const [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [incomplete, setIncomplete] = useState(false);
  const eligible = teachers.filter(t => t.status !== "suspended");
  const choose = (next: LegacyDecision) => { setDecision(next); setPlan(null); setIncomplete(false); };
  const preview = () => void send(() => ownerLegacyApi.preview(token, c.classId, decision, to), d => { setPlan(d.plan); setRequestKey(newRequestKey()); setIncomplete(false); });
  const apply = () => {
    if (!plan) return;
    void send(() => ownerLegacyApi.apply(token, { classId: c.classId, decision: plan.decision, toAccountId: plan.to, reason: reason.trim(), previewDigest: plan.digest, requestKey }), d => {
      if (d.ledger.status === "pending") { setIncomplete(true); return; }   // a write failed half-way: the same request completes it
      onDone(plan.decision === "assign" ? "أُسند الصف «" + plan.className + "» إلى " + nameOf(plan.to) + "."
        : plan.decision === "archive" ? "أُرشف الصف «" + plan.className + "». نتائجه كلها محفوظة." : "سُجّل القرار: يبقى الصف «" + plan.className + "» مشتركًا.");
    }, r => { if (r.code === "PREVIEW_STALE") setPlan(null); });
  };
  const studentChanges = plan ? plan.changes.filter(x => x.type === "student") : [];

  return (
    <div className="eb-owner-confirm" role="group" aria-label={"قرار " + (c.name || c.classId)}>
      <fieldset className="auth-field" disabled={busy}>
        <legend>القرار</legend>
        {(["assign", "shared", "archive"] as LegacyDecision[]).map(d => (
          <label key={d} className="eb-owner-check"><input type="radio" name={"legacy-" + c.classId} checked={decision === d} onChange={() => choose(d)} disabled={d === "archive" && c.status === "archived"} />{DECISION_LABEL[d]}</label>
        ))}
      </fieldset>
      {decision === "assign" && (
        <label className="auth-field"><span>المعلم</span>
          <div className="auth-input"><select value={to} onChange={e => { setTo(e.target.value); setPlan(null); }}>
            <option value="">اختر معلمًا…</option>
            {eligible.map(t => <option key={t.accountId} value={t.accountId}>{t.displayName + " (" + t.username + ")"}</option>)}
          </select></div>
        </label>
      )}
      {!plan && (
        <div className="eb-owner-actions">
          <button type="button" className="eb-owner-secondary" disabled={busy || (decision === "assign" && !to)} onClick={preview}>معاينة</button>
          <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
        </div>
      )}
      {plan && (
        <div role="region" aria-label="المعاينة">
          <p>المعاينة (لم يتغيّر شيء بعد):</p>
          <ul className="eb-owner-hint">
            {plan.decision === "assign" && <li>يُسند الصف و{studentChanges.length} طالبًا{studentChanges.some(x => x.archived) ? " (منهم " + studentChanges.filter(x => x.archived).length + " مؤرشف)" : ""} إلى {nameOf(plan.to)}، مع واجباتهم ونتائجهم.</li>}
            {plan.decision === "assign" && plan.untouched.length > 0 && <li>{plan.untouched.length} طالبًا لهم معلم آخر: لن يُمسّوا.</li>}
            {plan.decision === "shared" && <li>لا يتغيّر شيء. يُسجَّل القرار فقط.</li>}
            {plan.decision === "archive" && <li>يُؤرشف الصف. نتائجه وتسليماته كلها محفوظة{plan.pendingGrading > 0 ? "، لكن " + plan.pendingGrading + " عملًا ينتظر التصحيح: ستُرفض الأرشفة حتى يُصحَّح" : ""}.</li>}
            <li>الآن: {visibilityText(plan.visibility.before)}</li>
            {plan.decision === "assign" && <li>بعد القرار: {visibilityText(plan.visibility.after)} من كان يراه مشتركًا لن يراه.</li>}
            {plan.decision === "assign" && <li>خدمات الطلاب (الرسائل، والألعاب، والمواد) تتبع صلاحيات {nameOf(plan.visibility.studentServicesFollow)}.</li>}
          </ul>
          <label className="auth-field"><span>سبب القرار (مطلوب، يُحفظ في السجل)</span>
            <div className="auth-input"><input type="text" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></div>
          </label>
          {incomplete && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />لم يكتمل التنفيذ. اضغط «إكمال التنفيذ» لإتمامه بالطلب نفسه.</p>}
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy || reason.trim().length < MIN_REASON} onClick={apply}>{incomplete ? "إكمال التنفيذ" : "تنفيذ القرار"}</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setPlan(null)}>رجوع</button>
            <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LegacyUndo({ token, ledger, busy, send, onDone, onCancel }: { token: string; ledger: LegacyLedger; busy: boolean; send: Send; onDone: (text: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const undo = () => void send(() => ownerLegacyApi.undo(token, ledger.migrationId, reason.trim()), () => onDone("تُرُوجع عن القرار على الصف «" + (ledger.className || ledger.classId) + "»: عاد كما كان."));
  return (
    <div className="eb-owner-confirm" role="group" aria-label={"تراجع عن قرار " + (ledger.className || ledger.classId)}>
      <p className="eb-owner-hint">يعود الصف وطلابه إلى حالتهم قبل القرار، فقط إن لم يتغيّروا منذه.</p>
      <label className="auth-field"><span>سبب التراجع (مطلوب)</span>
        <div className="auth-input"><input type="text" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></div>
      </label>
      <div className="eb-owner-actions">
        <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy || reason.trim().length < MIN_REASON} onClick={undo}>تأكيد التراجع</button>
        <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
      </div>
    </div>
  );
}
