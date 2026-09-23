import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconChevronBack } from "../../icons";
import { createTeacherLiveSessionClient, type TeacherLiveSessionClient, type TeacherLobby, type ClassOption, type StudentOption } from "./liveSessionClient";
import { useLobbyPoll } from "./useLobbyPoll";
import "../games.css";

// Teacher LIVE SESSION lobby (Phase 4A). From a SAVED challenge the teacher picks a class + participants (via the
// EXISTING /api/classrooms and /api/students?classId), creates a room, then watches a polled lobby (~2s) and can close
// it. NO start-game / questions / answers / scoring / leaderboard here — those are later phases.
const POLL_MS = 2000;

/** Durable lobby state label (NOT presence): لم ينضم / انضم / جاهز — text always present, never colour-only. */
function statusLabel(p: { joined: boolean; ready: boolean }): string {
  return p.ready ? "جاهز" : p.joined ? "انضم" : "لم ينضم";
}

export default function TeacherLiveLobby({ token, challengeId, challengeTitle, onBack, client: injected }: {
  token: string; challengeId: string; challengeTitle: string; onBack: () => void; client?: TeacherLiveSessionClient;
}) {
  const clientRef = useRef<TeacherLiveSessionClient>(injected || createTeacherLiveSessionClient(token));
  const [phase, setPhase] = useState<"setup" | "lobby">("setup");
  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<StudentOption[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [lobby, setLobby] = useState<TeacherLobby | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  // Load the teacher's classes once.
  useEffect(() => {
    let ok = true;
    clientRef.current.listClasses().then(cs => { if (ok) setClasses(cs); }).catch(() => { if (ok) { setClasses([]); setError("تعذّر تحميل الصفوف."); } });
    return () => { ok = false; };
  }, []);

  // Load the selectable (active, non-archived) students whenever the class changes.
  const onPickClass = useCallback(async (id: string) => {
    setClassId(id); setStudents(null); setSelected(new Set()); setError("");
    if (!id) return;
    try {
      const list = await clientRef.current.listStudents(id);
      setStudents(list.filter(s => s.active !== false && s.archived !== true));
    } catch { setStudents([]); setError("تعذّر تحميل الطلاب."); }
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
      if (r.ok && r.session) { setLobby(r.session); setPhase("lobby"); }
      else setError(r.error || "تعذّر إنشاء الغرفة.");
    } catch { setError("تعذّر إنشاء الغرفة."); }
    finally { setCreating(false); }
  }, [challengeId, classId, selected, selectableIds]);

  // Poll the lobby while it is open (stops on close / unmount / leaving the view).
  const polling = phase === "lobby" && !!lobby && lobby.status === "lobby";
  const pollFn = useCallback(async (isCurrent: () => boolean) => {
    if (!lobby) return;
    const s = await clientRef.current.get(lobby.joinCode);
    if (isCurrent() && s) setLobby(s);
  }, [lobby]);
  useLobbyPoll(polling, POLL_MS, pollFn);

  const closeRoom = useCallback(async () => {
    if (!lobby) return;
    setConfirmClose(false);
    try { const r = await clientRef.current.close(lobby.joinCode); if (r.session) setLobby(r.session); }
    catch { setError("تعذّر إغلاق الغرفة."); }
  }, [lobby]);

  // ── Setup: class + participant selection ──
  if (phase === "setup") {
    const selCount = selectableIds.filter(id => selected.has(id)).length;
    return (
      <div className="student-portal eb-student-shell eb-games-surface eb-lc eb-lc-live" dir="rtl">
        <div className="eb-games-surface-bar">
          <button type="button" className="eb-button is-quiet is-small" onClick={onBack}>
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

  // ── Lobby ──
  if (!lobby) return null;
  const closed = lobby.status === "closed";
  return (
    <div className="student-portal eb-student-shell eb-games-surface eb-lc eb-lc-live" dir="rtl">
      <div className="eb-games-surface-bar">
        <button type="button" className="eb-button is-quiet is-small" onClick={onBack}>
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
          <div className="eb-lc-lobby-stats">
            <span className="eb-lc-lobby-stat">عدد الطلاب: <span dir="ltr">{lobby.counts.joined} / {lobby.counts.total}</span> انضموا</span>
            <span className="eb-lc-lobby-stat">جاهزون: <span dir="ltr">{lobby.counts.ready} / {lobby.counts.total}</span></span>
          </div>

          {closed
            ? <p className="eb-lc-lobby-closed" role="status">تم إغلاق هذه الغرفة.</p>
            : <p className="eb-muted eb-lc-lobby-note" role="status">بدء التحدّي سيكون في المرحلة التالية.</p>}

          <ul className="eb-lc-lobby-participants" aria-label="المشاركون">
            {lobby.participants.map(p => (
              <li key={p.studentId} className="eb-lc-lobby-participant" data-state={p.ready ? "ready" : p.joined ? "joined" : "waiting"}>
                <span className="eb-lc-participant-name">{p.displayName || p.studentId}</span>
                <span className="eb-lc-participant-state"><span className="eb-lc-state-dot" aria-hidden="true" />{statusLabel(p)}</span>
              </li>
            ))}
          </ul>

          {!closed && (
            <div className="eb-lc-lobby-actions">
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
