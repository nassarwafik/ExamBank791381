// AUTO-A6 — «أدوات الكلمات» of «مختبر الآلات», for unit 1 of the book («الكلمات واللغات»). Pure.
//
// The book's definitions (scripts/automata-course/u01.mjs): a subword is a CONSECUTIVE part of the word; a prefix is a subword that is
// a possible beginning, a suffix a possible end. The shortest prefix (and suffix) of any word is the empty word ε, the longest the word
// itself — so both lists hold ε and w. Subwords are listed once each, shortest first, then in the word's own order of appearance.

export const WORD_MAX = 20;

export type WordFacts = {
  symbols: string[];
  length: number;
  /** Each symbol and how many times it appears (#a(w) in the book), in order of first appearance. */
  counts: { symbol: string; count: number }[];
  prefixes: string[];
  suffixes: string[];
  subwords: string[];
  reverse: string;
};

/** The facts of a word (one symbol per code point; spaces ignored), or why not: «ε» (or nothing) is the empty word. */
export function wordFacts(text: string): { ok: true; facts: WordFacts } | { ok: false; message: string } {
  const raw = text.replace(/\s+/g, "");
  const symbols = raw === "ε" || raw === "λ" ? [] : [...raw];
  if (symbols.length > WORD_MAX) return { ok: false, message: "الكلمة " + WORD_MAX + " رمزًا على الأكثر هنا." };
  if (symbols.some(s => s === "ε" || s === "λ")) return { ok: false, message: "ε هي الكلمة الفارغة نفسها، لا رمز داخل كلمة." };

  const counts: { symbol: string; count: number }[] = [];
  for (const s of symbols) { const c = counts.find(x => x.symbol === s); if (c) c.count++; else counts.push({ symbol: s, count: 1 }); }
  const prefixes = Array.from({ length: symbols.length + 1 }, (_, i) => symbols.slice(0, i).join(""));
  const suffixes = Array.from({ length: symbols.length + 1 }, (_, i) => symbols.slice(symbols.length - i).join(""));
  const subwords: string[] = [""];
  for (let len = 1; len <= symbols.length; len++) for (let i = 0; i + len <= symbols.length; i++) {
    const s = symbols.slice(i, i + len).join("");
    if (!subwords.includes(s)) subwords.push(s);
  }
  return { ok: true, facts: { symbols, length: symbols.length, counts, prefixes, suffixes, subwords, reverse: [...symbols].reverse().join("") } };
}
