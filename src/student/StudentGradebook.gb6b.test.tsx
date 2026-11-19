// @vitest-environment happy-dom
//
// Class gradebook GB6b — «علاماتي» in the student's «التقدم» view: the approved parts the server returns, in words (a number, «0» for the
// teacher's zero, «معفى»), each part's total and the final once approved. Nothing when nothing is approved or the read fails (never an
// empty card, never a zero for a missing mark); one read per session. TEST data only.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, waitFor } from "@testing-library/react";
import StudentGradebook from "./StudentGradebook";
import { itemText, partText, type StudentGbClass } from "./studentGradebookView";

const CLASS = (over: Partial<StudentGbClass> = {}): StudentGbClass => ({
  classId: "c1", className: "العاشر أ", final: null,
  parts: [{ categoryId: "m", title: "الشهري", weight: 30, approvedAt: "2026-11-18T10:00:00.000Z", value: 72.5, display: 72.5, items: [
    { itemId: "hw", title: "الوظيفة 1", weight: 50, kind: "assignment", state: "graded", display: 85 },
    { itemId: "q", title: "اختبار قصير", weight: 25, kind: "manual", state: "zero", display: 0 },
    { itemId: "p", title: "مشروع", weight: 25, kind: "project", state: "excused", display: null }
  ] }],
  ...over
});
let urls: string[] = [];
const serve = (status: number, body: unknown) => {
  urls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => { urls.push(String(input)); return { ok: status < 400, status, json: async () => body } as unknown as Response; }) as unknown as typeof fetch;
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("GB6b — «علاماتي»", () => {
  it("shows each approved part with its items in words and its total; the final says it is not approved yet", async () => {
    serve(200, { ok: true, classes: [CLASS()] });
    render(<StudentGradebook token="tok" />);
    const region = await screen.findByRole("region", { name: "علاماتي" });
    expect(within(region).getByText("الشهري")).toBeTruthy();
    expect(within(region).getByText("30% من العلامة النهائية")).toBeTruthy();
    expect(within(region).getByLabelText("مجموع الشهري: 72.5")).toBeTruthy();
    const marks = Array.from(region.querySelectorAll(".eb-sp-grades-items li")).map(li => li.textContent);
    expect(marks).toEqual(["الوظيفة 185", "اختبار قصير0", "مشروعمعفى"]);
    expect(within(region).getByText("العلامة النهائية لم تُعتمد بعد.")).toBeTruthy();
    expect(urls).toEqual(["/api/student-gradebook"]);
  });
  it("the final once approved; several classes are named", async () => {
    serve(200, { ok: true, classes: [CLASS({ final: { value: 81.25, display: 81.3, approvedAt: "x" } }), CLASS({ classId: "c2", className: "نادي العلوم" })] });
    render(<StudentGradebook token="tok" />);
    const region = await screen.findByRole("region", { name: "علاماتي" });
    expect(within(region).getByRole("heading", { level: 3, name: "العاشر أ" })).toBeTruthy();
    expect(within(region).getByRole("heading", { level: 3, name: "نادي العلوم" })).toBeTruthy();
    expect(within(region).getByText("81.3")).toBeTruthy();
  });
  it("nothing approved, a failed read or an expired session: no section at all", async () => {
    for (const [status, body] of [[200, { ok: true, classes: [] }], [503, { ok: false }], [401, { ok: false }]] as const) {
      serve(status, body);
      render(<StudentGradebook token="tok" />);
      await waitFor(() => expect(urls).toHaveLength(1));
      await new Promise(r => setTimeout(r, 0));
      expect(screen.queryByRole("region", { name: "علاماتي" })).toBeNull();
      cleanup();
    }
  });
  it("a missing mark is never a zero; an all-excused part says «معفى»", () => {
    expect(itemText({ itemId: "x", title: "", weight: 1, kind: "assignment", state: "pending", display: null })).toBe("—");
    expect(itemText({ itemId: "x", title: "", weight: 1, kind: "assignment", state: "graded", display: null })).toBe("—");
    expect(partText({ ...CLASS().parts[0], value: null, display: null, allExcused: true })).toBe("معفى");
    expect(partText({ ...CLASS().parts[0], value: null, display: null })).toBe("—");
  });
});
