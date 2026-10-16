// @vitest-environment happy-dom
//
// Phase 21F.7 — «امتحاناتي» through the REAL App with a mocked teacher API: in the Studio layout the builder page shows the home
// instead of the access bar; the list loads once and shows each exam's status and readiness (the additive list fields); search and
// filters narrow it; «فتح» opens the exam in the Studio; «المؤلف الذكي» opens a new exam with the composer; «من قالب أكاديمي» opens
// the preset library pick-only. The classic layout keeps its access bar.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import App from "./App";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const structuredExam = () => ({ schemaVersion: 2, examId: "E1", title: "امتحان الشبكات", status: "draft", metadata: {},
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, instructions: "", questions: [{ examQuestionId: "q1", presentationType: "trueFalse", text: "عبارة", marks: 1, answer: { correct: true } }] }] });
const SAVED = [
  { blobName: "exams/E1.json", examId: "E1", title: "امتحان الشبكات", savedAt: "2026-10-02T10:00:00Z", questionCount: 1, totalMarks: 1, kind: "structured", status: "draft", readiness: { canFinalize: true, blockers: 0, warnings: 0 } },
  { blobName: "exams/E2.json", examId: "E2", title: "اختبار الأمن", savedAt: "2026-10-01T10:00:00Z", questionCount: 4, totalMarks: 8, kind: "structured", status: "draft", readiness: { canFinalize: false, blockers: 3, warnings: 1 } },
  { blobName: "exams/E3.json", examId: "E3", title: "النهائي", savedAt: "2026-09-30T10:00:00Z", questionCount: 20, totalMarks: 40, kind: "structured", status: "final", readiness: { canFinalize: true, blockers: 0, warnings: 0 } }
];
let listCalls = 0;
let extra: typeof SAVED = [];
let saveCalls = 0;
let saveBodies: { exam: { examId: string; title: string }; conditional?: boolean; baseEtag?: string | null }[] = [];
const LEGACY = { blobName: "exams/L1.json", examId: "L1", title: "امتحان قديم", savedAt: "2025-05-01T10:00:00Z", questionCount: 1, totalMarks: 1, kind: "legacy", status: "draft", readiness: null };

beforeEach(() => {
  listCalls = 0; extra = []; saveCalls = 0; saveBodies = [];
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* ignore */ }
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
    if (url.includes("/api/assessment-presets")) return res(200, { ok: true, items: [], nextCursor: null });
    if (url.includes("/api/saved-exams")) {
      if (method === "GET") { listCalls += 1; return res(200, { ok: true, exams: [...SAVED, ...extra] }); }
      if (body.action === "load" && body.blobName === "exams/L1.json") return res(200, { ok: true, exam: { examId: "L1", title: "امتحان قديم", questions: [{ id: "x1", type: "trueFalse", text: "عبارة قديمة", marks: 1, answer: true }] }, savedAt: "2025-05-01T10:00:00Z", blobName: "exams/L1.json", etag: "L-1" });
      if (body.action === "load") return res(200, { ok: true, exam: structuredExam(), savedAt: "2026-10-02T10:00:00Z", blobName: "exams/E1.json", etag: "E-1" });
    }
    if (url.includes("/api/save-exam-artifact")) { saveCalls += 1; saveBodies.push(body); return res(200, { ok: true, kind: "exam", blobName: "exams/new.json", savedAt: "2026-10-16T10:00:00Z", etag: "N-1" }); }
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const settle = (ms = 30) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const cards = () => within(screen.getByRole("list", { name: "الامتحانات المحفوظة" })).getAllByRole("listitem").map(li => li.getAttribute("data-exam-id"));
async function openHome() {
  localStorage.setItem("tadris.studio.layout", "studio");
  render(<App />);
  await screen.findByRole("heading", { name: "امتحاناتي" }, { timeout: 8000 });
  await screen.findByRole("list", { name: "الامتحانات المحفوظة" });
  await settle();
}

describe("21F.7 «امتحاناتي»", () => {
  it("replaces the access bar in the Studio layout and loads the list once, with status and readiness", async () => {
    await openHome();
    expect(document.querySelector(".saved-exams-access")).toBeNull();
    expect(listCalls).toBe(1);
    expect(cards()).toEqual(["E1", "E2", "E3"]);
    const e2 = document.querySelector('[data-exam-id="E2"]') as HTMLElement;
    expect(e2.textContent).toMatch(/مسودة/);
    expect(e2.textContent).toMatch(/3 عوائق/);
    expect((document.querySelector('[data-exam-id="E1"]') as HTMLElement).textContent).toMatch(/جاهز للاعتماد/);
    expect((document.querySelector('[data-exam-id="E3"]') as HTMLElement).textContent).toMatch(/معتمد نهائيًا/);
  }, 30000);

  it("search and status filters narrow the cards", async () => {
    await openHome();
    await act(async () => { fireEvent.change(screen.getByRole("searchbox"), { target: { value: "الأمن" } }); });
    expect(cards()).toEqual(["E2"]);
    await act(async () => { fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } }); });
    const filters = screen.getByRole("group", { name: "تصفية حسب الحالة" });
    await click(within(filters).getByRole("button", { name: /تحتاج إصلاحًا/ }));
    expect(cards()).toEqual(["E2"]);
    await click(within(filters).getByRole("button", { name: /معتمدة/ }));
    expect(cards()).toEqual(["E3"]);
  }, 30000);

  it("«فتح» opens the exam in the Studio", async () => {
    await openHome();
    await click(within(document.querySelector('[data-exam-id="E1"]') as HTMLElement).getByRole("button", { name: "فتح" }));
    expect(await screen.findByRole("dialog", { name: /استوديو الامتحان: امتحان الشبكات/ }, { timeout: 15000 })).toBeTruthy();
  }, 30000);

  it("«المؤلف الذكي» opens a new exam with the composer", async () => {
    await openHome();
    await click(document.querySelector('[data-create="compose"]')!);
    expect(await screen.findByRole("dialog", { name: "المؤلف الذكي للامتحان" }, { timeout: 15000 })).toBeTruthy();
  }, 30000);

  it("«من قالب أكاديمي» opens the preset library pick-only (no «save the current design»)", async () => {
    await openHome();
    await click(document.querySelector('[data-create="preset"]')!);
    const dialog = await screen.findByRole("dialog", { name: "القوالب الأكاديمية" }, { timeout: 15000 });
    await settle(60);
    expect(within(dialog).queryByRole("button", { name: "حفظ التصميم الحالي كقالب أكاديمي" })).toBeNull();
  }, 30000);

  it("21F.9 (D1) «تحويل إلى منظّم» turns a legacy exam into a NEW structured exam in the Studio; nothing is saved or replaced", async () => {
    extra = [LEGACY as unknown as (typeof SAVED)[number]];
    await openHome();
    const card = document.querySelector('[data-exam-id="L1"]') as HTMLElement;
    expect(card.textContent).toMatch(/امتحان قديم \(غير منظّم\)/);
    await click(within(card).getByRole("button", { name: "تحويل إلى منظّم" }));
    const overlay = await screen.findByRole("dialog", { name: /استوديو الامتحان: امتحان قديم \(منظّم\)/ }, { timeout: 15000 });
    expect(saveCalls).toBe(0);
    // Its first save creates a NEW exam (fresh id, create-only): the legacy original can never be overwritten by it.
    await click(within(overlay).getByRole("button", { name: /حفظ مسودة/ }));
    await settle(80);
    expect(saveBodies).toHaveLength(1);
    expect(saveBodies[0].exam.examId).not.toBe("L1");
    expect(saveBodies[0]).toMatchObject({ conditional: true, baseEtag: null });
  }, 30000);

  it("21F.9 — the Studio is the default: with no stored choice the builder page shows «امتحاناتي»", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "امتحاناتي" }, { timeout: 8000 })).toBeTruthy();
    expect(document.querySelector(".saved-exams-access")).toBeNull();
  }, 30000);

  it("the classic layout (chosen by the teacher) keeps its access bar", async () => {
    localStorage.setItem("tadris.studio.layout", "classic");
    render(<App />);
    expect(await screen.findByRole("button", { name: /الامتحانات المحفوظة/ }, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "امتحاناتي" })).toBeNull();
  }, 30000);
});
