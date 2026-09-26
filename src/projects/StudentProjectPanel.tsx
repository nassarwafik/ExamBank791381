import { useEffect, useMemo, useState } from "react";
import { stagesByGroup, statusLabel } from "./helpers";
import { STAGE_STATUS_CLASS, STAGE_STATUS_TONE, normalizeStageStatus, toneForTrack } from "./teacherPresentation";
import { fmtContribution, fmtGrade, fmtStageScore, normalizeProjectPerformance, projectRankVisual, stageValueOf } from "./projectPerformance";
import ProjectRankHero from "./ProjectRankHero";
import ProjectEvaluationCard from "./ProjectEvaluationCard";
import { evaluationBriefs, fmtProjectScore, normalizeProjectEvaluation, type ProjectEvaluationBrief } from "./projectEvaluation";
import ProgressBar from "../ui/ProgressBar";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import { IconChevronBack } from "../icons";
import type { ProjectStage, ProjectGroup, ProjectPerformance, ProjectEvaluation, StageProgressEntry, StudentCard, TrackMeta } from "./types";
import type { ProjectStrength } from "../student/types";

type StudentProject = {
  projectCode: string;
  title: string;
  tracks: TrackMeta[];
  summary: StudentCard;
  /** Additive server field (absent on older payloads) — the project grade / project Strength authority. */
  performance?: ProjectPerformance | null;
  /** Phase 9B — additive server field (absent on older payloads): the student's own evaluation summary. */
  evaluation?: ProjectEvaluation | null;
  stages: ProjectStage[];
  groups: ProjectGroup[];
  progress: Record<string, StageProgressEntry>;
  nextStages: Record<string, ProjectStage | null>;
};
type ProjectData = { ok: true; enrolled: boolean; className?: string; projects?: StudentProject[] };

/** The per-project ceiling of the GLOBAL Strength contribution (display only; the policy lives on the server). */
const PROJECT_MAX_STRENGTH_POINTS = 400;

/** One project card: progress, grade, project rank (the SAME six artworks) and the open action. */
function ProjectCard({ project, contribution, onOpen }: { project: StudentProject; contribution: ProjectStrength | null; onOpen: () => void }) {
  const perf = normalizeProjectPerformance(project.performance);
  const evaluation = normalizeProjectEvaluation(project.evaluation);
  const rank = perf ? projectRankVisual(perf.tier) : null;
  const headingId = "eb-sp-project-card-" + project.projectCode;
  return (
    <article className="eb-sp-project-card" aria-labelledby={headingId}>
      {rank && <img className="eb-sp-project-card-art" src={rank.image} alt="" aria-hidden="true" width={48} height={48} loading="lazy" decoding="async" />}
      <div className="eb-sp-project-card-body">
        <h3 id={headingId} className="eb-sp-project-card-title">{project.title}</h3>
        <dl className="eb-sp-project-card-facts">
          <div><dt>التقدم</dt><dd dir="ltr">{project.summary.overallProgress}%</dd></div>
          {perf && <div><dt>العلامة</dt><dd dir="ltr">{fmtGrade(perf.grade)}</dd></div>}
          {evaluation && <div><dt>التقييم</dt><dd dir={evaluation.projectScore === null ? undefined : "ltr"}>{fmtProjectScore(evaluation.projectScore)} · {evaluation.gradedStages}/{evaluation.totalStages}</dd></div>}
          {rank && <div><dt>القوة</dt><dd>{rank.title}</dd></div>}
        </dl>
        {contribution && <p className="eb-sp-project-strength">مساهمته في قوتك العامة: <strong dir="ltr">{contribution.strengthPoints} / {PROJECT_MAX_STRENGTH_POINTS}</strong></p>}
        <button type="button" className="eb-button is-primary is-small" onClick={onOpen}>فتح المشروع</button>
      </div>
    </article>
  );
}

// Read-only detail of ONE project (UX-7a presentation on the shared primitives + the Project Performance hero):
// the values are the server's summary / performance / progress exactly as delivered — nothing is recomputed and
// nothing is written from here. Stage scores are the teacher's marks, read-only for the student.
function OneProject({ project, contribution, onBack }: { project: StudentProject; contribution: ProjectStrength | null; onBack: (() => void) | null }) {
  const [track, setTrack] = useState<string>(project.tracks[0]?.trackId || "");
  const groups = useMemo(() => project.groups.filter(g => g.track === track).sort((a, b) => a.order - b.order), [project, track]);
  const byGroup = useMemo(() => stagesByGroup(project.stages.filter(s => s.active !== false), track), [project, track]);
  const perf = normalizeProjectPerformance(project.performance);
  const evaluation = normalizeProjectEvaluation(project.evaluation);
  const s = project.summary;
  const next = project.nextStages ? project.nextStages[track] : null;
  const trackMeta = project.tracks.find(t => t.trackId === track);

  return (
    <div className="eb-sp-project" data-project-code={project.projectCode}>
      {onBack && <button type="button" className="eb-button is-quiet is-small eb-sp-project-back" onClick={onBack}><IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />العودة إلى المشاريع</button>}
      {perf ? <ProjectRankHero title={project.title} performance={perf} /> : <ProgressBar label="التقدم العام" value={s.overallProgress} />}
      {/* This project's share of the GLOBAL Strength as the SERVER derived it (round(overallProgress × 4), ≤ 400) —
          distinct from the project-specific Strength (/600) in the hero. Rendered, never computed here. */}
      {contribution && (
        <p className="eb-sp-project-strength">تقدم المشروع: <strong>{contribution.overallProgress}%</strong> · نقاط القوة من المشروع: <strong>{contribution.strengthPoints} / {PROJECT_MAX_STRENGTH_POINTS}</strong></p>
      )}
      {/* Phase 9B — the EVALUATION axis (graded / ungraded stages, average of graded scores), read-only, server-derived. */}
      {evaluation && <ProjectEvaluationCard id={"eb-sp-eval-" + project.projectCode} variant="student" evaluation={evaluation} />}
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
                const value = stageValueOf(perf, stage.stageId);
                return (
                  <li key={stage.stageId} className={"eb-sp-stage " + STAGE_STATUS_CLASS[status]}>
                    <div className="eb-sp-stage-main">
                      <StatusBadge tone={STAGE_STATUS_TONE[status]}>{statusLabel(status)}</StatusBadge>
                      <span className="eb-sp-stage-code">{stage.stageId}</span>
                      <span className="eb-sp-stage-title">{stage.title}</span>
                    </div>
                    {perf && (
                      <p className="eb-sp-stage-score">
                        <span>العلامة: <strong dir="ltr">{fmtStageScore(entry)}</strong></span>
                        {value && <span>القيمة في المشروع: <strong dir="ltr">{fmtContribution(value.contribution)} / {fmtContribution(value.maxContribution)}</strong></span>}
                      </p>
                    )}
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

// Read-only view inside the student portal for ALL of the student's class's projects: cards (progress / grade /
// project rank) → one project's detail (hero + circle + stages) → back. OPTIONAL secondary panel: ONE read; on
// any failure (or when the class runs no project) it renders nothing and NEVER logs the student out. Every
// project's metrics come from the same single response, so switching never shows a previous project's values.
export default function StudentProjectPanel({ token, contributions = [], onEvaluationChange }: { token: string; contributions?: ProjectStrength[]; onEvaluationChange?: (briefs: ProjectEvaluationBrief[]) => void }) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [openCode, setOpenCode] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/student-project-tracker", { headers: { "x-student-token": token, Authorization: "Bearer " + token } });
        if (!r.ok) return;
        const j = await r.json();
        if (j && j.ok && !cancelled) { setData(j); onEvaluationChange?.(evaluationBriefs((j as ProjectData).projects)); }
      } catch { /* ignore — panel just won't show */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!data || !data.enrolled || !data.projects || !data.projects.length) return null;
  const projects = data.projects;
  // One project → its detail directly; several → cards first, then the chosen project's detail (never a stale one:
  // every project's metrics come from the same single response and are looked up by code at render time).
  const open = projects.length === 1 ? projects[0] : openCode ? projects.find(p => p.projectCode === openCode) ?? null : null;
  const contributionOf = (code: string) => contributions.find(c => c.projectCode === code) ?? null;

  return (
    <section className="eb-sp-panel eb-sp-projects" aria-labelledby="eb-sp-projects-title">
      <SectionHeader level={2} id="eb-sp-projects-title" title="مشاريعي" count={projects.length > 1 ? projects.length : undefined} description="تقدّمك وعلاماتك في مشاريع صفك، كما سجّلها المعلم." />
      {open ? (
        <OneProject key={open.projectCode} project={open} contribution={contributionOf(open.projectCode)} onBack={projects.length > 1 ? () => setOpenCode("") : null} />
      ) : (
        <ul className="eb-sp-project-cards" aria-label="المشاريع">
          {projects.map(p => <li key={p.projectCode}><ProjectCard project={p} contribution={contributionOf(p.projectCode)} onOpen={() => setOpenCode(p.projectCode)} /></li>)}
        </ul>
      )}
    </section>
  );
}
