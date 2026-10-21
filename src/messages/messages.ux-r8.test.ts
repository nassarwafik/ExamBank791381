// UX-R8 — the messages pages in the reference look (docs/enterprise-ux-r0-redesign-foundation.md R8). Presentation only: markup,
// roles, labels and behaviour are pinned by the 5C / 5D / 5E / M.2–M.5 / 8B suites; these guards pin the R8 block at the end of
// messages.css — it must come last (it wins by order), stay free of stacking-context properties, transitions, colour literals and
// physical sides, and leave the rules it overrides (the M.2 own-bubble rule is pinned verbatim) in place.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const all = readFileSync(path.join(process.cwd(), "src", "messages", "messages.css"), "utf8");
const at = all.indexOf("/* ===", all.indexOf("M.5 — message actions"));
const block = all.slice(at).replace(/\/\*[\s\S]*?\*\//g, "");
/** The declarations of the rule whose selector list is exactly `sel` (at a line start) inside the R8 block. */
const rule = (sel: string) => {
  const i = block.indexOf("\n" + sel + "{");
  expect(i, "rule " + sel).toBeGreaterThan(-1);
  return block.slice(i + sel.length + 2, block.indexOf("}", i));
};

describe("UX-R8 — the block itself", () => {
  it("is the R8 block, the last thing in the sheet (after M.5), so it wins by order", () => {
    expect(all.slice(at, at + 200)).toContain("UX-R8");
    expect(at).toBeGreaterThan(all.lastIndexOf(".eb-msg-body.is-deleted"));
    expect(all.indexOf("UX-R8")).toBe(all.lastIndexOf("UX-R8"));
  });

  it("adds no stacking context, no transition, no colour literal, no physical side", () => {
    expect(block).not.toMatch(/\b(isolation|z-index|transform|filter|contain|will-change|transition|animation|position)\s*:/);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(block).not.toMatch(/(margin|padding|border)-(left|right)|\b(left|right)\s*:/);
  });

  it("overrides instead of editing: the M.2 own-bubble rule above stays verbatim", () => {
    expect(all.slice(0, at)).toContain(".eb-msg.is-mine .eb-msg-bubble{ background:linear-gradient(160deg, var(--eb-primary), var(--eb-primary-strong)); border-color:transparent; color:var(--eb-surface); }");
  });
});

describe("UX-R8 — cards and roster", () => {
  it("the teacher workspace and the student card are flat 8 px panels (also the phone conversation card), threads on white", () => {
    expect(rule(".eb-msg-workspace")).toBe(" border-radius:var(--eb-r); box-shadow:none; ");
    expect(rule(".eb-msg-workspace.is-conversation,.eb-msg-workspace.is-announcements")).toBe(" border-radius:var(--eb-r); ");
    expect(rule(".eb-msg-student-card")).toBe(" border-radius:var(--eb-r); box-shadow:none; ");
    expect(rule(".eb-msg-workspace .eb-msg-convo-body,.eb-msg-student-thread")).toBe(" background:var(--eb-surface); ");
  });

  it("the roster is 44 px hairline rows (52 px on a narrow screen) with a 28 px avatar", () => {
    expect(rule(".eb-msg-roster-item")).toContain("min-height:44px;");
    expect(rule(".eb-msg-roster-item .eb-msg-avatar")).toContain("inline-size:28px; block-size:28px;");
    const narrow = block.slice(block.indexOf("@media (max-width: 899.98px){"));
    expect(narrow).toContain(".eb-msg-roster-item{ min-height:52px; }");
  });

  it("the selected student is a grey row with bold text and no accent bar (aria-pressed carries the state)", () => {
    expect(rule('.eb-msg-roster-item[aria-pressed="true"]')).toBe(" background:var(--eb-chrome-active); ");
    expect(rule('.eb-msg-roster-item[aria-pressed="true"] .eb-msg-roster-name')).toBe(" font-weight:var(--eb-fw-bold); ");
    expect(rule('.eb-msg-roster-item[aria-pressed="true"]::before')).toBe(" content:none; ");
  });

  it("the roster filters read as sub-navigation: quiet items, the pressed one a grey pill with bold text (no navy fill)", () => {
    expect(rule(".eb-msg-chip")).toContain("border-color:transparent; border-radius:var(--eb-r-sm); background:transparent;");
    expect(rule('.eb-msg-chip[aria-pressed="true"]')).toBe(" background:var(--eb-chrome-active); border-color:transparent; color:var(--eb-text-heading); font-weight:var(--eb-fw-bold); ");
  });
});

describe("UX-R8 — bubbles and composer", () => {
  it("bubbles are quiet: 8 px on a hairline without a shadow; the viewer's own a soft primary tint with ink text", () => {
    expect(rule(".eb-msg-bubble")).toBe(" border-color:var(--eb-line); border-radius:var(--eb-r); box-shadow:none; ");
    expect(rule(".eb-msg.is-mine .eb-msg-bubble")).toBe(" background:var(--eb-primary-050); border-color:var(--eb-primary-100); color:var(--eb-text); ");
  });

  it("the own bubble's label, time, edited mark and actions are re-inked for the light tint (no white-on-tint text)", () => {
    expect(rule(".eb-msg.is-mine .eb-msg-sender")).toBe(" color:var(--eb-text-heading); ");
    expect(rule(".eb-msg.is-mine .eb-msg-time,.eb-msg.is-mine .eb-msg-edited")).toBe(" color:var(--eb-muted); ");
    expect(rule(".eb-msg.is-mine .eb-msg-action")).toBe(" color:var(--eb-text-secondary); ");
    expect(rule(".eb-msg.is-mine .eb-msg-action:hover")).toBe(" background:var(--eb-surface); color:var(--eb-text-heading); ");
    expect(rule(".eb-msg.is-mine .eb-msg-action:focus-visible")).toBe(" outline-color:var(--eb-primary); ");
  });

  it("one composer look for the teacher and the student: a plain 8 px field on white and an 8 px send button", () => {
    expect(rule(".eb-msg-workspace .eb-msg-input,.eb-msg-student-foot .eb-msg-input")).toBe(" border-color:var(--eb-line-2); border-radius:var(--eb-r-sm); background:var(--eb-surface); ");
    expect(rule(".eb-msg-workspace .eb-msg-composer-row .eb-button,.eb-msg-student-foot .eb-msg-composer-row .eb-button")).toBe(" border-radius:var(--eb-r-sm); ");
  });
});
