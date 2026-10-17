// @vitest-environment happy-dom
// Phase L.6a — each host asks for module bodies with ITS OWN session: the student's Reader with the student's token, the teacher's
// book page with the teacher's token. (The transport itself is moduleBodySource.server, tested on its own.)
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

const seen = vi.hoisted(() => ({ calls: [] as Array<{ courseId: string; moduleId: string; headers: Record<string, string> }> }));
vi.mock("./content/moduleBodySource", async () => {
  // (under Vitest this path resolves to moduleBodySource.bundled.ts, so the real loader is taken with importActual)
  const bundled = await vi.importActual<typeof import("./content/moduleBodySource.bundled")>("./content/moduleBodySource.bundled");
  return { loadModuleBody: async (courseId: string, moduleId: string, headers: Record<string, string> = {}) => { seen.calls.push({ courseId, moduleId, headers }); return bundled.loadModuleBody(courseId, moduleId, headers); } };
});
import StudentReader from "../student/StudentReader";
import LearningMaterialsPage from "./LearningMaterialsPage";
import type { ProgressClient } from "./progress/progressClient";
import type { AnnotationsClient } from "./annotations/annotationsClient";

afterEach(() => { cleanup(); vi.restoreAllMocks(); seen.calls.length = 0; history.replaceState(null, "", location.pathname); try { localStorage.clear(); } catch { /* ignore */ } });
const SLOW = { timeout: 10000 };
const quietFetch = () => vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 404, json: async () => ({ ok: false }) } as Response);

describe("L.6a — module bodies are requested with the host's own session", () => {
  it("the student's Reader: the student's token, and only for a released module", async () => {
    quietFetch();
    const progress: ProgressClient = { get: vi.fn(async () => null), visit: vi.fn(async () => true) };
    const annotations = { get: vi.fn(async () => null) } as unknown as AnnotationsClient;
    render(<StudentReader courseId="791381" allowedModuleIds={["791381-m01"]} token="stu" onExit={vi.fn()} progressClient={progress} annotationsClient={annotations} />);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    expect(seen.calls).toEqual([{ courseId: "791381", moduleId: "791381-m01", headers: { "x-student-token": "stu", Authorization: "Bearer stu" } }]);
  }, 20000);

  it("the teacher's book page: the teacher's token", async () => {
    quietFetch();
    render(<LearningMaterialsPage token="tea" />);
    fireEvent.click(screen.getByRole("button", { name: "فتح الكتاب" }));
    fireEvent.click(screen.getByRole("button", { name: "بدء القراءة" }));
    await waitFor(() => expect(seen.calls.length).toBeGreaterThan(0), SLOW);
    expect(seen.calls[0]).toMatchObject({ courseId: "791381", headers: { "x-builder-token": "tea", Authorization: "Bearer tea" } });
  }, 20000);
});
