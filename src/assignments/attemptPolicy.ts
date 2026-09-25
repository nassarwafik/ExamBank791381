// Phase 7A — assignment-level attempt policy (طريقة المحاولة): the ONE canonical persisted field
// assignment.attemptPolicy. The server is authoritative; this module only labels and explains the three values.
// A missing / unknown policy (every assignment created before Phase 7A) is "continuous" — today's behaviour.
export type AttemptPolicy = "continuous" | "strict" | "pausable";

export const ATTEMPT_POLICY_OPTIONS: ReadonlyArray<{ value: AttemptPolicy; label: string; summary: string; detail: string }> = [
  {
    value: "continuous",
    label: "عادي",
    summary: "يمكن للطالب الخروج والعودة — الوقت يستمر",
    detail: "تبقى الإجابات المحفوظة، وإذا كان للمحاولة مؤقت فإن العدّاد يستمر أثناء غياب الطالب."
  },
  {
    value: "strict",
    label: "صارم",
    summary: "مغادرة صفحة الامتحان تنهي المحاولة",
    detail: "للامتحانات المضبوطة: بعد بدء المحاولة، مغادرة الصفحة أو الانتقال إلى تبويب أو تطبيق آخر تُنهي المحاولة وتُصحَّح الإجابات المحفوظة، ولا يمكن متابعتها."
  },
  {
    value: "pausable",
    label: "حفظ مؤقت واستكمال",
    summary: "يمكن حفظ المحاولة والخروج ثم استكمالها لاحقًا",
    detail: "يظهر للطالب زر «حفظ مؤقت والخروج»: تُحفظ الإجابات ويتوقف المؤقت، ثم يستكمل المحاولة نفسها بالوقت المتبقي فقط. آخر موعد للواجب يبقى حدًّا نهائيًا."
  }
];

export function normalizeAttemptPolicy(value: unknown): AttemptPolicy {
  return value === "strict" || value === "pausable" ? value : "continuous";
}

/** Short Arabic label for a (possibly missing) policy — never the internal enum name. */
export function attemptPolicyLabel(value: unknown): string {
  const policy = normalizeAttemptPolicy(value);
  return ATTEMPT_POLICY_OPTIONS.find(o => o.value === policy)!.label;
}

/** Arabic end-reason label for a completed attempt (teacher and student views). */
export function endReasonLabel(reason?: string): string {
  if (reason === "timedOut") return "انتهى الوقت";
  if (reason === "integrityExit") return "غادر صفحة الامتحان";
  if (reason === "submitted") return "تسليم";
  return "—";
}

/** "38 دقيقة" / "1 ساعة و5 دقائق"-style remaining budget (whole minutes, rounded up so a student never sees less). */
export function formatRemaining(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60000));
  if (minutes < 60) return minutes + " دقيقة";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h + " ساعة" + (m ? " و" + m + " دقيقة" : "");
}
