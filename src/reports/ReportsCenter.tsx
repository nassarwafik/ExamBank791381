import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { lazyWithRetry } from "../lazyWithRetry";
import { reportGet, isAbortError, isSessionExpired } from "./api";
import { ReportSessionContext } from "./session";
import { LoadingState, ErrorState } from "./ui";
import type { ReportType, Filters } from "./ReportViews";
import { rangeForPeriod, type Period } from "./period";
import { getClassProgramCodes } from "../projects/classPrograms";
import EmptyState from "../ui/EmptyState";
import IconButton from "../ui/IconButton";
import VisuallyHidden from "../ui/VisuallyHidden";
import { IconChevronBack } from "../icons";
import { REPORT_CARDS, CATEGORIES, GROUPS, PERIODS, TIME_AWARE, type Category, type Need } from "./catalog";
import { periodContext, type ExportContext } from "./reportExport";
import "../reports-pro.css";

// The report views (with Chart.js) are code-split so the charts only load when a report is opened.
const ReportView = lazy(lazyWithRetry(() => import("./ReportViews"), "teacher-report-views"));   // Phase 11D — one-shot deploy recovery

type ClassOpt = { classId: string; name: string; schoolYear: string; status: string; programCodes: string[] };
type ProjectOpt = { projectCode: string; title: string };
type FiltersResp = { schoolYears: string[]; classes: ClassOpt[]; projects: ProjectOpt[] };

// Phase R-2 — the custom range is applied after a short pause (no request for a half-typed date) and only when valid.
const CUSTOM_RANGE_DELAY_MS = 400;
const INVERTED_RANGE_TEXT = "لا يمكن أن يكون تاريخ «من» بعد تاريخ «إلى».";
const errorMessage = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/**
 * Reports Center (UX-6b): Hub (categories → grouped report cards) → report workspace (back, compact identity,
 * only the relevant filters, result). ReportsCenter owns every filter/state decision; the API semantics
 * (report types, query parameters, period meaning) are unchanged. The shell owns the page title (no hero).
 * Phase R-2: an authoritative 401 calls the shell's onSessionExpired (like TeacherPlatform); the filter options and the
 * student list each show their own loading / error / retry; a superseded request is aborted.
 */
export default function ReportsCenter({ token, onOpenProject, onSessionExpired }: { token: string; onOpenProject?: (projectCode: string) => void; onSessionExpired?: () => void }) {
  const [opts, setOpts] = useState<FiltersResp | null>(null);
  const [active, setActive] = useState<ReportType | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [filters, setFilters] = useState<Filters>({ schoolYear: "", classId: "", studentId: "", projectCode: "", track: "", from: "", to: "" });
  const [period, setPeriod] = useState<Period>("all");
  const [studentsFor, setStudentsFor] = useState<{ classId: string; list: { studentId: string; displayName: string }[]; error: string; nonce: number }>({ classId: "", list: [], error: "", nonce: 0 });
  const [studentsNonce, setStudentsNonce] = useState(0);
  // The custom range as typed; it reaches `filters` (and so the request) only when valid, after CUSTOM_RANGE_DELAY_MS.
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [optsLoading, setOptsLoading] = useState(false);
  const [optsError, setOptsError] = useState("");
  const [optsNonce, setOptsNonce] = useState(0);
  // The hub unmounts while a report is open, so "back" focuses the (re-rendered) card button of that report type.
  const cardButtons = useRef<Partial<Record<ReportType, HTMLButtonElement | null>>>({});
  const focusBackPending = useRef<ReportType | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setOptsLoading(true); setOptsError("");
    reportGet<FiltersResp>(token, { type: "filters" }, controller.signal)
      .then(r => { if (!cancelled) setOpts(r); })
      .catch(e => {
        if (cancelled || isAbortError(e)) return;
        if (isSessionExpired(e)) onSessionExpired?.();
        setOptsError(errorMessage(e, "تعذر تحميل بيانات التقارير."));
      })
      .finally(() => { if (!cancelled) setOptsLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [token, optsNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Period -> concrete from/to (YYYY-MM-DD). "all" carries no date bound (reports are already class-scoped and a
  // class maps to exactly one schoolYear; schoolYear strings are NOT converted to invented date boundaries).
  // "custom" keeps the user-entered dates.
  function applyPeriod(p: Period) {
    setPeriod(p);
    if (p === "custom") { setCustomRange({ from: filters.from, to: filters.to }); return; } // start from the current bounds
    const { from, to } = rangeForPeriod(p);
    setFilters(f => ({ ...f, from, to }));
  }
  // Phase R-2 — an inverted custom range is refused locally (inline alert, no request); a valid one is applied after a pause.
  const rangeInverted = period === "custom" && !!customRange.from && !!customRange.to && customRange.from > customRange.to;
  useEffect(() => {
    if (period !== "custom" || rangeInverted) return;
    if (customRange.from === filters.from && customRange.to === filters.to) return;
    const id = setTimeout(() => setFilters(f => ({ ...f, from: customRange.from, to: customRange.to })), CUSTOM_RANGE_DELAY_MS);
    return () => clearTimeout(id);
  }, [period, rangeInverted, customRange.from, customRange.to, filters.from, filters.to]);

  const activeCard = REPORT_CARDS.find(c => c.type === active) || null;
  const needs = (k: Need) => !!activeCard?.needs.includes(k);
  // Only the student report and the timeline's optional student consume the class's student list.
  const needsStudentList = active === "student" || active === "timeline";

  // Load students only when the open report consumes them and a class is chosen; a late response for an
  // older class is dropped (cancelled + aborted) and the exposed list is keyed by class so it is never stale.
  // Phase R-2: a failure is kept (with the attempt's nonce) and shown with a retry — never an empty dropdown.
  useEffect(() => {
    if (!needsStudentList || !filters.classId) return;
    const classId = filters.classId;
    if (studentsFor.classId === classId && studentsFor.nonce === studentsNonce) return;   // already loaded / failed for this attempt
    let cancelled = false;
    const controller = new AbortController();
    const nonce = studentsNonce;
    reportGet<{ students: { studentId: string; displayName: string }[] }>(token, { type: "classStudents", classId }, controller.signal)
      .then(r => { if (!cancelled) setStudentsFor({ classId, list: r.students || [], error: "", nonce }); })
      .catch(e => {
        if (cancelled || isAbortError(e)) return;
        if (isSessionExpired(e)) onSessionExpired?.();
        setStudentsFor({ classId, list: [], error: errorMessage(e, "تعذر تحميل قائمة الطلاب."), nonce });
      });
    return () => { cancelled = true; controller.abort(); };
  }, [token, filters.classId, needsStudentList, studentsFor.classId, studentsFor.nonce, studentsNonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const studentsCurrent = !!filters.classId && studentsFor.classId === filters.classId && studentsFor.nonce === studentsNonce;
  const students = studentsCurrent ? studentsFor.list : [];
  const studentsLoading = needsStudentList && !!filters.classId && !studentsCurrent;
  const studentsError = studentsCurrent ? studentsFor.error : "";

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
  // Phase R-4 — what an export says about its surroundings: the applied period (words + dates) and the project's title.
  const exportContext: ExportContext = {
    ...(timeAware ? periodContext(period, filters.from, filters.to, Object.fromEntries(PERIODS.map(p => [p.key, p.label]))) : { periodLabel: "", periodTag: "" }),
    projectTitle: opts?.projects.find(p => p.projectCode === filters.projectCode)?.title
  };
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
        {optsError && <ErrorState text={optsError} onRetry={() => setOptsNonce(n => n + 1)} />}
        {optsLoading && !opts && <LoadingState text="جارٍ تحميل خيارات التصفية..." />}
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
              <select value={filters.studentId} onChange={e => setFilters(f => ({ ...f, studentId: e.target.value }))} disabled={!filters.classId || studentsLoading} aria-busy={studentsLoading || undefined}>
                <option value="">{studentsLoading ? "جارٍ تحميل الطلاب..." : "اختر طالبًا"}</option>
                {students.map(s => <option key={s.studentId} value={s.studentId}>{s.displayName}</option>)}
              </select>
            </label>
          )}
          {card.type === "timeline" && (
            <label className="eb-field-inline">طالب (اختياري)
              <select value={filters.studentId} onChange={e => setFilters(f => ({ ...f, studentId: e.target.value }))} disabled={!filters.classId || studentsLoading} aria-busy={studentsLoading || undefined}>
                <option value="">{studentsLoading ? "جارٍ تحميل الطلاب..." : "الصف كامل"}</option>
                {students.map(s => <option key={s.studentId} value={s.studentId}>{s.displayName}</option>)}
              </select>
            </label>
          )}
        </div>
        {studentsError && <ErrorState text={"تعذر تحميل قائمة الطلاب: " + studentsError} onRetry={() => setStudentsNonce(n => n + 1)} />}
        {timeAware && (
          <div className="eb-report-filter-row" role="group" aria-label="خيارات الفترة الزمنية">
            <label className="eb-field-inline">الفترة الزمنية
              <select value={period} onChange={e => applyPeriod(e.target.value as Period)}>
                {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
            {period === "custom" && (
              <>
                <label className="eb-field-inline">من<input type="date" value={customRange.from} max={customRange.to || undefined} aria-invalid={rangeInverted || undefined} aria-describedby={rangeInverted ? "eb-report-range-error" : undefined} onChange={e => { const from = e.target.value; setCustomRange(r => ({ ...r, from })); }} /></label>
                <label className="eb-field-inline">إلى<input type="date" value={customRange.to} min={customRange.from || undefined} aria-invalid={rangeInverted || undefined} aria-describedby={rangeInverted ? "eb-report-range-error" : undefined} onChange={e => { const to = e.target.value; setCustomRange(r => ({ ...r, to })); }} /></label>
              </>
            )}
          </div>
        )}
        {rangeInverted && <p id="eb-report-range-error" className="platform-error assignment-inline-message" role="alert">{INVERTED_RANGE_TEXT}</p>}
      </div>
      <ReportSessionContext.Provider value={onSessionExpired}>
        <Suspense fallback={<LoadingState />}>
          <ReportView type={card.type} token={token} filters={filters} exportContext={exportContext} onOpenProject={onOpenProject} />
        </Suspense>
      </ReportSessionContext.Provider>
    </section>
  );
}
