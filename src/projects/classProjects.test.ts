import { describe, it, expect } from "vitest";
import { getClassProjectCodes, classHasProject } from "./classProjects";

describe("frontend getClassProjectCodes", () => {
  it("prefers modern projectCodes (authoritative, even [])", () => {
    expect(getClassProjectCodes({ projectCodes: ["899373", "883589"] })).toEqual(["899373", "883589"]);
    expect(getClassProjectCodes({ programCode: "794589", projectCodes: [] })).toEqual([]);
  });
  it("falls back to legacy programCode when projectCodes is absent", () => {
    expect(getClassProjectCodes({ programCode: "794589" })).toEqual(["794589"]);
    expect(getClassProjectCodes({})).toEqual([]);
  });
  it("classHasProject checks membership", () => {
    expect(classHasProject({ projectCodes: ["899373", "883589"] }, "883589")).toBe(true);
    expect(classHasProject({ programCode: "794589" }, "899373")).toBe(false);
  });
});
