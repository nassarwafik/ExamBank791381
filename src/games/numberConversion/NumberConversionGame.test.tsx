// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import NumberConversionGame from "./NumberConversionGame";
import type { NumberConversionClient, ActiveState } from "./numberConversionClient";
import type { Bit } from "./conversion";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const activeAt = (index: number, taskId: string): ActiveState => ({
  attemptId: "a", path: "dec-bin", level: "guided", total: 2, index, taskNumber: index + 1,
  currentTask: { taskId, direction: "dec2bin", sourceBase: 10, targetBase: 2, sourceDisplay: "45", bitWidth: 8 },
  attemptsOnCurrent: 0, resolved: index, correct: index, streak: index, bestStreak: index, startedAt: new Date().toISOString(), done: false,
});
function fakeClient(over: Partial<NumberConversionClient> = {}): NumberConversionClient {
  return {
    getState: vi.fn(async () => ({ ok: true, active: null, best: null })),
    start: vi.fn(async () => ({ ok: true, active: activeAt(0, "t1"), best: null })),
    answer: vi.fn(async () => ({ ok: true, correct: true, explanation: "x", done: false, state: activeAt(1, "t2") })),
    ...over,
  };
}

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
    expect(screen.getByRole("button", { name: "تحقّق" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /الخانة بقيمة/ }).length).toBe(8);   // the board is the interaction
  });

  it("a correct check shows an explanation, then «التالي» advances to the next task", async () => {
    const client = fakeClient();
    render(<NumberConversionGame token="t" onBack={vi.fn()} client={client} />);
    await screen.findByText("ابدأ التحدّي");
    fireEvent.click(screen.getByText("ابدأ التحدّي"));
    await screen.findByText("المهمة 1 / 2");
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    await waitFor(() => expect(screen.getByText(/أحسنت!/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(await screen.findByText("المهمة 2 / 2")).toBeTruthy();
  });

  it("first wrong → a hint and the board stays (retry, no reveal)", async () => {
    const client = fakeClient({ answer: vi.fn(async () => ({ ok: true, correct: false, attempts: 1, hint: "بقي لديك 13." })) });
    render(<NumberConversionGame token="t" onBack={vi.fn()} client={client} />);
    await screen.findByText("ابدأ التحدّي");
    fireEvent.click(screen.getByText("ابدأ التحدّي"));
    await screen.findByText("المهمة 1 / 2");
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    await waitFor(() => expect(screen.getByText(/بقي لديك 13/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "تحقّق" })).toBeTruthy();          // still on the task, can retry
    expect(screen.queryByRole("button", { name: "التالي" })).toBeNull();
  });

  it("second wrong → reveal with the solution + explanation, then «التالي»", async () => {
    const solutionBits: Bit[] = [0, 0, 1, 0, 1, 1, 0, 1];
    const client = fakeClient({ answer: vi.fn(async () => ({ ok: true, correct: false, revealed: true, attempts: 2, solutionBits, explanation: "45 = 32 + 8 + 4 + 1 → 00101101₂", done: false, state: activeAt(1, "t2") })) });
    render(<NumberConversionGame token="t" onBack={vi.fn()} client={client} />);
    await screen.findByText("ابدأ التحدّي");
    fireEvent.click(screen.getByText("ابدأ التحدّي"));
    await screen.findByText("المهمة 1 / 2");
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
    await waitFor(() => expect(screen.getByText(/الحل الصحيح/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "التالي" })).toBeTruthy();
  });

  it("finishing shows the SERVER result (score, %, best streak, time) and offers retry / new / back", async () => {
    const done = { ok: true, correct: true, explanation: "x", done: true, result: { correct: 2, total: 2, percentage: 100, bestStreak: 2, elapsedMs: 222000, at: "" }, best: { percentage: 100, correct: 2, total: 2, bestStreak: 2, elapsedMs: 222000, at: "" }, state: { ...activeAt(2, "t2"), currentTask: null, done: true } };
    const client = fakeClient({ answer: vi.fn(async () => done) });
    render(<NumberConversionGame token="t" onBack={vi.fn()} client={client} />);
    await screen.findByText("ابدأ التحدّي");
    fireEvent.click(screen.getByText("ابدأ التحدّي"));
    await screen.findByText("المهمة 1 / 2");
    fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
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
  });
});
