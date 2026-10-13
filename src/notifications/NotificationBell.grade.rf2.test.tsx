// @vitest-environment happy-dom
// Phase 21E.3 review fix 2 (re-review RR-2) — only a grade the app composed is an LTR island. A reviewed-assignment notice without a
// composed grade (percentage only, feedback only, an older event) shows the teacher's title as written: "اختبار Unit 1/2" must never
// be drawn as "1/2 Unit". Fail-first on eb174d1: every assignment_reviewed preview went through the grade isolation.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import NotificationBell from "./NotificationBell";
import type { NotificationItem } from "./notificationsClient";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const T0 = "2026-10-01T08:00:00.000Z";
const review = (id: string, extra: Record<string, unknown>) => ({ id, type: "assignment_reviewed", createdAt: T0, unread: true, assignmentId: "a-" + id, becameFinal: true, scoreChanged: true, feedbackChanged: false, finalized: true, ...extra }) as unknown as NotificationItem;
const counts = { messages: { directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false }, events: { total: 3, capped: false }, bell: { total: 3, capped: false } };

describe("RF2 — grade islands only around a composed grade", () => {
  it("titles with fractions stay as written; only the composed grade (the last x/y) is a <bdi dir=ltr>", () => {
    const items = [
      review("1", { assignmentTitle: "اختبار Unit 1/2", percentage: 80 }),                    // no composed grade
      review("2", { assignmentTitle: "الإصدار v1.2/3", becameFinal: false, scoreChanged: false, feedbackChanged: true }),
      review("3", { assignmentTitle: "Quiz 3/4", score: 8.5, totalMarks: 10 }),                // composed grade «8.5/10»
    ];
    render(<NotificationBell items={items} counts={counts as never} loading={false} error="" onSelect={() => {}} onOpenMessages={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^الإشعارات/ }));
    const previews = [...document.querySelectorAll(".eb-notif-preview")];
    expect(previews).toHaveLength(3);
    expect(previews[0].querySelectorAll("bdi")).toHaveLength(0);
    expect(previews[0].textContent).toContain("«اختبار Unit 1/2»");
    expect(previews[1].querySelectorAll("bdi")).toHaveLength(0);
    const islands = [...previews[2].querySelectorAll("bdi")];
    expect(islands.map(b => [b.textContent, b.getAttribute("dir")])).toEqual([["8.5/10", "ltr"]]);
    expect(previews[2].textContent).toContain("«Quiz 3/4»");                               // the title itself is not split
    for (const p of previews) expect(p.textContent).not.toMatch(/[‎‏‪-‮⁦-⁩]/);
  });
});
