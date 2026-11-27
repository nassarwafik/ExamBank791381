// DG1 — «محرّر المخططات», the pure core (docs/enterprise-diagram-editor-design.md):
//   • the catalog: eleven kinds (the seven UML diagrams, ERD, DSD, DFD, topology), each with components and arrows, fields that exist;
//   • every worked example is a valid diagram, and a file of it reads back to the same diagram;
//   • the operations: a new component on a free spot (a container under everything), moving on the grid and inside the page, a sequence
//     diagram's lifelines on one line and its messages in order, removing a component removes its arrows, undo / redo;
//   • the strict reader refuses a broken, foreign, oversized or over-long file, and an arrow that names a missing component;
//   • the contract: `{ id: "diagramEditor" }` and nothing else.
import { describe, it, expect } from "vitest";
import { DIAGRAM_CATALOG, DIAGRAM_KINDS, kindSpec, nodeSpec } from "./diagramCatalog";
import {
  DIAGRAM_LIMITS, SEQ_FIRST, SEQ_STEP, SEQ_TOP, addNode, cleanText, commit, connect, emptyDoc, insideOf, moveMessage, moveNode, moveNodesBy, parseDiagram, parseDraft,
  preview, redo, removeEdge, removeNode, resizeNode, reverseEdge, serializeDiagram, serializeDraft, setEdge, setText, startHistory, undo, type DiagramDoc,
} from "./diagramDoc";
import { exampleDoc } from "./diagramExamples";
import { contentBounds, edgeAt, edgePath, layoutNode, nodeAt, textDir, wrapText, type EdgePath, type NodeBox } from "./diagramLayout";
import { validateStudentTools, defaultStudentToolConfig } from "./studentToolsSpec";

const ok = <T extends { ok: boolean }>(r: T) => { expect(r.ok, JSON.stringify(r)).toBe(true); return r as Extract<T, { ok: true }>; };
const added = (doc: DiagramDoc, type: string, x = 300, y = 300) => { const r = ok(addNode(doc, type, { x, y })); return { doc: r.doc, id: (r as { id: string }).id }; };
const boxesOf = (doc: DiagramDoc) => new Map(doc.nodes.map(n => [n.id, layoutNode(doc, n)!] as [string, NodeBox]));

describe("the catalog", () => {
  it("eleven kinds: the seven UML diagrams, ERD, DSD, DFD and the topology, each with components and arrows", () => {
    expect([...DIAGRAM_KINDS]).toEqual(["useCase", "class", "sequence", "activity", "state", "object", "deployment", "erd", "dsd", "dfd", "topology"]);
    expect(DIAGRAM_CATALOG.filter(k => k.group === "UML").map(k => k.kind)).toEqual(["useCase", "class", "sequence", "activity", "state", "object", "deployment"]);
    for (const k of DIAGRAM_CATALOG) {
      expect(k.nodes.length, k.kind).toBeGreaterThan(0);
      expect(k.edges.length, k.kind).toBeGreaterThan(0);
      expect(new Set(k.nodes.map(n => n.type)).size, k.kind).toBe(k.nodes.length);
      expect(new Set(k.edges.map(e => e.type)).size, k.kind).toBe(k.edges.length);
      for (const n of k.nodes) {
        expect(new Set(n.fields.map(f => f.key)).size, n.type).toBe(n.fields.length);
        for (const key of Object.keys(n.defaults)) expect(n.fields.some(f => f.key === key), k.kind + "/" + n.type + "." + key).toBe(true);
        if (n.form === "device") expect(n.icon, n.type).toBeTruthy();
      }
    }
  });
});

describe("the worked examples", () => {
  it.each([...DIAGRAM_KINDS])("%s: a valid diagram, written to a file and read back unchanged", kind => {
    const doc = exampleDoc(kind);
    expect(doc.kind).toBe(kind);
    expect(doc.nodes.length).toBeGreaterThan(1);
    expect(doc.edges.length).toBeGreaterThan(0);
    const back = ok(parseDiagram(serializeDiagram(doc)));
    expect(back.doc).toEqual(doc);
    // every component is drawn inside the page, and every arrow has a path
    const boxes = boxesOf(doc);
    for (const b of boxes.values()) { expect(b.x + b.w).toBeLessThanOrEqual(DIAGRAM_LIMITS.canvasW); expect(b.y + b.h).toBeLessThanOrEqual(DIAGRAM_LIMITS.canvasH); }
    for (const e of doc.edges) expect(edgePath(doc, e, boxes), e.id).not.toBeNull();
    expect(contentBounds(doc, boxes)).not.toBeNull();
  });
});

describe("components", () => {
  it("a new component lands on a free spot near the view's centre, snapped to the grid; a container goes under everything", () => {
    let { doc, id: a } = added(emptyDoc("class"), "class", 305, 305);
    const first = doc.nodes[0];
    expect([first.x % 10, first.y % 10]).toEqual([0, 0]);
    const second = added(doc, "class", 305, 305);
    doc = second.doc;
    const [n1, n2] = [doc.nodes.find(n => n.id === a)!, doc.nodes.find(n => n.id === second.id)!];
    expect(n1.x !== n2.x || n1.y !== n2.y).toBe(true);
    expect(n1.text).toEqual(nodeSpec("class", "class")!.defaults);
    const sys = added(emptyDoc("useCase"), "usecase").doc;
    const withBox = added(sys, "system");
    expect(withBox.doc.nodes[0].id).toBe(withBox.id);   // drawn first = under
  });
  it("a component of another kind is refused; so is one past the limit", () => {
    expect(addNode(emptyDoc("dsd"), "class", { x: 0, y: 0 }).ok).toBe(false);
    let doc = emptyDoc("dsd");
    for (let i = 0; i < DIAGRAM_LIMITS.nodes; i++) doc = added(doc, "table", 100 + (i % 10) * 200, 100 + Math.floor(i / 10) * 90).doc;
    const r = addNode(doc, "table", { x: 100, y: 100 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/150/);
  });
  it("moving snaps to the grid and stays on the page; a container takes what it holds", () => {
    let { doc, id } = added(emptyDoc("useCase"), "usecase", 400, 300);
    doc = moveNode(doc, id, 123, 456);
    expect(doc.nodes[0]).toMatchObject({ x: 120, y: 460 });
    doc = moveNode(doc, id, -500, 99999);
    expect(doc.nodes[0].x).toBe(0);
    expect(doc.nodes[0].y).toBe(DIAGRAM_LIMITS.canvasH - doc.nodes[0].h);
    let u = added(emptyDoc("useCase"), "system", 400, 400);
    const sysId = u.id;
    u = added(u.doc, "usecase", 400, 400);
    expect(insideOf(u.doc, sysId)).toEqual([u.id]);
    const moved = moveNodesBy(u.doc, [sysId, ...insideOf(u.doc, sysId)], 100, 50);
    const before = u.doc.nodes.find(n => n.id === u.id)!, after = moved.nodes.find(n => n.id === u.id)!;
    expect([after.x - before.x, after.y - before.y]).toEqual([100, 50]);
  });
  it("only a container is resized, never below its smallest size", () => {
    const { doc, id } = added(emptyDoc("useCase"), "system");
    const r = resizeNode(doc, id, 10, 10).nodes[0];
    expect([r.w, r.h]).toEqual([nodeSpec("useCase", "system")!.minW, nodeSpec("useCase", "system")!.minH]);
    expect(resizeNode(doc, id, 500, 600).nodes[0]).toMatchObject({ w: 500, h: 600 });
    const uc = added(emptyDoc("useCase"), "usecase");
    expect(resizeNode(uc.doc, uc.id, 500, 500)).toBe(uc.doc);
  });
  it("a text is cleaned and bounded; a field the component has not is ignored", () => {
    expect(cleanText("a\u0007b\r\nc", true)).toBe("ab\nc");
    expect(cleanText("a\nb", false)).toBe("a b");
    expect(cleanText("x".repeat(500), false)).toHaveLength(DIAGRAM_LIMITS.text);
    const { doc, id } = added(emptyDoc("class"), "class");
    expect(setText(doc, id, "attrs", "- a : int\n- b : int").nodes[0].text.attrs).toBe("- a : int\n- b : int");
    expect(setText(doc, id, "nope", "x")).toBe(doc);
  });
  it("removing a component removes every arrow that touches it", () => {
    let doc = exampleDoc("dsd");
    const students = doc.nodes.find(n => n.text.name === "Students")!.id;
    const touching = doc.edges.filter(e => e.from === students || e.to === students).length;
    expect(touching).toBe(2);
    doc = removeNode(doc, students);
    expect(doc.edges.some(e => e.from === students || e.to === students)).toBe(false);
    expect(doc.edges).toHaveLength(1);
  });
});

describe("arrows", () => {
  it("an arrow of the kind joins two components and takes its defaults; one of another kind is refused", () => {
    let a = added(emptyDoc("dsd"), "table", 200, 200);
    const b = added(a.doc, "table", 600, 200);
    a = { doc: b.doc, id: a.id };
    const e = ok(connect(a.doc, a.id, b.id, "oneMany"));
    expect(e.doc.edges[0]).toMatchObject({ from: a.id, to: b.id, fromLabel: "1", toLabel: "∞", y: 0 });
    expect(connect(a.doc, a.id, b.id, "inherit").ok).toBe(false);
    expect(connect(a.doc, a.id, "n99", "oneMany").ok).toBe(false);
  });
  it("changing the arrow's type keeps what the learner wrote, and follows the new defaults otherwise; reversing swaps the ends", () => {
    let { doc, id: a } = added(emptyDoc("dsd"), "table", 200, 200);
    const b = added(doc, "table", 600, 200); doc = b.doc;
    doc = ok(connect(doc, a, b.id, "oneMany")).doc;
    const e = doc.edges[0].id;
    expect(setEdge(doc, e, { type: "oneOne" }).edges[0]).toMatchObject({ fromLabel: "1", toLabel: "1" });
    doc = setEdge(doc, e, { fromLabel: "0..1" });
    expect(setEdge(doc, e, { type: "oneOne" }).edges[0]).toMatchObject({ fromLabel: "0..1", toLabel: "1" });
    expect(reverseEdge(doc, e).edges[0]).toMatchObject({ from: b.id, to: a, fromLabel: "∞", toLabel: "0..1" });
  });
  it("a sequence diagram: lifelines on one line, messages one under another, a removed message closes the gap, up / down swap", () => {
    let doc = emptyDoc("sequence");
    const ids: string[] = [];
    for (const x of [100, 300, 500]) { const r = added(doc, "lifeline", x, 600); doc = r.doc; ids.push(r.id); }
    expect(doc.nodes.every(n => n.y === SEQ_TOP)).toBe(true);
    expect(moveNode(doc, ids[0], 140, 700).nodes[0].y).toBe(SEQ_TOP);
    for (const [f, t] of [[0, 1], [1, 2], [2, 1]]) doc = ok(connect(doc, ids[f], ids[t], "sync")).doc;
    expect(doc.edges.map(e => e.y)).toEqual([SEQ_FIRST, SEQ_FIRST + SEQ_STEP, SEQ_FIRST + 2 * SEQ_STEP]);
    const swapped = moveMessage(doc, doc.edges[2].id, -1);
    expect(swapped.edges.map(e => e.y)).toEqual([SEQ_FIRST, SEQ_FIRST + 2 * SEQ_STEP, SEQ_FIRST + SEQ_STEP]);
    expect(moveMessage(doc, doc.edges[0].id, -1)).toBe(doc);
    const gone = removeEdge(doc, doc.edges[0].id);
    expect(gone.edges.map(e => e.y)).toEqual([SEQ_FIRST, SEQ_FIRST + SEQ_STEP]);
    const frame = added(doc, "fragment");
    expect(connect(frame.doc, frame.id, ids[0], "sync").ok).toBe(false);   // a message joins two lifelines
  });
  it("two arrows between the same components are drawn apart; an arrow to itself is a loop", () => {
    let { doc, id: a } = added(emptyDoc("state"), "state", 200, 200);
    const b = added(doc, "state", 600, 200); doc = b.doc;
    doc = ok(connect(doc, a, b.id, "transition")).doc;
    doc = ok(connect(doc, b.id, a, "transition")).doc;
    doc = ok(connect(doc, a, a, "transition")).doc;
    const boxes = boxesOf(doc);
    const [p1, p2, loop] = doc.edges.map(e => edgePath(doc, e, boxes)!);
    expect(p1.d).not.toBe(p2.d);
    expect(Math.abs(p1.mid.y - p2.mid.y)).toBeGreaterThan(5);
    expect(loop.d).toMatch(/C/);
  });
});

describe("finding what is under the pointer", () => {
  it("the topmost component, a container only where nothing else is, an arrow near its line", () => {
    const doc = exampleDoc("useCase");
    const boxes = boxesOf(doc);
    const uc = doc.nodes.find(n => n.text.name === "استعارة كتاب")!;
    const b = boxes.get(uc.id)!;
    expect(nodeAt(doc, boxes, b.x + b.w / 2, b.y + b.h / 2)).toBe(uc.id);
    const sys = doc.nodes.find(n => n.type === "system")!;
    expect(nodeAt(doc, boxes, sys.x + 10, sys.y + sys.h - 10)).toBe(sys.id);
    expect(nodeAt(doc, boxes, 5, 1500)).toBeNull();
    const paths = new Map(doc.edges.map(e => [e.id, edgePath(doc, e, boxes)!] as [string, EdgePath]));
    const e = paths.get(doc.edges[0].id)!;
    const [s, t] = [e.pts[0], e.pts[e.pts.length - 1]];
    expect(edgeAt(paths, (s[0] + t[0]) / 2, (s[1] + t[1]) / 2)).toBe(doc.edges[0].id);
  });
});

describe("text", () => {
  it("a line's direction is its first letter's: Arabic → rtl, code → ltr", () => {
    expect(textDir("رقم الطالب")).toBe("rtl");
    expect(textDir("+ GetAverage() : double")).toBe("ltr");
    expect(textDir("1.0 تسجيل")).toBe("ltr");
    expect(textDir("«include»")).toBe("ltr");
    expect(textDir("")).toBe("ltr");
  });
  it("a long name is wrapped; a component grows to hold its text", () => {
    expect(wrapText("نظام إدارة المكتبة المدرسية الإلكتروني الجديد", 120).length).toBeGreaterThan(1);
    let { doc, id } = added(emptyDoc("class"), "class");
    const small = layoutNode(doc, doc.nodes[0])!;
    doc = setText(doc, id, "attrs", Array.from({ length: 12 }, (_, i) => "- field" + i + " : VeryLongTypeName<Something>").join("\n"));
    const big = layoutNode(doc, doc.nodes[0])!;
    expect(big.w).toBeGreaterThan(small.w);
    expect(big.h).toBeGreaterThan(small.h);
  });
});

describe("undo and redo", () => {
  it("each change is one step; a drag in progress is no step; undo then redo returns the same diagram", () => {
    let h = startHistory(emptyDoc("erd"));
    const a = ok(addNode(h.present, "entity", { x: 300, y: 300 }));
    h = commit(h, a.doc);
    const start = h.present;
    h = preview(h, moveNode(start, (a as { id: string }).id, 600, 600));
    h = preview(h, moveNode(start, (a as { id: string }).id, 700, 700));
    expect(h.past).toHaveLength(1);
    h = commit({ ...h, present: start }, h.present);
    expect(h.past).toHaveLength(2);
    const after = h.present;
    h = undo(h);
    expect(h.present).toBe(start);
    h = redo(h);
    expect(h.present).toBe(after);
    expect(commit(h, h.present)).toBe(h);
    expect(undo(startHistory(emptyDoc("erd"))).past).toHaveLength(0);
  });
});

describe("the strict reader", () => {
  const good = serializeDiagram(exampleDoc("class"));
  const mutate = (f: (o: Record<string, any>) => void) => { const o = JSON.parse(good); f(o); return JSON.stringify(o); };   // eslint-disable-line @typescript-eslint/no-explicit-any
  it.each<[string, string]>([
    ["not JSON", "{"],
    ["another format", mutate(o => { o.format = "other"; })],
    ["a newer version", mutate(o => { o.version = 2; })],
    ["an unknown kind", mutate(o => { o.kind = "gantt"; })],
    ["an extra key", mutate(o => { o.extra = 1; })],
    ["a component's extra key", mutate(o => { o.nodes[0].onclick = "x"; })],
    ["a component of another kind", mutate(o => { o.nodes[0].type = "table"; })],
    ["a field the component has not", mutate(o => { o.nodes[0].text.html = "<b>"; })],
    ["a control character", mutate(o => { o.nodes[0].text.name = "a\u0000b"; })],
    ["a text past its bound", mutate(o => { o.nodes[0].text.name = "x".repeat(DIAGRAM_LIMITS.text + 1); })],
    ["a duplicate id", mutate(o => { o.nodes[1].id = o.nodes[0].id; })],
    ["a bad id", mutate(o => { o.nodes[0].id = "__proto__"; })],
    ["off the page", mutate(o => { o.nodes[0].x = DIAGRAM_LIMITS.canvasW; })],
    ["a fractional position", mutate(o => { o.nodes[0].x = 10.5; })],
    ["an unknown colour", mutate(o => { o.nodes[0].color = "url(#x)"; })],
    ["a dangling arrow", mutate(o => { o.edges[0].to = "n99"; })],
    ["an arrow of another kind", mutate(o => { o.edges[0].type = "oneMany"; })],
    ["too large", JSON.stringify({ format: "tadris.diagram", pad: "x".repeat(DIAGRAM_LIMITS.fileBytes) })],
  ])("refuses %s", (_name, text) => {
    expect(parseDiagram(text).ok).toBe(false);
  });
  it("the good file reads", () => { expect(parseDiagram(good).ok).toBe(true); });
});

describe("the draft", () => {
  it("keeps the last diagram of each kind and the kind open last; a damaged kind is dropped alone", () => {
    const text = serializeDraft({ current: "dsd", docs: { dsd: exampleDoc("dsd"), erd: exampleDoc("erd"), class: emptyDoc("class") } });
    const d = parseDraft(text)!;
    expect(d.current).toBe("dsd");
    expect(Object.keys(d.docs).sort()).toEqual(["dsd", "erd"]);   // an empty diagram is not kept
    const raw = JSON.parse(text);
    raw.docs.erd.nodes[0].type = "nonsense";
    const d2 = parseDraft(JSON.stringify(raw))!;
    expect(Object.keys(d2.docs)).toEqual(["dsd"]);
    expect(parseDraft("{")).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });
});

describe("the contract", () => {
  it("diagramEditor: `{ id }` only, its own default", () => {
    expect(defaultStudentToolConfig("diagramEditor")).toEqual({ id: "diagramEditor" });
    expect(validateStudentTools({ version: 1, tools: [{ id: "diagramEditor" }] }).ok).toBe(true);
    expect(validateStudentTools({ version: 1, tools: [{ id: "diagramEditor", kinds: ["erd"] }] }).ok).toBe(false);
    expect(kindSpec("dsd").label).toMatch(/DSD/);
  });
});
