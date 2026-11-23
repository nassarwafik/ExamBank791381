// SPIKE (docs/enterprise-teacher-csharp-lab-spike.md) — compile and run ONE C# program inside the browser (Roslyn on .NET WebAssembly),
// the same way the Runner's csharp@1 worker does on the server: the worker's implicit usings, nullable enabled, the latest language
// version, and the book's wrap rule (a source without a class gets `public class Program { ` on its FIRST line and `}` after its last,
// so a compiler line number is the writer's own line number). Console input / output are redirected to strings.
// Teacher-only by owner decision; this file is measured in CI and is not part of the web app.
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

public static partial class Lab
{
    // runner/workers/csharp/GlobalUsings.cs, verbatim
    const string GlobalUsings = @"global using global::System;
global using global::System.Collections.Generic;
global using global::System.IO;
global using global::System.Linq;
global using global::System.Net.Http;
global using global::System.Threading;
global using global::System.Threading.Tasks;
";
    static readonly CSharpParseOptions ParseOptions = new CSharpParseOptions(LanguageVersion.Latest);
    static readonly Regex DeclaresClass = new Regex(@"\bclass\s+[A-Za-z_]", RegexOptions.CultureInvariant);

    static string Wrap(string source) => DeclaresClass.IsMatch(source) ? source : "public class Program { " + source + "\n}\n";

    [JSExport]
    internal static string Run(string source, string stdin)
    {
        var total = Stopwatch.StartNew();
        var trees = new[]
        {
            CSharpSyntaxTree.ParseText(GlobalUsings, ParseOptions, "GlobalUsings.cs"),
            CSharpSyntaxTree.ParseText(Wrap(source), ParseOptions, "Program.cs"),
        };
        var compilation = CSharpCompilation.Create("TeacherProgram", trees, Basic.Reference.Assemblies.Net100.References.All,
            new CSharpCompilationOptions(OutputKind.ConsoleApplication, optimizationLevel: OptimizationLevel.Release, nullableContextOptions: NullableContextOptions.Enable));
        using var pe = new MemoryStream();
        var emit = compilation.Emit(pe);
        var compileMs = total.ElapsedMilliseconds;
        if (!emit.Success)
        {
            var errors = emit.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error).Select(d => d.ToString());
            return Result("compile-error", "", string.Join("\n", errors), compileMs, 0);
        }

        var assembly = Assembly.Load(pe.ToArray());
        var entry = assembly.EntryPoint;
        if (entry == null) return Result("compile-error", "", "No Main method.", compileMs, 0);
        var stdout = new StringWriter();
        var stderr = new StringWriter();
        var (oldOut, oldErr, oldIn) = (Console.Out, Console.Error, Console.In);
        Console.SetOut(stdout);
        Console.SetError(stderr);
        Console.SetIn(new StringReader(stdin ?? ""));
        var status = "success";
        var run = Stopwatch.StartNew();
        try
        {
            entry.Invoke(null, entry.GetParameters().Length == 0 ? null : new object[] { Array.Empty<string>() });
        }
        catch (TargetInvocationException e)
        {
            status = "runtime-error";
            stderr.WriteLine((e.InnerException ?? e).ToString());
        }
        finally
        {
            Console.SetOut(oldOut);
            Console.SetError(oldErr);
            Console.SetIn(oldIn);
        }
        return Result(status, stdout.ToString(), stderr.ToString(), compileMs, run.ElapsedMilliseconds);
    }

    static string Result(string status, string stdout, string stderr, long compileMs, long runMs) =>
        new JsonObject { ["status"] = status, ["stdout"] = stdout, ["stderr"] = stderr, ["compileMs"] = compileMs, ["runMs"] = runMs }.ToJsonString();
}
