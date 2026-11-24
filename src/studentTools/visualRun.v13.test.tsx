// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import type { DsObj, DsStep, DsTrace } from "../learning/activities/ds";
import LabTraceView from "./LabTraceView";
import { objectGraphOf, type OgGraph, type OgNode } from "./objectGraph";
import { crossings, layoutObjects, OL, rowMid } from "./objectLayout";
import { saveDrawing, svgMarkup } from "./drawingExport";
import { resetDeviceLabForTests, DESKTOP_QUERY } from "./deviceCSharpLab";

// Visual lab V13 (docs/enterprise-csharp-visual-lab-plan.md §23) — a better object diagram, and «حفظ صورة»:
//   • the layout (objectLayout.ts): a box level with the row that refers to it (one parent → a straight, level arrow), a shared box
//     between its parents, a column ordered by where its arrows come from, never two boxes overlapping, the variables level with
//     their box; the arrows that cross are counted (the V10 composite: down to the one its shared Address makes unavoidable);
//   • the picture (drawingExport.ts): the SVG copied with its paint inline, on its background, its words as <title>; saved as PNG, or
//     as the SVG copy when no picture can be made (never lost); «حفظ صورة» above the object diagram and the call flow.

afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY, media: q, addEventListener() {}, removeEventListener() {} }))));

const v = (s: string) => ({ t: "v" as const, s });
const ref = (id: number) => ({ t: "ref" as const, id });
const step = (vars: DsStep["frames"][0]["vars"], objs: DsObj[]): DsStep => ({ line: 1, note: "", frames: [{ name: "Main", vars }], objs, out: "", error: false });
const measure = (_n: OgNode) => ({ w: 160, keyW: 60 });
const lay = (g: OgGraph) => layoutObjects(g, measure, 60);
const obj = (id: number, fields: [string, ReturnType<typeof v> | ReturnType<typeof ref>][], type = "T"): DsObj => ({ id, k: "obj", type, fields });

describe("V13 — the layout", () => {
  it("one parent → a straight, level arrow: each box's header is level with the row that refers to it; the variable level with its box", () => {
    const g = objectGraphOf(step([["r", ref(1)]], [obj(1, [["n", v("1")], ["a", ref(2)]]), obj(2, [["x", v("2")], ["b", ref(3)]]), obj(3, [["y", v("3")]])]))!;
    const l = lay(g);
    const head = (id: number) => l.boxes.get(id)!.y + OL.HEAD / 2;
    expect(head(2)).toBe(rowMid(l.boxes.get(1)!.y, 1));
    expect(head(3)).toBe(rowMid(l.boxes.get(2)!.y, 1));
    expect(l.roots[0].y + OL.CHIP / 2).toBe(head(1));
    expect(crossings(g, l)).toBe(0);
  });
  it("a column is ordered by where its arrows come from — not by the order the boxes were found — and never overlaps", () => {
    // R's rows: a → A (found first), b → B; A's only row and C's refer to S (found first, from A), B's to T. S is wanted between A and C
    // (far below B, which is tall), so T — level with B — goes above S.
    const tall: [string, ReturnType<typeof v>][] = Array.from({ length: 6 }, (_, i) => ["f" + i, v(String(i))]);
    const g = objectGraphOf(step([["r", ref(1)]], [
      obj(1, [["a", ref(2)], ["b", ref(3)], ["c", ref(4)]]),
      obj(2, [["s", ref(5)]]), obj(3, [["t", ref(6)], ...tall]), obj(4, [["s", ref(5)]]),
      obj(5, [["x", v("1")]]), obj(6, [["y", v("2")]])]))!;
    expect(g.nodes.filter(n => n.col === 3).map(n => n.id)).toEqual([5, 6]);   // the order found
    const l = lay(g);
    expect(l.boxes.get(6)!.y).toBeLessThan(l.boxes.get(5)!.y);                // ordered by where the arrows come from
    expect(l.boxes.get(6)!.y + OL.HEAD / 2).toBe(rowMid(l.boxes.get(3)!.y, 0));    // T level with B's row
    for (const c of [1, 2, 3]) {
      const col = [...l.boxes.values()].filter(b => b.col === c).sort((a, b) => a.y - b.y);
      for (let i = 1; i < col.length; i++) expect(col[i].y).toBeGreaterThanOrEqual(col[i - 1].y + col[i - 1].h + OL.GAP_Y);
    }
  });
  it("the V10 composite (Person[] → Ali, Sara; one Address; two int[]): only the crossing the shared Address makes", () => {
    const person = (id: number, home: number, marks: number, friend?: number): DsObj => obj(id, [["Name", v("n")], ["Age", v("20")], ["Home", ref(home)], ["Marks", ref(marks)], ...(friend ? [["Friend", ref(friend)] as [string, ReturnType<typeof ref>]] : [])], "Person");
    const g = objectGraphOf(step([["people", ref(1)]], [{ id: 1, k: "array", type: "Person[]", items: ["…", "…"], refs: [2, 5] },
      person(2, 4, 3), { id: 3, k: "array", type: "int[]", items: ["0", "90", "0"] }, obj(4, [["City", v("H")]], "Address"),
      person(5, 4, 6, 2), { id: 6, k: "array", type: "int[]", items: ["0", "0", "0"] }]))!;
    const l = lay(g);
    expect(crossings(g, l)).toBeLessThanOrEqual(1);
    // the shared Address sits between its two parents' Home rows
    const homes = [2, 5].map(id => rowMid(l.boxes.get(id)!.y, 2));
    const addr = l.boxes.get(4)!.y + OL.HEAD / 2;
    expect(addr).toBeGreaterThanOrEqual(Math.min(...homes));
    expect(addr).toBeLessThanOrEqual(Math.max(...homes) + 1);
  });
});

describe("V13 — the picture", () => {
  const svgOf = () => {
    document.body.innerHTML = '<svg viewBox="0 0 120 40" width="120" height="40" role="img" aria-label="مخطّط الكائنات. r يشير إلى T #1." class="learning-ds-svg">'
      + '<rect class="lab-og-box" x="1" y="1" width="50" height="20" style="fill: rgb(10, 20, 30)"></rect><text class="lab-og-title" x="4" y="14">T #1</text></svg>';
    return document.querySelector("svg") as SVGSVGElement;
  };
  it("the SVG copy: standalone (xmlns, size), its background first, its words as <title>, classes replaced by inline paint", () => {
    const { markup, width, height } = svgMarkup(svgOf(), "rgb(255, 255, 255)");
    expect([width, height]).toEqual([120, 40]);
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toMatch(/<title>مخطّط الكائنات\. r يشير إلى T #1\.<\/title><rect x="0" y="0" width="120" height="40" fill="rgb\(255, 255, 255\)"/);
    expect(markup).not.toContain("class=");
    expect(markup).not.toContain("aria-label");
    expect(markup).toMatch(/<rect x="1"[^>]*style="[^"]*fill:\s*rgb\(10, 20, 30\)/);
    expect(markup).toContain(">T #1</text>");
  });
  it("no picture can be made here → the SVG copy is saved instead (never lost)", async () => {
    const urls: Blob[] = [];
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL: (b: Blob) => { urls.push(b); return "blob:x" + urls.length; }, revokeObjectURL: () => {} }));
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download); });
    vi.spyOn(HTMLImageElement.prototype, "decode").mockRejectedValue(new Error("refused"));
    expect(await saveDrawing(svgOf(), "objects-step-3", "white")).toBe("svg");
    expect(clicks).toEqual(["objects-step-3.svg"]);
    expect(urls.at(-1)!.type).toBe("image/svg+xml;charset=utf-8");
  });
  it("a picture made → saved as PNG at twice the size", async () => {
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download); });
    vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue(undefined);
    const sizes: number[][] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      sizes.push([this.width, this.height]);
      return { scale() {}, drawImage() {} } as unknown as CanvasRenderingContext2D;
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb: BlobCallback) => cb(new Blob(["png"], { type: "image/png" })));
    expect(await saveDrawing(svgOf(), "calls-step-7", "white")).toBe("png");
    expect(clicks).toEqual(["calls-step-7.png"]);
    expect(sizes).toEqual([[240, 80]]);
  });
});

const TRACE: DsTrace = { lines: ["a", "b"], steps: [
  step([["r", ref(1)]], [obj(1, [["n", v("1")]])]),
  step([["r", ref(1)]], [obj(1, [["n", v("2")]])]),
] };

describe("V13 — in the player", () => {
  it("«حفظ صورة» above the object diagram; the file is named by the step; it says what it saved", async () => {
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download); });
    vi.spyOn(HTMLImageElement.prototype, "decode").mockRejectedValue(new Error("no picture here"));
    render(<LabTraceView trace={TRACE} epoch={1} />);
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    const heap = screen.getByRole("region", { name: "الكائنات" });
    fireEvent.click(within(heap).getByRole("button", { name: "حفظ صورة" }));
    await waitFor(() => expect(clicks).toEqual(["objects-step-2.svg"]));
    expect(within(heap).getByRole("status").textContent).toBe("حُفظت الصورة بصيغة SVG في مجلد التنزيلات.");
  });
});
