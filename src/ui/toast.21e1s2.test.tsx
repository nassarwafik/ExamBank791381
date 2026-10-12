// @vitest-environment happy-dom
// Phase 21E.1 (slice 2) — the shared Toast (src/ui/Toast.tsx): announced through a live region that is ALWAYS mounted (never a region
// inserted together with its text), never steals focus, timing adjustable (pauses on hover / focus, close button, Escape), one action
// with an unambiguous accessible name, one toast at a time, and the owner learns how it left and whether focus was inside.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect } from "react";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { useToast, type ToastDismissReason, type ToastOptions } from "./Toast";

type Log = { reason: ToastDismissReason; hadFocus: boolean }[];
let log: Log = [];
let api: ReturnType<typeof useToast> | null = null;
function Host({ disabled = false, duration = 8000 }: { disabled?: boolean; duration?: number }) {
  const t = useToast({ defaultDurationMs: duration, actionDisabled: disabled });
  useEffect(() => { api = t; });
  return <div><button type="button">قبل</button>{t.toastRegion}</div>;
}
const show = (o: Partial<ToastOptions> = {}) => act(() => { api!.showToast({ message: "تم حذف السؤال 2 من «القسم الأول».", onDismiss: (reason, hadFocus) => { log.push({ reason, hadFocus }); }, ...o }); });
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => { log = []; api = null; vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("21E.1 slice 2 — Toast", () => {
  it("the polite live region exists before any toast; the message is inserted into it after the card appears; focus never moves", () => {
    render(<Host />);
    const live = () => screen.getByRole("status");
    expect(live().getAttribute("aria-live")).toBe("polite");
    expect(live().textContent).toBe("");
    const before = screen.getByRole("button", { name: "قبل" });
    before.focus();
    show();
    expect(screen.getByRole("group", { name: "إشعار" }).textContent).toContain("تم حذف السؤال 2");
    expect(live().textContent).toBe("");                                 // not yet: inserted after the card is in the DOM
    advance(80);
    expect(live().textContent).toBe("تم حذف السؤال 2 من «القسم الأول».");
    expect(document.activeElement).toBe(before);                         // announced, never focus-stealing
    expect(screen.getByRole("group", { name: "إشعار" }).closest("[dir='rtl']")).toBeTruthy();
    show({ message: "مرئي", announcement: "مسموع مع تلميح" });                  // a replacement is announced afresh, with its own text
    expect(live().textContent).toBe("");
    advance(80);
    expect(live().textContent).toBe("مسموع مع تلميح");
    expect(screen.getByRole("group", { name: "إشعار" }).textContent).toContain("مرئي");
  });

  it("the action shows «تراجع» but is named «تراجع عن حذف السؤال» (no clash with the toolbar's «تراجع»); it runs once and closes the toast", () => {
    render(<Host />);
    const onAction = vi.fn();
    show({ action: { label: "تراجع", accessibleLabel: "تراجع عن حذف السؤال", onAction } });
    expect(screen.queryByRole("button", { name: "تراجع" })).toBeNull();
    const btn = screen.getByRole("button", { name: "تراجع عن حذف السؤال" });
    expect(btn.textContent).toBe("تراجع");
    act(() => { fireEvent.click(btn); });
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: "إشعار" })).toBeNull();
    expect(log).toEqual([{ reason: "action", hadFocus: false }]);
  });

  it("actionDisabled disables the action reactively (e.g. while saving) and a click does nothing", () => {
    const onAction = vi.fn();
    const { rerender } = render(<Host />);
    show({ action: { label: "تراجع", accessibleLabel: "تراجع عن حذف القسم", onAction } });
    rerender(<Host disabled />);
    const btn = screen.getByRole("button", { name: "تراجع عن حذف القسم" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    act(() => { fireEvent.click(btn); });
    expect(onAction).not.toHaveBeenCalled();
    rerender(<Host />);
    expect(btn.disabled).toBe(false);
  });

  it("leaves after its duration; hover and focus pause the countdown and leaving resumes it with the remaining time", () => {
    render(<Host duration={5000} />);
    show();
    const card = screen.getByRole("group", { name: "إشعار" });
    advance(3000);
    act(() => { fireEvent.mouseEnter(card); });
    advance(10000);
    expect(screen.queryByRole("group", { name: "إشعار" })).not.toBeNull();   // paused while hovered
    act(() => { fireEvent.mouseLeave(card); });
    advance(1900);
    expect(screen.queryByRole("group", { name: "إشعار" })).not.toBeNull();   // ~2000 ms were left
    advance(200);
    expect(screen.queryByRole("group", { name: "إشعار" })).toBeNull();
    expect(log).toEqual([{ reason: "timeout", hadFocus: false }]);
  });

  it("keyboard focus inside the card pauses it; Escape inside closes it and reports that focus was inside", () => {
    render(<Host duration={3000} />);
    show({ action: { label: "تراجع", accessibleLabel: "تراجع عن حذف السؤال", onAction: () => {} } });
    const btn = screen.getByRole("button", { name: "تراجع عن حذف السؤال" });
    act(() => { btn.focus(); fireEvent.focus(btn); });
    advance(10000);
    expect(screen.queryByRole("group", { name: "إشعار" })).not.toBeNull();
    act(() => { fireEvent.keyDown(btn, { key: "Escape" }); });
    expect(screen.queryByRole("group", { name: "إشعار" })).toBeNull();
    expect(log).toEqual([{ reason: "escape", hadFocus: true }]);
  });

  it("the close button «إغلاق الإشعار» closes it; a newer toast replaces the current one (reported as replaced); dismissToast(id) ignores stale ids", () => {
    render(<Host />);
    show();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "إغلاق الإشعار" })); });
    expect(log).toEqual([{ reason: "close", hadFocus: false }]);
    show({ message: "أول" });
    let firstId = 0;
    act(() => { firstId = api!.activeToastId; });
    show({ message: "ثانٍ" });
    expect(log.slice(1)).toEqual([{ reason: "replaced", hadFocus: false }]);
    expect(screen.getByRole("group", { name: "إشعار" }).textContent).toContain("ثانٍ");
    act(() => { api!.dismissToast(firstId); });
    expect(screen.getByRole("group", { name: "إشعار" }).textContent).toContain("ثانٍ");      // a stale id cannot close the newer toast
    act(() => { api!.dismissToast(); });
    expect(screen.queryByRole("group", { name: "إشعار" })).toBeNull();
  });

  it("tones carry an icon (success / info / warn); neutral has none; the card is a dark surface with the inverse focus ring", () => {
    render(<Host />);
    show({ tone: "success", message: "تمت استعادة السؤال 2." });
    const card = screen.getByRole("group", { name: "إشعار" });
    expect(card.className).toContain("tone-success");
    expect(card.className).toContain("eb-on-dark");
    expect(card.querySelector(".eb-toast-icon svg")).toBeTruthy();
    show({ message: "رسالة" });
    expect(screen.getByRole("group", { name: "إشعار" }).querySelector(".eb-toast-icon")).toBeNull();
  });
});

describe("21E.1 slice 2 — toast.css stays inside the design system", () => {
  const css = readFileSync(path.join(process.cwd(), "src", "ui", "toast.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("token-only (no hex / rgb), only --eb-* variables, logical properties, no outline removal", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
    for (const m of css.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) expect(m[1]).toMatch(/^--eb-/);
    expect(css).not.toMatch(/outline\s*:\s*(none|0)/);
    expect(css).not.toMatch(/(margin|padding)-(left|right)\s*:/);
    expect(css).not.toMatch(/!important/);
  });
  it("Review Fix 1 (V1): the Arabic message is set at 16 px with the body line height (no clipped marks, readable at a glance)", () => {
    const rule = /\.eb-toast-message\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/font-size:\s*var\(--eb-fs-16\)/);
    expect(rule).toMatch(/line-height:\s*var\(--eb-lh-body\)/);
    expect(rule).not.toMatch(/overflow\s*:\s*hidden|text-overflow|-webkit-line-clamp|max-block-size|max-height/);   // never clipped
  });
  it("uses the toast layer, 44 px actions on phones and coarse pointers, and animates only without reduced motion", () => {
    expect(css).toMatch(/\.eb-toast-layer\s*\{[^}]*z-index:\s*var\(--eb-z-toast\)/);
    expect(css).toMatch(/@media \(max-width: 767px\)\s*\{[^@]*\.eb-toast-action\s*\{\s*min-block-size:\s*44px/);
    expect(css).toMatch(/@media \(pointer: coarse\)\s*\{\s*\.eb-toast-action\s*\{\s*min-block-size:\s*44px/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*:root:not\(\[data-eb-motion="off"\]\) \.eb-toast\s*\{\s*animation:/);
    expect(css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{[^}]*\}\s*\}/, "")).not.toMatch(/animation\s*:/);
  });
});

describe("21E.1 slice 2 — the toast never ships at startup", () => {
  it("only the lazily loaded structured builder imports it, and the bundle guard refuses the toast layer in the initial graph", () => {
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name) && !/\.test\./.test(name) && /(?:from|import)\s*"(?:\.\.?\/)+(?:ui\/)?Toast"/.test(readFileSync(full, "utf8"))) importers.push(path.relative(path.join(process.cwd(), "src"), full).replace(/\\/g, "/"));
      }
    };
    walk(path.join(process.cwd(), "src"));
    expect(importers).toEqual(["StructuredExamBuilder.tsx"]);
    const app = readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
    expect(app).toMatch(/lazy\(lazyWithRetry\(\(\) => import\("\.\/StructuredExamBuilder"\)/);
    expect(readFileSync(path.join(process.cwd(), "scripts", "check-bundle-budget.mjs"), "utf8")).toMatch(/read\(f\)\.includes\("eb-toast-layer"\)/);
  });
});
