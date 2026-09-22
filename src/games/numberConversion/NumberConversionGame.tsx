import { useCallback, useEffect, useRef, useState } from "react";
import { IconChevronBack, IconCheck, IconInfo } from "../../icons";
import ProgressBar from "../../ui/ProgressBar";
import { usePrefersReducedMotion } from "../../ui/usePrefersReducedMotion";
import ConversionBoard from "./ConversionBoard";
import { createNumberConversionClient, type NumberConversionClient, type ActiveState, type BestRecord, type RoundResult, type AnswerResponse } from "./numberConversionClient";
import { DIRECTION_META, PATH_META, LEVEL_META, emptyBits, formatElapsed, type Bit, type ChallengePath, type AssistanceLevel } from "./conversion";

// Number Conversion Challenge — the solo game controller (FREE PLAY). A nested full-view inside the Games
// destination: home (choose a path + assistance) → round (the interactive board, progress, streak, timer, forgiving
// hint→reveal feedback) → result (score, best streak, time, best record). The SERVER owns generation, grading and
// the best record; this component renders state and submits the student's eight bits. No Strength, no medals.
type Phase = "loading" | "home" | "playing" | "result" | "error";
type Feedback =
  | { kind: "hint"; hint: string }
  | { kind: "correct"; explanation: string }
  | { kind: "revealed"; explanation: string; solutionBits: Bit[] }
  | null;

export default function NumberConversionGame({ token, onBack, client: injected }: { token: string; onBack: () => void; client?: NumberConversionClient }) {
  const reducedMotion = usePrefersReducedMotion();
  const clientRef = useRef<NumberConversionClient>(injected || createNumberConversionClient(token));
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<ActiveState | null>(null);
  const [best, setBest] = useState<BestRecord | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [bits, setBits] = useState<Bit[]>(emptyBits());
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState<AnswerResponse | null>(null);   // the answer response awaiting "next"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [path, setPath] = useState<ChallengePath>("dec-bin");
  const [level, setLevel] = useState<AssistanceLevel>("guided");
  const [tick, setTick] = useState(0);

  // Initial load: resume an unfinished attempt, otherwise show the home screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await clientRef.current.getState();
        if (cancelled) return;
        setBest(s.best ?? null);
        if (s.active && !s.active.done && s.active.currentTask) { setState(s.active); setBits(emptyBits()); setPhase("playing"); }
        else setPhase("home");
      } catch { if (!cancelled) setPhase("home"); }
    })();
    return () => { cancelled = true; };
  }, []);

  // A once-a-second elapsed timer while playing (display only; the server records the official time).
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const startRound = useCallback(async (p: ChallengePath, l: AssistanceLevel) => {
    setBusy(true); setError("");
    try {
      const s = await clientRef.current.start(p, l);
      if (!s.ok || !s.active) { setError("تعذّر بدء التحدّي. حاول مرة أخرى."); return; }
      setBest(s.best ?? best);
      setState(s.active); setBits(emptyBits()); setFeedback(null); setPending(null); setResult(null); setPhase("playing");
    } catch { setError("تعذّر بدء التحدّي. حاول مرة أخرى."); }
    finally { setBusy(false); }
  }, [best]);

  const submit = useCallback(async () => {
    if (!state || !state.currentTask || busy) return;
    setBusy(true); setError("");
    try {
      const r = await clientRef.current.answer(state.currentTask.taskId, bits);
      if (r.ok === false || r.error) {
        // stale / conflict → resync from the server (refresh-safe)
        const s = await clientRef.current.getState();
        setBest(s.best ?? null);
        if (s.active && !s.active.done && s.active.currentTask) { setState(s.active); setBits(emptyBits()); setFeedback(null); setPending(null); setPhase("playing"); }
        else setPhase("home");
        return;
      }
      if (r.correct) {
        setFeedback({ kind: "correct", explanation: String(r.explanation || "") });
        setPending(r);
      } else if (r.revealed) {
        const sol = (r.solutionBits || emptyBits()) as Bit[];
        setBits(sol);
        setFeedback({ kind: "revealed", explanation: String(r.explanation || ""), solutionBits: sol });
        setPending(r);
      } else {
        setFeedback({ kind: "hint", hint: String(r.hint || "حاول مرة أخرى.") });   // first miss: keep the board, retry
      }
    } catch { setError("تعذّر إرسال إجابتك. حاول مرة أخرى."); }
    finally { setBusy(false); }
  }, [state, bits, busy]);

  const next = useCallback(() => {
    const r = pending;
    setFeedback(null); setPending(null); setBits(emptyBits());
    if (!r) return;
    if (r.done) { setResult(r.result ?? null); setBest(r.best ?? best); setPhase("result"); return; }
    if (r.state) setState(r.state);
  }, [pending, best]);

  const elapsedMs = state && phase === "playing" ? Math.max(0, Date.now() - Date.parse(state.startedAt)) : 0;
  void tick;   // re-render each second for the timer

  // ── back bar (shared) ──
  const BackBar = ({ label }: { label: string }) => (
    <div className="eb-games-surface-bar">
      <button type="button" className="eb-button is-quiet is-small" onClick={onBack}>
        <IconChevronBack size={18} className="eb-flip-rtl" aria-hidden="true" />{label}
      </button>
    </div>
  );

  if (phase === "loading") {
    return <main className="student-portal eb-student-shell eb-games-surface eb-ncgame" dir="rtl"><p className="eb-muted eb-sp-status" role="status">جارٍ تحميل اللعبة...</p></main>;
  }

  if (phase === "home") {
    return (
      <main className="student-portal eb-student-shell eb-games-surface eb-ncgame" dir="rtl">
        <BackBar label="العودة إلى الألعاب" />
        <section className="eb-ncgame-home" aria-labelledby="eb-ncgame-title">
          <header className="eb-ncgame-head">
            <h1 id="eb-ncgame-title" className="eb-ncgame-title">تحدّي أنظمة العد</h1>
            <p className="eb-ncgame-sub">حوّل بين العشري والثنائي والسادس عشر باستخدام صناديق القيم — ١٠ مهمات في كل جولة.</p>
          </header>
          {best && (
            <p className="eb-ncgame-best" role="note">أفضل نتيجة محفوظة: <strong dir="ltr">{best.percentage}%</strong> ({best.correct}/{best.total}) · أفضل سلسلة {best.bestStreak}</p>
          )}
          {error && <div className="platform-error" role="alert">{error}</div>}
          <fieldset className="eb-ncgame-paths">
            <legend>اختر مسار التحدّي</legend>
            <div className="eb-ncgame-path-grid">
              {PATH_META.map(p => (
                <button type="button" key={p.id} className={"eb-ncgame-path" + (path === p.id ? " is-selected" : "")} aria-pressed={path === p.id} onClick={() => setPath(p.id)}>
                  <span className="eb-ncgame-path-letter" aria-hidden="true">{p.letter}</span>
                  <span className="eb-ncgame-path-title">{p.titleAr}</span>
                  <span className="eb-ncgame-path-sub" dir="ltr">{p.subtitleAr}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="eb-ncgame-levels">
            <legend>مستوى المساعدة</legend>
            <div className="eb-ncgame-level-row">
              {LEVEL_META.map(l => (
                <button type="button" key={l.id} className={"eb-chip-button" + (level === l.id ? " is-active" : "")} aria-pressed={level === l.id} onClick={() => setLevel(l.id)} title={l.descAr}>{l.labelAr}</button>
              ))}
            </div>
            <p className="eb-ncgame-level-desc">{LEVEL_META.find(l => l.id === level)?.descAr}</p>
          </fieldset>
          <button type="button" className="eb-button is-primary eb-ncgame-start" disabled={busy} onClick={() => startRound(path, level)}>ابدأ التحدّي</button>
        </section>
      </main>
    );
  }

  if (phase === "result" && result) {
    return (
      <main className="student-portal eb-student-shell eb-games-surface eb-ncgame" dir="rtl">
        <section className="eb-ncgame-result" aria-labelledby="eb-ncgame-result-title">
          <h1 id="eb-ncgame-result-title" className="eb-ncgame-title">تحدّي أنظمة العد</h1>
          <p className="eb-ncgame-score"><strong dir="ltr">{result.correct} / {result.total}</strong></p>
          <p className="eb-ncgame-percent" dir="ltr">{result.percentage}%</p>
          <ul className="eb-ncgame-stats">
            <li>أفضل سلسلة صحيحة: <strong dir="ltr">{result.bestStreak}</strong></li>
            <li>الوقت: <strong dir="ltr">{formatElapsed(result.elapsedMs)}</strong></li>
          </ul>
          {best && <p className="eb-ncgame-best" role="note">أفضل نتيجة محفوظة: <strong dir="ltr">{best.percentage}%</strong> ({best.correct}/{best.total})</p>}
          <div className="eb-ncgame-actions">
            <button type="button" className="eb-button is-primary" onClick={() => startRound(path, level)}>إعادة المحاولة</button>
            <button type="button" className="eb-button" onClick={() => { setResult(null); setPhase("home"); }}>تحدٍّ جديد</button>
            <button type="button" className="eb-button is-quiet" onClick={onBack}>العودة إلى الألعاب</button>
          </div>
        </section>
      </main>
    );
  }

  // playing
  const task = state?.currentTask;
  if (!task) return <main className="student-portal eb-student-shell eb-games-surface eb-ncgame" dir="rtl"><p className="eb-muted eb-sp-status" role="status">جارٍ التحميل...</p></main>;
  const meta = DIRECTION_META[task.direction];
  const locked = feedback?.kind === "correct" || feedback?.kind === "revealed";
  return (
    <main className={"student-portal eb-student-shell eb-games-surface eb-ncgame" + (reducedMotion ? " is-reduced-motion" : "")} dir="rtl">
      <BackBar label="العودة إلى الألعاب" />
      <section className="eb-ncgame-play" aria-labelledby="eb-ncgame-play-title">
        <header className="eb-ncgame-playhead">
          <h1 id="eb-ncgame-play-title" className="eb-ncgame-title">تحدّي أنظمة العد</h1>
          <div className="eb-ncgame-meters">
            <span className="eb-ncgame-meter">المهمة {state!.taskNumber} / {state!.total}</span>
            <span className="eb-ncgame-meter" aria-label={"السلسلة الصحيحة الحالية " + state!.streak}>🔥 <span dir="ltr">{state!.streak}</span></span>
            <span className="eb-ncgame-meter" aria-label="الوقت المنقضي" dir="ltr">{formatElapsed(elapsedMs)}</span>
          </div>
          <ProgressBar label="التقدّم في الجولة" value={Math.round((state!.taskNumber - 1) / state!.total * 100)} size="sm" />
        </header>

        <div className="eb-ncgame-task">
          <p className="eb-ncgame-direction">{meta.titleAr}</p>
          <p className="eb-ncgame-prompt">
            حوّل <strong className="eb-ncgame-source" dir="ltr">{task.sourceDisplay}{meta.sourceBase === 2 ? "₂" : meta.sourceBase === 16 ? "₁₆" : ""}</strong> إلى <span>{meta.targetLabelAr}</span>
          </p>
        </div>

        <ConversionBoard bits={bits} onChange={setBits} direction={task.direction} disabled={locked} solutionBits={feedback?.kind === "revealed" ? feedback.solutionBits : null} />

        <div className="eb-ncgame-feedback" aria-live="polite">
          {feedback?.kind === "hint" && <p className="eb-ncgame-hint"><IconInfo size={16} aria-hidden="true" /> {feedback.hint}</p>}
          {feedback?.kind === "correct" && <p className="eb-ncgame-correct"><IconCheck size={16} aria-hidden="true" /> أحسنت! {feedback.explanation}</p>}
          {feedback?.kind === "revealed" && <p className="eb-ncgame-reveal">الحل الصحيح: {feedback.explanation}</p>}
        </div>

        {error && <div className="platform-error" role="alert">{error}</div>}

        <div className="eb-ncgame-actions">
          {locked ? (
            <button type="button" className="eb-button is-primary" onClick={next}>التالي</button>
          ) : (
            <button type="button" className="eb-button is-primary" disabled={busy} onClick={submit}>تحقّق</button>
          )}
        </div>
      </section>
    </main>
  );
}
