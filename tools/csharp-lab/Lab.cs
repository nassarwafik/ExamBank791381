// SPIKE (docs/enterprise-teacher-csharp-lab-spike.md) — compile and run ONE C# program inside the browser (Roslyn on .NET WebAssembly),
// the same way the Runner's csharp@1 worker does on the server: the worker's implicit usings, nullable enabled, the latest language
// version, and the book's wrap rule (a source without a class gets `public class Program { ` on its FIRST line and `}` after its last,
// so a compiler line number is the writer's own line number). Output goes to strings via Console.SetOut / SetError.
// INPUT: Console.In / SetIn are not supported on the browser runtime (CA1416; they throw PlatformNotSupported there), so the
// program's own Console.ReadLine / Console.Read / Console.In uses are rebound — with Roslyn's semantic model, replaced IN PLACE on the
// same line — to an injected reader (__LabStdin) that holds the input. Line numbers are unchanged.
// Teacher-only by owner decision; this file is measured in CI and is not part of the web app.
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json.Nodes;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Text;

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
    // The injected input reader. Same assembly as the program; set by reflection before Main runs.
    const string StdinShim = @"internal static class __LabStdin
{
    public static global::System.IO.TextReader In = global::System.IO.TextReader.Null;
    public static string? ReadLine() => In.ReadLine();
    public static int Read() => In.Read();
}
";
    static readonly CSharpParseOptions ParseOptions = new CSharpParseOptions(LanguageVersion.Latest);
    static readonly Regex DeclaresClass = new Regex(@"\bclass\s+[A-Za-z_]", RegexOptions.CultureInvariant);

    static string Wrap(string source) => DeclaresClass.IsMatch(source) ? source : "public class Program { " + source + "\n}\n";

    static readonly SyntaxTree UsingsTree = CSharpSyntaxTree.ParseText(GlobalUsings, ParseOptions, "GlobalUsings.cs");
    static readonly SyntaxTree ShimTree = CSharpSyntaxTree.ParseText(StdinShim, ParseOptions, "LabStdin.cs");
    // concurrentBuild: false — the browser runtime is single-threaded: Roslyn's default parallel build waits on worker tasks, which
    // throws "Cannot wait on monitors on this runtime" (CI run 45115490788, the first program).
    static readonly CSharpCompilationOptions Options = new CSharpCompilationOptions(OutputKind.ConsoleApplication,
        optimizationLevel: OptimizationLevel.Release, nullableContextOptions: NullableContextOptions.Enable, concurrentBuild: false);

    static CSharpCompilation Compile(SyntaxTree program) =>
        CSharpCompilation.Create("TeacherProgram", new[] { UsingsTree, ShimTree, program }, Basic.Reference.Assemblies.Net100.References.All, Options);

    static readonly HashSet<string> StdinMembers = new HashSet<string> { "ReadLine", "Read", "In" };

    /// <summary>Console.ReadLine / Read / In → __LabStdin.*, replaced in place (same line). Binding decides, not the spelling.</summary>
    static SyntaxTree RedirectStdin(SyntaxTree program)
    {
        var model = Compile(program).GetSemanticModel(program);
        var changes = new List<TextChange>();
        foreach (var node in program.GetRoot().DescendantNodes())
        {
            ExpressionSyntax? target = node switch
            {
                MemberAccessExpressionSyntax m => m,
                IdentifierNameSyntax id when !(id.Parent is MemberAccessExpressionSyntax pm && pm.Name == id) => id,   // `using static System.Console;`
                _ => null,
            };
            if (target == null) continue;
            var symbol = model.GetSymbolInfo(target).Symbol ?? model.GetSymbolInfo(target).CandidateSymbols.FirstOrDefault();
            if (symbol == null || !StdinMembers.Contains(symbol.Name) || symbol.ContainingType?.ToDisplayString() != "System.Console") continue;
            changes.Add(new TextChange(target.Span, "global::__LabStdin." + symbol.Name));
        }
        if (changes.Count == 0) return program;
        return program.WithChangedText(program.GetText().WithChanges(changes));
    }

    [JSExport]
    internal static string Run(string source, string stdin)
    {
        var total = Stopwatch.StartNew();
        var program = RedirectStdin(CSharpSyntaxTree.ParseText(Wrap(source), ParseOptions, "Program.cs"));
        var compilation = Compile(program);
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
        var (oldOut, oldErr) = (Console.Out, Console.Error);
        assembly.GetType("__LabStdin")?.GetField("In", BindingFlags.Public | BindingFlags.Static)?.SetValue(null, new StringReader(stdin ?? ""));
        Console.SetOut(stdout);
        Console.SetError(stderr);
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
        }
        return Result(status, stdout.ToString(), stderr.ToString(), compileMs, run.ElapsedMilliseconds);
    }

    static string Result(string status, string stdout, string stderr, long compileMs, long runMs) =>
        new JsonObject { ["status"] = status, ["stdout"] = stdout, ["stderr"] = stderr, ["compileMs"] = compileMs, ["runMs"] = runMs }.ToJsonString();
}
