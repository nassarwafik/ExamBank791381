import { useEffect, useMemo, useState } from "react";
import { STATUS_META, stagesByGroup, trackIcon } from "./helpers";
import ProjectProgressBar, { toneForTrackIndex } from "./ProjectProgressBar";
import StageStatusBadge from "./StageStatusBadge";
import type { ProjectStage, ProjectGroup, StageStatus, StageProgressEntry, StudentCard, TrackMeta } from "./types";

type ProjectData = {
  ok: true;
  enrolled: boolean;
  projectCode?: string;
  title?: string;
  tracks?: TrackMeta[];
  summary?: StudentCard;
  stages?: ProjectStage[];
  groups?: ProjectGroup[];
  progress?: Record<string, StageProgressEntry>;
  nextStages?: Record<string, ProjectStage | null>;
};

// Read-only project view inside the student portal, for WHICHEVER project the student's class is in.
// This is an OPTIONAL secondary panel: on any failure it renders nothing and NEVER logs the student
// out or blocks the portal.
export default function StudentProjectPanel({ token }: { token: string }) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [track, setTrack] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/student-project-tracker", { headers: { "x-student-token": token, Authorization: "Bearer " + token } });
        if (!r.ok) return;
        const j = await r.json();
        if (j && j.ok && !cancelled) {
          setData(j);
          if (j.tracks && j.tracks[0]) setTrack(j.tracks[0].trackId);
        }
      } catch { /* ignore — panel just won't show */ }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const groups = useMemo(() => data?.groups ? data.groups.filter(g => g.track === track).sort((a, b) => a.order - b.order) : [], [data, track]);
  const byGroup = useMemo(() => data?.stages ? stagesByGroup(data.stages.filter(s => s.active !== false), track) : new Map<string, ProjectStage[]>(), [data, track]);

  if (!data || !data.enrolled || !data.summary || !data.tracks) return null;

  const s = data.summary;
  const tracks = data.tracks;
  const next = data.nextStages ? data.nextStages[track] : null;
  const trackMeta = tracks.find(t => t.trackId === track);

  return (
    <section className="student-panel">
      <div className="student-panel-heading"><div><span className="platform-eyebrow">Project {data.projectCode}</span><h3>📡 {data.title || "مشروعي"}</h3></div></div>
      <ProjectProgressBar label="التقدم العام" value={s.overallProgress} tone="overall" />
      <div className="p794-portal-tracks">
        {tracks.map((t, i) => <ProjectProgressBar key={t.trackId} label={(t.icon ? t.icon + " " : "") + t.title} value={s.trackProgress[t.trackId] || 0} tone={toneForTrackIndex(i)} />)}
      </div>
      {next && trackMeta && <p className="p794-portal-next">الخطوة التالية في {trackMeta.title}: <strong>{next.stageId} — {next.title}</strong></p>}

      <nav className="analytics-view-tabs" role="tablist" aria-label="مسارات المشروع">
        {tracks.map(t => (
          <button key={t.trackId} type="button" className={"analytics-view-tab " + (track === t.trackId ? "active" : "")} onClick={() => setTrack(t.trackId)}>{trackIcon(t.icon)} {t.title}</button>
        ))}
      </nav>

      {groups.map(g => (
        <div key={g.groupId} className="p794-group">
          <div className="p794-group-head" style={{ cursor: "default" }}><span>{g.title}</span></div>
          <div className="p794-stage-list">
            {((byGroup.get(g.groupId) || []) as ProjectStage[]).map(stage => {
              const entry = data.progress ? data.progress[stage.stageId] : undefined;
              const status = (entry?.status || "not_started") as StageStatus;
              return (
                <div key={stage.stageId} className={"p794-stage-row " + STATUS_META[status].className}>
                  <div className="p794-stage-row-main" style={{ cursor: "default" }}>
                    <StageStatusBadge status={status} showLabel={false} />
                    <span className="p794-stage-code">{stage.stageId}</span>
                    <span className="p794-stage-title">{stage.title}</span>
                    {entry?.note ? <span className="p794-note-dot" title="ملاحظة من المعلم">📝</span> : null}
                  </div>
                  {entry?.note ? <div className="p794-note-view">📝 {entry.note}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
