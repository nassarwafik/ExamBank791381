#!/usr/bin/env node
// Tadris+ P5-C (risk S7, owner decision D10) — build gate: the course drawings and the exam library's question images are PROTECTED
// content (api/src/data/content-assets/, served only through signed /api/content-asset URLs). This check fails the build when one
// of them could be served as a public static file again:
//   • a file under public/learning-assets/ or public/exam-library/assets/ (their former public homes), or the same in the built site;
//   • ANY file in public/ or the built site whose bytes equal a protected file (re-added under another name or folder).
// Runs after `vite build` (package.json "build"); also run by its test on fixture trees.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FORMER_HOMES = ["learning-assets", path.join("exam-library", "assets")];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else if (e.isFile()) out.push(p);
  }
  return out;
}
const sha = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/** Returns the list of issues (empty = the protected images are not public). */
export function checkProtectedAssets({ protectedDir, publicDirs }) {
  const issues = [];
  const protectedFiles = walk(protectedDir);
  if (!protectedFiles.length) issues.push("no protected images found under " + protectedDir + " (moved or deleted?)");
  const bySha = new Map(protectedFiles.map(f => [sha(f), path.relative(protectedDir, f)]));
  for (const dir of publicDirs) {
    for (const home of FORMER_HOMES) for (const f of walk(path.join(dir, home))) issues.push("public file in a protected location: " + path.relative(process.cwd(), f));
    for (const f of walk(dir)) {
      const hit = bySha.get(sha(f));
      if (hit) issues.push("public file " + path.relative(process.cwd(), f) + " is the protected image " + hit);
    }
  }
  return issues;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const issues = checkProtectedAssets({
    protectedDir: path.join(root, "api", "src", "data", "content-assets"),
    publicDirs: [path.join(root, "public"), path.join(root, "dist")]
  });
  if (issues.length) {
    console.error("protected assets check FAILED:\n  " + issues.join("\n  "));
    process.exit(1);
  }
  console.log("protected assets check passed (course drawings and library images are not public)");
}
