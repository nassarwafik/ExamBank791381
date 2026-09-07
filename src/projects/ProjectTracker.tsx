import { useEffect, useMemo, useState } from "react";
import { trackerGet } from "./api";
import ProjectDashboard from "./ProjectDashboard";
import ProjectStudentCards from "./ProjectStudentCards";
import ProjectStudentDetail from "./ProjectStudentDetail";
import ProjectAnalytics from "./ProjectAnalytics";
import ProjectStageSettings from "./ProjectStageSettings";
import type { ProjectClass, TrackMeta } from "./types";

export type ProjectTab = "dashboard" | "students" | "analytics" | "settings";
type Props = { token: string; projectCode: string };

const TABS: { key: ProjectTab; label: string }[] = [
  { key: "dashboard", label: "🏠 لوحة المشروع" },
  { key: "students", label: "👨‍🎓 تقدّم الطلاب" },
  { key: "analytics", label: "📊 الإحصائيات" },
  { key: "settings", label: "⚙️ إعداد المراحل" }
];

// Generic, self-contained container for ANY project: class selector (active + archived), in-page tabs,
// and the tab views — all driven by the project's own tracks/title from the API. Renders
// 794589 / 899373 / 883589 identically; the sidebar only needs to pass projectCode.
export default function ProjectTracker({ token, projectCode }: Props) {
  const [classes, setClasses] = useState<ProjectClass[]>([]);
  const [classId, setClassId] = useState("");
  const [tab, setTab] = useState<ProjectTab>("dashboard");
  const [title, setTitle] = useState("");
  const [tracks, setTracks] = useState<TrackMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openStudentId, setOpenStudentId] = useState("");
  const onClassChange = setClassId;

  async function loadClasses() {
    setLoading(true); setError("");
    try {
      const r = await trackerGet<{ classes: ProjectClass[]; title: string; tracks: TrackMeta[] }>(token, projectCode, "classes");
      const list = r.classes || [];
      setClasses(list); setTitle(r.title || ""); setTracks(r.tracks || []);
      if (!classId || !list.some(c => c.classId === classId)) {
        const first = list.find(c => c.status === "active") || list[0];
        onClassChange(first ? first.classId : "");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل صفوف المشروع."); }
    finally { setLoading(false); }
  }
  useEffect(() => { setTab("dashboard"); void loadClasses(); }, [projectCode]);
  useEffect(() => { setOpenStudentId(""); }, [classId, tab, projectCode]);

  const activeClasses = useMemo(() => classes.filter(c => c.status === "active"), [classes]);
  const archivedClasses = useMemo(() => classes.filter(c => c.status === "archived"), [classes]);
  const selected = useMemo(() => classes.find(c => c.classId === classId) || null, [classes, classId]);
  const readOnly = selected?.status === "archived";
  const trackNames = tracks.map(t => t.title).join(" · ");

  return (
    <section className="teacher-platform p794-root" dir="rtl">
      <div className="teacher-platform-inner">
        <section className="teacher-assignment-heading">
          <span className="platform-eyebrow">Project {projectCode}</span>
          <h2>📡 {title || "متابعة المشروع " + projectCode}</h2>
          <p>متابعة تقدّم كل طالب في {trackNames || "مسارات المشروع"}، واعتماد المراحل، ورؤية الإحصائيات.</p>
        </section>

        {error && <div className="platform-error">{error} <button onClick={() => void loadClasses()}>إعادة المحاولة</button></div>}
        {loading && !classes.length && <div className="platform-loading">⏳ جارٍ التحميل...</div>}

        {!loading && !classes.length ? (
          <div className="platform-empty">لا يوجد صف مرتبط بهذا المشروع بعد. فعّل البرنامج ({projectCode}) للصف من صفحة «الصفوف والطلاب».</div>
        ) : classes.length ? (
          <>
            <div className="p794-class-selector platform-card">
              <label>
                <span>الصف:</span>
                <select value={classId} onChange={e => onClassChange(e.target.value)}>
                  {activeClasses.length > 0 && (
                    <optgroup label="الصفوف النشطة">
                      {activeClasses.map(c => <option key={c.classId} value={c.classId}>{c.name} — {c.schoolYear}</option>)}
                    </optgroup>
                  )}
                  {archivedClasses.length > 0 && (
                    <optgroup label="السنوات السابقة / الصفوف المؤرشفة">
                      {archivedClasses.map(c => <option key={c.classId} value={c.classId}>{c.name} — {c.schoolYear} (مؤرشف)</option>)}
                    </optgroup>
                  )}
                </select>
              </label>
              {readOnly && <span className="p794-readonly-badge">🔒 مؤرشف — للقراءة فقط</span>}
            </div>

            {!openStudentId && (
              <nav className="analytics-view-tabs p794-tab-bar" role="tablist" aria-label="أقسام المشروع">
                {TABS.map(t => (
                  <button key={t.key} type="button" className={"analytics-view-tab " + (tab === t.key ? "active" : "")} onClick={() => setTab(t.key)}>{t.label}</button>
                ))}
              </nav>
            )}

            {classId && tracks.length > 0 && (
              openStudentId ? (
                <ProjectStudentDetail token={token} projectCode={projectCode} classId={classId} studentId={openStudentId} tracks={tracks} onBack={() => setOpenStudentId("")} />
              ) : tab === "dashboard" ? (
                <ProjectDashboard token={token} projectCode={projectCode} classId={classId} tracks={tracks} />
              ) : tab === "students" ? (
                <ProjectStudentCards token={token} projectCode={projectCode} classId={classId} tracks={tracks} onOpenStudent={setOpenStudentId} />
              ) : tab === "analytics" ? (
                <ProjectAnalytics token={token} projectCode={projectCode} classId={classId} tracks={tracks} />
              ) : (
                <ProjectStageSettings token={token} projectCode={projectCode} classId={classId} tracks={tracks} readOnly={!!readOnly} />
              )
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
