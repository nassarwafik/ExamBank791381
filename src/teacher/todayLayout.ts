// Tadris+ P7-A2 — the teacher's arrangement of the «اليوم» cards (pure helpers shared by the hub and its tests).
/** Tadris+ P7-A2 — the teacher's own arrangement of the cards (teacher-profile `dashboardLayout`; null = the default order). */
export type DashboardLayout = { order: string[]; hidden: string[] };
/** The cards the teacher can arrange, in the default order, with their names (widget ids of the server's registry). */
export const ARRANGEABLE: { id: string; label: string; grid: boolean }[] = [
  { id: "grading.pending", label: "بانتظار التصحيح", grid: true },
  { id: "assignments.deadlines", label: "مواعيد الإغلاق والفتح القريبة", grid: true },
  { id: "assignments.notStarted", label: "لم يبدؤوا بعد", grid: true },
  { id: "results.unreleased", label: "نتائج بانتظار النشر", grid: true },
  { id: "messages.unread", label: "رسائل غير مقروءة", grid: true },
  { id: "projects.evaluation", label: "تقييم المشاريع", grid: true },
  { id: "attempts.live", label: "المحاولات الجارية والمتروكة", grid: true },
  { id: "activity.recent", label: "آخر نشاط في صفوفك", grid: false }
];
export const parseLayout = (v: unknown): DashboardLayout | null => {
  const o = v as Partial<DashboardLayout> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.order) || !Array.isArray(o.hidden)) return null;
  return { order: o.order.filter((x): x is string => typeof x === "string"), hidden: o.hidden.filter((x): x is string => typeof x === "string") };
};
/** The cards in the teacher's order (a card the order does not name keeps its default place after the named ones; several cards of
 *  one widget stay together in their default order), without the hidden ones. Pure — exported for tests. */
export function arrangeSlots<T>(slots: [string, T][], layout: DashboardLayout | null): [string, T][] {
  if (!layout) return slots;
  const rank = (id: string) => { const i = layout.order.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  return slots.map((s, i) => ({ s, i })).filter(({ s }) => !layout.hidden.includes(s[0]))
    .sort((x, y) => rank(x.s[0]) - rank(y.s[0]) || x.i - y.i).map(({ s }) => s);
}
