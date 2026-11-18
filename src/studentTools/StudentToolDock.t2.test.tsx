// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen, within, act } from "@testing-library/react";
import StudentToolDock from "./StudentToolDock";
import ToolDockBoundary from "./ToolDockBoundary";

const SPEC = {
  version: 1,
  tools: [
    { id: "calculator", variant: "scientific", angleUnit: "deg" },
    { id: "ipv4Calculator", showBinary: true, allowSubnetting: true }
  ],
  sectionOverrides: { mental: { disabled: ["calculator"] } }
};

afterEach(cleanup);
const openTools = () => fireEvent.click(screen.getByTestId("student-tools-button"));
const pick = (name: string) => fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name }));
const press = (panel: HTMLElement, ...labels: string[]) => { for (const l of labels) fireEvent.click(within(panel).getByRole("button", { name: l })); };

describe("T2 — the student tool dock", () => {
  it("renders nothing without tools or for a malformed spec", () => {
    for (const v of [undefined, null, { version: 1, tools: [] }, { ...SPEC, smuggled: 1 }]) {
      const r = render(<StudentToolDock studentTools={v} sectionId="s1" />);
      expect(r.container.innerHTML).toBe("");
      r.unmount();
    }
  });

  it("lists only the tools enabled for the current section", () => {
    const r = render(<StudentToolDock studentTools={SPEC} sectionId="s1" />);
    openTools();
    const menu = screen.getByRole("group", { name: "الأدوات المسموحة" });
    expect(within(menu).getAllByRole("button").map(b => b.textContent)).toEqual(["آلة حاسبة علمية", "حاسبة الشبكات IPv4"]);
    r.rerender(<StudentToolDock studentTools={SPEC} sectionId="mental" />);
    expect(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getAllByRole("button").map(b => b.textContent)).toEqual(["حاسبة الشبكات IPv4"]);
  });

  it("computes with the keypad, keeps its state when closed and reopened, and Ans uses the last result", () => {
    render(<StudentToolDock studentTools={SPEC} sectionId="s1" />);
    openTools(); pick("آلة حاسبة علمية");
    const panel = screen.getByRole("dialog", { name: "آلة حاسبة علمية" });
    press(panel, "2", "جمع", "3", "ضرب", "4", "احسب");
    expect(within(panel).getByTestId("calc-result").textContent).toBe("= 14");
    fireEvent.click(within(panel).getByRole("button", { name: "إغلاق آلة حاسبة علمية" }));
    expect(screen.getByTestId("tool-panel-calculator").hidden).toBe(true);
    openTools(); pick("آلة حاسبة علمية");
    const again = screen.getByRole("dialog", { name: "آلة حاسبة علمية" });
    expect(within(again).getByTestId("calc-result").textContent).toBe("= 14");
    press(again, "مسح الكل", "الناتج السابق", "قسمة", "7", "احسب");
    expect(within(again).getByTestId("calc-result").textContent).toBe("= 2");
  });

  it("evaluates a typed expression with Enter in the teacher's angle unit, and shows errors in Arabic", () => {
    render(<StudentToolDock studentTools={SPEC} sectionId="s1" />);
    openTools(); pick("آلة حاسبة علمية");
    const panel = screen.getByRole("dialog", { name: "آلة حاسبة علمية" });
    const input = within(panel).getByLabelText("العملية") as HTMLInputElement;
    expect(input.dir).toBe("ltr");
    fireEvent.change(input, { target: { value: "sin(30)+√16" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(within(panel).getByTestId("calc-result").textContent).toBe("= 4.5");
    fireEvent.change(input, { target: { value: "1/0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(within(panel).getByTestId("calc-result").textContent).toBe("لا يمكن القسمة على صفر.");
    expect(within(panel).getByText(/السجل/)).toBeTruthy();
  });

  it("the basic calculator has no scientific keys and refuses powers", () => {
    render(<StudentToolDock studentTools={{ version: 1, tools: [{ id: "calculator", variant: "basic", angleUnit: "deg" }] }} />);
    openTools(); pick("آلة حاسبة");
    const panel = screen.getByRole("dialog", { name: "آلة حاسبة" });
    expect(within(panel).queryByRole("group", { name: "الدوال العلمية" })).toBeNull();
    const input = within(panel).getByLabelText("العملية");
    fireEvent.change(input, { target: { value: "2^3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(within(panel).getByTestId("calc-result").textContent).toMatch(/غير متاحة في الآلة الحاسبة البسيطة/);
  });

  it("moving into a section that disables the open tool closes it; its state returns where it is allowed", () => {
    const r = render(<StudentToolDock studentTools={SPEC} sectionId="s1" />);
    openTools(); pick("آلة حاسبة علمية");
    press(screen.getByRole("dialog", { name: "آلة حاسبة علمية" }), "9", "احسب");
    r.rerender(<StudentToolDock studentTools={SPEC} sectionId="mental" />);
    expect(screen.queryByRole("dialog", { name: "آلة حاسبة علمية" })).toBeNull();
    r.rerender(<StudentToolDock studentTools={SPEC} sectionId="s2" />);
    openTools(); pick("آلة حاسبة علمية");
    expect(within(screen.getByRole("dialog", { name: "آلة حاسبة علمية" })).getByTestId("calc-result").textContent).toBe("= 9");
  });

  it("Escape closes the panel and returns focus to the tools button", () => {
    render(<StudentToolDock studentTools={SPEC} sectionId="s1" />);
    openTools(); pick("آلة حاسبة علمية");
    const panel = screen.getByRole("dialog", { name: "آلة حاسبة علمية" });
    expect(panel.getAttribute("aria-modal")).toBe("false");
    fireEvent.keyDown(within(panel).getByLabelText("العملية"), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "آلة حاسبة علمية" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("student-tools-button"));
  });
});

describe("T2 — the IPv4 calculator panel", () => {
  it("analyses an address, shows the binary form and splits the network", () => {
    render(<StudentToolDock studentTools={SPEC} sectionId="s1" />);
    openTools(); pick("حاسبة الشبكات IPv4");
    const panel = screen.getByRole("dialog", { name: "حاسبة الشبكات IPv4" });
    const input = within(panel).getByLabelText("العنوان مع البادئة أو القناع");
    fireEvent.change(input, { target: { value: "192.168.1.10/24" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const result = within(panel).getByTestId("ipv4-result");
    expect(result.textContent).toContain("192.168.1.0");
    expect(result.textContent).toContain("192.168.1.255");
    expect(result.textContent).toContain("254");
    expect(within(result).getByText("الشكل الثنائي")).toBeTruthy();
    fireEvent.click(within(panel).getByLabelText("عدد الشبكات الفرعية"));
    fireEvent.change(within(panel).getByRole("textbox", { name: "عدد الشبكات الفرعية" }), { target: { value: "4" } });
    fireEvent.click(within(panel).getByRole("button", { name: "قسّم" }));
    const split = within(panel).getByTestId("ipv4-split");
    expect(within(split).getAllByRole("row")).toHaveLength(5);
    expect(split.textContent).toContain("192.168.1.192");
  });

  it("explains an invalid address in Arabic", () => {
    render(<StudentToolDock studentTools={SPEC} sectionId="s1" />);
    openTools(); pick("حاسبة الشبكات IPv4");
    const panel = screen.getByRole("dialog", { name: "حاسبة الشبكات IPv4" });
    fireEvent.change(within(panel).getByLabelText("العنوان مع البادئة أو القناع"), { target: { value: "300.1.1.1/24" } });
    fireEvent.click(within(panel).getByRole("button", { name: "احسب" }));
    expect(within(panel).getByRole("alert").textContent).toMatch(/العنوان غير صالح/);
  });

  it("hides the binary view and the subnet split when the teacher turned them off", () => {
    render(<StudentToolDock studentTools={{ version: 1, tools: [{ id: "ipv4Calculator", showBinary: false, allowSubnetting: false }] }} />);
    openTools(); pick("حاسبة الشبكات IPv4");
    const panel = screen.getByRole("dialog", { name: "حاسبة الشبكات IPv4" });
    fireEvent.change(within(panel).getByLabelText("العنوان مع البادئة أو القناع"), { target: { value: "10.0.0.1/8" } });
    fireEvent.click(within(panel).getByRole("button", { name: "احسب" }));
    expect(within(panel).queryByText("الشكل الثنائي")).toBeNull();
    expect(within(panel).queryByText("تقسيم الشبكة")).toBeNull();
  });
});

describe("T2 — containment", () => {
  it("a failing dock is replaced by a quiet note; nothing escapes the boundary", () => {
    const Boom = () => { throw new Error("chunk failed"); };
    const err = console.error; console.error = () => {};
    try {
      act(() => { render(<div><p>السؤال</p><ToolDockBoundary><Boom /></ToolDockBoundary></div>); });
    } finally { console.error = err; }
    expect(screen.getByText("السؤال")).toBeTruthy();
    expect(screen.getByTestId("tools-unavailable").textContent).toMatch(/متابعة الإجابة/);
  });
});

describe("T3 — the base converter panel", () => {
  const CONV = { version: 1, tools: [{ id: "baseConverter", bases: [2, 10, 16], showSteps: true }] };
  it("converts from the chosen base into every other allowed base, with steps", () => {
    render(<StudentToolDock studentTools={CONV} />);
    openTools(); pick("محوّل أنظمة العدّ");
    const panel = screen.getByRole("dialog", { name: "محوّل أنظمة العدّ" });
    expect((within(panel).getByLabelText("من النظام") as HTMLSelectElement).value).toBe("10");
    expect(within(panel).queryByRole("option", { name: /الثماني/ })).toBeNull();
    const input = within(panel).getByLabelText("العدد");
    fireEvent.change(input, { target: { value: "45" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const result = within(panel).getByTestId("base-result");
    expect(result.textContent).toContain("0010 1101");
    expect(result.textContent).toContain("2D");
    expect(within(panel).getByTestId("base-steps").textContent).toMatch(/نقسم على 2/);
    fireEvent.click(within(panel).getByLabelText("إلى الست عشري"));
    expect(within(panel).getByTestId("base-steps").textContent).toMatch(/نقسم على 16/);
  });
  it("explains an invalid digit, and hides the steps when the teacher did not allow them", () => {
    render(<StudentToolDock studentTools={{ version: 1, tools: [{ id: "baseConverter", bases: [2, 10], showSteps: false }] }} />);
    openTools(); pick("محوّل أنظمة العدّ");
    const panel = screen.getByRole("dialog", { name: "محوّل أنظمة العدّ" });
    fireEvent.change(within(panel).getByLabelText("من النظام"), { target: { value: "2" } });
    fireEvent.change(within(panel).getByLabelText("العدد"), { target: { value: "1021" } });
    fireEvent.click(within(panel).getByRole("button", { name: "حوّل" }));
    expect(within(panel).getByRole("alert").textContent).toMatch(/«2» غير مسموح/);
    fireEvent.change(within(panel).getByLabelText("العدد"), { target: { value: "1101" } });
    fireEvent.click(within(panel).getByRole("button", { name: "حوّل" }));
    expect(within(panel).getByTestId("base-result").textContent).toContain("13");
    expect(within(panel).queryByTestId("base-steps")).toBeNull();
  });
});

describe("T3 — dragging the panel", () => {
  it("moves the open panel by its header, never past the viewport, and «إعادة الموضع» puts it back", () => {
    render(<StudentToolDock studentTools={SPEC} sectionId="s1" />);
    openTools(); pick("آلة حاسبة علمية");
    const panel = screen.getByTestId("tool-panel-calculator");
    panel.getBoundingClientRect = () => ({ left: 600, right: 960, top: 300, bottom: 700, width: 360, height: 400, x: 600, y: 300, toJSON: () => ({}) });
    const head = within(panel).getByRole("heading", { name: "آلة حاسبة علمية" }).parentElement!;
    fireEvent.pointerDown(head, { button: 0, pointerId: 1, clientX: 700, clientY: 320 });
    fireEvent.pointerMove(head, { pointerId: 1, clientX: 600, clientY: 270 });
    expect(panel.style.transform).toBe("translate(-100px, -50px)");
    fireEvent.pointerMove(head, { pointerId: 1, clientX: -5000, clientY: -5000 });
    expect(panel.style.transform).toBe("translate(-600px, -300px)");             // clamped at the viewport's top-left corner
    fireEvent.pointerUp(head, { pointerId: 1 });
    fireEvent.pointerMove(head, { pointerId: 1, clientX: 900, clientY: 900 });
    expect(panel.style.transform).toBe("translate(-600px, -300px)");             // no drag after release
    fireEvent.click(within(panel).getByRole("button", { name: "إعادة النافذة إلى موضعها" }));
    expect(panel.style.transform).toBe("");
  });
  it("pressing the close button does not start a drag", () => {
    render(<StudentToolDock studentTools={SPEC} sectionId="s1" />);
    openTools(); pick("آلة حاسبة علمية");
    const panel = screen.getByTestId("tool-panel-calculator");
    const close = within(panel).getByRole("button", { name: "إغلاق آلة حاسبة علمية" });
    fireEvent.pointerDown(close, { button: 0, pointerId: 2, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(close, { pointerId: 2, clientX: 200, clientY: 200 });
    expect(panel.style.transform).toBe("");
  });
});

describe("T4 — the function plotter panel", () => {
  const PLOT = { version: 1, tools: [{ id: "graphPlotter", maxFunctions: 2, showAnalysis: true }] };
  it("offers the teacher's number of functions, draws them, marks the analysis and reads values at a point", async () => {
    render(<StudentToolDock studentTools={PLOT} />);
    openTools(); pick("راسم الدوال");
    const panel = screen.getByRole("dialog", { name: "راسم الدوال" });
    const f = await within(panel).findByLabelText("f(x) =");
    expect(within(panel).getByLabelText("g(x) =")).toBeTruthy();
    expect(within(panel).queryByLabelText("h(x) =")).toBeNull();
    fireEvent.change(f, { target: { value: "x^2 - 4" } });
    fireEvent.change(within(panel).getByLabelText("g(x) ="), { target: { value: "x + 2" } });
    fireEvent.click(within(panel).getByRole("button", { name: "ارسم" }));
    const graph = await within(panel).findByTestId("plot-graph");
    expect(graph.querySelector("svg")).toBeTruthy();
    expect(graph.textContent).toContain("تقاطع f و g (3، 5)");
    fireEvent.change(within(panel).getByLabelText(/القيمة عند/), { target: { value: "3" } });
    fireEvent.click(within(panel).getByRole("button", { name: "احسب" }));
    expect(within(panel).getByTestId("plot-values").textContent).toMatch(/f\(x\).*5.*g\(x\).*5/);
  });
  it("shows the engine's message under the faulty field and draws nothing", async () => {
    render(<StudentToolDock studentTools={PLOT} />);
    openTools(); pick("راسم الدوال");
    const panel = screen.getByRole("dialog", { name: "راسم الدوال" });
    fireEvent.change(await within(panel).findByLabelText("f(x) ="), { target: { value: "y + 1" } });
    fireEvent.click(within(panel).getByRole("button", { name: "ارسم" }));
    expect(within(panel).getByRole("alert").textContent).toMatch(/y/);
    expect(within(panel).queryByTestId("plot-graph")).toBeNull();
  });
  it("without analysis no feature labels are drawn", async () => {
    render(<StudentToolDock studentTools={{ version: 1, tools: [{ id: "graphPlotter", maxFunctions: 1, showAnalysis: false }] }} />);
    openTools(); pick("راسم الدوال");
    const panel = screen.getByRole("dialog", { name: "راسم الدوال" });
    fireEvent.change(await within(panel).findByLabelText("f(x) ="), { target: { value: "x^2 - 4" } });
    fireEvent.click(within(panel).getByRole("button", { name: "ارسم" }));
    const graph = await within(panel).findByTestId("plot-graph");
    expect(graph.textContent).not.toMatch(/جذر|تقاطع|قيمة صغرى/);
  });
});

describe("T5 — the formula sheet and the scratch pad panels", () => {
  const T5 = { version: 1, tools: [
    { id: "formulaSheet", title: "قوانين الحركة", content: { schemaVersion: 1, blocks: [{ type: "heading", level: 2, runs: [{ text: "الحركة المنتظمة" }] }, { type: "table", columnHeaders: ["الثابت", "القيمة"], rows: [["g", "9.8"]] }] } },
    { id: "scratchPad", drawing: true }
  ] };
  it("the sheet opens under its own title and shows the teacher's content", async () => {
    render(<StudentToolDock studentTools={T5} />);
    openTools(); pick("قوانين الحركة");
    const panel = screen.getByRole("dialog", { name: "قوانين الحركة" });
    expect(await within(panel).findByRole("heading", { name: "الحركة المنتظمة" })).toBeTruthy();
    expect(within(panel).getByRole("table").textContent).toContain("9.8");
  });
  it("the scratch pad says it is not saved, and keeps notes and drawing for the attempt", () => {
    render(<StudentToolDock studentTools={T5} />);
    openTools(); pick("ورقة مسودة");
    const panel = screen.getByRole("dialog", { name: "ورقة مسودة" });
    expect(within(panel).getByRole("note").textContent).toMatch(/لا تُحفظ ولا تُرسل ولا تُصحّح/);
    fireEvent.change(within(panel).getByLabelText("ملاحظات"), { target: { value: "x = 2" } });
    const canvas = within(panel).getByTestId("scratch-canvas");
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 30 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(within(panel).getByTestId("scratch-strokes").textContent).toBe("عدد الخطوط: 1");
    fireEvent.click(within(panel).getByRole("button", { name: "إغلاق ورقة مسودة" }));
    openTools(); pick("ورقة مسودة");
    const again = screen.getByRole("dialog", { name: "ورقة مسودة" });
    expect((within(again).getByLabelText("ملاحظات") as HTMLTextAreaElement).value).toBe("x = 2");
    expect(within(again).getByTestId("scratch-strokes").textContent).toBe("عدد الخطوط: 1");
    const canvas2 = within(again).getByTestId("scratch-canvas");
    fireEvent.pointerDown(canvas2, { button: 0, pointerId: 2, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(canvas2, { pointerId: 2 });
    expect(within(again).getByTestId("scratch-strokes").textContent).toBe("عدد الخطوط: 2");
    fireEvent.click(within(again).getByRole("button", { name: "تراجع" }));
    expect(within(again).getByTestId("scratch-strokes").textContent).toBe("عدد الخطوط: 1");      // undo removes ONE stroke
    fireEvent.click(within(again).getByRole("button", { name: "مسح الرسم" }));
    expect(within(again).getByTestId("scratch-strokes").textContent).not.toMatch(/عدد الخطوط/);
  });
  it("without the drawing switch there is no canvas", () => {
    render(<StudentToolDock studentTools={{ version: 1, tools: [{ id: "scratchPad", drawing: false }] }} />);
    openTools(); pick("ورقة مسودة");
    expect(within(screen.getByRole("dialog", { name: "ورقة مسودة" })).queryByTestId("scratch-canvas")).toBeNull();
  });
});
