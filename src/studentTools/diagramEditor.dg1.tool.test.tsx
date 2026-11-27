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
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import DiagramEditorTool from "./DiagramEditorTool";
import StudentToolDock from "./StudentToolDock";
import { courseStudentTools } from "./courseTools";
import { parseDiagram } from "./diagramDoc";

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
