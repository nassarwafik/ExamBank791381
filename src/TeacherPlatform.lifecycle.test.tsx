// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import TeacherPlatform from "./TeacherPlatform";

// Roadmap #34 — Analytics Lifecycle Authority (frontend). TeacherPlatform decides class lifecycle ONLY through the
// canonical normalizeClassStatus helper (status "archived" OR active:false ⇒ archived), never the raw compatibility
// `active` flag that /api/classrooms still returns unchanged. An inconsistent document { active:true, status:"archived" }
// must be treated as archived everywhere on the screen: the hero count, the archive tab, the default selection, the
// row style / button label, the move and edit target lists, and the "active class required" controls.

const GOOD = { classId: "good", name: "صف جيد", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 1, createdAt: "2026-01-03" };
const INCONSISTENT = { classId: "inc", name: "صف متناقض", grade: "12", schoolYear: "2025", active: true, status: "archived", archivedAt: "2026-06-01T00:00:00.000Z", studentCount: 1, createdAt: "2026-01-05" };
const student = (userId: string, classId: string) => ({ userId, code: "1" + userId, identityNumber: "11111111" + userId.slice(-1), firstName: "طالب", familyName: userId, displayName: "طالب " + userId, classId, active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 });
const ROSTERS: Record<string, unknown[]> = { good: [student("g1", "good")], inc: [student("i1", "inc")] };

function json(data: unknown, status = 200) { return { ok: status < 400, status, json: async () => data } as Response; }
async function routedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  if (url.includes("/api/project-tracker")) return json({ ok: true, projects: [] });
  if (url.includes("/api/classrooms") && method === "GET") return json({ ok: true, classes: [INCONSISTENT, GOOD] }); // inconsistent FIRST
  if (url.includes("/api/students") && method === "GET") { const classId = new URL(url, "http://x").searchParams.get("classId") || ""; return json({ ok: true, students: ROSTERS[classId] || [] }); }
  return json({ ok: true });
}
beforeEach(() => { globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount() {
  const utils = render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
  await screen.findByRole("button", { name: "إضافة طالب" });
  // The default selection is the good class; wait for ITS roster (g1) so assertions never race the initial
  // students fetch when this file runs alongside other suites under load.
  await screen.findByText("g1");
  return utils;
}
const classesSummary = () => (screen.getByRole("heading", { level: 2, name: "الصفوف" }).parentElement as HTMLElement).textContent; // "N نشطة · M في الأرشيف"
// UX-4: class management lives in a labelled disclosure per row.
async function classMenu(row: HTMLElement) { fireEvent.click(within(row).getByRole("button", { name: /^إجراءات الصف/ })); return await screen.findByRole("group", { name: /^إجراءات الصف/ }); }
const tabBadge = (label: RegExp) => within(screen.getByRole("button", { name: label })).getByText(/^\d+$/).textContent;
const classRow = (name: string) => within(document.querySelector(".class-list") as HTMLElement).getByText(name).closest(".class-row") as HTMLElement;

describe("R34 — TeacherPlatform class lifecycle is canonical (normalizeClassStatus), never the raw active flag", () => {
  it("pane summary and view counts: only the good class is active; the inconsistent class is classified under the archive view", async () => {
    await mount();
    expect(classesSummary()).toContain("1 نشطة · 1 في الأرشيف");
    expect(tabBadge(/الصفوف النشطة/)).toBe("1");
    expect(tabBadge(/الأرشيف/)).toBe("1");
    expect(screen.queryByText("صف متناقض")).toBeNull();                        // not in the active list
    fireEvent.click(screen.getByRole("button", { name: /الأرشيف/ }));
    expect(await screen.findByText("صف متناقض")).toBeTruthy();
  });

  it("default selection skips the inconsistent class even though it is listed first", async () => {
    await mount();
    expect(screen.getByText("g1")).toBeTruthy();                                // good class roster loaded (family-name cell)
    expect(screen.queryByText("i1")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "صف جيد" })).toBeTruthy();   // roster pane is headed by the selected class
  });

  it("archive tab: the inconsistent class renders with the archived row style and offers 'تفعيل', not 'أرشفة الصف'", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /الأرشيف/ }));
    await screen.findByText("صف متناقض");
    const row = classRow("صف متناقض");
    expect(row.className).toContain("archived");
    const menu = await classMenu(row);
    expect(within(menu).getByRole("button", { name: "تفعيل" })).toBeTruthy();
    expect(within(menu).queryByRole("button", { name: "أرشفة الصف" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /الصفوف النشطة/ }));
    const good = classRow("صف جيد");
    expect(good.className).not.toContain("archived");
    const goodMenu = await classMenu(good);
    expect(within(goodMenu).getByRole("button", { name: "أرشفة الصف" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
  });

  it("selecting the inconsistent class disables create-student, import and shows the archived warning", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /الأرشيف/ }));
    fireEvent.click(await screen.findByText("صف متناقض"));
    await screen.findByText(/الصف مؤرشف؛ فعّله قبل إضافة أو استعادة الطلاب/);
    expect((screen.getByRole("button", { name: "إضافة طالب" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "استيراد" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the inconsistent class is never a move target (bulk move list) nor an edit/move option for a good-class student", async () => {
    await mount();
    fireEvent.click(screen.getByLabelText("تحديد طالب g1"));
    await screen.findByText("1 طالب محدد");
    const bulkSelect = screen.getByText("اختر صفًا للنقل").closest("select") as HTMLSelectElement;
    expect(Array.from(bulkSelect.options).map(o => o.value)).toEqual([""]);      // good is the current class; inconsistent excluded
    fireEvent.click(within(screen.getByText("طالب").closest("tr") as HTMLElement).getByRole("button", { name: /^إجراءات / }));
    fireEvent.click(within(await screen.findByRole("group", { name: /^إجراءات / })).getByRole("button", { name: "تعديل" }));
    const modal = await screen.findByRole("dialog", { name: "تعديل تفاصيل الطالب" });
    const editSelect = within(modal).getByLabelText("الصف") as HTMLSelectElement;
    expect(Array.from(editSelect.options).map(o => o.value)).toEqual(["good"]);
  });
});
