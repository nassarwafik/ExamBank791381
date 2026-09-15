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

beforeEach(() => { calls = []; globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch; (window as unknown as { confirm: () => boolean }).confirm = () => true; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const jsonFile = () => new File([JSON.stringify([{ firstName: "علي", familyName: "حسن", identityNumber: "123456789" }])], "roster.json", { type: "application/json" });
async function mountStudents() {
  const utils = render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
  await screen.findByText("إضافة طالب جديد");             // students panel for the default class is up
  return utils;
}
function fileInput(container: HTMLElement) { return container.querySelector('input[type="file"]') as HTMLInputElement; }
function importButton() { return screen.getByRole("button", { name: /استيراد/ }); }

describe("R18 bulk-import UX", () => {
  it("R+S+T: selecting a file only PREVIEWS (no create); counts shown; import enabled only after preview", async () => {
    const { container } = await mountStudents();
    // T (before): the import button is disabled with no preview yet.
    expect((importButton() as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(fileInput(container), { target: { files: [jsonFile()] } });
    await waitFor(() => expect(calls.some(c => c.action === "previewImport")).toBe(true));
    // R: selecting the file never triggered a create.
    expect(calls.some(c => c.action === "bulkImport")).toBe(false);
    // S: counts are surfaced.
    await screen.findByText(/1 صالح · 1 مكرر · 1 غير صالح/);
    // preview table shows the three row statuses.
    expect(screen.getByText("✓ صالح")).toBeTruthy();
    expect(screen.getByText("⚠ مكرر")).toBeTruthy();
    expect(screen.getByText("✕ خطأ")).toBeTruthy();
    // T (after): import is now enabled.
    await waitFor(() => expect((importButton() as HTMLButtonElement).disabled).toBe(false));
  });

  it("U+V: importing shows per-row failures and a credential batch with ONLY newly-created credentials", async () => {
    const { container } = await mountStudents();
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
    expect(fileInput(container).disabled).toBe(true);
    expect((importButton() as HTMLButtonElement).disabled).toBe(true);
  });
});
