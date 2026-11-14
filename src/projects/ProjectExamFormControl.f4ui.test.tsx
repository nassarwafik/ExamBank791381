// @vitest-environment happy-dom
/// <reference types="node" />
// Phase F4-UI — the teacher's switch for image answers, over the REAL handler (in-memory container): a class opened for the
// first time from the control has image answers on; a class opened before keeps them off and is offered «تفعيل أسئلة
// الصور» behind a confirmation; a reopen never switches anything; the switch is not offered on a closed form or a
// read-only class.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, act, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProjectExamFormControl from "./ProjectExamFormControl";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
const CODE = "883589";
const NOW = "2026-11-14T00:00:00.000Z";

function server() {
  const ctx = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "صف c1", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW } });
  const audits: { action: string; details?: Body }[] = [];
  const deps = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c: unknown, ev: { action: string; details?: Body }) => { audits.push(ev); }, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const call = async (method: string, url: string, body?: Body) => (await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps)) as { status: number; jsonBody: Body };
  const posts: Body[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") posts.push(body!);
    const r = await call(method, String(input), body);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody, text: async () => JSON.stringify(r.jsonBody), headers: new Headers() } as unknown as Response;
  }) as unknown as typeof fetch;
  // What a class opened before this phase looks like: opened through the API with no word about images.
  const teacher = (action: string, extra: Body = {}) => call("POST", "/api/project-tracker", { projectCode: CODE, classId: "c1", action, ...extra });
  const classForm = () => { const name = getStorageNamespace(CODE).examFormClassName("c1"); return ctx.has(name) ? ctx.getJson(name) as { state: string; imageAnswers?: boolean } : null; };
  return { audits, posts, teacher, classForm };
}
const mount = (readOnly = false) => render(<ProjectExamFormControl token="t" projectCode={CODE} classId="c1" readOnly={readOnly} />);
const settle = async (turns = 5) => { for (let i = 0; i < turns; i += 1) await act(async () => { await new Promise(resolve => { setTimeout(resolve, 10); }); }); };
const imagesLine = () => screen.queryByTestId("project-exam-form-images");

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("F4-UI the teacher's switch for image answers", () => {
  it("the first open of a class switches its image answers on, and says so before and after", async () => {
    const s = server();
    mount();
    await screen.findByTestId("project-exam-form");
    expect(imagesLine()).toBeNull();                                                 // nothing to say about a form never opened
    fireEvent.click(await screen.findByRole("button", { name: "فتح الاستمارة للصف" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("أسئلة الصور مفعّلة");
    fireEvent.click(within(dialog).getByRole("button", { name: "فتح الاستمارة" }));
    await waitFor(() => expect(s.classForm()?.state).toBe("open"));
    expect(s.posts).toEqual([{ projectCode: CODE, action: "examForm.open", classId: "c1", imageAnswers: true }]);
    expect(s.classForm()!.imageAnswers).toBe(true);
    await waitFor(() => expect(imagesLine()?.textContent).toContain("أسئلة الصور مفعّلة"));
    await settle();
    expect(screen.queryByRole("button", { name: "تفعيل أسئلة الصور" })).toBeNull();
    expect(s.audits.map(a => [a.action, a.details?.imageAnswers])).toEqual([["project.exam_form.open", true]]);
  });

  it("a class opened before keeps image answers off, and its teacher switches them on after a confirmation", async () => {
    const s = server();
    await s.teacher("examForm.open");
    expect(s.classForm()!.imageAnswers).toBeUndefined();
    mount();
    await waitFor(() => expect(imagesLine()?.textContent).toContain("أسئلة الصور غير مفعّلة لهذا الصف"));

    // Cancelling sends nothing.
    fireEvent.click(screen.getByRole("button", { name: "تفعيل أسئلة الصور" }));
    const first = await screen.findByRole("dialog");
    expect(first.textContent).toContain("لا يمكن إلغاء التفعيل بعد ذلك");
    fireEvent.click(within(first).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await settle();
    expect(s.posts).toEqual([]);
    expect(s.classForm()!.imageAnswers).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "تفعيل أسئلة الصور" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تفعيل" }));
    await waitFor(() => expect(s.classForm()!.imageAnswers).toBe(true));
    expect(s.posts).toEqual([{ projectCode: CODE, action: "examForm.open", classId: "c1", imageAnswers: true }]);
    expect(s.classForm()!.state).toBe("open");
    expect(await screen.findByText("فُعّلت أسئلة الصور لطلاب الصف.")).toBeTruthy();
    await waitFor(() => expect(imagesLine()?.textContent).toContain("أسئلة الصور مفعّلة"));
    await settle();
    expect(screen.queryByRole("button", { name: "تفعيل أسئلة الصور" })).toBeNull();
    expect(screen.getByRole("button", { name: "إغلاق الاستمارة" })).toBeTruthy();
  });

  it("a closed form is not offered the switch, and reopening it leaves image answers as they were", async () => {
    const s = server();
    await s.teacher("examForm.open");
    await s.teacher("examForm.close");
    mount();
    await waitFor(() => expect(imagesLine()?.textContent).toContain("أسئلة الصور غير مفعّلة لهذا الصف"));
    await settle();
    expect(screen.queryByRole("button", { name: "تفعيل أسئلة الصور" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "فتح الاستمارة للصف" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).not.toContain("أسئلة الصور");
    fireEvent.click(within(dialog).getByRole("button", { name: "فتح الاستمارة" }));
    await waitFor(() => expect(s.classForm()!.state).toBe("open"));
    expect(s.posts).toEqual([{ projectCode: CODE, action: "examForm.open", classId: "c1" }]);
    expect(s.classForm()!.imageAnswers).toBeUndefined();
    expect(await screen.findByRole("button", { name: "تفعيل أسئلة الصور" })).toBeTruthy();   // now that it is open
  });

  it("a read-only class shows whether image answers are on, without the switch", async () => {
    const s = server();
    await s.teacher("examForm.open");
    mount(true);
    await waitFor(() => expect(imagesLine()?.textContent).toContain("أسئلة الصور غير مفعّلة لهذا الصف"));
    await settle();
    // Following the forms stays (F3-UI); nothing that changes the class is offered.
    const control = within(screen.getByTestId("project-exam-form"));
    expect(control.queryByRole("button", { name: "تفعيل أسئلة الصور" })).toBeNull();
    expect(control.queryByRole("button", { name: /فتح الاستمارة|إغلاق الاستمارة/ })).toBeNull();
    expect(control.getAllByRole("button").map(b => b.textContent)).toEqual(["متابعة الاستمارات"]);
    expect(s.posts).toEqual([]);
  });

  it("a refused switch shows the server's reason and keeps the class as it is", async () => {
    const s = server();
    await s.teacher("examForm.open");
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "تفعيل أسئلة الصور" }));
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ ok: false, error: "الصف مؤرشف." }), text: async () => JSON.stringify({ ok: false, error: "الصف مؤرشف." }), headers: new Headers() })) as unknown as typeof fetch;
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تفعيل" }));
    expect((await screen.findByRole("alert")).textContent).toContain("الصف مؤرشف");
    globalThis.fetch = real;
    expect(s.classForm()!.imageAnswers).toBeUndefined();
    expect(imagesLine()?.textContent).toContain("أسئلة الصور غير مفعّلة لهذا الصف");
    expect(screen.getByRole("button", { name: "تفعيل أسئلة الصور" })).toBeTruthy();
  });
});
