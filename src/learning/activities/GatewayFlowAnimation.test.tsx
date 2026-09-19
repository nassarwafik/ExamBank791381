// @vitest-environment happy-dom
// Units 4–6 — animation/gateway-flow/v1 (the first animation renderer): resolves by exact identity, lazy-loads, offers
// the two destinations as keyboard-usable radios, animates step by step with a TEXT mirror of every hop (never
// motion-only), shows the local path (PC1 → Switch → PC2, never through the gateway) versus the outside path
// (PC1 → Switch → Router (البوابة) → الإنترنت), honours the shell's replay + reset, renders the final state at once
// under reduced motion, degrades on malformed config, no network.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { AnimationBlock } from "../content/types";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const block: AnimationBlock = {
  id: "gw1", type: "animation", origin: "teacher-enrichment", animationType: "gateway-flow", version: 1,
  title: "كل ما يخرج من الشبكة يمرّ عبر البوابة", source: { kind: "book", sourceId: "791381", pdfPageStart: 45 },
  capabilities: { fullscreen: true, replay: true, reset: true, animated: true },
  fallback: { text: "الشبكة المحلية ← Router وهو البوابة الافتراضية 192.168.1.1 ← الإنترنت." },
  config: {
    sender: { label: "PC1", address: "192.168.1.10" }, local: { label: "PC2", address: "192.168.1.20" }, switchLabel: "Switch",
    router: { label: "Router", role: "البوابة الافتراضية", address: "192.168.1.1" }, outside: { label: "الإنترنت" },
    localCaption: "الوجهة في نفس الشبكة المحلية: البيانات تمرّ عبر Switch ولا تحتاج البوابة.",
    outsideCaption: "الوجهة خارج الشبكة: البيانات تخرج عبر الراوتر — البوابة الافتراضية — إلى الإنترنت.",
  },
};
const steps = () => [...document.querySelectorAll(".learning-gateway-step")].map(li => [li.textContent, li.classList.contains("is-done")]);
/** Advance `n` hops: one timer per hop (each fires, React commits, the effect arms the next). */
const hops = async (n: number) => { for (let i = 0; i < n; i++) await act(async () => { vi.advanceTimersByTime(700); }); };

describe("registry identity", () => {
  it("resolves animation/gateway-flow/v1 only", () => {
    expect(productionActivityRegistry.resolve(block)?.key).toBe("gateway-flow");
    expect(productionActivityRegistry.resolve({ ...block, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...block, animationType: "packet" })).toBeUndefined();
  });
});

describe("behaviour", () => {
  it("local destination: the text steps are PC1 → Switch → PC2 (no gateway); the packet advances one hop per tick; the local caption ends the run", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<LearningActivityHost block={block} courseId="791381" />);
    await waitFor(() => { if (!container.querySelector(".learning-gateway")) throw new Error("not yet"); });
    vi.useFakeTimers();                                                              // only the hop timer is faked (after the lazy load)
    expect(screen.getByRole("radio", { name: "جهاز في نفس الشبكة (PC2)" }).getAttribute("aria-checked")).toBe("true");
    expect(steps()).toEqual([["1PC1 ← Switch", false], ["2Switch ← PC2", false]]);
    expect(container.querySelector(".learning-gateway-packet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "أرسل البيانات" }));
    expect(container.querySelector(".learning-gateway-packet")).toBeTruthy();
    expect(steps()).toEqual([["1PC1 ← Switch", false], ["2Switch ← PC2", false]]);
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(steps()).toEqual([["1PC1 ← Switch", true], ["2Switch ← PC2", false]]);
    await act(async () => { vi.advanceTimersByTime(700); });
    expect(steps()).toEqual([["1PC1 ← Switch", true], ["2Switch ← PC2", true]]);
    expect(screen.getByRole("status").textContent).toContain("لا تحتاج البوابة");
    expect(container.querySelector(".learning-gateway-node.is-router.is-current")).toBeNull();   // the gateway never lit up
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("outside destination: PC1 → Switch → Router (البوابة الافتراضية) → الإنترنت, the gateway address is shown, the outside caption ends the run; replay restarts; reset clears", async () => {
    const emit = vi.fn();
    const { container } = render(<LearningActivityHost block={block} courseId="791381" emit={emit} />);
    await waitFor(() => { if (!container.querySelector(".learning-gateway")) throw new Error("not yet"); });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("radio", { name: "الإنترنت (خارج الشبكة)" }));
    expect(steps().map(s => s[0])).toEqual(["1PC1 ← Switch", "2Switch ← Router (البوابة الافتراضية)", "3Router ← الإنترنت"]);
    expect(container.textContent).toContain("192.168.1.1");
    fireEvent.click(screen.getByRole("button", { name: "أرسل البيانات" }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ name: "gateway-send", detail: { destination: "outside" } }));
    await hops(3);
    expect(steps().every(s => s[1])).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("تخرج عبر الراوتر");
    fireEvent.click(screen.getByRole("button", { name: "إعادة التشغيل" }));
    expect(steps().some(s => s[1])).toBe(false);                                      // restarted from hop 0
    expect(screen.queryByRole("status")).toBeNull();
    await hops(3);
    expect(steps().every(s => s[1])).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    expect(screen.getByRole("radio", { name: "جهاز في نفس الشبكة (PC2)" }).getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector(".learning-gateway-packet")).toBeNull();
    expect(screen.getByText("اختر الوجهة ثم اضغط «أرسل البيانات».")).toBeTruthy();
  });

  it("reduced motion: sending renders the FINAL state immediately (no timers), text steps all done", async () => {
    const mql = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    const orig = window.matchMedia; (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
    try {
      const { container } = render(<LearningActivityHost block={block} courseId="791381" />);
      await waitFor(() => { if (!container.querySelector(".learning-gateway")) throw new Error("not yet"); });
      expect(container.querySelector(".learning-gateway")!.getAttribute("data-reduced-motion")).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "أرسل البيانات" }));
      expect(steps().every(s => s[1])).toBe(true);
      expect(screen.getByRole("status").textContent).toContain("لا تحتاج البوابة");
    } finally { (window as unknown as { matchMedia: unknown }).matchMedia = orig; }
  });

  it("malformed config → in-stage note; unsupported version → the faithful static fallback text", async () => {
    const { container, unmount } = render(<LearningActivityHost block={{ ...block, config: {} }} courseId="791381" />);
    await waitFor(() => { if (!container.querySelector(".learning-gateway-empty")) throw new Error("not yet"); });
    unmount();
    render(<LearningActivityHost block={{ ...block, version: 3 }} courseId="791381" />);
    expect(screen.getByText(/البوابة الافتراضية 192.168.1.1/)).toBeTruthy();
  });
});
