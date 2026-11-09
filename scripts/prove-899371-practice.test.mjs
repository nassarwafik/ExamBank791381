// 899371 P4 — unit tests of the practice prover's PURE parts (no Docker): how a printed program is made compilable, what a proof is
// bound to, how an output and an exception are read, and that the judge refuses a wrong key. The runs themselves are made by
// `node scripts/prove-899371-practice.mjs` (docs/enterprise-899371-learning-plan.md §16).
import { describe, it, expect } from "vitest";
import { wrapProgram, proofSha, outputLine, exceptionOf, judgeItem, judgeGuided } from "./prove-899371-practice.mjs";

const mcq = (texts, correct) => ({ kind: "multipleChoice", prompt: "?", options: texts.map((text, i) => ({ text, ...(i === correct ? { correct: true } : {}) })), feedback: { explanation: "e" } });
const proofFor = (item, run) => ({ sha: proofSha(wrapProgram(item.program), item.stdin), compileExit: 0, exitCode: 0, stdout: "", exception: null, ...run });

describe("wrapProgram", () => {
  it("wraps statements in Main of a class Program, a printed Main in the class, and leaves a program with classes as printed", () => {
    expect(wrapProgram("int x = 1;\nConsole.WriteLine(x);")).toBe("public class Program\n{\n    static void Main()\n    {\n        int x = 1;\n        Console.WriteLine(x);\n    }\n}\n");
    expect(wrapProgram("static int F() { return 1; }\nstatic void Main()\n{\n}")).toBe("public class Program\n{\n    static int F() { return 1; }\n    static void Main()\n    {\n    }\n}\n");
    const own = "class Box { }\npublic class Program { static void Main() { } }";
    expect(wrapProgram(own)).toBe(own);
  });
});

describe("what a proof is bound to and what it reads", () => {
  it("the sha changes with the program and with the input", () => {
    expect(proofSha("a", "1")).not.toBe(proofSha("a", "2"));
    expect(proofSha("a", undefined)).toBe(proofSha("a", ""));
    expect(proofSha("a", "1")).not.toBe(proofSha("b", "1"));
  });
  it("joins printed lines with « | » and reads the unhandled exception's type", () => {
    expect(outputLine("*\n**\r\n***\n")).toBe("* | ** | ***");
    expect(outputLine("16 8\n")).toBe("16 8");
    expect(exceptionOf("Unhandled exception. System.IndexOutOfRangeException: Index was outside the bounds of the array.\n   at Program.Main()")).toBe("IndexOutOfRangeException");
    expect(exceptionOf("")).toBeNull();
  });
});

describe("judgeItem refuses a wrong key", () => {
  const item = { question: mcq(["2.5", "2"], 1), program: "Console.WriteLine(10 / 4);", prove: "output" };
  it("accepts the option the run printed, refuses another, and a proof of another program", () => {
    expect(judgeItem(item, proofFor(item, { stdout: "2\n" }))).toEqual([]);
    expect(judgeItem(item, proofFor(item, { stdout: "2.5\n" }))).not.toEqual([]);
    expect(judgeItem({ ...item, program: "Console.WriteLine(10.0 / 4);" }, proofFor(item, { stdout: "2\n" }))).toContain("the proof is for another program / input");
    expect(judgeItem(item, undefined)).toEqual(["no proof"]);
  });
  it("judges a claim, a short answer and a run-time error", () => {
    const claim = { question: { kind: "trueFalse", prompt: "?", answer: false, feedback: { explanation: "e" } }, program: "Console.WriteLine(1);", prove: "claim", claimOutput: "2" };
    expect(judgeItem(claim, proofFor(claim, { stdout: "1\n" }))).toEqual([]);
    expect(judgeItem(claim, proofFor(claim, { stdout: "2\n" }))).not.toEqual([]);
    const short = { question: { kind: "shortInput", prompt: "?", answer: "Fizz Buzz", feedback: { explanation: "e" } }, program: "x", stdin: "15", prove: "output" };
    expect(judgeItem(short, proofFor(short, { stdout: "Fizz\nBuzz\n" }))).toEqual([]);
    expect(judgeItem(short, proofFor(short, { stdout: "Fizz\n" }))).not.toEqual([]);
    const crash = { question: { ...mcq(["يطبع 1", "خطأ تنفيذ: خارج الحدود"], 1), feedback: { explanation: "IndexOutOfRangeException" } }, program: "y", prove: "runtime", runtimeError: "IndexOutOfRangeException" };
    expect(judgeItem(crash, proofFor(crash, { exitCode: 134, exception: "IndexOutOfRangeException" }))).toEqual([]);
    expect(judgeItem(crash, proofFor(crash, { exitCode: 0, stdout: "1\n" }))).not.toEqual([]);
  });
});

describe("judgeGuided refuses a walkthrough whose result is not what the run printed (P5)", () => {
  const w = { title: "t", prompt: "p", steps: ["a", "b", "c"], result: "يطبع البرنامج ثلاثة أسطر: `***` ثم `**` ثم `*`", explanation: "e", program: "x", output: "*** | ** | *" };
  const run = extra => ({ sha: proofSha(wrapProgram(w.program), w.stdin), compileExit: 0, exitCode: 0, stdout: "***\n**\n*\n", exception: null, ...extra });
  it("accepts the stated output when the run printed it and the result shows every line", () => {
    expect(judgeGuided(w, run())).toEqual([]);
  });
  it("refuses another output, a result that hides a printed line, another program, and no proof", () => {
    expect(judgeGuided(w, run({ stdout: "***\n**\n" }))).not.toEqual([]);
    expect(judgeGuided({ ...w, result: "يطبع البرنامج: `***`" }, run())).not.toEqual([]);
    expect(judgeGuided({ ...w, program: "y" }, run())).toContain("the proof is for another program / input");
    expect(judgeGuided(w, undefined)).toEqual(["no proof"]);
  });
  it("judges a run-time error walkthrough by its exception, named in the result", () => {
    const crash = { ...w, output: undefined, runtimeError: "FormatException", stdin: "abc", result: "يتوقف بخطأ تنفيذ `FormatException`." };
    const proof = { sha: proofSha(wrapProgram(crash.program), "abc"), compileExit: 0, exitCode: 134, stdout: "", exception: "FormatException" };
    expect(judgeGuided(crash, proof)).toEqual([]);
    expect(judgeGuided(crash, { ...proof, exitCode: 0, exception: null })).not.toEqual([]);
    expect(judgeGuided({ ...crash, result: "يتوقف." }, proof)).toContain("the result does not name the exception");
  });
});
