import { useEffect, useMemo, useState } from "react";
import { projectApi } from "./api";
import { filterStudentCards, fmtDate } from "./helpers";
import ProjectProgressBar from "./ProjectProgressBar";
import type { StudentCard, StudentFilter } from "./types";

type Props = { token: string; classId: string; lateThreshold: number; onOpenStudent: (studentId: string) => void };

const FILTERS: { key: StudentFilter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "ready", label: "جاهزون للفحص" },
  { key: "late", label: "متأخرون" },
  { key: "not_started", label: "لم يبدأوا" },
  { key: "complete", label: "مكتملون" },
  { key: "stale", label: "بلا تحديث" }
];

export default function ProjectStudents({ token, classId, lateThreshold, onOpenStudent }: Props) {
  const [cards, setCards] = useState<StudentCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StudentFilter>("all");

  async function load() {
    setLoading(true); setError("");
    try {
      const r = await projectApi<{ students: StudentCard[] }>(token, "/api/project-794589?resource=students&classId=" + encodeURIComponent(classId));
      setCards(r.students || []);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل الطلاب."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [classId]);

  const visible = useMemo(() => filterStudentCards(cards, filter, search, lateThreshold), [cards, filter, search, lateThreshold]);

  if (loading && !cards.length) return <div className="platform-loading">⏳ جارٍ التحميل...</div>;
  if (error) return <div className="platform-error">{error} <button onClick={() => void load()}>إعادة المحاولة</button></div>;
  if (!cards.length) return <div className="platform-empty">لم يبدأ أي طالب المشروع بعد.</div>;

  return (
    <div className="p794-students">
      <div className="p794-students-controls">
        <input className="p794-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث باسم الطالب..." />
        <div className="p794-filter-chips">
          {FILTERS.map(f => (
            <button key={f.key} type="button" className={"p794-chip " + (filter === f.key ? "active" : "")} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
      </div>
      <div className="p794-card-grid">
        {visible.map(c => (
          <article key={c.studentId} className={"p794-student-card" + (c.complete ? " complete" : "") + (c.stale ? " stale" : "")}>
            <div className="p794-student-card-head">
              <strong>{c.displayName}</strong>
              {c.complete ? <span className="p794-chip-tag done">مكتمل</span> : c.stale ? <span className="p794-chip-tag warn">بلا تحديث</span> : null}
            </div>
            <ProjectProgressBar label="التقدم العام" value={c.overallProgress} tone="overall" />
            <ProjectProgressBar label="📘 الكتاب" value={c.bookProgress} tone="book" />
            <ProjectProgressBar label="🖧 Packet Tracer" value={c.packetTracerProgress} tone="pt" />
            <div className="p794-student-card-counts">
              <span>✅ {c.counts.approved}</span>
              <span>🔵 {c.readyForReviewCount}</span>
              <span>🟡 {c.counts.in_progress}</span>
              <span>⬜ {c.counts.not_started}</span>
            </div>
            <div className="p794-student-card-foot">
              <small>آخر تحديث: {fmtDate(c.updatedAt)}</small>
              <button className="platform-primary" onClick={() => onOpenStudent(c.studentId)}>فتح ملف الطالب</button>
            </div>
          </article>
        ))}
        {!visible.length && <div className="platform-empty">لا يوجد طلاب مطابقون للتصفية.</div>}
      </div>
    </div>
  );
}
