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

/** Phase 8B — the activity surface shows the NEWEST 30 records by default. */
export const AUDIT_VISIBLE_LIMIT = 30;

/**
 * The newest `limit` events, newest first (the existing display order). Sorted by timestamp DESCENDING before the cut, so
 * an older record can never take the place of a newer one whatever order the input arrives in; events with equal (or
 * unparseable) timestamps keep their incoming relative order. Pure: the loaded history itself is never modified.
 */
export function newestAuditEvents(events: AuditEvent[], limit: number = AUDIT_VISIBLE_LIMIT): AuditEvent[] {
  const time = (ev: AuditEvent) => { const t = Date.parse(String(ev.timestamp || "")); return Number.isFinite(t) ? t : -Infinity; };
  return (Array.isArray(events) ? events : [])
    .map((ev, index) => ({ ev, index, t: time(ev) }))
    .sort((a, b) => (b.t - a.t) || (a.index - b.index))
    .slice(0, Math.max(0, limit))
    .map(x => x.ev);
}
