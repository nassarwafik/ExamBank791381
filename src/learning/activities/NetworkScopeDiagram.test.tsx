// @vitest-environment happy-dom
// Phase 3B — the pilot's first real production activity: interactive-diagram/network-scope/v1. It resolves through
// the trusted PRODUCTION registry by exact identity, lazy-loads, presents PAN→LAN→WAN as growing scope with
// keyboard-usable buttons + source-aligned labels, honors reduced-motion, does no network / persistence, and a
// failure never takes down the surrounding lesson.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { InteractiveDiagramBlock } from "../content/types";

afterEach(cleanup);

const scopeBlock: InteractiveDiagramBlock = {
  id: "d1", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "network-scope", version: 1,
  title: "استكشف نطاق الشبكات",
  source: { kind: "book", sourceId: "791381", pdfPageStart: 11 },
  capabilities: { fullscreen: true, reset: true },
  config: {
    scopes: [
      { id: "pan", name: "PAN", title: "شبكة شخصية", distance: "أمتار قليلة", example: "أجهزة قريبة جدًا، مثل هاتف وسماعة بلوتوث." },
      { id: "lan", name: "LAN", title: "شبكة محلية", distance: "بيت أو مدرسة", example: "داخل بيت أو مدرسة، مثل غرفة الحاسوب." },
      { id: "wan", name: "WAN", title: "شبكة واسعة", distance: "بين مدن أو دول", example: "بين مدن أو دول، وأكبر مثال هو الإنترنت." },
    ],
    note: "كلما زاد حجم الشبكة زادت المسافة.",
  },
};

describe("Phase 3B — network-scope resolves through the production registry by exact identity", () => {
  it("is registered as interactive-diagram/network-scope/v1 and resolves the block", () => {
    expect(productionActivityRegistry.resolve(scopeBlock)?.key).toBe("network-scope");
    // an unsupported version of the same key does NOT resolve
    expect(productionActivityRegistry.resolve({ ...scopeBlock, version: 2 })).toBeUndefined();
  });
});

describe("Phase 3B — network-scope diagram behaviour", () => {
  it("lazy-loads and shows PAN/LAN/WAN scope controls with the source-aligned first scope selected", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<LearningActivityHost block={scopeBlock} courseId="791381" />);
    for (const name of ["PAN", "LAN", "WAN"]) expect(await screen.findByText(name, { selector: ".learning-scope-tab-name" })).toBeTruthy();
    // first scope selected (PAN) → its example is shown, aria-pressed reflects selection
    const pan = screen.getByRole("button", { name: /PAN/ });
    expect(pan.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/أجهزة قريبة جدًا/)).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();                    // no network
  });

  it("selecting a scope updates the detail + emits an interaction; buttons are keyboard-operable", async () => {
    const emit = vi.fn();
    render(<LearningActivityHost block={scopeBlock} courseId="791381" emit={emit} />);
    const wan = await screen.findByRole("button", { name: /WAN/ });
    expect(wan.tagName).toBe("BUTTON");     // real button → Enter/Space + Tab focus for free
    fireEvent.click(wan);
    await waitFor(() => expect(screen.getByText(/وأكبر مثال هو الإنترنت/)).toBeTruthy());
    expect(wan.getAttribute("aria-pressed")).toBe("true");
    expect(emit).toHaveBeenCalledWith({ type: "interaction", activityId: "d1", name: "scope-select", detail: { scope: "wan", index: 2 } });
  });

  it("the shell's reset returns to the first scope (renderer declares reset)", async () => {
    render(<LearningActivityHost block={scopeBlock} courseId="791381" />);
    fireEvent.click(await screen.findByRole("button", { name: /WAN/ }));
    expect(screen.getByRole("button", { name: /WAN/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /PAN/ }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("a malformed config degrades gracefully (no scopes → a quiet note, surrounding lesson intact)", async () => {
    const bad = { ...scopeBlock, id: "d-bad", config: {} };
    render(<LearningActivityHost block={bad} courseId="791381" />);
    expect(await screen.findByText(/غير متوفر حاليًا/)).toBeTruthy();
    expect(screen.queryByText("PAN")).toBeNull();
  });
});
