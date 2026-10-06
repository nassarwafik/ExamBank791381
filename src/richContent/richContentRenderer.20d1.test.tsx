// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, cleanup, act } from "@testing-library/react";
import RichContentRenderer from "./RichContentRenderer";
import { FULL_DOC } from "./richContentModel.20d1.test";

// Phase 20D.1 — the trusted RichContent renderer: React constructs SEMANTIC HTML from structured data. Fail-first on 0b22080: no renderer.
afterEach(cleanup);
const settle = async () => { for (let i = 0; i < 12; i++) await act(async () => { await new Promise(r => setTimeout(r, 15)); }); };
const here = path.dirname(fileURLToPath(import.meta.url));

describe("20D1-RR1 semantic HTML", () => {
  it("a data table is a real <table> with caption, thead / th[scope=col], row headers th[scope=row], tbody — never pipe text", async () => {
    const { container } = render(<RichContentRenderer content={FULL_DOC() as never} />);
    await settle();
    const table = container.querySelector(".xp-table-wrap > table")!;
    expect(table).toBeTruthy();
    expect(table.querySelector("caption")!.textContent).toBe("الأجهزة");
    expect([...table.querySelectorAll("thead th[scope=col]")].map(t => t.textContent)).toEqual(["الجهاز", "VLAN", "IP", "Gateway"]);
    expect([...table.querySelectorAll("tbody th[scope=row]")].map(t => t.textContent)).toEqual(["PC1", "PC2"]);
    expect(table.querySelector("tbody")!.textContent).toContain("192.168.10.10");
    expect(container.textContent).not.toMatch(/\|\s*الجهاز\s*\|/);
    expect(container.querySelector(".xp-table-wrap")!.getAttribute("data-xp-responsive")).toBe("scroll");
  });
  it("headings map into the content outline (h3 here), lists are ol/ul, quote is blockquote + cite, figure has img[alt] + figcaption", async () => {
    const { container } = render(<RichContentRenderer content={FULL_DOC() as never} />);
    await settle();
    expect(container.querySelector("h3")!.textContent).toBe("معطيات الشبكة");
    expect(container.querySelector("h1, h2")).toBeNull();
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(1);
    expect(container.querySelector("blockquote")!.textContent).toContain("العلم نور");
    expect(container.querySelector("blockquote cite, figure.xp-quote figcaption")).toBeTruthy();
    const fig = container.querySelector("figure.xp-figure")!;
    expect(fig.querySelector("img")!.getAttribute("alt")).toBe("مخطط");
    expect(fig.querySelector("figcaption")!.textContent).toBe("الشكل 1");
  });
  it("inline marks are semantic elements: strong, em, u, code, sup, sub; code and CLI are LTR <pre><code>; math is MathML", async () => {
    const { container } = render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [
      { type: "paragraph", runs: [{ text: "a", marks: ["bold"] }, { text: "b", marks: ["italic"] }, { text: "c", marks: ["underline"] }, { text: "d", marks: ["code"] }, { text: "e", marks: ["sup"] }, { text: "f", marks: ["sub"] }] },
      ...FULL_DOC().blocks
    ] } as never} />);
    await settle();
    for (const tag of ["strong", "em", "u", "code", "sup", "sub"]) expect(container.querySelector("p " + tag), tag).toBeTruthy();
    const code = container.querySelector("pre.xp-code")!;
    expect(code.getAttribute("dir")).toBe("ltr");
    expect(code.querySelector("code")!.textContent).toBe("print('<script>')");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("pre.xp-cli")!.getAttribute("dir")).toBe("ltr");
    expect(container.querySelector("math mfrac")).toBeTruthy();
    expect(container.querySelector("math msup")).toBeTruthy();
  });
  it("callout is a labelled note region (variant as a code-owned data attribute), key-value grid is a <dl>, columns stack into a 2-slot container", async () => {
    const { container } = render(<RichContentRenderer content={FULL_DOC() as never} />);
    await settle();
    const callout = container.querySelector(".xp-callout")!;
    expect(callout.getAttribute("data-xp-variant")).toBe("info");
    expect(callout.getAttribute("role")).toBe("note");
    expect(container.querySelectorAll("dl.xp-kv > div > dt")).toHaveLength(2);
    expect(container.querySelectorAll(".xp-columns > .xp-column")).toHaveLength(2);
    expect(container.querySelector("hr.xp-divider")).toBeTruthy();
  });
  it("IP addresses / commands sit in direction-neutral islands (dir=auto cells, bdi for LTR runs)", async () => {
    const { container } = render(<RichContentRenderer content={FULL_DOC() as never} />);
    await settle();
    for (const td of container.querySelectorAll("table td")) expect(td.getAttribute("dir")).toBe("auto");
    expect(container.querySelector("dl.xp-kv dd")!.getAttribute("dir")).toBe("auto");
  });
  it("text that looks like HTML is rendered as TEXT (React text nodes), never parsed", async () => {
    const { container } = render(<RichContentRenderer content={{ schemaVersion: 1, blocks: [{ type: "code", language: "html", source: "<img src=x onerror=alert(1)>" }] } as never} />);
    await settle();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("20D1-RR2 source guards", () => {
  it("no dangerouslySetInnerHTML / innerHTML / eval anywhere in the rich-content and presentation runtime", () => {
    const dirs = [here, path.join(here, "../presentation")];
    for (const d of dirs) for (const f of fs.readdirSync(d).filter(n => /\.(tsx?|ts)$/.test(n) && !n.includes(".test."))) {
      const src = fs.readFileSync(path.join(d, f), "utf8");
      expect(src, f).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(|insertAdjacentHTML/);
    }
  });
});
