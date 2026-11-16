import { useEffect, useRef, useState } from "react";
import { IconBook, IconProjects, IconWarning } from "../icons";
import { ownerDashboardApi, type DashboardProgress } from "./ownerApi";

/**
 * Owner teacher dashboard, phase 4 — «التقدّم في المواد والمشاريع»: per class, how far the students have read each learning book
 * (share of the published pages read, how many started / finished) and how far they got in each project (average progress, how many
 * finished, how many wait for the teacher's review). The figures come from the teacher's own reading and project summaries
 * (GET /api/owner-teacher-dashboard?view=progress). Plain tables with a drawn bar beside each number: the number is the text, the bar
 * only decoration. Its own load and error, so the rest of the page never waits for it.
 */
export default function OwnerDashboardProgress({ token, accountId, classId, onSignedOut }: { token: string; accountId: string; classId: string; onSignedOut: () => void }) {
  const [data, setData] = useState<DashboardProgress | null>(null);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const signedOut = useRef(onSignedOut);
  useEffect(() => { signedOut.current = onSignedOut; }, [onSignedOut]);
  useEffect(() => {
    let live = true;
    void ownerDashboardApi.progress(token, accountId, classId).then(r => {
      if (!live) return;
      if (r.ok) { setData(r.data); setError(""); }
      else if (r.status === 401) signedOut.current();
      else { setData(null); setError(r.error || "تعذر تحميل التقدّم في المواد والمشاريع."); }
    });
    return () => { live = false; };
  }, [token, accountId, classId, nonce]);

  return (
    <section className="eb-owner-dash-card eb-owner-dash-progress" aria-labelledby="dash-progress">
      <h2 id="dash-progress">التقدّم في المواد والمشاريع</h2>
      {error && (
        <div className="eb-owner-dash-error">
          <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>
          <button type="button" className="eb-owner-secondary" onClick={() => { setError(""); setNonce(n => n + 1); }}>إعادة المحاولة</button>
        </div>
      )}
      {!data && !error && <p className="eb-owner-hint" role="status">جارٍ تحميل التقدّم…</p>}
      {data && (
        <div className="eb-owner-dash-progress-grid">
          <div>
            <h3><IconBook size={18} aria-hidden="true" /> المواد التعليمية</h3>
            {data.learning.length === 0 ? <p className="eb-owner-hint">لا مواد تعليمية مفعّلة في صفوف هذا المعلم.</p> : (
              <div className="eb-owner-dash-scroll"><table className="eb-owner-dash-table">
                <caption className="eb-visually-hidden">قراءة المواد التعليمية لكل صف</caption>
                <thead><tr><th scope="col">الصف والمادة</th><th scope="col">نسبة القراءة</th><th scope="col">بدأوا</th><th scope="col">أنهوا</th></tr></thead>
                <tbody>
                  {data.learning.map(l => (
                    <tr key={l.classId + ":" + l.courseId}>
                      <th scope="row"><bdi>{l.className}</bdi><small className="eb-owner-muted"> · <bdi>{l.courseTitle}</bdi></small></th>
                      <td><ProgressMeter value={l.averageRead} /></td>
                      <td className="is-nowrap">{l.startedStudents} من {l.students}</td>
                      <td>{l.completedStudents}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
          <div>
            <h3><IconProjects size={18} aria-hidden="true" /> المشاريع</h3>
            {data.projects.length === 0 ? <p className="eb-owner-hint">لا مشاريع مفعّلة في صفوف هذا المعلم.</p> : (
              <div className="eb-owner-dash-scroll"><table className="eb-owner-dash-table">
                <caption className="eb-visually-hidden">التقدّم في المشاريع لكل صف</caption>
                <thead><tr><th scope="col">الصف والمشروع</th><th scope="col">متوسط التقدّم</th><th scope="col">أنهوا</th><th scope="col">بانتظار الفحص</th></tr></thead>
                <tbody>
                  {data.projects.map(p => (
                    <tr key={p.classId + ":" + p.projectCode}>
                      <th scope="row"><bdi>{p.className}</bdi><small className="eb-owner-muted"> · <bdi>{p.title}</bdi></small></th>
                      <td><ProgressMeter value={p.avgOverall} /></td>
                      <td className="is-nowrap">{p.completedCount} من {p.studentCount}</td>
                      <td>{p.studentsReadyForReview}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** A percentage with a drawn bar (decoration; the number is the text). */
function ProgressMeter({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const level = v < 40 ? "is-low" : v < 75 ? "is-mid" : "is-high";
  return (
    <span className="eb-owner-dash-bar-cell">
      <span className="eb-owner-dash-meter" aria-hidden="true"><span className={level} style={{ inlineSize: v + "%" }} /></span>
      <bdi dir="ltr">{v}%</bdi>
    </span>
  );
}
