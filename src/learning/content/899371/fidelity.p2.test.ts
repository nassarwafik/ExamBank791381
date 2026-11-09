// 899371 P2 (docs/enterprise-899371-learning-plan.md §14) — the course IS the owner's Word source. Three independent proofs:
//   1. regeneration: the converter run on the committed source gives exactly the committed module bodies and conversion log
//      (so nothing was edited by hand, and code keeps its exact indentation);
//   2. text, page by page, WITHOUT the converter's classification: the source lines a page names (its ¶ range), after the
//      owner-approved corrections and with the source's Markdown markers read as formatting (decision P2-a), are exactly the page's
//      text lines, in order — no word added, dropped, changed or moved;
//   3. coverage: every source paragraph of the converted range (¶0–830) is on exactly one page; only the printed table of contents
//      (¶5, the Reader's own) and the decorative cover picture (¶2) are not.
// Plus: the source file is the one the owner sent (sha256); only owner-approved corrections exist and each one is in the course.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import manifest from "./manifest";
import conversionLog from "./conversion-log.json";
import { loadBundledModuleContent } from "../bundledModules";
import type { ContentBlock, ContentModule } from "../types";
// @ts-expect-error — plain ESM tools shared with the converter; untyped on purpose.
import { readDocxBody } from "../../../../scripts/lib/docx-source.mjs";
// @ts-expect-error — plain ESM tools shared with the converter; untyped on purpose.
import { convert, CORRECTIONS, FIGURES, SOURCE_FILE } from "../../../../scripts/convert-899371.mjs";

const CID = "899371";
const SOURCE_SHA256 = "22ef25cd0c811be565d23472335d5cbaefa9253f52f29a25f3dfb124d5e97d3f";
/** The corrections the owner approved on 2026-11-09 (plan §12.4). Nothing else may be changed in the book's text. */
const APPROVED = new Set(["F1", "F2", "F6", "F10", "F12", "F14", "F16", "F17", "F30"]);
const NOT_CONTENT = new Set([2, 5]);   // ¶2 the decorative cover picture · ¶5 the printed table of contents
const LAST = 830;

type Item = { kind: "p"; index: number; text: string; runs: { text: string }[]; image: string | null } | { kind: "table"; index: number; rows: string[][] };
type Correction = { finding: string; index: number; find: string; replace: string; cell?: [number, number] };
type Figure = { index: number; headers: string[]; rows: string[][] };
const source = readFileSync(SOURCE_FILE);
const body = readDocxBody(source) as Item[];
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
/** A source line as the reader must show it: the Markdown markers read as formatting (P2-a), a printed bullet as a list item. */
const readLine = (s: string) => norm(s.replace(/\*\*/g, "").replace(/`/g, "").replace(/\\([#!])/g, "$1").replace(/^\s*[•*]\s+/, ""));

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
    if (it.image) { const f = (FIGURES as Record<string, Figure>)[it.image]; for (const row of [f.headers, ...f.rows]) out.push(row.map(norm).join(" | ")); }
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
      expect(pageLines(p.blocks), p.id + " ¶" + from + "–" + to).toEqual(sourceLines(from, to));
      pages++;
    }
    expect(pages).toBe(79);
  }, 30000);

  it("3. coverage: ¶0–830 are each on exactly one page, except the table of contents (¶5) and the cover picture (¶2)", () => {
    const seen = new Map<number, string>();
    for (const m of manifest.modules) for (const l of m.lessons) for (const p of l.pages) {
      const [from, to] = rangeOf(p.source?.sourceNote);
      for (let i = from; i <= to; i++) {
        expect(seen.has(i), "¶" + i + " on " + seen.get(i) + " and " + p.id).toBe(false);
        seen.set(i, p.id);
      }
    }
    const missing = Array.from({ length: LAST + 1 }, (_, i) => i).filter(i => !seen.has(i) && !(body[i].kind === "p" && !(body[i] as { text: string }).text.trim() && !(body[i] as { image: string | null }).image));
    expect(missing).toEqual([5]);
  });

  it("only owner-approved corrections, each visible in the course where it belongs", async () => {
    const all = JSON.stringify(await modules());
    for (const c of CORRECTIONS as Correction[]) {
      expect(APPROVED.has(c.finding), c.finding).toBe(true);
      for (const piece of c.replace.split("\n")) expect(all, c.finding).toContain(JSON.stringify(piece).slice(1, -1).trim());
    }
    expect([...new Set((CORRECTIONS as Correction[]).map(c => c.finding))].sort()).toEqual(["F1", "F2", "F6"]);   // the ones in ¶0–830
  }, 30000);

  it("every Markdown marker read as formatting is listed in the log (decision P2-a), and none is left in the book text", async () => {
    expect(conversionLog.markers.length).toBe(18);
    const text = JSON.stringify(await modules());
    expect(text).not.toMatch(/\*\*|`|\\\\#/);
  }, 30000);
});
