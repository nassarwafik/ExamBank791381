// @vitest-environment happy-dom
// The `visual` block renderer: a trusted registry-resolved SVG in a semantic <figure>, an accessible name on the
// SVG, quiet title/caption chrome, a faithful fallback for an unknown key, reduced-motion gating, and NO network.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import VisualBlockView from "./VisualBlockView";
import type { VisualBlock } from "../content/types";

afterEach(cleanup);

const base: VisualBlock = {
  id: "v1", type: "visual", origin: "teacher-enrichment",
  visualId: "791381/ch1/network-connected-devices",
  alt: "رسم يبيّن أجهزة متصلة بشبكة مركزية.",
  title: "رسم توضيحي: الشبكة أجهزة متصلة",
  caption: "تتبادل الأجهزة المعلومات عبر الشبكة.",
  motion: true,
};

function setMatchMedia(reduced: boolean) {
  const mql = { matches: reduced, media: "(prefers-reduced-motion: reduce)", addEventListener() {}, removeEventListener() {} };
  (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
}

describe("VisualBlockView", () => {
  it("renders a figure with title, caption, and an SVG carrying the accessible name; no network", () => {
    setMatchMedia(false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<VisualBlockView block={base} />);
    expect(screen.getByText("رسم توضيحي: الشبكة أجهزة متصلة")).toBeTruthy();
    expect(screen.getByText("تتبادل الأجهزة المعلومات عبر الشبكة.")).toBeTruthy();
    const img = screen.getByRole("img", { name: base.alt });
    expect(img.tagName.toLowerCase()).toBe("svg");
    expect(img.getAttribute("viewBox")).toBeTruthy();
    // no external asset references
    expect(container.querySelector("img")).toBeNull();
    // the only http(s) token allowed is the SVG xmlns namespace declaration — never a src/href to a remote asset
    expect(container.querySelector("[src]")).toBeNull();
    expect(container.innerHTML).not.toMatch(/(?:src|href)=["'`]https?:/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("figure semantics: with both title and caption, exactly ONE <figcaption> exists (title is a <p>), both render, and the SVG keeps the alt as its accessible name", () => {
    setMatchMedia(false);
    const { container } = render(<VisualBlockView block={base} />);
    const fig = container.querySelector("figure")!;
    expect(fig.querySelectorAll("figcaption").length).toBe(1);
    // the single figcaption is the bottom explanatory caption
    expect(fig.querySelector("figcaption")!.textContent).toBe("تتبادل الأجهزة المعلومات عبر الشبكة.");
    // the title renders as a plain paragraph, not a figcaption
    const title = container.querySelector("p.eb-visual-title")!;
    expect(title.tagName.toLowerCase()).toBe("p");
    expect(title.textContent).toBe("رسم توضيحي: الشبكة أجهزة متصلة");
    // accessible name is the block alt (on the SVG), never duplicated by the caption
    expect(screen.getByRole("img", { name: base.alt }).tagName.toLowerCase()).toBe("svg");
  });

  it("motion ON: renders the traveling SMIL pulses", () => {
    setMatchMedia(false);
    const { container } = render(<VisualBlockView block={base} />);
    expect(container.querySelectorAll("animateMotion").length).toBeGreaterThan(0);
  });

  it("reduced motion: still renders the SVG + labels but omits ALL animateMotion (no broken frame)", () => {
    setMatchMedia(true);
    const { container } = render(<VisualBlockView block={base} />);
    expect(screen.getByRole("img", { name: base.alt })).toBeTruthy();
    expect(container.querySelectorAll("animateMotion").length).toBe(0);
    // structural labels survive the still frame
    expect(container.textContent).toContain("شبكة");
  });

  it("unknown visualId: renders the faithful 'قيد الإعداد' fallback with the alt as accessible name (never blank)", () => {
    setMatchMedia(false);
    const bad: VisualBlock = { ...base, visualId: "791381/ch1/nope" };
    render(<VisualBlockView block={bad} />);
    const img = screen.getByRole("img", { name: base.alt });
    expect(img.textContent).toContain("قيد الإعداد");
    expect(img.classList.contains("eb-visual-missing")).toBe(true);
    // no real illustration SVG rendered (only the small inline warning icon)
    expect(img.querySelector("svg.eb-visual")).toBeNull();
  });

  it("optional chrome: title and caption are omitted cleanly when absent", () => {
    setMatchMedia(false);
    const bare: VisualBlock = { id: "v2", type: "visual", origin: "teacher-enrichment", visualId: base.visualId, alt: base.alt };
    const { container } = render(<VisualBlockView block={bare} />);
    expect(container.querySelector(".eb-visual-title")).toBeNull();
    expect(container.querySelector(".eb-visual-caption")).toBeNull();
    expect(screen.getByRole("img", { name: base.alt })).toBeTruthy();
  });
});
