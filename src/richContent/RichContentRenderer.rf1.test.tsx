// @vitest-environment happy-dom
// Phase 21E.3 review fix 1 — one failing rich-content leaf (formula, chart, graph, 3D view) never takes the rest of the document with it
// (#1, major). Fail-first on 92f4326: the whole rich stem was replaced by the plain question text, with no card and no retry, and every
// other stem using the same leaf followed silently.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ fail: true }));
vi.mock("./RichMath", () => {
  if (h.fail) throw new TypeError("Failed to fetch dynamically imported module: " + "http://localhost:3000/assets/RichMath-abcd1234.js");
  return { default: ({ source }: { source: string }) => <span data-testid="math">{"MATH:" + source}</span> };
});
import StudentQuestionCard from "../StudentQuestionCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("RF1 — a failing formula keeps the rest of the rich stem; its source shows with a retry", () => {
  it("the paragraph stays rich, the formula shows its source text and «إعادة تحميل الصيغة»; the whole stem is never replaced", { timeout: 20000 }, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const q = { examQuestionId: "q1", presentationType: "open", text: "PLAIN-TEXT-ONLY", marks: 2,
      richContent: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "RICH-PARAGRAPH" }] }, { type: "math", source: "x^2" }] } };
    render(<StudentQuestionCard q={q as never} index={0} id="q1" answer={undefined} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} />);
    const retry = await screen.findByRole("button", { name: "إعادة تحميل الصيغة" }, { timeout: 8000 });
    expect(screen.getByText(/RICH-PARAGRAPH/)).toBeTruthy();                       // the rest of the rich stem is still there
    expect(screen.queryByText("PLAIN-TEXT-ONLY")).toBeNull();                       // …it was not swapped for the plain text
    expect(screen.getByTestId("question-recovery-compact").textContent).toContain("x^2");
    expect(screen.getByRole("textbox")).toBeTruthy();
    h.fail = false;                                                                  // the network is back
    retry.focus();
    await act(async () => { fireEvent.click(retry); });
    await waitFor(() => expect(screen.getByTestId("math").textContent).toBe("MATH:x^2"));
  });
});
