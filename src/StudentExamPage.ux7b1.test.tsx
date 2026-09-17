// @vitest-environment happy-dom
// UX-7b-1 — Mobile Exam Foundation: compact top bar with the authoritative timer chip, details disclosure, the single
// SaveStatus live region over the existing derived save state, the shared ConfirmDialog with the exact former
// window.confirm texts and gating, additive accessibility on the existing question controls, Western digits,
// reduced motion, and the source/CSS guards that pin "no paging, no new timer, no new request".
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";
import SaveStatus from "./student/exam/SaveStatus";
import { formatDateLatn, formatDateTimeLatn } from "./student/exam/format";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
const ARABIC_INDIC = /[٠-٩]/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}◀▶]/u;

const Q1 = { examQuestionId: "q1", presentationType: "multipleChoice", text: "ما هي عاصمة فلسطين؟", marks: 2, options: [{ text: "القدس" }, { text: "رام الله" }] };
const Q2 = { examQuestionId: "q2", presentationType: "open", text: "اشرح مفهوم الشبكة المحلية.", marks: 3 };
const ALL_QUESTIONS = [
  Q1, Q2,
  { examQuestionId: "q3", presentationType: "tableFill", text: "أكمل الجدول\n| الجهاز | الطبقة |\n| --- | --- |\n| Switch | |\n| Router | |", marks: 2 },
  { examQuestionId: "q4", presentationType: "multiTrueFalse", text: "حدد صحة العبارات", marks: 2, fields: [{ id: "f1", statement: "IP في الطبقة الثالثة" }, { id: "f2", statement: "TCP بلا اتصال" }] },
  { examQuestionId: "q5", presentationType: "cliFill", text: "أكمل الأمر", marks: 1, cli: "Router(config)# hostname [[h1]]\nRouter(config)# enable secret [[s1]]", fields: [{ id: "h1" }, { id: "s1" }] },
  { examQuestionId: "q6", presentationType: "tableFill", text: "أكمل جدول العناوين", marks: 2, tableHeaders: ["الجهاز", "العنوان", "صالح؟"], tableRows: [["PC1", "", ""]], fields: [{ id: "a1", row: 0, column: 1, kind: "text" }, { id: "b1", row: 0, column: 2, kind: "boolean" }] }
];
// Flat legacy exam (two questions) and a structured exam carrying every control type (field-type questions are
// only wired through the structured section renderer, exactly as before UX-7b-1).
const flatExam = { title: "امتحان", metadata: {}, presentationTheme: "default", questions: [Q1, Q2] };
const sectionExam = { title: "امتحان", metadata: {}, presentationTheme: "default", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: ALL_QUESTIONS }] };
const legacyAssignment = { assignmentId: "asg1", title: "واجب الشبكات", instructions: "أجب عن كل الأسئلة بعناية.", openAt: "", dueAt: "2026-05-01T10:30:00.000Z", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 2, totalMarks: 12, exam: flatExam };
const structuredAssignment = { ...legacyAssignment, questionCount: 6, exam: sectionExam };
const legacyState = { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: "2026-03-01T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, durationMinutes: 0 };
const submittedResult = { attemptNumber: 1, submittedAt: "2026-03-01T10:05:00.000Z", score: 10, totalMarks: 12, percentage: 83.3, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" };

let calls: { url: string; method: string; body: any }[] = [];
let stateBody: unknown = legacyState;
function installFetch(opts: { save?: (n: number) => Promise<Response> } = {}) {
  calls = []; let saves = 0;
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") return json(200, { ok: true, state: stateBody });
      if (body.action === "saveDraft") { saves++; return opts.save ? opts.save(saves) : json(200, { ok: true, savedAt: "2026-03-01T10:01:02.000Z" }); }
      if (body.action === "submit") return json(200, { ok: true, result: submittedResult, state: { ...legacyState, attemptsUsed: 1, canAttempt: false, canWrite: false, latestResult: submittedResult, attempts: [submittedResult] } });
      return json(200, { ok: true, state: stateBody });
    }
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
const gets = () => calls.filter(c => c.method === "GET").length;
const posts = () => calls.filter(c => c.method === "POST");
function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((q: string) => ({ matches, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
let scrollCalls: unknown[] = [];
beforeEach(() => {
  scrollCalls = [];
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
const saveText = () => document.querySelector(".iex-progress .iex-save-state")?.textContent || "";
// UX-7b-2: one question is mounted at a time. `goNext` moves to the next page; `pressSubmit` walks to the last question,
// opens the review screen ("مراجعة الإجابات") and presses the final "تسليم الامتحان" — the shared ConfirmDialog stays the gate.
const goNext = () => fireEvent.click(screen.getByRole("button", { name: "التالي" }));
async function pressSubmit() {
  while (screen.queryByRole("button", { name: "التالي" })) goNext();
  fireEvent.click(screen.getByRole("button", { name: "مراجعة الإجابات" }));
  fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" }));
}

describe("UX-7b-1 — compact top bar, timer chip, details disclosure", () => {
  it("renders ONE compact top bar (back · h1 title · context) instead of the header card, with a single h1 and no old header", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    const bar = document.querySelector("header.iex-topbar") as HTMLElement;
    expect(bar).toBeTruthy();
    expect(document.querySelectorAll("h1").length).toBe(1);
    expect(within(bar).getByRole("heading", { level: 1 }).textContent).toBe("واجب الشبكات");
    expect(within(bar).getByRole("button", { name: "العودة إلى المهام" }).className).toContain("eb-icon-button");
    expect(bar.textContent).toContain("الحادي عشر · المحاولة 1 / 1");
    expect(document.querySelector(".iex-head")).toBeNull();
    expect(document.querySelector(".iex-countdown")).toBeNull();                                       // untimed: no chip
    expect(gets()).toBe(1); expect(posts()).toEqual([]);
  });

  it("timed live attempt: the chip in the top bar shows the existing server-anchored remaining time via countdownTone, with NO live region", async () => {
    const serverNow = new Date().toISOString();
    const endsAt = new Date(Date.now() + 4 * 60 * 1000).toISOString();                           // 4 min → "warn" tone
    stateBody = { ...legacyState, timed: true, requiresStart: true, durationMinutes: 30, attemptModelVersion: 2, serverNow, canWrite: true, canStartAttempt: false,
      activeAttempt: { attemptNumber: 1, startedAt: serverNow, endsAt, status: "started", lastSavedAt: "" }, effectiveAttemptEndsAt: endsAt };
    mount({ ...legacyAssignment, durationMinutes: 30, requiresStart: true, timed: true });
    await screen.findByText("ما هي عاصمة فلسطين؟");
    const chip = document.querySelector(".iex-topbar .iex-countdown") as HTMLElement;
    expect(chip).toBeTruthy();
    expect(chip.getAttribute("role")).toBe("timer");
    expect(chip.getAttribute("aria-label")).toBe("الوقت المتبقي");
    expect(chip.hasAttribute("aria-live")).toBe(false);
    expect(chip.className).toContain("warn");
    expect(chip.querySelector(".iex-countdown-clock")?.textContent).toMatch(/^0[34]:\d\d$/);
    expect(document.querySelectorAll('[aria-live]').length).toBe(1);                                  // only the save status
  });

  it("the details disclosure is a real button (aria-expanded/aria-controls, SVG chevron) holding the moved metadata; toggling costs no request", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    const toggle = screen.getByRole("button", { name: /تفاصيل الامتحان والتعليمات/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const panel = document.getElementById(toggle.getAttribute("aria-controls") || "") as HTMLElement;
    expect(panel.hidden).toBe(true);
    expect(toggle.querySelector("svg.eb-disclosure-chevron")).toBeTruthy();
    expect(toggle.textContent).toContain("2 أسئلة · 12 علامة");
    const before = calls.length;
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(within(panel).getByText("أجب عن كل الأسئلة بعناية.")).toBeTruthy();
    expect(within(panel).getByText("آخر موعد").nextElementSibling?.textContent).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);   // Western digits
    expect(within(panel).getByText("المحاولة").nextElementSibling?.textContent).toBe("المحاولة 1 / 1");
    expect(within(panel).getByText("العلامات").nextElementSibling?.textContent).toBe("12");
    fireEvent.click(toggle);
    expect(panel.hidden).toBe(true);
    expect(calls.length).toBe(before);
  });

  it("general instructions stay in the body (inside the disclosure, open by default when present)", async () => {
    mount({ ...legacyAssignment, exam: { ...flatExam, metadata: { generalInstructions: "اقرأ السؤال جيدًا\nلا تستخدم القلم الأحمر" } } });
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(screen.getByRole("button", { name: /تفاصيل الامتحان والتعليمات/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("التعليمات العامة")).toBeTruthy();
    expect(screen.getByText("لا تستخدم القلم الأحمر")).toBeTruthy();
  });
});

describe("UX-7b-1 — SaveStatus over the derived save state", () => {
  it("maps the six canonical kinds without ever saying saved early; hint and manual retry only where the model says so", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<SaveStatus kind="pending" lastSavedAt="2026-03-01T10:01:02.000Z" onRetry={onRetry} />);
    expect(screen.getByRole("status").textContent).toContain("تغييرات غير محفوظة");
    expect(screen.getByRole("status").textContent).not.toContain("تم الحفظ");
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<SaveStatus kind="saving" lastSavedAt="" onRetry={onRetry} />);
    expect(screen.getByRole("status").textContent).toContain("جارٍ الحفظ");
    rerender(<SaveStatus kind="retrying" lastSavedAt="" onRetry={onRetry} />);
    expect(screen.getByRole("status").textContent).toContain("تعذر الحفظ — تتم إعادة المحاولة");
    rerender(<SaveStatus kind="offline" lastSavedAt="" onRetry={onRetry} />);
    expect(screen.getByRole("status").textContent).toContain("غير متصل");
    expect(screen.getByText("أبقِ الصفحة مفتوحة حتى يعود الاتصال.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();                                                  // never a doomed retry while offline
    rerender(<SaveStatus kind="error" lastSavedAt="" onRetry={onRetry} />);
    expect(screen.getByRole("status").textContent).toContain("تعذر حفظ التغييرات");
    fireEvent.click(screen.getByRole("button", { name: "إعادة محاولة الحفظ" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<SaveStatus kind="saved" lastSavedAt="2026-03-01T10:01:02.000Z" onRetry={onRetry} />);
    expect(screen.getByRole("status").textContent).toBe("تم الحفظ · آخر حفظ: 10:01:02");
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("on the page: an edit is pending (not saved) until the server confirms, then saved with the SERVER time; exactly one live region", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext();
    const ta = await screen.findByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." });
    expect(saveText()).toContain("تم الحفظ");
    fireEvent.change(ta, { target: { value: "شبكة" } });
    expect(saveText()).toContain("تغييرات غير محفوظة");
    expect(saveText()).not.toContain("تم الحفظ");
    await waitFor(() => expect(saveText()).toContain("تم الحفظ · آخر حفظ: 10:01:02"), { timeout: 3000 });
    expect(document.querySelectorAll('[aria-live="polite"].iex-save-state').length).toBe(1);
    expect(document.querySelectorAll(".iex-save-state").length).toBe(1);
  });

  it("offline with a dirty answer shows the offline state and fires no save", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext();
    const ta = await screen.findByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
    fireEvent.change(ta, { target: { value: "شبكة" } });
    await waitFor(() => expect(saveText()).toContain("غير متصل"));
    await new Promise(r => setTimeout(r, 900));
    expect(posts()).toEqual([]);
  });
});

describe("UX-7b-1 — ConfirmDialog parity with the former window.confirm", () => {
  it("generic submit: dialog with the exact message; cancel → no request, dialog closed; confirm → saveDraft then submit (same body) → result", async () => {
    mount(structuredAssignment);
    await screen.findByText("ما هي عاصمة فلسطين؟");
    // answer everything so the generic message applies
    fireEvent.click(screen.getByRole("radio", { name: "القدس" })); goNext();
    fireEvent.change(screen.getByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." }), { target: { value: "ج" } }); goNext();
    for (const box of screen.getAllByRole("textbox", { name: /— الطبقة$/ })) fireEvent.change(box, { target: { value: "2" } });
    goNext();
    for (const sel of screen.getAllByRole("combobox", { name: /^السؤال 4 —/ })) fireEvent.change(sel, { target: { value: "true" } });
    goNext();
    for (const box of screen.getAllByRole("textbox", { name: /الفراغ/ })) fireEvent.change(box, { target: { value: "x" } });
    goNext();
    fireEvent.change(screen.getByRole("textbox", { name: "السؤال 6 — PC1 — العنوان" }), { target: { value: "10.0.0.1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "السؤال 6 — PC1 — صالح؟" }), { target: { value: "true" } });
    await waitFor(() => expect(saveText()).toContain("تم الحفظ"), { timeout: 3000 });
    const before = calls.length;
    await pressSubmit();
    const dialog = await screen.findByRole("dialog", { name: "تسليم الامتحان" });
    expect(within(dialog).getByText("سيتم إرسال الحل للتصحيح. هل تريد المتابعة؟")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "متابعة الحل" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.length).toBe(before);                                                                 // review + cancel = zero requests
    expect(screen.queryByText(/تم تسليم المحاولة/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "تسليم الامتحان" }));                           // still on the review screen
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تسليم الآن" }));
    await screen.findByText(/تم تسليم المحاولة 1/);
    const submit = posts().find(p => p.body.action === "submit");
    expect(submit).toBeTruthy();
    expect(Object.keys(submit!.body).sort()).toEqual(["action", "answers"]);                             // legacy: no identity, same body
    expect(submit!.body.answers.q1).toEqual({ kind: "choice", index: 0 });
    expect(submit!.body.answers.q6).toEqual({ kind: "fields", values: { a1: "10.0.0.1", b1: "true" } });
    expect(posts().map(p => p.body.action).filter(a => a === "submit").length).toBe(1);
  });

  it("unanswered submit message parity", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    await pressSubmit();
    const dialog = await screen.findByRole("dialog", { name: "تسليم الامتحان" });
    expect(within(dialog).getByText("لم تُجب عن جميع الأسئلة. هل تريد التسليم الآن؟")).toBeTruthy();
    expect(dialog.className).toContain("tone-danger");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "متابعة الحل" }));   // stray Enter never submits
  });

  it("firstN shortfall message parity (structured section)", async () => {
    const structured = { ...legacyAssignment, exam: { title: "امتحان", metadata: {}, sections: [{ id: "s1", title: "القسم أ", gradingPolicy: "firstNAnswered", requiredAnswers: 2, answerUnit: "question", questions: [
      { examQuestionId: "a", presentationType: "open", text: "س1", marks: 1 }, { examQuestionId: "b", presentationType: "open", text: "س2", marks: 1 }, { examQuestionId: "c", presentationType: "open", text: "س3", marks: 1 }
    ] }] } };
    mount(structured);
    await screen.findByText("س1");
    fireEvent.change(screen.getByRole("textbox", { name: "س1" }), { target: { value: "ج" } });
    await pressSubmit();
    const dialog = await screen.findByRole("dialog", { name: "تسليم الامتحان" });
    expect(within(dialog).getByText("أجبت عن 1 من 2 بنود مطلوبة في «القسم أ». هل تريد التسليم؟")).toBeTruthy();
  });

  it("back without submission: clean → leaves at once; dirty → exact message, cancel keeps the page, confirm leaves; never a request", async () => {
    const { onBack } = mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى المهام" }));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup(); installFetch();
    const second = mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext();
    const ta = await screen.findByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." });
    fireEvent.change(ta, { target: { value: "شبكة" } });                                               // dirty (debounce not yet fired)
    const before = calls.length;
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى المهام" }));                        // UX-7b-2: the top-bar back is the one leave path
    const dialog = await screen.findByRole("dialog", { name: "مغادرة بدون تسليم" });
    expect(within(dialog).getByText("توجد إجابات لم تُحفظ بعد. هل تريد المغادرة على أي حال؟")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "البقاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(second.onBack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى المهام" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "المغادرة" }));
    await waitFor(() => expect(second.onBack).toHaveBeenCalledTimes(1));
    expect(calls.filter(c => c.method === "POST" && c.body.action !== "saveDraft").length).toBe(0);
    void before;
  });
});

describe("UX-7b-1 — question control accessibility (additive, same answer shapes)", () => {
  it("multiple choice is a fieldset named by the question text with native radios inside whole-row labels", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    const group = screen.getByRole("group", { name: "ما هي عاصمة فلسطين؟" });
    expect(group.tagName).toBe("FIELDSET");
    const radios = within(group).getAllByRole("radio");
    expect(radios.length).toBe(2);
    expect(radios[0].getAttribute("type")).toBe("radio");
    expect(radios[0].closest("label")?.className).toContain("iex-option");
    fireEvent.click(screen.getByRole("radio", { name: "رام الله" }));
    expect((screen.getByRole("radio", { name: "رام الله" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("radio", { name: "رام الله" }).closest("label")?.className).toContain("selected");
  });

  it("open answer, legacy table cells, multiTrueFalse, CLI blanks and generalized table cells all have accessible names", async () => {
    mount(structuredAssignment);
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext();                                            // UX-7b-2: one question at a time
    expect(screen.getByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." }).getAttribute("placeholder")).toBe("اكتب إجابتك هنا...");
    goNext();
    expect(screen.getByRole("textbox", { name: "Switch — الطبقة" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Router — الطبقة" })).toBeTruthy();
    // legacy table rows are row headers; column headers carry scope
    expect(screen.getByRole("rowheader", { name: "Switch" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(0);
    goNext();
    expect(screen.getByRole("combobox", { name: "السؤال 4 — IP في الطبقة الثالثة" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "السؤال 4 — TCP بلا اتصال" })).toBeTruthy();
    goNext();
    expect(screen.getByRole("textbox", { name: "السؤال 5 — الفراغ h1" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "السؤال 5 — الفراغ s1" })).toBeTruthy();
    // the CLI block stays LTR and its blanks are plain inputs (no answer transformation)
    const cli = document.querySelector(".iex-cli") as HTMLElement;
    expect(cli.tagName).toBe("PRE");
    fireEvent.change(screen.getByRole("textbox", { name: "السؤال 5 — الفراغ h1" }), { target: { value: "R1" } });
    await waitFor(() => expect(posts().some(p => p.body.action === "saveDraft")).toBe(true), { timeout: 3000 });
    expect(posts().find(p => p.body.action === "saveDraft")!.body.answers.q5).toEqual({ kind: "fields", values: { h1: "R1" } });
    goNext();
    expect(screen.getByRole("textbox", { name: "السؤال 6 — PC1 — العنوان" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "السؤال 6 — PC1 — صالح؟" })).toBeTruthy();
  });
});

describe("UX-7b-1 — digits, reduced motion, views", () => {
  it("the formatter emits Western digits only", () => {
    expect(formatDateTimeLatn("2026-05-01T10:30:00.000Z")).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(formatDateLatn("2026-05-01T10:30:00.000Z")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatDateTimeLatn("")).toBe("بدون موعد"); expect(formatDateLatn("")).toBe("");
    expect(formatDateTimeLatn("nope")).toBe("بدون موعد");
  });

  it("the result view shows the submission time and attempt count in Western digits, no emoji, grading from the shared resolver", async () => {
    stateBody = { ...legacyState, attemptsUsed: 1, canAttempt: false, canWrite: false, latestResult: submittedResult, attempts: [submittedResult] };
    mount();
    await screen.findByText(/تم تسليم المحاولة 1/);
    expect(document.body.textContent || "").not.toMatch(ARABIC_INDIC);
    expect(document.body.textContent || "").not.toMatch(EMOJI);
    expect(screen.getByText(/تم الحفظ في حسابك بتاريخ/).textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(screen.getByText(/العلامة النهائية معتمدة/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "العودة إلى المهام" }).className).toContain("eb-button");
  });

  it("loading and running views carry no emoji; loading is a status", () => {
    mount();
    expect(screen.getByRole("status").textContent).toBe("جارٍ تجهيز صفحة الامتحان...");
    expect(document.body.textContent || "").not.toMatch(EMOJI);
  });

  it("reduced motion: programmatic scrolling is not smooth when the viewer asks for reduced motion", async () => {
    stubMatchMedia(true);
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    await pressSubmit();
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تسليم الآن" }));
    await screen.findByText(/تم تسليم المحاولة/);
    expect(scrollCalls.length).toBeGreaterThan(0);
    for (const c of scrollCalls) expect((c as { behavior: string }).behavior).toBe("auto");
    cleanup(); installFetch(); stubMatchMedia(false);
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    await pressSubmit();
    scrollCalls = [];
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تسليم الآن" }));
    await screen.findByText(/تم تسليم المحاولة/);
    expect((scrollCalls[0] as { behavior: string }).behavior).toBe("smooth");
  });
});

describe("UX-7b-1 — source guards", () => {
  const RAW = import.meta.glob("./{StudentExamPage,StudentQuestionCard,CompoundQuestion,QuestionField,StructuredExamSection,StructuredExamCover,student/exam/SaveStatus,student/exam/ExamTopBar,student/exam/ExamDetailsDisclosure}.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const RAW_TS = import.meta.glob("./{student/exam/format,examTimer,studentSaveState}.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const CSS = import.meta.glob("./{studentexam-pro,platform}.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const page = () => code(RAW["./StudentExamPage.tsx"]);

  it("UX-7b-2 superseded the UX-7b-1 no-paging lock: the page now owns ONE unified pager (no focus-theme index, no long-form container, still no mark-for-review)", () => {
    expect(Object.keys(RAW).length).toBe(9);
    const p = page();
    expect(p).not.toMatch(/markedForReview|role="navigation"/);
    expect(p).not.toMatch(/focusIndex|previousFocusIndex|nextFocusIndex|focusProgressPercent/);          // the competing focus-theme index is gone
    expect(p).not.toContain("<StructuredExamSection"); expect(p).not.toContain('<section className="iex-flow">');
    expect(p).toContain("buildQuestionPages(norm,exam.questions||[])"); expect(p).toContain("<ExamBottomNavigation"); expect(p).toContain("<QuestionNavigatorDialog"); expect(p).toContain("<ExamReviewScreen");
  });
  it("timer authority: the chip only consumes remainingMs + countdownTone; no second timer, no Date.now() for expiry, performance.now anchor kept", () => {
    const p = page(); const bar = code(RAW["./student/exam/ExamTopBar.tsx"]);
    expect(bar).toContain("formatCountdown(timer.remainingMs)");
    expect(bar).not.toMatch(/Date\.now|performance\.now|setInterval|setTimeout|new Date\(/);
    expect(p).toContain("countdownTone(remainingMs)");
    expect(p).not.toMatch(/formatCountdown\(/);                                                          // delegated to the chip
    expect(p.match(/Date\.now\(\)/g)?.length).toBe(1);                                                  // the pre-existing serverNow fallback only
    expect(p).toContain("const est=serverAnchorMs.current+elapsed;const rem=effEndMs.current-est;");
    expect(p).toContain('body:JSON.stringify({action:"finalizeTimedOutAttempt"})');
    expect(code(RAW_TS["./examTimer.ts"])).toContain("export function countdownTone");
  });
  it("save authority: SaveStatus renders the derived kind only; the page still derives ONE state and keeps the 800 ms debounce, serial queue and retry policy", () => {
    const s = code(RAW["./student/exam/SaveStatus.tsx"]); const p = page();
    expect(s).toContain("saveStateLabel(kind)"); expect(s).toContain("canManualRetry(kind)"); expect(s).toContain("formatLastSaved(lastSavedAt)");
    expect(s).not.toMatch(/fetch\(|navigator\.onLine|Date\.now|localStorage/);
    expect(p).toContain("deriveSaveState({localRevision:revision.current,savedRevision:savedRevision.current,saving,retrying,errorExhausted:saveError,online})");
    expect(p).toContain("},800);");
    expect(p).toContain("[1000,2000,4000][attempt]");
    expect(p).toContain("saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveDraftSnapshot(");
    expect(p).toContain("expectedAttemptNumber:attemptCtx.attemptNumber,expectedStartedAt:attemptCtx.startedAt");
    expect(p).toContain("shouldWarnBeforeUnload(revision.current,savedRevision.current)");
    expect(p.match(/<SaveStatus /g)?.length).toBe(1);
  });
  it("no window.confirm, no locale digit formatter, no storage, no new answer shape, grading through the shared resolver", () => {
    const p = page();
    expect(p).not.toMatch(/window\.confirm|toLocaleString\(|toLocaleDateString\(|localStorage|sessionStorage/);
    expect(p).toContain("useConfirm()");
    expect(p).toContain("resolveGradingStatus");
    for (const [f, src] of Object.entries(RAW)) {
      const withoutContentDetection = code(src).replace(/export function tableCheckbox\(q:Question\)\{return [^\n]*\}/, "");   // legacy "✓" table-phrasing detector is question CONTENT matching, not UI
      expect(EMOJI.test(withoutContentDetection), f + " must not carry emoji glyphs").toBe(false);
      expect(code(src)).not.toMatch(/localStorage|sessionStorage/);
    }
    expect(code(RAW["./StudentQuestionCard.tsx"])).toContain('export type Answer={kind:"choice";index:number}|{kind:"sequence";values:string[]}|{kind:"table";values:(string|boolean)[]}|{kind:"text";value:string}|{kind:"fields";values:Record<string,FieldValue>}|{kind:"compound";parts:Record<string,Answer>};');
    expect(code(RAW["./StudentQuestionCard.tsx"])).toContain('<fieldset className="iex-options" aria-labelledby={textId}>');
    expect(code(RAW["./StudentQuestionCard.tsx"])).toContain('<input type="radio" name={id}');
    expect(code(RAW["./QuestionField.tsx"])).not.toMatch(/fetch\(/);
  });
  it("CSS guards (phone-first breakpoints, 44 px controls, focus hook, contained tables, overflow-wrap, reduced motion, legacy removal) live in api/tests/ux2-shell-foundation.test.js, which reads the stylesheet from disk", () => {
    // Vite's ?raw import of a .css file yields an empty module in this environment, so the stylesheet assertions are
    // kept in the Node guard suite (see "UX-7b-1 studentexam-pro.css …" there) rather than duplicated here.
    expect(typeof CSS).toBe("object");
  });
});
