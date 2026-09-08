import { describe, it, expect } from "vitest";
import { getClassProgramCodes, classHasProject } from "./classPrograms";

describe("frontend getClassProgramCodes", () => {
  it("prefers modern programCodes (authoritative, even [])", () => {
    expect(getClassProgramCodes({ programCodes: ["899373", "883589"] })).toEqual(["899373", "883589"]);
    expect(getClassProgramCodes({ programCode: "794589", programCodes: [] })).toEqual([]);
  });
  it("falls back to legacy programCode when programCodes is absent", () => {
    expect(getClassProgramCodes({ programCode: "794589" })).toEqual(["794589"]);
    expect(getClassProgramCodes({})).toEqual([]);
  });
  it("classHasProject checks membership", () => {
    expect(classHasProject({ programCodes: ["899373", "883589"] }, "883589")).toBe(true);
    expect(classHasProject({ programCode: "794589" }, "899373")).toBe(false);
  });
});
