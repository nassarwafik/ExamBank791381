// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, cleanup, screen } from "@testing-library/react";
import CodingEditor from "./CodingEditor";
import { setEditorEngineLoader } from "./editor/editorEngine";
import { DEFAULT_EDITOR_PREFERENCES } from "./workspace/editorPreferences";

// Phase 18B Review Fix 1 (RF1-1) — COMPUTED-STYLE regression for the editable editor's font-size preference at phone width.
// The real stylesheet (src/coding/coding.css) is attached to the document and the viewport is set to 375 px, so happy-dom
// evaluates the `@media (max-width: 600px)` block and the `--cx-font-size` custom property exactly as a browser cascades them.
// Fail-first on head 2680410: the mobile block's blanket `font-size: 13px` on `.cx-code-input` / `.cx-code-gutter` beat the
// preference variable, so a selected 18 px computed to 13 px on a phone. Anyone reintroducing a direct mobile `font-size` on the
// editable input (instead of on the static review view) makes this test fail again. The teacher review view keeps 13 px on phones.

const css = fs.readFileSync(path.resolve(__dirname, "coding.css"), "utf8");
const viewport = (width: number) => (window as unknown as { happyDOM: { setViewport(v: { width: number; height: number }): void } }).happyDOM.setViewport({ width, height: 720 });
let style: HTMLStyleElement;
beforeEach(() => { setEditorEngineLoader(null); style = document.createElement("style"); style.textContent = css; document.head.appendChild(style); });
afterEach(() => { cleanup(); style.remove(); setEditorEngineLoader(undefined); viewport(1100); });
const input = () => screen.getByRole("textbox", { name: "محرر الكود" }) as HTMLTextAreaElement;
const fontSize = (el: Element) => getComputedStyle(el).fontSize;

describe("18B RF1-1 — the selected editor font size is authoritative at phone width (computed style)", () => {
  it("375 px viewport: a selected 18 px computes to 18 px on the native textarea AND its gutter (the mobile block must not override it)", () => {
    viewport(375);
    expect(window.matchMedia("(max-width: 600px)").matches).toBe(true);
    render(<CodingEditor value={"a\nb"} onChange={() => {}} language="python" label="محرر الكود" preferences={{ ...DEFAULT_EDITOR_PREFERENCES, fontSize: 18 }} />);
    expect(fontSize(input())).toBe("18px");
    expect(fontSize(screen.getByTestId("code-gutter"))).toBe("18px");
    expect(input().value).toBe("a\nb");
  });
  it("375 px viewport: every selectable size (12 → 20) computes to itself; the default is the preference default (14 px)", () => {
    viewport(375);
    for (const size of [12, 13, 14, 16, 20]) {
      cleanup();
      render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" preferences={{ ...DEFAULT_EDITOR_PREFERENCES, fontSize: size }} />);
      expect(fontSize(input()), String(size)).toBe(size + "px");
    }
    cleanup();
    render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" />);
    expect(fontSize(input())).toBe("14px");
  });
  it("1100 px viewport: the same preference computes identically (one rule, no desktop / mobile divergence)", () => {
    viewport(1100);
    expect(window.matchMedia("(max-width: 600px)").matches).toBe(false);
    render(<CodingEditor value="x" onChange={() => {}} language="python" label="محرر الكود" preferences={{ ...DEFAULT_EDITOR_PREFERENCES, fontSize: 20 }} />);
    expect(fontSize(input())).toBe("20px");
  });
  it("the static teacher review view (not editable, no preference) keeps its compact 13 px on phones", () => {
    viewport(375);
    document.body.innerHTML = '<div class="cx-code-view-body"><pre class="cx-code-view-gutter">1</pre><pre class="cx-code-view">x</pre></div>';
    expect(fontSize(document.querySelector(".cx-code-view")!)).toBe("13px");
    expect(fontSize(document.querySelector(".cx-code-view-gutter")!)).toBe("13px");
    document.body.innerHTML = "";
  });
  it("source guard: no `font-size` declaration targets the editable input or gutter inside a media block (only the variable rule may size them)", () => {
    const blocks = [...css.matchAll(/@media[^{]*\{([\s\S]*?)\n\}/g)].map(m => m[1]);
    for (const block of blocks) {
      for (const rule of block.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const selectors = rule[1], body = rule[2];
        if (/\.cx-code-(input|gutter)\b/.test(selectors)) expect(body, selectors.trim()).not.toMatch(/font-size\s*:/);
      }
    }
  });
});
