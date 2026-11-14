// @vitest-environment happy-dom
/// <reference types="node" />
// Phase F2-UI — the teacher's exam-form control on the project dashboard, over the REAL handler (in-memory container): it
// shows the form's state for the class, opens it after a confirmation (the questions are frozen into the class), closes
// it, hides the action on a read-only class, and is not shown for a project that ships no form.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProjectExamFormControl from "./ProjectExamFormControl";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
const NOW = "2026-11-14T00:00:00.000Z";
const room = (id: string, code: string) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: [code], schoolYear: "2026", updatedAt: NOW, createdAt: NOW });

function server() {
  const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", "794589"), "platform/classes/c8.json": room("c8", "883589") });
  const audits: Body[] = [];
  const deps = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c: unknown, ev: Body) => { audits.push(ev); }, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const posts: Body[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") posts.push(body!);
    const r = await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody, text: async () => JSON.stringify(r.jsonBody), headers: new Headers() } as unknown as Response;
  }) as unknown as typeof fetch;
  const classForm = (code = "794589", cid = "c1") => { const name = getStorageNamespace(code).examFormClassName(cid); return ctx.has(name) ? ctx.getJson(name) as { state: string; template: { sections: unknown[] } } : null; };
  return { ctx, audits, posts, classForm };
}
const mount = (props: Partial<{ projectCode: string; classId: string; readOnly: boolean }> = {}) =>
  render(<ProjectExamFormControl token="t" projectCode="794589" classId="c1" {...props} />);

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("F2-UI the teacher's exam-form control", () => {
  it("shows a form that was never opened, with its size and the open action", async () => {
    const s = server();
    mount();
    const box = await screen.findByTestId("project-exam-form");
    expect(box.textContent).toContain("استمارة امتحان المشروع");
    expect(box.textContent).toContain("لم تُفتح بعد");
    expect(box.textContent).toMatch(/16\s*قسمًا و\s*92\s*سؤالًا/);
    expect(within(box).getByRole("button", { name: "فتح الاستمارة للصف" })).toBeTruthy();
    expect(s.classForm()).toBeNull();
  });

  it("opens the form only after the confirmation, then offers to close it", async () => {
    const s = server();
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "فتح الاستمارة للصف" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("تُثبَّت أسئلتها لهذا الصف عند أول فتح");
    expect(s.posts).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "فتح الاستمارة" }));
    await waitFor(() => expect(s.classForm()?.state).toBe("open"));
    expect(s.posts).toEqual([{ projectCode: "794589", action: "examForm.open", classId: "c1" }]);
    expect(s.classForm()?.template.sections).toHaveLength(16);
    expect(await screen.findByText("فُتحت الاستمارة لطلاب الصف.")).toBeTruthy();
    expect(screen.getByText("مفتوحة للطلاب")).toBeTruthy();
    expect(s.audits.map(a => a.action)).toEqual(["project.exam_form.open"]);

    fireEvent.click(screen.getByRole("button", { name: "إغلاق الاستمارة" }));
    const closing = await screen.findByRole("dialog");
    expect(closing.textContent).toContain("إجاباتهم المحفوظة تبقى كما هي");
    fireEvent.click(within(closing).getByRole("button", { name: "إغلاق الاستمارة" }));
    await waitFor(() => expect(s.classForm()?.state).toBe("closed"));
    expect(await screen.findByText("مغلقة")).toBeTruthy();
    expect(screen.getByRole("button", { name: "فتح الاستمارة للصف" })).toBeTruthy();
  });

  it("cancelling the confirmation sends nothing", async () => {
    const s = server();
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "فتح الاستمارة للصف" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.posts).toEqual([]);
    expect(s.classForm()).toBeNull();
  });

  it("a read-only class shows the state without the action", async () => {
    server();
    mount({ readOnly: true });
    const box = await screen.findByTestId("project-exam-form");
    expect(box.textContent).toContain("لم تُفتح بعد");
    expect(within(box).queryByRole("button")).toBeNull();
  });

  it("is not shown for a project that ships no form, nor when the state cannot be read", async () => {
    const s = server();
    const { unmount } = mount({ projectCode: "883589", classId: "c8" });
    await waitFor(() => expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1));
    expect(screen.queryByTestId("project-exam-form")).toBeNull();
    unmount();
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, projects: [] }), text: async () => "{}", headers: new Headers() })) as unknown as typeof fetch;
    mount();
    await waitFor(() => expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1));
    expect(screen.queryByTestId("project-exam-form")).toBeNull();
    expect(s.classForm()).toBeNull();
  });

  it("a refused action shows the server's reason and keeps the state", async () => {
    const s = server();
    mount();
    await screen.findByTestId("project-exam-form");
    s.ctx.setJson("platform/classes/c1.json", { ...room("c1", "794589"), status: "archived", active: false });
    fireEvent.click(screen.getByRole("button", { name: "فتح الاستمارة للصف" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "فتح الاستمارة" }));
    expect((await screen.findByRole("alert")).textContent).toContain("الصف مؤرشف");
    expect(s.classForm()).toBeNull();
    expect(screen.getByText("لم تُفتح بعد")).toBeTruthy();
  });
});
