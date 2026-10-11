// @vitest-environment happy-dom
// Phase 21E.1 (slice 2) — after the idle prefetch, useDeferredConfirm mounts its lazy dialog CLOSED ahead of time, so the teacher's
// first confirmation opens in the same commit as the click. Without that, the lazy component is first rendered on demand and
// suspends once even with the module already loaded (Chromium measured ~300 ms: React's fallback reveal throttle).
// Fail-first: on the slice-2 implementation commit 998e955 (prefetch only) the dialog is absent right after the click.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { useDeferredConfirm } from "./useDeferredConfirm";
import { isConfirmDialogReady, prefetchConfirmDialog } from "./confirmPrefetch";

afterEach(cleanup);
function Host() {
  const { confirm, confirmDialog } = useDeferredConfirm();
  return <><button type="button" onClick={() => { void confirm({ title: "حذف امتحان محفوظ", message: "سيُحذف الامتحان.", confirmLabel: "حذف الامتحان", cancelLabel: "إبقاء الامتحان", tone: "danger" }); }}>حذف</button>{confirmDialog}</>;
}

describe("21E.1 slice 2 — the prefetched confirmation opens in the same commit", () => {
  it("without a prefetch nothing is mounted before first use (slice-1 behaviour unchanged)", async () => {
    const { container } = render(<Host />);
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(isConfirmDialogReady()).toBe(false);
    expect(container.querySelectorAll("*").length).toBe(1);                       // only the button
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("after the prefetch the closed dialog is mounted (renders nothing) and the first click shows it synchronously", async () => {
    render(<Host />);
    act(() => { prefetchConfirmDialog(); });
    await vi.waitFor(() => expect(isConfirmDialogReady()).toBe(true));
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });          // the closed lazy dialog mounts and resolves
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "حذف" })); });
    const dialog = screen.getByRole("dialog", { name: "حذف امتحان محفوظ" });         // no await: nothing suspended
    expect(document.activeElement?.textContent).toBe("إبقاء الامتحان");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });
});
