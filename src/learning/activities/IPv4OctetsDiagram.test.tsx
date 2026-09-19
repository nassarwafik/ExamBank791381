// @vitest-environment happy-dom
// Phase 3E — the second real production activity: interactive-diagram/ipv4-octets/v1. It resolves through the
// trusted PRODUCTION registry by exact identity, lazy-loads as its own chunk, shows the FOUR octets of the example
// address as keyboard/touch-usable buttons in an LTR row (never reversed), highlights the selected part with
// aria-pressed + a visible mark (not colour-only), honours the shell's reset, does no network / persistence, and
// degrades gracefully on malformed config. It teaches NOTHING beyond PDF 27 (no validity rules, CIDR, mask, class).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { InteractiveDiagramBlock } from "../content/types";

afterEach(cleanup);

const octetsBlock: InteractiveDiagramBlock = {
  id: "o1", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "ipv4-octets", version: 1,
  title: "الأقسام الأربعة لعنوان IPv4",
  source: { kind: "book", sourceId: "791381", pdfPageStart: 27 },
  capabilities: { fullscreen: true, reset: true },
  config: {
    address: "192.168.100.10",
    rangeText: "كل قسم بين 0 و 255.",
    caption: "اختر قسمًا من الأقسام الأربعة.",
    note: "أربعة أقسام تفصل بينها نقاط.",
  },
};

describe("Phase 3E — ipv4-octets resolves through the production registry by exact identity", () => {
  it("is registered as interactive-diagram/ipv4-octets/v1 and resolves the block; other versions/keys do not", () => {
    expect(productionActivityRegistry.resolve(octetsBlock)?.key).toBe("ipv4-octets");
    expect(productionActivityRegistry.resolve({ ...octetsBlock, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...octetsBlock, interactionType: "ipv4-validator" })).toBeUndefined();
  });
});

describe("Phase 3E — ipv4-octets diagram behaviour", () => {
  it("lazy-loads and renders exactly FOUR octet buttons in an LTR row with the first part selected, no network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<LearningActivityHost block={octetsBlock} courseId="791381" />);
    const row = await waitFor(() => { const r = container.querySelector(".learning-octets-row"); if (!r) throw new Error("not yet"); return r; });
    expect(row.getAttribute("dir")).toBe("ltr");
    const buttons = [...row.querySelectorAll("button")];
    expect(buttons.length).toBe(4);
    expect(buttons.map(b => b.querySelector(".learning-octets-value")?.textContent)).toEqual(["192", "168", "100", "10"]); // MSB-left, never reversed
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[0].querySelector(".learning-octets-mark")).toBeTruthy();      // visible mark, not colour-only
    expect(buttons[1].querySelector(".learning-octets-mark")).toBeNull();
    expect(row.getAttribute("aria-label")).toBe("192.168.100.10");
    expect(screen.getByText("كل قسم بين 0 و 255.")).toBeTruthy();           // the source range wording (from config)
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toContain("<script");
  });

  it("selecting an octet moves aria-pressed + the mark, updates the detail, and emits an interaction; real buttons", async () => {
    const emit = vi.fn();
    render(<LearningActivityHost block={octetsBlock} courseId="791381" emit={emit} />);
    const third = await screen.findByRole("button", { name: "القسم 3 من 4: 100" });
    expect(third.tagName).toBe("BUTTON");                     // Tab focus + Enter/Space for free
    third.focus();
    expect(document.activeElement).toBe(third);
    fireEvent.click(third);
    await waitFor(() => expect(third.getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByRole("button", { name: "القسم 1 من 4: 192" }).getAttribute("aria-pressed")).toBe("false");
    expect(third.querySelector(".learning-octets-mark")).toBeTruthy();
    expect(screen.getByText("3 / 4")).toBeTruthy();
    expect(emit).toHaveBeenCalledWith({ type: "interaction", activityId: "o1", name: "octet-select", detail: { octet: 3, value: "100" } });
  });

  it("the shell's reset returns to the first octet (renderer declares reset)", async () => {
    render(<LearningActivityHost block={octetsBlock} courseId="791381" />);
    fireEvent.click(await screen.findByRole("button", { name: "القسم 4 من 4: 10" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "القسم 4 من 4: 10" }).getAttribute("aria-pressed")).toBe("true"));
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "القسم 1 من 4: 192" }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("a malformed config (not a dotted quad) degrades to a quiet note — no crash, no fake address", async () => {
    for (const address of ["192.168.1", "300.1.1.1", "a.b.c.d", undefined]) {
      const bad = { ...octetsBlock, id: "o-bad", config: { address } };
      const { unmount } = render(<LearningActivityHost block={bad} courseId="791381" />);
      expect(await screen.findByText(/غير متوفر حاليًا/)).toBeTruthy();
      expect(document.querySelector(".learning-octets-row")).toBeNull();
      unmount();
    }
  });

  it("teaches only the four-part structure: no validity/CIDR/mask/class wording and no text input", async () => {
    const { container } = render(<LearningActivityHost block={octetsBlock} courseId="791381" />);
    await screen.findByRole("button", { name: "القسم 1 من 4: 192" });
    expect(container.querySelector("input, textarea, select")).toBeNull();
    expect(container.textContent).not.toMatch(/CIDR|Subnet|Class A|Class B|Class C|قناع|غير صالح/);
  });
});
