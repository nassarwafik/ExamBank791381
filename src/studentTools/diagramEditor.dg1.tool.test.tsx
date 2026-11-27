// @vitest-environment happy-dom
// DG1 — «محرّر المخططات» through its UI:
//   • the books whose projects draw diagrams list it, and the tool bar opens it in its own lazy chunk, wide and full-screen;
//   • the learner adds components from the palette, fills them in, joins two with the chosen arrow («صِل بـ», the non-drag way) and
//     writes on the arrow; a drag on the sheet moves a component; undo / redo; delete;
//   • «مثال» opens the kind's worked example; the kind list switches kinds and each kind keeps its own diagram;
//   • «احفظ المخطط في ملف» writes a file the strict reader reads back; «افتح ملفًا» refuses a broken file and keeps the diagram;
//   • a BOOK keeps a draft that a new editor reads back; an EXAM page keeps none;
//   • the student's project page offers the editor and returns to the project.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, within, waitFor } from "@testing-library/react";
import DiagramEditorTool from "./DiagramEditorTool";
import StudentToolDock from "./StudentToolDock";
import { courseStudentTools } from "./courseTools";
import { parseDiagram } from "./diagramDoc";
import { serializeLab } from "./networkLab";

const KEY = "eb.diagramEditor.draft.v1";
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const editor = () => screen.getByTestId("diagram-editor");
const click = async (el: HTMLElement) => { fireEvent.click(el); await tick(); };
const canvas = () => screen.getByTestId("diagram-canvas") as unknown as SVGSVGElement;
const drawnNodes = () => canvas().querySelectorAll("[data-node]");
const drawnEdges = () => canvas().querySelectorAll("[data-edge]");
/** A field by its name (its label also holds its hint). */
const field = (label: string) => within(screen.getByTestId("diagram-node-props")).getByLabelText(new RegExp("^" + label + "(?!\\s*:)")) as HTMLInputElement;

let downloads: { name: string; blob: Blob }[] = [];
beforeEach(() => {
  localStorage.clear();
  downloads = [];
  let n = 0;
  const blobs = new Map<string, Blob>();
  vi.spyOn(URL, "createObjectURL").mockImplementation((b: Blob | MediaSource) => { const u = "blob:t" + (n++); blobs.set(u, b as Blob); return u; });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.push({ name: this.download, blob: blobs.get(this.href)! }); });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe("the books and the tool bar", () => {
  it("the books whose projects draw diagrams list it; the tool bar opens it wide, with full screen", async () => {
    for (const c of ["791381", "791381s", "791283", "899371", "899271d"]) expect(courseStudentTools(c)!.tools.some(t => t.id === "diagramEditor"), c).toBe(true);
    render(<StudentToolDock studentTools={courseStudentTools("899371")} labHandoff />);
    await click(screen.getByTestId("student-tools-button"));
    await click(screen.getByRole("button", { name: "محرّر المخططات" }));
    expect(await screen.findByTestId("diagram-editor", {}, { timeout: 4000 })).toBeTruthy();
    const panel = screen.getByTestId("tool-panel-diagramEditor");
    expect(panel.className).toMatch(/is-xwide/);
    expect(within(panel).getByTestId("tool-fullscreen")).toBeTruthy();
  });
  it("an exam page (no book) keeps no draft", async () => {
    render(<StudentToolDock studentTools={{ version: 1, tools: [{ id: "diagramEditor" }] }} />);
    await click(screen.getByTestId("student-tools-button"));
    await click(screen.getByRole("button", { name: "محرّر المخططات" }));
    await screen.findByTestId("diagram-editor", {}, { timeout: 4000 });
    await click(screen.getByTestId("diagram-add-actor"));
    await tick(500);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("drawing a diagram", () => {
  it("a class diagram: two classes filled in, joined by inheritance, a text on an association; undo, redo, delete", async () => {
    render(<DiagramEditorTool draftKey={KEY} />);
    await click(within(editor()).getByTestId("diagram-kind"));
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "class" } });
    await tick();
    expect(screen.getByText(/الأصناف بخصائصها ودوالها/, { selector: ".dgm-empty p" })).toBeTruthy();
    await click(screen.getByRole("button", { name: "أضف: صنف" }));
    fireEvent.change(field("الاسم"), { target: { value: "Teacher" } });
    fireEvent.change(field("الخصائص"), { target: { value: "- subject : string" } });
    await tick();
    expect(canvas().textContent).toContain("Teacher");
    expect(canvas().textContent).toContain("- subject : string");
    const teacher = drawnNodes()[0].getAttribute("data-node")!;
    await click(screen.getByRole("button", { name: "أضف: صنف مجرّد" }));
    fireEvent.change(field("الاسم"), { target: { value: "Person" } });
    await tick();
    expect(drawnNodes()).toHaveLength(2);
    // the arrow: choose «وراثة», then from Teacher «صِل بـ» Person
    await click(screen.getByTestId("diagram-arrow-inherit"));
    fireEvent.keyDown(canvas(), { key: "Escape" });   // nothing selected: the list of the diagram's elements
    await tick();
    fireEvent.change(screen.getByTestId("diagram-pick"), { target: { value: "node:" + teacher } });
    await tick();
    fireEvent.change(screen.getByTestId("diagram-link-to"), { target: { value: drawnNodes()[1].getAttribute("data-node") } });
    await tick();
    await click(screen.getByTestId("diagram-link"));
    expect(drawnEdges()).toHaveLength(1);
    expect(screen.getByTestId("diagram-edge-props").textContent).toMatch(/وراثة: من «صنف: Teacher» إلى «صنف مجرّد: Person»/);
    expect(drawnEdges()[0].querySelector("path")!.getAttribute("marker-end")).toMatch(/triangle\)$/);
    // the arrow's type changes from the arrow buttons while it is selected; its text is typed in the properties
    await click(screen.getByTestId("diagram-arrow-assoc"));
    fireEvent.change(screen.getByTestId("diagram-edge-label"), { target: { value: "يدرّس" } });
    await tick();
    expect(drawnEdges()[0].textContent).toContain("يدرّس");
    // typing is one step: one undo removes the whole word, the next the type change
    await click(within(editor()).getByRole("button", { name: /تراجع/ }));
    expect(drawnEdges()[0].textContent).not.toContain("يدرّس");
    await click(within(editor()).getByRole("button", { name: /إعادة/ }));
    expect(drawnEdges()[0].textContent).toContain("يدرّس");
    // delete the class: its arrow goes with it
    fireEvent.keyDown(canvas(), { key: "Escape" });
    await tick();
    fireEvent.change(screen.getByTestId("diagram-pick"), { target: { value: "node:" + teacher } });
    await tick();
    await click(screen.getByTestId("diagram-delete"));
    expect(drawnNodes()).toHaveLength(1);
    expect(drawnEdges()).toHaveLength(0);
  });

  it("a drag on the sheet moves a component; the keyboard's arrows move it too; Delete removes it", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "erd" } });
    await tick();
    await click(screen.getByRole("button", { name: "أضف: كيان" }));
    const svg = canvas();
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 2400, height: 1600, right: 2400, bottom: 1600, x: 0, y: 0, toJSON() {} } as DOMRect);
    const rect = () => drawnNodes()[0].querySelector("rect")!;
    const [x0, y0] = [Number(rect().getAttribute("x")), Number(rect().getAttribute("y"))];
    fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: x0 + 10, clientY: y0 + 10, pointerType: "mouse" });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: x0 + 210, clientY: y0 + 110, pointerType: "mouse" });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: x0 + 210, clientY: y0 + 110, pointerType: "mouse" });
    await tick();
    expect([Number(rect().getAttribute("x")) - x0, Number(rect().getAttribute("y")) - y0]).toEqual([200, 100]);
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    await tick();
    expect(Number(rect().getAttribute("x")) - x0).toBe(190);
    // the drag is one undo step
    await click(within(editor()).getByRole("button", { name: /تراجع/ }));
    await click(within(editor()).getByRole("button", { name: /تراجع/ }));
    expect(Number(rect().getAttribute("x"))).toBe(x0);
    fireEvent.pointerDown(svg, { pointerId: 2, button: 0, clientX: x0 + 10, clientY: y0 + 10, pointerType: "mouse" });
    fireEvent.pointerUp(svg, { pointerId: 2, clientX: x0 + 10, clientY: y0 + 10, pointerType: "mouse" });
    await tick();
    fireEvent.keyDown(svg, { key: "Delete" });
    await tick();
    expect(drawnNodes()).toHaveLength(0);
  });

  it("dragging from a blue dot to another component draws the chosen arrow", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "dfd" } });
    await tick();
    await click(screen.getByTestId("diagram-example"));
    const svg = canvas();
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 2400, height: 1600, right: 2400, bottom: 1600, x: 0, y: 0, toJSON() {} } as DOMRect);
    const before = drawnEdges().length;
    // choose the external entity «الطالب» (x 40, y 160, 110 × 50)
    fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: 60, clientY: 180, pointerType: "mouse" });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 60, clientY: 180, pointerType: "mouse" });
    await tick();
    const dot = svg.querySelector("[data-handle='link'] circle:last-child")!;
    fireEvent.pointerDown(dot, { pointerId: 2, button: 0, clientX: 160, clientY: 185, pointerType: "mouse" });
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 600, clientY: 80, pointerType: "mouse" });
    fireEvent.pointerUp(svg, { pointerId: 2, clientX: 600, clientY: 80, pointerType: "mouse" });   // onto the data store D1
    await tick();
    expect(drawnEdges().length).toBe(before + 1);
    expect(screen.getByTestId("diagram-edge-props").textContent).toMatch(/من «كيان خارجي: الطالب» إلى «مخزن بيانات: ملف الطلاب»/);
  });

  it("each kind keeps its own diagram; «مثال» opens the worked example; «مسح» is undone by «تراجع»", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "dsd" } });
    await tick();
    await click(screen.getByTestId("diagram-example"));
    expect(canvas().textContent).toContain("Students");
    expect(drawnNodes()).toHaveLength(4);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "topology" } });
    await tick();
    expect(drawnNodes()).toHaveLength(0);
    await click(screen.getByRole("button", { name: "أضف: راوتر" }));
    expect(canvas().textContent).toContain("R1");
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "dsd" } });
    await tick();
    expect(drawnNodes()).toHaveLength(4);
    await click(within(editor()).getByRole("button", { name: "مسح" }));
    expect(drawnNodes()).toHaveLength(0);
    await click(within(editor()).getByRole("button", { name: /تراجع/ }));
    expect(drawnNodes()).toHaveLength(4);
  });
});

describe("files and the draft", () => {
  it("«احفظ المخطط في ملف» writes a file that reads back; «افتح ملفًا» refuses a broken file and keeps the diagram", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "state" } });
    await tick();
    await click(screen.getByTestId("diagram-example"));
    await click(screen.getByTestId("diagram-save-file"));
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toMatch(/\.diagram\.json$/);
    const r = parseDiagram(await downloads[0].blob.text());
    expect(r.ok && r.doc.kind).toBe("state");
    const input = screen.getByTestId("diagram-open-file") as HTMLInputElement;
    const bad = new File(["{\"format\":\"tadris.diagram\",\"version\":1}"], "x.diagram.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [bad] } });
    await tick(30);
    expect(screen.getByTestId("diagram-status").textContent).toMatch(/ليس مخططًا صالحًا/);
    expect(drawnNodes().length).toBeGreaterThan(0);
    // a good file of another kind opens in its kind
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "class" } });
    await tick();
    const good = new File([await downloads[0].blob.text()], "y.diagram.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [good] } });
    await tick(30);
    expect((screen.getByTestId("diagram-kind") as HTMLSelectElement).value).toBe("state");
    expect(screen.getByTestId("diagram-status").textContent).toMatch(/فُتح المخطط/);
  });
  it("a book's draft keeps the diagram; a new editor reads it back on the same kind", async () => {
    const first = render(<DiagramEditorTool draftKey={KEY} />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "useCase" } });
    await tick();
    await click(screen.getByTestId("diagram-example"));
    await tick(500);
    expect(localStorage.getItem(KEY)).toMatch(/tadris\.diagram\.draft/);
    first.unmount();
    render(<DiagramEditorTool draftKey={KEY} />);
    expect((screen.getByTestId("diagram-kind") as HTMLSelectElement).value).toBe("useCase");
    expect(canvas().textContent).toContain("نظام المكتبة");
  });
  it("saving a picture of an empty diagram says so and saves nothing", async () => {
    render(<DiagramEditorTool />);
    await click(screen.getByTestId("diagram-png"));
    expect(screen.getByTestId("diagram-status").textContent).toMatch(/المخطط فارغ/);
    expect(downloads).toHaveLength(0);
  });
  it("«حفظ صورة SVG» saves the drawing without the editor's marks, cut to the drawing, with its title", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "activity" } });
    await tick();
    await click(screen.getByTestId("diagram-example"));
    fireEvent.change(screen.getByTestId("diagram-pick"), { target: { value: "node:n2" } });
    await tick();
    globalThis.fetch = vi.fn(async () => ({ ok: false })) as unknown as typeof fetch;   // no font files here: the picture still saves
    await click(screen.getByTestId("diagram-svg"));
    await tick(30);
    expect(downloads).toHaveLength(1);
    const svg = await downloads[0].blob.text();
    expect(svg).toMatch(/^<svg/);
    expect(svg).not.toContain("data-ui");
    expect(svg).not.toContain("data-handle");
    expect(svg).toContain("إدخال البيانات");
    expect(svg).toContain("<title>النشاط (Activity)</title>");
    expect(svg).not.toMatch(/viewBox="0 0 2400 1600"/);
  });
});

describe("DG2 — «افحص المخطط»", () => {
  it("the example passes; a broken table is named at once, its finding selects it, the sheet marks it; the picture leaves the marks out", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "dsd" } });
    await tick();
    await click(screen.getByTestId("diagram-example"));
    await click(screen.getByTestId("diagram-check"));
    const panel = () => screen.getByTestId("diagram-check-panel");
    expect(panel().textContent).toMatch(/لا ملاحظات/);
    expect(screen.queryByTestId("diagram-marks")).toBeNull();
    // take the primary key off «Students»: the check follows the change
    fireEvent.change(screen.getByTestId("diagram-pick"), { target: { value: "node:n2" } });
    await tick();
    fireEvent.change(field("الحقول"), { target: { value: "StudentID : INT\nName : VARCHAR(50)\nFK ClassID : INT" } });
    await tick();
    expect(panel().textContent).toMatch(/نتيجة الفحص: خطأ واحد/);
    expect(panel().textContent).toMatch(/جدول «Students» بلا مفتاح أساسي/);
    expect(canvas().querySelector("[data-mark='error']")).toBeTruthy();
    // a finding selects what it is about
    fireEvent.keyDown(canvas(), { key: "Escape" });
    await tick();
    expect(screen.queryByTestId("diagram-node-props")).toBeNull();
    await click(within(panel()).getAllByTestId("diagram-finding")[0]);
    expect((field("اسم الجدول") as HTMLInputElement).value).toBe("Students");
    // the saved picture has no mark
    globalThis.fetch = vi.fn(async () => ({ ok: false })) as unknown as typeof fetch;
    await click(screen.getByTestId("diagram-svg"));
    await tick(30);
    expect(await downloads[0].blob.text()).not.toContain("data-mark");
    // closing the check removes its marks
    await click(within(panel()).getByRole("button", { name: "إغلاق الفحص" }));
    expect(screen.queryByTestId("diagram-check-panel")).toBeNull();
    expect(screen.queryByTestId("diagram-marks")).toBeNull();
  });
});

describe("DG2 — Escape", () => {
  it("the first Escape only lets go of the selection; the next reaches the tool bar (full screen, close)", async () => {
    const outer = vi.fn();
    render(<div onKeyDown={e => outer(e.key)}><DiagramEditorTool /></div>);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "erd" } });
    await tick();
    await click(screen.getByRole("button", { name: "أضف: كيان" }));
    expect(screen.getByTestId("diagram-node-props")).toBeTruthy();
    fireEvent.keyDown(canvas(), { key: "Escape" });
    await tick();
    expect(screen.queryByTestId("diagram-node-props")).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    fireEvent.keyDown(canvas(), { key: "Escape" });
    expect(outer).toHaveBeenCalledWith("Escape");
  });
});

describe("DG3 — «ولّد من الكود»", () => {
  it("DSD: pasted CREATE TABLE draws the tables and their relationship; one «تراجع» brings the old diagram back", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "dsd" } });
    await tick();
    await click(screen.getByRole("button", { name: "أضف: جدول" }));
    await click(screen.getByTestId("diagram-generate"));
    fireEvent.change(screen.getByTestId("diagram-generate-code"), { target: { value:
      "CREATE TABLE Classes (ClassID INT PRIMARY KEY, Name NVARCHAR(30));\nCREATE TABLE Students (StudentID INT PRIMARY KEY, ClassID INT REFERENCES Classes(ClassID));" } });
    await click(screen.getByTestId("diagram-generate-draw"));
    expect(screen.getByTestId("diagram-generate-result").textContent).toMatch(/رُسم المخطط: 2 جدول و1 علاقة/);
    expect(drawnNodes()).toHaveLength(2);
    expect(drawnEdges()).toHaveLength(1);
    expect(canvas().textContent).toContain("Classes");
    expect(canvas().textContent).toContain("FK");
    await click(within(editor()).getByRole("button", { name: /تراجع/ }));
    expect(drawnNodes()).toHaveLength(1);   // the one table that was there before
  });
  it("C#: classes become a class diagram; broken code is named with its line and draws nothing", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "class" } });
    await tick();
    await click(screen.getByTestId("diagram-generate"));
    fireEvent.change(screen.getByTestId("diagram-generate-code"), { target: { value: "public class A {\n  public void F() {\n" } });
    await click(screen.getByTestId("diagram-generate-draw"));
    expect(screen.getByTestId("diagram-generate-result").textContent).toMatch(/لم يُرسم شيء/);
    expect(screen.getByTestId("diagram-generate-result").textContent).toMatch(/الصنف «A» لم يُغلق/);
    expect(drawnNodes()).toHaveLength(0);
    const input = screen.getByTestId("diagram-generate-file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["class Person { public string Name { get; set; } }\nclass Student : Person { private int id; }"], "school.cs")] } });
    await tick(30);
    expect(drawnNodes()).toHaveLength(2);
    expect(drawnEdges()[0].querySelector("path")!.getAttribute("marker-end")).toMatch(/triangle\)$/);
    expect(canvas().textContent).toContain("- id : int");
  });
  it("only DSD and class diagrams offer it", async () => {
    render(<DiagramEditorTool />);
    for (const k of ["useCase", "erd", "dfd", "topology", "sequence"]) {
      fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: k } });
      await tick();
      expect(screen.queryByTestId("diagram-generate"), k).toBeNull();
    }
  });
});

describe("DG4 — «اكتب كنص»", () => {
  const typeScript = async (text: string) => { fireEvent.change(screen.getByTestId("diagram-script-text"), { target: { value: text } }); await tick(450); };
  it("the owner's example typed into an empty class diagram is drawn; one «تراجع» takes the whole stretch of typing back", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "class" } });
    await tick();
    await click(screen.getByTestId("diagram-script"));
    expect((screen.getByTestId("diagram-script-text") as HTMLTextAreaElement).value).toBe("");
    await typeScript("class Car");
    await typeScript("@startuml\nclass Car\nDriver - Car : drives >\nCar *- Wheel : have 4 >\nCar -- Person : < owns\n@enduml");
    expect(drawnNodes()).toHaveLength(4);
    expect(drawnEdges()).toHaveLength(3);
    expect(canvas().textContent).toContain("drives ▸");
    expect(screen.getByTestId("diagram-script-result").textContent).toMatch(/رُسم: 4 مكوّن و3 سهم/);
    await click(within(editor()).getByRole("button", { name: /تراجع/ }));
    expect(drawnNodes()).toHaveLength(0);
  });
  it("opens with the drawing written as text; editing the text edits the drawing; what cannot be read is named with its line", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "sequence" } });
    await tick();
    await click(screen.getByTestId("diagram-example"));
    const before = drawnEdges().length;
    await click(screen.getByTestId("diagram-script"));
    const area = screen.getByTestId("diagram-script-text") as HTMLTextAreaElement;
    expect(area.value).toMatch(/^@startuml\nactor المستخدم\nparticipant ":LoginPage" as P2/);
    await typeScript(area.value.replace("@enduml", "المستخدم -> P2 : logout()\nهذا سطر غريب\n@enduml"));
    expect(drawnEdges()).toHaveLength(before + 1);
    expect(screen.getByTestId("diagram-script-result").textContent).toMatch(/سطر \d+لم أفهم السطر: «هذا سطر غريب»/);
  });
  it("a script of another kind takes the editor to that kind; the button is only in the five UML kinds it reads", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "class" } });
    await tick();
    await click(screen.getByTestId("diagram-script"));
    await typeScript("start\n:إدخال;\nstop");
    expect((screen.getByTestId("diagram-kind") as HTMLSelectElement).value).toBe("activity");
    expect(drawnNodes()).toHaveLength(3);
    for (const k of ["dsd", "erd", "dfd", "topology", "deployment", "object"]) {
      fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: k } });
      await tick();
      expect(screen.queryByTestId("diagram-script"), k).toBeNull();
    }
  });
});

describe("DG5 — right angles and several at once", () => {
  const svgAt = () => {
    const svg = canvas();
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 2400, height: 1600, right: 2400, bottom: 1600, x: 0, y: 0, toJSON() {} } as DOMRect);
    return svg;
  };
  const press = (svg: SVGSVGElement, id: number, x: number, y: number, o: Record<string, unknown> = {}) => {
    fireEvent.pointerDown(svg, { pointerId: id, button: 0, clientX: x, clientY: y, pointerType: "mouse", ...o });
    fireEvent.pointerUp(svg, { pointerId: id, clientX: x, clientY: y, pointerType: "mouse", ...o });
  };
  /** The drawn arrows' points, from their `d`. */
  const runs = () => [...drawnEdges()].map(g => [...g.querySelector("path")!.getAttribute("d")!.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]));
  const squared = (pts: number[][]) => pts.every((p, k) => k === 0 || p[0] === pts[k - 1][0] || p[1] === pts[k - 1][1]);
  const topLeft = (i: number) => { const r = drawnNodes()[i].querySelector("rect")!; return [Number(r.getAttribute("x")), Number(r.getAttribute("y"))]; };

  it("«بزوايا قائمة» with nothing chosen: every arrow and the new ones; with one chosen: that one; «تراجع» undoes it", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "dsd" } });
    await tick();
    await click(screen.getByTestId("diagram-example"));
    expect(runs().every(r => r.length === 2)).toBe(true);
    expect(screen.getByTestId("diagram-route-straight").getAttribute("aria-checked")).toBe("true");
    await click(screen.getByTestId("diagram-route-ortho"));
    expect(runs().every(squared)).toBe(true);
    expect(screen.getByTestId("diagram-status").textContent).toMatch(/كل الأسهم بزوايا قائمة/);
    // the file says so; a new arrow follows
    await click(screen.getByTestId("diagram-save-file"));
    const saved = parseDiagram(await downloads.at(-1)!.blob.text());
    expect(saved.ok && saved.doc.edges.every(e => e.route === "ortho")).toBe(true);
    await click(within(editor()).getByRole("button", { name: /تراجع/ }));
    expect(runs().every(r => r.length === 2)).toBe(true);
    // one arrow, from its own properties
    fireEvent.change(screen.getByTestId("diagram-pick"), { target: { value: "edge:" + drawnEdges()[0].getAttribute("data-edge") } });
    await tick();
    await click(screen.getByTestId("diagram-edge-route-ortho"));
    // (these tables face each other: a right-angled arrow between them is one straight run, so the file tells)
    await click(screen.getByTestId("diagram-save-file"));
    const one = parseDiagram(await downloads.at(-1)!.blob.text());
    expect(one.ok && one.doc.edges.map(e => e.route ?? "")).toEqual(["ortho", "", ""]);
    expect(screen.getByTestId("diagram-route-ortho").getAttribute("aria-checked")).toBe("true");
  });

  it("a sequence diagram offers no line shape", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "sequence" } });
    await tick();
    expect(screen.queryByTestId("diagram-route")).toBeNull();
  });

  it("Shift + press chooses several; dragging one moves them all; one «حذف المحدَّد»; «تراجع» brings them back", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "dsd" } });
    await tick();
    await click(screen.getByTestId("diagram-example"));
    const svg = svgAt();
    const [a, b] = [topLeft(0), topLeft(1)];
    press(svg, 1, a[0] + 20, a[1] + 15);
    press(svg, 2, b[0] + 20, b[1] + 15, { shiftKey: true });
    await tick();
    expect(screen.getByTestId("diagram-many-props").textContent).toMatch(/المحدَّد: 2 مكوّن/);
    expect(canvas().querySelectorAll("[data-testid='diagram-many'] [data-selected]")).toHaveLength(2);
    fireEvent.pointerDown(svg, { pointerId: 3, button: 0, clientX: a[0] + 20, clientY: a[1] + 15, pointerType: "mouse" });
    fireEvent.pointerMove(svg, { pointerId: 3, clientX: a[0] + 120, clientY: a[1] + 65, pointerType: "mouse" });
    fireEvent.pointerUp(svg, { pointerId: 3, clientX: a[0] + 120, clientY: a[1] + 65, pointerType: "mouse" });
    await tick();
    expect([topLeft(0), topLeft(1)]).toEqual([[a[0] + 100, a[1] + 50], [b[0] + 100, b[1] + 50]]);
    expect(topLeft(2)).not.toEqual([a[0] + 100, a[1] + 50]);
    // Shift + press on a chosen one takes it out
    press(svg, 4, a[0] + 120, a[1] + 65, { shiftKey: true });
    await tick();
    expect(screen.getByTestId("diagram-node-props")).toBeTruthy();
    press(svg, 5, a[0] + 120, a[1] + 65, { shiftKey: true });
    await tick();
    await click(screen.getByTestId("diagram-delete"));
    expect(drawnNodes()).toHaveLength(2);
    await click(within(editor()).getByRole("button", { name: /تراجع/ }));
    expect(drawnNodes()).toHaveLength(4);
  });

  it("a rectangle on the empty paper takes what lies inside it, with the arrows between; Ctrl+A everything; arrows move them; Delete", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "dsd" } });
    await tick();
    await click(screen.getByTestId("diagram-example"));
    const svg = svgAt();
    fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: 5, clientY: 5, pointerType: "mouse" });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 900, clientY: 300, pointerType: "mouse" });
    expect(canvas().querySelector("[data-testid='diagram-box']")).toBeTruthy();
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 900, clientY: 300, pointerType: "mouse" });
    await tick();
    expect(canvas().querySelector("[data-testid='diagram-box']")).toBeNull();
    expect(screen.getByTestId("diagram-many-props").textContent).toMatch(/المحدَّد: 2 مكوّن، 1 سهم/);
    fireEvent.keyDown(svg, { key: "a", ctrlKey: true });
    await tick();
    expect(screen.getByTestId("diagram-many-props").textContent).toMatch(/المحدَّد: 4 مكوّن، 3 سهم/);
    const before = [0, 1, 2, 3].map(topLeft);
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    fireEvent.keyDown(svg, { key: "ArrowDown", shiftKey: true });
    await tick();
    expect([0, 1, 2, 3].map(topLeft)).toEqual(before.map(([x, y]) => [x + 10, y + 50]));
    // the two key presses are one «تراجع»
    await click(within(editor()).getByRole("button", { name: /تراجع/ }));
    expect([0, 1, 2, 3].map(topLeft)).toEqual(before);
    fireEvent.keyDown(svg, { key: "a", ctrlKey: true });
    await tick();
    fireEvent.keyDown(svg, { key: "Delete" });
    await tick();
    expect(drawnNodes()).toHaveLength(0);
  });

  it("«تحديد عدّة» (a finger): each press adds or takes out; the chosen are lined up and copied with their arrow", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "dsd" } });
    await tick();
    await click(screen.getByTestId("diagram-example"));
    await click(screen.getByTestId("diagram-multi"));
    expect(screen.getByTestId("diagram-multi").getAttribute("aria-pressed")).toBe("true");
    const svg = svgAt();
    const [a, b] = [topLeft(0), topLeft(1)];
    fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: a[0] + 20, clientY: a[1] + 15, pointerType: "touch" });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: a[0] + 20, clientY: a[1] + 15, pointerType: "touch" });
    fireEvent.pointerDown(svg, { pointerId: 2, button: 0, clientX: b[0] + 20, clientY: b[1] + 15, pointerType: "touch" });
    fireEvent.pointerUp(svg, { pointerId: 2, clientX: b[0] + 20, clientY: b[1] + 15, pointerType: "touch" });
    await tick();
    expect(screen.getByTestId("diagram-many-props").textContent).toMatch(/المحدَّد: 2 مكوّن/);
    await click(screen.getByTestId("diagram-align-top"));
    expect(topLeft(0)[1]).toBe(topLeft(1)[1]);
    const edges = drawnEdges().length;
    await click(screen.getByTestId("diagram-many-copy"));
    expect(drawnNodes()).toHaveLength(6);
    expect(drawnEdges().length).toBe(edges + 1);   // Classes → Students is between them
    expect(screen.getByTestId("diagram-many-props").textContent).toMatch(/المحدَّد: 2 مكوّن، 1 سهم/);
  });
});

describe("DG5 — the sheet keeps the keyboard", () => {
  it("a press on a component gives the sheet the keys; after «حذف» they stay with it (so Ctrl+Z still undoes)", async () => {
    render(<DiagramEditorTool />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "erd" } });
    await tick();
    await click(screen.getByRole("button", { name: "أضف: كيان" }));
    const svg = canvas();
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 2400, height: 1600, right: 2400, bottom: 1600, x: 0, y: 0, toJSON() {} } as DOMRect);
    const sheet = svg.parentElement!;
    const r = drawnNodes()[0].querySelector("rect")!;
    const [x, y] = [Number(r.getAttribute("x")) + 10, Number(r.getAttribute("y")) + 10];
    fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: x, clientY: y, pointerType: "mouse" });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: x, clientY: y, pointerType: "mouse" });
    await tick();
    expect(document.activeElement).toBe(sheet);
    const del = screen.getByTestId("diagram-delete");
    del.focus();
    await click(del);
    expect(drawnNodes()).toHaveLength(0);
    expect(document.activeElement).toBe(sheet);
    fireEvent.keyDown(document.activeElement!, { key: "z", ctrlKey: true });
    await tick();
    expect(drawnNodes()).toHaveLength(1);
  });
});

describe("DG6 — «مخطط التدفّق»", () => {
  it("listed under «البرمجة»; its example draws with right angles and «افحص المخطط» finds nothing; a decision with one way out is named", async () => {
    render(<DiagramEditorTool />);
    const kind = screen.getByTestId("diagram-kind") as HTMLSelectElement;
    const group = [...kind.querySelectorAll("optgroup")].find(g => g.label === "البرمجة")!;
    expect([...group.querySelectorAll("option")].map(o => o.value)).toEqual(["flowchart"]);
    fireEvent.change(kind, { target: { value: "flowchart" } });
    await tick();
    expect([...screen.getByRole("complementary", { name: "المكوّنات والأسهم" }).querySelectorAll(".dgm-pal-btn")].map(b => b.getAttribute("aria-label")))
      .toEqual(["أضف: بداية", "أضف: إدخال / إخراج", "أضف: معالجة", "أضف: قرار", "أضف: دالة جاهزة", "أضف: موصل", "أضف: نهاية", "أضف: ملاحظة"]);
    await click(screen.getByTestId("diagram-example"));
    expect(drawnNodes()).toHaveLength(7);
    expect(screen.getByTestId("diagram-route-ortho").getAttribute("aria-checked")).toBe("true");
    await click(screen.getByTestId("diagram-check"));
    expect(screen.getByTestId("diagram-check-panel").textContent).toMatch(/لا ملاحظات/);
    // take away «لا»: the decision is left with one way out
    const no = [...drawnEdges()].find(g => g.textContent?.includes("لا"))!.getAttribute("data-edge")!;
    fireEvent.change(screen.getByTestId("diagram-pick"), { target: { value: "edge:" + no } });
    await tick();
    await click(screen.getByTestId("diagram-delete"));
    expect(screen.getByTestId("diagram-check-panel").textContent).toMatch(/يخرج من قرار «avg >= 50 ؟» سهمان: «نعم» و«لا»/);
  });
});

describe("DG7 — «من مختبر الشبكات»", () => {
  const LAB_KEY = "eb.networkLab.draft.v1";
  const labFile = () => {
    // R1 — SW1 — PC1, with the router's address set
    const devices = [{ id: "r1", kind: "router", label: "R1", x: 0.5, y: 0.1 }, { id: "sw1", kind: "switch", label: "SW1", x: 0.5, y: 0.45 }, { id: "pc1", kind: "pc", label: "PC1", x: 0.3, y: 0.8 }];
    const links = [{ id: "l1", a: { deviceId: "r1", port: "g0/0" }, b: { deviceId: "sw1", port: "g0/1" } }, { id: "l2", a: { deviceId: "sw1", port: "f0/1" }, b: { deviceId: "pc1", port: "eth0" } }];
    const actions = ["enable", "configure terminal", "interface g0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "end"].map(command => ({ type: "router.command", deviceId: "r1", command }));
    return serializeLab({ config: { v: 2, devices, links } as Parameters<typeof serializeLab>[0]["config"], actions });
  };

  it("only a topology offers it; the lab's draft on this device is drawn — one «تراجع» brings the old drawing back", async () => {
    localStorage.setItem(LAB_KEY, labFile());
    render(<DiagramEditorTool labDraftKey={LAB_KEY} />);
    expect(screen.queryByTestId("diagram-from-lab")).toBeNull();
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "topology" } });
    await tick();
    await click(screen.getByTestId("diagram-example"));
    const before = drawnNodes().length;
    await click(screen.getByTestId("diagram-from-lab"));
    expect(screen.getByTestId("diagram-lab-draft-info").textContent).toMatch(/3 أجهزة و2 كوابل/);
    await click(screen.getByTestId("diagram-lab-draft"));
    await waitFor(() => expect(drawnNodes()).toHaveLength(3), { timeout: 4000 });
    expect(canvas().textContent).toContain("G0/0: 192.168.1.1/24");
    expect(screen.getByTestId("diagram-lab-result").textContent).toMatch(/رُسمت الشبكة: 3 أجهزة و2 كوابل/);
    await click(within(editor()).getByRole("button", { name: /تراجع/ }));
    expect(drawnNodes()).toHaveLength(before);
  });

  it("with no draft, a saved lab file is opened; a broken file is refused and nothing is drawn", async () => {
    render(<DiagramEditorTool labDraftKey={LAB_KEY} />);
    fireEvent.change(screen.getByTestId("diagram-kind"), { target: { value: "topology" } });
    await tick();
    await click(screen.getByTestId("diagram-from-lab"));
    expect(screen.queryByTestId("diagram-lab-draft")).toBeNull();
    const input = screen.getByTestId("diagram-lab-file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["{\"broken\": true}"], "x.json", { type: "application/json" })] } });
    await waitFor(() => expect(screen.getByTestId("diagram-lab-result").textContent).toBeTruthy(), { timeout: 4000 });
    expect(drawnNodes()).toHaveLength(0);
    fireEvent.change(input, { target: { files: [new File([labFile()], "network-lab.json", { type: "application/json" })] } });
    await waitFor(() => expect(drawnNodes()).toHaveLength(3), { timeout: 4000 });
  });

  it("in a book whose tool bar offers both, the lab's «ارسمها في محرّر المخططات» opens the editor with the network drawn", async () => {
    render(<StudentToolDock studentTools={{ version: 1, tools: [{ id: "networkLab" }, { id: "diagramEditor" }] }} labHandoff />);
    await click(screen.getByTestId("student-tools-button"));
    await click(screen.getByRole("button", { name: "مختبر الشبكات" }));
    await screen.findByTestId("network-lab", {}, { timeout: 4000 });
    fireEvent.change(screen.getByTestId("network-lab-example"), { target: { value: "dhcp" } });
    await tick();
    await click(screen.getByTestId("network-lab-to-diagram"));
    await screen.findByTestId("diagram-editor", {}, { timeout: 4000 });
    await waitFor(() => expect(drawnNodes()).toHaveLength(4), { timeout: 4000 });
    expect((screen.getByTestId("diagram-kind") as HTMLSelectElement).value).toBe("topology");
    expect(screen.getByTestId("diagram-status").textContent).toMatch(/رُسمت الشبكة: 4 أجهزة و3 كوابل/);
    expect(screen.getByTestId("tool-panel-diagramEditor").hidden).toBe(false);
  });

  it("a tool bar without the diagram editor offers no such button", async () => {
    render(<StudentToolDock studentTools={{ version: 1, tools: [{ id: "networkLab" }] }} labHandoff />);
    await click(screen.getByTestId("student-tools-button"));
    await click(screen.getByRole("button", { name: "مختبر الشبكات" }));
    await screen.findByTestId("network-lab", {}, { timeout: 4000 });
    fireEvent.change(screen.getByTestId("network-lab-example"), { target: { value: "dhcp" } });
    await tick();
    expect(screen.queryByTestId("network-lab-to-diagram")).toBeNull();
  });
});
