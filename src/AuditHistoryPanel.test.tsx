// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AuditHistoryPanel from "./AuditHistoryPanel";

// Roadmap #19 — AJ: the audit UI renders the loaded event list with Arabic labels; AK: filtering/search is
// client-side over the already-loaded bounded history (no refetch). Assertions are scoped to the table body
// so a matching label in the filter dropdown never satisfies a row assertion.

const EVENTS = [
  { eventId: "a", timestamp: "2026-02-01T09:00:00.000Z", actor: "t", action: "class.create", targetType: "class", targetId: "c1", targetLabel: "الحادي عشر", details: { grade: "11" } },
  { eventId: "b", timestamp: "2026-02-02T09:00:00.000Z", actor: "t", action: "student.bulkImport", targetType: "class", targetId: "c1", targetLabel: "الثاني عشر", details: { createdCount: 5, duplicateCount: 1, failedCount: 0 } },
  { eventId: "c", timestamp: "2026-02-03T09:00:00.000Z", actor: "t", action: "student.archive", targetType: "student", targetId: "s1", targetLabel: "علي حسن", details: {} }
];

let fetchCalls = 0;
function tbody(container: HTMLElement) { return container.querySelector(".audit-history-table tbody") as HTMLElement; }

beforeEach(() => {
  fetchCalls = 0;
  globalThis.fetch = vi.fn(async () => { fetchCalls++; return { ok: true, status: 200, json: async () => ({ ok: true, events: EVENTS, count: EVENTS.length, limit: 100 }) } as Response; }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("AuditHistoryPanel", () => {
  it("AJ: renders the loaded events with Arabic action labels + safe aggregate details", async () => {
    const { container } = render(<AuditHistoryPanel token="t" />);
    await screen.findByText("علي حسن");
    const body = within(tbody(container));
    expect(body.getByText("إنشاء صف")).toBeTruthy();
    expect(body.getByText("استيراد طلاب")).toBeTruthy();
    expect(body.getByText("أرشفة طالب")).toBeTruthy();
    expect(body.getByText(/أُنشئ: 5/)).toBeTruthy();
  });

  it("AK: search filters CLIENT-SIDE over loaded data (no refetch)", async () => {
    const { container } = render(<AuditHistoryPanel token="t" />);
    await screen.findByText("علي حسن");
    expect(fetchCalls).toBe(1);
    fireEvent.change(screen.getByLabelText("ابحث في سجل النشاط"), { target: { value: "علي" } });
    await waitFor(() => expect(within(tbody(container)).queryByText("إنشاء صف")).toBeNull());
    expect(within(tbody(container)).getByText("علي حسن")).toBeTruthy();
    expect(fetchCalls).toBe(1);                       // filtering did NOT trigger another request
  });

  it("filters by action dropdown client-side", async () => {
    const { container } = render(<AuditHistoryPanel token="t" />);
    await screen.findByText("علي حسن");
    fireEvent.change(screen.getByLabelText("تصفية حسب العملية"), { target: { value: "student.bulkImport" } });
    await waitFor(() => expect(within(tbody(container)).queryByText("أرشفة طالب")).toBeNull());
    expect(within(tbody(container)).getByText("استيراد طلاب")).toBeTruthy();
  });
});
