import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler, type ChartOptions } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { reportGet } from "./api";
import { ReportShell, ReportKpiGrid, ReportTable, LoadingState, ErrorState, EmptyState, pct } from "./ui";
import { downloadCsv } from "./csv";
import { resolveTrack } from "./trackState";
import ProjectAnalytics from "../projects/ProjectAnalytics";
import { trackerPost } from "../projects/api";
import type { TrackMeta } from "../projects/types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

export type ReportType = "class" | "student" | "assignments" | "project" | "track" | "ready" | "delayed" | "timeline";
export type Filters = { schoolYear: string; classId: string; studentId: string; projectCode: string; track: string; from: string; to: string };

// Adds date-range params (from/to) to a report request when present.
function withRange(params: Record<string, string>, f: Filters): Record<string, string> {
  const out = { ...params };
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  return out;
}

// Small data hook: fetches a report whenever its params change; exposes a retry (reload).
function useReport<T>(token: string, params: Record<string, string> | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const key = params ? JSON.stringify(params) : "";
  useEffect(() => {
    if (!params) { setData(null); setError(""); return; }
    let cancelled = false;
    setLoading(true); setError("");
    reportGet<T>(token, params).then(r => { if (!cancelled) setData(r); }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "تعذر تجهيز التقرير."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, key, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, error, reload: () => setNonce(n => n + 1) };
}

const barOptions: ChartOptions<"bar"> = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, labels: { font: { family: "inherit" } } }, tooltip: { rtl: true } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } };

/* ---------------- Academic ---------------- */

function ClassReport({ token, filters }: { token: string; filters: Filters }) {
  type Resp = { class: { name: string; schoolYear: string; status: string; studentCount: number }; kpis: { assignments: number; averageScore: number | null; submissionRate: number }; project: { tracks: TrackMeta[]; avgOverall: number; trackAverages: Record<string, number>; completedCount: number } | null };
  const { data, loading, error, reload } = useReport<Resp>(token, filters.classId ? withRange({ type: "class", classId: filters.classId }, filters) : null);
  if (!filters.classId) return <EmptyState text="اختر صفًا لعرض تقريره." />;
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data) return null;
  const kpis: { label: string; value: ReactNode; hint?: string }[] = [
    { label: "الحالة", value: data.class.status === "archived" ? "مؤرشف" : "نشط" },
    { label: "عدد الطلاب", value: data.class.studentCount },
    { label: "عدد الواجبات", value: data.kpis.assignments },
    { label: "متوسط العلامات", value: pct(data.kpis.averageScore) },
    { label: "نسبة التسليم", value: pct(data.kpis.submissionRate) }
  ];
  if (data.project) {
    kpis.push({ label: "تقدّم المشروع العام", value: pct(data.project.avgOverall) });
    for (const t of data.project.tracks) kpis.push({ label: "مشروع · " + t.title, value: pct(data.project.trackAverages[t.trackId] || 0) });
  }
  return (
    <ReportShell title={"تقرير الصف — " + data.class.name} subtitle={data.class.schoolYear}
      onExportCsv={() => downloadCsv("class-" + data.class.name, [["المؤشر", "القيمة"], ...kpis.map(k => [k.label, String(k.value)])])}>
      <ReportKpiGrid items={kpis} />
      {data.project && <p className="report-hint">بيانات التقييمات حسب الفترة المختارة؛ بيانات المشروع تمثل الوضع الحالي.</p>}
    </ReportShell>
  );
}

function StudentReport({ token, filters }: { token: string; filters: Filters }) {
  type Resp = { student: { displayName: string; className: string; schoolYear: string }; academic: { average: number | null; submittedCount: number; assessmentCount: number; submissionRate: number }; project: { tracks: TrackMeta[]; summary: { overallProgress: number; trackProgress: Record<string, number>; counts: Record<string, number>; complete: boolean }; lastActivity: string; balance: { leadingTrackTitle: string; laggingTrackTitle: string; diff: number } | null } | null };
  const { data, loading, error, reload } = useReport<Resp>(token, filters.studentId ? withRange({ type: "student", studentId: filters.studentId }, filters) : null);
  if (!filters.studentId) return <EmptyState text="اختر طالبًا لعرض تقريره." />;
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data) return null;
  const kpis: { label: string; value: ReactNode; hint?: string }[] = [
    { label: "الصف", value: data.student.className || "—" },
    { label: "متوسط التقييمات", value: pct(data.academic.average) },
    { label: "المسلَّمة", value: data.academic.submittedCount + " / " + data.academic.assessmentCount },
    { label: "نسبة التسليم", value: pct(data.academic.submissionRate) }
  ];
  if (data.project) {
    kpis.push({ label: "تقدّم المشروع", value: pct(data.project.summary.overallProgress) });
    for (const t of data.project.tracks) kpis.push({ label: t.title, value: pct(data.project.summary.trackProgress[t.trackId] || 0) });
    kpis.push({ label: "✅ معتمدة", value: data.project.summary.counts.approved });
    kpis.push({ label: "🔵 جاهزة للفحص", value: data.project.summary.counts.ready_for_review });
  }
  return (
    <ReportShell title={"تقرير الطالب — " + data.student.displayName} subtitle={data.student.className + " · " + data.student.schoolYear}
      onExportCsv={() => downloadCsv("student-" + data.student.displayName, [["المؤشر", "القيمة"], ...kpis.map(k => [k.label, String(k.value)])])}>
      <ReportKpiGrid items={kpis} />
      {data.project && <p className="report-hint">متوسط التقييمات حسب الفترة المختارة؛ بيانات المشروع تمثل الوضع الحالي.</p>}
      {data.project && data.project.balance && <div className="platform-warning">⚠ {data.project.balance.leadingTrackTitle} متقدّم على {data.project.balance.laggingTrackTitle} بـ {data.project.balance.diff}%</div>}
    </ReportShell>
  );
}

function AssignmentsReport({ token, filters }: { token: string; filters: Filters }) {
  type Row = { assignmentId: string; title: string; students: number; submitted: number; missing: number; zeroScores: number; submissionRate: number; average: number | null; avgAttempts: number };
  type Cell = { studentId: string; state: string; percentage: number | null };
  type Resp = { class: { name: string }; students: { studentId: string; displayName: string }[]; overall: { assessmentCount: number; participants: number; average: number | null; submissionRate: number; distribution: Record<string, number> }; perAssignment: Row[]; matrix: { assignmentId: string; title: string; cells: Cell[] }[] };
  const { data, loading, error, reload } = useReport<Resp>(token, filters.classId ? withRange({ type: "assignments", classId: filters.classId }, filters) : null);
  const dist = useMemo(() => data && ({ labels: Object.keys(data.overall.distribution), datasets: [{ label: "عدد التسليمات", data: Object.values(data.overall.distribution), backgroundColor: "rgba(37,99,235,.82)", borderRadius: 6 }] }), [data]);
  if (!filters.classId) return <EmptyState text="اختر صفًا." />;
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <ReportShell title={"التقييمات والواجبات — " + data.class.name}
      onExportCsv={() => downloadCsv("assessments-" + data.class.name, [["التقييم", "الطلاب", "مُسلَّم", "غير مسلَّم", "صفر", "نسبة التسليم", "المتوسط", "متوسط المحاولات"], ...data.perAssignment.map(r => [r.title, r.students, r.submitted, r.missing, r.zeroScores, r.submissionRate, r.average ?? "", r.avgAttempts])])}>
      <ReportKpiGrid items={[
        { label: "عدد التقييمات", value: data.overall.assessmentCount },
        { label: "التسليمات", value: data.overall.participants },
        { label: "متوسط العلامات", value: pct(data.overall.average) },
        { label: "نسبة التسليم", value: pct(data.overall.submissionRate) }
      ]} />
      <section className="platform-card"><h3>توزيع الدرجات</h3><div className="report-chart">{dist && <Bar data={dist} options={barOptions} />}</div></section>
      <ReportTable columns={[
        { key: "title", label: "الواجب" }, { key: "submissionRate", label: "نسبة التسليم", render: r => pct(r.submissionRate) },
        { key: "submitted", label: "مُسلَّم" }, { key: "missing", label: "غير مسلَّم" }, { key: "zeroScores", label: "صفر (مُسلَّم)" },
        { key: "average", label: "المتوسط", render: r => pct(r.average) }, { key: "avgAttempts", label: "متوسط المحاولات" }
      ]} rows={data.perAssignment} empty="لا توجد واجبات." />
      {data.matrix.length > 0 && (
        <section className="platform-card">
          <h3>مصفوفة الطالب × الواجب</h3>
          <div className="report-table-scroll">
            <table className="report-table"><thead><tr><th>الطالب</th>{data.matrix.map(m => <th key={m.assignmentId} title={m.title}>{m.title}</th>)}</tr></thead>
              <tbody>
                {data.students.map(stu => (
                  <tr key={stu.studentId}><th>{stu.displayName}</th>
                    {data.matrix.map(m => {
                      const cell = m.cells.find(c => c.studentId === stu.studentId);
                      if (!cell || cell.state === "missing") return <td key={m.assignmentId}><span className="report-matrix-cell report-matrix-missing" title="لم يسلّم">—</span></td>;
                      const zero = cell.percentage === 0;
                      return <td key={m.assignmentId}><span className={"report-matrix-cell " + (zero ? "report-matrix-zero" : "report-matrix-ok")}>{Math.round(cell.percentage || 0)}</span></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small className="p794-muted">🟥 لم يسلّم (مفقود) · 🟨 سلّم بعلامة صفر · 🟩 سلّم</small>
        </section>
      )}
    </ReportShell>
  );
}

/* ---------------- Project (generic) ---------------- */

function ProjectReport({ token, filters }: { token: string; filters: Filters }) {
  type Resp = { tracks: TrackMeta[]; class: { name: string }; summary: { avgOverall: number; trackAverages: Record<string, number>; completedCount: number; studentsReadyForReview: number; staleCount: number; studentCount: number } };
  const params = filters.projectCode && filters.classId ? { type: "project", projectCode: filters.projectCode, classId: filters.classId } : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." />;
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data) return null;
  const kpis: { label: string; value: ReactNode; hint?: string }[] = [
    { label: "عدد الطلاب", value: data.summary.studentCount },
    { label: "التقدم العام", value: pct(data.summary.avgOverall) },
    ...data.tracks.map(t => ({ label: t.title, value: pct(data.summary.trackAverages[t.trackId] || 0) })),
    { label: "✅ مكتملون", value: data.summary.completedCount },
    { label: "🔵 ينتظرون الفحص", value: data.summary.studentsReadyForReview },
    { label: "⚠ متأخرون", value: data.summary.staleCount }
  ];
  return (
    <ReportShell title={"تقرير المشروع — " + data.class.name} subtitle={"مشروع " + filters.projectCode}
      onExportCsv={() => downloadCsv("project-" + filters.projectCode + "-" + data.class.name, [["المؤشر", "القيمة"], ...kpis.map(k => [k.label, String(k.value)])])}>
      <ReportKpiGrid items={kpis} />
      <ProjectAnalytics token={token} projectCode={filters.projectCode} classId={filters.classId} tracks={data.tracks} />
    </ReportShell>
  );
}

function TrackReport({ token, filters }: { token: string; filters: Filters }) {
  type Row = { stageId: string; title: string; approved: number; ready_for_review: number; in_progress: number; not_started: number; approvedPct: number };
  type Resp = { tracks: TrackMeta[]; track: string; groups: { groupId: string; title: string }[]; class: { name: string }; rows: Row[] };
  const [track, setTrack] = useState("");
  const [groupId, setGroupId] = useState("");
  // Reset the track/group when the project or class changes, so a stale track from another project
  // (e.g. "access") never carries over to a project that doesn't have it.
  useEffect(() => { setTrack(""); setGroupId(""); }, [filters.projectCode, filters.classId]);
  const params = filters.projectCode && filters.classId ? { type: "track", projectCode: filters.projectCode, classId: filters.classId, ...(track ? { track } : {}), ...(groupId ? { groupId } : {}) } : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  // Keep the current track only if it exists in the data; otherwise fall back to the server default.
  useEffect(() => {
    if (data) { const valid = resolveTrack(track, data.tracks.map(t => t.trackId), data.track); if (valid !== track) setTrack(valid); }
  }, [data, track]);
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." />;
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <ReportShell title={"تقرير المسار — " + data.class.name}
      onExportCsv={() => downloadCsv("track-" + data.track + "-" + data.class.name, [["المرحلة", "العنوان", "معتمد", "جاهز", "قيد التنفيذ", "لم يبدأ", "نسبة الاعتماد"], ...data.rows.map(r => [r.stageId, r.title, r.approved, r.ready_for_review, r.in_progress, r.not_started, r.approvedPct])])}>
      <div className="report-filters report-noprint">
        <label>المسار<select value={track} onChange={e => { setTrack(e.target.value); setGroupId(""); }}>{data.tracks.map(t => <option key={t.trackId} value={t.trackId}>{t.title}</option>)}</select></label>
        <label>المجموعة<select value={groupId} onChange={e => setGroupId(e.target.value)}><option value="">الكل</option>{data.groups.map(g => <option key={g.groupId} value={g.groupId}>{g.title}</option>)}</select></label>
      </div>
      <ReportTable columns={[
        { key: "stageId", label: "المرحلة" }, { key: "title", label: "العنوان" },
        { key: "approved", label: "✅ معتمد" }, { key: "ready_for_review", label: "🔵 جاهز" },
        { key: "in_progress", label: "🟡 قيد التنفيذ" }, { key: "not_started", label: "⬜ لم يبدأ" },
        { key: "approvedPct", label: "نسبة الاعتماد", render: r => pct(r.approvedPct) }
      ]} rows={data.rows} empty="لا توجد مراحل." />
    </ReportShell>
  );
}

function ReadyReport({ token, filters }: { token: string; filters: Filters }) {
  type Resp = { tracks: TrackMeta[]; class: { name: string; status: string }; students: { studentId: string; displayName: string; stages: { stageId: string; title: string; track: string }[] }[]; totalReady: number };
  const params = filters.projectCode && filters.classId ? { type: "ready", projectCode: filters.projectCode, classId: filters.classId } : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  const [local, setLocal] = useState<Resp | null>(null);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  useEffect(() => { setLocal(data); setActionError(""); }, [data]);
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." />;
  if (loading && !local) return <LoadingState />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!local) return null;

  const readOnly = local.class.status === "archived";

  async function approve(studentId: string, stageId: string) {
    setBusy(studentId + stageId); setActionError("");
    try {
      // Reuses the existing progress.update/approve API — no second approval path.
      await trackerPost(token, filters.projectCode, { action: "progress.update", classId: filters.classId, studentId, stageId, status: "approved" });
      setLocal(prev => prev ? {
        ...prev,
        totalReady: Math.max(0, prev.totalReady - 1),
        students: prev.students.map(s => s.studentId === studentId ? { ...s, stages: s.stages.filter(st => st.stageId !== stageId) } : s).filter(s => s.stages.length)
      } : prev);
    } catch (e) { setActionError(e instanceof Error ? e.message : "تعذر اعتماد المرحلة."); }
    finally { setBusy(""); }
  }

  return (
    <ReportShell title={"جاهز للفحص — " + local.class.name} subtitle={local.totalReady + " مرحلة بانتظار الفحص"}
      onExportCsv={() => downloadCsv("ready-" + filters.projectCode + "-" + local.class.name, [["الطالب", "المرحلة", "العنوان"], ...local.students.flatMap(s => s.stages.map(st => [s.displayName, st.stageId, st.title]))])}>
      {readOnly && <div className="platform-warning">🔒 الصف مؤرشف — التقرير للقراءة فقط.</div>}
      {actionError && <div className="platform-error">{actionError}</div>}
      {!local.students.length ? <EmptyState text="لا توجد مراحل بانتظار الفحص." /> : local.students.map(s => (
        <section key={s.studentId} className="platform-card">
          <h3>{s.displayName}</h3>
          <ReportTable columns={[
            { key: "stageId", label: "المرحلة" }, { key: "title", label: "العنوان" },
            ...(readOnly ? [] : [{ key: "act", label: "", render: (r: { stageId: string }) => <button className="platform-primary report-noprint" disabled={busy === s.studentId + r.stageId} onClick={() => void approve(s.studentId, r.stageId)}>✅ اعتماد</button> }])
          ]} rows={s.stages} />
        </section>
      ))}
    </ReportShell>
  );
}

function DelayedReport({ token, filters }: { token: string; filters: Filters }) {
  type Row = { studentId: string; displayName: string; overall: number; trackProgress: Record<string, number>; updatedAt: string; reasons: string[] };
  type Resp = { tracks: TrackMeta[]; lateThreshold: number; class: { name: string }; students: Row[] };
  const params = filters.projectCode && filters.classId ? { type: "delayed", projectCode: filters.projectCode, classId: filters.classId } : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." />;
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data) return null;
  const cols = [
    { key: "displayName", label: "الطالب" },
    { key: "overall", label: "التقدم العام", render: (r: Row) => pct(r.overall) },
    ...data.tracks.map(t => ({ key: t.trackId, label: t.title, render: (r: Row) => pct(r.trackProgress[t.trackId] || 0) })),
    { key: "updatedAt", label: "آخر تحديث", render: (r: Row) => r.updatedAt ? new Date(r.updatedAt).toLocaleDateString("ar") : "—" },
    { key: "reasons", label: "السبب", render: (r: Row) => r.reasons.join("، ") }
  ];
  return (
    <ReportShell title={"المتأخرون — " + data.class.name} subtitle={"عتبة التأخّر: " + data.lateThreshold + "%"}
      onExportCsv={() => downloadCsv("delayed-" + filters.projectCode + "-" + data.class.name, [["الطالب", "التقدم العام", ...data.tracks.map(t => t.title), "آخر تحديث", "السبب"], ...data.students.map(r => [r.displayName, r.overall, ...data.tracks.map(t => r.trackProgress[t.trackId] || 0), r.updatedAt, r.reasons.join("؛ ")])])}>
      <ReportTable columns={cols} rows={data.students} empty="لا يوجد طلاب متأخرون." />
    </ReportShell>
  );
}

function TimelineReport({ token, filters }: { token: string; filters: Filters }) {
  type Resp = { class: { name: string }; scope: string; trend: { weekStart: string; avgOverall: number }[] };
  const params = filters.projectCode && filters.classId ? withRange({ type: "timeline", projectCode: filters.projectCode, classId: filters.classId, ...(filters.studentId ? { studentId: filters.studentId } : {}) }, filters) : null;
  const { data, loading, error, reload } = useReport<Resp>(token, params);
  const chart = useMemo(() => data && ({ labels: data.trend.map(t => t.weekStart), datasets: [{ label: "متوسط التقدّم", data: data.trend.map(t => t.avgOverall), borderColor: "#2563eb", backgroundColor: "rgba(37,99,235,.14)", fill: true, tension: .3 }] }), [data]);
  if (!params) return <EmptyState text="اختر مشروعًا وصفًا." />;
  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <ReportShell title={"التقدم الزمني — " + data.class.name} subtitle={data.scope === "student" ? "طالب محدد" : "الصف كامل"}
      onExportCsv={() => downloadCsv("timeline-" + filters.projectCode + "-" + data.class.name, [["الأسبوع", "متوسط التقدّم"], ...data.trend.map(t => [t.weekStart, t.avgOverall])])}>
      {data.trend.length ? <section className="platform-card"><div className="report-chart">{chart && <Line data={chart} options={barOptions as unknown as ChartOptions<"line">} />}</div></section> : <EmptyState text="لا توجد بيانات زمنية كافية بعد." />}
    </ReportShell>
  );
}

export default function ReportView({ type, token, filters }: { type: ReportType; token: string; filters: Filters }) {
  switch (type) {
    case "class": return <ClassReport token={token} filters={filters} />;
    case "student": return <StudentReport token={token} filters={filters} />;
    case "assignments": return <AssignmentsReport token={token} filters={filters} />;
    case "project": return <ProjectReport token={token} filters={filters} />;
    case "track": return <TrackReport token={token} filters={filters} />;
    case "ready": return <ReadyReport token={token} filters={filters} />;
    case "delayed": return <DelayedReport token={token} filters={filters} />;
    case "timeline": return <TimelineReport token={token} filters={filters} />;
    default: return <EmptyState />;
  }
}
