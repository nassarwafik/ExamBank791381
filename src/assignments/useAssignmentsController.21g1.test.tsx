// @vitest-environment happy-dom
// Phase 21G.1 — the controller hook driven directly (no view): the guards that the view's disabled controls normally hide. A create
// called with an invalid availability window, or with no content, sends nothing — defence in depth behind the disabled button.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRef } from "react";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { useAssignmentsController } from "./useAssignmentsController";

const EXAM = { examId: "e1", title: "امتحان", questions: [{ examQuestionId: "q1", text: "س", marks: 1, presentationType: "open" }] };
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" }];
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount() {
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase(), body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, method, body });
    const json = url.startsWith("/api/saved-exams") ? { ok: true, exams: [] } : body.action === "create" ? { ok: true, assignment: { assignmentId: "a9", classId: "c1", className: "", title: body.title, instructions: "", status: "draft", openAt: "", dueAt: "", questionCount: 1, totalMarks: 1, maxAttempts: 1 } } : { ok: true, assignments: [] };
    return { ok: true, status: 200, headers: new Headers(), json: async () => json } as unknown as Response;
  }) as unknown as typeof fetch;
  const refs = { toolbarRef: createRef<HTMLDivElement>(), composerHeadingRef: createRef<HTMLHeadingElement>(), detailHeadingRef: createRef<HTMLHeadingElement>() };
  const hook = renderHook(() => useAssignmentsController({ token: "t", classes: CLASSES, currentExam: EXAM }, refs));
  const creates = () => calls.filter(c => c.method === "POST" && c.body.action === "create");
  return { hook, creates };
}

describe("useAssignmentsController create guards", () => {
  it("never sends a create while the availability window is invalid, and sends exactly one once it is fixed", async () => {
    const { hook, creates } = mount();
    await waitFor(() => expect(hook.result.current.composer.fields.classId).toBe("c1"));
    await waitFor(() => expect(hook.result.current.composer.source.sourceExam).not.toBeNull());
    act(() => { hook.result.current.composer.fields.setTitle("واجب"); hook.result.current.composer.fields.setOpenAt("2030-01-02T08:00"); hook.result.current.composer.fields.setDueAt("2030-01-01T08:00"); });
    expect(hook.result.current.composer.canCreate).toBe(false);
    await act(async () => { hook.result.current.composer.create(); });
    expect(creates()).toEqual([]);
    act(() => { hook.result.current.composer.fields.setDueAt("2030-01-05T08:00"); });
    expect(hook.result.current.composer.canCreate).toBe(true);
    await act(async () => { hook.result.current.composer.create(); });
    await waitFor(() => expect(creates().length).toBe(1));
    expect(creates()[0].body).toMatchObject({ action: "create", classId: "c1", title: "واجب", publish: false });
  });
  it("never sends a create without a title", async () => {
    const { hook, creates } = mount();
    await waitFor(() => expect(hook.result.current.composer.source.sourceExam).not.toBeNull());
    act(() => { hook.result.current.composer.fields.setTitle("   "); });
    await act(async () => { hook.result.current.composer.create(); });
    expect(creates()).toEqual([]);
  });
});
