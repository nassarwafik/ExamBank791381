import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { trackerGet } from "./api";
import { filterStudentCards, fmtDate } from "./helpers";
import { stageStatusLabel, toneForTrack } from "./teacherPresentation";
import ProgressBar from "../ui/ProgressBar";
import StatusBadge from "../ui/StatusBadge";
import EmptyState from "../ui/EmptyState";
import VisuallyHidden from "../ui/VisuallyHidden";
import { cardState, isStalled, sortStudentCards, STUDENT_SORTS, type StudentSort } from "./studentCardsView";
import "./studentCards.css";
import { fmtGrade, projectRankVisual } from "./projectPerformance";
import type { StudentCard, StudentFilter, TrackMeta } from "./types";

type Props = {
  token: string; projectCode: string; classId: string; tracks: TrackMeta[];
  /** Bumped by the workspace when a student profile mutation means the list must be re-read. */
  reloadNonce?: number;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onOpenStudent: (studentId: string, trigger: HTMLElement) => void;
  /** Phase P4 — the students as currently shown (filter + search applied, in order): the profile's «السابق / التالي». */
  onVisibleChange?: (students: { studentId: string; displayName: string }[]) => void;
};

const FILTERS: { key: StudentFilter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "ready", label: "جاهزون للفحص" },
  { key: "self", label: "حدّدوا مراحل" },
  { key: "late", label: "متأخرون" },
  { key: "not_started", label: "لم يبدأوا" },
  { key: "complete", label: "مكتملون" },
  { key: "stale", label: "بلا تحديث" }
];
const DEFAULT_LATE_THRESHOLD = 40;
type StudentsView = "cards" | "table";

// The class's student cards for one project: ONE `students` read per class/project (and per explicit reload);
// search and filters are client-side over the already-loaded cards (zero requests). Card values are the
// exact API fields; nothing is recomputed here.
export default function ProjectStudentCards({ token, projectCode, classId, tracks, reloadNonce = 0, headingRef, onOpenStudent, onVisibleChange }: Props) {
  const [cards, setCards] = useState<StudentCard[]>([]);
  const [lateThreshold, setLateThreshold] = useState(DEFAULT_LATE_THRESHOLD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StudentFilter>("all");
  // Phase P-5 — the teacher's order and view (cards or a compact table); both apply to the same filtered list.
  const [sort, setSort] = useState<StudentSort>("name");
  const [view, setView] = useState<StudentsView>("cards");
  // Phase P-1 — only the LATEST read may populate the cards: a slower response for a previously selected class is dropped.
  const seq = useRef(0);

  async function load() {
    const mine = ++seq.current;
    setLoading(true); setError("");
    try {
      // The students response carries the class config so the "late" threshold is never hard-coded.
      const r = await trackerGet<{ students: StudentCard[]; config?: { lateThreshold?: number } }>(token, projectCode, "students", { classId });
      if (mine !== seq.current) return;
      setCards(r.students || []);
      if (r.config && Number.isFinite(Number(r.config.lateThreshold))) setLateThreshold(Number(r.config.lateThreshold));
    } catch (e) { if (mine === seq.current) setError(e instanceof Error ? e.message : "تعذر تحميل الطلاب."); }
    finally { if (mine === seq.current) setLoading(false); }
  }
  // A new class / project starts with no cards (never the previous class's students); a reload keeps them until it lands.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCards([]); }, [classId, projectCode]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [classId, projectCode, reloadNonce]);

  const visible = useMemo(() => sortStudentCards(filterStudentCards(cards, filter, search, lateThreshold), sort), [cards, filter, search, lateThreshold, sort]);
  useEffect(() => { onVisibleChange?.(visible.map(c => ({ studentId: c.studentId, displayName: c.displayName }))); }, [visible, onVisibleChange]);

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
          <div className="eb-project-students-tools">
            <label className="eb-field-inline">الترتيب<select value={sort} onChange={e => setSort(e.target.value as StudentSort)}>
              {STUDENT_SORTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select></label>
            <div className="eb-segmented" role="group" aria-label="طريقة العرض">
              <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}>بطاقات</button>
              <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>جدول</button>
            </div>
          </div>
          {visible.length && view === "table" ? (
            <div className="students-table-wrap eb-project-students-table" role="region" aria-label="جدول تقدّم الطلاب" tabIndex={0}>
              <table className="students-table">
                <thead><tr>
                  <th scope="col">الطالب</th><th scope="col">التقدم العام</th>
                  {tracks.map(t => <th key={t.trackId} scope="col">{t.title}</th>)}
                  <th scope="col">{stageStatusLabel("ready_for_review")}</th><th scope="col">{stageStatusLabel("in_progress")}</th><th scope="col">{stageStatusLabel("approved")}</th>
                  <th scope="col">الحالة</th><th scope="col">آخر تحديث</th><th scope="col"><VisuallyHidden>الإجراء</VisuallyHidden></th>
                </tr></thead>
                <tbody>{visible.map(c => {
                  const state = cardState(c);
                  return (
                    <tr key={c.studentId} className={isStalled(c) ? "is-stale" : undefined}>
                      <th scope="row"><strong>{c.displayName}</strong>{c.code ? <span className="eb-muted"> {c.code}</span> : null}</th>
                      <td dir="ltr">{c.overallProgress}%</td>
                      {tracks.map(t => <td key={t.trackId} dir="ltr">{c.trackProgress[t.trackId] || 0}%</td>)}
                      <td>{c.readyForReviewCount}</td><td>{c.counts.in_progress}</td><td>{c.counts.approved}</td>
                      <td>{state ? <StatusBadge tone={state.tone}>{state.label}</StatusBadge> : <span className="eb-muted">قيد التنفيذ</span>}</td>
                      <td>{fmtDate(c.updatedAt)}</td>
                      <td><button type="button" className="eb-button is-primary is-small" onClick={e => onOpenStudent(c.studentId, e.currentTarget)}>فتح ملف الطالب</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ) : visible.length ? (
            <ul className="eb-student-cards">
              {visible.map(c => (
                <li key={c.studentId} className={"eb-student-card" + (c.complete ? " is-complete" : "") + (isStalled(c) ? " is-stale" : "")}>
                  <div className="eb-student-card-head">
                    <div className="eb-student-card-name"><strong>{c.displayName}</strong>{c.code ? <span className="eb-muted">{c.code}</span> : null}</div>
                    {(() => { const state = cardState(c); return state ? <StatusBadge tone={state.tone}>{state.label}</StatusBadge> : null; })()}
                  </div>
                  <ProgressBar label="التقدم العام" value={c.overallProgress} tone="primary" size="sm" />
                  {tracks.map((t, i) => <ProgressBar key={t.trackId} label={t.title} value={c.trackProgress[t.trackId] || 0} tone={toneForTrack(i)} size="sm" />)}
                  {typeof c.grade === "number" && c.projectTier && (
                    <p className="eb-student-card-perf"><span>العلامة: <strong dir="ltr">{fmtGrade(c.grade)}</strong></span><span>قوة المشروع: <strong>{projectRankVisual(c.projectTier).title}</strong></span></p>
                  )}
                  <p className="eb-student-card-counts">
                    <span>{stageStatusLabel("approved")} {c.counts.approved}</span>
                    <span>{stageStatusLabel("ready_for_review")} {c.readyForReviewCount}</span>
                    {(c.selfReportedCount || 0) > 0 && <span className="eb-student-card-self">حدّدها الطالب {c.selfReportedCount}</span>}
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
