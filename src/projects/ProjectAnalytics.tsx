import { useEffect, useRef, useState } from "react";
import { trackerGet } from "./api";
import ProjectAnalyticsCharts from "./ProjectAnalyticsCharts";
import ExamFormStatsCharts, { clockOf } from "./examForm/ExamFormStatsCharts";
import type { FormStats, FormStatsTrendPoint } from "./examForm/teacherTypes";
import { useAutoRefresh } from "../ui/useAutoRefresh";
import { useFullscreenOverlay } from "../ui/useFullscreenOverlay";
import { IconMaximize, IconMinimize } from "../icons";
import type { ProjectAnalytics as AnalyticsData, ProjectGroup, TrackMeta } from "./types";

type Props = { token: string; projectCode: string; classId: string; tracks: TrackMeta[] };

/** Live follow-up: the form's statistics (one light listing) refresh often, the stage charts (every progress document) less. */
export const LIVE_FORM_INTERVAL_MS = 10_000;
export const LIVE_STAGES_INTERVAL_MS = 30_000;
/** A forgotten live follow-up switches itself off. */
export const LIVE_MAX_MS = 60 * 60 * 1000;
const TREND_LIMIT = 360;

// Projects-workspace analytics view: ONE `resource=analytics` read per class/project, then the shared
// presentational charts (ProjectAnalyticsCharts). Same datasets and formulas as before.
// Beside it, ONE `resource=exam-form-stats` read feeds the exam form's charts (shown only once the class's form was
// opened). «Live» re-reads both silently on a timer while the page is visible (useAutoRefresh): the data on screen stays
// when a refresh fails, and the next one tries again. «ملء الشاشة» shows the whole view over the page (useFullscreenOverlay),
// the way the learning Reader presents a book — for a classroom projector during a live follow-up.
export default function ProjectAnalytics({ token, projectCode, classId, tracks }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stageTrack, setStageTrack] = useState<string>(tracks[0]?.trackId || "");
  const [formStats, setFormStats] = useState<FormStats | null>(null);
  const [trend, setTrend] = useState<FormStatsTrendPoint[]>([]);
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [notice, setNotice] = useState("");

  // Phase P-1 — only the LATEST read may populate the charts: a slower response for a previously selected class is dropped.
  const seq = useRef(0);
  const formSeq = useRef(0);
  const rootRef = useRef<HTMLElement | null>(null);
  const fullscreen = useFullscreenOverlay(rootRef);
  const liveRef = useRef(false);
  useEffect(() => { liveRef.current = live; }, [live]);

  async function load(silent = false) {
    const mine = ++seq.current;
    if (!silent) { setLoading(true); setError(""); }
    try {
      const r = await trackerGet<{ analytics: AnalyticsData; groups: ProjectGroup[] }>(token, projectCode, "analytics", { classId });
      if (mine !== seq.current) return;
      setData(r.analytics); setGroups(r.groups || []);
      if (silent) { setRefreshFailed(false); setUpdatedAt(new Date().toISOString()); }
    } catch (e) {
      if (mine !== seq.current) return;
      if (silent) setRefreshFailed(true);
      else setError(e instanceof Error ? e.message : "تعذر تحميل الإحصائيات.");
    }
    finally { if (mine === seq.current && !silent) setLoading(false); }
  }
  // The form's charts are an addition to the view: when their read fails the first time they are simply not shown.
  async function loadFormStats(silent = false) {
    const mine = ++formSeq.current;
    try {
      const r = await trackerGet<{ stats?: FormStats | null }>(token, projectCode, "exam-form-stats", { classId });
      if (mine !== formSeq.current) return;
      const stats = r.stats && Array.isArray(r.stats.students) && r.stats.students.length > 0 ? r.stats : null;
      setFormStats(stats);
      const at = new Date().toISOString();
      if (silent) { setUpdatedAt(at); setRefreshFailed(false); }   // the first paint carries no clock: only a live refresh does
      if (stats && liveRef.current) {
        const point = { at, averagePercent: stats.averagePercent, activeNow: stats.activeNow, handedIn: stats.counts.submitted + stats.counts.approved };
        setTrend(t => [...t, point].slice(-TREND_LIMIT));
      }
    } catch {
      if (mine !== formSeq.current) return;
      if (silent) setRefreshFailed(true);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setData(null); setFormStats(null); setTrend([]); setUpdatedAt(""); setRefreshFailed(false); void load(); void loadFormStats(); }, [classId, projectCode]);

  useAutoRefresh(() => loadFormStats(true), { intervalMs: LIVE_FORM_INTERVAL_MS, enabled: live });
  useAutoRefresh(() => load(true), { intervalMs: LIVE_STAGES_INTERVAL_MS, enabled: live });
  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(() => { setLive(false); setNotice("توقّف التحديث المباشر تلقائيًا بعد ساعة. شغّله من جديد عند الحاجة."); }, LIVE_MAX_MS);
    return () => clearTimeout(timer);
  }, [live]);

  function toggleLive() {
    const next = !live;
    liveRef.current = next;
    setLive(next);
    setNotice(next ? "بدأ التحديث المباشر." : "أُوقف التحديث المباشر.");
    if (next) { setTrend([]); void loadFormStats(true); void load(true); }
  }

  if (loading && !data) return <p className="eb-muted" role="status">جارٍ تحميل الإحصائيات...</p>;
  if (error) return <div className="platform-error assignment-inline-message" role="alert">{error} <button type="button" className="eb-button is-small" onClick={() => void load()}>إعادة المحاولة</button></div>;
  if (!data) return null;

  return (
    <section ref={rootRef} className={"eb-project-analytics" + (fullscreen.active ? " is-fullscreen" : "")} aria-labelledby="eb-project-analytics-title"
      role={fullscreen.active ? "dialog" : undefined} aria-modal={fullscreen.active || undefined}>
      <div className="eb-analytics-head">
        <h2 id="eb-project-analytics-title" className="eb-subheading">الإحصائيات</h2>
        <div className="eb-live-bar">
          <span className="eb-muted eb-live-meta" data-testid="analytics-live-meta">
            {live && <>يتحدّث تلقائيًا: الاستمارة كل <span dir="ltr">{LIVE_FORM_INTERVAL_MS / 1000}</span> ث، المراحل كل <span dir="ltr">{LIVE_STAGES_INTERVAL_MS / 1000}</span> ث. </>}
            {refreshFailed ? "تعذّر آخر تحديث؛ ستُعاد المحاولة. " : ""}
            {updatedAt && <>آخر تحديث: <span dir="ltr">{clockOf(updatedAt)}</span></>}
          </span>
          <button type="button" className={"eb-button eb-live-button" + (live ? " is-live" : "")} aria-pressed={live} aria-label="التحديث المباشر Live" onClick={toggleLive}>
            <span className="eb-live-dot" aria-hidden="true" /><span dir="ltr">Live</span>
          </button>
          <button type="button" className="eb-button eb-live-button" aria-pressed={fullscreen.active} onClick={fullscreen.toggle}>
            {fullscreen.active ? <IconMinimize size={16} aria-hidden="true" /> : <IconMaximize size={16} aria-hidden="true" />}
            {fullscreen.active ? "خروج من ملء الشاشة" : "ملء الشاشة"}
          </button>
        </div>
      </div>
      <p className="eb-live-status" role="status">{notice}</p>
      {formStats && <ExamFormStatsCharts stats={formStats} trend={trend} live={live} />}
      {formStats && <h3 className="eb-subheading">تقدّم المراحل</h3>}
      <ProjectAnalyticsCharts analytics={data} tracks={tracks} groups={groups} stageTrack={stageTrack} onStageTrack={setStageTrack} />
    </section>
  );
}
