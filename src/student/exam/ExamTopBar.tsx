import IconButton from "../../ui/IconButton";
import { IconChevronBack, IconHistory } from "../../icons";
import { formatCountdown } from "../../examTimer";

/** The tone vocabulary of examTimer.countdownTone (kept local so examTimer.ts stays untouched). */
export type CountdownTone = "" | "warn" | "danger";

/**
 * ExamTopBar (UX-7b-1) — the one compact sticky region of the running exam: back, title, quiet context and, for a
 * timed live attempt, the countdown chip. The chip is presentation only: it receives the page's existing
 * `remainingMs` (server-anchored) and `countdownTone` — no clock is read here. `role="timer"` is implicitly
 * aria-live="off", so the per-second value is never announced.
 */
export type TopBarTimer = { remainingMs: number; tone: CountdownTone };

export default function ExamTopBar({ title, context, onBack, timer }: { title: string; context: string; onBack: () => void; timer: TopBarTimer | null }) {
  return (
    <header className="iex-topbar">
      <IconButton label="العودة إلى المهام" icon={<IconChevronBack size={18} className="eb-flip-rtl" />} onClick={onBack} className="iex-topbar-back" />
      <div className="iex-topbar-text">
        <h1 className="iex-topbar-title">{title}</h1>
        {context && <p className="iex-topbar-context">{context}</p>}
      </div>
      {timer && (
        <div className={"iex-countdown " + timer.tone} role="timer" aria-label="الوقت المتبقي">
          <IconHistory size={16} aria-hidden="true" />
          <strong className="iex-countdown-clock">{formatCountdown(timer.remainingMs)}</strong>
        </div>
      )}
    </header>
  );
}
