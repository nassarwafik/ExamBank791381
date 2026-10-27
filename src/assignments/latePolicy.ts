// D5 (item 10, owner decision) — an assignment's OPTIONAL late-submission policy: the ONE persisted field assignment.latePolicy
// { windowHours, deductionPercent }. The SERVER enforces it (api/src/lib/late-policy.js: the window after each student's due date, the
// fixed deduction stamped on a late attempt); this module only offers the choices and words them. null = no late submissions (the
// default, and every assignment created before D5).
export type LatePolicy = { windowHours: number; deductionPercent: number };

export const LATE_WINDOW_CHOICES: ReadonlyArray<{ hours: number; label: string }> = [
  { hours: 6, label: "6 ساعات" }, { hours: 12, label: "12 ساعة" }, { hours: 24, label: "يوم واحد" }, { hours: 48, label: "يومان" },
  { hours: 72, label: "3 أيام" }, { hours: 168, label: "أسبوع" }, { hours: 336, label: "أسبوعان" }
];
export const LATE_DEDUCTION_CHOICES: ReadonlyArray<number> = [0, 5, 10, 15, 20, 25, 30, 40, 50];
export const DEFAULT_LATE_POLICY: LatePolicy = { windowHours: 24, deductionPercent: 10 };

/** The policy a stored / received value describes, or null (mirrors the server's bounds; anything else is "none"). */
export function normalizeLatePolicy(v: unknown): LatePolicy | null {
  if (!v || typeof v !== "object") return null;
  const { windowHours: h, deductionPercent: d } = v as Record<string, unknown>;
  if (typeof h !== "number" || !Number.isInteger(h) || h < 1 || h > 336) return null;
  if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 90) return null;
  return { windowHours: h, deductionPercent: d };
}

export function lateWindowLabel(hours: number): string {
  const known = LATE_WINDOW_CHOICES.find(c => c.hours === hours);
  if (known) return known.label;
  return hours % 24 === 0 ? hours / 24 + " يوم" : hours + " ساعة";
}
export const deductionLabel = (d: number) => (d > 0 ? "بخصم " + d + "٪ من علامة المحاولة" : "دون خصم");

/** The policy in the teacher's words. */
export function latePolicyLabel(v: unknown): string {
  const p = normalizeLatePolicy(v);
  return p ? "يُقبل حتى " + lateWindowLabel(p.windowHours) + " بعد الموعد، " + deductionLabel(p.deductionPercent) : "لا يُقبل بعد الموعد";
}

/** When the late window closes for a due date (ISO), or "" without a policy / a readable due date. */
export function lateUntilIso(dueAt: string | undefined, v: unknown): string {
  const p = normalizeLatePolicy(v), due = Date.parse(dueAt || "");
  return p && Number.isFinite(due) ? new Date(due + p.windowHours * 3600000).toISOString() : "";
}

/** A late attempt's stamp as received from the server, or null. */
export type LateStamp = { minutesLate: number; deductionPercent: number; waived: boolean };
export function lateStampOf(v: unknown): LateStamp | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const d = Number(r.deductionPercent);
  if (!Number.isFinite(d)) return null;
  return { minutesLate: Math.max(0, Number(r.minutesLate) || 0), deductionPercent: d, waived: r.waived === true };
}

/** "متأخر 3 ساعات" / "متأخر يومين" — the lateness of an attempt in words. */
export function lateDurationLabel(minutes: number): string {
  if (minutes < 60) return minutes + " دقيقة";
  const h = Math.round(minutes / 60);
  if (h < 48) return h + " ساعة";
  return Math.round(h / 24) + " يوم";
}
