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
  it("renders nothing without tools, for a malformed spec, or when no enabled tool has a UI yet", () => {
    for (const v of [undefined, null, { version: 1, tools: [] }, { ...SPEC, smuggled: 1 }, { version: 1, tools: [{ id: "baseConverter", bases: [2, 10], showSteps: false }] }]) {
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
