// @vitest-environment happy-dom
// Units 7–8 — interactive-diagram/cable-comparison/v1: exact identity, lazy load, the four book cables with their
// TEXT traits, the scenario → cable task with immediate feedback and «افحص» on a wrong pick, keyboard-usable real
// buttons, shell reset, malformed config → note, unsupported version → faithful text fallback, reduced-motion hook,
// no network, no invented specs.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { InteractiveDiagramBlock } from "../content/types";

afterEach(cleanup);

const block: InteractiveDiagramBlock = {
  id: "cable1", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "cable-comparison", version: 1,
  title: "قارن واختر الكابل المناسب", source: { kind: "book", sourceId: "791381", pdfPageStart: 63 },
  capabilities: { fullscreen: true, reset: true },
  fallback: { text: "UTP: زوج ملتوي غير محمي. STP: محمي. Fiber Optic: ينقل الضوء. Coaxial: موصّل نحاسي في المنتصف." },
  config: {
    cables: [
      { id: "utp", name: "UTP", title: "زوج ملتوي غير محمي", traits: ["غلاف بلاستيكي فقط، بدون طبقة حماية", "أرخص وأشيع"], shield: false, kind: "pair" },
      { id: "stp", name: "STP", title: "زوج ملتوي محمي", traits: ["غلاف + طبقة حماية معدنية", "الحماية تصدّ التشويش الخارجي"], shield: true, kind: "pair" },
      { id: "fiber", name: "Fiber Optic", title: "ألياف بصرية", traits: ["لبّ زجاجي ينقل الضوء", "سرعة عالية جدًا ومسافات طويلة"], shield: false, kind: "fiber" },
      { id: "coaxial", name: "Coaxial", title: "كابل محوري", traits: ["موصّل نحاسي في المنتصف", "يُستعمل في التلفزيون والإنترنت عبر الكابل"], shield: false, kind: "coaxial" },
    ],
    scenarios: [
      { id: "classroom", prompt: "شبكة صف عادي بأقل تكلفة.", answer: "utp", why: "UTP شائع ورخيص." },
      { id: "noisy", prompt: "ورشة فيها تشويش قوي.", answer: "stp", why: "STP فيه طبقة حماية معدنية." },
      { id: "longfast", prompt: "وصلة سريعة جدًا بين مبنيين بعيدين.", answer: "fiber", why: "الألياف تنقل الضوء." },
      { id: "tv", prompt: "توصيل التلفزيون عبر شركة الكابل.", answer: "coaxial", why: "الكابل المحوري للتلفزيون." },
    ],
    rule: "كلما زادت الحماية والجودة، كان الكابل أفضل ضد التشويش وفقدان البيانات.",
    scenarioNote: "السيناريوهات إضافة تعليمية.",
  },
};
const mount = async () => { const r = render(<LearningActivityHost block={block} courseId="791381" />); await waitFor(() => { if (!r.container.querySelector(".learning-cable")) throw new Error("not yet"); }); return r; };
const traits = () => [...document.querySelectorAll(".learning-cable-traits li")].map(li => li.textContent);

describe("registry identity", () => {
  it("resolves interactive-diagram/cable-comparison/v1 only", () => {
    expect(productionActivityRegistry.resolve(block)?.key).toBe("cable-comparison");
    expect(productionActivityRegistry.resolve({ ...block, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...block, interactionType: "cable-chooser" })).toBeUndefined();
  });
});

describe("behaviour", () => {
  it("shows the four cables as real tab buttons with the book's TEXT traits; the rule; no network; no invented specs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = await mount();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map(t => t.querySelector(".learning-cable-tab-name")?.textContent)).toEqual(["UTP", "STP", "Fiber Optic", "Coaxial"]);
    expect(tabs.every(t => t.tagName === "BUTTON")).toBe(true);
    expect(traits()).toEqual(["غلاف بلاستيكي فقط، بدون طبقة حماية", "أرخص وأشيع"]);
    expect(container.querySelector(".learning-cable-shield")).toBeNull();
    fireEvent.click(tabs[1]);
    expect(traits()).toEqual(["غلاف + طبقة حماية معدنية", "الحماية تصدّ التشويش الخارجي"]);
    expect(container.querySelector(".learning-cable-shield")).not.toBeNull();     // the shield layer is drawn for STP only
    expect(screen.getByText("محمي")).toBeTruthy();                                    // and named in words
    fireEvent.click(tabs[2]);
    expect(traits()).toEqual(["لبّ زجاجي ينقل الضوء", "سرعة عالية جدًا ومسافات طويلة"]);
    expect(container.querySelector(".learning-cable-core.is-glass")).not.toBeNull();
    fireEvent.click(tabs[3]);
    expect(traits()).toEqual(["موصّل نحاسي في المنتصف", "يُستعمل في التلفزيون والإنترنت عبر الكابل"]);
    expect(container.querySelector(".learning-cable-core.is-copper")).not.toBeNull();
    expect(screen.getByText("كلما زادت الحماية والجودة، كان الكابل أفضل ضد التشويش وفقدان البيانات.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Cat ?[5-8]|Gbps|Mbps|km/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toContain("<script");
  });

  it("scenario → cable: the right cable gives ✓ + why; a wrong cable gives ✕ + «افحص» with that cable's traits; changing the scenario clears the pick", async () => {
    const emit = vi.fn();
    const r = render(<LearningActivityHost block={block} courseId="791381" emit={emit} />);
    await waitFor(() => { if (!r.container.querySelector(".learning-cable-task")) throw new Error("not yet"); });
    expect(screen.queryByRole("radiogroup", { name: "الكابل الأنسب" })).toBeNull();     // choices appear after a scenario
    fireEvent.click(screen.getByRole("radio", { name: /ورشة فيها تشويش قوي/ }));
    const choices = screen.getAllByRole("radio").filter(x => x.classList.contains("learning-cable-choice"));
    expect(choices.map(c => c.textContent)).toEqual(["UTP", "STP", "Fiber Optic", "Coaxial"]);
    choices[0].focus(); expect(document.activeElement).toBe(choices[0]);
    fireEvent.click(choices[0]);                                                          // UTP for the noisy workshop
    expect(screen.getByRole("status").textContent).toContain("✕ غير صحيح — افحص صفات UTP: غلاف بلاستيكي فقط، بدون طبقة حماية، أرخص وأشيع.");
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ name: "cable-pick", detail: { scenario: "noisy", cable: "utp", right: false } }));
    fireEvent.click(choices[1]);
    expect(screen.getByRole("status").textContent).toContain("✓ صحيح — STP فيه طبقة حماية معدنية.");
    fireEvent.click(screen.getByRole("radio", { name: /وصلة سريعة جدًا/ }));
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getAllByRole("radio").filter(x => x.classList.contains("learning-cable-choice"))[2]);
    expect(screen.getByRole("status").textContent).toContain("✓ صحيح — الألياف تنقل الضوء.");
    expect(screen.getByText("السيناريوهات إضافة تعليمية.")).toBeTruthy();
  });

  it("the shell's reset returns to the first cable with no scenario / verdict", async () => {
    await mount();
    fireEvent.click(screen.getAllByRole("tab")[3]);
    fireEvent.click(screen.getByRole("radio", { name: /شبكة صف عادي/ }));
    fireEvent.click(screen.getAllByRole("radio").filter(x => x.classList.contains("learning-cable-choice"))[0]);
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
    expect(traits()).toEqual(["غلاف بلاستيكي فقط، بدون طبقة حماية", "أرخص وأشيع"]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("malformed config → in-stage note; unsupported version → the faithful static fallback text; reduced motion marks the surface", async () => {
    const { container, unmount } = render(<LearningActivityHost block={{ ...block, config: { cables: [{ id: "x", name: "X", traits: ["a"] }] } }} courseId="791381" />);
    await waitFor(() => { if (!container.querySelector(".learning-cable-empty")) throw new Error("not yet"); });
    expect(screen.getByRole("note").textContent).toContain("غير متوفر حاليًا");
    unmount();
    const r2 = render(<LearningActivityHost block={{ ...block, version: 9 }} courseId="791381" />);
    expect(screen.getByText(/Fiber Optic: ينقل الضوء/)).toBeTruthy();
    r2.unmount();
    const mql = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    const orig = window.matchMedia; (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
    try {
      const r3 = render(<LearningActivityHost block={block} courseId="791381" />);
      await waitFor(() => { if (!r3.container.querySelector(".learning-cable")) throw new Error("not yet"); });
      expect(r3.container.querySelector(".learning-cable")!.getAttribute("data-reduced-motion")).toBe("true");
    } finally { (window as unknown as { matchMedia: unknown }).matchMedia = orig; }
  });
});
