// @vitest-environment happy-dom
/// <reference types="node" />
// Phase 8C — fast inline project stage grading, migrated to the Phase G2 table (owner decisions D2 / D4 of 2026-10-23):
// every stage row of ProjectStudentDetail is directly gradeable (score field + «منجز» toggle + the row menu + the stage
// value) with no stage disclosure; drafts are per stage; ONE save bar writes the scores (`score.bulk`, stale-guarded) and
// then the approvals / reopenings (`progress.bulk`), after which the profile is re-read; a note or another workflow status
// stays the canonical single `progress.update`, serialized and bound to the (project, class, student) it was made for.
// The browser talks to the REAL project-tracker handler (in-memory container), so the server keeps its full authority:
// score validation, status transitions, recomputed summary / performance / stage values and history.
// Phase P7: the stage ids follow the condensed templates (899373 BK0x / AC01, 883589 VS02, 794589 PT01).
import { createRequire } from "node:module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import ProjectStudentDetail from "./ProjectStudentDetail";
import { fmtContribution } from "./projectPerformance";
import type { TrackMeta } from "./types";
// Phase P8 — these tests pin the switch-OFF contract of «اعتماد المرحلة عند حفظ العلامة» (a score save never changes the
// status: score.bulk only); the default-ON behaviour is pinned by src/projects/ProjectApproveOnSave.p8.test.tsx.
beforeEach(() => { try { window.localStorage.setItem("eb.projects.approveOnSave", "0"); } catch { /* no storage: tests below fail loudly */ } });

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getProjectDefinition } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Def = { tracks: TrackMeta[]; groups: Array<{ groupId: string; track: string }>; stages: Array<{ stageId: string; track: string; title: string; active?: boolean }> };
type Body = Record<string, unknown>;
const NOW = "2026-03-01T00:00:00.000Z";
const user = (id: string, cid: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
const room = (id: string, codes: string[], over: Body = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: codes, schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
const ALL = ["899373", "883589", "794589"];
type StageValue = { contribution: number; maxContribution: number; counted: boolean };
type Detail = { progress: Record<string, { status: string; score?: number; note?: string }>; history: Body[]; performance: { stageValues: Record<string, StageValue> }; summary: { overallProgress: number } };

/** The real server behind `fetch`, with test controls to hold / fail / fake-noChange the NEXT write. */
function server() {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1", ALL), "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"),
    "platform/classes/c9.json": room("c9", ALL), "platform/users/s9.json": user("s9", "c9")
  });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const posts: Body[] = [];
  const responses: Body[] = [];
  const control = { hold: false, release: () => {}, failNext: "", fakeNoChange: false };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") {
      posts.push(body!);
      if (control.failNext) { const msg = control.failNext; control.failNext = ""; return { ok: false, status: 503, json: async () => ({ ok: false, error: msg }) } as Response; }
      if (control.fakeNoChange) { control.fakeNoChange = false; return { ok: true, status: 200, json: async () => ({ ok: true, noChange: true }) } as Response; }
      if (control.hold) { control.hold = false; await new Promise<void>(r => { control.release = r; }); }
    }
    const r = await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps);
    if (method === "POST") responses.push(r.jsonBody);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  const archive = (cid: string) => ctx.setJson("platform/classes/" + cid + ".json", room(cid, ALL, { status: "archived", active: false }));
  const progressOf = async (code: string, sid: string, cid = "c1") => {
    const r = await tracker({ method: "GET", url: "https://x/api/project-tracker?projectCode=" + code + "&resource=student&classId=" + cid + "&studentId=" + sid, json: async () => ({}) }, deps);
    return r.jsonBody as Detail;
  };
  return { posts, responses, control, archive, progressOf };
}

const def = (code: string): Def => getProjectDefinition(code);
type Spies = { onChanged: ReturnType<typeof vi.fn>; onReadyChanged: ReturnType<typeof vi.fn> };
async function mount(code: string, studentId = "s1", classId = "c1"): Promise<Spies & { rerender: (sid: string, cid?: string, c?: string) => Promise<void> }> {
  const onChanged = vi.fn(), onReadyChanged = vi.fn();
  const el = (c: string, sid: string, cid: string) => <ProjectStudentDetail token="t" projectCode={c} classId={cid} studentId={sid} tracks={def(c).tracks} onBack={() => {}} onChanged={onChanged} onReadyChanged={onReadyChanged} />;
  const view = render(el(code, studentId, classId));
  await screen.findByRole("heading", { level: 2, name: "ملف المشروع: طالب " + studentId });
  await screen.findByRole("table");
  return {
    onChanged, onReadyChanged,
    rerender: async (sid: string, cid = classId, c = code) => { view.rerender(el(c, sid, cid)); await screen.findByRole("heading", { level: 2, name: "ملف المشروع: طالب " + sid }); await screen.findByRole("table"); }
  };
}
const row = (stageId: string) => document.querySelector('[data-stage-id="' + stageId + '"]') as HTMLElement;
const scoreInput = (stageId: string) => within(row(stageId)).getByRole("textbox") as HTMLInputElement;
const doneBtn = (stageId: string) => within(row(stageId)).getByRole("button", { name: stageId + ": منجز" }) as HTMLButtonElement;
const menuBtn = (stageId: string) => within(row(stageId)).getByRole("button", { name: "إجراءات المرحلة " + stageId }) as HTMLButtonElement;
const saveBar = () => screen.getByRole("region", { name: "حفظ تغييرات الطالب" });
const saveBtn = () => within(saveBar()).getByRole("button", { name: /^(حفظ التغييرات|جارٍ الحفظ)/ }) as HTMLButtonElement;
const type = (stageId: string, v: string) => fireEvent.change(scoreInput(stageId), { target: { value: v } });
const selectTrack = (title: string) => fireEvent.click(within(screen.getByRole("group", { name: "مسارات المشروع" })).getByRole("button", { name: title }));
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
/** Opens the row menu and returns its items (plain buttons inside the named panel). */
async function menuItems(stageId: string) {
  fireEvent.click(menuBtn(stageId));
  const panel = await screen.findByRole("group", { name: "إجراءات المرحلة " + stageId });
  return within(panel).getAllByRole("button") as HTMLButtonElement[];
}
async function menuItem(stageId: string, label: string) { return (await menuItems(stageId)).find(b => b.textContent === label)!; }
async function openDetails(stageId: string) {
  fireEvent.click(await menuItem(stageId, "التفاصيل والملاحظة"));
  const dialog = await screen.findByRole("dialog");
  return { dialog, panel: document.getElementById("eb-stage-" + stageId) as HTMLElement };
}
const saveBulk = (code: string, items: Body[]) => ({ projectCode: code, action: "score.bulk", classId: "c1", items });
const statusBulk = (code: string, stageIds: string[], status: string) => ({ projectCode: code, action: "progress.bulk", classId: "c1", items: stageIds.map(stageId => ({ studentId: "s1", stageId })), status });

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------------------------------------------
describe("8C-1 the Access project (899373) — every row is gradeable without opening the stage", () => {
  it("score field, «منجز» toggle, the row menu and the weighted value are on every row; no dialog has to be opened; labels are unique", async () => {
    server();
    await mount("899373");
    const d = def("899373");
    const book = d.stages.filter(s => s.track === "book" && s.active !== false);
    for (const s of book) {
      const r = row(s.stageId);
      expect(r, s.stageId).toBeTruthy();
      expect(within(r).getByRole("textbox", { name: "علامة المرحلة " + s.stageId + " — " + s.title + " من 100" })).toBeTruthy();
      expect(doneBtn(s.stageId).getAttribute("aria-pressed")).toBe("false");
      expect(menuBtn(s.stageId)).toBeTruthy();
      expect(r.querySelector(".eb-stage-cell-value")).toBeTruthy();
      expect(document.getElementById("eb-stage-" + s.stageId)).toBeNull();            // nothing had to be opened
    }
    expect(within(screen.getByRole("table")).getByRole("columnheader", { name: "العلامة من 100" })).toBeTruthy();
    const labels = Array.from(document.querySelectorAll("input[data-stage-score]")).map(i => i.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(labels.length);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("group / stage structure is exactly the registered template for BOTH tracks (counts unchanged by 8C)", async () => {
    server();
    await mount("899373");
    const d = def("899373");
    for (const t of d.tracks) {
      selectTrack(t.title);
      const groups = document.querySelectorAll(".eb-stage-group");
      expect(groups.length, t.trackId).toBe(d.groups.filter(g => g.track === t.trackId).length);
      const rows = Array.from(document.querySelectorAll("[data-stage-id]")).map(r => r.getAttribute("data-stage-id"));
      const expected = d.stages.filter(s => s.track === t.trackId && s.active !== false).map(s => s.stageId);
      expect([...rows].sort(), t.trackId).toEqual([...expected].sort());                  // same stages, none added / dropped
      expect(rows.length, t.trackId).toBe(expected.length);
    }
  });
  it("saving stage A sends exactly one score.bulk with the changed cell (Escape dropped B's draft); the server's value, summary and history show after the re-read", async () => {
    const srv = server();
    const spies = await mount("899373");
    type("BK02", "70");                                                               // a draft on BK02…
    fireEvent.keyDown(scoreInput("BK02"), { key: "Escape" });                         // …dropped again: the row is restored
    expect(scoreInput("BK02").value).toBe("");
    type("BK01", "85");
    expect(saveBtn().textContent).toBe("حفظ التغييرات (1)");
    fireEvent.click(saveBtn());
    await screen.findByText("حُفظت 1 علامة.");
    expect(srv.posts).toEqual([saveBulk("899373", [{ studentId: "s1", stageId: "BK01", score: 85, expected: null }])]);
    expect(scoreInput("BK01").value).toBe("85");                                          // canonical saved value
    expect(scoreInput("BK02").value).toBe("");
    const saved = await srv.progressOf("899373", "s1");
    expect(saved.progress.BK01.score).toBe(85);
    expect(saved.progress.BK02?.score).toBeUndefined();
    expect(saved.progress.BK01.status ?? "not_started").toBe("not_started");            // saving a score never approves (switch off)
    const v = saved.performance.stageValues.BK01;
    expect(row("BK01").querySelector(".eb-stage-cell-value")!.textContent).toBe(fmtContribution(v.contribution) + "/" + fmtContribution(v.maxContribution) + "عند الاعتماد");
    expect(screen.getByText("علامة 85 / 100 — BK01")).toBeTruthy();                        // exactly one score history entry
    expect(document.querySelectorAll(".eb-timeline li")).toHaveLength(1);
    expect(spies.onChanged).toHaveBeenCalledTimes(1);
    expect(spies.onReadyChanged).not.toHaveBeenCalled();                                 // score-only → no global ready refresh
    expect(within(saveBar()).getByRole("status").textContent).toBe("لا توجد تغييرات");
  });
  it("«منجز» sends ONLY the status (progress.bulk, no score); the server-recomputed contribution, progress and ready callback update", async () => {
    const srv = server();
    const spies = await mount("899373");
    type("BK01", "90");
    fireEvent.click(saveBtn());
    await screen.findByText("حُفظت 1 علامة.");
    fireEvent.click(doneBtn("BK01"));
    expect(doneBtn("BK01").getAttribute("aria-pressed")).toBe("true");
    expect(saveBtn().textContent).toBe("حفظ التغييرات (1)");
    fireEvent.click(saveBtn());
    await screen.findByText("اعتُمدت 1 مرحلة.");
    expect(srv.posts[1]).toEqual(statusBulk("899373", ["BK01"], "approved"));
    expect(JSON.stringify(srv.posts[1])).not.toContain("score");
    const saved = await srv.progressOf("899373", "s1");
    const v = saved.performance.stageValues.BK01;
    expect(v.contribution).toBeGreaterThan(0);
    expect(row("BK01").querySelector(".eb-stage-cell-value")!.textContent).toBe(fmtContribution(v.contribution) + "/" + fmtContribution(v.maxContribution));
    expect(screen.getByRole("progressbar", { name: "التقدم العام" }).getAttribute("aria-valuenow")).toBe(String(saved.summary.overallProgress));
    expect(row("BK01").textContent).toContain("تم الاعتماد");
    expect(doneBtn("BK01").getAttribute("aria-pressed")).toBe("true");
    expect(scoreInput("BK01").value).toBe("90");                                          // approving never changed the score
    expect(spies.onReadyChanged).toHaveBeenCalledTimes(1);
    expect(spies.onChanged).toHaveBeenCalledTimes(2);
    expect(saved.progress.BK01).toMatchObject({ status: "approved", score: 90 });
  });
  it("the alternative statuses stay available in the row menu and send only that status, at once", async () => {
    const srv = server();
    const spies = await mount("899373");
    const items = await menuItems("BK03");
    expect(items.map(b => b.textContent)).toEqual(["التفاصيل والملاحظة", "سجلّ التغييرات", "مسح العلامة", "لم يبدأ", "جاهز للفحص"]);
    expect(items[2].disabled).toBe(true);                                                // nothing saved to clear
    expect(items[3].disabled).toBe(true);                                                // the current status
    fireEvent.click(items[4]);
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(srv.posts).toEqual([{ projectCode: "899373", action: "progress.update", classId: "c1", studentId: "s1", stageId: "BK03", status: "ready_for_review" }]);
    expect(spies.onReadyChanged).toHaveBeenCalledTimes(1);
    expect(row("BK03").textContent).toContain("جاهز للفحص");
  });
  it("Enter in a score field moves focus to the next stage's field WITHOUT writing; the save bar then sends every draft in ONE score.bulk, in table order", async () => {
    const srv = server();
    await mount("899373");
    scoreInput("BK01").focus();
    type("BK01", "77");
    fireEvent.keyDown(scoreInput("BK01"), { key: "Enter" });
    await waitFor(() => expect(document.activeElement).toBe(scoreInput("BK02")));
    expect(srv.posts).toHaveLength(0);
    type("BK02", "66");
    fireEvent.keyDown(scoreInput("BK02"), { key: "Enter", shiftKey: true });           // Shift+Enter: back
    expect(document.activeElement).toBe(scoreInput("BK01"));
    expect(saveBtn().textContent).toBe("حفظ التغييرات (2)");
    fireEvent.click(saveBtn());
    await screen.findByText("حُفظت 2 علامة.");
    expect(srv.posts).toEqual([saveBulk("899373", [{ studentId: "s1", stageId: "BK01", score: 77, expected: null }, { studentId: "s1", stageId: "BK02", score: 66, expected: null }])]);
    expect((await srv.progressOf("899373", "s1")).progress).toMatchObject({ BK01: { score: 77 }, BK02: { score: 66 } });
  });
  it("after the save the bar is empty again and the field shows the canonical value", async () => {
    server();
    await mount("899373");
    type("BK04", "66");
    fireEvent.click(saveBtn());
    await screen.findByText("حُفظت 1 علامة.");
    await waitFor(() => expect(saveBtn().disabled).toBe(true));
    expect(saveBtn().textContent).toBe("حفظ التغييرات");
    expect(scoreInput("BK04").value).toBe("66");
    expect(row("BK04").className).not.toContain("is-changed");
  });
  it("the Access track itself is graded by the same generic rows", async () => {
    const srv = server();
    await mount("899373");
    selectTrack("Access");
    const access = def("899373").stages.filter(s => s.track === "access" && s.active !== false);
    expect(document.querySelectorAll("[data-stage-id]").length).toBe(access.length);
    type("AC01", "95");
    fireEvent.click(doneBtn("AC01"));
    fireEvent.click(saveBtn());
    await screen.findByText("حُفظت 1 علامة، اعتُمدت 1 مرحلة.");
    expect(srv.posts).toEqual([saveBulk("899373", [{ studentId: "s1", stageId: "AC01", score: 95, expected: null }]), statusBulk("899373", ["AC01"], "approved")]);
    expect((await srv.progressOf("899373", "s1")).progress.AC01).toMatchObject({ status: "approved", score: 95 });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8C-2 per-stage drafts, failures and double submits", () => {
  it("drafts are independent per stage and survive a track switch without mixing", async () => {
    server();
    await mount("899373");
    type("BK01", "81"); type("BK02", "82");
    expect([scoreInput("BK01").value, scoreInput("BK02").value]).toEqual(["81", "82"]);
    selectTrack("Access");
    expect(scoreInput("AC01").value).toBe("");                                            // no draft leaks into another track
    type("AC01", "91");
    selectTrack("الكتاب");
    expect([scoreInput("BK01").value, scoreInput("BK02").value]).toEqual(["81", "82"]);
    selectTrack("Access");
    expect(scoreInput("AC01").value).toBe("91");
    expect(saveBtn().textContent).toBe("حفظ التغييرات (3)");                              // the bar counts both tracks
  });
  it("an invalid score is caught before any write: the draft stays, the row and the bar name it, the save is blocked; a corrected value saves", async () => {
    const srv = server();
    const spies = await mount("899373");
    type("BK01", "150");
    expect(scoreInput("BK01").value).toBe("150");                                         // never erased
    expect(scoreInput("BK01").getAttribute("aria-invalid")).toBe("true");
    expect(row("BK01").className).toContain("is-invalid");
    expect(saveBtn().disabled).toBe(true);
    expect(within(saveBar()).getByRole("alert").textContent).toBe("صحّح علامة واحدة: العلامة رقم من 0 إلى 100.");
    fireEvent.click(saveBtn());
    await flush();
    expect(srv.posts).toHaveLength(0);
    expect((await srv.progressOf("899373", "s1")).progress.BK01?.score).toBeUndefined();
    expect(spies.onChanged).not.toHaveBeenCalled();
    type("BK01", "95");
    expect(within(saveBar()).queryByRole("alert")).toBeNull();
    fireEvent.click(saveBtn());
    await screen.findByText("حُفظت 1 علامة.");
    expect(within(row("BK01")).queryByRole("alert")).toBeNull();
    expect(scoreInput("BK01").value).toBe("95");
  });
  it("a failed save keeps every draft, applies nothing partially and never erases another stage's saved result; the retry succeeds", async () => {
    const srv = server();
    await mount("899373");
    type("BK01", "80");
    fireEvent.click(saveBtn());
    await screen.findByText("حُفظت 1 علامة.");
    srv.control.failNext = "تعارض مؤقت.";
    type("BK02", "60");
    fireEvent.click(saveBtn());
    expect((await screen.findByRole("alert")).textContent).toContain("تعارض مؤقت.");
    expect(scoreInput("BK02").value).toBe("60");
    expect(scoreInput("BK01").value).toBe("80");
    expect(saveBtn().textContent).toBe("حفظ التغييرات (1)");                              // the draft is still unsaved work
    expect((await srv.progressOf("899373", "s1")).progress.BK01.score).toBe(80);
    fireEvent.click(saveBtn());
    await screen.findByText("حُفظت 1 علامة.");
    expect((await srv.progressOf("899373", "s1")).progress.BK02.score).toBe(60);
  });
  it("double click / Enter + click cannot duplicate the same save; the fields are disabled while it is in flight", async () => {
    const srv = server();
    await mount("899373");
    type("BK01", "70");
    srv.control.hold = true;
    const btn = saveBtn();
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.keyDown(scoreInput("BK01"), { key: "Enter" });
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe("جارٍ الحفظ…");
    expect(scoreInput("BK01").disabled).toBe(true);
    expect(doneBtn("BK01").disabled).toBe(true);
    srv.control.release();
    await screen.findByText("حُفظت 1 علامة.");
    expect(srv.posts).toHaveLength(1);
    const h = (await srv.progressOf("899373", "s1")).history;
    expect(h.filter(e => e.type === "score")).toHaveLength(1);                           // no duplicate history
  });
  it("two activations in the SAME tick (before any re-render disables the button) still send one write", async () => {
    const srv = server();
    await mount("899373");
    type("BK01", "73");
    const btn = saveBtn();
    act(() => { btn.click(); btn.click(); });                                            // one batch: no re-render between
    await screen.findByText("حُفظت 1 علامة.");
    await flush();
    expect(srv.posts).toEqual([saveBulk("899373", [{ studentId: "s1", stageId: "BK01", score: 73, expected: null }])]);
    const item = await menuItem("BK02", "جاهز للفحص");
    act(() => { item.click(); item.click(); });
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(srv.posts.filter(p => p.status === "ready_for_review")).toHaveLength(1);
  });
  it("a noChange response (a menu status) triggers no refresh callbacks and changes nothing", async () => {
    const srv = server();
    const spies = await mount("899373");
    srv.control.fakeNoChange = true;
    fireEvent.click(await menuItem("BK01", "جاهز للفحص"));
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(spies.onChanged).not.toHaveBeenCalled();
    expect(spies.onReadyChanged).not.toHaveBeenCalled();
    expect(row("BK01").textContent).toContain("لم يبدأ");
  });
  it("notes: the «التفاصيل والملاحظة» dialog edits the note through progress.update; the row keeps its score controls and shows the note flag", async () => {
    const srv = server();
    const spies = await mount("899373");
    const { dialog, panel } = await openDetails("BK05");
    expect(dialog.contains(panel)).toBe(true);
    expect(within(dialog).getByRole("heading", { name: /^المرحلة BK05 — / })).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("ملاحظة المعلم"), { target: { value: "أحسنت" } });
    fireEvent.click(within(panel).getByRole("button", { name: "حفظ الملاحظة" }));
    await screen.findByText("تم حفظ الملاحظة.");
    expect(srv.posts).toEqual([{ projectCode: "899373", action: "progress.update", classId: "c1", studentId: "s1", stageId: "BK05", note: "أحسنت" }]);
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(within(row("BK05")).getByText("ملاحظة")).toBeTruthy();                        // note indicator on the row
    expect(scoreInput("BK05")).toBeTruthy();
    expect(doneBtn("BK05")).toBeTruthy();
    expect(spies.onReadyChanged).not.toHaveBeenCalled();
    expect(saveBtn().disabled).toBe(true);                                               // a note is its own write, never a bar change
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Review fix (8C), kept under G2: a note draft edited AFTER submission is newer, unsaved work and must survive the earlier
// request's success (or noChange). A score cannot be edited during the bulk save (the fields are disabled), so no score
// edit can ever be lost to an earlier response.
describe("8C-2b in-flight edits are never erased by an earlier request's response", () => {
  it("note: the first note saves; a newer in-flight edit stays visible, unsaved and savable", async () => {
    const srv = server();
    await mount("899373");
    const { panel } = await openDetails("BK02");
    const note = () => within(panel).getByLabelText("ملاحظة المعلم") as HTMLTextAreaElement;
    const saveNote = () => within(panel).getByRole("button", { name: /^(حفظ الملاحظة|جارٍ الحفظ)/ }) as HTMLButtonElement;
    fireEvent.change(note(), { target: { value: "أولى" } });
    srv.control.hold = true;
    fireEvent.click(saveNote());
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    expect(saveNote().disabled).toBe(true);
    fireEvent.change(note(), { target: { value: "أولى ثم تعديل" } });
    srv.control.release();
    await screen.findByText("تم حفظ الملاحظة.");
    expect((await srv.progressOf("899373", "s1")).progress.BK02.note).toBe("أولى");
    expect(note().value).toBe("أولى ثم تعديل");                                          // newer edit preserved
    await waitFor(() => expect(saveNote().disabled).toBe(false));
    fireEvent.click(saveNote());
    await waitFor(() => expect(srv.posts).toHaveLength(2));
    expect(srv.posts[1]).toMatchObject({ stageId: "BK02", note: "أولى ثم تعديل" });
    await waitFor(async () => expect((await srv.progressOf("899373", "s1")).progress.BK02.note).toBe("أولى ثم تعديل"));
  });
  it("an unchanged draft clears normally on success and the canonical value shows; emptying a saved score is a change the bar carries (a clear)", async () => {
    const srv = server();
    await mount("899373");
    type("BK03", "64.5");
    srv.control.hold = true;
    fireEvent.click(saveBtn());
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    srv.control.release();
    await screen.findByText("حُفظت 1 علامة.");
    expect(scoreInput("BK03").value).toBe("64.5");                                        // canonical, no draft left
    await waitFor(() => expect(saveBtn().disabled).toBe(true));                           // nothing unsaved
    type("BK03", "");
    expect(saveBtn().textContent).toBe("حفظ التغييرات (1)");
    fireEvent.click(saveBtn());
    await screen.findByText("حُفظت 1 علامة.");
    expect(srv.posts[1]).toEqual(saveBulk("899373", [{ studentId: "s1", stageId: "BK03", score: null, expected: 64.5 }]));
    expect((await srv.progressOf("899373", "s1")).progress.BK03?.score).toBeUndefined();
  });
  it("a noChange response can never erase a newer note draft; a score field cannot be edited while its save is in flight", async () => {
    const srv = server();
    await mount("899373");
    type("BK04", "50");
    srv.control.hold = true;
    fireEvent.click(saveBtn());
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    expect(scoreInput("BK04").disabled).toBe(true);                                       // no edit can race the response
    srv.control.release();
    await screen.findByText("حُفظت 1 علامة.");
    await waitFor(() => expect(scoreInput("BK04").disabled).toBe(false));
    type("BK04", "51"); type("BK04", "50");
    expect(saveBtn().disabled).toBe(true);                                                // equals canonical → not a change
    const { panel } = await openDetails("BK04");
    const note = within(panel).getByLabelText("ملاحظة المعلم") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "ن" } });
    srv.control.fakeNoChange = true; srv.control.hold = true;
    fireEvent.click(within(panel).getByRole("button", { name: "حفظ الملاحظة" }));
    await waitFor(() => expect(srv.posts).toHaveLength(2));
    fireEvent.change(note, { target: { value: "ن جديدة" } });
    srv.control.release();
    await screen.findByText("تم حفظ الملاحظة.");                                          // the held request got the fake noChange
    expect(srv.responses).toHaveLength(1);                                               // (the real handler saw only the first write)
    expect(note.value).toBe("ن جديدة");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8C-3 selection changes never carry drafts or stale responses", () => {
  it("switching student clears every draft and decision (the new student shows only their canonical values)", async () => {
    server();
    const m = await mount("899373");
    type("BK01", "77"); type("BK02", "88"); fireEvent.click(doneBtn("BK03"));
    expect(saveBtn().textContent).toBe("حفظ التغييرات (3)");
    await m.rerender("s2");
    expect([scoreInput("BK01").value, scoreInput("BK02").value]).toEqual(["", ""]);
    expect(doneBtn("BK03").getAttribute("aria-pressed")).toBe("false");
    expect(saveBtn().disabled).toBe(true);
  });
  it("a slow save for the previous student never lands on the current student, whose fields are usable at once", async () => {
    const srv = server();
    const m = await mount("899373");
    type("BK01", "99");
    srv.control.hold = true;
    fireEvent.click(saveBtn());
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    await m.rerender("s2");
    expect(scoreInput("BK01").disabled).toBe(false);                                      // the previous save does not hold s2's table
    srv.control.release();
    await flush(); await flush();
    expect(scoreInput("BK01").value).toBe("");                                            // s2 untouched on screen
    expect(screen.queryByText("حُفظت 1 علامة.")).toBeNull();
    expect(m.onChanged).not.toHaveBeenCalled();
    expect((await srv.progressOf("899373", "s2")).progress.BK01?.score).toBeUndefined();
    expect((await srv.progressOf("899373", "s1")).progress.BK01.score).toBe(99);          // the write itself was s1's
  });
  it("a switch of project / class drops a queued single write and its response", async () => {
    const srv = server();
    const m = await mount("899373");
    srv.control.hold = true;
    fireEvent.click(await menuItem("BK03", "جاهز للفحص"));
    fireEvent.click(await menuItem("BK04", "جاهز للفحص"));                               // queued behind the held write
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    await m.rerender("s9", "c9", "883589");
    srv.control.release();
    await flush(); await flush();
    expect(srv.posts).toHaveLength(1);                                                   // the queued BK04 write was dropped
    expect(screen.queryByText("تم تحديث حالة المرحلة.")).toBeNull();
    expect(m.onChanged).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8C-4 archived class — strictly read-only", () => {
  it("shows status, score, value and note as text with NO field, toggle, save bar, status items or note editor", async () => {
    const srv = server();
    await mount("899373");
    type("BK01", "85");
    fireEvent.click(saveBtn());
    await screen.findByText("حُفظت 1 علامة.");
    cleanup();
    srv.archive("c1");
    await mount("899373");
    expect(screen.getByText("مؤرشف — للقراءة فقط")).toBeTruthy();
    expect(document.querySelector("input[data-stage-score]")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("region", { name: "حفظ تغييرات الطالب" })).toBeNull();
    expect(screen.queryByRole("button", { name: /: منجز$/ })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(row("BK01").querySelector(".eb-stage-score-text")!.textContent).toBe("85 / 100");
    expect(row("BK01").querySelector(".eb-stage-cell-value")!.textContent).toMatch(/\d/);
    expect(within(row("BK01")).getByLabelText("غير منجز")).toBeTruthy();
    const items = await menuItems("BK01");
    expect(items.map(b => b.textContent)).toEqual(["التفاصيل", "سجلّ التغييرات"]);
    fireEvent.click(items[0]);
    await screen.findByRole("dialog");
    expect(screen.queryByLabelText("ملاحظة المعلم")).toBeNull();
    expect(screen.queryByRole("button", { name: "مسح العلامة" })).toBeNull();
    expect(screen.getByText("لا توجد ملاحظة.")).toBeTruthy();
    expect(srv.posts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8C-5 structurally different projects use the SAME generic component", () => {
  it("883589 (الكتاب + Visual Studio): counts match the template; a Visual Studio stage is graded and approved in one save", async () => {
    const srv = server();
    await mount("883589");
    const d = def("883589");
    for (const t of d.tracks) {
      selectTrack(t.title);
      expect(document.querySelectorAll(".eb-stage-group").length, t.trackId).toBe(d.groups.filter(g => g.track === t.trackId).length);
      expect(document.querySelectorAll("[data-stage-id]").length, t.trackId).toBe(d.stages.filter(s => s.track === t.trackId && s.active !== false).length);
    }
    selectTrack("Visual Studio");
    type("VS02", "64");
    fireEvent.click(doneBtn("VS02"));
    fireEvent.click(saveBtn());
    await screen.findByText("حُفظت 1 علامة، اعتُمدت 1 مرحلة.");
    expect(srv.posts).toEqual([saveBulk("883589", [{ studentId: "s1", stageId: "VS02", score: 64, expected: null }]), statusBulk("883589", ["VS02"], "approved")]);
    expect((await srv.progressOf("883589", "s1")).progress.VS02).toMatchObject({ status: "approved", score: 64 });
  });
  it("794589 (legacy storage, الكتاب + Packet Tracer): every row gradeable, counts match", async () => {
    const srv = server();
    await mount("794589");
    const d = def("794589");
    selectTrack("Packet Tracer");
    expect(document.querySelectorAll("[data-stage-id]").length).toBe(d.stages.filter(s => s.track === "packetTracer" && s.active !== false).length);
    type("PT01", "72");
    fireEvent.click(saveBtn());
    await screen.findByText("حُفظت 1 علامة.");
    expect(srv.posts).toEqual([saveBulk("794589", [{ studentId: "s1", stageId: "PT01", score: 72, expected: null }])]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8C-6 source / CSS guards", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
  it("no project, track, group or stage is hard-coded in the grading component", () => {
    const src = read("./ProjectStudentDetail.tsx").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const literal of ["899373", "883589", "794589", "\"book\"", "\"access\"", "\"packetTracer\"", "\"visualStudio\"", "\"BK01\"", "\"AC01\"", "_g1"]) expect(src, literal).not.toContain(literal);
    // Phase 9B: the single-write bodies are built by ONE helper (projectEvaluation.mutationBody): status / note stay progress.update,
    // a score is the narrow score.set / score.clear; the table's bulk writes are the two bulk actions and nothing else.
    const bodies = read("./projectEvaluation.ts");
    expect(bodies).toContain('action: "progress.update"'); expect(bodies).toContain('action: "score.set"'); expect(bodies).toContain('action: "score.clear"');
    expect(src).toContain("mutationBody(");
    expect(src.match(/action: "[a-z.]+"/g)!.sort()).toEqual(['action: "progress.bulk"', 'action: "score.bulk"']);
    expect(src).not.toMatch(/projectGrade|calculate[A-Z]\w*\(/);                          // no browser-side grading formulas
  });
  it("the stage table styles: logical properties only, tokens only, a card below 768px with 44px targets and no overflow-prone fixed widths", () => {
    const css = read("../projects-pro.css");
    const block = css.slice(css.lastIndexOf("/*", css.indexOf("Phase G2 — the student's stage table")), css.indexOf(".eb-stage-timeline{"));
    const rules = block.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).toContain(".eb-stage-table{");
    expect(rules).not.toMatch(/(?:margin|padding)-(?:left|right)\s*:|(?:^|[\s;{])(?:left|right)\s*:|#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    expect(rules).not.toMatch(/padding-inline-(?:start|end)\s*:/);
    expect(rules).toContain("@media (pointer: coarse)");
    const mobile = rules.slice(rules.indexOf("@media (max-width:767px)"));
    expect(mobile).toContain('grid-template-columns:auto minmax(0,1fr) auto');
    expect(mobile).toContain('"done score actions"');
    expect(mobile).toContain("min-height:44px");
    expect(mobile).not.toMatch(/\d+rem/);
  });
});
