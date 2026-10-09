// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { Suspense, useState } from "react";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import RichContentRenderer from "../richContent/RichContentRenderer";
import { resolveStudentRenderer, studentUnsupported } from "../questionTypes/studentRegistry";
import { resolveAuthoringEditor } from "../questionTypes/authoringRegistry";
import type { RichContentV1 } from "../richContent/richContentModel";
import type { Answer } from "../answerState";
import type { Question } from "../studentQuestionTypes";

// Phase 21A.2 — BEHAVIOURAL FAIL-FIRST suite of the client seams (imports only modules that exist on the baseline 6e4a5ef): the rich-content
// renderer draws a functionGraph block (on the baseline it renders nothing), the student registry resolves functionGraphSelection@1 (on the
// baseline the type is unsupported and fails closed), its renderer turns pointer and keyboard selection into the SAME semantic answer, and
// the authoring registry has an editor for it.
afterEach(cleanup);
const QUAD = () => ({
  version: 1, id: "g-quad", title: "منحنى الدالة التربيعية", description: "منحنى الدالة f(x) = x² − 4x + 3 مع أربع نقاط مميزة.",
  viewport: { xMin: -2, xMax: 6, yMin: -3, yMax: 8 },
  curves: [{ id: "f", kind: "explicit", label: "f(x) = x^2 - 4x + 3", expression: "x^2 - 4*x + 3" }],
  points: [{ id: "p1", x: 1, y: 0, label: "A" }, { id: "p2", x: 3, y: 0, label: "B" }, { id: "p3", x: 2, y: -1, label: "C" }]
});

describe("21A2-FF5 renderer: a functionGraph rich block is drawn", () => {
  it("as a figure named by its title, with the curve path, the point markers and the non-visual description", async () => {
    const content = { schemaVersion: 1, blocks: [{ type: "functionGraph", graph: QUAD() }] } as unknown as RichContentV1;
    render(<RichContentRenderer content={content} />);
    const fig = await screen.findByRole("figure", { name: /منحنى الدالة التربيعية/ });
    await waitFor(() => expect(fig.querySelector('[data-fg-curve="f"]')?.getAttribute("d") ?? "").toMatch(/^M/));
    expect(fig.querySelector('[data-fg-point="p1"]')).not.toBeNull();
    expect(fig.textContent).toContain("مع أربع نقاط مميزة");
  });
});

describe("21A2-FF6 functionGraphSelection@1 registries and student interaction", () => {
  it("is supported by the student runtime and the authoring registry; an unknown future version still fails closed", () => {
    // (studentUnsupported is the card's FALLBACK predicate — true for every non-legacy key, chartSelection included; support is the registry)
    expect(resolveStudentRenderer("functionGraphSelection", 1)?.key).toBe("functionGraphSelection");
    expect(resolveAuthoringEditor("functionGraphSelection", 1)).toBeTruthy();
    expect(resolveStudentRenderer("functionGraphSelection", 2)).toBeUndefined();
    expect(studentUnsupported("functionGraphSelection", 2)).toBe(true);
  });
  it("the keyboard list and the pointer emit the same semantic answer on the question's graph", async () => {
    const Renderer = resolveStudentRenderer("functionGraphSelection", 1)!.Renderer;
    const q = { id: "q1", text: "x", marks: 4, presentationType: "functionGraphSelection", questionTypeVersion: 1,
      functionGraphSelection: { v: 1, graph: QUAD(), target: "point", mode: "multiple", maxSelections: 2, label: "اختر جذري الدالة" } } as unknown as Question;
    const answers: Answer[] = [];
    function Host() {
      const [a, setA] = useState<Answer | undefined>(undefined);
      return <Suspense fallback={null}><Renderer q={q} id="q1" answer={a} labelPrefix="" onAnswer={n => { setA(n); answers.push(n); }} /></Suspense>;
    }
    render(<Host />);
    const group = await screen.findByRole("group", { name: /اختر جذري الدالة/ });
    fireEvent.click(within(group).getByRole("button", { name: /^A \(1, 0\)/ }));
    expect(answers.at(-1)).toEqual({ kind: "functionGraphSelection", graphId: "g-quad", targets: ["point:p1"] });
    const marker = await waitFor(() => { const m = document.querySelector('[data-fg-target="point:p2"]'); expect(m).not.toBeNull(); return m!; });
    fireEvent.click(marker);
    expect(answers.at(-1)).toEqual({ kind: "functionGraphSelection", graphId: "g-quad", targets: ["point:p1", "point:p2"] });
  });
});
