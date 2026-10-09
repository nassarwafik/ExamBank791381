// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FunctionGraphView from "./FunctionGraphView";
import * as G from "./testing/graphFixtures";

// Phase 21A.2 real React interaction pins: keyboard, RTL semantics, print-original,
// bounded viewer actions and accessible text alternative. These supplement the pure scene tests;
// pixel geometry/print PDF require separate Chromium certification.
afterEach(cleanup);
describe("21A2-UX function graph RTL, keyboard, trace, print and reset", () => {
  it("zooms by toolbar, prepares ORIGINAL viewport for print, then restores without altering the authored graph", () => {
    const spec = G.quadraticGraph();
    const original = JSON.stringify(spec);
    render(<div dir="rtl"><FunctionGraphView spec={spec} /></div>);
    const stage = screen.getByRole("group", { name: "منطقة الرسم: " + spec.title });
    const reset = screen.getByRole("button", { name: "إعادة الضبط إلى نافذة العرض الأصلية" });
    expect(reset).toBeDisabled();
    expect(stage.getAttribute("data-fg-zoomed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "تكبير" }));
    expect(stage.getAttribute("data-fg-zoomed")).toBe("true");
    expect(reset).not.toBeDisabled();
    expect(document.querySelector(".fg-print svg")).not.toBeNull();
    fireEvent.click(reset);
    expect(stage.getAttribute("data-fg-zoomed")).toBeNull();
    expect(document.querySelector(".fg-print")).toBeNull();
    expect(JSON.stringify(spec)).toBe(original);
  });

  it("traces on arrow keys, pans on Shift + arrows, and keyboard 0 restores the view in RTL", () => {
    const spec = G.sineGraph();
    render(<div dir="rtl"><FunctionGraphView spec={spec} /></div>);
    const stage = screen.getByRole("group", { name: "منطقة الرسم: " + spec.title });
    stage.focus();
    fireEvent.keyDown(stage, { key: "ArrowRight" });
    expect(screen.getByRole("status").textContent).toContain("x =");
    expect(stage.querySelector(".fg-readout")).not.toBeNull();
    fireEvent.keyDown(stage, { key: "ArrowRight", shiftKey: true });
    expect(stage.getAttribute("data-fg-zoomed")).toBe("true");
    fireEvent.keyDown(stage, { key: "0" });
    expect(stage.getAttribute("data-fg-zoomed")).toBeNull();
    expect(stage.querySelector(".fg-readout")).toBeNull();
    expect(document.querySelector('bdi[dir="ltr"]')).not.toBeNull();
    expect(screen.getByRole("figure", { name: spec.title })).toBeInTheDocument();
  });

  it("omits disabled zoom/pan/trace controls while keeping an accessible formula-and-values alternative", () => {
    const spec = { ...G.quadraticGraph(), interaction: { zoom: false, pan: false, trace: false, crosshair: false } };
    render(<div dir="rtl"><FunctionGraphView spec={spec} /></div>);
    expect(screen.queryByRole("toolbar")).toBeNull();
    const stage = screen.getByRole("group", { name: "منطقة الرسم: " + spec.title });
    fireEvent.keyDown(stage, { key: "ArrowRight" });
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByText(/x\^2 - 4x \+ 3|x\^2 - 4\*x \+ 3/)).toBeTruthy();
    expect(stage.getAttribute("data-fg-zoomed")).toBeNull();
  });
});
