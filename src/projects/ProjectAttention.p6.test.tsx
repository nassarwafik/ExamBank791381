// @vitest-environment happy-dom
/// <reference types="node" />
// Phase P6 — the teacher sees what the STUDENTS marked as done (P2) without hunting for it, and confirms it quickly:
//   1. the sidebar badge counts it with the ready stages, the hub card names it, the workspace class selector and the
//      «التقييم الجماعي» tab carry per-class figures, the dashboard shows it and opens the right list in one tap, and each
//      student card carries its own figure with a «حدّدوا مراحل» filter;
//   2. the waiting lists are grouped (by student by default, or by stage), can be narrowed to one track, every group has
//      its own one-tap decision, and «تأكيد الكل» asks first — each decision is ONE progress.bulk request.
// Everything runs over the REAL project-tracker handler (in-memory container).
// Fail-first: run against ff61e730.
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProjectBulkReview from "./ProjectBulkReview";
import ProjectTracker from "./ProjectTracker";
import ProjectHub from "./ProjectHub";
import TeacherAppShell from "../shell/TeacherAppShell";
import { projectAttentionOf } from "./projectAttention";
import type { TrackMeta } from "./types";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
type Stage = { stageId: string; track: string; active?: boolean; order: number; title: string };
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const NOW = "2026-10-01T00:00:00.000Z";
const ACTIVE = (getProjectDefinition(CODE).stages as Stage[]).filter(s => s.active === true).sort((a, b) => a.order - b.order);
const BOOK = ACTIVE.filter(s => s.track === "book"), ACCESS = ACTIVE.filter(s => s.track === "access");
const [B1, B2, B3] = BOOK.map(s => s.stageId);
const A1 = ACCESS[0].stageId;
const TRACKS: TrackMeta[] = getProjectDefinition(CODE).tracks;
const ACCESS_TITLE = TRACKS.find(t => t.trackId === "access")!.title;
const SELF = { status: "approved", approvedBy: "x", approvedAt: NOW, selfReportedAt: NOW, selfReportedBy: "x", selfReportedFrom: "not_started" };
const user = (id: string, cid: string, name: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: name, code: "C" + id });
const room = (id: string) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW });
const progress = (sid: string, stages: Record<string, Body>) => ({ schemaVersion: 1, programCode: CODE, classId: "c1", studentId: sid, startedAt: NOW, updatedAt: NOW, stages, history: [] });

// أحمد: B1, B2, A1 marked by himself; بيان: B1 marked + B3 ready for review; جواد: nothing.
function server() {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"),
    "platform/users/s1.json": user("s1", "c1", "أحمد"), "platform/users/s2.json": user("s2", "c1", "بيان"), "platform/users/s3.json": user("s3", "c1", "جواد"),
    [NS.progressName("c1", "s1")]: progress("s1", { [B1]: SELF, [B2]: SELF, [A1]: SELF }),
    [NS.progressName("c1", "s2")]: progress("s2", { [B1]: SELF, [B3]: { status: "ready_for_review" } })
  });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const posts: Body[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") posts.push(body!);
    const r = await tracker({ method, url: "https://x" + String(input), json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  const entry = (sid: string, stageId: string) => (ctx.getJson(NS.progressName("c1", sid)) as { stages: Record<string, Body> }).stages[stageId];
  return { posts, entry };
}
const bar = () => screen.getByRole("region", { name: "إجراءات التقييم الجماعي" });
const groupsList = () => screen.getByRole("list", { name: "مراحل حدّدها الطلاب" });
const groupHeads = () => Array.from(groupsList().querySelectorAll(".eb-review-group-title")).map(h => h.textContent);
async function mountBulk(onReadyChanged?: () => void) {
  render(<ProjectBulkReview token="t" projectCode={CODE} classId="c1" tracks={TRACKS} readOnly={false} onReadyChanged={onReadyChanged} initialMode="self" />);
  await screen.findByRole("list", { name: "مراحل حدّدها الطلاب" });
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P6 — the teacher sees the students' own marks", () => {
  it("the summary parser keeps the server's figures and tolerates an older server", () => {
    expect(projectAttentionOf({ totalReadyForReview: 2, byProject: { [CODE]: 2 }, totalSelfReported: 5, selfReportedByProject: { [CODE]: 5 }, byClass: { [CODE]: { c1: { ready: 2, selfReported: 5 } } } }))
      .toEqual({ total: 2, byProject: { [CODE]: 2 }, selfTotal: 5, selfByProject: { [CODE]: 5 }, byClass: { [CODE]: { c1: { ready: 2, selfReported: 5 } } } });
    expect(projectAttentionOf({ totalReadyForReview: 1, byProject: { [CODE]: 1 } })).toEqual({ total: 1, byProject: { [CODE]: 1 }, selfTotal: 0, selfByProject: {}, byClass: {} });
  });

  it("the sidebar badge counts the marks with the ready stages; the hub card names them", () => {
    render(<TeacherAppShell nav={{ teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [] }} projectReadyTotal={2} projectSelfReportedTotal={4} displayName="م" onNavigate={() => {}} onLogout={() => {}}><p>x</p></TeacherAppShell>);
    const nav = within(screen.getByRole("complementary", { name: "التنقل الرئيسي" })).getByRole("button", { name: /^المشاريع/ });
    expect(nav.textContent).toContain("6 مراحل بانتظار الفحص أو التأكيد");
    cleanup();
    render(<ProjectHub projects={[{ projectCode: CODE, title: "مشروع", tracks: TRACKS }]} status="ready" readyByProject={{ [CODE]: 0 }} selfReportedByProject={{ [CODE]: 4 }} onOpenProject={() => {}} />);
    expect(screen.getByText("4 حدّدها الطلاب بانتظار تأكيدك")).toBeTruthy();
    expect(screen.getByText("لا مراحل بانتظار الفحص")).toBeTruthy();
  });

  it("the workspace: class selector and «التقييم الجماعي» carry the class figures; the dashboard opens «حدّدها الطلاب» in one tap", async () => {
    server();
    render(<ProjectTracker token="t" projectCode={CODE} attentionByClass={{ c1: { ready: 1, selfReported: 4 } }} />);
    await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
    const option = screen.getByRole("option", { name: /صف c1/ });
    expect(option.textContent).toBe("صف c1 — 2026 (1 بانتظار الفحص · 4 حدّدها الطلاب)");
    const views = screen.getByRole("group", { name: "أقسام المشروع" });
    expect(within(views).getByRole("button", { name: /التقييم الجماعي/ }).textContent).toContain("5");
    await screen.findByText("حدّدها الطلاب");
    expect(screen.getByText("من 2 طالب — بانتظار تأكيدك")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تأكيد ما حدّده الطلاب (4)" }));
    await screen.findByRole("list", { name: "مراحل حدّدها الطلاب" });
    expect(screen.getByRole("button", { name: "حدّدها الطلاب (4)" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(views).getByRole("button", { name: /التقييم الجماعي/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("student cards show each student's own marks, and «حدّدوا مراحل» lists only them", async () => {
    server();
    render(<ProjectTracker token="t" projectCode={CODE} />);
    await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
    fireEvent.click(within(screen.getByRole("group", { name: "أقسام المشروع" })).getByRole("button", { name: /تقدّم الطلاب/ }));
    await screen.findByText("جواد");
    const card = (name: string) => screen.getByText(name).closest(".eb-student-card") as HTMLElement;
    expect(within(card("أحمد")).getByText("حدّدها الطالب 3")).toBeTruthy();
    expect(within(card("بيان")).getByText("حدّدها الطالب 1")).toBeTruthy();
    expect(card("جواد").querySelector(".eb-student-card-self")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "حدّدوا مراحل" }));
    await waitFor(() => expect(screen.queryByText("جواد")).toBeNull());
    expect(screen.getByText("2 من 3 طالب")).toBeTruthy();
  });
});

describe("P6 — grouped waiting lists with one-tap decisions", () => {
  it("groups by student with each student's count; one group button confirms only that student's stages in ONE request", async () => {
    const s = server();
    const onReadyChanged = vi.fn();
    await mountBulk(onReadyChanged);
    expect(groupHeads()).toEqual(["أحمد Cs1 (3)", "بيان Cs2 (1)"]);
    fireEvent.click(screen.getByRole("button", { name: "تأكيد مراحل بيان (1)" }));
    await screen.findByText("تم تأكيد 1.");
    expect(s.posts).toEqual([{ action: "progress.bulk", classId: "c1", items: [{ studentId: "s2", stageId: B1 }], status: "approved", projectCode: CODE }]);
    expect(s.entry("s2", B1)).toMatchObject({ status: "approved", approvedBy: "teacher-1" });
    expect(s.entry("s2", B1).selfReportedAt).toBeUndefined();
    expect(s.entry("s1", B1).selfReportedAt).toBe(NOW);                                    // أحمد untouched
    expect(onReadyChanged).toHaveBeenCalledTimes(1);                                       // the badges refresh
    await waitFor(() => expect(groupHeads()).toEqual(["أحمد Cs1 (3)"]));
  });

  it("groups by stage: «تأكيد B01 للجميع» confirms that stage for every student who marked it", async () => {
    const s = server();
    await mountBulk();
    fireEvent.click(within(screen.getByRole("group", { name: "تجميع القائمة" })).getByRole("button", { name: "بالمراحل" }));
    expect(groupHeads().map(h => h!.split(" — ")[0])).toEqual([B1, B2, A1]);
    fireEvent.click(screen.getByRole("button", { name: "تأكيد " + B1 + " للجميع (2)" }));
    await screen.findByText("تم تأكيد 2.");
    expect(s.posts[0].items).toEqual([{ studentId: "s1", stageId: B1 }, { studentId: "s2", stageId: B1 }]);
  });

  it("a track filter narrows the list and its counts; «تأكيد الكل» asks first, then confirms only what is shown", async () => {
    const s = server();
    await mountBulk();
    const tracks = screen.getByRole("group", { name: "مسار القائمة" });
    expect(within(tracks).getAllByRole("button").map(b => b.textContent)).toEqual(["كل المسارات (4)", TRACKS[0].title + " (3)", ACCESS_TITLE + " (1)"]);
    fireEvent.click(within(tracks).getByRole("button", { name: ACCESS_TITLE + " (1)" }));
    expect(groupHeads()).toEqual(["أحمد Cs1 (1)"]);
    fireEvent.click(screen.getByRole("button", { name: "كل المسارات (4)" }));
    fireEvent.click(within(bar()).getByRole("button", { name: "تأكيد الكل (4)" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("سيُؤكَّد 4 مرحلة لـ 2 طالب باسمك. يمكنك إرجاع أي مرحلة لاحقًا.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.posts).toEqual([]);
    fireEvent.click(within(tracks).getByRole("button", { name: TRACKS[0].title + " (3)" }));
    fireEvent.click(within(bar()).getByRole("button", { name: "تأكيد الكل (3)" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "تأكيد 3" }));
    await screen.findByText("تم تأكيد 3.");
    expect(s.posts).toHaveLength(1);
    expect((s.posts[0].items as Body[]).map(x => x.stageId).sort()).toEqual([B1, B1, B2].sort());
    expect(s.entry("s1", A1).selfReportedAt).toBe(NOW);                                    // the other track stays waiting
  });

  it("the ready list is grouped the same way, with «اعتماد» wording", async () => {
    const s = server();
    render(<ProjectBulkReview token="t" projectCode={CODE} classId="c1" tracks={TRACKS} readOnly={false} />);
    const list = await screen.findByRole("list", { name: "مراحل بانتظار الاعتماد" });
    expect(Array.from(list.querySelectorAll(".eb-review-group-title")).map(h => h.textContent)).toEqual(["بيان Cs2 (1)"]);
    fireEvent.click(screen.getByRole("button", { name: "اعتماد مراحل بيان (1)" }));
    await screen.findByText("تم اعتماد 1.");
    expect(s.entry("s2", B3)).toMatchObject({ status: "approved" });
  });
});
