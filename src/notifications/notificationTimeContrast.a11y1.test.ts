// A11Y-1 — the axe-core WCAG 2.1 AA scan of the student exam journey (scripts/check-student-exam-browser-21e3.mjs with AXE_PATH)
// found one violation: the time of a notification («منذ ٣ أيام») was drawn in --eb-faint (#a9a5b4) on the unread tint
// --eb-primary-050 (#f3effa), a contrast of 2.12 for 12 px text (AA needs 4.5). --eb-faint is a decorative token; text that a
// student must read uses --eb-muted. This pins the rule and checks the ratio on both item backgrounds, light and dark.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (f: string) => readFileSync(path.join(process.cwd(), "src", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// The light value of a token in design-tokens.css, and its dark value from the light-dark() pair in design-tokens-dark.css.
function token(name: string): { light: string; dark: string } {
  const light = new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})").exec(read("design-tokens.css"));
  const dark = new RegExp("--" + name + ":\\s*light-dark\\(\\s*#[0-9a-fA-F]{6}\\s*,\\s*(#[0-9a-fA-F]{6})\\s*\\)").exec(read("design-tokens-dark.css"));
  expect(light, name + " light").toBeTruthy();
  expect(dark, name + " dark").toBeTruthy();
  return { light: light![1], dark: dark![1] };
}

describe("A11Y-1 — a notification's time is readable text", () => {
  const rule = /\.eb-notif-time\s*\{([^}]*)\}/.exec(read("notifications/notifications.css"));

  it("uses the text token --eb-muted, not the decorative --eb-faint", () => {
    expect(rule).toBeTruthy();
    const color = /(?:^|;)\s*color\s*:\s*([^;]+)/.exec(rule![1])?.[1].trim();
    expect(color).toBe("var(--eb-muted)");
  });

  it("reaches 4.5:1 on a read item (surface) and an unread item (primary-050), in light and dark", () => {
    const fg = token("eb-muted");
    for (const bg of [token("eb-surface"), token("eb-primary-050")]) {
      expect(contrast(fg.light, bg.light)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg.dark, bg.dark)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
