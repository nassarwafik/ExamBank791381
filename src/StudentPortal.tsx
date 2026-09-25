import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAutoRefresh } from "./ui/useAutoRefresh";
import StudentExamPage from "./StudentExamPage";
import StudentShell from "./shell/StudentShell";
import StudentProjectPanel from "./projects/StudentProjectPanel";
import type { FeedPost, ReactionId } from "./achievements";
import SectionHeader from "./ui/SectionHeader";
import { lazyWithRetry } from "./lazyWithRetry";
import EmptyState from "./ui/EmptyState";
import { usePrefersReducedMotion } from "./ui/usePrefersReducedMotion";
import StudentIdentityCard from "./student/StudentIdentityCard";
import NowSection from "./student/NowSection";
import StudentProgressSection from "./student/StudentProgressSection";
import StudentLearningMaterials, { type StudentLearningCourse } from "./student/StudentLearningMaterials";
import StudentAssignmentCard from "./student/StudentAssignmentCard";
import AchievementFeed from "./student/AchievementFeed";
import AvatarPickerDialog from "./student/AvatarPickerDialog";
import InstallAppCard from "./pwa/InstallAppCard";
import MessagePushCard from "./pwa/MessagePushCard";
import StudentGamesPage from "./games/StudentGamesPage";
import StudentMessagesPage, { type StudentMessagesTab } from "./messages/StudentMessagesPage";
import { fetchNotificationCenter, fetchNotificationCounts, markNotificationEventRead, isMessageNotification, isAssignmentRoute, type NotificationItem, type NotificationCounts } from "./notifications/notificationsClient";
import type { NotificationCounts as BellCounts } from "./notifications/NotificationBell";
import { FILTERS, matchesFilter, medalsFor, nowItems, sortTaskFirst, type PortalFilter } from "./student/portalPresentation";
import { normalizeStrength } from "./student/strengthPresentation";
import { stageVisual } from "./studentStageVisuals";
import { normalizeRecognition } from "./student/recognitionPresentation";
import type { Dashboard, Detail, Summary } from "./student/types";

type Props = { token: string; displayName: string; onLogout: () => void };

// Class Learning Materials: the student's Reader (the shared LearningReader behind a restricted content API) is
// code-split so opening the portal never loads the Reader or any book body — only «فتح المادة» does.
const StudentReader = lazy(lazyWithRetry(() => import("./student/StudentReader"), "student-reader"));

/**
 * Student Portal (UX-7a — mobile-first, actionable-first). Hierarchy: who am I → what should I do now →
 * how am I progressing → all assignments/results → my projects → achievements. Data and session rules are
 * unchanged: exactly one /api/student-dashboard read (the ONLY session authority: its 401 logs out), one
 * optional achievement-feed read and the optional project panel's own read; a POST happens only for an
 * explicit action (avatar, share toggle, reaction). Everything shown (grading, dashboard state, finalized-only
 * average, medals, personal rank) is derived from the server payload — never from a raw score.
 */
export default function StudentPortal({ token, displayName, onLogout }: Props) {
  const [data, setData] = useState<Dashboard | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [detail, setDetail] = useState<Detail | null>(null), [busy, setBusy] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false), [avatarSaving, setAvatarSaving] = useState(false);
  const [feed, setFeed] = useState<FeedPost[]>([]), [feedError, setFeedError] = useState(""), [shareSaving, setShareSaving] = useState(false);
  const [filter, setFilter] = useState<PortalFilter>("all");
  // The learning course currently open in the Reader (its published module ids as re-validated at open time).
  const [readerCourse, setReaderCourse] = useState<StudentLearningCourse | null>(null);
  // The dedicated Educational Games destination (a full-view swap, like the Reader/exam) — opened from the shell.
  const [gamesOpen, setGamesOpen] = useState(false);
  // Phase 5C — the dedicated «الرسائل» destination (same full-view swap); it owns its own small polling lifecycle.
  const [messagesOpen, setMessagesOpen] = useState(false);
  // Phase 5D — unread messages badge (AUXILIARY: its failure, including a 401, never logs out — the dashboard stays the
  // only session authority; a failure keeps the last-good badge). Rides the portal's silent refresh cycle.
  const [messagesUnread, setMessagesUnread] = useState<{ total: number; capped: boolean }>({ total: 0, capped: false });
  // Phase 6C — the tab the Messages view opens on («الرسائل» → direct; a notification → its own stream).
  const [messagesTab, setMessagesTab] = useState<StudentMessagesTab>("direct");
  // Phase 6C/6D — the notification center's preview data (AUXILIARY like the badges: a failure keeps the last-good items
  // and never logs out). `items: null` = not loaded yet / invalidated.
  const [notif, setNotif] = useState<{ items: NotificationItem[] | null; loading: boolean; error: string }>({ items: null, loading: false, error: "" });
  const [notifOpen, setNotifOpen] = useState(false);
  // Phase 6D — TWO counts, both server snapshots: `messagesUnread` («الرسائل», message-only — Phase 5D) above, and the bell's
  // UNIFIED counts («الإشعارات» = messages + non-message events) here. The bell count is only ever set from a unified server
  // snapshot (/api/student-notifications) — never from the Messages page's message-only counts, never by arithmetic.
  const [bellCounts, setBellCounts] = useState<BellCounts | null>(null);
  // A small, non-fatal message after a notification could not be routed (e.g. «لم تعد هذه المادة متاحة»).
  const [notice, setNotice] = useState("");
  const [highlightPostId, setHighlightPostId] = useState("");
  // ONE ordering for every unread snapshot — the badge poll, the notification read (items + count from one server
  // snapshot) and the Messages page's counts: each takes the next sequence number when it STARTS, and a snapshot is
  // applied only if nothing that started later has already been applied. So a slow/stale response can never resurrect
  // an older count, and a preview becomes current ONLY together with its own count: once a newer snapshot applied,
  // an older preview (count AND items) is dropped. A newer count-only snapshot also drops the cached preview items,
  // which it has made stale (the next open loads fresh ones; they are never shown as current meanwhile).
  // `notifSeq` additionally invalidates in-flight previews (return from Messages, session change); `alive` drops
  // everything after unmount (logout).
  const unreadSeq = useRef(0), unreadApplied = useRef(0), notifSeq = useRef(0), alive = useRef(true), notifOpenRef = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { notifOpenRef.current = notifOpen; }, [notifOpen]);
  const headers = { "x-student-token": token, Authorization: "Bearer " + token };
  const strengthDirtyRef = useRef(false);

  // `silent` = a background auto-refresh (interval / focus / visibility). A silent refresh must NOT flip the portal
  // back to the blocking "جارٍ تحميل حسابك..." spinner (which hides all content) and must NOT wipe the currently
  // shown dashboard on a transient failure — it silently swaps in fresh data on success, preserves the last-good
  // data on failure, and clears any stale error banner once a refresh succeeds. The initial/manual load (silent
  // omitted → false) keeps its exact previous behaviour. The 401 → onLogout session authority is preserved in BOTH
  // modes: /api/student-dashboard is still the only session authority, so a revoked session logs out even in the
  // background (never a silent zombie session).
  async function load({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) { setLoading(true); setError(""); }
    try {
      const r = await fetch("/api/student-dashboard", { headers }), j = await r.json() as any;
      if (r.status === 401) { onLogout(); return; }
      if (!r.ok || !j.student || !j.stats) throw new Error(j.error || "تعذر تحميل صفحة الطالب.");
      setData({ student: j.student, classroom: j.classroom || null, assignments: j.assignments || [], stats: j.stats, strength: normalizeStrength(j.strength), recognition: normalizeRecognition(j.recognition) });
      if (silent) setError("");   // a successful background refresh clears any stale error banner
    } catch (e) { if (!silent) setError(e instanceof Error ? e.message : "تعذر تحميل الصفحة."); }   // silent failure: keep last-good data, no flicker
    finally { if (!silent) setLoading(false); }
  }
  // OPTIONAL/auxiliary panel. Its failure — including a 401 — must NEVER end the authenticated session:
  // only the PRIMARY /api/student-dashboard request (load()) is the session authority and may call
  // onLogout. Any failure here degrades this panel locally (no feed) and leaves the portal intact. This
  // mirrors StudentProjectPanel (fix a3761c8) so a secondary widget can't bounce a valid student to login.
  async function loadFeed({ silent = false }: { silent?: boolean } = {}) {
    try {
      const r = await fetch("/api/achievement-feed", { headers });
      // On a background (silent) refresh, a transient failure must NOT clear the currently shown feed — leave the
      // last-good posts in place (no flicker) and try again next cycle. The initial/manual load is unchanged.
      if (!r.ok) { if (!silent) { setFeed([]); setFeedError(r.status === 401 ? "" : "تعذر تحميل إنجازات الصف."); } console.warn("[student-portal] achievement feed unavailable (" + r.status + ")"); return; }
      const j = await r.json() as any;
      if (!j.ok) { if (!silent) setFeed([]); return; }
      setFeed(j.posts || []); setFeedError("");
    } catch { if (!silent) setFeed([]); console.warn("[student-portal] achievement feed request failed"); }
  }
  /**
   * Apply the unread snapshot of request `seq` — only when no later-started snapshot was applied already. Returns
   * whether it applied. A count-only snapshot (`withItems` false) makes the cached preview items stale → they are
   * dropped (an in-flight newer preview still applies when it lands; loading state is left to it).
   */
  // `unified` = the server's unified counts of the SAME snapshot (absent for the Messages page's message-only counts: the
  // «الرسائل» badge updates at once, the bell keeps its last server total until the next unified snapshot — never a guess).
  function applyUnread(seq: number, u: { total: number; capped: boolean }, withItems = false, unified: NotificationCounts | null = null): boolean {
    if (!alive.current || seq <= unreadApplied.current) return false;
    unreadApplied.current = seq;
    setMessagesUnread(u);
    if (unified) setBellCounts({ bell: unified.bell, events: unified.events, messages: u });
    else setBellCounts(prev => (prev ? { ...prev, messages: u } : prev));
    if (!withItems) setNotif(prev => (prev.items === null && !prev.error ? prev : { ...prev, items: null, error: "" }));
    return true;
  }
  const messageCount = (c: NotificationCounts) => ({ total: c.messages.totalUnread, capped: c.messages.totalCapped });
  // Phase 6D — ONE lightweight unified count read (both badges from one server snapshot). A failure — including a 401 —
  // keeps the last-good badges and never logs out.
  async function loadMessagesUnread() {
    const seq = ++unreadSeq.current;
    try {
      const c = await fetchNotificationCounts(token);
      applyUnread(seq, messageCount(c), false, c);
    } catch { /* keep the last-good badges */ }
  }
  // Phase 6C/6D — the notification center's read: recent unified items + the SAME server counts (one request).
  // READ-ONLY (never marks anything read). A failure — including a 401 — keeps the last-good items and shows a small
  // error in the panel; the dashboard stays the only session authority.
  async function loadNotifications() {
    const seq = ++unreadSeq.current, mine = ++notifSeq.current;
    setNotif(prev => ({ ...prev, loading: true }));
    try {
      const n = await fetchNotificationCenter(token);
      if (!alive.current || mine !== notifSeq.current) return;           // a newer read (or an invalidation) owns the panel
      if (!applyUnread(seq, messageCount(n.counts), true, n.counts)) {
        // A newer authoritative snapshot applied after this read started: its items are stale and never become current.
        setNotif(prev => ({ ...prev, loading: false }));
        if (notifOpenRef.current) void loadNotifications();               // an open panel reloads (bounded: needs a newer writer)
        return;
      }
      setNotif({ items: n.items, loading: false, error: "" });
    } catch {
      if (!alive.current || mine !== notifSeq.current) return;
      setNotif(prev => ({ ...prev, loading: false, error: "تعذر تحديث الإشعارات حاليًا." }));
    }
  }
  /** The preview no longer matches the server's read state (the student read messages): drop it and any in-flight read. */
  function invalidateNotifications() {
    notifSeq.current += 1;
    setNotif({ items: null, loading: false, error: "" });
  }
  /**
   * Phase 6D — acknowledge ONE non-message event server-side (never a message: those are acknowledged by the Messages
   * page). The response carries FRESH server counts (never `total - 1`), applied under the same ordering as every other
   * snapshot. A failure keeps the last-good badges (the event simply stays unread).
   */
  async function acknowledgeEvent(id: string) {
    const seq = ++unreadSeq.current;
    try {
      const c = await markNotificationEventRead(token, id);
      applyUnread(seq, messageCount(c), false, c);
    } catch { /* keep the last-good badges */ }
  }
  /** Route an assignment-related notification through the dashboard's server-validated assignment list. */
  function routeAssignment(assignmentId: string) {
    const summary = data?.assignments.find(a => a.assignmentId === assignmentId);
    if (!summary) { setNotice("هذا الواجب لم يعد متاحًا."); return; }
    if (summary.availability === "scheduled") {
      setNotice("لم يُفتح هذا الواجب بعد. سيظهر في «المهام والواجبات» عند موعد فتحه.");
      setFilter("all");
      window.setTimeout(() => { const el = document.getElementById("eb-sp-task-" + assignmentId); el?.scrollIntoView?.({ block: "center", behavior: reducedMotion ? "auto" : "smooth" }); el?.focus?.(); }, 0);
      return;
    }
    void open(summary);                                                  // /api/student-assignment stays the authority
  }
  /** Re-validate a learning-material notification against the CURRENT entitlement before opening the Reader. */
  async function routeMaterial(courseId: string, moduleId: string) {
    try {
      const r = await fetch("/api/student-learning-materials", { headers });
      const j = await r.json().catch(() => ({})) as { ok?: boolean; materials?: StudentLearningCourse[] };
      if (!r.ok || !j.ok) { setNotice("تعذر فتح المادة التعليمية حاليًا."); return; }      // incl. 401 → never a logout here
      const course = (j.materials || []).find(c => c.courseId === courseId && c.modules.some(m => m.moduleId === moduleId));
      if (!course) { setNotice("لم تعد هذه المادة متاحة."); return; }
      setReaderCourse(course);
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    } catch { setNotice("تعذر فتح المادة التعليمية حاليًا."); }
  }
  /** Bring the student to their achievement and focus the post the teacher recognized (no second achievement model). */
  function routeRecognition(postId: string) {
    setHighlightPostId(postId);
    window.setTimeout(() => {
      const post = document.getElementById("eb-sp-post-" + postId);
      const target = post || document.getElementById("eb-sp-feed-title");
      target?.scrollIntoView?.({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
      post?.focus?.();
    }, 0);
  }
  /** A bell selection: messages → the Messages page (it acknowledges); an event → acknowledged here, then routed. */
  function selectNotification(item: NotificationItem) {
    setNotice("");
    if (isMessageNotification(item)) { openMessages(item.type === "announcement" ? "announcements" : "direct"); return; }
    setNotifOpen(false);
    if (item.unread) void acknowledgeEvent(item.id);
    if (item.type === "learning_module_published") { void routeMaterial(item.courseId, item.moduleId); return; }
    if (item.type === "teacher_reaction" || item.type === "teacher_note") { routeRecognition(item.postId); return; }
    if (isAssignmentRoute(item)) routeAssignment(item.assignmentId);
  }
  // A new session (token) starts clean: every in-flight count/preview of the previous one is dropped.
  useEffect(() => {
    unreadApplied.current = unreadSeq.current;
    notifSeq.current += 1;
    setMessagesUnread({ total: 0, capped: false });
    setBellCounts(null);
    setNotice("");
    setNotif({ items: null, loading: false, error: "" });
    void load(); void loadFeed(); void loadMessagesUnread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  // Phase 1 auto-refresh: while the student sits on the MAIN portal, silently re-pull the dashboard (the single
  // source of teacher-controlled state) every 15s, and immediately on window focus / return to a visible tab, so
  // teacher-side changes appear without logout/login and without a full reload. DISABLED inside any sub-view that
  // owns its own state (the Reader `readerCourse`, an open exam/detail `detail`) or the avatar modal
  // (`avatarPickerOpen`), so a background swap never disturbs them; on returning to the main view it re-enables.
  // The lightweight, session-neutral achievement feed rides the same cycle (its 401 is already swallowed).
  const autoRefreshEnabled = !readerCourse && !detail && !avatarPickerOpen && !gamesOpen && !messagesOpen;
  // Same cadence for the bell: while its panel is open the notification read (items + the same counts) replaces the
  // badge-only read — never both, and nothing extra while it is closed.
  useAutoRefresh(() => { void loadFeed({ silent: true }); void (notifOpen ? loadNotifications() : loadMessagesUnread()); return load({ silent: true }); }, { intervalMs: 15000, enabled: autoRefreshEnabled });

  /** Open the dedicated Messages view on `tab` (the ordinary «الرسائل» entry → the default direct conversation). */
  function openMessages(tab: StudentMessagesTab) {
    setNotifOpen(false);
    setMessagesTab(tab);
    setMessagesOpen(true);
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }

  async function pickAvatar(avatarId: string) {
    if (avatarSaving) return;
    setAvatarSaving(true);
    try {
      const r = await fetch("/api/student-profile", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ action: "setAvatar", avatarId }) }), j = await r.json() as any;
      if (r.status === 401) { onLogout(); return; }
      if (!r.ok || !j.ok) throw new Error(j.error || "تعذر تحديث الأيقونة.");
      setData(prev => prev ? { ...prev, student: { ...prev.student, avatarId: j.avatarId } } : prev);
      setAvatarPickerOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحديث الأيقونة."); }
    finally { setAvatarSaving(false); }
  }
  async function toggleShareAchievements() {
    if (shareSaving || !data) return;
    const next = !(data.student.shareAchievements !== false);
    setShareSaving(true);
    try {
      const r = await fetch("/api/student-profile", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ action: "setShareAchievements", share: next }) }), j = await r.json() as any;
      if (r.status === 401) { onLogout(); return; }
      if (!r.ok || !j.ok) throw new Error(j.error || "تعذر تحديث الإعداد.");
      setData(prev => prev ? { ...prev, student: { ...prev.student, shareAchievements: j.shareAchievements } } : prev);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحديث الإعداد."); }
    finally { setShareSaving(false); }
  }
  // Reacting hits the SAME optional achievement-feed endpoint, so a 401 here also degrades locally
  // (feature unavailable) and never logs the student out — the primary dashboard governs the session.
  async function react(postId: string, reaction: ReactionId) {
    try {
      const r = await fetch("/api/achievement-feed", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ action: "react", postId, reaction }) }), j = await r.json() as any;
      if (r.status === 401) { setFeedError(""); return; }
      if (!r.ok || !j.ok) throw new Error(j.error || "تعذر إرسال ردّ الفعل.");
      setFeed(prev => prev.map(p => p.postId === postId ? { ...p, reactionCounts: j.reactionCounts, myReaction: j.myReaction } : p));
    } catch (e) { setFeedError(e instanceof Error ? e.message : "تعذر إرسال ردّ الفعل."); }
  }
  async function open(item: Summary) {
    if (item.availability === "scheduled") return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/student-assignment/" + encodeURIComponent(item.assignmentId), { headers }), j = await r.json() as any;
      if (r.status === 401) { onLogout(); return; }
      if (!r.ok || !j.assignment) throw new Error(j.error || "تعذر فتح الواجب.");
      setDetail(j.assignment);
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" }); // UX-8b — reduced-motion aware
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر فتح الواجب."); }
    finally { setBusy(false); }
  }

  // Full-screen Reader over the portal (same swap pattern as the exam page); back returns to the portal.
  if (readerCourse && data) {
    return (
      <Suspense fallback={<p className="eb-muted eb-sp-status" role="status">جارٍ فتح المادة التعليمية...</p>}>
        <StudentReader
          courseId={readerCourse.courseId}
          allowedModuleIds={readerCourse.modules.map(m => m.moduleId)}
          token={token}
          onTrainingSubmitted={() => { strengthDirtyRef.current = true; }}
          onStudyPointsEarned={() => { strengthDirtyRef.current = true; }}
          onExit={() => {
            setReaderCourse(null);
            window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
            // A graded training (T/F — the SAME bucket as the Training Library) or a study point inside the Reader changes
            // the server's Strength → ONE silent authoritative dashboard reload on return (never per page, never a full
            // page refresh, never while the Reader is open); the stage shown is the server's new stage.
            if (strengthDirtyRef.current) { strengthDirtyRef.current = false; void load({ silent: true }); }
          }}
        />
      </Suspense>
    );
  }
  if (detail && data) return <StudentExamPage token={token} assignment={detail} studentName={data.student.displayName || displayName} className={data.classroom ? data.classroom.name + (data.classroom.grade ? " · " + data.classroom.grade : "") : ""} onLogout={onLogout} onBack={() => { setDetail(null); void load(); }} />;
  // Dedicated Educational Games destination (full-view swap, same pattern as the Reader/exam); back returns to the portal.
  // Dedicated Messages destination (Phase 5C): a messaging failure degrades inside that view; this portal's
  // /api/student-dashboard refresh stays the only session authority when the student comes back.
  // Phase 6C — the Messages view's counts (its own polls and mark responses) are fresher than anything the portal
  // started before: they take a new sequence number, so an older in-flight portal read can never overwrite them.
  if (messagesOpen) return <StudentMessagesPage token={token} initialTab={messagesTab} onUnreadChange={u => applyUnread(++unreadSeq.current, { total: u.totalUnread, capped: u.totalCapped })} onBack={() => { setMessagesOpen(false); invalidateNotifications(); void loadMessagesUnread(); window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" }); }} />;
  if (gamesOpen) return <StudentGamesPage token={token} onBack={() => { setGamesOpen(false); window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" }); }} />;

  const stats = data?.stats;
  const medals = data ? medalsFor(data.assignments) : [];
  // Unified Strength: the 25-stage path (stage number, within-stage points, percent, next stage) is the SERVER's value
  // in `dashboard.strength` (exams + practice + study + projects), only shaped/labelled here — the client never
  // derives a stage from a total. No payload → the progress section shows an explicit "unavailable" state.
  const strength = data?.strength ?? null;
  const stageGroup = strength ? stageVisual(strength.stageNumber).group.id : null;
  const averageFinalized = stats && stats.averageFinalized !== null && stats.averageFinalized !== undefined ? Number(stats.averageFinalized) : null;
  const ordered = data ? sortTaskFirst(data.assignments) : [];
  const visible = ordered.filter(item => matchesFilter(item, filter));
  const now_ = data ? nowItems(data.assignments) : { actionable: [], upcoming: [] };
  const now = Date.now();

  return (
    <StudentShell studentName={data?.student.displayName || displayName} className={data?.classroom?.name || ""} onLogout={onLogout} onOpenGames={() => { setGamesOpen(true); window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" }); }} onOpenMessages={() => openMessages("direct")} messagesUnread={messagesUnread} notifications={{
      items: notif.items, counts: bellCounts, loading: notif.loading, error: notif.error,
      onOpenChange: next => { setNotifOpen(next); if (next) void loadNotifications(); },
      onSelect: selectNotification,
      onOpenMessages: () => openMessages("direct"),
      onRetry: () => void loadNotifications()
    }}>
      <div className="eb-sp">
        {loading && <p className="eb-muted eb-sp-status" role="status">جارٍ تحميل حسابك...</p>}
        {busy && <p className="eb-muted eb-sp-status" role="status">جارٍ فتح الواجب...</p>}
        {error && <div className="platform-error" role="alert">{error}</div>}
        {notice && <div className="platform-notice eb-sp-notice" role="status">{notice}<button type="button" className="eb-notif-retry" onClick={() => setNotice("")}>إغلاق</button></div>}
        {!loading && data && stats && (
          <>
            <StudentIdentityCard student={data.student} classroom={data.classroom} displayName={displayName} stageGroup={stageGroup} token={token} onChangeAvatar={() => setAvatarPickerOpen(true)} />
            <AvatarPickerDialog open={avatarPickerOpen} current={data.student.avatarId} saving={avatarSaving} photoManaged={!!data.student.profilePhoto} onPick={pickAvatar} onClose={() => setAvatarPickerOpen(false)} />
            <NowSection actionable={now_.actionable} upcoming={now_.upcoming} busy={busy} onOpen={open} />
            <InstallAppCard />
            <MessagePushCard token={token} />
            <StudentLearningMaterials token={token} onOpen={course => { setReaderCourse(course); window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" }); }} />
            <StudentProgressSection stats={stats} medals={medals} strength={strength} recognition={data?.recognition ?? null} averageFinalized={averageFinalized} />
            <section className="eb-sp-panel" aria-labelledby="eb-sp-tasks-title">
              <SectionHeader level={2} id="eb-sp-tasks-title" title="المهام والواجبات" count={visible.length} description="كل واجباتك ونتائجك؛ ما يحتاج إجراءً يظهر أولًا." />
              <div className="eb-sp-filters" role="group" aria-label="تصفية المهام">
                {FILTERS.map(f => <button key={f.key} type="button" className="eb-chip-button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>)}
              </div>
              <div className="student-assignment-list">
                {visible.length > 0 && (
                  <ul className="eb-sp-tasks">
                    {visible.map(item => <li key={item.assignmentId} id={"eb-sp-task-" + item.assignmentId} tabIndex={-1}><StudentAssignmentCard item={item} busy={busy} onOpen={open} /></li>)}
                  </ul>
                )}
                {!data.assignments.length && <EmptyState title="لا توجد مهام منشورة الآن" description="عندما يرسل المعلم واجبًا إلى صفك سيظهر هنا تلقائيًا." />}
                {!!data.assignments.length && !visible.length && <EmptyState compact title="لا توجد مهام في هذا التصنيف" description="جرّب تصنيفًا آخر." />}
              </div>
            </section>
            <StudentProjectPanel token={token} contributions={strength?.projects ?? []} />
            <AchievementFeed highlightPostId={highlightPostId} posts={feed} error={feedError} shareOn={data.student.shareAchievements !== false} shareSaving={shareSaving} now={now} onToggleShare={toggleShareAchievements} onReact={(postId, reaction) => void react(postId, reaction)} />
          </>
        )}
      </div>
    </StudentShell>
  );
}
