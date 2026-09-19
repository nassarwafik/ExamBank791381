// @vitest-environment happy-dom
// Units 4–6 — interactive-diagram/cidr-network-host/v1: resolves by exact identity through the production registry,
// lazy-loads, shows /8 /16 /24 as the book's whole-octet groups with TEXT badges (never colour-only) and LTR order,
// deterministic transitions between examples/prefixes, a keyboard-usable "same network" task with immediate feedback,
// shell reset, graceful fallback on malformed config, reduced-motion data hook, no network.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { InteractiveDiagramBlock } from "../content/types";

afterEach(cleanup);

const block: InteractiveDiagramBlock = {
  id: "cidr1", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "cidr-network-host", version: 1,
  title: "أين ينتهي جزء الشبكة؟", source: { kind: "book", sourceId: "791381", pdfPageStart: 40 },
  capabilities: { fullscreen: true, reset: true },
  fallback: { text: "العنوان 192.168.10.10: مع /24 جزء الشبكة 192.168.10 والقسم الأخير 10 للجهاز." },
  config: {
    examples: [{ address: "192.168.10.10", label: "المثال الأول" }, { address: "10.138.10.1", label: "المثال الثاني" }, { address: "172.18.200.100", label: "المثال الثالث" }],
    prefixes: [8, 16, 24], initialPrefix: 24, networkLabel: "شبكة", hostLabel: "جهاز",
    note: "كلما كبر الرقم اتّسع جزء الشبكة وضاق جزء الجهاز.",
    task: { prompt: "مهمة: اختر عنوانًا لجهاز آخر في نفس الشبكة.", pick: "اختر" },
  },
};
const badges = (c: HTMLElement) => [...c.querySelectorAll(".learning-cidr-badge")].map(b => b.textContent);
const values = (c: HTMLElement) => [...c.querySelectorAll(".learning-cidr-value")].map(b => b.textContent);
const detail = (c: HTMLElement) => [...c.querySelectorAll(".learning-cidr-line code")].map(x => x.textContent);

describe("registry identity", () => {
  it("resolves interactive-diagram/cidr-network-host/v1 only", () => {
    expect(productionActivityRegistry.resolve(block)?.key).toBe("cidr-network-host");
    expect(productionActivityRegistry.resolve({ ...block, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...block, interactionType: "cidr-calculator" })).toBeUndefined();
  });
});

describe("behaviour", () => {
  it("/24 by default: LTR octets 192.168.10.10 with badges شبكة×3 + جهاز; /16 and /8 regroup deterministically; detail names both parts", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<LearningActivityHost block={block} courseId="791381" />);
    await waitFor(() => { if (!container.querySelector(".learning-cidr-row")) throw new Error("not yet"); });
    expect(container.querySelector(".learning-cidr-row")!.getAttribute("dir")).toBe("ltr");
    expect(values(container)).toEqual(["192", "168", "10", "10"]);
    expect(badges(container)).toEqual(["شبكة", "شبكة", "شبكة", "جهاز"]);
    expect(detail(container)).toEqual(["192.168.10", "10"]);
    fireEvent.click(screen.getByRole("radio", { name: "/16 قسمان للشبكة" }));
    expect(badges(container)).toEqual(["شبكة", "شبكة", "جهاز", "جهاز"]);
    expect(detail(container)).toEqual(["192.168", "10.10"]);
    fireEvent.click(screen.getByRole("radio", { name: "/8 قسم واحد للشبكة" }));
    expect(badges(container)).toEqual(["شبكة", "جهاز", "جهاز", "جهاز"]);
    expect(detail(container)).toEqual(["192", "168.10.10"]);
    expect(screen.getByRole("radio", { name: "/8 قسم واحد للشبكة" }).getAttribute("aria-checked")).toBe("true");
    // switching the example keeps the chosen prefix
    fireEvent.click(screen.getByRole("button", { name: "المثال الثالث 172.18.200.100" }));
    expect(values(container)).toEqual(["172", "18", "200", "100"]);
    expect(detail(container)).toEqual(["172", "18.200.100"]);
    expect(screen.getByText("كلما كبر الرقم اتّسع جزء الشبكة وضاق جزء الجهاز.")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toContain("<script");
  });

  it("the task: three keyboard-usable candidates; the right one keeps the network part and changes the host part; feedback is icon + word; wrong answers explain", async () => {
    const emit = vi.fn();
    const { container } = render(<LearningActivityHost block={block} courseId="791381" emit={emit} />);
    await waitFor(() => { if (!container.querySelector(".learning-cidr-task")) throw new Error("not yet"); });
    const options = screen.getAllByRole("radio").filter(r => r.classList.contains("learning-cidr-option"));
    expect(options.length).toBe(3);
    expect(options.every(o => o.tagName === "BUTTON")).toBe(true);
    options[0].focus(); expect(document.activeElement).toBe(options[0]);
    const texts = options.map(o => o.textContent);
    expect(texts).toContain("192.168.10.10");                                      // the "same address" distractor
    expect(texts).toContain("192.168.10.11");                                      // same network part, host part changed
    expect(texts).toContain("192.168.11.10");                                      // a network octet changed
    fireEvent.click(options[texts.indexOf("192.168.11.10")]);
    expect(screen.getByRole("status").textContent).toContain("✕ غير صحيح — تغيّر قسم من جزء الشبكة");
    fireEvent.click(options[texts.indexOf("192.168.10.10")]);
    expect(screen.getByRole("status").textContent).toContain("العنوان نفسه");
    fireEvent.click(options[texts.indexOf("192.168.10.11")]);
    expect(screen.getByRole("status").textContent).toContain("✓ صحيح — جزء الشبكة كما هو، وجزء الجهاز مختلف.");
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "interaction", name: "cidr-task", detail: { address: "192.168.10.11", right: true } }));
    // changing the prefix withdraws the verdict (no stale state) and regenerates the candidates for /16
    fireEvent.click(screen.getByRole("radio", { name: "/16 قسمان للشبكة" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getAllByRole("radio").filter(r => r.classList.contains("learning-cidr-option")).map(o => o.textContent)).toContain("192.169.10.10");
  });

  it("the shell's reset returns to the first example, the initial prefix and no verdict", async () => {
    const { container } = render(<LearningActivityHost block={block} courseId="791381" />);
    await waitFor(() => { if (!container.querySelector(".learning-cidr-row")) throw new Error("not yet"); });
    fireEvent.click(screen.getByRole("radio", { name: "/8 قسم واحد للشبكة" }));
    fireEvent.click(screen.getByRole("button", { name: "المثال الثاني 10.138.10.1" }));
    fireEvent.click(screen.getAllByRole("radio").filter(r => r.classList.contains("learning-cidr-option"))[0]);
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    expect(values(container)).toEqual(["192", "168", "10", "10"]);
    expect(badges(container)).toEqual(["شبكة", "شبكة", "شبكة", "جهاز"]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("malformed config (no valid example / no prefixes) degrades to the in-stage note, never a crash; a missing renderer version shows the static fallback", async () => {
    const { container, unmount } = render(<LearningActivityHost block={{ ...block, config: { examples: [{ address: "999.1.1.1" }], prefixes: [8] } }} courseId="791381" />);
    await waitFor(() => { if (!container.querySelector(".learning-cidr-empty")) throw new Error("not yet"); });
    expect(screen.getByRole("note").textContent).toContain("غير متوفر حاليًا");
    unmount();
    render(<LearningActivityHost block={{ ...block, version: 9 }} courseId="791381" />);
    expect(screen.getByText(/جزء الشبكة 192.168.10 والقسم الأخير 10 للجهاز/)).toBeTruthy();   // faithful text fallback
  });

  it("reduced motion: the renderer receives the flag and marks the surface", async () => {
    const mql = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    const orig = window.matchMedia; (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
    try {
      const { container } = render(<LearningActivityHost block={block} courseId="791381" />);
      await waitFor(() => { if (!container.querySelector(".learning-cidr")) throw new Error("not yet"); });
      expect(container.querySelector(".learning-cidr")!.getAttribute("data-reduced-motion")).toBe("true");
    } finally { (window as unknown as { matchMedia: unknown }).matchMedia = orig; }
  });
});
