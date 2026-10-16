// @vitest-environment happy-dom
//
// Phase 21G.7 — the accessibility gate's findings, pinned (axe-core WCAG 2.1 AA at 390 / 834 / 1180 / 1440 px found them):
// the wizard's blocking reasons are a list INSIDE a status region (a list with role=status broke list semantics); the question
// table that scrolls sideways is a named, focusable region (a keyboard user can scroll it); and on a touch screen every control
// of the assignments workspace and the review gets a 44 px target (a box 24 px — the WCAG 2.2 AA minimum).
import { describe, it, expect, afterEach, vi } from "vitest";
import { createRef } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, screen, within } from "@testing-library/react";
import AssignmentComposer, { type AssignmentComposerProps } from "./AssignmentComposer";
import AssignmentDetail from "./AssignmentDetail";

afterEach(cleanup);
const noop = vi.fn();

describe("the gate's markup findings", () => {
  it("the wizard's blocking reasons: a list inside a status region", () => {
    const props = {
      headingRef: createRef<HTMLHeadingElement>(), onClose: noop, busy: false, examLoading: false, sourceMode: "mine", onSourceMode: noop, sourceExam: null, sourceCount: 0, currentExam: null, hasCurrent: false,
      savedExams: [], examSource: "", onChooseExam: noop, libraryLoading: false, libraryItems: [], libraryCategories: [], librarySearch: "", onLibrarySearch: noop, libraryCategory: "", onLibraryCategory: noop,
      librarySelectedId: "", onChooseLibraryItem: noop, onPreview: noop, previewBusyId: "", copyBusyId: "", activeClasses: [], classIds: [], onToggleClass: noop, onAllClasses: noop,
      title: "", onTitle: noop, instructions: "", onInstructions: noop, openAt: "", onOpenAt: noop, dueAt: "", onDueAt: noop, maxAttempts: 1, onMaxAttempts: noop, durationMinutes: 0, onDurationMinutes: noop,
      attemptPolicy: "continuous", onAttemptPolicy: noop, publish: false, onPublish: noop, canCreate: false, onCreate: noop
    } as unknown as AssignmentComposerProps;
    render(<AssignmentComposer {...props} />);
    const status = screen.getByRole("status", { name: "ما يمنع المتابعة" });
    expect(status.tagName).toBe("DIV");
    const list = within(status).getByRole("list");
    expect(within(list).getAllByRole("listitem").map(li => li.textContent)).toEqual(["اختر محتوى الواجب: امتحانًا من امتحاناتي أو عنصرًا من المكتبة.", "عنوان الواجب مطلوب."]);
  });

  it("the question analysis table is a named, keyboard-focusable region", () => {
    const q = { questionId: "q1", number: 1, text: "س", type: "open", maxMarks: 2, studentsAnalyzed: 1, correctCount: 1, correctRate: 100, averageScore: 2, averagePercentage: 100, manualReviewCount: 0, difficulty: "easy" as const };
    render(<AssignmentDetail item={{ assignmentId: "a1", classId: "c", className: "أ", title: "و", instructions: "", status: "published", openAt: "", dueAt: "", questionCount: 1, totalMarks: 2, maxAttempts: 1 }} stats={null} loading={false} headingRef={createRef()} onClose={noop}
      analysis={{ assignmentId: "a1", title: "و", studentsInClass: 1, studentsSubmitted: 1, attemptsAnalyzed: 1, questions: [q] }} analysisBusy={false} analysisSort="number" onAnalysisSort={noop}
      tab="analysis" onTab={noop} overview={null} sortedQuestions={[q]} analysisSummary={null} fmt={v => v}>{null}</AssignmentDetail>);
    const region = screen.getByRole("region", { name: "جدول تحليل الأسئلة" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(within(region).getByRole("table")).toBeTruthy();
  });
});

describe("the gate's touch-target rules", () => {
  const read = (f: string) => readFileSync(path.join(process.cwd(), "src", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const coarse = (css: string) => { const i = css.lastIndexOf("@media (pointer: coarse)"); expect(i).toBeGreaterThan(0); return css.slice(i, css.indexOf("\n}", i)); };
  it("the workspace: 44 px for chips, steps, sort buttons, menus, icon and small buttons; 24 px boxes", () => {
    const block = coarse(read("assignments-pro.css"));
    for (const sel of [".eb-filter-chip", ".gradebook-chip", ".eb-wizard-step", ".eb-th-sort", ".eb-menu-trigger", ".eb-icon-button", ".eb-button.is-small"]) expect(block).toContain(".eb-assignments " + sel);
    expect(block).toMatch(/min-block-size: 44px; min-inline-size: 44px;/);
    expect(block).toMatch(/\.eb-assignments \.eb-select-box, \.eb-assignments \.eb-class-option input \{ inline-size: 24px; block-size: 24px; \}/);
  });
  it("the review: 44 px for the student navigation, attempt tabs, filters, pager and close", () => {
    const block = coarse(read("review-workspace.css"));
    expect(block).toContain(".rv-student-nav button, .review-attempt-tabs button, .rv-filter, .rv-pager button, .review-top > button { min-block-size: 44px; }");
  });
});
