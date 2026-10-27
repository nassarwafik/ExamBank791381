// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import AssignmentComposer, { type AssignmentComposerProps } from "./AssignmentComposer";
import Gradebook from "./Gradebook";
import LatePolicyFields from "./LatePolicyFields";
import { latePolicyLabel, lateUntilIso, normalizeLatePolicy, lateDurationLabel } from "./latePolicy";
import { reviewRows } from "./assignmentWizard";
import { resultsReleaseState } from "./resultsRelease";
import { timeLabel } from "./assignmentsHome";
import { LateResultNote, LateWindowNotice } from "../student/exam/LateNotice";
import StudentAssignmentCard from "../student/StudentAssignmentCard";
import type { Item, StudentResult } from "./types";
import type { Summary } from "../student/types";

// D5 (item 10, owner decision) — the teacher's late policy (off by default; a late window after the due date with a fixed deduction)
// and how it is shown: the composer and its review, the assignment's settings, the gradebook (late badge, mark before the deduction,
// waive / restore) and the student's notices. The server enforces everything; these are the words and the controls.

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const H = 3600000, NOW = Date.parse("2026-11-01T10:00:00Z"), iso = (ms: number) => new Date(ms).toISOString();

describe("the policy in words", () => {
  it("normalizes like the server and words the choice", () => {
    expect(normalizeLatePolicy({ windowHours: 48, deductionPercent: 10 })).toEqual({ windowHours: 48, deductionPercent: 10 });
    expect(normalizeLatePolicy({ windowHours: 48, deductionPercent: 95 })).toBeNull();
    expect(normalizeLatePolicy(null)).toBeNull();
    expect(latePolicyLabel(null)).toBe("لا يُقبل بعد الموعد");
    expect(latePolicyLabel({ windowHours: 48, deductionPercent: 10 })).toBe("يُقبل حتى يومان بعد الموعد، بخصم 10٪ من علامة المحاولة");
    expect(latePolicyLabel({ windowHours: 24, deductionPercent: 0 })).toBe("يُقبل حتى يوم واحد بعد الموعد، دون خصم");
    expect(lateUntilIso(iso(NOW), { windowHours: 24, deductionPercent: 5 })).toBe(iso(NOW + 24 * H));
    expect(lateUntilIso("", { windowHours: 24, deductionPercent: 5 })).toBe("");
    expect([30, 180, 3000].map(lateDurationLabel)).toEqual(["30 دقيقة", "3 ساعة", "2 يوم"]);
  });
});

describe("the teacher's controls", () => {
  it("LatePolicyFields: off by default; turning it on reports the default (1 day, 10 %); the selects report their choice; off → null", () => {
    const onChange = vi.fn();
    const { rerender } = render(<LatePolicyFields value={null} onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "قبول التسليم المتأخر" }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.queryByLabelText("نسبة الخصم")).toBeNull();
    fireEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith({ windowHours: 24, deductionPercent: 10 });
    rerender(<LatePolicyFields value={{ windowHours: 24, deductionPercent: 10 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("المدة المسموحة بعد الموعد"), { target: { value: "72" } });
    expect(onChange).toHaveBeenLastCalledWith({ windowHours: 72, deductionPercent: 10 });
    fireEvent.change(screen.getByLabelText("نسبة الخصم"), { target: { value: "25" } });
    expect(onChange).toHaveBeenLastCalledWith({ windowHours: 24, deductionPercent: 25 });
    expect(screen.getByRole("status").textContent).toContain("تُقبل المحاولات حتى يوم واحد بعد موعد كل طالب");
    fireEvent.click(screen.getByRole("checkbox", { name: "قبول التسليم المتأخر" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
  it("the composer's rules step offers it (disabled without a due date) and the review lists it", () => {
    const onLatePolicy = vi.fn();
    const props = {
      headingRef: { current: null }, onClose: vi.fn(), busy: false, examLoading: false, sourceMode: "mine", onSourceMode: vi.fn(), sourceExam: null, sourceCount: 0,
      currentExam: null, hasCurrent: false, savedExams: [], examSource: "", onChooseExam: vi.fn(), libraryLoading: false, libraryItems: [], libraryCategories: [],
      librarySearch: "", onLibrarySearch: vi.fn(), libraryCategory: "", onLibraryCategory: vi.fn(), librarySelectedId: "", onChooseLibraryItem: vi.fn(), onPreview: vi.fn(),
      previewBusyId: "", copyBusyId: "", activeClasses: [], classIds: [], onToggleClass: vi.fn(), onAllClasses: vi.fn(), initialStep: "rules", title: "", onTitle: vi.fn(), instructions: "", onInstructions: vi.fn(),
      openAt: "", onOpenAt: vi.fn(), dueAt: "2026-11-05T10:00", onDueAt: vi.fn(), maxAttempts: 1, onMaxAttempts: vi.fn(), durationMinutes: 0, onDurationMinutes: vi.fn(),
      attemptPolicy: "continuous", onAttemptPolicy: vi.fn(), publish: true, onPublish: vi.fn(), canCreate: false, onCreate: vi.fn(), latePolicy: null, onLatePolicy
    } as unknown as AssignmentComposerProps;
    const { rerender } = render(<AssignmentComposer {...props} />);
    const group = screen.getByRole("group", { name: "التسليم المتأخر" });
    fireEvent.click(within(group).getByRole("checkbox"));
    expect(onLatePolicy).toHaveBeenLastCalledWith({ windowHours: 24, deductionPercent: 10 });
    rerender(<AssignmentComposer {...props} dueAt="" />);
    expect((within(screen.getByRole("group", { name: "التسليم المتأخر" })).getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    const base = { title: "واجب", classIds: ["c"], hasContent: true, windowIssues: [], contentTitle: "x", questionCount: 1, classNames: ["أ"], openAt: "", dueAt: "", maxAttempts: 1, durationMinutes: 0, attemptPolicy: "continuous", resultsRelease: "immediate", publish: false, fmt: (v: string) => v };
    expect(reviewRows({ ...base, latePolicy: { windowHours: 72, deductionPercent: 20 } } as never).find(r => r.label === "التسليم المتأخر")?.value).toBe("يُقبل حتى 3 أيام بعد الموعد، بخصم 20٪ من علامة المحاولة");
    expect(reviewRows({ ...base, latePolicy: null } as never).find(r => r.label === "التسليم المتأخر")?.value).toBe("لا يُقبل بعد الموعد");
    expect(reviewRows(base as never).some(r => r.label === "التسليم المتأخر")).toBe(false);                 // a caller that predates D5
  });
  it("«بعد الموعد النهائي» results wait for the late window; the list says the assignment still takes late work", () => {
    const item = { dueAt: iso(NOW), resultsRelease: "afterDue", latePolicy: { windowHours: 24, deductionPercent: 10 } } as Item;
    expect(resultsReleaseState(item, NOW + H, v => v)).toEqual({ visible: false, text: "مخفية حتى نهاية مدة التسليم المتأخر: " + iso(NOW + 24 * H) });
    expect(resultsReleaseState(item, NOW + 25 * H, v => v).visible).toBe(true);
    expect(resultsReleaseState({ ...item, latePolicy: null }, NOW + H, v => v).visible).toBe(true);
    const listed = { status: "published", openAt: "", dueAt: iso(NOW), latePolicy: { windowHours: 24, deductionPercent: 10 } } as unknown as Item;
    expect(timeLabel(listed, NOW + 2 * H)).toMatchObject({ status: "closed", tone: "attention", label: "انتهى الموعد · تسليم متأخر خلال 22 ساعة" });
    expect(timeLabel(listed, NOW + 30 * H)).toMatchObject({ status: "closed", tone: "neutral" });
    expect(timeLabel({ ...listed, latePolicy: null }, NOW + 2 * H)).toMatchObject({ label: "أُغلق منذ ساعتين" });
  });
});

describe("the gradebook", () => {
  const item = { assignmentId: "a1", title: "واجب", status: "published", maxAttempts: 1, questionCount: 1, totalMarks: 10 } as unknown as Item;
  const lateRow = (late: Record<string, unknown>, over: Record<string, unknown> = {}): StudentResult => ({ studentId: "s1", studentName: "أحمد", studentCode: "S1", attemptsUsed: 1, allowedAttempts: 1, dueAtOverride: null, attempts: [],
    latestResult: { attemptNumber: 1, score: 7.2, totalMarks: 10, percentage: 72, submittedAt: "", finalized: true, manualReviewMarks: 0, rawScore: 8, latePenalty: 0.8, late: late as never, ...over } });
  const mount = (rows: StudentResult[], onLateWaiver = vi.fn()) => { render(<Gradebook assignment={item} rows={rows} totalRows={rows.length} gradingOf={() => "final"} busy={false} search="" onSearch={() => {}} filter="all" onFilter={() => {}} sort="name" onSort={() => {}} onReview={() => {}} onGrant={() => {}} onReopen={() => {}} onExtend={() => {}} onDeadline={() => {}} onEndAttempt={() => {}} onLateWaiver={onLateWaiver} fmt={v => v} />); return onLateWaiver; };
  it("a late row: the badge, the mark before the deduction, and «إلغاء خصم التأخير» in the row menu", () => {
    const onLateWaiver = mount([lateRow({ minutesLate: 180, deductionPercent: 10, waived: false })]);
    expect(screen.getByText("متأخر 3 ساعة · خصم 10٪")).toBeTruthy();
    expect(screen.getByText("قبل الخصم: 8")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إجراءات أحمد" }));
    fireEvent.click(screen.getByRole("button", { name: /إلغاء خصم التأخير/ }));
    expect(onLateWaiver).toHaveBeenCalledWith(expect.objectContaining({ studentId: "s1" }), true);
  });
  it("a waived row offers «إعادة خصم التأخير»; an on-time row shows no late badge and no waiver", () => {
    const onLateWaiver = mount([lateRow({ minutesLate: 30, deductionPercent: 10, waived: true }, { score: 8, latePenalty: 0, percentage: 80 })]);
    expect(screen.getByText("متأخر 30 دقيقة · أُلغي الخصم")).toBeTruthy();
    expect(screen.queryByText(/قبل الخصم/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إجراءات أحمد" }));
    fireEvent.click(screen.getByRole("button", { name: /إعادة خصم التأخير/ }));
    expect(onLateWaiver).toHaveBeenCalledWith(expect.anything(), false);
    cleanup();
    mount([{ ...lateRow({}), latestResult: { attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, submittedAt: "", finalized: true, manualReviewMarks: 0 } }]);
    expect(screen.queryByText(/متأخر/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "إجراءات أحمد" }));
    expect(screen.queryByText(/خصم التأخير/)).toBeNull();
  });
});

describe("the student", () => {
  it("the window notice before and inside the window; nothing without a policy", () => {
    const { rerender, container } = render(<LateWindowNotice lateWindow={{ active: false, until: "2026-11-02T10:00:00Z", deductionPercent: 10 }} />);
    expect(container.textContent).toMatch(/^بعد الموعد يُقبل التسليم المتأخر حتى .+، مع خصم 10٪ من علامة المحاولة\.$/);
    rerender(<LateWindowNotice lateWindow={{ active: true, until: "2026-11-02T10:00:00Z", deductionPercent: 10 }} />);
    expect(screen.getByRole("status").textContent).toMatch(/^انتهى الموعد الأصلي\. يُقبل التسليم المتأخر حتى/);
    rerender(<LateWindowNotice lateWindow={undefined} />);
    expect(container.textContent).toBe("");
  });
  it("a late result: the deduction with the marks when they are released; only the percentage while they are withheld; the waiver", () => {
    const { rerender, container } = render(<LateResultNote result={{ late: { minutesLate: 90, deductionPercent: 10, waived: false }, rawScore: 8, latePenalty: 0.8 }} showMarks />);
    expect(container.textContent).toBe("سُلّمت المحاولة متأخرة 2 ساعة، فخُصم 10٪ (0.8 علامة). العلامة قبل الخصم: 8.");
    rerender(<LateResultNote result={{ late: { minutesLate: 90, deductionPercent: 10, waived: false } }} showMarks={false} />);
    expect(container.textContent).toBe("سُلّمت المحاولة متأخرة 2 ساعة، ويُخصم 10٪ من علامتها.");
    rerender(<LateResultNote result={{ late: { minutesLate: 90, deductionPercent: 10, waived: true }, rawScore: 8, latePenalty: 0 }} showMarks />);
    expect(container.textContent).toBe("سُلّمت المحاولة متأخرة 2 ساعة، وألغى المعلم خصم التأخير.");
    rerender(<LateResultNote result={{}} showMarks />);
    expect(container.textContent).toBe("");
  });
  it("the task card says the late window is open", () => {
    const item = { assignmentId: "a", title: "واجب", instructions: "", openAt: "", dueAt: iso(NOW), questionCount: 1, totalMarks: 10, availability: "open", attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, latestScore: null, latestPercentage: null, createdAt: "", inLateWindow: true, lateUntil: iso(NOW + 24 * H), lateDeductionPercent: 10 } as Summary;
    render(<StudentAssignmentCard item={item} busy={false} onOpen={() => {}} />);
    expect(screen.getByTestId("card-late-window").textContent).toMatch(/^تسليم متأخر حتى .+ · خصم 10٪$/);
  });
});
