// Pure countdown display helpers for the server-authoritative exam timer. No Date/clock reads here —
// the caller passes a remaining-milliseconds value it has computed from the server anchor, so these are
// deterministic and unit-testable.

const pad = (n: number): string => String(n).padStart(2, "0");

// Remaining ms -> "MM:SS", or "H:MM:SS" once an hour or more remains ("show hours when needed").
// Negative/expired clamps to "00:00".
export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Escalating urgency class: "" normally, "warn" at <= 5 minutes, "danger" at <= 1 minute.
export function countdownTone(ms: number): "" | "warn" | "danger" {
  const rem = ms || 0;
  if (rem <= 60_000) return "danger";
  if (rem <= 300_000) return "warn";
  return "";
}
