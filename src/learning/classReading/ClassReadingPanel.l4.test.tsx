// @vitest-environment happy-dom
// Phase L.4 — «قراءة صفوفي» on the teacher's book page, over a fake class-reading client:
//   • nothing is requested until the teacher opens the panel; then classes + catalog once, and the first ACTIVE class that
//     uses the book is reported (archived classes and classes without the book are not offered);
//   • the report: KPIs, per-unit started / completed / average, who has not started, who stopped (≥ INACTIVE_DAYS before the
//     server's generatedAt), each student's pages and last reading;
//   • a response for a class the teacher has since left is never shown;
//   • publishing / hiding a unit from the book page (hiding is confirmed; the list is sent in content order), and adding the
//     book to another class;
//   • failures are alerts with a retry; empty states say what to do next.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ClassReadingPanel, { INACTIVE_DAYS } from "./ClassReadingPanel";
import type { ClassReading, ClassReadingClient } from "./classReadingClient";
import type { Classroom, LearningCatalogCourse } from "../../students/types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const C = "791381", M1 = "791381-m01", M2 = "791381-m02", M3 = "791381-m03";
const room = (classId: string, name: string, visible: string[] | null, extra: Partial<Classroom> = {}): Classroom => ({
  classId, name, grade: "10", schoolYear: "2026", active: true, status: "active", studentCount: 3, createdAt: "", learningMaterials: visible === null ? [] : [{ courseId: C, visibleModuleIds: visible }], ...extra,
});
const CATALOG: LearningCatalogCourse[] = [{ courseId: C, title: "شبكات", subject: "حاسوب", modules: [
  { moduleId: M3, title: "الوحدة الثالثة", order: 3 }, { moduleId: M1, title: "الوحدة الأولى", order: 1 }, { moduleId: M2, title: "الوحدة الثانية", order: 2 },
] }];
const GENERATED = "2026-10-17T12:00:00.000Z";
const daysBefore = (d: number) => new Date(Date.parse(GENERATED) - d * 86_400_000).toISOString();
function report(classId: string, extra: Partial<ClassReading> = {}): ClassReading {
  return {
    classId, courseId: C, generatedAt: GENERATED, totalPages: 20,
    modules: [{ moduleId: M1, title: "الوحدة الأولى", order: 1, total: 10, started: 2, completed: 1, averageRead: 50 }, { moduleId: M2, title: "الوحدة الثانية", order: 2, total: 10, started: 1, completed: 0, averageRead: 3 }],
    students: [
      { userId: "u1", displayName: "سلمى", code: "C1", modules: { [M1]: 10, [M2]: 1 }, readPages: 11, totalPages: 20, lastReadAt: daysBefore(1) },
      { userId: "u2", displayName: "باسل", code: "C2", modules: { [M1]: 5, [M2]: 0 }, readPages: 5, totalPages: 20, lastReadAt: daysBefore(INACTIVE_DAYS) },
      { userId: "u3", displayName: "أمل", code: "C3", modules: { [M1]: 0, [M2]: 0 }, readPages: 0, totalPages: 20, lastReadAt: null },
    ],
    ...extra,
  };
}
function fake(classes: Classroom[], over: Partial<ClassReadingClient> = {}) {
  const c: ClassReadingClient = {
    classes: vi.fn(async () => classes),
    catalog: vi.fn(async () => CATALOG),
    reading: vi.fn(async (classId: string) => report(classId)),
    publish: vi.fn(async (_classId: string, courseId: string, moduleIds: string[]) => [{ courseId, visibleModuleIds: moduleIds }]),
    ...over,
  };
  return c;
}
const openPanel = () => fireEvent.click(screen.getByRole("button", { name: "عرض قراءة الصفوف" }));
const unitTable = () => screen.getByRole("table", { name: "القراءة حسب الوحدة" });
const list = (name: RegExp) => screen.getByRole("region", { name });

describe("L.4 — the class reading report", () => {
  it("requests nothing until opened; then reports the first active class that uses the book", async () => {
    const client = fake([room("cX", "صف مؤرشف", [M1], { status: "archived", active: false }), room("cN", "صف بلا الكتاب", null), room("cA", "العاشر أ", [M1, M2]), room("cB", "العاشر ب", [M1])]);
    render(<ClassReadingPanel courseId={C} client={client} />);
    expect(client.classes).not.toHaveBeenCalled();
    expect(client.reading).not.toHaveBeenCalled();
    openPanel();
    await screen.findByRole("table", { name: "القراءة حسب الوحدة" });
    expect(client.classes).toHaveBeenCalledTimes(1);
    expect(client.catalog).toHaveBeenCalledTimes(1);
    expect(client.reading).toHaveBeenCalledWith("cA", C);
    const picker = screen.getByRole("combobox", { name: "الصف" });
    expect(within(picker).getAllByRole("option").map(o => o.textContent)).toEqual(["العاشر أ", "العاشر ب"]);   // never archived / without the book
    expect(screen.getByText("وحدتان منشورتان للطلاب")).toBeTruthy();
    expect(screen.getByText("من أصل 3")).toBeTruthy();
    const rows = within(unitTable()).getAllByRole("row").slice(1).map(r => [...r.querySelectorAll("th,td")].slice(0, 3).map(c => c.textContent));
    expect(rows).toEqual([["الوحدة الأولى", "2 من 3", "1 من 3"], ["الوحدة الثانية", "1 من 3", "0 من 3"]]);
    expect(screen.getByRole("progressbar", { name: "متوسط ما قُرئ من «الوحدة الأولى»" }).getAttribute("aria-valuenow")).toBe("50");
    const kpis = Object.fromEntries([...document.querySelectorAll(".eb-lm-cr-kpis > div")].map(d => [d.querySelector("dt")!.textContent, d.querySelector("dd")!.textContent]));
    expect(kpis).toEqual({ "الطلاب": "3 طلاب", "بدأوا القراءة": "2 من 3", "متوسط ما قُرئ": "27%" });      // 16 / (3 × 20)
    expect(within(list(/لم يبدأوا القراءة بعد/)).getAllByRole("listitem").map(li => li.textContent)).toEqual(["أمل"]);
    const stopped = within(list(/توقّفوا عن القراءة/)).getAllByRole("listitem").map(li => li.textContent);
    expect(stopped).toHaveLength(1);                                                                          // exactly INACTIVE_DAYS → listed; 1 day → not
    expect(stopped[0].startsWith("باسل — آخر قراءة")).toBe(true);
    const students = within(screen.getByRole("table", { name: "قراءة كل طالب" })).getAllByRole("row").slice(1);
    expect(students.map(r => r.querySelector("th")!.textContent)).toEqual(["أمل", "باسل", "سلمى"]);
    expect(students[0].textContent).toContain("لم يبدأ بعد");
    expect(students[2].textContent).toContain("11 من 20 صفحة");
  });

  it("switching class shows only the new class: a late answer for the class the teacher left is dropped", async () => {
    let releaseA: (r: ClassReading) => void = () => {};
    const client = fake([room("cA", "العاشر أ", [M1, M2]), room("cB", "العاشر ب", [M1])], {
      reading: vi.fn((classId: string) => (classId === "cA" ? new Promise<ClassReading>(r => { releaseA = r; }) : Promise.resolve(report("cB", { students: [{ userId: "b1", displayName: "طالب ب", code: "B1", modules: { [M1]: 1 }, readPages: 1, totalPages: 10, lastReadAt: daysBefore(0) }] })))),
    });
    render(<ClassReadingPanel courseId={C} client={client} />);
    openPanel();
    const picker = await screen.findByRole("combobox", { name: "الصف" });
    fireEvent.change(picker, { target: { value: "cB" } });
    await screen.findByRole("row", { name: /طالب ب/ });
    releaseA(report("cA"));
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByRole("row", { name: /سلمى/ })).toBeNull();
    expect(screen.getByText("وحدة واحدة منشورة للطلاب")).toBeTruthy();
  });

  it("failures are alerts with a retry (the class list and the report alike)", async () => {
    let failClasses = true, failReading = true;
    const client = fake([room("cA", "العاشر أ", [M1])], {
      classes: vi.fn(async () => { if (failClasses) throw new Error("تعذر تحميل الصفوف."); return [room("cA", "العاشر أ", [M1])]; }),
      reading: vi.fn(async (classId: string) => { if (failReading) throw new Error("تعذر تحميل قراءة الصف حاليًا."); return report(classId); }),
    });
    render(<ClassReadingPanel courseId={C} client={client} />);
    openPanel();
    expect((await screen.findByRole("alert")).textContent).toContain("تعذر تحميل الصفوف.");
    failClasses = false;
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect((await screen.findByRole("alert")).textContent).toContain("تعذر تحميل قراءة الصف حاليًا.");
    failReading = false;
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await screen.findByRole("table", { name: "القراءة حسب الوحدة" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("empty states: no class uses the book; nothing published; no students", async () => {
    render(<ClassReadingPanel courseId={C} client={fake([room("cN", "صف", null)])} />);
    openPanel();
    await screen.findByText("لم يُضَف هذا الكتاب إلى أيٍّ من صفوفك النشطة بعد.");
    cleanup();
    render(<ClassReadingPanel courseId={C} client={fake([room("cA", "صف", [])], { reading: vi.fn(async (id: string) => report(id, { modules: [], totalPages: 0 })) })} />);
    openPanel();
    await screen.findByText(/لا وحدات منشورة لهذا الصف بعد/);
    expect(screen.getByText("لا وحدات منشورة للطلاب")).toBeTruthy();
    cleanup();
    render(<ClassReadingPanel courseId={C} client={fake([room("cA", "صف", [M1])], { reading: vi.fn(async (id: string) => report(id, { students: [] })) })} />);
    openPanel();
    await screen.findByText("لا طلاب في هذا الصف بعد.");
  });
});

describe("L.4 — publication from the book page", () => {
  it("publishing a unit sends the class's units in content order and refreshes the report; hiding is confirmed first", async () => {
    const client = fake([room("cA", "العاشر أ", [M3])]);
    render(<ClassReadingPanel courseId={C} client={client} />);
    openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "إدارة النشر" }));
    const box = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
    expect(screen.getAllByRole("checkbox").map(b => b.closest("label")!.textContent)).toEqual(["الوحدة الأولى", "الوحدة الثانية", "الوحدة الثالثة"]);
    expect([box("الوحدة الأولى").checked, box("الوحدة الثانية").checked, box("الوحدة الثالثة").checked]).toEqual([false, false, true]);
    await waitFor(() => expect(client.reading).toHaveBeenCalledTimes(1));
    fireEvent.click(box("الوحدة الأولى"));
    await waitFor(() => expect(client.publish).toHaveBeenCalledWith("cA", C, [M1, M3]));           // content order, not click order
    expect((await screen.findByText(/✓ نُشرت وحدة «الوحدة الأولى» لطلاب «العاشر أ»/)).getAttribute("role")).toBe("status");
    await waitFor(() => expect(client.reading).toHaveBeenCalledTimes(2));
    expect(box("الوحدة الأولى").checked).toBe(true);
    // Hiding asks first; «إلغاء» leaves everything as it was.
    fireEvent.click(box("الوحدة الثالثة"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("لن يُحذف المحتوى ولا ما قرأه الطلاب");
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(client.publish).toHaveBeenCalledTimes(1);
    fireEvent.click(box("الوحدة الثالثة"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "إخفاء عن الطلاب" }));
    await waitFor(() => expect(client.publish).toHaveBeenLastCalledWith("cA", C, [M1]));
    await waitFor(() => expect(box("الوحدة الثالثة").checked).toBe(false));
  });

  it("a failed publish is an alert and changes nothing", async () => {
    const client = fake([room("cA", "العاشر أ", [M1])], { publish: vi.fn(async () => { throw new Error("تعذر تعديل المواد التعليمية للصف."); }) });
    render(<ClassReadingPanel courseId={C} client={client} />);
    openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "إدارة النشر" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "الوحدة الثانية" }));
    expect((await screen.findByRole("alert")).textContent).toContain("تعذر تعديل المواد التعليمية للصف.");
    expect((screen.getByRole("checkbox", { name: "الوحدة الثانية" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("وحدة واحدة منشورة للطلاب")).toBeTruthy();
  });

  it("adding the book to another active class attaches it with nothing published and selects it", async () => {
    const client = fake([room("cA", "العاشر أ", [M1]), room("cN", "الحادي عشر", null), room("cX", "مؤرشف", null, { status: "archived", active: false })]);
    render(<ClassReadingPanel courseId={C} client={client} />);
    openPanel();
    const other = await screen.findByRole("combobox", { name: "إضافة الكتاب إلى صف آخر" });
    expect(within(other).getAllByRole("option").map(o => o.textContent)).toEqual(["الحادي عشر"]);
    fireEvent.click(screen.getByRole("button", { name: "إضافة إلى الصف" }));
    await waitFor(() => expect(client.publish).toHaveBeenCalledWith("cN", C, []));
    await waitFor(() => expect((screen.getByRole("combobox", { name: "الصف" }) as HTMLSelectElement).value).toBe("cN"));
    expect(screen.getByRole("group", { name: "الوحدات المنشورة لطلاب «الحادي عشر»" })).toBeTruthy();
    await waitFor(() => expect(client.reading).toHaveBeenLastCalledWith("cN", C));
    expect(screen.queryByRole("combobox", { name: "إضافة الكتاب إلى صف آخر" })).toBeNull();
  });
});
