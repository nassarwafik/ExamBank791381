import { useEffect, useState } from "react";
import { IconWarning } from "../icons";
import OwnerConversation from "./OwnerConversation";   // Tadris+ P7-B1 (D14)
import {
  ownerClassesApi, ownerStudentsApi, ownerStudentTransferApi, ownerTeachersApi, type ApiResult, type ManagedTeacher, type OwnerClass, type OwnerRosterStudent, type StudentTransferPreview
} from "./ownerApi";

/**
 * Tadris+ P5-B3b — «طلاب الصف» on a class of the teacher's page: the class's students, and «نقل إلى معلم آخر» for ONE student
 * (owner decisions §19.21, D16): choose the teacher, then one of that teacher's active classes, see the preview, optional reason,
 * confirm. After the move the new teacher sees the student's learning progress, but neither the old class's grades nor the
 * conversation before the move; the former teacher keeps the old results as «منقول». A student with work awaiting the former teacher
 * cannot move yet (the server says so). Moving between classes of the SAME teacher stays on the teacher's own page.
 *
 * Tadris+ P11-A — a student ADDED to this class from another class («مشترك»: the account and the first teacher stay as they are) is
 * listed too. Such a student is not moved from here (the move is made from the home class) — the owner may REMOVE the student from
 * this class; the server refuses while work in this class awaits its teacher.
 * Tadris+ P11-B — «الاطلاع على المحادثة» on a shared student reads the conversation with THIS class's teacher (a separate one).
 */

type Send = <T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void) => Promise<void>;

export default function OwnerClassRoster({ token, classId, className, ownerAccountId, busy, send, onChanged }: {
  token: string; classId: string; className: string; ownerAccountId: string; busy: boolean; send: Send; onChanged: (text: string) => void;
}) {
  const [roster, setRoster] = useState<OwnerRosterStudent[] | null>(null);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const [moving, setMoving] = useState<OwnerRosterStudent | null>(null);
  const [reading, setReading] = useState<OwnerRosterStudent | null>(null);   // P7-B1 — D14
  const [removing, setRemoving] = useState<OwnerRosterStudent | null>(null);   // P11-A
  const remove = (st: OwnerRosterStudent) => void send(() => ownerStudentsApi.unenroll(token, classId, st.userId),
    () => { setRemoving(null); setNonce(n => n + 1); onChanged("أُزيل الطالب " + st.displayName + " من «" + className + "». حسابه وصفه الأول كما هما."); });

  useEffect(() => {
    let live = true;
    void ownerStudentTransferApi.roster(token, classId).then(r => { if (live) { if (r.ok) setRoster(r.data.students); else setError(r.error); } });
    return () => { live = false; };
  }, [token, classId, nonce]);

  return (
    <div className="eb-owner-class-roster" role="region" aria-label={"طلاب " + className}>
      {error && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</p>}
      {roster === null && !error && <p className="eb-owner-hint" role="status">جارٍ تحميل الطلاب…</p>}
      {roster && roster.length === 0 && <p className="eb-owner-hint">لا يوجد طلاب في هذا الصف.</p>}
      {roster && roster.length > 0 && (
        <ul className="eb-owner-hint" aria-label={"قائمة طلاب " + className}>
          {roster.map(st => (
            <li key={st.userId} aria-label={st.displayName}>
              <bdi>{st.displayName}</bdi> · <span dir="ltr">{st.identityNumber}</span>{st.archived ? " · مؤرشف" : ""}{st.shared ? " · مشترك (حسابه عند معلم آخر)" : ""}{" "}
              {st.shared && removing?.userId !== st.userId && <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => setRemoving(st)}>إزالة من هذا الصف</button>}
              {st.shared && removing?.userId === st.userId && (
                <span className="eb-owner-confirm" role="group" aria-label={"إزالة " + st.displayName}>
                  يخرج <bdi>{st.displayName}</bdi> من هذا الصف فقط. حسابه وصفه الأول ونتائجه المحفوظة تبقى.{" "}
                  <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={() => remove(st)}>تأكيد الإزالة</button>{" "}
                  <button type="button" className="eb-owner-secondary" onClick={() => setRemoving(null)}>إلغاء</button>
                </span>
              )}
              {st.shared || moving?.userId === st.userId ? null : <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => setMoving(st)}>نقل إلى معلم آخر</button>}
              {reading?.userId === st.userId ? null : <>{" "}<button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => setReading(st)}>الاطلاع على المحادثة</button></>}
              {reading?.userId === st.userId && <OwnerConversation token={token} studentId={st.userId} studentName={st.displayName} busy={busy} send={send} onClose={() => setReading(null)} conversation={st.shared ? classId : undefined} />}
              {moving?.userId === st.userId && (
                <StudentTransfer token={token} student={st} fromClassId={classId} ownerAccountId={ownerAccountId} busy={busy} send={send}
                  onCancel={() => setMoving(null)} onDone={text => { setMoving(null); setNonce(n => n + 1); onChanged(text); }} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StudentTransfer({ token, student, fromClassId, ownerAccountId, busy, send, onCancel, onDone }: {
  token: string; student: OwnerRosterStudent; fromClassId: string; ownerAccountId: string; busy: boolean; send: Send; onCancel: () => void; onDone: (text: string) => void;
}) {
  const [teachers, setTeachers] = useState<ManagedTeacher[] | null>(null);
  const [teacherId, setTeacherId] = useState("");
  const [classes, setClasses] = useState<OwnerClass[] | null>(null);
  const [toClassId, setToClassId] = useState("");
  const [preview, setPreview] = useState<StudentTransferPreview | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void ownerTeachersApi.list(token).then(r => { if (live) { if (r.ok) setTeachers(r.data.teachers.filter(t => t.accountId !== ownerAccountId)); else setError(r.error); } });
    return () => { live = false; };
  }, [token, ownerAccountId]);

  async function pickTeacher(id: string) {
    setTeacherId(id); setClasses(null); setToClassId(""); setPreview(null); setError("");
    if (!id) return;
    const r = await ownerClassesApi.list(token, id);
    if (r.ok) setClasses(r.data.classes.filter(c => c.status === "active")); else setError(r.error);
  }
  async function pickClass(id: string) {
    setToClassId(id); setPreview(null); setError("");
    if (!id) return;
    const r = await ownerStudentTransferApi.preview(token, student.userId, id);
    if (r.ok) setPreview(r.data.preview); else setError(r.error);
  }
  const target = (teachers || []).find(t => t.accountId === teacherId);
  const confirm = () => void send(() => ownerStudentTransferApi.transfer(token, student.userId, fromClassId, toClassId, reason.trim()),
    () => onDone("نُقل الطالب " + student.displayName + " إلى " + (target?.displayName || "المعلم الجديد") + "."));

  return (
    <div className="eb-owner-confirm" role="group" aria-label={"نقل " + student.displayName}>
      <label className="auth-field"><span>المعلم الجديد</span>
        <div className="auth-input"><select value={teacherId} onChange={e => void pickTeacher(e.target.value)} disabled={!teachers}>
          <option value="">{teachers ? "اختر معلمًا…" : "جارٍ التحميل…"}</option>
          {(teachers || []).map(t => <option key={t.accountId} value={t.accountId}>{t.displayName + " (" + t.username + ")"}</option>)}
        </select></div>
      </label>
      {classes && (
        <label className="auth-field"><span>صف المعلم الجديد</span>
          <div className="auth-input"><select value={toClassId} onChange={e => void pickClass(e.target.value)}>
            <option value="">{classes.length ? "اختر صفًا…" : "لا توجد صفوف نشطة لهذا المعلم"}</option>
            {classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
          </select></div>
        </label>
      )}
      {error && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</p>}
      {preview && (
        <div role="region" aria-label="ما سيحدث">
          <ul className="eb-owner-hint">
            <li>ينتقل <bdi>{preview.displayName}</bdi> من «{preview.fromClassName}» إلى «{preview.toClassName}».</li>
            <li>يرى المعلم الجديد تقدّمه التعليمي، ولا يرى علامات صفه القديم ولا المحادثات قبل النقل.</li>
            <li>تبقى نتائجه في واجبات الصف القديم عند المعلم السابق، مُعلَّمة «منقول».</li>
          </ul>
          {preview.pendingGrading > 0 && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />لدى الطالب {preview.pendingGrading} عمل بانتظار التصحيح أو محاولة مفتوحة عند المعلم الحالي. لا يمكن نقله قبل إتمامها.</p>}
          <label className="auth-field"><span>سبب النقل (اختياري، يُحفظ في السجل)</span>
            <div className="auth-input"><input type="text" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></div>
          </label>
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy || preview.pendingGrading > 0} onClick={confirm}>تأكيد: نقل الطالب</button>
            <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
          </div>
        </div>
      )}
      {!preview && <div className="eb-owner-actions"><button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button></div>}
    </div>
  );
}
