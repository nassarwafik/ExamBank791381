// @vitest-environment happy-dom
// Units 7–8 — interactive-diagram/broadcast-address/v1: exact identity, lazy load, the book's rows as examples with
// TEXT network/host badges and the right broadcast address for /8 /16 /24, the guided attempt (toggle host octets to
// 255 → «تحقّق»), immediate feedback naming the octet to CHECK, «أظهر الحل», keyboard, shell reset, malformed
// config → note, unsupported version → faithful text fallback, reduced-motion hook, no network, whole-octet only.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { InteractiveDiagramBlock } from "../content/types";

afterEach(cleanup);

const block: InteractiveDiagramBlock = {
  id: "bcast1", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "broadcast-address", version: 1,
  title: "ابنِ عنوان Broadcast", source: { kind: "book", sourceId: "791381", pdfPageStart: 70 },
  capabilities: { fullscreen: true, reset: true },
  fallback: { text: "نبقي أقسام الشبكة كما هي ونجعل أقسام الجهاز 255: 192.168.10.0 /24 يصبح 192.168.10.255." },
  config: {
    examples: [{ network: "10.0.0.0", prefix: 8 }, { network: "192.168.10.0", prefix: 24 }, { network: "192.168.0.0", prefix: 16 }, { network: "172.18.20.0", prefix: 24 }, { network: "172.30.0.0", prefix: 16 }],
    practice: [{ network: "192.168.50.0", prefix: 24 }, { network: "10.10.0.0", prefix: 16 }, { network: "20.0.0.0", prefix: 8 }],
    networkLabel: "شبكة", hostLabel: "جهاز", rule: "نبقي أقسام الشبكة كما هي، ونجعل أقسام الجهاز 255.",
  },
};
const mount = async () => { const r = render(<LearningActivityHost block={block} courseId="791381" />); await waitFor(() => { if (!r.container.querySelector(".learning-bcast")) throw new Error("not yet"); }); return r; };
const exBadges = (c: HTMLElement) => [...c.querySelectorAll(".learning-bcast-row:not(.is-practice) .learning-bcast-badge")].map(b => b.textContent);
const answer = (c: HTMLElement) => c.querySelector(".learning-bcast-answer")!.textContent;
const toggles = () => screen.getAllByRole("button").filter(b => b.classList.contains("learning-bcast-toggle"));

describe("registry identity", () => {
  it("resolves interactive-diagram/broadcast-address/v1 only", () => {
    expect(productionActivityRegistry.resolve(block)?.key).toBe("broadcast-address");
    expect(productionActivityRegistry.resolve({ ...block, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...block, interactionType: "subnet-calculator" })).toBeUndefined();
  });
});

describe("behaviour", () => {
  it("the book's five rows: /8 → one network octet, /16 → two, /24 → three (TEXT badges, LTR row) and the exact broadcast addresses", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = await mount();
    const row = container.querySelector(".learning-bcast-row")!;
    expect(row.getAttribute("dir")).toBe("ltr");
    expect(exBadges(container)).toEqual(["شبكة", "جهاز", "جهاز", "جهاز"]);
    expect(answer(container)).toBe("10.255.255.255");
    const expected: [string, string[], string][] = [
      ["192.168.10.0 /24", ["شبكة", "شبكة", "شبكة", "جهاز"], "192.168.10.255"],
      ["192.168.0.0 /16", ["شبكة", "شبكة", "جهاز", "جهاز"], "192.168.255.255"],
      ["172.18.20.0 /24", ["شبكة", "شبكة", "شبكة", "جهاز"], "172.18.20.255"],
      ["172.30.0.0 /16", ["شبكة", "شبكة", "جهاز", "جهاز"], "172.30.255.255"],
    ];
    for (const [name, badges, bcast] of expected) {
      fireEvent.click(screen.getByRole("radio", { name }));
      expect(exBadges(container), name).toEqual(badges);
      expect(answer(container), name).toBe(bcast);
    }
    expect(screen.getByText("نبقي أقسام الشبكة كما هي، ونجعل أقسام الجهاز 255.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\/2[5-9]|\/3[0-2]/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("guided attempt: toggling exactly the host octets to 255 → ✓; a network octet toggled → ✕ naming that octet; a host octet left → ✕ naming it; «أظهر الحل» reveals; keyboard-usable", async () => {
    const emit = vi.fn();
    const r = render(<LearningActivityHost block={block} courseId="791381" emit={emit} />);
    await waitFor(() => { if (!r.container.querySelector(".learning-bcast-task")) throw new Error("not yet"); });
    let t = toggles();
    expect(t.map(b => b.getAttribute("aria-label"))).toEqual(["القسم 1: 192", "القسم 2: 168", "القسم 3: 50", "القسم 4: 0"]);
    t[0].focus(); expect(document.activeElement).toBe(t[0]);
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));                     // nothing toggled → the host octet is missing
    expect(screen.getByRole("status").textContent).toContain("✕ غير صحيح — افحص القسم 4: هو قسم جهاز مع /24 فيجب أن يصبح 255.");
    fireEvent.click(t[2]);                                                                // a NETWORK octet toggled
    fireEvent.click(t[3]);
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    expect(screen.getByRole("status").textContent).toContain("افحص القسم 3: هو قسم شبكة مع /24 فيجب أن يبقى 50.");
    fireEvent.click(t[2]);                                                                // undo it
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    expect(screen.getByRole("status").textContent).toContain("✓ صحيح — 192.168.50.255");
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ name: "bcast-check", detail: { attempt: "192.168.50.255", right: true } }));
    // another item at /16: two host octets
    fireEvent.click(screen.getByRole("radio", { name: "10.10.0.0 /16" }));
    expect(screen.queryByRole("status")).toBeNull();
    t = toggles();
    expect(t.map(b => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "false"]);
    fireEvent.click(t[2]); fireEvent.click(t[3]);
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    expect(screen.getByRole("status").textContent).toContain("✓ صحيح — 10.10.255.255");
    fireEvent.click(screen.getByRole("button", { name: "أظهر الحل" }));
    expect(r.container.querySelector(".learning-bcast-solution")!.textContent).toContain("الحل: 10.10.255.255");
    // /8: three host octets
    fireEvent.click(screen.getByRole("radio", { name: "20.0.0.0 /8" }));
    t = toggles(); fireEvent.click(t[1]); fireEvent.click(t[2]); fireEvent.click(t[3]);
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    expect(screen.getByRole("status").textContent).toContain("✓ صحيح — 20.255.255.255");
  });

  it("the shell's reset returns to the first example and clears the attempt", async () => {
    const { container } = await mount();
    fireEvent.click(screen.getByRole("radio", { name: "172.30.0.0 /16" }));
    fireEvent.click(toggles()[3]);
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    expect(answer(container)).toBe("10.255.255.255");
    expect(screen.queryByRole("status")).toBeNull();
    expect(toggles().map(b => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "false"]);
  });

  it("malformed config (a /27 example is rejected; nothing valid) → note; unsupported version → faithful fallback; reduced motion marks the surface", async () => {
    const { container, unmount } = render(<LearningActivityHost block={{ ...block, config: { examples: [{ network: "10.0.0.0", prefix: 27 }] } }} courseId="791381" />);
    await waitFor(() => { if (!container.querySelector(".learning-bcast-empty")) throw new Error("not yet"); });
    expect(screen.getByRole("note").textContent).toContain("غير متوفر حاليًا");
    unmount();
    const r2 = render(<LearningActivityHost block={{ ...block, version: 9 }} courseId="791381" />);
    expect(screen.getByText(/يصبح 192.168.10.255/)).toBeTruthy();
    r2.unmount();
    const mql = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    const orig = window.matchMedia; (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
    try {
      const r3 = render(<LearningActivityHost block={block} courseId="791381" />);
      await waitFor(() => { if (!r3.container.querySelector(".learning-bcast")) throw new Error("not yet"); });
      expect(r3.container.querySelector(".learning-bcast")!.getAttribute("data-reduced-motion")).toBe("true");
    } finally { (window as unknown as { matchMedia: unknown }).matchMedia = orig; }
  });
});
