// Guards the multi-project enrollment fix for the two LEGACY 794589 routes:
//   - api/src/functions/project-794589.js   (teacher route; project.reset lives here)
//   - api/src/functions/student-project.js   (student read-only view)
// Both must gate on classHasProject(classroom, PROGRAM_CODE) — honouring modern programCodes[]
// AND the legacy programCode fallback — instead of a raw programCode === "794589" comparison.
//
// Two layers:
//  1) Source-level regression guard: the routes actually wire classHasProject in and no longer
//     contain the old raw equality (so a class whose 794589 link was removed is blocked).
//  2) Behavioural: the exact gate predicate the routes use, driven by the REAL PROGRAM_CODE,
//     across every requested scenario.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { classHasProject } from "../src/lib/project-tracker/class-programs.js";
import { PROGRAM_CODE } from "../src/lib/project-794589-template.js";

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const teacherRoute = read("../src/functions/project-794589.js");
const studentRoute = read("../src/functions/student-project.js");

describe("legacy 794589 routes — source wired to the multi-project enrollment gate", () => {
  it("both routes import classHasProject", () => {
    expect(teacherRoute).toContain('require("../lib/project-tracker/class-programs")');
    expect(studentRoute).toContain('require("../lib/project-tracker/class-programs")');
  });
  it("project-794589 gates the catalog + every GET/POST (reset) via classHasProject, not raw equality", () => {
    expect(teacherRoute).toContain("classHasProject(c, PROGRAM_CODE)");        // classes catalog filter
    expect(teacherRoute).toContain("!classHasProject(classroom, PROGRAM_CODE)"); // GET + POST enrollment gate
    expect(teacherRoute).not.toContain("c.programCode === PROGRAM_CODE");
    expect(teacherRoute).not.toContain("classroom.programCode === PROGRAM_CODE");
  });
  it("student-project gates enrolled via classHasProject, not raw inequality", () => {
    expect(studentRoute).toContain("!classHasProject(classroom, PROGRAM_CODE)");
    expect(studentRoute).not.toContain("classroom.programCode !== PROGRAM_CODE");
  });
});

// The predicate both routes now evaluate. PROGRAM_CODE is the real "794589" constant.
const enrolled = classroom => classHasProject(classroom, PROGRAM_CODE);

describe("project-794589 route gate — teacher route / project.reset", () => {
  it("legacy programCode=794589 works (gate open)", () => {
    expect(enrolled({ programCode: "794589" })).toBe(true);
  });
  it('programCodes=["794589","899373"] works (gate open)', () => {
    expect(enrolled({ programCodes: ["794589", "899373"] })).toBe(true);
  });
  it('programCodes=["899373"] is rejected by project-794589 (gate closed)', () => {
    expect(enrolled({ programCodes: ["899373"] })).toBe(false);
  });
  it("legacy project.reset is blocked when the class is not enrolled in 794589 (gate closed)", () => {
    // A class linked only to another project can no longer reach project.reset on this route.
    expect(enrolled({ programCodes: ["899373"] })).toBe(false);
  });
  it("programCodes=[] overrides a leftover legacy programCode -> project-794589 rejects (gate closed)", () => {
    expect(enrolled({ programCode: "794589", programCodes: [] })).toBe(false);
  });
});

describe("student-project route gate — enrolled flag", () => {
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
