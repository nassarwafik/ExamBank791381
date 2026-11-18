// @vitest-environment happy-dom
// Phase T11 — the student tools of a course book, chosen by the class's teacher (docs/enterprise-student-tools-t.md §18). Presentation
// and wiring only; the server's authority is api/tests/book-student-tools-t11.test.js.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";
import CourseToolDock from "./CourseToolDock";
import LearningReader from "../learning/reader/LearningReader";
import { makeImmediateApi } from "../learning/reader/readerFixtures";
import ClassLearningMaterialsPanel from "../students/ClassLearningMaterialsPanel";
import { classBookTools, bookToolsLine } from "../students/classBookTools";
import type { Classroom, LearningCatalogCourse } from "../students/types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ""; });
const CALC = { id: "calculator", variant: "basic", angleUnit: "deg" };
const BASE = { id: "baseConverter", bases: [2, 16], showSteps: false };
const CHOSEN = { version: 1, tools: [BASE, CALC] };
const toolNames = () => within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getAllByRole("button").map(b => b.textContent);

describe("T11 — the reader's tool bar follows the class's choice", () => {
  it("the teacher's set replaces the book's built-in set", () => {
    render(<CourseToolDock courseId="791381" bookTools={CHOSEN} />);
    fireEvent.click(screen.getByTestId("student-tools-button"));
    expect(toolNames()).toEqual(["محوّل أنظمة العدّ", "آلة حاسبة"]);
  });
  it("without a choice the book's built-in set stays", () => {
    render(<CourseToolDock courseId="791381" />);
    fireEvent.click(screen.getByTestId("student-tools-button"));
    expect(toolNames()).toContain("حاسبة الشبكات IPv4");
  });
  it("tools off (an empty list) shows no tool bar; an invalid value shows none either (never a partial bar)", () => {
    const { unmount } = render(<CourseToolDock courseId="791381" bookTools={{ version: 1, tools: [] }} />);
    expect(screen.queryByTestId("student-tools-button")).toBeNull();
    unmount();
    for (const bad of [{ version: 1, tools: [{ id: "calculator" }] }, { version: 1, tools: [{ id: "formulaSheet", title: "ق", content: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "x" }] }] } }] }, "x", null]) {
      const r = render(<CourseToolDock courseId="791381" bookTools={bad} />);
      expect(screen.queryByTestId("student-tools-button")).toBeNull();
      r.unmount();
    }
  });
  it("the real reader passes the choice to its tool bar", async () => {
    render(<LearningReader courseId="791381" onExit={vi.fn()} api={makeImmediateApi()} bookTools={{ version: 1, tools: [CALC] }} />);
    fireEvent.click(await screen.findByTestId("student-tools-button"));
    expect(toolNames()).toEqual(["آلة حاسبة"]);
  });
});

const mods = (c: string, n: number) => Array.from({ length: n }, (_, i) => ({ moduleId: c + "-m0" + (i + 1), title: "فصل " + (i + 1), order: i + 1 }));
const catalog: LearningCatalogCourse[] = [
  { courseId: "791381", title: "شبكات الاتصال", subject: "أنظمة محوسبة", modules: mods("791381", 2) },
  { courseId: "899371", title: "أسس علم الحاسوب", subject: "علم الحاسوب", modules: mods("899371", 2) },
];
const classroom = (materials: Classroom["learningMaterials"]): Classroom => ({ classId: "c1", name: "11-1", grade: "11", schoolYear: "2026", active: true, studentCount: 20, createdAt: "", learningMaterials: materials });
function mount(cls: Classroom, { active = true } = {}) {
  const onSetTools = vi.fn();
  const noop = () => {};
  render(<ClassLearningMaterialsPanel classroom={cls} classActive={active} catalog={catalog} catalogError="" busy={false}
    onRetryCatalog={noop} onAddCourse={noop} onToggleModule={noop} onRemoveCourse={noop} onSetTools={onSetTools} />);
  return onSetTools;
}

describe("T11 — the teacher's control in «المواد التعليمية لهذا الصف»", () => {
  it("names the book's built-in tools until the teacher chooses, then the choice", () => {
    mount(classroom([{ courseId: "791381", visibleModuleIds: ["791381-m01"] }, { courseId: "899371", visibleModuleIds: [], studentTools: CHOSEN }]));
    expect(screen.getByTestId("book-tools-791381").textContent).toContain("(أدوات الكتاب)");
    expect(screen.getByTestId("book-tools-791381").textContent).toContain("حاسبة الشبكات IPv4");
    expect(screen.getByTestId("book-tools-899371").textContent).toContain("(اختيارك)");
    expect(screen.getByTestId("book-tools-899371").textContent).toContain("محوّل أنظمة العدّ، آلة حاسبة بسيطة");
  });

  it("the dialog edits the set (no formula sheet offered) and saves the canonical choice", async () => {
    const onSetTools = mount(classroom([{ courseId: "791381", visibleModuleIds: [] }]));
    fireEvent.click(within(screen.getByTestId("book-tools-791381")).getByRole("button", { name: "تعديل الأدوات" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("checkbox", { name: "آلة حاسبة" });
    expect(within(dialog).queryByRole("checkbox", { name: "ورقة القوانين" })).toBeNull();
    expect((within(dialog).getByRole("checkbox", { name: "حاسبة الشبكات IPv4" }) as HTMLInputElement).checked).toBe(true);   // starts from the book's set
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "حاسبة الشبكات IPv4" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));
    expect(onSetTools).toHaveBeenCalledTimes(1);
    const [cls, courseId, spec] = onSetTools.mock.calls[0];
    expect([cls.classId, courseId]).toEqual(["c1", "791381"]);
    expect(spec.tools.map((t: { id: string }) => t.id)).not.toContain("ipv4Calculator");
    expect(spec.tools.length).toBeGreaterThan(0);
  });

  it("switching every tool off saves an empty list; «استعادة أدوات الكتاب» sends null", async () => {
    const onSetTools = mount(classroom([{ courseId: "899371", visibleModuleIds: [], studentTools: { version: 1, tools: [CALC] } }]));
    fireEvent.click(within(screen.getByTestId("book-tools-899371")).getByRole("button", { name: "تعديل الأدوات" }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("checkbox", { name: "آلة حاسبة" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ" }));
    expect(onSetTools.mock.calls[0][2]).toEqual({ version: 1, tools: [] });
    fireEvent.click(within(screen.getByTestId("book-tools-899371")).getByRole("button", { name: "تعديل الأدوات" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "استعادة أدوات الكتاب" }));
    expect(onSetTools.mock.calls[1][2]).toBeNull();
  });

  it("an archived class shows the tools but offers no edit", () => {
    mount(classroom([{ courseId: "791381", visibleModuleIds: [] }]), { active: false });
    expect(screen.getByTestId("book-tools-791381").textContent).toContain("حاسبة الشبكات IPv4");
    expect(within(screen.getByTestId("book-tools-791381")).queryByRole("button", { name: "تعديل الأدوات" })).toBeNull();
  });

  it("helpers: a stored value that is not a valid book set is read as the built-in set; tools off reads as such", () => {
    expect(classBookTools(classroom([{ courseId: "791381", visibleModuleIds: [], studentTools: { version: 9 } }]), "791381")).toBeUndefined();
    expect(bookToolsLine({ version: 1, tools: [] }, "791381")).toEqual({ source: "chosen", text: "متوقفة (لا أدوات في هذا الكتاب)" });
    expect(bookToolsLine(undefined, "000000")).toEqual({ source: "none", text: "لا أدوات لهذا الكتاب" });
  });
});
