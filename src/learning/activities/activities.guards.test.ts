/// <reference types="node" />
// Phase 3A — activity ENGINE security & UX guards (source + CSS assertions).
// The engine must never execute code that comes from content: no eval / new Function, and no dynamic import of a
// path taken from data — a renderer is reached ONLY through a statically-authored `load` thunk in a TRUSTED
// registry that ships EMPTY in production. Source files must be plain text (ZERO U+0000 bytes) so GitHub diffs
// them as code. CSS is stubbed under Vitest's transform, so the stylesheet is read from disk.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { productionActivityRegistry } from "./engine";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel: string) => readFileSync(here(rel), "utf8");
// Scan CODE, not prose: strip block + line comments so the engine's own explanatory text (which necessarily
// mentions eval / new Function / import( to say it forbids them) can't trip these guards.
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const engine = stripComments(read("./engine.ts"));
const host = stripComments(read("./LearningActivityHost.tsx"));
const boundary = stripComments(read("./LearningActivityBoundary.tsx"));
const fallback = stripComments(read("./ActivityFallback.tsx"));
const guided = stripComments(read("./GuidedActivity.tsx"));
const scope = stripComments(read("./NetworkScopeDiagram.tsx"));
const octets = stripComments(read("./IPv4OctetsDiagram.tsx"));
const cidr = stripComments(read("./CidrNetworkHostDiagram.tsx"));
const gateway = stripComments(read("./GatewayFlowAnimation.tsx"));
const builtins = stripComments(read("./builtins.ts"));
const css = read("./activities.css");

const sources = { engine, host, boundary, fallback, guided, builtins, scope, octets, cidr, gateway };

describe("Phase 3A — source files are plain text (ZERO U+0000 bytes)", () => {
  it("engine.ts and LearningActivityHost.tsx contain no NUL byte", () => {
    for (const f of ["./engine.ts", "./LearningActivityHost.tsx"]) {
      const bytes = readFileSync(here(f));
      expect(bytes.includes(0), f).toBe(false);
      expect(read(f).includes("\u0000"), f).toBe(false);
    }
  });
  it("no source file in the activities engine directory contains a NUL or other C0 control byte (except \\t \\n \\r)", () => {
    const dir = here("./");
    for (const name of readdirSync(dir)) {
      if (!/\.(ts|tsx|css)$/.test(name)) continue;
      const text = readFileSync(dir + name, "utf8");
      // eslint-disable-next-line no-control-regex
      expect(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text), name).toBe(false);
    }
  });
  it("the registry index uses nested Maps — no delimiter/separator character joins kind and key", () => {
    expect(engine).toMatch(/new Map<ActivityBlockType, Map<string, RegisteredActivity\[\]>>/);
    expect(engine).not.toMatch(/kind\s*\+\s*["'`]/);   // no string concatenation of kind with a separator
  });
});

describe("Phase 3A — no code execution from content", () => {
  it("uses no eval / new Function anywhere in the engine", () => {
    for (const [name, src] of Object.entries(sources)) {
      expect(src, name).not.toMatch(/\beval\s*\(/);
      expect(src, name).not.toMatch(/new\s+Function\b/);
    }
  });

  it("never builds a dynamic import() from a DATA/variable path (only static string-literal code-split thunks)", () => {
    // A renderer is reached either through the registry\'s statically-authored `import("./Literal")` thunk or not at
    // all. Forbid `import(<variable>)` everywhere (that would be a data path); additionally the host/boundary/
    // fallback/guided reach renderers via the registry and hold NO import() at all.
    for (const [name, src] of Object.entries(sources)) {
      expect(src, name).not.toMatch(/import\s*\((?!\s*["'`])/);
    }
    for (const [name, src] of Object.entries({ host, boundary, fallback, guided })) {
      expect(src, name).not.toMatch(/[^a-zA-Z]import\s*\(/);
    }
  });

  it("never resolves a component by a NAME taken from content (no global component table)", () => {
    expect(host).not.toMatch(/window\s*\[/);
    expect(host).not.toMatch(/globalThis\s*\[/);
  });

  it("never dispatches a built-in by block TYPE alone — built-ins go through the exact-identity registry", () => {
    // no component table keyed by family (the only `[block.type]` lookups left are label maps, not components)
    expect(host).not.toMatch(/\bBUILTIN\b/);
    expect(host).not.toMatch(/Record<[^>]*ActivityBlock\["type"\][^>]*component/);
    expect(host).not.toMatch(/component\s*:\s*GuidedActivity/);
    expect(host).toContain("builtinActivityRegistry.resolve(block)");
    expect(builtins).toContain("createActivityRegistry(");
    expect(builtins).toMatch(/kind:\s*GUIDED_REVEAL_IDENTITY\.kind/);
  });

  it("never uses raw HTML injection", () => {
    for (const [name, src] of Object.entries(sources)) expect(src, name).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("production registry is an exact allowlist", () => {
  it("registers ONLY the exact allowlist (3B, 3E, Units 4–6) and ZERO CLI renderers (no chunk loads at import time)", () => {
    expect(productionActivityRegistry.list()).toEqual([
      { kind: "interactive-diagram", key: "network-scope", versions: [1] },
      { kind: "interactive-diagram", key: "ipv4-octets", versions: [1] },
      { kind: "interactive-diagram", key: "cidr-network-host", versions: [1] },
      { kind: "animation", key: "gateway-flow", versions: [1] },
    ]);
    expect(productionActivityRegistry.list().some(e => /cli|vlan|subnet-calc/i.test(e.key))).toBe(false);
  });
  it("every Units 4–6 renderer is reached only through a static string-literal import thunk", () => {
    for (const name of ["CidrNetworkHostDiagram", "GatewayFlowAnimation"]) expect(engine).toContain(`import("./${name}")`);
  });
  it("the ipv4-octets renderer is reached only through a static string-literal import thunk", () => {
    expect(engine).toContain('import("./IPv4OctetsDiagram")');
  });
});

describe("Phase 3E — ipv4-octets mobile & reduced-motion CSS contract", () => {
  const noSpaces = (s: string) => s.replace(/\s+/g, "");
  const rule = (selector: string) => { const i = css.indexOf(selector); return noSpaces(css.slice(i, css.indexOf("}", i))); };
  it("octet buttons meet the ≥44px touch target, the address row is LTR and wraps (no page overflow)", () => {
    expect(rule(".learning-octets-octet{")).toContain("min-height:44px");
    expect(rule(".learning-octets-row{")).toContain("direction:ltr");
    expect(rule(".learning-octets-row{")).toContain("flex-wrap:wrap");
    expect(css).not.toMatch(/\.learning-octets[^{]*\{[^}]*width:\s*\d{3,}px/);
  });
  it("shows a visible focus ring and disables the transition under reduced motion", () => {
    expect(rule(".learning-octets-octet:focus-visible")).toContain("outline:2px");
    expect(noSpaces(css)).toContain('.learning-octets[data-reduced-motion="true"].learning-octets-octet{transition:none');
  });
});

describe("Phase 3A — single live instance + shared focus utilities (no modal library)", () => {
  it("renders the live activity element exactly ONCE in the host (fullscreen promotes the same surface)", () => {
    // exactly one `<Comp ` element in the host source — never a second copy for fullscreen
    expect(host.match(/<Comp\b/g)?.length).toBe(1);
    expect(host).not.toContain("createPortal");
  });
  it("fullscreen reuses the shared useFocusTrap + usePrefersReducedMotion hooks; no third-party modal", () => {
    expect(host).toContain("../../ui/useFocusTrap");
    expect(host).toContain("usePrefersReducedMotion");
    expect(host).not.toMatch(/from ["'](react-modal|@radix-ui|@headlessui|@mui|focus-trap-react)/);
  });
});

describe("Phase 3A — mobile & reduced-motion CSS contract", () => {
  const noSpaces = (s: string) => s.replace(/\s+/g, "");
  const rule = (selector: string) => { const i = css.indexOf(selector); return noSpaces(css.slice(i, css.indexOf("}", i))); };
  it("shell controls and the guided reveal button meet the ≥44px touch target", () => {
    expect(rule(".learning-activity-ctl")).toContain("min-height:44px");
    expect(rule(".learning-activity-expand")).toContain("min-height:44px");
    expect(rule(".learning-guided-btn")).toContain("min-height:44px");
  });
  it("honors prefers-reduced-motion and disables the guided reveal animation under reduced motion", () => {
    expect(noSpaces(css)).toContain("prefers-reduced-motion:reduce");
    expect(noSpaces(css)).toContain('.learning-guided[data-reduced-motion="true"].learning-guided-step{animation:none');
  });
  it("fullscreen is a fixed overlay of the SAME host surface", () => {
    expect(rule(".learning-activity.is-fullscreen")).toContain("position:fixed");
  });
});
