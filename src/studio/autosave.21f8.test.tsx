// @vitest-environment happy-dom
//
// Phase 21F.8 (D3) — server draft autosave. The controller's requests go to the REAL save / load handlers over the shared in-memory
// blob container (Azure-faithful ETags), so a conditional save really can be refused. Two controllers are two browser tabs.
//   • an autosave is a quiet DRAFT save of an exam the server already holds: the editor is never locked (`saving` stays false), the
//     save state reaches «محفوظ», and the next save starts from the version just returned (no self-conflict);
//   • it never creates an exam and never touches a final one;
//   • two tabs: the later autosave is refused (409), opens «تعارض في الحفظ», and nothing is lost on either side;
//   • offline: nothing is lost, the teacher is told, the same snapshot is not retried;
//   • a manual save during an autosave waits for it and starts from its version.
import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { renderHook, act } from "@testing-library/react";
import { useExamStudioController, type StudioRequest } from "./useExamStudioController";
import { examSaveState } from "../examHistory";
import type { StructuredExam } from "../examTypes";

const require = createRequire(import.meta.url);
const saveHandler = require("../../api/src/functions/save-exam-artifact.js");
const savedHandler = require("../../api/src/functions/manage-saved-exams.js");
const { createMemoryContainer } = require("../../api/tests/fixtures/memory-container.js");

const tf = (id: string, text: string) => ({ examQuestionId: id, presentationType: "trueFalse", marks: 1, text, answer: { correct: true } });
const exam = (title: string, status: "draft" | "final" = "draft"): StructuredExam => ({ examId: "EXAM-T", title, status, sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [tf("q1", "عبارة")] }] } as unknown as StructuredExam);
const auth = () => ({ ok: true, user: { ver: 2, role: "teacher", sub: "builder", am: "legacy" } });

function server() {
  const mem = createMemoryContainer({});
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  let offline = false, delay: Promise<void> | null = null;
  const request: StudioRequest = async <T,>(url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body || "{}"));
    calls.push({ url, body });
    if (offline) throw new TypeError("Failed to fetch");
    if (delay) await delay;
    const deps = { requireBuilderAuth: auth, getContainer: () => mem.container };
    const req = { method: init.method || "GET", url: "http://x" + url, headers: { get: () => "" }, json: async () => body };
    const res = await (url.includes("save-exam-artifact") ? saveHandler : savedHandler).handler(req, deps);
    if (res.status >= 300) throw Object.assign(new Error(res.jsonBody?.error || "error"), { status: res.status, payload: res.jsonBody });
    return res.jsonBody as T;
  };
  return { mem, calls, request, saves: () => calls.filter(c => c.url.includes("save-exam-artifact")), setOffline: (v: boolean) => { offline = v; }, hold: () => { let release!: () => void; delay = new Promise(r => { release = r; }); return () => { delay = null; release(); }; } };
}
type S = ReturnType<typeof server>;
const tab = (srv: S) => renderHook(() => useExamStudioController({ request: srv.request })).result;
type Tab = ReturnType<typeof tab>;
async function seed(srv: S, e = exam("الأصل")) {
  const r = await srv.request<{ etag: string }>("/api/save-exam-artifact", { method: "POST", body: JSON.stringify({ kind: "exam", exam: e, conditional: true, baseEtag: null }) });
  return r.etag;
}
async function openFromServer(t: Tab, srv: S) {
  const loaded = await srv.request<{ exam: StructuredExam; etag: string }>("/api/saved-exams", { method: "POST", body: JSON.stringify({ action: "load", blobName: "exams/EXAM-T.json" }) });
  act(() => t.current.openExam(loaded.exam, "saved", loaded.etag));
}
const edit = (t: Tab, title: string) => act(() => { t.current.history.update(prev => ({ ...prev, title })); });
const settled = async (t: Tab) => { for (let i = 0; i < 200 && (i < 2 || t.current.autosaving || t.current.saving); i++) await act(async () => { await new Promise(r => setTimeout(r, 5)); }); };
const autosave = async (t: Tab) => { act(() => { t.current.autosaveDraft(); }); await settled(t); };
const stored = (srv: S) => srv.mem.getJson("exams/EXAM-T.json").exam;

describe("21F.8 server draft autosave", () => {
  // The controller loads the save policy on demand; load it once up front so every test measures the save, not a cold import.
  beforeAll(async () => { await import("../structuredSavePolicy"); });
  it("saves a dirty draft quietly, never locks the editor, reaches «محفوظ», and the next autosave starts from the new version", async () => {
    const srv = server(); await seed(srv);
    const a = tab(srv); await openFromServer(a, srv);
    edit(a, "تعديل ١");
    act(() => { a.current.autosaveDraft(); });
    expect(a.current.autosaving).toBe(true);                                    // shown as «جارٍ الحفظ…» …
    expect(a.current.saving).toBe(false);                                       // … but the editor stays editable
    await settled(a);
    expect(a.current.saving).toBe(false);
    expect(stored(srv).title).toBe("تعديل ١");
    expect(stored(srv).status).toBe("draft");
    expect(examSaveState(a.current.history.history, false)).toBe("saved");
    expect(a.current.notice).toBe("");
    edit(a, "تعديل ٢");
    await autosave(a);
    expect(a.current.conflict).toBeNull();
    expect(stored(srv).title).toBe("تعديل ٢");
  });

  it("never creates an exam (no server version) and never saves a final exam (a draft save would demote it)", async () => {
    const srv = server();
    const a = tab(srv);
    act(() => a.current.openExam(exam("جديد"), "unsaved", null));
    edit(a, "جديد معدّل");
    await autosave(a);
    expect(srv.saves()).toHaveLength(0);

    await seed(srv, exam("نهائي", "final"));
    const b = tab(srv); await openFromServer(b, srv);
    edit(b, "نهائي معدّل");
    const before = srv.saves().length;
    await autosave(b);
    expect(srv.saves()).toHaveLength(before);
    expect(stored(srv).status).toBe("final");
  });

  it("does nothing when there is nothing unsaved", async () => {
    const srv = server(); await seed(srv);
    const a = tab(srv); await openFromServer(a, srv);
    const before = srv.saves().length;
    await autosave(a);
    expect(srv.saves()).toHaveLength(before);
  });

  it("two tabs: the later autosave is refused and opens the conflict; nothing is lost on either side", async () => {
    const srv = server(); await seed(srv);
    const a = tab(srv), b = tab(srv);
    await openFromServer(a, srv); await openFromServer(b, srv);
    edit(a, "عمل التبويب الأول"); edit(b, "عمل التبويب الثاني");
    await autosave(a);
    expect(stored(srv).title).toBe("عمل التبويب الأول");
    await autosave(b);
    expect(b.current.conflict).toMatchObject({ mode: "draft" });
    expect(stored(srv).title).toBe("عمل التبويب الأول");                      // the server keeps tab A's work
    expect(b.current.exam?.title).toBe("عمل التبويب الثاني");                  // tab B keeps its own work
    expect(examSaveState(b.current.history.history, false)).toBe("dirty");
    // While the conflict is open, autosave stays quiet.
    const before = srv.saves().length;
    await autosave(b);
    expect(srv.saves()).toHaveLength(before);
    // «حفظ نسختي كامتحان جديد»: both versions now exist on the server.
    act(() => { b.current.saveAsCopy(); });
    await settled(b);
    const titles = srv.mem.names().map((n: string) => srv.mem.getJson(n).exam.title).sort();
    expect(titles).toEqual(["عمل التبويب الأول", "عمل التبويب الثاني (نسختي)"].sort());
  });

  it("offline: the edits stay, the teacher is told, and the same snapshot is not retried; the next edit tries again", async () => {
    const srv = server(); await seed(srv);
    const a = tab(srv); await openFromServer(a, srv);
    edit(a, "دون اتصال");
    srv.setOffline(true);
    await autosave(a);
    expect(a.current.error).toBe("");
    expect(a.current.notice).toMatch(/تعذّر الحفظ التلقائي/);
    expect(a.current.exam?.title).toBe("دون اتصال");
    expect(examSaveState(a.current.history.history, false)).toBe("dirty");
    const attempts = srv.saves().length;
    await autosave(a);
    expect(srv.saves()).toHaveLength(attempts);
    srv.setOffline(false);
    edit(a, "عاد الاتصال");
    await autosave(a);
    expect(stored(srv).title).toBe("عاد الاتصال");
  });

  it("a manual save during an autosave waits for it and starts from the version it returned (no self-conflict)", async () => {
    const srv = server(); await seed(srv);
    const a = tab(srv); await openFromServer(a, srv);
    edit(a, "قبل الحفظ اليدوي");
    const release = srv.hold();
    await act(async () => { a.current.autosaveDraft(); await new Promise(r => setTimeout(r, 0)); });
    edit(a, "الحفظ اليدوي");
    let manual!: Promise<void>;
    act(() => { manual = a.current.save("draft"); });
    await act(async () => { release(); await manual; });
    expect(a.current.conflict).toBeNull();
    expect(a.current.error).toBe("");
    const saves = srv.saves();
    expect(saves).toHaveLength(3);                                              // seed, autosave, manual
    expect(saves[2].body.baseEtag).not.toBe(saves[1].body.baseEtag);
    expect(stored(srv).title).toBe("الحفظ اليدوي");
  });
});
