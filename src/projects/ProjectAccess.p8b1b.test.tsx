// @vitest-environment happy-dom
/// <reference types="node" />
// Tadris+ P8-B1b — the project tracker follows the teacher's access, over the REAL project-tracker handler (in-memory container):
// every write of /api/project-tracker needs projects.tracker.manage, so without it the workspace is read only — no «التقييم
// الجماعي» / «إعداد المراحل» sections, no grading bar or save bar in a student's profile — exactly as an archived class's.
// Presentation only: the server refuses those writes anyway. No access information / not enforced → every tool, as before.
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import ProjectTracker from "./ProjectTracker";
import ProjectStudentDetail from "./ProjectStudentDetail";
import { TeacherAccessContext } from "../shell/teacherAccessContext";
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
const withAccess = (capabilities: string[] | null, ui: ReactNode) => <TeacherAccessContext.Provider value={capabilities ? { status: "ok", enforced: true, capabilities } : null}>{ui}</TeacherAccessContext.Provider>;
const VIEW = ["classes.class.view", "projects.tracker.view"], MANAGE = [...VIEW, "projects.tracker.manage"];

function server() {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": { classId: "c1", name: "صف c1", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW },
    "platform/users/s1.json": { userId: "s1", role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب s1", code: "Cs1" },
    [NS.progressName("c1", "s1")]: { schemaVersion: 1, programCode: CODE, classId: "c1", studentId: "s1", startedAt: NOW, updatedAt: NOW, stages: {}, history: [] }
  });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    const r = await tracker({ method, url: "https://x" + String(input), json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
}
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  server();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const sections = async () => within(await screen.findByRole("group", { name: "أقسام المشروع" })).getAllByRole("button").map(b => b.textContent);
async function profile(capabilities: string[] | null) {
  render(withAccess(capabilities, <ProjectStudentDetail token="t" projectCode={CODE} classId="c1" studentId="s1" tracks={TRACKS} onBack={() => {}} onChanged={() => {}} onReadyChanged={() => {}} />));
  await screen.findByRole("heading", { level: 2, name: "ملف المشروع: طالب s1" });
  await screen.findByRole("table");
}

describe("P8-B1b — the project tracker without projects.tracker.manage", () => {
  it("the workspace offers the read-only sections only", async () => {
    render(withAccess(VIEW, <ProjectTracker token="t" projectCode={CODE} />));
    expect(await sections()).toEqual(["لوحة المشروع", "تقدّم الطلاب", "الإحصائيات"]);
  });
  it("with it (or without access information): every section", async () => {
    render(withAccess(MANAGE, <ProjectTracker token="t" projectCode={CODE} />));
    expect(await sections()).toEqual(["لوحة المشروع", "تقدّم الطلاب", "التقييم الجماعي", "الإحصائيات", "إعداد المراحل"]);
    cleanup();
    render(withAccess(null, <ProjectTracker token="t" projectCode={CODE} />));
    expect((await sections()).length).toBe(5);
  });
  it("a student's profile is read only: no grading switch, no save bar", async () => {
    await profile(VIEW);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("region", { name: "حفظ تغييرات الطالب" })).toBeNull();
    expect(screen.queryByText("مؤرشف — للقراءة فقط")).toBeNull();          // the archive badge keeps its meaning
  });
  it("with it: the grading switch and the save bar are there", async () => {
    await profile(MANAGE);
    expect(screen.getByRole("switch")).toBeTruthy();
    expect(screen.getByRole("region", { name: "حفظ تغييرات الطالب" })).toBeTruthy();
  });
});
