// @vitest-environment happy-dom
// Units 4–6 — simulation/hub-switch-router-flow/v1 (the first simulation renderer): exact identity, lazy load, three
// keyboard-usable modes; Hub delivers to every attached device (only the target «يستعملها»), Switch to the target only
// (others «لا تصله»), Router carries the message from شبكة 1 to the target in شبكة 2; a text mirror of hops + word
// outcomes (never colour-only); changing the mode clears the run (no stale state); replay/reset; reduced motion renders
// the final state at once; malformed config → note; unsupported version → text fallback; no network.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { SimulationBlock } from "../content/types";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const block: SimulationBlock = {
  id: "dev1", type: "simulation", origin: "teacher-enrichment", simulationType: "hub-switch-router-flow", version: 1,
  title: "جرّب: كيف يرسل كل جهاز البيانات؟", source: { kind: "book", sourceId: "791381", pdfPageStart: 49 },
  capabilities: { fullscreen: true, reset: true, replay: true, animated: true },
  fallback: { text: "Hub: يرسل البيانات إلى جميع الأجهزة. Switch: للمقصود فقط. Router: بين شبكتين." },
  config: {
    sender: "PC1", target: "PC3", others: ["PC2", "PC4"],
    hub: { label: "Hub", caption: "Hub يرسل للجميع." }, switch: { label: "Switch", caption: "Switch يرسل للمقصود فقط." },
    router: { label: "Router", networks: ["شبكة 1", "شبكة 2"], outside: "الإنترنت", caption: "Router يربط بين شبكات مختلفة." },
    useLabel: "يستعملها", ignoreLabel: "يتجاهلها", notReachedLabel: "لا تصله", targetLabel: "المقصود",
  },
};
const outcomes = () => [...document.querySelectorAll(".learning-devices-outcomes li")].map(li => li.textContent);
const hops = async (n: number) => { for (let i = 0; i < n; i++) await act(async () => { vi.advanceTimersByTime(700); }); };
/** Parses the aria-live text mirror into [sender, receiver] pairs, asserting each hop's receiver is the next hop's
 *  sender and that no arrow glyph is used (the direction must be carried by the words «من … إلى …» alone). */
const chain = (root: HTMLElement) => {
  const texts = [...root.querySelectorAll(".learning-devices-step")].map(li => li.textContent || "");
  expect(texts.join(" ")).not.toMatch(/[←→]/);
  const hops = texts.map(t => /^\d+من (.+?) إلى (.+?)(?: \(.*\)| فقط)?$/.exec(t)!.slice(1, 3));
  for (let i = 1; i < hops.length; i++) expect(hops[i][0]).toBe(hops[i - 1][1]);
  return hops;
};
const mount = async () => { const r = render(<LearningActivityHost block={block} courseId="791381" />); await waitFor(() => { if (!r.container.querySelector(".learning-devices")) throw new Error("not yet"); }); return r; };

describe("registry identity", () => {
  it("resolves simulation/hub-switch-router-flow/v1 only", () => {
    expect(productionActivityRegistry.resolve(block)?.key).toBe("hub-switch-router-flow");
    expect(productionActivityRegistry.resolve({ ...block, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...block, simulationType: "ethernet" })).toBeUndefined();
  });
});

describe("behaviour", () => {
  it("Hub: every attached device receives the frame; only PC3 «يستعملها», PC2/PC4 «يتجاهلها»; steps mirrored as text", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = await mount();
    const modes = screen.getAllByRole("radio");
    expect(modes.map(m => m.textContent)).toEqual(["Hub", "Switch", "Router"]);
    expect(modes.every(m => m.tagName === "BUTTON")).toBe(true);
    modes[0].focus(); expect(document.activeElement).toBe(modes[0]);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "أرسل البيانات" }));
    await hops(2);
    expect(container.querySelectorAll(".learning-devices-node.is-reached").length).toBe(3);                // all three others
    expect(outcomes()).toEqual(["PC3: يستعملها", "PC2: يتجاهلها", "PC4: يتجاهلها"]);
    expect(screen.getByRole("status").textContent).toContain("Hub يرسل للجميع.");
    expect([...container.querySelectorAll(".learning-devices-step.is-done")].map(li => li.textContent)).toEqual(["1من PC1 إلى Hub", "2من Hub إلى جميع الأجهزة (PC3، PC2، PC4)"]);
    expect(chain(container)).toEqual([["PC1", "Hub"], ["Hub", "جميع الأجهزة"]]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Switch: only PC3 receives (المقصود); PC2/PC4 «لا تصله»; switching mode mid-run clears the run (no stale outcome)", async () => {
    const { container } = await mount();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "أرسل البيانات" }));   // start a Hub run…
    await hops(1);
    fireEvent.click(screen.getByRole("radio", { name: "Switch" }));            // …then change the mode
    expect(container.querySelector(".learning-devices-packet")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("اختر الجهاز ثم اضغط «أرسل البيانات».")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "أرسل البيانات" }));
    await hops(2);
    expect(container.querySelectorAll(".learning-devices-node.is-reached").length).toBe(1);
    expect(outcomes()).toEqual(["PC3: المقصود", "PC2: لا تصله", "PC4: لا تصله"]);
    expect(screen.getByRole("status").textContent).toContain("Switch يرسل للمقصود فقط.");
    // Text mirror, semantic direction: sender first, receiver second — PC1 → Switch → PC3 only; no arrow glyphs.
    expect([...container.querySelectorAll(".learning-devices-step")].map(li => li.textContent)).toEqual(["1من PC1 إلى Switch", "2من Switch إلى PC3 فقط"]);
    expect(chain(container)).toEqual([["PC1", "Switch"], ["Switch", "PC3"]]);
  });

  it("Router: PC1 (شبكة 1) → Switch → Router → Switch (شبكة 2) → PC3; the two networks and the Internet are drawn; replay restarts; reset returns to Hub", async () => {
    const emit = vi.fn();
    const r = render(<LearningActivityHost block={block} courseId="791381" emit={emit} />);
    await waitFor(() => { if (!r.container.querySelector(".learning-devices")) throw new Error("not yet"); });
    fireEvent.click(screen.getByRole("radio", { name: "Router" }));
    expect(r.container.querySelectorAll(".learning-devices-lan").length).toBe(2);
    expect(r.container.textContent).toContain("الإنترنت");
    expect([...r.container.querySelectorAll(".learning-devices-step")].map(li => li.textContent)).toEqual(["1من PC1 إلى Switch (شبكة 1)", "2من Switch إلى Router", "3من Router إلى Switch (شبكة 2)", "4من Switch إلى PC3"]);
    expect(chain(r.container)).toEqual([["PC1", "Switch"], ["Switch", "Router"], ["Router", "Switch"], ["Switch", "PC3"]]);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "أرسل البيانات" }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ name: "devices-send", detail: { mode: "router" } }));
    await hops(4);
    expect(outcomes()).toEqual(["PC3: المقصود", "PC2: لا تصله", "PC4: لا تصله"]);
    expect(screen.getByRole("status").textContent).toContain("Router يربط بين شبكات مختلفة.");
    fireEvent.click(screen.getByRole("button", { name: "إعادة التشغيل" }));
    expect(screen.queryByRole("status")).toBeNull();
    await hops(4);
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    expect(screen.getByRole("radio", { name: "Hub" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reduced motion: the final state renders immediately after send", async () => {
    const mql = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    const orig = window.matchMedia; (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
    try {
      const { container } = await mount();
      expect(container.querySelector(".learning-devices")!.getAttribute("data-reduced-motion")).toBe("true");
      fireEvent.click(screen.getByRole("button", { name: "أرسل البيانات" }));
      expect(outcomes()).toEqual(["PC3: يستعملها", "PC2: يتجاهلها", "PC4: يتجاهلها"]);
    } finally { (window as unknown as { matchMedia: unknown }).matchMedia = orig; }
  });

  it("malformed config → in-stage note; unsupported version → the faithful text fallback", async () => {
    const { container, unmount } = render(<LearningActivityHost block={{ ...block, config: { sender: "PC1" } }} courseId="791381" />);
    await waitFor(() => { if (!container.querySelector(".learning-devices-empty")) throw new Error("not yet"); });
    unmount();
    render(<LearningActivityHost block={{ ...block, version: 5 }} courseId="791381" />);
    expect(screen.getByText(/Router: بين شبكتين/)).toBeTruthy();
  });
});
