// @vitest-environment happy-dom
// UX-7b-2 — Question Paging & Navigator: ONE logical question mounted at a time for every theme, Previous/Next bottom bar,
// the shared-Dialog question navigator, the local review screen and the unchanged submit path (existing submit() →
// existing ConfirmDialog). Pure pager helper, focus contract, answered-vs-saved distinction, firstN semantics through the
// shared calculateSectionProgress, zero-request navigation and the source guards that pin every authority.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";
import { buildQuestionPages, clampPageIndex, pageStatus, groupPagesBySection, countAnsweredPages } from "./student/exam/questionPager";
import { normalizeExamStructure, sectionQuestionId } from "./examStructure";
import { qid } from "./StudentQuestionCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
const ARABIC_INDIC = /[٠-٩]/;

const Q1 = { examQuestionId: "q1", presentationType: "multipleChoice", text: "ما هي عاصمة فلسطين؟", marks: 2, options: [{ text: "القدس" }, { text: "رام الله" }] };
const Q2 = { examQuestionId: "q2", presentationType: "open", text: "اشرح مفهوم الشبكة المحلية.", marks: 3 };
const Q3 = { examQuestionId: "q3", presentationType: "open", text: "ما هو عنوان IP؟", marks: 3 };
const flatExam = { title: "امتحان", metadata: {}, presentationTheme: "default", questions: [Q1, Q2, Q3] };
// Structured: section A (all) with two questions, section B (firstN 2 of 3, with instructions) — ids intentionally implicit
// in section B so the answer keys are the "sectionId::qN" form produced by sectionQuestionId.
const sectionExam = { title: "امتحان مقسّم", metadata: {}, presentationTheme: "cards", sections: [
  { id: "sa", title: "القسم أ", gradingPolicy: "all", maxMarks: 5, questions: [Q1, Q2] },
  { id: "sb", title: "القسم ب", instructions: "أجب عن سؤالين فقط من هذا القسم.", gradingPolicy: "firstNAnswered", requiredAnswers: 2, answerUnit: "question", questions: [
    { presentationType: "open", text: "س ب1", marks: 1 }, { presentationType: "open", text: "س ب2", marks: 1 }, { presentationType: "open", text: "س ب3", marks: 1 }
  ] }
] };
const legacyAssignment = { assignmentId: "asg1", title: "واجب الشبكات", instructions: "أجب بعناية.", openAt: "", dueAt: "2026-05-01T10:30:00.000Z", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 3, totalMarks: 8, exam: flatExam };
const structuredAssignment = { ...legacyAssignment, questionCount: 5, totalMarks: 8, exam: sectionExam };
const legacyState = { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: "2026-03-01T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, durationMinutes: 0 };
const submittedResult = { attemptNumber: 1, submittedAt: "2026-03-01T10:05:00.000Z", score: 5, totalMarks: 8, percentage: 62.5, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" };

let calls: { url: string; method: string; body: any }[] = [];
let stateBody: unknown = legacyState;
let saveGate: (() => void) | null = null;   // when set, saveDraft responses wait until released (in-flight save)
function installFetch() {
  calls = [];
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") return json(200, { ok: true, state: stateBody });
      if (body.action === "saveDraft") {
        if (saveGate) return new Promise<Response>(resolve => { const release = saveGate!; saveGate = () => { release(); resolve({ ok: true, status: 200, json: async () => ({ ok: true, savedAt: "2026-03-01T10:01:02.000Z" }) } as Response); }; });
        return json(200, { ok: true, savedAt: "2026-03-01T10:01:02.000Z" });
      }
      if (body.action === "submit") return json(200, { ok: true, result: submittedResult, state: { ...legacyState, attemptsUsed: 1, canAttempt: false, canWrite: false, latestResult: submittedResult, attempts: [submittedResult] } });
      return json(200, { ok: true, state: stateBody });
    }
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
const posts = () => calls.filter(c => c.method === "POST");
function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((q: string) => ({ matches, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
let scrollCalls: unknown[] = [];
beforeEach(() => {
  scrollCalls = []; saveGate = null;
  (window as unknown as { scrollTo: (o: unknown) => void }).scrollTo = (o: unknown) => { scrollCalls.push(o); };
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  stubMatchMedia(false);
  stateBody = legacyState;
  installFetch();
});
function mount(assignment: unknown = legacyAssignment, onBack = vi.fn()) {
  const r = render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={onBack} onLogout={vi.fn()} />);
  return { ...r, onBack };
}
const heading = () => document.querySelector("h2.iex-page-heading") as HTMLElement | null;
const next = () => fireEvent.click(screen.getByRole("button", { name: "التالي" }));
const previous = () => fireEvent.click(screen.getByRole("button", { name: "السابق" }));
const openReview = () => fireEvent.click(screen.getByRole("button", { name: "مراجعة الإجابات" }));
const openNavigator = () => fireEvent.click(screen.getByRole("button", { name: /قائمة الأسئلة/ }));
const mountedQuestions = () => document.querySelectorAll("article.iex-q").length;
const position = () => document.querySelector(".iex-position-main")?.textContent || "";

describe("UX-7b-2 — pure pager helper", () => {
  it("flat exams keep the exact question order and the exact qid answer keys; structured exams keep section order and sectionQuestionId keys", () => {
    const flat = buildQuestionPages(normalizeExamStructure(flatExam), flatExam.questions);
    expect(flat.map(p => p.id)).toEqual(flatExam.questions.map((q, i) => qid(q, i)));
    expect(flat.map(p => p.index)).toEqual([0, 1, 2]);
    expect(flat.every(p => p.section === null && p.sectionIndex === 0)).toBe(true);
    expect(flat[0].firstInSection && !flat[0].lastInSection && flat[2].lastInSection).toBe(true);
    const norm = normalizeExamStructure(sectionExam as never);
    const pages = buildQuestionPages(norm, []);
    expect(pages.length).toBe(5);
    expect(pages.map(p => p.id)).toEqual(["q1", "q2", "sb::q1", "sb::q2", "sb::q3"]);
    expect(pages.map(p => p.id)).toEqual(norm.sections.flatMap(s => s.questions.map((q, i) => sectionQuestionId(s, q, i))));
    expect(pages.map(p => p.sectionIndex)).toEqual([0, 0, 1, 1, 1]);
    expect(pages.map(p => p.positionInSection)).toEqual([0, 1, 0, 1, 2]);
    expect(pages[2].firstInSection && pages[4].lastInSection && !pages[3].firstInSection).toBe(true);
    expect(pages[2].question).toBe(norm.sections[1].questions[0]);                                     // same object, no clone
    const groups = groupPagesBySection(pages);
    expect(groups.map(g => g.pages.length)).toEqual([2, 3]);
    expect(groups[1].section?.title).toBe("القسم ب");
  });
  it("clampPageIndex never leaves the list (empty exam → 0); pageStatus uses the current index then the existing answered()", () => {
    expect(clampPageIndex(-3, 5)).toBe(0); expect(clampPageIndex(9, 5)).toBe(4); expect(clampPageIndex(2, 5)).toBe(2);
    expect(clampPageIndex(2, 0)).toBe(0); expect(clampPageIndex(Number.NaN, 5)).toBe(0); expect(clampPageIndex(1.7, 5)).toBe(1);
    const pages = buildQuestionPages(normalizeExamStructure(flatExam), flatExam.questions);
    const answers = { q1: { kind: "choice", index: 0 }, q2: { kind: "text", value: "   " } } as const;
    expect(pageStatus(pages[0], answers as never, 0)).toBe("current");
    expect(pageStatus(pages[0], answers as never, 1)).toBe("answered");
    expect(pageStatus(pages[1], answers as never, 0)).toBe("unanswered");                            // whitespace text is not answered — same predicate
    expect(pageStatus(pages[2], answers as never, null)).toBe("unanswered");
    expect(countAnsweredPages(pages, answers as never)).toBe(1);
  });
});

describe("UX-7b-2 — one question at a time, position, Previous/Next bounds", () => {
  it("mounts exactly ONE question (flat), shows 'السؤال 1 / 3' with Western digits, Previous disabled on the first, Next is navigation only (no submit, no request)", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(mountedQuestions()).toBe(1);
    expect(screen.queryByText("اشرح مفهوم الشبكة المحلية.")).toBeNull();
    expect(position()).toBe("السؤال 1 / 3");
    expect(document.body.textContent || "").not.toMatch(ARABIC_INDIC);
    expect(heading()?.textContent).toBe("السؤال 1 من 3");
    expect(heading()?.getAttribute("tabindex")).toBe("-1");
    const nav = screen.getByRole("navigation", { name: "التنقل بين الأسئلة" });
    expect((within(nav).getByRole("button", { name: "السابق" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(nav).queryByRole("button", { name: /تسليم/ })).toBeNull();                          // never a submit next to Previous/Next
    expect(screen.queryByRole("button", { name: "تسليم الامتحان" })).toBeNull();
    const before = calls.length;
    next();
    expect(screen.getByText("اشرح مفهوم الشبكة المحلية.")).toBeTruthy();
    expect(mountedQuestions()).toBe(1);
    expect(position()).toBe("السؤال 2 / 3");
    expect(calls.length).toBe(before);                                                                 // Next = 0 requests
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/تم تسليم المحاولة/)).toBeNull();
    previous();
    expect(screen.getByText("ما هي عاصمة فلسطين؟")).toBeTruthy();
    expect(calls.length).toBe(before);                                                                 // Previous = 0 requests
    next(); next();
    expect(position()).toBe("السؤال 3 / 3");
    expect(screen.queryByRole("button", { name: "التالي" })).toBeNull();                              // last question: Next becomes Review
    expect(screen.getByRole("button", { name: "مراجعة الإجابات" })).toBeTruthy();
    expect(posts()).toEqual([]);
  });

  it("the same pager is used for every theme (focus theme has no separate navigation tree); the theme class stays visual", async () => {
    mount({ ...legacyAssignment, exam: { ...flatExam, presentationTheme: "focus" } });
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(document.querySelector("main.exam-theme-focus")).toBeTruthy();
    expect(document.querySelector(".iex-focus-nav")).toBeNull();
    expect(document.querySelector(".iex-focus-mode")).toBeNull();
    expect(screen.getByRole("navigation", { name: "التنقل بين الأسئلة" })).toBeTruthy();
    expect(mountedQuestions()).toBe(1);
    cleanup(); installFetch();
    mount({ ...legacyAssignment, exam: { ...flatExam, presentationTheme: "classic" } });
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(document.querySelector("main.exam-theme-classic")).toBeTruthy();
    expect(mountedQuestions()).toBe(1);
    expect(screen.getByRole("navigation", { name: "التنقل بين الأسئلة" })).toBeTruthy();
  });

  it("structured exams: section order, compact section context (title, position, rule, progress, instructions prominent on the first question), never the long-form section container", async () => {
    mount(structuredAssignment);
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(document.querySelector(".iex-section")).toBeNull();                                         // the all-questions container is gone
    expect(mountedQuestions()).toBe(1);
    expect(position()).toBe("السؤال 1 / 5");
    expect(document.querySelector(".iex-position-sub")?.textContent).toBe("القسم 1 · السؤال 1 / 2");
    const ctx = () => document.querySelector(".iex-section-context") as HTMLElement;
    expect(ctx().textContent).toContain("القسم أ");
    expect(ctx().textContent).toContain("العلامة: 5");
    expect(ctx().className).toContain("is-first");
    next();
    expect(ctx().className).not.toContain("is-first");
    expect(document.querySelector(".iex-position-sub")?.textContent).toBe("القسم 1 · السؤال 2 / 2");
    next();                                                                                            // into section B
    expect(screen.getByText("س ب1")).toBeTruthy();
    expect(document.querySelector(".iex-position-sub")?.textContent).toBe("القسم 2 · السؤال 1 / 3");
    expect(ctx().className).toContain("is-first");
    expect(within(ctx()).getByText("أجب عن سؤالين فقط من هذا القسم.")).toBeTruthy();
    expect(ctx().textContent).toContain("أجب عن 2 أسئلة فقط — سيتم تصحيح أول 2 مجاب عنها");            // same rule wording as the long form
    expect(ctx().textContent).toContain("أجبت عن 0 من 2 المطلوبة");
    fireEvent.change(screen.getByRole("textbox", { name: "س ب1" }), { target: { value: "أ" } });
    expect(ctx().textContent).toContain("أجبت عن 1 من 2 المطلوبة");                                     // live section progress via calculateSectionProgress
    next(); next();
    expect(screen.getByText("س ب3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "مراجعة الإجابات" })).toBeTruthy();
    // the answer key of an implicit-id question is the exact sectionQuestionId form
    fireEvent.change(screen.getByRole("textbox", { name: "س ب3" }), { target: { value: "ج" } });
    await waitFor(() => expect(posts().some(p => p.body.action === "saveDraft")).toBe(true), { timeout: 3000 });
    const last = posts().filter(p => p.body.action === "saveDraft").pop()!;
    expect(last.body.answers["sb::q1"]).toEqual({ kind: "text", value: "أ" });
    expect(last.body.answers["sb::q3"]).toEqual({ kind: "text", value: "ج" });
    expect(Object.keys(last.body).sort()).toEqual(["action", "answers"]);
  });

  it("firstN extra-answer hint still appears on an excess answered question (shared selectGradedUnits), and extra questions stay answerable", async () => {
    mount(structuredAssignment);
    await screen.findByText("ما هي عاصمة فلسطين؟");
    next(); next();
    fireEvent.change(screen.getByRole("textbox", { name: "س ب1" }), { target: { value: "1" } }); next();
    fireEvent.change(screen.getByRole("textbox", { name: "س ب2" }), { target: { value: "2" } }); next();
    expect(document.querySelector(".iex-extra-hint")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "س ب3" }), { target: { value: "3" } });
    expect(document.querySelector(".iex-extra-hint")?.textContent).toContain("إجابة إضافية — لن تدخل في التصحيح");
    expect((screen.getByRole("textbox", { name: "س ب3" }) as HTMLTextAreaElement).disabled).toBe(false);
    expect(document.querySelector(".iex-section-context")?.textContent).toContain("سيُصحَّح أول 2 فقط");
  });

  it("a keystroke re-renders only the mounted question card (one article before and after typing); no virtualisation, no hidden cards", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); next();
    const ta = screen.getByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." });
    fireEvent.change(ta, { target: { value: "أ" } });
    fireEvent.change(ta, { target: { value: "أب" } });
    expect(mountedQuestions()).toBe(1);
    expect(document.querySelectorAll(".iex-q[hidden], .iex-q[aria-hidden]").length).toBe(0);
    expect((ta as HTMLTextAreaElement).value).toBe("أب");
  });
});

describe("UX-7b-2 — question navigator (shared Dialog)", () => {
  it("opens with zero requests / no answer or save mutation, lists every question with textual state (الحالي / مُجاب / غير مُجاب), aria-current on the current one, groups structured sections with required/answered/extra", async () => {
    mount(structuredAssignment);
    await screen.findByText("ما هي عاصمة فلسطين؟");
    fireEvent.click(screen.getByRole("radio", { name: "القدس" }));
    await waitFor(() => expect(posts().filter(p => p.body.action === "saveDraft").length).toBe(1), { timeout: 3000 });
    const before = calls.length;
    const trigger = screen.getByRole("button", { name: /قائمة الأسئلة/ });
    expect(trigger.textContent).toContain("1 / 5 مجاب");                                               // compact progress on the trigger
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    trigger.focus(); fireEvent.click(trigger);                                                          // a real tap/click focuses the opener first
    const dialog = await screen.findByRole("dialog", { name: "قائمة الأسئلة" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");                                              // shared Dialog scroll lock
    expect(calls.length).toBe(before);                                                                 // navigator open = 0 requests
    const buttons = within(dialog).getAllByRole("button").filter(b => b.className.includes("iex-nav-q"));
    expect(buttons.map(b => b.getAttribute("aria-label"))).toEqual(["السؤال 1 — الحالي", "السؤال 2 — غير مُجاب", "السؤال 3 — غير مُجاب", "السؤال 4 — غير مُجاب", "السؤال 5 — غير مُجاب"]);
    expect(buttons[0].getAttribute("aria-current")).toBe("step");
    expect(buttons[1].getAttribute("aria-current")).toBeNull();
    expect(buttons[0].textContent).toContain("الحالي"); expect(buttons[1].textContent).toContain("غير مُجاب");   // visible text, not colour only
    expect(within(dialog).getByRole("group", { name: /القسم 1 — القسم أ/ })).toBeTruthy();
    expect(within(dialog).getByRole("group", { name: /القسم 2 — القسم ب/ }).textContent).toContain("المطلوب 2 · مُجاب 0");
    expect(within(dialog).getByText("1 / 5 مجاب · اختر سؤالًا للانتقال إليه")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);                                                      // plain close → focus returns to the opener
    expect(calls.length).toBe(before);
    expect(posts().filter(p => p.body.action === "saveDraft").length).toBe(1);                          // no save caused by the navigator
  });

  it("answered-but-UNSAVED is still مُجاب in the navigator while SaveStatus says pending; saved == answered is never assumed", async () => {
    saveGate = () => {};                                                                                // hold every saveDraft in flight
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); next();
    fireEvent.change(screen.getByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." }), { target: { value: "شبكة" } });
    expect(document.querySelector(".iex-progress .iex-save-state")?.textContent).toContain("تغييرات غير محفوظة");
    openNavigator();
    const dialog = await screen.findByRole("dialog", { name: "قائمة الأسئلة" });
    expect(within(dialog).getByRole("button", { name: "السؤال 2 — الحالي" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "السؤال 1 — غير مُجاب" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    openNavigator();
    const again = await screen.findByRole("dialog", { name: "قائمة الأسئلة" });
    expect(within(again).getByRole("button", { name: "السؤال 2 — مُجاب" })).toBeTruthy();              // answered locally …
    expect(document.querySelector(".iex-progress .iex-save-state")?.textContent).toMatch(/تغييرات غير محفوظة|جارٍ الحفظ/);   // … but not yet persisted
    expect(posts().filter(p => p.body.action === "submit").length).toBe(0);
  });

  it("direct jump: the dialog closes, the target question renders and its heading gets focus — NOT the navigator opener; zero requests", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    const trigger = screen.getByRole("button", { name: /قائمة الأسئلة/ });
    const before = calls.length;
    trigger.focus(); fireEvent.click(trigger);                                                          // opener genuinely focused → the Dialog captured it as its focus-return target
    const dialog = await screen.findByRole("dialog", { name: "قائمة الأسئلة" });
    expect(dialog.contains(document.activeElement)).toBe(true);                                        // trap moved focus inside
    fireEvent.click(within(dialog).getByRole("button", { name: "السؤال 3 — غير مُجاب" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("ما هو عنوان IP؟")).toBeTruthy();
    expect(position()).toBe("السؤال 3 / 3");
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    expect(document.activeElement).not.toBe(trigger);
    expect(heading()?.textContent).toBe("السؤال 3 من 3");
    expect(calls.length).toBe(before);                                                                 // navigator jump = 0 requests
  });
});

describe("UX-7b-2 — focus contract", () => {
  it("Next and Previous focus the NEW question heading (never the page top); autosave and timer ticks never move focus", async () => {
    const serverNow = new Date().toISOString();
    const endsAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    stateBody = { ...legacyState, timed: true, requiresStart: true, durationMinutes: 30, attemptModelVersion: 2, serverNow, canWrite: true, canStartAttempt: false,
      activeAttempt: { attemptNumber: 1, startedAt: serverNow, endsAt, status: "started", lastSavedAt: "" }, effectiveAttemptEndsAt: endsAt };
    mount({ ...legacyAssignment, durationMinutes: 30, requiresStart: true, timed: true });
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(document.activeElement).not.toBe(heading());                                                // initial load: no forced focus
    next();
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    expect(heading()?.textContent).toBe("السؤال 2 من 3");
    const ta = screen.getByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." });
    ta.focus();
    fireEvent.change(ta, { target: { value: "إجابة" } });
    await waitFor(() => expect(posts().some(p => p.body.action === "saveDraft")).toBe(true), { timeout: 3000 });
    await waitFor(() => expect(document.querySelector(".iex-save-state")?.textContent).toContain("تم الحفظ"), { timeout: 3000 });
    expect(document.activeElement).toBe(ta);                                                           // autosave never stole focus
    await act(async () => { await new Promise(r => setTimeout(r, 1100)); });                           // at least one countdown tick
    expect(document.activeElement).toBe(ta);                                                           // timer tick never stole focus
    previous();
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    expect(heading()?.textContent).toBe("السؤال 1 من 3");
    expect(scrollCalls.every(c => (c as { top?: number }).top === undefined || (c as { behavior: string }).behavior === "smooth")).toBe(true);
  });

  it("scrolling to the new heading honours reduced motion (auto), smooth otherwise", async () => {
    stubMatchMedia(true);
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    const spy = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: typeof spy }).scrollIntoView = spy;
    next();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect((spy.mock.calls[0][0] as { behavior: string }).behavior).toBe("auto");
    cleanup(); installFetch(); stubMatchMedia(false);
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    spy.mockClear();
    next();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect((spy.mock.calls[0][0] as { behavior: string }).behavior).toBe("smooth");
  });
});

describe("UX-7b-2 — review screen and the unchanged submit path", () => {
  it("Next on the last question opens the LOCAL review (zero requests): real heading focused, exam title, answered/unanswered counts, firstN shortfall via the shared rule, question list with status, jump back focuses the question heading", async () => {
    mount(structuredAssignment);
    await screen.findByText("ما هي عاصمة فلسطين؟");
    fireEvent.click(screen.getByRole("radio", { name: "القدس" }));
    next(); next();
    fireEvent.change(screen.getByRole("textbox", { name: "س ب1" }), { target: { value: "1" } });
    next(); next();
    await waitFor(() => expect(document.querySelector(".iex-save-state")?.textContent).toContain("تم الحفظ"), { timeout: 3000 });
    const before = calls.length;
    openReview();
    const review = await screen.findByRole("region", { name: "مراجعة الإجابات" });
    expect(calls.length).toBe(before);                                                                 // review open = 0 requests
    const h = within(review).getByRole("heading", { level: 2, name: "مراجعة الإجابات" });
    await waitFor(() => expect(document.activeElement).toBe(h));
    expect(h.getAttribute("tabindex")).toBe("-1");
    expect(within(review).getByText("واجب الشبكات")).toBeTruthy();                                     // assignment title, as the top bar shows
    const stat = (label: string) => Array.from(review.querySelectorAll(".iex-review-stats dt")).find(d => d.textContent === label)?.nextElementSibling?.textContent;
    expect(stat("الأسئلة")).toBe("5"); expect(stat("مُجاب")).toBe("2"); expect(stat("غير مُجاب")).toBe("3");
    expect(within(review).getByRole("note").textContent).toContain("توجد 3 أسئلة بلا إجابة");
    expect(within(review).getByText("أجبت عن 1 من 2 بنود مطلوبة في «القسم ب».")).toBeTruthy();         // same wording as the submit confirmation
    const buttons = within(review).getAllByRole("button").filter(b => b.className.includes("iex-nav-q"));
    expect(buttons.map(b => b.getAttribute("aria-label"))).toEqual(["السؤال 1 — مُجاب", "السؤال 2 — غير مُجاب", "السؤال 3 — مُجاب", "السؤال 4 — غير مُجاب", "السؤال 5 — غير مُجاب"]);
    expect(buttons.some(b => b.getAttribute("aria-current"))).toBe(false);                            // no "current" while reviewing
    expect(screen.queryByRole("navigation", { name: "التنقل بين الأسئلة" })).toBeNull();               // bottom bar hidden in review
    expect(mountedQuestions()).toBe(0);
    expect(within(review).getByRole("button", { name: "تسليم الامتحان" }).className).toContain("iex-submit");
    expect(within(review).getByRole("button", { name: "العودة للحل" })).toBeTruthy();
    expect(position()).toBe("مراجعة الإجابات");
    fireEvent.click(within(review).getByRole("button", { name: "السؤال 4 — غير مُجاب" }));
    expect(screen.getByText("س ب2")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    expect(heading()?.textContent).toBe("السؤال 4 من 5");
    expect(calls.length).toBe(before);                                                                 // review → back to a question = 0 requests
  });

  it("'العودة للحل' returns to the current question (focus on its heading) with zero requests", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    next(); next();
    openReview();
    await screen.findByRole("region", { name: "مراجعة الإجابات" });
    const before = calls.length;
    fireEvent.click(screen.getByRole("button", { name: "العودة للحل" }));
    expect(screen.getByText("ما هو عنوان IP؟")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    expect(calls.length).toBe(before);
    expect(screen.getByRole("navigation", { name: "التنقل بين الأسئلة" })).toBeTruthy();
  });

  it("final submit from the review screen runs the EXISTING submit(): exact ConfirmDialog message + labels, cancel = no request and the review stays with focus back on the submit button, confirm = saveDraft (if dirty) then submit with the same body → result", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    fireEvent.click(screen.getByRole("radio", { name: "القدس" }));
    next(); next();
    openReview();
    const review = await screen.findByRole("region", { name: "مراجعة الإجابات" });
    await waitFor(() => expect(document.querySelector(".iex-save-state")?.textContent).toContain("تم الحفظ"), { timeout: 3000 });
    const submitBtn = within(review).getByRole("button", { name: "تسليم الامتحان" });
    const before = calls.length;
    submitBtn.focus(); fireEvent.click(submitBtn);                                                      // a real tap/click focuses the button first
    const dialog = await screen.findByRole("dialog", { name: "تسليم الامتحان" });
    expect(within(dialog).getByText("لم تُجب عن جميع الأسئلة. هل تريد التسليم الآن؟")).toBeTruthy();  // unchanged UX-7b-1 message
    expect(dialog.className).toContain("tone-danger");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "متابعة الحل" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "متابعة الحل" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.length).toBe(before);                                                                 // cancel = zero requests
    expect(screen.getByRole("region", { name: "مراجعة الإجابات" })).toBeTruthy();                      // review context stays
    expect(document.activeElement).toBe(submitBtn);                                                    // Dialog focus return → the review's submit
    fireEvent.click(submitBtn);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تسليم الآن" }));
    await screen.findByText(/تم تسليم المحاولة 1/);
    const actions = posts().map(p => p.body.action);
    expect(actions.filter(a => a === "submit").length).toBe(1);
    const submit = posts().find(p => p.body.action === "submit")!;
    expect(Object.keys(submit.body).sort()).toEqual(["action", "answers"]);
    expect(submit.body.answers).toEqual({ q1: { kind: "choice", index: 0 } });
  });

  it("dirty at submit time: the pre-submit saveDraft still precedes submit (same order), and the offline guard still fires BEFORE any dialog", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    next(); next();
    fireEvent.change(screen.getByRole("textbox", { name: "ما هو عنوان IP؟" }), { target: { value: "192.168.1.1" } });
    openReview();
    await screen.findByRole("region", { name: "مراجعة الإجابات" });
    fireEvent.click(screen.getByRole("button", { name: "تسليم الامتحان" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تسليم الآن" }));
    await screen.findByText(/تم تسليم المحاولة 1/);
    const actions = posts().map(p => p.body.action);
    expect(actions.indexOf("saveDraft")).toBeGreaterThanOrEqual(0);
    expect(actions.indexOf("saveDraft")).toBeLessThan(actions.indexOf("submit"));
    cleanup(); installFetch();
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    next(); next(); openReview();
    await screen.findByRole("region", { name: "مراجعة الإجابات" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
    fireEvent.click(screen.getByRole("button", { name: "تسليم الامتحان" }));
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("لا يمكن تسليم الامتحان قبل حفظ التغييرات");
    expect(posts().filter(p => p.body.action === "submit").length).toBe(0);
  });

  it("the top-bar back keeps the existing backWithoutSubmit (dirty → the exact leave dialog), never routed through the review screen", async () => {
    const { onBack } = mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); next();
    fireEvent.change(screen.getByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." }), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى المهام" }));
    const dialog = await screen.findByRole("dialog", { name: "مغادرة بدون تسليم" });
    expect(within(dialog).getByText("توجد إجابات لم تُحفظ بعد. هل تريد المغادرة على أي حال؟")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "مراجعة الإجابات" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "المغادرة" }));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });
});

describe("UX-7b-2 — save while navigating", () => {
  it("navigation during an in-flight save neither waits for it nor fires a second save; the 800 ms debounce is the only save trigger", async () => {
    saveGate = () => {};
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); next();
    fireEvent.change(screen.getByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." }), { target: { value: "شبكة" } });
    await waitFor(() => expect(posts().filter(p => p.body.action === "saveDraft").length).toBe(1), { timeout: 3000 });   // debounce fired, request held open
    expect(document.querySelector(".iex-save-state")?.textContent).toContain("جارٍ الحفظ");
    const before = calls.length;
    next(); previous();                                                                                // immediate, no waiting
    expect(screen.getByText("اشرح مفهوم الشبكة المحلية.")).toBeTruthy();
    openNavigator(); fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "السؤال 3 — غير مُجاب" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    openReview(); await screen.findByRole("region", { name: "مراجعة الإجابات" });
    fireEvent.click(screen.getByRole("button", { name: "العودة للحل" }));
    expect(calls.length).toBe(before);                                                                 // no request from any navigation
    expect(document.querySelector(".iex-save-state")?.textContent).toContain("جارٍ الحفظ");             // truthful: still in flight
    await act(async () => { saveGate!(); await new Promise(r => setTimeout(r, 20)); });
    await waitFor(() => expect(document.querySelector(".iex-save-state")?.textContent).toContain("تم الحفظ · آخر حفظ: 10:01:02"), { timeout: 3000 });
    expect(posts().filter(p => p.body.action === "saveDraft").length).toBe(1);                          // exactly one save
  });

  it("the displayed index is clamped when the authoritative body has fewer questions than the index (no crash, no network-derived index)", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); next(); next();
    expect(position()).toBe("السؤال 3 / 3");
    // an empty exam body still renders a safe state
    cleanup(); installFetch();
    mount({ ...legacyAssignment, questionCount: 0, exam: { ...flatExam, questions: [] } });
    await screen.findByText("لا توجد أسئلة في هذا الامتحان.");
    expect(position()).toBe("السؤال 0 / 0");
  });
});

describe("UX-7b-2 — source and authority guards", () => {
  const RAW = import.meta.glob("./{StudentExamPage,StructuredExamSection,student/exam/ExamBottomNavigation,student/exam/QuestionNavigatorList,student/exam/QuestionNavigatorDialog,student/exam/ExamSectionContext,student/exam/ExamReviewScreen}.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const RAW_TS = import.meta.glob("./{student/exam/questionPager,student/exam/sectionRule,examTheme,examStructure}.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const page = () => code(RAW["./StudentExamPage.tsx"]);
  const newFiles = ["./student/exam/ExamBottomNavigation.tsx", "./student/exam/QuestionNavigatorList.tsx", "./student/exam/QuestionNavigatorDialog.tsx", "./student/exam/ExamSectionContext.tsx", "./student/exam/ExamReviewScreen.tsx"];

  it("no fetch / storage / clock / timer / mark-for-review in the pager and navigation components; answered() and calculateSectionProgress are reused, never re-implemented", () => {
    expect(Object.keys(RAW).length).toBe(7);
    const pager = code(RAW_TS["./student/exam/questionPager.ts"]);
    for (const [f, src] of Object.entries({ ...Object.fromEntries(newFiles.map(f => [f, RAW[f]])), pager })) {
      const c = code(src);
      expect(c, f).not.toMatch(/fetch\(|XMLHttpRequest|localStorage|sessionStorage|Date\.now|performance\.now|setInterval|setTimeout|new Date\(/);
      expect(c, f).not.toMatch(/markedForReview|markForReview|flagged/i);
      expect(c, f).not.toMatch(/kind==="choice"|kind==="text"|\.trim\(\)/);                       // no second answered predicate
    }
    expect(pager).toContain('import { answered, qid } from "../../StudentQuestionCard";');
    expect(pager).toContain("sectionQuestionId(section, q, i)"); expect(pager).toContain("qid(q, i)");
    expect(pager).toContain("return answered(answers[page.id])");
    expect(code(RAW["./student/exam/QuestionNavigatorList.tsx"])).toContain("calculateSectionProgress(section, answers)");
    expect(code(RAW["./student/exam/ExamReviewScreen.tsx"])).toContain("calculateSectionProgress(s, answers)");
    expect(code(RAW["./student/exam/ExamSectionContext.tsx"])).toContain("calculateSectionProgress(section, answers)");
    expect(code(RAW["./student/exam/ExamSectionContext.tsx"])).toContain("sectionRuleLine(section)");
    expect(code(RAW_TS["./student/exam/sectionRule.ts"])).toContain("سيتم تصحيح أول");                   // one shared wording for both renderers
    expect(code(RAW["./student/exam/QuestionNavigatorDialog.tsx"])).toContain('import Dialog from "../../ui/Dialog";');
  });

  it("the page: one pager (no competing focus index), no new endpoint, no second timer, no score-based inference, unchanged submit/confirm/save authorities, presentation-only index", () => {
    const p = page();
    expect(p).toContain("buildQuestionPages(norm,exam.questions||[])"); expect(p).toContain("clampPageIndex(pageIndex,pages.length)");
    expect(p).not.toMatch(/focusIndex|previousFocusIndex|nextFocusIndex|focusProgressPercent/);
    expect(p).not.toContain("<StructuredExamSection"); expect(p).not.toContain('className="iex-flow"');
    expect(p).not.toMatch(/markedForReview|window\.confirm|localStorage|sessionStorage|toLocaleString\(|toLocaleDateString\(/);
    // requests: exactly the pre-existing four actions and the two endpoints
    expect([...p.matchAll(/action:"([a-zA-Z]+)"/g)].map(m => m[1]).sort()).toEqual(["finalizeTimedOutAttempt", "saveDraft", "startAttempt", "submit"]);
    expect([...p.matchAll(/fetch\("\/api\/([a-z-]+)\//g)].map(m => m[1]).sort()).toEqual(["student-assignment", "student-submission"]);
    expect(p.match(/setInterval\(/g)?.length).toBe(1);                                                   // the single pre-existing countdown tick
    expect(p.match(/Date\.now\(\)/g)?.length).toBe(1);                                                   // the pre-existing serverNow fallback only
    expect(p).toContain("const est=serverAnchorMs.current+elapsed;const rem=effEndMs.current-est;");
    expect(p).toContain("},800);"); expect(p).toContain("[1000,2000,4000][attempt]");
    expect(p).toContain("saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveDraftSnapshot(");
    expect(p).toContain("expectedAttemptNumber:attemptCtx.attemptNumber,expectedStartedAt:attemptCtx.startedAt");
    expect(p).toContain("deriveSaveState({localRevision:revision.current,savedRevision:savedRevision.current,saving,retrying,errorExhausted:saveError,online})");
    expect(p).toContain("if(!(await confirmSubmit()))return;");
    expect(p).toContain('onSubmit={()=>{void submit()}}');                                              // the review screen calls the existing submit()
    expect(p).toContain("resolveGradingStatus");
    expect(p).not.toMatch(/percentage\s*[<>]=?\s*\d|score\s*[<>]=?\s*\d/);                              // no score-based final inference
    // navigation is local presentation state: setPageIndex is never called from a response handler
    expect(p).not.toMatch(/setPageIndex\([^)]*(st|r|resp|json)\./);
    expect(p).toContain('const goTo=(index:number)=>{setNavOpen(false);setView("answer");setPageIndex(clampPageIndex(index,pages.length));pendingFocusRef.current="question"};');
    expect(p).toContain("pendingFocusRef.current=null;");
    // confirm messages unchanged
    for (const m of ["لم تُجب عن جميع الأسئلة. هل تريد التسليم الآن؟", "سيتم إرسال الحل للتصحيح. هل تريد المتابعة؟", "توجد إجابات لم تُحفظ بعد. هل تريد المغادرة على أي حال؟", 'بنود مطلوبة"+(short.s.title?" في «"+short.s.title+"»":"")+". هل تريد التسليم؟']) expect(p).toContain(m);
  });

  it("Answer union unchanged; StructuredExamSection keeps its long-form default export (teacher preview) and exposes the per-question renderer the pager reuses; examTheme helpers stay for the preview only", () => {
    const sec = code(RAW["./StructuredExamSection.tsx"]);
    expect(sec).toContain("export default function StructuredExamSection(");
    expect(sec).toContain("export function StructuredSectionQuestion(");
    expect(sec).toContain('import {sectionRuleLine} from "./student/exam/sectionRule";');
    expect(sec.match(/selectGradedUnits\(section,answers\)/g)?.length).toBe(1);
    expect(code(RAW_TS["./examTheme.ts"])).toContain("export function nextFocusIndex");                 // API kept (ExamPreview consumes it)
    expect(code(RAW_TS["./examStructure.ts"])).toContain("export function calculateSectionProgress(");
    expect(code(RAW["./StudentExamPage.tsx"])).not.toMatch(/answered\(a\)\{|function answered/);
  });

  it("CSS guards (sticky bottom bar with safe area, ≥44/48 px navigation controls, keyboard scroll margins, review/navigator states, phone-first breakpoints) live in api/tests/ux2-shell-foundation.test.js", () => {
    // Vite's ?raw import of a .css file yields an empty module in this environment (see UX-7b-1), so the stylesheet
    // assertions are kept in the Node guard suite that reads studentexam-pro.css from disk.
    expect(true).toBe(true);
  });
});
