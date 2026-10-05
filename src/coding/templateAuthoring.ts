// Phase 19F — pure AUTHORING operations on a coding@3 locked template (no React). The teacher never edits JSON: they paste a full
// program (one locked segment), then turn selected spans into editable gaps (and back). Every operation returns a NEW template in the
// canonical form the validator expects: no empty locked segment, never two adjacent locked segments (merged), gap ids generated
// (`gap1`, `gap2`, … — the smallest unused number, so ids stay stable when other gaps are removed). Nothing here runs code.
import type { CodingTemplateSegment, CodingTemplateV1 } from "../codingTemplate";

const clone = (t: CodingTemplateV1): CodingTemplateV1 => ({ language: t.language, segments: t.segments.map(s => ({ ...s })) });
/** Canonical form: drop empty locked text, merge adjacent locked segments (gaps are kept as they are). */
export function normalizeTemplateSegments(segments: readonly CodingTemplateSegment[]): CodingTemplateSegment[] {
  const out: CodingTemplateSegment[] = [];
  for (const s of segments) {
    if (s.kind === "locked") {
      if (s.text === "") continue;
      const last = out[out.length - 1];
      if (last && last.kind === "locked") { out[out.length - 1] = { kind: "locked", text: last.text + s.text }; continue; }
      out.push({ kind: "locked", text: s.text });
    } else out.push({ kind: "editable", id: s.id, starter: s.starter });
  }
  return out;
}
/** The smallest unused `gapN` id. */
export function nextGapId(t: CodingTemplateV1): string {
  const used = new Set(t.segments.flatMap(s => (s.kind === "editable" ? [s.id] : [])));
  for (let n = 1; ; n++) if (!used.has("gap" + n)) return "gap" + n;
}
/** A whole program as the starting point (one locked segment; the teacher then marks gaps). */
export const templateFromSource = (language: string, source: string): CodingTemplateV1 => ({ language, segments: normalizeTemplateSegments([{ kind: "locked", text: source }]) });
/**
 * Turns [start, end) of locked segment `index` into an editable gap whose starter is the selected text (an empty selection inserts an
 * empty gap at the caret). Returns null when `index` is not a locked segment or the range is outside its text.
 */
export function markGap(t: CodingTemplateV1, index: number, start: number, end: number): CodingTemplateV1 | null {
  const s = t.segments[index];
  if (!s || s.kind !== "locked" || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > s.text.length) return null;
  const gap: CodingTemplateSegment = { kind: "editable", id: nextGapId(t), starter: s.text.slice(start, end) };
  const parts: CodingTemplateSegment[] = [{ kind: "locked", text: s.text.slice(0, start) }, gap, { kind: "locked", text: s.text.slice(end) }];
  return { language: t.language, segments: normalizeTemplateSegments([...t.segments.slice(0, index), ...parts, ...t.segments.slice(index + 1)]) };
}
/** Turns gap `index` back into locked text (its starter), merged with its locked neighbours. */
export function unmarkGap(t: CodingTemplateV1, index: number): CodingTemplateV1 | null {
  const s = t.segments[index];
  if (!s || s.kind !== "editable") return null;
  const next = clone(t);
  next.segments[index] = { kind: "locked", text: s.starter };
  return { language: t.language, segments: normalizeTemplateSegments(next.segments) };
}
/** Edits the text of segment `index` (locked text or a gap's starter). */
export function setSegmentText(t: CodingTemplateV1, index: number, text: string): CodingTemplateV1 {
  const next = clone(t);
  const s = next.segments[index];
  if (!s) return next;
  next.segments[index] = s.kind === "locked" ? { kind: "locked", text } : { kind: "editable", id: s.id, starter: text };
  return { language: t.language, segments: normalizeTemplateSegments(next.segments) };
}
