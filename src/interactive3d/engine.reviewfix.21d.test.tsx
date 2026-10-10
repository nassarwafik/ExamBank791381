// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import Interactive3DView, { type Interactive3DSelection } from "./Interactive3DView";
import { scene3DPreset } from "./scenePresets";
import type { Interactive3DSceneSpecV1 } from "./sceneSpec";

// Phase 21D independent-review fix. Cases marked FAIL-FIRST fail on the reviewed head bff40b7 (recorded in the PR) and pass after the
// fix; PIN cases pass on both and guard behaviour the fix must keep; REGRESSION cases guard the fix's own mechanism.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const svgOf = (c: HTMLElement) => c.querySelector("svg.i3d-scene") as SVGSVGElement;
const yaw = (c: HTMLElement) => svgOf(c).getAttribute("data-yaw");
const drag = (el: Element, id: number, dx: number, extra: Record<string, unknown> = {}) => {
  fireEvent.pointerDown(el, { pointerId: id, clientX: 100, clientY: 100, isPrimary: true, ...extra });
  for (let i = 1; i <= 8; i++) fireEvent.pointerMove(el, { pointerId: id, clientX: 100 + dx * i / 8, clientY: 100, isPrimary: true, ...extra });
  fireEvent.pointerUp(el, { pointerId: id, clientX: 100 + dx, clientY: 100, isPrimary: true, ...extra });
};
const nextFrame = () => act(async () => { await new Promise(r => setTimeout(r, 40)); });
/** A student's tap / click on an element of the drawing, as the browser delivers it (press, release, click on the same element). */
const tap = (el: Element, id: number, pointerType = "mouse") => {
  fireEvent.pointerDown(el, { pointerId: id, clientX: 50, clientY: 50, pointerType, isPrimary: true });
  fireEvent.pointerUp(el, { pointerId: id, clientX: 50, clientY: 50, pointerType, isPrimary: true });
  fireEvent.click(el);
};
function selectable(emitted: string[][], value: string[] = []): Interactive3DSelection {
  return { kind: "face", mode: "single", max: 1, value, onChange: n => emitted.push(n) };
}
const target = (c: HTMLElement, key: string) => c.querySelector('[data-i3d-target="' + key + '"]') as Element;

describe("21D-RF1 the camera follows the scene's CONTENT: new content resets it, re-renders of the same content never do", () => {
  const cube = (size: number): Interactive3DSceneSpecV1 => {
    const s = scene3DPreset("cube", "same-id");
    return { ...s, objects: s.objects.map(o => ({ ...o, size: { x: size, y: size, z: size } })) };
  };
  it("FAIL-FIRST: a geometry change under the same scene id and authored camera starts from the new scene's authored view", () => {
    const { container, rerender } = render(<Interactive3DView spec={cube(2)} />);
    const authored = yaw(container);
    drag(svgOf(container), 1, 160);
    expect(yaw(container)).not.toBe(authored);
    rerender(<Interactive3DView spec={cube(3)} />);
    expect(yaw(container)).toBe(authored);
    expect(svgOf(container).getAttribute("data-zoom")).toBe("1");
  });
  it("FAIL-FIRST: a parent that keeps one viewer while moving between two questions whose scenes share an id never carries the view over", () => {
    let go: (n: number) => void = () => {};
    function Exam() {
      const [page, setPage] = useState(0);
      useEffect(() => { go = setPage; }, []);
      // the second question's scene keeps the id and authored camera but has a larger left ventricle
      const s = scene3DPreset("heart", "shared"), other = { ...s, objects: s.objects.map((o, i) => i === 0 ? { ...o, size: { x: o.size.x * 1.3, y: o.size.y * 1.3, z: o.size.z * 1.3 } } : o) };
      return <Interactive3DView spec={page === 0 ? s : other} />;
    }
    const { container } = render(<Exam />);
    const authored = yaw(container);
    drag(svgOf(container), 2, 200);
    expect(yaw(container)).not.toBe(authored);
    act(() => go(1));
    expect(yaw(container)).toBe(authored);
  });
  it("PIN: timer re-renders, re-derived identical scenes and answer changes keep the student's view", () => {
    let tick: () => void = () => {};
    const emitted: string[][] = [];
    function Exam() {
      const [n, setN] = useState(0), [value, setValue] = useState<string[]>([]);
      useEffect(() => { tick = () => setN(v => v + 1); });
      return <div data-n={n}><Interactive3DView spec={scene3DPreset("cube", "exam-cube")} selection={{ ...selectable(emitted, value), onChange: next => { emitted.push(next); setValue(next); } }} /></div>;
    }
    const { container } = render(<Exam />);
    drag(svgOf(container), 3, 140);
    const turned = yaw(container);
    for (let i = 0; i < 5; i++) act(() => tick());
    expect(yaw(container)).toBe(turned);
    fireEvent.click(container.querySelector(".i3d-target-list button") as Element);
    expect(emitted).toHaveLength(1);
    act(() => tick());
    expect(yaw(container)).toBe(turned);
  });
});

describe("21D-RF2 a camera gesture never costs the student a selection", () => {
  it("FAIL-FIRST: on a zoom-only scene (rotation disabled), the first tap on a part after a pinch selects it", () => {
    const s = scene3DPreset("cube", "zoom-only"), spec = { ...s, interaction: { rotate: false, zoom: true, select: true } };
    const emitted: string[][] = [];
    const { container } = render(<Interactive3DView spec={spec} selection={selectable(emitted)} />);
    const svg = svgOf(container);
    fireEvent.pointerDown(svg, { pointerId: 11, clientX: 180, clientY: 200, pointerType: "touch", isPrimary: true });
    fireEvent.pointerDown(svg, { pointerId: 12, clientX: 220, clientY: 200, pointerType: "touch", isPrimary: false });
    fireEvent.pointerMove(svg, { pointerId: 12, clientX: 280, clientY: 200, pointerType: "touch", isPrimary: false });
    fireEvent.pointerUp(svg, { pointerId: 11, pointerType: "touch", isPrimary: true });
    fireEvent.pointerUp(svg, { pointerId: 12, pointerType: "touch", isPrimary: false });
    expect(Number(svg.getAttribute("data-zoom"))).toBeGreaterThan(1);
    expect(emitted).toEqual([]);
    tap(target(container, "face:top"), 13, "touch");
    expect(emitted).toEqual([["face:top"]]);
  });
  it("FAIL-FIRST: a touch whose release never reached the viewer does not turn every later tap into a pinch", () => {
    const emitted: string[][] = [];
    const { container } = render(<Interactive3DView spec={scene3DPreset("cube", "lost-up")} selection={selectable(emitted)} />);
    // a finger lands and its release is lost (lifted outside after the browser dropped the capture)
    fireEvent.pointerDown(svgOf(container), { pointerId: 21, clientX: 100, clientY: 100, pointerType: "touch", isPrimary: true });
    tap(target(container, "face:top"), 22, "touch");
    expect(emitted).toEqual([["face:top"]]);
    // and the next tap registers too (the selection prop is not updated here, so the same part is emitted again)
    tap(target(container, "face:top"), 23, "touch");
    expect(emitted).toEqual([["face:top"], ["face:top"]]);
  });
  it("FAIL-FIRST: a drag's click suppression ends with that drag (a later activation without a press on the drawing still selects)", async () => {
    const emitted: string[][] = [];
    const { container } = render(<Interactive3DView spec={scene3DPreset("cube", "stale")} selection={selectable(emitted)} />);
    const svg = svgOf(container);
    drag(svg, 31, 150);
    fireEvent.click(svg); // the browser delivers the drag's click to the viewer (common ancestor), not to a part
    await nextFrame();
    // e.g. voice control or another assistive technology activating a labelled part: a click with no pointer press before it
    fireEvent.click(target(container, "face:top"));
    expect(emitted).toEqual([["face:top"]]);
  });
  it("PIN: dragging from outside the model (the background) and then clicking a new part selects that part", () => {
    const emitted: string[][] = [];
    const { container } = render(<Interactive3DView spec={scene3DPreset("cube", "outside")} selection={selectable(emitted)} />);
    const background = container.querySelector("rect.i3d-bg") as Element;
    drag(background, 41, -180);
    fireEvent.click(svgOf(container));
    expect(emitted).toEqual([]);
    tap(target(container, "face:top"), 42);
    expect(emitted).toEqual([["face:top"]]);
  });
  it("PIN: the click that ends a drag over a part never selects it, and the next real click does", () => {
    const emitted: string[][] = [];
    const { container } = render(<Interactive3DView spec={scene3DPreset("cube", "drag-over")} selection={selectable(emitted)} />);
    const part = target(container, "face:top");
    drag(part, 51, 60);
    fireEvent.click(part);
    expect(emitted).toEqual([]);
    tap(target(container, "face:top"), 52);
    expect(emitted).toEqual([["face:top"]]);
  });
  it("FAIL-FIRST: after a pinch whose releases were lost, a mouse drag still turns the model and ends cleanly (hovering afterwards never turns it)", async () => {
    // reduced motion: no inertia after the drag, so the only possible later camera change is the hover being taken for a drag
    vi.spyOn(window, "matchMedia").mockImplementation(q => ({ matches: q.includes("reduce"), media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as MediaQueryList);
    const { container } = render(<Interactive3DView spec={scene3DPreset("cube", "lost-pinch")} />);
    const svg = svgOf(container);
    fireEvent.pointerDown(svg, { pointerId: 81, clientX: 180, clientY: 200, pointerType: "touch", isPrimary: true });
    fireEvent.pointerDown(svg, { pointerId: 82, clientX: 220, clientY: 200, pointerType: "touch", isPrimary: false });
    // both releases are lost; the student then turns the model with the mouse
    drag(svg, 1, 140, { pointerType: "mouse" });
    const turned = yaw(container);
    expect(turned).not.toBe("-0.65");
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 400, clientY: 100, pointerType: "mouse", isPrimary: true, buttons: 0 });
    await nextFrame(); // a camera update coalesced into the next frame would land here
    expect(yaw(container)).toBe(turned);
  });
  it("REGRESSION: a second drag that starts before the next frame keeps its own click suppressed (the first drag's clearing is cancelled)", async () => {
    const emitted: string[][] = [];
    const { container } = render(<Interactive3DView spec={scene3DPreset("cube", "quick")} selection={selectable(emitted)} />);
    drag(svgOf(container), 71, 120);
    const part = target(container, "face:top");
    fireEvent.pointerDown(part, { pointerId: 72, clientX: 100, clientY: 100, isPrimary: true });
    fireEvent.pointerMove(part, { pointerId: 72, clientX: 160, clientY: 100, isPrimary: true });
    await nextFrame(); // the first drag's clearing frame would run here
    fireEvent.pointerUp(part, { pointerId: 72, clientX: 160, clientY: 100, isPrimary: true });
    fireEvent.click(part);
    expect(emitted).toEqual([]);
  });
  it("PIN: a real two-finger pinch (second finger not primary) still never selects anything", () => {
    const emitted: string[][] = [];
    const { container } = render(<Interactive3DView spec={scene3DPreset("cube", "pinch")} selection={selectable(emitted)} />);
    const part = target(container, "face:top");
    fireEvent.pointerDown(part, { pointerId: 61, clientX: 180, clientY: 200, pointerType: "touch", isPrimary: true });
    fireEvent.pointerDown(part, { pointerId: 62, clientX: 220, clientY: 200, pointerType: "touch", isPrimary: false });
    fireEvent.pointerMove(part, { pointerId: 62, clientX: 260, clientY: 200, pointerType: "touch", isPrimary: false });
    fireEvent.pointerUp(part, { pointerId: 62, pointerType: "touch", isPrimary: false });
    fireEvent.pointerUp(part, { pointerId: 61, pointerType: "touch", isPrimary: true });
    fireEvent.click(part);
    expect(emitted).toEqual([]);
  });
});
