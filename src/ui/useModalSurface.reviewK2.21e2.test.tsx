// @vitest-environment happy-dom
//
// Phase 21E.2 part 2 — review cluster K2: the builder overlay as a modal surface (useModalSurface).
//   C-F1  Escape typed in a text-editing control inside the surface (the question explorer's search box «بحث في الامتحان», a
//         text field, a textarea, a select, a contenteditable) belongs to that control: the surface does not exit and does not
//         cancel the native behaviour (a search box clears itself). Escape anywhere else still takes the exit path.
//   A-F3  (1) A layer that closes in the SAME update that opens the surface (the import wizard: «فتح في باني الامتحان» opens the
//         builder and closes the wizard in one batch) gives focus back to ITS opener from its focus trap's passive cleanup, after
//         the surface already took focus: once those effects ran, focus is pulled back into the aria-modal surface — unless a
//         modal layer above it holds focus.
//         (2) When the surface closes and the control that opened it is gone (it left the page in the update that opened the
//         surface: the saved-exams row, «متابعة تحرير الامتحان المنظّم»), or the recorded opener was <body>, focus goes to the
//         caller's stable return target once the closing update has rendered it — never to <body>.
// Built with the REAL useFocusTrap (the import wizard's trap) and the REAL useModalSurface.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import { StrictMode, useRef, useState, type ReactNode } from "react";
import useModalSurface from "./useModalSurface";
import useFocusTrap from "./useFocusTrap";
import Dialog from "./Dialog";

afterEach(cleanup);

function Surface({ onEscape, returnFocus, children }: { onEscape: () => void; returnFocus?: () => HTMLElement | null; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalSurface(ref, true, onEscape, returnFocus);
  return <div ref={ref} role="dialog" aria-modal="true" aria-label="محرر الامتحان" tabIndex={-1}>{children}</div>;
}

describe("C-F1 — Escape in a text-editing control is the control's own", () => {
  function Editor({ onEscape }: { onEscape: () => void }) {
    return (
      <Surface onEscape={onEscape}>
        <button type="button">أول</button>
        <input type="search" aria-label="بحث في الامتحان" defaultValue="شبكة" />
        <input aria-label="عنوان الامتحان" defaultValue="امتحان" />
        <textarea aria-label="نص السؤال" defaultValue="نص" />
        <select aria-label="وحدة العد"><option>السؤال</option></select>
        <div contentEditable suppressContentEditableWarning aria-label="محتوى منسق" role="textbox">نص</div>
        <input type="checkbox" aria-label="تحديد السؤال" />
        <div tabIndex={0} aria-label="بطاقة السؤال">بطاقة</div>
      </Surface>
    );
  }

  it("Escape in the explorer's search box neither exits nor is default-prevented (the native clear runs)", () => {
    const onEscape = vi.fn();
    render(<Editor onEscape={onEscape} />);
    const search = screen.getByLabelText("بحث في الامتحان");
    search.focus();
    const notPrevented = fireEvent.keyDown(search, { key: "Escape" });
    expect(onEscape).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it("the same for a text field, a textarea, a select and a contenteditable region", () => {
    const onEscape = vi.fn();
    render(<Editor onEscape={onEscape} />);
    for (const name of ["عنوان الامتحان", "نص السؤال", "وحدة العد", "محتوى منسق"]) {
      const el = screen.getByLabelText(name);
      el.focus();
      expect(fireEvent.keyDown(el, { key: "Escape" }), name).toBe(true);
    }
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("an IME composition in an editor that is not a native field or contenteditable (an EditContext-style host) keeps its Escape", () => {
    // The text-field rule above does not recognise such a host (role="textbox" on a plain element); the composition guard does.
    const onEscape = vi.fn();
    render(<Editor onEscape={onEscape} />);
    const surface = screen.getByRole("dialog", { name: "محرر الامتحان" });
    const host = document.createElement("div");
    host.setAttribute("role", "textbox"); host.setAttribute("aria-label", "محرر مخصص"); host.tabIndex = 0;
    surface.appendChild(host);
    host.focus();
    expect(fireEvent.keyDown(host, { key: "Escape", isComposing: true })).toBe(true);
    expect(onEscape).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(host, { key: "Escape" })).toBe(false);            // without a composition it is a non-text target
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("Escape on a non-text control (a button, a checkbox, a card) still exits and is default-prevented", () => {
    const onEscape = vi.fn();
    render(<Editor onEscape={onEscape} />);
    for (const name of ["أول", "تحديد السؤال", "بطاقة السؤال"]) {
      const el = name === "أول" ? screen.getByRole("button", { name }) : screen.getByLabelText(name);
      el.focus();
      expect(fireEvent.keyDown(el, { key: "Escape" }), name).toBe(false);
    }
    expect(onEscape).toHaveBeenCalledTimes(3);
  });
});

describe("A-F3 (1) — a layer closing in the update that opens the surface does not take focus behind it", () => {
  // A replica of the import wizard: a dialog with the REAL useFocusTrap (restoreFocus on, like SmartStructuredExamImportWizard),
  // whose last step opens the builder AND closes the wizard in one handler (App.openImportedStructuredExam).
  function Wizard({ onClose, onOpen }: { onClose: () => void; onOpen: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useFocusTrap(ref, true, onClose);
    return <div ref={ref} role="dialog" aria-modal="true" aria-label="استيراد"><button type="button" onClick={onOpen}>فتح في باني الامتحان</button></div>;
  }
  function App({ dialogWithBuilder = false }: { dialogWithBuilder?: boolean }) {
    const [wizard, setWizard] = useState(false);
    const [builder, setBuilder] = useState(false);
    return <>
      <button type="button" onClick={() => setWizard(true)}>استيراد امتحان منظّم</button>
      {wizard && <Wizard onClose={() => setWizard(false)} onOpen={() => { setBuilder(true); setWizard(false); }} />}
      {builder && <Surface onEscape={() => setBuilder(false)}>
        <button type="button">رجوع</button>
        {dialogWithBuilder && <Dialog open title="استعادة" onClose={() => {}}><button type="button">استعادة النسخة</button></Dialog>}
      </Surface>}
    </>;
  }

  it("opening the builder from the wizard leaves focus inside the aria-modal builder, not on «استيراد امتحان منظّم» behind it", async () => {
    render(<App />);
    const importBtn = screen.getByRole("button", { name: "استيراد امتحان منظّم" });
    importBtn.focus(); fireEvent.click(importBtn);
    const open = screen.getByRole("button", { name: "فتح في باني الامتحان" });
    expect(document.activeElement).toBe(open);                                // the wizard's trap took focus
    fireEvent.click(open);
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });  // passive effects + a frame
    const surface = screen.getByRole("dialog", { name: "محرر الامتحان" });
    expect(screen.queryByRole("dialog", { name: "استيراد" })).toBeNull();
    expect(surface.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(importBtn);
  });

  it("a modal dialog layered above the surface keeps the focus it took (the settle step never steals it)", async () => {
    render(<App dialogWithBuilder />);
    const importBtn = screen.getByRole("button", { name: "استيراد امتحان منظّم" });
    importBtn.focus(); fireEvent.click(importBtn);
    fireEvent.click(screen.getByRole("button", { name: "فتح في باني الامتحان" }));
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    const dialog = screen.getByRole("dialog", { name: "استعادة" });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("an aria-modal layer that took focus while mounting with the surface keeps it (the settle step yields to a layer above)", async () => {
    function WithAlert() {
      const [builder, setBuilder] = useState(false);
      return <>
        <button type="button" onClick={() => setBuilder(true)}>فتح المحرر</button>
        {builder && <Surface onEscape={() => setBuilder(false)}><button type="button">رجوع</button></Surface>}
        {/* A modal layer outside the surface that takes focus while it mounts (autoFocus, in the same commit as the surface). */}
        {builder && <div role="dialog" aria-modal="true" aria-label="تنبيه"><button type="button" autoFocus>حسنًا</button></div>}
      </>;
    }
    render(<WithAlert />);
    const open = screen.getByRole("button", { name: "فتح المحرر" });
    open.focus(); fireEvent.click(open);
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "حسنًا" }));
  });
});

describe("A-F3 (2) — closing the surface never drops focus on <body>", () => {
  // App's shape: the control that opened the builder leaves the page in the same update (a saved-exams row closes with its panel;
  // «متابعة تحرير الامتحان المنظّم» is rendered only while the builder is closed), and «متابعة …» is back once it closes.
  function App({ withReturn = true }: { withReturn?: boolean }) {
    const [open, setOpen] = useState(false);
    const [listOpen, setListOpen] = useState(true);
    const continueRef = useRef<HTMLButtonElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);
    const returnFocus = () => continueRef.current ?? toggleRef.current;
    return <>
      <button type="button" ref={toggleRef}>الامتحانات المحفوظة</button>
      {listOpen && <ul><li><button type="button" onClick={() => { setOpen(true); setListOpen(false); }}>فتح وتعديل</button></li></ul>}
      {!open && <button type="button" ref={continueRef} onClick={() => setOpen(true)}>متابعة تحرير الامتحان المنظّم</button>}
      {open && <Surface onEscape={() => setOpen(false)} returnFocus={withReturn ? returnFocus : undefined}><button type="button">رجوع</button></Surface>}
    </>;
  }
  const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });

  it("opened from a saved-exams row that left the page: closing focuses «متابعة تحرير الامتحان المنظّم»", async () => {
    render(<App />);
    const row = screen.getByRole("button", { name: "فتح وتعديل" });
    row.focus(); fireEvent.click(row);
    await settle();
    expect(screen.getByRole("dialog", { name: "محرر الامتحان" }).contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "متابعة تحرير الامتحان المنظّم" }));
  });

  it("opened from «متابعة تحرير الامتحان المنظّم» itself (removed while the builder is open): closing focuses the new «متابعة …»", async () => {
    render(<App />);
    const cont = screen.getByRole("button", { name: "متابعة تحرير الامتحان المنظّم" });
    cont.focus(); fireEvent.click(cont);
    await settle();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "متابعة تحرير الامتحان المنظّم" }));
  });

  it("an opener that is still in the page keeps priority over the return target", async () => {
    render(<App />);
    const toggle = screen.getByRole("button", { name: "الامتحانات المحفوظة" });
    toggle.focus();
    // fireEvent.click never moves focus: the surface opens while focus is on the toggle, which stays in the page — its opener.
    fireEvent.click(screen.getByRole("button", { name: "متابعة تحرير الامتحان المنظّم" }));
    await settle();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await settle();
    expect(document.activeElement).toBe(toggle);
  });

  it("under StrictMode (effects mounted, cleaned up and mounted again) focus stays inside the open surface; closing still returns", async () => {
    render(<StrictMode><App /></StrictMode>);
    const row = screen.getByRole("button", { name: "فتح وتعديل" });
    row.focus(); fireEvent.click(row);
    await settle();
    expect(screen.getByRole("dialog", { name: "محرر الامتحان" }).contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await settle();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "متابعة تحرير الامتحان المنظّم" }));
  });

  it("focus the closing update put somewhere on purpose is kept (the return target only replaces LOST focus)", async () => {
    function Notice() {
      const [open, setOpen] = useState(false);
      const [listOpen, setListOpen] = useState(true);
      const noticeRef = useRef<HTMLParagraphElement>(null);
      const fallback = useRef<HTMLButtonElement>(null);
      return <>
        <p ref={noticeRef} tabIndex={-1}>تم إغلاق المحرر</p>
        <button type="button" ref={fallback}>الامتحانات المحفوظة</button>
        {listOpen && <button type="button" onClick={() => { setOpen(true); setListOpen(false); }}>فتح وتعديل</button>}
        {open && <Surface onEscape={() => { setOpen(false); noticeRef.current?.focus(); }} returnFocus={() => fallback.current}><button type="button">رجوع</button></Surface>}
      </>;
    }
    render(<Notice />);
    const row = screen.getByRole("button", { name: "فتح وتعديل" });
    row.focus(); fireEvent.click(row);
    await settle();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement?.textContent).toBe("تم إغلاق المحرر");
  });

  it("without a return target the surface closes without throwing (nothing else is focused)", async () => {
    render(<App withReturn={false} />);
    const row = screen.getByRole("button", { name: "فتح وتعديل" });
    row.focus(); fireEvent.click(row);
    await settle();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
