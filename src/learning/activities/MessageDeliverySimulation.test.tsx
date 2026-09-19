// @vitest-environment happy-dom
// Units 7–8 — simulation/message-delivery/v1: exact identity, lazy load; Unicast = exactly one receiver, Multicast =
// the selected group only, Broadcast = every LOCAL device and the Router boundary «يتوقّف هنا»; the text mirror is
// prose «من X إلى Y» with NO arrow glyphs; mode switch clears a stale run; replay/reset; reduced motion renders the
// final state at once; malformed config → note; unsupported version → faithful text fallback; no network.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { SimulationBlock } from "../content/types";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const block: SimulationBlock = {
  id: "msg1", type: "simulation", origin: "teacher-enrichment", simulationType: "message-delivery", version: 1,
  title: "جرّب: من يستقبل الرسالة؟", source: { kind: "book", sourceId: "791381", pdfPageStart: 69 },   // PDF 69: where the Router boundary is taught
  capabilities: { fullscreen: true, reset: true, replay: true, animated: true },
  fallback: { text: "Unicast: جهاز واحد. Multicast: مجموعة محدّدة. Broadcast: جميع الأجهزة داخل الشبكة، والراوتر لا يمرّرها." },
  config: {
    sender: "PC1", receivers: ["PC2", "PC3", "PC4"], switchLabel: "Switch",
    unicast: { target: "PC3", caption: "Unicast: جهاز واحد فقط يستقبل الرسالة." },
    multicast: { group: ["PC2", "PC4"], caption: "Multicast: المجموعة المحدّدة فقط تستقبل." },
    broadcast: { caption: "Broadcast: الجميع داخل الشبكة يستقبلون.", router: { label: "Router", stopLabel: "يتوقّف هنا", outside: "شبكة أخرى" } },
    receivesLabel: "يستقبل", notLabel: "لا يستقبل", localLabel: "الشبكة نفسها",
  },
};
const mount = async () => { const r = render(<LearningActivityHost block={block} courseId="791381" />); await waitFor(() => { if (!r.container.querySelector(".learning-msg")) throw new Error("not yet"); }); return r; };
const hops = async (n: number) => { for (let i = 0; i < n; i++) await act(async () => { await vi.advanceTimersByTimeAsync(700); }); };
const steps = () => [...document.querySelectorAll(".learning-msg-step")].map(li => li.textContent || "");
const outcomes = () => [...document.querySelectorAll(".learning-msg-outcomes li")].map(li => li.textContent);
/** Parses the aria-live mirror into [sender, receiver] pairs; asserts prose form and no arrow glyphs. */
const chain = () => {
  const texts = steps();
  expect(texts.join(" ")).not.toMatch(/[←→]/);
  return texts.filter(t => /^\d+من /.test(t)).map(t => /^\d+من (.+?) إلى (.+?)(?: فقط|: .*)?$/.exec(t)!.slice(1, 3));
};

describe("registry identity", () => {
  it("resolves simulation/message-delivery/v1 only (the SECOND simulation renderer)", () => {
    expect(productionActivityRegistry.resolve(block)?.key).toBe("message-delivery");
    expect(productionActivityRegistry.resolve({ ...block, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...block, simulationType: "packet-delivery" })).toBeUndefined();
    expect(productionActivityRegistry.list().filter(e => e.kind === "simulation").map(e => e.key)).toEqual(["hub-switch-router-flow", "message-delivery"]);
  });
});

describe("behaviour", () => {
  it("Unicast: exactly ONE receiver (PC3); the others «لا يستقبل»; count 1 من 3; mirror = من PC1 إلى Switch / من Switch إلى PC3 فقط", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = await mount();
    vi.useFakeTimers();
    expect(screen.getByRole("radio", { name: "Unicast" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "أرسل الرسالة" }));
    expect(steps()).toEqual(["1من PC1 إلى Switch", "2من Switch إلى PC3 فقط"]);
    await hops(2);
    expect(container.querySelectorAll(".learning-msg-node.is-reached").length).toBe(1);
    expect(outcomes()).toEqual(["PC2: لا يستقبل", "PC3: يستقبل", "PC4: لا يستقبل"]);
    expect(screen.getByText("عدد الأجهزة التي تستقبل: 1 من 3")).toBeTruthy();
    expect(chain()).toEqual([["PC1", "Switch"], ["Switch", "PC3"]]);
    expect(screen.getByRole("status").textContent).toContain("Unicast: جهاز واحد فقط يستقبل الرسالة.");
    expect(container.querySelector(".learning-msg-router.is-stopped")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Multicast: only the selected group (PC2, PC4) receives; count 2 من 3; switching mode mid-run clears the stale run", async () => {
    const { container } = await mount();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "أرسل الرسالة" }));   // start a Unicast run…
    await hops(1);
    fireEvent.click(screen.getByRole("radio", { name: "Multicast" }));        // …then change the kind
    expect(container.querySelector(".learning-msg-packet")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("اختر نوع الرسالة ثم اضغط «أرسل الرسالة».")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "أرسل الرسالة" }));
    expect(steps()).toEqual(["1من PC1 إلى Switch", "2من Switch إلى المجموعة المحدّدة: PC2 و PC4"]);
    await hops(2);
    expect(container.querySelectorAll(".learning-msg-node.is-reached").length).toBe(2);
    expect(outcomes()).toEqual(["PC2: يستقبل", "PC3: لا يستقبل", "PC4: يستقبل"]);
    expect(screen.getByText("عدد الأجهزة التي تستقبل: 2 من 3")).toBeTruthy();
    expect(chain()).toEqual([["PC1", "Switch"], ["Switch", "المجموعة المحدّدة"]]);
  });

  it("Broadcast: ALL local devices receive (3 من 3), the Router boundary is marked «يتوقّف هنا» in words and the mirror says the broadcast does not cross; replay restarts; reset returns to Unicast", async () => {
    const r = await mount();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("radio", { name: "Broadcast" }));
    fireEvent.click(screen.getByRole("button", { name: "أرسل الرسالة" }));
    expect(steps()).toEqual(["1من PC1 إلى Switch", "2من Switch إلى جميع الأجهزة داخل الشبكة: PC2 و PC3 و PC4", "3عند Router: يتوقّف هنا — لا يعبر البث إلى شبكة أخرى"]);
    await hops(3);
    expect(r.container.querySelectorAll(".learning-msg-node.is-reached").length).toBe(3);
    expect(outcomes()).toEqual(["PC2: يستقبل", "PC3: يستقبل", "PC4: يستقبل"]);
    expect(screen.getByText("عدد الأجهزة التي تستقبل: 3 من 3")).toBeTruthy();
    expect(r.container.querySelector(".learning-msg-router.is-stopped")).not.toBeNull();
    expect(r.container.querySelector(".learning-msg-stoplabel")!.textContent).toBe("يتوقّف هنا");
    expect(screen.getByRole("status").textContent).toContain("Router: يتوقّف هنا — البث يبقى داخل الشبكة نفسها ولا يعبر إلى شبكة أخرى.");
    expect(chain()).toEqual([["PC1", "Switch"], ["Switch", "جميع الأجهزة داخل الشبكة"]]);
    // replay: the run restarts from the sender and steps again
    fireEvent.click(screen.getByRole("button", { name: "إعادة التشغيل" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(r.container.querySelector(".learning-msg-router.is-stopped")).toBeNull();
    await hops(3);
    expect(screen.getByText("عدد الأجهزة التي تستقبل: 3 من 3")).toBeTruthy();
    // reset: back to Unicast with no run
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    expect(screen.getByRole("radio", { name: "Unicast" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reduced motion: the final state renders at once (no timers); malformed config (group = everyone) → note; unsupported version → faithful text fallback", async () => {
    const mql = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    const orig = window.matchMedia; (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
    try {
      const { container, unmount } = render(<LearningActivityHost block={block} courseId="791381" />);
      await waitFor(() => { if (!container.querySelector(".learning-msg")) throw new Error("not yet"); });
      expect(container.querySelector(".learning-msg")!.getAttribute("data-reduced-motion")).toBe("true");
      fireEvent.click(screen.getByRole("radio", { name: "Broadcast" }));
      fireEvent.click(screen.getByRole("button", { name: "أرسل الرسالة" }));
      expect(outcomes()).toEqual(["PC2: يستقبل", "PC3: يستقبل", "PC4: يستقبل"]);
      expect(container.querySelector(".learning-msg-router.is-stopped")).not.toBeNull();
      expect(steps().every((_, i) => container.querySelectorAll(".learning-msg-step")[i].classList.contains("is-done"))).toBe(true);
      unmount();
    } finally { (window as unknown as { matchMedia: unknown }).matchMedia = orig; }
    const bad = render(<LearningActivityHost block={{ ...block, config: { ...(block.config as object), multicast: { group: ["PC2", "PC3", "PC4"] } } }} courseId="791381" />);
    await waitFor(() => { if (!bad.container.querySelector(".learning-msg-empty")) throw new Error("not yet"); });
    expect(screen.getByRole("note").textContent).toContain("غير متوفر حاليًا");
    bad.unmount();
    render(<LearningActivityHost block={{ ...block, version: 9 }} courseId="791381" />);
    expect(screen.getByText(/الراوتر لا يمرّرها/)).toBeTruthy();
  });
});
