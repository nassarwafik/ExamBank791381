// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";
import { groupTasks, dueText } from "./portalPresentation";
import { openStudentView } from "./portalViews.testkit";
import StudentPortal from "../StudentPortal";
import StudentExamPage from "../StudentExamPage";
import type { Summary } from "./types";

// UX-S3 (approved design docs/enterprise-ux-student-s3.md) — «الواجبات» under «الكل» in groups with headings, a deadline read at a
// glance, and a result page that names its assignment, class and attempt. Presentation only. TEST data only.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const at = (d: number, h: number, m = 0) => new Date(2026, 10, 7 + d, h, m).getTime();     // local time, 7 Nov 2026 + d days
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = at(0, 10);
const asg = (id: string, over: Partial<Summary> = {}): Summary => ({
  assignmentId: id, title: id, instructions: "", openAt: "", dueAt: iso(at(10, 12)), effectiveDueAt: "", questionCount: 1, totalMarks: 10,
  availability: "open", dashboardState: "available", gradingStatus: "notSubmitted", attemptsUsed: 0, allowedAttempts: 1, canAttempt: true,
  attemptStatus: "notStarted", hasActiveAttempt: false, latestScore: null, latestPercentage: null, latestResult: null, createdAt: "", ...over
} as Summary);

describe("UX-S3 — groupTasks", () => {
  it("five groups in a fixed order (action · awaiting review · upcoming · completed · closed); empty ones are left out", () => {
    const items = [
      asg("CO", { dashboardState: "completed" }), asg("CL", { dashboardState: "closedUnsubmitted" }), asg("AR", { dashboardState: "awaitingReview" }),
      asg("SC", { dashboardState: "scheduled" }), asg("AV", { dashboardState: "available" })
    ];
    expect(groupTasks(items).map(g => [g.key, g.label, g.items.map(i => i.assignmentId)])).toEqual([
      ["action", "تحتاج إجراء", ["AV"]], ["awaitingReview", "بانتظار التصحيح", ["AR"]], ["scheduled", "قريبًا", ["SC"]],
      ["completed", "مكتملة", ["CO"]], ["closed", "انتهت دون تسليم", ["CL"]]
    ]);
    expect(groupTasks([asg("A")]).map(g => g.key)).toEqual(["action"]);
    expect(groupTasks([])).toEqual([]);
  });

  it("«تحتاج إجراء»: a live attempt first, then the nearest deadline; «قريبًا»: the nearest opening; ties keep the server order", () => {
    const items = [
      asg("FAR", { dueAt: iso(at(9, 9)) }), asg("NEAR", { dueAt: iso(at(1, 9)) }), asg("LIVE", { dashboardState: "inProgress", dueAt: iso(at(20, 9)) }),
      asg("TIE1", { dueAt: iso(at(5, 9)) }), asg("TIE2", { dueAt: iso(at(5, 9)) }), asg("EXT", { dueAt: iso(at(-1, 9)), effectiveDueAt: iso(at(2, 9)) }),
      asg("S2", { dashboardState: "scheduled", openAt: iso(at(4, 8)) }), asg("S1", { dashboardState: "scheduled", openAt: iso(at(2, 8)) })
    ];
    const g = groupTasks(items);
    expect(g[0].items.map(i => i.assignmentId)).toEqual(["LIVE", "NEAR", "EXT", "TIE1", "TIE2", "FAR"]);   // effectiveDueAt counts
    expect(g[1].items.map(i => i.assignmentId)).toEqual(["S1", "S2"]);
  });
});

describe("UX-S3 — dueText", () => {
  const d = (over: Partial<Summary>, now = NOW) => dueText(asg("X", over), now);
  it("today / tomorrow / in N days / later / past / none — and the ISO date stays where it is not obvious", () => {
    expect(d({ dueAt: iso(at(0, 17, 28)) })).toEqual({ text: "التسليم اليوم 17:28", soon: true, past: false });
    expect(d({ dueAt: iso(at(1, 9, 5)) })).toEqual({ text: "التسليم غدًا 09:05", soon: true, past: false });
    expect(d({ dueAt: iso(at(2, 9)) }).text).toBe("التسليم بعد يومين · 2026-11-09 09:00");
    expect(d({ dueAt: iso(at(3, 9)) })).toEqual({ text: "التسليم بعد 3 أيام · 2026-11-10 09:00", soon: false, past: false });
    expect(d({ dueAt: iso(at(6, 9)) }).text).toBe("التسليم بعد 6 أيام · 2026-11-13 09:00");
    expect(d({ dueAt: iso(at(7, 9)) }).text).toBe("التسليم: 2026-11-14 09:00");
    expect(d({ dueAt: iso(at(-1, 9)) })).toEqual({ text: "انتهى التسليم 2026-11-06 09:00", soon: false, past: true });
    expect(d({ dueAt: iso(at(0, 9)) }).past).toBe(true);                                                    // earlier today = already past
    expect(d({ dueAt: "" })).toEqual({ text: "التسليم: بدون موعد", soon: false, past: false });
    expect(d({ dueAt: iso(at(-2, 9)), effectiveDueAt: iso(at(1, 9)) }).text).toBe("التسليم غدًا 09:00");     // an extension wins
  });
  it("calendar days, not 24-hour blocks: 23:59 → 00:01 is «غدًا»; «soon» is actionable AND within 48 h", () => {
    expect(dueText(asg("X", { dueAt: iso(at(1, 0, 1)) }), at(0, 23, 59)).text).toBe("التسليم غدًا 00:01");
    expect(d({ dueAt: iso(at(2, 9)) }).soon).toBe(true);                                                    // 47 h ahead
    expect(d({ dueAt: iso(at(2, 11)) }).soon).toBe(false);                                                  // 49 h ahead
    expect(d({ dashboardState: "completed", dueAt: iso(at(0, 17)) }).soon).toBe(false);                     // not actionable
    expect(d({ dashboardState: "inProgress", dueAt: iso(at(0, 17)) }).soon).toBe(true);
  });
  it("a scheduled task says when it OPENS", () => {
    expect(d({ dashboardState: "scheduled", openAt: iso(at(1, 8)) }).text).toBe("يفتح غدًا 08:00");
    expect(d({ dashboardState: "scheduled", openAt: iso(at(0, 13)) }).text).toBe("يفتح اليوم 13:00");
    expect(d({ dashboardState: "scheduled", openAt: iso(at(4, 8)) }).text).toBe("يفتح بعد 4 أيام · 2026-11-11 08:00");
    expect(d({ dashboardState: "scheduled", openAt: iso(at(12, 8)) }).text).toBe("يفتح في 2026-11-19 08:00");
    expect(d({ dashboardState: "scheduled", openAt: "" })).toEqual({ text: "موعد الفتح غير محدد بعد", soon: false, past: false });
    expect(d({ dashboardState: "scheduled", openAt: iso(at(0, 13)) }).soon).toBe(false);
  });
});

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
function mountPortal(assignments: Summary[]) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-dashboard")) return res(200, { student: { userId: "u1", code: "C-1", displayName: "أحمد", classId: "c1" }, classroom: { classId: "c1", name: "الحادي عشر" }, assignments, stats: { assigned: assignments.length, completed: 0, average: null } });
    return res(200, { ok: true, posts: [], enrolled: false, materials: [] });
  }) as unknown as typeof fetch;
  return render(<StudentPortal token="t" displayName="أحمد" onLogout={vi.fn()} />);
}

describe("UX-S3 — the «الواجبات» view", () => {
  it("«الكل»: one labelled group per non-empty state, a heading with its count, the cards under it; other filters: one plain list", async () => {
    const soon = new Date(Date.now() + 3 * 3600e3).toISOString();
    mountPortal([asg("AV", { dueAt: soon }), asg("CO", { dashboardState: "completed" }), asg("AV2")]);
    await openStudentView("الواجبات");
    const region = within(await screen.findByRole("region", { name: /المهام والواجبات/ }));
    const groups = region.getAllByRole("group").filter(g => g.classList.contains("eb-sp-task-group"));
    expect(groups.map(g => g.getAttribute("aria-labelledby"))).toEqual(["eb-sp-task-group-action", "eb-sp-task-group-completed"]);
    expect(region.getByRole("heading", { level: 3, name: /^تحتاج إجراء/ }).textContent).toBe("تحتاج إجراء2");
    expect(within(groups[0]).getAllByRole("heading", { level: 3 }).map(h => h.textContent)).toEqual(["تحتاج إجراء2", "AV", "AV2"]);
    const due = within(groups[0]).getAllByTestId("card-due")[0];
    expect(due.className).toContain("is-soon");
    expect(due.textContent).toMatch(/^التسليم (اليوم|غدًا) \d\d:\d\d$/);
    expect(due.getAttribute("title")).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    fireEvent.click(region.getByRole("button", { name: "تحتاج إجراء" }));
    expect(region.queryAllByRole("group").filter(g => g.classList.contains("eb-sp-task-group"))).toHaveLength(0);
    expect(region.getAllByRole("article").map(a => a.querySelector("h3")!.textContent)).toEqual(["AV", "AV2"]);
  });
});

describe("UX-S3 — the result page names its assignment", () => {
  const latest = { attemptNumber: 1, submittedAt: "2026-10-01T10:00:00.000Z", score: 8, totalMarks: 10, percentage: 80, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "", resultsVisible: true,
    questionBreakdown: { sections: [{ id: "s1", title: "القسم", capped: false }], questions: [{ number: 1, sectionId: "s1", status: "full", maxMarks: 10, score: 8 }] } };
  const state = (over: Record<string, unknown> = {}) => ({ attemptsUsed: 1, allowedAttempts: 3, canAttempt: true, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "", durationMinutes: 0, timed: false,
    attemptModelVersion: 0, requiresStart: false, serverNow: "2026-10-02T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false,
    canStartAttempt: true, canWrite: false, draftAnswers: {}, draftSavedAt: "", latestResult: latest, attempts: [latest], ...over });
  const assignment = { assignmentId: "asg1", title: "واجب أساسيات الشبكات", instructions: "", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 3, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 1, totalMarks: 10, exam: { title: "امتحان", metadata: {}, questions: [] } };
  function mountResult(st = state(), onBack = vi.fn()) {
    (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
    globalThis.fetch = vi.fn(() => res(200, { ok: true, state: st })) as unknown as typeof fetch;
    render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر أ" onBack={onBack} onLogout={() => {}} />);
    return onBack;
  }
  it("the top bar: the assignment's title (not a second h1), «الصف · المحاولة n من m», and «رجوع» = the page's own back", async () => {
    const onBack = mountResult();
    await screen.findByRole("heading", { level: 1, name: /تم تسليم المحاولة 1/ });
    const bar = document.querySelector(".iex-topbar") as HTMLElement;
    expect(within(bar).getByText("واجب أساسيات الشبكات").tagName).toBe("P");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(bar.querySelector(".iex-topbar-context")!.textContent).toBe("الحادي عشر أ · المحاولة 1 من 3");
    fireEvent.click(within(bar).getByRole("button", { name: "رجوع" }));
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى المهام" }));
    expect(onBack).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /بدء محاولة جديدة \(2 من 3\)/ })).toBeTruthy();
  });
  it("the breakdown stays closed by default and says that it opens; the hint follows the state", async () => {
    mountResult();
    const details = await screen.findByTestId("result-breakdown");
    expect(details.hasAttribute("open")).toBe(false);
    expect(screen.getByTestId("breakdown-hint").textContent).toBe("اضغط لعرض علامة كل سؤال");
    (details as HTMLDetailsElement).open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.getByTestId("breakdown-hint").textContent).toBe("اضغط للإخفاء");
  });
  it("an unreleased result stays withheld under the new bar (no mark, no breakdown)", async () => {
    mountResult(state({ latestResult: { ...latest, resultsVisible: false, resultsVisibility: "manual" }, attempts: [{ ...latest, resultsVisible: false, resultsVisibility: "manual" }] }));
    await screen.findByTestId("result-not-released");
    expect(document.querySelector(".iex-topbar-context")!.textContent).toContain("المحاولة 1 من 3");
    expect(screen.queryByTestId("result-breakdown")).toBeNull();
  });
});
