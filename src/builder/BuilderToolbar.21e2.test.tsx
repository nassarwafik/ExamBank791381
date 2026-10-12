// @vitest-environment happy-dom
//
// Phase 21E.2 (A) — BuilderToolbar: primary / secondary / overflow. With EVERY optional action offered, at most eight buttons
// are visible; the rest live in two labelled ActionMenus with keyboard access, Escape and focus return; icons, never emoji.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import BuilderToolbar, { type ToolbarItem } from "./BuilderToolbar";

afterEach(cleanup);
const item = (key: string, label: string, extra: Partial<ToolbarItem> = {}): ToolbarItem => ({ key, label, onSelect: vi.fn(), ...extra });
function full() {
  const addItems = [item("bank", "إضافة من بنك الأسئلة", { dialog: true }), item("ai", "سؤال بالذكاء الاصطناعي", { dialog: true }), item("scenario", "سيناريو بالذكاء الاصطناعي", { dialog: true }), item("composer", "المؤلف الذكي للامتحان", { dialog: true })];
  const moreItems = [item("nav", "مستكشف الأسئلة", { pressed: false }), item("blueprint", "مخطط الامتحان", { dialog: true, badge: "2 مشكلات" }), item("coverage", "تحليل المخطط", { dialog: true }), item("policy", "سياسات الجودة", { dialog: true }),
    item("governance", "إدارة النشر والإصدارات", { dialog: true }), item("presets", "القوالب الأكاديمية", { dialog: true }), item("studio", "العرض والتصميم", { dialog: true }), item("lab", "مختبر الدوال 3D (تجريبي)", { dialog: true }), item("readiness", "فحص الجاهزية للاعتماد", { dialog: true })];
  const props = {
    headingId: "h", heading: "محرر الامتحان: امتحان الشبكات", onExit: vi.fn(),
    history: { onUndo: vi.fn(), onRedo: vi.fn(), canUndo: true, canRedo: false, disabled: false },
    titleField: <input aria-label="عنوان الامتحان" />, stats: <span>2 أقسام</span>, status: <span role="status">✓ محفوظ</span>,
    addItems, moreItems, preview: item("preview", "معاينة الامتحان"),
    save: <><button type="button">حفظ مسودة</button><button type="button">اعتماد نهائي</button></>
  };
  return { props, addItems, moreItems };
}

describe("21E.2 A — BuilderToolbar", () => {
  it("shows at most eight buttons with every action offered, each with a real name", () => {
    const { props } = full();
    const { container } = render(<BuilderToolbar {...props} />);
    const toolbar = container.querySelector("header.sb-toolbar") as HTMLElement;
    const buttons = within(toolbar).getAllByRole("button");
    expect(buttons.map(b => b.getAttribute("aria-label") || b.textContent?.trim())).toEqual(["رجوع", "تراجع", "إعادة", "إضافة أسئلة", "معاينة الامتحان", "المزيد من أدوات الامتحان", "حفظ مسودة", "اعتماد نهائي"]);
    expect(buttons.length).toBeLessThanOrEqual(8);
    for (const b of buttons) expect(/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(b.textContent || ""), "emoji in " + b.textContent).toBe(false);
    expect(screen.getByRole("heading", { level: 2, name: "محرر الامتحان: امتحان الشبكات" }).id).toBe("h");
    expect(screen.getByRole("group", { name: "سجل التعديلات" })).toBeTruthy();
  });

  it("the add menu opens with its items, an item runs once, the menu closes and focus returns to the trigger", () => {
    const { props, addItems } = full();
    render(<BuilderToolbar {...props} />);
    const trigger = screen.getByRole("button", { name: "إضافة أسئلة" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("group", { name: "إضافة أسئلة" });
    expect(within(panel).getAllByRole("button").map(b => b.textContent)).toEqual(addItems.map(i => i.label));
    expect(within(panel).getByRole("button", { name: "إضافة من بنك الأسئلة" }).getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(within(panel).getByRole("button", { name: "سؤال بالذكاء الاصطناعي" }));
    expect(addItems[1].onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: "إضافة أسئلة" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("the overflow menu exposes toggles and badges in the accessible name; Escape closes it back to its trigger", () => {
    const { props } = full();
    render(<BuilderToolbar {...props} />);
    const trigger = screen.getByRole("button", { name: "المزيد من أدوات الامتحان" });
    fireEvent.click(trigger);
    const panel = screen.getByRole("group", { name: "المزيد من أدوات الامتحان" });
    expect(within(panel).getByRole("button", { name: "مستكشف الأسئلة" }).getAttribute("aria-pressed")).toBe("false");
    expect(within(panel).getByRole("button", { name: "مخطط الامتحان 2 مشكلات" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "المزيد من أدوات الامتحان" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("history buttons follow canUndo / canRedo / disabled; menus without items are not rendered", () => {
    const { props } = full();
    render(<BuilderToolbar {...props} addItems={[]} history={{ ...props.history, canUndo: false }} />);
    expect((screen.getByRole("button", { name: "تراجع" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "إعادة" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "إضافة أسئلة" })).toBeNull();
  });
});
