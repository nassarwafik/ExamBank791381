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
        public string Name = """"; public bool Quiet; public string[] Names = new string[0]; public global::System.Func<object?[]> Values = () => new object?[0];
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
    static string? pendingFrames, pendingObjs;

    static bool inside;            // «اكشف الداخل»: the book's Stack<T> / Queue<T> recorded as the objects they are (Head / First, Last → Node<T>)
    static string? markNote;       // Viz.Show(title) / Viz.Pause(reason): the next recorded step carries the title …
    static bool markPause;         // … and, for Pause, a stop for the player
    public static void Configure(global::System.IO.StringWriter @out, int shownLines, int max, string[] quietNames, string[] library, bool insideMode)
    {
        inside = insideMode;
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
        var f = new Frame { Name = name, Quiet = quiet.Contains(name) };
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
        Record(l, names, values, ""العملية تُعيد `"" + Lit(value) + ""`."");
        return value;
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
        if (muted > 0) return;
        var (fr, ob) = Snapshot();
        if (l > shown) { pendingFrames = fr; pendingObjs = ob; return; }
        pendingFrames = pendingObjs = null;
        if (count >= maxSteps) throw new __LabTraceLimit();
        bool pause = markPause;
        if (markNote != null) note = markNote;
        markNote = null; markPause = false;
        Append(l, note, fr, ob, false, pause);
        lastFrames = fr; lastObjs = ob;
    }

    static void Append(int l, string note, string fr, string ob, bool error, bool pause = false)
    {
        if (count > 0) steps.Append(',');
        steps.Append(""{\""line\"":"").Append(l).Append("",\""note\"":"").Append(Json(note)).Append("",\""frames\"":"").Append(fr)
             .Append("",\""objs\"":"").Append(ob).Append("",\""out\"":"").Append(Json(output.ToString()));
        if (error) steps.Append("",\""error\"":true"");
        if (pause) steps.Append("",\""pause\"":true"");
        steps.Append('}');
        count++;
    }

    public static void Finish() { if (pendingFrames != null) Append(0, ""انتهى التنفيذ."", pendingFrames, pendingObjs!, false); }
    public static void Fail() { if (line <= shown) Append(line, ""خطأ في التشغيل: البرنامج يتوقّف هنا."", lastFrames, lastObjs, true); }
    public static string StepsJson() => ""["" + steps + ""]"";
    /// <summary>Viz.Show / Viz.Pause (the visual run's own class, TraceRuntime.VizSource): marks the step of the statement that called it.</summary>
    public static void Show(string title) { markNote = string.IsNullOrWhiteSpace(title) ? null : title; }
    public static void Pause(string? reason) { markPause = true; if (!string.IsNullOrWhiteSpace(reason)) markNote = reason; }

    // ── the snapshot ──
    static (string frames, string objs) Snapshot()
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
                sb.Append(""{\""name\"":"").Append(Json(f.Name)).Append("",\""vars\"":["");
                bool firstVar = true;
                for (int j = 0; j < f.Names.Length && j < vals.Length; j++)
                {
                    var name = f.Names[j];
                    if (name.Length > 1 && name[0] == '?') { name = name.Substring(1); if (!f.Written.Contains(name)) continue; }   // not written yet
                    if (!firstVar) sb.Append(',');
                    firstVar = false;
                    sb.Append('[').Append(Json(name)).Append(',').Append(Val(vals[j])).Append(']');
                    Visit(vals[j], objs);
                    if (vals[j] is global::System.Array arr && arr.Rank == 1) foreach (var x in arr) Visit(x, objs);
                }
                sb.Append(""]}"");
            }
            sb.Append(']');
            return (sb.ToString(), ""["" + string.Join("","", objs.Values) + ""]"");
        }
        finally { muted--; }
    }

    static string Kind(object o)
    {
        var t = o.GetType();
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
        var kind = Kind(v);
        if (kind == """") return;
        int id = IdOf(v);
        if (objs.ContainsKey(id)) return;
        var sb = new global::System.Text.StringBuilder(""{\""id\"":"").Append(id).Append("",\""k\"":\"""").Append(kind).Append('""');
        objs[id] = """";
        switch (kind)
        {
            case ""stack"": sb.Append("",\""items\"":"").Append(Chain(Field(v, ""Head""))); break;
            case ""queue"": sb.Append("",\""items\"":"").Append(Chain(Field(v, ""First""))); break;
            case ""node"":
            {
                var next = Field(v, ""Next"");
                sb.Append("",\""v\"":"").Append(Json(Cell(Field(v, ""Value"")))).Append("",\""next\"":"").Append(next == null ? ""null"" : IdOf(next).ToString());
                objs[id] = sb.Append('}').ToString();
                Visit(next, objs);
                return;
            }
            case ""bin"":
            {
                var l = Field(v, ""Left""); var r = Field(v, ""Right"");
                sb.Append("",\""v\"":"").Append(Json(Cell(Field(v, ""Value"")))).Append("",\""l\"":"").Append(l == null ? ""null"" : IdOf(l).ToString())
                  .Append("",\""r\"":"").Append(r == null ? ""null"" : IdOf(r).ToString());
                objs[id] = sb.Append('}').ToString();
                Visit(l, objs); Visit(r, objs);
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

    /// <summary>The items of a chain of the book's nodes (a stack from its top, a queue from its head), as cells.</summary>
    static string Chain(object? node)
    {
        var sb = new global::System.Text.StringBuilder(""["");
        int n = 0;
        var seen = new global::System.Collections.Generic.HashSet<object>(global::System.Collections.Generic.ReferenceEqualityComparer.Instance);
        for (var p = node; p != null && seen.Add(p) && n < 200; p = Field(p, ""Next""), n++)
        {
            if (n > 0) sb.Append(',');
            sb.Append(Json(Cell(Field(p, ""Value""))));
        }
        return sb.Append(']').ToString();
    }

    // ── values, as the course writes them ──
    static string Val(object? v)
    {
        if (v == null) return ""{\""t\"":\""null\""}"";
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
        if (Kind(v) == ""obj"") return Cell(v);
        return Str(v);
    }

    /// <summary>Inside a structure: as printed; a writer's object by its own ToString, else ""(field, field)"".</summary>
    static string Cell(object? v)
    {
        if (v == null) return ""null"";
        if (v is bool b) return b ? ""true"" : ""false"";
        if (Kind(v) == ""obj"")
        {
            var t = v.GetType();
            var ts = t.GetMethod(""ToString"", global::System.Type.EmptyTypes);
            if (ts != null && ts.DeclaringType != typeof(object)) return Str(v);
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
