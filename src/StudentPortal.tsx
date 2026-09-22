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
import { FILTERS, matchesFilter, medalsFor, nowItems, sortTaskFirst, type PortalFilter } from "./student/portalPresentation";
import { normalizeStrength } from "./student/strengthPresentation";
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); void loadFeed(); }, [token]);
  // Phase 1 auto-refresh: while the student sits on the MAIN portal, silently re-pull the dashboard (the single
  // source of teacher-controlled state) every 15s, and immediately on window focus / return to a visible tab, so
  // teacher-side changes appear without logout/login and without a full reload. DISABLED inside any sub-view that
  // owns its own state (the Reader `readerCourse`, an open exam/detail `detail`) or the avatar modal
  // (`avatarPickerOpen`), so a background swap never disturbs them; on returning to the main view it re-enables.
  // The lightweight, session-neutral achievement feed rides the same cycle (its 401 is already swallowed).
  const autoRefreshEnabled = !readerCourse && !detail && !avatarPickerOpen;
  useAutoRefresh(() => { void loadFeed({ silent: true }); return load({ silent: true }); }, { intervalMs: 15000, enabled: autoRefreshEnabled });

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
            // A graded training changes the server's Strength total → ONE dashboard reload on return (never per page).
            if (strengthDirtyRef.current) { strengthDirtyRef.current = false; void load(); }
          }}
        />
      </Suspense>
    );
  }
  if (detail && data) return <StudentExamPage token={token} assignment={detail} studentName={data.student.displayName || displayName} className={data.classroom ? data.classroom.name + (data.classroom.grade ? " · " + data.classroom.grade : "") : ""} onLogout={onLogout} onBack={() => { setDetail(null); void load(); }} />;

  const stats = data?.stats;
  const medals = data ? medalsFor(data.assignments) : [];
  // Unified Strength (25-stage model): the stage (1..25) and the within-stage progress are the SERVER's values in
  // `dashboard.strength` (library trainings + book-module completion), only mapped to the uploaded stage artwork/name
  // here — the client never re-derives the stage from totalPoints. (normalizeStrength falls back, as a whole, to a
  // zeroed stage-1 summary when no payload exists, so the hero never breaks.)
  const strength = data?.strength ?? null;
  const averageFinalized = stats && stats.averageFinalized !== null && stats.averageFinalized !== undefined ? Number(stats.averageFinalized) : null;
  const ordered = data ? sortTaskFirst(data.assignments) : [];
  const visible = ordered.filter(item => matchesFilter(item, filter));
  const now_ = data ? nowItems(data.assignments) : { actionable: [], upcoming: [] };
  const now = Date.now();

  return (
    <StudentShell studentName={data?.student.displayName || displayName} className={data?.classroom?.name || ""} onLogout={onLogout}>
      <div className="eb-sp">
        {loading && <p className="eb-muted eb-sp-status" role="status">جارٍ تحميل حسابك...</p>}
        {busy && <p className="eb-muted eb-sp-status" role="status">جارٍ فتح الواجب...</p>}
        {error && <div className="platform-error" role="alert">{error}</div>}
        {!loading && data && stats && (
          <>
            <StudentIdentityCard student={data.student} classroom={data.classroom} displayName={displayName} strength={strength} token={token} onChangeAvatar={() => setAvatarPickerOpen(true)} />
            <AvatarPickerDialog open={avatarPickerOpen} current={data.student.avatarId} saving={avatarSaving} photoManaged={!!data.student.profilePhoto} onPick={pickAvatar} onClose={() => setAvatarPickerOpen(false)} />
            <NowSection actionable={now_.actionable} upcoming={now_.upcoming} busy={busy} onOpen={open} />
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
                    {visible.map(item => <li key={item.assignmentId}><StudentAssignmentCard item={item} busy={busy} onOpen={open} /></li>)}
                  </ul>
                )}
                {!data.assignments.length && <EmptyState title="لا توجد مهام منشورة الآن" description="عندما يرسل المعلم واجبًا إلى صفك سيظهر هنا تلقائيًا." />}
                {!!data.assignments.length && !visible.length && <EmptyState compact title="لا توجد مهام في هذا التصنيف" description="جرّب تصنيفًا آخر." />}
              </div>
            </section>
            <StudentProjectPanel token={token} />
            <AchievementFeed posts={feed} error={feedError} shareOn={data.student.shareAchievements !== false} shareSaving={shareSaving} now={now} onToggleShare={toggleShareAchievements} onReact={(postId, reaction) => void react(postId, reaction)} />
          </>
        )}
      </div>
    </StudentShell>
  );
}
