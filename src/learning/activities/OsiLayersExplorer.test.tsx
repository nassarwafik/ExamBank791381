// @vitest-environment happy-dom
// Batch 3 — interactive-diagram/osi-layers/v1: exact identity, lazy load, the seven layers drawn top (7) to bottom (1)
// as real keyboard-usable buttons; pressing a layer shows its function as TEXT in a status region; the send/receive
// radio changes the step numbers (send: 7 is step 1; receive: 1 is step 1) and the prose note; reset; reduced-motion
// attribute; malformed config → note; unsupported version → text fallback; no network.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { InteractiveDiagramBlock } from "../content/types";

afterEach(() => { cleanup(); });

const layers = [
  { number: 7, name: "Application", arabic: "التطبيق", token: "App", role: "الطبقة الأقرب للمستخدم." },
  { number: 6, name: "Presentation", arabic: "العرض", token: "Pres", role: "تنسيق وتشفير البيانات." },
  { number: 5, name: "Session", arabic: "الجلسة", token: "Sess", role: "تفتح الاتصال وتديره." },
  { number: 4, name: "Transport", arabic: "النقل", token: "TCP/UDP", role: "تنظّم وصول البيانات." },
  { number: 3, name: "Network", arabic: "الشبكة", token: "IP", role: "تختار الطريق باستخدام IP." },
  { number: 2, name: "Data Link", arabic: "ربط البيانات", token: "MAC", role: "تنقل Frame داخل الشبكة." },
  { number: 1, name: "Physical", arabic: "الفيزيائية", token: "Cable", role: "الكابلات، الإشارات، الواي فاي." },
];
const block: InteractiveDiagramBlock = {
  id: "osi1", type: "interactive-diagram", origin: "teacher-enrichment", interactionType: "osi-layers", version: 1,
  title: "استكشف طبقات OSI السبع", source: { kind: "book", sourceId: "791381", pdfPageStart: 80 },
  capabilities: { fullscreen: true, reset: true, interactive: true },
  fallback: { text: "طبقات OSI من الأعلى إلى الأسفل: 7 Application … 1 Physical." },
  config: {
    // deliberately shuffled: the renderer must sort top (7) → bottom (1) itself
    layers: [layers[3], layers[0], layers[6], layers[1], layers[5], layers[2], layers[4]],
    sendLabel: "إرسال", receiveLabel: "استقبال", sendNote: "عند الإرسال ننزل من 7 إلى 1.", receiveNote: "عند الاستقبال نصعد من 1 إلى 7.",
    upperLabel: "الطبقات العليا: أقرب للمستخدم", lowerLabel: "الطبقات الدنيا: تنقل البيانات فعليًا",
  },
};
const mount = async (b: InteractiveDiagramBlock = block) => { const r = render(<LearningActivityHost block={b} courseId="791381" />); await waitFor(() => { if (!r.container.querySelector(".learning-osi")) throw new Error("not yet"); }); return r; };
const layerButtons = () => [...document.querySelectorAll<HTMLButtonElement>(".learning-osi-layer")];
const steps = () => layerButtons().map(b => b.querySelector(".learning-osi-step")!.textContent);
const status = () => screen.getByRole("status").textContent ?? "";

describe("registry identity", () => {
  it("resolves interactive-diagram/osi-layers/v1 only", () => {
    expect(productionActivityRegistry.resolve(block)?.key).toBe("osi-layers");
    expect(productionActivityRegistry.resolve({ ...block, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...block, interactionType: "osi-stack" })).toBeUndefined();
  });
});

describe("behaviour", () => {
  it("draws the seven layers as real buttons top (7) → bottom (1) whatever the config order, with number, name, Arabic and token as text; upper/lower group labels; no fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = await mount();
    const btns = layerButtons();
    expect(btns.length).toBe(7);
    expect(btns.every(b => b.tagName === "BUTTON" && b.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(btns.map(b => b.querySelector(".learning-osi-number")!.textContent)).toEqual(["7", "6", "5", "4", "3", "2", "1"]);
    expect(btns.map(b => b.querySelector(".learning-osi-name > span")!.textContent)).toEqual(["Application", "Presentation", "Session", "Transport", "Network", "Data Link", "Physical"]);
    expect(btns.map(b => b.querySelector(".learning-osi-token")!.textContent)).toEqual(["App", "Pres", "Sess", "TCP/UDP", "IP", "MAC", "Cable"]);
    expect(btns[6].textContent).toContain("الفيزيائية");
    expect([...container.querySelectorAll(".learning-osi-row.is-upper")].length).toBe(3);
    expect([...container.querySelectorAll(".learning-osi-row.is-lower")].length).toBe(4);
    expect([...container.querySelectorAll(".learning-osi-group")].map(g => g.textContent)).toEqual(["الطبقات العليا: أقرب للمستخدم", "الطبقات الدنيا: تنقل البيانات فعليًا"]);
    btns[3].focus(); expect(document.activeElement).toBe(btns[3]);
    expect(status()).toBe("اضغط على طبقة لتقرأ وظيفتها بكلمات قليلة.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("pressing a layer shows its function as TEXT (number + name + Arabic + role) in the status region; pressing again or another layer updates it", async () => {
    await mount();
    fireEvent.click(layerButtons()[5]);                          // Data Link
    expect(layerButtons()[5].getAttribute("aria-pressed")).toBe("true");
    expect(status()).toBe("2 Data Link (ربط البيانات): تنقل Frame داخل الشبكة.");
    fireEvent.click(layerButtons()[0]);                          // Application
    expect(layerButtons().map(b => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false", "false", "false", "false"]);
    expect(status()).toBe("7 Application (التطبيق): الطبقة الأقرب للمستخدم.");
    fireEvent.click(layerButtons()[0]);                          // toggle off
    expect(status()).toBe("اضغط على طبقة لتقرأ وظيفتها بكلمات قليلة.");
  });

  it("send is the default (7 = الخطوة 1 … 1 = الخطوة 7); the receive radio flips the numbering (1 = الخطوة 1) and the prose note; labels are prose «من X إلى Y», never arrows", async () => {
    const { container } = await mount();
    const radios = screen.getAllByRole("radio");
    expect(radios.map(r => [r.textContent, r.getAttribute("aria-checked")])).toEqual([["إرسال: من 7 إلى 1", "true"], ["استقبال: من 1 إلى 7", "false"]]);
    expect(steps()).toEqual(["الخطوة 1", "الخطوة 2", "الخطوة 3", "الخطوة 4", "الخطوة 5", "الخطوة 6", "الخطوة 7"]);
    expect(container.querySelector(".learning-osi-note")!.textContent).toBe("عند الإرسال ننزل من 7 إلى 1.");
    expect(container.querySelector(".learning-osi")!.getAttribute("data-direction")).toBe("send");
    fireEvent.click(radios[1]);
    expect(screen.getAllByRole("radio").map(r => r.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    expect(steps()).toEqual(["الخطوة 7", "الخطوة 6", "الخطوة 5", "الخطوة 4", "الخطوة 3", "الخطوة 2", "الخطوة 1"]);
    expect(container.querySelector(".learning-osi-note")!.textContent).toBe("عند الاستقبال نصعد من 1 إلى 7.");
    expect(container.querySelector(".learning-osi")!.getAttribute("data-direction")).toBe("receive");
    expect(container.textContent).not.toMatch(/[←→⇐⇒]/);
    // the selected layer survives a direction change
    fireEvent.click(layerButtons()[6]);
    expect(status()).toContain("1 Physical");
    fireEvent.click(screen.getAllByRole("radio")[0]);
    expect(status()).toContain("1 Physical");
    expect(steps()[6]).toBe("الخطوة 7");
  });

  it("shell reset clears the selection and returns to send", async () => {
    const { container } = await mount();
    fireEvent.click(screen.getAllByRole("radio")[1]);
    fireEvent.click(layerButtons()[2]);
    expect(status()).toContain("5 Session");
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    expect(status()).toBe("اضغط على طبقة لتقرأ وظيفتها بكلمات قليلة.");
    expect(layerButtons().every(b => b.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(container.querySelector(".learning-osi")!.getAttribute("data-direction")).toBe("send");
    expect(steps()[0]).toBe("الخطوة 1");
  });

  it("reduced motion is reflected as a data attribute; malformed config (duplicate numbers / fewer than two layers / non-object) → note; unsupported version → text fallback", async () => {
    const mql = { matches: true, addEventListener: () => {}, removeEventListener: () => {} };
    const orig = window.matchMedia; (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
    try {
      const { container, unmount } = await mount();
      expect(container.querySelector(".learning-osi")!.getAttribute("data-reduced-motion")).toBe("true");
      unmount();
    } finally { (window as unknown as { matchMedia: unknown }).matchMedia = orig; }
    for (const config of [{ layers: [layers[0], { ...layers[1], number: 7 }] }, { layers: [layers[0]] }, { layers: "x" }, undefined]) {
      const { container, unmount } = render(<LearningActivityHost block={{ ...block, config }} courseId="791381" />);
      await waitFor(() => { if (!container.querySelector(".learning-osi-empty")) throw new Error("not yet"); });
      expect(container.querySelector(".learning-osi-layer")).toBeNull();
      unmount();
    }
    // a layer missing its role is skipped, the rest still render (defensive, never throws)
    const { container, unmount } = await mount({ ...block, config: { layers: [layers[0], { number: 3, name: "Network" }, layers[6]] } });
    expect(layerButtons().length).toBe(2);
    expect(container.querySelectorAll(".learning-osi-row.is-upper").length).toBe(0);   // fewer than five layers → no upper group
    unmount();
    render(<LearningActivityHost block={{ ...block, version: 7 }} courseId="791381" />);
    expect(screen.getByText(/1 Physical/)).toBeTruthy();
    expect(document.querySelector(".learning-osi")).toBeNull();
  });
});
