import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { externalizeImage, externalizeImageBlock, externalizeSnapshotImages } from "./library-assets.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "library-assets-test-"));
// A 1x1 png, base64.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("externalizeImage", () => {
  it("writes a content-addressed file and returns its served URL", () => {
    const url = externalizeImage(PNG, "image/png", "F06", tmp);
    expect(url).toMatch(/^\/exam-library\/assets\/F06\/[0-9a-f]{16}\.png$/);
    expect(fs.existsSync(path.join(tmp, url.replace("/exam-library/assets/", "")))).toBe(true);
  });

  it("is deterministic and dedupes: identical bytes -> identical path", () => {
    const a = externalizeImage(PNG, "image/png", "F06", tmp);
    const b = externalizeImage(PNG, "image/png", "F06", tmp);
    expect(a).toBe(b);
  });

  it("uses the right extension for the content type", () => {
    expect(externalizeImage(PNG, "image/jpeg", "F01", tmp)).toMatch(/\.jpg$/);
  });
});

describe("externalizeImageBlock", () => {
  it("replaces a base64 data: URL with a served file URL, keeping the field name dataUrl", () => {
    const block = { exists: true, visible: true, origin: "uploaded", assets: [{ id: "img-0", origin: "uploaded", contentType: "image/png", dataUrl: "data:image/png;base64," + PNG }], prompt: null };
    const out = externalizeImageBlock(block, "F03", tmp);
    expect(out.assets[0].dataUrl).toMatch(/^\/exam-library\/assets\/F03\//);
    expect(out.assets[0].dataUrl).not.toContain("base64");
  });

  it("leaves an empty image block untouched", () => {
    const empty = { exists: false, visible: false, origin: null, assets: [], prompt: null };
    expect(externalizeImageBlock(empty, "F03", tmp)).toEqual(empty);
  });
});

describe("externalizeSnapshotImages", () => {
  it("externalizes every question's images and leaves no data: URI behind", () => {
    const snapshot = {
      examId: "LIB-F06",
      questions: [
        { examQuestionId: "LIB-F06-Q01", image: { exists: true, visible: true, origin: "uploaded", assets: [{ id: "img-0", origin: "uploaded", contentType: "image/png", dataUrl: "data:image/png;base64," + PNG }], prompt: null } },
        { examQuestionId: "LIB-F06-Q02", image: { exists: false, visible: false, origin: null, assets: [], prompt: null } }
      ]
    };
    const out = externalizeSnapshotImages(snapshot, "F06", tmp);
    expect(JSON.stringify(out)).not.toContain("base64");
    expect(out.questions[0].image.assets[0].dataUrl).toMatch(/^\/exam-library\/assets\/F06\//);
  });
});
