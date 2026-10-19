// Guards the multi-project enrollment gate for Project 794589. Phase P-9 removed the two LEGACY 794589 routes
// (project-794589 and student-project); 794589 is served by the generic routes (project-tracker with
// projectCode=794589, student-project-tracker), which gate on the same classHasProject(classroom, projectCode)
// predicate — honouring modern programCodes[] AND the legacy programCode fallback — never a raw programCode equality.
//
// Two layers:
//  1) Source-level regression guard: the generic teacher route and the shared service wire classHasProject in and
//     contain no raw equality (so a class whose 794589 link was removed is blocked).
//  2) Behavioural: the exact gate predicate, driven by the REAL PROGRAM_CODE, across every requested scenario.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classHasProject } from "../src/lib/project-tracker/class-programs.js";
import { PROGRAM_CODE } from "../src/lib/project-794589-template.js";

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const teacherRoute = read("../src/functions/project-tracker.js");
const serviceSource = read("../src/lib/project-tracker/service.js");

describe("794589 enrollment gate — generic teacher route and shared service source", () => {
  it("the generic teacher route imports classHasProject", () => {
    expect(teacherRoute).toContain('require("../lib/project-tracker/class-programs")');
  });
  it("the classes catalog + every GET/POST (reset) gate via classHasProject, not raw equality", () => {
    expect(teacherRoute).toContain("svc.listProjectClasses(container, projectCode)"); // classes catalog (shared)
    expect(serviceSource).toContain("classHasProject(c, projectCode)");                // ... which gates via classHasProject
    expect(teacherRoute).toContain("!classHasProject(classroom, projectCode)");       // GET + POST enrollment gate
    expect(teacherRoute).not.toContain("programCode === ");
    expect(serviceSource).not.toContain("programCode === ");
  });
});

// The predicate the generic routes evaluate for 794589. PROGRAM_CODE is the real "794589" constant.
const enrolled = classroom => classHasProject(classroom, PROGRAM_CODE);

describe("794589 gate — teacher route / project.reset", () => {
  it("legacy programCode=794589 works (gate open)", () => {
    expect(enrolled({ programCode: "794589" })).toBe(true);
  });
  it('programCodes=["794589","899373"] works (gate open)', () => {
    expect(enrolled({ programCodes: ["794589", "899373"] })).toBe(true);
  });
  it('programCodes=["899373"] is rejected for 794589 (gate closed)', () => {
    expect(enrolled({ programCodes: ["899373"] })).toBe(false);
  });
  it("project.reset for 794589 is blocked when the class is not enrolled in 794589 (gate closed)", () => {
    // A class linked only to another project can no longer reach project.reset for 794589.
    expect(enrolled({ programCodes: ["899373"] })).toBe(false);
  });
  it("programCodes=[] overrides a leftover legacy programCode -> 794589 rejected (gate closed)", () => {
    expect(enrolled({ programCode: "794589", programCodes: [] })).toBe(false);
  });
});

describe("794589 gate — student view (enrolled)", () => {
  it('programCodes=["794589","883589"] => enrolled true', () => {
    expect(enrolled({ programCodes: ["794589", "883589"] })).toBe(true);
  });
  it('programCodes=["883589"] => enrolled false', () => {
    expect(enrolled({ programCodes: ["883589"] })).toBe(false);
  });
  it("legacy programCode=794589 => enrolled true", () => {
    expect(enrolled({ programCode: "794589" })).toBe(true);
  });
  it("programCodes=[] overrides legacy programCode => enrolled false", () => {
    expect(enrolled({ programCode: "794589", programCodes: [] })).toBe(false);
  });
});
