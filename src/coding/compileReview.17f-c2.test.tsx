// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, act, fireEvent } from "@testing-library/react";
import StudentExamPage from "../StudentExamPage";
import StudentAssignmentCard from "../student/StudentAssignmentCard";
import CodingQuestionEditor from "../questionTypes/editors/CodingQuestionEditor";
import * as CGS from "../codingGradingStatus";
import * as CQ from "../codingQuestion";
import { newQuestion } from "../examBuilderState";
import { normalizeEvidence } from "./codingTeacherEvidence";

// Phase 17F-C2 — COMPILE REVIEW REQUIRED ≠ ACADEMIC ZERO (frontend). When the SERVER says autoGradingStatus = "reviewRequired"
// (a compile error under the teacher's manualReview policy: automatic execution complete, teacher review pending) the student
// headline is withheld exactly like B1's technical delay — never "0 / 30", never "0%" — the percentage slot says the teacher will
// decide, the panel words it, the card words it, and the page does NOT poll (nothing automatic is still running). The Builder
// gets one accessible radiogroup for the policy; a legacy node (no field) reads "zero", a new node defaults to "manualReview".
// Fail-first on d2ae703b: "reviewRequired" is not in the vocabulary, the editor has no control, the default key has no policy.
const G = CGS as unknown as Record<string, any>;
const X = CQ as unknown as Record<string, any>;
type R = Record<string, unknown>;
const EXAM = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "ق", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال", marks: 30 }] }] };
const ASSIGNMENT = { assignmentId: "a1", title: "واجب", instructions: "ت", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 2, durationMinutes: 0, requiresStart: true, timed: false, questionCount: 1, totalMarks: 30, exam: EXAM };
const BASE = { attemptsUsed: 1, allowedAttempts: 2, canAttempt: true, dueClosed: false, availability: "open", durationMinutes: 0, timed: false, attemptModelVersion: 3, attemptPolicy: "continuous", requiresStart: true, serverNow: "2026-10-03T12:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: true, canWrite: false, draftAnswers: {}, draftSavedAt: "" };
const result = (over: R = {}): R => ({ attemptNumber: 1, submittedAt: "2026-10-03T10:00:00.000Z", score: 0, totalMarks: 30, percentage: 0, manualReviewMarks: 30, finalized: false, gradingStatus: "pendingReview", teacherFeedback: "", timedOut: false, endReason: "submitted", ...over });
const reviewRequired = (over: R = {}) => result({ autoGradingStatus: "reviewRequired", ...over });
const complete = (over: R = {}) => result({ autoGradingStatus: "complete", gradingStatus: "final", finalized: true, manualReviewMarks: 0, ...over });
const stateWith = (latest: R | null, over: R = {}): R => ({ ...BASE, latestResult: latest, attempts: latest ? [latest] : [], ...over });

let server: { state: R; gets: number };
function makeServer(initial: R) {
  server = { state: initial, gets: 0 };
  const json = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body }) as unknown as Response;
  globalThis.fetch = vi.fn((url: string, init: RequestInit = {}) => {
    const method = (init.method || "GET").toUpperCase();
    if (String(url).startsWith("/api/student-assignment/")) return Promise.resolve(json(200, { ok: true, assignment: { exam: EXAM, requiresStart: false } }));
    if (method === "GET") server.gets++;
    return Promise.resolve(json(200, { ok: true, state: JSON.parse(JSON.stringify(server.state)) }));
  }) as unknown as typeof fetch;
  return server;
}
beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] }); vi.spyOn(console, "error").mockImplementation(() => {}); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const settle = async () => { for (let i = 0; i < 6; i++) await flush(0); };
const mount = async () => { render(<StudentExamPage token="t" assignment={ASSIGNMENT as never} studentName="أ" className="ص" onBack={() => {}} onLogout={() => {}} />); await settle(); };
const headline = () => document.querySelector(".iex-score") as HTMLElement | null;
const card = () => document.querySelector(".iex-result-card") as HTMLElement | null;
const headlineText = () => (headline()?.textContent ?? "").replace(/\s+/g, " ").trim();
const percentText = () => (headline()?.nextElementSibling?.textContent ?? "").replace(/\s+/g, " ").trim();
const TITLE = "اكتمل فحص الكود، وتحتاج النتيجة إلى مراجعة المعلم.";
const DETAIL = "تعذّر تجميع الكود، لذلك لم تُحتسب علامة صفر تلقائيًا. سيحدد المعلم العلامة بعد مراجعة الحل.";
const CARD = "سؤال برمجي بانتظار مراجعة المعلم";
const PERCENT = "بانتظار مراجعة المعلم";

describe("17F-C2 vocabulary — reviewRequired is a server-derived, withheld, non-polling state", () => {
  it("PED10 (frontend) 'reviewRequired' is accepted from the server; anything else unknown is still undefined", () => {
    expect(CGS.codingGradingStatusOf({ autoGradingStatus: "reviewRequired" })).toBe("reviewRequired");
    expect(CGS.codingGradingStatusOf({ autoGradingStatus: "halfCredit" })).toBeUndefined();
  });
  it("PED14 reviewRequired never polls (automatic execution is done) and is not an OPEN automatic state; the headline is withheld (PED11)", () => {
    expect(CGS.shouldPollCodingGrading("reviewRequired" as never)).toBe(false);
    expect(CGS.isCodingGradingOpen("reviewRequired" as never)).toBe(false);
    expect(CGS.scoreWithheld({ autoGradingStatus: "reviewRequired" })).toBe(true);
    expect(CGS.scoreWithheld({ autoGradingStatus: "complete" })).toBe(false);
    expect(["queued", "processing", "retrying", "delayed", "reviewRequired", "complete"].map(s => CGS.shouldPollCodingGrading(s as never))).toEqual([true, true, true, false, false, false]);
  });
  it("PED12 wording: the withheld-score label depends on WHY the score is withheld (technical delay vs teacher review)", () => {
    expect(G.withheldScoreLabel({ autoGradingStatus: "reviewRequired" })).toBe(PERCENT);
    expect(G.withheldScoreLabel({ autoGradingStatus: "processing" })).toBe(CGS.PENDING_SCORE_LABEL);
    expect(CGS.codingGradingTitle("reviewRequired" as never)).toBe(TITLE);
    expect(CGS.codingGradingDetail("reviewRequired" as never)).toBe(DETAIL);
    expect(G.CODING_GRADING_CARD_REVIEW).toBe(CARD);
  });
});

describe("17F-C2 PED11–PED14 — the student result page", () => {
  it("PED11 / PED12 compile review required: headline — / 30 (never 0 / 30), percent slot says the teacher will decide, no compiler text", async () => {
    makeServer(stateWith(reviewRequired()));
    await mount();
    expect(headlineText()).toMatch(/^—\s*\/\s*30$/);
    expect(headline()!.getAttribute("data-pending")).toBe("true");
    expect(percentText()).toBe(PERCENT);
    expect(percentText()).not.toMatch(/%/);
    const text = card()!.textContent!;
    expect(text).not.toMatch(/0 \/ 30|0%/);
    expect(text).toContain(TITLE); expect(text).toContain(DETAIL);
    expect(text).not.toMatch(/جارٍ التصحيح الآلي|بانتظار التصحيح الآلي/);           // nothing automatic is still running
    expect(text).not.toMatch(/error|expected|Main\.java|;/);                           // never compiler diagnostics
    expect(screen.getByTestId("coding-grading-status").getAttribute("data-status")).toBe("reviewRequired");
    expect(text).toMatch(/علامة مؤقتة/);                                               // mark finality stays the separate dimension
  });
  it("PED14 reviewRequired does not poll: no further status reads after mount, even over a long foreground window", async () => {
    const s = makeServer(stateWith(reviewRequired()));
    await mount();
    const n = s.gets;
    await flush(60 * 1000); await settle();
    await flush(5 * 60 * 1000); await settle();
    expect(s.gets).toBe(n);
    expect(screen.queryByTestId("coding-grading-window-ended")).toBeNull();
  });
  it("PED35 mixed exam: another question already worth 10 while the coding question awaits review → the partial total is NOT presented", async () => {
    makeServer(stateWith(reviewRequired({ score: 10, percentage: 33, manualReviewMarks: 20 })));
    await mount();
    expect(headlineText()).toMatch(/^—\s*\/\s*30$/);
    expect(card()!.textContent!).not.toMatch(/10 \/ 30|33%/);
  });
  it("PED16 after the teacher's override the server says complete + final: the real mark is shown (incl. a real 0 the teacher chose)", async () => {
    makeServer(stateWith(complete({ score: 29.5, percentage: 98 })));
    await mount();
    expect(headlineText()).toBe("29.5 / 30"); expect(percentText()).toBe("98%"); expect(headline()!.getAttribute("data-pending")).toBe("false");
    cleanup();
    makeServer(stateWith(complete({ score: 0, percentage: 0 })));
    await mount();
    expect(headlineText()).toBe("0 / 30"); expect(percentText()).toBe("0%");
  });
});

describe("17F-C2 PED13 — the dashboard card", () => {
  const assignment = (lr: R) => ({ assignmentId: "a1", title: "واجب", instructions: "", openAt: "", dueAt: "2026-10-10T00:00:00.000Z", effectiveDueAt: "", questionCount: 1, totalMarks: 30, durationMinutes: 0, attemptsUsed: 1, allowedAttempts: 2, availability: "open", status: "submitted", canAttempt: false, hasActiveAttempt: false, latestResult: lr });
  it("review required → '— /30', the review wording, no fake zero; complete 0 → '0/30'", () => {
    const { container, unmount } = render(<StudentAssignmentCard item={assignment(reviewRequired()) as never} busy={false} onOpen={() => {}} />);
    const text = container.textContent!;
    expect(text).toMatch(/—\s*\/\s*30/); expect(text).not.toMatch(/0\/30|0 \/ 30|0%/);
    expect(screen.getByTestId("card-coding-grading").textContent).toBe(CARD);
    unmount();
    const { container: c2 } = render(<StudentAssignmentCard item={assignment(complete({ score: 0, percentage: 0 })) as never} busy={false} onOpen={() => {}} />);
    expect(c2.textContent!).toMatch(/0\/30/);
    expect(screen.queryByTestId("card-coding-grading")).toBeNull();
  });
});

describe("17F-C2 PED2 / PED33 — the Builder: new-authoring default, legacy resolution, one accessible policy control, round trip", () => {
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  const CFG = { allowedLanguages: ["java"], defaultLanguage: "java", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 }, publicTests: [] };
  const KEY = { gradingMode: "hiddenTests", comparator: "trimTrailingWhitespace", hiddenTests: [{ id: "hid-1", input: "1 2\n", expectedOutput: "3\n", weight: 1 }], referenceSolutions: {} };
  const node = (answer: R) => ({ examQuestionId: "c1", presentationType: "coding", questionTypeVersion: 1, text: "س", marks: 10, coding: clone(CFG), answer });
  const group = () => screen.getByRole("radiogroup", { name: "عند فشل تجميع الكود" });
  const radio = (label: string) => screen.getByRole("radio", { name: label }) as HTMLInputElement;
  it("PED2 the canonical model: CODING_COMPILE_ERROR_POLICIES, resolver (absent ⇒ zero), NEW default key ⇒ manualReview; a brand-new coding node carries it", () => {
    expect(X.CODING_COMPILE_ERROR_POLICIES).toEqual(["zero", "manualReview"]);
    expect(X.codingCompileErrorPolicy({})).toBe("zero");
    expect(X.codingCompileErrorPolicy({ compileErrorPolicy: "manualReview" })).toBe("manualReview");
    expect(X.defaultCodingAnswerKey().compileErrorPolicy).toBe("manualReview");
    const q = newQuestion("coding" as never, { examQuestionId: "n1", text: "س", marks: 5 }) as unknown as Record<string, any>;
    expect(q.answer.compileErrorPolicy).toBe("manualReview");
    expect(X.validateCodingQuestion({ ...node({ ...clone(KEY), compileErrorPolicy: "halfCredit" }) }).map((i: { code: string }) => i.code)).toContain("CODING_COMPILE_ERROR_POLICY_UNKNOWN");
    expect(X.validateCodingQuestion({ ...node({ ...clone(KEY) }) })).toEqual([]);
  });
  it("PED33 legacy node (no field): the control shows 'zero' checked and explains; choosing manual review writes ONLY the policy, keeping every other key field", () => {
    const onChange = vi.fn();
    render(<CodingQuestionEditor node={node(clone(KEY)) as never} onChange={onChange} disabled={false} />);
    const g = group();
    expect(g.tagName).toBe("FIELDSET");
    expect(radio("احتساب صفر تلقائيًا").checked).toBe(true);
    expect(radio("إرسال للمراجعة اليدوية").checked).toBe(false);
    expect(g.textContent).toMatch(/المراجعة اليدوية مناسبة/); expect(g.textContent).toMatch(/لا يقرر تلقائيًا/); expect(g.textContent).toMatch(/Java|C#/);
    fireEvent.click(radio("إرسال للمراجعة اليدوية"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0] as { answer: Record<string, unknown> };
    expect(patch.answer.compileErrorPolicy).toBe("manualReview");
    expect(patch.answer.hiddenTests).toEqual(KEY.hiddenTests); expect(patch.answer.comparator).toBe("trimTrailingWhitespace"); expect(patch.answer.gradingMode).toBe("hiddenTests"); expect(patch.answer.referenceSolutions).toEqual({});
  });
  it("PED33b a stored 'manualReview' round-trips (checked on load); switching back writes 'zero' explicitly; disabled mode disables both radios", () => {
    const onChange = vi.fn();
    render(<CodingQuestionEditor node={node({ ...clone(KEY), compileErrorPolicy: "manualReview" }) as never} onChange={onChange} disabled={false} />);
    expect(radio("إرسال للمراجعة اليدوية").checked).toBe(true);
    fireEvent.click(radio("احتساب صفر تلقائيًا"));
    expect((onChange.mock.calls[0][0] as { answer: Record<string, unknown> }).answer.compileErrorPolicy).toBe("zero");
    cleanup();
    render(<CodingQuestionEditor node={node({ ...clone(KEY), compileErrorPolicy: "manualReview" }) as never} onChange={vi.fn()} disabled />);
    expect(radio("إرسال للمراجعة اليدوية").disabled).toBe(true); expect(radio("احتساب صفر تلقائيًا").disabled).toBe(true);
  });
  it("PED33c keyboard: the radios are real inputs in one named group (arrow-key navigable by the browser), each with a description", () => {
    render(<CodingQuestionEditor node={node(clone(KEY)) as never} onChange={vi.fn()} disabled={false} />);
    const radios = Array.from(group().querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(new Set(radios.map(r => r.name)).size).toBe(1);
    for (const r of radios) { expect(r.getAttribute("aria-describedby")).toBeTruthy(); expect(document.getElementById(r.getAttribute("aria-describedby")!)?.textContent).toBeTruthy(); }
  });
});

describe("17F-C2 PED8 (frontend) — teacher evidence normalizes reviewRequired without flagging it incomplete", () => {
  const EV = (over: R) => ({ contract: 1, status: "complete", automaticStatus: "complete", revision: 1, resultRevision: 1, resultCurrent: true, gradingMode: "hiddenTests", language: "java", languageVersion: 1, scoringPolicy: "proportional", comparator: "trimTrailingWhitespace", testCount: 3, maxMarks: 10, automaticScore: null, passedCount: 0, passedWeight: 0, totalWeight: 6, outcome: "compile-error", completedAt: "2026-10-03T10:00:00.000Z", compilePreview: "Main.java:3: error: ';' expected", override: { active: false, score: null }, effectiveScore: null, recovery: { state: "none" }, technicalCode: null, incomplete: false, cases: [], ...over });
  it("reviewRequired true + automaticScore null is a complete, well-formed evidence (not incomplete); absent reviewRequired reads false", () => {
    const e = normalizeEvidence(EV({ reviewRequired: true })) as unknown as Record<string, unknown>;
    expect(e.reviewRequired).toBe(true); expect(e.incomplete).toBe(false); expect(e.automaticScore).toBeNull(); expect(e.effectiveScore).toBeNull();
    expect((normalizeEvidence(EV({})) as unknown as Record<string, unknown>).reviewRequired).toBe(false);
  });
});
