// @vitest-environment happy-dom
// Phase 21E.2 part 2 — Review Fix 3, owner-listed I-4: one save vocabulary in the builder, through the REAL StructuredExamBuilder +
// REAL history hook (App's state owner in shape: snapshot → persist → commitSaved, like StructuredExamBuilder.reliability).
//   - the save status (role=status) says the save-label table's sentence for its state (SAVE_STATE_LABELS); its glyph is an
//     aria-hidden decoration. While a save runs it says «جارٍ الحفظ…» — the same string as the draft button (it said «⏳ جارٍ الحفظ»
//     next to the button's «جارٍ الحفظ…»: two saving strings at once);
//   - it is the ONE live region that speaks a state change: one whole sentence per change (aria-atomic), never the glyph, and the
//     draft button (its label changes to «جارٍ الحفظ…») is neither a live region nor inside one.
// Fail-first on 8bd4cc2: '⏳ جارٍ الحفظ' ≠ '⏳ جارٍ الحفظ…'; the spoken saving sentence 'جارٍ الحفظ' ≠ the button's 'جارٍ الحفظ…';
// no aria-atomic on the status.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import { writeExamBackup, type BackupStorage } from "../examAutosave";
import { toSavedStructuredExam } from "../examBuilderState";
import { SAVE_LABELS, SAVE_STATE_LABELS } from "../teacher/saveLabels";
import type { StructuredExam } from "../examTypes";

const SCOPE = "teacher-1";
const makeExam = (title = "OLD TITLE"): StructuredExam => ({
  examId: "ex1", title, status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [{ id: "s1", title: "S", gradingPolicy: "all", stimuli: {}, questions: [
    { examQuestionId: "qA", presentationType: "shortAnswer", text: "A", marks: 2, answer: { text: "x" } }] }]
} as StructuredExam);
function memoryStorage(): BackupStorage {
  const map = new Map<string, string>();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } } as BackupStorage;
}

const h = {} as { update: (u: (e: StructuredExam) => StructuredExam) => void; save: (gate: Promise<void>) => Promise<void> };
function Host({ storage = null }: { storage?: BackupStorage | null }) {
  const hist = useStructuredExamHistory();
  const [saving, setSaving] = useState(false);
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(makeExam(), "saved"); } }, [hist]);
  useEffect(() => {
    const save = async (gate: Promise<void>) => {
      const snapshot = hist.present!;
      setSaving(true);
      await gate;
      hist.commitSaved(snapshot, { ...toSavedStructuredExam(snapshot), status: "draft" });
      setSaving(false);
    };
    Object.assign(h, { update: hist.update, save });
  }, [hist]);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo}
    canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} recoveryScope={SCOPE} onRecover={hist.recover}
    backupStorage={storage} autosaveDelayMs={0} />;
}

const tick = () => act(async () => { await new Promise(r => setTimeout(r, 5)); });
const chip = () => document.querySelector<HTMLElement>(".sb-save-state")!;
const spoken = (el: Element) => { const c = el.cloneNode(true) as Element; c.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove()); return (c.textContent || "").replace(/\s+/g, " ").trim(); };
// Every region assistive technology reads out on its own when its content changes.
const LIVE = '[role="status"], [role="alert"], [role="log"], [aria-live]:not([aria-live="off"])';
const liveNow = () => new Map(Array.from(document.querySelectorAll(LIVE)).map(r => [r, spoken(r)] as const));
/** What the live regions say for one step: each region whose spoken text changed (and is not empty) speaks it once. */
const announced = async (step: () => void | Promise<void>) => {
  const before = liveNow();
  await act(async () => { await step(); });
  await tick();
  return Array.from(liveNow()).filter(([r, s]) => s && before.get(r) !== s).map(([, s]) => s);
};
const draftButton = () => within(document.querySelector<HTMLElement>(".sb-toolbar")!).getByRole("button", { name: /حفظ/ }) as HTMLButtonElement;
const GLYPH = /\p{Extended_Pictographic}|[✓●↺⏳]/u;

beforeEach(() => { window.confirm = vi.fn(() => true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RF3 I-4 — the save status reads the save-label table", () => {
  it("saved / dirty / saving say the table's sentence after an aria-hidden glyph; while saving the status and the draft button say the same «جارٍ الحفظ…»", async () => {
    render(<Host />);
    await tick();
    const said: Record<string, string> = {};
    expect(chip().textContent).toBe("✓ محفوظ");
    said.saved = spoken(chip());
    expect(said.saved).toBe("محفوظ");
    expect(chip().querySelector('[aria-hidden="true"]')!.textContent).toBe("✓");
    act(() => h.update(e => ({ ...e, title: "T1" })));
    expect(chip().textContent).toBe("● تغييرات غير محفوظة");
    said.dirty = spoken(chip());
    expect(said.dirty).toBe("تغييرات غير محفوظة");
    let release!: () => void;
    act(() => { void h.save(new Promise<void>(r => { release = r; })); });
    const button = draftButton();
    expect(button.disabled).toBe(true);
    expect((button.textContent || "").trim()).toBe("جارٍ الحفظ…");
    expect(chip().textContent).toBe("⏳ جارٍ الحفظ…");
    said.saving = spoken(chip());
    expect(said.saving).toBe((button.textContent || "").trim());                    // ONE saving string on screen
    await act(async () => { release(); });
    await tick();
    expect(chip().textContent).toBe("✓ محفوظ");
    expect((draftButton().textContent || "").trim()).toBe(SAVE_LABELS.saveDraft);
    // … and every sentence is the table's (the status renders SAVE_STATE_LABELS; «جارٍ الحفظ…» is SAVE_LABELS.saving).
    expect(SAVE_STATE_LABELS).toBeDefined();
    expect(said).toEqual({ saved: SAVE_STATE_LABELS.saved, dirty: SAVE_STATE_LABELS.dirty, saving: SAVE_LABELS.saving });
  });

  it("a recovered copy says «نسخة مسترجعة — غير محفوظة» from the table", async () => {
    const s = memoryStorage();
    writeExamBackup(s, SCOPE, makeExam("LOCAL WORK"), "2026-03-01T11:00:00.000Z");
    render(<Host storage={s} />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "استرجاع النسخة" }));
    expect(chip().textContent).toBe("↺ نسخة مسترجعة — غير محفوظة");
    expect(spoken(chip())).toBe("نسخة مسترجعة — غير محفوظة");
    expect(SAVE_STATE_LABELS).toBeDefined();
    expect(spoken(chip())).toBe(SAVE_STATE_LABELS.recovered);
  });
});

describe("RF3 I-4 — one announcement per state change", () => {
  it("the status is a polite, atomic live region: each change speaks exactly ONE sentence — the table's, without a glyph — and nothing else speaks it", async () => {
    render(<Host />);
    await tick();
    let release!: () => void;
    const steps: string[][] = [];
    steps.push(await announced(() => h.update(e => ({ ...e, title: "T1" }))));
    steps.push(await announced(() => { void h.save(new Promise<void>(r => { release = r; })); }));
    // While saving: the draft button's label changed too, but it is not a live region and sits in none.
    const button = draftButton();
    expect((button.textContent || "").trim()).toBe(SAVE_LABELS.saving);
    expect(button.closest(LIVE)).toBeNull();
    expect(button.querySelector(LIVE)).toBeNull();
    expect(Array.from(document.querySelectorAll(LIVE)).filter(r => spoken(r).includes(SAVE_LABELS.saving))).toEqual([chip()]);
    steps.push(await announced(() => release()));
    steps.push(await announced(() => h.update(e => ({ ...e, title: "T2" }))));
    expect(steps).toEqual([["تغييرات غير محفوظة"], ["جارٍ الحفظ…"], ["محفوظ"], ["تغييرات غير محفوظة"]]);
    for (const s of steps.flat()) expect(GLYPH.test(s), s).toBe(false);
    expect(chip().getAttribute("role")).toBe("status");
    expect(chip().getAttribute("aria-live")).toBe("polite");
    expect(chip().getAttribute("aria-atomic")).toBe("true");                          // the whole sentence, not a changed fragment
    expect(SAVE_STATE_LABELS).toBeDefined();
    expect(steps).toEqual([[SAVE_STATE_LABELS.dirty], [SAVE_STATE_LABELS.saving], [SAVE_STATE_LABELS.saved], [SAVE_STATE_LABELS.dirty]]);
  });
});
