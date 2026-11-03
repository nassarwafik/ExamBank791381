import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { IconPlus, IconWarning } from "../icons";
import { ownerClassesApi, type ApiResult, type OwnerClass, type OwnerClassFields, type OwnerClassLifecycle } from "./ownerApi";

/**
 * Tadris+ P5-B2 — owner decision D18 (revised): «انا المالك انشيء الصفوف». The «الصفوف» tab of a teacher's page in the Owner Console:
 * the teacher's classes (active first, then archived), a form to create a class for them, and per class: edit its labels, archive /
 * restore, graduate. The class belongs to the teacher, who sees it and adds students to it. Every change goes through the page's
 * `send` (a recent second-factor check is asked inline, then the same change is retried); the server decides everything.
 */

type Send = <T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void) => Promise<void>;
const STATUS_TEXT: Record<OwnerClass["status"], string> = { active: "نشط", archived: "مؤرشف" };
const LIFECYCLE_DONE: Record<OwnerClassLifecycle, string> = { archive: "أُرشف الصف.", unarchive: "استُعيد الصف.", graduate: "تخرّج الصف وأُرشف." };
const EMPTY: OwnerClassFields = { name: "", grade: "", schoolYear: "" };

function newRequestKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c && typeof c.randomUUID === "function" ? c.randomUUID() : "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

export default function OwnerTeacherClasses({ token, accountId, teacherName, busy, send, onSignedOut }: {
  token: string; accountId: string; teacherName: string; busy: boolean; send: Send; onSignedOut: () => void;
}) {
  const [classes, setClasses] = useState<OwnerClass[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [nonce, setNonce] = useState(0);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const signedOut = useRef(onSignedOut);
  useEffect(() => { signedOut.current = onSignedOut; }, [onSignedOut]);

  useEffect(() => {
    let live = true;
    void ownerClassesApi.list(token, accountId).then(r => {
      if (!live) return;
      if (r.ok) { setClasses(r.data.classes); setLoadError(""); }
      else if (r.status === 401) signedOut.current();
      else setLoadError(r.error);
    });
    return () => { live = false; };
  }, [token, accountId, nonce]);
  const reload = () => setNonce(n => n + 1);
  const done = (text: string) => { setNotice(text); reload(); };

  const active = (classes || []).filter(c => c.status === "active");
  const archived = (classes || []).filter(c => c.status !== "active");

  return (
    <div className="eb-owner-classes">
      <div className="eb-owner-panel-head">
        <p className="eb-owner-hint">صفوف <bdi>{teacherName}</bdi>. الصف الذي تنشئه هنا يظهر في صفحة المعلم مباشرة، ويضيف إليه طلابه بنفسه.</p>
        {!creating && <button type="button" className="eb-owner-secondary" onClick={() => setCreating(true)}><IconPlus size={16} aria-hidden="true" /> إنشاء صف</button>}
      </div>
      {notice && <p className="eb-owner-hint eb-owner-done" role="status">{notice}</p>}
      {creating && (
        <ClassForm label="إنشاء صف" submitText="إنشاء الصف" initial={EMPTY} busy={busy} onCancel={() => setCreating(false)}
          onSubmit={fields => { const key = newRequestKey(); return send(() => ownerClassesApi.create(token, accountId, fields, key), () => { setCreating(false); done("أُنشئ الصف " + fields.name + "."); }); }} />
      )}
      {loadError && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{loadError} <button type="button" className="eb-owner-secondary" onClick={reload}>إعادة المحاولة</button></div>}
      {classes === null && !loadError && <p className="eb-owner-hint" role="status">جارٍ تحميل الصفوف…</p>}
      {classes && classes.length === 0 && <p className="eb-owner-hint">لا توجد صفوف لهذا المعلم بعد.</p>}
      {active.length > 0 && (
        <ul className="eb-owner-teacher-list" aria-label="الصفوف النشطة">
          {active.map(c => <ClassCard key={c.classId} c={c} busy={busy} token={token} send={send} done={done} />)}
        </ul>
      )}
      {archived.length > 0 && (
        <>
          <h3 className="eb-owner-h3">الصفوف المؤرشفة</h3>
          <ul className="eb-owner-teacher-list" aria-label="الصفوف المؤرشفة">
            {archived.map(c => <ClassCard key={c.classId} c={c} busy={busy} token={token} send={send} done={done} />)}
          </ul>
        </>
      )}
    </div>
  );
}

function ClassCard({ c, busy, token, send, done }: { c: OwnerClass; busy: boolean; token: string; send: Send; done: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<OwnerClassLifecycle | null>(null);
  const act = (action: OwnerClassLifecycle) => send(() => ownerClassesApi.lifecycle(token, action, c.classId), () => { setConfirm(null); done(LIFECYCLE_DONE[action]); });
  return (
    <li className="eb-owner-teacher" aria-label={c.name}>
      <div className="eb-owner-teacher-main">
        <strong><bdi>{c.name}</bdi></strong>
        <span className="eb-owner-hint">الصف {c.grade} · {c.schoolYear}</span>
        <span className="eb-owner-hint">{c.studentCount} {c.studentCount === 1 ? "طالب" : "طلاب"}</span>
        <span className={"eb-owner-status eb-owner-status--" + (c.status === "active" ? "active" : "suspended")}>{STATUS_TEXT[c.status]}</span>
      </div>
      {editing ? (
        <ClassForm label={"تعديل " + c.name} submitText="حفظ" initial={{ name: c.name, grade: c.grade, schoolYear: c.schoolYear }} busy={busy} onCancel={() => setEditing(false)}
          onSubmit={fields => send(() => ownerClassesApi.update(token, c.classId, fields), d => { setEditing(false); done(d.changed ? "حُفظت بيانات الصف." : "لا تغيير."); })} />
      ) : confirm ? (
        <div className="eb-owner-confirm" role="group" aria-label={"تأكيد " + c.name}>
          <p>{confirm === "graduate" ? "سيُؤرشف الصف كصف متخرج. يبقى كل شيء محفوظًا: الطلاب ونتائجهم." : "سيُؤرشف الصف. يبقى كل شيء محفوظًا، ويمكن استعادته."} لا تُؤرشف الصفوف التي لديها تصحيح معلّق.</p>
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={() => void act(confirm)}>{confirm === "graduate" ? "تأكيد: تخريج الصف" : "تأكيد: أرشفة الصف"}</button>
            <button type="button" className="eb-owner-secondary" onClick={() => setConfirm(null)}>إلغاء</button>
          </div>
        </div>
      ) : (
        <div className="eb-owner-actions">
          {c.status === "active" ? (
            <>
              <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => setEditing(true)}>تعديل</button>
              <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => setConfirm("archive")}>أرشفة</button>
              <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => setConfirm("graduate")}>تخريج</button>
            </>
          ) : (
            <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => void act("unarchive")}>استعادة</button>
          )}
        </div>
      )}
    </li>
  );
}

function ClassForm({ label, submitText, initial, busy, onSubmit, onCancel }: {
  label: string; submitText: string; initial: OwnerClassFields; busy: boolean; onSubmit: (f: OwnerClassFields) => Promise<void> | void; onCancel: () => void;
}) {
  const [f, setF] = useState<OwnerClassFields>(initial);
  const [missing, setMissing] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    const fields = { name: f.name.trim(), grade: f.grade.trim(), schoolYear: f.schoolYear.trim() };
    if (!fields.name || !fields.grade || !fields.schoolYear) { setMissing(true); return; }
    setMissing(false);
    void onSubmit(fields);
  }
  const field = (key: keyof OwnerClassFields, text: string, placeholder: string) => (
    <label className="auth-field"><span>{text}</span>
      <div className="auth-input"><input type="text" value={f[key]} placeholder={placeholder} maxLength={120} onChange={e => setF(v => ({ ...v, [key]: e.target.value }))} /></div>
    </label>
  );
  return (
    <form className="auth-form eb-owner-create" onSubmit={submit} noValidate aria-label={label}>
      {field("name", "اسم الصف", "مثال: الحادي عشر أ")}
      {field("grade", "الصف الدراسي", "مثال: 11")}
      {field("schoolYear", "السنة الدراسية", "مثال: 2026-2027")}
      {missing && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />أدخل اسم الصف والصف الدراسي والسنة الدراسية.</p>}
      <div className="eb-owner-actions">
        <button type="submit" className="auth-submit" disabled={busy}>{submitText}</button>
        <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
