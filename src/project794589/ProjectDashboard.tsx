import { useEffect, useState } from "react";
import { projectApi } from "./api";
import ProjectProgressBar from "./ProjectProgressBar";
import type { ClassSummary } from "./types";

type Props = { token: string; classId: string };

export default function ProjectDashboard({ token, classId }: Props) {
  const [summary, setSummary] = useState<ClassSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await projectApi<{ summary: ClassSummary }>(token, "/api/project-794589?resource=summary&classId=" + encodeURIComponent(classId));
      setSummary(r.summary);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل لوحة المشروع."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [classId]);

  if (loading && !summary) return <div className="platform-loading">⏳ جارٍ التحميل...</div>;
  if (error) return <div className="platform-error">{error} <button onClick={() => void load()}>إعادة المحاولة</button></div>;
  if (!summary) return null;
  if (!summary.studentCount) return <div className="platform-empty">لا يوجد طلاب في هذا الصف بعد.</div>;

  return (
    <div className="p794-dashboard">
      <div className="p794-kpi-grid">
        <article className="p794-kpi p794-kpi-primary">
          <span className="p794-kpi-label">التقدم العام للصف</span>
          <ProjectProgressBar value={summary.avgOverall} tone="overall" />
        </article>
        <article className="p794-kpi"><span className="p794-kpi-label">📘 متوسط الكتاب</span><ProjectProgressBar value={summary.avgBook} tone="book" /></article>
        <article className="p794-kpi"><span className="p794-kpi-label">🖧 متوسط Packet Tracer</span><ProjectProgressBar value={summary.avgPacketTracer} tone="pt" /></article>
      </div>
      <div className="p794-kpi-grid">
        <article className="p794-kpi p794-kpi-stat"><strong>{summary.studentCount}</strong><span>عدد الطلاب</span></article>
        <article className="p794-kpi p794-kpi-stat"><strong>{summary.completedCount}</strong><span>✅ مكتملون</span></article>
        <article className="p794-kpi p794-kpi-stat"><strong>{summary.studentsReadyForReview}</strong><span>🔵 ينتظرون الفحص</span></article>
        <article className="p794-kpi p794-kpi-stat"><strong>{summary.totalReadyStages}</strong><span>مراحل جاهزة للفحص</span></article>
        <article className="p794-kpi p794-kpi-stat"><strong>{summary.staleCount}</strong><span>⚠ بلا تحديث {summary.staleDays}+ أيام</span></article>
      </div>
    </div>
  );
}
