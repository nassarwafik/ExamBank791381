// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import NotificationBell, { type NotificationCenterProps } from "./NotificationBell";

// Phase 8E-7 — the notification panel's two text actions were the smallest controls of the student UI when measured
// on the baseline (headless Chromium, any width): «فتح الرسائل» 23 px and «إعادة المحاولة» 16 px tall. Both get a
// ≥36 px hit area (44 px on phones) WITHOUT changing their font size or the panel's layout (the header action grows
// into the header padding through negative block margins). The controls themselves stay plain, named buttons.

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Body of the first `@media (<query>)` block of a stylesheet (brace-balanced). */
function mediaBlock(src: string, query: string): string {
  const start = src.indexOf("@media " + query);
  if (start < 0) return "";
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return "";
}
const css = readFileSync(path.join(process.cwd(), "src", "notifications", "notifications.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (selector: string, body = css) => { const m = body.match(new RegExp("(?:^|[\\s,}])" + selector.replace(/[.-]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "m")); return m ? m[1] : ""; };
const px = (decl: string, prop: string) => { const m = decl.match(new RegExp(prop + ":\\s*(\\d+)px")); return m ? Number(m[1]) : NaN; };

function mount(over: Partial<NotificationCenterProps> = {}) {
  const props: NotificationCenterProps = { items: [], counts: null, loading: false, error: "", onOpenChange: vi.fn(), onSelect: vi.fn(), onOpenMessages: vi.fn(), onRetry: vi.fn(), ...over };
  render(<NotificationBell {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /الإشعارات/ }));
  return props;
}

describe("Phase 8E-7 — notification panel action targets", () => {
  it("notifications.css: «فتح الرسائل» and «إعادة المحاولة» have a ≥36px minimum height, 44px on phones, same font sizes", () => {
    const head = rule(".eb-notif-head-action"), retry = rule(".eb-notif-retry");
    expect(px(head, "min-height")).toBeGreaterThanOrEqual(36);
    expect(px(retry, "min-height")).toBeGreaterThanOrEqual(36);
    // Visible text size unchanged (the hit area grows, not the type).
    expect(head).toMatch(/font-size:\s*var\(--eb-fs-13\)/);
    expect(retry).toMatch(/font-size:\s*var\(--eb-fs-12\)/);
    // The header action keeps the header's height: its extra block size is absorbed by negative block margins.
    expect(head).toMatch(/margin-block:\s*calc\(-1 \* var\(--eb-space-2\)\)/);
    const phone = mediaBlock(css, "(max-width: 767px)");
    expect(phone).not.toBe("");
    const phoneRule = phone.match(/\.eb-notif-head-action\s*,\s*\.eb-notif-retry\s*\{([^}]*)\}/);
    expect(phoneRule, "phone rule for the two panel actions").toBeTruthy();
    expect(px(phoneRule![1], "min-height")).toBe(44);
  });

  it("both actions are real, named buttons that work from the keyboard-reachable panel and do not touch the bell's semantics", () => {
    const props = mount({ error: "تعذّر تحميل الإشعارات.", items: null });
    const head = screen.getByRole("button", { name: "فتح الرسائل" });
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    for (const b of [head, retry]) { expect(b.tagName).toBe("BUTTON"); expect(b.getAttribute("type")).toBe("button"); expect(b.hasAttribute("title")).toBe(false); }
    expect(head.className).toBe("eb-notif-head-action");
    expect(retry.className).toBe("eb-notif-retry");
    fireEvent.click(retry);
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /الإشعارات/ }).getAttribute("aria-expanded")).toBe("true"); // retry keeps the panel open
    fireEvent.click(head);
    expect(props.onOpenMessages).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /الإشعارات/ }).getAttribute("aria-expanded")).toBe("false"); // «فتح الرسائل» closes it
  });

  it("the retry action is hidden while a refresh is in flight (no clickable control in a loading state)", () => {
    mount({ error: "تعذّر تحميل الإشعارات.", items: [], loading: true });
    expect(screen.queryByRole("button", { name: "إعادة المحاولة" })).toBeNull();
    expect(screen.getByRole("button", { name: "فتح الرسائل" })).toBeTruthy();
  });
});
