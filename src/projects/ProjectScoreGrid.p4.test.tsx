// @vitest-environment happy-dom
/// <reference types="node" />
// Phase P4 — over the REAL project-tracker handler (in-memory container):
//   • «جدول العلامات»: students × the stages of one group; typing + Enter moves down; ONE score.bulk saves every changed
//     cell (each with the score the grid showed as `expected`); Arabic digits; invalid cells block the save; a pasted
//     spreadsheet block fills the grid; a stale cell keeps the teacher's value and names the server's; Escape restores;
//     leaving with unsaved scores asks first; an archived class shows no inputs; a score never changes a status.
//   • «الطالب السابق / التالي» in the student profile (outside Evaluation Focus Mode), following the list as shown, with
//     unsaved drafts confirmed first.
// Fail-first: run against a4061e6f (neither existed).
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProjectBulkReview from "./ProjectBulkReview";
import ProjectTracker from "./ProjectTracker";
import { normalizeGridDigits, parseGridScore } from "./scoreGrid";
import type { TrackMeta } from "./types";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const NOW = "2026-10-01T00:00:00.000Z";
const DEF = getProjectDefinition(CODE);
const TRACKS: TrackMeta[] = DEF.tracks;
const G1 = (DEF.groups as { groupId: string; track: string; order: number; title: string }[]).filter(g => g.track === "book").sort((a, b) => a.order - b.order);
const G1_STAGES = (DEF.stages as { stageId: string; groupId: string; order: number; active?: boolean }[]).filter(s => s.groupId === G1[0].groupId && s.active === true).sort((a, b) => a.order - b.order).map(s => s.stageId);
const [B1, B2, B3] = G1_STAGES;
const user = (id: string, cid: string, name: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: name, code: "C" + id });
const room = (id: string, over: Body = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
const progress = (sid: string, cid: string, stages: Record<string, Body>) => ({ schemaVersion: 1, programCode: CODE, classId: cid, studentId: sid, startedAt: NOW, updatedAt: NOW, stages, history: [] });

function server(seed: Record<string, unknown> = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"),
    "platform/users/s1.json": user("s1", "c1", "أحمد"), "platform/users/s2.json": user("s2", "c1", "بيان"), "platform/users/s3.json": user("s3", "c1", "جواد"),
    [NS.progressName("c1", "s1")]: progress("s1", "c1", { [B1]: { status: "approved", score: 40 } }),
    ...seed
  });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const posts: Body[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") posts.push(body!);
    const r = await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  return { ctx, posts, doc: (sid: string) => ctx.getJson(NS.progressName("c1", sid)) };
}
const cell = (name: string, stageId: string) => screen.getByRole("textbox", { name: new RegExp("^" + name + " — " + stageId + " ") }) as HTMLInputElement;
const saveBtn = () => within(screen.getByRole("region", { name: "حفظ العلامات" })).getByRole("button", { name: /حفظ العلامات/ });
async function openGrid(readOnly = false) {
  const view = render(<ProjectBulkReview token="t" projectCode={CODE} classId="c1" tracks={TRACKS} readOnly={readOnly} />);
  fireEvent.click(await screen.findByRole("button", { name: "جدول العلامات" }));
  await screen.findByRole("region", { name: "جدول العلامات" });
  return view;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P4 — grid values", () => {
  it("Arabic-Indic digits and «٫» are accepted; out-of-range or non-numeric values are invalid; empty clears", () => {
    expect(normalizeGridDigits("٨٥٫٥")).toBe("85.5");
    expect(parseGridScore("۹۰")).toEqual({ kind: "value", value: 90 });
    expect(parseGridScore(" 100 ")).toEqual({ kind: "value", value: 100 });
    expect(parseGridScore("")).toEqual({ kind: "empty" });
    for (const bad of ["101", "-1", "abc", "1e2", "5.", "٨٠%"]) expect(parseGridScore(bad).kind, bad).toBe("invalid");
  });
});

describe("P4 — «جدول العلامات»", () => {
  it("shows the class's students × the first group's stages with the saved scores", async () => {
    server();
    await openGrid();
    expect(cell("أحمد", B1).value).toBe("40");
    expect(cell("بيان", B1).value).toBe("");
    expect(cell("جواد", B3).value).toBe("");
    expect(screen.getAllByRole("row")).toHaveLength(4);                       // header + 3 students
  });

  it("typing, Enter to the next student, then ONE score.bulk saving every changed cell — no status changes", async () => {
    const s = server();
    await openGrid();
    const a = cell("أحمد", B2);
    a.focus();
    fireEvent.change(a, { target: { value: "88" } });
    fireEvent.keyDown(a, { key: "Enter" });
    expect(document.activeElement).toBe(cell("بيان", B2));
    // RTL: ← goes to the next stage, → back to the previous one; Shift+Enter to the previous student
    fireEvent.keyDown(cell("بيان", B2), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cell("بيان", B3));
    fireEvent.keyDown(cell("بيان", B3), { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell("بيان", B2));
    fireEvent.keyDown(cell("بيان", B2), { key: "Enter", shiftKey: true });
    expect(document.activeElement).toBe(cell("أحمد", B2));
    fireEvent.keyDown(cell("أحمد", B2), { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell("بيان", B2));
    fireEvent.change(cell("بيان", B2), { target: { value: "٧٥٫٥" } });
    fireEvent.change(cell("أحمد", B1), { target: { value: "45" } });
    expect(saveBtn().textContent).toContain("(3)");
    fireEvent.click(saveBtn());
    await screen.findByText(/حُفظت 3 علامة/);
    const writes = s.posts.filter(p => p.action === "score.bulk");
    expect(writes).toHaveLength(1);
    expect(writes[0].items).toEqual([
      { studentId: "s1", stageId: B1, score: 45, expected: 40 },
      { studentId: "s1", stageId: B2, score: 88, expected: null },
      { studentId: "s2", stageId: B2, score: 75.5, expected: null }
    ]);
    expect(s.doc("s1").stages[B1]).toMatchObject({ status: "approved", score: 45 });
    expect(s.doc("s1").stages[B2].score).toBe(88);
    expect(s.doc("s1").stages[B2].status ?? "not_started").not.toBe("approved");
    expect(s.doc("s2").stages[B2].score).toBe(75.5);
    await waitFor(() => expect(saveBtn().textContent).not.toContain("("));  // no pending change left
  });

  it("an empty cell over a saved score clears it", async () => {
    const s = server();
    await openGrid();
    fireEvent.change(cell("أحمد", B1), { target: { value: "" } });
    fireEvent.click(saveBtn());
    await screen.findByText(/حُفظت 1 علامة/);
    expect(s.posts.find(p => p.action === "score.bulk")!.items).toEqual([{ studentId: "s1", stageId: B1, score: null, expected: 40 }]);
    expect(s.doc("s1").stages[B1].score ?? null).toBe(null);
  });

  it("an invalid cell is marked and blocks the save until it is corrected", async () => {
    const s = server();
    await openGrid();
    fireEvent.change(cell("بيان", B1), { target: { value: "120" } });
    expect(cell("بيان", B1).getAttribute("aria-invalid")).toBe("true");
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/صحّح خلية واحدة/)).toBeTruthy();
    fireEvent.change(cell("بيان", B1), { target: { value: "100" } });
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(false);
    expect(s.posts.filter(p => p.action === "score.bulk")).toHaveLength(0);
  });

  it("a pasted spreadsheet block fills students × stages from the focused cell; values beyond the grid are reported", async () => {
    server();
    await openGrid();
    const start = cell("بيان", B1);
    fireEvent.paste(start, { clipboardData: { getData: () => "70\t71\t72\t73\n80\t81\t82\t83\n90\t91\t92\t93\n" } });
    expect(cell("بيان", B1).value).toBe("70");
    expect(cell("بيان", B3).value).toBe("72");
    expect(cell("جواد", B2).value).toBe("81");
    expect(cell("أحمد", B1).value).toBe("40");                                // above the start: untouched
    expect(screen.getByText(/لُصقت 6 قيمة، وتجاوزت 6 قيمة حدود الجدول/)).toBeTruthy();
  });

  it("a cell another write changed meanwhile is refused as stale: the newer score survives, the teacher's value stays", async () => {
    const s = server();
    await openGrid();
    s.ctx.setJson(NS.progressName("c1", "s1"), progress("s1", "c1", { [B1]: { status: "approved", score: 75 } }));   // another teacher
    fireEvent.change(cell("أحمد", B1), { target: { value: "90" } });
    fireEvent.click(saveBtn());
    expect((await screen.findByRole("list", { name: "علامات لم تُحفظ" })).textContent).toContain("تغيّرت العلامة على الخادم إلى 75");
    expect(s.doc("s1").stages[B1].score).toBe(75);
    expect(cell("أحمد", B1).value).toBe("90");                               // the teacher's value is kept…
    fireEvent.click(saveBtn());                                              // …and a deliberate retry uses the fresh expected
    await waitFor(() => expect(s.doc("s1").stages[B1].score).toBe(90));
    expect(s.posts.filter(p => p.action === "score.bulk").map(p => (p.items as Body[])[0].expected)).toEqual([40, 75]);
  });

  it("Escape restores the saved score of the cell", async () => {
    server();
    await openGrid();
    const a = cell("أحمد", B1);
    fireEvent.change(a, { target: { value: "99" } });
    fireEvent.keyDown(a, { key: "Escape" });
    expect(cell("أحمد", B1).value).toBe("40");
    expect(saveBtn().textContent).not.toContain("(");
  });

  it("leaving the grid or changing the group with unsaved scores asks first; cancel keeps them", async () => {
    server();
    await openGrid();
    fireEvent.change(cell("بيان", B1), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /حسب المرحلة/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "متابعة الإدخال" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(cell("بيان", B1).value).toBe("50");
    const select = screen.getByRole("combobox", { name: /المجموعة/ });
    fireEvent.change(select, { target: { value: G1[1].groupId } });
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تجاهل العلامات" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: new RegExp("— " + B1 + " ") })).toBeNull());
  });

  it("an archived class shows the scores without any input or save bar", async () => {
    server();
    await openGrid(true);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "حفظ العلامات" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "جدول العلامات" })).getByText("40")).toBeTruthy();
  });
});

describe("P4 — «الطالب السابق / التالي» in the profile", () => {
  async function openProfile(name: string) {
    render(<ProjectTracker token="t" projectCode={CODE} />);
    fireEvent.click(await screen.findByRole("button", { name: /تقدّم الطلاب/ }));
    const card = (await screen.findByText(name)).closest("li") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "فتح ملف الطالب" }));
    await screen.findByRole("heading", { name: "ملف المشروع: " + name });
  }
  it("moves through the list as shown, with the position, and disables at the ends", async () => {
    server();
    await openProfile("أحمد");
    const nav = screen.getByRole("navigation", { name: "التنقل بين الطلاب" });
    expect(nav.textContent).toContain("1 من 3");
    expect((within(nav).getByRole("button", { name: "لا يوجد طالب سابق" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(nav).getByRole("button", { name: "الطالب التالي: بيان" }));
    await screen.findByRole("heading", { name: "ملف المشروع: بيان" });
    fireEvent.click(within(screen.getByRole("navigation", { name: "التنقل بين الطلاب" })).getByRole("button", { name: "الطالب التالي: جواد" }));
    await screen.findByRole("heading", { name: "ملف المشروع: جواد" });
    const last = screen.getByRole("navigation", { name: "التنقل بين الطلاب" });
    expect(last.textContent).toContain("3 من 3");
    expect((within(last).getByRole("button", { name: "لا يوجد طالب تالٍ" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(last).getByRole("button", { name: "الطالب السابق: بيان" }));
    await screen.findByRole("heading", { name: "ملف المشروع: بيان" });
  });

  it("an unsaved score in the profile is confirmed before moving; staying keeps it", async () => {
    server();
    await openProfile("أحمد");
    await screen.findAllByRole("spinbutton");
    const input = screen.getByRole("spinbutton", { name: new RegExp("علامة المرحلة " + B2 + " ") }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "الطالب التالي: بيان" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("بيان");
    fireEvent.click(within(dialog).getByRole("button", { name: "البقاء هنا" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("heading", { name: "ملف المشروع: أحمد" })).toBeTruthy();
    expect((screen.getByRole("spinbutton", { name: new RegExp("علامة المرحلة " + B2 + " ") }) as HTMLInputElement).value).toBe("60");
    fireEvent.click(screen.getByRole("button", { name: "الطالب التالي: بيان" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تجاهل والانتقال" }));
    await screen.findByRole("heading", { name: "ملف المشروع: بيان" });
  });
});
