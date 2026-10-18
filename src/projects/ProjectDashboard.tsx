import { useEffect, useRef, useState } from "react";
import { trackerGet } from "./api";
import ProgressBar from "../ui/ProgressBar";
import { toneForTrack } from "./teacherPresentation";
import StatCard from "../ui/StatCard";
import EmptyState from "../ui/EmptyState";
import type { ClassSummary, TrackMeta } from "./types";

type Props = { token: string; projectCode: string; classId: string; tracks: TrackMeta[] };

// Overview of one class in one project: exactly the existing `summary` payload, presented as the shared
// StatCards (four primary operational counts + stale hint) and semantic progress bars. Nothing is recomputed.
export default function ProjectDashboard({ token, projectCode, classId, tracks }: Props) {
  const [summary, setSummary] = useState<ClassSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Phase P-1 — only the LATEST read may populate the view: a slower response for a previously selected class is dropped.
  const seq = useRef(0);

  async function load() {
    const mine = ++seq.current;
    setLoading(true); setError("");
    try {
      const r = await trackerGet<{ summary: ClassSummary }>(token, projectCode, "summary", { classId });
      if (mine === seq.current) setSummary(r.summary);
    } catch (e) { if (mine === seq.current) setError(e instanceof Error ? e.message : "تعذر تحميل لوحة المشروع."); }
    finally { if (mine === seq.current) setLoading(false); }
  }
  // A new class / project never shows the previous one's numbers while it loads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSummary(null); void load(); }, [classId, projectCode]);

  if (loading && !summary) return <p className="eb-muted" role="status">جارٍ تحميل لوحة المشروع...</p>;
  if (error) return <div className="platform-error assignment-inline-message" role="alert">{error} <button type="button" className="eb-button is-small" onClick={() => void load()}>إعادة المحاولة</button></div>;
  if (!summary) return null;
  if (!summary.studentCount) return <EmptyState title="لا يوجد طلاب في هذا الصف بعد." description="أضف طلابًا إلى الصف من صفحة «الصفوف والطلاب» ليظهر تقدّمهم هنا." />;

  return (
    <section className="eb-project-overview" aria-labelledby="eb-project-overview-title">
      <h2 id="eb-project-overview-title" className="eb-subheading">لوحة المشروع</h2>
      <div className="eb-stat-grid is-primary eb-project-stats">
        <StatCard primary label="الطلاب" value={summary.studentCount} />
        <StatCard primary label="مكتملون" value={summary.completedCount} tone="success" />
        <StatCard primary label="ينتظرون الفحص" value={summary.studentsReadyForReview} tone={summary.studentsReadyForReview > 0 ? "attention" : "neutral"} />
        <StatCard primary label="مراحل جاهزة للفحص" value={summary.totalReadyStages} tone="info" hint={"بلا تحديث " + summary.staleDays + "+ أيام: " + summary.staleCount} />
      </div>
      <div className="eb-project-progress-card">
        <ProgressBar label="التقدم العام للصف" value={summary.avgOverall} tone="primary" />
        <div className="eb-project-track-bars">
          {tracks.map((t, i) => <ProgressBar key={t.trackId} label={"متوسط " + t.title} value={summary.trackAverages[t.trackId] || 0} tone={toneForTrack(i)} size="sm" />)}
        </div>
      </div>
    </section>
  );
}
