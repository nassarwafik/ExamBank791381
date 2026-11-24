import { useEffect, useState } from "react";
import { IconWarning } from "../icons";
import { ownerClassCopyApi, ownerClassesApi, ownerTeachersApi, type ApiResult, type ClassCopyPreview, type ManagedTeacher, type OwnerClass } from "./ownerApi";

/**
 * Tadris+ P11-D — «نسخ الطلاب إلى معلم آخر» on a class of the teacher's page (owner request: the students learn with both teachers,
 * so the class shows at both). Choose the other teacher, then one of their active classes or a NEW class with this class's name; the
 * server preview says who joins (archived students are not copied; a student already there is skipped); confirm. Each student joins
 * with the SAME account (a shared class, P11-A): no new account, no password. This class, its teacher and its history stay as they
 * are; each teacher sees their own class's results. The changes go through the page's `send` (second-factor check asked inline, then
 * the same request is retried). The server decides everything.
 */

type Send = <T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void) => Promise<void>;
const NEW = "__new__";

function newRequestKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c && typeof c.randomUUID === "function" ? c.randomUUID() : "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

export default function OwnerClassCopy({ token, c, fromAccountId, busy, send, onDone, onCancel }: {
  token: string; c: OwnerClass; fromAccountId: string; busy: boolean; send: Send; onDone: (text: string) => void; onCancel: () => void;
}) {
  const [teachers, setTeachers] = useState<ManagedTeacher[] | null>(null);
  const [to, setTo] = useState("");
  const [classes, setClasses] = useState<OwnerClass[] | null>(null);
  const [target, setTarget] = useState("");
  const [preview, setPreview] = useState<ClassCopyPreview | null>(null);
  const [error, setError] = useState("");
  const [failures, setFailures] = useState<string[]>([]);
  // a NEW class created by this screen: kept, so a retry after a failed copy never creates a second one
  const [created, setCreated] = useState<OwnerClass | null>(null);
  const [requestKey] = useState(newRequestKey);

  useEffect(() => {
    let live = true;
    void ownerTeachersApi.list(token).then(r => { if (live) { if (r.ok) setTeachers(r.data.teachers.filter(t => t.accountId !== fromAccountId)); else setError(r.error); } });
    return () => { live = false; };
  }, [token, fromAccountId]);

  async function loadPreview(classId: string) {
    setTarget(classId); setPreview(null); setError(""); setFailures([]);
    if (!classId) return;
    const r = await ownerClassCopyApi.preview(token, c.classId, classId === NEW ? "" : classId);
    if (r.ok) setPreview(r.data.preview); else setError(r.error);
  }
  async function pickTeacher(accountId: string) {
    setTo(accountId); setClasses(null); setTarget(""); setPreview(null); setError(""); setFailures([]); setCreated(null);
    if (!accountId) return;
    const r = await ownerClassesApi.list(token, accountId);
    if (!r.ok) { setError(r.error); return; }
    const active = r.data.classes.filter(x => x.status === "active");
    setClasses(active);
    if (!active.length) void loadPreview(NEW);
  }

  const teacher = (teachers || []).find(t => t.accountId === to);
  const teacherName = teacher?.displayName || "المعلم";
  const chosen = target === NEW ? null : (classes || []).find(x => x.classId === target) || null;

  function copyInto(classroom: OwnerClass) {
    return send(() => ownerClassCopyApi.copy(token, c.classId, classroom.classId), d => {
      const failed = new Map(d.errors.map(e => [e.userId, e.error]));
      if (d.failed) { setFailures(Array.from(failed.values())); return; }
      onDone("نُسخ " + d.enrolled + " طالبًا من «" + c.name + "» إلى «" + classroom.name + "» عند " + teacherName + (d.already ? "، و" + d.already + " كانوا فيه مسبقًا" : "") +
        ". يظهر الطلاب عند المعلمَين بحساباتهم نفسها، ويرى كل معلم علامات صفه فقط.");
    });
  }
  function confirm() {
    if (target !== NEW) { if (chosen) void copyInto(chosen); return; }
    if (created) { void copyInto(created); return; }
    void send(() => ownerClassesApi.create(token, to, { name: c.name, grade: c.grade, schoolYear: c.schoolYear }, requestKey), d => { setCreated(d.classroom); void copyInto(d.classroom); });
  }

  const nothing = !!preview && preview.toAdd === 0;
  return (
    <div className="eb-owner-confirm" role="group" aria-label={"نسخ طلاب " + c.name}>
      <p className="eb-owner-hint">ينضم طلاب «<bdi>{c.name}</bdi>» إلى صف معلم آخر أيضًا بحساباتهم نفسها، ويبقى هذا الصف عند معلمه كما هو.</p>
      <label className="auth-field"><span>المعلم الآخر</span>
        <div className="auth-input"><select value={to} onChange={e => void pickTeacher(e.target.value)} disabled={!teachers}>
          <option value="">{teachers ? "اختر معلمًا…" : "جارٍ التحميل…"}</option>
          {(teachers || []).map(t => <option key={t.accountId} value={t.accountId}>{t.displayName + " (" + t.username + ")"}</option>)}
        </select></div>
      </label>
      {classes && (
        <label className="auth-field"><span>الصف عند <bdi>{teacherName}</bdi></span>
          <div className="auth-input"><select value={target} onChange={e => void loadPreview(e.target.value)}>
            <option value="">اختر صفًا…</option>
            {classes.map(x => <option key={x.classId} value={x.classId}>{x.name + " · " + x.studentCount + " طالبًا"}</option>)}
            <option value={NEW}>{"صف جديد باسم «" + c.name + "»"}</option>
          </select></div>
        </label>
      )}
      {error && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</p>}
      {preview && (
        <div role="region" aria-label="ما سيُنسخ">
          <p>{target === NEW
            ? <>سيُنشأ عند <bdi>{teacherName}</bdi> صف جديد «<bdi>{c.name}</bdi>» (الصف {c.grade} · {c.schoolYear})، وينضم إليه:</>
            : <>سينضم إلى «<bdi>{chosen?.name}</bdi>» عند <bdi>{teacherName}</bdi>:</>}</p>
          <ul className="eb-owner-hint">
            <li>{preview.toAdd} طالبًا بحساباتهم نفسها: رقم الهوية وكلمة المرور نفسهما، ولا حساب جديد</li>
            {preview.already > 0 && <li>{preview.already} طالبًا في الصف مسبقًا: لا تغيير</li>}
            {preview.archived > 0 && <li>{preview.archived} طالبًا مؤرشفًا: لا يُنسخ</li>}
            {preview.atLimit > 0 && <li>{preview.atLimit} طالبًا بلغ الحد الأقصى للصفوف الإضافية: لن يُضاف</li>}
          </ul>
          <ul className="eb-owner-hint">
            <li>يرى الطالب واجبات المعلمَين، ولكل معلم محادثة منفصلة معه.</li>
            <li>يرى كل معلم واجبات صفه وعلاماته فقط. لا تُنسخ واجبات هذا الصف ولا علاماته.</li>
            <li>يبقى الحساب نفسه (الاسم، كلمة المرور، الأرشفة) عند <bdi>{c.name}</bdi> ومعلمه.</li>
          </ul>
          {failures.length > 0 && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />لم يُضَف بعض الطلاب: <ul>{failures.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
          <div className="eb-owner-actions">
            {!nothing && <button type="button" className="auth-submit" disabled={busy} onClick={confirm}>{"تأكيد: نسخ " + preview.toAdd + " طالبًا"}</button>}
            <button type="button" className="eb-owner-secondary" onClick={onCancel}>{failures.length ? "إغلاق" : "إلغاء"}</button>
          </div>
          {nothing && <p className="eb-owner-hint" role="status">لا يوجد طلاب لنسخهم إلى هذا الصف.</p>}
        </div>
      )}
      {!preview && <div className="eb-owner-actions"><button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button></div>}
    </div>
  );
}
