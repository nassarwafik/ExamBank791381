import { describe, it, expect } from "vitest";
import { describeAssignmentDeadline } from "./assignmentDeadline";
const now = Date.parse("2026-10-15T12:00:00Z");
describe("assignment deadline display (informational only)", () => {
  it("marks published assignments expiring within 24h", () => {
    const result = describeAssignmentDeadline({status:"published",dueAt:"2026-10-16T11:00:00Z"},now);
    expect(result.tone).toBe("soon");
    expect(result.message).toBe("خلال 24 ساعة");
    expect(result.display).not.toMatch(/:\\d{2}:\\d{2}/);
  });
  it("marks passed global deadlines without falsely classifying drafts or archives", () => {
    const dueAt="2026-10-14T09:00:00Z";
    expect(describeAssignmentDeadline({status:"published",dueAt},now).tone).toBe("overdue");
    expect(describeAssignmentDeadline({status:"draft",dueAt},now).tone).toBe("neutral");
    expect(describeAssignmentDeadline({status:"archived",dueAt},now).message).toBe("");
  });
  it("does not invent a deadline for missing or invalid values", () => {
    expect(describeAssignmentDeadline({status:"published",dueAt:""},now).display).toBe("غير محدد");
    expect(describeAssignmentDeadline({status:"published",dueAt:"invalid"},now).tone).toBe("neutral");
  });
  it("keeps future and exact-threshold boundaries deterministic", () => {
    expect(describeAssignmentDeadline({status:"published",dueAt:"2026-10-16T12:00:00Z"},now).tone).toBe("soon");
    expect(describeAssignmentDeadline({status:"published",dueAt:"2026-10-16T12:00:01Z"},now).tone).toBe("neutral");
  });
});
