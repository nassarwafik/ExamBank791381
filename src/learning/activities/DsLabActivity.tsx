import { useId, useMemo, useState, type FormEvent } from "react";
import type { LearningActivityProps } from "./engine";
import {
  bstDelete, bstInsert, bstSearch, LAB_MAX_ITEMS, layoutBst, readDsLab, readLabValue, traverse, treeHeight, treeLeaves, treeSize, TREE_MAX_DEPTH,
  TREE_MAX_NODES, type Bst, type DsLabConfig, type DsValueType, type Traversal,
} from "./ds";
import { ChainDrawing, Marked, QueueDrawing, StackDrawing, TreeDrawing } from "./DsDraw";

/**
 * DS-A1 (docs/enterprise-data-structures-course.md) — `simulation / ds-lab / v1`: «مختبر مبنى المعطيات».
 *
 * The learner works on one structure with the operations of its class and sees it change: a stack (Push / Pop / Top / IsEmpty),
 * a queue (Insert / Remove / Head / IsEmpty), a chain of cells (add at the start, insert after `p`, delete, move `p`, SetValue),
 * a binary search tree (insert / search / delete, the four traversals) or a plain binary tree (add a child, delete a leaf, the
 * traversals). Every operation appends the C# statement it stands for to «الأوامر التي نفّذتها», and a sentence says what
 * happened — an operation the class forbids (Pop on an empty stack) is refused with the reason, never performed.
 * The structure is data; nothing from content is executed. No timers, no network, no persistence; the shell's reset restores the
 * block's first state.
 */
type Cell = { key: number; v: string };
type State = {
  epoch: number;
  items: string[];                 // stack: head first · queue: head first
  cells: Cell[]; p: number | null; // chain, and the index `p` points at
  tree: Bst | null; sel: number | null; marks: number[]; order: number[] | null;
  nextKey: number; log: string[]; msg: string; bad: boolean; text: string;
};
const literal = (v: string, t: DsValueType) => (t === "int" ? v : t === "char" ? "'" + v + "'" : "\"" + v + "\"");
const TYPE_HINT: Record<DsValueType, string> = { int: "عدد صحيح، مثل 7", char: "رمز واحد، مثل a", string: "كلمة قصيرة" };
const TRAVERSALS: [Traversal, string, string][] = [["pre", "بَدْئي", "PreOrder"], ["in", "داخلي", "InOrder"], ["post", "نهائي", "PostOrder"], ["level", "بحسب المستوى", "LevelsOrder"]];

function initial(cfg: DsLabConfig, epoch: number): State {
  const base = { epoch, items: [] as string[], cells: [] as Cell[], p: null, tree: null as Bst | null, sel: null, marks: [], order: null, nextKey: 100, log: [], msg: "", bad: false, text: "" };
  if (cfg.structure === "tree" || cfg.structure === "bst") return { ...base, tree: cfg.tree };
  const { values } = cfg;
  if (cfg.structure === "chain") return { ...base, cells: values.map((v, i) => ({ key: i + 1, v })) };
  return { ...base, items: cfg.structure === "stack" ? [...values].reverse() : [...values] };   // authored bottom → top / head → tail
}

export default function DsLabActivity({ block, commands, emit }: LearningActivityProps) {
  const cfg = useMemo(() => readDsLab(block.config), [block.config]);
  const [held, setHeld] = useState<State | null>(null);
  const inputId = useId();
  if (!cfg) return <p className="learning-trace-empty" role="note">هذا النشاط التفاعلي غير متوفر حاليًا.</p>;

  const st = held && held.epoch === commands.reset ? held : initial(cfg, commands.reset);
  const T = cfg.valueType, N = cfg.name;
  /** Applies an operation: the new state, the statement it stands for and the sentence. `bad` = refused, nothing changed. */
  const apply = (patch: Partial<State>, code: string | null, msg: string, bad = false) => {
    setHeld({ ...st, marks: [], order: null, ...patch, log: code ? [...st.log, code] : st.log, msg, bad, text: bad ? st.text : "" });
    emit({ type: "interaction", activityId: block.id, name: "ds-lab", detail: { ok: !bad } });
  };
  const refuse = (msg: string) => apply({}, null, msg, true);
  /** The typed value, or a refusal saying what a value looks like. */
  const typed = (): string | null => {
    const v = readLabValue(st.text, T);
    if (v === null) refuse("اكتب قيمة أولًا: " + TYPE_HINT[T] + ".");
    return v;
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); };

  let drawing, ops, info: string | null = null;
  if (cfg.structure === "stack") {
    const empty = st.items.length === 0;
    drawing = <StackDrawing items={st.items} labels={[{ name: N }]} />;
    info = "`" + N + ".ToString()` ← `[" + st.items.join(",") + "]`";
    ops = (
      <>
        <button type="button" className="learning-trace-btn is-next" onClick={() => { const v = typed(); if (v === null) return; if (st.items.length >= LAB_MAX_ITEMS) return refuse("المختبر يتّسع لـ " + LAB_MAX_ITEMS + " قيم. أخرج قيمة ثم أدخل."); apply({ items: [v, ...st.items] }, N + ".Push(" + literal(v, T) + ");", "دخلت `" + v + "` إلى رأس الراصّة: هي الآن أول ما سيخرج."); }}>Push — أدخِل</button>
        <button type="button" className="learning-trace-btn" onClick={() => (empty ? refuse("الراصّة فارغة: لا يجوز استدعاء `Pop` (خطأ في التشغيل). افحص `IsEmpty` أولًا.") : apply({ items: st.items.slice(1) }, N + ".Pop();   // " + st.items[0], "خرجت `" + st.items[0] + "` من رأس الراصّة: آخر من دخل هو أول من يخرج."))}>Pop — أخرِج</button>
        <button type="button" className="learning-trace-btn" onClick={() => (empty ? refuse("الراصّة فارغة: لا يجوز استدعاء `Top`.") : apply({}, N + ".Top();   // " + st.items[0], "رأس الراصّة `" + st.items[0] + "`، وبقيت في مكانها: `Top` لا تُخرج."))}>Top — انظر</button>
        <button type="button" className="learning-trace-btn" onClick={() => apply({}, N + ".IsEmpty();   // " + (empty ? "true" : "false"), "`IsEmpty` تُعيد `" + (empty ? "true" : "false") + "`: الراصّة " + (empty ? "فارغة." : "فيها " + st.items.length + " قيم."))}>IsEmpty</button>
      </>
    );
  } else if (cfg.structure === "queue") {
    const empty = st.items.length === 0;
    drawing = <QueueDrawing items={st.items} labels={[{ name: N }]} />;
    info = "`" + N + ".ToString()` ← `[" + st.items.join(",") + "]`";
    ops = (
      <>
        <button type="button" className="learning-trace-btn is-next" onClick={() => { const v = typed(); if (v === null) return; if (st.items.length >= LAB_MAX_ITEMS) return refuse("المختبر يتّسع لـ " + LAB_MAX_ITEMS + " قيم. أخرج قيمة ثم أدخل."); apply({ items: [...st.items, v] }, N + ".Insert(" + literal(v, T) + ");", "دخلت `" + v + "` إلى نهاية الدور: تنتظر حتى يخرج كل من قبلها."); }}>Insert — أدخِل</button>
        <button type="button" className="learning-trace-btn" onClick={() => (empty ? refuse("الدور فارغ: لا يجوز استدعاء `Remove` (خطأ في التشغيل). افحص `IsEmpty` أولًا.") : apply({ items: st.items.slice(1) }, N + ".Remove();   // " + st.items[0], "خرجت `" + st.items[0] + "` من رأس الدور: أول من دخل هو أول من يخرج."))}>Remove — أخرِج</button>
        <button type="button" className="learning-trace-btn" onClick={() => (empty ? refuse("الدور فارغ: لا يجوز استدعاء `Head`.") : apply({}, N + ".Head();   // " + st.items[0], "رأس الدور `" + st.items[0] + "`، وبقيت في مكانها: `Head` لا تُخرج."))}>Head — انظر</button>
        <button type="button" className="learning-trace-btn" onClick={() => apply({}, N + ".IsEmpty();   // " + (empty ? "true" : "false"), "`IsEmpty` تُعيد `" + (empty ? "true" : "false") + "`: الدور " + (empty ? "فارغ." : "فيه " + st.items.length + " قيم."))}>IsEmpty</button>
      </>
    );
  } else if (cfg.structure === "chain") {
    const { cells, p } = st;
    const at = p === null ? null : cells[p];
    const full = cells.length >= LAB_MAX_ITEMS;
    const fresh = (v: string): Cell => ({ key: st.nextKey, v });
    const node = (v: string, next: string) => "new Node<" + T + ">(" + literal(v, T) + ", " + next + ")";
    const pick = (i: number) => apply({ p: i }, ["p = " + N + ";", ...Array<string>(i).fill("p = p.GetNext();")].join(" "), "`p` يشير الآن إلى الخلية التي قيمتها `" + cells[i].v + "`.");
    drawing = <ChainDrawing cells={cells.map((c, i) => ({ key: c.key, v: c.v, labels: [...(i === 0 ? [{ name: N }] : []), ...(p === i ? [{ name: "p" }] : [])] }))} onPick={pick} picked={p} />;
    info = cells.length === 0 ? "`" + N + " == null`: السلسلة فارغة." : at ? "`p.GetValue()` ← `" + at.v + "` · `p.HasNext()` ← `" + (p! < cells.length - 1 ? "true" : "false") + "`" : "`p == null`: اختر خلية (اضغط عليها) أو اضغط «p = " + N + "».";
    ops = (
      <>
        <button type="button" className="learning-trace-btn is-next" onClick={() => { const v = typed(); if (v === null) return; if (full) return refuse("المختبر يتّسع لـ " + LAB_MAX_ITEMS + " خلايا."); apply({ cells: [fresh(v), ...cells], p: p === null ? null : p + 1, nextKey: st.nextKey + 1 }, N + " = " + node(v, N) + ";", "خلية جديدة قيمتها `" + v + "` صارت رأس السلسلة، وهي تشير إلى الرأس السابق."); }}>أضف في البداية</button>
        <button type="button" className="learning-trace-btn" onClick={() => { if (!at) return refuse("`p` لا يشير إلى خلية (`null`): اختر خلية أولًا."); const v = typed(); if (v === null) return; if (full) return refuse("المختبر يتّسع لـ " + LAB_MAX_ITEMS + " خلايا."); const next = [...cells]; next.splice(p! + 1, 0, fresh(v)); apply({ cells: next, nextKey: st.nextKey + 1 }, "p.SetNext(" + node(v, "p.GetNext()") + ");", "الخلية الجديدة `" + v + "` تشير إلى ما كان بعد `p`، ثم `p` يشير إليها: لم تتحرّك أي خلية."); }}>أدخِل بعد p</button>
        <button type="button" className="learning-trace-btn" onClick={() => { if (!cells.length) return refuse("السلسلة فارغة: لا خلية لحذفها."); apply({ cells: cells.slice(1), p: p === null || p === 0 ? null : p - 1 }, N + " = " + N + ".GetNext();", "الرأس انتقل إلى الخلية الثانية. الخلية `" + cells[0].v + "` لم يعد يشير إليها أحد فتُحذف من الذاكرة." + (p === 0 ? " و`p` صار `null`." : "")); }}>احذف الأولى</button>
        <button type="button" className="learning-trace-btn" onClick={() => { if (!at) return refuse("`p` لا يشير إلى خلية (`null`): اختر خلية أولًا."); if (p! >= cells.length - 1) return refuse("لا خلية بعد `p`: `p.HasNext()` تُعيد `false`."); const gone = cells[p! + 1]; apply({ cells: cells.filter((_, i) => i !== p! + 1) }, "p.SetNext(p.GetNext().GetNext());", "`p` يتخطّى الخلية `" + gone.v + "` ويشير إلى التي بعدها: الخلية `" + gone.v + "` خرجت من السلسلة."); }}>احذف التي بعد p</button>
        <button type="button" className="learning-trace-btn" onClick={() => (cells.length ? apply({ p: 0 }, "p = " + N + ";", "`p` يشير إلى أول خلية (قيمتها `" + cells[0].v + "`).") : apply({ p: null }, "p = " + N + ";", "السلسلة فارغة: `p` يساوي `null`."))}><span dir="ltr">{"p = " + N}</span></button>
        <button type="button" className="learning-trace-btn" onClick={() => { if (!at) return refuse("`p` يساوي `null`: استدعاء `p.GetNext()` خطأ في التشغيل."); const last = p! >= cells.length - 1; apply({ p: last ? null : p! + 1 }, "p = p.GetNext();", last ? "كانت `p` على آخر خلية، فصارت `null`: هكذا ينتهي تمشيط السلسلة." : "`p` انتقل إلى الخلية التالية (قيمتها `" + cells[p! + 1].v + "`)."); }}><span dir="ltr">p = p.GetNext()</span></button>
        <button type="button" className="learning-trace-btn" onClick={() => { if (!at) return refuse("`p` لا يشير إلى خلية (`null`): اختر خلية أولًا."); const v = typed(); if (v === null) return; apply({ cells: cells.map((c, i) => (i === p ? { ...c, v } : c)) }, "p.SetValue(" + literal(v, T) + ");", "قيمة الخلية تغيّرت من `" + at.v + "` إلى `" + v + "`؛ المؤشرات لم تتغيّر."); }}><span dir="ltr">p.SetValue(…)</span></button>
      </>
    );
  } else {
    const { tree } = st;
    const bst = cfg.structure === "bst";
    const laid = layoutBst(tree);
    const sel = st.sel === null ? null : laid.find(n => n.node.key === st.sel)?.node ?? null;
    const depthOf = (key: number) => laid.find(n => n.node.key === key)?.depth ?? 0;
    const full = treeSize(tree) >= TREE_MAX_NODES;
    const steps = (path: Bst[], x: number) => path.map(n => (x === Number(n.v) ? "`" + x + " = " + n.v + "`" : x < Number(n.v) ? "`" + x + " < " + n.v + "` يسارًا" : "`" + x + " > " + n.v + "` يمينًا")).join("، ");
    const walk = (how: Traversal, word: string, fn: string) => { const seq = traverse(tree, how); apply({ order: seq.map(n => n.key) }, fn + "(" + N + ");   // " + seq.map(n => n.v).join(" "), "التمشيط ال" + word + " يزور: `" + (seq.map(n => n.v).join("  ") || "لا شيء") + "`. الأرقام الصغيرة على الرسم ترتيب الزيارة."); };
    const child = (side: "l" | "r") => {
      if (!sel) return refuse("اختر خلية أولًا (اضغط عليها أو اخترها من القائمة).");
      if (sel[side]) return refuse("للخلية `" + sel.v + "` ابن " + (side === "l" ? "أيسر" : "أيمن") + " من قبل.");
      const v = typed(); if (v === null) return;
      if (full) return refuse("المختبر يتّسع لـ " + TREE_MAX_NODES + " خلية.");
      if (depthOf(sel.key) >= TREE_MAX_DEPTH) return refuse("المختبر يرسم حتى المستوى " + TREE_MAX_DEPTH + ".");
      const add = (n: Bst | null): Bst | null => (!n ? null : n.key === sel.key ? { ...n, [side]: { key: st.nextKey, v, l: null, r: null } } : { ...n, l: add(n.l), r: add(n.r) });
      apply({ tree: add(tree), nextKey: st.nextKey + 1, marks: [st.nextKey] }, "node.Set" + (side === "l" ? "Left" : "Right") + "(new BinNode<int>(" + v + "));   // node = " + sel.v, "خلية جديدة `" + v + "` صارت الابن " + (side === "l" ? "الأيسر" : "الأيمن") + " للخلية `" + sel.v + "`، وهي ورقة.");
    };
    drawing = <TreeDrawing cells={laid.map(n => ({ key: n.node.key, v: n.node.v, x: n.x, depth: n.depth, parent: n.parent, hi: st.marks.includes(n.node.key), order: st.order ? st.order.indexOf(n.node.key) + 1 || undefined : undefined }))} onPick={bst ? undefined : key => apply({ sel: key }, null, "اخترت الخلية `" + laid.find(n => n.node.key === key)?.node.v + "`.")} picked={st.sel} levels />;
    info = "عدد الخلايا: `" + treeSize(tree) + "` · الارتفاع: `" + treeHeight(tree) + "` · الأوراق: `" + (treeLeaves(tree).map(n => n.v).join(" ") || "—") + "`";
    ops = (
      <>
        {bst ? (
          <>
            <button type="button" className="learning-trace-btn is-next" onClick={() => { const v = typed(); if (v === null) return; const x = Number(v); if (!tree) return apply({ tree: { key: st.nextKey, v, l: null, r: null }, nextKey: st.nextKey + 1, marks: [st.nextKey] }, N + " = new BinNode<int>(" + v + ");", "الشجرة كانت فارغة: `" + v + "` صارت الجذر."); const r = bstInsert(tree, x, st.nextKey); if (!r.inserted) return apply({ marks: r.path.map(n => n.key) }, null, "القيمة `" + v + "` موجودة في الشجرة (" + steps(r.path, x) + ")؛ لا نُدخلها مرتين.", true); if (full) return refuse("المختبر يتّسع لـ " + TREE_MAX_NODES + " خلية."); if (r.path.length > TREE_MAX_DEPTH) return refuse("المختبر يرسم حتى المستوى " + TREE_MAX_DEPTH + "."); const last = r.path.at(-1)!; apply({ tree: r.tree, nextKey: st.nextKey + 1, marks: [...r.path.map(n => n.key), st.nextKey] }, "InsertIntoBST(" + N + ", " + v + ");", "نبدأ من الجذر: " + steps(r.path, x) + ". وصلنا إلى مكان فارغ: `" + v + "` صارت الابن " + (x < Number(last.v) ? "الأيسر" : "الأيمن") + " للخلية `" + last.v + "`."); }}>أدخِل قيمة</button>
            <button type="button" className="learning-trace-btn" onClick={() => { const v = typed(); if (v === null) return; const r = bstSearch(tree, Number(v)); apply({ marks: r.path.map(n => n.key) }, "ExistsInBST(" + N + ", " + v + ");   // " + (r.found ? "true" : "false"), (r.path.length ? "نبدأ من الجذر: " + steps(r.path, Number(v)) + ". " : "الشجرة فارغة. ") + (r.found ? "وجدنا `" + v + "` بعد " + r.path.length + " مقارنات." : "وصلنا إلى `null`: `" + v + "` غير موجودة.")); }}>ابحث عن قيمة</button>
            <button type="button" className="learning-trace-btn" onClick={() => { const v = typed(); if (v === null) return; const r = bstDelete(tree, Number(v)); if (!r.found) return refuse("القيمة `" + v + "` غير موجودة في الشجرة."); apply({ tree: r.tree }, N + " = DeleteFromBST(" + N + ", " + v + ");", r.kind === "leaf" ? "`" + v + "` ورقة: نحذفها مباشرة." : r.kind === "one" ? "للخلية `" + v + "` ابن واحد: يأخذ الابن مكانها." : "للخلية `" + v + "` ابنان: نضع مكانها أصغر قيمة في شجرتها الفرعية اليمنى (`" + r.successor + "`) ثم نحذف تلك الخلية."); }}>احذف قيمة</button>
          </>
        ) : (
          <>
            {!tree && <button type="button" className="learning-trace-btn is-next" onClick={() => { const v = typed(); if (v === null) return; apply({ tree: { key: st.nextKey, v, l: null, r: null }, nextKey: st.nextKey + 1, sel: st.nextKey }, N + " = new BinNode<int>(" + v + ");", "`" + v + "` صارت جذر الشجرة."); }}>أنشئ الجذر</button>}
            <button type="button" className="learning-trace-btn is-next" onClick={() => child("l")}>أضف ابنًا أيسر</button>
            <button type="button" className="learning-trace-btn is-next" onClick={() => child("r")}>أضف ابنًا أيمن</button>
            <button type="button" className="learning-trace-btn" onClick={() => { if (!sel) return refuse("اختر خلية أولًا."); if (sel.l || sel.r) return refuse("الخلية `" + sel.v + "` ليست ورقة: لها أبناء."); const cut = (n: Bst | null): Bst | null => (!n || n.key === sel.key ? null : { ...n, l: cut(n.l), r: cut(n.r) }); apply({ tree: cut(tree), sel: null }, null, "حُذفت الورقة `" + sel.v + "`: أبوها يشير الآن إلى `null` في مكانها."); }}>احذف الورقة المختارة</button>
          </>
        )}
        {TRAVERSALS.map(([how, word, fn]) => <button key={how} type="button" className="learning-trace-btn" onClick={() => walk(how, word, fn)}>{"تمشيط " + word}</button>)}
      </>
    );
    if (!bst && laid.length > 0) {
      ops = (
        <>
          <label className="learning-ds-field">الخلية المختارة
            <select value={st.sel ?? ""} onChange={e => apply({ sel: e.target.value === "" ? null : Number(e.target.value) }, null, e.target.value === "" ? "لا خلية مختارة." : "اخترت الخلية `" + laid.find(n => n.node.key === Number(e.target.value))?.node.v + "`.")}>
              <option value="">— اختر —</option>
              {traverse(tree, "level").map(n => <option key={n.key} value={n.key}>{n.v + " (المستوى " + depthOf(n.key) + ")"}</option>)}
            </select>
          </label>
          {ops}
        </>
      );
    }
  }

  return (
    <div className="learning-trace learning-ds learning-ds-lab">
      <div className="learning-ds-stage">{drawing}</div>
      {info && <p className="learning-ds-info"><Marked text={info} /></p>}
      <form className="learning-ds-form" onSubmit={onSubmit}>
        <label className="learning-ds-field" htmlFor={inputId}>القيمة
          <input id={inputId} dir="ltr" inputMode={T === "int" ? "numeric" : "text"} autoComplete="off" maxLength={8} placeholder={TYPE_HINT[T]} value={st.text} onChange={e => setHeld({ ...st, text: e.target.value })} />
        </label>
        <div className="learning-trace-controls">{ops}</div>
      </form>
      <p className={"learning-trace-note" + (st.bad ? " learning-ds-error" : "")} role="status" aria-live="polite"><Marked text={st.msg || "اختر عملية وشاهد ما يتغيّر في الرسم."} /></p>
      <section aria-label="الأوامر التي نفّذتها">
        <h4 className="learning-trace-heading">الأوامر التي نفّذتها بلغة C#</h4>
        {st.log.length === 0 ? <p className="learning-trace-none">لم تنفّذ أمرًا بعد.</p> : (
          <ol className="learning-trace-code learning-ds-log" dir="ltr" tabIndex={0} aria-label="الأوامر التي نفّذتها">
            {st.log.slice(-12).map((l, i) => <li key={st.log.length - Math.min(st.log.length, 12) + i} className="learning-trace-line"><code className="learning-trace-linecode">{l}</code></li>)}
          </ol>
        )}
      </section>
    </div>
  );
}
