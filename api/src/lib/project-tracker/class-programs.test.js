import { describe, it, expect } from "vitest";
import { getClassProgramCodes, classHasProject, getSupportedClassProgramCodes, normalizeProgramCodes, validateProgramCodes } from "./class-programs.js";
import { getStorageNamespace } from "./registry.js";

describe("getClassProgramCodes / classHasProject — legacy + modern membership", () => {
  it("legacy programCode only -> membership works", () => {
    const c = { programCode: "794589" };
    expect(getClassProgramCodes(c)).toEqual(["794589"]);
    expect(classHasProject(c, "794589")).toBe(true);
    expect(classHasProject(c, "899373")).toBe(false);
  });
  it("modern programCodes with one project", () => {
    const c = { programCodes: ["899373"] };
    expect(getClassProgramCodes(c)).toEqual(["899373"]);
    expect(classHasProject(c, "899373")).toBe(true);
  });
  it("modern programCodes with two projects (same class in both)", () => {
    const c = { programCodes: ["899373", "883589"] };
    expect(classHasProject(c, "899373")).toBe(true);
    expect(classHasProject(c, "883589")).toBe(true);
    expect(classHasProject(c, "794589")).toBe(false);
  });
  it("programCodes [] is AUTHORITATIVE and overrides a leftover legacy programCode", () => {
    const c = { programCode: "794589", programCodes: [] };
    expect(getClassProgramCodes(c)).toEqual([]);
    expect(classHasProject(c, "794589")).toBe(false);
  });
  it("when programCodes exists it does NOT union with programCode", () => {
    const c = { programCode: "794589", programCodes: ["899373", "883589"] };
    expect(getClassProgramCodes(c)).toEqual(["899373", "883589"]);
    expect(classHasProject(c, "794589")).toBe(false);
  });
  it("no membership at all", () => {
    expect(getClassProgramCodes({})).toEqual([]);
    expect(getClassProgramCodes(null)).toEqual([]);
  });
});

describe("normalizeProgramCodes — pure shape cleaning (no throw)", () => {
  it("dedupes and drops empties, never throws on unknown", () => {
    expect(normalizeProgramCodes(["899373", "899373", "", "  ", "883589"])).toEqual(["899373", "883589"]);
    expect(normalizeProgramCodes(["abc"])).toEqual(["abc"]);
  });
});

describe("validateProgramCodes — normalize + supported-project validation", () => {
  it("accepts all supported codes and an empty set", () => {
    expect(validateProgramCodes(["794589", "899373", "883589"])).toEqual(["794589", "899373", "883589"]);
    expect(validateProgramCodes([])).toEqual([]);
  });
  it("dedupes before validating", () => {
    expect(validateProgramCodes(["899373", "899373"])).toEqual(["899373"]);
  });
  it("rejects an unsupported code (400)", () => {
    try { validateProgramCodes(["899373", "abc"]); throw new Error("should have thrown"); }
    catch (e) { expect(e.httpStatus).toBe(400); }
  });
});

describe("getSupportedClassProgramCodes", () => {
  it("returns both supported projects of a multi-project class (student sees both)", () => {
    expect(getSupportedClassProgramCodes({ programCodes: ["899373", "883589"] })).toEqual(["899373", "883589"]);
  });
});

describe("storage isolation across a class's two projects (reset scoping)", () => {
  it("899373 and 883589 progress paths for the same class are disjoint", () => {
    const a = getStorageNamespace("899373");
    const b = getStorageNamespace("883589");
    expect(a.progressPrefix("c1")).not.toBe(b.progressPrefix("c1"));
    expect(a.configName("c1")).not.toBe(b.configName("c1"));
    // Resetting one deletes only its own prefix -> the other's blobs are untouched.
  });
});
