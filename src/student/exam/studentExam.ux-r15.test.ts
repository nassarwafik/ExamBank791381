// UX-R15 — the student exam in the reference look (docs/enterprise-ux-r0-redesign-foundation.md R15). Presentation only:
// answers, autosave, timers, attempt policy, paging and grading are pinned by the UX-7b-1 / 7b-2 / 21E.3 / reliability / 7A
// suites, and the sheet's targets and scroll clearance by the rf1 / exam21e3 unit guards. These guards pin the UX-R15 block at
// the end of studentexam-pro.css (scoped, token-only, every status tone and every theme or preset untouched) and the fix: the
// assessment-activity status line read two undefined tokens, so it inherited the body text colour and size.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const src = readFileSync(path.join(process.cwd(), "src", "studentexam-pro.css"), "utf8");
const block = strip(src.slice(src.lastIndexOf("/*", src.indexOf("UX-R15"))));
/** The declarations of the rule whose selector list is exactly `sel` (at a line start, optionally indented) inside the block. */
const rule = (sel: string) => {
  const m = block.match(new RegExp("\\n\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{"));
  expect(m, "rule " + sel).not.toBeNull();
  const i = block.indexOf(m![0]) + m![0].length;
  return block.slice(i, block.indexOf("}", i)).trim();
};
const DEF = ".interactive-exam-page.exam-theme-default";

describe("UX-R15 — the fix: the activity status line reads defined tokens", () => {
  it("the status and fallback lines are muted 13 px text (no --eb-text-muted / --eb-fs-sm left in the sheet)", () => {
    expect(strip(src)).toContain(".iex-activity-status,.iex-activity-fallback{ margin:0; color:var(--eb-muted); font-size:var(--eb-fs-13); }");
    expect(src).not.toMatch(/--eb-text-muted|--eb-fs-sm\b/);
  });
});

describe("UX-R15 — the block itself", () => {
  it("is the last thing in the sheet and appears once; the 21E.3 coarse block stays before it", () => {
    expect(src.indexOf("UX-R15")).toBe(src.lastIndexOf("UX-R15"));
    expect(src.indexOf("UX-R15")).toBeGreaterThan(src.lastIndexOf("@media (pointer: coarse)"));
    expect(block).not.toContain("pointer: coarse");
  });

  it("adds no stacking context, no transition, no colour literal, no physical side", () => {
    expect(block).not.toMatch(/\b(isolation|z-index|transform|filter|contain|will-change|transition|animation|position)\s*:/);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(block).not.toMatch(/(margin|padding|border)-(left|right)|\b(left|right)\s*:/);
  });

  it("scopes every rule to the exam page, and the question card and sticky bars to the legacy default theme only", () => {
    // every selector list, multi-line ones included (the media query's own prelude removed)
    const sels = block.replace(/@media[^{]*\{/g, "").split("}").map(r => r.split("{")[0]).flatMap(s => s.split(",")).map(s => s.trim()).filter(Boolean);
    expect(sels.length).toBe(17);
    for (const s of sels) expect(s).toMatch(/^\.interactive-exam-page(\.exam-theme-default)? /);
    for (const s of sels.filter(s => /\.iex-(card|topbar|bottom-nav|foot)\b/.test(s))) expect(s.startsWith(DEF + " ")).toBe(true);
    // the other legacy themes and the presentation presets (R16d) keep their own look
    expect(block).not.toMatch(/exam-theme-(cards|classic|compact|modern)|exam-presentation|data-xp-/);
  });

  it("never restyles a status tone, a selection or the final submit", () => {
    expect(block).not.toMatch(/iex-save|is-answered|is-unanswered|is-unavailable\s*[,{]|is-current|\.warn|\.danger|iex-strict|iex-q-recovery|\.done|\.selected|iex-submit|iex-countdown|is-first/);
  });
});

describe("UX-R15 — the exam", () => {
  it("the frame panels (position and save row, details, review, start gate, result) are flat 8 px panels", () => {
    expect(rule(".interactive-exam-page .iex-progress, .interactive-exam-page .iex-details, .interactive-exam-page .iex-review,\n.interactive-exam-page .iex-start-card, .interactive-exam-page .iex-result-card")).toBe("border-radius:var(--eb-r); box-shadow:none;");
    expect(rule(".interactive-exam-page .iex-details-toggle")).toBe("border-radius:var(--eb-r);");
  });

  it("the review counts are ONE hairline strip; the warn and unavailable cells keep their tint", () => {
    expect(rule(".interactive-exam-page .iex-review-stats")).toBe("gap:0; border:1px solid var(--eb-line); border-radius:var(--eb-r); overflow:hidden;");
    expect(rule(".interactive-exam-page .iex-review-stats > div")).toBe("border-radius:0; box-shadow:1px 0 0 0 var(--eb-line), 0 1px 0 0 var(--eb-line);");
    expect(rule(".interactive-exam-page .iex-review-stats > div:not(.is-warn):not(.is-unavailable)")).toBe("background:transparent;");
  });

  it("the section context drops its 4 px decorative edge (the first question keeps its tint)", () => {
    expect(rule(".interactive-exam-page .iex-section-context")).toBe("border-inline-start:1px solid var(--eb-line);");
  });

  it("on the default theme the question card is a flat 8 px card and the sticky bars sit on their hairline (8 px from 768 px)", () => {
    expect(rule(DEF + " .iex-card")).toBe("border-radius:var(--eb-r); box-shadow:none;");
    const bars = DEF + " .iex-topbar, " + DEF + " .iex-bottom-nav,\n" + DEF + " .iex-foot";
    expect(rule(bars)).toBe("box-shadow:none;");
    const tablet = block.slice(block.indexOf("@media (min-width: 768px)"));
    expect(tablet).toContain(bars.replace("\n", "\n  ") + "{ border-radius:var(--eb-r); }");
  });
});
