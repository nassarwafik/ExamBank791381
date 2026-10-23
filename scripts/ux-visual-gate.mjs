#!/usr/bin/env node
// UX-R19b — the visual regression gate (docs/enterprise-ux-r0-redesign-foundation.md R19b). It captures the pull request's build
// and its base's build with ONE harness (this checkout's scripts/capture-visual-baseline-ux-r.mjs, so a harness change never
// shows up as a page change), compares every page and scene pixel by pixel (a channel moving by more than 12 levels, or a size
// change), and fails on:
//   - a change the pull request does not declare in docs/ux-r/visual-changes.json (an entry its base's manifest does not have);
//   - a harness check (reached, no horizontal overflow, no page error) that fails on the head but passes on the base;
//   - an invalid manifest entry, or a capture missing on either side.
// A change the PR did not declare is re-captured on both builds once before it is reported, so a one-off capture flake is
// recorded as a note, not a failure; a change that shows again is real. The before, after and diff images of every change
// (declared or not) are written under GATE_OUT/changes for the reviewer.
//   BASE_DIST=../base/dist HEAD_DIST=dist BASE_MANIFEST=../base/docs/ux-r/visual-changes.json VIEWPORTS=desktop \
//   PLAYWRIGHT_CORE_DIR=/tmp/pw CHROMIUM_PATH=/usr/bin/google-chrome node scripts/ux-visual-gate.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng, compareImages, validateManifest, declaredByPr, isDeclared, evaluate, VIEWPORTS, THRESHOLD } from "./ux-visual-gate-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;
const baseDist = path.resolve(env.BASE_DIST || ""), headDist = path.resolve(env.HEAD_DIST || path.join(root, "dist"));
const headManifestPath = path.resolve(env.HEAD_MANIFEST || path.join(root, "docs", "ux-r", "visual-changes.json"));
const baseManifestPath = env.BASE_MANIFEST ? path.resolve(env.BASE_MANIFEST) : "";
const viewports = (env.VIEWPORTS || VIEWPORTS.join(",")).split(",").map(s => s.trim()).filter(Boolean);
const out = path.resolve(env.GATE_OUT || path.join(root, ".harness-visual"));
const captures = path.join(out, "captures");
if (!env.BASE_DIST) { console.error("BASE_DIST (the base's production build) is required"); process.exit(2); }
for (const [name, dir] of [["BASE_DIST", baseDist], ["HEAD_DIST", headDist]]) if (!fs.existsSync(path.join(dir, "index.html"))) { console.error("no production build for " + name + " at " + dir); process.exit(2); }
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw new Error(file + ": " + e.message); } };

/** One harness run; returns { checks: { "viewport/page": { ok, detail } }, pages: Set<id> }. */
function capture(label, dist, pages = []) {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "capture-visual-baseline-ux-r.mjs")], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { ...env, DIST: dist, LABEL: label, HARNESS_OUT: captures, VIEWPORTS: viewports.join(","), PAGES: pages.join(","), PART: "pages", AUDIT: "", PRINT_PAGES: "" },
  });
  if (r.status !== 0 && r.status !== 1) { console.error(r.stdout + r.stderr); throw new Error("the capture harness failed (" + label + ", exit " + r.status + ")"); }
  const checks = {};
  for (const m of (r.stdout || "").matchAll(/^CHECK (PASS|FAIL) (\S+) — (.*)$/gm)) checks[m[2]] = { ok: m[1] === "PASS", detail: m[3] };
  const record = readJson(path.join(captures, label, "record.json"), { pages: {} });
  console.log(label + ": " + Object.values(checks).filter(c => c.ok).length + "/" + Object.keys(checks).length + " captures clean");
  return { checks, pages: new Set(Object.keys(record.pages)) };
}

function compareRun(baseLabel, headLabel, ids) {
  const results = [];
  for (const viewport of viewports) for (const page of ids) {
    const a = path.join(captures, baseLabel, viewport, page + ".png"), b = path.join(captures, headLabel, viewport, page + ".png");
    if (!fs.existsSync(a) || !fs.existsSync(b)) { results.push({ page, viewport, missing: (fs.existsSync(a) ? "" : "no base capture ") + (fs.existsSync(b) ? "" : "no head capture") }); continue; }
    const c = compareImages(decodePng(fs.readFileSync(a)), decodePng(fs.readFileSync(b)));
    results.push({ page, viewport, files: [a, b], ...c });
  }
  return results;
}

const base = capture("base", baseDist), head = capture("head", headDist);
// A harness run that captured nothing must not pass by comparing nothing.
if (!base.pages.size || !head.pages.size) { console.error("a capture run recorded no page (base " + base.pages.size + ", head " + head.pages.size + ")"); process.exit(2); }
const ids = [...new Set([...base.pages, ...head.pages])].sort();
const headManifest = readJson(headManifestPath, { version: 1, changes: [] }), baseManifest = baseManifestPath ? readJson(baseManifestPath, { version: 1, changes: [] }) : { version: 1, changes: [] };
const { errors: manifestErrors } = validateManifest(headManifest, new Set(ids));
const declared = declaredByPr(baseManifest, headManifest);
let results = compareRun("base", "head", ids);

// A change the PR did not declare is captured once more on both builds; only a change that shows again is reported.
const suspects = results.filter(r => r.changed && !isDeclared(declared, r.page, r.viewport));
if (suspects.length) {
  const again = [...new Set(suspects.map(r => r.page))];
  capture("base-confirm", baseDist, again); capture("head-confirm", headDist, again);
  const confirm = new Map(compareRun("base-confirm", "head-confirm", again).map(r => [r.viewport + "/" + r.page, r]));
  results = results.map(r => (suspects.includes(r) ? { ...r, confirmed: confirm.get(r.viewport + "/" + r.page)?.changed !== false } : r));
}

const verdict = evaluate({ results, declared, manifestErrors, checks: { base: base.checks, head: head.checks } });

// The reviewer's evidence: before, after and diff of every change, declared or not.
for (const r of results.filter(x => x.changed && x.files)) {
  const dir = path.join(out, "changes", r.viewport); fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(r.files[0], path.join(dir, r.page + "-before.png")); fs.copyFileSync(r.files[1], path.join(dir, r.page + "-after.png"));
  fs.writeFileSync(path.join(dir, r.page + "-diff.png"), encodePng(r.diff));
}
const slim = results.map(({ diff, files, ...r }) => r);
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ viewports, threshold: THRESHOLD, compared: results.length, declared, verdict: { ok: verdict.ok, failures: verdict.failures, notes: verdict.notes }, results: slim }, null, 2));

const line = f => "- **" + f.kind + "** " + (f.id || (f.viewport + "/" + f.page)) + " — " + f.detail;
const summary = [
  "## UX visual regression gate — " + viewports.join(", "),
  "",
  results.length + " captures compared (a change: a channel moves by more than " + THRESHOLD + " levels, or the size changes).",
  "Changed and declared: " + verdict.declaredChanges.length + " · failures: " + verdict.failures.length + " · notes: " + verdict.notes.length + ".",
  "",
  ...(verdict.failures.length ? ["### Failures", ...verdict.failures.map(line), "", "Declare an intended change in `docs/ux-r/visual-changes.json` (page, viewport, reason); the images are in the `changes/` artifact.", ""] : []),
  ...(verdict.declaredChanges.length ? ["### Declared changes", ...verdict.declaredChanges.map(r => "- " + r.viewport + "/" + r.page + " — " + (r.sameSize ? r.changedPixels + " px" : r.before.join("×") + " → " + r.after.join("×"))), ""] : []),
  ...(verdict.notes.length ? ["### Notes", ...verdict.notes.map(line), ""] : []),
].join("\n");
fs.writeFileSync(path.join(out, "summary.md"), summary + "\n");
if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summary + "\n");
console.log(summary);
console.log("GATE " + (verdict.ok ? "PASS" : "FAIL"));
process.exit(verdict.ok ? 0 : 1);
