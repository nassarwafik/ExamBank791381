// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, act, fireEvent } from "@testing-library/react";
import StudentExamPage from "../StudentExamPage";
import CodingQuestionEditor from "../questionTypes/editors/CodingQuestionEditor";
import * as CGS from "../codingGradingStatus";
import * as CQ from "../codingQuestion";
import { newQuestion, changeQuestionType } from "../examBuilderState";
import type { BuilderQuestion } from "../examTypes";
import { currentQuestionTypeVersion, effectiveQuestionTypeVersion, supportsQuestionTypeVersion } from "../questionTypeCatalog";
import { resolveAuthoringEditor } from "../questionTypes/authoringRegistry";
import { resolveStudentRenderer } from "../questionTypes/studentRegistry";
import { hasRegisteredTypeDefaults } from "../questionTypeDefaults";
import { validateQuestionTypeNode } from "../questionTypeValidation";

// Phase 17F-C2 — Independent Review Fix 1 (frontend): mixed-version safety.
//   RF1-A  a CACHED pre-C2 (B1) client receives the new server payload { autoGradingStatus: "reviewRequired", autoGradingPending: true }:
//          its resolver (frozen below, verbatim from d2ae703 src/codingGradingStatus.ts) must withhold the score; the MODERN client
//          keeps the teacher-review wording and never polls because of the legacy bit.
//   RF1-B  coding@2 carries the compile-error policy: newQuestion("coding") is coding@2 + manualReview; every frontend registry resolves
//          both versions; the Builder upgrades a legacy coding@1 node EXPLICITLY when the teacher chooses manual review.
// Fail-first on bd4a9389 (PR #251 head).
const X = CQ as unknown as Record<string, any>;
type R = Record<string, unknown>;

// ── FROZEN pre-C2 (B1) client resolver — src/codingGradingStatus.ts at d2ae703, verbatim. Never edit to make a test pass. ──
const B1_VALID = ["queued", "processing", "retrying", "delayed", "complete"];
const b1StatusOf = (result: R | null | undefined) => { const v = result ? result.autoGradingStatus : undefined; return typeof v === "string" && B1_VALID.includes(v) ? v : undefined; };
const b1Open = (s: string | undefined) => !!s && s !== "complete";
const b1ScoreWithheld = (result: R | null | undefined) => { if (!result || typeof result !== "object") return false; return b1Open(b1StatusOf(result)) || result.autoGradingPending === true; };
const b1Headline = (result: R) => (b1ScoreWithheld(result) ? "—" : String(result.score)) + " / " + String(result.totalMarks);
const b1ShouldPoll = (s: string | undefined) => s === "queued" || s === "processing" || s === "retrying";

const EXAM = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "ق", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال", marks: 30 }] }] };
const ASSIGNMENT = { assignmentId: "a1", title: "واجب", instructions: "ت", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 2, durationMinutes: 0, requiresStart: true, timed: false, questionCount: 1, totalMarks: 30, exam: EXAM };
const BASE = { attemptsUsed: 1, allowedAttempts: 2, canAttempt: true, dueClosed: false, availability: "open", durationMinutes: 0, timed: false, attemptModelVersion: 3, attemptPolicy: "continuous", requiresStart: true, serverNow: "2026-10-03T12:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: true, canWrite: false, draftAnswers: {}, draftSavedAt: "" };
const result = (over: R = {}): R => ({ attemptNumber: 1, submittedAt: "2026-10-03T10:00:00.000Z", score: 0, totalMarks: 30, percentage: 0, manualReviewMarks: 30, finalized: false, gradingStatus: "pendingReview", teacherFeedback: "", timedOut: false, endReason: "submitted", ...over });
/** The RF1 server payload of a review-required result: modern status + legacy withhold bit. */
const reviewRequired = (over: R = {}) => result({ autoGradingStatus: "reviewRequired", autoGradingPending: true, ...over });
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
const PERCENT = "بانتظار مراجعة المعلم";

describe("RF1-A — the cached pre-C2 (B1) client and the modern client on the RF1 payload", () => {
  it("MV2 the FROZEN B1 resolver withholds the score of the new payload only because of the legacy bit (the status word is unknown to it)", () => {
    const lr = reviewRequired({ score: 10, percentage: 33 });
    expect(b1StatusOf(lr)).toBeUndefined();
    expect(b1ScoreWithheld(lr)).toBe(true);
    expect(b1ScoreWithheld(result({ autoGradingStatus: "reviewRequired" }))).toBe(false);   // ← the pre-RF1 payload: the defect the review found
  });
  it("MV3 the B1 headline rule never renders a fake zero / partial total for the new payload", () => {
    expect(b1Headline(reviewRequired())).toBe("— / 30");
    expect(b1Headline(reviewRequired({ score: 10 }))).toBe("— / 30");
    expect(b1ShouldPoll(b1StatusOf(reviewRequired()))).toBe(false);                            // the old client does not poll either
  });
  it("MV4 the MODERN client: teacher-review wording, withheld headline, and NO polling despite autoGradingPending: true (the status is authoritative)", async () => {
    expect(CGS.shouldPollCodingGrading("reviewRequired")).toBe(false);
    expect(CGS.scoreWithheld(reviewRequired())).toBe(true);
    const s = makeServer(stateWith(reviewRequired()));
    await mount();
    expect(headlineText()).toMatch(/^—\s*\/\s*30$/);
    expect(percentText()).toBe(PERCENT);
    expect(card()!.textContent).toContain(TITLE);
    const n = s.gets;
    await flush(6 * 60 * 1000); await settle();
    expect(s.gets).toBe(n);
    expect(screen.queryByTestId("coding-grading-refresh-note")).toBeNull();
  });
  it("MV5 queued / processing / retrying / delayed with the legacy bit: the pre-RF1 behaviour is unchanged (withheld, polling only while automatic work runs)", () => {
    for (const s of ["queued", "processing", "retrying", "delayed"] as const) {
      expect(CGS.scoreWithheld(result({ autoGradingStatus: s, autoGradingPending: true }))).toBe(true);
      expect(CGS.shouldPollCodingGrading(s)).toBe(s !== "delayed");
      expect(b1ScoreWithheld(result({ autoGradingStatus: s, autoGradingPending: true }))).toBe(true);
    }
  });
  it("MV6 an ordinary complete result without the bit shows the real mark — incl. a real 0 — on both clients", async () => {
    expect(b1Headline(complete({ score: 0 }))).toBe("0 / 30");
    expect(CGS.scoreWithheld(complete({ score: 0 }))).toBe(false);
    makeServer(stateWith(complete({ score: 0, percentage: 0 })));
    await mount();
    expect(headlineText()).toBe("0 / 30"); expect(percentText()).toBe("0%");
  });
});

const KEY = { hiddenTests: [{ id: "h1", input: "1 2\n", expectedOutput: "3\n", weight: 1 }], comparator: "exact", referenceSolutions: { java: "class Main {}" }, gradingMode: "hiddenTests", scoringPolicy: "allOrNothing" };
const CFG = { allowedLanguages: ["java"], defaultLanguage: "java", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 128 }, publicTests: [] };
const node = (version: number | undefined, answer: R): BuilderQuestion => ({ examQuestionId: "q1", presentationType: "coding", ...(version === undefined ? {} : { questionTypeVersion: version }), text: "اكتب", marks: 10, coding: CFG, answer } as unknown as BuilderQuestion);
function mountEditor(n: BuilderQuestion, disabled = false) {
  const onChange = vi.fn();
  render(<CodingQuestionEditor node={n as never} onChange={onChange} disabled={disabled} />);
  const group = screen.getByTestId("coding-compile-policy");
  const radios = Array.from(group.querySelectorAll<HTMLInputElement>("input[type=radio]"));
  return { onChange, group, radios, byValue: (v: string) => radios.find(r => r.value === v)! };
}

describe("RF1-B — coding@2 carries the compile-error policy; coding@1 stays the historical contract (frontend)", () => {
  it("MV9 newQuestion('coding') and a type change to coding are coding@2 with compileErrorPolicy manualReview", () => {
    const q = newQuestion("coding") as unknown as R;
    expect(q.questionTypeVersion).toBe(2);
    expect((q.answer as R).compileErrorPolicy).toBe("manualReview");
    const mc = newQuestion("multipleChoice", { examQuestionId: "m1", text: "س", marks: 2 });
    const next = changeQuestionType(mc, "coding" as never) as unknown as R;
    expect(next.questionTypeVersion).toBe(2);
    expect((next.answer as R).compileErrorPolicy).toBe("manualReview");
    expect(currentQuestionTypeVersion("coding")).toBe(3);   // 19F: coding@3 (locked template) is current; NEW questions are still authored at coding@2 (above)
  });
  it("MV14 every V1 frontend registry still resolves coding@1 (editor, renderer, defaults, validator; absent version = V1)", () => {
    expect(supportsQuestionTypeVersion("coding", 1)).toBe(true);
    expect(effectiveQuestionTypeVersion("coding", undefined)).toBe(1);
    expect(resolveAuthoringEditor("coding", 1)).toBeTruthy();
    expect(resolveStudentRenderer("coding", 1)?.version).toBe(1);
    expect(resolveStudentRenderer("coding", undefined)?.version).toBe(1);
    expect(hasRegisteredTypeDefaults("coding", 1)).toBe(true);
    expect(validateQuestionTypeNode(node(1, KEY), "coding", 1).map(i => i.code)).toEqual([]);
    expect(validateQuestionTypeNode(node(undefined, KEY), "coding", undefined).map(i => i.code)).toEqual([]);
  });
  // Phase 19F — coding@3 (locked template) is supported now; the unsupported neighbour this pin guards is coding@4.
  it("MV15 every V2 frontend registry resolves coding@2 (editor, renderer, defaults, validator); coding@4 is unsupported", () => {
    expect(supportsQuestionTypeVersion("coding", 2)).toBe(true);
    expect(effectiveQuestionTypeVersion("coding", 2)).toBe(2);
    expect(effectiveQuestionTypeVersion("coding", 4)).toBeUndefined();
    expect(resolveAuthoringEditor("coding", 2)).toBeTruthy();
    expect(resolveStudentRenderer("coding", 2)?.version).toBe(2);
    expect(resolveStudentRenderer("coding", 4)).toBeUndefined();
    expect(hasRegisteredTypeDefaults("coding", 2)).toBe(true);
    expect(validateQuestionTypeNode(node(2, { ...KEY, compileErrorPolicy: "manualReview" }), "coding", 2).map(i => i.code)).toEqual([]);
    expect(validateQuestionTypeNode(node(2, { ...KEY, compileErrorPolicy: "zero" }), "coding", 2).map(i => i.code)).toEqual([]);
    expect(validateQuestionTypeNode(node(4, KEY), "coding", 4).map(i => i.code)).toEqual(["UNSUPPORTED_QUESTION_TYPE_VERSION"]);
  });
  it("MV8 / MV12 the shared model: V1 manualReview is refused (upgrade required), V2 needs an explicit valid policy, unknown values fail everywhere", () => {
    const codes = (n: BuilderQuestion) => CQ.validateCodingQuestion(n as unknown as Record<string, unknown>).map(i => i.code);
    expect(codes(node(1, KEY))).toEqual([]);
    expect(codes(node(1, { ...KEY, compileErrorPolicy: "zero" }))).toEqual([]);
    expect(codes(node(1, { ...KEY, compileErrorPolicy: "manualReview" }))).toContain("CODING_COMPILE_ERROR_POLICY_REQUIRES_V2");
    expect(codes(node(2, KEY))).toContain("CODING_COMPILE_ERROR_POLICY_REQUIRED");
    expect(codes(node(2, { ...KEY, compileErrorPolicy: "halfCredit" }))).toContain("CODING_COMPILE_ERROR_POLICY_UNKNOWN");
    expect(X.codingCompileErrorPolicy({}, 1)).toBe("zero");
    expect(X.codingCompileErrorPolicy({ compileErrorPolicy: "zero" }, 1)).toBe("zero");
    expect(X.codingCompileErrorPolicy({ compileErrorPolicy: "manualReview" }, 1)).toBeUndefined();
    expect(X.codingCompileErrorPolicy({}, 2)).toBeUndefined();
    expect(X.codingCompileErrorPolicy({ compileErrorPolicy: "zero" }, 2)).toBe("zero");
    expect(X.codingCompileErrorPolicy({ compileErrorPolicy: "manualReview" }, 2)).toBe("manualReview");
    expect(X.codingCompileErrorPolicy({ compileErrorPolicy: "halfCredit" }, 2)).toBeUndefined();
  });
  it("MV8-UI a legacy coding@1 node shows 'zero' checked; choosing manual review upgrades the node EXPLICITLY to coding@2 together with the policy (every other key field kept)", () => {
    const { onChange, byValue } = mountEditor(node(undefined, KEY));
    expect(byValue("zero").checked).toBe(true);
    expect(byValue("manualReview").checked).toBe(false);
    fireEvent.click(byValue("manualReview"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0] as R;
    expect(patch.questionTypeVersion).toBe(2);
    expect(patch.answer).toEqual({ ...KEY, compileErrorPolicy: "manualReview" });
  });
  it("MV10-UI a coding@1 node already reads 'zero' (clicking it is a no-op — no silent rewrite); a coding@2 node round-trips both values and stays coding@2", () => {
    const v1 = mountEditor(node(1, KEY));
    expect(v1.byValue("zero").checked).toBe(true);
    fireEvent.click(v1.byValue("zero"));
    expect(v1.onChange).not.toHaveBeenCalled();
    cleanup();
    const v2 = mountEditor(node(2, { ...KEY, compileErrorPolicy: "manualReview" }));
    expect(v2.byValue("manualReview").checked).toBe(true);
    fireEvent.click(v2.byValue("zero"));
    expect(v2.onChange).toHaveBeenCalledTimes(1);
    const patch = v2.onChange.mock.calls[0][0] as R;
    expect(patch.questionTypeVersion === undefined || patch.questionTypeVersion === 2).toBe(true);   // never a downgrade
    expect((patch.answer as R).compileErrorPolicy).toBe("zero");
    cleanup();
    const z2 = mountEditor(node(2, { ...KEY, compileErrorPolicy: "zero" }));
    expect(z2.byValue("zero").checked).toBe(true);
    fireEvent.click(z2.byValue("manualReview"));
    expect(((z2.onChange.mock.calls[0][0] as R).answer as R).compileErrorPolicy).toBe("manualReview");
  });
  it("MV12-UI a coding@2 node without a policy shows NO option checked and the inline validator names the missing policy", () => {
    const { radios } = mountEditor(node(2, KEY));
    expect(radios.every(r => !r.checked)).toBe(true);
    expect(document.body.textContent).toMatch(/حدّد سياسة التعامل مع فشل تجميع الكود/);
  });
});
