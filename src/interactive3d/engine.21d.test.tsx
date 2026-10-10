// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import Interactive3DView from "./Interactive3DView";
import Scene3DSelectionResponse from "../questionTypes/student/S3DResponse";
import { buildInteractive3DMesh, projectInteractive3DScene, scene3DFaceCount, scene3DQualityFor, shadeScene3DFace, SCENE3D_FRAME, SCENE3D_INTERACTION_BUDGET, SCENE3D_QUALITIES, SCENE3D_REST_BUDGET, SCENE3D_TESSELLATION, type Scene3DMesh, type Scene3DQuality } from "./sceneMesh";
import { clampNumber, dragCamera, inertiaStep, ORBIT, releaseVelocity, wheelZoomFactor, wrapAngle } from "./orbitCamera";
import { scene3DPreset } from "./scenePresets";
import type { Interactive3DSceneSpecV1, Scene3DObjectV1 } from "./sceneSpec";
import type { Answer } from "../answerState";
import type { Question } from "../studentQuestionTypes";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
type Kind = Scene3DObjectV1["kind"];
const scene = (kind: Kind, size = { x: 3, y: 4, z: 2 }, extra: Partial<Scene3DObjectV1> = {}): Interactive3DSceneSpecV1 => ({
  version: 1, id: "t-" + kind, title: "مجسم", description: "مجسم للاختبار.", camera: { yaw: -0.65, pitch: 0.45, zoom: 1 },
  interaction: { rotate: true, zoom: true, select: false },
  objects: [{ id: "s", label: "المجسم", kind, center: { x: 1, y: -2, z: 0.5 }, size, palette: 3, ...extra }], targets: []
});
type V = { x: number; y: number; z: number };
const sub = (a: V, b: V) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
function areaVector(p: V[]): V { let x = 0, y = 0, z = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; x += (a.y - b.y) * (a.z + b.z); y += (a.z - b.z) * (a.x + b.x); z += (a.x - b.x) * (a.y + b.y); } return { x: x / 2, y: y / 2, z: z / 2 }; }
/** Volume and area of a closed mesh (divergence theorem with outward normals), relative to the object's centre. */
function measure(mesh: Scene3DMesh, center: V) {
  let volume = 0, area = 0;
  for (const f of mesh.faces) {
    const p = f.indices.map(i => sub(mesh.vertices[i].point, center)), av = areaVector(p), a = Math.hypot(av.x, av.y, av.z);
    const n = f.normal!, c = p.reduce((s, q) => ({ x: s.x + q.x / p.length, y: s.y + q.y / p.length, z: s.z + q.z / p.length }), { x: 0, y: 0, z: 0 });
    volume += dot(c, n) * a / 3; area += a;
  }
  return { volume, area };
}
const ANALYTIC: Record<Kind, (s: V) => number> = {
  box: s => s.x * s.y * s.z, pyramid: s => s.x * s.z * s.y / 3,
  sphere: s => 4 / 3 * Math.PI * s.x * s.y * s.z / 8, ellipsoid: s => 4 / 3 * Math.PI * s.x * s.y * s.z / 8,
  cylinder: s => Math.PI * s.x * s.z / 4 * s.y, cone: s => Math.PI * s.x * s.z / 4 * s.y / 3
};
/** largest relative volume error allowed per quality (inscribed tessellation always under-estimates curved solids) */
const VOLUME_TOLERANCE: Record<Scene3DQuality, number> = { draft: 0.07, low: 0.03, medium: 0.012, high: 0.005 };
const KINDS: Kind[] = ["box", "pyramid", "sphere", "ellipsoid", "cylinder", "cone"];

describe("21D-GEO geometry precision", () => {
  it("every solid at every quality has its authored full extents (size) about its centre", () => {
    for (const kind of KINDS) for (const q of SCENE3D_QUALITIES) {
      const s = scene(kind), m = buildInteractive3DMesh(s, q), c = s.objects[0].center;
      const ext = (k: "x" | "y" | "z") => Math.max(...m.vertices.map(v => v.point[k] - c[k])) - Math.min(...m.vertices.map(v => v.point[k] - c[k]));
      for (const k of ["x", "y", "z"] as const) expect(ext(k), kind + "/" + q + "/" + k).toBeCloseTo(s.objects[0].size[k], 9);
    }
  });
  it("volumes converge to the analytic formulas (V = 4/3·πabc, πr²h, πr²h/3, lwh, lwh/3) within the quality's tolerance", () => {
    for (const kind of KINDS) for (const q of SCENE3D_QUALITIES) {
      const s = scene(kind, { x: 2.4, y: 3, z: 2.4 }), m = buildInteractive3DMesh(s, q), exact = ANALYTIC[kind](s.objects[0].size);
      const { volume } = measure(m, s.objects[0].center), err = Math.abs(volume - exact) / exact;
      if (kind === "box" || kind === "pyramid") expect(err, kind).toBeLessThan(1e-12);
      else { expect(err, kind + "/" + q).toBeLessThan(VOLUME_TOLERANCE[q]); expect(volume).toBeLessThanOrEqual(exact); }
    }
  });
  it("the sphere's surface area converges to 4πr² (high quality within 0.5 %)", () => {
    const s = scene("sphere", { x: 3, y: 3, z: 3 }), { area } = measure(buildInteractive3DMesh(s, "high"), s.objects[0].center);
    expect(Math.abs(area - 4 * Math.PI * 1.5 ** 2) / (4 * Math.PI * 1.5 ** 2)).toBeLessThan(0.005);
  });
  it("every mesh is closed (each edge shared by exactly two faces) with outward unit normals and no degenerate face", () => {
    for (const kind of KINDS) for (const q of SCENE3D_QUALITIES) {
      const s = scene(kind), m = buildInteractive3DMesh(s, q), c = s.objects[0].center;
      const halfEdges = m.faces.reduce((n, f) => n + f.indices.length, 0);
      expect(m.lines!.length * 2, kind + "/" + q).toBe(halfEdges);
      for (const f of m.faces) {
        const p = f.indices.map(i => m.vertices[i].point), centroid = p.reduce((a, b) => ({ x: a.x + b.x / p.length, y: a.y + b.y / p.length, z: a.z + b.z / p.length }), { x: 0, y: 0, z: 0 });
        expect(Math.hypot(f.normal!.x, f.normal!.y, f.normal!.z)).toBeCloseTo(1, 9);
        expect(dot(f.normal!, sub(centroid, c)), kind).toBeGreaterThan(0);
        const av = areaVector(p); expect(Math.hypot(av.x, av.y, av.z), kind).toBeGreaterThan(1e-9);
      }
    }
  });
  it("true edges are creases and curved facets are smooth: cube 12, pyramid 8, cylinder 2 rims, cone 1 rim, sphere none", () => {
    const creases = (kind: Kind, q: Scene3DQuality = "medium") => buildInteractive3DMesh(scene(kind, { x: 3, y: 3, z: 3 }), q).lines!.filter(l => l.crease).length;
    const seg = SCENE3D_TESSELLATION.medium.seg;
    expect(creases("box")).toBe(12); expect(creases("pyramid")).toBe(8);
    expect(creases("cylinder")).toBe(2 * seg); expect(creases("cone")).toBe(seg);
    expect(creases("sphere")).toBe(0); expect(creases("ellipsoid")).toBe(0);
  });
  it("polyhedra are identical at every quality (no tessellation of flat faces); the 21C cube contract is preserved", () => {
    for (const kind of ["box", "pyramid"] as Kind[]) {
      const ref = JSON.stringify(buildInteractive3DMesh(scene(kind), "draft").faces.map(f => f.indices));
      for (const q of SCENE3D_QUALITIES) expect(JSON.stringify(buildInteractive3DMesh(scene(kind), q).faces.map(f => f.indices))).toBe(ref);
    }
    const cube = buildInteractive3DMesh(scene3DPreset("cube", "c"));
    expect([cube.vertices.length, cube.faces.length, cube.edges.length]).toEqual([8, 6, 12]);
  });
  it("a scene too large for a quality steps down a level instead of rendering nothing", () => {
    const many: Interactive3DSceneSpecV1 = { ...scene("sphere"), objects: Array.from({ length: 64 }, (_, i) => ({ id: "o" + i, label: "كرة", kind: "sphere" as const, center: { x: i % 8, y: Math.floor(i / 8), z: 0 }, size: { x: .8, y: .8, z: .8 }, palette: 1 })) };
    const m = buildInteractive3DMesh(many, "high");
    expect(m.faces.length).toBeGreaterThan(0);
    expect(m.quality).toBe("draft");
    expect(scene3DFaceCount(many, "draft")).toBe(m.faces.length);
  });
  it("auto quality: detail at rest within the rest budget, a lighter level while moving within the interaction budget", () => {
    const heart = scene3DPreset("heart", "h"), sphere = scene("sphere");
    expect(scene3DQualityFor(sphere, SCENE3D_REST_BUDGET)).toBe("high");
    expect(scene3DQualityFor(heart, SCENE3D_REST_BUDGET)).toBe("medium");
    // the moving level is what keeps a dragged model fluid on a slow device: a lone sphere drops to low, the 6-part heart to draft
    expect(scene3DQualityFor(sphere, SCENE3D_INTERACTION_BUDGET)).toBe("low");
    expect(scene3DQualityFor(heart, SCENE3D_INTERACTION_BUDGET)).toBe("draft");
    for (const key of ["cube", "pyramid", "heart", "torso", "water"] as const) {
      const preset = scene3DPreset(key, key);
      expect(scene3DFaceCount(preset, scene3DQualityFor(preset, SCENE3D_REST_BUDGET)), key).toBeLessThanOrEqual(SCENE3D_REST_BUDGET);
      expect(scene3DFaceCount(preset, scene3DQualityFor(preset, SCENE3D_INTERACTION_BUDGET)), key).toBeLessThanOrEqual(SCENE3D_INTERACTION_BUDGET);
    }
  });
});

describe("21D-PRJ projection, culling and lighting", () => {
  it("never clips at zoom 1 in any orientation, and the scene's bounding sphere fills the viewer by the frame factor", () => {
    for (const kind of KINDS) {
      const s = scene(kind), m = buildInteractive3DMesh(s);
      for (let i = 0; i < 24; i++) {
        const p = projectInteractive3DScene(m, s, { yaw: -Math.PI + i * .27, pitch: -1.45 + i * .12, zoom: 1 });
        for (const q of p.points) { expect(q.x).toBeGreaterThanOrEqual(0); expect(q.x).toBeLessThanOrEqual(p.width); expect(q.y).toBeGreaterThanOrEqual(0); expect(q.y).toBeLessThanOrEqual(p.height); }
        expect(p.scale * m.bounds!.radius * 2).toBeCloseTo(Math.min(p.width, p.height) * SCENE3D_FRAME, 6);
      }
    }
  });
  it("back-face culling: a cube seen obliquely shows exactly three faces; a sphere about half of its facets", () => {
    const cube = scene("box", { x: 3, y: 3, z: 3 }), p = projectInteractive3DScene(buildInteractive3DMesh(cube), cube, { yaw: .6, pitch: .5, zoom: 1 });
    expect(p.faces.filter(f => f.front)).toHaveLength(3);
    expect(p.faces).toHaveLength(6);
    const sp = scene("sphere"), m = buildInteractive3DMesh(sp, "medium"), ps = projectInteractive3DScene(m, sp, { yaw: .3, pitch: .2, zoom: 1 });
    const ratio = ps.faces.filter(f => f.front).length / ps.faces.length;
    expect(ratio).toBeGreaterThan(.4); expect(ratio).toBeLessThan(.6);
  });
  it("lighting: faces turned towards the key light are brighter than faces turned away; back faces are dimmer", () => {
    const lum = (hex: string) => [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0);
    expect(lum(shadeScene3DFace(3, { x: -.42, y: .58, z: .7 }, true))).toBeGreaterThan(lum(shadeScene3DFace(3, { x: .6, y: -.6, z: .5 }, true)));
    expect(lum(shadeScene3DFace(3, { x: 0, y: 0, z: 1 }, false, false))).toBeLessThan(lum(shadeScene3DFace(3, { x: 0, y: 0, z: 1 }, false, true)));
  });
  it("silhouette lines of a sphere lie on its outline circle", () => {
    const s = scene("sphere", { x: 3, y: 3, z: 3 }), m = buildInteractive3DMesh(s, "high"), p = projectInteractive3DScene(m, s, { yaw: .4, pitch: .3, zoom: 1 });
    const sil = p.lines.filter(l => l.kind === "silhouette"), R = m.bounds!.radius * p.scale;
    expect(sil.length).toBeGreaterThan(40);
    for (const l of sil) expect(Math.hypot(l.x1 - p.width / 2, l.y1 - p.height / 2) / R).toBeGreaterThan(.995);
  });
  it("a draw filter only removes items: what it keeps is identical (same order, same values) to the unfiltered projection", () => {
    const heart = scene3DPreset("heart", "filter"), m = buildInteractive3DMesh(heart, "low"), cam = { yaw: 1.1, pitch: -.4, zoom: 1.3 };
    const all = projectInteractive3DScene(m, heart, cam);
    const face = (f: { front: boolean; rim: boolean }) => f.front || f.rim, line = (l: { kind: string; front: boolean }) => l.front && l.kind !== "facet";
    const some = projectInteractive3DScene(m, heart, cam, undefined, undefined, { face, line });
    expect(some.faces).toEqual(all.faces.filter(face));
    expect(some.lines).toEqual(all.lines.filter(line));
    expect(some.points).toEqual(all.points);
    expect(some.edges).toEqual(all.edges);
    expect(some.faces.length).toBeLessThan(all.faces.length);
  });
});

describe("21D-CAM orbit camera math", () => {
  const L = { pitchMin: -1.45, pitchMax: 1.45, zoomMin: .55, zoomMax: 2.2 };
  it("yaw wraps instead of stopping; pitch is clamped short of the poles (no flip)", () => {
    expect(wrapAngle(Math.PI + .5)).toBeCloseTo(-Math.PI + .5, 12);
    expect(wrapAngle(-7)).toBeCloseTo(-7 + 2 * Math.PI, 12);
    let c = { yaw: 3, pitch: 0, zoom: 1 };
    for (let i = 0; i < 10; i++) { const n = dragCamera(c, 120, 0, 720, L); expect(n.yaw).not.toBe(c.yaw); c = n; }
    expect(dragCamera({ yaw: 0, pitch: 1.4, zoom: 1 }, 0, -5000, 720, L).pitch).toBe(1.45);
    expect(dragCamera({ yaw: 0, pitch: -1.4, zoom: 1 }, 0, 5000, 720, L).pitch).toBe(-1.45);
  });
  it("a full-width drag turns the model by the same angle on a phone and on a desktop", () => {
    const L2 = { ...L }, z = { yaw: 0, pitch: 0, zoom: 1 };
    expect(dragCamera(z, 360, 0, 360, L2).yaw).toBeCloseTo(dragCamera(z, 820, 0, 820, L2).yaw, 12);
  });
  it("inertia is frame-rate independent: 60 Hz, 120 Hz and irregular frames travel the same angle", () => {
    const run = (dts: number[]) => { let v = 4, a = 0; for (const dt of dts) { const s = inertiaStep(v, dt); a += s.delta; v = s.velocity; } return a; };
    const at60 = run(Array(60).fill(1 / 60)), at120 = run(Array(120).fill(1 / 120));
    const irregular = run([...Array(30).fill(1 / 90), ...Array(15).fill(1 / 30), ...Array(30).fill(1 / 144), 1 - 30 / 90 - 15 / 30 - 30 / 144]);
    expect(at120).toBeCloseTo(at60, 10); expect(irregular).toBeCloseTo(at60, 10);
    expect(at60).toBeLessThan(4 * ORBIT.inertiaTau + 1e-9);
  });
  it("release velocity is zero after a pause and capped (no uncontrolled acceleration)", () => {
    expect(releaseVelocity([{ t: 0, v: 0 }, { t: 10, v: .1 }], 200)).toBe(0);
    expect(releaseVelocity([{ t: 0, v: 0 }, { t: 10, v: 50 }], 12)).toBe(ORBIT.maxSpeed);
    expect(releaseVelocity([{ t: 0, v: 0 }, { t: 50, v: .1 }], 55)).toBeCloseTo(2, 9);
  });
  it("wheel zoom: up zooms in, down zooms out, line / page modes scaled, huge deltas bounded", () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1); expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-48), 12);
    expect(wheelZoomFactor(-1e9)).toBeCloseTo(wheelZoomFactor(-600), 12);
    expect(clampNumber(5, 0, 2)).toBe(2);
  });
});

const drag = (el: Element, id: number, dx: number, dy = 0) => {
  fireEvent.pointerDown(el, { pointerId: id, clientX: 100, clientY: 100 });
  for (let i = 1; i <= 8; i++) fireEvent.pointerMove(el, { pointerId: id, clientX: 100 + dx * i / 8, clientY: 100 + dy * i / 8 });
  fireEvent.pointerUp(el, { pointerId: id, clientX: 100 + dx, clientY: 100 + dy });
};
const svgOf = (c: HTMLElement) => c.querySelector("svg.i3d-scene") as SVGSVGElement;

describe("21D-VIEW viewer behaviour", () => {
  it("3D-RESET-01: reset restores the canonical camera after rotation and zoom; 'full model' re-fits the zoom only", () => {
    const { container } = render(<Interactive3DView spec={scene3DPreset("cube", "reset")} />);
    const svg = svgOf(container), canon = [svg.getAttribute("data-yaw"), svg.getAttribute("data-pitch"), svg.getAttribute("data-zoom")];
    drag(svg, 1, 200, 60);
    fireEvent.click(screen.getByRole("button", { name: "تكبير" })); fireEvent.click(screen.getByRole("button", { name: "تكبير" }));
    const turned = svg.getAttribute("data-yaw");
    expect(turned).not.toBe(canon[0]);
    fireEvent.click(screen.getByRole("button", { name: "عرض النموذج كاملًا" }));
    expect([svg.getAttribute("data-yaw"), svg.getAttribute("data-zoom")]).toEqual([turned, "1"]);
    fireEvent.click(screen.getByRole("button", { name: "إعادة العرض" }));
    expect([svg.getAttribute("data-yaw"), svg.getAttribute("data-pitch"), svg.getAttribute("data-zoom")]).toEqual(canon);
  });
  it("3D-ZOOM-01: zoom stays within the contract's bounds whatever the input", () => {
    const { container } = render(<Interactive3DView spec={scene3DPreset("cube", "zoom")} />);
    const svg = svgOf(container);
    for (let i = 0; i < 40; i++) fireEvent.click(screen.getByRole("button", { name: "تكبير" }));
    expect(Number(svg.getAttribute("data-zoom"))).toBe(2.2);
    act(() => { svg.focus(); });
    for (let i = 0; i < 40; i++) act(() => { svg.dispatchEvent(new WheelEvent("wheel", { deltaY: 600, bubbles: true, cancelable: true })); });
    expect(Number(svg.getAttribute("data-zoom"))).toBe(.55);
  });
  it("the camera resets when the scene CONTENT changes (another scene), not when an identical object is passed again", () => {
    function Host({ id }: { id: string }) { return <Interactive3DView spec={scene3DPreset("pyramid", id)} />; }
    const { container, rerender } = render(<Host id="p1" />);
    const svg = () => svgOf(container), canon = svg().getAttribute("data-yaw");
    drag(svg(), 2, 150);
    const turned = svg().getAttribute("data-yaw");
    rerender(<Host id="p1" />);
    expect(svg().getAttribute("data-yaw")).toBe(turned);
    rerender(<Host id="p2" />);
    expect(svg().getAttribute("data-yaw")).toBe(canon);
  });
  it("keyboard input elsewhere on the page never moves the model; keys on the focused model are consumed", () => {
    const { container } = render(<div><input aria-label="جواب" /><Interactive3DView spec={scene3DPreset("cube", "keys")} /></div>);
    const svg = svgOf(container), before = svg.getAttribute("data-yaw"), input = screen.getByLabelText("جواب");
    fireEvent.keyDown(input, { key: "ArrowRight" }); fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(svg.getAttribute("data-yaw")).toBe(before);
    const ev = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    act(() => { svg.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect(svg.getAttribute("data-yaw")).not.toBe(before);
  });
  it("auto-rotate turns the model, yields to the student's first touch, and is not offered under reduced motion", async () => {
    const { container } = render(<Interactive3DView spec={scene3DPreset("pyramid", "auto")} />);
    const svg = svgOf(container), before = svg.getAttribute("data-yaw");
    fireEvent.click(screen.getByRole("button", { name: "دوران تلقائي" }));
    // the animation never settles while it runs, so frames are let through outside act() and then flushed synchronously
    await new Promise(r => setTimeout(r, 150)); act(() => {});
    expect(svg.getAttribute("data-yaw")).not.toBe(before);
    fireEvent.pointerDown(svg, { pointerId: 9, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(svg, { pointerId: 9, clientX: 10, clientY: 10 });
    const stopped = svg.getAttribute("data-yaw");
    await new Promise(r => setTimeout(r, 100)); act(() => {});
    expect(svg.getAttribute("data-yaw")).toBe(stopped);
    expect(screen.getByRole("button", { name: "دوران تلقائي" }).getAttribute("aria-pressed")).toBe("false");
    cleanup();
    vi.spyOn(window, "matchMedia").mockImplementation(q => ({ matches: q.includes("reduce"), media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as MediaQueryList);
    render(<Interactive3DView spec={scene3DPreset("pyramid", "auto2")} />);
    expect(screen.queryByRole("button", { name: "دوران تلقائي" })).toBeNull();
  });
  it("a click that stops auto-rotation (or a camera button) returns the viewer to its rest quality; the clicked drawing stays until the click is delivered", async () => {
    const { container } = render(<Interactive3DView spec={scene3DPreset("heart", "settle")} />);
    const svg = svgOf(container), rest = svg.getAttribute("data-quality");
    const toggle = () => container.querySelector(".i3d-controls button[aria-pressed]") as HTMLElement;
    fireEvent.click(toggle());
    expect(svg.getAttribute("data-interacting")).toBe("true");
    expect(svg.getAttribute("data-quality")).not.toBe(rest);
    fireEvent.pointerDown(svg, { pointerId: 21, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(svg, { pointerId: 21, clientX: 50, clientY: 50 });
    // same task as the click: still the moving drawing the student pressed on
    expect(svg.getAttribute("data-interacting")).toBe("true");
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });
    expect(svg.getAttribute("data-interacting")).toBeNull();
    expect(svg.getAttribute("data-quality")).toBe(rest);
    fireEvent.click(toggle());
    expect(svg.getAttribute("data-interacting")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "تدوير لليسار" }));
    expect(svg.getAttribute("data-interacting")).toBeNull();
    expect(svg.getAttribute("data-quality")).toBe(rest);
  });
  it("the last step of a pinch is applied when the fingers lift, even when moves were coalesced into one frame", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    const { container } = render(<Interactive3DView spec={scene("sphere")} />);
    const svg = svgOf(container);
    fireEvent.pointerDown(svg, { pointerId: 31, clientX: 180, clientY: 200, pointerType: "touch" });
    fireEvent.pointerDown(svg, { pointerId: 32, clientX: 220, clientY: 200, pointerType: "touch" });
    for (let i = 1; i <= 4; i++) {
      fireEvent.pointerMove(svg, { pointerId: 31, clientX: 180 - i * 5, clientY: 200, pointerType: "touch" });
      fireEvent.pointerMove(svg, { pointerId: 32, clientX: 220 + i * 5, clientY: 200, pointerType: "touch" });
    }
    fireEvent.pointerUp(svg, { pointerId: 31 }); fireEvent.pointerUp(svg, { pointerId: 32 });
    // fingers 40 px → 80 px apart: zoom ×2, applied at once (not left to a later frame or lost)
    expect(svg.getAttribute("data-zoom")).toBe("2");
  });
  it("3D-LIFE-01: repeated mount / unmount (also mid-animation) leaves no frame callback or wheel listener behind", async () => {
    const pendingFrames = new Set<number>(); let next = 1;
    const realRaf = window.requestAnimationFrame;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(cb => { const id = next++; pendingFrames.add(id); realRaf(t => { if (pendingFrames.delete(id)) cb(t); }); return id; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { pendingFrames.delete(id); });
    const added = vi.spyOn(SVGElement.prototype, "addEventListener"), removed = vi.spyOn(SVGElement.prototype, "removeEventListener");
    for (let i = 0; i < 12; i++) {
      const { unmount } = render(<Interactive3DView spec={scene3DPreset(i % 2 ? "heart" : "cube", "life" + i)} />);
      fireEvent.click(screen.getByRole("button", { name: "دوران تلقائي" }));
      unmount();
    }
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });
    expect(pendingFrames.size).toBe(0);
    const wheelAdds = added.mock.calls.filter(c => c[0] === "wheel").length, wheelRemoves = removed.mock.calls.filter(c => c[0] === "wheel").length;
    expect(wheelAdds).toBeGreaterThan(0); expect(wheelRemoves).toBe(wheelAdds);
  });
  it("display modes: wireframe draws no surfaces, transparent draws back faces translucently, solid+edges draws crease lines", () => {
    const { container } = render(<Interactive3DView spec={scene3DPreset("cube", "modes")} />);
    const mode = screen.getByRole("combobox", { name: /طريقة العرض/ });
    expect(container.querySelectorAll("line.i3d-line-crease").length).toBeGreaterThanOrEqual(9);
    expect(container.querySelectorAll("polygon.i3d-face")).toHaveLength(3);
    fireEvent.change(mode, { target: { value: "wireframe" } });
    expect(container.querySelectorAll("polygon.i3d-face")).toHaveLength(0);
    expect(container.querySelectorAll("line.i3d-line")).toHaveLength(12);
    fireEvent.change(mode, { target: { value: "transparent" } });
    const faces = [...container.querySelectorAll("polygon.i3d-face")];
    expect(faces).toHaveLength(6);
    expect(faces.every(f => Number(f.getAttribute("fill-opacity")) < .5)).toBe(true);
  });
  it("quality: the heart rests at its rest level and turns at the lighter level, then returns to the rest level", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(q => ({ matches: q.includes("reduce"), media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as MediaQueryList);
    const { container } = render(<Interactive3DView spec={scene3DPreset("heart", "lod")} />);
    const svg = svgOf(container);
    expect(svg.getAttribute("data-quality")).toBe("medium");
    fireEvent.pointerDown(svg, { pointerId: 3, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 3, clientX: 160, clientY: 100 });
    expect(svg.getAttribute("data-quality")).toBe("draft");
    fireEvent.pointerUp(svg, { pointerId: 3, clientX: 160, clientY: 100 });
    expect(svg.getAttribute("data-quality")).toBe("medium");
    fireEvent.change(screen.getByRole("combobox", { name: /جودة العرض/ }), { target: { value: "low" } });
    expect(svg.getAttribute("data-quality")).toBe("low");
  });
  it("motion detail: while a curved model moves only true edges are drawn; its silhouette returns when it settles", () => {
    const { container } = render(<Interactive3DView spec={scene("cylinder", { x: 3, y: 3, z: 3 })} />);
    const svg = svgOf(container), count = (k: string) => container.querySelectorAll("line.i3d-line-" + k).length;
    expect(count("silhouette")).toBeGreaterThan(0);
    const creases = count("crease");
    expect(creases).toBeGreaterThan(0);
    fireEvent.pointerDown(svg, { pointerId: 41, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 41, clientX: 150, clientY: 110 });
    expect(svg.getAttribute("data-interacting")).toBe("true");
    expect(count("silhouette")).toBe(0);
    expect(count("crease")).toBeGreaterThan(0);
    fireEvent.pointerMove(svg, { pointerId: 41, clientX: 150, clientY: 110 });
    act(() => { vi.spyOn(performance, "now").mockReturnValue(1e9); });
    fireEvent.pointerUp(svg, { pointerId: 41, clientX: 150, clientY: 110 });
    expect(svg.getAttribute("data-interacting")).toBeNull();
    expect(count("silhouette")).toBeGreaterThan(0);
  });
  it("selection: only visible edges are drawn as targets in the model, every edge stays in the list", () => {
    const sel = { kind: "edge" as const, mode: "single" as const, max: 1, value: [], onChange: () => {} };
    const { container } = render(<Interactive3DView spec={scene3DPreset("cube", "edges")} selection={sel} />);
    const drawn = container.querySelectorAll("line.i3d-edge-target").length;
    expect(drawn).toBeGreaterThanOrEqual(9); expect(drawn).toBeLessThan(12);
    expect(within(screen.getByRole("group", { name: /اختر/ })).getAllByRole("button")).toHaveLength(12);
  });
});

describe("21D-EXAM the 3D question inside the exam flow", () => {
  const question = (): Question => ({ id: "q3d", examQuestionId: "q3d", type: "scene3DSelection", presentationType: "scene3DSelection", questionTypeVersion: 1, text: "اختر البطين الأيسر.", marks: 2,
    scene3DSelection: { v: 1, scene: scene3DPreset("heart", "exam-heart"), target: "object", mode: "single", maxSelections: 1, label: "اختر جزءًا من القلب" } } as unknown as Question);
  it("3D-EXAM-01: rotating, zooming and re-rendering (timer ticks, re-derived question) never change the answer or reset the view", () => {
    let tick: () => void = () => {};
    const answers: (Answer | undefined)[] = [];
    function Exam() {
      const [, setN] = useState(0); const [a, setA] = useState<Answer | undefined>(undefined);
      useEffect(() => { tick = () => setN(n => n + 1); });
      return <Scene3DSelectionResponse q={question()} id="q3d" answer={a} labelPrefix="" onAnswer={n => { setA(n); answers.push(n); }} />;
    }
    const { container } = render(<Exam />);
    const svg = svgOf(container);
    drag(svg, 4, 180, 40);
    act(() => { svg.focus(); svg.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, bubbles: true, cancelable: true })); });
    const view = [svg.getAttribute("data-yaw"), svg.getAttribute("data-zoom")];
    for (let i = 0; i < 5; i++) act(() => tick());
    expect([svg.getAttribute("data-yaw"), svg.getAttribute("data-zoom")]).toEqual(view);
    expect(answers).toEqual([]);
    fireEvent.click(within(screen.getByRole("group", { name: "اختر جزءًا من القلب" })).getByRole("button", { name: /البطين الأيسر/ }));
    expect(answers.at(-1)).toEqual({ kind: "scene3DSelection", sceneId: "exam-heart", targets: ["object:leftVentricle"] });
    drag(svg, 5, -120);
    expect(answers).toHaveLength(1);
  });
});
