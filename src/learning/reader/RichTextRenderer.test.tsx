// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import RichTextRenderer from "./RichTextRenderer";
import type { RichText } from "../content/types";

afterEach(cleanup);

const draw = (spans: RichText) => render(<p data-testid="p"><RichTextRenderer spans={spans} /></p>).container.querySelector("[data-testid=p]")!;

describe("Phase 3 — RichTextRenderer", () => {
  it("renders styled spans as real elements (strong/em/code/term) with inline dir", () => {
    const p = draw([
      { text: "عادي " },
      { text: "قوي", style: "strong" },
      { text: " مائل", style: "em" },
      { text: "VLAN", style: "code", dir: "ltr" },
      { text: "مصطلح", style: "term" },
    ]);
    expect(p.querySelector("strong")?.textContent).toBe("قوي");
    expect(p.querySelector("em")?.textContent).toBe(" مائل");
    expect(p.querySelector("code")?.textContent).toBe("VLAN");
    expect(p.querySelector("code")?.getAttribute("dir")).toBe("ltr");
    expect(p.querySelector(".learning-reader-term")?.textContent).toBe("مصطلح");
  });

  it("carries an explicit dir on a plain directional span", () => {
    const p = draw([{ text: "192.168.1.1", dir: "ltr" }]);
    expect(p.querySelector("span[dir=ltr]")?.textContent).toBe("192.168.1.1");
  });

  it("treats text as literal text — never raw HTML (no dangerouslySetInnerHTML)", () => {
    const p = draw([{ text: "<b>خطر</b> & <script>x</script>" }]);
    expect(p.querySelector("b")).toBeNull();
    expect(p.querySelector("script")).toBeNull();
    expect(p.textContent).toContain("<b>خطر</b>");
  });
});
