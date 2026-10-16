// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import TeacherTodayHub, { type TeacherToday } from "./TeacherTodayHub";

// Phase 21H.0 — the hub's figures are true and name their unit: «نشطة الآن» lists only students working now, open attempts
// left idle (or paused) get their own card with their age, every count says what it counts («9 تسليمات في واجبين»), a
// zero never wears an alarm colour, and times read relative to the summary's own clock with the exact time kept.
const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data } as Response);
const NOW = "2026-10-16T22:00:00.000Z", ago = (ms: number) => new Date(Date.parse(NOW) - ms).toISOString(), M = 60e3, D = 864e5;
const att = (sid: string, name: string, extra: Record<string, string>) => ({ assignmentId: "A1", title: "امتحان تجريبي", className: "الثاني عشر", studentId: sid, studentName: name, startedAt: ago(30 * M), status: "draft", ...extra });
const SUMMARY: TeacherToday = {
  generatedAt: NOW, scope: { activeClasses: 1, students: 20, publishedAssignments: 3 },
  attention: {
    activeAttempts: { count: 1, items: [att("s1", "حلا نصار", { lastActivityAt: ago(3 * M) })] },
    staleAttempts: { count: 2, items: [att("s2", "يوسف نصار", { lastActivityAt: ago(6 * D) }), att("s3", "عمر نصار", { status: "paused", lastActivityAt: ago(2 * D) })] },
    notStarted: { count: 0, assignments: 0, items: [] },
    pendingReview: { count: 9, assignments: 2, items: [{ assignmentId: "A2", title: "امتحان قواعد البيانات", className: "الثاني عشر", pendingReview: 8 }, { assignmentId: "A3", title: "امتحان الشبكات", className: "الثاني عشر", pendingReview: 1 }] },
    unreadMessages: { total: 0, capped: false }
  },
  recent: [{ kind: "submitted", at: ago(2 * 3600e3), assignmentId: "A2", title: "امتحان قواعد البيانات", className: "الثاني عشر", studentId: "s4", studentName: "خالد", percentage: 80 }],
  partial: []
};
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const card = (name: RegExp) => screen.getByRole("article", { name });
const mount = async (s: TeacherToday) => {
  globalThis.fetch = vi.fn(async () => json({ ok: true, ...s })) as unknown as typeof fetch;
  render(<TeacherTodayHub token="t" />);
  await screen.findByRole("heading", { level: 3, name: /محاولات نشطة الآن/ });
};

describe("21H.0 TeacherTodayHub — true figures with units", () => {
  it("«نشطة الآن» shows only the student working now; idle and paused attempts get their own card with their age", async () => {
    await mount(SUMMARY);
    const active = within(card(/محاولات نشطة الآن/));
    expect(active.getByText("حلا نصار")).toBeTruthy();
    expect(active.queryByText("يوسف نصار")).toBeNull();
    expect(active.getByText(/آخر نشاط منذ 3 دقائق/)).toBeTruthy();
    expect(active.getByText("طالب واحد يعمل الآن")).toBeTruthy();
    const stale = within(card(/محاولات مفتوحة بلا نشاط/));
    expect(stale.getByText("2")).toBeTruthy();
    expect(stale.getByText(/امتحان تجريبي · الثاني عشر · آخر نشاط منذ 6 أيام/)).toBeTruthy();
    expect(stale.getByText(/متوقفة مؤقتًا/)).toBeTruthy();
  });

  it("counts name their unit with Arabic agreement: «9 تسليمات في واجبين», «8 تسليمات», «تسليم واحد»", async () => {
    await mount(SUMMARY);
    const pending = within(card(/بانتظار التصحيح/));
    expect(pending.getByText("9 تسليمات في واجبين")).toBeTruthy();
    expect(pending.getByText("8 تسليمات · الثاني عشر")).toBeTruthy();
    expect(pending.getByText("تسليم واحد · الثاني عشر")).toBeTruthy();
    expect(pending.queryByText(/8 تسليم ·/)).toBeNull();
  });

  it("a zero is neutral (no red or blue accent), a non-zero keeps its tone", async () => {
    await mount(SUMMARY);
    expect(card(/لم يبدؤوا بعد/).className).toContain("tone-neutral");
    expect(card(/لم يبدؤوا بعد/).className).not.toContain("tone-danger");
    expect(card(/رسائل غير مقروءة/).className).toContain("tone-neutral");
    expect(card(/بانتظار التصحيح/).className).toContain("tone-info");
    expect(card(/محاولات مفتوحة بلا نشاط/).className).toContain("tone-attention");
  });

  it("recent activity reads relative to the summary's clock and keeps the exact time", async () => {
    await mount(SUMMARY);
    const t = screen.getByText("منذ ساعتين");
    expect(t.tagName).toBe("TIME");
    expect(t.getAttribute("dateTime")).toBe(ago(2 * 3600e3));
    expect(t.getAttribute("title")).toMatch(/^2026-10-16 \d\d:00$/);
  });

  it("an older payload without staleAttempts renders no stale card (and a malformed one is ignored)", async () => {
    const { staleAttempts: _s, ...rest } = SUMMARY.attention; void _s;
    await mount({ ...SUMMARY, attention: rest });
    expect(screen.queryByRole("article", { name: /محاولات مفتوحة بلا نشاط/ })).toBeNull();
    cleanup();
    await mount({ ...SUMMARY, attention: { ...rest, staleAttempts: { count: 3 } as unknown as TeacherToday["attention"]["activeAttempts"] } });
    expect(screen.queryByRole("article", { name: /محاولات مفتوحة بلا نشاط/ })).toBeNull();
  });
});
