// @vitest-environment happy-dom
/// <reference types="node" />
// Phase P-1 (project safety) — fail-first tests over the REAL project-tracker handler (in-memory container):
//   B1  stage settings: switching class never shows / saves the previous class's stages (in-flight and out-of-order reads);
//   B2  dashboard / students / analytics: a slower response for the previously selected class never renders;
//   B3  a stage weight of 0 is never silently saved (the engine would count it as 1);
//   B5  unsaved stage-settings edits are not lost silently when the class or the view changes.
import { createRequire } from "node:module";
import { Profiler } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import ProjectStageSettings from "./ProjectStageSettings";
import ProjectDashboard from "./ProjectDashboard";
import ProjectStudentCards from "./ProjectStudentCards";
import ProjectAnalytics from "./ProjectAnalytics";
import ProjectTracker from "./ProjectTracker";
import type { TrackMeta } from "./types";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { buildClassSnapshot } = nodeRequire("../../api/src/lib/project-tracker/service.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const NOW = "2026-10-01T00:00:00.000Z";
const TRACKS: TrackMeta[] = getProjectDefinition(CODE).tracks;
const FIRST_STAGE = (getProjectDefinition(CODE).stages as { stageId: string; track: string; order: number; weight: number }[]).filter(s => s.track === "book").sort((a, b) => a.order - b.order)[0];
const FIRST = FIRST_STAGE.stageId;
const FIRST_WEIGHT = FIRST_STAGE.weight;                                       // P7: a condensed stage weighs its merged items (BK01 = 3)
const C1_TITLE = "مرحلة خاصة بالصف الأول";
const user = (id: string, cid: string, name: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: name, code: "C" + id });
const room = (id: string, over: Body = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
function snapshot(cid: string, firstTitle?: string) {
  const s = buildClassSnapshot(getProjectDefinition(CODE), cid, NOW);
  if (firstTitle) s.stages = s.stages.map((st: { stageId: string }) => st.stageId === FIRST ? { ...st, title: firstTitle } : st);
  return s;
}

function server() {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/classes/c2.json": room("c2"),
    "platform/users/a1.json": user("a1", "c1", "أمل"), "platform/users/a2.json": user("a2", "c1", "أنس"), "platform/users/a3.json": user("a3", "c1", "أيمن"),
    "platform/users/b1.json": user("b1", "c2", "باسل"),
    [NS.configName("c1")]: snapshot("c1", C1_TITLE), [NS.configName("c2")]: snapshot("c2")
  });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const posts: Body[] = [];
  const holds = new Map<string, { promise: Promise<void>; release: () => void }>();
  const hold = (resource: string, classId: string) => { let release = () => {}; const promise = new Promise<void>(r => { release = r; }); holds.set(resource + "|" + classId, { promise, release }); return release; };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") posts.push(body!);
    const q = new URL(url, "https://x").searchParams;
    const h = method === "GET" ? holds.get(q.get("resource") + "|" + q.get("classId")) : undefined;
    if (h) { holds.delete(q.get("resource") + "|" + q.get("classId")); await h.promise; }
    const r = await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  return { ctx, posts, hold, stored: (cid: string) => ctx.getJson(NS.configName(cid)) };
}
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); });
const titleInput = () => screen.queryByRole("textbox", { name: "عنوان المرحلة " + FIRST }) as HTMLInputElement | null;

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("B1 stage settings — class switch", () => {
  it("while the new class loads, the previous class's stages are not shown (not even for one commit) and nothing can be saved", async () => {
    const s = server();
    // Every commit is inspected (Profiler onRender runs after the DOM update, before effects): class 1's stage title must
    // never be on screen while class 2 is the selected class.
    let selected = "c1";
    const leaks: string[] = [];
    const onRender = () => { if (selected === "c2" && titleInput()?.value === C1_TITLE) leaks.push("c1 stages under c2"); };
    const tree = (cid: string) => <Profiler id="settings" onRender={onRender}><ProjectStageSettings token="t" projectCode={CODE} classId={cid} tracks={TRACKS} readOnly={false} /></Profiler>;
    const view = render(tree("c1"));
    await waitFor(() => expect(titleInput()?.value).toBe(C1_TITLE));
    s.hold("template", "c2");
    selected = "c2";
    view.rerender(tree("c2"));
    await flush();
    expect(leaks).toEqual([]);
    expect(titleInput()).toBeNull();                                            // c1's editor is gone while c2 loads
    expect(screen.queryByRole("button", { name: "حفظ التغييرات" })).toBeNull();
    expect(s.posts).toHaveLength(0);
  });

  it("a slower read for the previous class never replaces the current one, so a save writes the current class's own stages", async () => {
    const s = server();
    const release = s.hold("template", "c1");
    const view = render(<ProjectStageSettings token="t" projectCode={CODE} classId="c1" tracks={TRACKS} readOnly={false} />);
    view.rerender(<ProjectStageSettings token="t" projectCode={CODE} classId="c2" tracks={TRACKS} readOnly={false} />);
    await waitFor(() => expect(titleInput()?.value).not.toBe(undefined));
    release();
    await flush();
    expect(titleInput()!.value).not.toBe(C1_TITLE);
    fireEvent.click(screen.getByRole("button", { name: "حفظ التغييرات" }));
    await screen.findByText("✓ تم حفظ إعداد المراحل.");
    expect(s.posts[0]).toMatchObject({ action: "template.update", classId: "c2" });
    expect(s.stored("c2").stages.find((x: { stageId: string }) => x.stageId === FIRST).title).not.toBe(C1_TITLE);
  });
});

describe("B2 class views — a stale response never renders", () => {
  it("dashboard", async () => {
    const s = server();
    const release = s.hold("summary", "c1");
    const view = render(<ProjectDashboard token="t" projectCode={CODE} classId="c1" tracks={TRACKS} />);
    view.rerender(<ProjectDashboard token="t" projectCode={CODE} classId="c2" tracks={TRACKS} />);
    const students = await screen.findByText("الطلاب");
    await waitFor(() => expect(students.closest(".eb-stat-card")?.textContent).toContain("1"));
    release();
    await flush();
    expect(screen.getByText("الطلاب").closest(".eb-stat-card")?.textContent).not.toContain("3");
  });

  it("student cards", async () => {
    const s = server();
    const release = s.hold("students", "c1");
    const view = render(<ProjectStudentCards token="t" projectCode={CODE} classId="c1" tracks={TRACKS} onOpenStudent={() => {}} />);
    view.rerender(<ProjectStudentCards token="t" projectCode={CODE} classId="c2" tracks={TRACKS} onOpenStudent={() => {}} />);
    await screen.findByText("باسل");
    release();
    await flush();
    expect(screen.queryByText("أمل")).toBeNull();
    expect(screen.getByText("باسل")).toBeTruthy();
  });

  it("analytics", async () => {
    const s = server();
    const release = s.hold("analytics", "c1");
    const view = render(<ProjectAnalytics token="t" projectCode={CODE} classId="c1" tracks={TRACKS} />);
    view.rerender(<ProjectAnalytics token="t" projectCode={CODE} classId="c2" tracks={TRACKS} />);
    await screen.findByRole("rowheader", { name: "باسل" });
    release();
    await flush();
    expect(screen.queryByRole("rowheader", { name: "أمل" })).toBeNull();
    expect(screen.getByRole("rowheader", { name: "باسل" })).toBeTruthy();
  });
});

describe("B3 stage weight 0", () => {
  it("is never saved silently: the save is refused with a message and the stored weight is unchanged", async () => {
    const s = server();
    render(<ProjectStageSettings token="t" projectCode={CODE} classId="c1" tracks={TRACKS} readOnly={false} />);
    await waitFor(() => expect(titleInput()?.value).toBe(C1_TITLE));
    const row = titleInput()!.closest("li") as HTMLElement;
    fireEvent.change(within(row).getByRole("spinbutton", { name: "الوزن" }), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ التغييرات" }));
    expect((await screen.findByRole("alert")).textContent).toBe("وزن المرحلة " + FIRST + " يجب أن يكون رقمًا أكبر من 0.");
    expect(s.posts).toHaveLength(0);                                            // refused on screen, before any request
    expect(screen.queryByText("✓ تم حفظ إعداد المراحل.")).toBeNull();
    expect(s.stored("c1").stages.find((x: { stageId: string }) => x.stageId === FIRST).weight).toBe(FIRST_WEIGHT);
  });
});

describe("B5 unsaved stage settings", () => {
  async function editInTracker() {
    const s = server();
    render(<ProjectTracker token="t" projectCode={CODE} />);
    await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
    const views = screen.getByRole("group", { name: "أقسام المشروع" });
    fireEvent.click(within(views).getByRole("button", { name: "إعداد المراحل" }));
    await waitFor(() => expect(titleInput()).not.toBeNull());
    fireEvent.change(titleInput()!, { target: { value: "عنوان معدّل" } });
    return { s, views };
  }

  it("changing the class asks first; cancelling keeps the class and the edit", async () => {
    await editInTracker();
    const select = screen.getByRole("combobox", { name: "الصف" }) as HTMLSelectElement;
    const before = select.value;
    fireEvent.change(select, { target: { value: before === "c1" ? "c2" : "c1" } });
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "متابعة التعديل" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(select.value).toBe(before);
    expect(titleInput()!.value).toBe("عنوان معدّل");
  });

  it("changing the view asks first; confirming discards the edit and switches", async () => {
    const { s, views } = await editInTracker();
    fireEvent.click(within(views).getByRole("button", { name: "لوحة المشروع" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "تجاهل التعديلات" }));
    await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
    expect(s.posts).toHaveLength(0);
  });
});
