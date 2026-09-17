// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { flushSync } from "react-dom";
import ActionMenu from "./ui/ActionMenu";
import ClassesPane from "./students/ClassesPane";
import TeacherPlatform from "./TeacherPlatform";
import type { Classroom, Student } from "./students/types";

/*
 * Final Acceptance — manual-test blocker fixes.
 *
 * 1. ActionMenu: in a real browser React flushes a discrete-event state update in a microtask as soon as its ROOT
 *    capture listener returns, i.e. BEFORE the native click reaches the menu item and bubbles back. The old
 *    `onClickCapture` close therefore unmounted the portal mid-dispatch and the item's own onClick never ran
 *    ("the three dots open but تعديل does nothing"). happy-dom dispatches events synchronously, so an ordinary
 *    fireEvent cannot show it; `browserClick` below reproduces the browser by forcing React's pending sync work
 *    to flush from a native capture listener placed between the root and the target. Under that ordering the old
 *    implementation loses the handler and the fixed (bubble-phase) implementation runs it exactly once.
 *
 * 2. Class card: the whole visible card is the selection hit area (CSS stretched pseudo-element on the native
 *    select button; the "⋯" trigger layered above). Pointer hit-testing is not simulated by happy-dom, so the CSS
 *    itself is guarded in api/tests/ux2-shell-foundation.test.js; here the markup contract is pinned: one native
 *    button owns selection, every visible part of it selects, the trigger never does, aria-pressed is correct.
 */

// Emulates the browser's microtask checkpoint between React's root capture listener and the bubble phase.
function browserClick(el: HTMLElement) {
  const panel = el.closest(".eb-menu-panel") as HTMLElement | null;
  const flush = () => flushSync(() => {});
  panel?.addEventListener("click", flush, true);
  fireEvent.click(el);
  panel?.removeEventListener("click", flush, true);
}
const menuPanel = (label: string) => screen.queryByRole("group", { name: label });

afterEach(cleanup);

describe("ActionMenu — activation runs the control's handler, then closes (browser event ordering)", () => {
  function Menu({ onItem, onDisabled, busy = false }: { onItem: () => void; onDisabled?: () => void; busy?: boolean }) {
    return (
      <ActionMenu label="إجراءات">
        <button type="button" className="eb-menu-item" onClick={onItem}>تعديل</button>
        <button type="button" className="eb-menu-item" onClick={onDisabled} disabled={busy}>أرشفة</button>
      </ActionMenu>
    );
  }
  async function open() {
    const trigger = screen.getByRole("button", { name: "إجراءات" });
    fireEvent.click(trigger);
    await screen.findByRole("group", { name: "إجراءات" });
    return trigger;
  }

  it("A: an ordinary item activated with browser ordering runs its onClick exactly once, the menu closes, focus returns to the trigger", async () => {
    const onItem = vi.fn();
    render(<Menu onItem={onItem} />);
    const trigger = await open();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    browserClick(screen.getByRole("button", { name: "تعديل" }));
    expect(onItem).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(menuPanel("إجراءات")).toBeNull());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("A (ordering contract): when the item's handler runs the panel is still mounted and focus has not yet been moved to the trigger", async () => {
    let seen: { connected: boolean; expanded: string | null; activeIsTrigger: boolean } | null = null;
    const onItem = vi.fn(() => {
      const item = screen.getByRole("button", { name: "تعديل" });
      seen = { connected: item.isConnected, expanded: screen.getByRole("button", { name: "إجراءات" }).getAttribute("aria-expanded"), activeIsTrigger: document.activeElement === screen.getByRole("button", { name: "إجراءات" }) };
    });
    render(<Menu onItem={onItem} />);
    await open();
    const item = screen.getByRole("button", { name: "تعديل" });
    item.focus();
    browserClick(item);
    expect(onItem).toHaveBeenCalledTimes(1);
    expect(seen).toEqual({ connected: true, expanded: "true", activeIsTrigger: false });
  });

  it("D: a disabled item does not execute and does not close the menu", async () => {
    const onItem = vi.fn(), onDisabled = vi.fn();
    render(<Menu onItem={onItem} onDisabled={onDisabled} busy />);
    await open();
    const disabled = screen.getByRole("button", { name: "أرشفة" }) as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    browserClick(disabled);
    expect(onDisabled).not.toHaveBeenCalled();
    expect(onItem).not.toHaveBeenCalled();
    expect(menuPanel("إجراءات")).not.toBeNull();
  });

  it("F: keyboard — open, ArrowDown moves focus between items, Escape closes WITHOUT executing anything and returns focus; activation still executes once", async () => {
    const onItem = vi.fn(), onSecond = vi.fn();
    render(<Menu onItem={onItem} onDisabled={onSecond} />);
    const trigger = await open();                                   // native button: Enter/Space produce this click
    const first = screen.getByRole("button", { name: "تعديل" }), second = screen.getByRole("button", { name: "أرشفة" });
    expect(document.activeElement).toBe(first);                     // first control receives focus on open
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    await waitFor(() => expect(menuPanel("إجراءات")).toBeNull());
    expect(onItem).not.toHaveBeenCalled(); expect(onSecond).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    await open();
    browserClick(screen.getByRole("button", { name: "أرشفة" }));   // keyboard activation of a native button is a click
    expect(onSecond).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(menuPanel("إجراءات")).toBeNull());
  });

  it("outside click still closes without executing; a click on non-control content inside the panel keeps it open", async () => {
    const onItem = vi.fn();
    render(<><button type="button">خارج</button><ActionMenu label="إجراءات"><span className="eb-menu-label">تسمية</span><button type="button" className="eb-menu-item" onClick={onItem}>تعديل</button></ActionMenu></>);
    await open();
    fireEvent.click(screen.getByText("تسمية"));
    expect(menuPanel("إجراءات")).not.toBeNull();
    fireEvent.mouseDown(screen.getByRole("button", { name: "خارج" }));
    await waitFor(() => expect(menuPanel("إجراءات")).toBeNull());
    expect(onItem).not.toHaveBeenCalled();
  });
});

describe("Class card — the whole visible card selects; the actions trigger never does", () => {
  const cls = (classId: string, name: string, over: Partial<Classroom> = {}): Classroom => ({ classId, name, grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 3, createdAt: "2026-01-01", ...over } as Classroom);
  const ACTIVE = cls("c1", "الحادي عشر 3"), ARCHIVED = cls("c9", "صف قديم", { active: false, status: "archived", archivedAt: "2026-02-01T00:00:00.000Z", archiveReason: "archived" });
  function renderPane(rows: Classroom[], selectedClassId: string, onSelect = vi.fn(), extra: Partial<Parameters<typeof ClassesPane>[0]> = {}) {
    const props = { classes: rows, view: "active", onViewChange: vi.fn(), activeCount: 1, archivedCount: 1, selectedClassId, onSelect, projects: [{ projectCode: "899373", title: "مشروع الكتاب" }], projectTitle: () => "مشروع الكتاب", isGraduationEligible: () => false, onToggleProject: vi.fn(), onToggleArchive: vi.fn(), onGraduate: vi.fn(), onCreate: vi.fn(), onRefresh: vi.fn(), loading: false, busy: false, fmtDate: (v: string) => v, ...extra } as Parameters<typeof ClassesPane>[0];
    const utils = render(<ClassesPane {...props} />);
    return { ...utils, onSelect };
  }
  const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

  it("1+2: exactly one native button owns selection and every visible part of the card content selects the class (once per click)", () => {
    const { onSelect } = renderPane([ACTIVE, cls("c2", "العاشر 1")], "c2");
    const li = row("الحادي عشر 3");
    const select = li.querySelector(".eb-class-select") as HTMLElement;
    expect(select.tagName).toBe("BUTTON"); expect(select.getAttribute("type")).toBe("button");
    expect(within(li).getByRole("button", { name: /^الحادي عشر 3/ })).toBe(select);          // accessible name = the card content
    expect(li.getAttribute("role")).toBeNull();                                          // the <li> is not a fake button
    expect(within(li).getAllByRole("button")).toHaveLength(2);                           // select + "⋯" — no nested controls
    expect(select.querySelector("button, a, input")).toBeNull();
    for (const part of [within(li).getByText("الحادي عشر 3"), li.querySelector(".eb-class-meta") as HTMLElement, within(li).getByText("بدون مشروع")]) {          // chip (no project on this class)
      onSelect.mockClear();
      fireEvent.click(part);
      expect(onSelect).toHaveBeenCalledTimes(1); expect(onSelect).toHaveBeenCalledWith("c1");
    }
    onSelect.mockClear();
    fireEvent.click(select);                                                             // the hit-area pseudo-element targets this button
    expect(onSelect).toHaveBeenCalledWith("c1");
  });

  it("3: keyboard — the select control is a native focusable button with correct aria-pressed on both rows", () => {
    renderPane([ACTIVE, cls("c2", "العاشر 1")], "c1");
    const a = row("الحادي عشر 3").querySelector(".eb-class-select") as HTMLElement, b = row("العاشر 1").querySelector(".eb-class-select") as HTMLElement;
    expect(a.getAttribute("aria-pressed")).toBe("true"); expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(a.getAttribute("tabindex")).toBeNull();                                       // natively in the Tab order
    b.focus(); expect(document.activeElement).toBe(b);                                   // Enter/Space on a native button = click (tested via click above)
  });

  it("4+5: the ⋯ trigger and its menu do NOT select the class; class actions and project checkboxes still work", async () => {
    const onToggleProject = vi.fn(), onToggleArchive = vi.fn();
    const { onSelect } = renderPane([ACTIVE, cls("c2", "العاشر 1")], "c2", vi.fn(), { onToggleProject, onToggleArchive });
    const li = row("الحادي عشر 3");
    const trigger = within(li).getByRole("button", { name: "إجراءات الصف الحادي عشر 3" });
    expect(trigger.closest(".eb-class-select")).toBeNull();                              // outside the select button
    expect(trigger.closest(".eb-class-menu")).not.toBeNull();                           // in the layered actions column
    fireEvent.click(trigger);
    const menu = await screen.findByRole("group", { name: "إجراءات الصف الحادي عشر 3" });
    expect(onSelect).not.toHaveBeenCalled();
    browserClick(within(menu).getByLabelText("مشروع الكتاب"));                          // checkbox: toggles exactly once, closes
    expect(onToggleProject).toHaveBeenCalledTimes(1); expect(onToggleProject).toHaveBeenCalledWith(expect.objectContaining({ classId: "c1" }), "899373", true);
    await waitFor(() => expect(screen.queryByRole("group", { name: "إجراءات الصف الحادي عشر 3" })).toBeNull());
    fireEvent.click(trigger);
    browserClick(within(await screen.findByRole("group", { name: "إجراءات الصف الحادي عشر 3" })).getByRole("button", { name: "أرشفة الصف" }));
    expect(onToggleArchive).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("archived classes follow the same behaviour", () => {
    const { onSelect } = renderPane([ARCHIVED], "", vi.fn(), { view: "archived" });
    const li = row("صف قديم");
    fireEvent.click(within(li).getByText("مؤرشف"));
    expect(onSelect).toHaveBeenCalledWith("c9");
    onSelect.mockClear();
    fireEvent.click(within(li).getByRole("button", { name: "إجراءات الصف صف قديم" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("Student roster ⋯ actions through the real TeacherPlatform (browser event ordering)", () => {
  const CLASSES = [
    { classId: "c1", name: "الحادي عشر 3", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 2, createdAt: "2026-01-03", programCodes: [] },
    { classId: "c2", name: "العاشر 1", grade: "10", schoolYear: "2026", active: true, status: "active", studentCount: 0, createdAt: "2026-01-02", programCodes: ["899373"] }
  ];
  const PROJECTS = [{ projectCode: "899373", title: "مشروع الكتاب" }];
  const stu = (userId: string, firstName: string, familyName: string, identity: string, over: Partial<Student> = {}): Student => ({ userId, code: identity, displayName: firstName + " " + familyName, firstName, familyName, identityNumber: identity, classId: "c1", className: "الحادي عشر 3", active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0, ...over } as Student);
  const S1 = stu("s1", "علي", "حسن", "111111111"), S2 = stu("s2", "بسمة", "أحمد", "222222222");
  let calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  async function routedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = String(input); const method = (init?.method || "GET").toUpperCase();
    let body: Record<string, unknown> = {}; if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { /* ignore */ } }
    calls.push({ url, method, body });
    const json = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => data } as Response);
    if (url.includes("/api/project-tracker")) return json({ ok: true, projects: PROJECTS });
    if (url.includes("/api/classrooms") && method === "GET") return json({ ok: true, classes: CLASSES });
    if (url.includes("/api/classrooms")) return json({ ok: true, classroom: { ...CLASSES[0], programCodes: ["899373"] } });
    if (url.includes("/api/students") && method === "GET") { const classId = new URL(url, "http://x").searchParams.get("classId"); return json({ ok: true, students: classId === "c1" ? [S1, S2] : [] }); }
    if (url.includes("/api/students")) return json({ ok: true, student: { ...S1, active: false }, rosterSynced: true });
    return json({ ok: true });
  }
  beforeEach(() => { calls = []; globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch; });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  async function mount() {
    render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
    await screen.findByText("علي");
    await waitFor(() => expect(calls.some(c => c.url.includes("/api/students"))).toBe(true));
    calls = [];
  }
  const rowOf = (firstName: string) => screen.getByText(firstName).closest("tr") as HTMLElement;
  async function openRowMenu(firstName: string) {
    const trigger = within(rowOf(firstName)).getByRole("button", { name: /^إجراءات / });
    fireEvent.click(trigger);
    return { trigger, menu: await screen.findByRole("group", { name: /^إجراءات / }) };
  }
  const posts = () => calls.filter(c => c.method === "POST");

  it("B: ⋯ → تعديل opens EditStudentDialog with that student's values; the menu is closed; the dialog owns focus and returns it to the ⋯ trigger on close", async () => {
    await mount();
    const { trigger, menu } = await openRowMenu("علي");
    browserClick(within(menu).getByRole("button", { name: "تعديل" }));
    const dialog = await screen.findByRole("dialog", { name: "تعديل تفاصيل الطالب" });
    expect(screen.queryByRole("group", { name: /^إجراءات / })).toBeNull();
    expect((within(dialog).getByLabelText("الاسم") as HTMLInputElement).value).toBe("علي");
    expect((within(dialog).getByLabelText("اسم العائلة") as HTMLInputElement).value).toBe("حسن");
    expect((within(dialog).getByLabelText("رقم الهوية") as HTMLInputElement).value).toBe("111111111");
    expect((within(dialog).getByLabelText("الصف") as HTMLSelectElement).value).toBe("c1");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(posts()).toEqual([]);                                                          // opening the editor sends nothing
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "تعديل تفاصيل الطالب" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("B (exactly once): a second student's editor shows that student, and only one dialog ever exists", async () => {
    await mount();
    const { menu } = await openRowMenu("بسمة");
    browserClick(within(menu).getByRole("button", { name: "تعديل" }));
    const dialog = await screen.findByRole("dialog", { name: "تعديل تفاصيل الطالب" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect((within(dialog).getByLabelText("الاسم") as HTMLInputElement).value).toBe("بسمة");
  });

  it("C: ⋯ → نسخ رقم الهوية runs exactly once with the identity number, no request, menu closed", async () => {
    await mount();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { menu } = await openRowMenu("علي");
    browserClick(within(menu).getByRole("button", { name: "نسخ رقم الهوية" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("111111111");
    await waitFor(() => expect(screen.queryByRole("group", { name: /^إجراءات / })).toBeNull());
    expect(posts()).toEqual([]);
  });

  it("C (business action unchanged): ⋯ → تعطيل الحساب issues exactly the existing request once", async () => {
    await mount();
    const { menu } = await openRowMenu("علي");
    browserClick(within(menu).getByRole("button", { name: "تعطيل الحساب" }));
    await waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0].url).toContain("/api/students");
    expect(posts()[0].body).toEqual({ action: "toggleActive", userId: "s1" });                     // unchanged existing body
    await waitFor(() => expect(screen.queryByRole("group", { name: /^إجراءات / })).toBeNull());
  });

  it("E: class ⋯ → project checkbox (label click, browser ordering) toggles exactly once → one confirm dialog → one setPrograms request", async () => {
    await mount();
    const classList = document.querySelector(".class-list") as HTMLElement;
    const c1 = within(classList).getByText("الحادي عشر 3").closest("li") as HTMLElement;   // no project yet on c1
    fireEvent.click(within(c1).getByRole("button", { name: "إجراءات الصف الحادي عشر 3" }));
    const menu = await screen.findByRole("group", { name: "إجراءات الصف الحادي عشر 3" });
    const box = within(menu).getByLabelText("مشروع الكتاب") as HTMLInputElement;
    expect(box.checked).toBe(false);
    browserClick(box.closest("label") as HTMLElement);                                     // label click → browser follows with the input's activation click
    const confirm = await waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm"); return el; });
    expect(document.querySelectorAll('.eb-confirm[role="dialog"]')).toHaveLength(1);
    expect(confirm.textContent).toContain("مشروع الكتاب");
    expect(screen.queryByRole("group", { name: "إجراءات الصف الحادي عشر 3" })).toBeNull();
    fireEvent.click(confirm.querySelector(".eb-dialog-foot .is-primary, .eb-dialog-foot .is-danger") as HTMLElement);
    await waitFor(() => expect(posts().filter(p => p.url.includes("/api/classrooms")).map(p => p.body)).toEqual([{ action: "setPrograms", classId: "c1", programCodes: ["899373"] }]));
  });
});
