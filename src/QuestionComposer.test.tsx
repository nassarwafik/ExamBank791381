// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import QuestionComposer from "./QuestionComposer";
import { newQuestion } from "./examBuilderState";

afterEach(cleanup);

describe("QuestionComposer — the shared question content editor", () => {
  it("renders the type selector (all 11 canonical types) and the question prompt", () => {
    render(<QuestionComposer question={newQuestion("multipleChoice")} onChange={vi.fn()} />);
    const sel = screen.getByLabelText("نوع السؤال") as HTMLSelectElement;
    expect(sel.querySelectorAll("option").length).toBe(11);
    expect(screen.getByPlaceholderText("نص السؤال")).toBeTruthy();
  });

  it("delegates a multipleChoice question to the shared body editor (.sb-options)", () => {
    const { container } = render(<QuestionComposer question={newQuestion("multipleChoice")} onChange={vi.fn()} />);
    expect(container.querySelector(".sb-options")).toBeTruthy();
  });

  it("delegates cliFill and tableFill to their shared type-specific editors", () => {
    const cli = render(<QuestionComposer question={newQuestion("cliFill")} onChange={vi.fn()} />);
    expect(cli.container.querySelector(".sb-clifill")).toBeTruthy();
    cleanup();
    const tbl = render(<QuestionComposer question={newQuestion("tableFill")} onChange={vi.fn()} />);
    expect(tbl.container.querySelector(".sb-tablefill")).toBeTruthy();
  });

  it("delegates a compound question to CompoundQuestionEditor (.sb-compound-editor), not the body editor", () => {
    const { container } = render(<QuestionComposer question={newQuestion("compound")} onChange={vi.fn()} />);
    expect(container.querySelector(".sb-compound-editor")).toBeTruthy();               // compound branch, not the plain body editor
    expect(container.querySelector(".sb-part")).toBeTruthy();                          // renders the compound's independent part(s)
    expect(screen.getByPlaceholderText("نص السؤال المركّب (اختياري)")).toBeTruthy();   // compound prompt copy
  });

  it("a compound part selector offers all 10 part types (compound excluded — no nesting)", () => {
    const q = newQuestion("compound", { parts: [{ id: "p1", type: "multipleChoice", text: "" }] });
    const { container } = render(<QuestionComposer question={q} onChange={vi.fn()} />);
    const partSelect = container.querySelector(".sb-part select") as HTMLSelectElement;
    expect(partSelect.querySelectorAll("option").length).toBe(10);
  });

  it("changing the type goes through the canonical helper — onChange receives the new presentationType", () => {
    const onChange = vi.fn();
    render(<QuestionComposer question={newQuestion("multipleChoice")} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("نوع السؤال"), { target: { value: "trueFalse" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ presentationType: "trueFalse" });
  });

  it("editing the prompt calls onChange with the text patch", () => {
    const onChange = vi.fn();
    render(<QuestionComposer question={newQuestion("shortAnswer")} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("نص السؤال"), { target: { value: "ما هو؟" } });
    expect(onChange).toHaveBeenCalledWith({ text: "ما هو؟" });
  });

  it("propagates disabled to the type selector and the prompt", () => {
    render(<QuestionComposer question={newQuestion("multipleChoice")} onChange={vi.fn()} disabled />);
    expect((screen.getByLabelText("نوع السؤال") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByPlaceholderText("نص السؤال") as HTMLTextAreaElement).disabled).toBe(true);
  });
});

describe("StructuredQuestionEditor structural boundary", () => {
  it("delegates content to QuestionComposer and keeps no second body-selection implementation", () => {
    const src = readFileSync(path.join(process.cwd(), "src", "StructuredQuestionEditor.tsx"), "utf8");
    expect(src).toContain("QuestionComposer");
    // the exam chrome no longer wires the body editors or the type-change helper directly — they live behind the composer
    expect(src).not.toContain("QuestionBodyEditor");
    expect(src).not.toContain("CompoundQuestionEditor");
    expect(src).not.toContain("changeQuestionType");
  });
});
