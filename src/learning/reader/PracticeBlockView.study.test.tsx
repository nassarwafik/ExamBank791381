// @vitest-environment happy-dom
// Study Practice Strength — the in-page exercise views with an injected study HOST: a right answer of an eligible
// exercise is reported ONCE (the response only — never a verdict or points), the SERVER's outcome is shown
// («+n نقطة قوة», «محسوب سابقًا», «سُجّل التمرين», «أكملت نقاط قوة هذه الوحدة»), a wrong answer reports nothing, a repeat never re-reports,
// a transport failure is quiet, an unkeyed question stays static, and without a host nothing changes.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import PracticeBlockView from "./PracticeBlockView";
import PracticeTableView from "./PracticeTableView";
import type { StudyAttemptResponse, StudyHost, StudyResponse } from "../study/types";
import type { PracticeQuestion, PracticeTableBlock } from "../content/types";

afterEach(cleanup);

const MC: PracticeQuestion = { kind: "multipleChoice", prompt: "أي وضع لجهاز واحد؟", options: [{ id: "o1", text: "Access", correct: true }, { id: "o2", text: "Trunk" }], feedback: { correctFeedback: "صحيح تمامًا" } };
const SI: PracticeQuestion = { kind: "shortInput", prompt: "اكتب", answer: "vlan" };
const TABLE: PracticeTableBlock = { id: "tbl", type: "practice-table", origin: "book", headers: ["العنوان", "الحكم"], rows: [["10.0.0.1", { kind: "select", options: ["خاص", "عام"], key: "خاص" }], ["8.8.8.8", { kind: "select", options: ["خاص", "عام"], key: "عام" }]] };
const outcome = (over: Partial<StudyAttemptResponse> = {}): StudyAttemptResponse => ({ ok: true, actor: "student", correct: true, persisted: true, alreadyCompleted: false, gained: 1, page: { pageId: "p1", moduleId: "m1", completed: ["q1"], eligible: 14 }, module: { completed: 1, eligible: 14, points: 1, max: 20 }, totalPoints: 1, ...over });
function host(reportImpl?: (pageId: string, activityId: string, response: StudyResponse) => Promise<StudyAttemptResponse>) {
  const report = vi.fn(reportImpl ?? (async () => outcome()));
  const h: StudyHost & { report: typeof report } = { pageStatus: () => ({ kind: "ready", completed: new Set(), eligible: 14, module: null }), report };
  return h;
}

describe("PracticeBlockView × study host", () => {
  it("a right answer is reported once with ONLY the response; the server's +1 outcome is shown; the footer promises a study point", async () => {
    const h = host();
    render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={h} />);
    expect(screen.getByText("تمرين ذاتي: أجب لترى النتيجة فورًا. أول إجابة صحيحة تُسجَّل لك مرة واحدة وترفع نقاط قوة هذه الوحدة (حتى 20 نقطة للوحدة).")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await screen.findByText(/\+1 نقطة قوة — أحسنت، واصل الدراسة\./);
    expect(h.report).toHaveBeenCalledTimes(1);
    expect(h.report).toHaveBeenCalledWith("p1", "q1", { kind: "multipleChoice", optionId: "o1" });
    expect(JSON.stringify(h.report.mock.calls[0])).not.toMatch(/correct|points|gained/);
    // re-rendering / re-picking the same answer never re-reports
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await waitFor(() => {});
    expect(h.report).toHaveBeenCalledTimes(1);
  });
  it("a wrong answer reports nothing; correct after wrong reports once; the outcome disappears when the answer is cleared", async () => {
    const h = host();
    render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={h} />);
    fireEvent.click(screen.getByRole("radio", { name: /Trunk/ }));
    await waitFor(() => {});
    expect(h.report).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await screen.findByText(/\+1 نقطة قوة/);
    expect(h.report).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "امسح الإجابة" }));
    expect(screen.queryByText(/\+1 نقطة قوة/)).toBeNull();
    // answering right again after clearing: the same response is not re-reported (one report per distinct answer)
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await waitFor(() => {});
    expect(h.report).toHaveBeenCalledTimes(1);
  });
  it("the server's other outcomes render honestly: a repeat («محسوب سابقًا»), a recorded completion whose module value did not move («سُجّل التمرين … 2 من 14»), a teacher preview (nothing), a failure (nothing, no crash)", async () => {
    const repeat = host(async () => outcome({ persisted: false, alreadyCompleted: true, gained: 0 }));
    const { unmount } = render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={repeat} />);
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await screen.findByText("هذا التمرين محسوب سابقًا.");
    expect(screen.queryByText(/\+1/)).toBeNull();
    unmount();
    const recorded = host(async () => outcome({ gained: 0, page: { pageId: "p1", moduleId: "m1", completed: ["a", "q1"], eligible: 14 }, module: { completed: 2, eligible: 14, points: 1, max: 20 } }));
    const r2 = render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={recorded} />);
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await screen.findByText(/سُجّل التمرين/);
    expect(screen.getByText(/سُجّل التمرين/).textContent).toBe("سُجّل التمرين (2 من 14 في هذه الوحدة) — نقاط قوة الوحدة: 1 / 20.");
    expect(screen.queryByText(/\+/)).toBeNull();
    r2.unmount();
    const teacher = host(async () => outcome({ actor: "teacher", persisted: false, gained: 0 }));
    const r3 = render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={teacher} />);
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await waitFor(() => expect(teacher.report).toHaveBeenCalledTimes(1));
    expect(document.querySelector(".learning-reader-study-outcome")).toBeNull();
    r3.unmount();
    const failing = host(async () => { throw new Error("network"); });
    render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={failing} />);
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await waitFor(() => expect(failing.report).toHaveBeenCalledTimes(1));
    expect(screen.getByText("✓ صحيح")).toBeTruthy();                                       // the local verdict stands
    expect(document.querySelector(".learning-reader-study-outcome")).toBeNull();
  });
  it("shortInput reports the typed text (the server normalizes); without a host nothing is sent and the old footer stays", async () => {
    const h = host();
    render(<PracticeBlockView question={SI} activityId="q3" pageId="p1" study={h} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  VLAN " } });
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    await waitFor(() => expect(h.report).toHaveBeenCalledWith("p1", "q3", { kind: "shortInput", text: "  VLAN " }));
    cleanup();
    const spy = vi.spyOn(globalThis, "fetch");
    render(<PracticeBlockView question={MC} />);
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    expect(screen.getByText("تمرين ذاتي: أجب لترى النتيجة فورًا. لا يُحفظ شيء ولا تُحسب نقاط.")).toBeTruthy();
    expect(document.querySelector(".learning-reader-study-outcome")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("PracticeTableView × study host", () => {
  it("the worksheet is ONE exercise: reported once when every cell is right (all choices), not before; reset clears the outcome; without a host the old footer stays", async () => {
    const h = host(async () => outcome({ page: { pageId: "p1", moduleId: "m1", completed: ["tbl"], eligible: 14 } }));
    render(<PracticeTableView block={TABLE} pageId="p1" study={h} />);
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: "خاص" } });
    await waitFor(() => {});
    expect(h.report).not.toHaveBeenCalled();                                                // one right cell is not the exercise
    fireEvent.change(selects[1], { target: { value: "خاص" } });                             // wrong second cell
    await waitFor(() => {});
    expect(h.report).not.toHaveBeenCalled();
    fireEvent.change(selects[1], { target: { value: "عام" } });
    await screen.findByText(/\+1 نقطة قوة/);
    expect(h.report).toHaveBeenCalledTimes(1);
    expect(h.report).toHaveBeenCalledWith("p1", "tbl", { kind: "practice-table", choices: { "0:1": "خاص", "1:1": "عام" } });
    fireEvent.click(screen.getByRole("button", { name: "امسح الإجابات" }));
    expect(screen.queryByText(/\+1 نقطة قوة/)).toBeNull();
    cleanup();
    render(<PracticeTableView block={TABLE} />);
    expect(screen.getByText(/لا يُحفظ شيء ولا تُحسب نقاط/)).toBeTruthy();
  });
});

describe("retry after a transport failure (review fix)", () => {
  it("PracticeBlockView: rejection → the same right answer again → a SECOND report → success shows +1 → the same answer once more → no third request", async () => {
    let fail = true;
    const h = host(async () => { if (fail) throw new Error("network"); return outcome(); });
    render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={h} />);
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await waitFor(() => expect(h.report).toHaveBeenCalledTimes(1));
    await waitFor(() => {});
    expect(document.querySelector(".learning-reader-study-outcome")).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "امسح الإجابة" }));
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await screen.findByText(/\+1 نقطة قوة — أحسنت، واصل الدراسة\./);
    expect(h.report).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "امسح الإجابة" }));
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await waitFor(() => {});
    expect(h.report).toHaveBeenCalledTimes(2);                                              // accepted once → never re-reported
    // a request still in flight is never duplicated by re-renders / re-picks
    let resolve!: (r: StudyAttemptResponse) => void;
    const slow = host(() => new Promise<StudyAttemptResponse>(res => { resolve = res; }));
    cleanup();
    render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={slow} />);
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    await waitFor(() => expect(slow.report).toHaveBeenCalledTimes(1));
    resolve(outcome());
    await screen.findByText(/\+1 نقطة قوة/);
    expect(slow.report).toHaveBeenCalledTimes(1);
  });
  it("PracticeTableView: the same sequence for the fully-right table", async () => {
    let fail = true;
    const h = host(async () => { if (fail) throw new Error("network"); return outcome({ page: { pageId: "p1", moduleId: "m1", completed: ["tbl"], eligible: 14 } }); });
    render(<PracticeTableView block={TABLE} pageId="p1" study={h} />);
    const fill = () => { const s = screen.getAllByRole("combobox") as HTMLSelectElement[]; fireEvent.change(s[0], { target: { value: "خاص" } }); fireEvent.change(s[1], { target: { value: "عام" } }); };
    fill();
    await waitFor(() => expect(h.report).toHaveBeenCalledTimes(1));
    await waitFor(() => {});
    expect(document.querySelector(".learning-reader-study-outcome")).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "امسح الإجابات" }));
    fill();
    await screen.findByText(/\+1 نقطة قوة/);
    expect(h.report).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "امسح الإجابات" }));
    fill();
    await waitFor(() => {});
    expect(h.report).toHaveBeenCalledTimes(2);
  });
  it("StudyOutcome case C: the module is complete (20 / 20) → the module-complete line, never a +n and never a page line", async () => {
    const h = host(async () => outcome({ gained: 0, alreadyCompleted: false, persisted: true, page: { pageId: "p1", moduleId: "m1", completed: ["q1"], eligible: 14 }, module: { completed: 14, eligible: 14, points: 20, max: 20 } }));
    render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={h} />);
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    const line = await screen.findByText(/أكملت نقاط قوة هذه الوحدة:/);
    expect(line.textContent).toBe("أكملت نقاط قوة هذه الوحدة: 20 / 20");
    expect(screen.queryByText(/لهذه الصفحة/)).toBeNull();
    expect(screen.queryByText(/\+1/)).toBeNull();
  });
  it("StudyOutcome case A: a real gain shows «+n نقطة قوة» with the module's new value (module formula, e.g. +2 → 3 / 20)", async () => {
    const h = host(async () => outcome({ gained: 2, page: { pageId: "p1", moduleId: "m1", completed: ["a", "q1"], eligible: 14 }, module: { completed: 2, eligible: 14, points: 3, max: 20 } }));
    render(<PracticeBlockView question={MC} activityId="q1" pageId="p1" study={h} />);
    fireEvent.click(screen.getByRole("radio", { name: /Access/ }));
    const line = await screen.findByText(/\+2 نقطة قوة/);
    expect(line.textContent).toBe("+2 نقطة قوة — أحسنت، واصل الدراسة. 3 / 20 من هذه الوحدة.");
  });
});
