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
import { IconCheck, IconChevronBack, IconChevronDown } from "../icons";
import { useConfirm } from "../ui/useConfirm";
import type { ProjectStage, ProjectGroup, ProjectPerformance, ProjectEvaluation, StageProgressEntry, StudentCard, TrackMeta } from "./types";
import type { ProjectStrength } from "../student/types";
import { visualImgProps } from "../studentVisualSizes";
import type { StudentProjectDrill, StudentProjectDrillOutcome } from "./studentProjectDrill";
import { postSelfReport } from "./studentSelfReport";

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
      {rank && <img className="eb-sp-project-card-art" {...visualImgProps(rank.images, 48)} alt="" aria-hidden="true" width={48} height={48} loading="lazy" decoding="async" />}
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

// Detail of ONE project (UX-7a presentation on the shared primitives + the Project Performance hero): the values are the
// server's summary / performance / progress exactly as delivered — nothing is recomputed. Stage scores are the teacher's
// marks, read-only for the student. Phase P2 — the ONE write: the student marks the stages they completed (they count
// immediately and show «بانتظار تأكيد المعلم» until the teacher confirms) and may undo their own unconfirmed marks.
// Phase P3 — marking is ONE tap: every stage not yet approved carries «أنجزتها» (and the next step too), every own
// unconfirmed mark carries «تراجع», so a mistaken tap is undone in one more tap. A whole group can be marked after a
// confirmation. The list opens on «المتبقية» (what is left to do), groups fold with their done / total count, and a group
// already fully done when the project opens starts folded in «الكل» while its track still has work left. Each write is the same P2 request (only the project,
// the stage ids and mark); a group is far below the server's 60-stage limit, so one tap is one request.
type StageFilter = "remaining" | "pending" | "approved" | "all";
function stageKind(entry: StageProgressEntry | undefined): "remaining" | "pending" | "approved" {
  const status = normalizeStageStatus(entry?.status);
  if (status !== "approved") return "remaining";
  return entry?.selfReportedAt ? "pending" : "approved";
}
const countWord = (n: number) => (n === 1 ? "مرحلة واحدة" : n === 2 ? "مرحلتين" : n + " مراحل");
// The view a track opens on: what is left to do, or everything once nothing is left. Chosen when the track is shown and
// never switched by the student's own taps (marking the last stage shows «أحسنت» rather than jumping to another view).
function openingFilter(project: StudentProject, trackId: string): StageFilter {
  return project.stages.some(st => st.active !== false && st.track === trackId && stageKind(project.progress ? project.progress[st.stageId] : undefined) === "remaining") ? "remaining" : "all";
}

function OneProject({ project, contribution, onBack, token, onChanged }: { project: StudentProject; contribution: ProjectStrength | null; onBack: (() => void) | null; token: string; onChanged: () => void }) {
  const [track, setTrack] = useState<string>(project.tracks[0]?.trackId || "");
  const groups = useMemo(() => project.groups.filter(g => g.track === track).sort((a, b) => a.order - b.order), [project, track]);
  const byGroup = useMemo(() => stagesByGroup(project.stages.filter(s => s.active !== false), track), [project, track]);
  const perf = normalizeProjectPerformance(project.performance);
  const evaluation = normalizeProjectEvaluation(project.evaluation);
  const s = project.summary;
  const next = project.nextStages ? project.nextStages[track] : null;
  const trackMeta = project.tracks.find(t => t.trackId === track);
  const [pending, setPending] = useState<Set<string>>(() => new Set());           // stage ids in flight: their buttons are disabled
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [filter, setFilter] = useState<StageFilter>(() => openingFilter(project, project.tracks[0]?.trackId || ""));
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  // Groups that were already fully done when the project opened start folded while their track still has work left (the
  // student's attention goes to what is left; a finished track opens every group, scores and notes in view). A group the
  // student completes now stays open: it never collapses under the student's finger.
  const [doneAtOpen] = useState<Set<string>>(() => new Set(project.groups.filter(g => {
    const st = project.stages.filter(x => x.active !== false && x.groupId === g.groupId);
    return st.length > 0 && st.every(x => stageKind(project.progress ? project.progress[x.stageId] : undefined) !== "remaining") && openingFilter(project, g.track) === "remaining";
  }).map(g => g.groupId)));
  const { confirm, confirmDialog } = useConfirm();

  const trackStages = useMemo(() => groups.flatMap(g => (byGroup.get(g.groupId) || []) as ProjectStage[]), [groups, byGroup]);
  const kindOf = (stageId: string) => stageKind(project.progress ? project.progress[stageId] : undefined);
  const counts = useMemo(() => {
    const c = { remaining: 0, pending: 0, approved: 0, all: trackStages.length };
    for (const st of trackStages) c[stageKind(project.progress ? project.progress[st.stageId] : undefined)]++;
    return c;
  }, [trackStages, project]);
  const shown = (st: ProjectStage) => filter === "all" || kindOf(st.stageId) === filter;

  async function send(stageIds: string[], mark: boolean, what: string) {
    const ids = stageIds.filter(id => !pending.has(id));
    if (!ids.length) return;
    setPending(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; });
    setMessage(null);
    let changed = 0, refused = 0;
    try {
      const r = await postSelfReport(token, project.projectCode, ids, mark);
      changed = r.changed;
      refused = r.results.filter(x => !x.ok).length;
      setMessage({ tone: refused ? "error" : "ok", text: mark
        ? (changed ? "تم تحديد " + what + " كمنفّذة. تظهر الآن لمعلمك." : "لم يتغير شيء.") + (refused ? " تعذر تحديد " + countWord(refused) + "." : "")
        : changed ? "تم التراجع عن تحديد " + what + "." : refused ? "اعتمد المعلم هذه المرحلة، لا يمكن التراجع عنها." : "لم يتغير شيء." });
      if (changed) onChanged();
    } catch (e) { setMessage({ tone: "error", text: e instanceof Error ? e.message : "تعذر حفظ التغيير." }); }
    finally { setPending(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; }); }
  }
  async function markGroup(title: string, stages: ProjectStage[]) {
    const ids = stages.filter(st => kindOf(st.stageId) === "remaining").map(st => st.stageId);
    if (!ids.length) return;
    const ok = await confirm({ title: "تحديد المجموعة كمنفّذة", message: "سيُحدَّد " + countWord(ids.length) + " من «" + title + "» كمنفّذة، وتُحتسب الآن وتظهر لمعلمك. يمكنك التراجع عن أي مرحلة قبل أن يؤكدها المعلم.", confirmLabel: "تحديد " + countWord(ids.length) });
    if (ok) await send(ids, true, countWord(ids.length) + " من «" + title + "»");
  }
  const doneButton = (stage: ProjectStage, extraClass = "") => (
    <button type="button" className={"eb-button is-small eb-sp-done-btn" + extraClass} disabled={pending.has(stage.stageId)} onClick={() => void send([stage.stageId], true, stage.stageId)} aria-label={"أنجزت " + stage.stageId + " — " + stage.title}>
      <IconCheck size={16} aria-hidden="true" />{pending.has(stage.stageId) ? "جارٍ الحفظ…" : "أنجزتها"}
    </button>
  );

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
      {project.tracks.length > 1 && (
        <div className="eb-sp-filters" role="group" aria-label="مسارات المشروع">
          {project.tracks.map(t => <button key={t.trackId} type="button" className="eb-chip-button" aria-pressed={track === t.trackId} onClick={() => { setTrack(t.trackId); setFilter(openingFilter(project, t.trackId)); }}>{t.title}</button>)}
        </div>
      )}
      {next && trackMeta && (
        <div className="eb-sp-project-next eb-sp-next-card">
          <p>الخطوة التالية في {trackMeta.title}: <strong>{next.stageId} — {next.title}</strong></p>
          {kindOf(next.stageId) === "remaining" && doneButton(next, " is-primary")}
        </div>
      )}
      <div className="eb-sp-filters eb-sp-stage-filters" role="group" aria-label="عرض المراحل">
        {([["remaining", "المتبقية"], ["pending", "بانتظار تأكيد المعلم"], ["approved", "المعتمدة"], ["all", "الكل"]] as [StageFilter, string][]).map(([key, text]) => (
          <button key={key} type="button" className="eb-chip-button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{text} ({counts[key]})</button>
        ))}
      </div>
      {message && <p className={message.tone === "ok" ? "platform-notice assignment-inline-message" : "platform-error assignment-inline-message"} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</p>}
      {!trackStages.some(shown) && (
        <p className="eb-muted eb-sp-stage-empty">{filter === "remaining" ? "أحسنت! لا توجد مراحل متبقية في هذا المسار." : filter === "pending" ? "لا توجد مراحل بانتظار تأكيد المعلم." : "لا توجد مراحل في هذا العرض."}</p>
      )}
      {groups.map(g => {
        const all = (byGroup.get(g.groupId) || []) as ProjectStage[];
        const visible = all.filter(shown);
        if (!visible.length) return null;
        const gid = "eb-sp-group-" + project.projectCode + "-" + g.groupId;
        const panelId = gid + "-stages";
        const done = all.filter(st => kindOf(st.stageId) !== "remaining").length;
        const remaining = all.length - done;
        const open = folded[g.groupId] === undefined ? !doneAtOpen.has(g.groupId) || filter !== "all" : !folded[g.groupId];
        return (
          <section key={g.groupId} className="eb-sp-project-group" aria-labelledby={gid}>
            <div className="eb-sp-group-head">
              <button type="button" className="eb-sp-group-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setFolded(prev => ({ ...prev, [g.groupId]: open }))}>
                <IconChevronDown size={16} className={"eb-disclosure-chevron" + (open ? " is-open" : "")} aria-hidden="true" />
                <h3 id={gid} className="eb-subheading">{g.title}</h3>
                <span className={"eb-sp-group-count" + (remaining ? "" : " is-done")}>{done} / {all.length} منجزة</span>
              </button>
              {remaining > 1 && open && (
                <button type="button" className="eb-button is-quiet is-small eb-sp-group-mark" disabled={all.some(st => pending.has(st.stageId))} onClick={() => void markGroup(g.title, all)}>أنجزت المجموعة كلها ({remaining})</button>
              )}
            </div>
            {open && (
              <ul id={panelId} className="eb-sp-stage-list">
                {visible.map(stage => {
                  const entry = project.progress ? project.progress[stage.stageId] : undefined;
                  const status = normalizeStageStatus(entry?.status);
                  const kind = stageKind(entry);
                  const value = stageValueOf(perf, stage.stageId);
                  const label = stage.stageId + " — " + stage.title;
                  return (
                    <li key={stage.stageId} className={"eb-sp-stage " + STAGE_STATUS_CLASS[status] + (kind === "pending" ? " is-self-reported" : "")}>
                      <div className="eb-sp-stage-main">
                        {kind === "pending"
                          ? <StatusBadge tone="warn">منفّذة — بانتظار تأكيد المعلم</StatusBadge>
                          : <StatusBadge tone={STAGE_STATUS_TONE[status]}>{statusLabel(status)}</StatusBadge>}
                        <span className="eb-sp-stage-code">{stage.stageId}</span>
                        <span className="eb-sp-stage-title">{stage.title}</span>
                        <span className="eb-sp-stage-action">
                          {kind === "remaining" && doneButton(stage)}
                          {kind === "pending" && <button type="button" className="eb-button is-quiet is-small eb-sp-undo-btn" disabled={pending.has(stage.stageId)} onClick={() => void send([stage.stageId], false, stage.stageId)} aria-label={"تراجع عن تحديد " + label}>تراجع</button>}
                        </span>
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
            )}
          </section>
        );
      })}
      {confirmDialog}
    </div>
  );
}

// Read-only view inside the student portal for ALL of the student's class's projects: cards (progress / grade /
// project rank) → one project's detail (hero + circle + stages) → back. OPTIONAL secondary panel: ONE read; on
// any failure (or when the class runs no project) it renders nothing and NEVER logs the student out. Every
// project's metrics come from the same single response, so switching never shows a previous project's values.
// Phase 12D — an optional one-shot `drill` («تابع المشروع» from the Today Hub) opens that EXACT project, but only
// against THIS panel's own response for the CURRENT token (never Today's data, never a second read): applied once per
// `seq`, reported through `onDrillConsumed`, and from then on the cards / back button belong to the student again.
type LoadResult = { token: string; status: "ready" | "failed"; data: ProjectData | null };
export default function StudentProjectPanel({ token, contributions = [], onEvaluationChange, drill = null, onDrillConsumed }: { token: string; contributions?: ProjectStrength[]; onEvaluationChange?: (briefs: ProjectEvaluationBrief[]) => void; drill?: StudentProjectDrill | null; onDrillConsumed?: (seq: number, outcome: StudentProjectDrillOutcome) => void }) {
  const [load, setLoad] = useState<LoadResult | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);                            // P2: re-read after the student's own write
  const [openCode, setOpenCode] = useState<string>("");
  const [consumed, setConsumed] = useState<{ seq: number; outcome: StudentProjectDrillOutcome } | null>(null);
  // A drill that resolved as NOT available must not fall back to the legacy single-project auto-open (that would show
  // ANOTHER project's detail): the list is shown instead until the student opens a project or a valid drill arrives.
  // Scoped to the session it was set in (the token), so it can never leak into a new session.
  const [listOnlyFor, setListOnlyFor] = useState<string | null>(null);
  const listOnly = listOnlyFor === token;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/student-project-tracker", { headers: { "x-student-token": token, Authorization: "Bearer " + token } });
        if (!r.ok) { if (!cancelled) setLoad({ token, status: "failed", data: null }); return; }
        const j = await r.json();
        if (cancelled) return;
        if (j && j.ok) { setLoad({ token, status: "ready", data: j }); onEvaluationChange?.(evaluationBriefs((j as ProjectData).projects)); }
        else setLoad({ token, status: "failed", data: null });
      } catch { if (!cancelled) setLoad({ token, status: "failed", data: null }); /* panel just won't show */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reloadNonce]);

  // Only a result read for the CURRENT token is authoritative (a previous session's list never answers a drill).
  const current = load && load.token === token ? load : null;
  const data = current && current.status === "ready" ? current.data : null;

  // Apply the newest drill ONCE, and only when this panel's own result is in: resolved while rendering, so the very
  // first render with the list already shows the exact project (no flash of the cards or of another project).
  if (drill && current && drill.seq > (consumed ? consumed.seq : 0)) {
    const list = data && data.enrolled && data.projects ? data.projects : [];
    const hit = list.some(p => p.projectCode === drill.projectCode);
    setOpenCode(hit ? drill.projectCode : "");                                    // a missing code opens nothing else
    setListOnlyFor(hit ? null : token);                                            // …not even the only remaining project
    setConsumed({ seq: drill.seq, outcome: hit ? "opened" : current.status === "failed" ? "failed" : "unavailable" });
  }
  // Report after commit (the opened detail is in the DOM when the portal scrolls to it).
  useEffect(() => { if (consumed) onDrillConsumed?.(consumed.seq, consumed.outcome); }, [consumed]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !data.enrolled || !data.projects || !data.projects.length) return null;
  const projects = data.projects;
  // One project → its detail directly; several → cards first, then the chosen project's detail (never a stale one:
  // every project's metrics come from the same single response and are looked up by code at render time).
  const open = projects.length === 1 && !listOnly ? projects[0] : openCode ? projects.find(p => p.projectCode === openCode) ?? null : null;
  const contributionOf = (code: string) => contributions.find(c => c.projectCode === code) ?? null;

  return (
    <section className="eb-sp-panel eb-sp-projects" aria-labelledby="eb-sp-projects-title">
      <SectionHeader level={2} id="eb-sp-projects-title" title="مشاريعي" count={projects.length > 1 ? projects.length : undefined} description="تقدّمك وعلاماتك في مشاريع صفك. اضغط «أنجزتها» على كل مرحلة تنهيها لتظهر لمعلمك." />
      {open ? (
        <OneProject key={open.projectCode} project={open} contribution={contributionOf(open.projectCode)} onBack={projects.length > 1 ? () => setOpenCode("") : null} token={token} onChanged={() => setReloadNonce(n => n + 1)} />
      ) : (
        <ul className="eb-sp-project-cards" aria-label="المشاريع">
          {projects.map(p => <li key={p.projectCode}><ProjectCard project={p} contribution={contributionOf(p.projectCode)} onOpen={() => { setListOnlyFor(null); setOpenCode(p.projectCode); }} /></li>)}
        </ul>
      )}
    </section>
  );
}
