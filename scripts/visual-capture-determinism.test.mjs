import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Hotfix (visual-studio-steps-settle) — the capture harness launches Chromium with deterministic rasterization, so the same build
// captured in two sessions is byte-identical (the studio steps' round badges at fractional positions were rasterized differently
// from one session to the next, an undeclared 2–4 pixel change on pull requests that never touched those pages). A pin: removing a
// flag, or launching without them, fails here.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "scripts/capture-visual-baseline-ux-r.mjs"), "utf8");

describe("visual capture harness — deterministic rasterization", () => {
  it("declares the deterministic raster flags", () => {
    const m = /const DETERMINISTIC_RASTER_ARGS = (\[[^\]]*\]);/.exec(src);
    expect(m).not.toBeNull();
    expect(JSON.parse(m[1])).toEqual(["--disable-partial-raster", "--num-raster-threads=1", "--disable-skia-runtime-opts", "--force-color-profile=srgb"]);
  });
  it("every browser it launches uses them", () => {
    const launches = src.match(/chromium\.launch\(\{[^}]*\}\)/g) || [];
    expect(launches.length).toBeGreaterThan(0);
    for (const l of launches) expect(l).toContain("...DETERMINISTIC_RASTER_ARGS");
  });
});
