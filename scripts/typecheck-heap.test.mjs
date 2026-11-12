// The TypeScript typecheck must run with an explicit Node heap. The project's `tsc -b` needs about as much memory as Node's
// default old-space limit (docs/development/validation-matrix.md §10): at the default it aborts now and then with exit 134
// («JavaScript heap out of memory») and no type error, which fails the Quality Gate for a reason no change caused.
// This check reads the real package.json and fails BY NAME when the typecheck loses its heap setting, when the build goes
// back to a bare `tsc`, or when the compiler entry the script names is not there. Dependency-free: Node fs + Vitest only.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts || {};
const typecheck = String(scripts.typecheck || "");
const build = String(scripts.build || "");

/** The least heap the typecheck may be given, in MB: twice Node's default limit of about 2 GB. */
const MIN_HEAP_MB = 4096;

describe("the typecheck runs with an explicit Node heap", () => {
  it("`npm run typecheck` exists and is `tsc -b` (the project references), nothing else", () => {
    expect(typecheck, "package.json has no `typecheck` script").not.toBe("");
    expect(typecheck).toMatch(/^node --max-old-space-size=\d+ \S+ -b$/);
  });

  it("it gives Node at least " + MIN_HEAP_MB + " MB of heap", () => {
    const m = /--max-old-space-size=(\d+)/.exec(typecheck);
    expect(m, "the typecheck sets no --max-old-space-size").not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(MIN_HEAP_MB);
  });

  it("it names the compiler entry of the installed TypeScript (no shell wrapper, the same command on every platform)", () => {
    const entry = typecheck.split(" ")[2] || "";
    expect(entry).toBe("node_modules/typescript/bin/tsc");
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules/typescript/package.json"), "utf8"));
    expect(pkg.bin.tsc, "the installed TypeScript no longer ships this entry").toBe("./bin/tsc");
  });

  it("the build starts with that typecheck and never calls a bare `tsc`", () => {
    const steps = build.split("&&").map(s => s.trim());
    expect(steps[0]).toBe("npm run typecheck");
    for (const step of steps) expect(step, "a build step calls the compiler without the heap setting").not.toMatch(/(^|\s)tsc(\s|$)/);
  });

  it("no other script runs the compiler at the default heap", () => {
    for (const [name, cmd] of Object.entries(scripts)) {
      if (name === "typecheck") continue;
      expect(String(cmd), "script `" + name + "` calls the compiler directly").not.toMatch(/(^|\s|\/)tsc(\s|$)/);
    }
  });
});
