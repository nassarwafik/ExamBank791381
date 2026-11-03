import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkProtectedAssets } from "./check-protected-assets.mjs";

// Tadris+ P5-C (S7, D10) — the build gate that keeps the protected course / library images out of the static site. TEST trees only.
const tmp = [];
const tree = files => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p5c-assets-"));
  tmp.push(dir);
  for (const [rel, bytes] of Object.entries(files)) { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, bytes); }
  return dir;
};
afterEach(() => { for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe("P5-C check-protected-assets", () => {
  const prot = () => tree({ "learning/791381s/aaaaaaaaaaaaaaaa.png": "drawing-bytes", "exam-library/F01/bbbbbbbbbbbbbbbb.png": "question-bytes" });
  it("passes when no protected image is public", () => {
    expect(checkProtectedAssets({ protectedDir: prot(), publicDirs: [tree({ "icons.svg": "<svg/>", "pwa/icon.png": "icon" })] })).toEqual([]);
  });
  it("fails on any file in a former public home", () => {
    const issues = checkProtectedAssets({ protectedDir: prot(), publicDirs: [tree({ "learning-assets/x/new.png": "other", "exam-library/assets/F09/y.png": "other2" })] });
    expect(issues.filter(i => i.includes("protected location"))).toHaveLength(2);
  });
  it("fails when a protected image is re-added anywhere under another name", () => {
    const issues = checkProtectedAssets({ protectedDir: prot(), publicDirs: [tree({ "img/copy.png": "question-bytes" })] });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/is the protected image exam-library[\\/]F01[\\/]bbbbbbbbbbbbbbbb\.png/);
  });
  it("fails when the protected tree itself is empty (moved or deleted)", () => {
    expect(checkProtectedAssets({ protectedDir: tree({}), publicDirs: [] })[0]).toMatch(/no protected images/);
  });
  it("the repository's public/ passes (the built site is checked by the build itself, after vite build)", () => {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
    expect(checkProtectedAssets({ protectedDir: path.join(root, "api/src/data/content-assets"), publicDirs: [path.join(root, "public")] })).toEqual([]);
  });
});
