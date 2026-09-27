// @vitest-environment happy-dom
//
// Phase 9F — the evaluation queue on the REAL App: a «تقييم المشاريع» row starts a session at the clicked row over the
// hub's server-ordered rows; «الطالب التالي» / «الطالب السابق» move through the same 9D drill path (classes validated
// before any student read, cross-class and cross-project through App's existing project navigation) and re-run the 9E
// focus with a fresh seq; a student the server reports fully graded shows the CTA and is skipped by later moves; nothing
// ever navigates automatically; a manual student open or ordinary Projects navigation ends the session.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act, configure } from "@testing-library/react";
configure({ asyncUtilTimeout: 5000 });
import App from "./App";

const TRACKS = [{ trackId: "book", title: "الكتاب", icon: "📘" }];
const PROJECTS = [{ projectCode: "899373", title: "مشروع 899373", tracks: TRACKS }, { projectCode: "883589", title: "مشروع 883589", tracks: TRACKS }];
const CLASSES: Record<string, { classId: string; name: string; grade: string; schoolYear: string; status: string; studentCount: number }[]> = {
  "899373": [{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2025-2026", status: "active", studentCount: 2 }],
  "883589": [{ classId: "c2", name: "الثاني عشر", grade: "12", schoolYear: "2025-2026", status: "active", studentCount: 1 }, { classId: "c9", name: "التاسع", grade: "9", schoolYear: "2025-2026", status: "active", studentCount: 1 }]
};
const STAGES = [{ stageId: "B01", track: "book", groupId: "g1", title: "مقدمة", order: 1, weight: 1, required: true, active: true }, { stageId: "B02", track: "book", groupId: "g1", title: "الفصل", order: 2, weight: 1, required: true, active: true }];
const GROUPS = [{ groupId: "g1", track: "book", title: "الوحدة الأولى", order: 1 }];
const NAMES: Record<string, string> = { s1: "زيد صالح", s2: "خالد عمر", s3: "نور علي", s4: "ليان سعيد" };
/** Which students the SERVER currently reports as fully graded (mutable: a score save can complete a student). */
let fullyGraded = new Set<string>();
const card = (id: string) => ({ studentId: id, displayName: NAMES[id], code: "P" + id, overallProgress: 20, trackProgress: { book: 20 }, counts: { not_started: 1, in_progress: 0, ready_for_review: 0, approved: 0 }, readyForReviewCount: 0, complete: false, updatedAt: "2026-03-01T10:00:00.000Z", stale: false });
const evaluation = (sid: string) => {
  const done = fullyGraded.has(sid);
  const st = (id: string, graded: boolean) => ({ stageId: id, track: "book", groupId: "g1", title: id, order: 1, required: true, status: "in_progress", score: graded ? 70 : null, graded, scoredAt: graded ? "2026-03-01T10:00:00.000Z" : "", scoredBy: graded ? "t" : "" });
  return { totalStages: 2, gradedStages: done ? 2 : 1, ungradedStages: done ? 0 : 1, evaluationProgress: done ? 100 : 50, projectScore: 70, projectScorePrecise: 70, stages: [st("B01", done), st("B02", true)], orphanStageIds: [], updatedAt: "2026-03-01T10:00:00.000Z" };
};
const progressOf = (sid: string) => ({ B02: { status: "in_progress", score: 70 }, ...(fullyGraded.has(sid) ? { B01: { status: "in_progress", score: 70 } } : {}) });
const detail = (code: string, cid: string, sid: string) => ({ ok: true, readOnly: false, projectCode: code, student: { studentId: sid, displayName: NAMES[sid], code: "P" + sid }, tracks: TRACKS, summary: card(sid), stages: STAGES, groups: GROUPS, trackWeights: { book: 1 }, config: { staleDays: 7, lateThreshold: 40, balanceWarningThreshold: 30 }, progress: progressOf(sid), history: [], nextStages: { book: STAGES[0] }, balance: null, evaluation: evaluation(sid), classId: cid });
const row = (studentId: string, classId: string, projectCode: string, projectTitle: string) => ({ studentId, displayName: NAMES[studentId], classId, className: "صف", projectCode, projectTitle, gradedStages: 1, totalStages: 2, ungradedStages: 1, evaluationProgress: 50 });
// Server order (the queue): s1 (899373/c1) → s2 (899373/c1, ALREADY fully graded on the server) → s3 (883589/c2) → s4 (883589/c9).
const TODAY = {
  ok: true, generatedAt: "2026-03-10T10:00:00.000Z", scope: { activeClasses: 3, students: 4, publishedAssignments: 0 },
  attention: { activeAttempts: { count: 0, items: [] }, notStarted: { count: 0, assignments: 0, items: [] }, pendingReview: { count: 0, assignments: 0, items: [] }, unreadMessages: { total: 0, capped: false } },
  recent: [], partial: [],
  projectEvaluation: { studentsWithUngradedStages: 4, totalUngradedStages: 4, projects: [], attentionTotal: 4, capped: false,
    attention: [row("s1", "c1", "899373", "مشروع 899373"), row("s2", "c1", "899373", "مشروع 899373"), row("s3", "c2", "883589", "مشروع 883589"), row("s4", "c9", "883589", "مشروع 883589")] }
};
const GENERIC = { ok: true, classes: [], students: [], assignments: [], exams: [], posts: [], events: [], items: [], materials: [], courses: [], modules: [], challenges: [], sessions: [], projects: PROJECTS, schoolYears: [], years: [], totalUnread: 0, capped: false, byStudent: {} };

type Call = { method: string; url: string; body?: Record<string, unknown> };
let calls: Call[] = [];
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
function installFetch() {
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, ""), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ method, url, body });
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/teacher-today")) return res(200, TODAY);
    if (url.includes("/api/project-tracker")) {
      const u = new URL(url, "http://x"), resource = u.searchParams.get("resource"), code = u.searchParams.get("projectCode") || "";
      if (method === "POST") {
        if (body?.action === "score.set") {
          const sid = String(body.studentId); fullyGraded.add(sid);
          return res(200, { ok: true, action: "score.set", summary: card(sid), stage: { stageId: String(body.stageId), status: "in_progress", score: Number(body.score), updatedAt: "2026-03-05T10:00:00.000Z" }, evaluation: evaluation(sid), performance: null, history: [] });
        }
        return res(400, { ok: false, error: "x" });
      }
      if (resource === "projects-summary") return res(200, { ok: true, totalReadyForReview: 0, byProject: {} });
      if (resource === "projects") return res(200, { ok: true, projects: PROJECTS });
      if (resource === "classes") return res(200, { ok: true, projectCode: code, title: "مشروع " + code, tracks: TRACKS, classes: CLASSES[code] || [] });
      if (resource === "summary") return res(200, { ok: true, summary: { studentCount: 2, avgOverall: 20, trackAverages: { book: 20 }, completedCount: 0, studentsReadyForReview: 0, totalReadyStages: 0, staleCount: 0, trackWeights: { book: 1 }, staleDays: 7 } });
      if (resource === "students") { const cid = u.searchParams.get("classId"); const ids = cid === "c1" ? ["s1", "s2"] : cid === "c2" ? ["s3"] : ["s4"]; return res(200, { ok: true, students: ids.map(card), tracks: TRACKS, config: { lateThreshold: 40 } }); }
      if (resource === "student") return res(200, detail(code, String(u.searchParams.get("classId")), String(u.searchParams.get("studentId"))));
      return res(200, { ok: true });
    }
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    return res(200, GENERIC);
  }) as unknown as typeof fetch;
}
const HOME: Record<string, string> = { s1: "899373/c1", s2: "899373/c1", s3: "883589/c2", s4: "883589/c9" };
const allStudentReads = () => calls.filter(c => c.method === "GET" && c.url.includes("resource=student&")).map(c => { const u = new URL(c.url, "http://x"); return [u.searchParams.get("projectCode"), u.searchParams.get("classId"), u.searchParams.get("studentId")].join("/"); });
// The profiles actually opened. A cross-project move while a profile is open still issues the pre-existing transient
// read for the OLD student under the NEW project (documented in 9D; discarded by the detail's own guard) — it never
// names a valid (project, class, student) of this school, so it is excluded here.
const studentReads = () => allStudentReads().filter(k => { const sid = k.split("/")[2]; return k === HOME[sid] + "/" + sid; });
const classReads = () => calls.filter(c => c.method === "GET" && c.url.includes("resource=classes")).map(c => new URL(c.url, "http://x").searchParams.get("projectCode"));
const idx = (pred: (c: Call) => boolean) => calls.findIndex(pred);
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 120)); });
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });
const navButton = (label: string) => within(sidebar()).getByRole("button", { name: new RegExp("^" + label) });
const banner = () => document.querySelector(".eb-eval-focus") as HTMLElement | null;
const profileOf = (sid: string) => screen.findByRole("heading", { level: 2, name: "ملف المشروع: " + NAMES[sid] });
const scoreInput = (stageId: string) => within(document.querySelector('[data-stage-id="' + stageId + '"]') as HTMLElement).getByRole("spinbutton") as HTMLInputElement;
const nextBtn = () => within(banner()!).getByRole("button", { name: /^(الطالب التالي في قائمة التقييم|الطالب التالي:)/ });
const prevBtn = () => within(banner()!).getByRole("button", { name: /^الطالب السابق في قائمة التقييم/ });
async function login() {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
  await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
  await settle();
  fireEvent.click(navButton("لوحة المتابعة")); await settle();
}
async function startAt(sid: string) {
  const c = within(await screen.findByRole("article", { name: /تقييم المشاريع/ }));
  fireEvent.click(c.getByRole("button", { name: new RegExp("لتقييم " + NAMES[sid]) }));
  return await profileOf(sid);
}

beforeEach(() => {
  fullyGraded = new Set(["s2"]);
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = vi.fn();
  installFetch();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("9F App — the evaluation queue session", () => {
  it("Q1 clicking the FIRST row starts at that student (position 1 of 4), the 9E focus lands on its ungraded stage, only «الطالب التالي» is offered; the next student is the server's next row", async () => {
    render(<App />); await login();
    await startAt("s1");
    await waitFor(() => expect(document.activeElement).toBe(scoreInput("B01")));
    expect(banner()!.textContent).toContain("وضع التقييم — الطالب 1 من 4 — بقيت مرحلة واحدة بدون علامة.");
    expect(within(banner()!).queryByRole("button", { name: /السابق/ })).toBeNull();
    expect(nextBtn().getAttribute("aria-label")).toBe("الطالب التالي في قائمة التقييم: خالد عمر");
    expect(studentReads()).toEqual(["899373/c1/s1"]);
  });
  it("Q2/Q3/Q4 next → the exact next student (server order); a student the SERVER reports fully graded shows the CTA (no auto-move) and is skipped by later moves; previous → exact previous", async () => {
    render(<App />); await login();
    await startAt("s1");
    await waitFor(() => expect(document.activeElement).toBe(scoreInput("B01")));
    fireEvent.click(nextBtn());
    await profileOf("s2");
    await waitFor(() => expect(banner()!.textContent).toContain("اكتمل تقييم هذا الطالب — انتقل إلى الطالب التالي."));
    expect(nextBtn().textContent).toBe("انتقل إلى الطالب التالي: نور علي");
    expect(banner()!.getAttribute("data-queue-position")).toBe("2");
    expect(studentReads()).toEqual(["899373/c1/s1", "899373/c1/s2"]);                                  // nothing moved on its own
    await settle();
    expect(studentReads().length).toBe(2);
    fireEvent.click(nextBtn());                                                                          // → s3 (another project)
    await profileOf("s3");
    await waitFor(() => expect(document.activeElement).toBe(scoreInput("B01")));
    fireEvent.click(prevBtn());                                                                          // previous skips the completed s2 → s1
    await profileOf("s1");
    expect(banner()!.getAttribute("data-queue-position")).toBe("1");
    expect(studentReads()).toEqual(["899373/c1/s1", "899373/c1/s2", "883589/c2/s3", "899373/c1/s1"]);
    expect(nextBtn().getAttribute("aria-label")).toBe("الطالب التالي في قائمة التقييم: نور علي");     // s2 is skipped forward too
  });
  it("Q5/Q6/Q7 cross-project next reads the new project's classes BEFORE its student; cross-class next inside that project validates against the already loaded list (no extra classes read); every move re-runs the focus", async () => {
    render(<App />); await login();
    await startAt("s3");                                                                                 // start in the middle (position 3)
    await waitFor(() => expect(document.activeElement).toBe(scoreInput("B01")));
    expect(banner()!.textContent).toContain("الطالب 3 من 4");
    expect(classReads()).toEqual(["883589"]);
    fireEvent.click(nextBtn());                                                                          // → s4, class c9 of the same project
    await profileOf("s4");
    await waitFor(() => expect(document.activeElement).toBe(scoreInput("B01")));
    expect(classReads()).toEqual(["883589"]);                                                            // validated against the loaded list
    expect(studentReads()).toEqual(["883589/c2/s3", "883589/c9/s4"]);
    expect((within(screen.getByRole("region", { name: "مساحة عمل المشروع" })).getByRole("combobox") as HTMLSelectElement).value).toBe("c9");
    expect(within(banner()!).queryByRole("button", { name: /التالي في قائمة التقييم|الطالب التالي:/ })).toBeNull();   // last item → no next
    fireEvent.click(prevBtn());                                                                          // → s3
    await profileOf("s3");
    fireEvent.click(prevBtn());                                                                          // → s2 (other project, fully graded)
    await profileOf("s2");
    const i = calls.length;
    expect(classReads()).toEqual(["883589", "899373"]);
    expect(idx(c => c.url.includes("resource=classes") && c.url.includes("899373"))).toBeLessThan(idx(c => c.url.includes("resource=student&") && c.url.includes("studentId=s2")));
    await waitFor(() => expect(banner()!.textContent).toContain("اكتمل تقييم هذا الطالب"));
    expect(calls.length - i).toBeLessThanOrEqual(3);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(3);                                  // s3, s4, s3 — a new focus per move; the graded s2 never focuses an input
  });
  it("Q8/Q9 saving the last ungraded score completes the current student: the CTA appears, nothing navigates; the final student completed → final text and no next CTA", async () => {
    render(<App />); await login();
    await startAt("s4");
    await waitFor(() => expect(document.activeElement).toBe(scoreInput("B01")));
    fireEvent.change(scoreInput("B01"), { target: { value: "90" } });
    fireEvent.click(within(document.querySelector('[data-stage-id="B01"]') as HTMLElement).getByRole("button", { name: "حفظ علامة المرحلة B01" }));
    await screen.findByText("تم حفظ العلامة.");
    await waitFor(() => expect(banner()!.textContent).toContain("اكتمل تقييم هذا الطالب — لا يوجد طالب آخر في قائمة التقييم."));
    expect(within(banner()!).queryByRole("button", { name: /التالي في قائمة التقييم|الطالب التالي:/ })).toBeNull();
    expect(prevBtn()).toBeTruthy();
    await settle();
    expect(studentReads()).toEqual(["883589/c9/s4"]);                                                   // no automatic navigation
    expect(screen.getByRole("heading", { level: 2, name: "ملف المشروع: " + NAMES.s4 })).toBeTruthy();
  });
  it("Q10 a manual student open ends the session (no queue, no banner); Q11 ordinary Projects navigation ends it too (opening the project by hand reads no student)", async () => {
    render(<App />); await login();
    await startAt("s1");
    await waitFor(() => expect(banner()).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى تقدّم الطلاب" }));
    await screen.findByRole("heading", { level: 2, name: "تقدّم الطلاب" });
    fireEvent.click(within(screen.getByText(NAMES.s2).closest(".eb-student-card") as HTMLElement).getByRole("button", { name: "فتح ملف الطالب" }));
    await profileOf("s2");
    await settle();
    expect(banner()).toBeNull();
    expect(document.querySelector(".eb-eval-queue-nav")).toBeNull();
    // the session is gone for good: a fresh drill from the hub starts a NEW session at the clicked row
    fireEvent.click(navButton("لوحة المتابعة")); await settle();
    await startAt("s3");
    await waitFor(() => expect(banner()!.textContent).toContain("الطالب 3 من 4"));
    // ordinary Projects navigation: hub → open the project by hand → dashboard view, no student read, no banner
    fireEvent.click(navButton("المشاريع"));
    const open = await screen.findAllByRole("button", { name: "فتح المشروع" });
    const before = studentReads().length;
    fireEvent.click(open[0]);
    await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
    await settle();
    expect(studentReads().length).toBe(before);
    expect(banner()).toBeNull();
  });
});
