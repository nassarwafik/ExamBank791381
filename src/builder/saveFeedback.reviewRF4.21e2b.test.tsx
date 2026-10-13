// @vitest-environment happy-dom
// Phase 21E.2 part 2 — Review Fix 4, audit A-10 / B-01 and B-06: what a save tells the teacher, through the REAL StructuredExamBuilder +
// REAL history hook with an App-shaped owner (saveStructuredExam: clear notice / error, snapshot → persist → commitSaved, then the
// notice or the failure reason).
//   A-10 / B-01  a failed save says «تعذّر الحفظ: <reason>» in the toolbar's status band, next to the save state (the band sticks with
//                the toolbar, so it is on screen wherever the teacher saved from), announced once as it appears (role=alert); the
//                old banner below the toolbar (out of view when the teacher saves from deep in the exam, never announced) is gone.
//   B-06         a save's success notice shows only while the status says «محفوظ» — never beside «تغييرات غير محفوظة»; its glyph is
//                decoration (aria-hidden); a final approval's status says «محفوظ — معتمد نهائيًا», so it is never announced exactly
//                like a draft save. A notice about how an unsaved exam was opened (an import, a preset) claims no save and stays.
// Fail-first on 1fa3d21: no role=alert anywhere after a failed save (the reason sat only in a banner with no live semantics); the
// draft notice stayed beside «● تغييرات غير محفوظة» after an edit; its «✓» was read out; a final save announced «محفوظ» like a draft.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, act, screen, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import { toSavedStructuredExam } from "../examBuilderState";
import { SAVE_LABELS, SAVE_STATE_LABELS } from "../teacher/saveLabels";
import type { StructuredExam } from "../examTypes";

const DRAFT_NOTICE = "✓ تم حفظ مسودة الامتحان المنظّم.", FINAL_NOTICE = "✓ تم اعتماد الامتحان المنظّم نهائيًا وحفظه.";
const REASON = "الخدمة غير متاحة مؤقتًا — لم يُحفظ الامتحان.";
const makeExam = (title = "اختبار الوحدة الثانية"): StructuredExam => ({
  examId: "exRF4save", title, status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [{ id: "s1", title: "S", gradingPolicy: "all", stimuli: {}, questions: [
    { examQuestionId: "qA", presentationType: "shortAnswer", text: "A", marks: 2, answer: { text: "x" } }] }]
} as StructuredExam);

/** The next save's outcome (App: the server answers ok, or the request fails with a reason) and the gate that holds it. */
const next = { fail: "" as string, gate: Promise.resolve() as Promise<void> };
const h = {} as { update: (u: (e: StructuredExam) => StructuredExam) => void; undo: () => void; present: StructuredExam | null };
function Host() {
  const hist = useStructuredExamHistory();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(makeExam(), "saved"); } }, [hist]);
  useEffect(() => { Object.assign(h, { update: hist.update, undo: hist.undo, present: hist.present }); });
  // App.saveStructuredExam in shape: clear both, hold, then the failure reason — or commit + the notice.
  const save = async (mode: "draft" | "final") => {
    const snapshot = hist.present!;
    setSaving(true); setError(""); setNotice("");
    await next.gate;
    if (next.fail) { setError(next.fail); setSaving(false); return; }
    hist.commitSaved(snapshot, { ...toSavedStructuredExam(snapshot), status: mode });
    setNotice(mode === "final" ? FINAL_NOTICE : DRAFT_NOTICE);
    setSaving(false);
  };
  if (!hist.present) return null;
  return (
    <div className="structured-builder-overlay" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="sb-builder-title" tabIndex={-1}>
      <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={mode => { void save(mode); }} saving={saving} notice={notice} noticeKind="save" error={error}
        onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null}
        onRecover={hist.recover} autosaveDelayMs={5} onExit={() => {}} />
    </div>
  );
}

beforeEach(() => {
  next.fail = ""; next.gate = Promise.resolve();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  HTMLElement.prototype.scrollIntoView = function () {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const mount = async () => { render(<Host />); await tick(); };
const chip = () => document.querySelector<HTMLElement>(".sb-save-state")!;
const banner = () => document.querySelector<HTMLElement>(".sb-banner-ok");
const spoken = (el: Element) => { const c = el.cloneNode(true) as Element; c.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove()); return (c.textContent || "").replace(/\s+/g, " ").trim(); };
const LIVE = '[role="status"], [role="alert"], [role="log"], [aria-live]:not([aria-live="off"])';
const liveNow = () => new Map(Array.from(document.querySelectorAll(LIVE)).map(r => [r, spoken(r)] as const));
/** What the live regions say for one step: each region whose spoken text changed (and is not empty) speaks it once. */
const announced = async (step: () => void | Promise<void>) => {
  const before = liveNow();
  await act(async () => { await step(); });
  await tick();
  return Array.from(liveNow()).filter(([r, s]) => s && before.get(r) !== s).map(([, s]) => s);
};
const toolbar = () => document.querySelector<HTMLElement>(".sb-toolbar")!;
const saveButton = (name: string) => within(toolbar()).getByRole("button", { name });
const edit = async (title: string) => { act(() => h.update(e => ({ ...e, title }))); await tick(); };

describe("RF4 A-10 / B-01 — a failed save is announced and shown in the toolbar", () => {
  it("«حفظ مسودة» failing: one role=alert «تعذّر الحفظ: <reason>» in the status band right after the save state; the chip says the edit is still unsaved", async () => {
    await mount();
    await edit("عنوان معدّل");
    next.fail = REASON;
    const said = await announced(() => { fireEvent.click(saveButton(SAVE_LABELS.saveDraft)); });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(SAVE_LABELS.saveFailed + ": " + REASON);
    expect(spoken(alert)).toBe("تعذّر الحفظ: " + REASON);
    expect(alert.closest(".sb-toolbar .sb-tb-status")).not.toBeNull();             // in the toolbar's status band (sticky with it) …
    expect(alert.previousElementSibling).toBe(chip());                             // … right after the save state
    expect(chip().textContent).toBe("● " + SAVE_STATE_LABELS.dirty);
    expect(said).toContain("تعذّر الحفظ: " + REASON);                              // announced (it appeared as an alert)
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(document.querySelector(".sb-banner-error")).toBeNull();                 // the off-screen, unannounced banner is gone
    expect(Array.from(document.querySelectorAll("*")).filter(n => n.children.length === 0 && (n.textContent || "").includes(REASON))).toEqual([alert]);
  });

  it("the next save clears it: retried successfully, no alert is left; a failure on an unchanged exam (status «محفوظ») is still shown", async () => {
    await mount();
    await edit("عنوان معدّل");
    next.fail = REASON;
    await act(async () => { fireEvent.click(saveButton(SAVE_LABELS.saveDraft)); });
    await tick();
    expect(screen.getByRole("alert").textContent).toContain(REASON);
    next.fail = "";
    await act(async () => { fireEvent.click(saveButton(SAVE_LABELS.saveDraft)); });
    await tick();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(chip().textContent).toBe("✓ " + SAVE_STATE_LABELS.saved);
    next.fail = "تعذر حفظ الامتحان المنظّم حاليًا.";
    await act(async () => { fireEvent.click(saveButton(SAVE_LABELS.saveDraft)); });   // nothing changed since: the status stays «محفوظ»
    await tick();
    expect(chip().textContent).toBe("✓ " + SAVE_STATE_LABELS.saved);
    expect(screen.getByRole("alert").textContent).toBe("تعذّر الحفظ: تعذر حفظ الامتحان المنظّم حاليًا.");
  });

  it("rendered with an `error` alone (no owner state): the alert holds the message", () => {
    render(<StructuredExamBuilder exam={makeExam()} onChange={() => {}} onSave={() => {}} error={REASON} saveState="dirty" backupStorage={null} />);
    expect(screen.getByRole("alert").textContent).toBe("تعذّر الحفظ: " + REASON);
  });
});

describe("RF4 B-06 — the success notice never contradicts the status; an approval says so", () => {
  it("a draft save's notice shows with «محفوظ»; one more edit («● تغييرات غير محفوظة») removes it; undoing back to the saved copy shows it again", async () => {
    await mount();
    await edit("عنوان معدّل");
    await act(async () => { fireEvent.click(saveButton(SAVE_LABELS.saveDraft)); });
    await tick();
    expect(chip().textContent).toBe("✓ " + SAVE_STATE_LABELS.saved);
    expect(banner()!.textContent).toBe(DRAFT_NOTICE);
    await edit("عنوان معدّل 2");
    expect(chip().textContent).toBe("● " + SAVE_STATE_LABELS.dirty);
    expect(banner()).toBeNull();
    expect(document.body.textContent).not.toContain("تم حفظ مسودة");
    act(() => h.undo());
    await tick();
    expect(chip().textContent).toBe("✓ " + SAVE_STATE_LABELS.saved);               // the exam IS the saved draft again
    expect(banner()!.textContent).toBe(DRAFT_NOTICE);
  });

  it("the notice's «✓» is decoration (aria-hidden, like the status's glyph) and the notice is no live region — the status is the one that speaks", async () => {
    await mount();
    await edit("عنوان معدّل");
    await act(async () => { fireEvent.click(saveButton(SAVE_LABELS.saveDraft)); });
    await tick();
    expect(banner()!.textContent).toBe(DRAFT_NOTICE);
    expect(spoken(banner()!)).toBe("تم حفظ مسودة الامتحان المنظّم.");
    expect(Array.from(banner()!.querySelectorAll('[aria-hidden="true"]')).map(n => n.textContent)).toEqual(["✓"]);
    expect(banner()!.closest(LIVE)).toBeNull();                                    // RF3 I-4: one region speaks the save state
    expect(banner()!.querySelector(LIVE)).toBeNull();
  });

  it("a final approval is announced «محفوظ — معتمد نهائيًا» (a draft save «محفوظ»); the «معتمد نهائيًا» chip is not repeated beside it", async () => {
    await mount();
    await edit("عنوان معدّل");
    const finalSaid = await announced(() => { fireEvent.click(saveButton(SAVE_LABELS.finalizeExam)); });
    expect(h.present!.status).toBe("final");
    expect(chip().textContent).toBe("✓ " + SAVE_LABELS.savedFinal);
    expect(spoken(chip())).toBe("محفوظ — معتمد نهائيًا");
    expect(finalSaid).toEqual(["محفوظ — معتمد نهائيًا"]);                          // the status changed saving → saved-final in one step
    expect(banner()!.textContent).toBe(FINAL_NOTICE);
    expect(toolbar().querySelector(".sb-stat-final")).toBeNull();
    expect((toolbar().textContent || "").split("معتمد نهائيًا").length - 1).toBe(1);
    await edit("عنوان معدّل 2");                                                     // dirty again: the exam is still marked final
    expect(chip().textContent).toBe("● " + SAVE_STATE_LABELS.dirty);
    expect(toolbar().querySelector(".sb-stat-final")!.textContent).toBe("معتمد نهائيًا");
    expect(banner()).toBeNull();
    const draftSaid = await announced(() => { fireEvent.click(saveButton(SAVE_LABELS.saveDraft)); });
    expect(h.present!.status).toBe("draft");
    expect(draftSaid).toEqual(["محفوظ"]);
    expect(finalSaid).not.toEqual(draftSaid);
  });

  it("the save's announcements, step by step: dirty → «جارٍ الحفظ…» → «محفوظ — معتمد نهائيًا» — one sentence each, no glyph, nothing else speaks", async () => {
    await mount();
    let release!: () => void;
    next.gate = new Promise<void>(r => { release = r; });
    const steps: string[][] = [];
    steps.push(await announced(() => edit("عنوان معدّل")));
    steps.push(await announced(() => { fireEvent.click(saveButton(SAVE_LABELS.finalizeExam)); }));
    steps.push(await announced(() => release()));
    expect(steps).toEqual([[SAVE_STATE_LABELS.dirty], [SAVE_LABELS.saving], [SAVE_LABELS.savedFinal]]);
  });

  it("a save's notice (the default kind) is never shown beside «تغييرات غير محفوظة», «جارٍ الحفظ…» or a recovered copy; without any save state it shows as before", () => {
    const { rerender } = render(<StructuredExamBuilder exam={makeExam()} onChange={() => {}} onSave={() => {}} notice={DRAFT_NOTICE} saveState="dirty" backupStorage={null} />);
    expect(banner()).toBeNull();
    rerender(<StructuredExamBuilder exam={makeExam()} onChange={() => {}} onSave={() => {}} notice={DRAFT_NOTICE} saveState="saving" backupStorage={null} />);
    expect(banner()).toBeNull();
    rerender(<StructuredExamBuilder exam={makeExam()} onChange={() => {}} onSave={() => {}} notice={DRAFT_NOTICE} saveState="recovered" backupStorage={null} />);
    expect(banner()).toBeNull();
    rerender(<StructuredExamBuilder exam={makeExam()} onChange={() => {}} onSave={() => {}} notice={DRAFT_NOTICE} backupStorage={null} />);
    expect(banner()!.textContent).toBe(DRAFT_NOTICE);                              // no save state at all (no reliability layer): as before
  });

  it("a notice about how an unsaved exam was opened (noticeKind «open»: an import, a preset) claims no save and stays beside «تغييرات غير محفوظة»", () => {
    const IMPORTED = "✓ تم استيراد الامتحان — راجعه ثم احفظه كمسودة أو اعتمده نهائيًا.";
    render(<StructuredExamBuilder exam={makeExam()} onChange={() => {}} onSave={() => {}} notice={IMPORTED} noticeKind="open" saveState="dirty" backupStorage={null} />);
    expect(banner()!.textContent).toBe(IMPORTED);
    expect(spoken(banner()!)).toBe("تم استيراد الامتحان — راجعه ثم احفظه كمسودة أو اعتمده نهائيًا.");
  });
});
