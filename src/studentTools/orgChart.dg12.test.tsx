// @vitest-environment happy-dom
// DG12 — the organisation chart's assistant and dotted lines (docs/enterprise-diagram-editor-design.md §24.5), as in the owner's picture:
//   • «يتبع لـ (منقّط بسهم)»: the same reporting line, dotted, with an arrowhead — in the tree, the checks and «أضف تابعًا» alike;
//   • «مساعد / مستشار»: an assistant beside his manager, on his level, joined by one level line; «رتّب الشجرة» puts him on the
//     manager's left with the manager still centred over his team, and makes room so nothing overlaps;
//   • «أضف مساعدًا بجانبه», «خطوط منقّطة» in the editor; the checks: an assistant who also reports, one drawn over or under his manager.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import { parseDiagram, serializeDiagram, type DEdge, type DiagramDoc, type DNode } from "./diagramDoc";
import { edgePath, layoutNode, type NodeBox } from "./diagramLayout";
import { exampleDoc } from "./diagramExamples";
import { checkDiagram } from "./diagramChecks";
import { addAssistant, addReport, orgTree, reportStyle, treeLayout } from "./orgChart";
import DiagramEditorTool from "./DiagramEditorTool";

afterEach(cleanup);
const person = (id: string, x: number, y: number, name = id): DNode => ({ id, type: "person", x, y, w: 72, h: 90, text: { icon: "employee", name }, color: "none" });
const line = (id: string, from: string, to: string, type = "reports"): DEdge => ({ id, type, from, to, label: "", fromLabel: "", toLabel: "", y: 0, route: "ortho" });
const org = (nodes: DNode[], edges: DEdge[]): DiagramDoc => ({ kind: "orgChart", nodes, edges });
const boxesOf = (d: DiagramDoc) => { const m = new Map<string, NodeBox>(); for (const n of d.nodes) m.set(n.id, layoutNode(d, n)!); return m; };
const sizesOf = (d: DiagramDoc) => new Map([...boxesOf(d)].map(([id, b]) => [id, { w: b.w, h: b.h }]));
const mid = (b: { x: number; w: number }) => b.x + b.w / 2;
const rules = (d: DiagramDoc) => checkDiagram(d).map(f => f.level + ":" + f.rule);
const overlap = (d: DiagramDoc) => { const b = [...boxesOf(d).values()]; return b.some((p, i) => b.some((q, j) => j > i && p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h)); };
const arranged = (d: DiagramDoc) => treeLayout(d, sizesOf(d)).doc;

describe("the example", () => {
  it("the general manager's secretary beside him, on his left and his level, one level dotted line; still no finding, no overlap, manager centred", () => {
    const d = exampleDoc("orgChart");
    expect(parseDiagram(serializeDiagram(d)).ok).toBe(true);
    expect(checkDiagram(d)).toEqual([]);
    expect(overlap(d)).toBe(false);
    const b = boxesOf(d), byName = (n: string) => b.get(d.nodes.find(x => x.text.name === n)!.id)!;
    const boss = byName("سامي خليل"), aide = byName("هدى سالم");
    expect(aide.x + aide.w).toBeLessThan(boss.x);
    expect(aide.y).toBe(boss.y);   // top to top: the pictures side by side
    const e = d.edges.find(x => x.type === "assists")!;
    const pts = edgePath(d, e, b)!.pts;
    expect(pts).toHaveLength(2);
    expect(pts[0][1]).toBe(pts[1][1]);
    // between the two pictures (56 px each, 6 px clear of them), at the picture's middle height
    expect(pts[0][0]).toBe(mid(boss) - 28 - 6);
    expect(pts[1][0]).toBe(mid(aide) + 28 + 6);
    expect(pts[0][1]).toBe(aide.y + 4 + 28);
  });
});

describe("«رتّب الشجرة» with assistants", () => {
  it("not a top of its own: the assistant goes beside his manager, the manager stays centred over his team", () => {
    const d = arranged(org([person("a", 300, 40), person("b", 100, 200), person("c", 500, 200), person("s", 900, 600)],
      [line("e1", "a", "b"), line("e2", "a", "c"), line("e3", "a", "s", "assists")]));
    const b = boxesOf(d);
    expect(orgTree(d).aideOf.get("s")).toBe("a");
    expect(b.get("s")!.y).toBe(b.get("a")!.y);
    expect(b.get("s")!.x + b.get("s")!.w).toBeLessThan(b.get("a")!.x);
    expect(Math.abs(mid(b.get("a")!) - (mid(b.get("b")!) + mid(b.get("c")!)) / 2)).toBeLessThanOrEqual(1);
    expect(overlap(d)).toBe(false);
  });
  it("a manager's assistant never lands on his neighbour's team, even when his team's middle is off to one side", () => {
    // «a»'s last member has a wide team of his own, so the middle of «a»'s team (and «a») is left of his span's middle; «x», his
    // colleague, sits on his left: «a»'s two assistants need room made for them there
    const nodes = [person("top", 600, 40), person("x", 100, 200), person("a", 500, 200), person("a1", 400, 360), person("a2", 600, 360), person("a3", 800, 360),
      person("w", 300, 520), person("w2", 400, 520), person("w3", 500, 520), person("s1", 700, 900), person("s2", 800, 900)];
    const edges = [line("e1", "top", "x"), line("e2", "top", "a"), line("e3", "a", "a1"), line("e4", "a", "a2"), line("e5", "a", "a3"), line("e6", "a3", "w"),
      line("e7", "a3", "w2"), line("e8", "a3", "w3"), line("e9", "a", "s1", "assists"), line("e10", "a", "s2", "assists")];
    const d = arranged(org(nodes, edges));
    const b = boxesOf(d);
    expect(overlap(d)).toBe(false);
    expect(Math.abs(mid(b.get("a")!) - (mid(b.get("a1")!) + mid(b.get("a3")!)) / 2)).toBeLessThanOrEqual(1);
    expect(b.get("s2")!.x + b.get("s2")!.w).toBeLessThan(b.get("s1")!.x);
    expect(b.get("s1")!.x + b.get("s1")!.w).toBeLessThan(b.get("a")!.x);
    expect(b.get("s2")!.x).toBeGreaterThan(b.get("x")!.x + b.get("x")!.w);   // clear of his colleague
  });
  it("one who also reports to a manager, or has a team, keeps his place in the tree", () => {
    const d = org([person("a", 300, 40), person("b", 300, 200), person("c", 300, 360)], [line("e1", "a", "b"), line("e2", "a", "b", "assists"), line("e3", "b", "c")]);
    expect(orgTree(d).aideOf.size).toBe(0);
  });
});

describe("the dotted line", () => {
  it("the same reporting line: in the tree, the right angles of its path, and the checks", () => {
    const d = arranged(org([person("a", 300, 40), person("b", 100, 200), person("c", 500, 200)], [line("e1", "a", "b", "reportsDotted"), line("e2", "a", "c", "reportsDotted")]));
    expect(orgTree(d).team.get("a")).toEqual(["b", "c"]);
    const b = boxesOf(d);
    for (const e of d.edges) { const pts = edgePath(d, e, b)!.pts; expect(pts.every((q, i) => !i || q[0] === pts[i - 1][0] || q[1] === pts[i - 1][1])).toBe(true); }
    expect(checkDiagram(d)).toEqual([]);
    expect(rules(org([person("a", 0, 0), person("b", 300, 0), person("c", 150, 200)], [line("e1", "a", "c", "reportsDotted"), line("e2", "b", "c")]))).toContain("warning:org.bosses");
  });
  it("«أضف تابعًا» draws the line the chart already draws: dotted in a dotted chart, solid otherwise", () => {
    const dotted = org([person("a", 300, 40), person("b", 300, 200)], [line("e1", "a", "b", "reportsDotted")]);
    expect(reportStyle(dotted)).toBe("reportsDotted");
    const r = addReport(dotted, "a", sizesOf);
    expect(r.ok && r.doc.edges.map(e => e.type)).toEqual(["reportsDotted", "reportsDotted"]);
    const solid = addReport(org([person("a", 300, 40)], []), "a", sizesOf);
    expect(solid.ok && solid.doc.edges.map(e => e.type)).toEqual(["reports"]);
  });
});

describe("«أضف مساعدًا» and the checks", () => {
  it("a new person beside the manager, joined by «مساعد / مستشار», with «مساعد» as his position; refused for an assistant or a note", () => {
    const r = addAssistant(org([person("a", 300, 40), person("b", 300, 200)], [line("e1", "a", "b")]), "a", sizesOf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const n = r.doc.nodes.find(x => x.id === r.id)!, b = boxesOf(r.doc);
    expect(n.text.details).toBe("مساعد");
    expect(r.doc.edges.at(-1)).toMatchObject({ type: "assists", from: "a", to: r.id });
    expect(b.get(r.id)!.y).toBe(b.get("a")!.y);
    expect(checkDiagram(r.doc)).toEqual([]);
    expect(addAssistant(r.doc, r.id, sizesOf).ok).toBe(false);
    expect(addAssistant({ ...r.doc, nodes: [...r.doc.nodes, { id: "n9", type: "note", x: 0, y: 0, w: 110, h: 50, text: { name: "x" }, color: "none" }] }, "n9", sizesOf).ok).toBe(false);
  });
  it("an assistant who also reports to a manager; one drawn under his manager — each named, and corrected by «رتّب الشجرة»", () => {
    expect(rules(org([person("a", 300, 40), person("b", 100, 40)], [line("e1", "a", "b"), line("e2", "a", "b", "assists")]))).toContain("warning:org.assist");
    const under = org([person("a", 300, 40), person("s", 300, 300)], [line("e1", "a", "s", "assists")]);
    expect(rules(under)).toEqual(["warning:org.assistSide"]);
    expect(rules(arranged(under))).toEqual([]);
  });
});

describe("the editor", () => {
  const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
  const click = async (el: HTMLElement) => { fireEvent.click(el); await tick(); };
  it("«خطوط منقّطة» turns every reporting line dotted and back, and is one «تراجع»", async () => {
    localStorage.clear();
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "orgChart" } });
    await tick();
    expect((screen.getByTestId("diagram-dotted") as HTMLButtonElement).disabled).toBe(true);
    await click(screen.getByTestId("diagram-add-person"));
    const boss = screen.getByTestId("diagram-node-props");
    await click(within(boss).getByTestId("diagram-add-report"));
    const canvas = screen.getByTestId("diagram-canvas") as unknown as SVGSVGElement;
    await click(screen.getByTestId("diagram-dotted"));
    expect(screen.getByTestId("diagram-dotted").getAttribute("aria-pressed")).toBe("true");
    expect(canvas.querySelector("[data-edge] path")!.getAttribute("stroke-dasharray")).toBe("2 5");
    await click(screen.getByTestId("diagram-dotted"));
    expect(canvas.querySelector("[data-edge] path")!.getAttribute("stroke-dasharray")).toBeNull();
    await click(screen.getByTestId("diagram-dotted"));
    await click(within(screen.getByTestId("diagram-editor")).getByRole("button", { name: /تراجع/ }));
    expect(canvas.querySelector("[data-edge] path")!.getAttribute("stroke-dasharray")).toBeNull();
    expect(canvas.querySelectorAll("[data-node]")).toHaveLength(2);
  });
  it("«أضف مساعدًا بجانبه» from the chosen person's properties", async () => {
    localStorage.clear();
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "orgChart" } });
    await tick();
    await click(screen.getByTestId("diagram-add-person"));
    await click(screen.getByTestId("diagram-add-assistant"));
    const canvas = screen.getByTestId("diagram-canvas") as unknown as SVGSVGElement;
    expect(canvas.querySelectorAll("[data-node]")).toHaveLength(2);
    expect(canvas.querySelectorAll("[data-edge]")).toHaveLength(1);
    expect(canvas.querySelector("[data-edge] path")!.getAttribute("d")).toMatch(/^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/);
    // the new one chosen, its position «مساعد», ready for its name
    expect([...screen.getByTestId("diagram-node-props").querySelectorAll("input")].map(i => i.value)).toContain("مساعد");
    await click(within(screen.getByTestId("diagram-editor")).getByRole("button", { name: /تراجع/ }));
    expect(canvas.querySelectorAll("[data-node]")).toHaveLength(1);
  });
});
