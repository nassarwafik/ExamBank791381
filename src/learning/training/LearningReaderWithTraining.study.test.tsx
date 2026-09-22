// @vitest-environment happy-dom
// Study Practice Strength — the Reader-plus-training HOST over the REAL 791381 content with a fake study transport:
// the study state is read ONCE per mount; a page with eligible exercises shows «تمارين الدراسة في هذه الصفحة: 0 / n»;
// answering right updates it from the SERVER's response (1 / 2, then 2 / 2, a third right answer never exceeds);
// a previously earned state loads; a repeat never shows a false +1; the same works inside Presentation Mode and
// survives a training round-trip; the CLI page and a page without exercises show no study UI; no host → nothing.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import { resolve } from "path";
import LearningReaderWithTraining from "./LearningReaderWithTraining";
import { createRestrictedReaderContentApi } from "../reader/restrictedContentApi";
import type { TrainingClient, TrainingListEntry, TrainingLoadResponse, TrainingSubmitResponse } from "./types";
import type { StudyClient, StudyAttemptResponse, StudyResponse, StudyStateResponse, StudyActivityKey } from "../study/types";
import type { Question } from "../../StudentQuestionCard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ""; });
const SLOW = { timeout: 10000 }, T = 40000;
type Index = { pages: Record<string, { moduleId: string; activities: Record<string, StudyActivityKey> }> };
const INDEX: Index = JSON.parse(readFileSync(resolve(process.cwd(), "api/src/data/learning-study/791381.json"), "utf8"));
const M08 = "791381-m08";
// a real m08 page with ≥ 3 eligible MULTIPLE-CHOICE exercises (clickable in this test) …
const PAGE = Object.entries(INDEX.pages).find(([, p]) => p.moduleId === M08 && Object.values(p.activities).filter(k => k.kind === "multipleChoice").length >= 3)!;
const PAGE_ID = PAGE[0];
const MC = Object.entries(PAGE[1].activities).filter(([, k]) => k.kind === "multipleChoice") as [string, Extract<StudyActivityKey, { kind: "multipleChoice" }>][];
const CLI_PAGE = "791381-m22-l02-p01";
const jump = () => screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement;
const goTo = async (id: string) => { fireEvent.change(jump(), { target: { value: id } }); await waitFor(() => expect(jump().value).toBe(id)); };
const bar = () => document.querySelector(".learning-reader-study") as HTMLElement | null;

/** A fake study SERVER: judges against the real index keys, keeps completion state, module points = round(completed / eligible × 20). */
const MODULE_ELIGIBLE = (mid: string) => Object.values(INDEX.pages).filter(p => p.moduleId === mid).reduce((n, p) => n + Object.keys(p.activities).length, 0);
const PAGE_ELIGIBLE = Object.keys(INDEX.pages[PAGE_ID].activities).length;
const M08_ELIGIBLE = MODULE_ELIGIBLE(M08);
const modPts = (completed: number, eligible: number) => (eligible ? Math.min(20, Math.round(completed / eligible * 20)) : 0);
function fakeStudy(seeded: Record<string, string[]> = {}) {
  const completed: Record<string, Set<string>> = {};
  for (const [pid, ids] of Object.entries(seeded)) completed[pid] = new Set(ids);
  const pageView = (pid: string) => { const ids = [...(completed[pid] ?? [])].sort(); return { moduleId: INDEX.pages[pid].moduleId, completed: ids, eligible: Object.keys(INDEX.pages[pid].activities).length }; };
  const moduleView = (mid: string) => { const c = Object.keys(completed).filter(p => INDEX.pages[p].moduleId === mid).reduce((n, p) => n + completed[p].size, 0), e = MODULE_ELIGIBLE(mid); return { completed: c, eligible: e, points: modPts(c, e), max: 20 }; };
  const judge = (key: StudyActivityKey, r: StudyResponse) => key.kind === "multipleChoice" && r.kind === "multipleChoice" && key.correct.includes(r.optionId);
  const state = vi.fn(async (): Promise<StudyStateResponse> => ({ ok: true, actor: "student", courseId: "791381", policy: { modulePointsMax: 20, moduleCount: 28 }, pages: Object.fromEntries(Object.keys(completed).map(p => [p, pageView(p)])), modules: Object.fromEntries([...new Set(Object.keys(completed).map(p => INDEX.pages[p].moduleId))].map(m => [m, moduleView(m)])), totalPoints: 0 }));
  const attempt = vi.fn(async (_c: string, pageId: string, activityId: string, response: StudyResponse): Promise<StudyAttemptResponse> => {
    const key = INDEX.pages[pageId]?.activities[activityId];
    if (!key) throw new Error("404");
    const correct = judge(key, response);
    const mid = INDEX.pages[pageId].moduleId;
    const before = moduleView(mid).points;
    const already = completed[pageId]?.has(activityId) ?? false;
    if (correct && !already) (completed[pageId] = completed[pageId] ?? new Set()).add(activityId);
    const page = pageView(pageId);
    const module = moduleView(mid);
    return { ok: true, actor: "student", correct, persisted: correct && !already, alreadyCompleted: correct && already, gained: correct && !already ? module.points - before : 0, page: { pageId, ...page }, module, totalPoints: module.points };
  });
  return { state, attempt } as StudyClient & { state: typeof state; attempt: typeof attempt };
}
const meta = (id: string, order: number, mod: string, extra: Partial<TrainingListEntry> = {}): TrainingListEntry =>
  ({ trainingId: id, order, label: "تدريب " + order, requiredModuleId: mod, courseId: "791381", available: false, strengthEligible: true, ...extra });
const questions: Question[] = Array.from({ length: 2 }, (_, i) => ({ examQuestionId: `LIB-T01-Q${i + 1}`, presentationType: "multipleChoice", marks: 10, text: `سؤال ${i + 1}`, options: [{ value: "0", text: "أ" }, { value: "1", text: "ب" }], answer: {}, hint: "" } as unknown as Question));
function fakeTraining() {
  const list: TrainingListEntry[] = [meta("T01", 1, "791381-m01", { available: true, title: "أساسيات الشبكات" }), meta("T02", 2, "791381-m02"), meta("T03", 3, "791381-m07"), meta("T04", 4, "791381-m07")];
  const loaded: TrainingLoadResponse = { ok: true, actor: "student", training: { ...list[0], title: "أساسيات الشبكات", questionCount: 2, totalMarks: 20, maxPoints: 40 }, exam: { questions } };
  const graded: TrainingSubmitResponse = { ok: true, actor: "student", persisted: true, result: { correctCount: 2, questionCount: 2, score: 20, totalMarks: 20, percentage: 100, review: questions.map((q, i) => ({ questionId: q.examQuestionId!, questionNumber: i + 1, correct: true, chosenIndex: 0, correctOptionIndex: 0, hint: "" })) }, practice: { bestPercentage: 100, bestPoints: 40, maxPoints: 40, attempts: 1, lastCompletedAt: null, improved: true, pointsGained: 40, earnedPoints: 40 } };
  return { list: vi.fn(async () => ({ ok: true as const, actor: "student" as const, trainings: list })), load: vi.fn(async () => loaded), submit: vi.fn(async () => graded) } as TrainingClient;
}
function mount(study: StudyClient | null, onStudyPointsEarned = vi.fn()) {
  const api = createRestrictedReaderContentApi("791381", ["791381-m01", "791381-m02", M08, "791381-m22"]);
  render(<LearningReaderWithTraining courseId="791381" api={api} onExit={vi.fn()} exitLabel="العودة إلى موادي التعليمية" client={fakeTraining()} actor="student" study={study} onStudyPointsEarned={onStudyPointsEarned} />);
  return onStudyPointsEarned;
}
/** The page's keyed multiple-choice blocks (prompt + the correct option text), from the REAL module body. */
type McBlock = { id: string; prompt: string; correctText: string };
let MC_BLOCKS: McBlock[] = [];
async function loadMcBlocks() {
  const { loadModuleContent } = await import("../content/registry");
  const mod = await loadModuleContent("791381", M08);
  const page = mod.lessons.flatMap(l => l.pages).find(p => p.id === PAGE_ID)!;
  MC_BLOCKS = page.blocks.flatMap(b => (b.type === "practice" && b.question.kind === "multipleChoice" && b.question.options.some(o => o.correct === true))
    ? [{ id: b.id, prompt: b.question.prompt, correctText: b.question.options.find(o => o.correct === true)!.text }] : []);
  expect(MC_BLOCKS.map(b => b.id)).toEqual(MC.map(([id]) => id));                       // the Reader's blocks ARE the index's activities
}
/** Click the correct option of the n-th keyed multiple-choice exercise of PAGE (located by its prompt). */
async function answerRight(n: number) {
  const b = MC_BLOCKS[n];
  const prompt = await screen.findAllByText(b.prompt, {}, SLOW);
  const root = prompt[0].closest(".learning-reader-practice") as HTMLElement;
  const radios = within(root).getAllByRole("radio");
  const target = radios.find(r => (r.textContent || "").replace(/[●○]/g, "").trim() === b.correctText.trim());
  expect(target, "radio for " + b.correctText).toBeTruthy();
  fireEvent.click(target!);
}

describe("study bar + exercises on a real page (normal view)", () => {
  it("0 / n → 1 / n → 2 / n → 3 / n on the page while the MODULE's points follow round(completed / 14 × 20) (1, 3, 4); the state is read once; Strength refresh is signalled on gains only", async () => {
    await loadMcBlocks();
    const study = fakeStudy();
    const earned = mount(study);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await waitFor(() => expect(study.state).toHaveBeenCalledTimes(1));
    await goTo(PAGE_ID);
    await waitFor(() => expect(bar()).toBeTruthy(), SLOW);
    expect(bar()!.textContent).toContain("تمارين الدراسة في هذه الصفحة: 0 / " + PAGE_ELIGIBLE);
    expect(bar()!.textContent).not.toContain("الوحدة");                                    // no module line before any completion
    const p1 = modPts(1, M08_ELIGIBLE), p2 = modPts(2, M08_ELIGIBLE), p3 = modPts(3, M08_ELIGIBLE);
    expect([p1, p2, p3]).toEqual([1, 3, 4]);                                                // m08: 14 eligible activities
    await answerRight(0);
    await waitFor(() => expect(bar()!.textContent).toContain("تمارين الدراسة في هذه الصفحة: 1 / " + PAGE_ELIGIBLE));
    expect(screen.getByText(/\+1 نقطة قوة — أحسنت، واصل الدراسة\./).textContent).toContain(p1 + " / 20 من هذه الوحدة");
    expect(bar()!.textContent).toContain("نقاط القوة من هذه الوحدة: " + p1 + " / 20");
    expect(earned).toHaveBeenCalledTimes(1);
    await answerRight(1);
    await waitFor(() => expect(bar()!.textContent).toContain("تمارين الدراسة في هذه الصفحة: 2 / " + PAGE_ELIGIBLE));
    expect(screen.getByText(/\+2 نقطة قوة/)).toBeTruthy();
    expect(bar()!.textContent).toContain("نقاط القوة من هذه الوحدة: " + p2 + " / 20");
    expect(earned).toHaveBeenCalledTimes(2);
    await answerRight(2);
    await waitFor(() => expect(study.attempt).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(bar()!.textContent).toContain("3 / " + PAGE_ELIGIBLE));
    expect(bar()!.textContent).toContain("نقاط القوة من هذه الوحدة: " + p3 + " / 20");
    expect(bar()!.classList.contains("is-full")).toBe(PAGE_ELIGIBLE === 3);
    expect(earned).toHaveBeenCalledTimes(3);
    expect(study.state).toHaveBeenCalledTimes(1);                                          // never re-read per attempt
    // the browser only ever sent responses
    for (const call of study.attempt.mock.calls) expect(JSON.stringify(call[3])).not.toMatch(/correct|points|gained/);
  }, T);

  it("a previously earned state loads (1 / n with the completed id) and answering that exercise again shows «محسوب سابقًا», never a false +1", async () => {
    await loadMcBlocks();
    const study = fakeStudy({ [PAGE_ID]: [MC[0][0]] });
    const earned = mount(study);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await goTo(PAGE_ID);
    await waitFor(() => expect(bar()?.textContent).toContain("تمارين الدراسة في هذه الصفحة: 1 / " + PAGE_ELIGIBLE), SLOW);
    await answerRight(0);
    await screen.findByText("هذا التمرين محسوب سابقًا.");
    expect(screen.queryByText(/\+1 نقطة قوة/)).toBeNull();
    expect(bar()!.textContent).toContain("1 / 2");
    expect(earned).not.toHaveBeenCalled();
  }, T);

  it("no study client → no bar, no request, the local practice unchanged; the CLI page keeps its terminal and no study UI is attached to it", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    mount(null);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await goTo(PAGE_ID);
    await screen.findAllByRole("radiogroup", {}, SLOW);
    expect(bar()).toBeNull();
    expect(screen.getAllByText("تمرين ذاتي: أجب لترى النتيجة فورًا. لا يُحفظ شيء ولا تُحسب نقاط.").length).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
    cleanup();
    const study = fakeStudy();
    mount(study);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await goTo(CLI_PAGE);
    const cli = await screen.findByLabelText(/^سطر الأوامر/, {}, SLOW) as HTMLInputElement;
    fireEvent.change(cli, { target: { value: "enable" } }); fireEvent.keyDown(cli, { key: "Enter" });
    await waitFor(() => {});
    expect(study.attempt).not.toHaveBeenCalled();                                           // the CLI never reports
    expect(INDEX.pages[CLI_PAGE] ? bar() !== null : bar() === null).toBe(true);           // bar only when the page has eligible exercises
  }, T);
});

describe("Presentation Mode + training round-trip", () => {
  it("inside the overlay the bar and the +1 work the same; the state survives opening T01 and returning; presentation and page are kept", async () => {
    await loadMcBlocks();
    const study = fakeStudy();
    mount(study);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await goTo(PAGE_ID);
    await waitFor(() => expect(bar()).toBeTruthy(), SLOW);
    fireEvent.click(screen.getByRole("button", { name: "وضع العرض" }));
    await waitFor(() => expect(document.querySelector(".learning-reader")!.classList.contains("is-presentation")).toBe(true));
    await answerRight(0);
    await waitFor(() => expect(bar()!.textContent).toContain("1 / 2"));
    expect(screen.getByText(/\+1 نقطة قوة/)).toBeTruthy();
    // jump (presentation page field) to PDF 22 and open a training, then come back
    const field = screen.getByLabelText("رقم الصفحة") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "16" } }); fireEvent.submit(field.closest("form")!);
    await screen.findByRole("region", { name: "تدريب 1" }, SLOW);
    fireEvent.click(within(screen.getByRole("region", { name: "تدريب 1" })).getByRole("button", { name: "ابدأ التدريب" }));
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);          // the runner
    expect(document.querySelector(".learning-reader")).toBeNull();
    for (const q of questions) fireEvent.click(within(screen.getByText(q.text).closest(".iex-q") as HTMLElement).getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "أرسل الإجابات" }));
    await screen.findByText("مراجعة الإجابات");
    fireEvent.click(screen.getAllByRole("button", { name: "العودة إلى الصفحة" })[0]);
    await screen.findByRole("heading", { level: 2, name: "تدريبات قصيرة" }, SLOW);           // same page (PDF 22)
    await waitFor(() => expect(document.querySelector(".learning-reader")!.classList.contains("is-presentation")).toBe(true));
    expect(study.state).toHaveBeenCalledTimes(1);                                           // the host kept its study state across the swap
    fireEvent.click(screen.getByRole("button", { name: "خروج من وضع العرض" }));
    await waitFor(() => expect(document.querySelector(".learning-reader")!.classList.contains("is-presentation")).toBe(false));
    await goTo(PAGE_ID);
    await waitFor(() => expect(bar()?.textContent).toContain("تمارين الدراسة في هذه الصفحة: 1 / " + PAGE_ELIGIBLE), SLOW);   // earlier completion still shown, no re-read
    expect(study.state).toHaveBeenCalledTimes(1);
  }, T);
});

describe("out-of-order responses (review robustness check)", () => {
  it("two right answers in flight: the newer (2 completions, module 3) response arrives first, the older (1, module 1) later → the bar must stay at 2 / n and 3 / 20 (monotonic client state)", async () => {
    await loadMcBlocks();
    const real = fakeStudy();
    // the real fake server answers immediately; the GATE holds each answer until the test releases it, in any order
    const resolvers: Array<[(r: StudyAttemptResponse) => void, StudyAttemptResponse]> = [];
    const gated: StudyClient = {
      state: real.state,
      attempt: (c: string, p: string, a: string, r: StudyResponse) => new Promise<StudyAttemptResponse>(res => { void real.attempt(c, p, a, r).then(x => resolvers.push([res, x])); }),
    };
    mount(gated);
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    await goTo(PAGE_ID);
    await waitFor(() => expect(bar()).toBeTruthy(), SLOW);
    await answerRight(0);
    await answerRight(1);
    await waitFor(() => expect(resolvers.length).toBe(2));
    // deliver the NEWER (2 completions) response first, then the OLDER (1 completion) one
    resolvers[1][0](resolvers[1][1]);
    await waitFor(() => expect(bar()!.textContent).toContain("2 / " + PAGE_ELIGIBLE));
    resolvers[0][0](resolvers[0][1]);
    await waitFor(() => {});
    await new Promise(r => setTimeout(r, 50));
    expect(bar()!.textContent).toContain("2 / " + PAGE_ELIGIBLE);                            // never regresses to 1 / n
    expect(bar()!.textContent).toContain("نقاط القوة من هذه الوحدة: 3 / 20");
  }, T);
});
