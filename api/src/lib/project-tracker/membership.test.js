import { describe, it, expect } from "vitest";
import { studentBelongsToClass } from "./service.js";

const student = (over = {}) => ({ userId: "s1", role: "student", active: true, classId: "cA", displayName: "طالب", code: "C1", ...over });

describe("studentBelongsToClass — teacher-side class membership (ghost-progress / cross-class guard)", () => {
  it("accepts a valid student of the class", () => {
    expect(studentBelongsToClass(student(), "cA")).toBe(true);
  });
  it("accepts a login-disabled (active===false) but non-archived student — still a class member", () => {
    expect(studentBelongsToClass(student({ active: false }), "cA")).toBe(true);
  });
  it("rejects an ARCHIVED student", () => {
    expect(studentBelongsToClass(student({ archived: true }), "cA")).toBe(false);
    expect(studentBelongsToClass(student({ active: false, archived: true }), "cA")).toBe(false);
  });
  it("rejects a student from another class (no cross-class access)", () => {
    expect(studentBelongsToClass(student({ classId: "cB" }), "cA")).toBe(false);
  });
  it("rejects a nonexistent user (null) — arbitrary id cannot create a blob", () => {
    expect(studentBelongsToClass(null, "cA")).toBe(false);
    expect(studentBelongsToClass(undefined, "cA")).toBe(false);
  });
  it("rejects a non-student role", () => {
    expect(studentBelongsToClass(student({ role: "teacher" }), "cA")).toBe(false);
  });
  it("treats classId as a string match", () => {
    expect(studentBelongsToClass(student({ classId: 42 }), "42")).toBe(true);
  });
});
