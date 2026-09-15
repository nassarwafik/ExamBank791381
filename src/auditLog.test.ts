import { describe, it, expect } from "vitest";
import { auditActionLabel, auditTargetTypeLabel, filterAuditEvents, type AuditEvent } from "./auditLog";

// Roadmap #19 — audit UI presentation helpers: Arabic labels for KNOWN actions (fallback to the raw
// action for anything unknown) and CLIENT-SIDE filtering/search over the loaded bounded history (AK).

const ev = (over: Partial<AuditEvent> = {}): AuditEvent => ({
  eventId: "e1", timestamp: "2026-02-01T00:00:00.000Z", actor: "teacher-1",
  action: "class.create", targetType: "class", targetId: "c1", targetLabel: "صف", details: {}, ...over
});

describe("auditActionLabel", () => {
  it("maps known actions to Arabic labels", () => {
    expect(auditActionLabel("class.create")).toBe("إنشاء صف");
    expect(auditActionLabel("student.bulkImport")).toBe("استيراد طلاب");
    expect(auditActionLabel("assignment.manualGradeOverride")).toBe("حفظ تصحيح");
  });
  it("falls back to the raw action string for an unknown action (never invents a label)", () => {
    expect(auditActionLabel("some.unknownEvent")).toBe("some.unknownEvent");
  });
  it("labels target types", () => {
    expect(auditTargetTypeLabel("student")).toBe("طالب");
    expect(auditTargetTypeLabel("class")).toBe("صف");
  });
});

describe("filterAuditEvents — AK: client-side filtering/search over loaded data", () => {
  const events: AuditEvent[] = [
    ev({ eventId: "a", action: "class.create", targetType: "class", targetLabel: "الحادي عشر" }),
    ev({ eventId: "b", action: "student.bulkImport", targetType: "class", targetLabel: "الثاني عشر" }),
    ev({ eventId: "c", action: "student.archive", targetType: "student", targetLabel: "علي حسن", targetId: "s1" })
  ];
  it("filters by action", () => {
    expect(filterAuditEvents(events, { action: "student.bulkImport" }).map(e => e.eventId)).toEqual(["b"]);
  });
  it("filters by target type", () => {
    expect(filterAuditEvents(events, { targetType: "student" }).map(e => e.eventId)).toEqual(["c"]);
  });
  it("text search spans label, id, action and the Arabic label", () => {
    expect(filterAuditEvents(events, { q: "علي" }).map(e => e.eventId)).toEqual(["c"]);
    expect(filterAuditEvents(events, { q: "استيراد" }).map(e => e.eventId)).toEqual(["b"]);   // Arabic action label
    expect(filterAuditEvents(events, { q: "s1" }).map(e => e.eventId)).toEqual(["c"]);         // target id
  });
  it("no filter returns everything", () => {
    expect(filterAuditEvents(events, {})).toHaveLength(3);
  });
});
