// Phase 8E-6 — the visuals registry is a LAZY, statically-authored allowlist: SOURCE + EVALUATION guards.
//
// Content supplies only a `visualId`; the registry maps it to a literal `import("./791381/groups/<module>")` plus a
// literal named export, both written in repo code. These tests prove (a) no static component import remains in the
// registry, (b) no import path is ever built from the visualId (no template string, no glob, no eval), (c) every
// group barrel is a plain list of literal re-exports covering exactly the 122 component files, and (d) merely
// importing the registry / resolving an id evaluates NO visual module — only `load()` / rendering does.
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const evaluated = vi.hoisted(() => ({ ch1: 0, m02: 0 }));
vi.mock("./791381/groups/ch1", async importOriginal => { evaluated.ch1 += 1; return importOriginal(); });
vi.mock("./791381/groups/m02", async importOriginal => { evaluated.m02 += 1; return importOriginal(); });

const ROOT = resolve(process.cwd(), "src/learning/visuals");
const read = (f: string) => readFileSync(resolve(ROOT, f), "utf8");
const registry = read("registry.ts");
// Comments (// and /** … */ JSDoc) may DESCRIBE the design and name `visualId`; the checks below run on CODE lines only.
const codeOnly = (src: string) => src.split("\n").filter(l => { const t = l.trim(); return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")); }).join("\n");
const registryCode = codeOnly(registry);
const GROUP_DIR = resolve(ROOT, "791381/groups");
const groupFiles = readdirSync(GROUP_DIR).filter(f => f.endsWith(".ts")).sort();
const COMPONENT_DIRS = ["chapter1", "batch2", "batch3", "batch4", "batch5", "batch6", "batch7", "batch8", "batch9", "followup"];
const componentFiles = COMPONENT_DIRS.flatMap(d => readdirSync(resolve(ROOT, "791381", d)).filter(f => f.endsWith(".tsx")).map(f => d + "/" + f.replace(/\.tsx$/, "")));

describe("registry source — statically-authored lazy allowlist, never content-driven", () => {
  it("has NO static value import of any visual component (the 122 eager imports are gone)", () => {
    expect(registry.match(/^import\s+\w+\s+from\s+["']\.\/791381\//gm)).toBeNull();
    expect(registry.match(/^import\s*\{[^}]*\}\s*from\s*["']\.\/791381\//gm)).toBeNull();
    // the only imports are React.lazy, the shared stale-chunk recovery and the types
    expect(registry.match(/^import .*$/gm)).toEqual([
      'import { lazy } from "react";',
      'import { lazyWithRetry } from "../../lazyWithRetry";',
      'import type { LearningVisualModule, RegisteredVisual } from "./types";',
    ]);
  });
  it("holds exactly 122 entries, each a literal group import + literal named export, wrapped by the ONE visual() helper", () => {
    const entries = registry.match(/^  visual\("791381\/(?:ch1|m\d{2})\/[a-z0-9-]+", \(\) => import\("\.\/791381\/groups\/(ch1|m\d{2})"\)\.then\(g => \(\{ default: g\.[A-Z]\w+ \}\)\), (?:true|false)\),$/gm) || [];
    expect(entries.length).toBe(122);
    expect((registry.match(/^  visual\(/gm) || []).length).toBe(122);                 // no entry escapes the literal pattern
    expect(registry).toMatch(/const load = lazyWithRetry\(importer, "learning-visual:" \+ id\);/);
    expect(registry).toMatch(/return \{ id, component: lazy\(load\), load, motion \};/);
  });
  it("never builds an import from content: no template-literal import, no non-literal import(), no glob, no eval", () => {
    expect(registryCode).not.toMatch(/import\(`/);
    expect(registryCode).not.toMatch(/import\(\s*[^"'`)]/);                              // import(x), import(path + …)
    expect(registryCode).not.toMatch(/import\(\s*["'][^"']*\$\{/);
    expect(registryCode).not.toMatch(/import\.meta\.glob/);
    expect(registryCode).not.toMatch(/\beval\b|new Function/);
    expect(registryCode).not.toMatch(/visualId/);                                        // the content key never appears in the loader code
    const dynamicTargets = [...registryCode.matchAll(/import\("([^"]+)"\)/g)].map(m => m[1]);
    expect(dynamicTargets.length).toBe(122);
    for (const t of dynamicTargets) expect(t).toMatch(/^\.\/791381\/groups\/(ch1|m\d{2})$/);
  });
  it("every group barrel is a plain list of literal re-exports; together they cover each of the 122 component files exactly once", () => {
    const exported: string[] = [];
    for (const f of groupFiles) {
      const src = readFileSync(resolve(GROUP_DIR, f), "utf8");
      const code = src.split("\n").filter(l => l.trim() && !l.startsWith("//"));
      for (const line of code) {
        const m = line.match(/^export \{ default as ([A-Z]\w+) \} from "\.\.\/(chapter1|batch\d|followup)\/([A-Z]\w+)";$/);
        expect(m, f + ": " + line).not.toBeNull();
        expect(m![1]).toBe(m![3]);
        exported.push(m![2] + "/" + m![3]);
      }
      expect(codeOnly(src)).not.toMatch(/import\(|import\.meta|eval|fetch|http/);
    }
    expect(exported.length).toBe(122);
    expect(new Set(exported).size).toBe(122);
    expect([...exported].sort()).toEqual([...componentFiles].sort());
    expect(groupFiles.length).toBe(27);
    // each registry entry names an export that its group actually provides
    for (const m of registry.matchAll(/import\("\.\/791381\/groups\/(\w+)"\)\.then\(g => \(\{ default: g\.(\w+) \}\)\)/g)) {
      expect(readFileSync(resolve(GROUP_DIR, m[1] + ".ts"), "utf8"), m[0]).toContain("export { default as " + m[2] + " }");
    }
  });
  it("the id namespace decides the group: a 791381/<module>/… id always loads groups/<module>", () => {
    for (const m of registry.matchAll(/visual\("791381\/(\w+)\/[a-z0-9-]+", \(\) => import\("\.\/791381\/groups\/(\w+)"\)/g)) expect(m[2]).toBe(m[1]);
  });
});

describe("registry evaluation — importing the registry or resolving an id evaluates NO visual module", () => {
  it("resolveVisual is synchronous and evaluates nothing; only load() evaluates the ONE group, once", async () => {
    const { resolveVisual, REGISTERED_VISUAL_IDS } = await import("./registry");
    expect(REGISTERED_VISUAL_IDS.length).toBe(122);
    expect(evaluated).toEqual({ ch1: 0, m02: 0 });
    const entry = resolveVisual("791381/ch1/network-connected-devices");
    expect(entry).not.toBeNull(); expect(entry!.motion).toBe(true);
    expect(resolveVisual("791381/ch1/does-not-exist")).toBeNull();
    expect(resolveVisual("../groups/m02" as string)).toBeNull();                          // a path-like key is just an unknown key
    expect(evaluated).toEqual({ ch1: 0, m02: 0 });                                        // still nothing evaluated
    const mod = await entry!.load();
    expect(typeof mod.default).toBe("function");
    expect(evaluated).toEqual({ ch1: 1, m02: 0 });                                        // only the requested group
    await resolveVisual("791381/ch1/shared-printer")!.load();
    expect(evaluated).toEqual({ ch1: 1, m02: 0 });                                        // same group → module cache, no re-evaluation
    await resolveVisual("791381/m02/binary-to-decimal")!.load();
    expect(evaluated).toEqual({ ch1: 1, m02: 1 });
  });
});
