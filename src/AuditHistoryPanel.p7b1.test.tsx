// @vitest-environment happy-dom
// Tadris+ P7-B1 — D14: the teacher's own activity log shows that the platform's administration read one of their students'
// conversations, with the reason the owner wrote. TEST data only.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import AuditHistoryPanel from "./AuditHistoryPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P7-B1 — «سجل نشاطي» lists the owner's reading of a conversation", () => {
  it("the action in Arabic, the student, and the reason", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, events: [{ eventId: "e1", timestamp: "2026-11-04T09:00:00.000Z", actor: "owner", action: "owner.conversation.opened", targetType: "student", targetId: "s1", targetLabel: "ليان", details: { reason: "شكوى ولي أمر بتاريخ اليوم" } }], count: 1, limit: 50, hardMax: 100 }) }) as Response) as unknown as typeof fetch;
    render(<AuditHistoryPanel token="t" />);
    const row = (await screen.findAllByText("اطّلعت إدارة المنصة على محادثة طالب")).map(e => e.closest("tr")).find(Boolean) as HTMLElement;   // (the action filter lists it too)
    expect(row.textContent).toContain("ليان");
    expect(row.textContent).toContain("السبب: شكوى ولي أمر بتاريخ اليوم");
  });
});
