// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import StructuredExamBuilder from "../StructuredExamBuilder";
import StudentQuestionCard from "../StudentQuestionCard";
import AssignmentReview from "../AssignmentReview";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { Answer } from "../answerState";
import { answered } from "../answerState";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer } from "./studentRegistry";
import { chipsFor, typeDescription, typeIcon } from "./typePresentation";
import { QUESTION_TYPE_CATALOG, questionTypeDefinition, supportsQuestionTypeVersion } from "../questionTypeCatalog";
import { defaultRubric } from "../rubricEngine";
import { defaultOpenResponseConfig } from "../openResponseQuestion";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 19E — the openResponse@1 UI: catalog / palette identity and defaults; the lazy student renderer (labelled multiline answer,
// RTL / LTR, character + word counter, hard maxChars, guidance-only minChars, an optional VISIBLE public rubric — never the private
// guidance or the model answer); the lazy teacher editor inside the REAL Builder (profiles, length bounds, the shared rubric editor:
// default rubric, criteria / levels add / remove / reorder, private guidance, visibility, model answer, inline issues, student preview —
// never raw JSON); the teacher RUBRIC grading inside the REAL AssignmentReview (one level per criterion, custom points only where
// allowed, live estimate, the save sends rubric selections — never a score — and partial grades are blocked); lazy-import guards.
// New-function suite (fail-first on ef679cc).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const GUIDE = "PRIVATE-GRADER-GUIDANCE-19E", MODEL = "MODEL-ANSWER-19E";
const lv = (id: string, label: string, points: number, description = "") => ({ id, label, points, description });
const RUBRIC = { v: 1, criteria: [
  { id: "accuracy", title: "الدقة", description: "صحة المقارنة", maxPoints: 4, allowCustomPoints: false, guidance: GUIDE, levels: [lv("full", "كامل", 4, "كل الفروق صحيحة"), lv("part", "جزئي", 2), lv("none", "غائب", 0)] },
  { id: "examples", title: "الأمثلة", description: "", maxPoints: 2, allowCustomPoints: true, guidance: "", levels: [lv("full", "مثالان", 2), lv("none", "لا أمثلة", 0)] }
] };
const CFG = { v: 1, profile: "compare", instructions: "قارن من حيث الموثوقية.", response: { minChars: 20, maxChars: 60 }, studentRubricVisibility: "visible" };
const openQ = (over: Record<string, unknown> = {}) => ({ ...newQuestion("openResponse" as never, { examQuestionId: "q1", text: "قارن بين TCP و UDP.", marks: 6 }), openResponse: clone(CFG), answer: { rubric: clone(RUBRIC), modelAnswer: MODEL }, ...over } as unknown as BuilderQuestion);
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-19E", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
const studentQ = (q: BuilderQuestion) => sanitizeExamForStudent(baseExam([q])).sections[0].questions[0];
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} />;
}
async function mountBuilder(initial: StructuredExam) { let hist!: Hist; render(<Host initial={initial} onHistory={h => { hist = h; }} />); await tick(30); return { hist: () => hist }; }
const firstQ = (h: Hist) => h.present!.sections[0].questions[0] as unknown as Record<string, any>;
function StudentHarness({ q, initial, disabled }: { q: Question; initial?: Answer; disabled?: boolean }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  return <><StudentQuestionCard q={q} index={0} id="q1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} disabled={disabled} /><output data-testid="answer">{JSON.stringify(a ?? null)}</output></>;
}
const answerOut = () => JSON.parse(screen.getByTestId("answer").textContent || "null");

describe("catalog, palette and defaults", () => {
  it("23 types; openResponse@1 is appended as a manual, partial-credit response type with a renderer and an editor for exactly v1", () => {
    expect(QUESTION_TYPE_CATALOG.length).toBe(23);
    expect(QUESTION_TYPE_CATALOG.at(-1)!.key).toBe("openResponse");
    const d = questionTypeDefinition("openResponse")!;
    expect(d.label).toBe("إجابة مفتوحة مع سلم تقييم");
    expect(supportsQuestionTypeVersion("openResponse", 1)).toBe(true); expect(supportsQuestionTypeVersion("openResponse", 2)).toBe(false);
    expect(chipsFor(d)).toEqual(expect.arrayContaining(["تصحيح يدوي", "علامة جزئية"]));
    expect(chipsFor(d)).not.toContain("يدعم السؤال المركب");
    expect(typeDescription(d).length).toBeGreaterThan(20); expect(typeIcon(d)).not.toBe("▫");
    expect(resolveStudentRenderer("openResponse", 1)).toBeDefined(); expect(resolveStudentRenderer("openResponse", 2)).toBeUndefined();
    expect(resolveAuthoringEditor("openResponse", 1)).toBeDefined();
    const q = newQuestion("openResponse" as never) as unknown as Record<string, unknown>;
    expect(q.openResponse).toEqual(defaultOpenResponseConfig()); expect(q.answer).toEqual({ rubric: { v: 1, criteria: [] }, modelAnswer: "" }); expect(q.questionTypeVersion).toBe(1);
  });
  it("the palette offers ONE open-response type under «إجابات» (no separate essay / compare / justify types); picking it mounts the lazy editor", async () => {
    const { hist } = await mountBuilder(baseExam([newQuestion("multipleChoice", { examQuestionId: "q0", text: "س" })]));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    expect(within(d).getAllByTestId("qt-card").length).toBe(23);
    const all = within(d).getAllByTestId("qt-card").map(c => c.getAttribute("data-type-key"));
    for (const k of ["essay", "compare", "justify", "explain", "analyze"]) expect(all).not.toContain(k);
    fireEvent.click(within(d).getByRole("tab", { name: "إجابات" })); await tick();
    fireEvent.click(within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "openResponse")!); await tick(50);
    const q = hist().present!.sections[0].questions[1] as unknown as Record<string, unknown>;
    expect(q.presentationType).toBe("openResponse"); expect(q.questionTypeVersion).toBe(1);
    const editor = await screen.findByTestId("qt-editor-openResponse", {}, { timeout: 3000 });
    expect(within(editor).getByTestId("rubric-empty")).toBeTruthy();
  });
});

describe("student open-response renderer", () => {
  it("a labelled multiline answer (dir auto, hard maxChars), instructions, profile, guidance-only minimum and a live counter; emits the text Answer verbatim", async () => {
    render(<StudentHarness q={studentQ(openQ())} />);
    const box = await screen.findByTestId("open-response-input", {}, { timeout: 3000 });
    expect(box.tagName).toBe("TEXTAREA"); expect(box.getAttribute("dir")).toBe("auto"); expect(box.getAttribute("maxLength")).toBe("60");
    expect(box.getAttribute("aria-labelledby")).toBeTruthy(); expect(box.getAttribute("aria-describedby")).toMatch(/or-hint/);
    expect(screen.getByTestId("open-response-instructions").textContent).toBe(CFG.instructions);
    expect(screen.getByTestId("open-response").textContent).toMatch(/مقارنة/);
    expect(screen.getByTestId("open-response").textContent).toMatch(/إرشاد فقط/);
    fireEvent.change(box, { target: { value: "TCP موثوق.\nUDP faster" } });
    expect(answerOut()).toEqual({ kind: "text", value: "TCP موثوق.\nUDP faster" });
    expect(screen.getByTestId("open-response-count").textContent).toMatch(/21 \/ 60/);
    expect(screen.getByTestId("open-response-count").textContent).toMatch(/4\s*كلمة/);
    expect(answered({ kind: "text", value: "  " })).toBe(false);
    fireEvent.change(box, { target: { value: "x".repeat(60) } });
    expect(screen.getByTestId("open-response-limit-status").textContent).toMatch(/الحد الأقصى/);
  });
  it("a VISIBLE rubric shows titles / descriptions / levels only — never the grader guidance or the model answer; hidden shows nothing", async () => {
    render(<StudentHarness q={studentQ(openQ())} />);
    const rubric = await screen.findByTestId("open-response-rubric", {}, { timeout: 3000 });
    expect(rubric.textContent).toMatch(/الدقة/); expect(rubric.textContent).toMatch(/كل الفروق صحيحة/); expect(rubric.textContent).toMatch(/6 نقطة/);
    expect(document.body.textContent).not.toMatch(new RegExp(GUIDE + "|" + MODEL));
    cleanup();
    render(<StudentHarness q={studentQ(openQ({ openResponse: { ...CFG, studentRubricVisibility: "hidden" } }))} />);
    await screen.findByTestId("open-response-input", {}, { timeout: 3000 });
    expect(screen.queryByTestId("open-response-rubric")).toBeNull();
  });
  it("restores a saved answer, is read-only when disabled, and a malformed config is an explicit unavailable state", async () => {
    render(<StudentHarness q={studentQ(openQ())} initial={{ kind: "text", value: "محفوظ" }} disabled />);
    const box = await screen.findByTestId("open-response-input", {}, { timeout: 3000 }) as HTMLTextAreaElement;
    expect(box.value).toBe("محفوظ"); expect(box.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "تغيير" } });
    expect(answerOut()).toEqual({ kind: "text", value: "محفوظ" });
    cleanup();
    render(<StudentHarness q={{ ...studentQ(openQ()), openResponse: { ...CFG, modelAnswer: "x" } as never }} />);
    expect((await screen.findByTestId("open-response-unavailable", {}, { timeout: 3000 })).textContent).toMatch(/أبلغ معلّمك/);
  });
});

describe("teacher editor inside the REAL Builder", () => {
  it("default rubric in one click; criteria / levels edited, reordered, added and removed; profile never touches the rubric; private fields stay under answer", async () => {
    const { hist } = await mountBuilder(baseExam([newQuestion("openResponse" as never, { examQuestionId: "q1", text: "قارن بين TCP و UDP.", marks: 10 }) as BuilderQuestion]));
    const editor = await screen.findByTestId("qt-editor-openResponse", {}, { timeout: 3000 });
    expect(within(editor).getByTestId("open-response-issues").textContent).toMatch(/معيار/);
    fireEvent.click(within(editor).getByRole("button", { name: "استخدام سلم التقييم المقترح" })); await tick();
    expect(firstQ(hist()).answer.rubric).toEqual(defaultRubric());
    expect(within(editor).queryByTestId("open-response-issues")).toBeNull();
    fireEvent.change(within(editor).getByRole("textbox", { name: "عنوان المعيار 1" }), { target: { value: "الدقة العلمية" } }); await tick();
    expect(firstQ(hist()).answer.rubric.criteria[0].title).toBe("الدقة العلمية");
    fireEvent.change(within(editor).getByRole("textbox", { name: /إرشاد خاص بالمصحح للمعيار 1/ }), { target: { value: GUIDE } }); await tick();
    expect(firstQ(hist()).answer.rubric.criteria[0].guidance).toBe(GUIDE);
    fireEvent.click(within(editor).getByRole("button", { name: "نقل المعيار 2 للأعلى" })); await tick();
    expect(firstQ(hist()).answer.rubric.criteria.map((c: { id: string }) => c.id)).toEqual(["reasoning", "content", "organization", "terminology"]);
    fireEvent.click(within(editor).getByRole("button", { name: "حذف المعيار 4" })); await tick();
    expect(firstQ(hist()).answer.rubric.criteria).toHaveLength(3);
    fireEvent.click(within(editor).getByRole("button", { name: "+ معيار" })); await tick();
    expect(firstQ(hist()).answer.rubric.criteria).toHaveLength(4);
    // an empty new criterion title is reported next to its field (aria-invalid + description)
    const t4 = within(editor).getByRole("textbox", { name: "عنوان المعيار 4" });
    expect(t4.getAttribute("aria-invalid")).toBe("true"); expect(document.getElementById(t4.getAttribute("aria-describedby")!)!.textContent).toMatch(/فارغ/);
    fireEvent.change(t4, { target: { value: "الأمثلة" } }); await tick();
    // a level above its criterion maximum is refused by the canonical validator (never repaired)
    fireEvent.change(within(editor).getAllByRole("spinbutton", { name: "درجة المستوى 1" })[0], { target: { value: "9" } }); await tick();
    expect(within(editor).getByTestId("open-response-issues").textContent).toMatch(/المعيار 1 · المستوى 1/);
    fireEvent.change(within(editor).getAllByRole("spinbutton", { name: "درجة المستوى 1" })[0], { target: { value: "3" } }); await tick();
    const before = clone(firstQ(hist()).answer.rubric);
    fireEvent.change(within(editor).getByRole("combobox", { name: "نمط السؤال" }), { target: { value: "justify" } }); await tick();
    expect(firstQ(hist()).openResponse.profile).toBe("justify"); expect(firstQ(hist()).openResponse.response.maxChars).toBe(2000);
    expect(firstQ(hist()).answer.rubric).toEqual(before);
    fireEvent.change(within(editor).getByRole("combobox", { name: "ظهور سلم التقييم للطالب" }), { target: { value: "visible" } }); await tick();
    fireEvent.change(within(editor).getByRole("textbox", { name: "الإجابة النموذجية" }), { target: { value: MODEL } }); await tick();
    const q = firstQ(hist());
    expect(q.openResponse).toEqual({ v: 1, profile: "justify", instructions: "", response: { minChars: 0, maxChars: 2000 }, studentRubricVisibility: "visible" });
    expect(q.answer.modelAnswer).toBe(MODEL);
    expect(JSON.stringify(q.openResponse)).not.toMatch(new RegExp(GUIDE + "|" + MODEL));
    expect(editor.textContent).not.toMatch(/"criteria"|"levels"|"maxPoints"|\{"v"/);
  });
  it("the student preview shows the visible public rubric — never the grader guidance or the model answer", async () => {
    await mountBuilder(baseExam([openQ()]));
    const editor = await screen.findByTestId("qt-editor-openResponse", {}, { timeout: 3000 });
    fireEvent.click(within(editor).getByRole("button", { name: "معاينة الطالب" })); await tick(30);
    const preview = await within(editor).findByTestId("open-response-student-preview", {}, { timeout: 3000 });
    expect(within(preview).getByTestId("open-response-rubric").textContent).toMatch(/الدقة/);
    expect(preview.textContent).not.toMatch(new RegExp(GUIDE + "|" + MODEL));
    expect(within(preview).getByTestId("open-response-preview-note")).toBeTruthy();
  });
});

describe("teacher rubric grading inside the REAL AssignmentReview", () => {
  const review = (q: Record<string, unknown>) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 8 }, student: { studentId: "s1", studentName: "سارة", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 2, totalMarks: 8, percentage: 25, manualReviewMarks: 6, finalized: false, gradingStatus: "pendingReview", teacherFeedback: "" }, attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 2, totalMarks: 8, percentage: 25, manualReviewMarks: 6, finalized: false, gradingStatus: "pendingReview" }], questions: [
    { questionId: "o1", questionNumber: 1, text: "قارن", marks: 6, type: "openResponse", questionTypeVersion: 1, openResponse: CFG, studentAnswer: { kind: "text", value: "TCP موثوق و UDP أسرع." }, expectedAnswer: { rubric: RUBRIC, modelAnswer: MODEL }, autoGrade: { score: 0, manualReview: true }, manualScore: null, teacherComment: "", rubricReview: null, ...q },
    { questionId: "sa1", questionNumber: 2, text: "اكتب x", marks: 2, type: "shortAnswer", studentAnswer: { kind: "text", value: "x" }, expectedAnswer: { text: "x" }, autoGrade: { score: 2, manualReview: false }, manualScore: null, teacherComment: "" }
  ] });
  const mount = async (q: Record<string, unknown> = {}) => {
    const posts: unknown[] = [];
    globalThis.fetch = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return Promise.resolve({ status: 200, ok: true, json: async () => ({ ok: true, result: { score: 6, totalMarks: 8, percentage: 75, manualReviewMarks: 0, finalized: true } }) } as Response); }
      return Promise.resolve({ status: 200, ok: true, json: async () => review(q) } as Response);
    }) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const panel = await screen.findByTestId("rubric-grading", {}, { timeout: 3000 });
    return { panel, posts };
  };
  it("the student's text, the rubric with private guidance and the model answer (teacher only); one level per criterion; a live estimate; no free score box", async () => {
    const { panel } = await mount();
    expect(within(panel).getByTestId("rubric-student-answer").textContent).toBe("TCP موثوق و UDP أسرع.");
    expect(panel.textContent).toMatch(new RegExp(GUIDE)); expect(panel.textContent).toMatch(new RegExp(MODEL));
    const criteria = within(panel).getAllByTestId("rubric-grade-criterion");
    expect(criteria).toHaveLength(2);
    expect(within(panel).getByTestId("rubric-grade-summary").textContent).toMatch(/0 \/ 2/);
    fireEvent.click(within(criteria[0]).getByRole("radio", { name: /جزئي/ })); await tick();
    fireEvent.click(within(criteria[1]).getByRole("radio", { name: /مثالان/ })); await tick();
    expect(within(panel).getByTestId("rubric-grade-summary").textContent).toMatch(/4 \/ 6/);
    expect(screen.getByTestId("rubric-score-row").textContent).toMatch(/4 \/ 6/);
    expect(within(criteria[0]).queryByRole("spinbutton")).toBeNull();                         // custom points only where allowed
    expect(within(criteria[1]).getByRole("spinbutton")).toBeTruthy();
  });
  it("save sends the rubric SELECTIONS (never a score) for the open response, and the ordinary override for other questions", async () => {
    const { panel, posts } = await mount();
    const criteria = within(panel).getAllByTestId("rubric-grade-criterion");
    fireEvent.click(within(criteria[0]).getByRole("radio", { name: /كامل/ })); await tick();
    fireEvent.change(within(criteria[1]).getByRole("spinbutton"), { target: { value: "1.5" } }); await tick();
    fireEvent.click(screen.getByRole("button", { name: /حفظ واعتماد التصحيح/ })); await tick(30);
    expect(posts).toHaveLength(1);
    const body = posts[0] as { overrides: Record<string, Record<string, unknown>> };
    expect(body.overrides.o1).toEqual({ rubricAwards: { accuracy: { levelId: "full" }, examples: { points: 1.5 } }, comment: "" });
    expect(body.overrides.o1.score).toBeUndefined();
  });
  it("a partially graded rubric blocks the save with a precise message; nothing is sent", async () => {
    const { panel, posts } = await mount();
    fireEvent.click(within(within(panel).getAllByTestId("rubric-grade-criterion")[0]).getByRole("radio", { name: /جزئي/ })); await tick();
    fireEvent.click(screen.getByRole("button", { name: /حفظ واعتماد التصحيح/ })); await tick(30);
    expect(posts).toHaveLength(0);
    expect(document.body.textContent).toMatch(/أكمل اختيار مستوى صالح لكل معيار في السؤال 1/);
  });
  it("stored selections are restored; a stored selection that no longer binds to the published rubric is flagged stale and cleared; a malformed rubric is explicit", async () => {
    const { panel } = await mount({ manualScore: 4, rubricReview: { v: 1, awards: { accuracy: { levelId: "part", points: 2 }, examples: { levelId: "full", points: 2 } }, awarded: 4, total: 6 } });
    expect((within(within(panel).getAllByTestId("rubric-grade-criterion")[0]).getByRole("radio", { name: /جزئي/ }) as HTMLInputElement).checked).toBe(true);
    expect(within(panel).getByTestId("rubric-grade-summary").textContent).toMatch(/4 \/ 6/);
    cleanup();
    const stale = await mount({ manualScore: 4, rubricReview: { v: 1, awards: { accuracy: { levelId: "gone", points: 2 }, examples: { levelId: "full", points: 2 } } } });
    expect(within(stale.panel).getByTestId("rubric-stale")).toBeTruthy();
    expect(within(stale.panel).getByTestId("rubric-grade-summary").textContent).toMatch(/0 \/ 2/);
    // the stale selection is never sent and never blocks the save (nothing to grade yet ⇒ no override for o1)
    fireEvent.click(screen.getByRole("button", { name: /حفظ واعتماد التصحيح/ })); await tick(30);
    expect(stale.posts).toHaveLength(1);
    expect((stale.posts[0] as { overrides: Record<string, unknown> }).overrides.o1).toBeUndefined();
    cleanup();
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => review({ expectedAnswer: { rubric: { ...RUBRIC, v: 2 }, modelAnswer: "" } }) } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    expect((await screen.findByTestId("rubric-authority-invalid", {}, { timeout: 3000 })).textContent).toMatch(/لا يمكن احتساب درجة/);
  });
});

describe("lazy loading and module hygiene", () => {
  it("the editor / renderer / grading panel are reached ONLY through import() edges; no HTML injection / eval / network / Math.random in the new modules; pure models stay pure", () => {
    const srcFiles: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|dist/.test(p)) walk(p); } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) srcFiles.push(p); } };
    walk(path.join(repo, "src"));
    const staticImporters = (name: string) => srcFiles.filter(f => new RegExp("^import[^;]*from\\s*\"[^\"]*" + name + "\"", "m").test(fs.readFileSync(f, "utf8"))).map(f => path.relative(repo, f));
    for (const m of ["editors/OpenResponseEditor", "student/OpenResponseResponse", "openResponse/RubricGradingPanel\"", "openResponse/RubricEditor"]) expect(staticImporters(m).filter(f => !/OpenResponseEditor\.tsx$/.test(f) || !/RubricEditor/.test(m)), m).toEqual([]);
    expect(staticImporters("openResponse/RubricEditor")).toEqual(["src/questionTypes/editors/OpenResponseEditor.tsx"]);
    const strip = (t: string) => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const f of ["src/openResponse/OpenResponseView.tsx", "src/openResponse/RubricEditor.tsx", "src/openResponse/RubricGradingPanel.tsx", "src/questionTypes/editors/OpenResponseEditor.tsx", "src/questionTypes/student/OpenResponseResponse.tsx", "src/rubricEngine.ts", "src/openResponseQuestion.ts"])
      expect(strip(fs.readFileSync(path.join(repo, f), "utf8")), f).not.toMatch(/dangerouslySetInnerHTML|innerHTML|\beval\s*\(|new Function|fetch\(|XMLHttpRequest|localStorage|Math\.random|https?:\/\//);
    for (const f of ["src/rubricEngine.ts", "src/openResponseQuestion.ts"]) expect(fs.readFileSync(path.join(repo, f), "utf8"), f).not.toMatch(/from "react"|document\.|window\.|fetch|openai|callTextJson/i);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/studentRegistry.tsx"), "utf8")).toMatch(/registerStudentRenderer\("openResponse", 1, lazy\(\(\) => import\("\.\/student\/OpenResponseResponse"\)\)\)/);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/authoringRegistry.tsx"), "utf8")).toMatch(/registerAuthoringEditor\("openResponse", 1, lazy\(\(\) => import\("\.\/editors\/OpenResponseEditor"\)\)\)/);
    expect(fs.readFileSync(path.join(repo, "src/AssignmentReview.tsx"), "utf8")).toMatch(/const RubricGradingPanel=lazy\(lazyWithRetry\(\(\)=>import\("\.\/openResponse\/RubricGradingPanel"\),"teacher-rubric-grading"\)\)/);
    expect(fs.readFileSync(path.join(repo, "scripts/check-bundle-budget.mjs"), "utf8")).toMatch(/OPEN_RESPONSE_SIGNATURES/);
  });
});
