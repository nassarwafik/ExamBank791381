// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { historyShortcut, isTextEditingTarget } from "./examHistoryShortcuts";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState, HISTORY_LIMIT } from "./examHistory";
import { autosaveKey, readExamBackup, writeExamBackup, type BackupStorage } from "./examAutosave";
import { toSavedStructuredExam } from "./examBuilderState";
import type { StructuredExam, BuilderImageAsset } from "./examTypes";

// Phase 13A — Enterprise reliability layer of the Structured Exam Builder, exercised through the REAL component +
// the REAL history hook (the exact App.tsx wiring): undo / redo UI + keyboard, saved / dirty / saving / recovered
// authority, local autosave + recovery decision, exit protection, and the async media / save race invariants.

const AI_BTN = "✨ إنشاء صورة بالذكاء الاصطناعي";
const IMG_A = "data:image/png;base64,AAAA";
const TITLE = "عنوان الامتحان المنظّم";
const SCOPE = "teacher-1";

const makeExam = (examId = "ex1", over: Partial<StructuredExam> = {}): StructuredExam => ({
  examId, title: "OLD TITLE", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [{ id: "s1", title: "S", gradingPolicy: "all", stimuli: {}, questions: [
    { examQuestionId: "qA", presentationType: "shortAnswer", text: "A", marks: 2, answer: { text: "x" } },
    { examQuestionId: "qB", presentationType: "shortAnswer", text: "B", marks: 2, answer: { text: "y" } },
  ] }],
  ...over
} as StructuredExam);

function memoryStorage(): BackupStorage & { map: Map<string, string>; failWrites: boolean } {
  const s = { map: new Map<string, string>(), failWrites: false } as BackupStorage & { map: Map<string, string>; failWrites: boolean };
  s.getItem = k => (s.map.has(k) ? s.map.get(k)! : null);
  s.setItem = (k, v) => { if (s.failWrites) throw new DOMException("quota", "QuotaExceededError"); s.map.set(k, v); };
  s.removeItem = k => { s.map.delete(k); };
  return s;
}

function deferredAI() {
  const pending: Record<string, (a: BuilderImageAsset) => void> = {};
  const fn = vi.fn((q: { examQuestionId: string }) => new Promise<BuilderImageAsset>(r => { pending[q.examQuestionId] = r; }));
  const resolve = async (qid: string, dataUrl: string) => { await act(async () => { pending[qid]({ id: "ai-" + qid, origin: "ai-generated", contentType: "image/png", dataUrl }); }); };
  return { fn, resolve };
}

// The App.tsx state owner, verbatim in shape: history hook, functional updates, snapshot → persist → commitSaved.
type Handles = {
  latest: StructuredExam | null; dirty: boolean; canUndo: boolean; canRedo: boolean; state: string;
  open: (e: StructuredExam, source?: "saved" | "unsaved") => void; clear: () => void; setMounted: (v: boolean) => void; update: (u: (e: StructuredExam) => StructuredExam) => void;
  save: (gate?: Promise<void>, mode?: "draft" | "final") => Promise<StructuredExam>; exits: number;
};
const h = {} as Handles;
function Host({ req, initial, source = "saved", storage, scope = SCOPE, delay = 0 }: { req?: (q: never) => Promise<BuilderImageAsset>; initial?: StructuredExam; source?: "saved" | "unsaved"; storage?: BackupStorage | null; scope?: string | null; delay?: number }) {
  const hist = useStructuredExamHistory();
  const [mounted, setMounted] = useState(true);
  const [saving, setSaving] = useState(false);
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial ?? makeExam(), source); } }, [hist, initial, source]);
  useEffect(() => {
    const save = async (gate?: Promise<void>, mode: "draft" | "final" = "draft") => {
      const snapshot = hist.present!;
      const payload = { ...toSavedStructuredExam(snapshot), status: mode };
      setSaving(true);
      if (gate) await gate;
      hist.commitSaved(snapshot, payload);
      setSaving(false);
      return payload;
    };
    Object.assign(h, { latest: hist.present, dirty: hist.dirty, canUndo: hist.canUndo, canRedo: hist.canRedo, state: examSaveState(hist.history, saving), open: hist.open, clear: hist.clear, setMounted, save, update: hist.update });
  }, [hist, saving]);
  if (!mounted || !hist.present) return null;
  return (
    <StructuredExamBuilder
      exam={hist.present} onChange={hist.update} onSave={() => { void h.save(); }} onExit={() => { h.exits = (h.exits || 0) + 1; }} saving={saving}
      requestQuestionImage={req as never} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo}
      saveState={examSaveState(hist.history, saving)} recoveryScope={scope === null ? undefined : scope} onRecover={hist.recover} backupStorage={storage === undefined ? null : storage} autosaveDelayMs={delay}
    />
  );
}

const q = (id: string) => h.latest!.sections[0].questions.find(x => x.examQuestionId === id)!;
const imgOf = (id: string) => q(id).image?.assets?.[0]?.dataUrl;
const titleInput = () => screen.getByPlaceholderText(TITLE) as HTMLInputElement;
const setTitle = (v: string) => fireEvent.change(titleInput(), { target: { value: v } });
const undoBtn = () => screen.getByRole("button", { name: "تراجع" }) as HTMLButtonElement;
const redoBtn = () => screen.getByRole("button", { name: "إعادة" }) as HTMLButtonElement;
const chip = () => (document.querySelector(".sb-save-state") as HTMLElement | null)?.textContent ?? "";
const textareaWith = (value: string) => Array.from(document.querySelectorAll("textarea")).find(t => (t as HTMLTextAreaElement).value === value) as HTMLTextAreaElement;
const key = (target: Element | Document | Window | Node, init: Partial<KeyboardEventInit> & { key: string }) => fireEvent.keyDown(target, { bubbles: true, ...init });
const tick = () => act(async () => { await new Promise(r => setTimeout(r, 5)); });

beforeEach(() => { window.confirm = vi.fn(() => true); h.exits = 0; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("B — undo / redo toolbar + keyboard", () => {
  it("buttons: disabled with no history; edit → undo enabled; undo → redo enabled; new edit clears redo", async () => {
    render(<Host />);
    await tick();
    expect(undoBtn().disabled).toBe(true); expect(redoBtn().disabled).toBe(true);
    setTitle("T1");
    expect(undoBtn().disabled).toBe(false); expect(redoBtn().disabled).toBe(true);
    fireEvent.click(undoBtn());
    expect(h.latest!.title).toBe("OLD TITLE"); expect(redoBtn().disabled).toBe(false);
    fireEvent.click(redoBtn());
    expect(h.latest!.title).toBe("T1");
    fireEvent.click(undoBtn()); setTitle("T2");
    expect(redoBtn().disabled).toBe(true);
    expect(undoBtn().title).toContain("Ctrl+Z"); expect(redoBtn().title).toContain("Ctrl+Y");
    expect(document.querySelector(".sb-builder")?.getAttribute("dir")).toBe("rtl");
  });

  it("undo is by SNAPSHOT (not display numbers): after deleting a section, undo brings back the same section object", async () => {
    render(<Host />);
    await tick();
    const before = h.latest!.sections[0];
    fireEvent.click(screen.getByRole("button", { name: /حذف القسم/ }));
    expect(h.latest!.sections).toHaveLength(0);
    fireEvent.click(undoBtn());
    expect(h.latest!.sections[0]).toBe(before);
  });

  it("keyboard: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z / Cmd+Z outside text fields; NOT inside input / textarea / contenteditable", async () => {
    render(<Host />);
    await tick();
    setTitle("T1"); setTitle("T2");
    key(document.body, { key: "z", ctrlKey: true });
    expect(h.latest!.title).toBe("T1");
    key(document.body, { key: "y", ctrlKey: true });
    expect(h.latest!.title).toBe("T2");
    key(document.body, { key: "z", ctrlKey: true, shiftKey: true });                 // redo with nothing to redo → no-op
    expect(h.latest!.title).toBe("T2");
    key(document.body, { key: "Z", metaKey: true });                                 // Cmd+Z (uppercase from shift-less caps) → undo
    expect(h.latest!.title).toBe("T1");
    key(document.body, { key: "z", metaKey: true, shiftKey: true });                 // Cmd+Shift+Z → redo
    expect(h.latest!.title).toBe("T2");
    // Inside a text field the browser's native undo is left alone: nothing happens to the history.
    key(titleInput(), { key: "z", ctrlKey: true });
    expect(h.latest!.title).toBe("T2");
    key(textareaWith("A"), { key: "z", ctrlKey: true });
    expect(h.latest!.title).toBe("T2");
    const ce = document.createElement("div"); ce.setAttribute("contenteditable", "true"); document.body.appendChild(ce);
    key(ce, { key: "z", ctrlKey: true });
    expect(h.latest!.title).toBe("T2");
    key(document.body, { key: "z", ctrlKey: true, altKey: true });                   // Alt combos are not ours
    expect(h.latest!.title).toBe("T2");
  });

  it("shortcut + target predicates (pure)", () => {
    expect(historyShortcut({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBe("undo");
    expect(historyShortcut({ key: "Z", ctrlKey: false, metaKey: true, shiftKey: true, altKey: false })).toBe("redo");
    expect(historyShortcut({ key: "y", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBe("redo");
    expect(historyShortcut({ key: "y", ctrlKey: false, metaKey: true, shiftKey: false, altKey: false })).toBeNull();   // Cmd+Y is browser history
    expect(historyShortcut({ key: "z", ctrlKey: true, metaKey: false, shiftKey: false, altKey: true })).toBeNull();
    expect(historyShortcut({ key: "s", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBeNull();
    const input = document.createElement("input"); expect(isTextEditingTarget(input)).toBe(true);
    input.type = "checkbox"; expect(isTextEditingTarget(input)).toBe(false);
    expect(isTextEditingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTextEditingTarget(document.createElement("button"))).toBe(false);
    expect(isTextEditingTarget(null)).toBe(false);
  });

  it("undo / redo are disabled while saving; the status chip says saving", async () => {
    render(<Host />);
    await tick();
    setTitle("T1");
    let release!: () => void;
    act(() => { void h.save(new Promise<void>(r => { release = r; })); });
    expect(undoBtn().disabled).toBe(true); expect(redoBtn().disabled).toBe(true);
    expect(chip()).toBe("⏳ جارٍ الحفظ");
    key(document.body, { key: "z", ctrlKey: true });
    expect(h.latest!.title).toBe("T1");
    await act(async () => { release(); await tick(); });
    expect(undoBtn().disabled).toBe(false);
  });
});

describe("C — saved / dirty / saving authority", () => {
  it("reopened saved exam: ✓ محفوظ; edit → ● تغييرات غير محفوظة; undo back → ✓ محفوظ; save → ✓ محفوظ (from the persisted payload)", async () => {
    render(<Host />);
    await tick();
    expect(chip()).toBe("✓ محفوظ");
    setTitle("T1");
    expect(chip()).toBe("● تغييرات غير محفوظة");
    fireEvent.click(undoBtn());
    expect(chip()).toBe("✓ محفوظ");
    fireEvent.click(redoBtn());
    await act(async () => { await h.save(); });
    expect(chip()).toBe("✓ محفوظ");
    expect(h.latest!.title).toBe("T1");
    expect(h.dirty).toBe(false);
  });

  it("a NEW / imported / converted exam is dirty from the start (no server copy yet), regardless of status", async () => {
    render(<Host initial={makeExam("new", { status: "final" })} source="unsaved" />);
    await tick();
    expect(chip()).toBe("● تغييرات غير محفوظة");
    await act(async () => { await h.save(); });
    expect(chip()).toBe("✓ محفوظ");
  });

  it("F3 — save A starts, edit B lands, response returns: B is kept, dirty, not stamped as saved", async () => {
    render(<Host />);
    await tick();
    setTitle("A");
    let release!: () => void;
    let saving!: Promise<StructuredExam>;
    act(() => { saving = h.save(new Promise<void>(r => { release = r; })); });
    // editing is disabled in the UI while saving (existing behaviour): the edit arrives through the owner exactly like
    // a late async result does (the media flavour below drives it through the real AI callback).
    act(() => h.update(e => ({ ...e, title: "B" })));
    await act(async () => { release(); await saving; });
    const payload = await saving;
    expect(payload.title).toBe("A");                                                 // the server has A
    expect(h.latest!.title).toBe("B");                                               // B is kept …
    expect(h.latest!.status).toBe("draft");
    expect(h.latest!.updatedAt).not.toBe(payload.updatedAt);                         // … not stamped as saved …
    expect(h.dirty).toBe(true);
    expect(chip()).toBe("● تغييرات غير محفوظة");                                     // … and still dirty
    await act(async () => { await h.save(); });                                      // a second save lands B
    expect(chip()).toBe("✓ محفوظ");
  });
});

describe("F — async media / save race invariants (real AI callback through the real history hook)", () => {
  it("F1 — edit → AI image starts → another edit → result returns: both land; undo removes ONLY the image, then only the last edit", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    await tick();
    setTitle("T1");
    fireEvent.click(screen.getAllByRole("button", { name: AI_BTN })[0]);           // qA pending
    fireEvent.change(textareaWith("B"), { target: { value: "B EDITED" } });
    await ai.resolve("qA", IMG_A);
    expect(h.latest!.title).toBe("T1"); expect(q("qB").text).toBe("B EDITED"); expect(imgOf("qA")).toBe(IMG_A);
    fireEvent.click(undoBtn());                                                      // F4: undo after the async update
    expect(imgOf("qA")).toBeUndefined(); expect(q("qB").text).toBe("B EDITED"); expect(h.latest!.title).toBe("T1");
    fireEvent.click(undoBtn());
    expect(q("qB").text).toBe("B"); expect(h.latest!.title).toBe("T1");
    fireEvent.click(redoBtn()); fireEvent.click(redoBtn());
    expect(imgOf("qA")).toBe(IMG_A); expect(q("qB").text).toBe("B EDITED");
  });

  it("F4b — undo WHILE the image is pending: the late result still merges onto the undone present (no old snapshot is restored)", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    await tick();
    setTitle("T1");
    fireEvent.click(screen.getAllByRole("button", { name: AI_BTN })[0]);
    fireEvent.click(undoBtn());                                                      // back to OLD TITLE while pending
    expect(h.latest!.title).toBe("OLD TITLE");
    await ai.resolve("qA", IMG_A);
    expect(h.latest!.title).toBe("OLD TITLE"); expect(imgOf("qA")).toBe(IMG_A);
    expect(h.canRedo).toBe(false);                                                   // the image is a new edit → redo cleared
  });

  it("F2 — AI starts on exam A → exam B is opened → result returns: B is untouched, and B's history is empty", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    await tick();
    setTitle("T1");
    fireEvent.click(screen.getAllByRole("button", { name: AI_BTN })[0]);
    const b = makeExam("ex2");
    act(() => h.open(b));
    expect(h.canUndo).toBe(false);                                                   // RESET on open
    await ai.resolve("qA", IMG_A);
    expect(h.latest).toBe(b);
    expect(q("qA").image).toBeUndefined();
    expect(h.canUndo).toBe(false);
  });

  it("F2b — exam cleared / builder closed while pending: the late result never recreates or modifies anything", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    await tick();
    fireEvent.click(screen.getAllByRole("button", { name: AI_BTN })[0]);
    act(() => h.clear());
    await ai.resolve("qA", IMG_A);
    expect(h.latest).toBeNull();
  });

  it("F3 (media) — image lands DURING a save: kept in memory, NOT persisted, exam stays dirty after the response", async () => {
    const ai = deferredAI();
    render(<Host req={ai.fn as never} />);
    await tick();
    fireEvent.click(screen.getAllByRole("button", { name: AI_BTN })[0]);
    let release!: () => void; let saving!: Promise<StructuredExam>;
    act(() => { saving = h.save(new Promise<void>(r => { release = r; })); });    // programmatic (the UI gate is tested elsewhere)
    await ai.resolve("qA", IMG_A);
    await act(async () => { release(); await saving; });
    const payload = await saving;
    expect(payload.sections[0].questions[0].image).toBeUndefined();
    expect(imgOf("qA")).toBe(IMG_A);
    expect(h.dirty).toBe(true);
    expect(chip()).toBe("● تغييرات غير محفوظة");
  });
});

describe("D — local autosave + recovery decision", () => {
  it("dirty edits are backed up (debounced, exam only), and a successful save clears the backup", async () => {
    const s = memoryStorage();
    render(<Host storage={s} />);
    await tick();
    expect(s.map.size).toBe(0);                                                      // saved state → nothing to back up
    setTitle("T1");
    await tick();
    const backup = readExamBackup(s, SCOPE, "ex1")!;
    expect(backup.exam.title).toBe("T1");
    expect(JSON.stringify(s.map.get(autosaveKey(SCOPE, "ex1")))).not.toMatch(/token/i);
    await act(async () => { await h.save(); });
    await tick();
    expect(s.map.size).toBe(0);
  });

  it("autosave is DEBOUNCED (one write for a burst of edits) and a pending write is FLUSHED on unmount", async () => {
    const s = memoryStorage();
    const writes = vi.spyOn(s, "setItem");
    render(<Host storage={s} delay={40} />);
    await tick();
    setTitle("T1"); setTitle("T2"); setTitle("T3");
    await act(async () => { await new Promise(r => setTimeout(r, 80)); });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(readExamBackup(s, SCOPE, "ex1")!.exam.title).toBe("T3");
    setTitle("T4");                                                                  // pending (40ms) …
    act(() => h.setMounted(false));                                                  // … builder closes before the timer
    expect(readExamBackup(s, SCOPE, "ex1")!.exam.title).toBe("T4");                  // flushed, not lost
    expect(writes).toHaveBeenCalledTimes(2);
  });

  it("recovery offer: a NEWER, DIFFERENT backup of the SAME exam → dialog; restore applies it as an undoable, unsaved copy", async () => {
    const s = memoryStorage();
    writeExamBackup(s, SCOPE, makeExam("ex1", { title: "LOCAL WORK" }), "2026-03-01T11:00:00.000Z");
    render(<Host storage={s} />);
    await tick();
    const dialog = screen.getByRole("dialog", { name: "نسخة غير محفوظة" });
    expect(dialog.textContent).toContain("تم العثور على نسخة غير محفوظة من هذا الامتحان.");
    fireEvent.click(screen.getByRole("button", { name: "استرجاع النسخة" }));
    expect(h.latest!.title).toBe("LOCAL WORK");
    expect(chip()).toBe("↺ نسخة مسترجعة — غير محفوظة");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(undoBtn());
    expect(h.latest!.title).toBe("OLD TITLE"); expect(chip()).toBe("✓ محفوظ");
    fireEvent.click(redoBtn());
    await act(async () => { await h.save(); });
    expect(chip()).toBe("✓ محفوظ");
  });

  it("discard deletes that exam's backup only; the server copy stays untouched and not dirty", async () => {
    const s = memoryStorage();
    writeExamBackup(s, SCOPE, makeExam("ex1", { title: "LOCAL WORK" }), "2026-03-01T11:00:00.000Z");
    writeExamBackup(s, SCOPE, makeExam("ex2", { title: "OTHER" }), "2026-03-01T11:00:00.000Z");
    render(<Host storage={s} />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "تجاهل النسخة" }));
    expect(readExamBackup(s, SCOPE, "ex1")).toBeNull();
    expect(readExamBackup(s, SCOPE, "ex2")).not.toBeNull();
    expect(h.latest!.title).toBe("OLD TITLE"); expect(chip()).toBe("✓ محفوظ");
  });

  it("F5 — a backup of exam A is never offered for exam B (nor to another teacher scope); older / identical backups are ignored", async () => {
    const s = memoryStorage();
    writeExamBackup(s, SCOPE, makeExam("exA", { title: "LOCAL A" }), "2026-03-01T11:00:00.000Z");
    writeExamBackup(s, "other-teacher", makeExam("exB", { title: "LOCAL B" }), "2026-03-01T11:00:00.000Z");
    writeExamBackup(s, SCOPE, makeExam("exOld", { title: "STALE" }), "2026-03-01T09:00:00.000Z");      // older than updatedAt 10:00
    writeExamBackup(s, SCOPE, makeExam("exSame"), "2026-03-01T11:00:00.000Z");                          // identical content
    for (const id of ["exB", "exOld", "exSame"]) {
      cleanup();
      render(<Host storage={s} initial={makeExam(id)} />);
      await tick();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(h.latest!.title).toBe("OLD TITLE");
    }
  });

  it("F6 — corrupt backup JSON never breaks the page: no dialog, editing works, the bad entry is dropped", async () => {
    const s = memoryStorage();
    s.map.set(autosaveKey(SCOPE, "ex1"), "{ definitely not json");
    render(<Host storage={s} />);
    await tick();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(s.map.has(autosaveKey(SCOPE, "ex1"))).toBe(false);
    setTitle("STILL EDITING");
    expect(h.latest!.title).toBe("STILL EDITING");
  });

  it("F7 — a storage quota exception never breaks editing (autosave just does not persist)", async () => {
    const s = memoryStorage(); s.failWrites = true;
    render(<Host storage={s} />);
    await tick();
    setTitle("T1"); await tick(); setTitle("T2"); await tick();
    expect(h.latest!.title).toBe("T2");
    expect(s.map.size).toBe(0);
    fireEvent.click(undoBtn());
    expect(h.latest!.title).toBe("T1");
  });

  it("no autosave and no recovery when the builder has no recovery scope (legacy callers)", async () => {
    const s = memoryStorage();
    writeExamBackup(s, "", makeExam("ex1", { title: "LOCAL" }), "2026-03-01T11:00:00.000Z");
    render(<Host storage={s} scope="" />);
    await tick();
    setTitle("T1"); await tick();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(s.map.size).toBe(1);                                                      // untouched
  });
});

describe("E — exit protection", () => {
  it("no unsaved changes → back exits immediately, no dialog", async () => {
    render(<Host />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "→ رجوع" }));
    await tick();
    expect(h.exits).toBe(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("unsaved changes → the project ConfirmDialog asks; 'البقاء' keeps the editor, 'الخروج دون حفظ' exits; refresh warns only while unsaved", async () => {
    const s = memoryStorage();
    render(<Host storage={s} />);
    await tick();
    const beforeUnload = (ev: BeforeUnloadEvent) => { window.dispatchEvent(ev); return ev.defaultPrevented; };
    const evt = () => { const e = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent; return e; };
    expect(beforeUnload(evt())).toBe(false);
    setTitle("T1");
    expect(beforeUnload(evt())).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "→ رجوع" }));
    await tick();
    const dialog = screen.getByRole("dialog", { name: "تغييرات غير محفوظة" });
    expect(dialog.textContent).toContain("توجد تغييرات غير محفوظة");
    fireEvent.click(screen.getByRole("button", { name: "البقاء في المحرر" }));
    await tick();
    expect(h.exits).toBe(0);
    expect(h.latest!.title).toBe("T1");
    fireEvent.click(screen.getByRole("button", { name: "→ رجوع" }));
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "الخروج دون حفظ" }));
    await tick();
    expect(h.exits).toBe(1);
    expect(h.latest!.title).toBe("T1");                                              // the work is NOT lost by exiting
    expect(readExamBackup(s, SCOPE, "ex1")?.exam.title).toBe("T1");                  // and it is backed up locally
    expect(window.confirm).not.toHaveBeenCalled();                                   // never window.confirm
  });
});

describe("G — bounded history through the UI", () => {
  it("more than HISTORY_LIMIT edits keep exactly HISTORY_LIMIT undo steps", async () => {
    render(<Host />);
    await tick();
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) setTitle("T" + i);
    let steps = 0;
    while (!undoBtn().disabled && steps < HISTORY_LIMIT + 50) { fireEvent.click(undoBtn()); steps++; }
    expect(steps).toBe(HISTORY_LIMIT);
    expect(h.latest!.title).toBe("T10");
  });
});

// ── Independent review of PR #221 — blockers ──────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Review blocker 1 — the recovery scope is a REAL authenticated teacher id or nothing (never a shared namespace)", () => {
  it("teacher id unavailable (profile not loaded / failed) → no backup is read, written or offered, even when backups exist", async () => {
    const s = memoryStorage();
    writeExamBackup(s, "teacher", makeExam("ex1", { title: "SHARED NAMESPACE" }), "2026-03-01T11:00:00.000Z");
    writeExamBackup(s, "t-9", makeExam("ex1", { title: "SOMEONE ELSE" }), "2026-03-01T11:00:00.000Z");
    const reads = vi.spyOn(s, "getItem"), writes = vi.spyOn(s, "setItem");
    render(<Host storage={s} scope={null} />);
    await tick();
    expect(screen.queryByRole("dialog")).toBeNull();
    setTitle("T1"); await tick();
    expect(h.latest!.title).toBe("T1");
    expect(reads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
    expect(s.map.size).toBe(2);                                                      // untouched
  });

  it("once the real teacher id becomes available → autosave / recovery use THAT scope (offer appears, edits are written under it)", async () => {
    const s = memoryStorage();
    writeExamBackup(s, "t-7", makeExam("ex1", { title: "LOCAL WORK" }), "2026-03-01T11:00:00.000Z");
    const { rerender } = render(<Host storage={s} scope={null} />);
    await tick();
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<Host storage={s} scope="t-7" />);                                      // profile loaded
    await tick();
    expect(screen.getByRole("dialog", { name: "نسخة غير محفوظة" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تجاهل النسخة" }));
    setTitle("MINE"); await tick();
    expect(readExamBackup(s, "t-7", "ex1")!.exam.title).toBe("MINE");
    expect([...s.map.keys()].every(k => k.includes(":t-7:"))).toBe(true);
  });

  it("a backup of teacher A is never offered to teacher B on the same browser, even for the SAME examId", async () => {
    const s = memoryStorage();
    render(<Host storage={s} scope="teacher-A" />);
    await tick();
    setTitle("A'S ANSWER KEY WORK"); await tick();
    expect(readExamBackup(s, "teacher-A", "ex1")!.exam.title).toBe("A'S ANSWER KEY WORK");
    cleanup();
    render(<Host storage={s} scope="teacher-B" />);                                  // same examId, other teacher
    await tick();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.latest!.title).toBe("OLD TITLE");
    expect(readExamBackup(s, "teacher-A", "ex1")).not.toBeNull();                    // A's work is still A's
  });

  it("source guard: App passes only teacherProfile.teacherId (no generic fallback namespace) and never the token", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const m = app.match(/recoveryScope=\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("teacherProfile?.teacherId || undefined");
    expect(m![1]).not.toMatch(/token/i);
    expect(app).not.toMatch(/recoveryScope=\{[^}]*"teacher"/);
    const autosave = readFileSync(resolve(process.cwd(), "src/examAutosave.ts"), "utf8");
    expect(autosave).not.toMatch(/"teacher"/);
  });
});

describe("Review blocker 2 — undo after a raced save lands on the PERSISTED checkpoint", () => {
  it("saved T0 → edit A → save(A) → edit B → response → undo = persisted A (✓ محفوظ) → redo = B (dirty)", async () => {
    render(<Host />);
    await tick();
    setTitle("A");
    let release!: () => void; let saving!: Promise<StructuredExam>;
    act(() => { saving = h.save(new Promise<void>(r => { release = r; }), "final"); });
    act(() => h.update(e => ({ ...e, title: "B" })));
    await act(async () => { release(); await saving; });
    const payload = await saving;
    expect(h.latest!.title).toBe("B"); expect(h.dirty).toBe(true);
    fireEvent.click(undoBtn());
    expect(h.latest).toBe(payload);
    expect(h.latest!.status).toBe("final");
    expect(h.latest!.updatedAt).toBe(payload.updatedAt);
    expect(h.dirty).toBe(false);
    expect(chip()).toBe("✓ محفوظ");
    fireEvent.click(redoBtn());
    expect(h.latest!.title).toBe("B"); expect(h.dirty).toBe(true);
    expect(chip()).toBe("● تغييرات غير محفوظة");
  });

  it("same, with two edits after the snapshot: two undos reach the persisted A", async () => {
    render(<Host />);
    await tick();
    setTitle("A");
    let release!: () => void; let saving!: Promise<StructuredExam>;
    act(() => { saving = h.save(new Promise<void>(r => { release = r; })); });
    act(() => h.update(e => ({ ...e, title: "B" })));
    act(() => h.update(e => ({ ...e, title: "C" })));
    await act(async () => { release(); await saving; });
    const payload = await saving;
    fireEvent.click(undoBtn()); fireEvent.click(undoBtn());
    expect(h.latest).toBe(payload); expect(chip()).toBe("✓ محفوظ");
    fireEvent.click(undoBtn());
    expect(h.latest!.title).toBe("OLD TITLE"); expect(chip()).toBe("● تغييرات غير محفوظة");   // T0 is no longer what the server holds
    fireEvent.click(redoBtn());
    expect(h.latest).toBe(payload); expect(chip()).toBe("✓ محفوظ");                  // A_saved is the reconciled saved point
  });
});
