// The real-browser checks' editor writer (scripts/monaco-set-code.mjs): the rule that decides "the editor shows the program".
// The writer itself runs in Chromium (check-offline-lab-browser / check-csharp-lab-browser); this pins the comparison it trusts.
import { describe, expect, it } from "vitest";
import { showsProgram } from "./monaco-set-code.mjs";

const program = "class Program\n{\n    static void Main()\n    {\n        System.Console.WriteLine(1);\n    }\n}";
const shown = program.split("\n");

describe("showsProgram", () => {
  it("accepts the program, its trailing empty line, and the engine's re-indentation (C# does not read it)", () => {
    expect(showsProgram(shown, program)).toBe(true);
    expect(showsProgram([...shown, ""], program)).toBe(true);
    expect(showsProgram(shown.map((l, i) => " ".repeat(4 * i) + l.trimStart()), program)).toBe(true);
  });
  it("accepts a run of the program's lines, in order (an editor that shows part of it)", () => {
    expect(showsProgram(shown.slice(2, 5), program)).toBe(true);
  });
  it("refuses the program typed INTO the sample (the race), the sample left as it was, and an empty editor", () => {
    const sample = ["using System;", "", "public class Program", "{", "    public static void Main()", "    {", "        Console.WriteLine(\"hi\");", "    }", "}"];
    expect(showsProgram([...sample.slice(0, 2), ...shown, ...sample.slice(2)], program)).toBe(false);
    expect(showsProgram(sample, program)).toBe(false);
    expect(showsProgram([""], program)).toBe(false);
    expect(showsProgram([], program)).toBe(false);
  });
  it("refuses lines out of order, and a changed line", () => {
    expect(showsProgram([shown[1], shown[0], ...shown.slice(2)], program)).toBe(false);
    expect(showsProgram(shown.map(l => l.replace("WriteLine(1)", "WriteLine(2)")), program)).toBe(false);
  });
});
