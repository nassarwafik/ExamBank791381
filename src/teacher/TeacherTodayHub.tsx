import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconMail, IconAssignments, IconStudents, IconReports, IconProjects, IconMedal, IconRefresh } from "../icons";
import SectionHeader from "../ui/SectionHeader";
import { useAutoRefresh } from "../ui/useAutoRefresh";
import type { TeacherNavId } from "../shell/teacherNav";
import "./teacherToday.css";

/**
 * Phase 9A — the teacher's Today Hub / Command Center: «ما الذي يحتاج انتباهي الآن؟». ONE read of the derived
 * GET /api/teacher-today summary (live attempts, not-started, pending review, unread messages, recent activity) —
 * attention cards first, quick actions into the EXISTING destinations (through the shell's navigation, never a
 * re-implementation), then a short recent-activity list. Silent refresh rides the shared hook (60s + focus /
 * visibility, single-flight, never while hidden); a refresh failure keeps the last-good summary, and a partial
 * source (messages) degrades only its own card. No charts, no new store.
 */
export type TeacherToday = {
  generatedAt: string;
  scope: { activeClasses: number; students: number; publishedAssignments: number };
  attention: {
    activeAttempts: { count: number; items: { assignmentId: string; title: string; className: string; studentId: string; studentName: string; startedAt: string; status: string }[] };
    notStarted: { count: number; assignments: number; items: { assignmentId: string; title: string; className: string; dueAt: string; notStarted: number; expected: number }[] };
    pendingReview: { count: number; assignments: number; items: { assignmentId: string; title: string; className: string; pendingReview: number }[] };
    unreadMessages: { total: number; capped: boolean } | null;
  };
  recent: { kind: string; at: string; assignmentId: string; title: string; className: string; studentId: string; studentName: string; percentage?: number | null }[];
  partial: string[];
};
type Props = { token: string; onNavigate?: (id: TeacherNavId) => void };

export const TEACHER_TODAY_REFRESH_MS = 60000;
const PREVIEW = 4;
const two = (n: number) => String(n).padStart(2, "0");
const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes()); };
const STATUS: Record<string, string> = { started: "جارية", draft: "جارية", paused: "متوقفة مؤقتًا" };
const KIND: Record<string, string> = { submitted: "سلّم", started: "بدأ محاولة", timedOut: "انتهى وقته", integrityExit: "خرج من الامتحان", teacherEnded: "أنهى المعلم محاولته" };

/** Validates the payload shape defensively: a malformed body is an error, never a crash or a fake zero-state. */
function parse(j: unknown): TeacherToday | null {
  const o = j as Partial<TeacherToday> | null;
  if (!o || typeof o !== "object" || !o.attention || !o.attention.activeAttempts || !o.attention.notStarted || !o.attention.pendingReview) return null;
  return { generatedAt: String(o.generatedAt || ""), scope: o.scope || { activeClasses: 0, students: 0, publishedAssignments: 0 }, attention: { ...o.attention, unreadMessages: o.attention.unreadMessages ?? null }, recent: Array.isArray(o.recent) ? o.recent : [], partial: Array.isArray(o.partial) ? o.partial : [] };
}

function Card({ id, title, count, tone, items, empty, actionLabel, onAction }: { id: string; title: string; count: number; tone: "danger" | "attention" | "info"; items: { key: string; label: string; meta: string }[]; empty: string; actionLabel: string; onAction?: () => void }) {
  const shown = items.slice(0, PREVIEW), rest = items.length - shown.length;
  let body: ReactNode;
  if (shown.length) body = <ul className="eb-attention-list">{shown.map(i => <li key={i.key} className="eb-today-row"><span className="eb-attention-item-label">{i.label}</span><span className="eb-attention-item-meta">{i.meta}</span></li>)}</ul>;
  else if (count === 0) body = <p className="eb-attention-empty">{empty}</p>;
  else body = <p className="eb-attention-partial">توجد {count} حالات؛ افتح القسم لعرضها.</p>;
  return (
    <article className={"eb-attention-card tone-" + tone} aria-labelledby={id}>
      <h3 id={id} className="eb-attention-title"><span>{title}</span><span className="eb-attention-count">{count}</span></h3>
      {body}
      {rest > 0 && <p className="eb-attention-more">و{rest} أخرى</p>}
      {onAction && <button type="button" className="eb-button is-quiet is-small eb-today-card-action" onClick={onAction}>{actionLabel}</button>}
    </article>
  );
}

export default function TeacherTodayHub({ token, onNavigate }: Props) {
  const [data, setData] = useState<TeacherToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function load({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) { setLoading(true); setError(""); }
    try {
      const r = await fetch("/api/teacher-today", { headers: { "x-builder-token": token, Authorization: "Bearer " + token } });
      const j = await r.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!alive.current) return;
      const parsed = r.ok && j && j.ok ? parse(j) : null;
      if (!parsed) throw new Error((j && j.error) || "تعذر تحميل ملخص اليوم حاليًا.");
      setData(parsed); setError("");
    } catch (e) { if (!alive.current) return; if (!silent) setError(e instanceof Error ? e.message : "تعذر تحميل ملخص اليوم حاليًا."); }
    finally { if (alive.current && !silent) setLoading(false); }
  }
  // The initial read starts in a microtask (the mounted state is already "loading"), so no state is set synchronously
  // inside the effect; a token change (new session) restarts from a clean read the same way.
  useEffect(() => { void Promise.resolve().then(() => load()); }, [token]);   // eslint-disable-line react-hooks/exhaustive-deps
  useAutoRefresh(() => load({ silent: true }), { intervalMs: TEACHER_TODAY_REFRESH_MS, enabled: !!data });

  const go = (id: TeacherNavId) => onNavigate?.(id);
  const scrollToFeed = () => { const el = document.getElementById("eb-achievements-title"); el?.scrollIntoView?.({ block: "start" }); el?.focus?.(); };
  const a = data?.attention;
  const total = a ? a.activeAttempts.count + a.notStarted.count + a.pendingReview.count + (a.unreadMessages ? a.unreadMessages.total : 0) : 0;
  const quiet = !!a && total === 0 && !a.unreadMessages?.total;

  return (
    <section className="eb-today-teacher" aria-labelledby="eb-today-title">
      <SectionHeader level={2} id="eb-today-title" title="ما الذي يحتاج انتباهي الآن؟" description={data ? "ملخص مباشر من صفوفك النشطة" + (data.generatedAt ? " · " + fmt(data.generatedAt) : "") : "ملخص مباشر من صفوفك النشطة"}
        actions={<button type="button" className="eb-button is-quiet is-small" onClick={() => void load()} disabled={loading}><IconRefresh size={16} aria-hidden="true" />تحديث</button>} />
      {loading && !data && <p className="eb-muted" role="status">جارٍ تحميل ملخص اليوم...</p>}
      {error && !data && <div className="platform-error eb-today-error" role="alert">{error} <button type="button" className="eb-notif-retry" onClick={() => void load()}>إعادة المحاولة</button></div>}
      {a && quiet && <p className="eb-attention-empty eb-today-quiet" role="status">لا توجد عناصر تحتاج تدخلك الآن.</p>}
      {a && (
        <div className="eb-attention-grid eb-today-grid">
          <Card id="eb-today-active" title="محاولات نشطة الآن" count={a.activeAttempts.count} tone="attention" empty="لا توجد محاولات جارية." actionLabel="الواجبات" onAction={() => go("assignments")}
            items={a.activeAttempts.items.map(i => ({ key: i.assignmentId + ":" + i.studentId, label: i.studentName, meta: i.title + " · " + i.className + (STATUS[i.status] ? " · " + STATUS[i.status] : "") + (i.startedAt ? " · منذ " + fmt(i.startedAt) : "") }))} />
          <Card id="eb-today-notstarted" title="لم يبدؤوا بعد" count={a.notStarted.count} tone="danger" empty="بدأ الجميع واجباتهم المفتوحة." actionLabel="الواجبات" onAction={() => go("assignments")}
            items={a.notStarted.items.map(i => ({ key: i.assignmentId, label: i.title, meta: i.notStarted + " من " + i.expected + " · " + i.className + (i.dueAt ? " · التسليم " + fmt(i.dueAt) : "") }))} />
          <Card id="eb-today-pending" title="بانتظار التصحيح" count={a.pendingReview.count} tone="info" empty="لا تسليمات تنتظر تصحيحًا يدويًا." actionLabel="الواجبات" onAction={() => go("assignments")}
            items={a.pendingReview.items.map(i => ({ key: i.assignmentId, label: i.title, meta: i.pendingReview + " تسليم · " + i.className }))} />
          <article className="eb-attention-card tone-info" aria-labelledby="eb-today-messages">
            <h3 id="eb-today-messages" className="eb-attention-title"><span>رسائل غير مقروءة</span><span className="eb-attention-count">{a.unreadMessages ? (a.unreadMessages.capped ? "99+" : a.unreadMessages.total) : "—"}</span></h3>
            {a.unreadMessages === null ? <p className="eb-attention-partial">تعذر قراءة الرسائل الآن؛ بقية الملخص محدّثة.</p>
              : a.unreadMessages.total === 0 ? <p className="eb-attention-empty">لا رسائل جديدة من الطلاب.</p>
              : <p className="eb-today-note">{a.unreadMessages.capped ? "أكثر من 99 رسالة" : a.unreadMessages.total + " رسالة"} من طلابك بانتظار الرد.</p>}
            <button type="button" className="eb-button is-quiet is-small eb-today-card-action" onClick={() => go("messages")}>فتح الرسائل</button>
          </article>
        </div>
      )}
      <div className="eb-today-actions" role="group" aria-label="إجراءات سريعة">
        <button type="button" className="eb-button is-small" onClick={() => go("messages")}><IconMail size={16} aria-hidden="true" />فتح الرسائل</button>
        <button type="button" className="eb-button is-small" onClick={() => go("assignments")}><IconAssignments size={16} aria-hidden="true" />الواجبات</button>
        <button type="button" className="eb-button is-small" onClick={() => go("students")}><IconStudents size={16} aria-hidden="true" />الصفوف والطلاب</button>
        <button type="button" className="eb-button is-small" onClick={() => go("reports")}><IconReports size={16} aria-hidden="true" />التقارير</button>
        <button type="button" className="eb-button is-small" onClick={() => go("projects")}><IconProjects size={16} aria-hidden="true" />المشاريع</button>
        <button type="button" className="eb-button is-small" onClick={scrollToFeed}><IconMedal size={16} aria-hidden="true" />تقدير طالب</button>
      </div>
      {data && data.recent.length > 0 && (
        <section className="eb-today-recent" aria-labelledby="eb-today-recent-title">
          <h3 id="eb-today-recent-title" className="eb-subheading">آخر نشاط في صفوفك</h3>
          <ul className="eb-today-recent-list">
            {data.recent.map((e, i) => (
              <li key={e.kind + ":" + e.assignmentId + ":" + e.studentId + ":" + e.at + ":" + i} className="eb-today-recent-item">
                <span className="eb-today-recent-text"><strong>{e.studentName}</strong> {KIND[e.kind] || e.kind} «{e.title}»{typeof e.percentage === "number" ? " · " + Math.round(e.percentage) + "%" : ""} · {e.className}</span>
                <time className="eb-today-recent-time" dateTime={e.at}>{fmt(e.at)}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
