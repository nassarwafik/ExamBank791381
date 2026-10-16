// @vitest-environment happy-dom
//
// Phase 21F.0 — conditional saves through the REAL App and the REAL (lazy) StructuredExamBuilder with a mocked teacher API: a save
// states the server version it starts from; a refused save (409 EXAM_CONFLICT) overwrites nothing and opens «تعارض في الحفظ»,
// whose resolutions are explicit (save as a new exam, replace the server copy after a confirmation, or open the server copy).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import App from "./App";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const sq = (id: string, text: string) => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks: 2, answer: { text: "-" } });
const structuredExam = (title = "اختبار الوحدة الثانية") => ({ schemaVersion: 2, examId: "E9", title, status: "draft", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", metadata: {},
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, instructions: "", questions: [sq("s1q1", "السؤال الأول")] }] });
const SAVED = [{ blobName: "exams/E9.json", examId: "E9", title: "اختبار الوحدة الثانية", savedAt: "2026-10-01T10:00:00Z", questionCount: 1, totalMarks: 2 }];

type SaveBody = { kind: string; exam: { examId: string; title: string }; conditional?: boolean; baseEtag?: string | null };
let saves: SaveBody[] = [];
let saveReplies: Array<() => Promise<Response>> = [];
let loads = 0;

beforeEach(() => {
  saves = []; saveReplies = []; loads = 0;
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* ignore */ }
  // Phase 21F.9 — the Studio is the default layout; this suite exercises the CLASSIC layout (the teacher's opt-out), so it chooses it.
  try { localStorage.setItem("tadris.studio.layout", "classic"); } catch { /* ignore */ }
  sessionStorage.setItem("examBankBuilderToken", "teacher-token");
  sessionStorage.setItem("examBankSessionRole", "teacher");
  sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد");
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.includes("/api/platform-session")) return res(200, { ok: true, role: "teacher", displayName: "أ. أحمد" });
    if (url.includes("/api/teacher-profile")) return res(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
    if (url.includes("/api/project-tracker")) return res(200, { ok: true, projects: [], totalReadyForReview: 0, byProject: {} });
    if (url.includes("/api/messages")) return res(200, { ok: true, totalUnread: 0, capped: false });
    if (url.includes("/api/save-exam-artifact")) { saves.push(body); const next = saveReplies.shift(); return next ? next() : res(200, { ok: true, kind: "exam", blobName: "exams/x.json", savedAt: "2026-10-15T10:00:00Z", etag: "E-saved-" + saves.length }); }
    if (url.includes("/api/saved-exams")) {
      if (method === "GET") return res(200, { ok: true, exams: SAVED });
      if (body.action === "load") { loads += 1; return res(200, loads === 1 ? { ok: true, exam: structuredExam(), savedAt: "2026-10-01T10:00:00Z", blobName: "exams/E9.json", etag: "E-1" } : { ok: true, exam: structuredExam("نسخة الزميل"), savedAt: "2026-10-15T09:00:00Z", blobName: "exams/E9.json", etag: "E-2" }); }
    }
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const settle = (ms = 30) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const conflict409 = () => res(409, { ok: false, code: "EXAM_CONFLICT", error: "تم حفظ نسخة أحدث من هذا الامتحان من مكان آخر.", blobName: "exams/E9.json", serverEtag: "E-2", serverSavedAt: "2026-10-15T09:00:00Z" });

async function openSavedExam() {
  render(<App />);
  await click(await screen.findByRole("button", { name: /الامتحانات المحفوظة/ }, { timeout: 5000 }));
  const panel = await screen.findByRole("heading", { name: /الامتحانات المحفوظة/ }).then(h => h.closest(".saved-exams-panel") as HTMLElement);
  await click(within(panel).getByRole("button", { name: /فتح وتعديل/ }));
  const overlay = await screen.findByRole("dialog", { name: /باني الامتحان المنظّم/ }, { timeout: 15000 });
  await settle();
  return overlay;
}
const saveDraft = async (overlay: HTMLElement) => { await click(within(overlay).getByRole("button", { name: /حفظ مسودة/ })); await settle(60); };

describe("21F.0 — conditional saves from the structured builder", () => {
  it("a save states the version it was opened from, and the next save the version the server returned", async () => {
    const overlay = await openSavedExam();
    await saveDraft(overlay);
    expect(saves[0]).toMatchObject({ kind: "exam", conditional: true, baseEtag: "E-1" });
    await saveDraft(overlay);
    expect(saves[1]).toMatchObject({ conditional: true, baseEtag: "E-saved-1" });
  }, 30000);

  it("a refused save opens «تعارض في الحفظ» and «حفظ نسختي كامتحان جديد» creates a NEW exam (create-only)", async () => {
    saveReplies.push(conflict409);
    const overlay = await openSavedExam();
    await saveDraft(overlay);
    const dialog = await screen.findByRole("dialog", { name: "تعارض في الحفظ" });
    expect(within(dialog).getByTestId("save-conflict").textContent).toMatch(/لم يُحفظ شيء من تغييراتك/);
    expect(screen.queryByText(/تم حفظ مسودة الامتحان المنظّم/)).toBeNull();

    await click(within(dialog).getByRole("button", { name: "حفظ نسختي كامتحان جديد" }));
    await settle(80);
    expect(saves).toHaveLength(2);
    expect(saves[1].conditional).toBe(true);
    expect(saves[1].baseEtag).toBeNull();
    expect(saves[1].exam.examId).not.toBe("E9");
    expect(saves[1].exam.examId).toMatch(/^EXAM-/);
    expect(saves[1].exam.title).toBe("اختبار الوحدة الثانية (نسختي)");
    expect(screen.queryByRole("dialog", { name: "تعارض في الحفظ" })).toBeNull();
  }, 30000);

  it("«استبدال بنسختي» asks first, then saves against the version the server reported", async () => {
    saveReplies.push(conflict409);
    const overlay = await openSavedExam();
    await saveDraft(overlay);
    const dialog = await screen.findByRole("dialog", { name: "تعارض في الحفظ" });
    await click(within(dialog).getByRole("button", { name: "استبدال بنسختي" }));
    const confirm = await screen.findByRole("alertdialog", { name: "استبدال نسخة الخادم" }).catch(() => screen.findByRole("dialog", { name: "استبدال نسخة الخادم" }));
    expect(saves).toHaveLength(1);
    await click(within(confirm).getByRole("button", { name: "استبدال بنسختي" }));
    await settle(80);
    expect(saves).toHaveLength(2);
    expect(saves[1]).toMatchObject({ conditional: true, baseEtag: "E-2" });
    expect(saves[1].exam.examId).toBe("E9");
  }, 30000);

  it("«فتح نسخة الخادم» asks first, then opens the newer server copy as the saved state", async () => {
    saveReplies.push(conflict409);
    const overlay = await openSavedExam();
    await saveDraft(overlay);
    const dialog = await screen.findByRole("dialog", { name: "تعارض في الحفظ" });
    await click(within(dialog).getByRole("button", { name: "فتح نسخة الخادم" }));
    const confirm = await screen.findByRole("alertdialog", { name: "فتح نسخة الخادم" }).catch(() => screen.findByRole("dialog", { name: "فتح نسخة الخادم" }));
    await click(within(confirm).getByRole("button", { name: "فتح نسخة الخادم" }));
    await settle(80);
    expect(await screen.findByRole("dialog", { name: /باني الامتحان المنظّم: نسخة الزميل/ })).toBeTruthy();
    await saveDraft(screen.getByRole("dialog", { name: /باني الامتحان المنظّم/ }));
    expect(saves[1]).toMatchObject({ conditional: true, baseEtag: "E-2" });
  }, 30000);

  it("a brand-new structured exam is saved create-only with a random id", async () => {
    render(<App />);
    await click(await screen.findByRole("button", { name: /امتحان منظّم جديد/ }, { timeout: 5000 }));
    const overlay = await screen.findByRole("dialog", { name: /باني الامتحان المنظّم/ }, { timeout: 15000 });
    await settle();
    await saveDraft(overlay);
    expect(saves[0]).toMatchObject({ conditional: true, baseEtag: null });
    expect(saves[0].exam.examId).toMatch(/^EXAM-[0-9a-f]{8}-[0-9a-f]{4}-/);
  }, 30000);
});
