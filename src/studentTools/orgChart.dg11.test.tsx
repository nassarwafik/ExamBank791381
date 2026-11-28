// @vitest-environment happy-dom
// DG11 — «الهيكل التنظيمي» (docs/enterprise-diagram-editor-design.md §23): who reports to whom in a company.
//   • the kind: under «تحليل النظم»; a person (a picture from the icon library, a name, a position), a department; «يتبع لـ» lines;
//   • the example: valid, read back the same, no «افحص المخطط» finding, every line at right angles, each manager centred over his team,
//     the first of a team on the right (Arabic order);
//   • the lines: out of the middle of the manager's bottom, along one bar for all his team, into the middle of each one's top; upright
//     (never a slant) when they stand one over the other;
//   • «رتّب الشجرة»: levels, centring, the order drawn kept, several tops side by side, a loop of managers still placed, notes and icons
//     left where they are, a chart too wide for the page said so;
//   • «أضف تابعًا»: a new person under the chosen one, joined, to the left of his team, the tree arranged;
//   • «افحص المخطط»: two managers, a loop, two tops, a manager under his report, a person left alone — each named, and each corrected.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import { DIAGRAM_CATALOG, kindSpec } from "./diagramCatalog";
import { parseDiagram, serializeDiagram, type DEdge, type DiagramDoc, type DNode } from "./diagramDoc";
import { edgePath, layoutNode, type NodeBox } from "./diagramLayout";
import { exampleDoc } from "./diagramExamples";
import { checkDiagram } from "./diagramChecks";
import { addReport, orgTree, treeLayout } from "./orgChart";
import DiagramEditorTool from "./DiagramEditorTool";

afterEach(cleanup);
const person = (id: string, x: number, y: number, name = id, details = ""): DNode => ({ id, type: "person", x, y, w: 72, h: 90, text: { icon: "employee", name, details }, color: "none" });
const line = (id: string, from: string, to: string): DEdge => ({ id, type: "reports", from, to, label: "", fromLabel: "", toLabel: "", y: 0, route: "ortho" });
const org = (nodes: DNode[], edges: DEdge[]): DiagramDoc => ({ kind: "orgChart", nodes, edges });
const boxesOf = (d: DiagramDoc) => { const m = new Map<string, NodeBox>(); for (const n of d.nodes) m.set(n.id, layoutNode(d, n)!); return m; };
const sizesOf = (d: DiagramDoc) => new Map([...boxesOf(d)].map(([id, b]) => [id, { w: b.w, h: b.h }]));
const mid = (b: { x: number; w: number }) => b.x + b.w / 2;
const rules = (d: DiagramDoc) => checkDiagram(d).map(f => f.level + ":" + f.rule);
const overlap = (d: DiagramDoc) => { const b = [...boxesOf(d).values()]; return b.some((p, i) => b.some((q, j) => j > i && p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h)); };

describe("the kind and its example", () => {
  it("under «تحليل النظم», after DFD: a person, a department, and the shared note / icon / text; one line, «يتبع لـ», with no arrowheads", () => {
    const k = kindSpec("orgChart");
    expect(k.group).toBe("تحليل النظم");
    // DG12 added the building plan after it, at the owner's request
    expect(DIAGRAM_CATALOG.filter(c => c.group === "تحليل النظم").map(c => c.kind)).toEqual(["dfd", "orgChart", "floorPlan"]);
    expect(k.nodes.map(n => n.type + ":" + n.form)).toEqual(["person:icon", "unit:round", "note:note", "icon:icon", "text:text"]);
    expect(k.nodes[0].fields.map(f => f.label)).toEqual(["الاسم", "المنصب", "الصورة"]);
    expect(k.edges.map(e => [e.type, e.label, e.start, e.end])).toEqual([["reports", "يتبع لـ", "none", "none"]]);
  });
  it("the example: valid, read back the same, no finding, all lines at right angles, each manager centred over his team, first on the right", () => {
    const d = exampleDoc("orgChart");
    const r = parseDiagram(serializeDiagram(d));
    expect(r.ok && r.doc).toEqual(d);
    expect(checkDiagram(d)).toEqual([]);
    expect(overlap(d)).toBe(false);
    const b = boxesOf(d), name = (n: string) => d.nodes.find(x => x.text.name === n)!.id;
    for (const e of d.edges) {
      expect(e.route).toBe("ortho");
      const pts = edgePath(d, e, b)!.pts;
      expect(pts.every((q, i) => !i || q[0] === pts[i - 1][0] || q[1] === pts[i - 1][1]), e.id).toBe(true);
    }
    const { team } = orgTree(d);
    for (const [boss, t] of team) {
      const xs = t.map(id => mid(b.get(id)!));
      expect(Math.abs(mid(b.get(boss)!) - (Math.min(...xs) + Math.max(...xs)) / 2), boss).toBeLessThanOrEqual(1);
      for (const id of t) expect(b.get(id)!.y, id).toBeGreaterThan(b.get(boss)!.y + b.get(boss)!.h);
    }
    expect(b.get(name("أحمد ناصر"))!.x).toBeGreaterThan(b.get(name("ليلى حسن"))!.x);   // the first manager on the right
  });
});

describe("the lines", () => {
  it("one bar for the whole team: out of the middle of the manager's bottom, into the middle of each top; upright when aligned", () => {
    const d = org([person("n1", 300, 40, "المدير"), person("n2", 100, 220, "أ", "قسم"), person("n3", 300, 220, "ب"), person("n4", 500, 240, "ج", "منصب طويل في الشركة")],
      [line("e1", "n1", "n2"), line("e2", "n1", "n3"), line("e3", "n1", "n4")]);
    const b = boxesOf(d), p = (id: string) => edgePath(d, d.edges.find(e => e.id === id)!, b)!.pts;
    const boss = b.get("n1")!;
    for (const id of ["e1", "e2", "e3"]) expect(p(id)[0], id).toEqual([mid(boss), boss.y + boss.h]);
    expect(new Set(["e1", "e3"].map(id => p(id)[1][1])).size).toBe(1);   // the same bar, though «ج» stands lower
    expect(p("e1")[1][1]).toBe(boss.y + boss.h + 30);
    expect(p("e1").at(-1)).toEqual([mid(b.get("n2")!), b.get("n2")!.y]);
    expect(p("e2")).toHaveLength(2);   // straight down
    expect(p("e2")[0][0]).toBe(p("e2")[1][0]);
    const half = org([person("n1", 300, 40), { ...person("n2", 300, 220), x: 300.5 } as DNode], [line("e1", "n1", "n2")]);
    const hp = edgePath(half, half.edges[0], boxesOf(half))!.pts;
    expect(hp[0][0]).toBe(hp[1][0]);   // half a pixel off: still upright, never a slant
  });
});

describe("«رتّب الشجرة» and «أضف تابعًا»", () => {
  it("levels, each manager centred over his team, the order drawn kept; two tops side by side; notes left where they were", () => {
    const d = org([person("n1", 900, 600, "رأس 1"), person("n2", 50, 50, "أ"), person("n3", 700, 900, "ب"), person("n4", 1500, 100, "رأس 2"), person("n5", 1400, 700, "ج"),
      { id: "n6", type: "note", x: 1000, y: 1200, w: 110, h: 50, text: { name: "ملاحظة" }, color: "none" }],
    [line("e1", "n1", "n2"), line("e2", "n1", "n3"), line("e3", "n4", "n5")]);
    const r = treeLayout(d, sizesOf(d));
    expect(r.fits).toBe(true);
    const b = boxesOf(r.doc), y = (id: string) => b.get(id)!.y;
    expect(y("n1")).toBe(y("n4"));
    expect(y("n2")).toBe(y("n3"));
    expect(y("n2")).toBeGreaterThan(y("n1") + b.get("n1")!.h);
    expect(b.get("n2")!.x).toBeLessThan(b.get("n3")!.x);   // drawn left of «ب»: stays left
    expect(Math.abs(mid(b.get("n1")!) - (mid(b.get("n2")!) + mid(b.get("n3")!)) / 2)).toBeLessThanOrEqual(1);
    expect(b.get("n4")!.x).toBeGreaterThan(b.get("n3")!.x);   // the second tree beside the first
    expect(r.doc.nodes.find(n => n.id === "n6")).toEqual(d.nodes[5]);
    expect(overlap(r.doc)).toBe(false);
    expect(Math.min(...r.doc.nodes.map(n => n.x))).toBe(50);   // the chart stays where its top left was
  });
  it("a loop of managers is still placed (and named by «افحص المخطط»); a team too wide for the page is said so", () => {
    const loop = org([person("n1", 100, 100), person("n2", 300, 100), person("n3", 500, 100)], [line("e1", "n1", "n2"), line("e2", "n2", "n3"), line("e3", "n3", "n1")]);
    const r = treeLayout(loop, sizesOf(loop));
    expect(r.doc.nodes).toHaveLength(3);
    expect(overlap(r.doc)).toBe(false);
    // the leftmost is taken as the top, and the loop hangs under it, level under level
    const ly = (id: string) => r.doc.nodes.find(n => n.id === id)!.y;
    expect(ly("n1")).toBeLessThan(ly("n2"));
    expect(ly("n2")).toBeLessThan(ly("n3"));
    const wide = org([person("n0", 100, 40), ...Array.from({ length: 30 }, (_, i) => person("n" + (i + 1), 100 + i * 10, 300))], Array.from({ length: 30 }, (_, i) => line("e" + i, "n0", "n" + (i + 1))));
    expect(treeLayout(wide, sizesOf(wide)).fits).toBe(false);
  });
  it("«أضف تابعًا»: a person under the chosen one, joined at right angles, to the left of his team; the tree arranged", () => {
    let d = org([person("n1", 400, 40, "المدير")], []);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = addReport(d, "n1", sizesOf);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      d = r.doc; ids.push(r.id);
    }
    expect(d.edges.map(e => [e.type, e.from, e.to, e.route])).toEqual(ids.map(id => ["reports", "n1", id, "ortho"]));
    const b = boxesOf(d);
    // the first one added on the right, the last on the left
    expect(b.get(ids[0])!.x).toBeGreaterThan(b.get(ids[1])!.x);
    expect(b.get(ids[1])!.x).toBeGreaterThan(b.get(ids[2])!.x);
    expect(new Set(ids.map(id => b.get(id)!.y)).size).toBe(1);
    expect(d.nodes.find(n => n.id === ids[0])!.text).toEqual({ icon: "employee", name: "اسم الموظف" });
    expect(checkDiagram(d)).toEqual([]);
    // a cousin in the way (the team of the manager on the left, right beside): the new one still joins on the left of its own team
    let t = org([person("n1", 400, 40, "رأس"), person("n2", 200, 220, "أ"), person("n3", 600, 220, "ب"), person("n4", 200, 400, "أ1"), person("n5", 600, 400, "ب1")],
      [line("e1", "n1", "n2"), line("e2", "n1", "n3"), line("e3", "n2", "n4"), line("e4", "n3", "n5")]);
    t = treeLayout(t, sizesOf(t)).doc;
    const added = addReport(t, "n3", sizesOf);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const ab = boxesOf(added.doc);
    expect(ab.get(added.id)!.x).toBeLessThan(ab.get("n5")!.x);
    expect(ab.get(added.id)!.x).toBeGreaterThan(ab.get("n4")!.x);
    expect(overlap(added.doc)).toBe(false);
    // a tall note where the new one would go: the free spot is found stepping right and down, past the team — it is held on the left
    const n5 = t.nodes.find(n => n.id === "n5")!;
    const noted = { ...t, nodes: [...t.nodes, { id: "n9", type: "note", x: n5.x - 160, y: n5.y - 40, w: 320, h: 420, text: { name: "ملاحظة" }, color: "none" } as DNode] };
    const past = addReport(noted, "n3", sizesOf);
    expect(past.ok).toBe(true);
    if (!past.ok) return;
    const px = (id: string) => past.doc.nodes.find(n => n.id === id)!.x;
    expect(px(past.id)).toBeLessThan(px("n5"));
    expect(addReport({ ...d, nodes: [...d.nodes, { id: "n9", type: "note", x: 0, y: 0, w: 110, h: 50, text: { name: "x" }, color: "none" }] }, "n9", sizesOf).ok).toBe(false);
  });
});

describe("«افحص المخطط»", () => {
  const base = () => org([person("n1", 300, 40, "المدير"), person("n2", 150, 220, "أ"), person("n3", 450, 220, "ب")], [line("e1", "n1", "n2"), line("e2", "n1", "n3")]);
  it("each rule named, and gone when corrected", () => {
    expect(rules(base())).toEqual([]);
    const two = base(); two.nodes.push(person("n4", 300, 400, "ج")); two.edges.push(line("e3", "n2", "n4"), line("e4", "n3", "n4"));
    expect(rules(two)).toEqual(["warning:org.bosses"]);
    const loop = base(); loop.edges.push(line("e3", "n2", "n1"));
    expect(rules(loop)).toContain("error:org.cycle");
    const tops = base(); tops.nodes.push(person("n4", 800, 40, "رأس"), person("n5", 800, 220, "د")); tops.edges.push(line("e3", "n4", "n5"));
    expect(rules(tops)).toEqual(["warning:org.tops"]);
    const upside = base(); upside.nodes[0] = { ...upside.nodes[0], y: 400 };
    expect(rules(upside)).toEqual(["warning:org.upside", "warning:org.upside"]);
    expect(rules(treeLayout(upside, sizesOf(upside)).doc)).toEqual([]);   // «رتّب الشجرة» puts the manager back on top
    const alone = base(); alone.nodes.push(person("n4", 800, 400, "وحيد"));
    expect(rules(alone)).toEqual(["warning:node.isolated"]);
    const blank = base(); blank.nodes[1] = { ...blank.nodes[1], text: { icon: "employee", name: "" } };
    expect(rules(blank)).toEqual(["warning:name.missing"]);
  });
  it("an icon or a note joined to the chart is not a member: no second manager, no second top", () => {
    const d = base();
    d.nodes.push({ id: "n7", type: "icon", x: 700, y: 40, w: 72, h: 90, text: { icon: "company", name: "الشركة" }, color: "none" });
    d.edges.push(line("e7", "n7", "n2"));
    expect(rules(d)).toEqual([]);
  });
});

describe("the editor", () => {
  const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
  const click = async (el: HTMLElement) => { fireEvent.click(el); await tick(); };
  it("«رتّب الشجرة» in the org chart only; «أضف تابعًا» joins a new person at right angles; one «تراجع» takes it back", async () => {
    localStorage.clear();
    render(<DiagramEditorTool />);
    expect(screen.queryByTestId("diagram-tree")).toBeNull();
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "orgChart" } });
    await tick();
    expect((screen.getByTestId("diagram-tree") as HTMLButtonElement).disabled).toBe(true);
    // its lines have right angles from the first one
    expect(screen.getByTestId("diagram-route-ortho").getAttribute("aria-checked")).toBe("true");
    await click(screen.getByTestId("diagram-add-person"));
    expect((screen.getByTestId("diagram-tree") as HTMLButtonElement).disabled).toBe(false);
    await click(screen.getByTestId("diagram-add-report"));
    const canvas = screen.getByTestId("diagram-canvas") as unknown as SVGSVGElement;
    expect(canvas.querySelectorAll("[data-node]")).toHaveLength(2);
    expect(canvas.querySelectorAll("[data-edge]")).toHaveLength(1);
    expect(canvas.querySelector("[data-edge] path")!.getAttribute("d")).toMatch(/^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+( L[\d.]+,[\d.]+ L[\d.]+,[\d.]+)?$/);
    expect(screen.getByTestId("diagram-node-props")).toBeTruthy();   // the new one chosen, ready for its name
    await click(within(screen.getByTestId("diagram-editor")).getByRole("button", { name: /تراجع/ }));
    expect(canvas.querySelectorAll("[data-node]")).toHaveLength(1);
    expect(canvas.querySelectorAll("[data-edge]")).toHaveLength(0);
  });
});
