// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import Interactive3DView from "./Interactive3DView";
import Surface3DView from "../functionSurfaces/Surface3DView";
import { buildInteractive3DMesh, projectInteractive3DScene } from "./sceneMesh";
import { scene3DPreset } from "./scenePresets";
import type { Interactive3DSceneSpecV1 } from "./sceneSpec";
import type { SurfaceSpecV1 } from "../functionSurfaces/surfaceSpec";

// Phase 21D — BEHAVIOURAL FAIL-FIRST suite: it imports only modules and exports that exist on the baseline 294500e, and every `FF`
// case fails there (the defect) and passes after the 21D fixes. Recorded against an untouched 294500e worktree.
afterEach(cleanup);
const solid = (kind: "sphere" | "cone" | "box", center = { x: 0, y: 0, z: 0 }): Interactive3DSceneSpecV1 => ({
  version: 1, id: "ff-" + kind, title: "مجسم", description: "مجسم للاختبار.", camera: { yaw: -0.65, pitch: 0.45, zoom: 1 },
  interaction: { rotate: true, zoom: true, select: false },
  objects: [{ id: "s", label: "المجسم", kind, center, size: { x: 3, y: 3, z: 3 }, palette: 3 }], targets: []
});
const surface = (): SurfaceSpecV1 => ({
  version: 1, id: "paraboloid", title: "سطح القطع المكافئ", description: "سطح الدالة z = x² + y².",
  expression: "x^2+y^2", viewport: { xMin: -1, xMax: 1, yMin: -1, yMax: 1, zMin: -1, zMax: 3 }, grid: { xSteps: 8, ySteps: 8 }
});
const drawing = (c: HTMLElement) => [...c.querySelectorAll("svg polygon")].map(p => p.getAttribute("points")).join("|");
const drag = (el: Element, id: number, dx: number, dy = 0) => {
  fireEvent.pointerDown(el, { pointerId: id, clientX: 100, clientY: 100 });
  for (let i = 1; i <= 10; i++) fireEvent.pointerMove(el, { pointerId: id, clientX: 100 + dx * i / 10, clientY: 100 + dy * i / 10 });
  fireEvent.pointerUp(el, { pointerId: id, clientX: 100 + dx, clientY: 100 + dy });
};

describe("21D-FF1 rotation never hits a wall", () => {
  it("a model keeps turning under repeated horizontal drags in one direction", () => {
    const { container } = render(<Interactive3DView spec={scene3DPreset("cube", "ff-cube")} />);
    const svg = container.querySelector("svg.i3d-scene")!;
    const seen: string[] = [];
    for (let k = 0; k < 8; k++) { drag(svg, 10 + k, 400); seen.push(drawing(container)); }
    // every sweep changes the view: no clamp at ±π
    for (let k = 1; k < seen.length; k++) expect(seen[k], "sweep " + k).not.toBe(seen[k - 1]);
  });
  it("a 3D surface keeps turning under repeated horizontal drags", () => {
    const { container } = render(<Surface3DView spec={surface()} />);
    const svg = container.querySelector("svg.ex3d-scene")!;
    const seen: string[] = [];
    for (let k = 0; k < 8; k++) { drag(svg, 30 + k, 400); seen.push(drawing(container)); }
    for (let k = 1; k < seen.length; k++) expect(seen[k], "sweep " + k).not.toBe(seen[k - 1]);
  });
});

describe("21D-FF2 the student's camera survives a parent that re-derives the same scene", () => {
  it("interactive scene: a re-render with a new but identical scene object keeps the rotated view", () => {
    let bump: () => void = () => {};
    function Parent() { const [n, setN] = useState(0); bump = () => setN(v => v + 1); return <div data-n={n}><Interactive3DView spec={scene3DPreset("heart", "ff-heart")} /></div>; }
    const { container } = render(<Parent />);
    const svg = container.querySelector("svg.i3d-scene")!, start = drawing(container);
    drag(svg, 50, 120, 30);
    const rotated = drawing(container);
    expect(rotated).not.toBe(start);
    act(() => bump());
    expect(drawing(container)).toBe(rotated);
  });
  it("3D surface: same", () => {
    let bump: () => void = () => {};
    function Parent() { const [n, setN] = useState(0); bump = () => setN(v => v + 1); return <div data-n={n}><Surface3DView spec={surface()} /></div>; }
    const { container } = render(<Parent />);
    const svg = container.querySelector("svg.ex3d-scene")!;
    drag(svg, 60, 120, 20);
    const rotated = drawing(container);
    act(() => bump());
    expect(drawing(container)).toBe(rotated);
  });
});

describe("21D-FF3 stable framing", () => {
  const yRange = (scene: Interactive3DSceneSpecV1, yaw: number) => {
    const mesh = buildInteractive3DMesh(scene), p = projectInteractive3DScene(mesh, scene, { yaw, pitch: 0, zoom: 1 });
    const ys = p.points.map(q => q.y);
    return Math.max(...ys) - Math.min(...ys);
  };
  it("the drawn size of a cube does not pulse while it turns (scale independent of orientation)", () => {
    const cube = solid("box"), sizes = Array.from({ length: 72 }, (_, i) => yRange(cube, -Math.PI + i * Math.PI / 36));
    // at pitch 0 a vertical edge keeps its true length: the projected height must be the same at every yaw
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeLessThan(1.001);
  });
  it("an off-centre object turns about its own centre and stays in the middle of the viewer", () => {
    const off = solid("sphere", { x: 30, y: 0, z: 0 }), mesh = buildInteractive3DMesh(off);
    for (const yaw of [0, 1, 2, 3]) {
      const p = projectInteractive3DScene(mesh, off, { yaw, pitch: 0.3, zoom: 1 }), xs = p.points.map(q => q.x), ys = p.points.map(q => q.y);
      expect(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - p.width / 2), "yaw " + yaw).toBeLessThan(2);
      expect(Math.abs((Math.max(...ys) + Math.min(...ys)) / 2 - p.height / 2), "yaw " + yaw).toBeLessThan(2);
    }
  });
});

describe("21D-FF4 zoom gestures", () => {
  it("the mouse wheel zooms a focused viewer and the page keeps its wheel otherwise", () => {
    const { container } = render(<Interactive3DView spec={solid("sphere")} />);
    const svg = container.querySelector("svg.i3d-scene") as SVGSVGElement, start = drawing(container);
    const unfocused = new WheelEvent("wheel", { deltaY: -300, bubbles: true, cancelable: true });
    act(() => { svg.dispatchEvent(unfocused); });
    expect(unfocused.defaultPrevented).toBe(false);
    expect(drawing(container)).toBe(start);
    act(() => { svg.focus(); });
    const focused = new WheelEvent("wheel", { deltaY: -300, bubbles: true, cancelable: true });
    act(() => { svg.dispatchEvent(focused); });
    expect(focused.defaultPrevented).toBe(true);
    expect(drawing(container)).not.toBe(start);
  });
  it("a two-finger spread zooms in and never selects anything", () => {
    const emitted: string[][] = [];
    const { container } = render(<Interactive3DView spec={scene3DPreset("heart", "ff-pinch")} selection={{ kind: "object", mode: "single", max: 1, value: [], onChange: n => emitted.push(n) }} />);
    const svg = container.querySelector("svg.i3d-scene")!, size = () => svg.getAttribute("data-zoom");
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 180, clientY: 200, pointerType: "touch" });
    fireEvent.pointerDown(svg, { pointerId: 2, clientX: 220, clientY: 200, pointerType: "touch" });
    for (let i = 1; i <= 6; i++) {
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: 180 - i * 10, clientY: 200, pointerType: "touch" });
      fireEvent.pointerMove(svg, { pointerId: 2, clientX: 220 + i * 10, clientY: 200, pointerType: "touch" });
    }
    fireEvent.pointerUp(svg, { pointerId: 1 }); fireEvent.pointerUp(svg, { pointerId: 2 });
    expect(Number(size())).toBeGreaterThan(1.5);
    expect(emitted).toEqual([]);
  });
});

describe("21D-FF5 visual fidelity", () => {
  it("curved surfaces are shaded (more than one tone across a sphere), not one flat colour", () => {
    const { container } = render(<Interactive3DView spec={solid("sphere")} />);
    const fills = new Set([...container.querySelectorAll("polygon.i3d-face")].map(p => p.getAttribute("fill")));
    expect(fills.size).toBeGreaterThan(20);
  });
  it("a sphere's drawn outline is round (within 1 % of a circle)", () => {
    const { container } = render(<Interactive3DView spec={solid("sphere")} />);
    const pts = [...container.querySelectorAll("polygon.i3d-face")].flatMap(p => (p.getAttribute("points") ?? "").split(" ").map(s => s.split(",").map(Number) as [number, number]));
    const cx = (Math.max(...pts.map(p => p[0])) + Math.min(...pts.map(p => p[0]))) / 2, cy = (Math.max(...pts.map(p => p[1])) + Math.min(...pts.map(p => p[1]))) / 2;
    const r = pts.map(p => Math.hypot(p[0] - cx, p[1] - cy)), R = Math.max(...r);
    // sample the outline in 360 directions: the farthest drawn point in each direction must reach (almost) the circle
    let worst = 1;
    for (let k = 0; k < 360; k++) {
      const a = k * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
      let reach = 0;
      for (const p of pts) { const dx = p[0] - cx, dy = p[1] - cy, along = dx * ux + dy * uy, across = Math.abs(-dx * uy + dy * ux); if (across < R * 0.03) reach = Math.max(reach, along); }
      worst = Math.min(worst, reach / R);
    }
    expect(worst).toBeGreaterThan(0.99);
  });
  it("the cone has a true apex: one vertex at the tip (not a tiny ring of vertices)", () => {
    const cone = solid("cone"), mesh = buildInteractive3DMesh(cone);
    const tip = mesh.vertices.filter(v => v.point.y > 1.5 - 1e-6);
    expect(tip).toHaveLength(1);
    expect(Math.hypot(tip[0].point.x, tip[0].point.z)).toBeLessThan(1e-9);
  });
});
