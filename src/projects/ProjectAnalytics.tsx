import { useEffect, useRef, useState } from "react";
import { trackerGet } from "./api";
import ProjectAnalyticsCharts from "./ProjectAnalyticsCharts";
import type { ProjectAnalytics as AnalyticsData, ProjectGroup, TrackMeta } from "./types";

type Props = { token: string; projectCode: string; classId: string; tracks: TrackMeta[] };

// Projects-workspace analytics view: ONE `resource=analytics` read per class/project, then the shared
// presentational charts (ProjectAnalyticsCharts). Same datasets and formulas as before.
export default function ProjectAnalytics({ token, projectCode, classId, tracks }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stageTrack, setStageTrack] = useState<string>(tracks[0]?.trackId || "");

  // Phase P-1 — only the LATEST read may populate the charts: a slower response for a previously selected class is dropped.
  const seq = useRef(0);

  async function load() {
    const mine = ++seq.current;
    setLoading(true); setError("");
    try {
      const r = await trackerGet<{ analytics: AnalyticsData; groups: ProjectGroup[] }>(token, projectCode, "analytics", { classId });
      if (mine !== seq.current) return;
      setData(r.analytics); setGroups(r.groups || []);
    } catch (e) { if (mine === seq.current) setError(e instanceof Error ? e.message : "تعذر تحميل الإحصائيات."); }
    finally { if (mine === seq.current) setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setData(null); void load(); }, [classId, projectCode]);

  if (loading && !data) return <p className="eb-muted" role="status">جارٍ تحميل الإحصائيات...</p>;
  if (error) return <div className="platform-error assignment-inline-message" role="alert">{error} <button type="button" className="eb-button is-small" onClick={() => void load()}>إعادة المحاولة</button></div>;
  if (!data) return null;

  return (
    <section className="eb-project-analytics" aria-labelledby="eb-project-analytics-title">
      <h2 id="eb-project-analytics-title" className="eb-subheading">الإحصائيات</h2>
      <ProjectAnalyticsCharts analytics={data} tracks={tracks} groups={groups} stageTrack={stageTrack} onStageTrack={setStageTrack} />
    </section>
  );
}
