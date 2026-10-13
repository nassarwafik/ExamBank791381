// @vitest-environment happy-dom
// Phase 21E.3 review fix 2 — after a successful retry focus never lands on an answer control (re-review, recovery RR-1, P1: focus
// went to the first radio / the hotspot / the answer field next to the recovered part, and the student's next ordinary key recorded
// an answer they never chose), and never on <body> (accessibility RR-1: a formula retry) or the next part's field (RR-4). It lands
// on the line the boundary renders just before the recovered part. (Separate file: a recovered chunk stays recovered for the module.)
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ math: true, stim: true }));
vi.mock("./richContent/RichMath", () => {
  if (h.math) throw new TypeError("Failed to fetch dynamically imported module: http://localhost:3000/assets/RichMath-abcd1234.js");
  return { default: ({ source }: { source: string }) => <span data-testid="math">{"MATH:" + source}</span> };
});
vi.mock("./questionTypes/CodeStimulusView", () => {
  if (h.stim) throw new TypeError("Failed to fetch dynamically imported module: http://localhost:3000/assets/CodeStimulusView-abcd1234.js");
  return { default: () => <pre data-testid="stimulus" tabIndex={0}>print(1)</pre> };
});
import StudentQuestionCard from "./StudentQuestionCard";

const frames = (n: number) => act(async () => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(() => r(null))); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const card = (q: object, on: { onChoice?: (n: number) => void; onText?: (v: string) => void } = {}) =>
  render(<StudentQuestionCard q={q as never} index={0} id="q1" answer={undefined} onChoice={on.onChoice ?? (() => {})} onSeq={() => {}} onTable={() => {}} onText={on.onText ?? (() => {})} />);
const keys = (el: Element) => { for (const key of ["ArrowDown", "ArrowUp", " ", "Enter", "x"]) { fireEvent.keyDown(el, { key }); fireEvent.keyUp(el, { key }); } };

describe("RF2 — open question: focus after a stimulus retry is never in the answer field", () => {
  it("an open question with a code stimulus: focus is not in the answer field (RR-4); typing there is never redirected", { timeout: 20000 }, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onText = vi.fn();
    card({ examQuestionId: "q1", presentationType: "open", text: "اشرح ناتج البرنامج.", marks: 2, codeStimulus: { language: "python", code: "print(1)" } }, { onText });
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" }, { timeout: 8000 });
    h.stim = false;
    retry.focus();
    await act(async () => { fireEvent.click(retry); });
    await waitFor(() => expect(screen.getByTestId("stimulus")).toBeTruthy());
    await frames(6);
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));          // the defect: the answer field
    expect(document.activeElement).toBe(screen.getByTestId("recovery-landed"));
    keys(document.activeElement!);
    expect(onText).not.toHaveBeenCalled();
  });
});
