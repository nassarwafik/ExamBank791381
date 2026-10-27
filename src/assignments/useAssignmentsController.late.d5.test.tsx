// @vitest-environment happy-dom
// D5 (item 10) — the controller sends the late policy: none by default (the create body is exactly as before), the chosen policy when
// the teacher turned it on (only with a due date), and setLatePolicy from the assignment page.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRef } from "react";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { useAssignmentsController } from "./useAssignmentsController";
import type { Item } from "./types";

const EXAM = { examId: "e1", title: "امتحان", questions: [{ examQuestionId: "q1", text: "س", marks: 1, presentationType: "open" }] };
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" }];
const ITEM = { assignmentId: "a9", classId: "c1", className: "", title: "واجب", instructions: "", status: "draft", openAt: "", dueAt: "2030-01-05T08:00:00.000Z", questionCount: 1, totalMarks: 1, maxAttempts: 1 } as Item;
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount() {
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase(), body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, method, body });
    const json = url.startsWith("/api/saved-exams") ? { ok: true, exams: [] } : method === "POST" ? { ok: true, assignment: { ...ITEM, title: String(body.title || ITEM.title), latePolicy: body.latePolicy ?? null } } : { ok: true, assignments: [] };
    return { ok: true, status: 200, headers: new Headers(), json: async () => json } as unknown as Response;
  }) as unknown as typeof fetch;
  const refs = { toolbarRef: createRef<HTMLDivElement>(), composerHeadingRef: createRef<HTMLHeadingElement>(), detailHeadingRef: createRef<HTMLHeadingElement>() };
  const hook = renderHook(() => useAssignmentsController({ token: "t", classes: CLASSES, currentExam: EXAM }, refs));
  const posts = (action: string) => calls.filter(c => c.method === "POST" && c.body.action === action);
  return { hook, posts };
}
async function ready(hook: ReturnType<typeof mount>["hook"]) {
  await waitFor(() => expect(hook.result.current.composer.fields.classIds).toEqual(["c1"]));
  await waitFor(() => expect(hook.result.current.composer.source.sourceExam).not.toBeNull());
  act(() => { hook.result.current.composer.fields.setTitle("واجب"); hook.result.current.composer.fields.setOpenAt(""); hook.result.current.composer.fields.setDueAt("2030-01-05T08:00"); });
}

describe("D5 — the late policy in the requests", () => {
  it("off by default: the create body carries no latePolicy", async () => {
    const { hook, posts } = mount();
    await ready(hook);
    await act(async () => { hook.result.current.composer.create(); });
    await waitFor(() => expect(posts("create").length).toBe(1));
    expect(posts("create")[0].body).not.toHaveProperty("latePolicy");
  });
  it("turned on: the create body carries the chosen policy; without a due date it is not sent", async () => {
    const { hook, posts } = mount();
    await ready(hook);
    act(() => { hook.result.current.composer.fields.setLatePolicy({ windowHours: 48, deductionPercent: 15 }); });
    await act(async () => { hook.result.current.composer.create(); });
    await waitFor(() => expect(posts("create").length).toBe(1));
    expect(posts("create")[0].body).toMatchObject({ action: "create", latePolicy: { windowHours: 48, deductionPercent: 15 } });
    act(() => { hook.result.current.composer.fields.setClassIds(["c1"]); hook.result.current.composer.fields.setDueAt(""); });
    await act(async () => { hook.result.current.composer.create(); });
    await waitFor(() => expect(posts("create").length).toBe(2));
    expect(posts("create")[1].body).not.toHaveProperty("latePolicy");
  });
  it("the assignment page's editor sends setLatePolicy with the new value", async () => {
    const { hook, posts } = mount();
    await waitFor(() => expect(hook.result.current.composer.fields.classIds).toEqual(["c1"]));
    await act(async () => { hook.result.current.list.setLatePolicy(ITEM, { windowHours: 24, deductionPercent: 10 }); });
    await waitFor(() => expect(posts("setLatePolicy").length).toBe(1));
    expect(posts("setLatePolicy")[0].body).toEqual({ assignmentId: "a9", action: "setLatePolicy", latePolicy: { windowHours: 24, deductionPercent: 10 } });
  });
});
