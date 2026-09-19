// @vitest-environment happy-dom
// Learning Practice — the TEACHER host: with the builder token the Reader reads the trainings list once with the
// teacher headers (teachers may preview/solve every training regardless of class publication); without a token the
// Reader stays fully local (zero requests), exactly as before.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningMaterialsPage from "./LearningMaterialsPage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const SLOW = { timeout: 8000 }, T = 20000;
const P08 = "791381-m02-l01-p08";

async function openReader() {
  fireEvent.click(screen.getByRole("button", { name: "فتح الكتاب" }));
  fireEvent.click(screen.getByRole("button", { name: "بدء القراءة" }));
  await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
}

describe("Learning Materials — teacher training host", () => {
  it("with a token: ONE trainings-list read with x-builder-token; every training is available with its title; the exit label is the teacher's", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), headers: (init?.headers || {}) as Record<string, string> });
      return { ok: true, status: 200, json: async () => ({ ok: true, actor: "teacher", trainings: [
        { trainingId: "T01", order: 1, label: "تدريب 1", requiredModuleId: "791381-m01", courseId: "791381", available: true, title: "أساسيات الشبكات" },
        { trainingId: "T03", order: 3, label: "تدريب 3", requiredModuleId: "791381-m07", courseId: "791381", available: true, title: "عناوين IPv4 وصلاحية العنوان" },
      ] }) } as Response;
    }) as unknown as typeof fetch;
    render(<LearningMaterialsPage token="builder-secret" />);
    await openReader();
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].url).toBe("/api/learning-training");
    expect(calls[0].headers["x-builder-token"]).toBe("builder-secret");
    expect(calls[0].headers.Authorization).toBe("Bearer builder-secret");
    const jump = screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;
    fireEvent.change(jump, { target: { value: P08 } });
    await screen.findByRole("heading", { level: 2, name: "تدريبات قصيرة" }, SLOW);
    const t3 = await screen.findByRole("region", { name: "تدريب 3" }, SLOW);
    expect(t3.textContent).toContain("عناوين IPv4 وصلاحية العنوان");
    expect((t3.querySelector("button") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: "العودة إلى نظرة الكتاب" })).toBeTruthy();
    expect(calls.length).toBe(1);
  }, T);

  it("without a token: the Reader opens PDF 22 with generic cards and issues ZERO requests", async () => {
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => { throw new Error("unexpected request " + String(input)); });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    render(<LearningMaterialsPage />);
    await openReader();
    fireEvent.change(screen.getByLabelText("انتقل إلى صفحة"), { target: { value: P08 } });
    await screen.findByRole("heading", { level: 2, name: "تدريبات قصيرة" }, SLOW);
    expect((await screen.findByRole("region", { name: "تدريب 1" }, SLOW)).textContent).toContain("يُحلّ هذا التدريب تفاعليًا من داخل المنصة.");
    expect(fetchSpy).not.toHaveBeenCalled();
  }, T);
});
