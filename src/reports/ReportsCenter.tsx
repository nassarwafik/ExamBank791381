import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { reportGet } from "./api";
import { LoadingState, ErrorState } from "./ui";
import type { ReportType, Filters } from "./ReportViews";
import { rangeForPeriod, type Period } from "./period";
import { getClassProgramCodes } from "../projects/classPrograms";
import EmptyState from "../ui/EmptyState";
import IconButton from "../ui/IconButton";
import VisuallyHidden from "../ui/VisuallyHidden";
import { IconChevronBack } from "../icons";
import { REPORT_CARDS, CATEGORIES, GROUPS, PERIODS, TIME_AWARE, type Category, type Need } from "./catalog";
import "../reports-pro.css";

// The report views (with Chart.js) are code-split so the charts only load when a report is opened.
const ReportView = lazy(() => import("./ReportViews"));

type ClassOpt = { classId: string; name: string; schoolYear: string; status: string; programCodes: string[] };
type ProjectOpt = { projectCode: string; title: string };
type FiltersResp = { schoolYears: string[]; classes: ClassOpt[]; projects: ProjectOpt[] };

/**
 * Reports Center (UX-6b): Hub (categories → grouped report cards) → report workspace (back, compact identity,
 * only the relevant filters, result). ReportsCenter owns every filter/state decision; the API semantics
 * (report types, query parameters, period meaning) are unchanged. The shell owns the page title (no hero).
 */
export default function ReportsCenter({ token, onOpenProject }: { token: string; onOpenProject?: (projectCode: string) => void }) {
  const [opts, setOpts] = useState<FiltersResp | null>(null);
  const [active, setActive] = useState<ReportType | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [filters, setFilters] = useState<Filters>({ schoolYear: "", classId: "", studentId: "", projectCode: "", track: "", from: "", to: "" });
  const [period, setPeriod] = useState<Period>("all");
  const [studentsFor, setStudentsFor] = useState<{ classId: string; list: { studentId: string; displayName: string }[] }>({ classId: "", list: [] });
  const [optsLoading, setOptsLoading] = useState(false);
  const [optsError, setOptsError] = useState("");
  const [optsNonce, setOptsNonce] = useState(0);
  // The hub unmounts while a report is open, so "back" focuses the (re-rendered) card button of that report type.
  const cardButtons = useRef<Partial<Record<ReportType, HTMLButtonElement | null>>>({});
  const focusBackPending = useRef<ReportType | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOptsLoading(true); setOptsError("");
    reportGet<FiltersResp>(token, { type: "filters" })
      .then(r => { if (!cancelled) setOpts(r); })
      .catch(e => { if (!cancelled) setOptsError(e instanceof Error ? e.message : "تعذر تحميل بيانات التقارير."); })
      .finally(() => { if (!cancelled) setOptsLoading(false); });
    return () => { cancelled = true; };
  }, [token, optsNonce]);

  // Period -> concrete from/to (YYYY-MM-DD). "all" and "year" carry no date bound: reports are already
  // class-scoped and a class maps to exactly one schoolYear, so "this school year" == the class's own
  // assessments (schoolYear strings are NOT converted to invented date boundaries). "custom" keeps the
  // user-entered dates.
  function applyPeriod(p: Period) {
    setPeriod(p);
    if (p === "custom") return; // keep the user-entered from/to
    const { from, to } = rangeForPeriod(p);
    setFilters(f => ({ ...f, from, to }));
  }

  const activeCard = REPORT_CARDS.find(c => c.type === active) || null;
  const needs = (k: Need) => !!activeCard?.needs.includes(k);
  // Only the student report and the timeline's optional student consume the class's student list.
  const needsStudentList = active === "student" || active === "timeline";

  // Load students only when the open report consumes them and a class is chosen; a late response for an
  // older class is dropped (cancelled) and the exposed list is keyed by class so it is never stale.
  useEffect(() => {
    if (!needsStudentList || !filters.classId) return;
    const classId = filters.classId;
    if (studentsFor.classId === classId) return;                   // already loaded for this class — no re-read
    let cancelled = false;
    reportGet<{ students: { studentId: string; displayName: string }[] }>(token, { type: "classStudents", classId })
      .then(r => { if (!cancelled) setStudentsFor({ classId, list: r.students || [] }); })
      .catch(() => { if (!cancelled) setStudentsFor({ classId, list: [] }); });
    return () => { cancelled = true; };
  }, [token, filters.classId, needsStudentList, studentsFor.classId]);
  const students = studentsFor.classId && studentsFor.classId === filters.classId ? studentsFor.list : [];

  const classesForYear = useMemo(() => {
    if (!opts) return [];
    return opts.classes.filter(c => !filters.schoolYear || c.schoolYear === filters.schoolYear);
  }, [opts, filters.schoolYear]);
  // Canonical class ↔ project membership (programCodes[] wins; legacy scalar only when absent) via the ONE helper.
  const classChoices = classesForYear.filter(c => !needs("project") || !filters.projectCode || getClassProgramCodes(c).includes(filters.projectCode));

  function openReport(type: ReportType) { setActive(type); }
  function closeReport() {
    focusBackPending.current = active;
    setActive(null);
  }
  useEffect(() => { if (active) headingRef.current?.focus(); }, [active]);
  useEffect(() => {
    if (active || !focusBackPending.current) return;
    const type = focusBackPending.current; focusBackPending.current = null;
    const el = cardButtons.current[type];
    if (el && el.isConnected) el.focus();
  }, [active]);

  const visibleGroups = GROUPS.filter(g => category === "all" || g.key === category);

  if (!active) {
    return (
      <section className="eb-reports-hub" aria-label="مركز التقارير">
        <div className="eb-chip-group eb-reports-categories" role="group" aria-label="تصنيف التقارير">
          {CATEGORIES.map(c => <button key={c.key} type="button" className="eb-chip-button" aria-pressed={category === c.key} onClick={() => setCategory(c.key)}>{c.label}</button>)}
        </div>
        {optsError && <ErrorState text={optsError} onRetry={() => setOptsNonce(n => n + 1)} />}
        {optsLoading && !opts && <LoadingState text="جارٍ تحميل بيانات التقارير..." />}
        {visibleGroups.map(g => {
          const cards = REPORT_CARDS.filter(c => c.category === g.key);
          const titleId = "eb-reports-group-" + g.key;
          return (
            <section key={g.key} className="eb-reports-group" aria-labelledby={titleId}>
              <div className="eb-reports-group-head"><h2 id={titleId} className="eb-subheading">{g.title}</h2><p className="eb-muted">{g.description}</p></div>
              <ul className="eb-report-cards">
                {cards.map(c => (
                  <li key={c.type} className="eb-report-card">
                    <span className="eb-report-card-icon" aria-hidden="true">{c.icon}</span>
                    <div className="eb-report-card-text"><h3 className="eb-report-card-title">{c.title}</h3><p className="eb-report-card-desc">{c.desc}</p></div>
                    <button type="button" className="eb-button is-primary is-small" ref={el => { cardButtons.current[c.type] = el; }} onClick={() => openReport(c.type)}>فتح التقرير<VisuallyHidden>{c.title}</VisuallyHidden></button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {!visibleGroups.length && <EmptyState compact title="لا توجد تقارير في هذا التصنيف." />}
      </section>
    );
  }

  const card = activeCard!;
  const timeAware = TIME_AWARE.includes(card.type);
  return (
    <section className="eb-report-workspace" aria-labelledby="eb-report-ws-title">
      <div className="eb-report-ws-head eb-report-noprint">
        <IconButton label="عودة إلى كل التقارير" icon={<IconChevronBack size={18} className="eb-flip-rtl" />} onClick={closeReport} />
        <div className="eb-report-ws-heading">
          <h2 id="eb-report-ws-title" className="eb-subheading" ref={headingRef} tabIndex={-1}>{card.title}</h2>
          <p className="eb-muted">{card.desc}</p>
        </div>
      </div>
      <p className="eb-report-print-title">{card.title}</p>
      <div className="eb-report-filters eb-report-noprint" role="region" aria-label="مرشحات التقرير">
        <div className="eb-report-filter-row">
          <label className="eb-field-inline">السنة الدراسية
            <select value={filters.schoolYear} onChange={e => setFilters(f => ({ ...f, schoolYear: e.target.value, classId: "", studentId: "" }))}>
              <option value="">كل السنوات</option>
              {opts?.schoolYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {needs("project") && (
            <label className="eb-field-inline">المشروع
              <select value={filters.projectCode} onChange={e => setFilters(f => ({ ...f, projectCode: e.target.value, classId: "", studentId: "" }))}>
                <option value="">اختر مشروعًا</option>
                {opts?.projects.map(p => <option key={p.projectCode} value={p.projectCode}>{p.title}</option>)}
              </select>
            </label>
          )}
          <label className="eb-field-inline">الصف
            <select value={filters.classId} onChange={e => setFilters(f => ({ ...f, classId: e.target.value, studentId: "" }))}>
              <option value="">اختر صفًا</option>
              {classChoices.map(c => <option key={c.classId} value={c.classId}>{c.name} — {c.schoolYear}{c.status === "archived" ? " (مؤرشف)" : ""}</option>)}
            </select>
          </label>
          {needs("student") && (
            <label className="eb-field-inline">الطالب
              <select value={filters.studentId} onChange={e => setFilters(f => ({ ...f, studentId: e.target.value }))} disabled={!filters.classId}>
                <option value="">اختر طالبًا</option>
                {students.map(s => <option key={s.studentId} value={s.studentId}>{s.displayName}</option>)}
              </select>
            </label>
          )}
          {card.type === "timeline" && (
            <label className="eb-field-inline">طالب (اختياري)
              <select value={filters.studentId} onChange={e => setFilters(f => ({ ...f, studentId: e.target.value }))} disabled={!filters.classId}>
                <option value="">الصف كامل</option>
                {students.map(s => <option key={s.studentId} value={s.studentId}>{s.displayName}</option>)}
              </select>
            </label>
          )}
        </div>
        {timeAware && (
          <div className="eb-report-filter-row" role="group" aria-label="خيارات الفترة الزمنية">
            <label className="eb-field-inline">الفترة الزمنية
              <select value={period} onChange={e => applyPeriod(e.target.value as Period)}>
                {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            {period === "custom" && (
              <>
                <label className="eb-field-inline">من<input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} /></label>
                <label className="eb-field-inline">إلى<input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} /></label>
              </>
            )}
          </div>
        )}
      </div>
      <Suspense fallback={<LoadingState />}>
        <ReportView type={card.type} token={token} filters={filters} onOpenProject={onOpenProject} />
      </Suspense>
    </section>
  );
}
