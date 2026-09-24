// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useState } from "react";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import QuestionMediaEditor from "./QuestionMediaEditor";
import StudentQuestionCard, { type Question } from "./StudentQuestionCard";
import { applyStructuredExamUpdate, reconcileSavedStructuredExam, toSavedStructuredExam, type StructuredExamUpdater } from "./examBuilderState";
import type { StructuredExam, BuilderImageAsset, BuilderQuestion } from "./examTypes";

// Phase 5B follow-up — async media results must apply to the LATEST exam state. This harness mirrors the
// App.tsx state owner exactly: builder updaters go through applyStructuredExamUpdate, and a save reconciles
// through reconcileSavedStructuredExam — the same helpers App.tsx uses.

const AI_BTN = "✨ إنشاء صورة بالذكاء الاصطناعي";
const IMG_A = "data:image/png;base64,AAAA";
const IMG_B = "data:image/png;base64,BBBB";

const makeExam = (examId = "ex1"): StructuredExam => ({
  examId, title: "OLD TITLE", status: "draft", schemaVersion: 2,
  sections: [{ id: "s1", title: "S", gradingPolicy: "all", stimuli: {}, questions: [
    { examQuestionId: "qA", presentationType: "shortAnswer", text: "A", marks: 2, answer: { text: "x" } },
    { examQuestionId: "qB", presentationType: "shortAnswer", text: "B", marks: 2, answer: { text: "y" } },
  ] }],
} as StructuredExam);

// A deferred AI callback: each call is held pending until the test resolves it (keyed by question id).
function deferredAI() {
  const pending: Record<string, (a: BuilderImageAsset) => void> = {};
  const fn = vi.fn((q: { examQuestionId: string }) => new Promise<BuilderImageAsset>(r => { pending[q.examQuestionId] = r; }));
  const resolve = async (qid: string, dataUrl: string) => { await act(async () => { pending[qid]({ id: "ai-" + qid, origin: "ai-generated", contentType: "image/png", dataUrl }); }); };
  return { fn, resolve };
}

type Handles = { latest: StructuredExam | null; setOpen: (v: boolean) => void; setExam: (e: StructuredExam | null) => void; save: (gate: Promise<void>) => Promise<StructuredExam> };
const h: Handles = { latest: null, setOpen: () => {}, setExam: () => {}, save: async () => ({} as StructuredExam) };

function Host({ req, initial = makeExam() }: { req: (q: never) => Promise<BuilderImageAsset>; initial?: StructuredExam }) {
  const [exam, setExam] = useState<StructuredExam | null>(initial);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // Same shape as App.saveStructuredExam: snapshot → payload → await → reconcile against the latest exam.
    const save = async (gate: Promise<void>) => {
      const snapshot = exam!;
      const payload = { ...toSavedStructuredExam(snapshot), status: "final" as const };
      await gate;
      setExam(prev => reconcileSavedStructuredExam(prev, snapshot, payload));
      return payload;
    };
    Object.assign(h, { latest: exam, setOpen, setExam, save });
  }, [exam]);
  const update = (u: StructuredExamUpdater) => setExam(prev => applyStructuredExamUpdate(prev, u));
  return open && exam ? <StructuredExamBuilder exam={exam} onChange={update} requestQuestionImage={req as never} /> : null;
}

const q = (id: string) => h.latest!.sections[0].questions.find(x => x.examQuestionId === id)!;
const imgOf = (id: string) => q(id).image?.assets?.[0]?.dataUrl;
const aiButtons = () => screen.getAllByRole("button", { name: AI_BTN }); // [qA, qB] while both lack an image
const textareaWith = (value: string) => Array.from(document.querySelectorAll("textarea")).find(t => (t as HTMLTextAreaElement).value === value) as HTMLTextAreaElement;

beforeEach(() => { window.confirm = vi.fn(() => true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Phase 5B follow-up — a pending image never reverts newer edits", () => {
  it("1: title edited during a pending AI generation survives; the image is applied", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    fireEvent.click(aiButtons()[0]);                                             // qA generation pending
    fireEvent.change(screen.getByPlaceholderText("عنوان الامتحان المنظّم"), { target: { value: "NEW TITLE" } });
    expect(h.latest!.title).toBe("NEW TITLE");
    await ai.resolve("qA", IMG_A);
    expect(h.latest!.title).toBe("NEW TITLE");
    expect(imgOf("qA")).toBe(IMG_A);
  });

  it("2: another question's text edited during a pending generation survives; the image is applied", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    fireEvent.click(aiButtons()[0]);
    fireEvent.change(textareaWith("B"), { target: { value: "B EDITED" } });
    await ai.resolve("qA", IMG_A);
    expect(q("qB").text).toBe("B EDITED");
    expect(imgOf("qA")).toBe(IMG_A);
  });

  it.each([["A then B", ["qA", "qB"]], ["B then A", ["qB", "qA"]]])("3: two concurrent generations on different questions both land (%s)", async (_label, order) => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    const [btnA, btnB] = aiButtons();
    fireEvent.click(btnA); fireEvent.click(btnB);                                // both pending (per-question single-flight)
    expect(ai.fn).toHaveBeenCalledTimes(2);
    for (const id of order) await ai.resolve(id, id === "qA" ? IMG_A : IMG_B);
    expect(imgOf("qA")).toBe(IMG_A);
    expect(imgOf("qB")).toBe(IMG_B);
  });

  it("3b: an upload and a pending AI generation on different questions both land", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    fireEvent.click(aiButtons()[0]);                                             // qA AI pending
    fireEvent.change(screen.getAllByLabelText("رفع صورة السؤال")[1], { target: { files: [new File([new Uint8Array([137, 80, 78, 71])], "b.png", { type: "image/png" })] } });
    await vi.waitFor(() => expect(q("qB").image?.exists).toBe(true));             // upload to qB lands first
    await ai.resolve("qA", IMG_A);
    expect(imgOf("qA")).toBe(IMG_A);
    expect(q("qB").image?.assets?.[0].dataUrl?.startsWith("data:image/png")).toBe(true);
  });
});

describe("Phase 5B follow-up — save during a pending generation", () => {
  it("4a: save uses the latest edits; an image that arrives DURING the save is kept (not rolled back)", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    fireEvent.click(aiButtons()[0]);
    fireEvent.change(screen.getByPlaceholderText("عنوان الامتحان المنظّم"), { target: { value: "NEW TITLE" } });
    let release!: () => void;
    let saving!: Promise<StructuredExam>;
    act(() => { saving = h.save(new Promise<void>(r => { release = r; })); });
    await ai.resolve("qA", IMG_A);                                               // image lands mid-save
    await act(async () => { release(); await saving; });
    const payload = await saving;
    expect(payload.title).toBe("NEW TITLE");                                     // save used the latest state
    expect(h.latest!.title).toBe("NEW TITLE");
    expect(imgOf("qA")).toBe(IMG_A);                                             // save completion did not roll it back
    expect(h.latest!.status).toBe("final");                                      // saved metadata adopted
  });

  it("4b: an image that arrives AFTER the save completes does not roll the saved state back", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    fireEvent.click(aiButtons()[0]);
    fireEvent.change(screen.getByPlaceholderText("عنوان الامتحان المنظّم"), { target: { value: "NEW TITLE" } });
    await act(async () => { await h.save(Promise.resolve()); });
    expect(h.latest!.status).toBe("final");
    const savedAt = h.latest!.updatedAt;
    await ai.resolve("qA", IMG_A);
    expect(h.latest!.title).toBe("NEW TITLE");
    expect(h.latest!.status).toBe("final");
    expect(h.latest!.updatedAt).toBe(savedAt);
    expect(imgOf("qA")).toBe(IMG_A);                                             // unsaved image kept in memory
  });

  it("reconcileSavedStructuredExam: unchanged → saved payload; cleared → stays cleared; other exam untouched", () => {
    const snap = makeExam();
    const saved = { ...snap, status: "final" as const, updatedAt: "T" };
    expect(reconcileSavedStructuredExam(snap, snap, saved)).toBe(saved);
    expect(reconcileSavedStructuredExam(null, snap, saved)).toBeNull();
    const other = makeExam("ex2");
    expect(reconcileSavedStructuredExam(other, snap, saved)).toBe(other);
    expect(applyStructuredExamUpdate(null, e => ({ ...e, title: "X" }))).toBeNull();
  });
});

describe("Phase 5B follow-up — closing the editor invalidates a pending result", () => {
  it("5a: builder closed while generating → the late image never modifies the exam", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    fireEvent.click(aiButtons()[0]);
    act(() => h.setOpen(false));                                                 // teacher leaves the builder
    const before = h.latest;
    await ai.resolve("qA", IMG_A);
    expect(h.latest).toBe(before);                                               // not even a new object
    expect(q("qA").image).toBeUndefined();
  });

  it("5b: exam cleared while generating → the late result does not recreate it", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    fireEvent.click(aiButtons()[0]);
    act(() => h.setExam(null));
    await ai.resolve("qA", IMG_A);
    expect(h.latest).toBeNull();
  });

  it("5c: a DIFFERENT exam opened in the same builder → the late result never lands in it", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    fireEvent.click(aiButtons()[0]);
    const other = makeExam("ex2");                                               // same question ids, other exam
    act(() => h.setExam(other));
    await ai.resolve("qA", IMG_A);
    expect(h.latest).toBe(other);
    expect(q("qA").image).toBeUndefined();
  });
});

describe("Phase 5B follow-up — hiding a legacy images[]-only question really hides it", () => {
  function LegacyHost({ initial }: { initial: BuilderQuestion }) {
    const [question, setQuestion] = useState<BuilderQuestion>(initial);
    return (
      <>
        <QuestionMediaEditor question={question} onChange={p => setQuestion(prev => ({ ...prev, ...p }))} />
        <div data-testid="student"><StudentQuestionCard q={question as unknown as Question} index={0} id="q1" answer={undefined} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onField={() => {}} /></div>
      </>
    );
  }
  const studentImgs = () => Array.from(screen.getByTestId("student").querySelectorAll("img.iex-image")).map(i => i.getAttribute("src"));

  it("hide → student sees zero images and the UI shows the hidden state; show → the same image returns", () => {
    const legacy = { examQuestionId: "q1", presentationType: "shortAnswer", text: "t", marks: 1, images: [{ dataUrl: IMG_A }] } as BuilderQuestion;
    render(<LegacyHost initial={legacy} />);
    expect(studentImgs()).toEqual([IMG_A]);                                      // 1. visible before hide
    fireEvent.click(screen.getByRole("button", { name: "👁 إخفاء الصورة" }));    // 2. hide
    expect(studentImgs()).toEqual([]);                                           // 3. student sees none
    expect(screen.getByRole("button", { name: "👁 إظهار الصورة" })).toBeTruthy(); // 4. UI state flipped
    expect(screen.getByText("مخفية عن الطالب")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "👁 إظهار الصورة" }));    // 5. show again
    expect(studentImgs()).toEqual([IMG_A]);                                      // same bytes restored
  });

  it("multi-asset legacy images[] are all kept through hide/show", () => {
    const legacy = { examQuestionId: "q1", presentationType: "shortAnswer", text: "t", marks: 1, images: [{ dataUrl: IMG_A }, { dataUrl: IMG_B }] } as BuilderQuestion;
    render(<LegacyHost initial={legacy} />);
    fireEvent.click(screen.getByRole("button", { name: "👁 إخفاء الصورة" }));
    expect(studentImgs()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "👁 إظهار الصورة" }));
    expect(studentImgs()).toEqual([IMG_A, IMG_B]);
  });
});
