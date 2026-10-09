// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import StructuredExamBuilder from "../StructuredExamBuilder";
import StudentQuestionCard from "../StudentQuestionCard";
import QuestionBodyEditor from "../QuestionBodyEditor";
import ExamPreview from "../ExamPreview";
import AssignmentReview from "../AssignmentReview";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam, BuilderQuestion } from "../examTypes";
import { newQuestion, cloneQuestionWithNewIds } from "../examBuilderState";
import type { Answer } from "../answerState";
import { answered } from "../answerState";
import { resolveAuthoringEditor } from "./authoringRegistry";
import { resolveStudentRenderer, studentUnsupported } from "./studentRegistry";
import { chipsFor, typeDescription, typeIcon } from "./typePresentation";
import { QUESTION_TYPE_CATALOG, questionTypeDefinition, supportsQuestionTypeVersion } from "../questionTypeCatalog";
import { validateQuestionTypeNode } from "../questionTypeValidation";
import { evaluateExamFinalization } from "../examFinalization";
import { parseStructuredExamJson } from "../structuredExamImport";
import { toSafePreviewExam } from "../examPreviewModel";
import { validateInlineClozeAnswerKey, validateInlineClozeConfig } from "../inlineClozeQuestion";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";
import type { Question } from "../studentQuestionTypes";
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

// Phase 19A — the inlineCloze@1 UI: catalog / palette identity, the lazy student renderer (controls INLINE inside the passage,
// RTL passage with auto-direction answers, keyboard-labelled inputs and selects, bounded dynamic width, draft restore, read-only),
// secrecy in the DOM / sanitizer / preview, the token editor inside the REAL Builder (insert a text blank or a dropdown at the
// cursor, configure accepted answers / options / the correct option, remove a blank, scoring mode, inline canonical validation,
// stable blank identity while the passage is edited, undo / clone / JSON round-trip), the teacher review projection and the
// lazy-import guard. New-function suite (fail-first on 91b1f3d8: the type is unknown to the catalog and the registries).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CFG = {
  v: 1,
  segments: [
    { type: "text", text: "يعمل البروتوكول " },
    { type: "blank", id: "b1", control: "text" },
    { type: "text", text: " في الطبقة الثالثة، وعنوان MAC يعمل في " },
    { type: "blank", id: "b2", control: "dropdown", options: [{ id: "o1", label: "Physical" }, { id: "o2", label: "Data Link" }, { id: "o3", label: "Network" }] },
    { type: "text", text: "." }
  ]
};
const KEY = { scoring: "proportional", blanks: { b1: { accepted: ["IP", "Internet Protocol"], caseSensitive: false }, b2: { correctOptionId: "o2" } } };
const CANARIES = /Internet Protocol|correctOptionId|"accepted"|caseSensitive|scoring/;
const teacherQ = (over: Record<string, unknown> = {}) => ({ ...newQuestion("inlineCloze" as never, { examQuestionId: "c1", text: "أكمل الفقرة.", marks: 4 }), inlineCloze: CFG, answer: KEY, ...over } as unknown as BuilderQuestion);
const baseExam = (questions: BuilderQuestion[]): StructuredExam => ({ examId: "EXAM-19A", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }] });
const studentQ = (over: Record<string, unknown> = {}) => sanitizeExamForStudent(baseExam([teacherQ(over)])).sections[0].questions[0];
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, onHistory }: { initial: StructuredExam; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} />;
}
async function mountBuilder(initial: StructuredExam) { let hist!: Hist; render(<Host initial={initial} onHistory={h => { hist = h; }} />); await tick(30); return { hist: () => hist }; }
const firstQ = (h: Hist) => h.present!.sections[0].questions[0] as unknown as { inlineCloze: typeof CFG; answer: typeof KEY } & Record<string, unknown>;

function StudentHarness({ q, initial, wrap, disabled }: { q: Question; initial?: Answer; wrap?: (n: ReactNode) => ReactNode; disabled?: boolean }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  const card = <StudentQuestionCard q={q} index={0} id="c1" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} disabled={disabled} />;
  return <>{wrap ? wrap(card) : card}<output data-testid="answer">{JSON.stringify(a ?? null)}</output></>;
}
const answerOut = () => JSON.parse(screen.getByTestId("answer").textContent || "null");
const passage = async () => screen.findByTestId("cloze-passage", {}, { timeout: 3000 });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("catalog, defaults, finalization", () => {
  it("catalog row: response family, auto-graded, partial credit, offline, NOT compound; responseKinds ['fields']; version 1 only; palette presentation", () => {
    const d = questionTypeDefinition("inlineCloze")!;
    expect(d).toMatchObject({ key: "inlineCloze", version: 1, label: "إكمال نص تفاعلي", category: "response", gradingMode: "auto", legacy: false });
    expect(d.capabilities).toMatchObject({ autoGrading: true, partialCredit: true, offline: true, compoundPart: false, interactive: false, manualGrading: false, requiresImage: false });
    expect(d.responseKinds).toEqual(["fields"]);
    expect(QUESTION_TYPE_CATALOG.length).toBe(26);   /* 20D adds composite (after compound) · 21A.1 adds chartSelection (after composite) */ expect(QUESTION_TYPE_CATALOG.at(-6)!.key).toBe("inlineCloze"); expect(QUESTION_TYPE_CATALOG.at(-5)!.key).toBe("parametricNumeric");   // 19B appends parametricNumeric · 19D appends hotspot / labelDiagram · 19E appends openResponse
    expect(supportsQuestionTypeVersion("inlineCloze", 1)).toBe(true); expect(supportsQuestionTypeVersion("inlineCloze", 2)).toBe(false);
    expect(typeDescription(d)).toMatch(/قائمة منسدلة/); expect(typeIcon(d)).toBe("▭▾"); expect(chipsFor(d)).toEqual(["تصحيح تلقائي", "علامة جزئية"]);
    expect(resolveAuthoringEditor("inlineCloze", 1)).toBeTruthy(); expect(resolveStudentRenderer("inlineCloze", 1)?.key).toBe("inlineCloze");
    expect(resolveAuthoringEditor("inlineCloze", 2)).toBeUndefined(); expect(resolveStudentRenderer("inlineCloze", 2)).toBeUndefined();
    expect(questionTypeDefinition("fillBlank")).toMatchObject({ key: "fillBlank", legacy: true });                     // legacy fillBlank untouched
  });
  it("newQuestion seeds a one-blank passage at version 1 whose empty accepted list blocks finalization; a complete question finalizes; a compound part is refused", () => {
    const q = newQuestion("inlineCloze" as never) as unknown as Record<string, unknown>;
    expect(q.questionTypeVersion).toBe(1);
    expect(validateInlineClozeConfig(q.inlineCloze).ok).toBe(true);
    expect(validateQuestionTypeNode(q, "inlineCloze", 1).map(i => i.code)).toEqual(["CLOZE_TEXT_ACCEPTED_EMPTY"]);
    expect(validateQuestionTypeNode(teacherQ() as unknown as Record<string, unknown>, "inlineCloze", 1)).toEqual([]);
    expect(validateQuestionTypeNode(teacherQ() as unknown as Record<string, unknown>, "inlineCloze", 1, { part: true }).map(i => i.code)).toEqual(["TYPE_NOT_COMPOUND_CAPABLE"]);
    const blocked = evaluateExamFinalization(baseExam([teacherQ({ answer: { ...KEY, scoring: "bonus" } })]) as never);
    expect(blocked.canFinalize).toBe(false); expect(JSON.stringify(blocked.blockers)).toContain("CLOZE_SCORING_UNKNOWN");
    const fine = evaluateExamFinalization(baseExam([teacherQ()]) as never);
    expect(JSON.stringify(fine.blockers)).not.toMatch(/CLOZE/); expect(fine.structuralErrors).toEqual([]);
  });
});

describe("student renderer — inline controls in the natural reading flow", () => {
  it("text blank and dropdown render INLINE between the passage text, in order; typing / selecting emits a fields Answer keyed by blank id", async () => {
    render(<StudentHarness q={studentQ()} />);
    const p = await passage();
    const input = within(p).getByRole("textbox", { name: "الفراغ 1" }) as HTMLInputElement;
    const select = within(p).getByRole("combobox", { name: "الفراغ 2" }) as HTMLSelectElement;
    expect(p.textContent).toContain("يعمل البروتوكول"); expect(p.textContent).toContain("وعنوان MAC يعمل في");
    expect(input.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getComputedStyle(p).display).not.toBe("flex");
    fireEvent.change(input, { target: { value: "IP" } });
    fireEvent.change(select, { target: { value: "o2" } });
    expect(answerOut()).toEqual({ kind: "fields", values: { b1: "IP", b2: "o2" } });
    expect(answered(answerOut())).toBe(true);
    expect([...select.options].map(o => o.textContent)).toEqual(["اختر…", "Physical", "Data Link", "Network"]);
  });
  it("RTL passage, auto-direction answers: the typed English answer is never forced RTL", async () => {
    render(<StudentHarness q={studentQ()} wrap={n => <main dir="rtl">{n}</main>} />);
    const p = await passage();
    expect(p.getAttribute("dir")).toBe("auto");
    for (const el of [within(p).getByRole("textbox", { name: "الفراغ 1" }), within(p).getByRole("combobox", { name: "الفراغ 2" })]) expect(el.getAttribute("dir")).toBe("auto");
    const css = fs.readFileSync(path.join(repo, "src/inlineCloze/inlineCloze.css"), "utf8");
    expect(css).toMatch(/\.cloze-input\s*\{[^}]*unicode-bidi:\s*plaintext/);
  });
  it("mobile-safe dynamic width: grows with the student's own text between bounds, never wider than the line; never derived from the key", async () => {
    render(<StudentHarness q={studentQ()} />);
    const input = within(await passage()).getByRole("textbox", { name: "الفراغ 1" }) as HTMLInputElement;
    const w0 = input.style.width;
    fireEvent.change(input, { target: { value: "Internet Protocol version four" } });
    expect(parseFloat(input.style.width)).toBeGreaterThan(parseFloat(w0));
    fireEvent.change(input, { target: { value: "x".repeat(300) } });
    expect(input.style.width).toBe("24ch");
    expect(input.maxLength).toBe(500);
    const css = fs.readFileSync(path.join(repo, "src/inlineCloze/inlineCloze.css"), "utf8");
    expect(css).toMatch(/\.cloze-input\s*\{[^}]*max-width:\s*100%/); expect(css).toMatch(/\.cloze-select\s*\{[^}]*max-width:\s*100%/);
  });
  it("draft restore: a stored fields answer pre-fills every control; disabled renders read-only controls and emits nothing", async () => {
    render(<StudentHarness q={studentQ()} initial={{ kind: "fields", values: { b1: "Internet Protocol", b2: "o3" } }} disabled />);
    const p = await passage();
    const input = within(p).getByRole("textbox", { name: "الفراغ 1" }) as HTMLInputElement, select = within(p).getByRole("combobox", { name: "الفراغ 2" }) as HTMLSelectElement;
    expect(input.value).toBe("Internet Protocol"); expect(select.value).toBe("o3");
    expect(input.disabled).toBe(true); expect(select.disabled).toBe(true);
  });
  it("secrecy: the sanitized question, the rendered DOM and the emitted Answer carry no accepted answer and no correct-option marker", async () => {
    const sq = studentQ();
    expect(JSON.stringify(sq)).not.toMatch(CANARIES);
    render(<StudentHarness q={sq} />);
    const p = await passage();
    expect(document.body.innerHTML).not.toMatch(/Internet Protocol|data-correct|correctOptionId/);
    fireEvent.change(within(p).getByRole("textbox", { name: "الفراغ 1" }), { target: { value: "x" } });
    expect(JSON.stringify(answerOut())).not.toMatch(CANARIES);
  });
  it("a malformed public config (or inlineCloze@2) is never rendered as a working passage: an explicit unavailable / unsupported notice", async () => {
    const broken = { ...studentQ(), inlineCloze: { v: 1, segments: [{ type: "blank", id: "b1", control: "slider" }] } } as unknown as Question;
    render(<StudentHarness q={broken} />);
    expect(await screen.findByTestId("cloze-unavailable", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByTestId("cloze-passage")).toBeNull();
    cleanup();
    expect(studentUnsupported("inlineCloze", 2)).toBe(true);
    render(<QuestionBodyEditor node={teacherQ({ questionTypeVersion: 2 }) as never} type="inlineCloze" onChange={() => {}} />);
    expect(screen.getByTestId("qt-unsupported").textContent).toMatch(/إصدار غير مدعوم/);
  });
  it("the teacher preview model scrubs the key; ExamPreview renders the SAME passage with the preview notice", async () => {
    const safe = toSafePreviewExam(baseExam([teacherQ()]) as never);
    expect(JSON.stringify(safe)).not.toMatch(/Internet Protocol|correctOptionId/);
    render(<ExamPreview exam={baseExam([teacherQ()]) as never} onClose={() => {}} />);
    expect(await screen.findByTestId("cloze-passage", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByTestId("cloze-preview-note")).toBeTruthy();
    expect(document.body.innerHTML).not.toMatch(/Internet Protocol/);
  });
});

describe("authoring editor inside the REAL Builder", () => {
  it("adding «إكمال نص تفاعلي» from the palette creates inlineCloze@1 with defaults and mounts the lazy editor with the canonical blocker", async () => {
    const { hist } = await mountBuilder(baseExam([newQuestion("multipleChoice", { examQuestionId: "q1", text: "س" })]));
    fireEvent.click(screen.getByRole("button", { name: "+ إضافة سؤال" }));
    const d = await screen.findByRole("dialog", { name: "إضافة سؤال" }); await tick(30);
    expect(within(d).getAllByTestId("qt-card").length).toBe(26);   /* 20D adds composite · 21A.1 adds chartSelection */                                    // 19B adds parametricNumeric
    fireEvent.click(within(d).getByRole("tab", { name: "إجابات" })); await tick();
    const card = within(d).getAllByTestId("qt-card").find(c => c.getAttribute("data-type-key") === "inlineCloze")!;
    expect(card.textContent).toContain("إكمال نص تفاعلي");
    fireEvent.click(card); await tick(50);
    const q = hist().present!.sections[0].questions[1] as unknown as Record<string, unknown>;
    expect(q.presentationType).toBe("inlineCloze"); expect(q.questionTypeVersion).toBe(1);
    const editor = await screen.findByTestId("qt-editor-inlineCloze", {}, { timeout: 3000 });
    expect(within(editor).getByTestId("cloze-issues").textContent).toMatch(/إجابة مقبولة/);
  });
  it("insert a text blank and a dropdown AT THE CURSOR, configure them, remove one; blank ids stay stable while the passage is edited; scoring mode", async () => {
    const { hist } = await mountBuilder(baseExam([teacherQ()]));
    const editor = await screen.findByTestId("qt-editor-inlineCloze", {}, { timeout: 3000 });
    // edit the passage text: identities of b1 / b2 do not move
    const t0 = within(editor).getByRole("textbox", { name: "نص المقطع 1" }) as HTMLTextAreaElement;
    fireEvent.change(t0, { target: { value: "يعمل بروتوكول الإنترنت " } }); await tick();
    expect(firstQ(hist()).inlineCloze.segments.filter(s => s.type === "blank").map(s => (s as { id: string }).id)).toEqual(["b1", "b2"]);
    // insert a text blank in the middle of the last text piece
    const last = within(editor).getByRole("textbox", { name: "نص المقطع 3" }) as HTMLTextAreaElement;
    fireEvent.change(last, { target: { value: ". الأمر هو  للعرض." } }); await tick();
    const lastNow = within(editor).getByRole("textbox", { name: "نص المقطع 3" }) as HTMLTextAreaElement;
    lastNow.setSelectionRange(11, 11);
    fireEvent.click(within(editor).getByRole("button", { name: "إدراج فراغ كتابة عند المؤشر في المقطع 3" })); await tick();
    let cfg = firstQ(hist()).inlineCloze;
    expect(cfg.segments.slice(-3)).toEqual([{ type: "text", text: ". الأمر هو " }, { type: "blank", id: "b3", control: "text" }, { type: "text", text: " للعرض." }]);
    fireEvent.change(within(editor).getByRole("textbox", { name: "الإجابة المقبولة 1 للفراغ 3" }), { target: { value: "show vlan brief" } }); await tick();
    fireEvent.click(within(editor).getByRole("button", { name: "+ إجابة مقبولة للفراغ 3" })); await tick();
    fireEvent.change(within(editor).getByRole("textbox", { name: "الإجابة المقبولة 2 للفراغ 3" }), { target: { value: "sh vlan br" } }); await tick();
    fireEvent.click(within(editor).getByRole("checkbox", { name: "مطابقة حالة الأحرف للفراغ 3" })); await tick();
    expect(firstQ(hist()).answer.blanks).toMatchObject({ b3: { accepted: ["show vlan brief", "sh vlan br"], caseSensitive: true } });
    // insert a dropdown at the start of the first piece, give it options and a correct choice
    const first = within(editor).getByRole("textbox", { name: "نص المقطع 1" }) as HTMLTextAreaElement;
    first.setSelectionRange(0, 0);
    fireEvent.click(within(editor).getByRole("button", { name: "إدراج قائمة منسدلة عند المؤشر في المقطع 1" })); await tick();
    cfg = firstQ(hist()).inlineCloze;
    expect(cfg.segments[0]).toMatchObject({ type: "blank", id: "b4", control: "dropdown" });
    // blank labels are POSITIONAL (what the teacher and the student see): b4 now opens the passage, so it is «الفراغ 1»
    fireEvent.change(within(editor).getByRole("textbox", { name: "الخيار 1 للفراغ 1" }), { target: { value: "TCP/IP" } }); await tick();
    fireEvent.change(within(editor).getByRole("textbox", { name: "الخيار 2 للفراغ 1" }), { target: { value: "OSI" } }); await tick();
    fireEvent.click(within(editor).getByRole("radio", { name: "الخيار 2 هو الصحيح للفراغ 1" })); await tick();
    const k = validateInlineClozeAnswerKey(firstQ(hist()).answer, firstQ(hist()).inlineCloze);
    expect(k.ok).toBe(true);
    expect(k.ok && k.key.blanks.b4).toEqual({ control: "dropdown", correctOptionId: "o2" });
    // remove b1 (now the second blank in the passage): neighbouring text pieces merge, b2..b4 keep their ids, b1's key is gone
    fireEvent.click(within(editor).getByRole("button", { name: "حذف الفراغ 2" })); await tick();
    cfg = firstQ(hist()).inlineCloze;
    expect(cfg.segments.filter(s => s.type === "blank").map(s => (s as { id: string }).id)).toEqual(["b4", "b2", "b3"]);
    expect(Object.keys(firstQ(hist()).answer.blanks).sort()).toEqual(["b2", "b3", "b4"]);
    expect(cfg.segments.some(s => s.type === "text" && String(s.text).includes("يعمل بروتوكول الإنترنت  في الطبقة الثالثة"))).toBe(true);
    // scoring mode
    fireEvent.change(within(editor).getByRole("combobox", { name: "طريقة الاحتساب" }), { target: { value: "allOrNothing" } }); await tick();
    expect(firstQ(hist()).answer.scoring).toBe("allOrNothing");
    expect(within(editor).getByTestId("cloze-issues").textContent).toBe("");
    expect(within(editor).getByTestId("cloze-author-preview").textContent).toMatch(/\[فراغ 3]/);
  });
  it("undo restores the previous passage; clone and the JSON import round-trip preserve config and key byte-for-byte", async () => {
    const { hist } = await mountBuilder(baseExam([teacherQ()]));
    const editor = await screen.findByTestId("qt-editor-inlineCloze", {}, { timeout: 3000 });
    fireEvent.click(within(editor).getByRole("button", { name: "حذف الفراغ 1" })); await tick();
    expect(firstQ(hist()).inlineCloze.segments.filter(s => s.type === "blank").length).toBe(1);
    act(() => hist().undo()); await tick(30);
    expect(firstQ(hist()).inlineCloze).toEqual(CFG); expect(firstQ(hist()).answer).toEqual(KEY);
    const clone = cloneQuestionWithNewIds(teacherQ()) as unknown as Record<string, unknown>;
    expect(clone.inlineCloze).toEqual(CFG); expect(clone.answer).toEqual(KEY);
    const parsed = parseStructuredExamJson(JSON.stringify(baseExam([teacherQ()])), "exam.json");
    expect(parsed.canOpen).toBe(true);
    const pq = parsed.exam!.sections[0].questions[0] as unknown as Record<string, unknown>;
    expect(pq.inlineCloze).toEqual(CFG); expect(pq.answer).toEqual(KEY); expect(pq.questionTypeVersion).toBe(1);
  });
});

describe("teacher review", () => {
  const body = (expectedAnswer: unknown, studentAnswer: unknown = { kind: "fields", values: { b1: "ip", b2: "o1" } }) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 4 }, student: { studentId: "s1", studentName: "سارة", studentCode: "S1" }, attempt: { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 2, totalMarks: 4, percentage: 50, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" }, attempts: [{ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 2, totalMarks: 4, percentage: 50, manualReviewMarks: 0, finalized: true, gradingStatus: "final" }], questions: [{ questionId: "c1", questionNumber: 1, text: "أكمل", marks: 4, type: "inlineCloze", inlineCloze: CFG, studentAnswer, expectedAnswer, autoGrade: { score: 2, manualReview: false, parts: { correct: 1, total: 2 } }, manualScore: null, teacherComment: "" }] });
  it("shows the passage with each response inline, per-blank ✓ / ✗, the accepted answers (teacher only), earned parts; student HTML is text", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body(KEY, { kind: "fields", values: { b1: "ip", b2: "<img src=x onerror=alert(1)>" } }) } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view = await screen.findByTestId("cloze-review", {}, { timeout: 3000 });
    const blanks = within(view).getAllByTestId("cloze-review-blank");
    expect(blanks.map(b => b.getAttribute("data-ok"))).toEqual(["true", "false"]);
    expect(blanks[0].textContent).toContain("ip"); expect(blanks[0].textContent).toContain("Internet Protocol");
    expect(blanks[1].textContent).toContain("Data Link");
    expect(view.textContent).toContain("Physical");
    expect(within(view).getByTestId("cloze-review-parts").textContent).toMatch(/1\s*\/\s*2/);
    expect(view.querySelector("img")).toBeNull();
  });
  it("an invalid private key shows the explicit manual-review state (no ✓ / ✗)", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ status: 200, ok: true, json: async () => body({ ...KEY, scoring: "bonus" }) } as Response)) as unknown as typeof fetch;
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const view = await screen.findByTestId("cloze-review", {}, { timeout: 3000 });
    expect(within(view).getByTestId("cloze-key-invalid").textContent).toMatch(/تصحيح يدوي/);
    expect(within(view).queryAllByTestId("cloze-review-blank").every(b => b.getAttribute("data-ok") === null)).toBe(true);
  });
});

describe("lazy loading and module hygiene", () => {
  it("the renderer and the editor are reached ONLY through the registries' import() edges; no innerHTML / eval / network in the new modules", () => {
    const srcFiles: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|dist/.test(p)) walk(p); } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) srcFiles.push(p); } };
    walk(path.join(repo, "src"));
    const staticImporters = (name: string) => srcFiles.filter(f => new RegExp("^import[^;]*from\\s*\"[^\"]*" + name + "\"", "m").test(fs.readFileSync(f, "utf8"))).map(f => path.relative(repo, f));
    expect(staticImporters("editors/InlineClozeEditor")).toEqual([]); expect(staticImporters("student/InlineClozeResponse")).toEqual([]);
    expect(staticImporters("inlineCloze/InlineClozeReviewView")).toEqual(["src/AssignmentReview.tsx"]);
    const strip = (t: string) => t.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const f of ["src/inlineClozeQuestion.ts", "src/inlineCloze/InlineClozeReviewView.tsx", "src/questionTypes/student/InlineClozeResponse.tsx", "src/questionTypes/editors/InlineClozeEditor.tsx"])
      expect(strip(fs.readFileSync(path.join(repo, f), "utf8")), f).not.toMatch(/dangerouslySetInnerHTML|innerHTML|\beval\s*\(|new Function|fetch\(|XMLHttpRequest|localStorage|https?:\/\//);
    expect(strip(fs.readFileSync(path.join(repo, "src/inlineClozeQuestion.ts"), "utf8"))).not.toMatch(/from "react|document\.|window\.|import\(/);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/studentRegistry.tsx"), "utf8")).toMatch(/registerStudentRenderer\("inlineCloze", 1, lazy\(\(\) => import\("\.\/student\/InlineClozeResponse"\)\)\)/);
    expect(fs.readFileSync(path.join(repo, "src/questionTypes/authoringRegistry.tsx"), "utf8")).toMatch(/registerAuthoringEditor\("inlineCloze", 1, lazy\(\(\) => import\("\.\/editors\/InlineClozeEditor"\)\)\)/);
    expect(fs.readFileSync(path.join(repo, "scripts/check-bundle-budget.mjs"), "utf8")).toMatch(/CLOZE_SIGNATURES/);
  });
});
