import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { IconMail, IconAssignments, IconStudents, IconReports, IconProjects, IconMedal, IconRefresh } from "../icons";
import SectionHeader from "../ui/SectionHeader";
import { useAutoRefresh } from "../ui/useAutoRefresh";
import type { TeacherNavId } from "../shell/teacherNav";
import { parseProjectEvaluation, type ProjectEvaluationAttention, type ProjectEvaluationAttentionRow, type ProjectReviewAttention } from "./teacherTodayEvaluation";
import type { ProjectEvaluationQueueItem, ProjectStudentRef } from "../projects/drillTarget";
import { recentActivityTarget, type AssignmentDrillTarget } from "../assignments/drillTarget";
import { count, spread, sinceText, untilText, exactTime, SUBMISSIONS, STUDENTS, STUDENTS_WORKING, STAGES, FROM_STUDENTS, MESSAGES } from "./todayFormat";
import { useConfirm } from "../ui/useConfirm";
import { useCan } from "../shell/teacherAccessContext";
import { ARRANGEABLE, arrangeSlots, parseLayout, type DashboardLayout } from "./todayLayout";   // Tadris+ P7-A2
import "./teacherToday.css";
export type { ProjectEvaluationAttention, ProjectEvaluationAttentionRow } from "./teacherTodayEvaluation";

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
    activeAttempts: { count: number; items: AttemptItem[] };
    /** Phase 21H.0 — additive: open attempts with no recent activity, or paused (absent on older payloads → no card). */
    staleAttempts?: { count: number; items: AttemptItem[] };
    /** Phase 21H.3 — additive (absent on older payloads → no card): deadlines within 48 h, «manual» results not yet
     *  published (21G.5), and assignments opening within 24 h. */
    dueSoon?: { count: number; items: { assignmentId: string; title: string; className: string; dueAt: string; notSubmitted: number; expected: number }[] };
    resultsUnreleased?: { count: number; items: { assignmentId: string; title: string; className: string; submitted: number; dueAt: string }[] };
    openingSoon?: { count: number; items: { assignmentId: string; title: string; className: string; openAt: string; expected: number }[] };
    notStarted: { count: number; assignments: number; items: { assignmentId: string; title: string; className: string; dueAt: string; notStarted: number; expected: number }[] };
    pendingReview: { count: number; assignments: number; items: { assignmentId: string; title: string; className: string; pendingReview: number }[] };
    unreadMessages: { total: number; capped: boolean } | null;
  };
  recent: { kind: string; at: string; assignmentId: string; title: string; className: string; studentId: string; studentName: string; percentage?: number | null }[];
  partial: string[];
  /** Phase 9C — additive: students with ungraded project stages (Phase 9B evaluation semantics). Absent on older
   * payloads (no card), null when the source failed this round ("projectEvaluation" in `partial`). */
  projectEvaluation?: ProjectEvaluationAttention | null;
  /** Tadris+ P7-A1 — the widgets this answer carries (lib/dashboard-widgets.js): the server computes and sends only the sections the
   *  teacher's access allows, and a card is shown only when its widget is listed. Absent on an older API → every card. */
  widgets?: string[];
};
type AttemptItem = { assignmentId: string; title: string; className: string; studentId: string; studentName: string; startedAt: string; status: string; lastActivityAt?: string };
type Props = {
  token: string; onNavigate?: (id: TeacherNavId) => void;
  /** Phase 9C — opens ONE project's tracker (App's existing goToProjects); without it a row falls back to «المشاريع». */
  onOpenProject?: (projectCode: string) => void;
  /** Phase 9D — opens the exact project + class + student of an evaluation row (App's drill-in). Preferred over
   * onOpenProject for rows when present; the «المشاريع» card action never uses it. */
  onOpenProjectStudent?: (ref: ProjectStudentRef) => void;
  /** Phase 9F — starts an evaluation queue session from the card's rows (server order, the clicked row first). Preferred
   * over onOpenProjectStudent for rows when present; the «المشاريع» card action never uses it. */
  onStartEvaluationQueue?: (items: ProjectEvaluationQueueItem[], startIndex: number) => void;
  /** Phase 12B — opens the EXACT assignment (and the useful gradebook state) of an attention / activity row through App's
   * navigation. Absent → the rows stay plain text and the card actions keep opening «الواجبات». */
  onOpenAssignmentTarget?: (target: AssignmentDrillTarget) => void;
  /** Phase 21H.2 — the dashboard's ONE scope: "" = all classes, else that class only (the server narrows; it never widens). */
  classId?: string;
  /** Phase 21H.2 — the dashboard's single «تحديث»: every change re-reads the summary. */
  refreshSignal?: number;
  /** Phase 21H.2 — inside the dashboard: the page's scope bar owns refresh and «آخر تحديث», so the hub shows neither. */
  embedded?: boolean;
};

export const TEACHER_TODAY_REFRESH_MS = 60000;


const PREVIEW = 4;
const two = (n: number) => String(n).padStart(2, "0");
const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes()); };
const STATUS: Record<string, string> = { started: "جارية", draft: "جارية", paused: "متوقفة مؤقتًا" };
/** Phase 21H.0 — an attempt row's age: «آخر نشاط منذ 3 دقائق» (from the summary's own clock); paused says so instead. */
const activityText = (i: AttemptItem, nowIso: string) => {
  if (i.status === "paused") return STATUS.paused;
  const since = sinceText(i.lastActivityAt || i.startedAt, nowIso);
  return since ? "آخر نشاط " + since : (STATUS[i.status] || "");
};
const KIND: Record<string, string> = { submitted: "سلّم", started: "بدأ محاولة", timedOut: "انتهى وقته", integrityExit: "خرج من الامتحان", teacherEnded: "أنهى المعلم محاولته" };

/** An optional additive block: kept only when it has the {count, items[]} shape (a malformed one renders no card). */
const block = <T extends { count: number; items: unknown[] }>(b: T | undefined): T | undefined => (b && typeof b.count === "number" && Array.isArray(b.items) ? b : undefined);

/** Validates the payload shape defensively: a malformed body is an error, never a crash or a fake zero-state. */
function parse(j: unknown): TeacherToday | null {
  const o = j as Partial<TeacherToday> | null;
  if (!o || typeof o !== "object" || !o.attention || !o.attention.activeAttempts || !o.attention.notStarted || !o.attention.pendingReview) return null;
  const projectEvaluation = parseProjectEvaluation((o as Record<string, unknown>).projectEvaluation);
  const widgets = Array.isArray(o.widgets) ? o.widgets.filter((w): w is string => typeof w === "string") : undefined;
  return { generatedAt: String(o.generatedAt || ""), scope: o.scope || { activeClasses: 0, students: 0, publishedAssignments: 0 }, attention: { ...o.attention, unreadMessages: o.attention.unreadMessages ?? null, staleAttempts: block(o.attention.staleAttempts), dueSoon: block(o.attention.dueSoon), resultsUnreleased: block(o.attention.resultsUnreleased), openingSoon: block(o.attention.openingSoon) }, recent: Array.isArray(o.recent) ? o.recent : [], partial: Array.isArray(o.partial) ? o.partial : [], ...(projectEvaluation === undefined ? {} : { projectEvaluation }), ...(widgets ? { widgets } : {}) };
}

/** «3/7 مراحل مقيّمة» — the row's evaluation state in the Phase 9B wording (0 IS a grade: it is counted as graded by the server). */
const stagesText = (r: ProjectEvaluationAttentionRow) => r.gradedStages + "/" + r.totalStages + " مراحل مقيّمة";
const stagesWaiting = (n: number) => (n === 1 ? "مرحلة واحدة تنتظر التقييم" : n === 2 ? "مرحلتان تنتظران التقييم" : n + " مراحل تنتظر التقييم");
const studentsNeeding = (n: number) => (n === 1 ? "طالب واحد لديه مراحل مشروع غير مقيّمة" : n === 2 ? "طالبان لديهما مراحل مشروع غير مقيّمة" : n + " طلاب لديهم مراحل مشروع غير مقيّمة");
// Phase 12B — accessible names of the actionable rows (no internal ids; the visible row text stays unchanged).
const notStartedText = (n: number) => (n === 1 ? "طالب واحد لم يبدأ" : n === 2 ? "طالبان لم يبدآ" : n + " طلاب لم يبدؤوا");
const pendingText = (n: number) => (n === 1 ? "تسليم واحد بانتظار التصحيح" : n === 2 ? "تسليمان بانتظار التصحيح" : n + " تسليمات بانتظار التصحيح");
const attemptText = (status: string) => (status === "paused" ? "محاولة متوقفة مؤقتًا" : "محاولة جارية");

/**
 * Phase 9C — «تقييم المشاريع»: students with ungraded project stages (the server's Phase 9B evaluation, one authority;
 * nothing recomputed here). Each row opens that project's tracker through App's EXISTING navigation (no new router);
 * the positive empty state says nothing waits. Rendered only when the payload carries the block.
 */
function ProjectEvaluationCard({ data, onOpen, onOpenAll }: { data: ProjectEvaluationAttention | null; onOpen: (row: ProjectEvaluationAttentionRow) => void; onOpenAll: () => void }) {
  if (data && data.review) return <ProjectReviewCard review={data.review} onOpen={onOpen} onOpenAll={onOpenAll} />;
  const id = "eb-today-project-eval";
  let body: ReactNode;
  if (data === null) body = <p className="eb-attention-partial">تعذر قراءة تقييم المشاريع الآن؛ بقية الملخص محدّثة.</p>;
  else if (data.studentsWithUngradedStages === 0) body = <p className="eb-attention-empty">لا توجد مراحل مشروع بانتظار التقييم.</p>;
  else body = (
    <>
      <p className="eb-today-note">{studentsNeeding(data.studentsWithUngradedStages)} · {stagesWaiting(data.totalUngradedStages)}</p>
      <ul className="eb-attention-list" aria-label="طلاب بانتظار تقييم مراحل المشروع">
        {data.attention.slice(0, PREVIEW * 2).map(r => (
          <li key={r.studentId + ":" + r.projectCode}>
            <button type="button" className="eb-attention-item" onClick={() => onOpen(r)} aria-label={"افتح مشروع " + r.projectTitle + " لتقييم " + r.displayName + " — " + stagesText(r)}>
              <span className="eb-attention-item-label">{r.displayName} — {r.projectTitle}</span>
              <span className="eb-attention-item-meta" dir="auto">{stagesText(r)}{r.className ? " · " + r.className : ""}</span>
            </button>
          </li>
        ))}
      </ul>
      {data.attentionTotal > Math.min(data.attention.length, PREVIEW * 2) && <p className="eb-attention-more">و{data.attentionTotal - Math.min(data.attention.length, PREVIEW * 2)} أخرى</p>}
    </>
  );
  return (
    <article className={"eb-attention-card tone-" + (data && data.studentsWithUngradedStages > 0 ? "info" : "neutral") + " eb-today-project-eval"} aria-labelledby={id}>
      <h3 id={id} className="eb-attention-title"><span>تقييم المشاريع</span><span className="eb-attention-count">{data === null ? "—" : data.studentsWithUngradedStages}</span></h3>
      {body}
      <button type="button" className="eb-button is-quiet is-small eb-today-card-action" onClick={onOpenAll}>المشاريع</button>
    </article>
  );
}

/**
 * Phase 21H.1 (decision D2) — «مراحل بانتظار مراجعتك»: the stages students SUBMITTED for review, the same figure as the
 * sidebar badge. A stage nobody has worked on is not listed. Rows open the same evaluation queue / drill-in as 9C–9F.
 */
function ProjectReviewCard({ review, onOpen, onOpenAll }: { review: ProjectReviewAttention; onOpen: (row: ProjectEvaluationAttentionRow) => void; onOpenAll: () => void }) {
  const id = "eb-today-project-eval", shown = review.attention.slice(0, PREVIEW * 2), rest = review.attentionTotal - shown.length;
  const n = review.totalReadyStages;
  return (
    <article className={"eb-attention-card tone-" + (n > 0 ? "info" : "neutral") + " eb-today-project-eval"} aria-labelledby={id}>
      <h3 id={id} className="eb-attention-title"><span>مراحل مشاريع بانتظار مراجعتك</span><span className="eb-attention-count">{n}</span></h3>
      {n === 0 ? <p className="eb-attention-empty">لا توجد مراحل سلّمها الطلاب بانتظار مراجعتك.</p> : (
        <>
          <p className="eb-today-note">{count(n, STAGES)} {count(review.studentsAwaitingReview, FROM_STUDENTS)}</p>
          <ul className="eb-attention-list" aria-label="طلاب سلّموا مراحل مشروع للمراجعة">
            {shown.map(r => (
              <li key={r.studentId + ":" + r.projectCode}>
                <button type="button" className="eb-attention-item" onClick={() => onOpen(r)} aria-label={"افتح مشروع " + r.projectTitle + " لمراجعة " + r.displayName + " — " + count(r.readyStages, STAGES) + " بانتظار المراجعة"}>
                  <span className="eb-attention-item-label">{r.displayName} — {r.projectTitle}</span>
                  <span className="eb-attention-item-meta" dir="auto">{count(r.readyStages, STAGES)} بانتظار المراجعة · {stagesText(r)}{r.className ? " · " + r.className : ""}</span>
                </button>
              </li>
            ))}
          </ul>
          {rest > 0 && <p className="eb-attention-more">و{rest} أخرى</p>}
        </>
      )}
      <button type="button" className="eb-button is-quiet is-small eb-today-card-action" onClick={onOpenAll}>المشاريع</button>
    </article>
  );
}

/** A card row: display text, plus (Phase 12B) an optional action. With `onOpen` the row is ONE real <button> (never the
 *  whole card, never nested); without it the row is plain text exactly as before. */
type CardItem = { key: string; label: string; meta: string; onOpen?: () => void; ariaLabel?: string;
  /** Phase 21H.3 — a direct action next to the row (e.g. «تذكير»): its own button, never nested in the row's. */
  action?: { label: string; ariaLabel: string; onClick: () => void; disabled?: boolean } };

function Card({ id, title, count, tone, items, empty, actionLabel, onAction, summary }: { id: string; title: string; count: number; tone: "danger" | "attention" | "info"; items: CardItem[]; empty: string; actionLabel: string; onAction?: () => void; summary?: string }) {
  const shown = items.slice(0, PREVIEW), rest = items.length - shown.length;
  let body: ReactNode;
  if (shown.length) body = (
    <ul className="eb-attention-list">
      {shown.map(i => {
        const action = i.action && <button type="button" className="eb-button is-quiet is-small eb-today-row-secondary" onClick={i.action.onClick} disabled={i.action.disabled} aria-label={i.action.ariaLabel}>{i.action.label}</button>;
        return i.onOpen
          ? <li key={i.key} className={"eb-today-row-item" + (action ? " has-action" : "")}><button type="button" className="eb-attention-item eb-today-row-action" onClick={i.onOpen} aria-label={i.ariaLabel}><span className="eb-attention-item-label">{i.label}</span><span className="eb-attention-item-meta">{i.meta}</span></button>{action}</li>
          : <li key={i.key} className={"eb-today-row" + (action ? " has-action" : "")}><span className="eb-attention-item-label">{i.label}</span><span className="eb-attention-item-meta">{i.meta}</span>{action}</li>;
      })}
    </ul>
  );
  else if (count === 0) body = <p className="eb-attention-empty">{empty}</p>;
  else body = <p className="eb-attention-partial">توجد {count} حالات؛ افتح القسم لعرضها.</p>;
  return (
    <article className={"eb-attention-card tone-" + (count > 0 ? tone : "neutral")} aria-labelledby={id}>
      <h3 id={id} className="eb-attention-title"><span>{title}</span><span className="eb-attention-count">{count}</span></h3>
      {summary && count > 0 && <p className="eb-today-note">{summary}</p>}
      {body}
      {rest > 0 && <p className="eb-attention-more">و{rest} أخرى</p>}
      {onAction && <button type="button" className="eb-button is-quiet is-small eb-today-card-action" onClick={onAction}>{rest > 0 ? "عرض الكل في " + actionLabel : actionLabel}</button>}
    </article>
  );
}

/**
 * Tadris+ P7-A2 — «ترتيب البطاقات»: the teacher orders and hides the cards the server serves to them (only those); saved in the
 * teacher's profile. Presentation only — what the server computes and sends does not change.
 */
function ArrangePanel({ token, layout, available, onClose, onSaved }: { token: string; layout: DashboardLayout | null; available: typeof ARRANGEABLE; onClose: () => void; onSaved: (l: DashboardLayout) => void }) {
  const initial = arrangeSlots(available.map(w => [w.id, w] as [string, typeof w]), layout ? { order: layout.order, hidden: [] } : null).map(([, w]) => w);
  const [items, setItems] = useState(initial);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(layout ? layout.hidden : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const move = (i: number, d: -1 | 1) => setItems(list => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return list; [n[i], n[j]] = [n[j], n[i]]; return n; });
  async function save(next: DashboardLayout) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/teacher-profile", { method: "POST", headers: { "Content-Type": "application/json", "x-builder-token": token, Authorization: "Bearer " + token }, body: JSON.stringify({ action: "setDashboardLayout", layout: next }) });
      const j = await r.json().catch(() => null) as { ok?: boolean; error?: string; dashboardLayout?: unknown } | null;
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || "تعذر حفظ الترتيب.");
      onSaved(parseLayout(j.dashboardLayout) || next);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر حفظ الترتيب."); }
    finally { setBusy(false); }
  }
  return (
    <section className="eb-today-arrange" aria-labelledby="eb-today-arrange-title">
      <h3 id="eb-today-arrange-title" className="eb-subheading">ترتيب البطاقات</h3>
      <p className="eb-muted">رتّب البطاقات واختر ما تراه منها. يبقى الترتيب في حسابك على كل أجهزتك.</p>
      <ol className="eb-today-arrange-list">
        {items.map((w, i) => (
          <li key={w.id}>
            <label className="eb-field-inline"><input type="checkbox" checked={!hidden.has(w.id)} onChange={e => setHidden(h => { const n = new Set(h); if (e.target.checked) n.delete(w.id); else n.add(w.id); return n; })} />{w.label}</label>
            {w.grid && <>
              <button type="button" className="eb-button is-quiet is-small" aria-label={"تقديم " + w.label} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="eb-button is-quiet is-small" aria-label={"تأخير " + w.label} disabled={i === items.length - 1 || !items[i + 1]?.grid} onClick={() => move(i, 1)}>↓</button>
            </>}
          </li>
        ))}
      </ol>
      {error && <p className="platform-error" role="alert">{error}</p>}
      <div className="eb-today-arrange-actions">
        <button type="button" className="eb-button is-small is-primary" disabled={busy} onClick={() => void save({ order: items.map(w => w.id), hidden: items.map(w => w.id).filter(id => hidden.has(id)) })}>حفظ الترتيب</button>
        <button type="button" className="eb-button is-small" disabled={busy} onClick={() => void save({ order: [], hidden: [] })}>الترتيب الافتراضي</button>
        <button type="button" className="eb-button is-quiet is-small" disabled={busy} onClick={onClose}>إلغاء</button>
      </div>
    </section>
  );
}

export default function TeacherTodayHub({ token, onNavigate, onOpenProject, onOpenProjectStudent, onStartEvaluationQueue, onOpenAssignmentTarget, classId = "", refreshSignal = 0, embedded = false }: Props) {
  const can = useCan();
  // Phase 21H.2 — the summary belongs to the scope it was read for: another class's figures are never shown under this one,
  // and a slower answer for an earlier scope never overwrites a newer one (gen).
  const [loadedFor, setLoadedFor] = useState<{ key: string; data: TeacherToday } | null>(null);
  const data = loadedFor && loadedFor.key === classId ? loadedFor.data : null;
  const gen = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function load({ silent = false }: { silent?: boolean } = {}) {
    const mine = ++gen.current, key = classId;
    if (!silent) { setLoading(true); setError(""); }
    try {
      const r = await fetch("/api/teacher-today" + (key ? "?classId=" + encodeURIComponent(key) : ""), { headers: { "x-builder-token": token, Authorization: "Bearer " + token } });
      const j = await r.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!alive.current || mine !== gen.current) return;
      const parsed = r.ok && j && j.ok ? parse(j) : null;
      if (!parsed) throw new Error((j && j.error) || "تعذر تحميل ملخص اليوم حاليًا.");
      setLoadedFor({ key, data: parsed }); setError("");
    } catch (e) { if (!alive.current || mine !== gen.current) return; if (!silent) setError(e instanceof Error ? e.message : "تعذر تحميل ملخص اليوم حاليًا."); }
    finally { if (alive.current && mine === gen.current && !silent) setLoading(false); }
  }
  // The initial read starts in a microtask (the mounted state is already "loading"), so no state is set synchronously
  // inside the effect; a token change (new session) restarts from a clean read the same way.
  useEffect(() => { void Promise.resolve().then(() => load()); }, [token, classId, refreshSignal]);   // eslint-disable-line react-hooks/exhaustive-deps
  useAutoRefresh(() => load({ silent: true }), { intervalMs: TEACHER_TODAY_REFRESH_MS, enabled: !!data });

  const go = (id: TeacherNavId) => onNavigate?.(id);
  const scrollToFeed = () => { const el = document.getElementById("eb-achievements-title"); el?.scrollIntoView?.({ block: "start" }); el?.focus?.(); };
  // Tadris+ P7-A1 — only the widgets the server served (an older payload without `widgets` → every card, as before).
  const shows = (id: string) => !data?.widgets || data.widgets.includes(id);
  // Tadris+ P7-A2 — the teacher's arrangement (read once per session token; a failed read keeps the default order).
  const [layout, setLayout] = useState<DashboardLayout | null>(null);
  const [layoutChoosable, setLayoutChoosable] = useState(false);
  const [arranging, setArranging] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch("/api/teacher-profile", { headers: { "x-builder-token": token, Authorization: "Bearer " + token } })
      .then(r => (r.ok ? r.json() : null)).catch(() => null)
      .then((j: { ok?: boolean; dashboardLayout?: unknown; layoutChoosable?: unknown } | null) => {
        if (!live || !j || !j.ok) return;
        setLayout(parseLayout(j.dashboardLayout)); setLayoutChoosable(j.layoutChoosable === true);
      });
    return () => { live = false; };
  }, [token]);
  const arrange = (slots: [string, ReactNode][]) => arrangeSlots(slots.filter(([, node]) => !!node), layout).map(([id, node], i) => <Fragment key={id + ":" + i}>{node}</Fragment>);
  const recentHidden = !!layout && layout.hidden.includes("activity.recent");
  const anyAssignments = ["grading.pending", "assignments.deadlines", "assignments.notStarted", "results.unreleased", "attempts.live", "activity.recent"].some(shows);
  const a = data?.attention;
  const projectEval = data?.projectEvaluation;                                 // undefined = older payload (no card)
  const stale = a?.staleAttempts;                                              // undefined = older payload (no card)
  const due = a?.dueSoon, unreleased = a?.resultsUnreleased, opening = a?.openingSoon;
  const now = data?.generatedAt || "";
  const total = a ? a.activeAttempts.count + (stale ? stale.count : 0) + a.notStarted.count + a.pendingReview.count + (a.unreadMessages ? a.unreadMessages.total : 0) + (due ? due.count : 0) + (unreleased ? unreleased.count : 0) + (projectEval ? (projectEval.review ? projectEval.review.totalReadyStages : projectEval.studentsWithUngradedStages) : 0) : 0;
  const quiet = !!a && total === 0 && !a.unreadMessages?.total;
  // A row: the exact student (9D) when App offers it, else the project (9C), else the Projects destination.
  const openRow = (r: ProjectEvaluationAttentionRow) => {
    const rows = projectEval ? (projectEval.review ? projectEval.review.attention : projectEval.attention) : [];
    const index = rows.findIndex(x => x.studentId === r.studentId && x.projectCode === r.projectCode && x.classId === r.classId);
    if (onStartEvaluationQueue && index >= 0) onStartEvaluationQueue(rows.map(x => ({ projectCode: x.projectCode, classId: x.classId, studentId: x.studentId, displayName: x.displayName })), index);
    else if (onOpenProjectStudent) onOpenProjectStudent({ projectCode: r.projectCode, classId: r.classId, studentId: r.studentId });
    else if (onOpenProject) onOpenProject(r.projectCode);
    else go("projects");
  };
  // Phase 12B — an attention / activity row hands App a typed target (identifiers + intent only). Without the callback
  // the row is not actionable (plain text), exactly as before. Today never reads assignment results itself: the
  // destination re-reads them and decides what is current.
  const openAssignment = onOpenAssignmentTarget ? (t: AssignmentDrillTarget) => () => onOpenAssignmentTarget(t) : null;

  // Phase 21H.3 — «تذكير» right from the card (offered with the actionable rows, i.e. inside the app): the SAME confirmed action as the gradebook's (21G.7 remindStudents — the server
  // decides who is eligible, at most one reminder per student per day); the hub re-reads its summary afterwards.
  const { confirm, confirmDialog } = useConfirm();
  const [reminding, setReminding] = useState("");
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  async function remind(assignmentId: string, title: string) {
    if (reminding) return;
    if (!(await confirm({ title: "تذكير الطلاب", message: "سيصل إشعار «تذكير من المعلم» إلى كل من لم يسلّم «" + title + "» بعد ممن لا يزال بإمكانهم التسليم. يُرسل تذكير واحد على الأكثر لكل طالب في اليوم.", confirmLabel: "إرسال التذكير" }))) return;
    setReminding(assignmentId); setNotice(null);
    try {
      const r = await fetch("/api/assignment-results", { method: "POST", headers: { "Content-Type": "application/json", "x-builder-token": token, Authorization: "Bearer " + token }, body: JSON.stringify({ action: "remindStudents", assignmentId }) });
      const j = await r.json().catch(() => null) as { ok?: boolean; error?: string; reminded?: number; alreadyToday?: number; failed?: number } | null;
      if (!alive.current) return;
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || "تعذر إرسال التذكير.");
      const parts = [j.reminded ? "✓ أُرسل التذكير إلى " + count(j.reminded, STUDENTS) + " في «" + title + "»." : "لم يُرسل تذكير جديد في «" + title + "»."];
      if (j.alreadyToday) parts.push(count(j.alreadyToday, STUDENTS) + " ذُكّر اليوم مسبقًا.");
      if (j.failed) parts.push("تعذر الإرسال إلى " + count(j.failed, STUDENTS) + "؛ أعد المحاولة لاحقًا.");
      setNotice({ text: parts.join(" "), error: !!j.failed });
      void load({ silent: true });
    } catch (e) { if (alive.current) setNotice({ text: e instanceof Error ? e.message : "تعذر إرسال التذكير.", error: true }); }
    finally { if (alive.current) setReminding(""); }
  }
  // Tadris+ P8-B1 — «تذكير» is a POST of /api/assignment-results (assignments.schedule.set); not offered without it.
  const mayRemind = can("assignments.schedule.set");
  const remindAction = (assignmentId: string, title: string) => ({ label: reminding === assignmentId ? "جارٍ الإرسال..." : "تذكير", ariaLabel: "تذكير من لم يسلّم «" + title + "»", onClick: () => void remind(assignmentId, title), disabled: !!reminding });

  return (
    <section className="eb-today-teacher" aria-labelledby="eb-today-title">
      <SectionHeader level={2} id="eb-today-title" title="ما الذي يحتاج انتباهي الآن؟" description={embedded ? "مباشر الآن · يتحدّث تلقائيًا كل دقيقة" : data ? "ملخص مباشر من صفوفك النشطة" + (data.generatedAt ? " · " + fmt(data.generatedAt) : "") : "ملخص مباشر من صفوفك النشطة"}
        actions={embedded ? undefined : <button type="button" className="eb-button is-quiet is-small" onClick={() => void load()} disabled={loading}><IconRefresh size={16} aria-hidden="true" />تحديث</button>} />
      {loading && !data && <p className="eb-muted" role="status">جارٍ تحميل ملخص اليوم...</p>}
      {error && !data && <div className="platform-error eb-today-error" role="alert">{error} <button type="button" className="eb-notif-retry" onClick={() => void load()}>إعادة المحاولة</button></div>}
      {a && quiet && <p className="eb-attention-empty eb-today-quiet" role="status">لا توجد عناصر تحتاج تدخلك الآن.</p>}
      {a && layoutChoosable && !arranging && <div className="eb-today-arrange-entry"><button type="button" className="eb-button is-quiet is-small" onClick={() => setArranging(true)}>ترتيب البطاقات</button></div>}
      {a && arranging && <ArrangePanel token={token} layout={layout} available={ARRANGEABLE.filter(w => shows(w.id))} onClose={() => setArranging(false)} onSaved={l => { setLayout(l); setArranging(false); }} />}
      {notice && <p className={"eb-today-notice" + (notice.error ? " is-error" : "")} role={notice.error ? "alert" : "status"}>{notice.text}</p>}
      {a && (
        // Phase 21H.3 — cards in priority order: grading, deadlines, who has not started, results to publish, messages,
        // projects, then the live / idle attempts and what opens soon.
        <div className="eb-attention-grid eb-today-grid">
          {arrange([
          ["grading.pending", shows("grading.pending") && <Card key="slot1" id="eb-today-pending" title="بانتظار التصحيح" count={a.pendingReview.count} tone="info" empty="لا تسليمات تنتظر تصحيحًا يدويًا." actionLabel="الواجبات" onAction={() => go("assignments")}
            summary={spread(a.pendingReview.count, SUBMISSIONS, a.pendingReview.assignments)}
            items={a.pendingReview.items.map(i => ({ key: i.assignmentId, label: i.title, meta: count(i.pendingReview, SUBMISSIONS) + " · " + i.className,
              ...(openAssignment ? { onOpen: openAssignment({ assignmentId: i.assignmentId, mode: "pendingReview" }), ariaLabel: "افتح واجب " + i.title + " — " + pendingText(i.pendingReview) } : {}) }))} />],
          ["assignments.deadlines", due && shows("assignments.deadlines") && <Card key="slot2" id="eb-today-due" title="يُغلق خلال 48 ساعة" count={due.count} tone="attention" empty="لا واجبات يقترب موعد إغلاقها." actionLabel="الواجبات" onAction={() => go("assignments")}
            items={due.items.map(i => ({ key: "due:" + i.assignmentId, label: i.title, meta: "يُغلق " + (untilText(i.dueAt, now) || fmt(i.dueAt)) + " · لم يسلّم " + i.notSubmitted + " من " + i.expected + " · " + i.className,
              ...(openAssignment ? { onOpen: openAssignment({ assignmentId: i.assignmentId, mode: "notSubmitted" }), ariaLabel: "افتح واجب " + i.title + " — يُغلق " + (untilText(i.dueAt, now) || fmt(i.dueAt)) } : {}),
              ...(openAssignment && mayRemind && i.notSubmitted > 0 ? { action: remindAction(i.assignmentId, i.title) } : {}) }))} />],
          ["assignments.notStarted", shows("assignments.notStarted") && <Card key="slot3" id="eb-today-notstarted" title="لم يبدؤوا بعد" count={a.notStarted.count} tone="danger" empty="بدأ الجميع واجباتهم المفتوحة." actionLabel="الواجبات" onAction={() => go("assignments")}
            summary={spread(a.notStarted.count, STUDENTS, a.notStarted.assignments)}
            items={a.notStarted.items.map(i => ({ key: i.assignmentId, label: i.title, meta: "لم يبدأ " + i.notStarted + " من " + i.expected + " · " + i.className + (i.dueAt ? " · التسليم " + fmt(i.dueAt) : ""),
              ...(openAssignment ? { onOpen: openAssignment({ assignmentId: i.assignmentId, mode: "notSubmitted" }), ariaLabel: "افتح واجب " + i.title + " — " + notStartedText(i.notStarted) } : {}),
              ...(openAssignment && mayRemind ? { action: remindAction(i.assignmentId, i.title) } : {}) }))} />],
          ["results.unreleased", unreleased && shows("results.unreleased") && <Card key="slot4" id="eb-today-unreleased" title="نتائج بانتظار النشر" count={unreleased.count} tone="info" empty="لا نتائج تنتظر النشر." actionLabel="الواجبات" onAction={() => go("assignments")}
            summary="اخترت نشر نتائج هذه الواجبات يدويًا؛ لا يرى الطلاب علاماتهم قبل أن تنشرها."
            items={unreleased.items.map(i => ({ key: "rel:" + i.assignmentId, label: i.title, meta: count(i.submitted, SUBMISSIONS) + " · " + i.className,
              ...(openAssignment ? { onOpen: openAssignment({ assignmentId: i.assignmentId, mode: "assignment" }), ariaLabel: "افتح واجب " + i.title + " لنشر نتائجه" } : {}) }))} />],
          ["messages.unread", shows("messages.unread") && <article key="slot5" className={"eb-attention-card tone-" + (a.unreadMessages && a.unreadMessages.total > 0 ? "info" : "neutral")} aria-labelledby="eb-today-messages">
            <h3 id="eb-today-messages" className="eb-attention-title"><span>رسائل غير مقروءة</span><span className="eb-attention-count">{a.unreadMessages ? (a.unreadMessages.capped ? "99+" : a.unreadMessages.total) : "—"}</span></h3>
            {a.unreadMessages === null ? <p className="eb-attention-partial">تعذر قراءة الرسائل الآن؛ بقية الملخص محدّثة.</p>
              : a.unreadMessages.total === 0 ? <p className="eb-attention-empty">لا رسائل جديدة من الطلاب.</p>
              : <p className="eb-today-note">{a.unreadMessages.capped ? "أكثر من 99 رسالة" : count(a.unreadMessages.total, MESSAGES)} من طلابك بانتظار الرد.</p>}
            <button type="button" className="eb-button is-quiet is-small eb-today-card-action" onClick={() => go("messages")}>فتح الرسائل</button>
          </article>],
          ["projects.evaluation", projectEval !== undefined && shows("projects.evaluation") && <ProjectEvaluationCard key="slot6" data={projectEval} onOpen={openRow} onOpenAll={() => go("projects")} />],
          ["attempts.live", shows("attempts.live") && <Card key="slot7" id="eb-today-active" title="محاولات نشطة الآن" count={a.activeAttempts.count} tone="attention" empty="لا يعمل أي طالب على محاولة الآن." actionLabel="الواجبات" onAction={() => go("assignments")}
            summary={count(a.activeAttempts.count, STUDENTS_WORKING)}
            items={a.activeAttempts.items.map(i => ({ key: i.assignmentId + ":" + i.studentId, label: i.studentName, meta: i.title + " · " + i.className + (activityText(i, now) ? " · " + activityText(i, now) : ""),
              ...(openAssignment ? { onOpen: openAssignment({ assignmentId: i.assignmentId, mode: "active", studentId: i.studentId }), ariaLabel: "افتح واجب " + i.title + " للطالب " + i.studentName + " — " + attemptText(i.status) } : {}) }))} />],
          ["attempts.live", stale && shows("attempts.live") && <Card key="slot8" id="eb-today-stale" title="محاولات مفتوحة بلا نشاط" count={stale.count} tone="attention" empty="لا توجد محاولات مفتوحة متروكة." actionLabel="الواجبات" onAction={() => go("assignments")}
            summary={"لم يعمل عليها أصحابها منذ أكثر من 15 دقيقة، أو أوقفتها مؤقتًا. افتح المحاولة لتمديدها أو إنهائها من سجل العلامات."}
            items={stale.items.map(i => ({ key: "stale:" + i.assignmentId + ":" + i.studentId, label: i.studentName, meta: i.title + " · " + i.className + (activityText(i, now) ? " · " + activityText(i, now) : ""),
              ...(openAssignment ? { onOpen: openAssignment({ assignmentId: i.assignmentId, mode: "active", studentId: i.studentId }), ariaLabel: "افتح واجب " + i.title + " للطالب " + i.studentName + " — محاولة مفتوحة بلا نشاط" } : {}) }))} />],
          ["assignments.deadlines", opening && opening.count > 0 && shows("assignments.deadlines") && <Card key="slot9" id="eb-today-opening" title="تفتح خلال 24 ساعة" count={opening.count} tone="info" empty="" actionLabel="الواجبات" onAction={() => go("assignments")}
            items={opening.items.map(i => ({ key: "open:" + i.assignmentId, label: i.title, meta: "تفتح " + (untilText(i.openAt, now) || fmt(i.openAt)) + " · " + count(i.expected, STUDENTS) + " · " + i.className,
              ...(openAssignment ? { onOpen: openAssignment({ assignmentId: i.assignmentId, mode: "assignment" }), ariaLabel: "افتح واجب " + i.title + " — يفتح " + (untilText(i.openAt, now) || fmt(i.openAt)) } : {}) }))} />],
          ])}
        </div>
      )}
      {confirmDialog}
      <div className="eb-today-actions" role="group" aria-label="إجراءات سريعة">
        {shows("messages.unread") && <button type="button" className="eb-button is-small eb-today-action" onClick={() => go("messages")}><span className="eb-today-action-icon" aria-hidden="true"><IconMail size={18} /></span>فتح الرسائل</button>}
        {anyAssignments && <button type="button" className="eb-button is-small eb-today-action" onClick={() => go("assignments")}><span className="eb-today-action-icon" aria-hidden="true"><IconAssignments size={18} /></span>الواجبات</button>}
        <button type="button" className="eb-button is-small eb-today-action" onClick={() => go("students")}><span className="eb-today-action-icon" aria-hidden="true"><IconStudents size={18} /></span>الصفوف والطلاب</button>
        <button type="button" className="eb-button is-small eb-today-action" onClick={() => go("reports")}><span className="eb-today-action-icon" aria-hidden="true"><IconReports size={18} /></span>التقارير</button>
        {shows("projects.evaluation") && <button type="button" className="eb-button is-small eb-today-action" onClick={() => go("projects")}><span className="eb-today-action-icon" aria-hidden="true"><IconProjects size={18} /></span>المشاريع</button>}
        <button type="button" className="eb-button is-small eb-today-action" onClick={scrollToFeed}><span className="eb-today-action-icon" aria-hidden="true"><IconMedal size={18} /></span>تقدير طالب</button>
      </div>
      {data && shows("activity.recent") && !recentHidden && data.recent.length > 0 && (
        <section className="eb-today-recent" aria-labelledby="eb-today-recent-title">
          <h3 id="eb-today-recent-title" className="eb-subheading">آخر نشاط في صفوفك</h3>
          <ul className="eb-today-recent-list">
            {data.recent.map((e, i) => {
              const key = e.kind + ":" + e.assignmentId + ":" + e.studentId + ":" + e.at + ":" + i;
              const text = <span className="eb-today-recent-text"><strong>{e.studentName}</strong> {KIND[e.kind] || e.kind} «{e.title}»{typeof e.percentage === "number" ? " · " + Math.round(e.percentage) + "%" : ""} · {e.className}</span>;
              const time = <time className="eb-today-recent-time" dateTime={e.at} title={exactTime(e.at)}>{sinceText(e.at, now) || fmt(e.at)}</time>;
              const target = openAssignment ? recentActivityTarget(e) : null;
              // Phase 12B — same text and timestamp; with a safe target the row becomes ONE button (text + time inside).
              return target && openAssignment
                ? <li key={key} className="eb-today-recent-entry"><button type="button" className="eb-today-recent-item eb-today-recent-action" onClick={openAssignment(target)} aria-label={"افتح واجب " + e.title + " — " + e.studentName + " " + (KIND[e.kind] || e.kind)}>{text}{time}</button></li>
                : <li key={key} className="eb-today-recent-item">{text}{time}</li>;
            })}
          </ul>
        </section>
      )}
    </section>
  );
}
