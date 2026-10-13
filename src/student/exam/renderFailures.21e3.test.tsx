// @vitest-environment happy-dom
// Phase 21E.3 — assessment integrity: the page's record of questions whose renderer could not recover, and the boundary's
// reporting into it. Fail-first on 593fd47 (no record existed; a boundary told nobody).
//   RF-1  the record: a failure is remembered while the card is shown AND after the student moved on; a successful retry
//         clears it; showing the question again (page mounted clean) clears what was left from the previous visit
//   RF-2  the boundary reports a material failure with its sanitized code, its recovery, and its unmount; an inline formula or
//         a section header never reports; a page card reports «shown» when it mounts clean
//   RF-3  the report the client sends is one entry per question, sorted, codes only; the submit warning names the count
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { Suspense } from "react";
import QuestionErrorBoundary from "./QuestionErrorBoundary";
import { QuestionRecoveryContext, type QuestionRecovery } from "./questionRecovery";
import { recoverableLazy } from "../../recoverableLazy";
import { EMPTY_RENDER_FAILURES, reduceRenderFailure, failedQuestionIds, renderFailureReport, renderFailureSubmitWarning, type RenderFailureEvent } from "./renderFailures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const origin = window.location.origin;
const chunkError = (name: string) => new TypeError("Failed to fetch dynamically imported module: " + origin + "/assets/" + name + "-abcd1234.js");
const sleep = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

describe("RF-1 — the record", () => {
  it("remembers a failure across navigation, forgets it on recovery, and forgets a previous visit's failure when the question mounts clean again", () => {
    let s = EMPTY_RENDER_FAILURES;
    s = reduceRenderFailure(s, { status: "failed", questionId: "q2", boundaryId: "b1", variant: "question", code: "chunk-load" });
    expect([...failedQuestionIds(s)]).toEqual(["q2"]);
    const same = reduceRenderFailure(s, { status: "failed", questionId: "q2", boundaryId: "b1", variant: "question", code: "chunk-load" });
    expect(same).toBe(s);                                                     // idempotent: no new object for the same fact
    // the student moves to another question: the card unmounts, the failure is still a fact about q2
    s = reduceRenderFailure(s, { status: "unmounted", questionId: "q2", boundaryId: "b1" });
    expect([...failedQuestionIds(s)]).toEqual(["q2"]);
    // q2 shown again: a clean page mount clears what the previous visit left …
    const cleared = reduceRenderFailure(s, { status: "shown", questionId: "q2" });
    expect(failedQuestionIds(cleared).size).toBe(0);
    expect(reduceRenderFailure(cleared, { status: "shown", questionId: "q2" })).toBe(cleared);
    // … but never a failure of THIS visit (a child card that failed in the same commit reports before the page mounts)
    let t = reduceRenderFailure(EMPTY_RENDER_FAILURES, { status: "failed", questionId: "q2", boundaryId: "old", variant: "part", code: "runtime" });
    t = reduceRenderFailure(t, { status: "unmounted", questionId: "q2", boundaryId: "old" });
    t = reduceRenderFailure(t, { status: "failed", questionId: "q2", boundaryId: "new", variant: "part", code: "chunk-load" });
    t = reduceRenderFailure(t, { status: "shown", questionId: "q2" });
    expect([...failedQuestionIds(t)]).toEqual(["q2"]);
    expect(renderFailureReport(t)).toEqual([{ questionId: "q2", code: "chunk-load" }]);
    // a successful retry clears exactly that card; another card of the same question keeps the question failed
    let u = reduceRenderFailure(EMPTY_RENDER_FAILURES, { status: "failed", questionId: "q5", boundaryId: "a", variant: "stem", code: "chunk-load" });
    u = reduceRenderFailure(u, { status: "failed", questionId: "q5", boundaryId: "b", variant: "block", code: "runtime" });
    u = reduceRenderFailure(u, { status: "recovered", questionId: "q5", boundaryId: "a" });
    expect([...failedQuestionIds(u)]).toEqual(["q5"]);
    u = reduceRenderFailure(u, { status: "recovered", questionId: "q5", boundaryId: "b" });
    expect(failedQuestionIds(u).size).toBe(0);
    expect(reduceRenderFailure(u, { status: "recovered", questionId: "q5", boundaryId: "b" })).toBe(u);
  });
});

function Harness({ events, questionId = "q7", children }: { events: RenderFailureEvent[]; questionId?: string; children: React.ReactNode }) {
  const value: QuestionRecovery = { scope: "exam", reloadAllowed: false, strict: false, questionId, report: e => { events.push(e); } };
  return <QuestionRecoveryContext.Provider value={value}>{children}</QuestionRecoveryContext.Provider>;
}

describe("RF-2 — the boundary reports", () => {
  it("a chunk failure → failed(chunk-load); a successful retry → recovered; the code is the sanitized classification only", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const Part = recoverableLazy<object>("RfPartOne", () => (++calls === 1 ? Promise.reject(chunkError("RfPartOne")) : Promise.resolve({ default: () => <p>البند</p> })) as Promise<{ default: React.ComponentType<object> }>);
    const events: RenderFailureEvent[] = [];
    render(<Harness events={events}><QuestionErrorBoundary variant="part" resetKey="p1"><Suspense fallback={<i>…</i>}><Part /></Suspense></QuestionErrorBoundary></Harness>);
    await screen.findByTestId("question-recovery");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "failed", questionId: "q7", variant: "part", code: "chunk-load" });
    expect(JSON.stringify(events[0])).not.toContain("abcd1234");               // never the URL / message
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await screen.findByText("البند");
    await sleep(20);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ status: "recovered", questionId: "q7", boundaryId: events[0].status === "failed" ? events[0].boundaryId : "" });
  });

  it("a render error → failed(runtime); unmounting the failed card → unmounted (the record keeps it)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => { throw new Error("secret detail"); };
    const events: RenderFailureEvent[] = [];
    const r = render(<Harness events={events}><QuestionErrorBoundary variant="question" resetKey="q"><Boom /></QuestionErrorBoundary></Harness>);
    await screen.findByTestId("question-recovery");
    expect(events[0]).toMatchObject({ status: "failed", code: "runtime", variant: "question" });
    expect(JSON.stringify(events)).not.toContain("secret");
    r.unmount();
    expect(events[1]).toMatchObject({ status: "unmounted", questionId: "q7", boundaryId: events[0].status === "failed" ? events[0].boundaryId : "" });
  });

  it("an inline formula or a section header never reports; a page card reports «shown» when it mounts clean", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => { throw new Error("x"); };
    const events: RenderFailureEvent[] = [];
    render(<Harness events={events}>
      <QuestionErrorBoundary variant="inline" fallback={<span>x^2</span>}><Boom /></QuestionErrorBoundary>
      <QuestionErrorBoundary variant="section"><Boom /></QuestionErrorBoundary>
      <QuestionErrorBoundary variant="page" resetKey="q7"><p>السؤال</p></QuestionErrorBoundary>
    </Harness>);
    await screen.findByText("السؤال");
    expect(events).toEqual([{ status: "shown", questionId: "q7" }]);
  });

  it("without a question in scope (outside the exam page) nothing is reported", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => { throw new Error("x"); };
    const events: RenderFailureEvent[] = [];
    const value: QuestionRecovery = { scope: "general", reloadAllowed: false, strict: false, report: e => { events.push(e); } };
    render(<QuestionRecoveryContext.Provider value={value}><QuestionErrorBoundary variant="question"><Boom /></QuestionErrorBoundary></QuestionRecoveryContext.Provider>);
    await screen.findByTestId("question-recovery");
    expect(events).toHaveLength(0);
  });
});

describe("RF-3 — the report and the warning", () => {
  it("one entry per question, sorted, questionId + code only", () => {
    let s = reduceRenderFailure(EMPTY_RENDER_FAILURES, { status: "failed", questionId: "s1::q9", boundaryId: "a", variant: "page", code: "runtime" });
    s = reduceRenderFailure(s, { status: "failed", questionId: "s1::q2", boundaryId: "b", variant: "stem", code: "chunk-load" });
    s = reduceRenderFailure(s, { status: "failed", questionId: "s1::q2", boundaryId: "c", variant: "block", code: "runtime" });
    expect(renderFailureReport(s)).toEqual([{ questionId: "s1::q2", code: "chunk-load" }, { questionId: "s1::q9", code: "runtime" }]);
    expect(renderFailureReport(EMPTY_RENDER_FAILURES)).toEqual([]);
  });
  it("the submit warning is explicit Arabic: how many, why, that it is not counted as a wrong answer, and what the student can do", () => {
    const w = renderFailureSubmitWarning(3);
    expect(w).toContain("3 أسئلة");
    expect(w).toContain("تعذّر عرض");
    expect(w).toContain("لن يُحتسب");
    expect(w).toContain("المعلم");
    expect(renderFailureSubmitWarning(1)).toContain("سؤال واحد");
    expect(renderFailureSubmitWarning(2)).toContain("سؤالين");
  });
});
