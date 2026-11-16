import { useEffect, useRef, useState } from "react";
import { IconWarning, IconRefresh, IconChevronBack, IconPrint } from "../icons";
import KpiStrip from "../ui/KpiStrip";
import { ownerDashboardApi, type OwnerTeacherDashboard as Dashboard, type DashboardStudent } from "./ownerApi";
import { DashboardCharts } from "./OwnerDashboardCharts";
import { RANGES, rangeFrom, pct, type RangeKey } from "./ownerDashboardFormat";
import "./ownerDashboard.css";

/**
 * Owner Console — «لوحة البيانات» of one teacher, full screen (`#/owner/teachers/<accountId>/dashboard`; its own lazy chunk).
 * Phase 2: the page, its filters (class, period), the headline figures, the classes and the written insights. Phase 3: the charts
 * (OwnerDashboardCharts), the students who need follow-up and the most improved, one student's detail (a name opens it), printing. The figures are the teacher's own «لوحة المتابعة» (GET /api/owner-teacher-dashboard: owner only, read only, every view
 * recorded in the owner's audit log). A 401 signs out; any other refusal shows the server's message with «إعادة المحاولة».
 */

export default function OwnerTeacherDashboard({ token, accountId, onBack, onSignedOut, now }: {
  token: string; accountId: string; onBack: () => void; onSignedOut: () => void;
  /** Tests only — the clock the period filter reads. */
  now?: () => number;
}) {
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [range, setRange] = useState<RangeKey>("all");
  const [nonce, setNonce] = useState(0);
  // the last answer stays on screen while a filter reloads (the class list keeps its choices); an error replaces it
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  // every change of what is asked (class, period, retry) shows the loading line until the answer arrives
  const ask = (change: () => void) => { setLoading(true); setError(""); change(); };
  const [error, setError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const signedOut = useRef(onSignedOut);
  useEffect(() => { signedOut.current = onSignedOut; }, [onSignedOut]);

  useEffect(() => {
    let live = true;
    const from = rangeFrom(range, (now || Date.now)());
    void ownerDashboardApi.get(token, accountId, { classId, studentId, from }).then(r => {
      if (!live) return;
      setLoading(false);
      if (r.ok) setData(r.data);
      else if (r.status === 401) signedOut.current();
      else { setData(null); setError(r.error || "تعذر تحميل لوحة البيانات."); }
    });
    return () => { live = false; };
  }, [token, accountId, classId, studentId, range, nonce, now]);

  // a full-screen page: the title takes focus when it opens, Escape goes back
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onBack(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const k = data?.kpis;
  const teacherName = data?.teacher.displayName || "";
  const classes = data?.classes || [];
  const change = k ? Math.round(k.performanceChange * 10) / 10 : 0;
  // a class choice leaves any student; a student is always read within their class (the server's student scope)
  const pickClass = (id: string) => ask(() => { setClassId(id); setStudentId(""); });
  const pickStudent = (st: { userId: string; classId: string }) => ask(() => { setClassId(st.classId); setStudentId(st.userId); });
  const detail = data?.studentDetail || null;

  return (
    <div className="eb-owner-dash" dir="rtl">
      <header className="eb-owner-dash-bar">
        <button type="button" className="eb-owner-secondary eb-owner-dash-back" onClick={onBack}>→ المعلمون</button>
        <div className="eb-owner-dash-title">
          <h1 ref={heading} tabIndex={-1}>لوحة البيانات{teacherName ? <>: <bdi>{teacherName}</bdi></> : null}</h1>
          {data && <span className="eb-owner-dash-user" dir="ltr">{data.teacher.username}</span>}
        </div>
        {data && <button type="button" className="eb-owner-secondary eb-owner-dash-print" onClick={() => window.print()}><IconPrint size={16} aria-hidden="true" /> طباعة</button>}
      </header>

      <main className="eb-owner-dash-main">
        <div className="eb-owner-dash-filters" role="group" aria-label="تصفية لوحة البيانات">
          <label className="eb-owner-dash-field">
            <span>الصف</span>
            <select value={classId} onChange={e => pickClass(e.target.value)}>
              <option value="">كل الصفوف</option>
              {classes.map(c => <option key={c.classId} value={c.classId}>{c.name}{c.active ? "" : " (مؤرشف)"}</option>)}
            </select>
          </label>
          <div className="eb-owner-chips" role="group" aria-label="الفترة">
            {RANGES.map(r => (
              <button key={r.id} type="button" className={"eb-owner-chip" + (range === r.id ? " is-on" : "")} aria-pressed={range === r.id} onClick={() => ask(() => setRange(r.id))}>{r.label}</button>
            ))}
          </div>
        </div>

        {loading && <p className="eb-owner-hint" role="status">جارٍ تحميل لوحة البيانات…</p>}
        {error && (
          <div className="eb-owner-dash-error">
            <div className="auth-error" role="alert"><IconWarning size={16} aria-hidden="true" />{error}</div>
            <button type="button" className="eb-owner-secondary" onClick={() => ask(() => setNonce(n => n + 1))}><IconRefresh size={16} aria-hidden="true" /> إعادة المحاولة</button>
          </div>
        )}

        {data && k && !error && (
          <>
            {detail && (
              <div className="eb-owner-dash-student" role="region" aria-label={"تفاصيل الطالب " + detail.displayName}>
                <div>
                  <h2>الطالب: <bdi>{detail.displayName}</bdi></h2>
                  <p className="eb-owner-hint">{detail.className} · المعدل {pct(detail.average)} · أنجز {detail.completed} من {detail.assigned} · لم يسلّم {detail.missing} · {TREND[detail.trend]}</p>
                </div>
                <button type="button" className="eb-owner-secondary" onClick={() => pickClass(detail.classId)}>→ العودة إلى الصف</button>
              </div>
            )}
            <KpiStrip className="eb-owner-dash-kpis" label="المؤشرات الرئيسية" items={[
              { label: "الصفوف النشطة", value: k.activeClasses },
              { label: "الطلاب", value: k.activeStudents },
              { label: "الواجبات المنشورة", value: k.publishedAssignments },
              { label: "نسبة التسليم", value: pct(k.completionRate), hint: k.expectedSubmissions ? k.submissions + " من " + k.expectedSubmissions : undefined },
              { label: "المعدل العام", value: pct(k.average), hint: k.average !== null && change !== 0 ? (change > 0 ? "↑ " : "↓ ") + Math.abs(change) + "%" : undefined, trend: change > 0 ? "up" : change < 0 ? "down" : "flat" },
              { label: "بانتظار التصحيح", value: k.pendingReview },
              { label: "يحتاجون متابعة", value: k.followUpStudents },
              { label: "لم يدخلوا أبدًا", value: k.neverLogged }
            ]} />

            {data.classes.length > 0 && <DashboardCharts data={data} onPickClass={classId ? undefined : pickClass} />}

            {data.classes.length === 0 ? (
              <p className="eb-owner-hint eb-owner-dash-empty" role="status">لا توجد صفوف لهذا المعلم بعد. تظهر الأرقام هنا حين تُضاف صفوفه وطلابه.</p>
            ) : (
              <div className="eb-owner-dash-grid">
                <section className="eb-owner-dash-card" aria-labelledby="dash-insights">
                  <h2 id="dash-insights">ملاحظات</h2>
                  <ul className="eb-owner-dash-insights">
                    {data.insights.map((i, n) => (
                      <li key={n} className={"is-" + i.tone}><strong>{i.title}</strong><span>{i.text}</span></li>
                    ))}
                  </ul>
                </section>
                <section className="eb-owner-dash-card" aria-labelledby="dash-classes">
                  <h2 id="dash-classes">الصفوف</h2>
                  <table className="eb-owner-dash-table">
                    <caption className="eb-visually-hidden">صفوف المعلم</caption>
                    <thead><tr><th scope="col">الصف</th><th scope="col">الطبقة</th><th scope="col">الطلاب</th><th scope="col"><span className="eb-visually-hidden">فتح</span></th></tr></thead>
                    <tbody>
                      {data.classes.map(c => (
                        <tr key={c.classId} className={c.classId === classId ? "is-current" : ""}>
                          <th scope="row"><bdi>{c.name}</bdi>{c.active ? null : <small> (مؤرشف)</small>}</th>
                          <td>{c.grade || "—"}</td>
                          <td>{c.studentCount}</td>
                          <td>{c.classId !== classId && (
                            <button type="button" className="eb-owner-link" onClick={() => pickClass(c.classId)} aria-label={"عرض " + c.name}>
                              عرض <IconChevronBack size={14} aria-hidden="true" />
                            </button>
                          )}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}
            {!detail && (data.followUp.length > 0 || data.topImprovers.length > 0) && (
              <div className="eb-owner-dash-grid">
                <StudentList title="طلاب يحتاجون متابعة" id="dash-follow" items={data.followUp} reasons onPick={pickStudent} />
                <StudentList title="الأكثر تحسنًا" id="dash-improvers" items={data.topImprovers} onPick={pickStudent} />
              </div>
            )}
            <p className="eb-owner-hint eb-owner-dash-note">الأرقام نفسها التي يراها المعلم في «لوحة المتابعة». فتحك لهذه اللوحة يُسجَّل في سجل المالك.</p>
          </>
        )}
      </main>
    </div>
  );
}

const TREND: Record<DashboardStudent["trend"], string> = { improving: "يتحسن ↑", declining: "يتراجع ↓", stable: "مستقر →" };
const SEVERITY: Record<DashboardStudent["severity"], string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };

/** A list of students (follow-up or improvers): each name opens that student's detail (the server's student scope). */
function StudentList({ title, id, items, reasons = false, onPick }: { title: string; id: string; items: DashboardStudent[]; reasons?: boolean; onPick: (s: DashboardStudent) => void }) {
  return (
    <section className="eb-owner-dash-card" aria-labelledby={id}>
      <h2 id={id}>{title} <small className="eb-owner-muted">({items.length})</small></h2>
      {items.length === 0 ? <p className="eb-owner-hint">لا أحد حاليًا.</p> : (
        <div className="eb-owner-dash-scroll">
          <table className="eb-owner-dash-table">
            <caption className="eb-visually-hidden">{title}</caption>
            <thead><tr><th scope="col">الطالب</th><th scope="col">الصف</th><th scope="col">المعدل</th><th scope="col">التسليم</th><th scope="col">الاتجاه</th>{reasons && <th scope="col">السبب</th>}</tr></thead>
            <tbody>
              {items.map(st => (
                <tr key={st.userId} className={reasons ? "is-severity-" + st.severity : undefined}>
                  <th scope="row"><button type="button" className="eb-owner-link" onClick={() => onPick(st)} aria-label={"تفاصيل " + st.displayName}><bdi>{st.displayName}</bdi></button></th>
                  <td><bdi>{st.className}</bdi></td>
                  <td>{pct(st.average)}</td>
                  <td>{pct(st.completionRate)}<small className="eb-owner-muted"> ({st.completed}/{st.assigned})</small></td>
                  <td>{TREND[st.trend]}</td>
                  {reasons && <td><span className="eb-owner-dash-severity">{SEVERITY[st.severity]}</span> {st.reasons.join("، ")}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
