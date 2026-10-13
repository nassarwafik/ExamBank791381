// Phase 21E.3 review fix 1 — the chunk-recovery build guard checks what the design record says it checks (#40 #41).
// Fail-first on 92f4326: there the guard (1) ignored a name that did not match its import, (2) did not collect single-quoted
// declarations, (3) had no minimum count, (4) never read NEVER_REMAP — and importing the module ran the whole build check.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkChunkRecovery } from "./check-bundle-budget.mjs";

function fixture({ decls, neverRemap = ["index"], chunks }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rf1-guard-"));
  const src = path.join(root, "src"), assets = path.join(root, "dist", "assets");
  fs.mkdirSync(src, { recursive: true }); fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(path.join(src, "recoverableLazy.ts"), `export const NEVER_REMAP: ReadonlySet<string> = new Set([${neverRemap.map(n => JSON.stringify(n)).join(", ")}]);\n`);
  fs.writeFileSync(path.join(src, "registry.tsx"), decls.join("\n") + "\n");
  for (const [file, text] of Object.entries(chunks)) fs.writeFileSync(path.join(assets, file), text);
  return { dist: path.join(root, "dist"), src };
}
const ok = name => [`${name}-abcd1234.js`, "var a=1;export{a as default};"];
const many = n => Array.from({ length: n }, (_, i) => `const C${i} = recoverableLazy("Part${i}", () => import("./parts/Part${i}"));`);
const manyChunks = n => Object.fromEntries([ok("index"), ...Array.from({ length: n }, (_, i) => ok("Part" + i))]);

describe("RF1 — checkChunkRecovery enforces the declaration shape, names, count and deny-list", () => {
  it("a well-formed build of 50 declarations passes", () => {
    const f = fixture({ decls: many(50), chunks: manyChunks(50) });
    expect(checkChunkRecovery(f.dist, f.src).failures).toEqual([]);
  });
  it("a name that is not the imported file's base name fails (the runtime would never recover it)", () => {
    const f = fixture({ decls: [...many(50), `const M = recoverableLazy("Part1", () => import("./student/CategorizationResponse"));`], chunks: manyChunks(50) });
    expect(checkChunkRecovery(f.dist, f.src).failures.join("\n")).toMatch(/must be the imported file's base name/);
  });
  it("single-quoted declarations are collected (a missing chunk is caught)", () => {
    const f = fixture({ decls: [...many(50), `const Q = recoverableLazy('Missing', () => import('./Missing'));`], chunks: manyChunks(50) });
    expect(checkChunkRecovery(f.dist, f.src).failures.join("\n")).toMatch(/"Missing": 0 emitted chunks/);
  });
  it("fewer than the minimum number of declarations fails (a vacuous guard)", () => {
    const f = fixture({ decls: many(3), chunks: manyChunks(3) });
    expect(checkChunkRecovery(f.dist, f.src).failures.join("\n")).toMatch(/only 3 recoverable declarations/);
  });
  it("a NEVER_REMAP name may not be declared recoverable, and every NEVER_REMAP name must exist in the build", () => {
    const f = fixture({ decls: [...many(50), `const S = recoverableLazy("StudentPortal", () => import("./StudentPortal"));`], neverRemap: ["index", "StudentPortal", "Gone"], chunks: { ...manyChunks(50), ...Object.fromEntries([ok("StudentPortal")]) } });
    const failures = checkChunkRecovery(f.dist, f.src).failures.join("\n");
    expect(failures).toMatch(/"StudentPortal" is on NEVER_REMAP/);
    expect(failures).toMatch(/NEVER_REMAP name "Gone" is not a chunk/);
  });
  it("a shared-chunk declaration needs a chunk without default; a default chunk needs recoverableLazy", () => {
    const f = fixture({ decls: [...many(50), `const X = recoverableSharedLazy("CodeStimulusView", () => import("./questionTypes/CodeStimulusView"));`], chunks: { ...manyChunks(50), "CodeStimulusView-abcd1234.js": "var i={},o=1;export{i as n,o as t};" } });
    expect(checkChunkRecovery(f.dist, f.src).failures).toEqual([]);
    const g = fixture({ decls: [...many(50), `const X = recoverableSharedLazy("CodeStimulusView", () => import("./questionTypes/CodeStimulusView"));`], chunks: { ...manyChunks(50), ...Object.fromEntries([ok("CodeStimulusView")]) } });
    expect(checkChunkRecovery(g.dist, g.src).failures.join("\n")).toMatch(/is not a shared chunk/);
  });
});
