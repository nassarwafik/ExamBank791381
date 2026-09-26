// @vitest-environment happy-dom
/// <reference types="node" />
// Phase 8C — fast inline project stage grading. Every stage row of ProjectStudentDetail is directly gradeable (score
// field + save, the primary «اعتماد», the status menu, the stage value) with no stage disclosure; drafts are per stage;
// status / note writes stay the canonical `progress.update` and a score goes through the narrow `score.set` / `score.clear`
// (Phase 9B); every write is serialized and bound to the (project, class, student) it was made for. The browser talks to the REAL project-tracker handler (in-memory container), so the server keeps its full
// authority: score validation, status transitions, recomputed summary / performance / stage values and history.
import { createRequire } from "node:module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import ProjectStudentDetail from "./ProjectStudentDetail";
import { fmtContribution } from "./projectPerformance";
import type { TrackMeta } from "./types";

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
    return r.jsonBody as { progress: Record<string, { status: string; score?: number; note?: string }>; history: Body[] };
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
  return {
    onChanged, onReadyChanged,
    rerender: async (sid: string, cid = classId, c = code) => { view.rerender(el(c, sid, cid)); await screen.findByRole("heading", { level: 2, name: "ملف المشروع: طالب " + sid }); }
  };
}
const row = (stageId: string) => document.querySelector('[data-stage-id="' + stageId + '"]') as HTMLElement;
const scoreInput = (stageId: string) => within(row(stageId)).getByRole("spinbutton") as HTMLInputElement;
const saveBtn = (stageId: string) => within(row(stageId)).getByRole("button", { name: "حفظ علامة المرحلة " + stageId }) as HTMLButtonElement;
const approveBtn = (stageId: string) => within(row(stageId)).getByRole("button", { name: "اعتماد المرحلة " + stageId }) as HTMLButtonElement;
const type = (stageId: string, v: string) => fireEvent.change(scoreInput(stageId), { target: { value: v } });
const selectTrack = (title: string) => fireEvent.click(within(screen.getByRole("group", { name: "مسارات المشروع" })).getByRole("button", { name: title }));
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------------------------------------------
describe("8C-1 the Access project (899373) — every row is gradeable without opening the stage", () => {
  it("score field, /100, save, approve, status menu and value are visible on every row; no stage disclosure is required; labels are unique", async () => {
    server();
    await mount("899373");
    const d = def("899373");
    const book = d.stages.filter(s => s.track === "book" && s.active !== false);
    for (const s of book) {
      const r = row(s.stageId);
      expect(r, s.stageId).toBeTruthy();
      expect(within(r).getByRole("spinbutton", { name: "علامة المرحلة " + s.stageId + " — " + s.title + " من 100" })).toBeTruthy();
      expect(within(r).getByRole("button", { name: "اعتماد المرحلة " + s.stageId })).toBeTruthy();
      expect(within(r).getByRole("button", { name: "تغيير حالة المرحلة " + s.stageId })).toBeTruthy();
      expect(r.querySelector(".eb-stage-cell-value")).toBeTruthy();
      expect(r.textContent).toContain("/100");
      expect(document.getElementById("eb-stage-" + s.stageId)).toBeNull();            // nothing had to be opened
    }
    const labels = Array.from(document.querySelectorAll("input[data-stage-score]")).map(i => i.getAttribute("aria-label"));
    expect(new Set(labels).size).toBe(labels.length);
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
  it("saving stage A sends exactly {action: score.set, classId, studentId, stageId, score}; stage B is untouched; the server's value, summary and history show", async () => {
    const srv = server();
    const spies = await mount("899373");
    type("B02", "70");                                                               // an unsaved draft on B02
    type("B01", "85");
    fireEvent.click(saveBtn("B01"));
    await screen.findByText("تم حفظ العلامة.");
    expect(srv.posts).toEqual([{ projectCode: "899373", action: "score.set", classId: "c1", studentId: "s1", stageId: "B01", score: "85" }]);
    expect(scoreInput("B01").value).toBe("85");                                          // canonical saved value
    expect(scoreInput("B02").value).toBe("70");                                          // B's draft untouched
    const saved = await srv.progressOf("899373", "s1");
    expect(saved.progress.B01.score).toBe(85);
    expect(saved.progress.B02?.score).toBeUndefined();
    expect(saved.progress.B01.status ?? "not_started").toBe("not_started");            // saving a score never approves
    const res = srv.responses[0] as { performance: { stageValues: Record<string, { contribution: number; maxContribution: number; counted: boolean }> }; summary: { overallProgress: number } };
    const v = res.performance.stageValues.B01;
    expect(row("B01").querySelector(".eb-stage-cell-value")!.textContent).toBe(fmtContribution(v.contribution) + "/" + fmtContribution(v.maxContribution) + "عند الاعتماد");
    expect(screen.getByText("علامة 85 / 100 — B01")).toBeTruthy();                        // exactly one score history entry
    expect(document.querySelectorAll(".eb-timeline li")).toHaveLength(1);
    expect(spies.onChanged).toHaveBeenCalledTimes(1);
    expect(spies.onReadyChanged).not.toHaveBeenCalled();                                 // score-only → no global ready refresh
  });
  it("approving sends ONLY the status; the server-recomputed contribution, progress and ready callback update", async () => {
    const srv = server();
    const spies = await mount("899373");
    type("B01", "90");
    fireEvent.click(saveBtn("B01"));
    await screen.findByText("تم حفظ العلامة.");
    fireEvent.click(approveBtn("B01"));
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(srv.posts[1]).toEqual({ projectCode: "899373", action: "progress.update", classId: "c1", studentId: "s1", stageId: "B01", status: "approved" });
    expect(Object.keys(srv.posts[1])).not.toContain("score");
    const res = srv.responses[1] as { performance: { stageValues: Record<string, { contribution: number; maxContribution: number }> }; summary: { overallProgress: number } };
    const v = res.performance.stageValues.B01;
    expect(v.contribution).toBeGreaterThan(0);
    expect(row("B01").querySelector(".eb-stage-cell-value")!.textContent).toBe(fmtContribution(v.contribution) + "/" + fmtContribution(v.maxContribution));
    expect(screen.getByRole("progressbar", { name: "التقدم العام" }).getAttribute("aria-valuenow")).toBe(String(res.summary.overallProgress));
    expect(row("B01").textContent).toContain("تم الاعتماد");
    expect(approveBtn("B01").disabled).toBe(true);
    expect(scoreInput("B01").value).toBe("90");                                          // approving never changed the score
    expect(spies.onReadyChanged).toHaveBeenCalledTimes(1);
    expect(spies.onChanged).toHaveBeenCalledTimes(2);
    expect((await srv.progressOf("899373", "s1")).progress.B01).toMatchObject({ status: "approved", score: 90 });
  });
  it("the alternative statuses stay available in the row's status menu and send only that status", async () => {
    const srv = server();
    const spies = await mount("899373");
    fireEvent.click(within(row("B03")).getByRole("button", { name: "تغيير حالة المرحلة B03" }));
    const menu = await screen.findByRole("group", { name: "تغيير حالة المرحلة B03" });
    const items = within(menu).getAllByRole("button");
    expect(items.map(b => b.textContent)).toEqual(["لم يبدأ", "قيد التنفيذ", "جاهز للفحص"]);
    fireEvent.click(items[2]);
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(srv.posts).toEqual([{ projectCode: "899373", action: "progress.update", classId: "c1", studentId: "s1", stageId: "B03", status: "ready_for_review" }]);
    expect(spies.onReadyChanged).toHaveBeenCalledTimes(1);
  });
  it("Enter in a score field saves that stage and moves focus to the next stage's score field", async () => {
    const srv = server();
    await mount("899373");
    scoreInput("B01").focus();
    type("B01", "77");
    fireEvent.keyDown(scoreInput("B01"), { key: "Enter" });
    await screen.findByText("تم حفظ العلامة.");
    expect(srv.posts).toEqual([{ projectCode: "899373", action: "score.set", classId: "c1", studentId: "s1", stageId: "B01", score: "77" }]);
    await waitFor(() => expect(document.activeElement).toBe(scoreInput("B02")));
    fireEvent.keyDown(scoreInput("B02"), { key: "Enter" });                             // empty draft → nothing sent
    await flush();
    expect(srv.posts).toHaveLength(1);
  });
  it("button-save keeps focus predictable (back on that stage's score field)", async () => {
    server();
    await mount("899373");
    type("B04", "66");
    saveBtn("B04").focus();
    fireEvent.click(saveBtn("B04"));
    await screen.findByText("تم حفظ العلامة.");
    await waitFor(() => expect(document.activeElement).toBe(scoreInput("B04")));
  });
  it("the Access track itself is graded by the same generic rows", async () => {
    const srv = server();
    await mount("899373");
    selectTrack("Access");
    const access = def("899373").stages.filter(s => s.track === "access" && s.active !== false);
    expect(document.querySelectorAll("[data-stage-id]").length).toBe(access.length);
    type("A01", "95");
    fireEvent.keyDown(scoreInput("A01"), { key: "Enter" });
    await screen.findByText("تم حفظ العلامة.");
    fireEvent.click(approveBtn("A01"));
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(srv.posts.map(p => [p.stageId, p.score ?? p.status])).toEqual([["A01", "95"], ["A01", "approved"]]);
    expect((await srv.progressOf("899373", "s1")).progress.A01).toMatchObject({ status: "approved", score: 95 });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8C-2 per-stage drafts, failures and double submits", () => {
  it("drafts are independent per stage and survive a track switch without mixing", async () => {
    server();
    await mount("899373");
    type("B01", "81"); type("B02", "82");
    expect([scoreInput("B01").value, scoreInput("B02").value]).toEqual(["81", "82"]);
    selectTrack("Access");
    expect(scoreInput("A01").value).toBe("");                                            // no draft leaks into another track
    type("A01", "91");
    selectTrack("الكتاب");
    expect([scoreInput("B01").value, scoreInput("B02").value]).toEqual(["81", "82"]);
    selectTrack("Access");
    expect(scoreInput("A01").value).toBe("91");
  });
  it("an invalid score is rejected by the SERVER; the draft and a row-level error stay; a corrected retry succeeds", async () => {
    const srv = server();
    const spies = await mount("899373");
    type("B01", "150");
    fireEvent.click(saveBtn("B01"));
    const alert = await within(row("B01")).findByRole("alert");
    expect(alert.textContent).toMatch(/^B01: /);
    expect(scoreInput("B01").value).toBe("150");                                         // never erased
    expect(scoreInput("B01").getAttribute("aria-invalid")).toBe("true");
    expect((await srv.progressOf("899373", "s1")).progress.B01?.score).toBeUndefined();
    expect(spies.onChanged).not.toHaveBeenCalled();
    type("B01", "95");
    fireEvent.click(saveBtn("B01"));
    await screen.findByText("تم حفظ العلامة.");
    expect(within(row("B01")).queryByRole("alert")).toBeNull();
    expect(scoreInput("B01").value).toBe("95");
  });
  it("a failed save on one stage keeps its draft and never erases another stage's saved result", async () => {
    const srv = server();
    await mount("899373");
    type("B01", "80");
    fireEvent.click(saveBtn("B01"));
    await screen.findByText("تم حفظ العلامة.");
    srv.control.failNext = "تعارض مؤقت.";
    type("B02", "60");
    fireEvent.click(saveBtn("B02"));
    expect((await within(row("B02")).findByRole("alert")).textContent).toBe("B02: تعارض مؤقت.");
    expect(scoreInput("B02").value).toBe("60");
    expect(scoreInput("B01").value).toBe("80");
    expect((await srv.progressOf("899373", "s1")).progress.B01.score).toBe(80);
  });
  it("double click / Enter + click cannot duplicate the same mutation", async () => {
    const srv = server();
    await mount("899373");
    type("B01", "70");
    srv.control.hold = true;
    fireEvent.click(saveBtn("B01"));
    fireEvent.click(saveBtn("B01"));
    fireEvent.keyDown(scoreInput("B01"), { key: "Enter" });
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    expect(row("B01").getAttribute("aria-busy")).toBe("true");
    fireEvent.click(approveBtn("B01"));                                                   // a DIFFERENT operation queues behind it
    srv.control.release();
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(srv.posts.map(p => p.score ?? p.status)).toEqual(["70", "approved"]);
    const h = (await srv.progressOf("899373", "s1")).history;
    expect(h.filter(e => e.type === "score")).toHaveLength(1);                           // no duplicate history
    expect(h.filter(e => e.type === "status")).toHaveLength(1);
  });
  it("two activations in the SAME tick (before any re-render disables the button) still send one write", async () => {
    const srv = server();
    await mount("899373");
    type("B01", "73");
    const btn = saveBtn("B01");
    act(() => { btn.click(); btn.click(); });                                            // one batch: no re-render between
    await screen.findByText("تم حفظ العلامة.");
    expect(srv.posts).toEqual([{ projectCode: "899373", action: "score.set", classId: "c1", studentId: "s1", stageId: "B01", score: "73" }]);
    const approve = approveBtn("B01");
    act(() => { approve.click(); approve.click(); });
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(srv.posts.filter(p => p.status === "approved")).toHaveLength(1);
  });
  it("a noChange response triggers no refresh callbacks and changes nothing", async () => {
    const srv = server();
    const spies = await mount("899373");
    srv.control.fakeNoChange = true;
    fireEvent.click(approveBtn("B01"));
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(spies.onChanged).not.toHaveBeenCalled();
    expect(spies.onReadyChanged).not.toHaveBeenCalled();
    expect(row("B01").textContent).toContain("لم يبدأ");
  });
  it("notes: the «تفاصيل» disclosure under the same row edits the note through progress.update; score/status controls stay visible", async () => {
    const srv = server();
    const spies = await mount("899373");
    fireEvent.click(within(row("B05")).getByRole("button", { name: "تفاصيل وملاحظة المرحلة B05" }));
    const panel = document.getElementById("eb-stage-B05") as HTMLElement;
    expect(row("B05").contains(panel)).toBe(true);
    expect(scoreInput("B05")).toBeTruthy();
    expect(approveBtn("B05")).toBeTruthy();
    fireEvent.change(within(panel).getByLabelText("ملاحظة المعلم"), { target: { value: "أحسنت" } });
    fireEvent.click(within(panel).getByRole("button", { name: "حفظ الملاحظة" }));
    await screen.findByText("تم حفظ الملاحظة.");
    expect(srv.posts).toEqual([{ projectCode: "899373", action: "progress.update", classId: "c1", studentId: "s1", stageId: "B05", note: "أحسنت" }]);
    expect(within(row("B05")).getByText("ملاحظة")).toBeTruthy();                        // note indicator on the row
    expect(spies.onReadyChanged).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Review fix: the inputs stay editable while a write is in flight — a draft edited AFTER submission is newer, unsaved
// work and must survive the earlier request's success (or noChange); an unchanged draft still clears normally.
describe("8C-2b in-flight edits are never erased by an earlier request's response", () => {
  it("score: type 70, hold the save, edit to 82, release → canonical 70 on the server, the input keeps 82; saving again stores 82", async () => {
    const srv = server();
    await mount("899373");
    type("B01", "70");
    srv.control.hold = true;
    fireEvent.click(saveBtn("B01"));
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    type("B01", "82");                                                                   // newer edit while in flight
    expect(saveBtn("B01").disabled).toBe(true);                                          // same op still pending
    srv.control.release();
    await screen.findByText("تم حفظ العلامة.");
    expect((await srv.progressOf("899373", "s1")).progress.B01.score).toBe(70);
    expect(scoreInput("B01").value).toBe("82");                                          // preserved, not lost
    await waitFor(() => expect(saveBtn("B01").disabled).toBe(false));                  // save available again
    fireEvent.click(saveBtn("B01"));
    await waitFor(() => expect(srv.posts).toHaveLength(2));
    await waitFor(() => expect(scoreInput("B01").value).toBe("82"));
    expect(srv.posts.map(p => p.score)).toEqual(["70", "82"]);
    await waitFor(async () => expect((await srv.progressOf("899373", "s1")).progress.B01.score).toBe(82));
  });
  it("note: the first note saves; a newer in-flight edit stays visible, unsaved and savable", async () => {
    const srv = server();
    await mount("899373");
    fireEvent.click(within(row("B02")).getByRole("button", { name: "تفاصيل وملاحظة المرحلة B02" }));
    const panel = document.getElementById("eb-stage-B02") as HTMLElement;
    const note = () => within(panel).getByLabelText("ملاحظة المعلم") as HTMLTextAreaElement;
    const saveNote = () => within(panel).getByRole("button", { name: "حفظ الملاحظة" }) as HTMLButtonElement;
    fireEvent.change(note(), { target: { value: "أولى" } });
    srv.control.hold = true;
    fireEvent.click(saveNote());
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    fireEvent.change(note(), { target: { value: "أولى ثم تعديل" } });
    srv.control.release();
    await screen.findByText("تم حفظ الملاحظة.");
    expect((await srv.progressOf("899373", "s1")).progress.B02.note).toBe("أولى");
    expect(note().value).toBe("أولى ثم تعديل");                                          // newer edit preserved
    await waitFor(() => expect(saveNote().disabled).toBe(false));
    fireEvent.click(saveNote());
    await waitFor(() => expect(srv.posts).toHaveLength(2));
    expect(srv.posts[1]).toMatchObject({ stageId: "B02", note: "أولى ثم تعديل" });
    await waitFor(async () => expect((await srv.progressOf("899373", "s1")).progress.B02.note).toBe("أولى ثم تعديل"));
  });
  it("an unchanged draft still clears normally on success and the canonical value shows", async () => {
    const srv = server();
    await mount("899373");
    type("B03", "64.5");
    srv.control.hold = true;
    fireEvent.click(saveBtn("B03"));
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    srv.control.release();
    await screen.findByText("تم حفظ العلامة.");
    expect(scoreInput("B03").value).toBe("64.5");                                        // canonical, no draft left
    expect(saveBtn("B03").disabled).toBe(true);                                          // nothing unsaved
    type("B03", "");                                                                     // clearing the field shows the draft path still works
    expect(saveBtn("B03").disabled).toBe(true);
  });
  it("a noChange response can never erase a newer score or note draft", async () => {
    const srv = server();
    await mount("899373");
    type("B04", "50");
    srv.control.hold = true; srv.control.fakeNoChange = false;
    fireEvent.click(saveBtn("B04"));
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    srv.control.release();
    await screen.findByText("تم حفظ العلامة.");
    // re-saving the SAME value → the server answers noChange; meanwhile the teacher edits again
    type("B04", "51"); type("B04", "50");
    expect(saveBtn("B04").disabled).toBe(true);                                          // equals canonical → not savable
    srv.control.fakeNoChange = true; srv.control.hold = false;
    fireEvent.click(within(row("B04")).getByRole("button", { name: "تفاصيل وملاحظة المرحلة B04" }));
    const panel = document.getElementById("eb-stage-B04") as HTMLElement;
    const note = within(panel).getByLabelText("ملاحظة المعلم") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "ن" } });
    srv.control.hold = true;
    fireEvent.click(within(panel).getByRole("button", { name: "حفظ الملاحظة" }));
    await waitFor(() => expect(srv.posts).toHaveLength(2));
    fireEvent.change(note, { target: { value: "ن جديدة" } });
    type("B04", "77");                                                                   // a newer score draft during the note write
    srv.control.release();
    await screen.findByText("تم حفظ الملاحظة.");                                          // the held request got the fake noChange
    expect(srv.responses).toHaveLength(1);                                               // (real handler saw only the first write)
    expect(note.value).toBe("ن جديدة");
    expect(scoreInput("B04").value).toBe("77");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8C-3 selection changes never carry drafts or stale responses", () => {
  it("switching student clears every draft (the new student shows only their canonical values)", async () => {
    server();
    const m = await mount("899373");
    type("B01", "77"); type("B02", "88");
    await m.rerender("s2");
    expect([scoreInput("B01").value, scoreInput("B02").value]).toEqual(["", ""]);
  });
  it("a slow write for the previous student never lands on the current student", async () => {
    const srv = server();
    const m = await mount("899373");
    type("B01", "99");
    srv.control.hold = true;
    fireEvent.click(saveBtn("B01"));
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    await m.rerender("s2");
    srv.control.release();
    await flush(); await flush();
    expect(scoreInput("B01").value).toBe("");                                            // s2 untouched on screen
    expect(screen.queryByText("تم حفظ العلامة.")).toBeNull();
    expect(m.onChanged).not.toHaveBeenCalled();
    expect((await srv.progressOf("899373", "s2")).progress.B01?.score).toBeUndefined();
    expect((await srv.progressOf("899373", "s1")).progress.B01.score).toBe(99);          // the write itself was s1's
  });
  it("a switch of project / class drops a queued write and its response", async () => {
    const srv = server();
    const m = await mount("899373");
    type("B01", "50");
    srv.control.hold = true;
    fireEvent.click(saveBtn("B01"));
    type("B02", "51");
    fireEvent.click(saveBtn("B02"));                                                     // queued behind the held write
    await waitFor(() => expect(srv.posts).toHaveLength(1));
    await m.rerender("s9", "c9", "883589");
    srv.control.release();
    await flush(); await flush();
    expect(srv.posts).toHaveLength(1);                                                   // the queued B02 write was dropped
    expect(scoreInput("B01").value).toBe("");
    expect(m.onChanged).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8C-4 archived class — strictly read-only", () => {
  it("shows status, score, value and note as text with NO input, save, approve, status menu or note editor", async () => {
    const srv = server();
    await mount("899373");
    type("B01", "85");
    fireEvent.click(saveBtn("B01"));
    await screen.findByText("تم حفظ العلامة.");
    cleanup();
    srv.archive("c1");
    await mount("899373");
    expect(screen.getByText("مؤرشف — للقراءة فقط")).toBeTruthy();
    expect(document.querySelector("input[data-stage-score]")).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: /^حفظ علامة/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^اعتماد المرحلة/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^تغيير حالة المرحلة/ })).toBeNull();
    expect(row("B01").querySelector(".eb-stage-score-text")!.textContent).toBe("85 / 100");
    expect(row("B01").querySelector(".eb-stage-cell-value")!.textContent).toMatch(/\d/);
    fireEvent.click(within(row("B01")).getByRole("button", { name: "تفاصيل وملاحظة المرحلة B01" }));
    expect(screen.queryByLabelText("ملاحظة المعلم")).toBeNull();
    expect(screen.queryByRole("button", { name: "مسح العلامة" })).toBeNull();
    expect(srv.posts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8C-5 structurally different projects use the SAME generic component", () => {
  it("883589 (الكتاب + Visual Studio): counts match the template; a Visual Studio stage is graded and approved", async () => {
    const srv = server();
    await mount("883589");
    const d = def("883589");
    for (const t of d.tracks) {
      selectTrack(t.title);
      expect(document.querySelectorAll(".eb-stage-group").length, t.trackId).toBe(d.groups.filter(g => g.track === t.trackId).length);
      expect(document.querySelectorAll("[data-stage-id]").length, t.trackId).toBe(d.stages.filter(s => s.track === t.trackId && s.active !== false).length);
    }
    selectTrack("Visual Studio");
    type("V02", "64");
    fireEvent.keyDown(scoreInput("V02"), { key: "Enter" });
    await screen.findByText("تم حفظ العلامة.");
    fireEvent.click(approveBtn("V02"));
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(srv.posts).toEqual([
      { projectCode: "883589", action: "score.set", classId: "c1", studentId: "s1", stageId: "V02", score: "64" },
      { projectCode: "883589", action: "progress.update", classId: "c1", studentId: "s1", stageId: "V02", status: "approved" }
    ]);
    expect((await srv.progressOf("883589", "s1")).progress.V02).toMatchObject({ status: "approved", score: 64 });
  });
  it("794589 (legacy storage, الكتاب + Packet Tracer): every row gradeable, counts match", async () => {
    const srv = server();
    await mount("794589");
    const d = def("794589");
    selectTrack("Packet Tracer");
    expect(document.querySelectorAll("[data-stage-id]").length).toBe(d.stages.filter(s => s.track === "packetTracer" && s.active !== false).length);
    type("P01", "72");
    fireEvent.click(saveBtn("P01"));
    await screen.findByText("تم حفظ العلامة.");
    expect(srv.posts).toEqual([{ projectCode: "794589", action: "score.set", classId: "c1", studentId: "s1", stageId: "P01", score: "72" }]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8C-6 source / CSS guards", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
  it("no project, track, group or stage is hard-coded in the grading component", () => {
    const src = read("./ProjectStudentDetail.tsx").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    for (const literal of ["899373", "883589", "794589", "\"book\"", "\"access\"", "\"packetTracer\"", "\"visualStudio\"", "\"B01\"", "\"A01\"", "_g1"]) expect(src, literal).not.toContain(literal);
    // Phase 9B: the request bodies are built by ONE helper (projectEvaluation.mutationBody): status / note stay progress.update,
    // a score is the narrow score.set / score.clear; the component itself carries no action literal.
    const bodies = read("./projectEvaluation.ts");
    expect(bodies).toContain('action: "progress.update"'); expect(bodies).toContain('action: "score.set"'); expect(bodies).toContain('action: "score.clear"');
    expect(src).toContain("mutationBody(");
    expect(src).not.toMatch(/projectGrade|calculate[A-Z]\w*\(/);                          // no browser-side grading formulas
  });
  it("the 8C row styles: logical properties only, tokens only, a two-line card below 768px with 44px targets and no overflow-prone fixed widths", () => {
    const css = read("../projects-pro.css");
    const block = css.slice(css.lastIndexOf("/*", css.indexOf("Phase 8C — inline stage grading")), css.indexOf(".eb-stage-timeline{"));
    const rules = block.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toMatch(/(?:margin|padding)-(?:left|right)\s*:|(?:^|[\s;{])(?:left|right)\s*:|#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    expect(rules).not.toMatch(/padding-inline-(?:start|end)\s*:/);
    const mobile = rules.slice(rules.indexOf("@media (max-width:767px)"));
    expect(mobile).toContain('grid-template-columns:minmax(0,1fr) auto');
    expect(mobile).toContain('"score score"');
    expect(mobile).toContain("min-height:44px");
    expect(mobile).not.toMatch(/\d+rem/);
  });
});
