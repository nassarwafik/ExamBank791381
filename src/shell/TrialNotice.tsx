import { IconWarning } from "../icons";

/**
 * Trial accounts — what a TRIAL teacher sees about their own account in the teacher app: the end date, and in the last days a
 * warning («تنبيه: تنتهي تجربتك خلال N أيام»). Display only: the server decides the end and refuses access from then on; the
 * window ("endingSoon") is decided by the server's clock too. Nothing for a permanent account.
 */
export type TeacherTrialView = { endsAt: string; endingSoon: boolean };

/** The server's `trial` answer → a view, or null (permanent, absent, or malformed: nothing is shown). */
export function parseTeacherTrial(value: unknown): TeacherTrialView | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.endsAt !== "string" || Number.isNaN(new Date(v.endsAt).getTime())) return null;
  return { endsAt: v.endsAt, endingSoon: v.endingSoon === true };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Whole days left, rounded up ("less than a day" counts as 1), never below 1 while the trial runs. */
export function daysLeft(endsAt: string, nowMs: number = Date.now()): number {
  return Math.max(1, Math.ceil((new Date(endsAt).getTime() - nowMs) / DAY_MS));
}
const daysText = (n: number) => (n === 1 ? "يوم واحد" : n === 2 ? "يومين" : n <= 10 ? n + " أيام" : n + " يومًا");
const formatDate = (iso: string) => new Date(iso).toLocaleString("ar", { dateStyle: "long", timeStyle: "short" });

export default function TrialNotice({ trial, nowMs }: { trial: TeacherTrialView | null; nowMs?: number }) {
  if (!trial) return null;
  const left = daysText(daysLeft(trial.endsAt, nowMs));
  if (trial.endingSoon) {
    return (
      <div className="eb-trial-notice is-warning" role="alert">
        <IconWarning size={18} aria-hidden="true" />
        <p><strong>تنبيه: تنتهي تجربتك خلال {left}</strong> — في <bdi>{formatDate(trial.endsAt)}</bdi>. بعدها يتوقف دخولك إلى المنصة، وتبقى بياناتك محفوظة. تواصل مع إدارة المنصة لتمديد التجربة أو لتحويل حسابك إلى حساب دائم.</p>
      </div>
    );
  }
  return (
    <div className="eb-trial-notice" role="status">
      <p>حسابك تجريبي حتى <bdi>{formatDate(trial.endsAt)}</bdi> (باقٍ {left}).</p>
    </div>
  );
}
