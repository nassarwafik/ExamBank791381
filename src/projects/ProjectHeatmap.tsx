import { useMemo, useState } from "react";
import { STATUS_META, trackIcon } from "./helpers";
import type { ProjectAnalytics, ProjectGroup, StageStatus, TrackMeta } from "./types";

// Students (rows) x stages (columns) status grid. Horizontal scroll is contained inside this
// component only (never the page). Track + group selectors keep 100+ stages usable. Group titles come
// from the snapshot groups (never the stage title).
type Props = { heatmap: ProjectAnalytics["heatmap"]; tracks: TrackMeta[]; groups: ProjectGroup[] };

export default function ProjectHeatmap({ heatmap, tracks, groups }: Props) {
  const [track, setTrack] = useState<string>(tracks[0]?.trackId || "");
  const [groupId, setGroupId] = useState("");

  const groupTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.groupId, g.title);
    return m;
  }, [groups]);

  const trackGroups = useMemo(() => {
    const seen: { groupId: string; title: string }[] = [];
    const ids = new Set<string>();
    for (const s of heatmap.stages) {
      if (s.track === track && !ids.has(s.groupId)) { ids.add(s.groupId); seen.push({ groupId: s.groupId, title: groupTitle.get(s.groupId) || s.groupId }); }
    }
    return seen;
  }, [heatmap, track, groupTitle]);

  const columns = useMemo(
    () => heatmap.stages.filter(s => s.track === track && (!groupId || s.groupId === groupId)),
    [heatmap, track, groupId]
  );

  if (!heatmap.students.length || !heatmap.stages.length) return <div className="platform-empty">لا توجد بيانات كافية للخريطة الحرارية.</div>;

  return (
    <div className="p794-heatmap-wrap">
      <div className="p794-heatmap-controls">
        <div className="analytics-view-tabs" role="tablist">
          {tracks.map(t => (
            <button key={t.trackId} type="button" className={"analytics-view-tab " + (track === t.trackId ? "active" : "")} onClick={() => { setTrack(t.trackId); setGroupId(""); }}>{trackIcon(t.icon)} {t.title}</button>
          ))}
        </div>
        <select value={groupId} onChange={e => setGroupId(e.target.value)}>
          <option value="">كل المجموعات</option>
          {trackGroups.map(g => <option key={g.groupId} value={g.groupId}>{g.title}</option>)}
        </select>
        <div className="p794-heatmap-legend">
          {(Object.keys(STATUS_META) as StageStatus[]).map(k => <span key={k}>{STATUS_META[k].icon} {STATUS_META[k].label}</span>)}
        </div>
      </div>
      <div className="p794-heatmap-scroll">
        <table className="p794-heatmap">
          <thead>
            <tr>
              <th className="p794-heatmap-corner">الطالب</th>
              {columns.map(c => <th key={c.stageId} title={c.title}>{c.stageId}</th>)}
            </tr>
          </thead>
          <tbody>
            {heatmap.students.map((stu, i) => (
              <tr key={stu.studentId}>
                <th className="p794-heatmap-student" title={stu.name}>{stu.name}</th>
                {columns.map(c => {
                  const status = (heatmap.statuses[i]?.[c.stageId] || "not_started") as StageStatus;
                  return <td key={c.stageId} className={"p794-heatmap-cell " + STATUS_META[status].className}
                    title={stu.name + " · " + c.title + " · " + STATUS_META[status].label} />;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
