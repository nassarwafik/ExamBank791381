// @vitest-environment happy-dom
//
// Phase 9G — the end of the evaluation queue on the REAL App (harness shared with the 9F suite): a «تقييم المشاريع» row starts a session at the clicked row over the
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
/** Hold the NEXT `student` read of this studentId until release() — a deferred promise, never a timer. */
const hold: { studentId: string; release: () => void; pending: boolean } = { studentId: "", release: () => {}, pending: false };
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
      if (resource === "student") {
        const sid = String(u.searchParams.get("studentId"));
        if (hold.studentId === sid) { hold.studentId = ""; hold.pending = true; await new Promise<void>(r => { hold.release = () => { hold.pending = false; r(); }; }); }
        return res(200, detail(code, String(u.searchParams.get("classId")), sid));
      }
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
  fullyGraded = new Set(["s2"]); hold.studentId = ""; hold.pending = false;
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = vi.fn();
  installFetch();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("9G App — final-session panel and «العودة إلى لوحة اليوم»", () => {
  const finish = () => document.querySelector(".eb-eval-finish") as HTMLElement | null;
  const todayHub = () => screen.findByRole("region", { name: "ما الذي يحتاج انتباهي الآن؟" });
  const todayReads = () => calls.filter(c => c.method === "GET" && c.url.includes("/api/teacher-today")).length;
  it("G3/G5 the last student (s4) becomes complete after its last save → the panel with the session's counts (2 من 4: s2 seen complete + s4), no navigation", async () => {
    render(<App />); await login();
    await startAt("s2");                                                                                 // s2 is complete on the server → recorded
    await waitFor(() => expect(banner()!.textContent).toContain("انتقل إلى الطالب التالي"));
    fireEvent.click(nextBtn()); await profileOf("s3");
    await waitFor(() => expect(document.activeElement).toBe(scoreInput("B01")));
    fireEvent.click(nextBtn()); await profileOf("s4");
    await waitFor(() => expect(document.activeElement).toBe(scoreInput("B01")));
    expect(finish()).toBeNull();                                                                         // last item but still ungraded → no finish
    fireEvent.change(scoreInput("B01"), { target: { value: "90" } });
    fireEvent.click(within(document.querySelector('[data-stage-id="B01"]') as HTMLElement).getByRole("button", { name: "حفظ علامة المرحلة B01" }));
    await screen.findByText("تم حفظ العلامة.");
    await waitFor(() => expect(finish()).toBeTruthy());
    expect(finish()!.textContent).toContain("تم تقييم 2 من 4 طلاب في هذه الجلسة.");                    // s2 + s4 (s1, s3 never recorded complete)
    expect(finish()!.textContent).toContain("بقي طالبان في القائمة لم يُسجَّل اكتمال تقييمهم خلال هذه الجلسة.");
    await settle();
    expect(screen.getByRole("heading", { level: 2, name: "ملف المشروع: " + NAMES.s4 })).toBeTruthy();  // still here: nothing navigated
    expect(studentReads()).toEqual(["899373/c1/s2", "883589/c2/s3", "883589/c9/s4"]);
  });
  it("G6 previous from the final state → the previous (ungraded) student opens, the panel disappears, the session stays; when that student becomes complete with no next left → the panel returns with the updated count", async () => {
    fullyGraded.add("s4");
    render(<App />); await login();
    await startAt("s3");
    await waitFor(() => expect(document.activeElement).toBe(scoreInput("B01")));
    fireEvent.click(nextBtn()); await profileOf("s4");
    await waitFor(() => expect(finish()).toBeTruthy());
    expect(finish()!.textContent).toContain("تم تقييم 1 من 4 طلاب في هذه الجلسة.");                    // s4 only
    fireEvent.click(prevBtn()); await profileOf("s3");
    await waitFor(() => expect(banner()).toBeTruthy());
    expect(finish()).toBeNull();                                                                         // s3 ungraded → no summary
    expect(banner()!.textContent).toContain("الطالب 3 من 4");                                          // session still active
    // 9F semantics unchanged: s4 was recorded complete, so it is skipped → no «next» from s3; the session did not end.
    expect(within(banner()!).queryByRole("button", { name: /^(الطالب التالي في قائمة التقييم|الطالب التالي:)/ })).toBeNull();
    expect(prevBtn()).toBeTruthy();
    expect(document.querySelector('[data-stage-id="B01"]')).toBeTruthy();                             // still a normal, editable profile
    fireEvent.change(scoreInput("B01"), { target: { value: "85" } });
    fireEvent.click(within(document.querySelector('[data-stage-id="B01"]') as HTMLElement).getByRole("button", { name: "حفظ علامة المرحلة B01" }));
    await screen.findByText("تم حفظ العلامة.");
    await waitFor(() => expect(finish()).toBeTruthy());                                                  // s3 now the last incomplete → complete → panel returns
    expect(finish()!.textContent).toContain("تم تقييم 2 من 4 طلاب في هذه الجلسة.");                    // s4 + s3
    expect(finish()!.textContent).toContain("بقي طالبان في القائمة");
    await settle();
    expect(screen.getByRole("heading", { level: 2, name: "ملف المشروع: " + NAMES.s3 })).toBeTruthy();  // nothing navigated
  });
  it("G7 «العودة إلى لوحة اليوم» ends the session and shows the Today Hub through the existing dashboard navigation (its normal mount read, no extra fetch); a manual project/student open afterwards shows no queue UI", async () => {
    fullyGraded.add("s4");
    render(<App />); await login();
    const readsBefore = todayReads();
    await startAt("s4");
    await waitFor(() => expect(finish()).toBeTruthy());
    fireEvent.click(within(finish()!).getByRole("button", { name: "إنهاء جلسة التقييم والعودة إلى لوحة اليوم" }));
    await todayHub();
    await waitFor(() => expect(todayReads()).toBe(readsBefore + 1));                                    // exactly the hub's own mount read
    await settle();
    expect(todayReads()).toBe(readsBefore + 1);
    expect(screen.queryByRole("heading", { level: 2, name: /ملف المشروع/ })).toBeNull();
    // manual path: Projects → open project → students → open s3 by hand → normal profile, no queue UI, no banner
    fireEvent.click(navButton("المشاريع"));
    const open = await screen.findAllByRole("button", { name: "فتح المشروع" });
    fireEvent.click(open[1]);                                                                            // 883589
    await screen.findByRole("region", { name: "مساحة عمل المشروع" });
    fireEvent.click(await screen.findByRole("button", { name: "تقدّم الطلاب" }));
    await screen.findByText(NAMES.s3);
    fireEvent.click(within(screen.getByText(NAMES.s3).closest(".eb-student-card") as HTMLElement).getByRole("button", { name: "فتح ملف الطالب" }));
    await profileOf("s3"); await settle();
    expect(banner()).toBeNull(); expect(finish()).toBeNull(); expect(document.querySelector(".eb-eval-queue-nav")).toBeNull();
  });
});
