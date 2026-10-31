// @vitest-environment happy-dom
// 791381s Phase 3 — the STRUCTURED exercises in the Reader (مخزن كلمات · وصل · ترتيب · تصنيف): each surface keeps its draft,
// «تحقّق» sends a complete response, every part then shows right / wrong (never colour only), reveal mode locks and shows
// «الصحيح: …» beside a wrong part, outside reveal mode an edit clears the verdict and the learner checks again; a served block
// carries the presentation only and takes the verdict per part from the server.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import PracticeBlockView from "./PracticeBlockView";
import { localEvaluator } from "../practice/evaluator";
import { servedBlock } from "../study/checkIndex";
import type { StudyAttemptResponse, StudyHost, StudyResponse } from "../study/types";
import type { PracticeQuestion } from "../content/types";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const WB: PracticeQuestion = {
  kind: "wordBank", prompt: "أكمل:", segments: ["الفرق هو ", { blank: "b1" }, " و", { blank: "b2" }, "."],
  bank: ["المسافة", "السرعة", "الحجم"], answers: { b1: "الحجم", b2: "المسافة" }, feedback: { explanation: "الفرق هو الحجم والمسافة." },
};
const MT: PracticeQuestion = {
  kind: "matching", prompt: "صِل:", left: [{ id: "pan", text: "PAN" }, { id: "wan", text: "WAN" }],
  right: [{ id: "r1", text: "بين مدن أو دول" }, { id: "r2", text: "أجهزة قريبة جدًا" }], pairs: { pan: "r2", wan: "r1" }, feedback: { explanation: "PAN قريب، WAN بعيد." },
};
const OR: PracticeQuestion = {
  kind: "ordering", prompt: "رتّب:", items: [{ id: "wan", text: "WAN" }, { id: "pan", text: "PAN" }, { id: "lan", text: "LAN" }],
  order: ["pan", "lan", "wan"], feedback: { explanation: "PAN ← LAN ← WAN." },
};
const CL: PracticeQuestion = {
  kind: "classify", prompt: "صنّف:", groups: [{ id: "use", text: "استخدام" }, { id: "admin", text: "إدارة" }],
  items: [{ id: "i1", text: "مشاركة الملفات" }, { id: "i2", text: "فحص الاتصال" }], assign: { i1: "use", i2: "admin" }, feedback: { explanation: "…" },
};
const check = () => fireEvent.click(screen.getByRole("button", { name: "تحقّق" }));
const chip = (w: string) => within(screen.getByRole("group", { name: "مخزن الكلمات" })).getByRole("button", { name: w });

describe("wordBank — مخزن الكلمات", () => {
  it("chips fill the blanks in turn, a filled blank gives its word back, «تحقّق» waits for every blank", () => {
    render(<PracticeBlockView question={WB} activityId="q" />);
    const checkBtn = screen.getByRole("button", { name: "تحقّق" }) as HTMLButtonElement;
    expect(checkBtn.disabled).toBe(true);
    fireEvent.click(chip("الحجم"));
    expect(screen.getByRole("button", { name: "الفراغ 1: الحجم" })).toBeTruthy();
    expect((chip("الحجم") as HTMLButtonElement).disabled).toBe(true);                    // each chip once
    fireEvent.click(chip("السرعة"));
    expect(checkBtn.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "الفراغ 2: السرعة" }));          // give it back
    expect(screen.getByRole("button", { name: "الفراغ 2: فارغ" })).toBeTruthy();
    expect((chip("السرعة") as HTMLButtonElement).disabled).toBe(false);
    expect(checkBtn.disabled).toBe(true);
  });

  it("outside reveal mode: a wrong check marks each blank, an edit clears the verdict, a right re-check says ✓ صحيح", () => {
    const { container } = render(<PracticeBlockView question={WB} activityId="q" />);
    fireEvent.click(chip("الحجم")); fireEvent.click(chip("السرعة")); check();
    expect(screen.getByText(/✕ غير صحيح/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "الفراغ 1: الحجم" }).className).toContain("is-right");
    expect(screen.getByRole("button", { name: "الفراغ 2: السرعة" }).className).toContain("is-wrong");
    expect(container.textContent).not.toContain("الصحيح: المسافة");                     // no key outside reveal mode
    fireEvent.click(screen.getByRole("button", { name: "الفراغ 2: السرعة" }));
    expect(screen.queryByText(/✕ غير صحيح/)).toBeNull();
    fireEvent.click(chip("المسافة")); check();
    expect(screen.getByText(/✓ صحيح/)).toBeTruthy();
  });

  it("reveal mode: locks after the check and shows «الصحيح: …» beside the wrong blank, with the explanation", () => {
    render(<PracticeBlockView question={WB} activityId="q" reveal />);
    fireEvent.click(chip("الحجم")); fireEvent.click(chip("السرعة")); check();
    expect(screen.getByText("الصحيح: المسافة")).toBeTruthy();
    expect(screen.getByText(/التصحيح ظاهر بجانب كل جزء/)).toBeTruthy();
    expect(screen.getByText(WB.feedback!.explanation!)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "تحقّق" })).toBeNull();
    expect((chip("المسافة") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "أعد السؤال" }));
    expect(screen.getByRole("button", { name: "الفراغ 1: فارغ" })).toBeTruthy();
  });
});

describe("matching — وصل", () => {
  it("a select per item; reveal shows the right match beside a wrong row", () => {
    render(<PracticeBlockView question={MT} activityId="q" reveal />);
    fireEvent.change(screen.getByLabelText("PAN"), { target: { value: "r1" } });
    fireEvent.change(screen.getByLabelText("WAN"), { target: { value: "r2" } });
    check();
    expect(screen.getAllByText(/^الصحيح:/).map(n => n.textContent)).toEqual(["الصحيح: أجهزة قريبة جدًا", "الصحيح: بين مدن أو دول"]);
    expect((screen.getByLabelText("PAN") as HTMLSelectElement).disabled).toBe(true);
  });
});

describe("ordering — ترتيب", () => {
  it("▲ / ▼ move items; a right order says ✓ صحيح; reveal on a wrong order lists «الترتيب الصحيح»", () => {
    const { unmount } = render(<PracticeBlockView question={OR} activityId="q" />);
    fireEvent.click(screen.getByRole("button", { name: "انقل للأعلى: PAN" }));          // PAN, WAN, LAN
    fireEvent.click(screen.getByRole("button", { name: "انقل للأسفل: WAN" }));          // PAN, LAN, WAN
    check();
    expect(screen.getByText(/✓ صحيح/)).toBeTruthy();
    unmount();
    const { container } = render(<PracticeBlockView question={OR} activityId="q" reveal />);
    check();                                                                            // the authored (scrambled) order
    expect(screen.getByRole("status").textContent).toContain("✕ إجابة خاطئة");
    expect(screen.getByText("الترتيب الصحيح:")).toBeTruthy();
    expect([...container.querySelectorAll(".learning-practice-fixlist li")].map(li => li.textContent)).toEqual(["PAN", "LAN", "WAN"]);
    expect(screen.queryByRole("button", { name: /انقل/ })).toBeNull();
  });
});

describe("the local evaluator — structured kinds (all parts, in order)", () => {
  it("judges every kind: right only when every part is right; ordering needs the exact order", () => {
    expect(localEvaluator.evaluate(OR, { kind: "ordering", order: ["pan", "lan", "wan"] }).status).toBe("correct");
    expect(localEvaluator.evaluate(OR, { kind: "ordering", order: ["lan", "pan", "wan"] }).status).toBe("incorrect");
    expect(localEvaluator.evaluate(OR, { kind: "ordering", order: ["pan", "lan"] }).status).toBe("incorrect");
    expect(localEvaluator.evaluate(WB, { kind: "wordBank", choices: { b1: "الحجم", b2: "المسافة" } }).status).toBe("correct");
    expect(localEvaluator.evaluate(WB, { kind: "wordBank", choices: { b1: "الحجم" } }).status).toBe("incorrect");
    expect(localEvaluator.evaluate(MT, { kind: "matching", choices: { pan: "r1", wan: "r2" } }).status).toBe("incorrect");
    expect(localEvaluator.evaluate(CL, { kind: "classify", choices: { i1: "use", i2: "admin" } }).status).toBe("correct");
    expect(localEvaluator.evaluate({ ...OR, order: undefined } as PracticeQuestion, { kind: "ordering", order: [] }).status).toBe("unknown");
  });
});

describe("classify — تصنيف", () => {
  it("one group per item; «تحقّق» waits for every item; reveal shows the right group", () => {
    render(<PracticeBlockView question={CL} activityId="q" reveal />);
    const rows = screen.getAllByRole("radiogroup");
    fireEvent.click(within(rows[0]).getByRole("radio", { name: "إدارة" }));
    expect((screen.getByRole("button", { name: "تحقّق" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(rows[1]).getByRole("radio", { name: "إدارة" }));
    check();
    expect(screen.getByText("الصحيح: استخدام")).toBeTruthy();
  });
});

describe("served structured blocks", () => {
  const reply = (over: Partial<StudyAttemptResponse>): StudyAttemptResponse => ({ ok: true, actor: "student", correct: false, persisted: false, alreadyCompleted: false, gained: 0, study: true, page: { pageId: "p", moduleId: "m", completed: [], eligible: 1 }, module: { completed: 0, eligible: 1, points: 0, max: 20 }, totalPoints: 0, ...over });

  it("the served body keeps the presentation and drops every key field", () => {
    for (const q of [WB, MT, OR, CL]) {
      const s = servedBlock({ id: "q", type: "practice", origin: "teacher-enrichment", reveal: true, question: q });
      const json = JSON.stringify(s);
      expect(json, q.kind).not.toMatch(/"answers"|"pairs"|"order"|"assign"|"feedback"|explanation/);
      expect(s).toMatchObject({ serverCheck: true, reveal: true });
    }
  });

  it("the verdict per part and the reveal come from the server's reply", async () => {
    const served = servedBlock({ id: "q", type: "practice", origin: "teacher-enrichment", reveal: true, question: WB }) as Extract<ReturnType<typeof servedBlock>, { type: "practice" }>;
    const report = vi.fn(async (_p: string, _a: string, _r: StudyResponse) => reply({ parts: { b1: true, b2: false }, reveal: { kind: "wordBank", answers: { b1: "الحجم", b2: "المسافة" } }, feedback: { explanation: "شرح الخادم" } }));
    const host = { pageStatus: () => ({ kind: "ready", completed: new Set<string>(), eligible: 1, module: null }), report } as StudyHost;
    render(<PracticeBlockView question={served.question} activityId="q" pageId="p" study={host} serverCheck reveal />);
    fireEvent.click(chip("الحجم")); fireEvent.click(chip("السرعة")); check();
    await screen.findByText("شرح الخادم");
    expect(report).toHaveBeenCalledWith("p", "q", { kind: "wordBank", choices: { b1: "الحجم", b2: "السرعة" } });
    expect(screen.getByRole("button", { name: "الفراغ 2: السرعة" }).className).toContain("is-wrong");
    expect(screen.getByText("الصحيح: المسافة")).toBeTruthy();
  });
});
