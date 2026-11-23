// @vitest-environment happy-dom
// Visual lab V3 (docs/enterprise-csharp-visual-lab-plan.md §11) — the reader offers «تشغيل مرئي» to the book's tool bar for the TEACHER
// only: the teacher host (actor "teacher") passes visualRun, the student host never does (students: plan phase V7, the owner's
// decision). The dock's own rules (desktop, the recorder) are covered by src/studentTools/visualRun.v3.test.tsx.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

const seen: { courseId: string; visualRun?: boolean }[] = [];
vi.mock("../../studentTools/CourseToolDock", () => ({
  default: (props: (typeof seen)[number]) => { seen.push(props); return null; },
}));

const { default: LearningReaderWithTraining } = await import("./LearningReaderWithTraining");
const { createRestrictedReaderContentApi } = await import("../reader/restrictedContentApi");

afterEach(() => { cleanup(); seen.length = 0; });

function mount(actor: "teacher" | "student") {
  const api = createRestrictedReaderContentApi("791381", ["791381-m01"]);
  render(<LearningReaderWithTraining courseId="791381" api={api} onExit={vi.fn()} exitLabel="رجوع" client={null} actor={actor} codeRun={{ headers: { Authorization: "Bearer x" } }} />);
}

describe("Visual lab V3 — only the teacher's reader offers the visual run", () => {
  it("teacher host → visualRun", async () => {
    mount("teacher");
    await waitFor(() => expect(seen.length).toBeGreaterThan(0), { timeout: 8000 });
    expect(seen.at(-1)!.visualRun).toBe(true);
  });
  it("student host → never", async () => {
    mount("student");
    await waitFor(() => expect(seen.length).toBeGreaterThan(0), { timeout: 8000 });
    for (const p of seen) expect(p.visualRun).toBe(false);
  });
});
