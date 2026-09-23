import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconChevronBack } from "../../icons";
import { createTeacherLiveSessionClient, type TeacherLiveSessionClient, type TeacherLobby, type ClassOption, type StudentOption } from "./liveSessionClient";
import LiveChallengeQuestion from "./LiveChallengeQuestion";
import { LiveStandingsTable, LivePodium } from "./LiveChallengeLeaderboard";
import { useLobbyPoll } from "./useLobbyPoll";
import { writeTeacherRoom, clearTeacherRoom } from "./liveSessionRecovery";
import "../games.css";

// Teacher LIVE SESSION (Phase 4A lobby + Phase 4B round engine). From a SAVED challenge the teacher picks a class +
// participants (via the EXISTING /api/classrooms and /api/students?classId), creates a room, watches a polled lobby,
// then runs the live round: ابدأ التحدّي → per-question "أجاب X من Y" → السؤال التالي → إنهاء التحدّي. The teacher sees
// the SANITIZED current question only (no answer key). Recovery DISCOVERY lives one level up in LiveChallengeGenerator
// (the Live Challenge home): when it finds a still-owned remembered room it re-enters this component with
// `initialSession`. Here we only WRITE the reconnect hint on create and CLEAR it on a successful close; normal Back
// keeps it. No leaderboard / podium / medals / Strength here — later phases.
const POLL_MS = 2000;

/** Durable lobby state label (NOT presence): لم ينضم / انضم / جاهز — text always present, never colour-only. */
function statusLabel(p: { joined: boolean; ready: boolean }): string {
  return p.ready ? "جاهز" : p.joined ? "انضم" : "لم ينضم";
}

export default function TeacherLiveLobby({ token, challengeId, challengeTitle, onBack, client: injected, initialSession }: {
  token: string; challengeId: string; challengeTitle: string; onBack: () => void; client?: TeacherLiveSessionClient; initialSession?: TeacherLobby;
}) {
  const clientRef = useRef<TeacherLiveSessionClient>(injected || createTeacherLiveSessionClient(token));
  // A recovered session (validated by the parent) starts us directly in the lobby/live view; otherwise begin at setup.
  const [phase, setPhase] = useState<"setup" | "lobby">(initialSession ? "lobby" : "setup");
  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentOption[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [lobby, setLobby] = useState<TeacherLobby | null>(initialSession || null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);               // any teacher mutation (start/next/finish/close) — pauses polling
  const classReqRef = useRef(0);                          // request-generation guard for class-switch roster loads

  // Load the teacher's classes once (only needed for the setup/create flow).
  useEffect(() => {
    let ok = true;
    clientRef.current.listClasses().then(cs => { if (ok) setClasses(cs); }).catch(() => { if (ok) { setClasses([]); setError("تعذّر تحميل الصفوف."); } });
    return () => { ok = false; };
  }, []);

  // Load the selectable (active, non-archived) students whenever the class changes.
  const onPickClass = useCallback(async (id: string) => {
    const reqId = ++classReqRef.current;                  // a newer selection bumps this; a late older response is dropped
    setClassId(id); setStudents(null); setSelected(new Set()); setError("");
    if (!id) return;
    try {
      const list = await clientRef.current.listStudents(id);
      if (classReqRef.current !== reqId) return;          // superseded by a newer class pick — ignore this roster
      setStudents(list.filter(s => s.active !== false && s.archived !== true));
    } catch {
      if (classReqRef.current !== reqId) return;
      setStudents([]); setError("تعذّر تحميل الطلاب.");
    }
  }, []);

  const selectableIds = useMemo(() => (students || []).map(s => s.userId), [students]);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));
  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selectAll = () => setSelected(new Set(selectableIds));
  const clearAll = () => setSelected(new Set());

  const createRoom = useCallback(async () => {
    const studentIds = selectableIds.filter(id => selected.has(id));
    if (studentIds.length === 0) return;
    setCreating(true); setError("");
    try {
      const r = await clientRef.current.create({ challengeId, classId, studentIds });
      if (r.ok && r.session) { setLobby(r.session); setPhase("lobby"); writeTeacherRoom(r.session.joinCode); }
      else setError(r.error || "تعذّر إنشاء الغرفة.");
    } catch { setError("تعذّر إنشاء الغرفة."); }
    finally { setCreating(false); }
  }, [challengeId, classId, selected, selectableIds]);

  // Poll while the room is live (lobby or active). Pauses while a teacher mutation is busy so an older GET cannot
  // overwrite the newer start/next/finish/close response (the poll effect tears down and any in-flight GET goes stale).
  const live = !!lobby && (lobby.status === "lobby" || lobby.status === "active");
  const polling = phase === "lobby" && live && !busy;
  const pollFn = useCallback(async (isCurrent: () => boolean) => {
    if (!lobby) return;
    const s = await clientRef.current.get(lobby.joinCode);
    if (isCurrent() && s) setLobby(s);
  }, [lobby]);
  useLobbyPoll(polling, POLL_MS, pollFn);

  // A single helper for the round mutations: pause polling (busy), run the action on the freshest server doc, adopt the
  // returned view. On a stale/conflict the next poll reconciles; other errors surface a message.
  const runAction = useCallback(async (fn: () => Promise<{ ok: boolean; session?: TeacherLobby; code?: string; error?: string }>, failMsg: string) => {
    setBusy(true); setError("");
    try { const r = await fn(); if (r.ok && r.session) setLobby(r.session); else if (r.session) setLobby(r.session); else if (!r.code) setError(r.error || failMsg); }
    catch { setError(failMsg); }
    finally { setBusy(false); }
  }, []);

  const startGame = useCallback(() => { if (lobby) void runAction(() => clientRef.current.start(lobby.joinCode), "تعذّر بدء التحدّي."); }, [lobby, runAction]);
  const nextQuestion = useCallback(() => { if (lobby?.round) void runAction(() => clientRef.current.next(lobby.joinCode, lobby.round!.roundVersion), "تعذّر الانتقال للسؤال التالي."); }, [lobby, runAction]);
  const finishGame = useCallback(() => { if (lobby?.round) void runAction(() => clientRef.current.finish(lobby.joinCode, lobby.round!.roundVersion), "تعذّر إنهاء التحدّي."); }, [lobby, runAction]);

  const closeRoom = useCallback(async () => {
    if (!lobby) return;
    setConfirmClose(false); setBusy(true);
    try {
      const r = await clientRef.current.close(lobby.joinCode);
      // Clear the reconnect hint ONLY when the close actually succeeds. If it failed, keep the hint so the teacher
      // can still recover the room.
      if (r.ok && r.session) { setLobby(r.session); clearTeacherRoom(); }
      else setError("تعذّر إغلاق الغرفة.");
    } catch { setError("تعذّر إغلاق الغرفة."); }
    finally { setBusy(false); }
  }, [lobby]);

  // Normal navigation away (رجوع إلى الألعاب) KEEPS the reconnect hint; it is cleared only by an explicit تجاهل, a
  // successful close, or server revalidation (closed / foreign / unknown) on the next mount.
  const leave = useCallback(() => { onBack(); }, [onBack]);

  // ── Setup: class + participant selection ──
  if (phase === "setup") {
    const selCount = selectableIds.filter(id => selected.has(id)).length;
    return (
      <div className="student-portal eb-student-shell eb-games-surface eb-lc eb-lc-live" dir="rtl">
        <div className="eb-games-surface-bar">
          <button type="button" className="eb-button is-quiet is-small" onClick={leave}>
            <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />رجوع
          </button>
        </div>
        <section className="eb-games-page" aria-labelledby="eb-lc-live-title">
          <header className="eb-games-page-head">
            <h2 id="eb-lc-live-title" className="eb-games-page-title">إنشاء غرفة مباشرة</h2>
            <p className="eb-games-page-desc">التحدّي: {challengeTitle || "بدون عنوان"}</p>
          </header>
          {error && <div className="platform-error" role="alert">{error}</div>}
          <div className="eb-lc-card eb-lc-setup">
            <label className="eb-lc-field">
              <span className="eb-lc-field-label">الصف</span>
              <select className="sb-input" value={classId} onChange={e => onPickClass(e.target.value)} disabled={classes === null}>
                <option value="">اختر صفًا…</option>
                {(classes || []).map(c => <option key={c.classId} value={c.classId}>{c.name || c.classId}</option>)}
              </select>
            </label>

            {classId && (
              <div className="eb-lc-students" aria-label="الطلاب">
                {students === null && <p className="eb-muted" role="status">جارٍ تحميل الطلاب…</p>}
                {students !== null && students.length === 0 && <p className="eb-muted">لا يوجد طلاب متاحون في هذا الصف.</p>}
                {students !== null && students.length > 0 && (
                  <>
                    <div className="eb-lc-students-bar">
                      <span className="eb-lc-sel-count" role="status" aria-live="polite">المحدّد: <span dir="ltr">{selCount} / {students.length}</span></span>
                      <div className="eb-lc-students-actions">
                        <button type="button" className="eb-button is-quiet is-small" onClick={selectAll} aria-pressed={allSelected} disabled={allSelected}>اختيار الكل</button>
                        <button type="button" className="eb-button is-quiet is-small" onClick={clearAll} disabled={selCount === 0}>إلغاء تحديد الكل</button>
                      </div>
                    </div>
                    <ul className="eb-lc-student-list">
                      {students.map(s => (
                        <li key={s.userId}>
                          <label className="eb-lc-student-row">
                            <input type="checkbox" checked={selected.has(s.userId)} onChange={() => toggle(s.userId)} />
                            <span className="eb-lc-student-name">{s.displayName || s.userId}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            <div className="eb-lc-setup-foot">
              <button type="button" className="eb-button is-primary" onClick={createRoom} disabled={creating || selCount === 0}>
                {creating ? "جارٍ الإنشاء…" : "إنشاء الغرفة"}
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // ── Lobby / live round ──
  if (!lobby) return null;
  const status = lobby.status;
  const closed = status === "closed";
  const finished = status === "finished";
  const active = status === "active";
  const round = lobby.round;
  const isLastQuestion = !!round && round.questionNumber != null && round.questionNumber >= round.questionCount;
  const competition = lobby.competition;
  // The live leaderboard is shown only once at least one round is COMPLETED (the server already excludes the current
  // active round from `completedRounds`, so a teacher never sees mid-round points before advancing).
  const showActiveStandings = active && !!competition && competition.completedRounds >= 1 && competition.standings.length > 0;
  return (
    <div className="student-portal eb-student-shell eb-games-surface eb-lc eb-lc-live" dir="rtl">
      <div className="eb-games-surface-bar">
        <button type="button" className="eb-button is-quiet is-small" onClick={leave}>
          <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />رجوع إلى الألعاب
        </button>
      </div>
      <section className="eb-games-page" aria-labelledby="eb-lc-lobby-title">
        <header className="eb-games-page-head">
          <h2 id="eb-lc-lobby-title" className="eb-games-page-title">التحدّي المباشر</h2>
          <p className="eb-games-page-desc">{lobby.challengeTitle || "بدون عنوان"}</p>
        </header>
        {error && <div className="platform-error" role="alert">{error}</div>}

        <div className="eb-lc-card eb-lc-lobby">
          <div className="eb-lc-lobby-code">
            <span className="eb-lc-lobby-code-label">رمز الدخول</span>
            <strong className="eb-lc-lobby-code-value" dir="ltr">{lobby.joinCode}</strong>
          </div>

          {status === "lobby" && (
            <>
              <div className="eb-lc-lobby-stats">
                <span className="eb-lc-lobby-stat">عدد الطلاب: <span dir="ltr">{lobby.counts.joined} / {lobby.counts.total}</span> انضموا</span>
                <span className="eb-lc-lobby-stat">جاهزون: <span dir="ltr">{lobby.counts.ready} / {lobby.counts.total}</span></span>
              </div>
              <div className="eb-lc-lobby-actions">
                <button type="button" className="eb-button is-primary" onClick={startGame} disabled={busy || lobby.counts.joined === 0}>
                  {busy ? "…" : "ابدأ التحدّي"}
                </button>
              </div>
            </>
          )}

          {active && round && (
            <div className="eb-lc-round eb-lc-round-teacher">
              <div className="eb-lc-round-head">
                <span className="eb-lc-round-num" role="status">السؤال <span dir="ltr">{round.questionNumber} / {round.questionCount}</span></span>
                <span className="eb-lc-round-answered" role="status" aria-live="polite">أجاب <span dir="ltr">{round.answered} من {round.playing}</span></span>
              </div>
              {round.question && <LiveChallengeQuestion q={round.question} index={(round.questionNumber || 1) - 1} answer={undefined} onAnswer={() => {}} disabled />}
              <div className="eb-lc-lobby-actions">
                {isLastQuestion
                  ? <button type="button" className="eb-button is-primary" onClick={finishGame} disabled={busy}>إنهاء التحدّي</button>
                  : <button type="button" className="eb-button is-primary" onClick={nextQuestion} disabled={busy}>السؤال التالي</button>}
              </div>
              {showActiveStandings && <LiveStandingsTable standings={competition!.standings} title="الترتيب حتى السؤال السابق" />}
            </div>
          )}

          {finished && (
            <div className="eb-lc-results">
              <p className="eb-lc-lobby-finished" role="status">انتهى التحدّي — عدد الأسئلة: <span dir="ltr">{lobby.questionCount}</span>.</p>
              {competition && competition.standings.length > 0 && (
                <>
                  <LivePodium standings={competition.standings} />
                  <LiveStandingsTable standings={competition.standings} title="النتائج النهائية" />
                </>
              )}
            </div>
          )}
          {closed && <p className="eb-lc-lobby-closed" role="status">تم إغلاق هذه الغرفة.</p>}

          <ul className="eb-lc-lobby-participants" aria-label="المشاركون">
            {lobby.participants.map(p => (
              <li key={p.studentId} className="eb-lc-lobby-participant" data-state={active ? (p.answered ? "ready" : "joined") : (p.ready ? "ready" : p.joined ? "joined" : "waiting")}>
                <span className="eb-lc-participant-name">{p.displayName || p.studentId}</span>
                <span className="eb-lc-participant-state"><span className="eb-lc-state-dot" aria-hidden="true" />{active ? (p.answered ? "أجاب" : "لم يجب") : statusLabel(p)}</span>
              </li>
            ))}
          </ul>

          {!closed && !finished && (
            <div className="eb-lc-lobby-actions eb-lc-lobby-close">
              {confirmClose ? (
                <>
                  <span className="eb-lc-confirm-text" role="status">هل تريد إغلاق الغرفة؟</span>
                  <button type="button" className="eb-button is-danger is-small" onClick={closeRoom}>تأكيد الإغلاق</button>
                  <button type="button" className="eb-button is-quiet is-small" onClick={() => setConfirmClose(false)}>تراجع</button>
                </>
              ) : (
                <button type="button" className="eb-button is-danger is-small" onClick={() => setConfirmClose(true)}>إغلاق الغرفة</button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
