import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

// Tadris+ P9-B3 — security review finding (stored same-origin HTML through a bank image). /api/question-image serves a bank image
// from the `assets` container to whoever holds its signed URL. The content type comes from the blob, and the import used to
// store the type the BROWSER declared (bank-import-action `imageAssets[].contentType`). Served back on the app's origin with
// that type, `text/html` or a scripted SVG would run as the app when the link is opened. Now:
//   • only an image type of the allow-list is served inline, always with `nosniff` and a CSP that forbids everything (sandbox);
//   • any other stored type is served as an opaque download (`application/octet-stream`, attachment), never rendered;
//   • the import stores only an allow-listed type (anything else: `application/octet-stream`, a `.bin` name).
// TEST data only; the blob store is a stub.

const cjs = createRequire(import.meta.url);
process.env.BUILDER_SESSION_SECRET = "p9b3-question-image-test-secret";
const { handler } = cjs("../src/functions/question-image.js");
const { createSignedAssetParams } = cjs("../src/lib/builder-auth.js");
const { uploadImageAssetForTests } = cjs("../src/functions/bank-import-action.js");

const signedRequest = blob => { const { exp, sig } = createSignedAssetParams(blob); return { method: "GET", url: "https://x/api/question-image?blob=" + encodeURIComponent(blob) + "&exp=" + exp + "&sig=" + sig }; };
const serve = (contentType, body = "<script>alert(1)</script>") => handler(signedRequest("import-x-img-0123456789abcdef.png"), { downloadAsset: async () => ({ buffer: Buffer.from(body), contentType }) });
const header = (r, name) => { const h = r.headers || {}; const k = Object.keys(h).find(x => x.toLowerCase() === name); return k ? String(h[k]) : null; };

describe("P9-B3 /api/question-image never renders a stored non-image as the app", () => {
  it("fail-first: a stored text/html blob is NOT served as text/html; it is an opaque download, sniffing off, nothing allowed", async () => {
    const r = await serve("text/html");
    expect(r.status).toBe(200);
    expect(header(r, "content-type")).toBe("application/octet-stream");
    expect(header(r, "content-disposition")).toMatch(/^attachment/);
    expect(header(r, "x-content-type-options")).toBe("nosniff");
    expect(header(r, "content-security-policy")).toMatch(/default-src 'none'/);
    expect(header(r, "content-security-policy")).toMatch(/sandbox/);
  });
  it("an SVG (it can carry script) is served under a sandbox CSP that forbids scripts, with nosniff", async () => {
    const r = await serve("image/svg+xml", "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    expect(header(r, "content-type")).toBe("image/svg+xml");
    expect(header(r, "content-security-policy")).toMatch(/default-src 'none'/);
    expect(header(r, "content-security-policy")).toMatch(/sandbox/);
    expect(header(r, "content-security-policy")).not.toMatch(/allow-scripts|script-src/);
    expect(header(r, "x-content-type-options")).toBe("nosniff");
  });
  it("a real raster image is served inline exactly as before (type, body, private caching), plus the safety headers", async () => {
    for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
      const r = await serve(type, "bytes");
      expect([r.status, header(r, "content-type"), header(r, "content-disposition")]).toEqual([200, type, null]);
      expect(Buffer.from(r.body).toString()).toBe("bytes");
      expect(header(r, "cache-control")).toBe("private, max-age=600");
      expect(header(r, "x-content-type-options")).toBe("nosniff");
    }
  });
  it("a type with parameters or odd case is judged by its media type; an unknown or missing type is a download", async () => {
    expect(header(await serve("IMAGE/PNG; charset=binary"), "content-type")).toBe("image/png");
    for (const t of ["application/xhtml+xml", "text/xml", "application/octet-stream", "", "image/png\n<script>"]) {
      const r = await serve(t);
      expect([t, header(r, "content-type"), /^attachment/.test(header(r, "content-disposition") || "")]).toEqual([t, "application/octet-stream", true]);
    }
  });
  it("an invalid signature is still refused before any storage read", async () => {
    let read = false;
    const r = await handler({ method: "GET", url: "https://x/api/question-image?blob=a.png&exp=9999999999&sig=bad" }, { downloadAsset: async () => { read = true; return null; } });
    expect([r.status, read]).toEqual([401, false]);
  });
});

describe("P9-B3 the bank import stores only an allow-listed image type", () => {
  let uploads;
  const container = { getBlockBlobClient: name => ({ upload: async (buf, len, opts) => { uploads.push({ name, type: opts.blobHTTPHeaders.blobContentType }); } }) };
  beforeEach(() => { uploads = []; });
  it("a browser-declared text/html (or any non-image) is stored as application/octet-stream with a .bin name", async () => {
    for (const contentType of ["text/html", "text/xml", "application/javascript"]) {
      const a = await uploadImageAssetForTests(container, "import-src", 1, { dataUrl: "data:" + contentType + ";base64," + Buffer.from("<script>x</script>").toString("base64"), contentType });
      expect(a.contentType).toBe("application/octet-stream");
    }
    expect(uploads.every(u => u.type === "application/octet-stream" && /\.bin$/.test(u.name))).toBe(true);
  });
  it("png / jpeg / gif / webp / svg keep their type and extension", async () => {
    for (const [contentType, ext] of [["image/png", "png"], ["image/jpeg", "jpeg"], ["image/gif", "gif"], ["image/webp", "webp"], ["image/svg+xml", "svg"]]) {
      await uploadImageAssetForTests(container, "import-src", 1, { dataUrl: "data:" + contentType + ";base64,AAAA", contentType });
      expect(uploads.at(-1).type).toBe(contentType);
      expect(uploads.at(-1).name.endsWith("." + ext)).toBe(true);
    }
  });
});
