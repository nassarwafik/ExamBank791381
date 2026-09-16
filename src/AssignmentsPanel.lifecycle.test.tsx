// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, within, fireEvent } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";

// Roadmap #34 — Analytics Lifecycle Authority (frontend). The assignment creation form offers a class as a target ONLY
// through the canonical normalizeClassStatus helper: an inconsistent document { active:true, status:"archived" } is
// archived and must never be offered for creating/publishing a new assignment (the server would reject it anyway —
// R22 — but the UI must agree with the same authority).

const GOOD = { classId: "good", name: "صف جيد", grade: "11", active: true, status: "active" };
const INCONSISTENT = { classId: "inc", name: "صف متناقض", grade: "12", active: true, status: "archived" };
const LEGACY_ACTIVE = { classId: "leg", name: "صف قديم", grade: "10", active: true };            // no status → active (legacy doc)
const CANONICAL_ARCHIVED = { classId: "arc", name: "صف مؤرشف", grade: "12", active: false, status: "archived" };

const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  (globalThis as { fetch?: unknown }).fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/assignments")) return json({ ok: true, assignments: [] });
    if (url.includes("/api/saved-exams")) return json({ ok: true, exams: [] });
    return json({ ok: true });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("R34 — AssignmentsPanel offers only canonical-active classes as assignment targets", () => {
  it("the class select lists good + legacy-active only; the inconsistent and the canonical archived classes are absent", async () => {
    const r = render(<AssignmentsPanel token="t" classes={[INCONSISTENT, GOOD, LEGACY_ACTIVE, CANONICAL_ARCHIVED] as never} currentExam={null} />);
    fireEvent.click(await r.findByRole("button", { name: "إنشاء واجب" }));   // UX-5: the composer opens on demand
    const select = (await r.findByText("اختر الصف")).closest("select") as HTMLSelectElement;
    const values = Array.from(select.options).map(o => o.value).filter(Boolean);
    expect(values).toEqual(["good", "leg"]);
    expect(within(select).queryByText(/صف متناقض/)).toBeNull();
    expect(within(select).queryByText(/صف مؤرشف/)).toBeNull();
    // the default target is the first canonical-active class, not the inconsistent one listed first
    expect(select.value).toBe("good");
  });
});
