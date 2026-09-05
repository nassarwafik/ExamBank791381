import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { buildLibrary } from "./build-791381-library.cjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "..", "api", "tests", "fixtures", "book791381");

// Exercises the real end-to-end build against genuine Book791381 files fetched during the Discovery
// pass: three T-series (T01, T15 from the middle, T30 last) covering the uniform training format,
// plus all six F-series exams covering every distinct F schema. F06's fixture is the real file with
// its multi-megabyte base64 images stubbed down (structure preserved) so it can live in the repo.
describe("buildLibrary - end to end against real Book791381 files", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "exam-library-test-"));
  const { catalog, report } = buildLibrary(FIXTURES_DIR, outputDir);
  const byId = id => report.find(item => item.libraryItemId === id);

  afterAll(() => {
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it("converts all present T-series and F-series files into catalog items, none unsupported", () => {
    expect(catalog.map(item => item.libraryItemId).sort()).toEqual(["F01", "F02", "F03", "F04", "F05", "F06", "T01", "T15", "T30"]);
    expect(report.filter(item => item.status === "unsupported")).toHaveLength(0);
  });

  it("marks the uniform T-series files ready with all questions auto-gradable", () => {
    for (const id of ["T01", "T15", "T30"]) {
      expect(byId(id).status).toBe("ready");
      expect(byId(id).manualReviewCount).toBe(0);
    }
  });

  it("marks F03 (clean JSON exam) ready and the rest needs_review, honestly reflecting manual-review shares", () => {
    expect(byId("F03").status).toBe("ready");
    for (const id of ["F01", "F02", "F04", "F05", "F06"]) {
      expect(byId(id).status).toBe("needs_review");
    }
  });

  it("F05 (no answer key in the source at all) has every question flagged for manual review", () => {
    expect(byId("F05").autoGradableCount).toBe(0);
    expect(byId("F05").manualReviewCount).toBe(byId("F05").questionCount);
  });

  it("auto-grades the bulk of the multiple-choice F exams (F01/F02/F04/F06)", () => {
    for (const id of ["F01", "F02", "F04", "F06"]) {
      expect(byId(id).autoGradableCount).toBeGreaterThan(0);
    }
  });

  it("gives every item a stable LIB-<code> examId and records manual-review reasons", () => {
    for (const item of catalog) {
      const saved = JSON.parse(fs.readFileSync(path.join(outputDir, "items", item.libraryItemId + ".json"), "utf8"));
      expect(saved.examSnapshot.examId).toBe("LIB-" + item.libraryItemId);
    }
    // A needs_review file must explain why, not just report a count.
    expect(byId("F05").manualReviewReasons.length).toBeGreaterThan(0);
  });

  it("carries real catalog metadata (title/category/tags) from index.html", () => {
    const t01 = catalog.find(item => item.libraryItemId === "T01");
    expect(t01.title).toBe("أساسيات الشبكات");
    expect(t01.category).toBe("foundation");
    expect(t01.tags.length).toBeGreaterThan(0);
  });

  it("running the build twice on the same files produces identical contentHash (idempotent)", () => {
    const secondOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), "exam-library-test-2-"));
    try {
      const second = buildLibrary(FIXTURES_DIR, secondOutputDir);
      for (const item of catalog) {
        const other = second.catalog.find(x => x.libraryItemId === item.libraryItemId);
        expect(other.contentHash).toBe(item.contentHash);
      }
    }
    finally {
      fs.rmSync(secondOutputDir, { recursive: true, force: true });
    }
  });

  it("does not leak the internal requiresManualReview flag into stored ExamQuestions", () => {
    const f01 = JSON.parse(fs.readFileSync(path.join(outputDir, "items", "F01.json"), "utf8"));
    expect(f01.examSnapshot.questions.every(q => !("requiresManualReview" in q))).toBe(true);
  });
});
