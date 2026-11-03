import { useEffect, useState } from "react";
import { IconWarning } from "../icons";
import { ownerTeachersApi, ownerTransferApi, type ApiResult, type ClassTransferPreview, type ManagedTeacher, type OwnerClass } from "./ownerApi";

/**
 * Tadris+ P5-B3a — «نقل إلى معلم آخر» on a class of the teacher's page (owner decision §19.21: «كل تاريخ الصف»): choose the new
 * teacher, see what moves (students — archived ones too —, assignments, pending grading the new teacher will inherit), give an
 * optional reason, confirm. The class leaves this teacher with its whole history. A transfer that did not complete (a storage failure
 * half-way) is completed by the same request («إكمال النقل»). The confirmation goes through the page's `send` (second-factor check
 * asked inline, then the same request is retried). The server decides everything.
 */

type Send = <T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void) => Promise<void>;
const STATUS_AR: Record<string, string> = { published: "منشور", draft: "مسودة", archived: "مؤرشف", closed: "مغلق" };

export default function OwnerClassTransfer({ token, c, fromAccountId, busy, send, onDone, onCancel }: {
  token: string; c: OwnerClass; fromAccountId: string; busy: boolean; send: Send; onDone: (text: string) => void; onCancel: () => void;
}) {
  const [teachers, setTeachers] = useState<ManagedTeacher[] | null>(null);
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<ClassTransferPreview | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [incomplete, setIncomplete] = useState(0);

  useEffect(() => {
    let live = true;
    void ownerTeachersApi.list(token).then(r => { if (live) { if (r.ok) setTeachers(r.data.teachers.filter(t => t.accountId !== fromAccountId)); else setError(r.error); } });
    return () => { live = false; };
  }, [token, fromAccountId]);

  async function loadPreview(accountId: string) {
    setTo(accountId); setPreview(null); setError("");
    if (!accountId) return;
    const r = await ownerTransferApi.preview(token, c.classId, accountId);
    if (r.ok) setPreview(r.data.preview); else setError(r.error);
  }
  const target = (teachers || []).find(t => t.accountId === to);
  const confirm = () => void send(() => ownerTransferApi.transfer(token, c.classId, to, fromAccountId, reason.trim()), d => {
    if (d.ledger.complete) onDone("نُقل الصف «" + c.name + "» إلى " + (target?.displayName || "المعلم الجديد") + " مع " + d.ledger.students.moved + " طالبًا وكل تاريخه.");
    else setIncomplete(d.ledger.students.failed);
  });

  return (
    <div className="eb-owner-confirm" role="group" aria-label={"نقل " + c.name}>
      <label className="auth-field"><span>المعلم الجديد</span>
        <div className="auth-input"><select value={to} onChange={e => void loadPreview(e.target.value)} disabled={!teachers}>
          <option value="">{teachers ? "اختر معلمًا…" : "جارٍ التحميل…"}</option>
          {(teachers || []).map(t => <option key={t.accountId} value={t.accountId}>{t.displayName + " (" + t.username + ")"}</option>)}
        </select></div>
      </label>
      {error && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</p>}
      {preview && (
        <div role="region" aria-label="ما سينتقل">
          <p>سينتقل الصف إلى <bdi>{target?.displayName}</bdi> مع كل تاريخه، ولن يراه المعلم الحالي بعد ذلك:</p>
          <ul className="eb-owner-hint">
            <li>{preview.students.total - preview.students.foreign} طالبًا{preview.students.archived ? " (منهم " + preview.students.archived + " مؤرشف)" : ""}</li>
            <li>{preview.assignments.total} واجبًا{Object.keys(preview.assignments.byStatus).length ? ": " + Object.entries(preview.assignments.byStatus).map(([s, n]) => n + " " + (STATUS_AR[s] || s)).join("، ") : ""}، بعلاماتها</li>
            {preview.pendingGrading > 0 && <li>{preview.pendingGrading} عملًا ينتظر التصحيح: يصححه المعلم الجديد</li>}
            {preview.students.foreign > 0 && <li>{preview.students.foreign} طالبًا يتبعون معلمًا ثالثًا: لن يُنقلوا</li>}
          </ul>
          <label className="auth-field"><span>سبب النقل (اختياري، يُحفظ في السجل)</span>
            <div className="auth-input"><input type="text" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></div>
          </label>
          {incomplete > 0 && <p className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />لم يكتمل نقل {incomplete} طالبًا. اضغط «إكمال النقل» لإتمامه.</p>}
          <div className="eb-owner-actions">
            <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={confirm}>{incomplete ? "إكمال النقل" : "تأكيد: نقل الصف"}</button>
            <button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button>
          </div>
        </div>
      )}
      {!preview && <div className="eb-owner-actions"><button type="button" className="eb-owner-secondary" onClick={onCancel}>إلغاء</button></div>}
    </div>
  );
}
