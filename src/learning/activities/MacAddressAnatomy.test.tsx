// @vitest-environment happy-dom
// Units 7–8 — interactive-diagram/mac-address-anatomy/v1: exact identity, lazy load, the example MAC as SIX LTR
// two-digit groups (12 hex digits, stated in words), group press names the two digits, the broadcast toggle shows
// FF:FF:FF:FF:FF:FF with its meaning, the "which string has the MAC shape?" task with immediate feedback, keyboard,
// shell reset, malformed config → note, unsupported version → faithful text fallback, reduced-motion hook, no network.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { InteractiveDiagramBlock } from "../content/types";

afterEach(cleanup);

const MAC = "A0:02:AF:2D:10:22";
const BCAST = "FF:FF:FF:FF:FF:FF";
const block: InteractiveDiagramBlock = {
  id: "mac1", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "mac-address-anatomy", version: 1,
  title: "شكل عنوان MAC", source: { kind: "book", sourceId: "791381", pdfPageStart: 64 },
  capabilities: { fullscreen: true, reset: true },
  fallback: { text: "عنوان MAC 12 منزلة سداسية عشرية مثل A0:02:AF:2D:10:22؛ عنوان البث FF:FF:FF:FF:FF:FF." },
  config: {
    example: MAC, broadcast: BCAST, broadcastLabel: "عنوان البث Broadcast", normalLabel: "عنوان جهاز",
    facts: ["رقم فيزيائي خاص بكرت الشبكة", "12 منزلة سداسية عشرية", "الطبقة الثانية من نموذج OSI", "يستخدمه Switch لمعرفة الجهاز المقصود"],
    hexDigits: "0 1 2 3 4 5 6 7 8 9 A B C D E F",
    task: {
      prompt: "أي نص له شكل عنوان MAC؟",
      candidates: [
        { value: "192.168.1.10", why: "هذا عنوان IP." },
        { value: MAC, why: "ستّ مجموعات × منزلتان = 12 منزلة." },
        { value: "A0:02:AF:2D", why: "أربع مجموعات فقط." },
        { value: "255.255.255.0", why: "هذا قناع شبكة." },
      ],
    },
  },
};
const mount = async () => { const r = render(<LearningActivityHost block={block} courseId="791381" />); await waitFor(() => { if (!r.container.querySelector(".learning-mac-row")) throw new Error("not yet"); }); return r; };
const groups = (c: HTMLElement) => [...c.querySelectorAll(".learning-mac-value")].map(v => v.textContent);

describe("registry identity", () => {
  it("resolves interactive-diagram/mac-address-anatomy/v1 only", () => {
    expect(productionActivityRegistry.resolve(block)?.key).toBe("mac-address-anatomy");
    expect(productionActivityRegistry.resolve({ ...block, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...block, interactionType: "mac-lookup" })).toBeUndefined();
  });
});

describe("behaviour", () => {
  it("renders the example MAC as six LTR groups (12 digits stated in words); pressing a group names its two digits; the facts and hex digits are text", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = await mount();
    const row = container.querySelector(".learning-mac-row")!;
    expect(row.getAttribute("dir")).toBe("ltr");
    expect(row.getAttribute("aria-label")).toBe(MAC);
    expect(groups(container)).toEqual(["A0", "02", "AF", "2D", "10", "22"]);
    expect(screen.getByText("6 مجموعات × 2 = 12 منزلة سداسية عشرية")).toBeTruthy();
    const g3 = screen.getByRole("button", { name: "المجموعة 3: AF" });
    expect(g3.tagName).toBe("BUTTON");
    g3.focus(); expect(document.activeElement).toBe(g3);
    fireEvent.click(g3);
    expect(g3.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".learning-mac-line")!.textContent).toBe("المجموعة 3: AF — المنزلتان A و F");
    expect([...container.querySelectorAll(".learning-mac-line code")].every(c => c.getAttribute("dir") === "ltr")).toBe(true);
    expect(screen.getByText("يستخدمه Switch لمعرفة الجهاز المقصود")).toBeTruthy();
    expect(screen.getByText("0 1 2 3 4 5 6 7 8 9 A B C D E F")).toBeTruthy();
    expect(container.textContent).not.toMatch(/OUI|vendor/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the broadcast toggle shows FF:FF:FF:FF:FF:FF (LTR) with its meaning «للجميع»; switching back restores the example", async () => {
    const { container } = await mount();
    fireEvent.click(screen.getByRole("radio", { name: "عنوان البث Broadcast" }));
    expect(groups(container)).toEqual(["FF", "FF", "FF", "FF", "FF", "FF"]);
    expect(container.querySelector(".learning-mac-row")!.getAttribute("aria-label")).toBe(BCAST);
    const line = container.querySelector(".learning-mac-line.is-broadcast")!;
    expect(line.textContent).toContain("كل المنازل F");
    expect(line.textContent).toContain("الرسالة للجميع داخل الشبكة");
    expect(line.querySelector("code")!.getAttribute("dir")).toBe("ltr");
    expect(container.querySelector(".learning-mac")!.getAttribute("data-broadcast")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "عنوان جهاز" }));
    expect(groups(container)).toEqual(["A0", "02", "AF", "2D", "10", "22"]);
  });

  it("the shape task: only the 12-hex-digit / six-group string is right; wrong picks explain with «افحص الشكل»; keyboard-usable; reset clears", async () => {
    const emit = vi.fn();
    const r = render(<LearningActivityHost block={block} courseId="791381" emit={emit} />);
    await waitFor(() => { if (!r.container.querySelector(".learning-mac-task")) throw new Error("not yet"); });
    const options = screen.getAllByRole("radio").filter(x => x.classList.contains("learning-mac-option"));
    expect(options.map(o => o.textContent)).toEqual(["192.168.1.10", MAC, "A0:02:AF:2D", "255.255.255.0"]);
    expect(options.every(o => o.tagName === "BUTTON" && o.querySelector("span")!.getAttribute("dir") === "ltr")).toBe(true);
    fireEvent.click(options[0]);
    expect(screen.getByRole("status").textContent).toContain("✕ غير صحيح — افحص الشكل: هذا عنوان IP.");
    fireEvent.click(options[2]);
    expect(screen.getByRole("status").textContent).toContain("أربع مجموعات فقط.");
    fireEvent.click(options[1]);
    expect(screen.getByRole("status").textContent).toContain("✓ صحيح — ستّ مجموعات × منزلتان = 12 منزلة.");
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ name: "mac-task", detail: { value: MAC, right: true } }));
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("radio", { name: "عنوان جهاز" }).getAttribute("aria-checked")).toBe("true");
  });

  it("malformed config (example is not a MAC) → note; unsupported version → faithful fallback; reduced motion marks the surface", async () => {
    const { container, unmount } = render(<LearningActivityHost block={{ ...block, config: { example: "192.168.1.1" } }} courseId="791381" />);
    await waitFor(() => { if (!container.querySelector(".learning-mac-empty")) throw new Error("not yet"); });
    expect(screen.getByRole("note").textContent).toContain("غير متوفر حاليًا");
    unmount();
    const r2 = render(<LearningActivityHost block={{ ...block, version: 9 }} courseId="791381" />);
    expect(screen.getByText(/عنوان البث FF:FF:FF:FF:FF:FF/)).toBeTruthy();
    r2.unmount();
    const mql = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    const orig = window.matchMedia; (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
    try {
      const r3 = render(<LearningActivityHost block={block} courseId="791381" />);
      await waitFor(() => { if (!r3.container.querySelector(".learning-mac")) throw new Error("not yet"); });
      expect(r3.container.querySelector(".learning-mac")!.getAttribute("data-reduced-motion")).toBe("true");
    } finally { (window as unknown as { matchMedia: unknown }).matchMedia = orig; }
  });
});
