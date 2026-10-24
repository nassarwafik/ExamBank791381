// @vitest-environment happy-dom
// Phase L.3 — the teacher preview reads the book as a student does: with a teacher session the Reader gets the SAME study
// client (server-judged exercises, never stored for a teacher); without a session it stays fully local, as before.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import LearningMaterialsPage from "./LearningMaterialsPage";

const seen = vi.hoisted(() => ({ study: undefined as unknown, actor: "" }));
vi.mock("./training/LearningReaderWithTraining", () => ({
  default: (props: { study?: unknown; actor: string }) => { seen.study = props.study; seen.actor = props.actor; return <div data-testid="reader" />; },
}));
afterEach(() => { cleanup(); history.replaceState(null, "", location.pathname); seen.study = undefined; });

async function openReader(token?: string) {
  render(<LearningMaterialsPage token={token} />);
  fireEvent.click(within(screen.getByRole("article", { name: "شبكات الاتصال" })).getByRole("button", { name: "فتح الكتاب" }));
  fireEvent.click(screen.getByRole("button", { name: "بدء القراءة" }));
  await screen.findByTestId("reader");
}

describe("L.3 — teacher preview parity", () => {
  it("a teacher session hands the Reader a study client; it calls the teacher-authenticated study API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, actor: "teacher", courseId: "791381", pages: {}, modules: {} }) } as Response);
    await openReader("teacher-token");
    expect(seen.actor).toBe("teacher");
    const study = seen.study as { state: (c: string) => Promise<unknown> };
    expect(typeof study.state).toBe("function");
    await study.state("791381");
    const [url, init] = fetchSpy.mock.calls.at(-1)!;
    expect(String(url)).toBe("/api/learning-study/791381");
    expect((init as RequestInit).headers).toMatchObject({ "x-builder-token": "teacher-token" });
  });
  it("without a session the Reader stays local (no study client)", async () => {
    await openReader();
    expect(seen.study).toBeNull();
  });
});
