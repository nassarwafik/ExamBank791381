import { useEffect, useMemo, useState } from "react";
import { stagesByGroup, statusLabel } from "./helpers";
import { STAGE_STATUS_CLASS, STAGE_STATUS_TONE, normalizeStageStatus, toneForTrack } from "./teacherPresentation";
import ProgressBar from "../ui/ProgressBar";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import type { ProjectStage, ProjectGroup, StageProgressEntry, StudentCard, TrackMeta } from "./types";

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

// Read-only view of ONE project (UX-7a presentation on the shared primitives: overall + per-track ProgressBars,
// next stage, aria-pressed track switch, stage rows with tonal StatusBadges). The values are the server's
// summary/progress exactly as delivered — nothing is recomputed and nothing is written from here.
function OneProject({ project }: { project: StudentProject }) {
  const [track, setTrack] = useState<string>(project.tracks[0]?.trackId || "");
  const groups = useMemo(() => project.groups.filter(g => g.track === track).sort((a, b) => a.order - b.order), [project, track]);
  const byGroup = useMemo(() => stagesByGroup(project.stages.filter(s => s.active !== false), track), [project, track]);
  const s = project.summary;
  const next = project.nextStages ? project.nextStages[track] : null;
  const trackMeta = project.tracks.find(t => t.trackId === track);

  return (
    <div className="eb-sp-project">
      <ProgressBar label="التقدم العام" value={s.overallProgress} />
      <ul className="eb-sp-project-tracks" aria-label="تقدم المسارات">
        {project.tracks.map((t, i) => <li key={t.trackId}><ProgressBar size="sm" label={t.title} value={s.trackProgress[t.trackId] || 0} tone={toneForTrack(i)} /></li>)}
      </ul>
      {next && trackMeta && <p className="eb-sp-project-next">الخطوة التالية في {trackMeta.title}: <strong>{next.stageId} — {next.title}</strong></p>}
      {project.tracks.length > 1 && (
        <div className="eb-sp-filters" role="group" aria-label="مسارات المشروع">
          {project.tracks.map(t => <button key={t.trackId} type="button" className="eb-chip-button" aria-pressed={track === t.trackId} onClick={() => setTrack(t.trackId)}>{t.title}</button>)}
        </div>
      )}
      {groups.map(g => {
        const gid = "eb-sp-group-" + project.projectCode + "-" + g.groupId;
        return (
          <section key={g.groupId} className="eb-sp-project-group" aria-labelledby={gid}>
            <h3 id={gid} className="eb-subheading">{g.title}</h3>
            <ul className="eb-sp-stage-list">
              {((byGroup.get(g.groupId) || []) as ProjectStage[]).map(stage => {
                const entry = project.progress ? project.progress[stage.stageId] : undefined;
                const status = normalizeStageStatus(entry?.status);
                return (
                  <li key={stage.stageId} className={"eb-sp-stage " + STAGE_STATUS_CLASS[status]}>
                    <div className="eb-sp-stage-main">
                      <StatusBadge tone={STAGE_STATUS_TONE[status]}>{statusLabel(status)}</StatusBadge>
                      <span className="eb-sp-stage-code">{stage.stageId}</span>
                      <span className="eb-sp-stage-title">{stage.title}</span>
                    </div>
                    {entry?.note ? <p className="eb-sp-stage-note">ملاحظة من المعلم: {entry.note}</p> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// Read-only view inside the student portal for ALL of the student's class's projects (one switch each).
// OPTIONAL secondary panel: ONE read; on any failure (or when the class runs no project) it renders nothing
// and NEVER logs the student out. Data semantics unchanged since the legacy panel.
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
    <section className="eb-sp-panel eb-sp-projects" aria-labelledby="eb-sp-projects-title">
      <SectionHeader level={2} id="eb-sp-projects-title" title="مشاريعي" count={projects.length > 1 ? projects.length : undefined} description="تقدّمك في مشاريع صفك، كما سجّله المعلم." />
      {projects.length > 1 && (
        <div className="eb-sp-filters" role="group" aria-label="المشاريع">
          {projects.map(p => <button key={p.projectCode} type="button" className="eb-chip-button" aria-pressed={active.projectCode === p.projectCode} onClick={() => setActiveCode(p.projectCode)}>{p.title}</button>)}
        </div>
      )}
      <OneProject key={active.projectCode} project={active} />
    </section>
  );
}
