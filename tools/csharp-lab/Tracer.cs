// Teacher C# lab, phase V2 (docs/enterprise-csharp-visual-lab-plan.md §6, §10) — the TRACE RECORDER: one C# program, compiled by
// the real compiler (Roslyn) and run in the lab's worker, recorded STEP BY STEP in the «ds-trace» shape the course's drawings read
// (src/learning/activities/ds.ts: line, note, frames, objs, out, error).
//
// How: the program is compiled AS WRITTEN first (a compile error is reported exactly as Lab.Run reports it). Then Roslyn plants, in
// the writer's own methods only (never the book's classes, never lambdas or local functions), calls to the recorder __LabTrace
// (TraceRuntime.cs) — on the SAME lines, so every recorded line number is the writer's own:
//   • a method's entry (its signature line, with its parameters) and, for a void method that falls off its end, its closing brace;
//   • after every declaration and expression statement;   • every condition of if / while / do / for (with its value);
//   • the for loop's initialiser and each of its updates;   • return (after its value), break, continue.
// The variables of a step are those IN SCOPE and DEFINITELY ASSIGNED there (Roslyn's own data-flow analysis), parameters first,
// then locals in declaration order — the order the course's recorder (scripts/ds-course/cs-lite.mjs) uses. The recorder reads them
// through a closure, so a caller's variables are live while a method it called runs.
// The recording rules are those of cs-lite.mjs, so a program of the course gives the steps the course recorded; the lab's CI proves
// it on every traced program of «مبنى المعطيات» (tools/csharp-lab/golden.mjs).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json.Nodes;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using static Microsoft.CodeAnalysis.CSharp.SyntaxFactory;

public static partial class Lab
{
    /// <summary>Most steps one trace records; past it the trace ends as «step-limit» (owner decision: 5000, plan §7).</summary>
    internal const int TraceMaxSteps = 5000;

    static readonly CSharpCompilationOptions TraceOptions = Options.WithOutputKind(OutputKind.DynamicallyLinkedLibrary);
    static readonly SyntaxTree VizTree = CSharpSyntaxTree.ParseText(TraceRuntime.VizSource, ParseOptions, "LabViz.cs");
    static readonly SyntaxTree TraceRuntimeTree = CSharpSyntaxTree.ParseText(TraceRuntime.Source, ParseOptions, "LabTrace.cs");

    /// <summary>
    /// Records one program. `optionsJson`: { "shown"?: lines of the program the learner sees (later lines are a hidden driver whose
    /// steps fold into one closing step, as the course records them), "entry"?: the method to start from (default: Main),
    /// "quiet"?: names of methods that run without steps of their own, "maxSteps"?: at most TraceMaxSteps,
    /// "inside"?: true = «اكشف الداخل», the book's Stack<T> / Queue<T> recorded as objects with their Node<T> chain,
    /// "rich"?: true = V5 rich types (TraceRuntime.cs header): items that are objects, C#'s collections and arrays as structures;
    /// with it the result also carries "pointers": [[array, index]] — every a[i] the writer's program writes (plain names only) }.
    /// A step marked by Viz.Pause() carries "pause": true; Viz.Show(title) gives it the writer's title as its note.
    /// → { status, stdout, stderr, compileMs, runMs, steps: [{ line, note, frames, objs, out, error? }] }
    /// status: success | compile-error | runtime-error | output-limit | step-limit | trace-unsupported
    /// </summary>
    [JSExport]
    internal static string Trace(string source, string stdin, string library, string optionsJson)
    {
        var total = Stopwatch.StartNew();
        JsonObject options;
        try { options = JsonNode.Parse(string.IsNullOrWhiteSpace(optionsJson) ? "{}" : optionsJson) as JsonObject ?? new JsonObject(); }
        catch { options = new JsonObject(); }
        int shown = options["shown"] is JsonValue sv && sv.TryGetValue<int>(out var s) && s > 0 ? s : int.MaxValue;
        string? entryName = options["entry"] is JsonValue ev && ev.TryGetValue<string>(out var e) && !string.IsNullOrWhiteSpace(e) ? e : null;
        int maxSteps = options["maxSteps"] is JsonValue mv && mv.TryGetValue<int>(out var m) && m > 0 ? Math.Min(m, TraceMaxSteps) : TraceMaxSteps;
        bool inside = options["inside"] is JsonValue iv && iv.TryGetValue<bool>(out var ib) && ib;
        bool rich = options["rich"] is JsonValue rv && rv.TryGetValue<bool>(out var rb) && rb;
        var quiet = options["quiet"] is JsonArray qa ? qa.Select(q => q?.GetValue<string>()).Where(q => !string.IsNullOrEmpty(q)).Cast<string>().ToList() : new List<string>();

        var parsed = CSharpSyntaxTree.ParseText(Wrap(source), ParseOptions, "Program.cs");
        // V5: the array / index pairs the program writes (a[i], list[mid]): the drawing marks the cell an index variable points at
        var pointers = !rich ? null : parsed.GetRoot().DescendantNodes().OfType<ElementAccessExpressionSyntax>()
            .Where(x => x.Expression is IdentifierNameSyntax && x.ArgumentList.Arguments.Count == 1 && x.ArgumentList.Arguments[0].Expression is IdentifierNameSyntax)
            .Select(x => (((IdentifierNameSyntax)x.Expression).Identifier.Text, ((IdentifierNameSyntax)x.ArgumentList.Arguments[0].Expression).Identifier.Text))
            .Distinct().Take(20).ToList();
        var lib = LibraryFor(library, parsed);
        var program = RedirectStdin(parsed, lib);
        // A library, not a console program: a traced program may start from another method (the course's hidden driver «__Run»)
        // and need not have a Main.
        // Viz (Show / Pause) exists in the visual run only — unless the writer declares a class Viz of their own.
        bool ownViz = parsed.GetRoot().DescendantNodes().OfType<TypeDeclarationSyntax>().Any(t => t.Identifier.Text == "Viz" && t.TypeParameterList == null);
        var support = ownViz ? new[] { UsingsTree, ShimTree, TraceRuntimeTree } : new[] { UsingsTree, ShimTree, TraceRuntimeTree, VizTree };
        var plain = CSharpCompilation.Create("TeacherProgram", lib == null ? support.Append(program) : support.Append(program).Append(lib),
            Basic.Reference.Assemblies.Net100.References.All, TraceOptions);
        var errors = plain.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToList();
        if (errors.Count > 0) return TraceResult("compile-error", "", string.Join("\n", errors.Select(d => d.ToString())), total.ElapsedMilliseconds, 0, null);

        SyntaxTree traced;
        try { traced = TraceInstrumenter.Instrument(program, plain.GetSemanticModel(program)); }
        catch (Exception x) { return TraceResult("trace-unsupported", "", "The recorder could not prepare this program: " + x.Message, total.ElapsedMilliseconds, 0, null); }
        var trees = new List<SyntaxTree>(support) { traced };
        if (lib != null) trees.Add(lib);
        var compilation = CSharpCompilation.Create("TracedProgram", trees, Basic.Reference.Assemblies.Net100.References.All, TraceOptions);
        using var pe = new MemoryStream();
        var emit = compilation.Emit(pe);
        var compileMs = total.ElapsedMilliseconds;
        if (!emit.Success)
        {
            var why = emit.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error).Take(5).Select(d => d.ToString());
            return TraceResult("trace-unsupported", "", "The recorder could not prepare this program:\n" + string.Join("\n", why), compileMs, 0, null);
        }

        var assembly = Assembly.Load(pe.ToArray());
        var wanted = entryName ?? "Main";
        MethodInfo? entry = assembly.GetTypes()
            .Where(t => !t.Name.StartsWith("__Lab"))
            .SelectMany(t => t.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.DeclaredOnly))
            .FirstOrDefault(x => x.Name == wanted && (x.GetParameters().Length == 0 || x.GetParameters().Length == 1 && x.GetParameters()[0].ParameterType == typeof(string[])));
        if (entry == null) return TraceResult("compile-error", "", entryName == null ? "No Main method." : "No method «" + entryName + "».", compileMs, 0, null);

        var stdout = new CappedWriter(OutputCapChars);
        var stderr = new CappedWriter(OutputCapChars);
        var recorder = assembly.GetType("__LabTrace")!;
        var libraryTypes = lib == null ? new List<string>() : lib.GetRoot().DescendantNodes().OfType<TypeDeclarationSyntax>()
            .Select(t => t.Identifier.Text + (t.TypeParameterList == null ? "" : "`" + t.TypeParameterList.Parameters.Count)).ToList();
        recorder.GetMethod("Configure")!.Invoke(null, new object[] { stdout, shown, maxSteps, quiet.ToArray(), libraryTypes.ToArray(), inside, rich });
        var (oldOut, oldErr) = (Console.Out, Console.Error);
        assembly.GetType("__LabStdin")?.GetField("In", BindingFlags.Public | BindingFlags.Static)?.SetValue(null, new StringReader(stdin ?? ""));
        Console.SetOut(stdout);
        Console.SetError(stderr);
        var status = "success";
        var run = Stopwatch.StartNew();
        try
        {
            entry.Invoke(null, entry.GetParameters().Length == 0 ? null : new object[] { Array.Empty<string>() });
            recorder.GetMethod("Finish")!.Invoke(null, null);
        }
        catch (TargetInvocationException x) when (x.InnerException is OutputLimitException) { status = "output-limit"; }
        catch (TargetInvocationException x) when (x.InnerException?.GetType().Name == "__LabTraceLimit") { status = "step-limit"; }
        catch (TargetInvocationException x)
        {
            status = "runtime-error";
            try { stderr.WriteLine((x.InnerException ?? x).ToString()); } catch (OutputLimitException) { }
            recorder.GetMethod("Fail")!.Invoke(null, null);
        }
        finally
        {
            Console.SetOut(oldOut);
            Console.SetError(oldErr);
        }
        var steps = (string)recorder.GetMethod("StepsJson")!.Invoke(null, null)!;
        var result = TraceResult(status, stdout.ToString(), stderr.ToString(), compileMs, run.ElapsedMilliseconds, steps);
        if (pointers == null) return result;
        var withPointers = JsonNode.Parse(result)!.AsObject();
        withPointers["pointers"] = new JsonArray(pointers.Select(p => (JsonNode)new JsonArray(p.Item1, p.Item2)).ToArray());
        return withPointers.ToJsonString();
    }

    static string TraceResult(string status, string stdout, string stderr, long compileMs, long runMs, string? stepsJson) =>
        new JsonObject
        {
            ["status"] = status, ["stdout"] = stdout, ["stderr"] = stderr, ["compileMs"] = compileMs, ["runMs"] = runMs,
            ["steps"] = stepsJson == null ? new JsonArray() : JsonNode.Parse(stepsJson),
        }.ToJsonString();
}

/// <summary>Plants the recorder's calls in the writer's methods (see the file header). Line numbers never change: nothing it adds
/// contains a line break.</summary>
static class TraceInstrumenter
{
    internal static SyntaxTree Instrument(SyntaxTree program, SemanticModel model)
    {
        var root = (CSharpSyntaxNode)program.GetRoot();
        var rewritten = new Rewriter(model).Visit(root);
        return program.WithRootAndOptions(rewritten, program.Options);
    }

    const string R = "global::__LabTrace";
    static int LineOf(SyntaxToken t) => t.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
    static int LineOf(SyntaxNode n) => n.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
    static string Lit(string s) => SymbolDisplay.FormatLiteral(s, true);

    sealed class Rewriter : CSharpSyntaxRewriter
    {
        readonly SemanticModel model;
        IMethodSymbol? method;          // the method being instrumented (null: outside one → nothing is planted)
        bool hasThis;

        public Rewriter(SemanticModel model) { this.model = model; }

        // ── never inside: lambdas, anonymous methods, local functions (their steps would not belong to a frame) ──
        public override SyntaxNode? VisitParenthesizedLambdaExpression(ParenthesizedLambdaExpressionSyntax node) => node;
        public override SyntaxNode? VisitSimpleLambdaExpression(SimpleLambdaExpressionSyntax node) => node;
        public override SyntaxNode? VisitAnonymousMethodExpression(AnonymousMethodExpressionSyntax node) => node;
        public override SyntaxNode? VisitLocalFunctionStatement(LocalFunctionStatementSyntax node) => node;

        public override SyntaxNode? VisitMethodDeclaration(MethodDeclarationSyntax node)
        {
            var symbol = model.GetDeclaredSymbol(node);
            if (node.Body == null || symbol == null || !Traceable(symbol, node)) return node;
            var name = symbol.Name == "__Run" ? "Main" : symbol.Name;
            var body = InstrumentBody(symbol, node.Body, name, LineOf(node.ReturnType), symbol.ReturnsVoid);
            return node.WithBody(body);
        }

        public override SyntaxNode? VisitConstructorDeclaration(ConstructorDeclarationSyntax node)
        {
            var symbol = model.GetDeclaredSymbol(node);
            if (node.Body == null || symbol == null || symbol.IsStatic || !Traceable(symbol, node)) return node;
            return node.WithBody(InstrumentBody(symbol, node.Body, node.Identifier.Text, LineOf(node.Identifier), true));
        }

        static bool Traceable(IMethodSymbol symbol, SyntaxNode node) =>
            !symbol.IsAsync && symbol.ContainingType.TypeKind == TypeKind.Class && !symbol.ReturnsByRef && !symbol.ReturnsByRefReadonly
            && !node.DescendantNodes().Any(n => n is YieldStatementSyntax || n is UnsafeStatementSyntax || n is FixedStatementSyntax || n is StackAllocArrayCreationExpressionSyntax);

        BlockSyntax InstrumentBody(IMethodSymbol symbol, BlockSyntax body, string frameName, int declLine, bool fallsOffEnd)
        {
            var (outerMethod, outerThis) = (method, hasThis);
            method = symbol;
            hasThis = !symbol.IsStatic;
            try
            {
                var inner = new List<StatementSyntax>
                {
                    Step(declLine, VarsAt(body.OpenBraceToken.Span.End, body.OpenBraceToken.Span.End, null), "\"تبدأ العملية `" + frameName + "`.\""),
                };
                inner.AddRange(body.Statements.SelectMany(Transform));
                if (fallsOffEnd && body.Statements.Count > 0 ? EndReachable(body) : fallsOffEnd)
                    inner.Add(Step(LineOf(body.CloseBraceToken), VarsAtEnd(body), "\"تنتهي العملية `" + frameName + "`.\""));
                var enter = ParseStatement("var __labFrame = " + R + ".Enter(" + Lit(frameName) + ");");
                var leave = ParseStatement(R + ".Leave(__labFrame);");
                var tryStatement = TryStatement(Block(inner), default, FinallyClause(Block(leave)));
                return body.WithStatements(List(new StatementSyntax[] { enter, tryStatement }));
            }
            finally { (method, hasThis) = (outerMethod, outerThis); }
        }

        bool EndReachable(BlockSyntax body)
        {
            try { return model.AnalyzeControlFlow(body.Statements.First(), body.Statements.Last())?.EndPointIsReachable ?? true; }
            catch { return true; }
        }

        // ── statements ──
        public override SyntaxNode? VisitBlock(BlockSyntax node)
        {
            if (method == null) return base.VisitBlock(node);
            return node.WithStatements(List(node.Statements.SelectMany(Transform)));
        }

        public override SyntaxNode? VisitSwitchSection(SwitchSectionSyntax node)
        {
            if (method == null) return base.VisitSwitchSection(node);
            return node.WithStatements(List(node.Statements.SelectMany(Transform)));
        }

        /// <summary>A statement as it runs under the recorder (one or more statements in place of it, on its own lines).</summary>
        IEnumerable<StatementSyntax> Transform(StatementSyntax s)
        {
            int line = LineOf(s);
            switch (s)
            {
                case LocalDeclarationStatementSyntax decl when !decl.IsConst:
                    yield return Here(line, decl);
                    yield return WithDefaults((LocalDeclarationStatementSyntax)base.Visit(decl)!);
                    yield return Step(line, VarsAt(decl.SpanStart, Inside(decl), AssignedOnExit(decl), WrittenIn(decl)), "\"\"");
                    yield break;
                case ExpressionStatementSyntax expr:
                    yield return Here(line, expr);
                    yield return (StatementSyntax)base.Visit(expr)!;
                    yield return Step(line, VarsAt(expr.SpanStart, Inside(expr), AssignedOnExit(expr), WrittenIn(expr)), "\"\"");
                    yield break;
                case IfStatementSyntax ifs:
                    yield return IfOf(ifs);
                    yield break;
                case WhileStatementSyntax w:
                    yield return w.WithCondition(Condition(w.Condition, LineOf(w.WhileKeyword))).WithStatement(Embedded(w.Statement));
                    yield break;
                case DoStatementSyntax d:
                    yield return d.WithStatement(Embedded(d.Statement)).WithCondition(Condition(d.Condition, LineOf(d.WhileKeyword)));
                    yield break;
                case ForStatementSyntax f:
                    yield return ForOf(f);
                    yield break;
                case ForEachStatementSyntax fe:
                    yield return At(line);
                    yield return fe.WithStatement(Embedded(fe.Statement));
                    yield break;
                case ReturnStatementSyntax ret:
                    yield return ReturnOf(ret, line);
                    yield break;
                case BreakStatementSyntax:
                    yield return Step(line, VarsAt(s.SpanStart, s.SpanStart, AssignedOnEntry(s)), "\"`break`: نخرج من الحلقة.\"");
                    yield return s;
                    yield break;
                case ContinueStatementSyntax:
                    yield return Step(line, VarsAt(s.SpanStart, s.SpanStart, AssignedOnEntry(s)), "\"`continue`: ننتقل إلى الدورة التالية.\"");
                    yield return s;
                    yield break;
                case ThrowStatementSyntax:
                    yield return At(line);
                    yield return (StatementSyntax)base.Visit(s)!;
                    yield break;
                case BlockSyntax b:
                    yield return (StatementSyntax)VisitBlock(b)!;
                    yield break;
                default:
                    yield return (StatementSyntax)base.Visit(s)!;
                    yield break;
            }
        }

        /// <summary>`int a, b;` → `int a = default!, b = default!;`: the recorder may then read a variable the program declared
        /// without a value. It is SHOWN only once the program wrote it (WrittenIn), as the course shows it. The program compiled
        /// without these initialisers, so it never reads such a variable before writing it.</summary>
        static LocalDeclarationStatementSyntax WithDefaults(LocalDeclarationStatementSyntax d) =>
            d.WithDeclaration(d.Declaration.WithVariables(SeparatedList(d.Declaration.Variables.Select(v =>
                v.Initializer != null ? v : v.WithInitializer(EqualsValueClause(ParseExpression("default!")).WithLeadingTrivia(Space))))));

        /// <summary>A local declared without a value («int a, b;»).</summary>
        static bool DeclaredUnset(ILocalSymbol l) =>
            l.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax() is VariableDeclaratorSyntax v && v.Initializer == null
            && v.Parent?.Parent is LocalDeclarationStatementSyntax;

        /// <summary>The locals a statement / expression writes (Roslyn's data flow; a bare embedded statement through its expression).</summary>
        IEnumerable<ISymbol> WrittenIn(SyntaxNode n)
        {
            var flow = Flow(n) ?? (n is ExpressionStatementSyntax es ? Flow(es.Expression) : null);
            return flow == null ? Array.Empty<ISymbol>() : flow.WrittenInside;
        }

        /// <summary>A lookup position still INSIDE a statement: its final token (the «;»). Its end may already be the end of an
        /// enclosing loop (a bare body), where the loop's own variable is no longer in scope.</summary>
        static int Inside(StatementSyntax s) => s.GetLastToken().SpanStart;

        /// <summary>An embedded statement (a loop's or an if's body) as a block, so a statement can become several.</summary>
        StatementSyntax Embedded(StatementSyntax s) => s is BlockSyntax b ? (StatementSyntax)VisitBlock(b)! : Block(Transform(s));

        StatementSyntax IfOf(IfStatementSyntax ifs)
        {
            var result = ifs.WithCondition(Condition(ifs.Condition, LineOf(ifs.IfKeyword))).WithStatement(Embedded(ifs.Statement));
            if (ifs.Else != null)
            {
                var els = ifs.Else.Statement is IfStatementSyntax elseIf ? IfOf(elseIf) : Embedded(ifs.Else.Statement);
                result = result.WithElse(ifs.Else.WithStatement(els));
            }
            return result;
        }

        StatementSyntax ForOf(ForStatementSyntax f)
        {
            int line = LineOf(f.ForKeyword);
            var before = new List<StatementSyntax>();
            var afterInit = f.Condition != null ? AssignedOnEntry(f.Condition) : AssignedOnEntry(f.Statement);
            int initEnd = f.Declaration?.Span.End ?? (f.Initializers.Count > 0 ? f.Initializers.Last().Span.End : f.FirstSemicolonToken.SpanStart);
            if (f.Declaration != null)
            {
                before.Add(At(line));
                before.Add(LocalDeclarationStatement((VariableDeclarationSyntax)base.Visit(f.Declaration)!));
                before.Add(Step(line, VarsAt(f.Condition?.SpanStart ?? f.Statement.SpanStart, f.FirstSemicolonToken.SpanStart, afterInit), "\"\""));
            }
            else if (f.Initializers.Count > 0)
            {
                before.Add(At(line));
                foreach (var init in f.Initializers) before.Add(ExpressionStatement((ExpressionSyntax)base.Visit(init)!));
                before.Add(Step(line, VarsAt(f.Condition?.SpanStart ?? f.Statement.SpanStart, f.FirstSemicolonToken.SpanStart, afterInit), "\"\""));
            }
            var updates = SeparatedList(f.Incrementors.Select(u => Update(u, line, afterInit)));
            var loop = f.WithDeclaration(null).WithInitializers(default)
                .WithCondition(f.Condition == null ? null : Condition(f.Condition, line))
                .WithIncrementors(updates)
                .WithStatement(Embedded(f.Statement));
            if (before.Count == 0) return loop;
            before.Add(loop);
            return Block(before);
        }

        ExpressionSyntax Update(ExpressionSyntax u, int line, ISet<ISymbol>? assigned)
        {
            var visited = (ExpressionSyntax)base.Visit(u)!;
            var vars = VarsAt(u.SpanStart, u.SpanStart, assigned, WrittenIn(u));
            var type = model.GetTypeInfo(u).Type;
            var (names, values) = vars;
            if (type == null || type.SpecialType == SpecialType.System_Void)
                return ParseExpression(R + ".StepAfter(() => { " + visited.ToString() + "; }, " + line + ", " + names + ", " + values + ")");
            return ParseExpression(R + ".StepValue(" + visited.ToString() + ", " + line + ", " + names + ", " + values + ")");
        }

        StatementSyntax ReturnOf(ReturnStatementSyntax ret, int line)
        {
            if (ret.Expression == null)
                return Block(Step(line, VarsAt(ret.SpanStart, ret.SpanStart, AssignedOnEntry(ret)), "\"نخرج من العملية.\""), ret);
            var (names, values) = VarsAt(ret.SpanStart, ret.SpanStart, AssignedOnExit(ret.Expression), WrittenIn(ret.Expression));
            var type = method!.ReturnType.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat);
            var visited = (ExpressionSyntax)base.Visit(ret.Expression)!;
            var call = ParseExpression(R + ".Return<" + type + ">(" + HereArg(line, ret) + ", " + visited.ToString() + ", " + line + ", " + names + ", " + values + ")");
            return ret.WithExpression(call.WithLeadingTrivia(Space));
        }

        ExpressionSyntax Condition(ExpressionSyntax c, int line)
        {
            var (names, values) = VarsAt(c.SpanStart, c.SpanStart, AssignedOnExit(c), WrittenIn(c));
            var visited = (ExpressionSyntax)base.Visit(c)!;
            return ParseExpression(R + ".Test(" + HereArg(line, c) + ", " + visited.ToString() + ", " + line + ", " + names + ", " + values + ", " + Lit(Shorten(c.ToString())) + ")");
        }

        static string Shorten(string s) { s = string.Join(" ", s.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)); return s.Length > 60 ? s.Substring(0, 57) + "..." : s; }

        // ── the recorder's calls ──
        static StatementSyntax At(int line) => ParseStatement(R + ".At(" + line + ");");

        /// <summary>Before a statement / condition that CALLS a method: the frame's variables as they are now (in scope at its start,
        /// definitely assigned on entry), so the frames under the call show the caller's current state — not a loop variable of a
        /// loop that already ended. Records no step. Otherwise only the line (At).</summary>
        string HereArg(int line, SyntaxNode n)
        {
            bool calls = n.DescendantNodesAndSelf(x => x is not LambdaExpressionSyntax && x is not AnonymousMethodExpressionSyntax)
                .Any(x => x is InvocationExpressionSyntax || x is BaseObjectCreationExpressionSyntax);
            if (!calls) return R + ".At(" + line + ")";
            var (names, values) = VarsAt(n.SpanStart, n.SpanStart, AssignedOnEntry(n));
            return R + ".Here(" + line + ", " + names + ", " + values + ")";
        }
        StatementSyntax Here(int line, StatementSyntax s) => ParseStatement(HereArg(line, s) + ";");
        static StatementSyntax Step(int line, (string names, string values) vars, string note) =>
            ParseStatement(R + ".Step(" + line + ", " + vars.names + ", " + vars.values + ", " + note + ");");

        // ── which variables a step shows ──
        static ISet<ISymbol> Set(IEnumerable<ISymbol> symbols) => new HashSet<ISymbol>(symbols, SymbolEqualityComparer.Default);

        DataFlowAnalysis? Flow(SyntaxNode n)
        {
            try
            {
                var flow = n is StatementSyntax st ? model.AnalyzeDataFlow(st) : n is ExpressionSyntax ex ? model.AnalyzeDataFlow(ex) : null;
                return flow != null && flow.Succeeded ? flow : null;
            }
            catch { return null; }   // Roslyn analyses a statement only where it sits in a block (not a loop's or an if's bare body)
        }

        /// <summary>Definitely assigned after `n` ran. A bare embedded statement is analysed through its expression.</summary>
        ISet<ISymbol>? AssignedOnExit(SyntaxNode n)
        {
            var flow = Flow(n);
            if (flow != null) return Set(flow.DefinitelyAssignedOnExit);
            if (n is ExpressionStatementSyntax es && Flow(es.Expression) is { } f) return Set(f.DefinitelyAssignedOnExit);
            if (n is StatementSyntax st) return AssignedOnEntry(st);
            return null;
        }

        /// <summary>Definitely assigned before `n` runs. A bare embedded statement takes the state its guard leaves: the if's or the
        /// loop's condition (true branch), or the loop's own entry.</summary>
        ISet<ISymbol>? AssignedOnEntry(SyntaxNode n)
        {
            var flow = Flow(n);
            if (flow != null) return Set(flow.DefinitelyAssignedOnEntry);
            if (n is ExpressionStatementSyntax es && Flow(es.Expression) is { } f) return Set(f.DefinitelyAssignedOnEntry);
            switch (n.Parent)
            {
                case IfStatementSyntax ifs when ifs.Statement == n: return AssignedOnExit(ifs.Condition);
                case ElseClauseSyntax els when els.Parent is IfStatementSyntax ifs2: return AssignedOnExit(ifs2.Condition);
                case WhileStatementSyntax w: return AssignedOnExit(w.Condition);
                case ForStatementSyntax fo: return fo.Condition != null ? AssignedOnExit(fo.Condition) : AssignedOnEntry(fo);
                case DoStatementSyntax d: return AssignedOnEntry(d);
                case ForEachStatementSyntax fe: return AssignedOnEntry(fe);
            }
            return null;
        }

        (string names, string values) VarsAtEnd(BlockSyntax body)
        {
            ISet<ISymbol>? assigned = null;
            try
            {
                // the LAST statement as the region: a variable declared inside a region is not reported on its exit
                var flow = model.AnalyzeDataFlow(body.Statements.Last());
                if (flow != null && flow.Succeeded) assigned = new HashSet<ISymbol>(flow.DefinitelyAssignedOnExit, SymbolEqualityComparer.Default);
            }
            catch { }
            // at the end of the last statement: the closing brace's own position is outside the block's scope for Roslyn's lookup
            int scope = body.Statements.Count > 0 ? body.Statements.Last().SpanStart : body.OpenBraceToken.Span.End;
            return VarsAt(scope, body.CloseBraceToken.SpanStart, assigned ?? new HashSet<ISymbol>(SymbolEqualityComparer.Default));
        }

        /// <summary>The variables in scope at `scope`, declared before `declaredBefore` and definitely assigned (`assigned`; null = the entry:
        /// parameters only): parameters in order, then locals by declaration. → C# source of the names array and of the values
        /// (a closure, so the step reads them live; a direct array when one cannot be captured: a ref / out / in parameter).</summary>
        (string names, string values) VarsAt(int scope, int declaredBefore, ISet<ISymbol>? assigned, IEnumerable<ISymbol>? written = null)
        {
            // the program's entry (Main, or the course's hidden driver) shows no parameters — as the course records it
            bool entry = method!.Name == "Main" || method.Name == "__Run";
            var parms = entry ? new List<IParameterSymbol>() : method.Parameters.Where(p => p.RefKind != RefKind.Out || (assigned != null && assigned.Contains(p))).ToList();
            var locals = new List<ILocalSymbol>();
            if (assigned != null)
            {
                // the scope is asked at a statement's START (Roslyn's lookup at its last token can fall outside a bare loop body);
                // "declared before the step" is checked against the step's own place
                foreach (var l in model.LookupSymbols(scope).OfType<ILocalSymbol>())
                {
                    var decl = l.DeclaringSyntaxReferences.FirstOrDefault();
                    if (decl == null || decl.SyntaxTree != model.SyntaxTree || decl.Span.End > declaredBefore) continue;
                    if (l.IsRef || l.Type.IsRefLikeType || l.Type.TypeKind == TypeKind.Pointer || l.IsConst) continue;
                    if (!SymbolEqualityComparer.Default.Equals(l.ContainingSymbol, method)) continue;
                    if (!assigned.Contains(l) && !DeclaredUnset(l)) continue;
                    locals.Add(l);
                }
                locals.Sort((a, b) => a.DeclaringSyntaxReferences[0].Span.Start.CompareTo(b.DeclaringSyntaxReferences[0].Span.Start));
            }
            parms = parms.Where(p => !p.Type.IsRefLikeType && p.Type.TypeKind != TypeKind.Pointer).ToList();
            var names = new List<string>();
            var exprs = new List<string>();
            if (hasThis) { names.Add("this"); exprs.Add("this"); }
            foreach (var p in parms) { names.Add(p.Name); exprs.Add("@" + p.Name); }
            // «?a»: declared without a value and not definitely assigned here — shown once a step has written it
            foreach (var l in locals) { names.Add(assigned!.Contains(l) ? l.Name : "?" + l.Name); exprs.Add("@" + l.Name); }
            // «+a» (after the values): this step wrote `a`
            foreach (var w in (written ?? Array.Empty<ISymbol>()).OfType<ILocalSymbol>().Where(DeclaredUnset).Select(x => x.Name).Distinct()) names.Add("+" + w);
            var namesSrc = "new string[] { " + string.Join(", ", names.Select(Lit)) + " }";
            var array = "new object?[] { " + string.Join(", ", exprs) + " }";
            bool direct = parms.Any(p => p.RefKind != RefKind.None);
            return (namesSrc, direct ? R + ".Now(" + array + ")" : "() => " + array);
        }
    }
}
