/// <reference types="node" />
// Phase 21E.1 (slice 2) — design-system guard for audit finding F3: an element hidden with the HTML `hidden` attribute must really be
// hidden. The UA rule `[hidden]{display:none}` has the specificity of ONE attribute selector, so any author rule `.x{display:flex}` on
// the same element wins and the "hidden" element shows (the student exam's details panel stayed open, `hidden` on it, until 21E.1
// slice 2). Rule: when a class carried by an element that uses `hidden` has a non-`none` display rule (outside @media print), the CSS
// must also carry a `.class[hidden]{display:none}` that wins: unconditional or in the same at-rule, and at least as specific. Class
// names are read from literal and expression classNames alike; an element whose classes cannot be read is reported. Reads the
// sources from disk (never the DOM), so it fails on the first new case.
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

/** The class names a `className` can produce: the literal value, or every string literal / static template part inside an
 *  expression (`{"a " + (x ? "b" : "")}`, `{`a ${x}`}`, `{cx("a", "b")}`). `null` when an expression yields no literal at all. */
function classNamesOf(tag: string): string[] | null {
  const attr = /\bclassName\s*=\s*/.exec(tag);
  if (!attr) return [];
  const rest = tag.slice(attr.index + attr[0].length);
  if (rest[0] === '"') return rest.slice(1, rest.indexOf('"', 1)).split(/\s+/).filter(Boolean);
  if (rest[0] !== "{") return null;
  let depth = 0, end = 0;
  for (; end < rest.length; end++) { if (rest[end] === "{") depth++; else if (rest[end] === "}" && --depth === 0) break; }
  const expr = rest.slice(1, end);
  const literals = [...expr.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)].map(x => (x[1] ?? x[2] ?? x[3] ?? "").replace(/\$\{[^}]*\}/g, " "));
  const names = literals.join(" ").split(/\s+/).filter(t => /^-?[A-Za-z_][\w-]*$/.test(t));
  return names.length ? names : null;
}

/** Opening JSX tags (brace-aware, so `=>` / `>` inside `{…}` never ends a tag) that carry a real `hidden` attribute. */
function hiddenElements(code: string): { tag: string; classes: string[] | null }[] {
  const out: { tag: string; classes: string[] | null }[] = [];
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
    out.push({ tag: tag.slice(0, 120), classes: classNamesOf(tag) });
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
/** (ids, classes + attributes + pseudo-classes) — enough to compare `.x{…}` / `.a .x{…}` with `.x[hidden]{…}`. */
const specificity = (selector: string): [number, number] => {
  const sel = selector.replace(/::[\w-]+/g, "");
  return [(sel.match(/#[\w-]+/g) || []).length, (sel.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length];
};
const atLeast = (a: [number, number], b: [number, number]) => a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]);

describe("21E.1 slice 2 — F3: the `hidden` attribute is never overridden by a class display rule", () => {
  const tsx = files(SRC, /\.tsx$/).map(f => ({ file: rel(f), els: hiddenElements(readFileSync(f, "utf8")) })).filter(f => f.els.length);
  const rules = files(SRC, /\.css$/).flatMap(f => cssRules(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")).map(r => ({ ...r, file: rel(f) })));

  it("scans the sources (sanity: the known hidden-attribute disclosures are found)", () => {
    const classes = tsx.flatMap(f => f.els.flatMap(e => e.classes ?? []));
    for (const c of ["iex-details-panel", "eb-notif-panel", "xp-chart-table-wrap", "eb-chart-card-table"]) expect(classes).toContain(c);
    expect(rules.length).toBeGreaterThan(1000);
  });

  it("every `hidden` element's classes can be read (a className expression with no literal class is reported, never skipped)", () => {
    const unresolved = tsx.flatMap(f => f.els.filter(e => e.classes === null).map(e => f.file + ": " + e.tag));
    expect(unresolved).toEqual([]);
  });

  it("every class with a non-none display rule on a `hidden` element has a `.class[hidden]{display:none}` that wins (unconditional or in the same at-rule, at least as specific)", () => {
    const offenders: string[] = [];
    const overrides = (cls: string) => rules.flatMap(r => (isPrint(r) || displayOf(r.body) !== "none") ? [] : r.selectors.filter(s => { const c = lastCompound(s); return hasClass(c, cls) && /\[hidden\]/.test(c); }).map(s => ({ s, media: r.media.join(" | ") })));
    for (const f of tsx) for (const el of f.els) for (const cls of el.classes ?? []) {
      for (const r of rules) {
        if (isPrint(r) || displayOf(r.body) === null || displayOf(r.body) === "none") continue;
        for (const sel of r.selectors) {
          const c = lastCompound(sel);
          if (!hasClass(c, cls) || /\[hidden\]/.test(c)) continue;
          const media = r.media.join(" | ");
          const ok = overrides(cls).some(o => (o.media === "" || o.media === media) && atLeast(specificity(o.s), specificity(sel)));
          if (!ok) offenders.push(`${f.file}: .${cls} is shown by ${r.file} «${sel}{display:${displayOf(r.body)}}»${media ? " in " + media : ""} but no unconditional / same-at-rule, at-least-as-specific .${cls}[hidden]{display:none} beats it`);
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it("the guard itself catches the bug class (expression className, scoped show rule, weaker override)", () => {
    const fake = hiddenElements('<div className={"eb-panel" + (wide ? " is-wide" : "")} hidden={!open}>x</div><p className={cx(a)} hidden />');
    expect(fake.map(e => e.classes)).toEqual([["eb-panel", "is-wide"], null]);
    const css = cssRules(".a .eb-panel{display:flex} @media (max-width: 600px){ .eb-panel{display:grid} } .eb-panel[hidden]{display:none}");
    const show = css.filter(r => displayOf(r.body) !== "none");
    expect(show.map(r => r.selectors[0] + " @ " + r.media.join(""))).toEqual([".a .eb-panel @ ", ".eb-panel @ @media (max-width: 600px)"]);
    expect(atLeast(specificity(".eb-panel[hidden]"), specificity(".a .eb-panel"))).toBe(true);
    expect(atLeast(specificity(".eb-panel[hidden]"), specificity(".a .b .eb-panel"))).toBe(false);
  });

  it("the student exam's details panel in particular (the finding itself)", () => {
    const css = readFileSync(join(SRC, "studentexam-pro.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.iex-details-panel\{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.iex-details-panel\[hidden\]\{\s*display:\s*none;?\s*\}/);
  });
});
