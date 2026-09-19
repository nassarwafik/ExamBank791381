// @vitest-environment happy-dom
// Batch 5 — interactive-diagram/tcp-handshake/v1: exact identity, lazy load, deterministic step-through of the book's
// three steps (next / previous reveal one arrow + one text line at a time, summary after the last), counter, reset,
// reduced-motion attribute, malformed config → note, unsupported version → text fallback, no fetch.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { InteractiveDiagramBlock } from "../content/types";

afterEach(() => { cleanup(); });

const block: InteractiveDiagramBlock = {
  id: "hs1", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "tcp-handshake", version: 1,
  title: "تتبّع خطوات المصافحة الثلاثية", source: { kind: "book", sourceId: "791381", pdfPageStart: 118 },
  capabilities: { fullscreen: true, reset: true, interactive: true },
  fallback: { text: "المصافحة الثلاثية في TCP: 1) SYN 2) SYN-ACK 3) ACK." },
  config: {
    first: "الجهاز الأول", second: "الجهاز الثاني",
    steps: [
      { label: "SYN", from: "first", text: "الجهاز الأول يطلب بدء الاتصال." },
      { label: "SYN-ACK", from: "second", text: "الجهاز الثاني يوافق ويردّ." },
      { label: "ACK", from: "first", text: "الجهاز الأول يؤكّد، ثم يبدأ تبادل البيانات." },
    ],
    summary: "الطرفان يتأكّدان أن الاتصال جاهز قبل إرسال البيانات الفعلية.",
    nextLabel: "الخطوة التالية", prevLabel: "الخطوة السابقة", startHint: "لم تبدأ المصافحة بعد.",
  },
};
const mount = async (b: InteractiveDiagramBlock = block) => { const r = render(<LearningActivityHost block={b} courseId="791381" />); await waitFor(() => { if (!r.container.querySelector(".learning-handshake")) throw new Error("not yet"); }); return r; };
const next = () => fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
const prev = () => fireEvent.click(screen.getByRole("button", { name: "الخطوة السابقة" }));
const visibleSteps = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".learning-handshake-step")].filter(g => g.style.display !== "none").length;
const lines = () => [...document.querySelectorAll(".learning-handshake-line")].map(li => li.textContent);

describe("registry identity", () => {
  it("resolves interactive-diagram/tcp-handshake/v1 only", () => {
    expect(productionActivityRegistry.resolve(block)?.key).toBe("tcp-handshake");
    expect(productionActivityRegistry.resolve({ ...block, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...block, interactionType: "handshake" })).toBeUndefined();
  });
});

describe("behaviour", () => {
  it("starts with no step shown (hint text, counter 0 / 3, previous disabled); each «الخطوة التالية» reveals ONE arrow and ONE text line in book order; the summary appears only after the third; no fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = await mount();
    const c = container as HTMLElement;
    expect(visibleSteps(c)).toBe(0);
    expect(screen.getByText("لم تبدأ المصافحة بعد.")).toBeTruthy();
    expect(c.querySelector(".learning-handshake-counter")!.textContent).toBe("0 / 3");
    expect((screen.getByRole("button", { name: "الخطوة السابقة" }) as HTMLButtonElement).disabled).toBe(true);
    expect(c.querySelectorAll(".learning-handshake-device").length).toBe(2);
    next();
    expect(visibleSteps(c)).toBe(1);
    expect(lines()).toEqual(["SYN — الجهاز الأول: الجهاز الأول يطلب بدء الاتصال."]);
    expect(document.querySelector(".learning-handshake-summary")).toBeNull();
    next();
    expect(visibleSteps(c)).toBe(2);
    expect(lines()[1]).toBe("SYN-ACK — الجهاز الثاني: الجهاز الثاني يوافق ويردّ.");
    next();
    expect(visibleSteps(c)).toBe(3);
    expect(lines()[2]).toBe("ACK — الجهاز الأول: الجهاز الأول يؤكّد، ثم يبدأ تبادل البيانات.");
    expect(document.querySelector(".learning-handshake-summary")!.textContent).toBe("الطرفان يتأكّدان أن الاتصال جاهز قبل إرسال البيانات الفعلية.");
    expect((screen.getByRole("button", { name: "الخطوة التالية" }) as HTMLButtonElement).disabled).toBe(true);
    expect(c.querySelector(".learning-handshake-counter")!.textContent).toBe("3 / 3");
    expect(c.querySelector("svg")!.getAttribute("aria-label")).toContain("2 SYN-ACK");
    expect(screen.getByRole("status").textContent).not.toMatch(/[←→⇐⇒]/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("«الخطوة السابقة» hides the last revealed step; shell reset returns to zero", async () => {
    const { container } = await mount();
    const c = container as HTMLElement;
    next(); next(); next();
    prev();
    expect(visibleSteps(c)).toBe(2);
    expect(document.querySelector(".learning-handshake-summary")).toBeNull();
    expect(lines().length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    expect(visibleSteps(c)).toBe(0);
    expect(c.querySelector(".learning-handshake")!.getAttribute("data-shown")).toBe("0");
    expect(screen.getByText("لم تبدأ المصافحة بعد.")).toBeTruthy();
  });

  it("arrows point from the sender: first-device steps go rightwards, second-device steps leftwards (from config, never inferred from position)", async () => {
    const { container } = await mount();
    next(); next();
    const steps = [...container.querySelectorAll<SVGGElement>(".learning-handshake-step")];
    const x1 = (g: SVGGElement) => Number(g.querySelector("line")!.getAttribute("x1"));
    const x2 = (g: SVGGElement) => Number(g.querySelector("line")!.getAttribute("x2"));
    expect(x2(steps[0]) > x1(steps[0])).toBe(true);   // SYN from first → right
    expect(x2(steps[1]) < x1(steps[1])).toBe(true);   // SYN-ACK from second → left
  });

  it("reduced motion is reflected as a data attribute; malformed config (fewer than two valid steps / bad `from` / non-object) → note; unsupported version → text fallback", async () => {
    const mql = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    const orig = window.matchMedia; (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
    try {
      const { container, unmount } = await mount();
      expect(container.querySelector(".learning-handshake")!.getAttribute("data-reduced-motion")).toBe("true");
      unmount();
    } finally { (window as unknown as { matchMedia: unknown }).matchMedia = orig; }
    for (const config of [{ steps: [] }, { steps: [{ label: "SYN", from: "first", text: "x" }] }, { steps: [{ label: "SYN", from: "third", text: "x" }, { label: "ACK", from: "nobody", text: "y" }] }, { steps: "x" }, undefined]) {
      const { container, unmount } = render(<LearningActivityHost block={{ ...block, config }} courseId="791381" />);
      await waitFor(() => { if (!container.querySelector(".learning-handshake-empty")) throw new Error("not yet"); });
      expect(container.querySelector(".learning-handshake-btn")).toBeNull();
      unmount();
    }
    render(<LearningActivityHost block={{ ...block, version: 7 }} courseId="791381" />);
    expect(screen.getByText(/SYN-ACK 3\) ACK/)).toBeTruthy();
    expect(document.querySelector(".learning-handshake")).toBeNull();
  });
});
