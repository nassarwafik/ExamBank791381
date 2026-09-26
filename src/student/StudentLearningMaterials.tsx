import { useEffect, useState } from "react";
import SectionHeader from "../ui/SectionHeader";
import EmptyState from "../ui/EmptyState";
import { IconBook } from "../icons";

/** One released course as GET /api/student-learning-materials returns it (published modules only). */
export type StudentLearningCourse = { courseId: string; title: string; modules: { moduleId: string; title: string; order: number }[] };
type Props = {
  token: string;
  onOpen: (course: StudentLearningCourse) => void;
  /** Phase 9A — the courses this panel loaded (its ONE read), for the Today Hub; null = unavailable / not loaded. */
  onCoursesChange?: (courses: StudentLearningCourse[] | null) => void;
};

/**
 * «موادي التعليمية» — the student's released learning materials (Class Learning Materials, phase 1).
 * OPTIONAL secondary panel: ONE read of /api/student-learning-materials on mount; any failure — a 401 included —
 * degrades LOCALLY (error text, never a logout: only the primary dashboard request owns the session). Shows ONLY
 * what the server released: no hidden titles, no hidden counts, no progress. Opening a course RE-VALIDATES the
 * entitlement (a fresh read) so the Reader always receives the latest published module ids, even from stale
 * portal state. Realtime updates are out of scope: changes appear on the next portal load / refresh / re-open.
 */
export default function StudentLearningMaterials({ token, onOpen, onCoursesChange }: Props) {
  const [courses, setCourses] = useState<StudentLearningCourse[] | null>(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState("");
  const headers = { "x-student-token": token, Authorization: "Bearer " + token };

  // null = unavailable (server/network failure → local error text). A 401 here is "feature unavailable for this
  // session" exactly like the achievement feed (silent, never a logout); an ok payload without materials is [].
  async function fetchMaterials(): Promise<StudentLearningCourse[] | null> {
    try {
      const r = await fetch("/api/student-learning-materials", { headers });
      if (r.status === 401) { console.warn("[student-portal] learning materials unavailable (401)"); return []; }
      if (!r.ok) { console.warn("[student-portal] learning materials unavailable (" + r.status + ")"); return null; }
      const j = await r.json() as { ok?: boolean; materials?: StudentLearningCourse[] };
      if (!j || !j.ok) return null;
      if (!Array.isArray(j.materials)) return [];
      return j.materials.filter(c => c && typeof c.courseId === "string" && Array.isArray(c.modules) && c.modules.length > 0);
    } catch { console.warn("[student-portal] learning materials request failed"); return null; }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchMaterials();
      if (cancelled) return;
      if (list === null) { setCourses([]); setError("تعذر تحميل موادك التعليمية الآن."); onCoursesChange?.(null); }
      else { setCourses(list); setError(""); onCoursesChange?.(list); }
    })();
    return () => { cancelled = true; };
  }, [token]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Open-time revalidation: the entitlement is read again so a chapter the teacher just hid never opens.
  async function open(course: StudentLearningCourse) {
    if (opening) return;
    setOpening(course.courseId); setError("");
    const fresh = await fetchMaterials();
    setOpening("");
    if (fresh === null) { setError("تعذر التحقق من موادك التعليمية الآن. حاول مرة أخرى."); return; }
    setCourses(fresh); onCoursesChange?.(fresh);
    const current = fresh.find(c => c.courseId === course.courseId);
    if (!current) { setError("لم تعد هذه المادة متاحة لصفك حاليًا."); return; }
    onOpen(current);
  }

  return (
    <section className="eb-sp-panel eb-sp-learning" aria-labelledby="eb-sp-learning-title">
      <SectionHeader level={2} id="eb-sp-learning-title" title="موادي التعليمية" description="الكتب والفصول التي نشرها معلمك لصفك؛ افتحها واقرأها خطوة بخطوة." />
      {courses === null && !error && <p className="eb-muted eb-sp-status" role="status">جارٍ تحميل موادك التعليمية...</p>}
      {error && <p className="eb-sp-learning-error">{error}</p>}
      {courses !== null && courses.length === 0 && !error && (
        <EmptyState compact title="لا توجد مواد تعليمية مضافة لصفك حاليًا" description="ستظهر هنا تلقائيًا عندما ينشر المعلم مادة تعليمية لصفك." />
      )}
      {courses !== null && courses.length > 0 && (
        <ul className="eb-sp-learning-list" aria-label="المواد التعليمية المتاحة">
          {courses.map(course => {
            const headingId = "eb-sp-learning-" + course.courseId;
            const modules = course.modules.slice().sort((a, b) => a.order - b.order);
            return (
              <li key={course.courseId}>
                <article className="eb-sp-learning-card" aria-labelledby={headingId}>
                  <div className="eb-sp-learning-head">
                    <span className="eb-sp-learning-cover" aria-hidden="true"><IconBook size={28} /></span>
                    <div className="eb-sp-learning-text">
                      <h3 id={headingId} className="eb-sp-learning-title">{course.title}</h3>
                      <p className="eb-sp-learning-meta">كتاب {course.courseId}</p>
                    </div>
                  </div>
                  <p className="eb-sp-learning-count">الوحدات المتاحة الآن: <strong>{modules.length}</strong></p>
                  <ol className="eb-sp-learning-modules" aria-label={"وحدات " + course.title}>
                    {modules.map(m => <li key={m.moduleId}>{m.title}</li>)}
                  </ol>
                  <button type="button" className="eb-button is-primary eb-sp-learning-open" disabled={Boolean(opening)} onClick={() => void open(course)}>
                    {opening === course.courseId ? "جارٍ الفتح..." : "فتح المادة"}
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
