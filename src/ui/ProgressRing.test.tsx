// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import ProgressRing from "./ProgressRing";

afterEach(cleanup);

describe("ProgressRing (UX-7)", () => {
  it("is a semantic progressbar named by its visible label with min 0 / max 100 / now = clamped value", () => {
    render(<ProgressRing value={84.4} label="المعدل النهائي" />);
    const bar = screen.getByRole("progressbar", { name: "المعدل النهائي" });
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuenow")).toBe("84");
    expect(bar.getAttribute("aria-valuetext")).toBe("84%");
    expect(screen.getByText("84%")).toBeTruthy();
    expect(screen.getByText("المعدل النهائي")).toBeTruthy();
    const fill = bar.querySelector(".eb-ring-fill") as SVGCircleElement;
    const dash = Number(fill.getAttribute("stroke-dasharray")), offset = Number(fill.getAttribute("stroke-dashoffset"));
    expect(Math.round((1 - offset / dash) * 100)).toBe(84);
  });
  it("clamps over / negative / NaN into 0–100", () => {
    const { rerender } = render(<ProgressRing value={150} label="a" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    rerender(<ProgressRing value={-4} label="a" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    rerender(<ProgressRing value={Number.NaN} label="a" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });
  it("renders an explicit empty figure (no fake 0%) when the value is null", () => {
    render(<ProgressRing value={null} label="المعدل النهائي" emptyText="لا يوجد معدل نهائي بعد" />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("img", { name: "المعدل النهائي: لا يوجد معدل نهائي بعد" })).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
  });
});
