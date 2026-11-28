// @vitest-environment happy-dom
// DG10 — «مكتبة الأيقونات» and «النص» (docs/enterprise-diagram-editor-design.md §22): pictures of people, products, sales, management and
// technology, and a free text (a title, words anywhere), in every kind of diagram.
//   • the library: every icon drawn (plain shapes only: no text, no clip path, no id, no outside reference), its Arabic name and group;
//     the search in Arabic as typed (hamza, ta marbuta, diacritics) and in English;
//   • the file: an icon is stored as its id and must be the library's; a text's size must be one of the four; both read back the same;
//   • the drawing: an icon's box grows with its name and description; a text with its size and lines, in its colour's deep shade;
//   • «افحص المخطط» leaves them be (an icon beside a class or an actor raises nothing);
//   • «اكتب كنص»: the icons and texts are not in the script, and stay on the sheet with their arrows when a script is drawn;
//   • the editor: the picker (search, groups, the chosen one pressed, a name that follows the icon unless the learner wrote one), the
//     text's size and colour, one «تراجع» per choice.
import { describe, it, expect, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import { DIAGRAM_CATALOG, DIAGRAM_COLORS, DIAGRAM_KINDS, TEXT_INK, TEXT_SIZES, kindSpec } from "./diagramCatalog";
import { addNode, parseDiagram, serializeDiagram, setText, type DiagramDoc, type DNode } from "./diagramDoc";
import { layoutNode } from "./diagramLayout";
import { NodeShape } from "./diagramShapes";
import { IconGlyph } from "./diagramIcons";
import { findIcons, ICONS, ICON_GROUPS, iconOf, isIconId, plainArabic } from "./diagramIconSet";
import { checkDiagram } from "./diagramChecks";
import { exampleDoc } from "./diagramExamples";
import { keepIcons, keepPositions, readDiagramScript } from "./diagramScript";
import DiagramEditorTool from "./DiagramEditorTool";

afterEach(cleanup);
/** A component at its kind's smallest size (as the editor makes it). */
const node = (id: string, type: string, x: number, y: number, text: Record<string, string>, color = "none"): DNode => {
  const spec = kindSpec("class").nodes.find(n => n.type === type) ?? { minW: 40, minH: 24 };
  return { id, type, x, y, w: spec.minW, h: spec.minH, text, color: color as DNode["color"] };
};
const box = (kind: DiagramDoc["kind"], n: DNode) => layoutNode({ kind, nodes: [n], edges: [] }, n)!;
const markup = (kind: DiagramDoc["kind"], n: DNode) => renderToStaticMarkup(<svg><NodeShape b={box(kind, n)} /></svg>);

describe("the library", () => {
  it("44 icons in four groups, each with a unique id, an Arabic name and search words", () => {
    expect(ICONS).toHaveLength(44);
    expect(new Set(ICONS.map(i => i.id)).size).toBe(44);
    expect(ICON_GROUPS.map(g => ICONS.filter(i => i.group === g).length)).toEqual([16, 11, 8, 9]);
    for (const i of ICONS) { expect(i.label, i.id).toMatch(/[؀-ۿ]/); expect(i.words.length, i.id).toBeGreaterThan(1); }
    expect(["manager", "customerF", "invoice", "database"].every(isIconId)).toBe(true);
    expect([undefined, "", "boss", "__proto__", 3].some(isIconId)).toBe(false);
  });
  it("every icon is drawn (not the «?» of an unknown one), with plain shapes only — nothing a saved picture could lose", () => {
    const unknown = renderToStaticMarkup(<svg><IconGlyph id="nope" x={0} y={0} /></svg>);
    const question = /d="(M26,25 Q26,18[^"]*)"/.exec(unknown)![1];
    for (const i of ICONS) {
      const svg = renderToStaticMarkup(<svg><IconGlyph id={i.id} x={0} y={0} /></svg>);
      expect(svg, i.id).not.toContain(question);
      expect((svg.match(/<(path|rect|circle|ellipse|polygon)\b/g) ?? []).length, i.id).toBeGreaterThanOrEqual(2);   // the circle and a drawing
      expect(svg, i.id).not.toMatch(/<text|<image|clip-path|clipPath|<use|\sid=|url\(|href/);
    }
    // the people of a group share its circle; a component's colour replaces it
    expect(renderToStaticMarkup(<svg><IconGlyph id="manager" x={0} y={0} /></svg>)).toContain('fill="#dbeafe"');
    expect(renderToStaticMarkup(<svg><IconGlyph id="manager" x={0} y={0} backdrop="#ffe4e6" /></svg>)).toContain('fill="#ffe4e6"');
  });
  it("search: Arabic as typed (أ/إ/آ, ة/ه, ى/ي, diacritics), or English; empty shows all; nothing found is empty", () => {
    expect(plainArabic("الإدارةُ")).toBe("الاداره");
    expect(findIcons("مدير").map(i => i.id)).toEqual(["manager", "managerF"]);
    expect(findIcons("اداره").map(i => i.id)).toContain("company");
    expect(findIcons("زبون").map(i => i.id)).toEqual(["customer", "customerF"]);
    expect(findIcons("Truck").map(i => i.id)).toEqual(["truck"]);
    expect(findIcons("  ")).toHaveLength(44);
    expect(findIcons("قطار")).toEqual([]);
  });
});

describe("in every kind of diagram, and in the file", () => {
  it("«أيقونة» and «نص» come after «ملاحظة» in every kind", () => {
    expect(DIAGRAM_CATALOG).toHaveLength(DIAGRAM_KINDS.length);
    for (const k of DIAGRAM_KINDS) expect(kindSpec(k).nodes.map(n => n.type).slice(-3), k).toEqual(["note", "icon", "text"]);
  });
  it("an icon is stored as the library's id, a text's size as one of four; anything else is refused; both read back the same", () => {
    const d: DiagramDoc = { kind: "class", nodes: [node("n1", "icon", 10, 10, { icon: "customer", name: "العميل", details: "يطلب المنتج" }), node("n2", "text", 200, 10, { name: "عنوان\nسطر ثان", size: "xl" }, "blue")], edges: [] };
    const r = parseDiagram(serializeDiagram(d));
    expect(r.ok && r.doc).toEqual(d);
    for (const bad of [{ icon: "unicorn" }, { icon: "" }]) expect(parseDiagram(serializeDiagram({ ...d, nodes: [{ ...d.nodes[0], text: { ...d.nodes[0].text, ...bad } }] })).ok).toBe(false);
    for (const size of ["xxl", "", "M"]) expect(parseDiagram(serializeDiagram({ ...d, nodes: [{ ...d.nodes[1], text: { name: "x", size } }] })).ok, size).toBe(false);
  });
  it("a new icon starts as «موظف», a new text as a large «عنوان المخطط»", () => {
    const a = addNode({ kind: "erd", nodes: [], edges: [] }, "icon", { x: 10, y: 10 });
    const b = a.ok ? addNode(a.doc, "text", { x: 100, y: 10 }) : a;
    expect(b.ok && b.doc.nodes.map(n => [n.type, n.text])).toEqual([["icon", { icon: "employee", name: "موظف" }], ["text", { name: "عنوان المخطط", size: "l" }]]);
  });
});

describe("the drawing", () => {
  it("an icon's box: the picture, then the name and description under it, as wide as the longest", () => {
    const bare = box("dfd", node("n1", "icon", 0, 0, { icon: "manager", name: "" }));
    const named = box("dfd", node("n1", "icon", 0, 0, { icon: "manager", name: "مدير" }));
    const full = box("dfd", node("n1", "icon", 0, 0, { icon: "manager", name: "مدير", details: "قسم المبيعات والتسويق في الفرع الرئيسي" }));
    expect(bare.h).toBeLessThan(named.h);
    expect(named.h).toBeLessThan(full.h);
    expect(full.w).toBeGreaterThan(named.w);
    expect(bare.w).toBeGreaterThanOrEqual(68);
    const svg = markup("dfd", node("n1", "icon", 0, 0, { icon: "manager", name: "مدير", details: "قسم المبيعات" }));
    expect(svg).toContain(">مدير</text>");
    expect(svg).toContain(">قسم المبيعات</text>");
    // the component's colour fills the circle (none: the group's own)
    expect(markup("dfd", node("n1", "icon", 0, 0, { icon: "manager", name: "مدير" }, "rose"))).toContain('fill="' + DIAGRAM_COLORS.rose.fill + '"');
    expect(svg).not.toContain('fill="' + DIAGRAM_COLORS.rose.fill + '"');
  });
  it("a text grows with its size and its lines, bold from «كبير» up, in its colour's deep shade, with no frame", () => {
    const sizes = (["s", "m", "l", "xl"] as const).map(size => box("erd", node("n1", "text", 0, 0, { name: "نظام المتجر", size })));
    for (let i = 1; i < 4; i++) { expect(sizes[i].h).toBeGreaterThan(sizes[i - 1].h); expect(sizes[i].w).toBeGreaterThan(sizes[i - 1].w); }
    expect(box("erd", node("n1", "text", 0, 0, { name: "سطر\nسطر\nسطر", size: "m" })).h).toBeGreaterThan(sizes[1].h * 2);
    const svg = markup("erd", node("n1", "text", 0, 0, { name: "نظام المتجر", size: "xl" }, "blue"));
    expect(svg).toContain('font-size="' + TEXT_SIZES.xl.px + '"');
    expect(svg).toContain('font-weight="600"');
    expect(svg).toContain('fill="' + TEXT_INK.blue + '"');
    expect(svg).not.toMatch(/<rect|<path|<circle/);
    expect(markup("erd", node("n1", "text", 0, 0, { name: "x", size: "s" }))).toContain('font-weight="400"');
  });
});

describe("«افحص المخطط» and «اكتب كنص»", () => {
  it("an icon or a text added to any example (joined to its components, too) raises nothing the example did not", () => {
    for (const k of DIAGRAM_KINDS) {
      const ex = exampleDoc(k);
      const first = ex.nodes.find(n => !["note", "icon", "text"].includes(n.type))!;
      const type = kindSpec(k).edges[0].type;
      const more: DiagramDoc = { ...ex, nodes: [...ex.nodes, node("n90", "icon", 1500, 900, { icon: "customer", name: "عميل" }), node("n91", "text", 1500, 1100, { name: "عنوان", size: "xl" })],
        edges: k === "sequence" ? ex.edges : [...ex.edges, { id: "e90", type, from: "n90", to: first.id, label: "", fromLabel: "", toLabel: "", y: 0 }] };
      expect(checkDiagram(more).map(f => f.rule), k).toEqual(checkDiagram(ex).map(f => f.rule));
    }
  });
  it("a script drawn keeps the icons and texts where they were, with their arrows to classes it still has (renamed: dropped)", () => {
    const old = readDiagramScript("class Order\nclass Customer\nCustomer --> Order", "class").doc;
    const customer = old.nodes.find(n => n.text.name === "Customer")!, order = old.nodes.find(n => n.text.name === "Order")!;
    const withIcons: DiagramDoc = { ...old,
      nodes: [...old.nodes, node("n50", "icon", 600, 40, { icon: "customer", name: "عميل" }), node("n51", "text", 300, 5, { name: "متجر", size: "xl" }, "violet")],
      edges: [...old.edges, { id: "e50", type: "assoc", from: "n50", to: customer.id, label: "", fromLabel: "", toLabel: "", y: 0 },
        { id: "e51", type: "assoc", from: "n50", to: order.id, label: "", fromLabel: "", toLabel: "", y: 0 }] };
    const next = readDiagramScript("class Customer\nclass Invoice\nCustomer --> Invoice", "class").doc;
    const kept = keepIcons(keepPositions(next, withIcons), withIcons);
    const extra = kept.nodes.slice(next.nodes.length);
    expect(extra.map(n => n.type + ":" + n.text.name + "@" + n.x + "," + n.y + ":" + n.color)).toEqual(["icon:عميل@600,40:none", "text:متجر@300,5:violet"]);
    expect(new Set(kept.nodes.map(n => n.id)).size).toBe(kept.nodes.length);
    expect(new Set(kept.edges.map(e => e.id)).size).toBe(kept.edges.length);
    const toCustomer = kept.edges.filter(e => e.from === extra[0].id);
    expect(toCustomer.map(e => kept.nodes.find(n => n.id === e.to)!.text.name)).toEqual(["Customer"]);   // «Order» is gone: its arrow too
    expect(parseDiagram(serializeDiagram(kept)).ok).toBe(true);
    expect(keepIcons(next, readDiagramScript("class A", "class").doc)).toBe(next);   // nothing to keep: the same diagram
    expect(keepIcons(readDiagramScript("actor A", "useCase").doc, withIcons).nodes).toHaveLength(1);   // another kind: not carried over
  });
});

describe("the editor", () => {
  const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
  const click = async (el: HTMLElement) => { fireEvent.click(el); await tick(); };
  const canvas = () => screen.getByTestId("diagram-canvas") as unknown as SVGSVGElement;
  const props = () => screen.getByTestId("diagram-node-props");
  it("an icon: the picker searches and groups; choosing one renames a name still the old icon's; a name the learner wrote stays; «تراجع»", async () => {
    localStorage.clear();
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "class" } });
    await tick();
    await click(screen.getByTestId("diagram-add-icon"));
    const picker = screen.getByTestId("diagram-icon-picker");
    expect(within(picker).getAllByRole("button")).toHaveLength(44);
    expect(screen.getByTestId("diagram-icon-employee").getAttribute("aria-pressed")).toBe("true");
    expect(within(picker).getAllByRole("group").map(g => g.getAttribute("aria-label"))).toEqual(["أشخاص", "المبيعات والمنتجات", "الإدارة", "التقنية"]);
    fireEvent.change(screen.getByTestId("diagram-icon-search"), { target: { value: "فاتوره" } });
    await tick();
    expect(within(picker).getAllByRole("button").map(b => b.getAttribute("aria-label"))).toEqual(["فاتورة"]);
    await click(screen.getByTestId("diagram-icon-invoice"));
    expect((within(props()).getByLabelText("الاسم") as HTMLInputElement).value).toBe("فاتورة");
    expect(canvas().textContent).toContain("فاتورة");
    fireEvent.change(within(props()).getByLabelText("الاسم"), { target: { value: "فاتورة البيع" } });
    await tick();
    fireEvent.change(screen.getByTestId("diagram-icon-search"), { target: { value: "" } });
    await click(screen.getByTestId("diagram-icon-cash"));
    expect((within(props()).getByLabelText("الاسم") as HTMLInputElement).value).toBe("فاتورة البيع");
    expect(screen.getByTestId("diagram-icon-cash").getAttribute("aria-pressed")).toBe("true");
    // the banknote on the sheet; one «تراجع» and the invoice (its torn edge) is back
    expect(canvas().innerHTML).toContain("#bbf7d0");
    await click(within(screen.getByTestId("diagram-editor")).getByRole("button", { name: /تراجع/ }));
    expect(canvas().innerHTML).not.toContain("#bbf7d0");
    expect(canvas().innerHTML).toContain("L42,49");
    expect(canvas().textContent).toContain("فاتورة البيع");
  });
  it("another icon starts with an empty search", async () => {
    localStorage.clear();
    render(<DiagramEditorTool />);
    await click(screen.getByTestId("diagram-add-icon"));
    fireEvent.change(screen.getByTestId("diagram-icon-search"), { target: { value: "عميل" } });
    await click(screen.getByTestId("diagram-add-icon"));
    expect((screen.getByTestId("diagram-icon-search") as HTMLInputElement).value).toBe("");
    expect(within(screen.getByTestId("diagram-icon-picker")).getAllByRole("button")).toHaveLength(44);
  });
  it("a text: its words, its size from four, its colour; drawn on the sheet that way", async () => {
    localStorage.clear();
    render(<DiagramEditorTool />);
    await click(screen.getByTestId("diagram-add-text"));
    fireEvent.change(within(props()).getByLabelText("النص"), { target: { value: "نظام إدارة المبيعات" } });
    await tick();
    expect(screen.getByTestId("diagram-text-size-l").getAttribute("aria-checked")).toBe("true");
    await click(screen.getByTestId("diagram-text-size-xl"));
    expect(within(props()).getByText("لون النص")).toBeTruthy();
    await click(within(props()).getByRole("button", { name: "أخضر" }));
    const t = [...canvas().querySelectorAll("text")].find(x => x.textContent === "نظام إدارة المبيعات")!;
    expect(t.getAttribute("font-size")).toBe(String(TEXT_SIZES.xl.px));
    expect(t.getAttribute("fill")).toBe(TEXT_INK.green);
    expect(within(props()).getByRole("button", { name: "أسود" })).toBeTruthy();
  });
});

it("(names) iconOf", () => { expect(iconOf("truck")?.label).toBe("شاحنة توصيل"); expect(iconOf(undefined)).toBeUndefined(); expect(setText).toBeTypeOf("function"); });

describe("flow rules: a note's line is not a step", () => {
  it("a note joined to the start or the end of an activity diagram raises nothing (it did: «لا يدخل سهم إلى البداية»)", () => {
    const ex = exampleDoc("activity");
    const start = ex.nodes.find(n => n.type === "start")!, end = ex.nodes.find(n => n.type === "end")!;
    const noted: DiagramDoc = { ...ex, nodes: [...ex.nodes, { id: "n80", type: "note", x: 900, y: 40, w: 110, h: 50, text: { name: "يبدأ هنا" }, color: "none" }],
      edges: [...ex.edges, { id: "e80", type: kindSpec("activity").edges[0].type, from: "n80", to: start.id, label: "", fromLabel: "", toLabel: "", y: 0 },
        { id: "e81", type: kindSpec("activity").edges[0].type, from: end.id, to: "n80", label: "", fromLabel: "", toLabel: "", y: 0 }] };
    expect(checkDiagram(noted).map(f => f.rule)).toEqual(checkDiagram(ex).map(f => f.rule));
  });
});
