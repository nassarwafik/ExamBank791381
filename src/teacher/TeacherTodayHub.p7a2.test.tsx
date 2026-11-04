// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import TeacherTodayHub, { type TeacherToday } from "./TeacherTodayHub";
import { arrangeSlots } from "./todayLayout";

// Tadris+ P7-A2 — the teacher's arrangement of the «اليوم» cards (teacher-profile `dashboardLayout`): their order, the hidden ones,
// «ترتيب البطاقات» only when the server says it can be changed. Without an arrangement the default order is exactly as before.
// TEST data only.
const json = (data: unknown, status = 200) => ({ ok: status < 300, status, json: async () => data } as Response);
const SUMMARY: TeacherToday = {
  generatedAt: "2026-03-10T10:00:00.000Z", scope: { activeClasses: 1, students: 3, publishedAssignments: 1 },
  attention: {
    activeAttempts: { count: 1, items: [{ assignmentId: "P1", title: "واجب P1", className: "صف 1", studentId: "s1", studentName: "طالب", startedAt: "2026-03-10T09:58:00.000Z", status: "started" }] },
    notStarted: { count: 1, assignments: 1, items: [{ assignmentId: "P1", title: "واجب P1", className: "صف 1", dueAt: "", notStarted: 1, expected: 3 }] },
    pendingReview: { count: 1, assignments: 1, items: [{ assignmentId: "P1", title: "واجب P1", className: "صف 1", pendingReview: 1 }] },
    unreadMessages: { total: 2, capped: false }
  },
  recent: [{ kind: "submitted", at: "2026-03-10T09:59:00.000Z", assignmentId: "P1", title: "واجب P1", className: "صف 1", studentId: "s1", studentName: "طالب", percentage: 90 }],
  partial: []
};
let profile: Record<string, unknown>;
let posts: unknown[];
beforeEach(() => {
  posts = [];
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/teacher-today")) return json({ ok: true, ...SUMMARY });
    if (url.includes("/api/teacher-profile")) {
      if (init?.method === "POST") { const b = JSON.parse(String(init.body)); posts.push(b); profile = { ...profile, dashboardLayout: b.layout }; return json({ ok: true, dashboardLayout: b.layout }); }
      return json({ ok: true, profile: {}, ...profile });
    }
    return json({ ok: true });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const cards = () => Array.from(document.querySelectorAll(".eb-today-grid > article h3 > span:first-child")).map(e => e.textContent);
const mount = async () => { render(<TeacherTodayHub token="tok" />); await screen.findByRole("heading", { level: 3, name: /محاولات نشطة الآن/ }); };

describe("P7-A2 — arrangeSlots", () => {
  const S: [string, string][] = [["a", "a1"], ["b", "b1"], ["c", "c1"], ["a", "a2"]];
  it("null → unchanged; ordered ids first (a widget's cards stay together, in their default order); unnamed ones after; hidden removed", () => {
    expect(arrangeSlots(S, null)).toEqual(S);
    expect(arrangeSlots(S, { order: ["c", "a"], hidden: [] }).map(x => x[1])).toEqual(["c1", "a1", "a2", "b1"]);
    expect(arrangeSlots(S, { order: [], hidden: ["a"] }).map(x => x[1])).toEqual(["b1", "c1"]);
  });
});

describe("P7-A2 — the hub follows the teacher's arrangement", () => {
  it("no arrangement: the default order, exactly as before; no «ترتيب البطاقات» unless the server allows it", async () => {
    profile = { dashboardLayout: null, layoutChoosable: false };
    await mount();
    expect(cards()).toEqual(["بانتظار التصحيح", "لم يبدؤوا بعد", "رسائل غير مقروءة", "محاولات نشطة الآن"]);
    expect(screen.queryByRole("button", { name: "ترتيب البطاقات" })).toBeNull();
  });

  it("a saved arrangement: its order, without the hidden cards and the hidden recent activity", async () => {
    profile = { dashboardLayout: { order: ["messages.unread", "attempts.live"], hidden: ["assignments.notStarted", "activity.recent"] }, layoutChoosable: true };
    await mount();
    await waitFor(() => expect(cards()).toEqual(["رسائل غير مقروءة", "محاولات نشطة الآن", "بانتظار التصحيح"]));
    expect(screen.queryByRole("region", { name: "آخر نشاط في صفوفك" })).toBeNull();
  });

  it("«ترتيب البطاقات»: move a card, hide one, save → the order the server stored; «الترتيب الافتراضي» clears it", async () => {
    profile = { dashboardLayout: null, layoutChoosable: true };
    await mount();
    fireEvent.click(await screen.findByRole("button", { name: "ترتيب البطاقات" }));
    const panel = within(screen.getByRole("region", { name: "ترتيب البطاقات" }));
    fireEvent.click(panel.getByRole("button", { name: "تقديم رسائل غير مقروءة" }));
    fireEvent.click(panel.getByRole("checkbox", { name: "لم يبدؤوا بعد" }));
    fireEvent.click(panel.getByRole("button", { name: "حفظ الترتيب" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    const sent = (posts[0] as { action: string; layout: { order: string[]; hidden: string[] } });
    expect(sent.action).toBe("setDashboardLayout");
    expect(sent.layout.order.indexOf("messages.unread")).toBeLessThan(sent.layout.order.indexOf("results.unreleased"));
    expect(sent.layout.hidden).toEqual(["assignments.notStarted"]);
    await waitFor(() => expect(cards()).toEqual(["بانتظار التصحيح", "رسائل غير مقروءة", "محاولات نشطة الآن"]));
    fireEvent.click(screen.getByRole("button", { name: "ترتيب البطاقات" }));
    fireEvent.click(within(screen.getByRole("region", { name: "ترتيب البطاقات" })).getByRole("button", { name: "الترتيب الافتراضي" }));
    await waitFor(() => expect(posts[1]).toEqual({ action: "setDashboardLayout", layout: { order: [], hidden: [] } }));
    await waitFor(() => expect(cards()).toEqual(["بانتظار التصحيح", "لم يبدؤوا بعد", "رسائل غير مقروءة", "محاولات نشطة الآن"]));
  });

  it("the panel offers only the cards the server serves (a withheld widget is not offered)", async () => {
    profile = { dashboardLayout: null, layoutChoosable: true };
    const orig = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => (String(input).includes("/api/teacher-today") ? json({ ok: true, ...SUMMARY, widgets: ["messages.unread", "students.count"] }) : (orig as typeof fetch)(input, init))) as unknown as typeof fetch;
    render(<TeacherTodayHub token="tok" />);
    fireEvent.click(await screen.findByRole("button", { name: "ترتيب البطاقات" }));
    const panel = within(screen.getByRole("region", { name: "ترتيب البطاقات" }));
    expect(panel.getAllByRole("checkbox").map(c => c.parentElement!.textContent)).toEqual(["رسائل غير مقروءة"]);
  });
});
