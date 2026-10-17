// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import SurfacePlot3DView from "./SurfacePlot3DView";
import SurfacePlot3DEditor from "./SurfacePlot3DEditor";
import { surfacePlotPreset } from "./surfacePlotPresets";
import { surfaceTemplate } from "./surfaceEditing";
import { validateSurfacePlotSpec, type SurfacePlotSpecV2 } from "./surfacePlotSpec";
import RichContentRenderer from "../richContent/RichContentRenderer";
import RichContentEditor from "../richContent/RichContentEditor";
import type { RichContentV1 } from "../richContent/richContentModel";

// Phase 21D-A.4 — the multi-surface viewer, the editor and the rich-content integration in the real components.
afterEach(cleanup);
const plot = (patch: Partial<SurfacePlotSpecV2> = {}): SurfacePlotSpecV2 => ({ ...surfacePlotPreset("paraboloids", "plot-ui"), axes: { x: { label: "x", unit: "m" }, y: { label: "y", unit: "m" }, z: { label: "z", unit: "m" } }, ...patch });
const scene = (c: HTMLElement) => c.querySelector("svg.sp3d-scene") as SVGSVGElement;
const attr = (c: HTMLElement, k: string) => scene(c).getAttribute(k);
const polys = (c: HTMLElement, s?: number) => [...scene(c).querySelectorAll("polygon[data-s]")].filter(p => s === undefined || p.getAttribute("data-s") === String(s)).length;
const rest = async (c: HTMLElement) => waitFor(() => expect(attr(c, "data-level")).toBe("standard"));

describe("21D-A.4 viewer — legend, toggles, rotate / zoom / reset", () => {
  it("draws both surfaces in one coordinate system with a legend, axis titles with units and an accessible description", async () => {
    const { container } = render(<SurfacePlot3DView spec={plot()} />);
    expect(attr(container, "data-level")).toBe("motion");                                       // light mesh on the first paint
    await rest(container);
    expect(polys(container, 0)).toBeGreaterThan(200);
    expect(polys(container, 1)).toBeGreaterThan(200);
    const legend = screen.getByRole("list", { name: "مفتاح الأسطح" });
    expect(within(legend).getAllByRole("listitem").map(li => li.getAttribute("data-surface"))).toEqual(["upward", "downward"]);
    expect(legend.textContent).toContain("z = x^2+y^2");
    expect(legend.textContent).toContain("z = 4-x^2-y^2");
    expect([...scene(container).querySelectorAll(".sp3d-axis-title")].map(t => t.textContent)).toEqual(["x (m)", "y (m)", "z (m)"]);
    expect(scene(container).querySelectorAll(".sp3d-tick").length).toBeGreaterThan(6);
    expect(scene(container).getAttribute("aria-label")).toContain("القطع المكافئ المقلوب");
    expect(scene(container).querySelectorAll(".sp3d-meshline").length).toBeGreaterThan(0);  // default style: surface + mesh lines
    expect(container.querySelector(".sp3d-table tbody")!.querySelectorAll("tr").length).toBe(18);
  });
  it("hides and shows a single surface from the legend; all hidden says so", async () => {
    const { container } = render(<SurfacePlot3DView spec={plot()} />);
    await rest(container);
    const second = screen.getByRole("checkbox", { name: /إظهار السطح القطع المكافئ المقلوب/ });
    fireEvent.click(second);
    expect(polys(container, 1)).toBe(0);
    expect(polys(container, 0)).toBeGreaterThan(0);
    expect(attr(container, "data-visible")).toBe("upward");
    fireEvent.click(second);
    expect(polys(container, 1)).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox", { name: /إظهار السطح القطع المكافئ z/ }));
    fireEvent.click(second);
    expect(polys(container)).toBe(0);
    expect(screen.getByRole("status").textContent).toContain("كل الأسطح مخفية");
  });
  // Every camera step re-draws the full mesh, so each test below takes at most two steps (a busy CI machine stays well
  // inside the default per-test timeout).
  const view = (c: HTMLElement) => [attr(c, "data-yaw"), attr(c, "data-pitch"), attr(c, "data-zoom")];
  it("rotates with the buttons; the camera never reaches an answer", async () => {
    const { container } = render(<SurfacePlot3DView spec={plot()} />);
    await rest(container);
    expect(view(container)).toEqual(["-0.6", "0.45", "1"]);
    fireEvent.click(screen.getByRole("button", { name: "تدوير لليمين" }));
    expect(attr(container, "data-yaw")).toBe("-0.4");
    fireEvent.click(screen.getByRole("button", { name: "رفع المنظور" }));
    expect(attr(container, "data-pitch")).toBe("0.6");
  });
  it("zooms in and out with the buttons", async () => {
    const { container } = render(<SurfacePlot3DView spec={plot()} />);
    await rest(container);
    fireEvent.click(screen.getByRole("button", { name: "تكبير" }));
    expect(attr(container, "data-zoom")).toBe("1.12");
    fireEvent.click(screen.getByRole("button", { name: "تصغير" }));
    expect(attr(container, "data-zoom")).toBe("1");
  });
  it("rotates and zooms with the keys", async () => {
    const { container } = render(<SurfacePlot3DView spec={plot()} />);
    await rest(container);
    fireEvent.keyDown(scene(container), { key: "ArrowLeft" });
    fireEvent.keyDown(scene(container), { key: "-" });
    expect(view(container)).toEqual(["-0.8", "0.45", "0.893"]);
  });
  it("Home returns to the authored view", async () => {
    const { container } = render(<SurfacePlot3DView spec={plot()} />);
    await rest(container);
    fireEvent.keyDown(scene(container), { key: "ArrowRight" });
    expect(attr(container, "data-yaw")).toBe("-0.4");
    fireEvent.keyDown(scene(container), { key: "Home" });
    expect(view(container)).toEqual(["-0.6", "0.45", "1"]);
  });
  it("«إعادة العرض» returns to the authored view", async () => {
    const { container } = render(<SurfacePlot3DView spec={plot()} />);
    await rest(container);
    fireEvent.click(screen.getByRole("button", { name: "خفض المنظور" }));
    expect(attr(container, "data-pitch")).toBe("0.3");
    fireEvent.click(screen.getByRole("button", { name: "إعادة العرض" }));
    expect(view(container)).toEqual(["-0.6", "0.45", "1"]);
  });
  it("a one-finger drag rotates the plot (light mesh while moving, full quality after)", async () => {
    const { container } = render(<SurfacePlot3DView spec={plot()} />);
    await rest(container);
    const svg = scene(container), yaw0 = attr(container, "data-yaw");
    fireEvent.pointerDown(svg, { pointerId: 1, isPrimary: true, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 180, clientY: 110 });
    await waitFor(() => expect(attr(container, "data-yaw")).not.toBe(yaw0));
    expect(attr(container, "data-level")).toBe("motion");
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 180, clientY: 110 });
    await waitFor(() => expect(attr(container, "data-level")).toBe("standard"), { timeout: 3000 });
  });
  it("respects the authored controls: no rotation, no zoom, no surface toggles", async () => {
    const { container } = render(<SurfacePlot3DView spec={plot({ controls: { rotate: false, zoom: false, toggleSurfaces: false } })} />);
    await rest(container);
    expect(screen.queryByRole("button", { name: "تدوير لليمين" })).toBeNull();
    expect(screen.queryByRole("button", { name: "تكبير" })).toBeNull();
    expect(screen.queryAllByRole("checkbox", { name: /إظهار السطح/ })).toHaveLength(0);
    fireEvent.keyDown(scene(container), { key: "ArrowLeft" });
    fireEvent.keyDown(scene(container), { key: "+" });
    expect([attr(container, "data-yaw"), attr(container, "data-zoom")]).toEqual(["-0.6", "1"]);
    expect(screen.getByRole("button", { name: "إعادة العرض" })).toBeTruthy();
  });
  it("display styles: solid has no mesh lines, transparent lets surfaces show through; the grid can be hidden", async () => {
    const { container } = render(<SurfacePlot3DView spec={plot()} />);
    await rest(container);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "solid" } });
    expect(scene(container).querySelectorAll(".sp3d-meshline").length).toBe(0);
    fireEvent.change(select, { target: { value: "transparent" } });
    expect(scene(container).querySelector("polygon[data-s]")!.getAttribute("fill-opacity")).toBe("0.6");
    const grid = scene(container).querySelectorAll(".sp3d-grid").length;
    expect(grid).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("checkbox", { name: /شبكة المحاور/ }));
    expect(scene(container).querySelectorAll(".sp3d-grid").length).toBe(0);
  });
  it("keeps the student's view when an identical plot is passed again; starts again when the content changes", async () => {
    let bump = () => {};
    function Parent({ spec }: { spec: SurfacePlotSpecV2 }) { const [, setN] = useState(0); useEffect(() => { bump = () => setN(n => n + 1); }); return <SurfacePlot3DView spec={JSON.parse(JSON.stringify(spec))} />; }
    const { container, rerender } = render(<Parent spec={plot()} />);
    fireEvent.click(screen.getByRole("button", { name: "تدوير لليمين" }));
    act(() => bump());
    expect(attr(container, "data-yaw")).toBe("-0.4");
    rerender(<Parent spec={plot({ title: "عنوان آخر" })} />);
    expect(attr(container, "data-yaw")).toBe("-0.6");
  });
  it("an invalid plot is never drawn: it asks for teacher review", () => {
    render(<SurfacePlot3DView spec={plot({ surfaces: [] })} />);
    expect(screen.getByRole("alert").textContent).toContain("يحتاج مراجعة المعلم");
  });
});

describe("21D-A.4 editor and rich-content integration", () => {
  function Host({ initial, onValue }: { initial: SurfacePlotSpecV2; onValue?: (s: SurfacePlotSpecV2) => void }) {
    const [s, setS] = useState(initial);
    return <SurfacePlot3DEditor surface={s} onChange={n => { setS(n); onValue?.(n); }} />;
  }
  it("authors 1 to 5 surfaces with labels, colours, domain, axes, controls and a live preview of the real viewer", async () => {
    let last = plot();
    const { container } = render(<Host initial={plot()} onValue={s => { last = s; }} />);
    expect(container.querySelector(".sp3d-editor .sp3d-scene")).not.toBeNull();
    const add = screen.getByRole("button", { name: "+ إضافة سطح" });
    for (let i = 0; i < 3; i++) fireEvent.click(add);
    expect(screen.getAllByTestId("surface-plot-surface")).toHaveLength(5);
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(validateSurfacePlotSpec(last).ok).toBe(true);                                       // added surfaces get free colours
    expect(new Set(last.surfaces.map(s => s.color)).size).toBe(5);
    fireEvent.change(screen.getByLabelText("معادلة السطح 5"), { target: { value: "x+t" } });
    expect(screen.getByRole("alert").textContent).toContain("SURFACE_PLOT_VARIABLE_INVALID");
    expect(container.querySelector(".sp3d-editor .sp3d-scene")).toBeNull();                 // no preview of an invalid plot
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getAllByRole("button", { name: /حذف السطح/ })[0]);
    expect(screen.getAllByTestId("surface-plot-surface")).toHaveLength(1);
    expect((screen.getByRole("button", { name: "حذف السطح 1" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "تطبيق القالب" }));
    expect(last.id).toBe("plot-ui");
    expect(last.surfaces.map(s => s.id)).toEqual(["upward", "downward"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "السماح بالتكبير" }));
    expect(last.controls.zoom).toBe(false);
    expect(validateSurfacePlotSpec(last).ok).toBe(true);
  });
  // One block per test: each lazy viewer mounts and draws on its own.
  it("the student renderer draws a V2 plot with the new viewer", async () => {
    const content: RichContentV1 = { schemaVersion: 1, blocks: [{ type: "functionSurface3D", surface: plot() }] };
    const { container } = render(<RichContentRenderer content={content} />);
    await waitFor(() => expect(container.querySelector("svg.sp3d-scene")).not.toBeNull());
    expect(container.querySelectorAll("figure.sp3d").length).toBe(1);
    expect(container.querySelectorAll("figure.ex3d").length).toBe(0);
  });
  it("the student renderer draws a V1 surface with the unchanged 21B viewer", async () => {
    const content: RichContentV1 = { schemaVersion: 1, blocks: [{ type: "functionSurface3D", surface: surfaceTemplate("saddle", "legacy") }] };
    const { container } = render(<RichContentRenderer content={content} />);
    await waitFor(() => expect(container.querySelector("svg.ex3d-scene")).not.toBeNull());
    expect(container.querySelectorAll("figure.ex3d").length).toBe(1);
    expect(container.querySelectorAll("figure.sp3d").length).toBe(0);
  });
  it("the block editor creates V2 plots and upgrades a stored V1 surface only when the teacher asks", async () => {
    let value: RichContentV1 = { schemaVersion: 1, blocks: [{ type: "functionSurface3D", surface: surfaceTemplate("paraboloid", "legacy") }] };
    function H() { const [v, setV] = useState(value); return <RichContentEditor value={v} onChange={n => { value = n!; setV(n!); }} />; }
    render(<H />);
    const upgrade = await screen.findByRole("button", { name: "ترقية إلى رسم متعدد الأسطح" });
    expect(value.blocks[0].type === "functionSurface3D" && value.blocks[0].surface.version).toBe(1);
    fireEvent.click(upgrade);
    await waitFor(() => expect(value.blocks[0].type === "functionSurface3D" && value.blocks[0].surface.version).toBe(2));
    const b = value.blocks[0];
    if (b.type !== "functionSurface3D" || b.surface.version !== 2) throw new Error("not upgraded");
    expect([b.surface.id, b.surface.surfaces[0].expression, b.surface.surfaces[0].label]).toEqual(["legacy", "x^2+y^2", "سطح قطع مكافئ"]);
    expect(await screen.findByTestId("surface-plot-editor", {}, { timeout: 5000 })).toBeTruthy();   // the lazy editor chunk
  });
});
