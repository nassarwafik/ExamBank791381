import type { Item } from "./types";

export type DeadlineTone = "neutral" | "soon" | "overdue";
export type DeadlineDisplay = { display: string; message: string; tone: DeadlineTone };

// Only the assignment-wide deadline is considered. Student-specific extensions and submission
// states remain server-authoritative; a badge never claims that a particular student is late.
export function describeAssignmentDeadline(item: Pick<Item, "dueAt" | "status">, now: number = Date.now()): DeadlineDisplay {
  const due = Date.parse(item.dueAt);
  if (!item.dueAt || !Number.isFinite(due)) return { display: "غير محدد", message: "", tone: "neutral" };
  const display = new Intl.DateTimeFormat("ar", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(due);
  if (item.status !== "published" || !Number.isFinite(now)) return { display, message: "", tone: "neutral" };
  const remaining = due - now;
  if (remaining < 0) return { display, message: "انتهى الموعد العام", tone: "overdue" };
  if (remaining <= 24 * 60 * 60 * 1000) return { display, message: "خلال 24 ساعة", tone: "soon" };
  return { display, message: "", tone: "neutral" };
}
