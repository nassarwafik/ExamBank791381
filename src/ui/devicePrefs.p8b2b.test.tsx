// @vitest-environment happy-dom
// Tadris+ P8-B2b — the teacher's table and view preferences on THIS DEVICE (owner decisions §19.31: «على هذا الجهاز», «لكل صفحة»), test
// data only: kept in localStorage only (never sent: no request carries them), validated on read (unknown → the page's default, which is
// the look before P8-B2b), the default stored as the key's absence, storage failures ignored. Each page keeps its own choice:
//   the gradebook's order (kept from one assignment to the next; the search and the filter still start empty), the bank's question
//   filters (never the search text), and the view of the classes, the assignments («بطاقات» / «قائمة مضغوطة») and the project students.
// (The roster's filter and sort: src/TeacherPlatform.ux4.test.tsx.) A feature (no fail-first).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor, renderHook, act } from "@testing-library/react";
import { readDevicePref, writeDevicePref, clearDevicePrefs, useDevicePref, oneOf } from "./devicePrefs";
import ClassesPane, { type ClassesPaneProps } from "../students/ClassesPane";
import AssignmentsPanel from "../AssignmentsPanel";
import ExamBankPage from "../bank/ExamBankPage";
import ProjectStudentCards from "../projects/ProjectStudentCards";
import type { Classroom } from "../students/types";
import type { TrackMeta } from "../projects/types";

const stored = (k: string) => localStorage.getItem("examBankViewPref:" + k);
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, headers: new Headers(), json: async () => body } as Response);
let calls: { url: string; body: string }[] = [];
beforeEach(() => { calls = []; (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
/** No request ever carries a remembered preference. */
const noPrefSent = () => expect(calls.map(c => c.url + " " + c.body).join("\n")).not.toMatch(/examBankViewPref|compact|pendingFirst/);

describe("P8-B2b — the device preference rules", () => {
  it("read / write: validated on read; the default is the key's absence; a storage failure is ignored", () => {
    const VIEW = oneOf(["cards", "compact"] as const);
    expect(readDevicePref("x", VIEW)).toBeNull();
    writeDevicePref("x", "compact");
    expect(readDevicePref("x", VIEW)).toBe("compact");
    localStorage.setItem("examBankViewPref:x", JSON.stringify("huge"));
    expect(readDevicePref("x", VIEW)).toBeNull();
    localStorage.setItem("examBankViewPref:x", "{not json");
    expect(readDevicePref("x", VIEW)).toBeNull();
    writeDevicePref("x", null);
    expect(stored("x")).toBeNull();
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(readDevicePref("x", VIEW)).toBeNull();
    expect(() => writeDevicePref("x", "compact")).not.toThrow();
    get.mockRestore(); set.mockRestore();
  });
  it("useDevicePref: starts from the stored value; a change is stored at once; the fallback removes the key; `stored` keeps only its part", () => {
    writeDevicePref("v", "compact");
    const { result } = renderHook(() => useDevicePref<"cards" | "compact">("v", "cards", oneOf(["cards", "compact"] as const)));
    expect(result.current[0]).toBe("compact");
    act(() => result.current[1]("cards"));
    expect(stored("v")).toBeNull();
    const f = renderHook(() => useDevicePref<{ a: string; q: string }>("f", { a: "", q: "" }, v => v as { a: string; q: string }, (x, y) => x.a === y.a, ({ a }) => ({ a })));
    act(() => f.result.current[1]({ a: "1", q: "secret" }));
    expect(JSON.parse(stored("f")!)).toEqual({ a: "1" });
  });
  it("clearDevicePrefs removes this module's keys only", () => {
    writeDevicePref("a", "1"); localStorage.setItem("examBankTheme", "dark");
    clearDevicePrefs();
    expect([stored("a"), localStorage.getItem("examBankTheme")]).toEqual([null, "dark"]);
    localStorage.removeItem("examBankTheme");
  });
});

describe("P8-B2b — the classes: «بطاقات» / «قائمة مضغوطة», remembered", () => {
  const cls = (classId: string, name: string): Classroom => ({ classId, name, grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 3, createdAt: "2026-01-01" } as Classroom);
  const props = (): ClassesPaneProps => ({ classes: [cls("c1", "العاشر"), cls("c2", "الحادي عشر")], view: "active", onViewChange: vi.fn(), activeCount: 2, archivedCount: 0, selectedClassId: "c1", onSelect: vi.fn(), projects: [], projectTitle: c => c, isGraduationEligible: () => false, onToggleProject: vi.fn(), onToggleArchive: vi.fn(), onGraduate: vi.fn(), onCreate: vi.fn(), onRefresh: vi.fn(), loading: false, busy: false, fmtDate: v => v });
  const list = () => document.querySelector(".eb-class-list") as HTMLElement;
  it("cards by default (the look before); compact on choice, and still compact when the page opens again", () => {
    render(<ClassesPane {...props()} />);
    const sw = screen.getByRole("group", { name: "طريقة عرض الصفوف" });
    expect(within(sw).getByRole("button", { name: "بطاقات" }).getAttribute("aria-pressed")).toBe("true");
    expect(list().classList.contains("is-compact")).toBe(false);
    fireEvent.click(within(sw).getByRole("button", { name: "قائمة مضغوطة" }));
    expect(list().classList.contains("is-compact")).toBe(true);
    expect(JSON.parse(stored("view.classes")!)).toBe("compact");
    cleanup();
    render(<ClassesPane {...props()} />);
    expect(list().classList.contains("is-compact")).toBe(true);
    fireEvent.click(within(screen.getByRole("group", { name: "طريقة عرض الصفوف" })).getByRole("button", { name: "بطاقات" }));
    expect(stored("view.classes")).toBeNull();
  });
});

describe("P8-B2b — the assignments: the list's view and the gradebook's order", () => {
  const A = (id: string, title: string) => ({ assignmentId: id, classId: "c1", className: "الحادي عشر", title, instructions: "x", status: "published", openAt: "", dueAt: "2030-01-01T13:00:00.000Z", questionCount: 1, totalMarks: 10, maxAttempts: 1, durationMinutes: 0, attemptPolicy: "continuous" });
  const DONE = { studentId: "s2", studentName: "طالب مسلّم", studentCode: "S2", attemptsUsed: 1, allowedAttempts: 1, dueAtOverride: null, attemptStatus: "submitted", timed: false, activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, canWrite: false, attempts: [], latestResult: { attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, submittedAt: "2026-01-01T10:20:00.000Z", finalized: true, manualReviewMarks: 0, teacherFeedback: "", endReason: "submitted" } };
  beforeEach(() => {
    (globalThis as { fetch?: unknown }).fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input), method = (init && init.method) || "GET";
      calls.push({ url, body: String(init?.body || "") });
      if (url.startsWith("/api/saved-exams")) return json({ ok: true, exams: [] });
      if (url.startsWith("/api/assignment-progress")) return json({ ok: true, progress: [] });
      if (url.startsWith("/api/assignment-results") && method !== "POST") { const id = new URL(url, "https://x").searchParams.get("assignmentId") || "a1"; return json({ ok: true, assignment: A(id, id), stats: { students: 1, submitted: 1, pendingReview: 0, average: 80, highest: 80, lowest: 80 }, students: [DONE] }); }
      if (url.startsWith("/api/assignments")) return json({ ok: true, assignments: [A("a1", "واجب الكسور"), A("a2", "واجب الجبر")] });
      return json({ ok: true });
    }) as unknown as typeof fetch;
  });
  const mount = async () => { const r = render(<AssignmentsPanel token="t" classes={[{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" }] as never} currentExam={null} />); await r.findByText("واجب الكسور"); return r; };
  const rows = () => document.querySelector(".eb-assign-rows") as HTMLElement;
  it("the list: compact on choice, remembered", async () => {
    await mount();
    expect(rows().classList.contains("is-compact")).toBe(false);
    fireEvent.click(within(screen.getByRole("group", { name: "طريقة عرض الواجبات" })).getByRole("button", { name: "قائمة مضغوطة" }));
    expect(rows().classList.contains("is-compact")).toBe(true);
    cleanup();
    await mount();
    expect(rows().classList.contains("is-compact")).toBe(true);
    noPrefSent();
  });
  it("the gradebook's order is kept from one assignment to the next and after the page opens again; the filter still starts at «الكل»", async () => {
    const r = await mount();
    const open = async (title: string) => { fireEvent.click(within(r.getByText(title).closest("li") as HTMLElement).getByRole("button", { name: "فتح" })); await r.findByText("طالب مسلّم"); };
    const pressed = (name: string) => r.getByRole("button", { name }).getAttribute("aria-pressed");
    await open("واجب الكسور");
    fireEvent.click(r.getByRole("button", { name: "بانتظار التصحيح أولًا" }));
    fireEvent.click(r.getByRole("button", { name: "بانتظار التصحيح" }));
    expect([pressed("بانتظار التصحيح أولًا"), pressed("بانتظار التصحيح")]).toEqual(["true", "true"]);
    fireEvent.click(r.getByRole("button", { name: /العودة إلى الواجبات/ }));
    await open("واجب الجبر");
    expect([pressed("بانتظار التصحيح أولًا"), pressed("الكل")]).toEqual(["true", "true"]);
    expect(JSON.parse(stored("gradebook.sort")!)).toBe("pendingFirst");
    cleanup();
    const again = await mount();
    fireEvent.click(within(again.getByText("واجب الكسور").closest("li") as HTMLElement).getByRole("button", { name: "فتح" }));
    await again.findByText("طالب مسلّم");
    expect(again.getByRole("button", { name: "بانتظار التصحيح أولًا" }).getAttribute("aria-pressed")).toBe("true");
    noPrefSent();
  });
});

describe("P8-B2b — the bank's question filters (never the search text)", () => {
  const Q = { id: "manual-x1", sourceId: "manual", sourceKind: "manual", official: false, questionNumber: "1", section: "BASIC", topic: "NETWORK_BASICS", difficulty: 2, difficultyLabel: "", type: "multipleChoice", presentationType: "multipleChoice", text: "ما هو الراوتر؟", options: [{ value: "a", text: "أ" }, { value: "b", text: "ب" }], fields: [], wordBank: [], answer: { mode: "singleChoice", correctOptionValue: "a", values: ["a"] }, hasImage: false, reviewStatus: "classified", createdAt: "", updatedAt: "" };
  beforeEach(() => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(input), body: String(init?.body || "") }); return String(input) === "/api/bank-questions" ? json({ ok: true, questions: [Q] }) : json({ ok: true, exams: [], catalog: [] }); }) as unknown as typeof fetch;
  });
  const noop = () => {};
  const mountBank = async () => {
    render(<ExamBankPage token="t" onOpenBuilder={noop} onOpenImport={noop} onOpenSavedExam={noop} onCopyLibraryExamToBuilder={noop} />);
    await screen.findByText("عدد الأسئلة");
    fireEvent.click(within(screen.getByRole("group", { name: "أقسام بنك الامتحانات" })).getByRole("button", { name: "بنك الأسئلة" }));
    await screen.findByText("ما هو الراوتر؟");
  };
  it("the section and difficulty are remembered; the search text is not stored and starts empty", async () => {
    await mountBank();
    fireEvent.change(screen.getByLabelText("القسم"), { target: { value: "INFRASTRUCTURE" } });
    fireEvent.change(screen.getByLabelText("الصعوبة"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("ابحث في نص السؤال أو الموضوع أو المعرّف"), { target: { value: "راوتر سري" } });
    expect(JSON.parse(stored("bank.filters")!)).toEqual({ section: "INFRASTRUCTURE", type: "", difficulty: "3", source: "" });
    expect(stored("bank.filters")).not.toMatch(/راوتر/);
    cleanup();
    await waitFor(() => expect(document.body.textContent).toBe(""));
    render(<ExamBankPage token="t" onOpenBuilder={noop} onOpenImport={noop} onOpenSavedExam={noop} onCopyLibraryExamToBuilder={noop} />);
    await screen.findByText("عدد الأسئلة");
    fireEvent.click(within(screen.getByRole("group", { name: "أقسام بنك الامتحانات" })).getByRole("button", { name: "بنك الأسئلة" }));
    expect((await screen.findByLabelText("القسم") as HTMLSelectElement).value).toBe("INFRASTRUCTURE");
    expect((screen.getByLabelText("الصعوبة") as HTMLSelectElement).value).toBe("3");
    expect((screen.getByLabelText("ابحث في نص السؤال أو الموضوع أو المعرّف") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "مسح التصفية" }));
    expect(stored("bank.filters")).toBeNull();
    noPrefSent();
  });
  it("an unknown remembered value is ignored («الكل»)", async () => {
    localStorage.setItem("examBankViewPref:bank.filters", JSON.stringify({ section: "SECRET", type: "<script>", difficulty: "9", source: "manual", q: "x" }));
    await mountBank();
    expect([(screen.getByLabelText("القسم") as HTMLSelectElement).value, (screen.getByLabelText("الصعوبة") as HTMLSelectElement).value, (screen.getByLabelText("المصدر") as HTMLSelectElement).value]).toEqual(["", "", "manual"]);
    expect((screen.getByLabelText("ابحث في نص السؤال أو الموضوع أو المعرّف") as HTMLInputElement).value).toBe("");
  });
});

describe("P8-B2b — the project students: «بطاقات» / «جدول», remembered", () => {
  const TRACKS: TrackMeta[] = [{ trackId: "book", title: "الكتاب" }] as TrackMeta[];
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => { calls.push({ url: String(input), body: "" }); return { ok: true, status: 200, json: async () => ({ students: [{ studentId: "s1", displayName: "أمل", code: "C1", overallProgress: 10, trackProgress: { book: 10 }, counts: { not_started: 9, in_progress: 1, ready_for_review: 0, approved: 0 }, readyForReviewCount: 0, complete: false, updatedAt: "2026-10-18T10:00:00.000Z", stale: false }], config: { lateThreshold: 40 } }) } as Response; }) as unknown as typeof fetch;
  });
  const mount = () => render(<ProjectStudentCards token="t" projectCode="899373" classId="c1" tracks={TRACKS} onOpenStudent={vi.fn()} onVisibleChange={vi.fn()} />);
  it("the table on choice, and still the table when the page opens again", async () => {
    mount();
    await screen.findByText("أمل");
    fireEvent.click(within(screen.getByRole("group", { name: "طريقة العرض" })).getByRole("button", { name: "جدول" }));
    expect(screen.getByRole("region", { name: "جدول تقدّم الطلاب" })).toBeTruthy();
    cleanup();
    mount();
    expect(await screen.findByRole("region", { name: "جدول تقدّم الطلاب" })).toBeTruthy();
    noPrefSent();
  });
});
