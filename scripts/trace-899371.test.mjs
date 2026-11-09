// 899371 P6 — unit tests of the trace recorder's PURE parts (no Docker): which lines are recorder lines, how the page's program is
// recovered, and how every recording is numbered by its display line. The runs themselves: `node scripts/trace-899371.mjs` (§19).
import { describe, it, expect } from "vitest";
import { displayProgram, numberRecorders, traceSource, traceSha } from "./trace-899371.mjs";

const instrumented = [
  "Tr.Begin();",
  "int n = 3;",
  "Tr.S(\"n\", \"n\", n);",
  "while (n > 0)",
  "{ //~",
  "    Tr.At(3, \"check\", \"n > 0\", n > 0);",
  "    n--;",
  "    Tr.S(\"down\", \"n\", n);",
  "} //~",
  "Console.WriteLine(n);",
  "Tr.End();",
].join("\n");

describe("the recorder lines", () => {
  it("are removed exactly, giving back the page's program", () => {
    expect(displayProgram(instrumented)).toBe("int n = 3;\nwhile (n > 0)\n    n--;\nConsole.WriteLine(n);");
  });
  it("keep a program line that merely mentions Tr or ends with a comment", () => {
    expect(displayProgram("int Tr = 1; // a comment\nTr.S(\"x\");\nx++; //~ not a brace")).toBe("int Tr = 1; // a comment\nx++; //~ not a brace");
  });
  it("are numbered by the display line just before them, or by the line Tr.At names", () => {
    const n = numberRecorders(instrumented).split("\n");
    expect(n[2]).toBe("Tr.SL(1, \"n\", \"n\", n);");
    expect(n[5]).toBe("    Tr.SL(3, \"check\", \"n > 0\", n > 0);");
    expect(n[7]).toBe("    Tr.SL(3, \"down\", \"n\", n);");
  });
  it("the run source carries the recorder, and its sha changes with the program and the input", () => {
    const src = traceSource(instrumented);
    expect(src).toContain("public static class Tr");
    expect(src.indexOf("using System.Collections.Generic;")).toBeLessThan(src.indexOf("public class Program"));
    expect(traceSha(src, "1")).not.toBe(traceSha(src, "2"));
    expect(traceSha(src, undefined)).toBe(traceSha(src, ""));
  });
});
