// @vitest-environment happy-dom
// Phase 21E.3 review fix 2 — after a successful retry focus never lands on an answer control (re-review, recovery RR-1, P1: focus
// went to the first radio / the hotspot / the answer field next to the recovered part, and the student's next ordinary key recorded
// an answer they never chose), and never on <body> (accessibility RR-1: a formula retry) or the next part's field (RR-4). It lands
// on the line the boundary renders just before the recovered part.
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

describe("RF2 — after a successful retry focus lands on the recovered part's line, never on an answer control", () => {
  it("multiple choice with a code stimulus: focus is on the line before the stimulus; ordinary keys there choose nothing", { timeout: 20000 }, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onChoice = vi.fn();
    card({ examQuestionId: "q1", presentationType: "multipleChoice", text: "ما ناتج البرنامج؟", marks: 1, options: [{ text: "1" }, { text: "2" }], codeStimulus: { language: "python", code: "print(1)" } }, { onChoice });
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" }, { timeout: 8000 });
    h.stim = false;
    retry.focus();
    await act(async () => { fireEvent.click(retry); });
    await waitFor(() => expect(screen.getByTestId("stimulus")).toBeTruthy());
    await frames(6);
    expect(screen.getAllByRole("radio").includes(document.activeElement as HTMLInputElement)).toBe(false);   // the defect: a radio
    const line = screen.getByTestId("recovery-landed");
    expect(document.activeElement).toBe(line);
    expect(line.compareDocumentPosition(screen.getByTestId("stimulus")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    keys(document.activeElement!);
    expect(onChoice).not.toHaveBeenCalled();
    expect(screen.getAllByRole("radio").every(r => !(r as HTMLInputElement).checked)).toBe(true);
  });
  it("a formula retry (RR-1 accessibility): focus stays on the formula's own line — never <body>", { timeout: 20000 }, async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    card({ examQuestionId: "q1", presentationType: "open", text: "PLAIN", marks: 2,
      richContent: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "RICH" }] }, { type: "math", source: "x^2" }] } });
    const retry = await screen.findByRole("button", { name: "إعادة تحميل الصيغة" }, { timeout: 8000 });
    h.math = false;
    retry.focus();
    await act(async () => { fireEvent.click(retry); });
    await waitFor(() => expect(screen.getByTestId("math").textContent).toBe("MATH:x^2"));
    await frames(12);
    expect(document.activeElement).not.toBe(document.body);                         // the defect: focus lost to <body>
    const line = screen.getByTestId("recovery-landed");
    expect(document.activeElement).toBe(line);
    expect(line.className).toBe("eb-visually-hidden");                              // inside a sentence: no visible line
  });
});
