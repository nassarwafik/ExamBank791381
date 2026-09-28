// Phase 11C — the student rank / stage image-weight guard, proven against the real repository AND against
// throw-away fixtures in which each failure mode is planted on purpose.
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkStudentVisualAssets, VISUAL_BYTE_BUDGETS } from "./check-student-visual-assets.mjs";
import { encodePng, downscale, decodePng, SIZES } from "./generate-student-visual-derivatives.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETS = [{ dir: "src/assets/student-ranks", pattern: /^rank-[a-z]+\.png$/ }];
const FIX_SIZES = [48, 96];

/** A 300×300 RGBA master with a soft gradient and a transparent border (compresses like artwork, not like noise). */
function syntheticMaster() {
  const w = 300, px = Buffer.alloc(w * w * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, inside = x > 20 && y > 20 && x < 280 && y < 280;
    px[i] = x % 256; px[i + 1] = y % 256; px[i + 2] = (x + y) % 256; px[i + 3] = inside ? 255 : 0;
  }
  return { width: w, height: w, px };
}
let tmp = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "visual-guard-"));
  tmp.push(root);
  const dir = path.join(root, "src/assets/student-ranks");
  fs.mkdirSync(path.join(dir, "sized"), { recursive: true });
  const master = syntheticMaster();
  fs.writeFileSync(path.join(dir, "rank-fixture.png"), encodePng(master));
  for (const s of FIX_SIZES) fs.writeFileSync(path.join(dir, "sized", `rank-fixture-${s}.png`), encodePng(downscale(master, s)));
  fs.writeFileSync(path.join(root, "src/consumer.tsx"), 'import { visualImgProps } from "./studentVisualSizes";\n');
  fs.mkdirSync(path.join(root, "dist/assets"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist/assets/rank-fixture-48-AbCd1234.png"), fs.readFileSync(path.join(dir, "sized/rank-fixture-48.png")));
  return root;
}
const run = (root, extra = {}) => checkStudentVisualAssets({ root, dist: path.join(root, "dist"), sets: SETS, sizes: FIX_SIZES, ...extra }).failures;
afterEach(() => { for (const d of tmp) fs.rmSync(d, { recursive: true, force: true }); tmp = []; });

describe("student visual guard — the real repository", () => {
  it("every rank/stage master has all sized derivatives, each square, within budget and pixel-identical to a fresh downscale; no source imports a master", () => {
    const { failures, report } = checkStudentVisualAssets({ root: ROOT });
    expect(failures).toEqual([]);
    expect(report.slice(0, SIZES.length).map(l => l.split(":")[0])).toEqual(SIZES.map(s => `student visuals ${s}px`));
    for (const s of SIZES) expect(report.find(l => l.startsWith(`student visuals ${s}px`))).toMatch(/^student visuals \d+px: 31 files/);
  }, 60000);
  it("budgets are ordered and far below the masters (1254² rank ≈ 1.7–2.1 MB, 512² stage ≈ 0.26–0.38 MB)", () => {
    expect(Object.keys(VISUAL_BYTE_BUDGETS).map(Number)).toEqual(SIZES);
    const b = SIZES.map(s => VISUAL_BYTE_BUDGETS[s]);
    expect([...b].sort((x, y) => x - y)).toEqual(b);
    expect(Math.max(...b)).toBeLessThan(256 * 1024);
  });
});

describe("student visual guard — each failure mode is caught (fixtures)", () => {
  it("a clean fixture passes", () => { expect(run(fixture())).toEqual([]); });
  it("a MISSING derivative fails", () => {
    const root = fixture(); fs.rmSync(path.join(root, "src/assets/student-ranks/sized/rank-fixture-96.png"));
    expect(run(root).join("\n")).toMatch(/missing derivative .*rank-fixture-96\.png/);
  });
  it("an OVERSIZED derivative fails its byte budget (a heavier re-export in the right slot)", () => {
    const root = fixture();
    expect(run(root, { budgets: { 48: 200, 96: 1e9 } }).join("\n")).toMatch(/rank-fixture-48\.png weighs .* over the 0 KB budget for 48 px/);
    // a real-budget case: an incompressible 48 px file (random pixels) is heavier than the 8 KB budget
    let seed = 0x9e3779b9; const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) & 255; };
    const noise = { width: 48, height: 48, px: Buffer.from(Array.from({ length: 48 * 48 * 4 }, rnd)) };        // seeded xorshift: incompressible, deterministic
    fs.writeFileSync(path.join(root, "src/assets/student-ranks/sized/rank-fixture-48.png"), encodePng(noise));
    expect(encodePng(noise).length).toBeGreaterThan(VISUAL_BYTE_BUDGETS[48]);
    expect(run(root, { pixels: false, budgets: VISUAL_BYTE_BUDGETS }).join("\n")).toMatch(/rank-fixture-48\.png weighs .* over the 8 KB budget/);
  });
  it("a derivative with the WRONG dimensions fails (e.g. a bigger rendition dropped into a small slot)", () => {
    const root = fixture(), dir = path.join(root, "src/assets/student-ranks");
    fs.copyFileSync(path.join(dir, "sized/rank-fixture-96.png"), path.join(dir, "sized/rank-fixture-48.png"));
    expect(run(root).join("\n")).toMatch(/rank-fixture-48\.png is 96x96, expected 48x48/);
  });
  it("a STALE derivative (pixels no longer derived from its master) fails", () => {
    const root = fixture(), file = path.join(root, "src/assets/student-ranks/sized/rank-fixture-96.png");
    const img = decodePng(fs.readFileSync(file)); img.px[4 * (48 * 96 + 48)] ^= 0xff;
    fs.writeFileSync(file, encodePng(img));
    expect(run(root).join("\n")).toMatch(/rank-fixture-96\.png no longer matches its master/);
  });
  it("a production source file that IMPORTS a master fails (a consumer pointed back at the giant original)", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "src/consumer.tsx"), 'import art from "./assets/student-ranks/rank-fixture.png";\nexport default art;\n');
    expect(run(root).join("\n")).toMatch(/src\/consumer\.tsx imports an owner master directly/);
    // test files are not production consumers
    fs.renameSync(path.join(root, "src/consumer.tsx"), path.join(root, "src/consumer.test.tsx"));
    expect(run(root)).toEqual([]);
  });
  it("a master EMITTED in dist fails, and so does any rank/stage file heavier than the largest budget", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "dist/assets/rank-fixture-Zx9_Qw12.png"), fs.readFileSync(path.join(root, "src/assets/student-ranks/rank-fixture.png")));
    const f = run(root).join("\n");
    expect(f).toMatch(/dist ships the owner master rank-fixture-Zx9_Qw12\.png/);
    fs.writeFileSync(path.join(root, "dist/assets/stage-07-96-Big00000.png"), Buffer.alloc(VISUAL_BYTE_BUDGETS[256] + 1));
    expect(run(root).join("\n")).toMatch(/dist ships stage-07-96-Big00000\.png at .* above the largest derivative budget/);
  });
});
