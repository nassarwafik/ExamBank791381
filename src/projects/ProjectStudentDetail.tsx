import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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

type Patch = { status?: StageStatus; note?: string; score?: number | string | null };
type MutationKind = "score" | "status" | "note";
const kindOf = (patch: Patch): MutationKind => (patch.status !== undefined ? "status" : patch.note !== undefined ? "note" : "score");
const canonicalScore = (entry: StageProgressEntry | undefined) => (typeof entry?.score === "number" ? String(entry.score) : "");

/**
 * Non-modal student profile for one project. Same single `student` read and the same `progress.update`
 * POST (status, note or score) as before; focus moves to the heading on open and the workspace returns it to the
 * opener on back. Archived classes expose no mutation controls at all.
 *
 * Phase 8C — inline grading. Every stage row IS the grading workspace: score input (0–100) + save, the primary
 * «اعتماد المرحلة» and the other statuses in an ActionMenu are on the row itself, with the stage value from the
 * server's performance model. Only the description, the score details / clear action and the teacher note live
 * under an optional per-row «تفاصيل» disclosure — grading never depends on it.
 *   • Drafts are PER STAGE (scoreDrafts[stageId] / noteDrafts[stageId], holding only what the teacher typed): the
 *     input shows the draft if any, else the canonical saved score; a successful save drops that stage's draft so
 *     the canonical server value shows; a failed save keeps it for a retry. Drafts are keyed by stageId, so a track
 *     or group switch can never apply one stage's draft to another, and they are cleared whenever the project,
 *     class or student changes.
 *   • Writes stay the canonical `progress.update` and are SERIALIZED through one queue (a later write starts only
 *     after the earlier one settled), so responses apply in order and an older response can never overwrite a
 *     newer canonical state. The same operation on the same stage cannot be queued twice (double-submit guard).
 *     Each job carries its (project, class, student) context; a job or response for a previous selection is dropped.
 *   • Saving a score never changes the status and approving never sends a score: they remain separate decisions.
 */
export default function ProjectStudentDetail({ token, projectCode, classId, studentId, tracks, onBack, onChanged, onReadyChanged }: Props) {
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [track, setTrack] = useState<string>(tracks[0]?.trackId || "");
  const [openStageId, setOpenStageId] = useState("");                           // the optional details / note disclosure
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, true>>({});           // "stageId:kind" queued or in flight
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // The selection every queued write belongs to; a write or response for another selection is dropped.
  const contextKey = projectCode + "|" + classId + "|" + studentId;
  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef<Set<string>>(new Set());
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
  // A new (project, class, student) starts clean: no detail, no disclosure, no drafts, no row errors, no queued busy state.
  function resetSelection() {
    setDetail(null); setOpenStageId(""); setScoreDrafts({}); setNoteDrafts({}); setRowErrors({}); setPending({}); setNotice(""); setError("");
    pendingRef.current = new Set();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { resetSelection(); void load(); }, [classId, studentId, projectCode]);
  useEffect(() => { headingRef.current?.focus(); }, [studentId]);

  const groups = useMemo(() => detail ? (detail.groups || []).filter(g => g.track === track).sort((a, b) => a.order - b.order) : [], [detail, track]);
  const byGroup = useMemo(() => detail ? stagesByGroup(detail.stages.filter(s => s.active !== false), track) : new Map(), [detail, track]);

  // status (workflow), note and score (quality, 0–100, teacher-only) all go through the SAME progress.update write;
  // the server validates the score and returns the recomputed performance (grade / project Strength / stage values).
  function updateStage(stage: ProjectStage, patch: Patch, opts: { advanceFrom?: HTMLInputElement; refocus?: { trigger: HTMLElement; input: HTMLInputElement | null } } = {}) {
    if (!detail || detail.readOnly) return;
    const key = stage.stageId + ":" + kindOf(patch);
    if (pendingRef.current.has(key)) return;                                   // double-submit guard (same operation)
    const context = contextRef.current;
    pendingRef.current.add(key);
    setPending(prev => ({ ...prev, [key]: true }));
    setRowErrors(prev => { const next = { ...prev }; delete next[stage.stageId]; return next; });
    const run = async () => {
      if (context !== contextRef.current) return;                              // selection changed while queued
      setNotice("");
      try {
        const res = await trackerPost<UpdateResponse>(token, projectCode, { action: "progress.update", classId, studentId, stageId: stage.stageId, ...patch });
        if (context !== contextRef.current) return;                            // stale response for another student
        if (!res.noChange) {
          const { stageId: sid, ...entry } = res.stage;
          setDetail(prev => prev ? { ...prev, summary: res.summary, performance: res.performance ?? prev.performance, progress: { ...prev.progress, [sid]: entry }, nextStages: res.nextStages, balance: res.balance, history: res.history } : prev);
          onChanged?.();
          if (patch.status !== undefined) onReadyChanged?.();
        }
        if (patch.score !== undefined) setScoreDrafts(prev => { const next = { ...prev }; delete next[stage.stageId]; return next; });
        if (patch.note !== undefined) setNoteDrafts(prev => { const next = { ...prev }; delete next[stage.stageId]; return next; });
        setNotice(patch.score !== undefined ? "تم حفظ العلامة." : patch.note !== undefined ? "تم حفظ الملاحظة." : "تم تحديث حالة المرحلة.");
        // Keyboard flow: Enter-save moves on to the next stage's score field — only if focus did not move meanwhile.
        const from = opts.advanceFrom;
        if (from && document.activeElement === from) {
          const inputs = Array.from(listRef.current?.querySelectorAll<HTMLInputElement>("input[data-stage-score]") || []);
          const next = inputs[inputs.indexOf(from) + 1];
          next?.focus();
        }
        // Button-save: the save button becomes disabled once the draft equals the saved score — keep focus on this
        // stage's score field instead of losing it (only if the teacher did not move focus elsewhere meanwhile).
        const back = opts.refocus;
        if (back && (document.activeElement === back.trigger || document.activeElement === document.body)) back.input?.focus();
      } catch (e) {
        if (context !== contextRef.current) return;
        // The typed draft is kept (never erased on failure) and the error stays attached to this stage's row.
        setRowErrors(prev => ({ ...prev, [stage.stageId]: e instanceof Error ? e.message : "تعذر حفظ التغيير." }));
      } finally {
        if (context === contextRef.current) {
          pendingRef.current.delete(key);
          setPending(prev => { const next = { ...prev }; delete next[key]; return next; });
        }
      }
    };
    // Serialized: each write starts after the previous one settled (responses therefore apply in order).
    queue.current = queue.current.then(run, run);
  }

  function saveScore(stage: ProjectStage, draft: string, opts: { advanceFrom?: HTMLInputElement; refocus?: { trigger: HTMLElement; input: HTMLInputElement | null } } = {}) {
    if (draft.trim() === "") return;
    updateStage(stage, { score: draft.trim() }, opts);
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

      {!readOnly && <p className="eb-muted eb-stage-grade-hint">أدخل العلامة واضغط Enter أو «حفظ»، ثم «اعتماد» لاعتماد المرحلة. تُحفظ التغييرات بالتتابع.</p>}
      <div className="eb-stage-groups" ref={listRef}>
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
                    const saved = canonicalScore(entry);
                    const draft = scoreDrafts[stage.stageId] ?? saved;
                    const noteDraft = noteDrafts[stage.stageId] ?? (entry?.note || "");
                    const scoreBusy = !!pending[stage.stageId + ":score"];
                    const statusBusy = !!pending[stage.stageId + ":status"];
                    const noteBusy = !!pending[stage.stageId + ":note"];
                    const rowBusy = scoreBusy || statusBusy || noteBusy;
                    const scoreChanged = draft.trim() !== "" && (saved === "" || Number(draft) !== entry?.score);
                    const value = perf ? stageValueOf(perf, stage.stageId) : null;
                    const label = stage.stageId + " — " + stage.title;
                    const rowError = rowErrors[stage.stageId];
                    const onScoreKey = (e: KeyboardEvent<HTMLInputElement>) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (scoreChanged && !scoreBusy) saveScore(stage, draft, { advanceFrom: e.currentTarget });
                    };
                    return (
                      <li key={stage.stageId} className={"eb-stage-row eb-stage-grade-row " + STAGE_STATUS_CLASS[status] + (rowBusy ? " is-busy" : "")} data-stage-id={stage.stageId} aria-busy={rowBusy || undefined}>
                        <div className="eb-stage-grade-grid">
                          <div className="eb-stage-cell-stage">
                            <span className="eb-stage-code">{stage.stageId}</span>
                            <span className="eb-stage-title">{stage.title}{stage.required === false ? <em className="eb-stage-optional"> (اختياري)</em> : null}</span>
                            {entry?.note ? <small className="eb-stage-note-flag">ملاحظة</small> : null}
                            <small className="eb-muted eb-stage-date">{fmtDate(entry?.updatedAt || "")}</small>
                          </div>
                          <div className="eb-stage-cell-status"><StatusBadge tone={STAGE_STATUS_TONE[status]}>{stageStatusLabel(status)}</StatusBadge></div>
                          <div className="eb-stage-cell-score">
                            {readOnly ? (
                              <span className="eb-stage-score-text" dir="ltr">{saved === "" ? "—" : fmtContribution(entry!.score as number)} / 100</span>
                            ) : (
                              <>
                                <input type="number" inputMode="decimal" min={0} max={100} step={0.5} dir="ltr" className="eb-stage-score-input" data-stage-score=""
                                  value={draft} onChange={e => { const v = e.target.value; setScoreDrafts(prev => ({ ...prev, [stage.stageId]: v })); }} onKeyDown={onScoreKey}
                                  aria-label={"علامة المرحلة " + label + " من 100"} placeholder="0–100" aria-invalid={rowError ? true : undefined} />
                                <span className="eb-stage-score-max" aria-hidden="true">/100</span>
                                <button type="button" className="eb-button is-small" disabled={scoreBusy || !scoreChanged} onClick={e => { const trigger = e.currentTarget; saveScore(stage, draft, { refocus: { trigger, input: trigger.closest("li")?.querySelector<HTMLInputElement>("input[data-stage-score]") ?? null } }); }} aria-label={"حفظ علامة المرحلة " + stage.stageId}>{scoreBusy ? "جارٍ الحفظ…" : "حفظ"}</button>
                              </>
                            )}
                          </div>
                          <div className="eb-stage-cell-value">
                            {value
                              ? <span dir="ltr" title="القيمة في المشروع">{fmtContribution(value.contribution)}/{fmtContribution(value.maxContribution)}</span>
                              : <span className="eb-muted">—</span>}
                            {value && !value.counted && saved !== "" && <small className="eb-muted">عند الاعتماد</small>}
                          </div>
                          <div className="eb-stage-cell-actions">
                            {!readOnly && (
                              <>
                                <button type="button" className="eb-button is-primary is-small" disabled={statusBusy || status === "approved"} onClick={() => updateStage(stage, { status: "approved" })} aria-label={"اعتماد المرحلة " + stage.stageId}><IconCheck size={16} />اعتماد</button>
                                <ActionMenu label={"تغيير حالة المرحلة " + stage.stageId} text="الحالة" disabled={statusBusy}>
                                  {STAGE_STATUS_ORDER.filter(st => st !== "approved").map(st => (
                                    <button key={st} type="button" className="eb-menu-item" disabled={statusBusy || status === st} onClick={() => updateStage(stage, { status: st })}>{stageStatusLabel(st)}</button>
                                  ))}
                                </ActionMenu>
                              </>
                            )}
                            <button type="button" className="eb-button is-quiet is-small eb-stage-details-toggle" aria-expanded={isOpen} aria-controls={stagePanelId}
                              aria-label={"تفاصيل وملاحظة المرحلة " + stage.stageId} onClick={() => setOpenStageId(isOpen ? "" : stage.stageId)}>
                              <IconChevronDown size={16} className={"eb-disclosure-chevron" + (isOpen ? " is-open" : "")} aria-hidden="true" />تفاصيل
                            </button>
                          </div>
                        </div>
                        {rowError && <p className="eb-stage-row-error" role="alert">{stage.stageId}: {rowError}</p>}
                        {isOpen && (
                          <div id={stagePanelId} className="eb-stage-detail">
                            {stage.description ? <p className="eb-muted">{stage.description}</p> : null}
                            {perf && (
                              <p className="eb-stage-score">
                                <span>العلامة: <strong dir="ltr">{fmtStageScore(entry)}</strong></span>
                                {value && <span>القيمة في المشروع: <strong dir="ltr">{fmtContribution(value.contribution)} / {fmtContribution(value.maxContribution)}</strong></span>}
                                {value && !value.counted && typeof entry?.score === "number" && <small className="eb-muted">تُحتسب عند اعتماد المرحلة</small>}
                              </p>
                            )}
                            {readOnly ? (
                              entry?.note ? <p className="eb-stage-note-view">ملاحظة المعلم: {entry.note}</p> : <small className="eb-muted">لا توجد ملاحظة.</small>
                            ) : (
                              <>
                                {typeof entry?.score === "number" && (
                                  <div className="eb-stage-actions">
                                    <button type="button" className="eb-button is-quiet is-small" disabled={scoreBusy} onClick={() => { setScoreDrafts(prev => { const next = { ...prev }; delete next[stage.stageId]; return next; }); updateStage(stage, { score: null }); }}>مسح العلامة</button>
                                  </div>
                                )}
                                <label className="eb-field eb-stage-note-edit">ملاحظة المعلم
                                  <textarea value={noteDraft} onChange={e => { const v = e.target.value; setNoteDrafts(prev => ({ ...prev, [stage.stageId]: v })); }} placeholder="اكتب ملاحظة للطالب..." rows={3} />
                                </label>
                                <div className="eb-stage-note-actions">
                                  <button type="button" className="eb-button is-small" disabled={noteBusy || noteDraft === (entry?.note || "")} onClick={() => updateStage(stage, { note: noteDraft })}>حفظ الملاحظة</button>
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
