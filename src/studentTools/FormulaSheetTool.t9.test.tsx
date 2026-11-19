// @vitest-environment happy-dom
// Phase T9 — the student sees the sheet's images, drawn by the platform's one rich-content renderer.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import FormulaSheetTool from "./FormulaSheetTool";

afterEach(cleanup);
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("T9 — sheet images in the student panel", () => {
  it("an image and a figure render with their alternative text and caption", async () => {
    render(<FormulaSheetTool config={{ id: "formulaSheet", title: "قوانين الدارات", content: { schemaVersion: 1, blocks: [
      { type: "paragraph", runs: [{ text: "V = I R" }] },
      { type: "image", alt: "رمز المقاومة", asset: { dataUrl: PNG, origin: "uploaded" } },
      { type: "figure", alt: "دارة توالٍ", caption: [{ text: "الشكل 1: دارة توالٍ" }], asset: { dataUrl: "/api/question-image?blob=bank%2Fa.png&exp=1&sig=x", origin: "bank", blobName: "bank/a.png" } }
    ] } }} />);
    const a = await screen.findByAltText("رمز المقاومة") as HTMLImageElement;
    expect(a.getAttribute("src")).toBe(PNG);
    const b = screen.getByAltText("دارة توالٍ") as HTMLImageElement;
    expect(b.getAttribute("src")).toMatch(/^\/api\/question-image\?/);
    expect(screen.getByText("الشكل 1: دارة توالٍ")).toBeTruthy();
    expect(screen.getByText("V = I R")).toBeTruthy();
  });
});
