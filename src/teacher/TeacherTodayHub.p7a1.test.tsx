// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import TeacherTodayHub, { type TeacherToday } from "./TeacherTodayHub";

// Tadris+ P7-A1 — the hub shows a card only when the server served its widget (`widgets`); the server computes nothing else. An
// older payload without `widgets` keeps every card exactly as before. TEST data only.
const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
const EMPTY = { count: 0, items: [] };
const LEARNING_ONLY: TeacherToday = {
  generatedAt: "2026-03-10T10:00:00.000Z", scope: { activeClasses: 2, students: 6, publishedAssignments: 0 },
  attention: { activeAttempts: EMPTY, staleAttempts: EMPTY, notStarted: { count: 0, assignments: 0, items: [] }, pendingReview: { count: 0, assignments: 0, items: [] }, dueSoon: EMPTY, resultsUnreleased: EMPTY, openingSoon: EMPTY, unreadMessages: null },
  recent: [], partial: [], widgets: ["students.count"]
};
let payload: unknown;
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => (String(input).includes("/api/teacher-today") ? json({ ok: true, ...(payload as object) }) : json({ ok: true }))) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const titles = () => screen.queryAllByRole("heading", { level: 3 }).map(h => h.textContent || "");

describe("P7-A1 Today hub — only the served widgets", () => {
  it("learning-only: no assignment, message or project card, no assignment / message / project quick action; the hub still loads", async () => {
    payload = LEARNING_ONLY;
    render(<TeacherTodayHub token="tok" />);
    await screen.findByText("لا توجد عناصر تحتاج تدخلك الآن.");
    expect(titles().join("|")).not.toMatch(/بانتظار التصحيح|لم يبدؤوا|محاولات|رسائل|تقييم المشاريع|يُغلق|نتائج بانتظار/);
    expect(screen.queryByRole("alert")).toBeNull();
    const actions = screen.getByRole("group", { name: "إجراءات سريعة" });
    expect(actions.textContent).not.toMatch(/فتح الرسائل|الواجبات|المشاريع/);
    expect(actions.textContent).toMatch(/الصفوف والطلاب/);
  });

  it("messages granted: the unread card shows, the assignment cards stay hidden", async () => {
    payload = { ...LEARNING_ONLY, attention: { ...LEARNING_ONLY.attention, unreadMessages: { total: 2, capped: false } }, widgets: ["students.count", "messages.unread"] };
    render(<TeacherTodayHub token="tok" />);
    await screen.findByRole("heading", { level: 3, name: /رسائل غير مقروءة/ });
    expect(titles().join("|")).not.toMatch(/بانتظار التصحيح|محاولات نشطة/);
  });

  it("an older payload without `widgets`: every card, as before", async () => {
    const { widgets: _omit, ...older } = LEARNING_ONLY;
    void _omit;
    payload = { ...older, attention: { ...older.attention, unreadMessages: { total: 0, capped: false } } };
    render(<TeacherTodayHub token="tok" />);
    await screen.findByRole("heading", { level: 3, name: /محاولات نشطة الآن/ });
    expect(titles().join("|")).toMatch(/بانتظار التصحيح/);
    expect(titles().join("|")).toMatch(/رسائل غير مقروءة/);
  });
});
