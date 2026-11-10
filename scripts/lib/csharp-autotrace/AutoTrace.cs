// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §9) — the INSTRUMENTER of the question traces. It reads a C# program
// (exactly as the page shows it, wrapped like any walkthrough) and writes an instrumented copy that records, without changing what the
// program does or prints:
//   • after every declaration / expression statement: the variables in scope that are definitely assigned there (Tr.S);
//   • every condition of if / while / for / do, at the moment it is evaluated, and its value (Tr.C — evaluated ONCE, by the program);
//   • the value a switch switches on (Tr.V), each pass of a foreach, every call of a method (its frame and parameters) and every
//     return with its value (Tr.R);
//   • Main inside try / finally, so the recording is written even when the program throws.
// It only INSERTS text around the program's own syntax (by span); the program's statements, order and output are untouched. Which
// variables a recorder may read comes from the compiler itself: every variable in scope and declared before that point is offered, the
// copy is compiled (with the recorder) and each variable the compiler reports as not yet assigned there (CS0165) is taken out of that
// recorder, until the copy compiles; any other compile error is reported, never patched.
// Input (stdin): { "helper", "items": [{ "key", "source", "offset" }] } — `offset` = the source lines before the page's first line (the
// wrapper); a recorded line is the page's line. Output (stdout): [{ "key", "instrumented" } | { "key", "error" }]. Offline; run in the
// .NET SDK image.
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

static class AutoTrace
{
    const string Usings = "global using global::System;\nglobal using global::System.Collections.Generic;\nglobal using global::System.IO;\nglobal using global::System.Linq;\nglobal using global::System.Net.Http;\nglobal using global::System.Threading;\nglobal using global::System.Threading.Tasks;\n";

    static int Main()
    {
        var doc = JsonDocument.Parse(Console.In.ReadToEnd()).RootElement;
        var helper = doc.GetProperty("helper").GetString()!;
        var input = doc.GetProperty("items");
        var refs = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator).Select(p => (MetadataReference)MetadataReference.CreateFromFile(p)).ToList();
        var results = new List<Dictionary<string, string>>();
        foreach (var item in input.EnumerateArray())
        {
            string key = item.GetProperty("key").GetString()!, source = item.GetProperty("source").GetString()!;
            int offset = item.GetProperty("offset").GetInt32();
            try { results.Add(new() { ["key"] = key, ["instrumented"] = Instrument(source, offset, refs, helper) }); }
            catch (Exception e) { results.Add(new() { ["key"] = key, ["error"] = e.Message }); }
        }
        Console.Out.Write(JsonSerializer.Serialize(results));
        return 0;
    }

    sealed record Edit(int At, int Length, string Text, int Order);

    static string Instrument(string source, int offset, List<MetadataReference> refs, string helper)
    {
        var opts = new CSharpParseOptions(LanguageVersion.Latest);
        var tree = CSharpSyntaxTree.ParseText(source, opts);
        var comp = CSharpCompilation.Create("t", new[] { tree, CSharpSyntaxTree.ParseText(Usings, opts) }, refs, new CSharpCompilationOptions(OutputKind.ConsoleApplication, nullableContextOptions: NullableContextOptions.Enable));
        var errors = comp.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToList();
        if (errors.Count > 0) throw new Exception("the program does not compile: " + errors[0].GetMessage() + " (line " + (errors[0].Location.GetLineSpan().StartLinePosition.Line + 1 - offset) + ")");
        var model = comp.GetSemanticModel(tree);
        var root = tree.GetRoot();
        var edits = new List<Edit>();
        int Line(SyntaxNode n) => n.GetLocation().GetLineSpan().StartLinePosition.Line + 1 - offset;
        int LineOf(SyntaxToken t) => t.GetLocation().GetLineSpan().StartLinePosition.Line + 1 - offset;
        string Q(string s) => SymbolDisplay.FormatLiteral(s, true);

        // the variables offered to a recorder at `position`: in scope there and declared before it (the compile step below takes out
        // any the compiler says is not assigned yet); `assigned` is not used to filter (the flow analysis misses loop variables)
        string Vars(int position, IEnumerable<ISymbol> assigned)
        {
            // the lookup inside a brace-less loop body omits that loop's own variables: add those of every enclosing for / foreach
            var loopVars = new List<ISymbol>();
            foreach (var a in root.FindToken(position).Parent!.AncestorsAndSelf())
            {
                if (a is ForStatementSyntax f && f.Statement.Span.Contains(position) && f.Declaration != null)
                    loopVars.AddRange(f.Declaration.Variables.Select(v => model.GetDeclaredSymbol(v)).OfType<ISymbol>());
                if (a is ForEachStatementSyntax fe && fe.Statement.Span.Contains(position) && model.GetDeclaredSymbol(fe) is ISymbol it) loopVars.Add(it);
            }
            var symbols = model.LookupSymbols(position).Concat(loopVars).Distinct(SymbolEqualityComparer.Default)
                .Where(s => (s is ILocalSymbol l && !l.IsConst) || s is IParameterSymbol)
                .Where(s => s.Locations.Length > 0 && s.Locations[0].IsInSource && s.Locations[0].SourceTree == tree && s.Locations[0].SourceSpan.Start < position)
                .OrderBy(s => s.Locations[0].SourceSpan.Start)
                .ToList();
            return string.Concat(symbols.Select(s => ", " + Q(s.Name) + ", " + s.Name));
        }
        bool Instrumented(SyntaxNode n) =>
            n.Ancestors().FirstOrDefault(a => a is BaseMethodDeclarationSyntax || a is AnonymousFunctionExpressionSyntax || a is LocalFunctionStatementSyntax || a is AccessorDeclarationSyntax) is BaseMethodDeclarationSyntax m
            && m.Body != null && n.SpanStart > m.Body.OpenBraceToken.SpanStart;

        // ── methods: frames ────────────────────────────────────────────────────────────────────────────────────────────────────
        foreach (var m in root.DescendantNodes().OfType<BaseMethodDeclarationSyntax>())
        {
            if (m.Body == null) continue;
            var symbol = model.GetDeclaredSymbol(m) as IMethodSymbol;
            string name = m is MethodDeclarationSyntax md ? md.Identifier.Text : m is ConstructorDeclarationSyntax cd ? cd.Identifier.Text : "?";
            bool isMain = m is MethodDeclarationSyntax mm && mm.Identifier.Text == "Main" && symbol != null && symbol.IsStatic;
            var open = m.Body.OpenBraceToken.Span.End;
            var close = m.Body.CloseBraceToken.SpanStart;
            if (isMain)
            {
                edits.Add(new Edit(open, 0, " Tr.Begin(); try {", 0));
                edits.Add(new Edit(close, 0, " } finally { Tr.End(); } ", 9));
            }
            else
            {
                var pars = symbol == null ? "" : string.Concat(symbol.Parameters.Where(p => p.RefKind != RefKind.Out).Select(p => ", " + Q(p.Name) + ", " + p.Name));
                edits.Add(new Edit(open, 0, " Tr.Enter(" + Q(name) + "); Tr.S(" + Line(m) + ", \"enter\"" + pars + "); try {", 0));
                edits.Add(new Edit(close, 0, " } finally { Tr.Leave(); } ", 9));
            }
        }

        // ── statements ─────────────────────────────────────────────────────────────────────────────────────────────────────────
        foreach (var st in root.DescendantNodes().OfType<StatementSyntax>().Where(Instrumented))
        {
            bool embedded = st.Parent is not BlockSyntax && st.Parent is not SwitchSectionSyntax && st is not BlockSyntax;
            string? after = null, before = null;
            if (st is LocalDeclarationStatementSyntax || st is ExpressionStatementSyntax)
            {
                var flow = model.AnalyzeDataFlow(st);
                if (flow != null && flow.Succeeded)
                    after = " Tr.S(" + Line(st) + ", " + (st is LocalDeclarationStatementSyntax ? "\"decl\"" : "\"expr\"") + Vars(st.Span.End - 1, flow.DefinitelyAssignedOnExit) + ");";   // inside the statement: an embedded body's end is its loop's end
            }
            else if (st is ReturnStatementSyntax rs)
            {
                var flow = model.AnalyzeDataFlow(st);
                var vars = flow != null && flow.Succeeded ? Vars(st.SpanStart, flow.DefinitelyAssignedOnEntry) : "";
                if (rs.Expression != null)
                {
                    var type = model.GetTypeInfo(rs.Expression).ConvertedType;
                    var cast = type == null || type.SpecialType == SpecialType.None && type.TypeKind == TypeKind.Error ? "" : "<" + type.ToDisplayString() + ">";
                    edits.Add(new Edit(rs.Expression.SpanStart, 0, "Tr.R" + cast + "(" + Line(st) + ", " + Q("return " + rs.Expression.ToString()) + ", (", 1));
                    edits.Add(new Edit(rs.Expression.Span.End, 0, ")" + vars + ")", 8));
                }
                else before = " Tr.S(" + Line(st) + ", \"return\"" + vars + ");";
            }
            if (after == null && before == null) continue;
            if (embedded)
            {
                edits.Add(new Edit(st.SpanStart, 0, "{" + (before ?? ""), 2));
                edits.Add(new Edit(st.Span.End, 0, (after ?? "") + " }", 7));
            }
            else
            {
                if (before != null) edits.Add(new Edit(st.SpanStart, 0, before + " ", 2));
                if (after != null) edits.Add(new Edit(st.Span.End, 0, after, 7));
            }
        }

        // ── conditions, switch, foreach ────────────────────────────────────────────────────────────────────────────────────────
        void Cond(ExpressionSyntax? c, string kind, int line)
        {
            if (c == null || !Instrumented(c)) return;
            var flow = model.AnalyzeDataFlow(c);
            var vars = flow != null && flow.Succeeded ? Vars(c.SpanStart, flow.DefinitelyAssignedOnEntry) : "";
            edits.Add(new Edit(c.SpanStart, 0, "Tr.C(" + line + ", " + Q(kind) + ", " + Q(c.ToString()) + ", (", 1));
            edits.Add(new Edit(c.Span.End, 0, ")" + vars + ")", 8));
        }
        foreach (var n in root.DescendantNodes())
        {
            switch (n)
            {
                case IfStatementSyntax s: Cond(s.Condition, s.Parent is ElseClauseSyntax ? "elseif" : "if", LineOf(s.IfKeyword)); break;
                case WhileStatementSyntax s: Cond(s.Condition, "while", LineOf(s.WhileKeyword)); break;
                case DoStatementSyntax s: Cond(s.Condition, "do", LineOf(s.WhileKeyword)); break;
                case ForStatementSyntax s: Cond(s.Condition, "for", LineOf(s.ForKeyword)); break;
                case SwitchStatementSyntax s when Instrumented(s):
                {
                    var flow = model.AnalyzeDataFlow(s.Expression);
                    var vars = flow != null && flow.Succeeded ? Vars(s.Expression.SpanStart, flow.DefinitelyAssignedOnEntry) : "";
                    edits.Add(new Edit(s.Expression.SpanStart, 0, "Tr.V(" + LineOf(s.SwitchKeyword) + ", " + Q("switch") + ", " + Q(s.Expression.ToString()) + ", (", 1));
                    edits.Add(new Edit(s.Expression.Span.End, 0, ")" + vars + ")", 8));
                    break;
                }
                case ForEachStatementSyntax s when Instrumented(s):
                {
                    var flow = model.AnalyzeDataFlow(s.Statement);
                    var vars = flow != null && flow.Succeeded ? Vars(s.Statement is BlockSyntax b ? b.OpenBraceToken.Span.End : s.Statement.SpanStart, flow.DefinitelyAssignedOnEntry) : "";
                    var rec = " Tr.S(" + LineOf(s.ForEachKeyword) + ", \"foreach\"" + vars + ");";
                    if (s.Statement is BlockSyntax block) edits.Add(new Edit(block.OpenBraceToken.Span.End, 0, rec, 3));
                    else { edits.Add(new Edit(s.Statement.SpanStart, 0, "{" + rec + " ", 3)); edits.Add(new Edit(s.Statement.Span.End, 0, " }", 7)); }
                    break;
                }
            }
        }

        // apply from the end; at one position: closers (high Order) before openers, so nesting stays balanced
        var text = source;
        foreach (var e in edits.OrderByDescending(e => e.At).ThenBy(e => e.Order))
            text = text.Substring(0, e.At) + e.Text + text.Substring(e.At + e.Length);

        // compile the copy with the recorder: take out of a recorder each variable not assigned yet at that point (CS0165)
        var helperTree = CSharpSyntaxTree.ParseText(helper, opts);
        for (int round = 0; round < 200; round++)
        {
            var t = CSharpSyntaxTree.ParseText(text, opts);
            var c = CSharpCompilation.Create("i", new[] { t, helperTree, CSharpSyntaxTree.ParseText(Usings, opts) }, refs, new CSharpCompilationOptions(OutputKind.ConsoleApplication, nullableContextOptions: NullableContextOptions.Enable));
            var errs = c.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error && d.Location.SourceTree == t).ToList();
            if (errs.Count == 0) return text;
            var unassigned = errs.Where(d => d.Id == "CS0165" || d.Id == "CS0269").OrderByDescending(d => d.Location.SourceSpan.Start).ToList();
            if (unassigned.Count == 0 || unassigned.Count < errs.Count) throw new Exception("the instrumented copy does not compile: " + errs.First(d => d.Id != "CS0165" && d.Id != "CS0269").GetMessage());
            // remove `, "name", name` around each reported identifier (one per round per position, from the end)
            foreach (var d in unassigned)
            {
                int at = d.Location.SourceSpan.Start, len = d.Location.SourceSpan.Length;
                string name = text.Substring(at, len);
                string pair = ", " + Q(name) + ", " + name;
                int start = at - (", " + Q(name) + ", ").Length;
                if (start < 0 || text.Substring(start, pair.Length) != pair) throw new Exception("an unassigned variable outside a recorder: " + name);
                text = text.Remove(start, pair.Length);
            }
        }
        throw new Exception("the instrumented copy did not settle");
    }
}
