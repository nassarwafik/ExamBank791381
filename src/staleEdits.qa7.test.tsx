// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createRequire } from "node:module";
import { render, cleanup, screen, waitFor, fireEvent, within, act } from "@testing-library/react";
import AssignmentReview from "./AssignmentReview";
import TeacherPlatform from "./TeacherPlatform";
import ProjectStageSettings from "./projects/ProjectStageSettings";
import type { TrackMeta } from "./projects/types";

// QA-7 — three whole-object editors assert the version they loaded; when another tab / teacher saved first, the server refuses
// (409 *_STALE) and the page shows the CURRENT data instead of writing its older values back.
//   AssignmentReview  sends expectedReviewRevision; on REVIEW_STALE it reloads (keeping only the fields edited here) and says so.
//   TeacherPlatform   sends expectedProfileRevision on a student edit; on STUDENT_STALE it closes the form on the reloaded roster.
//   ProjectStageSettings sends expectedTemplateRevision; on TEMPLATE_STALE it loads the current template (REAL server handler).
// (The class project toggle now sends baseProgramCodes: TeacherPlatform.ux4.test.tsx pins that request.)

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});

describe("QA-7 AssignmentReview", () => {
  const A = { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 5, totalMarks: 15, percentage: 33, manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview", startedAt: "", endedAt: "", endReason: "submitted", timedOut: false };
  const Q = (manualScore: number | null) => [{ questionId: "q2", questionNumber: "1", sectionId: "s1", text: "اشرح", textHtml: "", marks: 10, type: "shortAnswer", options: [], fields: [], wordBank: [], parts: null, studentAnswer: { kind: "text", value: "ج" }, expectedAnswer: null, autoGrade: { questionId: "q2", score: 0, maxMarks: 10, manualReview: true }, manualScore, teacherComment: "" }];
  const body = (rev: number, feedback: string, manualScore: number | null) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 15 }, student: { studentId: "s1", studentName: "أ", studentCode: "S1" }, attempt: { ...A, teacherFeedback: feedback, reviewRevision: rev }, attempts: [A], questions: Q(manualScore) });
  it("sends the loaded version; on REVIEW_STALE it reloads the other tab's decision, keeps nothing stale, and reports why", async () => {
    let gets = 0;
    const saves: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input), method = (init && init.method) || "GET";
      if (url.includes("/api/assignment-review") && method === "GET") { gets++; return Promise.resolve({ status: 200, ok: true, json: async () => (gets === 1 ? body(3, "", null) : body(4, "عمل ممتاز", 9)) } as Response); }
      if (url.includes("/api/assignment-review")) { saves.push(JSON.parse(String(init!.body))); return Promise.resolve({ status: 409, ok: false, json: async () => ({ ok: false, code: "REVIEW_STALE", error: "حُفظ تصحيح أحدث لهذه المحاولة من نافذة أو جهاز آخر." }) } as Response); }
      return Promise.resolve({ status: 404, ok: false, json: async () => ({ ok: false }) } as Response);
    }) as unknown as typeof fetch;
    const onSaved = vi.fn();
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={onSaved} />);
    expect(await screen.findByText(/يحتاج مراجعة/)).toBeTruthy();
    fireEvent.click(screen.getByText(/حفظ واعتماد التصحيح/));
    await waitFor(() => expect(gets).toBe(2));
    expect(saves[0]).toMatchObject({ action: "saveReview", expectedReviewRevision: 3 });
    expect(await screen.findByText(/حُفظ تصحيح أحدث/)).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByDisplayValue("عمل ممتاز") as HTMLTextAreaElement).value).toBe("عمل ممتاز");   // the other tab's feedback is shown
  });
});

describe("QA-7 TeacherPlatform student edit", () => {
  const S1 = { userId: "s1", code: "111111111", identityNumber: "111111111", firstName: "علي", familyName: "حسن", displayName: "علي حسن", classId: "c1", active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0, profileRevision: 4 };
  const CLASSES = [{ classId: "c1", name: "صف أول", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 1, createdAt: "2026-01-03" }];
  it("sends expectedProfileRevision; on STUDENT_STALE the form closes on the reloaded roster with the reason", async () => {
    let roster = [S1];
    const posts: Record<string, unknown>[] = [];
    let studentGets = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input), method = (init?.method || "GET").toUpperCase();
      const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response;
      if (url.includes("/api/project-tracker")) return json({ ok: true, projects: [] });
      if (url.includes("/api/classrooms") && method === "GET") return json({ ok: true, classes: CLASSES });
      if (url.includes("/api/students") && method === "GET") { studentGets++; return json({ ok: true, students: roster }); }
      if (url.includes("/api/students") && method === "POST") {
        posts.push(JSON.parse(String(init!.body)));
        roster = [{ ...S1, firstName: "عليّ", displayName: "عليّ حسن", profileRevision: 5 }];   // the other tab's save
        return json({ ok: false, code: "STUDENT_STALE", error: "عُدّلت بيانات هذا الطالب في نافذة أو جهاز آخر بعد فتحك لها." }, 409);
      }
      return json({ ok: true });
    }) as unknown as typeof fetch;
    render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
    await screen.findByText("علي");
    const row = screen.getByText("علي").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /^إجراءات / }));
    const menu = await screen.findByRole("group", { name: /^إجراءات / });
    fireEvent.click(within(menu).getByRole("button", { name: "تعديل" }));
    const modal = await screen.findByRole("dialog", { name: "تعديل تفاصيل الطالب" });
    const before = studentGets;
    fireEvent.click(within(modal).getByRole("button", { name: "حفظ التغييرات" }));
    await screen.findByText(/عُدّلت بيانات هذا الطالب/);
    expect(posts[0]).toMatchObject({ action: "update", userId: "s1", expectedProfileRevision: 4 });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "تعديل تفاصيل الطالب" })).toBeNull());
    expect(studentGets).toBeGreaterThan(before);
    expect(await screen.findByText("عليّ")).toBeTruthy();
  });
});

describe("QA-7 ProjectStageSettings (REAL project-tracker handler)", () => {
  const nodeRequire = createRequire(import.meta.url);
  const { handler: tracker } = nodeRequire("../api/src/functions/project-tracker.js");
  const { getProjectDefinition, getStorageNamespace } = nodeRequire("../api/src/lib/project-tracker/registry.js");
  const { buildClassSnapshot } = nodeRequire("../api/src/lib/project-tracker/service.js");
  const { createMemoryContainer } = nodeRequire("../api/tests/fixtures/memory-container.js");
  const CODE = "899373", NS = getStorageNamespace(CODE), NOW = "2026-10-01T00:00:00.000Z";
  const TRACKS: TrackMeta[] = getProjectDefinition(CODE).tracks;
  const FIRST = (getProjectDefinition(CODE).stages as { stageId: string; track: string; order: number }[]).filter(s => s.track === "book").sort((a, b) => a.order - b.order)[0].stageId;
  it("sends the loaded version; another teacher's newer save is not reverted: the editor loads it and says why", async () => {
    const ctx = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "صف", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW }, [NS.configName("c1")]: buildClassSnapshot(getProjectDefinition(CODE), "c1", NOW) });
    const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
    const call = async (method: string, url: string, body?: Record<string, unknown>) => { const r = await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps); return r; };
    const posts: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method || "GET", body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (method === "POST") posts.push(body);
      const r = await call(method, String(input), body);
      return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
    }) as unknown as typeof fetch;
    render(<ProjectStageSettings token="t" projectCode={CODE} classId="c1" tracks={TRACKS} readOnly={false} />);
    const input = () => screen.getByRole("textbox", { name: "عنوان المرحلة " + FIRST }) as HTMLInputElement;
    await waitFor(() => expect(input()).toBeTruthy());
    // another teacher saves a new title for the first stage (version 0 → 1)
    const stored = ctx.getJson(NS.configName("c1"));
    const theirs = stored.stages.map((s: { stageId: string }) => s.stageId === FIRST ? { ...s, title: "عنوان المعلم الآخر" } : s);
    expect((await call("POST", "/api/project-tracker", { projectCode: CODE, classId: "c1", action: "template.update", expectedTemplateRevision: 0, template: { stages: theirs } })).status).toBe(200);
    fireEvent.change(input(), { target: { value: "عنواني" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ التغييرات" }));
    await screen.findByText(/عدّل معلم آخر/);
    expect(posts[0]).toMatchObject({ action: "template.update", expectedTemplateRevision: 0 });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(input().value).toBe("عنوان المعلم الآخر");
    expect(ctx.getJson(NS.configName("c1")).stages.find((s: { stageId: string }) => s.stageId === FIRST).title).toBe("عنوان المعلم الآخر");
  });
});
