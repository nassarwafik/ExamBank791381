// @vitest-environment happy-dom
/// <reference types="node" />
// Phase P8 — «اعتماد المرحلة عند حفظ العلامة» in the student profile, over the REAL project-tracker handler (in-memory
// container). Owner decision (b): a visible switch, ON by default and remembered on this device. With it on, saving a
// score on a stage not yet approved — or still the student's own unconfirmed mark — also approves it, in ONE
// `progress.update` carrying both (the server records the approval and the score). An approved stage, a cleared score and
// the switch turned off keep the 8C / 9B rule: a score write never changes the status.
// Fail-first: run against b253a3df (no switch; a save is always score.set only).
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProjectStudentDetail from "./ProjectStudentDetail";
import type { TrackMeta } from "./types";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const NOW = "2026-10-01T00:00:00.000Z";
const TRACKS: TrackMeta[] = getProjectDefinition(CODE).tracks;
const KEY = "eb.projects.approveOnSave";
const user = (id: string, cid: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
const room = (id: string, over: Body = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
const TEACHER = { status: "approved", approvedBy: "teacher-1", approvedAt: NOW, updatedAt: NOW };
const SELF = { status: "approved", approvedBy: "s1", approvedAt: NOW, selfReportedAt: NOW, selfReportedBy: "s1", selfReportedFrom: "not_started" };

function server(stages: Record<string, Body> = {}, roomOver: Body = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1", roomOver), "platform/users/s1.json": user("s1", "c1"),
    [NS.progressName("c1", "s1")]: { schemaVersion: 1, programCode: CODE, classId: "c1", studentId: "s1", startedAt: NOW, updatedAt: NOW, stages, history: [] }
  });
  const audits: Body[] = [];
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c: unknown, e: Body) => { audits.push(e); }, recordProjectMilestones: async () => {} };
  const posts: Body[] = [];
  const control = { hold: false, release: () => {} };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") {
      posts.push(body!);
      if (control.hold) { control.hold = false; await new Promise<void>(r => { control.release = r; }); }
    }
    const r = await tracker({ method, url: "https://x" + String(input), json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  return { posts, audits, control, entry: (id: string) => ctx.getJson(NS.progressName("c1", "s1")).stages[id] };
}
async function mount() {
  const onReadyChanged = vi.fn();
  render(<ProjectStudentDetail token="t" projectCode={CODE} classId="c1" studentId="s1" tracks={TRACKS} onBack={() => {}} onChanged={() => {}} onReadyChanged={onReadyChanged} />);
  await screen.findByRole("heading", { level: 2, name: "ملف المشروع: طالب s1" });
  return { onReadyChanged };
}
const row = (id: string) => document.querySelector('[data-stage-id="' + id + '"]') as HTMLElement;
const input = (id: string) => within(row(id)).getByRole("spinbutton") as HTMLInputElement;
const type = (id: string, v: string) => fireEvent.change(input(id), { target: { value: v } });
const toggle = () => screen.getByRole("switch", { name: "اعتماد المرحلة عند حفظ العلامة" }) as HTMLInputElement;

beforeEach(() => { try { window.localStorage.removeItem(KEY); } catch { /* none */ } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P8 — the switch, ON by default", () => {
  it("is visible and on; «حفظ واعتماد» saves the score AND approves the stage in ONE progress.update", async () => {
    const s = server();
    const { onReadyChanged } = await mount();
    expect(toggle().checked).toBe(true);
    expect(screen.getByText(/تُحفظ العلامة وتُعتمد المرحلة معًا/)).toBeTruthy();
    type("BK01", "85");
    const save = within(row("BK01")).getByRole("button", { name: "حفظ واعتماد علامة المرحلة BK01" });
    expect(save.textContent).toBe("حفظ واعتماد");
    fireEvent.click(save);
    await screen.findByText("تم حفظ العلامة واعتماد المرحلة.");
    expect(s.posts).toEqual([{ projectCode: CODE, action: "progress.update", classId: "c1", studentId: "s1", stageId: "BK01", score: "85", status: "approved" }]);
    expect(s.entry("BK01")).toMatchObject({ status: "approved", score: 85, approvedBy: "teacher-1" });
    expect(s.audits.map(a => a.action).sort()).toEqual(["project.stage.approve", "project.stage.score"]);
    expect(onReadyChanged).toHaveBeenCalled();
    // the row now shows an approved stage: its next save is a score only
    await waitFor(() => expect(within(row("BK01")).getByRole("button", { name: "حفظ علامة المرحلة BK01" })).toBeTruthy());
  });

  it("Enter in the score field does the same (one request, approved)", async () => {
    const s = server({ BK02: { status: "ready_for_review", updatedAt: NOW } });
    await mount();
    type("BK02", "70");
    fireEvent.keyDown(input("BK02"), { key: "Enter" });
    await waitFor(() => expect(s.entry("BK02")).toMatchObject({ status: "approved", score: 70 }));
    expect(s.posts).toHaveLength(1);
    expect(s.posts[0]).toMatchObject({ action: "progress.update", status: "approved", score: "70" });
  });

  it("a stage the student marked (unconfirmed) is confirmed by the save; a teacher-approved one gets the score only", async () => {
    const s = server({ BK01: SELF, BK02: TEACHER });
    await mount();
    type("BK01", "90");
    fireEvent.click(within(row("BK01")).getByRole("button", { name: "حفظ واعتماد علامة المرحلة BK01" }));
    await waitFor(() => expect(s.entry("BK01").score).toBe(90));
    expect(s.entry("BK01").status).toBe("approved");
    expect(s.entry("BK01").selfReportedAt).toBeUndefined();                    // confirmed by the teacher
    type("BK02", "60");
    fireEvent.click(within(row("BK02")).getByRole("button", { name: "حفظ علامة المرحلة BK02" }));
    await waitFor(() => expect(s.entry("BK02").score).toBe(60));
    expect(s.posts[1]).toEqual({ projectCode: CODE, action: "score.set", classId: "c1", studentId: "s1", stageId: "BK02", score: "60" });
  });

  it("clearing a score never approves", async () => {
    const s = server({ BK01: { status: "in_progress", score: 40, updatedAt: NOW } });
    await mount();
    fireEvent.click(within(row("BK01")).getByRole("button", { name: "تفاصيل وملاحظة المرحلة BK01" }));
    fireEvent.click(screen.getByRole("button", { name: "مسح العلامة" }));
    await waitFor(() => expect(s.entry("BK01").score).toBeUndefined());
    expect(s.posts).toEqual([{ projectCode: CODE, action: "score.clear", classId: "c1", studentId: "s1", stageId: "BK01" }]);
    expect(s.entry("BK01").status).toBe("in_progress");
  });

  it("while the combined save is in flight, the row's save AND approve are busy; a double click sends once", async () => {
    const s = server();
    await mount();
    s.control.hold = true;
    type("BK01", "77");
    const save = within(row("BK01")).getByRole("button", { name: "حفظ واعتماد علامة المرحلة BK01" });
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => expect(s.posts).toHaveLength(1));
    expect((within(row("BK01")).getByRole("button", { name: "اعتماد المرحلة BK01" }) as HTMLButtonElement).disabled).toBe(true);
    s.control.release();
    await screen.findByText("تم حفظ العلامة واعتماد المرحلة.");
    expect(s.posts).toHaveLength(1);
  });
});

describe("P8 — the switch OFF, remembered on this device", () => {
  it("turned off: the save is score.set only and the status stays; the choice survives a new profile", async () => {
    const s = server();
    await mount();
    fireEvent.click(toggle());
    expect(toggle().checked).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("0");
    expect(screen.getByText(/ثم «اعتماد» لاعتماد المرحلة/)).toBeTruthy();
    type("BK01", "85");
    fireEvent.click(within(row("BK01")).getByRole("button", { name: "حفظ علامة المرحلة BK01" }));
    await screen.findByText("تم حفظ العلامة.");
    expect(s.posts).toEqual([{ projectCode: CODE, action: "score.set", classId: "c1", studentId: "s1", stageId: "BK01", score: "85" }]);
    expect(s.entry("BK01").status ?? "not_started").toBe("not_started");
    cleanup();
    server();
    await mount();
    expect(toggle().checked).toBe(false);
    fireEvent.click(toggle());
    expect(window.localStorage.getItem(KEY)).toBe("1");
  });

  it("without usable storage the switch is still ON by default and still works for the session", async () => {
    // Storage blocked (a private window / blocked site data): every access throws.
    const real = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new Error("blocked"); } });
    try {
      const s = server();
      await mount();
      expect(toggle().checked).toBe(true);
      fireEvent.click(toggle());
      expect(toggle().checked).toBe(false);
      type("BK01", "50");
      fireEvent.click(within(row("BK01")).getByRole("button", { name: "حفظ علامة المرحلة BK01" }));
      await waitFor(() => expect(s.posts).toHaveLength(1));
      expect(s.posts[0].action).toBe("score.set");
    } finally { if (real) Object.defineProperty(window, "localStorage", real); else delete (window as unknown as { localStorage?: Storage }).localStorage; }
  });

  it("an archived class shows no switch", async () => {
    server({}, { status: "archived", active: false });
    await mount();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
