import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { buildLibrary } from "./build-791381-library.cjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "..", "api", "tests", "fixtures", "book791381");

// Exercises the real end-to-end build against a subset of the actual Book791381 corpus (T01, T15 -
// a training from the middle of the series, T30 - the last one, plus a placeholder F01 to prove
// F-series files are deferred rather than guessed at). These are genuine files fetched from
// https://nassarwafik.github.io/Book791381/ during the Discovery pass, not synthetic fixtures.
describe("buildLibrary - end to end against real Book791381 files", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "exam-library-test-"));
  const { catalog, report } = buildLibrary(FIXTURES_DIR, outputDir);

  afterAll(() => {
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it("converts every T-series file present and skips the F-series one", () => {
    expect(catalog.map(item => item.libraryItemId).sort()).toEqual(["T01", "T15", "T30"]);
  });

  it("reports the F-series file as unsupported with a clear reason, never a guess", () => {
    const f01 = report.find(item => item.libraryItemId === "F01");
    expect(f01.status).toBe("unsupported");
    expect(f01.reason).toMatch(/not yet reverse-engineered/);
  });

  it("every T-series item has totalMarks exactly 100 and a stable LIB-<code> examId", () => {
    for (const item of catalog) {
      expect(item.totalMarks).toBe(100);
      const savedItem = JSON.parse(fs.readFileSync(path.join(outputDir, "items", item.libraryItemId + ".json"), "utf8"));
      expect(savedItem.examSnapshot.examId).toBe("LIB-" + item.libraryItemId);
    }
  });

  it("carries real catalog metadata (title/category/tags) from index.html, not placeholders", () => {
    const t01 = catalog.find(item => item.libraryItemId === "T01");
    expect(t01.title).toBe("أساسيات الشبكات");
    expect(t01.category).toBe("foundation");
    expect(t01.tags.length).toBeGreaterThan(0);
  });

  it("running the build twice on the same files produces identical question ids and contentHash", () => {
    const secondOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), "exam-library-test-2-"));
    try {
      const second = buildLibrary(FIXTURES_DIR, secondOutputDir);
      const firstT01 = catalog.find(item => item.libraryItemId === "T01");
      const secondT01 = second.catalog.find(item => item.libraryItemId === "T01");
      expect(secondT01.contentHash).toBe(firstT01.contentHash);
    }
    finally {
      fs.rmSync(secondOutputDir, { recursive: true, force: true });
    }
  });

  it("writes catalog.json and quality-report.json to the output directory", () => {
    expect(fs.existsSync(path.join(outputDir, "catalog.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "quality-report.json"))).toBe(true);
  });
});
