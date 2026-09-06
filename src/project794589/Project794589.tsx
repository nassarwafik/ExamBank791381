import { useEffect, useMemo, useState } from "react";
import { projectApi } from "./api";
import ProjectDashboard from "./ProjectDashboard";
import ProjectStudents from "./ProjectStudents";
import ProjectStudentDetail from "./ProjectStudentDetail";
import ProjectAnalytics from "./ProjectAnalytics";
import ProjectStageSettings from "./ProjectStageSettings";
import type { ProjectClass } from "./types";

export type ProjectTab = "dashboard" | "students" | "analytics" | "settings";
type Props = { token: string; tab: ProjectTab; classId: string; onClassChange: (classId: string) => void };

// Default class-level config fallbacks (also live server-side; only used before the summary loads).
const DEFAULT_LATE_THRESHOLD = 40;

export default function Project794589({ token, tab, classId, onClassChange }: Props) {
  const [classes, setClasses] = useState<ProjectClass[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openStudentId, setOpenStudentId] = useState("");

  async function loadClasses() {
    setLoading(true); setError("");
    try {
      const r = await projectApi<{ classes: ProjectClass[] }>(token, "/api/project-794589?resource=classes");
      const list = r.classes || [];
      setClasses(list);
      if (!classId || !list.some(c => c.classId === classId)) {
        const first = list.find(c => c.status === "active") || list[0];
        onClassChange(first ? first.classId : "");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل صفوف المشروع."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadClasses(); }, []);
  useEffect(() => { setOpenStudentId(""); }, [classId, tab]);

  const activeClasses = useMemo(() => classes.filter(c => c.status === "active"), [classes]);
  const archivedClasses = useMemo(() => classes.filter(c => c.status === "archived"), [classes]);
  const selected = useMemo(() => classes.find(c => c.classId === classId) || null, [classes, classId]);
  const readOnly = selected?.status === "archived";

  return (
    <section className="teacher-platform p794-root" dir="rtl">
      <div className="teacher-platform-inner">
        <section className="teacher-assignment-heading">
          <span className="platform-eyebrow">Project 794589</span>
          <h2>📡 متابعة مشروع 794589</h2>
          <p>متابعة تقدّم كل طالب في كتاب المشروع وPacket Tracer، واعتماد المراحل، ورؤية الإحصائيات.</p>
        </section>

        {error && <div className="platform-error">{error} <button onClick={() => void loadClasses()}>إعادة المحاولة</button></div>}
        {loading && !classes.length && <div className="platform-loading">⏳ جارٍ التحميل...</div>}

        {!loading && !classes.length ? (
          <div className="platform-empty">لا يوجد صف مرتبط ببرنامج 794589 بعد. فعّل البرنامج للصف من صفحة «الصفوف والطلاب».</div>
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

            {classId && (
              openStudentId ? (
                <ProjectStudentDetail token={token} classId={classId} studentId={openStudentId} onBack={() => setOpenStudentId("")} />
              ) : tab === "dashboard" ? (
                <ProjectDashboard token={token} classId={classId} />
              ) : tab === "students" ? (
                <ProjectStudents token={token} classId={classId} lateThreshold={DEFAULT_LATE_THRESHOLD} onOpenStudent={setOpenStudentId} />
              ) : tab === "analytics" ? (
                <ProjectAnalytics token={token} classId={classId} />
              ) : (
                <ProjectStageSettings token={token} classId={classId} readOnly={!!readOnly} />
              )
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
