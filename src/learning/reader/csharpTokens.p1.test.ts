// 899371 P1 (docs/enterprise-899371-learning-plan.md §13) — the Reader's C# highlighter is a pure tokenizer whose tokens are
// TEXT: joined back together they are the book's code, byte for byte (a book block is shown exactly as printed), and every token
// has one of the known kinds. The corpus is every Program.cs of the P0 probes — real code of the book 899371.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tokenizeCSharp, CSHARP_TOKEN_KINDS, type CSharpToken } from "./csharpTokens";

const PROBES = join(process.cwd(), "docs", "enterprise-899371-learning", "probes");
const corpus = readdirSync(PROBES).map(id => join(PROBES, id, "Program.cs")).filter(f => existsSync(f)).map(f => readFileSync(f, "utf8"));
const joined = (t: CSharpToken[]) => t.map(x => x.text).join("");
const kindsOf = (src: string, kind: string) => tokenizeCSharp(src).filter(t => t.kind === kind).map(t => t.text);

describe("tokenizeCSharp — fidelity", () => {
  it("joins back to the exact source for every program of the book corpus", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(50);
    for (const src of corpus) expect(joined(tokenizeCSharp(src))).toBe(src);
  });

  it("joins back for hostile and broken input too (never throws, never drops a character)", () => {
    const odd = ["", "\"unterminated", "'", "/* open", "@\"a\"\"b", "$\"{x}\" + \"\\\"\"", "x\r\ny", "\t\u200f«عربي»", "1e5f 0x1F 3.5m 'a' '\\n' '\\''", "a//b\nc", "\\", "\"\\"];
    for (const src of odd) expect(joined(tokenizeCSharp(src))).toBe(src);
  });

  it("uses only the known token kinds and never emits an empty token", () => {
    for (const src of corpus) for (const t of tokenizeCSharp(src)) {
      expect(CSHARP_TOKEN_KINDS).toContain(t.kind);
      expect(t.text.length).toBeGreaterThan(0);
    }
  });
});

describe("tokenizeCSharp — classification", () => {
  it("keywords, but not identifiers that only contain one", () => {
    expect(kindsOf("static void Main(string[] args) { int x = 1; if (x > 0) return; }", "keyword")).toEqual(["static", "void", "string", "int", "if", "return"]);
    expect(kindsOf("int interval = 1; bool forward = true;", "keyword")).toEqual(["int", "bool", "true"]);
  });

  it("strings with escapes, verbatim and interpolated strings, chars", () => {
    expect(kindsOf('Console.WriteLine("a \\"b\\" c" + x);', "string")).toEqual(['"a \\"b\\" c"']);
    expect(kindsOf('s = @"C:\\dir ""q""";', "string")).toEqual(['@"C:\\dir ""q"""']);
    expect(kindsOf('s = $"Avg: {avg}";', "string")).toEqual(['$"Avg: {avg}"']);
    expect(kindsOf("if (ch >= 'A' && ch <= '\\'') x = '\\n';", "char")).toEqual(["'A'", "'\\''", "'\\n'"]);
    expect(kindsOf('Console.WriteLine("أهلاً بك في عالم البرمجة!");', "string")).toEqual(['"أهلاً بك في عالم البرمجة!"']);
  });

  it("comments, numbers and the library types the book uses", () => {
    expect(kindsOf("x = 1; // تحويل النص إلى رقم\n/* a\nb */ y = 2;", "comment")).toEqual(["// تحويل النص إلى رقم", "/* a\nb */"]);
    expect(kindsOf("double d = 3.5 + 10 % 7 * 0.25;", "number")).toEqual(["3.5", "10", "7", "0.25"]);
    expect(kindsOf("Console.WriteLine(Math.Sqrt(16)); Random rnd = new Random();", "type")).toEqual(["Console", "Math", "Random", "Random"]);
  });

  it("a string never swallows the next line when it is not closed", () => {
    const t = tokenizeCSharp('a = "open\nint b = 2;');
    expect(t.find(x => x.kind === "string")?.text).toBe('"open');
    expect(t.filter(x => x.kind === "keyword").map(x => x.text)).toEqual(["int"]);
  });
});
