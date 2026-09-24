// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import StudentQuestionCard, { type Question } from "./StudentQuestionCard";

const PNG = "data:image/png;base64,AAAA";
const SVG = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
const noop = () => {};
const renderQ = (q: Question) => render(<StudentQuestionCard q={q} index={0} id="q1" answer={undefined} onChoice={noop} onSeq={noop} onTable={noop} onText={noop} onField={noop} />);
const base = (over: Partial<Question> = {}): Question => ({ examQuestionId: "q1", text: "سؤال", marks: 2, presentationType: "shortAnswer", ...over });

afterEach(() => cleanup());

describe("Phase 5B — StudentQuestionCard image rendering", () => {
  it("renders a canonical structured image through <img class=iex-image>", () => {
    renderQ(base({ image: { exists: true, visible: true, assets: [{ dataUrl: PNG }] } }));
    const img = document.querySelector("img.iex-image") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe(PNG);
  });
  it("renders an SVG data URL through <img> (never inline HTML)", () => {
    renderQ(base({ image: { exists: true, visible: true, assets: [{ dataUrl: SVG }] } }));
    const img = document.querySelector("img.iex-image") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(SVG);
    expect(document.querySelector("svg")).toBeNull(); // not injected as live DOM
  });
  it("an image-less question renders no img", () => {
    renderQ(base());
    expect(document.querySelector("img.iex-image")).toBeNull();
  });
  it("a hidden canonical image (visible:false) is NOT rendered", () => {
    renderQ(base({ image: { exists: true, visible: false, assets: [{ dataUrl: PNG }] } }));
    expect(document.querySelector("img.iex-image")).toBeNull();
  });
  it("a legacy images[] fallback still renders", () => {
    renderQ(base({ images: [{ dataUrl: PNG }] }));
    expect((document.querySelector("img.iex-image") as HTMLImageElement).getAttribute("src")).toBe(PNG);
  });
});
