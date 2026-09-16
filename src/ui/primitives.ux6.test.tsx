// @vitest-environment happy-dom
// UX-6a shared primitives: ProgressBar (semantic progressbar, min/max/now, clamping, accessible name) and
// ChartCard (named figure, tabular equivalent behind a disclosure, reduced-motion render context, no data
// transformation).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import ProgressBar from "./ProgressBar";
import ChartCard from "./ChartCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((q: string) => ({ matches, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}

describe("ProgressBar", () => {
  it("is a semantic progressbar with min 0 / max 100 / now = value, visible percentage and the visible label as its name", () => {
    render(<ProgressBar label="التقدم العام" value={64.4} />);
    const bar = screen.getByRole("progressbar", { name: "التقدم العام" });
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuenow")).toBe("64");
    expect(bar.getAttribute("aria-valuetext")).toBe("64%");
    expect(screen.getByText("64%")).toBeTruthy();
    expect((bar.querySelector(".eb-progress-fill") as HTMLElement).style.width).toBe("64%");
  });
  it("clamps the value safely into 0–100 (over, negative, NaN)", () => {
    const { rerender } = render(<ProgressBar ariaLabel="a" value={150} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    rerender(<ProgressBar ariaLabel="a" value={-5} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    rerender(<ProgressBar ariaLabel="a" value={Number.NaN} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect((screen.getByRole("progressbar").querySelector(".eb-progress-fill") as HTMLElement).style.width).toBe("0%");
  });
  it("takes an explicit accessible label when there is no visible one and can hide the percentage text", () => {
    render(<ProgressBar ariaLabel="متوسط الكتاب" value={30} showValue={false} tone="series-2" />);
    const bar = screen.getByRole("progressbar", { name: "متوسط الكتاب" });
    expect(screen.queryByText("30%")).toBeNull();
    expect(bar.querySelector(".eb-progress-fill.tone-series-2")).toBeTruthy();
  });
});

describe("ChartCard", () => {
  const table = { columns: ["الطالب", "التقدم %"], rows: [["زيد", 40], ["خالد", 90]] as (string | number)[][] };
  it("names the card and the figure after the title and keeps the tabular equivalent behind an aria-expanded disclosure", () => {
    stubMatchMedia(false);
    render(<ChartCard title="تقدّم كل طالب" description="وصف" table={table}><canvas data-testid="c" /></ChartCard>);
    const card = screen.getByRole("region", { name: "تقدّم كل طالب" });
    expect(within(card).getByRole("img", { name: "تقدّم كل طالب" }).querySelector("canvas")).toBeTruthy();
    const toggle = within(card).getByRole("button", { name: "عرض البيانات كجدول" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(card).queryByRole("table")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const tbl = within(card).getByRole("table");
    expect(document.getElementById(toggle.getAttribute("aria-controls") || "")?.contains(tbl)).toBe(true);
    expect(within(tbl).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["الطالب", "التقدم %"]);
    expect(within(tbl).getAllByRole("rowheader").map(h => h.textContent)).toEqual(["زيد", "خالد"]);   // rows rendered verbatim — no transformation
    expect(within(tbl).getAllByRole("cell").map(c => c.textContent)).toEqual(["40", "90"]);
    fireEvent.click(toggle);
    expect(within(card).queryByRole("table")).toBeNull();
    expect(card.getAttribute("data-reduced-motion")).toBe("false");
  });
  it("passes reducedMotion=true to a render-function child when the viewer prefers reduced motion", () => {
    stubMatchMedia(true);
    const child = vi.fn(({ reducedMotion }: { reducedMotion: boolean }) => <span>{reducedMotion ? "no-anim" : "anim"}</span>);
    render(<ChartCard title="t" table={{ columns: ["a"], rows: [] }} defaultTableOpen>{child}</ChartCard>);
    expect(child).toHaveBeenCalledWith({ reducedMotion: true });
    expect(screen.getByText("no-anim")).toBeTruthy();
    expect(screen.getByRole("region", { name: "t" }).getAttribute("data-reduced-motion")).toBe("true");
    expect(screen.getByText("لا توجد بيانات.")).toBeTruthy();                                       // empty table equivalent
  });
  it("works without matchMedia (reducedMotion false) and honours a custom figure name and table label", () => {
    // @ts-expect-error — simulate an environment without matchMedia
    window.matchMedia = undefined;
    render(<ChartCard title="t2" ariaLabel="رسم بياني" tableLabel="الجدول" table={table}>{({ reducedMotion }) => <i>{String(reducedMotion)}</i>}</ChartCard>);
    expect(screen.getByRole("img", { name: "رسم بياني" }).textContent).toBe("false");
    expect(screen.getByRole("button", { name: "الجدول" })).toBeTruthy();
  });
});
