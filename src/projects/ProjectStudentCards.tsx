import { useEffect, useMemo, useState, type RefObject } from "react";
import { trackerGet } from "./api";
import { filterStudentCards, fmtDate } from "./helpers";
import { stageStatusLabel, toneForTrack } from "./teacherPresentation";
import ProgressBar from "../ui/ProgressBar";
import StatusBadge from "../ui/StatusBadge";
import EmptyState from "../ui/EmptyState";
import { fmtGrade, projectRankVisual } from "./projectPerformance";
import type { StudentCard, StudentFilter, TrackMeta } from "./types";

type Props = {
  token: string; projectCode: string; classId: string; tracks: TrackMeta[];
  /** Bumped by the workspace when a student profile mutation means the list must be re-read. */
  reloadNonce?: number;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onOpenStudent: (studentId: string, trigger: HTMLElement) => void;
};

const FILTERS: { key: StudentFilter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "ready", label: "جاهزون للفحص" },
  { key: "late", label: "متأخرون" },
  { key: "not_started", label: "لم يبدأوا" },
  { key: "complete", label: "مكتملون" },
  { key: "stale", label: "بلا تحديث" }
];
const DEFAULT_LATE_THRESHOLD = 40;

// The class's student cards for one project: ONE `students` read per class/project (and per explicit reload);
// search and filters are client-side over the already-loaded cards (zero requests). Card values are the
// exact API fields; nothing is recomputed here.
export default function ProjectStudentCards({ token, projectCode, classId, tracks, reloadNonce = 0, headingRef, onOpenStudent }: Props) {
  const [cards, setCards] = useState<StudentCard[]>([]);
  const [lateThreshold, setLateThreshold] = useState(DEFAULT_LATE_THRESHOLD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StudentFilter>("all");

  async function load() {
    setLoading(true); setError("");
    try {
      // The students response carries the class config so the "late" threshold is never hard-coded.
      const r = await trackerGet<{ students: StudentCard[]; config?: { lateThreshold?: number } }>(token, projectCode, "students", { classId });
      setCards(r.students || []);
      if (r.config && Number.isFinite(Number(r.config.lateThreshold))) setLateThreshold(Number(r.config.lateThreshold));
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل الطلاب."); }
    finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [classId, projectCode, reloadNonce]);

  const visible = useMemo(() => filterStudentCards(cards, filter, search, lateThreshold), [cards, filter, search, lateThreshold]);

  return (
    <section className="eb-project-students" aria-labelledby="eb-project-students-title">
      <h2 id="eb-project-students-title" className="eb-subheading" ref={headingRef} tabIndex={-1}>تقدّم الطلاب</h2>
      {loading && !cards.length && !error && <p className="eb-muted" role="status">جارٍ تحميل الطلاب...</p>}
      {error && <div className="platform-error assignment-inline-message" role="alert">{error} <button type="button" className="eb-button is-small" onClick={() => void load()}>إعادة المحاولة</button></div>}
      {!loading && !error && !cards.length && <EmptyState title="لم يبدأ أي طالب المشروع بعد." description="تظهر بطاقات الطلاب هنا بمجرد وجود طلاب في الصف." />}
      {cards.length > 0 && (
        <>
          <div className="eb-project-students-controls">
            <label className="eb-field-inline eb-project-search">بحث<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث باسم الطالب أو الكود" /></label>
            <div className="eb-chip-group" role="group" aria-label="تصفية الطلاب">
              {FILTERS.map(f => <button key={f.key} type="button" className="eb-chip-button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>)}
            </div>
            <p className="eb-muted eb-project-students-count" role="status">{visible.length} من {cards.length} طالب</p>
          </div>
          {visible.length ? (
            <ul className="eb-student-cards">
              {visible.map(c => (
                <li key={c.studentId} className={"eb-student-card" + (c.complete ? " is-complete" : "") + (c.stale ? " is-stale" : "")}>
                  <div className="eb-student-card-head">
                    <div className="eb-student-card-name"><strong>{c.displayName}</strong>{c.code ? <span className="eb-muted">{c.code}</span> : null}</div>
                    {c.complete ? <StatusBadge tone="success">مكتمل</StatusBadge> : c.stale ? <StatusBadge tone="warn">بلا تحديث</StatusBadge> : null}
                  </div>
                  <ProgressBar label="التقدم العام" value={c.overallProgress} tone="primary" size="sm" />
                  {tracks.map((t, i) => <ProgressBar key={t.trackId} label={t.title} value={c.trackProgress[t.trackId] || 0} tone={toneForTrack(i)} size="sm" />)}
                  {typeof c.grade === "number" && c.projectTier && (
                    <p className="eb-student-card-perf"><span>العلامة: <strong dir="ltr">{fmtGrade(c.grade)}</strong></span><span>قوة المشروع: <strong>{projectRankVisual(c.projectTier).title}</strong></span></p>
                  )}
                  <p className="eb-student-card-counts">
                    <span>{stageStatusLabel("approved")} {c.counts.approved}</span>
                    <span>{stageStatusLabel("ready_for_review")} {c.readyForReviewCount}</span>
                    <span>{stageStatusLabel("in_progress")} {c.counts.in_progress}</span>
                    <span>{stageStatusLabel("not_started")} {c.counts.not_started}</span>
                  </p>
                  <div className="eb-student-card-foot">
                    <small className="eb-muted">آخر تحديث: {fmtDate(c.updatedAt)}</small>
                    <button type="button" className="eb-button is-primary is-small" onClick={e => onOpenStudent(c.studentId, e.currentTarget)}>فتح ملف الطالب</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title="لا يوجد طلاب مطابقون للتصفية." description="جرّب تصنيفًا آخر أو امسح كلمة البحث." />}
        </>
      )}
    </section>
  );
}
