// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import {
  demoActivityRegistry, simBlock, commandsBlock, overclaimingBlock, unregisteredBlock, unsupportedVersionBlock, throwingBlock,
} from "./activityFixtures";
import type { LearningActivityEvent } from "./engine";

afterEach(cleanup);

const ofType = (emit: ReturnType<typeof vi.fn>, type: LearningActivityEvent["type"]) =>
  emit.mock.calls.map(c => c[0] as LearningActivityEvent).filter(e => e.type === type);

describe("Phase 3A — LearningActivityHost: static fallback (the production path)", () => {
  it("with the default (EMPTY production) registry, renders the faithful static fallback — no live activity", () => {
    const { container } = render(<LearningActivityHost block={simBlock} courseId="791381" />);
    expect(container.querySelector(".learning-activity-fallback")).toBeTruthy();
    expect(screen.getByText("محاكاة تفاعلية")).toBeTruthy();        // kind kicker
    expect(screen.getByText("محاكاة VLAN")).toBeTruthy();           // title
    expect(screen.getByText(/سيتوفر هذا النشاط التفاعلي لاحقًا/)).toBeTruthy();
    expect(screen.queryByTestId("demo-activity")).toBeNull();
  });

  it("falls back for an unregistered key and for an unsupported version", () => {
    const { rerender, container } = render(<LearningActivityHost block={unregisteredBlock} courseId="791381" registry={demoActivityRegistry} />);
    expect(container.querySelector(".learning-activity-fallback")).toBeTruthy();
    rerender(<LearningActivityHost block={unsupportedVersionBlock} courseId="791381" registry={demoActivityRegistry} />);
    expect(container.querySelector(".learning-activity-fallback")).toBeTruthy();
    expect(screen.queryByTestId("demo-activity")).toBeNull();
  });

  it("the fallback NEVER claims teacher enrichment is book content — even when the block is ASSOCIATED with a book page", () => {
    // unregisteredBlock carries a block-level book `source` (association) but its origin is teacher-enrichment
    const { container } = render(<LearningActivityHost block={unregisteredBlock} courseId="791381" />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("من الكتاب");
    expect(text).toContain("عرض بديل ثابت للنشاط التفاعلي");
  });
});

describe("Phase 3A — LearningActivityHost: live renderer via injected registry", () => {
  it("resolves + lazily loads the trusted component, injecting courseId / reducedMotion / fullscreen, and emits ready once", async () => {
    const emit = vi.fn();
    render(<LearningActivityHost block={simBlock} courseId="791381" registry={demoActivityRegistry} emit={emit} />);
    const demo = await screen.findByTestId("demo-activity");
    expect(demo.getAttribute("data-fullscreen")).toBe("false");
    await waitFor(() => expect(ofType(emit, "ready")).toEqual([{ type: "ready", activityId: "sb-sim", kind: "simulation", key: "vlan" }]));
  });

  it("forwards interaction events from the live activity to the injected sink", async () => {
    const emit = vi.fn();
    render(<LearningActivityHost block={simBlock} courseId="791381" registry={demoActivityRegistry} emit={emit} />);
    fireEvent.click(await screen.findByRole("button", { name: "زِد" }));
    expect(emit).toHaveBeenCalledWith({ type: "interaction", activityId: "sb-sim", name: "increment" });
  });

  it("catches a throwing renderer via the boundary → static fallback + an error event (never crashes)", async () => {
    const emit = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<LearningActivityHost block={throwingBlock} courseId="791381" registry={demoActivityRegistry} emit={emit} />);
    await waitFor(() => expect(container.querySelector(".learning-activity-fallback")).toBeTruthy());
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "error", activityId: "sb-throw" }));
    spy.mockRestore();
  });
});

describe("Phase 3A — fullscreen: ONE live instance, state preserved, no duplicate events", () => {
  it("interact → open fullscreen → single renderer with preserved state → close → same state; ready/fullscreen emitted once each", async () => {
    const emit = vi.fn();
    const { container } = render(<LearningActivityHost block={simBlock} courseId="791381" registry={demoActivityRegistry} emit={emit} />);
    const demo = await screen.findByTestId("demo-activity");
    // 1–2: change the activity's internal state
    fireEvent.click(screen.getByRole("button", { name: "زِد" }));
    fireEvent.click(screen.getByRole("button", { name: "زِد" }));
    expect(screen.getByTestId("counter").textContent).toBe("2");
    // 3: open fullscreen
    fireEvent.click(screen.getByRole("button", { name: "توسيع" }));
    const dialog = await screen.findByRole("dialog", { name: "محاكاة VLAN" });
    expect(dialog.classList.contains("is-fullscreen")).toBe(true);
    // 4: exactly ONE live renderer, and it is the SAME element (never remounted / duplicated)
    expect(screen.getAllByTestId("demo-activity").length).toBe(1);
    expect(screen.getByTestId("demo-activity")).toBe(demo);
    expect(within(dialog).getByTestId("demo-activity").getAttribute("data-fullscreen")).toBe("true");
    // 5: interaction state preserved
    expect(screen.getByTestId("counter").textContent).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "زِد" }));
    expect(screen.getByTestId("counter").textContent).toBe("3");
    // 6: close (Escape through the shared focus trap)
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(container.querySelector(".learning-activity.is-fullscreen")).toBeNull();
    // 7: same instance, same state
    expect(screen.getAllByTestId("demo-activity").length).toBe(1);
    expect(screen.getByTestId("demo-activity")).toBe(demo);
    expect(screen.getByTestId("counter").textContent).toBe("3");
    // 8–9: no duplicate ready; exactly one open + one close fullscreen event; interaction stream = 3 increments
    await waitFor(() => expect(ofType(emit, "ready").length).toBe(1));
    expect(ofType(emit, "fullscreen")).toEqual([
      { type: "fullscreen", activityId: "sb-sim", open: true },
      { type: "fullscreen", activityId: "sb-sim", open: false },
    ]);
    expect(ofType(emit, "interaction").length).toBe(3);
  });

  it("the toggle control closes fullscreen too and returns to the inline layout", async () => {
    render(<LearningActivityHost block={simBlock} courseId="791381" registry={demoActivityRegistry} />);
    await screen.findByTestId("demo-activity");
    fireEvent.click(screen.getByRole("button", { name: "توسيع" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "توسيع" })).toBeTruthy();
  });
});

describe("Phase 3A — capabilities: controls appear ONLY when the RENDERER declares them", () => {
  it("a renderer declaring reset + replay gets both generic controls; they drive the renderer and emit events", async () => {
    const emit = vi.fn();
    render(<LearningActivityHost block={commandsBlock} courseId="791381" registry={demoActivityRegistry} emit={emit} />);
    await screen.findByTestId("demo-activity");
    fireEvent.click(screen.getByRole("button", { name: "زِد" }));
    expect(screen.getByTestId("counter").textContent).toBe("1");
    // reset → renderer state back to 0 + `reset` event
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    await waitFor(() => expect(screen.getByTestId("counter").textContent).toBe("0"));
    expect(emit).toHaveBeenCalledWith({ type: "reset", activityId: "sb-cmd" });
    // replay → renderer reacts + `replayed` event
    fireEvent.click(screen.getByRole("button", { name: "إعادة التشغيل" }));
    await waitFor(() => expect(screen.getByTestId("demo-activity").getAttribute("data-replays")).toBe("1"));
    expect(emit).toHaveBeenCalledWith({ type: "replayed", activityId: "sb-cmd" });
    // this renderer did NOT declare fullscreen → no توسيع control (no fake button)
    expect(screen.queryByRole("button", { name: "توسيع" })).toBeNull();
  });

  it("a renderer declaring nothing shows NO control — even when CONTENT claims every capability (registry authority)", async () => {
    render(<LearningActivityHost block={overclaimingBlock} courseId="791381" registry={demoActivityRegistry} />);
    await screen.findByTestId("demo-activity");
    expect(screen.queryByRole("button", { name: "توسيع" })).toBeNull();
    expect(screen.queryByRole("button", { name: "إعادة تعيين" })).toBeNull();
    expect(screen.queryByRole("button", { name: "إعادة التشغيل" })).toBeNull();
    expect(document.querySelectorAll(".learning-activity-ctl").length).toBe(0);
  });

  it("a renderer declaring only fullscreen shows only توسيع (no reset/replay)", async () => {
    render(<LearningActivityHost block={simBlock} courseId="791381" registry={demoActivityRegistry} />);
    await screen.findByTestId("demo-activity");
    expect(screen.getByRole("button", { name: "توسيع" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "إعادة تعيين" })).toBeNull();
    expect(screen.queryByRole("button", { name: "إعادة التشغيل" })).toBeNull();
  });
});
