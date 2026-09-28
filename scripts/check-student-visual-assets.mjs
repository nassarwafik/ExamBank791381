// Phase 11C — image-weight guard for the student rank / stage artwork (called by check-bundle-budget.mjs after every
// production build, and exercised directly by src/studentVisualAssets.guard.11c.test.ts against fixtures).
//
// The app must ship the small SIZED derivatives only (src/studentVisualSizes.ts), never the multi-megabyte owner
// masters they are made from. This fails when:
//   1. a master has no derivative for one of the shipped sizes (a missing file);
//   2. a derivative is not a size×size PNG, or weighs more than its per-size byte budget;
//   3. a derivative's pixels no longer equal a fresh area-average of its master (a stale / hand-edited file);
//   4. a production source file imports a master directly (a consumer pointed back at the giant original);
//   5. the built dist/assets carries an emitted master, or any rank/stage PNG heavier than the largest budget.
import fs from "node:fs";
import path from "node:path";
import { decodePng, downscale, derivativePlan, SETS, SIZES } from "./generate-student-visual-derivatives.mjs";

/**
 * Per-size byte budgets. Measured maxima of the 31 owner artworks (lossless RGBA8, zlib 9) at Phase 11C:
 *   48 px 5.6 KB · 96 px 19.6 KB · 144 px 41.0 KB · 256 px 114.4 KB.
 * Each budget is that maximum + ~30–45 % headroom for a future (slightly busier) owner artwork — tight enough that a
 * master, a bigger rendition or an unoptimised re-export in the wrong slot fails loudly.
 */
export const VISUAL_BYTE_BUDGETS = { 48: 8 * 1024, 96: 28 * 1024, 144: 56 * 1024, 256: 150 * 1024 };

const MASTER_IMPORT = /["'][^"']*assets\/student-(?:ranks\/rank-[a-z]+|stages\/stage-\d\d)\.png(?:\?[^"']*)?["']/;
const EMITTED_MASTER = /^(?:rank-[a-z]+|stage-\d\d)-[A-Za-z0-9_-]{8}\.png$/;
const EMITTED_VISUAL = /^(?:rank-[a-z]+|stage-\d\d)-.+\.png$/;

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), bytes: b.length };
}

function sourceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "assets" && e.name !== "node_modules") out.push(...sourceFiles(p)); }
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name) && !/\.test\.[a-z]+$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * @param {{ root: string, dist?: string|null, sets?: typeof SETS, sizes?: number[], budgets?: Record<number, number>, pixels?: boolean }} o
 * @returns {{ failures: string[], report: string[] }}
 */
export function checkStudentVisualAssets({ root, dist = null, sets = SETS, sizes = SIZES, budgets = VISUAL_BYTE_BUDGETS, pixels = true }) {
  const failures = [], report = [];
  const plan = derivativePlan(root, sets, sizes);
  if (!plan.length) failures.push("no rank/stage masters found — the derivative plan is empty");
  const totals = Object.fromEntries(sizes.map(s => [s, { n: 0, bytes: 0, max: 0 }]));
  for (const { master, outputs } of plan) {
    const img = pixels ? decodePng(fs.readFileSync(path.join(root, master))) : null;
    for (const { size, path: rel } of outputs) {
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) { failures.push(`missing derivative ${rel} (run node scripts/generate-student-visual-derivatives.mjs)`); continue; }
      const info = pngSize(abs);
      if (!info || info.width !== size || info.height !== size) { failures.push(`${rel} is ${info ? info.width + "x" + info.height : "not a PNG"}, expected ${size}x${size}`); continue; }
      if (info.bytes > budgets[size]) failures.push(`${rel} weighs ${(info.bytes / 1024).toFixed(1)} KB, over the ${(budgets[size] / 1024).toFixed(0)} KB budget for ${size} px`);
      if (img && !decodePng(fs.readFileSync(abs)).px.equals(downscale(img, size).px)) failures.push(`${rel} no longer matches its master ${master} (regenerate the derivatives)`);
      const t = totals[size]; t.n++; t.bytes += info.bytes; t.max = Math.max(t.max, info.bytes);
    }
  }
  for (const s of sizes) report.push(`student visuals ${s}px: ${totals[s].n} files, ${(totals[s].bytes / 1024).toFixed(1)} KB total, largest ${(totals[s].max / 1024).toFixed(1)} KB (budget ${(budgets[s] / 1024).toFixed(0)} KB)`);

  const srcDir = path.join(root, "src");
  if (fs.existsSync(srcDir)) for (const f of sourceFiles(srcDir)) {
    const text = fs.readFileSync(f, "utf8");
    for (const line of text.split("\n")) if (/\b(?:import|from|require|glob)\b/.test(line) && MASTER_IMPORT.test(line)) failures.push(`${path.relative(root, f)} imports an owner master directly (${line.trim().slice(0, 120)}) — use the sized derivatives from src/studentVisualSizes.ts`);
  }

  if (dist) {
    const assets = path.join(dist, "assets");
    const files = fs.existsSync(assets) ? fs.readdirSync(assets) : [];
    const visuals = files.filter(f => EMITTED_VISUAL.test(f));
    const cap = Math.max(...Object.values(budgets));
    for (const f of files.filter(f => EMITTED_MASTER.test(f))) failures.push(`dist ships the owner master ${f} — a consumer imports the original instead of a sized derivative`);
    for (const f of visuals) { const b = fs.statSync(path.join(assets, f)).size; if (b > cap) failures.push(`dist ships ${f} at ${(b / 1024).toFixed(1)} KB, above the largest derivative budget (${(cap / 1024).toFixed(0)} KB)`); }
    const bytes = visuals.reduce((n, f) => n + fs.statSync(path.join(assets, f)).size, 0);
    report.push(`dist rank/stage images: ${visuals.length} files, ${(bytes / 1024).toFixed(1)} KB (no masters)`);
  }
  return { failures, report };
}
