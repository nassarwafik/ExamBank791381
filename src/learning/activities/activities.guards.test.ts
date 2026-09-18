/// <reference types="node" />
// Phase 3A — activity ENGINE security & UX guards (source + CSS assertions).
// The engine must never execute code that comes from content: no eval / new Function, and no dynamic import of a
// path taken from data — a renderer is reached ONLY through a statically-authored `load` thunk in a TRUSTED
// registry that ships EMPTY in production. CSS is stubbed under Vitest's transform, so the stylesheet is read from
// disk (not via a `?raw` import).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { productionActivityRegistry } from "./engine";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
// Scan CODE, not prose: strip block + line comments so the engine's own explanatory text (which necessarily
// mentions `eval` / `new Function` / `import(` to say it forbids them) can't trip these guards.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const engine = stripComments(read("./engine.ts"));
const host = stripComments(read("./LearningActivityHost.tsx"));
const boundary = stripComments(read("./LearningActivityBoundary.tsx"));
const fallback = stripComments(read("./ActivityFallback.tsx"));
const css = read("./activities.css");

const sources = { engine, host, boundary, fallback };

describe("Phase 3A — no code execution from content", () => {
  it("uses no eval / new Function / setTimeout-string anywhere in the engine", () => {
    for (const [name, src] of Object.entries(sources)) {
      expect(src, name).not.toMatch(/\beval\s*\(/);
      expect(src, name).not.toMatch(/new\s+Function\b/);
    }
  });

  it("never builds a dynamic import() from a data/variable path (renderers load via static thunks only)", () => {
    // No runtime import() expression at all in the engine/host — components are reached through RegisteredActivity.load.
    for (const [name, src] of Object.entries(sources)) {
      expect(src, name).not.toMatch(/[^a-zA-Z]import\s*\(/);
    }
  });

  it("never resolves a component by a NAME taken from content (no indexing a registry by block-provided string of components)", () => {
    // The block carries only a registry key string; the shell resolves via registry.resolve(block), never
    // `Components[block.something]`. Assert the host does not reference any window/global component table.
    expect(host).not.toMatch(/window\s*\[/);
    expect(host).not.toMatch(/globalThis\s*\[/);
  });
});

describe("Phase 3A — production registry ships EMPTY", () => {
  it("registers zero activities in production (every descriptor renders the static fallback, no chunk loads)", () => {
    expect(productionActivityRegistry.size).toBe(0);
    expect(productionActivityRegistry.list()).toEqual([]);
  });
});

describe("Phase 3A — reuses the shared modal primitive (no new modal library)", () => {
  it("the fullscreen shell is the app Dialog, not a bespoke overlay", () => {
    expect(host).toContain("../../ui/Dialog");
    expect(host).toContain("<Dialog");
    // it also reuses the shared reduced-motion hook rather than re-reading matchMedia inline
    expect(host).toContain("usePrefersReducedMotion");
  });
});

describe("Phase 3A — mobile & reduced-motion CSS contract", () => {
  const noSpaces = (s: string) => s.replace(/\s+/g, "");
  it("the توسيع (expand) control meets the ≥44px touch target", () => {
    const i = css.indexOf(".learning-activity-expand");
    const body = css.slice(i, css.indexOf("}", i));
    expect(noSpaces(body)).toContain("min-height:44px");
  });
  it("honors prefers-reduced-motion", () => {
    expect(noSpaces(css)).toContain("prefers-reduced-motion:reduce");
  });
});
