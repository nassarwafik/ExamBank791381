import { useEffect, useMemo, useState } from "react";
import { STATUS_META, stagesByGroup, trackIcon } from "./helpers";
import ProjectProgressBar, { toneForTrackIndex } from "./ProjectProgressBar";
import StageStatusBadge from "./StageStatusBadge";
import type { ProjectStage, ProjectGroup, StageStatus, StageProgressEntry, StudentCard, TrackMeta } from "./types";

type StudentProject = {
  projectCode: string;
  title: string;
  tracks: TrackMeta[];
  summary: StudentCard;
  stages: ProjectStage[];
  groups: ProjectGroup[];
  progress: Record<string, StageProgressEntry>;
  nextStages: Record<string, ProjectStage | null>;
};
type ProjectData = { ok: true; enrolled: boolean; className?: string; projects?: StudentProject[] };

// Read-only view of ONE project (track tabs + stage list).
function OneProject({ project }: { project: StudentProject }) {
  const [track, setTrack] = useState<string>(project.tracks[0]?.trackId || "");
  const groups = useMemo(() => project.groups.filter(g => g.track === track).sort((a, b) => a.order - b.order), [project, track]);
  const byGroup = useMemo(() => stagesByGroup(project.stages.filter(s => s.active !== false), track), [project, track]);
  const s = project.summary;
  const next = project.nextStages ? project.nextStages[track] : null;
  const trackMeta = project.tracks.find(t => t.trackId === track);

  return (
    <div className="p794-portal-project">
      <ProjectProgressBar label="التقدم العام" value={s.overallProgress} tone="overall" />
      <div className="p794-portal-tracks">
        {project.tracks.map((t, i) => <ProjectProgressBar key={t.trackId} label={(t.icon ? t.icon + " " : "") + t.title} value={s.trackProgress[t.trackId] || 0} tone={toneForTrackIndex(i)} />)}
      </div>
      {next && trackMeta && <p className="p794-portal-next">الخطوة التالية في {trackMeta.title}: <strong>{next.stageId} — {next.title}</strong></p>}
      <nav className="analytics-view-tabs" role="tablist" aria-label="مسارات المشروع">
        {project.tracks.map(t => (
          <button key={t.trackId} type="button" className={"analytics-view-tab " + (track === t.trackId ? "active" : "")} onClick={() => setTrack(t.trackId)}>{trackIcon(t.icon)} {t.title}</button>
        ))}
      </nav>
      {groups.map(g => (
        <div key={g.groupId} className="p794-group">
          <div className="p794-group-head" style={{ cursor: "default" }}><span>{g.title}</span></div>
          <div className="p794-stage-list">
            {((byGroup.get(g.groupId) || []) as ProjectStage[]).map(stage => {
              const entry = project.progress ? project.progress[stage.stageId] : undefined;
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
    </div>
  );
}

// Read-only view inside the student portal for ALL of the student's class's projects (one tab each).
// OPTIONAL secondary panel: on any failure it renders nothing and NEVER logs the student out.
export default function StudentProjectPanel({ token }: { token: string }) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [activeCode, setActiveCode] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/student-project-tracker", { headers: { "x-student-token": token, Authorization: "Bearer " + token } });
        if (!r.ok) return;
        const j = await r.json();
        if (j && j.ok && !cancelled) {
          setData(j);
          if (j.projects && j.projects[0]) setActiveCode(j.projects[0].projectCode);
        }
      } catch { /* ignore — panel just won't show */ }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (!data || !data.enrolled || !data.projects || !data.projects.length) return null;
  const projects = data.projects;
  const active = projects.find(p => p.projectCode === activeCode) || projects[0];

  return (
    <section className="student-panel">
      <div className="student-panel-heading"><div><span className="platform-eyebrow">Projects</span><h3>📡 مشاريعي</h3></div></div>
      {projects.length > 1 && (
        <nav className="analytics-view-tabs p794-portal-project-tabs" role="tablist" aria-label="مشاريعي">
          {projects.map(p => (
            <button key={p.projectCode} type="button" className={"analytics-view-tab " + (active.projectCode === p.projectCode ? "active" : "")} onClick={() => setActiveCode(p.projectCode)}>📡 {p.title}</button>
          ))}
        </nav>
      )}
      <OneProject key={active.projectCode} project={active} />
    </section>
  );
}
