// @vitest-environment happy-dom
/// <reference types="node" />
// Phase UX-R3 — the component kit: semantics and keyboard behaviour of Card, ListRows / ListRow / RowAction, SubNav, KpiStrip,
// Segmented and Tooltip, plus the structural guards of kit.css (token-only, logical properties, 44 px targets on touch, a
// visible focus ring on every interactive part, both shells load it after ui.css).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import Card from "./Card";
import { ListRows, ListRow, RowAction } from "./ListRows";
import SubNav from "./SubNav";
import KpiStrip from "./KpiStrip";
import Segmented from "./Segmented";
import Tooltip from "./Tooltip";

const SRC = join(process.cwd(), "src");
const kit = readFileSync(join(SRC, "ui", "kit.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const flat = kit.replace(/\s+/g, " ");
afterEach(() => { cleanup(); vi.restoreAllMocks(); });   // a failed assertion never leaks a mock into the next test

describe("UX-R3 Card", () => {
  it("a titled card is a region named by its heading; the aside sits in the header; flush drops body padding", () => {
    render(<Card title="الطلاب" aside={<span>ترتيب حسب: الاسم</span>} flush><p>جسم</p></Card>);
    const region = screen.getByRole("region", { name: "الطلاب" });
    expect(within(region).getByRole("heading", { level: 2, name: "الطلاب" })).toBeTruthy();
    expect(region.querySelector(".eb-card-aside")?.textContent).toBe("ترتيب حسب: الاسم");
    expect(region.className).toContain("is-flush");
  });
  it("without a title it is a plain section (no unnamed region), and level 3 renders an h3", () => {
    const { container, rerender } = render(<Card><p>x</p></Card>);
    expect(screen.queryByRole("region")).toBeNull();
    expect(container.querySelector(".eb-card-head")).toBeNull();
    rerender(<Card title="فرعي" level={3}><p>x</p></Card>);
    expect(screen.getByRole("heading", { level: 3, name: "فرعي" })).toBeTruthy();
  });
});

describe("UX-R3 ListRows / ListRow / RowAction", () => {
  it("a named list of items; the icon is decorative; empty context / meta render nothing", () => {
    render(
      <ListRows label="الطلاب">
        <ListRow icon={<svg data-testid="ic" />} title="أحمد الحسن" context="العاشر – أ" meta="ID 1045" status={<span>نشط</span>} action={<RowAction onClick={() => {}} />} />
        <ListRow title="بسمة عودة" context="" meta={null} />
      </ListRows>
    );
    const list = screen.getByRole("list", { name: "الطلاب" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].querySelector(".eb-list-icon")?.getAttribute("aria-hidden")).toBe("true");
    expect(items[0].textContent).toContain("أحمد الحسن");
    expect(items[1].querySelector(".eb-list-context, .eb-list-meta, .eb-list-status, .eb-list-action")).toBeNull();
  });
  it("RowAction is a real button named by its visible text (default «تعديل»), its glyph hidden, wired to onClick and describedBy", () => {
    const onClick = vi.fn();
    render(<><span id="row-1">أحمد</span><RowAction onClick={onClick} describedBy="row-1" /><RowAction label="فتح" onClick={() => {}} disabled /></>);
    const edit = screen.getByRole("button", { name: "تعديل" });
    expect(edit.getAttribute("type")).toBe("button");
    expect(edit.getAttribute("aria-describedby")).toBe("row-1");
    expect(edit.querySelector(".eb-row-action-icon")?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(edit);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "فتح" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("UX-R3 SubNav", () => {
  const groups = [{ label: "الصفوف النشطة", items: [{ id: "c1", label: "العاشر – أ", count: 26, countLabel: "طالبًا" }, { id: "c2", label: "العاشر – ب", count: 25, countLabel: "طالبًا" }] }, { items: [{ id: "archive", label: "الأرشيف" }] }];
  it("a named navigation of buttons; exactly the current item carries aria-current=page; counts stay in the name", () => {
    render(<SubNav label="الصفوف" groups={groups} currentId="c2" onSelect={() => {}} />);
    const nav = screen.getByRole("navigation", { name: "الصفوف" });
    expect(within(nav).getByRole("group", { name: "الصفوف النشطة" })).toBeTruthy();
    const current = nav.querySelectorAll("[aria-current]");
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("button", { name: /العاشر – ب\s*25\s*طالبًا/ })).toBe(current[0]);
    expect(within(nav).getByRole("button", { name: "الأرشيف" })).toBeTruthy();
  });
  it("clicking an item asks the caller to select it by id", () => {
    const onSelect = vi.fn();
    render(<SubNav label="الصفوف" groups={groups} currentId="c1" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "الأرشيف" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("archive");
  });
});

describe("UX-R3 KpiStrip", () => {
  it("a description list: each value paired with its label; the hint carries the trend tone; icons are decorative", () => {
    const { container } = render(<KpiStrip label="المؤشرات الرئيسية" items={[{ label: "متوسط الصف", value: "84%", hint: "▲ 4%", trend: "up", icon: <svg /> }, { label: "نسبة التسليم", value: "96%" }]} />);
    const dl = container.querySelector("dl.eb-kpis")!;
    expect(dl.getAttribute("aria-label")).toBe("المؤشرات الرئيسية");
    expect([...dl.querySelectorAll("dt")].map(d => d.textContent)).toEqual(["متوسط الصف", "نسبة التسليم"]);
    expect([...dl.querySelectorAll("dd.eb-kpi-value")].map(d => d.textContent)).toEqual(["84%", "96%"]);
    expect(dl.querySelector(".eb-kpi-hint")?.className).toContain("is-up");
    expect(dl.querySelector(".eb-kpi-icon")?.getAttribute("aria-hidden")).toBe("true");
    expect(dl.querySelectorAll(".eb-kpi-hint")).toHaveLength(1);
  });
});

describe("UX-R3 Segmented (radio group)", () => {
  const options = [{ value: "7", label: "٧ أيام" }, { value: "30", label: "٣٠ يومًا" }, { value: "90", label: "٩٠ يومًا" }];
  function mount(value = "30") {
    const onChange = vi.fn<(v: string) => void>();
    render(<div dir="rtl"><Segmented label="الفترة" options={options} value={value} onChange={onChange} /></div>);
    return { onChange, radios: screen.getAllByRole("radio") };
  }
  it("a named radio group; exactly the checked option is aria-checked and the single Tab stop", () => {
    const { radios } = mount();
    expect(screen.getByRole("radiogroup", { name: "الفترة" })).toBeTruthy();
    expect(radios.map(r => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(radios.map(r => r.tabIndex)).toEqual([-1, 0, -1]);
  });
  it("click selects; Home / End jump; ArrowDown / ArrowUp move with wrap-around", () => {
    const { radios, onChange } = mount();
    fireEvent.click(radios[2]);
    fireEvent.keyDown(radios[1], { key: "Home" });
    fireEvent.keyDown(radios[1], { key: "End" });
    fireEvent.keyDown(radios[1], { key: "ArrowDown" });
    fireEvent.keyDown(radios[1], { key: "ArrowUp" });
    expect(onChange.mock.calls.map(c => c[0])).toEqual(["90", "7", "90", "90", "7"]);
  });
  it("in RTL the LEFT arrow goes to the next option and the RIGHT arrow to the previous one", () => {
    const { radios, onChange } = mount();
    // happy-dom computes no `direction` from the dir attribute; force the computed value the browser would give.
    const real = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation(el => ({ ...real(el), direction: "rtl" }) as CSSStyleDeclaration);
    fireEvent.keyDown(radios[1], { key: "ArrowLeft" });
    fireEvent.keyDown(radios[1], { key: "ArrowRight" });
    expect(onChange.mock.calls.map(c => c[0])).toEqual(["90", "7"]);
  });
});

describe("UX-R3 Tooltip (WCAG 1.4.13)", () => {
  function mount() {
    render(<Tooltip text="ألصق قائمة أسماء دفعة واحدة"><button type="button" aria-describedby="x-help">إضافة جماعية</button></Tooltip>);
    return { trigger: screen.getByRole("button", { name: "إضافة جماعية" }) };
  }
  it("hidden at rest; the trigger keeps its own name and is DESCRIBED by the tooltip (appended to an existing description)", () => {
    const { trigger } = mount();
    const tip = document.querySelector('[role="tooltip"]') as HTMLElement;
    expect(tip.hidden).toBe(true);
    expect(trigger.getAttribute("aria-describedby")).toBe("x-help " + tip.id);
    expect(screen.getByRole("button", { name: "إضافة جماعية" })).toBe(trigger);
  });
  it("shows on hover and on keyboard focus, hides on leave / blur, and Escape dismisses it without moving focus", () => {
    const { trigger } = mount();
    const tip = () => document.querySelector('[role="tooltip"]') as HTMLElement;
    fireEvent.mouseEnter(trigger.parentElement!); expect(tip().hidden).toBe(false);
    fireEvent.mouseLeave(trigger.parentElement!); expect(tip().hidden).toBe(true);
    trigger.focus(); fireEvent.focus(trigger); expect(tip().hidden).toBe(false);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(tip().hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
    fireEvent.blur(trigger); expect(tip().hidden).toBe(true);
  });
});

describe("UX-R3 kit.css — structural guards", () => {
  it("is token-only: no colour literal, every var() is an --eb-* token", () => {
    expect(kit).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
    const vars = [...kit.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]);
    expect(vars.length).toBeGreaterThan(20);
    expect(vars.filter(v => !v.startsWith("--eb-"))).toEqual([]);
  });
  it("every --eb-* token it reads is defined in design-tokens.css", () => {
    const tokens = new Set([...readFileSync(join(SRC, "design-tokens.css"), "utf8").matchAll(/(--eb-[\w-]+)\s*:/g)].map(m => m[1]));
    expect([...new Set([...kit.matchAll(/var\((--eb-[\w-]+)/g)].map(m => m[1]))].filter(v => !tokens.has(v))).toEqual([]);
  });
  it("is RTL-first: logical properties only, no physical sides, no z-index literal", () => {
    expect(kit).not.toMatch(/(?:^|[;{\s])(left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right|top|bottom)\s*:/m);
    expect(kit).not.toMatch(/z-index\s*:\s*\d/);
  });
  it("touch screens and the drawer layout get 44 px targets for every interactive part", () => {
    const touch = [...flat.matchAll(/@media \(pointer: coarse\), \(max-width: 1023px\) \{([^}]*)\}/g)].map(m => m[1]).join(" ");
    for (const sel of [".eb-row-action", ".eb-subnav-item", ".eb-segment"]) expect(touch, sel).toMatch(new RegExp(sel.replace(".", "\\.") + " \\{ min-height: 44px;"));
  });
  it("every interactive part has a visible focus ring from the canonical token", () => {
    for (const sel of [".eb-row-action", ".eb-subnav-item", ".eb-segment"]) {
      expect(flat, sel).toMatch(new RegExp(sel.replace(".", "\\.") + ":focus-visible \\{ outline: var\\(--eb-focus-ring\\)"));
    }
  });
  it("both shells load kit.css after ui.css", () => {
    for (const shell of ["shell/TeacherAppShell.tsx", "shell/StudentShell.tsx"]) {
      const src = readFileSync(join(SRC, shell), "utf8");
      expect(src.indexOf('import "../ui/kit.css";'), shell).toBeGreaterThan(src.indexOf('import "../ui/ui.css";'));
    }
  });
});
