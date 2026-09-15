// Roadmap #19 — presentation helpers for the builder-only audit history surface.
//
// Pure + unit-testable: an Arabic label per KNOWN action (only actions the backend actually records — no
// invented events) with a safe fallback to the raw action string, plus a client-side filter/search over
// the bounded history the reader endpoint returns (server already applies date/limit bounds).

export type AuditEvent = {
  eventId: string;
  timestamp: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  details?: Record<string, unknown>;
};

// Every key here corresponds to an action string emitted by a real recordAuditEvent call site.
const ACTION_LABELS: Record<string, string> = {
  "class.create": "إنشاء صف",
  "class.archive": "أرشفة صف",
  "class.unarchive": "إعادة تفعيل صف",
  "class.graduate": "تخريج صف",
  "class.setPrograms": "تعديل مشاريع الصف",
  "student.create": "إنشاء طالب",
  "student.bulkImport": "استيراد طلاب",
  "student.move": "نقل طالب",
  "student.archive": "أرشفة طالب",
  "student.unarchive": "إعادة تفعيل طالب",
  "student.resetPassword": "إعادة تعيين كلمة مرور",
  "student.delete": "حذف طالب",
  "assignment.archive": "أرشفة واجب",
  "assignment.restore": "استعادة واجب",
  "assignment.purge": "حذف واجب نهائيًا",
  "assignment.allowRetry": "السماح بمحاولة إضافية",
  "assignment.setDueAtOverride": "تمديد موعد الطالب",
  "assignment.reopenStudent": "إعادة فتح للطالب",
  "assignment.extendActiveAttempt": "تمديد وقت المحاولة",
  "assignment.manualGradeOverride": "حفظ تصحيح"
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[String(action || "")] || String(action || "—");
}

const TARGET_TYPE_LABELS: Record<string, string> = {
  class: "صف",
  student: "طالب",
  assignment: "واجب"
};
export function auditTargetTypeLabel(targetType: string): string {
  return TARGET_TYPE_LABELS[String(targetType || "")] || String(targetType || "—");
}

export type AuditFilter = { q?: string; action?: string; targetType?: string };

// Client-side filtering over the already-bounded loaded history. Text search spans label + target id +
// the Arabic action label + actor, so a teacher can search by any of them.
export function filterAuditEvents(events: AuditEvent[], filter: AuditFilter = {}): AuditEvent[] {
  const q = String(filter.q || "").trim().toLowerCase();
  const action = String(filter.action || "").trim();
  const targetType = String(filter.targetType || "").trim();
  return (Array.isArray(events) ? events : []).filter(ev => {
    if (action && ev.action !== action) return false;
    if (targetType && ev.targetType !== targetType) return false;
    if (q) {
      const hay = [ev.targetLabel, ev.targetId, ev.action, auditActionLabel(ev.action), ev.actor].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
