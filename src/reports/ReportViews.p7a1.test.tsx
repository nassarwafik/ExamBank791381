// @vitest-environment happy-dom
// Tadris+ P7-A1 — a class / student report whose ACADEMIC part the teacher's access does not include (`kpis: null` / `academic: null`,
// named in `withheld`; the server did not compute it) renders the rest of the report, never a crash and never a fake zero. TEST data.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Bar: () => <canvas />, Line: () => <canvas />, Doughnut: () => <canvas /> }));
import ReportsCenter from "./ReportsCenter";

const FILTERS = { ok: true, schoolYears: ["2025-2026"], classes: [{ classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: [] }], projects: [] };
const CLASS = { ok: true, type: "class", class: { classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", studentCount: 3 }, kpis: null, projects: [], withheld: ["academic", "projects"] };
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response);
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const type = new URL(String(input), "http://x").searchParams.get("type");
    return Promise.resolve(json(type === "filters" ? FILTERS : type === "class" ? CLASS : type === "classStudents" ? { ok: true, students: [] } : { ok: false }));
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P7-A1 — class report without its academic part", () => {
  it("shows the class and its students; no assessment, average or submission figure", async () => {
    render(<ReportsCenter token="t" />);
    fireEvent.click(await screen.findByRole("button", { name: "فتح التقرير تقرير الصف" }));
    await screen.findByRole("heading", { level: 2, name: "تقرير الصف" });
    fireEvent.change(within(screen.getByRole("region", { name: "مرشحات التقرير" })).getByLabelText("الصف"), { target: { value: "c1" } });
    const stats = await screen.findByText("الطلاب");
    const grid = stats.closest(".eb-stat-grid") as HTMLElement;
    expect(grid.textContent).toContain("3");
    expect(grid.textContent).not.toMatch(/التقييمات|متوسط النتائج|نسبة التسليم/);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
