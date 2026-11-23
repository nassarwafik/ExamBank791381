// @vitest-environment happy-dom
// Teacher C# lab, phase V1 (docs/enterprise-csharp-visual-lab-plan.md) — the reader hands the lab to the book tool bar for the TEACHER
// only: the teacher host (actor "teacher") gets `labHeaders` (its own «جرّب الكود» session), the student host never does, whatever
// it passes. The dock itself (desktop rule, frame, protocol) is covered by src/studentTools/csharpLab.v1.test.tsx.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

const seen: { courseId: string; runHeaders?: Record<string, string>; labHeaders?: Record<string, string> }[] = [];
vi.mock("../../studentTools/CourseToolDock", () => ({
  default: (props: (typeof seen)[number]) => { seen.push(props); return null; },
}));

const { default: LearningReaderWithTraining } = await import("./LearningReaderWithTraining");
const { createRestrictedReaderContentApi } = await import("../reader/restrictedContentApi");

afterEach(() => { cleanup(); seen.length = 0; });
const HEADERS = { Authorization: "Bearer session" };

function mount(actor: "teacher" | "student") {
  const api = createRestrictedReaderContentApi("791381", ["791381-m01"]);
  render(<LearningReaderWithTraining courseId="791381" api={api} onExit={vi.fn()} exitLabel="رجوع" client={null} actor={actor} codeRun={{ headers: HEADERS }} />);
}

describe("Teacher C# lab — only the teacher's reader offers it", () => {
  it("teacher host → the dock gets the lab with the teacher's session", async () => {
    mount("teacher");
    await waitFor(() => expect(seen.length).toBeGreaterThan(0), { timeout: 8000 });
    expect(seen.at(-1)).toMatchObject({ courseId: "791381", runHeaders: HEADERS, labHeaders: HEADERS });
  });
  it("student host → never the lab (the editor keeps the Runner path the server decides)", async () => {
    mount("student");
    await waitFor(() => expect(seen.length).toBeGreaterThan(0), { timeout: 8000 });
    for (const props of seen) expect(props.labHeaders).toBeUndefined();
    expect(seen.at(-1)!.runHeaders).toEqual(HEADERS);
  });
});
