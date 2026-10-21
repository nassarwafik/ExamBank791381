// UX-R12 — the grading workspace (AssignmentReview) in the reference look (docs/enterprise-ux-r0-redesign-foundation.md R12).
// Presentation only: every grade, key, status, «reviewRequired» route and save path is pinned by the UX-003 / R14 / 21E.3 / 21G.5
// review suites, and the sheets by the 21G.7 touch-target and UX-8 dvh guards. These guards pin the UX-R12 block at the end of
// review-workspace.css (scoped, token-only, status tones untouched), the exact-value literal conversions in review-pro.css, and
// the phone fix: the header wraps, so the exam title is no longer squeezed beside the student navigation.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (f: string) => readFileSync(path.join(process.cwd(), "src", f), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const wsSrc = read("review-workspace.css"), proSrc = read("review-pro.css");
const block = strip(wsSrc.slice(wsSrc.lastIndexOf("/*", wsSrc.indexOf("UX-R12"))));
/** The declarations of the rule whose selector list is exactly `sel` (at a line start, optionally indented) inside the block. */
const rule = (sel: string) => {
  const m = block.match(new RegExp("\\n\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{"));
  expect(m, "rule " + sel).not.toBeNull();
  const i = block.indexOf(m![0]) + m![0].length;
  return block.slice(i, block.indexOf("}", i)).trim();
};

describe("UX-R12 — the fix: on a phone the header wraps and the exam title keeps the row", () => {
  it("the header wraps below 768 px; the title block takes the remaining width beside «إغلاق», the student navigation moves below", () => {
    const phone = block.slice(block.indexOf("@media (max-width:767px)"));
    expect(phone).toContain(".rv-workspace .review-top{ flex-wrap:wrap; }");
    expect(phone).toContain(".rv-workspace .review-top > div:first-child{ flex:1 1 0; min-width:0; }");
    expect(phone).toContain(".rv-workspace .review-top > .rv-student-nav{ order:2; }");
  });
});

describe("UX-R12 — the block itself", () => {
  it("is the last thing in review-workspace.css and appears once; the 21G.7 coarse block stays before it", () => {
    expect(wsSrc.indexOf("UX-R12")).toBe(wsSrc.lastIndexOf("UX-R12"));
    expect(wsSrc.indexOf("UX-R12")).toBeGreaterThan(wsSrc.lastIndexOf("@media (pointer: coarse)"));
    expect(block).not.toContain("pointer: coarse");
  });

  it("adds no stacking context, no transition, no colour literal, no physical side", () => {
    expect(block).not.toMatch(/\b(isolation|z-index|transform|filter|contain|will-change|transition|animation|position)\s*:/);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(block).not.toMatch(/(margin|padding|border)-(left|right)|\b(left|right)\s*:/);
  });

  it("scopes every rule to the workspace and never restyles a status tone (pending, correct, wrong, partial, technical hold)", () => {
    const sels = (block.match(/^[^{}@\n][^{}\n]*(?=\{)/gm) || []).flatMap(s => s.split(",")).map(s => s.trim()).filter(Boolean);
    expect(sels.length).toBeGreaterThan(12);
    for (const s of sels) expect(s).toMatch(/^\.review-modal\.rv-workspace$|^\.rv-workspace /);
    expect(block).not.toMatch(/is-pending\s*[,{]|is-correct|is-incorrect|is-partial|is-unanswered|rv-status|rv-mode|rv-technical|rv-choice|needs-review/);
    expect(rule(".rv-workspace .rv-filter.is-active:not(.is-pending)")).toBe("background:var(--eb-chrome-active); color:var(--eb-text-heading); border-color:transparent;");
  });
});

describe("UX-R12 — the workspace", () => {
  it("the attempt summary is ONE hairline strip whose cells draw their own hairlines", () => {
    expect(rule(".rv-workspace .review-summary")).toBe("gap:0; margin:16px 22px; padding:0; background:var(--eb-surface); border:1px solid var(--eb-line); border-radius:var(--eb-r); overflow:hidden;");
    expect(rule(".rv-workspace .review-summary > div")).toBe("border:0; border-radius:0; background:transparent; box-shadow:1px 0 0 0 var(--eb-line), 0 1px 0 0 var(--eb-line);");
  });

  it("the selected attempt is a grey pill (no white raised tab), the navigator a white 8 px panel", () => {
    expect(rule(".rv-workspace .review-attempt-tabs button.active")).toBe("background:var(--eb-chrome-active); color:var(--eb-text-heading); box-shadow:none;");
    expect(rule(".rv-workspace .rv-nav")).toBe("border-radius:var(--eb-r); background:var(--eb-surface);");
  });

  it("question cards are flat 8 px cards; the current one keeps its 2 px primary ring; the decorative bar is gone", () => {
    expect(rule(".rv-workspace .review-question")).toBe("border-radius:var(--eb-r); box-shadow:none;");
    expect(rule(".rv-workspace .review-question.rv-q.is-current")).toBe("box-shadow:0 0 0 2px var(--eb-primary);");
    expect(rule(".rv-workspace .review-qhead > div:first-child::before")).toBe("content:none;");
    expect(rule(".rv-workspace .review-answer-grid > div, .rv-workspace .review-grade-row")).toBe("border-radius:var(--eb-r);");
  });

  it("the internal «Manual Review · Phase 2.0D» eyebrow is not shown; the save button has no glow", () => {
    expect(rule(".rv-workspace .review-top .platform-eyebrow")).toBe("display:none;");
    expect(rule(".rv-workspace .review-footer .platform-primary")).toBe("box-shadow:none;");
  });
});

describe("UX-R12 — review-pro.css: exact-value literals become tokens", () => {
  it("white, the success, warn and danger text colours and the danger tint name their tokens (no colour change)", () => {
    const pro = strip(proSrc);
    expect(pro).not.toMatch(/#fff(?![0-9a-fA-F])|#15803d|#b45309|#b42318|#fef2f2/i);
    expect(pro).toContain(".review-col.correct .lbl{color:var(--eb-success-tx)}");
    expect(pro).toContain(".review-quick button.zero{border-color:#f0b4b4;background:var(--eb-danger-bg);color:var(--eb-danger-tx)}");
    expect(pro).toContain(".review-modal{ max-height:calc(100vh - 48px); max-height:calc(100dvh - 48px);");
  });
});
