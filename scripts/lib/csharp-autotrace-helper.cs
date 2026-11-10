// 899371 enrichment P13 — the recorder of the AUTOMATIC question traces (scripts/trace-899371-questions.mjs), appended (never shown) to
// a program instrumented by scripts/lib/csharp-autotrace/AutoTrace.cs. The P6 recorder (csharp-trace-helper.cs, whose runs are bound to
// its exact text) is untouched; this one differs only where noted:
//   • S(line, kind, name, value, …) records the state after a statement with EXACTLY the variables the compiler says are in scope and
//     assigned there (the frame is replaced, not merged: a variable whose scope ended is gone);
//   • C(line, kind, text, value, …) records a condition AT the moment the program evaluates it, and returns that same value; V does the
//     same for the value a switch switches on, R for the value a method returns;
//   • every step carries `kind` (decl, expr, if, elseif, while, for, do, switch, foreach, enter, return) for the sentence written later.
// The program's own output is captured (Console.SetOut) and written first; the recording follows a marker line, even when the program
// throws (Main runs inside try / finally). Values are written as C# prints them.
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Text;
public static class Tr
{
    const int MaxSteps = 400;
    static System.IO.TextWriter real;
    static readonly System.IO.StringWriter captured = new System.IO.StringWriter();
    static readonly List<string> steps = new List<string>();
    static readonly List<KeyValuePair<string, List<KeyValuePair<string, object>>>> frames = new List<KeyValuePair<string, List<KeyValuePair<string, object>>>>();
    static readonly Dictionary<object, int> ids = new Dictionary<object, int>(ReferenceEqualityComparer.Instance);
    public static void Begin() { real = System.Console.Out; System.Console.SetOut(captured); Enter("Main"); }
    public static void Enter(string name) { frames.Add(new KeyValuePair<string, List<KeyValuePair<string, object>>>(name, new List<KeyValuePair<string, object>>())); }
    public static void Leave() { frames.RemoveAt(frames.Count - 1); }
    public static void S(int line, string kind, params object[] kv) => Record(line, kind, kv, null, null);
    public static bool C(int line, string kind, string text, bool value, params object[] kv) { Record(line, kind, kv, text, value); return value; }
    public static T V<T>(int line, string kind, string text, T value, params object[] kv) { Record(line, kind, kv, text, value); return value; }
    public static T R<T>(int line, string text, T value, params object[] kv) { Record(line, "return", kv, text, value); return value; }
    static void Record(int line, string kind, object[] kv, string? evalText, object? evalValue)
    {
        if (steps.Count > MaxSteps) return;   // a run longer than any tracer shows: recorded up to one step over the limit, then not at all
        var vars = frames[frames.Count - 1].Value;
        vars.Clear();
        var eval = new List<KeyValuePair<string, object>>();
        for (int i = 0; i + 1 < kv.Length; i += 2) vars.Add(new KeyValuePair<string, object>((string)kv[i], kv[i + 1]));
        if (evalText != null) eval.Add(new KeyValuePair<string, object>(evalText, evalValue!));
        var heap = new List<object>();
        var sb = new StringBuilder();
        sb.Append("{\"line\":").Append(line).Append(",\"kind\":").Append(Q(kind)).Append(",\"frames\":[");
        for (int f = 0; f < frames.Count; f++)
        {
            if (f > 0) sb.Append(',');
            sb.Append("{\"name\":").Append(Q(frames[f].Key)).Append(",\"vars\":[");
            for (int v = 0; v < frames[f].Value.Count; v++)
            {
                if (v > 0) sb.Append(',');
                sb.Append("[").Append(Q(frames[f].Value[v].Key)).Append(',').Append(Val(frames[f].Value[v].Value, heap)).Append(']');
            }
            sb.Append("]}");
        }
        sb.Append("],\"eval\":[");
        for (int e = 0; e < eval.Count; e++) { if (e > 0) sb.Append(','); sb.Append("[").Append(Q(eval[e].Key)).Append(',').Append(Val(eval[e].Value, heap)).Append(']'); }
        sb.Append("],\"heap\":[");
        for (int h = 0; h < heap.Count; h++)
        {
            object o = heap[h];
            if (h > 0) sb.Append(',');
            sb.Append("{\"id\":").Append(ids[o]).Append(",\"type\":").Append(Q(o.GetType().Name)).Append(",\"fields\":[");
            var fs = o.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            for (int i = 0; i < fs.Length; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append("[").Append(Q(fs[i].Name)).Append(',').Append(Val(fs[i].GetValue(o), heap)).Append(']');
            }
            sb.Append("]}");
        }
        sb.Append("],\"out\":").Append(Q(captured.ToString())).Append('}');
        steps.Add(sb.ToString());
    }
    public static void End()
    {
        real.Write(captured.ToString());
        real.Write("\n\u0001TRACE\n[" + string.Join(",", steps) + "]\n");
    }
    static string Scalar(object v)
    {
        if (v is double d) return d.ToString(CultureInfo.CurrentCulture);
        if (v is float fl) return fl.ToString(CultureInfo.CurrentCulture);
        if (v is bool b) return b ? "True" : "False";
        return System.Convert.ToString(v, CultureInfo.CurrentCulture);
    }
    static string Val(object v, List<object> heap)
    {
        if (v == null) return "{\"t\":\"null\"}";
        if (v is string s) return "{\"t\":\"str\",\"s\":" + Q(s) + "}";
        if (v is char c) return "{\"t\":\"char\",\"s\":" + Q(c.ToString()) + "}";
        if (v is int || v is long || v is double || v is bool || v is float || v is decimal || v is short || v is byte || v is uint || v is ulong) return "{\"t\":\"v\",\"s\":" + Q(Scalar(v)) + "}";
        if (v is System.Array a && a.Rank == 2)
        {
            var sb = new StringBuilder("{\"t\":\"mat\",\"rows\":[");
            for (int i = 0; i < a.GetLength(0); i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append('[');
                for (int j = 0; j < a.GetLength(1); j++) { if (j > 0) sb.Append(','); sb.Append(Q(Scalar(a.GetValue(i, j)))); }
                sb.Append(']');
            }
            return sb.Append("]}").ToString();
        }
        if (v is System.Array arr)
        {
            var sb = new StringBuilder("{\"t\":\"arr\",\"items\":[");
            for (int i = 0; i < arr.Length; i++) { if (i > 0) sb.Append(','); sb.Append(Val(arr.GetValue(i), heap)); }
            return sb.Append("]}").ToString();
        }
        if (!ids.ContainsKey(v)) ids[v] = ids.Count + 1;
        if (!heap.Contains(v)) heap.Add(v);
        return "{\"t\":\"ref\",\"id\":" + ids[v] + "}";
    }
    static string Q(string s)
    {
        var sb = new StringBuilder("\"");
        foreach (char ch in s)
        {
            if (ch == '"' || ch == '\\') sb.Append('\\').Append(ch);
            else if (ch < 32) sb.Append("\\u").Append(((int)ch).ToString("x4"));
            else sb.Append(ch);
        }
        return sb.Append('"').ToString();
    }
}
