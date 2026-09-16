import { describe, it, expect } from "vitest";
import { buildNewClassroomDocument, programChangeAllowed, programCodeAccepted } from "../src/functions/manage-classrooms.js";

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

describe("buildNewClassroomDocument - optional programCode (canonical programCodes[] shape)", () => {
  const now = "2027-08-01T00:00:00.000Z";
  it("never writes the legacy scalar; no project => canonical empty programCodes []", () => {
    const doc = buildNewClassroomDocument({ name: "الثاني عشر 8", grade: "12", schoolYear: "2026-2027" }, now);
    expect("programCode" in doc).toBe(false);
    expect(doc.programCodes).toEqual([]);
  });
  it("stores a provided programCode as canonical programCodes [code]", () => {
    const doc = buildNewClassroomDocument({ name: "الثاني عشر 8", grade: "12", schoolYear: "2026-2027", programCode: "794589" }, now);
    expect(doc.programCodes).toEqual(["794589"]);
    expect("programCode" in doc).toBe(false);
  });
  it("stores each supported project code (899373, 883589) as given", () => {
    expect(buildNewClassroomDocument({ name: "x", grade: "12", schoolYear: "2026-2027", programCode: "899373" }, now).programCodes).toEqual(["899373"]);
    expect(buildNewClassroomDocument({ name: "y", grade: "12", schoolYear: "2026-2027", programCode: "883589" }, now).programCodes).toEqual(["883589"]);
  });
  it("treats an empty/whitespace programCode as none", () => {
    const doc = buildNewClassroomDocument({ name: "x", grade: "12", schoolYear: "2026-2027", programCode: "  " }, now);
    expect("programCode" in doc).toBe(false);
    expect(doc.programCodes).toEqual([]);
  });
});

describe("programChangeAllowed - archived classes are read-only for the project link", () => {
  it("allows changing the project of an active class", () => {
    expect(programChangeAllowed({ active: true })).toBe(true);
    expect(programChangeAllowed({ status: "active" })).toBe(true);
  });
  it("blocks changing the project of an archived class", () => {
    expect(programChangeAllowed({ active: false })).toBe(false);
    expect(programChangeAllowed({ status: "archived" })).toBe(false);
  });
});

describe("programCodeAccepted - server-side programCode validation via the registry", () => {
  it("accepts empty (removes the project link)", () => {
    expect(programCodeAccepted("")).toBe(true);
    expect(programCodeAccepted("  ")).toBe(true);
    expect(programCodeAccepted(undefined)).toBe(true);
  });
  it("accepts every supported project code", () => {
    expect(programCodeAccepted("794589")).toBe(true);
    expect(programCodeAccepted("899373")).toBe(true);
    expect(programCodeAccepted("883589")).toBe(true);
  });
  it("rejects an unknown/unsupported code", () => {
    expect(programCodeAccepted("000000")).toBe(false);
    expect(programCodeAccepted("hack")).toBe(false);
  });
});
