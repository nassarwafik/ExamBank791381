// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import NumberConversionGame from "./NumberConversionGame";
import type { NumberConversionClient, ActiveState, PublicTask } from "./numberConversionClient";
import type { Bit } from "./conversion";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const TASK_45: PublicTask = { taskId: "t1", direction: "dec2bin", sourceBase: 10, targetBase: 2, sourceDisplay: "45", bitWidth: 8 };
const activeAt = (index: number, taskId: string, task: Partial<PublicTask> = {}): ActiveState => ({
  attemptId: "a", path: "dec-bin", level: "guided", total: 2, index, taskNumber: index + 1,
  currentTask: { ...TASK_45, taskId, ...task },
  attemptsOnCurrent: 0, resolved: index, correct: index, streak: index, bestStreak: index, startedAt: new Date().toISOString(), done: false,
});
const SOL_45: Bit[] = [0, 0, 1, 0, 1, 1, 0, 1];
function fakeClient(over: Partial<NumberConversionClient> = {}): NumberConversionClient {
  return {
    getState: vi.fn(async () => ({ ok: true, active: null, best: null })),
    start: vi.fn(async () => ({ ok: true, active: activeAt(0, "t1"), best: null })),
    answer: vi.fn(async () => ({ ok: true, correct: true, canonicalAnswer: "00101101", solutionBits: SOL_45, explanation: "45₁₀ → 32 + 8 + 4 + 1 → 00101101₂", done: false, state: activeAt(1, "t2") })),
    ...over,
  };
}
const answerInput = () => screen.getByLabelText(/الجواب النهائي/) as HTMLInputElement;
const checkButton = () => screen.getByRole("button", { name: "تحقّق" }) as HTMLButtonElement;
const typeAnswer = (v: string) => fireEvent.change(answerInput(), { target: { value: v } });
const startPlaying = async (client: NumberConversionClient) => {
  render(<NumberConversionGame token="t" onBack={vi.fn()} client={client} />);
  fireEvent.click(await screen.findByText("ابدأ التحدّي"));
  await screen.findByText("المهمة 1 / 2");
};

describe("NumberConversionGame — home → play → result", () => {
  it("shows the home screen, then starts a round on «ابدأ التحدّي»", async () => {
    const client = fakeClient();
    render(<NumberConversionGame token="t" onBack={vi.fn()} client={client} />);
    await screen.findByRole("heading", { level: 1, name: "تحدّي أنظمة العد" });
    expect(screen.getByText("ابدأ التحدّي")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /عشري ↔ ثنائي/ }));       // pick a path
    fireEvent.click(screen.getByText("ابدأ التحدّي"));
    await waitFor(() => expect(client.start).toHaveBeenCalled());
    expect(await screen.findByText("المهمة 1 / 2")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /الخانة بقيمة/ }).length).toBe(8);   // the board is the working method
    expect(answerInput()).toBeTruthy();                                              // the final answer field
    expect(checkButton()).toBeTruthy();
  });

  it("a correct typed answer shows the canonical answer + explanation, then «التالي» advances with a CLEARED answer", async () => {
    const client = fakeClient();
    await startPlaying(client);
    typeAnswer("101101");
    fireEvent.click(checkButton());
    await waitFor(() => expect(screen.getByText(/أحسنت!/)).toBeTruthy());
    expect(client.answer).toHaveBeenCalledWith("t1", [0, 0, 0, 0, 0, 0, 0, 0], "101101");   // bits = working board, answer = text
    expect(document.querySelector(".eb-ncgame-correct strong")?.textContent).toBe("00101101₂");   // canonical answer after resolution
    // resolved → the board shows the server's canonical solution bits (for teaching) and is locked
    expect(screen.getByRole("button", { name: "الخانة بقيمة 32: مضاءة" })).toBeTruthy();
    expect(answerInput().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(await screen.findByText("المهمة 2 / 2")).toBeTruthy();
    expect(answerInput().value).toBe("");                                          // no answer carried into the next task
    expect(answerInput().disabled).toBe(false);
  });

  it("first wrong → a hint; the board AND the typed answer stay (retry, no reveal)", async () => {
    const client = fakeClient({ answer: vi.fn(async () => ({ ok: true, correct: false, attempts: 1, hint: "بقي لديك 13." })) });
    await startPlaying(client);
    fireEvent.click(screen.getByRole("button", { name: "الخانة بقيمة 32: مطفأة" }));   // some working on the board
    typeAnswer("100000");
    fireEvent.click(checkButton());
    await waitFor(() => expect(screen.getByText(/بقي لديك 13/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "الخانة بقيمة 32: مضاءة" })).toBeTruthy();   // board kept
    expect(answerInput().value).toBe("100000");                                              // text kept, editable
    expect(answerInput().disabled).toBe(false);
    expect(answerInput().getAttribute("aria-describedby")).toBe("eb-ncgame-answer-msg");
    expect(checkButton()).toBeTruthy();
    expect(screen.queryByRole("button", { name: "التالي" })).toBeNull();
    expect(screen.queryByText(/00101101/)).toBeNull();                                        // not revealed
  });

  it("second wrong → canonical answer + solution + explanation revealed; waits for «التالي» (no auto-jump)", async () => {
    const client = fakeClient({ answer: vi.fn(async () => ({ ok: true, correct: false, revealed: true, attempts: 2, canonicalAnswer: "00101101", solutionBits: SOL_45, explanation: "45₁₀ → 32 + 8 + 4 + 1 → 00101101₂", done: false, state: activeAt(1, "t2") })) });
    await startPlaying(client);
    typeAnswer("111");
    fireEvent.click(checkButton());
    await waitFor(() => expect(screen.getByText(/الجواب الصحيح/)).toBeTruthy());
    expect(document.querySelector(".eb-ncgame-reveal strong")?.textContent).toBe("00101101₂");
    expect(screen.getByText("المهمة 1 / 2")).toBeTruthy();                        // still on the task until «التالي»
    expect(screen.getByRole("button", { name: "التالي" })).toBeTruthy();
  });

  it("finishing shows the SERVER result (score, %, best streak, time) and offers retry / new / back", async () => {
    const done = { ok: true, correct: true, canonicalAnswer: "00101101", solutionBits: SOL_45, explanation: "x", done: true, result: { correct: 2, total: 2, percentage: 100, bestStreak: 2, elapsedMs: 222000, at: "" }, best: { percentage: 100, correct: 2, total: 2, bestStreak: 2, elapsedMs: 222000, at: "" }, state: { ...activeAt(2, "t2"), currentTask: null, done: true } };
    const client = fakeClient({ answer: vi.fn(async () => done) });
    await startPlaying(client);
    typeAnswer("00101101");
    fireEvent.click(checkButton());
    fireEvent.click(await screen.findByRole("button", { name: "التالي" }));
    expect(await screen.findByText("2 / 2")).toBeTruthy();
    expect(document.querySelector(".eb-ncgame-percent")?.textContent).toBe("100%");
    expect(screen.getByText("03:42")).toBeTruthy();               // 222000 ms
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "تحدٍّ جديد" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "العودة إلى الألعاب" })).toBeTruthy();
  });

  it("resumes an unfinished attempt on mount (refresh-safe) — straight into play", async () => {
    const client = fakeClient({ getState: vi.fn(async () => ({ ok: true, active: activeAt(1, "t2"), best: null })) });
    render(<NumberConversionGame token="t" onBack={vi.fn()} client={client} />);
    expect(await screen.findByText("المهمة 2 / 2")).toBeTruthy();
    expect(client.start).not.toHaveBeenCalled();
    expect(answerInput().value).toBe("");
  });

  it("«إعادة المحاولة» after a RESUMED round preserves that round's path + level, not the defaults", async () => {
    const resumed: ActiveState = { ...activeAt(0, "t1"), path: "mixed", level: "challenge", total: 1, taskNumber: 1 };
    const done = {
      ok: true, correct: true, canonicalAnswer: "00101101", solutionBits: SOL_45, explanation: "x", done: true,
      result: { correct: 1, total: 1, percentage: 100, bestStreak: 1, elapsedMs: 1000, at: "" },
      state: { ...resumed, currentTask: null, done: true },
    };
    const client = fakeClient({
      getState: vi.fn(async () => ({ ok: true, active: resumed, best: null })),   // resume mixed + challenge
      answer: vi.fn(async () => done),
    });
    render(<NumberConversionGame token="t" onBack={vi.fn()} client={client} />);
    await screen.findByText("المهمة 1 / 1");
    typeAnswer("101101");
    fireEvent.click(checkButton());
    fireEvent.click(await screen.findByRole("button", { name: "التالي" }));
    fireEvent.click(await screen.findByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(client.start).toHaveBeenCalledWith("mixed", "challenge"));
    expect(await screen.findByText("المهمة 1 / 2")).toBeTruthy();
    expect(answerInput().value).toBe("");                                          // fresh round → cleared answer
  });
});

describe("NumberConversionGame — the final-answer field", () => {
  it("is a real, labelled LTR input with autocomplete off and spellcheck off; «تحقّق» is disabled while empty", async () => {
    await startPlaying(fakeClient());
    const input = answerInput();
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("dir")).toBe("ltr");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(input.getAttribute("inputmode")).toBe("numeric");                      // binary target
    expect(checkButton().disabled).toBe(true);
    typeAnswer("   ");
    expect(checkButton().disabled).toBe(true);                                    // whitespace only still counts as empty
    typeAnswer("1");
    expect(checkButton().disabled).toBe(false);
  });

  it("a hexadecimal target uses a text keypad; a decimal target uses a numeric keypad", async () => {
    const hex = fakeClient({ start: vi.fn(async () => ({ ok: true, active: activeAt(0, "t1", { direction: "bin2hex", sourceBase: 2, targetBase: 16, sourceDisplay: "10110110" }), best: null })) });
    await startPlaying(hex);
    expect(answerInput().getAttribute("inputmode")).toBe("text");
    cleanup();
    const dec = fakeClient({ start: vi.fn(async () => ({ ok: true, active: activeAt(0, "t1", { direction: "hex2dec", sourceBase: 16, targetBase: 10, sourceDisplay: "3A" }), best: null })) });
    await startPlaying(dec);
    expect(answerInput().getAttribute("inputmode")).toBe("numeric");
  });
});

describe("NumberConversionGame — NO premature answer reveal", () => {
  const DIRECTIONS: [PublicTask["direction"], number, number, string, string][] = [
    // direction, sourceBase, targetBase, sourceDisplay, the canonical answer that must NOT appear before Check
    ["dec2bin", 10, 2, "45", "00101101"],
    ["bin2dec", 2, 10, "00101101", "45"],
    ["bin2hex", 2, 16, "10110110", "B6"],
    ["hex2bin", 16, 2, "3A", "00111010"],
    ["dec2hex", 10, 16, "58", "3A"],
    ["hex2dec", 16, 10, "3A", "58"],
  ];
  it.each(DIRECTIONS)("%s: before Check the page shows the question, boxes, weights and the empty field — never the answer", async (direction, sourceBase, targetBase, sourceDisplay, canonical) => {
    const client = fakeClient({ start: vi.fn(async () => ({ ok: true, active: activeAt(0, "t1", { direction, sourceBase, targetBase, sourceDisplay }), best: null })) });
    await startPlaying(client);
    // put the CORRECT working on the board: the page must still not print the converted answer
    const value = parseInt(sourceDisplay, sourceBase);
    const bits = [128, 64, 32, 16, 8, 4, 2, 1].map(p => ((value & p) ? 1 : 0));
    const buttons = Array.from(document.querySelectorAll(".eb-ncb-bit")) as HTMLButtonElement[];
    bits.forEach((b, i) => { if (b) fireEvent.click(buttons[i]); });
    const main = document.querySelector("main") as HTMLElement;
    const text = main.textContent || "";
    const withoutSource = text.split(sourceDisplay).join("");                     // the source itself is part of the question
    expect(withoutSource).not.toContain(canonical);
    expect(main.querySelector(".eb-ncb-sum, .eb-ncb-derived, .eb-ncb-binary, .eb-ncb-nibble-hex")).toBeNull();
    expect(answerInput().placeholder).not.toContain(canonical);                  // the example is never the answer
    expect(answerInput().value).toBe("");
    expect(document.querySelectorAll(".eb-ncb-bit").length).toBe(8);
  });
});

describe("NumberConversionGame — a malformed answer is a FORMAT error, not a conflict", () => {
  it("keeps the task, the board and the typed text; shows the message; does NOT resync; attempts unchanged", async () => {
    const client = fakeClient({ answer: vi.fn(async () => ({ ok: false, error: "invalid-answer-format", message: "تحقّق من صيغة الإجابة.", taskId: "t1", targetBase: 2 })) });
    await startPlaying(client);
    const getStateCalls = (client.getState as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "الخانة بقيمة 32: مطفأة" }));   // working on the board
    typeAnswer("102010");
    fireEvent.click(checkButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("تحقّق من صيغة الإجابة.");
    expect(alert.textContent).toContain("⚠");                                     // not colour-only
    expect((client.getState as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(getStateCalls);   // no resync
    expect(screen.getByRole("button", { name: "الخانة بقيمة 32: مضاءة" })).toBeTruthy();   // bits kept
    expect(answerInput().value).toBe("102010");                                   // text kept
    expect(answerInput().getAttribute("aria-invalid")).toBe("true");
    expect(answerInput().getAttribute("aria-describedby")).toBe("eb-ncgame-answer-msg");
    expect(screen.getByText("المهمة 1 / 2")).toBeTruthy();                        // same task
    expect(screen.queryByRole("button", { name: "التالي" })).toBeNull();          // not resolved
    // editing the answer clears the format message
    typeAnswer("101101");
    expect(screen.queryByText("تحقّق من صيغة الإجابة.")).toBeNull();
  });

  it("a genuine stale/conflict response still resyncs from the server", async () => {
    const client = fakeClient({
      answer: vi.fn(async () => ({ ok: false, error: "stale-task", expectedTaskId: "t2" })),
      getState: vi.fn(async () => ({ ok: true, active: null, best: null })),
    });
    await startPlaying(client);
    const before = (client.getState as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    typeAnswer("101101");
    fireEvent.click(checkButton());
    await waitFor(() => expect((client.getState as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(before + 1));
  });
});
