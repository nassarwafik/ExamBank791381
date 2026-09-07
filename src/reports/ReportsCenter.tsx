import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { reportGet } from "./api";
import { LoadingState } from "./ui";
import type { ReportType, Filters } from "./ReportViews";
import "../reports.css";

// The report views (with Chart.js) are code-split so the charts only load when a report is opened.
const ReportView = lazy(() => import("./ReportViews"));

type ClassOpt = { classId: string; name: string; schoolYear: string; status: string; programCode: string };
type ProjectOpt = { projectCode: string; title: string };
type FiltersResp = { schoolYears: string[]; classes: ClassOpt[]; projects: ProjectOpt[] };

type Category = "all" | "students" | "exams" | "assignments" | "projects";
type Card = { type: ReportType; emoji: string; title: string; desc: string; category: Category; needs: ("class" | "student" | "project")[] };

const CARDS: Card[] = [
  { type: "class", emoji: "👥", title: "تقرير الصف", desc: "ملخّص الصف: الواجبات والتسليم والمشروع.", category: "students", needs: ["class"] },
  { type: "student", emoji: "👤", title: "تقرير الطالب", desc: "أداء الطالب الأكاديمي والمشروع.", category: "students", needs: ["student"] },
  { type: "exams", emoji: "📝", title: "الامتحانات", desc: "المتوسطات وتوزيع الدرجات ونسبة النجاح.", category: "exams", needs: ["class"] },
  { type: "assignments", emoji: "📋", title: "الواجبات", desc: "نِسب التسليم ومصفوفة الطالب × الواجب.", category: "assignments", needs: ["class"] },
  { type: "project", emoji: "📡", title: "تقرير المشروع", desc: "تقدّم الصف في المشروع وإحصائياته.", category: "projects", needs: ["project", "class"] },
  { type: "track", emoji: "🧭", title: "تقرير المسار", desc: "حالة كل مرحلة داخل مسار.", category: "projects", needs: ["project", "class"] },
  { type: "ready", emoji: "🔵", title: "جاهز للفحص", desc: "المراحل بانتظار الاعتماد، مجمّعة بالطالب.", category: "projects", needs: ["project", "class"] },
  { type: "delayed", emoji: "⚠️", title: "المتأخرون", desc: "الطلاب المتأخرون حسب إعداد الصف.", category: "projects", needs: ["project", "class"] },
  { type: "timeline", emoji: "📈", title: "التقدم الزمني", desc: "تطوّر تقدّم المشروع أسبوعيًا.", category: "projects", needs: ["project", "class"] }
];

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all", label: "الكل" }, { key: "students", label: "الطلاب" },
  { key: "exams", label: "الامتحانات" }, { key: "assignments", label: "الواجبات" }, { key: "projects", label: "المشاريع" }
];

export default function ReportsCenter({ token }: { token: string }) {
  const [opts, setOpts] = useState<FiltersResp | null>(null);
  const [active, setActive] = useState<ReportType | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [filters, setFilters] = useState<Filters>({ schoolYear: "", classId: "", studentId: "", projectCode: "", track: "" });
  const [students, setStudents] = useState<{ studentId: string; displayName: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    reportGet<FiltersResp>(token, { type: "filters" }).then(r => { if (!cancelled) setOpts(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  // Load students when a class is chosen (for student/timeline reports).
  useEffect(() => {
    if (!filters.classId) { setStudents([]); return; }
    let cancelled = false;
    reportGet<{ students: { studentId: string; displayName: string }[] }>(token, { type: "classStudents", classId: filters.classId })
      .then(r => { if (!cancelled) setStudents(r.students || []); }).catch(() => { if (!cancelled) setStudents([]); });
    return () => { cancelled = true; };
  }, [token, filters.classId]);

  const classesForYear = useMemo(() => {
    if (!opts) return [];
    return opts.classes.filter(c => !filters.schoolYear || c.schoolYear === filters.schoolYear);
  }, [opts, filters.schoolYear]);

  const activeCard = CARDS.find(c => c.type === active) || null;
  const needs = (k: "class" | "student" | "project") => activeCard?.needs.includes(k);

  const visibleCards = CARDS.filter(c => category === "all" || c.category === category);

  return (
    <section className="teacher-platform reports-center" dir="rtl">
      <div className="teacher-platform-inner reports-center-inner">
        <section className="teacher-assignment-heading">
          <span className="platform-eyebrow">Reports</span>
          <h2>📑 مركز التقارير</h2>
          <p>متابعة وتحليل أداء الطلاب والصفوف والامتحانات والمشاريع.</p>
        </section>

        {!active ? (
          <>
            <div className="report-filters report-noprint">
              {CATEGORIES.map(c => (
                <button key={c.key} type="button" className={"p794-chip " + (category === c.key ? "active" : "")} onClick={() => setCategory(c.key)}>{c.label}</button>
              ))}
            </div>
            <div className="report-home-grid">
              {visibleCards.map(c => (
                <button key={c.type} className="report-home-card" onClick={() => setActive(c.type)}>
                  <span className="report-home-emoji" aria-hidden="true">{c.emoji}</span>
                  <h3>{c.title}</h3>
                  <p>{c.desc}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button className="report-back report-noprint" onClick={() => setActive(null)}>→ عودة لكل التقارير</button>
            <div className="report-filters report-noprint">
              <label>السنة الدراسية
                <select value={filters.schoolYear} onChange={e => setFilters(f => ({ ...f, schoolYear: e.target.value, classId: "", studentId: "" }))}>
                  <option value="">كل السنوات</option>
                  {opts?.schoolYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              {needs("project") && (
                <label>المشروع
                  <select value={filters.projectCode} onChange={e => setFilters(f => ({ ...f, projectCode: e.target.value, classId: "" }))}>
                    <option value="">اختر مشروعًا</option>
                    {opts?.projects.map(p => <option key={p.projectCode} value={p.projectCode}>{p.title}</option>)}
                  </select>
                </label>
              )}
              <label>الصف
                <select value={filters.classId} onChange={e => setFilters(f => ({ ...f, classId: e.target.value, studentId: "" }))}>
                  <option value="">اختر صفًا</option>
                  {classesForYear
                    .filter(c => !needs("project") || !filters.projectCode || c.programCode === filters.projectCode)
                    .map(c => <option key={c.classId} value={c.classId}>{c.name} — {c.schoolYear}{c.status === "archived" ? " (مؤرشف)" : ""}</option>)}
                </select>
              </label>
              {needs("student") && (
                <label>الطالب
                  <select value={filters.studentId} onChange={e => setFilters(f => ({ ...f, studentId: e.target.value }))}>
                    <option value="">اختر طالبًا</option>
                    {students.map(s => <option key={s.studentId} value={s.studentId}>{s.displayName}</option>)}
                  </select>
                </label>
              )}
              {active === "timeline" && (
                <label>طالب (اختياري)
                  <select value={filters.studentId} onChange={e => setFilters(f => ({ ...f, studentId: e.target.value }))}>
                    <option value="">الصف كامل</option>
                    {students.map(s => <option key={s.studentId} value={s.studentId}>{s.displayName}</option>)}
                  </select>
                </label>
              )}
            </div>
            <Suspense fallback={<LoadingState />}>
              <ReportView type={active} token={token} filters={filters} />
            </Suspense>
          </>
        )}
      </div>
    </section>
  );
}
