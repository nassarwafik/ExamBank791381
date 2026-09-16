// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import IconButton from "./IconButton";
import Breadcrumb from "./Breadcrumb";
import PageHeader from "./PageHeader";
import VisuallyHidden from "./VisuallyHidden";

afterEach(cleanup);

describe("UX-2 primitives", () => {
  it("IconButton: enforced accessible name, tooltip, native button, keyboard-focusable", () => {
    const onClick = vi.fn();
    render(<IconButton label="القائمة" icon={<svg data-testid="i" />} onClick={onClick} aria-expanded={false} />);
    const b = screen.getByRole("button", { name: "القائمة" });
    expect(b.tagName).toBe("BUTTON");
    expect(b.getAttribute("type")).toBe("button");
    expect(b.getAttribute("title")).toBe("القائمة");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(b.tabIndex).toBeGreaterThanOrEqual(0);
    b.focus(); expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b, { key: "Enter" }); fireEvent.click(b);
    expect(onClick).toHaveBeenCalled();
  });
  it("VisuallyHidden keeps text in the accessibility tree (never display:none)", () => {
    render(<button type="button"><VisuallyHidden>الاسم المخفي</VisuallyHidden></button>);
    expect(screen.getByRole("button", { name: "الاسم المخفي" })).toBeTruthy();
    expect(document.querySelector(".eb-visually-hidden")?.textContent).toBe("الاسم المخفي");
  });
  it("Breadcrumb: nav landmark, ancestors as buttons, last item aria-current=page", () => {
    const back = vi.fn();
    render(<Breadcrumb items={[{ label: "المشاريع", onSelect: back }, { label: "مشروع 899373" }]} />);
    const nav = screen.getByRole("navigation", { name: "مسار الصفحة" });
    expect(nav.querySelectorAll("li").length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "المشاريع" }));
    expect(back).toHaveBeenCalledTimes(1);
    const current = nav.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("مشروع 899373");
    expect(nav.querySelectorAll('[aria-current="page"]').length).toBe(1);
  });
  it("PageHeader: exactly one h1; breadcrumb only when there is an ancestor", () => {
    const { rerender } = render(<PageHeader title="لوحة المتابعة" breadcrumb={[{ label: "لوحة المتابعة" }]} />);
    expect(screen.getAllByRole("heading", { level: 1 }).length).toBe(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("لوحة المتابعة");
    expect(screen.queryByRole("navigation", { name: "مسار الصفحة" })).toBeNull();
    rerender(<PageHeader title="باني الامتحان" breadcrumb={[{ label: "بنك الامتحانات" }, { label: "باني الامتحان" }]} leading={<span data-testid="lead" />} />);
    expect(screen.getByRole("navigation", { name: "مسار الصفحة" })).toBeTruthy();
    expect(screen.getByTestId("lead")).toBeTruthy();
  });
});
