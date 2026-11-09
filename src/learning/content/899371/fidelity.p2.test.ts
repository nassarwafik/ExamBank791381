// 899371 P2 + P3 (docs/enterprise-899371-learning-plan.md §14, §15) — the course IS the owner's Word source, the whole book
// (¶0–3046). Three independent proofs:
//   1. regeneration: the converter run on the committed source gives exactly the committed module bodies and conversion log
//      (so nothing was edited by hand, and code keeps its exact indentation);
//   2. text, page by page, WITHOUT the converter's classification: the source lines a page names (its ¶ range), after the
//      owner-approved corrections and with the source's Markdown markers read as formatting (decision P2-a), are exactly the page's
//      text lines, in order — no word added, dropped, changed or moved;
//   3. coverage: every source paragraph (¶0–3046) is on exactly one page; only the decorative cover picture (¶2) and the decorative
//      rule (¶1174) are not, and the printed table of contents (¶5) only lends chapter 9 its opener title (P3-a).
// A question figure is either a table it was transcribed to (P2-c) or the book's own drawing, byte for byte (P3-c).
// Plus: the source file is the one the owner sent (sha256); only owner-approved corrections exist and each one is in the course.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import manifest from "./manifest";
import conversionLog from "./conversion-log.json";
import { loadBundledModuleContent } from "../bundledModules";
import type { ContentBlock, ContentModule } from "../types";
// @ts-expect-error — plain ESM tools shared with the converter; untyped on purpose.
import { readDocxBody, readZipEntry } from "../../../../scripts/lib/docx-source.mjs";
// @ts-expect-error — plain ESM tools shared with the converter; untyped on purpose.
import { convert, CORRECTIONS, FIGURES, SOURCE_FILE } from "../../../../scripts/convert-899371.mjs";

const CID = "899371";
const SOURCE_SHA256 = "22ef25cd0c811be565d23472335d5cbaefa9253f52f29a25f3dfb124d5e97d3f";
/** The corrections the owner approved on 2026-11-09 (plan §12.4). Nothing else may be changed in the book's text. */
const APPROVED = new Set(["F1", "F2", "F6", "F10", "F12", "F14", "F16", "F17", "F30"]);
const NOT_CONTENT = new Set([2, 5, 1174]);   // ¶2 the cover picture · ¶5 the printed table of contents · ¶1174 a decorative rule
const LAST = 3046;

type Item = { kind: "p"; index: number; text: string; runs: { text: string }[]; image: string | null } | { kind: "table"; index: number; rows: string[][] };
type Correction = { finding: string; index: number; find: string; replace: string; cell?: [number, number] };
type Figure = { index: number; headers: string[]; rows: string[][]; drawing?: boolean; alt?: string };
const source = readFileSync(SOURCE_FILE);
const body = readDocxBody(source) as Item[];
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
/** A source line as the reader must show it: the Markdown markers read as formatting (P2-a), a printed bullet as a list item. */
const readLine = (s: string) => norm(s.replace(/\*\*/g, "").replace(/`/g, "").replace(/\\([#![\]])/g, "$1").replace(/^\s*[•*]\s+/, ""));
/** A drawing is identified by the hash of its exact bytes in the Word source (the protected file is named by it). */
const drawingHash = (image: string) => createHash("sha256").update(readZipEntry(source, "word/media/" + image)).digest("hex").slice(0, 16);
const drawingToken = (image: string) => "⟨drawing " + drawingHash(image) + "⟩";
const tocEntries = new Set((body[5] as { rows: string[][] }).rows.flat().map(norm));

async function modules(): Promise<ContentModule[]> {
  const out: ContentModule[] = [];
  for (const m of manifest.modules) out.push(await loadBundledModuleContent(CID, m.id));
  return out;
}
const rangeOf = (note: string | undefined) => {
  const m = /^¶(\d+)(?:–(\d+))?$/.exec(note ?? "");
  if (!m) throw new Error("no ¶ range in source note " + note);
  return [Number(m[1]), Number(m[2] ?? m[1])] as const;
};
/** The source paragraph as the owner approved it (corrections applied on the whole text, as Word splits runs). */
function approved(it: Item): Item {
  const fixes = (CORRECTIONS as Correction[]).filter(c => c.index === it.index);
  if (!fixes.length) return it;
  const copy = JSON.parse(JSON.stringify(it)) as Item;
  for (const c of fixes) {
    if (copy.kind === "table") { const [r, k] = c.cell!; copy.rows[r][k] = copy.rows[r][k].replace(c.find, c.replace); }
    else copy.text = copy.text.replace(c.find, c.replace);
  }
  return copy;
}
/** The expected text lines of a source range. */
function sourceLines(from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) {
    if (NOT_CONTENT.has(i)) continue;
    const it = approved(body[i]);
    if (it.kind === "table") { for (const row of it.rows) out.push(row.map(norm).join(" | ")); continue; }
    if (it.image) {
      const f = (FIGURES as Record<string, Figure>)[it.image];
      if (f.drawing) out.push(drawingToken(it.image));
      else for (const row of [f.headers, ...f.rows]) out.push(row.map(norm).join(" | "));
    }
    for (const line of it.text.split("\n")) { const l = readLine(line); if (l) out.push(l); }
  }
  return out;
}
/** The text lines a page shows, block by block. */
function pageLines(blocks: ContentBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "text") out.push(norm(b.spans.map(s => s.text).join("")));
    else if (b.type === "heading") out.push(norm(b.text));
    else if (b.type === "list") for (const item of b.items) out.push(norm(item.text.map(s => s.text).join("")));
    else if (b.type === "code") for (const line of b.code.split("\n")) { if (line.trim()) out.push(norm(line)); }
    else if (b.type === "table") for (const row of [b.headers, ...b.rows]) out.push(row.map(norm).join(" | "));
    else if (b.type === "unit-opener") out.push(norm(b.title));
    else if (b.type === "diagram") out.push("⟨drawing " + (b.src ?? "").split("/").pop()!.replace(/\.png$/, "") + "⟩");
    else throw new Error("a book page holds a " + b.type + " block");
  }
  return out.filter(Boolean);
}

describe("899371 — the course is the owner's Word source", () => {
  it("the source is the file the owner sent", () => {
    expect(createHash("sha256").update(source).digest("hex")).toBe(SOURCE_SHA256);
  });

  it("1. regeneration: the converter on the source gives exactly the committed bodies and conversion log", async () => {
    const { modules: generated, log, applied } = convert(body);
    expect(JSON.parse(JSON.stringify(await modules()))).toEqual(JSON.parse(JSON.stringify(generated)));
    expect(conversionLog).toEqual({ markers: log, corrections: applied.map((c: Correction) => ({ finding: c.finding, index: c.index, find: c.find, replace: c.replace })) });
  }, 30000);

  it("2. every page shows exactly its source lines, in order (corrections applied, Markdown markers read as formatting)", async () => {
    let pages = 0;
    for (const m of await modules()) for (const l of m.lessons) for (const p of l.pages) {
      const [from, to] = rangeOf(p.source?.sourceNote);
      if (p.layout === "opener" && from === 5) {
        // chapter 9 prints no title line: its opener carries one of the table of contents' own entries
        const [title] = pageLines(p.blocks);
        expect(tocEntries.has(title), p.id + " «" + title + "» is a table-of-contents entry").toBe(true);
      } else expect(pageLines(p.blocks), p.id + " ¶" + from + "–" + to).toEqual(sourceLines(from, to));
      pages++;
    }
    expect(pages).toBe(194);
  }, 30000);

  it("3. coverage: ¶0–3046 are each on exactly one page, except the cover picture (¶2) and the decorative rule (¶1174)", () => {
    const seen = new Map<number, string>();
    for (const m of manifest.modules) for (const l of m.lessons) for (const p of l.pages) {
      const [from, to] = rangeOf(p.source?.sourceNote);
      for (let i = from; i <= to; i++) {
        expect(seen.has(i), "¶" + i + " on " + seen.get(i) + " and " + p.id).toBe(false);
        seen.set(i, p.id);
      }
    }
    expect(body.length).toBe(LAST + 1);
    const missing = Array.from({ length: LAST + 1 }, (_, i) => i).filter(i => !seen.has(i) && !(body[i].kind === "p" && !(body[i] as { text: string }).text.trim() && !(body[i] as { image: string | null }).image));
    expect(missing).toEqual([]);   // ¶2 and ¶1174 sit inside their pages' ranges and are skipped there (NOT_CONTENT)
    expect(seen.get(5)).toBe("899371-m09-l00-p01");
  });

  it("only owner-approved corrections, each visible in the course where it belongs", async () => {
    const all = JSON.stringify(await modules());
    for (const c of CORRECTIONS as Correction[]) {
      expect(APPROVED.has(c.finding), c.finding).toBe(true);
      for (const piece of c.replace.split("\n")) expect(all, c.finding).toContain(JSON.stringify(piece).slice(1, -1).trim());
      if (c.replace === "") expect(all, c.finding + " removed").not.toContain(JSON.stringify(c.find.trim()).slice(1, -1));
    }
    // every approved correction with a fixed text is applied (F9 and F15 wait for the owner's data and are not corrections)
    expect([...new Set((CORRECTIONS as Correction[]).map(c => c.finding))].sort()).toEqual(["F1", "F10", "F12", "F14", "F16", "F17", "F2", "F30", "F6"]);
  }, 30000);

  it("every Markdown marker read as formatting is listed in the log (decision P2-a), and none is left in the book text", async () => {
    expect(conversionLog.markers.length).toBe(51);
    const text = JSON.stringify(await modules());
    expect(text).not.toMatch(/\*\*|`|\\\\[#[\]]/);
  }, 30000);

  it("every drawing is the source image byte for byte, protected, with an alt naming its values", async () => {
    const drawings = (await modules()).flatMap(m => m.lessons.flatMap(l => l.pages.flatMap(p => p.blocks))).filter(b => b.type === "diagram") as Extract<ContentBlock, { type: "diagram" }>[];
    const figures = Object.entries(FIGURES as Record<string, Figure>).filter(([, f]) => f.drawing);
    expect(drawings.map(d => d.src)).toEqual(figures.map(([img]) => "/learning-assets/899371/" + drawingHash(img) + ".png"));
    for (const d of drawings) {
      const file = readFileSync(new URL("../../../../api/src/data/content-assets/learning/899371/" + d.src!.split("/").pop(), import.meta.url));
      expect(createHash("sha256").update(file).digest("hex").slice(0, 16), d.src).toBe(d.src!.split("/").pop()!.slice(0, 16));
      expect(d.alt.length, d.id).toBeGreaterThan(80);
      expect(d.alt, d.id).toMatch(/الصف 0: /);
    }
  }, 30000);
});
