// @vitest-environment happy-dom
//
// Phase 21E.2 (B) — useModalSurface: the builder overlay's dialog behaviour. Focus moves into the labelled surface, Tab wraps,
// Escape calls the caller's exit path (where the unsaved guard lives), and every key is left to a layer stacked above
// (Dialog / ConfirmDialog / ActionMenu). Focus returns to the opener when the surface closes.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import { useRef, useState } from "react";
import useModalSurface from "./useModalSurface";
import Dialog from "./Dialog";
import ActionMenu from "./ActionMenu";

afterEach(cleanup);

function Surface({ onEscape, children }: { onEscape: () => void; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalSurface(ref, true, onEscape);
  return <div ref={ref} role="dialog" aria-modal="true" aria-label="محرر الامتحان" tabIndex={-1}>
    <button type="button">أول</button><input aria-label="عنوان" /><button type="button">أخير</button>{children}
  </div>;
}
function Page({ onEscape, inner }: { onEscape: () => void; inner?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)}>فتح المحرر</button><button type="button">خارج</button>
    {open && <Surface onEscape={() => { onEscape(); setOpen(false); }}>{inner}</Surface>}</>;
}

describe("useModalSurface", () => {
  it("moves focus to the labelled surface, wraps Tab both ways and returns focus to the opener on close", () => {
    const onEscape = vi.fn();
    render(<Page onEscape={onEscape} />);
    const opener = screen.getByRole("button", { name: "فتح المحرر" });
    opener.focus(); fireEvent.click(opener);
    const surface = screen.getByRole("dialog", { name: "محرر الامتحان" });
    expect(document.activeElement).toBe(surface);
    screen.getByRole("button", { name: "أخير" }).focus();
    fireEvent.keyDown(document.activeElement as Element, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "أول" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "أخير" }));
    screen.getByRole("button", { name: "خارج" }).focus();                     // focus that escaped is pulled back in
    fireEvent.keyDown(document.activeElement as Element, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "أول" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("Escape is left to a Dialog stacked above; the surface acts only once it is the top layer again", () => {
    const onEscape = vi.fn();
    function WithDialog() {
      const [dlg, setDlg] = useState(true);
      return <Surface onEscape={onEscape}><Dialog open={dlg} title="تأكيد" onClose={() => setDlg(false)}><p>نص</p></Dialog></Surface>;
    }
    render(<WithDialog />);
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "تأكيد" })).toBeNull();     // the dialog closed …
    expect(onEscape).not.toHaveBeenCalled();                                   // … and the editor did not react
    act(() => { fireEvent.keyDown(document.body, { key: "Escape" }); });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("Escape inside an open ActionMenu closes only the menu", () => {
    const onEscape = vi.fn();
    render(<Surface onEscape={onEscape} ><ActionMenu label="المزيد"><button type="button">بند</button></ActionMenu></Surface>);
    fireEvent.click(screen.getByRole("button", { name: "المزيد" }));
    expect(screen.getByRole("button", { name: "بند" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "بند" })).toBeNull();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("an IME composition keeps its Escape", () => {
    const onEscape = vi.fn();
    render(<Surface onEscape={onEscape} />);
    fireEvent.keyDown(screen.getByLabelText("عنوان"), { key: "Escape", isComposing: true });
    expect(onEscape).not.toHaveBeenCalled();
  });
});
