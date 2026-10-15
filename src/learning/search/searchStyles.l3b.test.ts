// Phase 21E L3-B — the search panel's class names are its own. A class the panel renders that some OTHER stylesheet
// also styles is a collision: the shared `.eb-search-field` (page-parts.css: `flex: 1 1 240px`, ui.css under
// `.eb-shell-content`) turned the panel's field into a 240 px tall box inside its column form.
/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(process.cwd(), "src");
const OWN = join(SRC, "learning", "search");
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe("L3-B search panel — no class shared with another stylesheet", () => {
  it("every class the panel renders is styled only by the search stylesheets", () => {
    const tsx = ["LearningSearchPanel.tsx", "LibrarySearch.tsx"].map(f => readFileSync(join(OWN, f), "utf8")).join("\n");
    const classes = [...new Set([...tsx.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)].flatMap(m => (m[1] || m[2]).split(/\s+/)).filter(c => /^eb-(search|lm-search)/.test(c)))];
    expect(classes.length).toBeGreaterThan(10);
    const foreign = walk(SRC).filter(f => f.endsWith(".css") && !f.startsWith(OWN));
    const clashes = foreign.flatMap(f => {
      const css = readFileSync(f, "utf8");
      return classes.filter(c => new RegExp("\\." + c + "(?![\\w-])").test(css)).map(c => `${c} in ${relative(SRC, f)}`);
    });
    expect(clashes).toEqual([]);
  });
});
