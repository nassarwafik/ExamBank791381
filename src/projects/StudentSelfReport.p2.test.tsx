// @vitest-environment happy-dom
/// <reference types="node" />
// Phase P2 — student self-report end to end over the REAL handlers (in-memory container): the student marks completed
// stages (never a teacher-approved one) in a request carrying only the project, the stage ids and mark; they show
// «منفّذة — بانتظار تأكيد المعلم» and count at once; the student can undo. The teacher sees them in «حدّدها الطلاب» and on
// the profile («حدّدها الطالب» + «تأكيد») and confirms.
// Phase P3 — the P2 marking MODE (checkboxes + «حفظ كمنفّذة») became one-tap «أنجزتها» per stage; the student cases below
// were updated deliberately to that interaction and keep pinning the P2 semantics (request body, never an approved
// stage, undo, archived refusal). The P3 specifics are in StudentProjectOneTap.p3.test.tsx.
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
  await screen.findByRole("group", { name: "عرض المراحل" });
  fireEvent.click(screen.getByRole("button", { name: /^الكل/ }));            // every stage, approved ones included
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P2 student — mark completed stages", () => {
  it("marks a completed stage in ONE minimal request; a teacher-approved stage never offers the action", async () => {
    const s = server();
    await mountStudent();
    expect(document.querySelectorAll("input").length).toBe(0);                // no form inputs at all
    expect(within(rowOf(B3)).queryByRole("button", { name: /أنجزت/ })).toBeNull();
    fireEvent.click(within(rowOf(B1)).getByRole("button", { name: "أنجزت " + label(B1) }));
    await screen.findByText("تم تحديد " + B1.stageId + " كمنفّذة. تظهر الآن لمعلمك.");
    fireEvent.click(within(rowOf(B2)).getByRole("button", { name: "أنجزت " + label(B2) }));
    await screen.findByText("تم تحديد " + B2.stageId + " كمنفّذة. تظهر الآن لمعلمك.");
    expect(s.posts).toEqual([{ projectCode: CODE, stageIds: [B1.stageId], mark: true }, { projectCode: CODE, stageIds: [B2.stageId], mark: true }]);
    expect(s.doc().stages[B1.stageId]).toMatchObject({ status: "approved", selfReportedBy: "s1" });
    await within(rowOf(B1)).findByText("منفّذة — بانتظار تأكيد المعلم");
    expect(within(rowOf(B3)).queryByText("منفّذة — بانتظار تأكيد المعلم")).toBeNull();
  });

  it("undoes the student's own unconfirmed mark", async () => {
    const s = server();
    await mountStudent();
    fireEvent.click(within(rowOf(B1)).getByRole("button", { name: "أنجزت " + label(B1) }));
    const undo = await screen.findByRole("button", { name: "تراجع عن تحديد " + label(B1) });
    fireEvent.click(undo);
    await screen.findByText("تم التراجع عن تحديد " + B1.stageId + ".");
    expect(s.posts.at(-1)).toEqual({ projectCode: CODE, stageIds: [B1.stageId], mark: false });
    expect(s.doc().stages[B1.stageId].status).toBe("not_started");
    expect(within(rowOf(B3)).queryByRole("button", { name: /تراجع/ })).toBeNull();
  });

  // QA-16, updated deliberately: the server now flags an archived class's project read-only, so the page shows it as a record
  // and offers no control the server would refuse (the server still refuses a direct write: student-project-tracker tests).
  it("an archived class's project is shown read-only: no «أنجزت» control, a read-only note, nothing written", async () => {
    const s = server({ "platform/classes/c1.json": room("c1", { status: "archived", active: false }) });
    await mountStudent();
    expect(await screen.findByTestId("project-read-only")).toBeTruthy();
    expect(within(rowOf(B1)).queryByRole("button", { name: "أنجزت " + label(B1) })).toBeNull();
    expect(screen.queryByRole("button", { name: /^أنجزت المجموعة/ })).toBeNull();
    expect(s.posts).toEqual([]);
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

  it("the student profile flags the mark; it shows as «منجز» and a typed score confirms it on save (Phase G2 — the P8 rule)", async () => {
    const s = server({ [NS.progressName("c1", "s1")]: { schemaVersion: 1, programCode: CODE, classId: "c1", studentId: "s1", startedAt: NOW, updatedAt: NOW, stages: { [B1.stageId]: { status: "approved", approvedBy: "s1", approvedAt: NOW, selfReportedAt: NOW, selfReportedBy: "s1", selfReportedFrom: "not_started" } }, history: [{ eventId: "e1", stageId: B1.stageId, type: "status", fromStatus: "not_started", toStatus: "approved", source: "student", actor: "s1", createdAt: NOW }] } });
    render(<ProjectStudentDetail token="t" projectCode={CODE} classId="c1" studentId="s1" tracks={TRACKS} onBack={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: أحمد" });
    const row = document.querySelector('[data-stage-id="' + B1.stageId + '"]') as HTMLElement;
    expect(within(row).getByText("حدّدها الطالب")).toBeTruthy();
    expect(row.className).toContain("is-self");
    expect(screen.getByText("حدّدها الطالب كمنفّذة — " + B1.stageId)).toBeTruthy();
    expect(within(row).getByRole("button", { name: B1.stageId + ": منجز" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(within(row).getByRole("textbox"), { target: { value: "80" } });
    fireEvent.click(within(screen.getByRole("region", { name: "حفظ تغييرات الطالب" })).getByRole("button", { name: /^حفظ التغييرات/ }));
    await screen.findByText("حُفظت 1 علامة، اعتُمدت 1 مرحلة.");
    expect(s.posts.map(p => p.action)).toEqual(["score.bulk", "progress.bulk"]);
    expect(s.doc().stages[B1.stageId]).toMatchObject({ status: "approved", score: 80 });
    expect(s.doc().stages[B1.stageId].selfReportedAt).toBeUndefined();
    const after = document.querySelector('[data-stage-id="' + B1.stageId + '"]') as HTMLElement;
    expect(within(after).queryByText("حدّدها الطالب")).toBeNull();
    expect(after.className).not.toContain("is-self");
    expect(screen.getByText("تأكيد المعلم — " + B1.stageId)).toBeTruthy();
  });
});
