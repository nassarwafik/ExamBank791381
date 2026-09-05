import { describe, it, expect } from "vitest";
import { normalizeClassStatus, deriveGraduationYear, applyClassLifecycleAction } from "./class-lifecycle.js";

describe("normalizeClassStatus", () => {
  it("legacy classroom with active:true is active", () => {
    expect(normalizeClassStatus({ active: true })).toBe("active");
  });

  it("legacy classroom with active:false is archived", () => {
    expect(normalizeClassStatus({ active: false })).toBe("archived");
  });

  it("classroom with status:archived is archived regardless of active", () => {
    expect(normalizeClassStatus({ status: "archived", active: true })).toBe("archived");
  });

  it("classroom with no fields at all defaults to active", () => {
    expect(normalizeClassStatus({})).toBe("active");
    expect(normalizeClassStatus(null)).toBe("active");
  });
});

describe("deriveGraduationYear", () => {
  it("extracts the end year from a YYYY-YYYY schoolYear", () => {
    expect(deriveGraduationYear("2026-2027")).toBe("2027");
  });

  it("handles an en-dash or slash separator", () => {
    expect(deriveGraduationYear("2026–2027")).toBe("2027");
    expect(deriveGraduationYear("2026/2027")).toBe("2027");
  });

  it("falls back to the raw value when the shape is unrecognized", () => {
    expect(deriveGraduationYear("2027")).toBe("2027");
    expect(deriveGraduationYear("")).toBe("");
  });
});

describe("applyClassLifecycleAction", () => {
  const base = {
    classId: "c1",
    name: "الثاني عشر 8",
    grade: "12",
    schoolYear: "2026-2027",
    active: true,
    studentIds: ["s1", "s2"],
    createdAt: "2026-01-01T00:00:00.000Z"
  };

  it("archive keeps classId", () => {
    const result = applyClassLifecycleAction(base, "archive", { actor: "teacher1", now: "2026-06-01T00:00:00.000Z" });
    expect(result.classId).toBe("c1");
  });

  it("archive keeps studentIds untouched", () => {
    const result = applyClassLifecycleAction(base, "archive", { actor: "teacher1", now: "2026-06-01T00:00:00.000Z" });
    expect(result.studentIds).toEqual(["s1", "s2"]);
  });

  it("archive writes archivedAt/archivedBy and sets active:false", () => {
    const result = applyClassLifecycleAction(base, "archive", { actor: "teacher1", now: "2026-06-01T00:00:00.000Z" });
    expect(result.archivedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(result.archivedBy).toBe("teacher1");
    expect(result.active).toBe(false);
    expect(result.status).toBe("archived");
  });

  it("archive sets archiveReason to manual", () => {
    const result = applyClassLifecycleAction(base, "archive", { actor: "teacher1", now: "2026-06-01T00:00:00.000Z" });
    expect(result.archiveReason).toBe("manual");
  });

  it("graduateAndArchive sets archiveReason to graduated", () => {
    const result = applyClassLifecycleAction(base, "graduateandarchive", { actor: "teacher1", now: "2026-06-01T00:00:00.000Z" });
    expect(result.archiveReason).toBe("graduated");
    expect(result.active).toBe(false);
    expect(result.status).toBe("archived");
  });

  it("graduateAndArchive derives and preserves graduationYear from schoolYear", () => {
    const result = applyClassLifecycleAction(base, "graduateandarchive", { actor: "teacher1", now: "2026-06-01T00:00:00.000Z" });
    expect(result.graduationYear).toBe("2027");
  });

  it("unarchive returns the classroom to active and clears archive fields", () => {
    const archived = applyClassLifecycleAction(base, "graduateandarchive", { actor: "teacher1", now: "2026-06-01T00:00:00.000Z" });
    const result = applyClassLifecycleAction(archived, "unarchive", { actor: "teacher1", now: "2027-01-15T00:00:00.000Z" });
    expect(result.status).toBe("active");
    expect(result.active).toBe(true);
    expect(result.archivedAt).toBeUndefined();
    expect(result.archivedBy).toBeUndefined();
    expect(result.archiveReason).toBeUndefined();
    expect(result.graduationYear).toBeUndefined();
  });

  it("throws for an unsupported action", () => {
    expect(() => applyClassLifecycleAction(base, "delete", { actor: "t", now: "2026-01-01T00:00:00.000Z" })).toThrow();
  });
});
