// DG5 — right angles and several at once (docs/enterprise-diagram-editor-design.md §17):
//   • an arrow's `route` ("ortho") is the one optional key of the file: read strictly, written only when set, so a straight diagram's file
//     is byte for byte what it was; a sequence diagram has none;
//   • a right-angled arrow is level and upright runs only, starting and ending on the two components' borders; two components facing
//     each other get one straight run, others a Z; runs meeting one side are spread along it (but a generalisation's trunk is shared);
//     a route that would pass through another component takes another shape when one is free;
//   • several components: removed, copied (with the arrows between them), lined up and spaced evenly;
//   • the selection helpers; and «اكتب كنص» says it in PlantUML's own words: «skinparam linetype ortho».
import { describe, it, expect } from "vitest";
import {
  alignNodes, connect, duplicateMany, emptyDoc, parseDiagram, removeMany, routeOf, serializeDiagram, setRoute, addNode, DIAGRAM_LIMITS,
  type DiagramDoc, type DNode,
} from "./diagramDoc";
import { edgePath, layoutNode, type EdgePath, type NodeBox } from "./diagramLayout";
import { exampleDoc } from "./diagramExamples";
import { DIAGRAM_CATALOG, type DiagramKind } from "./diagramCatalog";
import { checkDiagram } from "./diagramChecks";
import { inRect, makeSelection, selectedEdges, selectedNodes, toggleSelection } from "./DiagramCanvas";
import { keepPositions, readDiagramScript } from "./diagramScript";
import { diagramToScript } from "./diagramToScript";

const boxesOf = (doc: DiagramDoc) => { const m = new Map<string, NodeBox>(); for (const n of doc.nodes) { const b = layoutNode(doc, n); if (b) m.set(n.id, b); } return m; };
const pathsOf = (doc: DiagramDoc) => { const b = boxesOf(doc), m = new Map<string, EdgePath>(); for (const e of doc.edges) { const p = edgePath(doc, e, b); if (p) m.set(e.id, p); } return m; };
const allOrtho = (doc: DiagramDoc) => setRoute(doc, doc.edges.map(e => e.id), "ortho");
/** Every run level or upright. */
const square = (p: EdgePath) => p.pts.every((q, k) => k === 0 || q[0] === p.pts[k - 1][0] || q[1] === p.pts[k - 1][1]);
const node = (id: string, x: number, y: number, w = 120, h = 60, type = "entity", name = id): DNode => ({ id, type, x, y, w, h, text: { name }, color: "none" });
const erd = (nodes: DNode[], links: [string, string][]): DiagramDoc => {
  let d: DiagramDoc = { kind: "erd", nodes, edges: [] };
  for (const [a, b] of links) { const r = connect(d, a, b, "line", "ortho"); if (!r.ok) throw new Error(r.error); d = r.doc; }
  return d;
};
/** The first point of a right-angled line from the first component to the second. */
const erdOne = (a: DNode, b: DNode) => {
  const r = connect({ kind: "erd", nodes: [a, b], edges: [] }, a.id, b.id, "line", "ortho");
  if (!r.ok) throw new Error(r.error);
  return pathsOf(r.doc).get("e1")!.pts[0];
};
const hits = (p: EdgePath, b: { x: number; y: number; w: number; h: number }) =>
  p.pts.some((q, k) => k > 0 && (q[1] === p.pts[k - 1][1]
    ? q[1] > b.y && q[1] < b.y + b.h && Math.max(q[0], p.pts[k - 1][0]) > b.x && Math.min(q[0], p.pts[k - 1][0]) < b.x + b.w
    : q[0] > b.x && q[0] < b.x + b.w && Math.max(q[1], p.pts[k - 1][1]) > b.y && Math.min(q[1], p.pts[k - 1][1]) < b.y + b.h));

describe("the file: one optional key", () => {
  it("a right-angled arrow is written and read back; a straight one is written as before (no key)", () => {
    const ex = exampleDoc("dsd");
    expect(serializeDiagram(ex)).not.toContain("route");
    const ortho = allOrtho(ex);
    const text = serializeDiagram(ortho);
    expect(text.match(/"route": "ortho"/g)).toHaveLength(ex.edges.length);
    const back = parseDiagram(text);
    expect(back.ok && back.doc).toEqual(ortho);
    // straight again: the key goes, and the file is what it was
    expect(serializeDiagram(setRoute(ortho, ortho.edges.map(e => e.id), "straight"))).toBe(serializeDiagram(ex));
  });
  it("any other value, or a misspelt key, is refused", () => {
    const text = serializeDiagram(allOrtho(exampleDoc("erd")));
    for (const bad of [text.replace('"route": "ortho"', '"route": "curved"'), text.replace('"route": "ortho"', '"route": true'), text.replace('"route"', '"routes"'),
      text.replace('"route": "ortho"', '"route": null')]) expect(parseDiagram(bad).ok, bad.slice(0, 0)).toBe(false);
  });
  it("setRoute changes only the arrows named, and nothing in a sequence diagram; connect draws with the chosen route", () => {
    const ex = exampleDoc("class");
    const one = setRoute(ex, [ex.edges[0].id], "ortho");
    expect(one.edges.map(routeOf)).toEqual(ex.edges.map((_, i) => (i === 0 ? "ortho" : "straight")));
    expect(setRoute(one, [ex.edges[0].id], "ortho")).toBe(one);
    const seq = exampleDoc("sequence");
    expect(setRoute(seq, seq.edges.map(e => e.id), "ortho")).toBe(seq);
    const r = connect(seq, seq.nodes[0].id, seq.nodes[1].id, "sync", "ortho");
    expect(r.ok && r.doc.edges.at(-1)!.route).toBeUndefined();
    const c = connect(ex, ex.nodes[0].id, ex.nodes[1].id, "assoc", "ortho");
    expect(c.ok && c.doc.edges.at(-1)!.route).toBe("ortho");
    // unless asked, an arrow is straight (and its file has no key)
    const plain = connect(ex, ex.nodes[0].id, ex.nodes[1].id, "assoc");
    expect(plain.ok && "route" in plain.doc.edges.at(-1)!).toBe(false);
  });
});

describe("right-angled arrows", () => {
  it("every worked example drawn with right angles: level and upright runs only, valid, and «افحص المخطط» unchanged", () => {
    for (const { kind } of DIAGRAM_CATALOG) {
      const ex = exampleDoc(kind as DiagramKind), o = allOrtho(ex);
      const paths = pathsOf(o);
      expect(paths.size, kind).toBe(ex.edges.length);
      if (kind !== "sequence") for (const [id, p] of paths) expect(square(p), kind + " " + id + " " + p.d).toBe(true);
      expect(parseDiagram(serializeDiagram(o)).ok, kind).toBe(true);
      expect(checkDiagram(o), kind).toEqual(checkDiagram(ex));
    }
  });
  it("side by side: one level run from border to border; one over the other: one upright run", () => {
    const d = erd([node("n1", 100, 100), node("n2", 400, 110), node("n3", 90, 400)], [["n1", "n2"], ["n1", "n3"]]);
    const p = pathsOf(d);
    expect(p.get("e1")!.pts).toEqual([[220, 135], [400, 135]]);   // both centres' mean (130, 140) → 135, inside both
    expect(p.get("e2")!.pts).toEqual([[155, 160], [155, 400]]);
  });
  it("apart both ways: out of the facing sides across the wider gap, a Z turning in the middle", () => {
    const d = erd([node("n1", 100, 100), node("n2", 600, 300)], [["n1", "n2"]]);
    expect(pathsOf(d).get("e1")!.pts).toEqual([[220, 130], [410, 130], [410, 330], [600, 330]]);
    const v = erd([node("n1", 100, 100), node("n2", 300, 600)], [["n1", "n2"]]);
    expect(pathsOf(v).get("e1")!.pts).toEqual([[160, 160], [160, 380], [360, 380], [360, 600]]);
  });
  it("starts and ends on a round or pointed border, not inside it", () => {
    const d: DiagramDoc = { kind: "erd", nodes: [node("n1", 100, 100, 160, 60, "attribute"), node("n2", 500, 300, 140, 80, "relationship")], edges: [] };
    const r = connect(d, "n1", "n2", "line", "ortho");
    const p = pathsOf(r.ok ? r.doc : d).get("e1")!;
    const [s, t] = [p.pts[0], p.pts.at(-1)!];
    // the ellipse: (x-180)²/80² + (y-130)²/30² = 1; the diamond: |x-570|/70 + |y-340|/40 = 1
    expect(((s[0] - 180) / 80) ** 2 + ((s[1] - 130) / 30) ** 2).toBeCloseTo(1, 5);
    expect(Math.abs(t[0] - 570) / 70 + Math.abs(t[1] - 340) / 40).toBeCloseTo(1, 5);
    expect(square(p)).toBe(true);
  });
  it("off the middle too: the run meets a round border where the curve is, not the box around it", () => {
    // facing: the run at the centres' mean height (140), 10 px under the ellipse's middle (130)
    const e = erdOne(node("n1", 100, 100, 160, 60, "attribute"), node("n2", 500, 110, 120, 80));
    expect(e[1]).toBe(140);
    expect(((e[0] - 180) / 80) ** 2 + ((e[1] - 130) / 30) ** 2).toBeCloseTo(1, 5);
    expect(e[0]).toBeLessThan(256);
    // the diamond: its middle at 440, the run at 450
    const m = erdOne(node("n1", 100, 400, 140, 80, "relationship"), node("n2", 500, 420, 120, 80));
    expect(m[1]).toBe(450);
    expect(Math.abs(m[0] - 170) / 70 + Math.abs(m[1] - 440) / 40).toBeCloseTo(1, 5);
  });
  it("two arrows leaving one side are spread along it, in the order of where they go (no run on top of another)", () => {
    const d = erd([node("n1", 100, 300), node("n2", 500, 100), node("n3", 500, 500)], [["n1", "n2"], ["n1", "n3"]]);
    const p = pathsOf(d);
    const [a, b] = [p.get("e1")!.pts[0], p.get("e2")!.pts[0]];
    expect(a[0]).toBe(220); expect(b[0]).toBe(220);
    expect(a[1]).toBeLessThan(b[1]);   // the one going up leaves higher
    expect(b[1] - a[1]).toBeGreaterThanOrEqual(16);
  });
  it("a generalisation into one parent is one trunk (the children's arrows meet the parent at one place)", () => {
    let d: DiagramDoc = { kind: "class", nodes: [node("n1", 300, 60, 160, 80, "class", "Person"), node("n2", 100, 400, 140, 80, "class", "Student"), node("n3", 520, 400, 140, 80, "class", "Teacher")], edges: [] };
    for (const c of ["n2", "n3"]) { const r = connect(d, c, "n1", "inherit", "ortho"); d = r.ok ? r.doc : d; }
    const p = pathsOf(d);
    expect(p.get("e1")!.pts.at(-1)).toEqual(p.get("e2")!.pts.at(-1));
    // an association into the same side takes its own place
    const r = connect(d, "n2", "n1", "assoc", "ortho");
    const q = pathsOf(r.ok ? r.doc : d);
    expect(q.get("e3")!.pts.at(-1)).not.toEqual(q.get("e1")!.pts.at(-1));
  });
  it("a Z that would cross a component takes a free shape instead", () => {
    // the Z from n1 to n2 turns at x 410 — right through n3 standing there
    const d = erd([node("n1", 100, 100), node("n2", 600, 300), node("n3", 360, 60, 100, 120)], [["n1", "n2"]]);
    const p = pathsOf(d).get("e1")!;
    expect(square(p)).toBe(true);
    expect(hits(p, d.nodes[2])).toBe(false);
    // without it the Z stays
    const free = erd([node("n1", 100, 100), node("n2", 600, 300)], [["n1", "n2"]]);
    expect(pathsOf(free).get("e1")!.pts).toHaveLength(4);
  });
  it("an arrow to itself is a squared loop over the corner; overlapping boxes fall back to a straight line", () => {
    const loop = erd([node("n1", 100, 100)], [["n1", "n1"]]);
    const p = pathsOf(loop).get("e1")!;
    expect(square(p)).toBe(true);
    expect(p.pts).toHaveLength(5);
    const over = erd([node("n1", 100, 100), node("n2", 150, 120)], [["n1", "n2"]]);
    expect(pathsOf(over).get("e1")!.pts).toHaveLength(2);
  });
  it("a sequence diagram keeps its level messages whatever an arrow says", () => {
    const seq = exampleDoc("sequence");
    const forced: DiagramDoc = { ...seq, edges: seq.edges.map(e => ({ ...e, route: "ortho" as const })) };
    expect([...pathsOf(forced).values()].map(p => p.d)).toEqual([...pathsOf(seq).values()].map(p => p.d));
  });
});

describe("several at once", () => {
  it("removeMany: the components with their arrows, and the arrows named; a sequence closes its gaps", () => {
    const ex = exampleDoc("dsd");
    const d = removeMany(ex, [ex.nodes[0].id], [ex.edges.at(-1)!.id]);
    expect(d.nodes).toHaveLength(ex.nodes.length - 1);
    expect(d.edges.every(e => e.from !== ex.nodes[0].id && e.to !== ex.nodes[0].id && e.id !== ex.edges.at(-1)!.id)).toBe(true);
    const seq = exampleDoc("sequence");
    const s = removeMany(seq, [], [seq.edges[0].id, seq.edges[2].id]);
    const ys = s.edges.map(e => e.y).sort((a, b) => a - b);
    expect(ys).toEqual(ys.map((_, i) => ys[0] + i * 46));
    expect(ys[0]).toBe(Math.min(...seq.edges.map(e => e.y)));
  });
  it("duplicateMany: a copy beside them, with the arrows between them (and only those), fresh ids, all valid", () => {
    const ex = allOrtho(exampleDoc("dsd"));
    const ids = ex.nodes.slice(0, 2).map(n => n.id);
    const r = duplicateMany(ex, ids);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes).toHaveLength(2);
    const inner = ex.edges.filter(e => ids.includes(e.from) && ids.includes(e.to));
    expect(r.edges).toHaveLength(inner.length);
    for (const id of r.edges!) { const e = r.doc.edges.find(x => x.id === id)!; expect(r.nodes).toContain(e.from); expect(r.nodes).toContain(e.to); expect(e.route).toBe("ortho"); }
    const copy = r.doc.nodes.find(n => n.id === r.nodes![0])!, orig = ex.nodes[0];
    expect([copy.x - orig.x, copy.y - orig.y]).toEqual([30, 30]);
    expect(parseDiagram(serializeDiagram(r.doc)).ok).toBe(true);
    // the limit
    let full = emptyDoc("erd");
    for (let i = 0; i < DIAGRAM_LIMITS.nodes - 1; i++) { const a = addNode(full, "entity", { x: 100 + (i % 20) * 100, y: 100 + Math.floor(i / 20) * 100 }); if (a.ok) full = a.doc; }
    expect(duplicateMany(full, full.nodes.slice(0, 2).map(n => n.id)).ok).toBe(false);
  });
  it("a sequence copies the lifelines beside the group, not their messages", () => {
    const seq = exampleDoc("sequence");
    const r = duplicateMany(seq, seq.nodes.map(n => n.id));
    expect(r.ok && r.edges).toEqual([]);
    if (!r.ok) return;
    // each copy at its original's height (a lifeline stands on the top line), the group moved sideways as one
    const steps = r.nodes!.map((id, i) => { const c = r.doc.nodes.find(n => n.id === id)!, o = seq.nodes[i]; return [c.x - o.x, c.y - o.y]; });
    expect(new Set(steps.map(s => s.join(","))).size).toBe(1);
    expect(steps[0][1]).toBe(0);
    expect(steps[0][0]).toBeGreaterThan(0);
    expect(parseDiagram(serializeDiagram(r.doc)).ok).toBe(true);
  });
  it("alignNodes: by the drawn boxes — tops, bottoms, right / left edges, centres; even spacing between the first and the last", () => {
    const d: DiagramDoc = { kind: "erd", nodes: [node("n1", 100, 100, 120, 60), node("n2", 300, 170, 160, 90), node("n3", 700, 140, 100, 40)], edges: [] };
    const sizes = new Map(d.nodes.map(n => [n.id, { w: n.w, h: n.h }]));
    const ids = d.nodes.map(n => n.id);
    const at = (doc: DiagramDoc) => doc.nodes.map(n => [n.x, n.y]);
    expect(at(alignNodes(d, ids, "top", sizes))).toEqual([[100, 100], [300, 100], [700, 100]]);
    expect(at(alignNodes(d, ids, "bottom", sizes))).toEqual([[100, 200], [300, 170], [700, 220]]);
    expect(at(alignNodes(d, ids, "middle", sizes)).map(p => p[1])).toEqual([150, 135, 160]);   // the middle line at 180
    expect(at(alignNodes(d, ids, "left", sizes)).map(p => p[0])).toEqual([100, 100, 100]);
    expect(at(alignNodes(d, ids, "right", sizes)).map(p => p[0])).toEqual([680, 640, 700]);
    expect(at(alignNodes(d, ids, "centerX", sizes)).map(p => p[0])).toEqual([390, 370, 400]);   // the middle at 450
    // spread: first and last stay, the gaps between are equal: (800 - 100 - 380) / 2 = 160
    expect(at(alignNodes(d, ids, "spreadX", sizes)).map(p => p[0])).toEqual([100, 380, 700]);
    expect(alignNodes(d, ids.slice(0, 2), "spreadX", sizes)).toBe(d);
    expect(alignNodes(d, ids.slice(0, 1), "top", sizes)).toBe(d);
  });
  it("alignNodes uses the size as drawn (a box grown by its text), and a lifeline keeps its height", () => {
    const d: DiagramDoc = { kind: "erd", nodes: [node("n1", 100, 100), node("n2", 400, 300)], edges: [] };
    const grown = new Map([["n1", { w: 120, h: 200 }], ["n2", { w: 120, h: 60 }]]);
    expect(alignNodes(d, ["n1", "n2"], "bottom", grown).nodes.map(n => n.y)).toEqual([160, 300]);
    const seq = exampleDoc("sequence");
    const s = alignNodes(seq, seq.nodes.map(n => n.id), "bottom", boxesOf(seq));
    expect(s.nodes.map(n => n.y)).toEqual(seq.nodes.map(n => n.y));
  });
  it("the selection helpers: one is a single selection, none is null; toggling adds and takes out; a rectangle takes what lies inside", () => {
    expect(makeSelection([], [])).toBeNull();
    expect(makeSelection(["n1"], [])).toEqual({ kind: "node", id: "n1" });
    expect(makeSelection([], ["e1"])).toEqual({ kind: "edge", id: "e1" });
    const many = makeSelection(["n1", "n2", "n1"], ["e1"]);
    expect(many).toEqual({ kind: "many", nodes: ["n1", "n2"], edges: ["e1"] });
    expect(toggleSelection(many, "node", "n2")).toEqual({ kind: "many", nodes: ["n1"], edges: ["e1"] });
    expect(toggleSelection({ kind: "node", id: "n1" }, "node", "n1")).toBeNull();
    expect(toggleSelection({ kind: "node", id: "n1" }, "edge", "e4")).toEqual({ kind: "many", nodes: ["n1"], edges: ["e4"] });
    expect([selectedNodes(null), selectedEdges({ kind: "node", id: "n1" })]).toEqual([[], []]);
    const d = erd([node("n1", 100, 100), node("n2", 400, 100), node("n3", 900, 100)], [["n1", "n2"], ["n2", "n3"]]);
    expect(inRect(d, boxesOf(d), { x0: 50, y0: 50, x1: 600, y1: 300 })).toEqual({ nodes: ["n1", "n2"], edges: ["e1"] });
    expect(inRect(d, boxesOf(d), { x0: 150, y0: 50, x1: 600, y1: 300 })).toEqual({ nodes: ["n2"], edges: [] });
  });
});

describe("«اكتب كنص»: skinparam linetype ortho", () => {
  it("draws every arrow with right angles; the writer says it when every arrow has them, and the text reads back the same", () => {
    const src = "@startuml\nskinparam linetype ortho\nclass Car\nDriver - Car : drives >\nCar *- Wheel\n@enduml";
    const r = readDiagramScript(src, "class");
    expect(r.doc.edges.map(routeOf)).toEqual(["ortho", "ortho"]);
    expect(readDiagramScript(src.replace("skinparam linetype ortho\n", ""), "class").doc.edges.map(routeOf)).toEqual(["straight", "straight"]);
    const text = diagramToScript(r.doc)!;
    expect(text.split("\n")[1]).toBe("skinparam linetype ortho");
    expect(readDiagramScript(text, "class").doc.edges.map(routeOf)).toEqual(["ortho", "ortho"]);
    // a mixed diagram is not «all ortho»
    expect(diagramToScript(setRoute(r.doc, [r.doc.edges[0].id], "straight"))).not.toContain("linetype");
    // a sequence never says it, and never takes it
    expect(diagramToScript(exampleDoc("sequence"))).not.toContain("linetype");
    expect(readDiagramScript("@startuml\nskinparam linetype ortho\nA -> B : hi\n@enduml", "sequence").doc.edges.every(e => !e.route)).toBe(true);
  });
  it("typing keeps the right angles the learner gave one arrow; in a diagram all with right angles the text decides", () => {
    const old = readDiagramScript("class A\nclass B\nclass C\nA --> B\nB --> C", "class").doc;
    const mixed = setRoute(old, [old.edges[0].id], "ortho");
    const next = keepPositions(readDiagramScript("class A\nclass B\nclass C\nA --> B\nB --> C\nA --> C", "class").doc, mixed);
    expect(next.edges.map(routeOf)).toEqual(["ortho", "straight", "straight"]);
    const all = allOrtho(old);
    expect(keepPositions(readDiagramScript("class A\nclass B\nclass C\nA --> B\nB --> C", "class").doc, all).edges.map(routeOf)).toEqual(["straight", "straight"]);
  });
});
