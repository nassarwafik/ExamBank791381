// Tadris+ P4-B1 — what the teacher list and one teacher's page share: labels, the actions a teacher's state allows, and the
// capability editing rules. Presentation only — the server validates every change again and refuses (never corrects) a bad one.
import type { AccessCapability, AccessPreset, ManagedTeacher, TeacherAction } from "./ownerApi";

export const STATUS_LABEL: Record<ManagedTeacher["status"], string> = { invited: "بانتظار كلمة المرور", active: "نشط", suspended: "موقوف" };
export const ACTION_LABEL: Record<TeacherAction, string> = {
  reinvite: "رابط دعوة جديد", reset: "إعادة تعيين كلمة المرور", "end-sessions": "إنهاء الجلسات", suspend: "إيقاف الحساب", reactivate: "إعادة التفعيل"
};
export const CONFIRM_TEXT: Partial<Record<TeacherAction, string>> = {
  suspend: "سيفقد المعلم الوصول من طلبه التالي، حتى تعيد تفعيل الحساب.",
  reset: "ستتوقف كلمة المرور الحالية وتنتهي كل جلساته، ويصدر رابط لإعادة التعيين.",
  "end-sessions": "ستنتهي كل جلسات المعلم المفتوحة على كل الأجهزة."
};

/** Trial accounts — the trial's state in a few words for the owner, or "" for a permanent account. */
export function trialLabel(t: ManagedTeacher): string {
  if (!t.trial) return "";
  if (t.trial.ended) return "انتهت التجربة";
  const date = formatDate(t.trial.endsAt);
  return date ? "تجريبي حتى " + date : "تجريبي";
}

export function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
}

/** The account actions the teacher's current state allows. */
export function actionsFor(t: ManagedTeacher): TeacherAction[] {
  if (t.status === "suspended") return ["reactivate"];
  if (!t.hasPassword) return ["reinvite", "suspend"];
  return ["reset", "end-sessions", "suspend"];
}

/** The preset a teacher's access starts from in an editor: the assigned one, the imported workspace's default, or none. */
export function startingPresetId(t: ManagedTeacher): string {
  if (t.access) return t.access.preset.id;
  return t.origin === "shared-password-workspace" ? "legacy-full" : "";
}

export function accessLabel(t: ManagedTeacher, presets: AccessPreset[]): string {
  if (t.access) {
    const p = presets.find(x => x.id === t.access!.preset.id && x.version === t.access!.preset.version);
    const extra = t.access.grants || t.access.denies ? " (مع تعديلات)" : "";
    return (p ? p.label : t.access.preset.id) + extra;
  }
  if (t.origin === "shared-password-workspace") return "الوصول الحالي (افتراضي)";
  return "لم تُحدَّد بعد";
}

const requiresOf = (caps: AccessCapability[]) => new Map(caps.map(c => [c.id, c.requires || []]));

/** Turning a capability ON also turns on everything it needs (transitively), so the set the owner saves is always consistent. */
export function withCapability(chosen: ReadonlySet<string>, id: string, caps: AccessCapability[]): Set<string> {
  const need = requiresOf(caps);
  const out = new Set(chosen);
  const queue = [id];
  while (queue.length) {
    const c = queue.pop()!;
    if (out.has(c) && c !== id) continue;
    out.add(c);
    for (const r of need.get(c) || []) if (!out.has(r)) queue.push(r);
  }
  return out;
}

/** Turning a capability OFF also turns off everything that needs it (transitively). */
export function withoutCapability(chosen: ReadonlySet<string>, id: string, caps: AccessCapability[]): Set<string> {
  const need = requiresOf(caps);
  const out = new Set(chosen);
  const queue = [id];
  while (queue.length) {
    const c = queue.pop()!;
    if (!out.delete(c)) continue;
    for (const [other, reqs] of need) if (out.has(other) && reqs.includes(c)) queue.push(other);
  }
  return out;
}

/** The chosen effective set expressed against a preset: what is added (grants) and what is taken away (denies). Sorted. */
export function grantsAndDenies(presetCapabilities: readonly string[], chosen: ReadonlySet<string>): { grants: string[]; denies: string[] } {
  const base = new Set(presetCapabilities);
  return { grants: [...chosen].filter(c => !base.has(c)).sort(), denies: [...base].filter(c => !chosen.has(c)).sort() };
}

/** Who made a revision, for the owner: their own changes, or the id as stored. */
export const actorLabel = (createdBy: string): string => (createdBy.startsWith("owner:") ? "المالك" : createdBy || "—");
