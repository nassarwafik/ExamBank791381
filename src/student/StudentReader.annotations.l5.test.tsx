// @vitest-environment happy-dom
// Phase L.5 — the student's Reader carries the student's own annotations client by default (student headers, the student's
// course), over the REAL restricted content.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import StudentReader from "./StudentReader";
import type { ProgressClient } from "../learning/progress/progressClient";

afterEach(() => { cleanup(); vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* ignore */ } });

describe("L.5 — StudentReader annotations", () => {
  it("reads the student's annotations for the book with the student's headers and offers «ملاحظاتي»", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url) === "/api/learning-annotations/791381") return { ok: true, status: 200, json: async () => ({ ok: true, bookmarks: [], notes: [], highlights: [] }) } as Response;
      return { ok: false, status: 404, json: async () => ({ ok: false }) } as Response;
    });
    const progress: ProgressClient = { get: vi.fn(async () => null), visit: vi.fn(async () => true) };
    render(<StudentReader courseId="791381" allowedModuleIds={["791381-m01"]} token="stu-tok" onExit={vi.fn()} studentId="u1" progressClient={progress} />);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, { timeout: 8000 });
    expect(screen.getByRole("button", { name: "ملاحظاتي" })).toBeTruthy();
    await waitFor(() => expect(fetchSpy.mock.calls.some(([u]) => String(u) === "/api/learning-annotations/791381")).toBe(true));
    const [, init] = fetchSpy.mock.calls.find(([u]) => String(u) === "/api/learning-annotations/791381")!;
    expect((init as RequestInit).headers).toMatchObject({ "x-student-token": "stu-tok", Authorization: "Bearer stu-tok" });
  }, 25000);
});
