// 899371 P1 (docs/enterprise-899371-learning-plan.md §13) — the Reader's C# highlighter: a small, PURE tokenizer (no library, no
// regex over the whole source, no HTML). It only splits the book's code into consecutive TEXT tokens and names each one's kind;
// the renderer shows every token as a text child of a <span>. Invariants (csharpTokens.p1.test.ts):
//   • fidelity — the tokens joined back are the input, byte for byte, for ANY input (broken or hostile code included);
//   • every token is non-empty and of one of CSHARP_TOKEN_KINDS;
//   • a string or char literal never runs past the end of its line, so one missing quote cannot recolour the rest of a program.
// It is a presentation aid for the book's beginner C#, not a C# lexer: anything it does not recognise is "plain" text.

export const CSHARP_TOKEN_KINDS = ["keyword", "type", "string", "char", "number", "comment", "plain"] as const;
export type CSharpTokenKind = (typeof CSHARP_TOKEN_KINDS)[number];
export type CSharpToken = { text: string; kind: CSharpTokenKind };

const KEYWORDS = new Set([
  "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char", "checked", "class", "const", "continue", "decimal",
  "default", "do", "double", "else", "enum", "false", "finally", "float", "for", "foreach", "if", "in", "int", "interface",
  "internal", "is", "long", "namespace", "new", "null", "object", "out", "override", "params", "private", "protected", "public",
  "readonly", "ref", "return", "sealed", "short", "static", "string", "struct", "switch", "this", "throw", "true", "try", "typeof",
  "uint", "ulong", "using", "var", "virtual", "void", "while",
]);
/** The library types the book's programs use (Console, Math, Random…), shown as types. */
const TYPES = new Set([
  "Console", "Math", "Random", "String", "Char", "Int32", "Double", "Boolean", "Array", "List", "Exception", "ArgumentException",
  "FormatException", "InvalidOperationException", "IndexOutOfRangeException", "NullReferenceException", "DateTime", "Convert",
]);

const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

/** The end (exclusive) of a quoted literal starting at `start` (the opening quote at `open`), never past the end of the line. */
function quotedEnd(src: string, open: number, quote: string, verbatim: boolean): number {
  let i = open + 1;
  while (i < src.length && src[i] !== "\n") {
    const c = src[i];
    if (verbatim) {
      if (c === quote) { if (src[i + 1] === quote) { i += 2; continue; } return i + 1; }
    } else {
      if (c === "\\" && i + 1 < src.length && src[i + 1] !== "\n") { i += 2; continue; }
      if (c === quote) return i + 1;
    }
    i++;
  }
  return i;   // unterminated: stop at the end of the line (the newline itself stays outside the literal)
}

/** Split `src` into consecutive text tokens. Pure; never throws; the tokens' texts concatenate to `src`. */
export function tokenizeCSharp(src: string): CSharpToken[] {
  const out: CSharpToken[] = [];
  const push = (text: string, kind: CSharpTokenKind) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind === "plain") last.text += text;
    else out.push({ text, kind });
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === "/" && n === "/") {
      let j = i; while (j < src.length && src[j] !== "\n") j++;
      push(src.slice(i, j), "comment"); i = j; continue;
    }
    if (c === "/" && n === "*") {
      const close = src.indexOf("*/", i + 2);
      const j = close < 0 ? src.length : close + 2;
      push(src.slice(i, j), "comment"); i = j; continue;
    }
    if (c === "\"" || ((c === "@" || c === "$") && n === "\"") || ((c === "@" || c === "$") && (n === "@" || n === "$") && src[i + 2] === "\"")) {
      const prefix = c === "\"" ? 0 : n === "\"" ? 1 : 2;
      const verbatim = src.slice(i, i + prefix).includes("@");
      const j = quotedEnd(src, i + prefix, "\"", verbatim);
      push(src.slice(i, j), "string"); i = j; continue;
    }
    if (c === "'") {
      const j = quotedEnd(src, i, "'", false);
      push(src.slice(i, j), "char"); i = j; continue;
    }
    if (isDigit(c) || (c === "." && n !== undefined && isDigit(n) && !(i > 0 && isIdentPart(src[i - 1])))) {
      let j = i + 1;
      if (c === "0" && (n === "x" || n === "X")) { j = i + 2; while (j < src.length && /[0-9A-Fa-f_]/.test(src[j])) j++; }
      else {
        while (j < src.length && (isDigit(src[j]) || src[j] === "_")) j++;
        if (src[j] === "." && j + 1 < src.length && isDigit(src[j + 1])) { j++; while (j < src.length && isDigit(src[j])) j++; }
        if ((src[j] === "e" || src[j] === "E") && (isDigit(src[j + 1] ?? "") || ((src[j + 1] === "+" || src[j + 1] === "-") && isDigit(src[j + 2] ?? "")))) {
          j += 2; while (j < src.length && isDigit(src[j])) j++;
        }
      }
      while (j < src.length && /[fFdDmMuUlL]/.test(src[j])) j++;
      push(src.slice(i, j), "number"); i = j; continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1; while (j < src.length && isIdentPart(src[j])) j++;
      const word = src.slice(i, j);
      push(word, KEYWORDS.has(word) ? "keyword" : TYPES.has(word) ? "type" : "plain"); i = j; continue;
    }
    push(c, "plain"); i++;
  }
  return out;
}
