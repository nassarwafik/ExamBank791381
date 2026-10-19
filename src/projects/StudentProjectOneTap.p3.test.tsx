// @vitest-environment happy-dom
/// <reference types="node" />
// Phase P3 — the student marks a stage in ONE tap over the REAL student handler (in-memory container): «أنجزتها» on every
// stage not yet approved and on the next-step card, «تراجع» on the student's own unconfirmed marks, filters with counts
// that open on «المتبقية» and never switch on their own, groups that fold with their done / total count (a group already
// fully done at open starts folded in «الكل» while its track has work left; one completed now stays open), and «أنجزت المجموعة كلها» behind a
// confirmation, sending ONE request with only the group's remaining stages. A double tap sends once.
// Fail-first: run against bb67ee3c (the P2 marking mode: checkboxes + «حفظ كمنفّذة»).
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import StudentProjectPanel from "./StudentProjectPanel";

const nodeRequire = createRequire(import.meta.url);
const { handler: studentTracker } = nodeRequire("../../api/src/functions/student-project-tracker.js");
const { getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
type Stage = { stageId: string; track: string; groupId: string; active?: boolean; order: number; title: string };
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const NOW = "2026-10-01T00:00:00.000Z";
const ACTIVE = (getProjectDefinition(CODE).stages as Stage[]).filter(s => s.active === true).sort((a, b) => a.order - b.order);
const BOOK = ACTIVE.filter(s => s.track === "book");
const ACCESS = ACTIVE.filter(s => s.track === "access");
const ids = (group: string) => BOOK.filter(s => s.groupId === group).map(s => s.stageId);
const G1 = ids("book_g1"), G2 = ids("book_g2");                                  // B01–B03 «بداية الكتاب», B04–B07 «الجداول المستعملة»
const TEACHER = { status: "approved", approvedBy: "teacher-1", approvedAt: NOW };
const SELF = { status: "approved", approvedBy: "s1", approvedAt: NOW, selfReportedAt: NOW, selfReportedBy: "s1", selfReportedFrom: "not_started" };
const user = (id: string, cid: string, name: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: name, code: "C" + id });
const room = (id: string) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW });

function server(stages: Record<string, Body> = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1", "أحمد"),
    [NS.progressName("c1", "s1")]: { schemaVersion: 1, programCode: CODE, classId: "c1", studentId: "s1", startedAt: NOW, updatedAt: NOW, stages, history: [] }
  });
  const deps = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {}, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
  const posts: Body[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") posts.push(body!);
    const r = await studentTracker({ method, url: "https://x" + String(input), json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  return { posts, doc: () => ctx.getJson(NS.progressName("c1", "s1")) };
}
const all = (list: string[], entry: Body) => Object.fromEntries(list.map(id => [id, entry]));
const stageTitle = (id: string) => ACTIVE.find(s => s.stageId === id)!.title;
const doneName = (id: string) => "أنجزت " + id + " — " + stageTitle(id);
const filters = () => screen.getByRole("group", { name: "عرض المراحل" });
const chip = (name: RegExp) => within(filters()).getByRole("button", { name });
const chipTexts = () => within(filters()).getAllByRole("button").map(b => b.textContent);
const pressed = () => within(filters()).getAllByRole("button").filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.textContent);
const shownCodes = () => Array.from(document.querySelectorAll(".eb-sp-stage-code")).map(n => n.textContent);
const rowOf = (id: string) => screen.getByText(id, { selector: ".eb-sp-stage-code" }).closest("li") as HTMLElement;
const groupToggle = (title: string) => screen.getByRole("button", { name: new RegExp("^" + title) });
const groupOf = (title: string) => groupToggle(title).closest("section") as HTMLElement;
async function mount() {
  render(<StudentProjectPanel token="st" />);
  await screen.findByRole("group", { name: "عرض المراحل" });
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P3 filters — what is left to do first", () => {
  it("opens on «المتبقية» with a count per view; approved and pending stages are only in their own views", async () => {
    server({ [G1[2]]: TEACHER, [G2[0]]: SELF });
    await mount();
    expect(chipTexts()).toEqual(["المتبقية (" + (BOOK.length - 2) + ")", "بانتظار تأكيد المعلم (1)", "المعتمدة (1)", "الكل (" + BOOK.length + ")"]);
    expect(pressed()).toEqual(["المتبقية (" + (BOOK.length - 2) + ")"]);
    expect(shownCodes()).toEqual(BOOK.map(s => s.stageId).filter(id => id !== G1[2] && id !== G2[0]));
    fireEvent.click(chip(/^بانتظار/));
    expect(shownCodes()).toEqual([G2[0]]);
    expect(screen.getByRole("button", { name: "تراجع عن تحديد " + G2[0] + " — " + stageTitle(G2[0]) })).toBeTruthy();
    fireEvent.click(chip(/^المعتمدة/));
    expect(shownCodes()).toEqual([G1[2]]);
    expect(within(rowOf(G1[2])).queryByRole("button")).toBeNull();               // a teacher-approved stage has no action
  });

  it("a tap moves the stage to «بانتظار تأكيد المعلم» at once, and the view stays on «المتبقية»", async () => {
    const s = server();
    await mount();
    fireEvent.click(screen.getByRole("button", { name: doneName(G1[1]) }));
    await screen.findByText("تم تحديد " + G1[1] + " كمنفّذة. تظهر الآن لمعلمك.");
    await waitFor(() => expect(chip(/^المتبقية/).textContent).toBe("المتبقية (" + (BOOK.length - 1) + ")"));
    expect(chip(/^بانتظار/).textContent).toBe("بانتظار تأكيد المعلم (1)");
    expect(shownCodes()).not.toContain(G1[1]);
    expect(pressed()[0]).toMatch(/^المتبقية/);
    expect(s.posts).toEqual([{ projectCode: CODE, stageIds: [G1[1]], mark: true }]);
  });

  it("marking the last remaining stage says «أحسنت» instead of jumping to another view", async () => {
    const last = BOOK[BOOK.length - 1].stageId;
    server(all(BOOK.map(s => s.stageId).filter(id => id !== last), TEACHER));
    await mount();
    expect(shownCodes()).toEqual([last]);
    fireEvent.click(within(rowOf(last)).getByRole("button", { name: doneName(last) }));
    await screen.findByText("أحسنت! لا توجد مراحل متبقية في هذا المسار.");
    expect(pressed()).toEqual(["المتبقية (0)"]);
    expect(shownCodes()).toEqual([]);
  });

  it("opens on «الكل» with every group open when nothing is left, and each track opens on its own view", async () => {
    server(all(BOOK.map(s => s.stageId), TEACHER));
    await mount();
    expect(pressed()).toEqual(["الكل (" + BOOK.length + ")"]);
    expect(groupToggle("بداية الكتاب").getAttribute("aria-expanded")).toBe("true");   // a finished track keeps its scores in view
    expect(shownCodes()).toEqual(BOOK.map(s => s.stageId));
    const accessTitle = (getProjectDefinition(CODE).tracks as { trackId: string; title: string }[]).find(t => t.trackId === "access")!.title;
    fireEvent.click(within(screen.getByRole("group", { name: "مسارات المشروع" })).getByRole("button", { name: accessTitle }));
    expect(pressed()).toEqual(["المتبقية (" + ACCESS.length + ")"]);
  });
});

describe("P3 groups — fold with their done / total count", () => {
  it("in «الكل» a group already done at open starts folded; a group with work left is open; the head toggles", async () => {
    server({ ...all(G1, TEACHER), [G2[0]]: TEACHER });
    await mount();
    fireEvent.click(chip(/^الكل/));
    expect(groupToggle("بداية الكتاب").getAttribute("aria-expanded")).toBe("false");
    expect(within(groupOf("بداية الكتاب")).getByText(G1.length + " / " + G1.length + " منجزة")).toBeTruthy();
    expect(within(groupOf("بداية الكتاب")).queryByText(G1[0])).toBeNull();
    expect(groupToggle("الجداول المستعملة").getAttribute("aria-expanded")).toBe("true");
    expect(within(groupOf("الجداول المستعملة")).getByText("1 / " + G2.length + " منجزة")).toBeTruthy();
    fireEvent.click(groupToggle("بداية الكتاب"));
    expect(groupToggle("بداية الكتاب").getAttribute("aria-expanded")).toBe("true");
    expect(within(groupOf("بداية الكتاب")).getByText(G1[0])).toBeTruthy();
    fireEvent.click(groupToggle("الجداول المستعملة"));
    expect(within(groupOf("الجداول المستعملة")).queryByText(G2[1])).toBeNull();
    expect(within(groupOf("الجداول المستعملة")).queryByRole("button", { name: /أنجزت المجموعة/ })).toBeNull();   // folded: no group action
  });

  it("a group the student completes now stays open (it never folds under the finger)", async () => {
    server(all(G2.slice(0, -1), TEACHER));
    await mount();
    fireEvent.click(chip(/^الكل/));
    const last = G2[G2.length - 1];
    fireEvent.click(screen.getByRole("button", { name: doneName(last) }));
    await within(groupOf("الجداول المستعملة")).findByText(G2.length + " / " + G2.length + " منجزة");
    expect(groupToggle("الجداول المستعملة").getAttribute("aria-expanded")).toBe("true");
    expect(within(groupOf("الجداول المستعملة")).getByText(last)).toBeTruthy();
  });
});

describe("P3 actions — the next step, a whole group, a double tap", () => {
  it("the next-step card carries «أنجزتها» for that stage, then shows the following one", async () => {
    const s = server();
    await mount();
    const card = document.querySelector(".eb-sp-next-card") as HTMLElement;
    expect(card.textContent).toContain(G1[0] + " — " + stageTitle(G1[0]));
    fireEvent.click(within(card).getByRole("button", { name: doneName(G1[0]) }));
    await waitFor(() => expect((document.querySelector(".eb-sp-next-card") as HTMLElement).textContent).toContain(G1[1] + " — " + stageTitle(G1[1])));
    expect(s.posts).toEqual([{ projectCode: CODE, stageIds: [G1[0]], mark: true }]);
    expect(s.doc().stages[G1[0]]).toMatchObject({ status: "approved", selfReportedBy: "s1" });
  });

  it("«أنجزت المجموعة كلها» asks first, then sends ONE request with only the group's remaining stages", async () => {
    const s = server({ [G2[1]]: TEACHER, [G2[2]]: SELF });
    await mount();
    fireEvent.click(chip(/^الكل/));
    const group = groupOf("الجداول المستعملة");
    fireEvent.click(within(group).getByRole("button", { name: "أنجزت المجموعة كلها (2)" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("تحديد المجموعة كمنفّذة")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.posts).toEqual([]);
    fireEvent.click(within(group).getByRole("button", { name: "أنجزت المجموعة كلها (2)" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "تحديد مرحلتين" }));
    await screen.findByText("تم تحديد مرحلتين من «الجداول المستعملة» كمنفّذة. تظهر الآن لمعلمك.");
    expect(s.posts).toEqual([{ projectCode: CODE, stageIds: [G2[0], G2[3]], mark: true }]);
    expect(s.doc().stages[G2[1]]).toEqual(TEACHER);                               // the teacher's approval is untouched
    await within(groupOf("الجداول المستعملة")).findByText(G2.length + " / " + G2.length + " منجزة");
  });

  it("offers the group action only while more than one stage is left", async () => {
    server(all(G2.slice(0, -1), TEACHER));
    await mount();
    expect(within(groupOf("الجداول المستعملة")).queryByRole("button", { name: /أنجزت المجموعة/ })).toBeNull();
    expect(within(groupOf("بداية الكتاب")).getByRole("button", { name: "أنجزت المجموعة كلها (" + G1.length + ")" })).toBeTruthy();
  });

  it("a double tap sends ONE request", async () => {
    const s = server();
    await mount();
    const btn = screen.getByRole("button", { name: doneName(G1[2]) });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await screen.findByText("تم تحديد " + G1[2] + " كمنفّذة. تظهر الآن لمعلمك.");
    expect(s.posts).toEqual([{ projectCode: CODE, stageIds: [G1[2]], mark: true }]);
  });
});
