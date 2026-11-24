// Teacher C# lab, phase V2 — the RECORDER compiled INTO a traced program (Tracer.cs plants the calls). Kept as source text: it must
// live in the program's own assembly, next to the writer's classes. Its rules are the course recorder's (scripts/ds-course/cs-lite.mjs):
//   • a step = { line, note, frames: [{ name, vars: [[name, value]] }], objs, out } — the state AFTER the line ran;
//   • a value: { t: "v", s } (a C# literal: 5, 2.5, true, "text", 'c'), { t: "null" }, { t: "ref", id }, { t: "arr", items: [cells] };
//   • an object: the book's Stack<T> / Queue<T> as their items (top / head first — what ToString prints), its Node / Node<T> as a
//     cell with its next, BinNode<T> as a cell with left and right, any class of the writer with its fields in declaration order;
//   • a cell (an item, a node's value): a value as Console prints it, a writer's object by its own ToString or "(field, field)";
//   • ids: one per object for the whole trace (the first time it is seen), so a drawing can follow it from step to step;
//   • lines past `shown` are a hidden driver: their steps fold into one closing step (line 0), as the course records them;
//   • a run-time error adds a last step on the line that failed, with the state of the last step (error: true).
// Nothing is recorded while the recorder itself reads a value (a writer's ToString runs muted), or inside a method named «quiet».
// Visual lab V5 (plan §13) — RICH mode (the teacher's visual run only; the course's traces are recorded without it, unchanged):
//   • an item of a structure, a cell's value, that is itself an object or a structure keeps its text AND a reference to it
//     ("refs": [id | null] beside "items", "ref": id on a node / tree cell), and that object is recorded too (Queue<Student>,
//     Node<Student>, Stack<Queue<int>>);
//   • an array, List<T> and LinkedList<T> are objects of their own: { k: "array", type, items, refs? } (a variable holds a reference);
//     HashSet<T> / SortedSet<T> → { k: "set", type, items, refs? }; Dictionary / SortedDictionary / SortedList →
//     { k: "map", type, keys, items, refs? }; C#'s own Stack<T> / Queue<T> → the same "stack" / "queue" as the book's.
// Visual lab V8 (plan §17) — also in RICH mode: every frame carries "call" (one number per call, for the whole run), and the step on
//     which a method returns carries "ret" (the value, as a literal) — what the call tree is drawn from.
// Visual lab V9 (plan §18) — also in RICH mode: a step carries "evals" ([[expression, value]], at most 12): the value of every `/`, `%`,
//     comparison, `&&`, `||` and `!` the writer's code evaluated since the step before (Tracer.cs wraps them in E, which returns the
//     value unchanged, short-circuit kept); a frame carries "types" beside "vars" (each variable's declared type, as C# writes it);
//     a two-dimensional array is an object { k: "grid", type, rows: [[cells]] }.
// Visual lab V11 (plan §21) — also in RICH mode:
//   • a value of the writer's own struct is { t: "rec", type, fields: [[name, value]] } (a value, not an object: no id, no arrow;
//     a struct inside a struct up to 3 deep); its short text is "(field, field)" like a class's, not the bare type name;
//   • a step carries "statics": [{ name, vars }] — the static fields of the writer's types, read ONLY when reading them cannot run
//     anything early: a type with no static constructor whose static initialisers do nothing but build values (Tracer.cs decides,
//     StaticsReady), or a type whose static constructor has started (Tracer.cs plants Ready(typeof(T)) as its first statement).
// Visual lab V12 (plan §22) — also in RICH mode: every frame carries "from", the line of its CALLER where the call was made (0 for the
//     method the run starts from); with Tracer.cs's table of call sites ("calls") the drawing knows which argument each parameter got.
internal static class TraceRuntime
{
    /// <summary>Visual lab V4 — the class a teacher's program may call IN THE VISUAL RUN ONLY (it is compiled into traced programs, never
    /// into «تشغيل» or teacher-device grading): Viz.Show("…") gives the step a title of the writer's own; Viz.Pause() makes it a
    /// stop for the player's auto-play. A program that declares its own class Viz keeps it (this one is then left out).</summary>
    internal const string VizSource = @"
public static class Viz
{
    public static void Show(string title) => global::__LabTrace.Show(title);
    public static void Pause(string? reason = null) => global::__LabTrace.Pause(reason);
}
";
    internal const string Source = @"
#nullable enable
internal sealed class __LabTraceLimit : global::System.Exception { }

internal static class __LabTrace
{
    sealed class Frame
    {
        public string Name = """"; public bool Quiet; public int Call, From; public string[] Names = new string[0]; public global::System.Func<object?[]> Values = () => new object?[0];
        public readonly global::System.Collections.Generic.HashSet<string> Written = new global::System.Collections.Generic.HashSet<string>();
    }
    sealed class Box { public int Id; }

    static global::System.IO.StringWriter output = new global::System.IO.StringWriter();
    static int shown = int.MaxValue, maxSteps = 5000, muted, count, line;
    static global::System.Collections.Generic.HashSet<string> quiet = new global::System.Collections.Generic.HashSet<string>();
    static global::System.Collections.Generic.HashSet<string> libraryTypes = new global::System.Collections.Generic.HashSet<string>();
    static readonly global::System.Collections.Generic.List<Frame> frames = new global::System.Collections.Generic.List<Frame>();
    static readonly global::System.Runtime.CompilerServices.ConditionalWeakTable<object, Box> ids = new global::System.Runtime.CompilerServices.ConditionalWeakTable<object, Box>();
    static int nextId = 1;
    static readonly global::System.Text.StringBuilder steps = new global::System.Text.StringBuilder();
    static string lastFrames = ""[]"", lastObjs = ""[]"";
    static string? lastStatics, pendingStatics;
    static string? pendingFrames, pendingObjs;
    static readonly global::System.Collections.Generic.List<global::System.Type> staticTypes = new global::System.Collections.Generic.List<global::System.Type>();   // V11, in the order they became readable

    static bool rich;              // V5: rich types (see the header)
    static int calls;              // V8: the calls so far (a frame's call number)
    static string? returning;      // V8: the value the method returns on the step being recorded
    static readonly global::System.Collections.Generic.List<string> evals = new global::System.Collections.Generic.List<string>();   // V9
    static bool inside;            // «اكشف الداخل»: the book's Stack<T> / Queue<T> recorded as the objects they are (Head / First, Last → Node<T>)
    static string? markNote;       // Viz.Show(title) / Viz.Pause(reason): the next recorded step carries the title …
    static bool markPause;         // … and, for Pause, a stop for the player
    public static void Configure(global::System.IO.StringWriter @out, int shownLines, int max, string[] quietNames, string[] library, bool insideMode, bool richMode)
    {
        inside = insideMode; rich = richMode;
        output = @out; shown = shownLines; maxSteps = max; quiet = new global::System.Collections.Generic.HashSet<string>(quietNames);
        libraryTypes = new global::System.Collections.Generic.HashSet<string>(library);
    }

    // ── the planted calls ──
    public static int At(int l) { line = l; return l; }
    /// <summary>The current frame's variables now (before a statement that calls a method); records nothing.</summary>
    public static int Here(int l, string[] names, global::System.Func<object?[]> values)
    {
        line = l;
        if (frames.Count > 0) { var top = frames[frames.Count - 1]; top.Names = names; top.Values = values; }
        return l;
    }
    public static object Enter(string name)
    {
        var f = new Frame { Name = name, Quiet = quiet.Contains(name), Call = ++calls, From = frames.Count > 0 ? line : 0 };   // V12: the caller's line
        if (f.Quiet) muted++;
        frames.Add(f);
        return f;
    }
    public static void Leave(object f)
    {
        var frame = (Frame)f;
        int i = frames.LastIndexOf(frame);
        if (i >= 0) frames.RemoveRange(i, frames.Count - i);
        if (frame.Quiet) muted--;
    }
    public static global::System.Func<object?[]> Now(object?[] values) => () => values;
    public static void Step(int l, string[] names, global::System.Func<object?[]> values, string note) { line = l; Record(l, names, values, note); }
    public static bool Test(int at, bool value, int l, string[] names, global::System.Func<object?[]> values, string text)
    {
        Record(l, names, values, ""الشرط `"" + text + ""` "" + (value ? ""صحيح"" : ""غير صحيح"") + ""."");
        return value;
    }
    public static T Return<T>(int at, T value, int l, string[] names, global::System.Func<object?[]> values)
    {
        returning = rich ? Lit(value) : null;
        try { Record(l, names, values, ""العملية تُعيد `"" + Lit(value) + ""`.""); }
        finally { returning = null; }
        return value;
    }
    /// <summary>V9: an expression's value, noted for the next step (rich mode); returns the value itself, so the program is unchanged.</summary>
    public static T E<T>(T value, string text)
    {
        if (rich && muted == 0 && evals.Count < 12) evals.Add(""["" + Json(text) + "","" + Json(Lit(value)) + ""]"");
        return value;
    }
    /// <summary>V11: the first statement of a writer's static constructor (Tracer.cs plants it): from now on its statics may be read.</summary>
    public static void Ready(global::System.Type t) { if (rich && !staticTypes.Contains(t)) staticTypes.Add(t); }
    /// <summary>V11: the types whose statics may be read from the start (no static constructor; initialisers that only build values).</summary>
    public static void StaticsReady(string[] names)
    {
        foreach (var n in names) { var t = typeof(__LabTrace).Assembly.GetType(n); if (t != null) Ready(t); }
    }
    public static void StepValue<T>(T value, int l, string[] names, global::System.Func<object?[]> values) => Record(l, names, values, """");
    public static void StepAfter(global::System.Action a, int l, string[] names, global::System.Func<object?[]> values) { a(); Record(l, names, values, """"); }

    // ── recording ──
    static void Record(int l, string[] names, global::System.Func<object?[]> values, string note)
    {
        if (frames.Count == 0) return;
        var top = frames[frames.Count - 1];
        top.Names = names; top.Values = values;
        foreach (var n in names) if (n.Length > 1 && n[0] == '+') top.Written.Add(n.Substring(1));   // «+a»: this step wrote a
        if (muted > 0) { evals.Clear(); return; }
        var (fr, ob, st) = Snapshot();
        if (l > shown) { pendingFrames = fr; pendingObjs = ob; pendingStatics = st; evals.Clear(); return; }
        pendingFrames = pendingObjs = pendingStatics = null;
        if (count >= maxSteps) throw new __LabTraceLimit();
        bool pause = markPause;
        if (markNote != null) note = markNote;
        markNote = null; markPause = false;
        Append(l, note, fr, ob, false, pause, returning, evals.Count > 0 ? ""["" + string.Join("","", evals) + ""]"" : null, st);
        evals.Clear();
        lastFrames = fr; lastObjs = ob; lastStatics = st;
    }

    static void Append(int l, string note, string fr, string ob, bool error, bool pause = false, string? ret = null, string? evalsJson = null, string? statics = null)
    {
        if (count > 0) steps.Append(',');
        steps.Append(""{\""line\"":"").Append(l).Append("",\""note\"":"").Append(Json(note)).Append("",\""frames\"":"").Append(fr)
             .Append("",\""objs\"":"").Append(ob).Append("",\""out\"":"").Append(Json(output.ToString()));
        if (error) steps.Append("",\""error\"":true"");
        if (pause) steps.Append("",\""pause\"":true"");
        if (ret != null) steps.Append("",\""ret\"":"").Append(Json(ret));
        if (evalsJson != null) steps.Append("",\""evals\"":"").Append(evalsJson);
        if (statics != null) steps.Append("",\""statics\"":"").Append(statics);
        steps.Append('}');
        count++;
    }

    public static void Finish() { if (pendingFrames != null) Append(0, ""انتهى التنفيذ."", pendingFrames, pendingObjs!, false, statics: pendingStatics); }
    public static void Fail() { if (line <= shown) Append(line, ""خطأ في التشغيل: البرنامج يتوقّف هنا."", lastFrames, lastObjs, true, statics: lastStatics); }
    public static string StepsJson() => ""["" + steps + ""]"";
    /// <summary>Viz.Show / Viz.Pause (the visual run's own class, TraceRuntime.VizSource): marks the step of the statement that called it.</summary>
    public static void Show(string title) { markNote = string.IsNullOrWhiteSpace(title) ? null : title; }
    public static void Pause(string? reason) { markPause = true; if (!string.IsNullOrWhiteSpace(reason)) markNote = reason; }

    // ── the snapshot ──
    static (string frames, string objs, string? statics) Snapshot()
    {
        muted++;
        try
        {
            var objs = new global::System.Collections.Generic.SortedDictionary<int, string>();
            var sb = new global::System.Text.StringBuilder(""["");
            var list = frames.ToArray();
            for (int i = 0; i < list.Length; i++)
            {
                var f = list[i];
                object?[] vals;
                try { vals = f.Values(); } catch { vals = new object?[0]; }
                if (i > 0) sb.Append(',');
                sb.Append(""{\""name\"":"").Append(Json(f.Name));
                if (rich) sb.Append("",\""call\"":"").Append(f.Call).Append("",\""from\"":"").Append(f.From);
                sb.Append("",\""vars\"":["");
                bool firstVar = true;
                var types = new global::System.Collections.Generic.List<string>();   // V9: «name|type» in rich mode
                for (int j = 0; j < f.Names.Length && j < vals.Length; j++)
                {
                    var name = f.Names[j];
                    string? type = null;
                    int bar = name.IndexOf('|');
                    if (bar > 0) { type = name.Substring(bar + 1); name = name.Substring(0, bar); }
                    if (name.Length > 1 && name[0] == '?') { name = name.Substring(1); if (!f.Written.Contains(name)) continue; }   // not written yet
                    if (!firstVar) sb.Append(',');
                    firstVar = false;
                    types.Add(type == null ? ""null"" : Json(type));
                    sb.Append('[').Append(Json(name)).Append(',').Append(Val(vals[j])).Append(']');
                    Visit(vals[j], objs);
                    if (vals[j] is global::System.Array arr && arr.Rank == 1) foreach (var x in arr) Visit(x, objs);
                }
                sb.Append(']');
                if (rich && types.Exists(t => t != ""null"")) sb.Append("",\""types\"":["").Append(string.Join("","", types)).Append(']');
                sb.Append('}');
            }
            sb.Append(']');
            var statics = rich && staticTypes.Count > 0 ? StaticsOf(objs) : null;
            return (sb.ToString(), ""["" + string.Join("","", objs.Values) + ""]"", statics);
        }
        finally { muted--; }
    }

    /// <summary>V11: [{ name, vars }] — each readable type's static fields (not const), declaration order; at most 10 types × 30.</summary>
    static string StaticsOf(global::System.Collections.Generic.SortedDictionary<int, string> objs)
    {
        var sb = new global::System.Text.StringBuilder(""["");
        int shownTypes = 0;
        foreach (var t in staticTypes)
        {
            if (shownTypes == 10) break;
            var fs = global::System.Array.FindAll(t.GetFields(global::System.Reflection.BindingFlags.Static | global::System.Reflection.BindingFlags.Public | global::System.Reflection.BindingFlags.NonPublic | global::System.Reflection.BindingFlags.DeclaredOnly),
                f => !f.IsLiteral && (!f.Name.Contains(""<"") || f.Name.EndsWith("">k__BackingField"")));
            if (fs.Length == 0) continue;
            global::System.Array.Sort(fs, (a, b) => a.MetadataToken.CompareTo(b.MetadataToken));
            var vars = new global::System.Text.StringBuilder();
            int n = 0;
            foreach (var f in fs)
            {
                if (n == 30) break;
                object? v;
                try { v = f.GetValue(null); } catch { continue; }
                if (n++ > 0) vars.Append(',');
                vars.Append('[').Append(Json(FieldName(f.Name))).Append(',').Append(Val(v)).Append(']');
                Visit(v, objs);
            }
            if (shownTypes++ > 0) sb.Append(',');
            var tn = t.Name; int tick = tn.IndexOf('`'); if (tick > 0) tn = tn.Substring(0, tick);
            sb.Append(""{\""name\"":"").Append(Json(tn)).Append("",\""vars\"":["").Append(vars).Append(""]}"");
        }
        return sb.Append(']').ToString();
    }

    /// <summary>V11: a value of one of the writer's own structs (rich mode): drawn as its fields, not as its type's name.</summary>
    static bool IsStruct(object v)
    {
        if (!rich) return false;
        var t = v.GetType();
        return t.IsValueType && !t.IsEnum && !t.IsPrimitive && t.Assembly == typeof(__LabTrace).Assembly && !t.Name.StartsWith(""__Lab"") && !t.Name.Contains(""<"");
    }
    static string Rec(object v, int depth)
    {
        var t = v.GetType();
        var tn = t.Name; int tick = tn.IndexOf('`'); if (tick > 0) tn = tn.Substring(0, tick);
        var sb = new global::System.Text.StringBuilder(""{\""t\"":\""rec\"",\""type\"":"").Append(Json(tn)).Append("",\""fields\"":["");
        var fs = Fields(t);
        for (int i = 0; i < fs.Length && i < 30; i++)
        {
            if (i > 0) sb.Append(',');
            var x = fs[i].GetValue(v);
            sb.Append('[').Append(Json(FieldName(fs[i].Name))).Append(',')
              .Append(x != null && IsStruct(x) && depth >= 2 ? ""{\""t\"":\""v\"",\""s\"":"" + Json(Cell(x)) + ""}"" : Val(x, depth + 1)).Append(']');
        }
        return sb.Append(""]}"").ToString();
    }

    static string Kind(object o)
    {
        var t = o.GetType();
        if (rich) { var ck = CollectionKind(o, t); if (ck != """") return ck; }
        if (o is string || t.IsValueType || t.IsArray || t.Assembly != typeof(__LabTrace).Assembly) return """";
        var name = t.Name;
        if (libraryTypes.Contains(name))
        {
            if (inside && (name == ""Stack`1"" || name == ""Queue`1"")) return ""obj"";   // «اكشف الداخل»: its fields and its Node<T> chain
            if (name == ""Stack`1"") return ""stack"";
            if (name == ""Queue`1"") return ""queue"";
            if (name == ""Node"" || name == ""Node`1"") return ""node"";
            if (name == ""BinNode`1"") return ""bin"";
            return """";
        }
        if (name.StartsWith(""__Lab"") || name.Contains(""<"") || name == ""Program"" && t.GetFields(Inst).Length == 0) return """";
        return ""obj"";
    }

    /// <summary>V5: C#'s own collections (and arrays) as structures of their own — rich mode only.</summary>
    static string CollectionKind(object o, global::System.Type t)
    {
        if (o is string) return """";
        if (t.IsArray) return t.GetArrayRank() == 1 ? ""array"" : t.GetArrayRank() == 2 ? ""grid"" : """";
        if (!t.IsGenericType || t.Assembly == typeof(__LabTrace).Assembly) return """";
        var d = t.GetGenericTypeDefinition();
        if (d == typeof(global::System.Collections.Generic.List<>) || d == typeof(global::System.Collections.Generic.LinkedList<>)) return ""array"";
        if (d == typeof(global::System.Collections.Generic.Stack<>)) return ""stack"";
        if (d == typeof(global::System.Collections.Generic.Queue<>)) return ""queue"";
        if (d == typeof(global::System.Collections.Generic.HashSet<>) || d == typeof(global::System.Collections.Generic.SortedSet<>)) return ""set"";
        if (d == typeof(global::System.Collections.Generic.Dictionary<,>) || d == typeof(global::System.Collections.Generic.SortedDictionary<,>)
            || d == typeof(global::System.Collections.Generic.SortedList<,>)) return ""map"";
        return """";
    }
    static bool IsBook(object o) => o.GetType().Assembly == typeof(__LabTrace).Assembly;
    /// <summary>The items of a structure, in the order ToString prints them: the book's from its head (Head / First → Next), C#'s own
    /// as they enumerate (a Stack from its top, a Queue from its head). At most 200.</summary>
    static global::System.Collections.Generic.List<object?> ItemsOf(object v, string kind)
    {
        var list = new global::System.Collections.Generic.List<object?>();
        if ((kind == ""stack"" || kind == ""queue"") && IsBook(v))
        {
            var seen = new global::System.Collections.Generic.HashSet<object>(global::System.Collections.Generic.ReferenceEqualityComparer.Instance);
            for (var p = Field(v, kind == ""stack"" ? ""Head"" : ""First""); p != null && seen.Add(p) && list.Count < 200; p = Field(p, ""Next"")) list.Add(Field(p, ""Value""));
            return list;
        }
        if (v is global::System.Collections.IEnumerable e) foreach (var x in e) { if (list.Count >= 200) break; list.Add(x); }
        return list;
    }
    static string Cells(global::System.Collections.Generic.List<object?> vals)
    {
        var sb = new global::System.Text.StringBuilder(""["");
        for (int i = 0; i < vals.Count; i++) { if (i > 0) sb.Append(','); sb.Append(Json(Cell(vals[i]))); }
        return sb.Append(']').ToString();
    }
    /// <summary>V5: ,""refs"":[id|null…] when an item is an object or a structure (nothing otherwise); those are recorded too.</summary>
    static void Refs(global::System.Text.StringBuilder sb, global::System.Collections.Generic.List<object?> vals, global::System.Collections.Generic.SortedDictionary<int, string> objs)
    {
        if (!rich) return;
        bool any = false;
        foreach (var x in vals) if (x != null && Kind(x) != """") { any = true; break; }
        if (!any) return;
        sb.Append("",\""refs\"":["");
        for (int i = 0; i < vals.Count; i++) { if (i > 0) sb.Append(','); var x = vals[i]; sb.Append(x != null && Kind(x) != """" ? IdOf(x).ToString() : ""null""); }
        sb.Append(']');
    }
    static void VisitAll(global::System.Collections.Generic.List<object?> vals, global::System.Collections.Generic.SortedDictionary<int, string> objs)
    {
        if (rich) foreach (var x in vals) Visit(x, objs);
    }
    /// <summary>A type as C# writes it: int[] · List<string> · Dictionary<string, int>.</summary>
    static string TypeName(global::System.Type t)
    {
        if (t.IsArray) return TypeName(t.GetElementType()!) + ""["" + new string(',', t.GetArrayRank() - 1) + ""]"";
        if (t == typeof(int)) return ""int""; if (t == typeof(long)) return ""long""; if (t == typeof(double)) return ""double"";
        if (t == typeof(float)) return ""float""; if (t == typeof(decimal)) return ""decimal""; if (t == typeof(bool)) return ""bool"";
        if (t == typeof(char)) return ""char""; if (t == typeof(string)) return ""string""; if (t == typeof(byte)) return ""byte"";
        if (t == typeof(short)) return ""short""; if (t == typeof(object)) return ""object"";
        var n = t.Name; int tick = n.IndexOf('`'); if (tick > 0) n = n.Substring(0, tick);
        if (!t.IsGenericType) return n;
        var args = t.GetGenericArguments();
        var parts = new string[args.Length];
        for (int i = 0; i < args.Length; i++) parts[i] = TypeName(args[i]);
        return n + ""<"" + string.Join("", "", parts) + "">"";
    }

    const global::System.Reflection.BindingFlags Inst = global::System.Reflection.BindingFlags.Instance | global::System.Reflection.BindingFlags.Public | global::System.Reflection.BindingFlags.NonPublic;
    static object? Field(object o, string name) => o.GetType().GetField(name, Inst)?.GetValue(o);
    static global::System.Reflection.FieldInfo[] Fields(global::System.Type t)
    {
        var list = new global::System.Collections.Generic.List<global::System.Reflection.FieldInfo>();
        for (var x = t; x != null && x != typeof(object); x = x.BaseType)
        {
            var own = x.GetFields(Inst | global::System.Reflection.BindingFlags.DeclaredOnly);
            global::System.Array.Sort(own, (a, b) => a.MetadataToken.CompareTo(b.MetadataToken));
            list.InsertRange(0, own);
        }
        return list.ToArray();
    }
    static string FieldName(string n) { int a = n.IndexOf('<'), b = n.IndexOf('>'); return a == 0 && b > 0 ? n.Substring(1, b - 1) : n; }

    static int IdOf(object o)
    {
        if (!ids.TryGetValue(o, out var box)) { box = new Box { Id = nextId++ }; ids.Add(o, box); }
        return box.Id;
    }

    static void Visit(object? v, global::System.Collections.Generic.SortedDictionary<int, string> objs)
    {
        if (v == null) return;
        if (IsStruct(v)) { foreach (var f in Fields(v.GetType())) Visit(f.GetValue(v), objs); return; }   // V11: what a struct's fields refer to
        var kind = Kind(v);
        if (kind == """") return;
        int id = IdOf(v);
        if (objs.ContainsKey(id)) return;
        var sb = new global::System.Text.StringBuilder(""{\""id\"":"").Append(id).Append("",\""k\"":\"""").Append(kind).Append('""');
        objs[id] = """";
        switch (kind)
        {
            case ""stack"": case ""queue"": case ""array"": case ""set"":
            {
                var vals = ItemsOf(v, kind);
                if (kind == ""array"" || kind == ""set"") sb.Append("",\""type\"":"").Append(Json(TypeName(v.GetType())));
                sb.Append("",\""items\"":"").Append(Cells(vals));
                Refs(sb, vals, objs);
                objs[id] = sb.Append('}').ToString();
                VisitAll(vals, objs);
                return;
            }
            case ""grid"":   // V9: a two-dimensional array, row by row (at most 20 × 20)
            {
                var g = (global::System.Array)v;
                int rows = global::System.Math.Min(g.GetLength(0), 20), cols = global::System.Math.Min(g.GetLength(1), 20);
                sb.Append("",\""type\"":"").Append(Json(TypeName(v.GetType()))).Append("",\""rows\"":["");
                var inside = new global::System.Collections.Generic.List<object?>();
                for (int r = 0; r < rows; r++)
                {
                    if (r > 0) sb.Append(',');
                    var row = new global::System.Collections.Generic.List<object?>();
                    for (int c = 0; c < cols; c++) row.Add(g.GetValue(g.GetLowerBound(0) + r, g.GetLowerBound(1) + c));
                    sb.Append(Cells(row));
                    inside.AddRange(row);
                }
                objs[id] = sb.Append(""]}"").ToString();
                VisitAll(inside, objs);
                return;
            }
            case ""map"":
            {
                var keys = new global::System.Collections.Generic.List<object?>();
                var vals = new global::System.Collections.Generic.List<object?>();
                foreach (global::System.Collections.DictionaryEntry de in (global::System.Collections.IDictionary)v) { if (keys.Count >= 200) break; keys.Add(de.Key); vals.Add(de.Value); }
                sb.Append("",\""type\"":"").Append(Json(TypeName(v.GetType()))).Append("",\""keys\"":"").Append(Cells(keys)).Append("",\""items\"":"").Append(Cells(vals));
                Refs(sb, vals, objs);
                objs[id] = sb.Append('}').ToString();
                VisitAll(vals, objs);
                return;
            }
            case ""node"":
            {
                var next = Field(v, ""Next""); var value = Field(v, ""Value"");
                sb.Append("",\""v\"":"").Append(Json(Cell(value))).Append("",\""next\"":"").Append(next == null ? ""null"" : IdOf(next).ToString());
                if (rich && value != null && Kind(value) != """") sb.Append("",\""ref\"":"").Append(IdOf(value));
                objs[id] = sb.Append('}').ToString();
                Visit(next, objs);
                if (rich) Visit(value, objs);
                return;
            }
            case ""bin"":
            {
                var l = Field(v, ""Left""); var r = Field(v, ""Right""); var value = Field(v, ""Value"");
                sb.Append("",\""v\"":"").Append(Json(Cell(value))).Append("",\""l\"":"").Append(l == null ? ""null"" : IdOf(l).ToString())
                  .Append("",\""r\"":"").Append(r == null ? ""null"" : IdOf(r).ToString());
                if (rich && value != null && Kind(value) != """") sb.Append("",\""ref\"":"").Append(IdOf(value));
                objs[id] = sb.Append('}').ToString();
                Visit(l, objs); Visit(r, objs);
                if (rich) Visit(value, objs);
                return;
            }
            default:
            {
                var t = v.GetType();
                var tn = t.Name; int tick = tn.IndexOf('`'); if (tick > 0) tn = tn.Substring(0, tick);
                sb.Append("",\""type\"":"").Append(Json(tn)).Append("",\""fields\"":["");
                var fs = Fields(t);
                var values = new object?[fs.Length];
                for (int i = 0; i < fs.Length; i++)
                {
                    values[i] = fs[i].GetValue(v);
                    if (i > 0) sb.Append(',');
                    sb.Append('[').Append(Json(FieldName(fs[i].Name))).Append(',').Append(Val(values[i])).Append(']');
                }
                objs[id] = sb.Append(""]}"").ToString();
                foreach (var x in values) Visit(x, objs);
                return;
            }
        }
        objs[id] = sb.Append('}').ToString();
    }

    // ── values, as the course writes them ──
    static string Val(object? v, int depth = 0)
    {
        if (v == null) return ""{\""t\"":\""null\""}"";
        if (IsStruct(v)) return Rec(v, depth);   // V11
        if (Kind(v) != """") return ""{\""t\"":\""ref\"",\""id\"":"" + IdOf(v) + ""}"";
        if (v is global::System.Array a && a.Rank == 1)
        {
            var sb = new global::System.Text.StringBuilder(""{\""t\"":\""arr\"",\""items\"":["");
            int i = 0;
            foreach (var x in a) { if (i++ > 0) sb.Append(','); sb.Append(Json(Cell(x))); }
            return sb.Append(""]}"").ToString();
        }
        return ""{\""t\"":\""v\"",\""s\"":"" + Json(Lit(v)) + ""}"";
    }

    /// <summary>As a C# literal (a variable's box): 5 · 2.5 · true · ""text"" · 'c'.</summary>
    static string Lit(object? v)
    {
        if (v == null) return ""null"";
        if (v is bool b) return b ? ""true"" : ""false"";
        if (v is string s) return ""\"""" + s + ""\"""";
        if (v is char c) return ""'"" + c + ""'"";
        if (v is global::System.Array a) { var parts = new global::System.Collections.Generic.List<string>(); foreach (var x in a) parts.Add(Lit(x)); return ""{"" + string.Join("", "", parts) + ""}""; }
        if (Kind(v) == ""obj"" || IsStruct(v)) return Cell(v);
        return Str(v);
    }

    /// <summary>Inside a structure: as printed; a writer's object by its own ToString, else ""(field, field)"".</summary>
    /// <summary>V10: the objects whose short text is being written now. One met again on its own path (a.Other = b, b.Other = a; a
    /// list holding itself) is written ""…"": the text of an object graph with a cycle ends, as the program does.</summary>
    static readonly global::System.Collections.Generic.HashSet<object> describing = new global::System.Collections.Generic.HashSet<object>(global::System.Collections.Generic.ReferenceEqualityComparer.Instance);
    static string Cell(object? v)
    {
        if (v == null) return ""null"";
        if (v is bool b) return b ? ""true"" : ""false"";
        if (v is string || v.GetType().IsValueType) return CellOf(v);
        if (!describing.Add(v)) return ""…"";
        try { return CellOf(v); }
        finally { describing.Remove(v); }
    }
    static string CellOf(object v)
    {
        if (rich && CollectionKind(v, v.GetType()) is var ck && ck != """")   // V5: C#'s own collections and arrays, in short
        {
            if (ck == ""map"")
            {
                var parts = new global::System.Collections.Generic.List<string>();
                foreach (global::System.Collections.DictionaryEntry de in (global::System.Collections.IDictionary)v) { if (parts.Count == 6) { parts.Add(""…""); break; } parts.Add(Cell(de.Key) + "": "" + Cell(de.Value)); }
                return ""{"" + string.Join("", "", parts) + ""}"";
            }
            var items = ItemsOf(v, ck);
            var few = new global::System.Collections.Generic.List<string>();
            foreach (var x in items) { if (few.Count == 6) { few.Add(""…""); break; } few.Add(Cell(x)); }
            return ck == ""stack"" || ck == ""queue"" ? ""["" + string.Join("","", few) + ""]"" : ""{"" + string.Join("", "", few) + ""}"";
        }
        if (Kind(v) == ""obj"" || IsStruct(v))   // V11: a struct's short text is its fields too
        {
            var t = v.GetType();
            var ts = t.GetMethod(""ToString"", global::System.Type.EmptyTypes);
            if (ts != null && ts.DeclaringType != typeof(object) && ts.DeclaringType != typeof(global::System.ValueType)) return Str(v);   // the writer's own ToString
            var parts = new global::System.Collections.Generic.List<string>();
            foreach (var f in Fields(t)) parts.Add(Cell(f.GetValue(v)));
            return ""("" + string.Join("", "", parts) + "")"";
        }
        return Str(v);
    }

    /// <summary>As Console prints it (the writer's own ToString runs muted: it records nothing).</summary>
    static string Str(object? v)
    {
        if (v == null) return """";
        muted++;
        try { return (v is global::System.IFormattable f ? f.ToString(null, global::System.Globalization.CultureInfo.InvariantCulture) : v.ToString()) ?? """"; }
        catch { return v.GetType().Name; }
        finally { muted--; }
    }

    static string Json(string s)
    {
        var sb = new global::System.Text.StringBuilder(""\"""");
        foreach (var ch in s)
        {
            switch (ch)
            {
                case '""': sb.Append(""\\\""""); break;
                case '\\': sb.Append(""\\\\""); break;
                case '\n': sb.Append(""\\n""); break;
                case '\r': sb.Append(""\\r""); break;
                case '\t': sb.Append(""\\t""); break;
                default:
                    if (ch < ' ') sb.Append(""\\u"").Append(((int)ch).ToString(""x4"")); else sb.Append(ch);
                    break;
            }
        }
        return sb.Append('""').ToString();
    }
}
";
}
