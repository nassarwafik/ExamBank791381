// 899371 P0 — unit tests of the C# probe tool's PURE parts (no Docker): the probe compiler cannot drift from the csharp@1
// worker, probes are well formed, and the verdict logic catches a wrong prediction. The Docker run itself is exercised by
// `node scripts/run-csharp-probes.mjs` (docs/enterprise-899371-learning-plan.md §12).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WORKER_DIR, DEFAULT_PROBES_DIR, sdkImageFromDockerfile, probeArgv, validateProbe, normalizeOutput, judgeRun, judgeCompile, loadProbes } from "./run-csharp-probes.mjs";

const toolchain = JSON.parse(readFileSync(join(WORKER_DIR, "toolchain.json"), "utf8"));
const dockerfile = readFileSync(join(WORKER_DIR, "Dockerfile"), "utf8");

describe("probe compiler = csharp@1 worker compiler", () => {
  it("reads the digest-pinned SDK image from the worker Dockerfile", () => {
    expect(sdkImageFromDockerfile(dockerfile)).toMatch(/^mcr\.microsoft\.com\/dotnet\/sdk@sha256:[0-9a-f]{64}$/);
    expect(() => sdkImageFromDockerfile("FROM mcr.microsoft.com/dotnet/sdk:10.0 AS dotnet\n")).toThrow(/digest-pinned/);
  });

  it("keeps every compiler and runtime flag of toolchain.json and maps only the worker paths", () => {
    const argv = probeArgv(toolchain);
    const unmap = a => a === "$CSC" ? "/opt/runner/roslyn/csc.dll" : a === "@/work/references.rsp" ? "@/opt/runner/references.rsp" : a.split("/work/").join("/workspace/");
    expect(argv.compile.map(unmap)).toEqual(toolchain.compile.argv);
    expect(argv.run.map(unmap)).toEqual(toolchain.run.argv);
    expect([...argv.compile, ...argv.run].some(a => a.includes("/workspace"))).toBe(false);
    expect(argv.compile).toContain("-out:/work/out/Main.dll");
  });

  it("refuses a toolchain that no longer looks like csharp@1", () => {
    expect(() => probeArgv({ ...toolchain, language: "java" })).toThrow();
    expect(() => probeArgv({ ...toolchain, compile: { argv: toolchain.compile.argv.filter(a => a !== "/opt/runner/GlobalUsings.cs") } })).toThrow(/GlobalUsings/);
  });
});

describe("probe definitions", () => {
  it("every probe in the repository is valid and has its Program.cs", () => {
    const probes = loadProbes(DEFAULT_PROBES_DIR);
    expect(probes.length).toBeGreaterThanOrEqual(50);
  });

  it("rejects malformed probes", () => {
    const base = { id: "x1", source: "ف1", verbatim: true, runs: [{ expect: { stdout: "1" } }] };
    expect(validateProbe(base, "x1")).toEqual([]);
    expect(validateProbe(base, "other")).not.toEqual([]);
    expect(validateProbe({ ...base, runs: [{ expect: { stdout: "1", runtimeError: "FormatException" } }] })).not.toEqual([]);
    expect(validateProbe({ ...base, runs: [{ expect: { runtimeError: "boom" } }] })).not.toEqual([]);
    expect(validateProbe({ ...base, runs: undefined, expect: { compile: "error", diagnostics: ["0165"] } })).not.toEqual([]);
    expect(validateProbe({ ...base, verbatim: "yes" })).not.toEqual([]);
  });
});

describe("verdicts", () => {
  it("compares output like the Runner's default comparator (trailing whitespace only)", () => {
    expect(normalizeOutput("9 4 11  \r\n\n")).toBe("9 4 11");
    expect(judgeRun({ stdout: "False" }, { exitCode: 0, stdout: "False\n", stderr: "" }).ok).toBe(true);
    expect(judgeRun({ stdout: "False" }, { exitCode: 0, stdout: "false\n", stderr: "" }).ok).toBe(false);
    expect(judgeRun({ stdout: "2.5" }, { exitCode: 0, stdout: "2\n", stderr: "" }).ok).toBe(false);
    expect(judgeRun({ stdout: "x" }, { exitCode: 134, stdout: "x", stderr: "Unhandled exception." }).ok).toBe(false);
  });

  it("needs a non-zero exit AND the named exception for a runtime-error expectation", () => {
    const err = { exitCode: 134, stdout: "", stderr: "Unhandled exception. System.FormatException: The input string 'm' was not in a correct format." };
    expect(judgeRun({ runtimeError: "FormatException" }, err).ok).toBe(true);
    expect(judgeRun({ runtimeError: "OverflowException" }, err).ok).toBe(false);
    expect(judgeRun({ runtimeError: "FormatException" }, { ...err, exitCode: 0 }).ok).toBe(false);
  });

  it("needs every expected diagnostic for a compile-error expectation", () => {
    const out = { exitCode: 1, output: "/work/Program.cs(5,5): error CS0165: Use of unassigned local variable 'b'" };
    expect(judgeCompile({ compile: "error", diagnostics: ["CS0165"] }, out)).toMatchObject({ ok: true, found: ["CS0165"] });
    expect(judgeCompile({ compile: "error", diagnostics: ["CS0103"] }, out).ok).toBe(false);
    expect(judgeCompile({ compile: "error", diagnostics: ["CS0165"] }, { exitCode: 0, output: "" }).ok).toBe(false);
    expect(judgeCompile(undefined, { exitCode: 0, output: "" }).ok).toBe(true);
  });
});
