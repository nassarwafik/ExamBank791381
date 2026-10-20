// @vitest-environment happy-dom
//
// Batch 4 (D3) — «إنشاء الصف» through the REAL TeacherPlatform: one submission is one class. A double click sends ONE
// request; a retry after a failed request reuses the SAME request key (the server answers with the class the first request
// may already have created); the next class gets a NEW key.
// Fail-first: run against 791f8118 (no key; two clicks in one tick send two creates).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import TeacherPlatform from "./TeacherPlatform";

const CLASSES = [{ classId: "c1", name: "الحادي عشر 3", grade: "11", schoolYear: "2026-2027", programCodes: [] as string[], active: true, status: "active", studentCount: 0, createdAt: "2026-01-03" }];
type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];
let failNextCreate = false;
let release: (() => void) | null = null;
const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data } as Response);
async function routedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input), method = (init?.method || "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
  calls.push({ url, method, body });
  if (url.includes("/api/classrooms") && method === "GET") return json({ ok: true, classes: CLASSES });
  if (url.includes("/api/classrooms") && body.action === "create") {
    if (failNextCreate) { failNextCreate = false; return json({ ok: false, error: "تعذر الاتصال بالخادم." }, 503); }
    if (release === null) await new Promise<void>(r => { release = r; });
    return json({ ok: true, classroom: { classId: "c9", name: body.name, grade: body.grade, schoolYear: body.schoolYear, active: true, status: "active", studentCount: 0, createdAt: "" } });
  }
  return json({ ok: true, classes: [], students: [], projects: [] });
}
beforeEach(() => { calls = []; failNextCreate = false; release = null; globalThis.fetch = vi.fn(routedFetch) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const creates = () => calls.filter(c => c.method === "POST" && c.url.includes("/api/classrooms") && c.body.action === "create").map(c => c.body);
async function openCreate(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "إنشاء صف" }));
  const d = await screen.findByRole("dialog", { name: "إنشاء صف جديد" });
  fireEvent.change(within(d).getByLabelText("اسم الصف"), { target: { value: name } });
  return d;
}
async function mount() {
  render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
  await screen.findByRole("heading", { level: 2, name: "الحادي عشر 3" });
}

describe("D3 — one «إنشاء الصف» submission is one class", () => {
  it("a double click sends ONE create, carrying a request key", async () => {
    await mount();
    const d = await openCreate("العاشر 1");
    const button = within(d).getByRole("button", { name: "إنشاء الصف" });
    await act(async () => { fireEvent.click(button); fireEvent.click(button); });
    expect(creates()).toHaveLength(1);
    expect(creates()[0].requestKey).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/);
    await act(async () => { release!(); });
    await screen.findByText("✓ تم إنشاء الصف.");
    expect(creates()).toHaveLength(1);
  });

  it("a retry after a failure reuses the same key; the next class gets a new key", async () => {
    await mount();
    release = () => {};                                                         // answer creates at once
    failNextCreate = true;
    const d = await openCreate("العاشر 2");
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء الصف" }));
    await screen.findByText("تعذر الاتصال بالخادم.");
    fireEvent.click(within(screen.getByRole("dialog", { name: "إنشاء صف جديد" })).getByRole("button", { name: "إنشاء الصف" }));
    await screen.findByText("✓ تم إنشاء الصف.");
    const [failed, retried] = creates();
    expect(retried.requestKey).toBe(failed.requestKey);
    const d3 = await openCreate("العاشر 3");
    fireEvent.click(within(d3).getByRole("button", { name: "إنشاء الصف" }));
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(creates()).toHaveLength(3);
    expect(creates()[2].requestKey).not.toBe(failed.requestKey);
  });
});
