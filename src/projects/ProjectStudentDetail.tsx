import { useEffect, useMemo, useRef, useState } from "react";
import { trackerGet, trackerPost } from "./api";
import { fmtDate, stagesByGroup } from "./helpers";
import { STAGE_STATUS_ORDER, STAGE_STATUS_TONE, STAGE_STATUS_CLASS, stageStatusLabel, normalizeStageStatus, toneForTrack } from "./teacherPresentation";
import ProgressBar from "../ui/ProgressBar";
import StatusBadge from "../ui/StatusBadge";
import ActionMenu from "../ui/ActionMenu";
import IconButton from "../ui/IconButton";
import EmptyState from "../ui/EmptyState";
import { IconChevronBack, IconChevronDown, IconCheck } from "../icons";
import ProjectRankHero from "./ProjectRankHero";
import { fmtContribution, fmtStageScore, normalizeProjectPerformance, stageValueOf } from "./projectPerformance";
import type { StudentDetail, StageStatus, ProjectStage, StudentCard, StageProgressEntry, HistoryEvent, BalanceInsight, TrackMeta, ProjectPerformance } from "./types";

type Props = {
  token: string; projectCode: string; classId: string; studentId: string; tracks: TrackMeta[];
  onBack: () => void;
  /** Called after any successful progress mutation so the (still mounted) student list can refresh on return. */
  onChanged?: () => void;
  /** Called only after a successful STATUS mutation (never note-only, noChange, cancel or failure): a status
   * change can alter the global ready-for-review counts App owns. */
  onReadyChanged?: () => void;
};

type UpdateResponse = {
  ok: true; noChange?: boolean;
  summary: StudentCard;
  performance?: ProjectPerformance;
  stage: StageProgressEntry & { stageId: string };
  nextStages: Record<string, ProjectStage | null>;
  balance: BalanceInsight;
  history: HistoryEvent[];
};

/**
 * Non-modal student profile for one project. Same single `student` read and the same `progress.update`
 * POST (status or note) as before; focus moves to the heading on open and the workspace returns it to the
 * opener on back. Editable classes get ONE primary action per stage (اعتماد المرحلة) with the other
 * statuses in an ActionMenu; archived classes expose no mutation controls at all.
 */
export default function ProjectStudentDetail({ token, projectCode, classId, studentId, tracks, onBack, onChanged, onReadyChanged }: Props) {
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [track, setTrack] = useState<string>(tracks[0]?.trackId || "");
  const [openStageId, setOpenStageId] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [noteDraft, setNoteDraft] = useState("");
  const [scoreDraft, setScoreDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  // Stale-selection guard: only the LATEST requested (project, class, student) may populate the view — a slow
  // response for a previously selected student can never overwrite the current one's grade / rank / stages.
  const requestSeq = useRef(0);

  async function load() {
    const seq = ++requestSeq.current;
    setLoading(true); setError("");
    try {
      const r = await trackerGet<StudentDetail>(token, projectCode, "student", { classId, studentId });
      if (seq !== requestSeq.current) return;
      setDetail(r);
    } catch (e) { if (seq === requestSeq.current) setError(e instanceof Error ? e.message : "تعذر تحميل ملف الطالب."); }
    finally { if (seq === requestSeq.current) setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDetail(null); setOpenStageId(""); void load(); }, [classId, studentId, projectCode]);
  useEffect(() => { headingRef.current?.focus(); }, [studentId]);

  const groups = useMemo(() => detail ? (detail.groups || []).filter(g => g.track === track).sort((a, b) => a.order - b.order) : [], [detail, track]);
  const byGroup = useMemo(() => detail ? stagesByGroup(detail.stages.filter(s => s.active !== false), track) : new Map(), [detail, track]);

  // status (workflow), note and score (quality, 0–100, teacher-only) all go through the SAME progress.update write;
  // the server validates the score and returns the recomputed performance (grade / project Strength / stage values).
  async function updateStage(stage: ProjectStage, patch: { status?: StageStatus; note?: string; score?: number | string | null }) {
    if (!detail || detail.readOnly || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await trackerPost<UpdateResponse>(token, projectCode, { action: "progress.update", classId, studentId, stageId: stage.stageId, ...patch });
      if (!res.noChange) {
        const { stageId: sid, ...entry } = res.stage;
        setDetail(prev => prev ? { ...prev, summary: res.summary, performance: res.performance ?? prev.performance, progress: { ...prev.progress, [sid]: entry }, nextStages: res.nextStages, balance: res.balance, history: res.history } : prev);
        onChanged?.();
        if (patch.status !== undefined) onReadyChanged?.();
      }
      setNotice(patch.score !== undefined ? "تم حفظ العلامة." : patch.note !== undefined ? "تم حفظ الملاحظة." : "تم تحديث حالة المرحلة.");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ التغيير."); }
    finally { setBusy(false); }
  }

  const name = detail?.student.displayName || studentId;
  const backButton = <IconButton label="عودة إلى تقدّم الطلاب" icon={<IconChevronBack size={18} className="eb-flip-rtl" />} onClick={onBack} />;
  // ONE stable head (back + h2) across loading / error / loaded states so the focused heading never remounts.
  const head = (
    <div className="eb-student-profile-head">
      {backButton}
      <div className="eb-student-profile-heading">
        <h2 id="eb-student-profile-title" className="eb-subheading" ref={headingRef} tabIndex={-1}>{detail ? "ملف المشروع: " + name : "ملف المشروع"}</h2>
        {detail && <p className="eb-muted">{detail.student.code ? "الكود " + detail.student.code + " · " : ""}آخر تحديث: {fmtDate(detail.summary.updatedAt)}</p>}
      </div>
      {detail?.readOnly && <StatusBadge tone="warn">مؤرشف — للقراءة فقط</StatusBadge>}
    </div>
  );

  if (!detail) {
    return <section className="eb-student-profile" aria-labelledby="eb-student-profile-title">
      {head}
      {loading && <p className="eb-muted" role="status">جارٍ تحميل ملف الطالب...</p>}
      {!loading && error && <div className="platform-error assignment-inline-message" role="alert">{error} <button type="button" className="eb-button is-small" onClick={() => void load()}>إعادة المحاولة</button></div>}
    </section>;
  }

  const s = detail.summary;
  const perf = normalizeProjectPerformance(detail.performance);
  const timeline = [...detail.history].reverse().slice(0, 20);
  const readOnly = detail.readOnly;

  return (
    <section className="eb-student-profile" aria-labelledby="eb-student-profile-title">
      {head}
      {error && <div className="platform-error assignment-inline-message" role="alert">{error}</div>}
      {notice && <div className="platform-notice assignment-inline-message" role="status" aria-live="polite">{notice}</div>}

      {perf && <ProjectRankHero title={detail.student.displayName || name} performance={perf} compact />}
      <div className="eb-student-profile-summary">
        <ProgressBar label="التقدم العام" value={s.overallProgress} tone="primary" />
        <div className="eb-project-track-bars">
          {tracks.map((t, i) => <ProgressBar key={t.trackId} label={t.title} value={s.trackProgress[t.trackId] || 0} tone={toneForTrack(i)} size="sm" />)}
        </div>
        <p className="eb-student-profile-counts">
          {STAGE_STATUS_ORDER.slice().reverse().map(st => <StatusBadge key={st} tone={STAGE_STATUS_TONE[st]}>{stageStatusLabel(st)} {s.counts[st]}</StatusBadge>)}
        </p>
        {detail.balance && (
          <p className="platform-warning assignment-inline-message" role="status">{detail.balance.leadingTrackTitle} متقدّم على {detail.balance.laggingTrackTitle} بـ {detail.balance.diff}%</p>
        )}
        <p className="eb-student-profile-next">
          <span className="eb-muted">الخطوة التالية:</span>
          {tracks.map(t => {
            const n = detail.nextStages[t.trackId];
            return <StatusBadge key={t.trackId} tone={n ? "info" : "success"}>{t.title}: {n ? n.stageId + " — " + n.title : "مكتمل"}</StatusBadge>;
          })}
        </p>
      </div>

      <div className="eb-segmented eb-student-profile-tracks" role="group" aria-label="مسارات المشروع">
        {tracks.map(t => <button key={t.trackId} type="button" aria-pressed={track === t.trackId} onClick={() => { setTrack(t.trackId); setOpenStageId(""); }}>{t.title}</button>)}
      </div>

      <div className="eb-stage-groups">
        {!groups.length && <EmptyState compact title="لا توجد مراحل في هذا المسار." />}
        {groups.map(g => {
          const stages = (byGroup.get(g.groupId) || []) as ProjectStage[];
          const groupOpen = openGroups[g.groupId] !== false;
          const panelId = "eb-group-" + g.groupId;
          const approvedInGroup = stages.filter(st => normalizeStageStatus(detail.progress[st.stageId]?.status) === "approved").length;
          return (
            <div key={g.groupId} className="eb-stage-group">
              <button type="button" className="eb-stage-group-head" aria-expanded={groupOpen} aria-controls={panelId} onClick={() => setOpenGroups(prev => ({ ...prev, [g.groupId]: !groupOpen }))}>
                <IconChevronDown size={16} className={"eb-disclosure-chevron" + (groupOpen ? " is-open" : "")} aria-hidden="true" />
                <span className="eb-stage-group-title">{g.title}</span>
                <small className="eb-muted">{approvedInGroup}/{stages.length} معتمدة</small>
              </button>
              {groupOpen && (
                <ul id={panelId} className="eb-stage-list">
                  {stages.map(stage => {
                    const entry = detail.progress[stage.stageId];
                    const status = normalizeStageStatus(entry?.status);
                    const isOpen = openStageId === stage.stageId;
                    const stagePanelId = "eb-stage-" + stage.stageId;
                    return (
                      <li key={stage.stageId} className={"eb-stage-row " + STAGE_STATUS_CLASS[status]}>
                        <button type="button" className="eb-stage-row-main" aria-expanded={isOpen} aria-controls={stagePanelId} onClick={() => { setOpenStageId(isOpen ? "" : stage.stageId); setNoteDraft(entry?.note || ""); setScoreDraft(typeof entry?.score === "number" ? String(entry.score) : ""); }}>
                          <IconChevronDown size={16} className={"eb-disclosure-chevron" + (isOpen ? " is-open" : "")} aria-hidden="true" />
                          <span className="eb-stage-code">{stage.stageId}</span>
                          <span className="eb-stage-title">{stage.title}{stage.required === false ? <em className="eb-stage-optional"> (اختياري)</em> : null}</span>
                          <StatusBadge tone={STAGE_STATUS_TONE[status]}>{stageStatusLabel(status)}</StatusBadge>
                          {typeof entry?.score === "number" ? <small className="eb-muted eb-stage-row-score" dir="ltr">{fmtContribution(entry.score)} / 100</small> : null}
                          {entry?.note ? <small className="eb-muted">ملاحظة</small> : null}
                          <small className="eb-muted eb-stage-date">{fmtDate(entry?.updatedAt || "")}</small>
                        </button>
                        {isOpen && (
                          <div id={stagePanelId} className="eb-stage-detail">
                            {stage.description ? <p className="eb-muted">{stage.description}</p> : null}
                            {perf && (() => {
                              const value = stageValueOf(perf, stage.stageId);
                              return (
                                <p className="eb-stage-score">
                                  <span>العلامة: <strong dir="ltr">{fmtStageScore(entry)}</strong></span>
                                  {value && <span>القيمة في المشروع: <strong dir="ltr">{fmtContribution(value.contribution)} / {fmtContribution(value.maxContribution)}</strong></span>}
                                  {value && !value.counted && typeof entry?.score === "number" && <small className="eb-muted">تُحتسب عند اعتماد المرحلة</small>}
                                </p>
                              );
                            })()}
                            {readOnly ? (
                              entry?.note ? <p className="eb-stage-note-view">ملاحظة المعلم: {entry.note}</p> : <small className="eb-muted">لا توجد ملاحظة.</small>
                            ) : (
                              <>
                                <div className="eb-stage-actions">
                                  <button type="button" className="eb-button is-primary" disabled={busy || status === "approved"} onClick={() => void updateStage(stage, { status: "approved" })}><IconCheck size={16} />اعتماد المرحلة</button>
                                  <ActionMenu label={"تغيير حالة المرحلة " + stage.stageId} text="تغيير الحالة" disabled={busy}>
                                    {STAGE_STATUS_ORDER.filter(st => st !== "approved").map(st => (
                                      <button key={st} type="button" className="eb-menu-item" disabled={busy || status === st} onClick={() => void updateStage(stage, { status: st })}>{stageStatusLabel(st)}</button>
                                    ))}
                                  </ActionMenu>
                                </div>
                                <div className="eb-stage-score-edit">
                                  <label>العلامة
                                    <input type="number" inputMode="decimal" min={0} max={100} step={0.5} dir="ltr" value={scoreDraft} onChange={e => setScoreDraft(e.target.value)} aria-label={"علامة المرحلة " + stage.stageId + " من 100"} placeholder="0–100" disabled={busy} />
                                    <span aria-hidden="true">/ 100</span>
                                  </label>
                                  <button type="button" className="eb-button is-small" disabled={busy || scoreDraft.trim() === "" || Number(scoreDraft) === entry?.score} onClick={() => void updateStage(stage, { score: scoreDraft.trim() })}>حفظ العلامة</button>
                                  {typeof entry?.score === "number" && <button type="button" className="eb-button is-quiet is-small" disabled={busy} onClick={() => { setScoreDraft(""); void updateStage(stage, { score: null }); }}>مسح العلامة</button>}
                                </div>
                                <label className="eb-field eb-stage-note-edit">ملاحظة المعلم
                                  <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="اكتب ملاحظة للطالب..." rows={3} />
                                </label>
                                <div className="eb-stage-note-actions">
                                  <button type="button" className="eb-button is-small" disabled={busy || noteDraft === (entry?.note || "")} onClick={() => void updateStage(stage, { note: noteDraft })}>حفظ الملاحظة</button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <section className="eb-stage-timeline" aria-labelledby="eb-stage-timeline-title">
        <h3 id="eb-stage-timeline-title" className="eb-subheading">أحدث الأحداث</h3>
        {timeline.length ? (
          <ol className="eb-timeline">
            {timeline.map(ev => (
              <li key={ev.eventId}>
                <span className="eb-timeline-date">{fmtDate(ev.createdAt)}</span>
                <span className="eb-timeline-text">{ev.type === "status" && ev.toStatus ? stageStatusLabel(ev.toStatus) + " — " + ev.stageId : ev.type === "score" ? (typeof ev.toScore === "number" ? "علامة " + fmtContribution(ev.toScore) + " / 100 — " + ev.stageId : "مسح العلامة — " + ev.stageId) : "ملاحظة — " + ev.stageId}</span>
              </li>
            ))}
          </ol>
        ) : <EmptyState compact title="لا توجد أحداث بعد." />}
      </section>
    </section>
  );
}
