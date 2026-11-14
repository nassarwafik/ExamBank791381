#!/usr/bin/env node
// DS-A2 (docs/enterprise-data-structures-course.md) — the REAL-COMPILER proof of the course «مبنى المعطيات».
//
//   node scripts/ds-course/prove-dotnet.mjs          compile and run every program of the course with the .NET SDK → proofs.json
//
// Every traced program (TRACE) and every program an exercise is proven with (`proved`) is compiled together with the course's
// library (unit4/Unit4.cs — the book's classes) by the real C# compiler and run; its standard output is recorded in
// scripts/ds-course/proofs.json under the program's id (a hash of its shown code, hidden helpers, hidden driver and input).
// ds-course.proof.test.ts then requires, for every program of the course, that the course interpreter (cs-lite.mjs) printed
// exactly what C# printed — so no trace and no answer key rests on the interpreter alone. The test needs no .NET: it reads the
// recorded file; a program that changed has a new id, has no record, and fails the test until this script is run again.
// Needs `dotnet` (SDK 8) on the PATH. No network: the project references nothing outside the SDK.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCourse } from "../build-ds-course.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROOFS_FILE = join(HERE, "proofs.json");

/** Every distinct program of the course (by id). */
export function coursePrograms(units) {
  const { raw } = buildCourse(units);
  const byId = new Map();
  for (const r of raw) for (const prog of [r.block._prog, r.block._prove?.prog]) if (prog) byId.set(prog.id, prog);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

const indent = text => text.split("\n").map(l => (l ? "        " + l : l)).join("\n");
/** One program as a C# file: its code inside a static class of its own namespace, so programs never see each other. */
function fileOf(p) {
  return `using System;
namespace P_${p.id}
{
    public static class Prog
    {
${indent(p.code)}
${p.lib ? indent(p.lib) : ""}
${p.driver ? "        public static void __Run()\n        {\n" + indent(p.driver) + "\n        }" : ""}
    }
}
`;
}
const RUNNER = `using System;
using System.IO;
using System.Reflection;
public static class Runner
{
    static MethodInfo Find(Type t, string name)
    {
        const BindingFlags all = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
        MethodInfo m = t.GetMethod(name, all);
        if (m != null) return m;
        foreach (Type n in t.GetNestedTypes(BindingFlags.Public | BindingFlags.NonPublic)) { m = Find(n, name); if (m != null) return m; }
        return null;
    }
    public static int Main(string[] args)
    {
        System.Globalization.CultureInfo.DefaultThreadCurrentCulture = System.Globalization.CultureInfo.InvariantCulture;
        System.Threading.Thread.CurrentThread.CurrentCulture = System.Globalization.CultureInfo.InvariantCulture;
        string dir = args[0];
        TextWriter realOut = Console.Out;
        using (StreamWriter results = new StreamWriter(Path.Combine(dir, "results.txt")))
        {
            foreach (string id in File.ReadAllLines(Path.Combine(dir, "ids.txt")))
            {
                if (id.Length == 0) continue;
                Type t = typeof(Runner).Assembly.GetType("P_" + id + ".Prog");
                MethodInfo m = Find(t, "__Run") ?? Find(t, "Main");
                StringWriter captured = new StringWriter();
                captured.NewLine = "\\n";
                Console.SetOut(captured);
                Console.SetIn(new StringReader(File.ReadAllText(Path.Combine(dir, id + ".in"))));
                string status = "ok";
                try { m.Invoke(null, m.GetParameters().Length == 0 ? null : new object[] { null }); }
                catch (TargetInvocationException e) { status = e.InnerException.GetType().Name; }
                Console.SetOut(realOut);
                results.WriteLine(id + "\\t" + status + "\\t" + Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(captured.ToString())));
            }
        }
        return 0;
    }
}
`;
const CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>disable</ImplicitUsings>
    <Nullable>disable</Nullable>
    <StartupObject>Runner</StartupObject>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
    <NoWarn>CS0162;CS0168;CS0219;CS0414;CS0649;CS8981;CS0164</NoWarn>
    <InvariantGlobalization>true</InvariantGlobalization>
    <AssemblyName>dsproof</AssemblyName>
  </PropertyGroup>
</Project>
`;

/** Compiles and runs the programs with the .NET SDK: id → { out, error? }. Throws (with the compiler's messages) when C# refuses one. */
export function runWithDotnet(programs) {
  const dir = mkdtempSync(join(tmpdir(), "ds-proof-"));
  try {
    mkdirSync(join(dir, "io"));
    writeFileSync(join(dir, "dsproof.csproj"), CSPROJ);
    writeFileSync(join(dir, "Runner.cs"), RUNNER);
    copyFileSync(join(HERE, "unit4", "Unit4.cs"), join(dir, "Unit4.cs"));
    for (const p of programs) { writeFileSync(join(dir, "P_" + p.id + ".cs"), fileOf(p)); writeFileSync(join(dir, "io", p.id + ".in"), p.stdin ? p.stdin + "\n" : ""); }
    writeFileSync(join(dir, "io", "ids.txt"), programs.map(p => p.id).join("\n") + "\n");
    const env = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" };
    try {
      execFileSync("dotnet", ["build", "-c", "Release", "-v", "q", "--nologo"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
    } catch (e) {
      const text = String(e.stdout ?? "") + String(e.stderr ?? "");
      const errors = [...new Set(text.split("\n").filter(l => /error/.test(l)))].slice(0, 40).map(l => {
        const prog = programs.find(p => p.id === /P_([0-9a-f]{16})\.cs/.exec(l)?.[1]);
        return l.replace(dir, "").replace(/ \[.*$/, "") + (prog ? "\n    ↳ in the program starting: " + prog.code.split("\n")[0] : "");
      });
      throw new Error("the C# compiler refused the course's programs:\n" + errors.join("\n"));
    }
    execFileSync("dotnet", [join(dir, "bin", "Release", "net8.0", "dsproof.dll"), join(dir, "io")], { cwd: dir, env, stdio: ["ignore", "inherit", "inherit"], timeout: 120000 });
    const out = {};
    for (const line of readFileSync(join(dir, "io", "results.txt"), "utf8").split("\n")) {
      if (!line) continue;
      const [id, status, b64] = line.split("\t");
      out[id] = { out: Buffer.from(b64, "base64").toString("utf8"), ...(status === "ok" ? {} : { error: status }) };
    }
    return { version: execFileSync("dotnet", ["--version"], { env }).toString().trim(), programs: out };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const r = runWithDotnet(coursePrograms());
    writeFileSync(PROOFS_FILE, JSON.stringify({ compiler: "dotnet " + r.version, programs: r.programs }, null, 1) + "\n");
    console.log(Object.keys(r.programs).length + " programs compiled and run by dotnet " + r.version + " → scripts/ds-course/proofs.json");
  } catch (e) { console.error(e.message); process.exit(1); }
}
