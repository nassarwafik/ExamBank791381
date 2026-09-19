// @vitest-environment happy-dom
// Interactive inline practice (Units 4–6 standard): immediate local verdict (icon + word, never colour-only), the
// authored "what to check" on a wrong answer, the hint ladder one rung at a time, explanation on a right answer,
// retry / clear; nothing stored or sent; the key never reaches the DOM before the student answers; a question with no
// key keeps the pre-existing static shape.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import PracticeBlockView from "./PracticeBlockView";
import type { PracticeQuestion } from "../content/types";

afterEach(cleanup);

const mcq: PracticeQuestion = {
  kind: "multipleChoice", prompt: "إلى أي فئة ينتمي العنوان 150.10.10.10؟",
  options: [{ id: "a", text: "A" }, { id: "b", text: "B", correct: true }, { id: "c", text: "C" }],
  feedback: { hints: ["انظر إلى الرقم الأول من اليسار فقط.", "150 يقع بين 128 و 191."], correctFeedback: "أحسنت — 150 ضمن مجال الفئة B.", incorrectFeedback: "افحص الرقم الأول فقط وقارنه بمدى كل فئة.", explanation: "الفئة B من 128 إلى 191." },
};

describe("interactive practice — verdict, feedback, hints, retry", () => {
  it("before answering: prompt + options as real radio buttons; no hint / feedback / key in the DOM; no network", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<PracticeBlockView question={mcq} />);
    expect(screen.getByRole("radiogroup", { name: mcq.prompt })).toBeTruthy();
    expect(screen.getAllByRole("radio").map(r => r.textContent)).toEqual(["○A", "○B", "○C"]);
    const html = container.innerHTML;
    for (const secret of ["افحص الرقم الأول", "أحسنت", "128 إلى 191", "انظر إلى الرقم", "correct"]) expect(html).not.toContain(secret);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a wrong answer shows ✕ + what to check, then the hint ladder ONE rung per click; a right answer shows ✓ + explanation; clear resets", () => {
    const { container } = render(<PracticeBlockView question={mcq} />);
    fireEvent.click(screen.getByRole("radio", { name: "A" }));
    expect(screen.getByRole("status").textContent).toContain("✕ غير صحيح — حاول مرة أخرى");
    expect(screen.getByText("افحص الرقم الأول فقط وقارنه بمدى كل فئة.")).toBeTruthy();
    expect(container.innerHTML).not.toContain("128 إلى 191");                       // explanation only on a right answer
    expect(container.innerHTML).not.toContain("150 يقع بين");                        // rung 2 not before rung 1
    fireEvent.click(screen.getByRole("button", { name: "ماذا أفحص؟ (تلميح)" }));
    expect(screen.getByText("انظر إلى الرقم الأول من اليسار فقط.")).toBeTruthy();
    expect(container.innerHTML).not.toContain("150 يقع بين");
    fireEvent.click(screen.getByRole("button", { name: "تلميح آخر" }));
    expect(screen.getByText("150 يقع بين 128 و 191.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /تلميح/ })).toBeNull();                // ladder exhausted
    fireEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(screen.getByRole("status").textContent).toContain("✓ صحيح");
    expect(screen.getByText("أحسنت — 150 ضمن مجال الفئة B.")).toBeTruthy();
    expect(screen.getByText("الفئة B من 128 إلى 191.")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "B" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "امسح الإجابة" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getAllByRole("radio").every(r => r.getAttribute("aria-checked") === "false")).toBe(true);
    expect(container.innerHTML).not.toContain("correct");                            // class names never spell the key
  });

  it("trueFalse and shortInput are checked the same way; shortInput trims and ignores case", () => {
    const tf: PracticeQuestion = { kind: "trueFalse", prompt: "القناع /24 يعني أول ثلاثة أقسام للشبكة.", answer: true, feedback: { correctFeedback: "صحيح." } };
    const { unmount } = render(<PracticeBlockView question={tf} />);
    fireEvent.click(screen.getByRole("radio", { name: "خطأ" }));
    expect(screen.getByRole("status").textContent).toContain("غير صحيح");
    fireEvent.click(screen.getByRole("radio", { name: "صح" }));
    expect(screen.getByRole("status").textContent).toContain("✓ صحيح");
    unmount();
    const si: PracticeQuestion = { kind: "shortInput", prompt: "ما القناع الطبيعي للفئة C؟", answer: "255.255.255.0", feedback: { incorrectFeedback: "الفئة C تعني ثلاثة أقسام 255." } };
    render(<PracticeBlockView question={si} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.getAttribute("dir")).toBe("ltr");
    fireEvent.change(input, { target: { value: "255.255.0.0" } });
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    expect(screen.getByText("الفئة C تعني ثلاثة أقسام 255.")).toBeTruthy();
    fireEvent.change(input, { target: { value: " 255.255.255.0 " } });
    expect(screen.queryByRole("status")).toBeNull();                                   // editing withdraws the verdict
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    expect(screen.getByRole("status").textContent).toContain("✓ صحيح");
  });

  it("a question WITHOUT an answer key keeps the static shape (option texts + the later-phase note), no buttons", () => {
    const noKey: PracticeQuestion = { kind: "multipleChoice", prompt: "س؟", options: [{ id: "x", text: "أ" }, { id: "y", text: "ب" }] };
    render(<PracticeBlockView question={noKey} />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText("سيتوفر التحقق من الإجابة في مرحلة لاحقة.")).toBeTruthy();
    expect(screen.getByText("أ")).toBeTruthy();
  });
});
