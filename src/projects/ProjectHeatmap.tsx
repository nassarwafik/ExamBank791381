import { useMemo, useState } from "react";
import { STAGE_STATUS_ORDER, STAGE_STATUS_ABBR, STAGE_STATUS_CLASS, stageStatusLabel, normalizeStageStatus } from "./teacherPresentation";
import EmptyState from "../ui/EmptyState";
import type { ProjectAnalytics, ProjectGroup, TrackMeta } from "./types";

// Students (rows) × stages (columns) status grid. Horizontal scroll stays inside this component. Every cell
// carries a visible abbreviation AND the full "student · stage · status" text, so state is never colour-only.
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

  if (!heatmap.students.length || !heatmap.stages.length) return <EmptyState compact title="لا توجد بيانات كافية للخريطة الحرارية." />;

  return (
    <div className="eb-heatmap-wrap">
      <div className="eb-heatmap-controls">
        <div className="eb-segmented" role="group" aria-label="مسار الخريطة الحرارية">
          {tracks.map(t => <button key={t.trackId} type="button" aria-pressed={track === t.trackId} onClick={() => { setTrack(t.trackId); setGroupId(""); }}>{t.title}</button>)}
        </div>
        <label className="eb-field-inline">المجموعة
          <select value={groupId} onChange={e => setGroupId(e.target.value)}>
            <option value="">كل المجموعات</option>
            {trackGroups.map(g => <option key={g.groupId} value={g.groupId}>{g.title}</option>)}
          </select>
        </label>
        <ul className="eb-heatmap-legend" aria-label="مفتاح الخريطة">
          {STAGE_STATUS_ORDER.map(st => <li key={st}><span className={"eb-heatmap-swatch " + STAGE_STATUS_CLASS[st]} aria-hidden="true">{STAGE_STATUS_ABBR[st]}</span>{stageStatusLabel(st)}</li>)}
        </ul>
      </div>
      <div className="eb-heatmap-scroll">
        <table className="eb-heatmap">
          <caption className="eb-visually-hidden">حالة كل مرحلة لكل طالب في المسار المختار</caption>
          <thead>
            <tr>
              <th scope="col" className="eb-heatmap-corner">الطالب</th>
              {columns.map(c => <th key={c.stageId} scope="col" title={c.title}><span>{c.stageId}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {heatmap.students.map((stu, i) => (
              <tr key={stu.studentId}>
                <th scope="row" className="eb-heatmap-student" title={stu.name}>{stu.name}</th>
                {columns.map(c => {
                  const status = normalizeStageStatus(heatmap.statuses[i]?.[c.stageId]);
                  const text = stu.name + " · " + c.stageId + " " + c.title + " · " + stageStatusLabel(status);
                  return (
                    <td key={c.stageId} className={"eb-heatmap-cell " + STAGE_STATUS_CLASS[status]} title={text}>
                      <span aria-hidden="true">{STAGE_STATUS_ABBR[status]}</span>
                      <span className="eb-visually-hidden">{text}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
