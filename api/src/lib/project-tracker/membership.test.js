import { describe, it, expect } from "vitest";
import { studentMembershipOk } from "./service.js";

const student = (over = {}) => ({ userId: "s1", role: "student", active: true, classId: "cA", displayName: "طالب", code: "C1", ...over });

describe("studentMembershipOk — the ghost-progress / cross-class guard", () => {
  it("accepts a valid active student of the class", () => {
    expect(studentMembershipOk(student(), "cA")).toBe(true);
  });
  it("rejects a student from another class (no cross-class access)", () => {
    expect(studentMembershipOk(student({ classId: "cB" }), "cA")).toBe(false);
  });
  it("rejects a nonexistent user (null) — arbitrary id cannot create a blob", () => {
    expect(studentMembershipOk(null, "cA")).toBe(false);
    expect(studentMembershipOk(undefined, "cA")).toBe(false);
  });
  it("rejects a non-student role", () => {
    expect(studentMembershipOk(student({ role: "teacher" }), "cA")).toBe(false);
  });
  it("rejects an inactive or archived student", () => {
    expect(studentMembershipOk(student({ active: false }), "cA")).toBe(false);
    expect(studentMembershipOk(student({ archived: true }), "cA")).toBe(false);
  });
  it("treats classId as a string match", () => {
    expect(studentMembershipOk(student({ classId: 42 }), "42")).toBe(true);
  });
});
