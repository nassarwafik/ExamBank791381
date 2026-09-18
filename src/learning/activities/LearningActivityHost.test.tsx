// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import {
  demoActivityRegistry, simBlock, unregisteredBlock, unsupportedVersionBlock, throwingBlock,
} from "./activityFixtures";

afterEach(cleanup);

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
});

describe("Phase 3A — LearningActivityHost: live renderer via injected registry", () => {
  it("resolves + lazily loads the trusted component, injecting courseId / reducedMotion / fullscreen, and emits ready", async () => {
    const emit = vi.fn();
    render(<LearningActivityHost block={simBlock} courseId="791381" registry={demoActivityRegistry} emit={emit} />);
    const demo = await screen.findByTestId("demo-activity");
    expect(demo.getAttribute("data-course")).toBe("791381");
    expect(demo.getAttribute("data-reduced-motion")).toBe("false");
    expect(demo.getAttribute("data-fullscreen")).toBe("false");
    await waitFor(() => expect(emit).toHaveBeenCalledWith({ type: "ready", activityId: "sb-sim", kind: "simulation", key: "vlan" }));
  });

  it("forwards interaction events from the live activity to the injected sink", async () => {
    const emit = vi.fn();
    render(<LearningActivityHost block={simBlock} courseId="791381" registry={demoActivityRegistry} emit={emit} />);
    fireEvent.click(await screen.findByRole("button", { name: "تفاعل تجريبي" }));
    expect(emit).toHaveBeenCalledWith({ type: "interaction", activityId: "sb-sim", name: "tick" });
  });

  it("opens a fullscreen Dialog for a fullscreen-capable activity and emits open/close", async () => {
    const emit = vi.fn();
    render(<LearningActivityHost block={simBlock} courseId="791381" registry={demoActivityRegistry} emit={emit} />);
    await screen.findByTestId("demo-activity");
    fireEvent.click(screen.getByRole("button", { name: "توسيع" }));
    const dialog = await screen.findByRole("dialog");
    expect(emit).toHaveBeenCalledWith({ type: "fullscreen", activityId: "sb-sim", open: true });
    // the activity inside the dialog is told it is fullscreen
    expect(within(dialog).getByTestId("demo-activity").getAttribute("data-fullscreen")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(emit).toHaveBeenCalledWith({ type: "fullscreen", activityId: "sb-sim", open: false }));
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
