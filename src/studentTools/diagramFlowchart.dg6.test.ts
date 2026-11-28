// DG6 — «مخطط التدفّق» (docs/enterprise-diagram-editor-design.md §18): the flowchart of a program.
//   • the catalog: the taught symbols (start / end ovals, input / output, process, decision, predefined process, connector) and the arrow;
//   • the worked example: valid, read back the same, no «افحص المخطط» finding, drawn with right angles, «نعم» / «لا» out of the
//     decision's side corners and the outputs down into «انتهِ»;
//   • «افحص المخطط»: every rule twice — a flowchart that breaks it, and the same flowchart corrected;
//   • the shapes' borders (the oval's round ends, the parallelogram's slanted sides) and the routes a flowchart needs: one turn, and a
//     loop back that goes round the outside instead of through the steps, held whole by the saved picture.
import { describe, it, expect } from "vitest";
import { DIAGRAM_CATALOG, kindSpec } from "./diagramCatalog";
import { connect, parseDiagram, serializeDiagram, type DEdge, type DiagramDoc, type DNode } from "./diagramDoc";
import { contentBounds, edgePath, layoutNode, sidePoint, SLANT, type EdgePath, type NodeBox } from "./diagramLayout";
import { exampleDoc } from "./diagramExamples";
import { checkDiagram } from "./diagramChecks";

const boxesOf = (doc: DiagramDoc) => { const m = new Map<string, NodeBox>(); for (const n of doc.nodes) { const b = layoutNode(doc, n); if (b) m.set(n.id, b); } return m; };
const pathsOf = (doc: DiagramDoc) => { const b = boxesOf(doc), m = new Map<string, EdgePath>(); for (const e of doc.edges) { const p = edgePath(doc, e, b); if (p) m.set(e.id, p); } return m; };
const node = (id: string, type: string, x: number, y: number, name: string, w = 140, h = 46): DNode => ({ id, type, x, y, w, h, text: { name }, color: "none" });
const flow = (id: string, from: string, to: string, label = ""): DEdge => ({ id, type: "flow", from, to, label, fromLabel: "", toLabel: "", y: 0, route: "ortho" });
const rules = (d: DiagramDoc) => checkDiagram(d).map(f => f.level + ":" + f.rule);
/** start → input → decision (yes → output A, no → output B) → end */
const good = (): DiagramDoc => ({
  kind: "flowchart",
  nodes: [node("n1", "start", 330, 30, "ابدأ", 100, 44), node("n2", "io", 290, 110, "أدخل x", 180), node("n3", "decision", 310, 200, "x > 0 ؟", 140, 76),
    node("n4", "io", 90, 330, "اطبع موجب", 170), node("n5", "io", 500, 330, "اطبع سالب", 170), node("n6", "end", 330, 440, "انتهِ", 100, 44)],
  edges: [flow("e1", "n1", "n2"), flow("e2", "n2", "n3"), flow("e3", "n3", "n4", "نعم"), flow("e4", "n3", "n5", "لا"), flow("e5", "n4", "n6"), flow("e6", "n5", "n6")],
});

describe("the catalog", () => {
  it("the taught symbols, each with its own shape, and one arrow; grouped under «البرمجة»", () => {
    const k = kindSpec("flowchart");
    expect(k.group).toBe("البرمجة");
    expect(k.nodes.map(n => n.type + ":" + n.form)).toEqual(["start:terminal", "io:parallelogram", "process:rect", "decision:diamond", "subroutine:subroutine",
      "connector:ellipse", "end:terminal", "note:note", "icon:icon", "text:text"]);   // DG10: an icon and a free text, in every kind
    expect(k.nodes.map(n => n.defaults.name)).toEqual(["ابدأ", "أدخل a, b", "avg = (a + b) / 2", "avg >= 50 ؟", "Sort(list)", "A", "انتهِ", "ملاحظة", "موظف", "عنوان المخطط"]);
    expect(k.edges.map(e => e.type + ":" + e.end)).toEqual(["flow:arrow"]);
    expect(DIAGRAM_CATALOG.at(-1)!.kind).toBe("flowchart");
  });
});

describe("the worked example", () => {
  it("valid, read back the same, no finding; every arrow right-angled with level and upright runs only", () => {
    const ex = exampleDoc("flowchart");
    const back = parseDiagram(serializeDiagram(ex));
    expect(back.ok && back.doc).toEqual(ex);
    expect(checkDiagram(ex)).toEqual([]);
    expect(ex.edges.every(e => e.route === "ortho")).toBe(true);
    for (const p of pathsOf(ex).values()) expect(p.pts.every((q, k) => k === 0 || q[0] === p.pts[k - 1][0] || q[1] === p.pts[k - 1][1]), p.d).toBe(true);
  });
  it("«نعم» and «لا» leave the decision's side corners and turn down into the outputs; the outputs come down and into «انتهِ»'s sides", () => {
    const ex = exampleDoc("flowchart");
    const p = pathsOf(ex), b = boxesOf(ex);
    const dec = b.get("n4")!, yes = p.get("e4")!.pts, no = p.get("e5")!.pts;
    expect(yes[0]).toEqual([dec.x, dec.y + dec.h / 2]);                   // the left corner
    expect(no[0]).toEqual([dec.x + dec.w, dec.y + dec.h / 2]);            // the right corner
    expect(yes).toHaveLength(3); expect(no).toHaveLength(3);              // one turn
    const outA = b.get("n5")!, end = b.get("n7")!;
    expect(yes[2]).toEqual([outA.x + outA.w / 2, outA.y]);               // into the output's top, at its middle
    const down = p.get("e6")!.pts;
    expect(down[0]).toEqual([outA.x + outA.w / 2, outA.y + outA.h]);     // out of the output's bottom
    expect(down[2][1]).toBe(end.y + end.h / 2);                           // into «انتهِ»'s side
    // the answer stands beside the decision, on the first run
    expect(p.get("e4")!.mid.y).toBe(dec.y + dec.h / 2);
  });
});

describe("«افحص المخطط» for a flowchart", () => {
  it("the corrected flowchart has no finding", () => {
    expect(checkDiagram(good())).toEqual([]);
  });
  it("no start / no end", () => {
    const d = good();
    expect(rules({ ...d, nodes: d.nodes.filter(n => n.id !== "n1"), edges: d.edges.filter(e => e.from !== "n1") })).toContain("error:flow.noStart");
    expect(rules({ ...d, nodes: d.nodes.filter(n => n.id !== "n6"), edges: d.edges.filter(e => e.to !== "n6") })).toContain("error:flow.noEnd");
    const msg = checkDiagram({ ...d, nodes: d.nodes.filter(n => n.id !== "n1"), edges: d.edges.filter(e => e.from !== "n1") }).find(f => f.rule === "flow.noStart")!.message;
    expect(msg).toMatch(/«ابدأ»/);
  });
  it("a decision with one way out is an error; with three, a warning; an exit without «نعم» / «لا» is named", () => {
    const d = good();
    const one = { ...d, edges: d.edges.filter(e => e.id !== "e4") };
    expect(rules(one)).toContain("error:fc.decision");
    const three: DiagramDoc = { ...d, nodes: [...d.nodes, node("n7", "process", 700, 200, "y = 0")], edges: [...d.edges, flow("e7", "n3", "n7", "صفر"), flow("e8", "n7", "n6")] };
    expect(rules(three)).toContain("warning:fc.decisionMany");
    const bare = { ...d, edges: d.edges.map(e => (e.id === "e4" ? { ...e, label: " " } : e)) };
    const f = checkDiagram(bare).find(x => x.rule === "fc.answer")!;
    expect(f.level).toBe("warning");
    expect(f.edges).toEqual(["e4"]);
  });
  it("a process, an input / output or a predefined process with two ways out is an error (a branch is a decision's job)", () => {
    for (const type of ["process", "io", "subroutine"]) {
      const d: DiagramDoc = {
        kind: "flowchart",
        nodes: [node("n1", "start", 300, 20, "ابدأ", 100, 44), node("n2", type, 280, 100, "x = 1"), node("n3", "end", 100, 220, "انتهِ", 100, 44), node("n4", "end", 450, 220, "انتهِ", 100, 44)],
        edges: [flow("e1", "n1", "n2"), flow("e2", "n2", "n3"), flow("e3", "n2", "n4")],
      };
      expect(rules(d), type).toContain("error:fc.oneOut");
      expect(rules({ ...d, nodes: d.nodes.slice(0, 3), edges: d.edges.slice(0, 2) }), type).not.toContain("error:fc.oneOut");
    }
  });
  it("an empty step, a lone step, a step no arrow leaves, a step the start does not reach; nothing into the start, nothing out of the end", () => {
    const d = good();
    expect(rules({ ...d, nodes: d.nodes.map(n => (n.id === "n2" ? { ...n, text: { name: "" } } : n)) })).toContain("warning:name.missing");
    expect(rules({ ...d, nodes: [...d.nodes, node("n9", "process", 800, 500, "z = 2")] })).toContain("warning:node.isolated");
    expect(rules({ ...d, edges: d.edges.filter(e => e.id !== "e5") })).toContain("warning:flow.deadEnd");
    expect(rules({ ...d, edges: d.edges.filter(e => e.id !== "e2") })).toContain("warning:flow.unreached");
    expect(rules({ ...d, edges: [...d.edges, flow("e9", "n2", "n1")] })).toContain("error:flow.intoStart");
    expect(rules({ ...d, edges: [...d.edges, flow("e9", "n6", "n2")] })).toContain("error:flow.fromEnd");
  });
});

describe("shapes and routes", () => {
  it("the oval's round ends and the parallelogram's slanted sides are met where they are", () => {
    const d: DiagramDoc = { kind: "flowchart", nodes: [node("n1", "start", 100, 100, "ابدأ", 120, 40), node("n2", "io", 100, 300, "أدخل x", 160, 50)], edges: [] };
    const b = boxesOf(d);
    const t = b.get("n1")!, p = b.get("n2")!;
    // the oval: r = half its drawn height; at its middle height the end is the box's edge, 10 px up it is r − √(r² − 10²) in
    const r = t.h / 2;
    expect(sidePoint(t, "left", t.y + r).x).toBeCloseTo(t.x, 6);
    expect(sidePoint(t, "right", t.y + r - 10).x).toBeCloseTo(t.x + t.w - (r - Math.sqrt(r * r - 100)), 6);
    expect(sidePoint(t, "right", t.y + r - 10).x).toBeLessThan(t.x + t.w - 1);
    // the parallelogram: the left side leans in at the top, the right side at the bottom
    expect(sidePoint(p, "left", p.y).x).toBe(p.x + SLANT);
    expect(sidePoint(p, "left", p.y + p.h).x).toBe(p.x);
    expect(sidePoint(p, "right", p.y).x).toBe(p.x + p.w);
    expect(sidePoint(p, "right", p.y + p.h).x).toBe(p.x + p.w - SLANT);
    expect(sidePoint(p, "left", p.y + p.h / 2).x).toBe(p.x + SLANT / 2);
  });
  it("a box grows with its text, keeping room for the oval's ends, the slant and the inner bars", () => {
    const long = "اطبع رسالة طويلة جدًا";
    for (const [type, form] of [["start", "terminal"], ["io", "parallelogram"], ["subroutine", "subroutine"], ["process", "rect"]]) {
      const b = layoutNode({ kind: "flowchart", nodes: [], edges: [] }, node("n1", type, 0, 0, long, 40, 40))!;
      expect(b.form).toBe(form);
      expect(b.w, type).toBeGreaterThan(form === "rect" ? 60 : 80);
    }
    const w = (type: string) => layoutNode({ kind: "flowchart", nodes: [], edges: [] }, node("n1", type, 0, 0, long, 40, 40))!.w;
    expect(w("io") - w("process")).toBe(2 * SLANT);
  });
  it("a loop back goes round the outside, not through the steps between; the saved picture holds it", () => {
    // decision ← i = i + 1, with «sum = sum + i» between them on the same line
    const d: DiagramDoc = {
      kind: "flowchart",
      nodes: [node("n1", "decision", 320, 100, "i <= n ؟", 120, 76), node("n2", "process", 310, 230, "sum = sum + i"), node("n3", "process", 310, 320, "i = i + 1")],
      edges: [flow("e1", "n1", "n2", "نعم"), flow("e2", "n2", "n3"), flow("e3", "n3", "n1")],
    };
    const p = pathsOf(d), b = boxesOf(d);
    const back = p.get("e3")!.pts, mid = b.get("n2")!;
    const crosses = back.some((q, k) => k > 0 && q[0] === back[k - 1][0] && q[0] > mid.x && q[0] < mid.x + mid.w && Math.min(q[1], back[k - 1][1]) < mid.y + mid.h && Math.max(q[1], back[k - 1][1]) > mid.y);
    expect(crosses).toBe(false);
    expect(back).toHaveLength(4);
    expect(back.at(-1)).toEqual([b.get("n1")!.x, b.get("n1")!.y + 38]);   // into the decision's side corner
    // the arrow into «i = i + 1» comes down the middle (the loop leaving its side does not push it aside)
    expect(p.get("e2")!.pts.at(-1)).toEqual([b.get("n3")!.x + b.get("n3")!.w / 2, b.get("n3")!.y]);
    const area = contentBounds(d, b, 0)!;
    expect(area.x).toBeLessThanOrEqual(Math.min(...back.map(q => q[0])));
  });
  it("arrows meeting one side of a decision are not spread along it: each leaves where it would alone", () => {
    // two outputs right under a wide decision: both ways out leave its bottom side
    const nodes = [node("n1", "decision", 300, 100, "x > 0 ؟", 200, 80), node("n2", "io", 250, 300, "اطبع أ", 120), node("n3", "io", 430, 300, "اطبع ب", 120)];
    const both: DiagramDoc = { kind: "flowchart", nodes, edges: [flow("e1", "n1", "n2", "نعم"), flow("e2", "n1", "n3", "لا")] };
    const alone = (id: string): DiagramDoc => ({ ...both, edges: both.edges.filter(e => e.id === id) });
    for (const id of ["e1", "e2"]) {
      const start = pathsOf(both).get(id)!.pts[0];
      expect(start[1]).toBeGreaterThan(140);   // out of the bottom half (the decision's middle is at 140)
      expect(start, id).toEqual(pathsOf(alone(id)).get(id)!.pts[0]);
    }
  });
  it("connect draws a flowchart arrow; its text is the answer after a decision", () => {
    const r = connect(good(), "n3", "n6", "flow", "ortho");
    expect(r.ok && r.doc.edges.at(-1)).toMatchObject({ type: "flow", label: "", route: "ortho" });
  });
});
