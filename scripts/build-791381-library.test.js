import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { buildLibrary } from "./build-791381-library.cjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "..", "api", "tests", "fixtures", "book791381");

// End-to-end build against genuine Book791381 files fetched during Discovery: three T-series and all
// six F-series, covering every distinct schema. F06's fixture is the real file with its
// multi-megabyte base64 images stubbed down (structure preserved) so it can live in the repo. Output
// goes to temp dirs here; the real run targets the versioned in-repo data + public asset dirs.
describe("buildLibrary - end to end against real Book791381 files", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "exam-lib-data-"));
  const assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), "exam-lib-assets-"));
  const { catalog, report, assetsWritten } = buildLibrary(FIXTURES_DIR, dataDir, assetsDir);
  const byId = id => report.find(item => item.libraryItemId === id);
  const readItem = id => JSON.parse(fs.readFileSync(path.join(dataDir, "items", id + ".json"), "utf8"));

  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(assetsDir, { recursive: true, force: true });
  });

  it("converts all present files into catalog items, none unsupported", () => {
    expect(catalog.map(item => item.libraryItemId).sort()).toEqual(["F01", "F02", "F03", "F04", "F05", "F06", "T01", "T15", "T30"]);
    expect(report.filter(item => item.conversionStatus === "unsupported")).toHaveLength(0);
  });

  it("separates conversion status from publishing status: only fully-auto items are publishable", () => {
    for (const id of ["T01", "T15", "T30", "F03"]) {
      expect(byId(id).conversionStatus).toBe("ready");
      expect(byId(id).publishable).toBe(true);
    }
    for (const id of ["F01", "F02", "F04", "F05", "F06"]) {
      expect(byId(id).conversionStatus).toBe("needs_review");
      expect(byId(id).publishable).toBe(false);
    }
  });

  it("F05 (no answer key in the source) has every question flagged for manual review with reasons", () => {
    expect(byId("F05").autoGradableCount).toBe(0);
    expect(byId("F05").manualReviewCount).toBe(byId("F05").questionCount);
    expect(byId("F05").manualReviewReasons.length).toBeGreaterThan(0);
  });

  it("externalizes images: no item JSON contains a base64 data: URI, and asset files exist", () => {
    for (const item of catalog) {
      const raw = fs.readFileSync(path.join(dataDir, "items", item.libraryItemId + ".json"), "utf8");
      expect(raw).not.toContain("data:image");
    }
    expect(assetsWritten).toBeGreaterThan(0);
    // F06's diagrams must resolve to real files under the assets dir.
    const f06 = readItem("F06");
    const withImg = f06.examSnapshot.questions.find(q => q.image && q.image.exists);
    const url = withImg.image.assets[0].dataUrl;
    expect(url).toMatch(/^\/exam-library\/assets\/F06\//);
    expect(fs.existsSync(path.join(assetsDir, url.replace("/exam-library/assets/", "")))).toBe(true);
  });

  it("keeps catalog.json small: metadata only, never an examSnapshot", () => {
    const catalogJson = JSON.parse(fs.readFileSync(path.join(dataDir, "catalog.json"), "utf8"));
    expect(catalogJson.every(item => !("examSnapshot" in item))).toBe(true);
  });

  it("carries real catalog metadata from index.html for both T and F series", () => {
    expect(byId("T01") && catalog.find(c => c.libraryItemId === "T01").title).toBe("أساسيات الشبكات");
    expect(catalog.find(c => c.libraryItemId === "F01").category).toBe("final");
  });

  it("is idempotent: a second build yields identical contentHash and asset URLs", () => {
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), "exam-lib-data2-"));
    const a2 = fs.mkdtempSync(path.join(os.tmpdir(), "exam-lib-assets2-"));
    try {
      const second = buildLibrary(FIXTURES_DIR, d2, a2);
      for (const item of catalog) {
        expect(second.catalog.find(x => x.libraryItemId === item.libraryItemId).contentHash).toBe(item.contentHash);
      }
      const url1 = readItem("F06").examSnapshot.questions.find(q => q.image?.exists).image.assets[0].dataUrl;
      const item2 = JSON.parse(fs.readFileSync(path.join(d2, "items", "F06.json"), "utf8"));
      const url2 = item2.examSnapshot.questions.find(q => q.image?.exists).image.assets[0].dataUrl;
      expect(url2).toBe(url1);
    } finally {
      fs.rmSync(d2, { recursive: true, force: true });
      fs.rmSync(a2, { recursive: true, force: true });
    }
  });
});
