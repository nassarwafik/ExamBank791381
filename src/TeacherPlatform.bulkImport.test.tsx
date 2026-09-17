// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import TeacherPlatform from "./TeacherPlatform";

// Roadmap #18 — teacher bulk-import UX (R–Y): selecting a file only PREVIEWS (never creates), preview shows
// valid/duplicate/invalid counts, import runs only on explicit click, per-row failures are shown, the
// credential batch receives only newly-created credentials and stays class-scoped, and the import control
// is disabled for an archived class. Drives the real TeacherPlatform with a routed fetch mock.

const CLASSES = [
  { classId: "c1", name: "صف أول", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 0, createdAt: "2026-01-03" },
  { classId: "c3", name: "صف ثالث", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 0, createdAt: "2026-01-02" },
  { classId: "c2", name: "صف مؤرشف", grade: "12", schoolYear: "2025", active: false, status: "archived", studentCount: 3, createdAt: "2026-01-01" }
];
const PREVIEW = {
  ok: true, valid: 1, duplicates: 1, invalid: 1,
  preview: [
    { index: 0, firstName: "علي", familyName: "حسن", identityNumber: "123456789", status: "valid", error: "" },
    { index: 1, firstName: "سارة", familyName: "علي", identityNumber: "222222222", status: "duplicate", error: "رقم الهوية موجود مسبقًا" },
    { index: 2, firstName: "", familyName: "خالد", identityNumber: "12", status: "invalid", error: "بيانات ناقصة" }
  ]
};
const IMPORT_RESULT = {
  ok: true, imported: 1, failed: 1, duplicates: 1,
  credentials: [{ userId: "u1", firstName: "علي", familyName: "حسن", displayName: "علي حسن", identityNumber: "123456789", code: "123456789", password: "Pw123456" }],
  errors: [{ index: 1, firstName: "سارة", familyName: "علي", displayName: "سارة علي", identityNumber: "222222222", code: "222222222", duplicate: true, error: "رقم الهوية مستخدم مسبقًا." }]
};

let calls: { url: string; action: string }[] = [];
function routedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  const method = (init?.method || "GET").toUpperCase();
  let action = "";
  if (init?.body) { try { action = JSON.parse(String(init.body)).action || ""; } catch { /* ignore */ } }
  calls.push({ url, action });
  const json = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => data } as Response);
  if (url.includes("/api/project-tracker")) return json({ ok: true, projects: [] });
  if (url.includes("/api/classrooms")) return json({ ok: true, classes: CLASSES });
  if (url.includes("/api/students") && method === "GET") return json({ ok: true, students: [] });
  if (url.includes("/api/students") && action === "previewImport") return json(PREVIEW);
  if (url.includes("/api/students") && action === "bulkImport") return json(IMPORT_RESULT);
  return json({ ok: true });
}

beforeEach(() => { calls = []; globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const jsonFile = () => new File([JSON.stringify([{ firstName: "علي", familyName: "حسن", identityNumber: "123456789" }])], "roster.json", { type: "application/json" });
async function mountStudents() {
  const utils = render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
  await screen.findByRole("heading", { level: 2, name: "صف أول" }); // roster pane for the default class is up
  return utils;
}
// UX-4: the import flow lives in its own dialog (file → preview → confirm import); the file input is inside it.
// The first test of this file pays the lazy transform/import cost of the students workspace + Dialog portal. On a
// loaded CI runner that exceeded Testing Library's default 1 s (run 356) and then the 5 s test timeout itself
// (run 359), so the describe carries a 30 s test timeout and the dialog lookup waits up to 15 s. Assertions unchanged.
async function openImport() { fireEvent.click(screen.getByRole("button", { name: "استيراد" })); await screen.findByRole("dialog", { name: "استيراد طلاب من ملف" }, { timeout: 15000 }); }
function fileInput(_container: HTMLElement) { return document.querySelector('input[type="file"]') as HTMLInputElement; }
function importButton() { return screen.getByRole("button", { name: /استيراد الطلاب الصالحين/ }); }

describe("R18 bulk-import UX", { timeout: 30000 }, () => {
  it("R+S+T: selecting a file only PREVIEWS (no create); counts shown; import enabled only after preview", async () => {
    const { container } = await mountStudents();
    await openImport();
    // T (before): the import button is disabled with no preview yet.
    expect((importButton() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(fileInput(container), { target: { files: [jsonFile()] } });
    await waitFor(() => expect(calls.some(c => c.action === "previewImport")).toBe(true));
    // R: selecting the file never triggered a create.
    expect(calls.some(c => c.action === "bulkImport")).toBe(false);
    // S: counts are surfaced.
    await screen.findByText(/1 صالح · 1 مكرر · 1 غير صالح/);
    // preview table shows the three row statuses.
    expect(screen.getByText("صالح")).toBeTruthy();
    expect(screen.getByText("مكرر")).toBeTruthy();
    expect(screen.getByText("غير صالح")).toBeTruthy();
    // T (after): import is now enabled.
    await waitFor(() => expect((importButton() as HTMLButtonElement).disabled).toBe(false));
  });

  it("U+V: importing shows per-row failures and a credential batch with ONLY newly-created credentials", async () => {
    const { container } = await mountStudents();
    await openImport();
    fireEvent.change(fileInput(container), { target: { files: [jsonFile()] } });
    await waitFor(() => expect((importButton() as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(importButton());
    await waitFor(() => expect(calls.some(c => c.action === "bulkImport")).toBe(true));

    // V: the credential batch shows the one created student's plaintext password (in-memory only).
    await screen.findByText("Pw123456");
    expect(screen.getByText(/بيانات الدخول الجديدة/)).toBeTruthy();
    // U: the per-row failure is visible.
    await screen.findByText(/عمليات لم تكتمل/);
    expect(screen.getByText(/سارة علي/)).toBeTruthy();
  });

  it("Y: the credential batch is class-scoped — switching class hides the plaintext passwords", async () => {
    await mountStudents();
    await openImport();
    fireEvent.change(fileInput(document.body), { target: { files: [jsonFile()] } });
    await waitFor(() => expect((importButton() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(importButton());
    await screen.findByText("Pw123456");

    // Switch to another ACTIVE class → the batch (owned by صف أول) is hidden.
    fireEvent.click(screen.getByText("صف ثالث"));
    await waitFor(() => expect(screen.queryByText("Pw123456")).toBeNull());
  });

  it("X: the import control is disabled for an archived class", async () => {
    const { container } = await mountStudents();
    // Switch the class list to the archive view, then select the archived class.
    fireEvent.click(screen.getByRole("button", { name: /الأرشيف/ }));
    fireEvent.click(await screen.findByText("صف مؤرشف"));
    await screen.findByText(/الصف مؤرشف/);                 // archived warning shown in the students panel
    expect(container).toBeTruthy();
    expect((screen.getByRole("button", { name: "استيراد" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "إضافة طالب" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
