// @vitest-environment happy-dom
// 899371 P11 (docs/enterprise-899371-enrichment-plan.md §7.3, §8) — animation/csharp-scene/v1 (CSharpSceneActivity): exact identity and
// lazy load through the host, then the contract of the style guide on a REAL authored scene (scenes/m01.json): step 1 first, no
// autoplay; «التالي» / «السابق»; «شغّل» walks to the last step and STOPS (no loop); «إيقاف» pauses; the shell reset; the sentence in a
// polite live region with `…` as left-to-right code; the picture is one image with the scene's description; a hidden item is hidden
// from assistive technology; what a step changes is marked; reduced motion; an unreadable scene says so.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import CSharpSceneActivity from "./CSharpSceneActivity";
import { productionActivityRegistry, noopActivityEventSink } from "./engine";
import type { AnimationBlock } from "../content/types";
import m01 from "../content/899371/scenes/m01.json";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const scene = m01.scenes.find(s => s.id === "m01-variable-box")!;
const blockOf = (config: unknown): AnimationBlock => ({
  id: "m01-l01-p02-scene-variable-box", type: "animation", origin: "teacher-enrichment", animationType: "csharp-scene", version: 1, title: "مشهد متحرك: " + scene.title,
  capabilities: { fullscreen: true, reset: true, animated: true, interactive: true }, config: config as AnimationBlock["config"],
});
const N = scene.config.steps.length;
const say = (c: HTMLElement) => c.querySelector(".learning-scene-say")!.textContent!;
const counter = (c: HTMLElement) => c.querySelector(".learning-trace-counter")!.textContent!.replace(/\s+/g, " ").trim();
const plain = (s: string) => s.replace(/`/g, "");
const direct = (props: Partial<{ reset: number; reducedMotion: boolean }> = {}) =>
  <CSharpSceneActivity block={blockOf(scene.config)} courseId="899371" reducedMotion={props.reducedMotion ?? false} fullscreen={false} commands={{ reset: props.reset ?? 0, replay: 0 }} emit={noopActivityEventSink} />;

describe("registry identity", () => {
  it("resolves animation/csharp-scene/v1 only, through its own lazy chunk", async () => {
    expect(productionActivityRegistry.resolve(blockOf(scene.config))?.key).toBe("csharp-scene");
    expect(productionActivityRegistry.resolve({ ...blockOf(scene.config), version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...blockOf(scene.config), animationType: "csharp-scenes" })).toBeUndefined();
    const r = render(<LearningActivityHost block={blockOf(scene.config)} courseId="899371" />);
    await waitFor(() => { if (!r.container.querySelector(".learning-scene")) throw new Error("not yet"); });
    expect(counter(r.container)).toBe("الخطوة 1 / " + N);
  });
});

describe("the scene, step by step", () => {
  it("starts at step 1 with its sentence, and never moves by itself", () => {
    vi.useFakeTimers();
    const { container } = render(direct());
    expect(counter(container)).toBe("الخطوة 1 / " + N);
    expect(say(container)).toBe(plain(scene.config.steps[0].say));
    act(() => { vi.advanceTimersByTime(20000); });
    expect(counter(container)).toBe("الخطوة 1 / " + N);
    const live = container.querySelector(".learning-scene-say")!;
    expect([live.getAttribute("role"), live.getAttribute("aria-live")]).toEqual(["status", "polite"]);
  });

  it("the picture is ONE image named by the scene's description; hidden items are hidden from assistive technology", () => {
    const { container } = render(direct());
    const svg = container.querySelector("svg.learning-scene-svg")!;
    expect([svg.getAttribute("role"), svg.getAttribute("aria-label")]).toEqual(["img", scene.config.alt]);
    const off = [...container.querySelectorAll(".cs-i.is-off")];
    expect(off.length).toBe(scene.config.items.filter(i => (i as { show?: boolean }).show === false).length);
    for (const g of off) expect(g.getAttribute("aria-hidden")).toBe("true");
  });

  it("«التالي» / «السابق» move one step; the ends are disabled", () => {
    const { container } = render(direct());
    expect((screen.getByRole("button", { name: "السابق" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(counter(container)).toBe("الخطوة 2 / " + N);
    expect(say(container)).toBe(plain(scene.config.steps[1].say));
    fireEvent.click(screen.getByRole("button", { name: "السابق" }));
    expect(counter(container)).toBe("الخطوة 1 / " + N);
    for (let i = 0; i < N + 3; i++) fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(counter(container)).toBe(`الخطوة ${N} / ${N}`);
    expect((screen.getByRole("button", { name: "التالي" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("`…` in a sentence is code, left to right in its own isolate", () => {
    const { container } = render(direct());
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));   // «السطر 1: `int x = 5;` يحجز صندوقًا اسمه `x` …»
    const codes = [...container.querySelectorAll(".learning-scene-say bdi[dir=ltr] > code")].map(c => c.textContent);
    expect(codes).toEqual(scene.config.steps[1].say.match(/`[^`]+`/g)!.map(c => c.slice(1, -1)));
    expect(say(container)).not.toContain("`");
  });

  it("what a step changes is marked; what it does not change is not", () => {
    const { container } = render(direct());
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));   // step 2: the box x appears with 5, the code marks line 1
    const marked = [...container.querySelectorAll(".cs-i")].filter(g => g.querySelector(":scope > .is-new")).length;
    const ids = Object.keys((scene.config.steps[1] as { set?: Record<string, unknown> }).set ?? {});
    expect(marked).toBe(ids.length);
  });

  it("«شغّل» walks to the last step and STOPS there (no loop); «إيقاف» pauses", () => {
    vi.useFakeTimers();
    const { container } = render(direct());
    fireEvent.click(screen.getByRole("button", { name: /شغّل/ }));
    expect(screen.getByRole("button", { name: /إيقاف/ }).getAttribute("aria-pressed")).toBe("true");
    act(() => { vi.advanceTimersByTime(1800); });
    act(() => { vi.advanceTimersByTime(1800); });
    expect(counter(container)).toBe("الخطوة 3 / " + N);
    fireEvent.click(screen.getByRole("button", { name: /إيقاف/ }));
    act(() => { vi.advanceTimersByTime(20000); });
    expect(counter(container)).toBe("الخطوة 3 / " + N);
    fireEvent.click(screen.getByRole("button", { name: /شغّل/ }));
    for (let i = 0; i < N + 5; i++) act(() => { vi.advanceTimersByTime(1800); });
    expect(counter(container)).toBe(`الخطوة ${N} / ${N}`);
    expect(screen.getByRole("button", { name: /شغّل من البداية/ }).getAttribute("aria-pressed")).toBe("false");
    act(() => { vi.advanceTimersByTime(60000); });
    expect(counter(container)).toBe(`الخطوة ${N} / ${N}`);           // still there: no loop
    fireEvent.click(screen.getByRole("button", { name: /شغّل من البداية/ }));
    expect(counter(container)).toBe("الخطوة 1 / " + N);
  });

  it("the shell's reset returns to step 1 and stops", () => {
    const { container, rerender } = render(direct());
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    rerender(direct({ reset: 1 }));
    expect(counter(container)).toBe("الخطوة 1 / " + N);
  });

  it("reduced motion: the same steps, marked still", () => {
    const { container } = render(direct({ reducedMotion: true }));
    expect(container.querySelector(".learning-scene")!.classList.contains("is-still")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(say(container)).toBe(plain(scene.config.steps[1].say));
  });

  it("an unreadable scene says it is unavailable instead of drawing part of it", () => {
    render(<CSharpSceneActivity block={blockOf({ ...scene.config, items: [{ id: "x", kind: "script" }] })} courseId="899371" reducedMotion={false} fullscreen={false} commands={{ reset: 0, replay: 0 }} emit={noopActivityEventSink} />);
    expect(screen.getByRole("note").textContent).toBe("هذا النشاط التفاعلي غير متوفر حاليًا.");
  });
});
