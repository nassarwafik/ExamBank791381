// @vitest-environment happy-dom
// Phase L.4 — the book page hosts «قراءة صفوفي» only inside a teacher session, and the book page stays request-free until the
// teacher opens it; then the class-scoped teacher endpoints are called with the teacher headers.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningMaterialsPage from "./LearningMaterialsPage";
import { createClassReadingClient } from "./classReading/classReadingClient";

afterEach(() => { cleanup(); vi.restoreAllMocks(); history.replaceState(null, "", location.pathname); });
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body } as Response);
const openCourse = (token?: string) => {
  render(<LearningMaterialsPage token={token} />);
  fireEvent.click(screen.getByRole("button", { name: "فتح الكتاب" }));
};

describe("L.4 — «قراءة صفوفي» on the book page", () => {
  it("without a teacher session there is no class panel", () => {
    openCourse();
    expect(screen.queryByRole("heading", { name: "قراءة صفوفي" })).toBeNull();
  });

  it("with a session: no request until opened; then classes + catalog + the class report, all with the teacher headers", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u === "/api/classrooms") return ok({ ok: true, classes: [{ classId: "cA", name: "العاشر أ", grade: "10", schoolYear: "2026", active: true, status: "active", studentCount: 0, createdAt: "", learningMaterials: [{ courseId: "791381", visibleModuleIds: [] }] }] });
      if (u === "/api/learning-materials-catalog") return ok({ ok: true, courses: [] });
      if (u === "/api/learning-class-progress/cA/791381") return ok({ ok: true, classId: "cA", courseId: "791381", generatedAt: "2026-10-17T12:00:00.000Z", totalPages: 0, modules: [], students: [] });
      return ok({ ok: false }, 404);
    });
    openCourse("teacher-token");
    expect(screen.getByRole("heading", { name: "قراءة صفوفي" })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "عرض قراءة الصفوف" }));
    await screen.findByText(/لا وحدات منشورة لهذا الصف بعد/);
    expect(fetchSpy.mock.calls.map(c => String(c[0])).sort()).toEqual(["/api/classrooms", "/api/learning-class-progress/cA/791381", "/api/learning-materials-catalog"]);
    for (const [, init] of fetchSpy.mock.calls) expect((init as RequestInit).headers).toMatchObject({ "x-builder-token": "teacher-token", Authorization: "Bearer teacher-token" });
  });
});

describe("L.4 — classReadingClient", () => {
  it("publish posts setLearningCourseModules; a server error message reaches the teacher; a network failure has a fallback", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(ok({ ok: true, learningMaterials: [{ courseId: "791381", visibleModuleIds: ["791381-m01"] }] }));
    const c = createClassReadingClient({ "x-builder-token": "t" });
    expect(await c.publish("cA", "791381", ["791381-m01"])).toEqual([{ courseId: "791381", visibleModuleIds: ["791381-m01"] }]);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/classrooms");
    expect(init).toMatchObject({ method: "POST", headers: { "x-builder-token": "t", "Content-Type": "application/json" } });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ action: "setLearningCourseModules", classId: "cA", courseId: "791381", moduleIds: ["791381-m01"] });
    fetchSpy.mockResolvedValueOnce(ok({ ok: false, error: "الصف أو الكتاب غير موجود." }, 404));
    await expect(c.reading("c/1", "791381")).rejects.toMatchObject({ status: 404, message: "الصف أو الكتاب غير موجود." });
    expect(String(fetchSpy.mock.calls[1][0])).toBe("/api/learning-class-progress/c%2F1/791381");
    fetchSpy.mockRejectedValueOnce(new TypeError("offline"));
    await expect(c.classes()).rejects.toMatchObject({ status: 0, message: "تعذر تحميل الصفوف." });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
  });
});
