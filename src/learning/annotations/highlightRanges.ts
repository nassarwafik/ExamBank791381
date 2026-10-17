// Phase L.5 — locating a highlighted quote in the rendered page, and painting it WITHOUT touching React's DOM: the CSS Custom
// Highlight API (`CSS.highlights` + `Highlight`) styles live Ranges through `::highlight(...)`, so the page tree is never
// mutated. Where the API is missing the page simply shows no paint (the «ملاحظاتي» panel still lists every highlight).

/** The registry name styled by `::highlight(eb-reader-highlight)` in annotations.css. */
export const HIGHLIGHT_NAME = "eb-reader-highlight";

const BLOCK = new Set(["P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "TD", "TH", "TR", "TABLE", "SECTION", "ARTICLE", "FIGURE", "FIGCAPTION", "BLOCKQUOTE", "PRE", "DT", "DD", "DL", "HEADER", "FOOTER", "ASIDE", "DETAILS", "SUMMARY"]);
/** Text the student cannot select as reading content (controls, form fields) never takes part in a match. */
const SKIP = "button, input, textarea, select, [aria-hidden='true'], script, style";

function blockOf(node: Node, root: Node): Node {
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) if (BLOCK.has(el.tagName)) return el;
  return root;
}

/**
 * The first Range in `root` whose text equals `quote` once whitespace runs are collapsed to one space (a selection's own line
 * breaks and the boundaries between blocks count as a space). Null when the quote is not on the page.
 */
export function findQuoteRange(root: Node, quote: string): Range | null {
  const wanted = quote.replace(/\s+/g, " ").trim();
  const doc = root.ownerDocument ?? (root as Document);
  if (!wanted || typeof doc?.createRange !== "function") return null;
  const chars: string[] = [];
  const at: Array<[Text, number]> = [];
  let space = true, lastBlock: Node | null = null;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    if (text.parentElement?.closest(SKIP)) continue;
    const block = blockOf(text, root);
    if (lastBlock && block !== lastBlock && !space) { chars.push(" "); at.push([text, 0]); space = true; }
    lastBlock = block;
    const data = text.data;
    for (let i = 0; i < data.length; i++) {
      if (/\s/.test(data[i])) { if (!space) { chars.push(" "); at.push([text, i]); space = true; } }
      else { chars.push(data[i]); at.push([text, i]); space = false; }
    }
  }
  const index = chars.join("").indexOf(wanted);
  if (index < 0) return null;
  const [startNode, startOffset] = at[index];
  const [endNode, endOffset] = at[index + wanted.length - 1];
  const range = doc.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset + 1);
  return range;
}

type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void };

/** Paint `quotes` inside `root`; returns how many were found and an undo. A no-op where the Highlight API is missing. */
export function paintHighlights(root: Node | null, quotes: readonly string[]): { found: number; clear: () => void } {
  const registry = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights;
  const HighlightCtor = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  const ranges = root ? quotes.map(q => findQuoteRange(root, q)).filter((r): r is Range => r !== null) : [];
  if (!registry || typeof HighlightCtor !== "function") return { found: ranges.length, clear: () => {} };
  if (ranges.length) registry.set(HIGHLIGHT_NAME, new HighlightCtor(...ranges)); else registry.delete(HIGHLIGHT_NAME);
  return { found: ranges.length, clear: () => registry.delete(HIGHLIGHT_NAME) };
}
