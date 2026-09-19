// @vitest-environment happy-dom
// Units 4–6 — interactive-diagram/network-topologies/v1: exact identity, lazy load, six keyboard-usable forms; selecting
// a form redraws it (Bus shared line, Ring closed path with direction arrows, Star obvious centre, Tree labelled levels,
// Hybrid = Star joined to a Bus); «أرسل» highlights the path hop by hop with a text mirror; Bus offers the book's
// conceptual collision; reset; reduced motion = final path at once; malformed config → note; version → text fallback.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { InteractiveDiagramBlock } from "../content/types";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const block: InteractiveDiagramBlock = {
  id: "topo1", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "network-topologies", version: 1,
  title: "استكشف أشكال الشبكات", source: { kind: "book", sourceId: "791381", pdfPageStart: 60 },
  capabilities: { fullscreen: true, reset: true, animated: true },
  fallback: { text: "P2P: جهازان بكابل مباشر. Bus: خط واحد مشترك. Ring: دائرة مغلقة. Star: جهاز مركزي. Tree: مستويات. Hybrid: دمج." },
  config: {
    topologies: [
      { id: "p2p", name: "P2P", title: "نقطة لنقطة", description: "جهازان يتواصلان مباشرة بدون جهاز وسيط." },
      { id: "bus", name: "Bus", title: "الناقل المشترك", description: "خط واحد مشترك بين الأجهزة." },
      { id: "ring", name: "Ring", title: "الحلقة", description: "دائرة مغلقة والبيانات باتجاه محدّد." },
      { id: "star", name: "Star", title: "النجمي", description: "كل الأجهزة تتصل بجهاز مركزي مثل Switch." },
      { id: "tree", name: "Tree", title: "الشجري", description: "شبكة على شكل مستويات." },
      { id: "hybrid", name: "Hybrid", title: "المختلط", description: "دمج أكثر من نوع (Star + Bus)." },
    ],
    centerLabel: "Switch", collisionLabel: "تصادم Collision", collisionNote: "أرسل جهازان في نفس الوقت على الخط المشترك، فتصادمت البيانات.",
  },
};
const mount = async () => { const r = render(<LearningActivityHost block={block} courseId="791381" />); await waitFor(() => { if (!r.container.querySelector(".learning-topo")) throw new Error("not yet"); }); return r; };
const pick = (name: string) => fireEvent.click(screen.getByRole("radio", { name: new RegExp("^" + name + " ") }));
const stepTexts = () => [...document.querySelectorAll(".learning-topo-step")].map(li => li.textContent);
const hops = async (n: number) => { for (let i = 0; i < n; i++) await act(async () => { vi.advanceTimersByTime(650); }); };

describe("registry identity", () => {
  it("resolves interactive-diagram/network-topologies/v1 only", () => {
    expect(productionActivityRegistry.resolve(block)?.key).toBe("network-topologies");
    expect(productionActivityRegistry.resolve({ ...block, version: 2 })).toBeUndefined();
  });
});

describe("behaviour", () => {
  it("six real radio buttons in book order; each selection redraws its distinctive shape (data-topology + structural markers)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = await mount();
    const radios = screen.getAllByRole("radio");
    expect(radios.map(r => r.querySelector(".learning-topo-tab-name")?.textContent)).toEqual(["P2P", "Bus", "Ring", "Star", "Tree", "Hybrid"]);
    expect(radios.every(r => r.tagName === "BUTTON")).toBe(true);
    radios[1].focus(); expect(document.activeElement).toBe(radios[1]);
    const root = () => container.querySelector(".learning-topo")!;
    expect(root().getAttribute("data-topology")).toBe("p2p");
    expect(container.querySelectorAll(".learning-topo-node").length).toBe(2);
    pick("Bus");
    expect(root().getAttribute("data-topology")).toBe("bus");
    expect(container.querySelector(".learning-topo-bus")).toBeTruthy();                                  // the shared line
    expect(container.querySelectorAll(".learning-topo-node.is-pc").length).toBe(4);
    pick("Ring");
    expect(container.querySelectorAll(".learning-topo-edge.is-ring").length).toBe(4);                    // closed circular path
    expect(container.querySelector("marker#learning-topo-arrow")).toBeTruthy();                           // direction arrows
    pick("Star");
    expect(container.querySelectorAll(".learning-topo-node.is-device").length).toBe(1);                  // the obvious centre
    expect(container.querySelector(".learning-topo-node.is-device .learning-topo-label")?.textContent).toBe("Switch");
    expect(container.querySelectorAll(".learning-topo-edge").length).toBe(4);
    pick("Tree");
    expect([...container.querySelectorAll(".learning-topo-level")].map(t => t.textContent)).toEqual(["المستوى 1", "المستوى 2", "المستوى 3"]);
    expect(container.querySelectorAll(".learning-topo-node.is-device").length).toBe(3);
    pick("Hybrid");
    expect(container.querySelector(".learning-topo-bus")).toBeTruthy();                                  // a Bus segment…
    expect(container.querySelectorAll(".learning-topo-node.is-device").length).toBe(1);                  // …joined to a Star centre
    expect(screen.getByText("دمج أكثر من نوع (Star + Bus).")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("«أرسل» in Star: A → Switch → D, one hop per tick, text mirror + result sentence; selecting another form clears the run", async () => {
    const { container } = await mount();
    pick("Star");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "أرسل" }));
    expect(stepTexts()).toEqual(["1من A إلى Switch", "2من Switch إلى D"]);
    await hops(2);
    expect([...container.querySelectorAll(".learning-topo-step.is-done")].length).toBe(2);
    expect(screen.getByRole("status").textContent).toBe("وصلت البيانات من A إلى D عبر خطوتين.");
    // Semantic direction: sender first, receiver second, chained A → Switch → D; no arrow glyphs in the mirror.
    const pairs = stepTexts().map(t => /^\d+من (.+) إلى (.+)$/.exec(t)!.slice(1, 3));
    expect(pairs).toEqual([["A", "Switch"], ["Switch", "D"]]);
    expect(stepTexts().join(" ")).not.toMatch(/[←→]/);
    pick("Ring");
    expect(screen.queryByRole("status")).toBeNull();
    expect(stepTexts()).toEqual([]);
  });

  it("Bus: the collision demo marks the shared line and explains; «أرسل» alone travels A → الخط المشترك → C; reset returns to P2P", async () => {
    const { container } = await mount();
    pick("Bus");
    fireEvent.click(screen.getByRole("button", { name: "أرسل جهازين معًا" }));
    expect(container.querySelector(".learning-topo-collision-mark")).toBeTruthy();
    expect(container.textContent).toContain("تصادم Collision");
    expect(screen.getByRole("status").textContent).toContain("فتصادمت البيانات");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "أرسل" }));
    expect(container.querySelector(".learning-topo-collision-mark")).toBeNull();
    expect(stepTexts()).toEqual(["1من A إلى الخط المشترك", "2من الخط المشترك إلى C"]);
    await hops(2);
    expect(container.querySelector(".learning-topo-bus.is-on")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    expect(container.querySelector(".learning-topo")!.getAttribute("data-topology")).toBe("p2p");
    expect(screen.queryByRole("button", { name: "أرسل جهازين معًا" })).toBeNull();                       // Bus-only control gone
  });

  it("reduced motion: the whole path is highlighted immediately; malformed config → note; unsupported version → text fallback", async () => {
    const mql = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    const orig = window.matchMedia; (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
    try {
      const { container, unmount } = await mount();
      pick("Tree");
      fireEvent.click(screen.getByRole("button", { name: "أرسل" }));
      expect([...container.querySelectorAll(".learning-topo-step.is-done")].length).toBe(4);
      expect(screen.getByRole("status").textContent).toContain("عبر 4 خطوات");
      unmount();
    } finally { (window as unknown as { matchMedia: unknown }).matchMedia = orig; }
    const { container, unmount } = render(<LearningActivityHost block={{ ...block, config: { topologies: [] } }} courseId="791381" />);
    await waitFor(() => { if (!container.querySelector(".learning-topo-empty")) throw new Error("not yet"); });
    unmount();
    render(<LearningActivityHost block={{ ...block, version: 7 }} courseId="791381" />);
    expect(screen.getByText(/Hybrid: دمج/)).toBeTruthy();
  });
});
