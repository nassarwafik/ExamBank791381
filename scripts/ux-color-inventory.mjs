#!/usr/bin/env node
// Phase UX-R0 — HARD-CODED COLOUR INVENTORY of the app's stylesheets (src/**/*.css). The UX-R redesign moves every page onto
// the canonical tokens of src/design-tokens.css; a colour written as a literal (#hex, rgb()/rgba(), hsl()/hsla()) instead of a
// var(--eb-*) token does not follow a token change, so it is what each phase has to convert. Comments are stripped first (a
// "was #64748b" note is not a colour). design-tokens.css itself is the one place literals belong and is not counted.
//   node scripts/ux-color-inventory.mjs            → table of the files with literals, largest first, and the total
//   node scripts/ux-color-inventory.mjs --json     → the same as JSON
//   node scripts/ux-color-inventory.mjs --write    → rewrite scripts/ux-color-inventory.baseline.json (the ratchet baseline)
// The ratchet itself is scripts/ux-color-inventory.test.mjs: a file may only go DOWN; a new stylesheet starts at zero.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BASELINE_FILE = path.join(ROOT, "scripts/ux-color-inventory.baseline.json");
/** The token sources: literals are their job (UX-R18a — the dark half of every colour token lives in design-tokens-dark.css). */
export const TOKEN_FILES = new Set(["src/design-tokens.css", "src/design-tokens-dark.css"]);

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const FN = /\b(?:rgba?|hsla?)\(/g;

/**
 * Count colour literals in one stylesheet's text. Only declaration VALUES are read: comments and url(…) are removed, the text
 * is cut at `{` `}` `;`, and a piece that ends at `{` is a selector or an at-rule prelude (so `#add-button{` or `a:hover{` is
 * never a colour); the rest is a declaration whose value follows its first `:`.
 */
export function countColorLiterals(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\([^)]*\)/g, "url()");
  let count = 0;
  for (const m of text.matchAll(/([^{};]*)([{};]|$)/g)) {
    if (m[2] === "{" || !m[1].includes(":")) continue;
    const value = m[1].slice(m[1].indexOf(":") + 1);
    count += (value.match(HEX) || []).length + (value.match(FN) || []).length;
  }
  return count;
}

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile() && entry.name.endsWith(".css")) acc.push(full);
  }
  return acc;
}

/** { "src/x.css": count } for every stylesheet under src/ (zero counts included), sorted by path. */
export function inventory(root = ROOT) {
  const files = walk(path.join(root, "src"), []).map(f => path.relative(root, f).split(path.sep).join("/")).filter(f => !TOKEN_FILES.has(f)).sort();
  return Object.fromEntries(files.map(f => [f, countColorLiterals(fs.readFileSync(path.join(root, f), "utf8"))]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inv = inventory();
  const nonZero = Object.entries(inv).filter(([, n]) => n > 0);
  const total = nonZero.reduce((s, [, n]) => s + n, 0);
  if (process.argv.includes("--write")) {
    const baseline = { description: "UX-R colour ratchet: hard-coded colour literals per stylesheet (scripts/ux-color-inventory.mjs). A count may only go down; regenerate with --write after a phase converts literals to tokens.", total, files: Object.fromEntries(nonZero) };
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2) + "\n");
    console.log("baseline written: " + nonZero.length + " files, " + total + " literals → " + path.relative(ROOT, BASELINE_FILE));
  } else if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ total, files: Object.fromEntries(nonZero) }, null, 2));
  } else {
    for (const [f, n] of nonZero.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) console.log(String(n).padStart(5) + "  " + f);
    console.log(String(total).padStart(5) + "  total in " + nonZero.length + " of " + Object.keys(inv).length + " stylesheets");
  }
}
