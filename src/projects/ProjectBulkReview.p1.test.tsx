// @vitest-environment happy-dom
/// <reference types="node" />
// Phase P1 — bulk review over the REAL project-tracker handler (in-memory container): the ready list opens first when
// something waits, «اعتماد المحدد» approves every selected pair in ONE progress.bulk request without a score, an optional
// common score rides along, «حسب المرحلة» approves one stage for the whole class, «إرجاع» asks first, a failed pair stays
// selected with its reason, a stale board for a previous class never shows, and an archived class exposes no controls.
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProjectBulkReview from "./ProjectBulkReview";
import { bulkNoticeText } from "./bulkReview";
import type { TrackMeta } from "./types";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const NOW = "2026-10-01T00:00:00.000Z";
const STAGES = (getProjectDefinition(CODE).stages as { stageId: string; track: string; active?: boolean; order: number }[]).filter(s => s.active === true);
const BOOK = STAGES.filter(s => s.track === "book").sort((a, b) => a.order - b.order);
const [B1, B2] = [BOOK[0].stageId, BOOK[1].stageId];
const TRACKS: TrackMeta[] = getProjectDefinition(CODE).tracks;
const user = (id: string, cid: string, name: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: name, code: "C" + id });
const room = (id: string, over: Body = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
const progress = (sid: string, cid: string, stages: Record<string, Body>) => ({ schemaVersion: 1, programCode: CODE, classId: cid, studentId: sid, startedAt: NOW, updatedAt: NOW, stages, history: [] });

function server(seed: Record<string, unknown> = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/classes/c2.json": room("c2"),
    "platform/users/s1.json": user("s1", "c1", "أحمد"), "platform/users/s2.json": user("s2", "c1", "بيان"), "platform/users/s3.json": user("s3", "c1", "جواد"),
    "platform/users/t1.json": user("t1", "c2", "طالب آخر"),
    [NS.progressName("c1", "s1")]: progress("s1", "c1", { [B1]: { status: "ready_for_review" }, [B2]: { status: "ready_for_review" } }),
    [NS.progressName("c1", "s2")]: progress("s2", "c1", { [B1]: { status: "ready_for_review" } }),
    ...seed
  });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const posts: Body[] = [];
  // Optional: the server "fails" this pair with a storage conflict (it is removed from the request before the real handler).
  const control: { conflictOn: string } = { conflictOn: "" };
  const holds: Record<string, Promise<void> | undefined> = {};
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") posts.push(body!);
    const cid = new URL(url, "https://x").searchParams.get("classId") || "";
    if (method === "GET" && holds[cid]) await holds[cid];
    const key = (x: Body) => x.studentId + "|" + x.stageId;
    const dropped = method === "POST" && control.conflictOn ? (body!.items as Body[]).filter(x => key(x) === control.conflictOn) : [];
    const sent = dropped.length ? { ...body, items: (body!.items as Body[]).filter(x => key(x) !== control.conflictOn) } : body;
    const r = await tracker({ method, url: "https://x" + url, json: async () => sent ?? {} }, deps);
    if (dropped.length) {
      const j = r.jsonBody as { results: Body[]; totals: Record<string, number> };
      j.results.push({ studentId: dropped[0].studentId, stageId: dropped[0].stageId, ok: false, error: "conflict" });
      j.totals = { ...j.totals, requested: j.totals.requested + 1, failed: j.totals.failed + 1 };
    }
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  return { ctx, posts, holds, control, doc: (sid: string, cid = "c1") => ctx.getJson(NS.progressName(cid, sid)) };
}
const bar = () => screen.getByRole("region", { name: "إجراءات التقييم الجماعي" });
const approveBtn = () => within(bar()).getByRole("button", { name: /اعتماد المحدد/ });
async function mount(props: Partial<{ classId: string; readOnly: boolean; onReadyChanged: () => void }> = {}) {
  const view = render(<ProjectBulkReview token="t" projectCode={CODE} classId={props.classId || "c1"} tracks={TRACKS} readOnly={!!props.readOnly} onReadyChanged={props.onReadyChanged} />);
  await screen.findByRole("group", { name: "طريقة العرض" });
  return view;
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P1 bulk review — ready list", () => {
  it("opens on the stages waiting for review across the class and approves the selection in ONE request without a score", async () => {
    const s = server();
    const onReadyChanged = vi.fn();
    await mount({ onReadyChanged });
    expect(screen.getByRole("button", { name: "بانتظار الاعتماد (3)" }).getAttribute("aria-pressed")).toBe("true");
    const list = screen.getByRole("list", { name: "مراحل بانتظار الاعتماد" });
    // Phase P6 — the waiting list is grouped (a group per student, each with its own list), so its rows are counted by
    // their checkboxes (updated deliberately; the same three stages).
    expect(within(list).getAllByRole("checkbox")).toHaveLength(3);
    expect(approveBtn()).toHaveProperty("disabled", true);
    fireEvent.click(within(bar()).getByRole("button", { name: "تحديد الكل" }));
    expect(within(bar()).getByRole("status").textContent).toBe("3 محدد من 3");
    fireEvent.click(approveBtn());
    await screen.findByText("تم اعتماد 3.");
    expect(s.posts).toHaveLength(1);
    expect(s.posts[0]).toMatchObject({ action: "progress.bulk", classId: "c1", status: "approved" });
    expect(s.posts[0]).not.toHaveProperty("score");
    expect((s.posts[0].items as unknown[]).length).toBe(3);
    expect(s.doc("s1").stages[B1].status).toBe("approved");
    expect(s.doc("s1").stages[B2].status).toBe("approved");
    expect(s.doc("s2").stages[B1].status).toBe("approved");
    expect(s.doc("s1").stages[B1].score).toBeUndefined();
    expect(onReadyChanged).toHaveBeenCalledTimes(1);
    await screen.findByText("لا توجد مراحل بانتظار الاعتماد.");
  });

  it("sends an optional common score with the approval and refuses an out-of-range one", async () => {
    const s = server();
    await mount();
    fireEvent.click(screen.getByRole("checkbox", { name: "بيان — " + B1 }));
    const scoreField = within(bar()).getByLabelText("علامة موحّدة (اختياري)");
    fireEvent.change(scoreField, { target: { value: "120" } });
    expect(approveBtn()).toHaveProperty("disabled", true);
    fireEvent.change(scoreField, { target: { value: "85" } });
    fireEvent.click(approveBtn());
    await screen.findByText("تم اعتماد 1.");
    expect(s.posts[0]).toMatchObject({ status: "approved", score: 85, items: [{ studentId: "s2", stageId: B1 }] });
    expect(s.doc("s2").stages[B1]).toMatchObject({ status: "approved", score: 85 });
  });
});

describe("P1 bulk review — by stage", () => {
  it("approves one stage for every unapproved student of the class", async () => {
    const s = server();
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "حسب المرحلة" }));
    const list = await screen.findByRole("list", { name: "طلاب المرحلة " + B1 });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(within(bar()).getByRole("button", { name: "تحديد غير المعتمدين" }));
    fireEvent.click(approveBtn());
    await screen.findByText("تم اعتماد 3.");
    for (const sid of ["s1", "s2", "s3"]) expect(s.doc(sid).stages[B1].status).toBe("approved");
    expect(s.doc("s1").stages[B2].status).toBe("ready_for_review");
  });

  it("asks before returning stages to in-progress and sends nothing when cancelled", async () => {
    const s = server({ [NS.progressName("c1", "s3")]: progress("s3", "c1", { [B1]: { status: "approved" } }) });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "حسب المرحلة" }));
    await screen.findByRole("list", { name: "طلاب المرحلة " + B1 });
    fireEvent.click(screen.getByRole("checkbox", { name: "جواد" }));
    fireEvent.click(within(bar()).getByRole("button", { name: "إرجاع إلى قيد التنفيذ" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /إلغاء/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.posts).toHaveLength(0);
    fireEvent.click(within(bar()).getByRole("button", { name: "إرجاع إلى قيد التنفيذ" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "إرجاع 1" }));
    await screen.findByText("أُرجعت إلى قيد التنفيذ 1.");
    expect(s.doc("s3").stages[B1].status).toBe("in_progress");
  });

  it("keeps a failed pair selected with its reason", async () => {
    const s = server();
    await mount();
    fireEvent.click(within(bar()).getByRole("button", { name: "تحديد الكل" }));
    // s2 leaves the class after the board was read: the server refuses that pair, the others are applied.
    s.ctx.setJson("platform/users/s2.json", user("s2", "c2", "بيان"));
    fireEvent.click(approveBtn());
    await screen.findByText("تم اعتماد 2 — تعذر 1.");
    expect(s.doc("s1").stages[B1].status).toBe("approved");
    expect(s.doc("s2").stages[B1].status).toBe("ready_for_review");
  });
});

describe("P1 bulk review — failed pairs", () => {
  it("keeps a pair the server could not save selected, with its reason, ready for a retry", async () => {
    const s = server();
    await mount();
    s.control.conflictOn = "s2|" + B1;
    fireEvent.click(within(bar()).getByRole("button", { name: "تحديد الكل" }));
    fireEvent.click(approveBtn());
    await screen.findByText("تم اعتماد 2 — تعذر 1.");
    await screen.findByText("تعارض مؤقت");
    expect(within(bar()).getByRole("status").textContent).toBe("1 محدد من 1");
    expect((screen.getByRole("checkbox", { name: "بيان — " + B1 }) as HTMLInputElement).checked).toBe(true);
    s.control.conflictOn = "";
    fireEvent.click(approveBtn());
    await screen.findByText("تم اعتماد 1.");
    expect(s.doc("s2").stages[B1].status).toBe("approved");
  });
});

describe("P1 bulk review — class switch and read-only", () => {
  it("never shows a slower board of the previously selected class", async () => {
    const s = server();
    let release = () => {};
    s.holds.c1 = new Promise<void>(r => { release = r; });
    const view = render(<ProjectBulkReview token="t" projectCode={CODE} classId="c1" tracks={TRACKS} readOnly={false} />);
    view.rerender(<ProjectBulkReview token="t" projectCode={CODE} classId="c2" tracks={TRACKS} readOnly={false} />);
    await screen.findByRole("group", { name: "طريقة العرض" });
    release();
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByText("أحمد")).toBeNull();
    expect(screen.getByRole("button", { name: "بانتظار الاعتماد (0)" })).toBeTruthy();
  });

  it("exposes no selection or action on an archived class", async () => {
    server({ "platform/classes/c1.json": room("c1", { status: "archived", active: false }) });
    await mount({ readOnly: true });
    expect(screen.getByText("الصف مؤرشف — للقراءة فقط.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "إجراءات التقييم الجماعي" })).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("formats the server totals", () => {
    expect(bulkNoticeText("تم اعتماد", { requested: 5, changed: 3, unchanged: 1, failed: 1 })).toBe("تم اعتماد 3 — دون تغيير 1 — تعذر 1.");
  });
});
