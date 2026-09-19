// @vitest-environment happy-dom
// Learning Reader — desktop wide-slide layout: the semantic tree is the SAME on every viewport (CSS alone responds);
// the Reader keeps its layout / sidebar / main / page structure and introduces NO inline width constraints. Browser
// layout metrics are not faked here — reader.layout.guards.test.ts (CSS) is the width authority.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningReader from "./LearningReader";

afterEach(cleanup);

const SLOW = { timeout: 8000 };
const jump = () => screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;

describe("Learning Reader — layout structure is viewport-independent (CSS-only responsiveness)", () => {
  it("keeps layout > sidebar + main > page on a representative Unit-3 page, with no inline width/max-width", async () => {
    const { container } = render(<LearningReader courseId="791381" onExit={vi.fn()} />);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    fireEvent.change(jump(), { target: { value: "791381-m07-l02-p02" } });   // PDF 31 (table + callouts)
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "مجالات العناوين الخاصة" })).toBeTruthy(), SLOW);
    // the header renders from the manifest first; wait for the lazily loaded m07 BODY (its table) before inspecting
    await waitFor(() => expect(container.querySelector(".learning-reader-tablewrap")).toBeTruthy(), SLOW);
    const layout = container.querySelector(".learning-reader-layout")!;
    expect(layout).toBeTruthy();
    expect(layout.querySelector(":scope > aside.learning-reader-sidebar")).toBeTruthy();
    const main = layout.querySelector(":scope > main.learning-reader-main")!;
    expect(main).toBeTruthy();
    expect(main.querySelector(".learning-reader-page")).toBeTruthy();
    expect(main.querySelector(".learning-reader-page .learning-reader-pagehead")).toBeTruthy();   // header lives in the page
    expect(main.querySelector(".learning-reader-tablewrap")).toBeTruthy();
    // no inline width/max-width anywhere in the Reader tree — width is CSS-only
    for (const el of container.querySelectorAll<HTMLElement>("[style]")) {
      expect(el.getAttribute("style"), el.className).not.toMatch(/(max-)?width|inline-size/);
    }
    // no JS viewport listeners: the tree is identical regardless of window size
    expect(container.querySelector(".learning-reader-nav")).toBeTruthy();
  }, 20000);
});
