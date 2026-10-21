// @vitest-environment happy-dom
//
// Hotfix — «إنشاء صف» opened in the window between the commit that shows the first class and the flush of that commit's
// passive effects. The class-selection effect resets the class-scoped workspace state (selection, profile, editors and the open
// dialog); it used to close EVERY dialog, so a click that landed in that window opened the create-class dialog and closed it again
// at once. A slow CI runner hit the window in TeacherPlatform.createClass.d3 («Unable to find role="dialog" and name "إنشاء صف
// جديد"»). The create-class dialog is not scoped to the selected class, so a class change must not close it; dialogs that ARE
// scoped to the class (add / edit / import students, edit class) still close.
// Fail-first: the first test fails on f51bd90d (the dialog is closed by the effect).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import TeacherPlatform from "./TeacherPlatform";

const room = (classId: string, name: string) => ({ classId, name, grade: "11", schoolYear: "2026-2027", programCodes: [] as string[], active: true, status: "active", studentCount: 0, createdAt: "2026-01-03" });
const CLASSES = [room("c1", "الحادي عشر 3"), room("c2", "العاشر 1")];
const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
const fetchMock = () => vi.fn(async (input: RequestInfo | URL) => String(input).includes("/api/classrooms")
  ? json({ ok: true, classes: CLASSES })
  : json({ ok: true, classes: [], students: [], projects: [] })) as unknown as typeof fetch;
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Clicks the button labelled `label` in the same microtask the selected class's heading is committed — before React has
 *  flushed that commit's passive effects (where a slow runner's test click can land). */
function clickWhenClassShows(label: string) {
  let clicked = false;
  const mo = new MutationObserver(() => {
    if (clicked) return;
    const heading = [...document.querySelectorAll("h2")].find(e => e.textContent === "الحادي عشر 3");
    const button = [...document.querySelectorAll("button")].find(e => e.textContent?.trim() === label);
    if (heading && button) { clicked = true; fireEvent.click(button); }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  return { done: () => { mo.disconnect(); return clicked; } };
}
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 50)); });

describe("Hotfix — the first class selection never closes the create-class dialog", () => {
  it("«إنشاء صف» clicked as the first class appears: the dialog stays open", async () => {
    globalThis.fetch = fetchMock();
    const probe = clickWhenClassShows("إنشاء صف");
    render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
    await screen.findByRole("heading", { level: 2, name: "الحادي عشر 3" });
    await settle();
    expect(probe.done()).toBe(true);
    expect(screen.getByRole("dialog", { name: "إنشاء صف جديد" })).toBeTruthy();
  });

  it("a dialog scoped to the class (add a student) still closes when another class is selected", async () => {
    globalThis.fetch = fetchMock();
    render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
    await screen.findByRole("heading", { level: 2, name: "الحادي عشر 3" });
    await settle();
    fireEvent.click(screen.getAllByRole("button", { name: /إضافة طالب/ })[0]);
    expect(await screen.findByRole("dialog", { name: /إضافة طالب/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^العاشر 1/ }));
    await settle();
    expect(screen.queryByRole("dialog", { name: /إضافة طالب/ })).toBeNull();
  });
});
