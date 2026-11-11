// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, within, screen, act } from "@testing-library/react";
import { createRequire } from "node:module";
import AiExamComposerDialog from "./AiExamComposerDialog";
import { formatElapsed, sectionProgress, stepStates, stillWorkingText, STILL_WORKING_AFTER_MS, STILL_WORKING_TEXT } from "./composerProgress";
import { STAGE_LABELS, type ComposerTransport } from "./composerRun";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";

// Phase 21Z — the composer's progress view never looks frozen: each step is ✓ done / running (a spinner) / pending, an elapsed clock
// ticks every second (outside the live region), the sections step shows a progress bar, and a reassurance line appears once a request
// has been quiet for 20 s. A repair attempt keeps its step running. Cancel still works, and one polite status remains.
afterEach(() => { vi.useRealTimers(); cleanup(); });
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

describe("21Z-PURE", () => {
  it("step states: before / at / after the running step; an unknown step means the first one runs", () => {
    const S = ["a", "b", "c", "d"];
    expect(stepStates(S, "c")).toEqual(["done", "done", "current", "pending"]);
    expect(stepStates(S, "a")).toEqual(["current", "pending", "pending", "pending"]);
    expect(stepStates(S, "")).toEqual(["current", "pending", "pending", "pending"]);
    expect(stepStates(S, "zzz")).toEqual(["current", "pending", "pending", "pending"]);
  });
  it("the clock reads m:ss; the reassurance line starts at 20 s; the sections bar is clamped", () => {
    expect([0, 999, 1000, 59_999, 60_000, 75_000, 3_725_000, -5, NaN].map(formatElapsed)).toEqual(["0:00", "0:00", "0:01", "0:59", "1:00", "1:15", "62:05", "0:00", "0:00"]);
    expect(stillWorkingText(STILL_WORKING_AFTER_MS - 1)).toBeNull();
    expect(stillWorkingText(STILL_WORKING_AFTER_MS)).toBe(STILL_WORKING_TEXT);
    expect(sectionProgress({ done: 1, total: 4 })).toEqual({ done: 1, total: 4, percent: 25 });
    expect(sectionProgress({ done: 9, total: 4 })).toEqual({ done: 4, total: 4, percent: 100 });
    expect(sectionProgress({ done: -1, total: 3 })).toEqual({ done: 0, total: 3, percent: 0 });
    expect([sectionProgress(null), sectionProgress({ done: 0, total: 0 })]).toEqual([null, null]);
  });
});

const { handler } = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ jsonBody: Record<string, unknown> }> };
const PLAN = F.plan("امتحان قصير", "default", [
  F.planSection("القسم أ", [F.planItem("multipleChoice", 1)]),
  F.planSection("القسم ب", [F.planItem("multipleChoice", 1)])
]);
const SEC = (text: string) => ({ items: [F.item("multipleChoice", { question: F.mcq(text, ["أ", "ب", "ج"], 1) })] });
const empty = { examId: "E21Z", title: "t", status: "draft", schemaVersion: 2, sections: [] } as unknown as StructuredExam;
/** The real endpoint with a scripted model; each request waits for its gate, so the test sees every step while it runs. */
function gated() {
  const ai = F.scriptedAi({ ai_exam_plan: [PLAN], ai_exam_section: [SEC("ما وظيفة VLAN؟"), SEC("ما وظيفة DNS؟")] });
  const waiting: (() => void)[] = [];
  const transport: ComposerTransport = async body => {
    await new Promise<void>(r => waiting.push(r));
    return (await handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t21z" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody;
  };
  return { transport, release: async () => { waiting.shift()!(); await tick(60); } };
}
function start(transport: ComposerTransport) {
  render(<AiExamComposerDialog open onClose={() => {}} transport={transport} exam={empty} getLatestExam={() => empty} onApply={() => "ok"} onPreview={() => {}} />);
  const d = screen.getByRole("dialog");
  fireEvent.change(within(d).getByRole("textbox", { name: "المادة (مطلوب)" }), { target: { value: "الشبكات" } });
  fireEvent.change(within(d).getByRole("spinbutton", { name: "مجموع العلامات (مطلوب)" }), { target: { value: "2" } });
  fireEvent.click(within(d).getByRole("button", { name: "إنشاء الامتحان" }));
  return d;
}
const states = (d: HTMLElement) => [...d.querySelectorAll(".ai-composer-stages li")].map(li => li.getAttribute("data-step-state"));
const bar = (d: HTMLElement) => within(d).queryByRole("progressbar", { name: "الأقسام المكتملة" });

describe("21Z-UI the progress view", () => {
  it("steps turn ✓ as the run advances, the running one has the spinner, and the sections bar follows each section", async () => {
    const g = gated();
    const d = start(g.transport);
    await tick(30);
    // planning: «تحليل» is done, «الخطة» runs
    expect(states(d)).toEqual(["done", "current", "pending", "pending", "pending"]);
    const items = [...d.querySelectorAll<HTMLElement>(".ai-composer-stages li")];
    expect(items[0].querySelector(".ai-composer-step-mark")?.textContent).toBe("✓");
    expect(items[0].textContent).toBe("✓" + STAGE_LABELS.intent + " — اكتملت");       // the state is text, not colour alone
    expect(items[1].querySelector(".ai-composer-spinner")).toBeTruthy();
    expect(items[1].getAttribute("aria-current")).toBe("step");
    expect(items[1].textContent).toBe(STAGE_LABELS.plan);
    expect(items[2].querySelector(".ai-composer-spinner, .ai-composer-step-mark")).toBeNull();
    expect(bar(d)).toBeNull();
    expect(within(d).getAllByRole("status")).toHaveLength(1);                           // still ONE polite status

    await g.release();                                                                   // the plan arrives → section 1 of 2
    expect(states(d)).toEqual(["done", "done", "current", "pending", "pending"]);
    expect([bar(d)!.getAttribute("aria-valuenow"), bar(d)!.getAttribute("aria-valuemax"), bar(d)!.getAttribute("aria-valuetext")]).toEqual(["0", "2", "اكتمل 0 من 2"]);
    expect(d.querySelector(".ai-composer-detail")!.textContent).toContain("القسم 1 من 2");

    await g.release();                                                                   // section 1 arrives → section 2 of 2
    expect(states(d)).toEqual(["done", "done", "current", "pending", "pending"]);
    expect(bar(d)!.getAttribute("aria-valuenow")).toBe("1");
    expect((bar(d)!.firstElementChild as HTMLElement).style.inlineSize).toBe("50%");

    await g.release();                                                                   // section 2 arrives → the summary
    await within(d).findByTestId("ai-composer-summary", {}, { timeout: 3000 });
    expect(within(d).queryByTestId("ai-composer-progress")).toBeNull();
  });

  it("the clock ticks every second outside the live region, and the reassurance line appears after 20 quiet seconds", async () => {
    const hang: ComposerTransport = () => new Promise(() => {});
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });               // setTimeout stays real (tick)
    const d = start(hang);
    await tick(30);
    const clock = within(d).getByTestId("ai-composer-elapsed");
    expect(clock.closest("[role='status'], [aria-live]")).toBeNull();
    const before = clock.textContent;
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(clock.textContent).not.toBe(before);
    expect(clock.textContent).toMatch(/الوقت المنقضي: 0:0[3-4]/);
    expect(within(d).queryByTestId("ai-composer-still")).toBeNull();
    await act(async () => { vi.advanceTimersByTime(STILL_WORKING_AFTER_MS); });
    expect(within(d).getByTestId("ai-composer-still").textContent).toBe(STILL_WORKING_TEXT);
    expect(states(d)).toEqual(["done", "current", "pending", "pending", "pending"]);     // still on its step
    vi.useRealTimers();
    fireEvent.click(within(d).getByRole("button", { name: "إلغاء" }));                    // cancel still works
    await tick(30);
    expect(within(d).queryByTestId("ai-composer-progress")).toBeNull();
    expect(within(d).getByRole("alert").textContent).toContain("أُلغي الطلب");
  });

  it("a repair attempt keeps its step running and is the announced step; the quiet clock restarts with the new attempt", async () => {
    const ai = F.scriptedAi({ ai_exam_plan: [{ nonsense: true }, PLAN], ai_exam_section: [SEC("ما وظيفة VLAN؟"), SEC("ما وظيفة DNS؟")] });
    const waiting: (() => void)[] = [];
    const transport: ComposerTransport = async body => { await new Promise<void>(r => waiting.push(r)); return (await handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t21z" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody; };
    const d = start(transport);
    await tick(30);
    waiting.shift()!(); await tick(60);                                                  // the invalid plan → a repair attempt starts
    expect(within(d).getByRole("status").textContent).toBe(STAGE_LABELS.repair);
    expect(states(d)).toEqual(["done", "current", "pending", "pending", "pending", "current"]);
    const current = [...d.querySelectorAll('[aria-current="step"]')];
    expect(current.map(e => e.textContent)).toEqual([STAGE_LABELS.repair]);              // one announced step
    expect(d.querySelectorAll(".ai-composer-spinner")).toHaveLength(2);                  // the plan step keeps running
  });
});
