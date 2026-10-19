// @vitest-environment happy-dom
/// <reference types="node" />
// Phase P7 — condensed stages in the UI, over the REAL handlers (in-memory container) with a class that started on the
// OLD stage set (snapshot template v1, progress on B01…):
//   • the student sees only the condensed stages, each with the items it covers («يشمل: …»), and the read writes nothing;
//   • the teacher's profile shows the converted stages: a fully approved group is approved, a partly done one waits for
//     the teacher («جاهزة للفحص») with the conversion note naming what was done, and «اعتماد» approves the merged stage.
// Fail-first: run against 69a6705b (no condensed stages: the old B01… rows show and no item list exists).
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StudentProjectPanel from "./StudentProjectPanel";
import ProjectStudentDetail from "./ProjectStudentDetail";
import { stageStatusLabel } from "./teacherPresentation";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { handler: studentTracker } = nodeRequire("../../api/src/functions/student-project-tracker.js");
const { getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");
const OLD = nodeRequire("../../api/tests/fixtures/project-templates-pre-p7/899373.json");

type Body = Record<string, unknown>;
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const NOW = "2026-10-01T00:00:00.000Z";
const DEF = getProjectDefinition(CODE);
const T = { status: "approved", approvedBy: "teacher-1", approvedAt: NOW, updatedAt: NOW };
const user = (id: string, cid: string, name: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: name, code: "C" + id });
const room = (id: string) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW });
const oldSnapshot = () => ({ schemaVersion: 1, projectCode: CODE, classId: "c1", templateVersion: OLD.templateVersion, tracks: DEF.tracks, trackWeights: OLD.trackWeights, config: OLD.config, groups: OLD.groups, stages: OLD.stages, createdAt: NOW, updatedAt: NOW });
// B01 approved + B02 ready (B03 not started) → BK01 waits for the teacher; B04–B07 approved with 80 → BK02 approved (80).
const OLD_PROGRESS = { B01: { ...T, score: 90 }, B02: { status: "ready_for_review", updatedAt: NOW }, B04: { ...T, score: 80 }, B05: { ...T, score: 80 }, B06: { ...T, score: 80 }, B07: { ...T, score: 80 } };

function seed() {
  return createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1", "أحمد"),
    [NS.configName("c1")]: oldSnapshot(),
    [NS.progressName("c1", "s1")]: { schemaVersion: 1, programCode: CODE, classId: "c1", studentId: "s1", startedAt: NOW, updatedAt: NOW, stages: OLD_PROGRESS, history: [] }
  });
}
function route(handler: typeof tracker, deps: Body) {
  const posts: Body[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") posts.push(body!);
    const r = await handler({ method, url: "https://x" + String(input), json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  return posts;
}
const items = (id: string) => DEF.stages.find((s: { stageId: string }) => s.stageId === id).description as string;

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P7 — the student sees the condensed stages with their items", () => {
  it("only BK… rows, each listing what it covers; the merged progress shows; the read writes nothing", async () => {
    const ctx = seed();
    const before = JSON.stringify(ctx.getJson(NS.configName("c1"))) + JSON.stringify(ctx.getJson(NS.progressName("c1", "s1")));
    route(studentTracker, { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {}, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) });
    render(<StudentProjectPanel token="st" />);
    await screen.findByRole("group", { name: "عرض المراحل" });
    fireEvent.click(within(screen.getByRole("group", { name: "عرض المراحل" })).getByRole("button", { name: /^الكل/ }));
    const codes = Array.from(document.querySelectorAll(".eb-sp-stage-code")).map(n => n.textContent);
    expect(codes).toEqual(DEF.stages.filter((s: { track: string; active: boolean }) => s.track === "book" && s.active).map((s: { stageId: string }) => s.stageId));
    const row = (id: string) => screen.getByText(id, { selector: ".eb-sp-stage-code" }).closest("li") as HTMLElement;
    expect(within(row("BK01")).getByText("يشمل: " + items("BK01"))).toBeTruthy();
    expect(items("BK01")).toBe("صفحة الغلاف · الفهرست · المقدمة");
    expect(row("BK02").className).toContain("is-approved");
    expect(row("BK01").className).not.toContain("is-approved");               // partly done: never approved for the student
    expect(JSON.stringify(ctx.getJson(NS.configName("c1"))) + JSON.stringify(ctx.getJson(NS.progressName("c1", "s1")))).toBe(before);
  });
});

describe("P7 — the teacher's profile after the conversion", () => {
  it("a partly done stage waits with the conversion note; «اعتماد» approves the merged stage; the old rows are gone", async () => {
    const ctx = seed();
    const posts = route(tracker, { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} });
    render(<ProjectStudentDetail token="t" projectCode={CODE} classId="c1" studentId="s1" tracks={DEF.tracks} onBack={() => {}} onChanged={() => {}} onReadyChanged={() => {}} />);
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: أحمد" });
    const row = (id: string) => document.querySelector('[data-stage-id="' + id + '"]') as HTMLElement | null;
    await waitFor(() => expect(row("BK01")).toBeTruthy());
    expect(row("B01")).toBeNull();
    const badge = (id: string) => (row(id)!.querySelector(".eb-stage-cell-status") as HTMLElement).textContent;
    expect(badge("BK02")).toBe(stageStatusLabel("approved"));
    expect(badge("BK01")).toBe(stageStatusLabel("ready_for_review"));
    fireEvent.click(within(row("BK01")!).getByRole("button", { name: "تفاصيل وملاحظة المرحلة BK01" }));
    const panel = document.getElementById("eb-stage-BK01") as HTMLElement;
    expect(panel.textContent).toContain(items("BK01"));
    expect(panel.textContent).toContain("تحويل المراحل المختصرة — B01 صفحة الغلاف: معتمدة (90) · B02 الفهرست: جاهزة للفحص · لم تبدأ: B03");
    fireEvent.click(within(row("BK01")!).getByRole("button", { name: "اعتماد المرحلة BK01" }));
    await waitFor(() => expect(ctx.getJson(NS.progressName("c1", "s1")).stages.BK01.status).toBe("approved"));
    expect(posts).toEqual([{ projectCode: CODE, action: "progress.update", classId: "c1", studentId: "s1", stageId: "BK01", status: "approved" }]);
    expect(ctx.getJson(NS.progressName("c1", "s1")).condensedFrom.stages.B01).toMatchObject({ status: "approved", score: 90 });   // archived, never lost
  });
});
