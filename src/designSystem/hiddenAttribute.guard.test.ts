/// <reference types="node" />
// Phase 21E.1 (slice 2) — design-system guard for audit finding F3: an element hidden with the HTML `hidden` attribute must really be
// hidden. The UA rule `[hidden]{display:none}` has the specificity of ONE attribute selector, so any author rule `.x{display:flex}` on
// the same element wins and the "hidden" element shows (the student exam's details panel stayed open, `hidden` on it, until 21E.1
// slice 2). Rule: when a class carried by an element that uses `hidden` has a non-`none` display rule (outside @media print), the CSS
// must also carry `.class[hidden]{display:none}`. Reads the sources from disk (never the DOM), so it fails on the first new case.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
function files(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== "node_modules") files(full, ext, out); }
    else if (ext.test(name) && !/\.test\.|\.spec\./.test(name)) out.push(full);
  }
  return out;
}
const rel = (f: string) => relative(SRC, f).replace(/\\/g, "/");

/** Opening JSX tags (brace-aware, so `=>` / `>` inside `{…}` never ends a tag) that carry a real `hidden` attribute. */
function hiddenElements(code: string): { tag: string; classes: string[] }[] {
  const out: { tag: string; classes: string[] }[] = [];
  const open = /<([a-zA-Z][\w.]*)(?=[\s>/])/g;
  for (let m = open.exec(code); m; m = open.exec(code)) {
    let depth = 0, i = m.index + m[0].length, quote = "";
    for (; i < code.length; i++) {
      const c = code[i];
      if (quote) { if (c === quote && code[i - 1] !== "\\") quote = ""; continue; }
      if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const tag = code.slice(m.index, i + 1);
    const attrs = tag.replace(/\{[^{}]*\}/g, m2 => m2.replace(/\bhidden\b/g, "_"));          // ignore `hidden` inside expressions
    if (!/(^|[\s])hidden(?=[\s=/>])/.test(attrs)) continue;
    const cls = /\bclassName\s*=\s*(?:"([^"]*)"|\{\s*"([^"]*)"\s*\})/.exec(tag);
    out.push({ tag: tag.slice(0, 120), classes: (cls ? (cls[1] ?? cls[2]) : "").split(/\s+/).filter(Boolean) });
  }
  return out;
}

type Rule = { selectors: string[]; body: string; media: string[] };
/** A small brace-matching CSS walker: rules with the at-rule stack they live in (comments stripped, @keyframes skipped). */
function cssRules(css: string, media: string[] = [], out: Rule[] = []): Rule[] {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    for (; j < css.length && depth; j++) { if (css[j] === "{") depth++; else if (css[j] === "}") depth--; }
    const body = css.slice(open + 1, j - 1);
    if (prelude.startsWith("@")) { if (!/^@(-\w+-)?keyframes/.test(prelude)) cssRules(body, [...media, prelude], out); }
    else out.push({ selectors: prelude.split(",").map(s => s.trim()).filter(Boolean), body, media });
    i = j;
  }
  return out;
}
const lastCompound = (selector: string) => selector.split(/\s+|>|\+|~/).filter(Boolean).pop() ?? "";
const hasClass = (compound: string, cls: string) => new RegExp("\\." + cls.replace(/[-]/g, "\\-") + "(?![\\w-])").test(compound);
const displayOf = (body: string) => /(?:^|[;\s{])display\s*:\s*([^;!}]+)/.exec(body)?.[1].trim() ?? null;
const isPrint = (r: Rule) => r.media.some(m => /\bprint\b/.test(m));

describe("21E.1 slice 2 — F3: the `hidden` attribute is never overridden by a class display rule", () => {
  const tsx = files(SRC, /\.tsx$/).map(f => ({ file: rel(f), els: hiddenElements(readFileSync(f, "utf8")) })).filter(f => f.els.length);
  const rules = files(SRC, /\.css$/).flatMap(f => cssRules(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")).map(r => ({ ...r, file: rel(f) })));

  it("scans the sources (sanity: the known hidden-attribute disclosures are found)", () => {
    const classes = tsx.flatMap(f => f.els.flatMap(e => e.classes));
    for (const c of ["iex-details-panel", "eb-notif-panel", "xp-chart-table-wrap", "eb-chart-card-table"]) expect(classes).toContain(c);
    expect(rules.length).toBeGreaterThan(1000);
  });

  it("every class with a non-none display rule on a `hidden` element also has `.class[hidden]{display:none}`", () => {
    const offenders: string[] = [];
    for (const f of tsx) for (const el of f.els) for (const cls of el.classes) {
      const shows = rules.filter(r => !isPrint(r) && r.selectors.some(s => { const c = lastCompound(s); return hasClass(c, cls) && !/\[hidden\]/.test(c); })
        && displayOf(r.body) !== null && displayOf(r.body) !== "none");
      if (!shows.length) continue;
      const overridden = rules.some(r => !isPrint(r) && r.selectors.some(s => { const c = lastCompound(s); return hasClass(c, cls) && /\[hidden\]/.test(c); }) && displayOf(r.body) === "none");
      if (!overridden) offenders.push(`${f.file}: .${cls} is shown by ${shows.map(r => r.file + " «" + r.selectors.join(", ") + "{display:" + displayOf(r.body) + "}»").join("; ")} but has no .${cls}[hidden]{display:none}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the student exam's details panel in particular (the finding itself)", () => {
    const css = readFileSync(join(SRC, "studentexam-pro.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.iex-details-panel\{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.iex-details-panel\[hidden\]\{\s*display:\s*none;?\s*\}/);
  });
});
