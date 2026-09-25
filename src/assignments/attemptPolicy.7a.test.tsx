// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import AssignmentComposer, { type AssignmentComposerProps } from "./AssignmentComposer";
import Gradebook from "./Gradebook";
import { ATTEMPT_POLICY_OPTIONS, attemptPolicyLabel, endReasonLabel, formatRemaining, normalizeAttemptPolicy } from "./attemptPolicy";
import { LIFECYCLE_LABEL, type Item, type StudentResult } from "./types";

// Phase 7A — teacher-facing attempt policy: the composer's «طريقة المحاولة» choice and the Arabic lifecycle / end-reason
// labels (never the internal enum names).

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function composer(over: Partial<AssignmentComposerProps> = {}) {
  const props = {
    headingRef: { current: null }, onClose: vi.fn(), busy: false, examLoading: false, sourceMode: "mine", onSourceMode: vi.fn(), sourceExam: null, sourceCount: 0,
    currentExam: null, hasCurrent: false, savedExams: [], examSource: "", onChooseExam: vi.fn(), libraryLoading: false, libraryItems: [], libraryCategories: [],
    librarySearch: "", onLibrarySearch: vi.fn(), libraryCategory: "", onLibraryCategory: vi.fn(), librarySelectedId: "", onChooseLibraryItem: vi.fn(), onPreview: vi.fn(),
    previewBusyId: "", copyBusyId: "", activeClasses: [], classId: "", onClassId: vi.fn(), title: "", onTitle: vi.fn(), instructions: "", onInstructions: vi.fn(),
    openAt: "", onOpenAt: vi.fn(), dueAt: "", onDueAt: vi.fn(), maxAttempts: 1, onMaxAttempts: vi.fn(), durationMinutes: 0, onDurationMinutes: vi.fn(),
    attemptPolicy: "continuous", onAttemptPolicy: vi.fn(), publish: true, onPublish: vi.fn(), canCreate: false, onCreate: vi.fn(), ...over
  } as unknown as AssignmentComposerProps;
  render(<AssignmentComposer {...props} />);
  return props;
}

describe("composer — «طريقة المحاولة»", () => {
  it("three mutually exclusive, explained choices; «عادي» is the default; choosing one reports it", () => {
    const props = composer();
    const group = screen.getByRole("group", { name: "طريقة المحاولة" });
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    expect(radios.filter(r => r.checked).map(r => r.value)).toEqual(["continuous"]);
    expect(new Set(radios.map(r => r.name)).size).toBe(1);                                   // one radio group
    for (const o of ATTEMPT_POLICY_OPTIONS) {
      expect(within(group).getByText(o.label)).toBeTruthy();
      expect(within(group).getByText(o.summary)).toBeTruthy();
      expect(within(group).getByText(o.detail)).toBeTruthy();
    }
    expect(group.textContent).toContain("يمكن للطالب الخروج والعودة — الوقت يستمر");
    expect(group.textContent).toContain("مغادرة صفحة الامتحان تنهي المحاولة");
    expect(group.textContent).toContain("يمكن حفظ المحاولة والخروج ثم استكمالها لاحقًا");
    fireEvent.click(within(group).getByRole("radio", { name: /صارم/ }));
    expect(props.onAttemptPolicy).toHaveBeenLastCalledWith("strict");
    fireEvent.click(within(group).getByRole("radio", { name: /حفظ مؤقت واستكمال/ }));
    expect(props.onAttemptPolicy).toHaveBeenLastCalledWith("pausable");
  });

  it("reflects the chosen policy", () => {
    composer({ attemptPolicy: "pausable" });
    expect((screen.getByRole("radio", { name: /حفظ مؤقت واستكمال/ }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("labels — Arabic only, historical values unchanged", () => {
  it("policy / lifecycle / end-reason labels", () => {
    expect(attemptPolicyLabel(undefined)).toBe("عادي");
    expect(attemptPolicyLabel("strict")).toBe("صارم");
    expect(attemptPolicyLabel("bogus")).toBe("عادي");
    expect(normalizeAttemptPolicy("pausable")).toBe("pausable");
    expect(LIFECYCLE_LABEL.paused).toBe("متوقفة مؤقتًا");
    expect(LIFECYCLE_LABEL.integrityExit).toBe("غادر صفحة الامتحان");
    expect(LIFECYCLE_LABEL.timedOut).toBe("انتهى الوقت");                                   // historical labels unchanged
    expect(LIFECYCLE_LABEL.submitted).toBe("تم التسليم");
    expect(endReasonLabel("integrityExit")).toBe("غادر صفحة الامتحان");
    expect(endReasonLabel("timedOut")).toBe("انتهى الوقت");
    expect(endReasonLabel("submitted")).toBe("تسليم");
    expect(formatRemaining(38 * 60000)).toBe("38 دقيقة");
    expect(formatRemaining(90 * 60000 + 1)).toBe("1 ساعة و31 دقيقة");                        // never rounds a student down
  });
});

describe("gradebook — paused / integrity-exit rows", () => {
  const item = { assignmentId: "a1", title: "امتحان", status: "published", attemptPolicy: "pausable", maxAttempts: 1, questionCount: 1, totalMarks: 10 } as unknown as Item;
  const row = (over: Partial<StudentResult>): StudentResult => ({ studentId: "s1", studentName: "أحمد", studentCode: "S1", attemptsUsed: 0, allowedAttempts: 1, dueAtOverride: null, attempts: [], latestResult: null, timed: true, ...over });
  const mountRows = (rows: StudentResult[]) => render(<Gradebook assignment={item} rows={rows} totalRows={rows.length} gradingOf={() => "notSubmitted"} busy={false} search="" onSearch={() => {}} filter="all" onFilter={() => {}} sort="name" onSort={() => {}} onReview={() => {}} onGrant={() => {}} onReopen={() => {}} onExtend={() => {}} onDeadline={() => {}} fmt={v => v} />);

  it("a paused attempt: «متوقفة مؤقتًا» with its remaining budget, no running end time, and no timer extension offered", () => {
    mountRows([row({ attemptStatus: "paused", effectiveAttemptEndsAt: "", activeAttempt: { attemptNumber: 1, startedAt: "S", endsAt: "E", status: "paused", pausedAt: "P", pausedRemainingMs: 38 * 60000 } })]);
    expect(screen.getByText("متوقفة مؤقتًا")).toBeTruthy();
    expect(screen.getByText(/المتبقي 38 دقيقة/)).toBeTruthy();
    expect(screen.queryByText(/ينتهي فعليًا/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إجراءات أحمد" }));                    // open the row menu
    expect(screen.getByText(/تمديد الموعد/)).toBeTruthy();                                        // the menu is open
    expect(screen.queryByText(/تمديد وقت المحاولة/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/paused|integrityExit/);
  });

  it("a RUNNING timed attempt still offers the timer extension (control group)", () => {
    mountRows([row({ attemptStatus: "started", effectiveAttemptEndsAt: "X", activeAttempt: { attemptNumber: 1, startedAt: "S", endsAt: "E", status: "started" } })]);
    fireEvent.click(screen.getByRole("button", { name: "إجراءات أحمد" }));
    expect(screen.getByText(/تمديد وقت المحاولة/)).toBeTruthy();
  });

  it("a strict attempt that ended by leaving: «غادر صفحة الامتحان» (never shown as a timeout)", () => {
    mountRows([row({ attemptStatus: "integrityExit", attemptsUsed: 1 })]);
    expect(screen.getByText("غادر صفحة الامتحان")).toBeTruthy();
    expect(screen.queryByText("انتهى الوقت")).toBeNull();
  });
});
