// @vitest-environment happy-dom
// Tadris+ P4-A — the console primitives: Tabs, Switch, DataTable, Stepper, DiffView (roles, names, keyboard, words not colour).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { useState } from "react";
import Tabs from "./Tabs";
import Switch from "./Switch";
import DataTable from "./DataTable";
import Stepper from "./Stepper";
import DiffView from "./DiffView";
import { diffSets } from "./diffSets";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function TabsHarness() {
  const [id, setId] = useState("a");
  return (
    <div dir="rtl">
      <Tabs label="تفاصيل المعلم" selectedId={id} onSelect={setId} tabs={[{ id: "a", label: "البيانات", content: <p>محتوى أ</p> }, { id: "b", label: "الصلاحيات", content: <p>محتوى ب</p> }, { id: "c", label: "السجل", content: <p>محتوى ج</p> }]} />
    </div>
  );
}

describe("P4-A Tabs", () => {
  it("a named tablist; one tab stop; only the selected panel, labelled by its tab", () => {
    render(<TabsHarness />);
    const list = screen.getByRole("tablist", { name: "تفاصيل المعلم" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map(t => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0].id);
    expect(panel.textContent).toBe("محتوى أ");
    expect(screen.queryByText("محتوى ب")).toBeNull();
    fireEvent.click(tabs[1]);
    expect(screen.getByRole("tabpanel").textContent).toBe("محتوى ب");
  });
  it("keyboard follows the reading direction (RTL: ArrowLeft = next), Home / End jump", () => {
    render(<TabsHarness />);
    const tabs = () => screen.getAllByRole("tab");
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ direction: "rtl" } as CSSStyleDeclaration);
    fireEvent.keyDown(tabs()[0], { key: "ArrowLeft" });
    expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs()[1]);
    fireEvent.keyDown(tabs()[1], { key: "ArrowRight" });
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs()[0], { key: "End" });
    expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs()[2], { key: "ArrowLeft" });                // wraps around
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs()[0], { key: "Home" });
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
  });
});

describe("P4-A Switch", () => {
  it("role=switch with aria-checked; the state is in words; it toggles; disabled does nothing", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch label="المراقبة" checked={false} onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: /المراقبة/ });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.textContent).toContain("متوقف");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Switch label="المراقبة" checked onChange={onChange} />);
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch").textContent).toContain("مفعّل");
    rerender(<Switch label="المراقبة" checked onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("P4-A DataTable", () => {
  type Row = { id: string; name: string; status: string };
  const columns = [{ id: "name", header: "المعلم", cell: (r: Row) => r.name }, { id: "status", header: "الحالة", cell: (r: Row) => r.status }];
  it("a captioned table: column headers, the first cell of each row is its row header", () => {
    render(<DataTable caption="المعلمون" columns={columns} rows={[{ id: "1", name: "سارة", status: "نشط" }, { id: "2", name: "عمر", status: "موقوف" }]} rowKey={r => r.id} />);
    const table = screen.getByRole("table", { name: "المعلمون" });
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["المعلم", "الحالة"]);
    expect(within(table).getAllByRole("rowheader").map(h => h.textContent)).toEqual(["سارة", "عمر"]);
    expect(within(table).getAllByRole("cell").map(c => c.textContent)).toEqual(["نشط", "موقوف"]);
  });
  it("an empty list is one row that says so", () => {
    render(<DataTable caption="المعلمون" columns={columns} rows={[]} rowKey={r => r.id} emptyText="لا يوجد معلمون." />);
    expect(screen.getByRole("cell").textContent).toBe("لا يوجد معلمون.");
    expect(screen.getByRole("cell").getAttribute("colspan")).toBe("2");
  });
});

describe("P4-A Stepper", () => {
  it("an ordered list; the current step is aria-current=step; completed steps say so in words", () => {
    render(<Stepper label="إضافة معلم" currentId="access" steps={[{ id: "details", label: "البيانات" }, { id: "access", label: "الصلاحيات" }, { id: "invite", label: "الدعوة" }]} />);
    const list = screen.getByRole("list", { name: "إضافة معلم" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0].textContent).toContain("(مكتملة)");
    expect(items[1].getAttribute("aria-current")).toBe("step");
    expect(items[2].getAttribute("aria-current")).toBeNull();
    expect(items[2].textContent).not.toContain("مكتملة");
  });
});

describe("P4-A DiffView", () => {
  it("diffSets: what is added and removed, in order", () => {
    expect(diffSets(["a", "b", "c"], ["b", "d", "a"])).toEqual({ added: ["d"], removed: ["c"] });
    expect(diffSets([], ["x"])).toEqual({ added: ["x"], removed: [] });
  });
  it("two labelled lists in words, with labels; nothing changed is said too", () => {
    const { rerender } = render(<DiffView label="التغيير" before={["a", "c"]} after={["a", "b"]} labelOf={id => "قدرة " + id} />);
    const region = screen.getByRole("region", { name: "التغيير" });
    expect(within(region).getByRole("list", { name: "ستُضاف" }).textContent).toBe("قدرة b");
    expect(within(region).getByRole("list", { name: "ستُزال" }).textContent).toBe("قدرة c");
    rerender(<DiffView label="التغيير" before={["a"]} after={["a"]} emptyText="لا تغيير." />);
    expect(screen.getByText("لا تغيير.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
