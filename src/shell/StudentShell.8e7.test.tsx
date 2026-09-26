// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import StudentShell from "./StudentShell";

// Phase 8E-7 — Final UX hardening of the student top bar. Measured on the baseline in headless Chromium (360×740):
// the «الإشعارات» / «الرسائل» / «الألعاب التعليمية» entries were 30–32 px tall and «تسجيل الخروج» 39 px — below the
// 44 px phone touch target the shared primitives already honour (UX-8a, ui.css ≤767 px). The fix is CSS-only
// (min-height on phones; desktop density unchanged), so the contract is asserted on the stylesheet + the real markup.

afterEach(cleanup);

const read = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");

/** Returns the body of the first `@media (<query>)` block of a stylesheet (brace-balanced, comments stripped). */
function mediaBlock(css: string, query: string): string {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
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

describe("Phase 8E-7 — student top bar touch targets", () => {
  it("platform.css gives the top-bar entries and logout a 44px minimum on phones (≤767px), and nothing on wider screens", () => {
    const css = read("platform.css");
    const phone = mediaBlock(css, "(max-width: 767px)");
    expect(phone).not.toBe("");
    // One rule covers every top-bar control: the bell / messages / games entries (.student-topbar-link) + logout.
    const rule = phone.match(/\.student-topbar-link\s*,\s*\.student-logout\s*\{([^}]*)\}/);
    expect(rule, "phone rule for .student-topbar-link + .student-logout").toBeTruthy();
    expect(rule![1]).toMatch(/min-height:\s*44px/);
    // Desktop density is untouched: no unconditional min-height on either selector (outside the media block).
    const outside = css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "");
    expect(outside).not.toMatch(/\.student-topbar-link[^{]*\{[^}]*min-height/);
    expect(outside.match(/\.student-logout\s*\{([^}]*)\}/)![1]).not.toMatch(/min-height/);
  });

  it("the entries stay real buttons with text accessible names (no title-only or icon-only control in the bar)", () => {
    const onOpenMessages = vi.fn(), onOpenGames = vi.fn(), onLogout = vi.fn();
    render(
      <StudentShell studentName="أحمد" onLogout={onLogout} onOpenGames={onOpenGames} onOpenMessages={onOpenMessages} messagesUnread={{ total: 2, capped: false }}>
        <p>محتوى</p>
      </StudentShell>
    );
    const messages = screen.getByRole("button", { name: /^الرسائل/ });
    const games = screen.getByRole("button", { name: "الألعاب التعليمية" });
    const logout = screen.getByRole("button", { name: "تسجيل الخروج" });
    for (const b of [messages, games, logout]) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("type")).toBe("button");
      expect(b.hasAttribute("aria-disabled")).toBe(false);
    }
    expect(messages.className).toContain("student-topbar-link");
    expect(games.className).toContain("student-topbar-link");
    expect(logout.className).toContain("student-logout");
    // The unread badge is part of the name (count + hidden unit), never a separate control.
    expect(messages.textContent).toContain("2");
    fireEvent.click(messages); fireEvent.click(games); fireEvent.click(logout);
    expect(onOpenMessages).toHaveBeenCalledTimes(1);
    expect(onOpenGames).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
