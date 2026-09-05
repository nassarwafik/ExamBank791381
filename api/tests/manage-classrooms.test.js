import { describe, it, expect } from "vitest";
import { buildNewClassroomDocument } from "../src/functions/manage-classrooms.js";

describe("buildNewClassroomDocument - creating a class with a name already used by an archived class", () => {
  it("gives each new classroom a fresh, distinct classId even when the name repeats", () => {
    const now = "2027-08-01T00:00:00.000Z";
    const first = buildNewClassroomDocument({ name: "الثاني عشر 8", grade: "12", schoolYear: "2026-2027" }, now);
    const second = buildNewClassroomDocument({ name: "الثاني عشر 8", grade: "12", schoolYear: "2027-2028" }, now);
    expect(first.classId).not.toBe(second.classId);
    expect(first.name).toBe(second.name);
    expect(second.active).toBe(true);
  });
});
