#!/usr/bin/env node
// DS-A2 — the right-to-left check of the course's text:  node scripts/ds-course/check-direction.mjs [unit]
// The reader shows running text right-to-left. Code, arithmetic, arrows between values and comma-separated numbers written
// OUTSIDE a `…` run are visibly reordered there («13 → 15» reads backwards). This lists every such piece of text so the
// author can put it in backticks. It reads the built blocks: rich-text spans without a direction, and plain strings with
// their left-to-right isolates removed. Exit 1 when anything is found.
import { buildCourse } from "../build-ds-course.mjs";
import { UNITS } from "./index.mjs";
import { LRI, PDI } from "./dsl.mjs";

const only = process.argv[2] === undefined ? null : Number(process.argv[2]);
const units = only === null ? UNITS : UNITS.filter(u => u.n === only);
const RULES = [
  [/[A-Za-z_]\w*\s*\(/, "a call or a name followed by ("],
  [/[;<>]|==|!=|&&|\|\|/, "a code operator"],
  [/[A-Za-z_]\w*\.[A-Za-z_]/, "member access a.b"],
  [/[0-9A-Za-z\])]\s*(→|←|->|=>)\s*[0-9A-Za-z[(]/, "an arrow between values"],
  [/\d\s*[+*/=]\s*-?\d|\d\s+-\s+\d/, "arithmetic between numbers"],
  [/\d\s*,\s+-?\d/, "numbers separated by a comma and a space"],
  [/[A-Za-z0-9]\s*=\s*[A-Za-z0-9["']/, "an assignment / equality"],
  [/\[[^\]\u0600-\u06FF]*[A-Za-z0-9][^\]\u0600-\u06FF]*\]/, "a bracketed list"],
];
const strip = s => s.replace(new RegExp(LRI + "[^" + PDI + "]*" + PDI, "g"), " ");
const SKIP = new Set(["id", "type", "origin", "code", "language", "dir", "config", "fallback", "simulationType", "interactionType", "guidedType", "visualId", "kind", "variant", "answer", "answers", "bank", "key", "options_key", "columnDirs", "capabilities", "source"]);
let found = 0;
function scan(v, path, block) {
  if (typeof v === "string") {
    const text = strip(v);
    const hit = RULES.find(([re]) => re.test(text));
    if (hit) { found++; console.log(block.id + " " + path + " — " + hit[1] + ":\n    " + v.replaceAll(LRI, "⟦").replaceAll(PDI, "⟧").slice(0, 220)); }
    return;
  }
  if (Array.isArray(v)) return v.forEach((x, i) => scan(x, path + "[" + i + "]", block));
  if (!v || typeof v !== "object") return;
  if ("text" in v && v.dir === "ltr") return;                              // a left-to-right span
  for (const [k, x] of Object.entries(v)) {
    if (SKIP.has(k) || k.startsWith("_")) continue;
    if (k === "rows" && Array.isArray(v.columnDirs)) { x.forEach((row, r) => row.forEach((c, j) => { if (v.columnDirs[j] !== "ltr") scan(c, path + ".rows[" + r + "][" + j + "]", block); })); continue; }
    scan(x, path + "." + k, block);
  }
}
const { raw } = buildCourse(units);
for (const r of raw) {
  const b = r.block;
  if (b.type === "code") continue;
  if (b.type === "practice" && b.question?.kind === "wordBank") { scan({ prompt: b.question.prompt, segments: b.question.segments.filter(s => typeof s === "string"), feedback: b.question.feedback }, "question", b); continue; }
  scan({ ...b, title: b.title, description: b.description }, "", b);
  if (b.config?.given) scan(b.config.given.replace(/`[^`]*`/g, " "), ".config.given", b);
  if (b.config?.panels) b.config.panels.forEach((p, i) => { if (p.label) scan(p.label, ".config.panels[" + i + "].label", b); });
}
console.log(found ? found + " piece(s) of text would be reordered: put the code / values in `backticks`" : "direction check: every code run is marked left-to-right");
process.exit(found ? 1 : 0);
