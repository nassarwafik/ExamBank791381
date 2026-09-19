// @vitest-environment happy-dom
//
// Class Learning Materials — the teacher's progressive-release panel below Classes | Students. Drives the REAL
// TeacherPlatform with a routed fetch mock and pins: panel placement/states, ONE catalog read per workspace, the
// add-course dialog (nothing pre-checked, [] is a valid initial release), publish / hide (confirmed) / re-publish /
// remove (confirmed) request bodies, archived read-only, class switching, the stale-response guard (a response for
// class A never rewrites the panel of class B selected meanwhile), error and busy states.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import TeacherPlatform from "./TeacherPlatform";

const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
const CATALOG = { ok: true, courses: [{ courseId: "791381", title: "شبكات الاتصال", subject: "أنظمة محوسبة", modules: [
  { moduleId: M01, title: "أساسيات الشبكات", order: 1 }, { moduleId: M02, title: "الأعداد والموازين", order: 2 }, { moduleId: M07, title: "عناوين IP", order: 3 }
] }] };
const ORDER = [M01, M02, M07];
const canonical = (ids: string[]) => ORDER.filter(id => ids.includes(id));
type Cls = Record<string, unknown> & { classId: string; learningMaterials?: { courseId: string; visibleModuleIds: string[] }[] };
let CLASSES: Cls[] = [];
function seedClasses(): Cls[] {
  return [
    { classId: "c1", name: "الحادي عشر 3", grade: "11", schoolYear: "2026-2027", programCodes: [], active: true, status: "active", studentCount: 1, createdAt: "2026-01-03", learningMaterials: [] },
    { classId: "c2", name: "الثاني عشر 8", grade: "12", schoolYear: "2026-2027", programCodes: ["899373"], active: true, status: "active", studentCount: 1, createdAt: "2026-01-02", learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01] }] },
    { classId: "c3", name: "دفعة 2025", grade: "12", schoolYear: "2025-2026", active: false, status: "archived", studentCount: 0, createdAt: "2025-01-01", learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01, M02] }] }
  ];
}
const stu = (userId: string, firstName: string, classId: string) => ({ userId, code: userId, identityNumber: "111111111", firstName, familyName: "حسن", displayName: firstName + " حسن", classId, active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 });
const ROSTERS: Record<string, unknown[]> = { c1: [stu("s1", "علي", "c1")], c2: [stu("t1", "نور", "c2")], c3: [] };

type Call = { url: string; method: string; action: string; body: Record<string, unknown> };
let calls: Call[] = [];
let postHandler: (action: string, body: Record<string, unknown>) => unknown = defaultPost;
let catalogStatus = 200;
function json(data: unknown, status = 200) { return { ok: status < 400, status, json: async () => data } as Response; }
function defer<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function defaultPost(action: string, body: Record<string, unknown>) {
  if (action === "setLearningCourseModules") return { ok: true, classId: body.classId, learningMaterials: [{ courseId: body.courseId, visibleModuleIds: canonical(body.moduleIds as string[]) }] };
  if (action === "removeLearningCourse") return { ok: true, classId: body.classId, removed: true, learningMaterials: [] };
  return { ok: true };
}
async function routedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  let body: Record<string, unknown> = {}; if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { /* ignore */ } }
  const action = String(body.action || "");
  calls.push({ url, method, action, body });
  if (url.includes("/api/project-tracker")) return json({ ok: true, projects: [] });
  if (url.includes("/api/learning-materials-catalog")) return json(catalogStatus === 200 ? CATALOG : { ok: false, error: "تعذر تحميل قائمة المواد التعليمية." }, catalogStatus);
  if (url.includes("/api/classrooms") && method === "GET") return json({ ok: true, classes: CLASSES });
  if (url.includes("/api/classrooms")) { const r = await postHandler(action, body); return json(r); }
  if (url.includes("/api/students") && method === "GET") { const classId = new URL(url, "http://x").searchParams.get("classId") || ""; return json({ ok: true, students: ROSTERS[classId] || [] }); }
  return json({ ok: true });
}
beforeEach(() => { calls = []; CLASSES = seedClasses(); postHandler = defaultPost; catalogStatus = 200; globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const panel = () => screen.getByRole("region", { name: "المواد التعليمية لهذا الصف" });
const selectClass = (name: string) => fireEvent.click(within(document.querySelector(".class-list") as HTMLElement).getByText(name));
const checkbox = (title: RegExp) => within(panel()).getByLabelText(title) as HTMLInputElement;
const posts = () => calls.filter(c => c.method === "POST" && c.url.includes("/api/classrooms")).map(c => c.body);
const catalogGets = () => calls.filter(c => c.method === "GET" && c.url.includes("/api/learning-materials-catalog")).length;
async function mount(tab: "students" | "assignments" = "students") {
  render(<TeacherPlatform token="t" currentExam={null} workspaceTab={tab} projects={[]} />);
  if (tab === "students") await screen.findByText("علي");
}
async function confirmDialog() {
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(dialog.querySelector(".eb-dialog-foot .is-primary, .eb-dialog-foot .is-danger") as HTMLButtonElement);
}

describe("panel placement, states and the catalog read", () => {
  it("renders BELOW the Classes | Students grid for the selected class, with the exact heading", async () => {
    await mount();
    const section = panel();
    expect(section.previousElementSibling?.className).toContain("eb-students-layout");
    expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("المواد التعليمية لهذا الصف");
    expect(within(section).getByText("لا توجد مواد تعليمية مضافة لهذا الصف.")).toBeTruthy();   // c1 has nothing yet
    expect(within(section).getByRole("button", { name: /إضافة مادة تعليمية/ })).toBeTruthy();
  });
  it("no selected class → neutral empty state, no add button", async () => {
    CLASSES = [];
    render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" projects={[]} />);
    await screen.findByText("اختر صفًا لعرض مواده التعليمية");
    expect(within(panel()).queryByRole("button", { name: /إضافة مادة تعليمية/ })).toBeNull();
  });
  it("the catalog is read ONCE per workspace (not per class card / class switch) and never on other tabs", async () => {
    await mount();
    await waitFor(() => expect(catalogGets()).toBe(1));
    selectClass("الثاني عشر 8"); await screen.findByText("نور");
    selectClass("الحادي عشر 3"); await screen.findByText("علي");
    expect(catalogGets()).toBe(1);
    cleanup(); calls = [];
    await mount("assignments");
    await waitFor(() => expect(calls.filter(c => c.url.includes("/api/classrooms")).length).toBe(1));
    expect(catalogGets()).toBe(0);
  });
  it("catalog error → local error with retry; a retry recovers", async () => {
    catalogStatus = 503;
    await mount();
    const alert = await within(panel()).findByRole("alert");
    expect(alert.textContent).toContain("تعذر تحميل قائمة المواد التعليمية.");
    catalogStatus = 200;
    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(within(panel()).queryByRole("alert")).toBeNull());
    expect(catalogGets()).toBe(2);
  });
});

describe("add course — dialog, nothing pre-checked, initial release", () => {
  it("attach with ZERO modules: the course card appears with «لا شيء منشور بعد» and every module «مخفي عن الطلاب»", async () => {
    await mount();
    fireEvent.click(within(panel()).getByRole("button", { name: /إضافة مادة تعليمية/ }));
    const dialog = await screen.findByRole("dialog", { name: /إضافة مادة تعليمية للصف/ });
    fireEvent.click(within(dialog).getByLabelText(/شبكات الاتصال/));
    const boxes = within(dialog).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map(b => b.checked)).toEqual([false, false, false]);                        // NOT defaulted to ON
    expect(within(dialog).getByText("لن يرى الطلاب شيئًا حتى تنشر فصلًا.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة" }));
    await screen.findByText(/تمت إضافة «شبكات الاتصال» للصف. لم يُنشر أي فصل بعد/);
    expect(posts()).toEqual([{ action: "setLearningCourseModules", classId: "c1", courseId: "791381", moduleIds: [] }]);
    const section = panel();
    expect(within(section).getByRole("heading", { level: 3, name: "شبكات الاتصال" })).toBeTruthy();
    expect(within(section).getByText("كتاب 791381 · أنظمة محوسبة")).toBeTruthy();
    expect(within(section).getByText("لا شيء منشور بعد")).toBeTruthy();
    expect(within(section).getAllByText("مخفي عن الطلاب").length).toBe(3);
    expect(within(section).queryByRole("button", { name: /إضافة مادة تعليمية/ })).toBeNull();   // nothing else to add
  });
  it("attach with m01 only: request carries [m01]; card shows m01 published, m02/m07 hidden, in canonical order", async () => {
    await mount();
    fireEvent.click(within(panel()).getByRole("button", { name: /إضافة مادة تعليمية/ }));
    const dialog = await screen.findByRole("dialog", { name: /إضافة مادة تعليمية للصف/ });
    fireEvent.click(within(dialog).getByLabelText(/شبكات الاتصال/));
    fireEvent.click(within(dialog).getByLabelText(/أساسيات الشبكات/));
    expect(within(dialog).getByText("سيرى الطلاب 1 من 3 فصول.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة" }));
    await screen.findByText(/تمت إضافة «شبكات الاتصال» للصف ونشر 1 من فصوله/);
    expect(posts()).toEqual([{ action: "setLearningCourseModules", classId: "c1", courseId: "791381", moduleIds: [M01] }]);
    const rows = within(panel()).getAllByRole("listitem").filter(li => li.className.includes("eb-lm-class-module"));
    expect(rows.map(r => r.textContent)).toEqual(["1أساسيات الشبكاتمنشور للطلاب", "2الأعداد والموازينمخفي عن الطلاب", "3عناوين IPمخفي عن الطلاب"]);
    expect(within(panel()).getByText("يرى الطلاب 1 من 3")).toBeTruthy();
  });
});

describe("progressive release — publish / hide / re-publish / remove on an attached course (class c2: m01 published)", () => {
  it("publish m02 then m07: each toggle posts the full next list (no confirm when publishing)", async () => {
    await mount();
    selectClass("الثاني عشر 8"); await screen.findByText("نور");
    expect(checkbox(/أساسيات الشبكات/).checked).toBe(true);
    fireEvent.click(checkbox(/الأعداد والموازين/));
    await screen.findByText("✓ نُشر فصل «الأعداد والموازين» لطلاب الصف.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(checkbox(/الأعداد والموازين/).checked).toBe(true);
    fireEvent.click(checkbox(/عناوين IP/));
    await screen.findByText("✓ نُشر فصل «عناوين IP» لطلاب الصف.");
    expect(posts()).toEqual([
      { action: "setLearningCourseModules", classId: "c2", courseId: "791381", moduleIds: [M01, M02] },
      { action: "setLearningCourseModules", classId: "c2", courseId: "791381", moduleIds: [M01, M02, M07] }
    ]);
    expect(within(panel()).getAllByText("منشور للطلاب").length).toBe(3);
  });
  it("hide a middle module (m02) asks the non-destructive confirmation, then posts [m01, m07]; cancel posts nothing", async () => {
    CLASSES[1].learningMaterials = [{ courseId: "791381", visibleModuleIds: [M01, M02, M07] }];
    await mount();
    selectClass("الثاني عشر 8"); await screen.findByText("نور");
    fireEvent.click(checkbox(/الأعداد والموازين/));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText('سيختفي فصل "الأعداد والموازين" من طلاب الصف. لن يتم حذف المحتوى ويمكن نشره مرة أخرى.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts()).toEqual([]);
    expect(checkbox(/الأعداد والموازين/).checked).toBe(true);
    fireEvent.click(checkbox(/الأعداد والموازين/));
    await confirmDialog();
    await screen.findByText("✓ أُخفي فصل «الأعداد والموازين» عن طلاب الصف (المحتوى محفوظ).");
    expect(posts()).toEqual([{ action: "setLearningCourseModules", classId: "c2", courseId: "791381", moduleIds: [M01, M07] }]);
    expect(checkbox(/الأعداد والموازين/).checked).toBe(false);
    expect(checkbox(/عناوين IP/).checked).toBe(true);                                        // order unchanged, m07 still published
    // re-publish m02 → back to the canonical full list
    fireEvent.click(checkbox(/الأعداد والموازين/));
    await screen.findByText("✓ نُشر فصل «الأعداد والموازين» لطلاب الصف.");
    expect(posts()[1]).toEqual({ action: "setLearningCourseModules", classId: "c2", courseId: "791381", moduleIds: [M01, M02, M07] });
  });
  it("remove the course: explicit non-destructive confirmation, then removeLearningCourse; the card disappears and the add button returns", async () => {
    await mount();
    selectClass("الثاني عشر 8"); await screen.findByText("نور");
    fireEvent.click(within(panel()).getByRole("button", { name: "إزالة المادة من الصف" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("ستختفي المادة التعليمية من طلاب الصف. لن يتم حذف محتوى الكتاب، ويمكن إضافتها مرة أخرى لاحقًا.")).toBeTruthy();
    expect(dialog.className).not.toContain("is-danger");
    fireEvent.click(within(dialog).getByRole("button", { name: "إزالة من الصف" }));
    await screen.findByText("✓ أُزيلت «شبكات الاتصال» من الصف (محتوى الكتاب محفوظ).");
    expect(posts()).toEqual([{ action: "removeLearningCourse", classId: "c2", courseId: "791381" }]);
    expect(within(panel()).getByText("لا توجد مواد تعليمية مضافة لهذا الصف.")).toBeTruthy();
    expect(within(panel()).getByRole("button", { name: /إضافة مادة تعليمية/ })).toBeTruthy();
    expect(calls.filter(c => c.method === "GET" && c.url.includes("/api/classrooms")).length).toBe(1);   // patched from the authoritative response, no reload
  });
  it("a mutation error is shown as an alert and the panel keeps the previous state", async () => {
    postHandler = () => { throw new Error("boom"); };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/classrooms") && (init?.method || "GET") === "POST") return json({ ok: false, error: "الصف مؤرشف — لا يمكن تعديل مواده التعليمية." }, 403);
      return routedFetch(input, init);
    }) as unknown as typeof fetch;
    await mount();
    selectClass("الثاني عشر 8"); await screen.findByText("نور");
    fireEvent.click(checkbox(/عناوين IP/));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("الصف مؤرشف — لا يمكن تعديل مواده التعليمية.");
    expect(checkbox(/عناوين IP/).checked).toBe(false);
  });
});

describe("archived class, class switching, stale responses, busy state", () => {
  it("archived class: configuration visible but read-only — checkboxes disabled, no add / remove buttons", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /الأرشيف/ }));
    selectClass("دفعة 2025");
    await within(panel()).findByRole("heading", { level: 3, name: "شبكات الاتصال" });
    expect(within(panel()).getByText(/للعرض فقط: هذا الصف في الأرشيف/)).toBeTruthy();
    const boxes = within(panel()).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map(b => b.checked)).toEqual([true, true, false]);
    expect(boxes.every(b => b.disabled)).toBe(true);
    expect(within(panel()).queryByRole("button", { name: /إضافة مادة تعليمية/ })).toBeNull();
    expect(within(panel()).queryByRole("button", { name: "إزالة المادة من الصف" })).toBeNull();
    fireEvent.click(boxes[2]);
    expect(posts()).toEqual([]);
  });
  it("switching class updates the panel to the selected class's materials", async () => {
    await mount();
    expect(within(panel()).getByText("لا توجد مواد تعليمية مضافة لهذا الصف.")).toBeTruthy();
    selectClass("الثاني عشر 8"); await screen.findByText("نور");
    expect(within(panel()).getByRole("heading", { level: 3, name: "شبكات الاتصال" })).toBeTruthy();
    expect(checkbox(/أساسيات الشبكات/).checked).toBe(true);
    selectClass("الحادي عشر 3"); await screen.findByText("علي");
    expect(within(panel()).getByText("لا توجد مواد تعليمية مضافة لهذا الصف.")).toBeTruthy();
  });
  it("a class switch closes an open add dialog (it belongs to the class it was opened for)", async () => {
    await mount();
    fireEvent.click(within(panel()).getByRole("button", { name: /إضافة مادة تعليمية/ }));
    await screen.findByRole("dialog", { name: /إضافة مادة تعليمية للصف «الحادي عشر 3»/ });
    selectClass("الثاني عشر 8"); await screen.findByText("نور");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("STALE RESPONSE: a publish started for class A resolving after switching to class B never rewrites B's panel; A's row is updated", async () => {
    const d = defer<unknown>();
    postHandler = (action, body) => action === "setLearningCourseModules" ? d.promise : defaultPost(action, body);
    await mount();
    selectClass("الثاني عشر 8"); await screen.findByText("نور");                        // class A = c2 (m01 published)
    fireEvent.click(checkbox(/عناوين IP/));
    await waitFor(() => expect(posts().length).toBe(1));
    selectClass("الحادي عشر 3"); await screen.findByText("علي");                         // class B = c1 (nothing attached)
    expect(within(panel()).getByText("لا توجد مواد تعليمية مضافة لهذا الصف.")).toBeTruthy();
    d.resolve({ ok: true, classId: "c2", learningMaterials: [{ courseId: "791381", visibleModuleIds: [M01, M07] }] });
    await screen.findByText("✓ نُشر فصل «عناوين IP» لطلاب الصف.");
    expect(within(panel()).getByText("لا توجد مواد تعليمية مضافة لهذا الصف.")).toBeTruthy();   // B untouched
    expect(within(panel()).queryByRole("heading", { level: 3, name: "شبكات الاتصال" })).toBeNull();
    selectClass("الثاني عشر 8"); await screen.findByText("نور");
    expect(checkbox(/عناوين IP/).checked).toBe(true);                                        // A's row carries the result
    expect(calls.filter(c => c.method === "GET" && c.url.includes("/api/classrooms")).length).toBe(1);
  });
  it("busy state: while a mutation is in flight every module checkbox and the remove button are disabled", async () => {
    const d = defer<unknown>();
    postHandler = (action, body) => action === "setLearningCourseModules" ? d.promise : defaultPost(action, body);
    await mount();
    selectClass("الثاني عشر 8"); await screen.findByText("نور");
    fireEvent.click(checkbox(/الأعداد والموازين/));
    await waitFor(() => expect(posts().length).toBe(1));
    expect((within(panel()).getAllByRole("checkbox") as HTMLInputElement[]).every(b => b.disabled)).toBe(true);
    expect((within(panel()).getByRole("button", { name: "إزالة المادة من الصف" }) as HTMLButtonElement).disabled).toBe(true);
    d.resolve(defaultPost("setLearningCourseModules", { classId: "c2", courseId: "791381", moduleIds: [M01, M02] }));
    await screen.findByText("✓ نُشر فصل «الأعداد والموازين» لطلاب الصف.");
    expect((within(panel()).getAllByRole("checkbox") as HTMLInputElement[]).every(b => !b.disabled)).toBe(true);
  });
});

describe("source guards", () => {
  it("the panel is a dedicated component (not crammed into ClassesPane's action menu) and uses no window.confirm / no emoji controls", async () => {
    const RAW = import.meta.glob("./students/{ClassLearningMaterialsPanel,ClassesPane}.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const panelSrc = RAW["./students/ClassLearningMaterialsPanel.tsx"], classesSrc = RAW["./students/ClassesPane.tsx"];
    expect(panelSrc).toMatch(/aria-labelledby="eb-lm-class-title"/);
    expect(panelSrc).not.toMatch(/window\.confirm|role="(menu|menuitem|tablist|tab)"|<details|<summary/);
    expect(panelSrc).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(classesSrc).not.toMatch(/learningMaterials|LearningMaterial/);
    expect(panelSrc).toContain('"منشور للطلاب"'); expect(panelSrc).toContain('"مخفي عن الطلاب"');
  });
});
