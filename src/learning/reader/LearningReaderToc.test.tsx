// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import LearningReaderToc from "./LearningReaderToc";
import { readerManifest } from "./readerFixtures";

afterEach(cleanup);

function mount(selectedPageId = "p1") {
  const onSelectPage = vi.fn();
  render(<LearningReaderToc manifest={readerManifest} selectedPageId={selectedPageId} activeModuleId="m1" onSelectPage={onSelectPage} idPrefix="desktop" />);
  return { onSelectPage };
}

describe("Phase 3 — reader TOC (manifest-only)", () => {
  it("renders modules → lessons → pages from the manifest and marks the active page", () => {
    mount("p1");
    expect(screen.getByRole("button", { name: "الوحدة الأولى" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "الوحدة الثانية" })).toBeTruthy();
    const active = screen.getByRole("button", { name: "صفحة غنية" });
    expect(active.getAttribute("aria-current")).toBe("page");
    // a non-active page has no aria-current
    expect(screen.getByRole("button", { name: "صفحة ٥" }).getAttribute("aria-current")).toBeNull();
  });

  it("keeps the active module expanded and lets other modules collapse/expand", () => {
    mount("p1");
    const m2 = screen.getByRole("button", { name: "الوحدة الثانية" });
    expect(m2.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "صفحة ٥" })).toBeTruthy();
    fireEvent.click(m2);                                            // collapse m2
    expect(m2.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "صفحة ٥" })).toBeNull();
    // the active module can't be collapsed away
    const m1 = screen.getByRole("button", { name: "الوحدة الأولى" });
    fireEvent.click(m1);
    expect(m1.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "صفحة غنية" })).toBeTruthy();
  });

  it("selecting a page calls back with its pageId; it never issues a network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { onSelectPage } = mount("p1");
    fireEvent.click(screen.getByRole("button", { name: "صفحة ٣" }));
    expect(onSelectPage).toHaveBeenCalledWith("p3");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("Phase 3 — two TOC instances (desktop + mobile) coexist without id collisions", () => {
  it("gives every DOM id a unique value, and each aria-controls resolves to a panel WITHIN its own instance", () => {
    const onSelectPage = vi.fn();
    const { container } = render(
      <>
        <div data-testid="desktop"><LearningReaderToc manifest={readerManifest} selectedPageId="p1" activeModuleId="m1" onSelectPage={onSelectPage} idPrefix="desktop" /></div>
        <div data-testid="mobile"><LearningReaderToc manifest={readerManifest} selectedPageId="p1" activeModuleId="m1" onSelectPage={onSelectPage} idPrefix="mobile" /></div>
      </>,
    );
    // 1) every id in the DOM is globally unique
    const ids = Array.from(container.querySelectorAll("[id]")).map(el => el.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);

    // 2) each module button's aria-controls points to an EXISTING panel inside the SAME instance
    for (const scope of ["desktop", "mobile"] as const) {
      const root = screen.getByTestId(scope);
      for (const btn of root.querySelectorAll<HTMLElement>(".learning-reader-toc-modbtn")) {
        const target = btn.getAttribute("aria-controls")!;
        expect(target).toContain("learning-reader-toc-" + scope + "-");
        const panel = document.getElementById(target);
        expect(panel).toBeTruthy();
        expect(root.contains(panel)).toBe(true);           // resolves within its own instance, not the other
      }
    }

    // 3) one navigation authority: a page button in EITHER instance calls the same onSelectPage
    const mobile = screen.getByTestId("mobile");
    fireEvent.click(within(mobile).getByRole("button", { name: "صفحة ٣" }));
    expect(onSelectPage).toHaveBeenCalledWith("p3");
  });
});
