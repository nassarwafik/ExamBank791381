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

// UX-S3 (docs/enterprise-ux-student-s3.md §2.3) — the result page reuses this bar: there the page's own <h1> is the result heading,
// so the title renders as text (`titleAs="p"`), and its back control is named «رجوع» (the page keeps its «العودة إلى المهام» button).
export default function ExamTopBar({ title, context, onBack, timer, titleAs = "h1", backLabel = "العودة إلى المهام" }: { title: string; context: string; onBack: () => void; timer: TopBarTimer | null; titleAs?: "h1" | "p"; backLabel?: string }) {
  const Title = titleAs;
  return (
    <header className="iex-topbar">
      <IconButton label={backLabel} icon={<IconChevronBack size={18} className="eb-flip-rtl" />} onClick={onBack} className="iex-topbar-back" />
      <div className="iex-topbar-text">
        <Title className="iex-topbar-title">{title}</Title>
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
