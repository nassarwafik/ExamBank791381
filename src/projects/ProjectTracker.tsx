import { useEffect, useMemo, useRef, useState } from "react";
import { trackerGet } from "./api";
import ProjectDashboard from "./ProjectDashboard";
import ProjectStudentCards from "./ProjectStudentCards";
import ProjectStudentDetail from "./ProjectStudentDetail";
import ProjectAnalytics from "./ProjectAnalytics";
import ProjectStageSettings from "./ProjectStageSettings";
import ActionMenu from "../ui/ActionMenu";
import EmptyState from "../ui/EmptyState";
import StatusBadge from "../ui/StatusBadge";
import { IconDashboard, IconStudents, IconReports, IconEdit, IconRefresh, IconLock } from "../icons";
import type { ProjectClass, TrackMeta } from "./types";
import type { ProjectDrillTarget } from "./drillTarget";
import "../projects-pro.css";

export type ProjectView = "dashboard" | "students" | "analytics" | "settings";
type Props = {
  token: string; projectCode: string;
  /** Called after a successful mutation that can change global ready-for-review counts (status change, template
   * update, project reset) so App re-reads its aggregated projects-summary. Never for note-only updates. */
  onReadyChanged?: () => void;
  /** Phase 9D — App's transient drill target (a Today Hub evaluation row). Applied ONLY after this project's class list
   * has loaded and the class exists in it; a target for another project is ignored; null = normal tracker. */
  drillTarget?: ProjectDrillTarget | null;
};

const VIEWS: { key: ProjectView; label: string; icon: (size: number) => React.ReactNode }[] = [
  { key: "dashboard", label: "لوحة المشروع", icon: s => <IconDashboard size={s} /> },
  { key: "students", label: "تقدّم الطلاب", icon: s => <IconStudents size={s} /> },
  { key: "analytics", label: "الإحصائيات", icon: s => <IconReports size={s} /> },
  { key: "settings", label: "إعداد المراحل", icon: s => <IconEdit size={s} /> }
];

/**
 * Project workspace (UX-6a): ONE compact toolbar (project context, labelled class selector, read-only
 * badge, aria-pressed view switch, overflow refresh) above the selected view. The shell owns the page
 * title and breadcrumb, so there is no hero and no extra h1 here. Request model is unchanged: classes once
 * per project, then the resource of the current view for the selected class; the student list stays mounted
 * (hidden) while a student profile is open, so returning re-reads it only after a mutation.
 */
export default function ProjectTracker({ token, projectCode, onReadyChanged, drillTarget = null }: Props) {
  const [classes, setClasses] = useState<ProjectClass[]>([]);
  // The project whose class list `classes` currently holds ("" until the first successful read). A drill target is
  // validated ONLY against a list loaded for the SAME project, and a stale classes response (an earlier project) is
  // dropped by the request sequence below, so it can neither repopulate the selector nor apply an older target.
  const [classesFor, setClassesFor] = useState("");
  const classesSeq = useRef(0);
  const appliedDrillSeq = useRef(0);
  const [classId, setClassId] = useState("");
  const [view, setView] = useState<ProjectView>("dashboard");
  const [title, setTitle] = useState("");
  const [tracks, setTracks] = useState<TrackMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openStudentId, setOpenStudentId] = useState("");
  const [viewNonce, setViewNonce] = useState(0);
  const [studentsNonce, setStudentsNonce] = useState(0);
  const studentsDirty = useRef(false);
  const studentOpener = useRef<HTMLElement | null>(null);
  const focusStudentsPending = useRef(false);
  const contextRef = useRef<HTMLDivElement | null>(null);
  const studentsHeadingRef = useRef<HTMLHeadingElement | null>(null);

  async function loadClasses() {
    const seq = ++classesSeq.current, code = projectCode;
    setLoading(true); setError("");
    try {
      const r = await trackerGet<{ classes: ProjectClass[]; title: string; tracks: TrackMeta[] }>(token, code, "classes");
      if (seq !== classesSeq.current) return;                                   // a newer read (another project) superseded this one
      const list = r.classes || [];
      setClasses(list); setClassesFor(code); setTitle(r.title || ""); setTracks(r.tracks || []);
      if (!classId || !list.some(c => c.classId === classId)) {
        const first = list.find(c => c.status === "active") || list[0];
        setClassId(first ? first.classId : "");
      }
    } catch (e) { if (seq === classesSeq.current) setError(e instanceof Error ? e.message : "تعذر تحميل صفوف المشروع."); }
    finally { if (seq === classesSeq.current) setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setView("dashboard"); setOpenStudentId(""); void loadClasses(); }, [projectCode]);
  // Forward transition (hub → workspace): focus lands on the workspace context.
  useEffect(() => { contextRef.current?.focus(); }, [projectCode]);
  // Phase 9D — apply App's drill target exactly once per `seq`, and only when: it names THIS project, the class list
  // was loaded for THIS project (so it runs AFTER the projectCode reset above, never before it), and the class is in
  // that list. Then: select the class, switch to «تقدّم الطلاب», open the student — the SAME state the teacher reaches
  // by hand, so ProjectStudentDetail (and the server's membership check) behave exactly as usual. A target for another
  // project waits (App will change projectCode); an unknown class is consumed without opening anything.
  useEffect(() => {
    if (!drillTarget || drillTarget.seq === appliedDrillSeq.current) return;
    if (drillTarget.projectCode !== projectCode || classesFor !== projectCode) return;
    appliedDrillSeq.current = drillTarget.seq;
    if (!classes.some(c => c.classId === drillTarget.classId)) return;
    studentsDirty.current = false; studentOpener.current = null;
    setClassId(drillTarget.classId); setView("students"); setOpenStudentId(drillTarget.studentId);
  }, [drillTarget, projectCode, classesFor, classes]);

  function changeClass(next: string) { setClassId(next); setOpenStudentId(""); studentsDirty.current = false; }
  function changeView(next: ProjectView) { setView(next); setOpenStudentId(""); studentsDirty.current = false; }
  function openStudent(studentId: string, trigger?: HTMLElement | null) {
    studentOpener.current = trigger instanceof HTMLElement ? trigger : null;
    studentsDirty.current = false;
    setOpenStudentId(studentId);
  }
  function closeStudent() {
    setOpenStudentId("");
    focusStudentsPending.current = true;
    if (studentsDirty.current) { studentsDirty.current = false; setStudentsNonce(n => n + 1); }
  }
  // Back transition: focus returns to the original "فتح ملف الطالب" when it is still mounted, otherwise the
  // students heading (the list stays mounted while the profile is open, so the opener usually survives).
  useEffect(() => {
    if (openStudentId || !focusStudentsPending.current) return;
    focusStudentsPending.current = false;
    const el = studentOpener.current; studentOpener.current = null;
    if (el && el.isConnected) el.focus(); else studentsHeadingRef.current?.focus();
  }, [openStudentId]);

  const activeClasses = useMemo(() => classes.filter(c => c.status === "active"), [classes]);
  const archivedClasses = useMemo(() => classes.filter(c => c.status === "archived"), [classes]);
  const selected = useMemo(() => classes.find(c => c.classId === classId) || null, [classes, classId]);
  const readOnly = selected?.status === "archived";
  const trackNames = tracks.map(t => t.title).join(" · ");

  return (
    <section className="eb-project-workspace">
      <div className="eb-project-toolbar" role="region" aria-label="مساحة عمل المشروع" ref={contextRef} tabIndex={-1}>
        <div className="eb-project-context">
          <p className="eb-project-context-title"><strong>{title || "مشروع " + projectCode}</strong><span className="eb-project-context-code">الرمز {projectCode}</span></p>
          {trackNames && <p className="eb-project-context-tracks">{trackNames}</p>}
        </div>
        <div className="eb-project-toolbar-controls">
          <label className="eb-field-inline eb-project-class-field">الصف
            <select value={classId} onChange={e => changeClass(e.target.value)} disabled={!classes.length}>
              {!classes.length && <option value="">—</option>}
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
          {readOnly && <StatusBadge tone="warn" className="eb-project-readonly"><IconLock size={14} aria-hidden="true" />مؤرشف — للقراءة فقط</StatusBadge>}
          <div className="eb-segmented eb-project-views" role="group" aria-label="أقسام المشروع">
            {VIEWS.map(v => (
              <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => changeView(v.key)} disabled={!classId}>{v.icon(16)}<span>{v.label}</span></button>
            ))}
          </div>
          <ActionMenu label="المزيد من إجراءات المشروع">
            <button type="button" className="eb-menu-item" onClick={() => { void loadClasses(); setViewNonce(n => n + 1); }} disabled={loading}><IconRefresh size={16} />تحديث</button>
          </ActionMenu>
        </div>
      </div>

      {error && <div className="platform-error assignment-inline-message" role="alert">{error} <button type="button" className="eb-button is-small" onClick={() => void loadClasses()}>إعادة المحاولة</button></div>}
      {loading && !classes.length && !error && <p className="eb-muted" role="status">جارٍ تحميل صفوف المشروع...</p>}

      {!loading && !error && !classes.length ? (
        <EmptyState title="لا يوجد صف مرتبط بهذا المشروع بعد." description={"فعّل المشروع (" + projectCode + ") للصف من صفحة «الصفوف والطلاب»."} />
      ) : classId && tracks.length > 0 ? (
        <div className="eb-project-body" key={viewNonce}>
          {view === "dashboard" && <ProjectDashboard token={token} projectCode={projectCode} classId={classId} tracks={tracks} />}
          {view === "students" && (
            <>
              <div hidden={!!openStudentId}>
                <ProjectStudentCards token={token} projectCode={projectCode} classId={classId} tracks={tracks} reloadNonce={studentsNonce} headingRef={studentsHeadingRef} onOpenStudent={openStudent} />
              </div>
              {openStudentId && (
                <ProjectStudentDetail token={token} projectCode={projectCode} classId={classId} studentId={openStudentId} tracks={tracks}
                  onBack={closeStudent} onChanged={() => { studentsDirty.current = true; }} onReadyChanged={onReadyChanged} />
              )}
            </>
          )}
          {view === "analytics" && <ProjectAnalytics token={token} projectCode={projectCode} classId={classId} tracks={tracks} />}
          {view === "settings" && <ProjectStageSettings token={token} projectCode={projectCode} classId={classId} tracks={tracks} readOnly={!!readOnly} onReadyChanged={onReadyChanged} />}
        </div>
      ) : null}
    </section>
  );
}
