// BOOK LOCK — «أسس علم الحاسوب» (899371) is the owner's book: enrichment (exercises, «نحلّ معًا», visuals) may be ADDED around
// it in later phases; the converted book itself must never change (docs/enterprise-899371-learning-plan.md, decision Q1). This
// suite compares the authored content with the committed lock (book-lock.json, written by `node scripts/book-lock.mjs --write
// 899371`). Rewriting the lock means the book changed: an owner decision (a new conversion batch or an approved correction),
// never a way to get green. fidelity.p2.test.ts proves the locked content equal to the Word source.
//
//   1. every locked book page still exists with the identical fingerprint (identity, titles, order, source and every
//      origin-"book" block with all its fields, in order);
//   2. each module's book pages keep their order (no book page moved, dropped or inserted);
//   3. a page that is not in the lock carries no book block (new pages are enrichment-only, e.g. «تدريبات الوحدة»);
//   4. every drawing of the book (the chapter-10 matrices, P3-c) keeps its exact bytes, and none is added or removed.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import manifest from "./manifest";
import lock from "./book-lock.json";
import { loadBundledModuleContent } from "../bundledModules";
import type { ContentModule } from "../types";
// @ts-expect-error — plain ESM helper shared with the lock writer (scripts/book-lock.mjs); untyped on purpose.
import { buildBookLock, bookPageFingerprint, bookBlocks, sha256 } from "../../../../scripts/book-lock.mjs";

const CID = "899371";
const assetDir = fileURLToPath(new URL("../../../../api/src/data/content-assets/learning/" + CID + "/", import.meta.url));
type Lock = { courseId: string; pages: Record<string, string>; order: Record<string, string[]>; assets: Record<string, string> };
const LOCK = lock as Lock;

async function loadAll(): Promise<ContentModule[]> {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out;
}
const sorted = <T extends { order: number }>(xs: T[]) => [...xs].sort((a, b) => a.order - b.order);

describe("899371 — book lock (the converted book never changes)", () => {
  it("the lock covers the whole book: modules m00–m12 and every one of their 194 pages", () => {
    expect(LOCK.courseId).toBe(CID);
    expect(Object.keys(LOCK.order)).toEqual(manifest.modules.map(m => m.id));
    expect(Object.keys(LOCK.pages)).toHaveLength(194);
  });

  it("every locked book page is unchanged — same identity, titles, order, source and book blocks", async () => {
    const changed: string[] = [];
    const seen = new Set<string>();
    for (const m of await loadAll()) for (const l of m.lessons) for (const p of l.pages) {
      const fp = bookPageFingerprint(m, l, p);
      if (fp === null) continue;
      seen.add(p.id);
      if (LOCK.pages[p.id] !== fp) changed.push(p.id);
    }
    expect(changed, "book pages whose content differs from the printed booklet").toEqual([]);
    expect(Object.keys(LOCK.pages).filter(id => !seen.has(id)), "locked book pages that disappeared").toEqual([]);
  }, 30000);

  it("each module keeps its book pages in the printed order", async () => {
    const lockNow = buildBookLock(CID, await loadAll(), LOCK.assets) as Lock;
    expect(lockNow.order).toEqual(LOCK.order);
  }, 30000);

  it("a page outside the lock holds no book block (added pages are enrichment only)", async () => {
    const offenders: string[] = [];
    for (const m of await loadAll()) for (const l of sorted(m.lessons)) for (const p of sorted(l.pages)) {
      if (!(p.id in LOCK.pages) && (bookBlocks(p) as unknown[]).length > 0) offenders.push(p.id);
    }
    expect(offenders).toEqual([]);
  }, 30000);

  it("every drawing keeps its exact bytes, and none is added or removed", () => {
    const files = readdirSync(assetDir).sort();
    expect(files).toHaveLength(7);
    expect(files).toEqual(Object.keys(LOCK.assets));
    for (const f of files) expect(sha256(readFileSync(assetDir + f)), f).toBe(LOCK.assets[f]);
  });
});
