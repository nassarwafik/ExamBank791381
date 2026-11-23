// Teacher C# lab (docs/enterprise-teacher-csharp-lab-spike.md) — compile and run ONE C# program inside the browser (Roslyn on .NET WebAssembly),
// the same way the Runner's csharp@1 worker does on the server: the worker's implicit usings, nullable enabled, the latest language
// version, and the book's wrap rule (a source without a class gets `public class Program { ` on its FIRST line and `}` after its last,
// so a compiler line number is the writer's own line number). Output goes to strings via Console.SetOut / SetError.
// INPUT: Console.In / SetIn are not supported on the browser runtime (CA1416; they throw PlatformNotSupported there), so the
// program's own Console.ReadLine / Console.Read / Console.In uses are rebound — with Roslyn's semantic model, replaced IN PLACE on the
// same line — to an injected reader (__LabStdin) that holds the input. Line numbers are unchanged.
// COURSE LIBRARY: a book written against its own classes («مبنى المعطيات»: Node, Node<T>, BinNode<T>, Stack<T>, Queue<T> —
// scripts/ds-course/unit4/Unit4.cs) passes them as `library`; they compile as a separate file of the same program (global namespace,
// so `Stack<int>` is the book's stack, found before System.Collections.Generic), minus every class the writer declares (same name
// and type-parameter count), exactly as the server's course-library.js does for the Runner.
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

    static CSharpCompilation Compile(SyntaxTree program, SyntaxTree? library) =>
        CSharpCompilation.Create("TeacherProgram", library == null ? new[] { UsingsTree, ShimTree, program } : new[] { UsingsTree, ShimTree, program, library },
            Basic.Reference.Assemblies.Net100.References.All, Options);

    /// <summary>
    /// Visual lab V6 (docs/enterprise-csharp-visual-lab-plan.md §14) — the libraries the trimmed download keeps WHOLE (CSharpLab.csproj's
    /// TrimmerRootAssembly list of implementation libraries; tools/csharp-lab/trimming.test.mjs keeps the two lists equal). A program may
    /// use only types that live in them: every other library is left out of the download or cut to what Roslyn and the lab need.
    /// </summary>
    internal static readonly HashSet<string> KeptWhole = new HashSet<string>
    {
        "System.Private.CoreLib", "System.Runtime", "System.Console", "System.Collections", "System.Collections.Concurrent",
        "System.Collections.NonGeneric", "System.Collections.Specialized", "System.Linq", "System.Memory", "System.ObjectModel",
        "System.Runtime.Numerics", "System.Text.RegularExpressions",
    };

    /// <summary>
    /// The first type the compiled program references that this lab cannot vouch for (null when every one can): read from the
    /// program's own metadata (every type reference, the compiler's own included), each resolved as the runtime resolves it (type
    /// forwarding included) — a type that does not resolve, or resolves into a library not kept whole, is refused BEFORE the program
    /// runs, as a compile error (LAB0001). So a program never fails half-way for a library the download left out.
    /// </summary>
    internal static string? Unavailable(byte[] image)
    {
        using var pe = new System.Reflection.PortableExecutable.PEReader(new MemoryStream(image));
        var md = System.Reflection.Metadata.PEReaderExtensions.GetMetadataReader(pe);
        foreach (var handle in md.TypeReferences)
        {
            var tr = md.GetTypeReference(handle);
            if (tr.ResolutionScope.Kind != System.Reflection.Metadata.HandleKind.AssemblyReference) continue;   // nested: its outer type is checked
            var asm = md.GetString(md.GetAssemblyReference((System.Reflection.Metadata.AssemblyReferenceHandle)tr.ResolutionScope).Name);
            var ns = md.GetString(tr.Namespace);
            var name = (ns.Length > 0 ? ns + "." : "") + md.GetString(tr.Name);
            Type? type;
            try { type = Type.GetType(name + ", " + asm, throwOnError: false); } catch { type = null; }
            if (type == null || !KeptWhole.Contains(type.Assembly.GetName().Name ?? "")) return name;
        }
        return null;
    }
    internal static string UnavailableMessage(string type) =>
        "Program.cs: error LAB0001: '" + type + "' is not part of the C# lab on this device (its library is left out of the download). " +
        "Run this program on the server (the Runner).";

    static string TypeKey(TypeDeclarationSyntax t) => t.Identifier.Text + "/" + (t.TypeParameterList?.Parameters.Count ?? 0);

    /// <summary>The course library minus every type the writer declares (null when nothing is left or there is no library).</summary>
    static SyntaxTree? LibraryFor(string? library, SyntaxTree program)
    {
        if (string.IsNullOrWhiteSpace(library)) return null;
        var own = new HashSet<string>(program.GetRoot().DescendantNodes().OfType<TypeDeclarationSyntax>().Select(TypeKey));
        var tree = CSharpSyntaxTree.ParseText(library, ParseOptions, "CourseLibrary.cs");
        var root = tree.GetRoot();
        var drop = root.DescendantNodes().OfType<TypeDeclarationSyntax>().Where(t => t.Parent is CompilationUnitSyntax && own.Contains(TypeKey(t))).ToList();
        if (drop.Count > 0) root = root.RemoveNodes(drop, SyntaxRemoveOptions.KeepNoTrivia)!;
        return root.DescendantNodes().OfType<TypeDeclarationSyntax>().Any() ? tree.WithRootAndOptions(root, ParseOptions) : null;
    }

    static readonly HashSet<string> StdinMembers = new HashSet<string> { "ReadLine", "Read", "In" };

    /// <summary>Console.ReadLine / Read / In → __LabStdin.*, replaced in place (same line). Binding decides, not the spelling.</summary>
    static SyntaxTree RedirectStdin(SyntaxTree program, SyntaxTree? library)
    {
        var model = Compile(program, library).GetSemanticModel(program);
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
    internal static string Run(string source, string stdin, string library)
    {
        var total = Stopwatch.StartNew();
        var parsed = CSharpSyntaxTree.ParseText(Wrap(source), ParseOptions, "Program.cs");
        var lib = LibraryFor(library, parsed);
        var program = RedirectStdin(parsed, lib);
        var compilation = Compile(program, lib);
        using var pe = new MemoryStream();
        var emit = compilation.Emit(pe);
        var compileMs = total.ElapsedMilliseconds;
        if (!emit.Success)
        {
            var errors = emit.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error).Select(d => d.ToString());
            return Result("compile-error", "", string.Join("\n", errors), compileMs, 0);
        }

        var image = pe.ToArray();
        if (Unavailable(image) is string missing) return Result("compile-error", "", UnavailableMessage(missing), compileMs, 0);
        var assembly = Assembly.Load(image);
        var entry = assembly.EntryPoint;
        if (entry == null) return Result("compile-error", "", "No Main method.", compileMs, 0);
        var stdout = new CappedWriter(OutputCapChars);
        var stderr = new CappedWriter(OutputCapChars);
        var (oldOut, oldErr) = (Console.Out, Console.Error);
        assembly.GetType("__LabStdin")?.GetField("In", BindingFlags.Public | BindingFlags.Static)?.SetValue(null, new StringReader(stdin ?? ""));
        Console.SetOut(stdout);
        Console.SetError(stderr);
        var status = "success";
        string? leftOut = null;
        var run = Stopwatch.StartNew();
        try
        {
            entry.Invoke(null, entry.GetParameters().Length == 0 ? null : new object[] { Array.Empty<string>() });
        }
        catch (TargetInvocationException e) when (e.InnerException is OutputLimitException)
        {
            status = "output-limit";
        }
        catch (TargetInvocationException e)
        {
            status = "runtime-error";
            if (LeftOut(e.InnerException ?? e)) leftOut = LeftOutMessage;
            stderr.WriteLine((e.InnerException ?? e).ToString());
        }
        finally
        {
            Console.SetOut(oldOut);
            Console.SetError(oldErr);
        }
        // the marker goes FIRST, so no cap on the error text can cut it off
        return Result(status, stdout.ToString(), (leftOut == null ? "" : leftOut + "\n") + stderr.ToString(), compileMs, run.ElapsedMilliseconds);
    }

    /// <summary>
    /// V6: a run that failed for a library the trimmed download left out — reached past the compile-time check (Unavailable), by
    /// reflection. Not the program's fault: the error then says «PlatformNotSupported» first, which teacher-device grading already
    /// refuses as evidence the device cannot vouch for (api/src/lib/coding/device-grading.js BROWSER_LIMIT → teacher review).
    /// </summary>
    internal static bool LeftOut(Exception x) =>
        x is TypeLoadException || x is MissingMemberException || x is FileLoadException
        || x is FileNotFoundException f && f.Message.Contains("assembly", StringComparison.OrdinalIgnoreCase);
    internal const string LeftOutMessage = "PlatformNotSupportedException: LAB0002: the program needs a library the C# lab on this device leaves out of " +
        "its download. Run it on the server (the Runner).";

    // The Runner's practice output limit (16 KB); a print loop stops here instead of filling the page's memory.
    const int OutputCapChars = 16 * 1024;

    sealed class OutputLimitException : Exception { }

    /// <summary>A StringWriter that refuses to grow past its cap (throws OutputLimitException inside the program).</summary>
    sealed class CappedWriter : StringWriter
    {
        readonly int cap;
        public CappedWriter(int cap) { this.cap = cap; }
        void Room(int more) { if (GetStringBuilder().Length + more > cap) throw new OutputLimitException(); }
        public override void Write(char value) { Room(1); base.Write(value); }
        public override void Write(string? value) { Room(value?.Length ?? 0); base.Write(value); }
        public override void Write(char[] buffer, int index, int count) { Room(count); base.Write(buffer, index, count); }
    }

    static string Result(string status, string stdout, string stderr, long compileMs, long runMs) =>
        new JsonObject { ["status"] = status, ["stdout"] = stdout, ["stderr"] = stderr, ["compileMs"] = compileMs, ["runMs"] = runMs }.ToJsonString();
}
