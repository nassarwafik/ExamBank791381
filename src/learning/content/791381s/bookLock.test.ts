// BOOK LOCK — the summary booklet 791381s is the printed booklet the students own and annotate. Enrichment (visuals,
// practice, simulations, end-of-unit exercises) may be ADDED around it; the book itself must never change. This suite
// compares the authored content with the committed lock (book-lock.json, written by `node scripts/book-lock.mjs --write
// 791381s`). Rewriting the lock means the book changed: that is an owner decision, never a way to get green.
//
//   1. every locked book page still exists with the identical fingerprint (identity, titles, order, source and every
//      origin-"book" block with all its fields, in order);
//   2. each module's book pages keep their order (no book page moved, dropped or inserted);
//   3. a page that is not in the lock carries no book block (new pages are enrichment-only, e.g. «تدريبات الوحدة»);
//   4. every booklet drawing (PNG crop) keeps its exact bytes, and no drawing is added or removed.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import manifest from "./manifest";
import lock from "./book-lock.json";
import { loadBundledModuleContent } from "../bundledModules";
import type { ContentModule } from "../types";
// @ts-expect-error — plain ESM helper shared with the lock writer (scripts/book-lock.mjs); untyped on purpose.
import { buildBookLock, bookPageFingerprint, bookBlocks, sha256 } from "../../../../scripts/book-lock.mjs";

const CID = "791381s";
const assetDir = fileURLToPath(new URL("../../../../public/learning-assets/" + CID + "/", import.meta.url));
type Lock = { courseId: string; pages: Record<string, string>; order: Record<string, string[]>; assets: Record<string, string> };
const LOCK = lock as Lock;

async function loadAll(): Promise<ContentModule[]> {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out;
}
const sorted = <T extends { order: number }>(xs: T[]) => [...xs].sort((a, b) => a.order - b.order);

describe("791381s — book lock (the printed booklet never changes)", () => {
  it("the lock covers the whole booklet: all 37 modules and every one of its 202 pages", () => {
    expect(LOCK.courseId).toBe(CID);
    expect(Object.keys(LOCK.order)).toEqual(manifest.modules.map(m => m.id));
    expect(Object.keys(LOCK.pages)).toHaveLength(202);
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

  it("every booklet drawing keeps its exact bytes, and none is added or removed", () => {
    const files = readdirSync(assetDir).sort();
    expect(files).toEqual(Object.keys(LOCK.assets));
    for (const f of files) expect(sha256(readFileSync(assetDir + f)), f).toBe(LOCK.assets[f]);
  });
});
