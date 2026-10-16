// @vitest-environment happy-dom
// Phase 21G.0 — the composer checks the availability window before anything is sent, and a new assignment starts as a draft.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRef } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { assignmentWindowIssues, windowBlocks } from "./assignmentWindow";
import AssignmentComposer, { type AssignmentComposerProps } from "./AssignmentComposer";

const NOW = Date.parse("2026-10-16T09:00:00");
afterEach(cleanup);

describe("assignmentWindowIssues", () => {
  it("accepts a deadline after the opening time, and empty values", () => {
    expect(assignmentWindowIssues("2026-10-17T08:00", "2026-10-20T10:00", NOW)).toEqual([]);
    expect(assignmentWindowIssues("", "", NOW)).toEqual([]);
    expect(assignmentWindowIssues("", "2026-10-20T10:00", NOW)).toEqual([]);
  });
  it("blocks a deadline at or before the opening time", () => {
    for (const due of ["2026-10-17T08:00", "2026-10-16T23:00"]) {
      const issues = assignmentWindowIssues("2026-10-17T08:00", due, NOW);
      expect(issues).toEqual([{ field: "dueAt", message: "آخر موعد يجب أن يكون بعد موعد الفتح.", blocking: true }]);
      expect(windowBlocks(issues)).toBe(true);
    }
  });
  it("blocks an unreadable date", () => {
    expect(assignmentWindowIssues("not-a-date", "2026-10-20T10:00", NOW).map(i => [i.field, i.blocking])).toEqual([["openAt", true]]);
    expect(assignmentWindowIssues("2026-10-17T08:00", "x", NOW).map(i => [i.field, i.blocking])).toEqual([["dueAt", true]]);
  });
  it("warns about (but allows) a deadline already in the past", () => {
    const issues = assignmentWindowIssues("2026-10-01T08:00", "2026-10-05T10:00", NOW);
    expect(issues).toEqual([{ field: "dueAt", message: "آخر موعد مضى بالفعل؛ لن يتمكن الطلاب من التسليم.", blocking: false }]);
    expect(windowBlocks(issues)).toBe(false);
  });
});

function composer(over: Partial<AssignmentComposerProps> = {}) {
  const noop = vi.fn();
  const props: AssignmentComposerProps = {
    headingRef: createRef<HTMLHeadingElement>(), onClose: noop, busy: false, examLoading: false,
    sourceMode: "mine", onSourceMode: noop, sourceExam: null, sourceCount: 0, currentExam: null, hasCurrent: false,
    savedExams: [], examSource: "", onChooseExam: noop,
    libraryLoading: false, libraryItems: [], libraryCategories: [], librarySearch: "", onLibrarySearch: noop, libraryCategory: "", onLibraryCategory: noop,
    librarySelectedId: "", onChooseLibraryItem: noop, onPreview: noop, previewBusyId: "", copyBusyId: "",
    activeClasses: [], classIds: [], onToggleClass: noop, onAllClasses: noop, initialStep: "timing", title: "", onTitle: noop, instructions: "", onInstructions: noop,
    openAt: "2026-10-17T08:00", onOpenAt: noop, dueAt: "2026-10-16T08:00", onDueAt: noop,
    maxAttempts: 1, onMaxAttempts: noop, durationMinutes: 0, onDurationMinutes: noop, attemptPolicy: "continuous", onAttemptPolicy: noop,
    publish: false, onPublish: noop, canCreate: false, onCreate: noop, ...over
  };
  return render(<AssignmentComposer {...props} />);
}

describe("the assignment composer", () => {
  it("shows a blocking window issue at its field, marks the field invalid and describes it", () => {
    composer({ windowIssues: assignmentWindowIssues("2026-10-17T08:00", "2026-10-16T08:00", NOW) });
    const due = screen.getByLabelText("آخر موعد") as HTMLInputElement;
    expect(due.getAttribute("aria-invalid")).toBe("true");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("آخر موعد يجب أن يكون بعد موعد الفتح.");
    expect(due.getAttribute("aria-describedby")).toBe(alert.id);
    expect((screen.getByLabelText("يفتح في") as HTMLInputElement).hasAttribute("aria-invalid")).toBe(false);
  });
  it("a past deadline is a polite warning, not an error", () => {
    composer({ windowIssues: assignmentWindowIssues("2026-10-01T08:00", "2026-10-05T10:00", NOW) });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("آخر موعد مضى بالفعل؛ لن يتمكن الطلاب من التسليم.").getAttribute("role")).toBe("status");
    expect((screen.getByLabelText("آخر موعد") as HTMLInputElement).hasAttribute("aria-invalid")).toBe(false);
  });
  it("says what the publish choice means for students", () => {
    composer({ initialStep: "rules" });
    const box = screen.getByLabelText("نشر مباشرة") as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(document.getElementById(box.getAttribute("aria-describedby") || "")?.textContent).toBe("يبقى مسودة لا يراها الطلاب حتى تنشره.");
  });
});
