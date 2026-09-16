// @vitest-environment happy-dom
//
// UX-4 — Dialog + ConfirmDialog contract: role/aria, focus trap, initial focus, Escape (top dialog only), backdrop,
// focus return, body scroll lock, suspension; and the awaited confirm adapter (cancel → false, confirm → true,
// Escape → false, danger starts on "إلغاء", pending confirm resolves false on unmount / cancelPending / replacement).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import { useRef, useState } from "react";
import Dialog from "./Dialog";
import { useConfirm } from "./useConfirm";

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ""; });

function Host({ two = false, suspended = false, initial = false }: { two?: boolean; suspended?: boolean; initial?: boolean }) {
  const [a, setA] = useState(false); const [b, setB] = useState(false);
  const focusRef = useRef<HTMLInputElement>(null);
  return <>
    <button type="button" onClick={() => setA(true)}>open-a</button>
    <Dialog open={a} title="حوار أ" onClose={() => setA(false)} suspended={suspended} initialFocusRef={initial ? focusRef : undefined}
      footer={<><button type="button" onClick={() => setA(false)}>إلغاء</button>{two && <button type="button" onClick={() => setB(true)}>open-b</button>}</>}>
      <label>الاسم<input ref={focusRef} /></label>
      <label>العائلة<input /></label>
    </Dialog>
    <Dialog open={b} title="حوار ب" onClose={() => setB(false)} footer={<button type="button" onClick={() => setB(false)}>إغلاق ب</button>}>
      <p>محتوى ب</p>
    </Dialog>
  </>;
}
const dialog = (name: string) => screen.getByRole("dialog", { name });

describe("Dialog", () => {
  it("has role=dialog, aria-modal, is labelled by its title, locks body scroll and returns focus to the opener on close", () => {
    render(<Host />);
    const opener = screen.getByText("open-a"); opener.focus();
    fireEvent.click(opener);
    const d = dialog("حوار أ");
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(d.getAttribute("aria-labelledby") || "")?.textContent).toBe("حوار أ");
    expect(document.body.style.overflow).toBe("hidden");
    expect(d.contains(document.activeElement)).toBe(true);          // initial focus moved inside
    fireEvent.click(within(d).getByRole("button", { name: "إغلاق" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
  });
  it("honours initialFocusRef and traps Tab / Shift+Tab inside the panel", () => {
    render(<Host initial />);
    fireEvent.click(screen.getByText("open-a"));
    const d = dialog("حوار أ");
    expect(document.activeElement).toBe(within(d).getByLabelText("الاسم"));
    const focusables = Array.from(d.querySelectorAll<HTMLElement>("button, input"));
    focusables[focusables.length - 1].focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(focusables[0]);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });
  it("Escape closes only the TOP dialog; backdrop click closes the current one", () => {
    render(<Host two />);
    fireEvent.click(screen.getByText("open-a"));
    fireEvent.click(screen.getByText("open-b"));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "حوار ب" })).toBeNull();
    expect(dialog("حوار أ")).toBeTruthy();                           // the lower dialog survived the Escape
    expect(document.body.style.overflow).toBe("hidden");             // still locked while one dialog is open
    fireEvent.click(screen.getAllByTestId("eb-dialog-backdrop")[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
  it("suspended: hidden from assistive tech and the trap is released (Escape ignored)", () => {
    const { rerender } = render(<Host />);
    fireEvent.click(screen.getByText("open-a"));
    rerender(<Host suspended />);
    const d = document.querySelector('[role="dialog"]') as HTMLElement;   // aria-hidden while suspended → not in the accessibility tree
    expect(d.getAttribute("aria-hidden")).toBe("true");
    expect(d.closest(".eb-dialog-root")?.className).toContain("is-suspended");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();       // the released trap ignores Escape
    rerender(<Host />);
    expect(screen.getByRole("dialog", { name: "حوار أ" }).getAttribute("aria-hidden")).toBeNull();
  });
});

function ConfirmHost({ danger = false }: { danger?: boolean }) {
  const { confirm, cancelPending, confirmDialog } = useConfirm();
  const [result, setResult] = useState("pending");
  return <>
    <button type="button" onClick={() => { setResult("pending"); void confirm({ message: "هل أنت متأكد؟\nسطر ثانٍ", tone: danger ? "danger" : "default", confirmLabel: danger ? "حذف نهائي" : undefined }).then(v => setResult(String(v))); }}>ask</button>
    <button type="button" onClick={cancelPending}>cancel-pending</button>
    <output data-testid="result">{result}</output>
    {confirmDialog}
  </>;
}

describe("ConfirmDialog / useConfirm", () => {
  it("renders the message verbatim; إلغاء resolves false, the primary button resolves true", async () => {
    render(<ConfirmHost />);
    fireEvent.click(screen.getByText("ask"));
    const d = await screen.findByRole("dialog", { name: "تأكيد" });
    expect(within(d).getByText(/هل أنت متأكد؟/).textContent).toBe("هل أنت متأكد؟\nسطر ثانٍ");
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "تأكيد" }));
    fireEvent.click(within(d).getByRole("button", { name: "إلغاء" }));
    await screen.findByText("false");
    fireEvent.click(screen.getByText("ask"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "تأكيد" }));
    await screen.findByText("true");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("danger tone: differentiated title, focus starts on إلغاء, Escape resolves false", async () => {
    render(<ConfirmHost danger />);
    fireEvent.click(screen.getByText("ask"));
    const d = await screen.findByRole("dialog", { name: "تأكيد إجراء لا يمكن التراجع عنه" });
    expect(d.className).toContain("tone-danger");
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "إلغاء" }));
    expect(within(d).getByRole("button", { name: "حذف نهائي" }).className).toContain("is-danger");
    fireEvent.keyDown(document, { key: "Escape" });
    await screen.findByText("false");
  });
  it("a pending confirmation resolves false on cancelPending, on replacement by a new confirm, and on unmount", async () => {
    const { unmount } = render(<ConfirmHost />);
    fireEvent.click(screen.getByText("ask"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByText("cancel-pending"));
    await screen.findByText("false");
    expect(screen.queryByRole("dialog")).toBeNull();
    // replacement: a second confirm while one is pending settles the first as false
    let first: Promise<boolean> | null = null;
    function Replace() { const { confirm, confirmDialog } = useConfirm(); return <><button type="button" onClick={() => { first = confirm("أول"); void confirm("ثانٍ"); }}>go</button>{confirmDialog}</>; }
    cleanup(); render(<Replace />);
    fireEvent.click(screen.getByText("go"));
    expect(await first!).toBe(false);
    expect(within(await screen.findByRole("dialog")).getByText("ثانٍ")).toBeTruthy();
    // unmount: never a hanging promise
    cleanup();
    let pending: Promise<boolean> | null = null;
    function Unmount() { const { confirm, confirmDialog } = useConfirm(); return <><button type="button" onClick={() => { pending = confirm("x"); }}>go</button>{confirmDialog}</>; }
    const u = render(<Unmount />);
    fireEvent.click(screen.getByText("go"));
    await screen.findByRole("dialog");
    act(() => u.unmount());
    expect(await pending!).toBe(false);
    unmount();
  });
});
