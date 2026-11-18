// Phase T7 — the student tools offered in each course's book (learning materials), by the owner's decision: a FIXED set per course,
// defined here in code — no stored setting, no route, no teacher screen. Learning is practice, not an exam, so the working is on
// (conversion steps, subnetting, plot analysis …). Every set is an ordinary StudentToolsSpecV1: the reader hands it to the same
// StudentToolDock the exam uses, which re-projects it (an invalid set would simply render nothing; a test pins every set as valid).
// A course without an entry shows no tools.

import type { StudentToolsSpecV1 } from "./studentToolsSpec";

const calculator = { id: "calculator", variant: "scientific", angleUnit: "deg" } as const;
const scratchPad = { id: "scratchPad", drawing: true } as const;
const allBases = { id: "baseConverter", bases: [2, 8, 10, 16], showSteps: true } as const;

const NETWORKS: StudentToolsSpecV1 = {
  version: 1,
  tools: [
    { id: "ipv4Calculator", showBinary: true, allowSubnetting: true },
    { ...allBases, bases: [...allBases.bases] },
    { id: "bitwiseCalculator", width: 32 },
    { id: "unitConverter", categories: ["data", "dataRate"] },
    { ...calculator },
    { ...scratchPad }
  ]
};

/** courseId → the tools its book offers. */
export const COURSE_STUDENT_TOOLS: Readonly<Record<string, StudentToolsSpecV1>> = Object.freeze({
  // شبكات الاتصال and its summary sheets
  "791381": NETWORKS,
  "791381s": NETWORKS,
  // أسس علم الحاسوب
  "899371": {
    version: 1,
    tools: [
      { ...allBases, bases: [...allBases.bases] },
      { id: "asciiTable", range: "full" },
      { id: "truthTable", maxVariables: 6 },
      { id: "bitwiseCalculator", width: 8 },
      { id: "unitConverter", categories: ["data", "dataRate"] },
      { ...calculator },
      { ...scratchPad }
    ]
  },
  // الأتمتة
  "899271": {
    version: 1,
    tools: [{ ...scratchPad }, { ...allBases, bases: [...allBases.bases] }, { ...calculator }]
  },
  // مبنى المعطيات
  "899271d": {
    version: 1,
    tools: [{ ...calculator }, { ...allBases, bases: [...allBases.bases] }, { id: "bitwiseCalculator", width: 32 }, { ...scratchPad }]
  }
});

/** The book's tools, or undefined (an own property only: "toString" is not a course). */
export function courseStudentTools(courseId: string): StudentToolsSpecV1 | undefined {
  return Object.prototype.hasOwnProperty.call(COURSE_STUDENT_TOOLS, courseId) ? COURSE_STUDENT_TOOLS[courseId] : undefined;
}
