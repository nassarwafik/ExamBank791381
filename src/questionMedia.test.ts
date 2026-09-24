// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  isSafeSvg, svgToSafeDataUrl, readImageFile, aiRequestQuestion,
  currentAsset, hasImage, isImageHidden, replaceImagePatch, removeImagePatch, setVisibilityPatch, isEmbeddedRasterDataUrl,
  MEDIA_MAX_BYTES, ALLOWED_IMAGE_MIME, MEDIA_MSG,
} from "./questionMedia";
import type { BuilderQuestion } from "./examTypes";

const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#eee"/><text x="1" y="5">شبكة</text></svg>';
const png = () => new File([new Uint8Array([137, 80, 78, 71])], "d.png", { type: "image/png" });
const jpg = () => new File([new Uint8Array([255, 216, 255])], "d.jpg", { type: "image/jpeg" });
const webp = () => new File([new Uint8Array([82, 73, 70, 70])], "d.webp", { type: "image/webp" });
const svgFile = (text: string) => new File([text], "d.svg", { type: "image/svg+xml" });

describe("Phase 5B — allowed formats + SVG safety (pure)", () => {
  it("the four allowed MIME types are PNG/JPEG/WEBP/SVG", () => {
    expect([...ALLOWED_IMAGE_MIME]).toEqual(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
    expect(MEDIA_MAX_BYTES).toBe(3 * 1024 * 1024);
  });
  it("accepts a well-formed safe SVG and makes a data:image/svg+xml URL", () => {
    expect(isSafeSvg(SAFE_SVG)).toBe(true);
    expect(svgToSafeDataUrl(SAFE_SVG).startsWith("data:image/svg+xml,")).toBe(true);
  });
  it("rejects empty and non-svg content", () => {
    expect(isSafeSvg("")).toBe(false);
    expect(isSafeSvg("<div>not an svg</div>")).toBe(false);
  });
  it("rejects <script>", () => {
    expect(isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).toBe(false);
  });
  it("rejects an on* event handler (onload/onclick/onerror)", () => {
    expect(isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>')).toBe(false);
    expect(isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>')).toBe(false);
  });
  it("rejects foreignObject / iframe / object / embed", () => {
    for (const el of ["foreignObject", "iframe", "object", "embed"]) {
      expect(isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><' + el + "></" + el + "></svg>"), el).toBe(false);
    }
  });
  it("rejects a javascript: URL", () => {
    expect(isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>')).toBe(false);
  });
  it("rejects an external http(s) resource reference", () => {
    expect(isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>')).toBe(false);
  });
});

describe("Phase 5B — readImageFile (local upload)", () => {
  it("accepts PNG", async () => { const r = await readImageFile(png()); expect(r.contentType).toBe("image/png"); expect(r.dataUrl.startsWith("data:image/png")).toBe(true); expect(r.origin).toBe("uploaded"); });
  it("accepts JPEG", async () => { const r = await readImageFile(jpg()); expect(r.contentType).toBe("image/jpeg"); expect(r.dataUrl.startsWith("data:image/jpeg")).toBe(true); });
  it("accepts WEBP", async () => { const r = await readImageFile(webp()); expect(r.contentType).toBe("image/webp"); expect(r.dataUrl.startsWith("data:image/webp")).toBe(true); });
  it("accepts a safe SVG (sanitized to a data URL)", async () => { const r = await readImageFile(svgFile(SAFE_SVG)); expect(r.contentType).toBe("image/svg+xml"); expect(r.dataUrl.startsWith("data:image/svg+xml,")).toBe(true); });
  it("rejects an unsupported MIME (gif) with the PNG/JPG/WEBP/SVG message", async () => {
    await expect(readImageFile(new File([new Uint8Array([1])], "d.gif", { type: "image/gif" }))).rejects.toThrow(MEDIA_MSG.unsupported);
  });
  it("rejects a file over 3 MB", async () => {
    const big = new File([new Uint8Array(MEDIA_MAX_BYTES + 1)], "d.png", { type: "image/png" });
    await expect(readImageFile(big)).rejects.toThrow(MEDIA_MSG.tooLarge);
  });
  it("rejects a malformed / non-svg .svg", async () => {
    await expect(readImageFile(svgFile("<html>nope</html>"))).rejects.toThrow(MEDIA_MSG.unsafeSvg);
  });
  it("rejects a malicious SVG (script)", async () => {
    await expect(readImageFile(svgFile('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).rejects.toThrow(MEDIA_MSG.unsafeSvg);
  });
});

describe("Phase 5B — aiRequestQuestion is answer-safe", () => {
  const q: BuilderQuestion = {
    examQuestionId: "q1", presentationType: "multipleChoice", text: "أي جهاز يوجّه الحزم؟", marks: 2,
    options: [{ text: "Router" }, { text: "Switch" }], answer: { correctOptionIndex: 0 },
    fields: [{ id: "f1", correct: "SECRET" }],
  };
  it("includes only examQuestionId / text / options and NEVER the answer key", () => {
    const payload = aiRequestQuestion(q);
    expect(payload.examQuestionId).toBe("q1");
    expect(payload.text).toContain("يوجّه");
    expect(payload.options).toEqual([{ text: "Router", value: undefined, label: undefined }, { text: "Switch", value: undefined, label: undefined }]);
    const asJson = JSON.stringify(payload);
    expect("answer" in payload).toBe(false);
    expect(asJson).not.toContain("correctOptionIndex");
    expect(asJson).not.toContain("SECRET");
    expect(asJson).not.toContain("fields");
  });
});

describe("Phase 5B — media state helpers (pure)", () => {
  const withImage = (): BuilderQuestion => ({ examQuestionId: "q", presentationType: "shortAnswer", text: "t", marks: 1, image: { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,AAA", origin: "uploaded" }] } });
  it("currentAsset / hasImage read canonical image then legacy images[] fallback", () => {
    expect(hasImage(withImage())).toBe(true);
    expect(currentAsset(withImage())?.dataUrl).toBe("data:image/png;base64,AAA");
    const legacy: BuilderQuestion = { examQuestionId: "q", presentationType: "shortAnswer", text: "t", marks: 1, images: [{ dataUrl: "data:image/png;base64,LEG" }] };
    expect(hasImage(legacy)).toBe(true);
    expect(currentAsset(legacy)?.dataUrl).toBe("data:image/png;base64,LEG");
    expect(hasImage({ examQuestionId: "q", presentationType: "shortAnswer", text: "t", marks: 1 })).toBe(false);
  });
  it("replaceImagePatch sets canonical image and clears the stale images[] fallback", () => {
    const patch = replaceImagePatch({ dataUrl: "data:image/png;base64,NEW", origin: "ai-generated" });
    expect(patch.image).toEqual({ exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,NEW", origin: "ai-generated" }] });
    expect(patch.images).toEqual([]);
  });
  it("removeImagePatch clears canonical AND fallback so remove truly removes", () => {
    expect(removeImagePatch()).toEqual({ image: { exists: false, visible: false, assets: [] }, images: [] });
  });
  it("setVisibilityPatch toggles visible on the canonical image", () => {
    expect(setVisibilityPatch(withImage(), false).image?.visible).toBe(false);
    expect(isImageHidden({ ...withImage(), image: { exists: true, visible: false, assets: [{ dataUrl: "x" }] } })).toBe(true);
  });
  it("setVisibilityPatch promotes a legacy images[]-only image (bytes kept) and clears the fallback", () => {
    const legacy: BuilderQuestion = { examQuestionId: "q", presentationType: "shortAnswer", text: "t", marks: 1, images: [{ dataUrl: "data:image/png;base64,LEG" }] };
    const hide = setVisibilityPatch(legacy, false);
    expect(hide).toEqual({ image: { exists: true, visible: false, assets: [{ dataUrl: "data:image/png;base64,LEG" }] }, images: [] });
    expect(isImageHidden({ ...legacy, ...hide })).toBe(true);
    expect(currentAsset({ ...legacy, ...hide })?.dataUrl).toBe("data:image/png;base64,LEG");
    expect(setVisibilityPatch({ ...legacy, ...hide }, true).image).toEqual({ exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,LEG" }] });
  });
  it("setVisibilityPatch on a canonical image also clears a shadowed images[] fallback; no image → no-op", () => {
    const both: BuilderQuestion = { ...withImage(), images: [{ dataUrl: "data:image/png;base64,SHADOW" }] };
    const hide = setVisibilityPatch(both, false);
    expect(hide.image?.assets).toEqual(withImage().image?.assets);
    expect(hide.images).toEqual([]);
    expect(setVisibilityPatch({ examQuestionId: "q", presentationType: "shortAnswer", text: "t", marks: 1 }, false)).toEqual({});
  });
  it("isEmbeddedRasterDataUrl accepts only embedded png/jpeg/webp data URLs", () => {
    expect(isEmbeddedRasterDataUrl("data:image/png;base64,QUJD")).toBe(true);
    expect(isEmbeddedRasterDataUrl("data:image/jpeg;base64,QUJD")).toBe(true);
    expect(isEmbeddedRasterDataUrl("data:image/webp;base64,QUJD")).toBe(true);
    expect(isEmbeddedRasterDataUrl("https://cdn.example/img.png")).toBe(false);
    expect(isEmbeddedRasterDataUrl("data:image/svg+xml,%3Csvg%3E")).toBe(false);
    expect(isEmbeddedRasterDataUrl("data:text/html;base64,QUJD")).toBe(false);
    expect(isEmbeddedRasterDataUrl("data:image/png;base64,")).toBe(false);
    expect(isEmbeddedRasterDataUrl(undefined)).toBe(false);
  });
});
