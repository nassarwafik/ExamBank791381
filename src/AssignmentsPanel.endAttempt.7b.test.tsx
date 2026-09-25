// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";
import Gradebook from "./assignments/Gradebook";
import AssignmentReview from "./AssignmentReview";
import { endReasonLabel } from "./assignments/attemptPolicy";
import { LIFECYCLE_LABEL, type Item, type StudentResult } from "./assignments/types";

// Phase 7B — «إنهاء المحاولة الحالية»: the teacher ends one student's CURRENT attempt from the gradebook row menu. The
// request carries only the attempt identity (never answers); the authoritative row returned by the server is merged in
// place; a 409 only shows the error and never wipes the (possibly newer) local attempt.

const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true }];
const ASSIGNMENT = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "واجب مؤقت", instructions: "x", status: "published", openAt: "", dueAt: "2026-01-01T13:00:00.000Z", questionCount: 1, totalMarks: 10, maxAttempts: 1, durationMinutes: 60, attemptPolicy: "pausable" };

// Running model-3 attempt (epoch 1), a PAUSED model-3 attempt (epoch 2, paused twice), a model-2 attempt (no epoch), a done student.
const RUNNING = { studentId: "s1", studentName: "طالب نشط", studentCode: "S1", attemptsUsed: 0, allowedAttempts: 1, dueAtOverride: null, attemptStatus: "draft", timed: true, activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-01T11:00:00.000Z", extendedEndsAt: "", status: "draft", attemptEpoch: 1, pauseCount: 0, pausedAt: "", pausedRemainingMs: null, runEndsAt: "" }, effectiveAttemptEndsAt: "2026-01-01T11:00:00.000Z", attemptDurationEndsAt: "2026-01-01T11:00:00.000Z", attemptExpired: false, canStartAttempt: false, canWrite: true, attempts: [], latestResult: null };
const PAUSED = { ...RUNNING, studentId: "s4", studentName: "طالب متوقف", studentCode: "S4", attemptStatus: "paused", effectiveAttemptEndsAt: "", attemptDurationEndsAt: "", canWrite: false, activeAttempt: { attemptNumber: 2, startedAt: "2026-01-01T09:00:00.000Z", endsAt: "2026-01-01T10:00:00.000Z", extendedEndsAt: "", status: "paused", attemptEpoch: 4, pauseCount: 2, pausedAt: "2026-01-01T09:40:00.000Z", pausedRemainingMs: 17 * 60000, runEndsAt: "" } };
const MODEL2 = { ...RUNNING, studentId: "s5", studentName: "طالب عادي", studentCode: "S5", attemptStatus: "started", activeAttempt: { attemptNumber: 1, startedAt: "2026-01-01T10:05:00.000Z", endsAt: "2026-01-01T11:05:00.000Z", extendedEndsAt: "", status: "started" } };
const DONE = { studentId: "s2", studentName: "طالب مسلّم", studentCode: "S2", attemptsUsed: 1, allowedAttempts: 1, dueAtOverride: null, attemptStatus: "submitted", timed: true, activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, canWrite: false, attempts: [{ attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, submittedAt: "2026-01-01T10:20:00.000Z", finalized: true, manualReviewMarks: 0, endReason: "submitted" }], latestResult: { attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, submittedAt: "2026-01-01T10:20:00.000Z", finalized: true, manualReviewMarks: 0, teacherFeedback: "", endReason: "submitted" } };

const ENDED_ROW = { attemptStatus: "teacherEnded", activeAttempt: null, effectiveAttemptEndsAt: "", attemptDurationEndsAt: "", attemptExpired: false, canStartAttempt: false, canWrite: false, timed: true, durationMinutes: 60, attemptsUsed: 1, allowedAttempts: 1, dueAtOverride: null, gradingStatus: "final", attempts: [{ attemptNumber: 1, score: 6, totalMarks: 10, percentage: 60, submittedAt: "2026-01-01T10:30:00.000Z", finalized: true, manualReviewMarks: 0, gradingStatus: "final", endReason: "teacherEnded", startedAt: RUNNING.activeAttempt.startedAt, endedAt: "2026-01-01T10:30:00.000Z", timedOut: false }], latestResult: { attemptNumber: 1, score: 6, totalMarks: 10, percentage: 60, submittedAt: "2026-01-01T10:30:00.000Z", finalized: true, manualReviewMarks: 0, gradingStatus: "final", teacherFeedback: "", endReason: "teacherEnded" } };

const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, headers: new Headers(), json: async () => body } as Response);
let posts: Array<Record<string, unknown>>;
let endReply: () => Promise<Response>;
let assignment: Record<string, unknown>;
let getCount: number;
function installFetch() {
  posts = []; getCount = 0;
  endReply = () => json({ ok: true, alreadyEnded: false, ...ENDED_ROW });
  (globalThis as { fetch?: unknown }).fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = (init && init.method) || "GET";
    if (url.includes("/api/assignments") && method !== "POST") return json({ ok: true, assignments: [assignment] });
    if (url.includes("/api/saved-exams") && method !== "POST") return json({ ok: true, exams: [] });
    if (url.includes("/api/saved-exams")) return json({ ok: true, exam: null });
    if (url.includes("/api/assignment-results") && method !== "POST") { getCount++; return json({ ok: true, assignment: { assignmentId: "a1", title: "واجب مؤقت", dueAt: ASSIGNMENT.dueAt, durationMinutes: 60, maxAttempts: 1, totalMarks: 10 }, stats: { students: 4, submitted: 1, pendingReview: 0, average: 80, highest: 80, lowest: 80 }, students: [RUNNING, DONE, PAUSED, MODEL2] }); }
    if (url.includes("/api/assignment-results")) {
      const body = JSON.parse(String(init!.body)); posts.push(body);
      if (body.action === "endActiveAttempt") return endReply();
      if (body.action === "setDueAtOverride") return json({ ok: true, dueAtOverride: body.dueAtOverride, activeAttempt: RUNNING.activeAttempt });
      return json({ ok: true, allowedAttempts: 2, attemptsUsed: 0, attemptStatus: "draft", activeAttempt: RUNNING.activeAttempt, effectiveAttemptEndsAt: "2026-01-01T11:30:00.000Z", dueAtOverride: null });
    }
    return json({ ok: true });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  assignment = ASSIGNMENT;
  installFetch();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openGradebook() {
  const r = render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
  fireEvent.click(await r.findByRole("button", { name: "فتح" }));
  await r.findByText("طالب نشط");
  return r;
}
const rowOf = (r: ReturnType<typeof render>, name: string) => (r.getByText(name).closest("tr") as HTMLElement);
async function openRowMenu(r: ReturnType<typeof render>, name: string) { fireEvent.click(within(rowOf(r, name)).getByRole("button", { name: /^إجراءات / })); return await r.findByRole("group", { name: /^إجراءات / }); }
async function rowAction(r: ReturnType<typeof render>, name: string, label: string) { fireEvent.click(within(await openRowMenu(r, name)).getByRole("button", { name: label })); }
const confirmEl = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm yet"); return el; });
const END = "إنهاء المحاولة الحالية";
const endPosts = () => posts.filter(p => p.action === "endActiveAttempt");

describe("«إنهاء المحاولة الحالية» — visibility", () => {
  it("shown (as a danger item) only for a row with an active attempt", async () => {
    const r = await openGradebook();
    const menu = await openRowMenu(r, "طالب نشط");
    const btn = within(menu).getByRole("button", { name: END });
    expect(btn.className).toContain("is-danger");
    fireEvent.keyDown(document, { key: "Escape" });
    const done = await openRowMenu(r, "طالب مسلّم");
    expect(within(done).queryByRole("button", { name: END })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
  });

  it("never shown for an archived assignment", async () => {
    assignment = { ...ASSIGNMENT, status: "archived" };
    const r = render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
    fireEvent.click(await r.findByRole("button", { name: /المؤرشفة/ }));
    fireEvent.click(await r.findByRole("button", { name: "فتح" }));
    await r.findByText("طالب نشط");
    for (const name of ["طالب نشط", "طالب متوقف"]) expect(within(rowOf(r, name)).queryByRole("button", { name: /^إجراءات / })).toBeNull();
    expect(r.queryByText(END)).toBeNull();
  });
});

describe("«إنهاء المحاولة الحالية» — confirm + request", () => {
  it("the confirm dialog has the exact title / message / confirm label; cancel sends nothing", async () => {
    const r = await openGradebook();
    await rowAction(r, "طالب نشط", END);
    const d = await confirmEl();
    expect(within(d).getByText("إنهاء محاولة الطالب")).toBeTruthy();
    expect(d.textContent).toContain("سيتم إنهاء المحاولة الحالية وتصحيح آخر إجابات محفوظة على الخادم. لن يستطيع الطالب متابعة هذه المحاولة بعد ذلك.");
    expect(within(d).getByRole("button", { name: "إنهاء المحاولة" })).toBeTruthy();
    fireEvent.click(within(d).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(document.querySelector('.eb-confirm[role="dialog"]')).toBeNull());
    expect(endPosts()).toHaveLength(0);
    expect(within(rowOf(r, "طالب نشط")).getByText("مسودة")).toBeTruthy();                 // untouched
  });

  it("confirm posts the FULL identity incl. the model-3 epoch and NO answers; the reply clears the row without a reload", async () => {
    const r = await openGradebook();
    const gets = getCount;
    await rowAction(r, "طالب نشط", END);
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "إنهاء المحاولة" }));
    await waitFor(() => expect(endPosts()).toHaveLength(1));
    expect(endPosts()[0]).toEqual({ action: "endActiveAttempt", assignmentId: "a1", studentId: "s1", expectedAttemptNumber: 1, expectedStartedAt: RUNNING.activeAttempt.startedAt, expectedAttemptEpoch: 1 });
    const row = rowOf(r, "طالب نشط");
    await waitFor(() => expect(within(row).getByText("أنهى المعلم المحاولة")).toBeTruthy());
    expect(within(row).queryByText(/المحاولة الحالية:/)).toBeNull();
    expect(within(row).queryByText(/ينتهي فعليًا:/)).toBeNull();
    expect(within(row).getByText("1/1")).toBeTruthy();
    expect(within(row).getByText("6/10 (60%)")).toBeTruthy();
    expect(getCount).toBe(gets);                                                             // no full reload
    const menu = await openRowMenu(r, "طالب نشط");
    expect(within(menu).queryByRole("button", { name: END })).toBeNull();                    // no active attempt any more
    expect(await r.findByText(/تم إنهاء محاولة الطالب طالب نشط/)).toBeTruthy();
  });

  it("a model-2 attempt (no epoch) sends no expectedAttemptEpoch", async () => {
    const r = await openGradebook();
    await rowAction(r, "طالب عادي", END);
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "إنهاء المحاولة" }));
    await waitFor(() => expect(endPosts()).toHaveLength(1));
    expect(endPosts()[0]).toEqual({ action: "endActiveAttempt", assignmentId: "a1", studentId: "s5", expectedAttemptNumber: 1, expectedStartedAt: MODEL2.activeAttempt.startedAt });
  });

  it("a PAUSED attempt can be ended — it sends the paused epoch", async () => {
    const r = await openGradebook();
    await rowAction(r, "طالب متوقف", END);
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "إنهاء المحاولة" }));
    await waitFor(() => expect(endPosts()).toHaveLength(1));
    expect(endPosts()[0]).toMatchObject({ studentId: "s4", expectedAttemptNumber: 2, expectedStartedAt: PAUSED.activeAttempt.startedAt, expectedAttemptEpoch: 4 });
    expect(JSON.stringify(endPosts()[0])).not.toMatch(/answers|draft/);
  });

  it("a 409 shows the server error and does NOT wipe the (possibly newer) local attempt", async () => {
    const r = await openGradebook();
    endReply = () => json({ ok: false, error: "تغيّرت محاولة الطالب. حدّث القائمة ثم حاول مرة أخرى." }, 409);
    await rowAction(r, "طالب نشط", END);
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "إنهاء المحاولة" }));
    expect(await r.findByText(/تغيّرت محاولة الطالب/)).toBeTruthy();
    const row = rowOf(r, "طالب نشط");
    expect(within(row).getByText("مسودة")).toBeTruthy();
    expect(within(row).getByText("المحاولة الحالية: 1")).toBeTruthy();
    const menu = await openRowMenu(r, "طالب نشط");
    expect(within(menu).getByRole("button", { name: END })).toBeTruthy();
  });
});

describe("existing row actions still work", () => {
  it("grant / reopen / extend timer / extend deadline", async () => {
    const r = await openGradebook();
    await rowAction(r, "طالب نشط", "منح محاولة إضافية");
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "منح المحاولة" }));
    await waitFor(() => expect(posts.map(p => p.action)).toContain("allowRetry"));
    await rowAction(r, "طالب مسلّم", "إعادة فتح للطالب");
    expect(await r.findByRole("dialog", { name: "إعادة فتح للطالب" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await rowAction(r, "طالب نشط", "تمديد وقت المحاولة");
    expect(await r.findByRole("dialog", { name: "تمديد وقت المحاولة" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await rowAction(r, "طالب نشط", "تمديد الموعد");
    const dd = await r.findByRole("dialog", { name: "تمديد الموعد" });
    fireEvent.change(within(dd).getByLabelText("الموعد الجديد"), { target: { value: "2026-01-02T11:45" } });
    fireEvent.click(within(dd).getByText("حفظ التمديد"));
    await waitFor(() => expect(posts.map(p => p.action)).toContain("setDueAtOverride"));
    expect(endPosts()).toHaveLength(0);
  });
});

describe("gradebook active-attempt info", () => {
  const item = ASSIGNMENT as unknown as Item;
  const mount = (rows: StudentResult[]) => render(<Gradebook assignment={item} rows={rows} totalRows={rows.length} gradingOf={() => "notSubmitted"} busy={false} search="" onSearch={() => {}} filter="all" onFilter={() => {}} sort="name" onSort={() => {}} onReview={() => {}} onGrant={() => {}} onReopen={() => {}} onExtend={() => {}} onDeadline={() => {}} onEndAttempt={() => {}} fmt={v => "«" + v + "»"} />);

  it("running: attempt number, start, status, effective end; no pause count at 0; never the epoch", () => {
    const r = mount([RUNNING as unknown as StudentResult]);
    expect(r.getByText("المحاولة الحالية: 1")).toBeTruthy();
    expect(r.getByText("بدأ: «" + RUNNING.activeAttempt.startedAt + "»")).toBeTruthy();
    expect(r.getByText("مسودة")).toBeTruthy();
    expect(r.getByText("ينتهي فعليًا: «" + RUNNING.effectiveAttemptEndsAt + "»")).toBeTruthy();
    expect(r.queryByText(/مرات الحفظ المؤقت/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/epoch|Epoch|الحقبة/);
  });

  it("paused: since when, remaining time, pause count; no running end", () => {
    const r = mount([PAUSED as unknown as StudentResult]);
    expect(r.getByText("متوقفة مؤقتًا")).toBeTruthy();
    expect(r.getByText("المحاولة الحالية: 2")).toBeTruthy();
    expect(r.getByText(/منذ «2026-01-01T09:40:00.000Z»/)).toBeTruthy();
    expect(r.getByText(/المتبقي 17 دقيقة/)).toBeTruthy();
    expect(r.getByText("مرات الحفظ المؤقت: 2")).toBeTruthy();
    expect(r.queryByText(/ينتهي فعليًا/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/epoch|Epoch|الحقبة|: 4\b/);               // epoch 4 is never rendered
  });

  it("the end button calls onEndAttempt with the row; the paused row offers it too", () => {
    const onEnd = vi.fn();
    const r = render(<Gradebook assignment={item} rows={[PAUSED as unknown as StudentResult]} totalRows={1} gradingOf={() => "notSubmitted"} busy={false} search="" onSearch={() => {}} filter="all" onFilter={() => {}} sort="name" onSort={() => {}} onReview={() => {}} onGrant={() => {}} onReopen={() => {}} onExtend={() => {}} onDeadline={() => {}} onEndAttempt={onEnd} fmt={v => v} />);
    fireEvent.click(r.getByRole("button", { name: "إجراءات طالب متوقف" }));
    const menu = r.getByRole("group", { name: "إجراءات طالب متوقف" });
    expect(within(menu).queryAllByRole("button").map(x => x.textContent).filter(t => /استئناف|متابعة|استكمال/.test(t || ""))).toEqual([]);   // no teacher resume
    fireEvent.click(within(menu).getByRole("button", { name: END }));
    expect(onEnd).toHaveBeenCalledWith(expect.objectContaining({ studentId: "s4" }));
  });

  it("a teacherEnded row shows «أنهى المعلم المحاولة», never «انتهى الوقت»", () => {
    const r = mount([{ ...DONE, ...ENDED_ROW, studentName: "طالب منتهٍ" } as unknown as StudentResult]);
    expect(r.getByText("أنهى المعلم المحاولة")).toBeTruthy();
    expect(r.queryByText("انتهى الوقت")).toBeNull();
    expect(document.body.textContent).not.toContain("teacherEnded");
  });
});

describe("labels", () => {
  it("teacherEnded has its Arabic label everywhere; historical labels unchanged", () => {
    expect(endReasonLabel("teacherEnded")).toBe("أنهى المعلم المحاولة");
    expect(LIFECYCLE_LABEL.teacherEnded).toBe("أنهى المعلم المحاولة");
    expect(endReasonLabel("submitted")).toBe("تسليم");
    expect(endReasonLabel("timedOut")).toBe("انتهى الوقت");
    expect(endReasonLabel("integrityExit")).toBe("غادر صفحة الامتحان");
    expect(LIFECYCLE_LABEL.submitted).toBe("تم التسليم");
    expect(LIFECYCLE_LABEL.timedOut).toBe("انتهى الوقت");
  });

  it("the review sheet shows «أنهى المعلم المحاولة» as the end reason", async () => {
    const attempt = { attemptNumber: 1, submittedAt: "2026-01-01T10:30:00.000Z", score: 6, totalMarks: 10, percentage: 60, manualReviewMarks: 0, finalized: true, gradingStatus: "final", startedAt: "2026-01-01T10:00:00.000Z", endedAt: "2026-01-01T10:30:00.000Z", endReason: "teacherEnded", timedOut: false, manualOverrides: {}, teacherFeedback: "" };
    (globalThis as { fetch?: unknown }).fetch = vi.fn(() => json({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 10 }, student: { studentId: "s1", studentName: "طالب", studentCode: "S1" }, attempt, attempts: [attempt], questions: [] })) as unknown as typeof fetch;
    const r = render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const reason = await r.findByText("سبب الانتهاء");
    expect(reason.parentElement?.textContent).toContain("أنهى المعلم المحاولة");
  });
});
