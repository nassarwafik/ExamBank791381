// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, cleanup, fireEvent, screen, within, waitFor, act } from "@testing-library/react";
import AssignmentReview from "../AssignmentReview";
import AssignmentsPanel from "../AssignmentsPanel";

// Phase 17E-D — the teacher coding EVIDENCE panel inside AssignmentReview (the ONE detailed review surface) and the compact
// gradebook summary. The panel only DISPLAYS server authority: status, revision vs result revision, automatic vs teacher vs
// effective score (never computed here), language / policy / comparator labels, per-case evidence (expected / actual / stderr
// kept apart, LTR), recovery and technical state (never «wrong answer», never zero), retry (same revision, one click) and force
// regrade (new revision, confirmation first). Races: attempt / student / revision reads, action responses after a context
// change, duplicate clicks.
// Fail-first on 0fd6487b: questions carry BOTH the new `codingEvidence` and an equivalent legacy `codingAutoGrade` (the 17C
// shape) so behaviours the 17C block already had are reported as pre-existing passes, not as fail-first failures.
type Ev = Record<string, unknown>;
const HIDDEN = [{ id: "h1", title: "صغير", input: "1 2\n", expectedOutput: "3\n", weight: 1 }, { id: "h2", input: "5 5\n", expectedOutput: "10\n", weight: 3 }];
const KEY = { gradingMode: "hiddenTests", hiddenTests: HIDDEN, comparator: "trimTrailingWhitespace" };
const CASES = [
  { testId: "h1", title: "صغير", weight: 1, outcome: "passed", durationMs: 12, expectedOutput: "3\n" },
  { testId: "h2", title: "", weight: 3, outcome: "wrong-output", durationMs: 9, expectedOutput: "10\n", actualPreview: "11\n", stderrPreview: "warn: x" }
];
const EV = (over: Ev = {}): Ev => ({ contract: 1, status: "complete", automaticStatus: "complete", revision: 1, resultRevision: 1, resultCurrent: true, gradingMode: "hiddenTests", language: "python", languageVersion: 1, scoringPolicy: "proportional", comparator: "trimTrailingWhitespace", testCount: 2, maxMarks: 10, automaticScore: 2.5, passedCount: 1, passedWeight: 1, totalWeight: 4, outcome: "graded", completedAt: "2026-03-01T10:00:00.000Z", override: { active: false, score: null }, effectiveScore: 2.5, recovery: { state: "none" }, technicalCode: null, incomplete: false, cases: CASES, ...over });
const RAW: Record<string, string> = { passed: "success", "wrong-output": "success" };
// The 17C legacy view of the same evidence (what the baseline server sent as `codingAutoGrade`).
function legacy(e: Ev | null): Ev | null {
  if (!e) return null;
  const st = String(e.automaticStatus ?? e.status);
  const state = st === "complete" ? "complete" : st === "queued" ? "pending" : st === "processing" ? "dispatched" : "retryable";
  const cases = Array.isArray(e.cases) ? (e.cases as Ev[]).map(c => ({ testId: c.testId, title: c.title, status: RAW[String(c.outcome)] ?? c.outcome, passed: c.outcome === "passed", durationMs: c.durationMs, weight: c.weight, expectedOutput: c.expectedOutput, actualPreview: c.actualPreview, stderrPreview: c.stderrPreview })) : [];
  return { state, revision: e.revision, comparator: e.comparator, testCount: e.testCount, ...(e.technicalCode ? { technicalCode: e.technicalCode } : {}), ...(typeof e.automaticScore === "number" ? { resultRevision: e.resultRevision, automaticScore: e.automaticScore, maxMarks: e.maxMarks, passedWeight: e.passedWeight, totalWeight: e.totalWeight, passedCount: e.passedCount, outcome: e.outcome, compilePreview: e.compilePreview } : {}), cases };
}
const A = (over: Ev = {}) => ({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 2.5, totalMarks: 10, percentage: 25, manualReviewMarks: 0, finalized: true, gradingStatus: "final", startedAt: "", endedAt: "", endReason: "submitted", timedOut: false, ...over });
const codingQ = (ev: Ev | null, over: Ev = {}) => ({ questionId: "auto1", questionNumber: 3, text: "اطبع المجموع", marks: 10, type: "coding", studentAnswer: { kind: "code", language: "python", languageVersion: 1, source: "print(1)" }, expectedAnswer: KEY, autoGrade: { score: 2.5, manualReview: false }, manualScore: null, teacherComment: "", codingEvidence: ev, codingAutoGrade: legacy(ev), ...over });
const reviewBody = (question: Ev, attempt: Ev = A(), student = { studentId: "s1", studentName: "سارة", studentCode: "S1" }, attempts: Ev[] = [attempt]) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 10 }, student, attempt: { ...attempt, teacherFeedback: "" }, attempts, questions: [question] });
const json = (body: unknown, status = 200) => Promise.resolve({ status, ok: status < 400, headers: new Headers(), json: async () => body } as Response);

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[];
function stubFetch(handler: (url: string, method: string, body: Record<string, unknown> | null) => Promise<Response> | undefined) {
  calls = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET", body = init && init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    return handler(url, method, body) ?? json({ ok: true, result: { gradingStatus: "final", finalized: true, score: 10, totalMarks: 10, percentage: 100, manualReviewMarks: 0 } });
  }) as unknown as typeof fetch;
}
function mountReview(question: Ev, attempt: Ev = A(), regrade: () => Promise<Response> = () => json({ ok: true, state: "dispatched", revision: 2 })) {
  stubFetch((url, method) => {
    if (url.includes("/api/assignment-review") && method === "GET") return json(reviewBody(question, attempt));
    if (url.includes("/api/coding/regrade")) return regrade();
    return undefined;
  });
  return render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
}
const panel = () => screen.findByTestId("coding-autograde", {}, { timeout: 3000 });
const reviewGets = () => calls.filter(c => c.url.includes("/api/assignment-review") && c.method === "GET");
const regradePosts = () => calls.filter(c => c.url.includes("/api/coding/regrade"));
const confirmEl = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm yet"); return el; });
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("17E-D UI1–UI18 — the evidence panel displays server authority", () => {
  it("UI1 / UI11 complete evidence summary: status, language, scoring policy, comparator, automatic score, passed tests, weights", async () => {
    mountReview(codingQ(EV()));
    const p = await panel();
    expect(p.textContent).toMatch(/اكتمل التصحيح الآلي/);
    expect(p.textContent).toMatch(/Python/);
    expect(p.textContent).toMatch(/نسبي حسب الاختبارات/);
    expect(p.textContent).toMatch(/تجاهل المسافات في نهايات الأسطر/);
    expect(within(p).getByTestId("ev-automatic-score").textContent).toMatch(/2\.5\s*\/\s*10/);
    expect(p.textContent).toMatch(/نجح 1 من 2 اختبارات/);
    expect(p.textContent).toMatch(/الأوزان الناجحة 1 \/ 4/);
    expect(within(p).getByRole("heading", { name: /أدلة التصحيح الآلي/ })).toBeTruthy();
  });
  it("UI1b all-or-nothing never implies proportional weights", async () => {
    mountReview(codingQ(EV({ scoringPolicy: "allOrNothing", automaticScore: 0, effectiveScore: 0 })));
    const p = await panel();
    expect(p.textContent).toMatch(/الكل أو لا شيء/);
    expect(p.textContent).not.toMatch(/الأوزان الناجحة/);
  });
  it("UI2 retrying: a TECHNICAL message with a safe label (raw code only in a closed details disclosure), never a zero / wrong answer", async () => {
    mountReview(codingQ(EV({ status: "retrying", automaticStatus: "retrying", resultRevision: null, resultCurrent: false, automaticScore: null, passedCount: null, passedWeight: null, totalWeight: null, outcome: null, completedAt: null, effectiveScore: null, technicalCode: "RUNNER_BUSY", recovery: { state: "automatic" }, cases: [] }), { autoGrade: { score: 0, manualReview: true } }), A({ finalized: false, gradingStatus: "pendingReview", manualReviewMarks: 10 }));
    const p = await panel();
    expect(p.textContent).toMatch(/تعذر إكمال التصحيح الآلي لأسباب تقنية\./);
    expect(p.textContent).toMatch(/خدمة التنفيذ مشغولة مؤقتًا/);
    expect(p.textContent).not.toMatch(/فاشل|إجابة خاطئة|الطالب أخطأ/);
    expect(within(p).queryByTestId("ev-automatic-score")).toBeNull();
    const raw = within(p).queryByText(/RUNNER_BUSY/);
    expect(raw).toBeTruthy();
    expect(raw!.closest("details")).toBeTruthy();
    expect((raw!.closest("details") as HTMLDetailsElement).open).toBe(false);
  });
  it("UI2b an unknown technical code falls back to the generic safe message (never a raw code as the message)", async () => {
    mountReview(codingQ(EV({ status: "retrying", automaticStatus: "retrying", automaticScore: null, effectiveScore: null, technicalCode: "SOMETHING_NEW", cases: [], outcome: null })));
    const p = await panel();
    expect(within(p).getByTestId("ev-technical").textContent).toMatch(/تعذر إكمال التصحيح الآلي لأسباب تقنية\./);
    expect(within(p).getByTestId("ev-technical").textContent).not.toMatch(/^SOMETHING_NEW/);
  });
  it("UI3 delayed: automatic recovery stopped — needs a teacher retry; still not a zero", async () => {
    mountReview(codingQ(EV({ status: "delayed", automaticStatus: "delayed", automaticScore: null, effectiveScore: null, technicalCode: "EXECUTION_FAILED", recovery: { state: "delayed" }, cases: [], outcome: null })));
    const p = await panel();
    expect(p.textContent).toMatch(/توقفت المحاولات التلقائية/);
    expect(p.textContent).toMatch(/تعذر إكمال التصحيح الآلي لأسباب تقنية\./);
    expect(within(p).getByRole("button", { name: "إعادة محاولة التصحيح" })).toBeTruthy();
  });
  it("UI4 compile error is student evidence: «خطأ في الترجمة», automatic 0 / max, bounded LTR compile output", async () => {
    mountReview(codingQ(EV({ outcome: "compile-error", automaticScore: 0, effectiveScore: 0, passedCount: 0, passedWeight: 0, compilePreview: "Main.java:1: error: ';' expected", cases: CASES.map(c => ({ testId: c.testId, title: c.title, weight: c.weight, outcome: "compile-error", durationMs: null, expectedOutput: c.expectedOutput })) })));
    const p = await panel();
    expect(p.textContent).toMatch(/خطأ في الترجمة/);
    expect(within(p).getByTestId("ev-automatic-score").textContent).toMatch(/0\s*\/\s*10/);
    const pre = within(p).getByText("Main.java:1: error: ';' expected");
    expect(pre.tagName).toBe("PRE"); expect(pre.getAttribute("dir")).toBe("ltr");
    expect(p.textContent).not.toMatch(/مشكلة تقنية|لأسباب تقنية/);
  });
  it("UI5–UI7 runtime error / timeout / output limit are labelled as STUDENT execution evidence", async () => {
    const cases = [
      { testId: "h1", title: "صغير", weight: 1, outcome: "runtime-error", durationMs: 3, expectedOutput: "3\n", stderrPreview: "ZeroDivisionError" },
      { testId: "h2", title: "", weight: 3, outcome: "timeout", durationMs: 2000, expectedOutput: "10\n" },
      { testId: "h3", title: "كبير", weight: 1, outcome: "output-limit", durationMs: 40, expectedOutput: "1\n", actualPreview: "y\ny\n" }
    ];
    mountReview(codingQ(EV({ automaticScore: 0, effectiveScore: 0, passedCount: 0, passedWeight: 0, testCount: 3, cases })));
    const p = await panel();
    expect(p.textContent).toMatch(/خطأ أثناء التشغيل/);
    expect(p.textContent).toMatch(/تجاوز الزمن المسموح/);
    expect(p.textContent).toMatch(/تجاوز حد المخرجات/);
    expect(p.textContent).not.toMatch(/مشكلة تقنية في النظام|لأسباب تقنية/);
  });
  it("UI8 no answer: «لم يرسل الطالب كودًا قابلًا للتصحيح.» and automatic 0 / max, no fabricated cases", async () => {
    mountReview(codingQ(EV({ outcome: "no-answer", automaticScore: 0, effectiveScore: 0, passedCount: 0, passedWeight: 0, language: null, languageVersion: null, cases: [] }), { studentAnswer: null }));
    const p = await panel();
    expect(p.textContent).toMatch(/لم يرسل الطالب كودًا قابلًا للتصحيح\./);
    expect(within(p).getByTestId("ev-automatic-score").textContent).toMatch(/0\s*\/\s*10/);
    expect(within(p).queryAllByTestId("coding-autograde-case")).toHaveLength(0);
  });
  it("UI9 progressive disclosure: failed cases expanded by default, passed collapsed; filters الكل / الفاشلة / الناجحة; aria-expanded toggles", async () => {
    mountReview(codingQ(EV()));
    const p = await panel();
    const rows = within(p).getAllByTestId("coding-autograde-case");
    expect(rows).toHaveLength(2);                                                   // snapshot order preserved (h1, h2)
    expect(rows[0].textContent).toMatch(/صغير/); expect(rows[1].textContent).toMatch(/h2/);
    const t1 = within(rows[0]).getByRole("button", { expanded: false }), t2 = within(rows[1]).getByRole("button", { expanded: true });
    expect(within(rows[1]).getByText("10\n", { normalizer: s => s })).toBeTruthy();
    fireEvent.click(t1);
    expect(t1.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(t2);
    expect(t2.getAttribute("aria-expanded")).toBe("false");
    const group = within(p).getByRole("group", { name: /تصفية الاختبارات/ });
    fireEvent.click(within(group).getByRole("button", { name: /الفاشلة/ }));
    expect(within(p).getAllByTestId("coding-autograde-case")).toHaveLength(1);
    expect(within(group).getByRole("button", { name: /الفاشلة/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(group).getByRole("button", { name: /الناجحة/ }));
    expect(within(p).getAllByTestId("coding-autograde-case")[0].textContent).toMatch(/صغير/);
  });
  it("UI10 expected output, student output and stderr are separate labelled LTR blocks (never one generic console)", async () => {
    mountReview(codingQ(EV()));
    const p = await panel();
    const row = within(p).getAllByTestId("coding-autograde-case")[1];
    for (const [label, text] of [["المخرجات المتوقعة", "10\n"], ["مخرجات الطالب", "11\n"], ["رسائل الخطأ", "warn: x"]]) {
      const block = within(row).getByText(label).closest("[data-ev-io]") as HTMLElement;
      expect(block).toBeTruthy();
      const pre = block.querySelector("pre")!;
      expect(pre.textContent).toBe(text); expect(pre.getAttribute("dir")).toBe("ltr");
    }
  });
  it("UI12 a teacher override: «علامة المعلم معتمدة», automatic demoted to evidence, effective score is the SERVER value", async () => {
    mountReview(codingQ(EV({ override: { active: true, score: 8 }, effectiveScore: 8 }), { manualScore: 8 }), A({ score: 8 }));
    const p = await panel();
    expect(p.textContent).toMatch(/علامة المعلم معتمدة/);
    expect(within(p).getByTestId("ev-teacher-score").textContent).toMatch(/8\s*\/\s*10/);
    expect(within(p).getByTestId("ev-effective-score").textContent).toMatch(/8\s*\/\s*10/);
    expect(within(p).getByTestId("ev-automatic-score").textContent).toMatch(/2\.5\s*\/\s*10/);
    expect(within(p).getByTestId("ev-automatic-score").className).toMatch(/is-evidence/);
  });
  it("UI12b the effective score is displayed exactly as the server sent it (never recomputed from automatic / override)", async () => {
    mountReview(codingQ(EV({ automaticScore: 2.5, effectiveScore: 9.25, override: { active: false, score: null } })));
    const p = await panel();
    expect(within(p).getByTestId("ev-effective-score").textContent).toMatch(/9\.25\s*\/\s*10/);
  });
  it("UI12c F3 superseded: «تم اعتماد علامة المعلم» + the background note; never «جارٍ التصحيح» as the authority", async () => {
    mountReview(codingQ(EV({ status: "superseded", automaticStatus: "retrying", automaticScore: null, resultRevision: null, resultCurrent: false, outcome: null, technicalCode: "RUNNER_BUSY", override: { active: true, score: 7 }, effectiveScore: 7, cases: [] }), { manualScore: 7 }));
    const p = await panel();
    expect(within(p).getByTestId("ev-status").textContent).toMatch(/تم اعتماد علامة المعلم/);
    expect(p.textContent).toMatch(/توجد عملية تصحيح آلي أقدم أو جارية لا تؤثر في العلامة المعتمدة حاليًا\./);
    expect(within(p).getByTestId("ev-status").textContent).not.toMatch(/جارٍ|تعذر/);
  });
  it("UI13 resultRevision < revision: the older result is HISTORICAL while the new revision runs (never «اكتمل»)", async () => {
    mountReview(codingQ(EV({ status: "processing", automaticStatus: "processing", revision: 2, resultRevision: 1, resultCurrent: false, automaticScore: 6.67, effectiveScore: 6.67 })));
    const p = await panel();
    expect(within(p).getByTestId("ev-status").textContent).toMatch(/نتيجة سابقة — إعادة التصحيح جارية/);
    expect(p.textContent).toMatch(/آخر نتيجة مكتملة: 6\.67 \/ 10/);
    expect(p.textContent).toMatch(/النتيجة المعروضة من الإصدار 1/);
    expect(p.textContent).toMatch(/جارٍ التصحيح بالإصدار 2/);
    expect(within(p).getByTestId("ev-status").textContent).not.toMatch(/اكتمل/);
  });
  it("UI14 force regrade asks for confirmation (student, attempt, question named); cancel sends nothing; confirm sends identifiers only and reloads", async () => {
    mountReview(codingQ(EV()));
    const p = await panel();
    expect(p.textContent).toMatch(/إعادة التصحيح تنشئ نسخة تصحيح جديدة وتلغي صلاحية النتائج الأقدم عند وصولها\./);
    fireEvent.click(within(p).getByRole("button", { name: "إعادة التصحيح بإصدار جديد" }));
    let dlg = await confirmEl();
    expect(dlg.textContent).toMatch(/إعادة التصحيح بإصدار جديد/);
    expect(dlg.textContent).toMatch(/سيتم إنشاء محاولة تصحيح آلي جديدة لهذا السؤال\./);
    expect(dlg.textContent).toMatch(/تبقى علامة المعلم اليدوية، إن وُجدت، هي المعتمدة حتى يتم تغييرها يدويًا\./);
    expect(dlg.textContent).toMatch(/سارة/); expect(dlg.textContent).toMatch(/المحاولة 1/); expect(dlg.textContent).toMatch(/السؤال 3/);
    fireEvent.click(within(dlg).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(document.querySelector('.eb-confirm[role="dialog"]')).toBeNull());
    expect(regradePosts()).toHaveLength(0);
    fireEvent.click(within(await panel()).getByRole("button", { name: "إعادة التصحيح بإصدار جديد" }));
    dlg = await confirmEl();
    await act(async () => { fireEvent.click(within(dlg).getByRole("button", { name: "بدء إعادة التصحيح" })); });
    await waitFor(() => expect(regradePosts()).toHaveLength(1));
    expect(regradePosts()[0].body).toEqual({ action: "force", assignmentId: "a1", studentId: "s1", attemptNumber: 1, questionId: "auto1" });
    await waitFor(() => expect(reviewGets().length).toBeGreaterThanOrEqual(2));
  });
  it("UI15 retry (same revision) is one click, explained, sends identifiers only and reloads authoritative data (no local 'processing')", async () => {
    const reply = deferred<Response>();
    mountReview(codingQ(EV({ status: "retrying", automaticStatus: "retrying", automaticScore: null, effectiveScore: null, technicalCode: "RUNNER_BUSY", cases: [], outcome: null })), A(), () => reply.promise);
    const p = await panel();
    expect(p.textContent).toMatch(/إعادة المحاولة تستخدم نفس نسخة التصحيح\./);
    await act(async () => { fireEvent.click(within(p).getByRole("button", { name: "إعادة محاولة التصحيح" })); });
    expect(regradePosts()).toHaveLength(1);
    expect(regradePosts()[0].body).toEqual({ action: "retry", assignmentId: "a1", studentId: "s1", attemptNumber: 1, questionId: "auto1" });
    expect(within(await panel()).getByTestId("ev-status").textContent).not.toMatch(/جارٍ التصحيح الآلي/);   // nothing invented locally
    await act(async () => { reply.resolve(await json({ ok: true, state: "dispatched", revision: 1 })); });
    await waitFor(() => expect(reviewGets().length).toBeGreaterThanOrEqual(2));
  });
  it("UI16 manual-mode coding shows the source and manual controls but no automatic evidence panel", async () => {
    mountReview(codingQ(null, { expectedAnswer: { ...KEY, gradingMode: "manual" } }));
    await screen.findByTestId("code-review-source", {}, { timeout: 3000 });
    expect(screen.queryByTestId("coding-autograde")).toBeNull();
    expect(screen.getByText(/علامة المعلم/)).toBeTruthy();
  });
  it("UI17 malformed / incomplete evidence renders a safe fallback and never crashes", async () => {
    mountReview(codingQ(EV({ status: "unknown", automaticStatus: "unknown", incomplete: true, automaticScore: null, passedCount: null, cases: "garbage" as unknown as Ev[] })));
    const p = await panel();
    expect(p.textContent).toMatch(/بيانات التصحيح غير مكتملة\./);
    cleanup();
    mountReview(codingQ({ status: 42, cases: [{ testId: 7 }], override: "x" } as Ev));
    const q = await panel();
    expect(q.textContent).toMatch(/بيانات التصحيح غير مكتملة\./);
  });
  it("UI18 long output stays inside bounded, internally scrolling LTR blocks", async () => {
    const big = "X".repeat(4096) + "\n" + "Y".repeat(4000);
    mountReview(codingQ(EV({ cases: [CASES[0], { ...CASES[1], actualPreview: big }] })));
    const p = await panel();
    const pre = within(p).getByText(big, { normalizer: s => s });
    expect(pre.getAttribute("dir")).toBe("ltr");
    expect(pre.className).toMatch(/cx-ev-output/);
    const css = readFileSync("src/coding/coding.css", "utf8");
    expect(css).toMatch(/\.cx-ev-output\s*\{[^}]*max-height:[^}]*overflow:\s*auto/);
  });
});

describe("17E-D R1–R5 — review races and duplicate actions", () => {
  it("R1 a late attempt-1 read can never overwrite attempt 2", async () => {
    const pending: Record<number, Array<(r: Response) => void>> = { 1: [], 2: [] };
    let first = true;
    const a1 = A(), a2 = A({ attemptNumber: 2, score: 9, percentage: 90 });
    stubFetch((url, method) => {
      if (url.includes("/api/assignment-review") && method === "GET") {
        const n = Number(new URL(url, "https://x.test").searchParams.get("attemptNumber"));
        const body = reviewBody(codingQ(EV({ automaticScore: n === 2 ? 9 : 2.5, effectiveScore: n === 2 ? 9 : 2.5, language: n === 2 ? "java" : "python" }), { studentAnswer: { kind: "code", language: n === 2 ? "java" : "python", languageVersion: 1, source: n === 2 ? "class Main{}" : "print(1)" } }), n === 2 ? a2 : a1, undefined, [a1, a2]);
        if (first) { first = false; return json(body); }
        return new Promise<Response>(res => { pending[n].push(r => res(r)); }).then(() => json(body));
      }
      return undefined;
    });
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    await panel();
    fireEvent.click(screen.getByRole("button", { name: /محاولة 1 ·/ }));        // request A (attempt 1) in flight
    fireEvent.click(screen.getByRole("button", { name: /محاولة 2 ·/ }));        // request B (attempt 2)
    await act(async () => { pending[2].forEach(f => f(new Response())); });
    await waitFor(() => expect(within(screen.getByTestId("coding-autograde")).getByTestId("ev-automatic-score").textContent).toMatch(/9\s*\/\s*10/));
    await act(async () => { pending[1].forEach(f => f(new Response())); });
    await new Promise(r => setTimeout(r, 20));
    expect(within(screen.getByTestId("coding-autograde")).getByTestId("ev-automatic-score").textContent).toMatch(/9\s*\/\s*10/);
    expect(screen.getByTestId("code-review-source").textContent).toBe("class Main{}");
    expect(screen.getByRole("button", { name: /محاولة 2 ·/ }).className).toMatch(/active/);
  });
  it("R2 a late Student-A response never populates the Student-B review", async () => {
    const holdA = deferred<Response>();
    stubFetch((url, method) => {
      if (url.includes("/api/assignment-review") && method === "GET") {
        const sid = new URL(url, "https://x.test").searchParams.get("studentId");
        if (sid === "sA") return holdA.promise.then(() => json(reviewBody(codingQ(EV({ automaticScore: 1, effectiveScore: 1 })), A(), { studentId: "sA", studentName: "الطالب أ", studentCode: "A" })));
        return json(reviewBody(codingQ(EV({ automaticScore: 9, effectiveScore: 9 })), A(), { studentId: "sB", studentName: "الطالب ب", studentCode: "B" }));
      }
      return undefined;
    });
    const r = render(<AssignmentReview token="t" assignmentId="a1" studentId="sA" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    r.rerender(<AssignmentReview token="t" assignmentId="a1" studentId="sB" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByText(/الطالب ب/, {}, { timeout: 3000 });
    await act(async () => { holdA.resolve(new Response()); });
    await new Promise(res => setTimeout(res, 20));
    expect(screen.getByText(/الطالب ب/)).toBeTruthy();
    expect(screen.queryByText(/الطالب أ/)).toBeNull();
    expect(within(screen.getByTestId("coding-autograde")).getByTestId("ev-automatic-score").textContent).toMatch(/9\s*\/\s*10/);
  });
  it("R3 a late revision-1 read can never overwrite revision-2 evidence (newest read wins)", async () => {
    const reads: Array<{ resolve: () => void }> = [];
    let n = 0;
    stubFetch((url, method) => {
      if (url.includes("/api/assignment-review") && method === "GET") {
        n++;
        if (n === 1) return json(reviewBody(codingQ(EV({ status: "processing", automaticStatus: "processing", revision: 2, resultRevision: 1, resultCurrent: false }))));
        const rev = n === 2 ? 1 : 2;
        const body = reviewBody(codingQ(rev === 1 ? EV({ status: "processing", automaticStatus: "processing", revision: 1, resultRevision: null, resultCurrent: false, automaticScore: null, effectiveScore: null, cases: [], outcome: null }) : EV({ revision: 2, resultRevision: 2, automaticScore: 10, effectiveScore: 10 })));
        return new Promise<Response>(res => reads.push({ resolve: () => res(new Response()) })).then(() => json(body));
      }
      return undefined;
    });
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const p = await panel();
    const refresh = within(p).getByRole("button", { name: "تحديث حالة التصحيح" });
    fireEvent.click(refresh);                                                         // read #2 → revision 1 (slow)
    fireEvent.click(within(await panel()).getByRole("button", { name: "تحديث حالة التصحيح" }));   // read #3 → revision 2
    await act(async () => { reads[1].resolve(); });
    await waitFor(() => expect(within(screen.getByTestId("coding-autograde")).getByTestId("ev-automatic-score").textContent).toMatch(/10\s*\/\s*10/));
    await act(async () => { reads[0].resolve(); });
    await new Promise(r => setTimeout(r, 20));
    expect(within(screen.getByTestId("coding-autograde")).getByTestId("ev-automatic-score").textContent).toMatch(/10\s*\/\s*10/);
    expect(within(screen.getByTestId("coding-autograde")).getByTestId("ev-status").textContent).toMatch(/اكتمل التصحيح الآلي/);
  });
  it("R4 a retry response arriving after the review is closed updates nothing and triggers no reload", async () => {
    const reply = deferred<Response>();
    const r = mountReview(codingQ(EV({ status: "retrying", automaticStatus: "retrying", automaticScore: null, effectiveScore: null, technicalCode: "RUNNER_BUSY", cases: [], outcome: null })), A(), () => reply.promise);
    const p = await panel();
    await act(async () => { fireEvent.click(within(p).getByRole("button", { name: "إعادة محاولة التصحيح" })); });
    const getsBefore = reviewGets().length;
    r.unmount();
    await act(async () => { reply.resolve(await json({ ok: true, state: "dispatched", revision: 1 })); });
    await new Promise(res => setTimeout(res, 20));
    expect(reviewGets().length).toBe(getsBefore);
  });
  it("R4b a retry response after switching to another attempt never reloads / notifies the new attempt with old-context data", async () => {
    const reply = deferred<Response>();
    const a1 = A(), a2 = A({ attemptNumber: 2, score: 9 });
    stubFetch((url, method) => {
      if (url.includes("/api/assignment-review") && method === "GET") {
        const n = Number(new URL(url, "https://x.test").searchParams.get("attemptNumber"));
        return json(reviewBody(codingQ(n === 2 ? EV({ automaticScore: 9, effectiveScore: 9 }) : EV({ status: "retrying", automaticStatus: "retrying", automaticScore: null, effectiveScore: null, technicalCode: "RUNNER_BUSY", cases: [], outcome: null })), n === 2 ? a2 : a1, undefined, [a1, a2]));
      }
      if (url.includes("/api/coding/regrade")) return reply.promise;
      return undefined;
    });
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    const p = await panel();
    await act(async () => { fireEvent.click(within(p).getByRole("button", { name: "إعادة محاولة التصحيح" })); });
    fireEvent.click(screen.getByRole("button", { name: /محاولة 2 ·/ }));
    await waitFor(() => expect(within(screen.getByTestId("coding-autograde")).getByTestId("ev-automatic-score").textContent).toMatch(/9\s*\/\s*10/));
    const getsBefore = reviewGets().length;
    await act(async () => { reply.resolve(await json({ ok: true, state: "dispatched", revision: 1 })); });
    await new Promise(res => setTimeout(res, 20));
    expect(reviewGets().length).toBe(getsBefore);
    expect(within(screen.getByTestId("coding-autograde")).getByTestId("ev-automatic-score").textContent).toMatch(/9\s*\/\s*10/);
  });
  it("R5 rapid double clicks send ONE request: retry, force-confirm and save review", async () => {
    const reply = deferred<Response>();
    mountReview(codingQ(EV({ status: "retrying", automaticStatus: "retrying", automaticScore: null, effectiveScore: null, technicalCode: "RUNNER_BUSY", cases: [], outcome: null })), A(), () => reply.promise);
    const p = await panel();
    const retry = within(p).getByRole("button", { name: "إعادة محاولة التصحيح" });
    fireEvent.click(retry); fireEvent.click(retry); fireEvent.click(retry);
    expect(regradePosts()).toHaveLength(1);
    await act(async () => { reply.resolve(await json({ ok: true, state: "dispatched", revision: 1 })); });
    cleanup();
    mountReview(codingQ(EV()), A(), () => new Promise<Response>(() => {}));
    fireEvent.click(within(await panel()).getByRole("button", { name: "إعادة التصحيح بإصدار جديد" }));
    const dlg = await confirmEl();
    const ok = within(dlg).getByRole("button", { name: "بدء إعادة التصحيح" });
    fireEvent.click(ok); fireEvent.click(ok);
    await new Promise(res => setTimeout(res, 10));
    expect(regradePosts()).toHaveLength(1);
    cleanup();
    stubFetch((url, method) => (url.includes("/api/assignment-review") && method === "GET" ? json(reviewBody(codingQ(EV()))) : url.includes("/api/assignment-review") ? new Promise<Response>(() => {}) : undefined));
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    await panel();
    const save = screen.getByRole("button", { name: /حفظ واعتماد التصحيح/ });
    fireEvent.click(save); fireEvent.click(save);
    expect(calls.filter(c => c.url.includes("/api/assignment-review") && c.method === "POST")).toHaveLength(1);
  });
  it("R5d duplicate clicks inside ONE render batch (before React disables the button) still send ONE request — the guard is synchronous", async () => {
    const reply = deferred<Response>();
    mountReview(codingQ(EV({ status: "retrying", automaticStatus: "retrying", automaticScore: null, effectiveScore: null, technicalCode: "RUNNER_BUSY", cases: [], outcome: null })), A(), () => reply.promise);
    const retry = within(await panel()).getByRole("button", { name: "إعادة محاولة التصحيح" });
    act(() => { retry.click(); retry.click(); retry.click(); });
    await new Promise(res => setTimeout(res, 10));
    expect(regradePosts()).toHaveLength(1);
    await act(async () => { reply.resolve(await json({ ok: true, state: "dispatched", revision: 1 })); });
    cleanup();
    stubFetch((url, method) => (url.includes("/api/assignment-review") && method === "GET" ? json(reviewBody(codingQ(EV()))) : url.includes("/api/assignment-review") ? new Promise<Response>(() => {}) : undefined));
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    await panel();
    const save = screen.getByRole("button", { name: /حفظ واعتماد التصحيح/ });
    act(() => { save.click(); save.click(); });
    await new Promise(res => setTimeout(res, 10));
    expect(calls.filter(c => c.url.includes("/api/assignment-review") && c.method === "POST")).toHaveLength(1);
  });
  it("R5b the force-regrade confirmation suspends the review focus trap: Escape closes only the confirmation; focus returns to the action", async () => {
    let closed = 0;
    stubFetch((url, method) => (url.includes("/api/assignment-review") && method === "GET" ? json(reviewBody(codingQ(EV()))) : undefined));
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => { closed++; }} onSaved={() => {}} />);
    const btn = within(await panel()).getByRole("button", { name: "إعادة التصحيح بإصدار جديد" });
    btn.focus(); fireEvent.click(btn);
    const dlg = await confirmEl();
    expect(dlg.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.querySelector('.eb-confirm[role="dialog"]')).toBeNull());
    expect(closed).toBe(0);
    await waitFor(() => expect(document.activeElement).toBe(within(screen.getByTestId("coding-autograde")).getByRole("button", { name: "إعادة التصحيح بإصدار جديد" })));
  });
  it("R5c an action error is mapped to a safe Arabic message per status / code (never a raw server body)", async () => {
    for (const [status, body, re] of [
      [409, { ok: false, code: "ALREADY_COMPLETE" }, /اكتمل هذا التصحيح بالفعل/],
      [404, { ok: false, code: "NOT_FOUND" }, /لم يعد هذا التصحيح موجودًا/],
      [409, { ok: false, code: "QUESTION_UNSUPPORTED" }, /غير مدعومة/],
      [401, { ok: false, error: "Unauthorized" }, /انتهت جلسة المعلم/],
      [500, { ok: false, code: "INTERNAL", stack: "Error at x.js:1" }, /خدمة التصحيح غير متاحة حاليًا/]
    ] as const) {
      mountReview(codingQ(EV({ status: "retrying", automaticStatus: "retrying", automaticScore: null, effectiveScore: null, technicalCode: "RUNNER_BUSY", cases: [], outcome: null })), A(), () => json(body, status));
      const p = await panel();
      await act(async () => { fireEvent.click(within(p).getByRole("button", { name: "إعادة محاولة التصحيح" })); });
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toMatch(re);
      expect(alert.textContent).not.toMatch(/Error at|stack|INTERNAL|Unauthorized/);
      cleanup();
    }
  });
});

describe("17E-D GB — gradebook summary (compact; no per-case evidence)", () => {
  const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true }];
  const ASSIGNMENT = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "واجب برمجة", instructions: "x", status: "published", openAt: "", dueAt: "2026-01-01T13:00:00.000Z", questionCount: 1, totalMarks: 10, maxAttempts: 1, durationMinutes: 0, attemptPolicy: "continuous" };
  const attempt = (summary?: Ev, codingGrading?: Ev) => ({ attemptNumber: 1, score: 0, totalMarks: 10, percentage: 0, submittedAt: "2026-01-01T10:20:00.000Z", finalized: false, manualReviewMarks: 10, gradingStatus: "pendingReview", endReason: "submitted", ...(codingGrading ? { codingGrading } : {}), ...(summary ? { codingEvidenceSummary: summary } : {}) });
  const row = (studentId: string, studentName: string, summary?: Ev, codingGrading?: Ev) => ({ studentId, studentName, studentCode: studentId.toUpperCase(), attemptsUsed: 1, allowedAttempts: 1, dueAtOverride: null, attemptStatus: "submitted", gradingStatus: "pendingReview", activeAttempt: null, timed: false, attempts: [attempt(summary, codingGrading)], latestResult: { ...attempt(summary, codingGrading), teacherFeedback: "" } });
  const S = (status: string, open = 0, delayed = 0, superseded = 0) => ({ status, openTargets: open, delayedTargets: delayed, supersededTargets: superseded });
  it("GB-UI1 per-row badges from the server summary: complete / running / retrying / delayed / teacher mark; a summary card with counts", async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input), method = (init && init.method) || "GET";
      if (url.includes("/api/assignments") && method !== "POST") return json({ ok: true, assignments: [ASSIGNMENT] });
      if (url.includes("/api/saved-exams")) return json({ ok: true, exams: [] });
      if (url.includes("/api/assignment-results") && method !== "POST") return json({ ok: true, assignment: { assignmentId: "a1", title: "واجب برمجة", dueAt: ASSIGNMENT.dueAt, durationMinutes: 0, maxAttempts: 1, totalMarks: 10 }, stats: { students: 5, submitted: 5, pendingReview: 5, average: 0, highest: 0, lowest: 0 },
        students: [row("s1", "طالب مكتمل", S("complete")), row("s2", "طالب جارٍ", S("processing", 1), { pending: 1, retryable: 0, stale: 0 }), row("s3", "طالب يعاد", S("retrying", 1), { pending: 0, retryable: 1, stale: 0 }), row("s4", "طالب متأخر", S("delayed", 1, 1), { pending: 0, retryable: 1, stale: 0 }), row("s5", "طالب معتمد", S("superseded", 0, 0, 1))],
        codingSummary: { pending: 1, retryable: 2, stale: 0 }, codingEvidenceTotals: { open: 3, delayed: 1, superseded: 1 } });
      return json({ ok: true });
    }) as unknown as typeof fetch;
    const r = render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
    fireEvent.click(await r.findByRole("button", { name: "فتح" }));
    await r.findByText("طالب مكتمل");
    const rowOf = (name: string) => r.getByText(name).closest("tr") as HTMLElement;
    expect(within(rowOf("طالب مكتمل")).getByText("التصحيح البرمجي مكتمل")).toBeTruthy();
    expect(within(rowOf("طالب جارٍ")).getByText("التصحيح البرمجي جارٍ")).toBeTruthy();
    expect(within(rowOf("طالب يعاد")).getByText("إعادة المحاولة جارية")).toBeTruthy();
    expect(within(rowOf("طالب متأخر")).getByText("تأخير تقني")).toBeTruthy();
    expect(within(rowOf("طالب معتمد")).getByText("علامة المعلم معتمدة")).toBeTruthy();
    const card = r.getByTestId("coding-summary-card");
    expect(card.textContent).toMatch(/قيد التصحيح: 1/);
    expect(card.textContent).toMatch(/بحاجة لإعادة محاولة: 1/);
    expect(card.textContent).toMatch(/متأخر: 1/);
    expect(document.body.textContent).not.toMatch(/RUNNER_|EXECUTION_|expectedOutput|cg_/);
  });
});

describe("17E-D PERF — large hidden-test sets stay usable", () => {
  const many = (n: number, failEvery = 4) => Array.from({ length: n }, (_, i) => ({ testId: "t" + i, title: "اختبار " + (i + 1), weight: 1, outcome: i % failEvery === 0 ? "wrong-output" : "passed", durationMs: 5, expectedOutput: "E".repeat(200) + i, ...(i % failEvery === 0 ? { actualPreview: "A".repeat(4096), stderrPreview: "S".repeat(512) } : {}) }));
  it("PERF1 one question × 50 tests (the maximum) and five questions × 20 tests render quickly with passed cases collapsed", async () => {
    const t0 = performance.now();
    mountReview(codingQ(EV({ testCount: 50, cases: many(50) })));
    const p = await panel();
    const t1 = performance.now();
    expect(within(p).getAllByTestId("coding-autograde-case")).toHaveLength(50);
    expect(p.querySelectorAll("pre").length).toBeLessThanOrEqual(13 * 3);                     // only the 13 failed cases are expanded
    cleanup();
    const qs = Array.from({ length: 5 }, (_, k) => ({ ...codingQ(EV({ testCount: 20, cases: many(20) })), questionId: "q" + k, questionNumber: k + 1 }));
    stubFetch((url, method) => (url.includes("/api/assignment-review") && method === "GET" ? json({ ...reviewBody(qs[0]), questions: qs }) : undefined));
    const t2 = performance.now();
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(screen.getAllByTestId("coding-autograde")).toHaveLength(5), { timeout: 5000 });
    const t3 = performance.now();
    expect(screen.getAllByTestId("coding-autograde-case")).toHaveLength(100);
    expect(document.querySelectorAll(".cx-ev-output").length).toBeLessThanOrEqual(5 * 5 * 3);
    console.info("[17E-D PERF] 1×50 render ms:", Math.round(t1 - t0), "· 5×20 render ms:", Math.round(t3 - t2));
    expect(t1 - t0).toBeLessThan(4000); expect(t3 - t2).toBeLessThan(4000);
  });
});
