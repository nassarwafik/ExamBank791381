// @vitest-environment happy-dom
// Batch 4 — interactive-diagram/network-domains/v1: exact identity, lazy load, four keyboard-usable network radios;
// each selection redraws the SVG with one DASHED box per collision domain and one coloured box per Broadcast
// domain (counts from config); two toggles hide / show each family; the counts and the book's reason sentences are
// mirrored as text in a status region; reset; reduced-motion attribute; malformed config → note; version → fallback.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { InteractiveDiagramBlock } from "../content/types";

afterEach(() => { cleanup(); });

const scenarios = [
  { id: "hub", name: "Hub", title: "أربعة أجهزة على Hub", collision: 1, broadcast: 1, collisionNote: "Hub: مجال واحد.", broadcastNote: "رسالة واحدة تصل لكل الأجهزة." },
  { id: "switch", name: "Switch", title: "أربعة أجهزة على Switch", collision: 4, broadcast: 1, collisionNote: "كل منفذ مجال مستقل.", broadcastNote: "كل المنافذ ضمن مجال واحد." },
  { id: "router", name: "Router", title: "راوتر يربط سويتشين", collision: 6, broadcast: 2, collisionNote: "منفذان للأجهزة ومنفذ للراوتر في كل سويتش.", broadcastNote: "كل منفذ في الراوتر مجال مستقل." },
  { id: "vlan", name: "VLAN", title: "Switch مقسّم إلى VLAN 10 و VLAN 20", collision: 4, broadcast: 2, collisionNote: "كل منفذ مجال مستقل.", broadcastNote: "كل VLAN مجال منفصل." },
];
const block: InteractiveDiagramBlock = {
  id: "dom1", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "network-domains", version: 1,
  title: "استكشف مجالات التصادم ومجالات Broadcast", source: { kind: "book", sourceId: "791381", pdfPageStart: 101 },
  capabilities: { fullscreen: true, reset: true, interactive: true },
  fallback: { text: "Hub: مجال تصادم واحد ومجال Broadcast واحد. Switch: 4 مجالات تصادم ومجال Broadcast واحد." },
  config: { scenarios, collisionLabel: "مجال تصادم", broadcastLabel: "مجال Broadcast", showCollisionLabel: "أظهر مجالات التصادم", showBroadcastLabel: "أظهر مجالات Broadcast", legend: "الخط المتقطّع يحيط بكل مجال تصادم." },
};
const mount = async (b: InteractiveDiagramBlock = block) => { const r = render(<LearningActivityHost block={b} courseId="791381" />); await waitFor(() => { if (!r.container.querySelector(".learning-domains")) throw new Error("not yet"); }); return r; };
const pick = (name: string) => fireEvent.click(screen.getByRole("radio", { name: new RegExp("^" + name + " ") }));
const boxes = (c: HTMLElement) => [c.querySelectorAll(".learning-domains-collision").length, c.querySelectorAll(".learning-domains-broadcast").length];
const status = () => screen.getByRole("status").textContent ?? "";

describe("registry identity", () => {
  it("resolves interactive-diagram/network-domains/v1 only", () => {
    expect(productionActivityRegistry.resolve(block)?.key).toBe("network-domains");
    expect(productionActivityRegistry.resolve({ ...block, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...block, interactionType: "domains" })).toBeUndefined();
  });
});

describe("behaviour", () => {
  it("four real radio buttons in config order; Hub is selected first with ONE dashed box and ONE broadcast box; counts + reasons are text; no fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = await mount();
    const radios = screen.getAllByRole("radio");
    expect(radios.map(r => r.querySelector(".learning-domains-tab-name")?.textContent)).toEqual(["Hub", "Switch", "Router", "VLAN"]);
    expect(radios.every(r => r.tagName === "BUTTON")).toBe(true);
    expect(radios.map(r => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false"]);
    radios[2].focus(); expect(document.activeElement).toBe(radios[2]);
    expect(container.querySelector(".learning-domains")!.getAttribute("data-scenario")).toBe("hub");
    expect(boxes(container as HTMLElement)).toEqual([1, 1]);
    expect(container.querySelectorAll(".learning-domains-node").length).toBe(5);
    expect(status()).toContain("1 مجال تصادم");
    expect(status()).toContain("1 مجال Broadcast");
    expect(status()).toContain("Hub: مجال واحد.");
    expect(container.querySelector("svg")!.getAttribute("aria-label")).toContain("أربعة أجهزة على Hub");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Switch → 4 dashed / 1 broadcast; Router → 6 dashed / 2 labelled broadcast boxes; VLAN → 4 dashed / 2 boxes labelled VLAN 10 · VLAN 20; status follows", async () => {
    const { container } = await mount();
    const c = container as HTMLElement;
    pick("Switch");
    expect(boxes(c)).toEqual([4, 1]);
    expect(status()).toContain("4 مجال تصادم");
    expect(status()).toContain("كل منفذ مجال مستقل.");
    pick("Router");
    expect(boxes(c)).toEqual([6, 2]);
    expect([...c.querySelectorAll(".learning-domains-boxlabel")].map(t => t.textContent)).toEqual(["Broadcast Domain 1", "Broadcast Domain 2"]);
    expect(c.querySelectorAll(".learning-domains-node.is-device").length).toBe(3);
    expect(status()).toContain("2 مجال Broadcast");
    expect(status()).toContain("كل منفذ في الراوتر مجال مستقل.");
    pick("VLAN");
    expect(boxes(c)).toEqual([4, 2]);
    expect([...c.querySelectorAll(".learning-domains-boxlabel")].map(t => t.textContent)).toEqual(["VLAN 10", "VLAN 20"]);
    expect(c.querySelector(".learning-domains")!.getAttribute("data-scenario")).toBe("vlan");
    expect(screen.getByText("الخط المتقطّع يحيط بكل مجال تصادم.")).toBeTruthy();
    expect(c.textContent).not.toMatch(/[←→⇐⇒]/);
  });

  it("the two toggles hide / show each outline family (aria-pressed) without changing the text counts; shell reset returns to Hub with both on", async () => {
    const { container } = await mount();
    const c = container as HTMLElement;
    pick("Router");
    const tCol = screen.getByRole("button", { name: "أظهر مجالات التصادم" }), tBc = screen.getByRole("button", { name: "أظهر مجالات Broadcast" });
    expect([tCol.getAttribute("aria-pressed"), tBc.getAttribute("aria-pressed")]).toEqual(["true", "true"]);
    fireEvent.click(tCol);
    expect(boxes(c)).toEqual([0, 2]);
    expect(tCol.getAttribute("aria-pressed")).toBe("false");
    expect(status()).toContain("6 مجال تصادم");          // text never disappears
    fireEvent.click(tBc);
    expect(boxes(c)).toEqual([0, 0]);
    fireEvent.click(tCol);
    expect(boxes(c)).toEqual([6, 0]);
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    expect(c.querySelector(".learning-domains")!.getAttribute("data-scenario")).toBe("hub");
    expect(boxes(c)).toEqual([1, 1]);
    expect(screen.getAllByRole("radio").map(r => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false"]);
  });

  it("reduced motion is reflected as a data attribute; malformed config (no scenarios / unknown ids / bad counts / non-object) → note; unsupported version → text fallback", async () => {
    const mql = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    const orig = window.matchMedia; (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
    try {
      const { container, unmount } = await mount();
      expect(container.querySelector(".learning-domains")!.getAttribute("data-reduced-motion")).toBe("true");
      unmount();
    } finally { (window as unknown as { matchMedia: unknown }).matchMedia = orig; }
    for (const config of [{ scenarios: [] }, { scenarios: [{ ...scenarios[0], id: "mesh" }] }, { scenarios: [{ ...scenarios[0], collision: 0 }] }, { scenarios: [{ ...scenarios[1], broadcast: 1.5 }] }, { scenarios: "x" }, undefined]) {
      const { container, unmount } = render(<LearningActivityHost block={{ ...block, config }} courseId="791381" />);
      await waitFor(() => { if (!container.querySelector(".learning-domains-empty")) throw new Error("not yet"); });
      expect(container.querySelector(".learning-domains-tab")).toBeNull();
      unmount();
    }
    // a duplicate id is skipped (first wins), the rest still render
    const { container, unmount } = await mount({ ...block, config: { ...(block.config as object), scenarios: [scenarios[1], { ...scenarios[1], title: "dup" }, scenarios[3]] } });
    expect(screen.getAllByRole("radio").length).toBe(2);
    expect(boxes(container as HTMLElement)).toEqual([4, 1]);
    unmount();
    render(<LearningActivityHost block={{ ...block, version: 7 }} courseId="791381" />);
    expect(screen.getByText(/Switch: 4 مجالات تصادم/)).toBeTruthy();
    expect(document.querySelector(".learning-domains")).toBeNull();
  });
});
