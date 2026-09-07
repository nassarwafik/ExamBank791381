import { useEffect, useMemo, useState } from "react";
import { trackerGet, trackerPost } from "./api";
import { STATUS_META, statusLabel, fmtDate, stagesByGroup, trackIcon } from "./helpers";
import ProjectProgressBar, { toneForTrackIndex } from "./ProjectProgressBar";
import StageStatusBadge from "./StageStatusBadge";
import type { StudentDetail, StageStatus, ProjectStage, StudentCard, StageProgressEntry, HistoryEvent, BalanceInsight, TrackMeta } from "./types";

type Props = { token: string; projectCode: string; classId: string; studentId: string; tracks: TrackMeta[]; onBack: () => void };

const STATUS_ACTIONS: { status: StageStatus; label: string }[] = [
  { status: "not_started", label: "لم يبدأ" },
  { status: "in_progress", label: "قيد التنفيذ" },
  { status: "ready_for_review", label: "جاهز للفحص" },
  { status: "approved", label: "✅ اعتماد المرحلة" }
];

type UpdateResponse = {
  ok: true; noChange?: boolean;
  summary: StudentCard;
  stage: StageProgressEntry & { stageId: string };
  nextStages: Record<string, ProjectStage | null>;
  balance: BalanceInsight;
  history: HistoryEvent[];
};

export default function ProjectStudentDetail({ token, projectCode, classId, studentId, tracks, onBack }: Props) {
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [track, setTrack] = useState<string>(tracks[0]?.trackId || "");
  const [openStageId, setOpenStageId] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [noteDraft, setNoteDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await trackerGet<StudentDetail>(token, projectCode, "student", { classId, studentId });
      setDetail(r);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل ملف الطالب."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [classId, studentId, projectCode]);

  const groups = useMemo(() => detail ? (detail.groups || []).filter(g => g.track === track).sort((a, b) => a.order - b.order) : [], [detail, track]);
  const byGroup = useMemo(() => detail ? stagesByGroup(detail.stages.filter(s => s.active !== false), track) : new Map(), [detail, track]);

  async function updateStage(stage: ProjectStage, patch: { status?: StageStatus; note?: string }) {
    if (!detail || detail.readOnly || busy) return;
    setBusy(true); setError("");
    try {
      const res = await trackerPost<UpdateResponse>(token, projectCode, { action: "progress.update", classId, studentId, stageId: stage.stageId, ...patch });
      if (!res.noChange) {
        const { stageId: sid, ...entry } = res.stage;
        setDetail(prev => prev ? { ...prev, summary: res.summary, progress: { ...prev.progress, [sid]: entry }, nextStages: res.nextStages, balance: res.balance, history: res.history } : prev);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ التغيير."); }
    finally { setBusy(false); }
  }

  if (loading && !detail) return <div className="platform-loading">⏳ جارٍ التحميل...</div>;
  if (error && !detail) return <div className="platform-error">{error} <button onClick={() => void load()}>إعادة المحاولة</button></div>;
  if (!detail) return null;

  const s = detail.summary;
  const timeline = [...detail.history].reverse().slice(0, 20);

  return (
    <div className="p794-student-detail">
      <button className="p794-back" onClick={onBack}>→ عودة لتقدّم الطلاب</button>
      {detail.readOnly && <div className="platform-warning">الصف مؤرشف — عرض للقراءة فقط.</div>}
      {error && <div className="platform-error">{error}</div>}

      <section className="platform-card">
        <div className="p794-detail-head">
          <div><span className="platform-eyebrow">ملف المشروع</span><h3>{detail.student.displayName || studentId}</h3></div>
          <div className="p794-detail-counts">
            <span>✅ {s.counts.approved}</span><span>🔵 {s.counts.ready_for_review}</span>
            <span>🟡 {s.counts.in_progress}</span><span>⬜ {s.counts.not_started}</span>
          </div>
        </div>
        <ProjectProgressBar label="التقدم العام" value={s.overallProgress} tone="overall" />
        <div className="p794-detail-tracks">
          {tracks.map((t, i) => <ProjectProgressBar key={t.trackId} label={(t.icon ? t.icon + " " : "") + t.title} value={s.trackProgress[t.trackId] || 0} tone={toneForTrackIndex(i)} />)}
        </div>
        {detail.balance && (
          <div className="platform-warning p794-balance">⚠ {detail.balance.leadingTrackTitle} متقدّم على {detail.balance.laggingTrackTitle} بـ {detail.balance.diff}%</div>
        )}
        <div className="p794-next">
          <span>الخطوة التالية:</span>
          {tracks.map(t => {
            const n = detail.nextStages[t.trackId];
            return n
              ? <span key={t.trackId} className="p794-next-chip">{trackIcon(t.icon)} {n.stageId} — {n.title}</span>
              : <span key={t.trackId} className="p794-next-chip done">{trackIcon(t.icon)} مكتمل</span>;
          })}
        </div>
        <small className="p794-muted">آخر تحديث: {fmtDate(s.updatedAt)}</small>
      </section>

      <nav className="analytics-view-tabs" role="tablist" aria-label="مسارات المشروع">
        {tracks.map(t => (
          <button key={t.trackId} type="button" className={"analytics-view-tab " + (track === t.trackId ? "active" : "")} onClick={() => { setTrack(t.trackId); setOpenStageId(""); }}>
            {trackIcon(t.icon)} {t.title}
          </button>
        ))}
      </nav>

      <section className="platform-card">
        {groups.map(g => {
          const stages = (byGroup.get(g.groupId) || []) as ProjectStage[];
          const groupOpen = openGroups[g.groupId] !== false;
          const approvedInGroup = stages.filter(st => (detail.progress[st.stageId]?.status || "not_started") === "approved").length;
          return (
            <div key={g.groupId} className="p794-group">
              <button className="p794-group-head" onClick={() => setOpenGroups(prev => ({ ...prev, [g.groupId]: !groupOpen }))}>
                <span>{groupOpen ? "▼" : "▶"} {g.title}</span>
                <small>{approvedInGroup}/{stages.length} ✅</small>
              </button>
              {groupOpen && (
                <div className="p794-stage-list">
                  {stages.map(stage => {
                    const entry = detail.progress[stage.stageId];
                    const status = (entry?.status || "not_started") as StageStatus;
                    const isOpen = openStageId === stage.stageId;
                    return (
                      <div key={stage.stageId} className={"p794-stage-row " + STATUS_META[status].className}>
                        <button className="p794-stage-row-main" onClick={() => { setOpenStageId(isOpen ? "" : stage.stageId); setNoteDraft(entry?.note || ""); }}>
                          <StageStatusBadge status={status} showLabel={false} />
                          <span className="p794-stage-code">{stage.stageId}</span>
                          <span className="p794-stage-title">{stage.title}{stage.required === false ? <em className="p794-optional"> (اختياري)</em> : null}</span>
                          {entry?.note ? <span className="p794-note-dot" title="توجد ملاحظة">📝</span> : null}
                          <small>{fmtDate(entry?.updatedAt || "")}</small>
                        </button>
                        {isOpen && (
                          <div className="p794-stage-detail">
                            {stage.description ? <p className="p794-muted">{stage.description}</p> : null}
                            <div className="p794-stage-status-line">الحالة الحالية: <StageStatusBadge status={status} /></div>
                            {detail.readOnly ? (
                              entry?.note ? <div className="p794-note-view">📝 {entry.note}</div> : <small className="p794-muted">لا توجد ملاحظة.</small>
                            ) : (
                              <>
                                <div className="p794-stage-actions">
                                  {STATUS_ACTIONS.map(a => (
                                    <button key={a.status} disabled={busy || status === a.status}
                                      className={"p794-stage-action" + (a.status === "approved" ? " approve" : "") + (status === a.status ? " current" : "")}
                                      onClick={() => void updateStage(stage, { status: a.status })}>{a.label}</button>
                                  ))}
                                </div>
                                <label className="p794-note-edit">
                                  <span>ملاحظة المعلم</span>
                                  <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="اكتب ملاحظة للطالب..." />
                                  <button className="platform-primary" disabled={busy || noteDraft === (entry?.note || "")} onClick={() => void updateStage(stage, { note: noteDraft })}>حفظ الملاحظة</button>
                                </label>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="platform-card">
        <div className="platform-card-heading"><div><span className="platform-eyebrow">Timeline</span><h3>أحدث الأحداث</h3></div></div>
        {timeline.length ? (
          <ul className="p794-timeline">
            {timeline.map(ev => (
              <li key={ev.eventId}>
                <span className="p794-timeline-date">{fmtDate(ev.createdAt)}</span>
                <span>{ev.type === "status" && ev.toStatus ? STATUS_META[ev.toStatus].icon + " " + statusLabel(ev.toStatus) + " — " + ev.stageId : "📝 ملاحظة — " + ev.stageId}</span>
              </li>
            ))}
          </ul>
        ) : <div className="platform-empty">لا توجد أحداث بعد.</div>}
      </section>
    </div>
  );
}
