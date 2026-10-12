// @vitest-environment happy-dom
// Phase 21E.3 — a rich question stem that fails to render falls back to the plain question text (never a blank question), and the
// answer area of the same question stays usable; the failure log carries the fixed code only.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("./richContent/RichPrompt", () => ({ default: () => { throw new Error("rich stem internal detail"); }, RichText: () => null }));
import StudentQuestionCard from "./StudentQuestionCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("StudentQuestionCard — a failing rich stem", () => {
  it("shows the plain question text instead, keeps the answer area, and leaks nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const q = { examQuestionId: "q1", presentationType: "open", text: "اشرح مفهوم الشبكة المحلية.", marks: 2, richContent: { v: 1, blocks: [{ type: "paragraph", runs: [{ text: "rich" }] }] } };
    render(<StudentQuestionCard q={q as never} index={0} id="q1" answer={undefined} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} />);
    expect(await screen.findByText("اشرح مفهوم الشبكة المحلية.")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.queryByTestId("question-recovery")).toBeNull();
    expect(document.body.textContent).not.toContain("internal detail");
  });
});
