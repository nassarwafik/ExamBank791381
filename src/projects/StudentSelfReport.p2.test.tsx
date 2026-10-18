// @vitest-environment happy-dom
/// <reference types="node" />
// Phase P2 — student self-report end to end over the REAL handlers (in-memory container): the student opens an explicit
// marking mode (no inputs by default), picks completed stages (never a teacher-approved one), saves them in ONE request
// carrying only the project, the stage ids and mark; they show «منفّذة — بانتظار تأكيد المعلم» and count at once; the
// student can undo. The teacher sees them in «حدّدها الطلاب» and on the profile («حدّدها الطالب» + «تأكيد») and confirms.
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import StudentProjectPanel from "./StudentProjectPanel";
import ProjectBulkReview from "./ProjectBulkReview";
import ProjectStudentDetail from "./ProjectStudentDetail";
import type { TrackMeta } from "./types";

const nodeRequire = createRequire(import.meta.url);
const { handler: studentTracker } = nodeRequire("../../api/src/functions/student-project-tracker.js");
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const NOW = "2026-10-01T00:00:00.000Z";
const BOOK = (getProjectDefinition(CODE).stages as { stageId: string; track: string; active?: boolean; order: number; title: string }[]).filter(s => s.active === true && s.track === "book").sort((a, b) => a.order - b.order);
const [B1, B2, B3] = BOOK;
const TRACKS: TrackMeta[] = getProjectDefinition(CODE).tracks;
const user = (id: string, cid: string, name: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: name, code: "C" + id });
const room = (id: string, over: Body = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });

function server(seed: Record<string, unknown> = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1", "أحمد"),
    [NS.progressName("c1", "s1")]: { schemaVersion: 1, programCode: CODE, classId: "c1", studentId: "s1", startedAt: NOW, updatedAt: NOW, stages: { [B3.stageId]: { status: "approved", approvedBy: "teacher-1", approvedAt: NOW } }, history: [] },
    ...seed
  });
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const studentDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const posts: Body[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") posts.push(body!);
    const h = url.startsWith("/api/student-project-tracker") ? (req: unknown) => studentTracker(req, studentDeps) : (req: unknown) => tracker(req, teacherDeps);
    const r = await h({ method, url: "https://x" + url, json: async () => body ?? {} });
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  return { ctx, posts, doc: () => ctx.getJson(NS.progressName("c1", "s1")) };
}
const label = (s: { stageId: string; title: string }) => s.stageId + " — " + s.title;
const rowOf = (s: { stageId: string }) => screen.getByText(s.stageId, { selector: ".eb-sp-stage-code" }).closest("li") as HTMLElement;
async function mountStudent() {
  render(<StudentProjectPanel token="st" />);
  await screen.findByRole("region", { name: "تحديد المراحل المنفّذة" });
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P2 student — mark completed stages", () => {
  it("opens an explicit marking mode, never offers a teacher-approved stage, and saves the picks in ONE minimal request", async () => {
    const s = server();
    await mountStudent();
    expect(document.querySelectorAll("input").length).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "تحديد المراحل التي أنجزتها" }));
    expect(within(rowOf(B3)).queryByRole("checkbox")).toBeNull();
    const save = screen.getByRole("button", { name: "حفظ كمنفّذة" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "أنجزت " + label(B1) }));
    fireEvent.click(screen.getByRole("checkbox", { name: "أنجزت " + label(B2) }));
    expect(screen.getByText("اخترت 2 مرحلة")).toBeTruthy();
    fireEvent.click(save);
    await screen.findByText("تم تحديد 2 مرحلة كمنفّذة. تظهر الآن لمعلمك.");
    expect(s.posts).toEqual([{ projectCode: CODE, stageIds: [B1.stageId, B2.stageId], mark: true }]);
    expect(s.doc().stages[B1.stageId]).toMatchObject({ status: "approved", selfReportedBy: "s1" });
    await within(rowOf(B1)).findByText("منفّذة — بانتظار تأكيد المعلم");
    expect(within(rowOf(B3)).queryByText("منفّذة — بانتظار تأكيد المعلم")).toBeNull();
    expect(document.querySelectorAll("input").length).toBe(0);                // the mode closes after a save
  });

  it("undoes the student's own unconfirmed mark", async () => {
    const s = server();
    await mountStudent();
    fireEvent.click(screen.getByRole("button", { name: "تحديد المراحل التي أنجزتها" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "أنجزت " + label(B1) }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ كمنفّذة" }));
    const undo = await screen.findByRole("button", { name: "تراجع عن تحديد " + label(B1) });
    fireEvent.click(undo);
    await screen.findByText("تم التراجع عن التحديد.");
    expect(s.posts.at(-1)).toEqual({ projectCode: CODE, stageIds: [B1.stageId], mark: false });
    expect(s.doc().stages[B1.stageId].status).toBe("not_started");
    expect(within(rowOf(B3)).queryByRole("button", { name: /تراجع/ })).toBeNull();
  });

  it("shows the server's refusal on an archived class and writes nothing", async () => {
    const s = server({ "platform/classes/c1.json": room("c1", { status: "archived", active: false }) });
    await mountStudent();
    fireEvent.click(screen.getByRole("button", { name: "تحديد المراحل التي أنجزتها" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "أنجزت " + label(B1) }));
    fireEvent.click(screen.getByRole("button", { name: "حفظ كمنفّذة" }));
    expect((await screen.findByRole("alert")).textContent).toBe("الصف مؤرشف — لا يمكن تعديل المشروع.");
    expect(s.doc().stages[B1.stageId]).toBeUndefined();
  });
});

describe("P2 teacher — confirm the students' marks", () => {
  it("bulk review lists them under «حدّدها الطلاب» and «تأكيد المحدد» confirms them", async () => {
    const s = server({ [NS.progressName("c1", "s1")]: { schemaVersion: 1, programCode: CODE, classId: "c1", studentId: "s1", startedAt: NOW, updatedAt: NOW, stages: { [B1.stageId]: { status: "approved", approvedBy: "s1", approvedAt: NOW, selfReportedAt: NOW, selfReportedBy: "s1", selfReportedFrom: "not_started" } }, history: [] } });
    render(<ProjectBulkReview token="t" projectCode={CODE} classId="c1" tracks={TRACKS} readOnly={false} />);
    const mode = await screen.findByRole("button", { name: "حدّدها الطلاب (1)" });
    expect(mode.getAttribute("aria-pressed")).toBe("true");
    const list = screen.getByRole("list", { name: "مراحل حدّدها الطلاب" });
    expect(within(list).getByText("حدّدها الطالب")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "أحمد — " + B1.stageId }));
    fireEvent.click(screen.getByRole("button", { name: /تأكيد المحدد/ }));
    await screen.findByText("تم تأكيد 1.");
    expect(s.doc().stages[B1.stageId]).toMatchObject({ status: "approved", approvedBy: "teacher-1" });
    expect(s.doc().stages[B1.stageId].selfReportedAt).toBeUndefined();
    await screen.findByText("لا توجد مراحل حدّدها الطلاب بانتظار تأكيدك.");
  });

  it("the student profile flags the mark and its «تأكيد» button confirms it", async () => {
    const s = server({ [NS.progressName("c1", "s1")]: { schemaVersion: 1, programCode: CODE, classId: "c1", studentId: "s1", startedAt: NOW, updatedAt: NOW, stages: { [B1.stageId]: { status: "approved", approvedBy: "s1", approvedAt: NOW, selfReportedAt: NOW, selfReportedBy: "s1", selfReportedFrom: "not_started" } }, history: [{ eventId: "e1", stageId: B1.stageId, type: "status", fromStatus: "not_started", toStatus: "approved", source: "student", actor: "s1", createdAt: NOW }] } });
    render(<ProjectStudentDetail token="t" projectCode={CODE} classId="c1" studentId="s1" tracks={TRACKS} onBack={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: أحمد" });
    const row = document.querySelector('[data-stage-id="' + B1.stageId + '"]') as HTMLElement;
    expect(within(row).getByText("حدّدها الطالب")).toBeTruthy();
    expect(screen.getByText("حدّدها الطالب كمنفّذة — " + B1.stageId)).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "تأكيد المرحلة " + B1.stageId }));
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(s.doc().stages[B1.stageId].selfReportedAt).toBeUndefined();
    expect(within(row).queryByText("حدّدها الطالب")).toBeNull();
    expect((within(row).getByRole("button", { name: "اعتماد المرحلة " + B1.stageId }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("تأكيد المعلم — " + B1.stageId)).toBeTruthy();
  });
});
