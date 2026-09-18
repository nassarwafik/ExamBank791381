// @vitest-environment happy-dom
// Phase 3A — the BUILT-IN guided presenter (حل مع المعلم): structured steps, progressive reveal, restart through
// the shell's generic reset, keyboard-operable buttons, reduced-motion hook, no persistence. Rendered through the
// host with NO registry (guided is built-in, so the production activity registry stays empty).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { guidedBlock, unknownGuidedBlock, futureVersionGuidedBlock, demoActivityRegistry } from "./activityFixtures";
import { builtinActivityRegistry, GUIDED_REVEAL_IDENTITY } from "./builtins";
import { productionActivityRegistry } from "./engine";

afterEach(cleanup);

const stepsShown = () => document.querySelectorAll(".learning-guided-step").length;

describe("Phase 3A — built-in resolution is by EXACT {kind, key, version}, never by block type", () => {
  it("the built-in registry owns exactly guided/reveal/v1, and the production registry stays empty", () => {
    expect(GUIDED_REVEAL_IDENTITY).toEqual({ kind: "guided", key: "reveal", version: 1 });
    expect(builtinActivityRegistry.list()).toEqual([{ kind: "guided", key: "reveal", versions: [1] }]);
    expect(builtinActivityRegistry.resolve(guidedBlock)?.key).toBe("reveal");
    expect(productionActivityRegistry.size).toBe(0);
    expect(productionActivityRegistry.resolve(guidedBlock)).toBeUndefined();   // no registry entry needed for the built-in
  });

  it("guidedType:'reveal', version:1 → the live built-in presenter (with the default/empty registry)", () => {
    const { container } = render(<LearningActivityHost block={guidedBlock} courseId="791381" />);
    expect(container.querySelector(".learning-guided")).toBeTruthy();
    expect(container.querySelector(".learning-activity-fallback")).toBeNull();
  });

  it("an UNKNOWN guided key → static fallback (does not silently render the reveal presenter), and does not crash", () => {
    const { container } = render(<LearningActivityHost block={unknownGuidedBlock} courseId="791381" registry={demoActivityRegistry} />);
    expect(container.querySelector(".learning-guided")).toBeNull();
    expect(container.querySelector(".learning-activity-fallback")).toBeTruthy();
    expect(screen.getByText("مسار متفرّع مستقبلي")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /اعرض الخطوة/ })).toBeNull();
    expect(screen.getByText(/عرض بديل ثابت للنشاط التفاعلي/)).toBeTruthy();
  });

  it("guidedType:'reveal', version:99 (unsupported) → static fallback, not the v1 presenter", () => {
    const { container } = render(<LearningActivityHost block={futureVersionGuidedBlock} courseId="791381" />);
    expect(container.querySelector(".learning-guided")).toBeNull();
    expect(container.querySelector(".learning-activity-fallback")).toBeTruthy();
    expect(screen.getByText("كشف تدريجي إصدار 99")).toBeTruthy();
  });
});

describe("Phase 3A — GuidedActivity progressive reveal", () => {
  it("renders through the host WITHOUT any registry entry (built-in), showing prompt + think-first and no steps yet", () => {
    const { container } = render(<LearningActivityHost block={guidedBlock} courseId="791381" />);
    expect(container.querySelector(".learning-activity-fallback")).toBeNull();   // NOT the static fallback
    expect(screen.getByText(/المطلوب: تحويل العدد/)).toBeTruthy();                // prompt (structured spans)
    expect(screen.getByText(/فكّر أولًا/)).toBeTruthy();                            // think first
    expect(stepsShown()).toBe(0);
    expect(screen.getByText("الخطوة 0 من 3")).toBeTruthy();
    expect(screen.queryByText("00101100")).toBeNull();                              // result hidden until the end
  });

  it("reveals steps one at a time in order, then the result + explanation, emitting reveal interactions", async () => {
    const emit = vi.fn();
    render(<LearningActivityHost block={guidedBlock} courseId="791381" emit={emit} />);
    fireEvent.click(screen.getByRole("button", { name: "اعرض الخطوة الأولى" }));
    expect(stepsShown()).toBe(1);
    expect(document.querySelector(".learning-guided-step")?.getAttribute("data-step-id")).toBe("g1");
    expect(screen.queryByText(/فكّر أولًا/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "اعرض الخطوة التالية" }));
    expect(stepsShown()).toBe(2);
    expect(screen.getByText("المتبقي 12")).toBeTruthy();                            // step note
    expect(screen.queryByText("00101100")).toBeNull();                              // still hidden
    fireEvent.click(screen.getByRole("button", { name: "اعرض الخطوة التالية" }));
    expect(stepsShown()).toBe(3);
    expect(screen.getByText("00101100")).toBeTruthy();                              // result
    expect(screen.getByText(/اجمع القيم التي تحتها 1/)).toBeTruthy();               // explanation
    expect(screen.getByText("الخطوة 3 من 3")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /اعرض الخطوة/ })).toBeNull();      // nothing left to reveal
    await waitFor(() => expect(emit).toHaveBeenCalledWith({ type: "interaction", activityId: "sb-guided", name: "guided-reveal", detail: { step: 3, of: 3 } }));
  });

  it("restarts through the shell's generic reset control (declared by the built-in), back to zero steps", async () => {
    const emit = vi.fn();
    render(<LearningActivityHost block={guidedBlock} courseId="791381" emit={emit} />);
    fireEvent.click(screen.getByRole("button", { name: "اعرض الخطوة الأولى" }));
    fireEvent.click(screen.getByRole("button", { name: "اعرض الخطوة التالية" }));
    expect(stepsShown()).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    await waitFor(() => expect(stepsShown()).toBe(0));
    expect(screen.getByText(/فكّر أولًا/)).toBeTruthy();
    expect(screen.getByText("الخطوة 0 من 3")).toBeTruthy();
    expect(emit).toHaveBeenCalledWith({ type: "reset", activityId: "sb-guided" });
  });

  it("is keyboard-operable (real buttons) and exposes the reduced-motion hook; uses no raw HTML", () => {
    const { container } = render(<LearningActivityHost block={guidedBlock} courseId="791381" />);
    const btn = screen.getByRole("button", { name: "اعرض الخطوة الأولى" });
    expect(btn.tagName).toBe("BUTTON");
    btn.focus();
    expect(document.activeElement).toBe(btn);
    expect(container.querySelector(".learning-guided")).toBeTruthy();
    expect(container.innerHTML).not.toContain("<script");
    // structured spans rendered as real elements (code span with ltr), never innerHTML
    expect(container.querySelector(".learning-guided-prompt code[dir=ltr]")?.textContent).toBe("44");
  });
});
