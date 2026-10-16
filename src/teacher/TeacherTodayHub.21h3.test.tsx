// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import TeacherTodayHub, { type TeacherToday } from "./TeacherTodayHub";

// Phase 21H.3 — what the teacher acts on next, straight from the hub: deadlines within 48 h, «manual» results waiting to be
// published, assignments opening within 24 h; «تذكير» on a row (the confirmed 21G.7 remindStudents — nothing is sent without
// confirmation); cards in priority order; «عرض الكل في الواجبات» when a card has more than it shows.
const NOW = "2026-10-16T22:00:00.000Z", inH = (h: number) => new Date(Date.parse(NOW) + h * 3600e3).toISOString();
const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data } as Response);
const ns = (i: number) => ({ assignmentId: "N" + i, title: "واجب " + i, className: "العاشر", dueAt: "", notStarted: 2, expected: 5 });
const SUMMARY: TeacherToday = {
  generatedAt: NOW, scope: { activeClasses: 1, students: 5, publishedAssignments: 4 },
  attention: {
    activeAttempts: { count: 0, items: [] },
    notStarted: { count: 10, assignments: 5, items: [ns(1), ns(2), ns(3), ns(4), ns(5)] },
    pendingReview: { count: 0, assignments: 0, items: [] },
    unreadMessages: { total: 0, capped: false },
    dueSoon: { count: 1, items: [{ assignmentId: "D1", title: "واجب الكسور", className: "العاشر", dueAt: inH(5), notSubmitted: 3, expected: 5 }] },
    resultsUnreleased: { count: 1, items: [{ assignmentId: "R1", title: "اختبار الوحدة", className: "العاشر", submitted: 4, dueAt: inH(-24) }] },
    openingSoon: { count: 1, items: [{ assignmentId: "O1", title: "واجب الغد", className: "العاشر", openAt: inH(3), expected: 5 }] }
  },
  recent: [], partial: []
};
let posts: { url: string; body: Record<string, unknown> }[] = [];
beforeEach(() => {
  posts = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") { posts.push({ url, body: JSON.parse(String(init.body)) }); return json({ ok: true, reminded: 3, alreadyToday: 1, notNeeded: 1, failed: 0 }); }
    return json({ ok: true, ...SUMMARY });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const card = (name: RegExp) => screen.getByRole("article", { name });
const mount = async (props: Partial<Parameters<typeof TeacherTodayHub>[0]> = {}) => { render(<TeacherTodayHub token="t" onOpenAssignmentTarget={vi.fn()} onNavigate={vi.fn()} {...props} />); await screen.findByRole("heading", { level: 3, name: /يُغلق خلال 48 ساعة/ }); };

describe("21H.3 TeacherTodayHub — next actions", () => {
  it("shows closing-soon, results-to-publish and opening-soon with relative times and units", async () => {
    await mount();
    expect(within(card(/يُغلق خلال 48 ساعة/)).getByText("يُغلق خلال 5 ساعات · لم يسلّم 3 من 5 · العاشر")).toBeTruthy();
    expect(within(card(/نتائج بانتظار النشر/)).getByText("4 تسليمات · العاشر")).toBeTruthy();
    expect(within(card(/نتائج بانتظار النشر/)).getByText(/لا يرى الطلاب علاماتهم قبل أن تنشرها/)).toBeTruthy();
    expect(within(card(/تفتح خلال 24 ساعة/)).getByText("تفتح خلال 3 ساعات · 5 طلاب · العاشر")).toBeTruthy();
  });

  it("cards follow the priority order: grading, deadlines, not started, results, messages … opening soon last", async () => {
    await mount();
    const titles = [...document.querySelectorAll(".eb-attention-card h3 > span:first-child")].map(e => e.textContent);
    expect(titles).toEqual(["بانتظار التصحيح", "يُغلق خلال 48 ساعة", "لم يبدؤوا بعد", "نتائج بانتظار النشر", "رسائل غير مقروءة", "محاولات نشطة الآن", "تفتح خلال 24 ساعة"]);
  });

  it("«تذكير» asks first; cancel sends nothing; confirm sends remindStudents for that assignment and reports the result", async () => {
    await mount();
    fireEvent.click(within(card(/يُغلق خلال 48 ساعة/)).getByRole("button", { name: "تذكير من لم يسلّم «واجب الكسور»" }));
    fireEvent.click(await screen.findByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toEqual([]);
    fireEvent.click(within(card(/يُغلق خلال 48 ساعة/)).getByRole("button", { name: "تذكير من لم يسلّم «واجب الكسور»" }));
    fireEvent.click(await screen.findByRole("button", { name: "إرسال التذكير" }));
    expect(await screen.findByText("✓ أُرسل التذكير إلى 3 طلاب في «واجب الكسور». طالب واحد ذُكّر اليوم مسبقًا.")).toBeTruthy();
    expect(posts).toEqual([{ url: "/api/assignment-results", body: { action: "remindStudents", assignmentId: "D1" } }]);
  });

  it("a card with more rows than it shows offers «عرض الكل في الواجبات»", async () => {
    const onNavigate = vi.fn();
    await mount({ onNavigate });
    const c = within(card(/لم يبدؤوا بعد/));
    expect(c.getByText("و1 أخرى")).toBeTruthy();
    fireEvent.click(c.getByRole("button", { name: "عرض الكل في الواجبات" }));
    expect(onNavigate).toHaveBeenCalledWith("assignments");
    expect(within(card(/يُغلق خلال 48 ساعة/)).getByRole("button", { name: "الواجبات" })).toBeTruthy();
  });

  it("an older payload has none of the new cards; malformed blocks are ignored", async () => {
    const { dueSoon: _d, resultsUnreleased: _r, openingSoon: _o, ...rest } = SUMMARY.attention; void _d; void _r; void _o;
    globalThis.fetch = vi.fn(async () => json({ ok: true, ...SUMMARY, attention: { ...rest, dueSoon: { count: 2 }, openingSoon: "x" } })) as unknown as typeof fetch;
    render(<TeacherTodayHub token="t" />);
    await screen.findByRole("heading", { level: 3, name: /لم يبدؤوا بعد/ });
    expect(screen.queryByRole("article", { name: /يُغلق خلال|نتائج بانتظار النشر|تفتح خلال/ })).toBeNull();
  });
});
