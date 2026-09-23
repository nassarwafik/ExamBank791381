import { useCallback, useEffect, useRef, useState } from "react";
import { IconChevronBack } from "../../icons";
import { createStudentLiveSessionClient, type StudentLiveSessionClient, type StudentLobby } from "./liveSessionClient";
import type { Answer } from "../../StudentQuestionCard";
import { answered as isAnswered } from "../../StudentQuestionCard";
import LiveChallengeQuestion from "./LiveChallengeQuestion";
import { useLobbyPoll } from "./useLobbyPoll";
import "../games.css";

// Student LIVE CHALLENGE (Phase 4A join/lobby + Phase 4B live round). The student enters the room code the TEACHER
// listed them in, joins, toggles ready, then — when the teacher starts — answers ONE current question per round. The
// server is the only authority: it delivers a SAFE current question (no answer keys) and grades server-side; the
// student never sees correctness during a live round. Reconnect (refresh / reopen) is server-revalidated via `get`;
// sessionStorage only remembers which room to re-check. HTTP short-polling only — no WebSocket.
const POLL_MS = 2000;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const STORE_KEY = "eb-lc-student-room";   // reconnect HINT only — never authority

function normalizeCode(raw: string): string {
  const up = String(raw || "").normalize("NFKC").trim().toUpperCase();
  let out = "";
  for (const ch of up) { if (CODE_ALPHABET.includes(ch)) out += ch; if (out.length >= CODE_LENGTH) break; }
  return out;
}
function statusLabel(p: { joined: boolean; ready: boolean }): string { return p.ready ? "جاهز" : p.joined ? "انضم" : "لم ينضم"; }
function readStored(): string { try { return sessionStorage.getItem(STORE_KEY) || ""; } catch { return ""; } }
function writeStored(code: string) { try { sessionStorage.setItem(STORE_KEY, code); } catch { /* private mode: reconnect just won't persist */ } }
function clearStored() { try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ } }

export default function StudentLiveLobby({ token, onBack, client: injected }: { token: string; onBack: () => void; client?: StudentLiveSessionClient }) {
  const clientRef = useRef<StudentLiveSessionClient>(injected || createStudentLiveSessionClient(token));
  const [code, setCode] = useState("");
  const [joinedCode, setJoinedCode] = useState("");     // the accepted room code (drives polling)
  const [lobby, setLobby] = useState<StudentLobby | null>(null);
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState(false);              // a non-poll mutation (ready / answer) is in flight
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState<Answer | undefined>(undefined);   // local draft for the current round only
  const roundRef = useRef<number | null>(null);         // last round we hydrated the draft for

  // Reconnect on mount: if a room code was remembered, re-validate it against the SERVER (never trust the hint alone).
  useEffect(() => {
    const stored = readStored();
    if (!stored) return;
    let ok = true;
    clientRef.current.get(stored).then(r => {
      if (!ok) return;
      if (r.ok && r.session) { setLobby(r.session); setJoinedCode(stored); }
      else clearStored();                                // forbidden / closed / unknown → drop the stale pointer
    }).catch(() => { if (ok) clearStored(); });
    return () => { ok = false; };
  }, []);

  const join = useCallback(async () => {
    const norm = normalizeCode(code);
    if (norm.length !== CODE_LENGTH) { setError("أدخل رمز غرفة صحيحًا."); return; }
    setJoining(true); setError("");
    try {
      const r = await clientRef.current.join(norm);
      if (r.ok && r.session) { setLobby(r.session); setJoinedCode(norm); writeStored(norm); }
      else if (r.status === 403) setError("لست ضمن هذه الغرفة.");
      else if (r.status === 409) setError("تم إغلاق هذه الغرفة.");
      else if (r.status === 404) setError("لم يتم العثور على غرفة بهذا الرمز.");
      else setError(r.error || "تعذّر الانضمام إلى الغرفة.");
    } catch { setError("تعذّر الانضمام إلى الغرفة."); }
    finally { setJoining(false); }
  }, [code]);

  const status = lobby?.status;
  const round = lobby?.round;
  // Hydrate the local draft when the round changes: restore my own submitted response (locked) or start empty.
  useEffect(() => {
    if (status !== "active" || !round) { roundRef.current = null; return; }
    if (roundRef.current === round.roundVersion) return;    // same round — keep the working draft
    roundRef.current = round.roundVersion;
    setAnswer(lobby?.you.answered ? lobby?.you.submission?.response : undefined);
  }, [status, round, lobby?.you.answered, lobby?.you.submission]);

  // Poll while joined and the room is live (lobby or active). Pauses while a mutation is busy so a slow, older GET can
  // never overwrite the newer ready/answer response (the poll effect tears down and its in-flight result goes stale).
  const polling = !!lobby && !!joinedCode && (status === "lobby" || status === "active") && !busy;
  const pollFn = useCallback(async (isCurrent: () => boolean) => {
    if (!joinedCode) return;
    const r = await clientRef.current.get(joinedCode);
    if (isCurrent() && r.ok && r.session) setLobby(r.session);
  }, [joinedCode]);
  useLobbyPoll(polling, POLL_MS, pollFn);

  const toggleReady = useCallback(async () => {
    if (!lobby || !joinedCode) return;
    const next = !lobby.you.ready;
    setBusy(true); setError("");
    try { const r = await clientRef.current.ready(joinedCode, next); if (r.ok && r.session) setLobby(r.session); else if (r.status === 409) setError("تم إغلاق هذه الغرفة."); }
    catch { setError("تعذّر تحديث حالتك."); }
    finally { setBusy(false); }
  }, [lobby, joinedCode]);

  const submitAnswer = useCallback(async () => {
    if (!lobby || !joinedCode || !round || !answer) return;
    setBusy(true); setError("");
    try {
      const r = await clientRef.current.answer(joinedCode, round.roundVersion, answer);
      if (r.ok && r.session) setLobby(r.session);
      else if (r.code === "stale-round") { /* the round already moved on — the next poll shows the new question */ }
      else if (r.status === 409) setError("تعذّر إرسال الإجابة الآن.");
      else setError(r.error || "تعذّر إرسال الإجابة.");
    } catch { setError("تعذّر إرسال الإجابة."); }
    finally { setBusy(false); }
  }, [lobby, joinedCode, round, answer]);

  const leave = useCallback(() => { clearStored(); onBack(); }, [onBack]);

  // ── Join screen ──
  if (!lobby) {
    return (
      <div className="student-portal eb-student-shell eb-games-surface eb-lc eb-lc-live" dir="rtl">
        <div className="eb-games-surface-bar">
          <button type="button" className="eb-button is-quiet is-small" onClick={leave}>
            <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />العودة إلى الألعاب
          </button>
        </div>
        <section className="eb-games-page eb-lc-join" aria-labelledby="eb-lc-join-title">
          <header className="eb-games-page-head">
            <h1 id="eb-lc-join-title" className="eb-games-page-title">التحدّي المباشر</h1>
            <p className="eb-games-page-desc">أدخل رمز الغرفة الذي يعرضه معلّمك للانضمام.</p>
          </header>
          {error && <div className="platform-error" role="alert">{error}</div>}
          <form className="eb-lc-card eb-lc-join-card" onSubmit={e => { e.preventDefault(); void join(); }}>
            <label className="eb-lc-field">
              <span className="eb-lc-field-label">رمز الغرفة</span>
              <input className="sb-input eb-lc-code-input" dir="ltr" inputMode="text" autoCapitalize="characters" maxLength={CODE_LENGTH}
                value={code} onChange={e => setCode(normalizeCode(e.target.value))} placeholder="XXXXXX" aria-label="رمز الغرفة" />
            </label>
            <button type="submit" className="eb-button is-primary" disabled={joining || normalizeCode(code).length !== CODE_LENGTH}>
              {joining ? "جارٍ الانضمام…" : "انضمام"}
            </button>
          </form>
        </section>
      </div>
    );
  }

  const closed = status === "closed";
  const finished = status === "finished";
  const active = status === "active";
  const alreadyAnswered = !!lobby.you.answered;
  const canSubmit = active && !!answer && isAnswered(answer) && !alreadyAnswered && !busy;
  return (
    <div className="student-portal eb-student-shell eb-games-surface eb-lc eb-lc-live" dir="rtl">
      <div className="eb-games-surface-bar">
        <button type="button" className="eb-button is-quiet is-small" onClick={leave}>
          <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />العودة إلى الألعاب
        </button>
      </div>
      <section className="eb-games-page" aria-labelledby="eb-lc-slobby-title">
        <header className="eb-games-page-head">
          <h1 id="eb-lc-slobby-title" className="eb-games-page-title">التحدّي المباشر</h1>
          <p className="eb-games-page-desc">{lobby.challengeTitle || "بدون عنوان"}</p>
        </header>
        {error && <div className="platform-error" role="alert">{error}</div>}

        <div className="eb-lc-card eb-lc-lobby">
          {closed && <p className="eb-lc-lobby-closed" role="status">تم إغلاق هذه الغرفة.</p>}
          {finished && <p className="eb-lc-lobby-finished" role="status">انتهى التحدّي — شكرًا لمشاركتك.</p>}

          {status === "lobby" && (
            <>
              <p className="eb-lc-lobby-joined" role="status">تم انضمامك — بانتظار بدء المعلم.</p>
              <div className="eb-lc-lobby-stats">
                <span className="eb-lc-lobby-stat">المنضمّون: <span dir="ltr">{lobby.counts.joined} / {lobby.counts.total}</span></span>
                <span className="eb-lc-lobby-stat">الجاهزون: <span dir="ltr">{lobby.counts.ready} / {lobby.counts.total}</span></span>
              </div>
              <button type="button" className={"eb-button eb-lc-ready-toggle" + (lobby.you.ready ? " is-ready" : " is-primary")} onClick={toggleReady} disabled={busy} aria-pressed={lobby.you.ready}>
                {lobby.you.ready ? "جاهز ✓ — اضغط لإلغاء الاستعداد" : "أنا جاهز"}
              </button>
            </>
          )}

          {active && round && round.question && (
            <div className="eb-lc-round">
              <div className="eb-lc-round-head">
                <span className="eb-lc-round-num" role="status">السؤال <span dir="ltr">{round.questionNumber} / {round.questionCount}</span></span>
              </div>
              <LiveChallengeQuestion q={round.question} index={(round.questionNumber || 1) - 1} answer={answer} onAnswer={setAnswer} disabled={alreadyAnswered || busy} />
              {alreadyAnswered
                ? <p className="eb-lc-answer-locked" role="status">تم تسجيل إجابتك — بانتظار السؤال التالي.</p>
                : <button type="button" className="eb-button is-primary eb-lc-submit" onClick={submitAnswer} disabled={!canSubmit}>
                    {busy ? "جارٍ الإرسال…" : "إرسال الإجابة"}
                  </button>}
            </div>
          )}

          {(status === "lobby" || finished) && (
            <ul className="eb-lc-lobby-participants" aria-label="المشاركون">
              {lobby.participants.map((p, i) => (
                <li key={i} className="eb-lc-lobby-participant" data-state={p.ready ? "ready" : p.joined ? "joined" : "waiting"}>
                  <span className="eb-lc-participant-name">{p.displayName}</span>
                  <span className="eb-lc-participant-state"><span className="eb-lc-state-dot" aria-hidden="true" />{statusLabel(p)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
