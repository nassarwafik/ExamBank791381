// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, within } from "@testing-library/react";
import StudentToolsEditor from "./StudentToolsEditor";
import { validateStudentTools, type StudentToolsSpecV1 } from "./studentToolsSpec";

afterEach(cleanup);
const SECTIONS = [{ id: "s1", title: "الحساب" }, { id: "s2", title: "الحساب الذهني" }];
const mount = (value: unknown, sections = SECTIONS) => {
  const onChange = vi.fn<(next: StudentToolsSpecV1 | undefined) => void>();
  const r = render(<StudentToolsEditor value={value} sections={sections} onChange={onChange} />);
  return { ...r, onChange, last: () => onChange.mock.calls.at(-1)?.[0] };
};
const toolBox = (label: string) => screen.getByRole("checkbox", { name: label });

describe("T2 — Builder «أدوات الطالب» panel", () => {
  it("switching a tool on emits its canonical default spec", () => {
    const m = mount(undefined);
    fireEvent.click(toolBox("آلة حاسبة"));
    expect(m.last()).toEqual({ version: 1, tools: [{ id: "calculator", variant: "scientific", angleUnit: "deg" }] });
  });

  it("tools without a student UI yet cannot be switched on", () => {
    mount(undefined);
    expect((screen.getByRole("checkbox", { name: "محوّل أنظمة العدّ قريبًا" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("checkbox", { name: "راسم الدوال قريبًا" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getAllByText("قريبًا")).toHaveLength(2);
  });

  it("keeps tools in contract order and edits their options", () => {
    const m = mount({ version: 1, tools: [{ id: "ipv4Calculator", showBinary: true, allowSubnetting: false }] });
    expect(screen.getByText(/تحلّ أسئلة عنوان الشبكة/)).toBeTruthy();           // the answer-risk note of an enabled tool
    fireEvent.click(toolBox("آلة حاسبة"));
    expect(m.last()!.tools.map(t => t.id)).toEqual(["calculator", "ipv4Calculator"]);
    m.rerender(<StudentToolsEditor value={m.last()} sections={SECTIONS} onChange={m.onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "نوع الآلة" }), { target: { value: "basic" } });
    expect(m.last()!.tools[0]).toEqual({ id: "calculator", variant: "basic", angleUnit: "deg" });
    fireEvent.click(toolBox("السماح بتقسيم الشبكات"));
    expect(m.last()!.tools.find(t => t.id === "ipv4Calculator")).toEqual({ id: "ipv4Calculator", showBinary: true, allowSubnetting: true });
  });

  it("switches a tool off for one section, and back on", () => {
    const spec = { version: 1, tools: [{ id: "calculator", variant: "scientific", angleUnit: "deg" }] };
    const m = mount(spec);
    fireEvent.click(screen.getByText("الأدوات في كل قسم"));
    fireEvent.click(screen.getByRole("checkbox", { name: "آلة حاسبة في الحساب الذهني" }));
    expect(m.last()).toEqual({ ...spec, sectionOverrides: { s2: { disabled: ["calculator"] } } });
    m.rerender(<StudentToolsEditor value={m.last()} sections={SECTIONS} onChange={m.onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "آلة حاسبة في الحساب الذهني" }));
    expect(m.last()).toEqual(spec);
  });

  it("switching the last tool off removes the setting entirely; a tool's section overrides go with it", () => {
    const m = mount({ version: 1, tools: [{ id: "calculator", variant: "basic", angleUnit: "deg" }, { id: "ipv4Calculator", showBinary: false, allowSubnetting: false }], sectionOverrides: { s2: { disabled: ["calculator"] } } });
    fireEvent.click(toolBox("آلة حاسبة"));
    expect(m.last()).toEqual({ version: 1, tools: [{ id: "ipv4Calculator", showBinary: false, allowSubnetting: false }] });
    m.rerender(<StudentToolsEditor value={m.last()} sections={SECTIONS} onChange={m.onChange} />);
    fireEvent.click(toolBox("حاسبة الشبكات IPv4"));
    expect(m.onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("every emitted value is valid", () => {
    const m = mount(undefined);
    fireEvent.click(toolBox("آلة حاسبة"));
    fireEvent.click(toolBox("حاسبة الشبكات IPv4"));
    for (const [v] of m.onChange.mock.calls) if (v) expect(validateStudentTools(v).ok).toBe(true);
  });

  it("an invalid stored value is reported and can be removed", () => {
    const m = mount({ version: 1, tools: [{ id: "chatbot" }] });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/غير صالحة/);
    fireEvent.click(within(alert).getByRole("button", { name: "إزالة الإعدادات غير الصالحة" }));
    expect(m.onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("an override of a deleted section is reported and pruned", () => {
    const m = mount({ version: 1, tools: [{ id: "calculator", variant: "basic", angleUnit: "deg" }], sectionOverrides: { gone: { disabled: ["calculator"] } } });
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "تنظيف التخصيص" }));
    expect(m.last()).toEqual({ version: 1, tools: [{ id: "calculator", variant: "basic", angleUnit: "deg" }] });
  });

  it("a one-section exam has no per-section table", () => {
    mount({ version: 1, tools: [{ id: "calculator", variant: "basic", angleUnit: "deg" }] }, [SECTIONS[0]]);
    expect(screen.queryByText("الأدوات في كل قسم")).toBeNull();
  });
});
