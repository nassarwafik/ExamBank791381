// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §9) — the Arabic sentence of each step of an AUTOMATIC question
// trace, written from what the recorded run itself shows (never from reading the C#): the condition and the value it had, the variables
// that changed and their new values, what was printed, the call and its arguments, the value returned. Pure; shared by
// scripts/trace-899371-questions.mjs and its tests.
//
// Code and values sit inside Unicode isolates so they keep their own direction inside an Arabic sentence: code and numbers in a
// left-to-right isolate (U+2066 … U+2069), printed text in a first-strong isolate (U+2068 … U+2069), so «عمرك هو: 17» stays itself.
export const LRI = "⁦", FSI = "⁨", PDI = "⁩";
export const code = s => LRI + s + PDI;
const printedText = s => "«" + FSI + s + PDI + "»";

/** A recorded value as the tracer would print it in one line. */
export function show(v) {
  switch (v?.t) {
    case "v": return v.s;
    case "str": return "\"" + v.s + "\"";
    case "char": return "'" + v.s + "'";
    case "null": return "null";
    case "ref": return "#" + v.id;
    case "arr": return "{" + v.items.map(show).join(", ") + "}";
    case "mat": return "{" + v.rows.map(r => "{" + r.join(", ") + "}").join(", ") + "}";
    default: return "?";
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isTrue = v => v?.t === "v" && v.s === "True";

/** What a step printed: the output it added (the output only grows). */
export function printedBy(step, prev) {
  const before = prev ? prev.out : "";
  return step.out.startsWith(before) ? step.out.slice(before.length) : "";
}

/** The sentence of `step` (kind, line, frames, eval, heap, out — as recorded), `prev` being the step shown before it (or null). */
export function noteFor(step, prev) {
  const top = step.frames[step.frames.length - 1];
  const sameFrame = prev && prev.frames.length === step.frames.length && prev.frames[prev.frames.length - 1].name === top.name;
  const before = sameFrame ? prev.frames[prev.frames.length - 1].vars : [];
  const fresh = [], changed = [];
  for (const [name, v] of top.vars) {
    const was = before.find(p => p[0] === name);
    if (!was) fresh.push([name, v]); else if (!same(was[1], v)) changed.push([name, v]);
  }
  const ev = step.eval[0];
  const cond = ev ? code(ev[0]) : "", val = ev ? code(show(ev[1])) : "";
  const printed = printedBy(step, prev);
  const fields = [];
  for (const o of step.heap) {
    const was = prev?.heap.find(h => h.id === o.id);
    if (was) for (const [f, v] of o.fields) { const w = was.fields.find(x => x[0] === f); if (w && !same(w[1], v)) fields.push(code(f) + " في الكائن " + code("#" + o.id) + " صار " + code(show(v))); }
  }
  const parts = [];
  switch (step.kind) {
    case "if": parts.push("الشرط " + cond + " قيمته " + val + (isTrue(ev?.[1]) ? "، فيُنفَّذ ما بداخل " + code("if") + "." : "، فلا يُنفَّذ ما بداخل " + code("if") + ".")); break;
    case "elseif": parts.push("الشرط " + cond + " قيمته " + val + (isTrue(ev?.[1]) ? "، فيُنفَّذ ما بداخل " + code("else if") + " هذا." : "، فننتقل إلى ما بعده.")); break;
    case "while":
    case "for": parts.push("شرط الحلقة " + cond + " قيمته " + val + (isTrue(ev?.[1]) ? ": دورة جديدة." : ": تنتهي الحلقة.")); break;
    case "do": parts.push("شرط " + code("do … while") + " " + cond + " قيمته " + val + (isTrue(ev?.[1]) ? ": نعود إلى بداية الحلقة." : ": تنتهي الحلقة.")); break;
    case "switch": parts.push(code("switch") + " يختار الحالة " + val + "."); break;
    case "enter": parts.push("استدعاء " + code(top.name) + (top.vars.length ? "، والمعاملات: " + top.vars.map(([n, v]) => code(n + " = " + show(v))).join("، ") : "") + "."); break;
    case "return": parts.push(ev ? code(top.name) + " تعيد القيمة " + val + "." : code(top.name) + " تنتهي وتعود إلى من استدعاها."); break;
    case "foreach": parts.push("دورة جديدة" + (changed.length + fresh.length ? ": " + [...fresh, ...changed].map(([n, v]) => code(n + " = " + show(v))).join("، ") : "") + "."); break;
    default: {
      for (const [n, v] of fresh) parts.push("متغير جديد " + code(n + " = " + show(v)) + ".");
      for (const [n, v] of changed) parts.push(code(n) + " صار " + code(show(v)) + ".");
    }
  }
  if (step.kind !== "foreach" && step.kind !== "enter" && step.kind !== "decl" && step.kind !== "expr") {
    // a condition / call / return step may also have changed a variable (i++ in a for header, a method that assigned a field)
    for (const [n, v] of changed) parts.push(code(n) + " صار " + code(show(v)) + ".");
  }
  parts.push(...fields.map(f => f + "."));
  if (printed) {
    const text = printed.replace(/\n+$/, "").replace(/\n/g, " ⏎ ");   // a line break inside what was printed: ⏎
    const lines = (printed.match(/\n/g) || []).length;
    parts.push(text ? "يطبع " + printedText(text) + (printed.endsWith("\n") ? " ثم ينتقل إلى سطر جديد." : ".") : lines > 1 ? "يطبع " + lines + " أسطر فارغة." : "ينتقل إلى سطر جديد.");
  }
  return parts.length ? parts.join(" ") : "يُنفَّذ هذا السطر.";
}
