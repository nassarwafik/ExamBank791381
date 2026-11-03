import { useEffect, useState } from "react";
import { IconWarning } from "../icons";
import { ownerAccessApi, type ApiResult, type CatalogCourse } from "./ownerApi";
import StepUpPrompt from "./StepUpPrompt";
import { formatDate } from "./teacherShared";

/**
 * Tadris+ P5-A2 — «المقررات» in the Owner Console (#/owner/courses; owner decision D12, /api/owner-access/catalog + course-status).
 *   - every course of the platform with its status: «منشور» (teachers and students may use it, within each teacher's entitlement)
 *     or «مؤرشف» (closed to EVERY teacher and student at once — nothing is deleted: progress, notes, results and what each class
 *     released stay, and come back when the course is published again);
 *   - archiving asks for an inline confirmation; publishing again does not;
 *   - every change needs a recent second-factor check (asked inline, then retried). The server decides; a 401 signs out.
 * The course TEXTS stay in the repository (D12); which courses each teacher gets is chosen on the teacher's page.
 */
export default function OwnerCourses({ token, onSignedOut }: { token: string; onSignedOut: () => void }) {
  const [courses, setCourses] = useState<CatalogCourse[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<CatalogCourse | null>(null);
  const [stepUp, setStepUp] = useState<{ retry: () => Promise<void> } | null>(null);

  useEffect(() => {
    let live = true;
    void ownerAccessApi.catalog(token).then(r => {
      if (!live) return;
      if (r.ok) setCourses(r.data.courses);
      else if (r.status === 401) onSignedOut();
      else setError(r.error);
    });
    return () => { live = false; };
  }, [token, nonce, onSignedOut]);

  async function send<T>(call: () => Promise<ApiResult<T>>, onOk: (data: T) => void): Promise<void> {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await call();
    setBusy(false);
    if (r.ok) { setStepUp(null); onOk(r.data); return; }
    if (r.status === 401) { onSignedOut(); return; }
    if (r.code === "STEP_UP_REQUIRED") { setStepUp({ retry: () => send(call, onOk) }); return; }
    setStepUp(null);
    setError(r.error);
  }
  const setStatus = (c: CatalogCourse, status: "published" | "archived") => send(() => ownerAccessApi.courseStatus(token, c.courseId, status), () => {
    setConfirming(null);
    setNotice(status === "archived" ? "أُرشف «" + c.title + "»." : "نُشر «" + c.title + "».");
    setNonce(n => n + 1);
  });

  return (
    <section className="eb-owner-panel eb-owner-courses" aria-labelledby="eb-owner-courses-title">
      <h2 id="eb-owner-courses-title" className="eb-owner-h2">المقررات</h2>
      <p className="eb-owner-hint">المقرر المنشور يستطيع المعلمون استخدامه، كلٌّ ضمن المقررات المخوَّلة له (تُحدَّد من صفحة المعلم). المقرر المؤرشف يُغلق أمام كل المعلمين والطلاب فورًا، ولا يُحذف منه شيء.</p>

      {stepUp && <StepUpPrompt token={token} onSignedOut={onSignedOut} onCancel={() => setStepUp(null)} onConfirmed={() => stepUp.retry()} />}
      {error && <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>}
      {notice && <p className="eb-owner-hint eb-owner-done" role="status">{notice}</p>}

      {courses === null && !error && <p className="eb-owner-hint" role="status">جارٍ تحميل المقررات…</p>}
      {courses && (
        <ul className="eb-owner-teacher-list" aria-label="المقررات">
          {courses.map(c => (
            <li key={c.courseId} className="eb-owner-teacher" aria-label={c.title}>
              <div className="eb-owner-teacher-main">
                <strong><bdi>{c.title}</bdi></strong>
                <span className="eb-owner-teacher-user" dir="ltr">{c.courseId}</span>
                <span className={"eb-owner-status eb-owner-status--" + (c.status === "published" ? "active" : "suspended")}>{c.status === "published" ? "منشور" : "مؤرشف"}</span>
              </div>
              <p className="eb-owner-hint">{c.subject ? <><bdi>{c.subject}</bdi> · </> : null}{c.modules} وحدة{c.updatedAt ? <> · آخر تغيير <bdi>{formatDate(c.updatedAt)}</bdi></> : null}</p>
              {confirming && confirming.courseId === c.courseId ? (
                <div className="eb-owner-confirm" role="group" aria-label={"تأكيد أرشفة " + c.title}>
                  <p>سيُغلق «{c.title}» أمام كل المعلمين والطلاب فورًا. لا يُحذف شيء: يبقى تقدم الطلاب وملاحظاتهم ونتائجهم، ويعود كل شيء عند النشر من جديد.</p>
                  <div className="eb-owner-actions">
                    <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={() => void setStatus(c, "archived")}>تأكيد: أرشفة المقرر</button>
                    <button type="button" className="eb-owner-secondary" onClick={() => setConfirming(null)}>إلغاء</button>
                  </div>
                </div>
              ) : (
                <div className="eb-owner-actions">
                  {c.status === "published"
                    ? <button type="button" className="eb-owner-secondary eb-owner-danger" disabled={busy} onClick={() => setConfirming(c)}>أرشفة المقرر</button>
                    : <button type="button" className="eb-owner-secondary" disabled={busy} onClick={() => void setStatus(c, "published")}>نشر المقرر</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
