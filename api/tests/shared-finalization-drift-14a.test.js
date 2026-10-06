import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { buildSharedFinalization, listSharedFiles, SHARED_ENTRY, SHARED_OUT_DIR } from "../../scripts/build-shared-finalization.mjs";

// Phase 14A §16 — the committed server build of the finalization chain must be byte-identical to a fresh compile of the
// TypeScript source. Any edit to src/examFinalization.ts (or its chain) without regenerating the server copy fails here,
// so frontend and server can never drift. Fail-first on 6918ce1 (script + generated directory absent).
// Phase 20D.1 — the comparison walks the output directory RECURSIVELY (shared modules may live in src/ subdirectories), so a nested
// generated file can never escape the drift / React checks.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("14A — shared finalization build has no drift", () => {
  it("regenerating into a temp dir produces exactly the committed files", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shared-fin-"));
    try {
      const result = buildSharedFinalization({ outDir: tmp, repoRoot: repo });
      expect(result.files.length).toBeGreaterThan(5);
      const committedDir = path.join(repo, SHARED_OUT_DIR);
      const committed = listSharedFiles(committedDir);
      expect(committed).toEqual(result.files.slice().sort());
      for (const f of committed) {
        expect(fs.readFileSync(path.join(committedDir, f), "utf8"), f).toBe(fs.readFileSync(path.join(tmp, f), "utf8"));
      }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }, 60_000);
  it("the entry is the canonical frontend finalization authority and the build never pulls React / DOM modules", () => {
    expect(SHARED_ENTRY).toBe("src/examFinalization.ts");
    const dir = path.join(repo, SHARED_OUT_DIR);
    for (const f of listSharedFiles(dir)) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      expect(src, f).not.toMatch(/require\("react|require\("\.\/Student|document\.|window\./);
    }
    expect(fs.existsSync(path.join(dir, "examFinalization.js"))).toBe(true);
  });
});
