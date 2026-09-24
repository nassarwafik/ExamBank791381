// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useState } from "react";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { applyStructuredExamUpdate, reconcileSavedStructuredExam, toSavedStructuredExam, type StructuredExamUpdater } from "./examBuilderState";
import type { StructuredExam, BuilderImageAsset } from "./examTypes";
import type { ReadImageResult } from "./questionMedia";

// Phase 5B second follow-up — saving is blocked while ANY media operation (AI generation or local upload
// read) is pending, so every save snapshot already contains every resolved image: the UI can never report
// "saved/final" for an image that was not persisted.

// Deferred local-upload read: when `hold.on`, readImageFile stays pending until the test settles it.
const hold = vi.hoisted(() => ({ on: false, settle: null as null | ((r: ReadImageResult) => void) }));
vi.mock("./questionMedia", async importOriginal => {
  const real = await importOriginal<typeof import("./questionMedia")>();
  return { ...real, readImageFile: (f: File) => (hold.on ? new Promise<ReadImageResult>(r => { hold.settle = r; }) : real.readImageFile(f)) };
});

const DRAFT = "💾 حفظ مسودة";
const FINAL = "✓ اعتماد نهائي";
const WAIT = "انتظر انتهاء معالجة الصور قبل الحفظ.";
const AI_BTN = "✨ إنشاء صورة بالذكاء الاصطناعي";
const IMG_A = "data:image/png;base64,AAAA";
const IMG_B = "data:image/png;base64,BBBB";
const UPLOADED = "data:image/png;base64,UPLD";

const makeExam = (): StructuredExam => ({
  examId: "ex1", title: "امتحان", status: "draft", schemaVersion: 2,
  sections: [{ id: "s1", title: "S", gradingPolicy: "all", stimuli: {}, questions: [
    { examQuestionId: "qA", presentationType: "shortAnswer", text: "A", marks: 2, answer: { text: "x" } },
    { examQuestionId: "qB", presentationType: "shortAnswer", text: "B", marks: 2, answer: { text: "y" } },
  ] }],
} as StructuredExam);

function deferredAI() {
  const pending: Record<string, { ok: (a: BuilderImageAsset) => void; fail: (e: Error) => void }> = {};
  const fn = vi.fn((q: { examQuestionId: string }) => new Promise<BuilderImageAsset>((ok, fail) => { pending[q.examQuestionId] = { ok, fail }; }));
  const resolve = async (qid: string, dataUrl: string) => { await act(async () => { pending[qid].ok({ origin: "ai-generated", contentType: "image/png", dataUrl }); }); };
  const reject = async (qid: string) => { await act(async () => { pending[qid].fail(new Error("boom")); }); };
  return { fn, resolve, reject };
}

// Mirrors App.tsx: functional updates on the latest exam; onSave snapshots → persists → reconciles.
const h = { latest: null as StructuredExam | null, saves: [] as StructuredExam[], setOpen: (_v: boolean) => {} };
function Host({ req }: { req: (q: never) => Promise<BuilderImageAsset> }) {
  const [exam, setExam] = useState<StructuredExam | null>(makeExam());
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { Object.assign(h, { latest: exam, setOpen }); }, [exam]);
  const update = (u: StructuredExamUpdater) => setExam(prev => applyStructuredExamUpdate(prev, u));
  const onSave = async (mode: "draft" | "final") => {
    const snapshot = exam!;
    const payload = { ...toSavedStructuredExam(snapshot), status: mode };
    h.saves.push(payload);                                     // what is PERSISTED
    setSaving(true);
    await Promise.resolve();
    setExam(prev => reconcileSavedStructuredExam(prev, snapshot, payload));
    setSaving(false);
  };
  return open && exam ? <StructuredExamBuilder exam={exam} onChange={update} onSave={onSave} saving={saving} requestQuestionImage={req as never} /> : null;
}

const btn = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const saveBlocked = () => btn(DRAFT).disabled && btn(FINAL).disabled;
const imgIn = (e: StructuredExam | null | undefined, id: string) => e?.sections[0].questions.find(x => x.examQuestionId === id)?.image?.assets?.[0]?.dataUrl;
const clickSave = async (name: string) => { await act(async () => { fireEvent.click(btn(name)); }); };

beforeEach(() => { window.confirm = vi.fn(() => true); h.saves = []; hold.on = false; hold.settle = null; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Phase 5B — saving is blocked while media is pending", () => {
  it("A: AI pending disables BOTH save buttons (real disabled + Arabic reason); after it resolves the save CONTAINS the image", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    expect(saveBlocked()).toBe(false);
    fireEvent.click(screen.getAllByRole("button", { name: AI_BTN })[0]);
    expect(btn(DRAFT).disabled).toBe(true);
    expect(btn(FINAL).disabled).toBe(true);
    expect(screen.getByText(WAIT)).toBeTruthy();
    await ai.resolve("qA", IMG_A);
    expect(imgIn(h.latest, "qA")).toBe(IMG_A);
    expect(saveBlocked()).toBe(false);
    expect(screen.queryByText(WAIT)).toBeNull();
    await clickSave(FINAL);
    expect(imgIn(h.saves[0], "qA")).toBe(IMG_A);               // persisted payload contains the image
    expect(h.latest!.status).toBe("final");
    expect(imgIn(h.latest, "qA")).toBe(IMG_A);                 // shown == persisted
  });

  it("B: a pending local upload read disables saving; the saved snapshot includes the uploaded image", async () => {
    hold.on = true;
    render(<Host req={deferredAI().fn as never} />);
    fireEvent.change(screen.getAllByLabelText("رفع صورة السؤال")[0], { target: { files: [new File([new Uint8Array([137, 80, 78, 71])], "a.png", { type: "image/png" })] } });
    expect(saveBlocked()).toBe(true);
    await act(async () => { hold.settle!({ dataUrl: UPLOADED, contentType: "image/png", origin: "uploaded" }); });
    expect(imgIn(h.latest, "qA")).toBe(UPLOADED);
    expect(saveBlocked()).toBe(false);
    await clickSave(DRAFT);
    expect(imgIn(h.saves[0], "qA")).toBe(UPLOADED);
  });

  it("C: two concurrent generations — save stays blocked until BOTH settle; the save contains both images", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    const [a, b] = screen.getAllByRole("button", { name: AI_BTN });
    fireEvent.click(a); fireEvent.click(b);
    expect(saveBlocked()).toBe(true);
    await ai.resolve("qA", IMG_A);
    expect(saveBlocked()).toBe(true);                          // B still pending
    await ai.resolve("qB", IMG_B);
    expect(saveBlocked()).toBe(false);
    await clickSave(DRAFT);
    expect(imgIn(h.saves[0], "qA")).toBe(IMG_A);
    expect(imgIn(h.saves[0], "qB")).toBe(IMG_B);
  });

  it("a failed generation releases the block (no stuck disabled save) and keeps no image", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    fireEvent.click(screen.getAllByRole("button", { name: AI_BTN })[0]);
    expect(saveBlocked()).toBe(true);
    await ai.reject("qA");
    expect(saveBlocked()).toBe(false);
    expect(imgIn(h.latest, "qA")).toBeUndefined();
  });
});

describe("Phase 5B — pending registrations never leak", () => {
  it("E1: deleting the question whose image is pending re-enables saving immediately; the late result is a no-op", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    fireEvent.click(screen.getAllByRole("button", { name: AI_BTN })[0]);
    expect(saveBlocked()).toBe(true);
    fireEvent.click(screen.getAllByTitle("حذف")[0]);           // delete qA
    expect(h.latest!.sections[0].questions.map(x => x.examQuestionId)).toEqual(["qB"]);
    expect(saveBlocked()).toBe(false);
    await ai.resolve("qA", IMG_A);
    expect(h.latest!.sections[0].questions.map(x => x.examQuestionId)).toEqual(["qB"]); // not resurrected
    expect(saveBlocked()).toBe(false);
  });

  it("E2: collapsing (unmounting) the pending question's editor keeps saving blocked until the result lands, then the save contains it", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    fireEvent.click(screen.getAllByRole("button", { name: AI_BTN })[0]);
    fireEvent.click(screen.getAllByTitle("طيّ")[0]);           // collapse qA → its media editor unmounts
    expect(screen.getAllByRole("button", { name: AI_BTN }).length).toBe(1);
    expect(saveBlocked()).toBe(true);                          // the operation is still running
    await ai.resolve("qA", IMG_A);
    expect(saveBlocked()).toBe(false);                         // released when it settled
    await clickSave(DRAFT);
    expect(imgIn(h.saves[0], "qA")).toBe(IMG_A);
  });

  it("E4: two overlapping operations on the SAME question (collapse → re-open → start again) — the first settling does not release the second", async () => {
    const calls: ((a: BuilderImageAsset) => void)[] = [];
    const req = vi.fn(() => new Promise<BuilderImageAsset>(r => { calls.push(r); }));
    render(<Host req={req as never} />);
    fireEvent.click(screen.getAllByRole("button", { name: AI_BTN })[0]);        // op 1 on qA
    fireEvent.click(screen.getAllByTitle("طيّ")[0]);                            // collapse qA (op 1 keeps running)
    fireEvent.click(screen.getAllByTitle("فتح")[0]);                            // re-open → fresh media editor
    fireEvent.click(screen.getAllByRole("button", { name: AI_BTN })[0]);        // op 2 on qA
    expect(req).toHaveBeenCalledTimes(2);
    await act(async () => { calls[0]({ dataUrl: IMG_A }); });
    expect(saveBlocked()).toBe(true);                                           // op 2 still pending on qA
    await act(async () => { calls[1]({ dataUrl: IMG_B }); });
    expect(saveBlocked()).toBe(false);
    await clickSave(DRAFT);
    expect(imgIn(h.saves[0], "qA")).toBe(IMG_B);                                // latest result persisted
  });

  it("E3: builder unmounted while pending → the settle neither errors nor updates state", async () => {
    const ai = deferredAI();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Host req={ai.fn as never} />);
    fireEvent.click(screen.getAllByRole("button", { name: AI_BTN })[0]);
    act(() => h.setOpen(false));
    const before = h.latest;
    await ai.resolve("qA", IMG_A);
    expect(h.latest).toBe(before);
    expect(errSpy).not.toHaveBeenCalled();
  });
});
