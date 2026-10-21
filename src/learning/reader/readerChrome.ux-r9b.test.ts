// UX-R9b — the reader chrome and the training runner in the reference look (docs/enterprise-ux-r0-redesign-foundation.md R9b).
// Presentation only, chrome only: markup, roles and behaviour are pinned by the L.1–L.8 / 12A / 21E reader suites and reader.css
// by its layout / presentation / readability guards (no block can be appended to it: its 1024 px block must stay last). These
// guards pin the UX-R9b block at the end of reader-enterprise-l1.css and training.css: last in its sheet, free of stacking
// contexts, transitions, colour literals and physical sides, normal reading only, and dark-theme safe.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", "learning", ...p), "utf8");
const block = (src: string) => {
  const at = src.indexOf("UX-R9b");
  expect(at, "UX-R9b block").toBeGreaterThan(-1);
  return { at: src.lastIndexOf("/*", at), body: src.slice(src.lastIndexOf("/*", at)).replace(/\/\*[\s\S]*?\*\//g, "") };
};
const l1Src = read("reader", "reader-enterprise-l1.css"), trainingSrc = read("training", "training.css");
const l1 = block(l1Src), training = block(trainingSrc);
/** The declarations of the rule whose selector list is exactly `sel` (at a line start) inside a block. */
const rule = (b: { body: string }, sel: string) => {
  const i = b.body.indexOf("\n" + sel + " {") > -1 ? b.body.indexOf("\n" + sel + " {") : b.body.indexOf("\n" + sel + "{");
  expect(i, "rule " + sel).toBeGreaterThan(-1);
  return b.body.slice(b.body.indexOf("{", i) + 1, b.body.indexOf("}", i)).replace(/\s+/g, " ").trim();
};

describe("UX-R9b — the blocks themselves", () => {
  it("each is the last thing in its sheet and appears once; reader.css (its desktop block must stay last) is untouched", () => {
    for (const src of [l1Src, trainingSrc]) expect(src.indexOf("UX-R9b")).toBe(src.lastIndexOf("UX-R9b"));
    expect(l1.at).toBeGreaterThan(l1Src.lastIndexOf("@media (forced-colors: active) {\n  .learning-reader:not(.is-presentation) .learning-reader-topbar"));
    expect(read("reader", "reader.css")).not.toContain("UX-R9b");
    expect(read("search", "learning-search.css")).not.toContain("UX-R9b");
  });

  it("add no stacking context, no transition, no colour literal, no physical side, no !important", () => {
    for (const { body } of [l1, training]) {
      expect(body).not.toMatch(/\b(isolation|z-index|transform|filter|contain|will-change|transition|animation|position)\s*:/);
      expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      expect(body).not.toMatch(/(margin|padding|border)-(left|right)|\b(left|right)\s*:/);
      expect(body).not.toContain("!important");
    }
  });

  it("restyles normal reading only, and only the reader's own chrome (no focus-mode or shell selector, no content class)", () => {
    const sels = (l1.body.match(/^[^{}@\n][^{}\n]*(?=\{)/gm) || []).flatMap(s => s.split(",")).map(s => s.trim()).filter(Boolean);
    expect(sels.length).toBeGreaterThan(10);
    for (const s of sels) {
      expect(s).toMatch(/^\.learning-reader(:not\(\.is-presentation\)|\[data-read-theme="dark"\]:not\(\.is-presentation\))|^\.learning-reader-settings-option/);
      expect(s).not.toMatch(/data-eb-reading-focus|\.eb-shell|-blocks|-text|-callout|-example|-figure|-list|-table|-code|learning-activity|eb-visual/);
    }
  });
});

describe("UX-R9b — the reader chrome", () => {
  it("the top bar, index, page, page bar and unit contents are flat 8 px panels without a resting shadow", () => {
    expect(rule(l1, ".learning-reader:not(.is-presentation) .learning-reader-topbar")).toBe("border-color: var(--eb-line); border-radius: var(--eb-r); box-shadow: none;");
    for (const part of ["sidebar", "page", "nav", "unit-contents"]) {
      expect(rule(l1, ".learning-reader:not(.is-presentation) .learning-reader-" + part)).toBe("border-radius: var(--eb-r); box-shadow: none;");
    }
    expect(rule(l1, ".learning-reader:not(.is-presentation) .learning-reader-training")).toBe("border-radius: var(--eb-r);");
  });

  it("a pressed tool and the docked index toggle are a grey pill with heading-coloured text (no primary tint)", () => {
    expect(rule(l1, '.learning-reader:not(.is-presentation) .learning-reader-topbar .eb-button[aria-pressed="true"],\n.learning-reader:not(.is-presentation)[data-toc="docked"] .learning-reader-toc-toggle'))
      .toBe("color: var(--eb-text-heading); background: var(--learning-reader-pressed);");
  });

  it("the current index page is the same grey pill, bold, with a heading-coloured guide", () => {
    expect(rule(l1, ".learning-reader:not(.is-presentation) .learning-reader-toc-page.is-active"))
      .toBe("color: var(--eb-text-heading); background: var(--learning-reader-pressed); border-inline-start-color: var(--eb-text-heading); font-weight: var(--eb-fw-bold);");
  });

  it("dark-theme safe: the pill colour is a reader token the «داكن» theme re-maps; hovers use the re-mapped surface", () => {
    expect(rule(l1, ".learning-reader:not(.is-presentation)")).toBe("--learning-reader-pressed: var(--eb-chrome-active);");
    expect(rule(l1, '.learning-reader[data-read-theme="dark"]:not(.is-presentation)')).toBe("--learning-reader-pressed: var(--eb-read-dark-surface-2);");
    expect(rule(l1, ".learning-reader:not(.is-presentation) .learning-reader-unit-lesson:hover")).toBe("background: var(--eb-surface-2); border-color: var(--eb-line-2);");
    expect(l1.body).not.toContain("--eb-chrome-hover");
  });

  it("a chosen reading setting is a grey pill with bold text; forced colors keep a 2 px Highlight border", () => {
    expect(rule(l1, ".learning-reader-settings-option:has(input:checked)")).toBe("border-color: var(--eb-line-2); background: var(--eb-chrome-active); color: var(--eb-text-heading); font-weight: var(--eb-fw-bold);");
    expect(l1.body.slice(l1.body.indexOf("@media (forced-colors: active)"))).toContain(".learning-reader-settings-option:has(input:checked) { border-width: 2px; border-color: Highlight; }");
  });
});

describe("UX-R9b — the training runner", () => {
  it("its panels are flat 8 px and the sticky submit bar has no shadow", () => {
    expect(rule(training, ".learning-training-state, .learning-training-head, .learning-training-result")).toBe("border-radius:var(--eb-r);");
    expect(rule(training, ".learning-training-submitbar")).toBe("border-radius:var(--eb-r); box-shadow:none;");
  });
});
