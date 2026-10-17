// @vitest-environment happy-dom
// Phase L.3 — reading progress follows the student across devices, through StudentReader over the REAL restricted content:
//   • opening the book with no chosen page or unit resumes at the server's last page; a chosen page / unit still wins;
//   • a slow or failing progress read never blocks the book: after RESUME_WAIT_MS it opens at the beginning;
//   • the server's read pages join this device's index marks (union, one write);
//   • a page the student stays on for READ_DWELL_MS is reported once; pages skipped through faster are not.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, act, waitFor } from "@testing-library/react";
import StudentReader, { READ_DWELL_MS, RESUME_WAIT_MS } from "./StudentReader";
import type { ProgressClient, ReadingProgress } from "../learning/progress/progressClient";
import { visitedSnapshot } from "../learning/reader/visitedPages";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* ignore */ } });
const SLOW = { timeout: 8000 }, T = 25000;
const M01 = "791381-m01", M02 = "791381-m02";
const P_M01_L01_P02 = "791381-m01-l01-p02";
const progress = (p: Partial<ReadingProgress>): ReadingProgress => ({ lastPageId: null, lastReadAt: null, visited: [], modules: {}, ...p });
function client(answer: () => Promise<ReadingProgress | null>) {
  const visits: string[] = [];
  const c: ProgressClient = { get: vi.fn(answer), visit: vi.fn(async (_c: string, pageId: string) => { visits.push(pageId); return true; }) };
  return { c, visits };
}
function mount(c: ProgressClient, extra: { initialPageId?: string; initialModuleId?: string } = {}) {
  globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ ok: false }) } as Response)) as unknown as typeof fetch;
  return render(<StudentReader courseId="791381" allowedModuleIds={[M01, M02]} token="tok" onExit={vi.fn()} studentId="u1" progressClient={c} {...extra} />);
}
const crumb = () => document.querySelector(".learning-reader-crumb")?.textContent ?? "";

describe("L.3 — resume where the student left off (any device)", () => {
  it("no chosen page → the server's last page; the server's read pages join this device's marks", async () => {
    const { c } = client(async () => progress({ lastPageId: P_M01_L01_P02, visited: ["791381-m01-l00-p01", "791381-m01-l01-p01"] }));
    mount(c);
    await screen.findByRole("heading", { level: 2, name: "استخدامات الشبكة" }, SLOW);          // m01-l01-p02
    expect(c.get).toHaveBeenCalledWith("791381");
    expect([...visitedSnapshot("student:u1", "791381")]).toEqual(expect.arrayContaining(["791381-m01-l00-p01", "791381-m01-l01-p01"]));
  }, T);

  it("a chosen page or unit wins over the server (the marks are still merged)", async () => {
    const { c } = client(async () => progress({ lastPageId: P_M01_L01_P02, visited: ["791381-m01-l01-p01"] }));
    mount(c, { initialModuleId: M02 });
    await waitFor(() => expect(crumb().startsWith("الأعداد والموازين ›")).toBe(true), SLOW);
    await waitFor(() => expect(visitedSnapshot("student:u1", "791381").has("791381-m01-l01-p01")).toBe(true));
  }, T);

  it("a progress read that never answers opens the book at its beginning after RESUME_WAIT_MS; a failed one at once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { c } = client(() => new Promise(() => {}));
    mount(c);
    expect(screen.getByRole("status").textContent).toContain("جارٍ فتح المادة التعليمية");
    await act(async () => { vi.advanceTimersByTime(RESUME_WAIT_MS + 10); });
    vi.useRealTimers();
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    cleanup();
    const failed = client(async () => null);
    mount(failed.c);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
  }, T);
});

describe("L.3 — reporting what was read", () => {
  it("the page the student stays on is reported once after READ_DWELL_MS; a page skipped through faster is not", async () => {
    const { c, visits } = client(async () => progress({}));
    mount(c);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await waitFor(() => expect(visits).toEqual(["791381-m01-l00-p01"]), { timeout: READ_DWELL_MS + 3000 });
    // Time is frozen across the two page turns, so "skipped through" never depends on how fast the machine renders: the
    // module is already loaded, so each page renders synchronously inside act().
    vi.useFakeTimers();
    act(() => { screen.getByRole("button", { name: "التالي" }).click(); });
    expect(screen.getByRole("heading", { level: 2, name: "ما هي الشبكة؟" })).toBeTruthy();       // m01-l01-p01 — skipped through
    act(() => { screen.getByRole("button", { name: "التالي" }).click(); });
    expect(screen.getByRole("heading", { level: 2, name: "استخدامات الشبكة" })).toBeTruthy();    // m01-l01-p02 — stayed on
    await act(async () => { vi.advanceTimersByTime(READ_DWELL_MS - 1); });
    expect(visits).toEqual(["791381-m01-l00-p01"]);                                             // not yet: the dwell is not over
    await act(async () => { vi.advanceTimersByTime(2); });
    vi.useRealTimers();
    await waitFor(() => expect(visits).toEqual(["791381-m01-l00-p01", P_M01_L01_P02]));
    expect(visits).not.toContain("791381-m01-l01-p01");
  }, T);
});
