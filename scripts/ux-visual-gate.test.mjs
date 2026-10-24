// UX-R19b — the visual regression gate's pure parts and its wiring (docs/enterprise-ux-r0-redesign-foundation.md R19b). These guards
// pin: the PNG decoder reads every row filter Chromium writes; the comparison is the one every UX-R phase used (a change: any channel
// moves by more than 12 levels, or the size changes); a pull request declares only the manifest entries its base does not have; a
// manifest typo cannot declare nothing; the verdict fails on an undeclared change that shows again, and on a check that fails on
// the head only; and the workflow runs the gate on every viewport with read-only permissions, base and head captured by one harness.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { decodePng, encodePng, compareImages, validateManifest, declaredByPr, evaluate } from "./ux-visual-gate-lib.mjs";

const read = (...p) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const image = (width, height, fill) => { const rgba = Buffer.alloc(width * height * 4); for (let i = 0; i < width * height; i++) fill(i, rgba.subarray(i * 4, i * 4 + 4)); return { width, height, rgba }; };
const noise = (w, h, seed = 7) => image(w, h, (i, px) => { for (let k = 0; k < 3; k++) px[k] = (i * 31 + k * 17 + seed * 13 + ((i * i) % 97)) & 255; px[3] = 255; });

/** A PNG whose rows use the given filters (an RGB image, as Chromium writes them), built here independently of encodePng. */
function filteredPng({ width, height, rgba }, filters) {
  const bpp = 3, stride = width * bpp, raw = Buffer.alloc(height * (stride + 1));
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(stride); for (let x = 0; x < width; x++) for (let k = 0; k < 3; k++) line[x * 3 + k] = rgba[(y * width + x) * 4 + k];
    const f = filters[y % filters.length]; raw[y * (stride + 1)] = f;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[y * (stride + 1) + 1 + i] = (line[i] - pred) & 255;
    }
    prev = line;
  }
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32BE(data.length, 0); h.write(type, 4, "latin1"); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([h.subarray(4), data])) >>> 0, 0); return Buffer.concat([h, data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", idat.subarray(0, 10)), chunk("IDAT", idat.subarray(10)), chunk("IEND", Buffer.alloc(0))]);
}

describe("UX-R19b — PNG decoding and encoding", () => {
  it("decodes every row filter (none, sub, up, average, Paeth) and IDAT split across chunks", () => {
    const src = noise(23, 11);
    const out = decodePng(filteredPng(src, [0, 1, 2, 3, 4]));
    expect([out.width, out.height]).toEqual([23, 11]);
    expect(out.rgba.equals(src.rgba)).toBe(true);
  });

  it("round-trips its own RGBA encoding", () => {
    const src = image(9, 5, (i, px) => { px[0] = i; px[1] = 255 - i; px[2] = i * 3; px[3] = 128 + i; });
    expect(decodePng(encodePng(src)).rgba.equals(src.rgba)).toBe(true);
  });

  it("rejects what it cannot read instead of guessing", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow(/not a PNG/);
  });
});

describe("UX-R19b — the comparison", () => {
  const base = image(4, 3, (_, px) => { px[0] = 100; px[1] = 100; px[2] = 100; px[3] = 255; });
  const shifted = by => image(4, 3, (i, px) => { px[0] = i === 5 ? 100 + by : 100; px[1] = 100; px[2] = 100; px[3] = 255; });

  it("a channel moving by 12 levels is not a change; by 13 it is", () => {
    expect(compareImages(base, shifted(12)).changed).toBe(false);
    const c = compareImages(base, shifted(13));
    expect([c.changed, c.changedPixels, c.maxDelta]).toEqual([true, 1, 13]);
  });

  it("a size change is a change, even when the shared area is identical", () => {
    const taller = image(4, 4, (_, px) => { px[0] = 100; px[1] = 100; px[2] = 100; px[3] = 255; });
    const c = compareImages(base, taller);
    expect([c.changed, c.sameSize, c.changedPixels]).toEqual([true, false, 4]);
    expect([c.diff.width, c.diff.height]).toEqual([4, 4]);
  });
});

describe("UX-R19b — the manifest", () => {
  const known = new Set(["dashboard", "studio-content"]);
  const entry = (page, viewport, reason = "the studio's steps take a second row below 1280 px") => ({ page, viewport, reason });

  it("a pull request declares only the entries its base does not have (earlier PRs' entries are history)", () => {
    const old = entry("dashboard", "all", "R18a — dark mode tokens");
    expect(declaredByPr({ version: 1, changes: [old] }, { version: 1, changes: [old, entry("studio-content", "tablet")] })).toEqual([entry("studio-content", "tablet")]);
    expect(declaredByPr(undefined, { version: 1, changes: [old] })).toEqual([old]);
  });

  it("an unknown page, a bad viewport or an empty reason is an error, so a typo cannot silently declare nothing", () => {
    const { errors } = validateManifest({ version: 1, changes: [entry("studio-contnet", "tablet"), entry("dashboard", "laptop"), entry("dashboard", "phone", "x")] }, known);
    expect(errors).toHaveLength(3);
    expect(validateManifest({ changes: [] }, known).errors).toHaveLength(1);
    expect(validateManifest({ version: 1, changes: [entry("dashboard", "all")] }, known).errors).toEqual([]);
  });
});

describe("UX-R19b — the verdict", () => {
  const r = (page, viewport, more = {}) => ({ page, viewport, changed: true, sameSize: true, changedPixels: 40, before: [1, 1], after: [1, 1], ...more });
  const declared = [{ page: "studio-content", viewport: "tablet", reason: "the steps take a second row" }];

  it("fails on an undeclared change that shows again on the re-capture, and passes a declared one", () => {
    const v = evaluate({ results: [r("dashboard", "desktop", { confirmed: true }), r("students", "phone"), r("studio-content", "tablet")], declared });
    expect(v.ok).toBe(false);
    expect(v.failures.map(f => f.kind + ":" + f.page)).toEqual(["undeclared:dashboard", "undeclared:students"]);   // no re-capture ran: still a failure
    expect(v.declaredChanges.map(x => x.page)).toEqual(["studio-content"]);
  });

  it("a change identical on the re-capture is a recorded flake, not a failure; an unchanged page is nothing", () => {
    const v = evaluate({ results: [r("dashboard", "desktop", { confirmed: false }), { page: "login", viewport: "phone", changed: false }], declared: [] });
    expect(v.ok).toBe(true);
    expect(v.notes.map(n => n.kind)).toEqual(["flake"]);
  });

  it("\"all\" declares every viewport; a declaration matches only its own page", () => {
    const all = [{ page: "dashboard", viewport: "all", reason: "dark mode tokens" }];
    expect(evaluate({ results: [r("dashboard", "phone"), r("dashboard", "desktop")], declared: all }).ok).toBe(true);
    expect(evaluate({ results: [r("students", "phone", { confirmed: true })], declared: all }).ok).toBe(false);
  });

  it("a check that fails on the head only fails the gate; one failing on the base too is a note; a missing capture fails", () => {
    const checks = { base: { "phone/a": { ok: true }, "phone/b": { ok: false } }, head: { "phone/a": { ok: false, detail: "horizontal overflow 421>390" }, "phone/b": { ok: false, detail: "x" } } };
    const v = evaluate({ results: [], declared: [], checks });
    expect(v.failures.map(f => f.id)).toEqual(["phone/a"]);
    expect(v.notes.map(n => n.id)).toEqual(["phone/b"]);
    expect(evaluate({ results: [{ page: "a", viewport: "phone", missing: "no head capture" }], declared: [] }).ok).toBe(false);
  });

  it("a manifest error fails the gate", () => {
    expect(evaluate({ results: [], declared: [], manifestErrors: ["changes[0].viewport must be …"] }).ok).toBe(false);
  });
});

describe("UX-R19b — the wiring", () => {
  const workflow = read(".github", "workflows", "ux-visual-regression-r19b.yml");
  const gate = read("scripts", "ux-visual-gate.mjs");

  it("the workflow is read-only, runs on pull requests that touch the app or the harness, once per viewport, and keeps the evidence", () => {
    expect(workflow).toMatch(/^on:\n  pull_request:/m);
    expect(workflow).not.toContain("pull_request_target");
    expect(workflow).toMatch(/permissions:\n  contents: read/);
    for (const p of ['"src/**"', '"public/**"', '"scripts/capture-visual-baseline-ux-r.mjs"', '"docs/ux-r/visual-changes.json"']) expect(workflow, p).toContain(p);
    expect(workflow).toContain("viewport: [desktop, tablet, phone]");
    expect(workflow).toContain("theme: [light, dark]");                                       // UX-R18c2: both themes
    expect(workflow).toContain("THEME: ${{ matrix.theme }}");
    expect(workflow).toContain("fail-fast: false");
    expect(workflow).toContain("node scripts/ux-visual-gate.mjs");
    expect(workflow).toContain("actions/upload-artifact@v4");
  });

  it("the base is the merge commit's first parent, built in its own worktree and captured by the head's harness", () => {
    expect(workflow).toContain("git rev-parse HEAD^1");
    expect(workflow).toContain("BASE_DIST: ../base/dist");
    expect(workflow).toContain("BASE_MANIFEST: ../base/docs/ux-r/visual-changes.json");
    expect(gate).toContain('path.join(root, "scripts", "capture-visual-baseline-ux-r.mjs")');
  });

  it("an undeclared change is captured again on both builds before it is reported; a run that captured nothing cannot pass", () => {
    // every change the PR did not declare is a suspect, and any suspect triggers the re-capture
    expect(gate).toContain("const suspects = results.filter(r => r.changed && !isDeclared(declared, r.page, r.viewport));\nif (suspects.length) {");
    expect(gate).toContain('capture("base-confirm", baseDist, again); capture("head-confirm", headDist, again);');
    expect(gate).toContain("if (!base.pages.size || !head.pages.size)");
  });

  it("each page waits for a stable document height before its full-page screenshot", () => {
    expect(read("scripts", "capture-visual-baseline-ux-r.mjs")).toContain("same = h === last ? same + 1 : 0; last = h;");
  });

  it("each page's capture is kept only once two full-page shots in a row are identical (a late-painted fixed / sticky layer)", () => {
    const harness = read("scripts", "capture-visual-baseline-ux-r.mjs");
    expect(harness).toContain("const next = await page.screenshot({ fullPage: true });\n      if (next.equals(shot)) break;\n      shot = next;");
    expect(harness).toContain("fs.writeFileSync(file, shot);");
    expect(harness).not.toContain("await page.screenshot({ path: file, fullPage: true });");
  });

  it("every page shot starts from the top of the document, except a state-* scene (its open menu closes on a scroll event)", () => {
    const harness = read("scripts", "capture-visual-baseline-ux-r.mjs");
    const reset = harness.indexOf('if (!pg.id.startsWith("state-")) {\n      await page.evaluate(() => { if (window.scrollY || window.scrollX) window.scrollTo(0, 0); });');
    const settle = harness.indexOf("let shot = await page.screenshot({ fullPage: true });");
    expect(reset).toBeGreaterThan(-1);
    expect(settle).toBeGreaterThan(reset);                       // the reset comes before the settled capture
  });

  it("the manifest exists and starts valid", () => {
    expect(validateManifest(JSON.parse(read("docs", "ux-r", "visual-changes.json"))).errors).toEqual([]);
  });
});
