// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import FunctionGraphSelectionEditor from "../questionTypes/editors/FunctionGraphSelectionEditor";
import FunctionGraphView from "./FunctionGraphView";
import { graphTemplate } from "./graphEditing";
import { areaGraph, tangentGraph } from "./testing/graphFixtures";

// Phase 21A.2 — Review Fix 1, UI findings of the independent review of 65c21e7 (lane C): C-3 Arabic words of a target detail ("من x = 0 إلى
// x = 2", "عند x = 1") were isolated LEFT-TO-RIGHT, so a real browser showed them reversed in the student list, the key picker and the
// review; C-4 replacing the graph by a template kept an answer-key entry whose id the template reuses (curve:c1 silently named e^x).
afterEach(cleanup);
type Node = Record<string, unknown>;

describe("RF1 C-3 — target details keep Arabic reading order", () => {
  it("RF1: a detail containing Arabic is never inside a left-to-right isolate (region and tangent lists)", () => {
    for (const [spec, kind] of [[areaGraph(), "region"], [tangentGraph(), "tangent"]] as const) {
      render(<div dir="rtl"><FunctionGraphView spec={spec} selection={{ kind, mode: "single", max: 1, value: [], label: "اختر", onChange: () => {} }} /></div>);
      const details = [...document.querySelectorAll(".fg-option .fg-option-detail")];
      expect(details.length, kind).toBeGreaterThan(0);
      for (const d of details) if (/[؀-ۿ]/.test(d.textContent ?? "")) expect(d.getAttribute("dir"), d.textContent ?? "").not.toBe("ltr");
      cleanup();
    }
  });
});

describe("RF1 C-4 — a template replacing the graph never carries the answer key over to a reused id", () => {
  it("RF1: the key is cleared and the teacher is told", async () => {
    const g0 = graphTemplate("quadratic", "graph-rf1");
    const g = { ...g0, curves: [...g0.curves, { id: "c2", kind: "explicit" as const, label: "g(x)", expression: "x + 1" }] };
    const emitted: Node[] = [];
    function Host() {
      const [node, setNode] = useState<Node>({ type: "functionGraphSelection", presentationType: "functionGraphSelection", questionTypeVersion: 1, text: "q", marks: 2,
        functionGraphSelection: { v: 1, graph: g, target: "curve", mode: "single", maxSelections: 1 }, answer: { scoring: "allOrNothing", correct: ["curve:c1"] } });
      return <FunctionGraphSelectionEditor node={node as never} onChange={p => { emitted.push(p as Node); setNode(n => ({ ...n, ...(p as Node) })); }} />;
    }
    render(<Host />);
    const select = screen.getAllByRole("combobox").find(s => s.querySelector('option[value="exponential"]') && s.querySelector('option[value=""]'))!;
    fireEvent.change(select, { target: { value: "exponential" } });
    fireEvent.click(await screen.findByRole("button", { name: "استبدال" }));
    await waitFor(() => expect(emitted.length).toBeGreaterThan(0));
    const last = emitted.at(-1) as { functionGraphSelection: { graph: { curves: { id: string; expression?: string }[] } }; answer: { correct: string[] } };
    expect(last.functionGraphSelection.graph.curves.map(c => c.expression)).toContain("exp(x)");
    expect(last.answer.correct).toEqual([]);
    expect(screen.getByTestId("graph-key-notice").textContent).toContain("أُزيل");
  });
});
