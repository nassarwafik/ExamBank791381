import { describe, it, expect } from "vitest";

// Grading-authority consistency pass (requirement F) — there must be exactly ONE frontend legacy grading
// resolver (resolveGradingStatus in gradingStatus.ts). Every grading-aware component must delegate to it
// rather than re-deriving the rule, and none of them may infer grading from a score/percentage.
// Sources are read as raw text via Vite's import.meta.glob (no node:fs — keeps the app tsconfig clean).
const RAW = import.meta.glob(
  "./{StudentPortal,AssignmentsPanel,AssignmentReview,StudentExamPage,TeacherPlatform,TeacherDashboard,gradingStatus,students/StudentDialog}.{ts,tsx}",
  { query: "?raw", import: "default", eager: true }
) as Record<string, string>;
const read = (key: string): string => {
  const src = RAW[key];
  if (typeof src !== "string") throw new Error("could not read source: " + key + " (have: " + Object.keys(RAW).join(", ") + ")");
  return src;
};
const COMPONENTS = ["./StudentPortal.tsx", "./AssignmentsPanel.tsx", "./AssignmentReview.tsx", "./StudentExamPage.tsx"];
// Teacher result surfaces that display a grading label — they must resolve it through the shared authority,
// never from a raw `finalized` boolean (which mislabels legacy attempts whose stored finalized is absent).
// UX-4 moved the student profile / history labels from TeacherPlatform into students/StudentDialog.
const TEACHER_RESULT_SURFACES = ["./students/StudentDialog.tsx", "./TeacherDashboard.tsx"];
// Surfaces that no longer render a grade label themselves must not have grown a raw-finalized shortcut either.
const NO_LABEL_SURFACES = ["./TeacherPlatform.tsx"];

describe("F: single shared grading resolver across the frontend", () => {
  for (const file of COMPONENTS) {
    it(`${file} delegates to the shared resolveGradingStatus`, () => {
      expect(read(file)).toMatch(/resolveGradingStatus/);
    });
    it(`${file} contains NO local copy of the pending/final derivation`, () => {
      const src = read(file);
      // The inline ternary that used to duplicate the rule in each component.
      expect(src).not.toMatch(/\?\s*"pendingReview"\s*:\s*"final"/);
      // Re-deriving grading from a raw manual-marks comparison inside a component.
      expect(src).not.toMatch(/manualReviewMarks\s*\|\|\s*0\s*\)\s*>\s*0\s*\|\|/);
    });
    it(`${file} never infers grading from a score/percentage`, () => {
      expect(read(file)).not.toMatch(/latestScore\s*!=\s*null\s*\?\s*"final"/);
    });
  }

  for (const file of TEACHER_RESULT_SURFACES) {
    it(`${file} resolves grade labels through resolveGradingStatus, not raw finalized`, () => {
      const src = read(file);
      expect(src).toMatch(/resolveGradingStatus/);
      // No grade label chosen directly from a raw `finalized` boolean (e.g. `x.finalized?"مصحح":...`).
      expect(src).not.toMatch(/finalized\s*\?\s*"(مصحح|مصححة|نهائي|العلامة النهائية)/);
    });
  }

  for (const file of NO_LABEL_SURFACES) {
    it(`${file} renders no grade label of its own (moved to a surface that uses the resolver) and never reads raw finalized for one`, () => {
      const src = read(file);
      expect(src).not.toMatch(/finalized\s*\?\s*"(مصحح|مصححة|نهائي|العلامة النهائية)/);
      expect(src).not.toMatch(/"(مصحح|بانتظار المراجعة|مصححة بالكامل)"/);
    });
  }

  it("the resolver rule itself lives only in gradingStatus.ts", () => {
    expect(read("./gradingStatus.ts")).toMatch(/export function resolveGradingStatus/);
  });
});
