// @vitest-environment happy-dom
// Phase 21E L2-C — «إعدادات القراءة» (reading comfort), behaviourally:
//   • the toolbar opens a labelled modal dialog with three native radio groups (text size, line spacing, reading theme);
//   • each choice applies at once to the reader root (data-read-size / -spacing / -theme), is remembered on this device
//     and survives a remount; «استعادة الإعدادات الافتراضية» resets;
//   • Escape closes and returns focus to the toolbar button; while the dialog is open the reader's shortcuts (F, arrows)
//     never fire behind it;
//   • presentation mode carries none of the attributes and offers no settings button — its layout is untouched;
//   • unreadable / blocked storage → defaults, never a crash;
//   • the stylesheet maps the steps to exactly 17 / 19 / 21 px and 1.85 / 2.05 / 2.25, scoped to normal reading.
/// <reference types="node" />
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import LearningReader from "./LearningReader";
import { makeImmediateApi } from "./readerFixtures";

const KEY = "eb.learning.readingSettings.v1";
afterEach(() => { cleanup(); vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* ignore */ } document.body.style.overflow = ""; });

function mount(props: Partial<Parameters<typeof LearningReader>[0]> = {}) {
  return render(<LearningReader courseId="791381" onExit={vi.fn()} api={makeImmediateApi()} {...props} />);
}
const heading = (name: string) => screen.findByRole("heading", { level: 2, name });
const root = () => document.querySelector(".learning-reader") as HTMLElement;
const attrs = () => ["data-read-size", "data-read-spacing", "data-read-theme"].map(a => root().getAttribute(a));
const openSettings = () => { fireEvent.click(screen.getByRole("button", { name: "إعدادات القراءة" })); return screen.getByRole("dialog", { name: "إعدادات القراءة" }); };

describe("21E L2-C — reading settings dialog", () => {
  it("opens a labelled dialog with three radio groups; defaults are size 19 px, normal spacing, light", async () => {
    mount();
    await heading("صفحة غنية");
    expect(attrs()).toEqual(["2", "1", "light"]);
    const dlg = openSettings();
    const groups = within(dlg).getAllByRole("group").map(g => g.querySelector("legend")!.textContent);
    expect(groups).toEqual(["حجم النص", "تباعد الأسطر", "لون صفحة القراءة"]);
    expect(within(dlg).getAllByRole("radio")).toHaveLength(8);
    expect((within(dlg).getByRole("radio", { name: /متوسط/ }) as HTMLInputElement).checked).toBe(true);
    expect((within(dlg).getByRole("radio", { name: /^عادية/ }) as HTMLInputElement).checked).toBe(true);
    expect((within(dlg).getByRole("radio", { name: /^فاتح/ }) as HTMLInputElement).checked).toBe(true);
    expect((within(dlg).getByRole("button", { name: "استعادة الإعدادات الافتراضية" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("applies each choice at once, remembers it on this device across a remount, and restores the defaults", async () => {
    const first = mount();
    await heading("صفحة غنية");
    const dlg = openSettings();
    fireEvent.click(within(dlg).getByRole("radio", { name: /^كبير/ }));
    fireEvent.click(within(dlg).getByRole("radio", { name: /^أوسع/ }));
    fireEvent.click(within(dlg).getByRole("radio", { name: /^ورقي/ }));
    expect(attrs()).toEqual(["3", "3", "sepia"]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ size: 3, spacing: 3, theme: "sepia" });
    first.unmount();

    mount();
    await heading("صفحة غنية");
    expect(attrs()).toEqual(["3", "3", "sepia"]);
    const again = openSettings();
    expect((within(again).getByRole("radio", { name: /^كبير/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(again).getByRole("button", { name: "استعادة الإعدادات الافتراضية" }));
    expect(attrs()).toEqual(["2", "1", "light"]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ size: 2, spacing: 1, theme: "light" });
  });

  it("Escape closes the dialog and returns focus to the toolbar button; «تم» closes too", async () => {
    mount();
    await heading("صفحة غنية");
    const toggle = screen.getByRole("button", { name: "إعدادات القراءة" });
    toggle.focus();
    const dlg = openSettings();
    fireEvent.keyDown(dlg, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "إعدادات القراءة" })).toBeNull());
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(within(openSettings()).getByRole("button", { name: "تم" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "إعدادات القراءة" })).toBeNull());
  });

  it("while the dialog is open the reader's shortcuts never fire behind it (F, page keys)", async () => {
    mount();
    await heading("صفحة غنية");
    const done = within(openSettings()).getByRole("button", { name: "تم" });
    fireEvent.keyDown(done, { key: "f" });
    fireEvent.keyDown(done, { key: "F", code: "KeyF" });
    fireEvent.keyDown(document.querySelector(".learning-reader-main")!, { key: "ArrowLeft" });
    await waitFor(() => {});
    expect(root().classList.contains("is-presentation")).toBe(false);
    expect(screen.getByRole("heading", { level: 2, name: "صفحة غنية" })).toBeTruthy();
  });
});

describe("21E L2-C — presentation mode is untouched", () => {
  it("carries no reading-setting attributes and offers no settings button; the settings come back on exit", async () => {
    localStorage.setItem(KEY, JSON.stringify({ size: 3, spacing: 2, theme: "sepia" }));
    mount();
    await heading("صفحة غنية");
    expect(attrs()).toEqual(["3", "2", "sepia"]);
    fireEvent.click(screen.getByRole("button", { name: "وضع العرض" }));
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(true));
    expect(attrs()).toEqual([null, null, null]);
    expect(screen.queryByRole("button", { name: "إعدادات القراءة" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "خروج من وضع العرض" }));
    await waitFor(() => expect(root().classList.contains("is-presentation")).toBe(false));
    expect(attrs()).toEqual(["3", "2", "sepia"]);
  });
});

describe("21E L2-C — storage robustness", () => {
  it("malformed values fall back field by field; blocked storage keeps the defaults and the controls working", async () => {
    localStorage.setItem(KEY, JSON.stringify({ size: 9, spacing: 2, theme: "dark" }));
    const a = mount();
    await heading("صفحة غنية");
    expect(attrs()).toEqual(["2", "2", "light"]);
    a.unmount();
    localStorage.setItem(KEY, "{oops");
    const b = mount();
    await heading("صفحة غنية");
    expect(attrs()).toEqual(["2", "1", "light"]);
    b.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    mount();
    await heading("صفحة غنية");
    expect(attrs()).toEqual(["2", "1", "light"]);
    fireEvent.click(within(openSettings()).getByRole("radio", { name: /^صغير/ }));
    expect(attrs()[0]).toBe("1");
  });
});

describe("21E L2-C — stylesheet contract", () => {
  const css = readFileSync(join(process.cwd(), "src/learning/reader/reader-enterprise-l2c.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (sel: string) => { const i = css.indexOf(sel + " {"); return i < 0 ? "" : css.slice(i, css.indexOf("}", i)); };
  it("maps the three sizes to 17 / 19 / 21 px body text and the spacings to 1.85 / 2.05 / 2.25", () => {
    for (const [n, px] of [["1", 17], ["2", 19], ["3", 21]] as const) {
      expect(block(`.learning-reader:not(.is-presentation)[data-read-size="${n}"]`)).toContain(`--eb-read-fs-body: ${px}px`);
    }
    for (const [n, lh] of [["1", "1.85"], ["2", "2.05"], ["3", "2.25"]] as const) {
      expect(block(`.learning-reader:not(.is-presentation)[data-read-spacing="${n}"]`)).toContain(`--eb-read-lh: ${lh}`);
    }
  });
  it("keys every reader rule on normal reading (never presentation)", () => {
    const selectors = (css.match(/[^{}]+\{/g) ?? []).map(s => s.replace("{", "").trim()).filter(s => !s.startsWith("@") && s !== ":root");
    for (const sel of selectors) {
      if (sel.startsWith(".learning-reader-settings")) continue;                         // the dialog (portalled, not the reader)
      expect(sel).toContain(".learning-reader:not(.is-presentation)");
    }
  });
});
