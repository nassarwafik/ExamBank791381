import { describe, it, expect } from "vitest";
import { chunkPages } from "../src/lib/import-chunking.js";

const page = (pageNumber, text, images = []) => ({ pageNumber, text, images });

describe("chunkPages", () => {
  it("returns an empty array for empty input", () => {
    expect(chunkPages([])).toEqual([]);
  });

  it("groups several small pages into one chunk under the page-count limit", () => {
    const pages = [page(1, "a"), page(2, "b"), page(3, "c")];
    const chunks = chunkPages(pages, { maxCharsPerChunk: 1000, maxPagesPerChunk: 6 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageNumbers).toEqual([1, 2, 3]);
    expect(chunks[0].text).toBe("a\n\nb\n\nc");
  });

  it("starts a new chunk once the page-count limit is reached", () => {
    const pages = [page(1, "a"), page(2, "b"), page(3, "c")];
    const chunks = chunkPages(pages, { maxCharsPerChunk: 1000, maxPagesPerChunk: 2 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].pageNumbers).toEqual([1, 2]);
    expect(chunks[1].pageNumbers).toEqual([3]);
  });

  it("starts a new chunk once the character budget would be exceeded", () => {
    const pages = [page(1, "12345"), page(2, "67890"), page(3, "x")];
    const chunks = chunkPages(pages, { maxCharsPerChunk: 10, maxPagesPerChunk: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(10);
    }
  });

  it("splits a single page that alone exceeds the character budget into multiple chunks, all tagged with that page number", () => {
    const hugeText = "x".repeat(25);
    const chunks = chunkPages([page(1, hugeText)], { maxCharsPerChunk: 10, maxPagesPerChunk: 6 });
    expect(chunks.length).toBe(3);
    for (const chunk of chunks) {
      expect(chunk.pageNumbers).toEqual([1]);
    }
    expect(chunks.map(c => c.text).join("")).toBe(hugeText);
  });

  it("assigns sequential chunkIndex values across the whole document", () => {
    const pages = [page(1, "a"), page(2, "b")];
    const chunks = chunkPages(pages, { maxCharsPerChunk: 1, maxPagesPerChunk: 6 });
    expect(chunks.map(c => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  it("carries each page's images into its chunk", () => {
    const pages = [page(1, "a", [{ buffer: Buffer.from("x") }])];
    const chunks = chunkPages(pages);
    expect(chunks[0].images).toHaveLength(1);
  });
});
