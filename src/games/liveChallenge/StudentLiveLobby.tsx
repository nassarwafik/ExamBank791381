import { useCallback, useRef, useState } from "react";
import { IconChevronBack } from "../../icons";
import { createStudentLiveSessionClient, type StudentLiveSessionClient, type StudentLobby } from "./liveSessionClient";
import { useLobbyPoll } from "./useLobbyPoll";
import "../games.css";

// Student LIVE CHALLENGE join + lobby (Phase 4A). The student enters the room code the TEACHER listed them in, joins,
// toggles ready, and watches a polled SAFE lobby (~2s) that carries NO questions/answers. When the teacher closes the
// room, polling stops and a closed message is shown. No gameplay yet.
const POLL_MS = 2000;
// Client-side normalization only (server is the authority): uppercase, drop ambiguous/invalid, cap at the code length.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
function normalizeCode(raw: string): string {
  const up = String(raw || "").normalize("NFKC").trim().toUpperCase();
  let out = "";
  for (const ch of up) { if (CODE_ALPHABET.includes(ch)) out += ch; if (out.length >= CODE_LENGTH) break; }
  return out;
}
function statusLabel(p: { joined: boolean; ready: boolean }): string { return p.ready ? "جاهز" : p.joined ? "انضم" : "لم ينضم"; }

export default function StudentLiveLobby({ token, onBack, client: injected }: { token: string; onBack: () => void; client?: StudentLiveSessionClient }) {
  const clientRef = useRef<StudentLiveSessionClient>(injected || createStudentLiveSessionClient(token));
  const [code, setCode] = useState("");
  const [joinedCode, setJoinedCode] = useState("");     // the accepted room code (drives polling)
  const [lobby, setLobby] = useState<StudentLobby | null>(null);
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const join = useCallback(async () => {
    const norm = normalizeCode(code);
    if (norm.length !== CODE_LENGTH) { setError("أدخل رمز غرفة صحيحًا."); return; }
    setJoining(true); setError("");
    try {
      const r = await clientRef.current.join(norm);
      if (r.ok && r.session) { setLobby(r.session); setJoinedCode(norm); }
      else if (r.status === 403) setError("لست ضمن هذه الغرفة.");
      else if (r.status === 409) setError("تم إغلاق هذه الغرفة.");
      else if (r.status === 404) setError("لم يتم العثور على غرفة بهذا الرمز.");
      else setError(r.error || "تعذّر الانضمام إلى الغرفة.");
    } catch { setError("تعذّر الانضمام إلى الغرفة."); }
    finally { setJoining(false); }
  }, [code]);

  // Polling pauses while a non-poll mutation is in flight (busy). toggleReady sets busy=true BEFORE calling ready(...),
  // so the polling effect tears down and any already in-flight GET becomes stale (its isCurrent() returns false and its
  // result is dropped) — a slow, older lobby GET can never overwrite the newer ready(...) response.
  const polling = !!lobby && !!joinedCode && lobby.status === "lobby" && !busy;
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

  // ── Join screen ──
  if (!lobby) {
    return (
      <div className="student-portal eb-student-shell eb-games-surface eb-lc eb-lc-live" dir="rtl">
        <div className="eb-games-surface-bar">
          <button type="button" className="eb-button is-quiet is-small" onClick={onBack}>
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

  // ── Lobby ──
  const closed = lobby.status === "closed";
  return (
    <div className="student-portal eb-student-shell eb-games-surface eb-lc eb-lc-live" dir="rtl">
      <div className="eb-games-surface-bar">
        <button type="button" className="eb-button is-quiet is-small" onClick={onBack}>
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
          {closed ? (
            <p className="eb-lc-lobby-closed" role="status">تم إغلاق هذه الغرفة.</p>
          ) : (
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
          <ul className="eb-lc-lobby-participants" aria-label="المشاركون">
            {lobby.participants.map((p, i) => (
              <li key={i} className="eb-lc-lobby-participant" data-state={p.ready ? "ready" : p.joined ? "joined" : "waiting"}>
                <span className="eb-lc-participant-name">{p.displayName}</span>
                <span className="eb-lc-participant-state"><span className="eb-lc-state-dot" aria-hidden="true" />{statusLabel(p)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
