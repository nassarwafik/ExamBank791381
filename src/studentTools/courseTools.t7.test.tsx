// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { COURSE_STUDENT_TOOLS, courseStudentTools } from "./courseTools";
import { validateStudentTools } from "./studentToolsSpec";
import { studentToolHasUi } from "./studentToolsCatalog";
import { registeredCourseIds } from "../learning/content/registry";
import LearningReader from "../learning/reader/LearningReader";
import { makeImmediateApi } from "../learning/reader/readerFixtures";
import CourseToolDock from "./CourseToolDock";

// Phase T7 — the student tools in the course books: a fixed, valid set per course, shown by the same tool bar as the exam.

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ""; });

describe("T7 — course tool sets", () => {
  it("every set is a valid canonical spec of tools that have a student UI", () => {
    for (const [course, spec] of Object.entries(COURSE_STUDENT_TOOLS)) {
      const v = validateStudentTools(spec);
      expect(v.ok, course).toBe(true);
      if (v.ok) expect(v.value, course).toEqual(spec);
      for (const t of spec.tools) expect(studentToolHasUi(t.id), course + " " + t.id).toBe(true);
    }
  });
  it("every course with content has a set, and every set names a course with content", () => {
    expect(Object.keys(COURSE_STUDENT_TOOLS).sort()).toEqual([...registeredCourseIds()].sort());
  });
  it("networks books carry the IPv4 calculator with subnetting; CS foundations the truth table and ASCII", () => {
    const net = courseStudentTools("791381")!;
    expect(net.tools.find(t => t.id === "ipv4Calculator")).toEqual({ id: "ipv4Calculator", showBinary: true, allowSubnetting: true });
    expect(courseStudentTools("791381s")).toBe(net);
    expect(courseStudentTools("899371")!.tools.map(t => t.id)).toEqual(expect.arrayContaining(["truthTable", "asciiTable", "baseConverter"]));
  });
  it("an unknown course, or an inherited property name, has no tools", () => {
    expect(courseStudentTools("000000")).toBeUndefined();
    expect(courseStudentTools("toString")).toBeUndefined();
    expect(courseStudentTools("__proto__")).toBeUndefined();
  });
});

describe("T7 — the tool bar in the book reader", () => {
  const mount = () => render(<LearningReader courseId="791381" onExit={vi.fn()} api={makeImmediateApi()} />);
  it("the networks book offers its tools, and they work", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("student-tools-button"));
    const menu = screen.getByRole("group", { name: "الأدوات المسموحة" });
    expect(within(menu).getAllByRole("button").map(b => b.textContent)).toEqual(
      ["حاسبة الشبكات IPv4", "محوّل أنظمة العدّ", "حاسبة العمليات على البتات", "محوّل الوحدات", "آلة حاسبة علمية", "ورقة مسودة"]);
    fireEvent.click(within(menu).getByRole("button", { name: "حاسبة الشبكات IPv4" }));
    const panel = screen.getByRole("dialog", { name: "حاسبة الشبكات IPv4" });
    fireEvent.change(within(panel).getByLabelText("العنوان مع البادئة أو القناع"), { target: { value: "10.1.2.3/8" } });
    fireEvent.click(within(panel).getByRole("button", { name: "احسب" }));
    expect(within(panel).getByTestId("ipv4-result").textContent).toContain("10.255.255.255");
    expect(within(panel).getByText("تقسيم الشبكة")).toBeTruthy();                       // subnetting is on in the book
  });
  // Owner request (fullscreen toolbox fix): the tool bar stays available in presentation mode («وضع العرض» / full screen), and it
  // stays MOUNTED across entering and leaving it, so an open tool keeps its state.
  it("stays available in presentation mode, and an open tool keeps its state across entering and leaving it", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("student-tools-button"));
    fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "حاسبة الشبكات IPv4" }));
    const field = () => within(screen.getByRole("dialog", { name: "حاسبة الشبكات IPv4" })).getByLabelText("العنوان مع البادئة أو القناع") as HTMLInputElement;
    fireEvent.change(field(), { target: { value: "10.1.2.3/8" } });
    const dock = screen.getByTestId("student-tool-dock");
    fireEvent.click(screen.getByRole("button", { name: "وضع العرض" }));
    await waitFor(() => expect(document.querySelector(".learning-reader")!.classList.contains("is-presentation")).toBe(true));
    expect(screen.getByTestId("student-tool-dock")).toBe(dock);                          // the same dock: never unmounted
    expect(document.querySelector(".learning-reader")!.contains(dock)).toBe(true);        // inside the overlay (its focus trap)
    expect(screen.getByTestId("student-tools-button")).toBeTruthy();
    expect(field().value).toBe("10.1.2.3/8");
    fireEvent.click(screen.getByRole("button", { name: "خروج من وضع العرض" }));
    await waitFor(() => expect(document.querySelector(".learning-reader")!.classList.contains("is-presentation")).toBe(false));
    expect(screen.getByTestId("student-tool-dock")).toBe(dock);
    expect(field().value).toBe("10.1.2.3/8");
  });
  it("keys pressed inside the tool bar never turn the page or toggle presentation (only the reading surface owns them)", async () => {
    mount();
    await screen.findByRole("heading", { level: 2, name: "صفحة غنية" });
    fireEvent.click(screen.getByRole("button", { name: "وضع العرض" }));
    await waitFor(() => expect(document.querySelector(".learning-reader")!.classList.contains("is-presentation")).toBe(true));
    const fab = screen.getByTestId("student-tools-button");
    fab.focus();
    fireEvent.keyDown(fab, { key: "ArrowLeft" });
    fireEvent.keyDown(fab, { key: "PageDown" });
    fireEvent.keyDown(fab, { key: "f" });
    expect(screen.getByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();   // same page
    expect(document.querySelector(".learning-reader")!.classList.contains("is-presentation")).toBe(true);
    // the reading surface still pages in presentation
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(await screen.findByRole("heading", { level: 2, name: "صفحة ٢" })).toBeTruthy();
  });
});

describe("T7 — CourseToolDock", () => {
  it("renders the course's tool bar, and nothing for a course without a set", () => {
    const a = render(<CourseToolDock courseId="899371" />);
    fireEvent.click(a.getByTestId("student-tools-button"));
    expect(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "جدول الحقيقة" })).toBeTruthy();
    a.unmount();
    const b = render(<CourseToolDock courseId="000000" />);
    expect(b.container.innerHTML).toBe("");
  });
});
