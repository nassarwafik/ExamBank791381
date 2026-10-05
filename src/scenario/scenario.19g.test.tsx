// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, screen, act, within, waitFor } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import StructuredExamSection from "../StructuredExamSection";
import StudentExamPage from "../StudentExamPage";
import AssignmentReview from "../AssignmentReview";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import { normalizeExamStructure } from "../examStructure";
import type { StructuredExam, BuilderQuestion, BuilderSection } from "../examTypes";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";

// Phase 19G — the Scenario layer in the UI: the teacher's scenario card inside a section (create, sources of every kind through typed
// controls, link / unlink / reorder / create-in-scenario / delete with the questions surviving, inline validator messages, the membership
// chip on the question card), the student presentation (a labelled region with an h3, instructions, a native <details> that is open on the
// FIRST linked question and collapsed afterwards so the sources can be revisited without scrolling back, semantic table, authored alt,
// LTR code, text never interpreted as HTML, a malformed scenario renders nothing), the paged runtime (layout flag, answer identity
// untouched) and the teacher review context. Fail-first on 2aa40da: none of this exists.
type R = Record<string, unknown>;
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (e: unknown) => { sections: BuilderSection[] } }).sanitizeExamForStudent;
const q = (id: string, over: Partial<BuilderQuestion> = {}): BuilderQuestion => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 }, ...over });
const TEXT = { id: "src-t", version: 1 as const, kind: "text" as const, title: "النص", text: "<b>ليس HTML</b> فقرة للقراءة." };
const TABLE = { id: "src-tb", version: 1 as const, kind: "table" as const, title: "القياسات", columnHeaders: ["الزمن", "السرعة"], rowHeaders: ["أ", "ب"], rows: [["0", "1"], ["1", "3"]] };
const IMAGE = { id: "src-i", version: 1 as const, kind: "image" as const, alt: "مخطط الشبكة المحلية", image: { dataUrl: "data:image/png;base64,AAAA", origin: "uploaded" as const, contentType: "image/png" } };
const CODE = { id: "src-c", version: 1 as const, kind: "code" as const, title: "البرنامج", language: "python", source: "x = 1\nprint(x)\n" };
const SCN = (over: R = {}) => ({ id: "scn-1", version: 1 as const, title: "قراءة في الشبكات", instructions: "اعتمد على المصادر التالية.", sources: [TEXT, TABLE, IMAGE, CODE], questionIds: ["q1", "q2"], ...over });
const section = (over: Partial<BuilderSection> & R = {}): BuilderSection => ({ id: "s1", title: "القسم الأول", instructions: "", maxMarks: null, gradingPolicy: "all", requiredAnswers: null, answerUnit: "question", stimuli: {}, questions: [q("q1"), q("q2"), q("q3")], scenarios: [SCN()], ...over } as BuilderSection);
const examOf = (sec: BuilderSection): StructuredExam => ({ examId: "EXAM-19G", title: "امتحان", status: "draft", schemaVersion: 2, sections: [sec] } as StructuredExam);
const tick = (ms = 20) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((m: string) => ({ matches, media: m, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); stubMatchMedia(false); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} onRecover={hist.recover} autosaveDelayMs={5} />;
}
async function mountBuilder(initial: StructuredExam) { let hist!: Hist; render(<Host initial={initial} onHistory={h => { hist = h; }} />); await tick(30); return { hist: () => hist, sec: () => hist.present!.sections[0] as BuilderSection }; }

describe("19G-U1 — teacher authoring: a scenario card inside the section", () => {
  it("U1 «+ إضافة سيناريو» adds a card; a text source is added through typed controls; linking an existing question records membership ONLY on the scenario and shows the chip", async () => {
    const { sec } = await mountBuilder(examOf(section({ scenarios: [] })));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سيناريو" }));
    const card = await screen.findByTestId("scenario-editor", {}, { timeout: 3000 });
    expect(within(card).getByText("سيناريو")).toBeTruthy();
    fireEvent.change(within(card).getByLabelText("عنوان السيناريو"), { target: { value: "قراءة" } });
    fireEvent.click(within(card).getByRole("button", { name: "+ نص" }));
    const src = await within(card).findByTestId("scenario-source");
    expect(src.getAttribute("data-kind")).toBe("text");
    fireEvent.change(within(src).getByLabelText("نص المصدر"), { target: { value: "فقرة" } });
    fireEvent.change(within(card).getByRole("combobox", { name: "ربط سؤال موجود" }), { target: { value: "q2" } });
    await tick();
    const s = sec();
    expect(s.scenarios![0]).toMatchObject({ version: 1, title: "قراءة", questionIds: ["q2"] });
    expect(s.scenarios![0].sources[0]).toMatchObject({ kind: "text", text: "فقرة" });
    expect(s.questions.map(x => x.examQuestionId)).toEqual(["q1", "q2", "q3"]);
    expect(s.questions[1]).toEqual(q("q2"));                                       // marks / answer / type untouched; no scenario key on the question
    const chips = screen.getAllByTestId("scenario-chip");
    expect(chips).toHaveLength(1); expect(chips[0].textContent).toContain("قراءة");
    expect(screen.getByTestId("scenario-chip").closest("[data-question-id]")!.getAttribute("data-question-id")).toBe("q2");
    expect(document.querySelector("textarea[value*='{'], input[value*='{']")).toBeNull();   // no raw JSON editing
  });
  it("U2 unlink keeps the question; delete asks for confirmation and leaves every question standalone and intact", async () => {
    const { sec } = await mountBuilder(examOf(section()));
    const card = await screen.findByTestId("scenario-editor", {}, { timeout: 3000 });
    expect(screen.getAllByTestId("scenario-chip")).toHaveLength(2);
    fireEvent.click(within(card).getAllByRole("button", { name: "فك الربط" })[0]);
    await tick();
    expect(sec().scenarios![0].questionIds).toEqual(["q2"]);
    expect(screen.getAllByTestId("scenario-chip")).toHaveLength(1);
    expect(sec().questions).toEqual([q("q1"), q("q2"), q("q3")]);
    fireEvent.click(within(card).getByRole("button", { name: "حذف السيناريو" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("تبقى الأسئلة المرتبطة");
    fireEvent.click(within(dialog).getByRole("button", { name: "حذف السيناريو" }));
    await tick();
    expect(sec().scenarios).toEqual([]);
    expect(sec().questions).toEqual([q("q1"), q("q2"), q("q3")]);
    expect(screen.queryByTestId("scenario-chip")).toBeNull();
  });
  it("U3 «+ سؤال جديد داخل السيناريو» opens the ONE palette; the picked type is created after the last member and linked", async () => {
    const { sec } = await mountBuilder(examOf(section()));
    const card = await screen.findByTestId("scenario-editor", {}, { timeout: 3000 });
    fireEvent.click(within(card).getByRole("button", { name: "+ سؤال جديد داخل السيناريو" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    fireEvent.click(within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "shortAnswer")!);
    await tick(30);
    const s = sec();
    expect(s.questions.map(x => x.presentationType)).toEqual(["multipleChoice", "multipleChoice", "shortAnswer", "multipleChoice"]);
    expect(s.scenarios![0].questionIds).toEqual(["q1", "q2", s.questions[2].examQuestionId]);
  });
  it("U4 reorder inside the scenario moves the question in the SECTION (presentation only); the validator's messages appear inline (no sources, missing alt)", async () => {
    const { sec } = await mountBuilder(examOf(section({ scenarios: [SCN({ sources: [] })] })));
    const card = await screen.findByTestId("scenario-editor", {}, { timeout: 3000 });
    expect(within(card).getByTestId("scenario-issues").textContent).toContain("مصدرًا مشتركًا واحدًا");
    fireEvent.click(within(card).getByRole("button", { name: "+ صورة" }));
    await tick();
    expect(within(card).getByTestId("scenario-issues").textContent).toContain("الوصف النصي البديل");
    fireEvent.click(within(card).getByRole("button", { name: "تأخير السؤال 1 داخل السيناريو" }));
    await tick();
    expect(sec().questions.map(x => x.examQuestionId)).toEqual(["q2", "q1", "q3"]);
    expect(sec().scenarios![0].questionIds).toEqual(["q2", "q1"]);
    expect(sec().questions.find(x => x.examQuestionId === "q1")).toEqual(q("q1"));
  });
  it("U5 a table source is edited as a grid (+ عمود / + صف); a code source is an LTR textarea; the image file input accepts raster only", async () => {
    await mountBuilder(examOf(section({ scenarios: [SCN({ sources: [TABLE, CODE, IMAGE] })] })));
    const card = await screen.findByTestId("scenario-editor", {}, { timeout: 3000 });
    const srcs = within(card).getAllByTestId("scenario-source");
    expect(srcs.map(s => s.getAttribute("data-kind"))).toEqual(["table", "code", "image"]);
    expect(within(srcs[0]).getAllByRole("columnheader").length).toBeGreaterThanOrEqual(2);
    fireEvent.click(within(srcs[0]).getByRole("button", { name: "+ عمود" }));
    await tick();
    expect(within(within(card).getAllByTestId("scenario-source")[0]).getByLabelText("عنوان العمود 3")).toBeTruthy();
    const code = within(srcs[1]).getByLabelText("الكود (للقراءة فقط، لا يُشغَّل)") as HTMLTextAreaElement;
    expect(code.getAttribute("dir")).toBe("ltr"); expect(code.getAttribute("lang")).toBe("en"); expect(code.getAttribute("autocomplete")).toBe("off");
    expect((within(srcs[2]).getByLabelText("ملف صورة المصدر 3") as HTMLInputElement).getAttribute("accept")).toBe("image/png,image/jpeg,image/webp");
    expect(within(srcs[2]).getByLabelText("الوصف البديل للصورة (مطلوب)")).toBeTruthy();
  });
});

const noop = () => {};
const handlers = { onChoice: noop, onSeq: noop, onTable: noop, onText: noop, onField: noop, onPart: noop };
const studentSection = (sec: BuilderSection) => normalizeExamStructure(sanitizeExamForStudent(examOf(sec)) as never).sections[0];

describe("19G-U6 — student presentation (long form): a labelled region, first-member open, semantic sources, text never HTML", () => {
  it("U6 the scenario renders before its FIRST linked question with the sources open, collapsed before the second, and not at all for a non-member", async () => {
    render(<StructuredExamSection section={studentSection(section())} sectionNumber={1} startIndex={0} answers={{}} {...handlers} />);
    const views = await screen.findAllByTestId("scenario-view", {}, { timeout: 3000 });
    expect(views).toHaveLength(2);                                                        // q1 and q2 pages / blocks; q3 none
    const region = screen.getAllByRole("region", { name: /قراءة في الشبكات/ });
    expect(region).toHaveLength(2);
    expect(within(views[0]).getByRole("heading", { level: 3 }).textContent).toContain("قراءة في الشبكات");
    expect(within(views[0]).getByText("اعتمد على المصادر التالية.")).toBeTruthy();
    const d0 = views[0].querySelector("details")!, d1 = views[1].querySelector("details")!;
    expect(d0.open).toBe(true); expect(d1.open).toBe(false);
    expect(d0.querySelector("summary")!.textContent).toContain("المصادر المشتركة (4)");
    const cards = screen.getAllByRole("article");
    expect(cards.length).toBe(3);                                                         // every question keeps its own card
  });
  it("U7 sources: text as TEXT (markup shown literally), table with caption + column / row headers, image with the authored alt, code LTR and focusable", async () => {
    render(<StructuredExamSection section={studentSection(section())} sectionNumber={1} startIndex={0} answers={{}} {...handlers} />);
    const view = (await screen.findAllByTestId("scenario-view", {}, { timeout: 3000 }))[0];
    const sources = within(view).getAllByTestId("scenario-source");
    expect(sources.map(s => s.getAttribute("data-kind"))).toEqual(["text", "table", "image", "code"]);
    expect(within(sources[0]).getByText("<b>ليس HTML</b> فقرة للقراءة.")).toBeTruthy();
    expect(sources[0].querySelector("b")).toBeNull();
    const table = within(sources[1]).getByRole("table");
    expect(table.querySelector("caption")!.textContent).toBe("القياسات");
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["الزمن", "السرعة"]);
    expect(within(table).getAllByRole("rowheader").map(h => h.textContent)).toEqual(["أ", "ب"]);
    expect(within(sources[2]).getByRole("img", { name: "مخطط الشبكة المحلية" })).toBeTruthy();
    const pre = within(sources[3]).getByTestId("scenario-code").querySelector("pre")!;
    expect(pre.getAttribute("dir")).toBe("ltr"); expect(pre.getAttribute("lang")).toBe("en"); expect(pre.tabIndex).toBe(0);
    expect(pre.textContent).toBe("x = 1\nprint(x)\n");
  });
  it("U8 a scenario that fails ANY rule renders nothing on the client either (a stored smuggled field, a future version) — defense in depth", async () => {
    const raw = section({ scenarios: [SCN({ sources: [{ ...TEXT, answer: "LEAK" }] })] });
    render(<StructuredExamSection section={normalizeExamStructure(examOf(raw) as never).sections[0]} sectionNumber={1} startIndex={0} answers={{}} {...handlers} />);
    await tick(50);
    expect(screen.queryByTestId("scenario-view")).toBeNull();
    expect(document.body.textContent).not.toContain("LEAK");
    cleanup();
    render(<StructuredExamSection section={normalizeExamStructure(examOf(section({ scenarios: [SCN({ version: 2 })] })) as never).sections[0]} sectionNumber={1} startIndex={0} answers={{}} {...handlers} />);
    await tick(50);
    expect(screen.queryByTestId("scenario-view")).toBeNull();
  });
  it("U9 on a wide screen the sources start open on every member (the aside is sticky in CSS); the summary stays a native disclosure", async () => {
    stubMatchMedia(true);
    render(<StructuredExamSection section={studentSection(section())} sectionNumber={1} startIndex={0} answers={{}} {...handlers} />);
    const views = await screen.findAllByTestId("scenario-view", {}, { timeout: 3000 });
    expect(views.every(v => v.querySelector("details")!.open)).toBe(true);
  });
});

describe("19G-U10 — the paged student runtime: layout flag, first-page open / later collapsed, answer identity untouched", () => {
  const json = (status: number, body: unknown) => Promise.resolve({ ok: status < 300, status, json: async () => body } as Response);
  const state = { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: "2026-03-01T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, durationMinutes: 0 };
  let posts: { body: R }[] = [];
  beforeEach(() => {
    posts = [];
    (window as unknown as { scrollTo: (o: unknown) => void }).scrollTo = () => {};
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init && init.method) || "GET";
      const body = init && init.body ? JSON.parse(String(init.body)) : null;
      if (url.includes("/api/student-submission/")) {
        if (method === "GET") return json(200, { ok: true, state });
        posts.push({ body });
        return json(200, { ok: true, savedAt: "2026-03-01T10:01:02.000Z" });
      }
      return json(404, { ok: false });
    }) as unknown as typeof fetch;
  });
  it("U10 member pages carry the layout flag and the lazy block (open on the first member, collapsed on the second); the non-member page has neither; the saved answers are keyed by examQuestionId", async () => {
    const studentExam = sanitizeExamForStudent(examOf(section()));
    const assignment = { assignmentId: "asg1", title: "واجب", instructions: "", openAt: "", dueAt: "2026-05-01T10:30:00.000Z", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 3, totalMarks: 6, exam: { title: "امتحان", metadata: {}, presentationTheme: "default", ...studentExam } };
    render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={vi.fn()} onLogout={vi.fn()} />);
    const page = await screen.findByRole("region", { name: /السؤال 1 من 3/ }, { timeout: 3000 });
    expect(page.getAttribute("data-scenario-page")).toBe("true");
    const v1 = await screen.findByTestId("scenario-view", {}, { timeout: 3000 });
    expect(v1.querySelector("details")!.open).toBe(true);
    expect(page.querySelector(".iex-page-scenario .iex-scenario")).toBeTruthy();         // beside the question (grid on wide screens)
    fireEvent.click(screen.getByRole("radio", { name: "ب" }));
    await waitFor(() => expect(posts.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(Object.keys(posts[0].body.answers as R)).toEqual(["q1"]);
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    const page2 = await screen.findByRole("region", { name: /السؤال 2 من 3/ });
    expect(page2.getAttribute("data-scenario-page")).toBe("true");
    const v2 = await within(page2).findByTestId("scenario-view", {}, { timeout: 3000 });
    expect(v2.querySelector("details")!.open).toBe(false);                               // revisit without scrolling back
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    const page3 = await screen.findByRole("region", { name: /السؤال 3 من 3/ });
    expect(page3.getAttribute("data-scenario-page")).toBeNull();
    await tick(30);
    expect(within(page3).queryByTestId("scenario-view")).toBeNull();
  });
});

describe("19G-U11 — teacher review shows the scenario context above a linked response", () => {
  it("U11 the review renders the server's scenario context (title, instructions, sources) for linked questions only, tagged in the head", async () => {
    const scn = { ...SCN({ sources: [TEXT, TABLE] }), sectionId: "s1" };
    const data = { ok: true, scenarios: [scn], assignment: { assignmentId: "a1", title: "واجب", totalMarks: 6 }, student: { studentId: "s", studentName: "أحمد", studentCode: "1001" },
      attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:05:00.000Z", score: 2, totalMarks: 6, percentage: 33, manualReviewMarks: 2, finalized: false, teacherFeedback: "", gradingStatus: "pendingReview" },
      attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:05:00.000Z", score: 2, totalMarks: 6, percentage: 33, manualReviewMarks: 2, finalized: false, gradingStatus: "pendingReview" }],
      questions: [
        { questionId: "q1", questionNumber: 1, sectionId: "s1", scenarioId: "scn-1", text: "سؤال q1", marks: 2, type: "multipleChoice", options: [{ text: "أ" }, { text: "ب" }], fields: [], wordBank: [], parts: null, studentAnswer: { kind: "choice", index: 1 }, expectedAnswer: { correctOptionIndex: 1 }, autoGrade: { score: 2 }, manualScore: null, teacherComment: "" },
        { questionId: "q3", questionNumber: 3, sectionId: "s1", text: "سؤال q3", marks: 2, type: "shortAnswer", options: [], fields: [], wordBank: [], parts: null, studentAnswer: { kind: "text", value: "x" }, expectedAnswer: { text: "x" }, autoGrade: { score: 0, manualReview: true }, manualScore: null, teacherComment: "" }
      ] };
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => data } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s" initialAttempt={1} onClose={vi.fn()} onSaved={vi.fn()} />);
    const ctx = await screen.findByTestId("review-scenario", {}, { timeout: 3000 });
    expect(within(ctx).getByRole("heading", { level: 4 }).textContent).toContain("قراءة في الشبكات");
    expect(within(ctx).getByText("اعتمد على المصادر التالية.")).toBeTruthy();
    expect(within(ctx).getAllByTestId("scenario-source").map(s => s.getAttribute("data-kind"))).toEqual(["text", "table"]);
    expect(ctx.querySelector("details")!.open).toBe(true);
    const articles = document.querySelectorAll(".review-question");
    expect(articles).toHaveLength(2);
    expect(articles[0].textContent).toContain("ضمن سيناريو");
    expect(articles[1].textContent).not.toContain("ضمن سيناريو");
    expect(within(articles[1] as HTMLElement).queryByTestId("review-scenario")).toBeNull();
  });
});

describe("19G-U12 — AI scenario authoring in the Builder", () => {
  const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null, openResponse: null, codeStimulus: null, tableFill: null, coding: null };
  const AI_Q = (id: string, text: string) => ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "DHCP" }, { text: "DNS" }], answer: { correctOptionIndex: 0 } });
  const AI_SCN = { id: "ai-scenario", version: 1, title: "سيناريو DHCP", instructions: "اقرأ.", sources: [{ id: "ai-src-1", version: 1, kind: "text", title: "النص", text: "DHCP يوزّع العناوين." }], questionIds: ["ai-scn-q1", "ai-scn-q2"] };
  const ok = { ok: true as const, scenario: AI_SCN, questions: [AI_Q("ai-scn-q1", "س1"), AI_Q("ai-scn-q2", "س2")], notes: [] };
  it("U12 the action appears only with a scenario-capable service; the draft is re-verified, summarised and inserted as ONE update (fresh ids, remapped membership); a tampered draft is refused client-side", async () => {
    void NONE;
    const authorScenario = vi.fn(async () => ok);
    let hist!: Hist;
    function HostAi({ service }: { service: { author: () => Promise<never>; authorScenario?: typeof authorScenario } }) {
      const h = useStructuredExamHistory(); const booted = useRef(false);
      useEffect(() => { if (!booted.current) { booted.current = true; h.open(examOf(section({ scenarios: [] })), "saved"); } }, [h]);
      useEffect(() => { hist = h; });
      if (!h.present) return null;
      return <StructuredExamBuilder exam={h.present} onChange={h.update} onSave={() => {}} saving={false} onUndo={h.undo} onRedo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo} saveState={examSaveState(h.history, false)} backupStorage={null} onRecover={h.recover} autosaveDelayMs={5} aiAuthor={service as never} />;
    }
    render(<HostAi service={{ author: async () => { throw new Error("unused"); } }} />); await tick(30);
    expect(screen.queryByRole("button", { name: "✨ سيناريو بالذكاء الاصطناعي" })).toBeNull();
    cleanup();
    render(<HostAi service={{ author: async () => { throw new Error("unused"); }, authorScenario }} />); await tick(30);
    fireEvent.click(screen.getByRole("button", { name: "✨ سيناريو بالذكاء الاصطناعي" }));
    const d = await screen.findByRole("dialog", { name: "إنشاء سيناريو بالذكاء الاصطناعي" }, { timeout: 3000 });
    fireEvent.change(within(d).getByRole("textbox", { name: "اكتب طلب السيناريو" }), { target: { value: "سيناريو عن DHCP" } });
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء مسودة السيناريو" }));
    await tick(30);
    expect(authorScenario).toHaveBeenCalledWith({ request: "سيناريو عن DHCP" });
    expect(within(d).getByTestId("ai-scenario-summary").textContent).toContain("المصادر (1): نص");
    expect(within(d).getByTestId("ai-scenario-summary").textContent).toContain("الأسئلة (2)");
    const before = hist.history.past.length;
    fireEvent.click(within(d).getByRole("button", { name: "إدراج السيناريو في القسم" }));
    await tick(30);
    const s = hist.present!.sections[0] as BuilderSection;
    expect(hist.history.past.length).toBe(before + 1);                                     // ONE builder update
    expect(s.questions.map(x => x.examQuestionId).slice(0, 3)).toEqual(["q1", "q2", "q3"]);
    expect(s.questions.length).toBe(5);
    expect(s.questions[3].examQuestionId).not.toBe("ai-scn-q1");                           // fresh ids
    expect(s.scenarios!.length).toBe(1);
    expect(s.scenarios![0].id).not.toBe("ai-scenario"); expect(s.scenarios![0].sources[0].id).not.toBe("ai-src-1");
    expect(s.scenarios![0].questionIds).toEqual([s.questions[3].examQuestionId, s.questions[4].examQuestionId]);
    // a tampered server result (a smuggled key inside a source) is refused by the client-side re-verification and inserts nothing
    cleanup();
    const tampered = vi.fn(async () => ({ ...ok, scenario: { ...AI_SCN, sources: [{ ...AI_SCN.sources[0], answer: "LEAK" }] } }));
    render(<HostAi service={{ author: async () => { throw new Error("unused"); }, authorScenario: tampered }} />); await tick(30);
    fireEvent.click(screen.getByRole("button", { name: "✨ سيناريو بالذكاء الاصطناعي" }));
    const d2 = await screen.findByRole("dialog", { name: "إنشاء سيناريو بالذكاء الاصطناعي" }, { timeout: 3000 });
    fireEvent.change(within(d2).getByRole("textbox", { name: "اكتب طلب السيناريو" }), { target: { value: "x" } });
    fireEvent.click(within(d2).getByRole("button", { name: "إنشاء مسودة السيناريو" }));
    await tick(30);
    expect(within(d2).getByRole("alert").textContent).toContain("لا يجتاز التحقق");
    expect(within(d2).queryByTestId("ai-scenario-ready")).toBeNull();
    expect((hist.present!.sections[0] as BuilderSection).scenarios ?? []).toEqual([]);
  });
});
