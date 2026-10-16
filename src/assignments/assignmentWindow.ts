// Phase 21G.0 — the assignment's availability window, checked in the composer before anything is sent. The server keeps the same
// rules (it refuses a deadline before the opening time and an unreadable date); checking here lets the teacher fix the field in
// place instead of meeting a refusal after pressing «إنشاء». A deadline already in the past is allowed (a record of past work) but
// called out, because students could not submit.

export type WindowField = "openAt" | "dueAt";
export type WindowIssue = { field: WindowField; message: string; blocking: boolean };

const readable = (v: string) => !v || Number.isFinite(Date.parse(v));

/** The issues of an opening time / deadline pair (`datetime-local` values; empty = not set). */
export function assignmentWindowIssues(openAt: string, dueAt: string, now: number = Date.now()): WindowIssue[] {
  const issues: WindowIssue[] = [];
  if (!readable(openAt)) issues.push({ field: "openAt", message: "صيغة موعد الفتح غير صحيحة.", blocking: true });
  if (!readable(dueAt)) issues.push({ field: "dueAt", message: "صيغة آخر موعد غير صحيحة.", blocking: true });
  if (issues.length) return issues;
  const open = openAt ? Date.parse(openAt) : null, due = dueAt ? Date.parse(dueAt) : null;
  if (open !== null && due !== null && due <= open) issues.push({ field: "dueAt", message: "آخر موعد يجب أن يكون بعد موعد الفتح.", blocking: true });
  else if (due !== null && due < now) issues.push({ field: "dueAt", message: "آخر موعد مضى بالفعل؛ لن يتمكن الطلاب من التسليم.", blocking: false });
  return issues;
}

/** Whether any issue stops the assignment from being created. */
export const windowBlocks = (issues: readonly WindowIssue[]) => issues.some(i => i.blocking);
