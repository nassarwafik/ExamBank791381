// @vitest-environment happy-dom
// DG12 — «مخطط مبنى إداري» (docs/enterprise-diagram-editor-design.md §24): the plan of an administrative building, seen from above.
//   • the kind: under «تحليل النظم» after the organisation chart; the building and its rooms (resizable, under everything), doors and
//     windows, office furniture, the shared note / icon / text; one line, «مسار الحركة»;
//   • the example: valid, read back the same, no «افحص المخطط» finding, every room with a door, the building first;
//   • the drawing: a room's walls and floor, a piece's own drawing and its label, a door turned the way it faces;
//   • the strict reader: a turn is one of the four;
//   • «افحص المخطط»: a room with no door, two rooms one over the other, a desk outside the building, no main entrance — each named, and
//     each corrected;
//   • the editor: the turn chosen from four, one «تراجع».
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { DIAGRAM_CATALOG, kindSpec } from "./diagramCatalog";
import { addNode, parseDiagram, serializeDiagram, type DiagramDoc, type DNode } from "./diagramDoc";
import { layoutNode } from "./diagramLayout";
import { NodeShape } from "./diagramShapes";
import { exampleDoc } from "./diagramExamples";
import { checkDiagram } from "./diagramChecks";
import DiagramEditorTool from "./DiagramEditorTool";

afterEach(cleanup);
const node = (id: string, type: string, x: number, y: number, text: Record<string, string> = {}, w?: number, h?: number): DNode => {
  const spec = kindSpec("floorPlan").nodes.find(n => n.type === type)!;
  return { id, type, x, y, w: w ?? spec.minW, h: h ?? spec.minH, text: { ...spec.defaults, ...text }, color: "none" };
};
const plan = (...nodes: DNode[]): DiagramDoc => ({ kind: "floorPlan", nodes, edges: [] });
const rules = (d: DiagramDoc) => checkDiagram(d).map(f => f.level + ":" + f.rule);
const markup = (d: DiagramDoc, id: string) => renderToStaticMarkup(<svg><NodeShape b={layoutNode(d, d.nodes.find(n => n.id === id)!)!} /></svg>);

describe("the kind and its example", () => {
  it("under «تحليل النظم» after the org chart: the building, rooms, doors, windows, furniture and the shared three; one line, «مسار الحركة»", () => {
    const k = kindSpec("floorPlan");
    expect(k.label).toBe("مخطط مبنى إداري");
    expect(DIAGRAM_CATALOG.filter(c => c.group === "تحليل النظم").map(c => c.kind)).toEqual(["dfd", "orgChart", "floorPlan"]);
    expect(k.nodes.map(n => n.type)).toEqual(["building", "room", "door", "entrance", "windowH", "windowV", "desk", "chair", "reception", "meeting", "waiting",
      "coffee", "cabinet", "shelves", "plant", "hedge", "note", "icon", "text"]);
    expect(k.nodes.filter(n => n.resizable).map(n => n.type)).toEqual(["building", "room"]);
    for (const n of k.nodes.filter(n => n.form === "furniture")) expect(n.piece, n.type).toBe(n.type);
    expect(k.nodes.filter(n => n.fields.some(f => f.choose === "turn")).map(n => n.type)).toEqual(["door", "chair"]);
    expect(k.edges.map(e => [e.type, e.label, e.start, e.end])).toEqual([["walk", "مسار الحركة", "none", "arrow"]]);
  });
  it("the example: valid, read back the same, no finding; the building first, its rooms next; every room named, with a door", () => {
    const d = exampleDoc("floorPlan");
    const r = parseDiagram(serializeDiagram(d));
    expect(r.ok && r.doc).toEqual(d);
    expect(checkDiagram(d)).toEqual([]);
    expect(d.nodes.slice(0, 8).map(n => n.type)).toEqual(["building", ...Array(7).fill("room")]);
    expect(d.nodes.filter(n => n.type === "room").map(n => n.text.name)).toEqual(["المحاسبة", "صالة الاستقبال", "مكتب المدير", "شؤون الموظفين", "قاعة الاجتماعات", "الأرشيف", "تقنية المعلومات"]);
    expect(d.nodes.filter(n => n.type === "door")).toHaveLength(7);
    const walk = d.edges[0], by = (id: string) => d.nodes.find(n => n.id === id)!;
    expect([by(walk.from).type, by(walk.to).type]).toEqual(["entrance", "reception"]);
  });
  it("a new room goes under everything; a new piece on top", () => {
    let d = plan(node("n1", "desk", 100, 100));
    const a = addNode(d, "room", { x: 150, y: 150 });
    expect(a.ok).toBe(true);
    d = (a as { doc: DiagramDoc }).doc;
    expect(d.nodes.map(n => n.type)).toEqual(["room", "desk"]);
    d = (addNode(d, "door", { x: 400, y: 400 }) as { doc: DiagramDoc }).doc;
    expect(d.nodes.map(n => n.type)).toEqual(["room", "desk", "door"]);
  });
});

describe("the drawing", () => {
  it("a room: its floor and walls, its name on a label; the building's floor is the corridor's, its walls thicker", () => {
    const d = plan(node("n1", "building", 0, 0, {}, 400, 300), node("n2", "room", 0, 0, { name: "مكتب المدير" }, 200, 150));
    const room = markup(d, "n2"), building = markup(d, "n1");
    expect(room).toContain('fill="#fbf1e7"');
    expect(room).toContain('stroke-width="7"');
    expect(room).toContain("مكتب المدير");
    expect(building).toContain('fill="#f8f5f0"');
    expect(building).toContain('stroke-width="9"');
    expect(building).not.toContain("<text");   // a building with no name: no label
  });
  it("a piece: its drawing in its catalog size, its label under it (and the box grows to hold it); none without a label", () => {
    const d = plan(node("n1", "reception", 0, 0), node("n2", "desk", 0, 0));
    const reception = layoutNode(d, d.nodes[0])!, desk = layoutNode(d, d.nodes[1])!;
    expect(reception.title).toEqual(["الاستقبال"]);
    expect(reception.h).toBeGreaterThan(70);
    expect(desk.title).toEqual([]);
    expect(desk.h).toBe(80);
    expect(markup(d, "n1")).toContain("الاستقبال");
    expect(markup(d, "n2")).not.toContain("<text");
  });
  it("a door turns the way it faces (the quarter turns round its centre); facing down it is not turned", () => {
    for (const [turn, rot] of [["90", "rotate(90,25,25)"], ["180", "rotate(180,25,25)"], ["270", "rotate(270,25,25)"]]) {
      expect(markup(plan(node("n1", "door", 100, 100, { turn })), "n1"), turn).toContain(rot);
    }
    expect(markup(plan(node("n1", "door", 100, 100)), "n1")).not.toContain("rotate(");
  });
  it("every piece draws something, with no text, no id and no clip path (a saved picture draws it the same)", () => {
    for (const n of kindSpec("floorPlan").nodes.filter(s => s.form === "furniture")) {
      const svg = markup(plan(node("n1", n.type, 0, 0, { name: "" })), "n1");
      expect(svg, n.type).toMatch(/<(path|rect|circle)/);
      expect(svg, n.type).not.toMatch(/<text|id=|clip/);
    }
  });
});

describe("the strict reader", () => {
  const file = (text: Record<string, string>) => JSON.stringify({ format: "tadris.diagram", version: 1, kind: "floorPlan",
    nodes: [{ id: "n1", type: "door", x: 0, y: 0, w: 50, h: 50, text, color: "none" }], edges: [] });
  it("a turn is one of the four quarter turns", () => {
    for (const turn of ["0", "90", "180", "270"]) expect(parseDiagram(file({ turn })).ok, turn).toBe(true);
    for (const turn of ["45", "360", "-90", " 90", "x"]) expect(parseDiagram(file({ turn })).ok, turn).toBe(false);
  });
  it("a room smaller than its smallest size is refused; a chair has no field a door lacks", () => {
    const room = JSON.stringify({ format: "tadris.diagram", version: 1, kind: "floorPlan", nodes: [{ id: "n1", type: "room", x: 0, y: 0, w: 60, h: 60, text: {}, color: "none" }], edges: [] });
    expect(parseDiagram(room).ok).toBe(false);
    expect(parseDiagram(file({ size: "l" })).ok).toBe(false);
  });
});

describe("«افحص المخطط»", () => {
  const room = (id: string, x: number, y: number, name = "مكتب") => node(id, "room", x, y, { name }, 200, 150);
  it("a room with no door; a door in its wall, on any side, is enough; a door in the middle of its floor is not", () => {
    expect(rules(plan(room("n1", 100, 100)))).toEqual(["warning:plan.door"]);
    expect(rules(plan(room("n1", 100, 100), node("n2", "door", 180, 100)))).toEqual([]);
    expect(rules(plan(room("n1", 100, 100), node("n2", "door", 250, 160, { turn: "90" })))).toEqual([]);
    expect(rules(plan(room("n1", 100, 100), node("n2", "door", 180, 200, { turn: "180" })))).toEqual([]);
    expect(rules(plan(room("n1", 100, 100), node("n2", "door", 180, 160)))).toEqual(["warning:plan.door"]);
    expect(rules(plan(room("n1", 100, 100), node("n2", "door", 600, 600)))).toEqual(["warning:plan.door"]);
  });
  it("two rooms one over the other; side by side (one wall shared) is right", () => {
    const door = (id: string, x: number) => node(id, "door", x, 100);
    expect(rules(plan(room("n1", 100, 100), room("n2", 200, 100), door("n3", 120), door("n4", 330), node("n5", "entrance", 300, 400)))).toEqual(["warning:plan.overlap"]);
    expect(rules(plan(room("n1", 100, 100), room("n2", 300, 100), door("n3", 120), door("n4", 330), node("n5", "entrance", 300, 400)))).toEqual([]);
  });
  it("a desk outside the building; inside a room or the building it is right; a plant or bushes outside are right", () => {
    const b = node("n1", "building", 100, 100, {}, 500, 400), e = node("n2", "entrance", 300, 444);
    expect(rules(plan(b, e, node("n3", "desk", 700, 100)))).toEqual(["warning:plan.outside"]);
    expect(rules(plan(b, e, node("n3", "desk", 200, 200)))).toEqual([]);
    expect(rules(plan(b, e, node("n3", "plant", 700, 100), node("n4", "hedge", 100, 520)))).toEqual([]);
  });
  it("no main entrance in a building, or among several rooms; one room alone needs none", () => {
    expect(rules(plan(node("n1", "building", 100, 100, {}, 500, 400)))).toEqual(["warning:plan.entrance"]);
    expect(rules(plan(room("n1", 100, 100), room("n2", 300, 100), node("n3", "door", 120, 100), node("n4", "door", 330, 100)))).toEqual(["warning:plan.entrance"]);
    expect(rules(plan(room("n1", 100, 100), node("n2", "door", 120, 100)))).toEqual([]);
  });
  it("a room with no name", () => {
    expect(rules(plan(room("n1", 100, 100, ""), node("n2", "door", 120, 100)))).toEqual(["warning:name.missing"]);
  });
});

describe("the editor", () => {
  const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
  const click = async (el: HTMLElement) => { fireEvent.click(el); await tick(); };
  it("a door's direction chosen from four, drawn turned; one «تراجع» takes it back", async () => {
    localStorage.clear();
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "floorPlan" } });
    await tick();
    await click(screen.getByTestId("diagram-add-door"));
    const canvas = screen.getByTestId("diagram-canvas") as unknown as SVGSVGElement;
    expect(screen.getByTestId("diagram-turn-0").getAttribute("aria-checked")).toBe("true");
    expect(canvas.querySelector("[data-node]")!.innerHTML).not.toContain("rotate(");
    await click(screen.getByTestId("diagram-turn-90"));
    expect(screen.getByTestId("diagram-turn-90").getAttribute("aria-checked")).toBe("true");
    expect(canvas.querySelector("[data-node]")!.innerHTML).toContain("rotate(90,25,25)");
    await click(within(screen.getByTestId("diagram-editor")).getByRole("button", { name: /تراجع/ }));
    expect(canvas.querySelector("[data-node]")!.innerHTML).not.toContain("rotate(");
  });
});
