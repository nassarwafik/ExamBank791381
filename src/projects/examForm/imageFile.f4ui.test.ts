// @vitest-environment happy-dom
// Phase F4-UI — a picked file on its way to the form route: only the three raster types, a small file untouched, a large
// one shrunk when the browser can, the original when it cannot, and never more than the server's upload bound.
import { describe, it, expect, vi } from "vitest";
import { IMAGE_ACCEPT, IMAGE_MAX_BYTES, ImageFileError, PICK_MAX_BYTES, SHRINK_OVER_BYTES, prepareImageFile, shrinkInBrowser, type Shrink } from "./imageFile";

const file = (bytes: number, type = "image/jpeg", name = "photo.jpg") => new File([new Uint8Array(bytes).fill(65)], name, { type });
const decoded = (dataUrl: string) => atob(dataUrl.slice(dataUrl.indexOf(",") + 1)).length;
const never: Shrink = async () => { throw new Error("must not be called"); };

describe("F4-UI preparing a picked image", () => {
  it("accepts JPEG, PNG and WebP only", async () => {
    expect(IMAGE_ACCEPT).toBe("image/jpeg,image/png,image/webp");
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect((await prepareImageFile(file(10, type), never)).startsWith("data:" + type + ";base64,")).toBe(true);
    for (const type of ["image/svg+xml", "image/gif", "application/pdf", "text/html", ""]) {
      const refusal = await prepareImageFile(file(10, type), never).catch(e => e);
      expect(refusal).toBeInstanceOf(ImageFileError);
      expect(refusal.message).toContain("نوع الملف غير مدعوم");
    }
  });

  it("sends a small file exactly as it is", async () => {
    const shrink = vi.fn(never);
    expect(decoded(await prepareImageFile(file(SHRINK_OVER_BYTES), shrink))).toBe(SHRINK_OVER_BYTES);
    expect(shrink).not.toHaveBeenCalled();
  });

  it("sends the shrunk image of a large file", async () => {
    const shrink = vi.fn(async () => new Blob([new Uint8Array(2000)], { type: "image/jpeg" }));
    const dataUrl = await prepareImageFile(file(IMAGE_MAX_BYTES + 5000, "image/png", "big.png"), shrink);
    expect(shrink).toHaveBeenCalledTimes(1);
    expect(dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(decoded(dataUrl)).toBe(2000);
  });

  it("falls back to the original when the browser cannot shrink, or the result is no smaller", async () => {
    const size = SHRINK_OVER_BYTES + 100;
    expect(decoded(await prepareImageFile(file(size), async () => null))).toBe(size);
    expect(decoded(await prepareImageFile(file(size), async () => { throw new Error("canvas"); }))).toBe(size);
    expect(decoded(await prepareImageFile(file(size), async () => new Blob([new Uint8Array(size + 1)])))).toBe(size);
    expect(decoded(await prepareImageFile(file(size), async () => new Blob([])))).toBe(size);
  });

  it("refuses what would still exceed the server's bound, and a file too large to open", async () => {
    const tooLarge = await prepareImageFile(file(IMAGE_MAX_BYTES + 1), async () => null).catch(e => e);
    expect(tooLarge).toBeInstanceOf(ImageFileError);
    expect(tooLarge.message).toContain("6 ميغابايت");
    expect(decoded(await prepareImageFile(file(IMAGE_MAX_BYTES), async () => null))).toBe(IMAGE_MAX_BYTES);

    const shrink = vi.fn(never);
    const huge = await prepareImageFile({ type: "image/jpeg", size: PICK_MAX_BYTES + 1 } as File, shrink).catch(e => e);
    expect(huge).toBeInstanceOf(ImageFileError);
    expect(shrink).not.toHaveBeenCalled();
  });

  it("the browser shrink gives up quietly where the image cannot be decoded", async () => {
    expect(await shrinkInBrowser(new Blob(["not an image"]))).toBeNull();
  });
});
